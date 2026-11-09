// CLI end-to-end tests (spawn the real bin) plus parseArgs unit coverage.
// All fixtures are built at runtime in os.tmpdir() with cross-platform-safe
// names; the one violating fixture uses an NFC/NFD pair, which every file
// system in the CI matrix can create (unlike reserved names or case twins).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, parseArgs } from '../src/cli.js';

const BIN = fileURLToPath(new URL('../bin/portafs.js', import.meta.url));
const SAMPLE_FIXTURE = fileURLToPath(new URL('./fixtures/sample', import.meta.url));

function runCli(args, { cwd, env } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

async function makeTempDir(t, prefix = 'portafs-cli-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// Minimal recursive copy (avoids fs.cp, which warns as experimental on some
// supported Node lines).
async function copyTree(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to);
    } else {
      await copyFile(from, to);
    }
  }
}

async function copySampleFixture(t) {
  const dest = await makeTempDir(t);
  await copyTree(SAMPLE_FIXTURE, dest);
  return dest;
}

async function makeViolationFixture(t) {
  const dir = await makeTempDir(t);
  await writeFile(path.join(dir, 'caf\u00e9.md'), 'nfc');
  await writeFile(path.join(dir, 'cafe\u0301.md'), 'nfd');
  await writeFile(path.join(dir, 'README.md'), 'x');
  return dir;
}

// --- parseArgs (pure) -------------------------------------------------------

test('parseArgs understands the documented flags', () => {
  const flags = parseArgs([
    'check', 'sub', '--json', '--rule', 'unicode', '--rule=path-length',
    '--ignore', 'trailing', '--staged', '--max-length', '120', '--no-color',
  ]);
  assert.equal(flags.command, 'check');
  assert.equal(flags.dir, 'sub');
  assert.equal(flags.json, true);
  assert.deepEqual(flags.rules, ['unicode', 'path-length']);
  assert.deepEqual(flags.ignored, ['trailing']);
  assert.equal(flags.staged, true);
  assert.equal(flags.maxLength, 120);
  assert.equal(flags.noColor, true);
});

test('parseArgs defaults and errors', () => {
  const bare = parseArgs(['check']);
  assert.equal(bare.command, 'check');
  assert.equal(bare.dir, '.');
  assert.equal(parseArgs(['baseline', '--output', 'snap.json']).outputFile, 'snap.json');
  assert.equal(parseArgs(['check', '--baseline=b.json']).baselineFile, 'b.json');
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['check', '--', '--weird']).dir, '--weird');

  assert.throws(() => parseArgs([]), CliError);
  assert.throws(() => parseArgs(['nope']), CliError);
  assert.throws(() => parseArgs(['check', 'a', 'b']), CliError);
  assert.throws(() => parseArgs(['check', '--rule', 'nope']), /unknown rule/);
  assert.throws(() => parseArgs(['check', '--max-length', 'zero']), /positive integer/);
  assert.throws(() => parseArgs(['check', '--rule']), /requires a value/);
  assert.throws(() => parseArgs(['check', '--json=1']), /does not take a value/);
  assert.throws(() => parseArgs(['baseline', '--baseline', 'b.json']), /only valid with the "check" command/);
  assert.throws(() => parseArgs(['check', '--output', 'o.json']), /only valid with the "baseline" command/);
});

// --- spawned bin ------------------------------------------------------------

