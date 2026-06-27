'use strict';
// engine/index.js — DOM-free public API for the direction & isolation decision engine.
// PURE: no document/window anywhere in engine/. The build step (P1) inlines these
// function bodies into the renderer payload IIFE; node --test require()s this module.

const ranges = require('./ranges.js');
const numbers = require('./numbers.js');
const detect = require('./detect.js');
const math = require('./math.js');
const arrows = require('./arrows.js');
const relations = require('./relations.js');
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
  signedNumberRuns: numbers.signedNumberRuns,
  // §3.2 detection
  firstStrong: detect.firstStrong,
  majority: detect.majority,
  stripLeadingNoise: detect.stripLeadingNoise,
  detectBlockDir: detect.detectBlockDir,
  cellDir: detect.cellDir,
  tableDir: detect.tableDir,
  columnDirs: detect.columnDirs,
  plaintextOverrideDir: detect.plaintextOverrideDir,
  resolvedDir: detect.resolvedDir,
  // §3.5 math vs currency
  segmentMath: math.segmentMath,
  // §8.F arrow mirroring
  isMirrorArrow: arrows.isMirrorArrow,
  hasMirrorArrow: arrows.hasMirrorArrow,
  arrowFlipOffsets: arrows.arrowFlipOffsets,
  // §8.F math-relation mirroring (UBA mirrors these AND reorders operands; we isolate the
  // whole comparison expression LTR so glyphs stay upright and operands keep reading order)
  isMirroredMathRel: relations.isMirroredMathRel,
  hasMirroredMathRel: relations.hasMirroredMathRel,
  relationRuns: relations.relationRuns,
  // §8.D code-fence-vs-prose
  looksLikeCode: code.looksLikeCode,
  codeBlockIsProse: code.codeBlockIsProse,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
