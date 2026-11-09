// CLI: flag parsing, validation, subcommand dispatch, exit code mapping.
// Exit codes: 0 = no violations, 1 = violations found, 2 = usage/internal error.
import path from 'node:path';
import { createRequire } from 'node:module';
import { stat, realpath } from 'node:fs/promises';
import { collectPaths } from './scan.js';
import { RULE_IDS, RULES, runRules } from './rules/index.js';
import { DEFAULT_MAX_LENGTH } from './rules/path-length.js';
import { renderHuman, renderJson } from './report.js';
import {
  DEFAULT_BASELINE_FILE,
  buildBaselineSnapshot,
  diffAgainstBaseline,
  loadBaseline,
  writeBaseline,
} from './baseline.js';

// createRequire reads JSON across all supported Node lines without relying on
// import attributes (whose syntax differed between Node 18/20/22).
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
export const VERSION = pkg.version;

export const USAGE = `portafs v${VERSION} — audit filenames that break on other platforms

Usage:
  portafs check [dir] [options]
  portafs baseline [dir] [options]
  portafs --help | --version

Commands:
  check      audit a directory tree for portability problems (default target: .)
  baseline   write the violations found right now to a snapshot file, so a later
             "check --baseline" only reports new ones

Options:
  --json              print a machine-readable JSON report instead of text
  --rule <id>         run only the given rule; repeatable
  --ignore <id>       skip the given rule; repeatable
  --staged            only audit files staged for the next commit (git repositories;
                      falls back to a full directory scan outside a repository)
  --baseline <file>   check mode: report only violations missing from the snapshot
  --output <file>     baseline mode: snapshot destination (default: .portafs-baseline.json)
  --max-length <n>    path length limit for the path-length rule (default: 260, counts the
                      relative path only; lower it for deep checkout locations)
  --no-color          disable colored output (a non-empty NO_COLOR env var does the same)
  -h, --help          show this help
  --version           print the version

Rules:
  case-collision     names differing only by letter case collide on Windows and macOS
  windows-reserved   CON, PRN, AUX, NUL, COM1-9, LPT1-9 (also with an extension, e.g. aux.c)
  trailing           names ending with a space or a dot are rewritten or rejected by Windows
  path-length        paths past the limit fail on Windows once the checkout prefix is added
  unicode            names differing only by Unicode normalization (NFC vs NFD)

Exit codes:
  0  no violations (or none beyond the baseline); the baseline command always
     exits 0 when it writes the snapshot, even if it records violations
  1  violations found (check)
  2  usage or internal error

Examples:
  portafs check                       audit the current directory (git-aware)
  portafs check --json                same, JSON report for scripts
  portafs check --staged              pre-commit hook: only what is staged
  portafs baseline                    adopt an existing repository
  portafs check --baseline .portafs-baseline.json
`;

export class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
  }
}

export const defaultIo = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  env: process.env,
  cwd: process.cwd(),
  tty: process.stdout.isTTY === true,
};

const VALUE_FLAGS = new Set(['--rule', '--ignore', '--baseline', '--output', '--max-length']);

function checkRuleId(value, flagName) {
  if (!RULE_IDS.includes(value)) {
    throw new CliError(`unknown rule "${value}" passed to ${flagName} (valid rules: ${RULE_IDS.join(', ')})`);
  }
  return value;
}

export function parseArgs(argv) {
  const flags = {
    help: false,
    version: false,
    command: null,
    dir: '.',
    json: false,
    rules: [],
    ignored: [],
    staged: false,
    baselineFile: null,
    outputFile: null,
    maxLength: null,
    noColor: false,
  };
  const positionals = [];
  let endOfFlags = false;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    i += 1;
    if (!endOfFlags && arg === '--') {
      endOfFlags = true;
      continue;
    }
    const isFlag = !endOfFlags && arg.startsWith('-') && arg.length > 1;
    if (!isFlag) {
      positionals.push(arg);
      continue;
    }
    let name = arg;
    let inline;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      name = arg.slice(0, eq);
      inline = arg.slice(eq + 1);
    }
    if (!VALUE_FLAGS.has(name)) {
      if (inline !== undefined) throw new CliError(`option ${name} does not take a value`);
      switch (name) {
        case '--json': flags.json = true; break;
        case '--no-color': flags.noColor = true; break;
        case '--staged': flags.staged = true; break;
        case '-h': case '--help': flags.help = true; break;
        case '--version': flags.version = true; break;
        default: throw new CliError(`unknown option ${name}`);
      }
      continue;
    }
    let value;
    if (inline !== undefined) {
      value = inline;
    } else {
      const next = argv[i];
      if (next === undefined || next.startsWith('-')) throw new CliError(`option ${name} requires a value`);
      value = next;
      i += 1;
    }
    if (value === '') throw new CliError(`option ${name} requires a value`);
    switch (name) {
      case '--rule': flags.rules.push(checkRuleId(value, '--rule')); break;
      case '--ignore': flags.ignored.push(checkRuleId(value, '--ignore')); break;
      case '--baseline': flags.baselineFile = value; break;
      case '--output': flags.outputFile = value; break;
      case '--max-length': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new CliError(`--max-length expects a positive integer, got "${value}"`);
        }
        flags.maxLength = n;
        break;
      }
      default: throw new CliError(`unknown option ${name}`);
    }
  }

  if (flags.help || flags.version) return flags; // help/version win over command validation
  if (positionals.length === 0) {
    throw new CliError('missing command — expected "check" or "baseline" (run "portafs --help" for usage)');
  }
  const [command, dir, ...extra] = positionals;
  if (command !== 'check' && command !== 'baseline') {
    throw new CliError(`unknown command "${command}" — expected "check" or "baseline"`);
  }
  if (extra.length > 0) throw new CliError(`unexpected extra argument "${extra[0]}"`);
  flags.command = command;
  flags.dir = dir ?? '.';
  if (flags.baselineFile !== null && command !== 'check') {
    throw new CliError('--baseline is only valid with the "check" command');
  }
  if (flags.outputFile !== null && command !== 'baseline') {
    throw new CliError('--output is only valid with the "baseline" command');
  }
  return flags;
}

