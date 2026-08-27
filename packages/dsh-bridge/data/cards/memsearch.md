# Trust Report Card: memsearch (@zilliztech)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `memsearch` (Zilliz semantic memory: Python CLI + vector store, plus DSH/Claude Code/Codex/OpenCode/OpenClaw plugin layer; the DSH surface ships as npm `@zilliz/memsearch-dsh`) |
| Pinned subject | github:zilliztech/memsearch @ commit `f91f5d3c6aa9081cee9c3bcaacb3a81561f5d58a` (default branch `main` HEAD at audit time; verified equal to upstream via `git ls-remote`) |
| npm integrity (DSH package) | `sha512-ijB+m77/zSezMSebo3lTrWLux4sZfs+6AJWzWoslcI9WvNSPJ9krrzHvvoMrnGUhGMRB/j57h52buYQnYqH1cQ==` (`@zilliz/memsearch-dsh@0.1.3`, fetched 2026-08-25; registry `gitHead a6a7e99…`, which is *not* the audited commit (see section 5)) |
| License | MIT, Copyright (c) 2025 Zilliz Inc. (LICENSE:1-3) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Functional but install-trusting: all egress goes to user-configured or well-known endpoints
(PyPI version check, astral.sh, Hugging Face, embedding/vector-store providers), no telemetry and no
credential theft exists anywhere in the tree. But the Claude Code and Codex session-start hooks
pipe `https://astral.sh/uv/install.sh | sh` on first run without consent or pinning, which our
pipeline treats as an automatic grade cap.

## 3. What this plugin can do

The repo has two layers: a Python package (`src/memsearch`, PyPI `memsearch`) that does chunking,
embedding, Milvus storage, search, summarization; and per-host plugins (`plugins/{dsh,claude-code,codex,opencode,openclaw}`)
that capture transcripts into `<project>/.memsearch/memory/*.md`, index them, and inject recall context.

