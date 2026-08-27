# Trust Report Card: Tencent/BrowserSkill

## 1. Header

| Field | Value |
|---|---|
| Plugin | `Tencent/BrowserSkill` (browser-control stack: Chromium MV3 extension, Rust `bsk` CLI/daemon, and the DSH tool plugin `@wxg-prc-cpg/browser-skill-dsh-plugin` 0.1.1) |
| Pinned subject | github:Tencent/BrowserSkill @ commit `a004291848e8641400b973b8d612b4c4b74cdc90` (default branch head at audit time; re-confirmed via `git ls-remote` during this audit) |
| npm integrity | not pinned in this revision (plugin package 0.1.1 published; integrity check listed in section 11 as a re-verify step) |
| Provenance | git tree audited directly; no dist bundle rebuild performed |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: a browser-control stack with near-maximum Chrome permissions (`debugger`,
`tabs`, `webNavigation`, `<all_urls>`, wxt.config.ts:30-40) that keeps every observed byte on the
loopback path to the local agent, shows no telemetry, no credential-store access, no obfuscation,
and no third-party egress anywhere in the tree, but whose power is bounded mainly by prompt-level
policy rather than technical fences, and which auto-updates itself by default.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Reachable pages | Agent tools act on an isolated "Agent Window" by default. Write/input tools are fenced: `enforceAgentWindow` refuses any tab outside the session's Agent Window (apps/extension/src/tools/shared.ts:333-345), applied to click/fill/press/select/hover/navigate/reload/emulate/evaluate/request_help (interaction.ts:234,363,596,854,990; navigation.ts:499,606,720; emulate.ts:221; evaluate.ts:148; human-loop.ts:670; waits.ts:74). Touching a user tab requires an explicit per-tab borrow confirmed by an in-page overlay plus OS notification, deny-default with timeout auto-deny (tools/borrow-confirmation.ts:27-31,373; entrypoints/background.ts:179-191). Borrow state is tracked and returned on session end (session-manager/manager.ts:115-165; tools/session.ts:185-210). | file:line above |
| Passive reads of user tabs | snapshot/observe/screenshot/get_html resolve targets through `resolveTargetTab`, which permits any tab id when no other session owns its window (shared.ts:174-227); only VOM `observe` is gated as input-capable (observation.ts:1718 marks snapshot passive_read; 1727 marks observe transient_input). CDP reads refuse browser/extension internal pages via protocol blocklist (shared.ts:242-250). So a page-level read of a *borrowed-or-not* user tab is possible for snapshot/screenshot/get_html whenever the caller names a tab id. | file:line above |
| Credential/form scraping potential | No cookie/password/autofill/history/bookmark APIs used anywhere (`chrome.cookies`, `chrome.identity`, password store greps: zero production hits). Form fills typed by the agent flow through CDP like any input; record mode redacts password fields to `***` + `redacted:true` marker (content/record-capture.ts:394-405). But `bsk evaluate` runs arbitrary JS in the active tab via CDP Runtime.evaluate (tools/evaluate.ts:156-160) and get_html returns full DOM outerHTML (tools/observation.ts:1511-1521): anything visible in a logged-in page (tokens, account data, form values) is readable by the driving agent. The restriction against harvesting banking/SSO/password-manager secrets exists only in SKILL.md prose ("When NOT to use", skill/SKILL.md:25), enforced nowhere in code. | file:line above |
| CDP endpoints | Extension attaches chrome.debugger per tab (browser-driver/chromium-cdp.ts:76-77) using Page/Runtime/Log/Network/DOM/Emulation/Input/Target domains (chromium-cdp.ts:276,505,520,533; tools/vom/capture.ts:481; interaction.ts:283+; element-geometry.ts:95,104). Network domain is enabled but only request/response lifecycle events are consumed (chromium-cdp.ts:720-731); no response-body capture found. Daemon control plane: WebSocket bound to 127.0.0.1 only (crates/bsk-cli/src/daemon/start.rs:238-240, address built from Ipv4Addr::LOCALHOST), Origin allowlist accepts any well-formed 32-char chrome-extension:// origin (daemon/ws.rs:47-62) - self-acknowledged gap (ws.rs:36-45 TODO M10/M12). CLI IPC is a Unix UDS / named pipe with no peer-credential check (daemon/ipc.rs:1035-1048, no SO_PEERCRED use). | file:line above |
| Egress | Extension makes exactly one class of connection: WebSocket to ws://127.0.0.1:52800 default (transport/ws-transport.ts:63; wxt.config.ts:73-75). Rust daemon's only HTTP client fetches GitHub release manifests/binaries (cli/update.rs:23-24, reqwest rustls workspace Cargo.toml:34). DSH plugin spawns `bsk <cmd> --json` from PATH (src/runner.ts:69,86) and serves observation routes only on an existing loopback-fenced webServer (observation-http.ts:38-77 fence: loopback Host, same-origin Origin, cross-site refused, JSON-only POSTs). install.sh curls github.com + verifies sha256 (install.sh:157-172). No analytics/telemetry/beacon code anywhere in apps/, packages/, crates/ (grep: zero hits). | file:line above |
| Auto-update | Daemon checks GitHub releases every 30 min and installs new binaries **on by default** (start.rs:509-535; update.rs:46-47,477-484; opt-out only via BSK_AUTO_UPDATE=off), sha256-gated (update.rs:376-390,460-465). This is remote-code-execution infrastructure keyed to github.com/Tencent trust, running outside any sandbox. | file:line above |
| Child processes | DSH plugin spawns only the configured `bsk` binary (runner.ts:86). Build scripts run execFileSync over local files (scripts/build-client-css.mjs:16,46) - developer-side only. No runtime child_process in extension (impossible in MV3) or daemon beyond self-restart (update.rs:765). | file:line above |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`. Raw output: 246 findings
(218 high, 12 medium, 12 low, 4 critical), machine grade F with caps `dynamic-exec-present` and
critical-present. Partition: 125 findings in test files, 85 in crates/bsk-protocol/schema/*.json
(JSON Schema `$schema` URLs misread as egress), 36 remaining production findings adjudicated below.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED "enumerates entire process environment" x2 (apps/extension/vitest.config.ts:24, wxt.config.ts:73) | False positive. Single named variable reads: `process.env.BSK_DAEMON_WS_URL` with loopback default, compiled into build-time constants, not env enumeration. | excerpts read directly; pattern is `process.env.NAME ?? default` |
| CRED x2 (packages/dsh-plugin-browserskill/tsdown.config.ts:55-56) | False positive. `process.env.NODE_ENV` read in bundler config; standard define injection. | excerpt read directly |

### Production-code findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| BSK-NET-1 | medium | apps/extension/src/transport/ws-transport.ts:63 | Loopback WebSocket to local daemon; the product's core channel. Documented in apps/extension/PRIVACY.md sections 5-6. |
| BSK-NET-2 | medium | crates/bsk-cli/src/cli/update.rs:23-24 | Periodic egress to github.com releases for update manifest + binaries; documented in README and PRIVACY.md is scoped to the extension only. |
| BSK-NET-3 | low | install.sh:17,157-172 | curl from github.com with sha256 verification before install. |
| BSK-CRED-1 | high | apps/extension/src/tools/evaluate.ts:156; tools/observation.ts:1511-1521 | Arbitrary JS evaluation and full-DOM extraction in reachable tabs make logged-in page secrets readable by the driving LLM agent. Guardrail is prompt-level only (skill/SKILL.md:25). Kept as the card's central residual risk rather than a defect: it is the product's stated purpose. |
| BSK-EXEC-1 | low | packages/dsh-plugin-browserskill/src/runner.ts:8,86 | Spawns only the user-configured bsk binary; args constructed from tool schemas. |
| BSK-HOOK-1 | low | packages/dsh-plugin-browserskill/package.json scripts | `prepack` build hook only; no install/postinstall scripts (grep verified). |

### Scanner noise dismissed (with scope)

- EXEC family on `.exec(` calls: RegExp.prototype.exec, not execution (observation.ts:92 data-URL
  prefix strip; transport/handshake.ts:144 UA sniffing). Verified individually.
- EXEC family on `node:child_process` imports in scripts/build-client-css.mjs,
  scripts/render-version-json.test.mjs, runner.ts import line: build-time or the audited spawn seam.
- HOOK family: all 12 are setTimeout/setInterval for UI animation, recording commit batching,
  heartbeat typing, and SSE keepalive - none schedule network beacons (each call site read:
  BorrowConfirmationOverlay.tsx:85,97; record-capture.ts:356,386,609; heartbeat.ts:32;
  human-loop.ts:403; record.ts:581).
- NET family: 125 test-file fixtures (example.com, right.test, nested.test), 85 JSON Schema
  `$schema` URLs in crates/bsk-protocol/schema/, biome.json schema URL, i18n placeholder strings
  ("https://..."), package.json repository metadata.
- The scanner's `dynamic-exec-present` cap fires on regex `.exec()` matches; after manual review
  there is no eval/new Function/vm/string-compiled code in shipped sources.

### Negative claims and what was searched

Searched all 334 scanned files plus full manual reads of the security-relevant subset: no
telemetry/analytics/beacon/crash-reporting code in apps/, packages/, crates/ (grep across .ts,
.rs, .toml, .json: zero hits); no chrome.cookies, chrome.identity, browsingData, bookmark,
download, or OS keychain access; no reading of ~/.ssh, ~/.aws, ~/.claude, ~/.codex, or other
harnesses' credential stores; no base64-decoded-then-executed blobs (only PNG header parsing,
observation.ts:107-109); no homoglyph identifiers or entropy anomalies; extension never contacts
any non-loopback host (single WebSocket factory, ws-transport.ts:63); no install-time lifecycle
scripts beyond publisher-side prepack.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  unavailable here). The daemon auto-update task's exact network timing and the extension reconnect
  loop were reviewed statically only.
- **Published artifacts vs source.** The audit graded the git tree. The Chrome Web Store listing
  (id hhcmgoofomhgciiibhipgmgkgnoenaoi), npm tarball `@wxg-prc-cpg/browser-skill-dsh-plugin@0.1.1`,
  and GitHub release binaries were not downloaded and byte-compared to their sources. Until someone
  reproduces those builds, store/npm/release channels rest on upstream honesty.
- **Rust dependency supply chain.** Cargo.lock resolved transitive deps were not joined against a
  pinned OSV snapshot; reqwest/rustls versions taken at face value.
- **Windows paths.** Named-pipe IPC ACL semantics (ipc.rs:1167-1293) were read but not exercised;
  Windows pipe permission defaults differ from Unix UDS directory permissions and were not verified.
- **The connected agent's behavior.** BrowserSkill hands page content, screenshots, and DOM to
  whatever LLM agent drives it. What that agent does with the data is outside this artifact
  (PRIVACY.md section 6 states the same boundary).

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on regex-noise
and build-config findings; manual adjudication downgraded every critical/high production finding to
documented behavior or false positive. Both positions are recorded here rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Tencent/BrowserSkill /tmp/bsk-audit
cd /tmp/bsk-audit && git rev-parse HEAD   # expect a004291848e8641400b973b8d612b4c4b74cdc90

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/bsk-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
cat apps/extension/wxt.config.ts | sed -n '30,41p'          # permissions incl. debugger + <all_urls>
grep -rn "fetch(\|new WebSocket(\|EventSource(" \
  apps/extension/src packages/dsh-plugin-browserskill/src --include='*.ts' \
  | grep -v __tests__                                        # egress: loopback WS only
grep -rniE "telemetr|analytics|posthog|sentry|amplitude" apps packages crates   # zero hits
sed -n '333,346p' apps/extension/src/tools/shared.ts         # agent-window write fence
sed -n '25p' skill/SKILL.md                                  # evaluate guardrail = prose only
sed -n '23,24p' crates/bsk-cli/src/cli/update.rs             # auto-update manifest URL
sed -n '477,484p' crates/bsk-cli/src/cli/update.rs           # auto-update ON by default

# 4. Confirm the published plugin matches this repo
npm view @wxg-prc-cpg/browser-skill-dsh-plugin@0.1.1 dist.integrity
```

## 8. Methodology and pinned inputs

- Subject: git commit `a004291848e8641400b973b8d612b4c4b74cdc90` (clone at
  reference/audits/browserskill; upstream HEAD re-checked via ls-remote during the audit)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of wxt.config.ts, transport/{handshake,ws-transport,transport}.ts,
  browser-driver/chromium-cdp.ts, tools/{shared,borrow-confirmation,tabs,session,evaluate,
  observation,interaction,navigation,emulate,human-loop,waits}.ts, content/record-capture.ts,
  content/recording/frame-agent.ts, entrypoints/{background,content,record-frame.content}.ts,
  session-manager/manager.ts, daemon/{ws,ipc,start,state}.rs, cli/update.rs, install.sh,
  dsh-plugin src/{index,runner,tools,observation-http,observation}.ts, cordis.patch.yml,
  package.json manifests, PRIVACY.md, skill/SKILL.md, docs/architecture.md
- Cross-model review: NOT performed (single reviewer). Card revision 1 capped accordingly.
- Grade derivation: no exfiltration, no telemetry, no obfuscation, no dynamic code execution, no
  undeclared egress found. Not A/B because: capability surface includes arbitrary-JS evaluation and
  unrestricted-tab passive reads with prompt-only policy rails; auto-update executes vendor binaries
  outside any sandbox; WS origin gate accepts any side-loaded extension-shaped origin (self-declared
  not yet implemented in this pipeline; behavioral probe and artifact-rebuild verification absent. These map to pipeline section 5.2
  "use with awareness" (C band), consistent with the C ceiling the probe-less pipeline imposes.

## 9. Strengths

1. Honest privacy documentation that matches the code: PRIVACY.md claims were checked claim-by-claim
   (no cookies/passwords/history access, loopback-only traffic, borrow consent) and held.
2. Real consent architecture for the dangerous path: borrowing a user tab requires an in-page
   overlay plus OS notification, denies on timeout, fail-closed on confirmation errors
   (borrow-confirmation.ts:27-31; tabs.ts:652-692), with race-safe reservation (manager.ts:131-165).
3. Defense where cheap: write tools hard-fenced to the Agent Window (shared.ts:333-345); internal
   pages blocked from CDP reads (shared.ts:242-260); observation HTTP routes behind a loopback +
   same-origin + CSRF-resistant fence (observation-http.ts:38-77); daemon.json written 0600 into a
   0700 home (info.rs:49; paths.rs:40-52); password fields redacted in recordings
   (record-capture.ts:394-405); update archives sha256-verified before install (update.rs:376-390)
   and postponed while sessions are live (start.rs:520-535).
4. Clean egress posture: the extension's only network object is one loopback WebSocket factory;
   the daemon's only HTTP client targets GitHub releases; nothing else dials out.
5. No telemetry, no obfuscation, no dynamic code execution, no install-time hooks; progressive tool
   disclosure (lazyTools default true, index.ts:51-52) keeps the model surface minimal until invoked.

## 10. Residual risks

1. Prompt-injection blast radius: an LLM agent with `bsk evaluate` can read anything rendered in a
   logged-in tab (session tokens in DOM, account pages, webmail). Malicious content on any visited
   page can steer the agent toward those tools; the only rail is SKILL.md prose (skill/SKILL.md:25).
   Treat every agent-driven browsing task as exposing that tab's contents to the driving model.
2. Passive-read scope: snapshot/screenshot/get_html accept explicit tab ids outside the Agent Window
   (resolveTargetTab has no window fence, shared.ts:174-227; only observe is effect-gated,
   observation.ts:1727). A borrowed tab is protected from writes but readable even without borrow.
3. Local privilege surface: any local process can reach the CLI IPC socket (no peer-credential
   check, ipc.rs:1035-1048) and any chrome-extension-shaped origin passes the daemon WS gate
   (ws.rs:47-62, acknowledged TODO). On shared machines this widens who can drive the browser.
4. Default-on auto-update: the daemon replaces its own binary from GitHub every 30 minutes unless
   BSK_AUTO_UPDATE=off (update.rs:477-484). Integrity rests on sha256 in a manifest fetched from the
   same origin; a GitHub/account compromise flows straight to code execution on user machines.
5. Unverified distribution channels: Web Store listing, npm tarball, and release binaries were not
   rebuilt from this commit; the grade covers the git tree only.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD; any new literal URL, new Chrome permission, or
   new non-loopback endpoint must be re-adjudicated before this grade carries forward.
2. Confirm `npm view @wxg-prc-cpg/browser-skill-dsh-plugin dist.integrity` and the Chrome Web Store
   artifact against builds of the pinned commit; mismatch = new revision required.
3. Watch daemon/ws.rs TODO(M10/M12): when the extension-id allowlist lands, risk 3 shrinks; if
   `allow_any_origin` ships enabled by default instead, re-grade immediately.
4. Check `auto_update_enabled()` default flips (or a signature/checksum scheme beyond same-origin
   sha256 appears) on any bump past this commit; auto-update changes are grading-relevant.
5. Re-run the scanner after heuristics-corpus bumps; corpus digest recorded in section 8. The
   `.exec()` false-positive family should shrink if EXEC rules gain a regex-API exemption.
