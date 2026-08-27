# Trust Report Card: dsh-media-skills

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-media-skills` (bundled DSH skill provider: free image reading and image generation) |
| Pinned subject | github:MJorgin/dsh-media-skills @ commit `e682e265a5f7c7d46686ba76e27275175c0c0f7e` (default branch `main`, committed 2026-08-24) |
| npm integrity | Not checked. The repo declares `"name": "dsh-media-skills"` but this audit did not query the registry, so no published artifact is bound to this commit. |
| Provenance | None verified. No release workflow exists in the repo (no `.github/` directory at the pinned commit). |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A small, honest plugin (159 lines of JS plus two Python scripts) that registers two skills and
seeds two vision model routes: it sends images and prompts only to the vision vendors it names in
its own docs, executes no dynamic code, spawns no processes, and ships no install hooks, but it
does read the harness credential store (`~/.dsh/.credentials.yaml`) to reuse the main agent's
DeepSeek key, and it writes vendor-returned image URLs to disk without validating them.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Six destinations, all vendor vision/image endpoints, all reached from the Python skill scripts (never from the plugin's own `apply()`): Zhipu `https://open.bigmodel.cn/api/paas/v4` (vision.py:37), DeepSeek `https://api.deepseek.com` overridable by `DEEPSEEK_BASE_URL` (vision.py:68), SiliconFlow `https://api.siliconflow.cn/v1` (vision.py:48), SenseNova `https://token.sensenova.ai/v1` (vision.py:94), Gemini OpenAI-compat `https://generativelanguage.googleapis.com/v1beta/openai` (vision.py:80), SiliconFlow/SenseNova image generation (generate.py:11,13). | file:line above |
| User-controlled egress | `VISION_FALLBACKS` (JSON in env) adds arbitrary OpenAI-compatible endpoints with no allowlist; `DEEPSEEK_BASE_URL`, `GEMINI_PROXY`/`HTTPS_PROXY` also redirect traffic. All are set by the user, not by the plugin. | vision.py:128-148, 68, 77 |
| Credential reads | `load_key()` reads, in order: the named env var, `~/.dsh/secrets/media-tools.env`, `~/.codex/secrets/media-tools.env`, then the harness credential store `~/.dsh/.credentials.yaml` (both the flat and `refs:` layouts). Values are used only as `Authorization: Bearer` on the matching vendor's own request. | vision.py:101-126, 212-214; generate.py:31-41 |
| Child processes | None. No `subprocess`, `os.system`, `child_process` anywhere in `index.js`, `skills/`, or `scripts/`. | grep, section 4 |
| Dynamic code execution | None. No `eval`, `exec`, `new Function`, `vm.*`. `json.loads` is the only deserializer. | grep, section 4 |
| Filesystem writes | `generate.py` writes exactly one file: the output path the caller passes as `argv[2]` (generate.py:80, 91). The plugin itself writes nothing to disk; it only calls `settings.update('llm-pi-ai', ...)` through the host settings service. | generate.py:80,91; index.js:141 |
| Settings mutation | On `apply()`, seeds `zhipu-vision` and `sensenova-vision` provider routes into the `llm-pi-ai` namespace, and only when each key is absent. No API key is embedded; the seeds name `apiKeyEnv` only. Failures are caught and logged, never thrown. | index.js:126-148 |
| Lifecycle hooks | None. `package.json` has no `scripts` block at all. | package.json |
| Telemetry | None. Grep for analytics/beacon/metrics/report across `index.js`, `skills/`, `scripts/` returned zero hits. | negative claim, scope stated |

