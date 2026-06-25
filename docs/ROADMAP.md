# claude-rtl — Roadmap

Build order for the from-scratch RTL tool. Work ONE phase per branch, via the
`/claude-rtl-phase` skill. `ARCHITECTURE.md` (§) is the source of truth.
Status keys: TODO / DOING / DONE.

---

## P0 — Engine core   [DONE]
Branch: `p0-engine`
Context Required: `ARCHITECTURE.md` §0, §3, §8, §13
Build:
- `engine/ranges.js`  — strong-RTL ranges + digit class, `codePointAt`-based (§3.1)
- `engine/detect.js`  — `stripLeadingNoise` / `firstStrong` / `majority` /
  `detectBlockDir` / `cellDir` / `tableDir` (§3.2)
- `engine/numbers.js` — EN vs AN digits, signs, separators (§3.4)
- `engine/math.js`    — currency-aware LaTeX segmentation (§3.5)
- `engine/index.js`   — DOM-free public API (`module.exports` guard)
- `engine/__tests__/` — the §13 corpus as `node --test` cases
Done when:
- `node --test` is green on the full corpus.
- `detectBlockDir` fallback is `null` (never `'rtl'`); the §8.K mixed-doc case passes.
- No `document` / `window` reference anywhere in `engine/`.

## P1 — CSS + DOM layer (browser first)   [DONE]
Branch: `p1-dom`
Context Required: `ARCHITECTURE.md` §3.3, §3.6, §4, §5, §6 + `engine/`
Build:
- `dom/apply.css` (§4), `dom/apply.js` (§5), `dom/surfaces.js` (§6)
- `build/build-payload.*` — inline engine + dom into one IIFE string
- `browser/userscript.user.js`, `browser/style.user.css` (§12)
Done when:
- Userscript loaded on claude.ai: visual corpus passes, NO global flip, no flicker,
  copy/Ctrl-F fidelity intact, and the edit-message box gets `dir="auto"`.

## P2 — Desktop pipeline   [DONE]
Branch: `p2-desktop`
Context Required: `ARCHITECTURE.md` §7, §9 + `build/`
Build:
- `desktop/patch.sh` — copy → asar → fuses → ad-hoc sign (preserve entitlements) →
  icon; `force-ui-direction` ONLY in the main entry
- `desktop/preflight.sh` — node/npx, layout, writability checks (subset of §11)
Done when:
- `Claude-RTL.app` builds; original `/Applications/Claude.app` untouched; the app
  launches (no black screen); RTL is active; Cowork still works.

## P3 — Auto-reapply watcher   [DONE]
Branch: `p3-watcher`
Context Required: `ARCHITECTURE.md` §10
Build:
- `desktop/watch.sh`, `desktop/agent.plist` (launchd WatchPaths, ShipIt-aware)
Done when:
- Simulating a Claude update re-fires the patch after the swap settles;
  `--watch` / `--unwatch` toggle the LaunchAgent.

## P4 — Trust + preflights   [DONE]
Branch: `p4-trust`
Context Required: `ARCHITECTURE.md` §11
Build:
- `desktop/verify.sh` + signing tooling; harden `preflight.sh` (nvm/fnm shim, file-lock)
Done when:
- Payload + script signature verified before anything runs; preflights handle the
  known failure modes with specific, named errors.

## P5 — Coverage + polish   [DONE]
Branch: `p5-coverage`
Context Required: `ARCHITECTURE.md` §6, §12
Build:
- Artifacts iframe + Cowork output coverage; Hebrew font pack (`data:` URI)
Done when:
- Artifacts and Cowork render RTL correctly; the bundled font shows Hebrew glyphs.

## P6 — v1.0   [DONE]
Branch: `p6-release` (merged to `main`)
Context Required: `ARCHITECTURE.md` §13, §14
Build:
- Corpus screenshot gallery; bilingual (he/en/ar) README; contribution guide;
  "adopt a new Claude version" runbook
Done when:
- A non-technical user can install from the README and get smooth RTL. ✅
Notes:
- README (en + he + ar with language switcher), LICENSE (MIT), CONTRIBUTING,
  and `docs/RUNBOOK-adopt-new-claude-version.md` shipped.
- Screenshot gallery still pending real images (`assets/screenshots/`).

---

## Distribution & GUI   [DONE]
Built: a menu-bar SwiftUI app (`gui/`) that wraps `patch.sh` / `watch.sh`, plus a
standalone Node-SEA helper for `@electron/asar` + `@electron/fuses` — the shipped
`.app` needs neither system Node nor a checked-out repo. Ad-hoc signed (no $99
Developer ID): users build from source (`cd gui && ./build.sh`), which sidesteps
Gatekeeper. A user-initiated "Check for updates" reads the repo `VERSION` (the
project's only network call, manager-only).
Deferred (nice-to-have): Developer-ID-signed + notarized `.dmg`; onboarding window.
