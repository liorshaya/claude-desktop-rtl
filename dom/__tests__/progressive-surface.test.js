'use strict';
// dom/__tests__/progressive-surface.test.js — the STREAMING-SURFACE gap (§6).
//
// The bug (caught live 2026-07-09, the "Azure נותן ב-tier" screenshot): claude.ai renders a
// message under class "progressive-markdown" WHILE IT STREAMS and swaps the same div to
// "standard-markdown" when done —
//     className: isStreaming ? "progressive-markdown" : "standard-markdown"
// Neither our apply.css `:where(…)` anchors nor SELECTORS.messageRoot knew the streaming
// class, so DURING streaming no per-leaf `unicode-bidi: plaintext` applied and every Hebrew
// block rendered with Claude's base `direction: ltr`. Worse, the swap to standard-markdown is
// an ATTRIBUTE-ONLY mutation (className on the same div) — invisible to a childList/
// characterData observer, so nothing re-ran at settle.
//
// The fix, verified here end-to-end through the REAL engine+dom source:
//   1. `.progressive-markdown` joins every apply.css anchor list that carries
//      `.standard-markdown`, and SELECTORS.messageRoot.
//   2. The observer also watches `attributes` filtered to `class`, and reacts ONLY when the
//      class changed on a message root (the progressive→standard swap) — the app's
//      hover/animation class churn elsewhere schedules nothing.

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, MElement } = require('./harness.js');

const I = loadInternals();

// The exact paragraph from the screenshot: Latin opener ("Azure"), majority Hebrew, ends
// with two "Microsoft Learn" citation chips. plaintext first-strong misfires → §8.K override.
const AZURE =
  "Azure נותן ב-tier החינמי (F0) חצי מיליון תווים בחודש של קולות נוירונים, לתמיד, בלי להזין " +
  "אמצעי תשלום - וזה כולל את הילה ואברי, הקולות העבריים הטובים ביותר שיש היום בענן. הקאץ' " +
  'שחשוב שתדע: לפי תנאי השירות, זכות השימוש המסחרי בפלט ניתנת במפורש רק ללקוחות ה-tier ' +
  'בתשלום, כלומר משתמשי החינם לא מקבלים זכות שימוש מסחרי. אז F0 מצוין לפיתוח ול-staging, לא ' +
  'לפרודקשן של StudiMath. גוגל TTS נותן מכסה חודשית חינמית קבועה (מיליון תווים לקולות ' +
  'נוירונים) על השירות הרגיל, עם קולות he-IL סבירים, מדרגה מתחת להילה.';

// A citation chip as claude.ai builds it (antCitation → tooltip'd inline-flex span; only the
// site name is in-DOM text — the preview card is portal'd elsewhere).
const chip = () =>
  el('span', { 'data-state': 'closed' }, [el('a', { class: 'inline-flex' }, ['Microsoft Learn'])]);

const progressiveHost = (children) => el('div', { class: 'progressive-markdown' }, children);

// ---------------------------------------------------------------------------
// 1. Selector coverage: the streaming root IS a message root.
// ---------------------------------------------------------------------------

test('SELECTORS.messageRoot matches a .progressive-markdown root', () => {
  const root = progressiveHost([]);
  assert.equal(root.matches(I.SELECTORS.messageRoot), true);
});

test('observer scoping: an element inside a streaming message resolves to the progressive root, not the body fallback', () => {
  const p = el('p', null, [AZURE]);
  const root = progressiveHost([p]);
  el('body', null, [root]);
  assert.equal(p.closest(I.SELECTORS.messageRoot), root);
});

test('the settled root still matches too (regression: the swap must not lose the surface)', () => {
  const root = el('div', { class: 'standard-markdown' }, []);
  assert.equal(root.matches(I.SELECTORS.messageRoot), true);
});

// ---------------------------------------------------------------------------
// 2. CSS anchors: every :where() list that knows .standard-markdown must know
//    .progressive-markdown — otherwise streaming blocks get NO plaintext at all.
// ---------------------------------------------------------------------------

