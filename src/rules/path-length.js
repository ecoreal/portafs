const ID = 'path-length';
const DESCRIPTION = 'Paths longer than the limit break tools on Windows (default limit: 260 characters).';
const HINT =
  'Shorten the path — Windows path handling fails once the checkout directory prefix pushes a path past the limit. The limit counts the relative path only; lower --max-length for deep checkout locations.';

export const DEFAULT_MAX_LENGTH = 260;

// Pure rule: the relative path is measured in UTF-16 code units (JS string
// .length), matching how Windows counts path lengths. A path counts as too
// long only when it is strictly longer than the limit.
export const rule = {
  id: ID,
  description: DESCRIPTION,
  hint: HINT,
  run(paths, options = {}) {
    const limit = typeof options.maxLength === 'number' ? options.maxLength : DEFAULT_MAX_LENGTH;
    const violations = [];
    for (const p of paths) {
      if (p.length > limit) {
        violations.push({
          ruleId: ID,
          path: p,
          detail: `path is ${p.length} characters (limit: ${limit})`,
          hint: HINT,
        });
      }
    }
    return violations;
  },
};
