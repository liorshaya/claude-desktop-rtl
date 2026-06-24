'use strict';
// dom/apply.js — the thin application layer (§5). CSS does ~85% declaratively; this does
// only what CSS can't: input dir="auto", one scoped debounced observer that flips
// <table> column order and (optionally) isolates bare islands, all streaming-settle
// aware and idempotent. It NEVER writes dir on a prose block or container — per-leaf
// `unicode-bidi: plaintext` owns that (§3.2, §8.K), so a mixed document never flips.
//
// In the browser payload this file shares one IIFE scope with engine/ + dom/surfaces.js,
// so it calls their functions (tableDir, findMessageRoots, …) by bare name. It is inert
// when there is no DOM.

// The build replaces the placeholder below with the apply.css stylesheet text, so the
// payload is self-contained (no extra fetch). Left as a literal for node/dev loads.
const APPLY_CSS = '__APPLY_CSS__';

// §3.6: bare-island wrapping mutates the DOM, so it stays OFF until the corpus proves a
// case CSS isolation can't reach. Code/links/math are already isolated by apply.css.
const ENABLE_ISLANDS = false;

// Browser bring-up diagnostics — off by default; flip on when adopting a new Claude UI.
const DEBUG = false;
function dlog() {
  if (DEBUG && typeof console !== 'undefined') console.info.apply(console, ['[claude-rtl]'].concat([].slice.call(arguments)));
}
dlog('payload evaluated; document =', typeof document);

const SETTLE_MS = 250; // §3.3: run the heavy pass only after the stream goes quiet.
const MAX_NODES_PER_PASS = 400; // backstop so a giant transcript can't lock the thread.
const DONE_ATTR = 'data-rtl-done';

function injectCSS(doc) {
  // In a userscript on a strict-CSP site (claude.ai), GM_addStyle is the CSP-safe path;
  // typeof-guarded so the Electron renderer (no GM) falls back to a plain <style>.
  if (typeof GM_addStyle === 'function') { GM_addStyle(APPLY_CSS); return; }
  if (doc.getElementById('claude-rtl-style')) return;
  const style = doc.createElement('style');
  style.id = 'claude-rtl-style';
  style.textContent = APPLY_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

// dir="auto" gives native-correct caret/selection in RTL and is one of the only places
// JS sets dir (an input box, not prose). React strips it, so we re-assert on input.
function setInputDir(el) {
  if (el && el.getAttribute && el.getAttribute('dir') !== 'auto') el.setAttribute('dir', 'auto');
}

function sweepInputs(root) {
  const inputs = findInputs(root);
  for (let i = 0; i < inputs.length; i++) setInputDir(inputs[i]);
}

// Apply dir="auto" to a freshly-added node and any inputs inside it. Called synchronously
// from the observer so an edit box is dir="auto" BEFORE its first paint — no visible
// LTR→RTL flip. dir="auto" is live, so even a box that mounts empty then fills with
// Hebrew resolves RTL on its own with no second pass.
function applyInputDir(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && (node.matches(SELECTORS.composer) || node.matches(SELECTORS.editBox))) {
    setInputDir(node);
  }
  sweepInputs(node);
}

// Flip a table's column order when the engine says the table is RTL (§3.2). This is the
// only dir attribute JS writes on rendered content. Idempotent via DONE_ATTR.
function processTable(table) {
  if (table.getAttribute(DONE_ATTR)) return;
  const shape = readTableShape(table);
  if (tableDir(shape.headers, shape.firstColumn) === 'rtl') table.setAttribute('dir', 'rtl');
  table.setAttribute(DONE_ATTR, '1');
}

// §8.D — a fenced block that is really RTL prose (Claude mis-used ``` for a Hebrew
// "table"/text) gets tagged so the CSS renders it RTL per line. REAL code is left LTR
// untouched — the engine's codeBlockIsProse is conservative (any code structure → code).
function processCodeBlock(pre) {
  if (pre.getAttribute(DONE_ATTR)) return;
  if (codeBlockIsProse(pre.textContent || '')) pre.setAttribute('data-rtl-text', '');
  pre.setAttribute(DONE_ATTR, '1');
}

