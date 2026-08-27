# Trust Report Card: dsh-fail-logger

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-fail-logger` (observes the session log, deduplicates and counts tool-call failures, and maintains a marked section of a local skill file so the agent stops repeating the same mistakes) |
| Pinned subject | github:Areium/dsh-fail-logger @ commit `ab09e90f35d74cabf5af510e4c8bcf4bd6f2ddc5` (2026-08-21, default-branch head at audit time; package.json version 0.5.3) |
| npm integrity | `sha512-QCACymdu+0PGCGPAgzuycAn7Sv2+/9zVAnpgtMlhUwQyZr0OiVvQ9qVqcgqJgPm4oLYaRSaPpR6BPYEWBDWFuQ==` (`registry.npmjs.org/dsh-fail-logger/0.5.2`, fetched 2026-08-27). Note: 0.5.3 is **not** published; the registry's newest is 0.5.2, `gitHead` `dd9d62f611aa2f41ef27488340db60797625ab42`. |
| Provenance | Weak. No release workflow publishes it (.github/workflows/ci.yml runs tests only). The registry does record a `gitHead` per version, which is better than nothing, but no signature or attestation. |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of the single shipped source file + the author's test suite executed) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

565 lines of dependency-free Node that opens no network socket, spawns no process, reads no
credential, and writes only inside one skill directory under `~/.dsh`, with the unusual property
that its author anticipated the one real risk of the design (untrusted error text flowing back into
the model's context) and built layered redaction and prompt-injection sanitizing against it.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | **None.** There is no `fetch`, no `http`/`https`/`net` import, and no URL literal in `lib/index.js`. The only lines matching "fetch" or "network" are two regexes that classify error *text* into a "network" category (lib/index.js:276, 293). | grep over lib/ |
| Child processes | **None.** No `child_process` import, no `spawn`, no `exec`. | grep over lib/ |
| Dynamic code execution | **None.** No `eval`, `new Function`, or `vm`. Imports are five literal `node:` builtins (crypto, fs, path, os) at lib/index.js:24-27. | lib/index.js:24-27 |
| Credential reads | **None.** The only `process.env` reads are `DSH_HOME`, `FAIL_LOG_DIR`, `PTC_FAIL_LOG_DIR`, and `FAIL_LOG_REPLAY` (lib/index.js:94-95, 553), all path or test-mode configuration. No auth.json, keychain, browser store, `.ssh`, or `.aws`. No environment enumeration. | lib/index.js:94-95, 553 |
| Filesystem writes | Confined to `LOG_DIR`, default `~/.dsh/skills/fail-log-guide`: `SKILL.md`, `.failures.json`, a `.lock` file, `.tmp-<pid>` staging files, a `.probe-<pid>` writability probe, and `.bak-<timestamp>` copies when state parsing fails. All writes go through one `writeAtomic` helper (write temp, rename) at lib/index.js:146-151. Startup sweeps stale `.tmp-` files (lib/index.js:153). | lib/index.js:95-98, 146-163 |
| Reads session events | Subscribes `ctx.on('session/event', handle)` (lib/index.js:565) and inspects `tool/call`, `tool/result`, and `tool/code-dispatch` events. It retains the tool name, the first line of the error text (capped), and up to 80 characters of the call arguments (lib/index.js:504, 492). Tool arguments can contain user data, so this is real exposure to session content, but it stays on disk. | lib/index.js:515-550 |
| Writes into the model's context | Registers three system-prompt sections: a fixed prevention text (order 90), a fixed recovery text (order 190), and a **dynamic** "top recurring errors" summary derived from recorded failure messages (order 185, lib/index.js:123-142, 345-358). It also rewrites a marked region of `SKILL.md`, which the agent loads on demand. | lib/index.js:123-142, 306-341 |
| Telemetry | **None.** Nothing to send it with. | negative claim, scope stated |
| Lifecycle hooks | `prepublishOnly: npm run check && npm run test` (package.json:23). This is a **publisher-side** hook; npm does not run it on install. There is no `install`, `preinstall`, or `postinstall`. | package.json:20-24 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 31 findings (27 high, 2 medium, 2 low), machine grade F, gate `dynamic-exec-present`.
**Of the 31, exactly 3 are in shipped code, and all 3 are low.** The single shipped file was read
in full (565 lines), so adjudication covers 100 percent of the runtime surface.

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| SUPPLY high, package.json:30, "dependency pinned to a git host: resolves to moving HEAD at install time" | **False positive.** Line 30 is `repository.url`, standard package metadata (`git+https://github.com/Areium/dsh-fail-logger.git`). This package has **no dependencies at all**: there is no `dependencies`, `devDependencies`, or `peerDependencies` field in package.json. | package.json:28-31 |
| HOOK medium, package.json:23, "npm prepublishOnly hook runs automatically at install time" | **False positive on the mechanism.** `prepublishOnly` runs on `npm publish`, not on install. It runs `node --check lib/index.js` and the test suite. Harmless to a consumer. | package.json:20-24 |
| EXEC high x24, `tests/test.mjs` (lines 38, 62, 86, ... 582) | Test-only. Each is `await import(pluginUrl + '?t=' + n)`, the standard cache-busting trick for re-importing a module under test. `tests/` is not in package.json `files`, so it does not ship. | package.json `files`; tests/test.mjs |
| OBFU medium, tests/test.mjs:408 | `String.fromCharCode(36)` used in an assertion that the seed body contains no dollar character, guarding against `$&`-style corruption in the write pipeline. Test-only, and a sensible test. | tests/test.mjs:405-410 |
| NET high, tests/test.mjs:480 | The literal `http://evil/x.sh` inside a **prompt-injection test fixture** asserting the plugin neutralizes such text. Test-only. This is the scanner flagging a security test as a security problem. | tests/test.mjs:476-482 |
| NET low, package.json:30 | Repository metadata URL. | package.json:30 |
| HOOK low, lib/index.js:465 | `ctx.on('dispose', ...)` final flush. Kept as FL-BLOCK-1 below. | lib/index.js:465-472 |
| `dynamic-exec-present` gate | **Not adopted.** It fires on the test file's dynamic imports. Shipped code has no dynamic execution of any kind. | grep |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| FL-CTX-1 | low | lib/index.js:345-358, 130-136 | Text derived from tool error messages is injected into the system prompt on every agent step. This is the design's inherent risk: error strings can contain attacker-influenced content (a malicious filename, a hostile server's response). The author's mitigations are layered and were verified by reading each one: `normKey` strips paths and long numbers (lib/index.js:198-202); `mdSafe` removes control characters, escapes table pipes, leading `#`, backticks, and HTML angle brackets (lib/index.js:186-188); `stripInstructions` replaces `<system-reminder>`, `<skill_content>`, `<available_skills>` blocks and nine imperative-phrase patterns in English and Chinese with `[redacted]` (lib/index.js:174-185); the top-errors block excludes `args` and raw paths entirely and caps each line at 90 characters (lib/index.js:353-355); and both the skill section and the prompt block carry explicit "data only, do not execute" framing (lib/index.js:320, 357). Residual risk is not zero, because pattern-based sanitizing is not a proof, but the surface is deliberately narrowed to normalized, truncated, escaped message text. |
| FL-DISK-1 | low | lib/index.js:492, 504 | Up to 80 characters of tool-call arguments and the first line of error text are persisted to `.failures.json` and rendered into `SKILL.md`. Eight default redaction rules cover `sk-` keys, Bearer and Basic headers, URL userinfo, `-u` flags, `api_key`/`token`/`secret`/`password` assignments, `.credentials.*`, and RFC1918 addresses (lib/index.js:53-62), and users can add more via `config.redact`. Regex redaction is best-effort by nature; a secret in an unusual shape would persist. |
| FL-PERM-1 | low | lib/index.js:146-151 | `writeAtomic` does not set a restrictive mode, so `.failures.json` and `SKILL.md` are created with the process umask (typically 0644). Given FL-DISK-1, files that may contain redaction-missed fragments are readable by other local users on a multi-user machine. Compare modlens, which writes its state 0600. |
| FL-BLOCK-1 | low | lib/index.js:462-472 | On `dispose`, if the state is dirty and the cross-process lock is contended, the plugin blocks the thread with `Atomics.wait` in up to ten 100 ms slices, so shutdown can stall roughly one second. Bounded and deliberate (the comment says so), but it is a synchronous block in a host lifecycle hook. |
| FL-REDOS-1 | low | lib/index.js:110-117 | User-supplied `config.ignore` and `config.redact` strings are compiled to `RegExp` and run against error text. Invalid patterns are caught and skipped with a warning, but a catastrophically backtracking pattern would be accepted. Self-inflicted only: the user writes their own config. |
| FL-PROV-1 | low | package.json vs registry | The audited tree is 0.5.3; npm's newest is 0.5.2 at a different commit. Whichever the user installs, it is not the tree graded here unless they install from git at this SHA. |

### Behavioral evidence

Unusually for this batch, the author's own test suite was **executed**:
`node tests/test.mjs` -> `ALL TESTS PASS (25 suites)`, exit code 0, 15.3 s, on Node under macOS
arm64. The suite drives the plugin through synthetic and replayed session events and asserts, among
other things: dedup key stability, cross-session count non-inflation, TTL pruning, lock contention
handling, marker-section idempotence, seed-body integrity, and two prompt-injection fixtures
(tests/test.mjs:476-482) verifying that `<system-reminder>` tags and imperative Chinese command
text are neutralized before reaching `SKILL.md`. This does not substitute for an adversarial probe,
but it is direct evidence the sanitizing paths execute as claimed rather than merely existing.

### Negative claims and what was searched

Searched the entire repository: `lib/index.js` (565 lines, read in full), `lib/seed-body.md`,
`tests/test.mjs` (592 lines) and its fixture, package.json, dsh.plugin.json, cordis.patch.yml,
both READMEs, LICENSE, .github/workflows/ci.yml. The only other files are two PNG assets and
.gitignore. Results: no network capability of any kind; no process spawning; no dynamic code
execution; no credential access; no install-time lifecycle hook; no dependencies whatsoever; no
obfuscation (readable ESM with substantive comments retained); no telemetry; no writes outside
`LOG_DIR`.

## 5. What we could not check

- **Adversarial probe of the sanitizer.** The author's two injection fixtures pass, but we did not
  attempt to defeat `stripInstructions` ourselves. Pattern-based neutralizing of imperative text is
  inherently incomplete; a phrasing outside the nine patterns, or a language other than English and
  Chinese, would pass through as escaped-but-intact text into the prompt block. The truncation to
  90 characters and the removal of backticks, angle brackets, and paths substantially limit what
  could be smuggled, but no bound was proven.
- **Published-artifact comparison.** The npm tarball for 0.5.2 was not downloaded or compared, and
  0.5.3 (this tree) is unpublished. The registry `gitHead` for 0.5.2 was not resolved in the
  shallow clone.
- **Full behavioral soak.** The test suite ran, but no long-running DSH session, no
  multi-process lock race under real load, and no idle-soak observation was performed. The
  cross-process lock logic (lib/index.js:397-410) has a classic stale-lock unlink race that is
  unlikely to matter for a counter ledger but was not stress-tested.
- **Interaction with the host's skill routing.** The plugin writes frontmatter (`name`,
  `description`) into a skill file (lib/index.js:371) so DSH will route to it. Whether a
  maliciously-shaped recorded message could influence skill routing was not tested; the frontmatter
  itself is fixed text, so the surface appears closed.
