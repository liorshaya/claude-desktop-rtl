'use strict';
// engine/__tests__/math-corners.test.js — corners surfaced by an adversarial sweep over the math
// categories (and confirmed by native-vs-payload DOM measurement):
//
//   • A POWER on a bracket group + an equation chain — "(a+b)² = c" reads "c = (a+b)²" natively
//     (the bracket scrambles AND the whole equation reverses). The bracket seed now keeps a trailing
//     ² ³ ⁿ power, and an arithmetic run that contains a math bracket isolates whole — while a plain
//     function call "f(x) = y" (no operator inside the parens, letter-anchored) stays untouched, as
//     it renders correctly on its own.
//   • FACTORIAL "n!" — the "!" is a trailing operand suffix, so "5! = 120", "n! > 100" isolate.
//   • NORM ‖x‖ — the double bar pairs like the single |…| absolute-value bar.
//
// Native-vs-payload note (DOM-measured): "(a+b)", "(3 × 5)", "(a+b)² = c" and every interval DO
// scramble; "f(x) = y" and "x² = 4" do NOT — the tests below match that ground truth.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns, hasMathRun } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────── a power on a bracket group ───────────────────────────
test('corners: a power on a bracket group keeps the group AND its equation chain', () => {
  assert.deepEqual(runs('הביטוי (a+b)² = c נכון'), ['(a+b)² = c']);
  assert.deepEqual(runs('הזהות (a+b)² = a² + 2ab + b² ידועה'), ['(a+b)² = a² + 2ab + b²']);
  assert.deepEqual(runs('הגבול (1 + 1/n)ⁿ = e ידוע'), ['(1 + 1/n)ⁿ = e']);
  assert.deepEqual(runs('כי (x+1)² ≥ 0 תמיד'), ['(x+1)² ≥ 0']);
  assert.deepEqual(runs('הביטוי (a+b)² כאן'), ['(a+b)²']);            // standalone, still isolated
});
test('corners: a plain function call (letter-anchored, renders fine) is NOT isolated', () => {
  assert.deepEqual(runs('f(x) = y'), []);                            // DOM-measured: does not scramble
  assert.deepEqual(runs('x² = 4'), ['x² = 4']);                      // …but a digit DOES reorder
  assert.deepEqual(runs('a = b'), []);
  assert.deepEqual(runs('sin(x) here'), []);                         // a function call, no reorder
});

// ─────────────────────────── factorial ───────────────────────────
test('corners: factorial "!" binds to its operand', () => {
  assert.deepEqual(runs('הערך n! > 100 גדל'), ['n! > 100']);
  assert.deepEqual(runs('נתון 5! = 120 כאן'), ['5! = 120']);
  assert.deepEqual(runs('המקרים n! ≥ 1 לכל n'), ['n! ≥ 1']);
  assert.deepEqual(runs('הנוסחה (n+1)! = k כאן'), ['(n+1)! = k']);
  assert.deepEqual(runs('כי 5! = 5 × 4 × 3 × 2 × 1 = 120'), ['5! = 5 × 4 × 3 × 2 × 1 = 120']);
  // a sentence-final "!" after prose is NOT a factorial (no math seed → nothing isolated)
  assert.deepEqual(runs('שלום עולם!'), []);
  assert.deepEqual(runs('נכון מאוד!'), []);
});

// ─────────────────────────── norm bars ‖…‖ ───────────────────────────
test('corners: norm ‖x‖ pairs like the absolute-value bar', () => {
  assert.deepEqual(runs('הנורמה ‖x‖ ≤ 1 חסומה'), ['‖x‖ ≤ 1']);
  assert.deepEqual(runs('‖A‖ ≤ ‖B‖'), ['‖A‖ ≤ ‖B‖']);
  assert.deepEqual(runs('המרחק ‖u − v‖ < ε כאן'), ['‖u − v‖ < ε']);
});

// ─────────────────────────── the DOM gate covers these ───────────────────────────
test('corners: hasMathRun passes a bracket+operator group (and a bare paren stays out)', () => {
  assert.equal(hasMathRun('(a+b)² = c'), true);   // bracket + operator
  assert.equal(hasMathRun('n! > 100'), true);     // mirror relation
  assert.equal(hasMathRun('‖x‖ ≤ 1'), true);
  assert.equal(hasMathRun('(הערה) כאן'), false);  // bracket, no operator/comma → gate skips
  assert.equal(hasMathRun('ראה (סעיף) למטה'), false);
});
