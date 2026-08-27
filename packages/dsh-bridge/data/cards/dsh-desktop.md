# Trust Report Card: DSH Desktop (`dsh-plugin-desktop`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-plugin-desktop` v2.0.3 - the Electron desktop shell for DeepSeek Harness: window/tray/terminal host, work profiles, a community plugin marketplace (`dsh-community-market`), and an update service. The catalog entry `anywhere-labs/dsh-desktop` is a monorepo; this card covers the shipped plugin package and its market companion. |
| Pinned subject | github:anywhere-labs/dsh-desktop @ commit `ec0b0e5ebbd42318b46920eeac65060414c25471` (master head at audit time) |
| Upstream binding | Git submodule pin of `deepseek-ai/deepseek-harness` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, sourceVersion `0.1.1-rc.2` (upstream.json) |
| Stars | 20,330 (GitHub API, audit time) |
| License | MIT. LICENSE present in the plugin package (`dsh-plugin-desktop/LICENSE`, "MIT License, Copyright (c) 2026 Anywhere Labs") and declared in dsh-plugin-desktop/package.json:5. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review of shipped surfaces) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile was found: all outbound talk goes to documented, named endpoints behind a DNS-pinned,
private-range-blocking HTTP client, updates require user confirmation, and no credential paths are
read - but the update downloader checks file magic rather than signatures, and market installs
resolve whatever npm `latest` is at click time, so a careful user should know both before installing.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (named hosts) | Fixed endpoints only: `https://www.dshdesktop.cn/api/desktop/version` and `/api/downloads/{mac,windows}` for update check/download; `https://electronjs.org/headers` for Electron toolchain headers; marketplace catalogs at `https://deepseek1024.com/api/v2/plugins`, `https://dsh-marketplace.qilewl.net/{v1/plugins,catalog-source.json,api/plugins}`, and `https://api.dshfind.com/*`. No dynamically computed third-party hosts in shipped code. | dsh-plugin-desktop/src/update-checker.ts:10; src/update-download.ts:14-15; src/desktop-runtime-environment.ts:22; dsh-community-market/src/adapters/dsh-1024store.ts:8; src/adapters/dsh-marketplace.ts:11-15; src/adapters/dshfind.ts:9-11 |
| Network guardrails | All catalog traffic goes through a restricted HTTPS client that resolves DNS once and pins the address for the connection, blocks loopback/private/link-local/multicast ranges (IPv4 and IPv6), caps redirects at 3 and bodies at 2 MiB, and enforces per-request origin allowlists through redirects. | dsh-community-market/src/network/restricted-http.ts:18-40 (blocklist), :211-216 (origin check on redirect), :284 (pinned address used for the request) |
| Credential handling | Zero reads of `~/.claude`, `~/.codex`, `~/.ssh`, `~/.aws`, `.env`, or any agent credential store. Environment enumeration exists but is defensive: stripping `ELECTRON_RUN_AS_NODE`/`NPM_CONFIG_*` runner variables, and case-insensitive `PATH` lookup for Windows. | grep negative across dsh-plugin-desktop/src and dsh-community-market/src; dsh-plugin-desktop/scripts/verify-cli-runtime.mjs:22-32; src/profile-materializer.ts:92-97; src/pnpm.ts:73-75 |
| Identity | One pseudonymous UUIDv4 generated locally, stored 0600 under the Electron userData tree, sent only as `X-DSH-Desktop-Installation-Id` to the fixed version-check endpoint. | src/desktop-installation-id.ts:8-11, 47-52; src/update-checker.ts:148-154 |
| Updates | Check is headless; the download requires an explicit user confirmation callback per version, writes to a user-selected path, and validates the artifact by DMG trailer / PE header magic. It never launches the installer itself. | src/update-lifecycle.ts:190-199; src/update-download.ts:14-15, 417-456 |
| Child processes | Present and narrow: spawning the packaged CLI entry by fixed file URL, relaunching the app executable for recovery/uninstall, `execFile('/usr/bin/open', ['-t', path])` on macOS, and the installer handoff `--updated --force-run`. No string-assembled shell commands in plugin source. | src/desktop-cli.ts:10, 51-60; src/recovery-plugin-uninstall.ts:159; src/startup-recovery-window.ts:615; src/electron-runtime.ts:757 |
| Dynamic code execution | The scanner-flagged dynamic `import()` loads one constant: the packaged DSH entry URL built from the module's own directory. The Windows ACL runner imports only its own expected runner path. No `eval`, no `new Function`, no variable-specifier import of user input. | src/desktop-cli.ts:10, 60; src/windows-acl-runner.ts:23 |
| Marketplace install | Before installing, npm candidates are verified against `registry.npmjs.org` (name identity, stable exact version, valid DSH bundle patch) and GitHub candidates against a 40-hex commit pin plus raw manifest check; install then pins `package@version`. | dsh-community-market/src/install/service.ts:197-247 (npm verifier), :565-587 (exact-version pnpm add + post-install reconciliation); src/install/github.ts:12, 41-49 |
| Telemetry | None of its own. It honors the user's DSH opt-out by disabling the upstream `session-telemetry-otel` patch when `DSH_TELEMETRY_DISABLED` is set. CI sets the same flag. | src/profile.ts:706, 994-995; .github/workflows/ci.yml:20 |
| Lifecycle hooks | `prepack: yarn run check` exists but runs the project's own build/test gate at pack time, not at user install time; registry installs of a packed tarball skip it. | dsh-plugin-desktop/package.json:137 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**474 findings** (15 critical, 341 high NET-heavy, 10 medium, 108 low) over 423 files. Machine verdict
**F**, off three gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`. Manual
adjudication follows.

### Where the volume is

264 of the 341 high NET findings sit under `tests/` and `docs/` fixture material (159 in
`dsh-community-market/tests` alone). The remainder in shipped code are the named hosts in section 3.

### Criticals and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| 14x CRED critical `Object.keys/entries(process.env)` | Defensive environment hygiene, not harvesting: every site either strips Electron/NPM runner variables before spawning, verifies they stayed stripped, looks up `PATH` case-insensitively on Windows, or seeds test fixtures. None of the enumerated values leave the process except as a sanitized child environment. | scripts/verify-cli-runtime.mjs:22-40; scripts/verify-loader-boot.mjs:35-42, 185; src/profile-materializer.ts:92-97; src/windows-acl-runner.ts:10; tests/shell-environment.spec.ts:183 |
| 1x NET critical `https://169.254.169.254/latest` | Inside a test that *asserts rejection* of cloud-metadata addresses: `it.each([...])('reject...')`. The guardrail is the feature being tested. | dsh-community-market/tests/market-runtime.spec.ts:2047 |
| `dynamic-exec-present` gate | The only triggers are `import()` with a constant file URL (the packaged CLI entry) and `SEMVER_PATTERN.exec` (a regex method). Dismissed. | src/desktop-cli.ts:51, 60; src/update-checker.ts:66 |
| `finding-density` gate | Volume is test/fixture mass in a 21 MB monorepo. After scoping to shipped surfaces, surviving highs are the documented endpoints in section 3. | scan breakdown above |

