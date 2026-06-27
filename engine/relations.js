'use strict';
// engine/relations.js — classify raw Unicode math RELATION symbols that the Unicode bidi
// algorithm itself MIRRORS in an RTL context (§8.F), and find the EXTENT of the comparison
// EXPRESSION each one belongs to. UAX#9 rule L4 renders any character with Bidi_Mirrored=Yes
// as its mirror glyph at an odd (RTL) embedding level, and N1/N2 then REORDER the surrounding
// number/letter operands — so a Hebrew line containing "0 < x ≤ 4" reads "x ≤ 4 < 0": the
// operators flip AND the operands are permuted, changing the math. We never touch the code
// point (fidelity §3.6); the DOM wraps the whole expression in an LTR-isolated span so the
// browser renders upright glyphs AND keeps the operands in their original left-to-right order.
//
// Why the WHOLE expression and not each symbol: isolating only the operator fixes the glyph
// but NOT the operand order — measured, "3 < 5" with just "<" isolated still renders "5 < 3",
// and "0 < x ≤ 4" still renders "x ≤ 4 < 0". Isolating the maximal run `TERM (REL TERM)+`
// puts the entire comparison at one even embedding level, so it reads "0 < x ≤ 4" correctly.
//
// The mirror set is exactly: General_Category Sm (math symbol) AND Bidi_Mirrored=Yes — the
// comparison family (< ≤ ≪ ≮ …), set/order relations (∈ ⊂ ⊆ ≺ …), and ≠ ≈ ≅. PAIRED BRACKETS
// (Ps/Pe: ( ) [ ] { } ⟨ ⟩) are EXCLUDED: their RTL mirroring is CORRECT and intended by Unicode
// (§8.F — "leave to UBA"). ARROWS are excluded too (Bidi_Mirrored=No — the DOM flips those
// visually instead). PURE; classifies by code point, astral-safe (offsets index the input).

const SM = /\p{Sm}/u;
const MIRRORED = /\p{Bidi_Mirrored}/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

function isMirroredMathRel(cp) {
  const ch = String.fromCodePoint(cp);
  return SM.test(ch) && MIRRORED.test(ch);
}

function hasMirroredMathRel(str) {
  for (const ch of str) {
    if (isMirroredMathRel(ch.codePointAt(0))) return true;
  }
  return false;
}

// `<` and `>` are DUAL-USE: a comparison operator ("3 < 5") AND an HTML-tag delimiter
// ("<div>"). A comparison must be isolated (so it doesn't read "3 > 5"); a TAG must NOT — its
// brackets sit at the ends, and isolating them un-mirrors the glyphs but RTL still swaps their
// positions, so "<div>" would read ">div<". A bare tag is rendered correctly by UBA on its own
// (glyph-mirror and position-swap cancel), so we leave tag brackets alone. This regex matches a
// tag run: `<` or `</` immediately followed by a tag name, up to its closing `>` (<div>,
// </div>, <br/>, <a href="x">). A `<` with a space or a digit after it is NOT a tag, so real
// comparisons ("3 < 5", "a < b", "x<y") still isolate.
const TAG_RUN = /<\/?[A-Za-z][^<>]*>/g;

