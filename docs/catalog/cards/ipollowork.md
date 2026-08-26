# Trust Report Card: iPolloWork DSH Studio plugins (`deepseek-idesign`, `deepseek-ippt`, `deepseek-ivideo`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | The `external-plugins/deepseek-harness/` family of iPolloWork: three Cordis bundles that render the Design Studio, PPT Studio, and Video Studio conversation views inside DeepSeek Harness. Each is a thin adapter over shared studio-host code plus a bundled web studio UI; `deepseek-idesign` v0.2.2 is the published flagship and the graded subject, with ppt/video reviewed as siblings. |
| Pinned subject | github:Devin-AXIS/iPolloWork @ commit `69138cbbda98ae5cb5d377513753e1b134710ec8` (main head at audit time); published artifact `deepseek-idesign@0.2.2` (npm) cross-checked against this tree |
| Stars | 4,858 (GitHub API, audit time) |
| npm integrity | `sha512-eCLe9uw1dCcsXx7ap6F8GdVYbK3Ebd4qS2gXSYA1OQHdtpMRI1cHiAbJ2UV5Sah9eZXOnrZKlpNLxAsOOkXbsg==` (`deepseek-idesign@0.2.2`, fetched 2026-08-26). No `gitHead` on registry metadata. |
| Provenance | Strong process: publish runs only on `refs/tags/deepseek-idesign-v*` (and ippt/ivideo twins), enforces tag-version == package-version equality in-workflow, and publishes with `--provenance` under `id-token: write`. Registry metadata itself carries no gitHead, so tarball-to-commit equality rests on that workflow rather than a verifiable field. |
| License | "iPolloWork Source Available License 1.0" (NOASSERTION to GitHub). A LICENSE file ships inside the plugin package and the REUSE.toml + LICENSES/ directory documents Apache-2.0/MIT/GSAP components. This fails the charter's license-hygiene preference for OSI terms but is disclosed and consistent. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of plugin sources, studio-host, published tarball read) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The shipped plugins themselves are clean and well-guarded - token-gated routes confined to the
workspace folder, no egress from the design/ppt bundles at all - but they are slices of an enormous
source-available monorepo whose surrounding surfaces (an orchestrator postinstall that downloads a
platform binary from GitHub releases, vendored minified third-party code, eval tooling full of
credential-shaped fixtures) the scanner cannot separate from the product.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Registration | Each bundle inserts one Cordis entry mapping to its npm package (`deepseek-idesign`, and the ippt/ivideo twins); no other services injected. | external-plugins/deepseek-harness/design-studio/cordis.patch.yml:1-4 |
| Filesystem access | Reads/writes only inside the workspace's prefixed studio folder. Path handling normalizes separators, rejects absolute paths/NUL/traversal segments, enforces a prefix root, resolves realpath, and re-checks containment after resolution before any write. Writes use conflict detection ("changed since loaded") with atomic rename. | studio-host/src/http.ts:45-90 (safeRelativePath/safeAssetPath/inside), :92-110+ (verifiedExistingPath/verifiedWritePath); design-studio/src/index.ts:52-56 (conflict check constant) |
| Route authorization | Every mutating/studio route requires a per-session token header (`x-ipollowork-design-token` for design; equivalents for ppt/video) compared against a `randomBytes` token minted at activation; mismatch is a hard 403. The published bundle carries the same check at lib/index.js:3612. | studio-host/src/http.ts:35-43; design-studio/src/index.ts:53, 72; package/lib/index.js:3612 (tarball spot-check) |
| Network egress (design/ppt) | None. Neither design-studio nor ppt-studio source contains fetch/http/client calls; their outbound surface is zero by construction. | grep negative across external-plugins/deepseek-harness/{design,ppt}-studio/src |
| Network egress (video) | Spawns the vendored hyperframes CLI as a child process per render/preview request; inherits environment including PATH. This executes the project's own renderer, which is the documented product of video generation. | video-studio/src/runtime.ts:1, 78, 156, 332-356 |
| Child processes | Only the video bundle spawns: fixed `process.execPath` running its own cli.js path, never a shell string. | runtime.ts:332-340 |
| Credential handling | None in any of the three bundles. No env enumeration, no agent credential paths. The monorepo around them is another matter (section 4). | grep negative across external-plugins/deepseek-harness/*/src |
| Telemetry | None in the plugins. | grep negative |
| Lifecycle hooks | `prepack: pnpm run build` exists (own bundler, pack-time only, skipped for registry installs of packed artifacts). No install/postinstall hooks in the plugin packages. | design-studio/package.json scripts block |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**3570 findings** (37 critical, 2870 high, 368 medium, 297 low) over 3901 files / ~40 MB scanned.
Machine verdict **F**, off five gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`,
`concealed-egress`, `install-hook-shell`. Manual adjudication follows.

### Where the volume is

The monorepo dwarfs its plugins: `apps/app` (the Electron product), `apps/server`,
`vendor/hyperframes` (45 MB vendored upstream), and `evals/` produce nearly all mass. The three
graded bundles contribute a handful of findings total.

### Criticals and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED criticals: `.ssh`/`.aws`/`id_rsa` strings (apps/orchestrator/src/cli.ts:574-588) | These are entries in `DEFAULT_SANDBOX_BLOCKED_PATTERNS` - a denylist the orchestrator uses to keep those very paths out of sandbox mounts. The scanner matched the defense, not an offense. | apps/orchestrator/src/cli.ts:569-589 |
| CRED criticals writing `id_ed25519`, touching `$HOME/.ssh` (.github/workflows/*.yml) | CI deploy-key plumbing for the public mirror sync and AUR validation; runner-scoped, standard practice, not shipped code. | .github/workflows/sync-deepseek-design.yml:86-89,122; aur-validate.yml:426-429 |
| CRED criticals in evals/* (`process.env` into localStorage, metadata IP probes) | Test harnesses exercising SSRF rejection and config injection; `evals/flows/llm-provider-test-connection-api.flow.mjs:174` probes `169.254.169.254` precisely to assert it fails. Not product code. | evals/drivers/cloud-connect-services-mock.mjs:500,530; evals/flows/*.mjs |
| EXEC high (490) | Dominated by test runners, packaging scripts, i18n placeholder strings mentioning `npx`, and the orchestrator binary loader. None in the graded bundles. | scan breakdown by directory |
| HOOK high / `install-hook-shell` gate (apps/orchestrator/scripts/postinstall.mjs) | Real and named: installing the orchestrator CLI package runs a postinstall that, when the platform-specific optional dependency is absent, downloads a fallback binary from `github.com/Devin-AXIS/iPolloWork/releases` and chmods it executable. URL derives from the package's own pinned version; still an install-time network fetch plus executable drop on a sibling package. | apps/orchestrator/scripts/postinstall.mjs:60-77, 100-118 |
| OBFU high `nЛюди/nНо/nЧто` (apps/app/src/i18n/locales/ru.ts:91) | Russian locale strings misread as entropy. Dismissed. | ru.ts:91 |
| OBFU medium cluster (decodeURIComponent/base64/atob) | URL decoding and data-URL image handling across app/vendor UIs; one real minified vendor file exists (`three.min.js`) but it is bundled, not dynamically fetched or decoded-then-executed. `concealed-egress` gate dismissed for the graded bundles. | scan output; apps/server/bundled-templates/.../three.min.js:6 |
| `dynamic-exec-present` gate | Published design bundle contains exactly one `new Function("")` - a capability probe inside a shared error/eval-support helper that executes an empty program and discards the result. No dynamic execution of data. Verified against the tarball, not just source. | package/lib/index.js:137 (tarball) |
| `cred-plus-net` gate | In the graded bundles: no CRED findings exist at all, so the pairing cannot fire there. Monorepo-wide it fires off test fixtures. Dismissed for this subject. | section 3 rows |

### Source-to-artifact comparison

`npm pack deepseek-idesign@0.2.2` yields `lib/index.js` (4146 lines, unminified), `cordis.patch.yml`,
`studio/`, `package.json`, `README.md`, `LICENSE`. Grepping the bundle returns one `new Function`
(line 137) and zero `fetch(`/`child_process`/`process.env` hits - matching the source review
prediction exactly. The token check survives bundling verbatim (lib/index.js:3612 vs
studio-host/src/http.ts:72 semantics).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.
- **ppt/ivideo published tarballs.** Reviewed in-tree only; only `deepseek-idesign` was packed and
  diffed at the artifact level.
- **Vendor/hyperframes** (45 MB): classified as vendored upstream, not adjudicated line by line; it
  ships inside the video pipeline's blast radius.
- **Orchestrator platform packages**: the optionalDependency binaries pulled from npm releases were
  not audited.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. Both recorded. Every gate dissolves under
scoping except `install-hook-shell`, which is real but lives in the orchestrator CLI package, a
sibling the DSH user does not install. What holds the grade at C rather than B: unverifiable
tarball-to-commit equality (no registry gitHead; provenance rests on workflow behavior), a
non-OSI source-available license on the parent project, no probe, single reviewer, and a large
unreviewed vendor surface adjacent to the video bundle.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Devin-AXIS/iPolloWork /tmp/ipollowork-audit
cd /tmp/ipollowork-audit && git rev-parse HEAD   # expect 69138cbbda98ae5cb5d377513753e1b134710ec8

# 2. Re-run our scanner scoped to the graded packages
node tools/scan/dist/index.js /tmp/ipollowork-audit/external-plugins/deepseek-harness   # from dsh-bridge

# 3. Spot-check the headline claims
grep -rnE "fetch\(|https?://" external-plugins/deepseek-harness/design-studio/src \
      external-plugins/deepseek-harness/ppt-studio/src --include="*.ts*"    # expect: no hits
sed -n '35,43p' external-plugins/deepseek-harness/studio-host/src/http.ts   # requireStudioToken
sed -n '45,70p' external-plugins/deepseek-harness/studio-host/src/http.ts   # traversal-proof path checks
grep -rn "spawn\|child_process" external-plugins/deepseek-harness/*/src     # expect: video-studio/runtime.ts only

