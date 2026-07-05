'use strict';
// engine/__tests__/edge-aggressive-4.test.js — round 4: the attacks that HURT. Pathological
// inputs that freeze (quadratic bracket scans), and the "isolation boundary cuts a token in
// half" family — clock times/ratios split at ':', signed exponents split at '^-' — which is
// WORSE than not isolating at all: half the number renders inside the LTR island and half
// outside it. Plus mid-stream math settle flips, combining marks with no base, ZWSP inside a
// number, Hebrew gershayim units, and a suffix-fuzz (a NEW angle — prefixes simulate
// streaming, suffixes simulate a re-scan after earlier content settled). Findings fixed:
//   • FIXED — the per-call depth scan in bracketSpanEnd/Left made the seed loop QUADRATIC on
//     unmatched openers: 20k stray "(" before "3<5" took ~1.8s (a renderer freeze; 40k ≈ 7s).
//     One O(n) stack pass now resolves every pair up front (identical pair-for-pair semantics).
//   • FIXED — ':' was not a digit-internal separator: "9:00-17:00" isolated just "00-17" and
//     "1:2 < 3:4" isolated "2 < 3", cutting BOTH numbers at the isolation boundary.
//   • FIXED — a signed exponent's base was cut off: "10^-9 < 10^-6" isolated "-9 < 10^-6"
//     (termStartLeft now rebinds through "^/_" + sign to the base, mirroring termEndRight).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

const runs = (t) => E.relationRuns(t).map(([s, e]) => t.slice(s, e));
const flip = (t) => E.arrowFlipOffsets(t).map((i) => t[i]);

// ─────────────────── pathological inputs must not freeze the renderer ───────────────────
test('perf: 40k unmatched openers before a comparison parse in linear time (the fix)', () => {
  // Pre-fix: quadratic — ~1.8s at 20k, ~7s at 40k. Post-fix: single-digit ms. The 2s bound is
  // a ~1000× margin over the fixed cost yet far below the pre-fix cost, so a regression fails.
  const t0 = process.hrtime.bigint();
  assert.deepEqual(runs('('.repeat(40000) + '3<5'), ['3<5']);
  assert.deepEqual(runs('()('.repeat(16000) + '3<5'), ['3<5']);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 2000, `pathological brackets took ${ms.toFixed(0)}ms`);
});
test('perf: bracket-heavy but BALANCED shapes still resolve exactly', () => {
  // the O(n) pair pass must be pair-for-pair identical to the old depth scan
  assert.deepEqual(runs('((a+b)) < (((c)))'), ['((a+b)) < (((c)))']);
  assert.deepEqual(runs('[a, (b, c]) < 5'), ['[a, (b, c]) < 5']);   // mixed pairs still match
  assert.deepEqual(runs(')( 3<5 )('), ['( 3<5 )']);                 // the inner "(…)" DOES pair across the strays
});

// ─────────────────── the ':' cut — clock times and ratios (the fix) ───────────────────
test('colon: times/ratios are ONE operand — the run no longer cuts them at ":"', () => {
  assert.deepEqual(runs('פתוח 9:00-17:00 היום'), ['9:00-17:00']);
  assert.deepEqual(runs('היחס 1:2 < 3:4 בערך'), ['1:2 < 3:4']);
  assert.deepEqual(runs('x = 3:5'), ['x = 3:5']);
});
test('colon: prose colons and bare times still seed nothing', () => {
  assert.deepEqual(runs('בשעה 15:30 נפגש'), []);                    // no operator → no run
  assert.deepEqual(runs('תוצאה 3:5 במשחק'), []);
  assert.deepEqual(runs('שאלה: 5 < 7'), ['5 < 7']);                 // the colon stays with the prose
});

// ─────────────────── the '^-' cut — signed exponents (the fix) ───────────────────
test('exponents: a signed power binds base+sign+exponent as ONE operand', () => {
  assert.deepEqual(runs('10^-9 < 10^-6'), ['10^-9 < 10^-6']);
  assert.deepEqual(runs('2^-3 = 1/8'), ['2^-3 = 1/8']);
  assert.deepEqual(runs('x_-1 < x_0'), ['x_-1 < x_0']);             // signed subscript too
  assert.deepEqual(runs('e^+2 > 1'), ['e^+2 > 1']);
});

