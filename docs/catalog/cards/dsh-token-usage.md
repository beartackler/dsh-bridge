# Trust Report Card: dsh-token-usage

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-token-usage` (DSH plugin: persistent token usage records, dashboard, budget, and optional model-written usage/trajectory analysis) |
| Pinned subject | github:LeemanCheung/dsh-token-usage @ commit `462679bd51d5776bfced4921a1c584e0e89b2273` (default branch head; latest push to the repo 2026-08-27) |
| npm integrity | Not applicable. `package.json:4` sets `"private": true`; the package is not published to npm. Install is from the git repo. |
| Provenance | None. No `.github/` directory at the pinned commit: no CI, no release workflow, no attestation. `lib/` (built output plus a sourcemap) is committed directly to the repo. |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0, rulesDigest `d7d5d9eb...41f3`, plus manual read of src/index.ts, src/rpc.ts, src/usage-analysis.ts, src/trajectory-analysis.ts, src/client/report-safety.ts, src/client/export.ts, and sink greps across all of src/) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local analytics plugin with no outbound network calls of its own: it aggregates token counts
through the host's session-projection services, and its one data-leaving path is an explicitly
user-invoked analysis that sends a metadata-only, aliased, character-budgeted evidence string to a
model route the user already configured in DSH.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | No `fetch`, `XMLHttpRequest`, `WebSocket`, or beacon anywhere in src/. The only remote URL in shipped code is a documentation link rendered in the pricing UI. | grep across src/; src/pricing.ts:12; lib/client.js:175 |
| Data sent to a model | On explicit user action, `analyzeTokenUsage` / `analyzeTrajectory` call `ctx.llm` with a constructed user message. Content is aggregates and lifecycle metadata only: route ids are replaced with report-local aliases `route-N` (src/trajectory-analysis.ts modelEvidence; src/usage-analysis.ts:60-69), event types are filtered through a `SAFE_EVENT_TYPES` allowlist (src/trajectory-analysis.ts:111-116), outcomes are collapsed to a `SAFE_OUTCOMES` allowlist (src/trajectory-analysis.ts:117-126), tool arguments and results are dropped (src/trajectory-analysis.ts:139), and the whole evidence string is capped and truncated (`MAX_TRAJECTORY_CHARS`, boundedTimeline at src/trajectory-analysis.ts:600-627; `MAX_ANALYSIS_TOKENS = 2_600`, `MAX_MODEL_ROWS = 48`, `MAX_DAILY_ROWS = 366` at src/usage-analysis.ts:20-22). | file:line above |
| Host services used | `sessionProjections`, `sessionProjectionCache`, `sessionQuery`, `sessions`; auxiliary plugin injects `settings` and `connection`. | src/index.ts:32-44 |
| Local RPC | A private channel `/token-usage` with six endpoints (budget read/write, analysis models, analysis progress, usage analyze, trajectory analyze) over the host's own client connection. | src/rpc.ts:1-12; src/index.ts:39-44 |
| Input validation | Every wire value is re-validated host-side: bounded strings, `Number.isSafeInteger` non-negative counts, a strict `^\d{4}-\d{2}-\d{2}$` date regex, plain-record checks. | src/index.ts:52-120 |
| Filesystem access | None directly. Export writes go through a browser `Blob` and `URL.createObjectURL`, so the file lands via the browser's own download flow. | src/client/export.ts:235; no `node:fs` import in src/ |
| Credential access | None. No env reads, no auth-file paths, no keychain access. | grep across src/ returned zero hits |
| Dynamic code execution | None. No eval, `new Function`, `vm`, or dynamic `import()`. | grep across src/ |
| Telemetry | None. No analytics or beacon code. | negative claim, scope stated |
| Lifecycle hooks | None. `scripts` contains build, typecheck, and test only; no install/postinstall/prepare. | package.json scripts block |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 14 findings (0 critical, 11 high, 3 low), machine grade F. All adjudicated below. No
finding survives as more than low severity.

### Scanner criticals adjudicated

None reported.

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| TU-NET-1 | low | src/pricing.ts:12, lib/client.js:175 | `PUBLIC_PRICE_CATALOG_URL = 'https://developers.openai.com/api/docs/pricing'`. Rendered as an anchor so the user can check the rate source; never fetched. The corresponding test asserts it is an `href` on a link element (tests/component.client.spec.tsx:432). |
| TU-LLM-1 | medium | src/usage-analysis.ts, src/trajectory-analysis.ts | The analysis features send session-derived metadata to a model. This is the plugin's advertised function and is user-initiated, but it is the one path where local data leaves the machine; where it goes depends entirely on which DSH route the user picks. |
| TU-SUPPLY-1 | low | package.json repository/bugs/homepage | Metadata URLs only. |

### Scanner noise dismissed (with scope)

- 8 NET highs in tests/analysis-report.client.spec.ts:14-32: every one is a
  `https://tracker.invalid/...` fixture in the test that asserts `safeModelMarkdown` neutralizes
  model-supplied images and raw HTML. These strings exist to prove the defense works.
- 1 NET high in tests/component.client.spec.tsx:432: assertion on the pricing link `href`.
- 3 NET lows on package.json metadata.

### Negative claims and what was searched

