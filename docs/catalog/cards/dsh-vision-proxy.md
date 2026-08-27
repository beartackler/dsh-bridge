# Trust Report Card: dsh-vision-proxy

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-vision-proxy` (DSH provider-route plugin: transcribes attached images to text with a VLM, then delegates to a text-only DeepSeek adapter) |
| Pinned subject | github:Flyvhidbwo/dsh-vision-proxy @ commit `d4ac2622e8eb0d9f0121d99466c7946f1567fbf8` (default branch head, committed 2026-08-26, version 0.4.1) |
| npm integrity | Not checked. `publishConfig.access` is `public` so the package is intended for npm, but no registry tarball was fetched or compared. |
| Provenance | CI workflow present (`npm test` on Node 22 and 24, plus a BOM check). No release workflow, no attestation. `lib/index.js` is hand-written JavaScript committed directly (no build step). |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0, rulesDigest `d7d5d9eb...41f3`, plus full manual read of lib/index.js 591 lines, scripts/postinstall.js, scripts/gh-pr.mjs, and .github/workflows/ci.yml) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The plugin does exactly what its name says and says so loudly: it base64-encodes your attached images
and POSTs them to a vision endpoint, and while every destination is a named default or a value you
configured, the combination of image egress by default, an API-key read from environment and from the
host credentials service, and a `postinstall` hook that runs on install puts it a band below the
purely local plugins in this catalog.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Image egress | Image bytes go out as a `data:` URL inside a `POST .../chat/completions` body. Destinations: the configured `baseURL`, default `https://dashscope.aliyuncs.com/compatible-mode/v1` (lib/index.js:52); DeepSeek official `https://api.deepseek.com` when `deepseekVision` is true, which is the default (lib/index.js:76, 105, 500-510); local Ollama `http://localhost:11434/v1` when detected (lib/index.js:56); plus any user-declared `fallbackModels[].baseURL`. | lib/index.js:245-262 |
| Startup probe | With `autoLocalOllama` (default true) the plugin issues a `GET http://localhost:11434/v1/models` at activation with a 1.5 s timeout. Loopback only. | lib/index.js:191-215, 517-520 |
| Credential access | `resolveApiKey` reads `process.env.VISION_API_KEY` then `process.env.DASHSCOPE_API_KEY` when no config key is set (lib/index.js:147). `resolveDeepSeekKey` asks the host `credentials` service for `DEEPSEEK_API_KEY` and falls back to `process.env.DEEPSEEK_API_KEY` (lib/index.js:222-243). Keys are used only as the `Authorization: Bearer` header on the transcription request; the startup log states the key is never logged and prints only its source (lib/index.js:528-547). | file:line above |
| Lifecycle hooks | `"postinstall": "node scripts/postinstall.js"` runs on install. The script prints a bilingual privacy notice, asks one y/N question on a TTY, prints guidance, and exits 0 on any error. It writes nothing and makes no network call. | package.json:63; scripts/postinstall.js:1-54 |
| Child processes | None in the plugin. No `child_process` import anywhere in lib/ or scripts/. | grep across repo |
| Filesystem access | None at runtime. No `node:fs` import in lib/index.js; the transcription cache is an in-memory `Map` capped at 200 entries keyed by content hash. | lib/index.js:65, 344-365 |
| Dynamic code execution | None. The only dynamic `import()` is `import('sharp')`, a declared optional dependency used for image downscaling, wrapped so a missing module passes the original bytes through. | lib/index.js:315-339 |
| Telemetry | None. No analytics or beacon code in lib/ or scripts/. | negative claim, scope stated |
| Repo tooling (not shipped at runtime, but shipped in the tarball) | `scripts/gh-pr.mjs` reads `process.env.GITHUB_TOKEN` and calls `https://api.github.com` to create and fix PR bodies. It is a maintainer utility, never imported by lib/, but `scripts` is listed in `package.json` `files`, so it ships to users. | scripts/gh-pr.mjs:15, 22, 41-66; package.json files array |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 44 findings (0 critical, 27 high, 11 medium, 6 low), machine grade F with a `cred-plus-net`
gate on `lib/index.js` and `scripts/gh-pr.mjs`. Adjudicated below.

### Scanner criticals adjudicated