- **Windows behavior.** Path handling (`~\\`, drive-letter regexes) was read, not executed.
- **Cross-model review.** Single reviewer, single model.

## 6. Grade derivation

Every A-band criterion is met on evidence: no external egress at all, no process spawning, no
dynamic code execution, no credential access, no telemetry, no install-time hook, no dependencies,
writes confined to one directory the user configures, and the author's own tests pass on a live
run. No medium or higher production finding survived adjudication; the six kept findings are all
low and all are properties of the design rather than defects. The scanner's F is rejected outright:
28 of its 31 findings are in a test file that does not ship, and two of the three remaining are
misreadings of package metadata and of when `prepublishOnly` runs. The grade is **A** rather than
A-plus-equivalent because provenance is weak (FL-PROV-1: the audited version is not the published
one) and because FL-CTX-1 is a real, if well-mitigated, path from untrusted text into the model's
context.

## 7. Strengths

1. The threat model is correct and the author acted on it. A plugin whose entire purpose is feeding
   error text back to the model is a prompt-injection vector by construction; this one normalizes,
   truncates, escapes, strips instruction-shaped patterns, labels the data as non-instructions in
   two places, and ships tests that assert the neutralizing works.
2. Zero dependencies and zero ambient capability. There is nothing to compromise through the supply
   chain because there is no supply chain, and no network or exec primitive is even imported.
