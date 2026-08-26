# `/mcp` — MCP server management

**Status:** spec (unimplemented)
**Owner:** dsh-bridge command surface
**Reference checkout:** `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (`reference/` below)

## Purpose

Users arriving from Claude Code, Codex, and Jcode expect `/mcp` to be a live control panel: list configured servers, add one through a wizard, remove one, verify it actually handshakes, and import the servers they already configured in another harness. DSH has a real, well-engineered MCP client, but it has **no `/mcp` command and no user-facing management surface at all** — MCP servers are declared as plugin instances in YAML. `/mcp` closes that gap without changing DSH semantics: it is a *config editor plus verifier* over the existing plugin, never a second connection runtime.

Non-goals: proxying MCP traffic, replacing `@deepseek-ai/dsh-mcp-client`, bridging MCP Resources/Prompts (DSH does not support them — see Native-state summary), or writing secrets to disk in plaintext when an env-var reference will do.

## Native-state summary (what DSH actually does today)

Everything in this section is read from the reference checkout; gaps are stated plainly.

### What exists

| Fact | Evidence |
|---|---|
| MCP is a single plugin, one instance per server | `reference/packages/mcp/mcp-client/src/index.ts:1-14` — "Each plugin instance connects to one MCP server; load multiple instances in `cordis.yml` for multiple servers." |
| Servers are declared in `cordis.yml` as plugin entries with `id` + `config` | `reference/packages/mcp/mcp-client/README.md` ("Usage") |
| Exactly two transports: `stdio` and `streamable-http` | `reference/packages/mcp/mcp-client/src/index.ts:107-121` (`z.union` of `transport: z.const('stdio')` / `z.const('streamable-http')`) |
| Tools are exposed as `mcp__<serverName>__<rawName>` | `reference/packages/mcp/mcp-client/src/index.ts:2-4`; README "Tool naming" |
| `serverName` must match `/^[A-Za-z0-9_-]{1,32}$/` and be unique across live instances | `reference/packages/mcp/mcp-client/src/index.ts:37`, `:45`, `:110` |
| Full config field list (`command`, `args`, `env`, `cwd`, `url`, `headers`, `toolCallTimeoutMs`, `failOnStartupError`, `reconnect.*`) | `reference/packages/mcp/mcp-client/src/index.ts:50-121`; generated copy at `reference/docs/config-catalog.md:1369-1440` |
| Defaults: `toolCallTimeoutMs` 60000, `failOnStartupError` false, `reconnect.enabled` true, `initialDelayMs` 500, `maxDelayMs` 30000, `maxAttempts` 10 | `reference/packages/mcp/mcp-client/src/index.ts:34`, `:100-121` |
| stdio child env is the **scrubbed** parent env plus explicit `env` | `reference/packages/mcp/mcp-client/src/transport.ts:16-22` (`scrubbedParentEnv()` from `@deepseek-ai/dsh-subprocess`) |
| HTTP transport is the MCP SDK `StreamableHTTPClientTransport` | `reference/packages/mcp/mcp-client/src/transport.ts:11`, `:41-45` |
| Reconnect is budgeted and user-visible in logs | `reference/packages/mcp/mcp-client/README.md` ("Behavior") |
| MCP tool schemas are runtime-discovered, not static | `reference/docs/tool-catalog.md` header — the generator "BOOTS each tool plugin ... because a tool schema is not statically knowable (... raw-JSON-Schema MCP tools)" |

### Gaps this command must live with (honest)

1. **No `/mcp` command, no CLI, no TUI panel.** `reference/docs/tool-catalog.md` has no `mcp` row in its Tool Package Map — MCP tools are not in the generated catalog because they only exist once a server is booted. Management is manual YAML editing today.
2. **No `sse` transport.** Claude Code and Jcode configs use `"type": "sse"`; DSH has only `streamable-http`. Legacy HTTP+SSE servers are **not** guaranteed to work; the wizard must say so rather than silently mapping.
3. **Resources and Prompts are unsupported.** `reference/packages/mcp/mcp-client/README.md` "Known Limitations": "Tools are the only bridged MCP capability". `/mcp test` therefore reports tools only, and reports a resources/prompts-only server as *reachable but useless to DSH*.
4. **No connection/discovery timeout knob.** Same section: startup timeout is the MCP SDK's 60s default. `/mcp test` must impose its own wall-clock deadline and label a stall as a test-side timeout, not a server verdict.
5. **HTTP failures are per-request, not supervised.** Same section: "an unreachable HTTP server is retried per call rather than respawned". A green `/mcp test` on an HTTP server proves reachability at that instant only.
6. **No secret store seam for MCP config.** `env`/`headers` in `cordis.yml` are commonly written as `!!js process.env.X` (README "Usage"). `/mcp add` must default to that indirection rather than inlining tokens.

## Commands

All subcommands are non-destructive by default, print a diff before writing, and never echo secret values (redacted to `••••` with the source name shown, e.g. `env GITHUB_TOKEN ← $GITHUB_TOKEN`).

**Config target.** `/mcp` reads and writes the active profile's patch file, `~/.dsh/profiles/<profile>/cordis.patch.yml` (mechanism proven by dsh-ponytail; see `CHARTER.md` "Constraints & Facts"), and falls back to the workspace `cordis.yml` when no profile is active. The target path is printed in every mutating command's output. Plugin instance `id` convention: `mcp-<serverName>`.

### `/mcp list`

Reads config only; performs **no** network or process activity.

```
/mcp list [--profile <name>] [--json]
```

Output: one row per `@deepseek-ai/dsh-mcp-client` instance found.

| Column | Source |
|---|---|
| `name` | `config.serverName` |
| `transport` | `stdio` / `streamable-http` |
| `target` | `command args…` (stdio) or `url` (http), truncated to 60 chars |
| `id` | plugin instance `id` |
| `tool prefix` | `mcp__<serverName>__` |
| `notes` | `failOnStartupError`, non-default `toolCallTimeoutMs`, `reconnect.enabled: false` |

- Empty config → prints the empty state plus the exact next command: `/mcp add <name>` and `/mcp import-from claude`.
- Duplicate `serverName` across instances is flagged as an **error row**, because DSH fails the later instance at load (`src/index.ts:39-45`).
- `--json` emits `{"servers":[{name,transport,id,target,config}]}` with secrets replaced by `{"$env":"NAME"}`.
- Status is deliberately absent: `/mcp list` does not claim a server is "connected". Liveness comes from `/mcp test`.

### `/mcp add`

```
/mcp add <name> [stdio <command> [args…] | http <url>] [--env K=V…] [--header K=V…]
                [--cwd <path>] [--timeout <ms>] [--fail-on-startup] [--no-reconnect]
                [--yes] [--dry-run]
