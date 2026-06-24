'use strict';
// §13 torture-corpus integration, driven through the public engine API (engine/index.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../index.js');

const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/;

test('index exposes the full §3 surface', () => {
  for (const fn of ['detectBlockDir', 'firstStrong', 'majority', 'cellDir', 'tableDir',
    'segmentMath', 'digitScript', 'leadingNumber', 'hasRTL', 'isStrongRTL']) {
    assert.equal(typeof engine[fn], 'function', fn);
  }
});

test('pure-script blocks', () => {
  assert.equal(engine.detectBlockDir('שלום עולם זה טקסט עברי'), 'rtl');
  assert.equal(engine.detectBlockDir('مرحبا بالعالم هذا نص عربي'), 'rtl');
  assert.equal(engine.detectBlockDir('سلام دنیا این یک متن فارسی است'), 'rtl');
  assert.equal(engine.detectBlockDir('Hello world this is English'), 'ltr');
});

test('issue #38005: Hebrew sentence with embedded Next.js / TypeScript reads RTL', () => {
  assert.equal(engine.detectBlockDir('אני בונה עם Next.js ו-TypeScript.'), 'rtl');
});

test('RTL openers: word / number / URL / path / code / emoji / bullet', () => {
  const lines = [
    'React הוא ספרייה',
    '2,200 ₪ זה המחיר',
    'https://example.com זה הקישור שלי',
    'src/app.js הקובץ הראשי',
    '`npm install` מתקין חבילות',
    '✅ המשימה הושלמה בהצלחה',
    '1. הסעיף הראשון ברשימה',
  ];
  for (const l of lines) assert.equal(engine.detectBlockDir(l), 'rtl', l);
});

test('currency vs math segmentation', () => {
  assert.deepEqual(engine.segmentMath('$5.99').map((s) => s.type), ['text']);
  assert.deepEqual(engine.segmentMath('$5 to $10').map((s) => s.type), ['text']);
  assert.deepEqual(engine.segmentMath('$\\frac{a}{b}$').map((s) => s.type), ['math']);
  assert.deepEqual(engine.segmentMath('$$E=mc^2$$').map((s) => s.type), ['math']);
});

test('numbers: EN vs AN, version, percent', () => {
  assert.equal(engine.digitScript('2,200'), 'EN');
  assert.equal(engine.digitScript('٥٠٪'), 'AN');
  assert.equal(engine.detectBlockDir('5–10% מהזמן'), 'rtl');
  assert.equal(engine.detectBlockDir('גרסה v4.6'), 'rtl');
});

test('astral: Adlam-only line is RTL', () => {
  const adlam = String.fromCodePoint(0x1E900, 0x1E921, 0x1E922);
  assert.equal(engine.detectBlockDir(adlam), 'rtl');
});

test('combining marks do not break detection (niqqud, harakat, tatweel)', () => {
  assert.equal(engine.detectBlockDir('שָׁלוֹם עֲלֵיכֶם'), 'rtl'); // Hebrew niqqud
  assert.equal(engine.detectBlockDir('مَرْحَبًا بِالْعَالَم'), 'rtl'); // Arabic harakat
  assert.equal(engine.detectBlockDir('بـــحث'), 'rtl'); // tatweel U+0640
});

test('table: Hebrew row-labels + English column headers', () => {
  assert.equal(engine.tableDir(['שם', 'ID', 'Email'], ['דני', 'רותי']), 'rtl');
});

test('fidelity: engine never emits a bidi control char', () => {
  const samples = [
    'אני בונה עם Next.js ו-TypeScript.',
    '2,200 ₪ זה המחיר',
    'price $\\frac{a}{b}$ end',
    'https://example.com זה הקישור',
  ];
  for (const s of samples) {
    assert.equal(BIDI_CONTROLS.test(engine.stripLeadingNoise(s)), false, `strip: ${s}`);
    for (const seg of engine.segmentMath(s)) {
      assert.equal(BIDI_CONTROLS.test(seg.value), false, `segment: ${s}`);
    }
  }
});
