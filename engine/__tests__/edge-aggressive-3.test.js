'use strict';
// engine/__tests__/edge-aggressive-3.test.js — round 3 of the adversarial sweep: the surfaces
// rounds 1–2 did not reach. Arabic-script NUMERIC PUNCTUATION (٪ ٫ ٬) inside comparisons,
// fullwidth/exotic operands (＜ ３ ² ∞ %), relation runs over RAW math delimiters ($x<y$),
// dense HTML-tag×comparison interleaving, exotic arrows (↔ ⇐ VS16 chains), majority voters
// nobody asked about (AN digits, CJK, Persian ZWNJ), degenerate signed numbers ((-5)-(-3)),
// empty/alternating $-islands, math-only table cells, and markdown-in-fence. Finding fixed:
//   • FIXED — Arabic percent ٪ (U+066A) was not an operand suffix and the Arabic separators
//     ٫ (U+066B) / ٬ (U+066C) were not number-internal: "٥٫٥ < ٦" isolated "٥ < ٦" — CUTTING
//     the number across the isolation boundary (worse than not isolating); "٥٠٪ > ٢٥٪" lost
//     its left operand entirely. isSep/isSuffix + LEADING_NUMBER/SIGNED_NUMBER now cover them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

const runs = (t) => E.relationRuns(t).map(([s, e]) => t.slice(s, e));
const flip = (t) => E.arrowFlipOffsets(t).map((i) => t[i]);
const signed = (t) => E.signedNumberRuns(t).map(([s, e]) => t.slice(s, e));
const seg = (t) => E.segmentMath(t).map((s) => `${s.type[0]}:${s.value}`);

// ─────────────────── Arabic-script numeric punctuation (the fix) ───────────────────
test('arabic-punct: ٪ ٫ ٬ ride with their number through a comparison (were cut before)', () => {
  assert.deepEqual(runs('٥٠٪ > ٢٥٪'), ['٥٠٪ > ٢٥٪']);            // percent kept both sides
  assert.deepEqual(runs('٥٫٥ < ٦'), ['٥٫٥ < ٦']);                // decimal sep joins the digits
  assert.deepEqual(runs('١٬٠٠٠ ≤ ٥٬٠٠٠'), ['١٬٠٠٠ ≤ ٥٬٠٠٠']);    // thousands sep too
  assert.deepEqual(runs('۵٫۵ < ۶'), ['۵٫۵ < ۶']);                // Persian digits, same seps
  assert.deepEqual(runs('السعر ٥٠٪ > ٢٥٪ هنا'), ['٥٠٪ > ٢٥٪']);  // inside Arabic prose
});
test('arabic-punct: leadingNumber / signedNumberRuns take the whole token', () => {
  assert.equal(E.leadingNumber('٥٫٥ تست'), '٥٫٥');
  assert.equal(E.leadingNumber('١٬٠٠٠ ريال'), '١٬٠٠٠');
  assert.deepEqual(signed('-٥٫٥ درجة'), ['-٥٫٥']);
  assert.equal(E.leadingNumber('50% הנחה'), '50%');              // Latin percent unchanged
});

// ─────────────────── fullwidth / exotic operand shapes ───────────────────
test('exotic: fullwidth ＜ (U+FF1C) is a mirrored relation; ASCII operands attach, fullwidth do not', () => {
  assert.deepEqual(runs('3 ＜ 5'), ['3 ＜ 5']);                  // Sm + Bidi_Mirrored → real seed
  assert.deepEqual(runs('３＜５'), ['＜']);                      // KNOWN: fullwidth digits are not term chars
});
test('exotic: superscript/infinity/percent/decimal operand corners', () => {
  assert.deepEqual(runs('² < ³'), ['< ³']);                      // KNOWN: a BARE superscript is no left operand
  assert.deepEqual(runs('∞ < ∞'), ['∞ < ∞']);
  assert.deepEqual(runs('% < 5'), ['< 5']);                      // a dangling % is not an operand
  assert.deepEqual(runs('.5 < 1'), ['5 < 1']);                   // KNOWN: a leading-dot decimal loses its dot
  assert.deepEqual(runs('5. < 6'), ['< 6']);                     // sentence period never joins — by design
  assert.deepEqual(runs('x < ٥'), ['x < ٥']);                    // Latin/Arabic-Indic mix is one run
  assert.deepEqual(runs('$5<₪7'), ['$5<₪7']);                    // mixed currencies, no spaces
});
test('exotic: dense chains with no whitespace at all', () => {
  assert.deepEqual(runs('3<5<7<9'), ['3<5<7<9']);
  assert.deepEqual(runs('a<b<c'), ['a<b<c']);
  assert.deepEqual(runs('x≤y≤z'), ['x≤y≤z']);
  assert.deepEqual(runs('(0,1)∩(1,2)=∅'), ['(0,1)∩(1,2)=∅']);    // interval algebra, zero spaces
  assert.deepEqual(runs('האם3<5?'), ['3<5']);                    // Hebrew GLUED to the digits
  assert.deepEqual(runs('5<ה'), ['5<']);                         // Hebrew glued on the right
  assert.deepEqual(runs('< < <'), ['<', '<', '<']);              // operand-less seeds stay single
  assert.deepEqual(runs('<>'), ['<>']);                          // two mirrored seeds merge, no operands
});

