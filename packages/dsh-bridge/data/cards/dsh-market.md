# Trust Report Card: dshmarket (dsh-market)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dshmarket` (npm name; repo `dsh-market/dsh-market`) - visual plugin marketplace inside DeepSeek Harness: browse, install, update, back up, and restart |
| Pinned subject | github:dsh-market/dsh-market @ commit `9bb879fa1f956e913d9077b669cbba04fdaa1bae` (main head at resolve time, verified equal via `git ls-remote` 2026-08-26) |
| npm integrity | `sha512-Xi0tAWDWf2qKcj8F+TfR439QveoJimGvSh+uj/GyE6avRMM6dArLb4p93Wq/wTU4peY//0llJyMZ8bJLyBUX0Q==` (`registry.npmjs.org/dshmarket/1.29.2`, fetched 2026-08-26) |
| Provenance | npm attestation present (SLSA provenance v1 via GitHub Actions trusted publishing, `.github/workflows/release.yml:29` `id-token: write`); registry `gitHead` equals the pinned commit |
| Distribution | 213,215 downloads last 30 days (`api.npmjs.org/downloads/point/last-month/dshmarket`, fetched 2026-08-26); listed in its own curated catalog as entry `dsh-market` |
| License | MIT (LICENSE:1-3) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review of server, client bundle, and workflows) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version. This plugin is special for this catalog: it is
the *installer* through which other graded plugins reach users, so its distribution rails were
audited as first-order subject matter, not side detail.

## 2. Verdict in one sentence

Use with awareness: the install path is genuinely well-guarded (curated-registry allowlist, same-origin enforcement, DNS-pinned SSRF defenses, build scripts blocked by default, zero telemetry), but the marketplace deliberately ships mutable install channels (npm names without version pins, git HEAD re-resolution, a third-party GitHub proxy on the China route), moves profile credentials to user-chosen cloud endpoints on demand, and publishes no SECURITY.md covering several of these rails.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Install execution | POST `/dsh-market/install` runs `pnpm add <target>` inside the profile via spawned `dsh plugin`. Targets come ONLY from the curated registry: the submitted URL is matched case-insensitively against `registry.plugins[].url` loaded from awesome-dsh-plugin.com; anything else answers 400 "not in the curated registry" (src/routes.ts:2582-2585). Same-origin POST required (src/routes.ts:2563, guard at src/http.ts:19-27); JSON bodies capped at 4 KiB (src/http.ts:31-37); mutations serialized under one lock with 409 on contention (src/routes.ts:344-367). | file:line above |
| Network egress, server side | Catalog fetch: `https://awesome-dsh-plugin.com/plugins.json` global (src/regions.ts:59) or npm package `dsh-plugin-catalog` via Tencent mirror on the China route (src/regions.ts:41,105,120-123). Update checks: active npm registry base (default `https://registry.npmjs.org`, src/regions.ts:40; src/updates.ts:107-139). Git downloads: codeload.github.com tarballs, direct or behind the region proxy (src/sources.ts:146-149). Region probe: fetches `<registry>/dshmarket/latest` from both registries once, persists winner (src/region-probe.ts:53-88). Gist backups: `https://api.github.com` hard-coded (src/gist.ts:38). WebDAV backups: ANY user-supplied https URL (src/backup.ts:244). | file:line above |
| Network egress, browser side | Thumbnails of catalog screenshots proxied through third-party `images.weserv.nl` in every region (src/client/MarketSection.tsx:378-384); avatars via `github.com/<owner>.png` or `avatars.githubusercontent.com` through the region proxy (src/client/MarketSection.tsx:395-400); README images restricted to a GitHub-only host allowlist, SVG dropped (src/client/market-data.ts:674-703); loopback API calls to `/dsh-market/*` routes only (62 scanner hits, all relative-path fetches, e.g. src/client/MarketSection.tsx:1634). | file:line above |
| Third-party intermediary | With region `china` (auto-probed once when unset, then persisted, src/region-probe.ts:53-88, src/routes.ts:265-280), ALL GitHub API reads and codeload tarball downloads route through `https://gh-proxy.com`, an unaffiliated free public proxy (src/regions.ts:51; src/accelerate.ts:115-137). Overridable via `DSHM_GITHUB_PROXY` / `DSHM_NPM_MIRROR` / `DSHM_REGISTRY_URL` env vars (src/regions.ts:144-163). | file:line above |
| Credential handling | Reads no harness credential files anywhere (zero production CRED findings, section 4). BUT: profile backup export may include `config.toml` / `.env` / secrets files from the profile directory, values unmasked by design, surfaced only by a count warning (src/backup.ts:23-35); export goes where the user points it (WebDAV PUT or private GitHub Gist). Gist auth resolves a token from request body, then `DSH_GITHUB_TOKEN`, then silently harvests the local `gh auth token` (src/gist.ts:108-118); tokens held in memory only, never written to disk (src/gist.ts:125-141). | file:line above |
| Child processes | Spawns `dsh plugin` (argv-array, `shell:false`; Windows `.cmd` shims through an explicitly quoted cmd.exe line, src/dsh-cli.ts:263-276), `taskkill` for timeout cleanup (src/dsh-cli.ts:460,489), `gh auth token` (src/gist.ts:167), and a detached `node -e <self-generated helper>` for self-restart (src/restart.ts:295). The `-e` source is generated entirely from JSON-stringified internal values plus the host's own boot argv (src/restart.ts:213-280); no request data reaches it. Restart route additionally requires a loopback peer, absence of forwarding headers, and Origin==Host (src/restart.ts:99-115, enforced at src/routes.ts:2062,2167); whole feature disable-able via config `allowRestart: false` (src/restart.ts:69-76). | file:line above |
| Dynamic code execution | One computed dynamic `import()`: the vendored, unpublished loader package `@deepseek-ai/cordis-plugin-include`, constant string (src/hot.ts:71-72). One `vm.Script` COMPILE-only syntax check of installed client bundles, never executes them (src/verify.ts:390-404). No eval(), no new Function, no obfuscation. Scanner's 87 production EXEC hits are RegExp `.exec()` misclassifications (66 verified individually) plus the legitimate spawns above. | grep + manual read |
| Telemetry | None. No analytics/beacon/metrics code anywhere in src/, client/, scripts/, .github/ (grep across all production files returned only unrelated identifier matches such as stdout collectors). The README claim "the market never phones home" is accurate for telemetry (README.md:59); note it coexists with the documented-but-scattered functional egress in this table. | negative claim, scope stated |

