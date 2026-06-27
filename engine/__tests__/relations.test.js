'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirroredMathRel, hasMirroredMathRel, relationRuns } = require('../relations.js');

const cp = (s) => s.codePointAt(0);
// the substrings relationRuns says to isolate (readable view of the [start,end) ranges)
const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

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

// ── relationRuns: isolate the WHOLE comparison expression (operators + operands + chains) ──
// Per-symbol isolation was measured insufficient: it un-mirrors the glyph but RTL still swaps
// the operands ("3 < 5" → "5 < 3"). Isolating the maximal `TERM (REL TERM)+` run keeps the
// whole comparison at one even embedding level, so it reads left-to-right correctly.

test('relationRuns: a single comparison grows to its two operands', () => {
  assert.deepEqual(relationRuns('3 < 5'), [[0, 5]]);
  assert.deepEqual(runs('3 < 5'), ['3 < 5']);
  assert.deepEqual(runs('7 > 2'), ['7 > 2']);
  assert.deepEqual(runs('a < b'), ['a < b']);
  assert.deepEqual(runs('x<y'), ['x<y']);           // no spaces
  assert.deepEqual(runs('3 ≤ 5'), ['3 ≤ 5']);
});

test('relationRuns: the headline case — a chained / mixed-operator inequality is ONE run', () => {
  assert.deepEqual(runs('0 < x ≤ 4'), ['0 < x ≤ 4']);       // the ticket's exact expression
  assert.deepEqual(runs('a < b < c'), ['a < b < c']);
  assert.deepEqual(runs('1 ≤ n ≤ 100'), ['1 ≤ n ≤ 100']);
  assert.deepEqual(runs('x < y > z'), ['x < y > z']);       // two seeds merge into one chain
  assert.deepEqual(runs('0 ≤ x = y'), ['0 ≤ x = y']);       // `=` chains (not a seed on its own)
  // inside a Hebrew sentence: only the expression is wrapped, the prose is untouched
  assert.deepEqual(runs('התחום 0 < x ≤ 4 נכון'), ['0 < x ≤ 4']);
});

test('relationRuns: negative-number operands keep their sign inside the run', () => {
  assert.deepEqual(runs('-5 < x'), ['-5 < x']);
  assert.deepEqual(runs('x < -5'), ['x < -5']);
  assert.deepEqual(runs('-5 < x < -1'), ['-5 < x < -1']);
  assert.deepEqual(runs('−3 ≤ y'), ['−3 ≤ y']);              // U+2212 minus
  // the Hebrew prefix look-alike: "-" after a letter is NOT pulled in as a sign
  assert.deepEqual(runs('ש-3 < 5'), ['3 < 5']);
});

test('relationRuns: set / order relations grow over their operands (incl. ℕ ℤ ℝ)', () => {
  assert.deepEqual(runs('x ∈ S'), ['x ∈ S']);
  assert.deepEqual(runs('A ⊂ B'), ['A ⊂ B']);
  assert.deepEqual(runs('ℕ ⊂ ℤ'), ['ℕ ⊂ ℤ']);              // Letterlike operands
  assert.deepEqual(runs('a ≠ b ≈ c'), ['a ≠ b ≈ c']);       // chained ≠ ≈
  assert.deepEqual(runs('π ≥ 3'), ['π ≥ 3']);               // Greek operand
});

test('relationRuns: a decimal point stays in the number, a sentence period does NOT', () => {
  assert.deepEqual(runs('3.14 < π'), ['3.14 < π']);       // internal decimal kept
  assert.deepEqual(runs('0.5 ≤ x ≤ 1.5'), ['0.5 ≤ x ≤ 1.5']);
  assert.deepEqual(runs('7 > 2.'), ['7 > 2']);             // trailing period NOT swallowed
  assert.deepEqual(runs('x ≥ 0. ראה'), ['x ≥ 0']);         // period before Hebrew prose
});

test('relationRuns: HTML-tag < > are NOT isolated (left to UBA)', () => {
  assert.deepEqual(relationRuns('<div>'), []);
  assert.deepEqual(relationRuns('</div>'), []);
  assert.deepEqual(relationRuns('<br/>'), []);
  assert.deepEqual(relationRuns('<a href="x">'), []);
  assert.deepEqual(relationRuns('השתמש ב-<div> כאן'), []);
  assert.deepEqual(relationRuns('<p>טקסט</p>'), []); // open + close tag → all brackets left
});

