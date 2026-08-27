# Trust Report Card: MemOS (`@memtensor/memos-local-plugin`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@memtensor/memos-local-plugin` - a local-first memory layer for agent harnesses. The DSH integration is the `memos-local-memory` Cordis bundle in `apps/memos-local-plugin/adapters/deepseek-harness/`: recall injection before each turn, conversation capture, six read-oriented memory tools, an optional host-LLM delegation, and a loopback Memory Viewer web server. The catalog entry `MemTensor/MemOS` is the research monorepo; the graded subject is the plugin package inside it. |
| Pinned subject | github:MemTensor/MemOS @ commit `9119efe5554e61a94b669df5eb84cc1b8ef3c0ab` (main head at audit time); audited package version `2.0.16-beta.1` in-tree, npm latest `2.0.17` at audit time |
| Stars | 10,989 (GitHub API, audit time) |
| npm integrity | `sha512-vs/aEilXbT2eQfZLJEnv7XQjbYvN4eF1LqFXtZ0uSlnTup5hDylrt802hEocfgltUJ1/EpYZgooZilQN3DcwBw==` (`@memtensor/memos-local-plugin@2.0.17`, fetched 2026-08-26). No `gitHead`, no attestation surfaced for that version; the audited tree is one minor behind npm latest. |
| License | Apache-2.0, LICENSE present at repo root and declared via pyproject/packaging metadata. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of the DSH adapter path and shared core) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The DSH adapter itself is disciplined - memory stays in a local SQLite file, the viewer binds
loopback-only with a hard loopback assertion, host-LLM calls ride DSH's own credential routing without
the plugin ever touching keys, and its telemetry module is not wired into this adapter - but the
package ships sibling surfaces (OpenClaw ARMS telemetry on by default, an admin route that can spawn
a replacement daemon, shell-based installers) and installs via `curl | bash`, which cap it at C.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Session hooks | Injects into DSH's pre-step: extracts the turn's LLM route, runs bounded recall against local memory, and renders recalled context into the prompt within `recallTimeoutMs` (default 3000 ms), failing open past the deadline so recall can never hold the prompt path hostage. Capture queues each completed turn to local storage in a serial background queue. | adapters/deepseek-harness/index.ts:36-38, 47-48; bridge.ts:202, 249-258, 268-275; deadline.ts |
| Tools registered | Six read-only tools: `memos_search`, `memos_get`, `memos_timeline`, `memos_environment`, `memos_skill_list`, `memos_skill_get`. No write or delete tools are exposed to the model. | adapters/deepseek-harness/tools.ts:70, 153, 243, 287, 328, 372 |
| Network egress (adapter path) | None of its own. The adapter imports no fetch/http client; the only sockets it opens are the viewer listener. Outbound-capable code lives in the shared core but is config-gated (see below). | grep negative over adapters/deepseek-harness; server/http.ts:64-65 (listener only) |
| Host-LLM delegation | When enabled, MemOS's internal summarization calls are routed through `@deepseek-ai/dsh-llm` using the route captured from the user's own session provider. The module states and shows that it accepts no credentials itself: "No credential is accepted or read here. DSH resolves credentials inside its..." | adapters/deepseek-harness/host-llm.ts:1-2, 53, 93 |
| Storage | Local `better-sqlite3` database under the resolved home (`$DSH_HOME/memos-plugin/` by default for DSH, `$MEMOS_HOME` override). Conversation capture lands here, not on any server. | core/storage/connection.ts:18, 32-43; apps/memos-local-plugin/README.md:58 |
| Viewer server | Binds `127.0.0.1` only; the DSH adapter throws on any non-loopback bind host rather than degrading. Optional API-key middleware enforces bearer/x-api-key on `/api/*` when configured. Admin routes include restart/clear-data endpoints; the daemon-replacement path spawns a fixed command line built from the plugin's own paths. | adapters/deepseek-harness/index.ts:279-285 (loopback assert); server/http.ts:64-65; server/middleware/auth.ts:14-31; server/routes/admin.ts:315-320 |
| Credential handling | Reads only its own home files: `config.yaml`, `.auth.json` (its own hashed session-secret store, mode 600 write), plus `MEMOS_*` env vars. No reads of `~/.claude`, `~/.codex`, `~/.ssh`, `~/.aws`, or agent auth stores anywhere in the plugin package. | core/config/paths.ts:135-137, 148-157; server/routes/auth.ts:110-123; grep negative otherwise |
| Telemetry | An Aliyun ARMS RUM sender exists in the shared core with `telemetry.enabled: true` by default and opt-out via config - but it sends only aggregate counts/tool names/latencies/version with a random anonymous ID, and the DSH adapter never constructs it ("The DSH adapter does not construct a MemOS telemetry sender"). It IS wired into the OpenClaw sibling adapter. | core/telemetry/sender.ts:4-11, 255; adapters/deepseek-harness/README.md:559-562; adapters/openclaw/index.ts:163-167; core/config/defaults.ts:331 |
| Config-gated providers | Core LLM/embedding clients target well-known endpoints (api.openai.com, api.anthropic.com, generativelanguage.googleapis.com, api.cohere.ai/voyageai/mistral) only when the user configures those providers; defaults are empty endpoint + `fallbackToHost`. Hub client activates only when `hub.enabled` with an explicit address. | core/config/defaults.ts:60-100; core/llm/providers/*.ts; server/routes/models.ts:220-343; core/hub/client.ts:504 |
| Install channel | Documented install for DSH is `curl ... install.sh \| bash -s -- --agent dsh --profile web --version X` or plain `dsh plugin add`; the installer prepares an isolated pnpm@11.7.0, allowlists exactly four native build scripts (better-sqlite3, esbuild, onnxruntime-node, sharp), disables protobufjs/hint scripts, and fails closed on unknown build scripts. | apps/memos-local-plugin/README.md:88-150; install.sh:1131-1147 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**3106 findings** (31 critical, 2156 high, 182 medium, 737 low) over 993 files across the whole
monorepo. Machine verdict **F**, off three gates: `cred-plus-net`, `dynamic-exec-present`,
`finding-density`.

### Where the volume is

926 highs sit in `evaluation/data/locomo` (research corpus fixtures). Another ~500 are in test suites
and lockfile funding URLs. Scoping to the graded plugin package (`apps/memos-local-plugin`, tests and
viewer source excluded): roughly 40 significant findings, all adjudicated below.

### Criticals, highs, and gates in shipped code, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC high `new Function("return import(specifier)")` (bridge.cts:638) | A CJS-to-ESM dynamic-import shim used by the standalone daemon bootstrap (`bridge.cts`), not by the DSH bundle path. Specifier comes from the daemon's own argument parsing, not remote input. Not reachable from `dsh plugin` profile loading. | bridge.cts:638-640 |
| EXEC high `spawn("bash", ["-c", cmd])` (server/routes/admin.ts:315) | Real capability, narrow construction: `cmd` is `sleep 3 && <node> <tsx> <bridge.cts> --agent=<agent> --daemon` where every component derives from the plugin's own install root; `--agent` is validated upstream. Reachable only via the authenticated admin API on a loopbound viewer. Flagged as residual risk, not exfiltration. | server/routes/admin.ts:303-321 |
| EXEC high `execFile("pgrep", [...])` (bridge/hermes-process.ts:97) | Hermes process discovery for the daemon handoff; fixed binary name and pattern list. Hermes-sibling surface, not in the DSH path. | bridge/hermes-process.ts:39, 97 |
| NET high provider endpoints (core/llm/providers, embedding/providers, models.ts) | Dormant by default: defaults set `provider: ""`, `endpoint: ""`, `apiKey: ""` with `fallbackToHost: true`; requests fire only after the user writes provider config, and then to the documented vendor hosts. | core/config/defaults.ts:60-100; server/routes/models.ts:220-343 |
| NET high telemetry sender (core/telemetry/sender.ts:255) | Not constructed anywhere in the DSH adapter (grep negative over adapters/deepseek-harness). Active in the OpenClaw adapter only, opt-out-by-default there. Recorded as a cross-adapter behavior users should know about. | adapters/deepseek-harness/README.md:559-562; adapters/openclaw/index.ts:163-167 |
| CRED medium `existsSync(config.yaml / .auth.json)` and `process.env` walk (core/config/paths.ts:135, 156) | Home-resolution logic for its own data directory. `.auth.json` content is its own salted hash/session secret, written 0600. No third-party credential store is touched. | core/config/paths.ts:125-160; server/routes/auth.ts:110-123 |
| HOOK high `npm install` in install.sh / hermes/openclaw installer scripts | Install-time tooling executed deliberately by the user, not hooks fired during package install. The npm `postinstall` hook itself is a print-only hint script whose own header promises "intentionally tiny and side-effect free" and exits immediately for non-global installs. | install.sh:400-401, 1131-1147; package.json:73; scripts/postinstall.cjs:10-19 |
| `cred-plus-net` gate | In the DSH path, the two families never meet: no network client is imported in the adapter, and the core's outbound clients are config-gated off. Dismissed for this subject. | section 3 rows |
| `dynamic-exec-present` gate | Sole trigger is the bridge.cts shim above; the shipped DSH bundle contains no dynamic evaluation. | scan scoping |

### Behavior worth naming because it is unusual

The recall path treats latency as a security property: recall runs under an absolute deadline race so
that a hung retrieval can never stall or expand the user's prompt assembly beyond
`recallTimeoutMs`, and loses fail-open (bridge.ts:259-276 comments and implementation).

## 5. What we could not check

- **Published tarball equality.** npm latest is `2.0.17` while the audited tree carries
  `2.0.16-beta.1`, with no `gitHead` binding; byte-level comparison of what npm serves against this
  commit was not possible.
- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.
- **Python core (`src/memos`) and research packages.** Out of scope: they are the MemOS research
  stack, not the DSH plugin. Scanner findings there were classified, not adjudicated line by line.
- **ONNX runtime model downloads.** The default local embedding model (`Xenova/all-MiniLM-L6-v2`)
  implies a first-use model fetch through transformers.js infrastructure; the fetch chain was not
  traced end to end.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. Both recorded. The gap: nearly all volume is
research fixtures and lockfiles; the CRED+NET pairing does not exist in the DSH execution path; the
dynamic-eval trigger is a daemon-side import shim. The ceiling stands at C because provenance could
not be verified end to end, no probe ran, and the package family ships an opt-out telemetry sender
and shell-spawning admin routes that a careful user should know about even though the DSH path avoids
them.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/MemTensor/MemOS /tmp/memos-audit
cd /tmp/memos-audit && git rev-parse HEAD   # expect 9119efe5554e61a94b669df5eb84cc1b8ef3c0ab

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/memos-audit/apps/memos-local-plugin   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE "fetch\(|https?://" apps/memos-local-plugin/adapters/deepseek-harness --include="*.ts"   # expect: no hits
sed -n '275,290p' apps/memos-local-plugin/adapters/deepseek-harness/index.ts    # loopback assertion on the viewer
sed -n '85,100p'  apps/memos-local-plugin/core/config/defaults.ts               # empty llm provider + fallbackToHost
sed -n '90,95p'   apps/memos-local-plugin/adapters/deepseek-harness/host-llm.ts # "No credential is accepted or read here"
grep -rn "Telemetry" apps/memos-local-plugin/adapters/deepseek-harness          # expect: no hits
sed -n '10,20p' apps/memos-local-plugin/scripts/postinstall.cjs                 # side-effect-free postinstall claim

# 4. Confirm what npm serves
npm view @memtensor/memos-local-plugin version dist.integrity   # expect 2.0.17, integrity as in section 1
```

## 8. Methodology and pinned inputs

- Subject: git commit `9119efe5554e61a94b669df5eb84cc1b8ef3c0ab` (shallow clone at
  reference/audits/MemOS); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 3106 findings monorepo-wide,
  rescored mentally to ~40 significant findings in the graded package.
- Review: full manual read of adapters/deepseek-harness/{index,bridge,tools,host-llm,deadline}.ts
  (~2300 lines), server/{http.ts,routes/admin.ts,middleware/auth.ts}, core/config/defaults.ts and
  paths.ts, core/telemetry/sender.ts, core/hub/client.ts, scripts/postinstall.cjs, README install
  sections; classification pass over everything else.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives in the DSH path; egress is absent by construction
  there; storage is local; the viewer is loopbound with an explicit assertion. Caps: unverifiable
  tarball-to-commit provenance, no S4 probe, single reviewer, opt-out telemetry present in the wider
  package, admin restart/spawn surface - together bar anything above C. Result: C.

## 9. Strengths

1. The DSH adapter has zero network egress by construction; the only socket is the viewer listener,
   and its bind host is asserted loopback with a thrown error rather than a warning
   (adapters/deepseek-harness/index.ts:279-285).
2. Host-LLM delegation reuses the user's own session route through `@deepseek-ai/dsh-llm` instead of
   collecting an API key of its own (host-llm.ts:93).
3. Recall is deadline-bounded and fails open, treating prompt-path latency as a first-class constraint
   (bridge.ts:249-276).
4. The model-facing tool surface is strictly read-only; nothing exposed to the agent mutates memory.
5. The installer's pnpm build-script policy is allowlist-and-fail-closed, explicitly refusing
   `approve-builds --all` (apps/memos-local-plugin/README.md:141-146).
6. The npm postinstall hook documents and implements a no-side-effects contract, exiting immediately
   outside global installs (scripts/postinstall.cjs:10-19).

## 10. Residual risks

1. Provenance gap: npm latest (`2.0.17`) does not correspond to any auditable commit we could pin;
   registry installs trust the publisher's tarball wholesale.
2. The shared core ships an ARMS telemetry sender that is on by default wherever it is wired (OpenClaw
   today). A future change wiring it into the DSH adapter would be silent unless re-reviewed
   (core/telemetry/sender.ts:4-11).
3. The viewer's admin API can restart the process and spawn the replacement daemon via bash; safe
   today because inputs derive from install paths, but it is the sharpest object in the package
   (server/routes/admin.ts:130-145, 303-321).
4. Without an API key configured, any local process can read memory contents over the loopback
   viewer; the code says so plainly and relies on single-user machine assumptions
   (server/middleware/auth.ts:4-12).
5. Documented install is `curl | bash` from the main branch, which pins neither revision nor content
   hash (apps/memos-local-plugin/README.md:141).
6. First-use ONNX embedding may fetch model weights from the network through library machinery that
   was not traced (core/config/defaults.ts embedding block).

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any `fetch(`/http import appearing under
   `adapters/deepseek-harness`, any non-loopback bind allowance, or any telemetry constructor in the
   DSH path forces re-adjudication.
2. Check whether npm publishes now carry `gitHead` or provenance attestation linking tarball to
   commit; closing that closes residual risk 1.
3. Diff `adapters/deepseek-harness` between the audited commit and any new release tag before trusting
   this card for that release; the package moves quickly (beta channel).
4. Re-vet at 90 days, on the next stable `@memtensor/memos-local-plugin` major, or if telemetry gets
   wired into the DSH adapter, whichever comes first.
