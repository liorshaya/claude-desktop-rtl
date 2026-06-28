'use strict';
// engine/__tests__/limits.test.js — subscripted limit / extremum operators (reported screenshot:
// "lim_{x→0} sin(x)/x = 1" rendered "sin(x)/x = 1 lim_{x←0}" — the operator reordered past the
// isolated body AND the arrow in the bound flipped). Two coupled fixes:
//
//   • relationRuns seeds a LETTER-named operator (lim sup inf max min argmax argmin det gcd lcm)
//     that carries a "_" subscript bound, and grows it right over the bound AND the space-separated
//     body, so the whole "lim_{x→0} sin(x)/x = 1" is one isolated LTR run.
//   • arrowFlipOffsets never flips an arrow inside a braced math bound "_{x→0}" / "^{…}", and the DOM
//     skips arrows inside an isolated relation run — so "x→0" stays "x→0".
//
// A word-boundary lookbehind keeps the operator names from matching inside ordinary words
// ("sublime_x", "film_{old}").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns, arrowFlipOffsets } = require('../index.js');

const runs = (t) => relationRuns(t).map(([s, e]) => t.slice(s, e));
const flipped = (t) => arrowFlipOffsets(t).map((i) => t[i]);

// ─────────────────────────────── the reported screenshot ───────────────────────────────
test('limits: lim with a braced bound isolates with its body (operator stays on the left)', () => {
  assert.deepEqual(runs('הגבול lim_{x→0} sin(x)/x = 1 מפורסם.'), ['lim_{x→0} sin(x)/x = 1']);
  assert.deepEqual(runs('lim_{x→0} f(x) = 0'), ['lim_{x→0} f(x) = 0']);
  assert.deepEqual(runs('כי lim_{n→∞} a_n = L קיים'), ['lim_{n→∞} a_n = L']);
});

// ─────────────────────────── the arrow in the bound must NOT flip ───────────────────────────
test('limits: an arrow inside a math bound _{x→0} is never flipped', () => {
  assert.deepEqual(flipped('הגבול lim_{x→0} sin(x)/x = 1 מפורסם.'), []);
  assert.deepEqual(flipped('lim_{x→0}'), []);
  assert.deepEqual(flipped('a_{i→j} = 0'), []);                 // arrow in any braced subscript
  assert.deepEqual(flipped('הקלט a → הפלט b'), ['→']);          // a real prose arrow still flips
});

// ─────────────────────────────── extrema & complex bounds ───────────────────────────────
test('limits: sup / inf / max / min / argmax with rich bounds', () => {
  assert.deepEqual(runs('lim_{x→0⁺} f(x) כאן'), ['lim_{x→0⁺} f(x)']);    // one-sided
  assert.deepEqual(runs('max_{1≤i≤n} a_i גדול'), ['max_{1≤i≤n} a_i']);    // bound with a relation
  assert.deepEqual(runs('sup_{x∈[0,1]} f(x) חסום'), ['sup_{x∈[0,1]} f(x)']); // bound with an interval
  assert.deepEqual(runs('argmax_{x} f(x) כאן'), ['argmax_{x} f(x)']);
  assert.deepEqual(runs('inf_{n} x_n = 0 כאן'), ['inf_{n} x_n = 0']);
  assert.deepEqual(runs('הנגזרת lim_{h→0} (f(x+h) − f(x))/h כאן'), ['lim_{h→0} (f(x+h) − f(x))/h']);
  assert.deepEqual(runs('המינימום min_{x} ‖Ax − b‖² כאן'), ['min_{x} ‖Ax − b‖²']); // with a norm
});
test('limits: multivariate bound and two limits in one inequality', () => {
  assert.deepEqual(runs('lim_{(x,y)→(0,0)} f קיים'), ['lim_{(x,y)→(0,0)} f']);
  assert.deepEqual(runs('liminf_{n→∞} a_n ≤ limsup_{n→∞} a_n'), ['liminf_{n→∞} a_n ≤ limsup_{n→∞} a_n']);
});

// ─────────────────────────── word-boundary: not inside ordinary words ───────────────────────────
test('limits: the operator names do not match inside a longer word', () => {
  assert.deepEqual(runs('sublime_{x} feeling'), []);  // "lim" inside "sublime"
  assert.deepEqual(runs('the film_{old} reel'), []);
  assert.deepEqual(runs('a maxim_{here}'), []);        // "max" inside "maxim"
});
