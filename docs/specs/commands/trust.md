# `/trust` — Plugin Trust Report Card

**Status:** spec (draft v1)
**Owner:** dsh-bridge trust layer
**Related:** `/bridge:install`, `docs/audits/`, `docs/catalog/cards/`

---

## Purpose

`/trust` is the user-facing window into dsh-bridge's adversarial security review pipeline. It answers one question fast: **"Is this plugin safe to install, and how do you know?"**

Every answer is backed by evidence at `file:line` in a specific commit. No grade is ever shown without a `verified-at` commit SHA. If we have not reviewed a plugin, we say so plainly and offer to queue a review rather than guessing.

Non-goals:

- `/trust` does not install anything. Installation lives in `/bridge:install`, which *calls* the trust layer as a gate.
- `/trust` does not make network calls at read time. It reads committed artifacts from the repo/catalog cache. Only `/trust refresh` runs the pipeline (which does fetch source).
- `/trust` is not a malware scanner claiming completeness. It reports observed signals with evidence; absence of findings is reported as "no findings in scanned surface", never "safe".

---

## User story

> Priya is a security-conscious backend dev evaluating DSH. She finds `dsh-notion-sync` in the catalog and wants to know whether it touches her credentials before she lets it run in her shell.
>
> She types `/trust dsh-notion-sync`. Within a second she sees a **B+** card: two medium findings (network egress to `api.notion.com`, filesystem read of `~/.config`), each with a clickable `file:line` citation and the commit they were verified at. She types `/trust explain dsh-notion-sync` and reads three plain-English paragraphs telling her the egress is the plugin's stated purpose and the config read is scoped to its own subdirectory. She installs with confidence.
>
> Two weeks later the plugin releases v2. She runs `/trust refresh dsh-notion-sync`, the pipeline re-runs, and the grade drops to **C** with a new HIGH finding: `child_process.exec` with an interpolated string. She does not upgrade, and files an issue linking the report card URL.

Secondary story: Marco types `/trust some-random-plugin` for a plugin nobody has reviewed. Instead of a dead end, he is told it is unreviewed, shown what little metadata exists, and offered `/trust refresh some-random-plugin` to run the pipeline locally right now.

---

## Subcommands

### `/trust <plugin>` (default)

Render the trust report card for `<plugin>`.

- `<plugin>` accepts: catalog slug (`dsh-notion-sync`), `owner/repo` (`acme/dsh-notion-sync`), or full GitHub URL. All are normalized to a catalog slug.
- Resolution order: local catalog card → repo `docs/catalog/cards/<slug>.json` → local pipeline cache (`~/.dsh/bridge/trust-cache/<slug>.json`) → unreviewed path.
- Read-only, offline, sub-second target.

### `/trust refresh <plugin>`

Re-run the full review pipeline against the plugin's current default-branch HEAD and rewrite the card.

- Fetches source into a sandboxed temp dir (never executes plugin code).
- Runs static analysis + behavioral heuristics (see Data source).
- Writes `<slug>.json` + `<slug>.md` to the cache, and to `docs/catalog/cards/` when run inside a repo checkout with write intent.
- Prints a **diff view** against the previous card: grade delta, findings added/resolved.
- Flags: `--commit <sha>` pin a revision; `--json` machine-readable output; `--no-cache` ignore any cached analysis.

### `/trust explain <plugin> [finding-id]`

Walk through findings in plain English, no jargon, ordered by severity.

- Without `finding-id`: a narrative summary — what the plugin does, what it touches, what would concern a reviewer, what the grade means.
- With `finding-id` (e.g. `NET-002`): deep dive on one finding — the code, why the heuristic fired, realistic exploit story, and what would make it benign.
- Every claim carries its `file:line` citation. Explanations are generated from the structured findings, never free-form invention.

### `/trust list`

Table of all locally known cards: slug, grade, findings count, verified-at date. Sortable via `--sort grade|date|name`. Useful before an upgrade sweep.

### `/trust queue <plugin>`

Record a review request for a plugin we have not audited (appends to `docs/catalog/queue.json` and, when the user opts in, opens a prefilled GitHub issue). Offered automatically on the unreviewed path.

---

## Output mockup

### Reviewed plugin

