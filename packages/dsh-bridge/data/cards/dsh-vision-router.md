# Trust Report Card: dsh-vision-router

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-vision-router` (DSH plugin: whole-turn image routing plus 14-15 vision tools; keyless free vision chain) |
| Pinned subject | github:ysr666/dsh-vision-router @ commit `ba802797e75eaf28ed2d98d6ffa161612a2cfd90` (default branch head at audit time, 2026-08-26 11:37:26 +0800) |
| npm integrity | `sha512-3+9AFt1HAIxAal7D2Piw5x7ESbi4oICyuKq/5lnOS49QgDADafHWu1dHp4dZ0y00gZZ3BVXVyBsy1SiLj6gnBg==` (`registry.npmjs.org/dsh-vision-router/2.0.1`, fetched 2026-08-26) |
| Provenance | npm attestation present (SLSA provenance v1, publisher `GitHub Actions <npm-oidc-no-reply@github.com>`). Registry metadata has no `gitHead`, so the tarball is not bound to a commit by that field. |
| License | MIT (LICENSE:1-3) |
| Popularity | 978 stars (GitHub API, 2026-08-26) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual source review) |
| Revision | 1 |
| Grade | **B-** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Behaves as advertised and is unusually disciplined about consent boundaries, but it is a plugin
whose core function is shipping your images to a third-party endpoint: with no configuration, image
turns go to OVHcloud's anonymous AI Endpoints, which is documented in the README but happens without
a per-use prompt, and the plugin also spawns system binaries (tesseract, screencapture, PowerShell,
xdg-open) and can update itself through the hosting DSH CLI.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (vision) | Default keyless chain posts image bytes to `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` across five models (index.js:2020-2024, presets/ovh.yaml:8). Any other destination is a user-configured `httpProviders` baseURL or a DSH-registered adapter route. Local defaults `http://127.0.0.1:11434/v1` (Ollama) and `http://localhost:1234/v1` (LM Studio) are opt-in and off by default. | file:line above |
| Network egress (metadata) | Update check GETs `<npm_config_registry>/dsh-vision-router/latest`, falling back to `https://registry.npmjs.org`, then `https://api.github.com/repos/ysr666/dsh-vision-router/releases/latest` (lib/update-check.js:10-12, 100-135). Fires once at startup, unprompted (index.js:3286). Read-only; bounded response size. | lib/update-check.js |
| Static endpoint constants | `https://open.bigmodel.cn/api/paas/v4` and `https://opencode.ai/zen/go` are compatibility constants used to *recognize* a user-configured route, not to originate traffic (lib/trusted-vision-hints.js:4, 26-28; lib/catalog-corrections.js:25-45). | file:line above |
| Child processes | `tesseract` for OCR (index.js:1772); `powershell.exe` / `screencapture` / `import` / `scrot` for desktop capture (index.js:7221-7237); `screencapture` once to trigger the macOS privacy prompt (lib/local-vision-stabilizer.js:31); `open` / `explorer.exe` / `cmd.exe start` / `xdg-open` to reveal the log directory (lib/file-logger.js:281-315); `node <dsh-cli> plugin --profile <p> add dsh-vision-router@<v>` for self-update (lib/self-update.js:409-436); `--version` probes in the doctor (lib/doctor-runtime.js:141). All use `execFile`/`spawnSync` with `shell: false`, fixed argv and timeouts. | file:line above |
| Headless browser | `vision_html_screenshot` launches a user-supplied Chrome/Chromium via puppeteer-core, `--no-sandbox --incognito`, and navigates only to a `file://` URL for a local `.html`/`.htm` resolved through DSH's fs service (index.js:7100-7148). | index.js |
| Credential reads | Only `process.env[apiKeyEnv]` where `apiKeyEnv` is a name the user put in their own provider config, after trying DSH's credentials service first (index.js:2318-2327, lib/catalog-corrections.js:227-232, lib/vision-backend-runtime-policy.js:114-115). No env enumeration, no `.ssh`, no `.aws`, no `auth.json` of other tools, no keychain. The DeepSeek native route additionally calls `getOrCreateAnonymousUserId()` from the official DSH package (index.js:26, 2514). | grep of all credential paths |
| Filesystem writes | Session-workspace artifacts through a path-boundary helper that resolves realpaths, writes to a temp file mode 0600 and renames (lib/artifact-boundary.js:151-181); temp PNGs under `os.tmpdir()` for screenshots, unlinked after use (index.js:7205-7208, lib/local-vision-stabilizer.js:27-41); diagnostics log under `<dshHome>/logs/vision-router` (lib/file-logger.js:23). | file:line above |
| Loopback HTTP routes | `/_dsh/vision-router/*` (settings, model capabilities, test-connection, logs, update-check, self-update, screenshot-permission) registered on the host's own web server; mutating routes enforce same-origin/`sec-fetch-site` plus, for self-update, a process-local random bearer token (index.js:7729-7740, lib/file-logger.js:318-330, lib/local-vision-stabilizer.js:409). | file:line above |
| Dynamic code execution | None. No `eval`, `new Function`, or `node:vm` anywhere in index.js, entry.js, lib/, presets/, scripts/ (grep, zero hits). Dynamic `import()` is used for optional native deps (`sharp`, `potrace`, `puppeteer-core`) with static specifiers or worker-passed module URLs the plugin itself constructed (index.js:1606, 1678, 7118). | grep + manual read |
| Telemetry | None. Zero hits for telemetry/analytics/beacon/sentry/posthog/mixpanel across index.js, entry.js, lib/, presets/. The one match is a comment about model repetition (lib/repetition-guard.js:42). | negative claim, scope stated |
| Install-time hooks | None. package.json has no preinstall/postinstall/prepare; only a `test` script. `pnpm.onlyBuiltDependencies: ["sharp"]` restricts native build scripts rather than adding one. | package.json |

