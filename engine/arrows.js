'use strict';
// engine/arrows.js — classify horizontal arrows for VISUAL mirroring in RTL context
// (§8.F). The Unicode bidi algorithm does NOT mirror arrows (only paired punctuation),
// so an RTL reader sees "→" pointing the wrong way. We never change the character
// (fidelity hard rule §3.6) — the DOM layer wraps it and flips it with a CSS transform,
// so copy/Ctrl-F still return the original glyph. PURE.

const { segmentMath } = require('./math.js');
const { isStrongLTR, isStrongRTL, isRTLDigit } = require('./ranges.js');

// The direction of the nearest STRONG influence scanning `str` from `start` by `step` (±1):
// 'L' (a strong-LTR letter), 'R' (a strong-RTL letter, OR a digit — UBA N1 says numbers act as
// R for neutral resolution), or null at a boundary. Weak/neutral chars (spaces, punctuation,
// signs) are skipped — they are exactly the run an arrow's direction is decided across.
function neighborDir(str, start, step) {
  for (let j = start; j >= 0 && j < str.length; j += step) {
    const cp = str.codePointAt(j);
    if (cp >= 0xdc00 && cp <= 0xdfff) continue; // low-surrogate half → its astral cp is at j-1
    if (isStrongLTR(cp)) return 'L';
    if (isStrongRTL(cp)) return 'R';
    if ((cp >= 0x30 && cp <= 0x39) || isRTLDigit(cp)) return 'R'; // numbers act as R (N1)
  }
  return null;
}

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

// Which arrows in `text` are PROSE arrows that should be visually flipped in an RTL block —
// returns their UTF-16 offsets. Arrows that fall inside a math run ($…$ / \(…\) / \[…\] /
// $$…$$, per segmentMath) are LTR math semantics ("a → b" reads left-to-right even in
// Hebrew) and are EXCLUDED. Currency `$…$` is not math, so arrows next to prices still flip.
//
// CRUCIAL per-arrow rule: an arrow only flips when its LOCAL context is RTL, NOT because the
// block's MAJORITY is. An arrow whose nearest strong neighbour on BOTH sides is LTR sits inside
// an LTR run ("…input → output…" embedded in a Hebrew sentence): by bidi N1 it resolves LTR and
// already points at its target on the right, so it must NOT flip. Hebrew-flanked, number-flanked
// (N1: numbers act as R), mixed, and boundary arrows do flip with the RTL block. The DOM layer
// additionally skips arrows inside *rendered* KaTeX/MathJax/MathML or code islands (those text
// nodes never reach here). PURE; offsets index the input string.
function arrowFlipOffsets(text) {
  const out = [];
  if (!text) return out;
  // Ranges of a literal braced sub/superscript "_{…}" / "^{…}" — an arrow inside a math BOUND
  // ("lim_{x→0}", "a_{i→j}") is LTR math semantics and must NOT flip (otherwise "x→0" → "x←0").
  const scriptRanges = [];
  for (let i = 0; i + 1 < text.length; i++) {
    if ((text[i] === '_' || text[i] === '^') && text[i + 1] === '{') {
      let depth = 0;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') { depth -= 1; if (depth === 0) { scriptRanges.push([i, j]); i = j; break; } }
      }
    }
  }
  const inScript = (p) => {
    for (let k = 0; k < scriptRanges.length; k++) if (p > scriptRanges[k][0] && p < scriptRanges[k][1]) return true;
    return false;
  };
  const segs = segmentMath(text);
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (seg.type !== 'text') continue; // math run → its arrows keep their LTR direction
    const v = seg.value;
    for (let i = 0; i < v.length; ) {
      const cp = v.codePointAt(i);
      const w = cp > 0xffff ? 2 : 1;
      if (isMirrorArrow(cp) && !inScript(seg.start + i)) {
        // skip an arrow embedded in an LTR run (both nearest strong neighbours are LTR)
        if (!(neighborDir(v, i - 1, -1) === 'L' && neighborDir(v, i + w, 1) === 'L')) {
          out.push(seg.start + i);
        }
      }
      i += w;
    }
  }
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirrorArrow, hasMirrorArrow, arrowFlipOffsets };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