// A TERM (comparison operand) char: a Latin or Greek letter, an EN/Arabic-Indic/Persian digit,
// or a decimal dot. NOT a Hebrew/Arabic letter (that is prose and ends the expression), NOT a
// space, NOT a sign (the sign is attached separately, only to a number, at a word boundary).
function isTermChar(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0x30 && c <= 0x39) return true;                 // 0-9
  if (c >= 0x41 && c <= 0x5a) return true;                 // A-Z
  if (c >= 0x61 && c <= 0x7a) return true;                 // a-z
  if (c >= 0x0660 && c <= 0x0669) return true;             // Arabic-Indic digits
  if (c >= 0x06f0 && c <= 0x06f9) return true;             // Persian digits
  if (c >= 0x0370 && c <= 0x03ff) return true;             // Greek (π, θ, Σ, …)
  if (c >= 0x2100 && c <= 0x214f) return true;             // Letterlike (ℕ ℤ ℝ ℚ ℂ …)
  return false; // NB: '.' is handled by the scanners as a decimal only BETWEEN term chars,
                // so a sentence-final period ("7 > 2.") is not swallowed into the operand.
}
function isDigitCh(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 0x30 && c <= 0x39) || (c >= 0x0660 && c <= 0x0669) || (c >= 0x06f0 && c <= 0x06f9);
}
function isSign(ch) {
  return ch === '+' || ch === '-' || ch === '−'; // + - −(U+2212)
}
// Currency that can prefix or suffix a number operand ($5, 5₪). isSuffix also covers %/°.
const CURRENCY = '$₪€£¥¢₹₣';
function isCurrency(ch) { return ch !== '' && CURRENCY.indexOf(ch) !== -1; }
function isSuffix(ch) { return ch === '%' || ch === '°' || isCurrency(ch); } // 50% 10° 5₪
// '.'/',' are number-internal separators (3.14, 1,000) — counted ONLY between two digits, so a
// sentence period ("2.") and a list comma ("x, y") never join an operand.
function isSep(ch) { return ch === '.' || ch === ','; }
// A connector that may CHAIN terms inside one expression: any mirror relation, plus the
// symmetric comparators `=` and `≠` (not Bidi_Mirrored, so never a seed on their own, but they
// belong in a chain like "0 ≤ x = 4"). Tag `< >` are filtered by the caller via inTag.
function isConnectorCp(cp) {
  return cp === 0x3d /* = */ || isMirroredMathRel(cp);
}

