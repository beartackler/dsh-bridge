# MCP in DSH: gap analysis feeding the `/mcp` command spec

**Date:** 2026-08-25 · **Author:** research worker (ox-alpha swarm wave)
**Method:** direct read of `packages/mcp/**`, `apps/cli/{src,reference,tests}`, `packages/util/home-paths`, `examples/mcp-memory`, `packages/client/ui-settings-plugin-inventory` in the reference checkout `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master). Every claim below carries a `file:line` citation. Cross-checked against our draft spec `docs/specs/commands/mcp.md`; deltas in §6.

## TL;DR

MCP in DSH is a single well-engineered client plugin (`@deepseek-ai/dsh-mcp-client`) configured exclusively as Cordis composition rows in YAML patch files under `$DSH_HOME`. There is **no dedicated CLI verb, no wizard, no status panel, no import path** — the closest things are hand-written `--patch` overlays, a pnpm-forwarding `dsh plugin` verb, and a read-only Web Settings plugin-inventory tab. Everything else (transports, naming, reconnect, secret scrubbing) is solid and Claude-Code-shaped; the entire gap is management UX.

---

## 1. How MCP servers are configured today

### 1.1 File format and exact paths

Servers are declared as **plugin instance rows** (`insert:` entries with `id` + `name` + `config`) inside Cordis YAML files. One plugin instance per MCP server (`packages/mcp/mcp-client/src/index.ts:5`: "Each plugin instance connects to one MCP server; load multiple instances in `cordis.yml` for multiple servers").

The composition stack, in application order (`apps/cli/reference/README.md:9`):

| Layer | Exact path | Scope |
|---|---|---|
| Profile root (generated, do-not-edit) | `$DSH_HOME/profiles/<name>/cordis.yml` | Always rewritten to `[]` at boot (`apps/cli/src/profile-boot.ts:60-67`) |
| **Profile user layer** | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | One profile |
| Home user layer | `$DSH_HOME/cordis.patch.yml` | Machine-wide; outranks per-profile layer (`apps/cli/src/profile-boot.ts:43-51`, `reference/README.md:9`) |
| Ad-hoc overlays | any path, via `--patch <file>` | Invocation only |

Default home is `~/.dsh` (`DSH_HOME_DIR_NAME = '.dsh'`, `packages/util/home-paths/src/index.ts:12`); overridable via `$DSH_HOME` env with precedence configured > `$DSH_HOME` > `~/.dsh` (`home-paths/src/index.ts:87-91`).

Canonical row shape (`packages/mcp/mcp-client/README.md:11-30`, working example `examples/mcp-memory/memorix.cordis.yml`):

```yaml
- insert:
    - id: mcp-github            # free-form; convention mcp-<serverName>
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: github      # /^[A-Za-z0-9_-]{1,32}$/, unique (index.ts:37,148-161)
        transport: stdio        # or streamable-http (z.union, index.ts:107-128)
        command: npx            # stdio only
        args: ['-y', '@modelcontextprotocol/server-github']
        env:
          GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

Full field set: stdio `{serverName, command, args, env, cwd, toolCallTimeoutMs, failOnStartupError, reconnect}` / http `{serverName, url, headers, toolCallTimeoutMs, failOnStartupError, reconnect}` (`index.ts:50-128`). Defaults: `toolCallTimeoutMs` 60000 (`index.ts:34`), `failOnStartupError` false, reconnect `enabled:true / initialDelayMs:500 / maxDelayMs:30000 / maxAttempts:10` (`connection.ts:40-45`). Generated field catalog: `docs/config-catalog.md` § `@deepseek-ai/dsh-mcp-client` (~lines 1371-1443).

**Secrets:** values support `!!js` expressions; the documented pattern is env indirection (`!!js process.env.NAME`, backtick template for Bearer headers — README usage block). stdio children get the **scrubbed** parent env (credential-shaped names and all `DSH_*` names removed) merged with the row's explicit `env` (`transport.ts:16-22`; scrub description in `examples/mcp-memory/README.md:13`). Credentials themselves live elsewhere: provider creds resolve from env, `$DSH_HOME/.credentials.yaml`, then `.env` files (`apps/cli/reference/README.md:89`) — but there is **no credential seam wired into MCP config**.

### 1.2 How a server actually gets enabled (today's official UX)

The shipped composition mounts **zero** MCP servers; the CLI ships the client as a dependency precisely so patch rows can use it, deliberately off by default "because each server command is trusted executable code outside the agent sandbox" (`apps/cli/reference/README.md:93`). Today's enablement workflow (from `examples/mcp-memory/README.md:23-33`):

1. Install the server binary yourself (`npm install --global memorix@…`). DSH never downloads servers.
2. One-shot: `dsh web --patch "$PWD/examples/mcp-memory/memorix.cordis.yml"`.
3. Persistent: **hand-merge** the row into `$DSH_HOME/profiles/<name>/cordis.patch.yml` or `$DSH_HOME/cordis.patch.yml`. The docs explicitly warn "Do not copy over an existing file: it may already contain unrelated user patches."

