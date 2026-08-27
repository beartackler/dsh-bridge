# Trust Report Card: dsh-visual-plugin

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-visual-plugin` (vision-bridge: copies native image descriptions, normalizes and scene-samples videos into keyframes for the user's existing DSH vision model) |
| Pinned subject | github:jyh20030112/dsh-visual-plugin @ commit `5b7940e28461790ad786c22407df45b881623c6a` (2026-08-24, default-branch head at audit time) |
| npm integrity | `sha512-bemxn0Dg+9gsxUmFV16Sa27WNAr8uf1/fHuKlIYbQ5WYplmZv7L5IqfZX/aUwdWwYHoyhyfRFjMch8C0zUsIMQ==` (`registry.npmjs.org/dsh-visual-plugin/0.3.0`, fetched 2026-08-27) |
| Provenance | Release workflow requests `id-token: write` and publishes via `npm publish --access public` (.github/workflows/release.yml:27, 120). Registry `gitHead` is `e173e6b76aaa2bdbddaf877dc5d5fe5e3e1cae30`, which is **not** the audited commit and is not present in the shallow clone. See section 5. |
| License | MIT (package.json:"license", LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual read of the TypeScript source and spot-verification of the shipped `lib/` bundles) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

This plugin makes no external network requests at all: every HTTP call in it points at the DSH
host's own loopback routes, images and videos are handed to whatever model the user has already
configured in DSH, and its only real power is spawning ffmpeg/ffprobe/scenedetect from PATH with
array-form arguments and no shell.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | **None external.** The only literal URL anywhere in `src/` or the shipped `lib/` bundles is the string `http://localhost` used twice as a base for `new URL()` parsing (src/index.ts:320, src/video/http.ts:139). Every browser-side call targets a relative path on the DSH origin: `/vision-bridge/videos{,/health}`, `/vision-bridge/recent`, `/vision-bridge/config` (src/client/video-client-controller.ts:99,116,155; VisionBridgeCard.tsx:54; VisionBridgePanel.tsx:66; video-settings-controller.ts:88,106). | `grep -rhoE "https?://..." src lib/index.js lib/client.js` yields only `http://localhost` |
| Vision model access | The plugin does **not** own or configure a model. `video_describe` reads the caller's current route (`exec.agent.session.requestHeader()?.config`, falling back to the agent's own options), resolves it through the host `llm` service, and refuses to run if the active model does not declare `image` input (src/index.ts:222-234). Keyframes are saved through the host's `attachments.saveImages` and returned as native DSH image blocks (src/index.ts:245-249). Version 0.3.0 actively deletes the retired plugin-owned model config (`url`, `model`, `apiKeyEnv`) on upgrade (src/index.ts:152-157). | file:line above |
| Child processes | `spawn` from `node:child_process`, one wrapper only (src/video/process-runner.ts:1, 37). Executables are the fixed defaults `ffmpeg`, `ffprobe`, `scenedetect` resolved from PATH (src/video/media-engine.ts:74-76); `createSystemMediaEngine` is constructed with `{ policy }` alone, so the override fields are never user-controlled (src/index.ts:193-197). Arguments are arrays, `shell: false`, `stdio: ['ignore','pipe','pipe']`, `windowsHide: true`, output capped at 64 KiB, per-call timeouts, SIGTERM then SIGKILL process-group teardown (process-runner.ts:37-45, 50-68). | file:line above |
| Filesystem writes | Confined to `${DSH_HOME:-~/.dsh}/.visual_plugin` (src/index.ts:147): `videos/jobs/<videoId>/` for uploads and derived frames, plus one JSONL per attachment for description history (src/history-store.ts:17-20). Directories created `0o700` and re-chmodded, files opened `0o600`, uploads staged with `open(path,'wx',0o600)` (src/video/store.ts:46-47, 63, 71; coordinator.ts:415, 438). | file:line above |
| Path traversal defense | `jobDirectory` rejects any id that is not exactly its own basename and does not match `/^video-[a-zA-Z0-9_-]{8,}$/` before joining (src/video/store.ts:51-55). Ids are `video-` plus 16 bytes from `randomBytes` (src/video/coordinator.ts:55-57). | file:line above |
| Loopback HTTP routes | `/vision-bridge/videos` prefix router (list, create, PUT upload, GET/HEAD content and poster, DELETE) at src/video/http.ts:129-207; `/vision-bridge/config` GET/POST at src/index.ts:288-314; `/vision-bridge/recent` GET at src/index.ts:316-326. Mutating verbs require same-origin; see CRED/AUTH findings below for the exact semantics. | file:line above |
| Credential reads | **None.** No `auth.json`, no `~/.ssh`, no `~/.aws`, no keychain, no browser store, no `process.env` enumeration in shipped code. The only `process.env` read in `lib/` is `DSH_HOME` (lib/index.js:1539). | grep over src and lib |
| Dynamic code execution | **None** in shipped code. No `eval`, `new Function`, or `vm`. | grep over src and lib |
| Telemetry | **None.** No analytics, beacon, or metrics code; there is no external host to send to. | negative claim, scope stated |

