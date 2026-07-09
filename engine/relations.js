'use strict';
// engine/relations.js — classify raw Unicode math RELATION symbols that the Unicode bidi
// algorithm itself MIRRORS in an RTL context (§8.F), and find the EXTENT of the comparison
// EXPRESSION each one belongs to. UAX#9 rule L4 renders any character with Bidi_Mirrored=Yes
// as its mirror glyph at an odd (RTL) embedding level, and N1/N2 then REORDER the surrounding
// number/letter operands — so a Hebrew line containing "0 < x ≤ 4" reads "x ≤ 4 < 0": the
// operators flip AND the operands are permuted, changing the math. We never touch the code
// point (fidelity §3.6); the DOM wraps the whole expression in an LTR-isolated span so the
// browser renders upright glyphs AND keeps the operands in their original left-to-right order.
//
// Why the WHOLE expression and not each symbol: isolating only the operator fixes the glyph
// but NOT the operand order — measured, "3 < 5" with just "<" isolated still renders "5 < 3",
// and "0 < x ≤ 4" still renders "x ≤ 4 < 0". Isolating the maximal run `TERM (REL TERM)+`
// puts the entire comparison at one even embedding level, so it reads "0 < x ≤ 4" correctly.
//
// The mirror set is exactly: General_Category Sm (math symbol) AND Bidi_Mirrored=Yes — the
// comparison family (< ≤ ≪ ≮ …), set/order relations (∈ ⊂ ⊆ ≺ …), and ≠ ≈ ≅. PAIRED BRACKETS
// (Ps/Pe: ( ) [ ] { } ⟨ ⟩) are EXCLUDED: their RTL mirroring is CORRECT and intended by Unicode
// (§8.F — "leave to UBA"). ARROWS are excluded too (Bidi_Mirrored=No — the DOM flips those
// visually instead). PURE; classifies by code point, astral-safe (offsets index the input).

const SM = /\p{Sm}/u;
const MIRRORED = /\p{Bidi_Mirrored}/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const DIGITS = /[0-9٠-٩۰-۹]/; // EN / Arabic-Indic / Persian — gates arithmetic-run isolation

function isMirroredMathRel(cp) {
  const ch = String.fromCodePoint(cp);
  return SM.test(ch) && MIRRORED.test(ch);
}

function hasMirroredMathRel(str) {
  for (const ch of str) {
    if (isMirroredMathRel(ch.codePointAt(0))) return true;
  }
  return false;
}

// Fast over-approximation: could `str` hold a run that relationRuns would isolate? True for any
// mirror relation (a comparison mirrors regardless of operands), or an arithmetic operator
// together with a digit (the all-weak case that reorders, "15 + 7 = 22"). Used by the DOM as a
// cheap gate before the full parse. Short-circuits.
function hasMathRun(str) {
  if (!str) return false;
  let op = false;
  let weak = false;
  let bracket = false;
  let comma = false;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (isMirroredMathRel(cp)) return true;
    if (isPrefixOp(cp)) return true; // a prefix op (√ ∑ ∀ ¬ …) is an unambiguous math signal
    if (isArithOp(cp) || isSetOp(cp)) op = true;
    else if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0x660 && cp <= 0x669) || (cp >= 0x6f0 && cp <= 0x6f9)) weak = true; // digit
    else if (cp === 0x2205 || cp === 0x22a4 || cp === 0x22a5) weak = true; // ∅ ⊤ ⊥
    if (cp === 0x5b || cp === 0x28 || cp === 0x7b || cp === 0x27e8) bracket = true; // [ ( { ⟨
    else if (cp === 0x2c) comma = true; // ,
    // an arith/set op over a weak operand ("15 + 7 = 22", "A ∩ B = ∅") OR a bracket group with a
    // comma/operator ("[a, b]", "(a + b)²", "(a, b] ∪ [c, d)"). All over-approximations — relationRuns
    // makes the precise call (and returns [] for prose), so a loose gate only costs an extra parse.
    if ((op && weak) || (bracket && (comma || op))) return true;
  }
  // a subscripted limit/extremum name ("lim_{n→∞} aₙ") can be the ONLY signal on its line —
  // no digit, no operator, no comma — yet relationRuns seeds it via LIMIT_RE. Without this the
  // gate skipped the parse and the limit never isolated (found by the prefix-fuzz suite).
  return LIMIT_GATE.test(str);
}
// Non-global twin of LIMIT_RE (a bare .test() must not carry /g lastIndex state).
const LIMIT_GATE = /(?<![A-Za-z])(?:limsup|liminf|argmax|argmin|lim|sup|inf|max|min|det|gcd|lcm)_/;

// `<` and `>` are DUAL-USE: a comparison operator ("3 < 5") AND an HTML-tag delimiter
// ("<div>"). A comparison must be isolated (so it doesn't read "3 > 5"); a TAG must NOT — its
// brackets sit at the ends, and isolating them un-mirrors the glyphs but RTL still swaps their
// positions, so "<div>" would read ">div<". A bare tag is rendered correctly by UBA on its own
// (glyph-mirror and position-swap cancel), so we leave tag brackets alone. This regex matches a
// tag run: `<` or `</` immediately followed by a tag name, up to its closing `>` (<div>,
// </div>, <br/>, <a href="x">). A `<` with a space or a digit after it is NOT a tag, so real
// comparisons ("3 < 5", "a < b", "x<y") still isolate.
const TAG_RUN = /<\/?[A-Za-z][^<>]*>/g;

