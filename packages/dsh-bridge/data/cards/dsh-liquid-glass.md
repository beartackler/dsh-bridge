# Trust Report Card: dsh-liquid-glass

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-liquid-glass` (wallpaper plus optional Liquid Glass overlay for the DSH web UI) |
| Pinned subject | github:xingyingyuzhui/dsh-liquid-glass @ commit `573a81d66ddff86216a61ebee4c755ed49ae31de` (shallow clone HEAD, committed 2026-08-15) |
| npm integrity | Not checked. No npm publish was verified for this card; the subject is the git tree. |
| Provenance | Not established (no attestation checked). |
| License | MIT (LICENSE:1-3) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A purely cosmetic plugin: the Node half serves two bundled JPEGs from its own routes and nothing
else, the client half writes CSS and localStorage keys, and there is no network egress, no
credential access, and no dynamic code execution in any shipped file.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The only absolute URLs anywhere in shipped code are the XML namespace strings `http://www.w3.org/2000/svg` and `/1999/xlink` inside inline SVG filter markup; `grep -rhoE 'https?://...' client.js host.js src/` returns exactly those two. No fetch, XMLHttpRequest, WebSocket, or node http/https import exists. | client.js:1706, src/client/controller-styles.js:29; grep result |
| Host routes | Four exact GET/HEAD routes serving two bundled JPEGs (`/dsh-liquid-glass/assets/liquid-glass-{deepwater,ice}[.<hash>].jpg`), read from `import.meta.url`-relative asset paths only. No user path is ever joined into the read; non-GET/HEAD returns 405. | host.js:12-27, 29-98, 107-124 |
| Child processes | None. No `child_process` import in host.js, client.js, or src/. | grep |
| Credential reads | None. No `process.env`, no home-directory reads, no auth files touched in shipped code. | grep across host.js, client.js, src/ |
| Filesystem writes | None. Host code opens `readFile` on its own two assets and never writes. Client persistence is browser `localStorage` under `dsh-liquid-glass*` keys plus size-capped data URLs for user-imported wallpapers (4 MB per entry, 6 entries max). | host.js:4; client.js:24-28, 814-823 |
| Dynamic code execution | None in shipped code. All `vm.runInNewContext` and `Function(...)` hits are in `test/` helpers that load the plugin's own source for contract tests. | test/helpers/client-runtime.mjs:294, test/helpers/optics-runtime.mjs:37, test/import-contract.test.mjs:58, test/storage-contract.test.mjs:17, test/optics-map.test.mjs:144 |
| Telemetry | None. No analytics, beacon, or metrics call in shipped code (grep across host.js, client.js, src/, scripts/). | negative claim, scope stated |
| Lifecycle hooks | No npm `install`/`postinstall`/`prepare` scripts. `scripts` contains only generate/build/test entries. | package.json:17-24 |

User-imported wallpapers are read locally with `URL.createObjectURL` + canvas re-encode, rejected
above 12 MB, and stored as data URLs in localStorage. The bytes never leave the browser.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 9 findings (9 high, 0 critical), machine grade F, gates `dynamic-exec-present` and
`finding-density`. All nine adjudicated below; none survives.

| Finding | Adjudication | Evidence |
|---|---|---|
| NET-007 x4, client.js:1706 and src/client/controller-styles.js:29 | False positive. The matched strings are SVG XML namespace identifiers inside an inline `<svg>` used to define the displacement filter. XML namespaces are identifiers, not fetch targets; no code resolves them. | line read directly; the whole file has no fetch |
| EXEC-003 x4 (`vm.runInNewContext`) in test/helpers/client-runtime.mjs:294, test/helpers/optics-runtime.mjs:37, test/import-contract.test.mjs:58, test/storage-contract.test.mjs:17 | Test-only. These load `client.js` / individual `src/client/*.js` layers into a sandbox so the contract tests can call internal functions. None of these files is in package.json `files`. | package.json:15 files list excludes test/ |
| EXEC-012 (`Function(...)`) test/optics-map.test.mjs:144 | Test-only. Parses the plugin's own generated fallback object literal to compare PNG pixel hashes against goldens. | test/optics-map.test.mjs:143-149 |

Build reproducibility spot check: `node scripts/build-client.mjs --check` at this commit exits 0,
so the committed `client.js` matches what the generator produces from `src/client/`. This is the
one artifact users actually load, and it is regenerable from readable sources.

### Negative claims and what was searched

