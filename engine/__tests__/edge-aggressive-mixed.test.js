'use strict';
// engine/__tests__/edge-aggressive-mixed.test.js — an ADVERSARIAL sweep over Hebrew×English
// mixing: question-marked sentences (the '?' is bidi-NEUTRAL and must never leak into a math
// run or decide a direction), math embedded in Hebrew questions, exotic whitespace INSIDE
// comparison chains (NBSP/thin-space — rendered markdown emits these), acronym quotes (צה"ל),
// maqaf (אי־שוויון), the Arabic question mark ؟ (bidi class AL — a STRONG RTL signal, unlike
// '?'), email/brand/`C++` openers, and cross-function consistency properties (every string
// whose relationRuns is non-empty must pass the hasMathRun gate; runs are sorted, disjoint,
// in-bounds). Findings locked here:
//   • FIXED — NBSP/narrow-NBSP/thin-space between operands broke chain growth: only the bare
//     operator isolated (glyph fixed, operands still reordered). relations isWS now spans them.
//   • KNOWN — currency-$ then a later math-$ pair swallows the text between them (m4 below).
//   • KNOWN — a trailing "=?" (no right operand) stays OUTSIDE the isolated run ("2+2=?").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

const runs = (t) => E.relationRuns(t).map(([s, e]) => t.slice(s, e));
const flip = (t) => E.arrowFlipOffsets(t).map((i) => t[i]);
const signed = (t) => E.signedNumberRuns(t).map(([s, e]) => t.slice(s, e));
const seg = (t) => E.segmentMath(t).map((s) => `${s.type[0]}:${s.value}`);

// ─────────────────────── direction: Hebrew/English question sentences ───────────────────────
test('questions/HE: a question mark is neutral — Hebrew questions read RTL', () => {
  assert.equal(E.detectBlockDir('האם זה עובד?'), 'rtl');
  assert.equal(E.detectBlockDir('מה זה CPU?'), 'rtl');            // Latin acronym mid-question
  assert.equal(E.detectBlockDir('OK אז מה עכשיו?'), 'rtl');       // Latin opener peeled
  assert.equal(E.detectBlockDir('מה ההבדל בין let ל-const?'), 'rtl'); // code-ish words inside
  assert.equal(E.detectBlockDir('באמת?!'), 'rtl');                // interrobang
  assert.equal(E.detectBlockDir('? שלום'), 'rtl');                // leading '?' skipped
  assert.equal(E.detectBlockDir('שלום? Hello'), 'rtl');           // first-strong wins
  assert.equal(E.resolvedDir('?מה'), 'rtl');
});
test('questions/EN: English questions with embedded Hebrew stay LTR (§8.K)', () => {
  assert.equal(E.resolvedDir('Did you say שלום?'), 'ltr');
  assert.equal(E.plaintextOverrideDir('hello שלום?'), null);      // majority-LTR → no flip
  // detectBlockDir over-strips English openers BY DESIGN (tables/islands only, §3.2) — the
  // renderer places decorations with resolvedDir; this contrast is the reason (see detect.js).
  assert.equal(E.detectBlockDir('What does שלום mean?'), 'rtl');
  assert.equal(E.resolvedDir('What does שלום mean?'), 'ltr');
});
test('questions: punctuation-only / digits+? decide nothing (null, never rtl)', () => {
  assert.equal(E.detectBlockDir('???'), null);
  assert.equal(E.firstStrong('123?'), null);
  assert.equal(E.firstStrong('?!.,'), null);
  assert.equal(E.cellDir('?'), null);
  assert.equal(E.cellDir('מה?'), 'rtl');
});
test('questions: the ARABIC question mark ؟ is bidi class AL — a STRONG RTL char', () => {
  assert.equal(E.firstStrong('؟'), 'rtl');                        // unlike neutral '?'
  assert.equal(E.detectBlockDir('ما هذا؟'), 'rtl');
  assert.equal(E.detectBlockDir('מה קורה؟'), 'rtl');
});
test('questions: brand opener + "?" — the §8.K tie-safety holds exactly at the tie', () => {
  // "React זה טוב?" is a 5-vs-5 STRONG-char tie → no override (English safety beats the flip);
  // one more Hebrew word tips the majority and the override fires.
  assert.equal(E.plaintextOverrideDir('React זה טוב?'), null);
  assert.equal(E.plaintextOverrideDir('React זה כלי טוב?'), 'rtl');
  assert.equal(E.resolvedDir('React זה כלי טוב?'), 'rtl');
  assert.equal(E.plaintextOverrideDir('API זה טוב?'), 'rtl');     // 3-vs-5 → Hebrew majority
});

