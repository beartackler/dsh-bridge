# Trust Report Card: BitFun (`@bitfun/dsh-acp`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@bitfun/dsh-acp` - an Agent Client Protocol bridge that runs DeepSeek Harness sessions inside the BitFun desktop IDE. It is not a marketplace plugin: BitFun materializes it as a DSH *profile* (`dsh --profile bitfun-acp`) against the harness the user already installed, composing only official `@deepseek-ai/dsh-*` rows plus one in-repo app entry. The catalog entry `GCWing/BitFun` is a Rust/Tauri desktop agent platform; this card grades the DSH-facing bridge and notes the host platform's behavior where it reaches the same user. |
| Pinned subject | github:GCWing/BitFun @ commit `be345f3c2a5f9199148a5e6edd8479430d6de5a6` (main head at audit time) |
| Stars | 1,818 (GitHub API, audit time) |
| npm publication | Not published to npm (`@bitfun/dsh-acp` does not resolve on the registry). The bridge ships inside BitFun releases; its profile build is content-digest-stamped (`.bitfun-bridge.json`) so stale profiles are detected and replaced rather than merged. |
| Provenance | Release-channel strong: every covered installer/CLI asset ships a detached minisign signature under a pinned public key published in docs and built into update paths; the updater explicitly refuses to bypass it ("fetching bytes by hand ... would silently skip signature checking"). |
| License | MIT (core code). LICENSE at repo root; `@bitfun/dsh-acp/package.json` declares `"license": "MIT"`. NOTICE.md present alongside. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of dsh-acp sources, cordis.yml composition, profile builder, updater path) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The DSH bridge itself is a model of restraint - zero network calls, no credential reads of its own,
sandboxed-by-default tool composition, approval prompts routed to the IDE - but the surrounding
BitFun platform is a broad desktop runtime whose defaults (auto-update on, a first-party
api.openbitfun.com provider pre-seeded, SSH remote-control surfaces) mean "installing the bridge"
really means "running the whole IDE," and users should grade that decision accordingly.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Composition | The profile is a pure Cordis composition: settings file watcher, local credential store reader, default-model row, DeepSeek + pi.ai LLM adapters, sandbox/bash/filesystem stack with workspace-write policy, approval service, session persistence, subagents, skills catalog, token meter, compaction. All rows except `./src/app.ts` are official `@deepseek-ai/dsh-*` packages resolved from the user's own harness installation - nothing is vendored except two packages outside dsh's dependency closure. | packages/dsh-acp/cordis.yml (whole file); scripts/build-profile.mjs header comments: "Nothing here installs a second copy of the harness" |
| Network egress (bridge) | Zero. No fetch/http client anywhere in the 1626-line bridge source; stdout carries ACP JSON-RPC only. | grep negative across packages/dsh-acp/src; README: "Stdout carries ACP JSON-RPC" (cordis.yml:8-9) |
| Credential handling (bridge) | None of its own. Keys live in `$DSH_HOME/.credentials.yaml` managed by the harness itself; the bridge mounts `@deepseek-ai/dsh-settings-file` and `@deepseek-ai/dsh-credentials-local` and states "Nothing about an account is stored in this repository, and BitFun never asks for a key of its own." Adapters resolve references per request; nothing is materialized into the process environment. | cordis.yml comments at the `credentials` row and `llm-deepseek` row; README.md "For users" section |
| Tool exposure | Bash and filesystem tools confined to the workspace root by `dsh-sandbox-local` + `fs-sandbox` with `workspaceRoot: process.cwd()`; anything wider requires approval. Approval policy is `ask` unless the deployer sets `DSH_PERMISSION_MODE=danger-full-access`, in which case it is `never` - a documented escape hatch, off by default. | cordis.yml `sandbox`, `sandbox-policy`, `approval`, `bash`, `fs-sandbox` rows |
| Session/model surface | Sessions start on the user's configured dsh default model; per-session model switching rides the catalog dsh already holds and never writes back the user's dsh default. Presets (standard/minimal/code) add model-facing rows per mode. | cordis.yml `agent-default-model`, `acp-agent` rows; README "How BitFun launches it" |
| Host platform: egress | The Rust core pre-seeds a first-party provider (`api.openbitfun.com`) in its provider catalog as a default endpoint for Anthropic/OpenAI-format traffic; the web UI's browser panels default to `openbitfun.com`. These are product BYOK relay/market endpoints, disclosed in code, not covert telemetry. | src/crates/assembly/core/src/infrastructure/ai/provider_catalog.rs:568-569, 817-844; src/web-ui/src/app/scenes/browser/BrowserPanel.tsx:22 |
| Host platform: telemetry | Config default is `telemetry: false`; the only "telemetry" writer found appends JSONL to the local session directory behind an opt-in setting. No third-party analytics endpoint found in core or web-ui shipped paths. | src/crates/assembly/core/src/service/config/types.rs:1814; edit_constraint_guard.rs:44, 757-796 |
| Host platform: updates | `auto_update: true` by default via tauri-plugin-updater; GitHub releases endpoint primary with an OpenBitFun mirror fallback, and minisign verification deliberately kept inside the update download path. | types.rs:1813; src/apps/desktop/src/api/system_api.rs:55-110; docs/verify-downloads.md |
| Host platform: credentials | The bridge never touches raw secrets; the wider platform includes SSH remote-control features whose dialogs reference `~/.ssh/id_rsa` as a *default key path input* for the user to fill - a UI affordance, not secret harvesting. | src/web-ui/src/features/ssh-remote/SSHConnectionDialog.tsx:507 et al.; RelayDeployWizard.tsx:106 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**3816 findings** (29 critical, 1056 high, 454 medium, 2979 low) over 3057 files / ~29 MB scanned.
Machine verdict **F**, off three gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Where the volume is

