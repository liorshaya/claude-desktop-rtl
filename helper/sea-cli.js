'use strict';
// helper/sea-cli.js — the asar + fuses operations patch.sh needs, as a tiny CLI. Bundled
// with esbuild and compiled into a standalone Node SEA binary (helper/build-helper.sh) so
// the shipped .app patches Claude with NO system Node. Commands mirror what patch.sh used
// to call via npx:
//   extract <archive.asar> <destDir>
//   pack    <srcDir> <out.asar> [unpackGlob]
//   fuses   <App.app> <FuseName>=<on|off> ...
const asar = require('@electron/asar');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const fs = require('fs');
const path = require('path');

function appExecutable(appPath) {
  const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8');
  const m = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
  return path.join(appPath, 'Contents', 'MacOS', m ? m[1] : 'Claude');
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'extract':
      asar.extractAll(args[0], args[1]);
      break;
    case 'pack':
      await asar.createPackageWithOptions(args[0], args[1], args[2] ? { unpack: args[2] } : {});
      break;
    case 'fuses': {
      const exe = appExecutable(args[0]);
      const config = { version: FuseVersion.V1, resetAdHocDarwinSignature: false };
      for (const kv of args.slice(1)) {
        const [k, v] = kv.split('=');
        if (!(k in FuseV1Options)) throw new Error('unknown fuse: ' + k);
        config[FuseV1Options[k]] = v === 'on' || v === '1' || v === 'true';
      }
      await flipFuses(exe, config);
      break;
    }
    default:
      console.error('usage: extract <asar> <dir> | pack <dir> <asar> [unpack] | fuses <app> KEY=on|off');
      process.exit(2);
  }
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