// ─────────────────────── direction: aggressive Hebrew×English openers ───────────────────────
test('mixes: technical/acronym/punctuated openers never derail Hebrew', () => {
  assert.equal(E.detectBlockDir('C++ זה שפה'), 'rtl');            // '+' is not a strong char
  assert.equal(E.detectBlockDir('TCP/IP בעברית'), 'rtl');         // slash token peels
  assert.equal(E.detectBlockDir('אי־שוויון הוא מושג'), 'rtl');    // maqaf U+05BE
  assert.equal(E.detectBlockDir('צה"ל הודיע'), 'rtl');            // ASCII quote inside acronym
  assert.equal(E.detectBlockDir('״שלום״ אמר'), 'rtl');            // gershayim quotes U+05F4
  assert.equal(E.stripLeadingNoise('👨‍👩‍👧‍👦 משפחה'), 'משפחה');       // ZWJ emoji family peels whole
});
test('mixes: KNOWN — an email opener resolves by majority (the "@" splits the token)', () => {
  // stripLeadingNoise peels "user" but "@example.com" is no known token → first-strong hits the
  // Latin 'e'. A short Hebrew tail loses the majority (stays LTR); a longer one wins → override.
  assert.equal(E.detectBlockDir('user@example.com שלח לי מייל אתמול בבוקר'), 'ltr');
  assert.equal(E.plaintextOverrideDir('user@example.com שלח לי מייל אתמול בבוקר'), 'rtl');
});

// ─────────────────────── math inside Hebrew questions — '?' never swallowed ───────────────────────
test('math+?: a trailing question mark never joins the isolated run', () => {
  assert.deepEqual(runs('האם x > 5?'), ['x > 5']);
  assert.deepEqual(runs('x>5?'), ['x>5']);                        // no space before '?'
  assert.deepEqual(runs('האם x² ≥ 0?'), ['x² ≥ 0']);
  assert.deepEqual(runs('האם x ∈ [0, 1)?'), ['x ∈ [0, 1)']);      // half-open interval + '?'
  assert.deepEqual(runs('האם √2 < 1.5?'), ['√2 < 1.5']);          // prefix-op chain + '?'
  assert.deepEqual(runs('האם 50% > 25%?'), ['50% > 25%']);
  assert.deepEqual(runs('האם -5° < 10°?'), ['-5° < 10°']);
  assert.deepEqual(runs('האם 1/2 < 3/4?'), ['1/2 < 3/4']);
  assert.deepEqual(runs('האם x = 5 או x = 6?'), ['x = 5', 'x = 6']); // two runs, Hebrew "או" between
  assert.deepEqual(runs('מה? x > 5 מה?'), ['x > 5']);             // '?' on both flanks
  assert.deepEqual(runs('כמה זה 2+2?'), ['2+2']);
  assert.deepEqual(runs('שוויון a = b?'), []);                    // letter-anchored '=' — no reorder
});
test('math+?: KNOWN — "2+2=?" leaves the operand-less "=?" outside the run', () => {
  // '=' has no right operand ('?' is not a term), so the run is just "2+2"; the "=?" tail
  // renders as neutral trailing punctuation of the Hebrew sentence. Documented, not fixed.
  assert.deepEqual(runs('כמה זה 2+2=?'), ['2+2']);
});
test('math/HE: shekel-priced comparisons and Hebrew prefixes before variables', () => {
  assert.deepEqual(runs('המחיר ₪100 < ₪200 כאן'), ['₪100 < ₪200']); // prefix-₪ operands
  assert.deepEqual(runs('נניח ש-x > 0'), ['x > 0']);              // ש- prefix stays prose
  assert.deepEqual(runs('ו-5 < 7'), ['5 < 7']);                   // ו- prefix, sign NOT attached
  assert.deepEqual(runs('הסדרה x⁻¹ < 1 יורדת'), ['x⁻¹ < 1']);     // negative superscript operand
  assert.deepEqual(runs('٥ < ٧'), ['٥ < ٧']);                     // Arabic-Indic digit operands
});
test('math/HE: dates/ranges/phones isolate as one dashed token; clock times do not', () => {
  assert.deepEqual(runs('בטווח 5-10 אנשים'), ['5-10']);
  assert.deepEqual(runs('בתאריך 2024-01-15 קרה'), ['2024-01-15']);
  assert.deepEqual(runs('בשעה 15:30 נפגש'), []);                  // ':' is not an operator
});

