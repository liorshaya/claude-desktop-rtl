'use strict';
// dom/__tests__/ask-widget.test.js — RTL for the interactive "ask user a question" widget,
// plus the bug its DOM exposed: our relations pass was injecting <span data-rtl-relation>
// into the widget's <style> keyframes ("translateX(-12px)") and into its React-managed option
// text. The fix: a content-derived dir on the widget (attribute only), and a `noInject` zone
// (style/script + composer + ask-widget) the span-injecting passes refuse to enter.
//
// Fixture mirrors the real DOM the user captured: [data-ask-user-input-banner] > header(question
// span.font-claude-response) + [role=listbox][aria-label=Q] > [role=option] rows (badge / label /
// arrow) + a "Something else" <input> row + a <style> with @keyframes. Loaded via the shared
// harness (real source, mock DOM); CONTROLs prove the passes still fire on normal content.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el } = require('./harness.js');

const I = loadInternals();

const renderedHost = (child) => el('div', { class: 'standard-markdown' }, [child]);

// Faithful-enough ask-widget. `options[0]` carries the "→" affordance (as in the capture).
function askWidget(question, options) {
  const rows = options.map((opt, i) =>
    el('div', { role: 'presentation' }, [
      el('button', {
        type: 'button', role: 'option', id: `ask-user-option-question-0-${i}`,
        'aria-selected': 'false', class: 'group/row flex w-full items-center gap-2.5 text-left',
      }, [
        el('span', { class: 'relative flex size-7 shrink-0' }, [el('span', { class: 'text-sm' }, [String(i + 1)])]),
        el('span', { class: 'flex-1 min-w-0 text-sm truncate' }, [opt]),
        ...(i === 0 ? [el('span', { class: 'text-muted text-sm shrink-0 mr-2', 'aria-hidden': 'true' }, ['→'])] : []),
      ]),
    ])
  );
  const listbox = el('div', {
    tabindex: '0', role: 'listbox', 'aria-label': question, 'aria-multiselectable': 'false',
    class: 'flex flex-col',
  }, rows);
  const somethingElse = el('div', { class: 'group/row flex w-full items-center gap-2.5 text-left' }, [
    el('span', { class: 'relative flex size-7 shrink-0' }, []),
    el('input', { placeholder: 'Something else', 'aria-label': 'Something else', type: 'text', value: '' }),
    el('button', { type: 'button' }, [el('span', null, ['Skip'])]),
  ]);
  const icon = () => el('span', { 'data-cds': 'Icon', 'aria-hidden': 'true' }, []);
  const nav = el('div', { class: 'flex items-center gap-0.5 shrink-0' }, [
    el('button', { type: 'button', 'aria-label': 'Previous question' }, [icon()]),
    el('span', { class: 'text-sm text-muted tabular-nums' }, ['1 of 3']), // real DOM has tabular-nums
    el('button', { type: 'button', 'aria-label': 'Next question' }, [icon()]),
  ]);
  const header = el('div', { class: 'flex items-center gap-2 pl-4' }, [
    el('span', { class: 'flex-1 text-primary font-claude-response' }, [question]),
    nav,
    el('button', { type: 'button', 'aria-label': 'Minimize' }, [icon()]),
  ]);
  // The exact shape that triggered the <style> bug: a keyframe with translateX(-12px).
  const style = el('style', null, [
    '@keyframes slideInFromLeft { from { transform: translateX(-12px); opacity: 0; } }' +
    ' @keyframes shake { 20% { transform: translateX(-3px); } }',
  ]);
  return el('div', { 'data-ask-user-input-banner': 'true', tabindex: '-1' }, [
    header, el('div', null, [el('div', { class: 'flex-1 p-1.5' }, [listbox, somethingElse])]), style,
  ]);
}

const QUESTION_HE = 'מה הדבר הראשון שאתה עושה בבוקר?';
const QUESTION_EN = 'What is the first thing you do in the morning?';
const OPTIONS_HE = ['קפה', 'בודק טלפון', 'מתקלח', 'חוזר לישון'];

