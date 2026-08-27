# Trust Report Card: dsh-better-deepseek

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-better-deepseek` (HTTP/SSE bridge exposing DSH sessions to the Better DeepSeek Chrome extension) |
| Pinned subject | github:EdgeTypE/dsh-better-deepseek @ commit `b1043860f5f10fd7ed12664ebe32ca4fd6445aca` (default branch head at audit time, 2026-08-14) |
| npm | `dsh-better-deepseek@0.1.0`, integrity `sha512-gvvQz6olx3wuoyxNh4kN5oZWrSlGIpKO6DfalaLwepP1mCiNzN1h+NRhzsYj3B+IH9othUBruDxltm2goS8ULA==` (fetched 2026-08-26); repo version is also `0.1.0` |
| Provenance | Not checked (no attestation query performed) |
| License | `"license": "MIT"` in package.json, but there is no LICENSE file in the repository |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **D** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The code is small, readable, and does nothing sneaky - no credential access, no outbound network
calls, no dynamic execution - but it registers unauthenticated HTTP endpoints that create agent
sessions, submit prompts, and stream every assistant token and every tool call and result, and it
ships with `Access-Control-Allow-Origin: *` on by default, so any web page open in the user's
browser can drive their agent and read the output; that is a design-level exposure, not a bug, and
it is not disclosed as a risk anywhere in the README.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| HTTP endpoints registered | Prefix route `/api/better-deepseek` on the host's `webServer`: `ping`, `events` (SSE), `session.result` (GET), `session.create`, `session.prompt`, `session.cancel` (POST). | src/index.ts:33-40, 44-215 |
| Authentication on those endpoints | None. No token, no shared secret, no Origin allowlist, no Host check, no same-origin enforcement anywhere in the file. The only request-shaping code is the CORS helper. | src/index.ts:235-247 (read in full); grep for `authorization`/`token` in src returned nothing |
| CORS posture | `Access-Control-Allow-Origin: *` plus `GET, POST, OPTIONS` and `Content-Type`, enabled unless the user sets `enableCors: false`. The shipped `cordis.patch.yml` sets `enableCors: true` explicitly. | src/index.ts:236-240; lib/index.js:199; cordis.patch.yml:1-5 |
| Session creation | `session.create` builds a `session-<Date.now()>` id, resolves the default model and preset, and calls `ctx.agents.create` with `cwd` taken straight from the request body, defaulting to `process.cwd()`. The caller chooses the working directory. | src/index.ts:96-140 |
| Prompt submission | `session.prompt` forwards arbitrary caller text into `agent.followup` as a user message. | src/index.ts:157-176 |
| Data leaving through SSE | Every connected SSE client receives: assistant text deltas, full assistant messages, every tool call with its full arguments, every tool result payload, and turn completion with final text. Broadcast is unconditional and unfiltered by session or client. | src/index.ts:252-330, 336-341 |
| Network egress | None. There is no `fetch`, no socket, no child process in `src/` or `lib/`. Everything is inbound HTTP. | grep of src/ and lib/ |
| Credential access | None. No auth-file reads, no env enumeration. | grep of src/ and lib/ |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, `child_process`, dynamic `import()`. | grep of src/ and lib/ |
| Lifecycle hooks | None in `package.json` (no scripts block). Two helper scripts exist but are run manually: `scripts/install.ps1` and `scripts/setup-patch.js`. | package.json (whole file); scripts/ |
| Local file writes (helper scripts only) | `scripts/setup-patch.js` unconditionally overwrites `~/.dsh/cordis.patch.yml` with `[]`, strips better-deepseek entries from the web profile `package.json`, and rewrites `~/.dsh/profiles/web/cordis.patch.yml`. Destructive to a user's existing root patch layer if run. | scripts/setup-patch.js:6-9, 12-22, 24-36 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 12 findings (11 high, 1 low), machine grade F, gate `finding-density`. 16 files
scanned, 4 skipped.

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x2, `src/index.ts:3,40` | False positive. Line 3 is `import type { IncomingMessage, ServerResponse } from 'node:http'` (types only). Line 40 constructs `new URL(req.url, 'http://<host>')` to parse an *inbound* request path. Neither sends anything. | src/index.ts:3, 40 |
| NET high, `lib/index.js:20`, `lib/types/index.js:23` | Same inbound URL parse in the committed build output. | lib/index.js:20 |
| NET high x6, `tests/service.spec.{ts,js}:18-57` | Test-only. The specs `fetch()` the plugin's own routes on a local test server. Dev code, not shipped (`files` lists only `lib/index.js`, `lib/invariant.js`, `cordis.patch.yml`, `lib/types/**/*.d.ts`). | package.json `files`; tests/ |
| SUPPLY high + NET low, `package.json:10` | The `repository.url` git URL. Metadata, not a dependency source. All real dependencies are `workspace:^` ranges. Dismissed as a supply finding, but see BD-SUPPLY-1 below for the real issue those ranges cause. | package.json:8-11, 48-63 |

The scanner found nothing about the actual problem. Every finding above is noise; the D grade comes
entirely from reading `src/index.ts` end to end.

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| BD-AUTH-1 | high | src/index.ts:96-140, 157-176 | Unauthenticated session creation and prompt submission. Anything that can reach the DSH web server can start an agent in a caller-chosen `cwd` and feed it instructions. |
| BD-AUTH-2 | high | src/index.ts:236-240 | `Access-Control-Allow-Origin: *` by default turns BD-AUTH-1 into a browser-reachable surface: any page the user visits can `fetch` these endpoints cross-origin. `enableCors: false` removes the browser vector but not the local-process one. |
| BD-LEAK-1 | high | src/index.ts:252-330, 336-341 | The SSE stream broadcasts all assistant output, all tool arguments, and all tool results to every connected client with no per-session filtering and no authentication. Tool arguments and results routinely contain file contents and paths. |
| BD-SUPPLY-1 | medium | package.json:48-63 | Every dependency and peer dependency is `workspace:^`. Outside the DeepSeek Harness monorepo these specifiers do not resolve, so an npm install of the published package cannot install its declared deps. The published tarball is effectively monorepo-only. |
| BD-SCRIPT-1 | medium | scripts/setup-patch.js:6-9 | Overwrites the user's root `~/.dsh/cordis.patch.yml` with `[]` without reading it first or backing it up. Manual invocation only, but it is in the repo and it destroys user configuration. |
| BD-SCRIPT-2 | low | scripts/install.ps1:6 | Documents `irm https://raw.githubusercontent.com/... | iex` as an install path (currently commented out in README:20-23). Remote-script-piped-to-shell is the standard risk; the script itself was read and does what it says: npm version lookup, profile workspace edits, `dsh plugin add`. |
| BD-LICENSE-1 | low | repository root | `package.json` declares MIT but no LICENSE file is committed, so the grant is not actually in the distribution. |

