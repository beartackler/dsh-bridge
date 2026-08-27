# Trust Report Card: dsh-chatgpt-bridge

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-chatgpt-bridge` (MCP Streamable HTTP bridge letting ChatGPT web drive DSH agent sessions; v0.4 adds a control plane that supervises a `tunnel-client` child process) |
| Pinned subject | github:jiezeng2004-design/dsh-chatgpt-bridge @ commit `1ff7d467cbf65d99199692acbe796d3fe1734735` (2026-08-24) |
| npm integrity | `sha512-vQM0XicXhD+zrf8bU0qWqSu8QfHWxOSo70z6/Osvm/Es8ZJ986mnUNFMb4qU4WHb6Rfs32+mxx2HhD2mj66jTg==` (`registry.npmjs.org/dsh-chatgpt-bridge/0.4.1`, fetched 2026-08-27) |
| Provenance | None. `npm view ... gitHead` and `dist.attestations` are both empty; the tarball is not bound to this repo by any attestation. The published `lib/` is committed to git, so it can at least be compared by hand. |
| License | MIT (LICENSE present) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual read of the security-relevant TypeScript sources listed in section 8) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A remote-control surface built with unusual care - loopback bind by default, bearer auth compared
with `timingSafeEqual`, secrets held as `file:` references that never enter argv or logs, a
management API with layered loopback/Host/Origin/custom-header CSRF checks, and structured
`shell:false` spawns - but it is still a bridge whose whole purpose is to let a remote party create
sessions, send messages, and answer approval prompts inside DSH, and the MCP endpoint ships an
`Access-Control-Allow-Origin: *` header that becomes dangerous the moment an operator sets
`authMode: 'none'`.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Inbound listener | `node:http` server bound to `config.host` (default `127.0.0.1`) on `config.port` (default 3456), serving only `/mcp` (POST/GET/DELETE). All other paths 404, other methods 405. Body cap 4 MB, 128 concurrent MCP sessions, 30-minute idle sweep. | src/http.ts:74-140, MAX_MCP_BODY_BYTES at src/http.ts:33 |
| Inbound auth | `authMode: 'token'` by default. Bearer token compared with `crypto.timingSafeEqual` after a length check (src/http.ts:27-31, 79-85). Token resolution order: explicit config, then `DSH_CHATGPT_BRIDGE_TOKEN` env, then a persisted token file, then a freshly generated `randomBytes(24)` base64url token written to `$DSH_HOME/chatgpt-bridge.token`. | src/config.ts:79-88, 100-115 |
| Model-facing tool surface | 15 MCP tools registered, including `dsh_create_session`, `dsh_send_message`, `dsh_cancel_task`, `dsh_answer_question`, `dsh_approve`, and the goal-supervision set. `dsh_approve` requires an exact `approval_id` plus an explicit approve/reject and grants `allowed-once`; there is no approve-all. | src/mcp.ts:71-343, src/bridge.ts:1489-1515 |
| Outbound network | Three destinations. (1) Loopback probe of its own `/mcp` endpoint (src/control/diagnostics.ts, `probeBridge`). (2) A control-plane probe to `openai.controlPlaneBaseUrl`, defaulting to `https://api.openai.com` (src/control/runtime-manager.ts:42, 721), path `/v1/tunnel/<tunnelId>`, TTL-cached, sending `Authorization: Bearer <runtime api key>` when one is configured. (3) Optional HTTP/HTTPS proxy CONNECT when the user enables a proxy (src/control/diagnostics.ts:423-432). Loopback destinations bypass the proxy. | file:line above |
| Child processes | `spawn(executable, args, { shell: false, windowsHide: true, ... })` for `tunnel-client run`, argv fully structured (src/control/process-tunnel-runtime.ts:178-205). Read-only OS probes: `ps -p <pid> -o comm=` / `-o lstart=`, `ps -ax -o pid=,command=`, `/proc` reads, and PowerShell `Get-Process` / `Get-CimInstance` on Windows (src/control/process-identity.ts:49-107, src/control/discover.ts:169, 211-240). One `git worktree remove --force <path>` in goal cleanup (src/temp-resources.ts:144). Every one uses an argv array; no shell anywhere. | file:line above |
| Credential handling | Secrets live in `$DSH_HOME/chatgpt-bridge/secrets/` chmod 0600 on POSIX, and are passed to `tunnel-client` only as `file:<path>` references, never as literal values in argv, YAML, or logs (src/control/secret-store.ts:9-107, src/control/profile-generator.ts:40-63). The runtime API key is read transiently for one outbound probe and is never returned by the API (`configured: true/false` only, src/control/routes.ts:257-268). | file:line above |
| Environment enumeration | `Object.entries(process.env)` is copied into the tunnel-client child's environment (src/control/process-tunnel-runtime.ts:173-177). This is inheritance, not exfiltration: the values go to a child process on the same machine, and the code deliberately overrides inherited `CONTROL_PLANE_API_KEY`/`OPENAI_API_KEY` with an explicit `--control-plane.api-key` flag so parent credentials cannot silently substitute (comment and flag at src/control/process-tunnel-runtime.ts:181-185). | file:line above |
| Filesystem writes | `$DSH_HOME/chatgpt-bridge/` only: `secrets/`, `logs/*.ndjson`, generated tunnel profiles written temp+rename (src/control/profile-generator.ts:80-92), plus `$DSH_HOME/chatgpt-bridge.token`. Goal cleanup deletes files, but only ones that pass `isSafeToDelete` and resolve strictly inside the workspace root (src/temp-resources.ts:48-66). | file:line above |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm` in src/ or lib/. | grep across src and lib: zero hits |
| Telemetry | None. No analytics or beacon code. The only unprompted outbound traffic is the control-plane status probe described above, which is the feature. | grep across src and lib |
| Lifecycle hooks | None that run on install. `package.json` scripts are build/test/dogfood only; there is no `preinstall`, `postinstall`, or `prepare`. | package.json:57-67 |
| Browser-side surface | Settings panel in `lib/client.js`. `fetch` targets are the relative path `/_dsh/chatgpt-bridge` only (`const API` at lib/client.js:29, used at lib/client.js:249, 255). `https://api.openai.com` at lib/client.js:883 is an input placeholder string. | lib/client.js:29, 249-260, 883 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0. Raw output: 391 findings across the whole tree
(including tests, scripts, lockfiles, and generated `.d.ts`). Restricting to shipped `lib/` and
`package.json` leaves 34. Adjudicated by family below; the corresponding TypeScript sources in
`src/` were read for each.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 "enumerates entire environment", lib/control/process-tunnel-runtime.js:109 | Documented behavior, kept as low. Copies `process.env` to build the child environment for `tunnel-client`. Nothing is transmitted; the code explicitly out-ranks inherited API-key variables with a flag so they cannot leak into the tunnel's control-plane auth. | src/control/process-tunnel-runtime.ts:173-185 |
| EXEC-004 x5, `import { spawn/spawnSync } from 'node:child_process'` | Imports, not calls. Call sites adjudicated below. | lib/control/discover.js:21, process-identity.js:16, process-tunnel-runtime.js:10, temp-resources.js:7, and one `.d.ts` type import |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| CGB-CORS-1 | medium | src/http.ts:62-67 | The MCP server sets `Access-Control-Allow-Origin: *` and allows the `Authorization` header on every response. With the default `authMode: 'token'` this is mostly inert: a browser page cannot read the bearer token, so cross-origin requests get 401. With `authMode: 'none'` (a supported config value, src/config.ts:19) any web page the operator visits can drive the full 15-tool surface against `http://127.0.0.1:3456/mcp`, including `dsh_send_message` and `dsh_approve`. The README calls `none` "not recommended"; the wildcard CORS header is what makes that setting sharp rather than merely unauthenticated. |
| CGB-EXPOSE-1 | medium | src/config.ts:15 | `host` is operator-configurable with no loopback constraint. The default is `127.0.0.1`, but setting `0.0.0.0` exposes an MCP control channel for DSH to the LAN with only bearer-token protection and the wildcard CORS header above. The management API by contrast hard-enforces loopback (src/control/routes.ts:38-56); the MCP data plane does not. |
| CGB-NET-1 | medium | src/control/runtime-manager.ts:42, 721 | Default outbound destination `https://api.openai.com`, probed with the configured runtime API key. Documented and central to the product, and the base URL is user-overridable through the management API (validated to http/https, src/control/routes.ts:154-162). |
| CGB-EXEC-1 | low | src/control/process-tunnel-runtime.ts:205 | Spawns the `tunnel-client` binary discovered on PATH or at well-known install locations. `shell:false`, structured argv, `windowsHide`. The plugin refuses to adopt or kill a `tunnel-client` it did not start: stop paths verify a full process identity (pid + executable + start time + per-launch id) before signalling (src/control/process-identity.ts, and the module docstring at process-tunnel-runtime.ts:1-8). |
| CGB-EXEC-2 | low | src/control/process-identity.ts:49, 80; src/control/discover.ts:214 | PowerShell invocations on Windows. The only interpolated value is a `Number.isInteger`-validated pid (process-identity.ts:48), and the CIM query string is a constant. No user text reaches a shell. |
| CGB-EXEC-3 | low | src/temp-resources.ts:144 | `git worktree remove --force <path>` during goal cleanup. Guarded by `isSafeToDelete` plus `resolveInsideWorkspace`, which rejects the workspace root itself and any path escaping it via `..` or absolute form (src/temp-resources.ts:48-66). Argv array, no shell. |
| CGB-PROV-1 | low | package metadata | Published to npm with no provenance attestation and no `gitHead`. The CI workflow builds and tests but does not publish (.github/workflows/ci.yml), so the release path is manual and unattested. |

