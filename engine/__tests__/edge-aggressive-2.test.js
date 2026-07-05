'use strict';
// engine/__tests__/edge-aggressive-2.test.js — round 2 of the adversarial sweep. This round
// attacks the seams the first round exposed as suspicious: bracket OPERANDS holding Hebrew
// prose, equations inside HTML-tag attributes, unbalanced brackets, bidi controls INSIDE a
// comparison chain, niqqud vote inflation, geresh/gershayim tokens, URLs with query params,
// multiline blocks, and a streaming torture property (every UTF-16 prefix of every corpus
// string — including prefixes that CUT A SURROGATE PAIR — must stay crash-free, in-bounds,
// and byte-faithful). Findings locked here:
//   • FIXED — a balanced bracket group holding Hebrew ("(שתי מילים)") was attached as a
//     relation OPERAND and LTR-isolated, reversing the Hebrew words. termStartLeft/termEndRight
//     now refuse a STRONG_RTL group, like mathBracketEnd/absSpans always did.
//   • FIXED — an arithmetic '=' INSIDE an HTML tag ("<img width=100>") seeded a run,
//     fragmenting a tag that must be left whole to UBA. The arith seed now checks inTag.
//   • KNOWN — an RLM/ZWSP glued to an operator breaks chain growth (lone-operator run).
//   • KNOWN — "a=1" / "com/5/3" inside a URL isolate (harmless: a URL is already one
//     contiguous LTR run in RTL context, so an inner LTR isolate is a visual no-op).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../index.js');

const runs = (t) => E.relationRuns(t).map(([s, e]) => t.slice(s, e));

// ─────────────────── THE HARD RULE: Hebrew inside brackets is never LTR-isolated ───────────────────
test('brackets/HE: a bracket group holding Hebrew never becomes a relation operand (the fix)', () => {
  // Before the fix these isolated WHOLE — "(שתי מילים)" inside an LTR span renders "מילים שתי".
  assert.deepEqual(runs('(שלום + 5) < 7'), ['< 7']);
  assert.deepEqual(runs('x < (שתי מילים)'), ['x <']);
  assert.deepEqual(runs('(ראה סעיף 5) > הערה'), ['>']);
  assert.deepEqual(runs('f(שלום) = 5'), []);                      // Hebrew call args → no run at all
  assert.deepEqual(runs('(שָׁלוֹם) < 5'), ['< 5']);                  // niqqud is Hebrew too
  assert.deepEqual(runs('x < (كلمتين هنا)'), ['x <']);            // Arabic prose — same rule
});
test('brackets/HE: Latin/math bracket operands still attach exactly as before', () => {
  assert.deepEqual(runs('האם (x+1) < (y+2)?'), ['(x+1) < (y+2)']);
  assert.deepEqual(runs('f(x) ≤ g(x)'), ['f(x) ≤ g(x)']);
  assert.deepEqual(runs('(3 × 5) + 2 = 17'), ['(3 × 5) + 2 = 17']);
  // an English prose parenthetical DOES attach — documented-harmless (English renders LTR anyway)
  assert.deepEqual(runs('x < (see note)'), ['x < (see note)']);
});

// ─────────────────── HTML tags: attribute equations stay inside the tag ───────────────────
test('tags: an arithmetic = inside an HTML tag never seeds a run (the fix)', () => {
  assert.deepEqual(runs('ראה <a href="x=1">קישור</a> כאן'), []);
  assert.deepEqual(runs('<img width=100> תמונה'), []);
  assert.deepEqual(runs('גודל <div style="width:50%"> כאן'), []);
  // …while a real comparison NEXT TO a tag still isolates
  assert.deepEqual(runs('האם 3 < 5 וגם <a href="x=1">כאן</a>?'), ['3 < 5']);
});

// ─────────────────── unbalanced / degenerate brackets — graceful, crash-free ───────────────────
test('brackets: unbalanced and bracket-only strings degrade gracefully', () => {
  assert.deepEqual(runs('(a < b'), ['a < b']);                    // stray opener left outside
  assert.deepEqual(runs('a < b)'), ['a < b']);                    // stray closer left outside
  assert.deepEqual(runs(')3 < 5('), ['3 < 5']);                   // reversed strays
  assert.deepEqual(runs('((1+2) < (3'), ['(1+2) <']);             // unclosed right group not attached
  assert.deepEqual(runs('((('), []);
  assert.deepEqual(runs('[(a+b)] < 5'), ['[(a+b)] < 5']);         // nested balanced group is fine
});

