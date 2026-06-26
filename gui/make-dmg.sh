#!/usr/bin/env bash
# make-dmg.sh — package the built "Claude RTL.app" into a downloadable .dmg (free; no $99).
# The .dmg is NOT notarized, so on first launch the user does a one-time Gatekeeper bypass
# (right-click → Open, or System Settings → Privacy & Security → "Open Anyway"). Building
# from source avoids that entirely — this is purely the convenience path.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
APP="$SCRIPT_DIR/dist/Claude RTL.app"

[ -d "$APP" ] || bash "$SCRIPT_DIR/build.sh"
VERSION="$(tr -d ' \t\n' < "$REPO/VERSION" 2>/dev/null || echo 0.0.0)"
DMG="$SCRIPT_DIR/dist/Claude-RTL-$VERSION.dmg"

echo "dmg: staging…"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/Claude RTL.app"
ln -s /Applications "$STAGE/Applications"          # drag-to-install target
# A short read-me so the one-time Gatekeeper step is never a surprise.
cat > "$STAGE/READ ME — first launch.txt" <<'TXT'
Claude RTL — first launch
=========================
1. Drag "Claude RTL.app" onto the Applications folder.
2. First open only: right-click the app → Open → Open.
   (macOS Sequoia: System Settings → Privacy & Security → "Open Anyway".)
   This is a one-time step because the app isn't Apple-notarized — it's open
   source and ad-hoc signed. Building from source (see the README) skips it.
3. Click "Install RTL". Done.

Still blocked? In Terminal:
   xattr -dr com.apple.quarantine "/Applications/Claude RTL.app"
TXT

rm -f "$DMG"
echo "dmg: building ${DMG}..."
hdiutil create -volname "Claude RTL" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"
echo "dmg: built $DMG ($(du -h "$DMG" | cut -f1))"