### Scanner noise dismissed (with scope)

- 357 of 391 findings are outside the shipped surface: `test/**` (27 unit test files), `scripts/**`
  (dogfood harnesses; the `fetch('http://127.0.0.1:3080/api/session.list')` at scripts level is a
  local dogfood call, not shipped code), `src/**` duplicates of the same `lib/**` rows, and
  `package-lock.json` / `pnpm-lock.yaml`. The lockfile alone contributes every
  `https://opencollective.com/express` NET-007 hit - funding URLs in dependency metadata.
- NET-003 on `import { get } from 'node:http'` and `node:net`/`node:tls`: capability imports for
  the probe code, adjudicated at CGB-NET-1.
- NET-007 at lib/http.js:162,165: log line and returned URL string for the server's own listener.
- NET-008 x3 and SUPPLY-010 on package.json:28-32: `repository`, `homepage`, `bugs` metadata.
- EXEC-014 at lib/control/diagnostics.js:226 (`tlsSocket.setTimeout(0)`): clearing a socket timeout
  after a successful proxy CONNECT, not execution.
- NET-013 at lib/control/discover.js:148: builds `http://host:port` for a loopback health URL from
  the tunnel profile's `listen_addr`; the surrounding function documents and enforces loopback-only.
- lib/client.js:249,255: relative-path fetches to the plugin's own same-origin management API.

