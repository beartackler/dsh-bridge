# Trust Report Card: desktop-cc-gui (zhukunpenglinyutong/desktop-cc-gui)

## Header

| Field | Value |
|---|---|
| Plugin family | ccgui 0.9.3 (Tauri 2 desktop client; explicitly NOT a dsh-plugin and not installable via `dsh plugin add`, README.md:16-18) |
| Pinned subject | github:zhukunpenglinyutong/desktop-cc-gui @ commit `5d1c8a01a2ca8812e96877197127cc6038521a1e` |
| Published-artifact provenance | Not an npm package; distributed as Tauri installers from GitHub Releases. No npm attestation exists for the release channel; updater integrity rests on the minisign pubkey embedded at src-tauri/tauri.conf.json:73 (release artifacts themselves not downloaded or hash-compared in this audit) |
| Upstream HEAD at audit | 2026-08-22 22:04:37 +0800 (merge of v0.9.3 version bump) |
| License | MIT, dual copyright Thomas Ricouard / zhukunpenglinyutong (LICENSE:3-4) |
| Repo age / activity | 4.1k stars (discovery snapshot 2026-08-19); active, pushed within last 25 days |
| Audit method | dsh-bridge static scanner v0.1.0 (rulesDigest `9cc04224...`) + manual adversarial review of all critical and sampled high findings. No behavioral probe (S4), no dual-model pass (S5). |
| Verified at | 2026-08-26T09:10Z |
| Revision | 1 |

## Verdict in one sentence

Use with awareness: nothing hostile was found in the engine adapters or process boundaries, but this desktop client ships non-opt-in Baidu web analytics into its production main window, auto-checks a GitHub update feed on every startup with one-click install, binds an optional remote-control web service on all interfaces, and reads/writes the Claude and Codex credential files it manages - capabilities that go far beyond a plugin's threat model.

## Grades

### Overall: C

Ceilings applied:

1. Full-pipeline ceiling C (docs/trust/pipeline-architecture.md, S6): no behavioral probe, no cross-model review. Nothing found here rises to D under the grading bands (no undocumented exfil path, no obfuscated execution), but several product-level behaviors sit exactly on the "real capabilities a careful user should know about" line.
2. The mechanical scanner grade is F (10 critical / 1599 high / 90 medium / 1531 low across 4955 files, 3230 findings). Section Evidence adjudicates these counts; all ten criticals are defensive guards or test fixtures, and the high volume is dominated by i18n strings mentioning `.claude`/`.codex` directories plus lockfile URL noise.

### Per-surface grades

