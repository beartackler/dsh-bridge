# Spec: `/browse` — Catalog Browsing

Status: draft v1 · Owner: bridge commands · Depends on: [`docs/design/trust-report-card.md`](../../design/trust-report-card.md), [`docs/research/ecosystem-audit.md`](../../research/ecosystem-audit.md)

> **Naming caveat:** written as `/browse` throughout. Per the open parser question in `portable-features.md` §160 (whether `:` is legal in a command name), the shipped name will be either `/bridge:browse` or `/bridge-browse`. Everything below applies unchanged.

---

## 1. Purpose

`/browse` is the read-only front door to the **verified catalog**: paginated browsing of the dsh-bridge plugin manifest, with trust grades visible before a user reads anything else. It exists because discovery is already solved by the ecosystem (awesome-dsh-plugin, dsh-market); what nobody answers is *"which of these are good, safe, and available in English?"* `/browse` answers that in one screen and hands off to `/bridge:install` in one step.

Non-goals: installing anything, fetching anything from the network at browse time, editing the manifest, or displaying unaudited claims. `/browse` renders what the manifest says; the manifest cites what the auditors proved.

**Data source (the manifest).** One file, committed in-repo, generated offline by the curation pipeline — never fetched live:

```
catalog/manifest.json
```

Each entry merges the upstream awesome-list `plugins.json` feed (names, categories, stars, descriptions) with our trust layer (`docs/trust/<plugin>/<commit>.md`):

```jsonc
{
  "id": "dsh-plugin-notion",
  "repo": "acme/dsh-notion",
  "category": "tools",              // canonical slug, see §3.1
  "stars": 412,
  "downloads_npm": 18300,
  "description_en": "Notion workspace tools: search, read, append pages.",
  "description_zh": "…",
  "grade": "B",                     // A|B|C|D|F|?
  "verified_commit": "a1b2c3d",
  "verified_at": "2026-08-24",
  "pushed_at": "2026-08-20"
}
```

Rules the manifest inherits from the charter:

- **Offline-first:** zero network calls during `/browse`. Star/download counts are as-of the manifest build date, which the header states. Refreshing the catalog is a separate maintainer action, not a side effect of browsing.
- **English-first:** every listed entry carries `description_en`, one sentence, plain register, matching the trust card voice. Entries without one are invisible under default filters (§3.2).
- **Grades are derived, never editorial:** the grade column is whatever the analyzer produced; `/browse` may not round it up, hide it, or soften a verdict.

## 2. User story

> **Mira** just installed DSH. Someone on r/LocalLLaMA said "get dsh-bridge, then type `/browse`". She runs it. In five seconds she sees ten plugins, each with a grade letter she's already learned to trust from the report cards, a star count, and one honest English line. She spots `◗ B · dsh-plugin-notion · 412★ · Notion workspace tools…`, likes it, copies the printed `/bridge:install dsh-plugin-notion` line (or clicks **Install** in the web panel), and the consent-aware installer takes it from there. She never touched a Chinese-language marketplace page, never ran shell against unaudited code, and never wondered "is this one safe?"

Secondary stories:

- **The browser:** Mira wants to see *everything worth having* in a category ("what's the state of UI plugins?"), not hunt for a specific name. Pagination + `--min-grade B` turns 340 UI plugins into a two-page shortlist.
- **The searcher:** Mira half-remembers a name ("that market thing, dsh-mrket?"). Fuzzy search finds it anyway, graded and installable.

## 3. Args & filters

### 3.1 Grammar

```
/browse [<positional>] [--category <slug>] [--min-grade <A|B|C>]
        [--language <code>] [--page <n>] [--limit <n>] [--ungraded]
```

| Arg | Values | Default | Notes |
|---|---|---|---|
| `<positional>` | free text | — | Resolved as **category first, then query** (see below) |
| `--category` | canonical slug | all | Explicit form of the category reading of `<positional>` |
| `--min-grade` | `A`, `B`, `C` | *(none)* | Floor on the trust grade. `D`, `F`, `?` are **never** valid floors |
| `--language` | `en`, `zh`, `any` | `en` | Which descriptions entries must have to be listed |
| `--page` | ≥ 1 | 1 | |
| `--limit` | 1–50 | 10 | Page size |
| `--ungraded` | flag | off | Include `?` entries (off even with `--min-grade`) |

