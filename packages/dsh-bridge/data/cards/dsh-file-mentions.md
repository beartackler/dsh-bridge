# Trust Report Card: dsh-file-mentions

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-file-mentions` (DSH web plugin: clickable file paths in replies, reveal in file manager, mentioned-files chip list) |
| Pinned subject | github:a903067276-rgb/dsh-file-mentions @ commit `21d8da94b174e37eda13274e74c4ed2459be612e` (default branch head, committed 2026-08-26) |
| npm integrity | Not checked. The package declares `main`/`exports` but this audit graded the git tree only; no registry artifact was fetched or compared. |
| Provenance | No release workflow, no CI, no attestation in the repo (no `.github/` directory at the pinned commit). |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0, rulesDigest `d7d5d9eb...41f3`, plus full manual read of lib/index.js 443 lines and lib/client.js 570 lines) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A small, dependency-free plugin that makes file paths in DSH replies clickable: it makes no outbound
network calls at all, opens paths only through `execFile` with no shell, and gates every route on
same-origin plus a real session, with a deliberately narrowed probe surface (session cwd, home
directory, or user-declared roots) that the author documents and tests.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The only `fetch` calls are browser-side, to the host's own same-origin routes `/api/file-mentions/{config,open,check}`. | lib/client.js:28, 43, 180, 331, 499 |
| Local HTTP routes | Three routes registered on the host's own web server: `check` (path existence), `open` (system open/reveal), `config` (probe-root allowlist read/write). All start with `isSameOrigin(req)` returning 403 otherwise. | lib/index.js:57-60, 152-155, 162-167 |
| Child processes | One: `execFile(command, cleanArgs, { timeout: 10000 })` where command is `open` (darwin), `explorer` (win32), or `xdg-open` (linux). Argument array, no shell, no user-controlled command name. | lib/index.js:398, 379-401 |
| Filesystem access | Read-only probing: `existsSync`, `statSync`, `realpathSync`. No writes to disk anywhere in lib/. Persisted state goes through the official settings service. | lib/index.js:24, 84, 143, grep for writeFile/mkdir returns zero hits |
| Credential access | None. No env enumeration, no auth file reads, no keychain. | grep of `process.env` in lib/ returns only `process.platform` uses |
| Dynamic code execution | None. No eval, no `new Function`, no `vm`, no dynamic `import()`. | grep across lib/ |
| Telemetry | None. No analytics, beacon, or metrics code. Scanned lib/, test/, docs/. | negative claim, scope stated |
| Lifecycle hooks | None. `scripts` contains only `"test": "node --test"`; no install/postinstall/prepare. | package.json:8-10 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 9 findings (1 critical, 7 high, 1 low), machine grade F. All adjudicated below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical, lib/index.js:24 `import { execFile } from 'node:child_process'` | Real but benign. The import is used exactly once, in `systemOpen`, with a fixed per-platform command name and an argument array (no shell interpolation). The path argument is a resolved absolute path that already passed `isProbeable`. | lib/index.js:379-401 |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| FM-EXEC-1 | medium | lib/index.js:398 | Launches the OS file handler on a user-clicked path. `execFile` with argv array means no shell metacharacter risk; 10 s timeout. Worst case is opening a file the user can already open. |
| FM-PROBE-1 | medium | lib/index.js:329-355 | `isProbeable` allows any path inside the session cwd **or anywhere under `homedir()`**. That is a wide existence-oracle for a local route. It is gated by same-origin plus a live `sessionId`, and the author states the home-wide default as a deliberate decision in the header comment (lib/index.js:14-20). Users who consider path-existence leakage material should know the whole home directory is probeable. |
| FM-CONF-1 | low | lib/index.js:162-190 | The `config` route lets a same-origin page add extra probe roots. Defenses: system-root refusal via `/System`, `/etc`, `Windows` markers (lib/index.js:305-321), and realpath-based symlink escape refusal (lib/index.js:344-352). |
| FM-XSS-1 | low | lib/client.js:316, 523, 548 | `innerHTML` / `dangerouslySetInnerHTML` are used, but only with `FOLDER_SVG`, a module-level constant string literal (lib/client.js:15). No model or user text reaches either sink. |
| FM-SUPPLY-1 | low | package.json:36 | Repository URL only. |

### Scanner noise dismissed (with scope)

- 5 NET highs in lib/client.js: same-origin relative paths (`/api/file-mentions/...`), not remote hosts.
- 1 NET high in test/security.test.js:37: the string `https://evil.example` is the cross-origin
  rejection fixture; the test asserts the route returns 403.
- 1 NET low in package.json: repository metadata.

### Negative claims and what was searched

