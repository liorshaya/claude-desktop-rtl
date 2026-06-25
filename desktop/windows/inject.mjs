// desktop/windows/inject.mjs - byte-exact RTL injection into an EXTRACTED asar tree.
//
// Mirrors desktop/patch.sh (the "Inject" block): prepend the prebuilt RTL payload to every
// TOP-LEVEL .vite/build/*.js renderer bundle EXCEPT the main entry, and prepend ONLY the
// force-ui-direction=ltr switch to the main entry (full payload in main => black screen, sec 9).
//
// Done in Node (not PowerShell) on purpose: PowerShell 5.1 mangles encodings, and we need a
// byte-exact concat (Buffer, no re-encode, no BOM) so copy / Ctrl-F stay intact (sec 3.6) and
// the asar packs cleanly. Idempotent via the same markers patch.sh uses. No dependencies.
//
//   node inject.mjs <extractedAppDir> <payloadPath>
//
// Fails loud (non-zero exit) on any layout surprise, exactly like patch.sh.

import fs from 'node:fs';
import path from 'node:path';

const MARKER = 'claude-rtl-payload-v1';   // stamped into the payload IIFE by build/build-payload.js
const UIDIR_MARKER = 'claude-rtl-uidir';  // marks the main-entry switch (idempotency)
const SWITCH_LINE =
  `/* ${UIDIR_MARKER} */ try { require('electron').app.commandLine.appendSwitch('force-ui-direction','ltr'); } catch (e) {}`;

function die(msg) { console.error(`inject: ERROR - ${msg}`); process.exit(1); }
function log(msg) { console.log(`inject: ${msg}`); }

const [appDir, payloadPath] = process.argv.slice(2);
if (!appDir || !payloadPath) die('usage: node inject.mjs <extractedAppDir> <payloadPath>');
if (!fs.existsSync(appDir)) die(`extracted app dir not found: ${appDir}`);
if (!fs.existsSync(payloadPath)) die(`payload not found: ${payloadPath}`);

const payloadBuf = fs.readFileSync(payloadPath);
if (!payloadBuf.includes(MARKER)) die(`payload missing marker ${MARKER} - build looks wrong.`);

// --- locate the main entry from package.json "main" (e.g. .vite/build/index.pre.js) ---
const pkgPath = path.join(appDir, 'package.json');
if (!fs.existsSync(pkgPath)) die('package.json missing in extracted app.');
const mainRel = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).main;
if (!mainRel) die('cannot read "main" from package.json.');
const mainAbs = path.resolve(appDir, mainRel);
if (!fs.existsSync(mainAbs)) die(`main entry ${mainRel} missing - aborting.`);

const viteDir = path.join(appDir, '.vite', 'build');
if (!fs.existsSync(viteDir)) die('expected .vite/build missing - Claude layout changed; aborting.');

// --- payload into every TOP-LEVEL .vite/build/*.js EXCEPT the main entry (non-recursive,
//     matching patch.sh's `for f in "$VITE"/*.js`) ---
let injected = 0, skipped = 0;
const hit = [];
for (const name of fs.readdirSync(viteDir)) {
  if (!name.endsWith('.js')) continue;
  const f = path.join(viteDir, name);
  if (!fs.statSync(f).isFile()) continue;
  if (path.resolve(f) === mainAbs) continue;            // main entry handled separately
  const buf = fs.readFileSync(f);
  if (buf.includes(MARKER)) { skipped++; continue; }    // idempotent: already patched
  fs.writeFileSync(f, Buffer.concat([payloadBuf, buf]));
  injected++; hit.push(name);
}
log(`payload -> ${injected} renderer bundle(s) (${skipped} already patched): ${hit.join(', ') || '(none)'}`);

// --- main entry: ONLY the window-chrome switch, never the full payload ---
const mainBuf = fs.readFileSync(mainAbs);
if (mainBuf.includes(UIDIR_MARKER)) {
  log('main entry already carries the ui-direction switch.');
} else {
  fs.writeFileSync(mainAbs, Buffer.concat([Buffer.from(SWITCH_LINE + '\n', 'utf8'), mainBuf]));
  log(`force-ui-direction=ltr -> main entry (${mainRel}).`);
}
