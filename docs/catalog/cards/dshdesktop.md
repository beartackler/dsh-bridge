# Trust Report Card: dshdesktop (dataelement/dsh-desktop)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-desktop` v0.1.1 - an Electron desktop shell that spawns and supervises the local DeepSeek Harness runtime (`@deepseek-ai/dsh` 0.1.1-rc.2), manages profiles and plugin installs, offers Safe Mode recovery, a phone-pairing mobile bridge, and a one-click installer for the `dshmarket` marketplace into the `web` profile. |
| Pinned subject | github:dataelement/dsh-desktop @ commit `e589bf688624871d953f8c58418f913c407dfc7e` (default branch head at audit time) |
| Stars | ~2,500 (discovery sweep 2026-08-26); listed in awesome-dsh-plugin |
| npm integrity | Not published as an installable npm package; distributed as signed desktop installers from the project website. Installer-to-commit comparison not attempted this pass. |
| License | MIT, LICENSE present at repo root (`LICENSE:1-3`, Copyright DataElement). |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of the main process, update manager, market installer, and mobile bridge) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A disciplined, telemetry-free Electron host whose own code checks out clean on every hostile
indicator the scanner raised, but adopting it means accepting an auto-polling updater pointed at
the vendor's web endpoint, a click-time floating install of `dshmarket@latest`, and an optional
quick tunnel that downloads and runs a Cloudflare binary whose pinned checksum is never verified.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Spawns the Harness | The app's core job: it locates or installs Node, resolves shell environment, and starts the DSH runtime as a child/utility process with full agent capabilities. This is the documented product. | src/main/runtime/harness-runtime.ts:1, 64, 100, 350; src/main/runtime/disclaimed-utility-process.ts:36-52 |
| Renderer sandboxing | Every window uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`; untrusted navigation is blocked; external links go to the system browser. | src/main/index.ts:248-252, 498-502, 1132-1133; README.md "Local data and security" |
| Update channel | Packaged builds poll `https://dshdesktop.com/updates/latest/` every 6 hours starting ~15s after launch (with jitter). Downloads are manual (`autoDownload = false`) and install-on-quit is disabled; the user must click through download and install. | package.json:151-155; src/main/update/update-policy.ts:1-4; src/main/update/update-manager.ts:97-124, 147, 164, 185-186 |
| Market install flow | A bundled Cordis plugin exposes install/uninstall routes that run `dsh plugin --profile web add dshmarket@latest` via packaged pnpm - resolving whatever `latest` is at click time, not any audited revision. | packages/dsh-desktop-market-installer/index.js:12, 23, 419-427, 575 |
| Phone bridge | LAN pairing server binds all interfaces with a short-lived random 32-byte pairing token, timing-safe token compare, and per-session tokens; optional Quick Tunnel publishes the bridge publicly via trycloudflare.com. | src/main/mobile/lan-mobile-bridge.ts:142, 239, 431, 457-463, 541; cloudflared-tunnel.ts:170-175 |
| Credential access | The only `.npmrc` reads/writes are pnpm store pins inside DSH profile directories (store path bookkeeping, no auth tokens read or transmitted); the release test asserting keychain absence is a negative assertion in CI. | src/main/state/profile-store.ts:81-113; test/release.test.ts:320 |
| Telemetry | None found. Grep over src/main and src/preload for telemetry/analytics/posthog/sentry returns zero hits; no beacon endpoints exist anywhere in shipped code. | grep negative across src/ |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**1442 findings** (1 critical, 793 high, 11 medium, 637 low) across 123 scanned files. Machine
verdict **F**, off three gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Where the volume is

Of the 793 highs, 637 are `package-lock.json` registry URLs (resolved against
registry.npmmirror.com) and roughly 70 sit in tests; only 36 highs are in `src/main`, and each
family there traces to the four capabilities above. Adjudication covers the critical and every
gate.

### Critical and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED critical, keychain touch in test/release.test.ts:320 | A negative assertion proving the release workflow does NOT use `security find-generic-password`. It is evidence of good hygiene, not credential access. | test/release.test.ts:320 (expect(workflow).not.toContain(...)) |
| `cred-plus-net` gate | Co-occurrence files are three tests plus the market installer. The installer's `.npmrc` hit writes pnpm store settings into the profile it manages; its network calls fetch the `dshmarket` package you asked it to install. No secret material is read and sent anywhere. | packages/dsh-desktop-market-installer/index.js:225-245, 419-427; scoping per capability table |
| `dynamic-exec-present` gate | Dynamic import in the main process loads first-party modules; utility-process forking launches the user's own Harness. No third-party code string is ever evaluated. | src/main/runtime/disclaimed-utility-process.ts:16-30; grep negative for eval/new Function in src/ |
| `finding-density` gate | Volume dominated by lockfile mirrors and LAN/tunnel test suites exercising the pairing protocol. Real surface is small and readable. | counts above; section 3 table |

### Named residual behaviors

