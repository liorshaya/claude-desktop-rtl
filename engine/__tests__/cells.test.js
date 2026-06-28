'use strict';
// engine/__tests__/cells.test.js — what's INSIDE a table cell. A cell has TWO independent
// properties (§3.2):
//   • INTERNAL base direction (glyph order) = resolvedDir(content) — UBA first-strong, with the
//     §8.K override when a majority-RTL cell OPENS with Latin/marker ("React הוא ספרייה" → rtl).
//     The DOM applies this per cell (overrideCellDirs) without touching alignment.
//   • column ALIGNMENT = cellDir(content) (ANY RTL char → rtl) fed into columnDirs.
// The per-cell content passes (relations / arrows / signed numbers) run inside cells too. Many
// content edge cases, Hebrew / English / mixed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cellDir, resolvedDir, plaintextOverrideDir } = require('../index.js');
const { relationRuns, arrowFlipOffsets, signedNumberRuns } = require('../index.js');

const internal = (t) => resolvedDir(t);                 // the cell's internal base direction
const isolated = (t, fn) => fn(t).map(([s, e]) => t.slice(s, e));

// ─────────────────────────── internal direction: pure content ───────────────────────────
test('cell internal: pure Hebrew / English / Arabic / neutral', () => {
  assert.equal(internal('שלום עולם'), 'rtl');
  assert.equal(internal('Hello world'), 'ltr');
  assert.equal(internal('مرحبا بالعالم'), 'rtl');
  assert.equal(internal('12345'), null);
  assert.equal(internal('—'), null);
  assert.equal(internal('תל אביב'), 'rtl');
});

// ─────────────────────────── the §8.K cell fix ───────────────────────────
test('cell internal: §8.K — a Latin/marker opener of a majority-Hebrew cell renders rtl', () => {
  assert.equal(internal('React הוא ספרייה טובה מאוד'), 'rtl');
  assert.equal(internal('WhatsApp הודעה חדשה התקבלה'), 'rtl');
  assert.equal(internal('8c. בדיקת תקינות מלאה כאן'), 'rtl');
  assert.equal(internal('API מאפשר גישה נוחה לכל הנתונים'), 'rtl');
  assert.equal(plaintextOverrideDir('React הוא ספרייה טובה'), 'rtl');
  // a majority-ENGLISH cell with a Hebrew word is NEVER flipped (§8.K holds — English stays ltr)
  assert.equal(internal('the term שלום means peace in Hebrew'), 'ltr');
  assert.equal(plaintextOverrideDir('the term שלום means peace'), null);
});

// ─────────────────────────── column alignment (cellDir): ANY RTL → rtl ───────────────────────────
test('cell alignment (cellDir): any RTL char tilts the column rtl; numbers stay neutral', () => {
  assert.equal(cellDir('שלום'), 'rtl');
  assert.equal(cellDir('Hello עולם'), 'rtl');      // any Hebrew → rtl for ALIGNMENT
  assert.equal(cellDir('natural או washed'), 'rtl');
  assert.equal(cellDir('Hello'), 'ltr');
  assert.equal(cellDir('25°C'), 'ltr');
  assert.equal(cellDir('30'), null);
  assert.equal(cellDir('5₪'), null);
});

// ─────────────────────────── alignment vs internal: the two layers are independent ───────────────────────────
test('cell: column-alignment edge and internal glyph order can legitimately differ', () => {
  // "Hello עולם" is not majority-Hebrew, so it reads LTR-base — but ANY Hebrew aligns the column rtl
  assert.equal(cellDir('Hello עולם'), 'rtl');
  assert.equal(internal('Hello עולם'), 'ltr');
  // "React הוא ספרייה" — column rtl AND internal rtl (the §8.K override makes them agree)
  assert.equal(cellDir('React הוא ספרייה'), 'rtl');
  assert.equal(internal('React הוא ספרייה'), 'rtl');
  // pure English — both ltr
  assert.equal(cellDir('Hello world'), 'ltr');
  assert.equal(internal('Hello world'), 'ltr');
});

// ─────────────────────────── content by type — numbers / currency / units / dates ───────────────────────────
test('cell content: number / currency / percent cells are neutral; a Latin unit reads ltr', () => {
  for (const t of ['30', '1,000', '3.14', '-273.15', '$10', '5₪', '€5.99', '£100', '50%', '100 ₪']) {
    assert.equal(cellDir(t), null, t);
  }
  assert.equal(cellDir('25°C'), 'ltr');            // Latin unit letter
  assert.equal(cellDir('-5°C'), 'ltr');
  assert.equal(cellDir('98.6°F'), 'ltr');
  assert.equal(cellDir('2024-01-15'), null);       // ISO date
  assert.equal(cellDir('15/01/2024'), null);
  assert.equal(cellDir('12:30'), null);            // time
});
test('cell content: a leading number / list marker before Hebrew is still rtl', () => {
  assert.equal(internal('5 תפוחים אדומים'), 'rtl');
  assert.equal(internal('1. הסעיף הראשון'), 'rtl'); // digits skipped → Hebrew first-strong
  assert.equal(cellDir('5 תפוחים'), 'rtl');
  assert.equal(cellDir('1. ראשון'), 'rtl');
});

// ─────────────────────────── per-cell content passes apply INSIDE cells ───────────────────────────
test('cell content: relations, arrows, and signed numbers are detected in cell text', () => {
  assert.deepEqual(isolated('הערך 3 < 5 קטן', relationRuns), ['3 < 5']);
  assert.deepEqual(isolated('0 ≤ x ≤ 100', relationRuns), ['0 ≤ x ≤ 100']);
  assert.deepEqual(isolated('25°C < 30°C', relationRuns), ['25°C < 30°C']); // Celsius in a cell
  const heArrow = 'קלט → פלט';
  assert.deepEqual(arrowFlipOffsets(heArrow).map((i) => heArrow[i]), ['→']); // Hebrew-flanked → flips
  assert.deepEqual(arrowFlipOffsets('input → output'), []);                  // Latin-flanked → no flip
  assert.deepEqual(isolated('טמפ -5 מעלות', signedNumberRuns), ['-5']);
  assert.deepEqual(isolated('ירידה -5 עד +5', signedNumberRuns), ['-5', '+5']);
});

// ─────────────────────────── mixed-bidi cells ───────────────────────────
test('cell content: mixed Hebrew+English cells — direction by first-strong / majority', () => {
  assert.equal(internal('שלום world'), 'rtl');        // Hebrew opener
  assert.equal(internal('hello עולם'), 'ltr');        // English opener, balanced
  assert.equal(internal('אפליקציית WhatsApp חדשה'), 'rtl'); // Hebrew opener with a brand
  assert.equal(cellDir('שלום world'), 'rtl');
  assert.equal(cellDir('hello עולם'), 'rtl');         // any Hebrew → column rtl
});

// ─────────────────────────── degenerate cells ───────────────────────────
test('cell content: empty / whitespace / symbol-only have no direction', () => {
  assert.equal(cellDir(''), null);
  assert.equal(cellDir('   '), null);
  assert.equal(cellDir('✓'), null);
  assert.equal(cellDir('→'), null);
  assert.equal(internal(''), null);
  assert.equal(internal('   '), null);
  assert.equal(internal('123 456'), null);
});
