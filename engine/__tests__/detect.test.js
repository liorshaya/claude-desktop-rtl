'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  firstStrong, majority, stripLeadingNoise, detectBlockDir, cellDir, tableDir, columnDirs,
  plaintextOverrideDir, resolvedDir,
} = require('../detect.js');

test('firstStrong: first strong char wins, neutrals skipped', () => {
  assert.equal(firstStrong('Hello'), 'ltr');
  assert.equal(firstStrong('שלום'), 'rtl');
  assert.equal(firstStrong('123 שלום'), 'rtl');
  assert.equal(firstStrong('→ עברית'), 'rtl');
  assert.equal(firstStrong('Next.js עברית'), 'ltr'); // why stripLeadingNoise is needed
  assert.equal(firstStrong('12345'), null);
  assert.equal(firstStrong(''), null);
});

test('majority: counts strong RTL vs LTR, null on tie/none', () => {
  assert.equal(majority('Hello עולם'), 'ltr');           // 5 vs 4
  assert.equal(majority('שלום עולם hi'), 'rtl');
  assert.equal(majority('aא'), null);                    // tie
  assert.equal(majority('12345'), null);
});

test('stripLeadingNoise removes a leading noise token', () => {
  assert.equal(detectBlockDir('1. סעיף ראשון'), 'rtl');
  assert.equal(detectBlockDir('- [ ] משימה'), 'rtl');
  assert.equal(detectBlockDir('`code` עברית'), 'rtl');
  assert.equal(detectBlockDir('https://x.com זה אתר בעברית'), 'rtl');
  assert.equal(detectBlockDir('foo.js עושה משהו'), 'rtl');
  assert.equal(detectBlockDir('Next.js הוא ספרייה בעברית'), 'rtl');
  // does not strip ordinary English words:
  assert.equal(detectBlockDir('The file foo.js does things'), 'ltr');
});

test('detectBlockDir: RTL cases', () => {
  for (const s of [
    'שלום עולם',
    'אני בונה עם Next.js ו-TypeScript.',
    '2,200 ₪ זה המחיר',
    '✅ משימה הושלמה',
    'مرحبا بالعالم',          // Arabic
    'سلام دنیا',              // Persian
    '۱۲۳ سلام',              // Persian Eastern digits then strong RTL
    'גרסה v4.6 יצאה',
  ]) {
    assert.equal(detectBlockDir(s), 'rtl', s);
  }
});

test('detectBlockDir: LTR cases', () => {
  for (const s of [
    'Hello world',
    'I am building with React.',
    'The version is v4.6 today',
  ]) {
    assert.equal(detectBlockDir(s), 'ltr', s);
  }
});

test('detectBlockDir: fallback is null, never rtl', () => {
  assert.equal(detectBlockDir('12345'), null);
  assert.equal(detectBlockDir(''), null);
  assert.equal(detectBlockDir('   '), null);
  assert.equal(detectBlockDir('$5.99'), null);
});

test('detectBlockDir: Adlam astral line is RTL', () => {
  const adlam = String.fromCodePoint(0x1E900, 0x1E921, 0x1E922, 0x1E923);
  assert.equal(detectBlockDir(adlam), 'rtl');
});

test('§8.K mixed document: only Hebrew blocks flip, English never forced RTL', () => {
  const blocks = [
    ['# Architecture overview', 'ltr'],
    ['This document explains the system in English.', 'ltr'],
    ['We use unicode-bidi: plaintext per leaf block.', 'ltr'],
    ['const x = 5; // code-ish line', 'ltr'],
    ['לדוגמה, זהו בלוק טקסט בעברית.', 'rtl'],
    ['הפסקה הזו צריכה להתהפך לימין בלבד.', 'rtl'],
    ['רשימה עם Next.js כדוגמה טכנית בתוך משפט עברי.', 'rtl'],
  ];
  for (const [text, expected] of blocks) {
    const got = detectBlockDir(text);
    if (expected === 'rtl') {
      assert.equal(got, 'rtl', `expected RTL: ${text}`);
    } else {
      assert.notEqual(got, 'rtl', `English block must NOT be forced RTL: ${text}`);
    }
  }
});

test('cellDir', () => {
  assert.equal(cellDir('דני'), 'rtl');
  assert.equal(cellDir('blob עברית'), 'rtl'); // any RTL char => rtl
  assert.equal(cellDir('ID'), 'ltr');
  assert.equal(cellDir('123'), null);          // neutral-only
  assert.equal(cellDir(''), null);
});

test('tableDir: majority of all cells decides column order; header breaks a tie (§3.2)', () => {
  // Majority-Hebrew table with an English key/header column → RTL (first column on right).
  // (Reverses the old header[0]-decides policy — this is the screenshot case.)
  assert.equal(tableDir(
    ['Stage', 'בעברית', 'מה קורה כאן', 'Harvesting', 'קטיף', 'איסוף הפירות'],
    ['Stage', 'בעברית', 'מה קורה כאן']), 'rtl');
  // Majority-English table with one Hebrew column → LTR.
  assert.equal(tableDir(
    ['Name', 'Age', 'City', 'Alice', '30', 'תל אביב', 'Bob', '25', 'חיפה'],
    ['Name', 'Age', 'City']), 'ltr');
  // Pure scripts.
  assert.equal(tableDir(['שם', 'דני', 'רותי'], ['שם']), 'rtl');
  assert.equal(tableDir(['Name', 'Alice', 'Bob'], ['Name']), 'ltr');
  // All-neutral (numbers only) → null (no dir written; table stays LTR).
  assert.equal(tableDir(['123', '456', '789'], ['123']), null);
  // Tie on body cells → header-row majority breaks it.
  assert.equal(tableDir(['שלום', 'hello'], ['שלום']), 'rtl');
  assert.equal(tableDir([], []), null);
});

