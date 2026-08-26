# DSH Capability Seams Map

> Wave 1 research for [dsh-bridge](../../CHARTER.md). What a DeepSeek Harness (DSH) plugin can actually provide, the exact mechanics to scaffold one, and which seams dsh-bridge needs for its four headline features (familiar slash commands, connectors auth flow, plugin-browser UI panel, installed-plugin metadata reading for trust reports).

**Method.** All claims cite paths inside the read-only reference checkout at `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master, shallow clone). Docs marked *generated* (`docs/capability-seams.md`, `docs/tool-catalog.md`) are machine-generated from source with completeness guards, so they are high-trust. Claims marked *(verify)* were inferred from READMEs/source, not exercised against a running build.

**Framing fact.** DSH is a Cordis microkernel: "every part of the product is a plugin … you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads" (`docs/architecture.md`). The canonical seam catalog is the generated graph+table in `docs/capability-seams.md` (~60 `ctx.*` services classified as core spine / swappable seam / bundle).

---

## 1. What a DSH plugin CAN provide

A plugin is any module exporting `apply(ctx)` (plus optional `name`, `inject`, `Config`); three forms exist (function/object/Service subclass) — `docs/user/develop/basic/index.md`. Everything below is reachable from `apply`.

| Capability | Seam / mechanism | Evidence |
|---|---|---|
| **Tools** | `ctx.tools.register(defineTool({...}))` — typed params DSL or raw JSON-Schema (that's how MCP tools arrive). Registration is an effect; schemas flow into system-prompt assembly automatically. Execution passes through pre-policy → guards → around → post-policy → result observation. | `docs/user/develop/basic/tool.md`; `docs/cookbook/adding-a-tool.md`; `docs/tool-catalog.md` (generated catalog of every shipped tool); `packages/core/tools/` |
| **Agent-loop hooks** | Plain event listeners on waterfalls: `tools/pre-execute` (typed allow/deny/ask decisions), `tools/post-execute`, `tools/result`, `tools/execute` (wrap dispatch lifetime), `agent/session-start`, `agent/pre-step`, `agent/request`, `agent/turn-stopping`. "A native hook is an ordinary Cordis plugin on an interception point." Monotonic denials via `ctx.tools.guard()`; filtering via `ctx.tools.restrict()`. | `docs/cookbook/extension-cookbook.md` ("A hook plugin" + feature→mechanism map); `docs/user/develop/framework/events.md` |
| **Slash commands** | `ctx.commands.register(definition)` — lowercase name, description, optional input hint/images flag, abortable handler returning `{kind:'success'|'error', text}` rendered by the UI adapter. Never sent to the model; zero token cost. Agent-scoped variants shadow globals. Disposer unregisters; `commands/change` notifies live UIs. | `packages/interaction/commands/README.md`; `packages/interaction/commands/src/types.ts` (`CommandDefinition` family); `src/index.ts` `register()` returns the effect disposer |
| **Skills** | Provide a provider on the `ctx.skills` registry (like `skill-filesystem`, which scans `.dsh/skills`, `.agents/skills`, `$DSH_HOME/skills`, custom dirs, with watch/HMR) — or ship markdown skills into those roots. Frontmatter: `name`, `description`, `whenToUse`, `disable-model-invocation`, `user-invocable`. Model loads via the `skill` tool. | `packages/skill/skill-filesystem/README.md`; capability row `ctx.skills` in `docs/capability-seams.md`; `packages/skill/tool-skill/` |
| **System-prompt sections** | `ctx.systemPrompt.section(...)` with ordering + scope-local shadowing; AGENTS.md ingestion is just a section provider. | `docs/cookbook/extension-cookbook.md` (map rows "System prompt configurability", "AGENTS.md"); `packages/core/system-prompt/` |
| **Model providers** | Subclass `LlmAdapter`, implement `async *stream(options)` over the StreamChunk protocol (`block-start/text-delta/tool-call-delta/block-end/usage/finish`), register with `ctx.llm.registerAdapter(['provider-id'], adapter)`. Optional `resolveModel()`/`listModels()`. Errors as `LlmError` with stable codes; requests must merge `attributionHeaders()` and honor `signal`. | `docs/user/develop/practice/llm-adapter.md`; reference impls `packages/llm/llm-deepseek/`, `packages/llm/llm-pi-ai/` |
| **Credentials & OAuth flows** | `ctx.credentials` (reference→secret resolution, write-through to managed store) + **`ctx.authorization.registerFlow({key,label,methods,run(session)})`**: a flow owns its conversation with the human (`session.notify`, `session.prompt`) and commits the credential record before resolving. One attempt per key; cancel supported; headless callers decline prompts. | `packages/credentials/authorization/README.md`; `docs/capability-seams.md` rows `ctx.credentials`, `ctx.authorization`; user-facing flows in `docs/user/guide/providers.md` |
| **Session/storage backends** | Swap `ctx.sessionPersistence` (jsonl/sqlite), `ctx.storage` backends (json/sqlite) registered side-by-side under names, `ctx.storageDomain` for typed durable state, `ctx.attachments`, `ctx.spillStore`. Apps choose backends at composition time. | `docs/capability-seams.md` rows `ctx.sessionPersistence`, `ctx.storage`, `ctx.storageDomain`, `ctx.attachments`, `ctx.spillStore`; `packages/storage/storage-domain/` |
| **Scheduler** | Session-local reminders: model tools `schedule_create/list/delete` + timer owner that re-enters the conversation via the Agent follow-up queue when a root Agent is live; cold sessions resume overdue work on wake. Cron-style external scheduling is documented as a plugin pattern (timer fires → `followup(…, {source:{kind:'cron'}})`). Background jobs are separate: `ctx.jobs` + `tool-jobs`. | `packages/schedule/README.md`; `docs/tool-catalog.md` (`@deepseek-ai/dsh-schedule` row); `docs/cookbook/extension-cookbook.md` ("Scheduled tasks (cron)"); `packages/jobs/` |
| **UI components (Web client)** | Two halves in one package: Host half under `src/`, browser half under `src/client/` exported as `./client` and declared via `"dsh": {"client": {...}}` in `package.json`. Browser plugins register React components into declared slots via the slot registry (`ctx.slots.inject()`), contribute Settings tabs (`settings.plugins.tab`), conversation nodes (`ConversationNodeDefinition`), command palette entries. The Node half scans enabled Loader entries for `dsh.client` packages, builds the boot graph, serves bundles under `/plugins`. | `docs/cookbook/adding-a-settings-card.md`; `packages/client/ui-slots/README.md`; `packages/client/modules/README.md`; `packages/client/ui-conversation/` (+ guide `docs/cookbook/adding-a-conversation-node.md`) |
| **Settings surfaces** | `installSettingsSection(ctx, namespace, schema, ...)` registers a settings namespace; a browser card keyed on the same namespace auto-pairs into Settings → Plugins. Works for out-of-repo plugins unchanged. | `docs/cookbook/adding-a-settings-card.md`; `packages/client/ui-settings-plugins/README.md`; `packages/settings/settings/` |
| **MCP integration** | Ship-of-theseus point: each MCP server maps to one plugin instance in `cordis.yml`; config-only today (no runtime add/remove API) — an opportunity, not a limitation, for `/mcp`. Detailed facts (transports, `mcp__<server>__<rawName>` tool naming, config shape, layer order, reconnect/live-reload behavior) are maintained in one place, **`mcp-gap-analysis.md`** (same directory), the authoritative source — do not duplicate them here. | `packages/mcp/mcp-client/README.md`; `apps/cli/reference/README.md`; **authoritative pointer:** `mcp-gap-analysis.md` |
| **Subagents / presets** | Providers onto `ctx.subagents` (spawn/fork in-process, ACP, Codex, Claude Code bridges); per-session composition via `agent-presets` mounting preset `cordis.yml` under agent scopes. | `docs/capability-seams.md` rows `ctx.subagents`, `ctx.agentPresets`; `docs/cookbook/extension-cookbook.md` |
| **Sandbox/shell/fs replacement** | Swappable seams: `ctx.shell` (bash-local/bash-sandbox/pwsh-local), `ctx.sandbox` + `ctx.sandboxPolicy`, `ctx.fs`, `ctx.subprocess`, `ctx.terminals`, `ctx.codeRuntime` (Code Mode). | `docs/capability-seams.md` table; three-role pattern tutorial `docs/user/develop/practice/index.md` |
| **HTTP routes + dynamic browser panels** | `ctx.webServer` named-route registration; `ctx.clientModules` composes/serves plugin browser bundles; `shell.overlay` slot hosts frame-wide floating panels (the shipped `ui-cordis` approval panel is the worked example). | `docs/capability-seams.md` rows `ctx.webServer`, `ctx.clientModules`; `packages/extensions/ui-cordis/README.md` |

**Lifecycle guarantees that matter to us:** every registration through `ctx` is undone on unload (`docs/user/develop/framework/index.md` — fiber state machine PENDING→LOADING→ACTIVE→UNLOADING→DISPOSED/FAILED); dependency-driven loading waits for `inject`ed services and auto-disposes dependents when a service disappears; HMR hot-replaces plugins on config edit (`docs/user/develop/basic/config.md` §Work with HMR). Security consequence: a malicious plugin's effects all run inside the host process — sandboxing is per-tool-call, not per-plugin.

---

## 2. Exact mechanics to scaffold a plugin

### Package shape (bundle)

From `docs/user/develop/basic/publish.md`:

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

```jsonc
// package.json — the load-bearing parts
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
# cordis.patch.yml — rows resolve the package by NAME (Node resolution),
# not relative path, so installed code is found
- insert:
    - id: hello
      name: dsh-hello-plugin
