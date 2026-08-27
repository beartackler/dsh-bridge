# Trust Report Card: hindsight (coding-agents / DeepSeek Harness integration)

| | |
|---|---|
| **Grade** | **C** (manual adjudication; raw scanner output: F on both source and published artifact) |
| **Plugin** | `@vectorize-io/hindsight-coding-agents` v0.4.2, from github.com/vectorize-io/hindsight (`hindsight-integrations/coding-agents`) |
| **Subject** | commit `c2486a2dc47223ecf4261c5ea12744782682f562` (default branch, 2026-08-25T15:35:12+02:00); npm tarball sha256 `eb6d4464eb07083fca6a8b8469cfb066d9850c63f517daa59686ba1469ff2cb0`, integrity `sha512-7BuStkCcEsImQX3dsyK1Qm1wr+7G19slqSt9VrHhMTPrYy2blL0LMLP9VQKX8TvQc55nKrycMNcjzVhSQEkSqw==` |
| **Audited at** | 2026-08-26 (UTC-4), shallow clone at `/reference/audits/hindsight` |
| **Scanner** | dsh-bridge scan v0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`. Source tree: 152 files / 1.1 MB scanned, 608 findings. Published tarball: 35 files / 7.3 MB, 519 findings. |
| **Method** | Static scan (S3 tool) on source tree AND on the published npm artifact, plus single-model manual adversarial review of the DSH entrypoint, installer, HTTP client, daemon, seed/survey engines, and history import. No behavioral probe (S4), no second model pass (S5), no signing (S8). |
| **Revision** | 1 |

> A grade is evidence-backed opinion over one pinned commit and one pinned tarball. It is not a safety guarantee and says nothing about other versions.

## Verdict in one sentence

Clean on manual review of the DSH integration: egress goes only to the user-configured Hindsight server (default `https://api.hindsight.vectorize.io`) carrying the product's documented payload (prompts, transcripts, git history), no telemetry, no obfuscation, no reads of other agents' credential stores, and the raw scanner F traces entirely to test fixtures, regex `.exec()` calls, and one bundled ajv `new Function`; graded C rather than B solely because the pipeline ceiling applies (no sandboxed probe, single reviewer) and because daemon mode executes an unpinned `uvx hindsight-embed@latest` download.

## What this plugin is

Long-term project memory for twelve coding agents, including a native Cordis/DSH entrypoint (`src/dsh.ts`). The DSH path registers four lifecycle listeners (`agent/session-start`, `agent/pre-step` with `prepend`, `agent/turn-stopping`, `agent/disposed`, `src/dsh.ts:385-398`) and eight `hindsight_*` knowledge tools onto `ctx.tools` natively (`src/dsh.ts:337-371`). It imports nothing from dsh; all host shapes are structural (`src/dsh.ts:20-23`). Memory lives in a user-configured Hindsight server (cloud, self-hosted, or a local daemon). Ships via npm with `files: ["skill","dist","cordis.patch.yml"]`; the profile patch layer mounts `@vectorize-io/hindsight-coding-agents/dsh` (`cordis.patch.yml:20-22`). License MIT, SECURITY.md with a private-advisory process.

## Focus questions

### Install hooks

No `preinstall`/`install`/`postinstall`/`prepare` scripts exist; the only lifecycle script is publisher-side `prepublishOnly` (`package.json:67-74`). The installer wires host config files (`~/.claude/settings.json`, `~/.codex/hooks.json`, `$DSH_HOME/cordis.patch.yml`, ...) idempotently, backs up every pre-existing file as `<file>.hindsight-backup` before first touch (`src/installer.ts:120-124, 1176-1181`), and `uninstall` removes only entries matching its own marker (`src/installer.ts:33-40, 1194-1201`). Reading past conversations off disk requires the explicit `--import-conversations` flag (`src/installer.ts:1280-1281`); plain install does not touch transcripts.

### Network egress

Complete runtime inventory; two fetch sites total:

| Endpoint | Site | Payload | Purpose |
|---|---|---|---|
| `cfg.apiUrl` (user-configured; default `https://api.hindsight.vectorize.io`, `src/core/config.ts:289`) | `src/core/hindsight.ts:215-219` via `fetchWithAuth`, the single signing site; 15 s abort cap at `:247` | recall queries, retains (transcripts, git docs, pages), bearer token in `Authorization` header (`:182-186`) | the memory API itself |
| `${baseUrl}/health` | `src/core/daemon.ts:57` | GET, no body | daemon readiness probe (daemon mode resolves baseUrl to `http://127.0.0.1:{port}`, `src/core/config.ts:287-288`) |

Every other URL literal is documentation (`docs.astral.sh`, `rustup.rs` at `src/installer.ts:893,899`) or schema `$id` metadata strings that are never fetched (`json-schema.org`, `raw.githubusercontent.com/ajv-validator/...` inside the bundled ajv in `dist/mcp-server.js`). The shipped `dist/dsh.js` contains exactly those two fetch sites and no others.

