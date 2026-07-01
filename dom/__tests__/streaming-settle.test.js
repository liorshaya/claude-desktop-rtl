'use strict';
// dom/__tests__/streaming-settle.test.js — regression for the STAMP-FREEZE family (§3.3).
//
// The bug: every idempotency stamp (data-rtl-done / data-rtl-arrows / data-rtl-nums, and the
// dir attributes processDirBlock/processProseDir write) was PERMANENT. But the passes also run
// on half-streamed content — synchronously from processAdded when a node mounts, and from the
// debounced pass whenever the stream pauses >250ms — so a decision made on a partial block
// froze forever: streamed table rows never got aligned, a "React"-opener list item stayed LTR
// after its Hebrew streamed in, arrows/signed numbers that arrived after the first settle were
// never wrapped, and — worst, a §8.K violation — a prose override applied to a majority-RTL
// PREFIX ("React הוא…") stayed even when the paragraph ended up majority-English.
//
// The fix: stamps carry a content FINGERPRINT (decision-relevant text length; streaming only
// appends), so a changed block is re-decided and an unchanged block short-circuits exactly as
// before (§3.3: "never change retroactively UNLESS its text content truly changed").

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el, text, elementChildren } = require('./harness.js');

const I = loadInternals();

const host = (child) => el('div', { class: 'standard-markdown' }, [child]);

test('table: rows streamed after a mid-stream settle still flip dir + align columns', () => {
  const tbody = el('tbody');
  tbody.appendChild(el('tr', null, [el('td', null, ['Name']), el('td', null, ['Value'])]));
  const table = el('table', null, [tbody]);
  const root = host(table);
  I.processTable(table); // settle #1, mid-stream: all-English so far → LTR, no dir
  assert.equal(table.getAttribute('dir'), null, 'partial table: correctly LTR at first');
  for (const [a, b] of [['שם', 'ערך'], ['גיל', 'שלושים'], ['עיר', 'תל אביב']]) {
    tbody.appendChild(el('tr', null, [el('td', null, [a]), el('td', null, [b])]));
  }
  I.processRoot(root); // settle #2: stream done, majority now Hebrew
  assert.equal(table.getAttribute('dir'), 'rtl', 'majority-Hebrew table re-decided to RTL');
  const lateCell = tbody.childNodes[1].childNodes[0];
  assert.equal(lateCell.getAttribute('data-rtl-col'), 'rtl', 'late-streamed cell got its column alignment');
});

test('table: OUR stale dir="rtl" is undone when streamed rows flip the majority (never a foreign dir)', () => {
  const tbody = el('tbody');
  tbody.appendChild(el('tr', null, [el('td', null, ['שם']), el('td', null, ['ערך'])]));
  const table = el('table', null, [tbody]);
  host(table);
  I.processTable(table); // Hebrew-only so far → dir="rtl"
  assert.equal(table.getAttribute('dir'), 'rtl');
  for (let i = 0; i < 3; i++) {
    tbody.appendChild(el('tr', null, [el('td', null, ['English cell here']), el('td', null, ['more English text'])]));
  }
  I.processTable(table); // majority flipped to English
  assert.equal(table.getAttribute('dir'), null, 'our provisional flip is removed');
  // a foreign explicit dir is NOT ours to remove
  const ftable = el('table', { dir: 'rtl' }, [el('tbody', null, [el('tr', null, [el('td', null, ['English only'])])])]);
  host(ftable);
  I.processTable(ftable);
  assert.equal(ftable.getAttribute('dir'), 'rtl', 'a dir that predates us is respected');
});

test('li: a "React"-opener whose Hebrew streams in later is re-decided to RTL (§8.K reverse)', () => {
  const li = el('li', null, ['React']);
  host(el('ul', null, [li]));
  I.processDirBlock(li); // sync processAdded path at mount: partial text is just "React"
  assert.equal(li.getAttribute('dir'), 'ltr', 'provisional decision on the partial text');
  li.appendChild(text(' הוא ספרייה מאוד פופולרית בעולם'));
  I.processDirBlock(li); // settle pass after the stream
  assert.equal(li.getAttribute('dir'), 'rtl', 'Latin-opener majority-RTL item re-decided RTL');
});