Where user media goes: uploaded video bytes are written under the plugin's own data dir, transcoded
locally by ffmpeg with `-an -sn -dn -map_metadata -1` (audio, subtitles, data and metadata all
stripped, src/video/media-engine.ts:173-181), sampled into JPEG keyframes, and handed to the host's
attachment service. From there the host sends them to whichever model the user already chose. The
plugin never sees a provider endpoint or an API key.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 40 findings (3 critical, 34 high, 3 medium), machine grade F, gates
`dynamic-exec-present` and `finding-density`. Adjudicated below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED critical x2, `tsdown.config.ts:132-133`, "enumerates the entire process environment" | False positive, and not shipped. These are build-time `define` entries substituting `process.env.NODE_ENV` into the browser bundle (tsdown.config.ts:131-135). `tsdown.config.ts` is not in package.json `files` (package.json lists only `lib/index.js`, `lib/invariant.js`, `lib/client.js`, `lib/types/**/*.d.ts`, `cordis.patch.yml`), so it never reaches a user. | tsdown.config.ts:125-135; package.json `files` |
| EXEC critical, `lib/index.js:11`, "imports child_process" | True but expected: this is the ffmpeg wrapper (src/video/process-runner.ts:1). See VIS-EXEC-1. | src/video/process-runner.ts |
| `dynamic-exec-present` gate | Not adopted. The gate fires on the `child_process` import, not on any string-compiled code. There is no `eval`, `new Function`, or `vm` anywhere in src or lib. | grep |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| VIS-EXEC-1 | medium | src/video/process-runner.ts:37; src/video/media-engine.ts:74-76, 82-86, 173-181 | Spawns local media tools. Mitigated as thoroughly as this class of thing gets: no shell, array args, fixed executable names, bounded output, timeouts, group kill, and every path argument is one the plugin itself constructed under its own data dir. The only externally influenced ffmpeg input is the file content, which is what a transcoder is for; a bug would be in ffmpeg, not here. |
| VIS-AUTH-1 | medium | src/index.ts:131-139 | The `/vision-bridge/config` route's `sameOrigin` **returns true when the `Origin` header is absent** (src/index.ts:133). A non-browser local process can therefore POST new video-processing settings with no Origin header. Impact is bounded to this plugin's own numeric settings, each clamped by the schemastery bounds (src/config.ts:42-50), so the worst case is resource-policy tampering (e.g. raising `maxUploadMiB` to 2048), not code execution or data disclosure. Note the video router's own `sameOrigin` is the strict version, returning false on a missing Origin (src/video/http.ts:56-58); the two implementations disagree and the weaker one should be replaced with the stricter. |
| VIS-AUTH-2 | low | src/video/http.ts:181-184 | `GET/HEAD /vision-bridge/videos/<id>/content` and `/poster` require neither same-origin nor session ownership; `coordinator.content(videoId, kind)` takes no sessionId (src/video/coordinator.ts:259-267). Access is therefore capability-by-URL. The capability is a 128-bit `randomBytes` id (coordinator.ts:55-57), which is a defensible design for `<video src>` playback where headers cannot be set, but it means a leaked id grants the bytes to anyone who can reach the loopback port. |
| VIS-FS-1 | low | src/history-store.ts:17-20 | Appends model-produced image descriptions to `~/.dsh/.visual_plugin/<attachmentId>.jsonl` indefinitely; there is no retention cap on disk (the 20-item cap at src/index.ts:159 applies only to the in-memory `recent` list). Descriptions can contain a summary of whatever the user shared. Local-only, but it is durable content the user may not expect to persist. |
| VIS-SUPPLY-1 | low | package.json:"devDependencies" | Twelve devDependencies are `file:../../deepseek-harness/...` relative paths, and CI checks out a **fork**, `jyh20030112/deepseek-harness` at a pinned SHA, rather than the upstream repo (.github/workflows/ci.yml:13-18). This does not affect installed runtime code (all DSH packages are peer deps, all optional, package.json `peerDependenciesMeta`), but it means the build and test results published by CI were produced against an author-controlled harness copy. |

### Scanner noise dismissed (with scope)

- 29 NET findings: every one is a fetch or XHR to a relative same-origin path on the DSH web
  server (`/vision-bridge/...`). Verified by enumerating all literal URLs in src and lib; the set
  is `{http://localhost}`, used only as a `new URL()` base.