### Residual observations that keep this at C

1. **Installer validation is magic-number only.** `validateArtifact` confirms DMG/PE structure but
   performs no signature or digest check on the downloaded bytes. macOS releases are separately
   signed/notarized on a credentialed machine per the CI comment, and the download is consent-gated,
   but a compromised `www.dshdesktop.cn` could serve a structurally valid malicious installer that
   passes this check. | src/update-download.ts:417-456; .github/workflows/ci.yml:124-128
2. **Market installs resolve npm `latest` at click time.** The verifier reads `/latest` and installs
   exactly what it returned, with post-install reconciliation - honest and well-built, but the user
   gets whatever the registry serves that second, not a reviewed revision.
   | dsh-community-market/src/install/service.ts:205-206, 233, 569-579

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer; revision 1 is capped accordingly.
- **Release artifacts.** Audit covers the repository at the pinned commit. Built DMG/NSIS artifacts on
  the release channel were not diffed against this tree.
- **Upstream submodule build.** The pinned `deepseek-ai/deepseek-harness` `0.1.1-rc.2` tree was not
  re-audited here; it is the upstream harness, out of scope for a plugin card.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner says F; this card says C. Both are recorded. The F collapses under
adjudication: the CRED criticals sanitize the environment rather than harvest it, the one NET critical
is a test proving an SSRF guard works, and the density comes from fixtures that never ship. What
removes the higher bands is not hostility but two unverifiable-at-runtime gaps named in section 4,
plus the absent probe and cross-model pass.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/anywhere-labs/dsh-desktop /tmp/dsh-desktop-audit
cd /tmp/dsh-desktop-audit && git rev-parse HEAD   # expect ec0b0e5ebbd42318b46920eeac65060414c25471

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dsh-desktop-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "https://" dsh-plugin-desktop/src --include="*.ts" | grep -vE "test|//|\*"   # electronjs.org + dshdesktop.cn only
grep -rn "\.claude\|\.codex\|\.ssh\|\.aws\|opencode/auth" dsh-plugin-desktop/src dsh-community-market/src --include="*.ts"   # expect: no hits
sed -n '18,40p' dsh-community-market/src/network/restricted-http.ts                                   # the private-range blocklist
sed -n '417,456p' dsh-plugin-desktop/src/update-download.ts                                           # magic-only installer validation
sed -n '190,199p' dsh-plugin-desktop/src/update-lifecycle.ts                                          # consent gate before download
sed -n '565,587p' dsh-community-market/src/install/service.ts                                         # exact-version pinning at install