None reported. The scanner's F-level cap came from the `cred-plus-net` co-occurrence gate, which is
correct in substance: this plugin genuinely reads API keys and genuinely makes network calls in the
same module. That is its function, and the destinations are enumerated in section 3.

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| VP-NET-1 | high | lib/index.js:245-262 | Image bytes leave the machine by default. The default route is DeepSeek official (`deepseekVision: true`), with DashScope as the configured `baseURL` default. The plugin logs a privacy notice at activation (lib/index.js:548) and prints one at install (scripts/postinstall.js:30). Honest, but it is still egress-by-default of potentially sensitive screen content. |
| VP-CRED-1 | medium | lib/index.js:147, 222-243 | Reads three specific environment variables and one named credentials-service entry. No environment enumeration, no auth-file reads, no keychain. Keys go only into the `Authorization` header of the transcription request. |
| VP-CRED-2 | medium | lib/index.js:527-540 | Presence-only checks on `VISION_API_KEY` / `DASHSCOPE_API_KEY` to compute a `keySource` label for the startup log. Values are not logged. |
| VP-HOOK-1 | medium | package.json:63, scripts/postinstall.js | Install-time script. Read in full: prints text, one optional prompt, no writes, no network, `process.exit(0)` in the catch so it can never fail an install. Benign as written, but any install-time script is a standing supply-chain seam. |
| VP-SUPPLY-1 | medium | scripts/gh-pr.mjs | A `GITHUB_TOKEN`-consuming GitHub API client shipped inside the published `files` list. It is never imported by the plugin and only runs if a user deliberately executes it, but it does not belong in a distributed plugin tarball. |
| VP-DEP-1 | low | package.json optionalDependencies `sharp ^0.34.0`, `pnpm.onlyBuiltDependencies` | `sharp` has native build steps. Optional, and the code degrades gracefully when it is absent, but it is a native-code dependency in the install path. |
| VP-NET-2 | low | lib/index.js:191-215 | Loopback Ollama probe at startup. Local only, 1.5 s timeout, failures swallowed. |

### Scanner noise dismissed (with scope)

- 19 NET highs in tests/core.test.js: fixture URLs (`https://mock`, `https://primary`, `https://a`,
  `https://flaky`, `https://dead`) in the fallback, cooldown, and timeout unit tests.
- Repeated CRED medium hits on lines 147, 527, 528, 534 are the same two environment variables
  counted once per occurrence.
- NET lows on package.json repository, homepage, and bugs URLs, and on the guidance strings at
  lib/index.js:439 and :542 that tell the user where to install Ollama.
- SUPPLY high on package.json:23 is the repository URL.

### Negative claims and what was searched

Searched lib/index.js (all 591 lines), scripts/postinstall.js, scripts/gh-pr.mjs,
scripts/check-no-bom.js, tests/core.test.js, .github/workflows/ci.yml, cordis.patch.yml,
package.json: no `child_process`, no `node:fs`, no eval or `new Function` or `vm`, no environment
enumeration (`Object.keys(process.env)` has zero hits), no auth-file or keychain paths, no telemetry,
no obfuscation (unminified, heavily commented source), no writes to disk, no hidden third-party
fallback endpoint pre-bundled in `fallbackModels` (the default is `[]`, lib/index.js:120).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/transcribe run was performed. In particular the
  claim that no key value ever reaches the logs was verified by reading the log statements, not by
  observing output.
- **Published-artifact comparison.** No npm tarball was fetched or compared. `lib/` is committed
  source with no build step, so there is no in-repo src-to-dist gap, but a registry copy could differ.
- **`sharp`.** The optional native dependency was not installed, built, or reviewed. Image bytes pass
  through it when present (lib/index.js:315-339).
- **Third-party endpoint behavior.** What DashScope, DeepSeek, or any user-configured OpenAI-compatible
  endpoint does with the uploaded images is outside this artifact.
- **Prompt-injection consequences.** Transcribed image text is inserted into the conversation for the
  text-only model to read. We did not test whether text embedded in an image can steer the downstream
  model; structurally, nothing here prevents it.
- **`scripts/release.ps1`** (110 lines of PowerShell) was listed but not read line by line.
- **Chinese-language README** content was not read in full, so behavior described only there is not
  corroborated here.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on the credential-plus-network co-occurrence; the manual
