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
  const header = el('div', { class: 'flex items-center gap-2 pl-4' }, [
    el('span', { class: 'flex-1 text-primary font-claude-response' }, [question]),
    el('div', { class: 'flex items-center gap-0.5 shrink-0' }, [el('span', { class: 'text-sm text-muted' }, ['1 of 3'])]),
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

test('processRoot over an RTL ask-widget sets dir but injects NOTHING into it (React-safe)', () => {
  const w = askWidget(QUESTION_HE, OPTIONS_HE);
  const root = renderedHost(w);
  I.processRoot(root);
  assert.equal(w.getAttribute('dir'), 'rtl', 'widget flipped RTL');
  assert.equal(w.querySelector('[data-rtl-relation]'), null, 'no relation spans injected into the widget');
  assert.equal(w.querySelector('[data-rtl-num]'), null, 'no signed-number spans injected');
  assert.equal(w.querySelector('[data-rtl-arrow]'), null, 'the "→" affordance is NOT wrapped/flipped (React owns it)');
  const style = w.querySelector('style');
  assert.equal(style.childNodes.length, 1, 'the widget <style> keyframes are left intact');
  assert.ok(style.textContent.includes('translateX(-12px)'), 'keyframe CSS byte-for-byte');
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
