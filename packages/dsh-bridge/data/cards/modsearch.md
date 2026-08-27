# Trust Report Card: @liustack/modsearch

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@liustack/modsearch` (web search, X search, and page fetch for models without native web access; engines: Firecrawl keyless, Antigravity CLI, Tavily, Exa, Grok CLI, local fetch) |
| Pinned subject | github:liustack/modsearch @ commit `1492d7b921dc526ccc21b65a3afbe91a7fbae12e` (package version 5.9.1) |
| npm integrity | `sha512-a7X2NcFIBFq3VLWjxPcMmTX4iPjcd0g1lZ1uFlxI9emJqffF59QVxPODgXHmDn/77yTs9zVfU55XdgxSHO84Ug==` (`registry.npmjs.org/@liustack/modsearch/5.9.1`, fetched 2026-08-26); registry `gitHead` equals the pinned commit |
| Provenance | npm attestation present (SLSA provenance via GitHub Actions trusted publisher) |
| License | MIT (LICENSE:1-3) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Clean, attested, and unusually well-guarded code whose entire business is sending your queries
and URLs to search providers - every destination is named here, credentials are only ever
existence-checked or user-configured keys, and SSRF defenses are exemplary - but the default
Firecrawl keyless mode sends queries and fetched URLs to a third-party cloud without per-use
consent and with no behavioral probe or cross-model review to lift the ceiling.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | HTTP engines post to exactly: Firecrawl `https://api.firecrawl.dev/v2/{search,scrape}` (src/providers/firecrawl.ts), Tavily `https://api.tavily.com/search`, Exa `https://api.exa.ai/search` (src/providers/{tavily,exa}.ts). Each accepts a user-configured baseURL override validated as http(s) at use time (src/providers/endpoint.ts:14-31). The local engine fetches whatever URL the agent hands it, behind the SSRF fence below. That is the complete egress set; grep of all literal URLs in src confirms it. | file:line above |
| Default cloud disclosure | With zero setup, searches AND page fetches run on Firecrawl's keyless tier: your query text and any URL the model chooses to fetch are sent to api.firecrawl.dev unauthenticated (src/providers/firecrawl.ts:76-87,146-163). Fetches carry explicit hygiene flags - maxAge 0, storeInCache false, TLS verification forced back on (firecrawl.ts:229-236) - but the disclosure itself is on by default, opt-out via `firecrawl.keylessFetch false` (firecrawl.ts:337-351, fail-closed parse at src/config.ts:218-230). Private/reserved targets are refused before anything leaves the machine (firecrawl.ts:209-225). | file:line above |
| SSRF fence (local engine) | Blocked hostnames include localhost forms and all three cloud metadata hosts; private/reserved IPv4+IPv6 ranges rejected including mapped forms; embedded credentials in URLs refused; DNS is resolved, every address checked, and the connection PINNED to the validated IP so rebinding cannot retarget mid-flight; every redirect hop re-validates and re-pins (src/providers/http/network.ts:24-100+, httpFetch.ts:11-16,60-90). | file:line above |
| Credential reads | Existence check ONLY on Grok's sign-in file `~/.grok/auth.json` - fs.existsSync, values never read, used solely to decide whether the grok CLI engine is available (src/providers/grok.ts:25-32). Engine API keys live where the user puts them in `~/.modsearch/config.json` (0600, atomic same-dir temp write, src/config.ts:463-490, dsh/index.js:712-720) and travel only as Bearer headers to their own provider. Config views are structurally scrubbed through layered redaction (src/config.ts:560-600). No .ssh, .aws, browser stores, OS keychains. | file:line above |
| Child processes | Spawns only CLIs the user already has for optional engines: antigravity/grok/agy invocations built as argv arrays with constructed prompts, run through spawnHidden wrappers that add windowsHide and nothing else (src/subprocess.ts:3,36; src/util/spawnHidden.ts; dsh/spawnHidden.js). Grok runs in a throwaway scratch cwd with an output JSON-schema contract and an instruction not to touch files (src/providers/grok.ts:63-88). The settings card route spawns this package's own CLI for `doctor --json`, bounded at 20s (dsh/index.js:756-776,806). No dynamic exec anywhere in shipped code (grep clean). | file:line above |
| Web routes | One route, `/modsearch/config` (GET summary, POST one-card submission), fenced by the same loopback-Host + Origin/Sec-Fetch-Site check pattern dsh applies to its own /api; reads are refused as hard as writes (dsh/index.js:841-864,878-884). POST bodies capped at 64 KB (index.js:894-900). The browser half never sees an API key (dsh/client.js:5-10). | file:line above |
| Skill launcher | skills/modsearch/scripts/run.sh runs `npx --yes --package @liustack/modsearch@<PINNED>` with the version stamped exact by release tooling (run.sh:116,294; scripts/stamp.mjs:67-94 asserts the pin), so the npm channel serves the audited semver, not latest. | file:line above |
| Telemetry | None. No analytics/beacon/metrics code in src/, dsh/, or scripts/ (negative grep, zero hits). evals/run.mjs spends real quota but never runs in CI and ships outside the runtime path (evals/run.mjs:1-8). | negative claim, scope stated |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 235 findings (1 critical, 224 high, 5 medium, 5 low), machine grade F. The high
count is dominated by NET matches against example.com test fixtures and HOOK matches on the
word npx inside help text and the pinned launcher. Adjudication:

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET "metadata.google.internal" src/providers/http/network.test.ts:113 | False positive: a unit test asserting the blocklist REJECTS the metadata host. The production blocklist is the finding-worthy fact, and it is kept below as a positive control. | excerpt read |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| MSR-NET-1 | medium | src/providers/firecrawl.ts:76-87,146-163,337-351 | Keyless-by-default sends queries/URLs to a third-party cloud before any explicit consent moment. Documented loudly (README "Free out of the box"), fail-closed opt-out exists; still the defining privacy event of installing this plugin. |
| MSR-CRED-1 | low | src/providers/grok.ts:25-32 | Reads existence of another vendor's auth file. Values untouched; cannot leak what is never opened. |
| MSR-HOOK-1 | low | package.json:18 `prepublishOnly: pnpm build`; scripts/stamp.mjs | Publisher-side build hook; no install-time hooks exist (grep verified across package.json files). |
| MSR-SKILL-1 | low | skills/modsearch/scripts/run.sh:116,294 | npx fetches from npm at first skill invocation. Exact-pinned (run.sh:25), standard npm trust model. |
| MSR-EXEC-1 | low | src/subprocess.ts:36; src/providers/{grok,antigravity}.ts | Spawns third-party agent CLIs with `--always-approve`-style flags on the grok route (grok.ts:82) because headless runs stall otherwise; scratch-cwd containment and schema-constrained output reduce blast radius, but a signed-in grok CLI is a powerful program to aim at a prompt. |

