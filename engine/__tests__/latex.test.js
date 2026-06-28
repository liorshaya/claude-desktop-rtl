'use strict';
// engine/__tests__/latex.test.js — LaTeX segmentation (engine/math.js) and its two consumers:
// arrows (an arrow inside a math run keeps its LTR meaning) and direction (proseText drops math
// runs, so a Hebrew explanation with formulas stays RTL). Hebrew AND English, many edge cases.
//
// The rules under test:
//   • $$…$$ , \[…\] , \(…\)  → ALWAYS math (unambiguous delimiters)
//   • $…$                    → math ONLY with a LaTeX SIGNAL ( \cmd | ^ | _ | { | } ),
//                              otherwise it is currency / prose ("$5", "$5 to $10")
//   • the code point is NEVER changed — concatenating the segments reproduces the input.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentMath, hasLatexSignal } = require('../math.js');
const { arrowFlipOffsets, resolvedDir, plaintextOverrideDir } = require('../index.js');

const math = (t) => segmentMath(t).filter((s) => s.type === 'math').map((s) => s.value);
const textOnly = (t) => segmentMath(t).filter((s) => s.type === 'text').map((s) => s.value).join('');
const recon = (t) => segmentMath(t).map((s) => s.value).join('') === t;
const flip = (t) => arrowFlipOffsets(t).map((i) => t[i]);
const proseDir = (t) => resolvedDir(textOnly(t)) || 'auto'; // what processDirBlock sees

// ───────────────────────────── hasLatexSignal ─────────────────────────────
test('hasLatexSignal: a backslash-LETTER command is a signal', () => {
  for (const s of ['\\frac', '\\sqrt', '\\sum', '\\int', '\\alpha', '\\pi', '\\le', '\\ge',
    '\\in', '\\subseteq', '\\to', '\\implies', '\\mathbb{R}', '\\cdot', '\\infty', '\\forall']) {
    assert.equal(hasLatexSignal(s), true, s);
  }
});
test('hasLatexSignal: sub/superscript and braces are signals', () => {
  for (const s of ['x^2', 'e^{i\\pi}', '2^{10}', 'x_i', 'a_{ij}', '\\sum_{i=1}', '{x}', '\\{1\\}']) {
    assert.equal(hasLatexSignal(s), true, s);
  }
});
test('hasLatexSignal: simple/currency/non-letter content has NO signal', () => {
  for (const s of ['x', '5', '5.99', 'a+b', 'x < y', 'x = y', '(a,b)', '1/2', 'a*b', '', ' ',
    '\\,', '\\;', '\\!']) { // \, \; \! are non-letter commands → not caught by \[A-Za-z]
    assert.equal(hasLatexSignal(s), false, s);
  }
});

// ───────────────────────────── unambiguous delimiters → always math ─────────────────────────────
test('segmentMath: $$…$$ / \\[…\\] / \\(…\\) are math even with NO signal inside', () => {
  assert.deepEqual(math('$$E=mc^2$$'), ['$$E=mc^2$$']);
  assert.deepEqual(math('$$a+b$$'), ['$$a+b$$']);          // no signal, but $$ is always math
  assert.deepEqual(math('\\[a+b\\]'), ['\\[a+b\\]']);
  assert.deepEqual(math('\\(x\\)'), ['\\(x\\)']);          // a lone variable IS math in \(…\)
  assert.deepEqual(math('\\(\\)'), ['\\(\\)']);            // empty inline math
  assert.deepEqual(math('\\[\\]'), ['\\[\\]']);
});

// ───────────────────────────── $…$ : signal vs currency ─────────────────────────────
test('segmentMath: $…$ WITH a LaTeX signal is math', () => {
  assert.deepEqual(math('$x^2$'), ['$x^2$']);
  assert.deepEqual(math('$\\frac{1}{2}$'), ['$\\frac{1}{2}$']);
  assert.deepEqual(math('$x_i$'), ['$x_i$']);
  assert.deepEqual(math('$\\alpha$'), ['$\\alpha$']);
  assert.deepEqual(math('$\\text{שלום}$'), ['$\\text{שלום}$']); // Hebrew INSIDE math (\text)
});
test('segmentMath: $…$ WITHOUT a signal is currency / prose, not math', () => {
  assert.deepEqual(math('$x$'), []);        // a bare variable in $…$ → treated as text
  assert.deepEqual(math('$a+b$'), []);
  assert.deepEqual(math('$x < y$'), []);    // simple inequality, no signal → text
  assert.deepEqual(math('$5$'), []);
  assert.deepEqual(math('$ $'), []);
});

