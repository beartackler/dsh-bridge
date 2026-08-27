# Trust Report Card: write-chinese-long-screenplay

## 1. Header

| Field | Value |
|---|---|
| Plugin | `write-chinese-long-screenplay` (DSH skill provider: Chinese long-form novel and screenplay writing workflow, with Python helper scripts) |
| Pinned subject | github:mudden2380078550-creator/write-chinese-long-screenplay @ commit `dac733f2445ba9f73439f9e90cae90421fd77edf` (branch main, shallow clone) |
| npm integrity | Not checked. No npm publication is claimed; the package declares a git repository and is installed from git. |
| Provenance | None. Git-source install; no attestation, no signed tags. |
| License | GPL-3.0-only (package.json:25; LICENSE is the GPLv3 text). Note this is copyleft, unlike the MIT norm elsewhere in this catalog. |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A documentation-and-scaffolding skill with no network code of any kind: the JavaScript half only
parses a local `SKILL.md` and registers it with the harness's skill service, and the Python half is
a set of offline text tools over a user-named project directory that import nothing outside the
standard library.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No network code exists in the artifact. `grep -rE "https?://"` across all `.py`, `.js`, `.yaml`, and non-README `.md` files returns exactly one hit: an attribution link to `github.com/op7418/Humanizer-zh` inside prose at references/self-review.md:5. No Python script imports `requests`, `urllib`, `http`, or `socket`. | grep, see section 4 |
| Host-half behavior | `index.js` reads `SKILL.md` next to itself, parses YAML-ish frontmatter with a regex (index.js:42-55), and registers a skill provider whose `list`/`get` return that one skill's text (index.js:19-30). It touches no other path and calls no other service. `export const inject = ['skills']` is its only dependency. | index.js (73 lines, read in full) |
| Python scripts | Eleven offline scripts (4017 lines) that initialize, validate, migrate, compile, and review a screenplay/novel project directory. Imports across all of them are standard library only: `argparse, collections, datetime, hashlib, json, math, os, pathlib, re, shutil, sys, tempfile, typing, unicodedata` plus three local sibling modules (`screenplay_io`, `self_review`, `validate_project`). | `grep -rn "import " scripts/*.py` |
| Filesystem writes | Confined to a `--project-root` the user passes on the command line (e.g. compile_screenplay.py:27, 35). `init_project.py` refuses a non-empty target rather than overwriting (init_project.py:48-51), then `shutil.copytree` of the bundled template into it (init_project.py:69). Writes go through `atomic_write_text`, which uses `tempfile.mkstemp` in the destination directory and `os.replace` (screenplay_io.py:70-84). | file:line above |
| Filesystem deletes | Only the temp file created by the failed atomic write (`os.unlink(temp_name)` in the exception path, screenplay_io.py:79-83). No `rmtree`, no recursive delete anywhere in `scripts/`. | grep, zero `rmtree` hits |
| Child processes | None. No `subprocess`, `os.system`, `popen`, `child_process`, or shell invocation in any script. | grep, zero hits |
| Dynamic code execution | None. No Python `eval()` or `exec()`, no JavaScript `eval` or `new Function`. The only `exec`-shaped identifier in the tree is `runpy` in the test file (tests/test_v2_workflow.py:7), a test harness that imports scripts as modules. | grep across scripts/, index.js |
| Credential reads | None. No auth path, keychain, env-var harvest, or token read anywhere. | grep across scripts/, index.js |
| Telemetry | None. No analytics, beacon, or metrics code. | negative claim, scope: whole tree |
| Lifecycle hooks | None. `package.json` declares no `scripts` block at all. | package.json (read in full) |
| Content risk | The shipped skill text is instructional Chinese prose that tells a model how to structure long-form writing. It contains no tool-call directives, no instruction to fetch remote content, and no attempt to alter the host agent's permissions; `SKILL.md`'s frontmatter is name and description only (SKILL.md:1-4). | SKILL.md, references/ sampled |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 2 findings (0 critical, 1 high, 1 low), machine grade C, no gates. Both are the same
line. 7 files scanned, 80 skipped (the skip set is Markdown references and template assets, which
were reviewed by hand instead).

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| WCLS-SUPPLY-1 | low | package.json:28 | `repository.url` is `git+https://github.com/mudden2380078550-creator/write-chinese-long-screenplay.git`. The scanner reads a `git+https` URL as a moving-HEAD dependency; here it is a repository declaration. The implied concern is real though: installation is from a moving branch unless the user pins a commit, and the owner account name carries no reputational signal. |
| WCLS-LICENSE-1 | low | package.json:25 | GPL-3.0-only. Not a security finding, but a compatibility one: a downstream project that vendors these scripts inherits copyleft obligations. Worth surfacing because every other card in this catalog so far is MIT. |

### Scanner noise dismissed (with scope)

- NET-008 package.json:28: the same repository URL, recorded by the scanner so declared egress is listed. Nothing fetches it at runtime.

### Files the scanner skipped, reviewed by hand

The scanner skipped 80 files: 24 Markdown reference documents, the two project templates
(`assets/project-template`, `assets/novel-project-template`), `agents/openai.yaml`, `SKILL.md`, and
the changelogs. These were checked for embedded instructions that would widen the agent's behavior
(fetch a URL, run a shell command, read credentials, disable a guard). `agents/openai.yaml` is four
lines of display metadata and a default prompt. `SKILL.md` frontmatter carries `name` and
`description` only. No reference document instructs any tool call; they are writing-craft prose and
checklists. Template assets are Markdown skeletons and one JSON ledger with placeholder tokens
(`{{TITLE}}`, `{{DATE}}`) substituted by `init_project.py:70-89`.

