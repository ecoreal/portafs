const ID = 'trailing';
const DESCRIPTION = 'Names ending with a space or a dot are silently rewritten or rejected by Windows.';
const HINT =
  'Windows strips trailing spaces and dots when creating files, so a checkout will not match the repository. Remove them from the name.';

const TRAILING_SPACE_OR_DOT = /[ .]$/;

// Pure rule: any component (file or folder) ending with a space or dot breaks
// on Windows, not just the final one.
export const rule = {
  id: ID,
  description: DESCRIPTION,
  hint: HINT,
  run(paths) {
    const violations = [];
    for (const p of paths) {
      const offending = [];
      for (const component of p.split('/')) {
        if (TRAILING_SPACE_OR_DOT.test(component) && !offending.includes(component)) offending.push(component);
      }
      if (offending.length > 0) {
        violations.push({
          ruleId: ID,
          path: p,
          detail: `component ends with a space or a dot: ${offending.map((n) => `"${n}"`).join(', ')}`,
          hint: HINT,
        });
      }
    }
    return violations;
  },
};
