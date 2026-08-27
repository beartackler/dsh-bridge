# Trust Report Card: godot-bridge

## 1. Header

| Field | Value |
|---|---|
| Plugin | `godot-bridge` (DSH plugin that launches a Godot 4.x project and drives it over an in-game TCP server) |
| Pinned subject | github:Smalldy/godot-bridge @ commit `e586db3fdd29bfa367caa9b46ac6daee2d9ac287` (default branch head at audit time, 2026-08-19) |
| npm | `godot-bridge@0.0.4-alpha`, integrity `sha512-I9WIsEhXxTNvcl70hlFF4I3lJUVTML8/ZyD85T76QY1kNbkrYXkgNEyYEqDStwu8vZN30ECThKjaAI7cUp+yhQ==` (fetched 2026-08-26). The repo is at `0.1.5`; npm is four minor versions behind, so the published artifact is NOT the audited tree. |
| Provenance | Not checked (no attestation query performed) |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The plugin does exactly what it advertises - it spawns Godot, writes an autoload script into your
project, and relays JSON commands to a loopback TCP port - but the whole design hands the agent
arbitrary GDScript execution inside your game process, the plugin edits `project.godot` on disk
without a preview or a confirmation step, and it phones `raw.githubusercontent.com` at load time
for an update check that then injects an imperative instruction into every system prompt; all of
that is disclosed in the README, none of it is opt-in, hence C rather than B.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Exactly one destination: `https://raw.githubusercontent.com/<repository>/main/package.json`, fetched at plugin load through a one-shot `node -e` child, 5s abort, failures swallowed. The owner/repo is parsed out of the bundle's own `package.json` `repository` field, so a fork points the check at the fork. | plugin/godot-bridge.mjs:209, 124-135, 206-250 |
| Prompt injection by the plugin itself | When a newer version is found, the plugin registers a system-prompt section reading "IMPORTANT - you must inform the user: godot-bridge has an update available ..." into every session until updated. This is the plugin steering the model, not a passive notice. | plugin/godot-bridge.mjs:258-283 |
| Child processes | `node -e <inline script>` for the update fetch (:213-218), for the TCP bridge (:296-311, spawned per command), and for `fs.mkdirSync` (:447-452); plus the resolved `godot` binary launched through DSH's unconfined subprocess service. Node and Godot paths come from `subprocess.resolveExecutable` or a user setting. | plugin/godot-bridge.mjs:142-186, 313-320 |
| Arbitrary code execution in the game | `godot_command` exposes the `eval` command, which compiles the caller's string into a fresh `GDScript` and runs it inside the running game with `PROCESS_MODE_ALWAYS`. This is full scripting authority inside the game process (filesystem, network, OS calls available to GDScript). | plugin/mcp_interaction_server.gd:119-120, 554-586; plugin/godot-bridge.mjs:933 |
| Filesystem writes | Copies the vendored `mcp_interaction_server.gd` into `<project>/autoload/` and rewrites `project.godot` to register the autoload, automatically, whenever a tool needs a live game. No diff shown, no confirmation prompt. | plugin/godot-bridge.mjs:484-509, 604-606, 870-872 |
| Listening socket | The injected autoload opens a TCP server bound to `127.0.0.1:9090` inside the user's game. Loopback-only, no authentication. Any local process or any browser page able to reach that port speaks the same command protocol. | plugin/mcp_interaction_server.gd:22-27 |
| Credential access | None. No auth-file reads, no env enumeration, no keychain access anywhere in `plugin/`. | grep across plugin/ returned zero CRED findings |
| Telemetry | None beyond the version check above; nothing about the user or project is sent. The request is a plain GET with no query parameters or body. | plugin/godot-bridge.mjs:213-218 |
| Lifecycle hooks | None. `package.json` has no scripts block at all. | package.json (whole file, 34 lines) |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 7 findings (4 high, 1 medium, 2 low), machine grade D, gate `dynamic-exec-present`.
3 files scanned, 17 skipped.

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC high, plugin/godot-bridge.mjs:933 "Direct call to eval()" | Misattributed but the underlying risk is real. Line 933 is the `godot_command` tool *description string* listing `eval` among the game commands; it is not a JS `eval` call. There is no JS `eval`, `new Function`, or `vm.*` in the bundle (grep confirmed). However the described command does execute attacker-controllable GDScript inside the game, so the capability the rule flags exists one hop away. Kept as GODOT-EXEC-1. | plugin/godot-bridge.mjs:933; plugin/mcp_interaction_server.gd:554-586 |
| NET high, :218 and :297-302 | Real but adjudicated separately: :218 is the update fetch (kept, GODOT-NET-1); :297-302 are the inline TCP bridge script strings connecting to `127.0.0.1:9090` (loopback, not egress). | file:line |
| NET low, :209 / package.json:30 | The literal `raw.githubusercontent.com` URL and the repository URL. Same fact as GODOT-NET-1. | file:line |
| OBFU medium, :296 | `String.fromCharCode(10)` inside the inline bridge script. Deliberate escaping avoidance so the script survives argv quoting, with a comment saying so. Not obfuscation. Dismissed. | plugin/godot-bridge.mjs:294-296 |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| GODOT-EXEC-1 | high | plugin/mcp_interaction_server.gd:554-586 | `eval` command compiles and runs caller-supplied GDScript in the live game with `PROCESS_MODE_ALWAYS`. By design (that is the product), but it means a prompt-injected agent gets code execution in the game process. |
| GODOT-NET-1 | medium | plugin/godot-bridge.mjs:206-250 | Unconditional load-time network call to GitHub. No opt-out setting exists; the only way to silence it is to be offline or to edit the bundle. Documented in README:79-83. |
| GODOT-PROMPT-1 | medium | plugin/godot-bridge.mjs:258-283 | The plugin writes an "IMPORTANT - you must inform the user" directive into the global system prompt. A plugin that can add imperative text to every session is a channel worth knowing about, even when the current text is benign. |
| GODOT-FS-1 | medium | plugin/godot-bridge.mjs:484-509 | Silent modification of `project.godot` and creation of `autoload/mcp_interaction_server.gd` in the user's repository. Recoverable via version control, but it happens without a prompt. |
| GODOT-NET-2 | low | plugin/mcp_interaction_server.gd:22-27 | Unauthenticated loopback TCP listener on a fixed port inside the shipped game build. If a developer ships a build with the autoload still registered, port 9090 is a remote-control surface on the player's machine. |
| GODOT-SUPPLY-1 | low | package.json vs npm | Published npm version `0.0.4-alpha` lags the repo's `0.1.5`. Anyone installing from npm gets code this card did not read. |

