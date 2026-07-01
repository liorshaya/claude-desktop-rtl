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
const SEEN_ATTR = 'data-rtl-seen'; // per-block content fingerprint (see contentFp)

// §3.3 — "never let a settled block's direction change retroactively UNLESS its text content
// truly changed". Stamps therefore carry a cheap content FINGERPRINT (the decision-relevant
// text length — streaming only appends, so growth always changes it) instead of a boolean:
// a decision made on a half-streamed block (the sync processAdded path, or a >250ms mid-stream
// lull that fires the debounced pass) is re-evaluated when more content arrives, while a block
// whose content didn't change short-circuits exactly as before. Our own wraps preserve
// textContent byte-for-byte (§3.6), so they never invalidate a fingerprint themselves.
function contentFp(text) {
  return String(text.length);
}

// Undo a previously-applied RTL override (prose block or table cell) whose content grew away
// from the override (e.g. "React הוא" streamed on into a majority-English sentence — §8.K says
// English must never stay flipped). Reverses applyRtlOverride/applyCellRtlOverride exactly.
function clearRtlOverride(el) {
  el.removeAttribute('data-rtl-dir');
  el.removeAttribute('dir');
  if (el.style && el.style.removeProperty) {
    el.style.removeProperty('direction');
    el.style.removeProperty('unicode-bidi');
    el.style.removeProperty('text-align');
  }
}

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

// True if `el` is (or is inside) an editable INPUT host — the composer or the in-place
// message-edit box (SELECTORS.editableHost). Every content-mutation pass bails on these:
// ProseMirror manages its own DOM, so wrapping a signed number / arrow or stamping dir on
// a block there desyncs the editor and FREEZES typing (e.g. a Hebrew line with "-5"). We
// only ever set dir="auto" on inputs (setInputDir/sweepInputs). (§5/§6)
function inEditable(el) {
  return !!(el && el.closest && el.closest(SELECTORS.editableHost));
}

// True if `el` is inside a zone where we must NOT inject <span> wrappers (relations/arrows/
// signed-numbers): a <style>/<script> (injecting there corrupts the stylesheet) or a
// React-managed surface — the composer/edit box and the ask-widget — which desyncs if we
// add child nodes. Attribute-only passes don't use this (they have narrower guards). (§6)
function inNoInject(el) {
  return !!(el && el.closest && el.closest(SELECTORS.noInject));
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
  // The ask-widget too, SYNCHRONOUSLY — so a Hebrew question popup is RTL on first paint with
  // no LTR→RTL flip (it mounts complete, like a table).
  if (node.matches && node.matches(SELECTORS.askWidget)) processAskWidget(node);
  const askWidgets = node.querySelectorAll ? node.querySelectorAll(SELECTORS.askWidget) : [];
  for (let i = 0; i < askWidgets.length && i < MAX_NODES_PER_PASS; i++) processAskWidget(askWidgets[i]);
}

// Tables have TWO independent layers (§3.2). Layer 1: column-ORDER — flip the <table>'s
// column flow when the engine says the majority content is RTL (the only `dir` JS writes
// on rendered content). Layer 2: per-COLUMN alignment (alignColumns). Idempotent via
// DONE_ATTR.
function processTable(table) {
  if (inEditable(table)) return; // a table being edited in the composer/edit box → don't touch
  if (table.closest('pre, code')) return; // a table inside a source/code view stays LTR
  const shape = readTableShape(table);
  const fp = contentFp(shape.allCells.join(''));
  const seen = table.getAttribute(DONE_ATTR);
  if (seen === fp) return; // settled content → decision stands (§3.3)
  if (tableDir(shape.allCells, shape.headers) === 'rtl') table.setAttribute('dir', 'rtl');
  // Streamed rows can flip the majority back (Hebrew header, then English body): undo OUR
  // stale flip — only ours (seen), never an explicit dir that predates us.
  else if (seen && table.getAttribute('dir') === 'rtl') table.removeAttribute('dir');
  alignColumns(table);
  overrideCellDirs(table); // §8.K per cell: fix a Latin/marker-opener majority-RTL cell
  table.setAttribute(DONE_ATTR, fp);
}

