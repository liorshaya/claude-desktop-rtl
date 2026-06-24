#!/usr/bin/env bash
# desktop/preflight.sh — environment checks before patching (§11 subset, macOS only).
# Exits non-zero with a SPECIFIC, named error on any failure so patch.sh never produces
# a silently broken app. Deeper hardening (nvm/fnm shim, file-lock) is P4.
set -euo pipefail

ORIG_APP="${ORIG_APP:-/Applications/Claude.app}"
DEST_DIR="${DEST_DIR:-$HOME/Applications}"

die() { echo "preflight: ERROR — $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "macOS only (this is $(uname -s))."

# --- Toolchain: node + npx (the asar/fuses tools run via npx) ---
command -v node >/dev/null 2>&1 || die "node not found on PATH."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 18 ] || die "Node too old — need >=18, have $(node -v 2>/dev/null || echo none)."
command -v npx >/dev/null 2>&1 || die "npx not found on PATH."
command -v codesign >/dev/null 2>&1 || die "codesign not found (install Xcode command line tools)."

# --- Source app present and the expected bundle ---
[ -d "$ORIG_APP" ] || die "original app not found at $ORIG_APP."
[ -f "$ORIG_APP/Contents/Resources/app.asar" ] || \
  die "no app.asar under $ORIG_APP/Contents/Resources — unexpected layout."

# --- Destination writable (never the original) ---
mkdir -p "$DEST_DIR" 2>/dev/null || die "cannot create $DEST_DIR."
[ -w "$DEST_DIR" ] || die "$DEST_DIR is not writable."

echo "preflight: OK — node $(node -v), npx present, app.asar found, $DEST_DIR writable."
