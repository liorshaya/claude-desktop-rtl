#!/usr/bin/env bash
# desktop/patch.sh — build ~/Applications/Claude-RTL.app from a COPY of the original,
# inject the RTL payload into renderer bundles + the force-ui-direction switch into the
# main entry, flip the asar-integrity fuse, and ad-hoc re-sign preserving entitlements
# (so Cowork keeps working). NEVER touches /Applications/Claude.app. (§7, §9)
#
#   desktop/patch.sh [--install] | --uninstall | --status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

ORIG_APP="${ORIG_APP:-/Applications/Claude.app}"
DEST_APP="${DEST_APP:-$HOME/Applications/Claude-RTL.app}"
# Keep the ORIGINAL CFBundleIdentifier untouched: Cowork's VM/workspace and entitlements
# are keyed to it, so changing it breaks virtualization (§7). Only CFBundleDisplayName is
# changed. Launch the patched app by its binary path so LaunchServices can't resolve the
# shared id back to /Applications/Claude.app.
# When bundled in the .app these point at a pre-built payload and the standalone Node SEA
# helper (asar+fuses), so patching needs NO system Node. In dev they're empty → npx + the
# node build are used instead.
PAYLOAD="${CLAUDE_RTL_PAYLOAD:-$REPO_ROOT/dist/payload.js}"
HELPER="${CLAUDE_RTL_HELPER:-}"
MARKER="claude-rtl-payload-v1"        # build-payload.js stamps this into the IIFE
UIDIR_MARKER="claude-rtl-uidir"       # marks the main-entry switch (idempotency)
# Native code can't be loaded from inside an asar, so these stay unpacked (must match the
# original set: *.node, *.dylib, spawn-helper). Verified against the copy after packing.
UNPACK_GLOB="{**/*.node,**/*.dylib,**/spawn-helper}"

# Auto-reapply watcher (§10).
WATCH_LABEL="com.claude-rtl.watcher"
WATCH_PLIST_SRC="$SCRIPT_DIR/agent.plist"
WATCH_PLIST_DST="$HOME/Library/LaunchAgents/$WATCH_LABEL.plist"
WATCH_LOG="$HOME/Library/Logs/claude-rtl-watch.log"

WORK=""
die() { echo "patch: ERROR — $*" >&2; exit 1; }
log() { echo "patch: $*"; }
cleanup() { [ -n "$WORK" ] && rm -rf "$WORK"; return 0; }
trap cleanup EXIT

app_version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }

# asar/fuses via the bundled standalone helper when present (no Node), else npx.
asar_extract() { if [ -n "$HELPER" ]; then "$HELPER" extract "$1" "$2"; else npx --yes @electron/asar extract "$1" "$2"; fi; }
asar_pack()    { if [ -n "$HELPER" ]; then "$HELPER" pack "$1" "$2" "$UNPACK_GLOB"; else npx --yes @electron/asar pack "$1" "$2" --unpack "$UNPACK_GLOB"; fi; }
fuses_off()    { if [ -n "$HELPER" ]; then "$HELPER" fuses "$1" EnableEmbeddedAsarIntegrityValidation=off; else npx --yes @electron/fuses write --app "$1" EnableEmbeddedAsarIntegrityValidation=off >/dev/null; fi; }

# Quit a running app by its EXACT bundle path (so we never touch the other Claude). Used
# before uninstall (else the process lingers in the Dock) and before re-patch (else we
# rm -rf a running bundle). Matches even after the .app is deleted (path stays in argv).
quit_app_at() {
  local marker="$1/Contents/MacOS/"
  pgrep -f "$marker" >/dev/null 2>&1 || return 0
  log "quitting running app at $1…"
  pkill -f "$marker" 2>/dev/null || true
  local i=0
  while pgrep -f "$marker" >/dev/null 2>&1 && [ "$i" -lt 20 ]; do sleep 0.5; i=$((i+1)); done
  pkill -9 -f "$marker" 2>/dev/null || true
}

cmd_status() {
  if [ -d "$ORIG_APP" ]; then echo "original : $ORIG_APP (v$(app_version "$ORIG_APP")) — untouched"; else echo "original : MISSING ($ORIG_APP)"; fi
  if [ -d "$DEST_APP" ]; then echo "patched  : $DEST_APP (v$(app_version "$DEST_APP")) — installed"; else echo "patched  : not installed"; fi
  if launchctl print "gui/$(id -u)/$WATCH_LABEL" >/dev/null 2>&1; then echo "watcher  : active (re-patches on Claude update)"; else echo "watcher  : not active"; fi
}

