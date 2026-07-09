'use strict';
// dom/__tests__/progressive-aggressive.test.js — adversarial suite for the streaming surface
// (§6) and the class-swap observer gate, in the spirit of the engine edge-aggressive sweeps.
// Everything here runs the REAL engine+dom source through the harness. Targets, in order:
//   1. selector pedantics (multi-class roots, substring traps, both-classes frames)
//   2. the attribute gate under fire (theme churn, widget internals, mixed batches, noise
//      that must never trigger or cancel work, detached roots, flip churn)
//   3. scale: work-cap truncation across settle windows, a 50k-char paragraph
//   4. streaming content nasties: the U+E000 fade-in sentinel (the KaTeX-breaking one),
//      LRM in app text, chunk replacement mid-stream, chip-only paragraphs
//   5. guard preservation through the new surface: editable, pre/code, app-set dir,
//      multi-root isolation, §8.K in Persian

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, MElement } = require('./harness.js');

const I = loadInternals();

const AZURE =
  "Azure נותן ב-tier החינמי (F0) חצי מיליון תווים בחודש של קולות נוירונים, לתמיד, בלי להזין " +
  'אמצעי תשלום - וזה כולל את הילה ואברי, הקולות העבריים הטובים ביותר שיש היום בענן.';

const progressiveHost = (children) => el('div', { class: 'progressive-markdown' }, children);

