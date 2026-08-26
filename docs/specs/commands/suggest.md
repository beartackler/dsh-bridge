# `/bridge:suggest` — the "not found → build it" flow

> Status: spec (draft 1) · Owner: dsh-bridge commands track · Depends on: `/bridge:browse`, `/bridge:find`, trust grading pipeline

## Purpose

`/bridge:browse` and `/bridge:find` answer "does this exist?". They frequently answer **no** — the DSH plugin ecosystem is young, English-language coverage is thin, and many hits fail the trust bar (see `docs/research/ecosystem-audit.md`). A dead end is the single most common moment a new user gives up.

`/bridge:suggest <idea>` converts that dead end into a productive next step. It:

1. Re-checks the catalog with **intent-level** matching (not just keyword), including near-misses and partial-coverage plugins.
2. If something close exists, it says so plainly, with an honest gap analysis ("this does 80% of what you asked; the missing 20% is X").
3. If nothing suitable exists, it **scaffolds a new plugin project** — template, guided implementation plan, and safety rules pre-baked so the result can pass a grade **A** trust review on first submission.
4. Gives realistic scope advice, including the option "don't build this" when a skill, a config change, or an existing tool already solves it.

Non-goals: `/bridge:suggest` does not write the plugin's business logic for you, does not publish, does not install anything, and does not make network calls beyond the catalog fetch already performed by `/bridge:browse`.

## User story

> **Priya**, a Claude Code user two days into DSH, wants her agent to open a PR review checklist from a Linear ticket.
>
> ```
> /bridge:find linear
> ```
> → 1 result: `dsh-linear-sync` (grade **D** — unreviewed, 1 star, ships `child_process` in a lifecycle hook). Not recommended.
>
> ```
> /bridge:suggest pull a Linear ticket and turn it into a PR review checklist
> ```
>
> Bridge responds:
> - **Closest existing:** `dsh-linear-sync` covers ticket fetch but fails the trust bar; evidence linked to `docs/audits/dsh-linear-sync.md:41`.
> - **Scope read:** this is a *tool + skill*, not a full plugin surface. ~120 lines. One HTTP host (`api.linear.app`). No credential storage needed beyond an env-var read.
> - **Recommendation:** scaffold it. Estimated 30–45 min with the agent.
>
> She accepts. Bridge writes `~/dsh-plugins/dsh-linear-checklist/` containing a working skeleton, a `PLAN.md` with six checked-off-as-you-go steps, `SECURITY.md` with the egress allowlist already filled in, and a passing `bun test`. Her first `dsh plugin --profile web add ./dsh-linear-checklist` works. Her first trust self-check reports grade **A**.

The success condition is that Priya never has to read DSH plugin internals to get from "no result" to "running code".

## Decision tree