### Negative claims and what was searched

Read: src/index.ts, config.ts, http.ts, mcp.ts, redact.ts, web-gateway.ts, temp-resources.ts, the
approval path in bridge.ts, and all of src/control/ (routes.ts, secret-store.ts,
process-tunnel-runtime.ts, process-identity.ts, discover.ts, profile-generator.ts, diagnostics.ts,
runtime-manager.ts probe paths), plus package.json, both cordis patch files, and .github/workflows/ci.yml.
No `eval`/`new Function`/`vm`; no base64-decoded-then-executed content; no obfuscation (source is
TypeScript compiled with `tsc`, unminified, and the committed `lib/` is readable and matches the
`src/` structure); no telemetry; no reads of `.ssh`, `.aws`, browser stores, or OS keychains; no
writes outside `$DSH_HOME/chatgpt-bridge*`; no install-time lifecycle hooks.

## 5. What we could not check

- **Behavioral probe.** No sandboxed run: the HTTP server was never started, no MCP session was
  opened, no `tunnel-client` was spawned. Every claim here is static.
- **The published tarball vs this tree.** `lib/` is committed and was read, but we did not download
  `dsh-chatgpt-bridge@0.4.1`, unpack it, and byte-compare against this commit. With no npm
  provenance attestation and no `gitHead`, nothing cryptographically binds the two.
