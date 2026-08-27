# Trust Report Card: OpenPencil (`ZSeven-W/openpencil`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | OpenPencil - an open-source AI-native vector design tool (Rust workspace + TypeScript packages), not a Cordis plugin. Its agent surface is a built-in MCP server (`op-mcp`, stdio via `--mcp <path>` or loopback HTTP) plus AI provider/CLI orchestration. No `cordis.patch.yml`, `*.cordis.yml`, `SKILL.md`, or `dsh.plugin.json` exists in the tree; the catalog entry rides the repo's harness-adjacent topic tagging, and no DSH-specific code path was found (grep negative over README, docs/, crates/, packages/). |
| Pinned subject (git) | github:ZSeven-W/openpencil @ commit `9c810776dab546076a5d9db791a49d9e8048dbd7` (default branch head at audit time, v0.8.4 release commit, 2026-08-11T17:17:43+00:00) |
| Stars | 5,600 (upstream snapshot 2026-08-25) |
| Distribution | Source builds, nix, and desktop releases; the browser CanvasKit WASM loads separately. Not an npm package. |
| License | MIT (LICENSE:1-3). |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the auth bridge, prebuilt-binary policy, MCP crate, AI provider layer, collab relay client, and account origins) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A large, unusually well-documented Rust application whose trust story is dominated by one deliberate choice - account sign-in and device pairing run through a closed-source prebuilt static library committed into the repo - while everything auditable (the ticket verifier, relay endpoint parsing, MCP tools, AI provider dispatch to user-configured endpoints) checked out clean.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| Closed-source prebuilt component | Device-login implementation lives in private repo `ZSeven-W/op-platform` and ships as prebuilt C-ABI static archives (`libop_auth.a` / `op_auth.lib`) under `prebuilt/<target>/`; six legacy ABI-v1 archives are committed with pinned SHA256s, an eight-symbol allowlist, and self-declared "substantial source/build-path and debug metadata leakage"; newer ABI-v3 archives carry PROVENANCE files with source revision and build IDs but are not independently reproducible from public source. | crates/op-auth-bridge/src/lib.rs:5-13; crates/op-auth-bridge/prebuilt/README.md:5-16; prebuilt/x86_64-apple-darwin/PROVENANCE:1-8 |
| What stays open-source | Collaboration-ticket parsing, Ed25519 verification, strict claim validation, bounded JWKS caching, and relay-token verification are fully open in `op-auth-bridge`; the private library "may only issue opaque tickets." | crates/op-auth-bridge/src/lib.rs:14-16 |
| Account egress | Chrome extension core pins two consumer portal origins for session probe/login/logout: `https://op.zseven.cn` (CN) and `https://op.zseven.tech` (global), with fixed API paths and a CSRF-gated logout; login opens a tab rather than fetching. | crates/op-chrome-extension-core/src/account.rs:46-66, 126-127 |
| Collab relay endpoints | Relay URLs are strictly parsed (`wss` scheme required, hostname constraints enforced, loopback allowed, bare `relay.example` rejected); operator deploys their own edge with rate-limit rules shipped in-repo. | crates/op-collab-relay-client/src/endpoint.rs:113-149; deploy/collab-relay-locator-edge/install-global-new-connection-rate.sh:45 |
| MCP server | One-click install into Claude Code / Codex / OpenCode / Kiro / Copilot CLIs; stdio transport through the desktop binary plus a live HTTP endpoint bound on `127.0.0.1`. Design operations (batch design DSL, fill normalization, ref resolution) live as inspectable Rust modules. | README.md:330-331, 528; crates/op-mcp/src/batch_design_dsl.rs |
| AI provider dispatch | Providers are user-configured (`api_key` + `endpoint` + `model` for built-in providers, or a spawned CLI's local serve endpoint); requests go where the user points them, including localhost model servers. Web host binds loopback by default with an origin allowlist. | crates/op-ai/src/chat_provider.rs:96-114; README.md:258-266, 293 |
| Dynamic code execution | Scanner EXEC hits resolve to WASM module imports in the web host, a vendored CanvasKit bundle, and build scripts guarding against dynamic imports in service workers; no eval-family construct in first-party runtime code. | crates/op-host-web/pkg-ck/op_host_web.js:943; crates/op-host-web/src/figma_temp_worker.js:233; packages/op-chrome-extension/scripts/build-wasm.sh:158-164 |
| Telemetry | None found. The grep hits for "telemetry" are Rust identifiers and comments, not network senders; no analytics SDK or counter endpoint exists. | grep negative over crates/ and packages/ |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **144 findings** (0 critical, 90 high, 27 medium, 27 low)
over 275 files, machine grade **F**, score 0, off `dynamic-exec-present`, `finding-density`,
and multi-family density caps. Adjudication below covers every gate.

### Gates adjudicated

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| NET high x40 (digicert timestamp, sso.zseven.cn fixtures) | Codesign timestamp service in the release workflow and SSO policy JSON test fixtures carrying example/JWT payloads; neither is runtime behavior. | .github/workflows/rust-release.yml:489; crates/op-auth-bridge/tests/fixtures/zseven-sso-go-union-policy-v2.json:7 |
| NET high x28 canvaskit fetch/XHR | Vendored Skia CanvasKit WASM loader fetching its own module bytes and assets; standard web-app machinery inside the app's own UI, not data exfiltration. | crates/op-host-web/assets/canvaskit/canvaskit.js:157-163; crates/op-host-web/pkg-ck/op_host_web.js:1224 |
| EXEC high `Function(${name})` | String-building inside the vendored Emscripten-generated WASM glue that reconstructs exported function names at load time; not user-data-driven evaluation. | crates/op-host-web/pkg-ck/op_host_web.js:943; crates/op-host-web/pkg-webgl/op_host_web.js:1382 |
| EXEC high daemon spawn + child_process (daemon-client.ts:73-89, sync-version.mjs:396) | VS Code extension spawning its own bundled daemon binary and a version-sync script running `execFileSync` during development; fixed binaries, no remote input. | packages/op-vscode/src/daemon/daemon-client.ts:73-89; packages/scripts/sync-version.mjs:396 |
| OBFU low base64 blobs in fixtures | Test JWTs and golden collaboration envelopes, encoded because they are tokens; decode to policy-test data. | crates/op-auth-bridge/tests/fixtures/zseven-sso-go-v1.json:9; crates/op-collab-host/src/runtime/relay_bootstrap_testdata/golden-envelope.json:1 |
| HOOK family (setTimeout/setInterval/IIFE in canvaskit + workers) | Timer scheduling inside vendored renderer code and worker lifecycle management. | crates/op-host-web/assets/canvaskit/canvaskit.js:9-23; crates/op-html/assets/snapshot-extractor.js:1231 |
| `finding-density` | 275 scanned files across ~40 Rust crates plus TypeScript packages; density tracks repository size. | scanner stats: 275 files |

### The decision worth reading closely

The prebuilt-library policy is documented with unusual candor: the repo states the archives are
"inspectable inputs," that "client-side secrecy is defense in depth, not the trust root," that the
legacy six leak build metadata, and that its own hardening check script
(`tools/check-op-auth-prebuilt.sh --require-hardened`) rejects all currently committed archives.
Ticket signing and authorization stay server-side, so the archive cannot silently mint authority -
but it is still unauditable binary code linked into every signed-in desktop build.

## 5. What we could not check

- **Byte-level release provenance.** Desktop/release binaries were not downloaded and compared
  against this commit; PROVENANCE files assert a source revision we cannot rebuild from public source.
- **Behavioral probe** of the MCP server or desktop app (pipeline S4 unavailable).
- **Cross-model review.** Single reviewer.
- **Private repo contents** (`ZSeven-W/op-platform`, `openpencil-skill` registry): out of reach by definition.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. The gap: zero criticals, EXEC/NET volume
sits in vendored bundles and CI, and every first-party network path resolves to user-configured or
pinned-and-documented origins. C rather than B because unauditable prebuilt binaries ship in the
link path of the account system, the pipeline ceiling applies (no probe, single reviewer), and the
SSO/collab surfaces span third-party operated infrastructure whose current behavior can change
independently of any commit this card pins.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/ZSeven-W/openpencil /tmp/openpencil-audit
cd /tmp/openpencil-audit && git rev-parse HEAD   # expect 9c810776dab546076a5d9db791a49d9e8048dbd7

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/openpencil-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '5,16p' crates/op-auth-bridge/prebuilt/README.md        # leakage disclosure + policy
sed -n '46,66p' crates/op-chrome-extension-core/src/account.rs # pinned hub origins
sed -n '113,150p' crates/op-collab-relay-client/src/endpoint.rs # relay URL parsing rules
sed -n '96,115p' crates/op-ai/src/chat_provider.rs             # user-configured provider fields
grep -rn "cordis\|SKILL.md" . --include="*.yml" --include="*.yaml" 2>/dev/null   # expect: no DSH manifests
```

## 8. Methodology and pinned inputs

- Subject: git commit `9c810776dab546076a5d9db791a49d9e8048dbd7` (shallow clone at
  reference/audits/openpencil); scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 144 findings, rescored to
  the adjudications in section 4.
- Review: manual read of op-auth-bridge lib.rs and prebuilt policy/provenance files,
  op-chrome-extension-core/account.rs, op-collab-relay-client/endpoint.rs,
  op-ai/chat_provider.rs, op-mcp module headers, deploy/ edge scripts, LICENSE, README sections
  on security, providers, and MCP; classification pass over vendored bundles and workflows.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives adjudication; caps are the closed-source prebuilt
  auth library, unverifiable release binaries, missing probe/review. Result: C.

## 9. Strengths

1. The prebuilt-binary tradeoff is disclosed in the repository itself, with hashes, symbol
   allowlists, a leakage measurement script, and a hardening gate that fails its own current
   artifacts (crates/op-auth-bridge/prebuilt/README.md:5-16).
2. Security-critical verification logic (ticket signatures, claims, JWKS caching, token
   verification) is open Rust, keeping the trust root inspectable (src/lib.rs:14-16).
3. All external origins are pinned constants or user configuration; no hardcoded analytics or
   telemetry destination exists anywhere in the tree.
4. Relay endpoints enforce strict parse rules and the operator-side edge ships connection-rate
   limiting as reviewable shell (endpoint.rs:136-149).

## 10. Residual risks

1. Every signed-in install runs unauditable binary code from a private repository; users must
   trust the publisher for that component by construction (prebuilt/README.md:1-16).
2. Release artifacts cannot be reproduced from public source, so store/download binaries are taken
   on the PROVENANCE file's word (x86_64-apple-darwin/PROVENANCE:1-8).
3. Account and collaboration flows depend on operator-run services (`op.zseven.cn/.tech`, relay
   edges) whose server side is outside any commit this card can pin.
4. The VS Code daemon path executes a separately installed binary with process-spawning rights;
   scoped today, but it is a privileged seam (packages/op-vscode/src/daemon/daemon-client.ts:73-89).

## 11. Re-verify steps

1. Re-run section 7 greps against current HEAD. Any new hardcoded outbound origin, any eval-family
   construct in first-party code, or any widening of prebuilt-symbol surface forces re-adjudication.
2. Watch for ABI-v2/v3 archives becoming reproducible (published build recipes); closing that gap
   would lift residual risk 2 and justify re-grading toward B.
3. Re-vet at 90 days, at the next release touching `op-auth-bridge/prebuilt/` or the account
   origins, or if an npm/distribution channel appears that floats ahead of pinned commits.