// §8.K, per cell — a cell that OPENS with Latin/marker but is majority-RTL ("React הוא
// ספרייה", "WhatsApp הודעה חדשה") renders LTR-base under the leaf `plaintext`; force its
// internal direction RTL (alignment stays with the column, §3.2). Idempotent; never overwrites
// an explicit dir; skips cells holding a source/code view.
function overrideCellDirs(table) {
  const cells = qsa('th, td', table);
  for (let i = 0; i < cells.length && i < MAX_NODES_PER_PASS; i++) {
    const cell = cells[i];
    const seen = cell.getAttribute(SEEN_ATTR);
    if (!seen && cell.getAttribute('dir')) continue; // an explicit dir we didn't set
    if (cell.closest('pre, code')) continue;
    const t = proseText(cell);
    const fp = contentFp(t);
    if (seen === fp) continue; // settled content → decision stands (§3.3)
    cell.setAttribute(SEEN_ATTR, fp);
    if (plaintextOverrideDir(t) === 'rtl') applyCellRtlOverride(cell);
    else if (cell.getAttribute('data-rtl-dir')) clearRtlOverride(cell); // grew away from it
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
      // streamed rows can flip a column's majority — drop a stamp that no longer holds
      else if (cells[r][c].getAttribute('data-rtl-col')) cells[r][c].removeAttribute('data-rtl-col');
    }
  }
}

// §8.D — a fenced block that is really RTL prose (Claude mis-used ``` for a Hebrew
// "table"/text) gets tagged so the CSS renders it RTL per line. REAL code is left LTR
// untouched — the engine's codeBlockIsProse is conservative (any code structure → code).
function processCodeBlock(pre) {
  if (inEditable(pre)) return; // a fenced block being typed in the composer/edit box → leave it
  const t = pre.textContent || '';
  const fp = contentFp(t);
  if (pre.getAttribute(DONE_ATTR) === fp) return; // settled content → decision stands (§3.3)
  // Re-decide on content change: a fence that opened with Hebrew lines can turn out to be real
  // code once its structure streams in (and vice versa) — data-rtl-text is only ever ours.
  if (codeBlockIsProse(t)) pre.setAttribute('data-rtl-text', '');
  else pre.removeAttribute('data-rtl-text');
  pre.setAttribute(DONE_ATTR, fp);
}

// §6 — the interactive "ask user a question" widget. Give it a content-derived base direction
// from its QUESTION (the listbox aria-label, falling back to the widget's own text), exactly
// like a <table> takes dir from its cells (§3.2): a Hebrew question → dir="rtl" on the root,
// which flips the option rows (number badge → right, label → reading edge, nav → left) and
// right-aligns the text via the [data-ask-user-input-banner][dir="rtl"] CSS. An English
// question stays LTR (resolvedDir ≠ 'rtl') — no blanket container flip (§8.K). The free-text
// "Something else" <input> gets dir="auto" so it follows what's typed. ATTRIBUTES only: React
// owns this DOM, so we never inject spans (it's in `noInject`). NOT stamped DONE — the widget
// re-renders across questions ("1 of 3" → "2 of 3"), so we re-evaluate and can restore LTR.
function processAskWidget(widget) {
  if (widget.closest('pre, code')) return;
  const lb = widget.querySelector(SELECTORS.askQuestion);
  const label = lb && lb.getAttribute('aria-label');
  // A blank/whitespace aria-label is as good as empty — fall back to the visible body question.
  const question = (label && label.trim()) || proseText(widget);
  const rtl = resolvedDir(question) === 'rtl';
  if (rtl && widget.getAttribute('dir') !== 'rtl') widget.setAttribute('dir', 'rtl');
  if (!rtl && widget.getAttribute('dir') === 'rtl') widget.removeAttribute('dir');
  styleAskAffordances(widget, rtl);
  const input = widget.querySelector('input');
  if (input) {
    setInputDir(input); // the input itself follows what's typed (Hebrew → right, English → left)
    // Keep the free-text "Something else" ROW in its OWN content direction instead of letting the
    // widget's dir="rtl" flip it — Skip/pencil were swapping sides on every paginate (the reported
    // jump). dir="auto" → the English placeholder/Skip render LTR ("the regular") and stay put;
    // typed Hebrew still right-aligns inside the input. Re-applied/cleared each pass; never the root.
    const row = input.parentElement;
    if (row && row !== widget) {
      if (rtl && row.getAttribute('dir') !== 'auto') row.setAttribute('dir', 'auto');
      else if (!rtl && row.getAttribute('dir') === 'auto') row.removeAttribute('dir');
    }
  }
}

