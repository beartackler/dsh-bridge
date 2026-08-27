# Trust Report Card: dsh-web family

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-web` plugin aggregation ecosystem (aggregate `@linxin666/dsh-web-all` plus 20 packages: task-board, remote-web-ui, ssh, describe-image, market/workshop browser, perf, pet, skins, doctor, and more) |
| Pinned subject | github:zhu1090093659/dsh-web @ commit `8bb15504055043d5feab2868e8ee1faf57b88971` (default branch head, cloned 2026-08-26) |
| npm integrity | `@linxin666/dsh-web-all@0.3.4` = `sha512-hT3WQFV4OkvJBD25UL9Gv6PeMixX+mbKXMtAK0iTfyzSw2Dl5IexNxS/SPPrVHGv+6EYT3gvearyTerhMEZZ/Q==` (registry, fetched 2026-08-26); published aggregate tarball downloaded and read during this audit |
| Provenance | No attestation metadata on the registry package; published bundle content spot-checked against source claims (telemetry endpoint confirmed present in the shipped client bundle) |
| License | Apache-2.0 (root package.json; individual packages BSD-3-Clause where marked) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual review) |
| Revision | 1 |
| Grade | **C** |

Relationship to the dsh-web-ui card: this repository is `zhu1090093659/dsh-web-ui`, renamed to
`dsh-web` during the audit window (GitHub redirects; commit c4fa3b6 sweeps wording after the rename).
The separate dsh-web-ui card (by another reviewer) pins `8d723be978967d975d1fb16ee25689b4849657f5`;
this card pins `8bb15504055043d5feab2868e8ee1faf57b88971`, eighteen commits later
(275 files changed, +10962/-5062, including skin-center uninstall/integrity work at 996ac0f and
workshop install counts at e47c386). The two pins are therefore not interchangeable evidence, and the
default branch received a further force-push to `dc042f8` after both audits, so neither pin may
resolve upstream anymore. Treat each card as covering exactly its own pinned revision.

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile found in the audited surfaces - route families sit behind loopback fences, the SSH panel keeps secrets in 0600 local storage and never transmits them anywhere but your own servers - but this is a very large codebase shipping opt-out-less daily telemetry from fourteen plugins, an optional Cloudflare quick-tunnel that exposes your DSH web UI to the public internet, and a workshop/plugin-manager path whose install targets float to whatever is newest at click time.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Telemetry (default-on) | Fourteen client packages each send one daily heartbeat to `https://dsh-market.com/api/telemetry/event`: random localStorage UUID + package name + version + channel (packages/dsh-task-board/src/client/index.ts:80 wiring; shared sender at shared/client/telemetry.ts:74-104, endpoint at :27). Payload is documented as containing no conversation data. There is no opt-out switch anywhere: no setting, env var, or config key disables it (grep across shared/, docs/telemetry.md, all wired clients); the only silent paths are private browsing, `navigator.webdriver`, or blocking the domain. The system is thoroughly documented in docs/telemetry.md, but documentation is not consent. | file:line above |
| Network egress (host side) | Plugin host halves are loopback-only route handlers (`isLoopbackRequest` guard on every /api/dsh-ssh route, packages/dsh-ssh/src/routes.ts:20, 76, 96). The only non-loopback hosts referenced in package sources are the telemetry endpoint above and the user-configured vision provider in describe-image (packages/dsh-tool-describe-image/src/client/PluginSettingsCard.tsx:232 shows the placeholder pattern; url-guard.ts mediates fetches). | grep of all src trees |
| Network egress (skins) | Skin hook scripts can fetch third-party hosts: the bundled `trading` skin pulls live quotes from Tencent's qt.gtimg.cn script endpoint and Binance public ticker APIs (packages/skins/skin-center/skins/trading/hooks.mjs:156, 163-164). Skins are community-installable assets loaded by skin-center; installing a skin is trusting its hooks. | file:line above |
| Remote exposure | dsh-remote-web-ui can spawn a Cloudflare quick tunnel via the `cloudflared` npm package (whose postinstall downloads a binary) and publish your DSH web UI at a public trycloudflare.com URL (packages/dsh-remote-web-ui/src/tunnel.ts:1-16, import at :16). Pairing is token-gated per its design docs; this is opt-in functionality, but it is a real capability of the family. | file:line above |
| Child processes | The plugin-manager gateway shells out to the installed `dsh` CLI for installs/removals with bounded output capture (packages/dsh-plugin-manager/src/host/gateway.ts:288-300); task board runs cron jobs by creating real agent sessions; desktop-launcher spawns platform open commands. No unexpected spawn targets found in audited host code. | file:line above |
| Credential handling | SSH host credentials (passwords, keys) are stored locally with 0600 file modes via atomic write (packages/dsh-ssh/src/store.ts:373, transfer temp files routes.ts:331, 417); they authenticate only to the SSH servers you configure. Scanner CRED hits in dsh-ssh trace to these stores and tests. No transmission of any secret beyond its intended server was found. | store.ts, routes.ts reads |
| Dynamic code execution | The browser-side workshop shell contains an ESM loader that compiles fetched plugin sources into blob modules inside the web UI sandbox (market/shell/src/plugins/esm-loader.ts:1-30), and sources can be pulled from npm, GitHub trees/raw endpoints, or a CORS proxy (market/shell/src/plugins/sources.ts:5-13). This executes workshop-distributed code inside your browser session - by design, and confined to the web app's origin, but it is dynamic execution. | file:line above |
| Install-time hooks | Packages use `prepare: tsdown` build hooks (e.g. packages/dsh-web-all/package.json scripts) which compile locally without network fetches; no unpinned npx fallbacks found. | manifest reads |