// ─────────────────── bidi controls INSIDE a chain — KNOWN limits, locked ───────────────────
test('controls: KNOWN — an RLM/ZWSP glued to the operator breaks chain growth on that side', () => {
  // The control is neither whitespace nor a term char. The operator still isolates (glyph
  // upright) but the blocked operand stays outside. Claude output does not emit these; only
  // pasted foreign text hits this. Locked, not fixed — spanning controls would need UBA-level
  // reasoning the engine deliberately avoids.
  assert.deepEqual(runs('3 ‏<‏ 5'), ['<']);             // RLM on both sides
  assert.deepEqual(runs('3​<​5'), ['<']);               // ZWSP glued
  assert.deepEqual(runs('3 ‎< 5'), ['< 5']);                 // LRM blocks only the left side
});

// ─────────────────── niqqud / geresh / gershayim under aggressive mixing ───────────────────
test('niqqud: combining marks sit in the Hebrew block and VOTE rtl — amplification, never a flip', () => {
  // "React" (5 L) vs "שָׁלוֹם" (4 letters + marks) — the marks tip the majority to RTL. That only
  // ever AMPLIFIES Hebrew that is already there; a marks-free English majority stays LTR (§8.K).
  assert.equal(E.majority('React שָׁלוֹם'), 'rtl');
  assert.equal(E.plaintextOverrideDir('React שָׁלוֹם'), 'rtl');
  assert.equal(E.plaintextOverrideDir('React shalom שלום'), null); // plain English majority holds
});
test('geresh/gershayim: acronym/year/ordinal tokens never derail detection', () => {
  assert.equal(E.detectBlockDir("בשנת ה'תשפ\"ד קרה"), 'rtl');     // Hebrew year with both marks
  assert.equal(E.detectBlockDir("מס' 5 ברשימה"), 'rtl');          // ordinal abbreviation
  assert.equal(E.cellDir('צה"ל'), 'rtl');
});

// ─────────────────── URLs & markdown links — KNOWN-harmless isolates ───────────────────
test('urls: KNOWN — query/path fragments isolate inside a URL (a visual no-op)', () => {
  // "a=1" and "com/5/3" seed as arithmetic. Harmless: the URL is one contiguous LTR run in an
  // RTL paragraph (Latin anchors), so an inner LTR isolate cannot change the rendered order.
  assert.deepEqual(runs('ראה https://x.com?a=1 כאן'), ['a=1']);
  assert.deepEqual(runs('בקר ב-https://x.com/5/3 עכשיו'), ['com/5/3']);
  assert.deepEqual(runs('הקובץ path/to/file.js נמצא'), []);       // no digit → '/' never seeds
});

// ─────────────────── multiline blocks & stacked leading noise ───────────────────
test('multiline: a two-language block resolves whole-text (per-line is the DOM leaf split)', () => {
  assert.equal(E.detectBlockDir('שלום\nEnglish here'), 'rtl');    // first strong wins
  assert.equal(E.detectBlockDir('English line\nשורה עברית ארוכה יותר כאן'), 'rtl'); // opener peeled
  assert.equal(E.resolvedDir('English line\nשורה עברית ארוכה יותר כאן'), 'rtl');    // majority override
});
test('noise: stacked openers all peel; noise-only lines decide by raw majority', () => {
  assert.equal(E.stripLeadingNoise('1. 😀 `x` https://a.b v2.0 React שלום'), 'שלום');
  assert.equal(E.detectBlockDir('1. 2. 3. hello'), 'ltr');
  assert.equal(E.detectBlockDir('1. 2. 3.'), null);               // nothing left, no strong char
});

// ─────────────────── code fences with Hebrew math questions ───────────────────
test('code: Hebrew math questions in a fence are prose; real code with a Hebrew comment is code', () => {
  assert.equal(E.codeBlockIsProse('האם x < 5?'), true);           // no code structure → RTL prose
  assert.equal(E.codeBlockIsProse('התשובה היא 42 = 6 × 7'), true);
  assert.equal(E.codeBlockIsProse('const x = 5; // הערה בעברית'), false); // keyword+semicolon win
});

