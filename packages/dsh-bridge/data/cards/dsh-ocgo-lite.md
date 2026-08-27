# Trust Report Card: dsh-ocgo-lite

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-ocgo-lite` (OpenCode Go usage bar for DSH: quota rings, token/cost tallies, one-click API key copy) |
| Pinned subject | github:OK-wx/dsh-ocgo-lite @ commit `96314bcd7966c88b6907fe5797719793a9b014e9` (2026-08-21, default-branch head at audit time) |
| npm integrity | Not applicable. No published npm package was located for this name; install path is `dsh plugin add github:OK-wx/dsh-ocgo-lite`. |
| Provenance | None. No signed tags, no npm attestation, no release workflow in-repo. Trust rests on the GitHub commit alone. |
| License | MIT (LICENSE:1-3, "Copyright (c) 2026 OK-wx") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of both shipped files) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Honest, dependency-free usage meter whose behavior matches its README, but it registers an
unauthenticated loopback route that returns the user's OpenCode Go API key in plaintext
(lib/index.js:749-768), and that single design choice is what holds the grade at C.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Two destinations, both opencode.ai: `https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <user's own key>` (lib/index.js:13, 87-90), and `https://opencode.ai/docs/go` scraped as HTML for the pricing table, unauthenticated (lib/index.js:112, 120). No other hosts appear in either shipped file. | file:line above |
| Credential reads | `~/.local/share/opencode/auth.json`, keys `opencode-go.key` then `opencode.key` (lib/index.js:73-80). Data dir may be overridden by `OPENCODE_DATA_DIR` (lib/index.js:69). The key is sent only to opencode.ai (its own issuer) and served over the local `/ocgo-lite/key` route. | lib/index.js:73-80, 87-90, 752-762 |
| Loopback HTTP routes | `GET /ocgo-lite/api` (aggregate stats, key shown masked only, lib/index.js:727-746) and `GET /ocgo-lite/key` returning `{ok:true,key:"<plaintext key>"}` (lib/index.js:749-768). Registered on the host's own web server via `ctx.webServer.register`. Neither handler inspects `Host`, `Origin`, `Referer`, or any token. | lib/index.js:726-769 |
| Session-file reads | Enumerates `~/.dsh/sessions/<workspace>/<session-*>/session.jsonl[.zstd]` and streams every frame, parsing JSONL events (lib/index.js:579-608, 271-320). Only `assistant/message` usage counters are retained; message text is parsed and discarded, never stored or transmitted. | lib/index.js:293-303, 209-263 |
| Filesystem writes | None. No `writeFile`, `mkdir`, `rm`, or `open` for write anywhere in `lib/` (grep verified). All state is in-process (`dshCache`, `fileMtimes`, `PRICING`). | negative claim, scope: lib/index.js + lib/client.js |
| Child processes | None. No `child_process`, `spawn`, `exec`, or shell string anywhere in `lib/`. The scanner's EXEC-adjacent hit at lib/index.js:712 is the tool descriptor's own `execute:` property name. | lib/index.js:712 |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*`. One dynamic `import('@deepseek-ai/dsh-tools')` at lib/index.js:716 with a literal specifier, wrapped in try/catch for optional tool registration. | lib/index.js:716 |
| Telemetry | None. No analytics, beacon, or metrics code; no third-party host in either file. | negative claim, scope as above |
| Client-side | React-only rendering via `React.createElement`; no `innerHTML`, `dangerouslySetInnerHTML`, `localStorage`, or `document.cookie` (grep verified). Clipboard write uses `navigator.clipboard.writeText` with an `execCommand` fallback (lib/client.js:153-160). Polls `/ocgo-lite/api` every 30s (lib/client.js:221). | lib/client.js |

Where the API key goes: to `opencode.ai` as a Bearer header (its own issuer, expected), and to
whoever asks `GET /ocgo-lite/key` on the DSH web server. The intended asker is the plugin's own
panel, invoked when the user clicks "copy key" (lib/client.js:573-585).

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 10 findings (7 high, 3 medium, 0 critical), machine grade F, gate `cred-plus-net`.
Both shipped files (lib/index.js 772 lines, lib/client.js 720 lines) were read in full, so the
adjudication below covers 100 percent of the shipped code.

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| OCGO-CRED-1 | **high** | lib/index.js:749-768 | `GET /ocgo-lite/key` returns the plaintext OpenCode Go API key with no authentication, no `Host` check, and no `Origin`/`Referer` check. The code comment claims "only same-origin on this machine" (lib/index.js:748) but nothing in the handler enforces that; the claim is not implemented. Reachable by any local process (`curl http://127.0.0.1:<port>/ocgo-lite/key`) and by a DNS-rebinding page, since rebinding defeats the browser's same-origin protection and the DSH webserver performs no Host validation (verified absent: `grep -n "headers.host\|origin" packages/host/webserver/src/*.ts` in the DSH reference checkout returns nothing). Compare modlens, which does enforce loopback-Host plus same-origin on its config route. |
| OCGO-NET-1 | medium | lib/index.js:13, 87-90 | Quota call to the key's own issuer with the user's own Bearer token. Documented (README.md:72). Expected behavior for this product. |
| OCGO-NET-2 | medium | lib/index.js:112, 120 | Scrapes the vendor's public pricing page every 24h and at `apply()` (lib/index.js:701), unauthenticated, no user data attached. Documented (README.md:86-90). Note the parsed values overwrite the in-memory `PRICING` table (lib/index.js:157-167), so a compromised or restructured vendor page changes displayed cost figures; this is a correctness/display risk, not an egress risk. |
| OCGO-CRED-2 | medium | lib/index.js:73-80 | Reads another tool's `auth.json`. Narrowly scoped to two key names, wrapped in try/catch, value used for the documented quota call. Masked before it reaches `/ocgo-lite/api` (lib/index.js:679-681). |
| OCGO-PRIV-1 | low | lib/index.js:579-608, 271-303 | Reads every DSH session log on the machine, including other workspaces (`readdirSync` over all workspace dirs, no cwd scoping). Only usage counters survive parsing; no conversation content is retained or sent. Volume-wise it decompresses up to 64 MB compressed per file with concurrency 2 and explicit memory-cap comments (lib/index.js:21-23). |
| OCGO-HOOK-1 | low | lib/index.js:701 | `apply()` fires the pricing fetch immediately, so one outbound request to opencode.ai happens at plugin activation without user action. No consent prompt. Documented at README.md:88 ("on startup and every 24 hours"). |
| OCGO-HOOK-2 | low | lib/client.js:221 | 30-second polling interval against the plugin's own loopback route. Local only. |

