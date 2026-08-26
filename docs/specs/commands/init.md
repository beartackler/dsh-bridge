# `/init` — repo onboarding and instruction-file generation

> Command spec for [dsh-bridge](../../../CHARTER.md). Status: **draft**, not yet implemented.
> Familiar-face source: Claude Code `/init`, Codex CLI `/init`, OpenCode, Jcode.
> Ranked #3 (value 5, difficulty S) in [portable-features.md](../../research/portable-features.md).

## Purpose

`/init` makes a repository legible to DeepSeek Harness in one command. It scans the workspace, infers build/test/lint conventions and layout, asks at most three clarifying questions, and writes an `AGENTS.md`-style guide at the project root.

The payoff is immediate and requires no new reading machinery: DSH already loads `AGENTS.md`/`CLAUDE.md` per session through `@deepseek-ai/dsh-agent-instructions`, whose default candidates are exactly `['AGENTS.md', 'CLAUDE.md']` with local overlays `['AGENTS.local.md', 'CLAUDE.local.md']` (`packages/context/agent-instructions/src/config.ts:12-13`). The loader walks from the project root — identified by the default `['.git']` root marker (`src/config.ts:11`) — down to the session cwd, reading `$DSH_HOME/AGENTS.md` first (`packages/context/agent-instructions/README.md`, "Lifecycle"). A file written by `/init` therefore reaches the model on the next session with zero further configuration.

`/init` writes files and asks questions; it never sends repository content anywhere except the user's already-configured model route.

### Non-goals

- Not a project scaffolder: `/init` never creates source, config, or CI files.
- Not a linter or fixer: it records the conventions it finds, and never edits code to match them.
- Not a memory editor: per-user private notes belong in `AGENTS.local.md`, which `/init` only mentions, never writes.
- Not a credential flow: provider setup is `/connect`'s job (see [Handoff to `/connect`](#handoff-to-connect)).

## User story

> A developer who has used Claude Code for a year installs dsh-bridge, opens DSH in an unfamiliar Rust + pnpm monorepo, and types `/init` out of habit.

Expected experience, in order:

1. **Acknowledge instantly.** The command reports what it is doing ("Scanning workspace…") before any model call, so the reflex is rewarded within one frame.
2. **Report the read, not the guess.** A short scan summary lists what was detected and the file each fact came from: `pnpm-workspace.yaml` → pnpm workspaces; `Cargo.toml` → cargo; `.github/workflows/ci.yml` → the commands CI actually runs.
3. **Ask at most three questions**, only where the scan is genuinely ambiguous, each with concrete options drawn from the scan (see [Questions policy](#questions-policy)).
4. **Show the diff before writing.** The proposed `AGENTS.md` is presented for approval; the user can accept, edit, or cancel. Nothing is written on cancel.
5. **Respect what exists.** If `AGENTS.md` or `CLAUDE.md` is already present, `/init` never silently overwrites it; it offers import, merge, or a separate-file path (see [Coordinate-file awareness](#coordinate-file-awareness)).
6. **Offer the next step.** On success, `/init` offers to run `/connect` if no working model route is configured.

Failure modes the story must also cover: no VCS root found, an empty directory, a repository too large to scan within budget, and a read-only filesystem. Each ends with a clear statement of what was not done and why.

## Scan heuristics

The scan is a bounded, read-only pass over the project root. It runs before any model call, and its structured output is the only repository content included in the generation prompt.

### Bounds

| Bound | Value | Reason |
|---|---|---|
| Root selection | nearest ancestor of cwd containing `.git`, else cwd | matches the `projectRootMarkers` default (`agent-instructions/src/config.ts:11`) so the generated file lands where the loader looks |
| Directory traversal depth | 3 levels below root for structure, unlimited for manifest globs | keeps the tree summary readable |
| Files read in full | ≤ 40 | bounds tokens and latency |
| Bytes read per file | ≤ 64 KiB, truncated with a marker | one runaway lockfile must not consume the budget |
| Total scan bytes | ≤ 512 KiB | hard ceiling; on exhaustion the scan reports partial coverage |
| Ignored | `.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, `vendor`, plus every `.gitignore` rule | avoids generated code |
| Never read | `.env*`, `*.pem`, `*.key`, `id_*`, `.credentials*`, `*.p12` | secrets never enter a prompt; their *presence* may be noted by name only |

Scanning uses the filesystem capability (`ctx.fs`) rather than shell globbing, matching how `dsh-agent-instructions` reads instruction files through the optional `ctx.fs` provider (`agent-instructions/README.md`, "Lifecycle"). When no provider is mounted, `/init` fails loud with that reason instead of silently degrading.

### Signals, in priority order

**Tier 1 — authoritative command sources.** CI configuration is preferred over manifests, because CI states the commands that are actually required to pass.

- `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml` → the exact build/test/lint invocations.
- `Makefile`, `justfile`, `Taskfile.yml` → named entry points, with their recipe bodies as evidence.
- An existing `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md` → treated as prior art, not overwritten (see below).

**Tier 2 — ecosystem manifests.** Detect the stack and its declared scripts.

| Marker | Inferred |
|---|---|
| `package.json` + `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` / `bun.lockb` | package manager; `scripts` map becomes candidate commands |
| `pnpm-workspace.yaml`, `workspaces` field, `turbo.json`, `nx.json`, `lerna.json` | monorepo layout; enumerate workspace packages |
| `Cargo.toml` (+ `[workspace]`) | cargo; `cargo build/test/clippy/fmt` |
| `pyproject.toml`, `setup.cfg`, `requirements*.txt`, `uv.lock`, `poetry.lock` | Python toolchain, test runner, formatter |
| `go.mod` | `go build ./...`, `go test ./...`, `golangci-lint` if configured |
| `Gemfile`, `pom.xml`, `build.gradle*`, `*.csproj`, `mix.exs`, `composer.json` | corresponding ecosystem defaults |

**Tier 3 — convention and quality tooling.** `.editorconfig`, `.prettierrc*`, `eslint.config.*`/`.eslintrc*`, `rustfmt.toml`, `ruff.toml`, `.pre-commit-config.yaml`, `tsconfig.json` (strictness, module mode), `.nvmrc` / `engines` / `rust-toolchain.toml` (runtime versions).

**Tier 4 — structure and culture.** Top-level directory names and purposes; test file locations and naming; `docs/`; `LICENSE`; `SECURITY.md`; default branch name; commit-message style sampled from the last 20 subjects (read-only `git log`, no writes).

### Confidence rules

Each derived fact carries a confidence level, and confidence decides who resolves it:

- **Confirmed** — the fact appears verbatim in a Tier 1 or Tier 2 file. Written to the guide with its source path.
- **Inferred** — a single consistent convention across ≥ 3 observations (for example, every test file is `*.spec.ts` under `tests/`). Written, hedged, and eligible to become a question only if it conflicts with another signal.
- **Ambiguous** — two or more mutually exclusive candidates, or a required section with no evidence. Becomes a question, budget permitting; otherwise it is omitted rather than guessed.

A command is never invented. If no test command can be sourced, the Commands section says so explicitly instead of printing a plausible-looking guess.

### Verification

Detected commands are **not executed** by default. `/init` may offer, as an explicit follow-up, to run the detected commands and record which ones succeed; that offer requires the same approval any shell tool call requires and is never implicit in `/init`.

## Generated file template

The output is a single Markdown file, written UTF-8, LF line endings, ending in exactly one trailing newline. The target defaults to `<project-root>/AGENTS.md`.

Section order is fixed so that regeneration produces a reviewable diff. A section with no confirmed content is omitted entirely rather than emitted with filler.

~~~~md
# AGENTS.md

<One-sentence description of what this project is, and its primary language/runtime.>

## Repository layout

```
<dir>/   <purpose, one line each — top-level entries only, ≤ 15 rows>
```

## Commands

```sh
<install command>       # e.g. pnpm install
<build command>         # e.g. pnpm run build
<test command>          # e.g. pnpm run test
<lint / format command>
<typecheck command>
```

<Any command that requires credentials, network, or a running service is marked with what it needs.>

## Conventions

- <Language/style rules taken from formatter and linter config, with the config file named.>
- <Test naming and location convention.>
- <Import, module, or layering rules that the config actually enforces.>

## Testing

<Which command is the authority (the one CI gates on), how to run a focused subset, and what is expected to accompany a change.>

## Environment

<Required runtime versions and their source file; required environment variables by name only, never values.>

## Notes for agents

- <Paths that must not be edited: generated output, vendored code, lockfiles.>
- <Where to look first for architecture context.>
~~~~

### Style rules for generated prose

- Current-state statements only. No history, no roadmap, no "we plan to".
- Every non-obvious claim names the file it came from.
- One fact has one home; a rule stated in Commands is not restated in Testing.
- Target ≤ 200 lines. A larger repository gets links to deeper docs, not a longer file.
- No secret values, tokens, hostnames, or internal URLs. Environment variables appear by name only.
- The file is written as instructions to a competent newcomer, not as marketing.

The DSH reference checkout's own root `AGENTS.md` is the shape this template imitates: a one-line project statement, a fenced `Repository layout` tree with one-line purposes, a fenced `## Commands` block with an inline comment per command, and a bulleted `## Conventions` list (`/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness/AGENTS.md:1-120`).

## Coordinate-file awareness

`/init` treats existing instruction files as authority, never as clutter. The pre-write decision is made from what the scan found at the project root.

| Existing state | Behavior |
|---|---|
| No `AGENTS.md`, no `CLAUDE.md` | Generate and write `AGENTS.md` after diff approval. |
| `AGENTS.md` exists | **Import, do not overwrite.** Parse its sections, propose only additive changes for sections that are missing or contradicted by the scan, and present them as a diff. Existing prose is preserved verbatim unless the user approves each replacement. |
| `CLAUDE.md` exists, no `AGENTS.md` | Offer three options: (a) write `AGENTS.md` as a one-line pointer to `CLAUDE.md`; (b) create `AGENTS.md` as a symlink to `CLAUDE.md`; (c) leave `CLAUDE.md` as the only file and write nothing. Default is (c) — no action — because DSH already reads `CLAUDE.md` directly. |
| Both exist with identical trimmed content | Report it and write nothing. The loader already collapses per-directory candidates whose content is byte-identical after trimming, rendering only the earliest candidate (`agent-instructions/README.md`, "Lifecycle"), so a duplicate costs nothing and needs no repair. |
| Both exist with different content | Report the divergence with a diff summary. Offer to make one file the source of record with the other a symlink — the pattern the DSH repo itself uses, where `CLAUDE.md` symlinks `AGENTS.md` at root, `packages/`, and `examples/` (`reference/deepseek-harness/AGENTS.md:147`). Never auto-merge divergent prose. |
| `AGENTS.local.md` / `CLAUDE.local.md` exist | Never read for generation and never written. They are the user's private overlay layer (`agent-instructions/src/config.ts:13`); `/init` only notes that they were detected. |
| Nested `AGENTS.md` in subdirectories | Left untouched. Their existence is noted in the root file's "Notes for agents" as scoped instructions, matching the loader's root-to-cwd chain. |
| `$DSH_HOME/AGENTS.md` (user-global) | Never modified. `/init` is project-scoped. |

Import parsing is heading-based and lossless: unrecognized sections are carried through unchanged and unrecognized content is never dropped.

## Questions policy

**Hard budget: at most three questions, asked once, in a single batch.** The command must be usable by someone who wants to answer nothing.

### Mechanism

Questions go through the DSH user-interaction seam (`ctx.userQuestions.ask`, `packages/interaction/user-questions/README.md`) rather than free-form model chat, so an adapter can render them as a real picker and an automation deployment without a provider degrades to defaults instead of hanging. Each question offers concrete options derived from the scan plus a "skip" option.

### Selection

Candidate questions are scored and the top three by (blocking severity, then user-facing impact) are asked. A question is asked only if **all** hold:

1. The answer changes the generated file's content, not just its wording.
2. The scan classified the fact as *ambiguous* — never merely *inferred*.
3. No Tier 1 source already answers it.

### Ranked candidate questions

1. **Which command must pass before a change is considered done?** Asked when CI defines several plausible gates (for example both `test` and `test:coverage`).
2. **Which of these top-level directories should agents not edit?** Asked when generated, vendored, or build-output directories are detected but not fully covered by `.gitignore`.
3. **Is this a monorepo with per-package conventions?** Asked when workspace markers exist alongside multiple divergent per-package configs; the answer decides whether the guide points to nested files.
4. **Which package manager is authoritative?** Asked only when multiple lockfiles are present.
5. **Anything an agent should know that the code does not show?** A single free-text question, asked only when fewer than two of the above qualify and the repository shows unusual structure.

### Defaults and skips

- Timeout or a skipped question resolves to the highest-confidence scan candidate, and the resulting line is hedged in the file with a `<!-- unverified -->`-free plain statement of uncertainty in prose.
- Zero qualifying questions is a valid and preferred outcome. `/init` reports "No ambiguities found" and proceeds straight to the diff.
- Answers are used for this generation only. `/init` stores no state between runs; a re-run rescans.
- On abort (`Esc`, signal), nothing is written and the command settles as an error result with no partial file — consistent with the command registry racing handler completion against the abort signal (`packages/interaction/commands/README.md`, "Service contract").

## Handoff to `/connect`

After a successful write, `/init` checks whether a usable model route is configured. If none is, or if the only configured provider fails a cheap capability check, it offers exactly one follow-up:

> `AGENTS.md` written. No model provider is configured yet — run `/connect` to set one up? [y/N]

Rules:

- The offer appears **only** when a provider is missing or unusable. A configured user never sees it.
- Accepting dispatches `/connect` through the command registry as a normal command invocation; `/init` does not reimplement any part of the connector flow.
- Declining ends the command successfully. The offer never blocks, never repeats within a session, and never runs automatically.
- `/init` reads no credential material to make this check; it asks the credentials capability whether a route resolves, and prints nothing about the credential itself.

## Acceptance criteria

Each criterion must be verifiable by an automated test or a scripted transcript before `/init` ships.

**Generation**

1. In a repository with `package.json` + `pnpm-lock.yaml` and a CI workflow, the generated `AGENTS.md` contains a `## Commands` block whose install/build/test lines match the CI workflow's invocations verbatim.
2. Every command line in the generated file traces to a scanned file. No command appears that is absent from all scanned sources.
3. In a repository with no detectable test command, the Testing section states that no test command was found rather than emitting a guess.
4. The generated file is valid UTF-8, ends with exactly one trailing newline, and its section order matches the template.
5. The generated file contains no value from any `.env*` file, and no file matching the never-read list is opened during the scan.

**Coordinate-file awareness**

6. With an existing `AGENTS.md`, no byte of its existing content changes without an explicit per-hunk approval; declining every hunk leaves the file byte-identical.
7. With only a `CLAUDE.md` present, the default path writes nothing, and the command reports that DSH already reads `CLAUDE.md`.
8. With byte-identical (after trim) `AGENTS.md` and `CLAUDE.md`, nothing is written and the reported reason cites per-directory duplicate collapsing.
9. `AGENTS.local.md`, `CLAUDE.local.md`, and `$DSH_HOME/AGENTS.md` are never opened for generation and never written, in every path above.
10. Nested `AGENTS.md` files under the project root are never modified.

**Questions**

11. No run asks more than three questions, and a run over an unambiguous repository asks zero.
12. Skipping every question still produces a complete file, with each skipped fact hedged in prose.
13. Every question is dispatched through `ctx.userQuestions`; with no interaction provider mounted, the run completes on defaults without hanging.

**Safety and lifecycle**

14. Aborting at any point before the write leaves the filesystem unchanged; no partial or temporary file remains.
15. A write failure (read-only filesystem, permission denied) settles as an error result naming the path and the OS reason, and leaves no partial file.
16. Scanning stops at the byte and file-count bounds and reports partial coverage instead of silently truncating its conclusions.
17. `/init` makes no network call other than the model request for generation.
18. The command executes no shell command without explicit approval; the default path executes none.

**Handoff**

19. With a working provider configured, no `/connect` offer is shown.
20. With no provider configured, the offer is shown exactly once, declining exits successfully, and accepting dispatches `/connect` through the command registry.

**Round-trip**

21. Running `/init` twice with no repository change and all questions skipped produces no second-run diff.
22. A file produced by `/init` is loaded by `dsh-agent-instructions` in the next session in that project root, verified by the instruction baseline naming that path.

## Open questions

- Whether `/init` should be registered as a plain `bridge:init` alongside `/init`, given the charter's `/bridge:install` namespacing, and how to shadow a future native DSH `/init` cleanly.
- Whether the scan should be a reusable capability shared with `/review`, rather than owned by this command.
- Whether repository-size overflow should offer a scoped run (`/init packages/app`) instead of partial coverage.
