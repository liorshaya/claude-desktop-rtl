#!/usr/bin/env bash
# desktop/sign.sh — AUTHOR tool (§11). Builds the payload, hashes the security-relevant
# files, and signs the manifest with an offline EC key. The PRIVATE key lives outside the
# repo (~/.config/claude-rtl) and must never be committed; the PUBLIC key is pinned in the
# repo so verify.sh can check releases. Re-run after any legitimate change to a signed file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TRUST="$SCRIPT_DIR/trust"
KEYDIR="${CLAUDE_RTL_KEYDIR:-$HOME/.config/claude-rtl}"
PRIV="$KEYDIR/signing.key"
PUBKEY="$TRUST/claude-rtl.pub"
MANIFEST="$TRUST/MANIFEST.sha256"
SIG="$MANIFEST.sig"

# Security-relevant files (repo-relative). dist/payload.js is the built renderer payload.
SIGNED_FILES=(
  desktop/patch.sh
  desktop/preflight.sh
  desktop/watch.sh
  desktop/agent.plist
  desktop/verify.sh
  dist/payload.js
)

mkdir -p "$TRUST" "$KEYDIR"; chmod 700 "$KEYDIR"

if [ ! -f "$PRIV" ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV"
  chmod 600 "$PRIV"
  openssl ec -in "$PRIV" -pubout -out "$PUBKEY" 2>/dev/null
  echo "sign: generated a new signing key at $PRIV"
  echo "sign:   → keep it safe and OFFLINE; never commit it."
  echo "sign:   → pinned public key written to $PUBKEY — commit that."
fi
[ -f "$PUBKEY" ] || openssl ec -in "$PRIV" -pubout -out "$PUBKEY" 2>/dev/null

# Build the payload so its hash reflects the current engine + dom (deterministic build).
( cd "$REPO_ROOT" && node build/build-payload.js >/dev/null )

( cd "$REPO_ROOT" && shasum -a 256 "${SIGNED_FILES[@]}" > "$MANIFEST" )
openssl dgst -sha256 -sign "$PRIV" -out "$SIG" "$MANIFEST"

echo "sign: signed ${#SIGNED_FILES[@]} files → $MANIFEST (+ $(basename "$SIG"))"
echo "sign: verify with: desktop/verify.sh"
