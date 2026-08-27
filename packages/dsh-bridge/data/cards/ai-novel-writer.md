# Trust Report Card: AI-Novel-Writer (`EthanYoQ/AI-Novel-Writer`, DSH plugin `@ethanyoq/dsh-ai-novel-writer`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | Two products in one repo. (1) A local-first Electron desktop novel-writing suite (~1400 files) with its own updater, MCP layer, and embedding service. (2) The audited DSH plugin `@ethanyoq/dsh-ai-novel-writer` 0.1.0 under `plugins/dsh-ai-novel-writer`: a revisioned, approval-gated novel-project surface exposing only `novel_read` plus one write-shaped tool per preset, with SQLite-backed V2 proposals behind a loopback RPC face. |
| Pinned subject (git) | github:EthanYoQ/AI-Novel-Writer @ commit `59e2d2b4ad29795a2999d8990f6dede22e5e9a11` (default branch head at audit time, committed 2026-08-24T07:22:22+08:00, "feat(dsh-ai-novel): add reviewed V2 authoring MVP (#139)") |
| Stars | 393 (catalog snapshot 2026-08-19); 459 live at audit time |
| Distribution | npm package exists but is stale relative to HEAD; the README's own install path is build-from-source in the plugin directory followed by `dsh plugin --profile web add .` or a self-packed tgz (README.md:60-70). The README explicitly forbids installing the repo root as a plugin: the root package is the desktop app, not an activatable bundle (README.md:79). |
| License | MIT (LICENSE; plugin package carries its own MIT LICENSE and THIRD_PARTY_NOTICES.md) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the plugin package in full, the embedding egress module, credential findings, and release scripts named by gates) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: the DSH plugin itself is disciplined - no egress, no dynamic execution, every write approval-gated, browser clients barred from supplying paths - but adopting this repository means co-installing an Electron desktop platform whose model API keys sit in plaintext JSON, whose Windows builds ship an auto-updater, and whose release tooling pairs environment credentials with GitHub network calls.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| Read-only novel reads | `novel_read` returns manifest, architecture, characters, chapters, working set, and query matches from `.ai-novel/` with hard byte caps (512 KiB asset, 512 KiB working set, 20 matches). | plugins/dsh-ai-novel-writer/src/novel-project.ts:26-30, 36-40 |
| Approval-gated writes | V1 exposes `novel_apply_change`; every mutation renders as a one-file diff passing through Harness native one-shot approval before execution, with SHA-256 optimistic concurrency failing closed on stale revisions. | plugins/dsh-ai-novel-writer/README.md:5-7, 15-17; src/agent.ts:476-486 |
| Non-authoritative V2 proposals | V2 preset swaps writes for `novel_propose_change`: bundles land in a pending inbox capped at 20 x 2 MiB and change nothing until a human applies them in the workbench. | plugins/dsh-ai-novel-writer/README.md:19-21; src/novel-store.ts exports |
| Preset tool deny-list | A global pre-execute hook denies every other tool while a novel agent owns the session; neither preset mounts shell or general filesystem writing. | src/agent.ts:189-195; README.md:23 |
| Closed loopback channel | The V2 workbench talks through `/ai-novel` RPC carrying an opaque WorkspaceId; the Host resolves paths via the Workspace registry and rejects unknown ids, browser-supplied paths, and JSON patches. | src/command-rpc.ts:487; README.md:25-27 |
| Preset installation | Copies two immutable YAML files into `$DSH_HOME/.agent-presets` with atomic directory publication, 0600/0700 modes, and race-safe conflict detection; browser cannot submit local paths. | src/preset-installer.ts:57-83 |
| Desktop app egress | Embedding calls go to user-configured OpenAI-compatible endpoints with a known-roots allowlist for URL inference (api.openai.com, api.deepseek.com, loopback Ollama); Gemini posts to the user's base URL. No third-party telemetry endpoint found anywhere in the tree. | electron/embedding.ts:197-201, 236, 256-271, 294 |
| Desktop plaintext key storage | Model profiles including `apiKey` are read from and written to `~/.vela/models.json` as plain JSON; the README says so and tells you to protect your OS account. | electron/utils/config-utils.ts:121; electron/controllers/llm-controller.ts:31-36; README.md:152-153 |
| Desktop auto-update | Windows update runtime wires `electron-updater`'s `autoUpdater`; update behavior is gated on packaged Windows configuration flags. | electron/main.ts:225-230; electron/services/electron-updater-adapter.ts:69-70 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **396 findings** (6 critical, 313 high, 35 medium, 42 low) over
701 scanned files, machine grade **F**, score 0, off `cred-plus-net`, `dynamic-exec-present`,
and `finding-density`. Adjudication covers every gate:

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| `cred-plus-net` naming `.release/scripts/github-desktop-promotion.mjs` | Maintainer release promotion script: reads `GITHUB_TOKEN` from the environment to call GitHub's API and download release artifacts it then verifies. Runs in CI or at the maintainer's desk, never ships inside the desktop bundle or the plugin. Same pattern in `scripts/windows-in-app-update-e2e.mjs` (an end-to-end test driver). | .release/scripts/github-desktop-promotion.mjs:584, 398-491; scripts/windows-in-app-update-e2e.mjs:135 |
| `cred-plus-net` naming `electron/embedding.ts` | The pairing is real product code but split by design: `process.env.AI_NOVEL_RELEASE_SMOKE_TOKEN` feeds a qualification-only path that additionally requires env gates, a hex token format check, argv match, and echo-through of the same token as both API key and base-URL suffix before it activates; ordinary egress sends only the user-entered key to the user-configured endpoint. | electron/embedding.ts:167-181, 197-201, 256-271 |
| Critical `credential-access` x6, all `{ ...process.env }` copies | Five live in `__tests__`/qualification specs that clone the environment into spawned child processes; one is an e2e driver. None forwards the environment off-machine. | electron/services/__tests__/release-*-smoke.test.ts:13-14; scripts/renderer-surface-e2e.mjs:750; plugins/dsh-ai-novel-writer/tests/qualification.spec.ts:360 |
| High `network-egress` x158 | Release engineering against api.github.com, smoke-test fixtures, and the desktop embedding client described above. Zero hits inside `plugins/dsh-ai-novel-writer/src/`. | grep of plugins/dsh-ai-novel-writer/src returned silence; .release/scripts, electron/embedding.ts |
| High `dynamic-eval` x155 | 79 in `scripts/__tests__`, 30 in release scripts (`spawnSync("unzip", ...)`, spawned verifiers), 5 in desktop tests, 5 in `electron/security` (the native helper build path). Inside the plugin package: `qualify-release.mjs` spawns a grandchild probe script, and `verify-built.mjs` dynamically imports its own freshly built artifacts - build-time self-checks, not runtime eval. | scripts/qualify-release.mjs:374, 620-622; scripts/verify-built.mjs:68-74; tests/fixtures/workbench-browser-v1/driver.mjs:33 |
| Medium `credential-access` x14 | Environment reads across the same release/e2e population; no keychain, token store, or credential-file scraping found. | findings table cross-checked by hand |
| `finding-density` | 396 findings across a 170 MB monorepo containing three products measures size, not capability concentration. | scanner stats: 701 files scanned |

