# Trust Report Card: dsh-read-url (`2672243194/dsh-read-url`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-read-url` - registers four agent tools (`read_url`, `read_url_links`, `read_url_batch`, `read_url_site`) that fetch web pages and return clean main-content text or Markdown, with charset auto-detection, JSON/RSS dispatch, SPA rendering via optional playwright, pagination, and a site crawler. |
| Pinned subject | github:2672243194/dsh-read-url @ commit `a23bc06bc11b65b07ae2447961b89ebda7860ce6` (default branch `main` head at audit time) |
| npm integrity | v1.3.1 on registry; published tarball downloaded and byte-compared against the audited clone: index.js differs only in line endings, proxy-fallback.js and spa.js identical. No provenance attestation. |
| Provenance | Moderate. Tarball matches repo (modulo CRLF), but no attestation and no CI workflow in-repo. |
| License | MIT declared in package.json:33; LICENSE file present; THIRD_PARTY_NOTICES.md documents the optional readability upgrade path. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review + tarball comparison) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A fetch-and-extract tool that talks to whatever URL it is handed and nothing else: no
credentials exist to steal, no telemetry, no dynamic code execution in shipped files, and its
one child process is curl invoked through your own configured proxy.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Fetches any caller-supplied http(s) URL: direct via global fetch, or through the ctx.web capability seam when present, plus meta-refresh hops (max 3), pagination chains (same-host only, max 10), batch reads, and BFS site crawls (same-host only). Every URL passes an `^https?://` gate before fetching. | index.js:1165, 1470-1472, 1760-1761; 1140-1161, 1337-1360, 1647-1699 |
| Proxy fallback | When a direct fetch fails connection-class errors and HTTPS_PROXY/HTTP_PROXY env vars are set (or on Windows, the registry system proxy), retries once through the user's proxy by invoking system `curl -sS -L --max-time --max-filesize -x <proxy>`. The proxy value comes from the user's own environment, never from the fetched page. | proxy-fallback.js:70-86, 88-141 |
| Credential handling | Reads exactly four env vars, all proxy-related (`HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`). No tokens, no API keys, no secret-shaped strings anywhere in the package. The proxy URL is passed explicitly via `-x`, so curl's env reading is not relied upon. | proxy-fallback.js:75-78; grep negative otherwise |
| Child processes / exec | One real exec surface: `execFileSync('powershell', ...)` reading the Windows registry system proxy after a direct-connect failure (5 s timeout, fixed command), and `execFile('curl', args)` for proxied fetches. All regex `.exec()` scanner hits are JavaScript RegExp methods, not execution. No eval/new Function/vm in shipped files. | proxy-fallback.js:16, 52-69, 105-112; grep adjudicated |
| Dynamic import | Two guarded optional upgrades: `import('@mozilla/readability')` + `import('happy-dom')` when the user has installed them into the profile themselves, and `import('playwright')` for SPA rendering. Both fail open to the built-in path when absent. | index.js:852-869; spa.js:31-41 |
| Filesystem | None at runtime. Cache and decoder state are in-memory Maps registered under `ctx.effect` so unload fully reverts them. No config reads, no writes. | index.js:42-53, 1806-1811 |
| Tool surface | Four tools with declared JSON Schema parameters, cooperative timeouts derived from config, concurrency-safe declarations, and bounded outputs (maxChars clamped 500-20000, links capped, batch capped at 10 URLs, crawl capped 50 pages/depth 5). | index.js:1439-1510, 1547-1614, 1716-1783, 1815-1869 |
| Telemetry | None. The 228 high NET findings are test-site URL tables and UA strings, not calls. | grep negative for beacons; section 4 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.

**240 findings** (230 high NET, 5 high HOOK, 3 high EXEC, 2 medium HOOK, 7 low NET,
1 high SUPPLY... per rule table below). Machine verdict **F**, off gates
`dynamic-exec-present`, `finding-density`. Manual adjudication follows.

Rule/severity census: network-egress high x221 low x7; lifecycle-hooks high x5 medium x2;
dynamic-eval high x3; manifest-supply-risk high x1.

### Scanner highs adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x153 multi-site.mjs, x44 test.mjs, x21 extended-sites.mjs | Test-site URL tables (152-site sweep across Chinese portals, feeds, APIs) used for offline verification runs. These files are NOT in the npm `files` whitelist and never ship; even in-repo they are inert data arrays consumed only when a developer runs them. | multi-site.mjs:11+; test.mjs; extended-sites.mjs:8+; package.json files list |
| NET high index.js:120 `fetch(url, ...)` | The product. Destination is the tool argument supplied by the calling model/user, gated to http(s). A web-fetch tool that cannot reach arbitrary hosts would be useless. | index.js:118-124 |
| EXEC high x3 proxy-fallback.js | The powershell registry read and the curl invocation described in section 3. Fixed binaries, explicit arg lists, no shell interpolation of remote data. The `-x $proxy` value originates from the user's environment or OS settings. | proxy-fallback.js:52-69, 96-115 |
| HOOK high x5 (index.js:1, spa.js x2, test-spa.mjs x2) | Regex `.exec(` identifier collisions flagged as lifecycle hooks. package.json declares zero lifecycle scripts; there are no postinstall/prepare hooks at all. | package.json:1-40 (no scripts field); matched lines are RegExp usage |
| SUPPLY high package.json:61 repository git URL | Self-referential metadata. Inert. | package.json:58-62 |
| `dynamic-exec-present` gate | Dismissed: the three EXEC hits are the audited curl/powershell calls, which are documented behavior, not dynamic evaluation. | section 3 |

### Tarball comparison

