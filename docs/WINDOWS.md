# Windows — research & design (the Windows port)

> Status: **P7.0 done — diagnostics verified on a real Squirrel install (2026-06-25); the
> pipeline (P7.1) is next.** This is the single source of truth for the Windows port the way
> [`ARCHITECTURE.md`](ARCHITECTURE.md) is for the shipped macOS + browser work. The §10 open
> questions are answered for the **Squirrel** path in §10.1; the **MSIX** path stays deferred
> (no MSIX machine to verify on yet).

## 1. Goal

Bring the same smooth RTL to **Claude for Windows** (the desktop app) that we already ship on
macOS — reusing the pure engine unchanged, and adding only the Windows-specific *delivery*
(patch pipeline, watcher, GUI, installer). `claude.ai` in a Windows browser is **already**
covered by the existing userscript; this document is about the **desktop app**.

## 2. What is already cross-platform (≈70% of the work, zero change)

The whole bidi brain and its payload are platform-agnostic and run identically inside the
Windows Electron build:

- `engine/` — pure, DOM-free bidi decisions (unit-tested).
- `dom/` — the CSS + thin DOM layer.
- `build/` — inlines engine+dom into one payload IIFE.
- The injected payload, the `claude-rtl-payload-v1` / `claude-rtl-uidir` idempotency markers,
  and the **`force-ui-direction=ltr`** window-chrome switch — all identical. `force-ui-direction`
  is a Chromium switch Electron honours on every platform.

Claude for Windows is **Electron**, and its `app.asar` shares the macOS layout: a main entry
**`index.pre.js`** (read from `package.json` `"main"`), a `preload.js`, and Vite renderer
bundles. The injection split is the same: **payload → every renderer bundle; the `ltr` switch
→ the main entry only** (full payload in main ⇒ black screen, exactly as on macOS).

## 3. The central problem: two install eras (Squirrel vs MSIX)

This is the finding that shapes everything. Anthropic changed the Windows installer on
**2026-02-10** (alongside Cowork), so there are two regimes with opposite implications:

| | **Squirrel** (legacy, now dead for new installs) | **MSIX** (current) |
|---|---|---|
| Install path | `%LOCALAPPDATA%\AnthropicClaude\app-<ver>\` | `C:\Program Files\WindowsApps\Claude_<ver>_x64__pzs8sxrjxfjjc\app\` |
| Writable by user? | Yes (per-user) | **No** — read-only, ACL-locked to `TrustedInstaller`/`SYSTEM`, OS anti-tamper |
| Patch in place? | Yes — maps ~1:1 to the macOS model | **Windows blocks launch if any packaged file changes** |
| asar | `app-<ver>\resources\app.asar` | `…\app\resources\app.asar` |
| Main exe | `app-<ver>\claude.exe` | `…\app\claude.exe` |
| Update model | Squirrel `Update.exe`, new `app-<ver>` folder | MSIX auto-update (~weekly, user-context, **no UAC**), new `Claude_<newver>_…_pzs8sxrjxfjjc` folder |
| Extra integrity gate | — | **`cowork-svc.exe`** — a running service that does its **own** signature/integrity check of `claude.exe` |
| Per-user data (config/cache) | — | `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\…` (data only, **not** the exe) |

The publisher hash `pzs8sxrjxfjjc` appears stable across versions; the version segment changes
on every update. arm64 uses `_arm64__pzs8sxrjxfjjc` analogously.

### 3.1 The hard-rule tension (decision required)

Our hard rule is **"never modify the original — patch a copy"** ([`CLAUDE.md`](../CLAUDE.md) §7).
On macOS that's clean (copy `Claude.app`). On **MSIX it does not translate**: the package is
registered in place under `WindowsApps`; you cannot run a copied-out MSIX app normally, and the
install dir is read-only/anti-tamper. The realistic options are all worse than macOS:

1. **Patch in place under `WindowsApps`** — take ownership / stop `cowork-svc`, modify protected
   files, accept that the "original" is no longer pristine (keep a `.bak` to restore on uninstall).
   Invasive; may trip Store auto-repair.
2. **Repackage as a new (self-signed/unsigned) MSIX** — requires admin + trusted-root install;
   very invasive and fragile.
3. **Squirrel-only support** — only works for users still on a legacy Squirrel install (a
   shrinking set; no Squirrel→MSIX migration path exists).

**No option preserves the macOS "untouched original + clean copy" guarantee.** This is a genuine
product decision to make before building — see §11.

**Decision (2026-06-25, Squirrel path):** option 1 — **patch in place + `.bak` backup**. The verified
machine is Squirrel (user-writable, no Cowork), and Squirrel discards the whole `app-<ver>` folder on
every update, so the "pristine original" guarantee is largely moot; the watcher re-applies after each
update. The macOS "patch a copy" hard rule is therefore **relaxed for the Squirrel path** (back up
`claude.exe` + `app.asar` to `.crtl-bak` so the user can restore). The **MSIX** policy stays open
(deferred until there is an MSIX box to verify on).

### 3.2 Prior art — the Windows sibling project

[`shraga100/claude-desktop-rtl-patch`](https://github.com/shraga100/claude-desktop-rtl-patch)
(PowerShell) is effectively this port already, and resolved most unknowns: MSIX ACL handling,
the asar-hash byte-replace, the `cowork-svc.exe` certificate swap, and a Scheduled-Task watcher.
**Read it end-to-end on a Windows box before writing our pipeline** — it is the gold reference.

## 4. Pipeline mapped 1:1 to the macOS steps

`desktop/patch.sh` is the source pipeline to port. Drop / keep / change:

| macOS step | Windows | Notes |
|---|---|---|
| 1. Copy app → `~/Applications/Claude-RTL.app` | **CHANGE** | MSIX: no clean copy; patch in place under `WindowsApps` (own/stop-svc) + `.bak`. Squirrel: patch the live `app-<ver>` in place. |
| 2. `@electron/asar` extract | **KEEP** | Pure-Node, cross-platform. Watch: long-path `\\?\` bugs (keep work dir short, e.g. `%TEMP%\crtl`), symlinks-extracted-as-files, **binary-mode** concat (LF-only payload; no CRLF translation or byte counts break). |
| 3. Inject payload + `ltr` switch | **KEEP** | Identical text/byte op; same markers; same renderer-vs-main split. |
| 4. `@electron/asar` pack | **KEEP** | Unpacked native glob changes `{**/*.node,**/*.dylib,**/spawn-helper}` → `{**/*.node,**/*.dll}` (+ any Windows helper exe). Verify against the real `app.asar.unpacked`. |
| 5. Defeat asar integrity (`@electron/fuses` off) | **CHANGE** | See §5. Primary: recompute the asar header SHA-256 and **byte-replace** the old ASCII hash inside `claude.exe`; fuse-off only as fallback. May be a **no-op** if integrity is disabled in Claude's build — verify first. |
| 6. Ad-hoc re-sign (REQUIRED on macOS) | **DROP** (mostly) | Windows does **not** re-verify Authenticode at launch — a modified `claude.exe` still runs. But the app-level gates in §5 replace that burden, and Cowork's `cowork-svc.exe` may need handling. |
| 7. launchd watcher | **CHANGE** | See §7 — `FileSystemWatcher` in the tray app + logon persistence; Scheduled Task as backstop. |
| Node SEA helper | **KEEP (rebuild)** | See §8 — Windows SEA `.exe`, add a `hashreplace` command. |

## 5. Integrity & signing on Windows

Three gates, none of them the OS loader:

1. **Electron asar-integrity fuse** (`EnableEmbeddedAsarIntegrityValidation`). On Windows the
   asar header hash is stored as a PE resource (type `Integrity`, name `ElectronAsar`) in
   `claude.exe`, and in practice also as a plain ASCII hex string. If enabled and the hash
   mismatches, Electron **force-terminates**.
   - **Primary strategy:** recompute SHA-256 of the *new* asar header and **byte-replace** the
     old lowercase-hex ASCII string in `claude.exe` (same length ⇒ offsets stay stable; validate
     the located string is unique and identical-length before writing). This keeps integrity
     *passing* against our modified asar and needs **no fuse flip**.
   - **Fallback:** `@electron/fuses write --app claude.exe EnableEmbeddedAsarIntegrityValidation=off`
     (the fuse wire lives in the PE; the lib supports Windows binaries).
   - **Possible no-op:** Electron's default is integrity *off*. If Claude's Windows build doesn't
     enable it, skip §5 entirely. **Verify on a real install.**
2. **`cowork-svc.exe`** — a Cowork service that verifies `claude.exe` itself. The PoC found it
   necessary to swap Anthropic's embedded cert in `cowork-svc.exe` for a self-signed one, re-sign,
   add that cert to the **Trusted Root** store, then wipe the key — very invasive (touches the
   machine trust store). **Strongly prefer leaving `cowork-svc.exe` untouched** and testing
   whether Cowork still works when only `claude.exe` + `app.asar` change. This is the Windows
   analogue of our macOS "preserve entitlements so Cowork keeps working" rule.
3. **OS Authenticode** — not checked at launch (no Gatekeeper equivalent). Confirmed: a tampered,
   invalid-signature local exe runs. So **re-signing is dropped** — the work moves to gates 1–2.

> Context, not a blocker: CVE-2025-55305 (asar-integrity bypass on Windows, Electron < 35.7.5 /
> < 36.8.1 / < 37.3.1) is why the resource-based check exists; it doesn't change our approach
> (we're the legitimate local user patching our own install).

## 6. The GUI (the SwiftUI menu-bar app's Windows twin)

**Recommendation: WPF on .NET 8/9 + H.NotifyIcon.Wpf + an in-process watcher, published as a
single self-contained `win-x64` exe.** Free toolchain, no Visual Studio, no admin.

- **Framework — WPF.** In-box with the .NET SDK, builds with just the `dotnet` CLI, mature,
  acceptable Win11 theming, XAML/MVVM ≈ SwiftUI's declarative+bindings model. WinUI 3 was
  rejected (no built-in tray, awkward single-file, Windows App SDK runtime dependency); WinForms
  is the strong runner-up (built-in `NotifyIcon`, bulletproof single-file, dated visuals);
  Avalonia only wins if we wanted a shared cross-platform UI, which we don't (macOS is SwiftUI).
- **Tray + popover — [H.NotifyIcon.Wpf](https://github.com/HavenDV/H.NotifyIcon)** (the maintained
  successor to `hardcodet/wpf-notifyicon`). A `TaskbarIcon` + a borderless `Window`/`Popup` shown
  anchored to the tray on click reproduces the `NSStatusItem` + popover UX.
- **`LSUIElement` equivalent (tray-only, no taskbar/Alt-Tab):** no `MainWindow` at startup;
  status window `ShowInTaskbar="false"`, `WindowStyle="None"`, shown only on tray click;
  `ShutdownMode="OnExplicitShutdown"`; dispose the tray icon on exit (no ghost icon).
- **Publish:** `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
  -p:EnableCompressionInSingleFile=true -p:PublishTrimmed=false`. **Leave trimming off** — WPF +
  single-file + trimming has historical launch-crash bugs; single-file alone is fine on .NET 8/9
  (validate the published exe on a clean VM early).
- **Secrets/state:** prefer storing **nothing** (derive state by inspecting the install dir +
  the presence of the logon entry). If a small key/flag is needed, **DPAPI**
  (`ProtectedData`, `DataProtectionScope.CurrentUser`) — in-box, per-user, no library — written
  under `%LOCALAPPDATA%\claude-rtl\`. (Credential Manager is the closer Keychain analogue but
  needs P/Invoke for no real benefit at our scale.)

## 7. The watcher (launchd → Windows)

Claude auto-updates by creating a new version folder (MSIX `Claude_<newver>_…` or Squirrel
`app-<ver>`), wiping our patch. Re-apply by detecting that and re-running the pipeline.

- **Recommended: `FileSystemWatcher` inside the already-running tray process.** It's alive in the
  user session with exactly the right permissions to touch the user's own Claude install. Watch
  the parent dir for a new version folder (`Created`), **debounce** (an update writes many files —
  wait for it to settle, like the macOS "wait for ShipIt" rule), then invoke the helper to
  re-patch. Handle the `Error` event / buffer overflow by re-checking the installed version, and
  also re-verify the patch whenever the popup opens (cheap backstop).
- **Logon persistence (the LaunchAgent analogue):** a per-user **Startup-folder shortcut** or
  `HKCU\…\Run` entry launching the tray exe with a silent `--watch` flag — **per-user, no admin**.
  The "Keep RTL after updates" toggle just adds/removes this entry.
- **Scheduled Task** is only a backstop: Task Scheduler can't truly watch a folder (no reliable
  creation event under `%LOCALAPPDATA%`/`WindowsApps`), so it degrades to interval polling. A
  Windows Service is the wrong privilege (session 0 / admin) — rejected.

## 8. The helper (Node SEA on Windows)

Keep the proven Node asar/fuses code; don't reimplement it in .NET.

- **Node SEA → Windows `.exe`** is the blessed mechanism: bundle the libs into one CJS file with
  esbuild, generate the SEA blob, inject it as the `NODE_SEA_BLOB` PE resource via **`postject`**
  (Node v24+ folds this into `--build-sea`). The `assets` field can embed the prebuilt RTL
  **payload inside the helper exe** itself.
- **Add a `hashreplace` subcommand** (compute asar-header SHA-256 + byte-replace in `claude.exe`)
  for §5. Mirror `helper/build-helper.sh` as `build-helper.ps1` producing `claude-rtl-helper.exe`.
- The WPF app (or a PowerShell wrapper) shells out to the helper — **no system Node required**,
  exactly like macOS.

## 9. Distribution (the `.dmg` + Gatekeeper-bypass twin)

**Free path: an Inno Setup per-user installer (`PrivilegesRequired=lowest`) → `%LOCALAPPDATA%`,
no admin, plus a portable `.zip` fallback. Unsigned.** Users do the one-time
**SmartScreen → "More info" → "Run anyway"** (or right-click → Properties → **Unblock**) — the
exact analogue of the macOS Gatekeeper bypass. Building from source avoids it entirely (no
Mark-of-the-Web `Zone.Identifier` stream ⇒ no SmartScreen gate).

- **Installer choice:** Inno Setup (free) does per-user + register the logon/Scheduled-Task entry
  + drop the bundled helper/payload in one simple script. NSIS is heavier; WiX/MSI is overkill;
  **MSIX is disqualified** for the free path — it *must* be signed and trusted to install (a
  self-signed MSIX needs the cert in the machine Trusted-People store = **admin**).
- **Signing reality (important asymmetry vs macOS):** on Windows even a **paid** cert does **not**
  silence SmartScreen immediately — Microsoft removed EV's instant-reputation status in 2024;
  reputation now builds per-file-hash and resets each release. So paid signing buys little for a
  hobby project. The only worthwhile path is **free**: [SignPath Foundation](https://signpath.org/)
  OSS signing, if the project qualifies. Otherwise stay unsigned + document the bypass. (Contrast
  macOS, where paid notarization *does* silence Gatekeeper — there the free path is the compromise;
  on Windows the free path is genuinely competitive.)
- **Channel:** GitHub Releases (same as macOS) — attach the Inno `.exe` + portable `.zip` +
  SHA-256 checksums. Warn about unsigned-installer AV/Defender false positives; offer the
  build-from-source escape hatch.

## 10. Open questions — verify on a real Windows + real Claude (do this first)

1. **Install model on the target machine — MSIX or Squirrel?** Decides feasibility and whether the
   "patch a copy" rule can survive at all. Check `C:\Program Files\WindowsApps\Claude_*` vs
   `%LOCALAPPDATA%\AnthropicClaude\app-*`.
2. **Are the asar-integrity fuses actually enabled** in Claude's Windows build? If not, §5 is a
   no-op. Read the `Integrity`/`ElectronAsar` PE resource + the fuse wire in `claude.exe`.
3. **What exactly does `cowork-svc.exe` check, and can we leave it untouched** (only modify
   `claude.exe` + `app.asar`) and still have Cowork work? Avoiding the cert-swap/trusted-root dance
   is the difference between "reasonable" and "too invasive to ship."
4. **Does modifying `WindowsApps` flag the MSIX as tampered** and trigger Store auto-repair that
   reverts the patch independent of version bumps?
5. **Exact current main-entry filename & renderer tree** inside the asar for the current build
   (`index.pre.js` may have changed; confirm `.vite/build/*.js`).
6. **`app.asar.unpacked`** contents (native modules) on Windows.
7. **SmartScreen / Defender** reaction to the now-invalid `claude.exe` signature on launch
   (expected fine; scan during testing).

### 10.1 Results — verified 2026-06-25 (real Squirrel install, `app-1.15200.0`)

Run of [`diagnose.ps1`](../desktop/windows/diagnose.ps1) on Win11 (PowerShell 5.1, AMD64),
Claude `1.15200.0`:

| # | Question | Answer |
|---|---|---|
| Q1 | Install model | **Squirrel** — `%LOCALAPPDATA%\AnthropicClaude\app-1.15200.0` (not MSIX) |
| Q4 | App dir writable? | **Yes** — owner `SHAYA\lior1`, full control, no admin |
| Q2 | asar-integrity fuse | **Enabled** (`EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar`) — §5 is real, not a no-op |
| Q3 | `cowork-svc.exe` | **Absent** — no Cowork service/proc; the §5 gate-2 cert dance is N/A here |
| Q7 | `claude.exe` signature | **Valid** (CN=Anthropic, PBC) — but not re-checked at launch ⇒ re-sign dropped |
| Q5 | main entry | **`.vite/build/index.pre.js`** (unchanged from the macOS assumption) |
| Q5 | renderer bundles | 15 under `.vite/build/*.js` (aboutWindow, buddy, claudePagePreview, computerUseTeach, coworkArtifact, findInPage, index, index.pre, mainView, mainWindow, mcp-runtime/{directMcpHost,nodeHost}, quickWindow, shell-path-worker/shellPathWorker, transcript-search-worker/transcriptSearchWorker) |
| Q6 | `app.asar.unpacked` | 5 native: `@ant/claude-native/*.node`, `node-pty/prebuilds/win32-x64/*.node`, `office365-mcp/msal-node-runtime.node` + `msalruntime.dll` ⇒ unpack glob `{**/*.node,**/*.dll}` confirmed |

**Consequences for the pipeline (Squirrel path):**

- **Integrity → mirror macOS:** flip `EnableEmbeddedAsarIntegrityValidation=off` via `@electron/fuses`
  (exactly what [`patch.sh`](../desktop/patch.sh) does). The ASCII hash byte-scan was inconclusive
  (`ElectronAsar` / `"alg":"sha256"` not found as ASCII — likely a UTF-16 PE resource), but **fuse-off
  sidesteps byte-replace entirely**, so §5's "primary" (byte-replace the hash) is demoted to an
  unused fallback on this path.
- **Drop** the macOS re-sign step (Q7) and **all** Cowork handling (Q3) — fewer steps than macOS.
- **Pipeline =** extract → inject (payload → renderer bundles; `force-ui-direction=ltr` →
  `index.pre.js` only, per §2) → pack (`--unpack {**/*.node,**/*.dll}`) → fuse-off — **in place**, with
  `.crtl-bak` of `claude.exe` + `app.asar`.
- **Still open (MSIX only, deferred):** §10 Q3-detail and Q4 (WindowsApps tamper / Store auto-repair).
  N/A on this Squirrel box.
- Tooling present: Node v24.13.1, npx OK; `@electron/fuses read` succeeded on this `claude.exe`
  (so `write` will too).

> **diagnose.ps1 fix applied alongside this run:** the script carried non-ASCII characters (em-dash,
> `§`). Windows PowerShell 5.1 reads a BOM-less `.ps1` as Windows-1252, and the em-dash's third byte
> (`0x94`) decodes to a curly close-quote that PowerShell treats as a string terminator — so the
> script failed to *parse* before inspecting anything. It is now ASCII-clean. **Lesson for P7.1+:**
> keep all PowerShell ASCII-only, and do byte-exact asar injection in Node (LF-only, no BOM), not in
> PowerShell string ops.

## 11. Phased plan (proposed P7+)

1. **P7.0 — Spike on real Windows. [DONE 2026-06-25]** §10 answered in §10.1 (Squirrel install);
   §3.1 policy decided (patch in place + `.crtl-bak`). *No shipping code shipped until this was done.*
2. **Immediate coverage — the browser userscript** already gives Windows users RTL on `claude.ai`
   today, zero risk. Make sure it's documented for Windows.
3. **P7.1 — Windows patch pipeline. [DONE 2026-06-25]** `desktop/windows/`: `inject.mjs` (byte-exact
   payload + `force-ui-direction` switch, pure Node), `patch.ps1` (locate Squirrel install → stop
   Claude → back up → asar extract/inject/pack → fuse-off; `-Restore`/`-Status`), `preflight.ps1`.
   asar extract/inject/pack kept; integrity via **fuse-off** (not byte-replace); in-place Squirrel
   (MSIX deferred); no re-sign. Verified on `app-1.15200.0`: Hebrew renders RTL.
4. **P7.2 — Helper.** `claude-rtl-helper.exe` via Node SEA + `hashreplace`.
5. **P7.3 — Watcher. [DONE 2026-06-25]** `watch.ps1` (`FileSystemWatcher` on the AnthropicClaude dir
   + settle wait + a **read-only** marker check, so it never stops an already-patched Claude) plus
   per-user logon persistence via `patch.ps1 -Watch` / `-Unwatch`. Re-applies via `patch.ps1 -NoStop`
   behind a non-destructive lock pre-check: a fresh update is patched **in place without ever
   force-killing a running Claude** (RTL takes effect on next launch; deferred + retried if the new
   version is already running). Validated with a simulated update + persistence tests.
6. **P7.4 — GUI.** WPF + H.NotifyIcon tray app wrapping the helper, mirroring `gui/`.
7. **P7.5 — Distribution.** Inno Setup per-user + portable zip; unsigned; SmartScreen docs;
   pursue SignPath Foundation.

Layout follows [`CONTRIBUTING.md`](../CONTRIBUTING.md): platform subfolders (`desktop/windows`,
`gui/windows`) with the shared core (`engine/`, `dom/`, `build/`, `helper/`) untouched.

## 12. Cowork on Windows — why it shows "requires a newer installation"

Verified 2026-06-26 (Squirrel 1.15962.0, Windows 11 25H2 build **26200.8737**): Claude shows a
**"Cowork requires a newer installation / Reinstall"** banner. This is **not caused by the RTL
patch** — `cowork-svc.exe` is absent from the Squirrel build (no Cowork integrity gate exists for the
patch to trip; the patch only prepends RTL code), and thousands of unpatched users report the same.
Two stacked, **Anthropic-side** blockers:

1. **Squirrel has no Cowork.** Cowork shipped with MSIX (2026-02-10); the legacy Squirrel install
   cannot run it. The in-app **Reinstall button is itself broken** (it only checks the Squirrel
   channel — anthropics/claude-code#28998), and the Squirrel→MSIX in-place upgrade silently fails
   (`0x80073CFA` — #25162). Migrating needs a manual clean uninstall + fresh MSIX from
   `claude.ai/download` (admin/UAC; Virtual Machine Platform / Hyper-V; Win Pro/Enterprise/Education).
2. **The `yukonSilver` build-26200 bug.** Even on MSIX, Claude's internal `yukonSilver` VM
   platform-detection flag marks Windows 11 25H2 / build 26200 as `unsupported` (logs:
   `yukonSilver not supported (status=unsupported)` / `[startVM] VM not supported (win32/x64)`) **with
   all virtualization enabled**. Widespread and unresolved as of Apr–May 2026 (#28238, #29322, #27499,
   #27406, #50517, #30454). **No local override exists** (not registry, env, or an asar patch) — only
   Anthropic can fix the build whitelist.

**RTL-vs-Cowork tension:** on this machine Cowork is unreachable regardless of the RTL patch.
Migrating to MSIX is painful, **breaks the Squirrel RTL patch** (MSIX = read-only `WindowsApps`,
anti-tamper — the unsolved §3 hard case; the shraga100 prior art does not cover MSIX either), and —
because of blocker #2 — likely still would not yield Cowork on build 26200. **Recommendation:** stay
on Squirrel + RTL; track #28238 / #29322; revisit MSIX RTL support only once Anthropic fixes
`yukonSilver`. (Cowork's "hand off long tasks" capability is already covered by Claude Code.)

## 13. Sources

- Prior art: [shraga100/claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch)
- [Deploy Claude Desktop for Windows](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows) · [Squirrel→MSIX transition #25162](https://github.com/anthropics/claude-code/issues/25162)
- Electron: [asar integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) · [fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) · [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) · [@electron/asar](https://github.com/electron/asar) · [CVE-2025-55305](https://github.com/advisories/GHSA-vmqv-hx8q-j7mg)
- MSIX: [behind the scenes](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes) · [limitations](https://www.turbo.net/blog/posts/2025-06-16-understanding-msix-limitations-enterprise-application-compatibility) · [unsigned package](https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package)
- Node: [Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- GUI: [H.NotifyIcon](https://github.com/HavenDV/H.NotifyIcon) · [single-file deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview) · [WPF single-file bug #4216](https://github.com/dotnet/wpf/issues/4216) · [DPAPI ProtectedData](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection)
- Distribution/signing: [Code signing options (MS, Apr 2026)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) · [Trusted/Artifact Signing pricing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/) · [Inno Setup PrivilegesRequired](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm) · [SignPath Foundation](https://signpath.org/)
- `force-ui-direction`: [Chromium PSA](https://groups.google.com/a/chromium.org/g/chromium-dev/c/jfFdtQ4Lc_w)
