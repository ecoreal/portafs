// Git-aware mode tests: temporary git repositories built inside os.tmpdir()
// with an isolated environment (no global/system config, no network). Every
// git-dependent test is skipped when no git binary is available.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { detectRepo, stagedFiles, trackedFiles } from '../src/git.js';
import { collectPaths } from '../src/scan.js';

const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
const gitAvailable = !probe.error && probe.status === 0;
const skipNoGit = gitAvailable ? false : 'git binary not available';

const BIN = fileURLToPath(new URL('../bin/portafs.js', import.meta.url));

function runCli(args, { cwd, env } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

async function makeTempDir(t, prefix = 'portafs-git-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// Fully isolated git environment: no global/system config, no ambient
// GIT_DIR/GIT_WORK_TREE pointing elsewhere, HOME redirected into the temp dir.
function gitEnv(dir) {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...rest } = process.env;
  return {
    ...rest,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(dir, 'git-config'),
    HOME: dir,
    XDG_CONFIG_HOME: path.join(dir, '.config'),
  };
}

function git(dir, env, ...args) {
  const result = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

async function initRepo(t) {
  const dir = await makeTempDir(t);
  const env = gitEnv(dir);
  await writeFile(path.join(dir, 'git-config'), '', 'utf8');
  git(dir, env, 'init', '-q');
  // The isolated config file lives inside the temp dir; keep it out of the
  // index so `git add .` fixtures only contain the paths the test created.
  await writeFile(path.join(dir, '.git', 'info', 'exclude'), 'git-config\n', 'utf8');
  // Keep macOS from normalizing NFD names into the index, so NFC/NFD fixture
  // pairs stay two distinct entries everywhere.
  git(dir, env, 'config', 'core.precomposeunicode', 'false');
  git(dir, env, 'config', 'core.autocrlf', 'false');
  git(dir, env, 'config', 'user.email', 'portafs-test@example.com');
  git(dir, env, 'config', 'user.name', 'portafs test');
  return { dir, env };
}

test('detectRepo finds the enclosing repository root', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  const expected = git(dir, env, 'rev-parse', '--show-toplevel').trim();
  assert.equal(
    fs.realpathSync.native(await detectRepo(dir)),
    fs.realpathSync.native(path.resolve(expected)),
  );
});

test('detectRepo returns null outside a repository', async (t) => {
  const dir = await makeTempDir(t);
  assert.equal(await detectRepo(dir), null);
});

test('trackedFiles lists indexed files relative to the scan directory', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'a.md'), 'x');
  await writeFile(path.join(dir, 'sub', 'b.md'), 'x');
  git(dir, env, 'add', '.');
  await writeFile(path.join(dir, 'untracked.md'), 'x');

  assert.deepEqual((await trackedFiles(dir)).sort(), ['a.md', 'sub/b.md']);
  assert.deepEqual(await trackedFiles(path.join(dir, 'sub')), ['b.md']);
});

test('collectPaths uses git-tracked mode and expands ancestor directories', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'sub', 'b.md'), 'x');
  git(dir, env, 'add', 'sub/b.md');
  await writeFile(path.join(dir, 'loose.md'), 'x'); // untracked

  const result = await collectPaths(dir, {});
  assert.equal(result.mode, 'git-tracked');
  // loose.md is not tracked, so it is absent; the ancestor dir is included.
  assert.deepEqual(result.paths, ['sub', 'sub/b.md']);
});

test('stagedFiles returns staged additions and skips untracked files', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  const nfc = 'caf\u00e9.md';
  const nfd = 'cafe\u0301.md';
  await writeFile(path.join(dir, nfc), 'nfc');
  await writeFile(path.join(dir, nfd), 'nfd');
  git(dir, env, 'add', '.');
  await writeFile(path.join(dir, 'later.md'), 'untracked');

  const staged = await stagedFiles(dir);
  assert.deepEqual(staged.sort(), [nfc, nfd].sort());
});

test('stagedFiles excludes staged deletions (diff-filter ACMR)', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  await writeFile(path.join(dir, 'gone.md'), 'x');
  await writeFile(path.join(dir, 'kept.md'), 'x');
  git(dir, env, 'add', '.');
  git(dir, env, 'commit', '-q', '-m', 'init');
  await rm(path.join(dir, 'gone.md'));
  await writeFile(path.join(dir, 'kept.md'), 'changed');
  git(dir, env, 'add', '-A');

  // kept.md is a modification (included); gone.md is a deletion (excluded).
  assert.deepEqual(await stagedFiles(dir), ['kept.md']);
});

test('CLI: default mode audits tracked files only, --staged audits staged only', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  const nfc = 'n\u00e1ive.md';
  const nfd = 'na\u0301ive.md';
  await writeFile(path.join(dir, 'clean.md'), 'x');
  git(dir, env, 'add', 'clean.md');
  // An NFC/NFD pair: a lone NFD file is not a violation, the pair is.
  await writeFile(path.join(dir, nfc), 'untracked NFC name');
  await writeFile(path.join(dir, nfd), 'untracked NFD name');

  const before = runCli(['check', '.'], { cwd: dir, env });
  assert.equal(before.status, 0, `expected clean checkout, got:\n${before.stdout}${before.stderr}`);

  git(dir, env, 'add', nfc, nfd);
  const trackedRun = runCli(['check', '.'], { cwd: dir, env });
  assert.equal(trackedRun.status, 1); // staged files count as tracked
  assert.ok(trackedRun.stdout.includes('unicode'));
  assert.ok(trackedRun.stdout.includes(nfd));

  const stagedRun = runCli(['check', '.', '--staged'], { cwd: dir, env });
  assert.equal(stagedRun.status, 1);
  assert.ok(stagedRun.stdout.includes('unicode'));
});

test('CLI: fresh repository with nothing staged is clean', { skip: skipNoGit }, async (t) => {
  const { dir, env } = await initRepo(t);
  await writeFile(path.join(dir, 'README.md'), 'x'); // exists but untracked
  const result = runCli(['check', '.', '--json'], { cwd: dir, env });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'git-tracked');
  assert.equal(report.pathCount, 0);
});
