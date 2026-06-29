<p align="center">
  <img src="assets/claude-desktop-rtl-banner.svg" alt="Claude Desktop RTL" width="100%">
</p>

<p align="center">
  <img src="assets/language/btn-english-active.svg" alt="English" height="36">
  &nbsp;
  <a href="docs/README.he.md"><img src="assets/language/btn-hebrew.svg" alt="עברית" height="36"></a>
  &nbsp;
  <a href="docs/README.ar.md"><img src="assets/language/btn-arabic.svg" alt="العربية" height="36"></a>
</p>

<p align="center">
  <i>Smooth right-to-left (Hebrew · Arabic · Persian) for <b>Claude Desktop</b> &amp; <b>claude.ai</b> — from one pure engine.</i>
</p>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D6?logo=windows&logoColor=white">
  <img alt="Browser" src="https://img.shields.io/badge/browser-any%20OS%20(userscript)-4c9a2a">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6">
  <img alt="Network" src="https://img.shields.io/badge/network-zero-16a34a">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-d4572a">
</p>

---

Claude writes beautiful Hebrew and Arabic — then renders it **left-to-right**: bullets on the wrong side, sentence-final punctuation jumping across the line, tables flowing backwards. **Claude RTL** fixes that everywhere Claude runs, and it does it **without ever touching your text or your network**.

<p align="center">
  <img src="assets/language/claude-rtl-comparison.png" alt="The same Claude reply without and with Claude RTL — tables, lists and Hebrew text rendered left-to-right (broken) versus correctly right-to-left" width="92%">
</p>

<p align="center">
  <sub><b>Without</b> RTL the same reply renders left-to-right — reversed table columns, punctuation on the wrong side. <b>With</b> it, every block reads correctly.</sub>
</p>

## Why it's different

- 🎯 **Per-block direction, done right.** Each paragraph, list, table and quote decides its *own* direction from its *own* content. English blocks stay LTR and Hebrew blocks flip RTL — **in the same document**, with no global flip (the bug every other tool has).
- 🔒 **Zero network. Zero telemetry. Zero stored data.** Your conversations never leave your machine. Copy and Ctrl-F stay **byte-for-byte** — we never inject invisible Unicode marks.
- 🛡️ **Safe by construction.** Your original Claude is **never modified**. We patch a separate copy, and it **survives Claude updates automatically**.
- 🖥️ **Desktop *and* browser, one engine.** A one-click menu-bar app on macOS and a tray app on Windows for Claude Desktop, plus a userscript for claude.ai in any browser — all sharing the exact same bidi engine.
- 🧪 **A pure, unit-tested core.** The bidi intelligence (`engine/`) is DOM-free and covered by a torture-test corpus, decoupled from how it's delivered.

## What it handles

| Surface | Behaviour |
|---|---|
| Prose (paragraphs, headings) | Per-block base direction via the browser's own first-strong |
| Lists (incl. nested) | Markers + indent hang on the content side; smart per-item direction |
| Tables | Column order follows the header; every cell aligns to the table |
| Block quotes | The bar/indent move to the content side |
| Numbers, currency, %, dates | Ordered correctly; never force a Hebrew line LTR |
| Arrows (`→`) in RTL | Mirrored visually — the character itself is untouched |
| Code blocks | Stay **LTR** by design (RTL would scramble syntax) |
| Input / edit boxes | `dir="auto"`, instantly, with no flicker |
| Mixed English/Hebrew doc | Each block self-determines — no global flip |

## ✅ Supported platforms

| Surface | Requirements |
|---|---|
| 🍎 **macOS Desktop** | macOS 13 (Ventura) or later. The prebuilt `.dmg` is for Apple Silicon; Intel Macs can build from source. |
| 🪟 **Windows Desktop** | Windows 10 or 11 (64-bit). Patches **both** Claude installs — the classic installer from claude.ai *and* the Microsoft Store (MSIX) build. |
| 🌐 **Browser — claude.ai** | Any OS. Chrome, Edge, Firefox or Safari with a userscript manager. |

## 🚀 Install

<p align="center">
  <img src="assets/language/claude-rtl-showcase.png" alt="The Claude RTL manager — menu-bar app on macOS and tray app on Windows, both showing “RTL is active”" width="80%">
</p>

<p align="center">
  <sub>The one-click manager on <b>macOS</b> (menu bar) and <b>Windows</b> (tray) — installs, auto-updates and removes RTL, no terminal needed.</sub>
</p>

### macOS Desktop — the easy way (recommended)

A menu-bar app installs, updates, and removes RTL with one click. It needs **no Node and no terminal**.

**Option A — download the app** (fastest)

