'use strict';
// engine/ranges.js — strong-direction & digit classification by CODE POINT (§3.1).
// PURE: no document/window. Classify via codePointAt (astral-safe), never UTF-16 units.

// Living + historic strong-RTL blocks (Hebrew, Arabic + supplements, Syriac, Thaana,
// NKo, Samaritan, Mandaic, presentation forms, and astral RTL incl. Adlam). §3.1.
const RTL_RANGES = [
  [0x0590, 0x05FF], // Hebrew
  [0x0600, 0x06FF], // Arabic
  [0x0700, 0x074F], // Syriac
  [0x0750, 0x077F], // Arabic Supplement
  [0x0780, 0x07BF], // Thaana
  [0x07C0, 0x07FF], // NKo
  [0x0800, 0x083F], // Samaritan
  [0x0840, 0x085F], // Mandaic
  [0x0860, 0x086F], // Syriac Supplement
  [0x0870, 0x089F], // Arabic Extended-B
  [0x08A0, 0x08FF], // Arabic Extended-A
  [0xFB1D, 0xFB4F], // Hebrew presentation forms
  [0xFB50, 0xFDFF], // Arabic presentation forms A
  [0xFE70, 0xFEFF], // Arabic presentation forms B
  [0x10800, 0x1085F], // Cypriot / Imperial Aramaic vicinity
  [0x10A00, 0x10A5F], // Kharoshthi
  [0x1E800, 0x1E8DF], // Mende Kikakui
  [0x1E900, 0x1E95F], // Adlam (astral)
  [0x1EE00, 0x1EEFF], // Arabic Mathematical Alphabetic Symbols
];

// Arabic-Indic and Extended-Arabic-Indic (Persian/Urdu) digits → AN (weak), §3.4.
const RTL_DIGIT_RANGES = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06F0, 0x06F9], // Extended Arabic-Indic (Eastern / Persian)
];

function inRanges(cp, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    if (cp >= ranges[i][0] && cp <= ranges[i][1]) return true;
  }
  return false;
}

function isStrongRTL(cp) {
  return inRanges(cp, RTL_RANGES);
}

function isRTLDigit(cp) {
  return inRanges(cp, RTL_DIGIT_RANGES);
}

// A code point is strong-LTR if it is a letter (Unicode L) that is not strong-RTL.
// Covers Latin / Greek / Cyrillic / CJK / etc.; excludes Hebrew/Arabic/Adlam letters.
const LETTER = /\p{L}/u;
function isStrongLTR(cp) {
  if (isStrongRTL(cp)) return false;
  return LETTER.test(String.fromCodePoint(cp));
}

function hasRTL(str) {
  for (const ch of str) {
    if (isStrongRTL(ch.codePointAt(0))) return true;
  }
  return false;
}

const api = { isStrongRTL, isStrongLTR, isRTLDigit, hasRTL };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
