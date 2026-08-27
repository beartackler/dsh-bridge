# Trust Report Card: @openviking/dsh-memory-plugin (OpenViking)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@openviking/dsh-memory-plugin` 0.2.1 (DSH memory bundle inside github.com/volcengine/OpenViking, `examples/dsh-memory-plugin`) |
| Pinned subject | github:volcengine/OpenViking @ commit `3964d8685c8e35ca778abacdce2b76dc295e1a2c` (default branch head at audit time; shallow clone at reference/audits/openviking) |
| npm integrity | `sha512-zyH7D46uX/7L3F2NKSidan1Y4/HrhpG/A+6KVauBKsWgEctUZqRSr1hzknYIO1yRm4yxEEcgBpKbCj+OXORqDw==` (`registry.npmjs.org/@openviking/dsh-memory-plugin/0.2.1`, fetched 2026-08-26) |
| Provenance | npm SLSA provenance attestation present; registry `gitHead` is `daf5fb1774fa33804ffaed7b6f445340de59296c`, an ancestor of the pinned HEAD (not byte-reachable from the shallow clone; see section 5) |
| License | Apache-2.0 for `examples/` per repo README ("examples: Apache 2.0 - see examples/LICENSE"); the repo root LICENSE is AGPL-3.0 and covers the server crates, not this package |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Safe with documented behavior: every network destination is the user-configured OpenViking
endpoint (loopback by default) plus an explicitly chosen Volcengine cloud option in a manual,
interactive setup wizard; credential access is limited to OpenViking's own config files under
`~/.openviking/`; there is no dynamic code execution, no child process spawning from the plugin,
no telemetry, no obfuscation, and conversation data flows only to the endpoint the user pinned.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | All HTTP goes to exactly one configured base URL, resolved as `OPENVIKING_URL` env -> `~/.openviking/ovcli.conf` -> `~/.openviking/ov.conf` -> `http://127.0.0.1:1933` default (shared/credentials.mjs:130-145, config.mjs:13-14). The runtime client fetches only `<endpoint>/health`, `/api/v1/sessions*`, `/api/v1/search/*`, `/api/v1/content/*`, `/api/v1/fs*`, `/api/v1/resources`, `/api/v1/system/status` (client.mjs:63-205). The MCP proxy posts to `<endpoint>/mcp` (shared/mcp-proxy-core.mjs:303-330). One additional literal exists: `https://api.vikingdb.cn-beijing.volces.com/openviking` in shared/setup-wizard.mjs:19, offered as interactive menu option 2 of the manual setup wizard, never fetched by plugin code. | file:line above |
| Credential reads | Only OpenViking's own files: `~/.openviking/ovcli.conf` and `~/.openviking/ov.conf` (paths overridable via `OPENVIKING_CLI_CONFIG_FILE` / `OPENVIKING_CONFIG_FILE`), read with `readFileSync` + JSON.parse (shared/credentials.mjs:7-8, 24-31, 82-109). No `.ssh`, `.aws`, `.claude`, `.codex`, opencode auth, browser stores, or OS keychain access anywhere in the bundle (grep verified, scope in section 4). Env vars read are all `OPENVIKING_*` plus queue tuning knobs (config.mjs:61-77; pending-queue.mjs:57-73). | grep + manual read |
| Credential handling | API key travels only in `Authorization: Bearer` headers to the configured endpoint (client.mjs:9; shared/mcp-proxy-core.mjs:252). The proxy child receives resolved credentials via environment variables it sets itself (mcp.mjs:22-27); DSH scrubs credential-shaped names from inherited env, so nothing else leaks into the child. Setup wizard masks secrets on display (`maskSecret`, shared/setup-wizard.mjs:22-27) and writes ovcli.conf mode 0600 (shared/setup-wizard.mjs:99-101). Debug logging records only booleans (`hasApiKey`, `hasIdentity`), never values (shared/mcp-proxy-core.mjs:224-232, 480-486; servers/mcp-proxy.mjs:31-32 requires explicit `OV_DEBUG_LOG`). | file:line above |
| Child processes | None spawned by plugin code. Zero `child_process`, `spawn`, `execFile`, `execSync`, or `fork` in production sources (grep returned zero hits). The stdio proxy is itself spawned *by DSH's MCP client* using `process.execPath` (mcp.mjs:31-34); the plugin only supplies argv. | negative claim, scope stated |
| Dynamic code execution | None. No `eval(`, `new Function`, `vm.*`, dynamic `import()`, or string-compiled code in any shipped module (grep zero hits across 25 production .mjs files). Shipped artifact is unminified source, not a bundle. | grep + manual read |
| Filesystem writes | Only under `~/.openviking/`: `pending/` queue files written 0600 into a 0700 dir (shared/pending-queue.mjs:39-54, 213-217), `state/` cache JSON via tmp-file rename (shared/recall-core.mjs:391-404; shared/recall-compress-core.mjs:142-145), and `ovcli.conf` itself via the interactive wizard (backup then 0600 write, shared/setup-wizard.mjs:95-104). Debug log appends only when `OV_DEBUG_LOG` is set (shared/debug-log.mjs:38-44). Nothing else on disk is touched. | file:line above |
| Conversation capture | On every `session/event` the plugin serializes user/assistant messages (tool results off by default, `captureToolResults: false`, config.mjs:35,154) and POSTs them to the configured endpoint (runtime.mjs:138-167). Plugin-injected messages are excluded so recall blocks are not re-captured as user input (capture.mjs:30-41). Failed sends land in the local pending queue and replay at next session start (runtime.mjs:143-165; shared/pending-queue.mjs:187-230). | file:line above |
| Context injection | Session-start injects a profile block; each pre-step appends a recall block built from server results, wrapped in `<openviking-context>` (index.mjs:22-43; shared/profile-inject.mjs:243-294; shared/recall-core.mjs:434-492). Token budgets enforced client-side (profile-inject.mjs:73-99, 155-186). | file:line above |
| Tool surface guard | `tools/pre-execute` denies filesystem/shell tool calls whose arguments contain `viking://` URIs and points the model at the bridged MCP tools (uri-guard.mjs:39-51). | uri-guard.mjs |
| Telemetry | None. No analytics/beacon/metrics code; the only User-Agent is `openviking-memory-dsh/<version>` sent to the user's own endpoint (shared/credentials.mjs:37-39). | negative claim, scope stated |

