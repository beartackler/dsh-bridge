# Trust Report Card: dsh-vision (`@linenxi-ctrl/dsh-vision`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@linenxi-ctrl/dsh-vision` - adds an external vision model to DSH: a browser floating button and config panel, drag-in image recognition that pipes results back into the session, plus an agent-side `screenshot` + `recognize_image` tool pair. Multi-protocol (OpenAI/Anthropic/Gemini/custom). |
| Pinned subject | github:linenxi-ctrl/dsh-vision @ commit `50f6ba065e8cf42c4ecc5a06c4e96dc2d5c69b11` (default branch `main` head at audit time; also the published v0.2.6 `gitHead`) |
| npm integrity | Published tarball for 0.2.6 downloaded and byte-compared: `lib/tool.js` and `lib/index.js` identical to the audited clone. No provenance attestation. |
| Provenance | Moderate. gitHead matches the audited commit exactly and the tarball matches the repo, but publishing is not attested and the workflow files are not in the repo. |
| License | MIT declared in package.json:52; LICENSE file present. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review + tarball byte-compare) |
| Revision | 1 |
| Grade | **B-** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The plugin sends your images and its one API key to exactly one place - the API base URL you
type into its own panel - and nothing else, but it ships a one-click installer that rewrites
DSH configuration files and can download a Node.js runtime from third-party mirrors without
checksum verification.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Every outbound request goes to `cfg.apiBase`, a user-configured settings value (default `https://api.openai.com/v1`), via hand-written node:http/https including an optional user-configured proxy. Endpoints: `{base}/chat/completions`, `/responses`, `/v1/messages`, `/models/{m}:generateContent`, `/models` for list fetches. No hardcoded third-party host anywhere. | lib/index.js:35-44, 84-185, 201-285, 321-368 |
| Credential handling | One secret: the vision API key, stored via the official DSH settings service (`z.string().role('secret')`). The HTTP config route never returns it - GET reports only `apiKeyConfigured`; POST accepts it but empty means keep-existing; field whitelist blocks unknown keys. The key is attached as Bearer/x-api-key/x-goog-api-key solely to the apiBase requests above. Reads no other env vars or files beyond the installer's DSH-home discovery (`DSH_HOME` env). | lib/index.js:36, 488-510, 128-131, 151, 335; install.mjs:46 |
| Screenshot tool (agent plane) | Registers `screenshot`: captures the screen to a UUID-named temp PNG using platform tools (`screencapture` on macOS, PowerShell System.Drawing on Windows, ImageMagick `import` on Linux) via `execFile` with fixed argument lists, no shell. Registers `recognize_image`: reads a caller-supplied image path (20 MB cap) and forwards it to the vision service. Injects system-prompt guidance telling the model how to use both. | lib/tool.js:42-60, 93-125, 16-17 |
| HTTP routes exposed | `/api/vision/recognize` (image -> text), `/api/vision/config` (GET safe view / POST update), `/api/vision/models` (list models using draft credentials from the panel). Request bodies are size-capped. These ride the DSH web server's own auth posture; the plugin adds none of its own. | lib/index.js:467-545, 409-431 |
| Client UI | Browser bundle: floating button, draggable panel, toasts. Talks only to same-origin `/api/vision/*`. No external scripts, fonts, or beacons. | lib/client.js:185-189, 304-308, 424-426, 441 |
| Installer (opt-in script) | `node install.mjs` / `install.sh` / `install.bat` locate `~/.dsh`, copy itself into profile `node_modules`, append plugin rows to each profile's `cordis.patch.yml`, create a `vision` agent preset cloned from the shipped standard preset, set it as default in `settings.yaml`, with idempotent guards. If Node is missing, `install.sh` downloads a Node tarball from npmmirror/Huawei/Tencent mirrors; `bootstrap-node.ps1` does the same on Windows. | install.mjs:43-130, 156-214; install.sh:41-66; bootstrap-node.ps1:40-64 |
| Uninstaller | Symmetric removal of copies, patch rows, preset, and default-preset key. Idempotent. | uninstall.mjs:1-30 |
| Child processes / dynamic exec | Runtime code: zero. The scanner's EXEC critical/high findings are the `execFile` import and three fixed-argument screenshot invocations in lib/tool.js, plus regex `.exec()` identifier collisions across index.js/spa/multi-site test scripts. No `eval`, `new Function`, or `vm` anywhere in the package. | lib/tool.js:17, 54-58; grep negative otherwise |
| Telemetry | None. | grep negative |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.

