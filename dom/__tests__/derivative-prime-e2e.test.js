'use strict';
// dom/__tests__/derivative-prime-e2e.test.js — the derivative-prime cut through the real
// DOM pass (§8.F): the reported line must end up with ONE data-rtl-relation span whose
// text includes the primed function name, so RTL can no longer reorder "f'" away from
// its own call (the "…7'result - f" screenshot).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInternals, el } = require('./harness.js');

const I = loadInternals();

function relationSpans(root) {
  return root.querySelectorAll('[data-rtl-relation]').map((s) => s.textContent);
}

test('the reported line wraps as one whole-expression isolate, prime inside', () => {
  const p = el('p', null, ["result - f'(x) = 12x³ + 10x - 7 עם הזוהר הירוק"]);
  const root = el('div', { class: 'standard-markdown' }, [p]);
  I.processRoot(root);
  const spans = relationSpans(root);
  assert.equal(spans.length, 1);
  assert.equal(spans[0], "result - f'(x) = 12x³ + 10x - 7");
  assert.ok(spans[0].includes("f'("), 'the primed call is inside the LTR island');
  assert.equal(p.textContent, "result - f'(x) = 12x³ + 10x - 7 עם הזוהר הירוק", 'byte-for-byte fidelity (§3.6)');
});

test('a second-derivative line in a Hebrew li wraps whole', () => {
  const li = el('li', null, ["הנגזרת השנייה f''(x) = 24x + 10 חיובית בתחום"]);
  const root = el('div', { class: 'standard-markdown' }, [el('ul', null, [li])]);
  I.processRoot(root);
  const spans = relationSpans(root);
  assert.deepEqual(spans, ["f''(x) = 24x + 10"]);
});

test('geresh prose next to math stays outside the isolate', () => {
  const p = el('p', null, ["הקאץ' הוא ש-15 + 7 = 22 בדיוק"]);
  const root = el('div', { class: 'standard-markdown' }, [p]);
  I.processRoot(root);
  assert.deepEqual(relationSpans(root), ['15 + 7 = 22']);
});