```
╭──────────────────────────────────────────────────────────────────────╮
│  TRUST REPORT CARD                                          B+  ▓▓▓▓░ │
│  dsh-notion-sync · acme/dsh-notion-sync · v2.1.0                      │
├──────────────────────────────────────────────────────────────────────┤
│  Verified at  a3f9c21  (2026-08-19, 6 days ago)          ● fresh      │
│  Scanned      41 files · 6.2k LOC · 3 lifecycle hooks                 │
│  Signals      egress 1 · creds 0 · dynamic-eval 0 · obfuscation 0     │
├──────────────────────────────────────────────────────────────────────┤
│  TOP FINDINGS                                                         │
│                                                                       │
│  ▲ MED   NET-001  Outbound HTTPS to api.notion.com                    │
│          src/client.ts:34   fetch(`https://api.notion.com/v1/${p}`)   │
│          Matches the plugin's stated purpose. Host is not templated.  │
│                                                                       │
│  ▲ MED   FS-003   Reads user config directory                         │
│          src/config.ts:12   readFile(join(homedir(), '.config', ...)) │
│          Scoped to ./dsh-notion-sync/. No traversal observed.          │
│                                                                       │
│  ○ LOW   DEP-004  1 transitive dep with no published provenance       │
│          package.json:19    tiny-retry@0.3.1                          │
│                                                                       │
│  No findings in: credential access, dynamic eval, child_process,      │
│  obfuscation, install-time scripts.                                   │
├──────────────────────────────────────────────────────────────────────┤
│  /trust explain dsh-notion-sync      plain-English walkthrough        │
│  /trust refresh dsh-notion-sync      re-run pipeline at HEAD          │
│  /bridge:install dsh-notion-sync     install (trust gate: pass)       │
╰──────────────────────────────────────────────────────────────────────╯
```

### Unreviewed plugin (graceful path)

```
╭──────────────────────────────────────────────────────────────────────╮
│  TRUST REPORT CARD                                        NOT REVIEWED│
│  some-random-plugin · mystery/some-random-plugin                      │
├──────────────────────────────────────────────────────────────────────┤
│  dsh-bridge has not audited this plugin. We will not guess at a       │
│  grade. Treat it as arbitrary code with your shell's privileges.      │
│                                                                       │
│  What we could see without running an audit:                          │
│    · GitHub    12 stars · last commit 2026-02-03 · MIT                │
│    · Catalog   not listed                                             │
│                                                                       │
│  Next:                                                                │
│    /trust refresh some-random-plugin   run the pipeline now (~20s)    │
│    /trust queue some-random-plugin     request a maintainer review    │
╰──────────────────────────────────────────────────────────────────────╯
```

### Stale card

```
│  Verified at  a3f9c21  (2026-05-02, 115 days ago)        ▲ stale     │
│  Upstream HEAD is 9d1e004 — 23 commits ahead of the audited commit.  │
│  Run /trust refresh dsh-notion-sync before trusting this grade.      │
```

---

## Data source

Single source of truth: **`docs/catalog/cards/<slug>.json`** (structured) with **`docs/catalog/cards/<slug>.md`** (human-readable, rendered on GitHub) generated from it. The `.md` is derived, never hand-edited; CI regenerates and fails on drift.

### `<slug>.json` shape

```jsonc
{
  "schema": "dsh-bridge/trust-card@1",
  "slug": "dsh-notion-sync",
  "repo": "github.com/acme/dsh-notion-sync",
  "version": "2.1.0",
  "grade": "B+",
  "score": 84,
  "verified_at": {
    "commit": "a3f9c21e0b4d...",
    "date": "2026-08-19T14:02:11Z",
    "pipeline_version": "0.4.0",
    "reviewer": "automated"        // or "automated+human:<handle>"
  },
  "scan": { "files": 41, "loc": 6210, "hooks": 3 },
  "signals": { "egress": 1, "credentials": 0, "dynamic_eval": 0, "child_process": 0, "obfuscation": 0 },
  "findings": [
    {
      "id": "NET-001",
      "severity": "medium",         // critical | high | medium | low | info
      "category": "network-egress",
      "title": "Outbound HTTPS to api.notion.com",
      "evidence": [{ "file": "src/client.ts", "line": 34, "snippet": "fetch(`https://api.notion.com/v1/${p}`)" }],
      "rationale": "Matches the plugin's stated purpose. Host is not templated.",
      "explain": "This plugin talks to Notion's API, which is what it says it does...",
      "mitigation": null,
      "status": "accepted"          // open | accepted | false-positive | fixed
    }
  ],
  "clean_categories": ["credential-access", "dynamic-eval", "child-process", "obfuscation", "install-scripts"]
}
```

### Grade derivation

Grade is a deterministic function of findings, computed by the pipeline, never authored by hand:

| Condition | Ceiling |
|---|---|
| any open `critical` | F |
| any open `high` | C |
| ≥3 open `medium` | B− |
| ≤2 open `medium`, no high/critical | B+ |
| only `low`/`info`, license + provenance clean | A |
| A-grade plus human reviewer sign-off | A+ |

Accepted findings (reviewed, judged intentional and scoped) do not lower the ceiling but always remain visible on the card.

### Cache

`~/.dsh/bridge/trust-cache/<slug>.json` mirrors the repo format for locally-run refreshes. Repo cards win on tie; a locally refreshed card at a newer commit wins over an older repo card, and is labeled `local` on the card.

---

## Freshness policy

Freshness is a property of the **audited commit vs upstream HEAD**, plus wall-clock age as a fallback when HEAD is unknown offline.

| State | Rule | UI |
|---|---|---|
| `fresh` | audited commit == upstream HEAD, or age ≤ 30 days with no known upstream drift | `● fresh` green |
| `aging` | 31–90 days old, no drift detected | `◐ aging` yellow |
| `stale` | > 90 days old, **or** upstream HEAD differs from audited commit | `▲ stale` orange + refresh nudge |
| `invalid` | audited commit no longer reachable (force-push/rewrite) | `✖ invalid` red; grade suppressed, treated as unreviewed |

Rules:

- Drift detection is **opportunistic and offline-safe**: `/trust` never blocks on network. If a HEAD SHA was cached in the last 24h it is compared; otherwise only age is used and the card notes `drift unknown`.
- `/bridge:install` treats `stale` as a soft gate (warn + confirm) and `invalid` as a hard gate (must refresh).
- A grade is **never** shown without its `verified_at.commit`. Suppress the grade rather than show it unanchored.
- Any change in `pipeline_version` major marks all cards `aging` at minimum, since heuristics changed.
- `/trust refresh` is always available and always overrides freshness state.

---

## Acceptance criteria

1. `/trust <plugin>` renders a card for a reviewed plugin in < 500 ms with zero network calls, showing grade, freshness state, signal counts, and up to 5 findings ordered by severity.
2. Every displayed finding shows at least one `file:line` citation and the `verified-at` commit is visible on the card. A card with a grade but no commit SHA is a test failure.
3. `/trust <unreviewed>` never errors and never fabricates a grade: it renders the NOT REVIEWED card and offers `refresh` and `queue`.
4. `/trust refresh <plugin>` re-runs the pipeline against a pinned commit, writes valid `dsh-bridge/trust-card@1` JSON, regenerates the `.md`, and prints a grade/findings diff against the prior card.
5. Refresh never executes plugin code: verified by a fixture plugin whose `postinstall` and module top level write a sentinel file; the file must not exist after refresh.
6. `/trust explain <plugin>` produces plain-English output for every finding, derived only from structured card fields. No finding may be described without its citation. Snapshot-tested against fixture cards.
7. Grade derivation is deterministic and table-driven: given identical findings JSON, the grade is byte-identical across runs and machines. Property-tested against the ceiling table.
8. Freshness states (`fresh`/`aging`/`stale`/`invalid`) are unit-tested at boundaries (30/31, 90/91 days; drift present/absent; unreachable commit). `invalid` suppresses the grade.
9. Card `.md` files are generated; CI fails if a committed `.md` differs from regeneration output, or if any `.json` fails schema validation.
10. `--json` output on every subcommand is stable, schema-validated, and free of ANSI escapes.
11. Secrets hygiene: snippets are truncated to 120 chars and passed through a secret redactor; a fixture containing an API key must render as `[redacted]`. No card content is transmitted anywhere.
12. Rendering degrades cleanly: `NO_COLOR`/non-UTF8 terminals fall back to ASCII box characters with identical information content; width adapts to 80 columns minimum.
