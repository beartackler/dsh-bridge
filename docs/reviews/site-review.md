# Site review: `site/`

Review-only pass over `site/index.html`, `site/style.css`, `site/app.js` (with `site/build.mjs`,
`site/data.json`, `site/README.md` as context), checked against the Web Interface Guidelines
(`vercel-labs/web-interface-guidelines`, `command.md`) plus WCAG 2.2 AA for the contrast and
target-size claims.

Reviewed state: `index.html` 75 lines, `style.css` 217 lines, `app.js` 122 lines, `data.json` with
14 reviewed plugins across 12 categories, snapshot 2026-08-19. A polish pass was running in
parallel, so line numbers may drift; every finding names a selector or a function so it stays
locatable.

Contrast numbers below are computed WCAG relative-luminance ratios, not estimates.

---

## Blockers

### 1. `fetch("data.json")` fails on `file://`, and the README promises it works there

- Severity: blocker
- Where: `app.js` `main()`; `site/README.md` "no external requests in the page itself ... and it
  works offline from `file://`" and "Open `site/index.html` directly in a browser"
- Guideline: Content & Copy (claims must be accurate); Anti-patterns (broken empty UI)
- Detail: Chrome and Safari treat `file://` documents as an opaque origin, so `fetch` of a sibling
  file is blocked by CORS. Opening `index.html` by double-clicking yields a page with a hero, empty
  filter groups, an empty table and no error. Firefox behaves the same since v68. The offline claim
  is only true when the directory is served over HTTP.
- Fix, pick one:
  - Ship the data as JS: `site/data.js` containing `window.CATALOG = {...}` loaded with a plain
    `<script src="data.js">`, and have `build.mjs` write both `data.json` (for consumers) and
    `data.js` (for the page). This keeps `file://` genuinely working and removes the async path
    entirely.
  - Or inline the JSON at build time into `index.html` inside
    `<script type="application/json" id="catalog-data">`.
  - Whichever is chosen, correct the README so the stated behavior matches reality.

### 2. No error or loading state around the data fetch