// ---- base direction is taken from the question, like a <table> from its cells -------------
test('a Hebrew question gives the widget dir="rtl"; the free-text input gets dir="auto"', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.getAttribute('dir'), 'rtl', 'widget flipped RTL from its Hebrew question');
  assert.equal(w.querySelector('input').getAttribute('dir'), 'auto', '"Something else" input is dir=auto');
});

test('an English question leaves the widget LTR (no dir) — §8.K, no blanket flip', () => {
  const w = askWidget(QUESTION_EN, ['Coffee', 'Phone', 'Shower']);
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.getAttribute('dir'), null, 'English question → widget stays LTR');
  assert.equal(w.querySelector('input').getAttribute('dir'), 'auto', 'input still dir=auto either way');
});

test('paging from an RTL question to an LTR one restores LTR (dir removed)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.getAttribute('dir'), 'rtl', 'starts RTL');
  // Simulate the widget re-rendering to question 2, now English.
  w.querySelector('[role="listbox"]').setAttribute('aria-label', QUESTION_EN);
  I.processAskWidget(w);
  assert.equal(w.getAttribute('dir'), null, 'stale RTL cleared when the new question is English');
});

// ---- the bug the DOM exposed: never inject spans into <style> or the widget ---------------
test('wrapRelationsUnder does NOT inject into a <style>; a sibling <p> still wraps (control)', () => {
  const style = el('style', null, ['@keyframes s { from { transform: translateX(-12px); } }']);
  const p = el('p', null, ['3 < 5']);
  const root = el('div', { class: 'standard-markdown' }, [style, p]);
  I.wrapRelationsUnder(root);
  assert.equal(style.childNodes.length, 1, 'style still holds one text node (no <span> injected)');
  assert.equal(style.childNodes[0].nodeType, 3, 'style child is raw CSS text');
  assert.ok(style.textContent.includes('translateX(-12px)'), 'keyframe CSS untouched byte-for-byte');
  assert.ok(p.querySelector('[data-rtl-relation]'), 'CONTROL: real prose relation still isolated');
});

test('processRoot over an RTL ask-widget INJECTS NO new nodes (React-safe; attribute-only)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  const root = renderedHost(w);
  const before = w.querySelectorAll('*').length;
  I.processRoot(root);
  assert.equal(w.getAttribute('dir'), 'rtl', 'widget flipped RTL');
  assert.equal(w.querySelectorAll('*').length, before, 'no new elements injected into the widget');
  assert.equal(w.querySelector('[data-rtl-relation]'), null, 'no relation spans injected (a wrapper would be a NEW node)');
  assert.equal(w.querySelector('[data-rtl-num]'), null, 'no signed-number spans injected');
  const style = w.querySelector('style');
  assert.equal(style.childNodes.length, 1, 'the widget <style> keyframes are left intact');
  assert.ok(style.textContent.includes('translateX(-12px)'), 'keyframe CSS byte-for-byte');
});

// ---- directional affordances: mirror the option "→", isolate the LTR pagination counter ----
const arrowSpan = (w) => w.querySelectorAll('[aria-hidden="true"]').find((s) => (s.textContent || '') === '→');
const counterCluster = (w) => {
  const c = w.querySelectorAll('span').find((s) => (s.textContent || '').trim() === '1 of 3');
  return c && c.parentElement;
};

test('the per-option "→" is mirrored by STAMPING the existing span (no wrapper injected)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  const arrow = arrowSpan(w);
  I.processAskWidget(w);
  assert.ok(arrow.hasAttribute('data-rtl-arrow'), 'existing arrow span gains data-rtl-arrow (CSS scaleX flips it)');
  assert.equal(arrow.textContent, '→', 'the glyph itself is untouched — byte-for-byte (copy/Ctrl-F)');
  assert.equal(arrow.childElementCount, 0, 'stamped in place — no child <span> wrapper injected');
});

test('the pagination counter cluster is isolated LTR (fixes "of 3 1" + inward chevrons)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  const cluster = counterCluster(w); // the prev/counter/next nav div
  I.processAskWidget(w);
  assert.ok(cluster.hasAttribute('data-rtl-ltr'), 'the nav cluster (prev/counter/next) is stamped data-rtl-ltr');
});

