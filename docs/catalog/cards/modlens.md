# Trust Report Card: @liustack/modlens

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@liustack/modlens` (vision bridge plugin for DSH; also a standalone CLI and agent skill) |
| Pinned subject | github:liustack/modlens @ commit `00f3658c30655314b013edbb5687c4ec5f5dab27` (tag v3.25.0, dereferenced; tag is the release head at audit time) |
| npm integrity | `sha512-ul6hysW7H0ljFqSRAz/Q07216wJGs8AFLULKP83yx4JElrJ5Io06JHd7X4MzhgmLRga4mEOGdrRJ+4Wv1qNS6w==` (`registry.npmjs.org/@liustack/modlens/3.25.0`, fetched 2026-08-26) |
| Provenance | npm attestation present (SLSA provenance via GitHub Actions trusted publisher); registry `gitHead` equals the pinned commit |
| License | MIT (LICENSE:1-3) |
| Audited | 2026-08-25 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Safe with documented behavior: every network destination is a user-configured or vendor-default
vision endpoint plus the plugin's own loopback routes; credential access is limited to existence
checks and opt-in reuse grants; there is no dynamic code execution, no telemetry, no obfuscation,
and nothing ships to any host this card does not name.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Image bytes and prompts go only to: Gemini API default `https://generativelanguage.googleapis.com` (src/providers/geminiApi.ts:18), Anthropic default `https://api.anthropic.com` (src/providers/anthropicApi.ts:17), a user-configured OpenAI-compatible baseUrl with no default (src/providers/openaiCompat.ts:95-104), or whatever URL the user asks to analyze (SSRF-guarded, src/imageInput.ts:165). Proxy support honors HTTPS_PROXY/HTTP_PROXY (src/net/proxy.ts:18-30). | file:line above |
| Loopback HTTP routes (DSH web profile) | POST/GET `/modlens/paste` (image paste to temp path) and GET/POST `/modlens/config` (settings read/write), registered on the host's own loopback web server (dsh/index.js:486-489, 2066-2071). Config route enforces loopback Host + same-origin (dsh/index.js:1853-1871, 2075). | dsh/index.js |
| Child processes | Spawns only its own bundled CLI (`node dist/main.js`, dsh/index.js:272, 1453-1457), provider CLIs found on PATH (agy, claude, codex, opencode, pi, grok, kimi - src/analyzer.ts:752, src/auto/routes.ts:79,150,239,320), one `ps` ancestry probe (src/recoverPaste/detect.ts:86), and pi's own `auth print-api-key` when pi reuse is granted (src/auto/routes.ts:477-484). All spawns go through spawnHidden wrappers that add windowsHide and nothing else (src/util/spawnHidden.ts:32-45, dsh/spawnHidden.js:16-19). | file:line above |
| Credential reads | Existence checks and key-count probes only for codex auth.json (src/auto/discover.ts:167-168); grok auth.json keys-counted, values unread (src/auto/discover.ts:239); pi auth.json used only when `reuse.pi === true` is explicitly granted in config, keys are re-fetched per call from pi's own CLI and never stored or logged (src/auto/routes.ts:406, 473-501); Claude/pi/codex/opencode session transcripts read for model-name sniffing and paste recovery, scoped to the session's project directory (src/guard/modelSniff.ts:179-280, src/recoverPaste/index.ts:60-120). No .ssh, .aws, browser stores, or OS keychain access anywhere in src/ or dsh/. | grep of all cred paths, see section 4 |
| Filesystem writes | Only under `$TMPDIR/modlens-*` (workdirs, pastes, kimi skills dir), `~/.modlens/{config.json,state.json,auto-cache.json}` written 0600 into 0700 dirs (src/config.ts:398-399, src/cooldown.ts:154-163, src/auto/discover.ts:402-404), user-specified `-o` output, and skill install targets `.claude/skills` / `.codex/skills` when invoked as a skill (src/skillPin.ts:18-19). Symlink defenses on shared temp paths (dsh/index.js:1913-1971, src/recoverPaste/index.ts:96-103). | file:line above |
| Dynamic code execution | None. No eval(), new Function, vm.*, or string-compiled code in src/, dsh/, skills/, scripts/. The scanner's EXEC hits on `.exec(` are JavaScript RegExp.prototype.exec calls, not process execution (verified individually; e.g. src/cooldown.ts:45, src/util/json.ts:49, src/util/winExec.ts:215). | grep + manual read |
| Telemetry | None. No analytics/beacon/metrics code anywhere (grep across src, dsh, skills, scripts, evals, docs returned zero hits). | negative claim, scope stated |

