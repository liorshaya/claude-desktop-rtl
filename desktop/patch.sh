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
# Native code can't be loaded from inside an asar, so every binary the original ships
# UNPACKED must stay unpacked. The set is DERIVED from the original's app.asar.unpacked at
# patch time (build_unpack_glob): a hardcoded extension list silently swallows anything
# Anthropic adds later — v1.30096.5 introduced resources/github-mcp/github-mcp-server, a
# plain 39.8MB executable matching none of *.node / *.dylib / spawn-helper, which the old
# glob packed INSIDE the asar (where it can never be exec'd). Fallback only if that dir is
# missing. Verified against the original after packing.
UNPACK_GLOB_FALLBACK="**/*.node,**/*.dylib,**/spawn-helper"
UNPACK_GLOB=""                        # set by build_unpack_glob() during install

# Auto-reapply watcher (§10).
WATCH_LABEL="com.claude-rtl.watcher"
WATCH_PLIST_SRC="$SCRIPT_DIR/agent.plist"
WATCH_PLIST_DST="$HOME/Library/LaunchAgents/$WATCH_LABEL.plist"
WATCH_LOG="$HOME/Library/Logs/claude-rtl-watch.log"

# The patched bundle is built at STAGE_APP and only swapped into DEST_APP once it is
# complete AND its signature verifies. An aborted patch must never leave a half-built bundle
# at DEST_APP: Anthropic's original signature over modified contents makes the bundle
# unlaunchable (launchd: RBSRequestErrorDomain 5 / POSIX 163 "Launchd job spawn failed"),
# which is far worse than simply staying on the previous version. BACKUP_APP holds the old
# copy for the instant between the two renames, so a late failure can still roll back.
# Both are dot-prefixed so Finder/LaunchServices ignore them mid-build.
DEST_DIR="$(dirname "$DEST_APP")"
DEST_NAME="$(basename "$DEST_APP")"
STAGE_APP="$DEST_DIR/.${DEST_NAME%.app}.staging.app"
BACKUP_APP="$DEST_DIR/.${DEST_NAME%.app}.previous.app"

WORK=""
die() { echo "patch: ERROR — $*" >&2; exit 1; }
log() { echo "patch: $*"; }
cleanup() {
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  rm -rf "$STAGE_APP"
  # Killed between "move the old app aside" and "put the new one in place"? Put it back.
  if [ -d "$BACKUP_APP" ]; then
    if [ -d "$DEST_APP" ]; then rm -rf "$BACKUP_APP"; else mv "$BACKUP_APP" "$DEST_APP"; fi
  fi
  return 0
}
trap cleanup EXIT

app_version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }

# asar/fuses via the bundled standalone helper when present (no Node), else npx.
asar_extract() { if [ -n "$HELPER" ]; then "$HELPER" extract "$1" "$2"; else npx --yes @electron/asar extract "$1" "$2"; fi; }
asar_pack()    { if [ -n "$HELPER" ]; then "$HELPER" pack "$1" "$2" "$UNPACK_GLOB"; else npx --yes @electron/asar pack "$1" "$2" --unpack "$UNPACK_GLOB"; fi; }
fuses_off()    { if [ -n "$HELPER" ]; then "$HELPER" fuses "$1" EnableEmbeddedAsarIntegrityValidation=off; else npx --yes @electron/fuses write --app "$1" EnableEmbeddedAsarIntegrityValidation=off >/dev/null; fi; }

# Build the asar --unpack glob from the binaries the ORIGINAL keeps unpacked, so a native
# file added in a future Claude version can't quietly end up inside the archive. Files with
# an extension collapse to one "**/*.ext" pattern; extensionless ones match by name.
build_unpack_glob() {                 # sets UNPACK_GLOB
  local dir="$1" pats="" f base pat
  if [ ! -d "$dir" ]; then
    UNPACK_GLOB="{$UNPACK_GLOB_FALLBACK}"
    log "WARNING: $dir missing — falling back to the built-in unpack glob."
    return 0
  fi
  while IFS= read -r f; do
    base="${f##*/}"
    # A brace or comma in a name would corrupt the brace-expansion list we hand to asar.
    case "$base" in *[,{}]*) die "unpacked binary '$base' contains , { or } — cannot build an unpack glob." ;; esac
    case "$base" in
      *.*) pat="**/*.${base##*.}" ;;
      *)   pat="**/$base" ;;
    esac
    case ",$pats," in *",$pat,"*) ;; *) pats="${pats:+$pats,}$pat" ;; esac
  done < <(find "$dir" -type f)
  [ -n "$pats" ] || pats="$UNPACK_GLOB_FALLBACK"
  UNPACK_GLOB="{$pats}"
}