Data flow summary: conversation text -> local serialization -> POST to user-pinned endpoint
(loopback self-hosted server by default, or a Volcengine cloud instance if the user chose one).
Recalled memory text -> injected as plugin-attributed messages into the model context.
No third party other than the configured OpenViking server sees anything.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output over the whole OpenViking monorepo: 2950 findings (31 critical, 749 high, 73 medium,
2097 low), machine grade F. Manual adjudication below separates the audited plugin directory
(170 findings: 28 high, 3 medium, 139 low) from the rest of the monorepo.

### Why the machine grade F does not apply to this card

The scanner grades the repository, not the plugin. Every critical finding sits outside
`examples/dsh-memory-plugin`: GitHub workflow secret plumbing (`.github/workflows/docs-tos.yml:79,86`,
`release-tos.yml:112` — CI reading its own `secrets.TOS_SECRET_KEY` for docs deployment),
test fixtures copying `process.env` (`examples/{claude-code,codex,opencode}-memory-plugin`,
`examples/openclaw-plugin/tests/config.test.ts:6,445`, `examples/opencode-plugin/tests/config.test.mjs`
throughout), and `dynamic-eval` hits that are literal `import { spawn } from "node:child_process"`
statements in *other* harness plugins' shared lib (`examples/memory-plugin-shared/lib/async-writer.mjs:18`,
`examples/claude-code-memory-plugin/scripts/lib/host-compressor.mjs:14`). The CRED+NET cap lists
14 modules; none is in the audited plugin. The audited plugin itself has **zero** CRED-family and
zero EXEC-family findings (scanner output filtered on `path startsWith examples/dsh-memory-plugin`).

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| OV-NET-1 | medium | client.mjs:23; servers/mcp-proxy.mjs via shared/mcp-proxy-core.mjs:308,338 | Declared egress to the user-configured OpenViking endpoint. Default is loopback; remote endpoints require explicit user configuration (env var or conf file). This is the product's purpose, documented in README "Behavior". |
| OV-NET-2 | low | shared/setup-wizard.mjs:19 | Literal Volcengine cloud URL exists as wizard menu option 2. Never dereferenced programmatically; reaching it requires the user to type "2" at an interactive prompt and confirm the write. |
| OV-CRED-1 | medium | shared/credentials.mjs:147-206 | Reads `~/.openviking/ovcli.conf` / `ov.conf` containing `api_key`. Scoped to the plugin's own credential store; values go only into Authorization/X-OpenViking-* headers toward the same configured endpoint. |
| OV-HOOK-1 | low | package.json:35 `prepublishOnly` | Publisher-side validation hook (`npm run check && npm test`). No install/postinstall scripts exist (grep verified). Release runs through GitHub Actions with SLSA provenance (.github/workflows/dsh-plugin-release.yml:80). |
| OV-HOOK-2 | low | shared/mcp-proxy-core.mjs:494-499 | `process.on("SIGINT"/"SIGTERM")` in the MCP proxy child: graceful session delete then exit. Signal handlers, not lifecycle hooks. |
| OV-DATA-1 | medium | runtime.mjs:45-48, 138-167 | Automatic conversation capture to the memory server. Off-switches exist (`syncTurns: false`, `captureToolResults` stays false by default); destination is always the single user-configured endpoint. Users who run nothing on 127.0.0.1:1933 get failed health checks and a no-op, not silent upload elsewhere. |
| OV-DATA-2 | low | index.mjs:32-43 | Recall/profile injection adds model-visible messages each step. Source-attributed as plugin messages and excluded from re-capture (capture.mjs:35). Prompt-injection surface: content comes from the user's own memory store, not from a public network. |

