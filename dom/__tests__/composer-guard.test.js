'use strict';
// dom/__tests__/composer-guard.test.js — regression for the composer/edit-box TYPING FREEZE.
//
// The bug: typing a Hebrew line containing a signed number ("-5") in the chat composer (a
// ProseMirror contenteditable) froze typing. The debounced observer ran the content passes
// on the composer subtree; wrapSignedNumbersInBlock REPLACED the text node with a
// <span data-rtl-num> inside ProseMirror's managed DOM, desyncing the editor. Same for the
// in-place message-EDIT box. The fix: every content-mutation pass bails inside an editable
// host (SELECTORS.editableHost) — we only ever set dir="auto" on inputs.
//
// The DOM layer has no jsdom (§13b validates it visually); this loads the REAL dom/+engine/
// source via the build's own stripModule into a tiny, faithful DOM mock — enough to exercise
// closest/querySelectorAll/TreeWalker/replaceChild, the exact ops the passes use. The CONTROL
// cases prove the mutation path actually fires on normal content, so a green editable case is
// the guard working — not a dead mock.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, elementChildren } = require('./harness.js');

const I = loadInternals();

// ---- helpers ---------------------------------------------------------------------------
const hasNum = (node) => node.querySelector('[data-rtl-num]') !== null;
const composerHost = (child) => el('div', { contenteditable: 'true', class: 'ProseMirror' }, [child]);
const editHost = (child) => el('div', { contenteditable: '' }, [child]); // in-place message edit
const renderedHost = (child) => el('div', { class: 'standard-markdown' }, [child]);
const htable = (rows) => {
  const tbody = el('tbody');
  for (const row of rows) tbody.appendChild(el('tr', null, row.map((t) => el('td', null, [t]))));
  return el('table', null, [tbody]);
};

// ---- the bug: editable hosts must never be mutated -------------------------------------
test('SELECTORS.editableHost matches the ProseMirror composer and the edit box', () => {
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror' });
  const edit = el('div', { contenteditable: '' });
  const ta = el('textarea');
  const prose = el('p');
  assert.ok(composer.matches(I.SELECTORS.editableHost), 'composer is an editable host');
  assert.ok(edit.matches(I.SELECTORS.editableHost), 'empty-value contenteditable is an editable host');
  assert.ok(ta.matches(I.SELECTORS.editableHost), 'textarea is an editable host');
  assert.equal(prose.matches(I.SELECTORS.editableHost), false, 'a plain <p> is not');
});

test('wrapSignedNumbersInBlock does NOT mutate a paragraph inside the composer ("-5" freeze)', () => {
  const p = el('p', null, ['המחיר -5 שקל']);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]); // p now lives in the composer
  I.wrapSignedNumbersInBlock(p);
  assert.equal(elementChildren(p).length, 0, 'no <span> injected into the editor DOM');
  assert.equal(p.childNodes.length, 1, 'the original text node is left whole');
  assert.equal(p.textContent, 'המחיר -5 שקל', 'text preserved byte-for-byte');
  assert.equal(p.getAttribute('data-rtl-nums'), null, 'the editor block is not even stamped');
});

test('CONTROL: the SAME pass DOES wrap "-5" in a rendered (non-editable) message block', () => {
  const p = el('p', null, ['המחיר -5 שקל']);
  el('div', { class: 'standard-markdown' }, [p]); // a normal rendered message root
  I.wrapSignedNumbersInBlock(p);
  assert.ok(hasNum(p), 'data-rtl-num span created on real content (mock exercises the path)');
  assert.equal(p.querySelector('[data-rtl-num]').textContent, '-5', 'the run is the signed number');
  assert.equal(p.textContent, 'המחיר -5 שקל', 'text still byte-for-byte after wrapping');
});

test('processRoot scoped INTO the composer skips every content pass (only dir="auto")', () => {
  const p = el('p', null, ['שורה עם -5 כאן']);
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]);
  I.processRoot(composer); // mirrors the observer root while typing
  assert.equal(elementChildren(p).length, 0, 'composer paragraph untouched');
  assert.equal(p.textContent, 'שורה עם -5 כאן', 'text intact');
});