1. **Unverified checksum on a downloaded binary.** `CLOUDFLARED_ASSETS` declares sha256 values
   for each platform, but `ensureCloudflaredBinary` never compares them - the downloaded
   archive is extracted and executed directly. The constant `createHash` import exists but no
   digest call follows.
   cloudflared-tunnel.ts:26-46 (pins), :101-121 (download/extract/chmod, no verification).
2. **Update feed trust.** All update traffic trusts `dshdesktop.com` (an HTTPS generic feed);
   electron-updater signature checking applies to macOS/Windows builds, but the endpoint itself
   is outside this audit's reach. package.json:151-155; update-manager.ts:124-164.
3. **Floating market install.** `RECOMMENDED_MARKET_VERSION = 'latest'` means clicking Install
   executes whatever the `dshmarket` package publishes that day, including its lifecycle
   behavior inside your `web` profile. index.js:12, 425-426.

## 5. What we could not check

- **Behavioral probe.** No sandboxed run of the packaged app (pipeline S4).
- **Cross-model review.** Single reviewer.
- **Published installers.** Signed DMG/NSIS artifacts from dshdesktop.com were not compared to
  this commit; macOS notarization and Windows signing were taken from README claims
  (README.md platform support table).
- **Upstream Harness.** The spawned `@deepseek-ai/dsh` 0.1.1-rc.2 dependency is upstream scope,
  covered separately by the harness's own audit posture, not by this card.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F (whole-repo); this card says C. Both recorded. The gap: the
sole critical is a negative assertion in a test, 80 percent of highs are lockfile URLs, and the
remaining gates fire on the product's declared purpose (running the Harness). C rather than B
because of the unverified tunnel-binary checksum, the click-time floating `dshmarket@latest`
install, a six-hour auto-polling vendor feed, and the pipeline ceiling (no probe, single
reviewer).

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/dataelement/dsh-desktop /tmp/dshdesk-audit
cd /tmp/dshdesk-audit && git rev-parse HEAD   # expect e589bf688624871d953f8c58418f913c407dfc7e

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dshdesk-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '151,155p' package.json                          # update feed URL
sed -n '185,186p' src/main/update/update-manager.ts     # autoDownload=false
sed -n '101,121p' src/main/mobile/cloudflared-tunnel.ts # download without digest check
grep -n "digest(" src/main/mobile/cloudflared-tunnel.ts  # expect: no hits
sed -n '12p;419,427p' packages/dsh-desktop-market-installer/index.js  # dshmarket@latest
grep -rniE "telemetry|posthog|sentry" src/main src/preload --include="*.ts"  # expect: none
```

## 8. Methodology and pinned inputs

- Subject: git commit `e589bf688624871d953f8c58418f913c407dfc7e` (shallow clone at
  reference/audits/dshdesktop); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`.
- Review: full read of the update manager and policy, the mobile bridge and cloudflared tunnel
  modules, the market-installer package, profile-store credential hits, window creation flags,
  and the README security claims; family-by-family adjudication of the critical and all gates.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no telemetry, no third-party egress beyond the documented update feed and
  user-triggered installs, sandboxed renderer, consent-gated updates; caps: unverified tunnel
  binary checksum, floating market install, vendor-controlled update feed, no S4 probe, single
  reviewer. Result: C.

## 9. Strengths

1. Zero telemetry and zero hidden egress: every outbound destination in the main process is
   either loopback, the declared update feed, or an action you clicked.
2. The update pipeline is conservative by default: checks are polled but nothing downloads or
   installs without explicit clicks, and auto-install-on-quit is off.
3. Renderer hardening matches modern Electron guidance everywhere windows are created, and the
   phone bridge uses expiring random tokens with timing-safe comparison rather than static
   secrets.
4. The single scanner critical is literally a test that proves credential tooling is absent from
   the release workflow.

## 10. Residual risks

1. If you enable remote phone access, the app downloads and executes a Cloudflare-signed binary
   with pinned-but-unenforced checksums over HTTPS; a compromised CDN hop or GitHub account at
   that moment yields arbitrary native code execution on your machine.
2. Installing the marketplace hands execution control to `dshmarket@latest`, so the effective
   supply-chain root of trust for plugins is whatever that package publishes at click time -
   the same float-to-latest risk we flag on other marketplace surfaces.
3. The vendor feed `dshdesktop.com` is a single corporate endpoint controlling future binaries;
   its long-term integrity practice is unverifiable from this repository alone.
4. The app intentionally grants the Harness full child-process capability, so anything accepted
   into a DSH profile inherits the machine; this card covers the shell, not what users install
   into it.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any digest check appearing in
   cloudflared-tunnel.ts upgrades the tunnel finding; any new telemetry namespace, any change to
   `autoDownload`, or a pinned market version forces re-adjudication.
2. Diff `packages/dsh-desktop-market-installer/index.js` before trusting upgrades; changes to
   the install argument list alter what executes at click time.
3. Re-vet at 90 days, on the next tagged release, or when the update feed URL changes, whichever
   comes first.
