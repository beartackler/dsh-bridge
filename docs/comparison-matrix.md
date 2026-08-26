# Harness Comparison Matrix

> Where DeepSeek Harness (DSH) already matches the CLI agents people are coming from, where it differs, and exactly what [dsh-bridge](../CHARTER.md) plans to add.

**What this document is.** An honest, side-by-side feature matrix of five coding-agent harnesses across the nine capability areas that new users notice first. It serves two audiences at once: a prospective user deciding whether DSH + dsh-bridge fits their workflow, and the dsh-bridge team using the same table as a gap checker against the [portable-features inventory](research/portable-features.md).

**Ground rules.**

- **No disparagement.** Every harness in this table is good software built by people solving real problems. Different design centers produce different surfaces; "absent" means *absent*, not *worse*. Several DSH design choices in here are genuinely better than what dsh-bridge is porting on top of them.
- **Factual or flagged.** Claims about DSH cite the reference checkout at `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master, shallow clone) via the Wave 1 research in [`research/dsh-capability-seams.md`](research/dsh-capability-seams.md) and [`research/portable-features.md`](research/portable-features.md). Claims about Claude Code, Codex CLI, OpenCode, and Jcode come from the shipped CLIs' documented surfaces as of late-2025/2026 releases and are **not** re-verified against a running build here. Anything uncertain is marked *(verify)*.
- **Moving targets.** All five projects ship fast. Codex CLI, OpenCode, and DSH in particular are pre-1.0 or in developer preview; treat exact command spellings as of the date below, not as permanent API.
- **The dsh-bridge column is unbuilt.** Every cell in it reads **Planned** and links to a spec or a research section. Nothing in that column is a claim about working software. When something ships, this file gets an evidence link and a status change — that is the point of keeping it in the repo.

**Legend.**

| Symbol | Meaning |
|---|---|
| ● | Native and first-class |
| ◐ | Present but partial, config-only, or requiring workarounds |
| ○ | Not present as a distinct feature |
| ◇ | **Planned** in dsh-bridge (spec linked, not built) |
| *(verify)* | Inferred from docs/READMEs, not exercised against a running build |

**Last reviewed:** 2026-08-25.

---

## 1. At-a-glance matrix

| Capability | Claude Code | Codex CLI | OpenCode | Jcode | DSH (today) | DSH + dsh-bridge (planned) |
|---|---|---|---|---|---|---|
| **Slash commands** | ● Large built-in set; custom `.claude/commands/*.md` with `$ARGUMENTS` | ● Built-in set; `/init`, `/status`, `/model`, `/approvals` | ● Built-in set; custom commands in `.opencode/command/` | ● Built-in set + `/skillname` skills | ● `ctx.commands` registry; commands are plugin registrations, never sent to the model (zero token cost) | ◇ Familiar-name layer + markdown command import ([portable-features §2](research/portable-features.md)) |
| **Model switching** | ● `/model`, `--model`, per-subagent model | ● `/model`, `--model`, `config.toml` profiles | ● `/models` picker across Models.dev catalog | ● Multi-route model selection | ● Model selection UI (`ui-model-selection`) + `llm-pi-ai` routes; adapters are a swappable seam | ◇ `/model <alias>` with cross-harness alias resolution |
| **MCP management** | ● `claude mcp add/list`, `/mcp`, `.mcp.json` | ● `codex mcp add`, config blocks | ● MCP servers via `opencode.json` | ◐ `mcp` tool: list/connect/disconnect/reload | ◐ Config-only: one `dsh-mcp-client` instance per server in `cordis.yml`; tools land as `mcp__<server>__<tool>` | ◇ `/mcp` add/list/remove/test by editing the profile patch |
| **Memory / instructions** | ● `CLAUDE.md` chain, `/memory`, `#` quick-add | ◐ `AGENTS.md` read at startup | ◐ `AGENTS.md` + rules config | ● `memory` tool (project/global scopes) + `AGENTS.md` | ◐ `agent-instructions` loads `AGENTS.md` → project → nested with `CLAUDE.md` dedupe; **read-only, no editor** | ◇ `/memory` viewer/editor + `#` quick-append over the existing loader |
| **Compaction** | ● Auto-compact + `/compact [focus]` | ● `/compact` | ● Auto-summarize + `/compact` | ● Automatic compaction | ● `dsh-command-compact` registers `/compact` globally; `spillStore` for overflow | ◇ Arg-passthrough parity check only — do not rebuild |
| **Resume** | ● `claude --resume` picker, `-c` continue | ● `codex resume`, `--last` | ● Session picker, `/sessions` | ● Session search + resume | ● `session-persistence` (jsonl/sqlite) + `session-query` + `/sessions` | ◇ Recent-first picker UX (title, cwd, age) + `--continue` flag parity |
| **Permissions / approvals** | ● Allow/ask/deny rules, `--dangerously-skip-permissions`, plan mode | ● `--ask-for-approval`, `--sandbox`, `--full-auto`, `--yolo` | ● Per-tool permission config | ● Per-tool gating + destructive-action hesitation | ● `permission-presets` (`read-only`/`ask`/`danger-full-access`), `tools/pre-execute` allow/deny/ask, `ctx.tools.guard()` monotonic denial, swappable `ctx.sandbox` | ◇ Vocabulary mapping only: each harness's flag spellings → DSH presets |
| **Plugins / extensions** | ● Plugin marketplaces, hooks, subagents | ◐ Hooks + MCP; no plugin marketplace | ● Plugin API + Models.dev ecosystem | ◐ Skills + MCP | ● **Everything is a plugin** (Cordis kernel); `dsh plugin --profile <p> add github:<owner>/<repo>`; ~60 `ctx.*` seams | ◇ Trust-graded install: [`/trust`](specs/commands/trust.md), [`/bridge:suggest`](specs/commands/suggest.md), [trust pipeline](trust/pipeline-architecture.md) |
| **Auth flows** | ● `/login` browser OAuth; `ANTHROPIC_API_KEY` | ● `codex login` (ChatGPT OAuth) or `--api-key` | ● `opencode auth login` provider picker | ● Connectors onboarding UI | ◐ `ctx.authorization.registerFlow()` seam exists + `ctx.credentials` reference resolution; **no guided multi-provider wizard** | ◇ [Onboarding wizard](design/onboarding-wizard.md): detect → explain precedence → choose → configure routes → smoke-test |

---

## 2. Notes per capability

Detail, caveats, and the honest "why the ◐" for each row.

### 2.1 Slash commands

All five harnesses agree on the `/` prefix and on a built-in set covering help, model, session, and config. The interesting differences are structural, not cosmetic:

- **Token cost.** DSH commands execute entirely host-side and are never serialized into the model's context (`packages/interaction/commands/README.md`). Handlers return `{kind, text}` for the UI adapter to render. Claude Code's custom markdown commands, by contrast, are *prompt templates* — they cost tokens by design, because expanding into a prompt is the feature.
- **Custom commands.** Claude Code (`.claude/commands/**/*.md`, frontmatter: `description`, `allowed-tools`, `argument-hint`, `model`; `$ARGUMENTS`/`$1` substitution) and OpenCode (`.opencode/command/`) let users author commands as files. DSH's equivalent seam is `ctx.skills` + `skill-filesystem`, which scans `.dsh/skills`, `.agents/skills`, and `$DSH_HOME/skills` with watch/HMR — a different file format for the same job.
- **Namespacing.** dsh-bridge's specs use `/bridge:install`-style names, but the DSH command grammar is letters/digits/`_`/`-`. Whether `:` is legal is an open question *(verify)* that blocks the naming decision for the whole plugin (see the open-questions list in [portable-features](research/portable-features.md)).
- **Shadowing.** DSH's registry is nearest-layer-wins, with duplicate names *within* one layer failing loudly at registration. Agent-scoped commands can therefore shadow globals — legal, but dsh-bridge should use it sparingly to avoid surprising users about which handler ran.

**Bridge plan:** a `/help` surface that groups commands and includes a "you used to type X, now type Y" column, plus an importer that reads existing `.claude/commands` and `.opencode/command` trees into `ctx.skills`.

### 2.2 Model switching

Everyone has this; the differences are in the vocabulary and in what a "model" is bound to.

- Codex binds models to **profiles** in `~/.codex/config.toml`, so switching model can also switch provider, base URL, and approval policy together. DSH's profile system (`~/.dsh/profiles/<name>/cordis.patch.yml`) is the closest structural analogue and is arguably more general, since a profile patch can change *any* plugin's config, not just model settings.
- DSH's model layer is a genuine seam: an adapter subclasses `LlmAdapter`, implements `async *stream()` over the StreamChunk protocol, and registers via `ctx.llm.registerAdapter([...])` (`docs/user/develop/practice/llm-adapter.md`). Adding a provider is a plugin, not a patch to the harness.
- What DSH lacks is the **typed command with fuzzy aliases** — `/model sonnet`, `/model gpt-5`, `/model deepseek-chat` — that refugees type reflexively.

**Bridge plan:** an alias table mapping familiar model names onto configured DSH routes, failing with a list of available routes rather than a silent no-op.

### 2.3 MCP management

This is DSH's clearest usability gap today, and it is a deliberate one.

- Claude Code, Codex, and OpenCode all offer runtime `mcp add` commands that write config for you.
- DSH is **config-only**: each MCP server is one `@deepseek-ai/dsh-mcp-client` plugin instance declared in `cordis.yml` (stdio or streamable-http), exposing tools as `mcp__<server>__<rawName>` (`packages/mcp/mcp-client/README.md`). There is no runtime add/remove API.
- The DSH CLI reference states that no MCP server is enabled by default "because each server command is trusted executable code outside the agent sandbox." That is a defensible security posture, not an oversight — MCP servers really do run unsandboxed, and every harness here inherits that risk.

**Bridge plan:** `/mcp` reads and writes the profile patch rather than hand-editing `cordis.yml`, lists registered `mcp__*` tools, and tests reachability. The security posture is preserved: adding a server still requires explicit user action and shows the exact command that will be executed.

### 2.4 Memory / persistent instructions

- DSH already **reads** the instruction chain — `$DSH_HOME/AGENTS.md` → project → nested, with `CLAUDE.md` dedupe (`packages/context/agent-instructions`). Files written by Claude Code work unchanged, which is a strong migration story that DSH under-advertises.
- What is missing is the **write** side: Claude Code's `/memory` (open the file in `$EDITOR`) and `#` quick-add (append a line mid-conversation), and Jcode's structured `memory` tool with project/global scopes and tags.
- Jcode's model is different in kind: a queryable store with categories and links, not a markdown file. dsh-bridge does not plan to port that; the markdown chain is what DSH's prompt assembly already consumes.