Where images go: to whichever engine in the failover chain first has a key. The chain is built
from key presence (vision.py:150-162), so a user who configures only `GLM_API_KEY` reaches only
Zhipu. Images are downscaled and re-encoded as JPEG locally before upload (vision.py:170-177), so
original EXIF is dropped as a side effect. Remote image URLs are never fetched by the vision
path: only local file paths are accepted (vision.py:329-336, 354).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 2 findings, both high, both NET, machine grade C (3 files scanned, 43 skipped:
images, docs, patches).

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET-007 high, `index.js:90` `baseURL: 'https://open.bigmodel.cn/api/paas/v4'` | Kept as documented behavior, not a defect. This is a settings seed value, not a fetch: the string is written into the host's model-route config so the user's model selector gains a free vision model. Named in README and `docs/SETUP_VISION.md`. | index.js:90, 126-148 |
| NET-007 high, `index.js:109` `baseURL: 'https://token.sensenova.ai/v1'` | Same: a seed value, and the route only activates if the user supplies `SENSENOVA_API_KEY`. | index.js:105-109, 138 |

The scanner did not read the Python scripts (it scanned 3 files). The egress and credential
surfaces that actually matter live there, and were reviewed by hand instead.

### Manual findings

| ID | Severity | Location | Note |
|---|---|---|---|
| MEDIA-CRED-1 | medium | skills/vision-review/scripts/vision.py:112-125 | Reads the harness credential store `~/.dsh/.credentials.yaml` and extracts the value of whichever env-var name the engine declares (`DEEPSEEK_API_KEY` in practice). This is real secret material leaving a protected store into a process the user did not necessarily expect to hold it. It is disclosed in the skill description and README, the value is used only as the bearer token for that engine's own endpoint, and it is never written to disk or logged. Kept as documented behavior. |
| MEDIA-NET-1 | medium | skills/vision-review/scripts/vision.py:128-148 | `VISION_FALLBACKS` accepts arbitrary `baseUrl` values from the environment with no scheme or host validation, and images plus the resolved key for `apiKeyEnv` are POSTed there. Exploitable only by whoever can already set the environment of the process, so this is a configuration surface, not a remote hole. |
| MEDIA-FS-1 | low | skills/media-tools/scripts/generate.py:79-80, 90-91 | The generated-image URL comes back from the vendor and is passed straight to `urllib.request.urlretrieve(url, out)` with no scheme check. A hostile or compromised generation endpoint controls that URL, so a `file://` response value would make `urlretrieve` copy a local file to `out` instead of downloading. `out` is caller-chosen, so the blast radius is a wrong file at a path the user named, not an arbitrary write. Still worth a scheme allowlist. |
| MEDIA-NET-2 | low | skills/vision-review/scripts/vision.py:77 | `GEMINI_PROXY` (read through `load_key`, so it can come from the secrets file) sets an HTTP/HTTPS proxy for the Gemini engine only. Documented; the other engines stay direct. |

### Negative claims and what was searched

Searched `index.js`, `cordis.patch.yml`, `package.json`, `skills/**` (both `SKILL.md` files and
both scripts), `scripts/make-banner.py`, and all of `docs/`: no `eval`/`exec`/`compile`/
`new Function`/`vm.`; no `subprocess`/`os.system`/`child_process`; no `postinstall`, `preinstall`,
or any `scripts` field in the manifest; no telemetry or beacon endpoints; no reads of `.ssh`,
`.aws`, browser profiles, or OS keychains; no writes outside the caller-named output path; no
timers, no background tasks, no code that runs at import time other than the two module-level
constant tables. `cordis.patch.yml` is three lines and inserts only this plugin.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run was performed. Static review covers
  the same surfaces but cannot rule out environment-dependent behavior.
- **Published artifact vs source.** No npm package was fetched or compared; there is no release
  workflow in the repo, so nothing binds a registry tarball to this commit. If you install from
  npm rather than from the pinned GitHub commit, this card does not cover what you installed.
- **The docs/patches directory.** Eight `.patch` files under `docs/patches/` modify the DSH host
  itself (client UX and vision transcription). They are not shipped by `package.json` `files` and
  are applied only if a user runs them by hand. They were not reviewed line by line.
- **Vendor behavior.** What Zhipu, SiliconFlow, SenseNova, DeepSeek, and Google do with uploaded
  images is outside this artifact. The project itself warns that Gemini free-tier data may be used
  for product improvement (`skills/vision-review/SKILL.md`, privacy section).