- OBFU medium x2 (lib/index.js:1406, src/video/http.ts:166): `decodeURIComponent(segments[2])` in
  URL path parsing. Not a runtime decode of packed code.
- EXEC high in `tests/video-media-engine.test.mjs:2` and `tests/video-process-runner.test.mjs:15`:
  test files, not in package.json `files`.
- HOOK medium in `tests/video-process-runner.test.mjs:18`: a test timer.
- `finding-density` C cap: the NET family spreads across files because a React client has several
  components, all calling the same loopback API.

### Negative claims and what was searched

Searched all of `src/` (3659 lines of .ts/.tsx, all files read or grepped by construct), the three
shipped bundles `lib/index.js`, `lib/client.js`, `lib/invariant.js`, `tests/`, `scripts/`,
`tsdown.config.ts`, both READMEs, `cordis.patch.yml`, `package.json`, and both workflows.
Results: no `eval`/`new Function`/`vm`; no external hostname of any kind; no credential-file path;
no keychain or browser-store access; no `postinstall`/`preinstall`/`install` script (package.json
`scripts` are `bootstrap`, `test`, `typecheck`, `build`, `pack` only, none of which npm runs on
install); no obfuscation (bundles are readable, unminified, with sourcemap and original comments
preserved); no telemetry; no writes outside `${DSH_HOME:-~/.dsh}/.visual_plugin`.

## 5. What we could not check

- **The published artifact is a different commit.** `npm view dsh-visual-plugin@0.3.0 gitHead`
  returns `e173e6b76aaa2bdbddaf877dc5d5fe5e3e1cae30`, which is not the audited commit
  `5b7940e2...` and is not reachable in the shallow clone (`git cat-file -t` fails). This card
  grades the **git tree**, not the npm tarball. Anyone installing from npm is getting code this
  audit did not read. Resolving this requires a full clone to locate `e173e6b7` and a diff, or a
  tarball extraction and byte-comparison; neither was done here.
- **Provenance attestation was not verified.** The workflow requests `id-token: write`, which is
  consistent with trusted publishing, but we did not fetch and validate the SLSA attestation for
  the 0.3.0 tarball.
- **Behavioral probe.** No sandboxed load/activate/upload/transcode/idle-soak run. The ffmpeg
  command lines, the origin checks, and the traversal guard were read, not exercised.
- **The bundled `lib/` files were spot-checked, not fully read.** `lib/index.js` and
  `lib/client.js` were grepped for every construct claimed in section 3 and read at the specific
  sites cited, but the full 370 KB of generated output was not read line by line. Claims about
  behavior rest primarily on `src/`.
- **ffmpeg, ffprobe and PySceneDetect themselves.** The plugin hands them attacker-supplied media
  bytes. Any memory-safety issue in those tools is inherited and is outside this artifact. The
  plugin does not sandbox them beyond process-group isolation and timeouts.
- **PATH hijacking.** Executables are resolved by name from PATH. If a user has a malicious
  `ffmpeg` earlier in PATH, this plugin will run it. That is normal for PATH-resolved tooling and
  was not treated as a finding, but it is unverified in practice.
- **The forked harness used in CI** (`jyh20030112/deepseek-harness` @ `99f6f02f`) was not diffed
  against upstream.
- **Cross-model review.** Single reviewer, single model.

## 6. Grade derivation

Start at A-band candidacy: zero external egress, zero credential access, zero dynamic code
execution, zero telemetry, no install hooks, restrictive file modes, an explicit traversal guard,
and a product design that deliberately gave up owning a model or an API key (src/index.ts:152-157
removes the old key config on upgrade). Held to **B** by three things, in order of weight:
the published npm artifact corresponds to a commit this audit did not read (section 5, first
bullet), which alone forbids an A; the permissive `sameOrigin` on the config route (VIS-AUTH-1);
and local child-process execution of media tools, which is inherent to the feature but is still
real power (VIS-EXEC-1). No high or critical production finding survived adjudication, so it does
not fall to C. The scanner's F is not adopted; its gates fire on a `child_process` import and on
same-origin fetch density.

## 7. Strengths

1. No external network destination exists in the codebase. That is a rare and strong property for
   a media plugin, and it is achieved by design: the plugin routes through the host's `llm` and
   `attachments` services instead of holding its own endpoint and key.
2. The child-process wrapper is written the way this should be written: `shell: false`, array
   args, `windowsHide`, bounded stdout/stderr, timeout, abort signal, and SIGTERM-then-SIGKILL
   process-group teardown (src/video/process-runner.ts:37-68).
3. Transcoding actively strips attack and privacy surface: `-an -sn -dn -map_metadata -1` drops
   audio, subtitles, data streams and all container metadata (src/video/media-engine.ts:175).