**Bridge plan:** `/memory` to view and edit the chain (showing which file each rule came from, since a five-deep chain is otherwise opaque) plus `#`-prefixed quick-append.

### 2.5 Compaction

Effectively at parity, and this row exists mostly to record that **dsh-bridge should build nothing here**.

- `@deepseek-ai/dsh-command-compact` registers `/compact` globally. DSH additionally has `ctx.spillStore` for overflow content, a seam the other four do not expose as a swappable backend.
- The one open item: does DSH's handler accept focus instructions after the command name (`/compact focus on the auth refactor`) the way Claude Code's does? *(verify)* If not, arg passthrough is a small patch, ideally upstreamed rather than shadowed.

### 2.6 Resume

- All four reference harnesses ship a session picker; the UX details (recent-first ordering, showing title, cwd, and age, plus a `-c`/`--continue` shortcut that skips the picker) are what make it feel instant.
- DSH has the harder half already: `session-persistence` with jsonl and sqlite backends, `session-query`, `session-log-export`, `session-checkpoint-policy`, and a `/sessions` command. The missing piece is the picker's presentation layer.

**Bridge plan:** a `popupSelect` client contribution over `session-query`, plus `--continue` flag parity. Note that DSH's swappable persistence backends mean the picker must query through the service, not read files directly.

