// Thin wrapper around the local git binary. Every function degrades to a
// "no repository" result instead of throwing, so callers can fall back to a
// plain directory walk.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// Large repositories exceed the default 1 MB stdout buffer.
const RUN_OPTIONS = { maxBuffer: 64 * 1024 * 1024, windowsHide: true };

export async function git(args, cwd) {
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

// Absolute work-tree root, or null when cwd is not inside a repository (or git
// is missing / refuses to run, e.g. "dubious ownership") — callers fall back.
// realpathSync.native matters on Windows: os.tmpdir() hands out 8.3 short
// names (RUNNER~1) while rev-parse returns the long form, and callers compare
// the two lexically. Only the native realpath expands 8.3 components.
export async function detectRepo(cwd) {
  try {
    const top = (await git(['rev-parse', '--show-toplevel'], cwd)).trim();
    if (top.length === 0) return null;
    const resolved = path.resolve(top);
    try {
      return fs.realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  } catch {
    return null;
  }
}

// Files tracked in the index (staged-but-uncommitted files included, since
// those would break a fresh clone too). Paths are NUL-separated with -z, so
// names with spaces or quotes survive untouched.
export async function trackedFiles(scanDir) {
  // run FROM the scan root: ls-files prints paths relative to cwd, so the
  // 8.3-vs-long toplevel divergence on Windows never enters the output
  const stdout = await git(['ls-files', '-z', '--', '.'], scanDir);
  return splitNulList(stdout).map(toPosix);
}

// Staged additions/modifications only. --diff-filter=ACMR drops deletions:
// a staged deletion must not be audited as a violation.
export async function stagedFiles(scanDir) {
  // --relative makes diff output cwd-relative, like ls-files
  const stdout = await git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '--relative', '--', '.'], scanDir);
  return splitNulList(stdout).map(toPosix);
}
