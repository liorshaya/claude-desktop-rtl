'use strict';
// engine/__tests__/operands.test.js — EXHAUSTIVE edge cases for comparison-expression operands
// (relationRuns), in BOTH Hebrew and English contexts. Numbers come in many shapes — signed,
// decimal, grouped, percent, degree, currency, Arabic-Indic/Persian — and the run must capture
// the WHOLE operand on each side (so the isolated LTR span reads correctly) without swallowing
// the surrounding prose, a Hebrew prefix (ל-/ב-/ש-), a list comma, or a sentence period.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns } = require('../relations.js');

// readable view: the substrings relationRuns isolates
const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────────── plain integers ───────────────────────────────
test('operands: plain integers (EN context)', () => {
  assert.deepEqual(runs('3 < 5'), ['3 < 5']);
  assert.deepEqual(runs('5 > 3'), ['5 > 3']);
  assert.deepEqual(runs('10 ≤ 20'), ['10 ≤ 20']);
  assert.deepEqual(runs('100 ≥ 99'), ['100 ≥ 99']);
  assert.deepEqual(runs('1000000 < 9999999'), ['1000000 < 9999999']);
  assert.deepEqual(runs('0 ≠ 1'), ['0 ≠ 1']);
  assert.deepEqual(runs('if 3 < 5 then return'), ['3 < 5']);
});
test('operands: plain integers (HE context)', () => {
  assert.deepEqual(runs('הערך 3 < 5 קטן'), ['3 < 5']);
  assert.deepEqual(runs('מתקיים 10 ≤ 20 תמיד'), ['10 ≤ 20']);
  assert.deepEqual(runs('כי 100 > 99 נכון.'), ['100 > 99']);
  assert.deepEqual(runs('בדיקה: 7 ≥ 7 שקול'), ['7 ≥ 7']);
});

// ─────────────────────────────── decimals ───────────────────────────────
test('operands: decimals — the dot joins the number only between digits', () => {
  assert.deepEqual(runs('3.14 < 5'), ['3.14 < 5']);
  assert.deepEqual(runs('0.5 ≤ 0.75'), ['0.5 ≤ 0.75']);
  assert.deepEqual(runs('1.5 < 2.5 < 3.5'), ['1.5 < 2.5 < 3.5']);
  assert.deepEqual(runs('3.14159 > 3.14'), ['3.14159 > 3.14']);
  assert.deepEqual(runs('המספר 2.71 < 3.14 קבוע'), ['2.71 < 3.14']);
  // a sentence period is NOT part of the operand
  assert.deepEqual(runs('7 > 2.'), ['7 > 2']);
  assert.deepEqual(runs('הראינו ש-9 > 4. וזהו'), ['9 > 4']);
  assert.deepEqual(runs('x ≥ 0. ראה'), ['x ≥ 0']);
});

// ─────────────────────────────── thousands separators ───────────────────────────────
test('operands: thousands separators — comma joins only between digits', () => {
  assert.deepEqual(runs('1,000 < 2,000'), ['1,000 < 2,000']);
  assert.deepEqual(runs('1,234,567 > 999,999'), ['1,234,567 > 999,999']);
  assert.deepEqual(runs('1,234.56 < 2,000'), ['1,234.56 < 2,000']);   // grouped + decimal
  assert.deepEqual(runs('המחיר 12,500 > 9,800 שקל'), ['12,500 > 9,800']);
  // a LIST comma (space after) must NOT merge two terms into one operand
  assert.deepEqual(runs('x, y < z'), ['y < z']);
  assert.deepEqual(runs('a, b, c < d'), ['c < d']);
});

