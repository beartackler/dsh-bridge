# Trust Report Card: @vlln/dsh-task-status

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@vlln/dsh-task-status` (background-task status bar above the chat composer, with live output tail) |
| Pinned subject | github:vlln/dsh-task-status @ commit `f03094e2d5c6a81644d66b0c2f869b8f6d13f966` (main, 2026-08-27) |
| npm integrity | not checked |
| Provenance | not checked |
| License | MIT (LICENSE) |
| Stars at audit | 9 |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of all 1248 shipped lines) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A small, entirely local task-progress widget: the host half registers two read-only same-origin JSON
routes over the host's own `jobs` registry, the client half polls them, and nothing in the package
opens an outbound connection, reads a credential, spawns a process, or evaluates code.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The only two `fetch` calls target the plugin's own relative paths `/plugins/dsh-task-status/tasks` and `/plugins/dsh-task-status/output` on the host's own web server. | src/client/task-status.tsx:102,138; src/index.mjs:28,31 |
| Loopback routes registered | Two `exact` routes on the host `webServer`: the task list (JSON snapshot) and the task output tail (`?id=`). Both are read-only; handlers write JSON and never mutate host state beyond the read cursor described below. | src/index.mjs:146-187 |
| Host services used | `webServer`, `jobs`, `agents`, declared in `inject`. | src/index.mjs:56 |
| Host method patching | Replaces `ctx.jobs.read` with a mirror wrapper for the plugin's lifetime, restored on dispose. The wrapper returns buffered-but-unconsumed output plus a live passthrough read, so the official consumer still sees every increment exactly once. | src/index.mjs:129-145,188-193 |
| Data held in memory | Per-task output accumulated in a `Map`, capped at 64 KiB per task with oldest-first truncation. Nothing is written to disk. | src/index.mjs:34,37,46-50 |
| Data exposed over the routes | Task id, kind, label, status, detail, start/finish timestamps, owner session id, and the task's own output text. Task output can contain whatever the agent produced. | src/index.mjs:59-70,117,180 |
| Owner fence bypass | Iterates `ctx.agents.list()` and calls `jobs.list(agent)` per agent to collect owned tasks, which deliberately steps around the per-caller owner fence so the bar can show all tasks. Filtering back down to the viewer's session happens client-side. | src/index.mjs:73-90; src/client/task-status.tsx:114 |
| Filesystem writes | None. No `fs` import anywhere in the package. | grep across src/, lib/ |
| Child processes | None. No `child_process`, no `spawn`, no shell. | grep across src/, lib/ |
| Credential reads | None. No `process.env` read, no auth-file path, no keychain, no cookie or storage access. | grep across src/, lib/ |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, or dynamic `import()`. | grep across src/, lib/ |
| Lifecycle hooks | Only `prepack: npm run build`, which runs on the publisher's machine, not on install. No `install`/`postinstall`/`prepare`. | package.json:47-50 |
| Telemetry | None found. Searched all of `src/` and `lib/` for analytics, beacon, and metrics patterns; zero hits. | negative claim, scope stated |
| Bundle patch | Single `insert` row adding the package to the composition; no host-tree edits. | cordis.patch.yml |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 8 findings (7 high, 1 low), machine grade F, driven entirely by same-origin `fetch`
calls, `new URL(..., 'http://dsh.internal')` base placeholders, and one odd repository URL.

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high `lib/client.js:74`, `src/client/task-status.tsx:102` | False positive as egress. `fetch(TASKS_PATH)` where `TASKS_PATH = '/plugins/dsh-task-status/tasks'` is a relative path on the host's own origin. | src/index.mjs:28 |
| NET high `lib/client.js:112`, `src/client/task-status.tsx:138` | Same: relative output route with a URL-encoded task id. | src/index.mjs:31 |
| NET high `src/index.mjs:165`, `lib/index.mjs:124` | False positive. `new URL(req.url, 'http://dsh.internal')` is the standard base-URL trick for parsing a relative request target; no request is made to that host. | line read |
| SUPPLY high + NET low `package.json:56` `"url": "git+https://github.com/vlln/+process.argv[1]+.git"` | Real defect, not an exploit. The repository URL is a broken template that leaks the literal text `+process.argv[1]+` into metadata. It is an inert JSON string: `package.json` is parsed, never evaluated, and no code in the package reads `repository`. Kept as a low finding for hygiene and because it suggests a generator wrote the manifest. | package.json:56 |

Findings kept after adjudication: one low (`TS-SUPPLY-1`, malformed repository URL). No highs, no
criticals.

Built output matches source: `lib/index.mjs` and `lib/client.js` differ from `src/` only by comment
stripping and the CommonJS `require` shims tsdown emits (verified by direct diff of `src/index.mjs`
against `lib/index.mjs`, and by grepping `lib/client.js` for every capability pattern above).

Negative claims and what was searched: full read of `src/index.mjs` (195 lines),
`src/client/task-status.tsx` (321 lines), `lib/index.mjs` (158), `lib/client.js` (332),
`cordis.patch.yml`, `package.json`, `tsdown.config.ts`, `README.md`. No `fs`, no `child_process`, no
`process.env`, no `eval`/`Function`/`vm`, no cookie or storage access, no obfuscation markers, no
absolute URLs beyond the parse bases and README badge links.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, activate, poll, or idle-soak run was performed. In particular, the `jobs.read` mirror patch is a concurrency claim; we read the logic and it is coherent, but we did not run a task through it to confirm the official `task_output` consumer sees a byte-identical increment sequence.
- **Route authentication.** The two routes are registered through `ctx.webServer.register` with no origin or auth check of their own, unlike some peer plugins that inline a same-origin test. Whether the host applies one at the `webServer` layer was not verified in this audit; the DSH host tree was not read.
- **Published artifact.** No npm tarball integrity or provenance attestation was fetched; this card grades the git tree. We did not run `tsdown` and byte-compare `lib/`.
- **Owner-fence semantics.** The claim that `jobs.list(agent)` enumeration is an intended seam rests on the plugin's own comments and on the client-side session filter; the host `jobs` contract was not independently reviewed.
- **Peer dependencies.** `@deepseek-ai/cordis` and `react` are resolved on the user's machine and were not audited.
- **Screenshot claim.** `docs/preview/task-status.png` is described as a real run; we did not reproduce the run it depicts.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F; the manual
verdict is A. Both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/vlln/dsh-task-status /tmp/task-status-audit
cd /tmp/task-status-audit && git rev-parse HEAD   # expect f03094e2d5c6a81644d66b0c2f869b8f6d13f966

node tools/scan/dist/index.js /tmp/task-status-audit   # from a dsh-bridge checkout

grep -rnE "child_process|require\('fs'\)|from 'node:fs'" src lib   # none
grep -rnE "eval|new Function|vm\.|process\.env" src lib            # none
grep -rn "TASKS_PATH =\|OUTPUT_PATH =" src/index.mjs               # both routes are relative paths
sed -n '129,145p' src/index.mjs                                    # the jobs.read mirror patch
sed -n '56p' package.json                                          # the malformed repository URL
```

