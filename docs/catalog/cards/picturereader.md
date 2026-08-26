# Trust Report Card: picturereader

| | |
|---|---|
| **Grade** | **C** — usable after informed setup (manual adjudication; raw scanner output: F) |
| Plugin | picturereader v3.2.0 (github.com/jing-hy/picturereader) |
| Pinned subject (git) | `60a7f55fba51f9396b14bce9f7a942515c63592e` (default branch HEAD, committed 2026-08-25T12:27:43+08:00) |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, 37 files / 414 KB scanned |
| Methodology | Static scan (tool) + manual source review + local test run (`node --test`: 140 tests, 127 pass, 7 fail — all 7 failures are Windows-only OCR paths exercised on macOS). Behavioral probe (S4) and cross-model adversarial review (S5) have NOT run. |

A grade is evidence-backed opinion over the pinned commit above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

A large, well-tested local-first image toolkit whose heavy machinery (PowerShell OCR, Python venvs, optional external VLM) is real but purpose-evident; the C reflects three design decisions a cautious user must know before installing: it rewrites another installed package's source file at startup, it sends image data to a remote VLM endpoint by default configuration path, and its optional OCR setup scripts download executables over plain mirrors.

## What this plugin can do (capability surface)

| Capability | Present | Evidence |
|---|---|---|
| Network egress | Yes, two destinations | `POST {baseURL}/v1/chat/completions` with base64 image data URIs (`src/vlm.js:409-417`, endpoint assembly `src/vlm.js:400-408`) and a health probe `GET {baseURL}/health` (`src/vlm.js:238`). Default base is Zhipu's GLM endpoint `https://open.bigmodel.cn/api/paas/v4` (`src/vlm.js:146`) when no other is configured. Client bundle makes one same-origin call only: `GET /picturereader/models` (`client.js:265`). No telemetry hosts anywhere (grep over all sources: only bigmodel.cn, api.openai.com placeholder text, and pypi/npmmirror installer URLs). |
| Credential access | Its own key material only | Reads `SEE_API_KEY` / `GLM_API_KEY` env vars and `apiKey` fields from `~/.dsh/settings.yaml` tool-vision and picturereader namespaces (`src/vlm.js:153,157,174`). Keys are sent solely as `Authorization: Bearer` to the configured VLM endpoint (`src/vlm.js:395-397`). No reads of `.claude`, `.codex`, `.ssh`, browser stores, or any other secret surface. README documents keys as write-only settings (`README.md:186,279`). |
| Dynamic code execution | None | Grep for `eval(`, `new Function`, `vm.` over `src/` and `client.js`: zero hits. |
| Child processes | Extensive, all purpose-evident | Windows OCR via `powershell.exe -NoProfile -Command <static script>` with single-quote-escaped path/language interpolation (`src/core.js:1002-1020`, spawn at `src/core.js:1050`); Paddle/Rapid OCR via venv pythons running `-c` scripts (`src/core.js:1199,1254,1287`); document conversion via pinned venv python + bundled script (`src/doc-tools.js:78`); image editing via pinned venv python + bundled script (`src/image-edit.js:84`); optional local llama-server started detached, bound to 127.0.0.1 (`src/vlm.js:309`, args `src/vlm.js:266-291` including `--host 127.0.0.1` at line 289). |
| Timers / beacons | None hostile | Host-side: none found. Client-side `setInterval` polls the plugin's own `/picturereader/models` route every 5 s while the settings card is mounted (`client.js:268`); `setTimeout` at `client.js:471` refreshes a draft after reset. Both are UI-local. |
| Obfuscation signals | None | No atob/btoa payload decoding (only legitimate image/base64 data-URI encoding), no hex blobs, no minified code. Scanner OBFU hits are npm integrity hashes in `package-lock.json`. |
| Machine fingerprinting | None | No hostname/userInfo/os calls outside `homedir()` for settings paths. |
| npm lifecycle hooks | None | `package.json` scripts contain only `test`. Dependencies are three pure-JS image codecs (jpeg-js, omggif, pngjs). |
| Services registered | Tools, skills, routes, settings | Image tools registered on `ctx.tools` (`src/index.js:281-286`), a models route `/picturereader/models` serving a cached JSON list from disk (`src/index.js:312-325`), settings namespace under `settings`+`llm` inject gate (`src/index.js:344-349`), two skill files. |

Data-flow note: in smart/strict modes the model may pass user images (as base64 data URIs) to whatever VLM endpoint is configured — by default open.bigmodel.cn with a free-tier GLM key. Privacy mode hard-blocks this (`src/routing.js:54-56`: `vlmAllowed` returns false for privacy; enforced through `src/runtime.js:124`). This is the plugin's stated design and documented in the README (`README.md:67,112`), but users should understand images leave the machine unless privacy mode is selected.

## Findings