| Capability | Detail | Evidence |
|---|---|---|
| Vector DB egress | Default is **local**: Milvus Lite file `~/.memsearch/milvus.db` (src/memsearch/store.py:74-91 expands local paths; no network). If `milvus.uri` in config is set to `http(s)/tcp`, pymilvus connects to that server or Zilliz Cloud with optional token (store.py:87-89). Destination is always user-configured, never hardcoded. | store.py:65-97, config.py:44-48 |
| Embedding egress | Provider-selected: default `openai` (api.openai.com via SDK; base_url override honored, src/memsearch/embeddings/openai.py:33-46); plugin bootstrap defaults new users to `onnx`, which downloads model files from Hugging Face repo `gpahal/bge-m3-onnx-int8` on first run (src/memsearch/embeddings/onnx.py:27, 69-115), offline-first when cached (onnx.py:43-47). Optional google/voyage/jina/mistral/ollama/local providers behind extras (pyproject.toml:29-45). Chunks (memory content) are the payload sent for embedding. | embeddings/*.py |
| Update check | Hooks GET `https://pypi.org/pypi/memsearch/json` once per 24h, 2s timeout, result cached at `~/.memsearch/.pypi-latest`; sends nothing but the request itself (plugins/claude-code/hooks/common.sh:164-178, codex/hooks/common.sh:130). Read-only version comparison; never auto-installs from this path. | common.sh both hosts |
| Remote code execution at install/bootstrap | When neither `memsearch` nor `uvx` exists: claude-code/hooks/session-start.sh:16 and codex/hooks/session-start.sh:14 run `curl -LsSf https://astral.sh/uv/install.sh \| sh`, then `uvx --upgrade --from 'memsearch[onnx]' memsearch` pulls the latest PyPI build each warmup (session-start.sh:21). Codex installer does the same pipe-to-shell (scripts/install.sh:182). OpenCode/OpenClaw installers only print advice (install.sh:19-22, openclaw/install.sh:30). | hooks + installers |
| Child processes | Extensive by design: bash wrappers around the memsearch CLI (plugins/dsh/index.js:153,173,203,355,585), host agent CLIs in restricted modes: `claude -p --safe-mode --strict-mcp-config --tools ""` (claude-code/hooks/stop.sh:157-168), `codex exec --ephemeral -s read-only` (_shared/scripts/maintenance-runner.py:455-466), `opencode run` with isolated XDG config (capture-daemon.py:436-460), `dsh --profile headless` with recursion guard env (index.js:916-921). `os.execvpe` re-execs maintenance under uv (maintenance-runner.py:392-400). `os.system()` string interpolation of project-derived args (capture-daemon.py:844). | file:line above |
| Transcript reads | Reads Claude Code JSONL transcripts (hooks/parse-transcript.sh, transcript.py), Codex rollout logs, OpenCode SQLite at the user data dir (capture-daemon.py:795+, opencode_turns.get_db_path), OpenClaw message stores (openclaw/index.ts). Conversation content flows into LLM summarize calls (host CLI or memsearch-configured provider). No auth.json, .ssh, .aws, keychain, or .env reads exist anywhere (grep verified across plugins/, src/, scripts/). | grep negative claim |
| Credential handling | API keys come from user env or memsearch config (`embedding.api_key` supports `env:VAR_NAME` indirection, config.py:57); keys pass to provider SDKs only (embeddings/openai.py:41-43, maintenance.py:333-349). The two scanner criticals are env *passthrough* for child processes: `Object.entries(process.env)` builds a child env (openclaw/index.ts:261-267; mirrored in compiled index.js:173) and `{...process.env}` spreads in dsh/index.js:361,391 and opencode/index.ts:128. No env enumeration is transmitted, logged, or stored. | file:line above |
| Filesystem writes | Project-scoped `.memsearch/` (memory journals, pids, state DBs), `~/.memsearch/` (config, milvus.db, PyPI cache), `~/.agents/skills/` (skill copies/symlinks), `~/.codex/{hooks.json,config.toml}` (installer edits hook registration, backs up first: codex/scripts/install.sh:216-246), isolated summarize config under `~/.codex/tmp/opencode-memsearch-summarize` (capture-daemon.py:347-359). No writes outside these scopes found. | file:line above |
| Web routes (DSH only) | Registers `/memsearch-dsh/*` JSON routes on the host's own web server: list/read `.memsearch` tree with traversal + symlink + extension + 256KB guards, queue skill-review messages, trigger `skills install`, open dir via xdg-open (index.js:517-708). Route handlers themselves add no origin checks; they inherit whatever isolation the DSH web server provides. | dsh/index.js |
| Dynamic code execution | No eval/new Function/vm in production JS (scanner EXEC hits are RegExp `.exec()` at client.js:188-283 and one test-only `vm.runInContext` at tests/client.test.js:53). One dynamic `import()` of the resolved peer `@deepseek-ai/dsh-llm` (index.js:100-101): module resolution, not string compilation. Python core has zero eval/exec/pickle/yaml.load (grep verified). | grep + adjudication |
| Telemetry | None. No analytics/beacon/metrics strings in src, plugins, scripts, workflows (grep returned zero hits). The PyPI check carries no payload. | negative claim, scope stated |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 62 findings (2 critical, 53 high, 1 medium, 6 low), machine grade F with caps
`dynamic-exec-present` (C cap) and `critical-present` (D cap). Files scanned 52 / skipped 170;
the skipped set includes the entire Python core and most shell scripts, so every family below was
additionally adjudicated by full manual read. Raw scan saved at reference/audits/memsearch-scan/scan.json.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 "enumerates entire environment" openclaw/index.ts:263 and index.js:173 | False positive as exfiltration; true as capability. `envWithOverrides()` copies process.env solely to hand a complete environment to child processes spawned through the host's own `runCommandWithTimeout`. Same pattern as the benign `{...process.env}` spreads the scanner misses elsewhere (dsh/index.js:361,391). No copy leaves the machine. | lines read directly; no NET sink reachable from the function |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| MEM-HOOK-1 | high | plugins/claude-code/hooks/session-start.sh:16; plugins/codex/hooks/session-start.sh:14; plugins/codex/scripts/install.sh:182 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` executed inside a session-start hook when uv is missing. Unpinned remote script piped straight into a shell, silent (`2>/dev/null`), triggered by merely opening a session. This alone caps the grade at C per pipeline §S6/D-band rules (install-time-style remote fetch). |
| MEM-NET-1 | medium | plugins/claude-code/hooks/common.sh:173; plugins/codex/hooks/common.sh:130 | PyPI version probe from a session hook, 2s timeout, 24h cache, response used only for an update hint string. Documented in-code. |
| MEM-SUPPLY-1 | high | plugins/claude-code/hooks/session-start.sh:21 (and uvx fallbacks everywhere) | `uvx --upgrade --from 'memsearch[onnx]'` runs on warmups; unpinned floating-latest resolution of its own package from PyPI at runtime. Standard uvx tradeoff, but it means the executed code is not the audited commit. |
| MEM-EXEC-1 | medium | plugins/dsh/index.js:153,203,355,385,585; opencode/index.ts:71,112,157,239; capture-daemon.py:844 | Shell-outs to bash/python/host CLIs. Queries and paths are single-quote escaped (shellEscape, index.js:69-71) except capture-daemon.py:844's `os.system(f"... '{memory_dir}' ...")` where memory_dir is project-derived (attacker would need write access to the project path already). Host-agent spawns are deliberately permission-restricted (see section 3). |
| MEM-CRED-1 | low | openclaw/index.ts:263; dsh/index.js:361,391; opencode/index.ts:128,162 | Full-environment passthrough to children. Necessary for uvx/PATH resolution; values never leave the machine. |
| MEM-FS-1 | medium | plugins/codex/scripts/install.sh:217-260 | Installer mutates `~/.codex/hooks.json` (registers its own three hooks) and flips `hooks = true` in config.toml. Explicitly an opt-in installer script, backup made, idempotent. Listed because it is self-mutation of another tool's config. |
| MEM-WEB-1 | medium | plugins/dsh/index.js:537-707 | Loopback JSON routes can read `.memsearch` text files, inject messages into the live agent inbox, and trigger skill installs. Guards are traversal/symlink/type/size only; authentication is delegated entirely to the host web server service. |

### Scanner noise dismissed (with scope)

- 14 EXEC-005 hits on RegExp `.exec()` in plugins/dsh/client.js (188-283): markdown renderer,
  not process execution. Each excerpt checked.
- EXEC-004 imports of node:child_process: flagged the import line, not any use; adjudicated at
  call sites above.
- HOOK-007 on `.github/workflows/*.yml` and install.sh echo text (`npm install -g npm@11`,
  `npm install` in CI steps, help strings): CI/release plumbing and printed advice, not runtime.
- OBFU-006 on index.js:986: the regex strips YAML frontmatter from SKILL.md content; the word
  match was a false obfuscation signal. No entropy anomalies, homoglyphs, or encoded blobs
  anywhere (grep for atob/b64decode/hex blobs: zero).
- NET-008 on documentation URLs (github.com, registry.npmjs.org in workflow config, example.com
  in tests): metadata and fixtures, not egress.

### Negative claims and what was searched

Searched all of src/memsearch (28 modules), all five plugin directories, shared scripts, workflows
(52 files scanned by tool; production files additionally read in full: both dsh/*.js, opencode
index+context+daemon, openclaw ts+js, all five hosts' hooks and installers, maintenance-runner,
summarize.py, compact.py, store.py, config.py, core.py, embeddings/*): no eval/new Function/vm in
shipped code; no telemetry or analytics endpoints; no reads of auth.json/.ssh/.aws/keychain/.env
files; no credential values placed into URLs, logs, or memory journals (journals hold summaries and
anchor comments only, stop.sh:192-202); no timers or deferred beacons beyond the documented
maintenance interval (dsh/index.js:62,1178) and watch daemon; no hidden second endpoint: the full
literal-URL inventory of executable code is exactly pypi.org, astral.sh, huggingface.co (via SDK),
registry.npmjs.org (workflows), plus user-configured provider/base_url/milvus destinations.

## 5. What we could not check

- **npm tarball vs this commit.** `@zilliz/memsearch-dsh@0.1.3` registry gitHead (`a6a7e99…`) predates
  the audited commit (`f91f5d3…`), so the published 0.1.3 bytes are not byte-verifiable against this
  card's subject. Mitigation: release workflow publishes only from tag-matched checkouts with tests
  and syntax gates (.github/workflows/release-dsh.yml:31-64), and the package is plain unminified ESM
  (`node --check` gate) making divergence easy to diff by hand. Residual risk stands until someone
  rebuilds/compares the tarball at the pinned commit.
- **PyPI distribution vs this commit.** `memsearch==0.4.19` (pyproject.toml:8) was not downloaded or
  compared; hooks' `uvx --upgrade` executes whatever PyPI serves at runtime, not this SHA.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  unavailable here). In particular, the astral.sh bootstrap path was analyzed statically, not
  executed in the honeypot.
- **Host web-server isolation** for `/memsearch-dsh/*` routes (what origin/CSRF guarantees the DSH
  webServer service already enforces) is a property of DSH, not of this artifact.
- **Milvus server/Zilliz Cloud traffic** contents when a remote URI is configured (pymilvus SDK
  internals out of scope).

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on raw counts;
manual adjudication holds CRED-006 as benign passthrough but confirms the HOOK/EXEC substance of
the astral.sh pipe-to-shell finding rather than dismissing it. Both positions recorded here.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/zilliztech/memsearch /tmp/memsearch-audit
cd /tmp/memsearch-audit && git rev-parse HEAD   # expect f91f5d3c6aa9081cee9c3bcaacb3a81561f5d58a

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/memsearch-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "astral.sh" plugins/                        # pipe-to-shell bootstrap: 4 sites
grep -rhoE "https?://[a-zA-Z0-9./_-]+" src plugins scripts .github \
  --include='*.py' --include='*.js' --include='*.ts' --include='*.sh' | sort -u
                                                     # full egress inventory, ~15 unique hosts
grep -rn "auth.json\|.ssh\|.aws\|keychain" plugins/ src/   # credential reads: none
sed -n '74,97p' src/memsearch/store.py               # milvus: local-file default, remote only if configured
sed -n '261,267p' plugins/openclaw/index.ts          # the env "enumeration": child-env passthrough

# 4. Confirm the published DSH package
npm view @zilliz/memsearch-dsh dist.integrity
#   expect sha512-ijB+m77/zSezMSebo3lTrWLux4sZfs+6AJWzWoslcI9WvNSPJ9krrzHvvoMrnGUhGMRB/j57h52buYQnYqH1cQ==
```

## 8. Methodology and pinned inputs

- Subject: git commit `f91f5d3c6aa9081cee9c3bcaacb3a81561f5d58a`, branch main HEAD, shallow clone at
  reference/audits/memsearch; upstream equality confirmed via `git ls-remote` at audit time.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad…a04e1`; raw output retained at
  reference/audits/memsearch-scan/scan.json.
- Review: full manual read of plugins/dsh/index.js (1271 lines) and client.js (677), opencode
  index.ts/context.ts/capture-daemon.py, openclaw index.ts and its compiled index.js (string-level
  divergence check against TS source), all hooks (claude-code x5, codex x4), installers (x3),
  _shared/scripts/maintenance-runner.py, dsh summarize.py/parse-transcript.py, src/memsearch
  {store,config,core,compact,maintenance,skills}.py and embeddings/*, pyproject.toml, workflows,
  cordis.patch.yml, evaluation/README.md (methodology doc, no executable code).
- Cross-model review: NOT performed (single reviewer). Card revision 1 capped accordingly.
- Grade derivation: no exfiltration-path or credential-theft findings after adjudication, but one
  high-severity unpinned remote-script-execution path reachable at session start (MEM-HOOK-1) plus
  runtime floating-latest package resolution (MEM-SUPPLY-1). Per pipeline bands this forbids A/B and
  lands in C ("use with awareness"), matching the C cap the scanner itself applied for dynamic-exec.
  Not D/F because the fetched code comes from a fixed well-known installer URL over TLS, is a
  documented bootstrap pattern, and no canary-relevant credential ever touches the network path.

## 9. Strengths

1. Local-by-default vector store: Milvus Lite file backend needs no network; remote servers only on
   explicit config (src/memsearch/store.py:74-91).
2. Restricted sub-agent invocations: summarization/maintenance children run with tools stripped
   (`--tools ""`), read-only sandbox (`codex exec -s read-only`), isolated config dirs, and explicit
   recursion guards (stop.sh:161-168, maintenance-runner.py:455-522, index.js:1022-1025).
3. Defense-in-depth on the DSH web routes: traversal rejection, symlink-realpath resolution,
   extension allowlist, size caps (index.js:474-507, 630-707).
4. Honest failure modes: summarizer failures write visible "unavailable" notes instead of silently
   switching backends (index.js:1139-1149); config reads distinguish failure from "not configured"
   (index.js:199-212).
5. Zero telemetry, zero obfuscation, zero credential-file access across five host integrations;
   plain readable code with unusually thorough explanatory comments.

## 10. Residual risks

1. Session-start pipe-to-shell bootstrap (MEM-HOOK-1): a compromise of astral.sh, or any TLS-breaking
   intermediary, executes arbitrary code with user privileges the first time a user opens a session
   on a machine without uv. Users should pre-install memsearch/uv manually before enabling the
   Claude Code or Codex plugin.
2. Floating-latest runtime resolution: `uvx --upgrade` means executed code tracks PyPI HEAD, not the
   audited SHA (MEM-SUPPLY-1); every future upstream release inherits this card's subject implicitly
   without re-audit.
3. Memory journals inherit conversation sensitivity: transcripts are summarized by host CLIs or
   configured providers and stored in plaintext under the project; anything in the journal is also
   sent to the configured embedding provider (cloud by default until switched to onnx/local).
4. Codex installer rewrites ~/.codex/hooks.json and config.toml (MEM-FS-1); a future revision could
   redirect hook commands, and users granting installer trust extend it blindly.
5. Published artifacts not rebuilt: npm tarball and PyPI wheel were not byte-compared to this commit
   (section 5); provenance rests on GitHub-Actions release hygiene, not attestation.

## 11. Re-verify steps

1. Re-run section 7 against current upstream HEAD. Any new literal URL, any new `curl | sh`,
   or any auth-path read must be re-adjudicated before this grade carries forward.
2. Diff `npm view @zilliz/memsearch-dsh dist.integrity` and `gitHead` against a fresh tag build;
   if gitHead moves past the pinned commit, re-run the audit before recommending install.
3. Watch for the fix pattern on MEM-HOOK-1: a pinned installer digest (`curl … | shasum -a 256 -`)
   or dropping the auto-bootstrap entirely justifies re-grading toward B.
4. Re-check plugins/*/hooks/session-start.sh after any upstream change to the uvx fallback chain:
   new fallbacks (pip, brew) are new supply-chain surfaces.
5. Re-run scanner after any heuristics-corpus bump; corpus digest recorded in section 8.