### Scanner noise dismissed (with scope)

- HOOK at lib/client.js:180 and :580: 1500 ms `setTimeout` calls that clear a toast message
  (`setToast(null)`, `setCopied(false)`). Not beacons; read directly.
- HOOK at lib/client.js:335: top-level IIFE inside a React render tree building a badge element
  (lib/client.js:330-345). No I/O.
- NET at lib/client.js:199 and :573: fetches to the plugin's own relative paths
  `/ocgo-lite/api` and `/ocgo-lite/key`. Same-origin, no external host.
- `cred-plus-net` F cap: the co-occurrence is real and intended (read the key, call the key's own
  issuer). It is not the reason for the C; OCGO-CRED-1 is.

### Negative claims and what was searched

Searched all of `lib/` (the entire `files` allowlist in package.json, 2 JS files, 1492 lines,
both read line by line) plus package.json, cordis.patch.yml, README.md, LICENSE. There are no
other code files in the repo; the remaining 7 files are PNG screenshots and .gitignore.
Results: no `eval`/`new Function`/`vm`; no `child_process`/`spawn`/`exec`; no npm lifecycle
scripts at all (`package.json` has no `scripts` field, verified by
`node -e 'require("./package.json").scripts'` returning undefined); no runtime dependencies
(only peer `@deepseek-ai/cordis`, package.json:44-46); no obfuscation (plain unminified ESM,
comments intact, Chinese-language comments throughout); no telemetry host; no filesystem writes;
no `.ssh`/`.aws`/browser-store/keychain access; no `innerHTML`/`localStorage`/cookie use in the
client.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/click-through/idle-soak run was performed. In
  particular, OCGO-CRED-1 was established by reading the handler, not by curling a live DSH
  instance; the exposure follows from the absent checks, but the live port and any host-level
  middleware in a future DSH version were not exercised.
- **Published-artifact comparison.** No npm package was found for this name, so there is nothing
  to byte-compare against the git tree. Anyone installing from GitHub gets exactly these files,
  which is a small mitigation, but there is no signature or attestation binding the commit to an
  author.
- **The vendor pricing page's shape.** The scraper's HTML assumptions (lib/index.js:126-155) were
  read, not run against the live page; whether the parse currently produces sane numbers is
  unverified, and a page redesign could silently degrade displayed costs.
- **DSH webserver exposure surface.** We confirmed `--host 0.0.0.0` is refused by DSH
  (packages/bundle/web-app/src/startup.ts:74-75) and that the webserver schema permits only
  `127.0.0.1` or `0.0.0.0` (packages/host/webserver/src/index.ts:61). We did not audit whether any
  DSH deployment mode (container port-forward, tunnel, reverse proxy) could publish that port
  anyway, which would turn OCGO-CRED-1 from local-process/rebinding exposure into direct exposure.
- **The zstd frame walker** (lib/index.js:616-659) was read for memory and bounds behavior but not
  fuzzed with malformed frames.
- **Cross-model review.** Single reviewer, single model.

## 6. Grade derivation