### Scanner noise dismissed (with scope)

- NET highs: ~180 hits on example.com/a.example/b.example fixtures in *.test.ts plus docs URLs.
- HOOK family: the word npx in doctor hints (dsh/index.js:156,228,312), stamp regex strings,
  and run.sh comments; the executable lines are the pinned invocations kept above.
- EXEC family: none survived review in shipped code; subprocess spawning goes through the two
  audited wrappers only.
- CRED mediums in src/dshPlugin.test.ts and src/testing/helpers.ts: test env manipulation and
  fixture writes under fake HOME dirs.

### Negative claims and what was searched

Searched all of src/, dsh/, skills/, scripts/, evals/ (81 files scanned; production sources
read): no eval/new Function/vm; no base64-decode-execute blobs; no reads beyond the single
auth-file existence check and the plugin's own config/state; no telemetry endpoints; no timers
beaconing; no install lifecycle hooks; no egress host outside {api.firecrawl.dev, api.tavily.com,
api.exa.ai} plus user-overridden base URLs and locally-fetched pages.

## 5. What we could not check

- **Shipped dist bundle vs src.** npm publishes vite-built dist/main.js. Attestation binds the
  tarball to this repo via GitHub Actions, and gitHead matches, but we did not rebuild and
  byte-compare dist against src at this commit.