## 8. Methodology and pinned inputs

- Subject: git commit `f03094e2d5c6a81644d66b0c2f869b8f6d13f966` (shallow clone at reference/audits/dsh-task-status)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 11 files scanned, 5 skipped, 64061 bytes
- Review: full manual read of every shipped file (1248 lines across `src/`, `lib/`, config, manifest), plus a source-to-build diff
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start A. No outbound network, no credentials, no filesystem writes, no child processes, no dynamic execution, no install-time hooks, and a small auditable surface. The one kept finding is a manifest typo with no execution path. Host-method patching is scoped to one method, restores on dispose, and is documented in the source. Caps applied: none beyond the single-reviewer note.

## 9. Strengths

1. Genuinely minimal: 1248 lines total, no runtime dependencies beyond declared peers, and a host half that does one thing.
2. The `jobs.read` patch is written to be non-destructive and reversible: the mirror returns buffered increments without advancing the producer cursor twice, and dispose restores the original method (src/index.mjs:130-145,188-193).
3. Bounded memory: the output buffer is hard-capped at 64 KiB per task with tail-preserving truncation, so a long-running task cannot grow it without limit (src/index.mjs:34,49).
4. The wire view is an explicit projection, not a snapshot dump: `toWire` copies seven named fields and drops internal accounting (src/index.mjs:59-70).
5. Unknown task ids are checked against the non-consuming list before any consuming read, so a probe cannot advance a cursor or throw (src/index.mjs:106).
6. Route handlers wrap everything in try/catch and answer 400/404/500 with JSON, so a malformed request degrades instead of crashing the host (src/index.mjs:150-157,167-185).

## 10. Residual risks

1. Task output text is served over a local HTTP route with no auth or origin check inside the plugin. Anything that can reach the host's web server can read task labels and output for any task id it can guess or enumerate through the list route. The list route requires no parameters at all.
2. The list route deliberately bypasses the host owner fence, so it returns tasks belonging to every agent; the per-session narrowing happens only in the browser (src/index.mjs:77-83 vs task-status.tsx:114). A direct HTTP client sees everything.
3. Reading output advances the producer cursor and can mark a finished task `reported` earlier than the host would have, which the source acknowledges as an accepted window (src/index.mjs:98-99).
4. The plugin monkey-patches a host service method. Another plugin patching `jobs.read` in the same profile, or a host upgrade changing that contract, could produce duplicated or lost increments.
5. The malformed `repository` URL suggests parts of the manifest were machine-generated without review; treat other metadata claims with matching skepticism.
6. Source comments and most UI copy are Chinese; the English README is a translation. That is a fit consideration for an English-first catalog, not a security one.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL, `fs`/`child_process`/`process.env` use, or new route registration must be re-adjudicated before this grade carries forward.
2. Diff `package.json` scripts on every upgrade: a new `install`/`postinstall`/`prepare` entry is a finding.
3. Re-read `src/index.mjs:126-193` after any upstream change: the set of registered routes and the scope of the `jobs.read` patch are the whole risk surface.
4. If the host adds an auth or origin helper for `webServer` routes, check whether this plugin adopts it; adoption would clear residual risk 1.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
