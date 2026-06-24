#!/usr/bin/env bash
# gui/build.sh — compile the Swift menu-bar app and assemble "Claude RTL.app" (a menu-bar
# agent: LSUIElement, no Dock icon). Ad-hoc signed — no Apple Developer Program needed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

swift build -c release
BIN="$(swift build -c release --show-bin-path)/ClaudeRTL"
[ -f "$BIN" ] || { echo "build: binary not found at $BIN" >&2; exit 1; }

APP="$SCRIPT_DIR/dist/Claude RTL.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/ClaudeRTL"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Claude RTL</string>
  <key>CFBundleDisplayName</key><string>Claude RTL</string>
  <key>CFBundleIdentifier</key><string>com.claude-rtl.manager</string>
  <key>CFBundleExecutable</key><string>ClaudeRTL</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHumanReadableCopyright</key><string>MIT — open source</string>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP"
echo "built: $APP"