### Distribution rails (the part this catalog depends on)

| Rail | Behavior | Integrity consequence |
|---|---|---|
| npm-channel entries (292 of 839 catalog entries carry `npm`) | `installTargetFor` returns the bare package NAME with no version or dist-tag (src/sources.ts:249-258); pnpm resolves whatever `latest` is at click time. | pnpm verifies `dist.integrity` against the lockfile it writes, so bytes-at-install are tamper-checked, but WHICH bytes is decided at install time. An upstream publish between our review and the user's click flows straight through. This is a mutable rail. |
| GitHub-source entries | Bare `github:owner/repo` shortcut; pnpm resolves HEAD. On the China route the market pre-resolves HEAD itself and substitutes a commit-pinned codeload tarball (src/accelerate.ts:115-137) - pinned there, moving-target everywhere else. Updates re-resolve HEAD BY DESIGN (src/routes.ts:1655-1680). | Time-of-check-to-time-of-use is structural: whatever a card grades, the next click can get newer code. Version detection later reads the commit back out of the lockfile (src/profile.ts), so what arrived is at least observable after the fact. |
| Prebuilt Release tarballs | Accepted only when the URL is `https://github.com/<owner>/<repo>/releases/...` AND owner/repo equals the entry's own repo; release-CDN hosts rejected because they carry no repo binding (src/sources.ts:33-49). Name-squatting protection done right. | Repo binding, not content binding: a compromised upstream repo still flows through. Currently unused by the live catalog (0 of 839 snapshot entries carry `tarball`). |
| Artifact swap after review | No post-install re-verification against any digest recorded at review time exists - neither here nor in our own pipeline yet. Mitigations that DO exist: lockfile-pinned commits observable per install (git sources), pnpm integrity per resolved version (npm sources), SLSA provenance for dshmarket itself. | Residual risk accepted and stated: a card grades a commit; the marketplace installs a stream. Re-vetting triggers (pipeline §8) are what close this gap, per-plugin. |
| Hash verification of the marketplace itself | npm `dist.integrity` + SLSA attestation bind `dshmarket@1.29.2` to this commit (header). Published `client/client.js` is unminified with sourcemap (tsdown.config.ts `sourcemap: true`) making src-to-bundle correspondence human-checkable; `scripts/preflight.mjs` asserts the exact loader banner. Server half is plain tsc output. | Stronger than most peers; rebuild-and-byte-compare still not performed (section 5). |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 2927 findings (0 critical, 1347 high, 24 medium, 1556 low) across 147 files; machine grade F.
Manual adjudication: 2661 findings sit in test files, `data/registry-snapshot.json` (1684 hits are URL strings in pure data), and `package-lock.json`; the production subset is 266 findings, broken down below.

