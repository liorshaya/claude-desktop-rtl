'use strict';
// engine/detect.js — base-direction detection (§3.2). PURE, the load-bearing logic.
// Fallback is ALWAYS null (never a forced 'rtl') — that single bug is what flips
// English documents RTL (§8.K). JS never stamps dir on prose; this drives table /
// island / streaming-settle decisions only.

const { isStrongRTL, isStrongLTR, hasRTL } = require('./ranges.js');
const { leadingNumber } = require('./numbers.js');

// First strong char: strong-RTL → 'rtl', strong-LTR → 'ltr', else null. Skips neutrals
// (digits, punctuation, spaces, emoji). This is UBA P2/P3.
function firstStrong(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isStrongRTL(cp)) return 'rtl';
    if (isStrongLTR(cp)) return 'ltr';
  }
  return null;
}

// Whole-string majority of strong chars; null on tie/none.
function majority(text) {
  let r = 0;
  let l = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isStrongRTL(cp)) r++;
    else if (isStrongLTR(cp)) l++;
  }
  if (r > l) return 'rtl';
  if (l > r) return 'ltr';
  return null;
}

// Leading-noise strippers, each returns the match LENGTH at the start of s (0 = no
// match). Applied repeatedly so "1. " then "Next.js " then … peel in sequence, letting
// an RTL line that opens with a technical token still read RTL. We strip only tokens
// that LOOK structural/technical — never an ordinary English word.
const WHITESPACE = /^\s+/;
const BULLET = /^(?:[-*•‣◦·–—]|#{1,6}|\d+[.)]|\[[ xXvV]\]|>)(?=\s)/;
const EMOJI = /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️←-➿⬀-⯿]+/u;
const CODE = /^`[^`]*`/;
const URL = /^(?:https?:\/\/|www\.)\S+/i;
const PATH = /^~?(?:\.{1,2})?(?:\/[\w.\-]+)+\/?/; // must contain at least one slash
const DOTTED = /^[A-Za-z0-9]+(?:[._\-][A-Za-z0-9]+)+/; // foo.js, Next.js, v4.6, e.g
const WORD = /^[A-Za-z]+/; // a leading Latin word — a brand/term opener (§3.2)

function leadingNoiseLength(s) {
  let m;
  if ((m = s.match(WHITESPACE))) return m[0].length;
  if ((m = s.match(BULLET))) return m[0].length;
  if ((m = s.match(EMOJI))) return m[0].length;
  if ((m = s.match(CODE))) return m[0].length;
  if ((m = s.match(URL))) return m[0].length;
  if ((m = s.match(PATH))) return m[0].length;
  if ((m = s.match(DOTTED))) return m[0].length;
  const num = leadingNumber(s);
  if (num) return num.length;
  // A plain leading Latin word ("React", "The", …). Peeling it is safe: pure-English
  // text strips down to '' and then majority(raw) still returns 'ltr'; only when RTL
  // content follows does first-strong then read 'rtl' — the brand-opener case (§13).
  if ((m = s.match(WORD))) return m[0].length;
  return 0;
}

// Peel leading URL / path / `code` / number / emoji / bullet / dotted token before
// first-strong. Output is always a SUFFIX of the input (no injected chars — §3.6 hard rule).
function stripLeadingNoise(text) {
  let s = text;
  let n;
  while (s.length > 0 && (n = leadingNoiseLength(s)) > 0) {
    s = s.slice(n);
  }
  return s;
}

// detectBlockDir(text): stripLeadingNoise → firstStrong → if null, majority(raw).
// Fallback is null, NEVER 'rtl' (§3.2, §8.K).
function detectBlockDir(text) {
  if (!text) return null;
  const clean = stripLeadingNoise(text);
  const d = firstStrong(clean);
  if (d !== null) return d;
  return majority(text);
}

// Table cell (§3.2): any RTL char → 'rtl' (a Hebrew column may have an "ID" header);
// neutral-only → null; otherwise (strong-LTR present) → 'ltr'.
function cellDir(text) {
  if (hasRTL(text)) return 'rtl';
  if (firstStrong(text) === 'ltr') return 'ltr';
  return null;
}

function majorityOfDirs(dirs) {
  let r = 0;
  let l = 0;
  for (const d of dirs) {
    if (d === 'rtl') r++;
    else if (d === 'ltr') l++;
  }
  if (r > l) return 'rtl';
  if (l > r) return 'ltr';
  return null;
}

// Table column-order direction (§3.2) — ONE of the two independent table layers. This
// decides only the COLUMN FLOW order (first column on the right vs left), written as `dir`
// on the <table>. It follows the MAJORITY content direction across EVERY cell: a
// majority-Hebrew table reads RTL even when its key/header column is English (the case the
// screenshots catch). A tie (or all-neutral) is broken by the header row; still tied →
// null (leave LTR, write no dir). The other layer — each cell's INTERNAL bidi order and
// its column's alignment edge — is owned by `unicode-bidi: plaintext` + `columnDirs`, not
// here. (Was header[0]-decides; changed to majority-of-content per the table redesign.)
function tableDir(allCells, headers) {
  allCells = allCells || [];
  headers = headers || [];
  const maj = majorityOfDirs(allCells.map(cellDir));
  if (maj) return maj;
  return majorityOfDirs(headers.map(cellDir));
}

// Per-column alignment direction (§3.2) — the SECOND table layer. Majority `cellDir` down
// each column, so a column hugs the edge of its own language (Hebrew → 'rtl'/right,
// English/number → 'ltr'/left) for clean columns, independent of the table's column order.
// `rows` is an array of rows, each an array of cell texts (ragged rows are fine). Returns
// an array indexed by column: 'rtl' | 'ltr' | null (neutral column → leave to default).
function columnDirs(rows) {
  rows = rows || [];
  const cols = [];
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (!cols[c]) cols[c] = [];
      cols[c].push(cellDir(row[c] || ''));
    }
  }
  return cols.map((dirs) => majorityOfDirs(dirs));
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { firstStrong, majority, stripLeadingNoise, detectBlockDir, cellDir, tableDir, columnDirs };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
