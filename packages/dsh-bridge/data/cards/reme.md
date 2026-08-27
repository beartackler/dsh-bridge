# Trust Report Card: reme (agentscope-ai/reme)

## Header

| Field | Value |
|---|---|
| Plugin family | ReMe memory layer (`reme-ai` Python service + `@agentscope-ai/reme` TypeScript DSH plugin + Claude Code / Hermes integrations + skills) |
| Pinned subject | github:agentscope-ai/reme @ commit `15d12be6b678ff11fbb16d93c70c7082d47816f2` |
| Upstream HEAD at audit | 2026-08-26 16:16:26 +0800 ("fix(index): tolerate invalid text encoding (#490)") |
| License | Apache-2.0 (LICENSE; pyproject.toml license field) |
| Repo age / activity | 3.3k stars (discovery snapshot 2026-08-19); very active, multiple merges daily; authored by the EconML team of Alibaba Tongyi Lab (integrations/claude_code/reme/.claude-plugin/plugin.json author block) |
| Audit method | dsh-bridge static scanner v0.1.0 (rulesDigest `9cc04224...`) + manual adversarial review of all findings. No behavioral probe (S4), no dual-model pass (S5). |
| Verified at | 2026-08-26T09:15Z |
| Revision | 1 |

## Verdict in one sentence

Use with awareness: zero critical or credential findings and an unusually clean egress map - every network path goes to a loopback service you run or endpoints you configure - but auto-memory ships your session content to that local service by design, its inner agent can call paid LLM APIs, and the incomplete pipeline caps the grade regardless.

## Grades

### Overall: C

Ceilings applied:

1. Full-pipeline ceiling C (docs/trust/pipeline-architecture.md, S6): the sandboxed behavioral probe and the dual LLM adversarial passes did not run for this card. Nothing found here is hostile; the ceiling is procedural, not suspicion-driven.
2. The mechanical scanner grade is F by raw count (0 critical / 258 high / 2 medium / 2500 low across 171 files, 2760 findings). Section Evidence adjudicates: 1367 highs are funding/donation URLs inside package-lock files, 1134 lows are minified-lockfile heuristics, and the entire CRED family (the strongest hostility signal the scanner has) fired zero times.

### Per-surface grades

| Surface | Grade | Basis |
|---|---|---|
| DSH plugin (`packages/typescript/src/dsh/`, wired via `packages/typescript/dsh/cordis.patch.yml`) | B | Registers one provider tool group plus settings section; sole egress is POST `${endpoint}/{job}` where endpoint defaults to `http://127.0.0.1:2333`, overridable via settings or `REME_URL`/`REME_HOST`/`REME_PORT` env (config.ts:54,81-86); endpoint must parse as absolute http(s) URL (assertEndpoint, config.ts:147-157). No credentials read anywhere in the TypeScript package. |
| Session capture (`dsh/runtime.ts`, `dsh/messages.ts`) | B | Hooks `session/event` and buffers completed turns, sending `{role, text}` message payloads to the local ReMe service on a turn-count/day-boundary schedule (runtime.ts:88-100,103-135); plugin-authored messages are excluded from capture (messages.ts captureMessage source-kind filter, lines 21-24). This is the documented product: conversation memory. |
| Python service core (`reme/`) | B | FastAPI/uvicorn server bound to `127.0.0.1:2333` by default (constants.py:5-7, http_service.py:40,81); outbound calls go to user-configured LLM/embedding endpoints (example.env points at DashScope-compatible URLs), arxiv.org/HuggingFace paper fetchers with mirror overrides (utils/arxiv.py:15-17), and an opt-in outbound proxy component whose ssh variant publishes only on loopback (components/outbound_proxy/ssh_http.py:76,216). |
| Claude Code integration (`integrations/claude_code/reme/`) | B | Stop hook reads ONLY `session_id` from stdin and hands it to the local MCP server; the server resolves the transcript on disk itself (hooks/auto_memory.py:9-13, main() at 137-160); double-fork detaches so stopping is never blocked (auto_memory.py:126-134). MCP endpoint fixed to `http://127.0.0.1:2333/mcp` (.mcp.json). |
| Inner agent machinery (`reme/components/agent_wrapper/cc_agent_wrapper.py`) | B | Auto-memory drives an inner coding agent via claude-agent-sdk (imports at lines 17,143,444) reading your Claude session transcripts from disk (steps/evolve/auto_memory_cc.py:84-117). Powerful, disclosed in docstrings; consumes your API quota. |
| Bundled skills (`skills/`) | B | dingtalk-message posts to api.dingtalk.com/oapi.dingtalk.com using tokens you store via its own CLI (scripts/dingtalk.py:204-228); serper-search documents user-key auth against google.serper.dev; tushare scripts read `TUSHARE_TOKEN` from env or local token file (stock_data_demo.py:11-12). All are opt-in tools, not ambient behavior. |
| Optional plugins + website (`plugins/auto-fin/`, `website/`) | B | auto-fin fetches public cls.cn market data only when installed (src/reme_auto_fin/data.py:14); Next.js website talks to `NEXT_PUBLIC_REME_API_URL` defaulting to loopback (app/api.ts:17-19) with open-redirect-safe return-path validation (chatgpt-auth.ts:62-73 rejects non-relative returns); Cloudflare worker does image optimization only (worker/index.ts:35-60). |

