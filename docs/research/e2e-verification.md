# End-to-end verification: all 17 `/bridge-*` commands in a live DSH runtime

**Verdict: all 17 commands pass.** 42 invocations executed against the real
`CommandRuntime` inside a booted harness. Every one returned a well-formed
result, rendered valid markdown, and exited without throwing. Four bugs were
found and fixed; the unit suite stayed green at 252/252 throughout.

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (`/tmp/dsh-live`) |
| Node | v26.0.0 |
| Profile | `web`, plugin mounted via `--patch` overlay |
| Session cwd | `packages/dsh-bridge` (a real git repo, deliberately not the repo root) |
| Commands registered | 21 (our 17 plus the four in-box) |
| Invocations | 42 across four runs |
| Date | 2026-08-26 |

## 1. How the commands were invoked

The harness CLI has no one-shot command mode. `dsh --profile headless "task"`
sends a *prompt* to a model, not a slash command, and needs credentials. The
web app dispatches slash commands only over an authenticated UI socket. So
invocation went through the same path the live-mount report used, widened into
a full driver: a throwaway ESM probe plugin mounted next to ours, which resolves
each definition through `CommandRuntime.find()` and calls its `handler` with a
real `CommandInvocation`.

```
/tmp/dsh-e2e/probe/index.mjs   driver: (command, rawInput) cases -> results.json
/tmp/dsh-e2e/patch.yml         overlay mounting dsh-bridge + the driver
```

```sh
cd packages/dsh-bridge
DSH_HOME=/tmp/dsh-live/.dsh /tmp/dsh-live/node_modules/.bin/dsh \
  --profile web --patch /tmp/dsh-e2e/patch.yml
```

The driver waits 9 seconds before reading the registry: plugin load is
concurrent and an immediate read sees a partial tree.

What this path covers: registration, hint validation, argument splitting in
`src/index.ts parseArgs`, the full command body, real filesystem and git access,
and markdown rendering. What it does not cover is `CommandRuntime.execute()`,
which additionally appends `command/run` and `command/done` session events and
needs a real `Agent`. That remains the one untested seam, carried over from the
live-mount report's item 4.

Running from `packages/dsh-bridge` rather than the repo root was deliberate. It
is the ordinary case for a user in a monorepo, and it is what exposed bug 3.

## 2. Per-command results

`success` and `error` are both handler-level passes: `error` is the documented
result kind for invalid user input, and returning it is correct behavior. A
failure would be a thrown exception, a `NOT_FOUND`, or malformed output.