class FakeMutationObserver {
  constructor(cb) {
    this.cb = cb;
    FakeMutationObserver.last = this;
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
  disconnect() {}
}

function makeDoc(body) {
  return {
    body,
    head: el('head'),
    getElementById: () => null,
    createElement: (t) => new MElement(t),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(350); // > SETTLE_MS(250)
const flip = (root) => ({ type: 'attributes', attributeName: 'class', target: root, addedNodes: [] });
const noiseOn = (elm) => ({ type: 'attributes', attributeName: 'class', target: elm, addedNodes: [] });

// ---------------------------------------------------------------------------
// 1. Selector pedantics
// ---------------------------------------------------------------------------

test('a multi-class root ("progressive-markdown grid gap-2") still matches', () => {
  const root = el('div', { class: 'progressive-markdown grid gap-2' }, []);
  assert.equal(root.matches(I.SELECTORS.messageRoot), true);
});

test('substring traps do NOT match: no prefix/suffix class may pass for the root', () => {
  for (const cls of ['not-progressive-markdown', 'progressive-markdown-v2', 'xprogressive-markdownx']) {
    const div = el('div', { class: cls }, []);
    assert.equal(div.matches(I.SELECTORS.messageRoot), false, `"${cls}" must not match`);
  }
});

test('a mid-swap frame carrying BOTH classes is still one message root', () => {
  const root = el('div', { class: 'progressive-markdown standard-markdown' }, []);
  assert.equal(root.matches(I.SELECTORS.messageRoot), true);
});

test('one querySelectorAll over the body finds streaming and settled roots together', () => {
  const a = progressiveHost([]);
  const b = el('div', { class: 'standard-markdown' }, []);
  const body = el('body', null, [a, el('div', null, [b])]);
  const found = body.querySelectorAll(I.SELECTORS.messageRoot);
  assert.ok(found.includes(a) && found.includes(b));
});

// ---------------------------------------------------------------------------
// 2. The attribute gate under fire
// ---------------------------------------------------------------------------

test('theme churn on <body> (dark-mode class toggles) schedules nothing', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const body = el('body', { class: 'theme-dark font-sans' }, [progressiveHost([p])]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([noiseOn(body)]);
  await settle();
  assert.equal(p.getAttribute('data-rtl-seen'), null, 'body class flip is noise — no flush');
});

test('a mixed batch: noise is dropped, the real childList record still schedules its root', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = progressiveHost([p]);
  const button = el('button', { class: 'hover:bg-x' }, ['send']);
  const body = el('body', null, [root, button]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([
    noiseOn(button),
    { type: 'childList', target: root, addedNodes: [] },
    noiseOn(button),
  ]);
  await settle();
  assert.equal(p.getAttribute('dir'), 'rtl', 'the real record survived the gate');
  assert.equal(button.getAttribute('data-rtl-seen'), null, 'the noise target was never queued');
});

test('noise after the queue drained does not resurrect a flush (deterministic starvation guard)', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p1 = el('p', null, [AZURE]);
  const root = progressiveHost([p1]);
  const button = el('button', { class: 'x' }, ['btn']);
  const body = el('body', null, [root, button]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([{ type: 'childList', target: root, addedNodes: [] }]);
  await settle();
  assert.equal(p1.getAttribute('dir'), 'rtl');
  // Now the DOM grows silently (no observer record for it — simulating content the noise
  // batch must NOT get credit for): only a REAL record may process it.
  const p2 = el('p', null, [AZURE]);
  root.appendChild(p2);
  FakeMutationObserver.last.cb([noiseOn(button), noiseOn(body)]);
  await settle();
  assert.equal(p2.getAttribute('data-rtl-seen'), null, 'noise alone never triggers a pass');
});

test('class churn INSIDE an ask-widget is gated out; childList inside it still re-asserts synchronously', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const lb = el('div', { role: 'listbox', 'aria-label': 'איזה מסלול תרצה?' }, []);
  const inner = el('div', null, []);
  const widget = el('div', { 'data-ask-user-input-banner': '' }, [lb, inner]);
  const body = el('body', null, [widget]);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  // attribute churn inside the widget: dropped before any work, widget untouched
  mo.cb([noiseOn(inner)]);
  assert.equal(widget.getAttribute('dir'), null, 'attribute noise did not re-assert the widget');
  // a real childList mutation inside it: re-asserted IN the callback (pre-paint), no settle needed
  mo.cb([{ type: 'childList', target: inner, addedNodes: [] }]);
  assert.equal(widget.getAttribute('dir'), 'rtl', 'sync re-assert ran before the debounce');
});

test('a root detached between the flip and the settle window must not crash the flush', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = el('div', { class: 'standard-markdown' }, [p]);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([flip(root)]);
  body.removeChild(root); // React unmounted it before the debounce fired
  await settle();
  assert.equal(p.getAttribute('dir'), 'rtl', 'detached subtree processed harmlessly, no throw');
});

test('flip churn (progressive→standard→progressive→standard) is idempotent and never undoes the override', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = progressiveHost([p]);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  mo.cb([{ type: 'childList', target: root, addedNodes: [] }]);
  await settle();
  const fp = p.getAttribute('data-rtl-seen');
  assert.equal(p.getAttribute('dir'), 'rtl');
  for (const cls of ['standard-markdown', 'progressive-markdown', 'standard-markdown']) {
    root.setAttribute('class', cls);
    mo.cb([flip(root)]);
    await settle();
    assert.equal(p.getAttribute('dir'), 'rtl', `override intact after swap to ${cls}`);
    assert.equal(p.getAttribute('data-rtl-seen'), fp, 'unchanged content short-circuits every time');
  }
});

test('a batch mixing a body-fallback record with a root flip double-queues safely', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = el('div', { class: 'standard-markdown' }, [p]);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([
    { type: 'characterData', target: { nodeType: 3, parentElement: null }, addedNodes: [] }, // → body
    flip(root), // → root (already inside body)
  ]);
  await settle();
  assert.equal(p.getAttribute('dir'), 'rtl', 'processed once through body, skipped as stamped through root');
  assert.equal(p.getAttribute('data-rtl-dir'), 'rtl');
});

// ---------------------------------------------------------------------------
// 3. Scale
// ---------------------------------------------------------------------------

