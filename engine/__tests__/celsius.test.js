'use strict';
// engine/__tests__/celsius.test.js — temperature units (°C / °F / K, and the single-char ℃ ℉)
// as comparison operands, in Hebrew (RTL) and English (LTR). The tricky part is "°C": a number,
// a degree sign, and a unit LETTER must be captured as ONE operand, or the relation run breaks
// ("25°C < 30°C" must isolate the whole thing, not "C < 30°"). The single-char ℃ (U+2103) is a
// Letterlike symbol so it already rides along with its digits.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns } = require('../relations.js');
const { signedNumberRuns } = require('../numbers.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));
const signed = (t) => signedNumberRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────── basic °C comparisons ───────────────────────────
test('celsius: basic comparisons capture the whole "N°C" operand (EN)', () => {
  assert.deepEqual(runs('25°C < 30°C'), ['25°C < 30°C']);
  assert.deepEqual(runs('30°C > 25°C'), ['30°C > 25°C']);
  assert.deepEqual(runs('25°C ≤ 25°C'), ['25°C ≤ 25°C']);
  assert.deepEqual(runs('100°C ≥ 0°C'), ['100°C ≥ 0°C']);
  assert.deepEqual(runs('the temperature 25°C < 30°C today'), ['25°C < 30°C']);
});
test('celsius: basic comparisons (HE)', () => {
  assert.deepEqual(runs('הטמפרטורה 25°C < 30°C ביום'), ['25°C < 30°C']);
  assert.deepEqual(runs('כאשר 0°C < 100°C המים נוזליים'), ['0°C < 100°C']);
  assert.deepEqual(runs('מדדנו ש-20°C > 15°C אתמול'), ['20°C > 15°C']);
});

// ─────────────────────────── negative °C (freezing) ───────────────────────────
test('celsius: negative temperatures keep their sign and unit', () => {
  assert.deepEqual(runs('-5°C < 0°C'), ['-5°C < 0°C']);
  assert.deepEqual(runs('-10°C < -5°C'), ['-10°C < -5°C']);
  assert.deepEqual(runs('-273.15°C ≤ T'), ['-273.15°C ≤ T']);       // absolute zero
  assert.deepEqual(runs('היום -5°C < 5°C בחוץ'), ['-5°C < 5°C']);
  assert.deepEqual(runs('the low -40°C < -20°C froze'), ['-40°C < -20°C']);
});

// ─────────────────────────── decimal °C (body temperature) ───────────────────────────
test('celsius: decimal temperatures', () => {
  assert.deepEqual(runs('36.6°C < 37.5°C'), ['36.6°C < 37.5°C']);
  assert.deepEqual(runs('0.5°C > 0.1°C'), ['0.5°C > 0.1°C']);
  assert.deepEqual(runs('חום של 38.2°C > 37°C גבוה'), ['38.2°C > 37°C']);
  assert.deepEqual(runs('a fever 38.2°C > 37.0°C is high'), ['38.2°C > 37.0°C']);
});

// ─────────────────────────── ranges / chains ───────────────────────────
test('celsius: chained ranges', () => {
  assert.deepEqual(runs('0°C ≤ T ≤ 100°C'), ['0°C ≤ T ≤ 100°C']);
  assert.deepEqual(runs('-40°C ≤ x ≤ 50°C'), ['-40°C ≤ x ≤ 50°C']);
  assert.deepEqual(runs('36.5°C ≤ T ≤ 37.5°C'), ['36.5°C ≤ T ≤ 37.5°C']);
  assert.deepEqual(runs('בקטע 0°C ≤ T ≤ 100°C המים'), ['0°C ≤ T ≤ 100°C']);
  assert.deepEqual(runs('range -10°C < t < 40°C holds'), ['-10°C < t < 40°C']);
});

// ─────────────────────────── °F (Fahrenheit) and K (Kelvin) ───────────────────────────
test('celsius: Fahrenheit and Kelvin units', () => {
  assert.deepEqual(runs('32°F < 212°F'), ['32°F < 212°F']);
  assert.deepEqual(runs('98.6°F > 37°C'), ['98.6°F > 37°C']);       // mixed F/C operands
  assert.deepEqual(runs('300K < 400K'), ['300K < 400K']);          // Kelvin (no degree sign)
  assert.deepEqual(runs('273K ≤ T ≤ 373K'), ['273K ≤ T ≤ 373K']);
  assert.deepEqual(runs('מ-32°F עד 212°F: 32°F < 212°F'), ['32°F < 212°F']);
});

// ─────────────────────────── single-char ℃ ℉ (U+2103 / U+2109) ───────────────────────────
test('celsius: the precomposed ℃ / ℉ glyphs ride along with their digits', () => {
  assert.deepEqual(runs('25℃ < 30℃'), ['25℃ < 30℃']);
  assert.deepEqual(runs('77℉ > 32℉'), ['77℉ > 32℉']);
  assert.deepEqual(runs('5℃ < 9℃'), ['5℃ < 9℃']);
  assert.deepEqual(runs('הטמפרטורה 25℃ < 30℃ נמדדה'), ['25℃ < 30℃']);
});

// ─────────────────────────── SI space "25 °C" ───────────────────────────
test('celsius: the SI form with a space before the degree ("25 °C")', () => {
  assert.deepEqual(runs('25 °C < 30 °C'), ['25 °C < 30 °C']);
  assert.deepEqual(runs('98.6 °F > 37 °C'), ['98.6 °F > 37 °C']);
  assert.deepEqual(runs('0 °C ≤ T ≤ 100 °C'), ['0 °C ≤ T ≤ 100 °C']);
  assert.deepEqual(runs('הטמפרטורה 25 °C < 30 °C היום'), ['25 °C < 30 °C']);
  // the guard is tight: a space NOT followed by a degree never merges a following word
  assert.deepEqual(runs('25 apples < 30 oranges'), ['apples < 30']);
});

// ─────────────────────────── °C vs a variable ───────────────────────────
test('celsius: a temperature compared with a variable', () => {
  assert.deepEqual(runs('T < 25°C'), ['T < 25°C']);
  assert.deepEqual(runs('25°C ≥ T'), ['25°C ≥ T']);
  assert.deepEqual(runs('x°C < 25°C'), ['x°C < 25°C']);            // even a symbolic temperature
  assert.deepEqual(runs('אם T < 25°C אז קריר'), ['T < 25°C']);
});

// ─────────────────────────── Hebrew prefixes ב-/ל- ───────────────────────────
test('celsius: a Hebrew one-letter prefix is not pulled into the operand', () => {
  assert.deepEqual(runs('ב-25°C < 30°C חם'), ['25°C < 30°C']);
  assert.deepEqual(runs('עלה מ-20°C ל-30°C: 20°C < 30°C'), ['20°C < 30°C']);
  assert.deepEqual(runs('ב-25°C גבוה'), []); // no relation → nothing isolated
});

// ─────────────────────────── the plain angle ° must still work ───────────────────────────
test('celsius: a bare degree (angle, no unit letter) is unaffected', () => {
  assert.deepEqual(runs('90° > 45°'), ['90° > 45°']);
  assert.deepEqual(runs('360° ≥ 180°'), ['360° ≥ 180°']);
  assert.deepEqual(runs('5° < 10°'), ['5° < 10°']);
  assert.deepEqual(runs('הזווית 90° > 45° גדולה'), ['90° > 45°']);
});

// ─────────────────────────── boundaries: period, parens, comma, = , ± ───────────────────────────
test('celsius: boundaries — period, parens, comma, equals, plus-minus', () => {
  assert.deepEqual(runs('הגענו ל-25°C. עכשיו'), []);                // a value, no comparison
  assert.deepEqual(runs('(0°C < 100°C)'), ['0°C < 100°C']);         // parens left to UBA
  assert.deepEqual(runs('25°C, 30°C, 35°C'), []);                   // a list, no comparison
  assert.deepEqual(runs('הראינו ש-25°C < 30°C. נכון'), ['25°C < 30°C']); // period ends the run
  // `=` and `±` ARE arithmetic operators between numeric operands → the equation is isolated LTR
  assert.deepEqual(runs('100°C = 212°F'), ['100°C = 212°F']);       // conversion equation
  assert.deepEqual(runs('37°C ± 0.5°C'), ['37°C ± 0.5°C']);
});

// ─────────────────────────── signed temperatures (standalone, not a comparison) ───────────────────────────
test('celsius: signedNumberRuns isolates the sign of a standalone -N°C', () => {
  assert.deepEqual(signed('הטמפרטורה היא -5°C היום'), ['-5']);
  assert.deepEqual(signed('it dropped to -5°C overnight'), ['-5']);
  assert.deepEqual(signed('from -40°C to -10°C'), ['-40', '-10']);
  assert.deepEqual(signed('בין -5°C ל-15°C'), ['-5']);             // "ל-15" is a prefix, not a sign
});

// ─────────────────────────── documented limitation ───────────────────────────
test('celsius: KNOWN LIMIT — a space AFTER the degree ("25° C") is not captured', () => {
  // "25° C" (space between ° and the unit) is rare and ambiguous with "5° and …", so the unit
  // letter is left out. The common "25°C" and the SI "25 °C" both work. Locked for awareness.
  assert.deepEqual(runs('25° C < 30° C'), ['C < 30°']);
});
