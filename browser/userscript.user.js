// ==UserScript==
// @name         Claude RTL
// @namespace    https://github.com/liorshaya/claude-desktop-rtl
// @version      0.2.16
// @description  Smooth RTL (Hebrew/Arabic/Persian) for claude.ai — same pure engine as the desktop patch.
// @author       Lior Shaya
// @match        https://*.claude.ai/*
// @run-at       document-start
// @grant        GM_addStyle
// NOTE: no @noframes — the payload must also run inside the Artifacts iframe
//       (https://a.claude.ai/isolated-segment.html) so artifact content gets RTL too (§6, §12).
// ==/UserScript==
//
// This is the SOURCE template. Run `node build/build-payload.js` to generate the
// installable script at dist/claude-rtl.user.js (the placeholder below is replaced with
// the inlined engine + DOM payload). Install THAT file in Tampermonkey/Violentmonkey.
/*__PAYLOAD__*/