// The maximal comparison EXPRESSIONS to ISOLATE in `text`, as UTF-16 [start, end) ranges.
// Each mirror-relation char (a "seed"), except a `<`/`>` that belongs to an HTML tag, is grown
// LEFT and RIGHT over `(WS? TERM)(WS? CONNECTOR WS? TERM)*` — so a whole chain "0 < x ≤ 4"
// becomes one run; a lone relation with no operand on either side (e.g. "הסימן < מציין")
// stays a single char. Overlapping/adjacent runs (the seeds of one chain) are merged. A leading
// sign is pulled into a numeric operand ("-5 < x" → the run starts at the "-") only at a word
// boundary, exactly as numbers.signedNumberRuns decides, so the sign renders with its number.
// PURE; astral-safe (offsets index the input string).
function relationRuns(text) {
  const out = [];
  if (!text) return out;
  const len = text.length;
  const ch = (i) => text.charAt(i);
  const isWS = (c) => c === ' ' || c === '\t';

  // HTML-tag spans whose < > must not act as relations/connectors.
  const tags = [];
  TAG_RUN.lastIndex = 0;
  let m;
  while ((m = TAG_RUN.exec(text))) tags.push([m.index, m.index + m[0].length]);
  const inTag = (i) => {
    for (let k = 0; k < tags.length; k++) if (i >= tags[k][0] && i < tags[k][1]) return true;
    return false;
  };

  // Start index of the TERM ending at `end` (exclusive), '' if none. Attaches a leading sign
  // when the term is a number and the sign sits at a word boundary (not after a letter/number).
  // An OPERAND is: optional leading currency, optional sign (on a number, at a word boundary),
  // a BODY of letters/digits with '.'/',' separators between digits, and optional trailing
  // %/°/currency. termStartLeft returns the operand's start index for the operand ending at
  // `end` (exclusive), or `end` if there is none. Scans right-to-left.
  function termStartLeft(end) {
    let i = end;
    while (i > 0 && isSuffix(ch(i - 1))) i -= 1; // trailing suffix(es): 50%, 10°, 5₪
    const bodyEnd = i;
    for (;;) {
      if (i > 0 && isTermChar(ch(i - 1))) { i -= 1; continue; }
      // a separator joins the number only BETWEEN two digits (3.14, 1,000)
      if (i > 1 && i < bodyEnd && isSep(ch(i - 1)) && isDigitCh(ch(i - 2)) && isDigitCh(ch(i))) {
        i -= 1; continue;
      }
      break;
    }
    if (i === bodyEnd) return end; // no body → the suffixes (if any) weren't an operand
    if (i > 0 && isCurrency(ch(i - 1))) i -= 1; // leading currency: $5, ₪5
    if (i > 0 && isSign(ch(i - 1)) && (isDigitCh(ch(i)) || isCurrency(ch(i)))) {
      if (i - 1 === 0 || !LETTER_OR_NUMBER.test(ch(i - 2))) i -= 1; // sign at a boundary: -5, -$5
    }
    return i;
  }
  // Mirror of termStartLeft: the operand's end index (exclusive) for the operand starting at
  // `start`, or `start` if there is none. Scans left-to-right.
  function termEndRight(start) {
    let i = start;
    if (isSign(ch(i)) && i + 1 < len && (isDigitCh(ch(i + 1)) || isCurrency(ch(i + 1)))) i += 1; // -5, -$5
    if (isCurrency(ch(i))) i += 1; // leading currency: $5
    const body0 = i;
    for (;;) {
      if (i < len && isTermChar(ch(i))) { i += 1; continue; }
      if (i > body0 && isSep(ch(i)) && isDigitCh(ch(i - 1)) && i + 1 < len && isDigitCh(ch(i + 1))) {
        i += 1; continue;
      }
      break;
    }
    if (i === body0) return start; // a lone currency/sign with no number body → not an operand
    while (i < len && isSuffix(ch(i))) i += 1; // trailing suffix(es): %, °, currency
    return i;
  }
  // Grow the run leftward from the seed over (CONNECTOR WS? TERM) pairs.
  function expandLeft(relStart) {
    let runStart = relStart;
    let cursor = relStart;
    for (;;) {
      let j = cursor;
      while (j > 0 && isWS(ch(j - 1))) j -= 1;
      const ts = termStartLeft(j);
      if (ts === j) break; // no operand to the left → stop
      runStart = ts;
      let k = ts;
      while (k > 0 && isWS(ch(k - 1))) k -= 1;
      if (k > 0 && isConnectorCp(text.codePointAt(k - 1)) && !inTag(k - 1)) cursor = k - 1;
      else break;
    }
    return runStart;
  }
  // Grow the run rightward from the seed over (WS? TERM CONNECTOR) pairs.
  function expandRight(relEnd) {
    let runEnd = relEnd;
    let cursor = relEnd;
    for (;;) {
      let j = cursor;
      while (j < len && isWS(ch(j))) j += 1;
      const te = termEndRight(j);
      if (te === j) break; // no operand to the right → stop
      runEnd = te;
      let k = te;
      while (k < len && isWS(ch(k))) k += 1;
      const cp = k < len ? text.codePointAt(k) : 0;
      if (cp && isConnectorCp(cp) && !inTag(k)) cursor = k + (cp > 0xffff ? 2 : 1);
      else break;
    }
    return runEnd;
  }

  // Seed at every mirror-relation char (skip tag brackets), grow to the whole expression.
  const runs = [];
  for (let i = 0; i < len; ) {
    const cp = text.codePointAt(i);
    const w = cp > 0xffff ? 2 : 1;
    if (isMirroredMathRel(cp)) {
      const c = text[i];
      if (!((c === '<' || c === '>') && inTag(i))) runs.push([expandLeft(i), expandRight(i + w)]);
    }
    i += w;
  }
  if (!runs.length) return out;

  // Merge overlapping/adjacent runs (the several seeds of one chain map to the same span).
  runs.sort((a, b) => a[0] - b[0]);
  let cur = runs[0].slice();
  for (let r = 1; r < runs.length; r++) {
    if (runs[r][0] <= cur[1]) { if (runs[r][1] > cur[1]) cur[1] = runs[r][1]; }
    else { out.push(cur); cur = runs[r].slice(); }
  }
  out.push(cur);
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirroredMathRel, hasMirroredMathRel, relationRuns };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
