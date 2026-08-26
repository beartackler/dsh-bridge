# Trust Report Card: dsh-routing-suite

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-routing-suite` (two components: `@dsh-external/dsh-super-injector` runtime injector + `dsh-router-standard`/`router-spec` agent presets) |
| Pinned subject | github:yjh051108/dsh-routing-suite @ commit `21a7260d961571c77a11705d2b0e6cf7015cc48b` (default branch head, cloned 2026-08-26) |
| npm integrity | Not published to npm; distributed as git clone plus GitHub Release tgz files referenced by README |
| Provenance | Git clone directly from the source repository; no published artifact comparison performed |
| License | BSD-3-Clause declared in injector/package.json:36; LICENSE file at repo root |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **D** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Risky rather than hostile: no third-party egress, no telemetry, and no obfuscation were found anywhere in shipped code, but installation arms an npm `prepare` hook that can fetch an unpinned compiler from the registry, and the product's entire purpose is injecting arbitrary local packages into a running DSH instance - including packages its own "ingest" flow has an AI agent build from any folder you hand it.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None to third parties. The only `fetch` in shipped code targets the host's own web server at the relative path `/super-injector/api` (same-origin loopback) (injector/src/client/index.ts:24, 48). Registry URLs exist only in lockfiles. | grep of all URL literals in src/ and preset/ |
| Loopback HTTP routes | Registers `/super-injector/api` prefix route on the host web server with GET `/list`, POST `/uninstall`, POST `/inject`, POST `/ingest`; each POST takes a filesystem directory or package-match string from the request body and mutates the running harness accordingly (injector/src/index.ts:3277-3315). | file:line above |
| Arbitrary code execution (the product) | Loads arbitrary local packages into the live loader via `ctx.loader.import` (injector/src/index.ts:921, 1009, 1164, 1208, 1231, 2329); compiles agent-supplied JavaScript strings into callable functions via `new Function` for its staged-tool feature (injector/src/index.ts:1454 restoring staged tools from disk JSON, 1506 in the `dev_stage_add` tool whose parameter is literally JS source, described as "仅限可信代码"); hot-reloads packages by purging module caches and re-importing. | file:line above |
| Child processes | `spawnSync` wrappers run git, gh CLI, npm, node selftests, and probe `bash --version`, powering its plugin scaffolding/release/self-test tools (injector/src/index.ts:2774 `runCmd`, 2801 bash probe; preset/scripts/sync-preset.cjs:115). Build scripts run tsc/tsdown. | file:line above |
| Credential/path reads | Reads and rewrites `~/.dsh/profiles/*/cordis.patch.yml` for its duplicate-entry repair tool, backing up originals first (injector/src/index.ts:2581 tool description, 2593-2620 implementation). Reads profile `package.json`. The two scanner criticals (`process.env.NODE_ENV` reads at injector/src/index.ts:420 and injector/tsdown.config.ts:22) sit inside generated scaffold template strings and build config - environment inspection for build definitions, not credential theft; adjudicated false positives. | file:line above |
| Filesystem writes | Scaffold generation, junction/symlink creation under profile node_modules, registry/audit/staging JSON under `<DSH home>/super-injector/`, patch backups next to the patch files (injector/src/index.ts throughout; SCAFFOLD_BUILD_SH template at :43-113). | file:line above |
| Install-time hook | `prepare: node scripts/prepare.mjs` (injector/package.json:52) runs automatically on git/github dependency installs; when no prebuilt `lib/` and no local tsdown exist it shells out to `npx --yes tsdown@^0.22.14`, pulling the compiler from npm at install time (injector/scripts/prepare.mjs:62-64). | file:line above |
| Dynamic code execution | Present, deliberate, and documented (see above). This alone caps the grade below B under the trust pipeline. | injector/src/index.ts:1454, 1506 |
| Telemetry / obfuscation | None found. The lone `decodeURIComponent` matches percent-encoded cache keys against a directory path (injector/src/index.ts:618); OBFU findings were lockfile integrity hashes. | negative claims, scope: injector/, preset/ |

Preset side: `router-standard`/`router-spec` are system-prompt and session-flow engineering (phase gating, persona text, tool restriction) with persistence to `stages.json` (preset/router-standard/router-bootstrap-v34.mjs). `router-bootstrap-v34.mjs:24` imports `node:vm` but never uses it (dead import, verified by grep - no `vm.` call in the file). `gitbash-executor.mjs` provides Windows sessions a real Git Bash `shell` service and, by its own admission, declares no sandbox mode, so the preset's bash tool performs no policy checking and steers users to a danger-full-access upgrade when sandboxed execution fails (preset/router-standard/gitbash-executor.mjs:10-17).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.
Raw output: 226 findings (2 critical, 22 high, 6 medium, 196 low), machine grade F. 194 of 226 are
lockfile URLs and integrity hashes. The 32 non-lockfile findings were adjudicated individually;
full raw output preserved at reference/audits/dsh-routing-suite.scan.json.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED critical x2: `process.env.NODE_ENV` in injector/src/index.ts:420 and injector/tsdown.config.ts:22 | False positive as credential access. Line 420 sits inside a template-string scaffold emitted to disk; tsdown.config.ts defines the build. Both inline `NODE_ENV` into generated bundles - a build convention, not secret enumeration. | Lines read directly; surrounding template context read |
| EXEC/HOOK/NET high cluster (loader.import, new Function, spawnSync, prepare hook, same-origin fetch) | Kept as real capabilities, documented in section 3. None connects credentials to network. The F machine grade rests on the cred-plus-net co-occurrence gate, which these false-positive criticals triggered; after adjudication no cred-to-network path exists. | Section 3 table |

### Findings kept (documented behavior driving the grade)

| ID | Severity | Location | Note |
|---|---|---|---|
| ROUTE-HOOK-1 | high | injector/package.json:52; injector/scripts/prepare.mjs:62-64 | Install-time `prepare` hook with unpinned `npx --yes tsdown@^0.22.14` fallback. Trustworthy intent (build the package), but it places an npm fetch inside installation. This is a named D-band trigger in the grading bands. |
| ROUTE-EXEC-1 | high | injector/src/index.ts:1454, 1506 | Agent-supplied JS compiled via `new Function` and persisted to disk, surviving restarts (restoreStaging). Documented as trusted-code-only; nothing enforces that. |
| ROUTE-EXEC-2 | high | injector/src/index.ts:921-2329 | Runtime injection/hot-reload of arbitrary local packages. The advertised product. |
| ROUTE-CRED-1 | medium | injector/src/index.ts:2581-2620 | Rewrites every profile's cordis.patch.yml (with backup, dedupe-only). Powerful write path over harness configuration. |
| ROUTE-SHELL-1 | medium | preset/router-standard/gitbash-executor.mjs:10-17 | Windows bash service intentionally skips sandbox-mode declaration; policy checking is bypassed on that tool by design, with an honest in-file disclosure. |

### Negative claims and what was searched

Read or grepped in full: injector/src/index.ts (3319 lines), injector/src/client/index.ts,
injector/scripts/prepare.mjs, injector/package.json, tsdown.config.ts, install.ps1 (local npm/dsh
assembly only, no downloads beyond npm itself), preset/router-standard/*.mjs, preset/router-spec/*.mjs,
preset/scripts/*. No http(s) literal outside the host-relative API path, github.com release links in
strings, and lockfiles. No eval/vm usage in presets (vm imported, unused). No telemetry beacons, no
scheduled network I/O (both `setInterval` scanner hits at injector/src/index.ts:223, 491 are type
declarations in scaffold templates).

## 5. What we could not check

- **Published Release tarballs.** README directs users to prebuilt tgz attachments (install.ps1:18-20 mentions them). We audited the git tree only; the release assets were not downloaded or compared.
- **Behavioral probe.** No sandboxed load/inject/reload run was performed; Windows-specific paths (junction handling, PowerShell installer) were read but not executed.
- **Router effectiveness claims.** The README's discrimination/convergence percentages are the author's measurements; out of scope for a safety review.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model), which caps this card at C on process
grounds regardless of findings. The substantive grade is D on the install-time-hook and
arbitrary-injection-capability triggers below. The scanner's F disagreed with the human verdict; the
divergence is fully explained by two false-positive credential criticals inside build templates.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/yjh051108/dsh-routing-suite /tmp/route-audit
cd /tmp/route-audit && git rev-parse HEAD   # expect 21a7260d961571c77a11705d2b0e6cf7015cc48b

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/route-audit

# 3. Spot-check the headline claims
sed -n '62,64p' injector/scripts/prepare.mjs      # unpinned npx compiler fetch at install time
sed -n '1500,1510p' injector/src/index.ts         # new Function over agent-supplied source
grep -rhoE "https?://[a-zA-Z0-9./_-]+" injector/src preset --include="*.ts" --include="*.mjs" | sort -u
                                                  # expect: only the relative /super-injector/api path and doc links
grep -n "vm\." preset/router-standard/router-bootstrap-v34.mjs   # expect: no hits (dead import)
```

## 8. Methodology and pinned inputs

- Subject: git commit `21a7260d961571c77a11705d2b0e6cf7015cc48b` (shallow clone at reference/audits/dsh-routing-suite)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...aee999`
- Review: full read of injector/src/index.ts, injector/src/client/index.ts, injector/scripts/prepare.mjs, injector/package.json, injector/tsdown.config.ts, install.ps1, both router presets' bootstrap/core/executors, sync-preset.cjs, README.en.md
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: dynamic code execution present caps at C; install-time hook with unpinned registry fetch and a product whose core is loading unaudited code into the live harness place it in the D band. Nothing hostile found prevents F.

## 9. Strengths

1. Zero third-party egress and zero telemetry in shipped code; all network touching is the host's own loopback server.
2. Unusually defensive engineering around its dangerous core: reload prechecks, self-reload throttles persisted to disk, rollback of failed generations, cache-restoration logic (injector/src/index.ts:955-1010).
3. Honest in-code disclosures, including the gitbash-executor's explicit statement of exactly where its sandbox guarantees stop.
4. The patch-repair tool backs up files before writing and offers a check-only mode (injector/src/index.ts:2590-2592).
5. Self-test tool (`dev_self_test`, injector/src/index.ts:3021) exercises the whole inject/reload/uninject chain and cleans up after itself.

## 10. Residual risks

1. Installing via git triggers the `prepare` build, which may fetch `tsdown@^0.22.14` from npm unpinned at install time; a registry compromise would flow straight into the build executed on your machine. Prefer the prebuilt Release tgz after verifying it.
2. The product normalizes "point the harness at arbitrary code": `dev_inject_plugin` loads whatever you give it, and `/super-injector/api/ingest` spawns an AI session instructed to convert any folder into a built-and-injected plugin (injector/src/index.ts:3250-3256, 3277+). Any prompt injection inside such a folder inherits the session's capabilities.
3. Staged tools persist executable source across restarts and are restored by recompiling it (index.ts:1454); anyone who can write the staging file executes code on next boot.
4. On Windows, the bundled gitbash-executor preset hands sessions an undeclared-sandbox bash service; combined with stage-guided "danger-full-access" upgrades, a confused user can widen the blast radius quickly.
5. Profile-wide patch rewriting touches configuration files for every profile, not just its own.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD; any new absolute URL, new lifecycle script in either package.json, or new `new Function`/eval site must be re-adjudicated before this grade carries forward.
2. Diff injector/package.json scripts against the pinned copy; any added preinstall/postinstall hook is an automatic grade regression.
3. If a Release tgz becomes the recommended install path, download it, extract, and byte-compare `lib/index.js` provenance before trusting this card for that artifact.
4. Re-run the scanner after any rules-corpus bump; digest recorded in section 8.
