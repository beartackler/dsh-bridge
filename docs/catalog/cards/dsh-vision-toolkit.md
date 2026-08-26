# Trust Report Card: @anionex/dsh-vision-toolkit

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@anionex/dsh-vision-toolkit` (vision bridge plugin for DSH: image Q&A, OCR, grounding, UI restoration, pixel diff, Artifacts, Web UI) |
| Pinned subject | github:Anionex/dsh-vision-toolkit @ commit `780b47ac29d6f97b217ec4a895d431b8d37c39b1` (package version 0.1.39, HEAD at audit time) |
| npm integrity | `registry.npmjs.org/@anionex/dsh-vision-toolkit/0.1.39` resolves and publishes today, but the registry returns **no attestation record** for this package and no `gitHead` field, so the tarball cannot be bound to the audited commit |
| Provenance | None verifiable end to end. The repo vendors its Python upstream as a sha256-manifested snapshot (vendor/agent-vision-toolkit/UPSTREAM_MANIFEST.json), which is good discipline, but the shipped JS bundle itself has no equivalent binding |
| License | MIT (LICENSE:1-3, badge confirmed) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile found: every network destination is named in this card, the Python runtime it
downloads is hash-verified against a pinned manifest, headless-Chrome work runs in a throwaway
profile with a mock keychain and a blackhole proxy, and there is no telemetry, obfuscation, or
dynamic code execution; the grade is capped by unverifiable npm provenance, a default egress
endpoint operated by the plugin's own author, a mirror-first pip install path, and built-in
self-update machinery.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Image bytes and prompts go only to the configured vision provider. The DEFAULT provider base URL is the author-operated free service `https://vision.anionex.me/v1` (src/defaults.ts:2, schema default src/config.ts:118). Users can point it at any OpenAI-compatible or Anthropic endpoint instead (src/config.ts:189-192 validates scheme). The Python client posts only to `VISION_BASE_URL` handed to it (vendor/agent-vision-toolkit/vision_client.py:209,277). Runtime bootstrap downloads come from a four-host allowlist: github.com, objects.githubusercontent.com, release-assets.githubusercontent.com, and a Tencent COS mirror bucket (src/runtime-install.ts:419-424). pip installs try the Tencent PyPI mirror first, then fall back to the default index (src/runtime-install.ts:212-217). Proxy support honors the environment (EnvHttpProxyAgent, src/runtime-install.ts:33-34). | file:line above |
| Default egress to a first-party service | With zero configuration, pasted images and their prompts are uploaded to `vision.anionex.me` using a built-in shared credential constant (src/runtime.ts:856-858 resolves `BUILT_IN_FREE_VISION_KEY` = `https://agent-vision.anionex.me`, src/defaults.ts:4). This is disclosed in-product (Settings links the setup guides; docs/dsh-desktop-install.md:37 calls it "the built-in free vision service") but the destination is the author's own infrastructure, not a neutral vendor. | file:line above |
| Child processes | Spawns only the prepared Python interpreter against the vendored upstream scripts, through the host's subprocess service with capped stdio (src/upstream.ts:776-800). API-calling tools run behind a guard that injects an untrusted-image policy prefix into every vision prompt and normalizes grounding labels (src/upstream.ts:528-557). `html_screenshot` runs headless Chrome with `--use-mock-keychain`, a TemporaryDirectory profile, `--incognito`, `--disable-background-networking`, and a blackhole proxy (`--proxy-server=http://127.0.0.1:9`, src/upstream.ts:560-579). A separate updater spawns pnpm and a detached Node restart helper (src/plugin-update.ts:241,262,509). All argument lists are arrays; no shell interpolation anywhere in src/. | file:line above |
| Credential reads | Reads exactly one credential: the vision provider key, resolved through the host credentials service at operation time (src/runtime.ts:855-866) and passed only into the vision subprocess environment (src/upstream.ts:754). It is hashed, never stored, for cache fingerprints (src/runtime.ts:718,1160) and registered as a secret for redaction (src/runtime.ts:1182). Updater error output is scrubbed of keys, URLs-with-credentials, bearer headers, and npm tokens (src/plugin-update.ts:612-618). No .ssh, .aws, browser stores, or OS keychain access; SECURITY.md:44-46 declares mock-keychain an expected property. | file:line above |
| Filesystem writes | Workspace-scoped artifacts and caches under `<workspace>/.dsh-vision-toolkit/` with symlink refusal and containment checks (src/runtime.ts:886-909, src/paste-images.ts:192), the managed Python runtime under the DSH home, and update backups written 0600 in 0700 dirs (src/plugin-update.ts:550-568). Paste uploads land in the visible workspace only (src/paste-images.ts:1-18). | file:line above |
| Dynamic code execution | None. No eval(), new Function(), vm.*, or dynamic import() in src/. The scanner's criticals on lib/plugin-update.js:9,39 are the import/require of node:child_process used by the documented self-updater, not string-eval. The restart helper source is embedded as a template string and executed via `node -e` (src/plugin-update.ts:120-509) - that is deliberate, auditable code, not obfuscation, but it is executable-string machinery worth knowing about. | grep + manual read |
| Telemetry | None. No analytics/beacon/metrics code in src/, lib/, workers/, or scripts/ (negative grep, zero hits). | negative claim, scope stated |
| Self-update | Web Settings can make the plugin reinstall itself from npm (registry-installed copies only; link/file/git installs are refused, src/plugin-update.ts:8-10 and registryInstallSpec) including killing and restarting the host process behind a health-checked rollback (src/plugin-update.ts:96-119). Triggering is a user click in Settings, not automatic. | file:line above |
| Web routes | Settings, display-config, paste-policy, and paste-image routes are registered on the host loopback web server and fenced by a same-origin check that rejects cross-site Sec-Fetch-Site and mismatched Origin (src/web-request.ts:11-31; applied at src/web.ts:382,465,527). Artifact downloads require HMAC-signed single-use-style capability tokens (src/artifact-access.ts:300-345). | file:line above |