Image uploads go where: to the vision engine the user configured (or its vendor default), as
base64 inline content (gemini-api, openai-compat, anthropic) or as a local file path handed to an
agent CLI (agy, claude-cli, codex-cli, opencode-cli, pi-cli, grok-cli, kimi-cli). Remote image URLs
are downloaded locally only on the gemini-api path, behind SSRF guards: private/reserved IP ranges
blocked including IPv6 mapped forms, blocked metadata hostnames, DNS resolution validated then
connection IP-pinned against rebinding, max 5 redirects re-validated per hop, 25 MB cap enforced
while streaming (src/net/network.ts:31-143, src/imageInput.ts:156-278). The openai-compat and
anthropic providers pass remote URLs to the vendor instead; agent CLIs fetch on their own. This
split is documented honestly by the project itself (docs/security.md).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 354 findings (340 high, 4 critical), machine grade F. Manual adjudication of the
production-code subset (94 non-test findings) below; test files account for 260 findings and were
reviewed separately.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET "decoded at runtime" x3 in src/dshPlugin.test.ts:2489-2492 | False positive. The excerpts are GIF/PNG magic-byte literals (`GIF89a`, `0x89 0x50 0x4e 0x47`) inside paste-route rejection tests. No URL is decoded. | excerpt sha256 matches file; lines read directly |
| CRED "enumerates entire environment" src/main.test.ts:25 | Test fixture copying env for injection; production code never enumerates env (only spread into child env at src/analyzer.ts:735 to pass through PATH etc.). | grep "Object.keys(process.env)" = zero prod hits |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| MODL-NET-1 | medium | src/providers/geminiApi.ts:18 | Vendor default endpoint, documented in README and docs/security.md. |
| MODL-NET-2 | medium | src/providers/anthropicApi.ts:17 | Same. |
| MODL-NET-3 | low | src/net/proxy.ts:101 | Generic fetch wrapper for API calls; target always user-configured baseUrl. |
| MODL-CRED-1 | medium | src/auto/discover.ts:167-168, 239, 280 | Reads other harnesses' auth.json. Values are never transmitted; grok/pi reads count keys or gate on explicit grants. Existence check on codex. This is the product's documented "auto mode" (docs/security.md). |
| MODL-CRED-2 | medium | src/auto/routes.ts:406, 450-464 | pi credential reuse requires `reuse.pi === true` in ~/.modlens/config.json; absent means never asked means off (routes.ts:520-535). Key printed by pi's own CLI per call, held in memory only, redacted from errors (src/util/redact.ts:97-149). |
| MODL-CRED-3 | low | src/guard/modelSniff.ts:182, 230; src/recoverPaste/adapters/* | Reads harness session transcripts (which contain conversation text and pasted images) for model sniffing and paste recovery. Read-only; sqlite opened readOnly (adapters/opencode.ts:123). Scoped to the cwd-matching session (modelSniff.ts:118-133). |
| MODL-HOOK-1 | low | package.json:19 `prepublishOnly: pnpm build` | Publisher-side build hook, not install-time. No install/postinstall scripts exist (grep verified). CI/release workflows run standard pnpm steps (.github/workflows/{ci,release}.yml). |
| MODL-EXEC-1 | low | src/analyzer.ts:752; src/auto/routes.ts | Spawns third-party CLIs the user already has. Arguments are constructed prompts and file paths; codex route passes `-s read-only --ephemeral` (routes.ts:64-66); agy runs with `--dangerously-skip-permissions` (antigravity.ts:44) but in an isolated throwaway workdir holding only the image copy (analyzer.ts:686-709) - the project documents this tradeoff itself (docs/security.md). |
| MODL-SKILL-1 | low | skills/modlens/scripts/run.sh:116,294 | Skill launcher runs `npx --yes --package @liustack/modlens@<PINNED>`. Version is exact-pinned by the release stamp (run.sh:24, stamp asserted by tests), so it fetches the audited version's exact semver from npm, not latest. |

### Scanner noise dismissed (with scope)

- 33 EXEC family: RegExp `.exec()` misclassified as execution (all verified: cooldown.ts:45, doctor.ts:148, antigravity.ts:183, json.ts:49, apiKeys.ts:48, winExec.ts multiple, detect.ts:29, opencode.ts:145, skillPin.ts:47).
- HOOK family on strings mentioning npx in help text and launcher comments (dsh/index.js:1408-1412, run.sh comments).
- NET family on documentation URLs in messages (nodejs.org, bun.sh, aistudio.google.com, antigravity.google install hint at analyzer.ts:147 and availability.ts:42 - printed advice, not executed fetches).
- biome.json schema URL (config metadata).
- All 260 findings in *.test.* files, vitest.globalSetup.ts, and evals/run.mjs (dev-only; evals spend real quota by design and never run in CI, evals/run.mjs:5-8).

### Negative claims and what was searched

Searched all of src/, dsh/, skills/, scripts/, evals/, .github/ (107 files scanned by tool; all
production files additionally read): no eval/new Function/vm; no base64-decoded-then-executed blobs;
no obfuscation markers (no entropy anomalies, no homoglyph identifiers, sourcemap N/A since dist is
unminified per vite.config.ts `minify: false`); no telemetry endpoints; no writes outside tmpdir/
~/.modlens/user-specified paths; no reading of .ssh, .aws, browser profiles, or OS keychains; no
timers or deferred beacons (idle behavior is cache TTL arithmetic only, dsh/index.js:456, 1118-1119);
no lifecycle registration doing network I/O before consent.

## 5. What we could not check

- **The shipped bundle vs src.** This audit graded the git tree at the pinned commit. npm publishes `dist/main.js` built by vite; build is deterministic-looking but we did not rebuild and byte-compare. Mitigation: registry attestation (SLSA provenance from GitHub Actions) binds tarball to repo, and `gitHead` matches. Residual risk remains until someone reproduces `pnpm build` at this commit.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4 not available here). Static review covered the same surfaces but cannot rule out environment-dependent behavior.
- **Peer/runtime deps.** `commander ^13.1.0` and `undici ^8.10.0` are externalized, resolved on the user's machine; transitive advisories not joined against a pinned OSV snapshot.
- **Third-party CLIs' own behavior** (agy, claude, codex, opencode, pi, grok, kimi): modlens hands them a prompt and an image path; what they do afterward is outside this artifact.
- **Windows shim rewriting** in src/util/winExec.ts was read but not executed.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner disagreed with the
manual verdict; both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/liustack/modlens /tmp/modlens-audit
cd /tmp/modlens-audit && git rev-parse HEAD   # expect 00f3658c30655314b013edbb5687c4ec5f5dab27

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/modlens-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "eval(\|new Function\|vm\." src dsh            # dynamic exec: none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" src dsh | sort -u # egress: vendor defaults + examples only
sed -n '167,168p' src/auto/discover.ts                  # codex auth.json: existsSync only
sed -n '101,104p' src/imageInput.ts                     # magic-byte sniffing, no extension trust

# 4. Confirm the published artifact matches this commit
npm view @liustack/modlens@3.25.0 dist.integrity
#   expect sha512-ul6hysW7H0ljFqSRAz/Q07216wJGs8AFLULKP83yx4JElrJ5Io06JHd7X4MzhgmLRga4mEOGdrRJ+4Wv1qNS6w==
```

## 8. Methodology and pinned inputs

- Subject: git commit `00f3658c30655314b013edbb5687c4ec5f5dab27` (shallow clone at reference/audits/modlens)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of dsh/index.js (2140 lines), dsh/client.js (1024), dsh/spawnHidden.js, src/main.ts, analyzer.ts, imageInput.ts, net/network.ts, net/proxy.ts, auto/discover.ts, auto/routes.ts, guard/modelSniff.ts, guard/index.ts, providers/{geminiApi,antigravity,anthropicApi,openaiCompat,claudeCli,kimiCli,availability}.ts, util/{spawnHidden,redact,secretInput}.ts, recoverPaste/{index,detect}.ts, config.ts, cooldown.ts, prompt.ts, skills/modlens/scripts/run.sh, evals/run.mjs, SECURITY.md, docs/security.md, workflows
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high/critical production findings after adjudication; declared egress present, documented, and user-visible (B band). Caps applied: none beyond the single-reviewer note above; a future cross-model pass may revise.

## 9. Strengths

1. Exemplary SSRF defense: private-range blocking incl. IPv4-mapped IPv6, metadata hostname blocklist, DNS-pinned connections closing rebinding, per-hop redirect revalidation, streamed size caps (src/net/network.ts, src/imageInput.ts).
2. Secrets discipline: hidden-prompt key entry out of argv/shell history (src/main.ts:284-303), layered redaction before anything travels into errors/logs/model context (src/util/redact.ts), config written 0600, symlink refusal on config write (dsh/index.js:1752-1758).
3. Consent-gated credential reuse: borrowing another harness's login requires an explicit grant; absent means off (src/auto/routes.ts:535, config.ts:43-61).
4. Honest self-documentation: docs/security.md states exactly what runs, with what permissions, and where the guardrails stop ("exposure reduction, not an OS sandbox").
5. No telemetry, no obfuscation, no dynamic code execution, no install-time hooks.

## 10. Residual risks

1. Agent CLIs receive broad permissions on their own terms (agy runs `--dangerously-skip-permissions`; kimi cannot narrow its tools). Prompt-injection inside an image has a wider blast radius on those routes than on gemini-api. Documented by the project; users should prefer `-p gemini-api` for untrusted images.
2. Auto mode reads neighboring tools' session storage (transcripts can contain sensitive content). Read-only and project-scoped, but the surface exists whenever the CLI runs.
3. openai-compat and anthropic providers hand remote URLs to the vendor; local SSRF guards do not apply to those two paths (docs/security.md table states this).
4. Published dist bundle not independently rebuilt; provenance rests on npm attestations.
5. Skill launcher's npx path trusts the npm channel at runtime for the pinned version; a registry compromise would flow through (standard npm trust model).

## 11. Re-verify steps

1. Re-run step 7 block above against the current HEAD; any new literal URL, eval-family hit, or auth-path read must be re-adjudicated before this grade carries forward.
2. Diff `npm view @liustack/modlens dist.integrity` against the pinned integrity; mismatch = new revision required.
3. On upstream minor bumps, re-check: skills/modlens/scripts/run.sh PINNED stamp, package.json scripts (any new lifecycle hook is a finding), and the auto/discover.ts probe list (new harness = new credential surface).
4. Re-run scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
