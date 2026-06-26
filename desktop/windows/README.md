# desktop/windows — the Windows port (in progress)

Full design & research: **[../../docs/WINDOWS.md](../../docs/WINDOWS.md)**.

The Windows port is being built **diagnosis-first**: the install model (MSIX vs Squirrel),
whether the asar-integrity fuse is on, and what `cowork-svc.exe` checks all materially change
the pipeline — so we confirm them on a real machine before writing patch code.

## Step 1 (now): run the diagnostic

On the Windows machine with Claude installed, in **PowerShell**:

```powershell
git clone https://github.com/liorshaya/claude-desktop-rtl.git   # or: git pull
cd claude-desktop-rtl
git checkout p7-windows
powershell -ExecutionPolicy Bypass -File .\desktop\windows\diagnose.ps1
```

It's **read-only** — it inspects the install and prints a report, modifying nothing. If any
probe says *access denied*, re-run from an **elevated** PowerShell (Claude's MSIX dir is
ACL-locked). Then copy the whole console output (the `Q1`–`Q7` sections **and** the final
`REPORT` block) back into the chat.

That output answers [docs/WINDOWS.md §10](../../docs/WINDOWS.md) and unblocks the rest.

## Step 2 (now): apply the patch

The pipeline is built and verified on a real Squirrel install. From the repo root, in **PowerShell**:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\windows\preflight.ps1   # readiness (read-only)
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1        # apply RTL in place
```

`patch.ps1` stops Claude, backs up `claude.exe` + `app.asar` to `*.crtl-bak`, injects the RTL
payload into the renderer bundles + the `force-ui-direction=ltr` switch into the main entry, repacks
the asar, and flips the `EnableEmbeddedAsarIntegrityValidation` fuse off (the §3.1 in-place decision).
It needs **Node** (for the byte-exact `inject.mjs` and `npx @electron/asar` / `@electron/fuses`).
Undo anytime with `patch.ps1 -Restore`; inspect state with `patch.ps1 -Status`. Then open Claude —
Hebrew/Arabic/Persian render RTL.

> This is the **Squirrel** (classic installer) path. For the **Microsoft Store (MSIX)** install,
> run `patch-msix.ps1` from an **elevated** PowerShell instead — same RTL payload, plus the
> ownership + Cowork certificate handling MSIX requires. See [../../docs/WINDOWS.md](../../docs/WINDOWS.md) §3.

## Step 3 (optional): survive Claude updates

Claude auto-updates into a **new** `app-<ver>` folder, which wipes the patch. Install the watcher
once and it re-applies RTL automatically after each update:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Watch     # enable
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Unwatch   # disable
```

`-Watch` adds a per-user logon entry and starts `watch.ps1` now; it waits for an update to settle,
then re-patches **in place without force-killing Claude** (`patch.ps1 -NoStop`). It checks "already
patched?" read-only, so it never disturbs a running, patched Claude; if a fresh update is already
running, it defers and RTL applies on the next launch. Updates stay fully automatic — you run
nothing by hand. Logs: `%LOCALAPPDATA%\claude-rtl\watch.log`.

## The one-click app

Most users don't need the scripts above. The **`ClaudeRTL-Setup.exe`** installer ships a WPF tray
app (`gui/windows`) that bundles a portable Node runtime, the prebuilt payload, and these scripts —
so it patches with zero prerequisites and auto-detects the Squirrel vs MSIX install. Download it from
the [latest release](https://github.com/liorshaya/claude-desktop-rtl/releases/latest).
