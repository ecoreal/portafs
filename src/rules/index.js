// Rule registry. Every rule follows one contract:
//   run(relativePaths: string[], options) -> Violation[]
// where a Violation is { ruleId, path, detail, hint }. Rules are pure: they
// never touch the filesystem, which keeps them testable on any platform.
import { rule as caseCollision } from './case-collision.js';
import { rule as windowsReserved } from './windows-reserved.js';
import { rule as trailing } from './trailing.js';
import { rule as pathLength } from './path-length.js';
import { rule as unicode } from './unicode.js';

// Fixed order keeps human and JSON output stable regardless of flag order.
export const RULES = [caseCollision, windowsReserved, trailing, pathLength, unicode];
export const RULE_IDS = RULES.map((r) => r.id);

// Resolve --rule / --ignore selections into the rules that will run.
export function selectRules({ rules, ignored } = {}) {
  const selected = rules && rules.length > 0 ? rules : RULE_IDS;
  const skipped = new Set(ignored ?? []);
  return RULES.filter((r) => selected.includes(r.id) && !skipped.has(r.id));
}

export function runRules(paths, options = {}) {
  const violations = [];
  for (const r of selectRules(options)) violations.push(...r.run(paths, options));
  return violations;
}
