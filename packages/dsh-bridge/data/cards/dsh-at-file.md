# Trust Report Card: dsh-at-file (`omdsh-dev/dsh-at-file`, now `FSMargoo/dsh-at-file`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | dsh-at-file 0.6.8 - Codex-style `@path` references for the DeepSeek Harness web GUI. Host half registers one Typert Remote service that indexes the active session's workspace and returns paths; client half adds the composer picker. It never opens mentioned files; it writes a `<workspace-reference>` marker into the draft. |
| Pinned subject (git) | github:omdsh-dev/dsh-at-file @ commit `c37b0ed9e8bf3585bf9f272462dcf01886efe2a3` (default branch head at audit time, committed 2026-08-23T00:48:23+08:00, "fix: keep root files visible in at-file picker") |
| Stars | 394 (catalog snapshot 2026-08-19); 477 at audit time under the repo's new owner - GitHub now redirects `omdsh-dev/dsh-at-file` permanently to `FSMargoo/dsh-at-file` (repository id 1333068434) |
| Distribution | Git-tag tarball into a DSH profile: `dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.8.tar.gz` (README.md:50-52). Also on npm as `dsh-at-file`, latest published 0.6.3. |
| License | MIT (LICENSE, "Copyright (c) 2026 dsh-at-file contributors") |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of host service, indexer, mention path, client bundle, build script) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: a small, single-purpose UI plugin whose shipped code performs no network I/O and no credential access anywhere, capped at C by the incomplete pipeline, by a dynamic-code-evaluation construct inherited from the bundled vendored schemastery copy, and by npm provenance that could not be tied to this commit.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| Workspace path indexing | `search` resolves the live agent's session `cwd`, walks it with a hard `maxIndexedFiles` cap (default 5000), ignore dirs, and user-managed ignore-file rules, then returns bounded entries. Refuses when disabled in settings. | src/runtime.ts:56-77; src/files.ts:9-16 |
| Paths only, no content | The wire contract returns workspace-relative names and absolute paths; the module docstring and behavior agree that file content never crosses the boundary. | src/runtime.ts:8-10 |
| Mention marking | Before each agent step it verifies the referenced path exists in-workspace and appends a `<workspace-reference path="..." kind="..."/>` message; it does not open the file or list directories. | src/mention.ts:95; README.md:15-23 |
| Settings surface | Enable switch plus global/per-workspace Exact and Regex basename filters, validated host-side. | README.md:59-77; src/settings.ts |
| Web client | One CJS bundle served at `/plugins/dsh-at-file/client.js` through a ModuleLoader factory handshake; react and dsh packages stay external. | build.mjs:29-44 |
| Network egress | None found. No fetch, XMLHttpRequest, WebSocket, or http/https request exists in `src/`, `lib/index.js`, or `lib/client.js`. Every scanner NET hit is a string literal (see section 4). | grep across src/ and bundles; findings table below |
| Credential access | None found. No environment scraping, no keychain, no token handling. | full-source review |
| Dynamic code execution | One construct ships, inside the bundled vendored schemastery serializer, not in plugin logic. | lib/index.js:303-305 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **24 findings** (1 critical, 19 high, 4 medium) over 68 scanned
files, machine grade **F**, score 0, off `dynamic-exec-present`, `finding-density`, and the
critical-count cap. Every gate adjudicates to benign origin:

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| Critical + high `dynamic-eval`, `lib/index.js:304`: `schema.callback = new Function("return " + schema.callback)()` | This is the vendored schemastery schema-deserialization branch, bundled verbatim. The identical construct exists in the harness's own vendor tree, including the empty catch. The plugin builds its `Config` schema in memory with `z.object(...)` and never serializes or deserializes schemas from strings, so the branch is unreachable from plugin inputs. Bundle header marks the vendor segment. | lib/index.js:264 (segment header), :303-305; deepseek-harness `vendor/schemastery/src/index.ts:258-262`; src/index.ts:47-51 |
| High `dynamic-eval` x3, `build.mjs:61-62` `execFileSync('node_modules/.bin/tsc', ...)`, plus esbuild import | Build-script typecheck step appended after the two bundle builds. `build.mjs` is not shipped: package `files` is `lib`, `cordis.patch.yml`, `dsh.plugin.json`, READMEs, LICENSE. | build.mjs:11, 61-62; package.json `files` |
| High `network-egress` x16, all string constants | Four hits are zod-v4's own IPv6-in-host URL validator building `new URL("http://[" + value + "]")`; twelve are `$schema` identifier literals (`https://json-schema.org/...`) emitted by zod's JSON-Schema conversion helpers. zod is bundled into both halves (80 module markers in `lib/index.js`). None performs I/O. | lib/client.js:2585, 2622, 11676-14121; lib/index.js:3760, 3797, 12851-15296; zod segments begin lib/index.js:1205 |
| Medium `obfuscation`, `lib/client.js:1284` `atob(...)`, `lib/index.js:106` byte-decode loop | Base64/binary decode helpers inside the bundled zod payload codec; decoded values are parsed data, never code. | lib/client.js:1284; lib/index.js:106 |
| Medium `lifecycle-hooks` x2, top-level IIFEs | esbuild enum lowering (`ZodFirstPartyTypeKind` IIFE) at module scope of the zod bundle; ordinary module initialization, not install-time hooks. No npm lifecycle scripts exist in package.json. | lib/client.js:14033; lib/index.js:15208; package.json scripts |