### 2.7 Permissions and approvals

Substantively at parity, with different words for the same ideas — which is exactly why users get lost.

| Concept | Claude Code | Codex CLI | DSH |
|---|---|---|---|
| Read-only / plan | Plan mode (Shift+Tab) | `--sandbox read-only` | `plan-mode` (`/plan`), `read-only` preset |
| Ask before acting | Default allow/ask/deny rules | `--ask-for-approval` | `ask` preset, `tools/pre-execute` decision |
| Full autonomy | `--dangerously-skip-permissions` | `--full-auto`, `--yolo` | `danger-full-access` preset |

DSH's enforcement model has a property worth naming: `ctx.tools.guard()` denials are **monotonic** (a plugin can deny but never re-allow what another denied), and `tools/pre-execute` is a typed waterfall rather than a callback with ambiguous precedence. There is also a real limitation shared by all five: sandboxing is **per-tool-call, not per-plugin**, so a malicious plugin's effects run inside the host process. That limitation is precisely why the [trust layer](trust/pipeline-architecture.md) is the charter's headline feature rather than a nice-to-have.

**Bridge plan:** vocabulary mapping and documentation only. The scary flag names stay scary — refugees search for the literal string `--dangerously-skip-permissions`, so the alias must exist and must keep its warning.

### 2.8 Plugins and extensions

