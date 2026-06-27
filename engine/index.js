'use strict';
// engine/index.js — DOM-free public API for the direction & isolation decision engine.
// PURE: no document/window anywhere in engine/. The build step (P1) inlines these
// function bodies into the renderer payload IIFE; node --test require()s this module.

const ranges = require('./ranges.js');
const numbers = require('./numbers.js');
const detect = require('./detect.js');
const math = require('./math.js');
const arrows = require('./arrows.js');
const code = require('./code.js');

const api = {
  // §3.1 classification
  isStrongRTL: ranges.isStrongRTL,
  isStrongLTR: ranges.isStrongLTR,
  isRTLDigit: ranges.isRTLDigit,
  hasRTL: ranges.hasRTL,
  // §3.4 numbers
  isENDigit: numbers.isENDigit,
  isANDigit: numbers.isANDigit,
  isDigit: numbers.isDigit,
  digitScript: numbers.digitScript,
  leadingNumber: numbers.leadingNumber,
  // §3.2 detection
  firstStrong: detect.firstStrong,
  majority: detect.majority,
  stripLeadingNoise: detect.stripLeadingNoise,
  detectBlockDir: detect.detectBlockDir,
  cellDir: detect.cellDir,
  tableDir: detect.tableDir,
  // §3.5 math vs currency
  segmentMath: math.segmentMath,
  // §8.F arrow mirroring
  isMirrorArrow: arrows.isMirrorArrow,
  hasMirrorArrow: arrows.hasMirrorArrow,
  arrowFlipOffsets: arrows.arrowFlipOffsets,
  // §8.D code-fence-vs-prose
  looksLikeCode: code.looksLikeCode,
  codeBlockIsProse: code.codeBlockIsProse,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
