# Trust Report Card: dsh-web-search-pro

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-web-search-pro` 0.1.11 - multi-engine web search, platform search (Bilibili/Zhihu/Weibo/YouTube/GitHub etc.), persistent SQLite cache, userscript-style extraction rules, Playwright rendering bridge; 8-11 model-facing tools |
| Pinned subject | github:anweat/dsh-web-search-pro @ commit `186c59677991c1776faeee1a19a3676c9e2e7ee1` (default branch head, cloned 2026-08-26) |
| npm integrity | npm package `dsh-web-search-pro@0.1.11` exists per README install path; registry tarball was not downloaded and compared in this pass (GitHub-install audit only) |
| Provenance | CI publishes with sigstore provenance (.github/workflows/publish.yml: `--provenance`, id-token: write) and packs bytes once for both release and publish - a stronger-than-usual supply chain, not independently re-verified here |
| License | MIT (root package.json:4) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A search plugin that does exactly what it says - it will talk to whatever search engines and platforms you point it at, including jina.ai readers, Exa's paid API, and login-walled Chinese platforms using cookies you deliberately hand it - with disciplined SSRF fencing and secret-role config, but its core function is broad outbound fetching on behalf of the model, which is inherent egress surface no static audit can shrink.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Outbound fetch by design | The product's job is outbound HTTP: DuckDuckGo HTML endpoint (src/engines.ts:169), Jina search/reader (src/engines.ts:257 s.jina.ai, src/fetch.ts:157 r.jina.ai), Exa API (src/exa-client.ts:56 api.exa.ai), PubMed eutils, plus platform scrapes (zhihu, bilibili, weibo, douyin, kuaishou and more under src/platform-search.ts). All requests flow through safe-http guards below. | file:line above |
| SSRF fencing | src/safe-http.ts rejects localhost/.local/.internal/private-IPv4 targets before DNS (:55-56) and re-checks resolved addresses post-DNS, rejecting private IPs (:72); the documented `allowProxyFakeIp` opt-in trusts only the two fake-IP CGNAT ranges for Clash/TUN users (README, config gate in the same check). | file:line above |
| Credential handling | API keys are declared secret-role config (src/config.ts:109 exaApiKey, :111 jinaApiKey, :113 githubToken); Exa key is sent only to api.exa.ai as x-api-key (src/exa-client.ts:57). Fallback to env EXA_API_KEY (src/engines.ts:115) is read-only. No key is logged or embedded in results found during review. | file:line above |
| Login-state capture | `scripts/save-login.mjs` opens visible browser windows for you to log into Chinese platforms and stores merged Playwright storageState JSON locally (scripts/save-login.mjs:14-22 platform list); LOGIN.md instructs domain-scoped AuthProfiles with explicit allowedDomains and warns never to paste cookie JSON through the model. This is deliberate high-value secret material (full session cookies for your accounts) stored in a local JSON file whose protection depends on your filesystem, not this plugin. | save-login.mjs, LOGIN.md |
| Child processes | One bounded call: `execFileSync('npm', ['root', '-g'], { timeout: 15000 })` to locate global playwright (src/util.ts:46); same pattern in scripts/save-login.mjs:34. No shell interpolation, no user-controlled argv. | file:line above |
| Dynamic code execution | None. The scanner EXEC critical at lib/util.js:8 is the `createRequire` import used to resolve playwright from configured paths (lib/util.js resolvePlaywright); module resolution is not code compilation. Custom extraction rules are declarative CSS selectors over jsdom, never evaluated code (src/extract.ts:10-13, ExtractRule interface at :15-19). | util.ts, extract.ts reads |
| Telemetry / hidden endpoints | None found. No analytics, heartbeats, or non-user-facing hosts beyond the engines listed above; grep across src/ surfaced only engine endpoints and documentation URLs. | grep of src/ |
| Persistence | SQLite via node:sqlite storing queries/results/page snapshots/user rules (src/store.ts:11-14) - local cache only, no sync channel. | file:line above |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 107 findings (3 critical, 79 high, 22 medium, 3 low), machine grade F, gates
`cred-plus-net`, `dynamic-exec-present`, `finding-density`. Full output preserved at
/Users/timurmonasypov/.jcode/scratch/dsh-web-search-pro.scan.json.

### Family adjudication

| Family | Adjudication |
|---|---|
| CRED criticals (tsdown.config.ts:28-29) | The bundler reading `process.env.NODE_ENV` at build time; scanner co-occurrence of "process.env" + credential vocabulary. Not credential access. |
| CRED critical lib/util.js:8 + mediums (engines.ts, router.ts lines) | createRequire/npm-root resolution and engine functions receiving the already-configured API key objects; keys move config-to-engine, engine-to-header(api.exa.ai) only. No third destination found. |
| NET highs (74) | Dominated by lockfile URLs, documentation links, and the declared engine/platform endpoints above - all consistent with a search tool's stated purpose. |
| EXEC highs | createRequire-based playwright resolution; dev/test harness spawn patterns; none compile or eval strings at runtime. |
| OBFU mediums (lib/util.js:228, src/util.ts:242) | decodeURIComponent of Google/DDG redirect parameters (`uddg=`/`url=` unwrapping, src/util.ts:236-247) - URL decoding, not concealment. |
| SUPPLY high (package.json:140) | Repository URL self-reference; manifest is clean otherwise (fixed deps cross-spawn/js-yaml/jsdom, no postinstall network hooks). |

### Negative claims

No telemetry, no conversation-content transmission, no reads of ~/.ssh/.aws/.codex-style
stores, no dynamic compilation, no install-time network fetches, no auto-updater, and no
fetch path bypassing the safe-http private-address guard was found in audited sources.

## 5. What we could not check

- **The companion plugin.** Half the runtime story lives in @anweat/dsh-browser (Playwright automation modes, AuthProfile enforcement, approval tiers). Its allowedDomains enforcement and usagePolicy were read here only as documented contracts (LOGIN.md, README), not audited in that repo's code.
- **Behavioral probe.** No live search traffic was generated; SSRF rejection was verified by reading, not probing.
- **Published parity.** The npm tarball was not downloaded and diffed against this commit; the provenance-bearing CI raises confidence but is not proof.
- **Platform scrape logic exhaustively** (platform-search.ts per-platform parsers spot-checked only).
- **Whether any engine response can smuggle content that later reaches exec-adjacent sinks** - none found statically, and the plugin has no such sink.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Per pipeline rules this caps
the grade at C regardless of findings. Substantively, the case for B rests on unusually good
hygiene (secret-role schema, pre-DNS and post-DNS SSRF checks, single fixed-argv child
process, provenance CI); holding at C reflects what the tool *is* - a general-purpose
model-driven fetcher plus locally stored session cookies - rather than any finding of
misbehavior. The scanner's F overstates risk via false-positive criticals adjudicated above.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/anweat/dsh-web-search-pro /tmp/wsp-audit
cd /tmp/wsp-audit && git rev-parse HEAD   # expect 186c59677991c1776faeee1a19a3676c9e2e7ee1

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/wsp-audit

# 3. Spot-check the headline claims
sed -n '55,75p' src/safe-http.ts           # pre-DNS + post-DNS private-address rejection
sed -n '105,115p' src/config.ts            # secret-role API key declarations
sed -n '50,60p' src/exa-client.ts          # key goes to https://api.exa.ai only
grep -rn "https\?://" src --include=*.ts | grep -v "engines\|platform-search\|fetch\|exa-client\|safe-http"
                                           # expect: docs/comments only outside engine files
sed -n '30,40p' scripts/save-login.mjs     # where your platform cookies get written
```

