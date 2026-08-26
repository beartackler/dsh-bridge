# dsh-bridge Glossary

Plain-English translations of DeepSeek Harness (DSH) and Cordis jargon for refugees from Claude Code, Codex, OpenCode, and Jcode. One sentence per concept, one analogy per concept, and a citation into the upstream checkout (`../../reference/deepseek-harness/`, shallow clone of master). Where the two canonical primers don't cover a term, we cite the upstream doc that does — never guess.

Primary sources: [`docs/glossary.md`](../../reference/deepseek-harness/docs/glossary.md) and [`docs/cordis-primer.md`](../../reference/deepseek-harness/docs/cordis-primer.md).

---

## Kernel (Cordis)

**Definition:** Cordis is the vendored plugin framework underneath DeepSeek Harness — the thing that loads plugins, hands them a shared context, and unwinds their registrations on shutdown.

> **In Claude Code terms:** Claude Code is an app you configure from outside; Cordis means there is no privileged core at all, so the model adapter, tool registry, and agent loop itself are plugins sitting beside yours.

Source: `docs/cordis-primer.md:5` ("Cordis is the vendored plugin framework underneath DeepSeek Harness"); corroborated by `docs/architecture.md:11-13` ("Every part of the product is a plugin… There is no privileged core to patch").

## Plugin

**Definition:** A plugin is any object implementing the Cordis `Service` contract — a function with optional `inject` and `apply(ctx)` fields, or a `Service` subclass whose lifecycle Cordis mounts into the current context.

> **In Claude Code terms:** roughly an MCP server, a slash-command pack, and a hook module rolled into one — except it loads *into* the process instead of talking over a protocol.

Source: `docs/cordis-primer.md:9` ("A plugin is a object that implements Service").

## Service

**Definition:** A service is a capability that claims a stable key on the shared context (`ctx.tools`, `ctx.llm`, `ctx.sessions`), which other plugins find by key via `inject` instead of importing a concrete implementation.

> **In Claude Code terms:** think dependency injection instead of imports — like reaching for "the tool registry" as a well-known utility rather than requiring someone else's package.

Source: `docs/cordis-primer.md:10-11` ("A service claims a stable `ctx.<key>`… Declare service dependency via `inject`").

## Event

**Definition:** An event is a typed extension point that services declare through TypeScript declaration merging and dispatch in one of four modes (`emit`, `waterfall`, `parallel`, `serial`) depending on whether listeners observe, wrap, fan out, or run in order.

> **In Claude Code terms:** hooks like `PreToolUse`, but typed and stronger — a `waterfall` listener can rewrite what the model sees or short-circuit the whole call by skipping `next()`.

Source: `docs/cordis-primer.md:12` (typed events and the four dispatch verbs), `docs/cordis-primer.md:15-26` (dispatch-mode table), `docs/cordis-primer.md:30-34` (waterfall around-middleware semantics).

## Seam

**Definition:** A seam is a complete swappable capability made of three roles — a Service Definition owning its `ctx.<key>`, one or more Service Providers implementing it, and one or more Consumers injecting it (e.g. `dsh-shell` + `dsh-bash-local`/`dsh-bash-sandbox` + `dsh-tool-bash`).

> **In Claude Code terms:** it's why pointing one provider at a remote sandbox moves Bash, PTY, and LSP together — imagine if every built-in tool were behind a swappable interface the way MCP transports are.

Source: `docs/glossary.md:7-9` ("capability-seam" entry); see also `docs/architecture.md:100-102`.

## Profile

**Definition:** A profile is a named composition stored in the harness home (`$DSH_HOME/profiles/<name>`) listing the bundles it stacks, any out-of-tree plugins, and the user's own `cordis.patch.yml`; `web` and `headless` ship as templates.

> **In Claude Code terms:** a saved workspace identity — like combining `settings.json`, your installed-plugin set, and a launch command into one switchable name (`dsh --profile web`).

Source: `apps/cli/reference/README.md:9-13` (Profile boot) and `docs/architecture.md:17-27` ("A **profile** is a named composition stored in the Harness home"). Not covered by the two canonical primers; cited from the CLI reference.

## Preset

