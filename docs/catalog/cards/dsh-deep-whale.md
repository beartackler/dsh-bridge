# Trust Report Card: Small-tailqwq/dsh-deep-whale

## 1. Header

| Field | Value |
|---|---|
| Plugin | Three DSH Web GUI packages published from one repository: `@dsh-external/dsh-client-ui-skin-deep-whale-manager` (generic skin discovery, switching, and settings panel), `@dsh-external/dsh-client-ui-skin-maid-atelier`, and `@dsh-external/dsh-client-ui-skin-orca-link` (whale-girl themed skins) |
| Pinned subject | github:Small-tailqwq/dsh-deep-whale @ commit `af20f8e8634fbb4490ec6737593da7dbd9046963` (default branch head at audit time) |
| Provenance | Git tree audited directly. Install is by `github:` spec with `#path:` subdirectories, so what runs is this repository at whatever ref pnpm resolves, not an npm tarball. Committed `lib/*.js` bundles were NOT rebuilt from `src/` and compared. 1734 GitHub stars at snapshot. |
| License | Split: skin-manager MIT (skin-manager/package.json, LICENSE); both skins CC-BY-NC-SA-4.0 (maid-atelier/package.json, orca-link/package.json). The repository has no top-level LICENSE and GitHub reports no license for it. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of skin-manager/src in the security-relevant regions, the install skill script, both skin manifests and build configs, and the shipped bundles by grep) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A carefully engineered cosmetic skin system with no telemetry, no credential access, and skins that
contain zero network code, whose grade is set by three structural facts rather than by anything
hostile: the manager rewrites your `~/.dsh` profile patch files and shells out to `git`, it queries
`api.github.com` for update checks, and it installs straight from a moving GitHub ref while shipping
4.6 MB of committed build output that this audit did not reproduce from source.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress: skins | None. Grep for `fetch(`, `XMLHttpRequest`, `WebSocket`, and `process.env` across `maid-atelier/lib/*.js` and `orca-link/lib/*.js` returns nothing outside SVG namespace URLs. Artwork is bundled as local `.webp` files plus 18 inline `data:image` URIs; no remote image or font host. | grep verified; maid-atelier/assets/*.webp; maid-atelier/lib/client.js (data URI count) |
| Network egress: manager | One destination, `api.github.com`, built from a template literal with parameters set through `URLSearchParams`. Requests are GET-only with an `accept: application/vnd.github+json` header, a `dsh-skin-manager` user agent, and an 8-second `AbortController` timeout. Used for three read-only queries: latest commit touching a skin path, the `skin.build.json` manifest at a ref, and a two-ref compare. | skin-manager/src/index.ts:358-372, 388-420; GITHUB_OP_TIMEOUT_MS at :175 |
| Network egress: browser side | Same-origin only. The settings panel talks to its own host route with `credentials: 'same-origin'`. | skin-manager/src/client/SkinManager.tsx:436, 446, 461, 476 |
| Update checks | Not automatic. The remote `versions` action runs when the user clicks the check button in the panel; `local-versions` is offline. Results are cached for 30 seconds, branch lookups for 24 hours. | SkinManager.tsx:364; skin-manager/src/index.ts:176-177, 830-847 |
| Credential access | None. No reads of `.ssh`, `.aws`, keychains, browser profiles, or other harnesses' auth files. The GitHub calls are unauthenticated: no token is read, attached, or looked for, so update checks are subject to anonymous rate limits. A comment at the top of the file states the remote side is GitHub GET requests only, and the resolver comment says it resolves the profile patch "without inspecting credentials or unrelated files". | skin-manager/src/index.ts:44, 169-170, 358-372 |
| Child processes | One: `execFile('git', args)` through `promisify`, argv-form, no shell, `cwd` set to the skin directory, 5-second timeout, `windowsHide: true`, and every failure swallowed into `null`. Used for `rev-parse`, remote lookup, and `status --porcelain` to tell whether an installed skin is a dirty checkout. | skin-manager/src/index.ts:3, 173, 197-208 |
| Dynamic code execution | One dynamic `import()` with a computed specifier, in the install skill script: it imports the repository's own committed `skin-manager/lib/index.js` via `pathToFileURL`, after an `existsSync` check, from a path derived from the script's own location. Not attacker-influenced. | .agents/skills/dsh-skin-install/scripts/stage-mutual-exclusion.mjs:53-54 |
| Filesystem writes (extra scrutiny) | The manager rewrites DSH profile patch files: `~/.dsh/profiles/<profile>/cordis.patch.yml` and `~/.dsh/cordis.patch.yml`. Writes are atomic (temp file, `fsyncSync`, `renameSync`) and transactional: if the second write fails, previously written files are rolled back to their original content, or removed if they did not exist. The rewrite composes a new patch "without touching content outside the managed block". Profile names are validated against `^[a-zA-Z0-9._-]+$` before path joining. | skin-manager/src/index.ts:5, 44-57, 610-667 |
| Startup behavior | On activation the manager enforces mutual exclusion: if two or more installed skins are enabled at once it atomically falls back to the official default. This is a write to your profile patch that happens without a click, though only in the two-skins-enabled state. | skin-manager/src/index.ts:712-721, 866-871 |
| Route surface | One exact route. GET returns the skin catalog; POST accepts `local-versions`, `versions`, or a switch target. Cross-site requests are rejected 403 by a `sec-fetch-site` check plus an origin-versus-host comparison; request bodies are capped at 16 KB; the switch target must be `official` or an id present in the discovered catalog, otherwise it throws. | skin-manager/src/index.ts:808-856, 728-739, 741-750 |
| Lifecycle hooks | None. No `preinstall`, `install`, `postinstall`, or `prepare` in any of the three `package.json` files; `scripts` contains only `build` and `test`. | package.json files, all three |
| Telemetry | None found. No analytics, beacon, or vendor SDK strings anywhere in the repo. | grep verified |

The skin-manager patch inserts one permanent row; each skin ships its own `cordis.patch.yml` and a
`skin.json` describing its wiring id, body attribute, and display order.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.
Raw output: 416 findings (9 critical, 59 high, 1 medium, 347 low), machine grade F, families
CRED/EXEC/NET/OBFU; 104 files scanned, 43 skipped, 10437593 bytes. The F is driven by a
`cred-plus-net-split` gate, a dynamic-execution gate, and a finding-density gate. Adjudication below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 x8 "enumerates the entire process environment", maid-atelier/build/tsdown.client.ts:134-135, 235-236 and orca-link/build/tsdown.client.ts:134-135, 235-236 | False positive. Standard bundler define injection: `'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')` reads one named variable at build time and substitutes it as a literal. The `build/` directories are not in any package's `files` list, so they never reach a user's machine. Shipped `lib/*.js` contains zero `process.env` reads. | file:line above; package.json `files` in all three packages |
| EXEC-004 critical, skin-manager/lib/index.js:3 (`import { execFile } from "node:child_process"`) | Real capability, correctly detected, wrongly severed from context. This is the compiled form of the `git` probe described in section 3: argv-form, fixed executable, fixed subcommands, 5-second timeout, errors swallowed. Kept as DAT-EXEC-1 below rather than dismissed. | skin-manager/src/index.ts:197-208 |
| Gate `cred-plus-net-split` ("credential access and network egress occur in the same package (maid-atelier, orca-link) alongside a concealment signal") | False positive on both halves. The credential half is the `NODE_ENV` define above, in build config. The concealment signal is OBFU-010 at orca-link/tests/apply.spec.ts:50, a `decodeURIComponent` in a test assertion about a favicon's data URI. Neither skin package contains any network call at all. | grep verified; orca-link/tests/apply.spec.ts:50 |

### Findings kept (documented behavior or real residual risk)

| ID | Severity | Location | Note |
|---|---|---|---|
| DAT-SUPPLY-1 | high | README.en.md install commands; skin.build.json in each skin | Installation is `dsh plugin --profile web add 'github:Small-tailqwq/dsh-deep-whale#path:/<pkg>'`. A `github:` spec with no ref pins nothing: what pnpm fetches is the default branch at install or update time, not this audited commit. Compounding it, each skin ships a committed `lib/` bundle (3.2 MB and 1.4 MB) plus a `skin.build.json` fingerprint whose `sourceCommit` (`fbe7c1b8...`) is not the audited HEAD, and no build was reproduced during this audit to confirm the bundles correspond to the `src/` in the same tree. |
| DAT-FS-1 | medium | skin-manager/src/index.ts:44-57, 610-667, 712-721 | The manager holds write access to your DSH profile patch files and exercises it, including once automatically at startup. The implementation is unusually careful (atomic writes, transactional rollback, managed-block-only edits, profile-name validation), but a cosmetic plugin that rewrites harness configuration is a larger blast radius than a stylesheet. |
| DAT-EXEC-1 | medium | skin-manager/src/index.ts:3, 173, 197-208 | Shipped code spawns `git`. Constrained to argv form with fixed subcommands and a short timeout, and only within skin directories, but it is process execution present in the runtime bundle. |
| DAT-NET-1 | low | skin-manager/src/index.ts:358-372 | Update checks reveal to GitHub that this machine is checking these skins, unauthenticated and on user click. No payload beyond the query itself; no session data leaves. |
| DAT-LICENSE-1 | low | maid-atelier/package.json; orca-link/package.json; repository root | Both skins are CC-BY-NC-SA-4.0: non-commercial and share-alike. Character artwork is credited to two named artists (README.en.md, Copyright Holders table) and shipped as `NOTICE` files. Fine for personal use, a real constraint inside a company. The repository itself declares no top-level license. |
| DAT-EXEC-2 | low | .agents/skills/dsh-skin-install/scripts/stage-mutual-exclusion.mjs:53-54 | The install skill imports the repository's committed `lib/index.js` by computed path and calls `useSkin`, which writes profile patches. Path is derived from the script's own location and existence-checked; still, an agent-invoked script that mutates harness config is worth reading before you run it. |

### Scanner noise dismissed (with scope)

- NET-007 x42 and NET-008 x189: `http://www.w3.org/2000/svg` namespace strings in icon code (orca-link/src/client/icons.ts:22, index.ts:37, 70; maid-atelier/src/client/titlebar-brand.ts:8 and their compiled forms), funding URLs in `skin-manager/package-lock.json` (opencollective, tidelift), and `gitlab.com` literals inside remote-parser tests (skin-manager/tests/version.spec.ts:102, 344). None are egress.
- OBFU-012 x158: hex and unicode escapes inside the compiled client bundles and CSS. Standard bundler output over CJK strings and inline data URIs.
- EXEC-004/EXEC-005 highs at scripts/write-skin-build.mjs:2, 21 and skin-manager/tests/version.spec.ts:1, 20: `execFileSync('git', ['rev-parse','HEAD'])` in the maintainer's build-fingerprint writer, and `execFileSync('git', ['--version'])` as a test precondition. Neither directory is published (`files` lists exclude `build/` and `scripts/`; `tests` is included as source for inspection but never executed by the host).
- NET-003 high, skin-manager/src/index.ts:6: `import type { IncomingMessage, ServerResponse } from 'node:http'`. A type-only import for the inbound route handler.
- OBFU-010 medium, orca-link/tests/apply.spec.ts:50: `decodeURIComponent` in a test assertion checking a generated favicon.

### Negative claims and what was searched

Searched all three packages' `src/` and shipped `lib/`, the `.agents` skill, both `build/` configs,
all `cordis.patch.yml` and `skin.json` files, and every `package.json`. No telemetry, analytics, or
beacon strings anywhere. No credential-path reads. No `eval`, `new Function`, or `vm` in any file.
No npm lifecycle hooks in any package. No network code of any kind in either skin package. The only
outbound host in the entire repository's runtime code is `api.github.com`; the only executable
spawned is `git`; the only files written outside a skin's own directory are the two DSH profile
patch paths.

## 5. What we could not check

- **Bundle-to-source correspondence.** The committed `lib/client.js` and `lib/index.js` in all three
  packages (4.6 MB total) were not rebuilt from `src/` and diffed. Grep of the bundles is consistent
  with the sources read, but consistency is not equality, and because installs come from `github:`
  refs these bundles are exactly what executes.
- **Behavioral probe.** Nothing was installed. No DSH profile was mounted, no skin switched, no
  patch file written or restored, and the transactional rollback path was never exercised.
- **Artwork provenance.** The webp assets were confirmed to be valid images and nothing else, but
  the artist attributions in the README were not independently verified.
- **Cross-model review.** Single reviewer, one model.
- **Upstream compatibility claims.** The `dshCompatibility` field pattern is validated in code; no
  real Harness version was tested against it.

## 6. Reviewer disagreement

Single-reviewer pass. Machine grade F versus adjudicated C. The F rests on the `cred-plus-net-split`
gate, which fires because two build config files read `NODE_ENV` while a sibling package makes GitHub
requests; the packages named by the gate (maid-atelier, orca-link) contain no network calls at all.
The dynamic-execution gate fires on a single self-referential import in an install helper. Removing
the build-config and test material leaves one genuine capability set, listed as DAT-EXEC-1, DAT-FS-1,
and DAT-NET-1, which sits comfortably above F and below B once DAT-SUPPLY-1 is counted.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Small-tailqwq/dsh-deep-whale /tmp/whale-audit
cd /tmp/whale-audit && git rev-parse HEAD   # expect af20f8e8634fbb4490ec6737593da7dbd9046963

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/whale-audit   # from a dsh-bridge checkout

# 3. Prove the skins have no network or env code
grep -nE "fetch\(|XMLHttpRequest|WebSocket|process\.env" maid-atelier/lib/*.js orca-link/lib/*.js

# 4. Read the three things that actually have capability
sed -n '197,208p'  skin-manager/src/index.ts    # the git spawn
sed -n '358,372p'  skin-manager/src/index.ts    # the only outbound host
sed -n '640,667p'  skin-manager/src/index.ts    # profile patch rewrite + rollback
sed -n '728,739p'  skin-manager/src/index.ts    # same-origin gate on the route

# 5. Confirm no install hooks and see what ships
grep -nE '"(pre|post)?install"|"prepare"' */package.json
python3 -c "import json;print(json.load(open('maid-atelier/package.json'))['files'])"
```

## 8. Methodology and pinned inputs

- Subject: git commit `af20f8e8634fbb4490ec6737593da7dbd9046963` (shallow clone at
  reference/audits/dsh-deep-whale, 2026-08-26)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...aee999`