This is DSH's strongest row and the reason dsh-bridge is feasible at all.

- DSH is a Cordis microkernel where "every part of the product is a plugin … registrations are effects that unwind when their plugin unloads" (`docs/architecture.md`). Around 60 `ctx.*` services are classified in a generated capability-seams catalog. Models, tools, skills, sessions, sandboxes, storage, scheduling, and UI are all swappable.
- Lifecycle guarantees are unusually strong: a fiber state machine (PENDING→LOADING→ACTIVE→UNLOADING→DISPOSED/FAILED), dependency-driven loading, auto-disposal of dependents, and HMR on config edit.
- Claude Code's plugin marketplaces and OpenCode's plugin API are more *mature as ecosystems*; DSH's is more *capable as an architecture* but young and, per the [ecosystem audit](research/ecosystem-audit.md), thin on English-language and high-trust entries.

**Bridge plan:** the differentiator. Adversarial static + behavioral review producing a graded [trust report card](design/trust-report-card.md) with `file:line` evidence at a pinned commit, an install flow that prefers verified plugins, and [`/bridge:suggest`](specs/commands/suggest.md) to scaffold a new plugin when nothing suitable exists.

### 2.9 Auth flows

- DSH's credential design is, on the merits, the best of the five for a security-conscious user: configuration stores a **reference** (an env-var name like `apiKeyEnv: DEEPSEEK_API_KEY`), never a value. `resolve()` runs per operation across four layers — process env (wins, read-only), `$DSH_HOME/.credentials.yaml` (writable), project `.env`, user `.env` — and `describe()` answers "configured? from where? writable?" *without returning the secret*.
- What is missing is onboarding, not storage: no guided multi-provider wizard, no detection of credentials already on the machine, no smoke test. The `ctx.authorization.registerFlow({key, label, methods, run(session)})` seam exists for exactly this and is unused for cross-harness onboarding.
- **A line dsh-bridge will not cross.** Claude Code's `/login` mints a Claude-subscription token and Codex's login binds to a ChatGPT plan. Those grants are licensed to those clients. dsh-bridge will **detect and report** such credentials as "subscription auth, not reusable" and will never import them or impersonate a first-party OAuth client. Only API keys the user owns are offered for reuse, and the preferred path writes only an `apiKeyEnv:` reference — zero secret movement.

