// Scanner integration tests. Fixtures are built at runtime under os.tmpdir()
// using only names every platform can create (no reserved names, no trailing
// dots, no same-directory case collisions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectPaths, walkDirectory, withAncestorDirs } from '../src/scan.js';

async function makeTempDir(t, prefix = 'portafs-scan-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('walkDirectory lists files and directories with posix separators, sorted', async (t) => {
  const root = await makeTempDir(t);
  await mkdir(path.join(root, 'src', 'lib'), { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'empty'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), 'x');
  await writeFile(path.join(root, 'src', 'app.js'), 'x');
  await writeFile(path.join(root, 'src', 'lib', 'util.js'), 'x');
  await writeFile(path.join(root, 'docs', 'guide.md'), 'x');

  const found = await walkDirectory(root);
  assert.deepEqual(found, [
    'README.md',
    'docs',
    'docs/guide.md',
    'empty',
    'src',
    'src/app.js',
    'src/lib',
    'src/lib/util.js',
  ]);
});

test('walkDirectory includes symlinks but does not follow them', async (t) => {
  const root = await makeTempDir(t);
  await mkdir(path.join(root, 'real'), { recursive: true });
  await writeFile(path.join(root, 'real', 'inside.txt'), 'x');
  let made = true;
  try {
    await symlink('real', path.join(root, 'link'));
    await symlink('missing-target', path.join(root, 'dangling'));
  } catch {
    made = false; // Windows without symlink privileges, or a restricted account
  }
  if (!made) {
    t.skip('symlinks cannot be created on this platform/account');
    return;
  }
  const found = await walkDirectory(root);
  // The links themselves are listed; their targets are never traversed
  // (no "link/inside.txt"), and the dangling link does not break the walk.
  assert.deepEqual(found, ['dangling', 'link', 'real', 'real/inside.txt']);
});

const canTestUnreadable = process.platform !== 'win32'
  && typeof process.getuid === 'function'
  && process.getuid() !== 0;

test('walkDirectory skips directories it cannot read', { skip: canTestUnreadable ? false : 'needs POSIX non-root' }, async (t) => {
  const root = await makeTempDir(t);
  await mkdir(path.join(root, 'locked'), { recursive: true });
  await writeFile(path.join(root, 'locked', 'secret.txt'), 'x');
  await chmod(path.join(root, 'locked'), 0o000);
  // Restore inside the body: after-hooks may run before the rm() cleanup, and
  // an unreadable directory would then break cleanup instead of the walk.
  let found;
  try {
    found = await walkDirectory(root);
  } finally {
    await chmod(path.join(root, 'locked'), 0o700).catch(() => {});
  }
  assert.deepEqual(found, ['locked']);
});

test('collectPaths falls back to a filesystem walk outside a git repository', async (t) => {
  const root = await makeTempDir(t);
  await writeFile(path.join(root, 'a.md'), 'x');
  const result = await collectPaths(root, { staged: false });
  assert.equal(result.mode, 'filesystem');
  assert.deepEqual(result.paths, ['a.md']);
});

test('withAncestorDirs adds every ancestor directory', () => {
  assert.deepEqual(withAncestorDirs(['a/b/c.txt', 'top.md']), ['a', 'a/b', 'a/b/c.txt', 'top.md']);
  assert.deepEqual(withAncestorDirs([]), []);
  assert.deepEqual(withAncestorDirs(['']), []);
});