| # | Command | Invocation | Result | Output excerpt | Notes |
|---|---|---|---|---|---|
| 1 | `/bridge-help` | (bare) | pass | `### dsh-bridge commands` + 5 grouped tables | Live-generated from the registry table |
| 2 | `/bridge-help` | `bridge-trust` | pass | full directory | Detail cards are documented as not shipped (help.ts:8-12); renders the directory instead of erroring |
| 3 | `/bridge-connect` | (bare) | pass | 11-row provider table, `opencode … sk-S…wFlQ` | Secrets masked as specified |
| 4 | `/bridge-connect` | `test anthropic` | pass | `### /connect test - anthropic` (155 ms) | Graceful degradation with no credential present; no provider call succeeded and none was faked |
| 5 | `/bridge-connect` | `test nosuchprovider` | pass (`kind: error`) | `unknown provider 'nosuchprovider' (expected one of anthropic, …)` | Correct rejection with the valid set |
| 6 | `/bridge-doctor` | (bare) | pass | 4 checks, 2 green 2 yellow | Yellow rows are accurate for a scratch `DSH_HOME` |
| 7 | `/bridge-doctor` | `--net --probe` | pass | same table | Flags parsed, no network performed |
| 8 | `/bridge-trust` | (bare) | pass | usage block | |
| 9 | `/bridge-trust` | `list` | pass | `### Reviewed plugins` table | 17 cards from the committed catalog |
| 10 | `/bridge-trust` | `scan src/lib` | pass | grade A, 0 findings, rules digest `9cc04224b1dc7e81` | Real scanner subprocess, 95 ms |
| 11 | `/bridge-trust` | `modlens` | pass | `### Trust Report Card: @liustack/modlens` | |
| 12 | `/bridge-trust` | `some-unreviewed-plugin` | pass | report card, no grade invented | Spec criterion 3 holds live |
| 13 | `/bridge-model` | (bare) | pass | `unavailable — no model-route config was injected` | Honest degradation; no route service is mounted |
| 14 | `/bridge-model` | `list` | pass | same | |
| 15 | `/bridge-status` | (bare) | pass | ASCII status card, `PLUGINS: 17 reviewed, 17 fresh, 0 stale` | Registered with no input hint, as required |
| 16 | `/bridge-browse` | (bare) | pass | `2189 entries | page 1/219` | 35 ms first load, then cached |
| 17 | `/bridge-browse` | `find git` | pass | `find "git" - 198 matches | page 1/20` | **Was broken before fix 1** |
| 18 | `/bridge-browse` | `memory` | pass | `category=memory - 111 entries | page 1/12` | |
| 19 | `/bridge-browse` | `memory next` | pass | `page 2/12` | Two-token form; **was broken before fix 1** |
| 20 | `/bridge-browse` | `nosuchcategory` | pass | `Unknown category` + the 21 valid slugs | |
| 21 | `/bridge-install` | (bare) | pass | usage with three examples | |
| 22 | `/bridge-install` | `modlens --report` | pass | `### /bridge-install modlens` trust summary | |
| 23 | `/bridge-install` | `github:owner/repo` | pass | off-catalog unverified path | Emits a command, never runs one |
| 24 | `/bridge-memory` | `show` | pass | `### /bridge-memory show` | |
| 25 | `/bridge-memory` | `add <note>` | pass | `Added under "## Notes 2026-08-26"` | Only write-side command exercised; wrote to `~/.dsh-bridge/memory.md` |
| 26 | `/bridge-memory` | `import-from .` | pass | 4-row source table, `Nothing to import` | Graceful when no CLAUDE.md exists |
| 27 | `/bridge-compact` | (bare) | pass | `no compaction hook … run /compact instead` | Correct degradation with no host hook |
| 28 | `/bridge-compact` | `status` | pass | `### /bridge-compact status` | |
| 29 | `/bridge-resume` | (bare) | pass | `### /bridge-resume` | |
| 30 | `/bridge-resume` | `--all --subagents` | pass | same | Both flags parsed |
| 31 | `/bridge-init` | (bare) | pass | scan + AGENTS.md draft in a fenced block | Preview only; `--write` gates the write (init.ts:335) |
| 32 | `/bridge-mcp` | `list` | pass | `### /bridge-mcp list` | |
| 33 | `/bridge-mcp` | `test nosuchserver` | pass | 6-phase handshake checklist | Spawns nothing and reaches no network, exactly as mcp.ts:539 states |
| 34 | `/bridge-mcp` | `import-from claude` | pass | source table + per-server IMPORT decisions | Read-only against the real `~/.claude.json` |
| 35 | `/bridge-suggest` | (bare) | pass | `### /bridge-suggest` | |
| 36 | `/bridge-suggest` | `testing` | pass | closest plugin, scope triage, scaffold checklist | |
| 37 | `/bridge-review` | (bare) | pass | `Target: worktree | 3 files +25 -8` + review prompt | Real `git diff` against the working tree |
| 38 | `/bridge-improve` | `--diff` | pass | `Audited 2 files, 1309 lines. 6 findings` | **Was broken before fixes 2 and 3** |
| 39 | `/bridge-improve` | `--diff src/commands` | pass | filtered to 2 files | **Was broken before fix 4** |
| 40 | `/bridge-improve` | `src/lib --limit 3` | pass | 3 rows + `2 more findings hidden by --limit` | |
| 41 | `/bridge-refactor` | (bare) | pass | usage line | |
| 42 | `/bridge-refactor` | `src/lib/paths.ts` | pass | inventory + 5 proposed steps, `PLAN ONLY, nothing written` | |

Coverage by command: all 17 invoked, 15 of them with at least two distinct
argument forms.

## 3. Bugs found and fixed

All four are argument-plumbing or path-resolution defects that no unit test
could catch, because every test constructs the argument record by hand and
so encodes the same assumption the command makes. They only appear when the
real `parseArgs` in `src/index.ts` splits a real command line.

### Bug 1: `/bridge-browse` dropped every argument after the first word

`src/commands/browse.ts:579` read tokens from `args["_"]` alone. The entry
splitter puts the first positional in `_` and the remainder in `rest`
(`src/index.ts:127-141`), so `find git` arrived as `{_: "find", rest: "git"}`.
`browse` saw the single token `find`, treated the query as empty, and returned
the usage block. Every two-word form was affected: `find <query>`,
`<category> next`, `<category> <page>` — which is most of the command's
documented surface.