```

Key manifest rules (all from `basic/publish.md`):
- A package **without** `dsh.bundle` installs as a plain dependency with only a warning — right shape for libraries other plugins import.
- A **profile** (`$DSH_HOME/profiles/<name>/package.json` with `dsh.profile.bundles` + the user's own `cordis.patch.yml`) is never hand-written; `dsh plugin` maintains it.
- Layer order: bundles in profile order → profile patch → home-level `$DSH_HOME/cordis.patch.yml` → `--patch` overlays. Later layers win **per row**, and a patch replaces a row's whole `config` (no deep merge).
- Plugin entry exports: `name`, optional `inject = [...]` (services awaited before `apply`), optional `Config` Schemastery schema (must be a real Schema, not a plain object), `apply(ctx, config)` — `docs/user/develop/basic/config.md`.
- Config values may be `!!js` expressions evaluated against injected services (`port: !!js ctx.webStartup.port ?? 3080`), including `!!js process.env.X` for env passthrough — `basic/publish.md` §surface bundle, `packages/bundle/base/cordis.patch.yml` rows.

### Peer dependencies

The framework packages every plugin peer-depends on:
- `@deepseek-ai/cordis` — `Context`, `Service`, declaration merging for `ctx.<key>` typing and typed events (`docs/user/develop/framework/service.md`, `events.md`)
- `@deepseek-ai/schemastery` — `Config` schemas (`docs/user/develop/basic/config.md`)
- Capability-typed helpers per feature: `@deepseek-ai/dsh-tools` (`defineTool`), `@deepseek-ai/dsh-llm` (`LlmAdapter`), etc.

This matches what dsh-ponytail already proved works in a real published plugin (per CHARTER): peer deps `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`, install via `dsh plugin --profile web add github:MengYuil/dsh-ponytail`, profile layer landing in `~/.dsh/profiles/<name>/cordis.patch.yml`.

### Install command patterns

All forward to pnpm inside the profile dir, then reconcile `dsh.profile.bundles` (`apps/cli/reference/README.md` §plugin management):

```sh
dsh plugin --profile web add github:MengYuil/dsh-ponytail   # git spec (proven by ponytail)
dsh plugin --profile demo add ./hello-plugin                 # local checkout (link:)
dsh plugin --profile demo add your-package                   # npm, prebuilt lib/
dsh plugin --profile demo add ./hello-plugin-0.1.0.tgz      # tarball
dsh --profile demo --dump-config                             # verify layer without booting
dsh plugin --profile demo remove dsh-hello-plugin
```

**Git-install catch (critical for our installer UX):** a git install fetches *sources* and executes nothing by default. Under pnpm ≥10 (the tool `dsh plugin` forwards to — `apps/cli/src/args.ts:171`), build-script execution is gated: the first `add` fails because pnpm refuses to run a git dependency's `prepare` script until the user explicitly allowlists it in the profile's `pnpm-workspace.yaml` (`allowBuilds: { <pkg>: true }`) and re-runs. The docs themselves call this allowance "permission to execute the package's code on your machine at install time, outside any sandbox" and recommend pinning `github:owner/repo#<sha>` (`basic/publish.md:163-173`). Packages distributed as prebuilt artifacts (npm with `lib/`, or tarballs) need no build allowance at all. Net effect: install-time code execution is conditional, not automatic — the user's `allowBuilds` entry is the trust boundary, and our installer should surface exactly this warning + pinning.

