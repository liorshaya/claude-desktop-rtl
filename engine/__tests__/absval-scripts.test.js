'use strict';
// engine/__tests__/absval-scripts.test.js — two more RTL-scramble shapes, both reported via
// screenshots:
//
//   • ABSOLUTE VALUE / NORM bars |…| — the bar is neutral (no mirror) but the bars "mix with the
//     surroundings": "|x − 3| < 5" rendered fragmented and out of order. The bar is the SAME glyph
//     open & close, so relationRuns pairs the bars NOT inside a bracket sequentially and treats a
//     math-ish pair as one operand. A "|" inside parens/braces stays with that group (conditional
//     probability "P(A | B)", set-builder "{x | x > 0}").
//   • LITERAL braced sub/superscripts _{…} ^{…} — "∑_{i=1}^{n} i²" rendered the operator flipped to
//     the right of its limits ("i²{n}^{i=1}_∑"). The operand scanner now consumes a "^"/"_" argument
//     that is braced ("{i=1}"), parenthesised, signed or a single char, both as a base's script
//     (x^{2}) and as a big operator's LEADING limits followed by the summand (∑_{i=1}^{n} i²).
//
// Engine is direction-agnostic — same runs for Hebrew and English (isolation is the fix in RTL, a
// no-op in LTR). All DOM-verified with the real payload.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns, hasMathRun } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────────── absolute value / norm bars ───────────────────────────────
test('absval: |…| around a comparison / arithmetic isolates whole', () => {
  assert.deepEqual(runs('המרחק הוא |x − 3| < 5 מהמרכז'), ['|x − 3| < 5']);   // the reported screenshot
  assert.deepEqual(runs('בקטע |x| + 1 < 5 קטן'), ['|x| + 1 < 5']);
  assert.deepEqual(runs('כך ש-|f(x) − f(a)| < δ כאן'), ['|f(x) − f(a)| < δ']); // ε-δ definition
  assert.deepEqual(runs('המרחק |x − a| < ε בהגדרה'), ['|x − a| < ε']);
  assert.deepEqual(runs('הערך המוחלט |x − 3| חיובי'), ['|x − 3|']);          // standalone, has a signal
});
test('absval: a bare |x| with no inner signal is left alone (renders fine)', () => {
  assert.deepEqual(runs('הנורמה |v| כאן'), []);
  assert.deepEqual(runs('הערך |x| גדול'), []);
  assert.deepEqual(runs('|a| = |b|'), []);                                   // letters only, no reorder
});
test('absval: a "|" inside a bracket group belongs to that group, not abs-value', () => {
  assert.deepEqual(runs('ההסתברות P(A | B) = 0.5 כאן'), ['P(A | B) = 0.5']); // conditional probability
  assert.deepEqual(runs('הקבוצה {x | x > 0} פתוחה'), ['{x | x > 0}']);       // set-builder "such that"
});
test('absval: English context returns the same run (LTR no-op)', () => {
  assert.deepEqual(runs('the absolute |x − 3| < 5 here'), ['absolute |x − 3| < 5']); // "absolute" pulled in
  assert.deepEqual(runs('if |x| > 0 then'), ['|x| > 0']);
});

// ─────────────────────────── literal braced sub/superscripts ───────────────────────────
test('scripts: a big operator with braced limits keeps the operator on the left', () => {
  assert.deepEqual(runs('הסכום ∑_{i=1}^{n} i² ידוע'), ['∑_{i=1}^{n} i²']);   // the reported screenshot
  assert.deepEqual(runs('הטור ∑_{i=1}^{n} a_i מתכנס'), ['∑_{i=1}^{n} a_i']);
  assert.deepEqual(runs('האינטגרל ∫_0^1 f גדול'), ['∫_0^1 f']);
  assert.deepEqual(runs('המכפלה ∏_{k=1}^{m} a_k כאן'), ['∏_{k=1}^{m} a_k']);
});
test('scripts: braced sub/superscripts bind to a base inside an equation', () => {
  assert.deepEqual(runs('נתון x^{2} = 4 כאן'), ['x^{2} = 4']);
  assert.deepEqual(runs('המקדם a_{ij} = 0 כאן'), ['a_{ij} = 0']);
  assert.deepEqual(runs('2^{10} = 1024 בדיוק'), ['2^{10} = 1024']);
  assert.deepEqual(runs('x^{n} > x^{m} כאשר'), ['x^{n} > x^{m}']);
});

// ─────────────────────────── full reported screenshot sentences (integration) ───────────────────────────
test('integration: the four reported screenshot sentences isolate only their math', () => {
  assert.deepEqual(runs('המרחק הוא |x − 3| < 5 מהמרכז.'), ['|x − 3| < 5']);
  assert.deepEqual(runs('הסכום ∑_{i=1}^{n} i² ידוע בנוסחה.'), ['∑_{i=1}^{n} i²']);
  assert.deepEqual(
    runs('לכל ∀ε > 0 קיים ∃δ > 0 כך ש-|f(x) − f(a)| < δ ⇐ |x − a| < ε בהגדרה.'),
    ['∀ε > 0', '∃δ > 0', '|f(x) − f(a)| < δ', '|x − a| < ε']
  );
  assert.deepEqual(
    runs('נתון ש-∀x ∈ [0, ∞): אם √(x² + 1) ≤ |x| + 1 < 5 ו-P(A | B) = 0.5, אז ∑_{i=1}^{n} a_i → L כאשר {a_n} ⊆ ℝ⁺ וגם f: ℝ → ℝ רציפה, נכון? המחיר: ₪250.'),
    ['∀x ∈ [0, ∞)', '√(x² + 1) ≤ |x| + 1 < 5', 'P(A | B) = 0.5', '∑_{i=1}^{n} a_i', '{a_n} ⊆ ℝ⁺']
  );
});

// ─────────────────────────── the hasMathRun gate ───────────────────────────
test('absval/scripts: hasMathRun gates the new shapes (and skips a bare |x|)', () => {
  assert.equal(hasMathRun('|x − 3| < 5'), true);     // mirror relation
  assert.equal(hasMathRun('∑_{i=1}^{n}'), true);     // prefix op
  assert.equal(hasMathRun('x^{2} = 4'), true);       // arithmetic + digit
  assert.equal(hasMathRun('|x|'), false);            // no inner signal
});
