# Trust Report Card: @deepseek-ai/dsh-session-health

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@deepseek-ai/dsh-session-health` (read-only diagnostic tool: frame-level health scan of multi-frame zstd session logs) |
| Pinned subject | github:omdsh-dev/dsh-session-health @ commit `d850f83503fc0966524a2477890faeff09148577` (shallow clone, default branch head at audit time; package.json version 0.0.1) |
| npm integrity | not applicable: `"private": true` (package.json:5), so the package is not published |
| Provenance | none; source-only distribution |
| License | MIT (LICENSE:1-3, "Copyright (c) 2026 whiteicey") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual review of all six src/*.ts files) |
| Revision | 1 |
| Grade | **A-** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A zero-dependency, read-only scanner over the user's own DSH session logs: it opens no sockets,
spawns no processes, reads no credentials, writes nothing, and its only path into the filesystem is
guarded by a strict session-id pattern plus realpath containment.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, no `node:http`/`node:https` import, no socket anywhere in src/. Every scanner NET finding lands in package-lock.json (registry URLs, 137 of them). | grep of src/, scanner path breakdown |
| Child processes / shell | None. No `child_process`, `spawn`, or `exec` import. The `.exec(` hits at src/deep.ts:108,127 are `RegExp.prototype.exec` extracting a `"type"` field from a JSONL line. | src/deep.ts:108,127 |
| Filesystem reads | Read-only, scoped to `$DSH_HOME/sessions` (default `~/.dsh/sessions`, src/files.ts:21-27). Enumerates session files and decodes them for statistics. | src/files.ts:21-27 |
| Filesystem writes | None. No write, append, mkdir, unlink or rename in src/. | grep of src/ |
| Credential reads | None. The only environment read is `env.DSH_HOME` (src/files.ts:21-22); there is no environment enumeration and no auth-file path anywhere. | src/files.ts:21-22 |
| Dynamic code execution | One `await import(ZSTD_IMPORT)` at src/deep.ts:59. The specifier is the module-level constant `'@deepseek-ai/dsh-session-persistence-jsonl/src/zstd.ts'` (src/deep.ts:40), never built from input. Failure is caught and returned as `decoder-unavailable` rather than thrown (src/deep.ts:58-63). A second dynamic import loads `node:fs/promises` (src/deep.ts:66). Both are literal; the detector flags them because the specifier is an identifier rather than an inline string. | src/deep.ts:40, 58-66 |
| Telemetry | None. No analytics, beacon, or metrics code in src/. | negative claim, scope: src/ |
| Lifecycle hooks | `prepack: npm run build` (package.json:33). Publisher-side, and the package is private in any case. No install/postinstall entries. | package.json:27-34 |
| Runtime dependencies | None. Only peer deps on DSH's own packages (`@deepseek-ai/cordis`, `dsh-invariants`, `dsh-tools`) and dev-only tooling. | package.json:36-40 |
| Tool surface | Registers one tool, `session_health`, with actions over a session path or id, an optional `deep` decode flag and a `listAll` flag (src/index.ts:164-198). | src/index.ts:164-198 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 246 findings (26 high, 220 low), machine grade F, gate `dynamic-exec-present`.
Findings by path: package-lock.json 244 (NET registry URLs and OBFU integrity hashes), src/deep.ts
1, lib/deep.js 1 (the compiled copy of the same line).

### Gate adjudication

| Gate | Machine reason | Adjudication |
|---|---|---|
| `dynamic-exec-present` | "Dynamic import() with a non-literal specifier" at src/deep.ts:59 | False positive as a security matter. The specifier is a module-level `const` holding a fixed package path (src/deep.ts:40); no caller input reaches it. The detector's own note says literal specifiers are excluded, and this is a literal one indirected through a constant. |

### Non-test findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| SH-FS-1 | low | src/files.ts:21-27 | Reads the user's session logs. Session transcripts contain conversation content, so this is a real read surface even though nothing leaves the machine. |
| SH-EXEC-1 | low | src/deep.ts:59 | Dynamic import of a fixed DSH package path; failure degrades to `decoder-unavailable`. |
| SH-HOOK-1 | low | package.json:33 | `prepack` build hook, publisher-side. |

### Scanner noise dismissed (with scope)

- 244 findings in package-lock.json: `https://registry.npmjs.org/...` resolved URLs (NET) and `sha512-...` integrity strings misread as obfuscation (OBFU). Lockfile metadata, not executable code.
- The `.exec(` occurrences at src/deep.ts:108,127 are regex matches, verified by reading both lines.

### Negative claims and what was searched

Searched all six files in src/ (748 lines total: deep.ts 147, files.ts 185, index.ts 201,
invariant.ts 27, report.ts 91, zstd-scan.ts 97): no network of any kind, no child processes, no
filesystem writes, no credential paths, no environment enumeration, no telemetry.

Path-safety defences read directly and corroborated by the module header comment (src/files.ts:8-13):
strict session-id pattern `^[A-Za-z0-9._-]+$` (src/files.ts:47); a separate traversal rejector for
`..` segments, both separator styles and drive-letter prefixes, applied before `join` (src/files.ts:50);
containment decided on `fs.realpath` of both root and target rather than lexical resolve, so a symlink
escaping the root is rejected and a non-existent target fails closed (src/files.ts:57-67).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run was performed. The tool was not pointed at a real session directory, so the decode path, the size cap at `MAX_DEEP_COMPRESSED_BYTES` (src/deep.ts:73-75) and the error classifications are claims about code we read, not observed behavior.
- **The zstd decoder's own behavior.** `@deepseek-ai/dsh-session-persistence-jsonl` is imported at runtime and is outside this artifact; a malformed session file's blast radius depends on that decoder, not on this plugin.
- **Compiled lib/ vs src/.** The repo ships both. lib/deep.js was only spot-checked via the scanner's matching finding; a full src-to-lib diff was not performed, and no build was run to reproduce it.
- **Test suite execution.** `vitest run tests` was not executed; the four spec files were not read line by line.
- **Publication identity.** The package name is `@deepseek-ai/...` but the repository owner is `omdsh-dev` and the LICENSE copyright is "whiteicey". The name suggests first-party origin that the repository location does not establish. Because the package is `private: true` it is not on npm under that scope today, but anyone installing from git should know the naming does not prove provenance.
- **Cross-model review.** Single reviewer, one model.

## 6. Strengths

1. Genuinely zero-dependency at runtime: nothing but DSH peer packages and node builtins, so there is no transitive supply-chain surface.
2. Containment decided on real paths, not lexical ones (src/files.ts:57-67), which closes the symlink and junction escapes that `path.resolve` alone would miss, and fails closed when realpath errors.
3. Defence in depth on the id input: pattern allowlist plus an independent traversal rejector plus a post-resolution containment recheck (src/files.ts:47, 50, 57-67).
4. Read-only by construction; no write call exists to be misused.
5. Errors are classified and returned, never thrown (src/deep.ts:58-76), so a corrupt session cannot crash the host through this tool.
6. The security rationale is written down in the module header (src/files.ts:8-13) and matches what the code does.

## 7. Residual risks

1. Session transcripts are sensitive; a tool that summarises them puts their statistics into agent context. Nothing leaves the machine, but the content is surfaced to the model that invoked the tool.
2. Deep analysis decodes attacker-influenced compressed data through a third-party decoder. A size cap exists (src/deep.ts:73-75) but decompression-bomb resistance ultimately belongs to the decoder.
3. Name-versus-owner mismatch (`@deepseek-ai/` scope, `omdsh-dev` repo, third-party copyright) is a phishing-adjacent signal even if the code is clean. Install from the git URL you verified, not from a name you assumed.
4. The repo is `private: true` and version 0.0.1: pre-release, with no published-artifact chain to check against.

## 8. Methodology and pinned inputs

- Subject: git commit `d850f83503fc0966524a2477890faeff09148577` (shallow clone at reference/audits/dsh-session-health)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 26 files scanned, 4 skipped
- Review: manual read of src/files.ts, src/deep.ts, src/index.ts tool registration, package.json, cordis.patch.yml, LICENSE; targeted grep across all of src/ for network, exec, write and credential surfaces
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high or critical production findings survive adjudication; the single gate is a false positive. No egress, no writes, no credentials, no dependencies, and above-average path hygiene put this at the top of the band. Held below A by: no behavioral probe, an unverified src-to-lib relationship, and the scope/ownership mismatch noted in section 5. Net: **A-**.

## 9. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/omdsh-dev/dsh-session-health /tmp/sh-audit
cd /tmp/sh-audit && git rev-parse HEAD   # expect d850f83503fc0966524a2477890faeff09148577

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/sh-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(\|node:http\|child_process\|spawn" src/     # egress and exec: zero hits
grep -rn "writeFile\|appendFile\|mkdir\|unlink\|rename" src/ # writes: zero hits
grep -rn "process.env" src/                                  # env: only DSH_HOME
sed -n '40,66p' src/deep.ts                                  # the dynamic import specifier is a const
sed -n '46,67p' src/files.ts                                 # id allowlist + realpath containment
```

## 10. Re-verify steps

1. Re-run the block above against the current HEAD. Any new network call, any write call, or any change making `ZSTD_IMPORT` non-constant must be re-adjudicated before this grade carries forward.
2. If the package ever loses `"private": true` and publishes, pin the tarball integrity and compare lib/ against the tagged tree; this card establishes no such link.
3. Re-read `isWithin` and `SESSION_ID_RE` (src/files.ts:47-67) after any refactor of path handling; replacing realpath containment with a lexical check would reopen symlink escape.
4. Watch package.json `scripts` for install-time hooks and `dependencies` for the first runtime dependency, which would end the zero-dependency claim.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
