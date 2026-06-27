'use strict';
// engine/__tests__/arrow-direction.test.js — does a prose arrow point the way Claude MEANT it?
// Claude writes "→" for "leads to / maps to" in READING order. In English (LTR) that already
// points at the target on the right, so it must NOT flip. In Hebrew (RTL) the target is on the
// LEFT, so the glyph must flip (CSS scaleX(-1)) to point left. The DOM decides per block:
//   resolvedDir(block) === 'rtl'  ?  flip(arrowFlipOffsets)  :  keep
// modelled here over the two pure engine functions, with MANY lines per language. A DOM
// screenshot/transform check confirms the real glyphs (EN: no flip; HE: matrix(-1,…)).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvedDir, arrowFlipOffsets } = require('../index.js');

// the arrow glyphs that ACTUALLY flip in the rendered block (empty when the block is LTR)
const flipsIn = (t) => (resolvedDir(t) === 'rtl' ? arrowFlipOffsets(t).map((i) => t[i]) : []);

// ───────────── English (LTR): arrows keep pointing right, exactly as written ─────────────
test('EN: a single arrow never flips — it already points at the target', () => {
  assert.deepEqual(flipsIn('A → B'), []);
  assert.deepEqual(flipsIn('input → output'), []);
  assert.deepEqual(flipsIn('cause → effect'), []);
  assert.deepEqual(flipsIn('the map f → g sends'), []);
  assert.deepEqual(flipsIn('x ↦ y'), []);
  assert.deepEqual(flipsIn('north ↑ up'), []);
});
test('EN: arrow chains and double/long/dingbat arrows never flip', () => {
  assert.deepEqual(flipsIn('start → middle → end'), []);
  assert.deepEqual(flipsIn('A ⇒ B ⇒ C'), []);
  assert.deepEqual(flipsIn('process: A ⟶ B ⟶ C'), []);
  assert.deepEqual(flipsIn('step ➜ step ➜ done'), []);
  assert.deepEqual(flipsIn('if p then p → q'), []);
  assert.deepEqual(flipsIn('reduces 5 → 4 → 3 → 0'), []);
});
test('EN: back-arrows and bidirectional arrows stay exactly as written', () => {
  assert.deepEqual(flipsIn('B ← A'), []);
  assert.deepEqual(flipsIn('a ↔ b'), []);
  assert.deepEqual(flipsIn('left ⇐ right'), []);
  assert.deepEqual(flipsIn('x ⇄ y'), []);
});

// ───────────── Hebrew (RTL): arrows flip to point at the target (leftward) ─────────────
test('HE: a single prose arrow flips', () => {
  assert.deepEqual(flipsIn('א → ב'), ['→']);
  assert.deepEqual(flipsIn('הקלט → הפלט'), ['→']);
  assert.deepEqual(flipsIn('סיבה → תוצאה'), ['→']);
  assert.deepEqual(flipsIn('הפונקציה f → g מעתיקה'), ['→']);
  assert.deepEqual(flipsIn('מעלה ↑ למעלה'), ['↑']);
});
test('HE: arrow chains and double/long/dingbat arrows flip', () => {
  assert.deepEqual(flipsIn('שלב א → שלב ב → סוף'), ['→', '→']);
  assert.deepEqual(flipsIn('תהליך: א ⇒ ב ⇒ ג'), ['⇒', '⇒']);
  assert.deepEqual(flipsIn('ראשון ⟶ שני ⟶ שלישי'), ['⟶', '⟶']);
  assert.deepEqual(flipsIn('צעד ➜ צעד ➜ סיום'), ['➜', '➜']);
  assert.deepEqual(flipsIn('קלט → עיבוד → פלט → תוצאה'), ['→', '→', '→']);
});
test('HE: a back-arrow / bidirectional written in Hebrew flips too', () => {
  assert.deepEqual(flipsIn('ב ← א'), ['←']);
  assert.deepEqual(flipsIn('פלט ⇐ קלט'), ['⇐']);
  assert.deepEqual(flipsIn('א ↔ ב'), ['↔']); // symmetric: flip is a visual no-op but consistent
});

// ───────────── mixed lines: the MAJORITY language of the block decides ─────────────
test('mixed: majority Hebrew flips the arrow; majority English keeps it', () => {
  assert.deepEqual(flipsIn('הקלט input → output הפלט'), ['→']);  // Hebrew majority → flip
  assert.deepEqual(flipsIn('input → output (קלט)'), []);          // English majority → keep
  assert.deepEqual(flipsIn('הצעד a → b הבא'), ['→']);            // Hebrew majority → flip
  assert.deepEqual(flipsIn('compute a → b now'), []);            // English majority → keep
  assert.deepEqual(flipsIn('הפונקציה map: x → y מחזירה'), ['→']);
});

// ───────────── math arrows never flip, in EITHER language ─────────────
test('math-run arrows never flip regardless of the surrounding language', () => {
  assert.deepEqual(flipsIn('הנוסחה \\(a → b\\) כאן'), []);   // Hebrew block, \(…\) math
  assert.deepEqual(flipsIn('the rule \\(a → b\\) holds'), []); // English block, \(…\) math
  assert.deepEqual(flipsIn('$x^2 → y$ הוא הביטוי'), []);      // Hebrew block, $…$ math (^ signal)
  assert.deepEqual(flipsIn('המעבר $a \\to b$ מהיר'), []);     // \to → no glyph at all
  assert.deepEqual(flipsIn('הגבול \\[x → ∞\\] קיים'), []);     // \[…\] display math
});

// ───────────── no arrows / empty → never a flip ─────────────
test('lines without a prose arrow never flip', () => {
  assert.deepEqual(flipsIn('שלום עולם'), []);
  assert.deepEqual(flipsIn('hello world'), []);
  assert.deepEqual(flipsIn('3 < 5 ≤ 7'), []);
  assert.deepEqual(flipsIn('הערך 3 < 5 קטן'), []);
  assert.deepEqual(flipsIn(''), []);
});
