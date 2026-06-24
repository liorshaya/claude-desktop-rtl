// ==UserScript==
// @name         Claude RTL
// @namespace    https://github.com/liorshaya/claude-desktop-rtl
// @version      0.1.0
// @description  Smooth RTL (Hebrew/Arabic/Persian) for claude.ai — same pure engine as the desktop patch.
// @author       Lior Shaya
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        GM_addStyle
// @noframes
// ==/UserScript==
//
// This is the SOURCE template. Run `node build/build-payload.js` to generate the
// installable script at dist/claude-rtl.user.js (the placeholder below is replaced with
// the inlined engine + DOM payload). Install THAT file in Tampermonkey/Violentmonkey.
/*__PAYLOAD__*/
