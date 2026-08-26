# `/review` — Command Spec

Status: draft (MVP scope) · Owner: dsh-bridge commands track · Surface: `/bridge:review` (aliased `/review` when no conflict)

## Purpose

Give DSH users the code-review reflex they already have from Claude Code (`/review`) and Codex (`/codex-review`): point the agent at a change set, get back structured, severity-ranked findings with concrete locations and suggested fixes — not a wall of prose.

Secondary purpose: showcase dsh-bridge's cross-model seam. A review can be double-checked by a *different* provider route, which is the same adversarial-review principle the trust layer uses on plugins (CHARTER §"Working Model").

Non-goals (MVP): rewriting code automatically, posting review comments to GitHub, CI integration, whole-repo audits.

## User story

> As a developer mid-feature in a DSH session, I run `/review` before committing. Within one turn I see: 2 blocking issues with file:line, 3 suggestions, and nothing else. I fix the blockers, run `/review --second-opinion`, and a second model confirms the fix and flags one thing the first model missed.

Supporting stories:

- "Review just this file": `/review src/auth/session.ts`
- "Review what I'm about to commit": `/review --staged`
- "Review this branch against main": `/review --base main`
- Phase 2: "Review this PR": `/review https://github.com/owner/repo/pull/42`

## Inputs

### Invocation

```
/review [target] [flags]
```

### `target` (positional, optional)

| Form | Meaning | MVP |
| --- | --- | --- |
| *(omitted)* | Working-tree diff vs `HEAD` (unstaged + staged) | ✅ |
| `<path>` | Restrict diff to that file or directory | ✅ |
| `--staged` | Staged changes only (`git diff --cached`) | ✅ |
| `--base <ref>` | Diff current `HEAD` against `<ref>` (e.g. `main`) | ✅ |
| `<PR url>` or `#42` | GitHub pull request | ⏳ Phase 2 |
| `<commit sha>` | Single commit diff | ⏳ Phase 2 |

### Flags

| Flag | Default | Effect |
| --- | --- | --- |
| `--second-opinion` / `-2` | off | Run cross-model double-check (see below) |
| `--severity <min>` | `nit` | Hide findings below this severity (`blocker`\|`major`\|`minor`\|`nit`) |
| `--focus <area>` | none | Bias rubric: `security`, `perf`, `tests`, `style`, `api` |
| `--json` | off | Emit machine-readable findings instead of rendered mockup |

### Implicit context gathered

- Diff hunks with ~20 lines of surrounding context per hunk.
- Repo conventions: `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` if present, plus lint/test config filenames.
- Language detection from file extensions, to select rubric weights.

### Preconditions & failure modes

| Condition | Behavior |
| --- | --- |
| Not a git repo | Error: `/review needs a git repository. Pass a path or run inside one.` |
| Empty diff | Info: `No changes to review. Try --base main or --staged.` |
| Diff > 1500 changed lines | Warn, review the largest-signal files first, list skipped files explicitly |
| Binary / lockfile / generated files | Skipped, reported under "Not reviewed" |
| Secrets detected in diff | Reported as `blocker` and **never echoed** — location only (CHARTER: never print secrets) |

## Review rubric

Findings are produced against these axes, in priority order. Each finding must cite `file:line` evidence — an uncited finding is dropped, matching the charter's evidence rule.

1. **Correctness** — logic errors, off-by-one, wrong branch, unhandled `null`/`undefined`, broken invariants, misuse of an API's contract.
2. **Security** — injection, unvalidated input crossing a trust boundary, credential/secret handling, unsafe dynamic execution (`eval`, `new Function`, shelling out with interpolated input), path traversal, permissive defaults.
3. **Error handling & resilience** — swallowed errors, missing timeouts/retries on I/O, resource leaks, unawaited promises.
4. **Tests** — changed behavior without a matching test, tests asserting nothing, removed coverage.
5. **API & compatibility** — breaking public signature changes, undocumented behavior change, migration missing.
6. **Performance** — accidental O(n²), work inside a hot loop, N+1 I/O, unbounded memory.
7. **Readability & conventions** — dead code, misleading names, duplication, drift from the repo's stated conventions.

### Severity ladder

| Severity | Definition | Bar |
| --- | --- | --- |
| `blocker` | Would break users, lose data, or leak credentials. Do not merge. | Reviewer can name the failure scenario |
| `major` | Real bug or risk under plausible conditions | Concrete trigger path |
| `minor` | Correct but fragile, untested, or inconsistent | Clear improvement |
| `nit` | Style/taste; author may ignore | Never blocks |

### Rules the reviewer must follow

- No findings on unchanged lines unless the change makes them newly wrong (then say why).
- No speculative "consider maybe possibly" findings — if it can't be justified, drop it.
- At most one finding per root cause; group repeats as "3 more occurrences".
- Praise is allowed but capped at one line total.

## Output mockup

