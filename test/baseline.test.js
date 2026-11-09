// Baseline semantics: snapshot/diff are pure, plus a disk round-trip in tmpdir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BASELINE_FILE,
  buildBaselineSnapshot,
  diffAgainstBaseline,
  loadBaseline,
  violationKey,
  writeBaseline,
} from '../src/baseline.js';

const v = (ruleId, p, detail = 'detail') => ({ ruleId, path: p, detail, hint: 'hint' });

async function makeTempDir(t, prefix = 'portafs-baseline-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('diffAgainstBaseline reports only violations missing from the snapshot', () => {
  const snapshot = [v('unicode', 'a.md'), v('trailing', 'b ')];
  const current = [v('unicode', 'a.md'), v('trailing', 'c '), v('windows-reserved', 'aux.c')];
  assert.deepEqual(diffAgainstBaseline(current, snapshot).map((x) => x.path), ['c ', 'aux.c']);
});

test('the same path can be known under one rule and new under another', () => {
  const snapshot = [v('trailing', 'x ')];
  const current = [v('trailing', 'x '), v('unicode', 'x ')];
  assert.deepEqual(diffAgainstBaseline(current, snapshot).map((x) => x.ruleId), ['unicode']);
});

test('changed details do not resurrect a known violation', () => {
  const snapshot = [v('case-collision', 'A.md', 'differs only by letter case from: a.md')];
  const current = [v('case-collision', 'A.md', 'differs only by letter case from: a.md, a.MD')];
  assert.deepEqual(diffAgainstBaseline(current, snapshot), []);
});

test('baseline files round-trip through disk', async (t) => {
  const dir = await makeTempDir(t);
  const file = path.join(dir, DEFAULT_BASELINE_FILE);
  const violations = [v('trailing', 'x ', 'component ends with a space or a dot: "x "')];
  await writeBaseline(file, buildBaselineSnapshot({ version: '0.1.0', violations }));
  const loaded = await loadBaseline(file);
  assert.deepEqual(loaded, violations);
});

test('loadBaseline rejects missing and malformed files', async (t) => {
  const dir = await makeTempDir(t);
  await assert.rejects(() => loadBaseline(path.join(dir, 'missing.json')));
  const bad = path.join(dir, 'bad.json');
  await writeFile(bad, '{not json', 'utf8');
  await assert.rejects(() => loadBaseline(bad), /not valid JSON/);
  const wrong = path.join(dir, 'wrong.json');
  await writeFile(wrong, '{"nope": true}', 'utf8');
  await assert.rejects(() => loadBaseline(wrong), /expected a "violations" array/);
});

test('violationKey separates rule id and path', () => {
  assert.notEqual(violationKey(v('a', 'p')), violationKey(v('b', 'p')));
  assert.notEqual(violationKey(v('a', 'p')), violationKey(v('a', 'q')));
});
