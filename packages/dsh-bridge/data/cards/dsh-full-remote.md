# Trust Report Card: dsh-full-remote (`JUANWANG-BUAA/dsh-full-remote`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-full-remote` - an authenticated reverse proxy in front of the DSH web backend: token + per-device session login, one-click Cloudflare quick tunnel, QR invites, Host/Origin rewrite so settings and credentials keep working from a phone. |
| Pinned subject | github:JUANWANG-BUAA/dsh-full-remote @ commit `abd0dfd62e7c02199cb10c8796e4b6c2152eda5c` (default branch `main` head at audit time) |
| npm integrity | v0.3.7 on registry with SLSA provenance attestation (`slsa.dev/provenance/v1`) and `gitHead 1bf7104f`; audited HEAD `abd0dfd` is a later commit (0.3.8 prep). Tarball for the audited revision not byte-compared. |
| Provenance | Strong. Tag-gated publish workflow requires the tag to match package.json, HEAD to be an ancestor of main, full check suite plus `pnpm audit --prod`, and publishes with `--provenance` and pinned action SHAs (.github/workflows/publish.yml:3-6, 33-40, 44-46; :14 `id-token: write`). |
| License | MIT declared in package.json:54; LICENSE file present at repo root. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of src/ and install/publish channels) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

This plugin's entire purpose is to expose your DSH instance to other devices, and it does that
one job defensively: a 192-bit token gate with per-device sessions, hash-only cookie secrets,
constant-time comparison, loopback-only control plane, CIDR allowlists, rate-limited login,
SHA256-pinned cloudflared downloads, and no telemetry or credential access anywhere in shipped
source.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network listeners | Binds its own HTTP(S) proxy server (default `127.0.0.1:3081`, user-reconfigurable) in front of the backend, and forwards every request to the configured backend host/port after auth. WebSocket upgrades are relayed with both-end teardown. | src/index.ts:313-353; src/proxy.ts:341-428, 751-833 |
| Network egress (own code) | One outbound call family in shipped source: the tunnel manager fetches cloudflared release binaries from `https://github.com/cloudflare/cloudflared/releases/download/<pinned-version>/<asset>`. All other high NET findings are tests, dev scripts, i18n strings, and URL-constructor noise. | src/tunnel.ts:186; adjudicated finding table in section 4 |
| Credential handling | Generates a 24-byte base64url access token (`node:crypto.randomBytes`), stores it in `~/.dsh/reverse-proxy.json` mode 0600 via atomic write. Session cookies carry only id + random secret; the state file keeps SHA-256 hashes, never raw secrets. Token comparison is `timingSafeEqual` with equal-length hashing fallback. Reads exactly three env vars: `DSH_HOME`, `PATH`, and its own opt-out flag. | src/security.ts:12-25; src/persist.ts:30, 88-97; src/sessions.ts:56-58, 70-72; grep over src/ |
| Binary download and exec | Downloads cloudflared (128 MB cap, 60 s timeout), verifies SHA256 against an embedded per-platform table BEFORE writing to cache, re-verifies the cache against a stored digest, then spawns it as a child process with `--no-autoupdate`. | src/tunnel.ts:26-36, 186-232, 233-250, 264-266 |
| Control surface | HTTP routes under `/dsh-reverse-proxy`: status, invite/QR, sessions approve/revoke/rename, start/stop, rotate token, listen change, audit read/export, self-check. Gated three ways: remote address must be loopback (control-routes.ts:162), custom header `x-dsh-reverse-proxy-control: 1` required (:171), Origin must be absent or loopback (:171, :40-47). Token reveal additionally requires `allowTokenRead` config (index.ts:500, 508-512). | src/control-routes.ts:91-176 |
| Login hardening | Per-IP failed-login tracker with lockout (default 5 attempts / 5 min, bounded memory), constant 250 ms delay on success AND failure to defeat timing classification, one-time invite codes instead of the standing token in URLs, upgrade (WebSocket) attempts tracked separately. | src/proxy.ts:157-220, 430-529; src/index.ts:471-479 |
| Header hygiene | Strips hop-by-hop headers, all spoofable forwarding headers (`x-forwarded-*`, `forwarded`, `cf-connecting-ip`, own control header) and internal `cookie`/`referer` before forwarding; re-derives host/origin from the trusted rewrite authority; trusts XFF only from loopback peers while a tunnel is verifiably online. Drops upstream `set-cookie` from responses. | src/proxy-headers.ts:14-46, 99-118, 120-141; src/index.ts:340-347 |
| Child processes | Exactly one spawn site in runtime code: cloudflared, argument list fixed, no shell. Dev/test/scripts code (bootstrap, smoke, screenshot capture) uses spawn/vm but never ships (see files whitelist). | src/tunnel.ts:15, 264-266; package.json:35-49 |
| Dynamic code execution | None in `src/`. The 37 scanner EXEC highs are: tests exercising the bootstrap string in a `node:vm` sandbox (tests/page-bootstrap.test.ts:5, 27-29), dev scripts spawning pnpm/chrome, and regex `.exec()` false positives. The client bundle ships one hand-written ES5 IIFE string injected into index HTML; it patches crypto.randomUUID polyfill, AbortSignal.any, and pins `connection.isLoopback` behind a global trust flag - no remote code is ever fetched into it. | grep negative over src/; src/page-bootstrap.ts:28-114; tests/page-bootstrap.test.ts |
| Telemetry | None. No analytics endpoint, counter, or beacon anywhere in shipped source. | grep negative |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.

