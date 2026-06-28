'use strict';
// engine/__tests__/latex-symbols.test.js — the MANY LaTeX symbols, and the one property that
// matters most for math: FIDELITY. The engine must never alter a math glyph — concatenating
// segmentMath's runs has to reproduce the input byte-for-byte (§3.6: copy/paste & Ctrl-F return
// Claude's text exactly). We also check that real (letter-command) math is segmented as math,
// that arrow COMMANDS carry no glyph to flip, and we lock the non-letter-command edge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentMath } = require('../math.js');
const { arrowFlipOffsets, relationRuns } = require('../index.js');

const math = (t) => segmentMath(t).filter((s) => s.type === 'math').map((s) => s.value);
const recon = (t) => segmentMath(t).map((s) => s.value).join('') === t;
// assert every expression round-trips byte-for-byte AND is one math run
const allMath = (list) => {
  for (const t of list) {
    assert.equal(recon(t), true, 'recon ' + t);
    assert.deepEqual(math(t), [t], 'one math run: ' + t);
  }
};

// ───────────────────────── relation symbols (as LaTeX commands) ─────────────────────────
test('symbols: relation commands segment as math, byte-exact', () => {
  allMath(['$a \\le b$', '$a \\ge b$', '$a \\ne b$', '$a \\neq b$', '$a \\leq b$', '$a \\geq b$',
    '$a \\ll b$', '$a \\gg b$', '$x \\in A$', '$x \\notin A$', '$A \\ni x$', '$A \\subset B$',
    '$A \\subseteq B$', '$A \\supseteq B$', '$A \\subsetneq B$', '$a \\equiv b$', '$a \\approx b$',
    '$a \\cong b$', '$a \\sim b$', '$a \\simeq b$', '$a \\propto b$', '$a \\prec b$', '$a \\succ b$',
    '$a \\preceq b$', '$\\Gamma \\vdash \\phi$', '$M \\models \\varphi$']);
});

// ───────────────────────── binary operators ─────────────────────────
test('symbols: binary operators segment as math, byte-exact', () => {
  allMath(['$a \\times b$', '$a \\div b$', '$a \\pm b$', '$a \\mp b$', '$a \\cdot b$', '$a \\ast b$',
    '$a \\star b$', '$a \\circ b$', '$a \\bullet b$', '$a \\oplus b$', '$a \\ominus b$',
    '$a \\otimes b$', '$a \\oslash b$', '$A \\cup B$', '$A \\cap B$', '$A \\setminus B$',
    '$a \\wedge b$', '$a \\vee b$', '$A \\sqcup B$', '$A \\sqcap B$']);
});

// ───────────────────────── Greek letters (lower + capital) ─────────────────────────
test('symbols: Greek letters segment as math, byte-exact', () => {
  allMath(['$\\alpha$', '$\\beta$', '$\\gamma$', '$\\delta$', '$\\epsilon$', '$\\varepsilon$',
    '$\\zeta$', '$\\eta$', '$\\theta$', '$\\vartheta$', '$\\iota$', '$\\kappa$', '$\\lambda$',
    '$\\mu$', '$\\nu$', '$\\xi$', '$\\pi$', '$\\varpi$', '$\\rho$', '$\\sigma$', '$\\tau$',
    '$\\upsilon$', '$\\phi$', '$\\varphi$', '$\\chi$', '$\\psi$', '$\\omega$',
    '$\\Gamma$', '$\\Delta$', '$\\Theta$', '$\\Lambda$', '$\\Xi$', '$\\Pi$', '$\\Sigma$',
    '$\\Upsilon$', '$\\Phi$', '$\\Psi$', '$\\Omega$']);
});

// ───────────────────────── big operators ─────────────────────────
test('symbols: big operators (sum/prod/int/…) segment as math, byte-exact', () => {
  allMath(['$\\sum_{i=1}^{n} i$', '$\\prod_{k} a_k$', '$\\coprod_i X_i$', '$\\int_a^b f$',
    '$\\oint_C F$', '$\\iint_D g$', '$\\iiint_V h$', '$\\bigcup_i A_i$', '$\\bigcap_i A_i$',
    '$\\bigvee_i p_i$', '$\\bigwedge_i p_i$', '$\\bigoplus_i V_i$', '$\\bigotimes_i W_i$']);
});

