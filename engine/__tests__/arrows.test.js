'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirrorArrow, hasMirrorArrow } = require('../arrows.js');

const cp = (s) => s.codePointAt(0);

test('isMirrorArrow: arrows true, letters/digits/Hebrew false', () => {
  for (const a of ['→', '←', '⇒', '⇐', '↔', '⟶', '⟵', '➜', '➔', '➡', '⬅']) {
    assert.equal(isMirrorArrow(cp(a)), true, a);
  }
  for (const x of ['a', 'A', '5', 'א', '.', ' ', '°']) {
    assert.equal(isMirrorArrow(cp(x)), false, x);
  }
});

test('hasMirrorArrow', () => {
  assert.equal(hasMirrorArrow('תה ירוק → 75°C'), true);
  assert.equal(hasMirrorArrow('no arrows here'), false);
  assert.equal(hasMirrorArrow(''), false);
});
