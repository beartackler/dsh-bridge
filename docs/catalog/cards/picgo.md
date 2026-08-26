# Trust Report Card: PicGo (`@picgo/dsh-plugin`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@picgo/dsh-plugin` - uploads local images and files to whichever image host PicGo is configured for, exposed as one tool, one command, and one skill. The catalog entry `Molunerfinn/PicGo` is the desktop app; the DSH plugin it points at lives in `PicGo/dsh-plugin` and is the graded subject. |
| Pinned subject | github:PicGo/dsh-plugin @ commit `84766fcbda8c9d50d55d0f89865e9c3428db17d4` (default branch head at audit time) |
| Companion app audited | github:Molunerfinn/PicGo @ commit `07ec7068a5512344da093d49a8408fa63ba3421e` (scanned, not graded; it is an Electron app, not a DSH plugin) |
| npm integrity | `sha512-Waz6+hgOIW68+GdHzdTITXN6qHM4Fzhw5...` (`registry.npmjs.org/@picgo/dsh-plugin/0.2.0`, published 2026-08-22, fetched 2026-08-26) |
| Provenance | Strong. Registry `gitHead` `471875d5905417f6d539a1cadc5669a81b3b7fbd`, plus an npm attestation with SLSA provenance predicate (`slsa.dev/provenance/v1`) produced by the tag-gated publish workflow. The audited commit `84766fcb` is a later commit on the same branch (a `bump-version` bump), so it is one step ahead of the published `gitHead`. |
| License | Declared MIT in package.json:43. **No LICENSE file is present in the repository or in the published tarball.** |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review + published-tarball read) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Every network call the plugin itself makes goes to `127.0.0.1:36677` - the PicGo desktop app on your
own machine - and the only credential it touches is that app's own auth secret; the far larger
capability, uploading your files to a configured image host, is delegated to the `picgo` library and
is precisely the advertised product.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (own code) | Exactly two `fetch` call sites, both to the same loopback endpoint built from config: `POST ${endpoint}/heartbeat` and `POST ${endpoint}/upload`, where endpoint is `http://${host}:${port}` with defaults `127.0.0.1` and `36677`. The literal IP is used deliberately instead of `localhost` to avoid DNS and IPv6 ambiguity. | src/server.ts:76-78, 110-122, 168-196; src/index.ts:69-72 |
| Network egress (delegated) | The in-process route constructs `new PicGo(configPath)` from the `picgo` npm dependency and calls its upload lifecycle. That library uploads to whichever of 60+ hosts the user configured, and loads the user's own third-party uploader plugins from their PicGo home. That code is not part of this package and was not audited. | src/picgo.ts:1, 44-50; src/index.ts:111-123 |
| Credential handling | One secret-shaped read: `process.env.PICGO_SERVER_SECRET`, used only after an explicit `gui.secret` config value is absent, and sent only as `Authorization: Bearer` on the loopback upload call. The code explicitly refuses to read `settings.server.secret` from the CLI config, on the grounds that it is the wrong file for the desktop app. | src/server.ts:344-358, 180-183 |
| PicGo Cloud session | `/picgo login [token]`, `logout`, and `status` read and write the PicGo Cloud token via the `picgo` library (`settings.picgoCloud.token`). Tokenless login opens a browser OAuth flow. The tool deliberately never starts that flow itself and tells the model to hand it to the user instead, because it blocks. | src/picgo.ts:101-135; src/tool.ts:118-127, 153-167; src/command.ts:80-106 |
| Filesystem | Reads: `stat` on each input path before upload, and the packaged `skills/picgo-upload/SKILL.md`. Writes: none from this package. PicGo's own config is set in memory only, with a comment stating why persisting would be wrong. | src/server.ts:139-141; src/skill.ts:27-52; src/picgo.ts:51-58 |
| Runtime services | Injects `['tools','commands','skills']`. Registers one tool (`picgo_upload`), one command (`/picgo`), one skill (`picgo-upload`), and one deferred zero-delay `setTimeout` for the first-run sign-in hint, unref'd and disposed through `ctx.effect`. | src/index.ts:13, 139-185 |
| Child processes | None. Zero `child_process`/`spawn`/`exec` anywhere in the package. | grep over src/ and the tarball |
| Dynamic code execution | None. No `eval(`, `new Function`, `vm.`, or dynamic `import()` in source or in the published `lib/index.js`. | grep over src/ and lib/index.js |
| Telemetry | None. No analytics endpoint, no counters, no beacon. | grep negative |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

Two runs. Against the Electron app `Molunerfinn/PicGo`: 132 findings (0 critical, 78 high NET,
18 medium HOOK, 5 medium NET, 4 medium CRED, 2 high EXEC). Against the graded subject
`PicGo/dsh-plugin`: **62 findings** (0 critical, 58 high NET, 1 low NET, 1 medium HOOK, 1 medium
EXEC, 1 medium CRED). Machine verdict for the plugin run is **F**, off three gates:
`cred-plus-net`, `dynamic-exec-present`, and `finding-density`. Manual adjudication follows.

### The 58 high NET findings

