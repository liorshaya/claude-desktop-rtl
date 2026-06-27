'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirrorArrow, hasMirrorArrow, arrowFlipOffsets } = require('../arrows.js');

const cp = (s) => s.codePointAt(0);

test('isMirrorArrow: arrows true, letters/digits/Hebrew false', () => {
  for (const a of ['→', '←', '⇒', '⇐', '↔', '⟶', '⟵', '➜', '➔', '➡', '⬅']) {
    assert.equal(isMirrorArrow(cp(a)), true, a);
  }
  for (const x of ['a', 'A', '5', 'א', '.', ' ', '°']) {
    assert.equal(isMirrorArrow(cp(x)), false, x);
  }
});

test('hasMirrorArrow', () => {
  assert.equal(hasMirrorArrow('תה ירוק → 75°C'), true);
  assert.equal(hasMirrorArrow('no arrows here'), false);
  assert.equal(hasMirrorArrow(''), false);
});

test('arrowFlipOffsets: prose arrows flip', () => {
  // Bare prose arrow → its UTF-16 offset is returned (the DOM wraps+flips only these).
  assert.deepEqual(arrowFlipOffsets('a → b'), [2]);
  assert.deepEqual(arrowFlipOffsets('תה ירוק → 75°C'), [8]);
  assert.deepEqual(arrowFlipOffsets('no arrows'), []);
  assert.deepEqual(arrowFlipOffsets(''), []);
});

test('arrowFlipOffsets: arrows INSIDE a math run never flip (LTR math semantics)', () => {
  // `$x^2 → y$` is math (has a LaTeX signal) — its literal arrow keeps its LTR meaning.
  assert.deepEqual(arrowFlipOffsets('$x^2 → y$'), []);
  // a גורר b — `$a \implies b$` renders an arrow; raw text has no glyph, so nothing to flip.
  assert.deepEqual(arrowFlipOffsets('$a \\implies b$'), []);
});

test('arrowFlipOffsets: prose arrows flip, math arrows skipped, in one string', () => {
  // '→ $a^2 → b$ →' → prose arrows at 0 and 12 flip; the middle arrow (idx 7) is in math.
  assert.deepEqual(arrowFlipOffsets('→ $a^2 → b$ →'), [0, 12]);
});

test('arrowFlipOffsets: currency is not math, so its arrows still flip', () => {
  // `$5 → $10` has no LaTeX signal → currency/text → the arrow is prose and flips.
  assert.deepEqual(arrowFlipOffsets('$5 → $10'), [3]);
});

// the arrow glyphs arrowFlipOffsets says to flip (readable view of the offsets)
const flipped = (t) => arrowFlipOffsets(t).map((i) => t[i]);

test('isMirrorArrow: simple / double / long / mapsto / harpoon / dingbat / heavy blocks', () => {
  for (const a of ['→', '←', '↔', '⇒', '⇐', '⇔', '⟶', '⟵', '⟸', '⟹', '↦', '⟼',
    '⇄', '⇆', '⇨', '⇦', '➜', '➔', '➡', '⬅', '⬆', '⬇', '⮕', '↑', '↓', '↗', '↘', '↖', '↙']) {
    assert.equal(isMirrorArrow(cp(a)), true, a);
  }
});

test('arrowFlipOffsets: many prose arrow TYPES flip — Hebrew & English', () => {
  assert.deepEqual(flipped('a → b → c'), ['→', '→']);
  assert.deepEqual(flipped('א ← ב ← ג'), ['←', '←']);
  assert.deepEqual(flipped('input ⇒ output'), ['⇒']);
  assert.deepEqual(flipped('x ↦ y'), ['↦']);
  assert.deepEqual(flipped('שלב 1 ➜ שלב 2 ➔ סוף'), ['➜', '➔']);
  assert.deepEqual(flipped('p ⟹ q ⟸ r'), ['⟹', '⟸']);
  assert.deepEqual(flipped('A ⇄ B'), ['⇄']);
});

test('arrowFlipOffsets: vertical/diagonal arrows are in range (flip is no-op or correct)', () => {
  // ↑↓ flip to themselves; ↗↘ flip to their RTL counterparts — spanning whole blocks is safe.
  assert.deepEqual(flipped('↑ ↓ ↗ ↘'), ['↑', '↓', '↗', '↘']);
});

test('arrowFlipOffsets: math-delimited arrows never flip — every delimiter', () => {
  assert.deepEqual(arrowFlipOffsets('\\(a → b\\)'), []);
  assert.deepEqual(arrowFlipOffsets('\\[a → b\\]'), []);
  assert.deepEqual(arrowFlipOffsets('$$a → b$$'), []);
  assert.deepEqual(arrowFlipOffsets('$x^2 → y$'), []);            // single $ WITH a LaTeX signal
  assert.deepEqual(arrowFlipOffsets('הסבר \\(f → g\\) כאן'), []);  // math run inside Hebrew
  assert.deepEqual(arrowFlipOffsets('the map \\(X → Y\\) is'), []); // math run inside English
});

test('arrowFlipOffsets: a single $…$ with NO LaTeX signal is text → its arrow flips', () => {
  assert.deepEqual(flipped('$f: A → B$'), ['→']);   // no \, ^, _, {} → not math
  assert.deepEqual(flipped('$5 → $10'), ['→']);      // currency
});

test('arrowFlipOffsets: prose arrows flip and the math arrow is skipped, one mixed line', () => {
  assert.deepEqual(flipped('א → ב $x^2 → y$ ג → ד'), ['→', '→']); // middle arrow is in math
  assert.deepEqual(flipped('a → b \\(c → d\\) e → f'), ['→', '→']);
});

test('arrowFlipOffsets: exact offsets, astral-safe', () => {
  assert.deepEqual(arrowFlipOffsets('a → b'), [2]);
  const t = '😀 a → b'; // an astral emoji shifts the index by 2 UTF-16 units
  assert.deepEqual(arrowFlipOffsets(t), [t.indexOf('→')]);
});
