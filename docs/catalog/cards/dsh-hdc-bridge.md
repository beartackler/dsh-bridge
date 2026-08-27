# Trust Report Card: dsh-hdc-bridge

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-hdc-bridge` (HarmonyOS developer assistant: hdc device tools, a web device panel, bundled offline docs, optional DevEco CLI backend) |
| Pinned subject | github:1na-ko/dsh-hdc-bridge @ commit `767f29500500ca344eea3275d923c5ea6e50f2cf` (default branch head at audit time, 2026-08-27) |
| npm | `dsh-hdc-bridge@0.8.0`, integrity `sha512-plJ+4RZHpELMyyXY2wBwF5XqLvkjP0HVAjhro5OBIeDq8mBT4GlQGC0fpxNc5Xr6VIvai9WAc/7XOt3JNpvByg==` (fetched 2026-08-26); repo version is also `0.8.0` |
| Provenance | Not checked (no attestation query performed) |
| License | MIT (LICENSE), with THIRD_PARTY_NOTICES.md and notices.json covering bundled CC-BY-4.0 OpenHarmony documentation |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

This is a local-toolchain plugin with no outbound network calls at all: every URL in the bundle is
printed advice or provenance metadata, credentials are never touched, and the knowledge layer is
shipped offline with per-file source hashes; the capabilities that matter are that it runs `hdc`
against connected devices and registers four unauthenticated loopback panel routes, one of which
triggers device screenshots into the system temp directory, which is a modest and disclosed
surface rather than a hidden one.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None at runtime. There is no `fetch`, no `http`/`https` client, no socket in `lib/`. Every URL literal is either printed guidance (developer.huawei.com install hints, AGC certificate docs) or provenance metadata in `knowledge/index.json` and `notices.json`. Verified by grep across all of `lib/`. | grep of lib/*.js lib/*.mjs; lib/host.js:145-150; lib/errors.mjs:21 |
| Child processes (panel) | `execFile` on the resolved `hdc` binary with a fixed read-only command set: `list targets -v`, `param get <const.*>`, `hidumper -s 3302`, `cat /proc/meminfo`, `df -h /data`, screenshot capture and file receive. Hard timeouts, output byte caps, a 45s watchdog, `windowsHide`. | lib/panel.mjs:12, 30-45, 62-76, 82-115, 204-273 |
| Child processes (tools) | The tool layer does not spawn directly; it builds command strings and hands them to the host's `shell` service under the calling session's sandbox policy, with the session's workspace as workdir. | lib/host.js:15, 48-56, 29-40 |
| Device command execution | `hdc_shell` passes a caller-supplied command to the connected device's shell (quoted, with an unquoted-argv retry on failure). That is the product: arbitrary command execution on the attached HarmonyOS device, not on the host. | lib/host.js:177-180 |
| Loopback HTTP routes | Four routes on the host's own web server: `GET /api2/hdc-bridge/panel-state`, `POST /api2/hdc-bridge/refresh`, `POST /api2/hdc-bridge/select`, `GET /api2/hdc-bridge/screenshot.jpeg`. Method checks are present; there is no auth, no Origin check, and no Host check. | lib/panel.mjs:276-311 |
| Filesystem writes | Device screenshots into `$TMPDIR/dsh-hdc-panel/` (panel) and `dsh-shot-*` files under a shell-created directory, with a retention sweep keeping the newest 10. Screenshot bytes are also cached in memory for the `screenshot.jpeg` route. | lib/panel.mjs:88-90; lib/host.js:97-140 |
| Credential access | None. No auth-file reads, no environment enumeration, no keychain. The scanner reported zero CRED findings and grep confirms. | scan output; grep of lib/ |
| Dynamic code execution | None in shipped code. `import { execFile }` and the dynamic `import()` calls flagged by the scanner are, respectively, a normal Node import and cache-busting imports inside `scripts/smoke.mjs`, which is not in the package `files` list. | lib/panel.mjs:12; scripts/smoke.mjs:51,186,279,298; package.json `files` |
| Telemetry | None. No analytics, beacons, or metrics anywhere in `lib/`. | grep of lib/ |
| Lifecycle hooks | None. The only script is `license-check`, run manually. | package.json:31-33 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 71 findings (1 critical, 63 high, 6 medium, 1 low), machine grade F, gates
`dynamic-exec-present` and `finding-density`. 23 files scanned, 45 skipped.

### Scanner criticals and highs adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical, lib/panel.mjs:12 "Imports child_process" | True but not a defect. The panel deliberately spawns `hdc` directly instead of going through the session-bound shell, because it must work outside any session. The command set is fixed and read-only. Kept as HDC-EXEC-1 at medium. | lib/panel.mjs:12, 62-76 |
| EXEC high, lib/panel.mjs:35, 65 | The two `execFile` call sites. Same fact as above. Arguments are internal constants plus a device id that is validated against the connected-target list before use (`select` route) or comes from `hdc list targets` output. `paramGet` output is additionally regex-scrubbed and truncated. | lib/panel.mjs:82-84, 292-300 |
| NET high x31, `knowledge/index.json`, `knowledge/meta.json`, `notices.json` | False positives. These are provenance records: source URL, source commit, and sha256 per bundled documentation file. Data, never fetched. | knowledge/index.json; lib/knowledge.mjs:1-10 |
| NET high, lib/client.js:162, 174, 181 | Browser-side `fetch` to the plugin's own loopback routes (`/api2/hdc-bridge/*`). Same-origin panel polling, not egress. | lib/client.js:159-185 |
| NET high, lib/host.js:145, 1015; lib/errors.mjs:20; lib/skills.mjs:28 | Huawei documentation URLs inside human-readable hint strings ("register the device UDID in AGC", "download Command Line Tools"). Printed, never requested. | file:line |
| HOOK high, lib/devecocli.mjs:50; lib/host.js:901; lib/skills.mjs:37 | The literal text `npm i -g @deveco/deveco-cli` inside advice strings. The plugin never invokes a package manager. | lib/devecocli.mjs:50 (CLI_HINT constant) |
| EXEC high x4, scripts/smoke.mjs:51,186,279,298 | Dev-only test harness using `import(url + '?t=' + Date.now())` to defeat the module cache. Not in the published `files` list. | scripts/smoke.mjs; package.json:20-30 |
| OBFU medium x4, lib/client.js:20, lib/knowledge.mjs:22, lib/panel.mjs:140, scripts/build-knowledge.mjs:183 | `String.fromCharCode(10)` / `(13)` used to build newline patterns without backslash escapes, with comments explaining why. Consistent, documented, not concealment. | lib/knowledge.mjs:21-23 |
| SUPPLY high, package.json:8 | The `repository.url` git URL. Metadata, not a dependency source. This package declares no dependencies at all. | package.json:5-9 |
| NET/OBFU, scripts/build-knowledge.mjs | Build-time tool that fetches OpenHarmony docs to regenerate `knowledge/`. Maintainer-side, not shipped (`files` excludes it, listing only `scripts/license-check.mjs`). | package.json `files`; scripts/build-knowledge.mjs |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| HDC-EXEC-1 | medium | lib/panel.mjs:12, 30-45, 62-76 | Direct `child_process.execFile` outside the host sandbox. Justified by the panel's lifecycle, bounded by a fixed read-only command list, timeouts, and output caps, but it is a real bypass of the session policy that the tool layer respects. |
| HDC-AUTH-1 | medium | lib/panel.mjs:276-311 | The four panel routes have no authentication and no Origin or Host check. `POST /refresh` with `{shot:true}` causes a device screenshot; `GET /screenshot.jpeg` returns the last captured screen of the developer's device. Any local process, and any web page if the host serves permissive CORS, can pull a device screenshot. |
| HDC-DEV-1 | medium | lib/host.js:177-180 | `hdc_shell` executes caller-supplied commands on the connected device. Intended behavior, but a prompt-injected agent gets a shell on the attached phone or emulator. |
| HDC-FS-1 | low | lib/panel.mjs:88-90; lib/host.js:97-140 | Screenshots of the device screen are written to the system temp directory (world-readable on shared machines) and retained ten deep. |
| HDC-SEC-1 | low | repository root | No SECURITY.md and no disclosure policy, despite the plugin driving physical devices. |

### Negative claims and what was searched

Read in full: `lib/panel.mjs` (313 lines), `lib/knowledge.mjs`, `lib/errors.mjs`, `lib/devecocli.mjs`,
`lib/skills.mjs`, `cordis.patch.yml`, `package.json`, `scripts/license-check.mjs` (opening section).
Read selectively: `lib/host.js` (1439 lines) at the service wiring, sandbox policy resolution,
quoting helper, screenshot flow, `hdc_shell`, `hms_*` CLI paths, and panel startup; `lib/client.js`
at the fetch sites. Grepped all of `lib/` for `fetch`, `http`, `https`, credential paths, `eval`,
`new Function`, `vm.`, telemetry keywords: no hits outside the adjudications above.

## 5. What we could not check

- **Behavioral probe.** Nothing was installed, loaded, or run. No HarmonyOS device, emulator, `hdc` binary, or DevEco toolchain was present, so the device paths were read, never exercised.
- **`lib/host.js` was not read line by line.** Roughly 1400 lines of tool definitions were reviewed at the sites that matter for egress, spawning, quoting, and policy, plus a full-file grep for dangerous primitives. An injection bug inside an individual `hms_*` argument builder could have been missed.
- **Command-injection resistance of `psQuote`.** The helper single-quotes and doubles inner quotes (`lib/host.js:46`), which is correct for PowerShell and for POSIX `sh` single-quoting only because the doubling case cannot occur there; this reasoning was not fuzzed or tested against a shell.
- **Whether the host's `webServer` authenticates plugin routes.** The plugin adds none itself. If DSH gates `/api2/*`, HDC-AUTH-1 weakens.
- **Published artifact vs source.** No tarball download, no byte comparison, no provenance check.
- **The bundled knowledge corpus.** `knowledge/` carries per-file source URLs and sha256 values; none were re-fetched or re-hashed, so the claim that the bundled docs are unmodified OpenHarmony excerpts is the project's, not this card's.
- **`scripts/license-check.mjs` was not executed.**

## 6. Reviewer disagreement

Single-reviewer pass, one model. The scanner graded F, driven almost entirely by provenance JSON
and by advice strings containing URLs and the characters `npm i`. The manual grade is B. Both are
recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/1na-ko/dsh-hdc-bridge /tmp/hdc-audit
cd /tmp/hdc-audit && git rev-parse HEAD   # expect 767f29500500ca344eea3275d923c5ea6e50f2cf

node tools/scan/dist/index.js /tmp/hdc-audit   # from a dsh-bridge checkout

grep -rn "fetch(\|require('http\|from 'node:http" lib/    # runtime egress: none
grep -rn "eval(\|new Function\|vm\." lib/                 # dynamic exec: none
grep -rn "auth.json\|\.ssh\|process.env\[" lib/           # credential access: none
sed -n '276,311p' lib/panel.mjs                           # panel routes, no auth check
sed -n '62,76p'   lib/panel.mjs                           # the fixed hdc command runner
sed -n '46,56p'   lib/host.js                             # quoting + sandbox-policy shell path
node -e "console.log(require('/tmp/hdc-audit/package.json').scripts)"  # license-check only
```

## 8. Methodology and pinned inputs

- Subject: commit `767f29500500ca344eea3275d923c5ea6e50f2cf`, shallow clone at `reference/audits/dsh-hdc-bridge`
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full read of panel.mjs, knowledge.mjs, errors.mjs, devecocli.mjs, skills.mjs, package.json, cordis.patch.yml; targeted read of host.js and client.js; grep sweeps described in section 4
- Cross-model review: NOT performed
- Grade derivation: no network egress, no credential access, no telemetry, no dynamic execution, no lifecycle hooks, and behavior matches the documentation. That is A-band structure. Held at B for the unauthenticated panel routes that can capture and serve a device screenshot, the sandbox bypass in the panel's direct spawns, and the absence of a SECURITY.md on a plugin that drives physical hardware. Not A also because roughly 1400 lines of host.js were sampled rather than fully read.

## 9. Strengths

1. Genuinely offline. The knowledge layer ships in-package with per-file source commit and sha256 provenance (`knowledge/index.json`), so documentation lookups never leave the machine.
2. Tool-layer discipline: commands run through the host `shell` service under the calling session's sandbox policy, with the session workspace as workdir (`lib/host.js:29-56`).
3. Defensive panel implementation: hard timeouts, `maxBuffer` caps, a 45-second watchdog, in-flight deduplication, a four-device cap, and regex-scrubbed device property output (`lib/panel.mjs:20-26, 82-84, 270-273`).
4. The `select` route validates the requested target against the live connected list before accepting it (`lib/panel.mjs:292-300`).
5. License hygiene taken seriously: THIRD_PARTY_NOTICES.md, notices.json, and a zero-dependency `license-check.mjs` gate with an explicit allowlist and a copyleft denylist.
6. Zero runtime dependencies, so there is no transitive supply chain to audit.

## 10. Residual risks

1. Unauthenticated loopback routes can trigger and serve a screenshot of the connected device.
2. `hdc_shell` is a shell on the attached device; prompt injection reaching it has device-level consequences.
3. The panel spawns outside the session sandbox, so its behavior is not constrained by the host policy the tools respect.
4. Device screenshots persist in the system temp directory.
5. The bundled documentation corpus is trusted on the project's own hashes; a poisoned corpus would be advice-shaped, not code-shaped, but it feeds the model.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD. Any new `fetch`, any new `execFile` target, or any new panel route must be re-adjudicated.
2. Re-check the panel command list in `lib/panel.mjs` on every bump: it is currently read-only, and a write-capable `hdc` command appearing there is a finding.
3. Watch for auth or Origin checks appearing on the `/api2/hdc-bridge/*` routes; that would clear HDC-AUTH-1 and support an A.
4. Re-run `node scripts/license-check.mjs` after knowledge-corpus regeneration; the notices and hashes are the basis of the license claim.