// §6/§8.F — the widget's directional AFFORDANCES, fixed ATTRIBUTE-ONLY (stamp existing nodes,
// never inject — React owns this DOM) and re-applied/cleared EVERY pass (the widget is never
// DONE-stamped) so the stamps survive React stripping and remount-on-pagination:
//   • Per-option "→" must mirror to "←" in RTL. We stamp the existing decorative (aria-hidden)
//     span that holds a single mirror-arrow glyph with data-rtl-arrow, reusing the scaleX(-1)
//     CSS. Glyph-detected via the engine (isMirrorArrow), so it's immune to class/markup churn.
//   • The pagination counter ("1 of 3") is a fixed LTR control that RTL scrambles to "of 3 1"
//     (and points the nav chevrons inward). We isolate its whole cluster LTR via data-rtl-ltr —
//     content-derived (an LTR run with a digit, outside the option list), so no Tailwind-class
//     dependency. A Hebrew counter ("1 מתוך 3") is already RTL-correct, so resolvedDir skips it.
// Loop-safe: the observer watches childList/characterData only (never attributes), so these
// stamps never feed it back.
function styleAskAffordances(widget, rtl) {
  // (1) Per-option "→": collect the decorative single-arrow spans that SHOULD mirror in RTL.
  const toMirror = [];
  if (rtl) {
    const options = qsa(SELECTORS.askOption, widget);
    for (let i = 0; i < options.length; i++) {
      const decos = qsa('[aria-hidden="true"]', options[i]);
      for (let j = 0; j < decos.length; j++) {
        if (isMirrorArrowGlyph(decos[j].textContent || '')) toMirror.push(decos[j]);
      }
    }
  }
  // Clear the stamp WIDGET-WIDE (not just current [role="option"] descendants) so an orphan can't
  // survive a remount that drops the option's role; then stamp the current set. (The global
  // [data-rtl-arrow] scaleX rule is unconditional, so a stale stamp would stay visually flipped.)
  syncStamp(qsa('[data-rtl-arrow]', widget), toMirror, 'data-rtl-arrow');

  // (2) Pagination counter ("1 of 3"): isolate its whole cluster LTR so RTL neither scrambles the
  // counter to "of 3 1" nor points the nav chevrons inward.
  const counter = rtl ? findAskCounter(widget) : null;
  let cluster = counter && counter.parentElement; // the prev/counter/next group
  if (cluster === widget) cluster = counter; // never the root (the descendant-combinator CSS skips it)
  syncStamp(qsa('[data-rtl-ltr]', widget), cluster ? [cluster] : [], 'data-rtl-ltr');
}

// Make exactly `keep` carry `attr` among `current` (the existing carriers) — idempotent, no churn.
function syncStamp(current, keep, attr) {
  for (let i = 0; i < current.length; i++) {
    if (keep.indexOf(current[i]) === -1) current[i].removeAttribute(attr);
  }
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i].hasAttribute(attr)) keep[i].setAttribute(attr, '');
  }
}

// A single decorative mirror-arrow GLYPH ("→", "⬅", and emoji-presentation "⬅️" = arrow+VS16).
// Tolerates a trailing variation selector so an emoji-form arrow still mirrors; rejects multi-char
// runs ("→ go") and non-arrows ("⌄"). Glyph-derived via the engine, so immune to class/markup churn.
function isMirrorArrowGlyph(t) {
  const cps = Array.from(t).filter((c) => c !== '\uFE0E' && c !== '\uFE0F'); // drop text/emoji VS
  return cps.length === 1 && isMirrorArrow(cps[0].codePointAt(0));
}

