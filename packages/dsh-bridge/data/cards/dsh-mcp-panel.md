# Trust Report Card: dsh-mcp-panel

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-mcp-panel` (MCP management console for the official DSH MCP client: `/mcp` command, Settings MCP tab, tool trial console, connectivity probe) |
| Pinned subject | github:PerryLink/dsh-mcp-panel @ commit `ca4c4952fdfb6396ca702355502b4602e4291e53` (2026-08-26, default-branch head at audit time) |
| npm integrity | Not pinned. The manifest names npm package `dsh-mcp-panel` but this audit graded the git tree only; no published tarball was fetched or compared. |
| Provenance | Not verified (no attestation checked, no `gitHead` comparison performed). |
| License | Apache-2.0 (per `gh api repos/PerryLink/dsh-mcp-panel --jq .license.spdx_id`; `THIRD_PARTY_NOTICES.md` present) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of the production surface) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A well-built experience layer over the official DSH MCP client: it never becomes a second MCP
bridge, its only network traffic is one `initialize` handshake to a server the user already
configured, its profile writes are append-only, backed up, and gated behind an approval or an
explicit UI confirmation, and every display path runs through a dedicated credential-redaction
module - the grade is B rather than A only because installing from git runs a `prepare` build
hook and because the published artifact was not compared against this commit.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | One `POST` per probe, to the streamable-http URL of a server the user already put in their own MCP config, carrying an MCP `initialize` JSON-RPC body and the user's own configured headers. No other destination exists in `src/`. | src/probe.ts:89-104 (the only `fetch` in `src/`); target derived from config at src/probe.ts:53-56 |
| Child processes | One `spawn` of the user's own configured stdio MCP `command`/`args`, to complete one `initialize` handshake over stdin/stdout, then killed. Environment is `scrubbedParentEnv()` from the harness's own `@deepseek-ai/dsh-subprocess` plus the row's explicit `env`, so credential-shaped and `DSH_*` parent variables do not leak implicitly. `windowsHide: true`. | src/probe.ts:169-173; scrub rationale documented at src/probe.ts:10-13 |
| Credential handling | Configured `env` and `headers` values never enter a snapshot (`SECRET_MAP_KEYS`, src/patch.ts:493) and are used for the request but never rendered (src/probe.ts:68-71). All display text passes `sanitizeUrl`/`sanitizeText`/`sanitizeError`, which redact userinfo passwords, credential query and fragment pairs, bearer tokens, raw JWTs, quoted JSON secrets, and env-var-shaped secrets. | src/sanitize.ts:1-115 |
| Filesystem writes | Append-only to the profile patch layer `cordis.patch.yml`: copy to `<file>.bak-<epoch-ms>`, append one generated YAML block, prune backups beyond `backupCount`. The console never rewrites existing content, so user comments and unrelated rows stay byte-for-byte intact. | src/write.ts:1-97 |
| Write authorization | `writeEnabled: false` is a hard kill switch. Otherwise the write requires either the harness approval service returning `allowed-once`, or - when no approval channel is reachable - an explicit `confirmed === true` from the UI. Rejected, cancelled, and no-channel outcomes all throw before any file is touched. | src/service.ts:387-424 |
| Tool trial calls | Run through the official `ctx.tools.execute` pipeline, so permission policy, guards, and approval apply exactly as for a model call; results are panel-only and never enter model context. | src/index.ts:10-13; src/service.ts:445-460 |
| Dynamic code execution | None in shipped code. All `import()` hits are in build/verify scripts (`scripts/loader-runner.mjs`, `scripts/verify-artifacts.mjs`), which resolve local paths through `pathToFileURL`. | scripts/loader-runner.mjs:41-45; scripts/verify-artifacts.mjs:23,27 |
| Telemetry | None found. No analytics, beacon, or metrics endpoint appears anywhere in `src/`; the only `fetch` is the probe above. | negative claim, scope: all of `src/` |
| Prompt injection into the model | None. The plugin states it injects no prompt sections, only tool descriptions; no `systemPrompt.section` call exists in `src/`. | src/index.ts:24-26, confirmed by grep |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 49 findings (40 high, 4 critical, 1 medium, 4 low), machine grade F, 69 files scanned.
23 findings are outside test files; those are adjudicated below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED "enumerates entire environment" x2, tsdown.config.ts:83-84 | False positive. These are bundler define entries reading exactly one variable, `process.env.NODE_ENV`, to inline a build constant. No enumeration occurs. | tsdown.config.ts:83-84, read directly |
| CRED "enumerates entire environment" x2, tests/*.spec.ts | Test fixtures. Production code never enumerates `process.env`; the probe's child env comes from the harness's own `scrubbedParentEnv()`. | src/probe.ts:171 |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| PANEL-HOOK-1 | medium | package.json:170 `"prepare": "node scripts/prepare.mjs"` | Runs at install time for git-hosted installs. The script is self-contained: it deletes `lib/`, then runs `tsc` and `tsdown` binaries resolved from declared `dependencies`, then a local `fix-dts.mjs`. No network, no shell, no arbitrary command. Still a real install-time execution surface and the main reason this is not an A. |
| PANEL-SUPPLY-1 | high | package.json:7 | The repository field points at a git host; a `github:PerryLink/dsh-mcp-panel` install resolves to moving HEAD, not to this audited commit. Pin a tag or the SHA. |
| PANEL-NET-1 | medium | src/probe.ts:89 | The only outbound request. Destination is the user's own configured MCP endpoint; body is a protocol-constant `initialize`; headers are the user's own. |
| PANEL-EXEC-1 | medium | src/probe.ts:169 | Spawns the user's own configured stdio MCP command. Arguments come from the same config row; env is scrubbed before the row's explicit values are layered on. |
| PANEL-EXEC-2 | low | scripts/{prepare,release,verify-artifacts}.mjs | Build and release tooling. `release.mjs` runs `git` via `execFileSync` (no shell); `verify-artifacts.mjs` runs `node --check` and imports the built `lib/` to assert exports. None ship in the runtime path. |
| PANEL-NET-2 | low | package.json:7,9,11 | Repository, homepage, and issues URLs. Metadata, not egress. |

### Scanner noise dismissed (with scope)

- 26 findings inside `tests/` (`tests/*.spec.ts`, `tests/harness.ts`), which are dev-only.
- `EXEC` hits on `scripts/loader-runner.mjs:41-45`: a Node module-loader shim used by the test harness; specifiers are resolved to local `file:`/`node:` URLs.
- `NET` low findings on package metadata URLs (github.com repository/homepage/bugs).

### Negative claims and what was searched

Searched all of `src/` (17 modules, 6263 lines including the client half), `scripts/`, `tests/`,
and the manifests: exactly one `fetch` (src/probe.ts:89) and one `spawn` (src/probe.ts:169) in
shipped code; no `eval`, no `new Function`, no `vm.*`; no `postinstall`/`preinstall`; no telemetry
or beacon endpoint; no reads of `~/.ssh`, `~/.aws`, browser profiles, or OS keychains; no
`systemPrompt.section` registration; no writes outside the profile patch layer and its own
timestamped backups.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review covered the same surfaces but cannot rule out environment-dependent behavior.
- **Published artifact vs source.** The npm package `dsh-mcp-panel` was not downloaded, and no integrity hash or provenance attestation was compared against commit `ca4c495`. The card grades the git tree only.
- **The `prepare` hook end-to-end.** `scripts/prepare.mjs` was read, not executed; `tsdown.config.ts` and `scripts/fix-dts.mjs` were read for egress and exec surfaces but the build was not reproduced.
- **The harness seams it depends on.** `scrubbedParentEnv()` (`@deepseek-ai/dsh-subprocess`), `ctx.tools.execute`, and the approval service are upstream code; this card assumes they behave as their names and this plugin's comments claim. If `scrubbedParentEnv` under-scrubs, PANEL-EXEC-1 widens.
- **The client half at runtime.** `McpPanelTab.tsx`, `ServerEditor.tsx`, and `TrialConsole.tsx` were read for egress and secret-display paths but not rendered; no XSS probe was run against server-supplied tool metadata beyond confirming the `boundedDisplay` + `sanitizeText` path (src/probe.ts:65-67).
- **Transitive dependency advisories.** Not joined against a pinned OSV snapshot.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F, driven almost
entirely by test-file findings and by build scripts it cannot distinguish from runtime code; both
positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/PerryLink/dsh-mcp-panel /tmp/dsh-mcp-panel-audit
cd /tmp/dsh-mcp-panel-audit && git rev-parse HEAD   # expect ca4c4952fdfb6396ca702355502b4602e4291e53

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dsh-mcp-panel-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(\|spawn(" src            # one fetch (probe.ts:89), one spawn (probe.ts:169)
grep -rn "eval(\|new Function\|vm\." src # dynamic exec: none
grep -n "postinstall\|preinstall\|prepare" package.json  # only "prepare" (build)
sed -n '387,424p' src/service.ts         # the write approval gate
sed -n '1,97p' src/write.ts              # append-only + backup
```

## 8. Methodology and pinned inputs

- Subject: git commit `ca4c4952fdfb6396ca702355502b4602e4291e53` (shallow clone at `reference/audits/dsh-mcp-panel`)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full read of src/index.ts, probe.ts, sanitize.ts, write.ts, the `writePatch`/`callTool` bodies of service.ts, src/client/remote.ts, `yamlScalar` in patch.ts, scripts/prepare.mjs, SECURITY.md, package.json; grep sweep for exec/net/cred/hook patterns across the whole tree
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high or critical production findings survived adjudication. Declared egress is present, minimal, user-directed, and documented (B band). Held below A by two unresolved items: the install-time `prepare` hook (PANEL-HOOK-1) and the absence of any published-artifact comparison (section 5).

## 9. Strengths

1. A purpose-built redaction module every display path goes through, covering userinfo passwords, credential query and fragment keys, bearer tokens, raw JWTs, env-var-shaped secrets, and quoted JSON secrets (src/sanitize.ts:1-115), with configured `env`/`headers` dropped before snapshot assembly (src/patch.ts:493).
2. Append-only config writes with an automatic timestamped backup and bounded backup retention, so no user comment or unrelated row is ever rewritten (src/write.ts:26-66).
3. A layered write gate: config kill switch, then harness approval where a channel exists, then explicit UI confirmation, with rejection and cancellation both throwing before any file operation (src/service.ts:387-424).
4. Deliberate restraint about its own scope: trial calls go through the official `ctx.tools.execute` pipeline instead of a private path, and the plugin registers no system-prompt sections (src/index.ts:10-26).
5. Child-process environment is scrubbed by the harness's own helper before the row's explicit values are layered on, and stderr is consumed but never rendered (src/probe.ts:171, 210).
6. Generated YAML is scalar-quoted with reserved-word and control-character handling, and the code states no `!!js` expressions are emitted (src/patch.ts:479-487).

## 10. Residual risks

1. Installing from `github:PerryLink/dsh-mcp-panel` runs `prepare` and resolves to moving HEAD, not this audited commit (package.json:7,170). Pin a tag or SHA and re-audit on bump.
2. The stdio probe spawns whatever `command` the MCP config names. That command was already going to run under the official bridge, but the panel adds a second trigger for it from the settings UI.
3. Probe requests carry the user's configured headers, so a mistyped or hostile `url` in an MCP row would receive that credential. The panel does not validate that the URL matches the credential's intended host.
4. Published npm artifact is ungraded; only the git tree was reviewed.
5. Server-supplied `serverInfo` strings reach the panel UI. They are length-bounded and sanitized (src/probe.ts:65-67), but the rendering layer was not exercised.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new `fetch` or `spawn` in `src/`, any new lifecycle script in `package.json`, or any bypass of `sanitizeText` on a display path must be re-adjudicated before this grade carries forward.
2. On any version bump, diff `src/sanitize.ts` and `src/write.ts` first: those two files carry most of the grade.
3. Confirm the write gate still throws on `no-approval-channel` (src/service.ts:415-417); a silent fallthrough to `confirmed` there would be a high finding.
4. If an npm release is pinned in future revisions, record `npm view dsh-mcp-panel@<version> dist.integrity` and compare `gitHead` against the audited commit.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