Start at B (declared, documented egress; no dynamic exec; no hooks; no telemetry).
One high-severity production finding that exposes a live credential without authentication
(OCGO-CRED-1) caps at C. It does not fall to D because the plugin's own code never sends the key
anywhere but its issuer, there is no obfuscation or lifecycle abuse, the exposure requires local
code execution or a rebinding attack rather than being remotely trivial, and a fix is roughly ten
lines (validate `Host` against loopback and require a same-origin `Origin`, as modlens does at
dsh/index.js:1853-1871). Scanner's F is not adopted: `cred-plus-net` fires on the intended,
documented data flow.

## 7. Strengths

1. Zero runtime dependencies and no npm lifecycle scripts; the whole attack surface is 1492 lines
   of readable ESM (package.json has no `scripts` key, peer dep only).
2. Real memory discipline instead of hand-waving: per-frame zstd decode with single-frame
   discard, explicit compressed and decompressed caps, concurrency 2, with the reasoning written
   down at lib/index.js:16-23 and 265-270.
3. The stats route masks the key (`sk-abc…wxyz`, lib/index.js:679-681) rather than shipping it in
   the polling payload; plaintext is confined to one explicit user-initiated route.
4. Honest cost accounting: unknown models are counted as `costUnknown` rather than silently
   priced at zero (lib/index.js:244-249), and the README states the amount is an estimate
   (README.md:74).
5. No filesystem writes anywhere, so a bug cannot corrupt user state.

## 8. Residual risks

1. Any process running as the user can read the OpenCode Go API key from
   `http://127.0.0.1:<port>/ocgo-lite/key` without credentials. The key is already on disk in
   `auth.json`, so this raises no new secret, but it removes the file-permission barrier and
   makes the key reachable over HTTP, which is what makes DNS rebinding relevant.
2. Session-log scanning is machine-wide, not workspace-scoped. Nothing leaves the machine, but a
   parsing bug in `foldUsageEvent` would be operating on other projects' conversation text.
3. Displayed spend depends on scraping a vendor HTML page; wrong or missing rows produce wrong
   numbers with no user-visible failure signal beyond `meta.pricingUpdatedAt`.
4. No provenance of any kind. A force-push to the default branch changes what future installs get,
   and nothing here would detect it.
5. Activation performs network I/O before any user interaction (lib/index.js:701).

## 9. Reviewer disagreement

Single-reviewer pass; no second adversarial model. The scanner graded F on `cred-plus-net`; this
card grades C and records the scanner's position in section 4 rather than dropping it.

## 10. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/OK-wx/dsh-ocgo-lite /tmp/ocgo-audit
cd /tmp/ocgo-audit && git rev-parse HEAD  # expect 96314bcd7966c88b6907fe5797719793a9b014e9

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ocgo-audit   # from a dsh-bridge checkout

# 3. The headline finding: plaintext key route with no auth
sed -n '748,768p' lib/index.js          # no Host/Origin/token check in the handler
grep -n "headers\|origin\|Origin" lib/index.js   # only the URL parse at :735

# 4. The negative claims
grep -n "eval(\|new Function\|child_process\|spawn\|writeFile" lib/*.js   # expect no hits
grep -rhoE "https?://[a-zA-Z0-9./_-]+" lib/ | sort -u                     # expect opencode.ai only
node -e 'const p=require("./package.json");console.log(p.scripts,p.dependencies)'  # expect undefined undefined

# 5. Live check of the exposure (only on your own machine, with DSH web running)
curl -s http://127.0.0.1:<dsh-web-port>/ocgo-lite/key   # returns your key in cleartext
```

## 11. Re-verify steps

1. Re-run the section 10 block against current HEAD. If `/ocgo-lite/key` gains a `Host` plus
   `Origin` check, OCGO-CRED-1 clears and the grade should be revisited upward to B.
2. Any new literal URL in `lib/` is a new egress destination and must be re-adjudicated; the
   current allowlist is exactly `opencode.ai/zen/go/v1/usage` and `opencode.ai/docs/go`.
3. Watch for a `scripts` field appearing in package.json (currently absent) or any runtime
   dependency; either changes the install-time trust model.
4. If a package is ever published to npm under this name, pin `dist.integrity` and re-audit,
   since the git tree would no longer be the installed artifact.
5. Re-run the scanner after any heuristics-corpus bump; the rulesDigest for this pass is recorded
   in section 4.

## 12. Methodology and pinned inputs

- Subject: commit `96314bcd7966c88b6907fe5797719793a9b014e9`, shallow clone at
  `reference/audits/dsh-ocgo-lite`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Manual review: full read of lib/index.js (772 lines) and lib/client.js (720 lines), plus
  package.json, cordis.patch.yml, README.md, LICENSE. That is every non-image file in the repo.
- Cross-reference: DSH reference checkout at `reference/deepseek-harness` for webserver route
  semantics (packages/host/webserver/src/index.ts:61, 108) and host-binding policy
  (packages/bundle/web-app/src/startup.ts:74-75).
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