- Review: manual read of skin-manager/src/index.ts across its capability regions (profile resolution
  44-57, skin discovery 125-160, git probe 169-215, GitHub client 350-420, patch composition and
  atomic write 610-667, startup guard 712-721, origin gate and body cap 723-750, route handler
  808-871), skin-manager/src/client/SkinManager.tsx (fetch sites and the check-versions trigger),
  .agents/skills/dsh-skin-install/scripts/stage-mutual-exclusion.mjs in full, all three package.json
  files, all cordis.patch.yml and skin.json files, both skins' build configs at the flagged lines,
  README.en.md, INSTALL.md; grep sweeps over both skins' shipped bundles for egress, env, dynamic
  execution, and obfuscation markers; adjudication of every critical and every non-URL high
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: nothing hostile survives adjudication, and the engineering is above average for
  the ecosystem (atomic transactional config writes, an origin gate, a body cap, a timeout on every
  external call, a validated switch target). C rather than B because the install channel pins
  nothing and the executed bundles were not reproduced from source (DAT-SUPPLY-1, a high), because a
  cosmetic plugin rewrites harness configuration and spawns `git` (DAT-FS-1, DAT-EXEC-1), and because
  the pipeline caps any pass without a behavioral probe or cross-model review at C regardless.

## 9. Strengths

