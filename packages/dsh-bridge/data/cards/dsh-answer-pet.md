# Trust Report Card: dsh-answer-pet

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-answer-pet` (DSH web plugin: floating pet that shows answer progress, model trace and tool calls) |
| Pinned subject | github:Nanki-nn/dsh-answer-pet @ commit `a0827d41c3f8f9177622c460a99f1aeeb8034b8d` (version 0.6.0) |
| npm integrity | Not published to npm at audit time; install path is the git repository. |
| Provenance | None (no release workflow, no attestation). |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of `.dsh-plugin/`) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A cosmetic progress widget that reads live session events and serves three read-only same-origin
routes: no network egress, no credential access, no child processes in the shipped plugin, and no
dynamic code execution, but it does surface session titles and tool-argument fragments over an
unauthenticated local HTTP endpoint, which is the only reason it is not an A.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The client fetches three relative same-origin paths, `'/answer-pet/state'`, `'/answer-pet/config'`, `'/answer-pet/events'` (client/index.mjs:17-19), all served by this plugin's own routes (src/routes.mjs:3-6). No absolute URL exists in shipped code. | client/index.mjs:17-19 |
| HTTP surface | Three exact GET routes registered on the host web server (index.mjs:143-224). All are read-only: non-GET returns 405 (index.mjs:150, 178, 195). No POST, no write path anywhere. | index.mjs:143-224 |
| Persistent connection | `/answer-pet/events` is a server-sent-event stream (index.mjs:193-223) with a 25 s `: ping` heartbeat (index.mjs:218-220). The payload is the fixed literal `data: {"type":"event"}` (index.mjs:73) which carries no data; it is a nudge to re-poll `/state`. Clients are removed on `close` and the interval cleared (index.mjs:213-216). | index.mjs:73, 193-223 |
| Session data access | Subscribes to `session/event` (index.mjs:86) and keeps per-session `{ title, running }` plus a 6-item trace ring. `/state` returns session id, title, phase, percentage and trace labels for every running session (index.mjs:154-176). Tool arguments are deliberately reduced: only `description`, `query`, `pattern`, `file_path`, `path`, `url` are read, trimmed to 88 chars, and full `command` or raw JSON is never emitted (src/trace.mjs:2-30). | src/trace.mjs:4-5, 20-30 |
| Filesystem | None. No `node:fs` import anywhere in `.dsh-plugin/`. State is in-memory `Map`s only. | grep of .dsh-plugin/ |
| Credential reads | None. No auth files, no env reads, no keychain. | grep of .dsh-plugin/ |
| Child processes | None in the shipped plugin. `execFileSync` exists only in `scripts/build-market-screenshots.mjs`, a maintainer tool that is not in `package.json` `files` and never loads at runtime. | package.json `files`, scripts/build-market-screenshots.mjs:3 |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`. | grep of .dsh-plugin/ |
| Telemetry | None. | grep of .dsh-plugin/ |
| Lifecycle hooks | None. `scripts` contains only `build:client`, `check:client`, `test`; no install-time hook. | package.json |
| Dependencies | One: `schemastery ^3.18.0`, a DSH-ecosystem schema library, used only to declare the settings schema (src/config.mjs:8, 27-37). | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 13 findings (10 high), machine grade F on the `dynamic-exec-present` and
`finding-density` gates. Every finding was adjudicated below; both gates are false positives.

### Scanner gates adjudicated

