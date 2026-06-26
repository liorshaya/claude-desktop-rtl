'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeCode, codeBlockIsProse } = require('../code.js');

test('looksLikeCode: real code true', () => {
  assert.equal(looksLikeCode('def sum_list(numbers):\n    return sum(numbers)'), true);
  assert.equal(looksLikeCode('const x = 5;'), true);
  assert.equal(looksLikeCode('if (a && b) { return 1; }'), true);
  assert.equal(looksLikeCode('<div class="x">hi</div>'), true);
  assert.equal(looksLikeCode('SELECT * FROM users'), true);
});

test('looksLikeCode: plain prose false', () => {
  assert.equal(looksLikeCode('תה ירוק → 75-80°C'), false);
  assert.equal(looksLikeCode('שלום עולם, מה שלומך היום'), false);
  assert.equal(looksLikeCode('green tea steeps gently'), false);
});

test('codeBlockIsProse: Hebrew-text fences flip, real code stays LTR', () => {
  // The mis-fenced "table" from the corpus → prose
  assert.equal(codeBlockIsProse('תה ירוק   →  75-80°C\nתה שחור   →  95-100°C'), true);
  assert.equal(codeBlockIsProse('שלום עולם\nמה שלומך'), true);
  // Real code WITH a Hebrew comment → still code (must NOT flip; would scramble)
  assert.equal(codeBlockIsProse('# הפונקציה הזו מחזירה סכום\ndef sum_list(numbers):\n    return sum(numbers)'), false);
  // No RTL at all → never touched
  assert.equal(codeBlockIsProse('const x = 5;'), false);
  assert.equal(codeBlockIsProse('ls -la /home'), false);
  assert.equal(codeBlockIsProse(''), false);
});
