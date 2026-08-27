# Trust Report Card: @0xsline/dsh-spotlight

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@0xsline/dsh-spotlight` (keyboard-first command palette for DSH Web) |
| Pinned subject | github:0xsline/dsh-spotlight @ commit `b3565e8629d9a393d764681e96f4c41100cc12fa` (main, 2026-08-24) |
| npm integrity | not checked (no npm publication verified from this checkout; install path documented is the git spec) |
| Provenance | not checked |
| License | MIT (LICENSE) |
| Stars at audit | 18 |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of src/ and scripts/) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A self-contained client-side command palette: it reads the current page's DOM and three host
services to build a searchable action list, stores only a keyboard shortcut in `localStorage`, and
makes no network request and touches no credential in any shipped code path.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The only `http://` literals in `src/` are the SVG namespace URI used to build the search icon. No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `navigator.sendBeacon` anywhere in `src/`. | src/spotlight/mount.ts:41,44; grep across src/ |
| Host services used | `sessions`, `remote.commands`, `remote.pluginInventory`, `commandUi`, read by name through narrow local contracts. | src/client/index.ts:31,55-61 |
| DOM reach | Enumerates visible actionable elements (`a[href]`, buttons, roles) and reads their `aria-label`/`title`/`textContent` to build palette entries; clicks them on user selection. Also locates the composer and the chat scroller. | src/spotlight/discovery.ts:11,22-45,159-178 |
| Session data read | Lists recent sessions from the host `sessions` snapshot (title, cwd, preset, running flag) for display only. | src/spotlight/discovery.ts:181-203 |
| Command dispatch | Bare host commands go through `commands.execute(sessionId, "/name")`; anything with arguments is written into the composer so the host's own slash pipeline owns it. | src/spotlight/discovery.ts:205-227 |
| Persistence | One `localStorage` key holding the user's chosen shortcut. Reads and writes are try/caught. | src/spotlight/mount.ts:78,84-85 |
| Child processes | Only in dev scripts, never in shipped code: `scripts/prepare.mjs` spawns locally resolved `tsc` and `tsdown`; `scripts/extract-patch.mjs` runs `git` against a harness checkout the maintainer points at. Neither is imported by `src/`. | scripts/prepare.mjs:5,26; scripts/extract-patch.mjs:30,40 |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, or dynamic `import()` in `src/` or `scripts/`. | grep across src/, scripts/ |
| Telemetry | None found. Searched `src/`, `scripts/`, `cordis.patch.yml` for analytics/beacon/metrics/egress patterns; zero hits. | negative claim, scope stated |
| Bundle patch | Single `insert` row adding the package to the profile composition; no host-tree edits. | cordis.patch.yml |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 8 findings (7 high, 1 medium), machine grade F, driven entirely by the EXEC family in
dev scripts and by SVG namespace strings classified as network egress.

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x2 `src/spotlight/mount.ts:41,44` | False positive. `document.createElementNS('http://www.w3.org/2000/svg', ...)` is an XML namespace identifier, not a request target. | lines read directly |
| EXEC high x2 `scripts/prepare.mjs:5,26` | True but scoped to build. Spawns `process.execPath` on `typescript/bin/tsc` and `tsdown/dist/run.mjs` resolved from the local `node_modules`; exits with an error if either is absent rather than fetching anything. | prepare.mjs:10-32 |
| EXEC high x2 `scripts/extract-patch.mjs:30,40` | Maintainer tool. `execFileSync('git', ['-C', harness, ...])` against a path from `--harness`/`$DSH_HARNESS`. Not reachable from the plugin entry points. | extract-patch.mjs:39-60 |
| EXEC high `tests/package.spec.ts:39` | Test asserting the string `spawnSync(process.execPath` appears in the prepare script. Not executable behavior. | line read |
| HOOK medium `package.json:15` `"prepare": "node scripts/prepare.mjs"` | Kept as a real finding, low severity. `prepare` runs on install from a git spec, which is the documented DSH install path, so the consumer's machine does run this script. It only deletes `lib/` and runs the two local build binaries; no network, no credential access, no writes outside the package directory. | package.json:15; prepare.mjs:19-32 |

Findings kept after adjudication: one low (`SPOT-HOOK-1`, the `prepare` script). No highs, no
criticals in shipped code.