// ───────────────────────── arrows as COMMANDS — math, and no glyph to flip ─────────────────────────
test('symbols: arrow commands are math (carry no arrow glyph → nothing to flip)', () => {
  const arrows = ['$a \\to b$', '$a \\rightarrow b$', '$a \\leftarrow b$', '$a \\Rightarrow b$',
    '$a \\Leftarrow b$', '$a \\leftrightarrow b$', '$a \\Leftrightarrow b$', '$a \\mapsto b$',
    '$a \\hookrightarrow b$', '$a \\rightharpoonup b$', '$p \\implies q$', '$p \\iff q$',
    '$a \\uparrow b$', '$a \\downarrow b$', '$a \\longrightarrow b$'];
  allMath(arrows);
  for (const t of arrows) assert.deepEqual(arrowFlipOffsets(t), [], 'no flip: ' + t);
  // arrow commands inside Hebrew/English prose: still no glyph, still no flip
  assert.deepEqual(arrowFlipOffsets('לכל $f \\to g$ רציפה'), []);
  assert.deepEqual(arrowFlipOffsets('the map $f \\to g$ is smooth'), []);
});

// ───────────────────────── delimiters / functions / accents ─────────────────────────
test('symbols: delimiters, named functions, and accents segment as math', () => {
  allMath(['$\\langle x, y \\rangle$', '$\\lfloor x \\rfloor$', '$\\lceil x \\rceil$',
    '$\\lvert x \\rvert$', '$\\lVert v \\rVert$',
    '$\\sin x$', '$\\cos\\theta$', '$\\tan x$', '$\\log n$', '$\\ln x$', '$\\lim_{n} a_n$',
    '$\\max_i x_i$', '$\\min S$', '$\\sup A$', '$\\inf B$', '$\\gcd(a,b)$', '$\\det(M)$',
    '$\\ker T$', '$\\dim V$',
    '$\\hat{x}$', '$\\bar{y}$', '$\\vec{v}$', '$\\tilde{a}$', '$\\dot{x}$', '$\\ddot{x}$',
    '$\\widehat{AB}$', '$\\overline{z}$', '$\\underline{u}$']);
});

// ───────────────────────── fractions / roots / binomials ─────────────────────────
test('symbols: fractions, roots, binomials segment as math', () => {
  allMath(['$\\frac{a}{b}$', '$\\dfrac{1}{2}$', '$\\tfrac{x}{y}$', '$\\frac{\\partial f}{\\partial x}$',
    '$\\sqrt{2}$', '$\\sqrt[3]{x}$', '$\\sqrt[n]{x^2+1}$', '$\\binom{n}{k}$', '$\\dbinom{n}{2}$']);
});

// ───────────────────────── logic / sets / misc symbols ─────────────────────────
test('symbols: quantifiers, set/logic, and misc symbols segment as math', () => {
  allMath(['$\\forall x$', '$\\exists y$', '$\\nexists z$', '$\\neg p$', '$\\lnot q$',
    '$p \\land q$', '$p \\lor q$', '$\\emptyset$', '$\\varnothing$', '$\\infty$', '$\\partial$',
    '$\\nabla f$', '$\\aleph_0$', '$\\hbar$', '$\\ell$', '$\\Re z$', '$\\Im z$', '$\\wp$',
    '$\\ldots$', '$\\cdots$', '$\\vdots$', '$\\ddots$', '$a_1, \\dots, a_n$']);
});

// ───────────────────────── number sets and font commands ─────────────────────────
test('symbols: blackboard / calligraphic / fraktur / font commands segment as math', () => {
  allMath(['$\\mathbb{R}$', '$\\mathbb{N}$', '$\\mathbb{Z}$', '$\\mathbb{Q}$', '$\\mathbb{C}$',
    '$\\mathbb{R}^n$', '$\\mathcal{F}$', '$\\mathfrak{g}$', '$\\mathrm{d}x$', '$\\mathbf{v}$',
    '$\\mathsf{T}$', '$\\mathtt{code}$', '$\\operatorname{lcm}(a,b)$']);
});

// ───────────────────────── environments (matrix / cases / align) ─────────────────────────
test('symbols: environments — including \\\\ line breaks — stay one math run, byte-exact', () => {
  allMath(['$$\\begin{matrix} a & b \\\\ c & d \\end{matrix}$$',
    '$$\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$$',
    '$$\\begin{bmatrix} x \\\\ y \\end{bmatrix}$$',
    '$$\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}$$',
    '\\[\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}\\]',
    '\\[\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}\\]',
    '$$\\begin{array}{cc} a & b \\\\ c & d \\end{array}$$']);
});

// ───────────────────────── sub/superscript chains ─────────────────────────
test('symbols: sub/superscript chains and stacks segment as math', () => {
  allMath(['$x^2$', '$x_i$', '$x_i^2$', '$x^{2n}$', '$a_{ij}$', '$x^{2^{3}}$', '$a_{i_{j}}$',
    '$\\sum_{i=1}^{n}$', '$\\int_{-\\infty}^{\\infty}$', '$e^{i\\pi} + 1 = 0$',
    '$x_1, x_2, \\dots, x_n$', '${}^{12}\\mathrm{C}$']);
});

