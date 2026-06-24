---
paths:
  - "dom/**"
  - "browser/**"
  - "build/**"
---

# DOM / browser rules (load when editing dom|browser|build/**)

CSS does ~85% declaratively; JS is thin and surgical.
See `ARCHITECTURE.md` §4, §5, §6, §3.3, §3.6.

## The rule that prevents the "English-doc-forced-RTL" bug (§8.K)
- `unicode-bidi: plaintext` on each LEAF block is the SOLE base-direction mechanism for
  prose. It self-determines per block from its own content, immune to ancestors.
- `unicode-bidi` does NOT inherit — put it on the actual `<p>` / `<li>` / `<td>` / etc.,
  never on a container.
- JS NEVER sets `dir` on a prose block or on a container / message-root. JS sets `dir`
  only on `<table>` (column flip) and on input boxes / JS-created islands.

## DOM layer (§5)
- `dir="auto"` on BOTH the composer and the message-EDIT box; re-assert on `input`.
- One scoped, debounced `MutationObserver` per streamed message root. Idempotent
  (`data-rtl-done`); never re-walk the whole DOM per token.
- Streaming-settle (§3.3): provisional `dir="auto"` while a block streams; run the
  heavy table/island pass only once it settles. Don't let a settled block flip.
- Bail if `typeof document === 'undefined'`.

## Code / math / islands
- `pre`, `.code-block__code`, `code`, `.katex`, `mjx-container`, `math` →
  `direction: ltr; unicode-bidi: isolate`.
- Islands wrapped by JS use `dir` / CSS only — NEVER injected control characters.

## CSS hygiene
- Use `:where()` to keep specificity low; add `!important` only where Claude hard-sets
  `direction` / `text-align` inline.
- `overflow-wrap: anywhere` on RTL prose so long LTR URLs don't overflow the bubble.

## Build
- `build-payload` inlines `engine/` + `dom/` into one IIFE string; strip the
  `module.exports` guard. The result is safe to prepend to any renderer bundle.