### The one thing worth knowing before installing

The shipped host bundle contains a `new Function` evaluator because the author bundled the harness's
own vendored schemastery rather than declaring it external (build.mjs:12 externalizes only
`@deepseek-ai/cordis` and `@deepseek-ai/dsh-*`). We traced the construct byte-for-byte to the
upstream vendor source and found no input path that reaches it, but its presence means the bundle
carries machinery the plugin itself does not need.

## 5. What we could not check

- **Behavioral probe.** No sandboxed run against a live `dsh web` instance (pipeline S4 unavailable).
- **Cross-model review.** Single reviewer.
- **npm provenance.** Published `dsh-at-file@0.6.3` differs from this HEAD (HEAD is 0.6.8, unpublished),
  and the shallow clone cannot prove 0.6.3 equals its matching historical commit. The README's
  recommended channel is the GitHub v0.6.8 tag tarball, which was not separately downloaded and hashed.
- **Repository rename.** The move from `omdsh-dev` to `FSMargoo` is recent; future tag URLs under the
  old owner depend on GitHub redirect persistence.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. The gap: the sole critical is a third-party
serializer branch traced to the harness's own vendor tree, all sixteen egress highs are inert string
literals, and the executable build step never ships. C rather than B because the pipeline ceiling bars
B this pass, the bundle ships an evaluator it does not use, and the install channel's tarball was not
independently reproduced.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/FSMargoo/dsh-at-file /tmp/atfile-audit
cd /tmp/atfile-audit && git rev-parse HEAD   # expect c37b0ed9e8bf3585bf9f272462dcf01886efe2a3

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/atfile-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '303,305p' lib/index.js                 # the adjudicated new Function (vendored schemastery)
sed -n '256,263p' ../deepseek-harness/vendor/schemastery/src/index.ts  # upstream twin
grep -n "execFileSync" build.mjs               # build-only process spawn
grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|http.request" src/ lib/*.js | grep -v map  # expect silence
sed -n '54,64p' src/runtime.ts                 # settings refusal + cwd resolution in search
```

## 8. Methodology and pinned inputs

- Subject: git commit `c37b0ed9e8bf3585bf9f272462dcf01886efe2a3` (shallow clone at
  reference/audits/dsh-at-file); scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 24 findings, rescored to the
  adjudications in section 4.
- Review: manual read of src/{index,runtime,files,mention,settings}.ts headers and bodies,
  build.mjs in full, the vendor segment boundaries of both bundles, package.json manifests,
  cordis.patch.yml, README install and behavior sections; grep sweeps for network, process, eval,
  and environment access across source and bundles.
- Provenance: `npm pack dsh-at-file@0.6.3` downloaded and diffed against HEAD (differs; expected,
  HEAD is ahead). Tag-tarball reproduction not performed.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives; zero live egress; zero credential access. Caps:
  pipeline ceiling, shipped-but-unreachable evaluator in the bundle, unreproduced install tarball.
  Result: C.

## 9. Strengths

1. The capability boundary is unusually narrow and honest: paths in, one XML marker out; content is
   structurally absent from the wire type (src/runtime.ts:8-10, 56-77).
2. Indexing is bounded and configurable: hard file cap with an honest truncation flag, ignore dirs,
   per-workspace filters (src/files.ts:9-16; README.md:59-77).
3. Clean dependency story: exactly one runtime dependency (zod) besides dsh peers, all peers optional
   and link-resolved in development (package.json dependencies/peerDependencies).
4. The README discloses obsolescence up front - stock DSH now ships built-in `@file`/`@session` -
   instead of quietly competing with the platform (README.md:3-5).

## 10. Residual risks

1. The bundled schemastery evaluator means any future refactor that feeds attacker-controlled strings
   into schema deserialization becomes code execution; the safety argument is "unreachable today,"
   not "impossible" (lib/index.js:303-305).
2. The client bundle runs in your browser against every keystroke in the composer; a compromised
   update could exfiltrate drafted text to wherever it wants, and updates arrive by re-running the
   tarball install command (README.md:50-53).
3. Repository ownership changed mid-life (omdsh-dev to FSMargoo); pin tags by commit hash, not by
   moving branch heads.
4. npm installs float to whatever publishes next; 0.6.3 on npm is already behind the audited tree.

## 11. Re-verify steps

1. Re-run section 7 greps against current HEAD. Any live outbound request, any environment or
   credential read, or any second evaluator construct forces re-adjudication.
2. Re-diff the next published npm version against its git tag; equality restores part of the
   provenance chain.
3. Confirm whether the author stops bundling schemastery once the harness exposes it as a peer;
   removal would clear residual risk 1.
4. Re-vet at 90 days or at the next release touching `src/runtime.ts` or the build script.
