---
paths:
  - "engine/**"
---

# Engine rules (load when editing engine/**)

The engine is a DIRECTION & ISOLATION DECISION engine, not a UAX#9 reimplementation —
the browser reorders characters; we only decide base direction + isolation.
See `ARCHITECTURE.md` §0, §3, §8.

## Purity (hard)
- No `document`, `window`, or any DOM/global. Pure functions only.
- End `index.js` with a `module.exports` guard so `node --test` can require it.
- Classify by CODE POINT via `codePointAt` (astral-safe), never UTF-16 code units.

## Detection (§3.2) — the load-bearing logic
- `detectBlockDir(text)`: `stripLeadingNoise` → `firstStrong` → if null, `majority`.
  Fallback is `null`. NEVER `return 'rtl'` as a fallback — that single bug is what
  flips English documents RTL (§8.K).
- `firstStrong`: first strong-RTL → 'rtl'; first strong-LTR → 'ltr'; else null.
- `stripLeadingNoise`: strip a leading URL / path / `code` / number / emoji / bullet
  before first-strong, so an RTL line that opens with "foo.js" still reads RTL.
- `cellDir` (TABLE CELLS ONLY): any RTL char → 'rtl' (a Hebrew column may have an
  English header like "ID"). A neutral-only cell → null.
- `tableDir`: header[0] is the semantic key — if it and the first data cell are RTL,
  the table is RTL regardless of LTR product-name headers; else header majority; else
  first-column majority.

## Numbers (§3.4)
- Hebrew uses EN digits (weak-LTR); Arabic/Persian may use AN (Arabic-Indic / Eastern).
- Do NOT over-set `dir` around numbers — `plaintext` already orders them. Only strip a
  LEADING number so it doesn't force an RTL paragraph to LTR.

## Math vs currency (§3.5)
- `$$…$$`, `\[…\]`, `\(…\)` are always math. Single `$…$` is math ONLY with a real
  LaTeX signal inside (`\cmd`, `^ _ { }`, a known macro). Otherwise it is currency
  (`$5.99`, `$5 to $10`) and stays text. Guard `₪ € £ ¥ %` too.

## Fidelity (hard)
- NEVER emit U+200E / U+200F or any bidi control char anywhere in engine output.

## Tests
- Every new edge case becomes a `node --test` case in `engine/__tests__/` BEFORE the
  implementation. The §13 corpus is the spec.
