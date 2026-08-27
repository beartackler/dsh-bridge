# Trust Report Card: learn-harness-engineering

## 1. Header

| Field | Value |
|---|---|
| Plugin | `learn-harness-engineering` (walkinglabs) - a course repository, not a Cordis plugin. Two installable artifacts live inside it: the `harness-creator` agent Skill and the standalone `tools/audit-harness.sh` shell script. |
| Pinned subject (git) | github:walkinglabs/learn-harness-engineering @ commit `77e7a3e21469dcbece2558086c8d91657abeaa40` (default branch head at audit time, committed 2026-08-26T09:08:58+08:00) |
| Registry | None. `package.json:3` is `"private": true`; the package is never published. Distribution is `git clone`, or `curl | bash` for the audit script. |
| Provenance | Not applicable to a registry artifact, and weak for the documented install path: `curl -fsSL .../main/tools/audit-harness.sh | bash` fetches whatever `main` holds at that moment, with no pin and no checksum (README.md:665). |
| License | MIT (LICENSE, "Copyright (c) 2025 WalkingLab"; package.json:6) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 plus manual read of the skill's five bundled scripts, `templates/init.sh`, and `tools/audit-harness.sh`) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Almost all 638 scanned files are course prose, translations, and student project scaffolds that never
run on your machine; the executable surface is a read-only shell auditor and a small scaffolding
skill with no network access, and the one real objection is that the README's headline install is an
unpinned `curl | bash`.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Executable surface | Five `.mjs` scripts under `skills/harness-creator/scripts/`, one template `init.sh`, and `tools/audit-harness.sh` (543 lines). Everything else under `docs/`, `docs-readme/`, and `projects/` is course material. | skills/harness-creator/metadata.json:44-58; tools/audit-harness.sh:1-13 |
| Network egress (skill) | None. No `fetch`, no `http`, no URL literal in any of the five bundled scripts. | grep negative over skills/harness-creator/scripts/ |
| Network egress (auditor) | None. `tools/audit-harness.sh` prints two documentation URLs and nothing else; it makes no request. It is described in its own header as zero-dependency. | tools/audit-harness.sh:5-11, 109 |
| Credential handling | None anywhere in executable code. Every CRED finding is a course code sample listing `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md` as agent instruction files to read, replicated across 15 language directories. | docs/en/lectures/lecture-03-.../code/repo-reader.ts:36 and 14 translations |
| Child processes | One in shipped skill code: `execFile` in `run-benchmark.mjs`, used to run the skill's own scaffolder into a temporary directory as a self-check. The remaining `child_process` findings are student project scaffolds under `projects/*/`, which run `npx tsc`, `npx vite build`, `npx electron .`. | skills/harness-creator/scripts/run-benchmark.mjs:2, 18; projects/project-01/starter/scripts/dev.js:1-24 |
| Filesystem writes | The skill scaffolds `AGENTS.md` or `CLAUDE.md`, `feature_list.json`, `progress.md`, `session-handoff.md`, and `init.sh` into a target directory, skipping existing files unless `--force` is passed. | skills/harness-creator/scripts/create-harness.mjs:17-27 |
| Dynamic code execution | None. No `eval`, no `new Function`, no `vm.` in the skill scripts or the auditor. | grep negative |
| Telemetry | None found. | grep over skills/ and tools/ |
| DSH relationship | Documentation only: one lecture-style breakdown of how DeepSeek builds its harness. There is no DSH plugin, no `cordis.patch.yml`, and no DSH-specific code. | docs/en/harness-designs/deepseek/index.md; README.md:43 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **981 findings** (0 critical, 548 high, 1 medium, 432 low) over
638 files, machine grade **F**, score 0, off `cred-plus-net`, `dynamic-exec-present`, and
`finding-density`. The finding count is inflated by a structural feature of this repository: the
course ships in 15 languages, so a single code sample in one lecture is counted 15 times. Every gate
is adjudicated below.