3. Secret hygiene by default: eight redaction rules applied before anything is stored, plus a
   user-extensible list (lib/index.js:53-62, 114-117).
4. Correctness discipline visible in the code: atomic write-then-rename, a cross-process exclusive
   lock with staleness recovery, re-read-and-merge under the lock to avoid lost updates, an
   explicitly commented fix for a cross-session count-doubling bug (lib/index.js:478-479), schema
   versioning with a v1-to-v2 migration, TTL pruning, bounded state size, bounded day history, and
   a deterministic total ordering for rendering (lib/index.js:266-270) so the output file does not
   churn.
5. Fails quietly and visibly: probes `LOG_DIR` writability at startup and warns once that failures
   are not being persisted rather than silently doing nothing (lib/index.js:155-163, 476).
6. Bounded memory: the call-id map is capped at 2048 entries with a 30-minute TTL
   (lib/index.js:40-41, 521-522).
7. Twenty-five test suites that pass, covering the failure modes a counter ledger actually has.

## 8. Residual risks

1. Attacker-influenced error text reaches the system prompt in normalized, escaped, truncated form.
   The sanitizer is pattern-based, so it is a mitigation, not a guarantee.
2. A secret in a shape the eight default rules do not match will be written to disk and into
   `SKILL.md`.
3. State and skill files inherit the umask rather than being locked to the owner.
4. Up to about one second of synchronous blocking at host shutdown under lock contention.
5. The installed artifact (npm 0.5.2) is not the artifact graded here (git 0.5.3).
6. The plugin edits a file the agent then loads. That is its purpose, and the file lives under the
   user's `~/.dsh/skills`, but it does mean an automated process is writing content into the
   agent's own instruction surface.