- **Python dependency chain.** `Pillow` and `PyYAML` are imported but not pinned or declared in
  any manifest; they resolve from the user's Python environment.
- **Non-English content.** Both skill bodies and most inline comments are Chinese; they were read,
  but a native reader may catch nuance this audit did not.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded C on two egress
strings; the manual verdict is B because those strings are settings seeds and the real egress
surface (the Python scripts) is documented and key-gated. Both positions are recorded above.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/MJorgin/dsh-media-skills /tmp/dsh-media-skills-audit
cd /tmp/dsh-media-skills-audit && git rev-parse HEAD
#   expect e682e265a5f7c7d46686ba76e27275175c0c0f7e

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dsh-media-skills-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "subprocess\|os.system\|child_process\|eval(\|exec(" index.js skills scripts   # none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" index.js skills | sort -u                        # 6 vendors
sed -n '112,125p' skills/vision-review/scripts/vision.py   # harness credential store read
sed -n '79,80p'   skills/media-tools/scripts/generate.py   # urlretrieve, no scheme check
node -e "console.log(require('./package.json').scripts)"   # undefined: no lifecycle hooks
```

## 8. Methodology and pinned inputs

- Subject: git commit `e682e265a5f7c7d46686ba76e27275175c0c0f7e` (shallow clone at
  `reference/audits/dsh-media-skills`)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full manual read of `index.js` (159 lines), `skills/vision-review/scripts/vision.py`
  (391), `skills/media-tools/scripts/generate.py` (107), `skills/vision-review/SKILL.md`,
  `skills/media-tools/SKILL.md`, `package.json`, `cordis.patch.yml`, `LICENSE`; directory listing
  and grep sweep over `docs/`, `examples/`, `scripts/`
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start at A. No dynamic execution, no process spawning, no lifecycle hooks, no
  telemetry, no writes outside a caller-named path. Two medium findings (harness credential-store
  read, unvalidated `VISION_FALLBACKS` egress) and one low filesystem finding pull it to B. Not
  higher than B because real secret material is read out of the harness credential store, and
  because no published artifact is bound to this commit by any provenance.

## 9. Strengths

1. Small enough to read end to end in one sitting: 159 lines of plugin plus 498 lines of Python,
   no build step, no bundled `dist`, no minified anything.
2. No lifecycle hooks at all. The manifest has no `scripts` field, so nothing runs at install time.
3. Settings seeding is additive and idempotent: only missing provider keys are written, existing
   user configuration is untouched, and failure is caught and logged rather than thrown
   (`index.js:126-148`).
4. Keys are never bundled or persisted by the plugin; the seeds carry `apiKeyEnv` names only.
5. Honest documentation, including a privacy section that tells users not to send sensitive images
   through the Gemini free tier because of Google's data-use terms.
6. Failover is visible: every engine failure is printed to stderr (`vision.py:377`), so a silent
   fallback to a different vendor cannot happen without the user seeing it.

## 10. Residual risks

1. Reading `~/.dsh/.credentials.yaml` means the skill can hold the same key as the main agent. A
   future change to which engines are tried would silently widen where that key is sent.
2. `VISION_FALLBACKS` has no host allowlist. Anyone who can write the user's environment or the
   secrets file can redirect every image and key to a host of their choosing.
3. `urlretrieve` on a vendor-supplied URL trusts the vendor's response for the scheme
   (`generate.py:80, 91`).
4. No provenance: nothing ties an installed npm tarball to this commit. Prefer installing from the
   pinned GitHub commit.
5. `Pillow` and `PyYAML` are undeclared runtime dependencies resolved from the user's Python
   environment.

## 11. Re-verify steps

1. Re-run the step 7 block against current HEAD. Any new literal URL, any new `apiKeyEnv` name in
   the engine tables, or any new credential path in `load_key` must be re-adjudicated before this
   grade carries forward.
2. Watch `package.json` for the appearance of a `scripts` field. Any `postinstall`/`preinstall`
   entry is a finding and invalidates this card.
3. If the project starts publishing to npm, re-check integrity and provenance and record them in
   the header before recommending the registry install path.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
