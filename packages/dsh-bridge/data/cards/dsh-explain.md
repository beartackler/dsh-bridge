# Trust Report Card: dsh-explain

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-explain` (learning-mode plugin: a second, auxiliary model explains the primary agent's turns into a local SQLite learning thread) |
| Pinned subject | github:yuezengwu/dsh-explain @ commit `99239d4aab7cec2073293514c8b910eb47c981c4` (shallow clone HEAD, committed 2026-08-20), package version 0.1.0, `"private": true` |
| npm integrity | Not applicable. The package is marked private and was not looked up on the registry. |
| Provenance | Not established. |
| License | MIT (LICENSE:1) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **B+** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The plugin owns no network client of its own: it sends conversation excerpts to whichever provider
and model the user explicitly selects in DSH settings, through DSH's own `ctx.llm` layer, and
stores the results in a 0600 SQLite file under `~/.dsh`. The honest risk is not a hidden endpoint,
it is the declared one: your conversation text is copied to a second model on a schedule.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | No direct network code in `src/`. There is no `fetch`, no `node:http(s)`, and no socket in the shipped source. All model traffic goes through the host's `ctx.llm.prepareCall(...).stream(...)`, with `provider` and `model` taken from the user's configured route. | grep across src/ returns zero network primitives; src/explainer.ts:285-297; src/explainer.ts:58-71 |
| What is sent | Bounded "source capsules" built from a completed turn: the user's message text, the assistant's message text, tool names, and tool result previews truncated to 1000 chars, all capped by `maxSourceChars`. This is conversation content leaving for a second model. | src/observer.ts:28-72, 59-62 |
| Model route | Refuses to run without an explicit provider and model, and requires the model to publish a context window. Fails closed with `MODEL_ROUTE_REQUIRED` / `MODEL_CONTEXT_REQUIRED`. | src/explainer.ts:52-71 |
| Child processes | None in shipped source. All `child_process` use is in `scripts/build-client.mjs` and `tests/*.snapshot.ts`, and every spawn target is `process.execPath` with literal arguments. | src/ grep is empty; scripts/build-client.mjs:7,69; tests/web.snapshot.ts:57,146,176 |
| Credential reads | None. The only environment read is `process.env.DSH_HOME` for the storage root. Settings are described with `redactSecrets: true`. | src/config.ts:116; src/runtime.ts:58 |
| Filesystem writes | One SQLite database at `<dshHome>/dsh-explain/v1/thread.sqlite`, in a directory created 0700 and a file chmodded 0600 on non-Windows. `storageDir` may be overridden by config; an absolute value is honored, a relative one is resolved under `dshHome`. | src/config.ts:116-131; src/store.ts:249-254 |
| Dynamic code execution | None in shipped source. One `import()` with a computed specifier exists in `tests/seed-web-session.mjs:18`, resolving DSH's own packages for a test harness. | grep; tests/seed-web-session.mjs:18 |
| Telemetry | None. No analytics or beacon code in src/. | negative claim, scope stated |
| Lifecycle hooks | `"prepare": "pnpm build"` in package.json:80. `prepare` runs on `npm install` from a git checkout and on local installs. | package.json:80 |
| Config strictness | Unknown config keys are rejected against a 14-key allowlist, and non-object config throws. | src/config.ts:101-115 |

Budgets are enforced: `maxAutoRequestsPerDay`, `maxPendingCandidates`, `maxSourceChars`,
`contextThresholdRatio`, `timeoutMs`, and `maxAttempts` are all configurable and are surfaced in
the status view, so the user can see how much auxiliary traffic is being generated.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 19 findings (1 critical, 14 high, 1 medium, 3 low), machine grade F, gates
`dynamic-exec-present` and `finding-density`. Adjudication:

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 critical, scripts/build-client.mjs:42 | False positive. `define: { 'process.env.NODE_ENV': ... }` is a bundler substitution table in a build script. It does not enumerate the environment and does not ship (package.json `files` lists only `lib/**` and `cordis.patch.yml`). | scripts/build-client.mjs:42; package.json:39-51 |
| EXEC-004 / EXEC-005 x8 in tests/web.snapshot.ts, tests/m6-combination.snapshot.ts, scripts/build-client.mjs | Test and build only, and each spawn target is `process.execPath` with literal argument arrays (running `tsc`, the DSH CLI, and a seed script). No user input reaches an argv. None of these files ship. | tests/web.snapshot.ts:1,57,146,176; tests/m6-combination.snapshot.ts:1,43,71,112; scripts/build-client.mjs:7,69 |
| NET-003 x2 (`node:net`) tests/web.snapshot.ts:2, tests/m6-combination.snapshot.ts:2 | Test only. `createServer` is used to find a free port before launching a DSH web instance for snapshot tests. | those files' import lines |
| EXEC-006, tests/seed-web-session.mjs:18 | Test only. Dynamic `import()` of DSH's own resolved packages inside a fixture seeder. | tests/seed-web-session.mjs:18 |
| HOOK-002 medium, package.json:80 `"prepare": "pnpm build"` | Kept. `prepare` executes on install from a git source. Its body is the project's own build (`tsc`, `tsdown`, a client bundler), not a network fetch, but it is real install-time code execution and is recorded as such. | package.json:70-80 |
| SUPPLY-010 high + NET-008 x3, package.json:8,10,12 | False positive. `repository`/`homepage`/`bugs` metadata, not a dependency spec. Every dependency is a semver range on a registry package. | package.json:81-100 |

### Negative claims and what was searched

Searched all of `src/` (14 host files, 7 client files, 6170 lines total): zero hits for `fetch(`,
`child_process`, `eval(`, `new Function`, `vm.`, `node:http`, `node:https`, `node:net`. The only
`process.env` hit in `src/` is `DSH_HOME` at src/config.ts:116. No `.ssh`/`.aws`/keychain/browser
store access. No telemetry endpoint. No writes outside the resolved `storageDir`.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/enable/idle-soak run was performed. In particular the
  scheduler's auto-trigger cadence (src/scheduler.ts, 688 lines) was read only in outline, not
  executed, so the real-world volume of auxiliary calls is unmeasured.
- **Published artifact.** The package is `private: true` and no registry tarball exists to compare;
  the `lib/` build output is not committed either, so what users install depends on their own build.
- **Full read of the large modules.** `src/store.ts` (1660 lines) and `src/scheduler.ts` (688 lines)
  were grepped exhaustively for dangerous primitives and read at their path and persistence layers,
  not read end to end.
- **What DSH's `ctx.llm` does with the payload.** The destination host, retry behavior, and logging
  belong to the harness and the user's chosen provider, not to this plugin.
- **Prompt content review.** The exact system prompts sent to the auxiliary model were not
  transcribed here, so no claim is made about instruction hygiene.
- **SQLite at-rest protection.** The database holds conversation excerpts in plaintext; only file
  permissions were verified, not encryption (there is none).

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on a build-file
critical and test-file spawns; the manual verdict is B+. Both positions are in section 4.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/yuezengwu/dsh-explain /tmp/explain-audit
cd /tmp/explain-audit && git rev-parse HEAD   # expect 99239d4aab7cec2073293514c8b910eb47c981c4

grep -rn "fetch(\|node:http\|node:net\|child_process\|eval(\|new Function\|vm\." src/   # zero hits
grep -rn "process.env" src/                    # one hit: DSH_HOME in config.ts
sed -n '249,255p' src/store.ts                 # 0700 dir, 0600 db file
sed -n '52,71p' src/explainer.ts               # refuses to run without an explicit provider+model
sed -n '28,72p' src/observer.ts                # exactly what conversation text is captured
sed -n '78,81p' package.json                   # the "prepare" install hook
```

## 8. Methodology and pinned inputs

- Subject: git commit `99239d4aab7cec2073293514c8b910eb47c981c4` (shallow clone at
  reference/audits/dsh-explain)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 53 files, 559500 bytes
- Review: full read of `src/config.ts`, `src/observer.ts` capture path, `src/explainer.ts` route
  validation and request path, `src/gateway.ts` status surface; targeted read of `src/store.ts`
  path and permission layer and `src/runtime.ts` settings access; full read of `package.json`;
  exhaustive grep of all of `src/` for network, exec, credential, and filesystem primitives; every
  scanner finding opened at its cited line
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high or critical production finding survived adjudication, and the plugin
  has no network client of its own. Held at B+ rather than A because (a) the product's whole purpose
  is to copy conversation content to a second model, which is a real and continuous egress of user
  data even though the destination is user-chosen, and (b) an install-time `prepare` hook exists.
  Not lower, because the egress is declared, gated behind an explicit model selection, budgeted, and
  visible in the status view.

## 9. Strengths

1. No private network client. The plugin never opens a socket; it borrows the harness's model layer,
   so the user's existing provider trust decision is the only one that applies.
2. Fails closed on configuration: no provider or model means no requests, and a model without a
   published context window is rejected rather than guessed at.
3. Config is allowlisted (14 keys) and type-validated; unknown keys throw instead of being ignored.
4. Storage hygiene: 0700 directory, 0600 database, a single immutable resolved path computed once
   at config time.
5. Data sent to the auxiliary model is explicitly bounded (`maxSourceChars`, 1000-char tool result
   previews) rather than dumping whole sessions, and daily request budgets are enforced and
   reported.
6. Secrets are excluded from the settings snapshot it reads (`redactSecrets: true`).

## 10. Residual risks

1. This is a data-egress product by design. Enabling it means your prompts, the assistant's replies,
   and tool result previews are sent to a second model. That model may be a different vendor from
   your primary one. The README's "local-first" badge describes storage, not transmission, and a
   user could read it as a stronger privacy claim than the code supports.
2. `"prepare": "pnpm build"` runs at install time from a git source. The body is the project's own
   build today; a future compromise of that script executes on install.
3. The learning thread accumulates conversation excerpts in plaintext SQLite. File permissions are
   the only protection; anyone with the user's filesystem access can read it.
4. `storageDir` accepts an absolute path from config, so a mistaken or hostile configuration can
   place the database outside `~/.dsh`.
5. The package is `private: true` with no committed build output, so every installer builds from
   source with the full dev dependency tree, which was not audited here.
6. The scheduler decides autonomously when a turn is worth explaining; a chatty session can generate
   many auxiliary calls up to the daily cap, with the corresponding cost and data volume.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any appearance of `fetch`, `node:http`,
   `node:https`, or `child_process` inside `src/` is a material change and must be adjudicated
   before this grade carries forward.
2. Re-read `src/observer.ts` capture functions on every version bump: any widening of what a source
   capsule includes (system prompts, file contents, full tool output) increases the egress surface
   and should lower the grade.
3. Diff `package.json` `scripts` for new or changed lifecycle hooks, and `files` for anything newly
   shipped.
4. Re-check `src/config.ts` for the `CONFIG_KEYS` allowlist and the storage path resolution; a
   removed allowlist or a path that accepts user input at request time is a finding.
5. Re-run the scanner after a heuristics-corpus bump; the corpus digest is in section 8.
