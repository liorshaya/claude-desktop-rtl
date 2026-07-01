'use strict';
// dom/__tests__/table-shape.test.js — regression for the header tie-break (§3.2 layer 1).
//
// The bug: readTableShape collected headers with 'thead th, thead td, tr:first-child th,
// tr:first-child td'. But tr:first-child matches the first tr of EACH row group, so on a
// normal markdown table (thead + tbody) the "header row" also contained the first BODY row —
// and tableDir's tie-break (a tied/all-neutral table is decided by the header row alone) was
// voting on body cells too. Headers are now the thead row, falling back to the literal first
// row only when there is no thead.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el } = require('./harness.js');

const I = loadInternals();

const host = (child) => el('div', { class: 'standard-markdown' }, [child]);
const tr = (cells, tag) => el('tr', null, cells.map((t) => el(tag || 'td', null, [t])));

test('tie-break uses the HEADER row only — first body row must not dilute it', () => {
  // 2 Hebrew cells vs 2 English cells → allCells majority ties → header decides.
  // Hebrew header → RTL. The old selector also counted the (English) first body row,
  // re-tying the vote so the table wrongly stayed LTR.
  const table = el('table', null, [
    el('thead', null, [tr(['שם', 'עיר'], 'th')]),
    el('tbody', null, [tr(['Name', 'City'])]),
  ]);
  host(table);
  I.processTable(table);
  assert.equal(table.getAttribute('dir'), 'rtl', 'Hebrew header breaks the tie to RTL');
});

test('no thead: the literal first row is the header fallback', () => {
  // 2 Hebrew vs 2 English cells → tie → the first row (Hebrew) decides.
  const table = el('table', null, [
    el('tbody', null, [tr(['שם', 'ערך']), tr(['Name', 'City'])]),
  ]);
  host(table);
  I.processTable(table);
  assert.equal(table.getAttribute('dir'), 'rtl', 'first-row fallback still works without a thead');
});
