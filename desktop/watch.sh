#!/usr/bin/env bash
# desktop/watch.sh — launchd-triggered re-patch (§10). Fires when /Applications/Claude.app
# changes (a Squirrel.Mac update swaps the bundle via ShipIt). Re-applies the RTL patch,
# but ONLY after the swap has settled, so we never patch mid-swap. User-scope, no root,
# idempotent. Run by the LaunchAgent (desktop/agent.plist). NOT set -e: a transient
# failure must not crash the agent — it just retries on the next event.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ORIG_APP="${ORIG_APP:-/Applications/Claude.app}"
DEST_APP="${DEST_APP:-$HOME/Applications/Claude-RTL.app}"
ASAR="$ORIG_APP/Contents/Resources/app.asar"
# Poll cadence (overridable for tests). The patched copy's version is the "stamp": it was
# cp'd from the original at patch time, so a mismatch means the original was updated.
SETTLE_SLEEP="${WATCH_SETTLE_SLEEP:-2}"
SETTLE_STABLE="${WATCH_SETTLE_STABLE:-3}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] watch: $*"; }
version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }
notify() { osascript -e "display notification \"$1\" with title \"Claude-RTL\"" >/dev/null 2>&1 || true; }

[ -d "$DEST_APP" ] || { log "no patched app at $DEST_APP — nothing to do."; exit 0; }
[ -d "$ORIG_APP" ] || { log "original missing — nothing to do."; exit 0; }

ORIG_VER="$(version "$ORIG_APP")"
DEST_VER="$(version "$DEST_APP")"
if [ "$ORIG_VER" = "$DEST_VER" ]; then
  log "no version change (both v$ORIG_VER)."
  exit 0
fi
log "update detected: original v$ORIG_VER vs patched v$DEST_VER — waiting for swap to settle…"

# Settle: no ShipIt process running AND app.asar mtime unchanged across SETTLE_STABLE polls.
settle() {
  local stable=0 last="" now tries=0
  while [ "$tries" -lt 150 ]; do
    tries=$((tries + 1))
    # Only CLAUDE's ShipIt counts — other Squirrel apps (e.g. an IDE) run their own.
    if pgrep -fi "Claude.app.*ShipIt" >/dev/null 2>&1; then stable=0; sleep "$SETTLE_SLEEP"; continue; fi
    now="$(stat -f %m "$ASAR" 2>/dev/null || echo 0)"
    if [ "$now" != "0" ] && [ "$now" = "$last" ]; then
      stable=$((stable + 1))
      [ "$stable" -ge "$SETTLE_STABLE" ] && return 0
    else
      stable=0
    fi
    last="$now"
    sleep "$SETTLE_SLEEP"
  done
  return 1
}

if ! settle; then
  log "swap did not settle in time — will retry on the next WatchPaths event."
  exit 0
fi

log "settled. re-patching…"
if bash "$SCRIPT_DIR/patch.sh" --install 2>&1; then
  log "re-patched to v$(version "$DEST_APP")."
  notify "Claude updated to v$ORIG_VER — RTL re-applied."
else
  log "re-patch FAILED — original is untouched; will retry on the next event."
  notify "Claude updated but RTL re-patch failed — run patch.sh --install manually."
fi
