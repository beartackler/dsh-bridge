# Trust Report Card: Jesseovo/last30days-skill-cn

## 1. Header

| Field | Value |
|---|---|
| Plugin | `last30days-cn` v3.2.0 (agent skill: searches eight Chinese platforms - Weibo, Xiaohongshu, Bilibili, Zhihu, Douyin, WeChat public accounts, Baidu, Toutiao - over a 30-day window and renders a cited research report as Markdown, JSON, or a self-contained HTML page) |
| Pinned subject | github:Jesseovo/last30days-skill-cn @ commit `1a8a04c3c347defbcdbb8da26d7cf1a531426b1f` (default branch head at audit time; last push 2026-07-20) |
| Provenance | Git tree audited directly. There is no npm or PyPI package: installation is a `git clone` into an agent skills directory, or `scripts/sync.sh`, so what runs is this repository at whatever ref you clone. 1637 GitHub stars at snapshot. |
| License | MIT (LICENSE), but with two copyright lines: Matt Van Horn for the original `last30days-skill` and Jesse for this fork. GitHub reports the license as NOASSERTION because of the modified header. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the skill manifest, hooks, installer, environment layer, HTTP layer, and the Playwright crawler bridge) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Clean, dependency-light Python with no telemetry, no dynamic execution, no obfuscation, careful
secret handling, and URLs that all resolve to the eight platforms it advertises - but it is not a
DSH plugin despite the `dsh-plugin` topic, it drives a real Chromium browser and persists each
platform's cookies to your home directory, and its whole purpose is scraping platforms whose terms
it asks you to respect.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| DSH integration | None found. No `cordis.patch.yml`, no `dsh` key in any manifest, no `@deepseek-ai/cordis` dependency, no `.dsh` path reference anywhere in the tree. The repository carries the `dsh-plugin` GitHub topic, but the shipped manifests target Claude Code (`.claude-plugin/plugin.json`, `hooks/hooks.json` with `CLAUDE_PLUGIN_ROOT`), Gemini CLI (`gemini-extension.json`), OpenAI agents (`agents/openai.yaml`), and OpenClaw/ClawHub. The install matrix names `~/.agents/skills/`, which DSH shares, so the skill would run under an agent that reads that directory. | grep verified; .claude-plugin/plugin.json; hooks/hooks.json; README.en.md:103 |
| Network egress | Every outbound host is a platform this skill names in its own description: `m.weibo.cn`, `api.weibo.com`, `www.xiaohongshu.com`, `api.bilibili.com`, `search.bilibili.com`, `www.zhihu.com`, `www.douyin.com`, `www.toutiao.com`, `www.baidu.com`, `api.baidu.com`, `weixin.sogou.com`, `api.jisuapi.com`, `api.tikhub.io`, plus `cn.bing.com` as the documented search fallback. No maintainer-operated endpoint, no analytics host, no pastebin, no IP-literal destination. | grep sweep of scripts/ and skills/ URL literals |
| Credential access | Reads only its own configuration: `~/.config/last30days-cn/.env` or `.claude/last30days-cn.env`, plus named environment variables. All keys are optional and platform-specific (`WEIBO_ACCESS_TOKEN`, `ZHIHU_COOKIE`, `TIKHUB_API_KEY`, `WECHAT_API_KEY`, `BAIDU_API_KEY`, `BAIDU_SECRET_KEY`, `SCRAPECREATORS_API_KEY`). No reads of `.ssh`, `.aws`, keychains, browser profile stores, or other agents' auth files. | scripts/lib/env.py:20-29, 82-107; SKILL.md metadata block |
| Secret hygiene | Above average. The env loader warns on stderr when a config file is group- or world-readable and tells you to `chmod 600` (env.py:32-43). The HTTP layer redacts any query parameter whose name contains key, token, secret, password, or auth before debug logging (http.py:44-58, SECRET_QUERY_KEYS at :35). The Gemini manifest marks all seven credentials `"sensitive": true`. The session hook reads env values into shell variables explicitly without exporting them. | file:line above; gemini-extension.json; hooks/scripts/check-config.sh:29-42 |
| Browser automation (extra scrutiny) | Optional Playwright mode launches Chromium headless with a fixed desktop or mobile user agent, `zh-CN` locale, and `Asia/Shanghai` timezone, then intercepts XHR responses rather than parsing the DOM. It is opt-in twice over: Playwright is not a hard dependency (requirements.txt states there are none), and `LAST30DAYS_DISABLE_BROWSER=1` forces API and search fallbacks. It launches its own browser, not your installed profile: no `user_data_dir` and no `launch_persistent_context` anywhere. | scripts/lib/crawler_bridge.py:31-38, 50-63, 120-160; requirements.txt |
| Cookie persistence | Cookies from each automated session are written to `~/.config/last30days-cn/browser_cookies/<platform>_cookies.json` on context close and reloaded on the next run. Written with default permissions; unlike the `.env` path, no permission warning covers this directory. If you log into a platform during a run, that session token now sits in a plain JSON file. | crawler_bridge.py:90-105, 143-155, 770-778 |
| Child processes / dynamic execution | None in Python. Grep for `subprocess`, `os.system`, `eval(`, and `exec(` across `scripts/` and `skills/` returns zero hits. Playwright spawns its own browser through its library, which is the documented mechanism. | grep verified |
| Session hook | One `SessionStart` hook, 5-second timeout, running `hooks/scripts/check-config.sh`. It reads the config file if present, counts how many data sources are available, and prints a Chinese readiness line. It makes no network call and sends nothing anywhere. | hooks/hooks.json:1-14; hooks/scripts/check-config.sh |
| Installer | `scripts/sync.sh` copies `SKILL.md`, the Python entry point, `scripts/lib/*.py`, and fixtures into `~/.claude/skills/`, `~/.agents/skills/`, and `~/.codex/skills/` with `mkdir -p`, `cp`, and `rsync`. Fixed paths, no `sudo`, no `curl | bash`, no network. | scripts/sync.sh:1-35 |
| HTML report safety | The HTML renderer imports `html.escape` and applies it to interpolated values, and the repo carries a dedicated XSS regression test. | scripts/lib/render.py:9, 865-876; tests/test_render_xss.py |
| Payload duplication | `skills/last30days/scripts/` is a byte-identical copy of the repo-root `scripts/` (`diff -rq` reports no differences), which is the documented Agent Skills packaging layout rather than a divergence to audit twice. | diff verified |
| Telemetry | None found. No analytics, beacon, or vendor SDK strings; the only `github.com` URLs in the tree are the author's profile and repository links in manifests and docstrings. | grep verified |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.
Raw output: 15 findings (0 critical, 11 high, 0 medium, 4 low), machine grade F, families CRED/NET;
12 files scanned, 93 skipped, 13361 bytes. The F comes from a `finding-density` gate plus a
high-severity gate, both of which resolve to package metadata and installer paths. Note that the
scanner examined only 12 files: the Python payload is 7876 lines that its rule set does not cover,
so the manual review below carries most of the weight here rather than supplementing the tool.