Fixed by rejoining both keys before tokenizing. Tests that pass the whole
phrase in `_` still pass, since `rest` is then absent.

Evidence: run 1 `bridge-browse find git` returned usage; run 2 returned
`find "git" - 198 matches | page 1/20`.

### Bug 2: `/bridge-improve --diff` ran git in `$HOME`

`src/commands/improve.ts:555` passed `ctx.paths.home` as the cwd for
`git diff`. `paths.home` is the credential and config root, never the
repository under review. On any machine whose `$HOME` is not itself a git repo,
`--diff` failed outright with "needs a git repository"; where `$HOME` happens to
be a repo, it would audit the wrong one.

Fixed to `(ctx as ImproveContext).cwd ?? process.cwd()`, the same shape
`resume.ts:241` already uses.

### Bug 3: `/bridge-improve --diff` could not read any changed file

`git diff --name-only` prints paths relative to the repository root. The reader
resolved them against the process cwd, so running from `packages/dsh-bridge`
(the ordinary monorepo case) reported every changed file as `unreadable`:

```
No findings. Audited 0 files, 0 lines.
Not audited: packages/dsh-bridge/src/commands/browse.ts (unreadable), …
```

The command reported "no findings" while having read nothing — a silent false
negative, the worst failure mode for an audit command.

Fixed at `src/commands/improve.ts:532-552` by anchoring each name to
`git rev-parse --show-toplevel`. The `--diff <path>` prefix filter now matches
absolute and relative forms so in-memory test deps keep working.

### Bug 4: `/bridge-improve --diff <path>` disabled the diff flag

`parseImproveArgs` recognized `--diff` only when its value was `""` or `"true"`
(`src/commands/improve.ts:403`, pre-fix). But `parseArgs` assigns the token
after a flag as that flag's value, so `--diff src/commands` arrives as
`{diff: "src/commands"}` with no positional at all. `diff` evaluated false and
no target existed, so the documented form failed with the "needs a path or
--diff" usage error.

Fixed to treat any value other than an explicit `"false"` as the flag being set,
and a non-boolean value as the path filter.

## 4. Non-bugs worth recording

- `/bridge-help <command>` renders the full directory rather than a detail
  card. This is stated as out of scope in `help.ts:8-12`, and the reason given
  there ("blocked on positional args reaching command runners") is now stale:
  positionals do reach runners via `_`/`rest`. The detail card is buildable
  whenever it is wanted. Not changed here, as it is a feature, not a defect.
- `/bridge-model` reports `unavailable` for every form. Correct: no model-route
  service is mounted in this profile, and the command says so instead of
  inventing routes.
- `/bridge-doctor` reports two yellow rows against the scratch `DSH_HOME`.
  Accurate: the config uses profile `default` while the installed profile
  directory is `web`.
- `/bridge-improve --diff` prints absolute paths in the location column, while
  the path form prints the relative path the user typed. Cosmetically
  inconsistent, but a correctness-neutral consequence of fix 3; left alone
  rather than adding a display-relativization path with no test behind it.

## 5. Files changed

- `packages/dsh-bridge/src/commands/browse.ts:579-587` — join `_` and `rest`
  before tokenizing (bug 1).
- `packages/dsh-bridge/src/commands/improve.ts:396-415` — `--diff <path>`
  parsing (bug 4).
- `packages/dsh-bridge/src/commands/improve.ts:416-425` — prefix filter matches
  absolute and relative names (bug 3).
- `packages/dsh-bridge/src/commands/improve.ts:532-552` — anchor diff names to
  the git toplevel (bug 3).
- `packages/dsh-bridge/src/commands/improve.ts:546-565` — audit the session cwd,
  not `$HOME` (bug 2).

`src/index.ts` and `src/lib/registry.ts` were read but not modified.

## 6. Suite state

`cd packages/dsh-bridge && npm test`: **252 tests, 252 pass, 0 fail**, before
and after every fix.

A gap worth naming: the suite passed at full green while four of these command
forms were broken in the product. Each unit test hands the command a
hand-written argument record, which reproduces the command's own assumption
rather than checking it against the real splitter. A test that drives
`parseArgs` from a raw command line and asserts on the result would have caught
bugs 1 and 4 statically. That test does not exist and is the highest-value
follow-up from this exercise.
