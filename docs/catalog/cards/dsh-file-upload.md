# Trust Report Card: dsh-file-upload

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-file-upload` (DSH plugin: composer file upload surface, document-to-Markdown conversion, `read_document` tool) |
| Pinned subject | github:HongMing-Huang/dsh-file-upload @ commit `ce4ca943da592be36a784a5648d36a600aeda136` (default branch `main`, shallow clone head at audit time) |
| npm integrity | not checked (no published-artifact comparison performed; see section 5) |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A carefully written upload and document-conversion plugin whose egress is limited to a vision
endpoint the user configures (or a local Ollama probe, or `api.openai.com` when a key exists), with
one real defect: the DELETE handler's storage-scope check is a raw prefix comparison that a
`..` segment defeats, and the file's own header comment claims same-origin checks the code does not
implement.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Local Ollama probe `http://localhost:11434/v1/models` (src/vision.ts:44); the vision request goes to `visionEndpoint` when configured, else the discovered Ollama endpoint, else `https://api.openai.com/v1/chat/completions` (src/vision.ts:70, 102). Nothing else. | file:line |
| What leaves the machine | Uploaded image bytes, base64-inlined, plus a fixed Chinese description prompt, and only when the session's routed model is text-only (`imageMode === 'ocr'`, src/upload.ts:195-204). Documents are never sent anywhere; conversion is local. | src/upload.ts, src/convert.ts |
| Child processes | `execFile('markitdown', ['--help'])` PATH probe (src/index.ts:117) and the MarkItDown CLI when present (src/convert.ts:18, 54). No shell, no user-controlled binary. | file:line |
| Credential reads | One value: `visionApiKeyEnv` (default `OPENAI_API_KEY`) via the DSH credentials seam, falling back to `process.env` (src/index.ts:186-193). No auth.json, no keychain, no `.ssh`/`.aws`. | src/index.ts |
| HTTP surface | Prefix route `/api/upload`, POST and DELETE, rejected unless `Host` matches loopback (src/upload.ts:66, 297-302). | src/upload.ts |
| Filesystem writes | `<session cwd>/.dsh-uploads/<sessionId>/<sha256-prefix>-<name>`, or `uploadDir` when no sessions service exists (src/upload.ts:110-116, 174). A TTL sweeper removes aged session directories (src/upload.ts:271-317). | file:line |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*` in src/. pdfjs is loaded with `isEvalSupported: false` (src/convert.ts:85). | grep + read |
| Telemetry | None found in src/ or test/. | negative claim, scope stated |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 29 findings (23 high, 2 medium, 4 low), machine grade F.

### Findings kept after adjudication

| ID | Severity | Location | Note |
|---|---|---|---|
| FUP-FS-1 | medium | src/upload.ts:250 | `filePath.startsWith(storage.dir)` is a string prefix test with no normalization. `x-file-path: <storage.dir>/../../../<path>` satisfies it, so DELETE removes files outside the session upload directory. Exploitation needs a request bearing the custom `x-file-path` header (browser preflight applies) reaching the loopback port, so the practical caller is a local process or the DSH UI itself, not an arbitrary web page. Fix is `path.resolve` plus a separator-terminated containment check. |
| FUP-DOC-1 | low | src/upload.ts:2 vs 297-302 | The header comment states "loopback-only host, same-origin and same-site checks"; only the `Host` regex exists. No `Origin` or `Sec-Fetch-Site` check anywhere in src/ (grep). Claim exceeds implementation. |
| FUP-NET-1 | medium | src/vision.ts:70 | When no endpoint is configured, no Ollama is found, and a key resolves, images go to `api.openai.com` by default. Documented in the file's own doc comment and README, but it is a silent third-party destination chosen by fallback. |
| FUP-NET-2 | low | src/vision.ts:44 | Unconditional localhost probe on every auto-mode description. Loopback only. |
| FUP-EXEC-1 | low | src/index.ts:117, src/convert.ts:54 | Bare `markitdown` name resolved through PATH; a hostile PATH entry would be executed. Standard tool-discovery risk, arguments are fixed. |
| FUP-HOOK-1 | low | package.json:86 | `prepublishOnly` only; no install/postinstall hooks (grep of package.json scripts). |

### Scanner noise dismissed (with scope)

- All 12 EXEC/NET hits in `test/` (`test/integration.test.ts`, `test/upload-handler.test.ts`): local `http.createServer` fixtures and `textutil`/`pandoc` conversion fixtures, never shipped (`files` field ships `lib` only, package.json:26-33).
- NET on `src/upload.ts:16`: a type-only import of `node:http`.
- NET on package.json repository/homepage/bugs URLs: manifest metadata.
- OBFU on `src/upload.ts:157`: `decodeURIComponent` of the `x-file-name` header, immediately sanitized by `sanitizeFileName` (upload.ts:73-78).
- SUPPLY on package.json:41: the `repository` field, not a dependency spec. All four runtime dependencies are semver ranges from npm.

### Negative claims and what was searched

Read in full: src/index.ts, src/upload.ts, src/vision.ts, src/tool.ts, src/convert.ts (first 120 lines plus grep of the remainder), src/detect.ts headers, package.json, cordis.patch.yml, SECURITY.md. Grepped all of src/ for `eval`, `new Function`, `vm.`, `origin`, `child_process`, credential paths. No obfuscation, no telemetry, no writes outside the upload roots, no reading of unrelated credential stores.

## 5. What we could not check

- **Published artifact vs source.** Only the git tree was graded. `lib/` is built by `build.mjs` at publish time; we did not rebuild and byte-compare, and no npm integrity hash or provenance attestation was fetched.
- **Behavioral probe.** No sandboxed load, upload, or conversion run was performed. The DELETE traversal finding is a code reading, not a demonstrated exploit.
- **Dependencies.** `markitdown-node`, `pdfjs-dist`, `mammoth`, `read-excel-file` were not audited, and no OSV snapshot was joined. PDF and DOCX parsers are a meaningful attack surface reached with attacker-supplied bytes.
- **The client half.** `src/client/index.tsx` (583 lines) was read only around its two `fetch('/api/upload')` calls (lines 156, 424); its rendering path was not fully reviewed.
- **The MarkItDown CLI**, when present on a user's machine, is third-party code outside this artifact.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on test-file density; the manual verdict is B. Both positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/HongMing-Huang/dsh-file-upload /tmp/dsh-file-upload-audit
cd /tmp/dsh-file-upload-audit && git rev-parse HEAD   # expect ce4ca943da592be36a784a5648d36a600aeda136

node tools/scan/dist/index.js /tmp/dsh-file-upload-audit   # from a dsh-bridge checkout

sed -n '248,252p' src/upload.ts        # DELETE prefix check (FUP-FS-1)
sed -n '295,303p' src/upload.ts        # loopback Host gate, no Origin check
grep -rn "origin\|sec-fetch" -i src/   # expect only the comment on line 2
grep -rn "eval(\|new Function\|vm\." src/   # expect none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" src/*.ts | sort -u
```