test('apply.css: every :where() anchor list with .standard-markdown also carries .progressive-markdown', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'apply.css'), 'utf8');
  const groups = [...css.matchAll(/:where\(([^)]*)\)/g)].map((m) => m[1]);
  const anchored = groups.filter((g) => g.includes('.standard-markdown'));
  assert.ok(anchored.length >= 6, `expected the 6 anchor groups, found ${anchored.length}`);
  for (const g of anchored) {
    assert.ok(
      g.includes('.progressive-markdown'),
      `anchor group missing .progressive-markdown: ${g.replace(/\s+/g, ' ').trim()}`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. End-to-end passes over a STREAMING (progressive) message tree.
//    processRoot never gated on the root class, but these pin the whole surface
//    so a future "only under .standard-markdown" refactor can't silently drop it.
// ---------------------------------------------------------------------------

test('the screenshot paragraph: Latin opener + majority Hebrew + citation chips → §8.K override while streaming', () => {
  const p = el('p', null, [
    el('span', { 'data-state': 'closed' }, [AZURE.slice(0, 200)]),
    chip(),
    el('span', { 'data-state': 'closed' }, [AZURE.slice(200)]),
    chip(),
  ]);
  const root = progressiveHost([p]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), 'rtl', 'dir attribute written');
  assert.equal(p.getAttribute('data-rtl-dir'), 'rtl', 'override stamp written');
  assert.equal(p.style.getPropertyValue('direction'), 'rtl', 'inline direction beats Claude ltr');
  assert.equal(p.style.getPropertyValue('unicode-bidi'), 'isolate', 'isolate so direction governs');
  assert.equal(p.style.getPropertyValue('text-align'), 'right', 'alignment follows');
});

test('§8.K holds while streaming: a majority-English paragraph is never flipped', () => {
  const p = el('p', null, ['The term שלום means peace and is used as a greeting in Hebrew.']);
  const root = progressiveHost([p]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), null);
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('a Hebrew-first paragraph under the streaming root is left to CSS plaintext (no dir written)', () => {
  const p = el('p', null, ['ספריית פייתון שמדברת עם ה-TTS של Edge — אותם קולות, בלי מפתח API.']);
  const root = progressiveHost([p]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), null, 'plaintext already resolves RTL; JS must not touch it');
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('a Latin-opener heading under the streaming root gets the override too', () => {
  const h = el('h3', null, ['Azure TTS — המסלול המומלץ לעברית']);
  const root = progressiveHost([h]);
  I.processRoot(root);
  assert.equal(h.getAttribute('dir'), 'rtl');
});

test('a majority-Hebrew table streamed under the progressive root flips column order', () => {
  const tbody = el('tbody', null, [
    el('tr', null, [el('td', null, ['שירות']), el('td', null, ['מכסה'])]),
    el('tr', null, [el('td', null, ['Azure']), el('td', null, ['חצי מיליון תווים'])]),
    el('tr', null, [el('td', null, ['גוגל']), el('td', null, ['מיליון תווים'])]),
  ]);
  const table = el('table', null, [tbody]);
  const root = progressiveHost([table]);
  I.processRoot(root);
  assert.equal(table.getAttribute('dir'), 'rtl');
  assert.equal(table.getAttribute('data-rtl-tdir'), '1');
});

test('list/blockquote decoration dir applies under the progressive root', () => {
  const li = el('li', null, ['הילה ואברי — הקולות העבריים הטובים בענן']);
  const ul = el('ul', null, [li]);
  const quote = el('blockquote', null, ['חצי מיליון תווים בחודש, לתמיד.']);
  const root = progressiveHost([ul, quote]);
  I.processRoot(root);
  assert.equal(ul.getAttribute('dir'), 'rtl');
  assert.equal(li.getAttribute('dir'), 'rtl');
  assert.equal(quote.getAttribute('dir'), 'rtl');
});

// ---------------------------------------------------------------------------
// 4. Streaming lifecycle: grow → settle → the className swap.
// ---------------------------------------------------------------------------

test('mid-stream re-decision: "Azure" alone stays put, the full paragraph flips (fingerprint re-eval)', () => {
  const p = el('p', null, ['Azure']);
  const root = progressiveHost([p]);
  I.processRoot(root); // settle #1: all-Latin prefix → no override, stamped
  assert.equal(p.getAttribute('dir'), null, 'no majority yet → CSS keeps owning it');
  p.textContent = AZURE; // stream completes
  I.processRoot(root); // settle #2: fingerprint changed → re-decided
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('§8.K reversal survives the streaming surface: an override applied to an RTL prefix is undone when English wins', () => {
  const p = el('p', null, ['React הוא ספרייה פופולרית']); // majority-RTL prefix → override
  const root = progressiveHost([p]);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), 'rtl', 'prefix decision: RTL');
  p.textContent =
    'React הוא ספרייה but the rest of this paragraph continues in English and clearly ' +
    'outweighs the Hebrew opener by a very wide margin indeed.';
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), null, 'English must never stay flipped');
  assert.equal(p.getAttribute('data-rtl-dir'), null);
  assert.equal(p.style.getPropertyValue('direction'), '', 'inline override fully reverted');
});

test('the progressive→standard className swap is idempotent: the settled pass neither reworks nor undoes the override', () => {
  const p = el('p', null, [AZURE]);
  const root = progressiveHost([p]);
  I.processRoot(root); // streamed state, override applied
  assert.equal(p.getAttribute('dir'), 'rtl');
  const fpBefore = p.getAttribute('data-rtl-seen');
  root.setAttribute('class', 'standard-markdown'); // React swaps the class in place
  I.processRoot(root); // the pass the class-flip observer queues
  assert.equal(p.getAttribute('dir'), 'rtl', 'override intact after the swap');
  assert.equal(p.getAttribute('data-rtl-seen'), fpBefore, 'unchanged content short-circuits (§3.3)');
});

// ---------------------------------------------------------------------------
// 5. The observer itself: class flips on message roots re-queue the root;
//    class churn anywhere else schedules nothing.
// ---------------------------------------------------------------------------

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

// A minimal document for makeObserver: ensureCSS walks getElementById → createElement →
// head.appendChild (CSSStyleSheet doesn't exist here, and that fallback path is exactly
// what the mock exercises).
function makeDoc(body) {
  return {
    body,
    head: el('head'),
    getElementById: () => null,
    createElement: (t) => new MElement(t),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 350)); // > SETTLE_MS

test('observer watches attributes filtered to class (and only class — our stamps can never feed back)', () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const body = el('body', null, []);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  assert.equal(mo.target, body);
  assert.equal(mo.options.childList, true);
  assert.equal(mo.options.subtree, true);
  assert.equal(mo.options.characterData, true);
  assert.equal(mo.options.attributes, true, 'the progressive→standard swap is attribute-only');
  assert.deepEqual(mo.options.attributeFilter, ['class']);
  for (const ours of ['dir', 'style', 'data-rtl-dir', 'data-rtl-seen', 'data-rtl-done']) {
    assert.ok(!mo.options.attributeFilter.includes(ours), `${ours} must stay outside the filter`);
  }
});

