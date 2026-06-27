# Claude RTL — Architecture (v2, build-it-all-yourself)

> Working title: **`claude-rtl`**.
> A community, open-source, **non-commercial** tool that adds *smooth* right-to-left
> (Hebrew / Arabic / Persian / Urdu + more) support to **Claude Desktop on macOS**,
> and from the same engine to **claude.ai in the browser**.
>
> **This version is the plan for building everything from scratch — engine included —
> and pushing edge-case handling further than any existing tool.** We build our own
> engine and aim to win on the hard cases.

Status: **design → v0.1 build**. Audience: the builder (you).

---

## 0. Scope decision that saves you months

**We do NOT reimplement the Unicode Bidirectional Algorithm (UAX #9).** Chromium
already runs a complete, correct UBA: given a base direction and isolation
boundaries, it reorders characters perfectly. Reimplementing it would be months of
work to match what's already in the renderer.

**What we build is a *direction & isolation decision engine*** that, for every piece
of content, answers three questions and nothing more:

1. **Base direction** of this block/paragraph → set `dir` / `unicode-bidi: plaintext`.
2. **Isolation boundaries**: which inline runs (code, math, URLs, opposite-script
   islands) must be isolated so neutrals don't leak across them → `unicode-bidi:
   isolate` / `dir="auto"` spans.
3. **Special domains**: is this `$...$` math or currency? Is this table column RTL?

That is the entire problem space every RTL tool actually lives in. Building it from
scratch is reasonable, lets you own every decision, and is where we earn the word
**"smooth."** The browser does the reordering; we do the *intelligence*.

---

## 1. Goals & non-goals

### Goals
1. **Best-in-class bidi decisions** — beat existing tools on mixed Hebrew/Arabic +
   English + code + math + numbers + tables, *and* on the extreme edge cases in §8.
2. **Desktop-first** (Claude Desktop + Cowork). The browser is well served; we cover
   it as a bonus from the same engine.
3. **Safe by construction**: never modify the original `/Applications/Claude.app`.
4. **Survives Claude updates automatically** (the killer feature no desktop tool has).
5. **Zero data, zero network, zero telemetry. Copy/search fidelity preserved** (no
   injected invisible Unicode marks — ever).
6. **Pure, unit-tested engine core** decoupled from DOM and from delivery.

### Non-goals (v1)
- Reimplementing UAX #9 (see §0).
- Full UI **mirroring** (sidebar/buttons/icon flip). We do *content* direction. The
  one exception: force the Chromium **window-chrome** direction to LTR so the native
  peek/preview window and title-bar controls don't jump on RTL OS locales (§9).
- Monetization. Windows/Linux. Vertical (top-to-bottom) scripts (CJK).
- Injecting LRM/RLM/embedding control characters into Claude's text.

---

## 2. Module architecture

```
claude-rtl/
├── engine/
│   ├── ranges.js         # Unicode strong-RTL ranges + classify (pure, astral-safe)
│   ├── detect.js         # firstStrong / stripLeadingNoise / majority / cellDir
│   ├── numbers.js        # EN vs AN digit handling, signs, separators
│   ├── math.js           # currency-aware LaTeX segmentation
│   ├── index.js          # public API; DOM-FREE; exports the decision functions
│   └── __tests__/        # node:test unit tests (the torture corpus, automated)
├── dom/
│   ├── apply.css         # the CSS layer (does ~85% of the work, declaratively)
│   ├── apply.js          # thin: input/edit boxes, dir tagging, scoped observer,
│   │                     #       island isolation, streaming-settle
│   └── surfaces.js       # selectors + per-surface rules (chat, edit-box, table,
│                         #       code, math, artifacts iframe)
├── build/
│   └── build-payload.*   # inline engine+dom into one IIFE string for injection
├── desktop/
│   ├── patch.sh          # copy → inject → fuses → ad-hoc sign (entitlements!) → icon
│   ├── watch.sh          # the re-patch routine the LaunchAgent calls
│   ├── agent.plist       # launchd LaunchAgent (WatchPaths)
│   ├── preflight.sh      # node/npx shim, file-lock, writability, version checks
│   └── verify.sh         # signature/checksum verification of the payload+script
├── browser/
│   ├── userscript.user.js  # Tampermonkey/Violentmonkey (engine+dom)
│   └── style.user.css      # Stylus (CSS-only subset)
└── test/corpus/          # the bidi torture corpus (shared by unit + visual tests)
```

**Layering rule:** `engine/` is **pure** (no `document`, no `window`) so it's
unit-testable and reusable in every shell. `dom/` is the only place that touches the
DOM. `desktop/` and `browser/` are thin shells that inject `build/`'s output.

---

## 3. The engine — design from scratch

### 3.1 Strong-RTL classification (`engine/ranges.js`)
Classify a **code point** (via `codePointAt`, not UTF-16 code units, so astral blocks
work). Cover the full living + historic RTL set:

| Block(s) | Script |
|---|---|
| `0590–05FF` | Hebrew |
| `0600–06FF`, `0750–077F`, `08A0–08FF`, `0870–089F` | Arabic + Supplement + Extended-A/B |
| `0700–074F`, `0860–086F` | Syriac + Supplement |
| `0780–07BF` | Thaana |
| `07C0–07FF` | NKo |
| `0800–083F`, `0840–085F` | Samaritan, Mandaic |
| `FB1D–FB4F` | Hebrew presentation forms |
| `FB50–FDFF`, `FE70–FEFF` | Arabic presentation forms A/B |
| `10800–1085F`, `10A00–10A5F`, `1E800–1E8DF`, `1E900–1E95F`, `1EE00–1EEFF` | Imperial Aramaic, Kharoshthi, Mende, **Adlam (astral)**, Arabic Math Alphabetic |

Also classify **digit type** (needed by §3.4): European `0030–0039` (EN, weak-LTR),
Arabic-Indic `0660–0669` (AN), Extended Arabic-Indic / Persian `06F0–06F9` (AN).

Provide: `isStrongRTL(cp)`, `isStrongLTR(cp)`, `isRTLDigit(cp)`, `hasRTL(str)`.

### 3.2 Base-direction detection (`engine/detect.js`)
A **layered** strategy — pick per context, never a blind `return 'rtl'`:

```
detectBlockDir(text):
    clean = stripLeadingNoise(text)        # leading URL / path / `code` / number / emoji / bullet
    d = firstStrong(clean)                 # UBA P2/P3
    if d != null: return d
    # no strong char after stripping → look at the raw whole-string majority
    return majority(text)                  # counts strong RTL vs LTR; null on tie/none

firstStrong(text):  first strong-RTL → 'rtl'; first strong-LTR → 'ltr'; else null
majority(text):     more RTL strong chars → 'rtl'; more LTR → 'ltr'; else null
```

**Why both first-strong AND majority:** first-strong matches UBA and user intuition
("text reads in the direction of its first word"), but it mis-fires when an RTL
paragraph opens with a brand/number/technical term. `stripLeadingNoise` fixes the
*common* opener cases; `majority` is the safety net for the rest. **The fallback is
always `null` (= leave inherited/default), never a forced `'rtl'`.** This is the
single biggest correctness fix over naive first-strong-only tools.

**How the decision is applied — the rule that kills the "English-doc-forced-RTL" bug
(see §8.K):** for **prose blocks we almost never write a `dir` attribute from JS.**
CSS `unicode-bidi: plaintext` on each leaf block (§4) is the *primary* base-direction
mechanism — it runs the browser's own first-strong per block, on that block's own
content, **immune to any ancestor's `direction`**. So a pure-English paragraph stays
LTR even when the surrounding document/message contains Hebrew elsewhere, and a Hebrew
paragraph flips RTL even inside an English doc. JS writes an explicit `dir` **only**
where CSS cannot express the result: `dir="rtl"` on a `<table>` to flip column order
(§3.2), `dir="auto"` on input/edit boxes and JS-created islands (§3.6), and — the **one
prose exception** — `dir="rtl"` on a heading/paragraph in the narrow case CSS `plaintext`
provably **misfires**: a Hebrew block that OPENS with Latin (a section marker `8c. בדיקה…`,
a brand `React הוא ספרייה`) where first-strong is LTR yet the block is majority-RTL
(`plaintextOverrideDir`, below). That override is **safe by construction for §8.K** — a
majority-English block returns `null`, so English is never flipped. **We never
set `dir` on a container / message-root because "it contains RTL"** — that one mistake
is what flips an entire English document RTL in every existing tool. The detectors
(`resolvedDir` for decoration side + arrow gating, `tableDir`/`cellDir`/`columnDirs` for
tables, `plaintextOverrideDir` for the prose override) exist to *decide where the engine
acts*, not to stamp every paragraph. *(`detectBlockDir` is the legacy first-strong-with-
leading-strip detector; it over-strips English openers, so the DOM now uses `resolvedDir`,
which matches the actual `plaintext` render. `detectBlockDir` stays a pure engine utility.)*

**Context-specific detectors:**
- **Table cell** (`cellDir`): a cell is RTL if it *contains any* RTL char (header
  labels like "ID"/"blob" often start Latin yet belong to a Hebrew column). Neutral
  cells (digits/punct only) → `null`.
- **Tables — two independent layers** (the bidi-table consensus: column *order* and cell
  *direction* are separate decisions, never conflated; W3C/MDN/Apple/Wikipedia all agree).
  - **Layer 1 — column ORDER** (`tableDir`, written as `dir` on the `<table>`): follows the
    **majority content direction across every cell**. A majority-Hebrew table reads RTL
    (first column on the **right**) *even when its key/header column is English* — the case
    the screenshots catch. A tie or all-neutral table is broken by the header row; still
    tied → `null` (stay LTR, write no `dir`). *(Changed from the old `header[0]`-decides
    policy, which wrongly kept a mostly-Hebrew table LTR because its key column was English.)*
  - **Layer 2a — per-cell INTERNAL order**: every `<td>/<th>` self-determines its base
    direction from its **own** content via `unicode-bidi: plaintext` (CSS, §4) — so numbers,
    currency, and mixed runs (`natural או washed`) order correctly and are never forced to
    the table's direction. This is the same per-leaf-block mechanism as prose (§8.K).
  - **Layer 2b — per-column ALIGNMENT** (`columnDirs`): each column hugs the edge of its
    **majority** content language — Hebrew columns right, English/number columns left — for
    **clean columns** regardless of column order. The DOM stamps each cell `data-rtl-col`
    and CSS keys `text-align` off it (§5). This is *alignment only*; it sets no `dir`/
    `direction` on a cell (Layer 2a owns ordering), so the §3.2/§8.K "JS never forces prose
    direction" rule holds — the one `dir` JS writes on a table is still the Layer-1 `<table>`
    flip. *(Alternative considered: per-cell natural alignment — rejected because a mixed
    cell inside a column would zig-zag; per-column keeps columns clean. r12a's homogeneity
    allowance.)*
- **Prose plaintext-override** (`plaintextOverrideDir`): the one place JS sets `dir` on a
  heading/paragraph. CSS `plaintext` runs pure UBA first-strong, which misfires when a
  Hebrew block OPENS with Latin — a marker (`8c. בדיקת…`) or brand/term (`React הוא ספרייה`):
  first-strong is the Latin char → LTR, wrong. The override fires *only* when first-strong is
  LTR **and** `majority` is RTL → `dir="rtl"`; otherwise `null` and CSS keeps owning it. The
  **majority** test is the safe discriminator: an English sentence with embedded Hebrew (`The
  term שלום means peace`) is majority-LTR → `null`, so English is never flipped (§8.K). Pure-
  digit markers (`3.2.1 …`) need no help — UBA skips digits, so first-strong is already RTL.
  *(Lior-approved relaxation of "never set `dir` on prose"; cf. the matching CLAUDE.md rule.)*

### 3.3 Streaming-settle (anti-flicker) — *beyond existing tools*
During streaming a paragraph may start `"In React…"` (first-strong LTR) and end up
majority Hebrew. Re-deciding every token causes a visible **direction flip**. Rule:

- While a block is still being appended (it's the last child and the stream is
  active), **defer** the final direction decision; apply a *provisional* `dir="auto"`
  (cheap, browser-native) and only run the heavier majority/island pass when the
  block **settles** (no mutations for ~250ms, or a new sibling block appears, or the
  stream-done signal fires).
- Never let a settled block's direction change retroactively unless its text content
  truly changed.

### 3.4 Numbers — *the part everyone gets subtly wrong* (`engine/numbers.js`)
Numbers are weak characters and produce the most "looks slightly off" bugs:
- **Digit script**: Hebrew uses EN digits; Arabic/Persian may use EN, Arabic-Indic
  (AN), or Eastern (AN). AN vs EN have different bidi classes and order differently
  next to RTL text. Detect and don't "fix" what the UBA already orders correctly —
  the goal is to not *break* it by over-setting `dir`.
- **Signs & ranges**: `-5`, `+5`, `±5`, `5–10`, `5%`, `%50` (Arabic), `5°`.
- **Separators / locale**: `1,234.56` vs `1.234,56`; phone/version/IP/date strings.
- **Decision**: treat a *number-led* RTL paragraph via `stripLeadingNoise` (so the
  number doesn't force LTR base), but **do not wrap or isolate bare numbers** inside
  RTL prose — `unicode-bidi: plaintext` already orders them. Isolation of numbers is
  only needed inside an *LTR* technical island (e.g., a version range in a code-ish
  run), handled by §3.6.

### 3.5 Math vs currency (`engine/math.js`) — *adopt the good idea, build it cleanly*
`$...$` is ambiguous. Segment text into `text` / `math` runs:
- **Unambiguous delimiters always math**: `$$…$$`, `\[…\]`, `\(…\)`.
- **Single `$…$` is math only with a real LaTeX signal** inside it: a backslash
  command, `^`/`_`/`{`/`}`, or a known macro (`frac|sqrt|sum|int|alpha|…`).
  Otherwise it's **currency** (`$5.99`, `$5 to $10`) and stays text. *This matters
  doubly for Hebrew/Arabic financial text.*
- Math runs → `direction: ltr; unicode-bidi: isolate`. Detect KaTeX/MathJax/MathML
  rendered nodes too (`.katex`, `mjx-container`, `math`) and isolate them.
- **Also guard**: `₪`, `€`, `£`, `¥`, `%`, and trailing-symbol locales (`5₪`, `50%`).

### 3.6 Inline island isolation — *the "hard part" most tools skip, done right*
Block-level `plaintext` fixes base direction, but an English run inside a Hebrew
sentence still mis-places the **neutral that follows it** (the classic "period jumps
to the wrong side"). Strategy, escalating only as needed:

1. Lean on `unicode-bidi: isolate` for the elements Claude already wraps (code,
   links, math). Cheap, no mutation. Covers most real cases.
2. For **bare** opposite-direction runs in plain text (an English phrase with no
   wrapping element, followed by Hebrew punctuation), do a **minimal, idempotent**
   JS pass that wraps the run in `<span dir="auto">` (markup isolation, the `<bdi>`
   equivalent). Gate it behind a flag; only enable where the corpus proves it's
   needed. **Nesting** must work (Hebrew › English › Hebrew) — isolation spans nest
   like UBA isolates.
3. Stamp processed nodes (`data-rtl-done`) so observer re-runs are O(new nodes), and
   never double-wrap.

> **Hard rule:** islands are created with `dir`/CSS only. **Never** insert `U+200E/F`
> or embedding controls — they corrupt copy-paste and break Ctrl-F over model output.

### 3.7 Purity & tests
`engine/index.js` is DOM-free and `module.exports`-guarded. The build step inlines
its function bodies into the payload IIFE. `engine/__tests__/` runs the torture
corpus (§13) against the pure functions with `node:test` — so most edge cases are
caught *without a browser*.

---

## 4. The CSS layer (`dom/apply.css`)

CSS does the bulk, declaratively, and applies to streamed nodes the instant they
exist. Apply at the **leaf-block** level — `unicode-bidi` does **not inherit**, so it
must sit on the actual `<p>`/`<li>`/etc., not a container.

```css
/* Per-paragraph base direction via UBA first-strong, logical alignment. */
:where(.prose) p, :where(.prose) li, :where(.prose) h1, :where(.prose) h2,
:where(.prose) h3, :where(.prose) h4, :where(.prose) h5, :where(.prose) h6,
:where(.prose) blockquote, :where(.prose) td, :where(.prose) th,
:where(.prose) dt, :where(.prose) dd, :where(.prose) figcaption, :where(.prose) caption {
  unicode-bidi: plaintext;
  text-align: start;
}
/* Code & math NEVER reorder; isolate so neighbours can't bleed in. */
pre, .code-block__code            { direction: ltr; unicode-bidi: isolate; text-align: left; }
code                              { direction: ltr; unicode-bidi: isolate; }
.katex, .katex-display, mjx-container, math { direction: ltr; unicode-bidi: isolate; }
/* Islands wrapped by JS (§3.6). */
[data-rtl-island]                 { unicode-bidi: isolate; }
/* Explicit dir attributes win; tables flip column order. */
[dir="rtl"]                       { direction: rtl; }
[dir="ltr"]                       { direction: ltr; }
table[dir="rtl"]                  { direction: rtl; }
/* Long unbreakable LTR tokens (URLs) inside RTL must not overflow the bubble. */
:where(.prose) p, :where(.prose) li { overflow-wrap: anywhere; }
```

Notes: use `:where()` to keep specificity low (Claude's own styles win ties unless we
intend otherwise); avoid blanket `!important` except where Claude hard-sets
`direction`/`text-align` inline — prefer the narrowest override.

---

## 5. DOM application layer (`dom/apply.js`)

Thin. Responsibilities only where CSS can't decide:
- Set `dir="auto"` on the **composer** *and the **message-edit** box* (don't forget
  the edit textarea — a surface ports missed); re-assert on `input` (React strips it).
- Inject `apply.css` once.
- A **scoped, debounced `MutationObserver`** that, per newly-streamed message root,
  runs table detection (§3.2), math segmentation (§3.5), and island isolation (§3.6),
  and tags processed nodes — capped, idempotent (`data-rtl-done`), streaming-settle
  aware (§3.3). **It does NOT stamp `dir` on prose blocks** — CSS `plaintext` owns
  per-paragraph direction (§3.2), so the container/document is never globally flipped.
  This is far lighter than the prior-art per-token full-DOM re-walk.
- Bail immediately if `typeof document === 'undefined'` (safe to prepend to any
  renderer bundle, incl. non-DOM contexts).

---

## 6. Surface coverage matrix

| Surface | Render | Plan |
|---|---|---|
| Chat composer | contenteditable | `dir="auto"` + re-assert |
| **Edit-message box** | textarea/CE | `dir="auto"` (commonly forgotten) |
| Streamed responses | markdown→DOM, incremental | CSS + scoped observer + settle |
| Code blocks / inline code | `pre`/`.code-block__code`/`code` | force LTR + isolate |
| **Math** | KaTeX/MathJax/MathML | currency-guard + isolate LTR |
| Lists (nested) | `ul/ol/li` | per-`li` dir; flip padding side; nesting |
| Tables | `table/td/th` | majority column-order + per-column align + per-cell plaintext (§3.2) |
| Blockquotes / headings | `blockquote/h1..h6` | leaf-block rules |
| **Artifacts preview** | sandboxed `<iframe>`, strict CSP | inject into iframe doc; honor CSP (§12) |
| **Cowork** outputs | rendered docs/results | same engine — a key differentiator |
| Window chrome (peek/title bar) | native Chromium | `force-ui-direction=ltr` in main (§9) |

---

## 7. Desktop patching pipeline (`desktop/patch.sh`)

Copy model — never touch the original:
1. `cp -R /Applications/Claude.app  ~/Applications/Claude-RTL.app` (idempotent).
2. Swap icon (RTL badge); set `CFBundleDisplayName=Claude-RTL`; **don't** touch
   `CFBundleName` (fuse lookup reads it).
3. `npx @electron/asar extract` the copy's `app.asar`.
4. Read `package.json` `"main"`. **Prepend** the built payload to every renderer JS
   under `.vite/build/` **except the main entry**. Into the **main entry** prepend
   ONLY the tiny `force-ui-direction` switch (§9) — never the full payload (→ black
   screen). Skip files already containing our marker (idempotent).
5. `npx @electron/asar pack` (keep `*.node`/`spawn-helper` unpacked).
6. `npx @electron/fuses write --app … EnableEmbeddedAsarIntegrityValidation=off`.
7. **Ad-hoc re-sign, preserving entitlements:** extract entitlements from the
   original, strip the three team-id-coupled keys (`com.apple.application-identifier`,
   `com.apple.developer.team-identifier`, `keychain-access-groups`), then
   `codesign --force --deep --sign - --entitlements ent.plist`. Preserving
   `com.apple.security.virtualization` keeps **Cowork** working (a known re-sign pitfall).

CLI: `--install --uninstall --status --watch --unwatch --font NAME`.
Document the one-time keychain re-auth + possible blank first window (quit & reopen).

---

## 8. EXTREME edge-case taxonomy (the centerpiece)

For each: the failure, and our handling. "Smooth" means these all Just Work.

### A. Mixed direction & neutrals
- **Trailing punctuation after an LTR island in RTL** (`…Next.js.` period on wrong
  side) → island isolation (§3.6) pulls the period to the correct end.
- **Neutrals *between* two same-direction runs** (comma between two Hebrew words in an
  LTR list) → per-block `plaintext` + isolating the LTR list context.
- **Nested embedding** (Hebrew › "he said 'שלום' loudly" › Hebrew) → nested isolation
  spans; verify ≥3 levels.
- **Leading neutral/number/emoji** before strong char (`→ עברית`, `✅ משימה`,
  `1. סעיף`) → `stripLeadingNoise` ignores it for base-direction.

### B. Numbers (§3.4)
- Number-led RTL paragraph (`2,200 ₪ זה המחיר`) → strip leading number; base = RTL.
- AN vs EN digits in Arabic; signs `-/+/±`; ranges `5–10`; `5%` vs `%50`; dates,
  versions (`v4.6`), IPs, phone numbers → don't over-set `dir`; let UBA order; only
  isolate inside LTR technical islands.
- **Currency symbols** trailing/leading (`5₪`, `₪5`, `$5`, `5$`) → not math (§3.5);
  ordered by `plaintext`.

### C. Math (§3.5)
- `$5.99` / `$5 to $10` currency → stays text. `$\frac{a}{b}$` → math, isolated LTR.
- Inline math mid-Hebrew-sentence; display math block; rendered KaTeX/MathJax nodes.
- A `$` that opens but never closes mid-stream → don't treat partial as math until
  settle.

### D. Code & technical strings
- Code block with **Hebrew comments/strings** → block stays LTR (simplest, safe);
  *do not* try to RTL inner comments in v1 (rabbit hole; document the tradeoff). **But**
  a fence Claude mis-used for a Hebrew "table"/prose (no code structure) reads RTL:
  `engine/code.js` `codeBlockIsProse` = `hasRTL && !looksLikeCode` (conservative — any
  brace/keyword/indent/call/operator/tag → treated as code), and the DOM tags such a
  block `data-rtl-text` for a per-line `plaintext` CSS rule. Real code is never touched.
- Inline `code` with Hebrew; **file paths** with Hebrew folders (`/Users/דני/`);
  **URLs** with Hebrew or percent-encoding inside RTL prose → isolate the code/link
  element so delimiters (`/ . : @ [ ]`) don't scramble.
- Markdown link `[טקסט](https://…)` → label RTL, URL isolated LTR.
- Mixed-script **single token** (`שלוםworld`, `iPhone15ב`) → first-strong on the
  token; accept UBA ordering; no mid-token splitting.

### E. Combining marks & shaping
- Hebrew **niqqud/te'amim** (NSM marks) and Arabic **harakat/shadda/sukun**, **tatweel
  `U+0640`** (neutral stretch) → must not break detection (skip NSM as
  direction-neutral; base letter carries direction) or rendering.
- **Final forms** (Hebrew ך ם ן ף ץ; Arabic positional shaping) → font/HarfBuzz job;
  detection already covers the base + presentation-form ranges.
- Decomposed vs precomposed (shin+dot) → operate on code points; either form classifies.

### F. Emoji & symbols
- Emoji between scripts, **ZWJ sequences**, skin-tone modifiers, **flag emoji**
  (regional-indicator pairs) → treat as neutral for base-direction; never split a
  grapheme cluster; ensure stripping leading emoji doesn't consume a following strong
  char's cluster.
- Brackets that **mirror** in RTL (`()[]{}<>`) → leave to UBA mirroring; don't fight it.
  Canonical bracket pairs (UAX#9 BD16) resolve together.
- **Arrows** (`→ ← ⇒ ⟶ ➜ …`) are NOT bidi-mirrored by UBA, so they point the wrong way
  in RTL. `engine/arrows.js` `isMirrorArrow` classifies them; inside an RTL block the DOM
  wraps each in `<span data-rtl-arrow>` and CSS flips it with `transform: scaleX(-1)` —
  **visual only**, the code point is untouched so copy/Ctrl-F stay byte-for-byte (§3.6).
  **Math/code arrows are the exception — they stay LTR.** An arrow inside a function or
  mapping (`a → b`, `f: X → Y`, `a ⟹ b`) is universal LTR notation that reads
  left-to-right even in a Hebrew sentence, and the math/code island is already
  LTR-isolated, so flipping it would *reverse the meaning*. Two cooperating guards: the
  DOM's `inLtrIsland` skips arrows inside **rendered** KaTeX/MathJax/MathML/code nodes,
  and `engine/arrows.js` `arrowFlipOffsets` (via `segmentMath`, §3.5) excludes arrows
  inside a **raw** `$…$`/`\(…\)`/`\[…\]`/`$$…$$` run. Currency `$…$` is *not* math, so an
  arrow beside a price still flips. A mis-fenced Hebrew-prose ``` block (`data-rtl-text`,
  §8.D) is prose, so its arrows still flip.

### G. Markdown structures
- Nested blockquotes with per-level direction; task lists (`- [ ] משימה`); definition
  lists; footnotes; headings with anchors.
- **Tables**: mixed header vs cell direction (§3.2); cells containing code/math/links;
  alignment markers; right-aligning RTL columns without breaking LTR ones.

### H. Streaming (§3.3)
- Direction flip mid-stream → provisional `dir="auto"`, settle before heavy pass.
- Astral char / ZWJ sequence split across stream chunks → operate on settled text;
  guard `codePointAt` against lone surrogates.
- Unclosed code fence / math delimiter mid-stream → treat as prose until closed/settled.

### I. Environment & platform
- **macOS Hebrew/Arabic OS locale** flips Chromium UI → `force-ui-direction=ltr` in
  main process (§9). Also affects scrollbar side / peek window.
- **Artifacts iframe** with its own CSP and possibly user-authored `dir` → inject into
  the iframe document; respect existing explicit `dir`; embed any font as `data:` URI.
- RTL paragraph with a giant unbreakable URL → `overflow-wrap: anywhere` so it
  doesn't blow out the bubble.

### J. Fidelity & a11y
- **Copy/paste & Ctrl-F** must return the original text → no injected control chars
  (hard rule). Double-click word-select and caret behavior in RTL → `dir="auto"`
  gives native-correct behavior.
- **Screen readers** read logical order (correct); `dir` attributes improve it. Never
  use `bidi-override` (it harms a11y and reorders against logic).

### K. Document / container base direction — *the one the screenshots catch*
- **A predominantly-English document with embedded Hebrew** (e.g. this very
  ARCHITECTURE.md opened in Claude) must keep **English blocks LTR**, flip **only the
  Hebrew blocks**, and **never flip the whole document/message container.** The
  failure every existing tool shows: the container (or too many blocks) gets
  `dir="rtl"` because "the message contains Hebrew somewhere," dragging all the English
  prose RTL — sentence-final periods jump left, and numbered/bulleted markers move to
  the right edge.
- **The reverse** (a mostly-Hebrew doc with English blocks) must keep those English
  blocks LTR — same mechanism, no special-casing.
- **Latin-opener of a Hebrew block** (`8c. בדיקת אי-שוויונים…`, `React הוא ספרייה`,
  `v2.0 שחרור`): CSS `plaintext` first-strong latches on the leading Latin char and renders
  the block **LTR**, even though it is a Hebrew heading/paragraph (Gemini gets this right;
  naive plaintext does not). Fixed by `plaintextOverrideDir` (§3.2): first-strong LTR **and**
  majority RTL → `dir="rtl"`. The majority gate keeps it **§8.K-safe** — an English sentence
  that merely *contains* Hebrew (`The term שלום means peace`) is majority-LTR → not flipped.
- **Our guarantee:** per-leaf-block `unicode-bidi: plaintext` makes every block
  self-determine from its *own* content, immune to ancestors; JS writes `dir` on a prose
  block only in the narrow majority-RTL plaintext-misfire case above, never on the container
  (§3.2, §5). Mixed-direction documents therefore render block-by-block correctly with **no
  global flip.** This is a front-and-centre corpus case (§13): a long English doc with
  scattered Hebrew examples → assert every English block stays LTR and only the Hebrew ones flip.

---

## 9. Window-chrome LTR (preview/peek fix)

On RTL OS locales, Chromium flips the *entire native UI* (peek window jumps far-left,
title-bar controls move). Fix: inject **only** this into the main-process entry,
before app init:

```js
// main entry, top, before app is ready:
try { app.commandLine.appendSwitch('force-ui-direction', 'ltr'); } catch (e) {}
```

This is the *only* thing we put in the main process; the RTL payload itself goes only
into renderer bundles (main-process injection of the payload → black-screen launch).

---

## 10. Auto-reapply watcher (the differentiator)

User-level **launchd LaunchAgent** in `~/Library/LaunchAgents/`, `WatchPaths` on the
original bundle, running an idempotent re-patch:

```xml
<key>WatchPaths</key>
<array>
  <string>/Applications/Claude.app/Contents/Info.plist</string>
  <string>/Applications/Claude.app/Contents/Resources/app.asar</string>
</array>
<key>ThrottleInterval</key><integer>30</integer>
```

Claude (Electron) updates via **Squirrel.Mac**: on quit, a `ShipIt` helper swaps the
bundle in `/Applications`. So the watcher script must:
1. Read original `CFBundleShortVersionString`; compare to a stamp by the patched copy.
2. If changed: **wait for the update to settle** — no `ShipIt` process running AND
   `app.asar` mtime stable for a few seconds (avoid patching mid-swap; `WatchPaths` is
   flaky while the path is transiently replaced).
3. Rebuild the patched copy; update the stamp; optional notification.

Opt-in (`--watch`), user-scope (no root), transparent (visible in `~/Library/
LaunchAgents`), trivially removable (`--unwatch`). Also auto-heals the "an update
broke RTL" regression class.

---

## 11. Trust: signed payload + preflights

The `curl … | bash` install pattern is dangerous (runs whatever `main` says at run
time). Mitigate it on macOS as follows:
- **Sign the payload + `patch.sh`** with an offline key; ship a detached signature and
  a SHA-256. `verify.sh` checks both before anything runs. Prefer `minisign`/`signify`
  (simple, offline) and/or a **notarized packaged installer**. Pin the public key in
  the repo.
- **Preflights** (`preflight.sh`), each from a real failure mode:
  - `npx` shadowed by an **nvm/fnm/volta shim** → fall back to system Node; emit
    "Node too old" (not "install Node") when the version is the real problem.
  - **File-lock / writability** probe on `~/Applications` before copying.
  - Verify the expected ASAR layout (`.vite/build/`, `package.json` `"main"`); if
    Claude restructured it, **die with a specific error** naming the missing path —
    never silently produce a broken app.

---

## 12. Browser shell (bonus, same engine)

Reuse `engine/` + `dom/` verbatim in a Tampermonkey/Violentmonkey userscript and a
Stylus CSS-only style for `claude.ai`. Crowded space, low extra cost. **CSP reality:**
main window ≈ `font-src 'self' data:`, `connect-src 'none'`; artifact sandbox
`font-src data:`. So any optional font must be a base64 `data:` URI, and no external
calls work — which matches our zero-network stance perfectly.

---

## 13. Testing — the torture corpus

Two layers: (a) **unit tests** on the pure `engine/` (fast, no browser), (b) **visual**
checks in a real Claude conversation after every change and after every Claude update.

The corpus (`test/corpus/`) — each is a known-correct expectation:
- Pure Hebrew; pure Arabic; pure Persian (Eastern digits); pure English.
- **Mixed-direction document** (§8.K): a long *English* doc with scattered Hebrew
  examples → every English block stays LTR, only Hebrew blocks flip, container never
  flips. And the reverse (Hebrew doc + English blocks). *This is the screenshot case.*
- RTL sentence opening with: English word / number / URL / file path / `inline code` /
  emoji / bullet.
- `אני בונה עם Next.js ו-TypeScript.` (issue #38005) — period lands left, fragments placed.
- Trailing `?`/`!`/`.` after a mixed run; neutrals between same-dir runs.
- Numbers: `2,200 ₪`, `גרסה v4.6`, `5–10%`, Arabic-Indic digits, signed numbers.
- Currency vs math: `$5.99`, `$5 to $10`, `$\frac{a}{b}$`, `$$…$$`, inline KaTeX.
- File paths / URLs / markdown links inside RTL prose.
- Parenthesised mixed (`השתמש ב-(isolate)`); mirrored brackets/arrows.
- Nested lists / nested blockquotes with mixed items.
- Tables: Hebrew row-labels + English column headers; mixed cells; code-in-cell.
- Combining marks: niqqud, harakat, tatweel; final forms; ZWJ emoji; flags.
- Streamed long answer: assert no flip, no flicker, no reflow jank.
- Astral: Adlam-only line.
- Fidelity: copy a mixed paragraph → bytes equal original; Ctrl-F finds a term spanning a former island.

Automate everything that touches the **pure engine** (direction decisions, math
segmentation, table direction, number classification). Keep a screenshot gallery for
the visual ones.

---

## 14. Build roadmap (solo, phased)

- **P0 — Engine core.** `ranges.js` + `detect.js` + `numbers.js` + `math.js` +
  unit tests green on the corpus. *No DOM yet.* This is the heart; get it right first.
- **P1 — CSS + DOM layer.** `apply.css` + `apply.js` (input/edit boxes, scoped
  observer, settle, islands). Test in the browser against claude.ai first (fast loop,
  no signing).
- **P2 — Desktop pipeline.** `patch.sh` copy→inject→fuses→sign(+entitlements)→icon +
  the main-process `force-ui-direction`. Manual re-run.
- **P3 — Auto-reapply watcher.** launchd + ShipIt-aware re-patch. "Install & forget."
- **P4 — Trust + preflights.** signed payload + `verify.sh` + `preflight.sh`.
- **P5 — Browser shell + Cowork/artifacts coverage + Hebrew font pack.**
- **P6 — v1.0:** corpus gallery, bilingual (he/ar/en) README, contribution guide,
  "adopt a new Claude version" runbook.

Critical-path tip: P0→P1 in the **browser** gives you a working, testable RTL fix in
days without touching code-signing. Only after the engine feels smooth do you invest
in the desktop pipeline.

---

## 15. Known limits & open questions
1. **Real** code blocks stay LTR in v1 (deliberate — RTL scrambles syntax). A fence that
   is actually Hebrew prose/"table" now reads RTL (§8.D), but space-aligned monospace
   "tables" inside a fence still align imperfectly under RTL — Claude using a real
   markdown table is the clean path. Arrow glyphs render mirrored but the byte is kept.
2. How much **bare-island wrapping** (§3.6 step 2) the corpus truly needs before it's
   worth the mutation cost.
3. UI **mirroring**: stay content-only, or ever mirror chrome beyond the
   `force-ui-direction` switch?
4. Watcher default: opt-in only, or offer during `--install`?
5. Signing toolchain: `minisign`/`signify` detached sig vs a full **notarized**
   installer. (v1 ships ECDSA-P256 via the stock LibreSSL — no external dep.)
6. **Bundled Hebrew font** (§12) is deferred: no OFL font is vendored yet (zero-network,
   none on disk), and macOS already renders Hebrew via system fonts. The `@font-face`
   data: pipeline is the drop-in point when a font is added.
7. **Artifacts on the desktop**: the browser userscript reaches the artifact iframe
   (`@match *.claude.ai`, runs in frames), so HTML artifacts get RTL there. The desktop
   app loads that artifact in a CROSS-ORIGIN `a.claude.ai` iframe our renderer payload
   can't enter; full desktop-artifact coverage needs a main-process session preload
   (investigate post-v1 — risk of black-screen). Chat + rendered content are covered.
6. Naming, and whether to share the corpus/engine improvements with the wider
   community even while building your own.

---

## 16. References (informative)
- Unicode UAX #9 (rules P2/P3, isolates, BD16 bracket pairing).
- W3C *Additional Requirements for Bidi in HTML & CSS*; `dir="auto"` semantics.
- MDN `unicode-bidi` (does **not** inherit; `plaintext` / `isolate`).
- Anthropic issues: `claude-code` #38005 (Desktop/Cowork), #16814, #11050, #49521,
  #29811 (update regression).
- Electron `autoUpdater` / **Squirrel.Mac** + `ShipIt` bundle swap; `@electron/fuses`
  (`EnableEmbeddedAsarIntegrityValidation`).
- `man 5 launchd.plist` — `WatchPaths`, `ThrottleInterval`.