```

Fully-specified invocations are non-interactive (scriptable). Any missing required field drops into the wizard.

**Validation, before anything is written:**

1. `name` matches `/^[A-Za-z0-9_-]{1,32}$/` (`src/index.ts:37`); otherwise reject with the pattern shown.
2. `name` is not already used by another instance in the target config (DSH would fail the later one at load).
3. stdio: `command` resolves on `PATH` or is an existing executable path; a non-resolving command is a warning, not a hard failure (it may exist only at run time).
4. http: `url` parses, scheme is `https` — plain `http` is accepted only for `localhost`/loopback, and is otherwise refused with an explicit override flag `--allow-insecure-http`.
5. Secrets: any `--env`/`--header` value that looks like a live credential (long high-entropy string, `sk-`/`ghp_`/`Bearer ` prefixes) triggers a prompt offering to store it as an env reference instead of inline. Declining requires `--yes`.

**Wizard flow (`/mcp add <name>` with no transport):**

```
Step 1  Transport
        1) stdio            local process (most servers)
        2) http             Streamable HTTP endpoint
        3) sse              NOT SUPPORTED by DSH — see below
Step 2  Target
        stdio: command, then args (one per line, no shell interpolation — src/index.ts:61-62)
        http:  url, then optional headers
Step 3  Environment / auth
        stdio: env vars; default offered as `!!js process.env.NAME` indirection
        http:  headers; Authorization defaults to `!!js \`Bearer ${process.env.<NAME>}\``
Step 4  Advanced (all skippable, defaults from src/index.ts:34,100-121)
        toolCallTimeoutMs 60000 · failOnStartupError false · reconnect enabled/500/30000/10
Step 5  Review
        Renders the YAML block, secrets redacted, then: write / edit / cancel
Step 6  Verify
        Offers `/mcp test <name>` immediately; on failure offers to remove the entry again