### Negative claims and what was searched

Read in full: `src/index.ts` (347 lines), `src/invariant.ts`, `cordis.patch.yml`,
`scripts/setup-patch.js`, `scripts/install.ps1`, `README.md`; spot-compared `lib/index.js` (294
lines, committed build output) against `src/index.ts` for the CORS and routing paths. No `fetch` to
any external host, no `child_process`, no `eval`/`new Function`/`vm`, no credential or env reads, no
telemetry, no obfuscation, no install-time hooks, no writes outside the helper scripts named above.

## 5. What we could not check

- **Behavioral probe.** Nothing was installed, loaded, or served. The unauthenticated-access claim is read from the source; it was not demonstrated with a live request.
- **Whether the DSH `webServer` service applies its own authentication in front of plugin routes.** This is the single fact that most affects the grade. The DSH host was not inspected, and the plugin does nothing itself to authenticate. If the host gates all `/api/*` traffic behind a token, BD-AUTH-1 weakens considerably; BD-AUTH-2 would still matter, because the plugin sets a wildcard CORS header on its own responses.
- **Published artifact vs source.** No tarball download, no byte comparison, no provenance/attestation check.
- **`lib/` build output was not fully diffed against `src/`.** The committed `lib/` is checked in rather than generated at pack time; only the routing and CORS paths were compared.
- **The Chrome extension on the other end** (`EdgeTypE/better-deepseek`) was not audited. What it does with the streamed transcript is outside this artifact.
- **Test suite was not executed** (`workspace:^` deps do not resolve outside the monorepo).

## 6. Reviewer disagreement

Single-reviewer pass, one model. The scanner graded F on twelve findings, all of which are noise;
the manual grade is D for reasons the scanner never surfaced. Both positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/EdgeTypE/dsh-better-deepseek /tmp/bd-audit
cd /tmp/bd-audit && git rev-parse HEAD   # expect b1043860f5f10fd7ed12664ebe32ca4fd6445aca

node tools/scan/dist/index.js /tmp/bd-audit   # from a dsh-bridge checkout

sed -n '235,247p' src/index.ts            # the entire request-authorization logic
sed -n '96,140p'  src/index.ts            # session.create, cwd from request body
sed -n '336,341p' src/index.ts            # unfiltered broadcast to all SSE clients
grep -rn "authorization\|Bearer\|token\|Origin" src   # only the wildcard CORS header
grep -rn "fetch(\|child_process\|eval(" src lib       # none
sed -n '6,9p' scripts/setup-patch.js      # overwrites ~/.dsh/cordis.patch.yml with []
```

## 8. Methodology and pinned inputs

- Subject: commit `b1043860f5f10fd7ed12664ebe32ca4fd6445aca`, shallow clone at `reference/audits/dsh-better-deepseek`
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full read of src/index.ts, src/invariant.ts, both helper scripts, cordis.patch.yml, README; partial read of lib/index.js
- Cross-model review: NOT performed
- Grade derivation: start B (small, honest, no egress, no credentials, no dynamic exec). Minus two bands for three high findings that compose into one exposure: unauthenticated session control plus wildcard CORS plus unfiltered transcript broadcast, shipped enabled by default and not named as a risk in the documentation. Not F: nothing is hidden or misrepresented, and the exposure is loopback-scoped in the common case.

## 9. Strengths

1. Genuinely small and readable: one service class, one route handler, no abstraction layers.
2. Zero outbound network calls, zero credential access, zero dynamic code execution, zero install hooks.
3. Uses `ctx.effect` for every registration, so routes and listeners dispose cleanly.
4. Tool waterfalls correctly call `next()` (src/index.ts:295, 312), so the plugin observes without breaking the chain.
5. `enableCors` is at least configurable, and the endpoint table in the README is accurate.

## 10. Residual risks

1. Any local process, and with default CORS any web page, can create a session, choose its `cwd`, and prompt the agent.
2. The SSE stream is a full transcript feed with no client identity and no session scoping.
3. `cwd` is caller-controlled, so the agent's file access scope is chosen by whoever calls the endpoint.
4. `workspace:^` dependencies make the published package unusable outside the monorepo and unauditable as a dependency graph.
5. `setup-patch.js` destroys the user's root patch file if run.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD. If an auth check appears in `handleCors` or a per-client session filter appears in `broadcast`, re-grade: those two changes alone would move this to B.
2. Watch `cordis.patch.yml` and the `Config` schema: a change of the `enableCors` default to `false` is a material improvement and should be reflected here.
3. On any bump, re-read `setupEventListeners` for new event types added to the broadcast.
4. Re-check whether a LICENSE file has been added, and whether dependencies moved off `workspace:^`.