**19 findings** (1 EXEC critical, 18 high: 13 NET, 3 EXEC, 1 CRED, 1 shell-invocation;
1 medium HOOK). Machine verdict **F**, off gates `cred-plus-net-package`,
`dynamic-exec-present`, `finding-density`. Manual adjudication follows.

### Scanner highs and mediums adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical + high x3, lib/tool.js:17,54,56,58 | The screenshot feature. Three `execFile` calls with constant program names and fixed args; the only interpolated value is the output temp path, single-quote-escaped for the PowerShell case. This is what "take a screenshot" must do on each OS. It does mean installing the tool grants the agent screen-capture ability by design - that capability should be consented to knowingly, hence the cap noted below. | lib/tool.js:43-60, 120-124 |
| EXEC-024 shell-invocation high, lib/tool.js:54 | PowerShell invoked with `-NoProfile -NonInteractive -Command <script>`; script is assembled from constants plus the escaped temp path. Not a shell-injection surface from model input (the model never supplies the path). | lib/tool.js:44-54 |
| CRED high CRED-010, install.mjs:87 | False positive: the matched line is a log string mentioning `.dsh/profiles/*/node_modules`. The installer's real credential-adjacent behavior is limited to locating the DSH home and rewriting its YAML configs (see residual risk 2). | install.mjs:87, 43-58 |
| NET high x3, install.sh:55-57 | Node runtime download from three Chinese mirrors (npmmirror, Huawei Cloud, Tencent Cloud) when Node is absent. TLS transport, pinned fallback version v24.19.0, dynamic latest-LTS resolution from npmmirror's index.json. **No checksum verification of the downloaded tarball on either platform.** This is the weakest link in the package. | install.sh:49-66; bootstrap-node.ps1:33-64 |
| NET high x10, lib/client.js:185,304,424,441 + lib/index.js request sites | All same-origin `/api/vision/*` calls and all apiBase-derived requests described in section 3. The destination is user configuration; the default is api.openai.com. | section 3 rows 1-4 |
| HOOK medium, lib/client.js:437 | Regex `.exec()` collision inside the client bundle (scanner flags `exec(` identifiers). Not a lifecycle hook; package.json declares none. | lib/client.js:437 area; package.json has no scripts field |

### Tarball comparison

`npm pack @linenxi-ctrl/dsh-vision@0.2.6` yields 14 files matching the `files` whitelist.
Byte-compare of `lib/tool.js` and `lib/index.js` against the audited clone: **identical**.

## 5. What we could not check

- **The vision API endpoint itself.** Whatever apiBase the user points at receives images
  (potentially screenshots containing sensitive content) and the API key. That is the product,
  but the destination is entirely user-controlled and unverified.
- **Publishing channel.** npm has no attestation for this package and the repo contains no CI
  workflow; the gitHead match and tarball equality are the only supply-chain evidence.
- **Mirror integrity.** The Node auto-download path was reviewed statically; the mirror
  responses were not fetched or hash-checked during this audit.
- **Behavioral probe.** No sandboxed load/activate/invoke run.
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says B-. The gate deltas: cred-plus-net fires
because one API key and one fetch share a module, but the key authenticates the very endpoint
being called and never travels anywhere else; dynamic-exec is the screenshot tool's fixed
execFile calls, which are the advertised feature.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/linenxi-ctrl/dsh-vision /tmp/vision-audit
cd /tmp/vision-audit && git rev-parse HEAD   # expect 50f6ba065e8cf42c4ecc5a06c4e96dc2d5c69b11

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/vision-audit   # from a dsh-bridge checkout

# 3. Spot-check headline claims
grep -rnE "eval\(|new Function|vm\." lib/                 # expect: no hits
grep -rn "http" lib/index.js | grep -v "//" | grep -vi "node:" | head   # expect only cfg.apiBase-derived URLs
grep -n "apiKey" lib/index.js                             # expect role('secret'), redacted GET, whitelisted POST
sed -n '43,60p' lib/tool.js                               # the three execFile screenshot paths
sed -n '486,510p' lib/index.js                            # config route: secret never returned