// ─────────────────────────────── signed numbers ───────────────────────────────
test('operands: signs — negative, positive, U+2212, both sides', () => {
  assert.deepEqual(runs('-5 < 3'), ['-5 < 3']);
  assert.deepEqual(runs('x > -2'), ['x > -2']);
  assert.deepEqual(runs('-5 < -3'), ['-5 < -3']);
  assert.deepEqual(runs('+5 > +3'), ['+5 > +3']);
  assert.deepEqual(runs('−3 ≤ y'), ['−3 ≤ y']);                 // U+2212 minus
  assert.deepEqual(runs('-2.5 < -1.5'), ['-2.5 < -1.5']);       // signed decimals
  assert.deepEqual(runs('-1,000 < 0'), ['-1,000 < 0']);        // signed grouped
  assert.deepEqual(runs('-5 < x < -1'), ['-5 < x < -1']);       // signed chain
  assert.deepEqual(runs('הטמפרטורה -5 < 0 בחורף'), ['-5 < 0']);
  // a '-' after a letter/digit is NOT a sign: Hebrew prefix and numeric range stay out
  assert.deepEqual(runs('ב-2024 < 2025 קרה'), ['2024 < 2025']);
  assert.deepEqual(runs('ש-3 < 5 ברור'), ['3 < 5']);
});

// ─────────────────────────────── percent ───────────────────────────────
test('operands: percent operands (EN + HE)', () => {
  assert.deepEqual(runs('50% < 75%'), ['50% < 75%']);
  assert.deepEqual(runs('0% ≤ x ≤ 100%'), ['0% ≤ x ≤ 100%']);
  assert.deepEqual(runs('3.5% < 7.5%'), ['3.5% < 7.5%']);
  assert.deepEqual(runs('-5% < 5%'), ['-5% < 5%']);
  assert.deepEqual(runs('the rate 2% < 3% rises'), ['2% < 3%']);
  assert.deepEqual(runs('הריבית 2% < 3% עלתה'), ['2% < 3%']);
  assert.deepEqual(runs('ל-50% ≤ x נגיע'), ['50% ≤ x']);       // Hebrew prefix stays out
});

// ─────────────────────────────── degrees ───────────────────────────────
test('operands: degree operands (temperature)', () => {
  assert.deepEqual(runs('5° < 10°'), ['5° < 10°']);
  assert.deepEqual(runs('-5° < 0°'), ['-5° < 0°']);
  assert.deepEqual(runs('הטמפרטורה -5° < 0° במדבר'), ['-5° < 0°']);
  assert.deepEqual(runs('it was 20° > 15° today'), ['20° > 15°']);
});

// ─────────────────────────────── currency ───────────────────────────────
test('operands: currency prefix / suffix / multiple symbols / signed', () => {
  assert.deepEqual(runs('$5 < $10'), ['$5 < $10']);
  assert.deepEqual(runs('5₪ < 10₪'), ['5₪ < 10₪']);
  assert.deepEqual(runs('€5 < €10'), ['€5 < €10']);
  assert.deepEqual(runs('£100 ≤ £200'), ['£100 ≤ £200']);
  assert.deepEqual(runs('¥1000 > ¥500'), ['¥1000 > ¥500']);
  assert.deepEqual(runs('$1,000 < $2,000'), ['$1,000 < $2,000']);   // currency + grouping
  assert.deepEqual(runs('$9.99 < $10'), ['$9.99 < $10']);           // currency + decimal
  assert.deepEqual(runs('-$5 < $5'), ['-$5 < $5']);                  // signed currency
  assert.deepEqual(runs('x < -$20'), ['x < -$20']);
  assert.deepEqual(runs('המחיר $100 < $200 בחנות'), ['$100 < $200']);
  assert.deepEqual(runs('עולה 50₪ > 30₪ פחות'), ['50₪ > 30₪']);
});

// ─────────────────────────────── digit scripts ───────────────────────────────
test('operands: Arabic-Indic / Persian / mixed digit scripts', () => {
  assert.deepEqual(runs('٣ < ٥'), ['٣ < ٥']);                  // Arabic-Indic
  assert.deepEqual(runs('۵ > ۳'), ['۵ > ۳']);                  // Persian
  assert.deepEqual(runs('٣ < 5'), ['٣ < 5']);                  // mixed AN/EN
  assert.deepEqual(runs('١٠٠ ≤ ٢٠٠'), ['١٠٠ ≤ ٢٠٠']);          // multi-digit Arabic-Indic
  assert.deepEqual(runs('הערך ٣ < ٥ קטן'), ['٣ < ٥']);
});