test('the counter detector picks "1 of 3", never the option badges ("1","2") or the question', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  I.processAskWidget(w);
  const stamped = w.querySelectorAll('[data-rtl-ltr]');
  assert.equal(stamped.length, 1, 'exactly one cluster stamped');
  assert.ok((stamped[0].textContent || '').includes('1 of 3'), 'it is the counter cluster, not a badge/question');
  // badges live inside [role=option]; none of them (nor their parents) got the LTR stamp
  for (const opt of w.querySelectorAll('[role="option"]')) {
    assert.equal(opt.querySelector('[data-rtl-ltr]'), null, 'no LTR stamp inside an option row');
  }
});

test('an LTR (English) question stamps NO affordances; paging RTL→LTR clears them', () => {
  const w = askWidget(QUESTION_EN, ['Coffee →', 'Phone']); // (aria-hidden-vs-label is covered by the RTL test below)
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.querySelector('[data-rtl-arrow]'), null, 'no arrow stamp under an English question');
  assert.equal(w.querySelector('[data-rtl-ltr]'), null, 'no counter isolation under an English question');

  // Now an RTL question, then page to English: every stamp must be cleared.
  const w2 = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w2);
  I.processAskWidget(w2);
  assert.ok(w2.querySelector('[data-rtl-arrow]'), 'RTL: arrow stamped');
  assert.ok(w2.querySelector('[data-rtl-ltr]'), 'RTL: counter isolated');
  w2.querySelector('[role="listbox"]').setAttribute('aria-label', QUESTION_EN);
  I.processAskWidget(w2);
  assert.equal(w2.getAttribute('dir'), null, 'dir cleared');
  assert.equal(w2.querySelector('[data-rtl-arrow]'), null, 'arrow stamp cleared on pagination to LTR');
  assert.equal(w2.querySelector('[data-rtl-ltr]'), null, 'counter isolation cleared on pagination to LTR');
});

// ---- review-hardening regressions (adversarial audit findings) ----------------------------
test('a Latin+digit header badge ("Claude 3.5") is NOT mistaken for the counter; question stays RTL', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  const header = w.querySelector('.font-claude-response').parentElement;
  // a model/version badge BEFORE the nav (so it precedes the real "1 of 3" in DOM order — the
  // exact shape that makes a loose "first LTR+digit leaf" detector return the badge)
  header.insertBefore(el('span', null, ['Claude 3.5']), header.childNodes[1]);
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.getAttribute('dir'), 'rtl', 'the Hebrew question still drives RTL');
  assert.equal(header.hasAttribute('data-rtl-ltr'), false, 'the question header is NEVER isolated LTR');
  const stamped = w.querySelectorAll('[data-rtl-ltr]');
  assert.equal(stamped.length, 1, 'exactly one cluster isolated');
  assert.ok((stamped[0].textContent || '').includes('1 of 3'), 'and it is the real counter, not the badge');
});

test('the arrow stamp is cleared WIDGET-WIDE even after its option loses role= (orphan guard)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  renderedHost(w);
  I.processAskWidget(w);
  const arrow = arrowSpan(w);
  assert.ok(arrow.hasAttribute('data-rtl-arrow'), 'RTL: arrow stamped');
  // simulate a remount that keeps the arrow node but drops its option's role, then page to English
  arrow.closest('[role="option"]').removeAttribute('role');
  w.querySelector('[role="listbox"]').setAttribute('aria-label', QUESTION_EN);
  I.processAskWidget(w);
  assert.equal(arrow.hasAttribute('data-rtl-arrow'), false, 'orphaned stamp still cleared (the global scaleX would else persist)');
});

test('a counter that is a DIRECT child of the widget root stamps the counter, never the root', () => {
  const w = el('div', { 'data-ask-user-input-banner': 'true' }, [
    el('div', { role: 'listbox', 'aria-label': QUESTION_HE }, []),
    el('span', null, ['1 of 3']), // counter directly under the root (no nav wrapper)
  ]);
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(w.hasAttribute('data-rtl-ltr'), false, 'root is never stamped (descendant-combinator CSS would skip it)');
  const counter = w.querySelectorAll('span').find((s) => (s.textContent || '') === '1 of 3');
  assert.ok(counter.hasAttribute('data-rtl-ltr'), 'falls back to stamping the counter span itself');
});