# 4. Read what npm actually ships
cd /tmp && npm pack deepseek-idesign@0.2.2 && tar -xzf deepseek-idesign-0.2.2.tgz
grep -nE "new Function|fetch\(|child_process|process\.env" package/lib/index.js
#   expect exactly one hit: new Function("") capability probe at line 137

# 5. Confirm publish gating yourself
sed -n '88,96p' .github/workflows/ci-dsh-design-studio.yml                  # tag-only condition, id-token: write
sed -n '144p'   .github/workflows/ci-dsh-design-studio.yml                  # --provenance publish
```

## 8. Methodology and pinned inputs

- Subject: git commit `69138cbbda98ae5cb5d377513753e1b134710ec8` (shallow clone at
  reference/audits/iPolloWork); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 3570 findings monorepo-wide,
  adjudicated down to the table above for the graded packages.
- Review: full read of design-studio/src (312 lines), ppt-studio/src, video-studio/src incl.
  preview-owner-guard, all 410 lines of studio-host/src, cordis.patch.yml files, plugin
  package.json files, ci-dsh-design-studio.yml, orchestrator postinstall.mjs; artifact-level read of
  the published `deepseek-idesign@0.2.2` tarball; classification pass over apps/, vendor/, evals/.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: the graded bundles show no egress, no credential access, no telemetry, token-
  gated loopback routes, and traversal-proof workspace confinement; the tarball matches source on
  every headline claim. Caps: no S4 probe, single reviewer, workflow-based (not field-based)
  provenance, source-available parent license, unadjudicated vendor/orchestrator surfaces. Result: C.

## 9. Strengths

1. Workspace confinement is layered: normalization, segment rejection, prefix enforcement, then
   realpath resolution followed by a *second* containment check after symlinks resolve
   (studio-host/src/http.ts:64-90).
2. Per-session random tokens gate every route, minted from `node:crypto` at activation, and the check
   demonstrably survives into the published bundle (design-studio/src/index.ts:53;
   package/lib/index.js:3612).
3. Design and PPT bundles achieve zero network surface by construction - the strongest possible
   posture for view-rendering plugins.
4. Publish hygiene is exemplary for the ecosystem: tag-gated, version-equality asserted in workflow,
   provenance-attested via id-token (ci-dsh-design-studio.yml:88-96, 144).
5. Write paths detect concurrent modification and refuse to clobber ("The design changed since it was
   loaded"), with bounded sizes throughout (design-studio/src/index.ts:54-56).
6. External plugins are deliberately excluded from the root workspace with a written rationale, so
   building the app never silently builds or installs them (external-plugins/README.md).

## 10. Residual risks

1. The orchestrator CLI's postinstall downloads and executes a release-binary fallback at install
   time. Users installing that npm package (not these plugins) accept an unpinned-hash binary fetch
   (apps/orchestrator/scripts/postinstall.mjs:66-77).
2. Provenance depends on workflow correctness rather than a registry-verifiable field; a compromised
   publish run would leave no gitHead discrepancy to notice.
3. The video studio executes vendored hyperframes code as child processes; that vendor tree (45 MB,
   partially minified) was classified, not audited (runtime.ts:156; vendor/hyperframes).
4. Parent license is source-available, not open-source; redistribution terms differ from every MIT/Apache
   card in this catalog and matter if you fork or embed.
5. The monorepo carries eval infrastructure containing realistic credential fixtures; anyone auditing
   diffs must distinguish fixture churn from real changes (evals/).
6. No behavioral probe ran; route-guard correctness under adversarial HTTP (header casing, duplicate
   tokens) is verified by reading, not execution.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any `fetch` appearing in design/ppt sources, any
   second `new Function` in the published bundle, or any weakening of `requireStudioToken` forces
   re-adjudication.
2. Check whether registry metadata now carries `gitHead`; if so, verify tag-version equality yourself
   and consider raising the provenance assessment.
3. Watch `apps/orchestrator/scripts/postinstall.mjs`: adding signature verification to the fallback
   download closes residual risk 1.
4. Re-vet at 90 days, on the next `deepseek-idesign` minor, or on any change to studio-host/src -
   whichever comes first.
