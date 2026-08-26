# Canonical Plugin Catalog Notes

Generated 2026-08-25 by the dsh-bridge catalog build.

## Source & method

- **Upstream:** [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) @ `main`.
- **Data files:** every YAML in `data/plugins/` (2,189 files) was fetched via raw.githubusercontent.com and parsed. Repo-level star counts come from the same repo's `data/stars.json` (1,494 entries, snapshot `checkedAt` 2026-08-19).
- **Count cross-check:** the official site badge ([awesome-dsh-plugin.com/count.json](https://awesome-dsh-plugin.com/count.json)) reports **2189**, matching our parse exactly.
- **Manifest:** [`manifest.json`](./manifest.json) — array of `{name, repo, url, category, stars_if_known, language_hint, description_en, listed}`, sorted by category then repo. Every entry has `listed: true` because it comes from the upstream curated list itself (not a topic-page discovery pass).

## Counts

| Metric | Value |
|---|---|
| Plugins listed | **2,189** |
| Distinct GitHub repos | 2,119 |
| Repos shipping multiple plugin manifests | 27 (e.g. `AKS1st/dock*`, `DamonKoy/dsh-web-ui#packages/*`) |
| Entries with star counts | 1,483 |
| Entries without known stars | 706 |

Note on stars: `stars_if_known` is the **repo's** star count at snapshot time. Subpath entries (e.g. `owner/repo#packages/x`) share their parent repo's stars, so a few high-star entries measure the umbrella repo rather than the individual plugin.

## Categories (21)

Counts are per plugin entry:

| Category | Count | | Category | Count |
|---|---:|---|---|---:|
| ui | 340 | | fun | 79 |
| tools | 284 | | vision | 78 |
| dev | 185 | | security | 77 |
| session | 145 | | model | 72 |
| workflow | 126 | | market | 61 |
| usage | 120 | | remote | 55 |
| memory | 111 | | browser | 53 |
| notify | 110 | | git | 52 |
| skill | 91 | | docs | 31 |
| theme | 85 | | voice | 31 |
| | | | identity | 3 |

Observations relevant to dsh-bridge (charter §"Curated discovery" and the trust layer):

- The two largest buckets (`ui` + `theme`, 425 entries ≈ 19%) are Web-UI cosmetics: low security surface, high visual-polish variance. Good candidates for screenshot-driven tiers.
- `security` has 77 entries but listing ≠ auditing; per the charter, every recommended plugin still needs its own adversarial review before `/bridge:install` prefers it.
- `identity` (3) and `docs`/`voice` (31 each) are thin niches where build-it-yourself scaffolding may be the better path than raw installs.

## Language split

Heuristic on `description_en`: fraction of CJK characters in the description.

| Hint | Count | Meaning |
|---|---:|---|
| en | 2,145 | Description fully in English |
| zh | 0 | No description is majority-Chinese |
| mixed | 44 | Mostly-English with inline Chinese terms (e.g. `行情面板`, `哪些值得装`) |

The ecosystem's Chinese skew shows up less in descriptions and more in project names, READMEs, and UI strings inside the repos themselves. Upstream maintains a curated `description.en` for every single entry (0 missing), so this manifest needed no translation pass. The `mixed` entries keep their inline Chinese glosses verbatim; they can be cleaned during per-plugin trust-report writing if desired.

## Star distribution (1,483 known)

- Median: **2** · Mean: 73.0
- ≥ 1,000 stars: **13** · ≥ 100 stars: **48** · 0 stars: **318**

Top 10 by repo stars:

1. volcengine/OpenViking#examples/dsh-memory-plugin — 29,567
2. vectorize-io/hindsight#coding-agents — 20,218
3. tt-a1i/archify#integrations/deepseek-harness — 14,283
4. Q00/ouroboros#integrations/dsh-plugin — 5,565
5. zhu1090093659/dsh-web-ui#packages/dsh-web-ui-all — 4,661
6. strukto-ai/mirage#dsh — 3,520
7. liustack/modlens — 3,152
8. omdsh-dev/DSH-better-sidebar — 2,216
9. ccch1mneyyy/dsh-TUI — 2,009
10. Small-tailqwq/dsh-deep-whale#maid-atelier — 1,400

The median of 2 confirms the charter's low-trust thesis: the long tail is tiny, unvetted repos, which is exactly the gap the verified-installer/trust-layer feature addresses.

## Caveats & follow-ups

- Snapshot of upstream `main` as of 2026-08-25 (~19:50 UTC-4); the list grows daily. Re-run the fetch to refresh.
- 706 entries lack star data simply because upstream hasn't polled them yet; they may still have stars.
- `category` values are upstream's own taxonomy codes (`ui`, `dev`, …), kept verbatim for traceability. Map to dsh-bridge display categories in a later pass.
- Sibling artifact `discovered-plugins.json` (same directory) covers GitHub topic-page discovery *outside* the curated list, including an `in_awesome_list` cross-reference; use it to find candidates for future upstream submissions.
