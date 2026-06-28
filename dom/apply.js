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

// Idempotent + self-healing. Called from init AND every observer pass. The Claude web app
// (React/Next) clears foreign <style> elements from <head> on render, so the desktop path
// uses an ADOPTED stylesheet — a CSSStyleSheet attached to the document that is NOT a DOM
// node, so the framework can't remove it. Userscript keeps the proven GM_addStyle path.
function ensureCSS(doc) {
  if (typeof GM_addStyle === 'function') {
    if (doc.getElementById('claude-rtl-style')) return;
    const el = GM_addStyle(APPLY_CSS);
    if (el && typeof el === 'object') el.id = 'claude-rtl-style'; // tag so the guard sees it
    return;
  }
  // Electron / no-GM: constructable stylesheet survives the app clearing the DOM head.
  if (doc.__claudeRtlSheet && doc.adoptedStyleSheets.indexOf(doc.__claudeRtlSheet) !== -1) return;
  try {
    const sheet = doc.__claudeRtlSheet || new CSSStyleSheet();
    if (!doc.__claudeRtlSheet) { sheet.replaceSync(APPLY_CSS); doc.__claudeRtlSheet = sheet; }
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.concat(sheet);
    dlog('adopted stylesheet attached');
    return;
  } catch (e) {
    dlog('adoptedStyleSheets failed, falling back to <style>:', e && e.message);
  }
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

// Process a freshly-added subtree SYNCHRONOUSLY (in the observer microtask, before paint)
// so content that arrives complete — opening an Artifact, a finished table — is RTL on
// first paint with no LTR→RTL flicker. Streaming chat is still caught by the debounced
// pass. Idempotent (stamps), so the later pass is a no-op on what we already did here.
function processAdded(node) {
  if (!node || node.nodeType !== 1) return;
  applyInputDir(node);
  if (node.matches && node.matches('table')) processTable(node);
  const tables = node.querySelectorAll ? node.querySelectorAll('table') : [];
  for (let i = 0; i < tables.length && i < MAX_NODES_PER_PASS; i++) processTable(tables[i]);
  if (node.matches && node.matches(SELECTORS.dirBlock)) processDirBlock(node);
  const dirBlocks = node.querySelectorAll ? node.querySelectorAll(SELECTORS.dirBlock) : [];
  for (let i = 0; i < dirBlocks.length && i < MAX_NODES_PER_PASS; i++) processDirBlock(dirBlocks[i]);
  // Prose dir override SYNCHRONOUSLY too (§3.2/§8.K) — so a heading/paragraph that needs the
  // Latin/marker-opener flip is RTL on FIRST paint, with no visible LTR→RTL flicker when you
  // open a chat. (Was debounced-only, which is exactly what caused the flip.)
  if (node.matches && node.matches(SELECTORS.proseDir)) processProseDir(node);
  const proseBlocks = node.querySelectorAll ? node.querySelectorAll(SELECTORS.proseDir) : [];
  for (let i = 0; i < proseBlocks.length && i < MAX_NODES_PER_PASS; i++) processProseDir(proseBlocks[i]);
}

// Tables have TWO independent layers (§3.2). Layer 1: column-ORDER — flip the <table>'s
// column flow when the engine says the majority content is RTL (the only `dir` JS writes
// on rendered content). Layer 2: per-COLUMN alignment (alignColumns). Idempotent via
// DONE_ATTR.
function processTable(table) {
  if (table.getAttribute(DONE_ATTR)) return;
  if (table.closest('pre, code')) return; // a table inside a source/code view stays LTR
  const shape = readTableShape(table);
  if (tableDir(shape.allCells, shape.headers) === 'rtl') table.setAttribute('dir', 'rtl');
  alignColumns(table);
  overrideCellDirs(table); // §8.K per cell: fix a Latin/marker-opener majority-RTL cell
  table.setAttribute(DONE_ATTR, '1');
}

// §8.K, per cell — a cell that OPENS with Latin/marker but is majority-RTL ("React הוא
// ספרייה", "WhatsApp הודעה חדשה") renders LTR-base under the leaf `plaintext`; force its
// internal direction RTL (alignment stays with the column, §3.2). Idempotent; never overwrites
// an explicit dir; skips cells holding a source/code view.
function overrideCellDirs(table) {
  const cells = qsa('th, td', table);
  for (let i = 0; i < cells.length && i < MAX_NODES_PER_PASS; i++) {
    const cell = cells[i];
    if (cell.getAttribute('data-rtl-dir') || cell.getAttribute('dir')) continue;
    if (cell.closest('pre, code')) continue;
    if (plaintextOverrideDir(proseText(cell)) === 'rtl') applyCellRtlOverride(cell);
  }
}

// §3.2 layer 2 — per-column alignment for clean mixed-direction tables. Each column hugs
// the edge of its MAJORITY content direction (Hebrew → right, English/number → left),
// independent of the table's column-order dir. JS stamps `data-rtl-col`; the CSS keys
// text-align off it. `unicode-bidi: plaintext` (CSS, on every cell) owns each cell's
// INTERNAL bidi order, so no direction is forced on cell content — this only picks the
// column's alignment edge. (colspans are ignored — markdown tables don't emit them.)
function alignColumns(table) {
  const rows = qsa('tr', table);
  const cells = [];
  const grid = [];
  for (let r = 0; r < rows.length; r++) {
    const rowCells = qsa('th, td', rows[r]);
    cells[r] = rowCells;
    grid[r] = rowCells.map((c) => (c.textContent || '').trim());
  }
  const dirs = columnDirs(grid);
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (dirs[c]) cells[r][c].setAttribute('data-rtl-col', dirs[c]);
    }
  }
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
//
// Math/code arrows are NOT flipped: "a → b" is universal LTR notation (it reads
// left-to-right even in a Hebrew sentence), and the island is already LTR-isolated, so a
// flip would reverse its meaning. Two guards cooperate: `inLtrIsland` skips text nodes
// inside *rendered* KaTeX/MathJax/MathML or code; `arrowFlipOffsets` (engine) excludes
// arrows inside a *raw* $…$/\(…\)/\[…\] run within a single text node. A mis-fenced
// Hebrew-prose ``` block (data-rtl-text, §8.D) is prose, so its arrows still flip.
const ARROWS_ATTR = 'data-rtl-arrows';

