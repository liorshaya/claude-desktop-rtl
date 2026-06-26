'use strict';
// Build-layer guard rails. The VISUAL P1 acceptance is manual on claude.ai; this only
// proves the payload is well-formed, self-contained, and free of node-only artifacts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPayload, MARKER } = require('../build-payload.js');

const payload = buildPayload();

test('payload is syntactically valid JS (parses without executing)', () => {
  assert.doesNotThrow(() => new Function(payload)); // parse-only; never invoked
});

test('payload carries the idempotency marker and is one IIFE', () => {
  assert.ok(payload.includes(MARKER), 'marker present');
  assert.ok(payload.trimStart().startsWith(';(function'), 'wrapped in IIFE');
});

test('node-only artifacts are stripped', () => {
  assert.equal(/\brequire\(/.test(payload), false, 'no require() calls');
  assert.equal(/module\.exports/.test(payload), false, 'no module.exports');
  assert.equal(payload.includes('__EXPORTS__'), false, 'no export sentinels leak through');
});

test('engine + dom are inlined', () => {
  for (const sym of ['detectBlockDir', 'tableDir', 'segmentMath', 'findInputs', 'init',
    'codeBlockIsProse', 'isMirrorArrow', 'wrapArrowsInBlock']) {
    assert.ok(payload.includes(sym), `inlined: ${sym}`);
  }
});

test('apply.css is embedded (no leftover placeholder)', () => {
  assert.ok(payload.includes('unicode-bidi: plaintext'), 'stylesheet text inlined');
  assert.equal(payload.includes('__APPLY_CSS__'), false, 'CSS placeholder replaced');
});

test('payload bails without a DOM (guard present)', () => {
  assert.ok(payload.includes("typeof document === 'undefined'"), 'DOM guard present');
});