// §8.F — visually mirror arrows inside RTL blocks by wrapping each in <span
// data-rtl-arrow>; CSS does the flip. The character is preserved exactly, so copy/Ctrl-F
// are byte-for-byte (§3.6 hard rule). Only RTL blocks are touched, and each block is
// stamped so re-runs are O(new blocks).
const ARROWS_ATTR = 'data-rtl-arrows';
function wrapArrowsInBlock(block) {
  if (block.getAttribute(ARROWS_ATTR) === '1') return;
  block.setAttribute(ARROWS_ATTR, '1');
  if (!hasMirrorArrow(block.textContent || '')) return;
  if (detectBlockDir(block.textContent || '') !== 'rtl') return; // mirror only in RTL blocks
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || !hasMirrorArrow(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (p && p.hasAttribute && p.hasAttribute('data-rtl-arrow')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  for (let i = 0; i < targets.length; i++) splitArrows(targets[i]);
}

function splitArrows(node) {
  const frag = document.createDocumentFragment();
  let buf = '';
  for (const ch of node.nodeValue) {
    if (isMirrorArrow(ch.codePointAt(0))) {
      if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
      const span = document.createElement('span');
      span.setAttribute('data-rtl-arrow', '');
      span.textContent = ch; // exact glyph preserved — CSS flips it visually only
      frag.appendChild(span);
    } else {
      buf += ch;
    }
  }
  if (buf) frag.appendChild(document.createTextNode(buf));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

function processRoot(root) {
  if (!root) return;
  const tables = findTables(root);
  for (let i = 0; i < tables.length && i < MAX_NODES_PER_PASS; i++) processTable(tables[i]);
  const codeBlocks = findCodeBlocks(root);
  for (let i = 0; i < codeBlocks.length && i < MAX_NODES_PER_PASS; i++) processCodeBlock(codeBlocks[i]);
  const leaves = findLeafBlocks(root);
  for (let i = 0; i < leaves.length && i < MAX_NODES_PER_PASS; i++) wrapArrowsInBlock(leaves[i]);
  if (ENABLE_ISLANDS) wrapBareIslands(root); // eslint-disable-line no-use-before-define
  sweepInputs(root);
}

// §3.6 step 2 — minimal, idempotent isolation of a bare opposite-direction run via
// <span dir="auto"> (markup isolation, never injected control chars). Disabled by
// default; left here so enabling it is a one-flag change once the corpus needs it.
function wrapBareIslands(/* root */) {
  // Intentionally empty until ENABLE_ISLANDS is justified by a corpus case (§15.2).
}

function makeObserver(doc) {
  let timer = null;
  const pending = new Set();

  const flush = () => {
    timer = null;
    const roots = pending.size ? Array.from(pending) : [doc.body];
    pending.clear();
    for (const r of roots) processRoot(r);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SETTLE_MS); // debounce == streaming-settle window
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Inputs are handled SYNCHRONOUSLY (no debounce) so a freshly-opened edit box is
      // dir="auto" before its first paint — the table/island pass stays deferred.
      for (let i = 0; i < m.addedNodes.length; i++) applyInputDir(m.addedNodes[i]);
      const target = m.target && m.target.nodeType === 1 ? m.target : doc.body;
      // Scope work to the nearest message root when we can; else the target subtree.
      const root = (target.closest && target.closest(SELECTORS.messageRoot)) || target;
      pending.add(root);
    }
    schedule();
  });

  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return observer;
}

function init() {
  if (typeof document === 'undefined') return; // safe to prepend to any renderer bundle
  const doc = document;
  dlog('init() running; readyState =', doc.readyState, '; GM_addStyle =', typeof GM_addStyle);
  if (doc.documentElement.hasAttribute('data-claude-rtl')) return; // idempotent
  doc.documentElement.setAttribute('data-claude-rtl', '1');
  dlog('data-claude-rtl set');

  injectCSS(doc);

  // Initial sweep over whatever is already rendered.
  for (const r of findMessageRoots(doc)) processRoot(r);
  sweepInputs(doc);

  // Re-assert input dir on every input event (React strips it), delegated so it covers
  // inputs that mount later.
  doc.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (t && t.matches && (t.matches(SELECTORS.composer) || t.matches(SELECTORS.editBox))) {
        setInputDir(t);
      }
    },
    true
  );

  if (doc.body) makeObserver(doc);
  else doc.addEventListener('DOMContentLoaded', () => makeObserver(doc), { once: true });
}

try {
  init();
} catch (e) {
  if (typeof console !== 'undefined') console.error('[claude-rtl] init failed:', e);
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { init, processTable, processRoot };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
