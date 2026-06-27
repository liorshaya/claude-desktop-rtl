'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirroredMathRel, hasMirroredMathRel, relationOffsets } = require('../relations.js');

const cp = (s) => s.codePointAt(0);
// the actual characters relationOffsets says to isolate (readable view of the offsets)
const isolated = (t) => relationOffsets(t).map((i) => t[i]);

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

// ── relationOffsets: which < > ≤ … to isolate, EXCLUDING HTML-tag brackets ──────────────

test('relationOffsets: comparison < and > ARE isolated', () => {
  assert.deepEqual(relationOffsets('3 < 5'), [2]);
  assert.deepEqual(isolated('3 < 5'), ['<']);
  assert.deepEqual(isolated('7 > 2'), ['>']);
  assert.deepEqual(isolated('x < y > z'), ['<', '>']); // spaces → both are comparisons
  assert.deepEqual(isolated('a < b'), ['<']);
});

test('relationOffsets: HTML-tag < > are NOT isolated (left to UBA)', () => {
  assert.deepEqual(relationOffsets('<div>'), []);
  assert.deepEqual(relationOffsets('</div>'), []);
  assert.deepEqual(relationOffsets('<br/>'), []);
  assert.deepEqual(relationOffsets('<a href="x">'), []);
  assert.deepEqual(relationOffsets('השתמש ב-<div> כאן'), []);
  assert.deepEqual(relationOffsets('<p>טקסט</p>'), []); // open + close tag → all brackets left
});

test('relationOffsets: tag detection needs an immediate letter/slash + a closing >', () => {
  // not a tag → still a comparison → isolate
  assert.deepEqual(isolated('a<b'), ['<']);   // no closing >
  assert.deepEqual(isolated('< 3'), ['<']);   // space after < (not a tag name)
  assert.deepEqual(isolated('<3'), ['<']);    // digit after < (not a tag name)
  assert.deepEqual(isolated('value <'), ['<']); // trailing <
});

test('relationOffsets: mixed comparison + tag in one string', () => {
  // "3 < 5 and <div>": the bare < is a comparison (isolate), the <div> brackets are a tag (leave)
  assert.deepEqual(isolated('3 < 5 and <div>'), ['<']);
  // generics-like List<int> is treated as a tag run (leave); the real comparison still isolates
  assert.deepEqual(isolated('List<int> ו-3 < 5'), ['<']);
});

test('relationOffsets: unambiguous relations (≤ ≥ ∈ ⊂ …) always isolate, never tag-filtered', () => {
  assert.deepEqual(isolated('3 ≤ 5'), ['≤']);
  assert.deepEqual(isolated('x ∈ S'), ['∈']);
  assert.deepEqual(isolated('A ⊂ B'), ['⊂']);
  assert.deepEqual(isolated('a ≠ b ≈ c'), ['≠', '≈']);
  // a tag next to a real relation: tag brackets dropped, the relation kept
  assert.deepEqual(isolated('<div> ≤ כאן'), ['≤']);
  assert.deepEqual(isolated('ש-2 ∈ <span>'), ['∈']);
});

test('relationOffsets: brackets/symmetric/arrows never isolated; empty/none → []', () => {
  assert.deepEqual(relationOffsets('f(3) = 5'), []);   // () + = → none
  assert.deepEqual(relationOffsets('[a] {b}'), []);     // brackets → none
  assert.deepEqual(relationOffsets('a → b ↔ c'), []);   // arrows → none (handled elsewhere)
  assert.deepEqual(relationOffsets('שלום עולם'), []);
  assert.deepEqual(relationOffsets(''), []);
});

test('relationOffsets: offsets are correct UTF-16 indices, astral-safe', () => {
  // an emoji (astral, 2 code units) before the comparison shifts the index by 2
  const t = '😀 3 < 5';
  assert.deepEqual(relationOffsets(t), [t.indexOf('<')]);
  assert.deepEqual(isolated(t), ['<']);
});

test('relationOffsets: realistic Hebrew prose lines', () => {
  assert.deepEqual(isolated('סוגר זוויתי: השתמש ב-<div> כאן.'), []);          // tag only → nothing isolated
  assert.deepEqual(isolated('ברור ש-3 < 5, וגם 7 > 2.'), ['<', '>']);         // two comparisons
  assert.deepEqual(isolated('הקבוצה ℕ ⊂ ℤ והאיבר x ∈ S.'), ['⊂', '∈']);       // set relations
  assert.deepEqual(isolated('בקוד כתבנו <button> וגם בדקנו ש-a < b.'), ['<']); // tag dropped, comparison kept
});
