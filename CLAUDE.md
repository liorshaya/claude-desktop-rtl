# claude-rtl — project memory

Smooth RTL (Hebrew/Arabic/Persian) for Claude Desktop (macOS) + claude.ai,
from one pure engine. **Read `ARCHITECTURE.md` before any non-trivial work — it is
the single source of truth.** Section refs (§) point to it.

## Hard rules (never violate)
- `engine/` is PURE and DOM-free (no document/window). Must stay unit-testable.
- CSS `unicode-bidi: plaintext` per leaf block is the SOLE base-direction mechanism
  for prose. JS NEVER sets `dir` on a prose block or a container — only on `<table>`
  (column flip), on input boxes / JS-created islands, and on DECORATED blocks
  (`<ul>/<ol>/<li>` markers, `<blockquote>` bar) where the decoration must sit on the
  content side — via content-derived `detectBlockDir` (§6; self-determining, §8.K holds). (§3.2, §8.K)
- Direction-detection fallback is `null`, never a forced `'rtl'`. (§3.2)
- NEVER inject U+200E/200F or any bidi control char — copy/paste & Ctrl-F must return
  Claude's text byte-for-byte. (§3.6, §8.J)
- Zero network, zero telemetry, zero stored data — anywhere.
- NEVER modify `/Applications/Claude.app`. Patch a copy at `~/Applications/Claude-RTL.app`. (§7)
- Ad-hoc re-sign MUST preserve entitlements (Cowork breaks otherwise). (§7)
- RTL payload → renderer bundles only. Into the main entry put ONLY the
  `force-ui-direction=ltr` switch (full payload in main → black screen). (§7, §9)

## Conventions
- Vanilla ES modules in engine/ and dom/. Tests: `node --test`.
- Classify by code point (`codePointAt`), astral-safe.
- Idempotent everywhere (patch, observer, islands); stamp processed nodes.
- Small commits, one logical change each. One branch per phase.

## Workflow
- Phases P0–P6 live in `ROADMAP.md` (not here). One phase per branch.
- Propose a plan before writing code; I review the diff before merge.
- P0 is tests-first: turn the §13 corpus into failing `node --test` cases, then green.