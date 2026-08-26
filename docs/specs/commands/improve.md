# `/improve` — Command Spec

Status: draft (MVP scope) · Owner: dsh-bridge commands track · Surface: `/bridge-improve`

## Purpose

`/review` asks "is this code correct?". `/improve` asks the opposite question:
**what can be deleted?**

It runs an adversarial over-engineering audit over a file, a directory, or the
working-tree diff, and returns findings ranked by *deletion value*: how much
complexity disappears if the finding is acted on. The rubric is the ponytail
discipline from CHARTER §Non-Negotiable Principles 3 — shortest correct
implementation, no speculative features, no premature abstraction, delete
before add.

The command is a structural auditor, not a linter and not a rewriter. It reads
files, measures shape, and prints a ledger. It never edits code.

Non-goals (MVP): auto-applying deletions, cross-file dead-export analysis
(needs a resolver; deliberately deferred), type-aware inference, whole-repo
recursion without a path, language support beyond brace-delimited sources.

## User story

> Before opening a PR I run `/improve --diff`. I get eight lines. The top one
> says the config object I added has one caller and can be two arguments. The
> next says a 140-line function should be three. I delete 60 lines and the
> ledger goes quiet.

Supporting stories:

- "Audit this file": `/improve src/commands/install.ts`
- "Audit what I changed": `/improve --diff`
- "Only show what really matters": `/improve --min-value high`

## Inputs

### Invocation

```
/improve [target] [flags]
```

### `target` (positional, optional)

| Form | Meaning | MVP |
| --- | --- | --- |
| `<file path>` | Audit that one file | yes |
| `<directory>` | Audit source files directly inside it (non-recursive) | yes |
| *(omitted)* | Error unless `--diff` is passed | yes |
| `<git ref>` | Audit a historical tree | no (phase 2) |

### Flags

| Flag | Default | Effect |
| --- | --- | --- |
| `--diff` | off | Audit files changed in the working tree (`git diff --name-only HEAD`) |
| `--min-value <level>` | `low` | Hide findings below this deletion value (`high`\|`medium`\|`low`) |
| `--limit <n>` | `12` | Maximum findings rendered; the remainder is summarized as one line |

`--diff` and a positional `target` may be combined: the target then acts as a
path prefix filter over the changed file list.

### Preconditions and failure modes

| Condition | Behavior |
| --- | --- |
| No target and no `--diff` | Error: `/improve needs a path or --diff.` |
| Path does not exist | Error naming the path; no stack trace |
| `--diff` outside a git repo | Error: `/improve --diff needs a git repository.` |
| `--diff` with an empty change set | Info: `No changed files. Pass a path to audit one directly.` |
| Unsupported extension | File is skipped and listed under `Not audited` with the reason |
| Empty or whitespace-only file | Skipped as `empty` |

## Execution model

- Reading is done through injected filesystem functions. No subprocess is
  spawned to read source.
- `--diff` is the **only** path that shells out, and only for
  `git diff --name-only HEAD` plus `git diff --name-only --cached`, both
  read-only. No other git subcommand is permitted; nothing is written.
- Analysis is a pure function of `(path, content)`. Every detector is a text
  measurement, so results are deterministic and testable from fixtures.

## Detectors

Each detector answers "what is here that need not be?" and must produce a
location, the thing to delete or split, and a replacement. A detector that
cannot state a replacement does not fire.

| id | Fires when | Deletion value |
| --- | --- | --- |
| `oversized-file` | File exceeds 300 lines | `medium`, `high` above 600 |
| `long-function` | A function body exceeds 50 lines | `medium`, `high` above 120 |
| `deep-nesting` | Brace nesting reaches depth 5 or more | `medium`, `high` at depth 7 |
| `commented-out-code` | A comment line contains code punctuation (`;`, `{`, `=>`, `) {`) | `high` |
| `comment-ratio` | Comments exceed 40 percent of a file of 40+ lines | `low` |
| `todo-debt` | `TODO`, `FIXME`, `XXX`, or `HACK` marker | `low`, `medium` for `FIXME`/`HACK` |

