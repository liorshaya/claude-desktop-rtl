---
paths:
  - "desktop/**"
---

# Desktop pipeline rules (load when editing desktop/**)

macOS only. See `ARCHITECTURE.md` §7, §9, §10, §11.

## Safety (hard)
- NEVER modify `/Applications/Claude.app`. Always operate on a COPY at
  `~/Applications/Claude-RTL.app` (idempotent `cp -R`).
- Set `CFBundleDisplayName=Claude-RTL`; do NOT touch `CFBundleName` (fuse lookup reads it).

## Patch order (§7)
1. `npx @electron/asar extract` the copy's `app.asar`.
2. Prepend the built payload to renderer JS under `.vite/build/` EXCEPT the main entry
   (`package.json` `"main"`). Skip files already carrying our marker (idempotent).
3. Into the MAIN entry prepend ONLY:
   `try { app.commandLine.appendSwitch('force-ui-direction','ltr'); } catch(e){}`
   — never the full payload (→ black screen). (§9)
4. `npx @electron/asar pack` (keep `*.node` / `spawn-helper` unpacked).
5. `npx @electron/fuses write … EnableEmbeddedAsarIntegrityValidation=off`.
6. Ad-hoc re-sign PRESERVING entitlements: copy the original entitlements, strip the
   three team-id-coupled keys (`application-identifier`, `team-identifier`,
   `keychain-access-groups`), then `codesign --force --deep --sign - --entitlements …`.
   Preserving `com.apple.security.virtualization` keeps Cowork working.

## Watcher (§10)
- User-level launchd LaunchAgent in `~/Library/LaunchAgents/`, `WatchPaths` on the
  original `Info.plist` + `app.asar`, `ThrottleInterval` ≥ 30.
- Updates arrive via Squirrel.Mac → `ShipIt` swaps the bundle. Before re-patching, WAIT
  until no `ShipIt` runs and `app.asar` mtime is stable — never patch mid-swap.
- Opt-in (`--watch`), removable (`--unwatch`), no root.

## Preflights (§11)
- If `npx` is shadowed by an nvm/fnm/volta shim, fall back to system Node; say
  "Node too old" (not "install Node") when the version is the real problem.
- Probe writability / file-lock on `~/Applications` first.
- Verify the expected ASAR layout (`.vite/build/`, `"main"`); if it changed, DIE with a
  specific error naming the missing path — never produce a silently broken app.
