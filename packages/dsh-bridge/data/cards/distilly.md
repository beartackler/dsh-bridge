# Trust Report Card: distilly

## 1. Header

| Field | Value |
|---|---|
| Plugin | `distilly` (`@titanwings/distilly` 1.0.0) - an agent Skill, not a Cordis plugin: it installs a `SKILL.md` plus a Python toolbox into `~/.dsh/skills/distilly`, formerly published as colleague-skill |
| Pinned subject (git) | github:titanwings/distilly @ commit `868c293f56116081733b78fc7db5f91634d7b62a` (default branch head at audit time, committed 2026-08-25T15:17:47+08:00) |
| Registry | `@titanwings/distilly@1.0.0`, published to GitHub Packages (`publishConfig.registry` is `https://npm.pkg.github.com`, package.json:47), which requires authentication to read. Not on npmjs.org. |
| Provenance | Not established. The registry is token-gated, so the tarball could not be fetched anonymously and no `gitHead`, integrity, or attestation could be read. This card grades the git tree only. |
| License | MIT (LICENSE; package.json:34) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 plus manual read of `bin/distilly.mjs` in full and targeted review of the 7584-line Python toolbox) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The installer is careful and small, but the payload it installs is a 7584-line Python toolbox whose
whole purpose is to harvest another person's messages and documents out of Feishu, DingTalk, Slack
and X, including by driving your logged-in Chrome profile - capable, honest about it in the README,
and squarely a privacy instrument rather than a code hazard.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Install-time writes | `distilly install <host>` copies a fixed 9-entry payload into a host skills directory. For DSH that is `$DSH_HOME/skills/distilly` or `~/.dsh/skills/distilly`. Nine hosts are supported, including `~/.claude/skills/distilly` and `~/.agents/skills/distilly`. | bin/distilly.mjs:19-43; INSTALL_EN.md:17-26 |
| Credential access (installer) | None. The installer names Claude Code and Codex directories only as install destinations. It writes a `distilly` subdirectory there; it never opens `.credentials.json`, `auth.json`, or any file it did not stage itself. | bin/distilly.mjs:32-42, 143-186 |
| Credential access (payload) | Real, and this is the substance of the grade. The toolbox reads `OPENAI_API_KEY` (research/transcribe_audio.py:145), injects `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_USER_ACCESS_TOKEN` into a child process env (feishu_mcp_client.py:101-106), and reuses your live browser session by launching Chromium against your actual Chrome profile directory (feishu_browser.py:35-60, dingtalk_auto_collector.py:487-520). | as listed |
| Network egress (payload) | Feishu (`open.feishu.cn`), DingTalk (`api.dingtalk.com`), Slack (`api.slack.com`), X via a third-party gateway (`xquik.com/api/v1/x/tweets/search`), and OpenAI Whisper as a transcription fallback. Each sits in the collector named for it; none is contacted by the installer. | feishu_auto_collector.py:20, 61; dingtalk_auto_collector.py:47; slack_auto_collector.py:112; research/xquik_public_posts.py:18; research/transcribe_audio.py:145 |
| Child processes (payload) | Two. `subprocess.run(["npx", "-y", "feishu-mcp", "--stdio"], ...)` fetches and runs a third-party npm package at call time; `research/transcribe_audio.py:72` shells out for local media handling. | feishu_mcp_client.py:119-126; research/transcribe_audio.py:35, 72 |
| Dynamic code execution | None found. No `eval`, `exec()`, `__import__`, `os.system`, or `pickle` anywhere in `tools/` or `bin/`. | grep negative over tools/ and bin/ |
| Model-facing surface | `SKILL.md` declares `allowed-tools: Read, Write, Edit, Bash`, i.e. full shell. It is `user-invocable`, so it runs when the user calls it, not autonomously. | SKILL.md:1-7 |
| Telemetry | None found in the installer or the toolbox. | grep over tools/ and bin/ |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **5 findings** (0 critical, 2 high, 0 medium, 3 low), machine
grade **C**, score 73, capped only by "at least one high-severity finding". No gate fired. Note the
scanner's reach: 9 files and 11812 bytes scanned, 133 skipped, because its corpus is
JavaScript/JSON-oriented and the Python toolbox is where the interesting behavior lives. The manual
review below covers what the scanner did not.

