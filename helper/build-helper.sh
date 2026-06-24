#!/usr/bin/env bash
# helper/build-helper.sh — compile sea-cli.js into a standalone Node SEA binary
# (claude-rtl-helper) that bundles @electron/asar + @electron/fuses. The shipped .app runs
# this binary, so end users need NO system Node. Run once at our build time (we have Node).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "helper: installing build deps…"
npm install --silent --no-audit --no-fund

echo "helper: bundling sea-cli.js → single file…"
# 'original-fs' is Electron-only; @electron/asar requires it only when running inside
# Electron, so it's safe to leave external (the branch is never taken under plain Node).
npx --yes esbuild sea-cli.js --bundle --platform=node --target=node20 \
  --external:original-fs --outfile=sea-cli.bundle.js

echo "helper: generating SEA blob…"
cat > sea-config.json <<'JSON'
{
  "main": "sea-cli.bundle.js",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
JSON
node --experimental-sea-config sea-config.json

echo "helper: injecting blob into a copy of node…"
cp "$(command -v node)" claude-rtl-helper
# A universal node carries the SEA sentinel in every slice → postject sees duplicates.
# Thin to the native arch first.
if lipo -info claude-rtl-helper 2>/dev/null | grep -q "fat file"; then
  lipo claude-rtl-helper -thin "$(uname -m)" -output claude-rtl-helper.thin
  mv claude-rtl-helper.thin claude-rtl-helper
fi
codesign --remove-signature claude-rtl-helper 2>/dev/null || true
npx --yes postject claude-rtl-helper NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA
codesign --sign - claude-rtl-helper

echo "helper: smoke test…"
./claude-rtl-helper 2>&1 | head -1 || true
echo "helper: built $DIR/claude-rtl-helper ($(du -h claude-rtl-helper | cut -f1))"
