'use strict';
// dom/__tests__/documented-limitations.test.js — DOCUMENTED-LIMITATION PINS.
//
// Each test here asserts CURRENT, KNOWN-IMPERFECT behavior that the audit reports accepted
// deliberately (visual-only residue, or unreachable via append-only streaming). They exist
// so the limitation is (a) on record next to the code, and (b) a future fix flips a test —
// making the behavior change a reviewed decision instead of a silent drift. If one of these
// starts failing because the behavior IMPROVED, update the test and the report together.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, text } = require('./harness.js');

const I = loadInternals();
const host = (child) => el('div', { class: 'standard-markdown' }, [child]);
const tr = (cells) => el('tr', null, cells.map((t) => el('td', null, [t])));

test('LIMITATION: an arrow wrapped while the block was RTL stays flipped after the majority turns LTR', () => {
  // Wraps are never UNDONE on a direction flip — new wraps are correctly gated, but existing
  // spans persist (visual-only; append-driven flips this late are rare; accepted in the audit).
  const p = el('p', null, ['שלב → הבא']);
  host(p);
  I.wrapArrowsInBlock(p);
  assert.notEqual(p.querySelector('[data-rtl-arrow]'), null, 'setup: wrapped while RTL');
  p.appendChild(text(' followed by a very long English continuation that clearly flips the majority'));
  I.wrapArrowsInBlock(p); // fingerprint changed → re-evaluated; gate now says LTR
  assert.notEqual(p.querySelector('[data-rtl-arrow]'), null,
    'the stale span persists (no unwrap machinery — documented residue)');
  assert.equal(p.textContent, 'שלב → הבא followed by a very long English continuation that clearly flips the majority',
    'fidelity is still intact either way');
});

test('LIMITATION: a fence reclassified prose→code keeps arrow spans from its prose phase', () => {
  // While the fence looked like Hebrew prose it was tagged data-rtl-text and its arrow was
  // (correctly) wrapped. When code structure streams in, the tag is removed — but the span
  // from the prose phase persists inside what is now an LTR code block (one mirrored glyph;
  // accepted in the audit as part of the same no-unwrap residue class).
  const pre = el('pre', null, ['תה ירוק ← משקה\nתה שחור   12']);
  const root = host(pre);
  I.processRoot(root); // tags the fence as prose and wraps its arrow
  assert.equal(pre.getAttribute('data-rtl-text'), '', 'setup: mis-fenced Hebrew prose');
  assert.notEqual(pre.querySelector('[data-rtl-arrow]'), null, 'setup: arrow wrapped as prose');
  pre.appendChild(text('\nfunction brew() { return 42; }'));
  I.processRoot(root); // structure arrived → reclassified to code
  assert.equal(pre.getAttribute('data-rtl-text'), null, 'reclassified: the prose tag is gone');
  assert.notEqual(pre.querySelector('[data-rtl-arrow]'), null,
    'but the prose-phase arrow span persists (documented residue)');
});

test('LIMITATION: a same-LENGTH in-place rewrite is invisible to the content fingerprint', () => {
  // The stamp is the decision-relevant text LENGTH — chosen because streaming only appends,
  // so growth always changes it. An equal-length REPLACEMENT (React re-rendering different
  // text of identical length) keeps the old decision. Accepted: real streams append.
  const p = el('p', null, ['React הוא כלי']); // 13 chars, Latin opener + RTL majority
  host(p);
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), 'rtl', 'setup: override fired');
  p.textContent = 'Reacts belong'; // also 13 chars — now pure English
  assert.equal(p.textContent.length, 13, 'control: the replacement really is same-length');
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), 'rtl',
    'stale override persists — the fingerprint cannot see a same-length rewrite');
  // ...while ANY length change is caught immediately (the boundary of the limitation):
  p.textContent = 'Reacts belong!'; // 14 chars, still English
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), null, 'one char longer → re-decided and undone (§8.K)');
});

test("LIMITATION: undoing OUR table flip removes the dir instead of restoring an author's overwritten ltr", () => {
  // Layer-1 has always overwritten an authored dir when the majority says RTL (pre-audit
  // behavior, kept). The undo added by the audit removes our flip but cannot know the
  // author's original value — the table falls back to inherited (LTR in practice), it is
  // not restored to the literal dir="ltr". On record as the accepted residue of the fix.
  const tbody = el('tbody', null, [tr(['שם', 'ערך'])]);
  const table = el('table', { dir: 'ltr' }, [tbody]); // author says LTR, content says RTL
  host(table);
  I.processTable(table);
  assert.equal(table.getAttribute('dir'), 'rtl', 'layer-1 majority overwrites the authored dir (pre-existing)');
  assert.equal(table.getAttribute('data-rtl-tdir'), '1', 'and marks the flip as ours');
  tbody.appendChild(tr(['English one', 'English two']));
  tbody.appendChild(tr(['English three', 'English four']));
  I.processTable(table); // majority flipped → undo fires
  assert.equal(table.getAttribute('dir'), null,
    "our flip is removed, the author's original ltr is NOT restored (documented residue)");
});