**135 findings** (1 critical CRED, 1 high SUPPLY, 85 high NET, 34 high EXEC, 7 medium HOOK,
9 medium/low NET+OBFU). Machine verdict **F**, off gates `cred-plus-net-split`,
`dynamic-exec-present`, `finding-density`. Manual adjudication follows.

### The 85 high NET findings

Roughly 70 of them sit under `tests/` (fixture URLs like `http://evil.example`,
`http://192.168.3.23:3081`, `https://abc123.trycloudflare.com`) and `scripts/` (smoke harness
that talks to a locally started DSH). In shipped `src/` the real hits are:

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high, `new WebSocket(url)` / `http://${parsed.host}/json/list` | Not in shipped source: these live in `scripts/browser-smoke.mjs` and `scripts/capture-screenshots.ts` (dev tooling that drives a local Chrome). Never packaged. | scripts/browser-smoke.mjs:83; scripts/capture-screenshots.ts:231, 266-268; package.json files list |
| NET high `fetch(${BASE}/dsh-reverse-proxy/...)` x17 | `scripts/smoke.mjs`, the integration test harness. Exercises the plugin's own loopback control routes. | scripts/smoke.mjs:81-268 |
| NET high `origin: http://${backendHost}` etc. | `src/proxy-headers.ts:111` - this IS the product: rewriting Host/Origin to the loopback-trusted form so the backend accepts proxied requests. Destination is the user-configured local backend. | src/proxy-headers.ts:107-117 |
| NET high SVG namespace / trycloudflare strings in i18n and icons | String literals for UI copy and the DeepSeek logo SVG. Inert. | src/client/i18n.ts:130, 168, 308, 346; src/client/ReverseProxyIcon.tsx:16 |
| NET low registry/github URLs | Metadata in workflows and package.json. Inert. | .github/workflows/publish.yml:30; package.json:57-65 |
| `cred-plus-net-split` gate | Fires because `src/` both touches credentials and performs network I/O. Adjudicated: the credential is the plugin's OWN generated access token, used to authenticate ITS OWN listener; the only outbound fetch downloads a hash-pinned binary. No secret leaves the machine except inside the user's own authenticated requests. | src/security.ts:12-14; src/persist.ts:88-97; src/tunnel.ts:186-210 |
| `dynamic-exec-present` gate | Dismissed for shipped code: zero `eval(`/`vm.` in `src/` (grep verified). All 34 EXEC highs are tests using `node:vm` to unit-test a shipped string, dev-script spawns, and regex `.exec(` identifier collisions. | grep negative; tests/page-bootstrap.test.ts:5-29 |
| CRED critical `process.env.NODE_ENV` in tsdown.config.ts:46 | Build config interpolating NODE_ENV into the browser bundle define. It reads a build-machine variable to inline a string, not a credential harvest. tsdown.config.ts is also absent from the npm files whitelist. | tsdown.config.ts:44-47; package.json:35-49 |
| SUPPLY high `git+https://...repository.url` (package.json:61) | Standard repository metadata pointing at the project's own public repo. Inert. | package.json:59-62 |
| OBFU medium `Buffer.from(shot.data,'base64')` (scripts/capture-screenshots.ts:155) | Decodes screenshots taken by the dev screenshot tool. Dev-only, never shipped. | scripts/capture-screenshots.ts:150-156 |
| HOOK medium `prepare: pnpm run build` (package.json:33) | Real but narrow: runs the project's own bundler on git-URL and `link:` installs; skipped for registry tarballs. README documents the pnpm >= 10 approval prompt (README.md:458). Registry installs unaffected. | package.json:33; README.md:458 |

### Design points worth naming

The security posture is unusually deliberate for this ecosystem: hash-only storage of device
session secrets with domain-separated SHA-256 (src/sessions.ts:56-58); login delay applied
equally to success and failure so token prefixes cannot be timed (src/proxy.ts:462-465);
invite codes are single-use and bound to the requesting IP rather than exposing the standing
token in QR links (src/index.ts:471-472); the control API demands loopback source AND a magic
header AND same-loopback origin, which blocks drive-by CSRF from a malicious webpage even when
the user has the panel open (src/control-routes.ts:161-175); and forwarded-header trust is
live only while cloudflared is actually in `online` state (src/tunnel.ts:120-122;
src/index.ts:345-347).

## 5. What we could not check

- **Published-tarball equality for the audited commit.** npm v0.3.7 has `gitHead 1bf7104`;
  the audited HEAD is later. The publish workflow builds reproducibly from the tag with
  frozen lockfile, but we did not rebuild and byte-compare.
