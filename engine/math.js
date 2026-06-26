'use strict';
// engine/math.js — currency-aware LaTeX segmentation (§3.5). PURE.
// Splits text into {type:'text'|'math', value, start, end} runs. Concatenating the
// values reproduces the input byte-for-byte (fidelity — no injected controls).

// A single $…$ is math only with a real LaTeX signal: a backslash command (\frac, \cdot…)
// or sub/superscript/braces. Otherwise it is currency ($5.99, $5 to $10) and stays text.
function hasLatexSignal(s) {
  return /\\[A-Za-z]/.test(s) || /[\^_{}]/.test(s);
}

function segmentMath(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  let textStart = 0;

  const flushText = (end) => {
    if (end > textStart) {
      out.push({ type: 'text', value: text.slice(textStart, end), start: textStart, end });
    }
  };

  while (i < n) {
    let open = null;
    let close = null;
    if (text.startsWith('$$', i)) { open = '$$'; close = '$$'; }
    else if (text.startsWith('\\[', i)) { open = '\\['; close = '\\]'; }
    else if (text.startsWith('\\(', i)) { open = '\\('; close = '\\)'; }
    else if (text[i] === '$') { open = '$'; close = '$'; }

    if (open) {
      const innerStart = i + open.length;
      const closeIdx = text.indexOf(close, innerStart);
      if (closeIdx !== -1) {
        const inner = text.slice(innerStart, closeIdx);
        const end = closeIdx + close.length;
        // Unambiguous delimiters are always math; single $…$ needs a LaTeX signal.
        const isMath = open === '$' ? hasLatexSignal(inner) : true;
        if (isMath) {
          flushText(i);
          out.push({ type: 'math', value: text.slice(i, end), start: i, end });
          i = end;
          textStart = end;
          continue;
        }
        // Currency: leave this $ in the text run and keep scanning.
        i += 1;
        continue;
      }
      // Unclosed delimiter mid-stream → treat as prose until it settles (§3.3, §8.H).
      i += 1;
      continue;
    }
    i += 1;
  }

  flushText(n);
  return out;
}

// __EXPORTS__ (everything below is stripped when inlined into the browser payload)
const api = { segmentMath, hasLatexSignal };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
