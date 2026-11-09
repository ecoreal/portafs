// Baseline snapshots: write the violations that exist today, so later checks
// only report what is new. This lets existing repositories adopt portafs
// without a giant cleanup upfront.
import { readFile, writeFile } from 'node:fs/promises';

export const DEFAULT_BASELINE_FILE = '.portafs-baseline.json';

// Two violations count as "the same" when rule id and path match; detail and
// hint may drift as siblings appear or disappear without reopening old wounds.
export function violationKey(v) {
  return `${v.ruleId}\u0000${v.path}`;
}

export function diffAgainstBaseline(current, knownViolations) {
  const known = new Set(knownViolations.map(violationKey));
  return current.filter((v) => !known.has(violationKey(v)));
}

export function buildBaselineSnapshot({ version, violations, generatedAt = new Date().toISOString() }) {
  return `${JSON.stringify({ tool: 'portafs', version, generatedAt, violations }, null, 2)}\n`;
}

export async function writeBaseline(file, snapshot) {
  await writeFile(file, snapshot, 'utf8');
}

export async function loadBaseline(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`cannot read baseline file "${file}": ${err.code ?? err.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`baseline file is not valid JSON: "${file}"`);
  }
  if (!data || !Array.isArray(data.violations)) {
    throw new Error(`not a portafs baseline file (expected a "violations" array): "${file}"`);
  }
  for (const entry of data.violations) {
    if (!entry || typeof entry.ruleId !== 'string' || typeof entry.path !== 'string') {
      throw new Error(`baseline file contains an invalid violation entry: "${file}"`);
    }
  }
  return data.violations;
}