1. Download **`Claude-RTL.dmg`** from the [latest release](https://github.com/liorshaya/claude-desktop-rtl/releases/latest).
2. Open it and drag **Claude RTL** onto **Applications**.
3. *First launch only:* right-click the app → **Open** → **Open**. *(macOS Sequoia: System Settings → Privacy & Security → “Open Anyway”.)* This one-time step exists because the app is open-source and ad-hoc signed, not Apple-notarized — Option B skips it entirely.

**Option B — build from source** (no Gatekeeper prompt)

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl/gui && ./build.sh          # one-time build (needs Node + Xcode CLT)
open "dist/Claude RTL.app"
```

Then, from the menu-bar app:
1. Click **Install RTL** — it patches a copy at `~/Applications/Claude-RTL.app`.
2. macOS asks for your keychain password once → click **Always Allow** *(it's your machine, your keychain)*.
3. Click **Open Claude-RTL**. That's it — smooth RTL.

Toggle **“Keep RTL after Claude updates”** and it re-applies itself whenever Claude updates. **Check for updates** (under *Details*) fetches newer builds of the app itself.

> The original Claude in `/Applications` is never touched. “Open Claude-RTL” quits the original first (they can't run together). A blank first window? Quit (⌘Q) and reopen.

### Windows Desktop

A tray app installs, updates, and removes RTL — **no Node, no terminal, nothing to install first** (a portable runtime is bundled in the installer).

1. Download **`ClaudeRTL-Setup.exe`** from the [latest release](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) and run it. It's a **per-user** install — no admin needed.
2. Launch **Claude RTL** from the Start menu and click the button to patch Claude. The app detects how Claude is installed and applies RTL in place, backing up the originals first.
3. Open Claude — Hebrew, Arabic and Persian render RTL.

Toggle **“Keep RTL after Claude updates”** and it re-applies itself automatically after every Claude update.

> Works with **both** Claude installs: the classic `.exe` from claude.ai *and* the Microsoft Store (MSIX) build. On the Store build, applying RTL needs a one-time **admin approval** (UAC) — it re-signs Claude with a local certificate so Cowork keeps working, and **“Restore original” fully reverts everything**. Your original Claude is always backed up.

Prefer the command line? The PowerShell pipeline is documented in **[desktop/windows/README.md](desktop/windows/README.md)**.

### Browser — claude.ai (any OS)

Works in Chrome, Edge, Firefox, Safari — anywhere with a userscript manager.

```bash
npm run build            # builds dist/claude-rtl.user.js
```

1. Install **Tampermonkey** (or Violentmonkey).
2. Open `dist/claude-rtl.user.js` and install it (or paste its contents into a new script).
3. In the extension, enable **“Allow User Scripts”** (a Chrome/Edge requirement).
4. Reload `claude.ai`.

### CLI — advanced (macOS)

```bash
desktop/patch.sh --install      # patch (build a copy + inject RTL)
desktop/patch.sh --watch        # auto-re-apply on Claude updates
desktop/patch.sh --status       # original / patched / watcher state
desktop/patch.sh --uninstall    # remove the copy (original untouched)
```

## 🧠 How it works

The browser already runs a complete Unicode Bidi Algorithm. We don't reimplement it — we make the **direction & isolation decisions** and let the renderer reorder. CSS `unicode-bidi: plaintext` per leaf block is the sole base-direction mechanism for prose, so every block self-determines and the container is never force-flipped. The desktop app injects the same engine into Claude's renderer bundles and flips only the window-chrome direction in the main process.

Full design: **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## ⚠️ Limitations (v1)

- **Real code blocks stay LTR** (deliberate — RTL scrambles braces, indentation, operators).
- **Desktop Artifacts** render in a cross-origin iframe the desktop payload can't enter yet (the browser userscript does cover them).
- **No bundled Hebrew font yet** — macOS already renders Hebrew via system fonts.
- See **[ARCHITECTURE.md §15](docs/ARCHITECTURE.md)** for the full list.

## 🗺️ Roadmap

- ✅ **Engine** · **browser** userscript · **macOS desktop** (menu-bar app, auto-update watcher, signing, `.dmg`) · **Windows desktop** (tray app + installer, patches both the classic and Microsoft Store installs, update watcher)
- ⏳ Onboarding polish · styled `.dmg` · screenshot gallery

## 🤝 Contributing

PRs are very welcome — this is open source. The engine is pure and unit-tested; the bar is a green `node --test` and a small, single-purpose change. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)**, and if Claude changes its DOM, the **[adopt-a-new-Claude-version runbook](docs/RUNBOOK-adopt-new-claude-version.md)** shows exactly how to update the selectors.

## 🔏 Code signing

Windows release artifacts are governed by the project's **[Code Signing Policy](docs/CODE_SIGNING.md)**
(team roles, build process, privacy). Code signing is being set up free of charge through the
[SignPath Foundation](https://signpath.org/) OSS program.

## 📄 License

[MIT](LICENSE) © Lior Shaya
