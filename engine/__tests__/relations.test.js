'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirroredMathRel, hasMirroredMathRel } = require('../relations.js');

const cp = (s) => s.codePointAt(0);

test('isMirroredMathRel: true for Bidi_Mirrored math relations (UBA mirrors these in RTL)', () => {
  // comparison + set/order relations — all General_Category Sm AND Bidi_Mirrored=Yes
  for (const ch of ['<', '>', '≤', '≥', '≪', '≫', '≮', '≯', '≲', '≳',
    '∈', '∋', '∉', '∌', '⊂', '⊃', '⊆', '⊇', '⊊', '⊋', '≺', '≻', '⪯', '⪰',
    '≠', '≈', '≅']) {
    assert.equal(isMirroredMathRel(cp(ch)), true, ch);
  }
});

test('isMirroredMathRel: false for brackets (their RTL mirroring is CORRECT — leave to UBA)', () => {
  for (const ch of ['(', ')', '[', ']', '{', '}', '⟨', '⟩']) {
    assert.equal(isMirroredMathRel(cp(ch)), false, ch);
  }
});

test('isMirroredMathRel: false for symmetric ops, arrows, and non-symbols', () => {
  // symmetric math ops are not Bidi_Mirrored → never mis-rendered
  for (const ch of ['=', '≡', '±', '∓', '×', '÷', '∗', '·', '+', '|']) {
    assert.equal(isMirroredMathRel(cp(ch)), false, ch);
  }
  // arrows are NOT Bidi_Mirrored (the DOM flips them separately); never isolate them here
  for (const ch of ['→', '←', '⇒', '⇐', '↔', '⟶']) {
    assert.equal(isMirroredMathRel(cp(ch)), false, ch);
  }
  // letters, digits, Hebrew, punctuation, space
  for (const ch of ['a', 'A', 'x', 'ℕ', 'ℤ', '5', 'א', '.', ' ', '%']) {
    assert.equal(isMirroredMathRel(cp(ch)), false, ch);
  }
});

test('hasMirroredMathRel', () => {
  assert.equal(hasMirroredMathRel('ברור ש-3 < 5'), true);
  assert.equal(hasMirroredMathRel('והאיבר x ∈ S'), true);
  assert.equal(hasMirroredMathRel('f(3) = 5'), false); // brackets + symmetric only
  assert.equal(hasMirroredMathRel('הטמפרטורה 75°C'), false);
  assert.equal(hasMirroredMathRel(''), false);
});