// ─────────────────────── math boundary abuse — whitespace, lone ops, prose operands ───────────────────────
test('math: NBSP / narrow-NBSP / thin-space inside a chain — the run spans them (the fix)', () => {
  // Rendered markdown & pasted text use U+00A0/U+202F/U+2009 between operands. Before the fix
  // only the operator isolated — glyph un-mirrored but the operands STILL reordered in RTL.
  assert.deepEqual(runs('x > 5'), ['x > 5']);
  assert.deepEqual(runs('x > 5'), ['x > 5']);
  assert.deepEqual(runs('3 < 5'), ['3 < 5']);
  assert.deepEqual(runs('האם 3 < 5?'), ['3 < 5']);
});
test('math: a newline ends a chain; a tab does not', () => {
  assert.deepEqual(runs('x > 5\ny < 3'), ['x > 5', 'y < 3']);     // two lines → two runs
  assert.deepEqual(runs('x\t>\t5'), ['x\t>\t5']);
});
test('math: Hebrew/emoji operands are prose — the relation stays a lone char', () => {
  assert.deepEqual(runs('<'), ['<']);
  assert.deepEqual(runs('א < ב'), ['<']);                         // Hebrew never pulled into a run
  assert.deepEqual(runs('😀 < 😎'), ['<']);
  assert.deepEqual(runs('צה"ל < 5'), ['< 5']);                    // grows right only
  assert.deepEqual(runs('∑ בעברית'), ['∑']);                      // prefix op over prose: no operand
  assert.deepEqual(runs('אפשרות א | אפשרות ב'), []);              // prose pipes never pair as |…|
  assert.deepEqual(runs('מה גדול יותר: 2³ או 3²?'), []);          // no connector at all
  assert.deepEqual(runs('ℵ בעברית זה אלף'), []);                  // letterlike ℵ alone seeds nothing
});
test('math: an HTML tag inside a Hebrew question is not a comparison', () => {
  assert.deepEqual(runs('האם 3 < 5 וגם <b>מודגש</b>?'), ['3 < 5']);
});
test('math: |…| and mirrored-vs-symmetric relations under Hebrew flanks', () => {
  assert.deepEqual(runs('|x − 3| < 5 בדיוק'), ['|x − 3| < 5']);
  assert.deepEqual(runs('a ≠ b'), ['a ≠ b']);                     // mirrored ≠ isolates letter-anchored too
});

// ─────────────────────── segmentMath — currency vs math under abuse, byte fidelity ───────────────────────
test('segmentMath: math islands inside Hebrew questions/prefixes split exactly', () => {
  assert.deepEqual(seg('האם $x^2$ גדול?'), ['t:האם ', 'm:$x^2$', 't: גדול?']);
  assert.deepEqual(seg('ל-$x^2$ יש ערך'), ['t:ל-', 'm:$x^2$', 't: יש ערך']);
  assert.deepEqual(seg('$$x=1$$ בעברית'), ['m:$$x=1$$', 't: בעברית']);
  assert.deepEqual(seg('שאלה: האם $\\frac{a}{b}$ = חצי?'), ['t:שאלה: האם ', 'm:$\\frac{a}{b}$', 't: = חצי?']);
  assert.deepEqual(seg('\\(שלום\\) עברית במתמטיקה'), ['m:\\(שלום\\)', 't: עברית במתמטיקה']); // delimiters always win
});
test('segmentMath: unclosed/currency dollars in Hebrew stay text', () => {
  assert.deepEqual(seg('מחיר $5 בלבד'), ['t:מחיר $5 בלבד']);      // unclosed $ mid-stream
  assert.deepEqual(seg('$5 עד $10'), ['t:$5 עד $10']);            // price range, no LaTeX signal
  assert.deepEqual(seg('$$$'), ['t:$$$']);
  assert.deepEqual(seg('$$x$$$y$'), ['m:$$x$$', 't:$y$']);        // '$y$' has no signal → currency
});
test('segmentMath: KNOWN — a currency $ then a later signalled $ swallows the span between', () => {
  // The 2nd/3rd dollars pair up and "x^2" inside supplies the LaTeX signal, so Hebrew prose and
  // the price "60" are wrongly folded into one math island. Locked as the price of keeping
  // "$5 to $10" un-mathed; revisit only with a real-world report.
  assert.deepEqual(seg('מחיר $50 ומחיר $60 ומשהו x^2$ סוף'),
    ['t:מחיר $50 ומחיר ', 'm:$60 ומשהו x^2$', 't: סוף']);
});

