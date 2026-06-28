'use strict';
// dom/__tests__/composer-guard.test.js — regression for the composer/edit-box TYPING FREEZE.
//
// The bug: typing a Hebrew line containing a signed number ("-5") in the chat composer (a
// ProseMirror contenteditable) froze typing. The debounced observer ran the content passes
// on the composer subtree; wrapSignedNumbersInBlock REPLACED the text node with a
// <span data-rtl-num> inside ProseMirror's managed DOM, desyncing the editor. Same for the
// in-place message-EDIT box. The fix: every content-mutation pass bails inside an editable
// host (SELECTORS.editableHost) — we only ever set dir="auto" on inputs.
//
// The DOM layer has no jsdom (§13b validates it visually); this loads the REAL dom/+engine/
// source via the build's own stripModule into a tiny, faithful DOM mock — enough to exercise
// closest/querySelectorAll/TreeWalker/replaceChild, the exact ops the passes use. The CONTROL
// cases prove the mutation path actually fires on normal content, so a green editable case is
// the guard working — not a dead mock.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SOURCES, stripModule } = require('../../build/build-payload.js');

const ROOT = path.join(__dirname, '..', '..');

// ---- minimal DOM mock (only what the passes touch) -------------------------------------
const NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };

function matchesSimple(el, sel) {
  if (!sel) return false;
  let rest = sel;
  if (sel[0] !== '.' && sel[0] !== '[') {
    const tag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
    if (tag) {
      if (el.tagName !== tag[0].toUpperCase()) return false;
      rest = sel.slice(tag[0].length);
    }
  }
  const tokenRe = /(\.[A-Za-z0-9_-]+)|(\[[^\]]+\])/g;
  let m;
  while ((m = tokenRe.exec(rest))) {
    if (m[1]) {
      const cls = m[1].slice(1);
      if (!(el.getAttribute('class') || '').split(/\s+/).includes(cls)) return false;
    } else {
      const inner = m[2].slice(1, -1);
      const eq = inner.indexOf('=');
      if (eq === -1) {
        if (el.getAttribute(inner) === null) return false;
      } else {
        const name = inner.slice(0, eq);
        const val = inner.slice(eq + 1).replace(/^["']|["']$/g, '');
        if (el.getAttribute(name) !== val) return false;
      }
    }
  }
  return true;
}
function matchesSelector(el, selectorList) {
  return selectorList.split(',').some((s) => matchesSimple(el, s.trim()));
}
function collect(root, sel, out, firstOnly) {
  for (const c of root.childNodes) {
    if (c.nodeType !== 1) continue;
    if (matchesSelector(c, sel)) { out.push(c); if (firstOnly) return; }
    collect(c, sel, out, firstOnly);
    if (firstOnly && out.length) return;
  }
}

class MText {
  constructor(v) { this.nodeType = 3; this.nodeValue = String(v); this.parentNode = null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get textContent() { return this.nodeValue; }
}
class MFragment {
  constructor() { this.__fragment = true; this.nodeType = 11; this.childNodes = []; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i !== -1) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
}
class MElement {
  constructor(tag) {
    this.nodeType = 1; this.tagName = tag.toUpperCase();
    this.attrs = Object.create(null); this.childNodes = []; this.parentNode = null;
    const map = Object.create(null);
    this.style = { setProperty(k, v) { map[k] = v; }, getPropertyValue(k) { return map[k] || ''; } };
  }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  appendChild(child) {
    if (child && child.__fragment) { for (const c of child.childNodes.slice()) this.appendChild(c); return child; }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.childNodes.push(child); return child;
  }
  removeChild(child) { const i = this.childNodes.indexOf(child); if (i !== -1) { this.childNodes.splice(i, 1); child.parentNode = null; } return child; }
  replaceChild(newNode, oldNode) {
    const i = this.childNodes.indexOf(oldNode); if (i === -1) return oldNode;
    const nodes = newNode && newNode.__fragment ? newNode.childNodes.slice() : [newNode];
    for (const n of nodes) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; }
    this.childNodes.splice(i, 1, ...nodes);
    oldNode.parentNode = null; return oldNode;
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (String(v) !== '') this.appendChild(new MText(v));
  }
  matches(sel) { return matchesSelector(this, sel); }
  closest(sel) { let el = this; while (el && el.nodeType === 1) { if (matchesSelector(el, sel)) return el; el = el.parentNode; } return null; }
  querySelectorAll(sel) { const out = []; collect(this, sel, out, false); return out; }
  querySelector(sel) { const out = []; collect(this, sel, out, true); return out[0] || null; }
}

function makeWalker(root, whatToShow, filter) {
  const showText = (whatToShow & NodeFilter.SHOW_TEXT) !== 0;
  const showEl = (whatToShow & NodeFilter.SHOW_ELEMENT) !== 0;
  const list = [];
  (function walk(node) {
    for (const c of node.childNodes || []) {
      const consider = (c.nodeType === 3 && showText) || (c.nodeType === 1 && showEl);
      let verdict = NodeFilter.FILTER_ACCEPT;
      if (consider && filter && typeof filter.acceptNode === 'function') verdict = filter.acceptNode(c);
      if (consider && verdict === NodeFilter.FILTER_ACCEPT) list.push(c);
      if (c.nodeType === 1 && !(consider && verdict === NodeFilter.FILTER_REJECT)) walk(c);
    }
  })(root);
  let i = -1;
  return { nextNode() { i += 1; return i < list.length ? list[i] : null; } };
}

const documentMock = {
  createElement: (t) => new MElement(t),
  createTextNode: (v) => new MText(v),
  createDocumentFragment: () => new MFragment(),
  createTreeWalker: (root, whatToShow, filter) => makeWalker(root, whatToShow, filter),
};

// ---- load the real source (engine + dom) into one scope, minus the auto-init -----------
function loadInternals() {
  const parts = SOURCES.map((rel) => {
    let src = stripModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (rel === 'dom/apply.js') src = src.replace(/\ntry \{\s*\n\s*init\(\);[\s\S]*$/m, '\n');
    return src;
  });
  const body =
    "'use strict';\n" +
    parts.join('\n\n') +
    '\n;return { processRoot, processAdded, wrapSignedNumbersInBlock, wrapArrowsInBlock,' +
    ' wrapRelationsUnder, processProseDir, processDirBlock, processTable, processCodeBlock,' +
    ' setInputDir, inEditable, SELECTORS };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'window', 'NodeFilter', 'GM_addStyle', body);
  return factory(documentMock, {}, NodeFilter, undefined);
}

const I = loadInternals();

// ---- helpers ---------------------------------------------------------------------------
function el(tag, attrs, children) {
  const e = new MElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (children) for (const c of children) e.appendChild(typeof c === 'string' ? new MText(c) : c);
  return e;
}
const elementChildren = (node) => node.childNodes.filter((n) => n.nodeType === 1);
const hasNum = (node) => node.querySelector('[data-rtl-num]') !== null;
const composerHost = (child) => el('div', { contenteditable: 'true', class: 'ProseMirror' }, [child]);
const editHost = (child) => el('div', { contenteditable: '' }, [child]); // in-place message edit
const renderedHost = (child) => el('div', { class: 'standard-markdown' }, [child]);
const htable = (rows) => {
  const tbody = el('tbody');
  for (const row of rows) tbody.appendChild(el('tr', null, row.map((t) => el('td', null, [t]))));
  return el('table', null, [tbody]);
};

// ---- the bug: editable hosts must never be mutated -------------------------------------
test('SELECTORS.editableHost matches the ProseMirror composer and the edit box', () => {
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror' });
  const edit = el('div', { contenteditable: '' });
  const ta = el('textarea');
  const prose = el('p');
  assert.ok(composer.matches(I.SELECTORS.editableHost), 'composer is an editable host');
  assert.ok(edit.matches(I.SELECTORS.editableHost), 'empty-value contenteditable is an editable host');
  assert.ok(ta.matches(I.SELECTORS.editableHost), 'textarea is an editable host');
  assert.equal(prose.matches(I.SELECTORS.editableHost), false, 'a plain <p> is not');
});

test('wrapSignedNumbersInBlock does NOT mutate a paragraph inside the composer ("-5" freeze)', () => {
  const p = el('p', null, ['המחיר -5 שקל']);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]); // p now lives in the composer
  I.wrapSignedNumbersInBlock(p);
  assert.equal(elementChildren(p).length, 0, 'no <span> injected into the editor DOM');
  assert.equal(p.childNodes.length, 1, 'the original text node is left whole');
  assert.equal(p.textContent, 'המחיר -5 שקל', 'text preserved byte-for-byte');
  assert.equal(p.getAttribute('data-rtl-nums'), null, 'the editor block is not even stamped');
});