test('a class flip ON a message root queues that root: an unprocessed paragraph inside gets the override at settle', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = el('div', { class: 'standard-markdown' }, [p]); // post-swap state
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  mo.cb([{ type: 'attributes', attributeName: 'class', target: root, addedNodes: [] }]);
  await settle();
  assert.equal(p.getAttribute('dir'), 'rtl', 'the swap re-queued the root and the pass ran');
});

test('class churn on a NON-root (hover/animation noise) schedules no pass at all', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const button = el('button', { class: 'hover:bg-something' }, ['send']);
  const p = el('p', null, [AZURE]); // would be flipped if any pass ran over the body
  const body = el('body', null, [button, p]);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  mo.cb([{ type: 'attributes', attributeName: 'class', target: button, addedNodes: [] }]);
  await settle();
  assert.equal(p.getAttribute('data-rtl-seen'), null, 'no flush fired — the noise was dropped before any work');
});

test('childList mutations still schedule exactly as before (the attribute gate must not eat real work)', async () => {
  const O = loadInternals({ MutationObserver: FakeMutationObserver });
  const p = el('p', null, [AZURE]);
  const root = el('div', { class: 'progressive-markdown' }, [p]);
  const body = el('body', null, [root]);
  O.makeObserver(makeDoc(body));
  const mo = FakeMutationObserver.last;
  mo.cb([{ type: 'childList', target: root, addedNodes: [] }]);
  await settle();
  assert.equal(p.getAttribute('dir'), 'rtl', 'debounced pass reached the streaming root');
});