test('work-cap truncation: 150 blocks (450 work units) complete across auto-requeued settle windows', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const ps = [];
  for (let i = 0; i < 150; i++) {
    // evens open with Latin (need the override), odds are Hebrew-first (CSS owns them)
    ps.push(el('p', null, [i % 2 === 0 ? `Azure מסלול ${i} עם הרבה עברית בהמשך המשפט` : `מסלול ${i} כולו עברית`]));
  }
  const root = el('div', { class: 'standard-markdown' }, ps);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([flip(root)]);
  await sleep(900); // first window truncates at MAX_NODES_PER_PASS, re-queue finishes the rest
  for (let i = 0; i < 150; i++) {
    assert.notEqual(ps[i].getAttribute('data-rtl-seen'), null, `p[${i}] was reached`);
    if (i % 2 === 0) assert.equal(ps[i].getAttribute('dir'), 'rtl', `p[${i}] Latin opener overridden`);
    else assert.equal(ps[i].getAttribute('dir'), null, `p[${i}] Hebrew-first left to plaintext`);
  }
  // and a follow-up pass over the same root is a pure no-op
  const before = ps.map((p) => p.getAttribute('data-rtl-seen'));
  I.processRoot(root);
  assert.deepEqual(ps.map((p) => p.getAttribute('data-rtl-seen')), before);
});

test('a 50k-char Latin-opener paragraph is decided correctly (and does not blow the pass up)', () => {
  const huge = 'Azure ' + 'קולות עבריים בענן '.repeat(2700); // ~48k chars, overwhelmingly Hebrew
  const p = el('p', null, [huge]);
  const root = progressiveHost([p]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), 'rtl');
});

// ---------------------------------------------------------------------------
// 4. Streaming content nasties
// ---------------------------------------------------------------------------

test('the U+E000 fade-in sentinel (leading, embedded, trailing) never changes the Latin-opener decision', () => {
  for (const text of ['\uE000' + AZURE, AZURE.slice(0, 30) + '\uE000' + AZURE.slice(30), AZURE + '\uE000']) {
    const p = el('p', null, [text]);
    I.processRoot(progressiveHost([p]));
    assert.equal(p.getAttribute('dir'), 'rtl');
  }
});

test('sentinel removal at stream end changes the fingerprint, so the block is re-decided (not frozen)', () => {
  const p = el('p', null, [AZURE + '\uE000']);
  const root = progressiveHost([p]);
  I.processRoot(root);
  const fpStreaming = p.getAttribute('data-rtl-seen');
  p.textContent = AZURE; // the app strips its sentinel when the fade completes
  I.processRoot(root);
  assert.notEqual(p.getAttribute('data-rtl-seen'), fpStreaming, 'fingerprint tracked the removal');
  assert.equal(p.getAttribute('dir'), 'rtl', 'decision stable across the strip');
});

test('DOCUMENTED LIMITATION: a leading sentinel/LRM on a Hebrew-first block gets no override (engine reads first-strong past it; the browser does not)', () => {
  // UBA gives PUA (U+E000) and LRM bidi class L, so CSS `plaintext` resolves such a block
  // LTR; our classifier treats both as neutral (not \p{L}), reads the Hebrew, and correctly
  // declines to override (§3.2 fallback-null). Transient: sentinels exist only mid-fade,
  // and no app text starts with LRM. Pinned here so a future fix flips THIS test knowingly.
  for (const prefix of ['\uE000', '\u200E']) {
    const p = el('p', null, [prefix + 'שלום, כולו עברית מכאן והלאה בלי שום לטינית']);
    I.processRoot(progressiveHost([p]));
    assert.equal(p.getAttribute('dir'), null);
    assert.equal(p.getAttribute('data-rtl-dir'), null);
  }
});

