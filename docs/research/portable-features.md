# Portable Features Inventory

> Wave 1 research for [dsh-bridge](../../CHARTER.md). Which daily-driver features of Claude Code, Codex CLI, OpenCode, and Jcode should dsh-bridge port into DeepSeek Harness (DSH), how much muscle-memory value each carries, and how hard each is to build as a DSH plugin.

**Method.** Feature surfaces for the four harnesses come from the author's working knowledge of the shipped CLIs (command names and behaviors as of late-2025/2026 releases). DSH-native capability was checked against the reference checkout at `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master), specifically: `packages/interaction/commands` (the `ctx.commands` slash registry), `packages/client/ui-commands` (client-side popup/leadingInput contributions), `packages/credentials/*`, `packages/skill/*`, `packages/mcp/mcp-client`, `packages/compaction/command-compact`, `packages/session-query/*`, `packages/hooks/hooks-claude-code`, `packages/hooks/hooks-codex`, `packages/subagent/subagent-claude-code`, `packages/subagent/subagent-codex`, `packages/context/agent-instructions`.

**Claims to re-verify before implementation.** Anything marked *(verify)* was inferred from package READMEs rather than exercised against a running DSH build.

**Difficulty scale.** S = config + a command handler (< ~200 LOC, no new seam). M = a real plugin with state, file I/O, or a UI slot. L = new subsystem, cross-package coordination, or a capability DSH does not currently expose.

**Value scale.** 5 = a refugee notices its absence in the first ten minutes. 1 = nice-to-have, rarely typed.

---

## 1. Ranked feature table

Ordered by (value desc, difficulty asc) — i.e. best return per unit of work first.