### Scanner noise dismissed (with scope)

- 139 NET-low hits in the plugin: 137 are `package-lock.json` `resolved:` registry URLs and
  sponsor/funding links (dev-only lockfile entries, not executed), plus `package.json:74`
  repository metadata. Test files contributed 7 NET-high hits (`http://plugin.local`,
  `http://ov.example.com` fixture strings).
- The remaining plugin highs are the real egress sites already kept above (client.mjs:23,
  credentials.mjs:144 constructed loopback host:port, mcp-proxy-config derived `/mcp` URL).
- Repo-wide: 2600+ findings in other examples' test suites, unrelated plugins' spawn usage,
  and documentation URLs. Out of scope for this card; noted because the monorepo grade is F.

### Negative claims and what was searched

Searched all 25 production `.mjs` files (5491 lines total incl. tests; all production files
additionally read in full): no `eval(`/`new Function`/`vm.`/dynamic import; no `child_process`,
`spawn`, `execFile`, `execSync`, or `fork`; no base64/hex blobs decoded then executed (grep
`atob|Buffer.from(...base64)` zero hits); no obfuscation markers (plain readable source, no
minification, no homoglyphs); no `setInterval` or deferred beacons (only three `setTimeout`
abort timers bound to request lifetimes: client.mjs:21, mcp-proxy-core.mjs:306,336); no reads
of `.ssh`, `.aws`, `.claude`, `.codex`, opencode auth, browser profiles, or OS keychains; no
env enumeration (every `process.env` access names a specific `OPENVIKING_*`/pending-queue key);
no writes outside `~/.openviking/**` and the debug log path; no telemetry endpoints; no install-time
network or install scripts; no lifecycle registration performing network I/O before a session
exists (apply() registers handlers; first HTTP happens on session-start health check).

