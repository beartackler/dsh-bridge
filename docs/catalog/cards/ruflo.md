# Trust Report Card: ruflo

| | |
|---|---|
| **Grade** | **D** — risky |
| Plugin | ruflo / claude-flow (github.com/ruvnet/ruflo), npm `ruflo@3.38.20` |
| Pinned subject (git) | `e21aa352fdc80fd2d3cc4e83404a76a18d118b96` (default branch `main` HEAD, pushed 2026-08-25T06:37:23Z at audit time) |
| Pinned subject (npm) | `ruflo@3.38.20`, integrity `sha512-axVNTyOq6mNNKcc0YiUQW2AgEGBC+5EHvtnxuVn7lDyY0rL3PISd3QLMSXNA7Tcw6WEDnZDts4LFkMvA8x5tPQ==` |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-scan 0.1.0, rules digest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999` |
| Methodology | Static scan (tool) + manual source review + published-tarball extraction and diff against the repo subpackage. Behavioral probe (S4) and cross-model adversarial review (S5) have NOT run. |

A grade is evidence-backed opinion over the pinned artifacts above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

Nothing malicious was found, but the CLI silently installs npm patch updates at every startup without asking, one workspace package's postinstall globally installs an unpinned tool from the registry, and the DSH-facing plugin scripts send conversation content to api.deepseek.com under a key taken from the environment, so this lands in D until those behaviors are consent-gated.

## What this plugin can do (capability surface)

This repository is a large multi-product monorepo: an npm CLI (`ruflo`, umbrella over `@claude-flow/cli`), a Claude Code-style plugin marketplace tree (`.claude-plugin/`, 30+ `plugins/ruflo-*` bundles including the DeepSeek Harness integration), MCP bridge servers, and experimental v3 packages.

| Capability | Present | Evidence |
|---|---|---|
| Silent self-update | Yes — the headline finding | On startup the CLI runs `runStartupUpdateCheck({ autoUpdate: true })` unless `--no-update` is passed (`v3/@claude-flow/cli/src/index.ts:131-133,573`). Patch-range updates for priority packages auto-apply by default config (`src/update/checker.ts:23-31`, decision logic `checker.ts:124-126`); execution runs `execFileSync('npm', ['install', '<pkg>@<version>', '--save-exact'])` (`src/update/executor.ts:131-140`) with no user prompt (`src/update/index.ts:83-101`). Rate-limited to once per 24h; argv-array form, validated spec (`executor.ts:116-128`). |
| Global install hook | Yes, in one workspace package | `v3/@claude-flow/browser/package.json:22`: postinstall probes `agent-browser --version` and on failure runs `npm install -g agent-browser@latest` via execSync. Unpinned tag, global scope, no prompt. Note: this package is NOT part of the published `ruflo` tarball (verified below), so it triggers only when installing that workspace package directly or via its own release channel. |
| Network egress | Multiple documented destinations | DSH plugin helper posts chat content to `https://api.deepseek.com/v1/chat/completions` with `Bearer $DEEPSEEK_API_KEY` (`plugins/ruflo-deepseek-harness/scripts/_deepseek.mjs:17,62-79`). Update checker queries registry.npmjs.org (`update/checker.ts:18`). MCP bridge binds loopback by default with token auth optional (`ruflo/src/mcp-bridge/index.js:15`, auth middleware `index.js:919-929` using `timingSafeEqual`). Hugging Face endpoints appear in ruvocal config generation (`ruflo/src/ruvocal/scripts/updateLocalEnv.ts:39`). |
| Credential reads | Environment inheritance, not theft | Critical CRED hits are `{ ...process.env }` passed to spawned children (`ruflo/src/mcp-bridge/index.js:138`, `doctor.ts:36`, `daemon-autostart.ts:153`) and deny-lists of key filenames inside security modules (`v3/@claude-flow/security/src/path-validator.ts:126-129`, `agentic-qe` blockedPaths). No code found that locates, reads, and transmits credential files. |
| Dynamic code execution | Present but bounded | ~700 prod EXEC hits are overwhelmingly `RegExp.exec` detector matches plus array-argv spawns in benchmark/smoke scripts. No eval-of-remote-content found in reviewed production paths. |
| npm lifecycle hooks | Root package clean | Published `ruflo` tarball ships no postinstall (scripts are dev/build commands only). The two hooks that exist live in v3 workspace packages cited above. |
| Obfuscation signals | None meaningful | OBFU volume is lockfile URL noise (9k+ low-severity hits in `package-lock.json`) and minified-vendor patterns; no decoded-then-executed blobs located. |
| Data flow (DSH plugin) | Conversation content leaves the machine | The `deepseek-chat`/`deepseek-reason` skills instruct the agent to run `_deepseek.mjs` with message payloads; whatever the harness puts in those messages is sent to DeepSeek's API. This is the feature working as designed, gated on `DEEPSEEK_API_KEY`. |