Negative claims and what was searched: full read of `src/index.ts`, `src/config.ts`,
`src/runtime.ts`, `src/invariant.ts`, `src/client/index.ts`, `src/spotlight/{discovery,host,
keyboard,mount,search}.ts` (1012 lines total), `scripts/{prepare.mjs,extract-patch.mjs,patch.sh}`,
`package.json`, `cordis.patch.yml`. No credential paths (`.ssh`, `.aws`, `auth.json`, keychain,
`process.env` reads outside the maintainer script), no cookie or `sessionStorage` access, no
obfuscation markers, no minified shipped source (`src/` is published as plain TypeScript per
`files`), no timers doing deferred network work.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, activate, keypress, or idle-soak run was performed. Static review covered the same surfaces but cannot rule out environment-dependent behavior.
- **Published artifact.** `lib/` is generated at install time by `prepare` and is not in the git tree, so there is no built bundle to compare against `src/`. We did not run `pnpm install && pnpm prepare` and diff the output.
- **npm registry.** No integrity hash or provenance attestation was fetched; this card grades the git tree only.
- **Dev dependency tree.** `tsdown`, `typescript`, `vitest`, `happy-dom` and their transitives are installed on the user's machine by the `prepare` flow; those packages are outside this artifact and were not joined against an advisory snapshot.
- **`scripts/patch.sh` and `scripts/extract-patch.mjs` were read but not executed**, and `patches/host-patch.config.json` is absent from the tree, so the host-patch flow could not be exercised.
- **Host service contracts.** `sessions`, `remote.commands`, and `remote.pluginInventory` are read by name; what the host exposes through them was not audited here.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F; the manual
verdict is A. Both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/0xsline/dsh-spotlight /tmp/spotlight-audit
cd /tmp/spotlight-audit && git rev-parse HEAD   # expect b3565e8629d9a393d764681e96f4c41100cc12fa

node tools/scan/dist/index.js /tmp/spotlight-audit          # from a dsh-bridge checkout

grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" src   # egress: none
grep -rnE "eval|new Function|vm\.|import\(" src               # dynamic exec: none
grep -rn "localStorage" src                                   # one shortcut key, mount.ts:78,84,85
sed -n '14,32p' scripts/prepare.mjs                           # prepare hook: local tsc + tsdown only
```

## 8. Methodology and pinned inputs

- Subject: git commit `b3565e8629d9a393d764681e96f4c41100cc12fa` (shallow clone at reference/audits/dsh-spotlight)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 41 files scanned, 17 skipped, 130024 bytes
- Review: full manual read of every file in `src/` and `scripts/`, plus `package.json` and `cordis.patch.yml`. Test files under `tests/` were read only where a scanner finding pointed at them.
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start A. No egress, no credential access, no dynamic execution, no telemetry, no host-tree patching, and a single narrow persistence key. One low finding (install-time `prepare` build hook, local binaries only) does not move the band. A grade above A is not available; caps applied: none beyond the single-reviewer note.

## 9. Strengths

1. Zero network surface in shipped code. The palette is entirely local to the page and the host services it declares.
2. Argument-bearing commands are handed to the host's own slash pipeline instead of being executed by the plugin, keeping the plugin out of the trust path for command input (src/spotlight/discovery.ts:205-217).
3. Palette entries are filtered rather than trusted: command names must match `^[a-z0-9_-]{1,80}$`, titles longer than 80 characters and disabled elements are dropped, and the plugin excludes its own DOM subtree from discovery (discovery.ts:16,19-21,166-168).
4. Bundle patch is a single composition row; the plugin does not edit the host tree.
5. Persistence is one key with try/caught access, so a hostile or full `localStorage` cannot break the palette (mount.ts:76-87).

## 10. Residual risks

1. The `prepare` lifecycle hook runs on the consumer's machine when installing from a git spec. It is benign at this commit, but it is a code-execution seam that must be re-read on every upgrade.
2. Discovery clicks arbitrary page elements on user selection. A hostile element injected into the host UI by some other plugin would be surfaced as a palette entry with its own label; the palette does not distinguish trusted from untrusted DOM.
3. The palette reads session titles and working directories into an on-screen list. Nothing leaves the browser, but the panel makes that metadata visible to anyone looking at the screen or screen-sharing.
4. `lib/` is built at install time from dev dependencies resolved then, so the shipped bytes are not fixed by this commit alone.
5. UI strings are Chinese-first with English detail lines (e.g. discovery.ts:118, mount.ts:117), which is a fit issue for an English-first catalog, not a security one.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new literal URL, `fetch`/`eval` hit, or new `localStorage`/credential path must be re-adjudicated before this grade carries forward.
2. Diff `package.json` scripts on every upgrade: a new `install`/`postinstall`/`preinstall` entry, or a `prepare` script that reaches the network, is a finding that breaks the A grade.
3. Re-read `src/spotlight/discovery.ts` after upstream changes: new host services in `inject` (src/client/index.ts:31) mean new data surfaces.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
