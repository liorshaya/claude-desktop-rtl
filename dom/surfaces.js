'use strict';
// dom/surfaces.js — surface coverage map (§6). The ONE place that knows claude.ai's DOM
// shape, so adapting to a Claude UI change is a one-file edit (the P6 "adopt a new
// version" runbook lives off this). DOM-touching but defensive: every query is scoped
// and null-safe. No direction logic here — that's the engine.

// Selectors are deliberately broad/redundant: Claude ships Tailwind `prose` plus
// data-attributes that have been stable across versions. Tune here during the browser
// pass if a surface is missed.
const SELECTORS = {
  // Streamed-response roots: where prose blocks live (claude.ai, verified DOM). We attach
  // the observer per-root. `.prose` kept as a fallback for other Claude surfaces/versions.
  messageRoot:
    '.standard-markdown, .font-claude-response, .font-claude-message, [data-testid="user-message"], .prose',
  // The chat input (ProseMirror contenteditable) and the message-EDIT box. Editing reuses
  // a contenteditable, so the composer selector covers it; textarea kept for safety.
  composer: '[contenteditable="true"], div.ProseMirror[contenteditable]',
  editBox: 'textarea',
  // Inline islands the browser/CSS already isolates; listed for completeness/JS passes.
  code: 'pre, code, .code-block__code',
  math: '.katex, .katex-display, mjx-container, .MathJax, math',
  table: 'table',
  // Fenced blocks we test for "is this really code, or mis-fenced RTL text?" (§8.D).
  codeBlock: 'pre',
  // Leaf prose blocks the arrow-mirroring pass walks (only RTL ones get wrapped, §8.F).
  // Includes prose-code blocks once they've been tagged data-rtl-text.
  leafBlock:
    'p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption, caption, td, th, pre[data-rtl-text]',
  // Blocks with a direction-dependent DECORATION (list markers/indent, blockquote bar)
  // get an explicit dir so the decoration lands on the content's side (§6).
  dirBlock: 'ul, ol, li, blockquote',
  // Any editable INPUT host: the chat composer AND the in-place message-EDIT box (both
  // reuse a ProseMirror contenteditable; textarea kept for safety). Content-mutation
  // passes must NEVER run inside one — ProseMirror reconciles its OWN DOM, so wrapping a
  // signed number / arrow or flipping a list's dir there desyncs the editor and FREEZES
  // typing (the "-5" composer bug). The ONLY thing we ever set on these is dir="auto"
  // (sweepInputs, §5/§6).
  editableHost: '[contenteditable="true"], [contenteditable=""], .ProseMirror, textarea',
  // Headings/paragraphs where CSS `plaintext` first-strong can misfire on a Latin/marker
  // opener of a Hebrew block ("8c. בדיקה…", "React הוא…"); we override only then (§3.2/§8.K).
  proseDir: 'p, h1, h2, h3, h4, h5, h6',
};

function qsa(selector, root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return Array.prototype.slice.call(root.querySelectorAll(selector));
}

// All input surfaces that should carry dir="auto" (composer + edit boxes, §5/§6).
function findInputs(root) {
  return qsa(SELECTORS.composer, root).concat(qsa(SELECTORS.editBox, root));
}

function findMessageRoots(root) {
  return qsa(SELECTORS.messageRoot, root);
}

function findTables(root) {
  return qsa(SELECTORS.table, root);
}

function findCodeBlocks(root) {
  return qsa(SELECTORS.codeBlock, root);
}

function findLeafBlocks(root) {
  return qsa(SELECTORS.leafBlock, root);
}

function findDirBlocks(root) {
  return qsa(SELECTORS.dirBlock, root);
}

function findProseDirBlocks(root) {
  return qsa(SELECTORS.proseDir, root);
}

// Read a <table> as plain text for the engine (§3.2): the header row (the column-order
// tie-break) and EVERY cell (drives the majority column-order decision in tableDir).
// Returns { headers, allCells }.
function readTableShape(table) {
  const headerCells = qsa('thead th, thead td, tr:first-child th, tr:first-child td', table);
  const headers = headerCells.map((c) => (c.textContent || '').trim());
  const allCells = qsa('th, td', table).map((c) => (c.textContent || '').trim());
  return { headers, allCells };
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = {
  SELECTORS, qsa, findInputs, findMessageRoots, findTables, findCodeBlocks,
  findLeafBlocks, findDirBlocks, findProseDirBlocks, readTableShape,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
