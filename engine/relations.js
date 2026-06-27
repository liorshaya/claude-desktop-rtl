'use strict';
// engine/relations.js — classify raw Unicode math RELATION symbols that the Unicode bidi
// algorithm itself MIRRORS in an RTL context (§8.F). UAX#9 rule L4 renders any character
// with Bidi_Mirrored=Yes as its mirror glyph at an odd (RTL) embedding level, so a Hebrew
// line containing "3 < 5" reads "3 > 5" — mathematically false. We never touch the code
// point (fidelity §3.6); the DOM wraps each such symbol in an LTR-isolated span so the
// browser renders the upright glyph, with operands kept in reading order.
//
// The set is exactly: General_Category Sm (math symbol) AND Bidi_Mirrored=Yes — i.e. the
// comparison family (< ≤ ≪ ≮ …), set/order relations (∈ ⊂ ⊆ ≺ …), and ≠ ≈ ≅. PAIRED
// BRACKETS (Ps/Pe: ( ) [ ] { } ⟨ ⟩) are EXCLUDED: their RTL mirroring is CORRECT and
// intended by Unicode (§8.F — "leave to UBA"). ARROWS are excluded too (Bidi_Mirrored=No —
// the DOM flips those visually instead). Symmetric ops (= ≡ ± × ÷) are not Bidi_Mirrored,
// so they never mis-render. PURE; classifies by code point, astral-safe.

const SM = /\p{Sm}/u;
const MIRRORED = /\p{Bidi_Mirrored}/u;

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
// ("<div>"). A comparison must be isolated (so it doesn't read "3 > 5"); a TAG must NOT —
// its brackets sit at the ends, and isolating each one un-mirrors the glyph but RTL still
// swaps their positions, so "<div>" would read ">div<". A bare tag is rendered correctly by
// UBA on its own (the glyph-mirror and the position-swap cancel out), so we leave tag
// brackets alone. This regex matches a tag run: `<` or `</` immediately followed by a tag
// name, up to its closing `>` (<div>, </div>, <br/>, <a href="x">). A `<` with a space or a
// digit after it is NOT a tag, so real comparisons ("3 < 5", "a < b", "x<y") still isolate.
const TAG_RUN = /<\/?[A-Za-z][^<>]*>/g;

// UTF-16 offsets of the mirror-relation chars to ISOLATE in `text`. Every isMirroredMathRel
// char qualifies EXCEPT a `<`/`>` that belongs to a tag run (left to UBA). The unambiguous
// relations (≤ ≥ ∈ ⊂ …) always isolate; only the dual-use `< >` are filtered. PURE; offsets
// index the input string (astral-safe).
function relationOffsets(text) {
  const out = [];
  if (!text) return out;
  const tags = [];
  TAG_RUN.lastIndex = 0;
  let m;
  while ((m = TAG_RUN.exec(text))) tags.push([m.index, m.index + m[0].length]);
  const inTag = (i) => {
    for (let k = 0; k < tags.length; k++) if (i >= tags[k][0] && i < tags[k][1]) return true;
    return false;
  };
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const w = cp > 0xffff ? 2 : 1;
    if (isMirroredMathRel(cp)) {
      const ch = text[i];
      if (!((ch === '<' || ch === '>') && inTag(i))) out.push(i);
    }
    i += w;
  }
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirroredMathRel, hasMirroredMathRel, relationOffsets };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