// A TERM (comparison operand) char: a Latin or Greek letter, an EN/Arabic-Indic/Persian digit,
// or a decimal dot. NOT a Hebrew/Arabic letter (that is prose and ends the expression), NOT a
// space, NOT a sign (the sign is attached separately, only to a number, at a word boundary).
function isTermChar(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0x30 && c <= 0x39) return true;                 // 0-9
  if (c >= 0x41 && c <= 0x5a) return true;                 // A-Z
  if (c >= 0x61 && c <= 0x7a) return true;                 // a-z
  if (c >= 0x0660 && c <= 0x0669) return true;             // Arabic-Indic digits
  if (c >= 0x06f0 && c <= 0x06f9) return true;             // Persian digits
  if (c >= 0x0370 && c <= 0x03ff) return true;             // Greek (π, θ, Σ, …)
  if (c >= 0x2100 && c <= 0x214f) return true;             // Letterlike (ℕ ℤ ℝ ℚ ℂ …)
  if (c === 0xb2 || c === 0xb3 || c === 0xb9) return true; // ² ³ ¹ (Latin-1 superscripts)
  if (c >= 0x2070 && c <= 0x209f) return true;             // super/subscripts (x² aₙ x⁻¹ 2³ …)
  if (c === 0x221e) return true;                           // ∞ (a value: "x ≤ ∞", "(0, ∞)")
  if (c === 0x2205) return true;                           // ∅ (empty set: "A ∩ B = ∅")
  return false; // NB: '.' is handled by the scanners as a decimal only BETWEEN term chars,
                // so a sentence-final period ("7 > 2.") is not swallowed into the operand.
}
function isDigitCh(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 0x30 && c <= 0x39) || (c >= 0x0660 && c <= 0x0669) || (c >= 0x06f0 && c <= 0x06f9);
}
function isSign(ch) {
  return ch === '+' || ch === '-' || ch === '−'; // + - −(U+2212)
}
// Currency that can prefix or suffix a number operand ($5, 5₪). isSuffix also covers %/°/!.
const CURRENCY = '$₪€£¥¢₹₣';
function isCurrency(ch) { return ch !== '' && CURRENCY.indexOf(ch) !== -1; }
function isSuffix(ch) { return ch === '%' || ch === '٪' || ch === '°' || ch === '!' || isCurrency(ch); } // 50% ٥٠٪ 10° 5₪ n!
// A precomposed super/subscript glyph: ² ³ ¹ and the super/subscript block — a power/index that
// can trail a BRACKET group ("(a+b)²", "(1+1/n)ⁿ"), where it is NOT a plain term char of a base.
function isScriptChar(ch) {
  const c = ch.charCodeAt(0);
  return c === 0xb2 || c === 0xb3 || c === 0xb9 || (c >= 0x2070 && c <= 0x209f);
}
// A DERIVATIVE PRIME decorating an identifier: f'(x), x'', θ′ — ASCII apostrophe, the markdown
// smart quote ’ (renderers emit it for '), and the real primes ′ ″ ‴. Without it the run seeded
// at "=" started at "(x)" and left "f'" outside the LTR island, so RTL reordered the function
// name away from its own call (the "result - f'(x) = 12x³ + 10x - 7" report). A prime binds
// ONLY after a letter-ish base (isPrimeBase): never after a digit — a quote hugging a number
// ("'15 + 7 = 22'") is a QUOTE, and swallowing it would isolate one quote of the pair — and
// never after Hebrew/Arabic (the geresh in "הקאץ'" is prose; isTermChar already excludes RTL).
function isPrime(ch) {
  return ch === "'" || ch === '’' || ch === '′' || ch === '″' || ch === '‴';
}
function isPrimeBase(ch) {
  return isTermChar(ch) && !isDigitCh(ch);
}
// '.'/',' are number-internal separators (3.14, 1,000) — counted ONLY between two digits, so a
// sentence period ("2.") and a list comma ("x, y") never join an operand. The Arabic-script
// locales use ٫ (U+066B decimal) and ٬ (U+066C thousands) — without them "٥٫٥ < ٦" isolated
// "٥ < ٦", CUTTING the number in half across the isolation boundary (worse than not isolating).
// ':' joins digits for clock times and ratios — "9:00-17:00" used to isolate just "00-17",
// cutting BOTH ends; a prose colon ("שאלה: 5") has no digit on its left and never joins.
function isSep(ch) { return ch === '.' || ch === ',' || ch === ':' || ch === '٫' || ch === '٬'; }
// ARITHMETIC operators: + - − × ÷ = · ∗ ⋅ ± ∓ * / . NOT Bidi_Mirrored (their glyphs are fine in
// RTL), but they still REORDER weak number operands — "15 + 7 = 22" renders "22 = 7 + 15" in an
// RTL paragraph because the digits are weak. So an all-number arithmetic run must be isolated LTR
// just like a comparison. These also CHAIN operands inside an expression ("15 + 7 = 22").
function isArithOp(cp) {
  return cp === 0x2b /* + */ || cp === 0x2d /* - */ || cp === 0x2212 /* − */ ||
    cp === 0xd7 /* × */ || cp === 0xf7 /* ÷ */ || cp === 0x3d /* = */ || cp === 0xb7 /* · */ ||
    cp === 0x2217 /* ∗ */ || cp === 0x22c5 /* ⋅ */ || cp === 0xb1 /* ± */ || cp === 0x2213 /* ∓ */ ||
    cp === 0x2a /* * */ || cp === 0x2f /* / */ || isSymRel(cp);
}
// SYMMETRIC relations that are NOT Bidi_Mirrored (their glyph is fine in RTL) but, like '=', REORDER
// weak operands — "17 ≡ 2 (mod 5)" renders "2 ≡ 17". The mirror seed already covers the mirrored
// relations (< ≤ ∈ ≠ ≈ ≅ …); this is the equality/congruence family it misses: ≡ ∼ ≃ ≐ ≜ ≝ ≑ ≒.
function isSymRel(cp) {
  return cp === 0x2261 /* ≡ */ || cp === 0x223c /* ∼ */ || cp === 0x2243 /* ≃ */ ||
    cp === 0x2250 /* ≐ */ || cp === 0x225c /* ≜ */ || cp === 0x225d /* ≝ */ ||
    cp === 0x2251 /* ≑ */ || cp === 0x2252 /* ≒ */;
}
// BINARY set operators ∩ ∪ ∖ ⊎ ⊓ ⊔ — symmetric (NOT Bidi_Mirrored), but they chain set operands
// and, like arithmetic, an all-weak run reorders ("A ∩ B = ∅" → "∅ = B ∩ A"). They seed/chain only
// when the run also carries something that reorders (a bracket / digit / ∅ / prefix), so a bare,
// letter-anchored "A ∪ B" (which renders fine) is left alone.
function isSetOp(cp) {
  return cp === 0x2229 /* ∩ */ || cp === 0x222a /* ∪ */ || cp === 0x2216 /* ∖ */ ||
    cp === 0x228e /* ⊎ */ || cp === 0x2293 /* ⊓ */ || cp === 0x2294 /* ⊔ */;
}
// A connector that may CHAIN terms inside one expression: any mirror relation OR arithmetic OR set
// operator. Tag `< >` are filtered by the caller via inTag.
function isConnectorCp(cp) {
  return isArithOp(cp) || isSetOp(cp) || isMirroredMathRel(cp);
}
// A "weak nullary" math value that reorders in RTL on its own (like a digit): ∅ ⊤ ⊥. Used to gate
// an arithmetic/set run that has no digit/bracket but still scrambles ("A ∩ B = ∅").
const WEAKVAL_RE = /[∅⊤⊥]/;
// SUBSCRIPTED limit / extremum operators — a multi-LETTER name (not a single prefix symbol) with a
// "_" subscript bound, e.g. "lim_{x→0}", "sup_{n}", "max_{i}". The name + bound + the space-separated
// BODY are ONE expression: otherwise the operator reorders past the isolated body ("lim_{x→0} f=1"
// renders "f=1 lim_{x→0}") AND the arrow inside the bound flips ("x→0" → "x←0"). Word-boundary
// before the name (lookbehind), and it must be followed by "_".
const LIMIT_RE = /(?<![A-Za-z])(limsup|liminf|argmax|argmin|lim|sup|inf|max|min|det|gcd|lcm)_/g;
// PREFIX math operators: a symbol whose operand is on the RIGHT — roots √∛∜, big operators
// ∑∏∐∫∮… (sum/product/integral), quantifiers ∀∃∄, logical-not ¬, differential ∇∂, and the
// n-ary logical/set/operators ⋀⋁⋂⋃ ⨀…⨉. In an RTL line the symbol is neutral and the UBA places
// it AFTER its operand ("∑ x_i" → "x_i ∑", "√(a²+b²)" → "(a²+b²)√", "¬p" → "p¬"); isolating the
// "PREFIX OPERAND" run LTR keeps the symbol on its left where it belongs. These are unambiguous
// math, so (unlike arithmetic) they need no digit to seed — but a prefix with no operand to its
// right (a stray ∑) and a prefix over Hebrew prose ("∑ גדול") never form a run.
function isPrefixOp(cp) {
  return (cp >= 0x221a && cp <= 0x221c)                 // √ ∛ ∜  roots
    || cp === 0x2211                                    // ∑  summation
    || cp === 0x220f || cp === 0x2210                   // ∏ ∐  product / coproduct
    || (cp >= 0x222b && cp <= 0x2233)                   // ∫ ∬ ∭ ∮ ∯ ∰ ∱ ∲ ∳  integrals
    || cp === 0x2200 || cp === 0x2203 || cp === 0x2204  // ∀ ∃ ∄  quantifiers
    || cp === 0x00ac                                    // ¬  logical not
    || cp === 0x2207 || cp === 0x2202                   // ∇ ∂  nabla / partial-differential
    || (cp >= 0x22c0 && cp <= 0x22c3)                   // ⋀ ⋁ ⋂ ⋃  n-ary logical / set
    || (cp >= 0x2a00 && cp <= 0x2a09);                  // ⨀ ⨁ ⨂ ⨃ ⨄ ⨅ ⨆ ⨇ ⨈ ⨉  n-ary operators
}
// Same set as a regex, to test a whole run-slice for "carries a prefix op" (a math signal that,
// like a digit, justifies isolating an otherwise letters-only arithmetic run such as "c = √x").
const PREFIX_RE = /[\u00ac\u221a-\u221c\u2211\u220f\u2210\u222b-\u2233\u2200\u2203\u2204\u2207\u2202\u22c0-\u22c3\u2a00-\u2a09]/;
// Strong-RTL guard for bracket groups: a bracket whose content is Hebrew/Arabic prose ("(הערה)")
// must NEVER be forced LTR — that would scramble the prose. Hebrew, Arabic, presentation forms.
const STRONG_RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
// A prose word inside brackets: ≥3 consecutive Latin letters ("(see note)") — distinguishes prose
// from math variables (1–2 letters: "(a, b)") and numbers, so prose parentheticals stay untouched.
const WORD3_RE = /[A-Za-z]{3,}/;
const OPENERS = '([{\u27e8\u230a\u2308\u27e6';   // ( [ { ⟨ ⌊(floor) ⌈(ceil) ⟦
const CLOSERS = ')]}\u27e9\u230b\u2309\u27e7';   // ) ] } ⟩ ⌋ ⌉ ⟧

