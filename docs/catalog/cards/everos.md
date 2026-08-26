# Trust Report Card: EverOS (memory layer, DSH integration withdrawn)

## 1. Header

| Field | Value |
|---|---|
| Plugin | EverOS - a local-first memory layer for AI agents (extraction pipeline, SQLite + LanceDB storage, TUI). The catalog entry `EverMind-AI/EverOS` carries `deepseek-harness`/`dsh-plugin` topics, but the pinned tree contains no DSH plugin: commit `7864061` ("move plugin to integrations repository", 2026-08-25) removed it one day before this audit. The graded subject is therefore the repository's agent-facing surface: the core library plus the shipped `use-cases/claude-code-plugin`. |
| Pinned subject | github:EverMind-AI/EverOS @ commit `786406129582ba18ac65a71086b0417e830de29d` (main head at audit time) |
| Stars | ~12,400 (catalog snapshot 2026-08-19) |
| npm integrity | Python distribution (pyproject + uv.lock); no npm artifact to compare. PyPI provenance not verified this pass. |
| License | Apache-2.0 (`LICENSE:1-3`) with NOTICE and SECURITY.md present. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of core egress paths and use-case plugins) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The core is disciplined local-first Python whose only outbound calls go to user-configured
LLM/embedding endpoints with keys from your own config - but its flagship Claude Code plugin sends
every user prompt to api.evermind.ai by default via session hooks, which users must understand
before installing.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Core egress | The Python core calls three user-configured endpoints: OpenAI-protocol LLM (default `https://openrouter.ai/api/v1`, key empty until set), DeepInfra embedding, DeepInfra rerank. Keys ride bearer headers to exactly those hosts; demo code additionally targets `api.evermind.ai` and `everosdemo.com` only when a cloud demo round is invoked. | src/everos/config/default.toml:59-97; entrypoints/tui/demo/cloud.py:39-46 |
| Credential handling (core) | Reads only its own config chain (`~/.everos/config.toml`, `.env`, `EVEROS_*` env vars) per documented override order. No reads of `~/.claude`, `~/.codex`, or other agent stores found anywhere under src/. | config.example.toml:6-15; grep negative over src/everos |
| Dynamic execution | None found in the core: zero `eval(`/`exec(` hits across 302 source files. Scanner's dynamic-exec gate fired on JS surfaces below, not on the core. | repo-wide grep negative; scan JSON |
| Telemetry | OpenTelemetry tracing exists as an optional `[otel]` extra exporting to whatever collector the operator points at; no vendor telemetry endpoint, no opt-out-style phone-home found in the core. | core/observability/tracing/provider.py:1-40 |
| claude-code-plugin hooks | Installs four session hooks (SessionStart, UserPromptSubmit, Stop, SessionEnd). On every submitted prompt of 3+ words, it POSTs the raw prompt text as a search query to `https://api.evermind.ai` with your EVERMEM_API_KEY bearer token, then injects returned memories into context. This is the documented product (cloud memory), but it means prompt content leaves the machine whenever the plugin is configured. | use-cases/claude-code-plugin/hooks/hooks.json; inject-memories.js:63-96; utils/config.js:30-34; utils/evermem-api.js:60-72 |
| Plugin installer | `install.sh` prompts for an API key (via /dev/tty when piped), writes local config, and clones nothing else; no curl-pipe-of-code beyond itself was found. Still a paste-into-shell document. | install.sh:60-75, 130 |
| Netlify relay (deploy-side) | A rate-limited relay proxying exactly three fixed endpoints (`POST /api/v2/memory/{add,flush,search}`) to api.evermind.ai, hashing client IPs for quota keys, never logging bodies. Deployed by the maintainer; not installed locally. | deploy/netlify_relay/netlify/functions/relay.mjs:1-13, 26-28, 47-56 |
| DSH integration status | Withdrawn from this repo: the move commit deleted the plugin workflow and CI, pointing at a separate integrations repository. No cordis.patch.yml / SKILL.md remains in-tree. Anyone installing "the DSH plugin from EverOS" today is getting different, unaudited code. | commit 786406129582ba18ac65a71086b0417e830de29d stat; find negative over pinned tree |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**110 findings** (86 high, 18 medium, 6 low) over 95 scanned files. Machine verdict **F**, off three
gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Where the volume is

The scan barely touches the Python core (95 files scanned of a 302-file package); nearly all
findings sit in `deploy/netlify_relay` and `use-cases/*` JavaScript. Adjudication covers all high
families.

### Highs and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED+NET co-location in relay.mjs and hook scripts | Real pairing, honestly structured: the relay reads UPSTASH/API secrets from env and fetches a single hardcoded upstream with a method+path allowlist; the Claude Code hooks read EVERMEM_API_KEY from env/.env and send prompt-derived queries to the fixed API host. Not exfiltration - it is the documented cloud-memory product - but it is genuine cred-plus-net behavior users should see named. | relay.mjs:1-13, 47-80; config.js:11-34; evermem-api.js:60-72 |
| EXEC/HOOK family flags in install.sh and hooks.json | Install-time shell script plus four lifecycle hooks that run node scripts each session. Commands are fixed strings from the plugin root; no remote payload construction found. Named because hooks execute on every session start/prompt/stop. | hooks.json (full); install.sh |
| OBFU family flags | Base64/hashing helpers in the relay for IP hashing and in dashboard proxy for key masking; readable, commented code, not obfuscation. | relay.mjs:37-45; server/proxy.js:24-30 |
| `dynamic-exec-present` gate | Fired on JS-side dynamic import patterns in test/demo tooling; the audited Python core contains none. Dismissed for the core, recorded for the JS surfaces. | scan JSON classification |