Searched lib/index.js, lib/client.js, test/security.test.js, test/probe-surface.test.js,
cordis.patch.yml, examples/, docs/, package.json: no remote hostnames in shipped code, no eval
family, no credential paths, no filesystem writes, no telemetry, no lifecycle scripts, no
obfuscation (source is unminified, commented, and readable), no timers or deferred beacons.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run was performed. Static review covers
  the same surfaces but cannot rule out host-integration behavior that only appears at runtime.
- **Published-artifact comparison.** No npm tarball was fetched; the grade covers the git tree at
  the pinned commit only. `lib/` is hand-written JavaScript committed directly (no build step), so
  there is no src-to-dist gap to reconcile inside the repo, but a registry copy could still differ.
- **Screenshots.** `assets/screenshot*.png` and `screenshots.json` were not inspected for content.
- **The DSH host contract.** Whether `webServer.register` routes are reachable from anything other
  than the loopback UI depends on how the user binds `dsh web`; if the host is bound to a LAN
  interface, `isSameOrigin` still accepts a `Host` header of `127.0.0.1`/`localhost` only, but this
  was not exercised against a real server.
- **Comment accuracy in Chinese source comments** was read but not independently corroborated
  against upstream DSH APIs.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on the `child_process` import alone; the manual verdict
is B. Both positions are recorded above rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/a903067276-rgb/dsh-file-mentions /tmp/fm-audit
cd /tmp/fm-audit && git rev-parse HEAD   # expect 21d8da94b174e37eda13274e74c4ed2459be612e

grep -rn "eval(\|new Function\|vm\." lib          # dynamic exec: none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" lib        # egress: none in shipped code
grep -n "execFile" lib/index.js                   # exactly two hits: import + one call site
sed -n '329,356p' lib/index.js                    # the probe-surface decision, read it yourself
node --test                                       # the repo's own security + probe-surface tests
```

## 8. Methodology and pinned inputs

- Subject: git commit `21d8da94b174e37eda13274e74c4ed2459be612e` (shallow clone at
  reference/audits/dsh-file-mentions).
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`; 8 files scanned, 57122 bytes.
- Review: full manual read of lib/index.js (443 lines) and lib/client.js (570 lines, grepped for
  every sink then read at each hit), package.json, cordis.patch.yml, test/probe-surface.test.js.
- Cross-model review: NOT performed. Card revision 1 is capped accordingly.
- Grade derivation: no network egress, no credential access, no dynamic execution, no lifecycle
  hooks; one justified child-process call and one broad-but-declared local probe surface. That is
  the B band, not A, because the home-wide existence oracle is a real (if modest) capability and
  because there is no CI, no release provenance, and no published-artifact binding.

## 9. Strengths

1. Zero runtime dependencies and zero outbound network calls in shipped code.
2. Same-origin enforcement on all three routes, plus a `sessions.get(sessionId)` liveness check, so
   an unauthenticated caller cannot use the routes as a bare filesystem oracle (lib/index.js:74-79,
   128-133).
3. `execFile` with an argv array and a fixed command name: no shell, no interpolation.
4. Path-traversal defense on relative resolution (`isWithin` after `resolve`, lib/index.js:232-240)
   and symlink-escape refusal via `realpathSync` on allowlist roots (lib/index.js:344-352).
5. Request bodies capped at 100 KB with the socket destroyed on overflow (lib/index.js:31, 409-419).
6. The repo ships its own security tests (test/security.test.js, test/probe-surface.test.js).

## 10. Residual risks

1. Any same-origin page in the DSH web UI can enumerate the existence of arbitrary paths under the
   user's home directory, given a live session id. Prompt-injected model output that renders a path
   into the conversation triggers a `check` call for that path.
2. The `open` route hands paths to the OS handler. A crafted path inside the allowed area could open
   an application the user did not intend (for example a document that triggers its own macros).
3. No CI, no release automation, no signed artifact: trust rests on reading the source, which is
   feasible here (1013 lines total) but must be redone on every update.
4. `isSameOrigin` accepts a request with no `Origin` header when `Host` looks like loopback; a
   non-browser local process can therefore call these routes.

## 11. Re-verify steps

1. Re-run the section 7 block against the current HEAD. Any new `execFile`/`spawn` call site, any
   literal remote URL in `lib/`, or any new `scripts` entry in package.json must be re-adjudicated.
2. Diff `isProbeable` (lib/index.js:329-355) specifically: widening the allowed area is the single
   change most likely to move this grade.
3. Confirm `innerHTML` and `dangerouslySetInnerHTML` still receive only the `FOLDER_SVG` constant;
   any dynamic argument there is a finding.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