### Negative claims and what was searched

Read in full: `plugin/godot-bridge.mjs` (1507 lines), `package.json`, `cordis.patch.yml`, README
sections on updates. Grepped `plugin/mcp_interaction_server.gd` (4861 lines) and
`plugin/godot_operations.gd` (1887 lines) for listeners, `.new()` instantiation, eval paths, and
external hosts; read the `_cmd_eval` implementation and the server bind in full. No credential
paths, no `~/.ssh`, no env enumeration, no telemetry endpoint, no lifecycle scripts, no
minification, no base64 blobs.

## 5. What we could not check

- **Behavioral probe.** Nothing was loaded, launched, or executed. No Godot was installed here; the TCP protocol, the autoload installation, and the update check were read, not run.
- **Published artifact vs source.** The npm tarball (`0.0.4-alpha`) is a different, older version than the audited commit; no byte comparison and no provenance/attestation check was performed for either.
- **The two large GDScript files were not read line by line.** `mcp_interaction_server.gd` (4861 lines) and `godot_operations.gd` (1887 lines) were read selectively around the server bind, the command dispatch table, and `_cmd_eval`. Individual command handlers (file operations, scene mutation, serialization) were not each reviewed; a path-traversal or file-write bug inside one of them would not have been caught here.
- **DSH `subprocess` service semantics.** The card takes the plugin's own claim that it spawns Godot "unconfined" at face value; the sandbox behavior of the host service was not verified against the DSH source.
- **Fork behavior of the update check.** `UPDATE_SOURCE` is derived from `package.json`; a repackaged copy could point the load-time fetch at any GitHub repo. Not exploited or tested, only read.