Scope note: the repo also builds the dsh-market.com static site and its Cloudflare Worker backend (market/) - server-side code that never runs on an agent user's machine; scanner volume from market/dist and worker sources was adjudicated out of scope for the user-facing grade, though the telemetry endpoint it serves is graded above.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.
Raw output: 4075 findings (32 CRED critical, 90 EXEC critical, 1460 NET high among them), machine grade
F. This is dominated by vendored dist bundles (market/dist/tryon), pnpm lockfiles, i18n JSON prose,
tests, and the site/worker backend. Roughly 805 findings fall outside lockfile/dist/test paths; the
security-relevant subset was adjudicated by family below, with full raw output preserved at
reference/audits/dsh-web.scan.json.

### Family adjudication

| Family | Adjudication |
|---|---|
| CRED criticals/highs | Trace overwhelmingly to test files asserting .ssh/.aws rejection, i18n strings mentioning auth, vendor config dialogs reading codex/pi auth paths for display, and the SSH credential store above. Spot-read examples: pathValidation.test.ts:81-99 (tests), store.ts (0600 local store). No exfil path found. |
| EXEC criticals/highs | Concentrated in market shell loader (documented product), e2e/dev scripts, and child_process shims of the browser VFS. Kept where noted in section 3; rest dev-only. |
| NET highs | Lockfiles, doc links, example URLs (`example.com`, `evil.example` in SSRF-guard tests), and the two live hosts named in section 3. |
| OBFU medium/highs | Minified dist bundles and base64 asset literals; sourcemaps ship alongside (lib/*.map verified in the published tarball), so not concealment. |

### Published-artifact check

The npm tarball for `@linxin666/dsh-web-all@0.3.4` was downloaded and inspected: lib/index.js is a
trivial empty host stub, lib/client.js ships column shims, and the market package tarball
(`@linxin666/dsh-client-ui-market@0.3.4`) verifiably contains the heartbeat sender and the
dsh-market.com telemetry endpoint literal - confirming the published bundles match the source-tree
telemetry behavior described above.

### Negative claims

No conversation-content transmission found on any audited host-side surface; no credential-store
reads outside the vendors/SSH surfaces described; no obfuscation of executable paths in first-party
sources; no install-time network fetches in package lifecycle scripts; no auto-update mechanism in
the plugin family itself.

## 5. What we could not check

- **All twenty packages exhaustively.** Review prioritized ssh, remote-web-ui, market/plugin-manager, telemetry, skins loader, task board, describe-image; perf/pet/git-graph/session-id received scanner-plus-spot-check treatment only.
- **Behavioral probe.** Nothing was executed against a live DSH instance; loopback guards were verified by reading, not probing.
- **Workshop-distributed skins and pets.** Community assets are fetched at runtime; each one carries its own trust question and none were audited.
- **Published provenance end-to-end.** Registry packages lack attestations; equality of every published bundle to its source commit was not reproduced.
- **Cloudflare Worker backend** correctness beyond reading its role in telemetry.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Per pipeline rules this caps the grade
at C regardless of findings; the substantive C rests on the default-on unoptoutable telemetry, the
tunnel capability, and floating workshop installs rather than any hostility finding. The scanner's F
disagreed; the gap is explained by vendored dist volume and cross-module co-occurrence gates over a
monorepo whose parts never run in one process.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/zhu1090093659/dsh-web /tmp/dshweb-audit
cd /tmp/dshweb-audit && git rev-parse HEAD   # expect 8bb15504055043d5feab2868e8ee1faf57b88971

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/dshweb-audit

# 3. Spot-check the headline claims
sed -n '27p' shared/client/telemetry.ts            # telemetry endpoint constant
sed -n '74,104p' shared/client/telemetry.ts        # heartbeat sender; note absence of any opt-out check
grep -rn "opt.out\|disabled\|enabled" shared/client/telemetry.ts   # expect: no disable path
sed -n '156,164p' packages/skins/skin-center/skins/trading/hooks.mjs   # third-party quote fetches
sed -n '1,16p' packages/dsh-remote-web-ui/src/tunnel.ts          # cloudflared quick tunnel
sed -n '373p' packages/dsh-ssh/src/store.ts                      # 0600 atomic credential writes
```

## 8. Methodology and pinned inputs

- Subject: git commit `8bb15504055043d5feab2868e8ee1faf57b88971` (shallow clone at reference/audits/dsh-web)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...aee999`
- Review: shared/client/telemetry.ts, docs/telemetry.md, dsh-ssh (store/routes/client api/telemetry), dsh-remote-web-ui (tunnel/pairing/mobile-api), dsh-plugin-manager (gateway), dsh-market client, market/shell loaders and sources, skins center + trading/cyber-night hooks, task-board client, describe-image src, root/package manifests, published npm tarballs for dsh-web-all and dsh-client-ui-market
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: pipeline ceiling C applies (no behavioral probe, no cross-model review). Substantively held at C for default-on telemetry without opt-out and internet-exposure tooling; nothing found supports D or F.

## 9. Strengths

1. Loopback-only enforcement is systematic, not decorative: every audited route family re-checks `isLoopbackRequest` before touching data (packages/dsh-ssh/src/routes.ts:76, 96).
2. Secrets hygiene on the SSH panel is genuinely careful: 0600 modes, atomic tmp-then-rename writes, transfer temp files mode-restricted.
3. The telemetry system is radically transparent about what it collects - payload contents, retention (400 days), salted hashing, and a public summary API are all documented in docs/telemetry.md.
4. Skin v2 contract confines community skins to declarative assets plus a single reviewed `hooks.mjs` escape hatch with mandatory cleanup registration (packages/skins/skin-center/skins/cyber-night/hooks.mjs:1-15).
5. Browser plugin execution is contained to the web app's own module sandbox rather than the host process.

## 10. Residual risks

1. Daily telemetry fires by default with no opt-out short of network blocking or running fourteen plugins' worth of patches yourself; users who require zero unsolicited egress should not install this family as-is.
2. Enabling the mobile/remote feature with a quick tunnel places your entire DSH web UI behind a public URL guarded only by pairing tokens; token leakage equals full harness access from anywhere.
3. Workshop installs resolve to current-newest at click time, and skins execute hook code in your browser session; both channels inherit whatever their authors ship next.
4. The trading skin phones qt.gtimg.cn and Binance whenever displayed; a skin you installed for looks silently carries live third-party requests.
5. Monorepo size (3,300 tracked files, 341 MB checkout) means future revisions can hide meaningful changes in rarely-reviewed packages; treat this card as covering the audited subset plus family-wide patterns.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD; any new absolute endpoint outside {dsh-market.com/api/telemetry, user-configured providers, skin-declared quote hosts} must be re-adjudicated.
2. Diff shared/client/telemetry.ts; if an opt-out appears, the headline objection lapses and the card should be revised.
3. Watch packages/dsh-plugin-manager and market/shell/src/plugins/sources.ts for widened install sources or weakened guards.
4. Re-run the scanner after any rules-corpus bump; digest recorded in section 8.