| Surface | Grade | Basis |
|---|---|---|
| Engine adapters incl. DSH (`src-tauri/src/engine/dsh/`) | B | DSH host client POSTs only `{origin}/api/*` where origin is the user-configured host:port defaulting to `127.0.0.1:3080` (engine/dsh/mod.rs:56-68); supervisor probes then spawns the local `dsh web --host --port` binary as a direct child with argv construction, no shell (engine/dsh/supervisor.rs:146-186); "kill only spawned" policy documented at supervisor.rs:1. Credentials stay in DSH by design (README.md:17). |
| Baidu analytics (`baidu_tongji.rs`, `services/baiduTongji.ts`) | C | Production main window loads `https://hm.baidu.com/hm.js?<site-id>` via Rust reqwest and evals it into the webview, then beacons PV/UV (baidu_tongji.rs:383-421, services/baiduTongji.ts:139-152). Transport hardening is real - https-only client, no redirects, fixed URL, marker+site-id validation before eval, bounded sizes, cookie quarantine (baidu_tongji.rs:235-241,358-366,423-430) - but there is NO opt-out toggle and no user-facing disclosure; see Evidence. |
| Auto-updater (`features/update/`) | C | Startup gate triggers a silent `check()` against `https://github.com/.../releases/latest/download/latest.json` on every production launch (useUpdater.ts:43,74,320-328; tauri.conf.json plugins.updater.endpoints). Download/install requires clicking the update toast (`startUpdate` wired to UI button, useUpdater.ts:245-300), signatures enforced via Tauri updater pubkey (tauri.conf.json:69-73). Check traffic itself is automatic. |
| Remote/web service daemon (`bin/cc_gui_daemon/web_service_runtime.rs`) | C | Optional service binds `0.0.0.0:<port>` (web_service_runtime.rs:118-123) with bearer-token auth middleware on routes (lines 248,259,626,670) and a random UUID token when none is supplied (line 1347-1349); LAN address is advertised for convenience (build_access_addresses). Token-in-query support widens exposure; opt-in feature, but network-reachable control of coding sessions if enabled carelessly. |
| Vendor/profile managers (`vendors/commands.rs`) | B | Reads/writes Claude `settings.json`, Codex `config.toml`/`auth.json` through policy-checked file IO (`read_text_file_within`, `write_with_policy`, codex/config.rs:7-9); auth secrets masked by default in UI (CurrentCodexGlobalConfigCard.tsx:43-87) and stored in user-owned `~/.ccgui/config.json`; CC Switch import is read-only (cc_switch.rs:3-8). This is credential management by design; nothing is sent off-machine except to providers you configure. |
| Email sender/inbox (`email/mod.rs`) | B | User-configured SMTP/IMAP with credentials in a separate file set to 0600 on unix (mod.rs:141-145,171-175). Sends mail you compose; no telemetry. |
| Computer use + bundled skills (`computer_use/`, `.agents/skills/`) | B | Only fixed-binary invocation found (`codesign -dv` signature check, authorization_continuity.rs:259-261); skills spawn dev tools (playwright/tts/vercel CLIs) with execFile-style argv calls and read keys from env or skill-local `.env` (huashu-design/scripts/tts-doubao.mjs). Skill scripts run only when invoked through agent flows. |
| Frontend fetch surfaces | A | All NET-001 sites resolve to loopback proxies or asset URLs: `/tt-dev` dev proxy and `tt_proxy` invoke wrapping `http://127.0.0.1:<port>` (tokentracker.rs:252,310,421), Tauri asset protocol media fetches. No third-party frontend egress outside analytics. |

## What this app can do (capability summary)

- Network egress: your configured AI provider endpoints (Claude/Codex/Gemini/OpenCode/DSH engines), including a runtime DeepSeek quota check that GETs `https://api.deepseek.com/user/balance` with your DeepSeek key as bearer (coding_plan_quota/types.rs:9, providers.rs:50); relay-provider origins are user-set, not pre-seeded - the literal `fufei.mossx.ai` strings in grok_providers.rs:750,770 are test fixtures parsing a user's `~/.grok/config.toml`, and the same host appears only as a documented example of a relay origin (sessionOverviewViewModel.ts:311); `hm.baidu.com` analytics from the production main window (PV/UV beacon + persisted HMACCOUNT visitor cookie); github.com release feed checks at startup; SMTP/IMAP servers you configure; Vercel/Bytedance endpoints only via explicitly invoked bundled skills.
- Credential access: reads and writes `~/.claude/settings.json`, `~/.codex/auth.json`, `~/.codex/config.toml`, Gemini/OpenCode configs, and its own `~/.ccgui/config.json` provider store (which holds API keys in JSON at default file permissions); email secret in a 0600 sidecar. Masked in UI, but plaintext on disk.
- Process execution: engine CLIs as managed children (claude/codex/gemini/opencode/dsh), git operations, LSP integration, computer-use signature verification via `codesign`; bundled `.agents/skills` scripts execute npm/playwright/ffmpeg-class tooling when invoked.
- Exposure surface: optional remote daemon on 0.0.0.0 with bearer auth; CSP allows `unsafe-eval` plus hm.baidu.com script/connect/img sources (tauri.conf.json:17).
- Telemetry: Baidu Tongji only. No other tracker, crash reporter, or phone-home found (grep across src/src-tauri).

