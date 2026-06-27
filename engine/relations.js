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

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirroredMathRel, hasMirroredMathRel };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
