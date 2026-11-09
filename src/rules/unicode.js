const ID = 'unicode';
const DESCRIPTION = 'Paths that differ only by Unicode normalization (NFC vs NFD) can collapse into one file on other platforms.';
const HINT =
  'These names are canonically equivalent under Unicode normalization (NFC vs NFD). Some platforms and tools treat them as the same file. Normalize names to one form (NFC is the common choice).';

// Pure rule: group by the NFC form of the full relative path (no case
// folding — that is the case-collision rule). Two distinct raw spellings that
// share an NFC form can be stored as two files on Linux but may collapse on
// macOS/Windows. Raw duplicates collapse through the Set.
export const rule = {
  id: ID,
  description: DESCRIPTION,
  hint: HINT,
  run(paths) {
    const groups = new Map();
    for (const p of paths) {
      const key = p.normalize('NFC');
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
          detail: `differs only by Unicode normalization from: ${others.join(', ')}`,
          hint: HINT,
        });
      }
    }
    return violations;
  },
};
