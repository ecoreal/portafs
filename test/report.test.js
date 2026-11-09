// Renderer tests: colored/plain human output and the JSON schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHuman, renderJson } from '../src/report.js';
import { RULES } from '../src/rules/index.js';

const base = {
  version: '0.1.0',
  target: '/tmp/example',
  mode: 'filesystem',
  pathCount: 3,
  rules: RULES,
  baseline: null,
};
const violation = (ruleId, p) => ({ ruleId, path: p, detail: 'detail text', hint: 'hint text' });

test('renderHuman groups violations under rule headers with hints', () => {
  const out = renderHuman({ ...base, violations: [violation('unicode', 'a.md'), violation('windows-reserved', 'aux.c')] });
  assert.ok(out.includes('portafs v0.1.0'));
  assert.ok(out.includes('mode: filesystem'));
  assert.ok(out.includes('paths: 3'));
  assert.ok(out.includes('hint: hint text'));
  assert.ok(out.includes('summary: 2 violation(s)'));
  // Sections appear in registry order.
  assert.ok(out.indexOf('windows-reserved') < out.indexOf('unicode'));
});

test('renderHuman has a clean summary when there are no violations', () => {
  const out = renderHuman({ ...base, violations: [] });
  assert.ok(out.includes('no violations found'));
  assert.ok(out.includes('summary: 0 violation(s)'));
});

test('renderHuman mentions the baseline when one is loaded', () => {
  const out = renderHuman({
    ...base,
    violations: [violation('unicode', 'a.md')],
    baseline: { file: 'b.json', known: 7 },
  });
  assert.ok(out.includes('baseline: b.json (known violations: 7)'));
  assert.ok(out.includes('summary: 1 new violation(s) (known in baseline: 7)'));
});

test('renderHuman emits ANSI only when color is enabled', () => {
  const plain = renderHuman({ ...base, violations: [violation('unicode', 'a.md')], color: false });
  assert.ok(!plain.includes('\u001b'));
  const colored = renderHuman({ ...base, violations: [violation('unicode', 'a.md')], color: true });
  assert.ok(colored.includes('\u001b[31m'));
});

test('renderJson produces a parseable report with the documented schema', () => {
  const out = renderJson({ ...base, violations: [violation('unicode', 'a.md')] });
  const report = JSON.parse(out);
  assert.equal(report.tool, 'portafs');
  assert.equal(report.version, '0.1.0');
  assert.equal(report.target, '/tmp/example');
  assert.equal(report.mode, 'filesystem');
  assert.equal(report.pathCount, 3);
  assert.equal(report.summary.violations, 1);
  assert.deepEqual(report.summary.byRule, { unicode: 1 });
  assert.equal(report.violations.length, 1);
  for (const key of ['ruleId', 'path', 'detail', 'hint']) {
    assert.equal(typeof report.violations[0][key], 'string');
  }
  assert.ok(!out.includes('\u001b'));
  assert.equal(report.baseline, undefined);
});

test('renderJson includes baseline info when present', () => {
  const report = JSON.parse(renderJson({
    ...base,
    violations: [],
    baseline: { file: 'b.json', known: 3 },
  }));
  assert.deepEqual(report.baseline, { file: 'b.json', known: 3 });
});
