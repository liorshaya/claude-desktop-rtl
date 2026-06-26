#!/usr/bin/env bash
# desktop/verify.sh — trust gate (§11). Before anything runs, verify that the scripts +
# built payload match a manifest SIGNED by the offline key whose PUBLIC half is pinned in
# the repo. Built on macOS's stock LibreSSL (ECDSA P-256) + shasum — no external tools.
#
# exit 0 = verified · exit 2 = unsigned (no manifest; local dev) · exit 1 = TAMPERED
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TRUST="$SCRIPT_DIR/trust"
PUBKEY="$TRUST/claude-rtl.pub"
MANIFEST="$TRUST/MANIFEST.sha256"
SIG="$MANIFEST.sig"

die() { echo "verify: FAILED — $*" >&2; exit 1; }

# Unsigned build (no manifest shipped) — caller decides whether that's acceptable.
if [ ! -f "$MANIFEST" ] || [ ! -f "$SIG" ]; then
  echo "verify: no signed manifest present — unsigned build." >&2
  exit 2
fi
[ -f "$PUBKEY" ] || die "pinned public key missing ($PUBKEY)."

# 1) The manifest itself must be signed by the pinned key.
openssl dgst -sha256 -verify "$PUBKEY" -signature "$SIG" "$MANIFEST" >/dev/null 2>&1 \
  || die "manifest signature does not match the pinned key — refusing to run."

# 2) Every listed file must still hash to what the manifest says (paths are repo-relative).
bad="$(cd "$REPO_ROOT" && shasum -a 256 -c "$MANIFEST" 2>/dev/null | grep -v ': OK$' || true)"
[ -z "$bad" ] || die "file hashes changed since signing:
$bad"

echo "verify: OK — signature + hashes match the pinned key."
exit 0