Dev loop while authoring (no packaging needed): absolute-path insert rows in a scratch `cordis.yml` + `pnpm dsh web --patch ./scratch-plugin/cordis.yml`, HMR reloads on edit — `docs/user/develop/basic/index.md`.

---

## 3. Seams dsh-bridge needs

### 3.1 Custom slash commands (`/help`, `/model`, `/login`, `/bridge:*`…)

Seam: `ctx.commands` — fully sufficient. `inject: ['commands']`, `ctx.commands.register({ name, description, input?: { hint, images? }, handler })`; handler receives parsed `rawInput` and returns `{ kind:'success'|'error', text }` rendered by every composed UI adapter; nothing reaches the model unless the handler explicitly schedules agent work (`packages/interaction/commands/README.md`). Scoped shadowing lets us register per-agent variants later. Verified command names matter for alias planning: the shipped preset-switch command is `/permission`, registered as `name: 'permission'` at `packages/interaction/permission-presets/src/index.ts:275`, and bare invocation reports the current preset plus available names (`/permissionPresets` does not exist — see Revision 1). Gaps to design around *(verify)*: commands accept only unstructured text (no typed args/forms — listed under Known Limitations); unknown slash input is rejected by adapters rather than passed to us, so discovery of our own commands rides `commands/change` + `list(agent)`.