Published tarball contains exactly the whitelisted eight files. `proxy-fallback.js` and
`spa.js` byte-match the audited clone; `index.js` matches after CRLF normalization.

## 5. What we could not check

- **Fetched content is untrusted input rendered into model context.** The extractor strips
  script/style tags and decodes entities defensively, but prompt-injection resistance is a
  property of the consuming agent, not this plugin.
- **Optional heavy deps.** If the user installs playwright/@mozilla/readability/happy-dom
  themselves, those libraries execute inside the plugin's process and were not audited.
- **Publishing channel.** No attestation, no CI workflow in-repo; tarball equality at audit
  time is the only supply-chain evidence.
- **Behavioral probe.** No live fetch exercise during the audit (the repo's own 152-site sweep
  exists but was not re-run here).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says B. Nearly the entire machine verdict
comes from URL string constants in developer-only test sweeps and from naming a RegExp method
`exec`. Neither ships nor executes anything beyond the documented fetch/curl paths.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/2672243194/dsh-read-url /tmp/rurl-audit
cd /tmp/rurl-audit && git rev-parse HEAD   # expect a23bc06bc11b65b07ae2447961b89ebda7860ce6

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/rurl-audit   # from a dsh-bridge checkout

# 3. Spot-check headline claims
grep -rnE "eval\(|new Function|vm\." *.js                 # expect: no hits
grep -rn "process.env" *.js                               # expect: proxy vars only (proxy-fallback.js:75-78)
                                                          #   plus CONC knobs in dev-only .mjs test files
grep -n "scripts" package.json                            # expect: no scripts block at all
sed -n '75,86p' proxy-fallback.js                         # the complete credential surface
sed -n '96,115p' proxy-fallback.js                        # curl args, incl. --max-filesize bound

# 4. Read what npm actually ships
cd /tmp && npm pack dsh-read-url@1.3.1 && tar -tzf dsh-read-url-1.3.1.tgz
#   expect 8 entries: index/spa/proxy-fallback js, patch yml, docs, LICENSE, package.json
diff <(tr -d '\r' < package/index.js) /tmp/rurl-audit/index.js && echo IDENTICAL

# 5. Confirm the egress story
grep -c "https\?://" multi-site.mjs                        # expect ~150+: test fixtures, not shipped
```

## 8. Methodology and pinned inputs

- Subject: git commit `a23bc06bc11b65b07ae2447961b89ebda7860ce6` (shallow clone at
  reference/audits/dsh-read-url); published 1.3.1 tarball compared against it
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest above; run recorded in section 4
- Review: full read of index.js (1874 lines), spa.js, proxy-fallback.js, package.json,
  cordis.patch.yml; heads of multi-site.mjs / extended-sites.mjs / test-spa.mjs;
  npm metadata and tarball download
- Cross-model review: NOT performed (single reviewer). Revision 1 capped accordingly.
- Grade derivation: after adjudication the package performs exactly four actions - fetch
  requested URLs, retry via the user's own proxy using curl, optionally render via playwright
  if independently installed, return extracted text. No credentials, no writes, no dynamic
  execution, no telemetry, LICENSE present, zero runtime dependencies. Caps applied: no
  publish attestation, unaudited optional heavy deps, SSRF-style arbitrary-host fetching is
  inherent to the product class, no behavioral probe, single reviewer. Result: **B**.

## 9. Strengths

1. Zero runtime dependencies and zero filesystem access; all state is session-scoped and
   reverted on unload (index.js:1806-1811).
2. The one child-process surface (curl) is size-capped (`--max-filesize`), time-capped
   (`--max-time`), hidden-window on Windows, abortable via the cooperative signal, and parses
   metadata from both ends of the tail line to survive redirect chains
   (proxy-fallback.js:96-131).
3. Binary bodies are sniffed out of the HTML pipeline both with and without content-type
   headers, and oversized pages are rejected mid-stream rather than buffered (index.js:146-156;
   proxy-fallback.js:19-35).
4. Bounded everywhere a crawler could run away: pagination max 10 same-host hops, crawl max
   50 pages with queue caps, batch max 10 URLs, link extraction capped at limit*4 anchor scans
   (index.js:953-955, 1338, 1656-1658, 1689).
5. Honest error surfaces: undici cause messages are relayed so the model can distinguish bad
   domain from blocked network instead of blind-retrying (index.js:162-166).

## 10. Residual risks

1. **Arbitrary-host fetching is the product.** Given a malicious or mistaken URL the tools
   will request internal addresses reachable from the host (localhost services, cloud metadata
   endpoints) and return the body to the model. There is no loopback/private-CIDR refusal.
   Treat this as inherent SSRF exposure of the DSH host network.
2. **Proxy exfiltration channel is configuration-scoped**: whatever HTTPS_PROXY points at
   receives every retried fetch, including its URL. That is standard client behavior, but it
   means the proxy operator sees browsing targets (proxy-fallback.js:75-78, 100-104).
3. Optional `@mozilla/readability` + `happy-dom` imports execute third-party parser code on
   hostile HTML when the user has opted in (index.js:852-869). Parser vulnerabilities there
   become reachable through this tool.
4. No publish attestation or CI; future releases could drift from the repo without detection
   by anything except manual diffing.
5. Extracted web text flows into model context unfiltered; classic indirect prompt injection
   applies (see section 5).

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any new process.env read beyond proxy
   vars, any fs call, any eval-family call site forces re-adjudication.
2. Diff any new release tarball against the repo before upgrading; this package has no
   provenance signal to lean on.
3. Watch for a private-address fetch refusal option; adding one would close residual risk 1
   and justify re-grading upward.
4. Re-run our scanner after any heuristics-corpus bump; digest recorded in section 8.
5. Re-vet at 90 days or on the next release, whichever comes first.
