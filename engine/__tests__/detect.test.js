'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  firstStrong, majority, stripLeadingNoise, detectBlockDir, cellDir, tableDir,
} = require('../detect.js');

test('firstStrong: first strong char wins, neutrals skipped', () => {
  assert.equal(firstStrong('Hello'), 'ltr');
  assert.equal(firstStrong('שלום'), 'rtl');
  assert.equal(firstStrong('123 שלום'), 'rtl');
  assert.equal(firstStrong('→ עברית'), 'rtl');
  assert.equal(firstStrong('Next.js עברית'), 'ltr'); // why stripLeadingNoise is needed
  assert.equal(firstStrong('12345'), null);
  assert.equal(firstStrong(''), null);
});

test('majority: counts strong RTL vs LTR, null on tie/none', () => {
  assert.equal(majority('Hello עולם'), 'ltr');           // 5 vs 4
  assert.equal(majority('שלום עולם hi'), 'rtl');
  assert.equal(majority('aא'), null);                    // tie
  assert.equal(majority('12345'), null);
});

test('stripLeadingNoise removes a leading noise token', () => {
  assert.equal(detectBlockDir('1. סעיף ראשון'), 'rtl');
  assert.equal(detectBlockDir('- [ ] משימה'), 'rtl');
  assert.equal(detectBlockDir('`code` עברית'), 'rtl');
  assert.equal(detectBlockDir('https://x.com זה אתר בעברית'), 'rtl');
  assert.equal(detectBlockDir('foo.js עושה משהו'), 'rtl');
  assert.equal(detectBlockDir('Next.js הוא ספרייה בעברית'), 'rtl');
  // does not strip ordinary English words:
  assert.equal(detectBlockDir('The file foo.js does things'), 'ltr');
});

test('detectBlockDir: RTL cases', () => {
  for (const s of [
    'שלום עולם',
    'אני בונה עם Next.js ו-TypeScript.',
    '2,200 ₪ זה המחיר',
    '✅ משימה הושלמה',
    'مرحبا بالعالم',          // Arabic
    'سلام دنیا',              // Persian
    '۱۲۳ سلام',              // Persian Eastern digits then strong RTL
    'גרסה v4.6 יצאה',
  ]) {
    assert.equal(detectBlockDir(s), 'rtl', s);
  }
});

test('detectBlockDir: LTR cases', () => {
  for (const s of [
    'Hello world',
    'I am building with React.',
    'The version is v4.6 today',
  ]) {
    assert.equal(detectBlockDir(s), 'ltr', s);
  }
});

test('detectBlockDir: fallback is null, never rtl', () => {
  assert.equal(detectBlockDir('12345'), null);
  assert.equal(detectBlockDir(''), null);
  assert.equal(detectBlockDir('   '), null);
  assert.equal(detectBlockDir('$5.99'), null);
});

test('detectBlockDir: Adlam astral line is RTL', () => {
  const adlam = String.fromCodePoint(0x1E900, 0x1E921, 0x1E922, 0x1E923);
  assert.equal(detectBlockDir(adlam), 'rtl');
});

test('§8.K mixed document: only Hebrew blocks flip, English never forced RTL', () => {
  const blocks = [
    ['# Architecture overview', 'ltr'],
    ['This document explains the system in English.', 'ltr'],
    ['We use unicode-bidi: plaintext per leaf block.', 'ltr'],
    ['const x = 5; // code-ish line', 'ltr'],
    ['לדוגמה, זהו בלוק טקסט בעברית.', 'rtl'],
    ['הפסקה הזו צריכה להתהפך לימין בלבד.', 'rtl'],
    ['רשימה עם Next.js כדוגמה טכנית בתוך משפט עברי.', 'rtl'],
  ];
  for (const [text, expected] of blocks) {
    const got = detectBlockDir(text);
    if (expected === 'rtl') {
      assert.equal(got, 'rtl', `expected RTL: ${text}`);
    } else {
      assert.notEqual(got, 'rtl', `English block must NOT be forced RTL: ${text}`);
    }
  }
});

test('cellDir', () => {
  assert.equal(cellDir('דני'), 'rtl');
  assert.equal(cellDir('blob עברית'), 'rtl'); // any RTL char => rtl
  assert.equal(cellDir('ID'), 'ltr');
  assert.equal(cellDir('123'), null);          // neutral-only
  assert.equal(cellDir(''), null);
});

test('tableDir: semantic-key first, then header majority, then column majority', () => {
  // Hebrew row-labels + English column headers => RTL table
  assert.equal(tableDir(['שם', 'ID', 'Status'], ['דני', 'רותי']), 'rtl');
  // Plain English table
  assert.equal(tableDir(['Name', 'Age'], ['Alice', 'Bob']), 'ltr');
  // header[0] LTR but header majority RTL
  assert.equal(tableDir(['Type', 'שם', 'תיאור'], ['x']), 'rtl');
  // all neutral
  assert.equal(tableDir(['123', '456'], ['789']), null);
});

test('fidelity: stripLeadingNoise injects no bidi controls (output is a tail of input)', () => {
  for (const s of ['1. סעיף', 'Next.js הוא ספרייה', '→ עברית', 'foo.js עברית']) {
    const out = stripLeadingNoise(s);
    assert.ok(s.endsWith(out), `${JSON.stringify(out)} must be a suffix of ${JSON.stringify(s)}`);
    assert.equal(/[‎‏‪-‮⁦-⁩]/.test(out), false);
  }
});
