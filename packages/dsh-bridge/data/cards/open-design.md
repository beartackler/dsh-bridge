# Trust Report Card: open-design

| | |
|---|---|
| **Grade** | **C** — use with awareness |
| Plugin | open-design (github.com/nexu-io/open-design) |
| Pinned subject (git) | `2642b50a8ac5eeeb95fa91fd9168ae9b75345e97` (default branch `main` HEAD, pushed 2026-08-26T04:36:55Z at audit time) |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-scan 0.1.0, rules digest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999` |
| Methodology | Static scan (tool) + manual source review of the DSH-facing surfaces and the highest-density finding hotspots. Behavioral probe (S4) and cross-model adversarial review (S5) have NOT run; see "What we could not check". |

A grade is evidence-backed opinion over the pinned artifacts above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

No hostile behavior found in the DSH-relevant surface: the `@open-design/dsh-runtime` plugin is a stdio JSONL adapter with no egress and no dynamic execution of remote code, but this is a full desktop product whose installer runs builds at install time, ships opt-out product telemetry, and auto-updates its desktop app, so it is capped at C.

## What this plugin can do (capability surface)

This repository is a monorepo desktop application (Electron + daemon + web + landing page), not a small plugin package. Its DeepSeek Harness surface is one workspace package:

| Capability | Present | Evidence |
|---|---|---|
| Network egress (DSH runtime pkg) | None | `packages/dsh-runtime/src/index.ts` (485 lines) and `src/startup.ts`, `src/protocol.ts`, `src/invariant.ts`: no `fetch`/http/net imports; the adapter speaks newline-delimited JSON over stdio only (`writeFrame` at `src/index.ts:60`). The parent app's daemon does reach many hosts (model providers plus `github.com`, `unpkg.com`, `open-design.ai`), enumerated below. |
| Credential-path reads | None; credential paths appear only as deny-lists | `.ssh/.aws/.gnupg/.kube/.docker` strings occur as *rejection* logic: project roots may not bind into credential dirs (`apps/daemon/src/import-export-routes.ts:75-84`) and member mirrors skip them (`apps/daemon/src/collab/vela-cli-resource-adapter.ts:67-77`). S3 storage reads AWS env vars only when the user opts into S3 mode (`apps/daemon/src/storage/project-storage.ts:407-424`). CI workflows reference `secrets.*` and a deploy key path (`.github/scripts/provision-agent-pr-explore-runner.sh:50`) — repo-side CI material, not user-machine code. |
| Dynamic code execution | One launcher-style dynamic import | `apps/daemon/bin/od.mjs:16` imports the locally built `../dist/cli.js` after an existence check — standard CLI bootstrap, local files only. Remaining EXEC findings are child_process imports with array argv in CI/dev scripts (`.github/scripts/*`) and test helpers. No `eval`, no `new Function` outside `e2e/lib/vitest/packaged-app-shell.ts:68,198` (test harness). |
| Child processes | Yes, by design (agent host) | Daemon spawns agent runtimes and git/aws CLIs with argument arrays (`.github/scripts/r2.ts:112`, landing-page scripts); no shell-string interpolation found in the reviewed production paths. |
| npm lifecycle hooks | Yes, heavy build at install time | Root `package.json:13` runs `scripts/postinstall.mjs`, which builds ~20 workspace packages, gunzips a vendored browser bundle to disk (`scripts/postinstall.mjs:50-64`), and may rebuild better-sqlite3 via pnpm (`scripts/postinstall.mjs:251-266`). All work is local; nothing is fetched. Still pre-consent execution on `pnpm install`. |
| Timers / beacons | Product telemetry exists, opt-out | `PRIVACY.md` declares product analytics + quality traces "on by default" with a first-run consent banner and Settings -> Privacy opt-out, plus an always-on crash channel when a telemetry destination is configured. Telemetry environment resolution: `apps/daemon/src/telemetry-environment.ts:1-12`. |
| Obfuscation signals | False positives | The scanner's largest OBFU cluster (about 4200 findings) is Persian/Farsi i18n text containing zero-width joiner characters (`apps/web/src/i18n/content.fa.ts`, `locales/fa.ts` — sample excerpt is a lone U+200C). Real text, not hidden code. |
| Machine fingerprinting | None found in reviewed surface | No hostname/userInfo/uuid harvesting located in daemon or dsh-runtime sources reviewed. |
| Services registered | One DSH profile composition | `packages/dsh-runtime/cordis.patch.yml` disables HMR, sets a persona system prompt, and inserts two services (`@open-design/dsh-runtime/startup`, `@open-design/dsh-runtime`) exposing `--models/--probe/--stdio` modes over JSONL (`src/startup.ts:20-38`). |

Desktop-app notes (outside the plugin surface but user-visible): the Electron desktop app auto-updates (`apps/desktop/src/main/updater.ts`, `updater/scheduler.ts`; signature verification not confirmed in review) and the daemon's external-host list includes model APIs (api.openai.com, generativelanguage.googleapis.com, api.anthropic.com, openrouter.ai, aihubmix.com, x.ai, ollama.com), GitHub, unpkg, and first-party endpoints (open-design.ai, amr-api.open-design.ai).

## Findings

Raw scan output retained at `reference/audits/scan-open-design.json`. Mechanical result: grade F, 21,973 findings (86 critical, 15,999 high, 1,159 medium, 4,729 low) over 5,863 scanned files; gates `cred-plus-net`, `dynamic-exec-present`, `finding-density`. Adjudication:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| CRED criticals x63 | Mostly tests + deny-lists | critical | 53 are test fixtures asserting secrets are NOT leaked (e.g. `apps/daemon/tests/acp.test.ts:1118-1131` asserts `id_rsa` is absent from serialized data). Production hits are guard code (`import-export-routes.ts:75`, `vela-cli-resource-adapter.ts:67-77`, `moveToTrash`-style blocklists) or opt-in config reads (`project-storage.ts:407-424`, AWS env only when `OD_PROJECT_STORAGE=s3`). Downgraded to info/not-present. The mechanical F cap comes from co-occurrence in shared modules, which the corpus counts without intent analysis. |
| NET criticals x17 | SSRF test suites | critical | All are negative-path tests asserting cloud-metadata URLs are refused (`apps/daemon/tests/aihubmix-asset-ssrf.test.ts:33`, `brand-safe-fetch.test.ts:13`). These are security tests, not egress. Downgraded to not-present; the presence of these suites is a strength. |
| EXEC-001 | `apps/daemon/bin/od.mjs:16` | high (critical rule family) | Dynamic import of a locally built dist file with existence guard. Launcher pattern, not remote-code loading. Downgraded to low. |
| EXEC dev/CI cluster (~190 prod) | `.github/scripts/*.ts`, landing-page scripts | high | Array-argv child_process calls in CI automation that never executes on a user machine from the plugin. Reviewed samples show no interpolation. Downgraded to info for the installed-artifact question. |
| OBFU x~4500 | Persian i18n files, `litellm-models.json`, SVG icon data | high | Zero-width characters inside natural-language strings; URL-shaped model metadata with `_source` attribution fields (`apps/web/src/state/litellm-models.json:2-4`). Data files, not code. Downgraded to not-present. |
| NET volume (19k+ across tree) | Marketplace registry, provider lists, docs | high/low | `plugins/registry/official/open-design-marketplace.json` (688 entries) and provider catalogs are static URL metadata consumed by the app's own features; each is a declared destination of a listed feature, not covert egress. |
| HOOK-001 | `package.json:13` postinstall | high | Real finding: build work runs at install time before any consent (see capability table). Local-only content; kept as a documented medium-severity residual risk. |

Credential+egress compounding was not observed anywhere in production code: every credential-path hit is a refusal list or opt-in config, not a read-and-send pair.

## Strengths

- The actual Harness integration (`packages/dsh-runtime`) is small, auditable, and inert without explicit `--stdio/--models/--probe` invocation; zero network capability in the package.
- Extensive SSRF negative-test suites (metadata IPs, loopback, redirect traps) show deliberate egress hardening in the asset-fetch feature area.
- Credential-directory handling is defensive by default: project roots and mirrors actively refuse `~/.ssh`, `~/.aws`, etc.
- PRIVACY.md states defaults plainly (opt-out analytics, always-on crash channel in configured builds) instead of hiding them.
- Apache-2.0 license; large test surface; CI drift-check tooling pins the upstream DSH version line deliberately (`.github/scripts/dsh-upstream-drift.ts:1-33`).

## Residual risks

1. Install-time execution: `pnpm install` triggers a multi-package build and possible native rebuild (`scripts/postinstall.mjs`). Nothing is fetched remotely, but code runs before consent.
2. Opt-out telemetry in the shipped app; users who never see the first-run banner are opted in until they toggle it off.
3. Desktop auto-update channel was not verified for signature checking in this pass.
4. Monorepo scale: 21,973 raw findings mean full-file coverage was sampling-plus-hotspot review, not exhaustive reading. Hostile code could hide in unreviewed corners of `apps/web` or `design-templates`.
5. No published npm artifact for the DSH runtime package (checked `npm view @open-design/dsh-runtime` = 404), so there is no tarball-vs-source correspondence check; consumers run whatever the app bundles.
6. Static + manual methodology only; probe (S4) and dual adversarial review (S5) have not run, which caps this card at C regardless of findings.

## Verify this yourself

```bash
# Pin and inspect the same artifacts
git clone --depth 1 https://github.com/nexu-io/open-design && cd open-design
git rev-parse HEAD   # expect 2642b50a8ac5eeeb95fa91fd9168ae9b75345e97

# The whole plugin surface: no fetch/http/net in the DSH runtime package
grep -rn -E "fetch\(|node:http|node:https|node:net" packages/dsh-runtime/src   # expect: no hits

# Profile patch: two service inserts, HMR disabled
cat packages/dsh-runtime/cordis.patch.yml

# Credential strings are refusals, not reads
sed -n '70,85p' apps/daemon/src/import-export-routes.ts
sed -n '55,80p' apps/daemon/src/collab/vela-cli-resource-adapter.ts

# Install hook content (builds local packages, gunzips vendored bundle)
sed -n '1,70p' scripts/postinstall.mjs

# Re-run the static scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js <path-to-open-design> --json /tmp/od-scan.json
```

## Methodology and pinned inputs

- Charter: `CHARTER.md` (every claim cites file:line). Pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge tools/scan 0.1.0, digest `9cc04224...baaee999`, run once over the shallow clone at `reference/audits/open-design`.
- Manual review covered: `packages/dsh-runtime/**` (full), root `package.json` + `scripts/postinstall.mjs` (full), credential-touching daemon modules cited above, telemetry environment + PRIVACY.md, representative CI scripts flagged by the scan, hotspot diagnosis of the OBFU/NET bulk (i18n and registry data files), and GitHub API/npm registry existence checks.
- Cross-model adversarial review: NOT performed (single reviewer). Card revision 1 capped accordingly.
- Raw scan JSON retained next to the clone under `reference/audits/`.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `2642b50` | C | Initial card. Static + manual methodology; probe/review/signing pending pipeline availability. |