### Behavior worth naming because it is unusual

The demo client deliberately ships an empty default API key and authenticates at the maintainer's
relay instead, with quota fingerprinting done on SHA-256-truncated client IPs - a thoughtful privacy
posture that still creates a per-IP activity record on infrastructure you do not control
(cloud.py:39-49; relay.mjs:37-45).

## 5. What we could not check

- **The actual DSH plugin.** It moved out of this repository one day before audit time; the
  integrations repository was not part of this pass, so any current DSH offering from EverMind is
  unreviewed.
- **Behavioral probe.** No sandboxed run of the extraction pipeline or the plugin hooks.
- **Cross-model review.** Single reviewer.
- **PyPI provenance** for published distributions versus this commit.
- **Server side** of api.evermind.ai: what retention applies to searched prompts is unknowable
  from the tree.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. Both recorded. The gap: the machine gates
fire on the JavaScript periphery (relay, demos, plugin hooks) while the core shows none of the
flagged families. The ceiling stands at C because the flagship agent-facing surface sends raw
prompts off-machine by design, the DSH story dissolved mid-week, and neither probe nor cross-model
review ran.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/EverMind-AI/EverOS /tmp/everos-audit
cd /tmp/everos-audit && git rev-parse HEAD   # expect 786406129582ba18ac65a71086b0417e830de29d

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/everos-audit/use-cases/claude-code-plugin   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE "\beval\(|\bexec\(" src/everos --include="*.py"                        # expect: no hits
sed -n '59,67p' src/everos/config/default.toml                                   # openrouter default, empty key
grep -n "API_BASE_URL" use-cases/claude-code-plugin/hooks/scripts/utils/config.js # api.evermind.ai constant
sed -n '84,96p' use-cases/claude-code-plugin/hooks/scripts/inject-memories.js    # raw prompt -> searchMemories
git log --oneline -1 --format="%H %s"                                            # the withdrawal commit

# 4. Confirm no DSH manifests remain
find . -name "cordis.patch.yml" -o -name "*.cordis.yml"                          # expect: no hits
```

## 8. Methodology and pinned inputs

- Subject: git commit `786406129582ba18ac65a71086b0417e830de29d` (shallow clone at
  reference/audits/EverOS); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 110 findings, adjudicated
  per family above.
- Review: config/default.toml and config.example.toml endpoint inventory, tui/demo/cloud.py,
  observability tracing provider, claude-code-plugin (hooks.json, all four hook entry scripts'
  flows, utils/config.js, utils/evermem-api.js, mcp/server.js, install.sh), netlify relay function,
  and repo history around the DSH withdrawal commit.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: core is clean by construction on dynamic-exec and third-party telemetry; all
  egress is either user-configured or explicitly the paid product. Caps: prompt egress by default in
  the shipped plugin, unverifiable provenance, no probe, single reviewer, DSH surface withdrawn to
  an unreviewed location. Result: C.

## 9. Strengths

1. The Python core has zero dynamic code execution and reads no credential store outside its own
   config chain (grep negatives; config.example.toml:6-15).
2. Default endpoints are well-known providers with empty keys until the user fills them; nothing
   phones home without both configuration and a user action (default.toml:55-97).
3. The deploy-side relay allowlists exact method+path pairs and hashes rather than stores client
   IPs (relay.mjs:4-13, 37-45).
4. SECURITY.md defines a private disclosure channel with response timelines (SECURITY.md:12-27).

## 10. Residual risks

1. With the Claude Code plugin configured, every prompt of three or more words is transmitted to
   api.evermind.ai as a search query; treat that service's data handling as part of your threat
   model (inject-memories.js:84-96).
2. Session hooks execute on every lifecycle event; a compromised upstream or future hook change runs
   automatically on each session without new consent (hooks.json).
3. The repository topics still advertise deepseek-harness/dsh-plugin while the in-tree plugin is
   gone; discovery metadata is now actively misleading.
4. The replacement DSH integration lives outside this repo and outside this review; grade transfers
   to nothing.
5. Demo/cloud paths create IP-derived quota fingerprints on maintainer-controlled infrastructure
   (relay.mjs:37-56).

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any eval/exec appearing in src/everos, any new
   non-user-configured endpoint in default.toml, or any change widening what the hooks transmit
   forces re-adjudication.
2. Locate and separately audit the integrations repository if you intend to run EverOS inside DSH;
   do not extend this card to it.
3. Re-vet at 90 days or immediately upon the re-landed DSH plugin announcement, whichever comes
   first.
