# Trust Report Card: dsh-anchored-standard (xiaobright/dsh-anchored-standard)

## Header

| Field | Value |
|---|---|
| Plugin family | dsh-anchored-standard (preset collection: `preset/`, `zero-anchored-standard/`, `whoami-standard/`, `prefab/`, `eternal-minimal/`, `wire-think-standard/`, `combo-anchored/`) |
| Pinned subject | github:xiaobright/dsh-anchored-standard @ commit `46f53e4d6d9f95582948f90ec51f4f8a88b5ad9a` |
| Upstream HEAD at audit | 2026-08-26 13:56:00 +0800 |
| License | MIT (LICENSE, "Copyright (c) 2026 xiaobright") |
| Repo age / activity | 3.8k stars (discovery snapshot 2026-08-19); project declared in maintenance-only mode as of 2026-08-17 (README.md "Project status", FAREWELL.md) |
| Audit method | dsh-bridge static scanner v0.1.0 (rulesDigest `9cc04224...`) + manual adversarial review of all findings. No behavioral probe (S4), no dual-model pass (S5). |
| Verified at | 2026-08-26T09:05Z |
| Revision | 1 |

## Verdict in one sentence

Use with awareness: a small, dependency-free preset repository whose executable surface is a user-invoked installer and a bash-tool shim with no network egress anywhere in shipped code, capped at C by the incomplete pipeline and by what the product is - presets that deliberately reshape the model's first-request tool schema and inject instruction text into sessions.

## Grades

### Overall: C

Two ceilings apply and are stated plainly:

1. Full-pipeline ceiling C (docs/trust/pipeline-architecture.md, S6): the sandboxed behavioral probe and the dual LLM adversarial passes did not run for this card. Anything the pipeline could not fully examine is capped at C.
2. The mechanical scanner grade is F (0 critical / 64 high / 14 medium / 4 low across 112 files, 82 findings). Section Evidence adjudicates these counts; every high finding resolved as test scaffolding or documented developer tooling.

### Per-surface grades

| Surface | Grade | Basis |
|---|---|---|
| Preset directories (7 modes, YAML + `.mjs` tools) | B | Tools register through DSH seams only; no fetch, no credentials beyond one named env var read; see Evidence. |
| `shared/custom-bash.mjs` | B | Model-facing `bash` tool spawning `[shell, '-c', command]` via `ctx.subprocess.spawn` with argv array (custom-bash.mjs:203-206); shell is resolved from explicit config or Git Bash probe order, never interpolated (custom-bash.mjs:118-155). This hands the model a real shell - that is the documented product ("Run commands in a bash shell", custom-bash.mjs:163). |
| `shared/toolchoice-adapter.mjs` (wire-think route) | B | Single POST to `${connection.baseURL}/chat/completions` (toolchoice-adapter.mjs:482); baseURL from config > `llm-deepseek` settings > `DEEPSEEK_BASE_URL` env > `https://api.deepseek.com` default (toolchoice-adapter.mjs:71-87); bearer key resolves via DSH `credentials.resolve` then one named env var (toolchoice-adapter.mjs:91-107). Key goes to the configured endpoint only. |
| `prefab/install.mjs` + `prefab/instantiate.mjs` | B | User-invoked installer: copies its own directory into `$DSH_HOME/.agent-presets/<id>` via staging dir plus rename, refuses overwrite of foreign presets (install.mjs:76-79), requires explicit `--confirm-dsh-closed` flag (install.mjs:37-40); spawn targets are `process.execPath` running repo-local scripts with argv arrays (install.mjs:112-115). Writes confined to the DSH home tree and the requested workspace session seed (instantiate.mjs:44-45,335,425). |
| `prefab/probe-clone.mjs`, `prefab/roll-prefab.mjs`, `verify/run-verify.mjs` | A | Developer/research harness, never shipped to a plugin user; spawns the local `dsh` launcher headless (probe-clone.mjs:100-102) and a fixed python zstd decoder (roll-prefab.mjs:105-108). |
| `test/` | A | Test-only credential handling: saves/restores/deletes `process.env.DEEPSEEK_API_KEY` around adapter tests (test/toolchoice-adapter.test.mjs:56,154,239-248); mock `spawn()` objects drive the EXEC count. |

## What this plugin family can do (capability summary)

- Network egress: exactly one path in shipped code - the wire-think adapter's chat-completions POST to the DeepSeek endpoint you configure (default `https://api.deepseek.com`). Everything else the scanner flagged as NET is URL strings in metadata files and tests (NET-008 class).
- Credential access: reads one named environment variable (`DEEPSEEK_API_KEY`, or the env name configured per provider row) after trying the DSH credentials service. No file-based credential paths, no token stores, no exfil-shaped code.
- Process execution: the model-invoked `bash` tool (documented, schema-honest about no Windows sandbox confinement, custom-bash.mjs:171) and the user-invoked install/probe scripts spawning `node`/`python`/the local `dsh` binary.
- Writes: `$DSH_HOME/.agent-presets/` (install), `$DSH_HOME/sessions/` + `storages/` (instantiate seeding), nothing else found.
- Session influence by design: presets shrink or fix the first request's tool schema, inject guidance text at session start (instruction-hint/context-gate family), and the prefab seeds a pre-rolled trajectory into new sessions. This steers model behavior; it does not touch the host beyond the writes above.

## Evidence

Mechanical scan (verbatim): target `dsh-anchored-standard`, scanner 0.1.0, rulesDigest `9cc04224b1dc7e81...`, 112 files scanned / 14 skipped, families present CRED EXEC HOOK NET OBFU, gate fired `dynamic-exec-present`, grade F, score 0. Raw JSON retained at `reference/audits/scan-7b-dsh-anchored-standard.json`.