test('columnDirs: per-column majority for alignment (§3.2)', () => {
  // Stage column → ltr; both Hebrew columns → rtl (incl. a mixed "natural או washed" cell).
  assert.deepEqual(columnDirs([
    ['Stage', 'בעברית', 'מה קורה כאן'],
    ['Harvesting', 'קטיף', 'איסוף הפירות'],
    ['Processing', 'עיבוד', 'natural או washed'],
  ]), ['ltr', 'rtl', 'rtl']);
  // Neutral (number) column → null; ragged rows are fine.
  assert.deepEqual(columnDirs([['#', 'שם'], ['1', 'דני'], ['2']]), [null, 'rtl']);
  assert.deepEqual(columnDirs([]), []);
});

test('plaintextOverrideDir: fixes a Latin/marker-led RTL block that plaintext mis-reads LTR', () => {
  // FIRES — block opens with Latin (plaintext picks LTR) but is majority-Hebrew → force rtl.
  for (const s of [
    '8c. בדיקת אי-שוויונים ויחסי סדר — Claude RTL × LaTeX', // the report (number+letter marker)
    'v2.0 שחרור חדש של המערכת שלנו',                        // version opener
    'Q3. סיכום הרבעון הפיננסי האחרון',                      // letter+digit marker
    'React הוא ספרייה פופולרית מאוד בקהילה',                // brand opener
    'iPhone הוא מכשיר פופולרי מאוד בעולם',
    'API הוא ממשק שמאפשר תקשורת בין מערכות',
  ]) {
    assert.equal(plaintextOverrideDir(s), 'rtl', s);
  }
});

test('plaintextOverrideDir: NEVER flips an English block (§8.K safety)', () => {
  // STAYS null — majority-English, even with embedded Hebrew words / a leading marker.
  for (const s of [
    'The term שלום means peace and שלום is common',
    'Hello world this is plain English text',
    'I am building a new app with React and Vite',
    'In Hebrew the word שלום is a common greeting',
    '8c. Introduction to inequalities and order',          // marker but English content
    'v2.0 release notes are published here today',
    'We use unicode-bidi: plaintext per leaf block here',
    'A great example is the שלום greeting used in apps',
  ]) {
    assert.equal(plaintextOverrideDir(s), null, s);
  }
});

test('plaintextOverrideDir: leaves plaintext alone when it is already right', () => {
  assert.equal(plaintextOverrideDir('3.2.1 הסעיף על יחסי סדר'), null); // digit-only marker → plaintext already rtl
  assert.equal(plaintextOverrideDir('8. בדיקה רגילה'), null);          // plaintext already rtl
  assert.equal(plaintextOverrideDir('שלום world'), null);              // firstStrong already rtl
  assert.equal(plaintextOverrideDir('Use קוד'), null);                 // majority tie → no flip
  assert.equal(plaintextOverrideDir(''), null);
  assert.equal(plaintextOverrideDir('12345'), null);
});

test('resolvedDir: the side a block actually renders to (for marker/bar placement)', () => {
  // English-first block → LTR (the blockquote-bar bug: detectBlockDir wrongly said rtl).
  assert.equal(resolvedDir('Quote starting in English ואז ממשיך בעברית.'), 'ltr');
  assert.equal(detectBlockDir('Quote starting in English ואז ממשיך בעברית.'), 'rtl'); // contrast
  // Hebrew-first → RTL; override cases → RTL; neutral → null.
  assert.equal(resolvedDir('ציטוט פשוט בעברית בלבד.'), 'rtl');
  assert.equal(resolvedDir('ציטוט עם מספר 42 וסימן % באמצע.'), 'rtl');
  assert.equal(resolvedDir('8c. בדיקת אי-שוויונים — Claude RTL'), 'rtl'); // marker-opener override
  assert.equal(resolvedDir('React הוא ספרייה פופולרית מאוד'), 'rtl');     // brand-opener override
  assert.equal(resolvedDir('The term שלום means peace'), 'ltr');          // English majority
  assert.equal(resolvedDir('   '), null);
});

test('fidelity: stripLeadingNoise injects no bidi controls (output is a tail of input)', () => {
  for (const s of ['1. סעיף', 'Next.js הוא ספרייה', '→ עברית', 'foo.js עברית']) {
    const out = stripLeadingNoise(s);
    assert.ok(s.endsWith(out), `${JSON.stringify(out)} must be a suffix of ${JSON.stringify(s)}`);
    assert.equal(/[‎‏‪-‮⁦-⁩]/.test(out), false);
  }
});
