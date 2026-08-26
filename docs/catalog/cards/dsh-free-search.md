# Trust Report Card: dsh-free-search

| | |
|---|---|
| **Grade** | **C** — usable after informed setup (manual adjudication; raw scanner output: F) |
| Plugin | dsh-free-search v0.4.12 (github.com/DDDMUC/dsh-free-search) |
| Pinned subject (git) | `998fcebbebb7f08a972d3a9efb53a56cd6e1bcf5` (default branch HEAD, committed 2026-08-22T02:06:01+08:00) |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, 6 files / 148 KB scanned (13 skipped: images, lockfile, .cmd/.ps1) |
| Methodology | Static scan (tool) + manual source review of both shipped bundle files and dev tooling. Behavioral probe (S4), cross-model adversarial review (S5), and published-tarball analysis have NOT run. |

A grade is evidence-backed opinion over the pinned commit above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

A search-provider plugin whose entire job is outbound HTTP, so its ~20 engine endpoints are expected rather than suspicious, but it earns the C for one real capability — a settings-bridge button that runs `pnpm add dsh-free-search@latest` in your profile directory on click — plus an npm update check, a settings bridge whose loopback guard is weaker than DSH's own trust fence, and a bundle patch that silently re-points the harness's default `web.searchProvider` at itself.

## What this plugin can do (capability surface)

| Capability | Present | Evidence |
|---|---|---|
| Network egress | Yes, by design, many endpoints | Engine fetches: DDG HTML/Lite (`lib/index.js:8-9`), Bing (`lib/index.js:10`), Tavily (`lib/index.js:11`), Keenable REST+MCP (`lib/index.js:12-13`), SearXNG instance list (`lib/index.js:318-323`), AnySearch (`lib/index.js:383`), Exa MCP (`lib/index.js:384`) and Exa REST (`lib/index.js:730`), Perplexity (`lib/index.js:943`), DeepSeek official (`lib/index.js:979`). Platform searches: GitHub (`lib/index.js:504-505`), V2EX (`lib/index.js:524`), Bilibili (`lib/index.js:546`), Reddit (`lib/index.js:573`), Hacker News (`lib/index.js:599`), StackExchange (`lib/index.js:624`), Wikipedia (`lib/index.js:648`), npm registry search (`lib/index.js:669`). Update check to `registry.npmjs.org/dsh-free-search/latest` (`lib/index.js:26`, fetch `lib/index.js:37`). All are GET/POST search requests carrying only query text and API keys; no conversation content is attached. |
| Credential access | Its own configured keys only | Keys arrive via settings schema and are forwarded as `Authorization`/`x-api-key` headers to the matching engine endpoint (`lib/index.js:734,788,864,947,983-984`). Bridge reads describe with `redactSecrets: true` (`lib/index.js:1102-1104,1228`). No filesystem credential harvesting. |
| Dynamic code execution | None | No `eval`/`new Function`/`vm`. The OBFU-010 hit is HTML entity decoding via `String.fromCharCode` on numeric character references (`lib/index.js:136`) inside DDG result parsing. Not code execution. |
| Child processes | One deliberate site | `exec("pnpm add dsh-free-search@latest", { cwd: mode.profileDir, timeout: 120000 })` behind the settings-card upgrade action (`lib/index.js:1146`); refused in symlink/dev installs (`lib/index.js:1133-1140`). Fixed command string, no interpolation of request data. |
| Timers / beacons | None | No `setInterval`/`setTimeout` in `lib/client.js`; the npm version check runs only when the user clicks "check update" (client `bridgeCheckUpdate` at `lib/client.js:199-215`, host handler `lib/index.js:1114-1128`). |
| Obfuscation signals | None | Unminified source shipped directly; no encoded payloads. |
| Machine fingerprinting | None | No os/userInfo/uuid calls. Spoofed Chrome user-agent string for scraping resistance (`lib/index.js:14-15`), not fingerprinting. |
| npm lifecycle hooks | None | `package.json` scripts declare none. Single runtime dependency `@deepseek-ai/schemastery`; peers resolve on the user's machine. |
| Services registered | Search provider + tools + settings bridge | Bundle patch inserts plugin row and sets `web.searchProvider: ddg` (`cordis.patch.yml:13-21`); registers `web_search` provider fallback chain and three tools (`lib/index.js:1644,1731,1816`); mounts four POST routes under `/api/dsh-free-search-settings/*` gated by `isLoopbackRequest` (`lib/index.js:1254` in `guard`, applied to all routes at `lib/index.js:1262-1301`). |

Data-flow note: every web_search call sends the agent's query text to third-party engines (DDG, Bing, or whichever the fallback chain reaches). That is inherent to the product. The fallback chain means a query can reach engines the user did not explicitly choose (`lib/index.js:36` describes free-engine fallback; order at `lib/index.js:24-25`).

## Findings