## 8. Methodology and pinned inputs

- Subject: git commit `186c59677991c1776faeee1a19a3676c9e2e7ee1` (shallow clone at reference/audits/dsh-web-search-pro, upstream HEAD 2026-08-25)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...1041f3`
- Review: src/safe-http.ts, src/config.ts, src/exa-client.ts, src/engines.ts, src/router.ts, src/util.ts, src/store.ts, src/extract.ts, src/fetch.ts, package.json, tsdown.config.ts, .github/workflows/publish.yml, scripts/save-login.mjs, LOGIN.md, README.md, docs/
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: pipeline ceiling C applies (no behavioral probe, no cross-model review, companion plugin unaudited). Nothing found supports D or F.

## 9. Strengths

1. Two-stage SSRF defense: hostname-class rejection before resolution and resolved-address rejection after it (src/safe-http.ts:55-56, 72), covering DNS-rebinding style tricks.
2. Secrets are typed as secrets at the config layer (src/config.ts:109-113) rather than free-form strings.
3. The login-cookie workflow is designed defensively: visible windows, explicit user action, domain allowlists required per profile, and explicit guidance against passing cookies through model context (LOGIN.md).
4. Supply-chain posture is above family norm: pack-once/publish-bytes CI with sigstore provenance and tag/version equality checks (.github/workflows/publish.yml).
5. Extraction customization is declarative selectors in SQLite, not scriptable hooks - the safest possible design for user extensibility here.

## 10. Residual risks

1. Inherent purpose: anything the model asks this tool to fetch leaves your machine to attacker-influenceable web content; SSRF fences stop internal-network hits, not data exfiltration-by-summary into fetched pages' referers/query strings.
2. storageState JSON from save-login.mjs is full account-session material in a plain local file; compromise of your disk equals compromise of those platform accounts, and persistState writes refresh rotated cookies back if enabled.
3. Third-party reader dependencies (r.jina.ai, s.jina.ai) see every URL you fetch through them; treat that as routing your browsing through a third party.
4. Platform scrapers break silently when sites redesign; failure modes are availability issues, not security ones, but review coverage of each parser is shallow.
5. GitHub/npm installs float unless pinned; this card covers the pinned commit only.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD; any new absolute host outside the engine set {duckduckgo, jina, exa, pubmed, declared platforms} must be re-adjudicated.
2. Diff src/safe-http.ts first on any update; weakened private-IP checks change the headline risk immediately.
3. Watch scripts/save-login.mjs and any new default for storageState paths; unencrypted cookie stores growing scope is the main drift direction.
4. Audit @anweat/dsh-browser separately before trusting the AuthProfile allowedDomains contract assumed here.