### Scanner findings adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED high `join(homedir(), ".claude", "skills", "distilly")` (bin/distilly.mjs:33) | False positive for a credential read. This is the Claude Code install destination in a host table, alongside eight others. The installer only ever writes a `distilly` subdirectory; it opens no file under `.claude`. | bin/distilly.mjs:32-42, 160-166 |
| NET high `"registry": "https://npm.pkg.github.com"` (package.json:47) | Real, and it matters for a different reason than egress: it means the package is not on npmjs.org and cannot be fetched or verified anonymously. Recorded as the provenance gap in section 1, not as a runtime risk. | package.json:45-48 |
| NET low x3 (package.json:37, 39, 41) | Repository, homepage, and issues metadata. Inert strings. | package.json:34-42 |

### Manual review of the installer

`bin/distilly.mjs` is 204 lines and was read in full. It is the strongest part of the package:

- Refuses to install into a filesystem root or the home directory, and requires the target's final
  path segment to be literally `distilly` (bin/distilly.mjs:95-105). A `--path` typo cannot flatten
  an unrelated directory.
- Validates the payload before touching the target, including checking that `SKILL.md` declares the
  same version as `package.json` (bin/distilly.mjs:77-88).
- Stages into a sibling `.distilly-install-<pid>` directory, then renames, and on failure removes the
  staging directory and restores the backup (bin/distilly.mjs:152-184). An interrupted install does
  not leave a half-written skill.
- `--force` preserves the previous install as a timestamped backup rather than deleting it
  (bin/distilly.mjs:169-171, 186).
- No network access at all, and the only filesystem writes are inside the validated target.

### Manual review of the payload

The payload is the risk. `tools/` contains collectors for Feishu, DingTalk, Slack, and X, plus a
research subdirectory for transcripts. Two patterns deserve naming:

1. **Browser-session reuse.** `feishu_browser.py` states its design plainly in its own docstring:
   reuse the machine's Chrome login state, no token needed, reach everything you have access to
   (feishu_browser.py:5). It launches a persistent Chromium context against
   `~/Library/Application Support/Google/Chrome/Default` on macOS and the equivalents elsewhere
   (feishu_browser.py:35-60), with `--disable-blink-features=AutomationControlled` set
   (feishu_browser.py:57). `dingtalk_auto_collector.py:487-520` does the same. Nothing here
   exfiltrates: the scraped content is written to the local output path you pass. But a tool that
   drives your authenticated browser is a tool that can read anything that browser can read.
2. **Third-party code fetched at call time.** `feishu_mcp_client.py:119` runs
   `npx -y feishu-mcp --stdio` with your Feishu app id, secret, and user access token in the child
   environment. `-y` means the package is downloaded and executed without a prompt, and the audited
   repository pins no version of it. This is the single sharpest edge in the package.

### Negative claims and what was searched

