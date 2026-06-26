#!/usr/bin/env bash
# desktop/preflight.sh — environment checks before patching (§11 subset, macOS only).
# Exits non-zero with a SPECIFIC, named error on any failure so patch.sh never produces
# a silently broken app. Deeper hardening (nvm/fnm shim, file-lock) is P4.
set -euo pipefail

ORIG_APP="${ORIG_APP:-/Applications/Claude.app}"
DEST_DIR="${DEST_DIR:-$HOME/Applications}"
DEST_APP="${DEST_APP:-$DEST_DIR/Claude-RTL.app}"

die() { echo "preflight: ERROR — $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "macOS only (this is $(uname -s))."

# The bundled .app ships a standalone helper + pre-built payload, so it needs NO Node.
# Only require Node/npx in the dev path (helper/payload not provided via env).
if [ -n "${CLAUDE_RTL_HELPER:-}" ] && [ -n "${CLAUDE_RTL_PAYLOAD:-}" ]; then
  [ -x "$CLAUDE_RTL_HELPER" ] || die "bundled helper not executable: $CLAUDE_RTL_HELPER"
  [ -f "$CLAUDE_RTL_PAYLOAD" ] || die "bundled payload missing: $CLAUDE_RTL_PAYLOAD"
else
  # --- Node version manager shim: a shimmed npx may dispatch to a wrong/old node, or fail
  # under launchd's bare environment. Prefer a real system node/npx when npx is a shim. ---
  NPX_PATH="$(command -v npx 2>/dev/null || true)"
  case "$NPX_PATH" in
    *"/.nvm/"*|*"/.fnm/"*|*"/.volta/"*|*"/.asdf/"*|*"fnm_multishells"*|*"/n/"*)
      for sys in /usr/local/bin /opt/homebrew/bin; do
        if [ -x "$sys/npx" ] && [ -x "$sys/node" ]; then
          export PATH="$sys:$PATH"
          echo "preflight: npx was a version-manager shim ($NPX_PATH) — using system Node at $sys." >&2
          break
        fi
      done
      ;;
  esac
  command -v node >/dev/null 2>&1 || die "node not found on PATH."
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$NODE_MAJOR" -ge 18 ] || die "Node too old — need >=18, have $(node -v 2>/dev/null || echo none)."
  command -v npx >/dev/null 2>&1 || die "npx not found on PATH."
fi
command -v codesign >/dev/null 2>&1 || die "codesign not found (install Xcode command line tools)."

# --- Source app present and the expected bundle ---
[ -d "$ORIG_APP" ] || die "original app not found at $ORIG_APP."
[ -f "$ORIG_APP/Contents/Resources/app.asar" ] || \
  die "no app.asar under $ORIG_APP/Contents/Resources — unexpected layout."

# --- Destination writable (never the original) — probe with a real write, not just -w ---
mkdir -p "$DEST_DIR" 2>/dev/null || die "cannot create $DEST_DIR."
PROBE="$DEST_DIR/.claude-rtl-write-probe.$$"
( : > "$PROBE" ) 2>/dev/null || die "$DEST_DIR is not writable."
rm -f "$PROBE"

# --- File-lock: a uchg (Finder "Locked") flag on the existing copy blocks the rebuild ---
if [ -e "$DEST_APP" ]; then
  FLAGS="$(stat -f %Sf "$DEST_APP" 2>/dev/null || echo)"
  case "$FLAGS" in
    *uchg*) die "$DEST_APP is locked (uchg) — unlock with: chflags -R nouchg \"$DEST_APP\"" ;;
  esac
fi

if [ -n "${CLAUDE_RTL_HELPER:-}" ] && [ -n "${CLAUDE_RTL_PAYLOAD:-}" ]; then
  echo "preflight: OK — bundled helper, app.asar found, $DEST_DIR writable (no Node needed)."
else
  echo "preflight: OK — node $(node -v), npx present, app.asar found, $DEST_DIR writable."
fi