- **Behavioral probe.** No sandboxed load/invoke/idle-soak ran (pipeline S4 unavailable).
- **What Firecrawl does server-side** with keyless-tier queries, IPs, and scraped content is
  outside this artifact; the plugin can only disclose honestly, which it does in tool warnings
  ("Fetched through Firecrawl in the cloud...", firecrawl.ts:277).
- **Third-party CLIs' own behavior** (antigravity, grok): modsearch aims them at prompts; what
  they do afterward is their audit.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Scanner F vs manual C recorded;
the gap is fixture/test volume and documentation-string noise, documented in section 4.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/liustack/modsearch /tmp/ms-audit
cd /tmp/ms-audit && git rev-parse HEAD   # expect 1492d7b921dc526ccc21b65a3afbe91a7fbae12e

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ms-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rhoE "https?://[a-zA-Z0-9./_-]+" src | grep -v example | sort -u   # egress set
sed -n '25,32p' src/providers/grok.ts            # auth.json: existsSync only
sed -n '209,236p' src/providers/firecrawl.ts     # private-target refusal + cache/TLS flags
sed -n '841,864p' dsh/index.js                   # loopback/origin fence
grep -rn "eval(\|new Function\|vm\." src dsh     # dynamic exec: none

# 4. Confirm the published artifact matches this commit
npm view @liustack/modsearch@5.9.1 dist.integrity dist.attestations
#   expect sha512-a7X2NcFI...84Ug== and a slsa-dev/provenance predicate
```

## 8. Methodology and pinned inputs

- Subject: git commit `1492d7b921dc526ccc21b65a3afbe91a7fbae12e` (shallow clone at reference/audits/modsearch)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...21041f3`
- Review: full read of src/providers/{firecrawl,grok,tavily,exa,endpoint,httpFetch,http/network}.ts, src/{config,subprocess,util/spawnHidden}.ts, dsh/index.js (951 lines), dsh/client.js head, dsh/spawnHidden.js, skills/modsearch/scripts/run.sh, scripts/stamp.mjs, evals/run.mjs head, package.json, cordis.patch.yml, README
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no hostile indicators; the one medium is the product's own default cloud
  disclosure; pipeline ceiling (no probe, single reviewer) holds the grade at C despite
  verifiable provenance.

## 9. Strengths

1. Best-in-section SSRF defense: hostname blocklists, full private-range coverage, credential-in-
   URL refusal, DNS resolution with IP pinning, and per-hop redirect revalidation
   (src/providers/http/network.ts).
2. Cloud-fetch hygiene flags most integrations never bother with: maxAge 0, storeInCache false,
   skipTlsVerification explicitly re-enabled false (firecrawl.ts:229-236).
3. Fail-closed config parsing everywhere it matters: malformed keylessFetch counts as off
   (firecrawl.ts:344-350), invalid baseURL throws with masked echo (endpoint.ts:20-30).
4. Credential discipline: keys written 0600 atomically, structurally scrubbed from any rendered
   view, and the one foreign auth file is existence-checked only (config.ts:463-490,
   config.ts:560-600, grok.ts:25-32).
5. Verifiable supply chain: SLSA attestation, gitHead match, exact-pinned skill launcher, and a
   security doc that names its own limits.

## 10. Residual risks

1. Installing this plugin means your model's searches and fetched URLs go to Firecrawl by
   default. Opt out with `modsearch config set firecrawl.keylessFetch false` if that matters.
2. The grok route runs a signed-in third-party agent CLI with approvals auto-accepted; treat
   X-search results as untrusted input to a powerful local program.
3. User-overridden baseURLs move a whole engine's traffic (including its Bearer key) to wherever
   you point it; the validation checks shape, not destination wisdom.
4. Published dist not rebuilt-and-compared; provenance rests on the npm attestation chain.
5. Single-reviewer audit; no behavioral probe.

## 11. Re-verify steps

1. Re-run step 7 against current HEAD; any new literal host, new lifecycle hook, or change to
   the network.ts guard list requires re-adjudication before this grade carries forward.
2. Diff `npm view @liustack/modsearch dist.integrity` against the pinned integrity; mismatch =
   new revision required.
3. On upstream bumps re-check: run.sh PINNED stamp (stamp.test.mjs enforces it upstream),
   firecrawl.ts disclosure flags, and the endpoint allowlist implied by section 3.