test('React chunk replacement mid-stream: the freshly-parsed subtree is fixed SYNCHRONOUSLY via processAdded', () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const oldChunk = el('div', null, [el('p', null, ['Azure נותן'])]);
  const root = progressiveHost([oldChunk]);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  // remark re-parses the chunk on a new delta: the old subtree is REPLACED wholesale
  const newP = el('p', null, [AZURE]);
  const newChunk = el('div', null, [newP]);
  root.replaceChild(newChunk, oldChunk);
  FakeMutationObserver.last.cb([{ type: 'childList', target: root, addedNodes: [newChunk] }]);
  // no settle await: processAdded must have run inside the callback (pre-paint)
  assert.equal(newP.getAttribute('dir'), 'rtl', 'first paint of the new chunk is already RTL');
});

test('a chip-only paragraph (citations arrived before any text) stays LTR and unflipped', () => {
  const p = el('p', null, [
    el('span', { 'data-state': 'closed' }, [el('a', { class: 'inline-flex' }, ['Microsoft Learn'])]),
    el('span', { 'data-state': 'closed' }, [el('a', { class: 'inline-flex' }, ['Microsoft Learn'])]),
  ]);
  I.processRoot(progressiveHost([p]));
  assert.equal(p.getAttribute('dir'), null);
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('§8.K in Persian: a Latin opener on a majority-Farsi paragraph flips under the streaming root', () => {
  const p = el('p', null, ['Azure یک سرویس ابری است و صداهای فارسی بسیار خوبی برای تبدیل متن به گفتار دارد']);
  I.processRoot(progressiveHost([p]));
  assert.equal(p.getAttribute('dir'), 'rtl');
});

// ---------------------------------------------------------------------------
// 5. Guard preservation through the new surface
// ---------------------------------------------------------------------------

test('an app-set dir on a paragraph under the streaming root is respected, never overwritten or stamped', () => {
  const p = el('p', { dir: 'ltr' }, [AZURE]);
  I.processRoot(progressiveHost([p]));
  assert.equal(p.getAttribute('dir'), 'ltr');
  assert.equal(p.getAttribute('data-rtl-dir'), null);
  assert.equal(p.getAttribute('data-rtl-seen'), null, 'foreign-dir blocks are not even stamped');
});

test('a paragraph inside a source view (<pre>) under the streaming root is never direction-touched', () => {
  const p = el('p', null, [AZURE]);
  const pre = el('pre', null, [p]);
  I.processRoot(progressiveHost([pre]));
  assert.equal(p.getAttribute('dir'), null);
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('a streaming root INSIDE an editable (composer preview) is left entirely alone', () => {
  const p = el('p', null, [AZURE]);
  const root = progressiveHost([p]);
  el('div', { contenteditable: 'true' }, [root]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), null, 'ProseMirror DOM must never be mutated');
  assert.equal(p.getAttribute('data-rtl-seen'), null);
});

test('deep nesting: li > blockquote > p all resolve under the streaming root without fighting', () => {
  const p = el('p', null, [AZURE]);
  const quote = el('blockquote', null, [p]);
  const li = el('li', null, ['פריט: ', quote]);
  const ul = el('ul', null, [li]);
  I.processRoot(progressiveHost([ul]));
  assert.equal(ul.getAttribute('dir'), 'rtl', 'list marker side');
  assert.equal(li.getAttribute('dir'), 'rtl', 'item marker side');
  assert.equal(quote.getAttribute('dir'), 'rtl', 'bar side');
  assert.equal(p.getAttribute('dir'), 'rtl', 'Latin-opener paragraph overridden inside it all');
});

test('multi-root isolation: flipping one message never processes its neighbours', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const pA = el('p', null, [AZURE]);
  const pB = el('p', null, [AZURE]);
  const rootA = el('div', { class: 'standard-markdown' }, [pA]);
  const rootB = el('div', { class: 'progressive-markdown' }, [pB]); // still streaming
  const body = el('body', null, [rootA, rootB]);
  O.makeObserver(makeDoc(body));
  FakeMutationObserver.last.cb([flip(rootA)]);
  await settle();
  assert.equal(pA.getAttribute('dir'), 'rtl', 'the flipped root was processed');
  assert.equal(pB.getAttribute('data-rtl-seen'), null, 'the neighbour was not touched by this pass');
});
