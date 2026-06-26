'use strict';
// engine/code.js — tell a REAL code block apart from Hebrew/Arabic text that Claude
// merely wrapped in a ``` fence (§8.D). Real code stays LTR (RTL would scramble braces,
// indentation, operators — the §15.1 rabbit hole). A fenced block that is RTL prose with
// no code structure is treated as text and rendered RTL. Conservative: when unsure, it
// stays code (LTR). PURE.

const { hasRTL } = require('./ranges.js');

// Tokens/shapes that natural-language prose almost never contains but code does.
const CODE_KEYWORD = /\b(function|const|let|var|def|class|interface|enum|struct|import|export|from|require|module|package|namespace|using|include|return|if|else|elif|switch|case|for|while|do|try|catch|throw|public|private|protected|static|void|int|float|double|char|bool|boolean|string|print|println|printf|echo|console|SELECT|INSERT|UPDATE|DELETE|WHERE|JOIN)\b/;
const CODE_OPERATOR = /=>|->|::|==|!=|<=|>=|&&|\|\||\+\+|--|\/\/|\/\*/;
const CODE_BRACES = /[{};]/;
const CODE_CALL = /[A-Za-z_$][\w$]*\s*\(/; // identifier immediately followed by "("
const CODE_INDENT = /^[ \t]{2,}\S/m; // a line that begins with real indentation
const CODE_TAG = /<\/?[A-Za-z][\w-]*[\s/>]/; // HTML/XML/JSX tag

function looksLikeCode(text) {
  if (!text) return false;
  return (
    CODE_KEYWORD.test(text) ||
    CODE_OPERATOR.test(text) ||
    CODE_BRACES.test(text) ||
    CODE_CALL.test(text) ||
    CODE_INDENT.test(text) ||
    CODE_TAG.test(text)
  );
}

// A fenced block should be rendered as RTL prose iff it CONTAINS RTL text and shows no
// sign of being real code. The hasRTL gate means English / real code is never touched.
function codeBlockIsProse(text) {
  return hasRTL(text) && !looksLikeCode(text);
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { looksLikeCode, codeBlockIsProse };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
