# Contributing to Claude RTL

Thanks for helping make Hebrew & Arabic smooth in Claude — **PRs are very welcome.** This
is open source (MIT). The bar is simple: a small, single-purpose change with a green test
run. Below is everything you need.

## The shape of the project

| Path | What | Platform |
|---|---|---|
| `engine/` | The pure bidi **decision engine** — DOM-free, unit-tested | shared |
| `dom/` | CSS + the thin DOM layer that applies the engine's decisions | shared |
| `build/` | Inlines `engine/` + `dom/` into one payload IIFE | shared |
| `browser/` | The userscript + a CSS-only Stylus fallback | shared (any OS) |
| `desktop/` | The macOS patch pipeline (copy → inject → fuses → sign) + watcher + trust | macOS |
| `helper/` | `@electron/asar` + `@electron/fuses` compiled to a standalone Node SEA binary | build-time |
| `gui/` | The SwiftUI menu-bar app that wraps the pipeline | macOS |

**`docs/ARCHITECTURE.md` is the single source of truth.** Read the relevant `§` before
non-trivial work. `docs/ROADMAP.md` tracks the build phases.

## The hard rules (please don't break these)

1. **`engine/` is pure** — no `document`, `window`, or any DOM. It must stay unit-testable
   with `node --test`. Classify by **code point** (`codePointAt`, astral-safe).
2. **CSS `unicode-bidi: plaintext` per leaf block is the sole base-direction mechanism for
   prose.** JS never sets `dir` on a prose block or a container — only on `<table>`, input
   boxes, JS-created islands, and decorated blocks (`<ul>/<ol>/<li>/<blockquote>`) via
   content-derived direction. This is what prevents the "whole English doc flips RTL" bug.
3. **Never inject `U+200E`/`U+200F` or any bidi control character.** Copy/paste & Ctrl-F must
   return Claude's text byte-for-byte.
4. **Zero network, zero telemetry, zero stored data — anywhere.**
5. **Never modify `/Applications/Claude.app`.** Patch a copy; preserve entitlements when
   re-signing (so Cowork keeps working).

## Dev setup & tests

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
node --test engine/__tests__/*.test.js build/__tests__/*.test.js   # must be green
node build/build-payload.js                                        # build the payload
```

No dependencies to install for the engine/build — just Node 18+. The desktop pipeline also
uses `npx @electron/asar` / `@electron/fuses` in dev (the shipped `.app` bundles them).

## Adding behaviour

- **Every bidi edge case is a test first.** Add a `node --test` case under `engine/__tests__/`
  (the `§13` torture corpus is the spec), watch it fail, then implement to green.
- **Visual changes** (CSS/DOM) are verified in a real Claude conversation. The console
  diagnostics in **[docs/RUNBOOK-adopt-new-claude-version.md](docs/RUNBOOK-adopt-new-claude-version.md)**
  show how to inspect Claude's DOM — use them, since Claude's class names change over time.
- Keep selectors in `dom/surfaces.js`. When Claude updates its UI, that's the one file to
  re-point (the runbook walks through it).

## Want to add Windows?

This is the biggest open item, and the design is ready for it: `engine/`, `dom/`, `build/`,
`browser/` and the `helper/` (Node SEA works on Windows) are **already cross-platform** — the
same payload runs in Claude-for-Windows (also Electron). What's new is a Windows patch
pipeline (PowerShell; `%LOCALAPPDATA%\AnthropicClaude`; a Scheduled Task instead of launchd)
and a native GUI. The plan is platform subfolders (`desktop/windows`, `gui/windows`) with the
shared core untouched. Open an issue first so we can align.

## Commits & PRs

- Small commits, one logical change each. Conventional-ish messages (`feat(dom): …`,
  `fix(engine): …`, `docs: …`).
- Run `node --test` before pushing. For shell changes, `bash -n`.
- Describe what you verified (tests, and which surface you checked in a real conversation).