# 4. Read what npm actually ships and compare
cd /tmp && npm pack @linenxi-ctrl/dsh-vision@0.2.6 && tar -xzf linenxi-ctrl-dsh-vision-0.2.6.tgz
diff package/lib/tool.js /tmp/vision-audit/lib/tool.js    # expect: identical

# 5. Inspect the installer's network behavior yourself
sed -n '49,66p' install.sh                                # mirror downloads, note absent checksum checks
```

## 8. Methodology and pinned inputs

- Subject: git commit `50f6ba065e8cf42c4ecc5a06c4e96dc2d5c69b11` (shallow clone at
  reference/audits/dsh-vision); equals published 0.2.6 gitHead
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest above; run recorded in section 4
- Review: full read of lib/{index,tool,client}.js (1203 lines), install.mjs, uninstall.mjs,
  install.sh, bootstrap-node.ps1, cordis.patch.yml, package.json; npm tarball byte-compare
- Cross-model review: NOT performed (single reviewer). Revision 1 capped accordingly.
- Grade derivation: after adjudication no exfiltration, telemetry, dynamic execution, or
  hidden credential access remains; the API key is well-guarded in transit and at rest through
  the official settings seam; the tarball provably matches the audited commit. Caps applied:
  checksum-less Node downloads in the optional installer, config-file rewriting by the
  installer, screen-capture exposure granted to the agent by design, no publish attestation,
  no behavioral probe, single reviewer. Result: **B-**.

## 9. Strengths

1. Secret hygiene is genuinely careful: the key is marked `role('secret')`, never echoed back
   over HTTP, updatable with empty-means-keep semantics, and attached only to apiBase requests
   (lib/index.js:36, 488-510).
2. Zero runtime dependencies; every protocol adapter is hand-written against node:http(s),
   so the supply-chain surface is just DSH peers (package.json peerDependencies block).
3. The custom-protocol template interpolates JSON.stringify-ed values rather than raw strings,
   and response extraction is dot-path based, not eval-based (lib/index.js:165-184, 70-78).
4. Installer/uninstaller pair is idempotent, guards against a known corrupt-YAML failure mode
   from earlier versions, and explains every step it takes (install.mjs:91-127).
5. Image size caps enforced on both the tool path and the HTTP route (20 MB) with body-size
   caps on every route (lib/tool.js:100; lib/index.js:28, 413-419).

## 10. Residual risks

1. **Checksum-less runtime downloads.** `install.sh` and `bootstrap-node.ps1` execute a Node
   binary fetched from a mirror with no hash verification (install.sh:59-66;
   bootstrap-node.ps1:47-64). A compromised mirror or MITM yields code execution. Users with
   Node already installed never hit this path; users without it should prefer installing Node
   from the official distribution first. This is the single highest-value fix for this package.
2. **The installer mutates your DSH configuration**: appends to every profile's
   `cordis.patch.yml`, creates and selects a new default agent preset, and edits
   `settings.yaml` (install.mjs:92-127, 172-214). Prefer the plain `dsh plugin add` registry
   path, which skips most of this.
3. **Screen capture is an agent tool.** Once mounted, the model can screenshot at will and
   ship the pixels to whatever apiBase is configured. Screenshots routinely contain secrets.
   Grant the preset deliberately.
4. **No publish attestation and no CI in-repo**, so future releases have weaker provenance
   than today's verified gitHead match.
5. `/api/vision/models` accepts draft credentials from the request body and will issue
   requests to arbitrary attacker-specified apiBase values if a malicious page can reach the
   DSH web server (lib/index.js:518-537); protection depends entirely on DSH's own origin
   fencing, not this plugin.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any second env var read, any hardcoded
   remote host, any eval-family call site forces re-adjudication.
2. Check whether the installer grew checksum verification for Node downloads; if so, residual
   risk 1 closes and this card should be re-graded.
3. Confirm the published gitHead still matches main HEAD on any new release, and re-diff the
   tarball.
4. Re-run our scanner after any heuristics-corpus bump; digest recorded in section 8.
5. Re-vet at 90 days or on the next release, whichever comes first.
