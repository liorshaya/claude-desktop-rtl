'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentMath } = require('../math.js');

const types = (t) => segmentMath(t).map((s) => s.type);
const rebuild = (t) => segmentMath(t).map((s) => s.value).join('');

test('currency stays text', () => {
  assert.deepEqual(types('$5.99'), ['text']);
  assert.deepEqual(types('$5 to $10'), ['text']);
  assert.deepEqual(types('מחיר 5₪ ו-50% הנחה'), ['text']);
});

test('real LaTeX signal => math', () => {
  assert.deepEqual(types('$x^2$'), ['math']);
  assert.deepEqual(types('price $\\frac{a}{b}$ end'), ['text', 'math', 'text']);
});

test('unambiguous delimiters always math', () => {
  assert.deepEqual(types('$$x^2$$'), ['math']);
  assert.deepEqual(types('a \\[ y \\] b'), ['text', 'math', 'text']);
  assert.deepEqual(types('a \\( z \\) b'), ['text', 'math', 'text']);
});

test('unclosed delimiter mid-stream stays text', () => {
  assert.deepEqual(types('opening $x^2 with no close'), ['text']);
});

test('fidelity: segments rebuild the input exactly', () => {
  for (const s of ['$5.99', '$5 to $10', 'price $\\frac{a}{b}$ end', '$$x^2$$', 'a \\[ y \\] b']) {
    assert.equal(rebuild(s), s);
  }
});