## 5. What we could not check

- **Published tarball vs pinned commit.** npm 0.2.1's gitHead (`daf5fb17...`) predates the pinned
  HEAD (`3964d86...`) and is not an object in the shallow clone. We extracted the published tarball
  and byte-compared all 16 core modules: 13 identical; 3 differ (`runtime.mjs`, `mcp.mjs`,
  `shared/recall-core.mjs`). The diffs are additive hardening present in the pinned tree
  (duplicate-profile suppression, `ELECTRON_RUN_AS_NODE=1` for Desktop, `viking://~` home-alias
  support) and contain no new egress, exec, or credential surface. Residual risk remains until
  someone reproduces the exact 0.2.1 tag checkout; the SLSA provenance binds the tarball to a
  GitHub Actions run of this repo.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  not available here). Static review covered the same surfaces but cannot rule out
  environment-dependent behavior.
- **Peer packages.** Behavior of `@deepseek-ai/dsh-mcp-client` (which spawns the proxy child and
  scrubs env) and `@deepseek-ai/dsh-skill-filesystem` is taken on trust; they resolve from the
  user's DSH installation, not from this artifact.
- **The OpenViking server side.** What the server does with captured conversations, and whether a
  cloud endpoint honors its own retention promises, is outside this artifact. The plugin also
  exposes whatever tools the connected server advertises (`README.md:160-168`): the tool surface
  can grow without a plugin release.
- **install.sh path.** README's curl-bash installer (`examples/memory-plugin-shared/install.sh`,
  3400+ lines) was spot-checked (installs `@openviking/dsh-memory-plugin@latest` from npm, writes
  profile config, chmod 600/700 on its own files) but not fully audited; it is a separate artifact.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner's machine grade (F,
whole-monorepo) disagreed with the manual verdict (B, plugin-scoped); both positions are recorded
in sections 4 rather than hidden. Card revision 1 is capped accordingly.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/volcengine/OpenViking /tmp/ov-audit
cd /tmp/ov-audit && git rev-parse HEAD   # expect 3964d8685c8e35ca778abacdce2b76dc295e1a2c

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ov-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE 'eval\(|new Function|vm\.|child_process|spawn\(' \
  examples/dsh-memory-plugin --include='*.mjs' | grep -v '.test.mjs'   # expect: no output
