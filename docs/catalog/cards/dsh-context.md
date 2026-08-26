# Trust Report Card: dsh-context

| | |
|---|---|
| **Grade** | **B** — safe with documented behavior |
| Plugin | dsh-context (github.com/bowenliang123/dsh-context) |
| Pinned subject (git) | `da394d7e0ab67e925e31fb3d91dd8efa5171c720` (default branch HEAD, committed 2026-08-26T03:45:04+08:00) |
| Pinned subject (npm) | `dsh-context@0.32.0`, integrity `sha512-BSRPeg6fncUQPlSNcgRJizu7TikooQmeMCoNeCOaFy1eZdKrG/OnMgfirmCAa4AG0oj5n9zuHUPNRpaeTlZ5Xw==`, tarball sha256 `cc6bc4a276617c5e0f2b6f934e35a2ee55c39525b3d1c0228d8e8f6477a705f5` |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-bridge.scan/v1 v0.1.0, rules digest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1` |
| Methodology | Static scan (tool) + manual source and bundle review + published-tarball analysis. Behavioral probe (pipeline S4) and cross-model adversarial review (S5) have NOT run; see "What we could not check". |

A grade is evidence-backed opinion over the pinned artifacts above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

Clean at runtime: the shipped bundle makes exactly one network call (an hourly npm version check), reads no credentials, contains no dynamic code execution, registers no timers or telemetry, and its high-severity scan findings are dev-only scripts plus four confirmed detector false positives.

## What this plugin can do (capability surface)

| Capability | Present | Evidence |
|---|---|---|
| Network egress | Yes, one endpoint | `GET https://registry.npmjs.org/dsh-context/latest`, lazy, 1h TTL, any failure narrows to null. Shipped bundle `lib/client.js:2317,2323`; source `src/client/latestVersion.ts:8,14-25`. No request body, no other hosts in bundle (grep: all remaining URL literals are github.com/npmjs.org/api-docs.deepseek.com references in comments and metadata). |
| Credential-path reads | None | Grep for `.claude`, `.codex`, `opencode`, `auth.json`, `.ssh`, `.aws`, `process.env` over `src/`, `lib/*.js`: zero hits. Only `scripts/diff-fold.ts:41` reads `DSH_REPO`/`HOME` env vars (dev diff tool, not shipped). |
| Dynamic code execution | None in shipped artifact | Grep for `eval(`, `new Function`, `vm.`, `Function(` over `lib/index.js`, `lib/client.js`: zero hits. Schemastery is a peer dependency (`index.js:3` imports `@deepseek-ai/schemastery`), matching the dsh-ponytail externalization pattern. |
| Child processes | None | No `child_process`, `spawn`, `execSync` in bundle. |
| Timers / beacons | None | No `setInterval`/`setTimeout` in either bundle file; the version check fires only when its card renders. |
| Obfuscation signals | None | No `atob`/`btoa`/`fromCharCode`, no hex-string blobs, sourcemaps n/a (unminified-with-sourcemap-comment style output). |
| Machine fingerprinting | None | No hostname/userInfo/uuid/os access. |
| npm lifecycle hooks | None | `package.json:33-46` declares no preinstall/install/postinstall/prepare. All scripts are opt-in developer commands. |
| Services registered | Read-only projections + UI slots | Host: two session projection units + a settings namespace (`src/host/index.ts:38-42`). Client: locale dict, `conversation.view` slot, `/context` slash command, settings card, CSS injection (`src/client/index.ts:48-97`). Host entry is inject-gated on `sessionProjections` (`src/host/index.ts:27`): without the registry the plugin stays inert. |

Data-flow note (user-visible behavior, not exfiltration): the `contextHeaders` unit stores full system-prompt text and full tool JSON schemas from `request/header` events (`src/host/headers.ts:70-96`, capped at 50 epochs), and surface nodes carry the first text block of conversation messages (`src/host/fold.ts:291-292,326-331`). This content reaches the browser through the harness's standard projection push channel so the dashboard can render it. That is the plugin's stated purpose, but users should understand that prompt and message content becomes visible in the web UI.

The `/context` command dispatches nothing to the host and writes nothing to the session log (`src/client/command.ts:1-12`); it only opens a modal.

## Findings