verdict is C. The disagreement is about reachability and consent, not about the facts: the
co-occurrence is real and intentional.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/Flyvhidbwo/dsh-vision-proxy /tmp/vp-audit
cd /tmp/vp-audit && git rev-parse HEAD   # expect d4ac2622e8eb0d9f0121d99466c7946f1567fbf8

grep -n "https\?://" lib/index.js                  # every destination, all four named in this card
grep -rn "child_process\|node:fs\|eval(\|new Function" lib scripts   # none
grep -n "process.env" lib/index.js                 # exactly three variables, no enumeration
cat scripts/postinstall.js                         # the install-time hook, 54 lines, read it
sed -n '245,262p' lib/index.js                     # the request that carries your image
npm test                                           # the repo's own suite
```

## 8. Methodology and pinned inputs

- Subject: git commit `d4ac2622e8eb0d9f0121d99466c7946f1567fbf8` (shallow clone at
  reference/audits/dsh-vision-proxy).
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`; 9 files scanned, 58829 bytes.
- Review: full manual read of lib/index.js (591 lines), scripts/postinstall.js (54),
  scripts/gh-pr.mjs (75), .github/workflows/ci.yml, package.json; targeted read of tests/core.test.js
  for the fixture URLs.
- Cross-model review: NOT performed. Card revision 1 is capped accordingly.
- Grade derivation: C. Egress of image bytes is on by default (high-severity capability, honestly
  declared and prominently disclosed rather than hidden); credential reads are narrow and named; an
  install-time hook exists and is benign as written; a token-consuming maintainer script ships in the
  tarball. No dynamic execution, no child processes, no filesystem writes, no telemetry, no
  obfuscation. The declared-and-disclosed nature keeps it out of D; the default-on egress plus the
  install hook plus the stray `gh-pr.mjs` keep it out of B.

## 9. Strengths

1. Unusually honest disclosure. A bilingual privacy notice prints at install (scripts/postinstall.js:30)
   and again at activation (lib/index.js:548), and the activation notice explicitly says images leave
   the machine unless `baseURL` points at a local service.
2. The postinstall hook never hangs or fails an install: non-TTY and CI are detected and skipped,
   and the catch handler exits 0 (scripts/postinstall.js:31-36, 51-53).
3. The local Ollama path is a genuine images-never-leave option, auto-detected, and prepended to the
   fallback chain (lib/index.js:517-520).
4. No third-party free endpoint is pre-bundled in the fallback chain; the config comment explains why
   (lib/index.js:120).
5. Failure handling is careful: per-endpoint cooldowns, a capped `Retry-After` honoring, a hard 20 s
   cap on anonymous endpoints, and a `placeholder` failure mode so a dead endpoint cannot poison the
   session (lib/index.js:60-70, 105, 265-280).
6. Error classification gives actionable hints without echoing keys, and response bodies are truncated
   to 200 characters in error messages (lib/index.js:155-185).
7. CI runs the test suite on two Node versions.

## 10. Residual risks

1. Every image you attach in the GUI is transcribed by default, meaning screenshots of terminals,
   password managers, or private documents are sent to a third party unless you configure Ollama or
   disable the plugin.
2. Transcribed text from an untrusted image is fed to the downstream model as conversation content.
   An attacker who can get an image in front of you has an injection channel.
3. `postinstall` runs code at install time. Benign at this commit; re-read it on every version bump.
4. `scripts/gh-pr.mjs` ships to users and reads `GITHUB_TOKEN`. It runs only when explicitly invoked,
   but it should be excluded from the published `files` list.
5. `sharp` is an optional native dependency in the install path, unreviewed here.
6. The in-memory transcription cache holds transcribed text keyed by image hash for the process
   lifetime (up to 200 entries).

## 11. Re-verify steps

1. Re-run the section 7 block against the current HEAD. Any new literal URL, any new `process.env`
   read, any `child_process` or `node:fs` import, and any change to `scripts/postinstall.js` must be
   re-adjudicated before this grade carries forward.
2. Diff the `fallbackModels` default (lib/index.js:120): a pre-bundled third-party endpoint appearing
   there would be a material change to where images go.
3. Confirm the two privacy notices are still present and still fire (lib/index.js:548,
   scripts/postinstall.js:30).
4. Check whether `scripts` has been removed from the package.json `files` array; if so,
   VP-SUPPLY-1 can be closed.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