// ─────────────────────── arrows & signed numbers alongside question marks ───────────────────────
test('arrows+?: local flanks decide, "?" is neutral', () => {
  assert.deepEqual(flip('קלט → פלט?'), ['→']);                    // Hebrew-flanked → flips
  assert.deepEqual(flip('שלב 1 → שלב 2?'), ['→']);                // digits act as R (N1)
  assert.deepEqual(flip('האם a → b?'), []);                       // Latin-flanked LTR run
  assert.deepEqual(flip('linux → windows בעברית'), []);
  assert.deepEqual(flip('עברית → English'), ['→']);               // mixed flanks flip
  assert.deepEqual(flip('קלט → פלט'), ['→']);           // NBSP flanks are skipped
  assert.deepEqual(flip('→'), ['→']);                             // boundary arrow flips
});
test('signed+?: word-boundary signs survive question marks; Hebrew prefixes do not', () => {
  assert.deepEqual(signed('קר מאוד -5?'), ['-5']);
  assert.deepEqual(signed('?-5'), ['-5']);                        // '?' is a boundary
  assert.deepEqual(signed('ירד ל-5?'), []);                       // ל-5 is a prefix, not a sign
  assert.deepEqual(signed('טמפרטורה של −3.5° בחוץ'), ['−3.5']);   // U+2212 minus
  assert.deepEqual(signed('בין -5 ל-10'), ['-5']);                // one real sign, one prefix
});

// ─────────────────────── cross-function consistency properties ───────────────────────
const CORPUS = [
  'האם x > 5?', 'x>5?', 'האם x² ≥ 0?', 'האם x ∈ [0, 1)?', 'האם √2 < 1.5?',
  'האם 50% > 25%?', 'האם -5° < 10°?', 'האם 1/2 < 3/4?', 'האם x = 5 או x = 6?',
  'מה? x > 5 מה?', 'כמה זה 2+2?', 'כמה זה 2+2=?', 'המחיר ₪100 < ₪200 כאן',
  'נניח ש-x > 0', 'ו-5 < 7', 'בטווח 5-10 אנשים', 'בתאריך 2024-01-15 קרה',
  'x > 5', 'x > 5', '3 < 5', 'האם 3 < 5?',
  'x > 5\ny < 3', 'x\t>\t5', '<', 'א < ב', '😀 < 😎', 'צה"ל < 5', '∑ בעברית',
  '|x − 3| < 5 בדיוק', 'a ≠ b', 'האם 3 < 5 וגם <b>מודגש</b>?', 'הסדרה x⁻¹ < 1 יורדת',
  '٥ < ٧', 'האם זה עובד?', 'What does שלום mean?', 'React זה כלי טוב?',
  'מחיר $50 ומחיר $60 ומשהו x^2$ סוף', 'האם $x^2$ גדול?', 'קלט → פלט?', 'באמת?!',
];
test('property: every non-empty relationRuns string passes the hasMathRun DOM gate', () => {
  for (const t of CORPUS) {
    if (E.relationRuns(t).length > 0) {
      assert.equal(E.hasMathRun(t), true, `gate must pass: ${JSON.stringify(t)}`);
    }
  }
});
test('property: runs are sorted, disjoint, in-bounds; segmentMath round-trips byte-for-byte', () => {
  for (const t of CORPUS) {
    let prevEnd = -1;
    for (const [s, e] of E.relationRuns(t)) {
      assert.ok(s >= 0 && e <= t.length && s < e, `bounds: ${JSON.stringify(t)}`);
      assert.ok(s >= prevEnd, `disjoint+sorted: ${JSON.stringify(t)}`);
      prevEnd = e;
    }
    assert.equal(E.segmentMath(t).map((x) => x.value).join(''), t, `round-trip: ${JSON.stringify(t)}`);
    // direction fallbacks never invent 'rtl' out of neutrals, and never crash
    assert.ok([null, 'rtl', 'ltr'].includes(E.detectBlockDir(t)));
    assert.ok([null, 'rtl', 'ltr'].includes(E.resolvedDir(t)));
  }
});