## Evidence

Mechanical scan (verbatim): target `desktop-cc-gui`, scanner 0.1.0, rulesDigest `9cc04224b1dc7e81...`, 4955 files scanned / 7168 skipped, families present CRED EXEC HOOK NET OBFU, gates fired `cred-plus-net`, `dynamic-exec-present`, `finding-density`, grade F, score 0. Raw JSON retained at `reference/audits/scan-7b-desktop-cc-gui.json`.

Adjudication highlights:

1. All ten critical findings are false positives of two shapes: (a) DEFENSIVE guards - `pathValidation.ts:20-26` lists `/.ssh/`, `/.aws/`, `/.env` patterns that the validator REJECTS (its own tests assert rejection at pathValidation.test.ts:81-99); (b) test fixtures referencing credential paths (providers_profile tests writing fake `auth.json`).
2. CRED-001/CRED-002 (400 findings): 130 hits are i18n locale STRINGS naming the `.claude`/`.codex` directories (src/i18n/locales/composer.ts:77-82); most others are tests asserting mask/reveal behavior over Codex `auth.json` (CurrentCodexGlobalConfigCard.test.tsx:159-176). The underlying capability - editing those files - is real and is the advertised vendor-manager feature.
3. EXEC/HOOK families concentrate in `scripts/` (repo build tooling, never shipped), `.agents/skills/` (invoked-on-demand skill scripts), and vendored minified libs (`vendor/xmlchars`, lockfile OBFU-012 noise: 704 of 720 low OBFU findings are package-lock.json).
4. The one genuinely notable runtime finding is the analytics stack: `installBaiduTongji()` runs unconditionally in the production main window (services/baiduTongji.ts:139-152, scheduled at bootstrapApp.tsx:349-366); grep of README.md, README.zh-CN.md, docs/, and the settings surface finds no user-facing disclosure or disable switch (only developer-facing docs: dev-guidelines/frontend/index.md:38,57). Against the dsh-bridge charter PRIV bar ("no telemetry without opt-in") this alone caps the subject below B.
5. Update check fires automatically post-startup (useUpdater.ts:320-328 subscribeStartupGateReady) though install stays click-gated; AUTO_UPDATE_ENABLED=true is hardcoded at useUpdater.ts:43.
6. Daemon bind on UNSPECIFIED ipv4 (web_service_runtime.rs:118-121) is intentional for LAN reachability and token-gated, but the token can also travel in the query string (is_authorized accepts query param, line 248 context), which leaks into logs/proxies.

Positive verification performed during this audit: DSH adapter request paths read end-to-end (host.rs origin construction, supervisor argv spawn); updater endpoint pinned to the project's own GitHub releases with minisign pubkey configured; analytics transport validation logic read line-by-line (fixed URL, marker check, fail-closed eval); no dynamic code execution found outside the vendored xmlchars data tables and the analytics script eval described above.

## What we could not check

- Runtime network captures: whether any code path emits requests beyond the surfaces enumerated above (no sandboxed probe ran).
- The shipped release binaries: this audit covers source at the pinned commit; what users download from releases is built by CI and not hash-compared here.
- The full transitive dependency tree (package-lock has ~21k lines); vendored `xmlchars`/`yocto-queue` were spot-read, not fully reviewed.
- Windows-specific spawn paths (`build_windows_dsh_web_command`) beyond source reading - no Windows behavioral probe.
- Long-term stability of the `hm.baidu.com` script content: the marker check fails closed, but Baidu controls what that script does once validated.

## Reviewer disagreement

None recorded. Single-model manual adjudication; per the pipeline this card would require a second independent pass before exceeding grade C.

## Verify this yourself