194 highs in the web UI (mostly URL strings), 165 in contracts crates, ~200 in lockfile funding URLs
across four lockfiles, plus test fixtures. The graded bridge package contributes almost none.

### Criticals, highs, and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED criticals: `~/.ssh/id_rsa` strings across web-ui SSH dialogs (20+ sites) | Default values and placeholders for user-editable key-path inputs in the remote-control feature. The string is what the scanner pattern matches; no code reads or transmits the key outside the user-initiated SSH flow. | src/web-ui/src/features/ssh-remote/SSHConnectionDialog.tsx:87-91, 507-613 |
| CRED critical: hygiene script regexes (scripts/check-repo-hygiene.mjs:99) | The script exists to *find* committed private keys; the matches are its own denylist patterns. | scripts/check-repo-hygiene.mjs:99 |
| EXEC critical: `new Function("" + e4)` inside vendored ppt-live ui.bundle.js | Inside a prebuilt vendor bundle (`src/crates/contracts/product-domains/src/miniapp/builtin/assets/ppt-live/dist/ui.bundle.js`), a classic UMD/eval-fallback idiom. Vendored artifact, not bridge code; flagged as residual surface. | that file, line 6571 |
| NET highs in ai-provider-catalog / relay-server / web-ui | Provider base URLs and market/gallery hosts for the BYOK product. None reachable from the DSH bridge, which imports none of these crates. | scan breakdown; provider_catalog.rs |
| HOOK high: i18n placeholder strings mentioning `npx` | Locale text shown to users as an MCP command-field hint, not an executed command. Dismissed. Corrected after review: an earlier draft of this row also named `npm install -g @openai/codex` and cited `session-page.tsx:669`; neither exists in the pinned tree (`grep -rn "@openai/codex"` returns nothing, and there is no `session-page.tsx`). | src/web-ui/src/locales/en-US/settings/mcp.json:83, and the zh-CN/zh-TW files at the same line |
| `dynamic-exec-present` gate | Sole trigger in shipped first-party code paths is the vendored bundle above; bridge source has zero eval/new Function/dynamic-import. | grep negative across packages/dsh-acp/src |
| `finding-density` gate | Monorepo mass: 3057 files including four lockfiles and vendored assets. Bridge-scoped density is trivial. | stats block |

### Composition-level observations

The security posture of the bridge comes from what it refuses to compose: no console logger on the
ACP plane ("stdout carries ACP JSON-RPC"), preset layers may only add registrations so the minimal
preset cannot silently widen, and the approval row is explicit about when it degrades to `never`
(cordis.yml:8-9, 14-17 comment block; approval row).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run of the profile (pipeline S4 not
  available).
- **Cross-model review.** Single reviewer.
- **Release binaries.** Signatures were verified to exist by documentation and updater-code reading;
   we did not download a release and verify a minisign signature end to end.
- **Rust core breadth** (~250k LOC across adapters/assembly/contracts/execution/services): reviewed
  at the config/catalog/updater seams relevant to trust; not line-by-line.
- **Vendored miniapp bundles** under contracts product assets: classified as vendor, spot-checked.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. Both recorded. The gates dissolve under
scoping: the CRED criticals are UI default strings and a hygiene script's own patterns, dynamic-eval
lives in a vendor bundle, and density is lockfile noise. The ceiling stays C because there is no
published artifact to pin independently (the bridge ships inside platform releases), no probe ran,
single reviewer, and the effective install unit is an entire desktop platform with auto-update and a
first-party relay endpoint pre-seeded - capabilities far beyond what the bridge itself exercises.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/GCWing/BitFun /tmp/bitfun-audit
cd /tmp/bitfun-audit && git rev-parse HEAD   # expect be345f3c2a5f9199148a5e6edd8479430d6de5a6

