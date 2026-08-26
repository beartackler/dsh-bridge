# Trust Report Card: token-monitor (`Token Monitor`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `token-monitor` v0.48.0 - an Electron desktop widget that reads local session logs from 32+ AI coding tools (Claude Code, Codex, OpenCode, Hermes, DeepSeek Harness, Cursor, Copilot, and more), aggregates token usage and cost, polls provider limit endpoints with your existing credentials, and offers optional multi-device sync through a hub you operate. |
| Pinned subject | github:Javis603/token-monitor @ commit `3e80f82b19c41c2ed452c0794025337fc31752d2` (default branch head at audit time) |
| Stars | ~1,700 (discovery sweep 2026-08-26) |
| npm integrity | Not published as an installable npm package; distributed via GitHub Releases installers. The runtime's `tokscale` parser binary comes from pinned npm optional dependencies plus a SHA-verified vendor override path (see section 4). |
| License | MIT, LICENSE present at repo root. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of the credential collectors, sync hub, updater, and vendored-binary pipeline) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A transparent, well-documented local reader of your AI-tool logs whose credential handling is
broader than most plugins will ever be - it reads OAuth tokens for Claude, Codex, Copilot, Grok,
and a dozen more providers from files, env vars, and OS keychains to poll usage endpoints - but
every observed flow sends those credentials only to the provider that issued them, nothing is
sent anywhere else without you configuring a destination.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Local log reads | Parses `~/.claude/projects/`, `~/.codex/sessions/`, OpenCode storage, and DSH zstd transcripts under `$DSH_HOME` or `~/.dsh` to compute usage locally. | README.md supported-tools table; src/shared/dshPaths.js:4-12 |
| Claude credential access | Reads `CLAUDE_CODE_OAUTH_TOKEN` env var, ranked candidate files, the Windows Credential Manager ("Claude Code-credentials"), and on macOS runs `security find-generic-password` against "Claude Code-credentials". Extracts accessToken + refreshToken. | src/shared/limitCollector.js:413-467 (env :415, wincred :443-456, keychain :458-467) |
| Codex auth read/write | Reads `~/.codex/auth.json`, and an explicit user-invoked account switch writes a chosen account's material back to the live auth.json atomically with 0600 perms over IPC `codex:switchSystemAccount`. | src/shared/codexSystemSwitch.js:9-11, 47-66; src/electron/main.js:7581 |
| Provider polling | Sends Bearer tokens only to their issuing providers: api.anthropic.com usage/profile (:74-75), api.github.com for Copilot, grok.com, cursor.com, kimi.com, open.bigmodel.cn, volces.com, qoder.com.cn, commandcode.ai, minimax, x.ai, openrouter.ai, status pages for service health, jsdelivr/pages.dev for FX rates. | src/shared/limitCollector.js:905-913; src/shared/copilotLimits.js:48,280; src/electron/serviceStatus.js:12-30; src/shared/exchangeRates.js:6-7 |
| Multi-device sync | Optional hub (embedded in-app, self-hosted Node, or Cloudflare Worker) receives aggregated totals, hashed identifiers, plan labels, and workspace-folder labels - explicitly never raw prompts, tokens, cookies, API keys, or absolute paths. No default destination exists. | src/hub/server.js:19-33 (loopback fail-closed bind); docs/privacy.md "Multi-device sync" |
| Updater + binary supply | Packaged builds check GitHub Releases; auto-download and auto-install are both off. A vendor script can swap in a pinned fork build of the `tokscale` binary after verifying its SHA-256, gated behind an explicit manifest mode; current mode is "upstream", meaning no replacement occurs and npm-installed tokscale is authoritative. | src/shared/appUpdater.js:3-7; src/electron/main.js:5318-5319; scripts/ensure-vendored-tokscale.js:23-56, 120-124; scripts/vendor/tokscale.json:2-12 |
| Telemetry / Discord | No analytics found anywhere in src/. Discord Rich Presence sends only the activity label you enable, to Discord itself. | grep negative across src/; docs/privacy.md "Network features"; src/electron/discordRpc.js:1-20 |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**2455 findings** (2 critical, 1006 high, 313 medium, 1134 low) across 531 scanned files. Machine
verdict **F**, off three gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Where the volume is

