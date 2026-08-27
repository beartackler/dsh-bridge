# Trust Report Card: Reasonix (`reasonix`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `esengine/DeepSeek-Reasonix` - not a DSH plugin. It is a standalone Go coding agent for the terminal that declares the `dsh` and `dsh-plugin` topics and ships its own plugin/extension system. Graded here because it surfaced in the DSH plugin discovery set; the scope note in section 2 matters more than the grade. |
| Pinned subject | github:esengine/DeepSeek-Reasonix @ commit `c3f5b497d59ca46ffcffa3f4a8d7cd095e330798` (default branch head at audit time, 2026-08-26) |
| npm integrity | `sha512-2d8l6pdBGIgVK74oIBWx5A7NvhshPyz6g...` (`registry.npmjs.org/reasonix/1.31.4`, published 2026-08-25, fetched 2026-08-26) |
| Provenance | Partial. Registry `gitHead` is `97411a34d5e6b91d2104f3f6b4f0a2b0349d3d66`, a commit not reachable in the shallow audit clone, so the published npm version and the audited commit are different revisions. The npm package is a 21-line launcher; the actual agent ships as **prebuilt platform binaries** in six `@reasonix/cli-*` optional dependencies, none of which were audited or reproduced from source. |
| License | MIT, `Copyright (c) 2026 Reasonix Contributors` (LICENSE:1-3) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual source review; full review of a repository this size was not attempted) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile was found and the security-relevant code that was read is unusually careful, but
this is a full coding agent rather than a plugin: it phones home by default under a first-run
consent prompt, its extension system grants sidecars the unfiltered process environment by explicit
design, and what npm installs is a prebuilt binary this audit could not verify against the source it
read.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| Telemetry egress | One documented endpoint, `https://crash.reasonix.io/v1`. Sends a once-per-day install ping plus bounded, fixed-bucket counters from an allowlist of 26 signal names. Default mode is `auto`: enabled on local interactive TTY sessions of release builds. | internal/telemetry/client.go:22-35; docs/GUIDE.md:150-188 |
| Telemetry consent | Fail-closed and asked once. Disabled outright in CI (nine CI env vars checked), in development builds (version must match a release pattern), and when `DO_NOT_TRACK` or `REASONIX_TELEMETRY=0/false/off/no` is set. On the first eligible session the user is shown a notice and a `[Y/n]` prompt before anything is sent; if the choice cannot be persisted, nothing is uploaded. | internal/telemetry/policy.go:10-49; internal/cli/cli.go:2667-2707 |
| Telemetry identifier | A dedicated random 128-bit install ID stored at `<home>/cli-telemetry-install-id` with mode `0600`, generated with `O_EXCL` and rewritten atomically if malformed. Documented as separate from the desktop install ID and not tied to account, hardware, repo, or session. | internal/telemetry/client.go:64-113 |
| Crash reports | Never uploaded automatically. Written locally under `<home>/cli-crash-reports`, capped at 10 files, owner-only, panic value never serialized, paths and arguments stripped, scrubbers run both on save and again before any explicit send. `reasonix report send` is the only path off the machine. | docs/GUIDE.md:190-215 |
| Extension sidecars | A plugin with a `runtime` block spawns a sidecar process that receives the **unfiltered inherited process environment**, stated as an explicit full-trust contract in the code's own comment. Install is the authorization; there is no second confirmation, and `--link` keeps trusting changed content. | internal/extension/sidecar/process.go:163-184; docs/EXTENSIONS.md:8-33 |
| Sidecar exec discipline | The runtime command must resolve to an absolute path (no PATH lookup) and is rejected if it is a shell; args are passed as an argv vector, never through a shell. | internal/extension/sidecar/process.go:144-160, 186-198 |
| Credential-path awareness | `~/.ssh/config` and `~/.ssh/known_hosts` are read for the remote-connect feature, and `known_hosts` is commented as read-only, never written. A `protect_sensitive_files` setting hides `.env`, `.git-credentials`, key files, and `~/.ssh` from read tools. | internal/config/paths.go:329; internal/config/config.go:243; internal/config/render.go:727 |
| npm install path | `reasonix` is a 21-line launcher that `require.resolve`s a platform-specific prebuilt binary and `spawnSync`s it with inherited stdio. It declares **no** install scripts. | npm/reasonix/bin/reasonix.js:1-21; registry `scripts: null` |
| Self-update | The CLI has an `upgrade`/`update` path that replaces its own binary (dev builds excluded). Not exercised in this audit. | internal/i18n/i18n.go:551-554; internal/cli/hide_windows.go:8 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`. Raw output: **2387 findings**
(21 critical CRED, 708 high, 56 medium, 1602 low) across a repository of a Go agent, an Electron
desktop frontend, a marketing site, and Cloudflare workers. Machine verdict F, off `cred-plus-net`,
`dynamic-exec-present`, and `finding-density`. Manual adjudication follows.

### Critical findings adjudicated (all 21)

Every one is a `credential-access` hit on the string `~/.ssh/...`, and every one lands in one of
three inert categories:

| Group | Count | Adjudication | Evidence |
|---|---|---|---|
| UI strings in localization files | 9 | Placeholder and label text in English, Simplified Chinese, and Traditional Chinese for the remote-host wizard, e.g. "Identity file path, e.g. ~/.ssh/id_ed25519" and "Import from ~/.ssh/config". Display copy; executes nothing. | desktop/frontend/src/locales/en.ts:121, 1553, 1574; zh.ts:122, 1555, 1576; zh-TW.ts:110, 1221, 1242 |
| Test fixtures | 10 | Fake paths in frontend tests, including a test asserting that a masked known-hosts path is **hidden** from the primary error card and shown only in the security dialog. | desktop/frontend/src/__tests__/remote-error-ux.test.tsx:61-114; remote-connect-wizard.test.tsx:47, 151, 237, 244; remote-hosts-page.test.tsx:60; remote-store.test.ts:131 |
| Generated bridge stub | 1 | `async PickRemoteIdentityFile() { return "~/.ssh/id_ed25519"; }` - a browser-mode stub returning a canned value where the native picker would run. | desktop/frontend/src/lib/bridge.ts:5639 |
| CI secret reference | 1 | `AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}` in the release workflow, uploading artifacts to R2. A maintainer-side GitHub secret; it never ships. | .github/workflows/release.yml:320 |

The real `~/.ssh` reads are the remote-connect feature, and they are documented as such: config
aliases are imported on request via `reasonix remote import`, and `known_hosts` is read-only
(internal/config/paths.go:329, internal/cli/remote.go:226-237).

### High findings, by concentration

The top ten files by high-severity count are `site/package-lock.json` (70), the generated
`desktop/frontend/src/lib/bridge.ts` (68), `release-notes/releases.json` (51), the SWE-bench
fixture `benchmarks/swebench/subset.json` (42), `site/src/data/contributors.json` (41),
`workers/crash-report/package-lock.json` (39), and five test files. These are lockfile registry
URLs, generated bindings, benchmark data, and test fixtures - not agent behavior. The 12 high HOOK
findings are `npx -y ...` strings appearing in MCP-server placeholder copy and in build-contract
assertions such as `assert.match(content, /npm i(?:nstall)? -g pnpm@10/)`
(scripts/check-desktop-build-contract.mjs:68), not executed installs.

### The gates, adjudicated

- **`cred-plus-net`** names 13 modules, of which 9 are maintainer scripts under `scripts/` and
  `site/scripts/` (release-note generation, star history, contributor fetch) and 3 are locale files.
  The one substantive module is the telemetry client, and its credential-adjacent read is the
  install ID it generates itself. Not exfiltration.
- **`dynamic-exec-present`** fires on the Go agent's process execution, which is the product: a
  coding agent runs commands. The relevant question is discipline, and on the extension path the
  discipline is good (absolute path required, shells rejected, argv vector, no PATH lookup -
  internal/extension/sidecar/process.go:144-160).
- **`finding-density`** measures repository size here, not spread of a capability.

### What was verified against the published artifact

- `npm view reasonix@1.31.4 scripts` returns `null`: no `preinstall`, `install`, `postinstall`, or
  `prepare`. The tarball contains exactly three files: `bin/reasonix.js`, `package.json`,
  `README.md`.
- `bin/reasonix.js` was read in full (21 lines). It resolves `@reasonix/cli-${platform}-${arch}`,
  prints an actionable error if absent, and `spawnSync`s the binary with `stdio: "inherit"`. No
  network call, no environment manipulation, no fallback download.
- Registry `gitHead` `97411a34` does not match the audited head `c3f5b497`.

## 5. What we could not check

- **The thing users actually run.** `npm i -g reasonix` installs a prebuilt binary from
  `@reasonix/cli-<platform>-<arch>`. Those binaries were not downloaded, disassembled, or
  reproduced from the Go source this card read. Every behavioral claim above describes *source at
  commit `c3f5b497`*, and the published binaries are built from `97411a34`. This is the single
  largest gap in this card and the main reason it is not a B.
- **Coverage.** This repository is a Go agent plus an Electron desktop app plus a website plus
  Cloudflare workers. The review was targeted (telemetry, extension sidecar exec, credential paths,
  npm launcher, security policy), not exhaustive. Large areas - the tool sandbox, the permission
  model, the bot gateway, the MCP launcher, the updater - were not read.
- **Desktop app and crash-report worker.** `workers/crash-report/` has its own Firebase
  configuration and a documented runbook asserting client reads and writes are denied
  (docs/DESKTOP_CRASH_DIAGNOSTICS_RUNBOOK.md:14). Not verified against the live rules.
- **Telemetry payload at runtime.** The upload allowlist was read
  (internal/telemetry/client.go:24-35) and the documented exclusions are extensive, but no traffic
  capture was performed to confirm the wire format matches the documentation.
- **Behavioral probe.** No sandboxed run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner returns F; this card returns C. The disagreement is almost
entirely scale: 21 critical findings that are all UI strings, test fixtures, or a CI secret
reference, and 708 high findings concentrated in lockfiles and generated code. Recording the
machine verdict matters here precisely because the raw number is alarming and the underlying
evidence is not.

The C is not a near-miss B. It is the documented ceiling for a subject whose shipped artifact could
not be examined (INDEX.md grading bands: "this is also the ceiling for anything the pipeline could
not fully examine").

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/esengine/DeepSeek-Reasonix /tmp/reasonix-audit
cd /tmp/reasonix-audit && git rev-parse HEAD   # expect c3f5b497d59ca46ffcffa3f4a8d7cd095e330798

# 2. Re-run our scanner (expect ~2387 findings; read section 4 before reacting to the number)
node tools/scan/dist/index.js /tmp/reasonix-audit   # from a dsh-bridge checkout

# 3. Check the 21 criticals yourself - every one should be a locale string, a test, or CI
grep -rn '\.ssh' internal --include=*.go | grep -v _test      # the real reads: remote-connect only
sed -n '325,332p' internal/config/paths.go                    # known_hosts is read, never written

# 4. Telemetry: one endpoint, fail-closed policy, explicit consent
sed -n '20,36p'  internal/telemetry/client.go                 # endpoint + the 26-signal allowlist
sed -n '10,49p'  internal/telemetry/policy.go                 # CI, dev builds, DO_NOT_TRACK, REASONIX_TELEMETRY
sed -n '2667,2707p' internal/cli/cli.go                       # the one-time [Y/n] prompt
DO_NOT_TRACK=1 reasonix ...                                   # opt out without touching config

# 5. Extension sidecars are full trust - confirm the contract in the code, not the docs
sed -n '144,198p' internal/extension/sidecar/process.go       # absolute path, no shell, UNFILTERED env

# 6. Confirm the provenance gap
npm view reasonix@1.31.4 gitHead scripts                      # gitHead 97411a34..., scripts null
cd /tmp && npm pack reasonix@1.31.4 && tar -tzf reasonix-1.31.4.tgz
#   expect exactly bin/reasonix.js, package.json, README.md - the agent is not in this tarball
```