- **We did not rebuild.** `npm run build` (tsc + the client bundler) was not executed, so we did not
  confirm that the committed `lib/` is the output of the committed `src/`. Spot checks matched
  (for example lib/config.js retains `randomBytes(24)` and `createTokenFile`), but that is sampling,
  not proof.
- **tunnel-client itself.** The supervised binary is third-party software that terminates the
  ChatGPT-side connection. Its network behavior, its handling of the `file:` secret references, and
  its own attack surface are entirely outside this artifact and unaudited here.
- **The MCP SDK.** `@modelcontextprotocol/sdk` 1.30.0 implements the transport, session ids, and
  request routing. Not audited; a flaw there is a flaw in this bridge's front door.
- **Effective authorization of the DSH tools.** The bridge argues that DSH keeps its own approval
  and workspace model. We did not test whether every tool path genuinely re-enters DSH's approval
  gate; we read `dsh_approve` and the bridge's approval bookkeeping only.
- **CSRF guards under real browsers.** The management API's Host/Origin/custom-header checks were
  read, not exercised against a live browser or a DNS-rebinding attempt.
- **Windows paths.** PowerShell probes, `taskkill` escalation, and `%APPDATA%` profile discovery
  were read but not executed.
- **Test suite.** The 27 unit test files were not run; no coverage claim is made.

## 6. Reviewer disagreement

Single-reviewer pass (one model). The scanner graded the tree F on 391 findings, the overwhelming
majority in tests, scripts, and lockfiles; the manual verdict is B. Both positions are recorded in
section 4 rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/jiezeng2004-design/dsh-chatgpt-bridge /tmp/cgb-audit
cd /tmp/cgb-audit && git rev-parse HEAD   # expect 1ff7d467cbf65d99199692acbe796d3fe1734735

grep -rn "eval(\|new Function\|vm\." src lib        # dynamic exec: none
sed -n '62,67p' src/http.ts                          # the wildcard CORS header
sed -n '27,31p' src/http.ts                          # timingSafeEqual bearer comparison
sed -n '13,20p' src/config.ts                        # defaults: 127.0.0.1, token auth
grep -n "DEFAULT_CONTROL_PLANE" src/control/runtime-manager.ts   # api.openai.com
sed -n '38,56p' src/control/routes.ts                # loopback + Host + Origin guards
grep -n "shell: false" src/control/process-tunnel-runtime.ts     # structured spawn
grep -n '"preinstall"\|"postinstall"\|"prepare"' package.json    # no install hooks

