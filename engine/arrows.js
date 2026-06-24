'use strict';
// engine/arrows.js — classify horizontal arrows for VISUAL mirroring in RTL context
// (§8.F). The Unicode bidi algorithm does NOT mirror arrows (only paired punctuation),
// so an RTL reader sees "→" pointing the wrong way. We never change the character
// (fidelity hard rule §3.6) — the DOM layer wraps it and flips it with a CSS transform,
// so copy/Ctrl-F still return the original glyph. PURE.

// Arrow blocks. Flipping a vertical arrow (↑↓) horizontally is a no-op, and a diagonal
// (↗) flips to its correct RTL counterpart (↖), so spanning whole blocks is safe.
const ARROW_RANGES = [
  [0x2190, 0x21FF], // Arrows
  [0x2794, 0x27BE], // Dingbat arrows (➔ ➜ ➡ …)
  [0x27F0, 0x27FF], // Supplemental Arrows-A (⟵ ⟶ …)
  [0x2900, 0x297F], // Supplemental Arrows-B
  [0x2B00, 0x2B11], // Misc Symbols and Arrows (⬅ ⬆ ⬇ …)
  [0x2B30, 0x2B4F], // additional arrows
  [0x2B95, 0x2B95], // ⮕
];

function isMirrorArrow(cp) {
  for (let i = 0; i < ARROW_RANGES.length; i++) {
    if (cp >= ARROW_RANGES[i][0] && cp <= ARROW_RANGES[i][1]) return true;
  }
  return false;
}

function hasMirrorArrow(str) {
  for (const ch of str) {
    if (isMirrorArrow(ch.codePointAt(0))) return true;
  }
  return false;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirrorArrow, hasMirrorArrow };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