Raw scan outputs retained at `reference/audits/scan-dsh-context-da394d7.json` (repo) and `reference/audits/scan-dsh-context-pkg-0.32.0.json` (published tarball). Repo scan: 110 files, 30 findings, mechanical grade F (gate `dynamic-exec-present`). Tarball scan: grade D. Adjudication of every non-low finding:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| EXEC-002 | `scripts/bundle-smoke.mjs:58` — `new Function(bundle)()` | high | Dev-only smoke test executing the project's own built bundle inside jsdom. Not shipped: `package.json:25-32` files allowlist ships exactly `lib/client.js`, `lib/index.js`, `lib/index.d.ts`, `cordis.patch.yml`, `README.md`, `LICENSE`; extracted tarball contains exactly those 7 entries. Downgraded to info. |
| EXEC-006 x2 | `scripts/diff-fold.ts:65,66` — dynamic `import(pathToFileURL(join(dir, ...)))` | high | Dev tooling loading local TS modules from a CLI-supplied directory to diff fold output against a DeepSeek Harness checkout. Not shipped. Downgraded to info. |
| EXEC-005 x4 | `src/client/components/browser.tsx:362,364,366,370`; in bundle `lib/client.js:1353,1355,1360,1370` | high | False positive. The code is `RegExp.prototype.exec(...)` (status-marker tail parsing), not code execution. Confirmed identical in shipped bundle. Detector matches the substring `.exec(`. Downgraded to not-present. Corpus-fix candidate for the scanner. |
| NET-001 | `lib/client.js:2323` (`src/client/latestVersion.ts:18`) | high | Real but benign and singular: hourly cached GET of the plugin's own latest version from registry.npmjs.org, result narrowed to a semver string, errors swallowed to null. No data leaves beyond the request itself. Documented in code comments; not documented in README (see residual risks). Counts as declared, purpose-evident egress. |
| NET-007/008 x23 (low) | `package.json:8,10,12`, `.github/workflows/release.yml:30`, `scripts/publish.sh:44,51`, `tests/*`, `src/client/meta.ts:14` | low | Metadata URLs (github.com, registry.npmjs.org) in repo metadata, CI config, and dev/publish scripts. Test-file hits exercise the version-check mock. No action. |

Credential family (CRED): zero findings, verified by grep over sources and both bundle files. CRED+NET compounding rule not triggered.

Publish-chain hygiene: `.github/workflows/release.yml` publishes on `v*` tags via npm trusted publishing (OIDC, `id-token: write`, no long-lived NPM_TOKEN), gated behind lint, typecheck, tests, and a bundle smoke step, and refuses a tag/version mismatch. `pr-checks.yml` runs with `contents: read` only. The published 0.32.0 carries an SLSA provenance attestation and an ECDSA registry signature (checked via `npm view dsh-context@0.32.0 dist.attestations` and `dist.signatures`).

## Strengths

- Zero dynamic code execution in the shipped bundle; heavy dependency (schemastery) correctly left as a peer.
- Exactly one runtime egress endpoint, purpose-evident, cached, fail-silent. No telemetry, no fingerprinting, no delayed beacons.
- No npm lifecycle scripts; tight `files` allowlist; tarball contents match it exactly.
- Reproducible publish chain: OIDC trusted publishing, SLSA provenance, tag/version verification, tests before publish.
- Defensive engineering: strict zod config validation (`src/host/config.ts`), bounded retention on all projection state, untrusted-log re-validation in pricing (`src/host/pricing.ts:34-35`), error boundary in the client tree.
- Substantial test suite (~40 spec files covering host fold, retention, client components, i18n) plus a bundle-level smoke test that exercises the real shipped artifacts.
- Apache-2.0 license.

## Residual risks

1. The npm version-check call is not mentioned in the README. Trivially fixable; blocks an A-grade under the "documented allowlist" condition until documented.
2. Dashboard content exposure: system prompts, tool schemas, and message first-lines become viewable in the web UI by design. Acceptable for a context dashboard; worth a privacy note in the README.
3. Peer dependencies (`@deepseek-ai/*` rc range, `zod ^4.4.3`) resolve on the user's machine at install time and are outside this card's scope.
4. This card rests on static analysis and manual review only. The sandboxed behavioral probe (S4), dual adversarial LLM review (S5), and signed verdict (S8) have not run because those pipeline stages are not yet operational. Under pipeline §S6 semantics this card is provisional; a full-pipeline re-run could lower, not raise, this grade.
5. The git pin is a moving default branch; only the pinned commit and the pinned npm version are covered. Re-vet before recommending any newer version.
6. Scanner quality gap: the `dynamic-eval` rule flags `RegExp.exec`, which will produce recurring false positives on regex-heavy plugins.

## Verify this yourself

```bash
# Pin and inspect the same artifacts
git clone --depth 1 https://github.com/bowenliang123/dsh-context && cd dsh-context && git rev-parse HEAD   # da394d7e0ab67e925e31fb3d91dd8efa5171c720 at audit time
npm view dsh-context@0.32.0 dist.integrity                                                                 # sha512-BSRPeg6...
npm pack dsh-context@0.32.0 && tar tzf *.tgz                                                               # 7 files, matches package.json files allowlist
tar xzf *.tgz

# The single egress site in the shipped bundle
grep -n "fetch(" package/lib/*.js                                                                          # only client.js:2323 -> registry.npmjs.org/dsh-context/latest

# No dynamic execution, credentials, processes, or timers in shipped code
grep -n -E "eval\(|new Function|vm\.|child_process|process\.env|setInterval|\.ssh|\.aws|atob" package/lib/*.js   # expect: no hits (the 4 .exec( lines are RegExp.exec)

# Re-run the static scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js <extracted-package-dir>
```

## Methodology and pinned inputs

- Charter: `CHARTER.md` (every claim cites file:line; trust over speed). Pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge.scan/v1 v0.1.0, rules digest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`, run twice (repo checkout and extracted npm tarball).
- Manual review covered: package.json and scripts, both CI workflows, host entry/config/settings/timeline/fold/headers/pricing, client entry/command/services/modal wiring, shared token-pricing math, and greps over both shipped bundles for EXEC/NET/CRED/OBFU/PRIV families.
- Raw scan JSONs retained next to the clone under `reference/audits/`.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `da394d7` + npm 0.32.0 | B | Initial card. Static + manual methodology; probe/review/signing pending pipeline availability. |