### Scanner criticals adjudicated

None. Zero critical findings.

### Findings kept (documented behavior or real residual risk)

| ID | Severity | Location | Note |
|---|---|---|---|
| DAT-SCOPE-1 | medium | crawler_bridge.py (module docstring, 780 lines); README.en.md disclaimer | The product is a scraper. It automates a browser against platforms whose terms generally forbid automated collection; the module docstring and README both say so and ask users to comply with local law and platform terms. That honesty is worth something, but it does not change what the tool does or who bears the consequences. |
| DAT-CRED-1 | medium | crawler_bridge.py:90-105, 143-155 | Platform cookies are persisted unencrypted to `~/.config/last30days-cn/browser_cookies/*.json` with default permissions. The `.env` path gets a permission warning; this path does not. Any local process running as your user can read a logged-in session token from there. |
| DAT-SUPPLY-1 | medium | README.en.md:103; scripts/sync.sh | There is no packaged artifact and no pinned install. Installation is a `git clone` of the default branch into an agent skills directory, or a script that copies the working tree. What executes is whatever the branch says at clone time; there is no version pin, no checksum, and no signature. |
| DAT-FIT-1 | medium | repository topics vs. tree contents | The repository is tagged `dsh-plugin` but contains no DSH manifest of any kind. It is installable under DSH only through the shared `~/.agents/skills/` convention. A catalog entry should not imply a supported DSH integration where none is declared. |
| DAT-NET-1 | low | scripts/lib/*.py platform modules | Every query you run is sent to eight third-party platforms plus Bing, along with a user agent this code chooses for you (a Windows Chrome 124 or iOS Safari string, crawler_bridge.py:39-46). That is the advertised function; it is still your search terms leaving your machine to companies you did not separately consent to. |
| DAT-I18N-1 | low | agents/openai.yaml:1-6; hooks/scripts/check-config.sh:66-90; SKILL.md | Operator-facing output is Chinese-first: the session hook's readiness message, the OpenAI agent display name and default prompt, and most in-code notes. Appropriate for the target audience, a fit note for an English-first catalog. |

### Scanner noise dismissed (with scope)

- CRED-001 x6 at hooks/scripts/check-config.sh:8, 89 and both copies of scripts/sync.sh:11, 13: string literals naming `.claude/last30days-cn.env`, `~/.claude/skills/`, and `~/.codex/skills/`. The first is this skill's own config file; the others are install destinations for its own files. Neither reads a credential belonging to another tool.
- NET-007 high at .claude-plugin/marketplace.json:2: the `$schema` URL for Claude Code's marketplace manifest format. Schema metadata, never fetched by this code.
- NET-007 x4 at fixtures/bilibili_sample.json:19, 36 and fixtures/zhihu_sample.json:22, 39: example result URLs inside offline test fixtures.
- NET-008 x4: the author's GitHub profile and repository links in `plugin.json` and `marketplace.json`.

### Negative claims and what was searched

Searched all of `scripts/` and `skills/last30days/scripts/` (7876 lines of Python across 27 modules,
duplicated), `hooks/`, `agents/`, both plugin manifests, `SKILL.md`, `requirements.txt`, and the
36-file test suite. No `subprocess`, `os.system`, `eval(`, or `exec(` anywhere. No `user_data_dir` or
`launch_persistent_context`, so your existing Chrome profile is never opened. No base64 or hex-escape
concealment. No telemetry, analytics, or beacon strings. No maintainer-operated endpoint of any kind.
No `pip install` executed at runtime and no hard Python dependencies. No shell hook other than the
one 5-second `SessionStart` script, which performs no network I/O.

## 5. What we could not check

- **Behavioral probe.** Nothing was installed or run. No research query was executed, no browser
  launched, no cookie file created, and the anti-bot fallback chains were not exercised.
- **The upstream fork relationship.** This is described as a deeply localized fork of
  `mvanhorn/last30days-skill`; the diff against upstream was not computed, so how much of this code is
  inherited versus written here is unverified.
- **Platform-side consequences.** Whether a given query pattern trips rate limits, account flags, or
  bans on any of the eight platforms is untested and unknowable from source.
- **The `assets/banner.png` and fixture files** were treated as inert data and not parsed.
- **Cross-model review.** Single reviewer, one model.

## 6. Reviewer disagreement

Single-reviewer pass. Machine grade F versus adjudicated C. The scanner's F rests on a density gate
over 15 findings, every one of which is a manifest URL, a test fixture, or this skill's own config
and install paths. The more important disagreement is about coverage rather than severity: the
scanner read 12 files and skipped 93, so it never examined the Python that actually runs. The C is
set by the manual review, and specifically by cookie persistence, the unpinned clone-based install,
and the mismatch between the `dsh-plugin` topic and the absent DSH manifest.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Jesseovo/last30days-skill-cn /tmp/l30-audit
cd /tmp/l30-audit && git rev-parse HEAD   # expect 1a8a04c3c347defbcdbb8da26d7cf1a531426b1f

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/l30-audit   # from a dsh-bridge checkout

# 3. Confirm there is no DSH integration
grep -rniE "cordis|deepseek|\.dsh" --include='*.json' --include='*.yaml' --include='*.yml' --include='*.md' .

# 4. Prove no process execution or dynamic evaluation
grep -rnE "subprocess|os\.system|\beval\(|\bexec\(" scripts/ skills/

# 5. See the full outbound host list for yourself
grep -rhoE "https?://[a-zA-Z0-9._-]+" scripts/ | sort -u

# 6. Read the two things that matter most
sed -n '90,105p'  scripts/lib/crawler_bridge.py   # cookie persistence
sed -n '32,43p'   scripts/lib/env.py              # config permission warning
cat hooks/scripts/check-config.sh                 # the entire session hook
```

## 8. Methodology and pinned inputs

- Subject: git commit `1a8a04c3c347defbcdbb8da26d7cf1a531426b1f` (shallow clone at
  reference/audits/last30days-skill-cn, 2026-08-26)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...aee999`
- Review: full manual read of hooks/hooks.json, hooks/scripts/check-config.sh, scripts/sync.sh,
  .claude-plugin/plugin.json, gemini-extension.json, agents/openai.yaml, SKILL.md front matter,
  requirements.txt, LICENSE; targeted reads of scripts/lib/env.py (config resolution, permission
  check, precedence), scripts/lib/http.py (timeouts, retry policy, URL redaction),
  scripts/lib/crawler_bridge.py (browser launch, cookie save and load, availability gating),
  scripts/lib/render.py (HTML escaping); grep sweeps for process execution, dynamic evaluation,
  obfuscation, telemetry, credential paths, and the complete URL inventory; `diff -rq` between the
  repo-root and skill-payload script trees; adjudication of all 15 scanner findings
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: nothing hostile was found, and several habits are better than the ecosystem
  average (secret redaction in logs, a config permission warning, no runtime dependencies, an XSS
  regression test, browser mode opt-in and force-disable switches). C rather than B because of what
  the tool is and how it arrives: plaintext platform cookies in the home directory (DAT-CRED-1), an
  unpinned clone-based install with no artifact to verify (DAT-SUPPLY-1), a `dsh-plugin` topic with
  no DSH manifest behind it (DAT-FIT-1), and a scraping purpose the user carries the liability for
  (DAT-SCOPE-1). The pipeline also caps any pass without a behavioral probe or cross-model review at C.

## 9. Strengths

1. Zero hard dependencies. `requirements.txt` states it outright, and the HTTP layer is built on
   `urllib.request` from the standard library. Nothing is pulled from PyPI at install or run time,
   which removes an entire supply-chain surface most scraping tools carry.
2. Secret handling is deliberate: query parameters matching key, token, secret, password, or auth are
   replaced with `***` before any debug line is written (http.py:44-58), and the loader warns you when
   your own config file is too readable (env.py:32-43).
3. Every credential is optional and named. Four platforms work with no key at all, and the readiness
   hook tells you exactly how many sources are currently available and which variables would unlock
   the rest.
4. Browser mode has two independent off switches (absent Playwright, or `LAST30DAYS_DISABLE_BROWSER=1`)
   and never touches your existing browser profile.
5. Honest release notes and disclaimers: the README documents anti-bot fixes, removed integrations
   that did not work, and a legal disclaimer users must read, rather than claiming universal coverage.
6. The test suite is real, 36 files including dedicated XSS, anti-bot, and cache tests, and the
   release checklist reports the actual pass count.

## 10. Residual risks

1. Cookie files. If you ever complete a login inside the automated browser, that session token is
   sitting in `~/.config/last30days-cn/browser_cookies/` in plaintext. Delete the directory when you
   are done, or `chmod 700` it.
2. No pinned install. `git clone` gives you the branch tip; re-verify after every pull, because there
   is no version or checksum to compare against.
3. Legal exposure is yours. Scraping Weibo, Xiaohongshu, Zhihu, and Douyin at speed can violate their
   terms regardless of what this repository's disclaimer says.
4. It is not a DSH plugin. If you install it, you are placing an agent skill in a shared skills
   directory, not mounting a Harness bundle; do not expect DSH lifecycle, profile, or permission
   integration.
5. Reports embed third-party content into HTML. Escaping is applied and tested, but any renderer
   that ingests hostile remote text is a surface worth watching across versions.

## 11. Re-verify steps

1. Re-run step 7 against current HEAD. Any appearance of `subprocess`, `os.system`, `eval(`, or a
   `pip install` call in `scripts/` invalidates this adjudication outright.
2. Re-generate the URL inventory (step 5). Any host outside the eight named platforms plus Bing,
   in particular any host that is not a platform at all, is a re-audit trigger.
3. Check whether `crawler_bridge.py` gains `user_data_dir` or `launch_persistent_context`. Either
   would mean it is driving your logged-in browser profile rather than a fresh one, which is a
   materially different privacy posture and a likely grade drop.
4. Watch for a permission guard appearing on the cookie directory; if cookies gain `0600` handling or
   OS keychain storage, DAT-CRED-1 downgrades.
5. If upstream adds a real DSH manifest (`cordis.patch.yml` plus a `dsh` bundle key), this card needs
   a fresh pass: the DSH mount surface would be entirely unreviewed by this revision.
6. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
