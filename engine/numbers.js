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

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isENDigit, isANDigit, isDigit, digitScript, leadingNumber };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