| # | Feature | Source harness(es) | Port difficulty | User value | Notes |
|---|---|---|---|---|---|
| 1 | `/help` — list every command with one-line descriptions | CC, Codex, OpenCode, Jcode | **S** | **5** | `ctx.commands.list(agent)` already returns name-sorted descriptors; render them. DSH's web client has fuzzy `/` discovery but no canonical `/help` text surface *(verify)*. Cheapest possible "I'm home" signal. |
| 2 | `/model` — switch model mid-session, show current | CC, Codex (`/model`, `--model`), OpenCode, Jcode | **S** | **5** | DSH has model selection UI (`ui-model-selection`) and pi-ai routes; bridge value is the *typed command with fuzzy alias* (`/model sonnet`, `/model gpt-5`, `/model deepseek-chat`) mapping familiar names onto DSH routes. |
| 3 | `/init` — scan repo, generate `AGENTS.md`/`CLAUDE.md` | CC (`/init`), Codex (`/init`), OpenCode, Jcode | **S** | **5** | Pure prompt-template skill; DSH already *reads* `AGENTS.md`/`CLAUDE.md` via `dsh-agent-instructions`, so the generated file works immediately. Highest value-to-effort ratio in the whole list. |
| 4 | `/login` / connectors — guided provider auth | CC (`/login` OAuth), Codex (`codex login`), OpenCode (`opencode auth login`), Jcode | **M** | **5** | See §4. DSH has `ctx.credentials` with a writable `$DSH_HOME/.credentials.yaml` layer; the missing piece is *detection + guided wizard + smoke test*, not storage. Charter's headline flow. |
| 5 | `/clear` — reset conversation, keep session | CC, Codex, OpenCode, Jcode | **S** | **5** | DSH exposes `/new` and session lifecycle; `/clear` is an alias-with-expected-semantics. Muscle memory is near-reflex. |
| 6 | `/resume` — pick a past session from a list | CC (`claude --resume`), Codex (`codex resume`), OpenCode, Jcode | **M** | **5** | DSH has `session-persistence`, `session-query`, `/sessions`. Bridge ports the *picker UX* (recent-first, title, cwd, age) as a `popupSelect` client contribution. |
| 7 | Plan mode / read-only mode toggle | CC (Shift+Tab plan mode), Codex (`--sandbox read-only`), Jcode | **S** | **5** | DSH ships `dsh-plan-mode` (`/plan [message]`) and `permission-presets` (`read-only`, `ask`, `danger-full-access`). Mostly an *alias + keybinding + status indicator* job, not new machinery. |
| 8 | Permission/approval presets, incl. YOLO mode | CC (`--dangerously-skip-permissions`), Codex (`--full-auto`, `--yolo`, `--ask-for-approval`), OpenCode | **S** | **5** | Map each harness's flag vocabulary onto DSH `permission-presets`. Must keep the scary name scary: refugees search for the exact string `--dangerously-skip-permissions`. |
| 9 | `/compact` — summarize history to reclaim context | CC, Codex, OpenCode, Jcode | **S** | **4** | **Already native**: `@deepseek-ai/dsh-command-compact` registers `/compact` globally. Bridge should only add `/compact <focus-instructions>` parity if DSH's handler ignores args *(verify)*. |
| 10 | `/mcp` — list/add/manage MCP servers, view tools | CC (`claude mcp add`, `/mcp`), Codex (`codex mcp add`), OpenCode | **M** | **4** | DSH has `dsh-mcp-client` but it is **config-only**: one plugin instance per server in `cordis.yml`. Bridge adds a command that reads/writes the profile patch and lists `mcp__<server>__<tool>` names. Big usability delta. |
| 11 | `/memory` — view/edit persistent instruction files | CC (`/memory`, `#` quick-add), Jcode (memory tool) | **M** | **4** | `dsh-agent-instructions` loads the chain (`$DSH_HOME/AGENTS.md` → project → nested, with `CLAUDE.md` dedupe). Bridge adds the *editor + `#` quick-append* affordance on top of an existing loader. |
| 12 | Custom slash commands from markdown files | CC (`.claude/commands/*.md`, `$ARGUMENTS`), OpenCode, Jcode skills | **M** | **4** | DSH `ctx.skills` + `skill-filesystem` is the natural seam; port CC frontmatter (`description`, `allowed-tools`, `argument-hint`, `model`) and `$ARGUMENTS`/`$1` substitution so existing `.claude/commands` trees just work. Strong migration story. |
| 13 | `@file` reference / fuzzy file completion in composer | CC, Codex, OpenCode, Jcode | **M** | **4** | DSH has `context/file-reference` + `file-reference-local` *(verify the composer trigger exists)*. If the trigger is missing this is the single most-typed missing keystroke. |
| 14 | `/review` — structured code review of diff | CC (`/review`, GitHub action), Codex (`codex review`) | **S** | **4** | Pure skill: `git diff` → review rubric → findings with `file:line`. Aligns with the charter's evidence-citation principle. |
| 15 | Headless / non-interactive one-shot (`-p`) | CC (`claude -p "..."`, `--output-format json`), Codex (`codex exec`), OpenCode (`opencode run`) | **M** | **4** | DSH has `bundle/headless` and an SDK/ACP path. Bridge value is the *familiar flag spelling* and stdout JSON shape for scripts people already wrote. |
| 16 | Session cost / token usage display | CC (`/cost`, `/status`), Codex (`/status`), OpenCode | **S** | **4** | DSH has `token-meter`, `session-stats`, `/status`. Port `/cost` as an alias with per-model pricing table in config. |
| 17 | Git-aware commit/PR helpers | CC (`/pr-comments`, commit skill), Jcode (commit-as-you-go) | **S** | **4** | Skill, not plugin code. Needs `gh` detection and graceful degradation (this machine's `gh` auth is broken — see charter constraints). |
| 18 | `/agents` — define & invoke named subagents | CC (`/agents`, `.claude/agents/*.md`), Jcode (`swarm`) | **M** | **4** | DSH has a rich subagent layer (`tool-subagent`, `subagent-claude-code`, `subagent-codex`, `agent-presets`). Port the CC *markdown agent definition* format onto `agent-presets`. |
| 19 | Hooks (PreToolUse/PostToolUse/etc.) | CC (`hooks.json`), Codex (notify hooks) | **S** | **3** | **Already native**: `dsh-hooks-claude-code` runs a user's existing CC hook config incl. `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`; `dsh-hooks-codex` covers the Codex dialect. Bridge should *document + detect*, never reimplement. |
| 20 | `/undo` / rewind / checkpoint restore | CC (`/rewind`, Esc-Esc), OpenCode (`/undo`, `/redo`) | **L** | **4** | DSH has `session-checkpoint-policy` for *history*, but filesystem rewind needs a snapshot store. High value, genuinely hard — defer past MVP. |
| 21 | `/export` / `/share` conversation | CC (`/export`), OpenCode (`/share` link), Jcode | **S** | **3** | Local export is native (`session-log-export`, `/export`). Hosted `/share` requires a server dsh-bridge should not run — port export only. |
| 22 | `/theme` — light/dark/custom | CC, Codex, OpenCode, Jcode | **S** | **3** | **Already native** (`ui-theme`, `/theme`). Skip; only ensure BRAND_GUIDELINES-compliant bridge UI respects it. |
| 23 | `/status` / `/doctor` — env & config diagnostics | CC (`/status`, `/doctor`), Codex (`/status`) | **M** | **4** | DSH has `/status` and `runtime-diagnostics/invariants`. `/doctor` (auth reachable? node version? sandbox working? MCP servers up?) is a *great* first-run trust artifact and pairs with the connectors flow. |
| 24 | Bash passthrough (`!cmd`) and output capture | CC (`!` prefix), OpenCode | **S** | **3** | Composer `leadingInput` command kind exists in `ui-commands` — a natural fit *(verify `!` can be registered; the parser requires a leading `/`)*. If `!` is unreachable, offer `/sh`. |
| 25 | Image paste / drag into composer | CC, Codex, OpenCode, Jcode | **S** | **3** | **Already native**: `ctx.commands` has a first-class `input.images` declaration and `ui-attachment`. Document, don't build. |
| 26 | `/vim` / editor keybindings | CC (`/vim`), OpenCode | **M** | **2** | Small, loud constituency. Client-side only. |
| 27 | `/config` settings editor | CC, Codex (`/config`), OpenCode | **S** | **3** | **Already native** (`/config`, `settings`, `ui-settings`). Bridge only adds bridge-owned sections. |
| 28 | Web search / fetch tools | CC (WebSearch/WebFetch), Codex (`--search`), Jcode | **S** | **3** | **Already native**: `web-search-deepseek`, `web-search-exa`, `web-search-perplexity`, `web-fetch-http`. Bridge maps familiar tool names and helps pick a provider during onboarding. |
| 29 | TODO/task list rendering | CC (TodoWrite), Jcode (`todo`) | **S** | **2** | **Already native** (`tool-todo`, `ui-plan`). |
| 30 | Background/long-running tasks | CC (Ctrl-B background bash), Jcode (`bg`), OpenCode | **M** | **3** | DSH has `jobs`, `tool-jobs`, `ui-jobs`. Alias + docs. |
| 31 | `/feedback` / bug report | CC (`/bug`), Jcode (`maintainer_feedback`) | **S** | **1** | **Already native** (`command-feedback`). Bridge must not hijack it to its own tracker. |
| 32 | Terminal notifications on completion | CC (`terminal-bell`), Codex (`notify`), OpenCode | **S** | **2** | OS-notify via hooks; cheap polish for long runs. |
| 33 | `--continue` / auto-resume last session | CC (`claude -c`), Codex, OpenCode | **S** | **3** | CLI-flag parity on top of #6; trivial once the picker exists. |
| 34 | Profiles per project/provider | Codex (`--profile`, `config.toml` profiles) | **S** | **3** | DSH profiles already exist (`~/.dsh/profiles/<name>/cordis.patch.yml`, `dsh plugin --profile web add …`). Document the mapping. |
| 35 | Plugin/marketplace install command | CC (plugin marketplaces), OpenCode plugins | **M** | **4** | The charter's `/bridge:install <plugin>` + trust report card. Not strictly "porting" — it's the differentiator. Sequenced after MVP but before launch. |

---

## 2. Top 10 MVP cut

The minimum set that makes a Claude Code or Codex refugee stop noticing they switched. Chosen for reflex frequency, not sophistication.

1. **`/help`** — canonical, grouped, one screen. Includes a "you used to type X, now type Y" migration column. Nothing else lands if discovery fails.
2. **`/login` (connectors wizard)** — detect existing credentials, pick routes, smoke-test, never print secrets. See §4.
3. **`/init`** — generate `AGENTS.md` from the repo. DSH already reads the result, so the payoff is immediate.
4. **`/model`** — switch and show, with familiar aliases resolving to DSH routes.
5. **`/clear` + `/resume` (+ `--continue`)** — session reflexes; three commands, one session-picker component.
6. **Permission presets with familiar flag names** — `--dangerously-skip-permissions`, `--full-auto`, `--yolo`, `--ask-for-approval` mapped onto DSH presets, with plan mode reachable by Shift+Tab.
7. **`/doctor`** — one command that proves the install works: credentials reachable, model responding, sandbox functional, MCP servers reachable. Doubles as the bug-report artifact and the trust story's front door.
8. **Custom markdown commands** — read `.claude/commands/**/*.md` and `.opencode/command/*.md` into `ctx.skills` with `$ARGUMENTS` substitution. Users bring their own muscle memory with them.
9. **`/mcp` management** — list, add, remove, test servers by editing the profile patch instead of hand-editing `cordis.yml`.
10. **`/memory`** — view/edit the instruction chain plus `#` quick-append. Second most-cited "where did my setup go" complaint after auth.

**Explicitly deferred from MVP:** `/undo` (needs a snapshot store), `/share` (needs hosting), `/vim`, marketplace install (post-MVP, pre-launch), `/agents` markdown format.

---

## 3. Not portable, or already native in DSH

**Already native — document and alias, do not rebuild.** Duplicating these wastes effort and creates command-name collisions, which `ctx.commands` fails loudly on (duplicate names within one layer throw at registration).

| Native capability | DSH package | Bridge's correct role |
|---|---|---|
| `/compact` | `compaction/command-compact` | Verify arg-passthrough parity only |
| `/theme` | `client/ui-theme` | Respect it in bridge UI |
| `/config`, settings | `settings/*`, `client/ui-settings*` | Contribute bridge sections |
| `/export` (local) | `session-query/session-log-export` | Alias, format parity |
| `/feedback` | `feedback/command-feedback` | Leave alone |
| `/plan`, plan mode | `plan/plan-mode` | Alias + keybinding + indicator |
| Permission presets | `interaction/permission-presets` | Vocabulary mapping |
| TODO list | `todo/tool-todo`, `client/ui-plan` | Nothing |
| Web search/fetch | `web/*` | Provider choice during onboarding |
| Background jobs | `jobs/*`, `client/ui-jobs` | Alias + docs |
| Image attachments | `attachment/*`, `commands` `input.images` | Docs |
| `AGENTS.md`/`CLAUDE.md` loading | `context/agent-instructions` | Build `/memory` on top |
| CC & Codex hooks | `hooks/hooks-claude-code`, `hooks/hooks-codex` | **Detect and report** existing hook configs during onboarding — a delightful "your hooks already work" moment |
| CC & Codex as subagents | `subagent/subagent-claude-code`, `subagent/subagent-codex` | Surface in `/agents`; refugees can keep using their old CLI *from inside* DSH |
| MCP tool exposure | `mcp/mcp-client` | Add management UX, not the client |
| Sandboxing | `sandbox/*`, `shell/bash-sandbox` | Vocabulary mapping only |

**Not portable at all:**

- **OAuth to Anthropic/OpenAI first-party subscription plans.** `/login` in Claude Code mints a Claude-subscription token; Codex's login binds to a ChatGPT plan. Those grants are licensed for those clients. dsh-bridge must **detect** existing credentials and let a user opt into reusing an API key they own — it must never impersonate a first-party client or re-implement a subscription OAuth flow. This is a licensing and trust line the charter's "user owns their machine" principle forbids crossing.
- **Hosted `/share` links** — requires running a service; out of scope for a plugin that promises no undocumented network calls.
- **Provider-side features** (Claude's server-side prompt caching heuristics, Codex's cloud task delegation, OpenCode Zen routing). Not ours to move.
- **Filesystem rewind semantics of `/rewind`** — portable in principle, but needs a checkpointing store DSH does not expose today. Treat as an L-sized future subsystem, not a port.
- **Terminal-emulator-specific bindings** (iTerm/tmux integrations, Ctrl-B conflicts) — environment-dependent; document workarounds instead.

---

## 4. Connectors / auth flow comparison

### How each harness does provider setup

| Harness | Interactive | Non-interactive | Credential store | Env vars honored |
|---|---|---|---|---|
| **Claude Code** | `/login` (browser OAuth), `claude setup-token` | `ANTHROPIC_API_KEY` in env; `apiKeyHelper` in settings; `settings.json` `env` block | `~/.claude/.credentials.json` (macOS: also Keychain, service "Claude Code"); config in `~/.claude/settings.json`, project `.claude/settings.json`, `.claude/settings.local.json` | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_*`/`GOOGLE_*` for those backends |
| **Codex CLI** | `codex login` (ChatGPT OAuth), `codex login --api-key <k>` | `OPENAI_API_KEY` env; `--api-key` flag; `~/.codex/config.toml` with `model_provider` blocks | `~/.codex/auth.json` (holds either the API key or OAuth tokens); config `~/.codex/config.toml` (profiles, providers, `env_key`) | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, plus arbitrary `env_key` names declared per custom provider |
| **OpenCode** | `opencode auth login` (provider picker, OAuth or key) | `opencode auth login --provider x --api-key y`-style; env vars; `opencode.json` `provider` blocks | `~/.local/share/opencode/auth.json` (0600); config `~/.config/opencode/opencode.json`, project `opencode.json` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, and Models.dev-catalog provider keys |
| **Jcode** | Connectors onboarding UI | Env vars, config file | `~/.jcode/` config tree | Provider-native keys; supports multi-route model selection |
| **DSH (today)** | `/config` settings UI | `cordis.yml` / profile patch `apiKeyEnv:` references | `$DSH_HOME/.credentials.yaml` (writable), `$DSH_HOME/.env`, project `.env`, process env | Any name, because config carries a **reference** (`apiKeyEnv: DEEPSEEK_API_KEY`), not a value |

### DSH's structural advantage

`dsh-credentials` never stores a secret in configuration: settings hold a `CredentialRef` (an env-var *name*), and `resolve(ref)` runs per operation against four layers — process env (`env`, read-only, always wins), `$DSH_HOME/.credentials.yaml` (`file`, writable), project `.env` (`project-env`), user `.env` (`user-env`). `describe()` answers "configured? from where? writable?" **without returning the value**. That is exactly the primitive a trustworthy connectors wizard needs: dsh-bridge can render complete auth status without ever holding a secret, satisfying the charter's "never print secrets, never exfiltrate."

Note also the empty-value rule: a blank stored value is *absent* everywhere, so a wizard must not treat "key present but empty" as configured.

### What a DSH connectors flow should detect

Detection order, most-specific first. **Read-only probing; never copy a secret into DSH storage without explicit per-provider consent.**

1. **Process env (highest precedence, matching DSH's own layering):** `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`, `TOGETHER_API_KEY`, `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`, `AWS_PROFILE`/`AWS_REGION` (Bedrock), `GOOGLE_APPLICATION_CREDENTIALS` (Vertex), `OLLAMA_HOST`, `LM_STUDIO_*`.
2. **Existing DSH layers:** `$DSH_HOME/.credentials.yaml`, `$DSH_HOME/.env`, `<cwd>/.env` — report which layer wins and whether it is writable, using `describe()` only.
3. **Claude Code:** `~/.claude/.credentials.json` (OAuth tokens — **detect and report as "subscription auth, not reusable"**, do not import), `~/.claude/settings.json` `env` block and `apiKeyHelper`, project `.claude/settings.json` / `.claude/settings.local.json`, macOS Keychain entry (presence only; never unlock silently).
4. **Codex:** `~/.codex/auth.json` (distinguish `OPENAI_API_KEY`-style key from OAuth token payload — only the former is offerable for reuse), `~/.codex/config.toml` for `model_provider`, `base_url`, `env_key`, and profiles.
5. **OpenCode:** `~/.local/share/opencode/auth.json` (per-provider records, mixed `api` and `oauth` types), `~/.config/opencode/opencode.json` and project `opencode.json` for provider/model config. Note the XDG override: honor `XDG_DATA_HOME` / `XDG_CONFIG_HOME` rather than hardcoding.
6. **Jcode:** `~/.jcode/` config for configured routes.
7. **Local runtimes:** probe `http://localhost:11434` (Ollama) and `:1234` (LM Studio) — a zero-key path matters to the r/LocalLLaMA audience named in the star strategy.
8. **Related tooling worth reporting, not importing:** `~/.claude/hooks.json` and Codex hook config (DSH can already run them — a "your hooks work here" moment), `.mcp.json` / `~/.claude.json` MCP servers, `.claude/commands/`, `.claude/agents/`, existing `CLAUDE.md`/`AGENTS.md`.

### Flow the wizard should implement

1. **Detect** — probe every source above; show a table of provider × source × status. Values are never rendered; show only `configured / empty / absent` plus the winning source name and a masked fingerprint (e.g. last 4 chars) **only** if the user asks.
2. **Explain precedence** — tell the user which layer will actually win at request time, because DSH resolves per operation and a stale `.env` silently losing to process env is the #1 confusing failure.
3. **Choose** — for each provider, offer: use existing env reference (**preferred — writes only `apiKeyEnv:`, zero secret movement**), paste a new key into the writable `.credentials.yaml` layer, or skip. Never auto-import a third-party harness's OAuth token.
4. **Configure routes** — write `~/.dsh/profiles/<name>/cordis.patch.yml` with `@deepseek-ai/dsh-llm-pi-ai` provider profiles keyed by route, each carrying `apiKeyEnv` and optional `baseURL`. Config-over-code, per the charter.
5. **Smoke-test** — one cheap request per configured route; report latency, model id echoed back, and a clear failure taxonomy (`MISSING_CREDENTIAL` vs 401 vs network vs unknown-model). `dsh-llm-pi-ai` already fails with `MISSING_CREDENTIAL` when a declared reference resolves to nothing, which gives us a precise message instead of a generic 401.
6. **Record** — write a human-readable summary to the session and offer `/doctor` for re-running it later. No telemetry.

**Non-negotiables for this flow:** read-only until consent; no secret ever printed, logged, or sent anywhere; no first-party OAuth impersonation; every file touched is named in the UI before it is touched.

---

## Open questions for the next wave

- Does `ctx.commands`' `parseCommand()` (slash at byte zero, lowercase name) permit a `!bash` passthrough trigger, or must bridge offer `/sh`? *(verify)*
- Does DSH's composer already implement an `@file` trigger over `context/file-reference`, or is only the service present? *(verify — changes feature #13 from S to M/L)*
- Does native `/compact` accept focus instructions after the command name? *(verify)*
- Namespacing: `/bridge:install` implies colon-namespaced commands, but the parser's name grammar is letters/digits/`_`/`-`. Confirm whether `:` is legal in a command name, or whether bridge must use `/bridge-install`. **This blocks the command-naming decision for the whole plugin.**
- Can a plugin register a command name that shadows a native one (e.g. `/compact` with arg support) at the agent layer, and is that desirable? The registry says nearest-layer-wins with duplicates failing *within* one layer — so shadowing appears legal but should be used sparingly.
