# Trust Report Card: @tt-a1i/archify-dsh (Archify)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@tt-a1i/archify-dsh` v0.1.0 (Skill-only DSH bundle for the Archify architecture-diagram skill; the upstream project is an agent skill + CLI for DSH, Claude Code, Codex CLI, OpenCode, Cursor, Raven) |
| Pinned subject | github:tt-a1i/archify @ commit `af45e517fb9441e769593c1bf0a6395de1acb7ca` (default branch HEAD at audit time; release tag `archify-dsh-v0.1.0` = `fc6e8aca1829a02af0f0efdc193a87c3754d373c`) |
| npm integrity | `sha512-D8fDqV6DV/vo80Gj/3rgidd+hwBbhTVncaVoD5Uhh+DbgYlEoQQOmBVbhU5HW33wE5OqJP/2HkTRPJ0hf7W0tA==` (`registry.npmjs.org/@tt-a1i/archify-dsh/0.1.0`, fetched 2026-08-26) |
| Provenance | Tarball bytes re-hashed locally and matched against registry `dist.integrity`. Tarball `lib/index.js`, `cordis.patch.yml`, and `skills/archify/**` verified byte-identical to the release-tag tree (except documented strips: no `test/`, no `package-lock.json`, no validator generator, `package.json` scripts/devDependencies stripped). No npm attestation or `gitHead` on this package. |
| License | MIT (LICENSE:1-3, "Copyright (c) 2026 tt-a1i (Archify)") |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review + tarball/tag correspondence check) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Safe with documented behavior: the DSH-loaded adapter code is 21 lines that resolve a local path and
open nothing; all network, process, and file capabilities live in the skill's own CLI, which the
agent invokes only on explicit user requests; egress is limited to a user-supplied brand URL behind
layered SSRF guards, a loopback-only preview server, and Google Fonts links inside generated HTML;
there is no telemetry, no credential access, no obfuscation, and no install-time hooks.

## 3. What this plugin can do

The shipped artifact has two trust surfaces with different powers.

### Surface 1: host-loaded plugin code (runs at DSH boot)

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No fetch/http/https/net imports anywhere in the adapter. | integrations/deepseek-harness/lib/index.js:1-21 (whole file); enforced by test integrations/deepseek-harness/test/adapter-security.test.mjs:14-23 |
| Child processes | None in adapter code. The cordis.patch.yml uses `process.getBuiltinModule('node:path')` / `'node:module'` for path resolution only. | lib/index.js:1-21; integrations/deepseek-harness/cordis.patch.yml:4-8 |
| Credential reads | None. No env enumeration, no auth-path access. | grep across lib/ and cordis.patch.yml = zero hits |
| Filesystem writes | None. Adapter resolves and returns one directory path (`<pkg>/skills`). | lib/index.js:7-21 |
| Services registered | One filesystem Skill provider `archify-plugin` with `includeDefaultRoots: false`, skill dir anchored to the installed package via `createRequire(baseUrl).resolve()` (not string concatenation onto baseUrl). | cordis.patch.yml:3-8 |
| Lifecycle scripts | None. No `prepare`/`install`/`postinstall` in package.json (only `files`, `engines`, metadata). | integrations/deepseek-harness/package.json (grep "scripts" = absent) |