test('CONTROL: the SAME pass DOES wrap "-5" in a rendered (non-editable) message block', () => {
  const p = el('p', null, ['המחיר -5 שקל']);
  el('div', { class: 'standard-markdown' }, [p]); // a normal rendered message root
  I.wrapSignedNumbersInBlock(p);
  assert.ok(hasNum(p), 'data-rtl-num span created on real content (mock exercises the path)');
  assert.equal(p.querySelector('[data-rtl-num]').textContent, '-5', 'the run is the signed number');
  assert.equal(p.textContent, 'המחיר -5 שקל', 'text still byte-for-byte after wrapping');
});

test('processRoot scoped INTO the composer skips every content pass (only dir="auto")', () => {
  const p = el('p', null, ['שורה עם -5 כאן']);
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]);
  I.processRoot(composer); // mirrors the observer root while typing
  assert.equal(elementChildren(p).length, 0, 'composer paragraph untouched');
  assert.equal(p.textContent, 'שורה עם -5 כאן', 'text intact');
});

test('processRoot over a message root spares an in-place EDIT box but processes real prose', () => {
  const realP = el('p', null, ['המחיר -5 שקל']); // rendered sibling message
  const editP = el('p', null, ['עריכה -5 כאן']);
  const editBox = el('div', { contenteditable: 'true', class: 'ProseMirror' }, [editP]);
  const root = el('div', { class: 'standard-markdown' }, [realP, editBox]);
  I.processRoot(root);
  assert.ok(hasNum(realP), 'real rendered prose still gets the signed-number wrap');
  assert.equal(elementChildren(editP).length, 0, 'the edit box is NOT mutated (no typing freeze)');
  assert.equal(editP.textContent, 'עריכה -5 כאן', 'edit-box text intact');
});