Where images go: to the vision backend that resolves first. Order is user-configured DSH adapter
routes, then explicit `httpProviders`, then local Ollama/LM Studio if enabled, then the built-in
anonymous OVH chain, which is the default on a fresh install and is documented as such
(README.md:60, 278). Uploaded images are read through DSH's attachment service by content-addressed
id, never by guessed path, and the format is sniffed from bytes rather than trusted from the
extension (index.js:5939-5983).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 356 findings (6 critical, 316 high, 16 medium, 18 low) over 250 files, machine grade F
with gates `cred-plus-net` and `dynamic-exec-present`. 262 findings are in `tests/`; 94 are in
production code, workflows or manifests. Adjudication below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical x6: `child_process` imported in lib/doctor-runtime.js:1, lib/file-logger.js:4, lib/local-vision-stabilizer.js:1, lib/self-update.js:1, lib/tesseract-exec-compat.js:8,236 | True but not dynamic execution. Every call site was read: fixed executable names, array argv, `shell: false`, `windowsHide: true`, explicit timeouts. No user or browser string is ever concatenated into a command. Kept as findings VR-EXEC-1..4 below rather than dismissed. | lib/self-update.js:429-436, lib/file-logger.js:281-315, lib/doctor-runtime.js:141, lib/local-vision-stabilizer.js:31 |
| Grade cap "dynamic code execution present" | False positive as stated. The `dynamic-eval` rule fires on `child_process` imports, `import()` and `RegExp.prototype.exec`. There is no eval-family construct in the shipped tree. | `grep -rn "eval(\|new Function\|node:vm"` over index.js entry.js lib presets scripts returns nothing |
| Grade cap "cred + net co-occur" (cited files: tests/pi-ai-native-process-restart-contract.mjs, tests/vision-capability-preflight-hardening.test.js) | False positive. Both cited files are tests. In production, credential resolution and egress do co-occur by design (an API key is sent to the endpoint the user configured it for), which is the plugin's function, not a leak. | cited paths are under tests/ |
| OBFU medium x5 (tests/*.mjs, tests/runtime-e2e.test.js:32,583) | False positive. The high-entropy blobs are 1x1 and 2x2 PNG fixtures (`iVBORw0KGgo...`) used as test images. | excerpts read directly |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| VR-NET-1 | medium | index.js:2020-2024 | Default keyless chain uploads user images to OVHcloud anonymous AI Endpoints. This is the headline feature and is documented (README.md:60, 278, 404), but it is on by default and there is no per-turn consent prompt. Anyone handling confidential images must configure a backend or disable `freeFallback`. |
| VR-NET-2 | low | lib/update-check.js:100-135, index.js:3286 | Unprompted startup version check to the inherited npm registry and, on failure, api.github.com. Read-only, bounded, non-blocking, documented (docs/update-check.md). No opt-out flag was found in config; the network call itself reveals that the plugin is running. |
| VR-EXEC-1 | medium | lib/self-update.js:384-436 | Self-update spawns the DSH CLI that already hosts the process. Guarded: profile name regex-validated, profile ownership re-verified immediately before mutation (self-update.js:397-404), `shell: false`, installed manifest re-read afterwards so exit code 0 alone is not success. Triggered only via a POST route requiring same-origin plus a per-process random token (index.js:7729-7740). |
| VR-EXEC-2 | medium | index.js:7183-7238 | `vision_screenshot` captures the whole desktop. Registered only when `desktopScreenshot === true` at boot and re-checked before each capture (index.js:7178, 7200-7204); default is false (README.md:351). PowerShell script embeds the temp path with `'` doubling; the path is plugin-generated, not user input. |
| VR-EXEC-3 | low | index.js:1772 | OCR pipes image bytes to a local `tesseract` on PATH, 60s cap, 32 MB buffer. A hostile PATH entry named `tesseract` would be executed; that is the standard PATH trust model. |
| VR-EXEC-4 | low | lib/file-logger.js:281-315 | "Open log directory" shells out to the platform file manager. `cmd.exe /d /s /c start "" "<dir>"` interpolates a directory path (file-logger.js:299); the value comes from `<dshHome>/logs/vision-router`, not from browser input, so quoting is adequate here but is the weakest string-handling in the tree. |
| VR-EXEC-5 | low | index.js:7134-7148 | puppeteer launched with `--no-sandbox`. Navigation is restricted to a `file://` URL for a local `.html` file that DSH's fs service resolved, and the browser binary is the user's own; still, a malicious local HTML gets an unsandboxed renderer. |
| VR-CRED-1 | low | index.js:2318-2327, lib/catalog-corrections.js:227-232 | Reads `process.env[name]` where `name` is user-supplied config. Bounded to the configured key name; no enumeration. |
| VR-NET-3 | low | index.js:7581 | `GET <baseURL>/models` connection test against whatever baseURL the user entered in settings. User-initiated, 8s timeout, bounded body. A user could point this at an internal host; there is no SSRF allowlist, but the destination is always typed by the user, never derived from image or model output. |
| VR-REM-1 | medium | lib/local-remote-settings-permission.js:1-90, docs/remote-settings.md | Settings can be edited from a non-loopback trusted host, but only after an explicit risk confirmation, and `allowRemoteSettings` is itself excluded from the ordinary remote mutation allow-list. Credential-bearing provider fields stay loopback-only. Off by default. |
| VR-DOC-1 | low | repository root | No SECURITY.md and no dedicated security/privacy document. Privacy-relevant facts are scattered across README.md, docs/update-check.md and docs/remote-settings.md. |

### Scanner noise dismissed (with scope)

- 262 findings in `tests/` and `tests/*.mjs`: fixture URLs (`http://local.test`, `http://custom.test/v1`), PNG fixtures, and spawn calls in test harnesses.
- 10 EXEC hits in `.github/workflows/{ci,native-multimodal-cold-resume}.yml`: CI steps running `spawnSync('pnpm', ['install'])` and importing the built plugin. CI-only, not shipped (`files` in package.json excludes them).
- 1 HOOK hit at .github/workflows/release.yml:179 (`npm install --global npm@11.18.0`): release pipeline, not install-time.
- EXEC family on `RegExp.prototype.exec`: lib/doctor.js:81,123,223,231,235,239; lib/doctor-vision-limits.js:28,37; index.js:2298 (data-URL parsing). Verified individually.
- HOOK family on strings containing "npx" in UI copy and recovery instructions: lib/client.js:201,477,3757; lib/doctor-cli.js:266,278; lib/self-update.js:361,363; lib/profile-pnpm-diagnostics.js:221. Printed advice, not executed.
- HOOK family on `setTimeout`: lib/client.js:2508 (15s catalog timeout), lib/live-model-client-prelude.js:156 (microtask). No deferred beacons.
- NET family on `fetch('/_dsh/vision-router/...')` in browser-side preludes (lib/client.js, lib/settings-ia-client-prelude.js, lib/vision-capability-benchmark-client.js, lib/vision-exact-check-client.js, lib/vision-routing-settings-prelude.js, lib/settings-client-rc8-lifecycle.js): same-origin relative paths back to the plugin's own loopback routes.
- NET low on the SVG namespace `http://www.w3.org/2000/svg` (index.js:1711), FUNDING.yml, package.json repository/homepage and the registry-url in release.yml.
- `lib/client-presentation-boundary-main.js:771 require(id)`: a scoped `require` shim inside the DSH client module loader that forwards to the host's own `require`; it substitutes one known module id and passes everything else through (client-presentation-boundary-main.js:759-773).

### Negative claims and what was searched

Searched index.js (about 7900 lines), entry.js, all of lib/ (about 39,900 lines total across lib/),
presets/, scripts/, cordis.patch.yml, docs/, .github/: no eval / new Function / node:vm; no
base64-decoded-then-executed payload; no obfuscation (sources are unminified, longest line 560 chars
in lib/client.js, all identifiers readable, comments in English and Chinese); no telemetry or
analytics endpoint; no install/postinstall lifecycle scripts; no reads of `.ssh`, `.aws`, browser
profiles, OS keychains or other tools' auth files; no `Object.keys(process.env)` enumeration; no
writes outside the session workspace, tmpdir and `<dshHome>/logs`.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review covered the same surfaces but cannot rule out environment-dependent behavior.
- **Published tarball vs git tree.** The npm 2.0.1 artifact was not downloaded and diffed against this commit. Registry metadata carries no `gitHead`; provenance attestation binds the tarball to a GitHub Actions run, not to a commit this card verified.
- **What OVHcloud does with the images.** The anonymous endpoint's retention and training policy is the vendor's, outside this artifact.
- **Runtime deps** (`potrace`, `puppeteer-core`, `undici`, peer `sharp`) resolved on the user's machine; no OSV snapshot was joined against the lockfile.
- **The full 4,466-line browser bundle** lib/client.js was read by grep for network, exec and credential patterns, not line by line.
- **Cross-model review.** Single reviewer, single model.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on two gates; both were adjudicated down in section 4
(no eval-family construct exists; the cred+net gate cited test files). Both positions are recorded
rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/ysr666/dsh-vision-router /tmp/vision-router-audit
cd /tmp/vision-router-audit && git rev-parse HEAD
#   expect ba802797e75eaf28ed2d98d6ffa161612a2cfd90

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/vision-router-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "eval(\|new Function\|node:vm" index.js entry.js lib presets   # dynamic exec: none
grep -rhoE "https?://[a-zA-Z0-9./_:-]+" index.js lib presets | sort -u  # egress surface
sed -n '2020,2024p' index.js                       # the default keyless OVH chain
sed -n '7176,7180p' index.js                       # screenshot tool registered only when enabled
sed -n '429,436p' lib/self-update.js               # self-update spawn: fixed argv, shell:false
grep -n '"scripts"' -A 3 package.json              # no install-time hooks

# 4. Confirm the published artifact
npm view dsh-vision-router@2.0.1 dist.integrity
#   expect sha512-3+9AFt1HAIxAal7D2Piw5x7ESbi4oICyuKq/5lnOS49QgDADafHWu1dHp4dZ0y00gZZ3BVXVyBsy1SiLj6gnBg==
npm view dsh-vision-router@2.0.1 dist.attestations
```

## 8. Methodology and pinned inputs

- Subject: git commit `ba802797e75eaf28ed2d98d6ffa161612a2cfd90` (shallow clone at reference/audits/dsh-vision-router)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`; 250 files, 32 skipped, 3,099,293 bytes scanned
- Manual review: all 6 scanner criticals at their call sites; index.js sections for provider defaults, credential resolution, attachment reads, artifact writes, OCR, desktop screenshot, HTML screenshot, update-check and self-update routes; lib/{self-update,update-check,file-logger,local-vision-stabilizer,doctor-runtime,tesseract-exec-compat,catalog-corrections,trusted-vision-hints,artifact-boundary,local-remote-settings-permission,client-presentation-boundary-main}.js; package.json; LICENSE; README.md; docs/{update-check,remote-settings}.md; .github/workflows
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no critical or high production findings survive adjudication, and no eval-family or telemetry surface exists (B band). Held at B- rather than B because the default configuration sends user images to a third-party anonymous endpoint with no per-use consent, the startup update check has no visible opt-out, and the project ships no SECURITY.md.

## 9. Strengths

1. Consent gates are real, not decorative: desktop capture is off by default, gated at tool-registration time and re-checked before every capture (index.js:7178, 7200-7204); remote settings editing is off by default, requires an explicit risk confirmation, and cannot itself be enabled through the ordinary remote mutation path (docs/remote-settings.md, lib/local-remote-settings-permission.js).
2. Subprocess hygiene throughout: `execFile`/`spawnSync` only, `shell: false`, fixed executable names, array argv, `windowsHide`, explicit timeouts and maxBuffer. No browser-supplied string reaches a command line.
3. Self-update refuses to guess: it will not offer one-click update unless the running CLI traces to a real `@deepseek-ai/dsh` package, re-verifies profile ownership immediately before mutating, and re-reads the installed manifest afterwards because exit code 0 is not proof (lib/self-update.js:397-404, 452-460).
4. Artifact writes go through a realpath-resolving boundary with 0600 temp files and atomic rename (lib/artifact-boundary.js:151-181); image inputs are resolved by attachment id and format-sniffed from bytes rather than trusted by extension (index.js:5939-5983).
5. Logs are redacted for bearer tokens, `sk-` keys and common credential query/kv shapes before anything is written (lib/file-logger.js:36-50).
6. No telemetry, no obfuscation, no dynamic code execution, no install-time hooks, MIT licensed, published with SLSA provenance.

## 10. Residual risks

1. Default egress: a fresh install sends image bytes to OVHcloud's anonymous endpoint. Documented, but the default is "upload", not "ask". Users with confidential screenshots should configure a local Ollama/LM Studio backend or their own provider before first use.
2. Unprompted startup network call to the npm registry (and api.github.com on failure) with no opt-out flag found in the config surface.
3. Desktop screenshot, once enabled, is a model-callable tool: a prompt-injected agent can ask for a screen capture and then have it recognized. The toggle is the only barrier.
4. `--no-sandbox` Chromium for local HTML capture widens the blast radius of a malicious local HTML file.
5. Self-update executes a package installer. The route is token- and origin-gated, but a successful bypass would install a newer upstream version outside this card's scope.
6. No SECURITY.md, so there is no stated vulnerability-reporting channel.
7. Published tarball not independently diffed against this commit; trust rests on npm attestations.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new literal URL outside `oai.endpoints.kepler.ai.cloud.ovh.net`, `registry.npmjs.org` and `api.github.com` must be re-adjudicated before this grade carries forward.
2. Diff `npm view dsh-vision-router dist.integrity` against the pinned value; mismatch means a new revision is required.
3. On every release, re-check: `package.json` scripts (any new lifecycle hook is a finding), `DEFAULT_HTTP_PROVIDERS` in index.js (a changed default endpoint changes where images go), and the `desktopScreenshot` default in the settings schema.
4. Re-check `lib/self-update.js` argv construction and the `/_dsh/vision-router/self-update` guards after any refactor; that is the highest-consequence code path in the plugin.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
