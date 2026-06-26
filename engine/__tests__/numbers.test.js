'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isENDigit, isANDigit, isDigit, digitScript, leadingNumber } = require('../numbers.js');

const cp = (s) => s.codePointAt(0);

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