```
/bridge:suggest <idea>
        │
        ▼
┌───────────────────────────────────────────┐
│ 1. Normalize intent                       │
│    idea → capability vector               │
│    (verbs, data sources, surfaces, egress)│
└───────────────────┬───────────────────────┘
                    ▼
┌───────────────────────────────────────────┐
│ 2. Re-query catalog (intent match)        │
│    exact · semantic · capability-overlap  │
└───────────────────┬───────────────────────┘
                    ▼
             ┌──────┴───────┐
             │ any matches? │
             └──────┬───────┘
          no │              │ yes
             │              ▼
             │   ┌──────────────────────────┐
             │   │ 3. Grade the best match  │
             │   └──────────┬───────────────┘
             │              ▼
             │      ┌───────┴────────┐
             │      │ grade >= B AND │
             │      │ coverage >=80% │
             │      └───────┬────────┘
             │        yes │      │ no
             │            ▼      │
             │   ┌──────────────────┐
             │   │ POINT TO IT      │
             │   │ → install hint   │
             │   │ → gap note       │
             │   └──────────────────┘
             │                   │
             │      ┌────────────┴────────────┐
             │      │ grade < B but coverage  │
             │      │ high → FORK PATH:       │
             │      │ scaffold + cite the     │
             │      │ upstream license, port  │
             │      │ ideas not code blindly  │
             │      └────────────┬────────────┘
             ▼                   ▼
┌───────────────────────────────────────────┐
│ 4. Scope triage — cheapest thing that works│
└───────────────────┬───────────────────────┘
                    ▼
   ┌────────────┬───────────┬────────────┬─────────────┐
   │ config     │ skill     │ tool(+skill)│ full plugin │
   │ change     │ (prompt)  │ single seam │ multi-seam  │
   │ 0 files    │ 1 file    │ 3-6 files   │ 8+ files    │
   └─────┬──────┴─────┬─────┴──────┬──────┴──────┬──────┘
         │            │            │             │
         ▼            ▼            ▼             ▼
   "don't build   scaffold     scaffold     scaffold
    it" + how     minimal      standard     standard
                                             + warn on
                                             scope creep
                    │
                    ▼
┌───────────────────────────────────────────┐
│ 5. Confirm with user (explicit y/N)       │
│    show: target dir, files, egress hosts  │
└───────────────────┬───────────────────────┘
                    ▼
┌───────────────────────────────────────────┐
│ 6. Write scaffold · run tests · print     │
│    handoff to plugin-author guide         │
└───────────────────────────────────────────┘
```

Escape hatches: `--no-scaffold` stops after step 4 and prints the plan only; `--force-scaffold` skips step 3's "point to it" branch when the user has already rejected the existing plugin.

## Scaffold contents

Written to `<cwd>/<slug>/` by default, or `--dir <path>`. Nothing outside that directory is touched. Existing directories are never overwritten — the command aborts and suggests a new slug.

| Path | Purpose |
| --- | --- |
| `package.json` | Name, MIT license, `peerDependencies` on `@deepseek-ai/cordis` + `@deepseek-ai/schemastery` (never regular deps — proven by dsh-ponytail), `type: module`, test script. |
| `src/index.ts` | Cordis plugin entry: typed `Config` schema via schemastery, `apply(ctx, config)`, explicit disposal of every listener/timer it registers. |
| `src/<capability>.ts` | One file per capability seam identified in step 1. Contains a `TODO(agent)` block per plan step, not empty stubs. |
| `test/<capability>.test.ts` | Bun tests that fail meaningfully on day one — the plan's acceptance checks encoded as assertions. |
| `PLAN.md` | The guided implementation plan (below). |
| `SECURITY.md` | Pre-filled: declared egress hosts, declared filesystem scope, credential policy, "no dynamic code execution" statement, disclosure contact. Expected by the trust pipeline. |
| `README.md` | English-first, install command, config table generated from the schemastery schema, one honest limitations section. |
| `LICENSE` | MIT. If forking, additionally `NOTICE` with upstream attribution. |
| `.github/workflows/ci.yml` | Typecheck + test + `bridge trust selfcheck` on push. No publish step. |
| `.gitignore` | Standard; explicitly ignores `.env*` and `*.pem`. |

### `PLAN.md` shape

Generated, not boilerplate. Each step is derived from the capability vector and is independently verifiable:

```markdown
## Step 3 — Fetch the ticket
Goal: `fetchTicket(id)` returns a typed Ticket or throws a typed error.
Touches: src/linear.ts
Egress: POST https://api.linear.app/graphql  (declared in SECURITY.md)
Done when: `bun test test/linear.test.ts -t "fetchTicket"` passes against the recorded fixture.
Trust note: no token is logged; errors redact the Authorization header.
```

Steps always end with a final "Step N — self-check" that runs the trust grader locally and requires grade A before the plugin is considered done.

## Safety guardrails

These are baked into the template so that a grade-A result is the *default outcome*, not an achievement.