### Surface 2: the bundled archify skill (invoked by the agent through ordinary DSH shell/filesystem paths)

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Three destinations only: (1) `brands capture <url>` fetches exactly the user-supplied HTTP(S) URL plus its favicon candidates - private/reserved IPv4 ranges blocked incl. CGNAT/link-local/TEST-NET, IPv6 private/mapped/NAT64 forms blocked, localhost/.local refused, non-standard ports refused, DNS resolved then connection IP-pinned against rebinding, max 3 redirects each fully revalidated, 256 KiB HTML / 1 MiB image caps, content-type allowlist plus magic-byte signature checks (archify/renderers/shared/brand-marks.mjs:80-122,124-136,151-162,178-208,210-230,232-270,307-347); (2) optional desktop preview binds `127.0.0.1` on an OS-assigned port, enforces Host header match and GET/HEAD only (bin/preview.mjs:13,252-258,320-322); (3) generated HTML references Google Fonts (fonts.googleapis.com/fonts.gstatic.com preconnect + stylesheet, assets/template.html:36-42). Render/validate never capture remotely; renderers reject unpinned brand URLs by design (SKILL.md:70). | file:line above |
| Child processes | Spawns only itself (`node <skill>/bin/*.mjs` via spawnSync of process.execPath, bin/archify.mjs:50-57), git read-only queries when repository evidence is authored (`git -C <root> rev-parse/cat-file/show`, renderers/shared/repository-evidence.mjs:20-25), platform openers with constant argv and `shell:false` (bin/open-artifact.mjs:47, Windows path passes target as `$args[0]`, never interpolated), headless Chrome over CDP pipe with hardened flags (bin/visual-check.mjs:240-265), and dev-only repo scripts (build/gallery/smoke/test runners under scripts/, benchmarks/, experiments/) that never run from the installed skill. All spawns use array-form argv; zero `shell:true` in production code (grep verified). | file:line above |
| Credential reads | None. Only credential-adjacent hit is a rejection guard: brand URLs containing userinfo are refused (renderers/shared/brand-marks.mjs:126). No .ssh, .aws, ~/.claude, ~/.codex, auth.json, keychain, or browser-store access anywhere (grep verified). Environment is read only for opt-in overrides (ARCHIFY_BRAND_ALLOW_PRIVATE, ARCHIFY_BRAND_CAPTURE_TIMEOUT_MS, ARCHIFY_CHROME, ARCHIFY_QUALITY_PROFILE, ARCHIFY_REPO_ROOT) and PATH lookups. | grep negative claims below |
| Dynamic code execution | None. No eval(), new Function, vm.*, or non-literal dynamic import. Scanner EXEC hits are child_process imports/spawns (array argv, audited above) and two RegExp `.exec()` calls (delta/architecture-delta.mjs:390,395 - regex matching, not execution). The two `await import(...)` calls take constants derived from `__dirname` (bin/archify.mjs:424-428,1383-1390). | file:line above |
| Filesystem writes | Candidate HTML/JSON into the requested output location via atomic same-directory replace after validation passes; preview staging under mkdtemp with mode 0600 snapshots (bin/preview.mjs:494-501); visual-check sidecars next to the artifact; nothing else. No writes to home dotfiles or harness directories. | bin/preview.mjs:494-501; SKILL.md:84 |
| Telemetry | None. No analytics/beacon/metrics endpoints anywhere in production code (grep across bin/renderers/delta/lib/scripts returned only unrelated identifiers like "relationCollection" and Chrome hardening flags like --metrics-recording-only). | negative claim, scope stated |

Image/asset flow: brand captures become digest-pinned objects embedded in diagram JSON; rendered
HTML embeds captured images as base64 data URLs. Generated artifacts reference Google Fonts but load
no other remote resource.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 615 findings (477 high, 76 medium, 62 low, 0 critical), machine grade F with caps
"dynamic-exec-present" and high-severity findings. Manual adjudication below; test files account for
the majority of findings and were reviewed separately.

### Production-code adjudication (266 findings after excluding tests and lockfile)

