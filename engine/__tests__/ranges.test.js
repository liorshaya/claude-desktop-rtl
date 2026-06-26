'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isStrongRTL, isStrongLTR, isRTLDigit, hasRTL } = require('../ranges.js');

const cp = (s) => s.codePointAt(0);

test('isStrongRTL: living + historic RTL scripts', () => {
  assert.equal(isStrongRTL(cp('א')), true); // Hebrew
  assert.equal(isStrongRTL(cp('ب')), true); // Arabic
  assert.equal(isStrongRTL(cp('ܐ')), true); // Syriac
  assert.equal(isStrongRTL(cp('ހ')), true); // Thaana
  assert.equal(isStrongRTL(cp('ߒ')), true); // NKo
  assert.equal(isStrongRTL(0xFB1D), true);  // Hebrew presentation form
  assert.equal(isStrongRTL(0xFB50), true);  // Arabic presentation form A
  assert.equal(isStrongRTL(0x1E900), true); // Adlam (astral)
});

test('isStrongRTL: false for LTR/neutral/digits', () => {
  assert.equal(isStrongRTL(cp('A')), false);
  assert.equal(isStrongRTL(cp('5')), false);
  assert.equal(isStrongRTL(cp(' ')), false);
  assert.equal(isStrongRTL(cp('.')), false);
});

test('isStrongLTR: Latin/Greek/Cyrillic true, RTL/neutral false', () => {
  assert.equal(isStrongLTR(cp('A')), true);
  assert.equal(isStrongLTR(cp('a')), true);
  assert.equal(isStrongLTR(cp('α')), true); // Greek
  assert.equal(isStrongLTR(cp('Я')), true); // Cyrillic
  assert.equal(isStrongLTR(cp('א')), false);
  assert.equal(isStrongLTR(cp('ب')), false);
  assert.equal(isStrongLTR(cp('5')), false);
  assert.equal(isStrongLTR(cp(' ')), false);
});

test('isRTLDigit: Arabic-Indic + Persian only', () => {
  assert.equal(isRTLDigit(0x0661), true); // Arabic-Indic ١
  assert.equal(isRTLDigit(0x06F1), true); // Persian ۱
  assert.equal(isRTLDigit(cp('5')), false);
});

test('hasRTL', () => {
  assert.equal(hasRTL('Hello עולם'), true);
  assert.equal(hasRTL('Hello world'), false);
  assert.equal(hasRTL('12345'), false);
  assert.equal(hasRTL(''), false);
});
