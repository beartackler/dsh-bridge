# Trust Report Card: xintaofei/codeg

## 1. Header

| Field | Value |
|---|---|
| Plugin | Codeg v0.28.1 (a multi-agent coding workspace desktop app: aggregates sessions from fifteen agent CLIs, delegates across agents over ACP, runs as a Tauri desktop app, standalone Rust server, or Docker container) |
| Pinned subject | github:xintaofei/codeg @ commit `4cf3869cd602eaf974fdceb9d85b095de50274f5` (default branch, head at audit time; last commit 2026-08-26) |
| Provenance | Git tree audited directly; release binaries are minisign-signed with the same key as the desktop updater and verified before install (src-tauri/src/update/verify.rs), but the released tarball itself was not downloaded or compared here |
| License | Apache-2.0 (LICENSE, 201 lines) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of installer, updater/signature path, ACP spawn layer, credential stores, web server auth, and parsers) |
| Revision | 1 |
| Grade | **D** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile was found - credentials land in the OS keyring or 0600 files, updates are minisign-
signed and fail closed, adapter packages are version-pinned, session archives structurally exclude
sibling credential files, and the web server token-gates everything including an empty-token fail-
closed check - but codeg earns a D because its headline install is an unpinned `curl | bash` that
executes a fresh binary from GitHub releases with no checksum step in the script, it provisions
agent runtimes by running npm installs (with lifecycle scripts force-enabled for one package) at
click time rather than shipping them pinned-and-audited, and adopting it means putting a wildcard-
bound, token-authenticated control plane over every agent CLI on your machine.

## 3. What this app can do

| Capability | Detail | Evidence |
|---|---|---|
| Install channel (headline) | README.md:162 documents `curl -fsSL https://raw.githubusercontent.com/xintaofei/codeg/main/install.sh \| bash`. The script resolves "latest" via api.github.com (install.sh:80), downloads `codeg-server` + `codeg-mcp` tarballs from GitHub releases (install.sh:345-352), checks archive contents exist (install.sh:363-370), then copies to `/usr/local/bin` with sudo as needed (install.sh:396-406). There is no signature verification, no SHA-256 pinning, and no `--version` default anywhere in the download path; the transport is HTTPS-only. Contrast: the Tauri updater path does verify minisign signatures (update/verify.rs:15-19). | install.sh:5, 80, 345-406; src-tauri/src/update/verify.rs |
| Credential access | GitHub tokens go to the OS keyring in desktop mode (`keyring::Entry`, SERVICE_NAME "codeg", keyring_store.rs:12-38); server mode falls back to a file store written 0600 with atomic rename (keyring_store.rs:126-155). Chat-channel tokens use the same stores. DEEPSEEK_API_KEY / provider env vars are read only to pass into spawned agent environments (commands/acp.rs:6385-6389, 9018-9021). Session-log ingestion deliberately scopes archives to `sessions/` subtrees so sibling credentials are never read: grok `auth.json` excluded (parsers/mod.rs:125-136), pi `auth.json` excluded (:150-159), DSH `.credentials.yaml` excluded explicitly (parsers/mod.rs:161-170). Codex OAuth device flow talks only to `auth.openai.com` (commands/acp.rs:12478-12479, 12649-12652). | file:line above |
| Network egress | All observed endpoints are first-party-by-function: GitHub API/releases for versions and downloads (update/version.rs:19-24; commands/acp.rs:2074 npm registry override for missing mirrors), models.dev provider catalog cached on disk (acp/opencode_catalog.rs:1-11), OpenAI device-code OAuth (commands/acp.rs:12478+). No telemetry, analytics, or beacon strings found in Rust or TS source (grep -il across src/ and src-tauri/src returned only unrelated identifiers). Model/provider traffic goes to user-configured base URLs (commands/acp.rs:7363). | file:line above + grep |
| Agent spawning (the core product) | Spawns agent CLIs as ACP subprocesses: npx-resolved adapters, uvx-pinned Python packages, or user-installed system binaries (acp/connection.rs:1690-1730; acp/registry.rs:547-865). Every registry package is exactly version-pinned: `@agentclientprotocol/claude-agent-acp@0.69.0` (registry.rs:547), `codex-acp@1.4.0` (:681), `gemini-cli@0.55.1` (:695), `deepseek-acp@0.6.0` (:1106), and so on. Version overrides are sanitized (commands/acp.rs:160-177). For one package (`hermes-agent`) the installer forces lifecycle scripts ON past a user's global ignore-scripts policy, documented as consent-by-install-action (commands/acp.rs:2097-2105, 2123-2125, 2280, 2396). | file:line above |
| Dynamic code execution | One scanner critical: `(0, eval)(APPEARANCE_INIT_SCRIPT)` inside src/lib/appearance-script.test.ts:21 - a jsdom test executing the app's own appearance-init string in a test environment, not shipped runtime behavior; adjudicated noise. Runtime TS shows no eval/exec patterns in reviewed surfaces; the Rust layer spawns argv-form processes without shell interpolation except where git's own hook protocol requires it (git_credential.rs:10-16 quoting helper). | src/lib/appearance-script.test.ts:17-21 |
| Web/server surface | The web control plane binds wildcard by default (`host: Mutex::new("0.0.0.0")`, web/mod.rs:65) so phone/tablet clients can reach it; every request passes `require_token` (web/auth.rs:21-44), which fails closed when the configured token is empty (auth.rs:23-25) and accepts bearer or WS-subprotocol tokens. Tokens are generated as UUIDv4-derived random (web/mod.rs:106-108) unless overridden by CODEG_TOKEN (docker-compose.yml:13). Docker publishes port 3080 (docker-compose.yml:6-7; README.md:176). This is a deliberate remote-access product posture, not a hidden one, but it is LAN-reachable attack surface by design. | web/mod.rs:65, 106-131; web/auth.rs:21-44; docker-compose.yml:6-13 |
| Update mechanism | Desktop updater active with embedded minisign pubkey and a single GitHub-releases endpoint (src-tauri/tauri.conf.json:41-48); downloaded server archives verify against the same key before extraction ("executing a downloaded binary without verifying its provenance would be the whole ballgame" - update/verify.rs:5-9). The curl installer does NOT get this protection (see install row). | tauri.conf.json:41-48; update/verify.rs |
| Obfuscation findings | All 22 high obfuscation hits trace to non-Latin text assets: Arabic i18n strings with RTL marks (src/i18n/messages/ar.json:184) and zero-width/BIDI formatting constants for CJK typography (src/components/ai-elements/streamdown-plugins.ts:108). Adjudicated as localization content, not concealment. | scanner adjudication |