Provenance check performed: downloaded `ruflo@3.38.20` (4.7 MB, 549 entries). Tarball `bin/ruflo.js` is byte-identical to repo `ruflo/bin/ruflo.js`; `src/mcp-bridge/index.js` identical; tarball contains only `bin/`, `src/`, `package.json`, `README.md` (the declared `files` allowlist entries for v3 dist resolve to nothing at pack time because dist is gitignored/unbuilt in the checkout we compared). No `.claude-plugin` marketplace tree ships in the npm artifact.

## Findings

Raw scan output retained at `reference/audits/scan-ruflo.json`. Mechanical result: grade F, 21,683 findings (65 critical, 3,874 high, 455 medium, 17,289 low) over 3,333 files; gates include `cred-plus-net`, `dynamic-exec-present`, `finding-density`, `install-hook-shell`. Adjudication:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| AUTOUPD-001 | `v3/@claude-flow/cli/src/index.ts:132-133,573`; `update/index.ts:83-101`; `update/checker.ts:23-31`; `update/executor.ts:131-140` | high (adjudicated up from scattered LOW/HOOK signals) | Confirmed: automatic `npm install` execution at CLI startup, opt-out rather than opt-in, no prompt, applies to security-priority packages by default. Not hostile (argv-array, validated specs, rate-limited, rollback history logged), but silent mutation of the user's node_modules is exactly the behavior class our D band names. Kept high. |
| HOOK-001 | `v3/@claude-flow/browser/package.json:22` | critical (gate `install-hook-shell`) | Confirmed: pre-consent global install of `agent-browser@latest` from inside a postinstall. Unpinned `latest` means supply-chain exposure to whatever that name serves next. Not in the published `ruflo` tarball, which limits blast radius but does not excuse it. Kept high. |
| NET-DSH-001 | `plugins/ruflo-deepseek-harness/scripts/_deepseek.mjs:62-79` | medium | Real egress of conversation-derived payloads to api.deepseek.com; purpose-evident and keyed, but the skill docs do not state clearly that full messages leave the machine. Documented-behavior downgrade to medium. |
| CRED criticals x44 | spawn env inheritance, path-validator lists, tests | critical | All reviewed instances are either passing the parent environment to child processes (standard for CLIs that shell out), deny-lists inside security modules, or test fixtures asserting secrets stay redacted. Zero read-and-exfiltrate pairs found. Downgraded to info/not-present. |
| NET criticals x5 | IoT seed endpoint literals | critical | `169.254.42.1` link-local addresses for a USB-C device protocol in `plugin-iot-cognitum` (`src/bin.ts:20-21,186-187`) — constants for an optional hardware feature, loopback-class addresses, not metadata-service access. Downgraded to low. |
| EXEC/OBFU bulk | benchmarks, smoke scripts, lockfiles | high | RegExp `.exec` false positives, dev-only benchmark spawns, lockfile integrity URLs. No action. |