**Positional disambiguation.** Exact match (case-insensitive, plus aliases like `ui` → `ui-enhancements`) against the canonical category slugs wins. Otherwise the text becomes a fuzzy query across name / repo / description / keywords. If a query happens to be 1 edit-distance from a category name, show both readings: "Did you mean the category **ui-enhancements** (340 entries)? Re-run with `--category ui`."

Canonical category slugs mirror the ecosystem audit taxonomy (stable, documented, never renamed without a manifest alias entry): `ui`, `tools`, `dev-runtime`, `sessions`, `workflow`, `usage`, `memory`, `notifications`, `skills`, `themes`, `fun`, `vision`, `security`, `models`, `markets`, `remote`, `browser`, `git-review`, `voice`, `docs`, `identity`.

### 3.2 Filter semantics

- Filters **compose** (AND). The header echoes every active filter so the output is self-describing.
- `--min-grade B` ⇒ keep `{A, B}`. `C` keeps nothing above itself. There is deliberately no way to ask for "at least D" — a passing grade is the whole point; risky entries surface only through search/category with their grade shown honestly.
- `--min-grade` silently excludes `?` (unreviewed) entries; the footer reports how many were excluded, so absence stays legible rather than looking like emptiness: `12 unreviewed hidden`.
- `--language en` (default) drops entries with no `description_en`. `zh` likewise. `any` lists everything, preferring the English line.
- Unknown values never guess: `--min-grade a+` errors with valid options listed.

## 4. Output mockups

### 4.1 Default view (terminal)

```
dsh-bridge catalog · 214 verified of 2,189 tracked · manifest built 2026-08-25
showing: language=en · page 1/22

GRADE  PLUGIN                STARS   ONE-LINE DESCRIPTION
◗ B    dsh-plugin-notion      412    Notion workspace tools: search, read, append pages.
● A    dsh-guardwall            1    Pre-install vetting and runtime blocking of high-risk calls.
◗ B    dsh-web-ui-gitgraph   5.9k    Git graph panel for your session history.
◆ C    modlens               110k*   Model comparison lens; one unexplained network endpoint.
○ ?    dsh-fast-search          2    (no English description yet)
…

page 1/22 · next: /browse --page 2 · install: /bridge:install <plugin>
```

Rendering rules:

- **Row order is ranking order** (§5). Columns fixed-width; grade glyph + letter + word label appear in `--verbose`, glyph + letter by default (the full three-way encoding lives on the report card; here the letter is the anchor).
- **Stars** compact-formatted (`5.9k`); `*` suffix marks counts older than 30 days. Never fabricate precision the manifest doesn't have.
- **Description:** exactly one line, ellipsized at column width. No second lines, no screenshots in the terminal.
- **Unreviewed rows** (`?`) render with the hollow glyph and never borrow color or confidence; if they carry no English description they say so plainly rather than translating silently.
- **Footer always teaches the next move**: paging syntax and the install handoff. A user should never finish reading `/browse` output without knowing how to act on it.
- `NO_COLOR=1`: glyphs and letters carry the signal alone (they already do).

### 4.2 Filtered view

```
$ /browse memory --min-grade B

dsh-bridge catalog · category=memory · grade ≥ B · 9 results · manifest built 2026-08-25

GRADE  PLUGIN                STARS   ONE-LINE DESCRIPTION
● A    dsh-memstore           87     Persistent session memory with typed recall API.
◗ B    dsh-recall             63     Cross-session recall backed by local SQLite.
…
```

### 4.3 Empty state (honest, actionable)

```
$ /browse voice --min-grade A

dsh-bridge catalog · category=voice · grade ≥ A · 0 results

Nothing in this category is verified yet. 31 unlisted (below grade) · 4 unreviewed.
Try: /browse voice            (relax the floor)
     /browse --ungraded      (see what hasn't been audited)
```

Never pad an empty result with unvetted suggestions. An empty verified shelf is information.

## 5. Ranking algorithm sketch

Deterministic pure function of manifest fields. Same manifest + same args ⇒ byte-identical output (snapshot-tested). Sketch, to be tuned against real usage:

```
rank(entry) =
    3.0 × grade_points        // A=1.0, B=0.75, C=0.5, D=0.25, F=0, ?=0
  + 2.0 × norm(log10(1 + stars))
  + 1.0 × norm(log10(1 + downloads_npm))
  + 0.5 × freshness(pushed_at)   // 1.0 if ≤90d, linear decay to 0 at 2y
  − 1.0 × stale_verification     // verified_commit >180d old or upstream moved >50 commits
```

