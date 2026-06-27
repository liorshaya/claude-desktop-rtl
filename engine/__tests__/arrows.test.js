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
