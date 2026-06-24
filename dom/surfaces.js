'use strict';
// dom/surfaces.js — surface coverage map (§6). The ONE place that knows claude.ai's DOM
// shape, so adapting to a Claude UI change is a one-file edit (the P6 "adopt a new
// version" runbook lives off this). DOM-touching but defensive: every query is scoped
// and null-safe. No direction logic here — that's the engine.

// Selectors are deliberately broad/redundant: Claude ships Tailwind `prose` plus
// data-attributes that have been stable across versions. Tune here during the browser
// pass if a surface is missed.
const SELECTORS = {
  // Streamed-response roots: where prose blocks live. We attach the observer per-root.
  messageRoot: '.prose, [data-message-author-role], [data-testid="message-content"]',
  // The chat input (contenteditable) and the message-EDIT box (textarea, often missed).
  composer: '[contenteditable="true"], div.ProseMirror[contenteditable]',
  editBox: 'textarea',
  // Inline islands the browser/CSS already isolates; listed for completeness/JS passes.
  code: 'pre, code, .code-block__code',
  math: '.katex, .katex-display, mjx-container, math',
  table: 'table',
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
const api = { SELECTORS, qsa, findInputs, findMessageRoots, findTables, readTableShape };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