## 4. Findings

| ID | Severity | Location | Note |
|---|---|---|---|
| CDG-CURL-1 | high | README.md:162; docs/readme/*.md:162; install.sh:345-406 | The documented Linux/macOS install executes whatever binary GitHub's "latest" release alias serves at click time, with no signature or hash verification inside the script. The project clearly knows how to do this (the updater verifies minisign signatures); the curl path simply predates or skips it. Any compromise of the release pipeline propagates directly to `sudo cp` into /usr/local/bin. |
| CDG-NPM-1 | medium | src-tauri/src/commands/acp.rs:2097-2105, 2123-2140; acp/connection.rs:1058 | Installing an agent through codeg runs `npm install -g <pinned-package>` locally, which executes that package's own lifecycle scripts under npm's default policy; for hermes-agent specifically codeg overrides a user-level `ignore-scripts=true` because its postinstall IS the bootstrap. Pins prevent version drift but not upstream-package compromise at the pinned version. |
| CDG-BIND-1 | medium | src-tauri/src/web/mod.rs:65; docker-compose.yml:6-7 | Default wildcard bind plus published container port means the agent-control API is reachable from your network segment whenever the server runs. Token auth is solid (fail-closed, random-generated), but a weak user-chosen CODEG_TOKEN converts this into unauthenticated remote code execution over your agent CLIs. Desktop users who never start the web service are unaffected. |
| CDG-ENV-1 | low | src-tauri/src/keyring_store.rs:164-186; commands/acp.rs:9018-9021 | Server-mode token files are plaintext-on-disk (0600, atomic) rather than keyring; acceptable for a headless server role but worth knowing. Provider API keys ride process environments of spawned agents by design of ACP. |
| CDG-SCOPE-1 | low (product scope) | whole app | The product's purpose is granting a UI (and optionally your LAN) coordinated control of full-capability coding agents across your repos; every delegated task can touch real worktrees. This is inherent to what it is, not a defect. |

### Scanner criticals adjudicated

- CRED critical on src-tauri/resources/opencode/models-dev.json:1: a bundled snapshot of the public
  models.dev catalog whose schema contains the literal string `AWS_SECRET_ACCESS_KEY` as a field
  name for provider metadata. It is data describing providers, not a secret.
- EXEC critical on src/lib/appearance-script.test.ts:21: indirect eval in a test file executing the
  app's own init script string under jsdom. Test-scope only.

## 5. What we could not check

- **Released binary provenance.** Release tarballs were not downloaded; signature verification was
  confirmed by reading update/verify.rs and its embedded key, not by executing it against a real asset.
- **Behavioral probe.** No sandboxed run of codeg-server or the desktop app; all spawn/auth/bind
  claims come from source review.
- **Full 17.7k-line acp.rs** was sampled around security-relevant regions, not read line by line;
  a subtle flaw deep in command handling would not necessarily have been caught.
- **Cross-model adversarial review** did not run (pipeline ceiling).

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Machine grade F versus adjudicated D;
nearly all machine severity traces to declarative JSON catalogs, i18n text, test-file eval, and the
bundled third-party models.dev snapshot. The two human-confirmed highs (curl-bash install, forced
lifecycle scripts) keep the grade in D territory per the band definitions (install-time hooks,
unverified install channel), despite unusually good hygiene everywhere else.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/xintaofei/codeg /tmp/codeg-audit
cd /tmp/codeg-audit && git rev-parse HEAD   # expect 4cf3869cd602eaf974fdceb9d85b095de50274f5

# 2. Re-run our scanner
node <dsh-bridge>/tools/scan/dist/index.js /tmp/codeg-audit   # expect grade F, gates incl. install-hook-shell

# 3. Confirm the headline claims
sed -n '160,165p' README.md                                   # expect the curl|bash one-liner
grep -nE "sig|minisign|sha256" install.sh                     # expect: no integrity check hits
grep -n "TAURI_PUBKEY_B64\|minisign" src-tauri/src/update/verify.rs | head   # updater DOES verify
grep -n 'package: "@agentclientprotocol' src-tauri/src/acp/registry.rs       # pinned adapter versions
grep -n '"0.0.0.0"' src-tauri/src/web/mod.rs                  # wildcard bind default
grep -n "is_empty" src-tauri/src/web/auth.rs                  # empty-token fail-closed

# 4. Check the credential-exclusion claim
grep -n "credentials.yaml\|auth.json" src-tauri/src/parsers/mod.rs   # sibling creds excluded from archives
```

If your output disagrees with this card, the card is wrong; please open an issue.