Searched `tools/` (7584 lines of Python), `bin/`, and all package metadata: no `eval`, no `exec()`,
no `os.system`, no `__import__`, no `pickle`, no obfuscation signals, no analytics endpoint, no
credential path in the installer, and no install-time lifecycle hook (`prepack` runs on the
maintainer's machine, package.json:22).

## 5. What we could not check

- **The published artifact.** GitHub Packages returns 401 without a token, so `@titanwings/distilly@1.0.0`
  was never fetched. There is no verified relationship between the graded tree and whatever a user
  installs from the registry. This is the largest single gap in the card.
- **`feishu-mcp`.** An unpinned third-party npm package that receives your Feishu credentials. It was
  not audited, and its contents can change between two runs of the same Distilly version.
- **Collector runtime behavior.** No collector was executed. Claims about what they send are read
  from source, not observed on the wire.
- **Prompt content.** `prompts/` and `references/` steer the model's profiling behavior. They were
  not reviewed line by line for bias or for instructions that widen the tool surface.
- **Behavioral probe.** No sandboxed run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner's machine grade (C) and this card's grade (C) agree by coincidence
rather than by reasoning: the scanner arrives there from one misread install path, while this card
arrives there from the payload's data-collection surface and the missing provenance. Both scanner
highs are adjudicated away above; the C is earned elsewhere.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/titanwings/distilly /tmp/distilly-audit
cd /tmp/distilly-audit && git rev-parse HEAD   # expect 868c293f56116081733b78fc7db5f91634d7b62a

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/distilly-audit   # from a dsh-bridge checkout

# 3. Read the installer end to end. It is 204 lines.
cat /tmp/distilly-audit/bin/distilly.mjs

# 4. See where the install would land, without writing anything
node /tmp/distilly-audit/bin/distilly.mjs install deepseek-harness --dry-run 2>/dev/null || \
  node /tmp/distilly-audit/bin/distilly.mjs --help

# 5. Confirm the payload claims for yourself
cd /tmp/distilly-audit
grep -rn "launch_persistent_context" tools/          # browser-session reuse: feishu_browser.py, dingtalk_auto_collector.py
sed -n '119,126p' tools/feishu_mcp_client.py         # npx -y feishu-mcp, with your Feishu secrets in env
grep -rnE "eval\(|exec\(|os\.system|__import__|pickle" tools/ bin/   # expect: only subprocess.run in two files
grep -rhoE "https?://[a-zA-Z0-9./_-]+" tools/ | sort -u              # every host the toolbox knows

# 6. Confirm the provenance gap
npm view @titanwings/distilly version                # expect: 401 from npm.pkg.github.com
```

## 8. Methodology and pinned inputs

- Subject: git commit `868c293f56116081733b78fc7db5f91634d7b62a` (shallow clone at
  reference/audits/distilly)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; single repository-root run,
  5 findings, machine C
- Review: full manual read of `bin/distilly.mjs` (204 lines), `package.json`, `SKILL.md` header,
  `INSTALL_EN.md`; targeted read of `tools/feishu_browser.py`, `tools/feishu_mcp_client.py`,
  `tools/dingtalk_auto_collector.py`, `tools/research/xquik_public_posts.py`,
  `tools/research/transcribe_audio.py`, `tools/install_hermes_skill.py`; grep sweeps for dynamic
  execution, credential reads, and network hosts across all 7584 lines of `tools/`
- Registry: fetch attempted 2026-08-26, refused with 401 by GitHub Packages
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no dynamic code execution, no telemetry, no exfiltration path, and an installer
  that is materially safer than average. Held to C by three things: the payload reuses your
  authenticated browser session by design, it runs an unpinned third-party npm package with your
  Feishu secrets in its environment, and no published artifact could be verified at all. B would
  require at minimum a fetchable, pinnable tarball and a pinned `feishu-mcp`.

## 9. Strengths

1. The installer refuses unsafe targets outright: not the filesystem root, not the home directory,
   and only a path whose last segment is `distilly` (bin/distilly.mjs:95-105).
2. Installs are staged then renamed, with rollback and a timestamped backup on `--force`, so a failed
   or interrupted install cannot destroy an existing skill (bin/distilly.mjs:152-186).
3. `--dry-run` exists on the Python installers and prints the destination without writing
   (install_hermes_skill.py:26-27, 52; INSTALL_EN.md:39).
4. The payload is validated against `package.json` before anything is copied, including a version
   match with `SKILL.md` (bin/distilly.mjs:77-88).
5. The skill is `user-invocable` and its collectors are separate scripts the user runs deliberately,
   rather than lifecycle hooks that fire on install (SKILL.md:6).
6. `SKILL.md` tells the agent to resolve the skill root from the host rather than guessing or
   hard-coding a path, and to ask the user when two installs are ambiguous (SKILL.md:13).
7. The project states in its own README that a Person Profile is built from observable material and
   does not claim to clone the person, which is a more honest framing than the category usually gets
   (README.md:38).

## 10. Residual risks

1. **This is a surveillance-capable toolbox, and its subject is usually someone else.** Distilling a
   colleague's messages out of Feishu or DingTalk is the advertised use case. Consent and local law
   are the user's problem, and nothing in the code checks either.
2. **Your Chrome profile is the credential.** `launch_persistent_context` against your default
   profile means the tool inherits every session that browser holds, not only Feishu
   (feishu_browser.py:35-60).
3. **`npx -y feishu-mcp` is unpinned third-party code receiving your app secret and user access
   token** (feishu_mcp_client.py:101-126). Its contents can change between runs.
4. **No verifiable artifact.** The package lives behind an authenticated registry with no readable
   `gitHead`, integrity, or attestation. Prefer installing from a git checkout you have read.
5. **Full shell in the skill contract.** `allowed-tools` includes `Bash` (SKILL.md:7), so anything
   the skill's prompts instruct the agent to run, it can run.
6. **Third-party data gateway.** X collection routes through `xquik.com` with an `XQUIK_API_KEY`
   rather than X's own API (research/xquik_public_posts.py:18-20). That vendor sees your queries.
7. Scanner coverage was thin here: 9 files scanned against a mostly-Python repository. Do not read
   the machine C as coverage of the toolbox.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. A new collector, a new outbound host, or any
   `eval`/`exec` in `tools/` forces re-adjudication.
2. Diff `bin/distilly.mjs` on every bump. It is 204 lines; read it rather than trusting this card.
3. Check whether `feishu-mcp` has been pinned to a version. If it has, residual risk 3 shrinks
   materially.
4. Check whether the package moved to npmjs.org, or gained `gitHead` and provenance. That is the
   single change that would most raise this grade.
5. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
6. Re-vet at 90 days or on any new release, whichever comes first.