### Negative claims and what was searched

Searched `index.js` (73 lines, read in full), all 11 files in `scripts/` (4017 lines; import lists
enumerated exhaustively, and every filesystem-touching call site read), `tests/test_v2_workflow.py`,
`package.json`, `cordis.patch.yml`, `SKILL.md`, `agents/openai.yaml`, and the `references/` and
`assets/` trees: no network primitive of any kind; no `subprocess` or shell; no `eval`/`exec`; no
credential path; no telemetry; no lifecycle hook; no obfuscation (all sources are plain,
readable Python and JavaScript); no write outside a user-supplied `--project-root` or the
harness-resolved skill directory.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run was performed. Static review covered every executable file but cannot rule out environment-dependent behavior.
- **Full prose review of `references/`.** Twenty-four reference documents were checked for tool-call and instruction-injection patterns and sampled for content, not read end to end in Chinese. A prompt-injection payload written as ordinary writing advice would be hard to distinguish from the surrounding text by the method used here.
- **The Python interpreter's environment.** The scripts run under whatever `python3` the user has; standard-library-only imports were verified from source, but a shadowed module on the user's `PYTHONPATH` is outside this artifact.
- **Test execution.** `tests/test_v2_workflow.py` was read, not run. It writes to `.test-tmp-v2` under the repo root (tests/test_v2_workflow.py:19).
- **Published-artifact comparison.** No npm artifact was located to diff against.
- **The harness's skill service.** `ctx.skills.registerProvider` and how DSH surfaces skill text to a model are the harness's own.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded C on a repository
URL; the manual verdict is A. Both positions are recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/mudden2380078550-creator/write-chinese-long-screenplay /tmp/wcls-audit
cd /tmp/wcls-audit && git rev-parse HEAD   # expect dac733f2445ba9f73439f9e90cae90421fd77edf

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/wcls-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "import " scripts/*.py | awk '{print $2,$3}' | sort -u   # stdlib + local siblings only
grep -rn "subprocess\|os.system\|popen\|eval(\|exec(" scripts index.js   # expect zero hits
grep -rnE "https?://" scripts index.js agents *.yml               # expect zero hits
grep -n "scripts" package.json                                    # no lifecycle hooks
sed -n '46,52p' scripts/init_project.py                           # refuses a non-empty target
sed -n '69,84p' scripts/screenplay_io.py                          # atomic write, no rmtree
```

## 8. Methodology and pinned inputs

- Subject: git commit `dac733f2445ba9f73439f9e90cae90421fd77edf` (shallow clone at reference/audits/write-chinese-long-screenplay)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 7 files scanned, 80 skipped
- Review: full read of index.js and package.json and cordis.patch.yml; exhaustive import enumeration across all 11 `scripts/*.py`; full read of the write paths in screenplay_io.py and init_project.py; targeted reads of compile_screenplay.py, migrate_project.py, and tests/test_v2_workflow.py; hand review of SKILL.md, agents/openai.yaml, and the references/ and assets/ file inventory
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero network, zero credential access, zero dynamic execution, zero child processes, zero lifecycle hooks. Filesystem writes are bounded to a directory the user names on the command line and are performed atomically with an overwrite refusal. Nothing survives adjudication above low severity, which clears the A band. Not higher because provenance is git-only and the Chinese-language reference corpus was sampled rather than fully read.

## 9. Strengths

1. `init_project.py` refuses a non-empty target directory instead of merging or overwriting (init_project.py:48-51). Scaffolding tools usually get this wrong.
2. Every file write is atomic: `mkstemp` in the destination directory, write, `os.replace`, and `unlink` of the temp file on failure (screenplay_io.py:70-84). A crash mid-write cannot truncate a user's manuscript.
3. Standard-library-only Python. No third-party dependency means no transitive supply-chain surface for the half of this plugin that does the real work.
4. The JavaScript half is 73 lines and does one thing. `apply` registers a provider; the provider reads one file. There is nothing else to audit.
5. Frontmatter parsing validates that the declared name matches the expected skill name and that a description exists, returning `undefined` rather than a partial skill otherwise (index.js:51-54).
6. Abort signals are honored in both `list` and `get` (index.js:22, 26).

## 10. Residual risks

1. GPL-3.0-only. Vendoring or deriving from these scripts carries copyleft obligations that MIT-licensed callers may not want.
2. The skill's whole function is to inject a large body of Chinese instructional text into a model's context. That text was sampled, not exhaustively read; a hostile instruction buried in 24 reference documents is the realistic attack here, not the code.
3. Scripts write to any `--project-root` the caller supplies. Invoked by an agent rather than a human, the directory is whatever the agent chose; the scripts impose no workspace confinement of their own beyond the non-empty refusal in `init_project.py`.
4. Git-only distribution from an account with an autogenerated-looking name, no attestation, no signed tags.
5. `migrate_project.py` (682 lines) rewrites existing project files in place. It is atomic per file, but a migration run against the wrong directory is still a content change the user must have backed up.

## 11. Re-verify steps

1. Re-run the step 7 block against current HEAD. Any new import outside the standard library, any `subprocess`, or any URL literal in `scripts/` must be re-adjudicated before this grade carries forward.
2. Diff `SKILL.md` and `references/` on every bump and read the diff, not the file. The prose is the payload here; a small insertion is the thing to catch.
3. Watch `package.json` for a `scripts` block appearing; there is none today, so any hook is new.
4. Re-check `index.js` for any path resolved outside `new URL('./', import.meta.url)`; today it reads exactly one file.
5. If the project publishes to npm, add integrity and provenance rows to section 1 and diff the tarball against this commit.
