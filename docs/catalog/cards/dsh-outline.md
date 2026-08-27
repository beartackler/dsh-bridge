# Trust Report Card: dsh-outline

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-outline` (DSH web plugin: realtime conversation outline panel; user questions plus markdown headings) |
| Pinned subject | github:urzeye/dsh-outline @ commit `8f2c3e0a17c1d6e2c10394ffdaed7c1eb81cef9f` (default branch head, committed 2026-08-26) |
| npm integrity | Not checked. The release workflow can publish to npm behind a repo variable (`.github/workflows/release.yml`, `if: vars.NPM_PUBLISH == 'true'`), but no registry tarball was fetched or compared. |
| Provenance | GitHub Actions CI and release workflows present; release verifies tag equals package.json version, runs typecheck/test/build, packs a tarball. No SLSA attestation configured. |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0, rulesDigest `d7d5d9eb...41f3`, plus manual read of src/index.ts, src/client/index.tsx, src/client/store.ts, tsdown.config.ts, both workflows, and sink greps across all of src/) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The host half is deliberately empty and the client half is a pure React panel that reads the DSH
client runtime's conversation snapshot: no network calls, no filesystem access, no credentials, no
child processes, no dynamic code execution, and the only persistence is `localStorage` holding four
UI preferences.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, or `Image()` beacon anywhere in src/. The only URLs are the repo link in the panel footer and the repository field in package.json. | grep across src/; src/client/panel/OutlinePanel.tsx:39; package.json:10 |
| Host-side behavior | None. `apply(_ctx)` has an empty body; the module exists only as the cordis anchor the bundle patch mounts. The file says so explicitly. | src/index.ts:1-15 |
| Client-side behavior | Registers two dictionaries and one `shell.overlay` slot entry rendering `OutlinePanel`. Injected services are `slots`, `sessions`, `locale`. | src/client/index.tsx:18-41 |
| Filesystem access | None. No `node:fs` import anywhere in src/. | grep across src/ |
| Persistence | `window.localStorage` get/set of one key holding user UI preferences (pinned state, position, default level, favorites). Nothing else is stored. | src/client/store.ts:4, 28, 37 |
| Credential access | None. No auth files, no env reads at runtime, no keychain. | grep across src/ |
| Dynamic code execution | None. No eval, `new Function`, `vm`, or dynamic `import()`. | grep across src/ returned zero hits |
| Telemetry | None. No analytics, beacon, or metrics code in src/, tests/, or workflows. | negative claim, scope stated |
| Lifecycle hooks | `"prepare": "pnpm run build"` runs a local `tsc` plus `tsdown` build. It executes on `pnpm install` in a git checkout, not on consumers of a published tarball (npm skips `prepare` for installs from a registry tarball). No install/postinstall. | package.json:59 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 11 findings (1 critical, 7 high, 1 medium, 2 low), machine grade F. All adjudicated
below. Every high-severity finding is a false positive.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED critical, tsdown.config.ts:103 `'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')` | False positive. This is the standard bundler `define` that inlines the build-time NODE_ENV constant into the browser bundle. It reads one well-known build variable at build time, never at runtime, and never transmits anything (the plugin has no network egress at all). | tsdown.config.ts:95-110 |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| OL-HOOK-1 | low | package.json:59 | `prepare` build script. Local-checkout build only; runs `tsc` and `tsdown`, both devDependencies. Not an install-time hook for tarball consumers. |
| OL-STORE-1 | low | src/client/store.ts:28-37 | Writes UI preferences to `localStorage`. Same-origin browser storage, no transmission. |
| OL-LINK-1 | low | src/client/panel/OutlinePanel.tsx:39 | A rendered link to the plugin's own GitHub repo. User-initiated navigation, not a fetch. |

### Scanner noise dismissed (with scope)

- 6 HOOK highs matching the literal string `npm install` inside Chinese documentation comments and
  inside test fixtures that assert markdown-heading parsing handles inline code spans
  (src/core/markdown-heading.ts:23; tests/dom-anchor.spec.ts:121, 127, 129, 131;
  tests/markdown-heading.spec.ts:39, 45). None of these are executed commands.
- 2 NET lows on repository metadata URLs.

### Negative claims and what was searched

Searched all of src/ (core/ and client/), tests/, tsdown.config.ts, vitest.config.ts, both
`.github/workflows/*.yml`, cordis.patch.yml, dsh.plugin.json, package.json: no fetch or any other
network API; no `node:fs`, `node:child_process`, or `node:os` imports; no eval family; no
`innerHTML` or `dangerouslySetInnerHTML`; no credential paths; no telemetry endpoints; no
obfuscation (TypeScript source, unminified, commented); no timers doing I/O.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review
  covers the same surfaces but cannot rule out runtime behavior introduced by host services.
- **Published-artifact comparison.** `lib/` is not committed at this pinned commit; it is produced
  by `tsc` plus `tsdown` at publish time. We did not build and byte-compare against any npm tarball,
  and the release workflow configures no provenance attestation.
- **Build-tool trust.** `tsdown`, `unrun`, `lightningcss`, and the DSH client packages are resolved
  from npm at build time; their contents are outside this artifact.
- **The 13 MB checkout** is dominated by `docs/media/demo.gif` and `pnpm-lock.yaml`; the GIF was not
  inspected for content.
- **The CI workflow** (`.github/workflows/ci.yml`) was listed but only the release workflow was read
  line by line.
- **Chinese-language docs** (README, docs/technical-plan.md, docs/feasibility.md) were not read in
  full, so behavior described only there is not corroborated here.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F, driven entirely by a bundler `define` line and by the
phrase "npm install" appearing in comments and test fixtures. The manual verdict is A. Both
positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/urzeye/dsh-outline /tmp/outline-audit
cd /tmp/outline-audit && git rev-parse HEAD   # expect 8f2c3e0a17c1d6e2c10394ffdaed7c1eb81cef9f

grep -rn "fetch(\|XMLHttpRequest\|sendBeacon\|WebSocket" src   # egress: none
grep -rn "node:fs\|node:child_process\|node:os" src            # host APIs: none
grep -rn "eval(\|new Function\|innerHTML" src                  # dynamic exec / HTML sinks: none
cat src/index.ts                                               # host half: empty apply()
sed -n '20,40p' src/client/store.ts                            # the only persistence
```

## 8. Methodology and pinned inputs

- Subject: git commit `8f2c3e0a17c1d6e2c10394ffdaed7c1eb81cef9f` (shallow clone at
  reference/audits/dsh-outline).
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`; 34 files scanned, 317246 bytes.
- Review: full read of src/index.ts, src/client/index.tsx, src/client/store.ts (persistence path),
  tsdown.config.ts client target, .github/workflows/release.yml, package.json; sink-grep across all
  of src/ and tests/ with each hit read in place.
- Cross-model review: NOT performed. Card revision 1 is capped accordingly.
- Grade derivation: no egress, no credential access, no filesystem access, no child processes, no
  dynamic execution, no install-time hooks; the sole side effect is browser-local UI preference
  storage. That is the A band. Not higher-confidence than A because there is no published-artifact
  binding and no behavioral probe (see section 5).

## 9. Strengths

1. Genuinely minimal attack surface: the host half is an empty `apply()` and says so in its own
   header comment (src/index.ts:1-6).
2. Every `@deepseek-ai` import in the client entry is type-only and erased at build; value imports
   stay inside the loader module table (src/client/index.tsx:1-16).
3. Store is created per activation via a factory rather than a module-level singleton, following the
   documented DSH rule (src/client/index.tsx:31-33).
4. Release workflow refuses to publish when the git tag disagrees with package.json version, and
   runs typecheck, tests, and build before packing (.github/workflows/release.yml).
5. Substantial unit test suite covering the outline tree, markdown heading parsing, DOM anchoring,
   panel geometry, and scroll math (7 spec files).

## 10. Residual risks

1. Published `lib/` is built at release time and not reproduced here; a compromised build environment
   or a malicious build dependency would not be visible in this source audit.
2. The panel reads conversation content (user questions and headings) to build the outline. That data
   stays in the browser at this commit, but any future addition of a network call would sit directly
   on top of conversation text.
3. `prepare` runs a build on `pnpm install` in a checkout; contributors execute build tooling from
   the lockfile as a matter of course.
4. Peer dependencies are DSH rc packages with caret ranges; a future rc could change client-runtime
   semantics under this plugin.

## 11. Re-verify steps

1. Re-run the section 7 block against the current HEAD. Any first network call, any `node:` builtin
   import, or any new `scripts` entry in package.json must be re-adjudicated before this grade
   carries forward.
2. If npm publishing is enabled (`vars.NPM_PUBLISH == 'true'`), start pinning and diffing
   `npm view dsh-outline dist.integrity` and add a build reproduction step.
3. Re-read src/client/store.ts on any bump: an expansion beyond UI preferences (for example caching
   conversation text) changes the data-at-rest story.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
