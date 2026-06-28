'use strict';
// engine/__tests__/prefix-brackets.test.js — PREFIX math operators and BRACKET/interval groups.
// Two classes of math that scramble in an RTL paragraph but carry NO binary operator to seed them,
// so relationRuns gained dedicated handling (all DOM-verified with the real payload):
//
//   • PREFIX operators √∛∜ ∑∏∐ ∫∬∭∮ ∀∃∄ ¬ ∇∂ ⋀⋁⋂⋃ ⨀…⨉ — their operand is on the RIGHT, and the
//     UBA otherwise places the neutral symbol AFTER it ("∑ x_i"→"x_i ∑", "√(a²+b²)"→"(a²+b²)√",
//     "¬p"→"p¬"). Some (∫ ∑ √ ∃ ∂ ∬ ∮) are additionally Bidi_Mirrored; both paths grow the run to
//     the right operand via the same scanner, so the symbol stays on its left.
//   • BRACKET / interval groups — "[a, b]"→"]a,b[", "(0, 1]"→")1,0(", "(0°C<100°C)"→")…(": paired
//     brackets MIRROR+SWAP around weak/isolated content, so a standalone group with math content is
//     isolated whole. Prose in brackets ("(הערה)", "(see note)") is left untouched (fidelity).
//
// The engine is direction-agnostic: it returns the same runs for Hebrew and English; isolation is
// the fix in RTL and a visual no-op in LTR. Hebrew context is used for the prefix assertions (an
// English word sitting flush against the math can be pulled into the LTR run — harmless there).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns, hasMathRun } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────────── roots / radicals ───────────────────────────────
test('prefix: roots √ ∛ ∜ keep the radical on the left of its operand', () => {
  assert.deepEqual(runs('√2 הוא אי-רציונלי'), ['√2']);
  assert.deepEqual(runs('המרחק הוא √x כאן'), ['√x']);
  assert.deepEqual(runs('הנורמה √(a² + b²) במרחב'), ['√(a² + b²)']);   // the reported screenshot
  assert.deepEqual(runs('√(1 + √2) מקונן'), ['√(1 + √2)']);            // nested radical
  assert.deepEqual(runs('כאשר ∛8 = 2 נכון'), ['∛8 = 2']);             // root inside an equation
  assert.deepEqual(runs('נתון c = √(a² + b²) כאן'), ['c = √(a² + b²)']); // root as the RHS of "="
  assert.deepEqual(runs('מתקיים x < √2 תמיד'), ['x < √2']);           // root as a comparison operand
  assert.deepEqual(runs('√x ≥ 0 לכל x'), ['√x ≥ 0']);
});

// ─────────────────────────── big operators ∑ ∏ ∐ ∫ ∬ ∮ ⋃ ⋂ ──────────────────────────
test('prefix: big operators put the operator before its operand', () => {
  assert.deepEqual(runs('הסכום ∑ x_i והמכפלה ∏ x_i שונים'), ['∑ x_i', '∏ x_i']); // the screenshot
  assert.deepEqual(runs('האינטגרל ∫ f גדול'), ['∫ f']);
  assert.deepEqual(runs('נתון S = ∑ x_i כאן'), ['S = ∑ x_i']);        // big-op as an RHS
  assert.deepEqual(runs('הקואופרודוקט ∐ A_i כאן'), ['∐ A_i']);
  assert.deepEqual(runs('האיחוד ⋃ A_i גדול'), ['⋃ A_i']);
  assert.deepEqual(runs('החיתוך ⋂ B_k קטן'), ['⋂ B_k']);
});

// ─────────────────────── quantifiers / negation / differentials ───────────────────────
test('prefix: quantifiers ∀ ∃ ∄, negation ¬, differentials ∇ ∂', () => {
  assert.deepEqual(runs('לכל ∀x ∈ ℝ מתקיים'), ['∀x ∈ ℝ']);
  assert.deepEqual(runs('קיים ∃y בקבוצה'), ['∃y']);
  assert.deepEqual(runs('∄z כך ש'), ['∄z']);
  assert.deepEqual(runs('השלילה ¬p נכונה'), ['¬p']);
  assert.deepEqual(runs('שלילת הצמד ¬(p ∧ q) כאן'), ['¬(p ∧ q)']);    // negation of a bracketed group
  assert.deepEqual(runs('הגרדיאנט ∇f מתאפס'), ['∇f']);
  assert.deepEqual(runs('הנגזרת ∂f קטנה'), ['∂f']);
});

// ─────────────────────── prefix operators in English (LTR no-op) ───────────────────────
test('prefix: English context returns the same run (isolation is a no-op in LTR)', () => {
  // A Latin word sitting flush against the math (no boundary) is pulled into the run — this is a
  // visual no-op in an LTR block (the run already reads left-to-right), so English stays correct.
  assert.deepEqual(runs('if x ∈ ℝ then √x ≥ 0'), ['x ∈ ℝ', 'then √x ≥ 0']);
  assert.deepEqual(runs('the sum S = ∑ x_i here'), ['S = ∑ x_i']);
  assert.deepEqual(runs('the negation ¬p is false'), ['negation ¬p']); // "negation" pulled in (LTR no-op)
});