**Baked into generated code**
- **No dynamic execution.** No `eval`, `new Function`, `vm`, `child_process`, or dynamic `import()` of non-literal specifiers. The template's ESLint config and the CI self-check both fail on these.
- **Declared egress only.** All network access routes through a single `src/http.ts` helper that asserts the host is in the `SECURITY.md` allowlist. Adding a host requires editing the allowlist, which the trust grader diffs.
- **No credential reads outside the declared paths.** Template reads config values injected by Cordis; it never walks `~/.claude`, `~/.codex`, `~/.ssh`, or `process.env` wholesale. If a token is needed, it is a schemastery config field marked secret and redacted in all logging paths.
- **No lifecycle surprises.** `apply()` registers nothing at import time; every subscription is disposed. No `postinstall` script in `package.json`.
- **Redaction by default.** A `redact()` helper wraps logger calls; tests assert secrets never appear in output.

**Baked into the process**
- Step 5 requires explicit confirmation showing the exact file list and egress hosts before anything is written.
- Scaffolding writes only under the target directory. No global config, no `~/.dsh` mutation, no install.
- Fork path: if the scaffold is inspired by an existing plugin, the template requires filling `NOTICE` with upstream license and attribution before CI passes. License hygiene is a charter non-negotiable.
- The command never suggests installing an ungraded plugin. If the only match is grade D/F, the branch is fork-or-build, never "install with a warning" — that path belongs to `/bridge:install --i-accept-the-risk`.

## Handoff to author guide

When the scaffold lands, `/bridge:suggest` prints a short handoff block — the only thing standing between the user and their first commit:

```
✓ Scaffolded dsh-linear-checklist (9 files, 0 egress hosts until Step 3)

  Next:
    cd dsh-linear-checklist && bun install && bun test    # 3 failing by design
    open PLAN.md                                          # 6 steps, start at 1
    /bridge:author                                        # agent-guided walkthrough

  When done:
    /bridge:trust selfcheck ./dsh-linear-checklist        # target: grade A
    dsh plugin --profile web add ./dsh-linear-checklist   # local install
```

Deeper material lives in the plugin author guide (`docs/guides/plugin-author.md`), which `/bridge:suggest` links but does not duplicate. The division of labour: this command decides *whether and what* to build and lays the safe foundation; the author guide explains *how* Cordis seams work. `/bridge:author` is the interactive counterpart that walks `PLAN.md` step by step and can be resumed later, since the plan lives on disk rather than in chat.

## Acceptance criteria

1. **Given** a query with a grade ≥ B match covering ≥ 80% of the capability vector, **when** `/bridge:suggest` runs, **then** it recommends that plugin with an install hint and a named gap, and does not scaffold.
2. **Given** a query whose only matches are grade < B, **then** the output offers fork-or-build and never offers a plain install.
3. **Given** a query solvable by configuration or a single skill, **then** the command says so and recommends against building a plugin, showing the cheaper alternative concretely.
4. **Given** scaffolding is accepted, **then** exactly the declared file list is written under the target directory and nothing outside it is modified; a pre-existing directory causes an abort with a suggested alternative slug.
5. **Given** a freshly generated scaffold, **then** `bun install && bun test` runs, tests fail only in the ways `PLAN.md` documents as intentional, and typecheck passes.
6. **Given** a freshly generated scaffold with `PLAN.md` unimplemented, **then** `bridge trust selfcheck` reports no findings in the static-analysis categories (dynamic eval, undeclared egress, credential access, lifecycle hooks, obfuscation).
7. **Given** the completed reference implementation of a scaffold, **then** the trust grader awards grade **A** without hand-editing the security policy.
8. **Given** any run, **then** no secret value appears in command output, and no network request is made to a host not already contacted by the catalog fetch.
9. **Given** `--no-scaffold`, **then** the plan and scope advice are printed and zero files are written.
10. **Given** a fork-path scaffold, **then** `NOTICE` exists with upstream attribution and CI fails if it is left as a placeholder.
11. **Every** claim made about an existing plugin cites evidence as `file:line` into `docs/audits/`, per the charter's trust-over-speed principle.
12. **Given** a non-English idea string, **then** the command still works and emits English-first output with i18n-ready message keys.