grep -rhoE 'https?://[a-zA-Z0-9./_:-]+' examples/dsh-memory-plugin/*.mjs \
  examples/dsh-memory-plugin/shared/*.mjs | sort -u                    # expect: loopback defaults,
                                                                       # example.com fixtures, volces.com wizard literal
sed -n '7,9p' examples/dsh-memory-plugin/shared/credentials.mjs        # credential file scope: ~/.openviking only
sed -n '39,54p' examples/dsh-memory-plugin/shared/pending-queue.mjs    # 0700 dir / 0600 file modes

# 4. Confirm the published artifact
npm view @openviking/dsh-memory-plugin@0.2.1 dist.integrity
#   expect sha512-zyH7D46uX/7L3F2NKSidan1Y4/HrhpG/A+6KVauBKsWgEctUZqRSr1hzknYIO1yRm4yxEEcgBpKbCj+OXORqDw==
```

## 8. Methodology and pinned inputs

- Subject: git commit `3964d8685c8e35ca778abacdce2b76dc295e1a2c` (shallow clone at reference/audits/openviking)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`, 979 files scanned
- Review: full manual read of all 25 production modules in examples/dsh-memory-plugin
  (index, client, config, capture, runtime, lifecycle, mcp, skills, uri-guard, servers/mcp-proxy,
  shared/{credentials, mcp-proxy-config, mcp-proxy-core, pending-queue, debug-log,
  recall-core, recall-compress-core, profile-inject, capture-utils, retryable, session-model,
  plugin-config, setup-wizard, workspace-peer, uri-guard}), plus cordis.patch.yml, package.json,
  README.md, skills/openviking-memory/SKILL.md, .github/workflows/dsh-plugin-release.yml,
  examples/LICENSE, and a spot-check of examples/memory-plugin-shared/install.sh
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero EXEC/CRED findings in the audited artifact; all egress declared,
  documented, defaulting to loopback, and user-visible (B band). Caps applied: none beyond the
  single-reviewer note and the tarball-vs-HEAD caveat in section 5.

## 9. Strengths

1. Minimal blast radius by construction: one configurable endpoint, loopback default, and a
   credential store scoped to the plugin's own `~/.openviking/` directory
   (shared/credentials.mjs:7-9). A user running nothing locally gets connection failures, not uploads.
2. No dynamic code execution and no child-process spawning anywhere in the bundle; the only
   subprocess (the MCP proxy) is launched by DSH's own client from `process.execPath` (mcp.mjs:31-34).
3. Secret hygiene: masked display in the wizard (setup-wizard.mjs:22-27), 0600 writes for every
   secret-bearing file, 0700 queue dirs, boolean-only debug logs, secrets redacted from error paths
   (mapError returns status and message, never the key material it received).
4. Injection discipline: recalled context enters as source-attributed plugin messages that are
   excluded from re-capture (capture.mjs:30-35), token-budgeted before injection
   (profile-inject.mjs:155-186), and the SKILL.md explicitly instructs the model to treat memories
   as background reference rather than instructions (SKILL.md "Boundaries").
5. Honest self-documentation: README states the capture behavior, peer-scope semantics,
   `forget` being destructive, and why injection avoids the system prompt.
6. Reproducible release: version-gated GitHub Actions publish with SLSA provenance and an
   idempotency check against the live registry (dsh-plugin-release.yml:57-80).

## 10. Residual risks

1. Automatic conversation capture is on by default (`syncTurns: true`): everything you type and
   the assistant replies flow to whatever endpoint the plugin resolves. Point `OPENVIKING_URL` at
   a hostile host and you have handed it your transcripts; the plugin cannot evaluate endpoint
   trust for you.
2. The connected server defines the tool surface. `mcp__openviking__write`, `edit`, and `forget`
   mutate or delete memory-store content, and the advertised set grows server-side without a
   plugin update (README.md:160-168). A compromised or malicious server can reshape what the
   model can do through these tools.
3. Recalled memory text is injected into model context each step. Content previously stored in
   memory (or written there by another integration sharing the server) is a stored
   prompt-injection vector; mitigations are attribution, budget caps, and the skill's
   "background reference" instruction, not isolation.
4. Published npm 0.2.1 lags the pinned commit by several commits (see section 5); the audit
   covers HEAD, provenance covers the tarball, but nobody has yet reproduced the exact 0.2.1 bytes.
5. Peer-package trust: env scrubbing and proxy spawning happen inside `@deepseek-ai/dsh-mcp-client`,
   outside this artifact.
6. The README's recommended install path is curl-bash of a 3400-line installer script that
   ultimately installs `@latest` from npm, which would bypass the pinning this card relies on;
   prefer `dsh plugin add @openviking/dsh-memory-plugin@<exact version>`.

## 11. Re-verify steps

1. Re-run step 7 block above against current upstream HEAD; any new literal URL, exec-family hit,
   or non-`OPENVIKING` credential path must be re-adjudicated before this grade carries forward.
2. Diff `npm view @openviking/dsh-memory-plugin dist.integrity` against the pinned integrity;
   mismatch = new revision required.
3. On version bumps: re-check `package.json` scripts (any new lifecycle hook is a finding), the
   `files:` list (new shipped directories widen the audit surface), and whether `shared/` still
   matches `examples/memory-plugin-shared/lib` (the sync generator is the supply-chain seam).
4. Re-run the tarball byte-compare of section 5 once the published gitHead is reachable from a
   normal clone; unresolved diffs keep the section 5 caveat alive.
5. Re-run the scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