test('processRoot over a message root spares an in-place EDIT box but processes real prose', () => {
  const realP = el('p', null, ['המחיר -5 שקל']); // rendered sibling message
  const editP = el('p', null, ['עריכה -5 כאן']);
  const editBox = el('div', { contenteditable: 'true', class: 'ProseMirror' }, [editP]);
  const root = el('div', { class: 'standard-markdown' }, [realP, editBox]);
  I.processRoot(root);
  assert.ok(hasNum(realP), 'real rendered prose still gets the signed-number wrap');
  assert.equal(elementChildren(editP).length, 0, 'the edit box is NOT mutated (no typing freeze)');
  assert.equal(editP.textContent, 'עריכה -5 כאן', 'edit-box text intact');
});

test('processProseDir / processDirBlock never stamp dir on an editable block', () => {
  const p = el('p', null, ['React הוא ספרייה']); // Latin-opener, majority-RTL → would normally flip
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]);
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), null, 'no dir written on a composer paragraph');
  assert.equal(p.getAttribute('data-rtl-dir'), null, 'no override stamp on a composer paragraph');

  const li = el('li', null, ['פריט עברית']);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [el('ul', null, [li])]);
  I.processDirBlock(li);
  assert.equal(li.getAttribute('dir'), null, 'no dir written on a composer list item');
});

// ========================================================================================
// DEEP edge cases — "is there ANOTHER sign/char that freezes the composer?". Every content
// pass mutates the DOM on some trigger; each below would have desynced ProseMirror. For each
// family: assert the composer/edit box is spared AND a CONTROL proving the trigger fires on
// rendered prose (so a green editable case is the guard, not a dead mock).
// ========================================================================================

// §3.4/§8.F — EVERY signed-number shape, not just "-5": plus sign, U+2212 minus, decimals,
// Arabic-Indic and Persian digits. All detach their sign in RTL, so all are wrap targets.
const SIGNED_CASES = [
  ['plus', 'טמפ +5 מעלות'],
  ['unicode-minus U+2212', 'טמפ −5 מעלות'],
  ['decimal', 'מחיר -3.14 שקל'],
  ['arabic-indic digits', 'מחיר -٥ ש'],
  ['persian digits', 'מחיר -۵ ت'],
];
for (const [label, txt] of SIGNED_CASES) {
  test(`signed-number (${label}) is spared in the composer but wrapped when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.wrapSignedNumbersInBlock(cp);
    assert.equal(elementChildren(cp).length, 0, `composer: "${txt}" not mutated`);
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.wrapSignedNumbersInBlock(rp);
    assert.ok(hasNum(rp), `rendered: "${txt}" got a data-rtl-num wrap (trigger fires)`);
    assert.equal(rp.textContent, txt, 'rendered text still byte-for-byte');
  });
}

// §8.F — arrows. Inside a Hebrew block each is wrapped for a visual flip; in the composer that
// mutation would freeze typing. Covers →, ←, ⇒, ↔, ➜.
const ARROW_CASES = ['שלב → הבא', 'חזרה ← אחורה', 'א ⇒ ב', 'א ↔ ב', 'צעד ➜ קדימה'];
for (const txt of ARROW_CASES) {
  test(`arrow line "${txt}" is spared in the composer but flipped when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.wrapArrowsInBlock(cp);
    assert.equal(cp.querySelector('[data-rtl-arrow]'), null, 'composer: arrow not wrapped');
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.wrapArrowsInBlock(rp);
    assert.ok(rp.querySelector('[data-rtl-arrow]'), 'rendered: arrow wrapped (trigger fires)');
    assert.equal(rp.textContent, txt, 'rendered text byte-for-byte');
  });
}

// §8.F — math RELATIONS / arithmetic. Direction-INDEPENDENT (walks the whole root), so even a
// neutral/English composer line "3 < 5" is a target. Covers <, ≤, ∈, ⊂, arithmetic, ×.
const RELATION_CASES = ['3 < 5', 'x ≤ 4', 'a ∈ B', '15 + 7 = 22', '2 × 3', 'ℕ ⊂ ℤ'];
for (const txt of RELATION_CASES) {
  test(`relation "${txt}" is spared in the composer but isolated when rendered`, () => {
    const cp = el('p', null, [txt]);
    const composer = composerHost(cp);
    I.wrapRelationsUnder(composer);
    assert.equal(cp.querySelector('[data-rtl-relation]'), null, 'composer: relation not wrapped');
    assert.equal(cp.textContent, txt, 'composer text intact');

    const rp = el('p', null, [txt]);
    const root = renderedHost(rp);
    I.wrapRelationsUnder(root);
    assert.ok(rp.querySelector('[data-rtl-relation]'), 'rendered: relation isolated (trigger fires)');
    assert.equal(rp.textContent, txt, 'rendered text byte-for-byte');
  });
}

