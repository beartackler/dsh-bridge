# Trust Report Card: dsh-evolve

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@dsh-external/dsh-evolve` (self-evolving harness: the agent authors, hot-mounts, and persists its own cordis plugins mid-session) |
| Pinned subject | github:william-jin-cmu/dsh-evolve @ commit `37462647f89612ab89b18fadb88299e550748200` (2026-08-13, default-branch head at audit time) |
| npm integrity | Not applicable. `package.json` sets `"private": true`; no npm publication exists to compare. |
| Provenance | Not applicable (git-only distribution). |
| License | `package.json:license` declares BSD-3-Clause, but **no LICENSE file exists in the repository** (`ls LICENSE*` returns nothing) and GitHub reports no detected license. Declared-only. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **D** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The code is clean, careful, and honest, but the product itself is a persistent arbitrary-code-execution
channel driven by model output: `evolve_add` takes a string the model wrote, writes it to
`~/.dsh/evolve/<name>.mjs`, `import()`s it into the DSH process with full Node privileges and no
sandbox, and records it in a manifest so it re-executes automatically on every subsequent DSH start
- the grade reflects that capability, not a defect, and the plugin's own tool description states it
plainly ("evolutions are trusted code, not sandboxed").

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Arbitrary code execution | `evolve_add(name, source)` writes `source` verbatim to disk and dynamically imports it as an ESM module into the running DSH process. The module runs with the process's full privileges: any Node built-in, any filesystem path, any network call. There is no sandbox, allowlist, or review step. | src/index.ts:398-409 (`execute`), mountEvolution at src/index.ts:170-184, `writeSource` at src/store.ts:88-90 |
| Persistence across restarts | Successful mounts are recorded in `~/.dsh/evolve/manifest.json`; on every boot `autoRestore` (default `true`) re-imports and re-mounts each entry with no prompt. A single successful `evolve_add` therefore executes on every future DSH start until `evolve_remove`. | src/index.ts:186-198, Config default at src/index.ts:52 |
| Who supplies the code | The model, from its own generation, during a normal conversation. The plugin injects a 100-line system-prompt section actively encouraging the agent to grow capabilities unprompted, including timers that wake the agent and `agent/pre-step` hooks that inject context every step. | PROMPT_TEXT at src/index.ts:68-160; registered at src/index.ts:420-424 |
| Approval gate | None. `execute` performs no user confirmation, no approval-service call, and no diff presentation before writing and importing. The only checks are the name pattern and a plugin-shape assertion. | src/index.ts:398-419 (full body read; no approval call present) |
| Network egress | None in this plugin's own code. No `fetch`, no HTTP client, no telemetry anywhere in `src/`. Evolutions, however, have unrestricted network access once mounted. | negative claim, scope: all of `src/` (584 lines) |
| Filesystem writes | Its own store only: `~/.dsh/evolve/<name>.mjs`, `manifest.json`, and a `node_modules` symlink. Evolutions themselves are unrestricted. | src/store.ts:88-90, 74-76, 110-119 |
| Symlink creation | Creates `~/.dsh/evolve/node_modules` as a directory symlink (junction on Windows) pointing at the plugin's own `node_modules`, so evolved modules can resolve bare harness imports. Uses `lstat` rather than `existsSync` so a dangling link still counts as present. | src/store.ts:110-119 |
| Lifecycle hooks | No npm `install`/`postinstall`/`prepare` scripts. `package.json` declares no `scripts` block at all. | package.json, read in full |
| Obfuscation | None. The code is unusually well documented, every non-obvious decision carries a comment explaining it. | manual read |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 2 findings (both high, both EXEC/dynamic-import), machine grade C, 9 files scanned.
The scanner's low count is itself misleading here: the risk in this plugin is one line, not a volume.

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| EVOL-EXEC-1 | **critical** (this card's rating; the scanner rated it high) | src/index.ts:180 `const mod: unknown = await import(url)` | The core mechanism. `url` is a `file://` URL under the store directory with a cache-busting query, so the path itself is not attacker-steerable, but the *contents* are whatever `evolve_add` was handed. This is unsandboxed execution of model-authored code inside the harness process. |
| EVOL-EXEC-2 | low | tests/evolve.spec.ts:130 | Same pattern in the test suite. Dev-only. |
| EVOL-PERSIST-1 | **high** | src/index.ts:186-198, manifest write at src/index.ts:411-412 | `autoRestore` defaults to true, so mounted evolutions survive restarts and re-execute silently. Removal requires the agent to call `evolve_remove` or the user to edit `~/.dsh/evolve/manifest.json` by hand. |
| EVOL-CONSENT-1 | **high** | src/index.ts:398-419 | No approval, confirmation, or diff before write-and-execute. The user's only visibility is the tool-call render line after the fact (src/index.ts:378-388). |
| EVOL-PROMPT-1 | medium | src/index.ts:68-160 | The system-prompt section instructs the model to bake the user's private specifics (cities, dates, file paths) into generated tool sources on disk, and shows recipes for timers that wake the agent and for `agent/pre-step` interception. This broadens what ends up written to `~/.dsh/evolve/*.mjs` beyond what a user might expect. |
| EVOL-LICENSE-1 | medium | package.json:license vs missing LICENSE file | BSD-3-Clause is declared but no license text ships. Redistribution terms are effectively unstated. |
| EVOL-DOC-1 | medium | README.md (142 lines, read in full) | The README documents installation, config, and design, and is Chinese-only. It contains no security, risk, sandbox, or trust section - the honest "not sandboxed" statement lives only in the tool description the model reads, not in the document a human reads before installing. |

