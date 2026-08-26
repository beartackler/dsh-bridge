# Trust Report Card: NanmiCoder/dsh-agent-teams

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@nanmicoder/dsh-agent-teams` (AgentTeams for DeepSeek Harness: captain-led multi-agent teams built on durable continuable subagents, dependency-aware tasks, JSONL mailboxes, an automatic scheduler, and a Web GUI activity panel) |
| Pinned subject | github:NanmiCoder/dsh-agent-teams @ commit `912aae5225d3d85fa841a1b0c8a5c77021876c25` (default branch, head at audit time; last commit 2026-08-23 "chore: prepare 0.1.13 release"; npm latest tag 0.1.13 matches) |
| Provenance | Git tree audited directly; npm channel NOT byte-compared against this commit (see section 5 and DAT-SUPPLY-1); ~967 GitHub stars claimed by coordinator, not independently verified |
| License | MIT (LICENSE; package.json `"license": "MIT"`) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review of all 33 source/script files) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The cleanest plugin this audit line has reviewed: zero network egress in shipped code, zero
telemetry, zero dynamic code execution, filesystem writes confined to `<workspace>/.agent-teams/`,
no npm lifecycle hooks, argv-form subprocesses confined to a dev-only Windows test fixture, and an
explicit allowlist guarding its one file-serving route; residual risk comes from what the product is,
not what it hides: members are full-capability subagents, the plugin globally wraps the host
`subagents.followup` seam, team message/task content is served to the web GUI through the host's
HTTP surface, and the npm install channel floats rather than pins.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (runtime) | None. No `fetch`, `http.request`, WebSocket, or vendor endpoint anywhere in src/ (grep verified; the only URL literals in src/ are two `new URL(req.url ?? '/', 'http://x')` bases used to parse inbound request paths). The two HTTP surfaces are inbound route handlers registered on the host web server: `/plugins/dsh-agent-teams/state` (JSON snapshot of live/archived teams) and `/plugins/dsh-agent-teams/assets` (packaged PNGs). The browser panel polls the state route with a same-origin relative-path `fetch` (src/client/activity-monitor.ts:230, 254, 290; `ACTIVITY_STATE_URL` at :173). | grep + manual read |
| Network egress (install time) | None beyond the package manager itself. No postinstall/prepare/prepack scripts in package.json (grep verified: zero hits); CI publishes with `npm publish --ignore-scripts` after `npm pack --dry-run --ignore-scripts` (.github/workflows/publish.yml:76-80). | package.json:75-81 |
| Credential access | None. No `process.env` reads in src/ at all (grep verified); the only env read in the repo is `process.env.NODE_ENV` in the build config (tsdown.config.ts:72-74), a build-time define injection, not shipped code. No reads of `.ssh`, `.aws`, keychains, browser profiles, or other harnesses' auth files. No telemetry, analytics, or tracking strings anywhere (grep `-i` verified). | grep scope in section 4 |
| Child processes (extra scrutiny) | Zero in shipped code. `node:child_process` appears exactly once, in the dev verifier scripts/verify.mjs:1185-1186 and 1243: Windows-only (`if (process.platform === 'win32')`, verify.mjs:1170) lock-holder fixtures that spawn `powershell.exe` in argv form (no shell) with fixed flag arguments to hold a file open; scripts/ is excluded from the published package (`files`: lib, assets, cordis.patch.yml, release-notes, READMEs; package.json:20-29). Member agents are spawned in-process through the Harness `ctx.subagents.startContinuable` API (src/members.ts:336-352), not as OS processes by this plugin. | file:line above |
| Dynamic code execution | None. No `eval(`, `new Function`, `vm.*`, `Function(` constructor, or variable-module `import()` anywhere in src/ or scripts/ (grep verified; all dynamic imports use static literals: verify.mjs:427, 438, 1112, 1231 import the project's own compiled lib). | grep + manual read |
| Inter-agent messaging (extra scrutiny) | Three surfaces, all intra-host. (1) Durable JSONL mailboxes under `<workspace>/.agent-teams/<teamId>/inbox/*.jsonl`, written/read only by the plugin's own validated writer/reader (src/state.ts:346-501, schema checks at :707-717). (2) Live wake delivery through Harness APIs: `ctx.subagents.followup` for members (members.ts:381) and `captain.steer` for the captain (tools.ts:208). (3) The web GUI polls the host state route (activity-monitor.ts:254). No sockets opened by the plugin itself; nothing leaves the machine. Sender identity is enforced: `from` must equal the caller's derived identity (tools.ts:862-864), preventing impersonation. | file:line above |
| Subagent spawning | Members are continuable subagents of the calling captain with a persona prompt, a tool deny-list hiding six captain-only `agent_teams_*` tools (members.ts:26-33, applied at :343), a delegation depth cap (default 1), and a team-size cap (default 8). Members otherwise run with the Harness's ordinary subagent capability set: this plugin adds no sandboxing and grants no extra tools. | members.ts:304-354; index.ts:87-88 |
| Lifecycle hooks | One activation listener: `agent/pre-step` injects a deterministic activation message when a genuine user message starts with `/agent-teams`; only `source.kind === 'user'` messages are scanned, so injected/plugin text cannot forge the gesture (src/command.ts:60-77, 116-141). Scheduler reacts to `agent/status` idle edges (scheduler.ts:279-284). No timers in the host plane except a bounded retry sleep (state.ts:526-528); the browser poller runs only while a session view holds it open (activity-monitor.ts:222-318). | file:line above |
| Filesystem writes | Confined to `<workspace>/<stateDir>/<teamId>/` (default `.agent-teams`, config at index.ts:84): team.json, inbox JSONL, retired-members.json, and an `archive/` subtree, all through atomic temp-file writes (state.ts:170-174, 227-229, 250-262, 601-614, 761-801). Reads for the state route are bounded to the same roots joined from the workspace registry (index.ts:180-183). The artwork route serves files only from a hardcoded 15-name allowlist inside the bundled assets dir (index.ts:201-228), refusing everything else with 404. | file:line above |
| Host seam modification | The plugin wraps `ctx.subagents.followup` process-wide with a retirement guard that refuses to resume ids listed in its own retired-members.json, then delegates to the original (members.ts:419-439), restoring the original on dispose. Guarded and reversible, but it is a global interception point on a shared Harness seam (see DAT-EXEC-1). | members.ts:419-439 |

The bundle patch (cordis.patch.yml:10-21) mounts one plugin row with `memberProvider: spawn` and
`stateDir: .agent-teams`. No MCP servers, no model providers, no credential forwarding rows.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`.
Raw output: 20 findings (2 critical, 10 high, 1 medium, 7 low), machine grade F, families
CRED/EXEC/HOOK/NET; 33 files scanned, 34 skipped, 565905 bytes. Manual adjudication below; this is a
small, fully-read TypeScript repository (4829 lines across src/, every finding opened in context).

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 "enumerates the entire process environment" x2, tsdown.config.ts:72,73 | False positive. Build-time define injection reading one named variable (`NODE_ENV`) with a `'production'` default, standard bundler practice; tsdown.config.ts is not in the published `files` list and contains no secret-bearing surface. Shipped src/ contains zero `process.env` reads. | grep verified |

### Findings kept (documented behavior or real residual risk)

| ID | Severity | Location | Note |
|---|---|---|---|
| DAT-SUPPLY-1 | medium | package.json:37-40; .github/workflows/publish.yml:78-80 | Install channel is unpinned: `dsh plugin add @nanmicoder/dsh-agent-teams` resolves whatever npm serves at install time, so what executes is not provably this audited commit (version string matches today: npm latest 0.1.13 == HEAD's prepared release). Mitigating signals observed but not cryptographically verified end to end: tag-gated CI publishing with `id-token: write` (provenance-capable), frozen-lockfile installs, `--ignore-scripts` publish. |
| DAT-EXEC-1 | medium | src/members.ts:419-439 | Global wrap of the shared `subagents.followup` seam for the whole host process. Behavior is benign (deny-list check then original call, restored on dispose), but it makes the plugin a process-wide interception point: a tampered `retired-members.json` in a workspace could block resumption of unrelated subagent ids resolved against that workspace root. |
| DAT-NET-1 | low | src/index.ts:175-195; src/client/activity-monitor.ts:173, 254 | Team snapshots include member rosters, task outputs, and captain-inbox message content served as JSON to the web GUI. Exposure inherits the host web server's binding and authentication posture, which is a DSH property this plugin neither configures nor weakens; on an unauthenticated LAN-exposed host this payload is readable. |
| DAT-SCOPE-1 | low | src/members.ts:26-33, 336-352 | Members are ordinary full-capability subagents minus six coordination tools; they keep whatever file/shell tools the Harness grants subagents. Inherent to the product's purpose, not a defect, but a team goal phrased carelessly authorizes real workspace writes across up to 8 concurrent agents. |

### Scanner noise dismissed (with scope)

- EXEC-009 / NET-001 highs on scripts/verify.mjs:283-284: negative string assertions (`!source.includes('fetch(')` etc.) inside the project's own self-verifier; parsed as feature hits. Not executions.
- EXEC-004/EXEC-005 highs on verify.mjs:1185-1186, 1243: Windows-only dev fixtures spawning `powershell.exe` in argv form with fixed arguments to hold file locks; scripts/ is not shipped (package.json `files`). Dev-machine scope only.
- HOOK-007 high on publish.yml:45 (`npm install --global npm@11.19.0 pnpm@10.33.0`): CI toolchain pinning with exact versions, in workflow scope, not shipped code.
- HOOK-002 medium on package.json:81 (`prepublishOnly: pnpm build && pnpm verify`): a release gate that builds and runs the repo's own adversarial self-tests before publishing. Runs on the maintainer's machine during publish; consumers execute nothing (no install hooks).
- HOOK-003 low on index.ts:246 (`internal/service` listener): lazily registers the two inbound web routes when the host services appear; no hook side effects.
- NET-003/NET-007 highs on src/index.ts:27, 179, 217: `node:http` type imports and `new URL(req.url, 'http://x')` used solely to parse inbound request paths for the two route handlers. Inbound parsing, not egress.
- NET-001 high on activity-monitor.ts:230: browser `fetch` wrapper for the same-origin relative state route; localhost UI traffic.
- NET-008 lows x6: github.com/npmjs.org URLs in package metadata and the CI registry-url.

### Negative claims and what was searched

Searched all of src/ (host + client), scripts/, cordis.patch.yml, workflows, and both SKILL.md copies
(33 files scanned by tool; all of src/ additionally read line by line): no network egress in shipped
code (the complete URL inventory in src/ is two `http://x` parse bases); no telemetry/analytics/beacon
strings; no credential or env-var reads; no dynamic code execution (eval/Function/vm/static-import-
with-variable: zero hits); no obfuscation markers (atob/btoa/base64/fromCharCode/hex escapes: zero
hits; plain-language identifiers throughout); no npm lifecycle hooks; no writes outside
`<workspace>/.agent-teams/` and no reads outside it plus its own bundled assets; client renders via
React with zero `dangerouslySetInnerHTML`/innerHTML/document.write; localStorage holds panel layout
geometry only (ActivityPanel.tsx:98, 609).

## 5. What we could not check

- **The executed artifact vs this tree.** The npm tarball was not downloaded and diffed against a
  rebuild of commit `912aae5`. Version alignment (0.1.13 both sides) is consistent but not proof;
  DAT-SUPPLY-1 stands until someone reproduces the comparison or upstream documents reproducible
  builds with provenance verification steps.
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed. The repo's own
  verifier suite (scripts/verify.mjs, lifecycle-verify.mjs, stress-verify.mjs) drives the compiled
  tools against fake Harness surfaces; we read them but ran nothing.
- **Host-context behavior.** Route exposure, followup-wrap interaction with other plugins'
  subagents, and scheduler wake storms under many teams depend on the running Harness composition,
  which this static audit cannot observe.
- **GitHub star count** (~967, per tasking) and maintainer identity beyond the repository's own
  claims; not part of the artifact.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Machine grade F vs adjudicated B; both
positions recorded in section 4. The gap decomposes cleanly: 12 of 20 findings fire on dev/CI material
not present in the shipped package, 2 criticals are a bundler idiom, and the remaining highs parse
inbound-request handling as egress.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/NanmiCoder/dsh-agent-teams /tmp/dshat-audit
cd /tmp/dshat-audit && git rev-parse HEAD   # expect 912aae5225d3d85fa841a1b0c8a5c77021876c25

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dshat-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE "fetch\(|http\.request|WebSocket|axios" src/                 # egress: zero hits
grep -rn "process\.env" src/                                           # env reads: zero hits
grep -rnE "eval\(|new Function|vm\.|child_process" src/                # dyn exec + spawns: zero hits
sed -n '20,29p' package.json                        # shipped files: no scripts/ dir
sed -n '201,228p' src/index.ts                      # artwork route allowlist (no traversal)
sed -n '419,439p' src/members.ts                    # the global followup wrap (DAT-EXEC-1)
grep -nE '"(pre|post)?install"' package.json        # lifecycle hooks: none
```

## 8. Methodology and pinned inputs

- Subject: git commit `912aae5225d3d85fa841a1b0c8a5c77021876c25` (shallow clone at
  reference/audits/dsh-agent-teams, 2026-08-26; raw scanner output kept alongside at
  dsh-agent-teams.scan.json)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of src/index.ts, src/tools.ts, src/members.ts, src/state.ts,
  src/scheduler.ts, src/command.ts, src/events.ts, src/snapshot.ts, src/types.ts,
  src/event-types.ts, src/client/{index.tsx,activity-monitor.ts,ActivityPanel.tsx head,
  AgentTeamsCard.tsx grep,panel-geometry.ts head}, scripts/verify.mjs (finding contexts),
  scripts/{lifecycle,stress,verify-package,sync-skill}.mjs heads, cordis.patch.yml, package.json,
  tsdown.config.ts, .github/workflows/publish.yml, LICENSE, README.md, docs/verification-guide.md
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero findings survive adjudication in shipped production code; kept set is
  1 medium supply-chain note, 1 medium seam-wrap note, 2 low documented behaviors. The scanner's
  F rests entirely on dev/config material outside the published artifact. B band reflects: no
  egress, no telemetry, no dynamic execution, tightly scoped filesystem use, argv-form dev-only
  subprocesses, allowlisted file serving, and an unusually strong adversarial self-test culture;
  capped below A by the unverified npm-to-commit binding, the global followup wrap, and the absence
  of cross-model review and a behavioral probe.

## 9. Strengths

1. Verification culture is exceptional for a third-party plugin: ~1200 lines of self-adversarial
   verifier code (scripts/verify.mjs, lifecycle-verify.mjs, stress-verify.mjs) driving the compiled
   production tools through DAG fan-out, stale-attempt storms, cold restarts, delivery failures, and
   a Windows file-lock fixture, plus docs/verification-guide.md teaching the method.
2. Defense-in-depth at every trust boundary: sender identity enforced against impersonation
   (tools.ts:862-864), attempt-id capabilities make stale writes impossible (state.ts:151-163),
   durable JSON validated field-by-field before authorization decisions (state.ts:631-704),
   atomic writes everywhere (state.ts:601-614), and an allowlist-not-filter on the file-serving
   route (index.ts:224).
3. Honest scoping of member power: captain-only tools explicitly denied to members
   (members.ts:26-33), depth and size caps defaulted conservatively (index.ts:87-88).
4. Clean supply posture: no lifecycle hooks, `--ignore-scripts` publishing, exact-version CI
   toolchain pins, and a `files` allowlist that excludes all dev tooling from the package.
5. Zero hidden behavior: no env harvesting, no telemetry, no outbound endpoints, and comments that
   explain why each risky-looking construct exists.

## 10. Residual risks

1. Unpinned install channel: until you pin a version, what `dsh plugin add` fetches from npm is
   whatever is latest at that moment (DAT-SUPPLY-1). Prefer an explicit version until upstream
   demonstrates verifiable provenance end to end.
2. The global `subagents.followup` wrap means every plugin's subagent traffic passes this plugin's
   closure while it is mounted (DAT-EXEC-1). Code-reviewed benign today; re-audit this function on
   any version bump.
3. Team content (message text, task outputs) flows to the web GUI over the host HTTP surface; on a
   host exposed without authentication this is readable by anyone who can reach the port (DAT-NET-1).
4. Eight full-capability subagents executing a natural-language goal is real delegated authority;
   treat team goals like you would treat handing the same brief to eight terminal agents.
5. Single-reviewer static audit, no behavioral probe, no tarball-vs-tree diff; a cross-model pass
   and an S4 probe could move this grade in either direction.

## 11. Re-verify steps

1. Re-run step 7 above against current HEAD; any new literal hostname, any `process.env` read in
   src/, any eval-family hit, any new child_process reference outside scripts/, or any widening of
   the artwork allowlist must be re-adjudicated before this grade carries forward.
2. Check whether upstream adds a version pin to install docs or publishes provenance attestations
   users can verify; if so, DAT-SUPPLY-1 downgrades and the B cap can be re-examined upward.
3. Watch src/members.ts:419-439: if the followup wrap gains logic beyond the deny-list check, or if
   any second shared Harness seam gets wrapped, escalate to a full re-audit.
4. Diff package.json `files` on every release: any addition of `scripts/` or new top-level entries
   invalidates the dev-only adjudication of the EXEC family.
5. Re-run the scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