What ships vs what is only in the repo: the npm `files` array ships lib, src, examples, docs,
assets, patches, runtime, vendor (package.json). The Cloudflare Worker proxy under workers/ is
NOT shipped to users; its scanner findings (atob/setTimeout type noise) do not ride along.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 249 findings (2 critical, 196 high, 18 medium, 33 low), machine grade F. The high
count is dominated by NET literal-URL matches in documentation strings and by lib/*.js.map
sourcemaps duplicating every src finding. Adjudication of the security-relevant subset:

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC dynamic-eval x2, lib/plugin-update.js:9,39 | Real but documented: import/require of node:child_process backing the Settings-triggered self-updater. Arguments are constructed arrays; the helper payload is a signed-in-token lock file, not attacker input. Kept as MODL-VTK-EXEC-1 below. | file read |
| NET "decoded at runtime" family | decodeURIComponent/atob hits are artifact-token URL parsing (src/artifact-access.ts:346, lib mirror :325) and base64 image fixtures in the unshipped worker (workers/moondream-openai-proxy/src/image.ts:18). No URL decoding feeding execution. False positives. | file read |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| VTK-NET-1 | medium | src/defaults.ts:2; src/config.ts:118 | Default vision endpoint is the author's own service. Documented in-product, changeable in Settings, but out-of-the-box image upload lands on first-party infrastructure. |
| VTK-NET-2 | medium | src/runtime-install.ts:419-424 | Python bootstrap accepts a Tencent COS mirror alongside GitHub release hosts; artifacts are sha256-verified against the pinned manifest either way (src/runtime-install.ts:373-386,475-486), so this is availability redundancy, not a silent channel. |
| VTK-NET-3 | low | src/runtime-install.ts:212-217 | pip tries mirrors.cloud.tencent.com before the default index. Requirements are version-pinned (runtime/requirements.lock:1-3: pillow==12.3.0, numpy==2.4.6, vtracer==0.6.15) but not hash-pinned; a compromised mirror could serve tampered wheels under pinned versions. |
| VTK-CRED-1 | medium | src/runtime.ts:854-880; src/upstream.ts:754 | The resolved provider key travels into the Python subprocess environment. Contained to processes this plugin spawns; redacted from errors and logs; never rendered to the model. |
| VTK-EXEC-1 | medium | src/plugin-update.ts:509 | Self-update spawns a detached `node -e` restart helper from an embedded source string. Auditable in-repo, consent-gated via Settings, but it is executable-string machinery that future revisions must keep honest. |
| VTK-HOOK-1 | low | package.json scripts | Build/test hooks only at publish time; no postinstall. Verified by reading package.json scripts block. |

### Scanner noise dismissed (with scope)

- ~180 NET highs: documentation URLs (developers.cloudflare.com, developer.mozilla.org,
  rfc-editor.org, example.com fixtures) and the lib/*.js.map duplicates of src findings.
- OBFU family: decodeURIComponent/atob in token parsing and image fixtures (see criticals).
- HOOK/EXEC in workers/moondream-openai-proxy: setTimeout/setInterval type declarations and
  test code; the worker is not in the shipped files list.
- SUPPLY high on package.json repository URL: standard metadata.

### Negative claims and what was searched

Searched all of src/, lib/, workers/, scripts/, runtime/, vendor/, .github/ (154 files scanned;
production sources read directly): no eval/new Function/vm; no reads of .ssh, .aws, browser
profiles, or OS keychains; no telemetry endpoints; no timers beaconing; no writes outside the
workspace, DSH home, and OS temp; no network destination outside the set named in section 3;
no install-time lifecycle hooks.

## 5. What we could not check

- **Published tarball vs repo.** No npm attestation and no gitHead: nobody can prove the
  published 0.1.39 equals commit 780b47a without rebuilding. This alone caps the grade at C
  under the pipeline rules.
- **Behavioral probe.** No sandboxed load/invoke/idle-soak run (pipeline S4 unavailable).
- **Python transitive deps.** pillow/numpy/vtracer resolve from a mirror or PyPI at prepare
  time; their transitive trees are not hash-locked.
- **The vendor-operated endpoint's behavior.** What vision.anionex.me retains beyond serving
  requests is outside this artifact; treat default-mode images as going to a third party.
- **vendored upstream Python** (commit bc9803d, contentSha256-verified at install time) was
  spot-read (vision_client.py, bin/) not exhaustively reviewed.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner's F disagrees with
the manual C; both positions are recorded here and in section 4.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Anionex/dsh-vision-toolkit /tmp/vtk-audit
cd /tmp/vtk-audit && git rev-parse HEAD   # expect 780b47ac29d6f97b217ec4a895d431b8d37c39b1

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/vtk-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
cat src/defaults.ts                                  # the built-in endpoint constants
sed -n '118,124p' src/config.ts                      # provider defaults
sed -n '419,424p' src/runtime-install.ts             # download host allowlist
grep -rn "eval(\|new Function(\|vm\." src            # dynamic exec: none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" src | sort -u # egress set

# 4. Confirm provenance status
npm view @anionex/dsh-vision-toolkit dist.attestations dist.tarball
#   expect: no provenance object (this is why the grade is capped at C)
```

## 8. Methodology and pinned inputs

- Subject: git commit `780b47ac29d6f97b217ec4a895d431b8d37c39b1` (clone refreshed at reference/audits/dsh-vision-toolkit)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...21041f3`
- Review: full read of src/{defaults,config,runtime-install,plugin-update,upstream,runtime,web-request,web,paste-images,artifact-access,exposure,paths}.ts, vendor/agent-vision-toolkit/{vision_client.py,UPSTREAM_MANIFEST.json}, runtime/requirements.lock, package.json, cordis.patch.yml, SECURITY.md, spot-reads of lib/ bundle parity
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no hostile indicators; multiple mediums all tied to documented product
  behavior; provenance unverifiable and no behavioral probe, so the C ceiling applies.

## 9. Strengths

1. Hash-verified vendored upstream: every packaged Python file is sha256-listed in a manifest
   checked before use, and downloaded bootstraps are streamed-hashed against pins
   (src/runtime-install.ts:240-295, 475-486).
2. Headless Chrome hardened beyond common practice: mock keychain, throwaway profile, incognito,
   disabled background networking, blackhole proxy (src/upstream.ts:568-571).
3. Prompt-injection policy injected into every vision-model call at the adapter layer
   (src/upstream.ts:536-543), plus label normalization for grounding output.
4. Secrets discipline: credential resolved at the last moment, hashed for fingerprints,
   registered for redaction, scrubbed from updater output (src/runtime.ts:718,1182;
   src/plugin-update.ts:612-618).
5. Same-origin fences on every web route and HMAC capability tokens on artifact downloads
   (src/web-request.ts:11-31, src/artifact-access.ts:300-345).

## 10. Residual risks

1. Default mode sends your images and prompts to the author's own hosted service under a shared
   built-in credential. If you would not hand those images to a third party, configure your own
   provider before first use.
2. Published npm artifact cannot be tied to this commit (no attestation). Installing from npm
   trusts the publisher channel, and the plugin's self-updater keeps that channel warm.
3. Mirror-first pip with version pins but no hash pins leaves a supply-chain seam during first
   runtime preparation.
4. The embedded `node -e` restart helper is legitimate today; any future change to
   PLUGIN_RESTART_HELPER_SOURCE deserves a fresh read before updating.
5. Single-reviewer audit; no behavioral probe ran.

## 11. Re-verify steps

1. Re-run step 7 against current HEAD; a new literal host in the egress sort, a new lifecycle
   hook, or changes to PLUGIN_RESTART_HELPER_SOURCE require re-adjudication.
2. Watch for npm attestations appearing on @anionex/dsh-vision-toolkit; provenance plus a
   rebuild comparison is the path to a higher band.
3. On any upstream bump, diff vendor/agent-vision-toolkit/UPSTREAM_MANIFEST.json commit and
   re-read the guard wrappers in src/upstream.ts (they are the actual sandbox boundary).
