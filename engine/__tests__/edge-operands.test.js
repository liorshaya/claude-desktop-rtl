'use strict';
// engine/__tests__/edge-operands.test.js — expression-level edge cases in the areas the
// bug-audit touched: signed-number boundaries, comparison chains whose operands carry
// nested brackets / trailing powers (the seed-skip correction's territory), norm bars,
// half-open intervals, and the per-arrow local-context rule around invisible/emoji
// neighbours. Every expectation was verified against the engine before being encoded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

// the substrings relationRuns says to isolate (readable view of the [start,end) ranges)
const runs = (t) => E.relationRuns(t).map(([s, e]) => t.slice(s, e));

// ───────────────────────────── signed numbers at boundaries ─────────────────────────────
test('signedNumberRuns: a sign right after an opening bracket is a genuine sign', () => {
  assert.deepEqual(E.signedNumberRuns('(-5)'), [[1, 3]]); // "(" is neither letter nor digit
});

test('signedNumberRuns: string-start, U+2212 minus, and a degree suffix left outside the run', () => {
  assert.deepEqual(E.signedNumberRuns('-7 בהתחלה'), [[0, 2]]);
  assert.deepEqual(E.signedNumberRuns('טווח: −3.5 עד +7'), [[6, 10], [14, 16]]); // real minus sign
  assert.deepEqual(E.signedNumberRuns('קר: -5° בחוץ'), [[4, 6]]); // the ° stays outside (CSS isolates "-5")
});

test('signedNumberRuns: Persian digits take a sign exactly like European ones', () => {
  assert.deepEqual(E.signedNumberRuns('+۴۲ فارسی'), [[0, 3]]);
});

// ─────────────── comparison chains with nested brackets and trailing powers ───────────────
test('relationRuns: nested bracket groups with powers stay ONE operand through the chain', () => {
  assert.deepEqual(runs('((a+b)²+1)³ = c'), ['((a+b)²+1)³ = c']); // power on the OUTER group too
  assert.deepEqual(runs('x < ((a+b)×2)²'), ['x < ((a+b)×2)²']);   // nested group as RIGHT operand
});

test('relationRuns: norm bars ‖…‖ with a power are one operand of the comparison', () => {
  assert.deepEqual(runs('‖v‖² < 1'), ['‖v‖² < 1']);
});

test('relationRuns: half-open interval union keeps a trailing power on the interval', () => {
  assert.deepEqual(runs('(a, b]² ∪ [c, d)'), ['(a, b]² ∪ [c, d)']);
});

test('relationRuns: nested function calls chain as one expression', () => {
  assert.deepEqual(runs('f(g(x)) = 2'), ['f(g(x)) = 2']);
});

test('relationRuns: abs-value and function/π operands inside Hebrew prose isolate exactly', () => {
  assert.deepEqual(runs('בדוק: |x − 3| < 5 תמיד'), ['|x − 3| < 5']);
  assert.deepEqual(runs('sin(θ) = 0.5 בערך'), ['sin(θ) = 0.5']);
  assert.deepEqual(runs('π ≈ 3.14159 בקירוב'), ['π ≈ 3.14159']);
});

test('relationRuns: an astral math letter is NOT attached as an operand (current behavior)', () => {
  // isTermChar works on BMP code units, so 𝕏 (astral) stays outside the run and only "< 5"
  // is isolated — the operator still renders upright, which is the load-bearing part. Pinned
  // so a future astral-operand upgrade shows up as a deliberate diff, not a silent change.
  const t = '𝕏 < 5';
  assert.deepEqual(E.relationRuns(t), [[3, 6]]);
  assert.deepEqual(runs(t), ['< 5']);
});

// ───────────────────── per-arrow local context: invisibles & emoji neighbours ─────────────────────
test('arrowFlipOffsets: emoji neighbours are neutral — the arrow still flips with its RTL block', () => {
  assert.deepEqual(E.arrowFlipOffsets('שלום 😀→😀 עולם'), [7]); // astral neighbours skipped correctly
});

test('arrowFlipOffsets: ZWJ-joined Latin around an arrow is an LTR-flanked arrow — no flip', () => {
  assert.deepEqual(E.arrowFlipOffsets('abc‍→‍def'), []); // nearest STRONG on both sides is Latin
});

test('arrowFlipOffsets: an embedded LTR run keeps its arrow even inside a Hebrew sentence', () => {
  assert.deepEqual(E.arrowFlipOffsets('עברית input → output עברית'), []); // the documented CRUCIAL rule
});

test('arrowFlipOffsets: number-flanked and block-boundary arrows flip (numbers act as R)', () => {
  assert.deepEqual(E.arrowFlipOffsets('5 → 6'), [2]);
  assert.deepEqual(E.arrowFlipOffsets('שלום →'), [5]); // trailing boundary
  assert.deepEqual(E.arrowFlipOffsets('→ שלום'), [0]); // leading boundary
});

// ───────────────────────────── currency next to real math ─────────────────────────────
test('segmentMath: currency $ and a real $…$ formula coexist in one Hebrew sentence', () => {
  const t = 'מחיר $5 ועוד $x^2$ נוסחה';
  const segs = E.segmentMath(t);
  assert.deepEqual(segs.map((s) => [s.type, s.value]), [
    ['text', 'מחיר $5 ועוד '],
    ['math', '$x^2$'],
    ['text', ' נוסחה'],
  ]);
  assert.equal(segs.map((s) => s.value).join(''), t, 'byte-for-byte reassembly (fidelity)');
});