// Is this text node inside an LTR math/code island whose arrows must stay LTR? A
// `pre[data-rtl-text]` fence is mis-fenced RTL prose (§8.D), so it is NOT an island.
function inLtrIsland(node) {
  const el = node.parentElement;
  if (!el || !el.closest) return false;
  const island = el.closest(SELECTORS.math + ', ' + SELECTORS.code);
  if (!island) return false;
  if (island.closest('pre[data-rtl-text]')) return false; // mis-fenced prose → arrows flip
  return true;
}

function wrapArrowsInBlock(block) {
  if (block.getAttribute(ARROWS_ATTR) === '1') return;
  block.setAttribute(ARROWS_ATTR, '1');
  if (!hasMirrorArrow(block.textContent || '')) return;
  if (resolvedDir(proseText(block)) !== 'rtl') return; // mirror only where the block renders RTL
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || !hasMirrorArrow(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (p && p.hasAttribute && p.hasAttribute('data-rtl-arrow')) return NodeFilter.FILTER_REJECT;
      if (inLtrIsland(n)) return NodeFilter.FILTER_REJECT; // rendered math/code → keep LTR
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  for (let i = 0; i < targets.length; i++) splitArrows(targets[i]);
}

function splitArrows(node) {
  const text = node.nodeValue;
  // Only these offsets are prose arrows; arrows inside a raw math run are excluded (engine).
  const flip = arrowFlipOffsets(text);
  if (!flip.length) return; // every arrow here is math → leave the node untouched
  const flipSet = new Set(flip);
  const frag = document.createDocumentFragment();
  let buf = '';
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const w = cp > 0xffff ? 2 : 1;
    const ch = text.slice(i, i + w);
    if (flipSet.has(i)) {
      if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
      const span = document.createElement('span');
      span.setAttribute('data-rtl-arrow', '');
      span.textContent = ch; // exact glyph preserved — CSS flips it visually only
      frag.appendChild(span);
    } else {
      buf += ch;
    }
    i += w;
  }
  if (buf) frag.appendChild(document.createTextNode(buf));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

// §8.F — raw Unicode math RELATIONS (`< ≤ ∈ ⊂ …`, Bidi_Mirrored) are mirrored by the browser
// in an RTL block (UAX#9 L4) AND its operands get reordered (N1/N2), so "0 < x ≤ 4" reads
// "x ≤ 4 < 0" — the glyphs flip and the terms permute, changing the math. We wrap the whole
// comparison EXPRESSION (engine relationRuns grows each relation over its operands and chains)
// in <span data-rtl-relation>, which CSS isolates LTR — the browser then renders upright glyphs
// AND keeps the operands left-to-right. (Per-symbol isolation was measured insufficient: it
// fixes the glyph but the operands still swap — "3 < 5" → "5 < 3".) A lone relation between two
// non-operands stays a single char. The code point is untouched (copy/Ctrl-F intact, §3.6).
//
// Unlike arrows, this is NEITHER gated on the block's direction NOR limited to prose leaves:
// isolating a comparison LTR is correct in BOTH directions (a no-op in an LTR block, the fix in
// an RTL one), so we walk the whole message root. That catches an expression in a container
// `plaintext` never reached — a bare equation in a `<div>` with no `<p>` would otherwise render
// "x ≤ 4 > 0" (the reported standalone-equation bug). Rendered KaTeX/MathJax/code are already
// LTR-isolated (inLtrIsland); the composer and source/code views are skipped so we never mutate
// the input; brackets are excluded by the engine. Idempotent: a relation already inside a
// data-rtl-relation span is left alone, so re-walks during streaming are safe.
function wrapRelationsUnder(root) {
  if (!root || root.nodeType !== 1) return;
  if (!hasMathRun(root.textContent || '')) return; // comparison OR numeric arithmetic
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || !hasMathRun(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (p && p.hasAttribute && p.hasAttribute('data-rtl-relation')) return NodeFilter.FILTER_REJECT;
      if (inLtrIsland(n)) return NodeFilter.FILTER_REJECT; // rendered math/code already LTR
      if (p && p.closest && p.closest('pre, code, [contenteditable="true"], .ProseMirror')) {
        return NodeFilter.FILTER_REJECT; // never touch source views or the input box
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  for (let i = 0; i < targets.length && i < MAX_NODES_PER_PASS; i++) splitRelations(targets[i]);
}

function splitRelations(node) {
  const text = node.nodeValue;
  // Each run is a whole comparison expression to isolate LTR (operators + operands + chains),
  // EXCLUDING the < > of an HTML tag (those would read ">div<" if isolated). A lone relation
  // with no operands is a single-char run. Engine offsets are exact UTF-16 ranges.
  const runs = relationRuns(text);
  if (!runs.length) return; // e.g. a node whose only "relations" are tag brackets
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (let r = 0; r < runs.length; r++) {
    const s = runs[r][0];
    const e = runs[r][1];
    if (s > pos) frag.appendChild(document.createTextNode(text.slice(pos, s)));
    const span = document.createElement('span');
    span.setAttribute('data-rtl-relation', '');
    span.textContent = text.slice(s, e); // exact chars preserved — CSS isolates the run LTR
    frag.appendChild(span);
    pos = e;
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

// §3.4/§8.F — a SIGNED number ("-5", "+3", "−5") in RTL has its leading sign detached by the
// browser: "-5" renders "5-" (reads "5 minus", not "minus 5"). We wrap each signed-number run
// in <span data-rtl-num>, which CSS isolates as an LTR unit so the sign stays with its number.
// The engine's signedNumberRuns excludes the Hebrew prefix "ל-15" and the range "5-10" (the
// `-` there follows a letter/digit, not a word boundary). Code point untouched (copy/Ctrl-F).
// Skips rendered math/code islands; only RTL blocks are walked; stamped per block.
const NUMS_ATTR = 'data-rtl-nums';
function wrapSignedNumbersInBlock(block) {
  if (block.getAttribute(NUMS_ATTR) === '1') return;
  block.setAttribute(NUMS_ATTR, '1');
  if (!signedNumberRuns(block.textContent || '').length) return;
  if (resolvedDir(proseText(block)) !== 'rtl') return; // only where the block renders RTL
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || !signedNumberRuns(n.nodeValue).length) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (p && p.hasAttribute && p.hasAttribute('data-rtl-num')) return NodeFilter.FILTER_REJECT;
      // A signed operand of a comparison ("-5 < x") is already inside an LTR-isolated relation
      // run — its sign renders correctly there; don't wrap it again.
      if (p && p.closest && p.closest('[data-rtl-relation]')) return NodeFilter.FILTER_REJECT;
      if (inLtrIsland(n)) return NodeFilter.FILTER_REJECT; // rendered math/code already LTR
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  for (let i = 0; i < targets.length; i++) splitSignedNumbers(targets[i]);
}

function splitSignedNumbers(node) {
  const text = node.nodeValue;
  const runs = signedNumberRuns(text);
  if (!runs.length) return;
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (let r = 0; r < runs.length; r++) {
    const s = runs[r][0];
    const e = runs[r][1];
    if (s > pos) frag.appendChild(document.createTextNode(text.slice(pos, s)));
    const span = document.createElement('span');
    span.setAttribute('data-rtl-num', '');
    span.textContent = text.slice(s, e); // exact chars; CSS isolates LTR so the sign stays put
    frag.appendChild(span);
    pos = e;
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

// §6 — blocks whose DECORATION depends on direction (list marker/indent, blockquote bar)
// ALWAYS get an explicit dir, placed on the side the content ACTUALLY renders to. That side
// is `resolvedDir` (plaintext first-strong, or our override) — NOT `detectBlockDir`, which
// strips leading English words and so put the bar on the WRONG side of an English-first
// quote ("Quote starting in English … עברית", the reported bug). When the override fires on
// a leaf-content block (li/blockquote) we also inline-flip the content (applyRtlOverride);
// ul/ol containers only need the marker side (their items self-handle). Never overwrite an
// explicit dir.
function processDirBlock(el) {
  if (el.getAttribute('dir')) return;
  if (el.closest('pre, code')) return; // inside a source/code view → stays LTR
  const t = proseText(el);
  if (plaintextOverrideDir(t) === 'rtl' && el.matches && el.matches('li, blockquote')) {
    applyRtlOverride(el); // content + bar both RTL
    return;
  }
  el.setAttribute('dir', resolvedDir(t) || 'auto'); // marker/bar follows the actual render
}

// Prose text of a block for direction detection — EXCLUDES isolated math/code islands,
// mirroring what CSS `plaintext` actually sees (an isolated inline is a neutral object to
// the parent's bidi, so it never votes on base direction). KaTeX is the motivating case:
// its HIDDEN MathML <annotation> carries the LaTeX source (`\le`, `\subseteq`, `\in` …),
// which `textContent` would otherwise count as Latin and wrongly tip a Hebrew explanation's
// majority to LTR — so the override never fired on "KaTeX: …" lines. Falls back to plain
// textContent when there are no islands (or no DOM API, e.g. unit tests).
function proseText(el) {
  if (!el) return '';
  const ISLAND = SELECTORS.math + ', ' + SELECTORS.code;
  let raw;
  if (!el.querySelector || typeof document === 'undefined' || !document.createTreeWalker
      || !el.querySelector(ISLAND)) {
    raw = el.textContent || '';
  } else {
    raw = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || !p.closest) return NodeFilter.FILTER_ACCEPT;
        const island = p.closest(ISLAND);
        // A pre[data-rtl-text] is mis-fenced Hebrew PROSE (§8.D), not a real LTR island — its
        // text DOES count (else arrows/relations in such a block never flip).
        if (!island || island.closest('pre[data-rtl-text]')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) raw += n.nodeValue;
  }
  // Also drop RAW (not-yet-rendered) math runs — segmentMath keeps currency ($5), strips
  // real LaTeX ($x \le y$). Guards the window before KaTeX renders, when the LaTeX source
  // would still be live text and could pollute the majority just like the MathML annotation.
  return segmentMath(raw).filter((s) => s.type === 'text').map((s) => s.value).join('');
}

// Force a prose block to render RTL (§3.2/§8.K) — content AND any direction-dependent
// decoration. INLINE `!important` is required for two reasons: (1) the leaf CSS sets
// `unicode-bidi: plaintext`, which takes base direction from first-strong and IGNORES the
// `direction` property — so a bare `dir` does nothing; switching to `isolate` makes
// direction govern; and (2) Claude hard-sets `direction: ltr` at unknown specificity — only
// inline reliably wins. The `dir` attribute (a11y/caret + the blockquote-bar / list-marker
// CSS key off it) and data-rtl-dir (idempotency stamp) come along. Lior-approved narrow
// relaxation of "no dir/direction on prose".
function applyRtlOverride(el) {
  el.setAttribute('data-rtl-dir', 'rtl');
  el.setAttribute('dir', 'rtl');
  if (el.style && el.style.setProperty) {
    el.style.setProperty('direction', 'rtl', 'important');
    el.style.setProperty('unicode-bidi', 'isolate', 'important');
    el.style.setProperty('text-align', 'right', 'important');
  }
}

// §8.K for a TABLE CELL — same misfire (a Latin/marker opener of a majority-RTL cell renders
// LTR-base under `plaintext`), but a cell must NOT take the prose override's `text-align:right`:
// a cell's alignment edge belongs to its COLUMN (`data-rtl-col`), not its own first-strong. So
// force only the internal base direction (direction + isolate) and leave alignment alone.
function applyCellRtlOverride(cell) {
  cell.setAttribute('data-rtl-dir', 'rtl');
  cell.setAttribute('dir', 'rtl');
  if (cell.style && cell.style.setProperty) {
    cell.style.setProperty('direction', 'rtl', 'important');
    cell.style.setProperty('unicode-bidi', 'isolate', 'important'); // beat the leaf `plaintext`
  }
}

// §3.2/§8.K — headings/paragraphs are owned by CSS `plaintext` EXCEPT when plaintext's
// first-strong misfires on a Latin/marker opener of a majority-RTL block ("8c. בדיקה…",
// "React הוא ספרייה"). Then force RTL; otherwise leave it untouched (English is never
// flipped — plaintextOverrideDir returns null for a majority-English block). Idempotent.
function processProseDir(el) {
  if (el.getAttribute('data-rtl-dir')) return; // already overridden by us
  if (el.getAttribute('dir')) return; // respect an explicit dir we didn't set
  if (el.closest('pre, code')) return; // source/code view → stays LTR
  if (el.closest('table')) return; // table cells get §8.K via overrideCellDirs (no text-align)
  if (plaintextOverrideDir(proseText(el)) === 'rtl') applyRtlOverride(el);
}

function processRoot(root) {
  if (!root) return;
  const tables = findTables(root);
  for (let i = 0; i < tables.length && i < MAX_NODES_PER_PASS; i++) processTable(tables[i]);
  const dirBlocks = findDirBlocks(root);
  for (let i = 0; i < dirBlocks.length && i < MAX_NODES_PER_PASS; i++) processDirBlock(dirBlocks[i]);
  const proseBlocks = findProseDirBlocks(root);
  for (let i = 0; i < proseBlocks.length && i < MAX_NODES_PER_PASS; i++) processProseDir(proseBlocks[i]);
  const codeBlocks = findCodeBlocks(root);
  for (let i = 0; i < codeBlocks.length && i < MAX_NODES_PER_PASS; i++) processCodeBlock(codeBlocks[i]);
  // Relations isolate the whole comparison EXPRESSION and are direction-independent, so they
  // run over the ENTIRE root (not just prose leaves) — this is what reaches a standalone
  // equation living in a non-`<p>` container. Arrows (flip only in RTL) and signed numbers stay
  // per-leaf, gated on the leaf rendering RTL.
  wrapRelationsUnder(root);
  const leaves = findLeafBlocks(root);
  for (let i = 0; i < leaves.length && i < MAX_NODES_PER_PASS; i++) {
    wrapArrowsInBlock(leaves[i]);
    wrapSignedNumbersInBlock(leaves[i]);
  }
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
    ensureCSS(doc); // self-heal: re-inject the stylesheet if the app ever removed it
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
      for (let i = 0; i < m.addedNodes.length; i++) processAdded(m.addedNodes[i]);
      const target = m.target && m.target.nodeType === 1 ? m.target : doc.body;
      // Scope to the nearest chat message root when we can; else the mutating subtree (so
      // a RENDERED artifact panel still gets RTL). Source/code views are skipped per-pass.
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
  // In Electron the payload runs at document-start, when documentElement (and body) may
  // not exist yet — retry once the DOM tree is built. (The browser userscript never hit
  // this because the page was already parsed.)
  if (!doc.documentElement) {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
    return;
  }
  if (doc.documentElement.hasAttribute('data-claude-rtl')) return; // already fully initialized
  dlog('init() running; url =', doc.location && doc.location.href, '; GM_addStyle =', typeof GM_addStyle);

  // Artifacts/Cowork run in a sandbox iframe (a.claude.ai) with user-authored content that
  // has no .standard-markdown root — mark it so CSS applies leaf-block RTL broadly (§6, §12).
  let inFrame = false;
  try { inFrame = window.top !== window.self; } catch (e) { inFrame = true; } // cross-origin throw == framed
  if (inFrame || /(^|\.)a\.claude\.ai$/.test(doc.location ? doc.location.hostname : '')) {
    doc.documentElement.setAttribute('data-rtl-artifact', '1');
  }

  ensureCSS(doc);

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

  // Success marker, set LAST: if anything above threw, the next bundle's payload retries
  // a full init instead of skipping (the desktop bug where rtlFlag was set but CSS wasn't).
  doc.documentElement.setAttribute('data-claude-rtl', '1');
  dlog('init complete; data-claude-rtl set');
}

try {
  init();
} catch (e) {
  if (typeof console !== 'undefined') console.error('[claude-rtl] init failed:', e);
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { init, processTable, processRoot };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