**Bridge plan:** the [onboarding wizard](design/onboarding-wizard.md) — detect (env, DSH layers, `~/.claude`, `~/.codex`, OpenCode `auth.json` honoring `XDG_*`, `~/.jcode`, plus local Ollama/LM Studio probes), explain which layer wins at request time, let the user choose per provider, write the route config, then smoke-test each route with a failure taxonomy (`MISSING_CREDENTIAL` vs 401 vs network vs unknown-model). Paired with [`/doctor`](specs/commands/doctor.md) for re-running the checks later.

---

## 3. Where DSH is already ahead

Worth stating plainly, because a matrix built around "what's missing" hides it:

- **Uniform extensibility.** One mental model — plugins with lifecycle-scoped effects — covers models, tools, UI, storage, and sandboxing. The other four expose several narrower extension points with different rules each.
- **Credential references over stored secrets.** Config that structurally cannot contain a key is a stronger guarantee than a `0600` file.
- **Swappable persistence and storage backends** registered side-by-side under names, with typed durable state via `ctx.storageDomain`.
- **Commands cost zero tokens** and cannot be invoked by the model unless you choose to expose them as tools.
- **Existing hooks and instruction files just work**: `hooks-claude-code` runs a user's existing Claude Code hook config (including `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`), `hooks-codex` covers the Codex dialect, and `agent-instructions` reads `CLAUDE.md`/`AGENTS.md` as-is.
- **Claude Code and Codex can run as subagents** from inside DSH (`subagent-claude-code`, `subagent-codex`) — migration does not have to be all-or-nothing.

---

## 4. Where dsh-bridge is deliberately not going

Scope discipline, recorded so it can be argued with:

| Not doing | Why |
|---|---|
| First-party subscription OAuth (Anthropic/OpenAI plans) | Those grants are licensed to those clients; impersonation crosses a legal and trust line (charter: *user owns their machine*) |
| Hosted `/share` links | Requires running a service; conflicts with "no network calls except documented ones" |
| Filesystem rewind / `/undo` | Needs a snapshot store DSH does not expose; an L-sized subsystem, not a port. Deferred past MVP |
| Reimplementing native features (`/theme`, `/compact`, hooks, todo, web search, image attachments) | Duplicate registrations fail loudly, and rebuilt features drift from upstream. Document and alias instead |
| Provider-side behavior (prompt-caching heuristics, cloud task delegation, Zen routing) | Not ours to move |
| Hijacking `/feedback` | It is native and points at the DSH maintainers; redirecting it would be user-hostile |

---

## 5. How to use this file as a gap checker

1. A row moves from ◇ to ● only when the feature ships **and** a link to the implementing package or command spec replaces the plan link.
2. Every *(verify)* marker is a task. Resolving one either upgrades a claim to cited fact or corrects it — both are edits to this file.
3. If a competing harness ships something that makes a row here wrong, fix the row. A marketing asset that is quietly out of date stops being a gap checker, and then it stops being trustworthy.
4. Re-review at each release of any of the five harnesses; bump **Last reviewed** above.

## Related documents

- [CHARTER.md](../CHARTER.md) — mission, principles, and star strategy
- [`research/portable-features.md`](research/portable-features.md) — ranked feature inventory with port difficulty and value
- [`research/dsh-capability-seams.md`](research/dsh-capability-seams.md) — what a DSH plugin can actually provide, with evidence paths
- [`research/ecosystem-audit.md`](research/ecosystem-audit.md) — state of the DSH plugin ecosystem
- [`specs/commands/`](specs/commands/) — [`/doctor`](specs/commands/doctor.md), [`/review`](specs/commands/review.md), [`/trust`](specs/commands/trust.md), [`/bridge:suggest`](specs/commands/suggest.md)
- [`design/onboarding-wizard.md`](design/onboarding-wizard.md), [`design/trust-report-card.md`](design/trust-report-card.md)
- [`trust/pipeline-architecture.md`](trust/pipeline-architecture.md) — the adversarial review pipeline