// ─────────────────────── intervals: closed / open / half-open ───────────────────────
test('brackets: intervals keep their brackets upright and numbers in order', () => {
  assert.deepEqual(runs('הקטע [a, b] סגור'), ['[a, b]']);             // closed
  assert.deepEqual(runs('הקטע (a, b) פתוח'), ['(a, b)']);             // open
  assert.deepEqual(runs('בקטע [0, 1] הפונקציה'), ['[0, 1]']);
  assert.deepEqual(runs('חצי-פתוח [0, 1) כאן'), ['[0, 1)']);          // half-open (mixed brackets)
  assert.deepEqual(runs('הקטע (0, 1] כאן'), ['(0, 1]']);
  assert.deepEqual(runs('הקרן [1, ∞) אינסופית'), ['[1, ∞)']);         // ∞ bound
  assert.deepEqual(runs('הקטע (-∞, 0] שלילי'), ['(-∞, 0]']);
  assert.deepEqual(runs('בקטע [-1, 1] חסום'), ['[-1, 1]']);           // negative bound
});

// ─────────────────────── tuples / coordinates / finite sets ───────────────────────
test('brackets: tuples, coordinates and finite sets isolate as a group', () => {
  assert.deepEqual(runs('הזוג (3, 5) במישור'), ['(3, 5)']);
  assert.deepEqual(runs('הנקודה (x, y) כאן'), ['(x, y)']);
  assert.deepEqual(runs('הקואורדינטות (-3, -7) משורטטות'), ['(-3, -7)']); // negative coords
  assert.deepEqual(runs('הקבוצה {1, 2, 3} סופית'), ['{1, 2, 3}']);
  assert.deepEqual(runs('הקבוצה {a, b} כאן'), ['{a, b}']);
  assert.deepEqual(runs('הזוג הסדור ⟨a, b⟩ כאן'), ['⟨a, b⟩']);        // angle brackets
});

// ─────────────────────── brackets as operands of a relation ───────────────────────
test('brackets: a bracket group is one operand of a surrounding relation', () => {
  assert.deepEqual(runs('מתקיים x ∈ [a, b] תמיד'), ['x ∈ [a, b]']);
  assert.deepEqual(runs('ההכלה [a, b] ⊂ ℝ נכונה'), ['[a, b] ⊂ ℝ']);
  assert.deepEqual(runs('הזוג (3, 5) ∈ ℝ² כאן'), ['(3, 5) ∈ ℝ²']);
  assert.deepEqual(runs('a function f(x, y) = 0 here'), ['f(x, y) = 0']); // function call with a tuple arg
});

// ─────────────────────── grouped arithmetic in brackets ───────────────────────
test('brackets: a parenthesised expression (operator inside) isolates whole', () => {
  assert.deepEqual(runs('הביטוי (a + b) כאן'), ['(a + b)']);
  assert.deepEqual(runs('המכפלה (3 × 5) כאן'), ['(3 × 5)']);
  assert.deepEqual(runs('בתחום (0°C < 100°C) קר'), ['(0°C < 100°C)']);
  assert.deepEqual(runs('2 × (3 + 4) = 14'), ['2 × (3 + 4) = 14']);
  assert.deepEqual(runs('the set {x : x > 0} is open'), ['{x : x > 0}']); // set-builder (has a relation)
});

// ─────────────────────── prose in brackets is NEVER isolated (fidelity) ───────────────────────
test('brackets: prose parentheticals and lists stay untouched', () => {
  assert.deepEqual(runs('(הערה) בעברית כאן'), []);                    // Hebrew → strong-RTL guard
  assert.deepEqual(runs('see the (note) here'), []);                  // single word → no math signal
  assert.deepEqual(runs('a list (one, two, three)'), []);            // ≥3-letter words → WORD3 guard
  assert.deepEqual(runs('(e.g., this case)'), []);
  assert.deepEqual(runs('(הערה, כן) חשוב'), []);                      // Hebrew comma-list
  assert.deepEqual(runs('ראה סעיף (3) למעלה'), []);                   // single number, no comma/op
});

// ─────────────────────── letter-anchored constructs still NOT isolated ───────────────────────
test('prefix/brackets: binary logical connectives between letters do not scramble', () => {
  assert.deepEqual(runs('התנאי p ∧ q נכון'), []);                     // ∧ not mirrored, letters anchor
  assert.deepEqual(runs('הביטוי p ∨ q כאן'), []);
  assert.deepEqual(runs('p ∧ q ∨ r holds'), []);
});

// ─────────────────────── the hasMathRun DOM gate covers the new shapes ───────────────────────
test('prefix/brackets: hasMathRun gates the DOM pass for the new constructs', () => {
  assert.equal(hasMathRun('הנורמה √(a² + b²) כאן'), true);            // prefix op
  assert.equal(hasMathRun('∑ x_i'), true);
  assert.equal(hasMathRun('הקטע [a, b] סגור'), true);                 // bracket + comma
  assert.equal(hasMathRun('הזוג (3, 5)'), true);
  assert.equal(hasMathRun('¬p'), true);
  assert.equal(hasMathRun('(הערה) בעברית'), false);                   // bracket, NO comma/op → gate skips
  assert.equal(hasMathRun('שלום עולם'), false);
});