### Credential access

- Own config only: `~/.hindsight/coding-agent.json` holds `apiToken` (`src/core/config.ts:22-26`); env fallback reads named `HINDSIGHT_*` keys via a fixed map, never enumeration (`src/core/config.ts:401-443, 474-497`).
- No reads of `~/.ssh`, `~/.aws`, opencode `auth.json`, `keychain`, or `.netrc` anywhere in `src/` or in the shipped bundles (grep: zero hits).
- Claude/Codex transcript directories (`~/.claude/projects`, `~/.codex/sessions`) are read only behind `--import-conversations` (`src/installer.ts:1281`, readers in `src/core/history.ts:230-296`); SQLite-based agents are refused rather than parsed (`src/core/history.ts:296-305`).
- Daemon mode detects an LLM key for fact extraction (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY`, `src/core/daemon.ts:113-151`) and forwards it to the local daemon child process environment (`daemonEnv`, `src/core/daemon.ts:168-190`); the daemon spawn receives it via the `env` option, not argv (`dist/daemon-start.js`, `runCommand`: `spawn(cmd, args, { stdio: "pipe", env })`). See residual risk 3 for the one argv exception.
- Secrets are never logged or returned by diagnostics; `hindsight_diagnose` reports booleans only (`src/core/knowledge-tools.ts:127-137`).

### Dynamic code execution

Zero `eval`, `new Function`, or `vm.*` in the plugin's own runtime source (grep over `src/` excluding tests: no hits; scanner's 92 EXEC hits are regex `.exec()` calls and legitimate `child_process` imports). The shipped `dist/dsh.js` contains zero `new Function`/`eval`. Exactly one real `new Function` exists across all shipped bundles, inside the bundled ajv schema compiler in `dist/mcp-server.js:2945` (compiles JSON-Schema validators; arrives via `@modelcontextprotocol/sdk`; the DSH path does not load mcp-server.js at all). All `child_process` usage is `execFileSync`/`spawn` with fixed argument lists (`git` in `src/core/git.ts:16-22`; detached `node deepen.js` in `src/core/seed.ts:23-48`); no `shell: true` anywhere.

### Data flows (what leaves the machine)

To the user-configured Hindsight server only: the current prompt as a recall query (`src/core/runtime.ts:143-180`); session write-back of user/assistant prose plus compact action lines, with plugin-sourced messages and raw tool outputs excluded by design (`src/core/transcript-dsh.ts:17-27, 60-63`); git history (commit messages by default, full diffs under `gitIngest: "full"`), including author name/email in document metadata (`src/core/git.ts:100-115`); codebase-survey findings ingested through MCP (`src/core/survey.ts:1-14`). Retention is automatic and disclosed in the README ("Ingestion is fully automatic"); opt-outs are `disabled`, per-bank `banks.<id>.disabled`, `optInOnly`/`optInPaths`, and `retainSessions: false` (`src/core/config.ts:70-84`, `src/core/bank.ts:238-250`). A hostile repo cannot redirect any of this: project-local config is deliberately nonexistent, and `apiUrl`/`apiToken`/`mapPathToBank` are settable only from the user-global file (`src/core/config.ts:10-12, 367-373`).

## Scanner findings and adjudication

Raw counts, source tree: 4 critical, 316 high, 5 medium, 283 low. Gates fired: `cred-plus-net` (cap F), `dynamic-exec-present` (cap C), critical finding (cap D). Raw counts, published tarball: 195 critical, 297 high, 21 medium, 6 low; same gates.

| Finding | Adjudication |
|---|---|
| CRITICAL CRED-006 `const ENV = { ...process.env }` x4 (`src/core/config.test.ts:93,141,242`, `src/core/host-client.test.ts:23`) | False positive. Test fixtures that snapshot and restore the environment around each test. Not shipped. |
| Cap `cred-plus-net` (F) | Downgraded. The only credential-to-network flow is `apiToken -> Authorization -> the user's own configured apiUrl`, which is the product. No other cred-to-net path exists; the shipped `dist/dsh.js` reads no credential store (grep: `.ssh`/`.aws`/`auth.json` zero hits). |
| Cap `dynamic-exec-present` (C), 194 critical EXEC in the tarball | Downgraded. All are `child_process` import statements classified by the bundler-aware rule plus regex `.exec()`. One genuine `new Function` total, from bundled ajv inside `dist/mcp-server.js:2945`, not reached by the DSH path. |
| 283 low NET, mostly `package-lock.json` funding URLs and test servers | False positive noise. |
| HOOK `prepublishOnly`, e2e `run-harness.sh:9` | Publisher-side and dev-only; nothing executes at consumer install time. |
| OBFU | Zero findings. Confirmed by hand: no decode-then-execute, no string-array rotation, no homoglyphs. |

## Strengths

- Minimal, inspectable egress surface: one signing site (`src/core/hindsight.ts:215`), one health probe (`src/core/daemon.ts:57`), everything else is documentation strings.
- Untrusted-repo hardening is deliberate: no project-local config, endpoint/token excluded from repo-reachable surfaces (`src/core/config.ts:367-373`), and the headless survey runs read-only tool allowlists with Bash/Write/WebFetch disallowed and a USD spend cap because it reads untrusted files (`src/core/survey.ts:167-175, 225-232`).
- Injection hygiene on its own channel: recalled memory rides `source.kind: "plugin"` and is excluded from write-back so memory does not feed on itself (`src/dsh.ts:204-219`, `transcript-dsh.ts:60-63`).
- Fail-open everywhere (a dead server costs memory, never the agent), 15 s request deadline, capped retry-after (`src/core/hindsight.ts:126-144, 247`).
- Installer discipline: backups before first write, marker-scoped replace/remove, explicit-target install (bare `install` changes nothing), refuses ambiguous situations loudly (`src/installer.ts:15-40, 1247-1253`).
- Diagnostics never return secret values (`src/core/knowledge-tools.ts:127-137`).

## Residual risks

1. **Automatic retention of conversations to a remote server (by design).** Default mode sends prompts and full session prose to `api.hindsight.vectorize.io`. Documented and switchable, but users who paste secrets into an agent should know they persist to that bank. Grade-neutral (documented), awareness-required.
2. **Daemon mode executes an unpinned third-party package.** `serverMode: "daemon"` launches `uvx hindsight-embed@latest` (`dist/daemon-start.js`, `getEmbedCommand`; default `embedVersion` "latest"), downloading and running PyPI code on your machine. Opt-in mode, but unpinned by default.
3. **LLM key exposure in daemon-mode profile creation.** `collectProfileEnv` passes `HINDSIGHT_API_LLM_API_KEY` as `--env KEY=value` argv to the `profile create` command (`dist/daemon-start.js`), briefly visible to same-user processes via `ps` and persisted into the uv profile file. Same-user threat model, low severity, still avoidable with env passthrough.
4. **Git author identity retained.** Author name and email land in memory-bank metadata on every retained commit (`src/core/git.ts:105-108`); relevant when banks are shared.
5. **Server-controlled error text enters local logs** verbatim (`src/core/hindsight.ts:253`). A malicious or compromised server can inject content into plugin logs; not model-facing.
6. **Wide dependency ranges** (`^1.29.0` MCP SDK, `^4.4.3` zod, `^0.8.6` hindsight-all): transitive risk resolved on the user's machine, outside this audit.
7. **Pipeline ceiling.** No S4 behavioral probe, no cross-model S5 review, no signed verdict. Single-reviewer static analysis cannot exclude a staged payload; the C grade reflects that honestly.

## Verify this yourself

```bash
# Pin the exact audited commit
git clone --depth 1 https://github.com/vectorize-io/hindsight /tmp/hs && \
  git -C /tmp/hs fetch --depth 1 origin c2486a2dc47223ecf4261c5ea12744782682f562 && \
  git -C /tmp/hs checkout FETCH_HEAD

# Rerun the scanner (expect the same raw F; see adjudication above)
node <dsh-bridge>/tools/scan/dist/index.js /tmp/hs/hindsight-integrations/coding-agents

# Subject: confirm the published tarball you would install is the one graded
npm view @vectorize-io/hindsight-coding-agents@0.4.2 dist.integrity
npm pack @vectorize-io/hindsight-coding-agents@0.4.2 --ignore-scripts && shasum -a 256 *.tgz

# Egress: expect exactly two fetch sites in the DSH bundle
node -e "const s=require('fs').readFileSync('package/dist/dsh.js','utf8');
  const re=/fetch\(/g; let n=0; while(re.exec(s)) n++; console.log(n)"          # 2

# Dynamic execution: expect no output (dsh.js), one ajv hit (mcp-server.js)
grep -c 'new Function\|[^a-zA-Z.]eval(' package/dist/dsh.js                    # 0
grep -rn 'new Function' package/dist/mcp-server.js                             # ajv compile, line ~2945

# Credential stores: expect zero hits in the shipped DSH bundle
grep -c '\.ssh\|\.aws\|auth\.json\|keychain' package/dist/dsh.js               # 0

# Transcript reads are opt-in: expect the flag gate
grep -n 'import-conversations' package/dist/installer.js | head                # flag-gated dispatch
```

Re-verify triggers: new upstream version, scanner rules bump, or 90 days elapsed.

## What this card is not

Not a substitute for the full S0-S8 pipeline. Stages S1 sealing, S2 SBOM/advisory join, S4 behavioral probe, S5 dual-model review, and S8 signing were out of scope for this pass. The C grade states that ceiling plainly: the manual evidence supports "no malicious mechanism found," and nothing here can prove one is absent.