## What this plugin family can do (capability summary)

- Network egress: everything targets either the loopback ReMe service you start, LLM/embedding providers you configure (key names `LLM_API_KEY`/`EMBEDDING_API_KEY` etc., consumed via `${VAR}` interpolation in config/default.yaml:735,752), arxiv.org/huggingface.co for the optional paper pipeline, or skill-specific endpoints you invoke deliberately. Zero telemetry, analytics, or crash reporting exists anywhere in the repo (grep for posthog/sentry/analytics: no hits).
- Credential access: none. The scanner's CRED family never fired across 2760 findings. Keys live in env vars or the DSH credentials service and flow only to the endpoint they authenticate.
- Process execution: the inner memory agent (via SDK), `pip` through the plugin manager (plugin_cli.py:179-181), self-relaunch for `reme start` (common_utils.py:146-170), and the SSH-tunnel proxy component if configured.
- Writes: confined to the ReMe workspace (Markdown notes, dialog stores) plus its own log directory under the plugin root (auto_memory.py:_log).
- Data movement by design: conversation turns (user+assistant text) leave the agent process for the local ReMe service, and the service may forward context to your configured LLM when synthesizing memory. The payload stays on-machine unless your own model routing sends it off.

## Evidence

Mechanical scan (verbatim): target `reme`, scanner 0.1.0, rulesDigest `9cc04224b1dc7e81...`, 171 files scanned / 429 skipped, families present EXEC NET OBFU HOOK (CRED absent), grade F, score 0. Raw JSON retained at `reference/audits/scan-7b-reme.json`.

Adjudication of every finding class:

1. NET-007 high (249): donation/funding URLs (`opencollective.com`, `tidelift.com`, `patreon.com`) inside `packages/typescript/package-lock.json` and `website/package-lock.json`. Metadata strings; no code path fetches them.
2. OBFU-012 low (1133): minification heuristics over lockfiles and vendored web assets; zero hits outside lockfiles after filtering.
3. NET-008 (1367 mixed): documentation/homepage URLs (docs.agentscope.io, reme.agentscope.io status-page link at packages/typescript/src/dsh/status-page.tsx:507, registry mirrors in skill package.json).
4. NET-001 high (6 real sites): github-pages static-site generator fetching its own content manifest (github-pages/src/main.js:371,453), the DSH client's loopback job POSTs (core/client.ts:192), website-to-local-API calls (website/app/api.ts:50,120), and the worker's asset handler (website/worker/index.ts:36). Each verified against its URL construction; all resolve to user-owned origins.
5. EXEC family (3): a shell comment containing "eval" (benchmark/pibench/run_persona.sh:275), a repo test script using execFile (packages/typescript/scripts/test-package.mjs:1), and a dynamic import of a locally built worker in website tests (website/tests/rendered-html.test.mjs:7). None ship in a runtime path.
6. HOOK-002 medium: `"prepare": "npm run build"` in packages/typescript/package.json:62 - standard npm lifecycle building from source; installs nothing beyond declared deps.
7. OBFU-010 medium (single): `decodeURIComponent` in website/app/chatgpt-auth.ts:86 wrapped by try/catch returning null - defensive header decoding, not obfuscation.