test('processProseDir / processDirBlock never stamp dir on an editable block', () => {
  const p = el('p', null, ['React הוא ספרייה']); // Latin-opener, majority-RTL → would normally flip
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]);
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), null, 'no dir written on a composer paragraph');
  assert.equal(p.getAttribute('data-rtl-dir'), null, 'no override stamp on a composer paragraph');

  const li = el('li', null, ['פריט עברית']);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [el('ul', null, [li])]);
  I.processDirBlock(li);
  assert.equal(li.getAttribute('dir'), null, 'no dir written on a composer list item');
});

// ========================================================================================
// DEEP edge cases — "is there ANOTHER sign/char that freezes the composer?". Every content
// pass mutates the DOM on some trigger; each below would have desynced ProseMirror. For each
// family: assert the composer/edit box is spared AND a CONTROL proving the trigger fires on
// rendered prose (so a green editable case is the guard, not a dead mock).
// ========================================================================================

// §3.4/§8.F — EVERY signed-number shape, not just "-5": plus sign, U+2212 minus, decimals,
// Arabic-Indic and Persian digits. All detach their sign in RTL, so all are wrap targets.
const SIGNED_CASES = [
  ['plus', 'טמפ +5 מעלות'],
  ['unicode-minus U+2212', 'טמפ −5 מעלות'],
  ['decimal', 'מחיר -3.14 שקל'],
  ['arabic-indic digits', 'מחיר -٥ ש'],
  ['persian digits', 'מחיר -۵ ت'],
];
for (const [label, txt] of SIGNED_CASES) {
  test(`signed-number (${label}) is spared in the composer but wrapped when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.wrapSignedNumbersInBlock(cp);
    assert.equal(elementChildren(cp).length, 0, `composer: "${txt}" not mutated`);
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.wrapSignedNumbersInBlock(rp);
    assert.ok(hasNum(rp), `rendered: "${txt}" got a data-rtl-num wrap (trigger fires)`);
    assert.equal(rp.textContent, txt, 'rendered text still byte-for-byte');
  });
}

// §8.F — arrows. Inside a Hebrew block each is wrapped for a visual flip; in the composer that
// mutation would freeze typing. Covers →, ←, ⇒, ↔, ➜.
const ARROW_CASES = ['שלב → הבא', 'חזרה ← אחורה', 'א ⇒ ב', 'א ↔ ב', 'צעד ➜ קדימה'];
for (const txt of ARROW_CASES) {
  test(`arrow line "${txt}" is spared in the composer but flipped when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.wrapArrowsInBlock(cp);
    assert.equal(cp.querySelector('[data-rtl-arrow]'), null, 'composer: arrow not wrapped');
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.wrapArrowsInBlock(rp);
    assert.ok(rp.querySelector('[data-rtl-arrow]'), 'rendered: arrow wrapped (trigger fires)');
    assert.equal(rp.textContent, txt, 'rendered text byte-for-byte');
  });
}

