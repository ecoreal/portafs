const ID = 'case-collision';
const DESCRIPTION = 'Paths differing only by letter case collide on case-insensitive file systems.';
const HINT =
  'Rename so every name inside a directory is unique regardless of letter case — case-insensitive file systems (Windows, macOS by default) cannot store both.';

// Pure rule: group by NFC + lowercase of the full relative path. Grouping by
// full path (not just the basename) also catches directories that differ only
// by case. Raw-duplicate inputs collapse through the Set, so a repeated path
// never reports a collision with itself.
export const rule = {
  id: ID,
  description: DESCRIPTION,
  hint: HINT,
  run(paths) {
    const groups = new Map();
    for (const p of paths) {
      const key = p.normalize('NFC').toLowerCase();
      const group = groups.get(key);
      if (group) group.add(p);
      else groups.set(key, new Set([p]));
    }
    const violations = [];
    for (const members of groups.values()) {
      if (members.size < 2) continue;
      for (const p of members) {
        const others = [...members].filter((x) => x !== p);
        violations.push({
          ruleId: ID,
          path: p,
          detail: `differs only by letter case from: ${others.join(', ')}`,
          hint: HINT,
        });
      }
    }
    return violations;
  },
};