// ───────────────────────────── currency disambiguation ─────────────────────────────
test('segmentMath: currency dollars stay prose; real math beside them is still found', () => {
  assert.deepEqual(math('costs $5 only'), []);
  assert.deepEqual(math('$5 to $10'), []);
  assert.deepEqual(math('pay $10 for the $\\frac{1}{2}$ cake'), ['$\\frac{1}{2}$']);
  assert.deepEqual(math('$5$ vs $x^2$'), ['$x^2$']);
  assert.deepEqual(math('price $5 but $y^2$ here'), ['$y^2$']);
});

// ───────────────────────────── multiple / adjacent / interleaved / nested ─────────────────────────────
test('segmentMath: multiple and adjacent math runs', () => {
  assert.deepEqual(math('a $x^2$ b \\(y_i\\) c'), ['$x^2$', '\\(y_i\\)']);
  assert.deepEqual(math('$a^2$$b^2$'), ['$a^2$', '$b^2$']);          // adjacent $…$$…$
  assert.deepEqual(math('\\(x\\)\\(y\\)'), ['\\(x\\)', '\\(y\\)']);
  assert.deepEqual(math('text $$D$$ more $i^2$ end'), ['$$D$$', '$i^2$']);
});
test('segmentMath: nested braces stay inside ONE math run', () => {
  assert.deepEqual(math('$\\frac{a}{\\frac{b}{c}}$'), ['$\\frac{a}{\\frac{b}{c}}$']);
  assert.deepEqual(math('$x^{a^{b}}$'), ['$x^{a^{b}}$']);
});

// ───────────────────────────── unclosed / escaped → prose ─────────────────────────────
test('segmentMath: an unclosed delimiter is left as prose (settles later)', () => {
  assert.deepEqual(math('$x'), []);
  assert.deepEqual(math('\\(x'), []);
  assert.deepEqual(math('\\[x'), []);
  assert.deepEqual(math('$$x'), []);
  assert.deepEqual(math('half $a^2$ and a stray $ here'), ['$a^2$']); // the closed one still found
});
test('segmentMath: an escaped \\$ (no closing $) stays prose', () => {
  assert.deepEqual(math('\\$5 escaped'), []);
  assert.deepEqual(math('costs \\$5 not math'), []);
});

// ───────────────────────────── offsets + byte-exact reconstruction (fidelity §3.6) ─────────────────────────────
test('segmentMath: start/end offsets slice back to the value', () => {
  const t = 'ab $x^2$ cd \\(y\\) ef';
  const segs = segmentMath(t);
  assert.ok(segs.every((s) => t.slice(s.start, s.end) === s.value));
  assert.deepEqual(segs.map((s) => s.type), ['text', 'math', 'text', 'math', 'text']);
});
test('segmentMath: concatenating segments reproduces the input byte-for-byte', () => {
  for (const t of ['$x^2$', '$$a+b$$', 'נתון $f(x)$ כאן', '$5 to $10', 'a$b$c', '\\(\\)',
    '$x', 'mix $a^2$ and \\[b\\] and $5 here', '', 'plain text', '😀 $x^2$ 😀']) {
    assert.equal(recon(t), true, t);
  }
});

// ───────────────────────────── Hebrew prose + LaTeX ─────────────────────────────
test('segmentMath: Hebrew sentences with embedded LaTeX', () => {
  assert.deepEqual(math('לכל $x \\in \\mathbb{R}$ מתקיים $x^2 \\ge 0$'),
    ['$x \\in \\mathbb{R}$', '$x^2 \\ge 0$']);
  assert.deepEqual(math('המשוואה הידועה: $$E = mc^2$$ של איינשטיין'), ['$$E = mc^2$$']);
  assert.deepEqual(math('הנגזרת $\\frac{dy}{dx}$ חיובית'), ['$\\frac{dy}{dx}$']);
  assert.equal(recon('לכל $x \\in \\mathbb{R}$ מתקיים $x^2 \\ge 0$'), true);
});
// ───────────────────────────── English prose + LaTeX ─────────────────────────────
test('segmentMath: English sentences with embedded LaTeX', () => {
  assert.deepEqual(math('for all $x \\in \\mathbb{R}$ we have $x^2 \\ge 0$'),
    ['$x \\in \\mathbb{R}$', '$x^2 \\ge 0$']);
  assert.deepEqual(math('the identity $$\\sin^2\\theta + \\cos^2\\theta = 1$$ holds'),
    ['$$\\sin^2\\theta + \\cos^2\\theta = 1$$']);
});

