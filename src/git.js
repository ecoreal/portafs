// Thin wrapper around the local git binary. Every function degrades to a
// "no repository" result instead of throwing, so callers can fall back to a
// plain directory walk.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// Large repositories exceed the default 1 MB stdout buffer.
const RUN_OPTIONS = { maxBuffer: 64 * 1024 * 1024, windowsHide: true };

async function git(args, cwd) {
  const { stdout } = await execFileAsync('git', args, { ...RUN_OPTIONS, cwd });
  return stdout;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function splitNulList(stdout) {
  return stdout.split('\0').filter((entry) => entry.length > 0);
}

// Keep only paths under subdirPosix and rewrite them relative to it.
function underSubdir(paths, subdirPosix) {
  const keep = paths.filter((p) => p.length > 0);
  if (!subdirPosix) return keep;
  const prefix = `${subdirPosix}/`;
  const out = [];
  for (const p of keep) {
    if (p === subdirPosix) continue; // the scan root itself carries no name
    if (p.startsWith(prefix)) out.push(p.slice(prefix.length));
  }
  return out;
}

// Absolute work-tree root, or null when cwd is not inside a repository (or git
// is missing / refuses to run, e.g. "dubious ownership") — callers fall back.
export async function detectRepo(cwd) {
  try {
    const top = (await git(['rev-parse', '--show-toplevel'], cwd)).trim();
    return top.length > 0 ? path.resolve(top) : null;
  } catch {
    return null;
  }
}

// Files tracked in the index (staged-but-uncommitted files included, since
// those would break a fresh clone too). Paths are NUL-separated with -z, so
// names with spaces or quotes survive untouched.
export async function trackedFiles(repoRoot, scanDir) {
  const stdout = await git(['ls-files', '-z'], repoRoot);
  return underSubdir(splitNulList(stdout), toPosix(path.relative(repoRoot, scanDir)));
}

// Staged additions/modifications only. --diff-filter=ACMR drops deletions:
// a staged deletion must not be audited as a violation.
export async function stagedFiles(repoRoot, scanDir) {
  const stdout = await git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], repoRoot);
  return underSubdir(splitNulList(stdout), toPosix(path.relative(repoRoot, scanDir)));
}