Adjudication of every finding class:

1. EXEC-004/EXEC-005 (57 findings, all high): `spawnSync` imports and call sites concentrate in `test/` (mock spawn objects and child-process runs of the repo's own scripts), `prefab/` (user-invoked installer and research probes, argv arrays throughout: install.mjs:112, roll-prefab.mjs:106, probe-clone.mjs:100) and `verify/run-verify.mjs:102`. No exec site takes a string built from untrusted input; the one model-controlled string (`args.command`) is passed as a single argv element to an explicitly documented shell tool.
2. CRED-007 (13 medium): all inside `test/toolchoice-adapter.test.mjs`, which snapshots and restores `DEEPSEEK_API_KEY` around isolated tests (lines 56, 154, 194-195, 200, 216-217, 222, 233-234, 239-240, 248). Test fixture behavior, not harvesting.
3. NET-001/NET-007 (high): two identical fetch sites in the shipped adapter (shared/toolchoice-adapter.mjs:482 and its copy wire-think-standard/toolchoice-adapter.mjs:482) reaching the user-configured DeepSeek endpoint; the rest are `https://example.test` strings in tests. Documented, single-purpose egress.
4. HOOK-006 (medium): `setInterval(fn, ms)` appears in `test/first-assistant-canceller.test.mjs:24` asserting against an injected timer function; the real implementation (verify/first-assistant-canceller.mjs:29-41) polls local session events to cancel a run early. No delayed beacon exists.
5. NET-008/OBFU low volume: GitHub research links inside `prefab/template.jsonl.meta.json:9,14` and the constant `https://api.deepseek.com` default (shared/toolchoice-adapter.mjs:53).

No dynamic code execution (`eval`, `new Function`) exists anywhere in the repository (scanner found none; grep confirms zero hits outside node_modules-free source).

## What we could not check

- Runtime behavior inside DSH: whether the anchor/prompt-injection presets behave identically when loaded by the harness versus their static definition was not probed.
- The upstream recommendation web: README points users toward `dsh-routing-suite` (a runtime injector family) and other community projects; those repos are separate audit subjects and are not covered by this card.
- npm/pypi distribution: this repo ships as copy-in preset directories, so there is no published artifact to reconcile; if a marketplace ever packages it, provenance must be re-checked.
- Behavioral effect of seeded trajectories on model outputs (a prompt-engineering risk, not a code-safety one).

## Reviewer disagreement

None. Single-model manual adjudication; per the pipeline this card would require a second, independent model pass before exceeding grade C.

## Verify this yourself

```bash
# Pin the subject
git clone --depth 1 https://github.com/xiaobright/dsh-anchored-standard reference/audits/dsh-anchored-standard
git -C reference/audits/dsh-anchored-standard rev-parse HEAD   # expect 46f53e4d6d9f95582948f90ec51f4f8a88b5ad9a

# Re-run the mechanical scan (expect grade F on raw counts)
node dsh-bridge/tools/scan/dist/index.js reference/audits/dsh-anchored-standard

# Spot-check the headline claims
sed -n '203,207p' reference/audits/dsh-anchored-standard/shared/custom-bash.mjs   # bash tool spawn, argv array
sed -n '480,489p' reference/audits/dsh-anchored-standard/shared/toolchoice-adapter.mjs  # sole egress fetch
sed -n '86,107p' reference/audits/dsh-anchored-standard/shared/toolchoice-adapter.mjs   # key resolution chain
grep -rn "new Function\|eval(" reference/audits/dsh-anchored-standard --include='*.mjs' | wc -l   # expect 0
```

## Residual risks (accepted by this grade)

1. The `bash` tool gives the model full local shell execution on Windows without OS sandbox confinement - stated in its own tool description (custom-bash.mjs:171) and inherent to the product.
2. The wire-think adapter sends your conversation traffic (prompts and completions) to whichever endpoint its config chain resolves; pointing `DEEPSEEK_BASE_URL` or a settings row at a third-party relay sends prompts there.
3. Presets intentionally manipulate first-request tool schemas and inject instruction text; a user wanting "vanilla" harness behavior should not install these modes.
4. Maintenance-only upstream (since 2026-08-17): future DSH API changes may make copied presets behave unexpectedly with no fix forthcoming.
5. The behavioral probe and cross-model review did not run; a clean static read is not proof of runtime cleanliness.

## Methodology and pinned inputs

Scanner: dsh-bridge tools/scan dist build, version 0.1.0, rulesDigest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`. Subject pinned by git commit SHA (fresh shallow clone). Manual review by one auditor covering every critical (none existed), every high-finding file, and sampled medium/low findings; all claims carry file:line anchors resolvable at the pinned commit. Grade semantics follow docs/trust/pipeline-architecture.md S6; caps applied: incomplete-pipeline ceiling C. Disclaimer: a grade is evidence-backed opinion over a pinned artifact, not a safety guarantee, and says nothing about versions other than the pinned commit.

## Revision history

| Rev | Verdict digest basis | Change |
|---|---|---|
| 1 | commit `46f53e4d`, scanned and adjudicated 2026-08-26T09:05Z | Initial card. Overall C; per-surface grades as tabulated; mechanical F reported and fully adjudicated as test/tooling false positives. |

Re-vetting triggers: any resume of active development (per FAREWELL.md the project is frozen), any new network-touching file, any change to `custom-bash.mjs` or the toolchoice adapter, or 90 days elapsed.