// ───────────────────────────── arrows: never flip inside a math run ─────────────────────────────
test('latex/arrows: an arrow inside any math delimiter never flips', () => {
  assert.deepEqual(flip('\\(a → b\\)'), []);
  assert.deepEqual(flip('\\[a → b\\]'), []);
  assert.deepEqual(flip('$$a → b$$'), []);
  assert.deepEqual(flip('$x^2 → y$'), []);            // $…$ with a signal → math
  assert.deepEqual(flip('נתון $x \\to y$ כאן'), []);  // \to is a command (no glyph)
  assert.deepEqual(flip('the limit $x \\to 0$ holds'), []);
});
test('latex/arrows: a PROSE arrow outside math still flips (Hebrew), stays put (English)', () => {
  assert.deepEqual(flip('הקלט → הפלט $f(x^2)$ סוף'), ['→']);        // Hebrew-flanked prose arrow
  assert.deepEqual(flip('input → output \\(g(x)\\) done'), []);    // Latin-flanked → no flip
  assert.deepEqual(flip('הקלט → פלט $$x→y$$ סוף'), ['→']);          // prose flips, math arrow skipped
  assert.deepEqual(flip('צעד \\(a→b\\) ואז קלט → פלט'), ['→']);
});

// ───────────────────────────── direction: proseText drops math ─────────────────────────────
test('latex/direction: math runs are excluded from a block’s direction', () => {
  // dropping the LaTeX leaves only the prose, so a Hebrew explanation stays RTL and an English
  // one stays LTR — the formula never tips the verdict.
  assert.equal(textOnly('הסבר $x^2 + y^2 = z^2$ נוסף'), 'הסבר  נוסף');
  assert.equal(proseDir('הסבר $x^2 + y^2 = z^2$ נוסף'), 'rtl');
  assert.equal(proseDir('explain $x^2 + y^2 = z^2$ more'), 'ltr');
  assert.equal(proseDir('לכל $x \\in \\mathbb{R}$ מתקיים $\\sum x_i^2 \\ge 0$'), 'rtl');
  assert.equal(proseDir('for all $x \\in \\mathbb{R}$ we sum $\\sum x_i^2$'), 'ltr');
  // a line that is ONLY display math has no prose → no strong direction
  assert.equal(textOnly('$$\\int_0^1 f(x)\\,dx$$'), '');
  assert.equal(proseDir('$$\\int_0^1 f(x)\\,dx$$'), 'auto');
});
test('latex/direction: dropping the math lets the §8.K override see the true majority', () => {
  // a Latin/LaTeX OPENER on a majority-Hebrew line: with the math dropped, the prose itself is
  // Hebrew-first, so it is rtl by nature (the override is only needed on the raw, undropped text).
  assert.equal(proseDir('$\\alpha + \\beta$ הוא הסכום של שני האיברים'), 'rtl');
  assert.equal(proseDir('$\\frac{1}{2}$ מהעוגה נשארה במקרר'), 'rtl');
  assert.equal(plaintextOverrideDir(textOnly('$\\alpha+\\beta$ הוא הסכום')), null);
});

// ───────────────────────────── realistic mixed lines ─────────────────────────────
test('latex: realistic Hebrew & English lines (segmentation + fidelity)', () => {
  const he = 'הפתרון הוא $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ לפי הנוסחה';
  assert.deepEqual(math(he), ['$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$']);
  assert.equal(recon(he), true);
  assert.equal(proseDir(he), 'rtl');

  const en = 'the quadratic formula $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ solves it';
  assert.deepEqual(math(en), ['$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$']);
  assert.equal(proseDir(en), 'ltr');

  const disp = 'משפט פיתגורס: $$a^2 + b^2 = c^2$$ נכון לכל משולש ישר-זווית';
  assert.deepEqual(math(disp), ['$$a^2 + b^2 = c^2$$']);
  assert.equal(proseDir(disp), 'rtl');
});

// ───────────────────────────── documented edge cases (locked) ─────────────────────────────
test('latex: KNOWN signal-heuristic edges (no-signal $…$ and non-letter commands)', () => {
  // "$x$", "$a+b$", "$x < y$" lack a signal, so they read as prose until KaTeX renders them.
  assert.deepEqual(math('the value $x$ here'), []);
  assert.deepEqual(math('הביטוי $a + b$ פשוט'), []);
  // a $…$ holding only a non-letter command ("\,") is also below the signal threshold.
  assert.deepEqual(math('$\\,$'), []);
  // …but the same content in unambiguous delimiters IS math:
  assert.deepEqual(math('\\(x\\)'), ['\\(x\\)']);
  assert.deepEqual(math('\\(a + b\\)'), ['\\(a + b\\)']);
});