// §3.2/§8.K — Latin-opener majority-RTL line ("React הוא ספרייה", "8c. בדיקה") gets a forced
// dir + inline style; doing that to a ProseMirror paragraph fights the editor. Spare it.
const OVERRIDE_CASES = ['React הוא ספרייה', '8c. בדיקה ראשונה'];
for (const txt of OVERRIDE_CASES) {
  test(`prose-dir override for "${txt}" is suppressed in the composer, applied when rendered`, () => {
    const cp = el('p', null, [txt]);
    composerHost(cp);
    I.processProseDir(cp);
    assert.equal(cp.getAttribute('dir'), null, 'composer: no dir stamped');
    assert.equal(cp.getAttribute('data-rtl-dir'), null, 'composer: no override stamp');

    const rp = el('p', null, [txt]);
    renderedHost(rp);
    I.processProseDir(rp);
    assert.equal(rp.getAttribute('data-rtl-dir'), 'rtl', 'rendered: override applied (trigger fires)');
  });
}

// §8.K safety net — an English sentence that merely CONTAINS Hebrew is majority-LTR, so it must
// NOT be flipped, in the composer OR when rendered.
test('majority-English line with embedded Hebrew is never flipped (composer or rendered)', () => {
  const txt = 'The term שלום means peace';
  const cp = el('p', null, [txt]);
  composerHost(cp);
  I.processProseDir(cp);
  assert.equal(cp.getAttribute('data-rtl-dir'), null, 'composer: untouched');

  const rp = el('p', null, [txt]);
  renderedHost(rp);
  I.processProseDir(rp);
  assert.equal(rp.getAttribute('data-rtl-dir'), null, 'rendered: English not flipped (§8.K)');
});

// New guards (this fix): TABLE column-order and mis-fenced CODE block. Reachable when EDITING a
// message in place (root = message root containing the contenteditable) — must not mutate it.
test('a table inside an edit box is not processed; a rendered table is', () => {
  const rows = [['שם', 'גיל'], ['דני', '30'], ['רינה', '25']];
  const ct = htable(rows);
  editHost(ct);
  I.processTable(ct);
  assert.equal(ct.getAttribute('data-rtl-done'), null, 'edit-box table: guard returns before processing');
  assert.equal(ct.getAttribute('dir'), null, 'edit-box table: no dir flip');

  const rt = htable(rows);
  renderedHost(rt);
  I.processTable(rt);
  assert.equal(rt.getAttribute('data-rtl-done'), '1', 'rendered table: processed (trigger fires)');
});

test('a fenced block inside an edit box is not tagged; a rendered Hebrew-prose fence is', () => {
  const cpre = el('pre', null, ['שלום עולם זה טקסט בעברית']);
  editHost(cpre);
  I.processCodeBlock(cpre);
  assert.equal(cpre.getAttribute('data-rtl-done'), null, 'edit-box fence: guard returns first');
  assert.equal(cpre.hasAttribute('data-rtl-text'), false, 'edit-box fence: not tagged RTL');

  const rpre = el('pre', null, ['שלום עולם זה טקסט בעברית']);
  renderedHost(rpre);
  I.processCodeBlock(rpre);
  assert.equal(rpre.getAttribute('data-rtl-text'), '', 'rendered fence: tagged RTL prose (trigger fires)');
});

// The SYNCHRONOUS add path (processAdded) runs on freshly-inserted nodes before paint — it must
// also spare the composer (ProseMirror inserts paragraphs/lists/tables as the user types).
test('processAdded does not mutate a list / Latin-opener / table inserted into the composer', () => {
  const li = el('li', null, ['פריט עברית']);
  const p = el('p', null, ['React הוא ספרייה']);
  const tbl = htable([['שם'], ['דני']]);
  const composer = composerHost(el('div', null, [el('ul', null, [li]), p, tbl]));
  I.processAdded(composer);
  assert.equal(li.getAttribute('dir'), null, 'composer list item: no dir');
  assert.equal(p.getAttribute('data-rtl-dir'), null, 'composer paragraph: no override');
  assert.equal(tbl.getAttribute('data-rtl-done'), null, 'composer table: not processed');
});