That step 3 is manual YAML surgery is the core gap this analysis feeds.

## 2. Is there a CLI/UI for management?

**No MCP-specific management surface exists.** What is adjacent:

| Surface | What it does | Why it isn't MCP management |
|---|---|---|
| `dsh plugin --profile <n> <args>` | Forwards to `pnpm add/remove/update` in the profile dir; reconciles `dsh.profile.bundles` (`reference/README.md:41-43`) | Installs npm/git packages; cannot create/configure an mcp-client row |
| `--dump-default-config` / `--dump-config` | Prints composed tree incl. comments naming each row's source file (`reference/README.md:32-39`) | Read-only inspection; includes MCP rows if present, but no filtering by kind |
| Web Settings → Plugins tab | Read-only searchable catalog of Loader rows via `ctx.remote.pluginInventory.list()`; shows effective config + enablement/status (`packages/client/ui-settings-plugin-inventory/README.md:5-7`) | Explicitly read-only: "local search does not add … plugin mutation controls" (`README.md:20`); one snapshot per Settings mount |
| Hot reload | Both `cordis.patch.yml` layers are watched and edits are "reapplied transactionally" (`reference/README.md:81`); mcp-client instances hot-swap via HMR dispose+recreate with stable tool names (`mcp-client/README.md:32`, `index.ts:8-11`) | Applies whatever you hand-edited; nothing *writes* the edit for you |

So the honest statement for the spec: **DSH has a read-only inventory view and a live-reload execution path, but zero create/edit/remove/test/import affordance for MCP servers anywhere.**

## 3. How tools surface

- **Naming:** public name is `mcp__<serverName>__<rawName>`, normalized to the DeepSeek function-name contract (≤64 chars, `[A-Za-z0-9_-]`); lossy normalizations append a deterministic 12-hex SHA-256 hash of `(serverName, rawName)` (`tools.ts:44-55`; README "Tool naming"). Names are pure functions — connection order never renames a tool. The raw name goes on the wire; the public name is never parsed back (`tools.ts:6-10`).
- **Registration lifecycle:** plugin activation blocks on connect + `listTools()` + `ctx.tools.register()` before the first turn; duplicate `serverName` fails the later instance at load with an actionable message ("pick a unique serverName in cordis.yml", `index.ts:148-161`). `notifications/tools/list_changed` re-syncs; a registration conflict rolls back the whole generation atomically (`README.md` "Behavior").
- **Crash/reconnect:** a supervisor restarts with exponential backoff under the attempt budget; exhaustion unregisters that server's tools and only HMR reload or Host restart recovers (`connection.ts:1-16`). During an outage the last good generation stays registered and calls fail.
- **Result rendering:** canonical `{content[], structuredContent?}` preserved; text joins preserve block order; images become durable attachments only if `ctx.attachments` is mounted *and* the exact calling route proves image input; audio/embedded resources degrade to diagnostic text (`README.md` "Behavior", "Known Limitations"). Output-schema validation falls back to unconstrained JSON when vocabulary is unsupported.
- **Scope of bridge:** **tools only** — Resources and Prompts have no harness consumer (`README.md:113`).
- Proof the whole chain works end-to-end through the generic Loader: `apps/cli/tests/memory-mcp-configs.spec.ts:98-131` boots three third-party memory overlays against a fixture server and awaits `mcp__<serverName>__greet` on `ctx.tools`.

## 4. Gap list vs Claude Code's `/mcp` experience

Claude Code ships `claude mcp add/remove/list/get` (scoped configs), an in-session `/mcp` panel with per-server connection status and tool lists, OAuth flows for HTTP servers, `.mcp.json` project sharing, and prompt/resource integration. Mapped onto DSH:

