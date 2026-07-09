'use strict';
// engine/__tests__/br-segments.test.js — per-forced-break-segment override (§3.2/§8.K).
//
// The bug (live DOM, 2026-07-09): claude.ai renders "**heading**\nbody" as ONE <p> —
// <strong>מסלול 1: …</strong><br>Azure נותן ב-tier … — and CSS `plaintext` resolves the
// base direction PER BIDI PARAGRAPH (a <br> is a forced break, UAX#9 P1). So the
// Hebrew-first heading segment went RTL while the Latin-opener majority-Hebrew body
// segment went LTR. plaintextOverrideDir saw the WHOLE block's text, whose first strong
// char is the heading's Hebrew, returned null, and nobody fixed the body.
//
// The fix: plaintextOverrideDirSegments(segments) — the DOM layer splits a block's prose
// text at <br> boundaries and the engine decides per segment:
//   • MISFIRE   = first-strong LTR + majority RTL  (plaintext will get this segment wrong)
//   • LTR-REAL  = first-strong LTR + majority not-RTL (genuinely LTR content)
//   • RTL-FINE  = first-strong RTL                  (plaintext already right)
//   • NEUTRAL   = no strong at all
// Override the block to RTL iff ≥1 MISFIRE and 0 LTR-REAL — forcing the whole element is
// then §8.K-safe (every segment either wants RTL or doesn't care). One LTR-REAL segment
// vetoes: English must never be flipped, even next to a misfiring sibling segment.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plaintextOverrideDirSegments, plaintextOverrideDir } = require('../detect.js');

const HEADING = 'מסלול 1: מכסות חינם של הענן (האיכות הכי טובה)';
const BODY =
  "Azure נותן ב-tier החינמי (F0) חצי מיליון תווים בחודש של קולות נוירונים, לתמיד, בלי להזין " +
  'אמצעי תשלום - וזה כולל את הילה ואברי, הקולות העבריים הטובים ביותר שיש היום בענן.';

test('the reported case: Hebrew heading segment + Latin-opener majority-Hebrew body → rtl', () => {
  assert.equal(plaintextOverrideDirSegments([HEADING, BODY]), 'rtl');
});

test('single segment behaves exactly like plaintextOverrideDir (back-compat)', () => {
  for (const s of [
    BODY, // misfire → rtl
    HEADING, // Hebrew-first → null
    'The term שלום means peace in Hebrew and is a common greeting.', // majority-English → null
    '8c. בדיקת קלט בעברית', // marker opener, majority Hebrew → rtl
    '', // empty → null
    '3.2.1 :: ---', // neutral only → null
  ]) {
    assert.equal(plaintextOverrideDirSegments([s]), plaintextOverrideDir(s), JSON.stringify(s));
  }
});

test('all segments already RTL-fine → null (plaintext owns it, no churn)', () => {
  assert.equal(plaintextOverrideDirSegments([HEADING, 'עוד שורה בעברית', 'ושלישית']), null);
});

test('§8.K veto: a genuinely-English segment blocks the override even next to a misfire', () => {
  assert.equal(
    plaintextOverrideDirSegments([BODY, 'This entire segment is real English text and must stay LTR.']),
    null
  );
});

test('§8.K veto works in either order', () => {
  assert.equal(
    plaintextOverrideDirSegments(['This entire segment is real English text and must stay LTR.', BODY]),
    null
  );
});

test('misfire in the FIRST segment with a Hebrew heading after it → rtl', () => {
  assert.equal(plaintextOverrideDirSegments([BODY, HEADING]), 'rtl');
});

test('neutral segments (digits/punctuation/empty) neither trigger nor veto', () => {
  assert.equal(plaintextOverrideDirSegments(['', '3.2.1', HEADING, BODY, '---']), 'rtl');
  assert.equal(plaintextOverrideDirSegments(['', '3.2.1', '---']), null);
});

test('multiple misfiring segments → rtl', () => {
  assert.equal(
    plaintextOverrideDirSegments(['Azure שירות ענן מצוין לעברית', 'Google גם נותן קולות בעברית']),
    'rtl'
  );
});

test('an all-Latin technical segment (e.g. a bare URL line) counts as LTR-real and vetoes', () => {
  // firstStrong ltr + majority ltr → the segment renders LTR and truly is LTR; forcing the
  // block RTL would right-shove it. Leave the block to plaintext.
  assert.equal(plaintextOverrideDirSegments([BODY, 'https://learn.microsoft.com/azure/speech']), null);
});

test('no misfire anywhere → null even when a segment is English (nothing to fix)', () => {
  assert.equal(
    plaintextOverrideDirSegments([HEADING, 'Plain English body under a Hebrew heading.']),
    null
  );
});

test('empty input shapes → null', () => {
  assert.equal(plaintextOverrideDirSegments([]), null);
  assert.equal(plaintextOverrideDirSegments(['', '', '']), null);
});
