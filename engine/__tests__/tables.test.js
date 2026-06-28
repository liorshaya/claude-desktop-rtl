'use strict';
// engine/__tests__/tables.test.js — Claude's tables, the two independent layers (§3.2):
//   LAYER 1  column ORDER   tableDir(allCells, headers) → dir on the <table> (first column
//                           on the right vs left), from the MAJORITY content direction, with
//                           the header row as the tie-break.
//   LAYER 2  column ALIGN   columnDirs(rows) → each column hugs its own language's edge
//                           (Hebrew → right, English/number → left), independent of layer 1.
// cellDir is the shared primitive: ANY RTL char → 'rtl'; else strong-LTR → 'ltr'; else null
// (a number / currency / symbol cell has no direction of its own). Many realistic Hebrew/
// English/Arabic/number combinations, plus the awkward edges.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cellDir, tableDir, columnDirs } = require('../index.js');

// model the DOM: a <table>'s dir comes from ALL cells with the header row as tie-break;
// per-column alignment comes from columnDirs over the rows.
const tDir = (grid) => tableDir(grid.flat(), grid[0]) || 'auto';
const cDirs = (grid) => columnDirs(grid);

// ─────────────────────────────── cellDir primitive ───────────────────────────────
test('cellDir: any RTL char → rtl; strong-LTR → ltr; number/symbol/empty → null', () => {
  assert.equal(cellDir('שלום'), 'rtl');
  assert.equal(cellDir('תל אביב'), 'rtl');
  assert.equal(cellDir('א1'), 'rtl');             // Hebrew + digit → rtl
  assert.equal(cellDir('abc א'), 'rtl');          // ANY Hebrew → rtl, even mostly-Latin
  assert.equal(cellDir('مرحبا'), 'rtl');          // Arabic
  assert.equal(cellDir('Hello'), 'ltr');
  assert.equal(cellDir('John Smith'), 'ltr');
  assert.equal(cellDir('ID'), 'ltr');
  assert.equal(cellDir('25°C'), 'ltr');           // unit (Latin C) → ltr
  assert.equal(cellDir('v2.0'), 'ltr');
  assert.equal(cellDir('123'), null);             // a bare number has no direction
  assert.equal(cellDir('$5'), null);
  assert.equal(cellDir('100 ₪'), null);           // ₪ is a neutral currency symbol
  assert.equal(cellDir('25%'), null);
  assert.equal(cellDir('3 < 5'), null);           // digits + relation, no strong letter
  assert.equal(cellDir('—'), null);
  assert.equal(cellDir('✓'), null);
  assert.equal(cellDir(''), null);
  assert.equal(cellDir('   '), null);
});

// ─────────────────────────────── LAYER 1 — tableDir (column order) ───────────────────────────────
test('tableDir: a uniformly Hebrew or English table', () => {
  assert.equal(tDir([['שם', 'גיל'], ['דני', '30'], ['רותי', '25']]), 'rtl');
  assert.equal(tDir([['Name', 'Age'], ['Dan', '30'], ['Ruth', '25']]), 'ltr');
  assert.equal(tDir([['الاسم', 'العمر'], ['أحمد', '30']]), 'rtl'); // Arabic
});
test('tableDir: majority-Hebrew CONTENT with ENGLISH headers still flips to rtl (the screenshot case)', () => {
  // 2 English headers, 6 Hebrew data cells → majority rtl, so the column ORDER is rtl.
  assert.equal(tDir([['Name', 'City'], ['דני', 'תל אביב'], ['רותי', 'ירושלים'], ['משה', 'חיפה']]), 'rtl');
});
test('tableDir: majority-English with a few Hebrew cells stays ltr (English never force-flipped)', () => {
  assert.equal(tDir([['Term', 'Meaning'], ['shalom', 'שלום'], ['toda', 'thanks'], ['ken', 'yes']]), 'ltr');
});
test('tableDir: ties are broken by the header row', () => {
  // all cells 2 rtl / 2 ltr → tie; Hebrew headers tip it rtl
  assert.equal(tDir([['שם', 'עיר'], ['John', 'NYC']]), 'rtl');
  // all cells 2 rtl / 2 ltr → tie; English headers tip it ltr
  assert.equal(tDir([['Name', 'City'], ['דני', 'חיפה']]), 'ltr');
  // tie at cells AND tie at headers → null (leave LTR, write no dir)
  assert.equal(tableDir(['א', 'b', 'c', 'ד'], ['א', 'b']), null);
});
test('tableDir: number/currency/symbol-only or empty tables have no direction', () => {
  assert.equal(tableDir(['1', '2', '3', '4'], ['1', '2']), null);
  assert.equal(tableDir(['$5', '€10', '100%', '—'], ['$5', '€10']), null);
  assert.equal(tableDir([], []), null);
  assert.equal(tableDir(['', '  ', ''], ['']), null);
});
test('tableDir: mixed RTL scripts (Hebrew + Arabic) outvote embedded English', () => {
  assert.equal(tDir([['שם', 'الاسم'], ['דני', 'أحمد'], ['data', 'بيانات']]), 'rtl');
});

