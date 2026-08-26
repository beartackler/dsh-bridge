# Trust Report Card: cherry-studio

| | |
|---|---|
| **Grade** | **C** — use with awareness |
| Plugin | cherry-studio (github.com/CherryHQ/cherry-studio), DSH integration `@cherrystudio/dsh-bridge` 0.0.1-alpha.1 |
| Pinned subject (git) | `491a9fb1e180409d9bdb21c4b6be66fc28f31a27` (default branch `main` HEAD; release tag `v2.0.9` published 2026-08-24T11:58:01Z) |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-scan 0.1.0, rules digest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999` |
| Methodology | Static scan (tool) + manual source review of the full DSH integration surface and flagged hotspots + npm/GitHub release-channel checks. Behavioral probe (S4) and cross-model adversarial review (S5) have NOT run. |

A grade is evidence-backed opinion over the pinned artifacts above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

The DSH bridge itself is careful engineering (token-authenticated loopback socket, fail-closed policy engine), but the app ships one opaque obfuscated vendor bundle in its SSO login flow that cannot be audited from source, plus opt-out analytics and an unpinned global-install postinstall in dev tooling, which caps it at C.

## What this plugin can do (capability surface)

This repository is Cherry Studio, a popular Electron AI chat client (51k stars). Its DeepSeek Harness support is a control-plane plugin that embeds a full DSH runtime inside the app:

| Capability | Present | Evidence |
|---|---|---|
| Network egress | Model APIs + first-party services, documented | Main-process host list includes api.openai.com, api.anthropic.com, openrouter.ai, aihubmix.com, r.jina.ai reader proxy, paddleocr.aistudio-app.com OCR, and first-party `open.cherryin.net/.ai` gateway endpoints. PRIVACY.md commits to no collection of API keys or conversation content outside transient built-in-model relay. |
| Obfuscated code shipped to users | Yes — one bundle | `src/main/services/nutstore/sso/lib/index.mjs`: ~5,700 scanner findings of hex-mangled identifiers and string-table indirection (classic javascript-obfuscator output), imported by `NutstoreService.ts:10` (`createOAuthUrl`, `decryptSecret`) for Nutstore WebDAV account login. This executes inside the Electron main process with user tokens as inputs and cannot be verified against any public source. |
| Credential-path reads | Guards only, plus one existence probe | Critical CRED hits are refusal logic: MCP `read_source` blocks `.env*`, PEM/key files, and exact credential filenames (`src/main/ai/mcp/servers/assistant.ts:26-34`); trash protection refuses sensitive directories (`src/main/ai/tools/moveToTrash.ts:91-107`). The Claude-login check queries macOS Keychain for item presence without reading the secret (`src/main/services/codeCli/CodeCliService.ts:85-99`, comment: "Never reads or stores the credential value itself"). One `{ ...process.env }` inheritance in `ExternalAppService.ts:257`. |
| Dynamic code execution | Build-time only | 73 prod EXEC hits are array-argv spawns in packaging scripts and RegExp `.exec` detector matches. No eval/new Function found in runtime paths reviewed. |
| Child processes | Yes — spawns the DSH runtime | `src/main/ai/runtime/dsh/compositionBuilder.ts` composes ~40 pinned `@deepseek-ai/*` rc packages into a child agent process; `DshBridgeServer.ts` hosts the control plane. |
| IPC/socket surface | Loopback Unix domain socket, token-gated | Per-session socket in tmpdir with random UUID name (`DshBridgeServer.ts:49-52`, Windows named pipe), 0600 chmod (`:87-88`), 256-bit auth token via `randomBytes(32)` (`:58`), constant-time comparison with length check (`:230`), fail-closed on disconnect (`packages/dsh-bridge/src/link.ts:32-37`). Token is consumed then deleted from env (`plugin.ts:58`). |
| Tool-call policy | Local enforcement engine | `packages/dsh-bridge/src/policy.ts:24-60`: deny-list → plan-mode read-only allowlist with workspace-root containment → approval gates → bypass handling; delegated calls re-checked (`decideDelegatedToolCall`); global-install command detection (`detectGlobalInstall`, policy.ts:239). Dependency-free by design so it runs inside the dsh subprocess unmodified. |
| npm lifecycle hooks | Dev-machine only, one global install risk | Root `package.json:84` `prepare` runs `prek install` unless CI (dev checkout hook installer); `:85` `postinstall` builds the local dsh-bridge workspace package via pnpm filter (local build, nothing fetched). `scripts/win-sign.js` referenced by scan does Windows signing in release CI. No hooks ship to end users through the Electron installers. |
| Timers / beacons | Analytics exist, opt-out | PRIVACY.md (updated 2026-08-20): anonymized version checks and usage aggregates collected by default under Settings → Data Settings → Privacy toggles; explicit commitment against collecting conversation content, API keys, or identity. |
| Services registered | Full DSH composition | The bridge registers session/command/policy handlers over JSON-RPC (`plugin.ts:66-118`); approvals round-trip to Cherry UI; subagent lifecycle events stream back. |

Distribution channel note: Cherry Studio ships as signed Electron installers via GitHub releases (21 assets for v2.0.9), not npm; `@cherrystudio/dsh-bridge` is a private workspace package ("private": true in its package.json) consumed in-app, so there is no public tarball to diff — correspondence rests on building from the pinned commit.

## Findings

Raw scan output retained at `reference/audits/scan-cherry-studio.json`. Mechanical result: grade F, 11,448 findings (24 critical, 10,909 high, 133 medium, 382 low) over 7,361 files; gates include `cred-plus-net`, `dynamic-exec-present`, `finding-density`, `install-hook-shell`. Adjudication:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| OBFU-001 | `src/main/services/nutstore/sso/lib/index.mjs` (5,693 high findings) | high | Real and unresolved: a minified-plus-obfuscated vendor bundle executing in the main process, decrypting SSO tokens (`NutstoreService.ts:26-35` calls `decryptSecret`). No matching upstream source could be identified in-repo; provenance unknown. This single file accounts for nearly all OBFU volume and is why the card cannot rise above C. Kept high. |
| CRED criticals x7 | guard code + keychain presence probe | critical | All reviewed instances refuse access (`assistant.ts:33`, `moveToTrash.ts:94-96`), assert non-leakage in tests, or probe existence without reading (`CodeCliService.ts:98`, `security find-generic-password` without `-w`). Downgraded to not-present/info. |
| NET criticals x3 | SSRF test fixtures | critical | Metadata-URL strings inside adapter tests asserting rejection (`QqAdapter.test.ts:79`). Not egress. Downgraded to not-present. |
| HOOK-001 | root `package.json:84-85` | medium | `prepare` installs a git-hook manager on dev machines only (skipped when `CI` set); `postinstall` builds a local workspace package. Neither ships to end users. Kept low. |
| NET bulk (~4,800) | provider catalogs, i18n, docs URLs | high/low | Provider endpoint registries and documentation links; each maps to a declared product feature. No covert destination found in sampled review. |
| EXEC/HOOK remainder | build scripts, vitest timers | high | Packaging automation and test timeouts. Not shipped behavior. |

Credential+egress compounding: not demonstrated. The strongest near-miss is the obfuscated SSO bundle touching OAuth tokens, but no exfil destination beyond Nutstore's own service was identified.

## Strengths

- The DSH bridge security design is exemplary for this ecosystem: per-session sockets, 0600 permissions, 256-bit tokens compared in constant time, token scrubbed from the environment after handshake, fail-closed transports (`DshBridgeServer.ts:49-58,87-88,230`; `link.ts:32-37`).
- Tool policy is a pure, dependency-free decision function with plan-mode containment and explicit bypass rules, ported from and tested against the app's own approval engine (`policy.ts:24-60`).
- Every pinned `@deepseek-ai/*` dependency uses exact rc versions, so the composed runtime is reproducible.
- PRIVACY.md is specific and current, naming both collection classes, their opt-outs, and hard commitments about keys and conversations.
- Defensive coding shows up where scanners look: sensitive-file guards in MCP servers and trash protection rather than credential access.

## Residual risks

1. The obfuscated Nutstore SSO bundle is unauditable from source. If its upstream ever turns hostile or is swapped, nothing in this review would catch it. Users who do not use Nutstore sync never need it, but it ships regardless.
2. Opt-out analytics: default-on until toggled, per the privacy policy.
3. First-party relay endpoints (`open.cherryin.net`, `open.cherryin.ai`, built-in model services) mean some deployments route inference traffic through Cherry's infrastructure; the privacy policy discloses the transient-relay carve-out but users should understand it.
4. The bridge grants the embedded DSH runtime broad local power (shell tools via sandboxed entries, filesystem within workspace roots); safety depends on Cherry's policy engine staying correct, and bypassPermissions mode lifts ordinary approval gates by design.
5. Electron auto-update (`electron-updater` 6.7.0 in dependencies) was not signature-audited in this pass.
6. No public npm artifact for the DSH integration exists to hash-check; verification requires building from source at the pinned commit.
7. Static + manual methodology only; probe (S4) and dual adversarial review (S5) pending. A full pipeline run could lower, not raise, this grade.

## Verify this yourself

```bash
# Pin and inspect the same artifacts
git clone --depth 1 https://github.com/CherryHQ/cherry-studio && cd cherry-studio
git rev-parse HEAD   # expect 491a9fb1e180409d9bdb21c4b6be66fc28f31a27

# The obfuscated SSO bundle (first bytes show hex-mangled identifiers)
head -c 400 src/main/services/nutstore/sso/lib/index.mjs
grep -rn "sso/lib/index.mjs" src/main --include="*.ts"   # sole importer: NutstoreService.ts:10

# Bridge socket hardening
sed -n '49,58p'  src/main/ai/runtime/dsh/DshBridgeServer.ts    # tmpdir socket path, randomBytes(32)
sed -n '85,90p'  src/main/ai/runtime/dsh/DshBridgeServer.ts    # chmod 0o600
sed -n '228,232p' src/main/ai/runtime/dsh/DshBridgeServer.ts   # timingSafeEqual + length check

# Policy engine: plan mode containment and ask-by-default tail
sed -n '24,60p' packages/dsh-bridge/src/policy.ts

# Credential guards, not reads
sed -n '26,34p' src/main/ai/mcp/servers/assistant.ts
sed -n '85,99p' src/main/services/codeCli/CodeCliService.ts

# Re-run the static scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js <path-to-cherry-studio> --json /tmp/cherry-scan.json
```

## Methodology and pinned inputs

- Charter: `CHARTER.md`; pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge tools/scan 0.1.0, digest `9cc04224...baaee999`, run once over the shallow clone at `reference/audits/cherry-studio`.
- Manual review covered: the entire `packages/dsh-bridge/src` (all 7 modules), `src/main/ai/runtime/dsh/**` (bridge server, driver, composition builder), the nutstore SSO caller and bundle header analysis, every production critical finding, hotspot diagnosis of the OBFU/NET/CRED bulk, root lifecycle scripts, PRIVACY.md, and release-channel checks (GitHub releases API, npm registry 404s for public-package confusion).
- Cross-model adversarial review: NOT performed (single reviewer). Card revision 1 capped accordingly.
- Raw scan JSON retained next to the clone under `reference/audits/`.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `491a9fb` (v2.0.9 line) | C | Initial card. Static + manual methodology; probe/review/signing pending pipeline availability. |
