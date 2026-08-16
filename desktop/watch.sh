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
# Extra quiet period after the bundle looks settled. ShipIt exits before macOS has finished
# registering/launching the new app, and patching into that window is what fails.
SETTLE_GRACE="${WATCH_SETTLE_GRACE:-8}"

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

# Fingerprint of the files a swap necessarily replaces. INODE is the load-bearing field:
# do NOT gate on mtime alone. The updater restores mtimes from the download archive, so a
# freshly installed app.asar can carry a timestamp days old and never change during the
# swap — v1.30096.5 landed on 2026-08-16 with an app.asar dated 2026-08-14. An mtime-only
# check is therefore satisfied on the very first poll and proves nothing at all.
FRAMEWORK="$ORIG_APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
fingerprint() {
  stat -f '%i:%z:%m' "$ASAR" "$ORIG_APP/Contents/Info.plist" "$FRAMEWORK" 2>/dev/null | tr '\n' ' '
}

# Settled = no ShipIt running, fingerprint stable across SETTLE_STABLE polls, and the
# original's signature verifies (a bundle caught mid-swap does not).
settle() {
  local stable=0 last="" now tries=0 sigfail=0
  while [ "$tries" -lt 150 ]; do
    tries=$((tries + 1))
    # Only CLAUDE's ShipIt counts — other Squirrel apps (e.g. an IDE) run their own.
    if pgrep -fi "Claude.app.*ShipIt" >/dev/null 2>&1; then stable=0; last=""; sleep "$SETTLE_SLEEP"; continue; fi
    now="$(fingerprint)"
    if [ -n "$now" ] && [ "$now" = "$last" ]; then
      stable=$((stable + 1))
      if [ "$stable" -ge "$SETTLE_STABLE" ]; then
        if codesign --verify --strict "$ORIG_APP" >/dev/null 2>&1; then return 0; fi
        # Don't deadlock on this. The signature check is a mid-swap detector, not a policy:
        # if the bundle has been byte-stable this long and still won't verify, that is a
        # property of the app itself, and refusing forever would silently strand the user
        # on an old RTL build. Proceed — patch.sh re-verifies its OWN output regardless.
        sigfail=$((sigfail + 1))
        if [ "$sigfail" -ge 3 ]; then
          log "note: $ORIG_APP is byte-stable but fails codesign --verify — proceeding anyway."
          return 0
        fi
        stable=0
      fi
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

log "settled. waiting ${SETTLE_GRACE}s more before touching the bundle…"
sleep "$SETTLE_GRACE"

log "re-patching…"
if bash "$SCRIPT_DIR/patch.sh" --install 2>&1; then
  log "re-patched to v$(version "$DEST_APP")."
  notify "Claude updated to v$ORIG_VER — RTL re-applied."
else
  log "re-patch FAILED — original untouched, previous RTL app kept; will retry on the next event."
  notify "Claude updated but RTL re-patch failed — the previous RTL app is still usable."
fi