cmd_uninstall() {
  quit_app_at "$DEST_APP"   # close the running copy first, else it lingers in the Dock
  if [ -d "$DEST_APP" ]; then
    rm -rf "$DEST_APP"
    log "removed $DEST_APP (original untouched)."
  else
    log "nothing to remove ($DEST_APP)."
  fi
}

# --- Auto-reapply watcher (§10): a user LaunchAgent that re-patches after a Claude update ---
cmd_watch() {
  [ -f "$WATCH_PLIST_SRC" ] || die "agent.plist template not found at $WATCH_PLIST_SRC."
  [ -f "$SCRIPT_DIR/watch.sh" ] || die "watch.sh not found at $SCRIPT_DIR/watch.sh."
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
  sed -e "s#__WATCH_SH__#$SCRIPT_DIR/watch.sh#g" -e "s#__LOG__#$WATCH_LOG#g" \
    "$WATCH_PLIST_SRC" > "$WATCH_PLIST_DST"
  # Bundled (.app) install: pass the node-free helper + payload into the agent's env so the
  # auto-re-patch also runs without system Node.
  if [ -n "${CLAUDE_RTL_HELPER:-}" ] && [ -n "${CLAUDE_RTL_PAYLOAD:-}" ]; then
    for kv in "CLAUDE_RTL_HELPER:$CLAUDE_RTL_HELPER" "CLAUDE_RTL_PAYLOAD:$CLAUDE_RTL_PAYLOAD"; do
      k="${kv%%:*}"; v="${kv#*:}"
      /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:$k string $v" "$WATCH_PLIST_DST" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:$k $v" "$WATCH_PLIST_DST"
    done
  fi
  launchctl bootout "gui/$(id -u)/$WATCH_LABEL" 2>/dev/null || true   # reload if already loaded
  launchctl bootstrap "gui/$(id -u)" "$WATCH_PLIST_DST" || die "launchctl bootstrap failed."
  log "watcher installed → $WATCH_PLIST_DST"
  log "it re-applies the RTL patch whenever Claude updates. Logs: $WATCH_LOG"
}

cmd_unwatch() {
  launchctl bootout "gui/$(id -u)/$WATCH_LABEL" 2>/dev/null || true
  if [ -f "$WATCH_PLIST_DST" ]; then rm -f "$WATCH_PLIST_DST"; log "watcher removed."; else log "watcher was not installed."; fi
}

