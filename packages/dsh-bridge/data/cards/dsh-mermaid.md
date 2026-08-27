# Trust Report Card: dsh-mermaid

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-mermaid` (DSH Web plugin: renders ` ```mermaid ` fences in chat messages as SVG diagrams) |
| Pinned subject | github:AKS1st/dsh-mermaid @ commit `2708cdf2e2eb1c0cd15448c3d3d680b8fba58d48` (shallow clone, default branch head at audit time; package.json version 0.5.0) |
| npm integrity | not checked (see section 5) |
| Provenance | not verified |
| License | MIT (LICENSE:1-3, "Copyright (c) 2026 dsh-mermaid contributors") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual review of src/index.ts, src/protocol.ts, src/client/index.ts and the render path in src/client/dom.ts) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local-only renderer: the host half serves exactly two files from the bundled mermaid dist plus a
JSON config over the user's own web server, the browser half fetches only those same-origin routes,
and nothing reaches the network, the filesystem outside the dist directory, or any credential.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The client's only `fetch()` targets the plugin's own `CONFIG_ROUTE` on the same origin (src/client/index.ts:80) and falls back to defaults if it fails. The mermaid bundle is loaded by injecting a `<script>` whose src is the plugin's own dist route (src/client/index.ts:60-68). The host half imports `node:http` types only (src/index.ts:18) and opens no client socket. All other NET findings are in tests (tests/live-server-e2e.spec.ts) and package-lock.json. | file:line above |
| HTTP surface | Two routes on the host's existing web server: a prefix route serving the mermaid dist (src/index.ts:86-95) and an exact route returning the validated config as JSON (src/index.ts:98-105). Both registered through `ctx.effect`, so they are removed on unload. | src/index.ts:85-106 |
| Filesystem reads | Only inside the mermaid package's own dist directory, located via `require.resolve` on this plugin's dependency tree (src/index.ts:69-71). Two guards apply in series: a traversal check requiring the resolved target to stay under `distRoot` using the platform separator (src/index.ts:42-50), then an allowlist accepting only `mermaid.min.js` and its `.map` (src/index.ts:51-55). Anything else gets 403 or 404. | src/index.ts:41-66 |
| Filesystem writes | None. No write call in src/. | grep of src/ |
| Credential reads | None. No auth path, no environment enumeration in src/. | grep of src/ |
| Child processes / shell | None in shipped code. `scripts/browser-inject.mjs` and `scripts/browser-zoom.mjs` are dev helpers and are excluded from the published `files` list (package.json:34-37, which ships only `lib` and `cordis.patch.yml`). | package.json:34-37 |
| Dynamic code execution | No `eval` or `new Function`. The plugin does inject a `<script>` tag, but its src is a fixed same-origin route serving a vendored bundle (src/client/index.ts:60-68). | src/client/index.ts |
| DOM injection | `host.innerHTML = svg` at src/client/dom.ts:306, where `svg` is the output of `mermaid.render()` (src/client/dom.ts:300). This is the load-bearing line: safety rests entirely on mermaid's DOMPurify sanitisation, which the plugin forces on (see below). | src/client/dom.ts:300-306 |
| Telemetry | None. No analytics, beacon, or metrics code in src/. | negative claim, scope: src/ |
| Lifecycle hooks | None. `scripts` contains only build, check and test (package.json:39-43). No install/postinstall. | package.json:39-43 |
| Runtime dependency | `mermaid` `^11.16.0`, a caret range (package.json:45-47). This is the plugin's whole attack surface for rendered output. | package.json:45-47 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 698 findings (348 high, 3 medium, 347 low), machine grade F, gate `finding-density`.
The overwhelming majority are package-lock.json registry URLs (NET) and `sha512-` integrity strings
misread as obfuscation (OBFU); the remainder are `fetch()` calls in tests/live-server-e2e.spec.ts.

### Gate adjudication

| Gate | Machine reason | Adjudication |
|---|---|---|
| `finding-density` | "NET, OBFU appear in 3 or more separate files" | False positive. The spread is the lockfile plus test files. Shipped code contains exactly one `fetch()`, to a same-origin route (src/client/index.ts:80). |

### Production-code findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| MER-DOM-1 | medium | src/client/dom.ts:306 | `innerHTML` assignment of mermaid-rendered SVG into the page. Mitigated by forced `securityLevel: 'strict'` (below), but this is where a mermaid sanitiser bypass would land, and the content being rendered is untrusted assistant output. |
| MER-NET-1 | low | src/client/index.ts:80 | Same-origin config fetch, `cache: 'no-store'`, failure falls back to `DEFAULT_CONFIG`. No external host. |
| MER-FS-1 | low | src/index.ts:41-66 | Serves files from the mermaid dist directory. Traversal-guarded and allowlisted to two filenames. |
| MER-SUPPLY-1 | medium | package.json:46 | `mermaid: ^11.16.0` is a caret range, so an install can pick up any 11.x. The audited security posture depends on that dependency's sanitiser. |

### The strict-mode enforcement, read directly

`securityLevel` is not merely defaulted, it is enforced: `DEFAULT_CONFIG` sets `'strict'`
(src/protocol.ts:38) and `validateConfig` throws if the patch row supplies anything other than
`'strict'` (src/protocol.ts:68-70), returning a hard-coded `securityLevel: 'strict'` regardless
(src/protocol.ts:71). The comment in cordis.patch.yml states the intent plainly: "`loose` is never
offered." Under strict mode mermaid runs labels through DOMPurify and leaves click handlers inert.
The host passes the same validated object to the config route (src/index.ts:85-86, 102-103) and the
client re-validates what it receives (src/client/index.ts:83), so a tampered config response cannot
downgrade the client either.

