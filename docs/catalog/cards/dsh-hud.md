# Trust Report Card: dsh-hud

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-hud` (floating HUD panel for DSH Web: git status, MCP servers, skills, model, token usage, account balance) |
| Pinned subject | github:a903067276-rgb/dsh-hud @ commit `ba0e78adae6fc0645d42ec243700e8c81151e98a` (main, v1.2.16, 2026-08-26) |
| npm integrity | not checked (documented install path is the git spec `github:a903067276-rgb/dsh-hud#main`) |
| Provenance | not checked |
| License | MIT (LICENSE) |
| Stars at audit | 10 |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of the host half and the network/storage paths of the client half) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Behaves as advertised and its one outbound destination is the documented DeepSeek balance API, but
the main data route carries no origin or auth check of its own, so any local page or process that
can reach the host web server can read your working-tree status, uncommitted diffs, installed
skills, current model, and account balance.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | One destination: `https://api.deepseek.com/user/balance`, called with `authorization: Bearer <DEEPSEEK_API_KEY>` and a 5 s timeout, cached 60 s. This is the only absolute URL in shipped code. | lib/index.js:468,482-484 |
| Credential reads | Resolves `DEEPSEEK_API_KEY` through the host `credentials` service and sends it as a bearer token to the vendor endpoint above. The key value is not logged and is not placed in any route response; the resulting balance amounts are. | lib/index.js:474-476,482 |
| Local HTTP routes | One `prefix` route `/api/dsh-hud` with three branches: full/light status (default), `/diff` (single-file diff), `/events` (SSE tick stream). | lib/index.js:140-233 |
| Route authentication | Only the `/events` branch checks origin (loopback-only Origin or Host). The status and `/diff` branches have no origin, auth, or token check; they are gated only by a 200 ms per-session throttle and, for `/diff`, by a path allowlist. | lib/index.js:150-158 vs 176-200,203-228 |
| Shell execution | Runs batched `git` commands through the host `shell` service (`bash -c` on every platform) with a 5 s timeout and byte caps: `symbolic-ref`, `rev-parse`, `status --porcelain`, `diff --numstat`, `log -5`, plus `git diff HEAD -- <path>` for a single file, plus `dsh --version`. Session sandbox policy is passed through where available. | lib/index.js:552-563,199,506-514,/function policyFor/ |
| User-controlled shell input | The watched-repositories list comes from the browser's `localStorage` and is sent as a query parameter, then interpolated into a `for d in ...` shell loop. Each entry is single-quote escaped and must pass `existsSync` first. The `/diff` path is escaped by `shq()` and must be in the per-session allowlist. | lib/index.js:211-215,630-639,845; client lib/client.js:56-63,156 |
| Filesystem reads and watchers | Walks the session cwd and each watched repo with `readdirSync`, skipping `.git` and `node_modules`, and installs up to 128 non-recursive `fs.watch` handles plus one watcher per `.git/HEAD`. Watchers are closed when the SSE connection closes. | lib/index.js:99-129,73-89,170-173 |
| Data exposed over the routes | Branch, short hash, ahead/behind, grouped changed-file list, per-file numstat, last 5 commit subjects, full diff of an allowlisted file, MCP server list, skill names, current provider/model/reasoning effort, per-model token buckets, `dsh --version`, and the account balance (currency, total, granted, topped-up). | lib/index.js:216-227 |
| Host services used | `webServer`, `shell`, `sessions`, `agents`, `tools`, `skills`, `apiProxy`, `sessionProjections`, `credentials`, plus optional `settings` and `sandboxPolicy`. | lib/index.js:22,44 |
| Persistence | Client-side `localStorage` key `dsh-hud-repos` for the watched-repo list; a host settings namespace `hud` registering `extraRepos` and `panelWidth`. No plugin-authored files on disk. | lib/client.js:56-63; lib/index.js:31-36 |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, or dynamic `import()` in `lib/` or `scripts/`. | grep across lib/, scripts/ |
| Lifecycle hooks | None. `package.json` has no `scripts` block at all. | package.json |
| Telemetry | None found beyond the balance call. No analytics or beacon endpoints in `lib/` or `scripts/`. | negative claim, scope stated |
| Bundle patch | Single `insert` row adding the package to the web composition; no host-tree edits. | cordis.patch.yml |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 9 findings (5 high, 3 medium, 1 low), machine grade F.

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high `lib/client.js:158,192,416` | Same-origin. `fetch("/api/dsh-hud...")` and `new EventSource("/api/dsh-hud/events...")` are relative paths served by the host itself. | lines read |
| NET high `lib/index.js:145` | False positive. `new URL(req.url, 'http://dsh.local')` is a base placeholder for parsing a relative request target. | line read |
| NET high + medium `lib/index.js:482` | True and documented. The DeepSeek balance API, named in README:30-31 and docs/architecture.md:32. Kept as `HUD-NET-1`, medium. | lib/index.js:468,482 |
| NET low `package.json:33` | Repository metadata URL. Inert. | package.json:33 |
| HOOK medium `lib/index.js:65` `setTimeout` | False positive. A 400 ms coalescing timer for SSE tick broadcast; no network work, no deferred beacon. | lib/index.js:61-70 |
| OBFU medium `lib/index.js:213` | Not obfuscation. `decodeURIComponent` on the `repos=` query parameter, parsed by hand rather than through the already-constructed `URL` object. Sloppy but transparent. Kept as `HUD-INPUT-1`, low, because it is a second, less careful parse of attacker-influenced input on the same request. | lib/index.js:211-215 |