test('relationRuns: tag detection needs an immediate letter/slash + a closing >', () => {
  // not a tag → still a comparison → isolate (and grow to operands)
  assert.deepEqual(runs('a<b'), ['a<b']);    // no closing >
  assert.deepEqual(runs('< 3'), ['< 3']);    // space after < (not a tag name); no left operand
  assert.deepEqual(runs('<3'), ['<3']);      // digit after < (not a tag name)
  assert.deepEqual(runs('value <'), ['value <']); // trailing <, no right operand
});

test('relationRuns: a real comparison and an HTML tag coexisting in one string', () => {
  assert.deepEqual(runs('3 < 5 and <div>'), ['3 < 5']);       // bare < grows; <div> dropped
  assert.deepEqual(runs('List<int> ו-3 < 5'), ['3 < 5']);     // generics tag dropped
  assert.deepEqual(runs('<div> ≤ כאן'), ['≤']);                // tag dropped; lone ≤ (no operands)
  assert.deepEqual(runs('ש-2 ∈ <span>'), ['2 ∈']);            // operand left, tag right → run stops at tag
  assert.deepEqual(runs('בקוד כתבנו <button> וגם ש-a < b.'), ['a < b']);
});

test('relationRuns: a lone relation between two non-operands stays a single char', () => {
  assert.deepEqual(runs('הסימן < מציין קטן מ'), ['<']);   // Hebrew both sides → no operand to grow
  assert.deepEqual(runs('כאן ∈ שייכות'), ['∈']);
});

test('relationRuns: plain words after the expression are NOT swallowed (needs a connector)', () => {
  assert.deepEqual(runs('3 < 5 and more'), ['3 < 5']);  // "and"/"more" follow with no connector
  assert.deepEqual(runs('x > 0 therefore'), ['x > 0']);
});

test('relationRuns: brackets / symmetric ops / arrows are never isolated; empty/none → []', () => {
  assert.deepEqual(relationRuns('f(3) = 5'), []);   // () + = → no mirrored seed
  assert.deepEqual(relationRuns('[a] {b}'), []);     // brackets → none
  assert.deepEqual(relationRuns('a → b ↔ c'), []);   // arrows → none (handled elsewhere)
  assert.deepEqual(relationRuns('שלום עולם'), []);
  assert.deepEqual(relationRuns(''), []);
});

test('relationRuns: offsets are correct UTF-16 ranges, astral-safe', () => {
  // an emoji (astral, 2 code units) before the comparison shifts the indices by 2
  const t = '😀 3 < 5';
  assert.deepEqual(relationRuns(t), [[t.indexOf('3'), t.length]]);
  assert.deepEqual(runs(t), ['3 < 5']);
});

test('relationRuns: English (LTR) comparisons are detected the same — isolation is a no-op there', () => {
  // In an LTR block these already read correctly; the engine still returns the run (the DOM
  // isolates it LTR, which changes nothing visually) — so English stays correct, never flipped.
  assert.deepEqual(runs('if 3 < 5 then'), ['3 < 5']);
  assert.deepEqual(runs('for i in 0 ≤ i < n loop'), ['0 ≤ i < n']);
  assert.deepEqual(runs('x > 0 and y ≤ 10'), ['x > 0', 'y ≤ 10']); // "and" breaks the chain → two
  assert.deepEqual(runs('the set ℝ ⊃ ℚ holds'), ['ℝ ⊃ ℚ']);
  assert.deepEqual(runs('assert a ≠ b'), ['a ≠ b']);
  assert.deepEqual(runs('no math here at all'), []);
});

test('relationRuns: realistic Hebrew prose lines', () => {
  assert.deepEqual(runs('סוגר זוויתי: השתמש ב-<div> כאן.'), []);          // tag only → nothing
  assert.deepEqual(runs('ברור ש-3 < 5, וגם 7 > 2.'), ['3 < 5', '7 > 2']); // two comparisons
  assert.deepEqual(runs('הקבוצה ℕ ⊂ ℤ והאיבר x ∈ S.'), ['ℕ ⊂ ℤ', 'x ∈ S']); // set relations
  assert.deepEqual(runs('נתון ש-0 < x ≤ 4 לכל x.'), ['0 < x ≤ 4']);        // chained, in prose
});