function colorEnabled(flags, io) {
  if (flags.json || flags.noColor) return false;
  const noColor = io.env ? io.env.NO_COLOR : undefined;
  if (typeof noColor === 'string' && noColor.length > 0) return false;
  return io.tty === true;
}

async function resolveTarget(dir, io) {
  const display = path.resolve(io.cwd, dir);
  let info;
  try {
    info = await stat(display);
  } catch {
    throw new CliError(`target directory does not exist or is not readable: ${display}`);
  }
  if (!info.isDirectory()) throw new CliError(`target is not a directory: ${display}`);
  // realpath keeps the git-mode root comparison correct where the path
  // contains a symlink (e.g. macOS /var -> /private/var).
  let root = display;
  try {
    root = await realpath(display);
  } catch {
    // keep the unresolved path
  }
  return { root, display };
}

function ruleOptions(flags) {
  return {
    rules: flags.rules.length > 0 ? flags.rules : undefined,
    ignored: flags.ignored,
    maxLength: flags.maxLength ?? DEFAULT_MAX_LENGTH,
  };
}

async function runCheck(flags, io) {
  const { root, display } = await resolveTarget(flags.dir, io);
  const { mode, paths } = await collectPaths(root, { staged: flags.staged });
  const violations = runRules(paths, ruleOptions(flags));
  let reported = violations;
  let baseline = null;
  if (flags.baselineFile !== null) {
    let known;
    try {
      known = await loadBaseline(flags.baselineFile);
    } catch (err) {
      throw new CliError(err instanceof Error ? err.message : String(err));
    }
    reported = diffAgainstBaseline(violations, known);
    baseline = { file: flags.baselineFile, known: known.length };
  }
  const shared = {
    version: VERSION,
    target: display,
    mode,
    pathCount: paths.length,
    violations: reported,
    baseline,
  };
  io.out(
    flags.json
      ? renderJson(shared)
      : renderHuman({ ...shared, rules: RULES, color: colorEnabled(flags, io) }),
  );
  return reported.length > 0 ? 1 : 0;
}

async function runBaseline(flags, io) {
  const { root, display } = await resolveTarget(flags.dir, io);
  const { mode, paths } = await collectPaths(root, { staged: flags.staged });
  const violations = runRules(paths, ruleOptions(flags));
  const file = path.resolve(io.cwd, flags.outputFile ?? DEFAULT_BASELINE_FILE);
  const snapshot = buildBaselineSnapshot({ version: VERSION, violations });
  try {
    await writeBaseline(file, snapshot);
  } catch (err) {
    throw new CliError(`cannot write baseline file ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (flags.json) {
    const summary = {
      tool: 'portafs',
      version: VERSION,
      target: display,
      mode,
      pathCount: paths.length,
      output: file,
      violations: violations.length,
    };
    io.out(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    io.out(`portafs: baseline written to ${file}\n`);
    io.out(`${violations.length} violation(s) across ${paths.length} path(s) (mode: ${mode})\n`);
  }
  return 0;
}

export async function run(argv, io = defaultIo) {
  try {
    const flags = parseArgs(argv);
    if (flags.help) {
      io.out(USAGE);
      return 0;
    }
    if (flags.version) {
      io.out(`${VERSION}\n`);
      return 0;
    }
    return flags.command === 'baseline' ? await runBaseline(flags, io) : await runCheck(flags, io);
  } catch (err) {
    if (err instanceof CliError) {
      io.err(`portafs: ${err.message}\n`);
      io.err('run "portafs --help" for usage.\n');
      return 2;
    }
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    io.err(`portafs: internal error: ${detail}\n`);
    return 2;
  }
}
