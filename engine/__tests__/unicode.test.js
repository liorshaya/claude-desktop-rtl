'use strict';
// engine/__tests__/unicode.test.js — the full Unicode surface: strong-direction classification
// across scripts (BMP + astral), bidi controls, combining marks, every digit system, and — the
// rule that matters most — FIDELITY: the engine indexes by code point and NEVER alters a glyph,
// so astral pairs, niqqud, NFC/NFD, zero-width, and bidi controls all survive byte-for-byte
// (§3.6: we never inject U+200E/200F and never strip what Claude wrote). Hebrew, English, mixed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isStrongRTL, isStrongLTR, isRTLDigit } = require('../ranges.js');
const { firstStrong, resolvedDir, digitScript } = require('../index.js');
const { relationRuns, arrowFlipOffsets, signedNumberRuns } = require('../index.js');
const { segmentMath } = require('../math.js');

const cp = (s) => s.codePointAt(0);
const recon = (t) => segmentMath(t).map((s) => s.value).join('') === t;

// ───────────────────────── strong-RTL: every supported script (BMP + astral) ─────────────────────────
test('unicode/RTL: Hebrew, Arabic, and the historic RTL scripts classify as strong-RTL', () => {
  for (const ch of ['א', 'ת', 'ש', 'ﬡ', '﬩' /*shekel*/, // Hebrew + presentation forms
    'ا', 'ب', 'ي', 'ﷲ' /*Arabic ligature*/, 'ﻷ', // Arabic + presentation forms
    'ܐ' /*Syriac*/, 'ހ' /*Thaana*/, 'ߊ' /*NKo*/, 'ࠀ' /*Samaritan*/, 'ࡀ' /*Mandaic*/]) {
    assert.equal(isStrongRTL(cp(ch)), true, ch);
    assert.equal(isStrongLTR(cp(ch)), false, ch);
  }
});
test('unicode/RTL: astral RTL letters (Adlam, Kharoshthi, Arabic math) classify as strong-RTL', () => {
  for (const ch of [String.fromCodePoint(0x1E900) /*Adlam*/, String.fromCodePoint(0x10A00) /*Kharoshthi*/,
    String.fromCodePoint(0x1E800) /*Mende Kikakui*/, String.fromCodePoint(0x1EE00) /*Arabic math alif*/]) {
    assert.equal(isStrongRTL(cp(ch)), true, '' + cp(ch).toString(16));
    assert.equal(isStrongLTR(cp(ch)), false);
  }
});

// ───────────────────────── strong-LTR: non-RTL letters (BMP + astral) ─────────────────────────
test('unicode/LTR: Latin, Greek, Cyrillic, Armenian, CJK, Hangul classify as strong-LTR', () => {
  for (const ch of ['A', 'z', 'α', 'Ω', 'Д', 'я', 'Ա' /*Armenian*/, '中', '日', '한' /*Hangul*/, 'ก' /*Thai*/]) {
    assert.equal(isStrongLTR(cp(ch)), true, ch);
    assert.equal(isStrongRTL(cp(ch)), false, ch);
  }
});
test('unicode/LTR: astral math alphanumerics (bold/italic/fraktur/script/blackboard) are strong-LTR', () => {
  for (const c of [0x1D400 /*𝐀 bold*/, 0x1D44E /*𝑎 italic*/, 0x1D504 /*𝔄 fraktur*/,
    0x1D49C /*𝒜 script*/, 0x1D538 /*𝔸 blackboard*/, 0x1F130 /*🄰 squared*/]) {
    // letters are LTR; the squared-letter symbol (0x1F130, So) is neutral — assert per category
    const isLetter = c !== 0x1F130;
    assert.equal(isStrongLTR(c), isLetter, '0x' + c.toString(16));
  }
});

