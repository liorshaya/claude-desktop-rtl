#!/usr/bin/env bash
# gui/build.sh — build the fully self-contained "Claude RTL.app": the Swift menu-bar app
# PLUS the bundled node-free pipeline (standalone SEA helper + pre-built payload + scripts).
# The shipped .app patches Claude with NO system Node. Ad-hoc signed — no $99 needed.
# (Our build machine needs Node once, to build the payload + the helper.)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

echo "gui: building payload + helper (one-time, needs Node)…"
( cd "$REPO" && node build/build-payload.js >/dev/null )
[ -x "$REPO/helper/claude-rtl-helper" ] || bash "$REPO/helper/build-helper.sh"

echo "gui: compiling the Swift app…"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/ClaudeRTL"
[ -f "$BIN" ] || { echo "gui: binary not found at $BIN" >&2; exit 1; }

APP="$SCRIPT_DIR/dist/Claude RTL.app"
RES="$APP/Contents/Resources"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$RES/scripts"
cp "$BIN" "$APP/Contents/MacOS/ClaudeRTL"

echo "gui: bundling the node-free pipeline into Resources…"
cp "$REPO/helper/claude-rtl-helper" "$RES/claude-rtl-helper"
cp "$REPO/dist/payload.js" "$RES/payload.js"
cp "$REPO/desktop/patch.sh" "$REPO/desktop/preflight.sh" \
   "$REPO/desktop/watch.sh" "$REPO/desktop/agent.plist" "$RES/scripts/"
chmod +x "$RES/claude-rtl-helper" "$RES/scripts/"*.sh

# Menu-bar status icon (template PNGs → monochrome, adapts to light/dark menu bar).
cp "$REPO/assets/claude-rtl-statusTemplate.png" "$REPO/assets/claude-rtl-statusTemplate@2x.png" "$RES/"

# App icon (Finder/Cmd-Tab) — regenerate with gui/icon/build-icon.sh when the design changes.
cp "$SCRIPT_DIR/icon/AppIcon.icns" "$RES/AppIcon.icns"

# Single source of version truth — the repo's VERSION file (also what "Check for updates" reads).
VERSION="$(tr -d ' \t\n' < "$REPO/VERSION" 2>/dev/null || echo 0.0.0)"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Claude RTL</string>
  <key>CFBundleDisplayName</key><string>Claude RTL</string>
  <key>CFBundleIdentifier</key><string>com.claude-rtl.manager</string>
  <key>CFBundleExecutable</key><string>ClaudeRTL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHumanReadableCopyright</key><string>MIT — open source</string>
</dict>
</plist>
PLIST

# --deep so the bundled helper (a Mach-O) is signed too; the scripts are sealed resources.
codesign --force --deep --sign - "$APP"
echo "gui: built $APP ($(du -sh "$APP" | cut -f1))"