```

Choosing `sse` prints, and does not proceed:

> DSH has no `sse` transport — only `stdio` and `streamable-http` (`packages/mcp/mcp-client/src/index.ts:107-121`). Many servers advertised as SSE also serve Streamable HTTP at the same URL. Try `http <url>` and run `/mcp test`; if the handshake fails, this server cannot be used by DSH today.

Written form (stdio example):

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

Only non-default fields are emitted; the block stays minimal and reviewable.

### `/mcp remove`

```
/mcp remove <name> [--yes] [--dry-run]
```

- Resolves `name` → instance; unknown name lists near matches and exits non-zero.
- Prints the YAML block to be deleted (secrets redacted) and requires confirmation unless `--yes`.
- Removes exactly the one plugin instance. Never touches unrelated entries, never rewrites unrelated formatting, and preserves comments in the target file.
- Reminds the user that disposal unregisters that server's tools and frees the `serverName` reservation (`src/index.ts:6-11`), so the name is immediately reusable.
- Does **not** delete env vars, credential files, or installed packages, and says so.

### `/mcp test`

```
/mcp test [<name> | --all] [--timeout <s>] [--json]
```

Verifies a *configured* server by actually connecting. See the Test protocol below for the contract.

### `/mcp import-from`

```
/mcp import-from <claude|jcode|codex> [--only <names…>] [--rename <old>=<new>…]
                                      [--inline-secrets] [--yes] [--dry-run]