54 of the 58 are inside `src/__tests__/`: strings like `https://cdn/a.png` and
`https://cdn.test/ok.png` used as stub upload responses. They are fixtures in files the tarball does
not contain. The remaining hits in non-test code are three, all listed below.

### Scanner highs and mediums in shipped code, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high `http://${host}:${port}` (src/server.ts:77) | Loopback by default. This string is the desktop app's own HTTP server, and both real calls derive from it. A user who repoints `gui.host` at a remote machine changes that, which is their configuration decision. | src/server.ts:76-78; src/index.ts:69-72 |
| NET high `fetch(${endpoint}/heartbeat)` (src/server.ts:112) | Liveness probe with a 1500 ms default timeout. The code notes it never sends the secret, because the heartbeat does not require it - verified: no `Authorization` header in that request. | src/server.ts:109-122 |
| NET high `fetch(${endpoint}/upload)` (src/server.ts:178) | The product. Sends absolute paths of files the caller named, with the bearer secret when one exists. Cancellation and timeout are bounded by `AbortSignal.any`. | src/server.ts:168-196 |
| NET high `https://picgo.app/` (package.json:34) | Homepage metadata. Inert. | package.json:34 |
| CRED medium `process.env.PICGO_SERVER_SECRET` (src/server.ts:356) | Documented, single-purpose, and narrower than it had to be: it is a fallback for one config field, and the code refuses the tempting-but-wrong alternative of reading the CLI config's server secret. The secret goes to the loopback endpoint only. | src/server.ts:344-358 |
| EXEC medium `setTimeout(` (src/picgo.ts:222) | A timer, not dynamic evaluation. The scanner's `dynamic-eval` rule fires on the identifier; the callback is a function reference, never a string. The other timer in the package (src/index.ts:152) is the sign-in hint, unref'd and cleared on dispose. | src/picgo.ts:222; src/index.ts:150-161 |
| HOOK medium `prepare: tsdown` (package.json:49) | This one is real, and it is the weakest point in the package. `prepare` runs on `npm install` from a git URL and in local `link:` installs. It runs the project's own bundler, not third-party code, but it is a lifecycle hook that executes at install time in those channels. Registry installs of the published tarball do not trigger it (npm skips `prepare` for a packed tarball with a `dist`), so the documented `dsh plugin add @picgo/dsh-plugin` path is unaffected. | package.json:47-50; README install instructions |
| `cred-plus-net` gate (machine F) | Fires because `src/server.ts` both reads a secret and calls `fetch`. Adjudicated: that is one feature. The secret is the auth token *for* the endpoint being called, it is read at construction (src/server.ts:73) and attached to one request, and the endpoint is loopback by default. No third-party host receives it. | src/server.ts:71-74, 178-189 |
| `dynamic-exec-present` gate | Dismissed. The only trigger is the `setTimeout` above; there is no dynamic execution in this package. | grep negative for eval/new Function/vm/import() |

### Source-to-artifact comparison

`npm pack @picgo/dsh-plugin@0.2.0` yields six entries: `lib/index.js` (950 lines, unminified),
`lib/index.d.ts`, `package.json`, `README.md`, `cordis.patch.yml`, and
`skills/picgo-upload/SKILL.md`. No tests and no sources ship. Grepping the bundle for the dangerous
set returns exactly the three lines the source review predicted: `fetch` at lib/index.js:409 and
:445, and `process.env.PICGO_SERVER_SECRET` at lib/index.js:549. Nothing else. No LICENSE file is in
the tarball, matching the repository.

### Behavior worth naming because it is unusual

The router's fallback rule is deliberately narrow: if the desktop-app route fails at the HTTP level
the plugin does **not** retry on the in-process library, because that would upload to a different
image host than the user configured, or upload a second copy of a file the app already accepted
(src/router.ts:77-107). Only a transport failure confirmed by a second heartbeat re-routes. That is
the correct call and most implementations get it wrong.

## 5. What we could not check

- **The `picgo` library itself.** `dependencies: { picgo: "^3.0.1" }` (package.json:59) is a floating
  caret range for a package that performs the actual uploads, reads `~/.picgo/config.json`, and
  loads the user's third-party uploader plugins. It is where the real capability lives and it was
  not audited. A user installing this plugin is trusting PicGo-Core, not only these 1462 lines.
- **The desktop app.** `Molunerfinn/PicGo` was scanned (132 findings) but not adjudicated; it is a
  60-host Electron uploader, out of scope for a plugin card.
- **Exact tarball-to-audited-commit equality.** Published `gitHead` is `471875d5`; the audited head
  is `84766fcb`, one commit later (a dependency bump). The bundle was read and matches the audited
  source, but a byte-compare against the published artifact's exact commit was not possible.
- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner says F; this card says B. Both are recorded. The gap is entirely
the `cred-plus-net` gate plus 54 test fixtures that never ship: the gate is correct that a secret and
a `fetch` share a module, and wrong that this implies exfiltration, because the secret authenticates
the very endpoint being called and that endpoint is on the user's own machine.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/PicGo/dsh-plugin /tmp/picgo-audit
cd /tmp/picgo-audit && git rev-parse HEAD   # expect 84766fcbda8c9d50d55d0f89865e9c3428db17d4

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/picgo-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(" src/ --include="*.ts" | grep -v __tests__     # expect exactly 2 hits, both src/server.ts
grep -rn "process.env" src/ | grep -v __tests__                 # expect exactly 1: PICGO_SERVER_SECRET
grep -rnE "eval\(|new Function|vm\.|child_process" src/         # expect: no hits
sed -n '344,358p' src/server.ts                                 # secret resolution order, and what it refuses to read
sed -n '77,107p' src/router.ts                                  # the narrow fallback rule

# 4. Read what npm actually ships
cd /tmp && npm pack @picgo/dsh-plugin@0.2.0 && tar -xzf picgo-dsh-plugin-0.2.0.tgz
grep -nE "eval\(|new Function|child_process|fetch\(|process\.env" package/lib/index.js
#   expect exactly 3 lines: two fetch, one PICGO_SERVER_SECRET
tar -tzf picgo-dsh-plugin-0.2.0.tgz | grep -i licen              # expect: no output (the gap named in section 1)

# 5. Confirm provenance
npm view @picgo/dsh-plugin@0.2.0 gitHead dist.attestations
#   expect gitHead 471875d5... and a slsa.dev/provenance/v1 predicate
```

## 8. Methodology and pinned inputs

- Subject: git commit `84766fcbda8c9d50d55d0f89865e9c3428db17d4` (shallow clone at
  reference/audits/picgo-dsh-plugin); companion app commit `07ec7068` at reference/audits/PicGo
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; both runs recorded in
  section 4
- Review: full manual read of src/{index,server,router,picgo,tool,command,skill,upload}.ts
  (1462 lines), cordis.patch.yml, package.json, SKILL.md, .github/workflows/release.yml; plus
  download and grep-level review of the published npm tarball
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: after adjudication no high or critical finding survives in shipped code; egress
  is loopback by default and documented; the single credential authenticates that same endpoint; no
  dynamic execution, no child processes, no telemetry. Provenance is the strongest of this batch
  (gitHead + SLSA attestation + tag-gated publish). Caps applied: the `prepare` hook fires on git
  and link installs, the `picgo` runtime dependency floats and was not audited, no S4 probe, single
  reviewer - each alone bars A. Result: B.

## 9. Strengths

1. Loopback-first by construction, with the reason written down: the literal `127.0.0.1` is used
   instead of `localhost` to skip DNS and avoid resolving to `::1` when the app binds IPv4 only
   (src/index.ts:69-71).
2. Refuses a plausible wrong answer. `resolveSecret` deliberately does not fall back to the CLI
   config's `settings.server.secret`, because that file belongs to a different installation and a
   match there would be coincidence (src/server.ts:344-351).
3. Correct agent hygiene: an empty path list is rejected rather than interpreted as PicGo's
   "upload the clipboard" default, so the model cannot exfiltrate a clipboard image by accident
   (src/tool.ts:107-111; src/server.ts:125-128).
4. The model is told not to run `picgo login` itself, with the reason (it blocks on a browser
   callback), and to relay the instruction to the human instead (src/tool.ts:153-167).
5. Release engineering is tag-gated with npm provenance and `id-token: write`, so an ordinary merge
   to main cannot publish (.github/workflows/release.yml:3-21, 101).
6. Failure attribution is honest: when the desktop app returns URLs without `origin` fields, the
   plugin reports a *count* of unattributable failures rather than guessing which input failed
   (src/server.ts:266-298).

## 10. Residual risks

1. `prepare: tsdown` (package.json:49) executes at install time for git-URL and `link:` installs.
   Prefer the registry channel, which does not trigger it.
2. The `picgo` dependency floats on `^3.0.1` and is where uploads actually happen. A compromised
   minor release of PicGo-Core would reach users of this plugin without any change to this
   repository.
3. PicGo-Core loads the user's own third-party uploader plugins from their PicGo home. This plugin
   defers that load until first use (src/index.ts:112-123), but it does not sandbox it.
4. No LICENSE file despite an MIT declaration in package.json. A licensing hygiene gap, not a
   security one, but the CHARTER treats license hygiene as non-negotiable and this fails it.
5. Uploading is inherently public: the tool's whole purpose is turning a local file into a
   world-readable URL. An agent that misidentifies a file uploads it anyway. The skill's own
   "when NOT to use" section is prompt-level guidance, not enforcement
   (skills/picgo-upload/SKILL.md).
6. Repointing `gui.host` away from loopback turns the documented local call into a remote one, with
   the bearer secret attached. Nothing prevents that; it is user configuration.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any third `fetch` call site, any second
   `process.env` read, any `child_process`, or any new lifecycle hook forces re-adjudication.
2. Check whether the `picgo` dependency range still floats, and whether it has been pinned. Pinning
   it would close residual risk 2 and is the single highest-value change this package could make.
3. Confirm `gitHead` and the SLSA attestation still track the tag being installed; a publish without
   provenance is a stop-ship signal for this package, because it already demonstrated it can do
   better.
4. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
5. Re-vet at 90 days or on any new release of `@picgo/dsh-plugin`, whichever comes first.