### Findings kept after adjudication

| ID | Severity | Location | Note |
|---|---|---|---|
| HUD-AUTH-1 | high | lib/index.js:140-146, 203-228 | The status branch of the data route performs no origin, auth, or token check. Any page in the browser, and any local process able to reach the host's port, can `GET /api/dsh-hud?session=<id>` and receive git status, changed-file lists, skills, model, and balance. The `/events` branch does check origin (lines 150-158), which shows the author knows the pattern and did not apply it here. Session ids are not secrets in this design; the route also answers with partial data when the id is absent. |
| HUD-AUTH-2 | medium | lib/index.js:176-200 | The `/diff` branch is unauthenticated in the same way. It is meaningfully narrowed by a per-session allowlist populated from the last status refresh, so it cannot read arbitrary tracked files, but it will hand any caller the full uncommitted diff of a file the panel has already listed. |
| HUD-NET-1 | medium | lib/index.js:468,482-484 | Documented egress to `api.deepseek.com` carrying the user's API key as a bearer token. Vendor endpoint, HTTPS, 5 s timeout, 60 s cache. |
| HUD-CRED-1 | medium | lib/index.js:474-476 | Reads `DEEPSEEK_API_KEY` via the host credentials service. The key itself does not enter any response or log, but the derived balance is served over the unauthenticated route in HUD-AUTH-1. The source comments record that v1.2.1 had redacted this field after a security review and that it was deliberately restored (lib/index.js:224-226). |
| HUD-SHELL-1 | medium | lib/index.js:630-639, 199, 845 | Two places interpolate values into shell command strings: watched-repo paths from browser storage, and the `/diff` file path. Both are single-quote escaped, and the escaping (`'` becomes `'\''`) is correct as read; repo entries additionally must pass `existsSync`, and diff paths must be in the allowlist. The risk is structural (string-built shell commands) rather than a demonstrated injection. |
| HUD-FS-1 | low | lib/index.js:99-129 | Directory tree walk plus up to 128 `fs.watch` handles per SSE connection. Capped, `.git` and `node_modules` skipped, and `DSH_HUD_NO_WATCH=1` disables it. Prior versions deadlocked here (issue #8, noted in comments). |
| HUD-INPUT-1 | low | lib/index.js:213 | Hand-rolled `repos=` parse alongside the proper `URL` parse on the same request. |

Negative claims and what was searched: full read of `lib/index.js` (851 lines) and of every
network, storage, and settings path in `lib/client.js` (921 lines), plus
`scripts/replay-permodel.mjs`, `package.json`, `cordis.patch.yml`,
`examples/cordis.patch.example.yml`, `README.md`, `docs/architecture.md`, `docs/install.md`. No
`eval`/`Function`/`vm`/dynamic `import()`; no lifecycle scripts; no reads of `.ssh`, `.aws`, browser
profiles, or OS keychains; no writes to disk by the plugin; no absolute URL other than
`api.deepseek.com` and documentation links; no obfuscation or minification (both `lib/` files ship
as readable, heavily commented source).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, panel open, diff click, SSE connection, or idle-soak run was performed. The authentication gap in HUD-AUTH-1 was read in source, not demonstrated with a curl against a live host.
- **What the host does at the `webServer` layer.** If the DSH host binds only to loopback and applies its own origin or token check to registered routes, HUD-AUTH-1 shrinks to "any local process or any page in the same browser" rather than "the network". The host tree was not read for this audit, so the blast radius is stated conservatively.
- **`lib/` vs source.** There is no separate `src/` in this repo; `lib/` is the authored source and is what npm ships. That removes the build-comparison question but means no independent source of truth exists for comparison either.
- **npm registry.** No tarball integrity hash or provenance attestation was fetched.
- **Peer dependencies.** `@deepseek-ai/cordis`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/schemastery` are resolved on the user's machine and were not audited.
- **The client half in full.** 921 lines were not read line by line; the audit read its fetch, EventSource, `localStorage`, and settings paths and grepped the remainder for egress, storage, and execution patterns. A purely visual defect elsewhere in that file would have been missed.
- **`scripts/replay-permodel.mjs`** was read but not executed, so the token-accounting correctness claim it exists to prove is unverified here.
- **Sandbox policy behavior.** `sandboxPolicy.resolve()` output is passed to `shell.run` unread; what constraints it actually imposes is a host question.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on egress
density; the manual verdict is B, and the manual pass added a high finding the scanner did not
raise at all (the missing origin check on the status route). Both positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/a903067276-rgb/dsh-hud /tmp/hud-audit
cd /tmp/hud-audit && git rev-parse HEAD   # expect ba0e78adae6fc0645d42ec243700e8c81151e98a

node tools/scan/dist/index.js /tmp/hud-audit   # from a dsh-bridge checkout

grep -rn "https://" lib | grep -v github.com          # egress: api.deepseek.com only
grep -rnE "eval|new Function|vm\.|import\(" lib       # dynamic exec: none
sed -n '148,158p' lib/index.js                        # origin check: /events only
sed -n '203,228p' lib/index.js                        # status branch: no origin check
sed -n '188,196p' lib/index.js                        # diff allowlist gate
sed -n '630,639p' lib/index.js                        # repo-path shell escaping
node -e "console.log(require('/tmp/hud-audit/package.json').scripts)"   # expect undefined
```

With a DSH web profile running the plugin, the headline finding is one command away:

```bash
curl -s "http://127.0.0.1:<port>/api/dsh-hud?session=<id>" | head -c 400
```

If that returns git and balance data without any credential, HUD-AUTH-1 is confirmed on your
deployment. We did not run this.

## 8. Methodology and pinned inputs

- Subject: git commit `ba0e78adae6fc0645d42ec243700e8c81151e98a` (shallow clone at reference/audits/dsh-hud)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 7 files scanned, 8 skipped, 103095 bytes
- Review: full manual read of `lib/index.js`; targeted read plus pattern grep of `lib/client.js`; full read of `scripts/replay-permodel.mjs`, `package.json`, `cordis.patch.yml`, `README.md`, `docs/architecture.md`
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start A. Declared, documented, single-destination egress carrying a credential drops it to the B band. One high finding (unauthenticated local status route) would normally cap at C; it is held at B because every field served is local-machine data the user already owns, the route is on the host's own web server rather than a new listener, the diff branch is allowlist-narrowed, and no data leaves the machine as a result. If a behavioral probe shows the host binds beyond loopback or accepts cross-origin requests to plugin routes, this becomes a C and the card must be revised.

## 9. Strengths

1. The `/diff` endpoint is allowlist-gated: only paths that appeared in the session's last status refresh can be read, with the set capped at 5000 entries, so it is not an arbitrary file-diff oracle (lib/index.js:186-196,265-277).
2. Shell arguments are escaped rather than concatenated raw: `shq()` for diff paths and the same `'\''` transform for watched-repo paths, both behind an `existsSync` check (lib/index.js:239-241,632-637).
3. Hard limits everywhere: 5 s git timeout, 512 KiB diff cap, 2 MiB status cap, 64 KiB count output, 128 watcher cap, 200 ms per-session request throttle, 60 s caches on balance and version (lib/index.js:243-262,101,468-470).
4. Failure is always graceful: every collector returns `null` or `[]` on error and the panel greys out; missing `webServer` or `shell` makes the whole plugin a no-op instead of blocking host boot (lib/index.js:45).
5. The code is honest about its own history. Comments record the watcher deadlock (issue #8), the self-triggering `.git` watch loop, the log-spam rate limit (issue #4), and the deliberate reversal of the earlier balance redaction. That last note is a disclosure a less careful project would have dropped.
6. No lifecycle hooks, no dynamic code execution, no minification, no telemetry.
7. The `/events` SSE branch does implement a loopback origin check, and it is written inline with an explanation of why the host helper was unavailable (lib/index.js:149-158).

## 10. Residual risks

1. Unauthenticated local read of git status, changed files, skills, model, and account balance (HUD-AUTH-1). On a shared or multi-user machine, or with any local process running untrusted code, this is a real information-disclosure surface.
2. Unauthenticated read of the full uncommitted diff of any file already listed by the panel (HUD-AUTH-2). Uncommitted diffs routinely contain secrets in progress.
3. The account balance is deliberately un-redacted after having been redacted in v1.2.1 for exactly this reason. That is the maintainer's call, documented in the source, but it is the sharpest field on the unauthenticated route.
4. The API key is read on every cache miss and sent to the vendor. A DNS or TLS compromise on the path to `api.deepseek.com` would see it. Standard vendor trust, but it is a credential leaving the process.
5. Shell commands are built as strings. The escaping is correct as read, but a future edit that adds an unescaped interpolation would be an injection with the user's own shell privileges, and the batched multi-command style makes such an edit easy to write.
6. Up to 128 filesystem watchers per SSE connection, on a code path with a documented history of hanging the event loop on macOS. `DSH_HUD_NO_WATCH=1` is the escape hatch.
7. Watched-repo paths come from browser `localStorage` and are handed to the host as absolute paths to run `git` in. Anything that can write that key can point the panel at any directory on the machine the shell service will enter.
8. Source comments and most UI copy are Chinese; the English README is a translation. Fit consideration for an English-first catalog, not a security one.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL, `eval`-family hit, or new `scripts` entry in `package.json` must be re-adjudicated before this grade carries forward.
2. Check whether the status and `/diff` branches have gained the same origin check the `/events` branch has (lib/index.js:149-158). If they have, HUD-AUTH-1 and HUD-AUTH-2 clear and the grade should be re-derived upward.
3. Re-read every shell command construction after any upstream change: `collectGitAt`, `collectGitCount`, the `/diff` handler, and `collectVersion`. A new interpolation without `shq()` or the equivalent escape is a release blocker.
4. Confirm the balance field's disclosure posture on each minor bump; a change in either direction is user-visible and should be reflected in section 3.
5. Re-check the watcher cap and the `DSH_HUD_NO_WATCH` escape hatch, which exist because of a prior hang.
6. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
