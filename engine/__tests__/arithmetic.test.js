'use strict';
// engine/__tests__/arithmetic.test.js — plain arithmetic ("15 + 7 = 22"). The operators + - × ÷ =
// · ∗ ⋅ ± ∓ * / are NOT Bidi_Mirrored (their glyphs are fine in RTL), but their NUMBER operands
// are weak, so an RTL paragraph reorders them: "15 + 7 = 22" renders "22 = 7 + 15". relationRuns
// therefore isolates an all-weak arithmetic run LTR, exactly like a comparison. A leading SIGN
// ("-5", "low -40°C") is NOT a binary operator and is left to signedNumberRuns; a letters-only
// run ("a = b", "well-known") carries no digit and does not reorder. Hebrew, English, edge cases.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns, hasMathRun } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────── the four basic operations (EN) ───────────────────────────
test('arithmetic: + - × ÷ with = isolate the whole equation (English)', () => {
  assert.deepEqual(runs('15 + 7 = 22'), ['15 + 7 = 22']);
  assert.deepEqual(runs('100 - 30 = 70'), ['100 - 30 = 70']);
  assert.deepEqual(runs('5 × 4 = 20'), ['5 × 4 = 20']);
  assert.deepEqual(runs('12 ÷ 3 = 4'), ['12 ÷ 3 = 4']);
  assert.deepEqual(runs('2 + 3 = 5'), ['2 + 3 = 5']);
  assert.deepEqual(runs('the sum 15 + 7 = 22 is correct'), ['15 + 7 = 22']);
});
// ─────────────────────────── …and in Hebrew prose ───────────────────────────
test('arithmetic: the same equations inside Hebrew sentences', () => {
  assert.deepEqual(runs('בתרגיל 15 + 7 = 22 קיבלנו'), ['15 + 7 = 22']);
  assert.deepEqual(runs('חישוב 100 - 30 = 70 פשוט'), ['100 - 30 = 70']);
  assert.deepEqual(runs('מכפלה 5 × 4 = 20 כאן'), ['5 × 4 = 20']);
  assert.deepEqual(runs('חילוק 12 ÷ 3 = 4 שווה'), ['12 ÷ 3 = 4']);
  assert.deepEqual(runs('נתון ש-2 + 2 = 4 תמיד'), ['2 + 2 = 4']);
});

// ─────────────────────────── more operators ───────────────────────────
test('arithmetic: middle-dot / asterisk / ± / slash operators', () => {
  assert.deepEqual(runs('3 · 4 = 12'), ['3 · 4 = 12']);
  assert.deepEqual(runs('3 ∗ 4 = 12'), ['3 ∗ 4 = 12']);
  assert.deepEqual(runs('5 * 6 = 30'), ['5 * 6 = 30']);
  assert.deepEqual(runs('10 ± 2'), ['10 ± 2']);
  assert.deepEqual(runs('1/2 + 1/4 = 3/4'), ['1/2 + 1/4 = 3/4']);
  assert.deepEqual(runs('12 / 4 = 3'), ['12 / 4 = 3']);
});

// ─────────────────────────── chains & precedence (still one run) ───────────────────────────
test('arithmetic: chained operations are one isolated run', () => {
  assert.deepEqual(runs('2 + 3 + 4 = 9'), ['2 + 3 + 4 = 9']);
  assert.deepEqual(runs('1 + 2 × 3 = 7'), ['1 + 2 × 3 = 7']);
  assert.deepEqual(runs('100 - 20 - 30 = 50'), ['100 - 20 - 30 = 50']);
  assert.deepEqual(runs('2 × 3 × 4 = 24'), ['2 × 3 × 4 = 24']);
  assert.deepEqual(runs('10 + 5 - 3 = 12'), ['10 + 5 - 3 = 12']);
});

// ─────────────────────────── decimals / grouping / negatives / exponents ───────────────────────────
test('arithmetic: decimal, grouped, negative, and exponent operands', () => {
  assert.deepEqual(runs('1.5 + 2.5 = 4.0'), ['1.5 + 2.5 = 4.0']);
  assert.deepEqual(runs('1,000 + 500 = 1,500'), ['1,000 + 500 = 1,500']);
  assert.deepEqual(runs('-5 + 3 = -2'), ['-5 + 3 = -2']);            // signed operands, binary +/=
  assert.deepEqual(runs('5 - 10 = -5'), ['5 - 10 = -5']);
  assert.deepEqual(runs('2^3 = 8'), ['2^3 = 8']);                    // exponent binds the operand
  assert.deepEqual(runs('2^10 = 1024'), ['2^10 = 1024']);
  assert.deepEqual(runs('a_1 + a_2 = b'), ['a_1 + a_2 = b']);        // subscripts bind
});

