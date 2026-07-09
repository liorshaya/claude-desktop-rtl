'use strict';
// engine/__tests__/derivative-prime.test.js — the DERIVATIVE PRIME cut (§8.F).
//
// Reported live: "result - f'(x) = 12x³ + 10x - 7 עם הזוהר הירוק" rendered with the
// expression torn apart — relationRuns isolated "(x) = 12x³ + 10x - 7" and left "f'"
// outside the LTR island, so RTL reordered the function name away from its own call:
// the screenshot read "…7'result - f". The prime of a derivative (f', x'', θ′ — ASCII
// apostrophe, smart quote ’, or the real primes ′ ″ ‴) must bind to the identifier it
// decorates so the WHOLE call joins the run.
//
// Guard rails: a prime binds only when it FOLLOWS a letter-ish term char — never after a
// digit (so a quote right after a number, "'15 + 7 = 22'", doesn't swallow the closing
// quote) and never after Hebrew (the geresh in "הקאץ'" is prose, not a derivative).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relationRuns } = require('../relations.js');

const wraps = (text) => relationRuns(text).map(([a, b]) => text.slice(a, b));

test('the reported line: the whole derivative equation is one run, prime included', () => {
  // "result - f'(x)" joins too: a binary "-" with operands on both sides is chain growth
  // (pre-existing semantics — "a - b = c" is subtraction). Isolating the English word LTR is
  // a visual no-op (it is already strong-LTR); what matters is that f' sits INSIDE the run.
  assert.deepEqual(
    wraps("result - f'(x) = 12x³ + 10x - 7 עם הזוהר הירוק"),
    ["result - f'(x) = 12x³ + 10x - 7"]
  );
});

test('numbered-list variant of the reported line', () => {
  assert.deepEqual(
    wraps("6. result - f'(x) = 12x³ + 10x - 7 עם הזוהר הירוק"),
    ["result - f'(x) = 12x³ + 10x - 7"]
  );
});

test('control: without the prime the run was already whole (regression stays green)', () => {
  assert.deepEqual(wraps('f(x) = 12x³ + 10x - 7'), ['f(x) = 12x³ + 10x - 7']);
});

test('second derivative and third: f\'\'(x), f\'\'\'(x)', () => {
  assert.deepEqual(wraps("הנגזרת השנייה f''(x) = 24x + 10 חיובית"), ["f''(x) = 24x + 10"]);
  assert.deepEqual(wraps("וגם f'''(x) = 24 קבועה"), ["f'''(x) = 24"]);
});

test('typographic primes: U+2032/U+2033 and the markdown smart quote U+2019', () => {
  assert.deepEqual(wraps('בגרף f′(x) = 3x² - 4 עולה'), ['f′(x) = 3x² - 4']);
  assert.deepEqual(wraps('בגרף f″(x) = 6x יורדת'), ['f″(x) = 6x']);
  assert.deepEqual(wraps('בגרף f’(x) = 3x² - 4 עולה'), ['f’(x) = 3x² - 4']);
});

test('a primed VARIABLE (no call brackets) binds on both sides of a relation', () => {
  assert.deepEqual(wraps("נגדיר x' = 2x + 3 ונציב"), ["x' = 2x + 3"]);
  assert.deepEqual(wraps("ולכן y = g'(t) - 5 בקירוב"), ["y = g'(t) - 5"]);
});

test('a primed call as a standalone math bracket: the name joins the group', () => {
  assert.deepEqual(wraps("הנקודות f'(a, b) על העקומה"), ["f'(a, b)"]);
});

test('chained: the primed call participates in a longer comparison chain', () => {
  assert.deepEqual(wraps("0 < f'(x) ≤ 4 בתחום"), ["0 < f'(x) ≤ 4"]);
});

test('Hebrew geresh stays prose: הקאץ׳-style apostrophes never join a nearby run', () => {
  assert.deepEqual(wraps("הקאץ' הוא ש-15 + 7 = 22 בדיוק"), ['15 + 7 = 22']);
});

test('quotes AROUND an equation are not swallowed (no prime after a digit)', () => {
  assert.deepEqual(wraps("החישוב '15 + 7 = 22' פשוט"), ['15 + 7 = 22']);
});

test('a quoted Hebrew word before an equation is untouched', () => {
  assert.deepEqual(wraps("אמר 'שלום' ואז חישב 3 + 4 = 7 מהר"), ['3 + 4 = 7']);
});

test('prose possessive next to a letters-only relation still does not seed (gate intact)', () => {
  assert.deepEqual(wraps("John's answer = correct לגמרי"), []);
});
