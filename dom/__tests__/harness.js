'use strict';
// dom/__tests__/harness.js — shared test harness for the DOM layer (NOT a *.test.js, so the
// runner doesn't execute it as a suite). The DOM layer has no jsdom (§13b validates it
// visually); this loads the REAL engine/+dom/ source via the build's own stripModule into a
// tiny, faithful DOM mock — enough to exercise closest/querySelectorAll/TreeWalker/
// replaceChild, the exact ops the passes use. CONTROL cases in the suites prove the mutation
// path actually fires on normal content, so a green guard case is the guard, not a dead mock.

const fs = require('fs');
const path = require('path');
const { SOURCES, stripModule } = require('../../build/build-payload.js');

const ROOT = path.join(__dirname, '..', '..');

const NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };

// A deliberately small CSS selector matcher: tag + .class + [attr] / [attr="v"] / [attr=""],
// comma lists. Covers every selector surfaces.js uses. No combinators/pseudos (the source
// never relies on them for the leaf passes; readTableShape's `tr:first-child th` simply yields
// no header match, which tableDir tolerates).
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
  const tokenRe = /(\.[A-Za-z0-9_/-]+)|(\[[^\]]+\])/g;
  let m;
  while ((m = tokenRe.exec(rest))) {
    if (m[1]) {
      const cls = m[1].slice(1).replace(/\\/g, ''); // unescape e.g. group\/row
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
  removeAttribute(n) { delete this.attrs[n]; }
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

// Load the real engine+dom source into one scope (as the build does), minus the auto-init,
// and return the internal functions the suites assert on.
function loadInternals() {
  const parts = SOURCES.map((rel) => {
    let src = stripModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (rel === 'dom/apply.js') src = src.replace(/\ntry \{\s*\n\s*init\(\);[\s\S]*$/m, '\n');
    return src;
  });
  const body =
    "'use strict';\n" +
    parts.join('\n\n') +
    '\n;return { processRoot, processAdded, processAskWidget, wrapSignedNumbersInBlock,' +
    ' wrapArrowsInBlock, wrapRelationsUnder, processProseDir, processDirBlock, processTable,' +
    ' processCodeBlock, setInputDir, inEditable, inNoInject, SELECTORS };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'window', 'NodeFilter', 'GM_addStyle', body);
  return factory(documentMock, {}, NodeFilter, undefined);
}

// Build an element tree by hand (children: strings → text nodes, nodes → appended).
function el(tag, attrs, children) {
  const e = new MElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (children) for (const c of children) e.appendChild(typeof c === 'string' ? new MText(c) : c);
  return e;
}
const text = (v) => new MText(v);
const elementChildren = (node) => node.childNodes.filter((n) => n.nodeType === 1);

module.exports = {
  NodeFilter, MElement, MText, MFragment, documentMock, loadInternals, el, text, elementChildren,
};