For CC-style *markdown-file* commands (`.claude/commands/*.md`), the better seam is `ctx.skills` via `skill-filesystem` roots with `user-invocable` frontmatter (§1 skills row) — porting frontmatter semantics is a translation problem, not new machinery.

### 3.2 Guided auth / connectors flow

Three seams compose:
1. **Detection** (read existing creds from `~/.claude`, `~/.codex`, opencode `auth.json`, env): plain Node fs in our plugin's `apply`; no DSH seam involved. Never print secrets — read-only parsing.
2. **Configuration**: write provider profiles into `$DSH_HOME/settings.yaml` via the settings seam (`ctx.settings` user layer; `installSettingsSection` pattern shows namespaced writes with validation hooks — `docs/cookbook/adding-a-settings-card.md`). For pi-ai routes, writing the `llm-pi-ai:` settings section is literally what the Models page does; routes go live/dormant without restart (`packages/bundle/base/cordis.patch.yml`, `llm-pi-ai` row comment).
3. **Verification/OAuth**: smoke test via `ctx.llm` request against the configured route; native OAuth via `ctx.authorization.registerFlow(...)` (notify/prompt conversation, commit-through-flow lifecycle — `packages/credentials/authorization/README.md`).

Secret hygiene is enforced upstream: configuration carries references, the managed document stores values, responses are redacted/write-only views (`docs/capability-seams.md` `ctx.settings`/`ctx.credentials` rows).

### 3.3 Plugin-browser UI panel

Proven pattern, two halves in one package:
- Host half: normal plugin (services, remotes).
- Browser half: `exports["./client"]` + `"dsh": {"client": {"inject": [...], "platform": "web"}}` in package.json (`packages/client/ui-commands/package.json` is a concrete manifest); the Node half scans Loader entries for these and serves bundles under `/plugins` (`packages/client/modules/README.md`).
- Rendering: register components into declared slots (`ctx.slots.inject()` — `packages/client/ui-slots/README.md`, `ui-runtime`); frame-wide floating UI goes in the `shell.overlay` slot like `ui-cordis`'s global approval panel; a Settings tab comes free via `settings.plugins.tab` (`ui-settings-plugins` extension-point section).
- Data: talk to our host half through Typert remotes consumed via the `api-remotes` facade (`ctx.remote.$mount()` / `$dispatch` — `packages/api/remotes/README.md`, `packages/client/runtime/README.md`).

So the dsh-bridge plugin browser = one browser-half panel (overlay or sidebar slot) listing marketplace plugins, backed by host-half remotes that fetch our verified-catalog JSON and produce trust report cards. No fork of the web app required *(verify: slot key set for sidebar/panel placement)*.

### 3.4 Reading installed-plugin metadata for security scanning

