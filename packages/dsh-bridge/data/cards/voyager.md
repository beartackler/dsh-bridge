# Trust Report Card: voyager

## 1. Header

| Field | Value |
|---|---|
| Plugin | `voyager` (Gemini Voyager) v1.8.0 - a browser extension, not a Cordis plugin. It is catalogued here because its Prompt Manager mounts on any site the user adds, DSH's web UI on `localhost:3080` included. |
| Pinned subject (git) | github:Nagi-ovo/voyager @ commit `f12a8bbdea39fd91ac4e4381e2db68bfd8497ffb` (default branch head at audit time, committed 2026-08-26T02:29:52+01:00) |
| Distribution | Chrome Web Store `iifacdnjakkhjjiengaffnegbndgingi`, Edge Add-ons, Firefox Add-ons (`gemini-voyager@nagi-ovo`), and a Safari build. Not an npm package; no `dsh plugin add` path exists. |
| Provenance | Not established for the store artifacts. This card grades the git tree. No store build was downloaded and compared byte for byte against a local build of this commit. |
| License | GPL-3.0 (LICENSE; package.json:6). Third-party MIT attributions are recorded for the watermark-remover sources (THIRD_PARTY_NOTICES.md:1-9). |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 plus manual review of the manifest, permission model, sync service, and injected page scripts) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A large, disciplined, GPL-3.0 browser extension with no telemetry and a genuinely careful permission
model, whose grade is set not by anything it does wrong but by what it is: code that runs inside your
Gemini, Claude, and ChatGPT sessions, that can request `<all_urls>`, and that ships through stores
whose artifacts this audit did not verify against the source.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Declared permissions | `storage`, `identity`, `scripting`, `alarms`, `activeTab`, with `notifications` optional. | manifest.json:27-28 |
| Declared host permissions | Google properties only: Gemini, AI Studio, `*.googleapis.com`, `accounts.google.com`, `*.googleusercontent.com`, image CDNs. | manifest.json:33-43 |
| Optional host permissions | `https://chatgpt.com/*` and `<all_urls>`. The second is what makes "any site, even localhost" work, and it is the single widest capability in the package. | manifest.json:44 |
| How the wide permission is used | Not at install. Optional origins are requested from a user gesture in the popup or options page, then content scripts are registered dynamically via `chrome.scripting.registerContentScripts`. The background worker cannot grant itself the permission. | src/features/plugins/runtime/siteRegistration.ts:1-23 |
| Custom-site guardrails | User-entered sites are checked against a blocklist that rejects `*`, `*://*/*`, `<all_urls>`, `http://*/*`, and `https://*/*`. Loopback and bare IPv4 hosts are accepted only with an explicit port, so one entry cannot cover every local server. | src/core/utils/customWebsites.ts:1-25 |
| Network egress | Google Drive API (`googleapis.com/drive/v3` and its upload base) for opt-in backup, plus the project's own docs origin `voyager.nagi.fun` for announcements and links. The `oauth2` scope requested is `drive.file`, which grants access only to files the app itself creates. | src/core/services/GoogleDriveSyncService.ts:81-82; manifest.json:29-32; src/pages/popup/Popup.tsx:2438 |
| Page-context injection | Five MAIN-world scripts under `public/`, including a `fetch` interceptor. Its stated purpose is catching Gemini image-download requests to fetch the unwatermarked original, gated on the user's watermark setting. | public/fetchInterceptor.js:1-11 |
| Dynamic code execution | None in shipped source. The only `eval` in the repository is `(0, eval)(observerScript)` in a unit test that loads an observer script under test. The extension CSP is `script-src 'self'; object-src 'self'; worker-src 'self'`, which forbids remote script and inline eval in extension pages. | src/features/plugins/builtin/claudeUsage/observer.test.ts:16; manifest.json:45-47 |
| Child processes | Build tooling only: `scripts/build-edge.js`, `bump-version.js`, `install-git-hooks.cjs`, `launch-chrome.cjs`, `verify-katex-export.ts`. None of it ships in the extension bundle. | scripts/build-edge.js:7; scripts/bump-version.js:1; scripts/install-git-hooks.cjs:3 |
| Telemetry | None found. No analytics SDK, no beacon, no counter endpoint anywhere in `src/` or `public/`. The one visitor-counter badge in the README is commented out. | grep over src/ and public/; README.md:38-40 |
| DSH relationship | Documentation and a screenshot only. The Prompt Manager mounts on `localhost:3080` as a user-added custom site; there is no DSH-specific code path in `src/`. | README.md:100-105; docs/guide/deepseek-harness.md; grep negative for DSH code in src/features/plugins/sites/ |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **1117 findings** (0 critical, 928 high, 131 medium, 58 low)
over 742 files, machine grade **F**, score 0, off `cred-plus-net`, `dynamic-exec-present`, and
`finding-density`. That is the expected shape for a 742-file application repository containing its
own release engineering, and the number is not a verdict. Adjudication below covers every gate.

