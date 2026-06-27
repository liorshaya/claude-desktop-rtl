'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isENDigit, isANDigit, isDigit, digitScript, leadingNumber, signedNumberRuns,
} = require('../numbers.js');

const cp = (s) => s.codePointAt(0);
// the actual signed-number substrings (readable view of the offset ranges)
const signed = (t) => signedNumberRuns(t).map(([s, e]) => t.slice(s, e));

test('digit predicates', () => {
  assert.equal(isENDigit(cp('5')), true);
  assert.equal(isENDigit(0x0661), false);
  assert.equal(isANDigit(0x0661), true); // Arabic-Indic
  assert.equal(isANDigit(0x06F1), true); // Persian/Eastern
  assert.equal(isANDigit(cp('5')), false);
  assert.equal(isDigit(cp('5')), true);
  assert.equal(isDigit(0x0661), true);
  assert.equal(isDigit(cp('x')), false);
});

test('digitScript', () => {
  assert.equal(digitScript('123'), 'EN');
  assert.equal(digitScript('١٢٣'), 'AN');   // Arabic-Indic
  assert.equal(digitScript('۱۲۳'), 'AN');   // Persian
  assert.equal(digitScript('12 ١٢'), 'mixed');
  assert.equal(digitScript('abc'), null);
  assert.equal(digitScript(''), null);
});

test('leadingNumber: signs, separators, currency, percent', () => {
  assert.equal(leadingNumber('2,200 ₪ זה המחיר'), '2,200');
  assert.equal(leadingNumber('$5.99 text'), '$5.99');
  assert.equal(leadingNumber('-5 apples'), '-5');
  assert.equal(leadingNumber('50% מהזמן'), '50%');
  assert.equal(leadingNumber('5₪ בלבד'), '5₪');
  assert.equal(leadingNumber('hello'), '');
  assert.equal(leadingNumber('v4.6'), ''); // version is a dotted token, not a number-led token
});

// ── signedNumberRuns: the leading sign of "-5"/"+3" must isolate (RTL renders it "5-") ──

test('signedNumberRuns: a sign at a word boundary + digits IS a signed number', () => {
  assert.deepEqual(signed('-5'), ['-5']);
  assert.deepEqual(signed('+3'), ['+3']);
  assert.deepEqual(signed('−5'), ['−5']);              // U+2212 minus sign
  assert.deepEqual(signed('-5.5'), ['-5.5']);
  assert.deepEqual(signed('-1,234.56'), ['-1,234.56']);
  assert.deepEqual(signed('-٥'), ['-٥']);               // Arabic-Indic digit
  assert.deepEqual(signed('טמפרטורה של -5 מעלות'), ['-5']);
  assert.deepEqual(signed('(-5)'), ['-5']);             // after "(" → boundary
  assert.deepEqual(signed('x=-5'), ['-5']);             // after "=" → boundary
});

test('signedNumberRuns: the Hebrew prefix "ל-15" is NOT a signed number', () => {
  assert.deepEqual(signed('המילה ל-15 כאן'), []);
  assert.deepEqual(signed('ב-2024 קרה'), []);
  // the exact reported sentence: only the "-5" isolates, "ל-15" is left alone
  assert.deepEqual(signed('הטמפרטורה נעה בין -5 ל-15 מעלות.'), ['-5']);
});

test('signedNumberRuns: a numeric RANGE "5-10" is NOT a signed number', () => {
  assert.deepEqual(signed('טווח 5-10 מעלות'), []);
  assert.deepEqual(signed('03-1234567'), []);          // phone
  assert.deepEqual(signed('2024-01-15'), []);          // date
  assert.deepEqual(signed('version 1.2-3'), []);       // the -3 follows a digit
});

test('signedNumberRuns: subtraction operator (sign with a space/digit) is NOT matched', () => {
  assert.deepEqual(signed('5 − 3'), []);   // space after the sign → not a leading sign
  assert.deepEqual(signed('5−3'), []);     // sign after a digit → not a boundary
  assert.deepEqual(signed('a - b'), []);   // no digits at all
});

test('signedNumberRuns: multiple signs in one Hebrew line, offsets correct', () => {
  assert.deepEqual(signed('ערך -5 וגם -10 וגם +3 כאן.'), ['-5', '-10', '+3']);
  assert.deepEqual(signed('בין -5 ל-15, ובין -10 ל-20'), ['-5', '-10']);
  const t = 'ערך -5 וגם +3';
  assert.deepEqual(signedNumberRuns(t), [[t.indexOf('-5'), t.indexOf('-5') + 2],
    [t.indexOf('+3'), t.indexOf('+3') + 2]]);
});

test('signedNumberRuns: none / empty', () => {
  assert.deepEqual(signed(''), []);
  assert.deepEqual(signed('שלום עולם'), []);
  assert.deepEqual(signed('5 מעלות'), []);   // bare number, no sign
  assert.deepEqual(signed('100%'), []);
});