## 6. Reviewer disagreement

Single-reviewer pass, one model. The scanner graded D on a mislabeled `eval` finding; the manual
grade is C, arriving at a similar place for different and better-evidenced reasons. Both are above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/Smalldy/godot-bridge /tmp/godot-bridge-audit
cd /tmp/godot-bridge-audit && git rev-parse HEAD   # expect e586db3fdd29bfa367caa9b46ac6daee2d9ac287

node tools/scan/dist/index.js /tmp/godot-bridge-audit   # from a dsh-bridge checkout

sed -n '206,250p' plugin/godot-bridge.mjs              # the load-time GitHub fetch
sed -n '258,283p' plugin/godot-bridge.mjs              # system-prompt injection on update
sed -n '484,509p' plugin/godot-bridge.mjs              # project.godot rewrite, no confirmation
sed -n '554,586p' plugin/mcp_interaction_server.gd     # GDScript eval inside the game
sed -n '22,27p'   plugin/mcp_interaction_server.gd     # 127.0.0.1:9090 listener, no auth
grep -rn "eval(\|new Function\|vm\." plugin/*.mjs      # no JS dynamic exec
```

## 8. Methodology and pinned inputs

- Subject: commit `e586db3fdd29bfa367caa9b46ac6daee2d9ac287`, shallow clone at `reference/audits/godot-bridge`
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`
- Review: full read of plugin/godot-bridge.mjs and package.json; targeted read of mcp_interaction_server.gd (bind, dispatch, eval) and README update section
- Cross-model review: NOT performed
- Grade derivation: start B (behavior matches documentation, no credential access, no telemetry). Minus one band for the combination of an unconditional load-time network call, self-injected system-prompt directives, and unconfirmed writes into the user's repository, none of which can be turned off through configuration. Not D: nothing is hidden, obfuscated, or contradicted by the docs.

## 9. Strengths

1. Honest documentation. The update check, its host, its timeout, and its prompt-injection behavior are described plainly in README:79-83 rather than buried.
2. Failure containment in the update path: abort controller, swallowed errors, never blocks boot, returns null on anything unexpected (plugin/godot-bridge.mjs:206-250).
3. No credential access, no environment enumeration, no telemetry, no install-time hooks, no minified or generated code in the shipped bundle.
4. The listener is bound to `127.0.0.1` explicitly rather than `*` (mcp_interaction_server.gd:23).
5. Godot path resolution prefers an explicit argument, then a validated setting, then PATH, and returns null rather than guessing (plugin/godot-bridge.mjs:186-200).

## 10. Residual risks

1. Prompt injection reaching `godot_command` yields arbitrary GDScript execution in the game process; GDScript can read and write files and open sockets.
2. A shipped game that still registers the autoload exposes an unauthenticated control port on end-user machines.
3. `project.godot` is edited without preview. On a project not under version control, the change is not trivially reversible.
4. The load-time fetch is a per-session heartbeat to GitHub tied to the installed version; low sensitivity, but not opt-out.
5. npm publishes an older version than the audited tree, so this grade does not transfer to `npm i godot-bridge`.

## 11. Re-verify steps

1. Re-run section 7 against current HEAD. Any new literal URL, any new `subprocess.spawn` target, or any new `systemPrompt.section` call must be re-adjudicated.
2. Diff `plugin/mcp_interaction_server.gd` on every bump: new commands are new capabilities inside the game process.
3. Check whether an opt-out for the update check has appeared; if the fetch becomes conditional and off by default, GODOT-NET-1 and GODOT-PROMPT-1 drop and the grade should be revisited upward.
4. Re-check `npm view godot-bridge version` against the repo version; when they converge, add a published-artifact comparison to this card.