Raw scan retained at `reference/audits/picturereader.scan.json`: 37 files scanned, 80 findings (0 critical, 41 high, 8 medium, 7 low), mechanical grade F (gates `cred-plus-net`, `dynamic-exec-present`, `finding-density`). Adjudication of every non-low family:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| EXEC-024 x2 | `src/core.js:1050`, `tests/ocr.test.js:28`, `tests/rapid.test.js:33` | high | Real PowerShell invocation, but the command string is built from static statements plus a single escaped value (`src/core.js:996-1002`: `esc()` doubles single quotes; the interpolated values are the temp PNG path and a language tag, both produced by the plugin itself, not raw model input). Runs Windows.Media.Ocr and returns JSON. Not code injection as written; flagged as inherent PowerShell surface. Tests are dev-only. Kept as documented risk, not exploit. |
| EXEC-004/005 cluster (~20 sites) | `src/core.js:25,1199,1254,1287`; `src/doc-tools.js:31,78`; `src/image-edit.js:29,84`; `src/vlm.js:12,309`; `scripts/setup-*.mjs` | high | All spawns target fixed venv interpreters or the user-configured llama-server executable with plugin-built argument arrays; arguments are not free-form shell strings. Setup scripts run only when invoked manually (`node scripts/setup-ocr.mjs` etc., per hints in `src/tool.js:393-394`); nothing invokes them at runtime. Downgraded to documented capability. |
| NET-001/007 (egress) | `src/vlm.js:238,409`; defaults `src/vlm.js:140,146,157` | high | Real: images plus prompts go to the configured OpenAI-compatible endpoint; default endpoint is Zhipu GLM. Purpose-evident (a vision bridge), gated by mode routing, and disclosed in README (`README.md:112,331`). Counts against the grade, not a violation. |
| CRED-007 x4 | `src/vlm.js:153,174` (+ test-file echoes) | medium | Reads only the plugin's own API-key env vars/settings fields; never persists or transmits them anywhere except the VLM Authorization header. Test hits set a throwaway `__PR_TEST_KEY__`. Downgraded to expected behavior. |
| HOOK-005/006 | `src/index.js:345` (top-level async IIFE inside apply wiring), `client.js:470` setTimeout, `client.js:268` setInterval | medium | Model-scan bootstrap and UI draft refresh; no network attached to timers beyond the same-origin models poll. Downgraded to info. |
| NET-007 in tests | `tests/mode.test.js:60-174` | high | Literal URLs in unit-test fixtures exercising mode routing. Dev-only. Not present. |
| OBFU-012 / NET-008 | `package-lock.json` integrity hashes and registry URLs | low | Metadata noise. Not present. |

CRED+NET compounding rule triggered mechanically (key env vars + remote fetch in one module) but the credential flow terminates at the user-configured inference endpoint, so the mechanical F does not describe exfiltration behavior.

## Strengths

- Local-first architecture with a genuine privacy mode enforced in shared routing code (`src/routing.js:54-56`), not just documentation.
- Substantial test suite (140 tests across 12 files) covering decode, batch, pipeline, modes, and tools; 127 pass on macOS, and every failure traced to Windows-only OCR paths, not logic errors.
- Child-process inputs are escaped or path-pinned; llama-server binds loopback explicitly (`src/vlm.js:289`).
- No dynamic code execution, no obfuscation, no telemetry, no lifecycle scripts; runtime dependencies are three auditable pure-JS codecs.
- Bounded resource use throughout (200 MB input cap `src/image-edit.js:41`, timeouts on every spawn/fetch).
- MIT license.

## Residual risks

1. **Startup patching of another package.** `ensureSettingsNamespaceExposed` locates the installed `dsh-host-apiproxy/lib/index.js` through the host's module cache and rewrites its `WEB_SETTINGS_NAMESPACES` allowlist with `writeFileSync` (`src/settings-expose.js:13,41-50`, called unconditionally from `apply` at `src/index.js:270`). The edit is idempotent and scoped to adding one namespace string, but a third-party plugin silently editing a first-party package's shipped source on every boot is a trust-boundary crossing this card cannot fully bless. It is NOT disclosed in the README.
2. **Default cloud VLM.** With no configuration, images flow to open.bigmodel.cn using a key the user must obtain (`src/vlm.js:146,153`). Privacy mode avoids this, but smart is described as the default mode fallback (`src/routing.js:46` normalizes unknown values to smart).
3. **Windows-only setup scripts download installers** from npmmirror/Tsinghua mirrors and run them (`scripts/setup-ocr.mjs:23-24,39-48`). Manual, opt-in, mirror-pinned, but unsigned binaries.
4. Hardcoded author-machine paths in setup scripts (`C:\Users\Administrator\...`, `scripts/setup-ocr.mjs:19-21`) mean those scripts fail as-is on most machines; harmless but sloppy.
5. The `/picturereader/models` route has no authentication of its own and serves cached model names to any origin the harness web server trusts; impact limited to model-list metadata.
6. Static analysis only; behavioral probe and cross-model review pending pipeline availability. Re-vet any version newer than 3.2.0.

## Verify this yourself

```bash
git clone --depth 1 https://github.com/jing-hy/picturereader && cd picturereader
git rev-parse HEAD        # 60a7f55fba51f9396b14bce9f7a942515c63592e at audit time

# Every egress site
grep -rn "fetch(" src/ client.js          # src/vlm.js:238,409 + client.js:265 (same-origin)

# The self-patch of dsh-host-apiproxy
sed -n '13,50p' src/settings-expose.js

# Escaped PowerShell construction
sed -n '996,1020p' src/core.js

# No dynamic execution
grep -rn -E "\beval\(|new Function|vm\." src/ client.js   # expect: no hits

npm install --ignore-scripts && node --test   # 140 tests; 7 Windows-OCR failures on non-Windows
```

## Methodology and pinned inputs

- Charter: `CHARTER.md` (every claim cites file:line). Pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, run once over the shallow clone; raw JSON at `reference/audits/picturereader.scan.json`.
- Manual review covered: package.json, cordis.patch.yml, all 17 `src/` modules, `client.js`, all five setup scripts, both Python scripts, skills, README claims versus code, and full findings adjudication. Tests executed locally on macOS/aarch64, Node v26.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `60a7f55` (v3.2.0) | C | Initial card. Static + manual + local test run; probe/review pending pipeline availability. |