### Gates adjudicated

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| `cred-plus-net` naming `scripts/cws-refresh-token.ts`, `scripts/generate-sponsors.cjs`, `scripts/update-readme-badges.mjs` | All three are maintainer release scripts reading `CLIENT_SECRET`, `GITHUB_TOKEN`, `AFDIAN_TOKEN` from the environment to publish to the Chrome Web Store and regenerate sponsor and badge assets. None is bundled into the extension: the Vite configs build from `src/`, and these live in `scripts/`. | scripts/cws-refresh-token.ts:23; scripts/generate-sponsors.cjs:31, 33; scripts/update-readme-badges.mjs:9 |
| CRED high `.claude/settings.json:14` | The repository's own agent configuration, declaring a pre-push formatting hook for contributors. Not extension code. | .claude/settings.json:14 |
| `dynamic-exec-present` | Fires on `child_process` in build scripts and on one `eval` inside a test. No `eval` or `new Function` exists in shipped `src/` or `public/`, and the extension CSP would block remote script regardless. | scripts/*.js; observer.test.ts:16; manifest.json:45-47 |
| `finding-density` (CRED, EXEC, HOOK, NET across many files) | 742 files of application code, 15 locales, and nine README translations. Density here measures repository size, not concentration of capability. | scanner stats: 742 files, 8224151 bytes |
| HOOK `prepare: node scripts/install-git-hooks.cjs` (package.json:46) | Sets `core.hooksPath` to `.githooks` for contributors cloning the repository. Never runs for a store install, which is a built bundle rather than an npm package. | package.json:46; scripts/install-git-hooks.cjs:6-7 |
| NET high volume | Dominated by `gemini.google.com` (242), `claude.ai` (97), `chatgpt.com` (43), `aistudio.google.com` (27), and reserved example domains in tests. These are the sites the extension exists to modify. | grep tally over src/ |

### The permission model, read closely

This is the part worth reading rather than counting. Three findings:

1. The broad permission is optional and gesture-gated. `<all_urls>` sits in
   `optional_host_permissions` (manifest.json:44), and `siteRegistration.ts:1-23` states in its own
   header that the request must be driven by a popup or options click and not by the background
   worker. That is the correct MV3 pattern, and it is documented in the code rather than merely
   followed.
2. Child-frame injection is opt-in. Ordinary match patterns would match same-origin iframes; the
   runtime restricts iframe injection to an explicit companion-origin list, currently only Claude's
   artifact frame origin (src/features/plugins/runtime/siteRegistration.ts:29-45).
3. Custom sites cannot be widened into a wildcard. The blocklist and the loopback-needs-a-port rule
   mean a user cannot type `*` and silently grant the extension every page
   (src/core/utils/customWebsites.ts:1-25).

### Negative claims and what was searched

Searched all of `src/` and `public/`: no analytics or telemetry endpoint, no `eval` or `new Function`
outside one test, no remote script loading (and the CSP forbids it), no credential read in extension
code, no outbound host beyond Google APIs and the project's own docs origin. The `identity`
permission is used for Google OAuth with the `drive.file` scope only (manifest.json:29-32), which
cannot read Drive files the extension did not create.

## 5. What we could not check

- **Store artifact equality.** The Chrome, Edge, Firefox, and Safari builds were not downloaded and
  compared against a local build of this commit. Users install the store artifact, not this tree.
  This is the largest gap in the card and the main reason it is not a B.
- **Runtime behavior in a live session.** No browser profile was instrumented; claims about what the
  extension sends are read from source, not observed on the wire.
- **The bundled MAIN-world scripts in depth.** `public/fetchInterceptor.js` (333+ lines),
  `claude-usage-observer.js`, and `conversation-history-observer.js` were read at their headers and
  spot-checked, not line by line. A `fetch` interceptor in the page world is the highest-leverage
  code in the package and deserves a dedicated pass.
- **Dependency advisories.** A large `bun.lock` was not joined against a pinned OSV snapshot.
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner's machine grade (F, from 1117 findings across 742 files) is
recorded rather than hidden, and it is wrong here in a predictable way: every gate resolves to build
tooling, test fixtures, or the very sites the extension is built to modify. The manual grade of C is
not a milder reading of those findings; it is a different concern, namely unverified store artifacts
and an optional `<all_urls>` capability.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Nagi-ovo/voyager /tmp/voyager-audit
cd /tmp/voyager-audit && git rev-parse HEAD   # expect f12a8bbdea39fd91ac4e4381e2db68bfd8497ffb

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/voyager-audit   # from a dsh-bridge checkout

# 3. Read the permission model, which is the whole risk surface
cd /tmp/voyager-audit
node -p "const m=require('./manifest.json'); ({perms:m.permissions, optional:m.optional_permissions, hosts:m.host_permissions, optionalHosts:m.optional_host_permissions, csp:m.content_security_policy, oauth:m.oauth2.scopes})"
sed -n '1,25p' src/features/plugins/runtime/siteRegistration.ts   # who may request the wide permission
sed -n '1,25p' src/core/utils/customWebsites.ts                   # what a user is forbidden to type

# 4. Spot-check the headline claims
grep -rnE "\beval\(|new Function" src/ public/ | grep -v test     # expect: no hits
grep -rniE "analytics|telemetry|sentry|posthog|beacon|gtag" src/ public/ | grep -v test   # expect: no hits
grep -rn "googleapis.com" src/ --include=*.ts | grep -v test      # expect: GoogleDriveSyncService only

# 5. Close the gap this card left open
# Download the store build and diff it against a local build of this commit:
bun install && bun run build:chrome
```

## 8. Methodology and pinned inputs

- Subject: git commit `f12a8bbdea39fd91ac4e4381e2db68bfd8497ffb` (shallow clone at
  reference/audits/voyager)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; single repository-root run,
  1117 findings over 742 files, machine F
- Review: full read of `manifest.json`, `src/core/utils/customWebsites.ts`,
  `src/features/plugins/runtime/siteRegistration.ts` header and origin logic,
  `scripts/verify-release-privacy.mjs`, `THIRD_PARTY_NOTICES.md`; targeted read of
  `src/core/services/GoogleDriveSyncService.ts` and the five `public/` injected scripts' headers;
  grep sweeps for dynamic execution, telemetry, credential reads, and outbound hosts across `src/`
  and `public/`
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no telemetry, no dynamic execution in shipped code, a correct and documented MV3
  optional-permission pattern, a minimal OAuth scope, and a release-privacy scanner the project runs
  on its own artifacts. Held to C by: an optional `<all_urls>` capability that by design lets the
  extension run on any page including your DSH web UI, an unaudited MAIN-world `fetch` interceptor,
  and store artifacts never compared against source. Closing the artifact gap and a line-by-line
  interceptor review are the two things that would move this to B.

## 9. Strengths

1. The project ships a release-privacy scanner and runs it on its own build artifacts, rejecting
   source maps, `.env` files, certificates, private keys, and matched GitHub, Slack, AWS, and Google
   key patterns before release (scripts/verify-release-privacy.mjs:13-37).
2. The wide permission is optional, gesture-gated, and the reasoning is written into the code rather
   than left implicit (src/features/plugins/runtime/siteRegistration.ts:1-23).
3. User-entered custom sites cannot become a wildcard, and loopback entries must pin a port
   (src/core/utils/customWebsites.ts:1-25).
4. The OAuth scope is `drive.file`, the narrowest useful Drive scope: the extension can touch only
   files it created (manifest.json:29-32).
5. The extension CSP is `script-src 'self'; object-src 'self'; worker-src 'self'`, which forecloses
   remote script execution regardless of what any future code attempts (manifest.json:45-47).
6. No telemetry at all in a consumer extension with six-figure install counts is unusual, and it
   matches the project's stated "your prompts, kept local" positioning (README.md:35).
7. Third-party MIT sources are attributed by name in `THIRD_PARTY_NOTICES.md` under a GPL-3.0 whole,
   which is correct license hygiene.

## 10. Residual risks

1. **It runs inside your AI sessions.** Content scripts on Gemini, Claude, and ChatGPT can read and
   modify conversation pages. That is the product, and it is also the blast radius.
2. **`<all_urls>` is one click away.** The permission is optional and gated, but a user who adds a
   custom site grants page access there; add enough sites and the practical surface approaches the
   wildcard the blocklist was written to prevent (manifest.json:44).
3. **A MAIN-world `fetch` interceptor sits in the page context** of Gemini pages
   (public/fetchInterceptor.js:1-11). Its documented purpose is narrow and its gating looks correct,
   but code in the page world sees traffic the extension sandbox otherwise would not.
4. **Store artifacts are unverified.** Nothing in this audit ties the reviewed source to the bytes
   the Chrome Web Store serves. Extension updates ship silently and automatically.
5. **Opt-in Drive sync moves your prompt library off-machine.** Narrow scope, but it is still an
   upload path (src/core/services/GoogleDriveSyncService.ts:81-82).
6. **No DSH-specific hardening exists.** DSH support is "add localhost:3080 as a custom site". If you
   run the DSH web UI, treat this extension as having page access to it.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. A new entry in `permissions` or
   `host_permissions`, a loosened CSP, or any new outbound host forces re-adjudication.
2. Diff `manifest.json` on every release. It is the shortest path to noticing a widened capability.
3. Do the line-by-line read of `public/fetchInterceptor.js` that this card deferred, and record the
   result as revision 2.
4. Download the current store build and diff it against a local `bun run build:chrome` of the tagged
   commit. That single check would close the largest gap here.
5. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
6. Re-vet at 90 days or on any new store release, whichever comes first.