| ID | Severity | Location | Note |
|---|---|---|---|
| ARCH-NET-1 | medium | archify/renderers/shared/brand-marks.mjs:210-230 | User-supplied URL fetch (brands capture). Fully guard-railed: private-range blocklists (lines 80-122), shape validation refusing credentials/nonstandard ports/private hosts (124-136), IP-pinned connections closing rebinding (178-190), per-redirect revalidation capped at 3 hops (212-229), size caps (16,232-270), magic-byte checks (307-347). Documented behavior; runs only when the agent executes the command at the user's request. |
| ARCH-NET-2 | low | archify/assets/template.html:36-42 | Generated diagrams reference Google Fonts. Viewer-side fetch, degrades gracefully offline; disclosed here because README says "self-contained". |
| ARCH-NET-3 | low | archify/bin/preview.mjs:320 | Loopback-only HTTP server for optional desktop preview; Host-header pinned, random port, GET/HEAD only, off by default (SKILL.md:94,98). |
| ARCH-NET-4 | info | archify/schemas/*.schema.json, generated-validators.mjs:2 | `$id` strings are JSON-Schema identity URIs, never fetched (Ajv compiles locally from disk). |
| ARCH-EXEC-1 | low | archify/bin/archify.mjs:50; bin/preview.mjs:514; bin/visual-check.mjs:298 | Self-spawns with array argv; arguments are internally constructed paths, not raw user strings; shell never used. |
| ARCH-EXEC-2 | low | archify/bin/open-artifact.mjs:45 | OS opener with fixed per-platform argv; target passed as positional argument, `shell:false`, Windows uses `Start-Process -FilePath $args[0]`. Loopback variant validates scheme/host/port/path before opening (open-artifact.mjs:56-70). |
| ARCH-EXEC-3 | low | archify/renderers/shared/repository-evidence.mjs:21 | Read-only git queries against a user-passed `--repo-root`; root must be a real Git top-level whose origin matches the authored GitHub slug; blob/revision existence checked via cat-file before any show (repository-evidence.mjs:107-140,146-158). |
| ARCH-HOOK-1 | low | integrations/deepseek-harness/scripts/distribution-acceptance.mjs:180-182,256; :443 | Process signal handlers and npm/npx invocations inside a CI acceptance script that is excluded from the published tarball (FORBIDDEN list, test/tarball-contract.test.mjs:14-23). Not reachable from the installed plugin. |
| ARCH-HOOK-2 | info | archify/bin/preview.mjs:643-644; renderers/shared/diagnostics.mjs:106 | SIGINT/SIGTERM cleanup and a JSON-mode-gated uncaughtException reporter that prints one diagnostic object and exits 1 (diagnostics.mjs:103-120). Not lifecycle registration, not pre-consent work. |

### Scanner noise dismissed (with scope)

- 175 NET findings in generated-brand-marks.mjs: Simple Icons SVG path data (vendor logo geometry,
  provenance-stamped "Simple Icons 16.28.0", generated-brand-marks.mjs:1-2) misread as URL-shaped
  strings; plus vendor brand-guideline page URLs stored as catalog `provenance.source` metadata.
  Nothing in this file performs I/O; it is frozen data consumed by brand-marks.mjs lookups.
- 14 NET findings in generated-validators.mjs: single-line Ajv standalone output (max line ~414k
  chars) embedding schema `$id` URIs. Regenerated by scripts/generate-validators.mjs from checked-in
  schemas and verified in CI via `npm run check:validators` (archify/package.json:18,25).
- 35 EXEC family: RegExp `.exec()` calls and child_process imports enumerated in section 3.
- 10 HOOK family: signal handlers and CI-script npm commands (ARCH-HOOK-1/2).
- All remaining counts are *.test.* files, benchmarks/, experiments/, docs/cases data files, and
  package-lock.json integrity hashes.

### Negative claims and what was searched

Searched all production .mjs/.js/.json under archify/bin, archify/delta, archify/renderers,
archify/scripts, archify/schemas, archify/recipes, integrations/deepseek-harness, and scripts/
(207 files scanned by tool, 2.97 MB; all production files additionally read): no eval/new
Function/vm; no `shell:true`; no base64-decoded-then-executed blobs; no zero-width or homoglyph
characters (programmatic scan); no minified bundles or sourcemaps outside the two banner-marked
generated files whose generators are checked in and CI-pinned; no telemetry endpoints; no reading of
.ssh, .aws, ~/.claude, ~/.codex, opencode auth.json, keychains, or browser profiles; no env
enumeration; no timers/intervals doing deferred network work (preview poller talks only to its own
loopback server); no install-time lifecycle hooks in either package.json.

Provenance verification performed: downloaded the published tarball, re-hashed it
(sha512 matches registry `dist.integrity`), extracted, and diffed: `lib/index.js` and
`cordis.patch.yml` byte-identical to both HEAD and tag `fc6e8aca`; `skills/archify/**` byte-identical
to the tag tree except the pack script's documented exclusions (pack.mjs:50-67 strips scripts/
generators, test/, package-lock.json, and package.json scripts/devDependencies). Published tarball is
skill v2.14.0 (tag-era); HEAD skill is v2.15.0 - the audit covers both trees and found no capability
delta in the security-relevant surface (HEAD adds the brand-capture feature described in sections 3
and 9; the tag-era tarball contains no network client at all).

## 5. What we could not check

- **No npm provenance on the package.** Unlike modlens, `@tt-a1i/archify-dsh@0.1.0` carries no SLSA
  attestation and no `gitHead`. Correspondence rests on our byte-level diff of tarball vs tag, which
  is strong for this revision but does not prove *how* the publish was produced. The repo contains no
  npm-publish workflow (.github/workflows/dsh.yml runs tests and three-platform acceptance only;
  release.yml builds the zip only), so publishing appears manual. Publish date 2026-08-14; single
  maintainer `tt-a1i <2801884530@qq.com>`, matching the sponsor contact on README.md:45.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  not available here). Static review covered the same surfaces but cannot rule out
  environment-dependent behavior.
- **DSH runtime interaction.** The cordis.patch.yml inserts `@deepseek-ai/dsh-skill-filesystem`
  configured by the patch; what the host does with the provider between boot and skill invocation is
  upstream behavior outside this artifact.
- **Agent-mediated execution.** The skill instructs agents to run `node bin/archify.mjs ...` commands.
  A malicious or injected instruction to the hosting agent could still aim arbitrary shell commands at
  DSH's ordinary shell tool; archify cannot cause this, but also cannot prevent it. This is inherent
  to every shell-using skill.
- **Peer/runtime surface** of the DSH developer preview itself (`@deepseek-ai/dsh@0.1.0-rc.6`).
- **Windows-specific paths** (System32 tar resolution, PowerShell opener) were read but not executed.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner disagreed with the manual
verdict (machine F vs human B); both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/tt-a1i/archify /tmp/archify-audit
cd /tmp/archify-audit && git rev-parse HEAD   # expect af45e517fb9441e769593c1bf0a6395de1acb7ca

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/archify-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '1,21p' integrations/deepseek-harness/lib/index.js          # whole adapter: path math only
cat integrations/deepseek-harness/cordis.patch.yml                 # one skill provider insert
grep -rn "child_process\|fetch(\|node:http\|node:https\|node:net" \
  integrations/deepseek-harness/lib                                # adapter egress/exec: none
sed -n '80,136p' archify/renderers/shared/brand-marks.mjs          # SSRF blocklists + shape guards
sed -n '178,230p' archify/renderers/shared/brand-marks.mjs         # IP pinning + redirect caps
grep -n "listen(0, loopbackHost" archify/bin/preview.mjs           # loopback-only server
grep -rn "postinstall\|preinstall\|\"prepare\"" --include=package.json .

# 4. Confirm the published artifact corresponds to this tree
npm view @tt-a1i/archify-dsh@0.1.0 dist.integrity
#   expect sha512-D8fDqV6DV/vo80Gj/3rgidd+hwBbhTVncaVoD5Uhh+DbgYlEoQQOmBVbhU5HW33wE5OqJP/2HkTRPJ0hf7W0tA==
curl -sL https://registry.npmjs.org/@tt-a1i/archify-dsh/-/archify-dsh-0.1.0.tgz | shasum -a 512 -c -
#   then extract and diff lib/index.js against integrations/deepseek-harness/lib/index.js
```

## 8. Methodology and pinned inputs

- Subject: git commit `af45e517fb9441e769593c1bf0a6395de1acb7ca` (shallow clone at
  reference/audits/archify); release tag `archify-dsh-v0.1.0` -> `fc6e8aca1829a02af0f0efdc193a87c3754d373c`
  fetched separately and diffed against HEAD and the published tarball.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`.
- Review: full manual read of integrations/deepseek-harness/{lib/index.js,cordis.patch.yml,README.md,
  package.json}, scripts/{distribution-acceptance.mjs,pack.mjs,resolve-cli.mjs}, its test suite
  (adapter-security, tarball-contract, zero-regression), archify/bin/{archify.mjs,preview.mjs,
  open-artifact.mjs,visual-check.mjs}, archify/renderers/shared/{brand-marks.mjs,repository-evidence.mjs,
  diagnostics.mjs}, archify/SKILL.md, assets/template.html, generated-brand-marks.mjs and
  generate-{brand-marks,validators}.mjs provenance chains, .github/workflows/{ci,dsh,release}.yml,
  LICENSE, README.md; plus tarball extraction and byte-level diffs.
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no critical/high production findings after adjudication; declared egress present,
  documented in-repo, and user-visible (B band). Caps applied: single-reviewer note; missing npm
  provenance is compensated by direct tarball-vs-tag verification but keeps this at B rather than A
  territory regardless (A requires full pipeline reproducibility we did not run).

## 9. Strengths

1. Minimal host surface: the entire DSH-loaded payload is 21 lines of path resolution with no I/O of
   any kind (lib/index.js:1-21), and the project ships a test that fails if that ever regresses
   (adapter-security.test.mjs:14-23 asserts no child_process, no http/net, no credentials, no timers,
   no tool registration in lib/).
2. Exemplary SSRF defense on the one real network feature: layered private-range blocklists covering
   IPv4-mapped and NAT64 forms, metadata-style hostnames and nonstandard ports refused, DNS resolved
   once then socket-pinned to close rebinding, redirects fully revalidated per hop, strict size and
   content-type limits with magic-byte verification (brand-marks.mjs as cited above).
3. Injection discipline: every spawn uses array argv with shell disabled; the Windows opener passes
   the target through the argument array with an explicit comment banning interpolation
   (open-artifact.mjs:19-27, shell:false at :47); no `shell:true` exists in the tree.
4. Supply-chain self-policing: tarball contract test forbids test/tooling files in the artifact,
   generated files are regenerated-and-compared in CI (`check:brand-marks`, `check:validators`),
   release workflow refuses tag/version drift and verifies the committed zip equals a fresh build.
5. Honest scoping: the integration README states exactly what the bundle does not do (telemetry,
   network client, credentials, background service, hooks) and labels the product community,
   not official DeepSeek.

## 10. Residual risks

1. The published tarball has no cryptographic binding to the repo (no attestation/provenance);
   correspondence was established manually for v0.1.0 only. A future version must be re-verified or
   published with provenance.
2. `brands capture` fetches whatever URL the conversation supplies. Guards are strong but the feature
   is a deliberate request-driven fetch of attacker-influenceable content if a user pastes a hostile
   link; responses are parsed as HTML for favicon discovery (bounded, signature-checked images only).
   An undocumented env override `ARCHIFY_BRAND_ALLOW_PRIVATE=1` disables the private-address guards
   (brand-marks.mjs:124,152) - intended for tests; not mentioned in any doc.
3. Agent-mediated execution: the skill works by instructing the hosting agent to run node/git/chrome.
   Prompt injection from analyzed repositories or pasted Mermaid could steer the *host agent's*
   broader toolset; archify bounds its own commands but not the agent's other powers.
4. Generated diagrams load Google Fonts from fonts.googleapis.com when viewed online, so "fully
   self-contained" holds functionally (system-font fallback) but not network-wise.
5. Repository-evidence mode runs git against a user-named checkout and embeds verified source links;
   read-only by construction, but it will surface local repo state (origin, commit graph) into the
   diagram receipt.
6. Single maintainer (`tt-a1i`), young project (first commits late July 2026), fast release cadence:
   re-vetting cadence should be tight relative to older plugins.

## 11. Re-verify steps

1. Re-run step 7 block above against current HEAD; any new literal URL, new child_process import in
   lib/ or bin/ without array-argv review, or any new lifecycle hook requires a new revision.
2. Diff `npm view @tt-a1i/archify-dsh dist.integrity` for the newest version against a fresh
   download-and-extract; require tarball-vs-tag correspondence before carrying the grade forward.
3. Watch for: changes to cordis.patch.yml beyond the single provider insert, any dependency added to
   integrations/deepseek-harness/package.json (currently none), any weakening of the
   brand-marks.mjs guard chain, and any new `shell:true` or string-concatenated command construction.
4. Re-run scanner after heuristics-corpus bumps; corpus digest is recorded in section 8.