Searched all of src/ (host and client), tests/, tsdown.config.ts, vitest.config.ts,
cordis.patch.yml, package.json: no network API of any kind in shipped code; no `node:fs`,
`node:child_process`, or `node:os` imports; no `process.env` reads; no eval family; no credential
paths; no telemetry; no lifecycle hooks; no obfuscation (TypeScript source, unminified, commented).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review
  covers the same surfaces but cannot confirm what the analysis prompt looks like on real session
  data.
- **Published-artifact comparison.** The package is `private: true`, so there is no registry artifact
  to compare. However `lib/index.js` and `lib/client.js` are committed build outputs and we did NOT
  rebuild from `src/` and byte-compare. A consumer installing from git executes `lib/`, not `src/`,
  so the audited source and the executed code are not proven identical. This is the single largest
  gap in this card.
- **The redaction claim end to end.** We read the allowlists and the aliasing helpers and traced the
  main paths, but we did not run the analysis against a session containing sensitive strings to
  confirm nothing slips through the timeline builder (734 lines).
- **The client React components** (`TrajectoryAnalysisAction.tsx`, `TokenUsageSection`,
  `SafeMarkdownReport.tsx`) were grepped for sinks and `report-safety.ts` was read in full, but the
  rendering path was not read line by line.
- **Screenshots** in `assets/` were not inspected.
- **Chinese-language UI strings** in `src/client/locales.ts` were not read in full.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F entirely on test fixtures and a documentation link; the
manual verdict is B. Both positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/LeemanCheung/dsh-token-usage /tmp/tu-audit
cd /tmp/tu-audit && git rev-parse HEAD   # expect 462679bd51d5776bfced4921a1c584e0e89b2273

grep -rn "fetch(\|XMLHttpRequest\|sendBeacon" src        # egress: none
grep -rn "node:fs\|child_process\|process.env" src       # host APIs / env: none
grep -rn "eval(\|new Function" src                       # dynamic exec: none
sed -n '111,126p' src/trajectory-analysis.ts             # the event-type and outcome allowlists
cat src/client/report-safety.ts                          # model-output markdown neutralization
npm run test                                             # the repo's own suite (21 spec files)
```

## 8. Methodology and pinned inputs

- Subject: git commit `462679bd51d5776bfced4921a1c584e0e89b2273` (shallow clone at
  reference/audits/dsh-token-usage).
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`; 52 files scanned, 617653 bytes.
- Review: full read of src/rpc.ts, src/client/report-safety.ts, src/index.ts wire-validation block
  (lines 1-120); targeted read of src/usage-analysis.ts bounds and aliasing (lines 1-80),
  src/trajectory-analysis.ts allowlists, prompt construction, and truncation (lines 100-140,
  580-722); sink-grep across all of src/ and tests/ with each hit read in place.
- Cross-model review: NOT performed. Card revision 1 is capped accordingly.
- Grade derivation: no egress, no credentials, no filesystem, no child processes, no dynamic
  execution, no lifecycle hooks. B rather than A because the plugin's core feature does send
  session-derived data to a model, and because committed `lib/` build output was not reproduced from
  `src/` (section 5).

## 9. Strengths

1. Data minimization is designed in, not bolted on: route ids aliased to `route-N`, event types and
   outcomes passed through explicit allowlists, tool arguments and results dropped, evidence
   character-budgeted with head/tail truncation markers.
2. The analysis prompt instructs the model to treat every evidence row as untrusted data rather than
   instructions, and forbids inferring prompt content, identity, intent, or policy violations
   (src/trajectory-analysis.ts:669).
3. Model output is neutralized before rendering: markdown images are downgraded to links, residual
   `![` markers are entity-encoded, and `<` before a tag-like character is escaped
   (src/client/report-safety.ts:1-12). A dedicated test suite drives this with tracker-pixel
   fixtures.
4. The host refuses tool calls in the analysis response and requires text-only output
   (src/trajectory-analysis.ts:716).
5. Strict host-side revalidation of every client-supplied wire value, including a date regex and safe
   integer checks (src/index.ts:52-120).
6. Substantial test suite: 21 spec files covering analysis, projection, pricing, export, budget, and
   client rendering.

## 10. Residual risks

1. Committed `lib/` is what actually runs and was not rebuilt from `src/`. Treat the source audit as
   authoritative only after reproducing the build.
2. The analysis feature sends metadata to whichever model route the user selects. If that route is a
   remote provider, session shape (timing, tool names, token volumes) leaves the machine even though
   content does not.
3. Tool names are kept in the timeline (bounded, but not aliased); tool names can themselves be
   revealing in a bespoke setup.
4. No CI and no release process: every update must be re-read by hand.
5. Broad peer-dependency surface (about twenty `@deepseek-ai` rc packages); semantics under this
   plugin can shift with host updates.

## 11. Re-verify steps

1. Re-run the section 7 block against the current HEAD. Any first network call, any `node:` builtin
   import, or any new `scripts` entry must be re-adjudicated.
2. Rebuild `lib/` with `npm run build` at the pinned commit and diff against the committed `lib/`.
   A mismatch is a finding and should block this grade.
3. Re-read `SAFE_EVENT_TYPES`, `SAFE_OUTCOMES`, and the timeline builder on any bump: widening what
   reaches the model is the change most likely to move this grade.
4. Confirm `safeModelMarkdown` still runs on every model-authored string before render.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