// ─────────────────────────────── variable operands ───────────────────────────────
test('operands: variables — Latin, Greek, Letterlike, multi-char', () => {
  assert.deepEqual(runs('a < b'), ['a < b']);
  assert.deepEqual(runs('x ≤ y'), ['x ≤ y']);
  assert.deepEqual(runs('foo < bar'), ['foo < bar']);          // multi-char identifiers
  assert.deepEqual(runs('x1 < x2'), ['x1 < x2']);              // letter+digit
  assert.deepEqual(runs('π ≥ 3'), ['π ≥ 3']);                  // Greek
  assert.deepEqual(runs('α < β < γ'), ['α < β < γ']);          // Greek chain
  assert.deepEqual(runs('ℕ ⊂ ℤ ⊂ ℝ'), ['ℕ ⊂ ℤ ⊂ ℝ']);          // Letterlike chain
  assert.deepEqual(runs('the var n > 0 here'), ['n > 0']);
});

// ─────────────────────────────── chains & mixed operators ───────────────────────────────
test('operands: chained comparisons & mixed operators', () => {
  assert.deepEqual(runs('0 < x ≤ 4'), ['0 < x ≤ 4']);
  assert.deepEqual(runs('1 ≤ n ≤ 100'), ['1 ≤ n ≤ 100']);
  assert.deepEqual(runs('a < b < c < d'), ['a < b < c < d']);
  assert.deepEqual(runs('0 ≤ i < n'), ['0 ≤ i < n']);
  assert.deepEqual(runs('x < y > z'), ['x < y > z']);
  assert.deepEqual(runs('1 < 2 ≤ 3 < 4 ≤ 5'), ['1 < 2 ≤ 3 < 4 ≤ 5']);
  assert.deepEqual(runs('0 ≤ x = y ≤ 1'), ['0 ≤ x = y ≤ 1']);  // `=` chains within
  assert.deepEqual(runs('-1 ≤ x ≤ 1'), ['-1 ≤ x ≤ 1']);        // signed bound + variable + bound
  assert.deepEqual(runs('0 < a ≤ b < c ≤ 9'), ['0 < a ≤ b < c ≤ 9']);
});

test('operands: KNOWN LIMIT — a space-separated multi-token operand ("cos θ") still splits', () => {
  // A single operand spanning a SPACE with no operator (a function application like "cos θ") is
  // out of scope: each side of a relation is one token, so the run splits at the space. (An
  // ARITHMETIC join like "n + 1" IS pulled in now — see the arithmetic tests.)
  assert.deepEqual(runs('-1 ≤ cos θ ≤ 1'), ['-1 ≤ cos', 'θ ≤ 1']);
  assert.deepEqual(runs('0 < n + 1'), ['0 < n + 1']); // "+ 1" chains in via the arithmetic operator
});

// ─────────────────────────────── mixed operand types ───────────────────────────────
test('operands: mixed types across one comparison', () => {
  assert.deepEqual(runs('0 < x'), ['0 < x']);                  // number vs variable
  assert.deepEqual(runs('x ≥ 10'), ['x ≥ 10']);
  assert.deepEqual(runs('50% < x'), ['50% < x']);              // percent vs variable
  assert.deepEqual(runs('$5 < price'), ['$5 < price']);        // currency vs word
  assert.deepEqual(runs('n ≤ 1,000'), ['n ≤ 1,000']);         // variable vs grouped number
  assert.deepEqual(runs('-3.5 < π'), ['-3.5 < π']);            // signed decimal vs Greek
});

// ─────────────────────────────── whitespace variants ───────────────────────────────
test('operands: spacing variants — none, single, multiple', () => {
  assert.deepEqual(runs('x<5'), ['x<5']);
  assert.deepEqual(runs('5<x'), ['5<x']);
  assert.deepEqual(runs('0≤x≤4'), ['0≤x≤4']);
  assert.deepEqual(runs('3   <   5'), ['3   <   5']);          // extra spaces kept inside the run
  assert.deepEqual(runs('-5<3'), ['-5<3']);
  assert.deepEqual(runs('50%<75%'), ['50%<75%']);
});

// ─────────────────────────────── set / order relations ───────────────────────────────
test('operands: set & order relations grow over their operands', () => {
  assert.deepEqual(runs('x ∈ S'), ['x ∈ S']);
  assert.deepEqual(runs('A ⊂ B ⊆ C'), ['A ⊂ B ⊆ C']);
  assert.deepEqual(runs('3 ∈ N'), ['3 ∈ N']);
  assert.deepEqual(runs('a ≺ b ≼ c'), ['a ≺ b ≼ c']);
  assert.deepEqual(runs('האיבר x ∈ S שייך'), ['x ∈ S']);
});

