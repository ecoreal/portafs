const ID = 'windows-reserved';
const DESCRIPTION = 'Windows reserves device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) even with an extension, e.g. aux.c.';
const HINT =
  'Windows cannot create files or folders named after devices (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — with or without an extension. Choose a different name.';

// Windows reserves these names for every extension: the stem before the first
// dot decides. Case-insensitive, so "Aux.c" is just as broken as "aux.c".
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// Pure rule: every path component is checked, because a reserved name breaks
// the checkout whether it names a file or a folder.
export const rule = {
  id: ID,
  description: DESCRIPTION,
  hint: HINT,
  run(paths) {
    const violations = [];
    for (const p of paths) {
      const offending = [];
      for (const component of p.split('/')) {
        const stem = component.split('.', 1)[0].toUpperCase();
        if (RESERVED.has(stem) && !offending.includes(component)) offending.push(component);
      }
      if (offending.length > 0) {
        violations.push({
          ruleId: ID,
          path: p,
          detail: `uses reserved Windows device name: ${offending.map((n) => `"${n}"`).join(', ')}`,
          hint: HINT,
        });
      }
    }
    return violations;
  },
};