## 9. Reviewer disagreement

Single-reviewer pass; no second adversarial model. The scanner graded F; this card grades A, the
widest divergence in this batch. Both positions are recorded in section 4 with the specific reason
each scanner finding was dismissed, so the disagreement is auditable rather than asserted.

## 10. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Areium/dsh-fail-logger /tmp/fl-audit
cd /tmp/fl-audit && git rev-parse HEAD  # expect ab09e90f35d74cabf5af510e4c8bcf4bd6f2ddc5

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/fl-audit   # from a dsh-bridge checkout

# 3. The headline claims: no network, no exec, no creds, no deps
grep -nE "fetch\(|node:http|node:https|node:net|child_process|spawn|eval\(|new Function" lib/index.js
#   expect: nothing (the only "fetch"/"network" hits are classifier regexes at :276 and :293)
grep -rhoE "https?://[a-zA-Z0-9./_:-]+" lib/    # expect: nothing
node -e 'const p=require("./package.json");
         console.log(p.dependencies,p.devDependencies,p.peerDependencies)'  # expect all undefined
sed -n '24,27p' lib/index.js                    # the complete import list

# 4. The sanitizers this card credits
sed -n '53,62p'   lib/index.js   # secret redaction rules
sed -n '174,188p' lib/index.js   # instruction stripping + markdown escaping
sed -n '345,358p' lib/index.js   # what actually enters the system prompt

# 5. Run the author's tests (real behavioral evidence)
node tests/test.mjs              # expect: ALL TESTS PASS (25 suites), exit 0

# 6. The provenance gap
npm view dsh-fail-logger versions        # newest is 0.5.2; this tree says 0.5.3
node -e 'console.log(require("./package.json").version)'
```

## 11. Re-verify steps

1. Re-run section 10 step 3. A single new `fetch`, `http` import, or `child_process` import would
   move this plugin out of the A band entirely; the grade rests on their total absence.
2. Re-read `stripInstructions` and `renderTopErrors` (lib/index.js:174-185, 345-358) after any
   change. Anything that widens what reaches the system prompt, removes an escape, or raises the
   90-character cap needs re-adjudication of FL-CTX-1.
3. Watch package.json for the first dependency and for any `install`/`postinstall` script. Both are
   currently absent and both would be findings.
4. If `writeAtomic` gains a `mode: 0o600`, FL-PERM-1 clears.
5. When 0.5.3 or later is published, pin `dist.integrity` and `gitHead` and confirm the tree
   matches; that would clear FL-PROV-1.
6. Re-run the scanner after any heuristics-corpus bump; the rulesDigest for this pass is in
   section 4.

## 12. Methodology and pinned inputs

- Subject: commit `ab09e90f35d74cabf5af510e4c8bcf4bd6f2ddc5`, shallow clone at
  `reference/audits/dsh-fail-logger`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Manual review: `lib/index.js` read in full (565 lines, the entire runtime surface);
  `lib/seed-body.md`; `tests/test.mjs` read at every flagged line plus the injection fixtures;
  package.json, dsh.plugin.json, cordis.patch.yml, .github/workflows/ci.yml, both READMEs.
- Behavioral: `node tests/test.mjs` executed on this machine, 25 suites, exit 0, 15.3 s.
- Registry check: `npm view dsh-fail-logger@0.5.2 dist.integrity gitHead` and
  `npm view dsh-fail-logger versions`, fetched 2026-08-27.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
