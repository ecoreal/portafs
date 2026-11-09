// Rule unit tests. All five rules are pure functions, so the tests feed
// synthetic path lists directly — no files are created. That keeps this suite
// green on Windows runners too, where reserved names / trailing dots /
// case-colliding names cannot exist on disk at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rule as caseCollision } from '../src/rules/case-collision.js';
import { rule as windowsReserved } from '../src/rules/windows-reserved.js';
import { rule as trailing } from '../src/rules/trailing.js';
import { rule as pathLength, DEFAULT_MAX_LENGTH } from '../src/rules/path-length.js';
import { rule as unicodeRule } from '../src/rules/unicode.js';
import { RULES, RULE_IDS, runRules, selectRules } from '../src/rules/index.js';

const pathsOf = (violations) => violations.map((v) => v.path);

test('rule registry exposes the five built-in rules in a fixed order', () => {
  assert.deepEqual(RULE_IDS, ['case-collision', 'windows-reserved', 'trailing', 'path-length', 'unicode']);
  for (const rule of RULES) {
    assert.equal(typeof rule.id, 'string');
    assert.equal(typeof rule.description, 'string');
    assert.equal(typeof rule.hint, 'string');
    assert.equal(typeof rule.run, 'function');
  }
});

test('case-collision flags two names that differ only by letter case', () => {
  const violations = caseCollision.run(['README.md', 'readme.md', 'other.txt']);
  assert.deepEqual(pathsOf(violations), ['README.md', 'readme.md']);
  assert.ok(violations[0].detail.includes('readme.md'));
  assert.ok(violations[1].detail.includes('README.md'));
  for (const v of violations) {
    assert.equal(v.ruleId, 'case-collision');
    assert.ok(v.hint.length > 0);
  }
});

test('case-collision respects directory boundaries', () => {
  assert.deepEqual(caseCollision.run(['a/x.md', 'b/X.MD', 'c/y.md']), []);
});

test('case-collision flags directory names that differ only by case', () => {
  assert.deepEqual(pathsOf(caseCollision.run(['Docs', 'docs'])), ['Docs', 'docs']);
});

test('case-collision compares full paths, so nested twins collide', () => {
  assert.deepEqual(pathsOf(caseCollision.run(['Docs/g.md', 'docs/G.md'])), ['Docs/g.md', 'docs/G.md']);
});

test('case-collision normalizes to NFC before comparing', () => {
  assert.equal(caseCollision.run(['caf\u00e9.md', 'Cafe\u0301.MD']).length, 2);
});

test('case-collision ignores duplicate identical paths', () => {
  assert.deepEqual(caseCollision.run(['a.md', 'a.md']), []);
});

test('windows-reserved flags device names with and without extensions', () => {
  const violations = windowsReserved.run(['aux.c', 'CON', 'com1.txt', 'Lpt9.log']);
  assert.deepEqual(pathsOf(violations), ['aux.c', 'CON', 'com1.txt', 'Lpt9.log']);
  assert.ok(violations[0].detail.includes('aux.c'));
  for (const v of violations) assert.equal(v.ruleId, 'windows-reserved');
});

test('windows-reserved checks every path component', () => {
  assert.deepEqual(pathsOf(windowsReserved.run(['docs/aux/notes.txt'])), ['docs/aux/notes.txt']);
  assert.deepEqual(windowsReserved.run(['docs/design/notes.txt']), []);
});

test('windows-reserved ignores similar but allowed names', () => {
  assert.deepEqual(windowsReserved.run(['auxiliary.js', 'control.md', 'com10.txt', 'lpt0', '.con', 'nullify.ts']), []);
});

test('trailing flags names ending with a space or a dot in any component', () => {
  const violations = trailing.run(['x ', 'y.', 'ok.md', 'dir /f.md', 'dir ', 'nested/name ']);
  assert.deepEqual(pathsOf(violations), ['x ', 'y.', 'dir /f.md', 'dir ', 'nested/name ']);
  assert.ok(violations[0].detail.includes('"x "'));
});

test('trailing allows spaces and dots elsewhere in the name', () => {
  assert.deepEqual(trailing.run(['my file.md', 'v1.0.0.tar.gz', 'a/b.c.txt']), []);
});

test('path-length flags paths strictly longer than the default limit of 260', () => {
  assert.equal(DEFAULT_MAX_LENGTH, 260);
  const short = 'a'.repeat(260);
  const long = 'b'.repeat(261);
  assert.deepEqual(pathsOf(pathLength.run([short, long, 'ok.md'])), [long]);
  const [violation] = pathLength.run([long]);
  assert.equal(violation.ruleId, 'path-length');
  assert.ok(violation.detail.includes('261'));
  assert.ok(violation.detail.includes('260'));
});

test('path-length honors a custom limit from options', () => {
  assert.deepEqual(pathsOf(pathLength.run(['abcdefghij', 'abcdefghijk'], { maxLength: 10 })), ['abcdefghijk']);
});

test('unicode flags NFC/NFD pairs in the same directory', () => {
  const nfc = 'caf\u00e9.md';
  const nfd = 'cafe\u0301.md';
  const violations = unicodeRule.run([nfc, nfd, 'plain.md']);
  assert.deepEqual(pathsOf(violations), [nfc, nfd]);
  for (const v of violations) assert.equal(v.ruleId, 'unicode');
});

test('unicode ignores canonically equivalent names in different directories', () => {
  assert.deepEqual(unicodeRule.run(['a/caf\u00e9.md', 'b/cafe\u0301.md']), []);
});

test('unicode ignores plain ASCII names', () => {
  assert.deepEqual(unicodeRule.run(['a.md', 'b.md', 'A.MD']), []);
});

test('runRules aggregates violations from all selected rules', () => {
  const violations = runRules(['readme.md', 'README.md', 'aux.c']);
  assert.ok(violations.some((v) => v.ruleId === 'case-collision'));
  assert.ok(violations.some((v) => v.ruleId === 'windows-reserved'));
  assert.deepEqual(violations.filter((v) => v.path === 'aux.c').length, 1);
});

test('runRules honors rules and ignored options', () => {
  const paths = ['readme.md', 'README.md', 'aux.c'];
  assert.ok(runRules(paths, { rules: ['windows-reserved'] }).every((v) => v.ruleId === 'windows-reserved'));
  assert.ok(runRules(paths, { ignored: ['windows-reserved'] }).every((v) => v.ruleId !== 'windows-reserved'));
  assert.deepEqual(runRules(paths, { rules: ['windows-reserved'], ignored: ['windows-reserved'] }), []);
});

test('runRules passes options through to rules (maxLength)', () => {
  const violations = runRules(['ok.md'], { maxLength: 2 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].ruleId, 'path-length');
});

test('selectRules ignores unknown ids instead of failing (the CLI validates)', () => {
  assert.deepEqual(selectRules({ rules: ['nope'] }), []);
});