// The maximal comparison AND arithmetic EXPRESSIONS to ISOLATE in `text`, as UTF-16 [start, end)
// ranges. Seeds are every mirror-relation char (except a `<`/`>` of an HTML tag) and every BINARY
// arithmetic operator over a numeric run ("15 + 7 = 22" reorders in RTL too); each is grown LEFT
// and RIGHT over `(WS? TERM)(WS? CONNECTOR WS? TERM)*` — so a whole chain "0 < x ≤ 4" or
// "15 + 7 = 22" becomes one run; a lone relation with no operand on either side (e.g. "הסימן < מציין")
// stays a single char. Overlapping/adjacent runs (the seeds of one chain) are merged. A leading
// sign is pulled into a numeric operand ("-5 < x" → the run starts at the "-") only at a word
// boundary, exactly as numbers.signedNumberRuns decides, so the sign renders with its number.
// PURE; astral-safe (offsets index the input string).
function relationRuns(text) {
  const out = [];
  if (!text) return out;
  const len = text.length;
  const ch = (i) => text.charAt(i);
  // Chain-growth whitespace includes NBSP (U+00A0), narrow NBSP (U+202F) and thin space
  // (U+2009) — rendered markdown/KaTeX emit these between operands; without them the chain
  // broke at the space and only the bare operator isolated (glyph fixed, operands still
  // reordered in RTL). NOT '\n': a newline ends the expression.
  const isWS = (c) => c === ' ' || c === '\t' || c === '\u00a0' || c === '\u202f' || c === '\u2009';

  // HTML-tag spans whose < > must not act as relations/connectors.
  const tags = [];
  TAG_RUN.lastIndex = 0;
  let m;
  while ((m = TAG_RUN.exec(text))) tags.push([m.index, m.index + m[0].length]);
  const inTag = (i) => {
    for (let k = 0; k < tags.length; k++) if (i >= tags[k][0] && i < tags[k][1]) return true;
    return false;
  };

  // Balanced-bracket matchers (over ( ) [ ] { } ⟨ ⟩, nesting-aware), so a bracketed sub-expression
  // is ONE operand: "(3 × 5) + 2 = 17", "[a, b]", "f(x)". Without them the bracket group splits off
  // and the line scrambles. bracketSpanEnd: from an opener at i → the index past its matching
  // closer, or i if unbalanced. bracketSpanLeft: from a closer at i → its matching opener index,
  // or i+1 if unbalanced. Mixed pairs are allowed for half-open intervals — "[a, b)" matches.
  // All pairs are resolved in ONE stack pass up front — the per-call depth scan was O(n) and made
  // the seed loop QUADRATIC on unmatched openers: 20k stray "(" before a comparison took ~2s
  // (a renderer freeze); the same depth counting via a stack matches pair-for-pair in O(n).
  const matchFwd = new Map(); // opener index → index PAST its matching closer
  const matchBwd = new Map(); // closer index → its matching opener index
  {
    const stack = [];
    for (let j = 0; j < len; j++) {
      if (OPENERS.indexOf(ch(j)) !== -1) stack.push(j);
      else if (CLOSERS.indexOf(ch(j)) !== -1 && stack.length) {
        const o = stack.pop();
        matchFwd.set(o, j + 1);
        matchBwd.set(j, o);
      }
    }
  }
  function bracketSpanEnd(i) { const e = matchFwd.get(i); return e === undefined ? i : e; }
  function bracketSpanLeft(i) { const o = matchBwd.get(i); return o === undefined ? i + 1 : o; }
  // A STANDALONE "math bracket" group to isolate (no surrounding operator to seed it): a balanced
  // bracket whose content carries a COMMA or a math CONNECTOR/PREFIX — an interval/tuple/finite-set
  // or a grouped expression: "[a, b]", "(0, 1]", "(x, y)", "{1, 2, 3}", "(3 × 5)", "(a + b)". It is
  // NOT a math bracket if the content is RTL prose ("(הערה)") or holds a ≥3-letter Latin word
  // ("(see note)") — those stay untouched. Returns the index past the closer, or `open` if not.
  function mathBracketEnd(open) {
    if (OPENERS.indexOf(ch(open)) === -1) return open;
    const close = bracketSpanEnd(open);
    if (close === open) return open;
    const inner = text.slice(open + 1, close - 1);
    if (!inner.trim() || STRONG_RTL_RE.test(inner) || WORD3_RE.test(inner)) return open;
    for (const c of inner) {
      const cp = c.codePointAt(0);
      if (cp === 0x2c || isConnectorCp(cp) || isPrefixOp(cp)) return close; // a math signal inside
    }
    return open;
  }
  // A sub/superscript decoration "^ARG" / "_ARG" — its argument is a braced/paren group "{i=1}",
  // "(n+1)", an optionally-signed term "2", "-1", "ij", or a single char. Returns the index past the
  // argument, or i if `i` is not at a "^"/"_" with a consumable argument. Powers literal LaTeX
  // sub/superscripts ("∑_{i=1}^{n}", "x^{2}", "a_{ij}", "∫_0^1") on top of the precomposed forms (x²).
  function scriptArgEnd(i) {
    if (ch(i) !== '^' && ch(i) !== '_') return i;
    let j = i + 1;
    if (j >= len) return i;
    if (OPENERS.indexOf(ch(j)) !== -1) { const c = bracketSpanEnd(j); return c > j ? c : i; } // _{…}
    if (isSign(ch(j))) j += 1;            // ^-1
    const b0 = j;
    while (j < len && isTermChar(ch(j))) j += 1; // ^2, _ij, ^10
    return j > b0 ? j : i;
  }

  // Absolute-value / norm bars |…|. The bar is the SAME glyph open & close, so pair the bars that
  // are NOT inside a bracket group, sequentially (1st-2nd, 3rd-4th, …); keep a pair only if its
  // content is math-ish (no RTL prose, no ≥3-letter Latin word). A "|" inside parens/braces is left
  // to that group (conditional probability "P(A | B)", set-builder "{x | x>0}"). These act like a
  // bracket operand so "|x − 3| < 5" and "|x| + 1 < 5" and "|f(x) − f(a)| < δ" isolate whole.
  const absSpans = [];
  for (const bar of ['|', '‖']) { // | (abs value) and ‖ (norm) — paired within their own kind
    let depth = 0;
    const bars = [];
    for (let j = 0; j < len; j++) {
      const c = ch(j);
      if (OPENERS.indexOf(c) !== -1) depth += 1;
      else if (CLOSERS.indexOf(c) !== -1) { if (depth > 0) depth -= 1; }
      else if (c === bar && depth === 0) bars.push(j);
    }
    for (let b = 0; b + 1 < bars.length; b += 2) {
      const o = bars[b];
      const c = bars[b + 1];
      const inner = text.slice(o + 1, c);
      if (inner.trim() && !STRONG_RTL_RE.test(inner) && !WORD3_RE.test(inner)) absSpans.push([o, c + 1]);
    }
  }
  const absOpenEnd = (i) => { for (let k = 0; k < absSpans.length; k++) if (absSpans[k][0] === i) return absSpans[k][1]; return -1; };
  const absCloseStart = (i) => { for (let k = 0; k < absSpans.length; k++) if (absSpans[k][1] - 1 === i) return absSpans[k][0]; return -1; };

  // Start index of the TERM ending at `end` (exclusive), '' if none. Attaches a leading sign
  // when the term is a number and the sign sits at a word boundary (not after a letter/number).
  // An OPERAND is: optional leading currency, optional sign (on a number, at a word boundary),
  // a BODY of letters/digits with '.'/',' separators between digits, and optional trailing
  // %/°/currency. termStartLeft returns the operand's start index for the operand ending at
  // `end` (exclusive), or `end` if there is none. Scans right-to-left.
  function termStartLeft(end) {
    let i = end;
    while (i > 0 && isSuffix(ch(i - 1))) i -= 1; // trailing suffix(es): 50%, 10°, 5₪, n!
    while (i > 0 && isScriptChar(ch(i - 1))) i -= 1; // a power on a bracket group: "(a+b)²", "(1+1/n)ⁿ"
    // a |…| absolute-value / norm group ending here is ONE operand: "|x − 3|", "|f(x) − f(a)|"
    if (i > 0) { const s = absCloseStart(i - 1); if (s >= 0) return s; }
    // a bracket group / function-call args ending here is ONE operand: "(3 × 5)", "[a, b]", "f(x)"
    if (i > 0 && CLOSERS.indexOf(ch(i - 1)) !== -1) {
      const open = bracketSpanLeft(i - 1);
      // NEVER attach a bracket group holding Hebrew/Arabic prose ("(שתי מילים)") — LTR-isolating
      // it would reverse the words (§3.2 hard rule). Same guard as mathBracketEnd/absSpans.
      if (open < i - 1 && !STRONG_RTL_RE.test(text.slice(open + 1, i - 1))) {
        let s = open;
        // a leading function-call name (f(x), sin(θ)), a primed one (f'(x), f''(x)), OR a
        // script base (x^{2}, a_{ij})
        for (;;) {
          if (s > 0 && isTermChar(ch(s - 1))) { s -= 1; continue; }
          if (s > 1 && isPrime(ch(s - 1))) { // a prime RUN must sit on a letter-ish base
            let q = s - 1;
            while (q > 0 && isPrime(ch(q - 1))) q -= 1;
            if (q > 0 && isPrimeBase(ch(q - 1))) { s = q; continue; }
          }
          if (s > 1 && (ch(s - 1) === '^' || ch(s - 1) === '_') && isTermChar(ch(s - 2))) { s -= 2; continue; }
          break;
        }
        return s;
      }
    }
    const bodyEnd = i;
    for (;;) {
      if (i > 0 && isTermChar(ch(i - 1))) { i -= 1; continue; }
      // a derivative-prime run on a letter-ish base is part of the operand: x', f'' (§ isPrime)
      if (i > 1 && isPrime(ch(i - 1))) {
        let q = i - 1;
        while (q > 0 && isPrime(ch(q - 1))) q -= 1;
        if (q > 0 && isPrimeBase(ch(q - 1))) { i = q; continue; }
      }
      // a separator joins the number only BETWEEN two digits (3.14, 1,000)
      if (i > 1 && i < bodyEnd && isSep(ch(i - 1)) && isDigitCh(ch(i - 2)) && isDigitCh(ch(i))) {
        i -= 1; continue;
      }
      // ° (unit), ^ (exponent), _ (subscript) bind two term chars into ONE operand (25°C, 2^3,
      // x_i); ° may also cross one SI space (25 °C).
      if (i < bodyEnd && (ch(i - 1) === '°' || ch(i - 1) === '^' || ch(i - 1) === '_') && isTermChar(ch(i))) {
        if (i > 1 && isTermChar(ch(i - 2))) { i -= 1; continue; }                       // 25°C / 2^3
        if (ch(i - 1) === '°' && i > 2 && ch(i - 2) === ' ' && isTermChar(ch(i - 3))) { i -= 2; continue; } // 25 °C
      }
      break;
    }
    if (i === bodyEnd) return end; // no body → the suffixes (if any) weren't an operand
    if (i > 0 && isCurrency(ch(i - 1))) i -= 1; // leading currency: $5, ₪5
    if (i > 0 && isSign(ch(i - 1)) && (isDigitCh(ch(i)) || isCurrency(ch(i)))) {
      if (i - 1 === 0 || !LETTER_OR_NUMBER.test(ch(i - 2))) i -= 1; // sign at a boundary: -5, -$5
    }
    // a signed EXPONENT/subscript: in "10^-9" the sign hangs off a ^/_ that binds a base on its
    // left — rebind through the script char so the operand is the WHOLE power ("10^-9"), not
    // "-9" with "10^" cut off outside the isolation boundary. (termEndRight already does this
    // rightward via scriptArgEnd's sign handling.)
    if (i > 1 && (ch(i - 1) === '^' || ch(i - 1) === '_') && isTermChar(ch(i - 2))) {
      const base = termStartLeft(i - 1);
      if (base < i - 1) return base;
    }
    return i;
  }
  // Mirror of termStartLeft: the operand's end index (exclusive) for the operand starting at
  // `start`, or `start` if there is none. Scans left-to-right.
  function termEndRight(start) {
    let i = start;
    // a chain of PREFIX operators leads its operand on the right: "√x", "∑ x_i", "¬p", "∫ f",
    // "= √(a²+b²)". Consume the prefix(es) (a prefix may be followed by one SI-style space), then
    // the operand after them — so a binary op's right side can be a prefix expression.
    {
      let k = i;
      while (k < len && isPrefixOp(text.codePointAt(k))) {
        k += text.codePointAt(k) > 0xffff ? 2 : 1;
        while (k < len && isWS(ch(k))) k += 1;
      }
      if (k > i) { const e = termEndRight(k); return e > k ? e : start; } // prefix + operand, else none
    }
    // a LEADING sub/superscript decoration is a big-operator's limits ("∑_{i=1}^{n} i²", "∫_0^1 f"):
    // consume the script chain, then (across an optional space) the summand/integrand it acts on.
    if (ch(i) === '^' || ch(i) === '_') {
      let k = i;
      for (;;) { const e = scriptArgEnd(k); if (e > k) k = e; else break; }
      if (k > i) {
        let j = k;
        while (j < len && isWS(ch(j))) j += 1;
        const body = termEndRight(j);
        return body > j ? body : k;
      }
    }
    if (isSign(ch(i)) && i + 1 < len && (isDigitCh(ch(i + 1)) || isCurrency(ch(i + 1)))) i += 1; // -5, -$5
    if (isCurrency(ch(i))) i += 1; // leading currency: $5
    { const e = absOpenEnd(i); if (e > i) { i = e; while (i < len && isSuffix(ch(i))) i += 1; return i; } } // |x − 3|
    // a bracket group is ONE operand: "(3 × 5)", "(a + b)", "[a, b]", "{1, 2}"
    if (OPENERS.indexOf(ch(i)) !== -1) {
      const open = i;
      const close = bracketSpanEnd(i);
      // same hard-rule guard: a group holding Hebrew/Arabic prose is not an operand
      if (close > i && !STRONG_RTL_RE.test(text.slice(open + 1, close - 1))) {
        i = close;
        while (i < len && isSuffix(ch(i))) i += 1;
        i = mathBracketPowerEnd(open, close, i);
        return i;
      }
    }
    const body0 = i;
    for (;;) {
      if (i < len && isTermChar(ch(i))) { i += 1; continue; }
      // a derivative-prime run after a letter-ish base joins the operand: f'(x), x'' (§ isPrime)
      if (i > body0 && i < len && isPrime(ch(i)) && (isPrimeBase(ch(i - 1)) || isPrime(ch(i - 1)))) {
        i += 1; continue;
      }
      if (i > body0 && isSep(ch(i)) && isDigitCh(ch(i - 1)) && i + 1 < len && isDigitCh(ch(i + 1))) {
        i += 1; continue;
      }
      // ° binds a unit letter (25°C, also across one SI space "25 °C"); ^ _ bind a sub/superscript
      // — a single char (2^3, x_i) OR a braced/paren group (x^{2}, a_{ij}) via scriptArgEnd.
      if (i > body0 && ch(i) === '°' && i + 1 < len && isTermChar(ch(i + 1))) { i += 1; continue; }
      if (i > body0 && (ch(i) === '^' || ch(i) === '_')) { const e = scriptArgEnd(i); if (e > i) { i = e; continue; } }
      if (i > body0 && ch(i) === ' ' && ch(i + 1) === '°' && i + 2 < len && isTermChar(ch(i + 2))) {
        i += 1; continue;
      }
      break;
    }
    if (i === body0) return start; // a lone currency/sign with no number body → not an operand
    // a function call: an identifier immediately followed by a bracket group — "f(x)", "sin(θ)"
    if (OPENERS.indexOf(ch(i)) !== -1) {
      const open = i;
      const close = bracketSpanEnd(i);
      // same hard-rule guard: a group holding Hebrew/Arabic prose is not an operand
      if (close > i && !STRONG_RTL_RE.test(text.slice(open + 1, close - 1))) {
        i = close;
        while (i < len && isSuffix(ch(i))) i += 1; // trailing suffix(es): %, °, currency
        i = mathBracketPowerEnd(open, close, i);
        return i;
      }
    }
    while (i < len && isSuffix(ch(i))) i += 1; // trailing suffix(es): %, °, currency
    return i;
  }
  // A MATH bracket's trailing precomposed power belongs to its operand ("(a+b)²", "f(a+b)²").
  // The STANDALONE bracket seed extends over these script chars; before seed-skipping, that
  // seed also fired INSIDE a connector run and the merge added the power to the union. Now
  // that inner seeds are skipped, the operand scanner must include it itself — gated on the
  // exact same mathBracketEnd condition, and taking the max with the suffix end (they never
  // both apply: script chars and suffixes are disjoint sets), so runs stay byte-identical to
  // the pre-skip union. Plain calls like "f(x)" are NOT math brackets → unchanged.
  function mathBracketPowerEnd(open, close, suffixEnd) {
    if (mathBracketEnd(open) <= open) return suffixEnd;
    let e = close;
    while (e < len && isScriptChar(ch(e))) e += 1;
    return e > suffixEnd ? e : suffixEnd;
  }
  // Grow the run leftward from the seed over (CONNECTOR WS? TERM) pairs.
  function expandLeft(relStart) {
    let runStart = relStart;
    let cursor = relStart;
    for (;;) {
      let j = cursor;
      while (j > 0 && isWS(ch(j - 1))) j -= 1;
      const ts = termStartLeft(j);
      if (ts === j) break; // no operand to the left → stop
      runStart = ts;
      let k = ts;
      while (k > 0 && isWS(ch(k - 1))) k -= 1;
      if (k > 0 && isConnectorCp(text.codePointAt(k - 1)) && !inTag(k - 1)) cursor = k - 1;
      else break;
    }
    return runStart;
  }
  // Grow the run rightward from the seed over (WS? TERM CONNECTOR) pairs.
  function expandRight(relEnd) {
    let runEnd = relEnd;
    let cursor = relEnd;
    for (;;) {
      let j = cursor;
      while (j < len && isWS(ch(j))) j += 1;
      const te = termEndRight(j);
      if (te === j) break; // no operand to the right → stop
      runEnd = te;
      let k = te;
      while (k < len && isWS(ch(k))) k += 1;
      const cp = k < len ? text.codePointAt(k) : 0;
      if (cp && isConnectorCp(cp) && !inTag(k)) cursor = k + (cp > 0xffff ? 2 : 1);
      else break;
    }
    return runEnd;
  }

  // Seed at every mirror-relation (skip tag brackets), every PREFIX operator, every standalone
  // math bracket, and every BINARY arithmetic operator; grow each to the whole expression.
  // When a seed grows into a run, scanning RESUMES AT THE RUN'S END: every connector inside the
  // run expands to a sub-span of it (chain growth is anchor-independent, and brackets are not
  // connectors, so an inner seed can't escape), so re-expanding each one is pure duplicate work —
  // quadratic on a long chain ("1+1+1+…" froze the renderer for seconds).
  const runs = [];
  for (let i = 0; i < len; ) {
    const cp = text.codePointAt(i);
    const w = cp > 0xffff ? 2 : 1;
    if (isMirroredMathRel(cp)) {
      const c = text[i];
      if (!((c === '<' || c === '>') && inTag(i))) {
        const e = expandRight(i + w);
        runs.push([expandLeft(i), e]);
        if (e > i + w) { i = e; continue; }
      }
    } else if (isPrefixOp(cp)) {
      // A prefix operator's operand is on the RIGHT ("∑ x_i", "√(a²+b²)", "∀x ∈ ℝ", "¬p"). Isolate
      // [prefix … operand]; needs a right operand (a stray ∑, or ∑ before Hebrew prose, makes none).
      const e = expandRight(i + w);
      if (e > i + w) {
        runs.push([expandLeft(i), e]);
        i = e;
        continue;
      }
    } else if (OPENERS.indexOf(text[i]) !== -1) {
      // A STANDALONE bracket group with math content ("[a, b]", "(0, ∞)", "(3 × 5)", "{1, 2, 3}").
      let e = mathBracketEnd(i);
      if (e > i) {
        while (e < len && isScriptChar(ch(e))) e += 1; // a trailing power: "(a+b)²", "(1+1/n)ⁿ"
        let s = i;
        for (;;) { // a leading function name, primes included: "f(x, y)", "f'(a, b)"
          if (s > 0 && isTermChar(ch(s - 1))) { s -= 1; continue; }
          if (s > 1 && isPrime(ch(s - 1))) {
            let q = s - 1;
            while (q > 0 && isPrime(ch(q - 1))) q -= 1;
            if (q > 0 && isPrimeBase(ch(q - 1))) { s = q; continue; }
          }
          break;
        }
        runs.push([s, e]);
        i = e;
        continue;
      }
    } else if (isArithOp(cp) || isSetOp(cp)) {
      // An arithmetic/set operator seeds ONLY as a BINARY op (operands on both sides) whose run holds
      // something that REORDERS: a digit ("15 + 7 = 22"), a prefix op ("c = √x"), a weak value ∅
      // ("A ∩ B = ∅"), or a math bracket — a "(…)"/"[…]" with an operator/comma inside, which itself
      // scrambles ("(a+b)² = c" reads "c = (a+b)²", "(a, b] ∪ [c, d)" reverses). A leading SIGN (+ - −
      // at a word boundary before a digit: "-5", "low -40°C") is NOT binary — it belongs to its
      // number (signedNumberRuns owns it). A bare letter-anchored run ("a = b", "A ∪ B") never
      // reorders and stays out.
      const c = text[i];
      const sign = (c === '+' || c === '-' || c === '−')
        && (i === 0 || !LETTER_OR_NUMBER.test(text[i - 1])) && DIGITS.test(text[i + w] || '');
      // …and never seed INSIDE an HTML tag ("<img width=100>") — the whole tag is left to UBA
      // exactly like its < > brackets (isolating "width=100" fragments the tag run).
      if (!sign && !inTag(i)) {
        const s = expandLeft(i);
        const e = expandRight(i + w);
        const slice = text.slice(s, e);
        let hasMB = false;
        for (let p = s; p < e && !hasMB; p++) if (OPENERS.indexOf(ch(p)) !== -1 && mathBracketEnd(p) > p) hasMB = true;
        if (s < i && e > i + w && (DIGITS.test(slice) || PREFIX_RE.test(slice) || WEAKVAL_RE.test(slice) || hasMB)) {
          runs.push([s, e]);
          i = e;
          continue;
        }
      }
    }
    i += w;
  }
  // A SUBSCRIPTED limit/extremum operator ("lim_{x→0} f(x)/x = 1") — seed from the name and grow
  // right over the bound + body (the leading-script scanner in termEndRight consumes "_{x→0}" then
  // the body across the space, and the connector chain picks up "= 1").
  LIMIT_RE.lastIndex = 0;
  let lm;
  while ((lm = LIMIT_RE.exec(text))) {
    const nameStart = lm.index;
    const nameEnd = lm.index + lm[1].length; // at the "_"
    const e = expandRight(nameEnd);
    if (e > nameEnd) runs.push([nameStart, e]);
  }
  // A STANDALONE absolute value whose content reorders ("|x − 3|", "|f(x) − f(a)|"): seed the whole
  // |…| group (with a relation/operator around it, the relation seed already grew to include it via
  // termStart/EndLeft, and these merge). A bare "|x|" carries no signal and is left alone.
  for (let s = 0; s < absSpans.length; s++) {
    const o = absSpans[s][0];
    const c = absSpans[s][1];
    let sig = false;
    for (let j = o + 1; j < c - 1; j++) {
      const pc = text.codePointAt(j);
      if (DIGITS.test(text[j]) || isConnectorCp(pc) || isPrefixOp(pc) || pc === 0x2c) { sig = true; break; }
    }
    if (sig) runs.push([expandLeft(o), expandRight(c)]);
  }
  if (!runs.length) return out;

  // Merge overlapping/adjacent runs (the several seeds of one chain map to the same span).
  runs.sort((a, b) => a[0] - b[0]);
  let cur = runs[0].slice();
  for (let r = 1; r < runs.length; r++) {
    if (runs[r][0] <= cur[1]) { if (runs[r][1] > cur[1]) cur[1] = runs[r][1]; }
    else { out.push(cur); cur = runs[r].slice(); }
  }
  out.push(cur);
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { isMirroredMathRel, hasMirroredMathRel, hasMathRun, relationRuns };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
