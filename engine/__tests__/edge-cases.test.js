'use strict';
// engine/__tests__/edge-cases.test.js — the corners we had not locked: code-vs-prose fence
// detection (§8.D), leading-noise stripping, number-led tokens, exact range-boundary code points
// (the place the BOM bug hid), and degenerate inputs across every public function. Hebrew/English.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');
const { codeBlockIsProse, looksLikeCode } = require('../code.js');
const { isStrongRTL, isStrongLTR, isRTLDigit } = require('../ranges.js');

// ─────────────────────────── §8.D — a ``` fence: RTL prose vs real code ───────────────────────────
test('code: a Hebrew/Arabic fence with NO code structure is prose (render RTL)', () => {
  assert.equal(codeBlockIsProse('שלום עולם זה טקסט עברי'), true);
  assert.equal(codeBlockIsProse('זהו טקסט\nעם כמה שורות\nללא קוד'), true);
  assert.equal(codeBlockIsProse('תה        15\nקפה       20'), true); // space-aligned "table" is prose
  assert.equal(codeBlockIsProse('הטמפרטורה 25 מעלות והלחות 60'), true);
  assert.equal(codeBlockIsProse('نص عربي بدون أي رمز برمجي'), true);
});
test('code: real code stays code (LTR) — any STRONG structure disqualifies prose', () => {
  assert.equal(codeBlockIsProse('function foo() { return 1; }'), false); // no RTL anyway
  assert.equal(codeBlockIsProse('def hello():\n    print(1)'), false);
  // Hebrew that carries a code STRUCTURE → conservatively code (so real code is never flipped)
  assert.equal(codeBlockIsProse('הקוד function עושה משהו'), false);     // keyword
  assert.equal(codeBlockIsProse('הערך => התוצאה'), false);             // operator
  assert.equal(codeBlockIsProse('הנה {דוגמה} כאן'), false);            // braces
  assert.equal(codeBlockIsProse('קרא ל-foo() עכשיו'), false);          // call
  assert.equal(codeBlockIsProse('השתמש ב-<div> כאן'), false);          // tag
  assert.equal(codeBlockIsProse('מחיר: 100; כמות: 5'), false);         // semicolon
  assert.equal(codeBlockIsProse('ראה https://x.com כאן'), false);      // URL "//" is an operator
});
test('code: English prose in a fence has no RTL → stays LTR (codeBlockIsProse=false)', () => {
  assert.equal(codeBlockIsProse('just plain english prose here'), false);
  assert.equal(codeBlockIsProse(''), false);
  assert.equal(codeBlockIsProse('   '), false);
});
test('code: KNOWN conservative false-positive — Hebrew ABOUT code reads as code', () => {
  // "if" / "for" inside Hebrew prose trips the keyword guard; we accept LTR over flipping real code
  assert.equal(codeBlockIsProse('if בעברית פירושו אם'), false);
  assert.equal(codeBlockIsProse('המילה return מסיימת פונקציה'), false);
});
test('code: looksLikeCode = structure OR indentation', () => {
  assert.equal(looksLikeCode('function x()'), true);
  assert.equal(looksLikeCode('  indented line'), true);   // indentation alone
  assert.equal(looksLikeCode('a => b'), true);
  assert.equal(looksLikeCode('plain prose text'), false);
  assert.equal(looksLikeCode('טקסט עברי רגיל'), false);
  assert.equal(looksLikeCode(''), false);
});

// ─────────────────────────── stripLeadingNoise — peel structural openers ───────────────────────────
test('detect: stripLeadingNoise peels markers / URLs / paths / tokens / emoji / a Latin word', () => {
  assert.equal(E.stripLeadingNoise('1. ראשון'), 'ראשון');
  assert.equal(E.stripLeadingNoise('- פריט'), 'פריט');
  assert.equal(E.stripLeadingNoise('* פריט'), 'פריט');
  assert.equal(E.stripLeadingNoise('### כותרת'), 'כותרת');
  assert.equal(E.stripLeadingNoise('[x] משימה'), 'משימה');
  assert.equal(E.stripLeadingNoise('> ציטוט'), 'ציטוט');
  assert.equal(E.stripLeadingNoise('https://x.com ואז עברית'), 'ואז עברית');
  assert.equal(E.stripLeadingNoise('/usr/bin עברית'), 'עברית');
  assert.equal(E.stripLeadingNoise('Next.js הוא טוב'), 'הוא טוב');
  assert.equal(E.stripLeadingNoise('v4.6 גרסה'), 'גרסה');
  assert.equal(E.stripLeadingNoise('😀 שלום'), 'שלום');
  assert.equal(E.stripLeadingNoise('`code` עברית'), 'עברית');
  assert.equal(E.stripLeadingNoise('React הוא ספרייה'), 'הוא ספרייה'); // brand opener (§8.K)
});
test('detect: stripLeadingNoise leaves ordinary prose untouched; the result is a SUFFIX', () => {
  assert.equal(E.stripLeadingNoise('שלום עולם'), 'שלום עולם'); // a Hebrew opener is never peeled
  // pure English peels ALL its Latin words down to '' — then detectBlockDir's majority(raw) → ltr,
  // so English is never forced rtl (§8.K). Hebrew after a Latin opener survives → first-strong rtl.
  assert.equal(E.stripLeadingNoise('hello world'), '');
  assert.equal(E.stripLeadingNoise('the term שלום'), 'שלום'); // English opener peeled, Hebrew remains
  assert.equal(E.stripLeadingNoise(''), '');
  // never injects: output is always a tail of the input
  for (const t of ['1. אבג', 'React הוא', '😀 x', '> כן']) assert.ok(t.endsWith(E.stripLeadingNoise(t)));
});