test('li/blockquote: an explicit dir that is NOT ours stays untouched', () => {
  const li = el('li', { dir: 'ltr' }, ['שלום עולם ועוד הרבה טקסט בעברית']);
  host(el('ul', null, [li]));
  I.processDirBlock(li);
  assert.equal(li.getAttribute('dir'), 'ltr', 'foreign explicit dir respected');
});

test('prose override on a half-streamed prefix is UNDONE when the paragraph ends majority-English (§8.K)', () => {
  const p = el('p', null, ['React הוא כלי']);
  host(p);
  I.processProseDir(p); // sync at mount: Latin opener + majority-RTL prefix → override fires
  assert.equal(p.getAttribute('dir'), 'rtl', 'provisional override on the prefix');
  p.appendChild(text(' but actually this paragraph continues in English and is clearly an English sentence overall.'));
  I.processProseDir(p); // settle pass
  assert.equal(p.getAttribute('dir'), null, 'majority-English paragraph is not left flipped');
  assert.equal(p.getAttribute('data-rtl-dir'), null, 'override stamp cleared');
  assert.equal(p.style.getPropertyValue('direction'), '', 'inline direction cleared');
  assert.equal(p.style.getPropertyValue('unicode-bidi'), '', 'inline unicode-bidi cleared');
});

test('prose override still fires when the RTL majority only arrives AFTER the first settle', () => {
  const p = el('p', null, ['React']);
  host(p);
  I.processProseDir(p); // no override on pure-Latin prefix
  assert.equal(p.getAttribute('dir'), null);
  p.appendChild(text(' הוא ספרייה לבניית ממשקים והוא פופולרי מאוד'));
  I.processProseDir(p);
  assert.equal(p.getAttribute('dir'), 'rtl', 'override applied once the block is majority-RTL');
});

test('arrows: an arrow streamed in after the block was first stamped still gets wrapped', () => {
  const p = el('p', null, ['שלב ראשון בתהליך הזה']);
  host(p);
  I.wrapArrowsInBlock(p); // settle #1: no arrows yet → stamped
  p.appendChild(text(' ואז שלב → אחרון'));
  I.wrapArrowsInBlock(p); // settle #2
  const span = p.querySelector('[data-rtl-arrow]');
  assert.notEqual(span, null, 'late-streamed arrow wrapped');
  assert.equal(p.textContent, 'שלב ראשון בתהליך הזה ואז שלב → אחרון', 'text preserved byte-for-byte');
});

test('signed numbers: a "-5" streamed in after the block was first stamped still gets wrapped', () => {
  const p = el('p', null, ['הטמפרטורה ירדה מאוד']);
  host(p);
  I.wrapSignedNumbersInBlock(p);
  p.appendChild(text(' עד -5 מעלות'));
  I.wrapSignedNumbersInBlock(p);
  assert.notEqual(p.querySelector('[data-rtl-num]'), null, 'late-streamed signed number wrapped');
});

test('code fence: prose→code and code→prose re-decided as the fence streams', () => {
  // opens looking like a Hebrew prose "table" → tagged; real code structure streams in → untagged
  const pre = el('pre', null, ['תה ירוק   10\nתה שחור   12']);
  host(pre);
  I.processCodeBlock(pre);
  assert.equal(pre.getAttribute('data-rtl-text'), '', 'Hebrew fence tagged as prose');
  pre.appendChild(text('\nfunction brew() { return 42; }'));
  I.processCodeBlock(pre);
  assert.equal(pre.getAttribute('data-rtl-text'), null, 'code structure arrived → tag removed');
});

test('control: unchanged content is NOT re-decided (fingerprint short-circuit, no churn)', () => {
  const li = el('li', null, ['פריט בעברית']);
  host(el('ul', null, [li]));
  I.processDirBlock(li);
  assert.equal(li.getAttribute('dir'), 'rtl');
  li.setAttribute('dir', 'ltr'); // simulate an outside write between passes
  I.processDirBlock(li); // same content → stamp matches → we must not touch it again
  assert.equal(li.getAttribute('dir'), 'ltr', 'no re-processing without a content change');
});