// The pagination counter: a LEAF span OUTSIDE the option list whose text is PAGINATION-SHAPED — two
// digit groups around an "of"/"/" separator ("1 of 3", "2/5"). Shape-matched (not merely "has a
// digit") so a Latin+digit badge in the header ("v2", "GPT-4", "Claude 3.5") is never mistaken for
// the counter and its cluster — possibly the whole header, incl. the Hebrew question — wrongly
// isolated LTR. A Hebrew counter ("1 מתוך 3") doesn't match (and is already RTL-correct).
const COUNTER_RE = /^[0-9٠-٩۰-۹]+\s*(?:of|\/)\s*[0-9٠-٩۰-۹]+$/i;
function findAskCounter(widget) {
  const spans = qsa('span', widget);
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.childElementCount) continue; // leaf text only
    if (s.closest(SELECTORS.askOption + ', ' + SELECTORS.askQuestion)) continue; // header/nav, not the list
    if (!COUNTER_RE.test((s.textContent || '').trim())) continue;
    // Skip a counter-SHAPED badge ("3 / 4") whose CLUSTER is majority-RTL (it shares the header
    // with the Hebrew question) — isolating that cluster would force the question LTR. Keep
    // scanning so the GENUINE "1 of 3" (cluster = the LTR nav) is still found. A localized-digit
    // counter ("١ of ٣") also resolves RTL here and is left alone (it doesn't scramble).
    const cluster = s.parentElement;
    if (cluster && cluster !== widget && resolvedDir(proseText(cluster)) === 'rtl') continue;
    return s;
  }
  return null;
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
  // An isolated math run (relations pass runs first) is already LTR — an arrow inside it points the
  // right way ("lim_{x→0}"), so do NOT flip it. Without this the arrow in the bound reverses.
  if (el.closest('[data-rtl-relation]')) return true;
  const island = el.closest(SELECTORS.math + ', ' + SELECTORS.code);
  if (!island) return false;
  if (island.closest('pre[data-rtl-text]')) return false; // mis-fenced prose → arrows flip
  return true;
}