- **Behavioral probe.** No sandboxed load/listen/login exercise was run.
- **Cloudflared itself.** The binary is third-party (hash-pinned, which is strong, but the
  pinned bytes were not independently reviewed).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says B. The gap is the same shape as previous
cards: test/dev files counted as shipped egress and execution, plus a gate that treats "the
plugin authenticates its own listener" as exfiltration.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/JUANWANG-BUAA/dsh-full-remote /tmp/rp-audit
cd /tmp/rp-audit && git rev-parse HEAD   # expect abd0dfd62e7c02199cb10c8796e4b6c2152eda5c

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/rp-audit   # from a dsh-bridge checkout

# 3. Spot-check headline claims
grep -rnE "eval\(|vm\.runInContext" src/                 # expect: no hits
grep -rn "process.env" src/                              # expect 3 benign hits: PATH, DSH_HOME, opt-out flag
grep -rn "spawn" src/*.ts | grep -v tests                # expect: tunnel.ts cloudflared spawn only
sed -n '186,232p' src/tunnel.ts                          # download + SHA256 verify-before-write
sed -n '161,175p' src/control-routes.ts                  # triple-gated control surface
sed -n '38,47p' src/proxy-headers.ts                     # spoofable-header strip list

# 4. Read what npm actually ships
npm view dsh-full-remote@0.3.7 dist.attestations         # expect slsa.dev/provenance/v1
# files whitelist has no scripts/, no tsdown.config.ts:
python3 -c "import json;print(json.load(open('package.json'))['files'])"

# 5. Confirm publish gating
sed -n '1,50p' .github/workflows/publish.yml             # tag check, ancestor check, audit:prod, --provenance
```

## 8. Methodology and pinned inputs

- Subject: git commit `abd0dfd62e7c02199cb10c8796e4b6c2152eda5c` (shallow clone at
  reference/audits/dsh-full-remote)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest above; run recorded in section 4
- Review: manual read of src/{index,proxy,proxy-headers,sessions,security,persist,tunnel,
  control-routes,control,hosts,persist,page-bootstrap,directory-picker}.ts plus cordis.patch.yml,
  package.json, publish workflow, SECURITY.md; npm metadata for v0.3.7
- Cross-model review: NOT performed (single reviewer). Revision 1 capped accordingly.
- Grade derivation: no high or critical finding survives in shipped code after adjudication.
  Egress is one hash-pinned binary download plus the product's own proxying; credentials are
  self-generated tokens stored 0600 and hashed at rest; control plane is loopback + header +
  origin gated; no dynamic execution, no telemetry, LICENSE present, SECURITY.md present,
  tag-gated provenance publishing. Caps applied: the `prepare` hook fires on git/link installs;
  published tarball not byte-matched to audited commit; cloudflared binary not audited; no
  behavioral probe; single reviewer - each alone bars A. Result: **B**.

## 9. Strengths

1. Verify-before-write supply chain for its one downloaded binary, with cached binaries
   re-verified against a stored digest on every start (src/tunnel.ts:196-232, 233-249).
2. Session cookies never contain the master token; revocation and rotation semantics are
   explicit and tested, including rollback on failed persistence (src/index.ts:376-400).
3. Timing-equal login responses plus per-IP lockout with bounded memory under spoofing
   (src/proxy.ts:149-220, 462-465).
4. Control plane assumes a hostile browser: loopback source, magic header, and origin checks
   together defeat CSRF and DNS-rebinding style reaches (src/control-routes.ts:161-175).
5. Publish pipeline refuses anything but a version-matched tag on an ancestor of main, runs
   the full check suite and production dependency audit, and signs with SLSA provenance
   (.github/workflows/publish.yml:33-46).

## 10. Residual risks

1. The whole product is intentional network exposure. A weak token choice by the user, or a
   leaked invite QR, hands a stranger the DSH UI including settings and credential flows.
   Approval mode exists but defaults off (src/config.ts defaults; panel toggle).
2. `prepare: pnpm run build` executes at install time for git-URL and `link:` installs
   (package.json:33). Prefer the registry channel.
3. Listen host is user-settable at runtime to a LAN-wide bind; combined with `trustForwardedFor`
   probes this is correct engineering but widens exposure if misconfigured (src/index.ts:407-447).
4. The client bootstrap monkey-patches `__ModuleLoader__` on every page load including local
   ones (src/page-bootstrap.ts:1-13). The patch content is fixed and reviewed here, but any
   future edit to that string is effectively arbitrary client-side script injection and should
   force re-adjudication.
5. Published v0.3.7 tarball was not byte-compared against the audited commit.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any new `eval`/`vm.` in `src/`, any second
   spawn site, any new outbound fetch beyond the pinned cloudflared release URL forces
   re-adjudication.
2. Diff `CLOUDFLARED_ASSETS` hashes against upstream release notes when the pin moves.
3. Confirm publish workflow still enforces tag match + ancestor + audit + provenance.
4. Re-run our scanner after any heuristics-corpus bump; digest recorded in section 8.
5. Re-vet at 90 days or on the next tagged release, whichever comes first.