# Number of entries an asar header marks "unpacked". Header layout: four LE uint32s, the
# 4th (offset 12) being the JSON length, with the JSON itself starting at offset 16.
# Comparing this count against the original's is what catches a binary silently swallowed
# into the archive — the file still exists in app.asar.unpacked either way, so a
# presence check alone proves nothing.
asar_unpacked_count() {
  local a="$1" jlen
  [ -s "$a" ] || { echo -1; return 0; }
  jlen="$(od -An -tu4 -j12 -N4 "$a" 2>/dev/null | tr -d ' ' || true)"
  case "$jlen" in ''|*[!0-9]*) echo -1; return 0 ;; esac
  head -c "$((16 + jlen))" "$a" | tail -c "$jlen" \
    | grep -o '"unpacked":true' | wc -l | tr -d ' ' || true
}

# Count occurrences (not lines) of a literal in a possibly-binary file.
count_occurrences() { LC_ALL=C grep -o -a -F "$1" "$2" | wc -l | tr -d ' ' || true; }

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
  # Drop any staging/backup leftovers first, so cleanup() cannot "restore" one over the
  # removal we are about to perform.
  rm -rf "$STAGE_APP" "$BACKUP_APP"
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
  local vrc=2
  if [ -f "$SCRIPT_DIR/verify.sh" ]; then
    vrc=0
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
  elif [ "$vrc" -eq 0 ] && [ -f "$PAYLOAD" ]; then
    # Signed build: inject the payload the manifest just verified. Rebuilding here would
    # replace it with output from engine/dom SOURCES, which the manifest does NOT cover —
    # "integrity verified" must describe the bytes that actually get injected (§11).
    # After a legitimate source change, re-run desktop/sign.sh (which rebuilds + re-signs).
    log "using the signature-verified payload ($PAYLOAD)…"
  else
    log "building payload…"
    ( cd "$REPO_ROOT" && node build/build-payload.js >/dev/null )
  fi
  [ -f "$PAYLOAD" ] || die "payload not found at $PAYLOAD."
  grep -q "$MARKER" "$PAYLOAD" || die "payload missing marker $MARKER — build looks wrong."

  log "copying $ORIG_APP → staging (original is never modified)…"
  mkdir -p "$DEST_DIR"
  rm -rf "$STAGE_APP"
  cp -R "$ORIG_APP" "$STAGE_APP"

  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claude-RTL" "$STAGE_APP/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Claude-RTL" "$STAGE_APP/Contents/Info.plist"

  local ASAR="$STAGE_APP/Contents/Resources/app.asar"
  local ORIG_ASAR="$ORIG_APP/Contents/Resources/app.asar"
  # Reference the ORIGINAL, not the copy: the old code pointed both sides of the post-repack
  # check at the same directory, so it compared the copy against itself and always passed.
  local ORIG_UNPACKED="$ORIG_APP/Contents/Resources/app.asar.unpacked"
  WORK="$(mktemp -d)"

  build_unpack_glob "$ORIG_UNPACKED"
  log "unpack glob (derived from the original): $UNPACK_GLOB"

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

  # --- Safety nets: a repack can fail in ways that still look like success ---

  # 1) It can produce nothing at all and still exit 0 (observed after the v1.30096.5 update:
  #    app.asar was simply absent, and every downstream check passed regardless).
  [ -s "$ASAR" ] || die "repack produced no app.asar — aborting."

  # 2) Every payload we injected must actually be inside the archive.
  local per want_markers got_markers
  per="$(count_occurrences "$MARKER" "$PAYLOAD")"
  want_markers=$(( (injected + skipped) * per ))
  got_markers="$(count_occurrences "$MARKER" "$ASAR")"
  [ "${got_markers:-0}" -ge "$want_markers" ] \
    || die "repacked app.asar carries $got_markers payload marker(s), expected $want_markers — repack is incomplete."

  # 3) Every file the original keeps unpacked must still EXIST unpacked…
  if [ -d "$ORIG_UNPACKED" ]; then
    local missing
    missing="$(cd "$ORIG_UNPACKED" && find . -type f | while read -r rel; do
      [ -e "$STAGE_APP/Contents/Resources/app.asar.unpacked/$rel" ] || echo "$rel"; done)"
    [ -z "$missing" ] || die "repack dropped unpacked binaries:\n$missing"
  fi

  # 4) …AND still be MARKED unpacked in the header. (3) alone cannot catch this: the file
  #    survives on disk because it was cp'd from the original, while the header now points
  #    inside the archive — which is how github-mcp-server broke without any error.
  local want_unpacked got_unpacked
  want_unpacked="$(asar_unpacked_count "$ORIG_ASAR")"
  got_unpacked="$(asar_unpacked_count "$ASAR")"
  if [ "$want_unpacked" -ge 0 ] && [ "$got_unpacked" != "$want_unpacked" ]; then
    die "repack marks $got_unpacked file(s) unpacked but the original marks $want_unpacked — a native binary was packed INSIDE the asar and could never be exec'd. Unpack glob was: $UNPACK_GLOB"
  fi
  log "repack verified ($got_markers payload marker(s), $got_unpacked unpacked binaries)."

  # --- Flip the asar-integrity fuse (our asar differs from the signed manifest) ---
  # Retried: this step writes into the Electron Framework binary and is the one that fails
  # transiently right after a Claude update (EPERM while the freshly-swapped original is
  # still being launched/finalised). One retry loop turns a lost update into a short wait.
  log "writing fuses (EnableEmbeddedAsarIntegrityValidation=off)…"
  local attempt out
  for attempt in 1 2 3 4 5; do
    if out="$(fuses_off "$STAGE_APP" 2>&1)"; then break; fi
    [ "$attempt" -lt 5 ] || die "fuses failed after $attempt attempts: $out"
    log "  attempt $attempt failed ($out) — retrying in $((attempt * 3))s…"
    sleep "$((attempt * 3))"
  done

  # --- Ad-hoc re-sign, PRESERVING entitlements minus the team-id-coupled keys ---
  log "re-signing (ad-hoc, preserving entitlements)…"
  local ENT="$WORK/entitlements.plist"
  codesign -d --entitlements - --xml "$ORIG_APP" 2>/dev/null > "$ENT" || die "could not read original entitlements."
  for key in com.apple.application-identifier com.apple.developer.team-identifier keychain-access-groups; do
    /usr/libexec/PlistBuddy -c "Delete :$key" "$ENT" 2>/dev/null || true
  done
  codesign --force --deep --sign - --entitlements "$ENT" "$STAGE_APP" 2>&1 | sed 's/^/patch:   codesign: /' || die "codesign failed."

  # A HARD gate, not a warning. An unsigned/stale-signed bundle is precisely what makes
  # launchd refuse to spawn the app, so it must never reach DEST_APP.
  log "verifying signature…"
  codesign --verify --strict "$STAGE_APP" 2>&1 | sed 's/^/patch:   /' \
    || die "the freshly signed bundle does not verify — refusing to install it."

  # --- Atomic install: only now does the live app get replaced ---
  quit_app_at "$DEST_APP"   # never rm -rf a running bundle
  rm -rf "$BACKUP_APP"
  if [ -d "$DEST_APP" ]; then mv "$DEST_APP" "$BACKUP_APP"; fi
  mv "$STAGE_APP" "$DEST_APP"
  if ! codesign --verify --strict "$DEST_APP" >/dev/null 2>&1; then
    rm -rf "$DEST_APP"
    if [ -d "$BACKUP_APP" ]; then mv "$BACKUP_APP" "$DEST_APP"; fi
    die "the installed bundle failed verification — rolled back to the previous copy."
  fi
  rm -rf "$BACKUP_APP"

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
