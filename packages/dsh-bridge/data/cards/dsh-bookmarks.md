# Trust Report Card: dsh-bookmarks

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-bookmarks` (DSH web plugin: bookmark assistant replies with notes and tags, cross-session center, Markdown export) |
| Pinned subject | github:penguin-oo/dsh-bookmarks @ commit `881e2e6425898ed8fe2d4b6df48515d72b73a6ca` (branch main, shallow clone) |
| npm integrity | Not checked. No npm package name is claimed by the README or install docs; the package declares a git repository and is installed from git. |
| Provenance | None. Git-source install; no attestation, no signed tags. A CI workflow badge is referenced in README.md:3 but no workflow file is present in the shipped tree. |
| License | MIT (LICENSE:1-3, "dsh-bookmarks contributors") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A storage-only sidecar with no network egress, no credential access, no child processes in shipped
code, and no dynamic code execution: it reads persisted session logs through the harness's own
persistence service, writes one durable table of bookmark rows, and renders a browser panel whose
only data path is the harness's Typert RPC channel back to that same table.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None in shipped code. `package.json` `files` ships exactly `lib/index.js`, `lib/schemas.js`, `lib/typert.host.js`, `lib/typert.remote-client.js`, `lib/client.js`, `cordis.patch.yml`, `README.md` (package.json:34-42). `grep` for `fetch(`, `XMLHttpRequest`, `WebSocket`, and `sendBeacon` across `lib/client.js` (15540 lines) returns zero hits. The browser half talks to the host only through `ctx.remote.$mount(TYPERT_REMOTE)` (src/client/index.jsx:897-898), the harness's own RPC transport. | grep, src/client/index.jsx:897-898 |
| Durable storage | One domain, `bookmarks`, version 0, one table, one global row key (lib/index.js:62-66, 18). Rows hold sessionId, messageId, note, tags, snippet, version, createdAt, updatedAt, all schema-bounded by zod (lib/index.js:23-38). Note is byte-capped at the configured `maxNoteBytes` (lib/index.js:252-259), tags at 32 chars and `maxTags` entries (lib/index.js:262-278), snippet at `maxSnippetChars` (lib/index.js:313-321). Defaults 4096 / 300 / 8 are set in cordis.patch.yml:13-16. | file:line above |
| Session reads | Through the harness's own services only: `ctx.sessions.get`, `ctx.sessionPersistence.listSnapshots()`, `.inspect()`, `.readFrom()` (lib/index.js:284-309). No filesystem path is constructed anywhere in `lib/`. Only finalized append-origin assistant messages are bookmarkable (lib/index.js:292-299). | file:line above |
| Data leaving the machine | Nothing, except by the user's own hand: `exportMarkdown` builds a Markdown string in the browser and triggers an `<a download="dsh-bookmarks.md">` (src/client/index.jsx:716-729, bundled at lib/client.js:15337). It is a local file save, not an upload. | file:line above |
| Child processes | None in shipped code. The single `child_process` import is `scripts/e2e-screenshot.mjs:5`, a dev-only Puppeteer harness that is not in `package.json` `files` and depends on `puppeteer-core`, a devDependency. | scripts/e2e-screenshot.mjs:1-10, package.json:34-42, 67-69 |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*` in `lib/` or `src/`. | grep, zero hits |
| Credential reads | None. No auth path, keychain, cookie, token, or `process.env` read in `lib/` or `src/`. | grep across lib/, src/ |
| Telemetry | None. No analytics, beacon, or metrics code in `lib/` or `src/`. | negative claim, scope: lib/, src/, scripts/ |
| Lifecycle hooks | None. `package.json` declares one script, `build: node scripts/build-client.mjs` (package.json:71-73). No install, postinstall, or prepare hook exists. | package.json:71-73 |
| Agent or session creation | None. The host half never creates or resumes an Agent or Session; the file's own header comment says so (lib/index.js:4-5) and no `agents.create` call exists in the tree. | grep, header comment |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 267 findings (0 critical, 136 high, 2 medium, 129 low), machine grade F, gates
`dynamic-exec-present` and `finding-density`. 251 of those findings are in `package-lock.json`
(registry tarball URLs and their integrity hashes) and are excluded from adjudication as lockfile
metadata. The remaining 16 are adjudicated individually below; every one was read at its line.

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| BM-SUPPLY-1 | medium | package.json:15 | `repository.url` is `git+https://github.com/penguin-oo/dsh-bookmarks.git`. The scanner reads this as a git-pinned dependency; it is a repository declaration, not a dependency. The real supply concern is the same one it implies: installation is from a moving branch unless the user pins a commit. |
| BM-DEV-1 | low | scripts/e2e-screenshot.mjs:5,28,45,166 | Dev-only E2E script: spawns a local Edge with `--remote-debugging-port`, connects Puppeteer to `http://127.0.0.1:<port>`, and drives a locally running DSH at `http://127.0.0.1:3738` (default overridable by `DSH_E2E_BASE`, line 10). Loopback only. Not shipped (absent from `package.json` `files`), requires a devDependency that a consumer install does not fetch. Kept on the card because a contributor running it does open a CDP endpoint on their own machine. |
| BM-STORE-1 | low | lib/index.js:313-321 | Snippets are derived server-side from the persisted assistant message and stored durably. Bookmarking a reply therefore copies up to `maxSnippetChars` of that reply into a second durable location that survives session deletion. This is the product's purpose, but it is a data-duplication surface worth naming. |

### Scanner noise dismissed (with scope)

- NET-007 x7 in `lib/client.js` at 11683, 11685, 11687, 14122, 14125, 14128: JSON Schema dialect identifier strings inside the bundled `zod` v4 JSON-Schema emitter (`result.$schema = "https://json-schema.org/draft/2020-12/schema"` and the draft-07/draft-04 siblings, plus the three comparisons that read them back). They are constants compared as strings, never fetched.
- NET-007 x2 in `lib/client.js` at 2592, 2629: `new URL(\`http://[${payload.value}]\`)` and the same over `address` - zod's IPv6 validator, which brackets a candidate address and asks the URL parser whether it parses. No connection.
- OBFU-010 `lib/client.js:1291`: `atob` inside zod's `base64ToUint8Array` helper (lines 1289-1296), a plain byte decoder immediately followed by its `uint8ArrayToBase64` inverse. Decoded bytes are never executed.
- HOOK-005 `lib/client.js:14040`: `/* @__PURE__ */ (function(ZodFirstPartyTypeKind2) {...})` - the standard TypeScript enum-emit IIFE inside bundled zod, marked pure for tree-shaking.
- 251 findings in `package-lock.json` (NET-007 on `resolved` registry URLs, OBFU-012 on their `integrity` hashes, NET-008 on five repository URLs). Lockfile metadata, not code.

### Build reproducibility

`lib/client.js` is generated by `scripts/build-client.mjs`, which esbuild-bundles
`src/client/index.jsx` and wraps it in the `window.__ModuleLoader__.load({ id: "dsh-bookmarks", ... })`
envelope the DSH browser kernel expects (build-client.mjs:11-42). The bundle header at
lib/client.js:1-2 matches that envelope exactly, and the plugin-specific tail (lib/client.js:14638
onward) matches the reviewed `src/client/index.jsx`. We did not rebuild and byte-compare; see
section 5.

### Negative claims and what was searched

Searched `lib/` (5 modules, 16236 lines including the vendored zod bundle), `src/client/index.jsx`
(988 lines), `scripts/` (3 files), `package.json`, and `cordis.patch.yml`: no `eval`, `new Function`,
or `vm`; no `child_process` outside the dev-only E2E script; no credential path; no outbound network
call; no telemetry; no filesystem write outside the harness's storage domain; no obfuscation markers
(hand-written code is commented ES modules, and the only minified-looking region is identifiable
vendored zod).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review covered every shipped module but cannot rule out environment-dependent behavior.
- **Bundle vs source.** `lib/client.js` was not rebuilt from `src/client/index.jsx` and byte-compared. We matched the envelope, the plugin id, and the tail region by reading, not by reproducing the build. The bulk of the file is vendored zod, which we sampled at every scanner hit rather than reading in full.
- **The vendored zod bundle in full.** 15540 lines; read at all scanner hits and grepped exhaustively for network, eval, and storage primitives, but not read line by line.
- **Peer dependencies.** `@deepseek-ai/cordis`, `dsh-session`, `dsh-session-persistence`, `dsh-storage-domain`, and `dsh-typert-protocol` resolve on the user's machine; no pinned OSV snapshot was joined against them.
- **The harness services this plugin drives.** `storageDomain`, `sessionPersistence`, and the Typert RPC transport are the harness's own.
- **Published-artifact comparison.** No npm artifact was located to diff against.
- **The referenced CI workflow.** README.md:3 links a `ci.yml` badge; no `.github/` directory exists in the shipped tree, so the badge's claim could not be verified from the artifact.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F, driven almost
entirely by lockfile metadata and by vendored zod's schema-dialect strings and IPv6 URL probe; both
positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/penguin-oo/dsh-bookmarks /tmp/bookmarks-audit
cd /tmp/bookmarks-audit && git rev-parse HEAD   # expect 881e2e6425898ed8fe2d4b6df48515d72b73a6ca

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/bookmarks-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -n "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" lib/client.js   # expect zero hits
grep -rn "eval(\|new Function\|child_process" lib src                   # expect zero hits
grep -A9 '"files"' package.json          # scripts/ is not shipped
grep -A4 '"scripts"' package.json        # one build script, no install hook
sed -n '2589,2593p;11681,11688p' lib/client.js   # the "network" hits are zod internals
sed -n '284,315p' lib/index.js           # session reads go through host services only
```

## 8. Methodology and pinned inputs

- Subject: git commit `881e2e6425898ed8fe2d4b6df48515d72b73a6ca` (shallow clone at reference/audits/dsh-bookmarks)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 12 files scanned, 6 skipped
- Review: full read of lib/index.js (381 lines), lib/typert.host.js (117), lib/typert.remote-client.js (86), scripts/build-client.mjs (42), package.json, cordis.patch.yml; targeted reads of scripts/e2e-screenshot.mjs and src/client/index.jsx at every capability site; lib/client.js read at every scanner hit and grepped exhaustively for network, exec, and storage primitives
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero network egress, zero credential access, zero dynamic execution, zero lifecycle hooks, zero shipped child processes. No finding survives adjudication above low severity except a repository-URL misread. That clears the A band. The card is A rather than a hypothetical higher mark because provenance is git-only and the shipped bundle was not reproduced.

## 9. Strengths

1. Concurrency is taken seriously in a plugin that did not have to. Every mutation is serialized through a promise tail (lib/index.js:334-341) and gated on a per-item compare-and-set version (lib/index.js:198, 237), so two tabs cannot silently clobber each other; conflicts return the authoritative item (lib/index.js:326-332).
2. Shutdown is correct: admission closes, the in-flight tail is awaited, and only then does the domain close (lib/index.js:143-152).
3. Nothing mutable crosses the service boundary. Items are copied and frozen on the way out (lib/index.js:70-86), so callers cannot reach back into stored state.
4. Writes are durability-barriered: for a live session the plugin flushes and fails loudly if no durability listener participated, rather than bookmarking a message that may not survive a crash (lib/index.js:302-309).
5. Input validation is explicit and bounded on every field, with an intentional distinction between "omitted" and "cleared" for notes (lib/index.js:249-259).
6. Bookmark targets are re-verified against the persisted log after the durability barrier, with a session-identity comparison that catches a session recreated under the same id (lib/index.js:107-109, 185-191).

## 10. Residual risks

1. Snippets duplicate assistant text into a durable table that outlives the session. Deleting a session does not delete its bookmarked snippet; the delete path deliberately skips session inspection so orphans stay removable (lib/index.js:221-226), but they are not removed automatically.
2. Bookmarks are global, not per-workspace: one row key, `"global"` (lib/index.js:18). Anyone with access to the DSH storage has every bookmark from every session.
3. Git-only distribution with no attestation and no pinned install. The README's CI badge is not backed by a workflow file in the tree.
4. The shipped `lib/client.js` vendors zod; a compromised or outdated vendored copy would not be caught by this card's per-hit sampling.
5. The dev E2E script opens a Chromium remote-debugging port on loopback. Harmless in normal use, but a contributor running it while untrusted local code is present is exposing a CDP endpoint.

## 11. Re-verify steps

1. Re-run the step 7 block against current HEAD. Any `fetch` in `lib/`, any new `child_process` import outside `scripts/`, or any new script key in `package.json` must be re-adjudicated before this grade carries forward.
2. Diff `package.json` `files` on every bump: if `scripts/` ever ships, the E2E CDP harness becomes a shipped capability and the grade drops.
3. Re-check `lib/index.js` storage bounds (currently `maxNoteBytes`, `maxSnippetChars`, `maxTags` at lines 137-139) against `cordis.patch.yml` defaults; a raised snippet cap widens the duplication surface.
4. Rebuild `lib/client.js` with `node scripts/build-client.mjs` and diff against the shipped file; a mismatch means the bundle was hand-edited and this card's source-based reasoning no longer applies.
5. Re-run the scanner after any zod major bump; the vendored bundle is the bulk of the scanned bytes.
