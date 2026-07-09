'use strict';
// dom/__tests__/br-heading.test.js — the "**heading**<br>body" misfire, end-to-end (§3.2/§8.K).
//
// Live DOM captured from Claude Desktop (2026-07-09): claude.ai renders the very common
// Hebrew answer pattern "**מסלול 1: …**\nAzure נותן ב-tier …" as ONE paragraph:
//   <p><strong>מסלול 1: מכסות חינם של הענן (האיכות הכי טובה)</strong><br>Azure נותן … [chips]</p>
// A <br> is a forced break, so CSS `plaintext` resolves each segment's base direction on
// its own: the Hebrew-first heading went RTL, the Latin-opener majority-Hebrew body went
// LTR — and the whole-block override never fired because the block's first strong char is
// the heading's Hebrew. These tests pin the per-segment decision through the real passes,
// including the exact captured structure (strong + br + text + trailing citation chips).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, text } = require('./harness.js');

const I = loadInternals();

const HEADING = 'מסלול 1: מכסות חינם של הענן (האיכות הכי טובה)';
const BODY =
  "Azure נותן ב-tier החינמי (F0) חצי מיליון תווים בחודש של קולות נוירונים, לתמיד, בלי להזין " +
  'אמצעי תשלום - וזה כולל את הילה ואברי, הקולות העבריים הטובים ביותר שיש היום בענן. ' +
  'גוגל TTS נותן מכסה חודשית חינמית קבועה, עם קולות he-IL סבירים, מדרגה מתחת להילה. ';

// The chip exactly as captured: nested inline-flex spans + <a>, visible text = site name.
const chip = () =>
  el('span', { class: 'inline-flex', 'data-state': 'closed' }, [
    el('a', { href: 'https://learn.microsoft.com/', target: '_blank', class: 'group/tag inline-flex' }, [
      el('span', { class: 'inline-flex' }, [el('span', { class: 'text-nowrap' }, ['Microsoft Learn'])]),
    ]),
  ]);

const host = (child) => el('div', { class: 'standard-markdown' }, [child]);

test('the captured paragraph: strong heading + <br> + Latin-opener body + chips → whole-block RTL override', () => {
  const p = el('p', { class: 'font-claude-response-body break-words whitespace-normal' }, [
    el('strong', null, [HEADING]),
    el('br'),
    BODY,
    chip(),
    el('span', { class: 'inline-flex w-1' }),
    chip(),
  ]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), 'rtl');
  assert.equal(p.getAttribute('data-rtl-dir'), 'rtl');
  assert.equal(p.style.getPropertyValue('direction'), 'rtl');
  assert.equal(p.style.getPropertyValue('unicode-bidi'), 'isolate', 'isolate (not plaintext) so every <br> segment takes the element direction');
});

test('the same paragraph WITHOUT the <br> heading still overrides (single-segment back-compat)', () => {
  const p = el('p', null, [BODY]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('§8.K: Hebrew heading + genuinely-English body after the <br> is NOT flipped', () => {
  const p = el('p', null, [
    el('strong', null, [HEADING]),
    el('br'),
    'The rest of this paragraph is plain English text that must stay exactly as plaintext renders it.',
  ]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), null);
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('§8.K: a misfiring segment next to a real-English segment is vetoed (mixed-verdict block untouched)', () => {
  const p = el('p', null, [
    BODY,
    el('br'),
    'This is a genuinely English continuation that plaintext correctly renders LTR.',
  ]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), null);
});

test('all-Hebrew multi-segment paragraph stays with plaintext (no dir, no churn)', () => {
  const p = el('p', null, ['שורה ראשונה בעברית', el('br'), 'שורה שנייה גם בעברית']);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), null);
  assert.equal(p.getAttribute('data-rtl-dir'), null);
});

test('heading misfire variant: the LATIN-opener segment is the first one, Hebrew after — still overridden', () => {
  const p = el('p', null, ['Azure ואברי הם הקולות הטובים ביותר', el('br'), 'שורה עברית שנייה']);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('<br> nested INSIDE an inline element still splits segments (walker depth)', () => {
  const p = el('p', null, [
    el('strong', null, [HEADING, el('br')]), // some renderers keep the break inside the bold
    BODY,
  ]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('li with a heading<br>misfiring-body gets the content flip; bar/marker side included', () => {
  const li = el('li', null, [el('strong', null, [HEADING]), el('br'), BODY]);
  el('ul', null, [li]);
  I.processDirBlock(li);
  assert.equal(li.getAttribute('dir'), 'rtl');
  assert.equal(li.getAttribute('data-rtl-dir'), 'rtl');
});

test('blockquote variant of the same pattern', () => {
  const q = el('blockquote', null, [el('strong', null, [HEADING]), el('br'), BODY]);
  host(q);
  I.processDirBlock(q);
  assert.equal(q.getAttribute('dir'), 'rtl');
});

test('math/code islands inside a segment still do not vote (KaTeX annotation guard preserved)', () => {
  // an inline code island full of Latin sits inside the misfiring segment — excluded, so the
  // segment stays majority-Hebrew and the override still fires
  const p = el('p', null, [
    el('strong', null, [HEADING]),
    el('br'),
    'Azure נותן קולות עבריים מצוינים ',
    el('code', null, ['SpeechSynthesizer.SpeakTextAsync(text, voice, format)']),
    ' וזה עובד היטב בעברית לאורך כל הדרך',
  ]);
  I.processRoot(host(p));
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('streaming: the heading segment arrives first (no misfire yet), the body streams in after — re-decided to RTL', () => {
  const p = el('p', null, [el('strong', null, [HEADING])]);
  const root = host(p);
  I.processRoot(root); // settle #1: only the Hebrew heading → no override
  assert.equal(p.getAttribute('dir'), null);
  p.appendChild(el('br'));
  p.appendChild(text(BODY));
  I.processRoot(root); // settle #2: fingerprint grew → re-decided per segment
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('reverse streaming (§8.K undo): override applied, then an English segment streams in → cleared', () => {
  const p = el('p', null, [BODY]);
  const root = host(p);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), 'rtl', 'misfire alone → overridden');
  p.appendChild(el('br'));
  const eng = el('span', null, ['and then a long genuinely English continuation streamed into the very same block afterwards.']);
  p.appendChild(eng);
  I.processRoot(root);
  assert.equal(p.getAttribute('dir'), null, 'the English segment vetoes — the stale override is undone');
  assert.equal(p.style.getPropertyValue('direction'), '', 'inline style fully reverted');
});

test('idempotency: unchanged captured paragraph short-circuits on the second pass', () => {
  const p = el('p', null, [el('strong', null, [HEADING]), el('br'), BODY]);
  const root = host(p);
  I.processRoot(root);
  const fp = p.getAttribute('data-rtl-seen');
  I.processRoot(root);
  assert.equal(p.getAttribute('data-rtl-seen'), fp);
  assert.equal(p.getAttribute('dir'), 'rtl');
});