1. The patch rewrite is genuinely transactional: atomic temp-file-plus-fsync-plus-rename per file,
   with rollback of already-written files on any failure, and restoration to non-existence for files
   that did not previously exist (skin-manager/src/index.ts:648-666).
2. The route is defended without being fussy: cross-site rejection on `sec-fetch-site`, origin
   compared against host, a 16 KB body cap, and a switch target validated against the discovered
   catalog rather than trusted from the request (:728-750, :851-855).
3. Every external operation has a timeout: 5 seconds for git, 8 for GitHub, with caching to avoid
   repeat calls (:174-177).
4. Update checking is user-initiated and the catalog never blocks on it, with an explicit comment
   saying so (:816-818).
5. The startup mutual-exclusion guard is a real correctness feature: a fresh install of two skins
   cannot leave them stacked, and the fallback is to the official default rather than an arbitrary pick.
6. Attribution is handled properly: per-skin `NOTICE` files, named artists with profile links, and a
   request that users route feedback through the issue tracker instead of contacting the artists.

## 10. Residual risks

1. `github:` installs float. Between your install and your next update, the default branch can change
   and you will run whatever it became. Pin a commit in the spec if your workflow allows it.
2. What executes is a committed bundle, not the TypeScript you can read. Until someone reproduces the
   build, `src/` is documentation of the bundle rather than proof of it.
