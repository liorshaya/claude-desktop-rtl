'use strict';
// engine/__tests__/arrow-direction.test.js — an arrow's flip is decided by its LOCAL context
// (its nearest strong neighbours), NOT by the block's majority language. An arrow flanked by
// Latin already points at its target on the right and must NEVER flip — even inside a Hebrew
// sentence ("…input → output ואז…"): the English phrase is read left-to-right as its own run.
// A Hebrew-flanked arrow flips toward the (leftward) target; numbers count as RTL (UBA N1); a
// math-delimited arrow never flips. The DOM rule is modelled here as
//   resolvedDir(block) === 'rtl'  ?  flip(arrowFlipOffsets)  :  keep
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvedDir, arrowFlipOffsets } = require('../index.js');

// the arrow glyphs that ACTUALLY flip in the rendered block
const flipsIn = (t) => (resolvedDir(t) === 'rtl' ? arrowFlipOffsets(t).map((i) => t[i]) : []);

// ══════ THE HEADLINE CASE: an English→English arrow that continues into Hebrew ══════
test('EN→EN arrow then Hebrew text: the arrow keeps pointing RIGHT (must not flip)', () => {
  assert.deepEqual(flipsIn('input → output ואז התהליך נמשך'), []);
  assert.deepEqual(flipsIn('the value A → B ואז ממשיכים בעברית'), []);
  assert.deepEqual(flipsIn('map x → y ולאחר מכן נחזיר'), []);
  assert.deepEqual(flipsIn('start → end והכל עובד כמו שצריך'), []);
  assert.deepEqual(flipsIn('הקלט a → output הוא הפלט'), []);   // arrow between a and output (both Latin)
});

// ══════ Latin-flanked arrows never flip — in either language ══════
test('Latin-flanked arrows keep the English direction (no flip)', () => {
  assert.deepEqual(flipsIn('A → B'), []);
  assert.deepEqual(flipsIn('input → output'), []);
  assert.deepEqual(flipsIn('start → middle → end'), []);
  assert.deepEqual(flipsIn('cause ⇒ effect'), []);
  assert.deepEqual(flipsIn('x ↦ y'), []);
  assert.deepEqual(flipsIn('the map f: X → Y here'), []);
  assert.deepEqual(flipsIn('הפונקציה f → g מעתיקה'), []);     // Latin-flanked, inside Hebrew
  assert.deepEqual(flipsIn('המיפוי x ↦ y כאן'), []);
});

// ══════ Hebrew-flanked arrows flip toward the (leftward) target ══════
test('Hebrew-flanked arrows flip', () => {
  assert.deepEqual(flipsIn('א → ב'), ['→']);
  assert.deepEqual(flipsIn('הקלט → הפלט'), ['→']);
  assert.deepEqual(flipsIn('סיבה → תוצאה'), ['→']);
  assert.deepEqual(flipsIn('שלב א → שלב ב → סוף'), ['→', '→']);
  assert.deepEqual(flipsIn('הזרימה קלט → פלט מהירה'), ['→']);
  assert.deepEqual(flipsIn('ראשון ⟶ שני ⟶ שלישי'), ['⟶', '⟶']);
  assert.deepEqual(flipsIn('צעד ➜ צעד ➜ סיום'), ['➜', '➜']);
  assert.deepEqual(flipsIn('פלט ⇐ קלט'), ['⇐']);
});

// ══════ number-flanked arrows flip in an RTL block (UBA N1: numbers act as R) ══════
test('number-flanked arrows flip inside an RTL block', () => {
  assert.deepEqual(flipsIn('מ-5 → 10 מעלות חום'), ['→']);
  assert.deepEqual(flipsIn('ירידה 100 → 50 אחוז'), ['→']);
  assert.deepEqual(flipsIn('המחיר $5 → $10 עלה'), ['→']);
});

// ══════ mixed-flanked arrows (a Hebrew side) flip with the RTL block ══════
test('mixed-flanked arrows (one Hebrew side) flip in an RTL block', () => {
  assert.deepEqual(flipsIn('הקלט a → הפלט b'), ['→']);            // a(L) → ה(R)
  assert.deepEqual(flipsIn('input → הפלט הסופי כאן הוא'), ['→']); // t(L) → ה(R)
});

// ══════ majority-English line: nothing flips (LTR block) ══════
test('a majority-English line never flips (LTR block)', () => {
  assert.deepEqual(flipsIn('input → output (קלט)'), []);
  assert.deepEqual(flipsIn('compute a → b now'), []);
  assert.deepEqual(flipsIn('A ⇒ B ⇒ C'), []);
});

// ══════ math-run arrows never flip, in either language ══════
test('math-run arrows never flip, in either language', () => {
  assert.deepEqual(flipsIn('הנוסחה \\(a → b\\) כאן'), []);
  assert.deepEqual(flipsIn('the rule \\(a → b\\) holds'), []);
  assert.deepEqual(flipsIn('$x^2 → y$ הוא הביטוי'), []);
  assert.deepEqual(flipsIn('המעבר $a \\to b$ מהיר'), []);
});

// ══════ no arrow / empty → never a flip ══════
test('lines without a flipping arrow', () => {
  assert.deepEqual(flipsIn('שלום עולם'), []);
  assert.deepEqual(flipsIn('hello world'), []);
  assert.deepEqual(flipsIn('הערך 3 < 5 קטן'), []);
  assert.deepEqual(flipsIn(''), []);
});
