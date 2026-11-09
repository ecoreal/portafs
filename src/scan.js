// Collects the relative path list the rules run on.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { detectRepo, stagedFiles, trackedFiles } from './git.js';

// Depth-first walk collecting every entry (files AND directories) as a
// POSIX-separated relative path. Relative paths are built by string join so
// names containing backslashes on POSIX are never mangled. Symlinks are
// listed but never followed; unreadable directories are skipped without
// failing the whole scan.
export async function walkDirectory(root) {
  const found = [];
  const visit = async (rel) => {
    let entries;
    try {
      entries = await readdir(rel === '' ? root : path.join(root, rel), { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip silently
    }
    for (const entry of entries) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      found.push(child);
      if (entry.isDirectory()) await visit(child);
    }
  };
  await visit('');
  found.sort();
  return found;
}

// Git listings contain files only; ancestor directory names are derived from
// them so directory-level problems (case-colliding folders, reserved folder
// names) are caught in git mode exactly as in a full filesystem walk.
export function withAncestorDirs(paths) {
  const all = new Set();
  for (const p of paths) {
    if (p === '') continue;
    all.add(p);
    const parts = p.split('/');
    parts.pop();
    let parent = '';
    for (const part of parts) {
      parent = parent === '' ? part : `${parent}/${part}`;
      all.add(parent);
    }
  }
  return [...all].sort();
}

// Mode selection: inside a git work tree audit the tracked (or staged) files;
// everywhere else — or when git is unusable — fall back to a plain walk.
export async function collectPaths(root, { staged = false } = {}) {
  const repoRoot = await detectRepo(root);
  if (repoRoot) {
    // realpath both sides: on Windows os.tmpdir() yields 8.3 short names while
    // rev-parse returns the long form, and path.relative is purely lexical.
    // .native is required — the JS realpath does not expand 8.3 components.
    let rootReal = root;
    try {
      rootReal = fs.realpathSync.native(root);
    } catch {
      /* keep as-is */
    }
    const rel = path.relative(repoRoot, rootReal);
    const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (inside) {
      const files = staged ? await stagedFiles(repoRoot, root) : await trackedFiles(repoRoot, root);
      return { mode: staged ? 'git-staged' : 'git-tracked', paths: withAncestorDirs(files) };
    }
  }
  return { mode: 'filesystem', paths: await walkDirectory(root) };
}