Searched host.js (125 lines, read in full), client.js (3042 lines, grepped for every network,
exec, storage, and credential primitive; head and storage layers read), all of `src/client/`,
`scripts/`, `cordis.patch.yml`, `package.json`: no eval/new Function/vm outside tests; no
child_process; no process.env; no fs writes; no telemetry; no MutationObserver or DOM relocation
(the file header states this design rule and grep confirms it).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/idle-soak run was performed. Static review
  covered the same surfaces but cannot rule out environment-dependent behavior.
- **Published artifact comparison.** No npm tarball was fetched or byte-compared against this git
  tree; the header's integrity and provenance rows are empty for that reason.
- **Runtime CSS side effects.** The plugin injects a large stylesheet and SVG filters into the DSH
  UI. Whether any rule degrades a DSH surface (contrast, hit targets) is a design question this
  card did not test.
- **Asset contents.** The two bundled JPEGs were verified only by the hashes the code itself
  asserts; the image bytes were not independently inspected.
- **Full line-by-line read of client.js.** 3042 generated lines were grepped exhaustively for every
  dangerous primitive and read at the identity, storage, and import layers, not read end to end.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F; the manual
verdict is A. Both positions are recorded in section 4.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/xingyingyuzhui/dsh-liquid-glass /tmp/lg-audit
cd /tmp/lg-audit && git rev-parse HEAD   # expect 573a81d66ddff86216a61ebee4c755ed49ae31de

grep -rhoE "https?://[a-zA-Z0-9./_-]+" client.js host.js src/ | sort -u   # only w3.org namespaces
grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|child_process\|process\.env" client.js host.js src/
grep -rn "eval(\|new Function\|vm\." client.js host.js src/               # none
node scripts/build-client.mjs --check                                     # committed bundle matches src
node --test test/*.test.mjs
```

## 8. Methodology and pinned inputs

- Subject: git commit `573a81d66ddff86216a61ebee4c755ed49ae31de` (shallow clone at
  reference/audits/dsh-liquid-glass)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 48 files, 732088 bytes
- Review: full read of host.js and package.json; targeted read of client.js (header, identity and
  storage layers), src/client/settings-import.js, src/client/optics-map.js FileReader path,
  cordis.patch.yml; exhaustive grep of all shipped files for network, exec, credential, and
  filesystem primitives; every scanner finding opened at its cited line
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no production finding survived adjudication; zero declared egress; no
  credential surface; no lifecycle hooks; regenerable shipped bundle. That is the A band. Not
  higher-confidence than A because no behavioral probe and no published-artifact comparison were
  done.

## 9. Strengths

1. Genuinely zero egress. A skin plugin that talks to nothing is the correct design, and this one
   holds the line: not even a font CDN or an update check.
2. The shipped `client.js` is generated and re-checkable (`build-client.mjs --check` passes), so
   the loaded artifact is not an opaque blob.
3. Host routes are read-only, method-restricted, and serve two fixed asset URLs derived from
   `import.meta.url`; there is no path parameter to traverse.
4. Content-hashed asset routes with ETag and immutable caching, falling back to `no-cache` on the
   legacy unhashed path: correct cache semantics without a server-side path join.
5. User wallpaper import is bounded (12 MB input cap, 4 MB stored data URL cap, 6 entries) and
   stays in the browser.

## 10. Residual risks

1. Client state lives in `localStorage` as data URLs; a user importing a sensitive image leaves it
   readable to any other script running in the DSH web origin. Same-origin risk, not egress.
2. Heavy CSS filters and SVG displacement maps can cost frame time on low-end GPUs; the project
   ships a scheduler for this, which was not performance-tested here.
3. No published-artifact provenance: installing from npm rather than this commit is not covered by
   this card.
4. The plugin patches the DSH UI by stylesheet injection, so a DSH upgrade can visually break it.
   That is a breakage risk, not a security one.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL outside `www.w3.org`, any
   `fetch`/`child_process`/`process.env` appearance in shipped files, or any new `files` entry is a
   finding that must be adjudicated before this grade carries forward.
2. Re-run `node scripts/build-client.mjs --check`. A non-zero exit means `client.js` diverged from
   `src/client/` and the shipped bundle must be re-reviewed by hand.
3. On any version bump, re-read `package.json` scripts for a newly added `prepare`/`postinstall`
   hook and re-read `host.js` for any route whose path is derived from request input.
4. Re-run the scanner after a heuristics-corpus bump; the corpus digest is recorded in section 8.