// §8.F — math RELATIONS / arithmetic. Direction-INDEPENDENT (walks the whole root), so even a
// neutral/English composer line "3 < 5" is a target. Covers <, ≤, ∈, ⊂, arithmetic, ×.
const RELATION_CASES = ['3 < 5', 'x ≤ 4', 'a ∈ B', '15 + 7 = 22', '2 × 3', 'ℕ ⊂ ℤ'];
for (const txt of RELATION_CASES) {
  test(`relation "${txt}" is spared in the composer but isolated when rendered`, () => {
    const cp = el('p', null, [txt]);
    const composer = composerHost(cp);
    I.wrapRelationsUnder(composer);
    assert.equal(cp.querySelector('[data-rtl-relation]'), null, 'composer: relation not wrapped');
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    const root = renderedHost(rp);
    I.wrapRelationsUnder(root);
    assert.ok(rp.querySelector('[data-rtl-relation]'), 'rendered: relation isolated (trigger fires)');
    assert.equal(rp.textContent, txt, 'rendered text byte-for-byte');
  });
}

// §3.2/§8.K — Latin-opener majority-RTL line ("React הוא ספרייה", "8c. בדיקה") gets a forced
// dir + inline style; doing that to a ProseMirror paragraph fights the editor. Spare it.
const OVERRIDE_CASES = ['React הוא ספרייה', '8c. בדיקה ראשונה'];
for (const txt of OVERRIDE_CASES) {
  test(`prose-dir override for "${txt}" is suppressed in the composer, applied when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.processProseDir(cp);
    assert.equal(cp.getAttribute('dir'), null, 'composer: no dir stamped');
    assert.equal(cp.getAttribute('data-rtl-dir'), null, 'composer: no override stamp');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.processProseDir(rp);
    assert.equal(rp.getAttribute('data-rtl-dir'), 'rtl', 'rendered: override applied (trigger fires)');
  });
}

// §8.K safety net — an English sentence that merely CONTAINS Hebrew is majority-LTR, so it must
// NOT be flipped, in the composer OR when rendered.
test('majority-English line with embedded Hebrew is never flipped (composer or rendered)', () => {
  const txt = 'The term שלום means peace';
  const cp = el('p', null, [txt]);
  composerHost(cp);
  I.processProseDir(cp);
  assert.equal(cp.getAttribute('data-rtl-dir'), null, 'composer: untouched');

  const rp = el('p', null, [txt]);
  renderedHost(rp);
  I.processProseDir(rp);
  assert.equal(rp.getAttribute('data-rtl-dir'), null, 'rendered: English not flipped (§8.K)');
});

// New guards (this fix): TABLE column-order and mis-fenced CODE block. Reachable when EDITING a
// message in place (root = message root containing the contenteditable) — must not mutate it.
test('a table inside an edit box is not processed; a rendered table is', () => {
  const rows = [['שם', 'גיל'], ['דני', '30'], ['רינה', '25']];
  const ct = htable(rows);
  editHost(ct);
  I.processTable(ct);
  assert.equal(ct.getAttribute('data-rtl-done'), null, 'edit-box table: guard returns before processing');
  assert.equal(ct.getAttribute('dir'), null, 'edit-box table: no dir flip');

  const rt = htable(rows);
  renderedHost(rt);
  I.processTable(rt);
  assert.equal(rt.getAttribute('data-rtl-done'), '1', 'rendered table: processed (trigger fires)');
});

test('a fenced block inside an edit box is not tagged; a rendered Hebrew-prose fence is', () => {
  const cpre = el('pre', null, ['שלום עולם זה טקסט בעברית']);
  editHost(cpre);
  I.processCodeBlock(cpre);
  assert.equal(cpre.getAttribute('data-rtl-done'), null, 'edit-box fence: guard returns first');
  assert.equal(cpre.hasAttribute('data-rtl-text'), false, 'edit-box fence: not tagged RTL');

  const rpre = el('pre', null, ['שלום עולם זה טקסט בעברית']);
  renderedHost(rpre);
  I.processCodeBlock(rpre);
  assert.equal(rpre.getAttribute('data-rtl-text'), '', 'rendered fence: tagged RTL prose (trigger fires)');
});

// The SYNCHRONOUS add path (processAdded) runs on freshly-inserted nodes before paint — it must
// also spare the composer (ProseMirror inserts paragraphs/lists/tables as the user types).
test('processAdded does not mutate a list / Latin-opener / table inserted into the composer', () => {
  const li = el('li', null, ['פריט עברית']);
  const p = el('p', null, ['React הוא ספרייה']);
  const tbl = htable([['שם'], ['דני']]);
  const composer = composerHost(el('div', null, [el('ul', null, [li]), p, tbl]));
  I.processAdded(composer);
  assert.equal(li.getAttribute('dir'), null, 'composer list item: no dir');
  assert.equal(p.getAttribute('data-rtl-dir'), null, 'composer paragraph: no override');
  assert.equal(tbl.getAttribute('data-rtl-done'), null, 'composer table: not processed');
});

// End-to-end: a kitchen-sink RTL line (signed number + relation + arrow) typed in the composer
// stays completely inert; the same line rendered gets all three transforms.
test('kitchen-sink RTL line: inert in composer, fully transformed when rendered', () => {
  const txt = 'טמפ -5 ואז 3 < 5 ואז → הבא';

  const cp = el('p', null, [txt]);
  const composer = composerHost(cp);
  I.processRoot(composer);
  assert.equal(elementChildren(cp).length, 0, 'composer: nothing wrapped');
  assert.equal(cp.textContent, txt, 'composer: text byte-for-byte');

  const rp = el('p', null, [txt]);
  const root = renderedHost(rp);
  I.processRoot(root);
  assert.ok(rp.querySelector('[data-rtl-num]'), 'rendered: signed number wrapped');
  assert.ok(rp.querySelector('[data-rtl-relation]'), 'rendered: relation isolated');
  assert.ok(rp.querySelector('[data-rtl-arrow]'), 'rendered: arrow flipped');
  assert.equal(rp.textContent, txt, 'rendered: text still byte-for-byte (no control chars)');
});
