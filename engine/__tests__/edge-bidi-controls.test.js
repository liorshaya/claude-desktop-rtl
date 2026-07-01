'use strict';
// engine/__tests__/edge-bidi-controls.test.js — detection-level edge cases for invisible
// characters and cross-script mixes. unicode.test.js proves how these CLASSIFY; this file
// proves the DECISION functions (firstStrong / majority / detectBlockDir /
// plaintextOverrideDir / resolvedDir) stay correct when they appear in real positions:
// leading a line, embedded mid-word, or dominating a mixed Hebrew/Arabic/Persian/English
// paragraph. Every expectation was verified against the engine before being encoded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

// ─────────────────────── LRM/RLM & zero-width characters in DETECTION ───────────────────────
test('firstStrong: a leading RLM must not fake an RTL line (controls are skipped, not strong)', () => {
  // U+200F RLM then Latin — the marks are bidi controls, but OUR first-strong must land on
  // the first LETTER (the naive tools that treat RLM as strong-RTL flip English lines).
  assert.equal(E.firstStrong('‏‎Hello'), 'ltr');
  assert.equal(E.firstStrong('⁠﻿שלום'), 'rtl'); // WJ + BOM before Hebrew
  assert.equal(E.firstStrong('‍‌'), null);      // ZWJ+ZWNJ only → no strong char
});

test('plaintextOverrideDir: a stray RLM inside the Latin opener does not break the misfire fix', () => {
  // Copy/pasted text often carries an RLM after a brand name; the override must still see
  // "Latin opener + majority-RTL" and flip the block.
  assert.equal(E.plaintextOverrideDir('React‏ הוא ספרייה נהדרת'), 'rtl');
  // …and must still refuse a majority-English block even with RTL marks sprinkled in (§8.K).
  assert.equal(E.plaintextOverrideDir('React‏ is a library ששווה הכרות'), null);
});

test('detectBlockDir: zero-width-only and whitespace-only input resolves to null (never a forced rtl)', () => {
  assert.equal(E.detectBlockDir('‍‌'), null);
  assert.equal(E.detectBlockDir('​⁠﻿'), null);
  assert.equal(E.resolvedDir('   '), null);
  assert.equal(E.resolvedDir('‏‎'), null); // controls alone decide nothing
});

// ───────────────────────────── Arabic combining marks & tatweel ─────────────────────────────
test('detect: fully-vocalised Arabic (harakat, shadda, tanwin) is RTL and the marks never break it', () => {
  assert.equal(E.detectBlockDir('مُحَمَّدٌ كَتَبَ'), 'rtl');
  assert.equal(E.majority('الْـكِتَابُ'), 'rtl'); // includes tatweel U+0640 mid-word
  assert.equal(E.firstStrong('ـسلام'), 'rtl');    // tatweel-led (it sits in the Arabic block)
});

// ─────────────────────────── mixed Hebrew / Arabic / Persian / English ───────────────────────────
test('majority: Hebrew and Arabic letters vote on the SAME side against English', () => {
  // 5 Hebrew + ~9 Arabic strong letters vs 22 English → LTR; flip the weights → RTL.
  assert.equal(E.majority('עברית مع العربية and English words here okay'), 'ltr');
  assert.equal(E.majority('עברית ועוד עברית مع العربية הרבה מאוד ok'), 'rtl');
});

test('plaintextOverrideDir: the Latin-opener misfire fix works for an Arabic-majority block too', () => {
  assert.equal(E.plaintextOverrideDir('React مكتبة رائعة جدا للواجهات'), 'rtl');
});

test('detect: Persian with Extended-Arabic-Indic digits — digit-led line still reads RTL', () => {
  assert.equal(E.detectBlockDir('۱۲۳ فارسی خوب'), 'rtl');
  assert.equal(E.leadingNumber('۱۲۳.۴۵ تست'), '۱۲۳.۴۵'); // Persian decimal peels as ONE token
  assert.equal(E.digitScript('نسخه ۴.۶'), 'AN');
  assert.equal(E.digitScript('גרסה 4.6 ونسخة ٦'), 'mixed'); // EN next to Arabic-Indic
});

// ──────────────────────────────── emoji at decision points ────────────────────────────────
test('detect: emoji lead-ins (ZWJ sequences, flags, skin tones) never decide a direction', () => {
  assert.equal(E.detectBlockDir('👨‍👩‍👧‍👦 משפחה אחת'), 'rtl'); // ZWJ family sequence opener
  assert.equal(E.detectBlockDir('🇮🇱🇺🇸 flags first here'), 'ltr'); // regional-indicator pairs
  assert.equal(E.detectBlockDir('👍🏽'), null);                    // emoji-only → undecided
  assert.equal(E.resolvedDir('✅ משימה הושלמה'), 'rtl');           // pictograph then Hebrew
});