```

Reads the other harness's config, converts each entry to a DSH plugin instance, shows a per-server plan (`import` / `skip` / `conflict` / `unsupported`), and writes only the accepted ones. Source files are **read-only** — `/mcp import-from` never edits Claude, Jcode, or Codex config.

Source paths searched, in order (first hit per scope wins):

| Source | Paths |
|---|---|
| `claude` | `~/.claude.json` → top-level `mcpServers`, plus `projects.<cwd>.mcpServers`; then `./.mcp.json`; then `./.claude/mcp.json` |
| `jcode` | `~/.jcode/mcp.json` and `./.jcode/mcp.json`; both `mcpServers` and the legacy `servers` key are accepted |
| `codex` | `~/.codex/config.toml` → `[mcp_servers]` table (verified present on this machine, currently empty) |

Post-conditions: every imported server appears in `/mcp list`; the command finishes by offering `/mcp test --all` on the newly imported set.

## Import mapping tables

### Claude Code — `~/.claude.json` `mcpServers.<name>` → DSH

Shape confirmed on this machine: entries carry `type` (`"stdio"` | `"http"` | `"sse"`), `command`, `args`, `env`, `url`, `headers`.

| Claude field | DSH field | Rule |
|---|---|---|
| object key | `serverName` | Must match `[A-Za-z0-9_-]{1,32}`; `.`/`:`/space → `-`, then truncate to 32; collisions get a `-2` suffix and are reported |
| `type: "stdio"` (or absent + `command` present) | `transport: stdio` | Absent `type` with `command` is the Claude default |
| `type: "http"` | `transport: streamable-http` | Direct |
| `type: "sse"` | — | **Unsupported.** Emitted as a `skip` row with the reason; `--only` cannot force it. Offer the "try http at the same URL" hint |
| `command` | `command` | Verbatim |
| `args` | `args` | Verbatim; DSH passes them without shell interpolation (`src/index.ts:61-62`) |
| `env` | `env` | Values are converted to `!!js process.env.<KEY>` when the same key exists in the ambient env; otherwise inlined **only** with `--inline-secrets`, else the key is written with an empty placeholder and flagged |
| `url` | `url` | Verbatim |
| `headers` | `headers` | Same secret handling as `env` |
| `cwd` | `cwd` | Verbatim if present |
| `disabled: true` | — | Skipped; reported as `skip (disabled upstream)` |
| anything else | — | Dropped, listed in a "not carried over" footer |

Nothing maps to `toolCallTimeoutMs`, `failOnStartupError`, or `reconnect.*` — DSH defaults apply and are not written.

### Jcode — `~/.jcode/mcp.json` / `./.jcode/mcp.json`

Jcode uses the same JSON shape as Claude Code (`mcpServers` object; historical `servers` key also accepted), so the Claude table above applies verbatim, plus:

| Jcode field | DSH field | Rule |
|---|---|---|
| `servers` (legacy top-level key) | — | Treated as an alias of `mcpServers` |
| `shared: true` | — | No DSH equivalent; dropped, noted in the footer |
| `"type": "http"` / `"sse"` entries | — | Jcode itself supports stdio only and skips these with a log line, so such entries in a Jcode config are usually dead; `http` is still imported for DSH, `sse` is skipped |

`~/.jcode/mcp-schema-cache.json` is a **cache, not config**: `/mcp import-from jcode` never reads it as a server source. It may optionally be used to preview expected tool names before a test, clearly labeled as cached.

### Codex — `~/.codex/config.toml` `[mcp_servers]`

```toml
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "..." }
```

| Codex field | DSH field | Rule |
|---|---|---|
| table key | `serverName` | Same normalization as Claude |
| `command` | `command` | Verbatim |
| `args` | `args` | Verbatim |
| `env` | `env` | Same secret handling as Claude |
| `url` (Codex HTTP entries) | `url` + `transport: streamable-http` | Present only in newer Codex configs; absent `url` + present `command` ⇒ `transport: stdio` |
| `startup_timeout_ms` / `tool_timeout_sec` | `toolCallTimeoutMs` | Tool timeout maps (seconds ×1000); startup timeout has **no DSH knob** (Known Limitation 4) and is dropped with a note |
| everything else | — | Dropped, listed in the footer |

An empty `[mcp_servers]` table (the current state of this machine's `~/.codex/config.toml:1`) is reported as "source found, 0 servers" — not as an error.

### Conflict handling (all sources)

| Situation | Behavior |
|---|---|
| Name already in DSH config, identical config | `skip (already present)` |
| Name already in DSH config, different config | `conflict` — shows a field-level diff; requires `--rename` or explicit overwrite confirmation |
| Two source entries normalize to the same `serverName` | Second gets a `-2` suffix; both reported |
| Source file missing | Not an error; `source not found: <path>` and exit 0 with 0 imports |
| Source file unparseable | Error, exit non-zero, nothing written |

## Test protocol

`/mcp test <name>` must prove more than "the config parses". Phases run in order and stop at the first failure.

| Phase | Action | Pass condition |
|---|---|---|
| 0. Resolve | Read the entry from the target config, validate against the DSH `Config` schema (`src/index.ts:107-121`) | Schema-valid; `serverName` unique |
| 1. Spawn / reach | stdio: spawn `command` with `args` in `cwd` under the scrubbed parent env plus `env` (`transport.ts:16-22`). http: open `StreamableHTTPClientTransport` against `url` with `headers` | Process starts / socket opens |
| 2. Initialize | MCP `initialize` handshake | Server returns protocol version + capabilities before the deadline |
| 3. Discover | `tools/list`, following pagination cursors | A tool list returns (empty is a pass with a warning) |
| 4. Name projection | Compute `mcp__<name>__<rawName>` for each tool, applying DSH's 64-char / `[A-Za-z0-9_-]` normalization and the 12-hex-char disambiguating hash (README "Tool naming") | No collisions after projection |
| 5. Teardown | Disconnect, kill the child, reap | Clean exit; a child that ignores termination is reported |

**Isolation.** The test connection is throwaway: it is never registered on `ctx.tools`, never reserves the `serverName`, and does not disturb a running DSH session using the same server.

**Deadline.** Default 30s wall-clock across phases 1-4, `--timeout` overrides. Because DSH exposes no connection timeout of its own (Known Limitation 4), a stall is reported as `TIMEOUT (test-side deadline; DSH's own startup path would wait for the MCP SDK's 60s default)` — explicitly not a claim that the server is broken.

**Report (per server):**

```
✔ github            stdio · npx -y @modelcontextprotocol/server-github
  handshake  ok (protocol 2025-06-18, 412 ms)
  tools      26 discovered · prefix mcp__github__
             create_issue, get_file_contents, search_code, … (+23)
  names      ok (0 collisions, 0 truncated)
  warnings   none