// ─────────────────────────── percent / currency / unit operands ───────────────────────────
test('arithmetic: percent, currency, and unit operands', () => {
  assert.deepEqual(runs('50% + 25% = 75%'), ['50% + 25% = 75%']);
  assert.deepEqual(runs('$5 + $10 = $15'), ['$5 + $10 = $15']);
  assert.deepEqual(runs('100°C = 212°F'), ['100°C = 212°F']);
  assert.deepEqual(runs('הנחה 20% + 5% = 25% סהכ'), ['20% + 5% = 25%']);
});

// ─────────────────────────── arithmetic + comparison together ───────────────────────────
test('arithmetic: a run mixing arithmetic and comparison is still one expression', () => {
  assert.deepEqual(runs('15 + 7 < 30'), ['15 + 7 < 30']);
  assert.deepEqual(runs('2 + 2 = 4 < 5'), ['2 + 2 = 4 < 5']);
  assert.deepEqual(runs('0 < 3 + 4 ≤ 10'), ['0 < 3 + 4 ≤ 10']);
  assert.deepEqual(runs('בדוק ש-5 × 2 = 10 > 8'), ['5 × 2 = 10 > 8']);
});

// ─────────────────────────── a SIGN is NOT a binary operator (no over-grab) ───────────────────────────
test('arithmetic: a leading sign does not grab the preceding word', () => {
  assert.deepEqual(runs('the low -40°C < -20°C froze'), ['-40°C < -20°C']); // "low" stays out
  assert.deepEqual(runs('range -10°C < t < 40°C holds'), ['-10°C < t < 40°C']);
  assert.deepEqual(runs('טמפ -5 מעלות'), []);            // a standalone sign → not an expression
  assert.deepEqual(runs('ירידה של -5 עד +5'), []);       // signs only, no binary op
  assert.deepEqual(runs('הערך הוא -273.15 בלבד'), []);
});

// ─────────────────────────── letters-only / non-numeric → NOT isolated ───────────────────────────
test('arithmetic: a non-numeric run carries no digit and is never isolated', () => {
  assert.deepEqual(runs('a = b'), []);
  assert.deepEqual(runs('x + y'), []);
  assert.deepEqual(runs('well-known term'), []);
  assert.deepEqual(runs('state-of-the-art'), []);
  assert.deepEqual(runs('and/or maybe'), []);
  assert.deepEqual(runs('TCP/IP protocol'), []);
  assert.deepEqual(runs('f(3) = 5'), []);                // ")" blocks the operand of "="
});

// ─────────────────────────── boundaries: period, comma, prose ───────────────────────────
test('arithmetic: a sentence period / list comma ends the run cleanly', () => {
  assert.deepEqual(runs('הראינו ש-2 + 2 = 4. נכון'), ['2 + 2 = 4']);
  assert.deepEqual(runs('values 1 + 1 = 2, 2 + 2 = 4'), ['1 + 1 = 2', '2 + 2 = 4']);
  assert.deepEqual(runs('the answer 7 × 8 = 56 here'), ['7 × 8 = 56']);
});

// ─────────────────────────── the hasMathRun gate (what the DOM checks first) ───────────────────────────
test('arithmetic: hasMathRun gates the DOM pass — true for math, false otherwise', () => {
  assert.equal(hasMathRun('15 + 7 = 22'), true);
  assert.equal(hasMathRun('3 < 5'), true);              // mirrored relation
  assert.equal(hasMathRun('a < b'), true);              // mirrored relation, no digit needed
  assert.equal(hasMathRun('בתרגיל 5 × 4 = 20 כאן'), true);
  assert.equal(hasMathRun('hello world'), false);
  assert.equal(hasMathRun('a + b'), false);             // arithmetic op but NO digit → no reorder
  assert.equal(hasMathRun('version 1.2.3'), false);     // digits but no operator
  assert.equal(hasMathRun('5 apples and 3 oranges'), false);
  assert.equal(hasMathRun('שלום עולם'), false);
  assert.equal(hasMathRun(''), false);
});