What exists natively:
- **Runtime projection**: `pluginInventory/list` Remote returns `{entryId, moduleName, enabled, fiberPhase}` for every non-group Loader entry — deliberately point-in-time, explicitly **no provenance/version/bundle attribution and no mutation** (`packages/host/plugin-inventory/src/types.ts`; limitations section of `packages/host/plugin-inventory/README.zh.md`; consumer `packages/client/ui-settings-plugin-inventory/README.md`). Useful for the "what's actually loaded" view; insufficient alone for trust scoring.
- **Ground truth on disk**: since out-of-tree plugins are pnpm deps of the profile, the authoritative metadata lives at `$DSH_HOME/profiles/<name>/package.json` (`dsh.profile.bundles` order = layer order) and each dep's own `package.json` + `cordis.patch.yml` under `<profile>/node_modules/<pkg>/`. Layer precedence rules in `apps/cli/reference/README.md` let us attribute each Loader entry to the bundle that inserted it by replaying the layer stack.
- **In-process option**: `loader` is injectable — `plugin-inventory` itself does `static inject = ['loader']` and reads `this.ctx.loader.entries()` (`packages/host/plugin-inventory/src/index.ts`). A bridge scanner plugin running inside the host could do the same and enrich it with fs reads of the resolved module paths.

Trust-scan inputs we can harvest without any upstream change: full source tree of each installed package (it's on disk), manifest + patch layers, `prepare`/build scripts (install-time execution risk — gated behind the user's explicit `allowBuilds` entry, see §2's git-install catch), dynamic-eval signals (`new Function`, `eval`, `child_process` — charter's checklist), declared `Config` schemas, and lifecycle hook listeners (event names appear in source). This feeds the adversarial review + report card pipeline in `docs/audits/`.

---

## 4. Open questions / uncertainties

Flagged explicitly, with the cheapest way to close each:

1. **Command input ergonomics** — `ctx.commands` is unstructured-text-only today (registry Known Limitations). Can a handler get structured args another way (e.g. its own parse + `ask_user_question` tool)? *Close by*: exercising a draft command against a dev build.
2. **Slot keys available to third-party browser halves** — `shell.overlay` and `settings.plugins.tab` are documented; the full third-party-safe slot catalog (sidebar sections, composer triggers) is spread across `packages/client/*/README.md` and partly internal. *Close by*: compiling the SlotMap declarations from `ui-layout`/`ui-conversation` source.
3. **RESOLVED (Revision 1)** — MCP runtime management: adding/removing an MCP server means editing patch rows + reload; no supported programmatic hot-add path exists. Closed by `mcp-gap-analysis.md` §7 ("None found in this pass; the watched-file path is sufficient either way"), so `/bridge:mcp` rewrites the watched profile patch and lets live-reload apply it.
4. **Attribution of Loader entries → installing bundle** has no first-class API (inventory explicitly lacks provenance). Our replay-the-layer-stack heuristic assumes bundle rows are addressable by `id`; confirm no id collisions across bundles break attribution.
5. **Version metadata for installed plugins** — profile `package.json` pins git specs by branch unless sha-pinned; scanning must record resolved commit hashes from pnpm lockfile state to make reports auditable. Confirm where pnpm records resolved git shas in the profile dir.
6. **Windows/macOS parity of `$DSH_HOME` layout and `allowBuilds` flow** — docs assume POSIX paths in examples; verify profile location resolution (`@deepseek-ai/dsh-home-paths`) on both.
7. **Stability** — DSH is developer preview; `ctx.commands`, slots, and `pluginInventory` shapes can move between releases. Pin our dev/testing to a tagged release and re-run the smoke matrix per bump; keep every claim here re-verifiable by path.
8. **Ponytail specifics** — CHARTER records the proven install pattern, but the ponytail checkout isn't local to this machine; re-confirm its exact `package.json` peer-dep versions before copying them into our scaffold template.

---

## Revision 1 (2026-08-26)

Corrections applied after the adversarial review pass (`../reviews/research-docs-review.md`):

- **Command misnomer corrected.** The native preset-switch command is `/permission`, not `/permissionPresets`: the cited registration reads `name: 'permission'` (`packages/interaction/permission-presets/src/index.ts:275`), with bare-invocation reporting the current preset. Noted in §3.1; any sibling doc still using the old name should be read with this correction.
- **Install-time execution claim reconciled with the `allowBuilds` gate.** §2 now states the gated behavior precisely: under pnpm ≥10, a git dependency's `prepare` script runs only after the user allowlists it, so install-time code execution is conditional on that explicit allowance and absent for prebuilt npm/tarball artifacts (`basic/publish.md:163-173`; forwarding per `apps/cli/src/args.ts:171`). This supersedes the unconditional "install runs arbitrary npm lifecycle scripts" phrasing in `dsh-native-inventory.md` §12.4; quote that claim only through this gate.
- **MCP facts consolidated toward the authoritative source.** §1's MCP row is now a summary plus a pointer to `mcp-gap-analysis.md`; §4 item 3 (programmatic hot-add path) is marked resolved by that document's §7.
