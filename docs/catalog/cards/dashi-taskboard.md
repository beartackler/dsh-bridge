# Trust Report Card: chuspeeism/dashi-taskboard

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-codex-taskboard` (the DeepSeek Harness bundle inside Codex Taskboard: a local-first issue board with a React web UI, SQLite storage, a `taskctl` CLI, an agent skill, a Tauri desktop launcher, an optional Cloudflare Workers cloud backend, and a Chrome-DevTools-Protocol injector that embeds the board inside the Codex app) |
| Pinned subject | github:chuspeeism/dashi-taskboard @ commit `5c96d1ab698362994283ba0af86021db0a98dd89` (default branch head at audit time) |
| Provenance | Git tree audited directly. The DSH bundle is `private: true` and is not published to npm; it installs from a local path (`dsh plugin --profile web add /abs/path/integrations/deepseek-harness`, integrations/deepseek-harness/README.md:7-9). Desktop app binaries were not built or verified. 2624 GitHub stars at snapshot. |
| License | Apache-2.0 (LICENSE:1-3); `package.json` carries no `license` field |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the DSH bundle in full, plus targeted reads of server, CLI, injector, cloud worker, and Tauri config) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The DSH plugin is 207 lines that read one launcher-written JSON file and 307-redirect a sidebar
iframe at the board already running on your machine, with no egress and no credentials of its own,
but installing it is only useful if you also run the surrounding product, and that product binds
its unauthenticated HTTP service to `0.0.0.0` by default, drives the Codex desktop app over an open
DevTools port to inject its own script, spawns the `codex` binary, reads `~/.codex`, and ships a
self-updating Tauri launcher.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| DSH bundle: network egress | None. The host module imports only `node:fs/promises`, `node:os`, `node:path`; it registers one exact route and answers with a 307 to a URL read from the local runtime file, or 503 when the board is not running. The browser side renders an iframe pointing at that same relative route. | integrations/deepseek-harness/index.js:1-45; client.js:118-124 |
| DSH bundle: credential access | None. One `process.env` read, `CODEX_TASKBOARD_RUNTIME_FILE`, an override for the launcher runtime path; default is `~/Library/Application Support/Codex Taskboard/launcher-runtime.json`. No keychain, `.ssh`, `.aws`, or other-harness auth reads. | index.js:9-11 |
| DSH bundle: dynamic execution / child processes | None. No `eval`, `new Function`, `vm`, `import()` with a variable, or `child_process` anywhere in the two shipped files. | manual read, 207 lines total |
| DSH bundle: redirect target validation | Weak but bounded: the descriptor must have `version === 1` and a string `url`, which is then parsed with `new URL` and given a `host=deepseek-harness` query parameter. Any scheme or host the launcher wrote is honoured. The file is launcher-owned and device-local, so this is a local-integrity dependency, not a remote one. | index.js:13-20 |
| Product: HTTP bind | `resolveHost` defaults to `0.0.0.0`, and only `127.0.0.1` or `0.0.0.0` are accepted. `npm start` prints every LAN address the board is reachable on. The README states plainly that LAN mode has no account authentication: anyone on the network who can reach the port can read and write the board. | server/app.mjs:1640-1646; server/index.mjs:14-23; README.md:181, 187, 189 |
| Product: launcher-mode auth | When the launcher sets `CODEX_TASKBOARD_INSTANCE_TOKEN` and `CODEX_TASKBOARD_INSTANCE_SECRET`, routes move under a token prefix and device-local capability routes require a challenge, rejecting with 401. Both values are format-validated at startup and generated as a UUID plus 32 random bytes when absent. Plain `npm start` sets neither, so this gate is off in the documented developer flow. | server/app.mjs:1594-1607, 1653, 1974, 2013-2016, 2057-2060; scripts/codex-injector.mjs:67-73 |
| Product: Codex app injection | The injector launches or attaches to the Codex app with `--remote-debugging-address=127.0.0.1 --remote-debugging-port=<port>` (or `--remote-debugging-pipe`) and drives it with repeated `Runtime.evaluate` calls to install and refresh the taskboard user script. Loopback-scoped, but an open CDP port is full control of that application while it is open. | scripts/codex-injector.mjs:351-358, 390-391, 465, 738, 785, 969, 1059, 1469, 1520, 1658, 1729, 1766 |
| Product: child processes | The board spawns the Codex executable (`app-server --stdio`) to enumerate skills and to own agent turns, in argv form with `windowsHide` and timeouts. | server/ai-chat-catalog.mjs:339-346; server/ai-chat-process.mjs:346; server/ai-turn-owner.mjs:11; server/codex-app-server.mjs:98 |
| Product: reads another agent's home | Resolves `CODEX_HOME` or `~/.codex` for the agent catalog, and walks a workspace's ancestors collecting `.codex` directories up to the git root. These are Codex configuration and skill directories, read to list available agents and skills; no auth file is parsed and nothing read is sent anywhere by this code path. | server/app.mjs:1594; server/ai-chat-catalog.mjs:108-119, 605-615 |
| Product: desktop updater | The Tauri config pins a minisign public key and points the updater at this repository's GitHub Releases `latest.json`. Documented in PRIVACY.md. Signature-checked, but it is an auto-update channel on a first-party endpoint. | src-tauri/tauri.conf.json:28 (pubkey), updater endpoints; PRIVACY.md:24-26 |
| Product: optional cloud backend | A Cloudflare Workers app with D1 and R2 that stores issues, comments, and attachments. It runs only if the user deploys it and runs `taskctl cloud login --url URL`. Not enabled by default; nothing points at a maintainer-operated deployment. | cloud/src/index.mjs (worker `fetch` at :35, attachment R2 puts at :2859, :2898); cli/taskctl.mjs:37, 132, 357; PRIVACY.md:27-31 |
| Telemetry | None found. PRIVACY.md states no usage telemetry and no maintainer analytics; grep for analytics, telemetry, beacon, and third-party SDK hosts in `server/`, `cli/`, `integrations/`, and `scripts/` returned nothing outside the GitHub release endpoint. | PRIVACY.md:1-5, 33-34 |

The bundle patch inserts exactly one row, `codex-taskboard` -> `dsh-codex-taskboard`, and declares a
web client injected next to the stock sidebar. No model providers, no MCP servers, no credential
forwarding. UI copy in the client is Chinese only (client.js:88, 91, 100, 106, 141).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.
Raw output: 1396 findings (2 critical, 310 high, 45 medium, 1039 low), machine grade F, families
CRED/EXEC/HOOK/NET/OBFU; 147 files scanned, 86 skipped, 2513287 bytes. The scanner walked the whole
monorepo, which is a desktop app plus a cloud worker plus 43 test files; the graded subject is the
207-line bundle under `integrations/deepseek-harness/`, which contributes zero findings.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 critical "enumerates the entire process environment", test/ai-chat-runner.test.mjs:730 | False positive for shipped code. A test assertion listing which `CODEX_TASKBOARD_*` variables the launcher exported, so the suite can prove the board strips them before spawning Codex. Test scope, no exfiltration path. | file:line above |
| OBFU-002 critical + EXEC-001 high "eval(atob(...))", test/inject-fullheight-regression.test.mjs:176 | False positive for shipped code. A regression test builds a fake page that base64-encodes the injector's own script so it can be evaluated inside a jsdom fixture; the encoded value is the repo's own source, constructed in the same file. No such pattern exists in `server/`, `cli/`, `inject/`, or the DSH bundle. | grep verified |

### Findings kept (documented behavior or real residual risk)

| ID | Severity | Location | Note |
|---|---|---|---|
| DAT-NET-1 | high | server/app.mjs:1640-1646; server/index.mjs:16-23; README.md:189 | The service binds all interfaces by default and, outside launcher mode, has no authentication. On any shared or untrusted network, running `npm start` publishes a readable and writable issue board, including attachment upload and download. Documented, not defaulted safe. |
| DAT-EXEC-1 | medium | scripts/codex-injector.mjs:390-391, 738-1766 | Opening a DevTools port on the Codex app and driving it with `Runtime.evaluate` is, for the lifetime of that session, arbitrary code execution inside another vendor's authenticated application. Bound to `127.0.0.1`, but any local process that can reach the port inherits the same control. |
| DAT-SCOPE-1 | medium | server/ai-chat-catalog.mjs:108-119, 605-615; server/app.mjs:1594 | The board reads `~/.codex` and per-workspace `.codex` directories to build its agent and skill catalog. Benign in intent and no exfil path was found, but it is a read across another agent's configuration root. |
| DAT-SUPPLY-1 | medium | src-tauri/tauri.conf.json (updater block); PRIVACY.md:24-26 | The desktop app auto-updates from the project's GitHub Releases with a minisign key pinned in-tree. Signature verification is real; the residual risk is the ordinary one of accepting maintainer-signed updates without user consent per release. |
| DAT-BUNDLE-1 | low | integrations/deepseek-harness/index.js:13-20 | The DSH route trusts whatever URL the launcher runtime file contains. A local process that can write that file can redirect the sidebar panel anywhere, including off-host. The file lives in the user's own application-support directory, so this is a local-integrity assumption rather than a remote hole. |
| DAT-I18N-1 | low | integrations/deepseek-harness/client.js:88, 91, 100, 106, 141 | The DSH sidebar entry, panel title, refresh and close buttons, and ARIA labels are Chinese-only strings with no locale lookup, while the repo's own README is English-first. |

### Scanner noise dismissed (with scope)

- NET-007 x189 and NET-008 x556: URLs in `package-lock.json`, documentation, the Cloudflare worker's own route strings, SVG namespaces, and test fixtures. Package metadata and prose, not egress.
- OBFU-012 x483: hex and unicode escapes inside bundled web assets and mermaid/dompurify vendor code under `web/`, plus SQL migration text. Rendering data, not concealment.
- EXEC-004 x22 and EXEC-005 x32: `child_process` imports and spawns across the CLI, the launcher scripts, the Tauri preflight tooling, and the test suite. All argv-form with fixed executables; the four that matter at runtime are listed under section 3 as the Codex spawns.
- EXEC-003 x3 (`vm.runInNewContext`, test/inject.test.mjs:214, 388; test/injector.test.mjs:172): the tests extract a function's source out of the injector script and evaluate it in a sandbox to unit-test it. Test-only.
- EXEC-006 high (scripts/migrate-to-cloud.mjs:810): dynamic `import()` of a user-supplied migration module path, in a maintainer-run data migration script, not shipped to plugin users.
- CRED-007 x4 (scripts/codex-injector.mjs:67-73): generation of the launcher's own instance token and secret with `randomUUID`/`randomBytes`, then export to the child. This is the auth mechanism, not a credential read.
- OBFU-001 medium (src-tauri/tauri.conf.json:28): the base64 minisign public key for the updater. A public key by definition.
- OBFU-010 x7 and NET-014 x15 in `cloud/src/index.mjs`: `atob` in `decodeBasicCredentials` (:396-410) and R2 object puts through the `env.ATTACHMENTS` binding (:2859, :2898). Decoding an inbound Authorization header, and writing to the user's own bucket binding; the worker only runs on a deployment the user creates.
- HOOK-004/005/006 x14: GitHub Actions workflow steps and Tauri build hooks. CI scope.

### Negative claims and what was searched

The DSH bundle (`integrations/deepseek-harness/`, 207 lines across index.js and client.js) was read
line by line: no `fetch`, no `http`/`https` request, no WebSocket, no `child_process`, no `eval`,
`new Function`, or `vm`, no `dangerouslySetInnerHTML` or `innerHTML`, no `localStorage`, no
credential-path reads, and exactly one `process.env` access. Across the wider repo, grep for
telemetry, analytics, and beacon strings, and for third-party endpoint hosts in `server/`, `cli/`,
`inject/`, and `scripts/`, found no maintainer-operated collection endpoint; the only first-party
network destination in non-test code is the GitHub Releases updater URL. No npm `preinstall`,
`install`, `postinstall`, or `prepare` hooks exist in the root `package.json`.

## 5. What we could not check

- **The desktop artifacts.** No macOS, Windows, or Linux bundle was built or downloaded, and no
  release binary was compared against this tree. The updater's signature chain was read, not exercised.
- **Behavioral probe.** Nothing was installed or run: no board started, no CDP session opened, no
  DSH profile mounted. All statements above are static.
- **The cloud deployment.** The worker was read but never deployed; D1 schema behavior, R2 lifetime,
  and the `taskctl cloud login` token storage path were not exercised.
- **Runtime file integrity.** Whether the launcher writes `launcher-runtime.json` with restrictive
  permissions was not verified on a live install.
- **Cross-model review.** Single reviewer, one model.

## 6. Reviewer disagreement

Single-reviewer pass. Machine grade F versus adjudicated C. The gap is almost entirely scope: the
scanner graded a Tauri desktop application, a Cloudflare worker, and a 43-file test suite as if they
were the plugin. The plugin is 207 lines with zero findings. The C does not come from the scanner's
criticals, which are test fixtures; it comes from the default `0.0.0.0` bind, the CDP injection
model, and the fact that the bundle is only useful with the whole product installed.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/chuspeeism/dashi-taskboard /tmp/taskboard-audit
cd /tmp/taskboard-audit && git rev-parse HEAD   # expect 5c96d1ab698362994283ba0af86021db0a98dd89

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/taskboard-audit   # from a dsh-bridge checkout

# 3. Read the entire DSH plugin (this is the graded subject)
wc -l integrations/deepseek-harness/*.js            # 45 + 162 lines
cat integrations/deepseek-harness/index.js

# 4. Spot-check the headline claims
sed -n '1640,1646p' server/app.mjs                  # default bind is 0.0.0.0
sed -n '187,189p' README.md                         # LAN mode has no authentication
grep -n 'remote-debugging' scripts/codex-injector.mjs
grep -rn 'CODEX_HOME' server/ | head
grep -nE '"(pre|post)?install"|"prepare"' package.json   # lifecycle hooks: none
```

