# Trust Report Card: context-vista

## 1. Header

| Field | Value |
|---|---|
| Plugin | `context-vista` (DSH plugin: a `/context` slash command and floating card showing context-window usage, compaction savings, and estimated cost) |
| Pinned subject | github:GooodWei/context-vista @ commit `fdde2e6da8524cd5ea27598c19eae744d4a1078a` (default branch `master`, shallow clone head at audit time) |
| npm integrity | not checked (no published-artifact comparison performed; see section 5) |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A read-only display plugin: it reads the host's own session projections, does arithmetic against a
pricing table, writes one small ledger file under `~/.dsh/storages`, and makes no network request,
spawns no process, and touches no credential.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `node:http` in either shipped file (grep of lib/index.js and lib/client.js). | grep |
| Literal URLs present | `https://api.deepseek.com` twice, used only as a pricing-table key so a route's `baseURL` can be matched to a price row (lib/index.js:672, lib/client.js:201). Never fetched. | file:line |
| Child processes | None. `node:child_process` is not imported anywhere. | grep |
| Credential reads | None. `process.env` is read for `DSH_HOME` (lib/index.js:327) and for locale (`LANG`/`LC_ALL`/`LC_MESSAGES`, lib/index.js:764). Provider `baseURL` values are read from the host settings service (lib/index.js:674-687); API keys are never touched. | file:line |
| Filesystem | Reads and writes exactly one path: `$DSH_HOME/storages/context-vista-billing.json` (lib/index.js:326-329). Written atomically via a `.tmp` file plus `rename` (lib/index.js:580-590), debounced to at most one write per 100 ms (lib/index.js:594-601). | file:line |
| Client storage | Two `localStorage` keys for the floating card's remembered vertical position (lib/client.js:624, 633). | file:line |
| Host surface | Registers three session projections and two slash commands (lib/index.js:885-887, 896, 1004). No HTTP route, no RPC channel. | file:line |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*`; the one `.exec(` at lib/index.js:179 is `RegExp.prototype.exec` on a `HH:MM` string. | grep + read |
| Telemetry | None found. | negative claim, scope stated |
| Lifecycle hooks | No `scripts` block in package.json at all. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 4 findings (1 high, 3 low), machine grade C. This is the cleanest scanner result in this
audit batch and every finding is a manifest or table-key match.

### Findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| SUPPLY-010 high, package.json:8 "dependency pinned to a git host" | False positive. The match is the `repository` field (`git+https://github.com/GooodWei/context-vista.git`), which is provenance metadata, not a dependency spec. The manifest declares no `dependencies` at all; everything is a `peerDependencies` semver range on `@deepseek-ai/*` and React. | package.json read in full |
| NET-008 low, package.json:8 | Same `repository` field. | package.json |
| NET low, lib/index.js:672 | `https://api.deepseek.com` as the default entry of the provider-name-to-baseURL map used for pricing lookup. No request is made from this file. | lines read; grep for fetch returns nothing |
| NET low, lib/client.js:201 | The same constant, duplicated in the client's pricing table so the two halves stay in sync (the file comment states this). | lines read |

Nothing was kept as a real finding.

### Negative claims and what was searched

Grepped both shipped files (lib/index.js 1,031 lines, lib/client.js 946 lines) for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `child_process`, `spawn`, `exec`, `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML`, `process.env`, `readFile`, `writeFile`, `homedir`, and `https?://`. Every hit is accounted for in section 3 or 4. `package.json` `files` ships only `lib/index.js`, `lib/client.js`, and `cordis.patch.yml`.

## 5. What we could not check

- **Published artifact vs source.** The npm package was not fetched; no integrity hash or provenance attestation was compared against this commit.
- **Behavioral probe.** No sandboxed load or `/context` invocation was run. Cost figures were not checked for accuracy, only for where their inputs come from.
- **Full line-by-line read.** Both files were read at their security-relevant sites (filesystem, settings, env, URL constants, projection registration) and grepped exhaustively for dangerous APIs; the pricing and chart-rendering arithmetic was not reviewed line by line.
- **Correctness of the cost estimate.** The plugin's own README calls it an estimate; this card takes no position on whether the numbers are right.
- **Peer dependencies.** All runtime code comes from `@deepseek-ai/*` peers resolved on the user's machine; those are outside this artifact.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded C on a `repository`-field match; the manual verdict is A. Both positions are recorded.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/GooodWei/context-vista /tmp/context-vista-audit
cd /tmp/context-vista-audit && git rev-parse HEAD   # expect fdde2e6da8524cd5ea27598c19eae744d4a1078a

node tools/scan/dist/index.js /tmp/context-vista-audit   # from a dsh-bridge checkout

grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|EventSource\|child_process" lib/   # expect none
grep -rn "eval(\|new Function\|vm\." lib/          # expect none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" lib/ | sort -u   # expect api.deepseek.com only
sed -n '326,329p' lib/index.js                     # the single write path
node -e "const p=require('./package.json');console.log(p.dependencies, Object.keys(p.scripts||{}))"
#   expect undefined []
```

## 8. Methodology and pinned inputs

- Subject: commit `fdde2e6da8524cd5ea27598c19eae744d4a1078a`, clone at `reference/audits/context-vista`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Review: package.json and cordis.patch.yml read in full; lib/index.js and lib/client.js grepped exhaustively for dangerous APIs and read at every hit.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
- Grade derivation: zero findings after adjudication, zero egress, zero credential access, no process spawning, no dynamic execution, no lifecycle hooks, one scoped write path. A band. Not raised further because the published bundle was not compared and no behavioral probe was run.

## 9. Strengths

1. No network capability exists in the shipped code; the only URLs are pricing-table keys.
2. The ledger write is atomic (temp file plus `rename`) and debounced, so a crash cannot leave a half-written file and hot paths do not thrash the disk (lib/index.js:580-601).
3. Corrupt or missing ledger files are handled by starting from an empty ledger rather than throwing: display data never blocks the host (lib/index.js:568-570).
4. A schema-versioned persistence format with an explicit v1-to-v2 migration path (lib/index.js:546-566).
5. No `dependencies`, no build step, no install scripts. The whole plugin is two readable ESM files.
6. Pricing is user-overridable through the standard settings seam rather than hardcoded-only.

## 10. Residual risks

1. The billing ledger accumulates per-session token and cost history in a plaintext JSON file under `~/.dsh/storages`; that is metadata about usage, retained indefinitely with no documented rotation.
2. Cost figures are estimates derived from a static table; a stale table shows wrong numbers, which is a correctness rather than a security risk.
3. The published npm bundle was not compared against this commit.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD; any newly introduced network API, `child_process` import, or added `dependencies` entry must be adjudicated before this grade carries forward.
2. Confirm the write path at lib/index.js:326-329 is still the only filesystem target.
3. Check that `files` in package.json still ships only the two lib files and the patch.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is in section 8.