## 8. Methodology and pinned inputs

- Subject: git commit `c3f5b497d59ca46ffcffa3f4a8d7cd095e330798` (shallow clone at
  reference/audits/DeepSeek-Reasonix)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`
- Review: targeted manual read of internal/telemetry/{client,policy,sink}.go,
  internal/cli/cli.go telemetry consent path, internal/extension/sidecar/process.go,
  internal/config credential-path handling, npm/reasonix/bin/reasonix.js, npm/reasonix/package.json,
  SECURITY.md, LICENSE, docs/{GUIDE,EXTENSIONS}.md; plus download and full read of the published npm
  tarball. All 21 critical findings individually inspected. **Not** a full-repository read.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no malicious indicator found on any surface examined, and the code that was read
  is careful. Capped at C by the pipeline's own rule for subjects that could not be fully examined:
  the installed artifact is a prebuilt binary built from a different commit than the one audited,
  coverage was partial on a repository of this size, no S4 probe ran, and there was no cross-model
  review. Default-on telemetry - consented, documented, and easy to disable - is a C-band trait
  under our bands, not a D one, because the consent prompt precedes the first request and three
  independent opt-outs exist.

## 9. Strengths

1. Telemetry policy is fail-closed and reads like someone thought about it adversarially: release
   version pattern required, nine CI variables checked, `DO_NOT_TRACK` honored alongside a
   product-specific variable, and consent that cannot be silently assumed - an unsaveable preference
   means nothing is uploaded (internal/telemetry/policy.go:10-49; internal/cli/cli.go:2699-2703).
2. The documented data boundary is specific and negative, naming what is never uploaded: prompts,
   answers, reasoning, tool names and arguments, paths, repositories, session IDs, exact token or
   cost values, provider and model names, base URLs, environment variables (docs/GUIDE.md:186-189).
   The 26-name upload allowlist in code is consistent with it (internal/telemetry/client.go:24-35).
3. Crash reports are local-first by default with double scrubbing and an explicit send command;
   piped invocations preview only and never prompt (docs/GUIDE.md:190-215).
4. Sidecar exec discipline: absolute path required, PATH lookup refused, shells rejected by name,
   argv passed directly (internal/extension/sidecar/process.go:144-160).
5. The full-trust boundary is stated in the code comment and in the docs, in capitals, before a user
   can install a runtime extension (internal/extension/sidecar/process.go:163-167;
   docs/EXTENSIONS.md:12-15, 29-33). Naming your own weakest boundary is the behavior this catalog
   wants to reward.
6. The npm launcher declares no lifecycle scripts and ships three files. Nothing runs at install
   time.
7. SECURITY.md gives a private reporting path, names the surfaces to identify, and asks reporters
   not to send real credentials (SECURITY.md:17-40).

## 10. Residual risks

1. **You install a binary this card did not read.** The audited source and the published artifact
   are different commits, and the artifact is compiled. Nothing here proves the binary matches the
   Go source above.
2. **Runtime extensions are full trust and get your whole environment.** `runtimeEnv` passes the
   unfiltered `os.Environ()` to the sidecar (internal/extension/sidecar/process.go:169), so every
   API key in your shell is visible to any code extension you install. Install is the authorization;
   there is no second prompt, and `--link` keeps trusting changed content.
3. **Telemetry is on by default** for interactive release-build sessions once consented. It is
   content-free by documentation and by the code allowlist, but it is a network call the user did
   not initiate. Set `DO_NOT_TRACK=1` or answer `n` if that is not acceptable.
4. **Self-update replaces the binary.** Not exercised in this audit; treat the update channel as an
   unverified path.
5. **Scope mismatch.** This is a coding agent that can read files, run commands, and reach the
   network on your behalf. Grading it alongside single-purpose DSH plugins compares different
   objects; the C should be read as "a large, partially examined agent" rather than "a plugin with
   problems".
6. **Partial coverage.** The permission model, tool sandbox, bot gateway, and MCP launcher were not
   reviewed. Absence of findings in unread code is not evidence.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD, then re-inspect every critical finding. The
   adjudication above holds only while all of them remain locale strings, tests, and CI references;
   a single critical in `internal/` is a stop-ship signal for this grade.
2. Diff `internal/telemetry/` on every bump. A new endpoint, a signal name outside the 26-entry
   allowlist, or any weakening of `policy.go` invalidates section 3.
3. Re-read `internal/extension/sidecar/process.go`. If `runtimeEnv` ever gains filtering, that is a
   real improvement worth recording; if the absolute-path or no-shell checks are relaxed, the grade
   must drop.
4. If reproducible builds ever land for the `@reasonix/cli-*` binaries, rebuild and compare. That
   alone would lift the main cap on this card.
5. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
6. Re-vet at 90 days or on any new `reasonix` release, whichever comes first. Given the release
   cadence visible in `release-notes/releases.json`, expect this card to go stale quickly.