4. Filesystem hygiene: `0o700` dirs, `0o600` files, `wx` exclusive staging, and a traversal guard
   that validates the id shape before any `join` (src/video/store.ts:46-71, 51-55).
5. It deletes its own legacy credential configuration on upgrade rather than leaving a stale
   `apiKeyEnv` field behind (src/index.ts:152-157), and the README states plainly that no separate
   vision model is configured or called (README.md:30).
6. Video ids are 128-bit random, so the capability-URL design at VIS-AUTH-2 is at least not
   guessable.

## 8. Residual risks

1. Users install from npm; this card graded git. Until the tarball is compared, the audited
   subject and the installed subject are not proven identical.
2. A local non-browser process can rewrite the plugin's processing policy through
   `/vision-bridge/config` by simply omitting the `Origin` header (VIS-AUTH-1).
3. Anyone who learns a video id can fetch its bytes from the loopback port with no further check
   (VIS-AUTH-2).
4. Image descriptions accumulate on disk with no retention bound (VIS-FS-1).
5. The security of media parsing is ffmpeg's and PySceneDetect's, not this plugin's.
6. CI validates against an author-owned harness fork, so "CI is green" carries less assurance
   than it appears to.

## 9. Reviewer disagreement

Single-reviewer pass; no second adversarial model. The scanner graded F; this card grades B and
records the scanner's gates and their adjudication in section 4 rather than dropping them.

## 10. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/jyh20030112/dsh-visual-plugin /tmp/vis-audit
cd /tmp/vis-audit && git rev-parse HEAD  # expect 5b7940e28461790ad786c22407df45b881623c6a

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/vis-audit   # from a dsh-bridge checkout

# 3. The headline claim: no external egress
grep -rhoE "https?://[a-zA-Z0-9._:-]+" src lib/index.js lib/client.js | sort -u
#   expect exactly: http://localhost

# 4. The spawn surface
sed -n '31,45p' src/video/process-runner.ts     # shell:false, array args, windowsHide
sed -n '74,76p' src/video/media-engine.ts       # fixed ffmpeg/ffprobe/scenedetect names
sed -n '173,181p' src/video/media-engine.ts     # -an -sn -dn -map_metadata -1

# 5. The two origin checks that disagree
sed -n '131,139p' src/index.ts                  # returns TRUE when Origin is absent
sed -n '56,64p' src/video/http.ts               # returns FALSE when Origin is absent

# 6. Traversal guard and id entropy
sed -n '51,55p' src/video/store.ts
sed -n '55,57p' src/video/coordinator.ts

# 7. The provenance gap this card flags
npm view dsh-visual-plugin@0.3.0 gitHead dist.integrity
#   gitHead e173e6b76aaa2bdbddaf877dc5d5fe5e3e1cae30 != the commit above
```

## 11. Re-verify steps

1. Close the artifact gap first: full-clone the repo, `git cat-file -p e173e6b7`, and diff it
   against the audited tree. If the delta is non-trivial, this card needs a revision that grades
   the npm tarball.
2. Any new literal URL in `src/` or `lib/` breaks the central claim of this card and must be
   re-adjudicated immediately.
3. Re-check `src/index.ts:131-139`. If `sameOrigin` there is replaced with the strict version from
   `src/video/http.ts`, VIS-AUTH-1 clears.
4. Watch for a `postinstall`/`preinstall` entry appearing in package.json (currently absent) and
   for any new entry in the `files` array, which widens what ships.
5. Watch `src/video/media-engine.ts:74-76`: if `ffmpegPath`/`sceneDetectPath` ever become
   user-settable, the executable name stops being fixed and VIS-EXEC-1 rises in severity.
6. Re-run the scanner after any heuristics-corpus bump; the rulesDigest for this pass is in
   section 4.

## 12. Methodology and pinned inputs

- Subject: commit `5b7940e28461790ad786c22407df45b881623c6a`, shallow clone at
  `reference/audits/dsh-visual-plugin`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Manual review: src/index.ts, src/config.ts, src/image-description.ts, src/history-store.ts,
  src/recent.ts, src/video/{process-runner,media-engine,coordinator,store,http,probe,scenes}.ts,
  src/client/{video-client-controller,video-settings-controller,VisionBridgeCard,VisionBridgePanel}
  and siblings, tsdown.config.ts, package.json, cordis.patch.yml, README.md, README.zh.md, both
  workflows. Shipped `lib/index.js` and `lib/client.js` grepped for every construct claimed and
  read at each cited line.
- Registry check: `npm view dsh-visual-plugin@0.3.0 dist.integrity gitHead`, fetched 2026-08-27.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