```bash
# Pin the subject
git clone --depth 1 https://github.com/zhukunpenglinyutong/desktop-cc-gui reference/audits/desktop-cc-gui
git -C reference/audits/desktop-cc-gui rev-parse HEAD   # expect 5d1c8a01a2ca8812e96877197127cc6038521a1e

# Re-run the mechanical scan (expect grade F on raw counts)
node dsh-bridge/tools/scan/dist/index.js reference/audits/desktop-cc-gui

# Spot-check the headline claims
sed -n '139,152p' reference/audits/desktop-cc-gui/src/services/baiduTongji.ts          # unconditional analytics install
sed -n '383,421p' reference/audits/desktop-cc-gui/src-tauri/src/baidu_tongji.rs        # native hm.js fetch+eval
sed -n '43,44p;320,328p' reference/audits/desktop-cc-gui/src/features/update/hooks/useUpdater.ts  # auto update check
python3 -c "import json;c=json.load(open('reference/audits/desktop-cc-gui/src-tauri/tauri.conf.json'));print(c['plugins']['updater']['endpoints'])"
sed -n '118,124p' reference/audits/desktop-cc-gui/src-tauri/src/bin/cc_gui_daemon/web_service_runtime.rs  # 0.0.0.0 bind
grep -rni "opt.out\|disable.*analytic\|analytic.*toggle" reference/audits/desktop-cc-gui/src reference/audits/desktop-cc-gui/src-tauri/src | wc -l   # expect 0
```

## Residual risks (accepted by this grade)

1. Non-opt-in Baidu analytics in every production session: page views, a persistent visitor cookie (HMACCOUNT), and your User-Agent go to hm.baidu.com with no way to turn it off short of building from source.
2. Startup update checks download metadata from GitHub automatically; combined with the click-to-install toast, a compromised release channel becomes a one-click code-execution vector (mitigated by Tauri updater signature enforcement).
3. The remote daemon exposes session control on your LAN when enabled; the UUID token is strong, but query-string token support and 0.0.0.0 binding widen the blast radius.
4. API keys live in plaintext JSON (`~/.ccgui/config.json`, provider `authJson` fields); anyone reading that file gets every stored key.
5. Bundled `.agents/skills` scripts shell out to third-party CLIs and read keys from env/skill-local `.env`; they run with your user privileges whenever invoked.
6. CSP includes `unsafe-eval` (required by the analytics bridge and dev tooling), weakening renderer isolation if any XSS lands.
7. Very young, very fast-moving upstream; findings go stale quickly.

## Methodology and pinned inputs

Scanner: dsh-bridge tools/scan dist build, version 0.1.0, rulesDigest `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`. Subject pinned by git commit SHA (pre-existing shallow clone matching the target remote, HEAD verified). Manual review by one auditor covering every critical finding, sampled high findings per family, and full reads of the analytics/updater/daemon/DSH-adapter surfaces; all claims carry file:line anchors resolvable at the pinned commit. Grade semantics follow docs/trust/pipeline-architecture.md S6; caps applied: incomplete-pipeline ceiling C. Disclaimer: a grade is evidence-backed opinion over a pinned artifact, not a safety guarantee, and says nothing about versions other than the pinned commit.

## Revision history

| Rev | Verdict digest basis | Change |
|---|---|---|
| 1 | commit `5d1c8a01`, scanned and adjudicated 2026-08-26T09:10Z | Initial card. Overall C; per-surface grades as tabulated; mechanical F adjudicated (defensive-guard and i18n false positives dominate); analytics/opt-out gap identified as the headline privacy finding. Provenance row and egress inventory amended after cross-review with a second auditor (relay-origin clarification, DeepSeek balance endpoint). |

Re-vetting triggers: any change to `baidu_tongji.rs`/`services/baiduTongji.ts` (especially adding an opt-out would lift the privacy cap), any updater endpoint or pubkey change, any new daemon route, a new tagged release shipping different binaries, or 90 days elapsed.