// ─────────────────── mid-stream math settle: prose → math as the delimiter closes ───────────────────
test('settle: an arrow flips while its \\( is unclosed, and stops once the math closes', () => {
  assert.deepEqual(flip('נוסחה \\(א → ב עוד'), ['→']);              // mid-stream: prose, flips
  assert.deepEqual(flip('נוסחה \\(א → ב\\) עוד'), []);              // settled: math, no flip
  // an unclosed $ leaves the relation in prose — it isolates WITH the dangling $ until settle
  assert.deepEqual(runs('נוסחה $3 < 5 עוד'), ['$3 < 5']);
});

// ─────────────────── combining marks with no base ───────────────────
test('marks: bare niqqud sits in the Hebrew block (rtl); bare Latin marks decide nothing', () => {
  assert.equal(E.firstStrong('ְִ'), 'rtl');                          // niqqud-only — documented voter
  assert.equal(E.firstStrong('̈́'), null);                // combining diaeresis/acute
  assert.equal(E.detectBlockDir('?!؟'), 'rtl');                     // the ؟ alone decides RTL
});

// ─────────────────── KNOWN cuts we refuse to chase (locked with rationale) ───────────────────
test('KNOWN: a ZWSP inside a number still cuts it (invisible-char torture)', () => {
  // "5​0" (ZWSP between digits) → the run starts at "0". Claude never emits ZWSP inside a
  // number; only pasted text hits this, and spanning invisibles inside operands would need
  // UBA-level modeling the engine deliberately avoids (same stance as RLM in round 2).
  assert.deepEqual(runs('5​0 < 7'), ['0 < 7']);
});
test('KNOWN: a Hebrew gershayim unit (ק"ג) blocks leftward growth — the unit is prose', () => {
  // The unit is Hebrew prose, so the comparison isolates only from the operator rightward.
  // Rendering stays legible (the Hebrew unit reads RTL around the LTR island); attaching
  // Hebrew operands would violate the round-2 hard rule.
  assert.deepEqual(runs('5 ק"ג < 10 ק"ג'), ['< 10']);
  assert.deepEqual(runs('1 ק"מ = 1000 מטר'), []);                   // letter-anchored '=' — no run
  assert.deepEqual(runs('קבוע e = 2.71828… בערך'), ['e = 2.71828']); // '…' stays outside
});

// ─────────────────── fences: Arabic semicolon, tab indentation ───────────────────
test('fences: the ARABIC semicolon ؛ is prose punctuation, not the ";" code signal', () => {
  assert.equal(E.codeBlockIsProse('نص عربي؛ نص آخر'), true);
  assert.equal(E.codeBlockIsProse('שלום; העולם'), false);           // ASCII ';' stays a code signal
  assert.equal(E.codeBlockIsProse('\t\tשלום מוזח'), true);          // indentation alone ≠ code (§8.D)
});

// ─────────────────── round-4 corpus: prefix AND suffix fuzz ───────────────────
const CORPUS4 = [
  'פתוח 9:00-17:00 היום', 'היחס 1:2 < 3:4 בערך', '10^-9 < 10^-6', 'x_-1 < x_0',
  'נוסחה \\(א → ב עוד', 'נוסחה $3 < 5 עוד', '5​0 < 7', '5 ק"ג < 10 ק"ג',
  '?!؟', 'ְִ', ')( 3<5 )(', '[a, (b, c]) < 5', '('.repeat(300) + '3<5',
  'קבוע e = 2.71828… בערך', 'שאלה: 5 < 7', 'e^+2 > 1',
];
const checkSlice = (p, label) => {
  assert.equal(E.segmentMath(p).map((s) => s.value).join(''), p, `round-trip ${label}`);
  let prevEnd = -1;
  for (const [s, e] of E.relationRuns(p)) {
    assert.ok(s >= 0 && e <= p.length && s < e, `bounds ${label}`);
    assert.ok(s >= prevEnd, `disjoint ${label}`);
    prevEnd = e;
  }
  if (E.relationRuns(p).length > 0) assert.equal(E.hasMathRun(p), true, `gate ${label}`);
  assert.ok([null, 'rtl', 'ltr'].includes(E.detectBlockDir(p)), `dir ${label}`);
};
test('fuzz: every PREFIX of the round-4 corpus is crash-free, in-bounds, byte-faithful, gate-sound', () => {
  for (const t of CORPUS4) {
    for (let k = 0; k <= t.length; k++) checkSlice(t.slice(0, k), `prefix @${k}: ${JSON.stringify(t.slice(0, 40))}`);
  }
});
test('fuzz: every SUFFIX too — a re-scan may start mid-token after earlier content settled', () => {
  for (const t of CORPUS4) {
    for (let k = 0; k <= t.length; k++) checkSlice(t.slice(k), `suffix @${k}: ${JSON.stringify(t.slice(0, 40))}`);
  }
});
