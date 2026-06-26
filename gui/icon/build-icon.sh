#!/usr/bin/env bash
# Regenerate the manager's AppIcon.icns from the logo glyph. Run only when the design
# changes — the resulting AppIcon.icns is committed and consumed by gui/build.sh.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SET="$DIR/AppIcon.iconset"

rm -rf "$SET"
swift "$DIR/make-appicon.swift" "$SET"
iconutil -c icns "$SET" -o "$DIR/AppIcon.icns"
rm -rf "$SET"
echo "icon: wrote $DIR/AppIcon.icns ($(du -h "$DIR/AppIcon.icns" | cut -f1))"