### What is actually true about the plugin package

`plugins/dsh-ai-novel-writer/src/` contains zero fetch/XHR/http-request calls, zero child-process
imports, zero evaluators. Its sharpest objects are the tools it registers on purpose, both of which
require human approval or produce no write at all (src/agent.ts:476-486).

## 5. What we could not check

- **Behavioral probe.** No sandboxed run of the plugin against a live harness (pipeline S4 unavailable).
- **Cross-model review.** Single reviewer.
- **npm provenance.** Published `@ethanyoq/dsh-ai-novel-writer@0.1.0` predates HEAD (#139 added the
  V2 MVP after publication): tarball lacks `presets/ai-novel-writer-v2/` and differs in package.json
  and README. Equality between the tarball's source and any historical commit was not established.
- **Desktop binaries.** Windows/macOS installer artifacts were not downloaded, run, or compared.
- **Electron dependency tree** (electron-updater, better-sqlite3 native rebuild, LanceDB) reviewed
  only at call sites cited above.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. The gap: every critical is an environment
clone in tests, the cred-plus-net pairing lives in maintainer release plumbing plus a deliberately
hard-to-reach qualification branch, and the shipped plugin has no egress or execution surface at all.
C rather than B because the pipeline ceiling bars B, because the desktop half stores API keys in
plaintext JSON by documented default, and because a Windows desktop install silently brings an
auto-update channel along.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/EthanYoQ/AI-Novel-Writer /tmp/novel-audit
cd /tmp/novel-audit && git rev-parse HEAD   # expect 59e2d2b4ad29795a2999d8990f6dede22e5e9a11

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/novel-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(\|child_process\|new Function\|eval(" plugins/dsh-ai-novel-writer/src/   # expect silence
sed -n '189,195p' plugins/dsh-ai-novel-writer/src/agent.ts        # preset tool deny hook
sed -n '167,181p' electron/embedding.ts                            # release-smoke token gate chain
sed -n '197,201p' electron/embedding.ts                            # known embedding roots
sed -n '584,586p' .release/scripts/github-desktop-promotion.mjs    # GITHUB_TOKEN in release tooling
grep -n "MODELS_CONFIG_PATH" electron/utils/config-utils.ts        # ~/.vela/models.json plaintext keys
```

## 8. Methodology and pinned inputs

- Subject: git commit `59e2d2b4ad29795a2999d8990f6dede22e5e9a11` (shallow clone at
  reference/audits/AI-Novel-Writer); scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 396 findings, rescored to
  the adjudications in section 4.
- Review: manual read of all 33 plugin source files' network/process/eval sweeps, agent guardrails,
  command-rpc face, preset-installer, novel-project path handling, electron/embedding.ts in full,
  llm-controller config persistence, updater adapter, the six critical sites, and both gate-named
  release scripts; classification pass over the remainder.
- Provenance: `npm pack @ethanyoq/dsh-ai-novel-writer@0.1.0` downloaded and diffed against HEAD
  (differs; npm lags the audited revision).
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives adjudication; the plugin package is clean on every
  scanner family. Caps: pipeline ceiling, plaintext desktop key storage, bundled auto-update
  machinery, unverified desktop binaries, floating npm provenance. Result: C.

## 9. Strengths

1. The plugin enforces least surface mechanically: a global pre-execute hook denies every tool it
   does not own, so the novel agent cannot reach shell or arbitrary file writes at all
   (src/agent.ts:189-195).
2. Write integrity is engineered, not promised: SHA-256 last-read revisions, fail-closed stale checks
   before any directory mutation, atomic replacement, cancellation honored up to the write boundary
   (plugins/dsh-ai-novel-writer/README.md:15-17).
3. The browser client is structurally unable to name filesystem paths; the Host resolves everything
   through the Workspace registry (src/command-rpc.ts:487; README.md:25-27).
4. The README actively steers users away from the wrong install command and states plainly what V2
   does not do yet (README.md:48-52, 79).
5. Embedding URL inference is allowlisted to four well-known roots plus exact user input, with
   loopback Ollama pinned to port 11434 and no credentials in URLs (electron/embedding.ts:197-233).

## 10. Residual risks

1. Installing the plugin from this repo means cloning a full Electron application tree onto your
   machine; supply-chain trust extends beyond `plugins/` to 1400 files of desktop app and release
   scripting (repo layout; README.md:79 warns about root-package confusion but the tree still ships).
2. Desktop model API keys persist unencrypted in `~/.vela/models.json`, readable by any process under
   your account (electron/utils/config-utils.ts:121; README.md:152).
3. Windows desktop builds include an electron-updater runtime; update feed integrity depends on
   GitHub release security rather than anything verified here (electron/main.ts:225-230;
   electron/services/electron-updater-adapter.ts:69-70).
4. npm installs resolve to 0.1.0, which predates the audited V2 revision; provenance between registry
   and git history is unestablished either direction.
5. The V2 store keeps the authoritative database outside Git backup by design; data-loss risk sits
   with the user until export ships (plugins/dsh-ai-novel-writer/README.md:21).

## 11. Re-verify steps

1. Re-run section 7 greps against current HEAD. Any fetch, process import, or evaluator appearing
   under `plugins/dsh-ai-novel-writer/src/` forces immediate re-adjudication upward in risk.
2. Re-diff the next npm publish against its git tag; equality restores part of the provenance chain.
3. Watch for encrypted-at-rest key storage or OS keychain use in the desktop app; that would soften
   residual risk 2 materially.
4. Re-vet at 90 days, at the next plugin publish, or at any release touching
   `plugins/dsh-ai-novel-writer/src/agent.ts` or `electron/embedding.ts`.