The decisive negative evidence: no CRED findings at all, no `eval`/`new Function` in shipped code, no telemetry endpoints, and every fetch site accounted for above.

## What we could not check

- Runtime behavior of the full memory pipeline (turn capture -> service -> inner agent -> note write) under real sessions; static review plus docstring claims only.
- PyPI artifact equality: the audited commit was compared against source, not against the published `reme-ai` wheel; provenance is unverified end-to-end (this alone keeps the card at pipeline-ceiling C).
- The `reme-ai-studio` optional web extra (pyproject [project.optional-dependencies].web pins `reme-ai-studio==0.4.1.8`): closed dependency not present in-repo, not audited.
- Behavior of the DingTalk/Serper/Tushare skills against live APIs; reviewed statically.
- Whether the DSH scheduler's dream cron behaves correctly across timezone edge cases (logic read, not executed).

## Reviewer disagreement

None recorded. Single-model manual adjudication; per the pipeline this card would require a second independent model pass before exceeding grade C.

## Verify this yourself

```bash
# Pin the subject
git clone --depth 1 https://github.com/agentscope-ai/reme reference/audits/reme
git -C reference/audits/reme rev-parse HEAD   # expect 15d12be6b678ff11fbb16d93c70c7082d47816f2

# Re-run the mechanical scan (expect grade F on raw counts; see Evidence)
node dsh-bridge/tools/scan/dist/index.js reference/audits/reme

# Spot-check the headline claims
sed -n '5,7p' reference/audits/reme/reme/constants.py                                  # loopback default host/port
sed -n '54p;81,86p' reference/audits/reme/packages/typescript/src/dsh/config.ts        # endpoint resolution
sed -n '189,196p' reference/audits/reme/packages/typescript/src/core/client.ts         # single POST transport
sed -n '9,13p' reference/audits/reme/integrations/claude_code/reme/hooks/auto_memory.py # session_id-only hook contract
grep -rni "posthog\|sentry\|telemetry\|analytics" reference/audits/reme --include='*.py' --include='*.ts' | grep -v lock | wc -l   # expect 0
grep -rn "eval(\|new Function" reference/audits/reme/packages/typescript/src | wc -l   # expect 0
```

## Residual risks (accepted by this grade)

1. Memory capture is always-on by default (`autoMemoryEnabled: true`, config.ts:23): every completed user/assistant turn flows into the local ReMe store unless you disable the setting. Privacy-sensitive sessions need explicit configuration.
2. Memory synthesis runs an inner agent that consumes your configured LLM API quota without per-call prompts (documented; cost, not exfiltration).
3. The service listens on loopback by default but any local process can reach it - there is no authentication on the ReMe HTTP/MCP endpoint; another local user or malware could read/write your memory store.
4. Published PyPI/npm artifacts were not byte-compared to this commit; marketplace installs float to whatever is latest.
5. The optional studio web bundle (`reme-ai-studio`) ships unaudited third-party code behind an extras flag.
6. Very young fast-moving upstream (multiple merges per day); findings stale quickly.

## Methodology and pinned inputs

Scanner: dsh-bridge tools/scan dist build, version 0.1.0, rulesDigest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`. Subject pinned by git commit SHA (fresh shallow clone). Manual review by one auditor covering every non-noise finding class, complete reads of both integration surfaces (DSH plugin, Claude Code hooks), and endpoint-by-endpoint adjudication of all fetch sites; all claims carry file:line anchors resolvable at the pinned commit. Grade semantics follow docs/trust/pipeline-architecture.md S6; caps applied: incomplete-pipeline ceiling C. Disclaimer: a grade is evidence-backed opinion over a pinned artifact, not a safety guarantee, and says nothing about versions other than the pinned commit.

## Revision history

| Rev | Verdict digest basis | Change |
|---|---|---|
| 1 | commit `15d12be6`, scanned and adjudicated 2026-08-26T09:15Z | Initial card. Overall C; per-surface grades as tabulated; zero CRED/critical findings confirmed; mechanical F fully attributed to lockfile metadata classes. |

Re-vetting triggers: any new egress endpoint outside the loopback/user-configured allowlist above, any telemetry introduction, a published-artifact provenance check (would lift the ceiling question), any change to the Stop-hook contract, or 90 days elapsed.
