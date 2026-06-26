# Runbook — adopt a new Claude version

Claude changes its DOM (class names, structure) every few releases. The **engine never
breaks** — only the **selectors** in [`dom/surfaces.js`](../dom/surfaces.js) and a few rules
in [`dom/apply.css`](../dom/apply.css) ever need re-pointing. This runbook shows exactly how,
using the same console diagnostics that built the current selectors.

## 0. Symptom → cause

| Symptom | Likely cause |
|---|---|
| Nothing is RTL at all | The payload isn't running, or `messageRoot` no longer matches |
| Text RTL but bullets/quote-bar on the wrong side | a decorated-block selector changed |
| Tables don't flip | the `<table>` / cell structure changed |
| Works in the browser but not the desktop app | desktop-only (see §4) |

## 1. Is the payload even running?

In the **browser** (claude.ai), open DevTools → Console (context **top**):

```js
({
  running: document.documentElement.getAttribute('data-claude-rtl'),  // "1" = yes
  styleOrSheet: !!document.getElementById('claude-rtl-style') || document.adoptedStyleSheets.length > 0,
  messageRoots: document.querySelectorAll('.standard-markdown, .font-claude-response, [data-testid="user-message"]').length
})
```

- `running: null` → the script isn't injecting (browser: check the userscript is enabled +
  “Allow User Scripts”; desktop: see §4).
- `messageRoots: 0` → **the root selector changed** — go to §2.

## 2. Re-point the message-root & leaf selectors

Right-click a Hebrew line in a Claude reply → **Inspect**, then in the Console:

```js
(() => {
  const el = $0;                         // the element you inspected
  const chain = [];
  let n = el;
  for (let i = 0; i < 8 && n; i++) {
    const cs = getComputedStyle(n);
    chain.push(n.tagName + ' .' + (n.className || '').slice(0, 50) +
      ` [dir=${cs.direction} ub=${cs.unicodeBidi} ta=${cs.textAlign}]`);
    n = n.parentElement;
  }
  return { leaf: el.tagName + '.' + (el.className || '').slice(0, 60), chain };
})()
```

Read the chain top-down and find:
- the **leaf block** (`p`/`li`/`td`/…) the Hebrew text lives in → its class goes into the
  per-leaf rules if needed;
- a **stable container** above it (today: `.standard-markdown` / `.font-claude-response` for
  the assistant, `[data-testid="user-message"]` for you) → that's `SELECTORS.messageRoot`.

Update [`dom/surfaces.js`](../dom/surfaces.js) `SELECTORS` (`messageRoot`, `leafBlock`,
`dirBlock`, `composer`, `editBox`, `table`) and, if a rule's anchor class changed, the
matching `:where(…)` root list in [`dom/apply.css`](../dom/apply.css).

> Tip: if `unicodeBidi` reads `isolate`/`normal` instead of `plaintext`, Claude is setting it
> with higher specificity — our rules already use a targeted `!important`; just make sure the
> selector still matches the element.

## 3. Physical-property gotcha

Claude styles decorations with **physical** Tailwind utilities (`border-l-4`, `pl-8`, `ml-2`)
that `dir="rtl"` can't flip. When a bar/indent stays on the wrong side, inspect it and add a
targeted flip in `apply.css` (see the existing `blockquote[dir="rtl"]` and nested-list rules
for the pattern: zero the physical side, set the logical side).

## 4. Desktop has no DevTools

The Claude desktop app disables DevTools and remote debugging. To see what the payload does,
launch the binary with logging and read stderr:

```bash
pkill -9 -f "Claude-RTL.app"; sleep 2
ELECTRON_ENABLE_LOGGING=1 nohup "$HOME/Applications/Claude-RTL.app/Contents/MacOS/Claude" > /tmp/rtl.log 2>&1 &
# click through; then:
grep -a "claude-rtl" /tmp/rtl.log
```

Set `DEBUG = true` in [`dom/apply.js`](../dom/apply.js) before building to get the
`[claude-rtl] …` trace. The chat renderer is `mainView.js` (its `url` is `https://claude.ai/`).

## 5. Verify the asar layout still matches

If Claude restructured its bundle, `patch.sh` dies with a named error instead of producing a
broken app. Confirm the layout:

```bash
npx --yes @electron/asar list /Applications/Claude.app/Contents/Resources/app.asar | grep -E "\.vite/build/.*\.js$"
```

The main entry is read from `package.json` `"main"` (today `.vite/build/index.pre.js`); the
payload goes into every *other* `.vite/build/*.js`.

## 6. Ship the fix

```bash
node --test engine/__tests__/*.test.js build/__tests__/*.test.js   # still green
node build/build-payload.js                                        # rebuild payload
# browser: reinstall dist/claude-rtl.user.js in Tampermonkey
# desktop: re-sign + re-patch (the integrity gate blocks a stale signature)
desktop/sign.sh && desktop/patch.sh --install
```

Then bump the corpus: add a `node --test` case for whatever broke, so the next adoption is
caught earlier.