// ───────────────────────── neutral: symbols, emoji, spaces, MOST bidi controls ─────────────────────────
test('unicode/neutral: emoji, punctuation, spaces, and the LRM/RLM/isolate controls are neutral', () => {
  for (const c of [0x1F600 /*😀*/, 0x1F1EE /*🇮 regional*/, 0x2764 /*❤*/, 0x2211 /*∑*/,
    0x200E /*LRM*/, 0x200F /*RLM*/, 0x202A /*LRE*/, 0x202B /*RLE*/, 0x202C /*PDF*/,
    0x202D /*LRO*/, 0x202E /*RLO*/, 0x2066 /*LRI*/, 0x2067 /*RLI*/, 0x2068 /*FSI*/, 0x2069 /*PDI*/,
    0x200D /*ZWJ*/, 0x200C /*ZWNJ*/, 0x200B /*ZWSP*/, 0x2060 /*WJ*/, 0xFEFF /*BOM*/,
    0x00A0 /*NBSP*/, 0x2003 /*em space*/, 0x3000 /*ideographic space*/, 0x20 /*space*/, 0x2E /*.*/]) {
    assert.equal(isStrongRTL(c), false, '0x' + c.toString(16));
    assert.equal(isStrongLTR(c), false, '0x' + c.toString(16));
  }
});

// ───────────────────────── DOCUMENTED EDGES (locked) ─────────────────────────
test('unicode/edge: Arabic-Indic & Persian DIGITS classify as strong-RTL (they sit in the Arabic block)', () => {
  // EN digits are weak; Arabic-Indic/Persian digits fall inside the Arabic/Persian script ranges,
  // so isStrongRTL is true for them — they tilt direction RTL (an Arabic/Persian context cue).
  assert.equal(isStrongRTL(cp('٥')), true);  // Arabic-Indic 5
  assert.equal(isStrongRTL(cp('۵')), true);  // Persian 5
  assert.equal(isRTLDigit(cp('٥')), true);
  assert.equal(isStrongRTL(cp('5')), false); // EN 5 is weak
  // consequence: an Arabic-Indic digit OPENS the direction as RTL even before English follows
  assert.equal(firstStrong('٥ apples'), 'rtl');
  assert.equal(firstStrong('5 apples'), 'ltr');
});
test('unicode/edge: ALM (U+061C) classifies RTL; the other format controls are neutral', () => {
  assert.equal(isStrongRTL(0x061C), true);   // Arabic Letter Mark — sits in the Arabic block
  assert.equal(isStrongRTL(0x200E), false);  // LRM
  assert.equal(isStrongRTL(0x200F), false);  // RLM
});

// ───────────────────────── digits & digitScript across systems ─────────────────────────
test('unicode/digits: EN / Arabic-Indic / Persian recognised; others (Devanagari) are not AN', () => {
  assert.equal(digitScript('12345'), 'EN');
  assert.equal(digitScript('٠١٢٣'), 'AN');         // Arabic-Indic
  assert.equal(digitScript('۰۱۲۳'), 'AN');         // Persian
  assert.equal(digitScript('5 ٥'), 'mixed');
  assert.equal(digitScript('५६७'), null);          // Devanagari digits — not EN, not AN
  assert.equal(isRTLDigit(cp('५')), false);
  assert.equal(isStrongLTR(cp('५')), false);        // a digit is not a letter → neutral
});

// ───────────────────────── firstStrong / resolvedDir: skip neutrals & EN digits ─────────────────────────
test('unicode/direction: firstStrong skips neutrals and EN digits to the first strong char', () => {
  assert.equal(firstStrong('😀🎉 שלום'), 'rtl');
  assert.equal(firstStrong('😀🎉 hello'), 'ltr');
  assert.equal(firstStrong('123 456 שלום'), 'rtl');   // EN digits weak → skip to Hebrew
  assert.equal(firstStrong('   \t  עברית'), 'rtl');
  assert.equal(firstStrong('★ ☆ ✓ → ∑ done'), 'ltr'); // symbols neutral → "done"
  assert.equal(firstStrong('😀😀😀'), null);          // no strong char
  assert.equal(firstStrong(''), null);
});

// ───────────────────────── only-Hebrew / only-English / only-Arabic / mixed-everything ─────────────────────────
test('unicode/direction: pure scripts and a kitchen-sink mix', () => {
  assert.equal(resolvedDir('שלום עולם זה טקסט בעברית בלבד'), 'rtl');
  assert.equal(resolvedDir('this is purely english text here'), 'ltr');
  assert.equal(resolvedDir('مرحبا بالعالم هذا نص عربي فقط'), 'rtl');
  // Hebrew + English + Arabic + numbers + emoji + math symbol — Hebrew/Arabic majority → rtl
  assert.equal(resolvedDir('שלום world مرحبا 123 ٤٥٦ 😀 ∑ אחרון'), 'rtl');
  // mostly English with a sprinkle of everything → ltr
  assert.equal(resolvedDir('mostly english text with one מילה and 😀 and ∑ here'), 'ltr');
});

