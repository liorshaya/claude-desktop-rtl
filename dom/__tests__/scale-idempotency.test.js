'use strict';
// dom/__tests__/scale-idempotency.test.js — the two properties that only show up at scale:
// (a) a message far beyond the per-pass work cap still reaches FULL coverage across
// re-queued passes, within a bounded pass count and a sane time budget; (b) the whole
// pipeline is idempotent — a second full pass, or a SECOND copy of the payload (each
// renderer bundle carries one), changes nothing. Deterministic: no timers, generous
// wall-clock bounds only where a regression would mean a hang, not for tuning.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, text } = require('./harness.js');

const I = loadInternals();
const host = (child) => el('div', { class: 'standard-markdown' }, [child]);
const tr = (cells) => el('tr', null, cells.map((t) => el('td', null, [t])));

// Structure+attributes+text snapshot — the full mutation surface of the passes.
function snapshot(node) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  const attrs = Object.keys(node.attrs || {}).sort().map((k) => `${k}=${node.attrs[k]}`).join(' ');
  return `<${node.tagName} ${attrs}>[${(node.childNodes || []).map(snapshot).join(',')}]`;
}

test('scale: a mixed >400-block message reaches FULL coverage across re-queued passes', () => {
  const root = el('div', { class: 'standard-markdown' });
  const tables = [];
  const paras = [];
  const items = [];
  for (let i = 0; i < 140; i++) {
    const t = el('table', null, [el('tbody', null, [tr(['שם ' + i, 'ערך ' + i])])]);
    tables.push(t);
    root.appendChild(t);
    const p = el('p', null, ['פסקה בעברית מספר ' + i]);
    paras.push(p);
    root.appendChild(p);
  }
  const ul = el('ul');
  for (let i = 0; i < 140; i++) {
    const li = el('li', null, ['פריט עברי ' + i]);
    items.push(li);
    ul.appendChild(li);
  }
  root.appendChild(ul);

  const t0 = Date.now();
  let passes = 0;
  while (I.processRoot(root) === true) {
    passes += 1;
    assert.ok(passes < 12, 'converges (each truncated pass does MAX_NODES_PER_PASS real work)');
  }
  const elapsed = Date.now() - t0;

  assert.ok(passes >= 1, 'the work cap really fired (control that this exercised re-queueing)');
  assert.equal(tables.filter((t) => t.getAttribute('dir') !== 'rtl').length, 0, 'every table flipped');
  assert.equal(items.filter((li) => li.getAttribute('dir') !== 'rtl').length, 0, 'every item stamped');
  assert.equal(paras.filter((p) => p.getAttribute('data-rtl-seen') === null).length, 0,
    'every paragraph fingerprinted (tail not silently dropped)');
  assert.ok(elapsed < 5000, `full coverage in a sane budget (took ${elapsed}ms)`);
});

test('scale: a 10k-char arithmetic chain in one text node wraps as ONE span within budget', () => {
  const chain = 'π' + '+1'.repeat(5000);
  const p = el('p', null, [chain]);
  const root = host(p);
  const t0 = Date.now();
  I.wrapRelationsUnder(root);
  const elapsed = Date.now() - t0;
  const spans = p.querySelectorAll('[data-rtl-relation]');
  assert.equal(spans.length, 1, 'the whole chain is one isolated run');
  assert.equal(spans[0].textContent, chain, 'byte-for-byte');
  assert.ok(elapsed < 2000, `linear-time wrap (took ${elapsed}ms; the quadratic engine took ~5s)`);
});

// A representative message exercising every pass: table, list with a Latin-opener item,
// blockquote, prose override, arrows, signed numbers, comparisons, and a mis-fenced block.
function richMessage() {
  const root = el('div', { class: 'standard-markdown' });
  root.appendChild(el('table', null, [el('tbody', null, [tr(['שם', 'ערך']), tr(['גיל', 'שלושים'])])]));
  const ul = el('ul');
  ul.appendChild(el('li', null, ['React הוא ספרייה מאוד פופולרית']));
  ul.appendChild(el('li', null, ['פריט עברי רגיל']));
  root.appendChild(ul);
  root.appendChild(el('blockquote', null, ['ציטוט בעברית עם חץ → ימינה']));
  root.appendChild(el('p', null, ['8c. בדיקת אי-שוויונים: נתון ש-0 < x ≤ 4 וגם -5 מעלות']));
  root.appendChild(el('pre', null, ['תה ירוק   10\nתה שחור   12']));
  return root;
}

test('idempotency: a second full pass over settled content changes NOTHING', () => {
  const root = richMessage();
  I.processAdded(root);   // the sync mount path
  I.processRoot(root);    // first settle
  const settled = snapshot(root);
  I.processRoot(root);    // a later flush over the same root (streaming lull, sibling mutation…)
  I.processAdded(root);   // and even a spurious re-add
  assert.equal(snapshot(root), settled, 'structure, attributes, and text all byte-identical');
});

test('idempotency: a SECOND payload copy (fresh scope, same DOM) is a complete no-op', () => {
  // Every renderer bundle carries the payload; bundle #2 evaluates into a fresh scope and
  // walks the same document. The stamps must make it inert.
  const root = richMessage();
  I.processAdded(root);
  I.processRoot(root);
  const settled = snapshot(root);
  const I2 = loadInternals(); // "second bundle": independent closures, same tree
  I2.processRoot(root);
  assert.equal(snapshot(root), settled, 'second payload instance changes nothing');
});