- `norm(x)` = min-max over the current result set (not the whole manifest) so rankings stay stable per-page context and don't shift when unrelated entries change.
- **Search mode** layers fuzzy relevance on top: final score = `relevance × rank(entry)`, where `relevance` comes from subsequence matching (fzf-style scoring: consecutive-char and boundary bonuses, gap penalties) against weighted fields — `name` ×3, `repo` ×2, `keywords` ×2, `description_en` ×1. Zero relevance = filtered out entirely.
- Ties break deterministically: grade, then stars desc, then id lexicographic.
- Grade points dominate by design: this is the trust product. A 1-star verified tool outranks a 5k-star unreviewed one in the default view, and the mockups make that trade visible rather than apologetic.

## 6. Web-panel rendering notes (plugin browser UI hook)

The web panel's **plugin browser** consumes the same manifest through the same ranking/filter code path — one implementation of taste and trust, two renderers, mirroring the trust card's renderer-parity rule.

- **Hook point:** the panel exposes a catalog view keyed off `catalog/manifest.json` served statically with the plugin; no new backend. Rows render as `<BrowseRow>` using the existing `<TrustCard report={report} variant="compact" />` for the grade cell, so grade colors, glyphs, and luminance ramp come from `--dsh-trust-a … --dsh-trust-f` tokens exactly once.
- **Row anatomy:** grade badge (compact TrustCard) · name + repo · stars · one-line English description. Row is fully clickable; `Enter` opens the **detail drawer**, which is the full trust report card (§4.1 of its spec) plus an **Install** button.
- **Install handoff (web):** the drawer's Install button does not install inline; it invokes the `/bridge:install` flow with the entry's id and verified commit, so consent gating (permissions summary for B, expanded findings for C, typed risk consent for D/F) is owned by the installer in both surfaces. `?` entries offer **Review it now**, never Install.
- **Filters/pagination:** same defaults (page size 10, `language=en`, no grade floor) surfaced as chips above the list; chip state maps 1:1 onto CLI flags so docs cover both.
- **Inherited accessibility bar:** axe-clean AA in both themes; grade never encoded by color alone; rows are a focusable list with arrow-key navigation; drawer is a labelled dialog with focus trap; skeleton states keep row height (no layout jump) and never preview a fake grade letter; `prefers-reduced-motion` honored.
- **Parity acceptance:** the set of entries, grades, and ordering shown on the web panel for given filter state must equal the CLI output for the equivalent flags (snapshot test shared with §7).

## 7. Acceptance criteria

1. **Offline:** running `/browse` performs zero network requests (verifiable via request-log assertion in tests).
2. **Manifest fidelity:** every displayed fact (grade, stars, description, commit) traces to a manifest field; no field is computed, translated, or embellished at render time except formatting.
3. **Default visibility:** with no args, only entries having `description_en` are shown; each row shows grade, star count, and the one-line description — all three, always.
4. **Filter correctness:** property test over the full manifest — `--min-grade X` output ⊆ `{grades ≥ X}`; `?` never appears unless `--ungraded`; composed filters AND correctly; excluded-unreviewed count in footer equals actual hidden count.
5. **Fuzzy quality:** `dsh-mrket`, `web-ui gitgraf`, and `memstore` each resolve the intended entry within the top 5 results.
6. **Determinism:** identical manifest + args produce byte-identical output across runs and models (golden-file snapshot).
7. **Handoff integrity:** every printed/clickable install suggestion parses under the install spec's grammar verbatim, and carries the verified commit when one exists.
8. **Empty-state honesty:** zero-result views name what was filtered out (counts by reason) and offer the documented relaxations; no unvetted padding.
9. **No-color:** `NO_COLOR=1` output remains fully decodable via glyph + letter.
10. **Performance:** full filter/rank/render pass over a 2,189-entry manifest completes in <100 ms on the reference laptop; pagination never re-reads the network.
11. **i18n-ready:** all user-facing strings (headers, footers, empty states) externalized; no hardcoded English outside the string table.
12. **Web parity:** for equal effective filter state, web panel and CLI agree on entry set, order, and grades (shared snapshot fixture); axe reports zero violations in light/dark.
