'use strict';
// engine/__tests__/sets-vectors-matrices.test.js — matrices, vectors/inner-products, probability,
// set operators, and floor/ceiling brackets. The guiding principle (confirmed by native-vs-payload
// DOM measurement): isolate ONLY what actually scrambles in RTL. Most set/probability expressions
// are LETTER-ANCHORED and render correctly on their own, so they stay [] (or isolate as a visual
// no-op when a relation seeds them). The genuine scrambles handled here:
//
//   • set operators ∩ ∪ ∖ ⊎ ⊓ ⊔ are connectors/seeds — but ONLY when the run also carries something
//     that reorders (a bracket / digit / ∅): "(a, b] ∪ [c, d)" reverses, "A ∩ B = ∅" pulls the weak
//     ∅ into the RTL flow. A bare "A ∪ B" is letter-anchored and left alone.
//   • floor/ceiling/white brackets ⌊⌋ ⌈⌉ ⟦⟧ join ()[]{}⟨⟩ as bracket operands.
//   • ∅ (empty set) is a weak nullary value (like a digit) for gating.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────────── matrices ───────────────────────────────
test('matrices: nested bracket matrices and determinants isolate whole', () => {
  assert.deepEqual(runs('המטריצה [[1, 2], [3, 4]] הפיכה'), ['[[1, 2], [3, 4]]']);
  assert.deepEqual(runs('M = [[a, b], [c, d]] כאן'), ['M = [[a, b], [c, d]]']);
  assert.deepEqual(runs('הדטרמיננטה |A| ≠ 0 כאן'), ['|A| ≠ 0']);     // |A| = determinant bars
  assert.deepEqual(runs('det(A) = 0 כאן'), ['det(A) = 0']);
});

// ─────────────────────────── vectors / inner products ───────────────────────────
test('vectors: angle-bracket inner products and coordinate vectors isolate whole', () => {
  assert.deepEqual(runs('המכפלה ⟨a, b⟩ סקלרית'), ['⟨a, b⟩']);
  assert.deepEqual(runs('⟨u, v⟩ = 0 כאן'), ['⟨u, v⟩ = 0']);
  assert.deepEqual(runs('הזהות ‖v‖² = ⟨v, v⟩ ידועה'), ['‖v‖² = ⟨v, v⟩']); // norm² = inner product
  assert.deepEqual(runs('הוקטור v = (1, 2, 3) כאן'), ['v = (1, 2, 3)']);
});

// ─────────────────────────── probability ───────────────────────────
test('probability: conditional / event notation', () => {
  assert.deepEqual(runs('ההסתברות P(A | B) = 0.5 כאן'), ['P(A | B) = 0.5']);
  assert.deepEqual(runs('P(X = x) = p כאן'), ['P(X = x) = p']);
  assert.deepEqual(runs('המשתנה X ~ N(0, 1) מתפלג'), ['N(0, 1)']);     // N(0,1) tuple; "X ~" anchors
  assert.deepEqual(runs('התוחלת E[X] = μ כאן'), []);                  // letter-anchored, renders fine
});

// ─────────────────────────── set operators ───────────────────────────
test('sets: ∪ ∩ chain/seed ONLY with a bracket/digit/∅ that reorders', () => {
  assert.deepEqual(runs('כי A ∩ B = ∅ ריק'), ['A ∩ B = ∅']);          // ∅ is weak → reorders
  assert.deepEqual(runs('בקטע (a, b] ∪ [c, d) כאן'), ['(a, b] ∪ [c, d)']); // interval union (brackets)
  assert.deepEqual(runs('C = A ∩ (B ∪ D) כאן'), ['C = A ∩ (B ∪ D)']);  // a math bracket inside
  assert.deepEqual(runs('ההכלה A ∪ B ⊆ C נכונה'), ['A ∪ B ⊆ C']);     // ⊆ seeds; ∪ chains (a no-op)
});
test('sets: a bare letter-anchored set expression is left alone (renders fine natively)', () => {
  assert.deepEqual(runs('האיחוד A ∪ B גדול'), []);
  assert.deepEqual(runs('החיתוך A ∩ B ריק'), []);
  assert.deepEqual(runs('המכפלה a × b כאן'), []);                      // cross product, letter-anchored
  assert.deepEqual(runs('המכפלה A × B כאן'), []);                      // Cartesian product
});

// ─────────────────────────── floor / ceiling brackets ───────────────────────────
test('floor/ceiling: ⌊⌋ ⌈⌉ act as bracket operands', () => {
  assert.deepEqual(runs('כי ⌊x⌋ ≤ x < ⌈x⌉ תמיד'), ['⌊x⌋ ≤ x < ⌈x⌉']);
  assert.deepEqual(runs('הגודל ⌈n/2⌉ ≥ 1 כאן'), ['⌈n/2⌉ ≥ 1']);
  assert.deepEqual(runs('|⌊x⌋| ≤ |x| תמיד'), ['|⌊x⌋| ≤ |x|']);        // abs of floor (nested)
});