function wrapArrowsInBlock(block) {
  if (inNoInject(block)) return; // never inject into composer/edit box, ask-widget, <style>
  const fp = contentFp(block.textContent || '');
  if (block.getAttribute(ARROWS_ATTR) === fp) return; // settled content → already handled (§3.3)
  block.setAttribute(ARROWS_ATTR, fp);
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
      if (p && p.closest && p.closest('pre, code, ' + SELECTORS.noInject)) {
        return NodeFilter.FILTER_REJECT; // source views, input box, ask-widget, <style>/<script>
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
  if (inNoInject(block)) return; // never inject into composer/edit box, ask-widget, <style>
  const fp = contentFp(block.textContent || '');
  if (block.getAttribute(NUMS_ATTR) === fp) return; // settled content → already handled (§3.3)
  block.setAttribute(NUMS_ATTR, fp);
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
  if (inEditable(el)) return; // a list/quote being TYPED in the composer → don't stamp dir
  if (el.closest('pre, code')) return; // inside a source/code view → stays LTR
  const seen = el.getAttribute(SEEN_ATTR);
  if (!seen && el.getAttribute('dir')) return; // an explicit dir we didn't set → respect it
  const t = proseText(el);
  const fp = contentFp(t);
  if (seen === fp) return; // settled content → decision stands (§3.3)
  el.setAttribute(SEEN_ATTR, fp);
  if (plaintextOverrideDir(t) === 'rtl' && el.matches && el.matches('li, blockquote')) {
    applyRtlOverride(el); // content + bar both RTL
    return;
  }
  if (el.getAttribute('data-rtl-dir')) clearRtlOverride(el); // content grew away from the override
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
  // <style>/<script> hold CSS/JS, not display text — exclude them like math/code islands so a
  // widget's <style> keyframes never vote on its base direction (the no-aria-label fallback).
  const ISLAND = SELECTORS.math + ', ' + SELECTORS.code + ', style, script';
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
  if (inEditable(el)) return; // a paragraph being TYPED in the composer → leave it alone
  if (el.closest('pre, code')) return; // source/code view → stays LTR
  if (el.closest('table')) return; // table cells get §8.K via overrideCellDirs (no text-align)
  const seen = el.getAttribute(SEEN_ATTR);
  if (!seen && el.getAttribute('dir')) return; // respect an explicit dir we didn't set
  const t = proseText(el);
  const fp = contentFp(t);
  if (seen === fp) return; // settled content → decision stands (§3.3)
  el.setAttribute(SEEN_ATTR, fp);
  if (plaintextOverrideDir(t) === 'rtl') applyRtlOverride(el);
  // An override applied to a half-streamed prefix ("React הוא …") must be UNDONE when the
  // block ends up majority-English — §8.K: English is never left flipped.
  else if (el.getAttribute('data-rtl-dir')) clearRtlOverride(el);
}

function processRoot(root) {
  if (!root) return;
  // The composer / in-place edit box is an INPUT surface (§5/§6): the only thing we touch
  // on it is dir="auto" (sweepInputs). When the observer scopes a pass INTO an editable —
  // the common case while typing, where `root` is the composer subtree — skip every content
  // pass. Mutating ProseMirror's managed DOM (a signed-number/arrow wrap, a list dir flip)
  // desyncs it and FREEZES typing. Editing a message in place scopes `root` to the message
  // root instead (not editable here), so the per-pass inEditable guards catch that case.
  if (inEditable(root)) { sweepInputs(root); return; }
  const tables = findTables(root);
  for (let i = 0; i < tables.length && i < MAX_NODES_PER_PASS; i++) processTable(tables[i]);
  const dirBlocks = findDirBlocks(root);
  for (let i = 0; i < dirBlocks.length && i < MAX_NODES_PER_PASS; i++) processDirBlock(dirBlocks[i]);
  const proseBlocks = findProseDirBlocks(root);
  for (let i = 0; i < proseBlocks.length && i < MAX_NODES_PER_PASS; i++) processProseDir(proseBlocks[i]);
  const codeBlocks = findCodeBlocks(root);
  for (let i = 0; i < codeBlocks.length && i < MAX_NODES_PER_PASS; i++) processCodeBlock(codeBlocks[i]);
  if (root.matches && root.matches(SELECTORS.askWidget)) processAskWidget(root);
  const askWidgets = findAskWidgets(root);
  for (let i = 0; i < askWidgets.length && i < MAX_NODES_PER_PASS; i++) processAskWidget(askWidgets[i]);
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
    const widgets = new Set(); // ask-widgets touched this batch — re-asserted SYNCHRONOUSLY below
    for (const m of mutations) {
      // Inputs are handled SYNCHRONOUSLY (no debounce) so a freshly-opened edit box is
      // dir="auto" before its first paint — the table/island pass stays deferred.
      for (let i = 0; i < m.addedNodes.length; i++) processAdded(m.addedNodes[i]);
      const target = m.target && m.target.nodeType === 1 ? m.target : doc.body;
      // An ask-widget paginating between questions MUTATES its existing subtree (not an added
      // node), so the debounced pass would re-apply dir + the arrow/counter stamps ~250ms late —
      // a visible LTR→RTL flash and an arrow that only flips after you navigate. Re-assert the
      // enclosing widget SYNCHRONOUSLY (in this pre-paint microtask) so it's stable every render.
      const el = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
      const w = el && el.closest && el.closest(SELECTORS.askWidget);
      if (w) widgets.add(w);
      // Scope to the nearest chat message root when we can; else the mutating subtree (so
      // a RENDERED artifact panel still gets RTL). Source/code views are skipped per-pass.
      const root = (target.closest && target.closest(SELECTORS.messageRoot)) || target;
      pending.add(root);
    }
    for (const w of widgets) processAskWidget(w);
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