### What the code does well, on the record

- `validateName` restricts names to `^[a-z][a-z0-9-]{0,63}$` before any path is built, so `..` and separators cannot escape the store directory (src/store.ts:29, 36-44).
- Failed mounts are disposed rather than left behind, and are deliberately *not* written to the manifest, so a broken evolution does not resurrect on boot (src/index.ts:175-183, 403-410).
- The import cache-buster is a per-attempt counter rather than the persisted revision, with a comment explaining that reusing `rev` would serve a stale broken module from Node's cache (src/index.ts:167-169).
- `resolvePlugin` and `assertConfigShape` turn two common authoring mistakes into readable errors instead of opaque cordis failures (src/store.ts:126-156).
- Everything mounts under one group fiber, so disposing `dsh-evolve` unwinds every evolution through ordinary cordis effect teardown (src/index.ts:163).
- `scripts/build.sh` uses `set -euo pipefail`, resolves the DSH checkout explicitly, and only symlinks packages from that checkout. No network, no `curl | sh`.

### Negative claims and what was searched

Searched all of `src/` (index.ts 428 lines, store.ts 156 lines), `scripts/build.sh`, `tests/`,
`assets/`, and the manifests: no `fetch` or any network client; no `eval` or `new Function`; no
`child_process`; no telemetry; no credential path reads (`.ssh`, `.aws`, `~/.claude`, `auth.json`,
keychains); no npm lifecycle scripts; no obfuscation. The single execution primitive is the
`import()` at src/index.ts:180.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/mount/restart cycle was run. In particular the auto-restore path (src/index.ts:186-198) was read, not executed.
- **What evolutions actually do in practice.** By construction this plugin's risk is entirely downstream: the audited code is small and clean, and the dangerous code is whatever the model writes later. No card can grade that.
- **The `assets/trajectory-*.md` transcripts** (10 files) were listed but not read line by line; they are the author's demonstration logs and were not treated as evidence for or against any claim here.
- **The build.** `scripts/build.sh` was read but not executed; `lib/` is not committed, so the artifact a user runs was never produced or inspected in this audit.
- **Peer dependencies.** `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, and `@deepseek-ai/dsh-system-prompt` are peers resolved from the user's DSH checkout; their behavior is out of scope.
- **Whether DSH's own tool-approval policy covers `evolve_add`.** If the harness prompts before every tool call, EVOL-CONSENT-1 is materially softened. That is a host-configuration question this repo-scoped audit cannot answer.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded C on two findings;
this card grades D because the severity here is architectural rather than count-based. Both positions
are recorded.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/william-jin-cmu/dsh-evolve /tmp/dsh-evolve-audit
cd /tmp/dsh-evolve-audit && git rev-parse HEAD   # expect 37462647f89612ab89b18fadb88299e550748200

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dsh-evolve-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '176,184p' src/index.ts     # the import() of model-authored source
sed -n '186,198p' src/index.ts     # auto-restore on every boot, default on
sed -n '398,419p' src/index.ts     # evolve_add execute: no approval gate
grep -rn "fetch(\|child_process\|eval(" src   # no egress, no shell, no eval
ls LICENSE*                        # no license file despite the manifest claim
```