// ───────────────────────── the SAME content in every delimiter preserves the symbols ─────────────────────────
test('symbols: identical content across $…$ / $$…$$ / \\(…\\) / \\[…\\] is preserved exactly', () => {
  assert.deepEqual(math('$\\sum_{i=1}^{n} x_i^2$'), ['$\\sum_{i=1}^{n} x_i^2$']);
  assert.deepEqual(math('$$\\sum_{i=1}^{n} x_i^2$$'), ['$$\\sum_{i=1}^{n} x_i^2$$']);
  assert.deepEqual(math('\\(\\sum_{i=1}^{n} x_i^2\\)'), ['\\(\\sum_{i=1}^{n} x_i^2\\)']);
  assert.deepEqual(math('\\[\\sum_{i=1}^{n} x_i^2\\]'), ['\\[\\sum_{i=1}^{n} x_i^2\\]']);
});

// ───────────────────────── escaped symbols & spacing: FIDELITY holds even when segmentation is loose ─────────────────────────
test('symbols: escaped chars and spacing macros round-trip byte-for-byte', () => {
  // these may or may not be classified as math, but the code points are NEVER altered
  for (const t of ['$a = \\$5$', '$50\\%$', '$x \\& y$', '$p \\# q$', '$a \\_ b$',
    '$\\{ x \\}$', '$\\| v \\|$', '$a \\, b$', '$a \\; b$', '$a \\quad b$', '$a \\qquad b$',
    'cost \\$5 not math', '100\\% sure', '$\\{1, 2, 3\\}$', '$f \\colon A \\to B$']) {
    assert.equal(recon(t), true, t);
  }
  // \{ \} are escaped braces but '{'/'}' ARE signal chars, so these DO segment as math:
  assert.deepEqual(math('$\\{ x \\}$'), ['$\\{ x \\}$']);
});

// ───────────────────────── documented edge: a $…$ holding ONLY non-letter commands → prose ─────────────────────────
test('symbols: KNOWN EDGE — $…$ with only non-letter commands reads as prose (KaTeX still renders it)', () => {
  // \% \& \, are not \\[A-Za-z], and there is no ^ _ { } → below the signal threshold.
  assert.deepEqual(math('$50\\%$'), []);
  assert.deepEqual(math('$x \\& y$'), []);
  assert.deepEqual(math('$a \\, b$'), []);
  // …but the same expression with ANY letter command or brace IS math:
  assert.deepEqual(math('$50\\% \\text{done}$'), ['$50\\% \\text{done}$']);
  assert.deepEqual(math('$x \\mathbin{\\&} y$'), ['$x \\mathbin{\\&} y$']);
});

// ───────────────────────── symbol-heavy Hebrew & English prose ─────────────────────────
test('symbols: symbol-heavy math inside Hebrew and English prose', () => {
  const he = 'לכל $\\epsilon > 0$ קיים $\\delta > 0$ כך ש-$|x-a| < \\delta$';
  assert.equal(recon(he), true);
  assert.deepEqual(math(he), ['$\\epsilon > 0$', '$\\delta > 0$', '$|x-a| < \\delta$']);
  const en = 'the sum $\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$ converges';
  assert.equal(recon(en), true);
  assert.deepEqual(math(en), ['$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$']);
  assert.equal(recon('הוכחה: $$\\forall \\epsilon \\, \\exists \\delta : |f(x)-L| < \\epsilon$$ סוף'), true);
});

// ───────────────────────── RAW Unicode math symbols (not LaTeX) are never altered either ─────────────────────────
test('symbols: raw Unicode math glyphs are preserved exactly by the engine', () => {
  // segmentMath leaves non-delimited text untouched (byte-exact)
  for (const t of ['≤ ≥ ≠ ∈ ∉ ⊆ ⊇ ∑ ∏ ∫ ∂ ∇ √ ∞ ± × ÷ ⟨ ⟩ → ⇒ ↦ ∀ ∃ ∅ ℝ ℕ ℤ', '3 ≤ x ≤ 5', 'a → b']) {
    assert.equal(recon(t), true, t);
  }
  // the relation/arrow engines return the EXACT original glyph (offsets index the input)
  assert.deepEqual(relationRuns('3 ≤ 5').map(([s, e]) => '3 ≤ 5'.slice(s, e)), ['3 ≤ 5']);
  const t = 'א → ב';
  assert.deepEqual(arrowFlipOffsets(t).map((i) => t[i]), ['→']); // the glyph itself, unchanged
});
