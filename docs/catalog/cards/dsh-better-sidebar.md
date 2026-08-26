# Trust report card: dsh-better-sidebar

| Field | Value |
|---|---|
| Plugin | `dsh-better-sidebar` (omdsh-dev/DSH-better-sidebar), v0.16.1 |
| Subject | GitHub commit `f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1` (tag 0.16.1, released 2026-08-25); npm `dsh-better-sidebar@0.16.1`, integrity `sha512-fjFNzfrgdIbzlcC4Sd4aS1I2ZRbuA+/m3XQnOxY13jE6IKJzwz0+GjATcKTyFoLnXoDRp2QJz/U0GxhaOD70Dw==`, unpacked 14.6 MB |
| Grade | **B** (scanner raw output F; adjudicated per pipeline S6 with evidence, see Methodology) |
| Verified at | Commit `f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1`, audited 2026-08-25 |
| Scanner | dsh-bridge tools/scan v0.1.0, rules digest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`: 214 findings (6 critical, 186 high, 2 medium, 20 low) |
| Downloads | ~145,679/month on npm (registry API, window ending 2026-08-24); task brief said 125k |

## Verdict in one sentence

Safe with documented behavior: no telemetry, no third-party egress, no credential access, no dynamic code execution; it does spawn shells (`node-pty`) and `git`, fetches user-directed URLs, and serves a browser UI over loopback HTTP, all of which is its documented job.

## What this plugin can do

Capability | Evidence | Notes
---|---|---
Spawns interactive terminal shells via node-pty | `src/pty-manager.ts:156-161`, `src/agent-pty.ts:222-227` | Passes the full parent env to spawned shells: `env: { ...process.env }`. Standard for terminals; means any secret in env vars is visible inside those shell processes.
Registers 8 model-invocable terminal tools | `src/tools.ts:92,138,179,228,285,371,405,445` | `terminal_create/list/send/read/wait_for/resize/signal/close` - lets the agent run and read shell commands.
Spawns `git` binary for source-control panel | `src/git.ts:14`, `src/git.ts:163` | argv-array spawn of system `git`, no shell interpolation.
Spawns OS openers (open/explorer/xdg-open/rundll32) | `src/open-external.ts:86` | Detached, stdio ignored. Custom-scheme URLs only; http(s) refused at `src/open-external.ts:69-71`.
Outbound HTTP fetches, user-directed only | `src/index.ts:533`, `src/index.ts:538`, `src/index.ts:552` | `browser.probe` fetches response headers of URLs typed into the built-in browser tab. No request bodies sent; results shown to the user only.
Loopback websockets + same-origin fetches | `src/client/Sidebar.tsx:434,491`, `src/client/api.ts:118` | Client talks to the plugin's own `/sidebar/*` routes on the DSH GUI origin. No other destination appears anywhere in `src/`.
Serves lazy JS chunks from own route | `src/client/chunk-loader.ts:83`, injected `<script>` at `src/client/chunk-loader.ts:148-161` | Script src is always `/sidebar/bundle/<name>.js` where name is one of three hardcoded values (`src/client/chunk-loader.ts:52`): terminal/editor/mermaid. Same origin, no external script loads.
Writes files inside the session workspace only | `src/fs-operations.ts:48`, guards in `src/path-security.ts:30-38`, `src/path-security.ts:51-75` | Uploads sanitized client-side (`src/client/upload.ts:26-30`) and fenced host-side: realpath + symlink containment before every write.
Mounts itself into DSH profiles via bundle patch | `cordis.patch.yml:48-49` | Single insert row plus an expression that backs off when another mount of the same package already exists.

## Evidence

### Injected scripts

All dynamically created script elements load from the plugin's own route. The only construction site is `src/client/chunk-loader.ts:148-161`; src is `/sidebar/bundle/<name>.js` (`src/client/chunk-loader.ts:83`) with `name` constrained to the union `'terminal' \| 'editor' \| 'mermaid'` (`src/client/chunk-loader.ts:52`). The server side regex-validates the name against that same set (`src/bundle-route.ts:85`). No CDN, no unpkg/jsdelivr, no eval-based loading. The scanner's `dynamic-exec-present` gate fires on `import(specifier)` at `src/client/chunk-loader.ts:98` and `src/context-types.ts:547`, but both are type signatures for the DSH-provided module system resolving platform externals (react, cordis, ui slots - list at `src/client/chunk-loader.ts:71-80`); no string-built specifier reaches a real import call site.

### External asset loads

None found in shipped source. Every literal URL in `src/` resolves to github.com repository links displayed as metadata or install commands in the add-plugin modal (`src/client/plugins-tabs.ts:19-94`, `src/client/plugins-viewers.ts:19-26`, `src/client/plugins-shared.ts:11`), SVG namespace identifiers (`src/client/icons.tsx:16` etc., inert XML namespaces), or `http://dsh.internal` placeholder bases used only for relative-path parsing (`src/index.ts:772` etc.). Markdown preview routes remote images through DOMPurify defaults plus a denylist and rewrites local media to the workspace media route (`src/client/MarkdownHtml.tsx:51-53`, `src/client/MarkdownHtml.tsx:77-84`); mermaid output is re-sanitized from parsed XML with scripts, foreignObject, event handlers, and all href attributes stripped (`src/client/mermaid-sanitize.ts:38-52`, `src/client/mermaid-sanitize.ts:56`). The built-in browser embeds user-typed sites in sandboxed iframes with loopback refused by default (`src/client/browser.ts:80-84`, `src/client/browser.ts:146`, `src/client/browser.ts:156`).

### Telemetry

None. Grep across all shipped source for telemetry/analytics/beacon/sentry/posthog/mixpanel/segment/tracking returns zero matches. No `sendBeacon`, `XMLHttpRequest`, or pixel-image channels exist. All eight `fetch()` call sites are enumerated above; none target anything but the plugin's own routes or a user-typed probe URL. No timers, schedulers, or idle beacons beyond terminal I/O plumbing.

### Credential access

No reads of `~/.claude`, `~/.codex`, `~/.ssh`, `~/.aws`, `.env`, or auth stores anywhere in `src/`. The scanner's six critical CRED findings are false positives:

- `CRED-006` at `src/pty-manager.ts:161` / `src/agent-pty.ts:227`: `{ ...process.env }` passed into spawned terminal shells so they inherit PATH/HOME like any real terminal. Not read, serialized, or transmitted by plugin code. Note this does surface ambient secrets inside the shell process itself - inherent to offering a terminal.
- `CRED-006` at `tsdown.config.ts:141,142,207,208`: build-time inlining of `NODE_ENV` during bundling. Build config, never shipped or executed at runtime.
- `CRED-010` at `tests/terminal-deps-banner.spec.tsx:27`: a test fixture string containing a path under `~/.dsh`.

### Scanner F-grade reconciliation (why B)

The scanner graded F on "at least one critical finding" plus the dynamic-exec gate. Adjudication per pipeline S6 (human may lower, evidence may clear false positives):

- All 6 criticals are false positives (above). None pair credential reads with egress; there are no credential reads.
- 186 highs decompose into: regex `.exec()` calls misread as code execution (~60), SVG xmlns attribute strings (~15), translation strings containing the word "fetch" (~17), tests spawning git/pnpm/tar in test fixtures (~40), dev/e2e scripts invoking npx (`scripts/e2e-mount.sh:44-50`, not executed at plugin runtime).
- The 2 mediums (`HOOK-002`, `package.json:76,80`) are `prepublishOnly: pnpm build` and `prepare: tsdown` - build-only hooks run on the maintainer's machine at publish time, not fetched remote execution.
- Residual true capabilities are the declared ones: shell spawn, git spawn, opener spawn, user-directed header probe. These match the product description ("explorer / editor / terminal / git / browser").

## Strengths

- Zero telemetry, zero third-party network endpoints, zero credential-path reads across the entire shipped source tree.
- Defense-in-depth on untrusted content: DOMPurify plus explicit denylist for markdown HTML (`src/client/MarkdownHtml.tsx:51-53`), strict XML-parse-then-strip sanitization for mermaid SVG (`src/client/mermaid-sanitize.ts:56`), scheme blocklist plus protocol backstop plus opaque-origin sandbox for the embedded browser (`src/client/browser.ts:80-84`, `src/client/browser.ts:146`).
- Host-header/Origin/sec-fetch-site fence against DNS rebinding on every sidebar route (`src/trust-fence.ts:63-83`), behaviorally mirroring the official gateway fence.
- Filesystem writes fenced by realpath resolution, symlink containment, traversal refusal, and atomic temp-file rename (`src/path-security.ts:30-75`, `src/fs-operations.ts:11-16`).
- Release hygiene: npm Trusted Publishing via OIDC with provenance attestation, no long-lived tokens (`.github/workflows/release.yml:1-27`); CI runs typecheck, full test suite, and consumer-type checks (`.github/workflows/ci.yml:36-51`).
- Substantial test suite (~150 spec files), including adversarial fixtures: XSS payloads in mermaid sanitize tests, symlink escapes, UNC paths, DNS-rebinding origins.
- Spawn discipline: argv arrays everywhere, no shell-string interpolation (`src/open-external.ts:19-23`, `src/git.ts:163`).

## Residual risks

1. Terminal tools give the model a shell. `terminal_create/send` (`src/tools.ts:92,179`) let the LLM execute arbitrary commands on the user's machine. That is the feature, but it materially raises blast radius if a user's session is prompt-injected. Inherited env (`src/pty-manager.ts:161`) exposes ambient secrets to that shell.
2. Unversioned install commands for recommended plugins. Most entries in the add-plugin modal omit tags, e.g. `git+https://github.com/Fisfzy/ego-browser.git` (`src/client/plugins-tabs.ts:34`) versus the pinned `"github:fuhefei/dsh-sentinel#v0.7.0"` (`src/client/plugins-tabs.ts:25`). Users following them install moving targets; those third-party plugins are outside this audit.
3. SSRF-shaped header probe. `browser.probe` fetches attacker-influenced URLs if a malicious page can drive the GUI, mitigated by the trust fence, the loopback default-deny (`src/index.ts:521-527`), 8 s timeout (`src/index.ts:531`), and headers-only responses. Redirect-following (`src/index.ts:533`) can bounce past the original-host check; impact limited to status line and frame-related headers.
4. Loopback allowlist widens local attack surface when enabled. Off by default (`src/config.ts:144`); enabling it permits embedding local dev servers with `allow-same-origin` (`src/client/browser.ts:101-118`), a documented trade-off.
5. This audit examined source, not the published tarball byte-for-byte, and did not audit 60+ runtime dependencies (CodeMirror, mermaid, ws, rxjs, etc.). npm integrity above pins what was checked out; provenance attestation exists but was not independently verified here.

## What we could not check

- Behavioral probe (S4) and dual LLM adversarial review (S5) were not run; this card covers static analysis plus manual review of flagged regions.
- `lib/**` bundles were absent from the shallow clone (source-only checkout); the published tarball ships prebuilt bundles whose correspondence to this source was verified by integrity hash presence, not by rebuild comparison.
- Peer dependencies resolved on the user's machine, including optional `@huanlin/dsh-plugin-better-locale` (`package.json:105-108`).
- Third-party plugins listed in the in-UI discovery catalog (`src/client/plugins-tabs.ts`).

## Verify this yourself

```bash
git clone --depth 1 https://github.com/omdsh-dev/DSH-better-sidebar /tmp/dbs && cd /tmp/dbs
git rev-parse HEAD   # must print f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1
npm view dsh-better-sidebar@0.16.1 dist.integrity
# -> sha512-fjFNzfrgdIbzlcC4Sd4aS1I2ZRbuA+/m3XQnOxY13jE6IKJzwz0+GjATcKTyFoLnXoDRp2QJz/U0GxhaOD70Dw==

# Spot-check headline claims:
grep -rn "sendBeacon\|XMLHttpRequest" src/            # expect: no matches
grep -rn "fetch(" src --include='*.ts' --include='*.tsx' | grep -v locales | grep -v '"/sidebar\|mediaUrl\|CHUNK_URL\|parsed'
grep -rn "\\.ssh\\|\\.aws\\|\\.claude\\|auth.json" src/ # expect: no code matches
sed -n '148,161p' src/client/chunk-loader.ts          # only script injection site; src is /sidebar/bundle/<name>.js
sed -n '63,84p' src/trust-fence.ts                    # DNS-rebinding fence

# Full re-scan:
node /path/to/dsh-bridge/tools/scan/dist/index.js /tmp/dbs
```

## Methodology and pinned inputs

Scanner v0.1.0, rules digest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`, run 2026-08-25 against commit `f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1` (254 files, ~2.97 MB scanned). Grade derivation follows docs/trust/pipeline-architecture.md S6: mechanical caps apply to unexamined regions (no probe, single reviewer, source-not-bundle), which sets the ceiling below A; every critical/high was individually adjudicated with file:line evidence rather than accepted raw. Raw scan output retained at `reference/audits/dsh-better-sidebar-scan.json`. A grade is evidence-backed opinion over a pinned artifact, not a safety guarantee, and says nothing about versions other than the pinned one.

## Re-verify triggers

New upstream release, corpus/rules digest change, advisory touching CodeMirror/mermaid/dompurify/ws/node-pty, or 90 days elapsed (by 2026-11-23). Re-run: clone pinned tag, re-run scanner, diff findings against this revision, confirm npm integrity unchanged or re-adjudicate.
