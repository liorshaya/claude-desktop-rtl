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

## Step 2+ (after the report)

`patch.ps1` (pipeline), the Node-SEA `claude-rtl-helper.exe` + `hashreplace`, the
`FileSystemWatcher` watcher, the WPF tray GUI (`gui/windows`), and the Inno Setup installer —
all built from the diagnostic's findings, per the phased plan in docs/WINDOWS.md §11.

Prior art to mine: [shraga100/claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch).