| # | Gap | DSH reality (evidence) | Impact |
|---|---|---|---|
| G1 | No create/edit/remove path | Rows are hand-edited YAML; even upstream docs tell users to hand-merge into a shared patch file (`examples/mcp-memory/README.md:31-33`) | Highest-friction step; error-prone (YAML, `!!js`, unique-id rules) |
| G2 | No status/liveness view anywhere | Reconnect states go to logs only (`mcp-client/README.md` "Behavior"); inventory tab shows enablement, not connection health (`ui-settings-plugin-inventory/README.md:7`) | Users can't tell "configured" from "working"; budget-exhausted servers look merely absent |
| G3 | No handshake/verification tool | Nothing spawns a probe connection; startup failures only reject activation when `failOnStartupError:true`, else log-and-degrade (`index.ts:172-180`) | Misconfigured servers discovered implicitly at chat time |
| G4 | No import from other harnesses | No reader for `~/.claude.json` / `~/.codex/config.toml` / jcode configs anywhere in the checkout | Migration friction; muscle-memory breakage (the charter's exact thesis) |
| G5 | Transports: no SSE; HTTP is Streamable-only | `transport: 'stdio' \| 'streamable-http'` exhaustive (`index.ts:107-128`) | Legacy SSE endpoints unusable; must be surfaced honestly |
| G6 | Tools-only bridging | Resources/Prompts deferred (`README.md:113`) | Resource-heavy servers appear "empty"; prompts don't become commands |
| G7 | No OAuth/auth flow for HTTP | Only static `headers` (`index.ts:86-88`) | Token-refresh servers need manual token plumbing |
| G8 | No connection/discovery timeout knob | Inherited SDK 60s default (`README.md:114`) | Stalls delay activation/teardown; probes need their own deadline |
| G9 | No secret store seam for MCP rows | `env`/`headers` are plaintext-or-`!!js`; scrubbing protects children from ambient secrets but the row itself holds literals unless users know the idiom | Secret-hygiene burden on the writer |
| G10 | Enable/disable requires delete-or-comment | A patch row `{id, disabled: true}` exists as a mechanism (telemetry switch uses it, `profile-boot.ts:80-83`) but nothing exposes it for MCP | Toggle UX is free to build — opportunity |
| G11 | No scoped/project sharing story | Overlays exist (`--patch`) but no convention for a repo-committed MCP set like `.mcp.json` | Team-shared configs are ad hoc |

Non-gaps worth stating (things DSH already does right, which `/mcp` must not duplicate): deterministic collision-free naming, atomic generation swaps, env scrubbing for children, budgeted reconnect, HMR-stable names, keyless-fixture-proven discovery.

Security note carried over from our red team: an MCP stdio row is arbitrary executable code configured as YAML, and `env` is an explicit un-scrub channel (`docs/audits/dsh-builtin-redteam.md:116,208,285`). Any `/mcp add` UI must render the complete spawn spec (command/args/env/cwd) for review — aligns with audit item T1.4.

## 5. Upstream doc inconsistency found

`examples/mcp-memory/README.md:82` still claims "the current generic client does not auto-reconnect; its tool registrations remain until plugin disposal", but `connection.ts:1-16` and the package README describe a budgeted auto-reconnect supervisor (added later; the example doc is stale). Our spec should follow the **code**: auto-reconnect exists; after budget exhaustion, tools unregister until reload/restart.

## 6. Deltas vs our draft spec `docs/specs/commands/mcp.md`

The spec's factual base checks out (transports, naming, defaults, scrubbed-env, tools-only, no-timeout-knob, HTTP-per-request-retry all match source). Corrections and additions:

1. **Confirm write target, add the home layer.** Spec targets `~/.dsh/profiles/<profile>/cordis.patch.yml` — correct. Add: `$DSH_HOME/cordis.patch.yml` is the supported machine-wide layer and outranks the profile layer (`reference/README.md:9`); offer `--scope home|profile` rather than inventing one.
2. **Speculative fallback to correct:** spec's "falls back to the workspace `cordis.yml` when no profile is active" has no counterpart in the reference checkout — workspaces receive config only via `--patch` overlays. Recommend replacing with "falls back to writing a new profile patch or emitting a `--patch` file".
3. **New fact the spec lacks — changes take effect live:** both patch layers are watched and transactionally reapplied (`reference/README.md:81`), and mcp-client instances hot-swap on HMR with identical tool names for unchanged `serverName` (`mcp-client/README.md:32`). `/mcp add/remove` therefore does **not** need "restart to apply" messaging; it needs "applied on save; watch for the reconnect/re-sync log lines". This materially improves the UX story.
4. **Enable/disable is cheap:** implement `/mcp enable|disable <name>` as `{id: mcp-<name>, disabled: true|false}` patch rows (mechanism proven by the telemetry switch, `profile-boot.ts:56-83`). Spec currently only has remove.
5. **Duplicate-name error copy exists upstream:** reuse `index.ts:156`'s wording in wizard validation errors.
6. **Test protocol additions:** (a) report reconnect-budget-exhausted as its own verdict hint where detectable from logs; (b) warn when a server returns image content that the current route cannot admit (attachment/route-proof rule, `README.md` "Behavior"); (c) phase 4 hash behavior confirmed at `tools.ts:44-55`.
7. **Env-scrub disclosure:** `/mcp add` help should state exactly what children inherit (credential-shaped + `DSH_*` names stripped, everything else passes; `transport.ts:16-22`, `examples/mcp-memory/README.md:13`) so users understand why an ambient `MY_API_KEY` won't reach the child unless listed in `env`.
8. **Line-citation drift:** several `src/index.ts` ranges in the spec are stale (e.g. duplicate-check now at `:148-161`, union at `:107-128`). Refresh during implementation; content otherwise accurate.
9. **Citable trust framing:** keep spec non-goal "never a second connection runtime" — reinforced by upstream's own rationale that server commands are trusted code outside the agent sandbox (`reference/README.md:93`).

## 7. Open questions

- Does `ctx.remote.pluginInventory.list()` distinguish mcp-client rows enough for a future `/mcp` Web panel (entry `name` is visible in effective config), or would we need a tiny remote contribution?
- Is there a supported programmatic hot-add path (dynamic composition runner) short of editing the watched patch file? None found in this pass; the watched-file path is sufficient either way.
