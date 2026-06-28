'use strict';
// engine/__tests__/lists.test.js — the per-item DIRECTION decision that places a list's marker
// (bullet •, number 1., checkbox) and its nested indent on the correct side. The DOM's
// processDirBlock sets each <li>'s dir to
//     plaintextOverrideDir(t) === 'rtl' ? 'rtl' : (resolvedDir(t) || 'auto')
// and a <ul>/<ol> container's dir to resolvedDir(all item text). This is the SAME logic for
// every list type — unordered, ordered, task, definition, and every nesting level — only the
// item TEXT differs. Modelled here over the pure engine, Hebrew-first and English-first, with
// many edge-case openers. (A DOM check confirms the rendered marker side.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvedDir, plaintextOverrideDir } = require('../index.js');

// a <li>'s effective dir (which side the marker hangs on)
const liDir = (t) => (plaintextOverrideDir(t) === 'rtl' ? 'rtl' : (resolvedDir(t) || 'auto'));
// a <ul>/<ol> container's dir, from all item text joined
const listDir = (items) => resolvedDir(items.join(' ')) || 'auto';

// ─────────────────────── plain items: language decides the marker side ───────────────────────
test('list items: pure Hebrew → marker on the right (rtl)', () => {
  assert.equal(liDir('פריט ראשון'), 'rtl');
  assert.equal(liDir('עוד פריט ברשימה'), 'rtl');
  assert.equal(liDir('קנה חלב ולחם'), 'rtl');
  assert.equal(liDir('עברית'), 'rtl');
  assert.equal(liDir('א'), 'rtl');
});
test('list items: pure English → marker on the left (ltr)', () => {
  assert.equal(liDir('First item'), 'ltr');
  assert.equal(liDir('buy milk and bread'), 'ltr');
  assert.equal(liDir('another list entry'), 'ltr');
  assert.equal(liDir('x'), 'ltr');
});
test('list items: Arabic (also RTL) → rtl', () => {
  assert.equal(liDir('عنصر القائمة'), 'rtl');
  assert.equal(liDir('البند الأول'), 'rtl');
});

// ─────────────────────── ordered-list content: number/letter markers in text ───────────────────────
test('list items: a number/paren/letter marker in the text follows the CONTENT language', () => {
  assert.equal(liDir('1. ראשון בעברית'), 'rtl');
  assert.equal(liDir('1. first in english'), 'ltr');
  assert.equal(liDir('(1) ראשון'), 'rtl');
  assert.equal(liDir('(1) first'), 'ltr');
  assert.equal(liDir('א. סעיף ראשון'), 'rtl');     // Hebrew-letter marker
  assert.equal(liDir('ב) פריט שני'), 'rtl');
  assert.equal(liDir('i. roman numeral item'), 'ltr');
  assert.equal(liDir('IV. the fourth'), 'ltr');
});
test('list items: content that STARTS with a number', () => {
  assert.equal(liDir('5 תפוחים אדומים'), 'rtl');
  assert.equal(liDir('5 red apples'), 'ltr');
  assert.equal(liDir('2024 הייתה שנה טובה'), 'rtl');
  assert.equal(liDir('3.14 is pi'), 'ltr');
});

// ─────────────────────── bullet / symbol / emoji openers ───────────────────────
test('list items: a bullet/dash/symbol opener does not change the content language', () => {
  assert.equal(liDir('* פריט בעברית'), 'rtl');
  assert.equal(liDir('• פריט עברי'), 'rtl');
  assert.equal(liDir('- item in english'), 'ltr');
  assert.equal(liDir('→ פעולה לביצוע'), 'rtl');
  assert.equal(liDir('✓ הושלם בהצלחה'), 'rtl');
  assert.equal(liDir('✓ done successfully'), 'ltr');
  assert.equal(liDir('📌 חשוב מאוד'), 'rtl');
  assert.equal(liDir('📌 important note'), 'ltr');
});

// ─────────────────────── task lists (checkbox) ───────────────────────
test('list items: task checkboxes follow the content language', () => {
  assert.equal(liDir('[ ] לסיים את המשימה'), 'rtl');
  assert.equal(liDir('[x] משימה שהושלמה'), 'rtl');
  assert.equal(liDir('[ ] finish the task'), 'ltr');
  assert.equal(liDir('[x] done task'), 'ltr');
});

// ─────────────────────── the §8.K override: Latin/marker opener, Hebrew majority → rtl ───────────────────────
test('list items: an English/marker OPENER on a majority-Hebrew item still renders rtl', () => {
  assert.equal(liDir('React הוא ספרייה פופולרית'), 'rtl');
  assert.equal(liDir('TODO: לסיים את הפרויקט'), 'rtl');
  assert.equal(liDir('C++ היא שפת תכנות ותיקה'), 'rtl');
  assert.equal(liDir('8c. בדיקת תקינות מלאה'), 'rtl');
  assert.equal(liDir('API מאפשר גישה לנתונים שלנו'), 'rtl');
  assert.equal(plaintextOverrideDir('React הוא ספרייה פופולרית'), 'rtl'); // the override fired
});
test('list items: a majority-ENGLISH item is never forced rtl (English stays ltr)', () => {
  assert.equal(liDir('- still mostly english here'), 'ltr');
  assert.equal(liDir('the API מהיר'), 'ltr');         // one Hebrew word, English majority
  assert.equal(plaintextOverrideDir('the API מהיר'), null);
});

