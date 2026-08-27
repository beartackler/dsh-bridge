# Trust Report Card: dsh-ikun-pet

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-ikun-pet` (DSH Web cosmetic plugin: animated progress panel below the deep-dive status line, plus a host-played completion sound) |
| Pinned subject | github:eric-song-dev/dsh-ikun-pet @ commit `ada74e3755730bbff1e619ca0f8ff7926d03ba98` (shallow clone, default branch head at audit time; package.json version 2.2.0) |
| npm integrity | not checked (see section 5) |
| Provenance | not verified |
| License | MIT (LICENSE:1-3, "Copyright (c) 2025 dsh-ikun-pet contributors") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of lib/host.js, src/host.js, the client render path, and both build scripts) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Cosmetic and local-only with no network egress and no credential access, but it holds a live shell
primitive: a config-supplied `playCommand` function is string-concatenated into a command and handed
to DSH's shell service every time an agent turn finishes, which is more authority than a progress
animation needs.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, no `node:http` client, no socket in src/ or lib/. Every NET finding is a github.com or npm metadata URL in package.json:8,11,13,25. | grep of src/, lib/, scripts/ |
| Shell execution | Real. On each turn completion the host runs `shell.resolve({ command: cfg.playCommand(voicePath) })` then `shell.run(spec)` (lib/host.js:101-107; identically at src/host.js:105-108). The default builds `afplay '<path>'` with single quotes escaped (lib/host.js:33). Both `playCommand` and `voicePath` are overridable from the patch-row config (lib/host.js:38-42), and cordis.patch.yml advertises overriding `playCommand` as a supported customisation. | file:line above |
| HTTP surface | One exact route serving the bundled sprite sheet as `image/webp` with a 24-hour cache header (lib/host.js:71-83). Read-only, no parameters, no user input reaches it. Registered so it is disposed on unload (lib/host.js:86-89). | lib/host.js:71-89 |
| Filesystem reads | Two files: `assets/spritesheet.webp` and `assets/voice.mp3`, defaulting to the package's own `assets` directory (lib/host.js:40-42), read through `ctx.fs.resolve` with a 16 MB cap (lib/host.js:54-55). Both paths are config-overridable. | lib/host.js:40-62 |
| Filesystem writes | None at runtime. `scripts/build-package.mjs` writes `ikun.package.json`, but that is a maintainer script run by hand. | grep; scripts/build-package.mjs:23 |
| Credential reads | None. No auth path, no environment access in src/ or lib/. | grep |
| Polling | A 1-second interval polls `agents.list()` and reads each agent's `status` field to detect a running-to-idle transition (lib/host.js:114-146), with a 2.5-second cooldown between sounds (lib/host.js:31, 138-141). Statuses only; no message content is read. | lib/host.js:114-146 |
| Dynamic code execution | No `eval` or `new Function`. But `playCommand` is a JavaScript function supplied through config and invoked at lib/host.js:101, which is config-as-code in substance if not in form. | lib/host.js:101 |
| Client-side data access | The client reads session state through the host's `useSession` selector: `running`, turn timings, running tool-call count, whether output is streaming, and pending-approval count. These drive the progress estimate. It does not read message content. | src/client.js DiveProgress selectors |
| DOM rendering | All output goes through `React.createElement` (src/client.js:378-401). No `innerHTML`, no `dangerouslySetInnerHTML`. The panel is `aria-hidden="true"` and respects `prefers-reduced-motion`. | src/client.js:378-401 |
| Telemetry | None. No analytics, beacon, or metrics code. | negative claim, scope: src/, lib/, scripts/ |
| Lifecycle hooks | None. `scripts` has build, test and a `demo` entry running `npx --yes serve .` (package.json), which is a manual developer command, not an install hook. | package.json scripts |
| Dependencies | No runtime dependencies. One optional peer on `@deepseek-ai/dsh-client-ui-conversation`. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 5 findings (1 high, 1 medium, 3 low), machine grade C, score 81, no gates fired. This is
the one repo in this batch where the scanner's grade and the manual grade agree, though for
partly different reasons: the scanner keyed on metadata URLs, while the manual review's main concern
is the shell path, which the scanner did not surface from lib/host.js.

### Production-code findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| IKUN-EXEC-1 | medium | lib/host.js:33, 101-107; src/host.js:25, 105-108 | Shell command built by string concatenation and executed on every turn completion. The default is a fixed `afplay` invocation and it escapes single quotes in the path. The risk is structural: config supplies both the command builder and the path it interpolates, so a bad profile row, or a replacement `playCommand` that omits the escaping the default performs, yields command injection through the sound-file path. Nothing in the plugin validates the resulting command. |
| IKUN-FS-1 | low | lib/host.js:40-42 | `spritePath` and `voicePath` are config-overridable absolute paths read through the fs service. Bounded by a 16 MB read cap; no containment check, so any readable file can be served over the sprite route if a user misconfigures it. |
| IKUN-QUAL-1 | low | src/host.js:17, 21 | The `cordis_define` variant, and the `ikun.package.json` payload generated from it, hard-code the author's own machine paths (`/Users/ericsong/test/project/dsh/...`). Harmless but it means that install path fails out of the box, and it indicates the generated payload is not maintained in step with the packaged plugin. Only `lib/host.js` (the packaged permanent plugin) defaults correctly to the bundled assets. |
| IKUN-NET-1 | low | package.json:8,11,13,25 | Repository, bugs, homepage and registry metadata URLs. Not executed. |

### Negative claims and what was searched

Read in full: lib/host.js (166 lines), src/host.js (181 lines), scripts/validate.mjs (83),
scripts/build-package.mjs (29), package.json, cordis.patch.yml, ikun.package.json header. Grepped
src/, lib/, scripts/ and demo/ for `fetch`, `XMLHttpRequest`, `http.request`, `https.request`,
`eval`, `new Function`, `child_process`, `spawn`, `exec`: zero hits outside the `shell` service usage
documented above. src/client.js (430 lines) was read across its state, RPC, progress-model and render
paths; the sprite URL it uses is the fixed constant `/ikun-pet/spritesheet.webp` resolved against
`window.location.origin` (src/client.js:144, 264).

`scripts/validate.mjs` was checked specifically because build scripts are a common hiding place: it
only stats the two asset files and parses the WebP RIFF/VP8X header and the MP3 frame header to
assert dimensions. No network, no execution.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/run was performed. The shell invocation, the agent poll loop, the cooldown and the route were read but never exercised, so the actual command string reaching the shell service was not observed.
- **DSH's `shell` service semantics.** Whether `shell.resolve` applies its own quoting, sandboxing or approval prompt is a property of the harness, not of this plugin. The severity of IKUN-EXEC-1 depends on that answer and this audit did not establish it. If the shell service prompts for approval, the finding is closer to low; if it executes silently, closer to high.
- **The bundled binary assets.** `assets/spritesheet.webp` and `assets/voice.mp3` (about 4.8 MB together) were not inspected beyond the header validation the repo's own script performs. Their content and licensing were not verified, and the sound is a pop-culture clip whose rights status is unclear.
- **Published npm tarball vs this git tree.** Not fetched; no integrity or attestation checked.
- **`src/client.js` versus `lib/client.js`.** Both are shipped; they were not diffed line by line.
- **`demo/index.html`.** Not reviewed; it is excluded from runtime but is in the published `files` list.
- **Cross-model review.** Single reviewer, one model.

## 6. Strengths

1. No network egress, no credential access, no install hooks, no runtime dependencies.
2. The default `playCommand` does escape single quotes in the path (lib/host.js:33), so the shipped configuration is not itself injectable.
3. Disposal is handled: the route is removed and the poll interval cleared through `ctx.effect` (lib/host.js:86-89, 146-147).
4. The poll loop wraps every agent access in try/catch and bails on unexpected shapes (lib/host.js:118-136), so a malformed agent record cannot crash the host.
5. A warm-up pass avoids treating an already-running agent at startup as a completion, preventing a spurious sound on load (lib/host.js:148-164).
6. Rendering is React elements only, with no HTML injection sink; the panel is `aria-hidden` and honours reduced-motion preferences.
7. The plugin can be disabled by uncommenting one line in the patch row, and the file says so (cordis.patch.yml).

## 7. Residual risks

1. A cosmetic plugin that runs shell commands on a timer is a poor authority-to-purpose ratio. Even used as intended it means an audio player process spawns after every agent turn.
2. Anyone who can edit the profile's patch row can supply an arbitrary `playCommand`, turning a decoration into a persistent local execution foothold that fires on every completed turn. That is the same person who owns the machine today, but it makes the plugin an attractive rewrite target for anything that gains config write access.
3. The 1-second `agents.list()` poll runs for the whole session lifetime, whether or not anything is rendering.
4. Config-overridable asset paths with no containment mean a misconfigured `spritePath` publishes an arbitrary readable file on the sprite route.
5. Documentation, comments and UI copy are largely Chinese, and the generated `cordis_define` payload still contains the author's local paths, so the two install paths are not equally maintained.
6. Bundled audio and sprite assets of unclear provenance ship inside the package.

## 8. Methodology and pinned inputs

- Subject: git commit `ada74e3755730bbff1e619ca0f8ff7926d03ba98` (shallow clone at reference/audits/dsh-ikun-pet)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 9 files scanned, 11 skipped
- Review: full read of lib/host.js, src/host.js, scripts/validate.mjs, scripts/build-package.mjs, package.json, cordis.patch.yml, LICENSE; src/client.js read across state, RPC, progress and render paths; greps across src/, lib/, scripts/, demo/ for network, exec and credential surfaces
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no egress, no credentials, no dynamic evaluation, and clean disposal would place this in the B band on capability alone. Held to **C** by IKUN-EXEC-1: a config-supplied command builder feeding the shell service on every turn completion, whose real severity could not be pinned down without knowing DSH's shell approval semantics (section 5). The stale hard-coded paths in the second install path (IKUN-QUAL-1) are a maintenance signal, not a security one, but they reduce confidence that both entry points are reviewed together.

## 9. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/eric-song-dev/dsh-ikun-pet /tmp/ikun-audit
cd /tmp/ikun-audit && git rev-parse HEAD   # expect ada74e3755730bbff1e619ca0f8ff7926d03ba98

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ikun-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(\|child_process\|eval(\|new Function" src lib scripts   # zero hits
sed -n '32,34p'   lib/host.js    # the default playCommand and its quote escaping
sed -n '92,110p'  lib/host.js    # shell.resolve + shell.run: the execution path
sed -n '112,148p' lib/host.js    # the 1s agents.list() poll and the cooldown
grep -n "innerHTML\|dangerouslySetInnerHTML" src/client.js lib/client.js   # zero hits
```

## 10. Re-verify steps

1. Re-run the block above against the current HEAD. Any change to how `playCommand` output reaches `shell.run`, or removal of the default's quote escaping, must be re-adjudicated before this grade carries forward.
2. Resolve the open question in section 5: determine whether DSH's `shell` service prompts, sandboxes or silently executes. That answer moves IKUN-EXEC-1 in either direction and should be recorded in revision 2.
3. Inspect the deployed profile's patch row, not just the repo. This plugin's risk lives in configuration, so an audit of the source alone does not describe an installed instance.
4. Watch package.json `scripts` for install-time hooks and any new runtime dependency.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