**Definition:** An agent preset is a named composition (a small Cordis patch plus metadata in a scanned preset root) that decides which prompt sections and model-facing tools a new session's agent gets; shipped presets live in `apps/cli/config/agent-presets/`, and user presets carry `user` trust — "the same trust as shell access".

> **In Claude Code terms:** picking a session type at start — closer to choosing an agent/subagent flavor than a theme: it changes the system prompt and the tool surface for that session.

Source: `docs/config-catalog.md:169-203` (`@deepseek-ai/dsh-agent-presets`, `PresetTrust`); shipped roster at `apps/cli/config/agent-presets/*/preset.yml`. Not covered by the two canonical primers; cited from the config catalog.

## patch.yml

**Definition:** `cordis.patch.yml` is a config-overlay file applied in ordered layers (each bundle in the profile, then the profile's own copy, then the home-level copy, then `--patch` flags) that targets a row by id, replaces that row's whole `config`, or inserts new rows — later layers win.

> **In Claude Code terms:** a deterministic settings override stack — like `settings.json` merges but stricter: whole-value replacement by row id, no deep merge, and `dsh --dump-config` shows you exactly which file supplied each row.

Source: `apps/cli/reference/README.md:9` (layer order and replace-whole-config semantics) and `docs/architecture.md:27`; expression interpolation background in `docs/cordis-primer.md:36-39` (Loader Configuration). Not covered by the canonical glossary; cited from the CLI reference.

## Skill

**Definition:** A skill is an optional set of instructions discovered by providers on `ctx.skills` and surfaced to the model through the `skill` tool — deliberately not a durable session event, just loadable guidance.

> **In Claude Code terms:** the same idea as Claude Code skills (a folder of instructions the model can pull in on demand) — if anything, DSH's version is more infrastructure-heavy, with provider registries and scoped layers.

Source: `docs/subsystems/skills.md:5` ("Skills are optional instructions, not session events"). Not covered by the two canonical primers; cited from the skills subsystem page.

## Trajectory

**Definition:** Trajectory is the web client's turn-aware ledger view of the session log — selectable User, Assistant, Tool, and nested Subtool records with token usage, durations, and a zoomable timeline, rendered read-only from session data ("nothing here reaches a model request").

> **In Claude Code terms:** like `claude --verbose` transcript output or a trace viewer promoted to a first-class UI tab — thick rules mark turn boundaries and inline markers mark steps, matching the glossary's turn/step vocabulary.

Source: `packages/client/ui-trajectory/README.md:5`; turn/step definitions at `docs/glossary.md:37-38`. Not covered by the two canonical primers; cited from the package README.

## Runtime modes (standard / code / minimal / creator)

**Definition:** The four shipped agent presets selected when creating a Web session, each a different balance of prompt sections and model-facing tools composed onto the same host.

| Mode | Directory | What it is (from its shipped description) |
|---|---|---|
| **standard** | `standard/` | Full coding agent: file editing, shell, file/web retrieval, Skills, plans, goals, subagents, workflows |
| **code** | `code/` | Everything standard has, but tools are presented through the Code Mode SDK so the model composes multi-step operations in one TypeScript program |
| **minimal** | `minimal/` | Two-tool coding agent: persistent `bash` plus `str_replace_editor` only, with the system prompt fixed to "You are a helpful software engineer assistant." |
| **creator** | `cordis/` | Everything standard has, plus runtime inspection, plugin experimentation, and preset-authoring guidance — the meta-mode for making new presets |

> **In Claude Code terms:** standard is default Claude Code; code is like the model writing a script that batches many tool calls instead of round-tripping each one (the process-wide `DSH_TOOLS_MODE` env var picks `native`/`code`/`both`); minimal is Claude Code stripped to just Bash and an edit tool; creator is like booting Claude Code pre-loaded to build agents and skills for you.

Sources: shipped descriptions in `apps/cli/config/agent-presets/{standard,code,minimal,cordis}/preset.yml`; minimal-preset and `DSH_TOOLS_MODE` behavior at `apps/cli/reference/README.md:85`. Not covered by the two canonical primers; cited from the CLI reference and shipped configs.