Raw scan retained at `reference/audits/dsh-free-search.scan.json`: 80 findings (1 critical, 64 high, 9 medium, 6 low), mechanical grade F (gates `dynamic-exec-present`, `finding-density`). Adjudication:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| EXEC-004 | `lib/index.js:6` imports child_process; EXEC-005 `lib/index.js:1146` | critical/high | Real and kept as the card's headline finding: one-click self-upgrade executes pnpm against the active profile directory. Command is constant, cwd is derived from local profile layout (`detectInstallMode`, `lib/index.js:65-83`), timeout 120 s, link-mode refused. Risk is supply-chain shaped (installs whatever npm serves as `latest`), not exfiltration. |
| NET-001/007 cluster (~40 sites) | see capability table | high | Expected behavior for a multi-engine search plugin; every destination is a named public search/API host written literally in source. Kept as declared egress inventory, downgraded from suspicion. |
| NET-014 x6 | `lib/index.js:37,203,394,431,783,862,907` | medium | Fetch targets held in constants resolved at module top; each traces to a literal URL within ten lines. False positive of the opaque-variable detector. Downgraded to info. |
| NET-003 | `tools/server.mjs:1` imports node:http | high | Dev-only local helper (port 4789) that rewrites `searchProvider` in `~/.dsh/profiles/web/cordis.patch.yml` (`tools/server.mjs:6-25`); never imported by the plugin entry. Not shipped logic. Info. |
| OBFU-010 | `lib/index.js:136` | medium | Entity decoding for scraped HTML. Not present. |
| NET-013 | `lib/index.js:1047` builds `http://` + Host header | medium | Part of `isLoopbackRequest`'s own host-header validation. The loopback check compares remote address AND Host header AND Sec-Fetch-Site/Origin (`lib/index.js:1040-1060`). Solid against direct LAN hits; weaker than origin-binding because a fully attacker-controlled browser context on the same machine could still satisfy Host+Origin spoofing only if it can also set `sec-fetch-site` absent — modern browsers set it automatically, so CSRF-style abuse requires a non-browser client on localhost. Documented residual risk below. |
| NET-007/008 metadata | `package.json:37`, `lib/client.js:160-169` engine homepage links | low | Links rendered in UI, opened in new tabs, not fetched server-side. No action. |

CRED family: zero findings. The compounding rule that fired mechanically here was EXEC+NET (upgrade exec + registry fetch), which is the honest description of any self-updating plugin.

## Strengths

- All ~20 egress destinations are literal, greppable constants; nothing assembled from obfuscated parts except the SearXNG base the user configures.
- Secrets flow only from the plugin's own settings namespace to their corresponding engine, redacted in every describe response.
- Upgrade path is conservative: refuses symlink installs, surfaces stdout/stderr truncated, requires manual restart to apply.
- Result cache (LRU 50) and per-request timeouts reduce request volume; snippet cleaning strips paywall noise without fetching more.
- Bilingual settings UI with explicit FREE vs API KEY badges; README documents keyless anonymous quotas per engine.
- MIT license; ships exactly two JS files plus patch yaml (`package.json` files list).

## Residual risks

1. **One-click self-update executes arbitrary future versions of itself** (`lib/index.js:1146`): whatever npm publishes next under this name runs inside your harness profile after restart. Trust must be extended to the author indefinitely, not just this commit.
2. **Bundle patch takes over the global search provider** (`cordis.patch.yml:19-21` sets `web.searchProvider: ddg`): installing changes stock harness behavior for every agent session, beyond the plugin's own namespace.
3. **Bridge auth is loopback-only**, weaker than the harness's configurable trustedHosts fence: combined with dsh-web-lan-access style LAN exposure, `/api/dsh-free-search-settings/mutate` remains reachable from LAN addresses only if they appear local — they do not pass `remoteAddress` check, so practical risk is limited to same-machine processes; still, no CSRF token beyond Sec-Fetch-Site/Origin heuristics (`lib/index.js:1040-1060`).
4. **Query text leaves the machine to whichever engine the fallback chain picks**, including keyless anonymous tiers with unknown data practices (AnySearch, Keenable).
5. Chinese-first README; English speakers must rely on the settings UI translations.
6. Static review only; no tarball comparison (package is published to npm separately), no behavioral probe. Re-vet newer versions.

## Verify this yourself

```bash
git clone --depth 1 https://github.com/DDDMUC/dsh-free-search && cd dsh-free-search
git rev-parse HEAD        # 998fcebbebb7f08a972d3a9efb53a56cd6e1bcf5 at audit time

# Full egress inventory
grep -n "https://" lib/index.js

# The self-upgrade exec
sed -n '1130,1160p' lib/index.js

# Bundle-level searchProvider takeover
cat cordis.patch.yml

# Bridge guard
sed -n '1040,1060p' lib/index.js

node /path/to/dsh-bridge/tools/scan/dist/index.js .
```

## Methodology and pinned inputs

- Charter: `CHARTER.md` (every claim cites file:line). Pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, run over the shallow clone; raw JSON at `reference/audits/dsh-free-search.scan.json`.
- Manual review covered: package.json, cordis.patch.yml, full read of `lib/index.js` (2000 lines) and `lib/client.js` (786 lines), `tools/server.mjs`, switch-engine tooling, and complete findings adjudication. Node v26, macOS/aarch64.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `998fcebb` (v0.4.12) | C | Initial card. Static + manual methodology; probe/review/tarball checks pending pipeline availability. |