// ─────────────────────── Hebrew-opener items with embedded English ───────────────────────
test('list items: Hebrew opener with embedded English → rtl', () => {
  assert.equal(liDir('המסקנה היא success גדול'), 'rtl');
  assert.equal(liDir('השתמש ב-API החדש שלנו'), 'rtl');
  assert.equal(liDir('פריט עם code() בתוכו'), 'rtl');
});

// ─────────────────────── symbol/number-only & empty → no strong direction ───────────────────────
test('list items: no strong char → auto (let the browser decide)', () => {
  assert.equal(liDir('100%'), 'auto');
  assert.equal(liDir('3.14'), 'auto');
  assert.equal(liDir('$5.99'), 'auto');
  assert.equal(liDir('— —'), 'auto');
  assert.equal(liDir(''), 'auto');
  assert.equal(liDir('   '), 'auto');
});

// ─────────────────────── the <ul>/<ol> CONTAINER direction (from all items) ───────────────────────
test('list container: direction from all items joined', () => {
  assert.equal(listDir(['פריט א', 'פריט ב', 'פריט ג']), 'rtl');
  assert.equal(listDir(['item a', 'item b', 'item c']), 'ltr');
  assert.equal(listDir(['קנה חלב', 'קנה לחם', 'קנה ביצים']), 'rtl');
  assert.equal(listDir(['buy milk', 'buy bread']), 'ltr');
  // a mostly-Hebrew list with one English item still flows rtl
  assert.equal(listDir(['פריט ראשון', 'פריט שני', 'one English item']), 'rtl');
  assert.equal(listDir([]), 'auto');
});

// ─────────────────────── nested lists: each level is the same decision ───────────────────────
test('nested list items: every level self-determines from its own text', () => {
  // outer Hebrew, inner English, deeper Hebrew — each <li> decides independently
  assert.equal(liDir('נושא ראשי'), 'rtl');
  assert.equal(liDir('sub-point in english'), 'ltr');
  assert.equal(liDir('תת-סעיף עברי'), 'rtl');
  assert.equal(liDir('deeper: עוד עברית כאן ברובו'), 'rtl'); // majority Hebrew → override rtl
});

// ─────────────────────── items whose content is MATH / arrows / units ───────────────────────
test('list items: math/arrow/unit content follows its language', () => {
  assert.equal(liDir('25°C < 30°C'), 'ltr');                 // pure math (Latin unit) → ltr
  assert.equal(liDir('הטמפרטורה 25°C < 30°C גבוהה'), 'rtl');  // Hebrew majority → rtl
  assert.equal(liDir('x → y'), 'ltr');                        // pure arrow expr → ltr
  assert.equal(liDir('קלט → פלט'), 'rtl');                    // Hebrew → rtl
  assert.equal(liDir('f(x) = g(x)'), 'ltr');
  assert.equal(liDir('בדוק ש-3 < 5 נכון'), 'rtl');
  assert.equal(liDir('עלות 100 ₪ בלבד'), 'rtl');             // currency in Hebrew → rtl
});
test('list items: a comparison/relation with NO strong letter → auto', () => {
  assert.equal(liDir('3 < 5 ≤ 7'), 'auto');                  // digits + relations only
  assert.equal(liDir('0 ≤ x'), 'ltr');                       // x is a strong-LTR letter
  assert.equal(liDir('100 ₪'), 'auto');                      // number + currency, no letter
});

// ─────────────────────── symbol / emoji / URL items ───────────────────────
test('list items: symbol/emoji-only → auto; URL items follow surrounding text', () => {
  assert.equal(liDir('🎉'), 'auto');
  assert.equal(liDir('→ → →'), 'auto');
  assert.equal(liDir('• • •'), 'auto');
  assert.equal(liDir('— — —'), 'auto');
  assert.equal(liDir('https://example.com'), 'ltr');         // a bare URL is LTR
  assert.equal(liDir('ראה https://example.com לפרטים'), 'rtl'); // Hebrew around a URL → rtl
});

// ─────────────────────── quoted / parenthesised items ───────────────────────
test('list items: quotes/parentheses around the content do not change its direction', () => {
  assert.equal(liDir('"ציטוט בעברית"'), 'rtl');
  assert.equal(liDir('"an English quote"'), 'ltr');
  assert.equal(liDir('(הערה חשובה)'), 'rtl');
  assert.equal(liDir('(a side note)'), 'ltr');
  assert.equal(liDir('«ציטוט»'), 'rtl');
});

// ─────────────────────── majority-boundary cases ───────────────────────
test('list items: first-strong + majority near the boundary', () => {
  assert.equal(liDir('one two three four עברית'), 'ltr');     // 4 EN vs 1 HE → ltr
  assert.equal(liDir('אחד שתיים שלוש four'), 'rtl');          // 3 HE vs 1 EN → rtl
  assert.equal(liDir('עברית API'), 'rtl');                    // Hebrew first + majority
  assert.equal(liDir('API מאפשר גישה נוחה לכל הנתונים'), 'rtl'); // English opener, HE majority → override
});
