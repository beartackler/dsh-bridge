# Trust Report Card: Q00/ouroboros

## 1. Header

| Field | Value |
|---|---|
| Plugin | `Q00/ouroboros` (`ouroboros-ai` on PyPI; Agent OS for interview-driven spec refinement, MCP tools, multi-runtime orchestration; ships Claude Code / Codex / OpenCode / DSH plugin surfaces) |
| Pinned subject | github:Q00/ouroboros @ commit `c80144781ac3d87fe7a7d40ab93b14ddf15a191c` (default branch `main`, head at audit time; last commit 2026-08-26 "fix(install): tolerate piped execution and older schemas #2277") |
| Provenance | Git tree audited directly; PyPI channel NOT bound to this commit at runtime (see section 5 and OURO-SUPPLY-1) |
| License | MIT (LICENSE; pyproject classifier "License :: OSI Approved :: MIT License") |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: no malicious indicators, no obfuscation, no dynamic code execution in shipped
production code, and unusually rigorous telemetry discipline, but the product phones home by default
(installer ping plus runtime PostHog events, both documented and opt-out-gated), session hooks reach
pypi.org before consent, the uvx launch channels float to whatever PyPI serves at launch time rather
than the audited commit, and the execution surface intentionally spawns more than a dozen third-party
agent CLIs, with `bypassPermissions` as the default fallback on the OpenCode backend.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (runtime) | Telemetry batches POST to `https://us.i.posthog.com/batch/` (src/ouroboros/telemetry.py:45, 957-973), gated by `is_enabled()` (telemetry.py:471-480) which honors `DO_NOT_TRACK`, `OUROBOROS_TELEMETRY=0`, and `config.yaml telemetry.enabled: false`; invalid/unreadable config fails closed (src/ouroboros/config/loader.py:1553-1566). Update checks GET `https://pypi.org/pypi/ouroboros-ai/json` (scripts/version-check.py:150-151, src/ouroboros/mcp/update_notice.py:151-156, src/ouroboros/cli/commands/update.py:150). LLM calls go to the user-configured backend; built-in defaults are Anthropic, Google, OpenAI, OpenRouter base URLs (src/ouroboros/providers/litellm_adapter.py:75-78). Copilot model discovery GETs `api.githubcopilot.com` using the user's own `gh auth token` (src/ouroboros/copilot/model_discovery.py:140-175). | file:line above |
| Network egress (install time) | scripts/install.sh posts one anonymous install event to PostHog (host at scripts/install.sh:314, send at :831) and queries PyPI for the latest version (:872). Both are gated by `_telemetry_enabled()` (:413-444), which honors `DO_NOT_TRACK`/`OUROBOROS_TELEMETRY` and validates `~/.ouroboros/config.yaml telemetry.enabled` before sending; call sites gate at :676 and :756. Declared in TELEMETRY.md and the installer header comment (scripts/install.sh:127-130). | file:line above |
| Credential access | Reads its own `~/.ouroboros/{prefs.json,config.yaml,credentials.yaml,telemetry.json}` state; checks `~/.claude/mcp.json` existence plus a substring test for "ouroboros" (scripts/keyword-detector.py:117-123); reads specific env vars (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) to pass to the LLM client (litellm_adapter.py:730-738); provisions its own HMAC authority key file 0600 with O_NOFOLLOW and mode checks (src/ouroboros/providers/credential_authority.py:21-46). No `.ssh`, `.aws`, browser stores, OS keychain, or other harnesses' auth files anywhere in src/, scripts/, hooks/ (grep verified). | grep scope in section 4 |
| Lifecycle hooks (Claude Code plugin) | hooks/hooks.json registers three hooks: SessionStart runs scripts/session-start.py (update check, network-cached max once per 24h), UserPromptSubmit runs scripts/keyword-detector.py (pure-local prompt matching against ~/.claude/mcp.json + ~/.ouroboros state), PostToolUse Write/Edit runs scripts/drift-monitor.py (local filesystem stat only). All three fail open with visible stderr messages, resolve python3/python explicitly, and carry 5s/5s/3s timeouts. | hooks/hooks.json:1-45 |
| Child processes (core function) | Spawns third-party agent CLIs through 15+ adapter modules (claude_code_adapter.py, codex_cli_adapter.py, opencode_adapter.py, copilot_cli_adapter.py, gemini_cli_adapter.py, kiro_adapter.py, goose_cli_adapter.py, hermes_cli_adapter.py, zcode_cli_adapter.py, pi_llm_adapter.py, gjc_llm_adapter.py, dsh_acp_client.py, ourocode_acp_client.py, litellm proof worker). All use `asyncio.create_subprocess_exec` (argv array, no shell); example: claude_code_adapter.py:738-746 builds argv, encodes stdin up front, and constructs a dedicated child env. Permission modes come from a backend-neutral enum (src/ouroboros/sandbox.py) translated per adapter (src/ouroboros/claude_permissions.py:23-40); defaults are `default`/`acceptEdits` except the OpenCode backend, which falls back to `bypassPermissions` when config is absent or invalid (src/ouroboros/config/loader.py:772-789; model default at src/ouroboros/config/models.py:688-689). | file:line above |
| Dynamic code execution | None in shipped production code. No `eval(`, `exec(`, `__import__`, `compile(`, `new Function`, `vm.*` in src/, scripts/, hooks/, skills/, integrations/ production paths. Scanner EXEC hits land in dev/test material only: tests/unit/dashboard_web/page_runtime_harness.cjs:51 (vm harness executing the project's own generated dashboard page), scripts/live-dsh-interview.cjs:10 (manual Playwright demo script, referenced by nothing in install/hooks/MCP), tests/canonical/evidence/** fixture copies. The MCP server additionally maintains a string denylist (`__import__`, `eval(`, `exec(`, ...) validating tool arguments (src/ouroboros/mcp/server/security.py:512-520). | grep + manual read |
| Filesystem writes | State under `~/.ouroboros/**` (telemetry.json written atomically with owner-visible temp+replace, telemetry.py:571-587); project workspaces via spawned agents under the engine's sandbox-class policy; dashboard binds 127.0.0.1 by default (src/ouroboros/dashboard_web/__main__.py:28). No writes into other tools' config directories found. | file:line above |
| Telemetry content | Event names and coarse properties only. `capture()` drops any event not on the four-event disclosed table and any property outside that variant's literal allowlist before queuing (src/ouroboros/telemetry.py:1033-1091, allowlists at :302-409); caller-controlled tool/job/command names are folded to fixed literals when not in the audited static sets (telemetry.py:1101-1151, 1192-1251, 1254-1280); strings capped at 200 chars, structured values rejected (:452-454, 867-883); identity is a random UUID validated by regex, fail-closed when not durably persisted (:487-559, 1062-1076). First-run notice prints before collection may count anything and fails toward disclosure on corrupt state (telemetry.py:1283-1386). Contract doc: TELEMETRY.md (append-only changelog, counting rule, opt-outs). | file:line above |

The DSH integration (integrations/dsh-plugin/cordis.patch.yml) inserts one `@deepseek-ai/dsh-mcp-client`
row spawning `uvx --from 'ouroboros-ai[mcp]' --with 'mcp==2.0.0' ouroboros mcp serve` over stdio. The
child env layer is an explicit allowlist forwarding exactly two credentials (`ANTHROPIC_API_KEY`,
`DEEPSEEK_API_KEY`, lines 85-86) on top of dsh-subprocess's scrubbed parent env, with blank-string
semantics so unset host variables stay unset. The Claude Code `.mcp.json` similarly launches via
`uvx --isolated --python >=3.12 --from ouroboros-ai[mcp]`.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 53 findings (2 critical, 25 high, 4 medium, 22 low), machine grade F, families
CRED/EXEC/HOOK/NET; 109 files scanned, 1679 skipped, 1201714 bytes. Manual adjudication below;
this is a Python-first repository, so most JS-oriented rules fired on metadata and test material.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 "enumerates entire environment" x2, src/ouroboros/opencode/plugin/ouroboros-bridge.test.ts:55,58 | False positive. Test fixture backing up and restoring `process.env` around Bun tests. Production code never enumerates env: the only env reads are specific named keys (grep `Object.keys(process.env)` across src/: zero production hits). | grep verified |

### Production-code findings kept (documented behavior or real residual risk)

| ID | Severity | Location | Note |
|---|---|---|---|
| OURO-NET-1 | medium | scripts/install.sh:314, 676, 756, 831 | Install-time anonymous PostHoc ping. Opt-out-gated (`DO_NOT_TRACK`, `OUROBOROS_TELEMETRY`, persisted config), documented in TELEMETRY.md and installer header. Still default-on egress at install time; charter prefers opt-in. |
| OURO-NET-2 | medium | src/ouroboros/telemetry.py:44-49, 957-991 | Runtime telemetry to us.i.posthog.com, default on with first-run notice. Exceptionally disciplined allowlist enforcement (see table in section 3), but default-on remains a PRIV-family finding per the charter. |
| OURO-SUPPLY-1 | medium | .mcp.json:1-16; integrations/dsh-plugin/cordis.patch.yml:60-70; scripts/install.sh:1274-1331 | Launch channels resolve `ouroboros-ai` from PyPI with NO version pin (`uvx --from ouroboros-ai[mcp]`). What executes is PyPI-latest at launch time, not the audited commit. A registry compromise or hostile new release flows straight into every MCP session. Pinning is available only as a user override (cordis.patch.yml comment). This breaks end-to-end provenance and drives the grade cap. |
| OURO-HOOK-1 | medium | hooks/hooks.json SessionStart; scripts/session-start.py:11-31; scripts/version-check.py:133-152 | Every Claude Code session start triggers a pypi.org version fetch (24h-cached) before any user action. Local-only failure modes, but it is recurring pre-consent network contact. |
| OURO-EXEC-1 | medium | src/ouroboros/config/loader.py:772-789; src/ouroboros/config/models.py:688-689 | On OpenCode backends the effective permission mode falls back to `bypassPermissions` when neither env nor valid config exists. Combined with the product's purpose (autonomous execute/evolve loops spawning coding CLIs), a misconfigured OpenCode setup auto-approves edits. Explicit warning exists at realization time (sandbox.py UNRESTRICTED contract, claude_permissions.py:41-43 logs `permissions.bypass_activated`). |
| OURO-EXEC-2 | low | src/ouroboros/gjc_bridge/index.ts:1, 33-45 | GJC bridge `execFile`s the product's own `ouroboros dispatch` CLI on inputs matching the `ooo` prefix. Argv-form, no shell, depth-guarded, 6h timeout. Documented bridge behavior. |
| OURO-CRED-1 | low | scripts/keyword-detector.py:117-141; src/ouroboros/providers/litellm_adapter.py:730-738 | Reads `~/.claude/mcp.json` (existence + substring only) and named API-key env vars passed to the LLM client. Values forwarded only to the configured LLM endpoint. No secret is logged or transmitted elsewhere (telemetry allowlists cannot carry them). |
| OURO-CRED-2 | low | integrations/dsh-plugin/cordis.patch.yml:85-86 | Forwards two named host credentials into the spawned MCP child. Explicit two-name allowlist on top of dsh-subprocess's credential-scrubbing parent env; not a wildcard passthrough. |
| OURO-NET-3 | low | scripts/version-check.py:150-151; src/ouroboros/cli/commands/update.py:150; src/ouroboros/mcp/update_notice.py:153-156; scripts/install.sh:872 | Read-only GETs to pypi.org for version/update notices. |
| OURO-NET-4 | low | src/ouroboros/providers/litellm_adapter.py:75-78; src/ouroboros/copilot/model_discovery.py:140-175 | Vendor-default LLM endpoints and GitHub Copilot models API (using the user's own gh token). All user-configured-or-documented destinations. |

### Scanner noise dismissed (with scope)

- 17 NET-007 highs on `$schema`/`$id` JSON-schema URLs (json-schema.org, anthropic.com marketplace
  schema, self-hosted schema ids) and homepage/repository metadata: parsed-as-metadata strings,
  never fetched.
- 3 NET-007 highs on install.sh:963-967: printed advisory text containing URLs ("curl -LsSf
  https://astral.sh/...", python.org download hints). Advice strings, not executed fetches.
- NET-007 docs/examples/mcp-config.yaml:62: commented-out example URL.
- EXEC-003/EXEC-004/EXEC-005/HOOK-006/HOOK-007 highs in tests/unit/dashboard_web/page_runtime_harness.cjs,
  tests/canonical/evidence/** (committed evidence fixtures from issue #1450), tests/e2e config:
  test/dev material, never shipped or auto-executed.
- EXEC-008 scripts/live-dsh-interview.cjs: manual demo harness requiring Playwright lazily from an
  env-named module; not referenced by install.sh, hooks.json, plugin manifests, or MCP configs (grep verified).
- HOOK-005 live-dsh-interview.cjs:25 / HOOK-006 harness setTimeout stub: same dev/test scope.
- NET-008 lows x22: github.com/kiro.dev/pypi.org/docs.github.com URLs in package metadata, help text,
  and error messages.

### Negative claims and what was searched

Searched all of src/, scripts/, hooks/, skills/, integrations/, tools/, tests/ (109 files scanned by
tool; production files additionally read): no dynamic code execution in production code (all
eval/exec/vm hits are test harnesses, the MCP argument denylist string table at
src/ouroboros/mcp/server/security.py:512-520, and a regex pattern in auto/seed_preflight.py:427);
no base64/hex blobs decoded then executed (regex sweep for 200+ char encoded runs: zero hits); no
obfuscation markers (plain-language identifiers throughout, extensive rationale comments); no reads
of `.ssh`, `.aws`, OS keychains, or browser profiles; no `Object.keys(process.env)` enumeration in
production; no timers or deferred beacons beyond the documented telemetry daemon queue and 24h
version cache; no npm lifecycle hooks (Python package; installer runs no postinstall network step
beyond the gated ping); dashboard and TUI bind loopback by default.

## 5. What we could not check

- **The executed artifact vs this tree.** All launch channels resolve `ouroboros-ai` from PyPI
  unpinned (OURO-SUPPLY-1). We did not build a wheel from commit `c8014478` and diff it against the
  PyPI sdist/wheel. Until someone reproduces that comparison, the audited source and the running
  bytes are connected only by release-process goodwill.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  not available here). Static review covered hooks, egress, credentials, and spawn surfaces but
  cannot rule out environment-dependent behavior across 15+ backend integrations.
- **Runtime dependencies.** 12 core deps with bounded ranges plus uv.lock; transitive advisories not
  joined against a pinned OSV snapshot. LiteLLM, httpx, pydantic resolved on the user's machine.
- **Third-party agent CLIs' own behavior** (claude, codex, opencode, copilot, gemini, kiro, goose,
  hermes, pi, zcode, gjc, grok, antigravity): ouroboros hands them prompts and workspace access;
  what they do afterward is outside this artifact. SECURITY.md states this boundary plainly.
- **The verify-command omission mechanism end-to-end.** The headline anti-cheating design (worker
  contracts omit verify commands/expected outputs; plugin.json itself discloses a residual
  literal-over-five-encodings redaction gap tracked in a public issue) was read at the module map
  level (orchestrator/evidence/, atomic_prompt_builder.py) but not exhaustively traced.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner disagreed with the manual
verdict (machine F vs adjudicated C); both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Q00/ouroboros /tmp/ouroboros-audit
cd /tmp/ouroboros-audit && git rev-parse HEAD   # expect c80144781ac3d87fe7a7d40ab93b14ddf15a191c

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ouroboros-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "eval(\|exec(\|__import__\|vm\." src/ouroboros --include='*.py' | grep -v test   # dynamic exec: none in prod
grep -rhoE 'https?://[a-zA-Z0-9._-]+' src/ouroboros scripts | sort | uniq -c | sort -rn   # egress: posthog, pypi, vendor APIs
sed -n '413,444p' scripts/install.sh            # installer telemetry gate (opt-out honored)
sed -n '1054,1091p' src/ouroboros/telemetry.py  # capture(): event+property allowlists enforced
cat .mcp.json                                   # NOTE: unpinned uvx channel (OURO-SUPPLY-1)
sed -n '772,789p' src/ouroboros/config/loader.py  # OpenCode bypassPermissions fallback (OURO-EXEC-1)

# 4. Confirm the hooks do what the card says
cat hooks/hooks.json                            # 3 hooks, fail-open, 5s/5s/3s timeouts
```

## 8. Methodology and pinned inputs

- Subject: git commit `c80144781ac3d87fe7a7d40ab93b14ddf15a191c` (shallow clone refreshed to upstream main at reference/audits/ouroboros, 2026-08-26)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of hooks/hooks.json, scripts/session-start.py, scripts/keyword-detector.py, scripts/drift-monitor.py, scripts/version-check.py, scripts/install.sh (telemetry + install paths), scripts/mcp-serve.sh, scripts/live-dsh-interview.cjs, src/ouroboros/telemetry.py (1412 lines), src/ouroboros/config/loader.py (telemetry + permission-mode resolvers), src/ouroboros/config/untrusted_env.py, src/ouroboros/config/models.py (permission defaults), src/ouroboros/sandbox.py, src/ouroboros/claude_permissions.py, src/ouroboros/providers/{litellm_adapter,credential_authority,claude_code_adapter}.py, src/ouroboros/copilot/model_discovery.py, src/ouroboros/mcp/{update_notice,server/security}.py, src/ouroboros/plugin/firewall.py, src/ouroboros/gjc_bridge/index.ts, src/ouroboros/opencode/plugin/ouroboros-bridge.ts, src/ouroboros/dashboard_web/{__main__,daemon}.py, integrations/dsh-plugin/cordis.patch.yml, .mcp.json, .claude-plugin/*.json, skills/ralph/SKILL.md, README.md, SECURITY.md, TELEMETRY.md
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero critical/high findings survive adjudication in production code; kept set is 5 medium + 5 low, all documented-but-real behaviors. B band requires verifiable provenance end to end; OURO-SUPPLY-1 (unpinned PyPI launch channel) breaks subject-to-artifact binding and default-on telemetry breaches the charter's opt-in preference, so the grade caps at **C** (use with awareness).

## 9. Strengths

1. Telemetry privacy engineering is the best this audit line has seen: disclosed event table enforced mechanically in `capture()` (src/ouroboros/telemetry.py:1054-1091), caller-controlled names folded to fixed literals before transport (:1101-1151, :1192-1280), identity fail-closed (:1062-1076), first-run notice failing toward disclosure (:1341-1386), and the shell installer independently reimplements every opt-out gate rather than trusting the app (scripts/install.sh:413-444, 676, 756).
2. Treats cloned repositories as hostile: the `.env` trust boundary denylist (src/ouroboros/config/untrusted_env.py) blocks PATH, NODE_OPTIONS, every CLI-path override, permission-mode overrides, and package-manager redirects from project-dir env files, with per-key rationale comments citing the exact downstream sink.
3. Its own plugin system runs behind a firewall chokepoint with pre-invocation trust checks, a single confirmation gate, canonical tree hashing, symlink-escaping refusal, and hashed-output audit events (src/ouroboros/plugin/firewall.py:1-56).
4. Honest disclosure culture: TELEMETRY.md is an append-only contract with a fixed counting rule; SECURITY.md publishes severity classes and response SLAs; the plugin manifest itself discloses an unresolved redaction gap and links the public issue tracking it (.claude-plugin/plugin.json description).
5. Hygiene details done right: subprocess spawning is argv-form throughout, child environments are constructed rather than inherited wholesale, the authority key file is 0600 with O_NOFOLLOW and uid checks (credential_authority.py:21-46), hooks fail open loudly with bounded timeouts, and the dashboard binds loopback by default.

## 10. Residual risks

1. Supply chain: every shipped launch channel (`uvx --from ouroboros-ai[mcp]` in .mcp.json and the DSH bundle) floats to PyPI-latest at launch time. The audited commit is not what runs. Prefer overriding the row with a pinned version until upstream pins by default.
2. Default-on telemetry (installer ping + runtime PostHog), albeit disclosed, allowlisted, and trivially disabled. Organizations requiring strict no-phone-home need `DO_NOT_TRACK=1` set before first install, since the installer reads persisted config too late for the very first run's ping unless the env var precedes it.
3. SessionStart hook contacts pypi.org once per day per machine, pre-consent, on every Claude Code session.
4. On OpenCode backends, missing/invalid configuration degrades to `bypassPermissions` (loader.py:789): autonomous loops then edit without approval prompts. Set `OUROBOROS_AGENT_PERMISSION_MODE` explicitly if you run OpenCode.
5. The product's job is spawning powerful agent CLIs in loops (execute/evaluate/evolve/ralph) driven by workflow specs; SECURITY.md correctly warns that workflow files can invoke arbitrary tool calls through the configured runtime. Review seeds/workflows from untrusted sources.
6. Single-reviewer audit, no behavioral probe, and no wheel-vs-tree rebuild comparison; a cross-model pass and S4 probe could revise this grade in either direction.

## 11. Re-verify steps

1. Re-run step 7 above against current HEAD; any new literal hostname (especially non-vendor, non-pypi, non-posthog), any eval-family hit outside tests, or any new env-var read must be re-adjudicated before this grade carries forward.
2. Diff `.mcp.json` and integrations/dsh-plugin/cordis.patch.yml against this card: if a version pin appears in the uvx args, OURO-SUPPLY-1 downgrades and the C cap can be re-examined.
3. Watch hooks/hooks.json for a fourth hook or longer timeouts; watch scripts/session-start.py for any destination other than pypi.org.
4. Re-run the scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
5. If a behavioral probe becomes available, prioritize scenarios: load-only (hook-side effects), activate-configured (OpenCode permission fallback), invoke-surface (`ouroboros_execute_seed` with a workspace-write seed), idle-soak (telemetry queue drain timing).