```
  /review  ·  working tree vs HEAD  ·  7 files, +214 −38

  ▌ 2 blockers · 1 major · 3 minor · 2 nits

  ─ BLOCKER ────────────────────────────────────────────────
  src/auth/session.ts:88  ·  security
  Session token is compared with `===`, allowing a timing oracle.
  Why: attacker-controlled input compared byte-wise against a secret
       leaks length and prefix over repeated requests.
  Fix:
      - if (provided === stored) {
      + if (timingSafeEqual(Buffer.from(provided), Buffer.from(stored))) {

  ─ BLOCKER ────────────────────────────────────────────────
  src/plugins/install.ts:142  ·  correctness
  `await` missing on `writeManifest()`; install reports success before
  the manifest exists, so a crash mid-write leaves a half-installed plugin.
  Fix: `await writeManifest(target, manifest)`

  ─ MAJOR ──────────────────────────────────────────────────
  src/routes/models.ts:31  ·  error handling
  fetch() has no timeout; a hung provider stalls the session loop forever.
  Fix: pass an AbortSignal with the configured request timeout.

  ─ MINOR (3) ──────────────────────────────────────────────
  src/routes/models.ts:57   tests    New fallback path has no test case.
  src/util/paths.ts:12      style    `p2` shadows outer `p2`; rename.
  src/util/paths.ts:44      perf     join() inside loop; hoist prefix.

  ─ NITS (2) ───────────────────────────────────────────────  (hidden, --severity nit to show)

  Not reviewed: pnpm-lock.yaml (lockfile), assets/hero.png (binary)

  ✔ Nice: the new install flow's consent prompt is genuinely clear.

  Next: /review --second-opinion   ·   /review --focus tests
```

### `--json` shape

```json
{
  "target": { "kind": "worktree", "base": "HEAD", "files": 7, "added": 214, "removed": 38 },
  "findings": [
    {
      "id": "f1",
      "severity": "blocker",
      "axis": "security",
      "file": "src/auth/session.ts",
      "line": 88,
      "endLine": 88,
      "title": "Timing-unsafe token comparison",
      "why": "Byte-wise comparison against a secret leaks prefix information.",
      "fix": { "kind": "patch", "diff": "- if (provided === stored)\n+ if (timingSafeEqual(...))" },
      "confidence": 0.9,
      "source": "primary"
    }
  ],
  "skipped": [{ "file": "pnpm-lock.yaml", "reason": "lockfile" }],
  "secondOpinion": null
}
```

## Cross-model toggle design

**Intent:** the reviewer that checks the review should not share the first reviewer's blind spots. Different provider route ⇒ different failure modes.

### Route selection

1. Read configured routes from the bridge's connector config (the `/login` flow's output).
2. Pick the highest-priority route whose **provider differs** from the primary review model.
3. If only one provider is configured, prefer a different *model family* on that provider; if that's also unavailable, disable the toggle and say so plainly:
   `Second opinion unavailable: only one provider route configured. Run /bridge:login to add one.`
4. Never silently fall back to the same model — a fake second opinion is worse than none.

### Protocol

- The second model receives the **same diff and rubric**, plus the primary findings, and is asked to do three things:
  - **Confirm / dispute** each primary finding, with a one-line reason.
  - **Add** findings the primary missed.
  - **Never** rewrite severities without stating why.
- The second pass is *blind to the primary's prose*: it gets only `{file, line, severity, title}` for each primary finding, not the reasoning, to reduce anchoring.

### Merge rules

| Case | Result |
| --- | --- |
| Both agree | Finding shown, marked `✓✓ confirmed` |
| Only primary | Shown, marked `? unconfirmed` |
| Only secondary | Shown, marked `+ second opinion` |
| Disputed | Shown at **lower** of the two severities, with both one-line rationales, marked `⚠ disputed` |

Disagreement is surfaced, never averaged away. The user decides.

### Cost & consent

- Off by default; it is a second full-context call.
- Rendered footer states which routes ran: `primary: deepseek-chat · second: claude-opus-5`.
- Config key `bridge.review.secondOpinion: always | never | ask` (default `never`).

## Acceptance criteria

Functional:

1. `/review` in a dirty git repo produces findings from the working-tree diff without any additional arguments.
2. `/review <path>` restricts findings to that path; `/review --staged` and `/review --base <ref>` select the corresponding diff.
3. Every rendered finding includes severity, `file:line`, a one-line "why", and a suggested fix (patch or instruction).
4. Findings are grouped and ordered by severity, with counts in the header.
5. Lockfiles, binaries, and generated files are skipped and listed under "Not reviewed".
6. `--severity major` hides `minor`/`nit` findings and the header count reflects the filter.
7. `--json` output validates against the documented shape and contains the same findings as the rendered view.
8. Empty diff, non-git directory, and oversized diff each produce the specified message rather than a stack trace or a hallucinated review.

Cross-model:

9. `--second-opinion` routes the second pass to a different provider than the primary, verified by the footer.
10. With only one provider configured, `--second-opinion` refuses with the documented message and exits cleanly.
11. Confirmed / unconfirmed / second-only / disputed states each render with their documented marker.
12. A disputed finding renders at the lower severity and shows both rationales.

Quality:

13. On a seeded fixture repo with 5 known defects (one each: async bug, timing-unsafe compare, missing timeout, untested branch, breaking signature change), MVP catches ≥4, including both security/correctness blockers.
14. On a fixture with zero defects, the command reports no `blocker`/`major` findings (false-positive guard).
15. Secrets present in the diff are reported by location only; the secret value never appears in output or logs.
16. A typical review (≤400 changed lines) renders in a single turn with no follow-up questions to the user.

Docs:

17. `/help` lists `/review` with a one-line description and the `--second-opinion` flag.
18. This spec's Phase-2 items (GitHub PR, commit sha) are explicitly marked "not implemented" in user-facing help rather than failing obscurely.

## Phase 2 (out of MVP scope)

- GitHub PR targets via `gh` CLI (blocked today: charter notes `gh` auth is broken on the dev machine).
- Posting findings as PR review comments.
- Incremental re-review ("what changed since my last review").
- Persisted review history per session for `/resume`.