## 8. Methodology and pinned inputs

- Subject: git commit `5c96d1ab698362994283ba0af86021db0a98dd89` (shallow clone at
  reference/audits/dashi-taskboard, 2026-08-26)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...aee999`
- Review: full manual read of integrations/deepseek-harness/{index.js,client.js,package.json,
  cordis.patch.yml,README.md}; targeted reads of server/index.mjs, server/app.mjs (bind, options,
  auth-gate, spawn regions), server/ai-chat-catalog.mjs (Codex home and skill enumeration),
  cli/taskctl.mjs (command surface, cloud login), scripts/codex-injector.mjs (CDP regions),
  cloud/src/index.mjs (worker entry, basic-auth decode, attachment storage), src-tauri/tauri.conf.json,
  package.json, LICENSE, PRIVACY.md, README.md; adjudication of every critical, high, and medium
  scanner finding by family
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: the DSH artifact alone would sit in the B band, being 207 lines with no egress,
  no credentials, no dynamic execution, and no hooks. C is the honest grade for what a user actually
  installs: a plugin whose only function is to surface a service that binds to all interfaces without
  authentication by default (DAT-NET-1), that ships a CDP injector into another vendor's app
  (DAT-EXEC-1), and that reads another agent's configuration root (DAT-SCOPE-1). The pipeline ceiling
  for a pass without a behavioral probe or cross-model review is also C.

## 9. Strengths

1. The DSH bundle is the right size for the job. It does not proxy, cache, or re-implement anything;
   it reads one file and redirects. That is the smallest correct implementation of the feature.
2. Launcher mode has real authentication: a token path prefix, a challenge requirement for
   device-local routes, format validation of both secrets at startup, and stripping of launcher
   environment variables before spawning Codex (server/app.mjs:1650-1652).
3. Trusted-origin handling is unusually careful: exact HTTPS origins only, wildcards, paths,
   queries, credentials, and duplicates rejected, forwarded headers explicitly not trusted
   (README.md:191).
4. PRIVACY.md is specific and matches the code: it names the updater endpoint, states there is no
   maintainer analytics, and says where data lives per platform.
5. The CDP debugging surface is pinned to `127.0.0.1` rather than left on the default interface
   (scripts/codex-injector.mjs:390).

## 10. Residual risks

1. `npm start` on a laptop in a cafe or a shared office publishes your task board, including
   attachments, to everyone on that network. Set `CODEX_TASKBOARD_HOST=127.0.0.1` before first run.
2. While the injector is active, an open DevTools port exists on the Codex application. Any local
   process able to reach it can execute script in an application that is logged into your account.
3. The desktop app updates itself from GitHub Releases. The signature check is genuine; the trust
   decision is still "whatever the maintainer signs, I run".
4. The DSH sidebar panel follows a URL from a local JSON file with no allowlist. Treat write access
   to your application-support directory as write access to that panel.
5. The plugin's user-visible strings are Chinese-only, which is a fit problem for an English-first
   catalog, not a safety one.

## 11. Re-verify steps

1. Re-run step 7 against current HEAD. Any new import in `integrations/deepseek-harness/`, in
   particular anything from `node:child_process`, `node:https`, or a dynamic `import()`, invalidates
   this adjudication immediately: that directory is small enough that any growth is a signal.
2. Check whether `resolveHost` still defaults to `0.0.0.0` (server/app.mjs:1640). A change to
   `127.0.0.1` by default removes DAT-NET-1 and reopens the B band.
3. Watch for the DSH bundle gaining a `dependencies` block or leaving `private: true` and appearing
   on npm; that introduces a supply-chain surface this revision does not cover.
4. Re-read `scripts/codex-injector.mjs` on any release that changes the CDP evaluate payloads, and
   confirm the debugging address is still pinned to loopback.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