npm view dsh-chatgpt-bridge@0.4.1 dist.integrity
#   expect sha512-vQM0XicXhD+zrf8bU0qWqSu8QfHWxOSo70z6/Osvm/Es8ZJ986mnUNFMb4qU4WHb6Rfs32+mxx2HhD2mj66jTg==
npm view dsh-chatgpt-bridge gitHead dist.attestations   # both empty: no provenance
```

## 8. Methodology and pinned inputs

- Subject: git commit `1ff7d467cbf65d99199692acbe796d3fe1734735` (shallow clone at
  reference/audits/dsh-chatgpt-bridge)
- Scanner: dsh-bridge tools/scan 0.1.0
- Review: manual read of src/{index,config,http,mcp,redact,web-gateway,temp-resources}.ts, the
  approval path of src/bridge.ts, and src/control/{routes,secret-store,process-tunnel-runtime,
  process-identity,discover,profile-generator,diagnostics}.ts plus the probe paths of
  runtime-manager.ts; package.json, cordis.patch.yml, cordis.headless.patch.yml,
  .github/workflows/ci.yml; spot reads of lib/client.js, lib/http.js, lib/config.js
- Cross-model review: NOT performed (single reviewer); revision 1 is capped accordingly
- Grade derivation: start at A. Two mediums (CGB-CORS-1 wildcard CORS interacting with the
  supported `authMode: 'none'`, and CGB-EXPOSE-1 unconstrained bind host) plus a documented default
  egress to `api.openai.com` place it at **B**. No high or critical production finding survived
  adjudication. Unaudited third-party tunnel-client and absent provenance are recorded in sections
  5 and 10 rather than folded into the grade for this pinned tree.

## 9. Strengths

1. Security-first defaults, stated as such in the config docstring and actually implemented:
   loopback bind, token auth, bounded result sizes (src/config.ts:7-35).
2. Constant-time token comparison with a length pre-check, avoiding both the timing leak and
   `timingSafeEqual`'s length-mismatch throw (src/http.ts:27-31).
3. Secrets never materialize in argv, YAML, or logs. Everything is a `file:` reference to a 0600
   file, and the API reports only `configured: true/false` (src/control/secret-store.ts:1-8, 57-70;
   src/control/routes.ts:128 explicitly refuses secret writes through the config endpoint).
4. Layered CSRF defense on the management API: loopback remote address, Host allowlist, Origin
   allowlist, a required custom header, and a `application/json` content-type check, with no CORS
   wildcard on that surface (src/control/routes.ts:38-56, 201-232).
5. Process ownership is verified, not assumed. Stop paths check pid plus executable plus start time
   plus a per-launch id, and the module states plainly that it never kills by port and never kills
   every `tunnel-client` (src/control/process-tunnel-runtime.ts:1-8, src/control/process-identity.ts).
6. Deletion is fenced: `resolveInsideWorkspace` rejects the workspace root and any `..` escape
   before anything is removed (src/temp-resources.ts:48-66).
7. Redaction is applied to log lines and to error text returned by the API, keyed on both
   secret-shaped keys and secret-shaped substrings (src/redact.ts, used at src/control/routes.ts:236).
8. Approval semantics are narrow: exact `approval_id`, explicit decision, `allowed-once`, no
   approve-all (src/bridge.ts:1489-1515).
9. Every child process uses `shell:false` with structured argv; there is no string command line
   anywhere in the plugin.

## 10. Residual risks

1. This is remote control of an agent by design. Anyone holding the bearer token can create
   sessions, send messages, cancel work, answer the agent's questions, and approve its tool calls.
   The blast radius is DSH's full workspace permission model, not a subset of it.
2. `Access-Control-Allow-Origin: *` on `/mcp` (src/http.ts:62). Combine it with `authMode: 'none'`
   and any web page the operator visits can drive the bridge on loopback. Do not use `none`.
3. `host` accepts any bind address (src/config.ts:15). Setting it beyond loopback puts the MCP
   endpoint on the network with bearer-token-only protection.
4. The bearer token is persisted in plaintext at `$DSH_HOME/chatgpt-bridge.token` with no chmod
   applied to that file (src/config.ts:81-86; the 0600 discipline in secret-store.ts is not applied
   here). Any local process running as the user can read it.
5. `tunnel-client` is unaudited third-party software holding the far end of the connection, and it
   receives a copy of the plugin process's entire environment (src/control/process-tunnel-runtime.ts:173).
6. Default outbound probe to `https://api.openai.com` carrying the runtime API key whenever one is
   configured, on a TTL timer, without a per-request prompt.
7. No npm provenance and no `gitHead`: the published 0.4.1 tarball is not cryptographically bound to
   this commit, and the committed `lib/` was not rebuilt and byte-compared.
8. `authMode: 'none'` exists at all. It is one config line away from an unauthenticated agent
   control channel.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any change to `setCors` (src/http.ts:62), to the
   `host`/`authMode` defaults (src/config.ts:13-20), or to the guards in src/control/routes.ts:38-56
   must be re-adjudicated before this grade carries forward.
2. Diff the spawn construction at src/control/process-tunnel-runtime.ts:178-205 on every release:
   `shell: false` and the structured argv are load-bearing.
3. Re-check `DEFAULT_CONTROL_PLANE` and every `fetch`/`httpGet` call site for new outbound hosts.
4. Confirm `package.json` still has no `preinstall`/`postinstall`/`prepare` script.
5. Diff `npm view dsh-chatgpt-bridge dist.integrity` against the pinned hash; a mismatch requires a
   new revision. If provenance is ever added, record it and raise the header fields.
6. Rebuild from `src/` with `npm run build` and diff against the committed `lib/` to close the gap
   noted in section 5.
