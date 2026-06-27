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

// Read a <table>'s header cells and the first data column as plain text — the input
// to engine.tableDir (§3.2). Returns { headers, firstColumn }.
function readTableShape(table) {
  const headerCells = qsa('thead th, thead td, tr:first-child th, tr:first-child td', table);
  const headers = headerCells.map((c) => (c.textContent || '').trim());
  const bodyRows = qsa('tbody tr', table);
  const rows = bodyRows.length ? bodyRows : qsa('tr', table).slice(1);
  const firstColumn = rows
    .map((r) => {
      const cell = r.querySelector('th, td');
      return cell ? (cell.textContent || '').trim() : '';
    })
    .filter((t) => t.length > 0);
  return { headers, firstColumn };
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = {
  SELECTORS, qsa, findInputs, findMessageRoots, findTables, findCodeBlocks,
  findLeafBlocks, findDirBlocks, readTableShape,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