| Gate | Adjudication |
|---|---|
| `dynamic-exec-present` ("shipped code performs dynamic code execution") | False positive. The only EXEC hit is `import { execFileSync } from 'node:child_process'` at scripts/build-market-screenshots.mjs:3, a screenshot-generation tool. `package.json` `files` ships `.dsh-plugin`, `assets`, `docs`, `cordis.patch.yml`, `README.md`, `LICENSE`; `scripts/` is not shipped, and no runtime module imports it. There is no `eval`, `new Function`, or `vm` anywhere. |
| `finding-density` ("same family in 3+ files") | Misleading. The NET hits are the same three relative paths counted twice, because `.dsh-plugin/client.js` is a generated single-file bundle of `.dsh-plugin/client/index.mjs` plus its theme modules. `node scripts/build-client.mjs --check` confirms the bundle is in sync with the sources, so the duplicate hits are one code path, not two. |

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| AP-NET-1 | none (dismissed) | client/index.mjs:203, 427; client.js:482, 706 | `fetch(CONFIG_URL)` / `fetch(STATE_URL)` where both constants are relative literals defined at client/index.mjs:17-19. Same-origin, GET-only, no body. |
| AP-NET-2 | low (kept) | client/index.mjs:460; client.js:739 | `new EventSource(EVENTS_URL)` opens a long-lived stream. The scanner's C2 concern does not apply: the URL is the plugin's own relative route and the server writes only a fixed 24-byte literal, never attacker-influenced content. Kept at low because a persistent connection plus a 25 s heartbeat is real resource surface. |
| AP-AUTH-1 | medium | index.mjs:143-224 | No origin, referer, or loopback check on any route. `/answer-pet/state` returns session ids, session titles, current phase and trace labels including truncated `file_path`/`query`/`url` values. Cross-origin reads of the JSON are blocked by the browser's same-origin policy, and there is no write path to abuse via CSRF, so this is an information-exposure surface rather than a control surface, but a same-origin check would close it cheaply (compare dsh-global-rules lib/index.js:24-32). |
| AP-SUPPLY-1 | low | package.json:13 | `repository.url` is metadata, not a dependency. The real residual is that installing by git ref tracks a moving HEAD. |
| AP-NET-3 | none (dismissed) | tests/pet-theme.test.mjs:57, 61 | The flagged URLs are inside negative-test fixtures asserting that a theme containing an external `href` or an `@import` is rejected. Test-only, and the assertion is a defense. |
| AP-EXEC-1 | none (dismissed) | scripts/build-market-screenshots.mjs:3 | Maintainer tooling, not shipped. See gate table. |

### Client-side XSS surface, reviewed specifically

The client sets `innerHTML` in three places (client/index.mjs:158, 188, 318). Two are static
template literals with no interpolation of runtime data. The third, `petSlot.innerHTML =
activeTheme.markup` (client/index.mjs:188), injects theme SVG, and theme markup passes
`validatePetTheme` first (client/themes/runtime.mjs:15-48), which rejects `<script>`,
`<foreignObject>`, `<iframe>`, any `on*=` attribute, `javascript:`, and any `http(s)://` in markup
(runtime.mjs:34), rejects `@import` and `url()` in CSS (runtime.mjs:37), and only permits a raster
`<image>` when it is an inline `data:image/png;base64` and the theme explicitly declares
`trustedRaster: true` (runtime.mjs:26-32). Only three built-in themes are registered and
`config.theme` is constrained to that list by both the schema (src/config.mjs:28) and
`validateConfig` (src/config.mjs:44-46). Server-supplied strings, which are the ones an attacker
could influence, all go through `textContent`, not `innerHTML`: session title at
client/index.mjs:362, trace label at 340, detail at 344, status at 364, bubble at 394. That is the
correct split.

### Negative claims and what was searched