Credential+egress compounding: not demonstrated anywhere in production code.

## Strengths

- Update machinery is engineering-clean despite being consent-hostile: argv-array execFileSync with metacharacter validation (`update/executor.ts:16-22,116-128`), rate limiting, dry-run modes, and update history.
- The shipped npm artifact matched the repo subpackage byte-for-byte on every file we diffed (entry point and MCP bridge).
- Graceful-degradation design in the DSH plugin: missing key or network failure yields a JSON degraded envelope instead of crashing the harness session (`_deepseek.mjs:8-12,50-60`).
- SECURITY.md exists with a private reporting channel; loopback-by-default binding on the MCP bridge (`mcp-bridge/index.js:15`) with timing-safe token comparison when a token is set.
- MIT license; enormous test corpus including security-negative fixtures.

## Residual risks

1. Silent startup auto-update mutates installed packages without asking. Users who value reproducible environments must remember `--no-update` on every invocation. Blocks anything above D until it becomes opt-in or prompts once.
2. The browser package's global `npm install -g agent-browser@latest` follows a moving tag with global scope; any future hijack of that name executes on contributor/user machines at install time.
3. The DSH plugin sends full message payloads to api.deepseek.com; fine for its purpose, but privacy expectations should be set in the skill README (currently thin).
4. Monorepo sprawl (three product generations: root plugins/, `ruflo/` server, `v3/` rewrite) means audit coverage was hotspot-based; unreviewed corners exist, especially under `services/` and `crates/`.
5. The `files` allowlist advertises v3 dist paths that were absent from the packed tarball we inspected, so what `npx ruflo` actually loads depends on install-time resolution we could not fully reproduce.
6. Static + manual methodology only; probe (S4), dual adversarial review (S5), and signed verdicts (S8) pending. A full pipeline run could lower, not raise, this grade.

## Verify this yourself

```bash
# Pin the same artifacts
git clone --depth 1 https://github.com/ruvnet/ruflo && cd ruflo && git rev-parse HEAD   # expect e21aa352...
npm view ruflo@3.38.20 dist.integrity   # sha512-axVNTyOq...

# The silent auto-update chain
sed -n '128,136p' v3/@claude-flow/cli/src/index.ts          # startup hook, --no-update opt-out
sed -n '23,32p'  v3/@claude-flow/cli/src/update/checker.ts  # patch:true default
sed -n '125,142p' v3/@claude-flow/cli/src/update/executor.ts # execFileSync npm install

# The global-install postinstall
node -e "console.log(require('./v3/@claude-flow/browser/package.json').scripts.postinstall)"

# DSH plugin egress target
grep -n "api.deepseek.com\|DEEPSEEK_API_KEY" plugins/ruflo-deepseek-harness/scripts/_deepseek.mjs

# Tarball correspondence
npm pack ruflo@3.38.20 && tar xzf ruflo-3.38.20.tgz
diff package/bin/ruflo.js ruflo/bin/ruflo.js                # expect: identical

# Re-run the static scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js <path-to-ruflo> --json /tmp/ruflo-scan.json
```

## Methodology and pinned inputs

- Charter: `CHARTER.md`; pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge tools/scan 0.1.0, digest `9cc04224...baaee999`, run once over the shallow clone at `reference/audits/ruflo`.
- Manual review covered: the full update subsystem (index/checker/executor/rate-limiter), both postinstall hooks, the ruflo-deepseek-harness plugin (all files), mcp-bridge auth and binding, credential-flagged modules sampled across root/v3, hotspot diagnosis of EXEC/OBFU/CRED bulk, and tarball-vs-subpackage diffs for `ruflo@3.38.20`.
- Cross-model adversarial review: NOT performed (single reviewer). Card revision 1 capped accordingly.
- Raw scan JSON retained next to the clone under `reference/audits/`.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `e21aa35` + npm 3.38.20 | D | Initial card. Static + manual methodology; probe/review/signing pending pipeline availability. |
