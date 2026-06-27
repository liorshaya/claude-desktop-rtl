'use strict';
// engine/numbers.js — number/digit classification (§3.4). PURE.
// The engine only CLASSIFIES; it never injects controls and never "fixes" what the
// browser's UBA already orders. Used by detect.stripLeadingNoise to peel a leading number.

const { isRTLDigit } = require('./ranges.js');

function isENDigit(cp) {
  return cp >= 0x30 && cp <= 0x39;
}

function isANDigit(cp) {
  return isRTLDigit(cp); // Arabic-Indic + Eastern/Persian
}

function isDigit(cp) {
  return isENDigit(cp) || isANDigit(cp);
}

// 'EN' | 'AN' | 'mixed' | null over the digits present in a string.
function digitScript(str) {
  let en = false;
  let an = false;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (isENDigit(cp)) en = true;
    else if (isANDigit(cp)) an = true;
  }
  if (en && an) return 'mixed';
  if (en) return 'EN';
  if (an) return 'AN';
  return null;
}

// A leading number-led token: optional currency, optional sign, a digit run (EN or AN)
// with locale separators, optional trailing %/° or currency. Returns '' if none.
// Note: a version-like token ("v4.6") is NOT number-led — it is a dotted technical
// token, handled separately by detect.stripLeadingNoise.
// Separators include '-' (kept last in the class = literal) so dates/phones/versions like
// 2024-01-15 or 03-1234567 peel as ONE token, not several.
const LEADING_NUMBER =
  /^[$₪€£¥]?[-+±]?[0-9٠-٩۰-۹]+(?:[.,_:/-][0-9٠-٩۰-۹]+)*[%°]?[$₪€£¥]?/;

function leadingNumber(str) {
  const m = str.match(LEADING_NUMBER);
  return m ? m[0] : '';
}

// A SIGNED number: a sign (`-` `+` or `−` U+2212) at a WORD BOUNDARY — NOT preceded by a
// letter or a number — followed by a digit run (EN / Arabic-Indic / Persian) with optional
// decimal/grouping separators. The boundary rule is what distinguishes a genuine sign from
// the two look-alikes that must be left alone:
//   • Hebrew prefix  "ל-15"  → the `-` follows the letter ל  → NOT a sign.
//   • numeric range  "5-10"  → the `-` follows the digit 5   → NOT a sign.
// In RTL the browser detaches a leading sign and renders "-5" as "5-" (wrong); the DOM
// isolates each run as an LTR unit so the sign stays with its number ("-5"). Returns the
// UTF-16 [start, end) ranges. PURE; astral-safe (offsets index the input string).
const SIGNED_NUMBER = /(?<![\p{L}\p{N}])[+\-−][0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)*/gu;

function signedNumberRuns(text) {
  const out = [];
  if (!text) return out;
  SIGNED_NUMBER.lastIndex = 0;
  let m;
  while ((m = SIGNED_NUMBER.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isENDigit, isANDigit, isDigit, digitScript, leadingNumber, signedNumberRuns };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