## 8. Methodology and pinned inputs

- Subject: git commit `37462647f89612ab89b18fadb88299e550748200` (shallow clone at `reference/audits/dsh-evolve`)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full read of src/index.ts (428 lines), src/store.ts (156 lines), scripts/build.sh, package.json, dsh.plugin.json, cordis.patch.yml, README.md headings and security grep; `tests/evolve.spec.ts` scanned but not read in full
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start from the capability, not the finding count. Unsandboxed execution of model-authored code (EVOL-EXEC-1) with no consent gate (EVOL-CONSENT-1) and silent re-execution on every restart (EVOL-PERSIST-1) is a D-band capability. Held above F because the mechanism is disclosed by the project itself, the store path is validated, no egress or credential access exists in the plugin's own code, there are no install hooks, and the implementation is transparent and well documented. The missing LICENSE and the Chinese-only README with no security section keep it from C.

## 9. Strengths

1. Path safety done properly: name validation before path construction, so no traversal out of `~/.dsh/evolve` (src/store.ts:29, 36-44).
2. Failure handling that does not accumulate risk: failed mounts are disposed and deliberately excluded from the manifest, with the source kept on disk for inspection and a message saying so (src/index.ts:403-410).
3. Clean teardown semantics: one group fiber owns every evolution, so unloading the plugin unwinds all of them through cordis effects (src/index.ts:163).
4. Honest self-description in the tool text: "evolutions are trusted code, not sandboxed" (src/index.ts:317-318). The project does not oversell its safety.
5. Genuinely high comment quality; nearly every subtle decision (cache-busting counter, `lstat` over `existsSync`, Windows junctions) carries its reasoning inline.
6. No network, no credentials, no shell, no install hooks in the plugin itself.

## 10. Residual risks

1. Any prompt injection that reaches the model - a hostile web page, a poisoned file, a malicious MCP tool result - can attempt to call `evolve_add` and thereby obtain persistent code execution on the machine. This is the dominant risk and it has no mitigation in this plugin.
2. Persistence is silent. After the session that created it ends, an evolution runs on every DSH start with no further notice.
3. The prompt actively encourages baking the user's private data (cities, birthdays, file paths) into plaintext `.mjs` files under `~/.dsh/evolve` (src/index.ts:74-79). Those files are not permission-hardened; no `chmod`/`mode` is set on write (src/store.ts:88-90).
4. The `node_modules` symlink gives evolved modules resolution into the DSH checkout's package tree (src/store.ts:110-119).
5. No license file; redistribution terms are unclear despite the BSD-3-Clause claim.
6. The README offers no security guidance in any language, so a user installing from the README alone never sees the "not sandboxed" statement.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. The single most important diff to watch is whether `evolve_add`'s `execute` (src/index.ts:398-419) ever gains or loses an approval call.
2. Check whether `autoRestore` still defaults to `true` (src/index.ts:52). A change to opt-in would materially improve this grade.
3. Re-check `validateName` (src/store.ts:29) on every bump; a loosened pattern would turn a contained store write into a filesystem-wide one.
4. Watch for a `LICENSE` file and a security section in the README; both are cheap fixes that would move this card.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