test('a relation in an option LABEL is never injected (control: same run wraps in plain prose)', () => {
  const w = askWidget(QUESTION_HE, ['הערך הוא 3 < 5 בדיוק', 'רגיל']);
  const control = el('p', null, ['3 < 5']);
  const root = el('div', { class: 'standard-markdown' }, [w, control]);
  I.processRoot(root);
  for (const opt of w.querySelectorAll('[role="option"]')) {
    assert.equal(opt.querySelector('[data-rtl-relation]'), null, 'option label text untouched (noInject)');
  }
  assert.ok(control.querySelector('[data-rtl-relation]'), 'CONTROL: plain prose relation still isolated (the pass ran)');
});

test('under RTL only the aria-hidden deco "→" mirrors — a "→" in the option LABEL is left alone', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  const label = w.querySelectorAll('[role="option"]')[1].querySelector('.flex-1');
  label.textContent = 'המשך →'; // an arrow inside the (non-aria-hidden) label
  renderedHost(w);
  I.processAskWidget(w);
  assert.equal(label.hasAttribute('data-rtl-arrow'), false, 'label-text arrow is NOT stamped (only decorative aria-hidden glyphs)');
  assert.ok(arrowSpan(w).hasAttribute('data-rtl-arrow'), 'the aria-hidden deco arrow IS stamped');
});

test('an emoji-presentation arrow (⬅️ = arrow + VS16) still mirrors under RTL', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  const deco = el('span', { 'aria-hidden': 'true' }, ['⬅️']); // ⬅️
  w.querySelector('[role="option"]').appendChild(deco);
  renderedHost(w);
  I.processAskWidget(w);
  assert.ok(deco.hasAttribute('data-rtl-arrow'), 'a variation-selector arrow is stamped (length guard tolerates the VS)');
});

test('multi-char / non-arrow decorative glyphs are never stamped as arrows', () => {
  // A decorative span whose text is NOT a single mirror arrow must not be mirrored.
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  // inject a fake decorative caret + a multi-char arrow label into an option for the guard test
  const opt = w.querySelector('[role="option"]');
  opt.appendChild(el('span', { 'aria-hidden': 'true' }, ['⌄'])); // expand caret — NOT a mirror arrow
  opt.appendChild(el('span', { 'aria-hidden': 'true' }, ['→ go'])); // multi-char run
  renderedHost(w);
  I.processAskWidget(w);
  const carets = w.querySelectorAll('[aria-hidden="true"]').filter((s) => {
    const t = s.textContent || '';
    return t === '⌄' || t === '→ go';
  });
  for (const s of carets) assert.equal(s.hasAttribute('data-rtl-arrow'), false, `"${s.textContent}" not stamped`);
});

test('processAdded flips a freshly-mounted Hebrew widget RTL synchronously (no first-paint flip)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  I.processAdded(w); // observer add path, before paint
  assert.equal(w.getAttribute('dir'), 'rtl', 'RTL on first paint');
});

// ---- inNoInject covers exactly the right zones -------------------------------------------
test('inNoInject matches <style>/<script>/composer/ask-widget but not rendered prose', () => {
  const style = el('style', null, ['x']);
  const script = el('script', null, ['y']);
  const widgetChild = el('span', null, ['z']);
  askWidget(QUESTION_HE, OPTIONS_HE).appendChild(widgetChild);
  const composerChild = el('p', null, ['x']);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [composerChild]);
  const prose = el('p', null, ['hello']);
  renderedHost(prose);
  assert.equal(I.inNoInject(style), true, '<style> is a no-inject zone');
  assert.equal(I.inNoInject(script), true, '<script> is a no-inject zone');
  assert.equal(I.inNoInject(widgetChild), true, 'inside the ask-widget is a no-inject zone');
  assert.equal(I.inNoInject(composerChild), true, 'inside the composer is a no-inject zone');
  assert.equal(I.inNoInject(prose), false, 'rendered prose is fine to transform');
});