cmd_install() {
  # Trust gate (§11): verify signed payload + scripts before doing anything. 0=verified,
  # 2=unsigned (dev), 1=tampered. Strict mode refuses an unsigned build too.
  if [ -f "$SCRIPT_DIR/verify.sh" ]; then
    local vrc=0
    bash "$SCRIPT_DIR/verify.sh" || vrc=$?
    if [ "$vrc" -eq 1 ]; then
      die "integrity check failed — refusing to patch. Re-run desktop/sign.sh after legitimate changes."
    elif [ "$vrc" -eq 2 ]; then
      [ "${CLAUDE_RTL_STRICT:-0}" = "1" ] && die "unsigned build and CLAUDE_RTL_STRICT=1 set — refusing."
      log "WARNING: unsigned build (no signed manifest) — proceeding in dev mode."
    else
      log "integrity verified (signed payload + scripts)."
    fi
  fi

  bash "$SCRIPT_DIR/preflight.sh"

  if [ -n "${CLAUDE_RTL_PAYLOAD:-}" ]; then
    log "using bundled payload ($PAYLOAD)…"
  else
    log "building payload…"
    ( cd "$REPO_ROOT" && node build/build-payload.js >/dev/null )
  fi
  [ -f "$PAYLOAD" ] || die "payload not found at $PAYLOAD."
  grep -q "$MARKER" "$PAYLOAD" || die "payload missing marker $MARKER — build looks wrong."

  log "copying $ORIG_APP → $DEST_APP (original is never modified)…"
  quit_app_at "$DEST_APP"   # never rm -rf a running bundle (an update would corrupt it)
  rm -rf "$DEST_APP"
  cp -R "$ORIG_APP" "$DEST_APP"

  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claude-RTL" "$DEST_APP/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Claude-RTL" "$DEST_APP/Contents/Info.plist"

  local ASAR="$DEST_APP/Contents/Resources/app.asar"
  local ORIG_UNPACKED="$DEST_APP/Contents/Resources/app.asar.unpacked"
  WORK="$(mktemp -d)"

  log "extracting app.asar…"
  asar_extract "$ASAR" "$WORK/app"

  # --- Verify layout before changing anything (§11: die loudly, not silently) ---
  local VITE="$WORK/app/.vite/build"
  [ -d "$VITE" ] || die "expected .vite/build missing — Claude's layout changed; aborting."
  local MAIN_REL MAIN
  # Read package.json "main" without Node — plutil reads JSON; grep is the fallback.
  MAIN_REL="$(plutil -extract main raw -o - "$WORK/app/package.json" 2>/dev/null \
    || grep -oE '"main"[[:space:]]*:[[:space:]]*"[^"]*"' "$WORK/app/package.json" | sed -E 's/.*"([^"]*)"$/\1/')"
  [ -n "$MAIN_REL" ] || die "cannot read \"main\" from package.json."
  MAIN="$WORK/app/$MAIN_REL"
  [ -f "$MAIN" ] || die "main entry $MAIN_REL missing — aborting."

  # --- Inject: payload into every renderer bundle EXCEPT the main entry ---
  local injected=0 skipped=0 f
  for f in "$VITE"/*.js; do
    [ -e "$f" ] || continue
    if [ "$f" -ef "$MAIN" ]; then continue; fi          # main entry handled separately
    if grep -q "$MARKER" "$f"; then skipped=$((skipped+1)); continue; fi  # idempotent
    cat "$PAYLOAD" "$f" > "$f.rtltmp" && mv "$f.rtltmp" "$f"
    injected=$((injected+1))
  done
  log "payload → $injected renderer bundle(s) ($skipped already patched)."

  # --- Main entry: ONLY the window-chrome switch, never the full payload (→ black screen) ---
  if grep -q "$UIDIR_MARKER" "$MAIN"; then
    log "main entry already carries the ui-direction switch."
  else
    printf '%s\n' "/* $UIDIR_MARKER */ try { require('electron').app.commandLine.appendSwitch('force-ui-direction','ltr'); } catch (e) {}" \
      | cat - "$MAIN" > "$MAIN.rtltmp" && mv "$MAIN.rtltmp" "$MAIN"
    log "force-ui-direction=ltr → main entry ($MAIN_REL)."
  fi

  # --- Repack (keep native binaries unpacked) ---
  log "repacking app.asar…"
  rm -f "$ASAR"
  asar_pack "$WORK/app" "$ASAR"

  # Safety net: every file the original kept unpacked must still be unpacked.
  if [ -d "$ORIG_UNPACKED" ]; then
    local missing
    missing="$(cd "$ORIG_UNPACKED" && find . -type f | while read -r rel; do
      [ -e "$DEST_APP/Contents/Resources/app.asar.unpacked/$rel" ] || echo "$rel"; done)"
    [ -z "$missing" ] || die "repack dropped unpacked binaries:\n$missing"
  fi

  # --- Flip the asar-integrity fuse (our asar differs from the signed manifest) ---
  log "writing fuses (EnableEmbeddedAsarIntegrityValidation=off)…"
  fuses_off "$DEST_APP"

  # --- Ad-hoc re-sign, PRESERVING entitlements minus the team-id-coupled keys ---
  log "re-signing (ad-hoc, preserving entitlements)…"
  local ENT="$WORK/entitlements.plist"
  codesign -d --entitlements - --xml "$ORIG_APP" 2>/dev/null > "$ENT" || die "could not read original entitlements."
  for key in com.apple.application-identifier com.apple.developer.team-identifier keychain-access-groups; do
    /usr/libexec/PlistBuddy -c "Delete :$key" "$ENT" 2>/dev/null || true
  done
  codesign --force --deep --sign - --entitlements "$ENT" "$DEST_APP" 2>&1 | sed 's/^/patch:   codesign: /' || die "codesign failed."

  log "verifying signature…"
  codesign --verify --deep --strict "$DEST_APP" 2>&1 | sed 's/^/patch:   /' || log "note: --strict verify warned (ad-hoc); launch test is the real check."

  log "DONE → $DEST_APP"
  log "launch it, confirm RTL + that Cowork works. First launch may show a blank window once — quit & reopen."
}

case "${1:---install}" in
  --install)   cmd_install ;;
  --uninstall) cmd_uninstall ;;
  --status)    cmd_status ;;
  --watch)     cmd_watch ;;
  --unwatch)   cmd_unwatch ;;
  -h|--help)   echo "usage: $0 [--install] | --uninstall | --status | --watch | --unwatch" ;;
  *)           die "unknown flag '$1' (use --install | --uninstall | --status | --watch | --unwatch)" ;;
esac
