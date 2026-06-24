'use strict';
// §3.4 / §8.B number torture corpus — does the engine handle numbers next to RTL well?
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectBlockDir } = require('../detect.js');
const { digitScript, leadingNumber } = require('../numbers.js');

test('Hebrew/Arabic lines that OPEN with a number still read RTL', () => {
  for (const s of [
    '2,200 ₪ זה המחיר',
    '5–10% מהזמן',
    '-5 מעלות בחוץ',
    '+5 נקודות זכות',
    '±5 טווח שגיאה',
    '50% הנחה',
    '₪5 בלבד',
    '5₪ בלבד',
    '$5.99 לפריט',
    '192.168.1.1 היא הכתובת',
    '2024-01-15 הוא התאריך',
    '03-1234567 הוא הטלפון',
    'v4.6 שוחררה',
    '٥٠٪ من الوقت',         // Arabic-Indic + percent
    '۱۲۳ سلام دنیا',        // Persian (Eastern) digits
  ]) {
    assert.equal(detectBlockDir(s), 'rtl', s);
  }
});

test('numbers mid-Hebrew never disturb the RTL base', () => {
  assert.equal(detectBlockDir('יש לי 5 כלבים ו-3 חתולים'), 'rtl');
  assert.equal(detectBlockDir('המחיר הוא $5.99 לפריט'), 'rtl');
  assert.equal(detectBlockDir('גרסה 1.2.3 יצאה ב-2024'), 'rtl');
});

test('bare / English numbers do NOT get forced RTL (fallback stays null/ltr)', () => {
  assert.equal(detectBlockDir('12345'), null);
  assert.equal(detectBlockDir('3.14159'), null);
  assert.equal(detectBlockDir('$5.99'), null);
  assert.equal(detectBlockDir('5 to 10 dollars'), 'ltr');
  assert.equal(detectBlockDir('-5 degrees outside'), 'ltr');
});

test('digit script classification (EN vs AN)', () => {
  assert.equal(digitScript('1,234.56'), 'EN');
  assert.equal(digitScript('٥٠'), 'AN');     // Arabic-Indic
  assert.equal(digitScript('۱۲۳'), 'AN');    // Persian
  assert.equal(digitScript('12 و ٣٤'), 'mixed');
  assert.equal(digitScript('שלום'), null);
});

test('leadingNumber peels the whole number-led token (signs, separators, currency, %)', () => {
  assert.equal(leadingNumber('2,200 ₪'), '2,200');
  assert.equal(leadingNumber('$5.99 x'), '$5.99');
  assert.equal(leadingNumber('-5 x'), '-5');
  assert.equal(leadingNumber('+5'), '+5');
  assert.equal(leadingNumber('±5'), '±5');
  assert.equal(leadingNumber('50% x'), '50%');
  assert.equal(leadingNumber('5₪ x'), '5₪');
  assert.equal(leadingNumber('₪5 x'), '₪5');
  assert.equal(leadingNumber('192.168.1.1 x'), '192.168.1.1');
  assert.equal(leadingNumber('2024-01-15 x'), '2024-01-15'); // date as one token
  assert.equal(leadingNumber('03-1234567 x'), '03-1234567'); // phone as one token
  assert.equal(leadingNumber('hello'), '');
});