// ─────────────────────────────── multiple expressions per line ───────────────────────────────
test('operands: several independent comparisons on one line', () => {
  assert.deepEqual(runs('3 < 5 and 7 > 2'), ['3 < 5', '7 > 2']);
  assert.deepEqual(runs('כי 3 < 5 וגם 7 > 2 נכון'), ['3 < 5', '7 > 2']);
  assert.deepEqual(runs('$5 < $10, 50% > 25%'), ['$5 < $10', '50% > 25%']);
  assert.deepEqual(runs('a < b. c > d. e ≤ f'), ['a < b', 'c > d', 'e ≤ f']);
});

// ─────────────────────────────── prose is NOT swallowed ───────────────────────────────
test('operands: surrounding words/prose are never pulled into the run', () => {
  assert.deepEqual(runs('3 < 5 and more text'), ['3 < 5']);
  assert.deepEqual(runs('x > 0 therefore positive'), ['x > 0']);
  assert.deepEqual(runs('הערך 5 > 3 גדול מאוד'), ['5 > 3']);
  assert.deepEqual(runs('price < 100 USD only'), ['price < 100']); // "price" is a Latin operand; USD not pulled
  assert.deepEqual(runs('בין 5 < 10 לערכים'), ['5 < 10']);
});

// ─────────────────────────────── lone relations & non-operands ───────────────────────────────
test('operands: a relation with no operand on a side stays minimal', () => {
  assert.deepEqual(runs('הסימן < מציין קטן'), ['<']);           // Hebrew both sides → lone char
  assert.deepEqual(runs('< 5'), ['< 5']);                       // no left operand
  assert.deepEqual(runs('value >'), ['value >']);               // no right operand
  assert.deepEqual(runs('שלוש < חמש'), ['<']);                  // Hebrew number-WORDS aren't operands
});

// ─────────────────────────────── things that must NOT trigger ───────────────────────────────
test('operands: brackets / arrows / prose are not isolated, but numeric arithmetic IS', () => {
  assert.deepEqual(runs('f(3) = 5'), []);          // ")" blocks the left operand of "="
  assert.deepEqual(runs('n ≡ 0 (mod 2)'), []);     // ≡ is symmetric — not an operator we seed
  assert.deepEqual(runs('[a] {b} (c)'), []);        // brackets only
  assert.deepEqual(runs('a → b ⇒ c'), []);          // arrows (handled elsewhere)
  assert.deepEqual(runs('שלום עולם'), []);
  // numeric arithmetic DOES reorder in RTL, so it is isolated LTR like a comparison
  assert.deepEqual(runs('2 + 3 × 4'), ['2 + 3 × 4']);
  assert.deepEqual(runs('טווח 5-10 מעלות'), ['5-10']); // a numeric range reorders → isolated
});

// ─────────────────────────────── HTML tags stay excluded ───────────────────────────────
test('operands: HTML-tag < > excluded; a real comparison beside a tag still isolates', () => {
  assert.deepEqual(runs('<div>'), []);
  assert.deepEqual(runs('<p>טקסט</p>'), []);
  assert.deepEqual(runs('3 < 5 ובקוד <span>'), ['3 < 5']);
  assert.deepEqual(runs('List<int> ו-3 < 5'), ['3 < 5']);
  assert.deepEqual(runs('use <br/> and check 0 < x ≤ 4 here'), ['0 < x ≤ 4']);
});

// ─────────────────────────────── exact offsets / astral-safe ───────────────────────────────
test('operands: offsets are exact UTF-16 ranges and astral-safe', () => {
  assert.deepEqual(relationRuns('3 < 5'), [[0, 5]]);
  assert.deepEqual(relationRuns('ab 3 < 5 cd'), [[3, 8]]);
  // an emoji (astral, 2 UTF-16 units) before the comparison shifts every index by 2
  const t = '😀 50% < 75%';
  assert.deepEqual(runs(t), ['50% < 75%']);
  assert.deepEqual(relationRuns(t), [[t.indexOf('5'), t.length]]);
  assert.deepEqual(relationRuns(''), []);
});