Of the 1006 highs, roughly 343 sit in tests, 64 in lockfiles, and the rest split between
provider-polling modules (src/shared/*Limits.js, limitCollector.js) and renderer fetch wrappers.
The 258 CRED mediums are all one family: reading provider-named env vars. Adjudication covers
the criticals and every gate.

### Criticals and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED critical x2, Windows Credential Manager touch in src/shared/limitCollector.js:449-450 | Reading the credential that Claude Code itself stores, used solely as a Bearer token toward api.anthropic.com usage/profile endpoints. The strings at :449-450 build a display label, not an exfil channel. Destination is pinned by constant, not constructed from input. | limitCollector.js:443-456 (read), :74-75 (destination), :905-913 (use) |
| `cred-plus-net` gate | The gate's premise - credentials and network in the same module - is literally the product's function: poll each provider's usage endpoint with that provider's own token. Every call site pairs a credential with its issuing origin; no cross-provider forwarding exists, and the hub sync payload excludes credentials by construction. | limitCollector.js per above; docs/privacy.md sync exclusions; docs/API.md wire format |
| `dynamic-exec-present` gate | No eval, new Function, vm, or dynamic import of non-literal specifiers exists in shipped runtime code; scanner EXEC volume traces to child-process use for platform probes (`reg query` for theme, keychain reads) and test suites. Grep negative otherwise. | src/electron/main.js:4539 (reg query); grep negative for eval/new Function/vm in src/ |
| `finding-density` gate | 531 files spanning 32 provider integrations plus a full test suite; density reflects breadth, not concealment. Each *Limits.js module follows the same readable pattern of constant URL + header assembly. | counts above; e.g. src/shared/grokLimits.js, kimiLimits.js |

### Named residual behaviors

1. **Credential breadth.** This app touches more secret stores than any plugin we have graded:
   macOS Keychain, Windows Credential Manager, `~/.codex/auth.json` (with write capability),
   multiple provider auth files, and dozens of env vars. All observed flows stay
   provider-local, but the attack surface if this repo were ever compromised is unusually
   large.
2. **Hub operator trust.** Enabling multi-device sync routes aggregate usage, emails, and plan
   labels to whichever hub you configure; privacy depends entirely on that operator.
   docs/privacy.md "Multi-device sync".
3. **Vendor override path exists.** The tokscale pin/replacement machinery is currently inert
   ("upstream" mode), but flipping one JSON field activates download-and-replace of a native
   binary; the SHA verification and fail-closed logic make this safe today, but it is a live
   code path worth watching across updates. scripts/vendor/tokscale.json:2; ensure-vendored-tokscale.js:23-56, 120-131.

## 5. What we could not check

- **Behavioral probe.** No sandboxed run of the widget against real agent homes (pipeline S4).
- **Cross-model review.** Single reviewer.
- **GitHub Releases artifacts.** Published installers were not compared to this commit; the
  code-signed update chain was taken from source review only.
- **Worker deployment.** The optional Cloudflare Worker sync backend was reviewed as source;
  no deployed instance was probed.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F (whole-repo); this card says C. Both recorded. The gap:
the criticals are the product doing its declared job to its own provider, the cred-plus-net gate
fires on every provider module by definition, and the privacy documentation is unusually precise
about what sync excludes. C rather than B because of the sheer breadth of credential stores
touched (including keychain and auth.json write paths), the always-on six-hour cadence of
updater and limits polling once enabled, and the standard pipeline ceiling (no probe, single
reviewer).

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Javis603/token-monitor /tmp/tm-audit
cd /tmp/tm-audit && git rev-parse HEAD   # expect 3e80f82b19c41c2ed452c0794025337fc31752d2

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/tm-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '415,467p' src/shared/limitCollector.js      # credential sources incl. keychains
sed -n '74,75p' src/shared/limitCollector.js        # token destinations (api.anthropic.com)
sed -n '19,33p' src/hub/server.js                   # loopback-fail-closed hub bind
sed -n '2,12p' scripts/vendor/tokscale.json         # upstream mode = no binary swap
grep -rn "eval(\|new Function(" src --include="*.js" # expect: no hits
grep -rniE "telemetry|posthog|sentry|analytics" src  # expect: none
```

## 8. Methodology and pinned inputs

- Subject: git commit `3e80f82b19c41c2ed452c0794025337fc31752d2` (shallow clone at
  reference/audits/token-monitor); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`.
- Review: full read of limitCollector credential flows, codexSystemSwitch write path, hub server
  binding and authorization, appUpdater feed logic, ensure-vendored-tokscale pipeline, discord
  RPC, serviceStatus providers, exchange rates, and docs/privacy.md claims against code;
  family-by-family adjudication of both criticals and all gates.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: every credential stays with its issuing provider, no telemetry, no dynamic
  execution, hub fails closed to loopback without a shared secret, updater is consent-gated;
  caps: unusual breadth of secret-store access including auth.json write, hub-operator trust
  when sync is enabled, live vendor-override code path, no S4 probe, single reviewer.
  Result: C.

## 9. Strengths

1. Documentation matches implementation line-for-line on the points that matter: the privacy
   policy's list of what sync never carries is verifiable in the wire-format code.
2. The hub refuses to bind non-loopback without an explicit shared secret, closing the classic
   unauthenticated-LAN hole before it can exist. src/hub/server.js:21-29.
3. Both auto-update flags are off, the vendored-binary swap is currently disabled and even then
   enforces SHA-256 plus version match before replacing anything.
4. DSH integration is genuinely first-class: dedicated transcript parsing with documented home
   resolution, not just topic-tag marketing. src/shared/dshPaths.js:4-12.

## 10. Residual risks

1. Any future compromise of this repository yields a privileged position across every major AI
   provider account on the machine at once; the blast radius of trusting this publisher is
   larger than the code alone suggests.
2. The account-switch feature holds multiple providers' full OAuth materials in memory and
   rewrites `~/.codex/auth.json` on request; a bug or injected input in that IPC surface would
   be high impact. main.js:1276, 1301, 7581.
3. Sync payloads include account email and plan labels by design so hubs can distinguish
   accounts - harmless against your own hub, but a real disclosure if pointed at someone else's.
   docs/privacy.md.
4. npm-installed tokscale binaries are trusted transitively; the vendor gate verifies override
   builds but not the base npm packages themselves. package.json dependencies block.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any eval/dynamic-import appearing in src/,
   any credential-bearing fetch to a non-issuing hostname, or any telemetry namespace forces
   immediate re-adjudication.
2. Check scripts/vendor/tokscale.json mode on upgrade: flipping to "override" activates the
   binary-replacement path and warrants re-review of the release tag it pins.
3. Diff docs/privacy.md against code changes; this project treats its policy as load-bearing,
   and divergence between the two is itself a finding.
4. Re-vet at 90 days or on the next tagged release, whichever comes first.
