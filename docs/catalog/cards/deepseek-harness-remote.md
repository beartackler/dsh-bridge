# Trust Report Card: deepseek-harness-remote

## 1. Header

| Field | Value |
|---|---|
| Plugin | `ds-harness-remote` 0.3.33 - remote-control plugin for DSH: phone/desktop/browser clients connect over a hosted relay to continue sessions, prompt, answer permission requests, and browse/open workspaces; monorepo also ships browser-extension, VS Code, and Android clients |
| Pinned subject | github:liguobao/deepseek-harness-remote @ commit `2e81e6fe5e12c840ac8f35d1d0bdc3f92188d2e5` (default branch head, cloned 2026-08-26) |
| npm integrity | npm `ds-harness-remote@0.3.33` is the documented install target (README); registry tarball not downloaded and compared in this pass. Bundled dist (packages/plugin/dist/index.js) ships in-repo and was spot-read against src claims |
| Provenance | No attestation metadata checked; server side of the protocol is a separate closed project (docs/protocol.md section 0) |
| License | MIT (root package.json; packages/plugin/LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual review), with remote-channel auth/LAN/relay as the priority lens per tasking |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The most security-serious plugin family audited so far - Noise IK end-to-end encryption with pinned peer identities, 0600 credential stores, loopback-only control plane, and an allowlisted host-API bridge - but by design it hands your harness's session, workspace, and settings surface to any device on your account through a hosted relay you do not control, and account compromise equals full harness compromise.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Remote channel auth | Account-scoped device model: devices register against the server with bearer token or one-time 10-minute host matching code (docs/protocol.md sections 8.1-8.1.1); incoming client connections are re-checked against the server's device record including identity key match (packages/plugin/src/server-connection.ts:315-323) and against locally pinned keys (:325-334). The secure channel refuses to start without authenticated Noise + membership context (connection-controller.ts:44-53). | file:line above |
| End-to-end encryption | Noise_IK_25519_ChaChaPoly_SHA256 via the maintained clatterjs framework, initiator=client/responder=host, prologue binds protocol version + connectionId + both deviceIds (docs/protocol.md section 12; packages/crypto/src/noise.ts:11, 24-56 verifies the transcript's remote static key before transport use). Server relays opaque ciphertext only and is forbidden from decrypting/persisting it (protocol.md section 13). | file:line above |
| Trust pinning | Peer identity keys are pinned in a local trust store; `isTrusted(deviceId, publicKey)` requires exact match (identity-store.ts:132-133), and a server-presented changed key for a known device is rejected at connect time (server-connection.ts:325-330). Caveat: first contact auto-pins whatever key the account's server presents (:335-347) - there is no out-of-band fingerprint confirmation step found in the Host flow. | file:line above |
| LAN exposure | None by design. The plugin opens no listening socket: no createServer/listen anywhere in plugin sources; all transport is outbound WebSocket to the configured server plus WebRTC (werift/native helper). Config rejects non-HTTPS server URLs except literal localhost (config.ts:99-101). Control-plane RPC registers with `authority: 'loopback'` only (control-runtime.ts:41-43). A LAN/P2P transport tier exists in the spec but WebRTC datachannels still carry only Noise ciphertext (protocol.md section 14:570). | grep of packages/plugin/src, file:line above |
| Command relay (ApiProxy tunnel) | Remote RPC bridges into the harness ApiProxy behind an explicit allowlist of ~46 methods (harness-api-bridge.ts:181-230): full session lifecycle (create/history/prompt/cancel), subagent control, workspace create/rename/delete, goal CRUD, commands.execute, settings writes scoped to registered namespaces (:712-731), and credentials.set/unset - write-only, size-bounded (schema :148-151) - meaning an authorized remote device can plant provider credentials on your harness. Model discovery probes only HTTPS/localhost URLs per its doc comment (:682-689). | file:line above |
| Credential handling | Local storage is careful: identity directory created 0700 (identity-store.ts:74), private keys and peer/trust files written 0600 atomically (:86-87, 157, 175), server tokens stored 0600 via tmp-then-rename (server-credentials.ts:52-62), load enforces private mode (:21-22 area). Tokens go only to the configured server origin over HTTPS/WSS. | file:line above |
| Child processes | One deliberate spawn: the Electron native-RTC helper launches a resolved system node binary with an embedded helper script (native-rtc-helper.ts:188); candidates include env vars DSH_REMOTE_NODE/NODE then PATH/homebrew/nvm locations (:96-124), probed with a fixed argv test that rejects Electron nodes (:131+). This executes whatever `node` resolves to on PATH - normal for Node tooling but worth knowing. Scanner EXEC hits trace here and to the bundled dist copy. | native-rtc-helper.ts |
| Network egress | Default server `https://dsh.r2049.cn`, user-overridable (config.ts:74-75, protocol.md:183, android setup-screens.tsx:16, vscode default, browser manifest host_permissions). That is the only first-party endpoint family found; no telemetry/analytics endpoints exist in audited sources. Self-hosted relay is documented as not yet available (README Quick start note). | file:line above |
| Dynamic code execution | None in first-party sources. Dist-bundle dynamic-eval hits resolve to the RTC helper's `spawn(node, ['--eval', HELPER_SOURCE])` string constant (dist/index.js:13980 region = bundled native-rtc-helper). | dist/src cross-read |
| Enablement default | `enabled` defaults to true and role to 'host' (config.ts:81-82), but activation exits early without a configured serverUrl-dependent runtime only when explicitly disabled (index.ts:39); installing DSH Desktop (which bundles this plugin enabled by default) starts advertising the machine to your account immediately after account authorization. | config.ts, index.ts |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 201 findings (6 critical, 156 high, 27 medium, 12 low), machine grade F, gates
`cred-plus-net`, `dynamic-exec-present`, `finding-density`. Full output preserved at
/Users/timurmonasypov/.jcode/scratch/deepseek-harness-remote.scan.json.

### Family adjudication

| Family | Adjudication |
|---|---|
| CRED criticals (pnpm-lock.yaml:3746/7570/8798 x3) | Lockfile integrity-hash lines whose package names contain auth vocabulary. Pure false positives; actual token stores are the 0600 files above. |
| NET criticals (apps/android/tests/server-url.test.ts:21 x2) | Test asserting URL handling against example hosts. Dev-only. |
| EXEC critical (packages/plugin/dist/index.js:13980) | Bundled RTC-helper spawn described in section 3; matches src/native-rtc-helper.ts exactly. |
| NET highs (169) | Lockfiles, docs links, test fixtures, and the dsh.r2049.cn service endpoints across four clients - all consistent with the product's declared function. |
| OBFU mediums/highs | Bundled dist + sourcemaps present in-repo (not concealment); base64url codec constants in protocol/crypto code are the wire format itself. |
| HOOK/SUPPLY | Standard build scripts; GitHub/npm bundle entries documented; no postinstall network fetches found. |

### Negative claims

No listening sockets opened on the host; no conversation or credential content sent anywhere
except the E2E channel to your own paired devices and HTTPS to the configured server origin;
no telemetry; no eval/new Function compilation in first-party code; no reads of unrelated
credential stores (~/.ssh etc.) beyond the scanner-lockfile noise.

## 5. What we could not check

- **The server.** dsh.r2049.cn is closed-source and separate (protocol.md section 0). Membership decisions, token issuance, and relay honesty are trusted, unverifiable claims. This is the largest single trust anchor.
- **Behavioral probe.** No live pairing was performed; Noise handshake, replay rejection, and reconnect paths were verified by reading source and tests (crypto/tests/noise.test.ts covers IK handshake, peer mismatch, tamper, replay, rekey).
- **All four clients.** Android (Expo), VS Code, and browser extension were surveyed for endpoints and auth flow only; their full attack surface (e.g. extension token handoff) was not line-audited.
- **Published parity** between npm tarball and this commit.
- **The dsh-file-viewer companion plugin** assumed by the file preview bridge.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Per pipeline rules this caps
the grade at C regardless of findings. Substantively, C fits independently of the ceiling:
this plugin's entire purpose is to expose your harness across the internet, gated by an
account on someone else's server, with auto-pinned first-contact keys and
credentials.set inside the allowlist - each defensible design tradeoff, none of which
belongs in B territory ("safe by default") under this charter. The scanner's F overstates
via lockfile/test false positives; nothing found supports D or F.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/liguobao/deepseek-harness-remote /tmp/dhr-audit
cd /tmp/dhr-audit && git rev-parse HEAD   # expect 2e81e6fe5e12c840ac8f35d1d0bdc3f92188d2e5

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/dhr-audit

# 3. Spot-check the headline claims
sed -n '315,347p' packages/plugin/src/server-connection.ts   # incoming auth: server record + pinned-key checks
sed -n '132,133p' packages/plugin/src/identity-store.ts      # exact-match trust check
sed -n '86,87p'  packages/plugin/src/identity-store.ts       # 0600 atomic key writes
grep -rn "createServer\|\.listen(" packages/plugin/src --include=*.ts   # expect: none
grep -n "authority" packages/plugin/src/control-runtime.ts    # expect: 'loopback'
sed -n '181,230p' packages/plugin/src/harness-api-bridge.ts   # the remote command allowlist incl credentials.set
sed -n '11p' packages/crypto/src/noise.ts                     # fixed Noise suite
```

## 8. Methodology and pinned inputs

- Subject: git commit `2e81e6fe5e12c840ac8f35d1d0bdc3f92188d2e5` (shallow clone at reference/audits/deepseek-harness-remote, upstream HEAD 2026-08-26)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...1041f3`
- Review: docs/protocol.md (sections 7-14), packages/plugin/src/{server-connection,identity-store,server-credentials,connection-controller,harness-api-bridge,native-rtc-helper,control-runtime,control-route,config,index}.ts, packages/crypto/src/noise.ts + tests, rpc-router tests, apps/* endpoint survey, PRIVACY.md, README, TODO, CHANGELOG
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: pipeline ceiling C applies; substantively held at C for hosted-server dependency, first-contact auto-pinning, and the breadth of the allowlisted remote surface. Nothing found supports D or F.

## 9. Strengths

1. Real cryptography done conservatively: a maintained Noise implementation with the suite name asserted at construction (noise.ts:39-42), transcript-bound prologues, and explicit refusal to accept transport messages before remote static verification.
2. Defense in depth on connection admission: three independent gates (authenticated channel metadata, server-side descriptor cross-check, local pinned-key equality) before any RPC flows (server-connection.ts:315-334, connection-controller.ts:44-53).
3. File-permission hygiene matches the best-in-family bar: 0700 directories, 0600 atomic writes, mode re-validation on load (identity-store.ts:74-87, 192-208; server-credentials.ts:52-62).
4. Zero listening ports: exposure is outbound-only through an authenticated WSS plus WebRTC carrying ciphertext, so there is nothing for a LAN attacker to connect to.
5. Unusual documentation quality: a normative wire-protocol spec with security invariants (TLS does not substitute for E2EE, server-must-not-decrypt, fail-closed enum rules) that the code actually follows in the audited paths.

## 10. Residual risks

1. Single-account blast radius: any device registered to your account - phone, borrowed laptop, a compromised browser extension - can drive sessions, execute commands, edit workspaces, and write credentials on your host; device revocation hygiene is entirely yours.
2. The relay server is a trusted third party for authorization and presence even though it cannot read traffic; a malicious/compromised server can feed a new identityKey for a never-before-seen "device" and the Host will pair with it (first-contact auto-pin, section 3).
3. `commands.execute` and `session.prompt` in the allowlist mean remote control is arbitrary agent direction, not a sandboxed subset; treat every authorized client as full keyboard access to the harness.
4. The RTC helper executes whichever `node` binary resolves first from env/PATH (native-rtc-helper.ts:96-124); PATH poisoning on the host machine crosses into this plugin's child process.
5. Bundled dist ships in-repo alongside src; parity is maintained by CI convention, not verifiable from the repo alone.
6. Protocol draft status (v0.2, pre-release breakage expected per docs/protocol.md header) means security invariants may shift; re-audit on protocol version bumps.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD; any new absolute endpoint beyond the configured server origin must be re-adjudicated.
2. Diff packages/plugin/src/harness-api-bridge.ts allowlist first: added methods widen what remote devices can do; anything touching shell/workspace-delete scope deserves a fresh look.
3. Watch server-connection.ts handleConnectIncoming: if the pinned-key rejection or descriptor cross-check weakens, headline risk changes immediately.
4. Re-run when self-hosted relay support lands (README says unsupported today); the trust model materially improves once the server is auditable.
5. Re-run after any protocol version increment; docs/protocol.md is the contract this audit leaned on.