// ─────────────────────────────── LAYER 2 — columnDirs (per-column alignment) ───────────────────────────────
test('columnDirs: a bilingual Hebrew|English table aligns each column to its own language', () => {
  assert.deepEqual(cDirs([['מילה', 'Word'], ['שלום', 'Hello'], ['תודה', 'Thanks']]), ['rtl', 'ltr']);
  assert.deepEqual(cDirs([['English', 'עברית'], ['cat', 'חתול'], ['dog', 'כלב']]), ['ltr', 'rtl']);
});
test('columnDirs: a number column follows its header (Hebrew header → right; English/none → left/neutral)', () => {
  assert.deepEqual(cDirs([['שם', 'גיל'], ['דני', '30'], ['רותי', '25']]), ['rtl', 'rtl']); // גיל header → rtl
  assert.deepEqual(cDirs([['Name', 'Age'], ['Dan', '30'], ['Ruth', '25']]), ['ltr', 'ltr']); // Age header → ltr
  assert.deepEqual(cDirs([['דני', '30'], ['רותי', '25']]), ['rtl', null]); // no header → number column neutral
});
test('columnDirs: pure number / currency / symbol columns are neutral (default alignment)', () => {
  assert.deepEqual(cDirs([['100'], ['200'], ['300']]), [null]);
  assert.deepEqual(cDirs([['$5'], ['$10']]), [null]);
  assert.deepEqual(cDirs([['25%'], ['50%']]), [null]);
});
test('columnDirs: a column with a real mix of Hebrew and English (a tie) is neutral', () => {
  assert.deepEqual(cDirs([['item'], ['שלום'], ['world'], ['שלום']]), [null]); // 2 ltr / 2 rtl → null
  assert.deepEqual(cDirs([['שלום'], ['world'], ['שלום']]), ['rtl']);          // 2 rtl / 1 ltr → rtl
});
test('columnDirs: three+ columns, each independent', () => {
  // id (number) | name (Hebrew) | email (English)
  assert.deepEqual(cDirs([['#', 'שם', 'Email'], ['1', 'דני', 'dan@x.com'], ['2', 'רותי', 'ruth@x.com']]),
    [null, 'rtl', 'ltr']);
});
test('columnDirs: ragged rows (uneven cell counts) are handled per existing column', () => {
  assert.deepEqual(cDirs([['שם', 'עיר', 'הערה'], ['דני', 'חיפה'], ['רותי']]), ['rtl', 'rtl', 'rtl']);
  assert.deepEqual(cDirs([['a'], ['b', 'ג'], ['c', 'ד', 'ה']]), ['ltr', 'rtl', 'rtl']);
});
test('columnDirs: degenerate shapes — single row, single column, empty', () => {
  assert.deepEqual(cDirs([['שם', 'Name', '123']]), ['rtl', 'ltr', null]); // header-only row
  assert.deepEqual(cDirs([['שלום'], ['עולם']]), ['rtl']);
  assert.deepEqual(cDirs([]), []);
  assert.deepEqual(cDirs([[]]), []);
});

// ─────────────────────────────── realistic Claude tables (both layers together) ───────────────────────────────
test('tables: a Hebrew data table with English headers — rtl order, per-column alignment', () => {
  const t = [['Name', 'Age', 'City'], ['דני', '30', 'תל אביב'], ['רותי', '25', 'ירושלים']];
  assert.equal(tDir(t), 'rtl');                          // majority Hebrew → column order rtl
  assert.deepEqual(cDirs(t), ['rtl', 'ltr', 'rtl']);     // name/city right, age(English header) left
});
test('tables: an English comparison table with one Hebrew example column', () => {
  const t = [['Feature', 'English', 'Hebrew'], ['greeting', 'hello', 'שלום'], ['thanks', 'thank you', 'תודה']];
  assert.equal(tDir(t), 'ltr');                          // majority English → column order ltr
  assert.deepEqual(cDirs(t), ['ltr', 'ltr', 'rtl']);     // only the Hebrew column aligns right
});
test('tables: a price list (Hebrew product, number/currency column)', () => {
  const t = [['מוצר', 'מחיר', 'מלאי'], ['תפוח', '5₪', '120'], ['בננה', '3₪', '80']];
  assert.equal(tDir(t), 'rtl');
  assert.deepEqual(cDirs(t), ['rtl', 'rtl', 'rtl']);     // all columns hug right (Hebrew headers)
});
test('tables: a numeric matrix with Latin headers — every column takes the header’s ltr', () => {
  const t = [['x', 'y', 'z'], ['1', '2', '3'], ['4', '5', '6']];
  assert.equal(tDir(t), 'ltr');                          // x/y/z headers are Latin → ltr
  assert.deepEqual(cDirs(t), ['ltr', 'ltr', 'ltr']);     // each column’s Latin header → left
});
test('tables: a headerless numeric grid has no direction at all', () => {
  const t = [['1', '2', '3'], ['4', '5', '6']];
  assert.equal(tDir(t), 'auto');                         // all cells neutral → no dir
  assert.deepEqual(cDirs(t), [null, null, null]);        // every column neutral → default align
});
