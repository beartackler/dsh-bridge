# DSH Native Inventory — What Already Ships

> **Purpose:** Prevent dsh-bridge from porting things DeepSeek Harness already has. For each native capability: what it does, which familiar-harness need it covers, and the verdict — **WRAP** (thin bridge/alias/UX layer), **IMPROVE** (exists but insufficient for our users), or **SKIP** (already good, do nothing).
>
> **Source of truth:** reference checkout `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (shallow clone, master). Every claim below cites a package path or `docs/tool-catalog.md`.
>
> **Bottom line up front:** DSH is far more complete than the CHARTER's problem statement assumes. It natively ships slash commands, a skill system, plan mode, todos, goals, subagents (including **Claude Code and Codex subagent providers**), workflows, scheduling, MCP client, layered credentials, settings, permission presets, and **compatibility bridges that execute existing `.claude/hooks.json` and `.codex/hooks.json` configs**. dsh-bridge's differentiated value collapses onto four things: (1) the **trust/audit layer**, (2) **curated English-first discovery**, (3) **the connectors/onboarding flow that wires the existing pieces together**, and (4) **command-name aliasing** so muscle memory lands on native capability. Almost everything else is SKIP.

---

## 0. Verdict Summary

| Native capability | Package family | Familiar-harness need covered | Verdict |
|---|---|---|---|
| Slash-command registry | `packages/interaction/commands` | `/`-command plane, dispatch, lifecycle logging | **WRAP** (register aliases; do not rebuild) |
| Shipped commands (`/plan`, `/compact`, `/goal`, `/export`, `/feedback`, `/permissionPresets`) | see §1.2 | `/compact`, plan mode, transcript export | **WRAP** (alias + fill gaps) |
| `/model` selection | `packages/client/ui-model-selection` | `/model` | **SKIP** |
| Skills (`SKILL.md`, `.agents/skills`, `.dsh/skills`) | `packages/skill/*` | Claude Code skills, Jcode skills | **SKIP** (author skills, don't build a system) |
| Plan mode + `exit_plan_mode` | `packages/plan/plan-mode` | Plan mode / shift-tab planning | **SKIP** |
| Todos (`todo_write`) | `packages/todo/tool-todo` | TodoWrite checklists | **SKIP** |
| Goals (`create_goal`/`get_goal`/`update_goal`) | `packages/goal/*` | Jcode initiatives / durable objectives | **SKIP** |
| Subagents + CC/Codex providers | `packages/subagent/*` | Task tool, swarm, delegation | **SKIP** (huge native surface) |
| Agent Teams (experimental) | `packages/experimental/*` | multi-agent swarm | **IMPROVE** (disabled by default; document/enable) |
| Workflows + `ralph` | `packages/workflow/*` | orchestration loops | **SKIP** |
| Scheduling (`schedule_*`) | `packages/schedule/schedule` | ScheduleWakeup / cron reminders | **WRAP** (opt-in; onboarding should offer it) |
| Settings (file-backed, hot reload) | `packages/settings/*` | settings.json | **SKIP** |
| Credentials (env / `.credentials.yaml` / `.env`) | `packages/credentials/*` | `/login`, auth storage | **WRAP** — this is the connectors seam |
| MCP client | `packages/mcp/mcp-client` | `/mcp`, MCP server setup | **IMPROVE** (config-file-only today; needs a UX) |
| Hook bridges for Claude Code + Codex | `packages/hooks/*` | existing user hooks keep working | **SKIP** (already the exact port we'd have written) |
| Agent instructions (`AGENTS.md`/`CLAUDE.md`) | `packages/context/agent-instructions` | `/init`, memory files | **WRAP** (`/init` scaffolder only) |
| Agent presets (per-session composition) | `packages/preset/agent-presets` | output styles / modes | **WRAP** (ship curated presets) |
| Permission presets | `packages/interaction/permission-presets` | approval modes, YOLO mode | **SKIP** |
| Session persistence + `/export` + session query | `packages/session/*`, `packages/session-query/*` | `/resume`, history search | **IMPROVE** (`/resume` picker is the gap) |
| Compaction | `packages/compaction/*` | `/compact`, auto-compact | **SKIP** |
| Plugin inventory UI | `packages/client/ui-settings-plugin-inventory` | plugin list | **IMPROVE** — the trust-report insertion point |
| File/search/shell/web/LSP tools | see §8 | Read/Write/Edit/Bash/Grep/Glob/WebFetch | **SKIP** |
| `ask_user_question` | `packages/interaction/tool-ask-user` | AskUserQuestion | **SKIP** |
| Jobs (`job_list`/`job_output`/`job_kill`) | `packages/jobs/*` | background task management | **SKIP** |
| Code Mode (`run_code`) | `packages/core/tools/src/code-mode.ts` | — (DSH exceeds peers here) | **SKIP** (but **market** it) |

**Count: 25 capability areas surveyed. 15 SKIP, 6 WRAP, 4 IMPROVE. Zero require a from-scratch port.**

---

## 1. Commands — the slash-command plane

### 1.1 The registry exists and is first-class

`packages/interaction/commands/README.md` documents `ctx.commands`, a plugin-owned human-command registry:

- `ctx.commands.register(definition)` takes a lowercase name, description, optional unstructured-input descriptor (`hint` + an `images` flag), a `recordInput` policy, and an abortable handler.
- `parseCommand()` recognizes "a slash at byte zero, a lowercase name containing letters, digits, `_`, or `-`, and either end-of-input or whitespace", returning everything after the name as `rawInput`. The exact patterns are `packages/interaction/commands/src/index.ts:28` (`/^[a-z][a-z0-9_-]*$/u`) and `:117` (`/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u`). **Verified consequence: the CHARTER's `/bridge:install <plugin>` is unparseable** — `:` is not in the charset, and a name must *start* with a letter. Use `/bridge-install`, or a single `/bridge` command with a subcommand grammar in `rawInput`. Decide this before any user-facing copy is written.
- Registrations may be **global** or **agent-scoped** (an agent-scoped definition shadows a global one of the same name); duplicate names *within one layer* fail at registration. This means **name collisions with native commands are a load-time failure**, not a silent override.
- Lifecycle is logged as a `command/run` + `command/done` pair on the session; results are rendered by the adapter and **never enter model history**.
- `commands/change` observers let live UIs refresh discovery — so bridge commands registered late still appear.

Client half: `packages/client/ui-commands/README.md` provides `ctx.commandUi` with the `/` command source, fuzzy discovery over command names, and **three dispatch kinds**: `execute`, `popupSelect` (a menu), and `leadingInput`. Critically, `CommandUiContract.decorate(name, spec)` "adds a bare-invocation popup to an EXISTING host command" — so dsh-bridge can attach a nice picker UI to a native command **without owning it**.

**Covers:** the entire `/`-command surface, discovery, fuzzy match, popups, image-attachment envelope.
**Verdict: WRAP.** Do not build a command framework. Register bridge commands and *decorate* native ones. Budget the work as "a table of aliases plus handlers", not infrastructure.

### 1.2 Commands that already ship

Grepped from `ctx.commands` registrations across `packages/`:

| Command | Source | Familiar equivalent |
|---|---|---|
| `/plan` | `packages/plan/plan-mode/src/index.ts:297` | plan mode toggle. Also registers a `plan:policy` prompt section (`:244`). Accepts `/plan [message]` and submits the optional message after selecting plan mode. |
| `/compact` | `packages/compaction/command-compact/src/index.ts:101` | `/compact` |
| `/goal` | `packages/goal/command-goal/src/index.ts:191` | durable objective control |
| `/export` | `packages/session-query/session-log-export/src/index.ts:20` | `/export` transcript |
| `/feedback` | `packages/feedback/command-feedback/src/index.ts:102` | `/feedback` |
| `/permissionPresets` | `packages/interaction/permission-presets/src/index.ts:275` | approval-mode switch. "bare invocation reports the current preset and the table; a preset argument switches through `set`". |
| `/model` | `packages/client/ui-model-selection` (client-side popupSelect via `ctx.commandUi`) | `/model`, with a two-level Model/Effort menu |

**Gaps versus the CHARTER's list** (`/help`, `/model`, `/login`, `/init`, `/review`, `/compact`, `/resume`, `/memory`, `/mcp`):

- `/compact` — **exists**. Alias only.
- `/model` — **exists** and is better than most (effort selection). Alias only.
- `/help` — **confirmed absent** (no `name: 'help'` registration anywhere in `packages/`). Genuine gap, and cheap: enumerate `ctx.commands.list(agent)` plus the skill catalog. High value because it's the discovery entry point for everything else in this document.
- `/login` — **confirmed absent.** But the *storage* is solved (§6); this is a flow over `ctx.credentials` + `ctx.authorization`.
- `/init` — **confirmed absent.** The *consumption* of `AGENTS.md` is solved (§7); the gap is a scaffolder that writes one.
- `/review` — **confirmed absent**, and a natural fit for a skill (§2) rather than a command.
- `/resume` — session persistence and query exist (§9), but **confirmed absent** as a command. Genuine gap.
- `/memory` — `AGENTS.md` loading exists (§7); no editor command. Small gap.
- `/mcp` — MCP client exists but is `cordis.yml`-configured only (§10); **confirmed absent** as a command. Real gap, real value.

**Verdict: WRAP.** The honest scope is ~5 new commands (`/help`, `/login`, `/init`, `/resume`, `/mcp`), one skill (`/review`), and aliases for the rest. That is a fraction of what the CHARTER implies.

---

## 2. Skills

`packages/skill/README.md` lists four packages:

| Package | Role |
|---|---|
| `packages/skill/skill` | provider registration + lookup (`ctx.skills`) |
| `packages/skill/skill-filesystem` | local filesystem discovery |
| `packages/skill/skill-badge` | the bundled "powered by dsh" badge skill |
| `packages/skill/tool-skill` | catalog + the model-facing `skill` loader tool |

`packages/skill/skill-filesystem/README.md` gives the discovery rank order, which is **directly compatible with the Claude Code / `.agents` ecosystem**:

| Rank | Source | Path |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` (`$DSH_AGENTS_HOME` or `~/.agents`) |

Format: "single-level directory bundles (`<name>/SKILL.md`) or flat Markdown files (`<name>.md`)", kebab-case names, YAML frontmatter with required `name`/`description` plus optional `whenToUse`, `metadata`, `disable-model-invocation`, and **`user-invocable`**. Roots are watched with Chokidar and hot-refresh; the first-party `write`/`edit` tools synchronously invalidate the provider through `fs/observed` so "the next model step observe[s] its own filesystem mutation".

`packages/skill/tool-skill/README.md`: at every eligible `agent/pre-step` the catalog re-snapshots and republishes a durable `<available_skills>` `<system-reminder>` when the digest changes; the `skill` tool takes one `name` argument and returns `<skill_content>` / `<skill_resources>` / `<skill_instructions>`.

**Covers:** Claude Code skills, Jcode `/skillname` skills, agent-invocable capability packs. The `~/.agents/skills` root means **a user's existing skills work in DSH with zero migration**.

**Verdict: SKIP the system; INVEST in the content.** dsh-bridge should ship *skills* (`/review`, security-audit playbooks, plugin-authoring guides) as `SKILL.md` bundles. The `user-invocable` frontmatter flag is the seam that makes a skill feel like a slash command. Note for the trust layer: `skill-filesystem` scans `~/.agents/skills` — **a malicious skill dropped there is auto-catalogued**, which is a real attack surface our audit tooling should cover alongside plugins.

---

## 3. Plan / Goal / Todo — three distinct durable state families

DSH deliberately separates what other harnesses conflate. All three exist.

### 3.1 Plan mode — `packages/plan/plan-mode`

`packages/plan/README.md`: "Plan mode is logged, per-agent collaboration state rather than a generic mode registry or capability seam." Provides `ctx.planMode`, the `/plan` command, guidance prompt sections, and the review flow.

From `docs/tool-catalog.md`, the `exit_plan_mode` tool: "Use only in plan mode. Present your plan for the user's review and, on approval, leave plan mode." The catalog notes it "stays in the model-facing schema while planning is inactive so transitions add no tool-catalog churn"; its execute path rejects calls outside plan mode, and in plan mode it "presents the plan over the user-questions seam (approve / keep planning with feedback)".

**Covers:** Claude Code plan mode, Codex plan mode, Jcode plan gating — including the approve/revise loop.
**Verdict: SKIP.** Behaviorally equivalent to what our users expect. Only alias the command name if a user's muscle memory differs.

### 3.2 Goals — `packages/goal/*`

Four packages (`goal/README.md`): `goal/` (state + lifecycle, `ctx.goals`), `goal-round-driver/` (same-session continuation), `tool-goal/`, `command-goal/`.

Tools per `docs/tool-catalog.md`: `create_goal`, `get_goal`, `update_goal`. Authority model is notable: "create, edit, pause, and resume require **direct-human root authority**; complete and blocked also accept the exact current goal round. The default blocked lower bound is three admitted rounds." So a subagent cannot invent its own goals, and the agent cannot declare itself blocked before genuinely trying three rounds.

**Covers:** Jcode initiatives, durable multi-session objectives, autonomous continuation.
**Verdict: SKIP.** This is *stronger* than the equivalents in Claude Code or Codex. Worth documenting as a selling point rather than reimplementing.

### 3.3 Todos — `packages/todo/tool-todo`

`todo/README.md`: deliberately a single product package "because one agent session owns the list; there is no replaceable provider contract."

`docs/tool-catalog.md`: `todo_write` is "session-owned state; UIs render the latest `todo/write` event as a checklist." Config `allowParallelInProgress` is required with no default; the catalog documents `true` (description invites several `in_progress` items) while `false` yields "the same tool with a description asking for exactly one active task" — i.e. Claude Code's exactly-one-in-progress convention is a config flag away.

**Covers:** TodoWrite.
**Verdict: SKIP.** If our onboarding has an opinion, set `allowParallelInProgress: false` in a preset for CC-familiar users. That is a config line, not a port.

---

## 4. Subagents — the biggest "do not port" finding

`packages/subagent/` contains **eleven** packages:

| Package | Role |
|---|---|
| `subagent/` | the seam (`ctx.subagents`) |
| `subagent-acp/` | ACP-protocol children |
| **`subagent-claude-code/`** | **runs the real Claude Agent SDK as a child** |
| **`subagent-codex/`** | **runs the real Codex `app-server --stdio` as a child** |
| `subagent-dsh-sdk/` | DSH SDK children |
| `subagent-fork-in-process/` | session forking |
| `subagent-in-process-driver/` | in-process driver |
| `subagent-spawn-in-process/` | in-process spawn |
| `tool-subagent/` | model-facing `subagent` tool |
| `tool-subagent-control/` | `send_message`, `interrupt_agent`, `list_agents` |
| `tool-subagent-report/` | child-scoped `report` tool |

`packages/subagent/subagent-claude-code/README.md`: "registers a Profile-named Claude Code subagent provider whose default name is `claude-code`. Each accepted run invokes the official Claude Agent SDK in the delegating Session's workspace, lets the pinned SDK select its installed platform CLI, submits one self-contained text task". It "deliberately omits the SDK `settingSources` option. The official SDK therefore reads the host's normal user, project, and local Claude settings relative to the parent Session cwd, including native account state and product configuration. The provider neither copies nor filters those files and does not create or modify login state."

That last sentence is the single most important line in this document for dsh-bridge: **DSH already reuses a user's existing Claude Code login and settings.** A large slice of the imagined "connectors" work is already done for this path.

`packages/subagent/subagent-codex/README.md`: same shape for Codex — spawns "the official package-local Codex wrapper with `app-server --stdio`", creates an ephemeral thread, maps a profile-selected mode onto native approval/reviewer/sandbox fields. Both providers report `inheritsParentContext: false` and are unattended (permission requests are auto-declined rather than escalated to a human).

Tools, per `docs/tool-catalog.md`: `tool-subagent`'s registered name is the load-time `toolName` config, and shipped compositions load it **twice**, so the model sees both `subagent` (continuable, defaults to background with automatic settlement delivery) and `subagent_fork` (one-shot, foreground) — see `packages/bundle/base/cordis.patch.yml` and `examples/acp-agent/cordis.yml`. `tool-subagent-control` registers `send_message` and `interrupt_agent` globally, plus `list_agents` from a separately loaded `/list-agents` plugin.

**Covers:** Task tool, swarm delegation, background agents, cross-harness delegation. Both bundle notes confirm this is in the shipped base composition, not hypothetical.
**Verdict: SKIP entirely.** Any dsh-bridge subagent work would be strictly worse. The correct action is **documentation**: most users will not discover that DSH can drive Claude Code and Codex as children. That is a compelling README section and a launch talking point.

### 4.1 Agent Teams — `packages/experimental/*`

`docs/tool-catalog.md` lists `@deepseek-ai/dsh-experimental-tool-agent-team` with ten tools: `spawn_teammate`, `followup_task`, `wait_agent`, `interrupt_agent`, `send_message`, `list_agents`, `team_task_create/get/list/update`. All "scoped to implicit Team Leads and durable teammates." Crucially: "**The shipped dsh-base bundle keeps the package disabled**; the documented Agent Teams profile patch enables it while disabling the legacy continuable-child control names."

**Covers:** Jcode swarm, multi-agent task graphs.
**Verdict: IMPROVE (documentation + a safe enablement path).** It's built and disabled. A `/bridge` preset that enables it correctly — including the required disabling of the colliding control-tool names — is real, low-risk, high-visibility value. Note the collision: enabling teams while `tool-subagent-control` still registers `send_message`/`interrupt_agent` is exactly the duplicate-name-in-one-layer failure §1.1 warns about.

---

## 5. Workflows and Scheduling

### 5.1 Workflow — `packages/workflow/*`

`workflow/README.md`: `ctx.workflowEngine` "executes a model-written orchestration script that can fan out subagents." `WorkflowStartRequest` is `{ meta, script, args?, subagentProvider?, maxTotalAgents?, parent, signal? }`. `WorkflowRun.result` **never rejects** — failures resolve with `stopReason: 'error'`, cancellation with `cancelled`. Engine today is `workflow-worker-thread`; `tool-workflow` is the model-facing consumer.

`tool-ralph` (`docs/tool-catalog.md`): "A fixed foreground workflow starts one fresh structured child per round; the model selects only the immutable objective and an optional round cap." That is the Ralph Wiggum loop, shipped.

**Verdict: SKIP.** No familiar-harness equivalent is better.

### 5.2 Schedule — `packages/schedule/schedule`

Three tools (`schedule_create`, `schedule_list`, `schedule_delete`). Per `packages/schedule/schedule/README.md`: "Version 1 accepts positive safe-integer `after_seconds` delays, explicit absolute `at` targets, and fixed-rate `every_seconds` intervals of at least five minutes. The Session event log owns reminder state."

Composition constraints matter: it is opt-in, must load after `ctx.sessions`/`ctx.agents`/`ctx.tools`/`ctx.sessionPersistence`, and "listens only to later `agent/created` events, installs on runtime roots... **Agents that already existed when the plugin loaded and runtime children do not receive Schedule.**" Delivery is session-local. `at` requires an explicit offset or IANA `time_zone`; DST gaps are rejected and overlaps take the earlier instant.

**Covers:** Jcode `ScheduleWakeup`, cron-style reminders.
**Verdict: WRAP.** The capability is done; the gap is that it's off by default and has fiddly load-order requirements. Onboarding should offer to enable it and emit a correct profile patch. Also mount `@deepseek-ai/dsh-time-context` alongside it (`packages/context/time-context`) so natural-language times work — the README notes Schedule "never imports or infers from model context", so the model must pass an explicit offset regardless.

---

## 6. Credentials and Settings — the connectors substrate

### 6.1 Credentials — `packages/credentials/*`

Three packages (`credentials/README.md`): `credentials/` (the `CredentialRef`/record seam, `ctx.credentials`), `credentials-local/` (env + local file provider), `authorization/` ("**plugin-owned flows that obtain a credential by asking a human**", `ctx.authorization`).

`packages/credentials/credentials-local/README.md` gives four layers with explicit precedence:

| Layer | Source id | Writable | Wins |
|---|---|---|---|
| Inherited process environment | `env` | no | always |
| `$DSH_HOME/.credentials.yaml` | `file` | yes (`set`/`unset`) | over both `.env` layers |
| `<cwd>/.env` | `project-env` | not here | over user `.env` |
| `$DSH_HOME/.env` | `user-env` | not here | otherwise |

The design principle is directly aligned with the CHARTER's "never print secrets": env wins because "it cannot be edited from inside, [so] it must be *visibly* read-only: `describe()` reports `source: 'env', writable: false`, and `set`/`unset` reject instead of writing a change the reader would never see." Config "carries references, not secret values."

**Covers:** credential storage, precedence, safe UI description (`CredentialInfo`), and — via `ctx.authorization` — the human-in-the-loop acquisition flow a `/login` needs.
**Verdict: WRAP. This is the connectors flow's foundation and it is already excellent.** dsh-bridge's `/login` should be a *detector plus an authorization flow*: probe `~/.claude`, `~/.codex`, opencode `auth.json`, and env vars; then `ctx.credentials.set()` through the existing seam and verify with a smoke request. Do **not** invent storage. The `describe()` contract gives us secret-free UI for free — use it and cite it in SECURITY.md.

### 6.2 Settings — `packages/settings/*`

`settings/` (namespace registration, layered resolution, commits — `ctx.settings`) and `settings-file/` (one YAML/JSON document, all namespaces).

`packages/settings/settings-file/README.md` documents unusually careful behavior: boot fails loud on an invalid document but a live reload keeps last-good; every write is a read-modify-write under a cross-process `<file>.lock` with a 2s deadline; write-back is atomic, owner-only (mode `0600`), and symlink-proof (`wx` refuses a planted symlink); **YAML edits are leaf-level diffs so user comments, anchors, and formatting survive**; self-writes are suppressed by content hash.

**Covers:** `settings.json`, hot reload, per-plugin config.
**Verdict: SKIP.** Register a `bridge` namespace and use it. Any hand-rolled config file we ship would be strictly worse than this. The symlink and lock behavior is also a nice citation for our trust story.

---

## 7. Context, instructions, and memory

`packages/context/README.md` lists: `agent-instructions` (included by default, disable-able), plus opt-in `time-context`, `tmux-context`, `session-reference`, `file-reference`, `file-reference-local`.

`packages/context/agent-instructions/README.md`: "Per-session workspace instruction loading for **`AGENTS.md`-compatible files**." It reads `$DSH_HOME/AGENTS.md` then, in each directory from project root down to the session cwd, "every existing base candidate and then every existing local-overlay candidate." Deduplication is content-aware: "candidates whose content is byte-identical after trimming leading and trailing whitespace collapse to the earliest candidate in configured order, so a **`CLAUDE.md` that merely duplicates its sibling `AGENTS.md` is rendered once**." It then discovers nested files and reports changes/removals after successful filesystem tool calls, and a resumed session "retains one compatible visible baseline and appends only current-file transitions."

`file-reference` provides the `@file` grammar (`ctx.fileReferences`) — the `@`-mention muscle memory. `session-reference` gives "bounded snapshots of other sessions."

**Covers:** `CLAUDE.md` / `AGENTS.md` memory, `@file` mentions, cross-session reference.
**Verdict: WRAP, narrowly.** Consumption is solved and the CC compatibility is explicit. The only gap is `/init` (generate a good `AGENTS.md` by inspecting the repo) and `/memory` (open the right file for editing). Both are thin commands over existing machinery. Do not touch the loader.

---

## 8. Tools already in the catalog

From `docs/tool-catalog.md`'s Tool Package Map — everything a familiar user expects, and then some:

| Need | Native tool(s) | Package |
|---|---|---|
| Read / Write / Edit | `read`, `write`, `edit`, `read_image` | `dsh-tool-fs` |
| str-replace editing | `str_replace_editor` | `dsh-tool-str-replace-editor` |
| Grep / Glob | `grep`, `glob` (packaged `@vscode/ripgrep`, via `ctx.subprocess`, no host `rg` needed) | `dsh-tool-fs-search` |
| Bash | `bash` (fresh shell per call, `workdir` param, `run_in_background`, sandbox denials reported as policy not error) | `dsh-tool-bash` |
| PowerShell | `pwsh` | `dsh-tool-pwsh` |
| Persistent shell | `bash` / `pwsh` over PTY | `dsh-tool-bash-persistent`, `dsh-tool-pwsh-persistent` |
| Terminal control | `terminal_open/read/send/close/list/signal` | `dsh-tool-terminal` |
| Background jobs | `job_list`, `job_output`, `job_kill` | `dsh-tool-jobs` |
| Web | `web_search`, `web_fetch` (providers: deepseek, exa, perplexity) | `dsh-tool-web`, `packages/web/*` |
| LSP | `lsp` (returns structured `LSP_UNAVAILABLE` when no provider, rather than changing schema) | `dsh-tool-lsp` |
| Ask the user | `ask_user_question` (multi-question, options, `multi_select`) | `dsh-tool-ask-user` |
| Session history | `session_search`, `session_trace`, `session_event_read/search/trace` | `dsh-tool-session-query` |
| Runtime self-modification | `cordis_define/run/stop/undefine`, `cordis_inspect_*` | `dsh-tool-cordis` |
| **Code Mode** | `run_code` — write a TypeScript program that calls tools as `await tools.name(args)` | `packages/core/tools/src/code-mode.ts` |

Two notes worth carrying into the trust work:

1. **`dsh-tool-cordis` is not in any shipped tree** — the catalog calls it "a deliberate opt-in — dynamic package code reaches the real runtime". It can register *additional* model-visible tools at runtime until stopped. For our audit rubric, **a plugin that pulls in `cordis-host-runner` or `tool-cordis` is a maximum-severity finding** and should be an automatic fail.
2. **Code Mode is a genuine differentiator.** Sub-calls "re-enter the complete guarded tool pipeline", overlap up to `maxParallelSubCalls`, and are linked to the outer result. No familiar harness ships this. Market it; don't touch it.

**Verdict: SKIP all.** The tool layer is complete and in several places ahead of the competition.

---

## 9. Sessions, resume, export, compaction

- **Persistence** (`packages/session/session-persistence*`): the seam plus JSONL and opt-in SQLite backends, with `session-checkpoint-policy` applying semantic durability checkpoints.
- **Projection** (`session-projection`, `-cache`, `session-stats`): log-derived per-session state for clients.
- **Titles** (`session-title`, `-llm`, `-first-prompt-llm`, `-all-prompts-llm`): model-backed session titles with a deterministic fallback. "the demo spine mounts the fallback service and leaves both model providers out of default composition."
- **Query** (`packages/session-query/*`): `session-query`, `session-query-sqlite`, `tool-session-query` (five read-only tools that "hide provider cursors and authorize every result from the immutable calling agent session"), and `session-log-export` which registers `/export`.
- **Compaction** (`packages/compaction/*`): the seam, `compaction-basic` (token-pressure + summarization), an optional model-free `compaction-tool-result-pruner`, and `command-compact` (`/compact`).

**Covers:** `/compact`, `/export`, history search, durable sessions, titles.
**Verdict: mostly SKIP; IMPROVE `/resume`.** Every ingredient for a resume picker exists (persistence + projections + titles + query), but no resume *command* surfaced in the grep. A `/resume` that lists recent sessions with their generated titles and stats is a small, high-visibility win. Enabling a `session-title` LLM provider is a one-line composition change that makes that picker actually readable — worth doing in our preset.

---

## 10. MCP

`packages/mcp/mcp-client/README.md`: connects to external MCP servers and registers their tools on `ctx.tools` "under server-qualified names (`mcp__<serverName>__<rawName>`)" — the same naming convention users already know. Supports `stdio` and `streamable-http` transports. Configuration is **one plugin instance per server in `cordis.yml`**, with `!!js` expressions for env interpolation:

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

**Covers:** MCP tool bridging — the protocol work is done and the tool naming already matches.
**Verdict: IMPROVE — real gap, high value.** The functionality is complete; the *ergonomics* are not. There is no `/mcp` command, no add/list/remove flow, no health check, no import from an existing `~/.claude.json` or Codex MCP config. This is one of the few places where dsh-bridge adds capability rather than polish. Also note: `!!js` in a config file is arbitrary code execution at load — our audit rubric must flag `!!js` in any plugin-supplied patch, and our own generated config should avoid it where a plain `${VAR}` reference through `ctx.credentials` will do.

---

## 11. Hooks — already ported, better than we would have

`packages/hooks/` ships three packages: `hook-protocol` (dialect-agnostic matcher, exit-code/stdout codec, `ctx.shell` execution, most-restrictive merge, `hook/*` events), `hooks-claude-code`, and `hooks-codex`.

`packages/hooks/hooks-claude-code/README.md`: "runs the supported command-hook subset of a user's existing **Claude Code** hook config (a `hooks.json`, or a settings file's `hooks` key) on the harness's canonical interception points." It owns CC-shaped stdin payloads, CC env plus `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` substitution, and the mapping to typed Decisions:

| CC hook | Harness point | Mapping |
|---|---|---|
| `SessionStart` | `agent/session-start` (emit) | additionalContext → `agent.inject()`; cannot block |
| `UserPromptSubmit` | `agent/pre-step` (waterfall) | `deny` → reject; context-only → delegate via `next()` |
| `PreToolUse` | `tools/pre-execute` (waterfall) | `deny` → deny; `ask` → ask |
| `PostToolUse` | `tools/post-execute` (waterfall) | `deny` → block with feedback |
| `Stop` | `agent/turn-stopping` (serial) | blocking Stop feeds its reason through `steer()`, forcing another step |
| `SubagentStart` / `SubagentStop` | `subagent/start` / `subagent/end` (emit) | inject / observe-only |

`packages/hooks/hooks-codex/README.md` does the same for Codex: five of ten hook points, regex-only matchers, snake_case payloads with `turn_id`/`model`, no plugin env injection, no pre-tool approval/rewrite path.

Both are honest about being compatibility shims — "A native cordis plugin could do everything this bridge does — more powerfully, with typed returns and no serialization boundary" — and both contain read/parse failures rather than crashing boot: "the bridge logs a warning and registers nothing rather than crashing boot (a typo'd path must not take the agent down)."

Injected context carries `{ kind: 'plugin', plugin: 'hooks-claude-code' }` "so the durable message is never mistaken for a user prompt."

**Covers:** a user's entire existing hook configuration, from both major harnesses.
**Verdict: SKIP the port; WRAP the discovery.** This is precisely the compatibility layer dsh-bridge would otherwise have built, done properly. Our contribution is *detection and wiring*: both bridges require an explicit `configPath` and both are process-level (a documented `TODO(per-session-hook-config)` in each README). Onboarding should find `.claude/hooks.json` / `.codex/hooks.json` and emit the profile rows. That is a one-screen wizard step, not a subsystem.

---

## 12. Presets, permissions, and the plugin surface

### 12.1 Agent presets — `packages/preset/agent-presets`

"An **agent preset** is a directory holding one `agent.cordis.yml`. Mounting it under an agent's scope context gives that session its own tools and prompt sections while every other live session keeps its own, so one process can run several differently composed agents at once." Preset ids must match `[a-z0-9][a-z0-9-]*`. Discovery is unmemoized, so a preset authored while the process runs is immediately visible. A broken preset (unparsable YAML, or not a list of named plugin rows) is **listed with a `broken` reason rather than skipped**, "because a skipped directory would still occupy its id on disk while every surface shows nothing to delete." `ctx.agentPresets.authorable` reports whether any root has `user` trust.

Shipped presets (`apps/cli/config/agent-presets/`): `code`, `cordis`, `minimal`, `standard`. Each holds an `agent.cordis.yml` + `preset.yml`; `cordis/` also carries a `skills` directory — the pattern for shipping skills alongside a preset.

A guardrail worth knowing: "A preset that names a row publishing a process-global service is rejected at mount rather than allowed to collide with the next session."

**Covers:** output styles, modes, per-session composition.
**Verdict: WRAP.** dsh-bridge should ship presets (e.g. `claude-code-familiar`, `codex-familiar`) that pre-wire aliases, hook bridges, todo `allowParallelInProgress: false`, and an enabled schedule. This is the highest-leverage delivery vehicle we have, and it composes with `cordis/`'s skills-beside-preset pattern.

### 12.2 Permission presets — `packages/interaction/permission-presets`

Bundles `sandbox/mode` with `approval/policy`. Defaults: `workspace-write` ("Write inside the workspace and permitted temporary directories; wider retries require approval", `src/index.ts:186`) and `danger-full-access` ("Full file access without approval prompts", `:190`). `current(events)` may report `custom`, which clients may display but cannot select. Creation pins the three knobs into the session "so later changes never alter an existing session."

**Covers:** approval modes, YOLO mode, sandbox switching.
**Verdict: SKIP.** Note for onboarding copy: `danger-full-access` is the DSH spelling of what CC users call bypass mode.

### 12.3 Plugin inventory UI — `packages/client/ui-settings-plugin-inventory`

A read-only **Plugin list** tab registered as a `settings.plugins.tab` contribution with id `all`, lazily calling `ctx.remote.pluginInventory.list()`. Renders "a searchable two-column catalog of compact disclosure cards" with an effective-enablement tag, a root-fiber status dot, the loader-tree entry id, effective configuration, and Cordis status. Its own README names the limits: "**Read-only Loader view** — local search does not add provenance, current-browser activation diagnosis, grouping by source, or plugin mutation controls."

Sibling `packages/client/ui-settings-plugins` owns the **Plugin configuration** tab, and its extension point is exactly the seam we need: `settings.plugins.tab` is "a root list slot whose labels become ordered tabs", and per-plugin cards key on the settings namespace. "Keying on the namespace is what lets a plugin **distributed outside this repository** appear here — it registers the namespace on the Host and the card in the browser."

**Covers:** seeing what's installed.
**Verdict: IMPROVE — this is where the trust report card belongs.** DSH gives us a documented, first-class extension point (`settings.plugins.tab`) for a new tab, and the inventory tab's own stated gaps (**no provenance, no grouping by source, no mutation controls**) are precisely the trust layer's contribution. Building the report card as a `settings.plugins.tab` contribution means it lands inside the native Settings chrome and inherits its design system — satisfying the CHARTER's "Impeccable UI within DSH design system" almost for free.

### 12.4 Plugin installation

`packages/bundle/README.md`: a bundle is "npm packages whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`". In-box bundles resolve from the installation; "out-of-tree bundles install into a profile through `dsh plugin --profile <name> add <package>`". `apps/cli/src/args.ts:171` confirms the `plugin` subcommand "manage[s] a profile's plugins by forwarding the remaining arguments to **pnpm** in the profile directory".

Shipped bundles: `base` (the shared core every profile applies first), `web-app`, `headless`.

**Verdict: WRAP.** Installation forwards to pnpm, and under pnpm >= 10 (what `dsh plugin` invokes; the reference checkout pins `pnpm@11.7.0`) dependency lifecycle scripts are **not** unconditional: pnpm refuses to run a dependency's `prepare`/build script until the user explicitly allowlists the package via `allowBuilds: { <pkg>: true }` in the profile's `pnpm-workspace.yaml` and re-runs the `add` (`docs/user/develop/basic/publish.md`, "Installing from GitHub"; see also `dsh-capability-seams.md` §2, which documents the same gate). The upstream docs name the allowance for what it is: "permission to execute the package's code on your machine at install time, outside any sandbox the agent runs under", with `github:owner/repo#<sha>` pinning recommended.

Observable install-flow symptoms, stated so acceptance tests can assert them:

- **Before allowlisting:** the first `dsh plugin --profile <name> add github:owner/repo` fails because pnpm blocks the git dependency's `prepare` script; the flow surfaces the exact package key pnpm printed for copying into `allowBuilds`.
- **After allowlisting:** the package's lifecycle scripts execute on the user's machine at install time, outside agent sandboxing. That allowance can be granted before any dsh-bridge audit runs, which makes it the trust boundary.
- **Prebuilt distributions:** npm packages with `lib/` built at publish time, or shipped tarballs, need no build allowance (per `publish.md`); these remain the low-friction path for vetted plugins.

Consequence unchanged, mechanism corrected: install-time code execution is real but conditional on a user-granted allowance, not automatic. Our verified-installer must treat the moment a user allowlists a build as the trust boundary: audit *before* guiding the user through `allowBuilds`, repeat the upstream warning plus `#<sha>` pinning, and consider `--ignore-scripts` in the recommended flow. This remains the single strongest technical justification for the trust layer, and it should be stated plainly in the README.

---

## 13. What dsh-bridge should actually build

Ordered by (value × uniqueness) ÷ effort, given everything above:

1. **Trust layer / verified installer.** Zero native equivalent. `ui-settings-plugin-inventory` is read-only and explicitly lacks provenance; `dsh plugin add` forwards to pnpm with lifecycle scripts. Ship the audit, the report card as a `settings.plugins.tab` contribution, and an install flow that audits first. **This is the product.**
2. **`/mcp` management.** `mcp-client` works but is config-file-only. Add/list/remove/health-check plus import from existing CC/Codex MCP configs. Genuine capability, not polish.
3. **Connectors `/login`.** Build on `ctx.credentials` + `ctx.authorization`; detect `~/.claude`, `~/.codex`, opencode `auth.json`, env vars. Never store secrets ourselves — the four-layer provider already does it correctly.
4. **`/help` + curated presets.** Cheap; makes every native capability in this document discoverable. Most users will never find goals, Code Mode, or the CC/Codex subagent providers on their own.
5. **`/resume` picker.** All ingredients exist; assembly + enabling a session-title LLM provider.
6. **`/init`, `/memory`, `/review`.** Thin commands and one skill over existing machinery.
7. **Onboarding wizard** that wires the hook bridges, schedule, Agent Teams, and presets — turning "DSH already has this" into "DSH already does this for me."

**Explicitly do not build:** a command framework, a skill system, plan mode, todos, goals, subagents, workflows, scheduling, settings storage, credential storage, hook execution, an MCP protocol client, or any core tool. All exist; all cited above.

---

## 14. Open questions for the next research wave

- ~~Is there a native `/help`?~~ **Resolved: no.** But note `packages/client/ui-commands` ships a fuzzy `/` menu over `command.list`, which partially covers discovery — a `/help` should therefore emphasize *capabilities* (skills, goals, Code Mode, CC/Codex subagents) over a bare command list the menu already shows.
- Does any shipped surface offer session resume? `packages/client/ui-sidebar` and `ui-workspace` were not read in depth.
- What exactly does `ctx.remote.pluginInventory.list()` return (`packages/api/remotes`)? Determines how much provenance the trust card can show without new Host work.
- Can a command name contain `:`? `parseCommand()` accepts letters, digits, `_`, `-` — so `/bridge:install` is **not** parseable. Confirm and pick the namespace convention (`/bridge-install` vs. a single `/bridge` with subcommand grammar) before any command copy is written; the CHARTER currently assumes the unparseable form.
- `packages/guard/*` (`repeat-tool-reminder`, `timeout-policy`) and `packages/interaction/user-approval` were only skimmed; both are relevant to the trust story's runtime half.

---

## Revision 1

2026-08-26, addressing the applicable minors from `docs/reviews/research-docs-review.md` for this file:

- Corrected the §0 verdict tally from "14 SKIP, 7 WRAP" to "15 SKIP, 6 WRAP" to match the table's own verdict column (reviewer finding 2).
- Reworded §12.4 so install-time lifecycle-script execution is described as gated by pnpm >= 10 `allowBuilds` instead of unconditional, verified against `apps/cli/src/args.ts:171` and `docs/user/develop/basic/publish.md` in the reference checkout (reviewer finding 3 and the cross-document tension with `dsh-capability-seams.md` §2). Added observable install-flow symptoms (pre-allowlist failure, post-allowlist execution, prebuilt path) so acceptance tests can assert them; this file has no Impact-column tables, so the symptom text lives in §12.4 directly. The conclusion (audit before install; the allowance is the trust boundary) is unchanged.