test('CLI --help and --version exit 0', () => {
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  assert.ok(help.stdout.includes('Usage:'));
  assert.ok(help.stdout.includes('--baseline'));

  const version = runCli(['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /\b0\.1\.0\b/);
});

test('CLI check on a clean static fixture exits 0 with expected path count', async (t) => {
  const dir = await copySampleFixture(t);
  const result = runCli(['check', '.'], { cwd: dir });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('no violations found'));

  const json = JSON.parse(runCli(['check', '.', '--json'], { cwd: dir }).stdout);
  assert.equal(json.mode, 'filesystem');
  assert.equal(json.pathCount, 6); // 4 files + 2 directories
  assert.deepEqual(json.violations, []);
});

test('CLI check exits 1 on violations, 0 when rules are filtered away', async (t) => {
  const dir = await makeViolationFixture(t);
  // APFS (macOS) normalizes the NFC name to NFD on write, collapsing the pair
  // into one file — a collision the filesystem erased is not a violation, and
  // the tool is CORRECT to report none there.
  const nfdPairSurvives = fs.readdirSync(dir).filter((n) => n.startsWith('caf')).length === 2;
  if (!nfdPairSurvives) {
    assert.equal(runCli(['check', '.'], { cwd: dir }).status, 0);
    return;
  }
  const bad = runCli(['check', '.'], { cwd: dir });
  assert.equal(bad.status, 1);
  assert.ok(bad.stdout.includes('unicode'));
  assert.ok(bad.stdout.includes('hint:'));

  assert.equal(runCli(['check', '.', '--rule', 'path-length'], { cwd: dir }).status, 0);
  assert.equal(runCli(['check', '.', '--rule', 'unicode'], { cwd: dir }).status, 1);
  // Ignoring one of the two rules is not enough — case-collision reports the
  // same NFC/NFD pair independently — so both must be ignored for a pass.
  assert.equal(runCli(['check', '.', '--ignore', 'unicode', '--ignore', 'case-collision'], { cwd: dir }).status, 0);
});

test('CLI --json output is parseable and complete', async (t) => {
  const dir = await makeViolationFixture(t);
  const nfdPairSurvives = fs.readdirSync(dir).filter((n) => n.startsWith('caf')).length === 2;
  const result = runCli(['check', '.', '--json'], { cwd: dir });
  if (!nfdPairSurvives) {
    assert.equal(result.status, 0);
    return;
  }
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.tool, 'portafs');
  assert.equal(report.version, '0.1.0');
  assert.equal(report.mode, 'filesystem');
  // An NFC/NFD pair trips unicode AND case-collision: the rules are
  // independent by design, so the same underlying problem is reported twice.
  assert.equal(report.summary.violations, 4);
  assert.deepEqual(report.summary.byRule, { 'case-collision': 2, unicode: 2 });
  assert.equal(report.violations.length, 4);
  for (const v of report.violations) {
    for (const key of ['ruleId', 'path', 'detail', 'hint']) {
      assert.equal(typeof v[key], 'string');
    }
  }
});

test('CLI exits 2 on usage errors', async (t) => {
  const dir = await makeViolationFixture(t);
  assert.equal(runCli(['--bogus'], { cwd: dir }).status, 2);
  assert.equal(runCli(['check', './missing-dir'], { cwd: dir }).status, 2);
  assert.equal(runCli(['check', '--rule', 'nope'], { cwd: dir }).status, 2);
  assert.equal(runCli([], { cwd: dir }).status, 2);
  assert.equal(runCli(['frobnicate'], { cwd: dir }).status, 2);
});

test('CLI --max-length lowers the path-length threshold', async (t) => {
  const dir = await makeViolationFixture(t);
  const result = runCli(['check', '.', '--json', '--max-length', '3'], { cwd: dir });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.byRule['path-length'], 3); // every path exceeds 3 characters
});

test('NO_COLOR and --no-color suppress ANSI escapes', async (t) => {
  const dir = await makeViolationFixture(t);
  const viaEnv = runCli(['check', '.'], { cwd: dir, env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(viaEnv.status, 1);
  assert.ok(!viaEnv.stdout.includes('\u001b'));
  const viaFlag = runCli(['check', '.', '--no-color'], { cwd: dir });
  assert.ok(!viaFlag.stdout.includes('\u001b'));
});

test('baseline flow: snapshot, then report only new violations', async (t) => {
  const dir = await makeViolationFixture(t);

  const written = runCli(['baseline', '.'], { cwd: dir });
  assert.equal(written.status, 0);
  assert.ok(written.stdout.includes('.portafs-baseline.json'));
  const snapshot = JSON.parse(await readFile(path.join(dir, '.portafs-baseline.json'), 'utf8'));
  assert.equal(snapshot.violations.length, 4); // NFC/NFD pair under two rules

  const noNew = runCli(['check', '.', '--baseline', '.portafs-baseline.json'], { cwd: dir });
  assert.equal(noNew.status, 0);
  assert.ok(noNew.stdout.includes('no new violations'));

  // A new NFC/NFD pair makes four new violations; the known pair stays silent.
  await writeFile(path.join(dir, 'n\u00e9.md'), 'new nfc');
  await writeFile(path.join(dir, 'ne\u0301.md'), 'new nfd');
  const withNew = runCli(['check', '.', '--baseline', '.portafs-baseline.json', '--json'], { cwd: dir });
  assert.equal(withNew.status, 1);
  const report = JSON.parse(withNew.stdout);
  assert.deepEqual(
    report.violations.map((v) => v.path).sort(),
    ['ne\u0301.md', 'n\u00e9.md', 'ne\u0301.md', 'n\u00e9.md'].sort(),
  );
  assert.equal(report.baseline.known, 4);
});

test('baseline --output writes to a custom file', async (t) => {
  const dir = await makeViolationFixture(t);
  const result = runCli(['baseline', '.', '--output', 'my-snapshot.json'], { cwd: dir });
  assert.equal(result.status, 0);
  const snapshot = JSON.parse(await readFile(path.join(dir, 'my-snapshot.json'), 'utf8'));
  assert.equal(snapshot.tool, 'portafs');
  assert.equal(snapshot.violations.length, 4);
});