// End-to-end: a kitchen-sink RTL line (signed number + relation + arrow) typed in the composer
// stays completely inert; the same line rendered gets all three transforms.
test('kitchen-sink RTL line: inert in composer, fully transformed when rendered', () => {
  const txt = 'טמפ -5 ואז 3 < 5 ואז → הבא';

  const cp = el('p', null, [txt]);
  const composer = composerHost(cp);
  I.processRoot(composer);
  assert.equal(elementChildren(cp).length, 0, 'composer: nothing wrapped');
  assert.equal(cp.textContent, txt, 'composer: text byte-for-byte');

  const rp = el('p', null, [txt]);
  const root = renderedHost(rp);
  I.processRoot(root);
  assert.ok(rp.querySelector('[data-rtl-num]'), 'rendered: signed number wrapped');
  assert.ok(rp.querySelector('[data-rtl-relation]'), 'rendered: relation isolated');
  assert.ok(rp.querySelector('[data-rtl-arrow]'), 'rendered: arrow flipped');
  assert.equal(rp.textContent, txt, 'rendered: text still byte-for-byte (no control chars)');
});

// ---- rare editable variants (pre-merge exhaustive sweep) ----------------------------------
test('contenteditable="plaintext-only" is guarded like the composer (no "-5" freeze)', () => {
  const p = el('p', null, ['המחיר -5 שקל']);
  el('div', { contenteditable: 'plaintext-only' }, [p]);
  assert.equal(I.inEditable(p), true, 'plaintext-only is an editable host');
  I.wrapSignedNumbersInBlock(p);
  assert.equal(p.querySelector('[data-rtl-num]'), null, 'no signed-number wrap inside a plaintext-only editor');
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), null, 'no dir stamped inside a plaintext-only editor');
});

test('a relation typed in the in-place edit box is never isolated (no wrapper injected)', () => {
  const p = el('p', null, ['האם 3 < 5 נכון']);
  const root = renderedHost(el('div', { contenteditable: 'true', class: 'ProseMirror' }, [p]));
  I.processRoot(root); // root is the message root containing the edit box
  assert.equal(p.querySelector('[data-rtl-relation]'), null, 'relation pass skips the editable (noInject)');
  assert.equal(elementChildren(p).length, 0, 'edit-box paragraph untouched');
});

test('a NESTED editable (editable within editable) is still fully guarded', () => {
  const p = el('p', null, ['טמפ -5 ואז 3 < 5']);
  const inner = el('div', { contenteditable: 'true' }, [p]);
  el('div', { contenteditable: 'true', class: 'ProseMirror' }, [inner]);
  I.wrapSignedNumbersInBlock(p);
  I.wrapArrowsInBlock(p);
  assert.equal(elementChildren(p).length, 0, 'nested editable: nothing wrapped');
});

test('a composer that ALSO matches a messageRoot class (.prose) still early-returns', () => {
  const p = el('p', null, ['טמפ -5']);
  // some Claude versions put .prose on the contenteditable itself
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror prose' }, [p]);
  I.processRoot(composer);
  assert.equal(p.querySelector('[data-rtl-num]'), null, 'still treated as an input surface, not prose');
  assert.equal(elementChildren(p).length, 0, 'composer paragraph untouched');
});

test('a leaf deep under a BARE .ProseMirror (no contenteditable attr) is still spared', () => {
  const p = el('p', null, ['מחיר -5']);
  el('div', { class: 'ProseMirror' }, [el('div', null, [el('div', null, [el('div', null, [p])])])]);
  assert.equal(I.inEditable(p), true, 'bare .ProseMirror is an editable host; closest climbs any depth');
  I.wrapSignedNumbersInBlock(p);
  assert.equal(p.querySelector('[data-rtl-num]'), null, 'spared even nested 3 levels deep');
});

test('a <textarea> whose value text is relation-shaped is never injected into', () => {
  const ta = el('textarea', null, ['3 < 5']);
  const root = renderedHost(ta);
  I.wrapRelationsUnder(root);
  assert.equal(ta.querySelector('[data-rtl-relation]'), null, 'textarea content untouched (noInject)');
  assert.equal(ta.childNodes.length, 1, 'textarea text node left whole');
});