Rationale for the thresholds: they are the smallest set that catches the four
over-engineering shapes named in the charter (dead code, speculative
abstraction, unused config, premature indirection) using structure alone.
Structure is the honest proxy — a 140-line function *is* an abstraction that
was never made, and commented-out code *is* dead code, with no inference
required. Anything needing a type graph is out of scope by design.

### Ranking

Findings sort by deletion value (`high` > `medium` > `low`), then by estimated
lines removable (descending), then by `file:line`. Ties never reorder between
runs.

## Output discipline

**One line per finding.** No prose paragraphs, no restating the file, no
"consider possibly". The line is:

```
<VALUE>  <file>:<line>  <detector>  <what to cut> -> <replacement>
```

Mockup:

```
### /bridge-improve

Audited 3 files, 812 lines. 6 findings, ~180 lines removable.

| VALUE | LOCATION | DETECTOR | ACTION |
| --- | --- | --- | --- |
| [ HIGH ] | src/lib/plan.ts:214 | commented-out-code | delete 12 commented-out lines -> git history already has them |
| [ HIGH ] | src/lib/plan.ts:61 | long-function | split `buildPlan` (131 lines) -> extract the 3 phases it already names |
| [ MEDIUM ] | src/lib/plan.ts:1 | oversized-file | split file (412 lines) -> move the render half to plan-render.ts |
| [ MEDIUM ] | src/cli.ts:88 | deep-nesting | flatten depth-6 block -> early return on the guard conditions |
| [ LOW ] | src/cli.ts:12 | todo-debt | resolve or delete TODO -> file an issue, drop the comment |
| [ LOW ] | src/lib/plan.ts:1 | comment-ratio | 46 percent comments -> keep the why, delete the restated what |

Not audited: assets/logo.png (unsupported extension), src/empty.ts (empty)

Nothing found is a valid result. Silence means the code is already the shortest correct version.
```

When no finding survives the filter, exactly one line is printed:

```
No findings. Audited 3 files, 812 lines.
```

### `data` payload

```json
{
  "target": { "kind": "path", "value": "src/lib" },
  "audited": [{ "path": "src/lib/plan.ts", "lines": 412 }],
  "skipped": [{ "path": "assets/logo.png", "reason": "unsupported extension" }],
  "findings": [
    {
      "detector": "long-function",
      "value": "high",
      "path": "src/lib/plan.ts",
      "line": 61,
      "cut": "split `buildPlan` (131 lines)",
      "replacement": "extract the 3 phases it already names",
      "removableLines": 131
    }
  ],
  "totals": { "files": 3, "lines": 812, "findings": 6, "removableLines": 180 }
}
```

## Acceptance criteria

1. `/improve <file>` audits that file and renders the ledger with one line per
   finding.
2. `/improve <dir>` audits supported files directly inside the directory and
   skips the rest with a stated reason.
3. `/improve` with neither a path nor `--diff` errors with the documented
   message and exits cleanly.
4. `--diff` invokes only `git diff --name-only` forms, and no other command.
5. Every finding carries value, `file:line`, detector id, a cut, and a
   replacement; a finding missing any of these is never emitted.
6. Findings are ordered by value, then removable lines, then location; two runs
   over the same input produce byte-identical output.
7. `--min-value high` hides medium and low findings and the header counts
   reflect the filter.
8. `--limit n` renders at most `n` findings and summarizes the rest in one line.
9. A clean fixture with no over-engineering produces the single `No findings.`
   line (false-positive guard).
10. A fixture with each detector's trigger fires exactly that detector.
11. Missing paths, empty files, and unsupported extensions produce messages,
    not exceptions.
12. Output contains no emoji and is ASCII only.

## Phase 2 (out of MVP scope)

- Cross-file dead-export and unused-dependency detection with a real resolver.
- `--fix` that applies the mechanical deletions (commented-out code, dead
  TODOs) behind an explicit confirmation.
- Duplication detection across files.
- Non-brace languages (Python indentation model).