### Gates adjudicated

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| `cred-plus-net` naming `tools/audit-harness.sh` | The gate joins two unrelated lines in one file. The CRED lines are a check testing whether the audited repo has scoped tool access, matched by filename (`.claude/settings.json`, `mcp.json`); the script tests for existence, it does not open them. The NET line is a printed documentation URL. The script performs no request at all. | tools/audit-harness.sh:167-169, 109 |
| CRED high, ~15x `["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md"]` | A lecture-03 code sample about treating the repository as the system of record, duplicated once per translated docs tree. It reads agent instruction files, which is the lecture's subject. It is illustrative code in `docs/`, never executed by an install. | docs/{en,ar,de,es,fr,ja,ko,pt-BR,ru,tr,uk,vi,...}/lectures/lecture-03-.../code/repo-reader.ts:36 |
| `dynamic-exec-present` / EXEC high, majority | `execSync('npx tsc ...')`, `execSync('npx vite build')`, `execSync('npx electron .')` in `projects/project-01` through `project-06`, each present twice as `starter/` and `solution/`. These are the student exercises; they build the Electron app the course teaches you to build, on the student's own clone. | projects/project-01/starter/scripts/dev.js:1-24 and five sibling projects |
| EXEC high `execFile` in `run-benchmark.mjs:2` | The one instance in shipped skill code. It runs the skill's own `create-harness.mjs` into a `mkdtemp` directory and validates the result, so the benchmark can prove its own scripts work before scoring your project. Argument vector, not a shell string. | skills/harness-creator/scripts/run-benchmark.mjs:2, 18, 24-31 |
| EXEC high on `App.tsx` lines mentioning `documents.import(...)` | Rule misfire: the substring `.import(` in a `console.log` and a renderer call. No process is spawned. | projects/project-01/starter/src/renderer/App.tsx:54; projects/project-02/solution/src/renderer/App.tsx:60 |
| HOOK high in `tools/audit-harness.sh:189, 191, 415` | Not hooks. These are the auditor's own recommendation strings, telling you to add `setup:` and `e2e:` targets to your Makefile. The scanner matched the advice text. | tools/audit-harness.sh:189-191, 415 |
| NET high outside the lockfile | `http://www.w3.org/2000/svg` XML namespaces in the VitePress theme, a JSON Schema `$schema` URL, `node:http` imported by a docs export utility, and `get_anthropic_logo.js` fetching a logo from `raw.githubusercontent.com` at author time. | docs/.vitepress/theme/index.js:152-155; skills/harness-creator/templates/feature-list.schema.json:2; get_anthropic_logo.js:1-2 |
| NET low, 432 | `resolved` tarball URLs in `package-lock.json`, which is what a lockfile is. | package-lock.json |
| `finding-density` | 638 files across a 15-language course with six duplicated student projects. Density measures translation coverage here, not capability. | scanner stats: 638 files, 2720855 bytes |

### The auditor, read closely

`tools/audit-harness.sh` is the artifact most likely to run on a stranger's machine, so it was read
directly. It is 543 lines of `set -euo pipefail` shell that takes a repository path, defaults to `.`,
and checks for the presence of harness files and Makefile targets. It prints `[PASS]`, `[FAIL]`,
`[WARN]` lines and exits 1 when a critical check fails (tools/audit-harness.sh:14-49). It writes
nothing, deletes nothing, and contacts nothing. As a piece of code handed to strangers, it is about
as inert as an executable can be.

The objection is not the script; it is the delivery. README.md:665 tells users to pipe it from
`main` into `bash`. That is unpinned by construction: the bytes you execute are whatever the default
branch holds at that second, and a repository compromise turns a benign auditor into arbitrary code
on every reader's machine. The second documented form, `bash tools/audit-harness.sh <path>` after
cloning, has none of that exposure (README.md:667-668).

### Negative claims and what was searched

Searched `skills/harness-creator/` (five scripts plus templates) and `tools/`: no `eval`, no
`new Function`, no `fetch`, no `http`/`https` client, no credential read, no environment enumeration,
no telemetry, no install lifecycle hook. `package.json` declares no `preinstall`, `install`,
`postinstall`, or `prepare` script, and is `private: true` besides.

## 5. What we could not check

- **What the skill's prompts instruct an agent to do.** `SKILL.md` and seven `references/*.md`
  pattern documents steer agent behavior. They were not read line by line for instructions that
  widen the tool surface, which for a Skill is the real attack surface rather than the scripts.
- **The `curl | bash` target over time.** This audit read `main` at one commit. The install command
  by design fetches a moving target.
- **Student project scaffolds in depth.** `projects/project-01` through `project-06` (starter and
  solution each) are Electron applications with their own dependency trees, reviewed only at the
  level of their `scripts/dev.js` build commands.
- **Dependency advisories.** `package-lock.json` was not joined against a pinned OSV snapshot.
- **Behavioral probe.** No sandboxed run of `create-harness.mjs` or the auditor (pipeline S4 not
  available).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner's machine grade (F, 981 findings) is recorded rather than hidden,
and the divergence here is the widest in this batch. The gap is structural: the scanner counts a
per-language duplicate of one lecture sample as 15 credential findings, and counts student build
scripts as shipped dynamic execution. Neither runs as a consequence of installing anything. The
manual C rests on the unpinned `curl | bash` and on the unreviewed prompt surface, not on any
scanner gate.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/walkinglabs/learn-harness-engineering /tmp/lhe-audit
cd /tmp/lhe-audit && git rev-parse HEAD   # expect 77e7a3e21469dcbece2558086c8d91657abeaa40

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/lhe-audit   # from a dsh-bridge checkout

