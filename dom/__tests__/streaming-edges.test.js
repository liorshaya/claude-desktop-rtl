'use strict';
// dom/__tests__/streaming-edges.test.js — edge cases around the fingerprint re-decision
// machinery beyond streaming-settle.test.js's core repros: the OTHER block types that
// re-decide (blockquote bar, table cells), direction flips in BOTH directions, the
// undo→plain-path handoff, fences whose code structure persists, and re-passes wrapping
// only newly-streamed content. All calls go through the real dom/+engine/ source in the
// shared mock harness; no timers, fully deterministic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, text } = require('./harness.js');

const I = loadInternals();
const host = (child) => el('div', { class: 'standard-markdown' }, [child]);

test('blockquote: Latin-opener override fires on settle and puts the bar side right', () => {
  const bq = el('blockquote', null, ['React']);
  host(bq);
  I.processDirBlock(bq); // mount with a partial prefix
  assert.equal(bq.getAttribute('dir'), 'ltr', 'provisional decision on the Latin prefix');
  bq.appendChild(text(' הוא ספרייה נהדרת לבניית ממשקים'));
  I.processDirBlock(bq); // settle
  assert.equal(bq.getAttribute('dir'), 'rtl', 'majority-RTL quote re-decided (bar moves right)');
  assert.equal(bq.getAttribute('data-rtl-dir'), 'rtl', 'via the override (inline styles applied)');
});

test('blockquote: override applied on a prefix is UNDONE and handed to the plain dir path', () => {
  const bq = el('blockquote', null, ['React הוא ספרייה']); // 5 Latin vs 9 Hebrew → override fires
  host(bq);
  I.processDirBlock(bq);
  assert.equal(bq.getAttribute('data-rtl-dir'), 'rtl', 'override on the majority-RTL prefix');
  bq.appendChild(text(' but the quote then continues with plainly English prose that outweighs it all'));
  I.processDirBlock(bq);
  assert.equal(bq.getAttribute('data-rtl-dir'), null, 'override cleared (§8.K)');
  assert.equal(bq.getAttribute('dir'), 'ltr', 'plain path re-stamps the real render side');
  assert.equal(bq.style.getPropertyValue('direction'), '', 'inline override styles removed');
});

test('table cell: §8.K cell override fires on settle and is undone when content grows away', () => {
  // "WhatsApp הודעה חדשה" = 8 Latin vs 9 Hebrew — the production comment's own example.
  const cell = el('td', null, ['WhatsApp הודעה חדשה']);
  const table = el('table', null, [el('tbody', null, [el('tr', null, [cell])])]);
  host(table);
  I.processTable(table);
  assert.equal(cell.getAttribute('dir'), 'rtl', 'Latin-opener majority-RTL cell overridden');
  assert.equal(cell.getAttribute('data-rtl-dir'), 'rtl');
  cell.appendChild(text(' and then a long English continuation that clearly outweighs the Hebrew'));
  I.processTable(table); // table fingerprint changed → cells re-decided
  assert.equal(cell.getAttribute('dir'), null, 'cell override undone');
  assert.equal(cell.style.getPropertyValue('direction'), '', 'inline cell styles removed');
});

test('column alignment flips rtl→ltr when streamed rows change the column majority', () => {
  const tbody = el('tbody', null, [el('tr', null, [el('td', null, ['שם'])])]);
  const table = el('table', null, [tbody]);
  host(table);
  I.processTable(table);
  const first = tbody.childNodes[0].childNodes[0];
  assert.equal(first.getAttribute('data-rtl-col'), 'rtl', 'Hebrew-only column hugs the right');
  tbody.appendChild(el('tr', null, [el('td', null, ['English one'])]));
  tbody.appendChild(el('tr', null, [el('td', null, ['English two'])]));
  I.processTable(table);
  assert.equal(first.getAttribute('data-rtl-col'), 'ltr', 'column re-stamped to its new majority');
});

test('code fence: real structure persists — later Hebrew comments cannot reclassify it to prose', () => {
  const pre = el('pre', null, ['function f() { return 1; }']);
  host(pre);
  I.processCodeBlock(pre);
  assert.equal(pre.getAttribute('data-rtl-text'), null, 'code stays code');
  pre.appendChild(text('\nהערה בעברית על הקוד הזה כאן'));
  I.processCodeBlock(pre); // fingerprint changed → re-decided, but structure still wins
  assert.equal(pre.getAttribute('data-rtl-text'), null, 'appended Hebrew cannot flip a real fence');
});

test('relations re-pass: only the newly-streamed comparison is wrapped; the old span is untouched', () => {
  const p = el('p', null, ['נתון ש-3 < 5 כאן']);
  const root = host(p);
  I.wrapRelationsUnder(root);
  const before = p.querySelectorAll('[data-rtl-relation]');
  assert.equal(before.length, 1);
  p.appendChild(text(' וגם 7 > 2 שם'));
  I.wrapRelationsUnder(root); // streaming appended a NEW text node
  const after = p.querySelectorAll('[data-rtl-relation]');
  assert.equal(after.length, 2, 'the new comparison got its own span');
  assert.equal(after[0], before[0], 'the settled span is the SAME node — never re-created');
  assert.deepEqual(after.map((s) => s.textContent), ['3 < 5', '7 > 2']);
});

test('signed numbers: undo-free growth — an RTL block gaining MORE signed numbers wraps them all', () => {
  const p = el('p', null, ['ירד ל--5 מעלות']);
  host(p);
  I.wrapSignedNumbersInBlock(p);
  const first = p.querySelectorAll('[data-rtl-num]').length;
  p.appendChild(text(' ובלילה −12 ואף +3 בצהריים'));
  I.wrapSignedNumbersInBlock(p);
  const spans = p.querySelectorAll('[data-rtl-num]');
  assert.equal(first, 1, 'one run before the stream continued');
  assert.deepEqual(spans.map((s) => s.textContent), ['-5', '−12', '+3'], 'later runs wrapped too');
  assert.equal(p.textContent, 'ירד ל--5 מעלות ובלילה −12 ואף +3 בצהריים', 'byte-for-byte fidelity');
});