## 8. Methodology and pinned inputs

- Subject: commit `ce4ca943da592be36a784a5648d36a600aeda136`, clone at `reference/audits/dsh-file-upload`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Review: full read of the host-side sources listed in section 4; targeted grep of the client and tests.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
- Grade derivation: no critical or high production finding after adjudication; one medium filesystem defect (FUP-FS-1) reachable only by a local caller, one medium default egress destination that is documented. That places it below A and above C: **B**.

## 9. Strengths

1. Upload input is treated as hostile: control characters, path separators, dot segments and leading dots stripped; name length capped; session ids constrained to a safe alphabet (src/upload.ts:70-88).
2. Content is sniffed rather than trusted by extension, with size caps, concurrency limits, sha256 dedup and a TTL sweeper (src/upload.ts:120-190, 271-317).
3. Reads go through `ctx.fs`, inheriting the host's sandbox and workspace policy rather than reimplementing it (src/tool.ts:174).
4. pdfjs is configured with `isEvalSupported: false` and no worker (src/convert.ts:82-88).
5. A real SECURITY.md with a stated scope, plus a test suite covering the upload handler's rejection paths.

## 10. Residual risks

1. FUP-FS-1: any local process able to reach the loopback port with a custom header can delete arbitrary files the DSH user can write.
2. Auto-mode vision can send images to `api.openai.com` when the user only ever set an API key, without a per-image consent step.
3. Document parsing runs attacker-supplied bytes through four third-party parsers in-process.
4. `markitdown` is resolved by PATH lookup.
5. Published `lib/` build is unverified against this source.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD; treat any new literal URL or credential path as a new finding.
2. Confirm FUP-FS-1 status: the check at src/upload.ts:250 must become a normalized containment test before this card's B carries into a version claiming it fixed.
3. Watch package.json `scripts` for any install-time hook and the dependency list for git-spec or newly added parsers.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is in section 8.