- Severity: blocker (pairs with 1; independently real on a flaky host)
- Where: `app.js` `main()` — `data = await (await fetch("data.json")).json();`
- Guideline: Accessibility ("async updates need `aria-live="polite"`"); Content Handling ("handle
  empty states, don't render broken UI")
- Detail: `fetch` is unchecked for `response.ok`, there is no `try`/`catch`, and an unhandled
  rejection leaves the page permanently blank below the hero. `#count` and `#meta` never fill in, so
  there is no signal at all, visual or assistive.
- Fix:
  ```js
  const el = document.getElementById("count");
  el.textContent = "Loading catalog…";
  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    el.textContent =
      "Could not load the catalog data. Serve this directory over HTTP (see site/README.md) and reload.";
    return;
  }
  ```
  `#count` already carries `role="status"`, so the message is announced. Keep the error text
  actionable, per the guideline that errors state the next step.

### 3. Active grade chips fail AA text contrast

- Severity: blocker (accessibility)
- Where: `style.css` `.chip-grade[aria-pressed="true"] { color: #ffffff; }` combined with the
  `--grade-*-line` backgrounds
- Guideline: Hover & Interactive States ("interactive states increase contrast"); WCAG 1.4.3
  (4.5:1 for text under 18.66px bold / 24px regular; chip text is 0.82rem ≈ 13px)
- Measured, white on the pressed background:

  | Chip | Background | Ratio | AA 4.5:1 |
  | --- | --- | --- | --- |
  | A | `#2aa198` | 3.16 | fail |
  | B | `#3b82c4` | 4.06 | fail |
  | C | `#c99a2e` | 2.58 | fail |
  | D | `#d97a2e` | 3.10 | fail |
  | F | `#cc4444` | 4.69 | pass |

- Detail: Four of five active grade chips are below AA, C badly so. The irony is that the badge
  palette in the same file is already correct: `--grade-c-fg` on `--grade-c-bg` measures 5.89, and
  every other badge pair lands between 5.89 and 6.97 in light mode and 7.17 to 8.42 in dark. The
  pressed chip is the one place the good pairing was abandoned.
- Fix: reuse the badge pairing for the pressed state and carry the identity in the border instead of
  a white-on-saturated fill:
  ```css
  .chip-grade[data-grade="A"][aria-pressed="true"] {
    background: var(--grade-a-bg);
    color: var(--grade-a-fg);
    border-color: var(--grade-a-line);
    box-shadow: inset 0 0 0 1px var(--grade-a-line);
  }
  ```
  (repeat per grade; drop the blanket `color: #ffffff`). The inset ring keeps pressed clearly
  stronger than rest, which satisfies the "interactive states increase contrast" rule without
  relying on hue alone.

---

## High

### 4. Search input has no accessible name

- Severity: high
- Where: `index.html` `<input type="search" id="search" placeholder="Search name, repo, verdict...">`
- Guideline: Accessibility ("form controls need a label or `aria-label`"); Anti-patterns ("form
  inputs without labels")
- Detail: The placeholder is the only name. Placeholders are not accessible names in several
  screen-reader and browser combinations, and they vanish on first keystroke, so a returning user
  loses the field's purpose. This is also the single most-used control on the page.
- Fix: add a real label, visually hidden if the design wants a bare field:
  ```html
  <label class="visually-hidden" for="search">Search plugins</label>
  <input type="search" id="search" placeholder="Search name, repo, or verdict…"
         autocomplete="off" spellcheck="false" enterkeyhint="search">
  ```
  with the standard clip-rect `.visually-hidden` utility. `aria-label="Search plugins"` is an
  acceptable second choice. Note the placeholder also needs `…` (see 14) and `spellcheck="false"`
  per the Forms rule about codes and identifiers.

### 5. Expand toggle is not associated with the row it controls

- Severity: high
- Where: `app.js` `renderRow()` — `toggle` carries `aria-expanded` but no `aria-controls`, and
  `verdictRow` has no `id`
- Guideline: Accessibility ("use semantic HTML before ARIA"; disclosure patterns need the control
  and region related)
- Detail: `aria-expanded` announces the state but nothing tells assistive tech what expanded. Worse,
  the revealed content is a sibling `<tr>` that a screen-reader user reaches only by continuing to
  navigate the table, and in table-navigation mode the relationship is invisible. The toggle also
  has no accessible name beyond the concatenated plugin name and repo, so it announces roughly
  "OpenViking memory plugin volcengine/OpenViking, button, collapsed", with no hint that activating
  it reveals a verdict.
- Fix: give the verdict row a stable id and wire it up, and name the action explicitly:
  ```js
  const rowId = `verdict-${p.repo.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  verdictRow.id = rowId;
  toggle.setAttribute("aria-controls", rowId);
  toggle.append(el("span", { class: "visually-hidden" }, " — show verdict"));
  ```
  Derive the id from `p.repo` rather than an array index so it survives filtering, which also makes
  it usable as a deep-link target (see 10).

### 6. Grade meaning is conveyed only by a `title` attribute

- Severity: high
- Where: `app.js` `renderRow()` — `el("span", { class: "grade-badge ...", title: GRADE_LABELS[...] }, p.grade)`
- Guideline: Accessibility (meaningful content must be available to assistive tech; semantic HTML
  before ARIA)
- Detail: `title` is not exposed on touch, is unreachable by keyboard, and is inconsistently
  announced. The grade cell therefore reads as a bare letter, which is the single most important
  datum on the page. Colour reinforces it, but colour alone is also not sufficient (WCAG 1.4.1).
- Fix: use `<abbr>` with the expansion, or append visually hidden text:
  ```js
  const badge = el("abbr", { class: `grade-badge grade-${p.grade}`, title: GRADE_LABELS[p.grade] }, p.grade);
  ```
  and style `abbr.grade-badge { text-decoration: none; }`. Even better, add a visually hidden span
  with the full label so the announcement is "A, verified-clean" without depending on `abbr` support.
  The legend `<dl>` already carries the definitions; the per-row badge should point at it.

### 7. Repo link disappears entirely below 40rem

- Severity: high
- Where: `style.css` `@media (max-width: 40rem)` hides `th:nth-child(3)`/`td:nth-child(3)` and
  column 4
- Guideline: Content Handling (responsive content must not lose function); Navigation & State
- Detail: Column 3 holds the only `<a href="https://github.com/{repo}">` in the row. On phones the
  repo string survives as plain text inside `.cell-meta`, but the link is gone, so the primary
  outbound action of the catalog is unavailable on the majority of traffic. Stars vanish too, which
  is less severe but is real data loss rather than reflow.
- Fix: do not hide data columns. Either
  - collapse to a card layout under 40rem (`.catalog, .catalog tbody, .catalog tr, .catalog td
    { display: block; }` with `thead` visually hidden and `td::before` labels), or
  - keep the table and move the repo link into the name cell for all breakpoints, so the toggle and
    the link are siblings rather than duplicated across columns.
  The second is less code and removes the current duplication of `p.repo` in two cells.

### 8. `colspan="4"` is wrong once columns are hidden

- Severity: high
- Where: `app.js` `el("td", { colspan: "4" })` plus the `max-width: 40rem` column hiding
- Guideline: Accessibility (table semantics); HTML validity in practice
- Detail: Below 40rem the table renders two columns while the verdict cell still claims four. The
  visual result usually survives, but the accessibility tree gets an inconsistent grid, and the
  `display: none` columns still exist in the DOM for assistive tech in some browsers, producing a
  mismatch between announced column count and header count.
- Fix: resolved automatically by fixing 7 (stop hiding columns). If columns must stay hidden, hide
  them with a class applied in JS and set `colspan` from `table.tHead.rows[0].cells.length` at
  render time.

### 9. Expanded rows silently collapse on every keystroke and filter click

- Severity: high (UX correctness)
- Where: `app.js` `render()` — `tbody.textContent = ""` then full rebuild; `renderRow` always sets
  `aria-expanded="false"`
- Guideline: Performance ("controlled inputs must be cheap per keystroke"); Navigation & State
- Detail: `render()` destroys and recreates every row. A user who opens a verdict, then types one
  character to narrow the list, loses the open panel with no explanation. Focus is also destroyed:
  if focus was on a `.row-toggle`, it falls back to `<body>`, which strands keyboard users at the
  top of the document. This is the most user-visible defect after the blockers.
- Fix: keep expansion in state and restore it:
  ```js
  const state = { query: "", grades: new Set(), categories: new Set(), expanded: new Set() };
  // in the toggle handler: state.expanded[open ? "delete" : "add"](p.repo)
  // in renderRow: const open = state.expanded.has(p.repo);
  ```
  and before rebuilding, capture `document.activeElement`'s row key, then re-focus the matching
  toggle after render. Alternatively, filter by toggling a `hidden` attribute on persistent rows
  instead of rebuilding, which sidesteps both problems and is less code at this data size.

---

## Medium

### 10. Filter and search state is not reflected in the URL

- Severity: medium
- Where: `app.js` `state`, `makeChip()`, the `input` listener
- Guideline: Navigation & State ("URL reflects state — filters, tabs, pagination, expanded panels in
  query params"; "deep-link all stateful UI")
- Detail: A reader who filters to grade D and wants to send that view to a colleague has no URL to
  send. For a catalog whose entire purpose is citable evidence, unshareable filtered views are a
  substantive gap, not a nicety. Reload also discards all filtering.
- Fix: mirror state into the query string on change and hydrate from it on load:
  ```js
  function syncUrl() {
    const q = new URLSearchParams();
    if (state.query) q.set("q", state.query);
    if (state.grades.size) q.set("grade", [...state.grades].join(","));
    if (state.categories.size) q.set("category", [...state.categories].join(","));
    history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
  }
  ```
  Use `replaceState` for typing and `pushState` for chip clicks so Back undoes a filter but not each
  keystroke. Read the same params before the first `render()`. Combined with 5, `#verdict-<repo>`
  also becomes a deep link to a specific report.

### 11. Control borders fail the 3:1 non-text contrast minimum

- Severity: medium
- Where: `style.css` `--border: #e2e2de` (light) and `#33373b` (dark), used for `#search` and
  `.chip`
- Guideline: Hover & Interactive States; WCAG 1.4.11 Non-text Contrast (3:1 for control boundaries)
- Measured: `#e2e2de` on `#fdfdfc` is 1.28:1. Dark mode `#33373b` on `#16181a` is 1.48:1. The chips
  sit on `--surface` `#f4f4f2`, which is worse still.
- Detail: In rest state the chip's only affordance is its border, and the search field's only
  boundary is its border plus a barely-differentiated fill. Both are effectively invisible to
  low-vision users and on glare-washed laptop screens. Table rules at this weight are decorative and
  acceptable; the two controls are not.
- Fix: introduce a dedicated control-boundary token rather than darkening every hairline:
  ```css
  :root { --border: #e2e2de; --border-strong: #8d8d86; }        /* 3.06:1 on --bg */
  @media (prefers-color-scheme: dark) {
    :root { --border: #33373b; --border-strong: #767c82; }      /* 3.05:1 on --bg */
  }
  #search, .chip { border-color: var(--border-strong); }
  ```
  Verify the final values; `#b9b9b3` was tested and reaches only 1.94:1, so do not settle for a
  light grey that merely looks darker.

### 12. Sticky controls bar can cover the focused row

- Severity: medium
- Where: `style.css` `.controls { position: sticky; top: 0; z-index: 1; }`
- Guideline: Focus States ("sticky headers/footers/overlays must not cover the focused element");
  Accessibility (`scroll-margin-top` on anchors)
- Detail: Tabbing down the table scrolls the next `.row-toggle` into view with the browser's default
  alignment, which places it flush against the viewport top and therefore underneath the sticky bar.
  The focus ring is clipped or fully hidden. Any future `#verdict-*` anchor lands under the bar too.
- Fix:
  ```css
  .row-toggle, .catalog tr, [id^="verdict-"] { scroll-margin-top: 5.5rem; }
  ```
  Tune to the measured bar height, and prefer a CSS variable set once so the bar and the offset
  cannot drift apart. The bar also has no bottom shadow or backdrop blur, so content scrolls
  underneath a solid `var(--bg)` band with no depth cue; a 1px border already exists, which is
  adequate, but confirm it reads at 200% zoom.

### 13. Per-node event listeners instead of delegation

- Severity: medium
- Where: `app.js` `makeChip()` (one listener per chip, 17 chips at current data) and `renderRow()`
  (one listener per row, recreated on every render)
- Guideline: Performance ("batch DOM reads/writes"; avoid per-item handler churn)
- Detail: Not a live performance problem at 14 rows and 17 chips. It becomes one as the catalog
  grows, because every keystroke currently detaches every row listener and attaches a fresh set. It
  also makes 9 harder to fix than it needs to be. Delegation is strictly less code here.
- Fix: one listener on `#tbody` and one per filter group:
  ```js
  document.getElementById("tbody").addEventListener("click", (e) => {
    const toggle = e.target.closest(".row-toggle");
    if (toggle) toggleRow(toggle);
  });
  ```
  Store the plugin key in `data-repo` on the row. Related, when the plugin count passes roughly 50,
  add `.catalog tbody tr { content-visibility: auto; contain-intrinsic-size: auto 3rem; }` rather
  than reaching for a virtualization library; the guideline's threshold is 50 items and the table is
  simple enough that `content-visibility` is sufficient.

### 14. Typography: ASCII stand-ins for real punctuation

- Severity: medium
- Where: multiple
  - `index.html` `<title>dsh-bridge - verified plugin catalog</title>`
  - `index.html` `placeholder="Search name, repo, verdict..."`
  - `app.js` `renderRow()` — `Verified ${p.verified} - category: ...` and the trailing ` - ` before
    the card link
  - `app.js` marker glyphs `"+"` and `"-"`
- Guideline: Typography ("`…` not `...`"; curly quotes; non-breaking spaces)
- Fix:
  - `...` becomes `…` in the placeholder. Per the Forms rule, placeholders should also show an
    example pattern: `Search name, repo, or verdict… e.g. memory`
  - The `-` used as a sentence-level separator becomes an en dash with spaces, `–`, or better,
    restructure the verdict meta into a `<ul>` so no separator glyph is needed at all.
  - Collapse marker: `-` is a hyphen-minus; use `−` (U+2212) to pair optically with `+`, or replace
    both with a CSS-rotated chevron so the control does not depend on a glyph.
  - The `<title>` separator should be an en dash: `dsh-bridge – verified plugin catalog`. Note the
    brand itself legitimately contains hyphens; only the separator changes.
  - Add non-breaking spaces in `Grade A` style pairs and in `10 MB`-shaped values if any appear
    later.

### 15. Missing `color-scheme` and `theme-color`

- Severity: medium
- Where: `style.css` `:root`; `index.html` `<head>`
- Guideline: Dark Mode & Theming ("`color-scheme: dark` on root for dark themes (fixes scrollbar,
  inputs)"; "`theme-color` matches page background")
- Detail: The page ships a full `prefers-color-scheme: dark` palette but never declares
  `color-scheme`. Consequence: the scrollbar, the `type="search"` clear affordance, focus rings on
  form controls and any future native `<select>` all render in light-mode chrome against the dark
  surface. The search field's cancel button in particular becomes a light glyph problem in Safari.
- Fix:
  ```css
  :root { color-scheme: light dark; }
  ```
  and in `<head>`:
  ```html
  <meta name="theme-color" content="#fdfdfc" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#16181a" media="(prefers-color-scheme: dark)">
  ```

### 16. No skip link, and `<main>` is not a target

- Severity: medium
- Where: `index.html` — `<main class="wrap">` has no `id`; no skip link precedes the header
- Guideline: Accessibility ("headings hierarchical; include skip link for main content")
- Detail: The header is short, so the cost is small today, but the sticky controls bar means a
  keyboard user tabs through a search field and up to 17 filter chips before reaching the first row.
  A skip link to the table is worth more here than the usual skip-to-main.
- Fix:
  ```html
  <a class="skip-link" href="#catalog-table">Skip to the catalog</a>
  ```
  as the first child of `<body>`, styled off-screen until `:focus-visible`. Give `<main>` an `id`
  too. Since `#catalog-table` gets `hidden` when zero rows match, point the skip link at a wrapper
  that is always present, or at `#count`.

### 17. Touch and tap-highlight defaults are unset

- Severity: medium
- Where: `style.css` — no `touch-action` or `-webkit-tap-highlight-color` anywhere
- Guideline: Touch & Interaction ("`touch-action: manipulation`"; "`-webkit-tap-highlight-color` set
  intentionally")
- Detail: On iOS the 300ms double-tap-zoom delay applies to the chips and row toggles, which makes
  filtering feel laggy on exactly the devices where the table is most cramped. The default grey tap
  flash also clashes with the grade palette.
- Fix:
  ```css
  .chip, .row-toggle, a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  ```
  If the highlight is removed, confirm `:active` provides visible feedback, otherwise taps feel
  dead. Add `.chip:active { transform: translateY(1px); }` or an `:active` background shift.

### 18. Chip and toggle hit targets are under the 24px minimum

- Severity: medium
- Where: `style.css` `.chip { font-size: 0.82rem; padding: 0.22rem 0.7rem; }`; `.row-toggle` has
  `padding: 0`
- Guideline: Touch & Interaction; WCAG 2.5.8 Target Size (Minimum), 24 by 24 CSS pixels
- Detail: The chip computes to roughly 30px tall, which passes, but only just, and any reduction in
  `font-size` breaks it. `.row-toggle` with zero padding is exactly as tall as its two lines of
  text, so vertically it passes while horizontally the hit area ends at the text, leaving dead space
  across the rest of a wide cell where users will naturally aim.
- Fix: set an explicit floor and widen the toggle:
  ```css
  .chip { min-height: 24px; display: inline-flex; align-items: center; }
  .row-toggle { display: block; width: 100%; padding: 0.15rem 0; }
  ```
  Making the toggle fill the cell is also the fix users expect from a table disclosure row.

---

## Low

### 19. Hardcoded `en-US` number formatting, raw ISO dates

- Severity: low
- Where: `app.js` — `p.stars.toLocaleString("en-US")` in the stars cell; `` `stars at snapshot:
  ${p.stars}` `` in the verdict row; `` `Verified ${p.verified}` ``
- Guideline: Locale & i18n ("use `Intl.NumberFormat` / `Intl.DateTimeFormat`, not hardcoded
  formats")
- Detail: Two inconsistencies rather than one bug. The stars column is grouped (`29,567`) while the
  same number in the expanded verdict is ungrouped (`29567`), which looks like a defect to a careful
  reader. And `en-US` is pinned even though nothing else on the page is locale-specific.
- Fix: build one formatter and use it in both places:
  ```js
  const nf = new Intl.NumberFormat(undefined, { notation: "standard" });
  ```
  For dates, the ISO form is defensible and arguably correct for evidence citations, so keep the
  text but mark it up: `<time datetime="2026-08-26">2026-08-26</time>`. That preserves precision and
  gives assistive tech and scrapers the machine-readable value.

### 20. `rel="noopener"` without `target="_blank"` is inert

- Severity: low
- Where: `app.js` — repo links and `.card-link` both get `rel: "noopener"`
- Guideline: general correctness
- Detail: `noopener` only matters for links that open a new browsing context. These open in the same
  tab, so the attribute is dead weight. Harmless, but it signals a copy-paste rather than a decision,
  and this repo's credibility rests on looking deliberate.
- Fix: drop it, or decide the catalog should open cards in a new tab and then add
  `target="_blank" rel="noopener noreferrer"` plus a visually hidden "(opens in a new tab)". Do not
  leave it half-applied.

### 21. Brand and identifier strings are not protected from auto-translation

- Severity: low
- Where: `index.html` brand, `<code>` paths in the footer; `app.js` repo slugs and plugin names
- Guideline: Locale & i18n ("brand names, code tokens, identifiers: wrap with `translate="no"`")
- Detail: Chrome's auto-translate will happily mangle `volcengine/OpenViking` and
  `docs/catalog/INDEX.md` for non-English readers, which turns citable evidence into noise.
- Fix: `translate="no"` on `.brand`, on `code`, and on the repo cell:
  ```js
  repoTd.appendChild(el("a", { href: ..., translate: "no" }, p.repo));
  ```

### 22. No `text-wrap: balance` on the headline

- Severity: low
- Where: `style.css` `.hero h1`
- Guideline: Typography ("use `text-wrap: balance` or `text-pretty` on headings")
- Detail: The h1 is a full sentence at `clamp(1.6rem, 4.5vw, 2.4rem)` inside a `46rem` container, so
  it wraps to two or three lines at most widths and produces a one-word widow at several common
  viewports.
- Fix: `.hero h1 { text-wrap: balance; }` and `.hero p, .notes p { text-wrap: pretty; }`.

### 23. Long identifiers can overflow narrow table cells

- Severity: low
- Where: `style.css` `.catalog td`; the repo slug appears in both the name cell meta and column 3
- Guideline: Content Handling ("text containers handle long content"; "flex children need `min-w-0`")
- Detail: Current data tops out at moderate slug lengths, so nothing breaks today. A longer
  `org/repository-with-a-long-name` will force horizontal overflow because no wrapping rule is set
  and the table has no fixed layout. The page has no `overflow-x` guard either.
- Fix:
  ```css
  .catalog td { overflow-wrap: anywhere; }
  .catalog { table-layout: fixed; }
  body { overflow-x: hidden; }
  ```
  Use `table-layout: fixed` only alongside explicit column widths, otherwise the grade column will
  claim a quarter of the table.

### 24. Search does not cover the description field that the data carries

- Severity: low
- Where: `app.js` `matches()` — `` `${p.name} ${p.repo} ${p.verdict}` ``; `build.mjs` populates
  `r.description` from the manifest
- Guideline: general UX
- Detail: `build.mjs` goes to real trouble to join `description_en` into every record, and
  `data.json` carries it, but nothing on the page ever reads it. Either it should be searchable, or
  shown in the expanded verdict row, or dropped from the build to keep the payload honest.
- Fix: cheapest useful option is to include it in the haystack and render it in the expanded row
  above the verdict. If it stays unused, remove it from `build.mjs` so `data.json` does not carry
  dead weight.

### 25. No way to clear all filters

- Severity: low
- Where: `index.html` `.controls`; `app.js` `state`
- Guideline: general UX
- Detail: With 17 chips across two groups, a user who has toggled several must remember and undo
  each. The `#count` line already tells them a subset is showing, which makes the absence of a reset
  more conspicuous.
- Fix: render a "Clear filters" button in `.controls`, `hidden` unless
  `state.grades.size || state.categories.size || state.query`. Pair with 10 so clearing also cleans
  the URL.

### 26. Category chips have no group heading, only an `aria-label`

- Severity: low
- Where: `index.html` `#grade-filters` and `#category-filters`, both `role="group"` with
  `aria-label`
- Guideline: Accessibility (semantic HTML before ARIA)
- Detail: The ARIA is correct and will work. But sighted users get two undifferentiated rows of
  pills with no indication that the first five are grades and the next twelve are categories. The
  grade chips are single letters, so the distinction is inferable but not stated.
- Fix: add visible group labels (`<h2 class="filter-heading">Grade</h2>` / `Category`, sized small
  and uppercase to match `.catalog th`) and point each group at them with `aria-labelledby` instead
  of `aria-label`. Visible labels serve everyone and remove the duplicate string.

### 27. Copy nits

- Severity: low
- Where: various
- Guideline: Content & Copy (Title Case for headings; specific labels; numerals for counts; active
  voice; second person)
- Items:
  - `app.js` "n/a" for unknown star counts is jargon and lowercase. Use "Unknown", which also
    matches the `unknown` sentinel that `build.mjs` parses out of `INDEX.md`.
  - `index.html` "About these grades" is sentence case where the guideline asks for Chicago Title
    Case: "About These Grades". If the project has a deliberate sentence-case house style, note it
    in a style doc so this stops being re-flagged.
  - `app.js` uppercases the grade label inside the verdict row
    (`` `Grade ${p.grade}: ${(GRADE_LABELS[p.grade] || "").toUpperCase()}. ` ``), producing
    "VERIFIED-CLEAN". All-caps hurts readability and screen readers may spell it out letter by
    letter. Use the label as written and let CSS handle any casing with `text-transform`, which
    leaves the accessible text intact.
  - The hero paragraph is one 62-word sentence followed by a second long one. It is accurate and
    admirably free of marketing language, but it asks a lot of a first-time reader. Split after
    "curated plugin catalog." and let the verification claim stand as its own sentence, which is the
    strongest thing on the page.
  - `#count` reads "Showing all 14 reviewed plugins." Good. Confirm the singular case renders
    correctly when a filter narrows to one result; the current template produces "Showing 1 of 14
    reviewed plugins", which is fine, but "Showing all 1 reviewed plugins" would appear if the
    dataset ever held a single row.

### 28. Missing document metadata

- Severity: low
- Where: `index.html` `<head>`
- Guideline: adjacent to the guidelines (sharing and discoverability)
- Detail: No `<meta name="description">`, no Open Graph or Twitter card tags, no favicon. For a
  project whose distribution channel is people linking to it, an unfurl with no title card is a
  missed opportunity. The `site/demo/` directory already contains suitable PNGs
  (`trust-card-light.png`, `connect-matrix-light.png`).
- Fix: add a description matching the tagline, `og:title`, `og:description`, `og:image` pointing at
  one of the existing demo PNGs, `twitter:card=summary_large_image`, and an SVG favicon. Confirm the
  chosen image has explicit dimensions declared in the OG tags.

---

## Verified as correct

Worth recording so a later pass does not "fix" these into regressions.

- `<html lang="en">` is set, and the viewport meta has no `user-scalable=no` or `maximum-scale`, so
  zoom is unblocked. This is the single most common accessibility anti-pattern and the page avoids
  it.
- No `outline: none` anywhere. `:focus-visible` is used correctly rather than `:focus`, on `#search`,
  `.chip` and `.row-toggle`, with a 2px `var(--link)` ring and sensible offsets.
- No `transition: all`. In fact no transitions at all, which means the `prefers-reduced-motion`
  requirement is satisfied vacuously. If a later pass adds animation, it must add the media query
  with it.
- Semantic HTML throughout: real `<table>` with `<thead>` and `<th scope="col">`, `<dl>` for the
  grade legend, `<button type="button">` for every action, `<a>` for every navigation. No
  click-handler `<div>`s.
- `#count` carries `role="status"`, so filter results are announced without a manual `aria-live`.
- `.stars` uses `font-variant-numeric: tabular-nums`, per the numeric-column rule.
- Decorative `+`/`-` marker is `aria-hidden="true"`.
- Zero external requests: no CDN, no web font, no analytics. The stack is `ui-serif` and
  `ui-monospace` system fonts, so there is no FOUT and no `preconnect` needed.
- The grade palette's badge pairings are genuinely colorblind-considered and measure 5.89:1 to
  6.97:1 in light mode, 7.17:1 to 8.42:1 in dark. Body text, soft text and links all clear AA
  comfortably: `--text-soft` on `--bg` is 6.21:1 light and 6.74:1 dark, links are 6.61:1 and 9.08:1.
  Finding 3 is a lapse against an otherwise careful system, not a symptom of a bad palette.
- `build.mjs` fails loudly (`process.exit(1)`) when `INDEX.md` parsing yields zero rows, and
  recomputes the grade distribution from the table rather than trusting the prose line. That is the
  right instinct and it is documented in a comment explaining the past drift.
- `autocomplete="off"` on the search field is correct per the rule about non-auth fields.

---

## Verdict

The site is in better shape than most hand-written static pages and the underlying judgment is
sound: semantic markup, a considered colorblind-safe palette, `:focus-visible` used properly, zero
third-party requests, and a data generator that fails loudly rather than silently. The taste is
visible and the restraint from marketing language matches the project's stated bar.

It is not shippable yet, for three reasons. The page does not work when opened the way the README
tells you to open it, and it fails silently when it does not work (findings 1 and 2). Four of the
five active grade filters fail AA text contrast, in a project whose entire premise is that it does
the careful thing (finding 3). And the primary control has no accessible name (finding 4).

Fix findings 1 through 4 and the site is publishable. Fix 5 through 9 and it is good. The rest is
polish that can land incrementally, with 10 (URL state) the highest-value item in that tier because
shareable filtered views serve the project's core purpose of citable evidence.

Estimated effort for the blockers and highs: a focused hour, most of it in `app.js`. None of the
fixes require restructuring, and several of them (9, 13) make the code shorter than it is now.