// ─────────────────── the Arabic question mark ends a chain like Hebrew does ───────────────────
test('math+؟: the strong-RTL ؟ terminates the run exactly like a Hebrew letter', () => {
  assert.deepEqual(runs('٥ < ٧؟'), ['٥ < ٧']);
  assert.deepEqual(runs('هل x > 5؟'), ['x > 5']);
});

// ─────────────────── the gate hole the prefix-fuzz caught (FIXED) ───────────────────
test('gate: a limit operator with NO digit/operator/comma still passes hasMathRun (the fix)', () => {
  // "lim_{n→∞} aₙ" seeds via LIMIT_RE but carried none of the gate signals (no digit — ∞ and ₙ
  // are not gate digits; no arith op; no comma). The DOM gate said false → the parse never ran
  // → the limit rendered scrambled in RTL ("aₙ lim_{n→∞}"). Caught by the prefix-fuzz below.
  assert.equal(E.hasMathRun('lim_{x→0}'), true);
  assert.equal(E.hasMathRun('הגבול lim_{n→∞} aₙ קיים'), true);
  assert.ok(runs('הגבול lim_{n→∞} aₙ קיים').length > 0);
  // …and the gate does not fire on prose that merely contains the letters
  assert.equal(E.hasMathRun('climate נושא חשוב'), false);         // "lim" inside a word
  assert.equal(E.hasMathRun('שלום עולם'), false);
});

// ─────────────────── streaming torture: every prefix of every nasty string ───────────────────
const CORPUS = [
  '(שלום + 5) < 7', 'x < (שתי מילים)', 'ראה <a href="x=1">קישור</a> כאן',
  '<img width=100> תמונה', 'האם (x+1) < (y+2)?', ')3 < 5(', '((1+2) < (3',
  '3 ‏<‏ 5', 'React שָׁלוֹם', "בשנת ה'תשפ\"ד קרה", 'ראה https://x.com?a=1 כאן',
  'שלום\nEnglish here', '😀😀 א → ב וגם 𝐀𝐁 3 < 5', 'האם $x^2$ גדול? כי √2 < 1.5 ו-|x − 3| < ε',
  'lim_{x→0} f(x)/x = 1 בעברית', '٥ < ٧؟ וגם ∑_{i=1}^{n} i²', 'המחיר ₪100 < ₪200 ב-5% הנחה',
];
test('streaming: every UTF-16 prefix (even mid-surrogate) is crash-free, in-bounds, byte-faithful', () => {
  // §3.3/§8.H — mid-stream a text node can end ANYWHERE, including between the halves of an
  // astral pair. The engine must never crash, never report out-of-range offsets, and never
  // lose a byte, on any such partial.
  for (const t of CORPUS) {
    for (let k = 0; k <= t.length; k++) {
      const p = t.slice(0, k);
      assert.equal(E.segmentMath(p).map((s) => s.value).join(''), p, `round-trip @${k}: ${JSON.stringify(t)}`);
      let prevEnd = -1;
      for (const [s, e] of E.relationRuns(p)) {
        assert.ok(s >= 0 && e <= p.length && s < e, `bounds @${k}: ${JSON.stringify(t)}`);
        assert.ok(s >= prevEnd, `disjoint @${k}: ${JSON.stringify(t)}`);
        prevEnd = e;
      }
      for (const i of E.arrowFlipOffsets(p)) {
        assert.ok(E.isMirrorArrow(p.codePointAt(i)), `arrow offset @${k}: ${JSON.stringify(t)}`);
      }
      assert.ok([null, 'rtl', 'ltr'].includes(E.detectBlockDir(p)));
      assert.ok([null, 'rtl', 'ltr'].includes(E.resolvedDir(p)));
      assert.ok(typeof E.hasMathRun(p) === 'boolean');
    }
  }
});
test('streaming: relationRuns is still sound vs the hasMathRun gate on every prefix', () => {
  // The DOM only parses when the gate passes — a run the gate misses would silently never
  // isolate. Must hold at every streaming settle point, not just on the final text.
  for (const t of CORPUS) {
    for (let k = 0; k <= t.length; k++) {
      const p = t.slice(0, k);
      if (E.relationRuns(p).length > 0) {
        assert.equal(E.hasMathRun(p), true, `gate @${k}: ${JSON.stringify(p)}`);
      }
    }
  }
});
