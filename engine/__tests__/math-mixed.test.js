'use strict';
// engine/__tests__/math-mixed.test.js — INTEGRATION: realistic math embedded in Hebrew (RTL)
// and English (LTR) prose, exercising relationRuns + arrowFlipOffsets + signedNumberRuns on the
// SAME lines. The engine is pure and direction-agnostic: it reports identical spans/offsets for
// Hebrew and English. Direction only matters in the DOM — comparisons isolate LTR in BOTH (a
// visual no-op in an LTR block, the fix in an RTL one), while arrows flip ONLY in an RTL block.
// These lock the engine's reading of mixed math+prose content; a companion DOM check covers the
// RTL-vs-LTR rendering itself.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns } = require('../relations.js');
const { arrowFlipOffsets } = require('../arrows.js');
const { signedNumberRuns } = require('../numbers.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));
const flipped = (t) => arrowFlipOffsets(t).map((i) => t[i]);
const signed = (t) => signedNumberRuns(t).map(([s, e]) => t.slice(s, e));

// ──────────────────────────── Hebrew (RTL) math sentences ────────────────────────────
test('mixed/HE: quantified inequalities, powers, subscripts', () => {
  assert.deepEqual(runs('לכל x ∈ ℝ מתקיים x² ≥ 0'), ['x ∈ ℝ', 'x² ≥ 0']);
  assert.deepEqual(runs('נתון ש-0 < x ≤ 1 בקטע'), ['0 < x ≤ 1']);
  assert.deepEqual(runs('אם 0 < x אז x³ > 0'), ['0 < x', 'x³ > 0']);
  assert.deepEqual(runs('הסדרה 1 ≤ aₙ ≤ n חסומה'), ['1 ≤ aₙ ≤ n']);
  assert.deepEqual(runs('כאשר n ≥ 100 הטור מתכנס'), ['n ≥ 100']);
});
test('mixed/HE: units — temperature, price, percent', () => {
  assert.deepEqual(runs('הטמפרטורה -5° ≤ T ≤ 40° ביום'), ['-5° ≤ T ≤ 40°']);
  assert.deepEqual(runs('המחיר $50 < $100 בהנחה'), ['$50 < $100']);
  assert.deepEqual(runs('עלייה של 5% < 10% השנה'), ['5% < 10%']);
  assert.deepEqual(runs('הסכום 1,000 ≤ x ≤ 1,000,000 שקל'), ['1,000 ≤ x ≤ 1,000,000']);
});
test('mixed/HE: arrows — Hebrew-flanked flip, math run does not (engine view)', () => {
  assert.deepEqual(flipped('הקלט a → הפלט b'), ['→']);              // mixed-flanked (a → ה) flips
  assert.deepEqual(flipped('הנוסחה $a \\to b$ כאן'), []);          // LaTeX → no glyph / no flip
  assert.deepEqual(flipped('צעד 1 ➜ צעד 2 ➜ סיום'), ['➜', '➜']);   // number/Hebrew-flanked
  // one line with BOTH a comparison and a Hebrew-flanked prose arrow — each engine its own
  assert.deepEqual(runs('אם a < b אז קלט → פלט'), ['a < b']);
  assert.deepEqual(flipped('אם a < b אז קלט → פלט'), ['→']);
});
test('mixed/HE: signed numbers — prefixes excluded, real signs caught', () => {
  assert.deepEqual(signed('הטמפרטורה -5 עד +5 מעלות'), ['-5', '+5']);
  assert.deepEqual(signed('ירד ל-5 ול-3 אחוז'), []);             // ל-5 / ל-3 are prefixes
  assert.deepEqual(signed('הפרש של -2.5 מעלות'), ['-2.5']);
});

// ──────────────────────────── English (LTR) math sentences ────────────────────────────
test('mixed/EN: quantified inequalities, powers', () => {
  assert.deepEqual(runs('for all n ≥ 1 we have 1 ≤ n'), ['n ≥ 1', '1 ≤ n']);
  assert.deepEqual(runs('if x > 0 then x² > 0'), ['x > 0', 'x² > 0']);
  assert.deepEqual(runs('since 2² = 4 < 5 holds'), ['2² = 4 < 5']);     // `=` chains within
  assert.deepEqual(runs('the loop runs while 0 ≤ i < n'), ['0 ≤ i < n']);
  assert.deepEqual(runs('we need ε > 0 small'), ['ε > 0']);             // Greek operand
});
test('mixed/EN: sets, currency, percent, grouping', () => {
  assert.deepEqual(runs('the chain ℕ ⊂ ℤ ⊂ ℚ ⊂ ℝ nests'), ['ℕ ⊂ ℤ ⊂ ℚ ⊂ ℝ']);
  assert.deepEqual(runs('prices $5 < $10 < $20 rise'), ['$5 < $10 < $20']);
  assert.deepEqual(runs('growth 2% < 3% < 5% yearly'), ['2% < 3% < 5%']);
  assert.deepEqual(runs('between 1,000 and 9,999: 1,000 ≤ n ≤ 9,999'), ['1,000 ≤ n ≤ 9,999']);
});
test('mixed/EN: arrows never flip — Latin-flanked stay right, math excluded', () => {
  // In English every prose arrow is Latin-flanked, so it already points at the target and never
  // flips; math-run arrows are excluded too — so nothing flips in an English line.
  assert.deepEqual(flipped('the map f: X → Y here'), []);
  assert.deepEqual(flipped('the limit $x \\to 0$ holds'), []);
  assert.deepEqual(flipped('step one ➜ step two ➜ done'), []);
  assert.deepEqual(flipped('A ⟶ B \\(C → D\\) E ⟶ F'), []);
});
test('mixed/EN: signed numbers', () => {
  assert.deepEqual(signed('the range is -40 to +50 degrees'), ['-40', '+50']);
  assert.deepEqual(signed('from -2.5 to -1.5 units'), ['-2.5', '-1.5']);
  assert.deepEqual(signed('coordinates (-3, -7) plotted'), ['-3', '-7']);
});

// ──────────────────────────── documented limitations (locked) ────────────────────────────
test('mixed: KNOWN LIMITS — function-call parens and space-separated operands', () => {
  // A parenthesised function argument is not pulled into the operand (parens are left to UBA,
  // which mirrors them correctly); only the bare relation + adjacent token isolate.
  assert.deepEqual(runs('f(x) ≤ g(x)'), ['≤ g']);
  // A single operand spanning a SPACE (a function application, "n + 1") splits at the space.
  assert.deepEqual(runs('-1 ≤ cos θ ≤ 1'), ['-1 ≤ cos', 'θ ≤ 1']);
  assert.deepEqual(runs('0 < n + 1'), ['0 < n']);
  // a slash fraction is not one operand (slash is division, not part of the number)
  assert.deepEqual(runs('1/2 < 3/4'), ['2 < 3']);
});