# 4. Confirm the upstream pin
cat upstream.json    # expect deepseek-ai/deepseek-harness @ b150a551..., 0.1.1-rc.2
```

## 8. Methodology and pinned inputs

- Subject: git commit `ec0b0e5ebbd42318b46920eeac65060414c25471` (shallow clone at
  reference/audits/dsh-desktop); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 474 findings, run output
  summarized in section 4.
- Review: manual read of the shipped surfaces - update-checker/update-download/update-lifecycle,
  desktop-installation-id, desktop-cli/electron-runtime/startup-recovery-window/
  recovery-plugin-uninstall, profile-materializer, pnpm, windows-acl-runner, desktop-settings-route;
  the entire market network stack (restricted-http, catalog service, adapters, install service and
  GitHub verifier); package.json manifests; ci.yml. Test-fixture findings were sampled and classified,
  not read line by line.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile indicator survives adjudication; egress is named, documented, and
  guarded; no credential access; no telemetry; no install-time hooks on the registry path. Caps: no
  S4 probe, single reviewer, magic-only installer validation, latest-at-click-time market installs -
  each alone bars B under the pipeline's "could not fully examine" ceiling. Result: C.

## 9. Strengths

1. The market HTTP client is the best-guarded networking code seen in this catalog: DNS pinning,
   private-range blocking on both families, redirect origin continuity, body and hop caps
   (src/network/restricted-http.ts:18-40, 211-216, 284).
2. GitHub-sourced plugin installs demand a full 40-hex commit before anything else happens, so a
   catalog cannot slide a moving branch past the user (src/install/github.ts:12, 41-49).
3. The update flow asks before downloading, binds one pseudonymous UUID to one endpoint, and documents
   both decisions in code (src/update-lifecycle.ts:190-199; src/desktop-installation-id.ts:8-11).
4. Environment handling actively removes `ELECTRON_RUN_AS_NODE` inheritance instead of assuming it
   away (scripts/verify-cli-runtime.mjs:22-32).
5. Upstream is pinned twice: a submodule commit and an `upstream.json` record carrying the same SHA
   and version (.gitmodules; upstream.json).
6. Extensive SSRF/market tests exist and are what generated most scanner noise - the tests assert
   rejection of metadata IPs, non-object manifests, and origin-breaking redirects
   (dsh-community-market/tests/market-runtime.spec.ts:2047 et al.).

## 10. Residual risks

1. Downloaded installers are validated by file magic only. Prefer verifying release signatures
   yourself until the downloader checks them (src/update-download.ts:417-456).
2. Marketplace installs float to npm `latest` at the moment you click. A compromised package publish
   reaches users between catalog refreshes (service.ts:205-206).
3. `www.dshdesktop.cn` is a first-party service outside GitHub's transparency surface; the version
   check sends the installation UUID there on every check (update-checker.ts:148-154).
4. The desktop hands the model real terminal access via its terminal component - that is the product,
   but it is the largest capability grant in the package (cordis.patch.yml `desktop-terminal` row).
5. The repo carries large auxiliary surfaces (fabric package, packaging scripts, bilingual doc
   tooling) that were classified by sampling rather than exhaustive read.
6. Repointing the market catalog sources in user config changes where catalog bytes come from; the
   origin allowlist follows configured origins by design (service.ts:51, 65).

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new host in `dsh-plugin-desktop/src` or
   `dsh-community-market/src`, any credential-path read, or any loosening of the restricted-http
   blocklist forces re-adjudication.
2. Check whether `validateArtifact` gained a signature or digest check; if it did, residual risk 1
   closes and this card should be revised upward.
3. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
4. Re-vet at 90 days, on any new major of `dsh-plugin-desktop`, or when the pinned upstream moves off
   `0.1.1-rc.2`, whichever comes first.
