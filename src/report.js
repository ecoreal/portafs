// Output renderers. renderHuman is the colored terminal report; renderJson is
// the machine-readable one. Both are pure string builders — the CLI owns the
// streams — so tests can assert on them directly.

function makePaint(enabled) {
  if (!enabled) {
    const plain = (text) => text;
    return { red: plain, green: plain, yellow: plain, bold: plain, dim: plain };
  }
  const paint = (code) => (text) => `\u001B[${code}m${text}\u001B[0m`;
  return { red: paint(31), green: paint(32), yellow: paint(33), bold: paint(1), dim: paint(2) };
}

export function renderHuman({ version, target, mode, pathCount, violations, rules, baseline, color }) {
  const c = makePaint(color);
  const byRule = new Map();
  for (const v of violations) {
    const list = byRule.get(v.ruleId);
    if (list) list.push(v);
    else byRule.set(v.ruleId, [v]);
  }
  // Sections follow the registry order; unknown rule ids (defensive) last.
  const ordered = rules.map((r) => r.id).filter((id) => byRule.has(id));
  for (const id of byRule.keys()) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  const lines = [];
  lines.push(`portafs v${version} — cross-platform filename audit`);
  lines.push(`target: ${target}`);
  lines.push(`mode: ${mode}`);
  lines.push(`paths: ${pathCount}`);
  if (baseline) lines.push(`baseline: ${baseline.file} (known violations: ${baseline.known})`);
  lines.push('');
  if (violations.length === 0) {
    lines.push(baseline ? 'no new violations beyond the baseline.' : 'no violations found.');
  }
  for (const id of ordered) {
    const meta = rules.find((r) => r.id === id);
    const list = byRule.get(id);
    lines.push('');
    lines.push(c.red(`${id} (${list.length})${meta ? ` — ${meta.description}` : ''}`));
    for (const v of list) {
      lines.push(c.bold(`  ${v.path}`));
      lines.push(c.dim(`    ${v.detail}`));
      lines.push(c.yellow(`    hint: ${v.hint}`));
    }
  }
  lines.push('');
  // "new violation(s)" wording only makes sense relative to a baseline.
  const summary = baseline
    ? `summary: ${violations.length} new violation(s) (known in baseline: ${baseline.known})`
    : `summary: ${violations.length} violation(s) across ${ordered.length} rule(s) in ${pathCount} path(s)`;
  lines.push(violations.length > 0 ? c.red(summary) : c.green(summary));
  return `${lines.join('\n')}\n`;
}

export function renderJson({ version, target, mode, pathCount, violations, baseline }) {
  const byRule = {};
  for (const v of violations) byRule[v.ruleId] = (byRule[v.ruleId] ?? 0) + 1;
  const report = {
    tool: 'portafs',
    version,
    target,
    mode,
    pathCount,
    summary: { violations: violations.length, byRule },
    // Each violation carries exactly the documented fields.
    violations: violations.map(({ ruleId, path, detail, hint }) => ({ ruleId, path, detail, hint })),
  };
  if (baseline) report.baseline = baseline;
  return `${JSON.stringify(report, null, 2)}\n`;
}