# 2. Re-run our scanner scoped to the bridge
node tools/scan/dist/index.js /tmp/bitfun-audit/packages/dsh-acp   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE "fetch\(|https?://|child_process" packages/dsh-acp/src --include="*.ts"   # expect: no hits
grep -n "credentials\|apiKey\|\.aws\|\.ssh" packages/dsh-acp/src/*.ts               # expect: no hits
sed -n '/- id: approval/,/- id:/p' packages/dsh-acp/cordis.yml                      # ask-by-default policy
sed -n '/- id: sandbox-policy/,/- id:/p' packages/dsh-acp/cordis.yml                # workspace-write default
sed -n '55,72p' src/apps/desktop/src/api/system_api.rs                              # updater endpoint policy

# 4. Confirm release verification story
head -20 docs/verify-downloads.md                                                   # pinned minisign key
grep -n "auto_update\|telemetry" src/crates/assembly/core/src/service/config/types.rs | head   # true/false defaults

# 5. Confirm the bridge is not on npm
npm view @bitfun/dsh-acp version    # expect: E404
```

## 8. Methodology and pinned inputs

- Subject: git commit `be345f3c2a5f9199148a5e6edd8479430d6de5a6` (shallow clone at
  reference/audits/BitFun); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 3816 findings monorepo-wide,
  bridge-scoped findings enumerated in section 4.
- Review: full read of packages/dsh-acp/{cordis.yml,src/*.ts} (1626 lines TS + composition),
  scripts/build-profile.mjs and link-local-dsh.mjs headers, dsh_profile.rs, system_api.rs updater
  block, config/types.rs defaults, verify-downloads.md, SECURITY.md; seam-level pass over the Rust
  provider catalog and web-ui browser defaults; classification pass elsewhere.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: the bridge has no egress, no credential access, no dynamic execution, and composes
  sandboxed/approval-gated official rows; nothing hostile found anywhere in first-party shipped code.
  Caps: no independent publishable artifact (release-embedded only), no S4 probe, single reviewer, and
  platform-level capability breadth (auto-update default, first-party relay endpoint, remote-control
  surfaces) that a card scoped to the bridge cannot fully vouch for. Result: C.

## 9. Strengths

1. Credential separation is architectural: the bridge stores nothing, asks for nothing, and resolves
   models/keys per request through the harness's own services, so revoking dsh access revokes BitFun
   (cordis.yml credentials row; README "For users").
2. Approval-first defaults: bash/fs beyond the workspace require the IDE's explicit consent, and the
   `never` path requires setting `DSH_PERMISSION_MODE=danger-full-access` deliberately
   (cordis.yml approval/sandbox-policy rows).
3. Profile builds are content-addressed with digest stamps, replacing rather than merging stale emits,
   eliminating mixed-version boot risk (scripts/build-profile.mjs MANAGED_SUBDIRECTORIES;
   dsh_profile.rs STAMP_FILENAME).
4. The updater treats signature checking as non-negotiable and documents why hand-fetching bytes would
   silently skip it (system_api.rs:47-51 comment).
5. Release verification is reproducible from a pinned minisign key published in-tree
   (docs/verify-downloads.md).
6. SECURITY.md establishes private coordinated disclosure with response-time expectations.

## 10. Residual risks

1. You are installing a platform, not a plugin: the desktop app ships terminal, filesystem, git, MCP,
   LSP, and remote-control capability regardless of whether you use the DSH bridge.
2. Auto-update defaults on, pulling from GitHub with an OpenBitFun mirror fallback; both endpoints are
   first-party-controlled channels (system_api.rs:19-24; types.rs:1813).
3. A first-party provider endpoint (`api.openbitfun.com`) sits in the default catalog; your agent
   traffic goes there if you select that provider. BYOK disclosure lives in code, not prominently in
   docs (provider_catalog.rs:568-569).
4. One vendored miniapp bundle contains an eval-fallback idiom; vendor bundles ship inside the product
   without source-level review here (ppt-live dist/ui.bundle.js:6571).
5. No behavioral probe ran; the ask-policy's behavior under real ACP clients was verified by reading
   the composition, not executing it.
6. Single reviewer; the cross-model adversarial pass that could challenge this card's scoping
   judgments did not happen.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any fetch/http client appearing under
   `packages/dsh-acp/src`, any direct credential-path read, or any change to the approval row's
   default forces re-adjudication.
2. Watch the updater: removing minisign verification from the download path, or adding new mirror
   origins, is a stop-ship signal for this card given risk 2.
3. Diff `packages/dsh-acp` between the audited commit and the release you actually run; the bridge
   ships embedded, so release-to-release drift is invisible on npm.
4. Re-vet at 90 days, on the next BitFun minor that touches `packages/dsh-acp` or the updater, or
   when the pipeline gains S4 probing, whichever comes first.
