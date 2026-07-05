'use strict';
// dom/__tests__/engine-fixes-e2e.test.js — the adversarial-round engine fixes, proven END TO
// END through the REAL wrapRelationsUnder pass (real engine + real dom source in the harness
// mock). The engine suites prove the DECISION; these prove the APPLICATION — the gate lets the
// node through, the walker reaches it, the wrap mutates the right span, and nothing else moves:
//   • the quadratic-bracket freeze happened INSIDE the renderer pass (hasMathRun lets the
//     pathological node through) — so the linear-time guard must hold here, not just in engine/;
//   • the lim-gate hole meant this pass NEVER FIRED on a bound-only limit line — the wrap
//     existing at all is the fix;
//   • every "token cut" family (NBSP, ٪/٫, 9:00-17:00, 10^-9) must land byte-exact in ONE span;
//   • the Hebrew-in-brackets hard rule and in-tag '=' must keep prose OUT of any span.
// Byte fidelity (§3.6) and idempotency are asserted on every case.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el } = require('./harness.js');

const I = loadInternals();
const host = (child) => el('div', { class: 'standard-markdown' }, [child]);
const spansOf = (p) => p.querySelectorAll('[data-rtl-relation]');

function snapshot(node) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  const attrs = Object.keys(node.attrs || {}).sort().map((k) => `${k}=${node.attrs[k]}`).join(' ');
  return `<${node.tagName} ${attrs}>[${(node.childNodes || []).map(snapshot).join(',')}]`;
}

// Wrap `textContent` inside a fresh <p>, run the real relations pass, and assert: the expected
// runs (in order) each landed in ONE isolation span, total text is byte-identical, and a second
// pass changes nothing. Returns the <p> for extra assertions.
function wrapAndCheck(content, expectedRuns) {
  const p = el('p', null, [content]);
  const root = host(p);
  I.wrapRelationsUnder(root);
  const spans = spansOf(p);
  assert.deepEqual(spans.map((s) => s.textContent), expectedRuns, JSON.stringify(content));
  assert.equal(p.textContent, content, `byte fidelity: ${JSON.stringify(content)}`);
  const settled = snapshot(p);
  I.wrapRelationsUnder(root); // re-walk during streaming must be a no-op
  assert.equal(snapshot(p), settled, `idempotent: ${JSON.stringify(content)}`);
  return p;
}

// ─────────────────── CONTROL: the pass fires on plain content in this mock ───────────────────
test('e2e control: a plain Hebrew comparison wraps (the mutation path is alive)', () => {
  wrapAndCheck('נתון ש-0 < x ≤ 4 בקטע', ['0 < x ≤ 4']);
});

// ─────────────────── the renderer freeze: pathological node through the REAL pass ───────────────────
test('e2e perf: 40k stray "(" in one text node — the pass stays linear (froze ~7s before)', () => {
  // hasMathRun passes this node (the '<' is a mirror relation), so it reaches the full parse —
  // exactly where the quadratic freeze lived. 2s is a huge margin over the fixed ~20ms.
  const nasty = '('.repeat(40000) + '3<5';
  const t0 = Date.now();
  const p = wrapAndCheck(nasty, ['3<5']);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `pathological node wrapped in ${elapsed}ms`);
  assert.equal(p.childNodes[0].nodeValue, '('.repeat(40000), 'the stray openers stay untouched text');
});

// ─────────────────── the lim-gate hole: the pass now FIRES at all ───────────────────
test('e2e gate: a bound-only limit line is wrapped (the pass never fired before the fix)', () => {
  // Pre-fix, hasMathRun said false for this node → the walker rejected it → zero spans forever.
  const p = wrapAndCheck('הגבול lim_{n→∞} aₙ קיים', ['lim_{n→∞} aₙ']);
  assert.equal(spansOf(p).length, 1);
});

// ─────────────────── the "token cut" families land byte-exact in ONE span ───────────────────
test('e2e cuts: NBSP chain, Arabic ٪/٫, clock range, signed exponent — one whole span each', () => {
  wrapAndCheck('האם x > 5?', ['x > 5']);
  wrapAndCheck('السعر ٥٠٪ > ٢٥٪ هنا', ['٥٠٪ > ٢٥٪']);
  wrapAndCheck('המחיר ٥٫٥ < ٦ בערך', ['٥٫٥ < ٦']);
  wrapAndCheck('פתוח 9:00-17:00 היום', ['9:00-17:00']);
  wrapAndCheck('כי 10^-9 < 10^-6 תמיד', ['10^-9 < 10^-6']);
});

// ─────────────────── the hard rule at the DOM level: Hebrew stays OUT of the isolate ───────────────────
test('e2e hard rule: bracketed Hebrew prose never lands inside an isolation span', () => {
  const p = wrapAndCheck('x < (שתי מילים) כאן', ['x <']);
  // the Hebrew words remain in a PLAIN text node, outside every [data-rtl-relation] span
  const plain = p.childNodes.filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('');
  assert.ok(plain.includes('(שתי מילים)'), 'Hebrew parenthetical stays plain text');
});
test('e2e tags: markup-as-text with attribute "=" creates NO spans (gate passes, parse declines)', () => {
  // hasMathRun is true ('=' + digit), so the node IS walked — the parse must still find nothing.
  // This exercises the accepted-but-no-run path that the mutation cap deliberately skips counting.
  const p = wrapAndCheck('ראה <a href="x=1">קישור</a> כאן', []);
  assert.equal(spansOf(p).length, 0);
});

// ─────────────────── mixed message: all fix families in one root, one pass ───────────────────
test('e2e mixed: one message holding every fix family wraps each run exactly once', () => {
  const paras = [
    el('p', null, ['האם x > 5?']),
    el('p', null, ['פתוח 9:00-17:00 היום']),
    el('p', null, ['הגבול lim_{n→∞} aₙ קיים']),
    el('p', null, ['x < (שתי מילים) כאן']),
    el('p', null, ['السعر ٥٠٪ > ٢٥٪ هنا']),
  ];
  const root = el('div', { class: 'standard-markdown' }, paras);
  I.wrapRelationsUnder(root);
  const got = paras.map((p) => spansOf(p).map((s) => s.textContent));
  assert.deepEqual(got, [
    ['x > 5'], ['9:00-17:00'], ['lim_{n→∞} aₙ'], ['x <'], ['٥٠٪ > ٢٥٪'],
  ]);
  const settled = snapshot(root);
  I.wrapRelationsUnder(root);
  assert.equal(snapshot(root), settled, 'whole-message idempotency');
});
