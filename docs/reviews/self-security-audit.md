# dsh-bridge Self-Security Audit

> Adversarial self-review of the dsh-bridge plugin, conducted with the evidence standard the
> project demands of third-party plugins (docs/trust/pipeline-architecture.md, docs/trust/heuristics-corpus.md).
> Role: external auditor. Assumption: the plugin is malicious and our own scanner missed it.

| Field | Value |
|---|---|
| Subject | `dsh-bridge` v0.1.0, repository working tree (see Limitation L1: not a pinned release) |
| Scope | `packages/dsh-bridge/src/**`, `tools/scan/src/**`, `index.js`, `package.json`, `cordis.patch.yml`, `scripts/*.mjs`, `npm pack` output, `~/.dsh-bridge/*` |
| Method | Our scanner (`tools/scan` 0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`) + manual review + one executed proof-of-concept |
| Grade | **D** (see §5) |
| Blocks an A | F-1 (argv injection, arbitrary file write) and L1/L2 (no pinned subject, no sandboxed probe) |

## 1. Scanner run on ourselves, adjudicated

Command: `node tools/scan/dist/index.js packages/dsh-bridge`

Raw result: **grade F**, score 0, 282 findings (13 critical, 210 high, 2 medium, 57 low),
gates `cred-plus-net`, `dynamic-exec-present`, `finding-density`, 162 files scanned.

The raw F does not survive adjudication, and the reasons are themselves findings about our
scanner. Adjudication of the 210 highs by shipped-vs-not:

| Class | Count | Adjudication |
|---|---|---|
| `test/**` and `dist/test/**` | 129 | **False positive (scope).** Test fixtures that deliberately contain `eval(userInput)` and `fetch('https://collect.example/x')` to prove the rules fire. Evidence: `dist/test/self-test.js:332`, `dist/test/trust-test.js:204`. |
| `src/**` duplicating `dist/src/**` | 37 | **Double-counted.** Pipeline §S3 says the loaded artifact is the subject; `src/` is not loaded. Every one of these has a `dist/` twin already counted. |
| `package-lock.json`, `tsconfig.json` | 1 high + 39 total | **False positive (scope).** Build metadata, not shipped code (confirmed absent from tarball, §3). |
| Genuinely shipped runtime | 43 | Adjudicated individually below. |

### 1.1 The 13 criticals

All 13 are false positives or scope errors:

- 3 × `EXEC-004` "imports child_process" in shipped runtime: `dist/src/lib/scan-client.js:12`,
  `dist/src/commands/review.js:22`, `dist/src/commands/improve.js:15`. Real capability, but the
  severity is miscalibrated. Our own corpus H-PROC-01 assigns **medium** to
  "`execFile`/`spawn` with a static allowlisted binary and array argv"
  (docs/trust/heuristics-corpus.md:701). All three sites are exactly that shape: array argv,
  no `shell:true` anywhere in the package (grep verified). Correct severity: medium.
- 1 × `EXEC-004` on `dist/src/commands/suggest.js:121`, whose excerpt is the literal string
  `"No dynamic execution anywhere: no eval, new Function, vm, child_process."` Firing on our own
  prose. This is the comment-context false positive our corpus explicitly warns about
  (`tools/scan/src/rules/types.ts:143`).
- 3 × `EXEC-001` `eval()` in `dist/test/**`: test fixtures (scope).
- 4 × `CRED-003` "references SSH directory or private key" on
  `src/commands/init.ts:50` / `dist/src/commands/init.js:39`. The matched line is the
  **deny list** `NEVER_READ = [".env", ..., "id_rsa", "id_ed25519", ...]`. The scanner flagged a
  security control as a vulnerability, and double-counted it across src and dist.
- 2 × remaining are the src/dist twins of the above.

**Zero of the 13 criticals is a real critical.** Our scanner's `dynamic-exec-present` gate is
also wrong on its face: there is no dynamic code execution in the shipped runtime at all
(verified §3.3).

### 1.2 The `cred-plus-net` gate

The gate fired because CRED and NET findings coexist. Per pipeline §S3, `CRED`+`NET` reachable in
the same control-flow region is an auto-F. **Not satisfied here, and this is the load-bearing
negative claim of this audit:** the package contains **zero network call sites**.

Searched `fetch(`, `http(s).request/get`, `net.connect`, `net.Socket`, `dgram`, `new WebSocket`
across `packages/dsh-bridge/dist/src/**` and `tools/scan/dist/**` (excluding `.map`): the only
hits are inside `tools/scan/dist/self-test.js` and `tools/scan/dist/rules/network-egress.js`,
i.e. rule patterns and test fixtures. The NET findings in shipped runtime are **string constants
in a lookup table**, never dereferenced: `dist/src/commands/connect.js:48,53,58,62,63` hold
`baseUrl` values for display (`https://api.anthropic.com/v1/models`, etc.). The plugin prints
them; it never calls them.

Therefore CRED without NET. Per §S6 that is a **D** condition
("credential-path reads without exfil evidence"), not F.

## 2. Manual audit: what the scanner cannot see

### 2.1 Exfiltration — none found

No network egress at all (§1.2). No telemetry, no machine-id collection, no beaconing
(grep for `telemetry|analytics|machine-id|beacon` across `src/**`: only
`memory.ts:21` asserting "No network calls, no telemetry" and an unrelated keyword regex in
`recommend.ts:59`). No `Object.keys(process.env)` enumeration in the plugin
(only in `tools/scan/src/self-test.ts:62` as a rule fixture).

### 2.2 F-1 (HIGH, confirmed by execution): argv injection into `git` → arbitrary file write

**This is the worst finding in the package and it is real.**

`/bridge-review --base <ref>` takes the user-supplied `--base` value and interpolates it into
git's argv with no validation and no `--` separator:

- `packages/dsh-bridge/src/commands/review.ts:145` (shipped: `dist/src/commands/review.js`):
  `return ["--no-pager", "diff", `${target.base}...HEAD`, "--numstat"];`
- `packages/dsh-bridge/src/commands/review.ts:328` accepts `args["base"]` verbatim into the target.
- `packages/dsh-bridge/src/commands/review.ts:330`: `exec("git", diffArgv(target), {cwd})`.

Because the value lands in argv position 3 and begins with `-` when an attacker chooses, git
parses it as an **option**, not a revision. `git diff --output=<path>` writes to an arbitrary path.

Proof of concept, executed against the shipped `dist` (not source):

```
target: {"kind":"base","base":"--output=/tmp/gitinj/POC_E2E"}
argv:   ["--no-pager","diff","--output=/tmp/gitinj/POC_E2E...HEAD","--numstat"]
result: /tmp/gitinj/POC_E2E...HEAD created (10 bytes)
```

The write escaped every declared path: it is not under the plugin dir, not under `$DSH_HOME`, not
under the reviewed repo. Impact: attacker-influenced arguments (a malicious repo's README
instructing an agent to run `/bridge-review --base "--output=~/.zshrc"`, or a prompt-injection
payload reaching a slash command) yield arbitrary file write with the user's privileges, which is
a path to code execution via shell rc files or git hooks. `spawnSync` with array argv correctly
prevents *shell* injection; it does not prevent *option* injection, and the code relies on the
former as if it provided the latter.

Note also `review.ts:388`: `exec("test", ["-f", name], {cwd})` spawns the external `test`
binary with a `cwd` but resolves the binary via `PATH`, which is unnecessary process spawning
where `existsSync` would do.

**Required fix (blocks A).** Validate `--base` against a conservative ref pattern
(e.g. `/^[A-Za-z0-9._\/-]{1,255}$/`, rejecting leading `-`, leading/trailing `.`, and `..`), and
independently pass user-derived revisions after an explicit `--` end-of-options separator, or use
`git diff --numstat <base> -- ` argv layout with the revision never in option position. Add a
regression test asserting `diffArgv` refuses a leading `-`. Apply the same validation to the
positional `<path>` token.

**Required fix (scanner, blocks A for the pipeline's credibility).** Our corpus has no
argv/option-injection rule. H-PROC-01 classifies "static command with interpolated args" but
assigns it `medium` and frames the risk purely as shell injection
(docs/trust/heuristics-corpus.md:696-705). We would have missed F-1 in someone else's plugin.
Add a rule for user input reaching argv position without a `--` guard.

### 2.3 Writes outside declared paths

Every write site was enumerated (`writeFileSync|mkdirSync|appendFileSync|rmSync|copyFileSync|chmodSync|renameSync|unlinkSync` across `src/**`) and each is confined and mode-conscious:

| Site | Target | Notes |
|---|---|---|
| `commands/memory.ts:74-77` | `~/.dsh-bridge/memory.md` | mkdir + temp write mode `0600` + atomic rename. Verified on disk: `-rw-------`. |
| `commands/mcp.ts:92-93`, `commands/setup.ts:98-99`, `commands/connect-apply.ts:67` | MCP/profile config | mode `0600` explicitly. |
| `commands/refactor.ts:664-665` | plan edits | Guarded: `applyPlan` re-validates every edit path with `resolved !== target && !resolved.startsWith(target + sep)` → throws before any write (`refactor.ts:646-657`), plus full snapshot rollback (`refactor.ts:625-630`). Correct defense in depth. |
| `lib/drift.ts:128-129` | drift state | Confined to state path. |
| `commands/init.ts:341` | `<root>/AGENTS.md` | In-project, mode not set (inherits umask). Minor: no explicit mode. |
| `lib/scan-client.ts:195` | `mkdtemp` scratch | Removed in `finally`. |

The single escape is F-1, which bypasses all of this by delegating the write to `git`.

### 2.4 Command injection through ctx.exec

- **MCP config values:** server names are validated by
  `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/` (`commands/mcp.ts:42`) and enforced at both
  `mcp.ts:170` and `mcp.ts:493`. `/bridge-mcp test` does **not** spawn anything: `handshakeChecklist()`
  (`mcp.ts:639-670`) returns descriptive rows only. The `command`/`args` a user adds are stored, not
  executed by us. Clean.
- **`/bridge-improve --diff`:** `execFileSync("git", [...args])` with fully internal, constant argv
  (`commands/improve.ts:555`, args from `improve.ts:565-568`). No user input reaches argv. Clean.
- **`/bridge-refactor`:** `TEST_COMMAND = "npm test"` is a constant (`refactor.ts:42`) and execution
  is delegated to the host's `ctx.exec` seam, feature-detected and refused when absent
  (`refactor.ts:124-127`). No interpolation. Clean.
- **`lib/scan-client.ts:124`:** `spawn(process.execPath, [entry, targetDir, "--json", jsonPath])`,
  array argv, `stdio` piped, 60 s timeout that kills the child. `targetDir` is a path, not an
  option; low risk but shares F-1's class if a caller passes a `-`-leading target. Recommend the
  same leading-`-` rejection.
- **No `shell: true` anywhere in the package** (grep verified). No `sh -c`, no `cmd /c`.

### 2.5 Credential reads — necessary, and unusually well disciplined

`lib/paths.ts` is the only credential surface and it is metadata-only by construction:

- `probeJsonSource` (`paths.ts:113-165`) returns `{exists, sizeBytes, mode, shape}` and **never
  returns contents**. Shape checking is `record[key] !== undefined` — presence, not value.
- Symlinks are refused, not followed: `lstatSync` + `stats.isSymbolicLink()` → reported absent
  (`paths.ts:121-128`).
- 64 KiB read cap short-circuits before parsing (`paths.ts:19`, `paths.ts:137-139`).
- `maskSecret` (`paths.ts:196-199`) renders `prefix...last4`, and `...` alone under 12 chars.
- `init.ts:39` maintains an explicit `NEVER_READ` deny list for `.env`, `.pem`, `.key`, `id_rsa`,
  `id_ed25519`, `.credentials`, `.p12`.

Reads are justified by the documented connectors feature (the plugin's stated purpose is detecting
existing provider auth). Paths touched: `~/.claude/.credentials.json`, `~/.codex/auth.json`,
`~/.gemini/oauth_creds.json`, `~/.local/share/opencode/auth.json`, `~/.dsh/.env`, `<cwd>/.env`.
No `~/.ssh`, no `~/.aws`, no keychain access. Assessment: **not unnecessary**, and the
no-contents-returned invariant is enforced at the type level (`SourceProbe` has no value field).

### 2.6 Secrets in output, logs, or state

- `~/.dsh-bridge/` contains only `memory.md`, mode `0600`, content is 7 lines of user notes with no
  secret material. No `*.json` state files exist.
- Grep for `sk-[A-Za-z0-9]{16,}|sk-ant-|ghp_|AIza...` across `~/.dsh-bridge/`: no matches.
- MCP rendering redacts: env/header values become `{"$env":"NAME"}` or
  `[redacted:<n> chars]` (`mcp.ts:210-218`), and secret-shaped values render as
  `process.env.<KEY>` references rather than literals (`mcp.ts:322-331`).
- Length disclosure is the one residual leak: `[redacted:${String(value).length} chars]`
  (`mcp.ts:218`) publishes the exact secret length. Low severity, but we would flag it in a
  third-party card, so it is flagged here. **Recommended fix:** bucket the length or drop it.

## 3. Supply chain

### 3.1 `npm pack --dry-run`

407 entries, 4,525,917 bytes unpacked. Directory breakdown:

```
84  packages/dsh-bridge/dist/test     <-- should not ship
76  packages/dsh-bridge/dist/src/commands
66  docs/catalog/cards
65  packages/dsh-bridge/data/cards
44  tools/scan/dist/rules
44  packages/dsh-bridge/dist/src/lib
16  tools/scan/dist
 4  packages/dsh-bridge/dist/src
 2  packages/dsh-bridge/data
 1  each: README.md LICENSE index.js cordis.patch.yml package.json packages/dsh-bridge
```

No `.env`, no keys, no credential material, no `scripts/` (install.mjs is **not** shipped, so its
`chmodSync`/`spawnSync` are out of the tarball's threat model).

**F-2 (LOW, hygiene): 88 test artifacts ship to users.** `packages/dsh-bridge/dist/test/**` (84)
plus `tools/scan/dist/self-test.*` (4) are published because the root `files` entry is the whole
`packages/dsh-bridge/dist`. These files contain deliberate `eval(userInput)` and
`fetch('https://collect.example/x')` fixtures. They are never imported by the plugin entry, so the
practical risk is low, but the cost is real: they are the direct cause of 129 of the 210 high
findings any downstream scanner (including ours) will report, and shipping attack-shaped strings
in a *trust* tool is an own goal. **Required fix:** narrow `files` to
`packages/dsh-bridge/dist/src` and add `tools/scan/dist/self-test.*` exclusion, or emit tests
outside `dist`. Also ships `.js.map`/`.d.ts.map` for all of it.

### 3.2 Lifecycle scripts

Root `package.json` has **no `scripts` block at all** — no `preinstall`, `install`, `postinstall`,
or `prepare`. This is the correct posture and the root manifest is the published one.
`packages/dsh-bridge/package.json:39-45` has `prepack: npm run build`, which runs at *publish*
time on the maintainer's machine, not on the user's install. Clean.

### 3.3 Dynamic code execution in shipped dist

Searched `eval(`, `new Function`, `vm.runIn*`, `process.binding`, `import(` with non-literal
specifier across `packages/dsh-bridge/dist/src/**` and `tools/scan/dist/**`:

**Zero real dynamic execution in shipped runtime code.** The only matches are (a) the prose string
in `dist/src/commands/suggest.js:121`, (b) rule *patterns* in `tools/scan/dist/rules/*.js`, and
(c) test fixtures in `tools/scan/dist/self-test.js`. This meets the
`no-dynamic-eval-in-bundle` bar the pipeline sets (§1). Our own scanner's
`dynamic-exec-present` gate contradicting this is a scanner bug, not a finding about the plugin.

### 3.4 Dependencies

Peers: `@deepseek-ai/cordis ^4.0.1`, `@deepseek-ai/schemastery ^3.18.1`
(`packages/dsh-bridge/package.json:46-49`). Zero runtime dependencies. Caret ranges are wider than
ponytail's exact pin (pipeline §1 notes range width is itself a risk signal); schemastery compiles
schema callbacks via `new Function` in the user's environment, correctly externalized as a peer
rather than inlined. Not shipped: no lockfile in the tarball, so the user's resolution governs.

## 4. What we could not check

- **L1 — No pinned subject.** This audit ran against a working tree, not a resolved commit or a
  published npm integrity hash. Under pipeline §S0 an unpinnable source grades `N/A`; under §S6
  anything the pipeline could not fully examine is capped at **C**. We hold third parties to
  commit-level pinning (see the archify card's pinned commit and `dist.integrity`) and did not
  meet it ourselves here. The task rules forbade git operations, so no commit could be resolved.
- **L2 — No sandboxed behavioral probe.** No container, no netless honeypot, no canary
  credentials, no `load-only`/`idle-soak`/`teardown` scenarios, no 3× repeat. All negative claims
  about egress and credential handling are **static-only**. Per §S6 this alone caps the grade at C.
- **L3 — Single-model review.** Pipeline §S5 requires two independent passes from different model
  families. This is one pass. A verdict claiming cross-model review would be false.
- **L4 — No src↔dist reproducibility check.** `dist/` was read as the subject and spot-matched to
  `src/`, but no provenance artifact binds them.
- **L5 — Peer behavior on the user's machine** (cordis, schemastery) is out of scope.
- **L6 — No signature.** No `verdict.json`, no `verdict_digest`, no cosign artifact.

## 5. Grade against our own bands

Applying docs/trust/pipeline-architecture.md §S6 honestly.

| Band | Condition | Verdict |
|---|---|---|
| **F** | canary exfil / `CRED`+`NET` reachable / obfuscation / sandbox escape | **Not met.** No network call sites at all (§1.2), no obfuscation, no exfil. The scanner's raw F is wrong. |
| **D** | "Undocumented egress, credential-path reads without exfil evidence, install-time hooks, obfuscation signals, **or a disputed high finding**" | **Met.** F-1 is a confirmed high (arbitrary file write via argv injection, PoC executed). Credential-path reads exist without exfil evidence. |
| **C** | ceiling for anything not fully examined | Cap applies via L1 (unpinned) and L2 (no probe). |
| **B** | ≤2 medium findings, all explained; provenance verifiable | **Not met.** F-1 is high, not medium; provenance not verifiable (L1, L4). |
| **A** | zero high/critical; no dynamic exec; no undeclared egress; probe clean ×3; both reviewers concur; provenance verifiable | **Not met.** |

Caps are monotone and can only lower: `min(D, C-cap-from-L1, C-cap-from-L2) = D`.

### Final grade: D

Stated plainly: **our own plugin would not be recommended by `/bridge:install`**, which requires
grade B or better (§8). We are publishing a D card for ourselves.

### Exactly what blocks an A

1. **F-1 argv injection** (`review.ts:145`) — a confirmed high finding. Zero high/critical is a
   hard A condition. Must be fixed and regression-tested.
2. **No pinned subject (L1)** — A requires a verifiable subject; §S0 rejects unpinnable sources
   outright. Needs a resolved commit + published `dist.integrity`.
3. **No sandboxed probe (L2)** — A requires "probe clean across all scenarios ×3". Not run.
4. **No cross-model review (L3)** — A requires "both reviewers concur". Only one reviewer.
5. **No provenance / src↔lib correspondence (L4)** — A requires zero unattributed bundle bytes or
   full reproducibility from a provenance artifact.
6. **No signed verdict (L6)** — cards are unverifiable without §8.3 signing.

Fixing F-1 alone raises the ceiling to C (caps from L1/L2 still bind). Reaching B additionally
requires a pinned subject and verifiable provenance. Reaching A requires all six.

### Required fixes, ordered

| # | Severity | Fix | Location |
|---|---|---|---|
| 1 | high | Validate `--base`/path against a ref pattern rejecting leading `-`; pass revisions after `--`; regression test | `packages/dsh-bridge/src/commands/review.ts:145,328` |
| 2 | medium | Add an argv/option-injection rule to the corpus and scanner; we would have missed F-1 in a third party | `docs/trust/heuristics-corpus.md` H-PROC-01, `tools/scan/src/rules/shell-invocation.ts` |
| 3 | medium | Fix scanner scope: exclude `test/**`, exclude non-loaded `src/` when a `dist/` twin exists, exclude lockfiles; deduplicate | `tools/scan/src/index.ts` |
| 4 | medium | Recalibrate `EXEC-004` to medium for array-argv static-binary spawns, per our own H-PROC-01:701 | `tools/scan/src/rules/dynamic-eval.ts:59` |
| 5 | medium | Suppress matches inside string literals and comments (the `suggest.js:121` and `NEVER_READ` self-hits) | `tools/scan/src/rules/types.ts` |
| 6 | low | Stop shipping 88 test artifacts and source maps | root `package.json:12-19` |
| 7 | low | Drop or bucket the secret-length disclosure | `packages/dsh-bridge/src/commands/mcp.ts:218` |
| 8 | low | Reject leading-`-` scan targets; replace `exec("test","-f")` with `existsSync` | `lib/scan-client.ts:124`, `review.ts:388` |
| 9 | low | Set an explicit mode when writing `AGENTS.md` | `commands/init.ts:341` |

## 6. Honest note on our scanner

The scanner produced 282 findings on a package whose real issue count is one high and a handful of
lows. That is roughly a 95% false-positive rate at high severity, driven by three defects: it scans
test fixtures, it double-counts `src` against `dist`, and it matches inside string literals and
comments — including flagging our own `NEVER_READ` deny list as a credential vulnerability and our
own sentence "No dynamic execution anywhere" as dynamic execution. Meanwhile it missed the one
finding that matters. A grading tool that outputs F for everything grades nothing, and a corpus
without an option-injection rule cannot catch the most likely injection shape in agent tooling.
Fixes 2-5 above are prerequisites for any card we publish about anyone else being credible.