3. This plugin can rewrite your `~/.dsh` profile patches, and does so at startup in one specific
   state. If a patch file matters to you, back it up before first run.
4. CC-BY-NC-SA-4.0 on both skins makes commercial use a licensing question, not a technical one.
5. Update checks are anonymous GitHub API calls; they will rate-limit on a shared IP, and they tell
   GitHub you are running these skins.

## 11. Re-verify steps

1. Re-run step 7 against current HEAD. Any second hostname in `skin-manager/src/index.ts`, any
   `process.env` read appearing in a shipped `lib/`, any `fetch` appearing in either skin, or any new
   `child_process` reference must be re-adjudicated before this grade carries forward.
2. Rebuild `skin-manager`, `maid-atelier`, and `orca-link` with the pinned devDependencies and diff
   the output against the committed `lib/` bundles. A clean diff downgrades DAT-SUPPLY-1 materially
   and opens the B band.
3. Watch the install instructions: if upstream publishes to npm with pinned versions or documents a
   ref-pinned `github:` spec, re-examine DAT-SUPPLY-1.
4. Re-read the patch-writing region (`switchPatch`, `atomicWrite`, `useSkin`) on any release. Any
   edit that reaches outside the managed block, or any loosening of the profile-name regex at
   index.ts:56, is a re-audit trigger.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
