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
PAYLOAD="$REPO_ROOT/dist/payload.js"
MARKER="claude-rtl-payload-v1"        # build-payload.js stamps this into the IIFE
UIDIR_MARKER="claude-rtl-uidir"       # marks the main-entry switch (idempotency)
# Native code can't be loaded from inside an asar, so these stay unpacked (must match the
# original set: *.node, *.dylib, spawn-helper). Verified against the copy after packing.
UNPACK_GLOB="{**/*.node,**/*.dylib,**/spawn-helper}"

WORK=""
die() { echo "patch: ERROR — $*" >&2; exit 1; }
log() { echo "patch: $*"; }
cleanup() { [ -n "$WORK" ] && rm -rf "$WORK"; return 0; }
trap cleanup EXIT

app_version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }

cmd_status() {
  if [ -d "$ORIG_APP" ]; then echo "original : $ORIG_APP (v$(app_version "$ORIG_APP")) — untouched"; else echo "original : MISSING ($ORIG_APP)"; fi
  if [ -d "$DEST_APP" ]; then echo "patched  : $DEST_APP (v$(app_version "$DEST_APP")) — installed"; else echo "patched  : not installed"; fi
}

cmd_uninstall() {
  [ -d "$DEST_APP" ] || { log "nothing to remove ($DEST_APP)"; return; }
  rm -rf "$DEST_APP"
  log "removed $DEST_APP (original untouched)."
}

cmd_install() {
  bash "$SCRIPT_DIR/preflight.sh"

  log "building payload…"
  ( cd "$REPO_ROOT" && node build/build-payload.js >/dev/null )
  [ -f "$PAYLOAD" ] || die "payload not built at $PAYLOAD."
  grep -q "$MARKER" "$PAYLOAD" || die "payload missing marker $MARKER — build looks wrong."

  log "copying $ORIG_APP → $DEST_APP (original is never modified)…"
  rm -rf "$DEST_APP"
  cp -R "$ORIG_APP" "$DEST_APP"

  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claude-RTL" "$DEST_APP/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Claude-RTL" "$DEST_APP/Contents/Info.plist"

  local ASAR="$DEST_APP/Contents/Resources/app.asar"
  local ORIG_UNPACKED="$DEST_APP/Contents/Resources/app.asar.unpacked"
  WORK="$(mktemp -d)"

  log "extracting app.asar…"
  npx --yes @electron/asar extract "$ASAR" "$WORK/app"

  # --- Verify layout before changing anything (§11: die loudly, not silently) ---
  local VITE="$WORK/app/.vite/build"
  [ -d "$VITE" ] || die "expected .vite/build missing — Claude's layout changed; aborting."
  local MAIN_REL MAIN
  MAIN_REL="$(node -p "require('$WORK/app/package.json').main" 2>/dev/null)" || die "cannot read \"main\" from package.json."
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
  npx --yes @electron/asar pack "$WORK/app" "$ASAR" --unpack "$UNPACK_GLOB"

  # Safety net: every file the original kept unpacked must still be unpacked.
  if [ -d "$ORIG_UNPACKED" ]; then
    local missing
    missing="$(cd "$ORIG_UNPACKED" && find . -type f | while read -r rel; do
      [ -e "$DEST_APP/Contents/Resources/app.asar.unpacked/$rel" ] || echo "$rel"; done)"
    [ -z "$missing" ] || die "repack dropped unpacked binaries:\n$missing"
  fi

  # --- Flip the asar-integrity fuse (our asar differs from the signed manifest) ---
  log "writing fuses (EnableEmbeddedAsarIntegrityValidation=off)…"
  npx --yes @electron/fuses write --app "$DEST_APP" EnableEmbeddedAsarIntegrityValidation=off >/dev/null

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
  -h|--help)   echo "usage: $0 [--install] | --uninstall | --status" ;;
  *)           die "unknown flag '$1' (use --install | --uninstall | --status)" ;;
esac
