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

// "Strong" structural signals — natural-language prose virtually never has these. Kept
// SEPARATE from indentation: a column-aligned Hebrew "table" inside a ``` fence also indents
// (for its columns), so indentation ALONE must not count it as code (§8.D).
function hasCodeStructure(text) {
  return (
    CODE_KEYWORD.test(text) ||
    CODE_OPERATOR.test(text) ||
    CODE_BRACES.test(text) ||
    CODE_CALL.test(text) ||
    CODE_TAG.test(text)
  );
}

function looksLikeCode(text) {
  if (!text) return false;
  return hasCodeStructure(text) || CODE_INDENT.test(text);
}

// A fenced block is RTL prose iff it CONTAINS RTL text and has no STRONG code structure.
// Indentation ALONE does NOT disqualify it — that was wrongly keeping space-aligned Hebrew
// "tables" (the tea/coffee tables) as LTR code with un-flipped arrows. Real code in any
// language still has braces/keywords/operators/calls/tags; the hasRTL gate keeps English untouched.
function codeBlockIsProse(text) {
  return hasRTL(text) && !hasCodeStructure(text);
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { looksLikeCode, codeBlockIsProse };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