test('control: wrapping itself never invalidates the fingerprint (no self-retrigger loop)', () => {
  const p = el('p', null, ['ואז שלב → אחרון']);
  host(p);
  I.wrapArrowsInBlock(p);
  const stamped = p.getAttribute('data-rtl-arrows');
  const before = elementChildren(p).length;
  I.wrapArrowsInBlock(p); // wraps preserve textContent → same fingerprint → no-op
  assert.equal(p.getAttribute('data-rtl-arrows'), stamped, 'fingerprint unchanged by our own wrap');
  assert.equal(elementChildren(p).length, before, 'no double-wrapping');
});

test('work cap: a >400-block message is fully processed across passes, not silently truncated', () => {
  // The cap used to count nodes SEEN (stamped blocks included), so indices past 400 were
  // unreachable on EVERY pass. It now counts blocks that needed work, and processRoot reports
  // truncation so the observer re-queues the root until the message is fully covered.
  const ul = el('ul');
  const items = [];
  for (let i = 0; i < 450; i++) {
    const li = el('li', null, ['פריט מספר ' + i]);
    items.push(li);
    ul.appendChild(li);
  }
  const root = host(ul);
  let passes = 0;
  while (I.processRoot(root) === true) {
    passes += 1;
    assert.ok(passes < 10, 'converges (each truncated pass makes MAX_NODES_PER_PASS progress)');
  }
  const missing = items.filter((li) => li.getAttribute('dir') !== 'rtl').length;
  assert.equal(missing, 0, 'every item eventually processed (tail not silently dropped)');
  assert.ok(passes >= 1, 'the first pass really was truncated (the control that the cap fired)');
});

test("table undo never strips an AUTHOR's dir, even after we stamped the table (follow-up)", () => {
  // A user-authored artifact table carries its own dir="rtl". We stamp it (DONE fingerprint)
  // on first sight; when its content then changes and the majority is not RTL, the undo path
  // must not remove the author's dir — only a flip WE made (data-rtl-tdir) is ours to undo.
  const tbody = el('tbody');
  tbody.appendChild(el('tr', null, [el('td', null, ['English cell']), el('td', null, ['more English'])]));
  const table = el('table', { dir: 'rtl' }, [tbody]); // author's own dir
  host(table);
  I.processTable(table); // stamps DONE; tableDir says LTR-majority; no data-rtl-tdir
  assert.equal(table.getAttribute('dir'), 'rtl', 'author dir kept on first pass');
  tbody.appendChild(el('tr', null, [el('td', null, ['streamed English']), el('td', null, ['again English'])]));
  I.processTable(table); // content changed → re-decided; still must not touch the author dir
  assert.equal(table.getAttribute('dir'), 'rtl', "author dir survives re-decision (not ours to undo)");
});

test('relations cap: >400 no-run math-ish nodes must NOT report truncation (no re-queue loop)', () => {
  // "(see, note)" passes the cheap hasMathRun gate (bracket + comma) but relationRuns finds no
  // run — such nodes stay accepted forever. Counting them toward truncation made the observer
  // re-queue the root every settle window for the message's lifetime.
  const root = el('div', { class: 'standard-markdown' });
  for (let i = 0; i < 420; i++) root.appendChild(el('p', null, ['some text (see, note) here']));
  assert.equal(I.wrapRelationsUnder(root), false, 'nothing to split → not truncated');
});

test('relations cap: >400 nodes with REAL runs truncate once, then finish on the next pass', () => {
  const root = el('div', { class: 'standard-markdown' });
  const ps = [];
  for (let i = 0; i < 420; i++) {
    const p = el('p', null, ['נתון ש-3 < 5 כאן']);
    ps.push(p);
    root.appendChild(p);
  }
  assert.equal(I.wrapRelationsUnder(root), true, 'first pass hits the mutation cap');
  assert.equal(I.wrapRelationsUnder(root), false, 'second pass finishes the tail');
  const unwrapped = ps.filter((p) => p.querySelector('[data-rtl-relation]') === null).length;
  assert.equal(unwrapped, 0, 'every node eventually wrapped');
});