# 3. Confirm that the executable surface is small
cd /tmp/lhe-audit
ls tools/ skills/harness-creator/scripts/
wc -l tools/audit-harness.sh skills/harness-creator/scripts/*.mjs

# 4. Confirm the auditor is inert
grep -rnE "curl|wget|fetch|nc |>|rm |mv " tools/audit-harness.sh | grep -v "echo" | head
grep -rnE "eval|new Function|fetch\(|https?://" skills/harness-creator/scripts/   # expect: no hits

# 5. Confirm no install hooks and no publication
node -p "const p=require('./package.json'); ({private:p.private, scripts:Object.keys(p.scripts)})"

# 6. See the objection for yourself
sed -n '663,669p' README.md   # the unpinned curl | bash, and the safer clone-first form below it
```

## 8. Methodology and pinned inputs

- Subject: git commit `77e7a3e21469dcbece2558086c8d91657abeaa40` (shallow clone at
  reference/audits/learn-harness-engineering)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; single repository-root run,
  981 findings over 638 files, machine F
- Review: full read of `tools/audit-harness.sh` structure and its check helpers,
  `skills/harness-creator/metadata.json`, `create-harness.mjs` and `run-benchmark.mjs` entry paths,
  `templates/init.sh`, `package.json`; grep sweeps for dynamic execution, network clients,
  credential reads, and lifecycle hooks across `skills/` and `tools/`; finding-by-path tally of the
  scanner output to separate `docs/` and `projects/` from executable code
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no network access, no credential access, no dynamic execution, and no lifecycle
  hooks in anything a user installs; the one `execFile` is a self-test with an argument vector. Held
  to C by: the headline install is an unpinned `curl | bash` from a moving branch, the prompt surface
  that actually directs an agent was not reviewed, and there is no published, pinnable artifact of
  any kind. B would require a pinned or checksummed install path and a read of the skill's prompt
  documents.

## 9. Strengths

1. The auditor is genuinely zero-dependency and read-only: it inspects, prints, and exits, and it
   opens no file it reports on (tools/audit-harness.sh:1-13, 36-63).
2. The scaffolder does not overwrite. Existing files are skipped unless `--force` is passed, so
   running it on a live project cannot silently destroy an `AGENTS.md`
   (skills/harness-creator/scripts/create-harness.mjs:17-27).
3. The benchmark proves its own tooling before it judges yours: it scaffolds a throwaway harness in a
   `mkdtemp` directory and confirms the result validates (skills/harness-creator/scripts/run-benchmark.mjs:24-31).
4. `execFile` with an argument vector rather than `exec` with a shell string, in the one place a
   process is spawned (skills/harness-creator/scripts/run-benchmark.mjs:2, 18).
5. `package.json` is `private: true` with no lifecycle scripts, so there is no accidental publish and
   no install-time execution path (package.json:3, 7-17).
6. The skill's `metadata.json` enumerates every bundled script, asset, and template explicitly, which
   makes an unexpected file easy to notice on a future bump
   (skills/harness-creator/metadata.json:44-58).
7. Upstream authorship is credited by name and link in the auditor's header rather than absorbed
   silently (tools/audit-harness.sh:11).

## 10. Residual risks

1. **`curl | bash` from `main`.** The README's first install form executes unpinned bytes from a
   moving branch with no checksum (README.md:665). Clone and read instead; the repository documents
   that form two lines later.
2. **The prompt surface was not reviewed.** For a Skill, `SKILL.md` and the seven reference patterns
   are what actually direct an agent. A future revision of those files changes behavior without
   touching a single line of the scripts this card read.
3. **Student projects run `npx`.** Working through `projects/*` executes `npx tsc`, `npx vite build`,
   and `npx electron .` against their own dependency trees (projects/project-01/starter/scripts/dev.js:1-24).
   That is normal for a course, and it is still arbitrary package execution.
4. **`get_anthropic_logo.js` fetches from `raw.githubusercontent.com` at author time** and sits in
   the repository root where a reader might run it (get_anthropic_logo.js:1-2). Harmless as written,
   unnecessary as shipped.
5. **No pinnable artifact.** Nothing is published, tagged for consumption, or checksummed, so there
   is no version a user can install and re-verify against this card.
6. **Scanner noise will recur.** The 15-language duplication means any future automated re-scan will
   again report hundreds of findings. Read the per-path tally, not the total.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any network client in `skills/` or `tools/`, any
   `eval`, or any new lifecycle script forces re-adjudication.
2. Diff `tools/audit-harness.sh` on every change. It is the file most likely to be piped into a
   stranger's shell, and it is the one worth reading in full each time.
3. Do the read of `SKILL.md` and `references/*.md` that this card deferred, and record it as
   revision 2.
4. Check whether the README's install command gained a pin, a tag, or a checksum. That single change
   would remove the main objection behind this C.
5. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
6. Re-vet at 90 days or on any material change to `skills/harness-creator/`, whichever comes first.