```

Verdicts: `ok`, `ok (warnings)`, `unreachable`, `handshake-failed`, `no-tools`, `name-collision`, `timeout`, `config-invalid`. `--json` emits the same content structurally; exit code is 0 only when every tested server is `ok` or `ok (warnings)`.

**Mandatory warnings:**

- `no-tools` when `tools/list` is empty **or** the server advertises only resources/prompts — with the reason: DSH bridges tools only (Known Limitation, README).
- On `streamable-http` success: "reachability proven at this instant only; DSH retries HTTP per call rather than respawning the server" (Known Limitation 5).
- When any public name was truncated or hashed, show the raw → public mapping so the user can predict what the model sees.

**Never:** print env values or header values, write the discovered tool list into any config file, or leave a stray child process behind. A test that cannot reap its child exits non-zero with the PID.

## Acceptance criteria

**List**
1. `/mcp list` on a config with N mcp-client instances prints exactly N rows with correct name, transport, target, and `mcp__<name>__` prefix.
2. `/mcp list` on an empty config prints the empty state and the two suggested next commands, exit 0.
3. Duplicate `serverName` produces a visible error row explaining DSH fails the later instance at load.
4. `/mcp list` makes zero network calls and spawns zero processes (verified by test harness).
5. `--json` output never contains a secret value; env/header secrets appear as `{"$env":"NAME"}`.

**Add**
6. `/mcp add gh stdio npx -y @modelcontextprotocol/server-github` writes a schema-valid instance that `/mcp test gh` passes.
7. Invalid names (`>32` chars, `.`, space) are rejected with the pattern quoted, and nothing is written.
8. Adding a name that already exists is refused before any write.
9. Choosing `sse` in the wizard never writes a config entry and prints the streamable-http fallback guidance with the source citation.
10. A credential-shaped `--env` value triggers the env-indirection prompt; accepting it writes `!!js process.env.NAME` and no plaintext secret.
11. `--dry-run` prints the exact YAML that would be written and writes nothing.
12. Only non-default fields are emitted; a default-everything server produces a block with no `toolCallTimeoutMs`/`failOnStartupError`/`reconnect`.
13. Plain-`http` non-loopback URLs are refused without `--allow-insecure-http`.

**Remove**
14. `/mcp remove <name>` deletes exactly one instance; a byte diff of the target file shows no other change, and comments survive.
15. Unknown name exits non-zero, suggests near matches, writes nothing.
16. `--yes` skips confirmation; without it, declining writes nothing.

**Test**
17. A healthy stdio server yields `ok` with a non-empty tool list and a projected prefix matching `mcp__<name>__`.
18. A server exiting immediately yields `unreachable` with captured stderr (secret-redacted), exit non-zero.
19. A hanging server yields `timeout` labeled as the test-side deadline with the 60s-SDK-default caveat.
20. A resources-only server yields `no-tools` with the DSH tools-only limitation cited.
21. Two raw tool names that normalize to the same public name yield `name-collision` — or `ok` proving the hash suffix kept them distinct, matching DSH's documented rule.
22. Every test run leaves zero orphan processes (harness asserts the process table before and after).
23. No env value or header value ever appears in output or logs.
24. `--all` tests each configured server and exits non-zero if any fails.

**Import**
25. A `~/.claude.json` with stdio, http, and sse entries imports the first two, skips the sse one with a stated reason, and does not modify `~/.claude.json` (checksum asserted before/after).
26. Per-project Claude servers under `projects.<cwd>.mcpServers` are found for the current directory.
27. A Jcode config using the legacy `servers` key imports identically to one using `mcpServers`; `shared: true` is dropped and listed in the footer.
28. An empty `[mcp_servers]` in `~/.codex/config.toml` reports "0 servers", exit 0.
29. A missing source file reports `source not found` and exits 0; an unparseable one exits non-zero having written nothing.
30. A name colliding with an existing DSH entry surfaces a field-level diff and is not silently overwritten.
31. Names longer than 32 chars or containing `.` are normalized, and every normalization is reported in the output.
32. Imported servers pass `/mcp test` when the same server works in the source harness — or fail with a reason that names the DSH-side limitation responsible.
33. Secrets in source configs are converted to env references by default; `--inline-secrets` is required to write a literal value, and using it prints a warning naming the file that will hold the secret.

**Cross-cutting**
34. Every mutating command prints the absolute path of the config it writes.
35. Every claim in `/mcp` help text about DSH behavior cites a reference path (CHARTER "Trust over speed").
36. No subcommand issues an undocumented network call; `/mcp test` and `/mcp add`'s optional verify step are the only network-capable paths.
