# Trust Report Card: dsh-plugin-manager

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-plugin-manager` (GUI in the DSH settings panel: toggle/delete MCP entries, trash skills, list built-in plugin packages, hot-applied without restart) |
| Pinned subject | github:liqichen/dsh-plugin-manager @ commit `36a73f0174f0714243ba01afcc9a5ffaa36b0b04` (default-branch head at audit time) |
| npm integrity | Not applicable. No npm publication; the README installs from this repository. |
| Provenance | Not applicable (git-only distribution). |
| License | MIT (LICENSE file present; matches `gh api repos/liqichen/dsh-plugin-manager --jq .license.spdx_id`) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review; the entire plugin is 365 lines of shipped JavaScript, all of it read) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Small, readable, entirely local: it registers two same-origin routes on the DSH web server, reads
`~/.dsh/profiles/web/cordis.patch.yml` plus two directory listings, and performs three reversible
mutations (backup-then-edit for MCP rows, rename-to-trash for skills) with no network egress, no
credential reads, and no dynamic code execution - the grade is C because those state-changing
routes have no origin, CSRF, or authentication check of their own, and because the config editor
is a hand-rolled line-based YAML parser rather than a real one.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The only `fetch` calls are same-origin requests from the plugin's own settings-panel UI to its own routes (`/plugin-manager/api/*`). No external host appears anywhere in the repository. | client.js:99, 106; grep for `http` across index.js and client.js returns only the `new URL(req.url, "http://localhost")` parse base at index.js:153 |
| HTTP routes registered | `GET /plugin-manager/api/state` (returns MCP rows, skills, plugin packages, and the two absolute paths) and `POST /plugin-manager/api/action` (performs one of three mutations). Registered as a prefix handler on the host's `webServer` service. | index.js:150-177 |
| Route authorization | **None in this plugin.** `handleApi` performs no `Origin`, `Host`, `Referer`, token, or session check; it dispatches on method and pathname only. Whatever authentication the host DSH web server applies to its own surface is the only gate. | index.js:150-172, read in full |
| Config file writes | Toggling writes or removes a single `disabled: true` line; deleting removes the entry's line range. Every write is preceded by a copy to `cordis.patch.yml.bak-<YYYYMMDDHHMMSS>`. | index.js:69-72 (`backup`), 74-86 (`toggleMcp`), 88-97 (`deleteMcp`) |
| Skill deletion | Never unlinks. Renames `~/.dsh/skills/<name>` to `~/.dsh/skills/.trash-<timestamp>-<name>`, so the content is recoverable by hand. The name is validated against `^[\w.\-]+$` before any path is built, which blocks `/` and `..` traversal. | index.js:120-129 |
| Filesystem reads | `~/.dsh/profiles/web/cordis.patch.yml`, `~/.dsh/skills/*/SKILL.md` (first 4000 bytes, for the `description:` line), and `~/.dsh/profiles/node_modules/@deepseek-ai/*/package.json` (name, version, description). | index.js:100-118, 131-143 |
| What leaves the machine | Nothing. The state payload stays on the loopback response to the plugin's own UI. It does include MCP `command` and `url` values (URLs truncated at 90 characters, index.js:56) but not `env` or `headers`. | index.js:52-58, 145-149 |
| Dynamic code execution | None. No `eval`, `new Function`, `vm`, `child_process`, or dynamic `import` anywhere in the repository. | grep across index.js, client.js, legacy/server.py |
| Lifecycle hooks | None. `package.json` declares no `scripts` block. | package.json, read in full |
| Legacy Python server | `legacy/server.py` (302 lines) is a superseded standalone version of the same GUI. It binds `127.0.0.1` explicitly, defaults to port 17891, and is only run when a user invokes it manually. It is not wired into the plugin and ships no `subprocess`, `os.system`, or `eval` call. | legacy/server.py:298-302; grep confirms no process-spawning primitives |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 5 findings (4 high, 1 medium), machine grade D, 4 files scanned. All five are in
production files and are adjudicated below; there are no test files to dismiss.

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x2, client.js:99,106 "fetch(): can send data to a remote endpoint" | **Downgraded to informational.** Both use `const API = "/plugin-manager"` (client.js:13), a root-relative path. These are same-origin requests to this plugin's own routes; no remote host is reachable through them. | client.js:13, 99, 106 |
| HOOK medium, client.js:111 "top-level timer, delayed beacons hide behind these" | **False positive.** It is a `setTimeout` inside a React click handler that clears a toast message after 3.5 seconds. Not top-level, not a beacon. | client.js:106-114, read in context |
| CRED high x2, index.js:22,24 "references DSH's own profile/credential storage" | **Kept, reclassified as configuration access rather than credential theft.** `PATCH_FILE` and `PLUGINS_DIR` are exactly what a config manager must read. The values read out of them are entry ids, transports, commands, truncated URLs, package names and versions - not secrets. The scanner's `cred-plus-net` gate that produced grade D is unreachable here because the NET side is same-origin. | index.js:22-24, 52-58 |

### Findings this card adds beyond the scanner

| ID | Severity | Location | Note |
|---|---|---|---|
| PM-AUTH-1 | **high** | index.js:150-172 | The mutating route `POST /plugin-manager/api/action` has no origin, CSRF-token, or authentication check. `readBody` parses the body as JSON regardless of `Content-Type` (index.js:139-147), so a cross-origin `text/plain` form post - which browsers send without a CORS preflight - would be dispatched. Any web page open in the same browser as the DSH web UI could therefore disable or delete the user's MCP servers and trash their skills, provided it can guess the port. Effects are reversible (backups, `.trash-*`) and no data is read back cross-origin, which is why this is high rather than critical. |
| PM-PARSE-1 | medium | index.js:26-67 | `cordis.patch.yml` is parsed and edited with line regexes rather than a YAML parser. Entries are recognized only at exactly four leading spaces (`^    - id: `), and a delete removes a computed line range. Unusual but valid YAML - different indentation, flow style, multi-document files, anchors - can be misidentified, and a mis-computed range removes the wrong lines. The timestamped backup is the only recovery path, and its filename has one-second granularity (index.js:70), so two writes in the same second collide. |
| PM-DISCLOSE-1 | low | index.js:145-149 | The state response includes each MCP row's `command` and a 90-character prefix of its `url`. Credentials embedded in an MCP URL query string would appear in that prefix. No redaction layer exists. Same-origin only, but it also reaches the browser DOM. |
| PM-DOC-1 | low | README.md | Documentation is Chinese-only and contains no security or threat-model section; the "no CORS exposure" claim in the feature table (README feature row `零额外进程`) describes the absence of a separate port, not the absence of the CSRF gap in PM-AUTH-1. |

### Negative claims and what was searched

Read in full: `index.js` (177 lines), `client.js` (188 lines), `cordis.patch.yml` (6 lines),
`package.json`, and the entry points and helpers of `legacy/server.py` (302 lines). No `eval`,
`new Function`, or `vm`; no `child_process`, `subprocess`, or `os.system`; no external URL of any
kind; no telemetry; no reads of `~/.ssh`, `~/.aws`, `~/.claude`, browser stores, or OS keychains;
no npm lifecycle scripts; no obfuscation; no writes outside `~/.dsh/profiles/web/cordis.patch.yml`,
its own `.bak-*` siblings, and renames inside `~/.dsh/skills`.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, route call, or write cycle was run. The CSRF reasoning in PM-AUTH-1 is derived from reading `readBody` and `handleApi`, not from an executed cross-origin request.
- **What the host provides.** `ctx.webServer.register` is DSH's own service. Whether the host binds loopback-only, applies an auth middleware, or enforces same-origin ahead of prefix handlers is upstream behavior this repo-scoped audit cannot establish. If DSH already gates its web surface, PM-AUTH-1 is materially softened; if it does not, PM-AUTH-1 stands as written.
- **The screenshots referenced by the README** (`docs/screenshots/*.png`) were not opened or compared against the shipped UI.
- **`legacy/server.py` end to end.** Its entry point, binding, and the absence of process-spawning primitives were verified by grep and by reading lines 1-80 and 290-302; the intermediate handler body was not read line by line. It is not part of the plugin's runtime path.
- **Real-world YAML robustness.** PM-PARSE-1 is a reading of the parser's assumptions, not the result of fuzzing it against real `cordis.patch.yml` variants.
- **The plugin's own `node_modules`/build.** There is none - the client half is a hand-written `__ModuleLoader__` bundle with no build step, which is unusual and, for auditability, an advantage.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded D on a
`cred-plus-net` gate that this card finds unreachable, while this card adds a high finding
(PM-AUTH-1) the scanner did not raise. Both positions are recorded in section 4.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/liqichen/dsh-plugin-manager /tmp/dsh-plugin-manager-audit
cd /tmp/dsh-plugin-manager-audit && git rev-parse HEAD   # expect 36a73f0174f0714243ba01afcc9a5ffaa36b0b04

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dsh-plugin-manager-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "eval(\|new Function\|child_process\|vm\." index.js client.js   # none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" index.js client.js                # only the URL parse base
grep -n "origin\|Origin\|Referer\|token\|auth" index.js                  # no route authorization
sed -n '139,172p' index.js    # readBody ignores Content-Type; handleApi dispatches on path only
sed -n '120,129p' index.js    # skill delete: name validated, renamed to .trash-*, never unlinked
sed -n '298,302p' legacy/server.py   # legacy server binds 127.0.0.1
```

## 8. Methodology and pinned inputs

- Subject: git commit `36a73f0174f0714243ba01afcc9a5ffaa36b0b04` (shallow clone at `reference/audits/dsh-plugin-manager`)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: complete read of index.js and client.js (the entire shipped surface), cordis.patch.yml, package.json, README feature table and install section; targeted read plus grep sweep of legacy/server.py
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no egress, no credential exfiltration, no dynamic execution, no install hooks, and every mutation reversible would sit in the B band. One high finding (PM-AUTH-1: unauthenticated state-changing route) plus a hand-rolled parser editing the user's live configuration (PM-PARSE-1) pull it to C. It is not D because nothing leaves the machine and every destructive action has a recovery path built in.

## 9. Strengths

1. Genuinely reversible destructive actions: config writes are always preceded by a timestamped backup (index.js:69-72), and skill deletion is a rename into `.trash-*`, never an unlink (index.js:120-129).
2. Path-traversal defense before path construction on the one user-supplied name that becomes a path: `^[\w.\-]+$` (index.js:121).
3. No network surface at all. For a plugin whose whole job is managing config, having zero external destinations is the right design and it holds under grep.
4. No build step and no dependencies: the client half is a hand-written module-loader bundle, so what a reviewer reads is exactly what runs (client.js:6-11).
5. Read paths are bounded rather than slurped: `SKILL.md` is read to 4000 bytes, descriptions truncated to 160, URLs to 90, package descriptions to 110 (index.js:107, 115, 56, 138).
6. Errors are returned as JSON messages rather than stack traces, and the handler wraps everything in a try/catch (index.js:169-171).

## 10. Residual risks

1. PM-AUTH-1: with no origin check on the action route, the plugin's safety depends entirely on the host DSH web server's own gating, which is outside this artifact.
2. A mis-parse of an unusually formatted `cordis.patch.yml` can delete the wrong lines; recovery depends on the backup, whose one-second-granularity filename can collide on rapid successive writes (index.js:70).
3. MCP `command` strings and URL prefixes are rendered into the settings-panel DOM without redaction, so a credential embedded in an MCP URL is displayed (index.js:56).
4. Trashed skills accumulate under `~/.dsh/skills/.trash-*` indefinitely; nothing prunes them.
5. `legacy/server.py` remains in the tree. It is loopback-bound and unauthenticated by design; a user who runs it manually exposes the same three mutations to anything that can reach port 17891 on their machine.
6. Chinese-only documentation with no security section means an English-speaking installer has no written statement of what the plugin touches.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. The first thing to check on any bump is whether `handleApi` (index.js:150) has gained an origin or token check - that single change would move this card to B.
2. Re-check the skill-name regex (index.js:121) and the `readBody` JSON parse (index.js:139-147) on every diff.
3. If the YAML editing path is ever replaced with a real parser, re-adjudicate PM-PARSE-1 downward.
4. Any newly introduced `fetch` with a non-relative target, or any `child_process` import, is an immediate re-grade trigger.
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