// ───────────────────────── astral-safety: classification AND engine offsets ─────────────────────────
test('unicode/astral: engine offsets stay correct when astral chars precede the target', () => {
  const a = '😀😀 א → ב';   // 2 emoji = 4 UTF-16 units before the arrow
  assert.deepEqual(arrowFlipOffsets(a).map((i) => a[i]), ['→']);
  assert.deepEqual(arrowFlipOffsets(a), [a.indexOf('→')]);
  const b = '𝐀𝐁 3 < 5';    // math-bold letters (astral) before the comparison
  assert.deepEqual(relationRuns(b).map(([s, e]) => b.slice(s, e)), ['3 < 5']);
  const c = '😀 -5 מעלות';
  assert.deepEqual(signedNumberRuns(c).map(([s, e]) => c.slice(s, e)), ['-5']);
  // an astral letter as the first strong char
  assert.equal(firstStrong('𝐀bc text'), 'ltr');      // 𝐀 (astral Latin-like) is strong-LTR
  assert.equal(firstStrong(String.fromCodePoint(0x1E900) + 'dlam'), 'rtl'); // Adlam first → rtl
});

// ───────────────────────── combining marks / niqqud: direction + fidelity ─────────────────────────
test('unicode/combining: Hebrew with niqqud/cantillation is RTL and byte-exact', () => {
  const niq = 'שָׁלוֹם עוֹלָם';   // niqqud (combining marks) on Hebrew bases
  assert.equal(resolvedDir(niq), 'rtl');
  assert.equal(recon(niq), true);
  const cant = 'בְּרֵאשִׁ֖ית';     // niqqud + cantillation
  assert.equal(resolvedDir(cant), 'rtl');
  assert.equal(recon(cant), true);
  // NFC vs NFD of the same Latin word both round-trip and read LTR
  const nfc = 'café', nfd = 'café';
  assert.equal(recon(nfc), true);
  assert.equal(recon(nfd), true);
  assert.equal(resolvedDir(nfc), 'ltr');
  assert.equal(resolvedDir(nfd), 'ltr');
});

// ───────────────────────── FIDELITY: bidi controls & zero-width survive byte-for-byte ─────────────────────────
test('unicode/fidelity: embedded bidi controls and zero-width chars are preserved exactly', () => {
  // §3.6 — we never inject U+200E/200F and never strip what Claude wrote.
  const samples = [
    '‏عربي‎ and ‏عبري‎ end',           // RLM/LRM around runs
    '‫مرحبا‬ english ‪world‬',          // RLE…PDF / LRE…PDF
    '⁦isolated⁩ ⁧מבודד⁩',                // LRI…PDI / RLI…PDI
    'word​break‌join‍zwj⁠wj',            // ZWSP/ZWNJ/ZWJ/WJ
    '﻿bom at start',                                    // BOM
    'price ‏5‎ shekels',
  ];
  for (const t of samples) assert.equal(recon(t), true, JSON.stringify(t));
  // the engine reports offsets but never ADDS a control char — a clean string stays clean
  const clean = 'ערך 3 < 5 וגם קלט → פלט';
  for (const [s, e] of relationRuns(clean)) {
    assert.ok(!/[‎‏‪-‮⁦-⁩]/.test(clean.slice(s, e)), 'no control injected');
  }
});

// ───────────────────────── FIDELITY: whitespace variants, astral, the kitchen sink ─────────────────────────
test('unicode/fidelity: spaces, astral, and a kitchen-sink string round-trip byte-for-byte', () => {
  const samples = [
    'a b c　d',                                // NBSP / em space / ideographic space
    '👨‍👩‍👧‍👦 family \u{1F1EE}\u{1F1F1} flag',                  // ZWJ emoji sequence + regional-indicator flag
    '𝐀𝐁𝐂 = 𝔸𝔹ℂ math letters',                            // astral math alphanumerics
    'שלום‏world‎مرحبا 123 ٤٥٦ 😀 ∑ ∫ → ⇒ ≤ ℝ',     // everything at once
    'naïve café résumé Ω≈≠∞',                              // Latin + accents + symbols
    '',
  ];
  for (const t of samples) assert.equal(recon(t), true, JSON.stringify(t));
});