All of `.dsh-plugin/` (index.mjs 230, client/index.mjs 480, client.js 762 generated, src/*.mjs
484 total, themes), `package.json`, `cordis.patch.yml`, `scripts/`, `tests/`, `README.md`,
`docs/PET_THEME.md` were read or grepped. No `eval`/`new Function`/`vm`, no `node:fs`, no
`child_process` in shipped code, no base64-decoded code, no obfuscation (the generated bundle is
unminified and verified in sync), no telemetry, no absolute URL in shipped code, no credential or
env reads, no install hooks.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/idle-soak run. In particular the SSE client
  set, the 25 s heartbeat, and the unbounded-growth question below were read, not measured.
- **Host web server exposure.** Whether the DSH web server binds loopback-only, and whether it
  adds origin checks in front of plugin routes, is outside this repository. If it does, AP-AUTH-1
  drops to low.
- **Published artifact.** Not on npm; no tarball integrity and no provenance attestation.
- **Tests were read, not executed** (`node --test tests/*.test.mjs` was not run here). The client
  bundle freshness check `node scripts/build-client.mjs --check` **was** run and passed.
- **Real session-event shapes.** The event names (`turn/start`, `tool/call`, `assistant/chunk`
  and so on) and the `session.events` seed array are consumed from the DSH host contract; we did
  not verify against a live harness that the fields carry what the code assumes, so the claim
  "only whitelisted tool-argument keys are exposed" is a claim about this code, not about every
  possible payload the host may deliver.
- **Memory growth.** `sessions`, `metas` and `traces` are never pruned (index.mjs:46-48); the
  2-minute idle window only affects which session is reported as current. Long-lived hosts with
  many sessions will accumulate entries. We did not measure the rate.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on two gates; both were traced to a non-shipped
maintainer script and to double-counting a generated bundle against its own sources, and both are
recorded above rather than dropped.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/Nanki-nn/dsh-answer-pet /tmp/ap-audit
cd /tmp/ap-audit && git rev-parse HEAD   # expect a0827d41c3f8f9177622c460a99f1aeeb8034b8d

grep -rn "eval(\|new Function\|vm\.\|node:fs\|child_process" .dsh-plugin   # expect no output
grep -rhoE "https?://[a-zA-Z0-9./_-]+" .dsh-plugin                         # expect no output
grep -n "origin\|remoteAddress\|referer" .dsh-plugin/index.mjs             # expect no request-auth hits
sed -n '17,19p' .dsh-plugin/client/index.mjs                               # relative route constants
sed -n '4,5p;20,30p' .dsh-plugin/src/trace.mjs                             # tool-arg key whitelist
sed -n '26,37p' .dsh-plugin/client/themes/runtime.mjs                      # theme markup/css guards
node scripts/build-client.mjs --check                                      # bundle matches sources
```

## 8. Methodology and pinned inputs

- Subject: commit `a0827d41c3f8f9177622c460a99f1aeeb8034b8d`, shallow clone at
  `reference/audits/dsh-answer-pet`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`.
- Review: full read of `.dsh-plugin/index.mjs` (230), `.dsh-plugin/client/index.mjs` (480),
  `.dsh-plugin/src/{config,routes,session-meta,trace}.mjs`, `.dsh-plugin/client/themes/runtime.mjs`,
  `package.json`, `cordis.patch.yml`; grep coverage of `client.js` (generated),
  `src/progress.mjs`, `tests/`, `scripts/`.
- Executed: `node scripts/build-client.mjs --check` (passed, bundle in sync with sources).
- Cross-model review: NOT performed (single reviewer).
- Grade derivation: no egress, no credentials, no exec, no filesystem, no obfuscation, no hooks.
  One medium (AP-AUTH-1, unauthenticated read route exposing session titles and trace fragments)
  and one low (AP-NET-2, persistent SSE connection) hold it at B. Adding a same-origin check to
  the three handlers would lift it to A.

## 9. Strengths

1. Deliberate data minimization in the trace: an explicit six-key whitelist, an 88-character
   truncation, and a stated refusal to emit full `command` strings or raw argument JSON
   (src/trace.mjs:2, 20-30). That is a privacy decision made on purpose, not by accident.
2. Correct `innerHTML` versus `textContent` split: every server-supplied string goes through
   `textContent`; the only `innerHTML` that takes runtime data is theme markup, which is validated
   first.
3. Theme validation is a genuine allowlist, not a denylist wave: no scripts, no event handlers,
   no external resources, no `@import`, no `url()`, CSS scoped to the theme id, and inline raster
   only behind an explicit `trustedRaster` flag with a `data:image/png;base64` format check.
4. Read-only by construction: three GET routes, 405 on anything else, no write path at all.
5. SSE discipline: only phase edges broadcast, token-level updates go through client polling, so
   a chunk storm cannot flood the event stream (index.mjs:81-84, 135). Clients are removed and the
   heartbeat cleared on `close`.
6. Degrades instead of throwing when the host lacks `settings` or `webServer` (index.mjs:30-43,
   145).
7. The generated client bundle has a `--check` mode that fails if it drifts from its sources, so
   the shipped artifact is verifiably the reviewed code.

## 10. Residual risks

1. `/answer-pet/state` is unauthenticated and returns session titles plus truncated file paths and
   queries. Anything that can reach the port can read what you are working on.
2. The SSE endpoint holds a connection open per client with a 25 s heartbeat; there is no client
   count cap.
3. Per-session `Map` entries are never pruned, so long-running hosts accumulate memory.
4. Installing by git ref tracks a moving HEAD; no npm artifact, no provenance, single maintainer,
   11 stars at audit time. The maintainer's email address is in `package.json`.
5. All comments and UI copy are Chinese-only.
6. The plugin renders into the DSH web UI on every page; a future theme-plugin extension point
   that accepts third-party themes would move the `validatePetTheme` allowlist onto the critical
   path. Today only three built-in themes exist.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL, any `node:fs` or
   `child_process` import inside `.dsh-plugin/`, or any non-GET route is a new finding.
2. Re-run `node scripts/build-client.mjs --check`. If it fails, the shipped bundle no longer
   matches the reviewed sources and this card does not describe what you would install.
3. Check whether request authentication was added: grep `.dsh-plugin/index.mjs` for `origin`,
   `remoteAddress`, or `sec-fetch-site`. A same-origin or loopback guard clears AP-AUTH-1 and the
   grade should be revised to A.
4. Re-check `DETAIL_KEYS` in `src/trace.mjs`. Any added key widens what leaves the session into
   the panel and must be re-adjudicated.
5. Re-check `validatePetTheme` if a third-party theme registration path appears; that would make
   the allowlist load-bearing against untrusted input.
