// Collects the relative path list the rules run on.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { stagedFiles, trackedFiles, git } from './git.js';

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
// "Inside" is decided by git itself (rev-parse --is-inside-work-tree run FROM
// the scan root) — never by comparing paths lexically, which breaks on Windows
// where os.tmpdir() yields 8.3 short names while rev-parse prints long forms.
export async function collectPaths(root, { staged = false } = {}) {
  const inside = await insideWorkTree(root);
  if (inside) {
    const files = staged ? await stagedFiles(root) : await trackedFiles(root);
    return { mode: staged ? 'git-staged' : 'git-tracked', paths: withAncestorDirs(files) };
  }
  return { mode: 'filesystem', paths: await walkDirectory(root) };
}

// Git's own answer to "are we inside a work tree?", asked from the scan root.
// Immune to 8.3/long path divergence: git walks up from cwd, no lexical
// comparison anywhere.
async function insideWorkTree(root) {
  try {
    const out = await git(['rev-parse', '--is-inside-work-tree'], root);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}