// ─────────────────────────── leadingNumber — number-led tokens ───────────────────────────
test('numbers: leadingNumber across currency / sign / percent / degree / separators / scripts', () => {
  assert.equal(E.leadingNumber('2,200 ₪'), '2,200');
  assert.equal(E.leadingNumber('$5.99 here'), '$5.99');
  assert.equal(E.leadingNumber('-5 apples'), '-5');
  assert.equal(E.leadingNumber('50% done'), '50%');
  assert.equal(E.leadingNumber('5₪ only'), '5₪');
  assert.equal(E.leadingNumber('100° angle'), '100°');
  assert.equal(E.leadingNumber('2024-01-15 date'), '2024-01-15'); // one dashed token
  assert.equal(E.leadingNumber('03-1234567 phone'), '03-1234567');
  assert.equal(E.leadingNumber('٥٠٠ تفاحة'), '٥٠٠');               // Arabic-Indic
  assert.equal(E.leadingNumber('v4.6 version'), '');               // not number-led
  assert.equal(E.leadingNumber('hello'), '');
});

// ─────────────────────────── exact range-boundary code points (off-by-one / overshoot) ───────────────────────────
test('ranges: RTL block boundaries are exact — and U+FEFF (BOM) is NEUTRAL, not RTL', () => {
  assert.equal(isStrongRTL(0x058F), false); // Armenian dram sign — just before Hebrew
  assert.equal(isStrongRTL(0x05D0), true);  // א (Hebrew alef)
  assert.equal(isStrongRTL(0x0627), true);  // ا (Arabic alef)
  assert.equal(isStrongRTL(0x05FF), true);  // last Hebrew code point (contiguous with Arabic)
  assert.equal(isStrongRTL(0x0600), true);  // first Arabic
  assert.equal(isStrongRTL(0xFEFC), true);  // last real Arabic-Presentation-Forms-B letter
  assert.equal(isStrongRTL(0xFEFF), false); // BOM / ZWNBSP — neutral (the fixed off-by-one)
  assert.equal(isStrongRTL(0xFE00), false); // variation selector — not RTL
  assert.equal(isStrongRTL(0x1E900), true); // Adlam (astral) start
  assert.equal(isStrongRTL(0x1EEFF), true); // Arabic math (astral) end
  assert.equal(isStrongLTR(0x05D0), false); // Hebrew is not LTR
  assert.equal(isStrongLTR(0x0041), true);  // A
});
test('ranges: RTL-digit boundaries are exact (Arabic-Indic & Persian)', () => {
  assert.equal(isRTLDigit(0x065F), false); // just before Arabic-Indic 0
  assert.equal(isRTLDigit(0x0660), true);  // Arabic-Indic 0
  assert.equal(isRTLDigit(0x0669), true);  // Arabic-Indic 9
  assert.equal(isRTLDigit(0x066A), false); // Arabic percent sign — not a digit
  assert.equal(isRTLDigit(0x06EF), false); // just before Persian 0
  assert.equal(isRTLDigit(0x06F0), true);  // Persian 0
  assert.equal(isRTLDigit(0x06F9), true);  // Persian 9
  assert.equal(isRTLDigit(0x06FA), false); // just after Persian 9
  assert.equal(isRTLDigit(0x0035), false); // EN '5' is not an RTL digit
});

// ─────────────────────────── degenerate inputs — never crash, correct empty/null ───────────────────────────
test('all functions: empty / whitespace / single-char inputs are safe', () => {
  for (const t of ['', '   ', '\t\n', 'a', 'א', '5', '😀', '→', '<']) {
    // direction
    assert.ok([null, 'rtl', 'ltr'].includes(E.firstStrong(t)));
    assert.ok([null, 'rtl', 'ltr'].includes(E.resolvedDir(t)));
    assert.ok([null, 'rtl', 'ltr'].includes(E.cellDir(t)));
    // run finders return arrays
    assert.ok(Array.isArray(E.relationRuns(t)));
    assert.ok(Array.isArray(E.arrowFlipOffsets(t)));
    assert.ok(Array.isArray(E.signedNumberRuns(t)));
    // segmentMath round-trips
    assert.equal(E.segmentMath(t).map((s) => s.value).join(''), t);
  }
  assert.equal(E.firstStrong(''), null);
  assert.deepEqual(E.relationRuns(''), []);
  assert.deepEqual(E.columnDirs([]), []);
  assert.equal(E.tableDir([], []), null);
  assert.equal(E.detectBlockDir(''), null);
});