### Production high-severity findings adjudicated

| Family | Count | Adjudication |
|---|---|---|
| NET/high (146) | 1211 total incl. data/lock | 62 are relative-path browser `fetch("/dsh-market/...")` calls to the plugin's own loopback routes (verified sample: MarketSection.tsx:1087,1269,1326; client.js:5125,5300,5337); the rest are literal documentation URLs, SVG namespace strings, WebDAV provider examples, and the egress destinations enumerated in section 3. Every destination is named in this card. Kept as documented behavior. |
| EXEC/high (87) | 109 total | 66 are JavaScript `RegExp.prototype.exec()` calls misclassified as process execution (spot-verified: sources.ts:57,76; profile.ts:230,467; check.ts:445; updates.ts:48; accelerate.ts:79,122; hot.ts:483,485). Remainder are the argv-array spawns enumerated in section 3, all with fixed or internally-derived arguments. |
| HOOK/high (20) | 37 total | CI/release workflow `npm install` steps (publisher-side, .github/workflows/*.yml), pnpm setup hints printed as advice text (src/dsh-cli.ts:674-702), and IIFE markers in the client bundle. No install-time lifecycle hook exists in this package's own consumption path: `prepare`/`prepack` run on the PUBLISHER's machine only (package.json:30-31), and the market installs OTHER packages with build scripts blocked by default (src/install.ts:16-17, pnpm minimumReleaseAge and allowBuilds handling). |
| CRED | 0 production | All 14 CRED hits are test fixtures setting/deleting `DSH_GITHUB_TOKEN` or asserting error strings (tests/gist.spec.ts:67-301 etc.). Production code reads only: proxy env vars (src/net.ts:64-68), `DSH_HOME` (src/profile.ts:38), two `DSH_MARKET_*` timeout knobs (src/dsh-cli.ts:208, src/hot.ts:49), `DSH_GITHUB_TOKEN` (src/gist.ts:110), region overrides (src/regions.ts:146-148). No enumeration of the environment, no ~/.ssh, ~/.aws, ~/.claude, ~/.codex, browser stores, or keychains anywhere. |

### Findings kept (this is where the grade comes from)

| ID | Severity | Location | Note |
|---|---|---|---|
| MKT-NET-1 | medium | src/sources.ts:252 | npm-channel installs are unpinned (`name`, not `name@version`); the marketplace chooses to install a moving target. Standard pnpm integrity checking applies to whatever resolves, but review-to-install drift is possible by construction. |
| MKT-NET-2 | medium | src/regions.ts:51; src/accelerate.ts:128-133 | On the china region (auto-selected by a latency race on first boot, then persisted), GitHub API and tarball traffic traverses gh-proxy.com, a third party who could observe or alter downloads. Commit-pinning of accelerated tarballs limits alteration to the resolved-SHA moment; env overrides provide an escape hatch; the choice is user-visible in /status (`region`, `githubProxy`) and switchable in the UI. Not covered in README's Security section. |
| MKT-CRED-1 | medium | src/backup.ts:23-35,116-124 | Backup export carries profile config files including likely-secret filenames (`config.toml`, `.env*`), unmasked, to a user-chosen WebDAV server or GitHub Gist. UI warns before enabling (route-level warning, review #63 noted in code); transport is hardened (below). Still: one click moves credentials off-machine to an endpoint this plugin does not control. |
| MKT-CRED-2 | medium | src/gist.ts:108-118,150-210 | If no token was supplied, the market silently invokes the user's `gh auth token` and uses it for gist operations. In-memory only, cached 10 min, never logged or persisted. Consent is implicit rather than asked; a user may not expect the marketplace to touch their gh identity. |
| MKT-EXEC-1 | medium | src/restart.ts:213-303 | Detached `node -e` self-restart helper. Source is fully internally derived (JSON.stringify of argv/cwd/log paths); guarded by the strictest request check in the codebase (loopback peer, no forwarding headers, Origin==Host, src/restart.ts:99-115) plus agent-running refusal (src/routes.ts:2160-2174) and `allowRestart:false` opt-out. Kept because `node -e` in a shipped bundle is inherently the pattern our EXEC family flags; adjudicated low-risk on reachability and content. |
| MKT-NET-3 | low | src/client/MarketSection.tsx:378-384 | Browser thumbnail fetches transit images.weserv.nl (third party) in every region; only already-allowlisted GitHub screenshot URLs are ever sent, encoded as query params. IP address of the user is exposed to weserv.nl by design. Documented in code comments, not in README. |
| MKT-NET-4 | low | src/backup.ts:231-294,340-402 | WebDAV accepts arbitrary hosts but with exemplary SSRF discipline: https-only, username/password-in-URL refused, DNS resolved once and every answer checked against public ranges (IPv4 private/CGNAT/link-local/metadata blocked; IPv6 restricted to global unicast 2000::/3), connection PINNED to the validated address closing rebinding, response size capped. |
| MKT-HOOK-1 | low | package.json:30-31 | `prepack`/`prepare` build hooks exist but execute only on the maintainer's machine and in CI (release.yml), never for consumers installing from npm. |
| MKT-SUPPLY-1 | low | src/registry.ts:80-120 comment block | The curated catalog is unsigned external input; validation is schema-shape only. A compromise of awesome-dsh-plugin.com (or the `dsh-plugin-catalog` npm package on the china route) would steer installs. The market's defense-in-depth is the repo-binding checks in sources.ts, which constrain but cannot eliminate this. |

### Scanner noise dismissed (with scope)

- All 1556 NET/low: URL substrings inside `data/registry-snapshot.json` (catalog metadata, never executed) and resolved-URLs in `package-lock.json`.
- 513 findings in `package-lock.json` (lockfile URLs/integrity strings).
- 260 findings in tests/**, *.spec.*, vitest configs, scripts/smoke-spawn.mjs and scripts/probe-tmp.mjs (dev/CI-only; the latter is a Playwright blackhole-routing probe committed at repo root - flagged as untidy, reviewed, harmless).

### Negative claims and what was searched

Searched all of src/, client/, scripts/, .github/ (147 files scanned; all 266 production findings individually adjudicated; full manual read of routes.ts install/update/webdav/gist/restart handlers, sources.ts, install.ts, net.ts, backup.ts, gist.ts, restart.ts, accelerate.ts, regions.ts, region-probe.ts, http.ts, hot.ts, updates.ts, verify.ts excerpt, dsh-cli.ts spawn paths, both client bundles' network functions): no eval/new Function/vm execution; no base64-decoded-then-executed blobs; no obfuscation signals (client bundle unminified with sourcemap); no telemetry endpoints; no reads of SSH/AWS/browser-profile/keychain paths; no environment enumeration; no timers performing network I/O at idle (setTimeout uses are poll/restart loops and object-URL cleanup); no writes outside the profile directory, tmpdir logs, and market state under `<profile>/.dsh-market/`.

## 5. What we could not check

- **Published tarball vs this commit.** Provenance rests on the npm SLSA attestation and `gitHead` match; we did not rebuild and byte-compare. Partial mitigation: shipped artifacts are unminified (server = plain tsc output, client bundle unminified + sourcemap), so correspondence is checkable by reading, and we did read the shipped-pattern `client/client.js` against src/client/.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4 unavailable). Static review covered the same surfaces but cannot rule out environment-dependent behavior. Per pipeline §6, this caps the grade.
- **gh-proxy.com and images.weserv.nl behavior.** Third-party services; their handling of proxied requests is outside this artifact. For gh-proxy specifically the threat is not passive observation but MITM of tarballs; TLS protects the transport to the proxy, and the proxy terminates it.
- **awesome-dsh-plugin.com / dsh-plugin-catalog compromise.** The catalog trust root is asserted, not verified; entry-level repo bindings limit blast radius per entry.
- **Windows paths.** cmd.exe quoting, PowerShell relaunch wrapper, and PATHEXT resolution were read (src/dsh-cli.ts:216-276, src/restart.ts:162-180) but not executed.
- **Cross-model adversarial review** (pipeline S5): not performed; see section 6.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner's mechanical verdict (F) disagreed with the adjudicated verdict; both positions are recorded in section 4 rather than hidden. Within the manual pass there was genuine deliberation between B and C; C won on the rubric's own terms: more than two medium findings stand, several egress rails lack end-user documentation, and no behavioral probe ran (C is the mandatory ceiling for anything the pipeline could not fully examine).

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/dsh-market/dsh-market /tmp/dshm-audit
cd /tmp/dshm-audit && git rev-parse HEAD   # expect 9bb879fa1f956e913d9077b669cbba04fdaa1bae

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dshm-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "eval(\|new Function\|vm\." src client --include=*.ts --include=*.tsx --include=*.js  # exec: compile-only vm.Script at verify.ts, import() at hot.ts:72 only
grep -rhoE "https?://[a-zA-Z0-9./_#?=&%:-]+" src client scripts | sort -u                      # egress: the section-3 list, nothing else
sed -n '2578,2586p' src/routes.ts                                                              # install route: curated-registry allowlist
sed -n '19,27p' src/http.ts                                                                    # sameOrigin guard
sed -n '244,248p' src/backup.ts                                                                # WebDAV https-only + SSRF gate
sed -n '99,115p' src/restart.ts                                                                # restart request trust chain
sed -n '249,258p' src/sources.ts                                                               # unpinned npm target (MKT-NET-1)
grep -rniE "telemetry|analytics|posthog|sentry|mixpanel|beacon" src client scripts             # telemetry: zero

# 4. Confirm the published artifact matches this commit
npm view dshmarket@1.29.2 dist.integrity
#   expect sha512-Xi0tAWDWf2qKcj8F+TfR439QveoJimGvSh+uj/GyE6avRMM6dArLb4p93Wq/wTU4peY//0llJyMZ8bJLyBUX0Q==
npm view dshmarket@1.29.2 gitHead          # expect 9bb879fa1f956e913d9077b669cbba04fdaa1bae

# 5. Confirm the clone is still upstream main (artifact-swap check on OUR side)
git ls-remote https://github.com/dsh-market/dsh-market HEAD
```

## 8. Methodology and pinned inputs

- Subject: git commit `9bb879fa1f956e913d9077b669cbba04fdaa1bae` (clean shallow clone at reference/audits/dsh-market; working tree empty; HEAD == upstream main at resolve time)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of src/{routes,sources,install,net,backup,gist,restart,accelerate,regions,region-probe,http,hot,updates,profile,dsh-cli}.ts, verify.ts (vm.Script section), tsdown.config.ts, .github/workflows/{release,ci,build-site}.yml, README.md Security section, LICENSE; targeted read of client/client.js network functions; registry-snapshot statistics computed programmatically
- Registry facts: npm integrity/gitHead/attestations and download count fetched live 2026-08-26
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero critical; four medium findings kept (all documented-functionality, none hidden); several egress rails under-documented for end users; no behavioral probe (mandatory C ceiling). B was argued and rejected on the <=2-medium condition. Caps applied: no-probe ceiling, single-reviewer note.

## 9. Strengths

1. The install route is allowlisted at the source-name level, not just sanitized: a malicious or compromised market page cannot install anything outside the curated catalog, and the check re-fetches the catalog fresh every request (no stale-cache bypass) (src/routes.ts:2582-2585; src/registry.ts:56-120).
2. Repo-binding done properly on prebuilt tarballs: release archives must belong to the entry's own owner/repo, with an explicit, correct rationale for rejecting CDN hosts that carry no binding (src/sources.ts:16-49). The evil-tarball attack is named and closed in-code.
3. SSRF defenses on the user-configurable egress path (WebDAV) are textbook: scheme pinning, credential-in-URL refusal, all-address DNS validation against public ranges, connection pinned to the validated IP, response caps (src/backup.ts:231-402).
4. Honest failure surfaces throughout: fake-success detection on installs (#18), manifest rollback on failed adds (#65), silent-stale-update diagnosis (#13/#22), and a restart helper that writes evidence when it fails (#177). The codebase treats "looked right but wasn't" as the enemy.
5. Zero telemetry, zero credential-file access, zero obfuscation, zero dynamic code execution beyond one constant-string import and a compile-only syntax check - verified negatively with stated search scope.
6. Self-discipline about its own powers: agent-running guard blocks mutations mid-agent (routes.ts:2570-2580 area), supervisor detection hides the restart button where it would kill a systemd unit, and `allowRestart:false` gives operators a kill switch (src/restart.ts:51-76).

## 10. Residual risks

1. **Mutable install channels are the design, not a bug they missed.** npm entries install `latest` at click time; git entries resolve HEAD (except China-accelerated ones, pinned). Any dsh-bridge card for a downstream plugin therefore grades a moment, and dsh-market's one-click UX makes the moment drift trivially. Our re-vetting triggers must assume drift, and users should prefer entries whose npm version we have pinned and re-checked.
2. **China route delegates GitHub trust to gh-proxy.com**, chosen automatically by a latency race on first boot. A hostile or compromised proxy sees and could tamper with tarball bytes at the resolved-SHA moment. Detectable post-hoc via the lockfile commit, but only by someone who looks.
3. **One click moves profile secrets off-machine**: backup export to WebDAV/Gist includes unmasked config/secrets files with a count-based warning. Users backing up to a shared or third-party WebDAV should treat those files as disclosed.
4. **Silent gh-token adoption** for gist features (MKT-CRED-2): the marketplace uses the user's GitHub CLI identity without asking, scoped to gist API calls only.
5. **The catalog trust root is unsigned**; entry validation is shape-checking. Compromise of awesome-dsh-plugin.com or the `dsh-plugin-catalog` npm package would steer installs within the repo-binding constraints.
6. **No post-install verification against review-time digests exists anywhere in this ecosystem yet** - the artifact-swap question the charter asks has the answer "observable after the fact (lockfile commit, pnpm integrity) but not prevented." This card's re-verify steps are the interim compensating control.
7. Published artifacts not independently rebuilt; provenance rests on npm attestations (standard npm trust model, attested publisher).

## 11. Re-verify steps

1. Re-run the section-7 block against current HEAD. Any new literal URL in the egress inventory, new child_process call site, or new env-var read must be re-adjudicated before this grade carries forward.
2. Diff `npm view dshmarket dist.integrity` against the pinned integrity; mismatch means a new release: re-check package.json scripts (any new install-time lifecycle hook is an automatic finding), then re-run the scanner.
3. Watch three specific diffs on upstream changes: src/sources.ts (any loosening of `releaseTarballTarget` repo binding or `NPM_NAME_RE`), src/regions.ts (proxy/mirror table - a new intermediary is a new finding), src/restart.ts (anything feeding request data toward `restartHelperSource`).
4. Re-check the catalog snapshot (`data/registry-snapshot.json`) for entries adopting `tarball:` prebuilt URLs; the rail is currently unused, and its first real uses deserve spot audits.
5. When the dsh-bridge behavioral probe (pipeline S4) lands, re-run this subject through it; this card's C ceiling is provisional on exactly that gap, and a clean probe plus cross-model review is the path to a B re-grade.
