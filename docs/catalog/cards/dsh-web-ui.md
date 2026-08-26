# Trust Report Card: dsh-web-ui (zhu1090093659/dsh-web)

## Header

| Field | Value |
|---|---|
| Plugin family | dsh-web-ui (`@linxin666/*` scope, aggregate `@linxin666/dsh-web-all` 0.3.4) |
| Pinned subject | github:zhu1090093659/dsh-web-ui @ commit `8d723be978967d975d1fb16ee25689b4849657f5` |
| Upstream HEAD at audit | 2026-08-26 07:44:20 +0800 ("docs(process): record deepsea review decision") |
| License | Apache-2.0 |
| Repo age / activity | created 2026-08-12, last push 2026-08-26, ~6k stars (GitHub API, audit time) |
| Audit method | dsh-bridge static scanner v0.1.0 (rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`) + manual adversarial review of all findings. No behavioral probe (S4), no dual-model pass (S5). |
| Verified at | 2026-08-26T00:20Z |
| Revision | 1 |

## Verdict in one sentence

Use with awareness: no malicious behavior found on any audited surface, and every critical scanner finding resolved as a false positive or out-of-scope artifact, but the grade is capped at C because the behavioral probe and cross-model review did not run, telemetry is not opt-in, SSH secrets are stored in plaintext, and two third-party runtime dependencies were not audited.

## Grades

### Overall: C

Two ceilings apply and are stated plainly:

1. Full-pipeline ceiling C (docs/trust/pipeline-architecture.md, S6): the sandboxed behavioral probe and the dual LLM adversarial passes did not run for this card. Anything the pipeline could not fully examine is capped at C.
2. The mechanical scanner grade is F (70 critical / 2330 high / 88 medium / 1093 low across 1988 files, 3581 findings). Section Evidence adjudicates these counts; the F is dominated by three systematic false-positive classes and one vendored website bundle, not by confirmed hostile code. The mechanical grade stands until the heuristics corpus gains negative fixtures for these classes.

### Per-package grades (scope note: the task described 7 packages; the monorepo actually contains 19 packages plus `shared`, `market` (site + worker + vendored shell), `gallery`, and `scripts`. All were audited.)

| Package | Grade | Basis |
|---|---|---|
| shared (dsh-web-shared) | A | Build-config env reads only; no runtime egress. See FP class 1 below. |
| dsh-session-id | B | Browser-only panel; carries the family daily heartbeat (src/client/index.ts:43). |
| dsh-chat-recovery | B | Browser-only fork/retry; heartbeat (src/client/index.ts:48). |
| dsh-aionui-panel | A | Pure UI panel; no heartbeat, no host routes, no exec found. |
| dsh-liangshen | B | Syncs preset dirs into harness home `.agent-presets`; schema-validated, idempotent, no network, no exec (src/sync.ts header, 17-40). |
| dsh-skill-explorer | B | Skill browse/enable UI; heartbeat (src/client/index.ts:49). |
| dsh-community-plugins | A | Inert host entry, empty apply() (src/index.ts:24-26). |
| dsh-web-settings | B | Settings scope shim; heartbeat (src/client/index.ts:57). |
| dsh-git-graph | B | Real git ops via argv arrays through ctx.subprocess seam; workspace-membership gate is the security boundary (src/host/git-service.ts:44-56); branch-name validation before mutation; win32 git.exe routing avoids cmd.exe expansion (git-service.ts:26-39). |
| dsh-task-board | B | Fixed-argv probes `ps` (src/host-ledger.ts:111,183,188); caffeinate/systemd-inhibit/powershell helpers with fixed executables (src/power-inhibitor.ts:278-309); route fence requires loopback + browser same-origin marker + proxy token (src/host-routes.ts:99-108). Note: powershell start-time probe interpolates a numeric pid into a command string (host-ledger.ts:170-174); pid originates from internal records and processIsAlive validates safe integers (host-ledger:120-123). |
| dsh-pet | B | Large asset pack, UI only; `$schema` URL strings drove the NET count (FP class 2). |
| dsh-market | B | Client fetches only `https://dsh-market.com` (src/client/MarketCard.tsx:28,208-211,432); host installer is loopback-fenced (src/routes.ts:43-46), manifest pinned to MARKET_ORIGIN, traversal guard `isSafeRel` rejects `..`, `//`, leading `/` (src/core/installer.ts:85-89), asset id regex, per-file sha256 provenance written on install (installer.ts:285-293). Remote-driven plugin installs accept only npm-name-shaped specs or https:// git URLs (src/client/install-source.ts:33-40). |
| dsh-plugin-manager | B | Executes the official `dsh plugin add/remove` CLI; spec rejected on shell metacharacters incl. `%` for the Windows cmd.exe re-parse layer (src/host/gateway.ts:34-47); spawn is shell-free (gateway.ts:173-187); routes loopback-fenced (src/host/routes.ts:198-199). Install-arbitrary-plugins is its documented purpose. |
| dsh-tool-describe-image | B | Model-supplied image URLs pass an SSRF fence: blocked CIDRs cover loopback, RFC1918, link-local/cloud-metadata 169.254.169.254 (src/url-guard.ts:18-40), DNS resolves before fetch and fails closed, `redirect: 'error'` (src/vision-client.ts:119); API key defaults to env ref `VISION_API_KEY`, schema role 'secret' (src/config-resolve.ts:70-73,105-106). Sends image bytes to the user-configured vision endpoint, by design. |
| dsh-doctor | B | Supervisor listens on a filesystem unix socket, not TCP (src/agent/supervisor.ts:50,74); bearer token stored 0600, `wx` flag (src/agent/ipc.ts:20-24), envelope token-checked (supervisor.ts:89). Rescue capsule mirrors only DSH-home credential basenames (settings.yaml, .credentials.yaml, credentials.yaml/yml, .env) into an isolated home at 0600, local disk only (src/agent/capsule.ts:44-69), and sets DSH_TELEMETRY_DISABLED=1 for child gates (src/core/recover.ts:731). npm reachability probe to registry.npmjs.org (src/agent/migrate.ts:93). The `{...process.env}` spread passed to spawned children (recover.ts:736-737) is standard subprocess env inheritance, not harvesting. |
| dsh-desktop-launcher | B | Writes launcher files to the user Desktop and spawns fixed binaries (`where`, `sh -lc 'command -v -- "$1"'`) (src/routes.ts:119-130); loopback fence on every route (routes.ts:200-201); header documents that LAN-exposed deployments must not serve it (routes.ts:6). |
| dsh-remote-web-ui | B | Widest exposure surface in the family, carefully gated: pairing tokens are 32 hex chars from node crypto, single-use, expiring, revocable (src/pairing.ts:8-14,165-168); every non-loopback request needs a live device cookie (src/gate.ts:8-12); privileged config methods incl. credentials.set/unset stay loopback-only (src/remote-methods.ts:46-61); optional Cloudflare quick tunnel spawns the cloudflared npm binary with --no-autoupdate (src/tunnel.ts:59-64). Residuals drive the family-level risks below. |
| dsh-ssh | C | Reads `~/.ssh/config` for one-shot import and stores SSH passwords/passphrases in PLAINTEXT at `$DSH_HOME/dsh-ssh.json`, documented as deliberate (src/store.ts:3-6); reads private key files from disk (src/engine/connection-pool.ts:84-88); opens persistent ssh2 sessions, PTYs, tunnels. Every route is loopback-fenced incl. websocket upgrade (src/routes.ts:75-76,95-96,451). Powerful by design; the secret-at-rest posture is the reason for the C. |
| skins/skin-center | C | Browser runtime dynamically imports active-skin hooks.mjs (src/client/runtime/skin-controller.ts:283-285) giving the module full page-context DOM access; gate: builtin skins only, or market-installed skins whose skin.json + hooks bytes hash-match the recorded install provenance (src/routes-v2.ts:186-191, src/provenance.ts:45-71), otherwise 403 hooks-require-review. Host side executes only fixed binaries (/usr/bin/sips darwin, reg.exe query on Windows) (src/we-library.ts:145-151, lib/index.js:8182). The bundled trading skin loads third-party quote feeds (qt.gtimg.cn via script tag, api.binance.com, api.frankfurter.dev) (skins/trading/hooks.mjs:156,163-164,215-216) - disclosed in code, but not behind a configurable allowlist. |
| dsh-web-all (aggregate) | C | Pins exactly two third-party packages that this audit did not analyze: `dsh-better-sidebar@0.15.2`, `@mlgbnb/dsh-archive-manager@1.0.7` (package.json:61-62). Everything else is workspace-internal. |
| market/shell + market/dist/tryon | C | Vendored browser-native DSH ("webdsh") served at dsh-market.com for try-on; sources are in-repo (market/shell/src) but the committed artifact is a minified bundle containing new Function, eval, child_process shims and Object.entries(process.env) (market/dist/tryon/assets/index-Cp438i9e.js:135,172,178,257,292; source equivalent market/shell/src/shell/container-cli.ts:115-122) - inherent to Node-in-browser. Mitigation measured: all 756 committed files match `.tryon-hashes.json` sha256 (verified during this audit: 756 checked, 0 mismatch, 0 missing). Not installed into DSH profiles; website content only. |
| market/worker + telemetry-view | B | Server-side edge API; visitor ids salted-SHA256-hashed before storage (src/telemetry.js:32,45), heartbeat payloads strictly validated (telemetry.js parseHeartbeat), Turnstile secret only via env (src/index.js:114-168). Not shipped to users. |
| gallery | B | Static preview manifests; NET hits are `$schema` identifier strings (FP class 2). |
| scripts | B | Repo maintenance only, never shipped. scripts/pr-review.mjs:100-135 is a DEFENSIVE secret scanner (forbidden-path regexes and key-pattern list) - the scanner misread it as credential access. Test helper spawns a real sshd bound to 127.0.0.1 on a random high port with generated keys (tests/helpers/sshd.ts) - test-only. |

## What this plugin family can do (capability summary)

- Network egress, browser side: `https://dsh-market.com` (manifests, stats, likes, telemetry, Turnstile relay); user-configured vision endpoint (describe-image); optional public quote feeds when the trading skin is active; optional Cloudflare quick tunnel exposing the local web GUI at a random `*.trycloudflare.com` URL (opt-in setting).
- Network egress, host side: registry.npmjs.org version probes (doctor migrate, remote-web-ui update); GitHub API in CI-only scripts.
- Credential access: reads `~/.ssh/config` (one-shot import, dsh-ssh); reads SSH private key files when connecting (dsh-ssh); copies DSH-home credential basenames into a local 0600 rescue capsule (dsh-doctor); sends NO credential material anywhere off-machine in any path examined.
- Process execution: official `dsh` CLI (plugin-manager, doctor), fixed system helpers (ps/caffeinate/systemd-inhibit/powershell/sips/reg.exe/where), pnpm update within the owning profile (remote-web-ui updater), ssh2 remote sessions (dsh-ssh, by design), Node-in-browser interpreter (vendored website bundle only).
- Writes: DSH home tree (skins, pets, dsh-ssh.json, rescue capsule, ledger), preset dir in `.agent-presets`, user Desktop launcher files. No writes outside these documented roots found.
- Browser code execution of third-party content: skin hooks.mjs only after builtin status or sha256 provenance match (skin-center); Workshop-listed plugins install only via validated npm/https-git specs through the official CLI channels.

## Evidence

Mechanical scan (verbatim): target `dsh-web-ui`, scanner 0.1.0, schema `dsh-bridge.scan/v1`, 1988 files scanned / 1213 skipped, 32.8 MB, families present CRED EXEC HOOK NET OBFU, gates fired `cred-plus-net` and `dynamic-exec-present`, score 0, grade F. Raw JSON retained at `reference/audits/dsh-web-ui-scan.json` alongside the clone.

False-positive classes that account for the bulk of critical/high volume:

1. Build-time `process.env` defines: `JSON.stringify(process.env.NODE_ENV ?? 'production')` in bundler configs is inlined define replacement at build time, not runtime env harvesting. Sites: shared/tsdown.client.ts:156-157,254-255; packages/dsh-pet/tsdown.live2d-vendor.ts:30-31. Classed CRED-006 critical, confidence 0.9 - the rule needs a negative fixture for `process.env.<NAME>` member reads; it already distinguishes them in prose ("Reading one named env var is normal").
2. `$schema` / `$id` identifier strings: JSON-schema headers like `https://schemas.linxin666.org/dsh-pet/pet-manifest-v2.schema.json` counted as network-egress high (e.g. packages/dsh-pet/contracts/*.schema.json:2-3, gallery/manifest.js). These are document type identifiers; no fetch occurs.
3. Defensive security tooling: scripts/pr-review.mjs:119 lists SSH key filename regexes inside a secret-scanning denylist. Reading the file settles intent; the scanner cannot.
4. Regex `.exec()` calls counted as EXEC "process-spawning": e.g. shared/tsdown.client.ts:166, packages/dsh-task-board/src/host-routes.ts:30-31, packages/dsh-git-graph/src/core/git-command.ts:120. RegExp.exec, not process execution.

Confirmed-real findings (kept, graded into package scores):

- Dynamic code execution exists ONLY in the vendored tryon website bundle and upstream-copied plugin clients inside it (new Function/eval sites listed above; also schemastery-style callback compilation in market/dist/tryon/plugins/@deepseek-ai/*/client.js). Zero new Function/eval in any first-party shipped `packages/*/lib` bundle (grepped; no hits).
- Plaintext SSH secret storage: packages/dsh-ssh/src/store.ts:3-6.
- Daily telemetry without opt-in switch: sender shared/client/telemetry.ts (ENDPOINT line 27, POST line 94), wired in 15 client packages' index.ts (representative: packages/dsh-market/src/client/index.ts:41-42); mechanism documented in docs/telemetry.md (random localStorage UUID, daily dedup, webdriver skip, server-side salted hash in market/worker/src/telemetry.js:45, IP not persisted). Documented, minimal, but there is no off switch short of uninstalling - against the dsh-bridge charter PRIV bar ("no telemetry without opt-in").
- Obfuscation signals (98) concentrate in minified vendored assets, incl. zero-width characters in tokenizer assets (market/dist/tryon/assets/html-CfGypltJ.js) and base64 PNG data URIs; compounding with opacity, hence the C for that subtree despite the verified hash manifest.

Positive verification performed during this audit: tryon integrity 756/756 sha256 matches against the committed manifest; loopback fences located and read for dsh-market, plugin-manager, task-board, desktop-launcher, ssh, remote-web-ui gate; SSRF fence logic read end-to-end; doctor capsule mirror scope read; CI workflows checked (pull_request_target jobs use github-script without untrusted checkout; release publishes on tag push with NPM_TOKEN secret).

## What we could not check

- Runtime behavior: no sandboxed probe ran (load-only / activate / invoke / idle-soak / teardown scenarios). Delayed timers, config-triggered branches, and teardown-time behavior are unverified.
- The two pinned third-party deps of dsh-web-all (`dsh-better-sidebar@0.15.2`, `@mlgbnb/dsh-archive-manager@1.0.7`): not audited; they ship as separate npm packages and load into the same GUI.
- Transitive peers (react, react-dom ranges) resolve on the user machine; not evaluated.
- The deployed dsh-market.com site and worker: audited from source in-repo, not from the live deployment; what actually serves at that origin can differ.
- Minified tryon internals: covered by hash equality to the committed manifest, not by line-level review of every minified region.
- Whether any code path exfiltrates data when specific settings combinations are used together (cross-plugin interactions beyond the documented bridge contracts).

## Reviewer disagreement

None. Single-model manual adjudication; per the pipeline this card would require a second, independent model pass before exceeding grade C.

## Verify this yourself

```bash
# Pin the subject
git clone --depth 1 https://github.com/zhu1090093659/dsh-web-ui reference/audits/dsh-web-ui
git -C reference/audits/dsh-web-ui rev-parse HEAD   # expect 8d723be978967d975d1fb16ee25689b4849657f5

# Re-run the mechanical scan (expect grade F; see Evidence for why)
node dsh-bridge/tools/scan/dist/index.js reference/audits/dsh-web-ui

# Reproduce the tryon integrity check
cd reference/audits/dsh-web-ui
node -e "
const fs=require('fs'),crypto=require('crypto');
const m=JSON.parse(fs.readFileSync('market/dist/tryon/.tryon-hashes.json','utf8')).files;
let bad=0,miss=0,n=0;
for(const [rel,h] of Object.entries(m)){n++;
  try{if(crypto.createHash('sha256').update(fs.readFileSync('market/dist/tryon/'+rel)).digest('hex')!==h)bad++}
  catch{miss++}}
console.log(n,bad,miss)"   # expect: 756 0 0

# Spot-check the headline claims
sed -n '27p;94p' packages/*/src/client/../../../../shared/client/telemetry.ts 2>/dev/null || \
  sed -n '27p;94p' shared/client/telemetry.ts                          # telemetry endpoint + POST
sed -n '3,6p' packages/dsh-ssh/src/store.ts                            # plaintext secret disclosure
sed -n '85,89p' packages/dsh-market/src/core/installer.ts              # traversal guard
sed -n '186,191p' packages/skins/skin-center/src/routes-v2.ts          # hooks provenance gate
grep -rn "new Function\|eval(" packages/*/lib | wc -l                  # expect 0
```

## Residual risks (accepted by this grade)

1. Telemetry fires daily without an opt-in control (privacy-policy gap, not exfiltration; payload is package name/version/channel + random UUID).
2. dsh-ssh keeps SSH passwords/passphrases plaintext on disk; anyone reading `$DSH_HOME/dsh-ssh.json` gets every stored secret.
3. The tryon website bundle is opaque minified code with eval-class primitives; users of dsh-market.com trust the operator's deploy pipeline (hash manifest pins repo-to-artifact, not intent).
4. Skin hooks grant full page-context JavaScript to whatever passes the provenance gate; compromise of the market origin or the review process becomes browser code execution.
5. The remote pairing channel plus auto-tunnel exposes the GUI beyond localhost; the gate design is sound, but blast radius grows with any future fence regression.
6. Two third-party GUI dependencies ride in with the aggregate unaudited.
7. Fast-moving young upstream (created 2026-08-12): findings go stale quickly.

## Methodology and pinned inputs

Scanner: dsh-bridge tools/scan dist build, version 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`. Subject pinned by git commit SHA (shallow clone). Manual review by one auditor, cross-checking every critical finding and sampled high findings per family and per package; all claims carry file:line anchors resolvable at the pinned commit. Grade semantics follow docs/trust/pipeline-architecture.md S6; caps applied: incomplete-pipeline ceiling C. Disclaimer: a grade is evidence-backed opinion over a pinned artifact, not a safety guarantee, and says nothing about versions other than the pinned commit.

## Revision history

| Rev | Verdict digest basis | Change |
|---|---|---|
| 1 | commit `8d723be9`, scanned 2026-08-26T00:05Z, card issued 2026-08-26T00:20Z | Initial card. Overall C; per-package grades as tabulated; mechanical F reported and adjudicated. |

Re-vetting triggers: any new upstream release of the aggregate or the ssh / remote-web-ui / skin-center packages, any change to the vendored tryon tree, corpus bump adding FP negative fixtures for classes 1-3 above, or 90 days elapsed.