### Negative claims and what was searched

Searched src/index.ts (108 lines), src/protocol.ts (72), src/client/index.ts (127), src/client/dom.ts
(788, read around the render and injection path), src/client/styles.ts (234, not read in full),
package.json, cordis.patch.yml: no outbound network, no filesystem writes, no credential access, no
child processes, no eval-family calls, no telemetry, no install hooks.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/render run was performed. The traversal guard's 403 path, the allowlist's 404 path and the strict-mode rejection were read but never exercised.
- **The mermaid dependency itself.** `^11.16.0` was not audited, not pinned to a resolved version for this card, and not joined against an OSV snapshot. Since the plugin's whole safety argument delegates sanitisation to mermaid, this is the largest unchecked area.
- **src/client/dom.ts in full.** 788 lines; the render, injection, theme and zoom-overlay paths were read, the remainder (lazy-viewport bookkeeping, error-artifact cleanup) was not.
- **src/client/styles.ts.** 234 lines of injected CSS, not reviewed for stylesheet-level issues.
- **Published npm tarball vs this git tree.** Not fetched, no integrity or attestation checked.
- **The compiled lib/ output.** Shipped `files` is `lib` only; lib/ was not diffed against src/ and `npm run build` was not reproduced.
- **Cross-model review.** Single reviewer, one model.

## 6. Strengths

1. Strict mode is enforced rather than defaulted: an unsafe config value throws at validation instead of silently downgrading (src/protocol.ts:68-70), and the client re-validates the config it receives (src/client/index.ts:83).
2. The dist route uses two independent guards, containment and a two-filename allowlist (src/index.ts:42-55), so a traversal-guard bug alone does not turn into arbitrary file read.
3. Path containment uses the platform separator with an explicit comment about Windows backslash paths (src/index.ts:44-46), a detail commonly missed.
4. Both routes are registered inside `ctx.effect` (src/index.ts:85-106) and the client disconnects its observers and disposes state on unload (src/client/index.ts:118-126), so the plugin unloads cleanly.
5. No egress, no credentials, no child processes, no install hooks, single vendored runtime dependency.
6. Renders are timeout-bounded (`withTimeout`, src/client/dom.ts:300) and mermaid's own `maxTextSize`/`maxEdges` caps are carried through config.

## 7. Residual risks

1. Rendering untrusted assistant output into `innerHTML` is inherently the risky part. Strict mode plus DOMPurify is the right mitigation, but any mermaid sanitiser bypass becomes XSS inside the DSH web UI with whatever that origin can reach.
2. The caret dependency range means the mermaid version actually installed is not the one implied by this audit; a future 11.x with a regression flows in on a fresh install.
3. A `MutationObserver` on `document.body` with `subtree: true` (src/client/index.ts:107) sees all conversation DOM. Nothing is exfiltrated, but the plugin's client half has full read access to page content by construction.
4. The dist prefix route makes the mermaid bundle readable to anything that can reach the DSH web server; the plugin does no Host validation of its own and inherits whatever binding the host uses.
5. Published artifact not compared against this tree.

## 8. Methodology and pinned inputs

- Subject: git commit `2708cdf2e2eb1c0cd15448c3d3d680b8fba58d48` (shallow clone at reference/audits/dsh-mermaid)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 32 files scanned, 10 skipped
- Review: manual read of src/index.ts, src/protocol.ts, src/client/index.ts, the render/inject/theme path of src/client/dom.ts, package.json, cordis.patch.yml, LICENSE; grep across src/ for network, exec, write and credential surfaces
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high or critical production findings survive adjudication; the single gate is a false positive. Local-only behavior with disciplined route guards and enforced strict mode. Held to B rather than higher by the `innerHTML` injection of untrusted content, the caret-ranged dependency that the safety argument delegates to, and the unreviewed remainder of the client DOM and styles modules. Net: **B**.

## 9. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/AKS1st/dsh-mermaid /tmp/mermaid-audit
cd /tmp/mermaid-audit && git rev-parse HEAD   # expect 2708cdf2e2eb1c0cd15448c3d3d680b8fba58d48

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/mermaid-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(" src/                        # one hit: same-origin CONFIG_ROUTE
grep -rn "eval(\|new Function\|child_process" src/   # zero hits
grep -rn "writeFile\|appendFile\|unlink" src/        # writes: zero hits
sed -n '60,72p' src/protocol.ts               # securityLevel: strict is enforced, not defaulted
sed -n '41,66p' src/index.ts                  # traversal guard + two-filename allowlist
sed -n '300,308p' src/client/dom.ts           # the innerHTML sink and what feeds it
```

## 10. Re-verify steps

1. Re-run the block above against the current HEAD. Any new `fetch` target, any new filename added to the dist allowlist, or any loosening of the `securityLevel` validation must be re-adjudicated before this grade carries forward.
2. Pin the resolved mermaid version (`npm ls mermaid`) and check it against advisories; the caret range means this must be redone per install, not once.
3. Re-read src/index.ts:42-55 after any refactor of `serveDistFile`. Dropping either the containment check or the allowlist converts a bounded static route into a file-read primitive.
4. Watch package.json `scripts` for install-time hooks and `files` for the addition of `scripts/` (the browser-automation dev helpers).
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