// ─────────────────── raw math delimiters are NOT the engine's problem ───────────────────
test('exotic: KNOWN — relationRuns is math-delimiter-agnostic (rendered math never reaches it)', () => {
  // Raw "$x<y$" reaches the relation pass only mid-stream, before KaTeX renders: the DOM's
  // walker skips RENDERED math islands (inLtrIsland), not raw delimiters. Wrapping the raw text
  // is harmless — the isolate reads the formula LTR anyway, and the next React render replaces
  // the node wholesale. Locked as the engine's view, not "fixed": the $-pair reads as currency
  // prefix/suffix of the operands.
  assert.deepEqual(runs('$x<y$ וגם 3 < 5'), ['$x<y$', '3 < 5']);
  assert.deepEqual(runs('\\(a<b\\) בסדר'), ['(a<b\\)']);         // \( \) brackets seed as a math group
});

// ─────────────────── dense HTML-tag × comparison interleaving ───────────────────
test('tags: comparisons BETWEEN tags isolate; the tags themselves never do', () => {
  assert.deepEqual(runs('<div>3<5</div>'), ['3<5']);             // "3<5" wedged between two tags
  assert.deepEqual(runs('1<2 <b>bold</b> 3<4'), ['1<2', '3<4']); // tag in the middle, two runs
});

// ─────────────────── exotic arrows ───────────────────
test('arrows: chains, bidirectional, double-shaft, VS16, parenthesised, ?-flanked', () => {
  assert.deepEqual(flip('א→ב'), ['→']);                          // glued to Hebrew
  assert.deepEqual(flip('א → ב → ג'), ['→', '→']);               // a chain flips each
  assert.deepEqual(flip('א ↔ ב'), ['↔']);                        // bidirectional: flip is a visual no-op — safe
  assert.deepEqual(flip('א ⇐ ב'), ['⇐']);                        // double-shaft leftwards
  assert.deepEqual(flip('צעד ➡️ הבא'), ['➡']);                   // emoji arrow: offset is the BASE, VS16 rides along
  assert.deepEqual(flip('(→)'), ['→']);                          // parens are neutral → boundary arrow flips
  assert.deepEqual(flip('? → ?'), ['→']);                        // '?' flanks are neutral, not L-L
});

// ─────────────────── majority voters nobody asked about ───────────────────
test('voters: Arabic-Indic DIGITS are strong-RTL votes — they can flip a Latin-opener line', () => {
  // By design (they sit in the Arabic block — an Arabic-context cue, see unicode.test.js):
  assert.equal(E.plaintextOverrideDir('abc ٤٥٦٧٨'), 'rtl');
  assert.equal(E.plaintextOverrideDir('abc ٤٥٦٧٨ نص'), 'rtl');
  // EN digits stay weak — the same shape with 45678 must NOT flip:
  assert.equal(E.plaintextOverrideDir('abc 45678'), null);
});
test('voters: CJK letters vote LTR per char; Persian ZWNJ words stay RTL', () => {
  assert.equal(E.majority('中文 שלום'), 'rtl');                  // 2 CJK vs 4 Hebrew
  assert.equal(E.resolvedDir('日本語のテキストです שלום'), 'ltr'); // long CJK run outvotes
  assert.equal(E.detectBlockDir('می‌خواهم چیزی بگویم'), 'rtl');   // ZWNJ inside Persian words
});

// ─────────────────── degenerate signed numbers ───────────────────
test('signed: bracketed negatives, sign-stacks, and ± stay exact', () => {
  assert.deepEqual(signed('(-5)-(-3)'), ['-5', '-3']);           // each after a bracket boundary
  assert.deepEqual(signed('+-5'), ['-5']);                       // only the sign glued to digits
  assert.equal(E.leadingNumber('±5 מעלות'), '±5');
  assert.deepEqual(runs('(-5)-(-3)'), ['(-5)-(-3)']);            // and the whole difference isolates
});

