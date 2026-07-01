'use strict';
// dom/__tests__/table-edges.test.js — table decisions at the edges: nested tables, cells
// carrying a user-authored dir, degenerate shapes (empty / header-only / ragged), and the
// engine-marked-dirs-only undo contract. Complements table-shape.test.js (header voting)
// and streaming-settle.test.js (fingerprint re-decision). Deterministic, mock harness.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el } = require('./harness.js');

const I = loadInternals();
const host = (child) => el('div', { class: 'standard-markdown' }, [child]);
const tr = (cells, tag) => el('tr', null, cells.map((t) => el(tag || 'td', null, [t])));

test('nested tables: a Hebrew inner table flips itself AND its outer host, inner columns win', () => {
  // The outer table's only real content is the Hebrew inner table, so BOTH flip — and the
  // inner table is processed after the outer (document order), so its per-column stamps are
  // its own, not polluted by the outer grid.
  const innerBody = el('tbody', null, [tr(['שם', 'ערך'])]);
  const inner = el('table', null, [innerBody]);
  const outer = el('table', null, [el('tbody', null, [el('tr', null, [el('td', null, [inner]), el('td', null, ['שלום'])])])]);
  const root = host(outer);
  I.processRoot(root);
  assert.equal(outer.getAttribute('dir'), 'rtl', 'outer follows its (all-Hebrew) content');
  assert.equal(inner.getAttribute('dir'), 'rtl', 'inner self-determines');
  const innerCells = innerBody.childNodes[0].childNodes;
  assert.deepEqual(innerCells.map((c) => c.getAttribute('data-rtl-col')), ['rtl', 'rtl'],
    'inner columns stamped from the inner grid');
});

test('a user-authored dir on a CELL is never overridden — even when its content is majority-RTL', () => {
  const authored = el('td', { dir: 'ltr' }, ['WhatsApp הודעה חדשה']); // would otherwise trip §8.K
  const table = el('table', null, [el('tbody', null, [el('tr', null, [authored])])]);
  host(table);
  I.processTable(table);
  assert.equal(authored.getAttribute('dir'), 'ltr', 'authored cell dir respected');
  assert.equal(authored.getAttribute('data-rtl-dir'), null, 'no override stamp');
  assert.equal(authored.getAttribute('data-rtl-seen'), null, 'not even fingerprinted — never ours');
});

test('empty table: no crash, no flip, and the fingerprint short-circuits the second pass', () => {
  const empty = el('table');
  host(empty);
  I.processTable(empty);
  const fp = empty.getAttribute('data-rtl-done');
  assert.equal(empty.getAttribute('dir'), null, 'nothing to decide from');
  assert.notEqual(fp, null, 'stamped');
  assert.equal(I.processTable(empty), false, 'second pass is a fingerprint no-op');
  assert.equal(empty.getAttribute('data-rtl-done'), fp, 'stamp unchanged');
});

test('header-only table (thead, no body) decides from its header cells', () => {
  const headOnly = el('table', null, [el('thead', null, [tr(['שם'], 'th')])]);
  host(headOnly);
  I.processTable(headOnly);
  assert.equal(headOnly.getAttribute('dir'), 'rtl');
});

test('ragged rows: a short row never breaks per-column alignment for the longer rows', () => {
  const tbody = el('tbody', null, [
    tr(['שם', 'עיר', 'גיל']),
    tr(['דוד']),                       // ragged — only one cell
    tr(['רות', 'חיפה', 'שלושים']),
  ]);
  const table = el('table', null, [tbody]);
  host(table);
  I.processTable(table);
  const lastRow = tbody.childNodes[2].childNodes;
  assert.deepEqual(lastRow.map((c) => c.getAttribute('data-rtl-col')), ['rtl', 'rtl', 'rtl'],
    'columns 2 and 3 still stamped despite the ragged middle row');
  assert.equal(table.getAttribute('dir'), 'rtl');
});

test('undo touches ONLY engine-marked dirs: our marker travels with our flip, never with theirs', () => {
  // Ours: flip → marker; flip away → both removed.
  const oursBody = el('tbody', null, [tr(['שם', 'ערך'])]);
  const ours = el('table', null, [oursBody]);
  host(ours);
  I.processTable(ours);
  assert.equal(ours.getAttribute('data-rtl-tdir'), '1', 'our flip carries the marker');
  oursBody.appendChild(tr(['English one', 'English two']));
  oursBody.appendChild(tr(['English three', 'English four']));
  I.processTable(ours);
  assert.equal(ours.getAttribute('dir'), null, 'our stale flip undone');
  assert.equal(ours.getAttribute('data-rtl-tdir'), null, 'marker removed with it');
  // Theirs: an authored rtl on an English table — stamped by us, but never marked, never undone.
  const theirsBody = el('tbody', null, [tr(['English only'])]);
  const theirs = el('table', { dir: 'rtl' }, [theirsBody]);
  host(theirs);
  I.processTable(theirs);
  theirsBody.appendChild(tr(['More English'])); // content change forces a re-decision
  I.processTable(theirs);
  assert.equal(theirs.getAttribute('dir'), 'rtl', 'authored dir survives every re-decision');
  assert.equal(theirs.getAttribute('data-rtl-tdir'), null, 'and never acquires our marker');
});