// ─────────────────── segmentMath: empty / alternating / decimal-only islands ───────────────────
test('segmentMath: degenerate dollar layouts stay byte-faithful', () => {
  assert.deepEqual(seg('$$$$'), ['m:$$$$']);                     // an EMPTY $$…$$ is math
  assert.deepEqual(seg('$a$b$c$'), ['t:$a$b$c$']);               // no signal anywhere → all prose
  assert.deepEqual(seg('$5.99$ מחיר'), ['t:$5.99$ מחיר']);       // digits-only $…$ is currency
  assert.deepEqual(seg('\\(x\\] לא סגור'), ['t:\\(x\\] לא סגור']); // mismatched \( \] → prose
  assert.deepEqual(seg('$x^2$ ו-$y_1$ שניהם'), ['m:$x^2$', 't: ו-', 'm:$y_1$', 't: שניהם']);
});

// ─────────────────── tables: math cells, ؟ cells, control-led cells ───────────────────
test('tables: math-only and control-led cells are neutral; ؟ is an RTL cell', () => {
  assert.equal(E.cellDir('3 < 5'), null);                        // no strong char at all
  assert.equal(E.cellDir('؟'), 'rtl');                           // AL question mark IS strong
  assert.equal(E.cellDir('‏123'), null);                         // RLM+digits: controls do not vote
  assert.equal(E.tableDir(['3 < 5', '7 > 2'], []), null);        // an all-math table has no dir
  assert.deepEqual(E.columnDirs([['שם', 'Name', '؟'], ['דני', 'Dan', '?']]), ['rtl', 'ltr', 'rtl']);
});

// ─────────────────── code fences: markdown-shaped Hebrew ───────────────────
test('code: Hebrew markdown shapes in a fence — prose, except the --- table rule (KNOWN)', () => {
  assert.equal(E.codeBlockIsProse('**מודגש** בעברית'), true);
  assert.equal(E.codeBlockIsProse('שלום\n    מוזח בעומק'), true); // indentation alone ≠ code (§8.D)
  assert.equal(E.codeBlockIsProse('- פריט 1\n- פריט 2'), true);
  // KNOWN conservative false-positive: the "---|---" separator row trips the "--" operator
  // guard, so a Hebrew markdown TABLE inside a fence stays LTR code. Accepted (§8.D: when
  // unsure, stay code) — revisit only with a real-world report.
  assert.equal(E.codeBlockIsProse('א | ב\n---|---\n1 | 2'), false);
  assert.equal(E.looksLikeCode('x => x*2 בעברית'), true);
});

// ─────────────────── round-3 corpus joins the streaming torture ───────────────────
const CORPUS3 = [
  '٥٠٪ > ٢٥٪', '٥٫٥ < ٦', '١٬٠٠٠ ≤ ٥٬٠٠٠', '۵٫۵ < ۶', 'السعر ٥٠٪ > ٢٥٪ هنا',
  '3 ＜ 5', '３＜５', '(0,1)∩(1,2)=∅', 'האם3<5?', '<div>3<5</div>',
  '$x<y$ וגם 3 < 5', '\\(a<b\\) בסדר', 'צעד ➡️ הבא', '中文 שלום', 'می‌خواهم چیزی بگویم',
  '(-5)-(-3)', '$$$$', '$a$b$c$', 'א | ב\n---|---\n1 | 2', '< < <', '<>',
];
test('streaming: round-3 corpus — every prefix is crash-free, in-bounds, byte-faithful, gate-sound', () => {
  for (const t of CORPUS3) {
    for (let k = 0; k <= t.length; k++) {
      const p = t.slice(0, k);
      assert.equal(E.segmentMath(p).map((s) => s.value).join(''), p, `round-trip @${k}: ${JSON.stringify(t)}`);
      let prevEnd = -1;
      for (const [s, e] of E.relationRuns(p)) {
        assert.ok(s >= 0 && e <= p.length && s < e, `bounds @${k}: ${JSON.stringify(t)}`);
        assert.ok(s >= prevEnd, `disjoint @${k}: ${JSON.stringify(t)}`);
        prevEnd = e;
      }
      if (E.relationRuns(p).length > 0) {
        assert.equal(E.hasMathRun(p), true, `gate @${k}: ${JSON.stringify(p)}`);
      }
      for (const i of E.arrowFlipOffsets(p)) {
        assert.ok(E.isMirrorArrow(p.codePointAt(i)), `arrow offset @${k}: ${JSON.stringify(t)}`);
      }
      assert.ok([null, 'rtl', 'ltr'].includes(E.detectBlockDir(p)));
      assert.ok([null, 'rtl', 'ltr'].includes(E.resolvedDir(p)));
    }
  }
});
