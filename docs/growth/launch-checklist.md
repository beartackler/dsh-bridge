# Launch Checklist - dsh-bridge

Prepared 2026-08-26. Sources: README.md, docs/growth/show-hn-draft.md,
docs/growth/reddit-launch-kit.md, docs/growth/tracking.md,
docs/catalog/INDEX.md, docs/research/e2e-verification.md, plus live checks
against github.com/beartackler/dsh-bridge and
beartackler.github.io/dsh-bridge performed on 2026-08-26. Nothing here is
invented; every number traces to one of those sources.

## 0. Go/no-go gates

Two items block any posting. Fix them first; they are README edits, not code.

1. **Stale command status.** README line 51 says "Status of all sixteen:
   spec, not implemented" and the command table lists 16 commands. The e2e
   verification (docs/research/e2e-verification.md) shows 17 `/bridge-*`
   commands implemented and passing (the 17th is `/bridge-refactor`, absent
   from the README table). Update the README before any post mentions
   working commands, otherwise the repo contradicts its own launch copy.
2. **Stale milestone table.** README Status section still lists
   "MVP plugin (commands, connectors): next". Same fix, same reason.

Gate decision the owner must make explicitly: the Reddit kit's do-not item 4
says nothing posts until the documented install command works on a clean
machine. The install command is still not functional (README line 39). Two
paths: (a) hold every post until the installer ships, per the kit default;
or (b) post now with the honest-status sentence (section 1, row 3) carried
verbatim in every post. Either is defensible; silence about the installer is
not.

## 1. Verify-list (checked 2026-08-26)

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | CI green | PASS. All three workflows succeeded on main: CI, Docs Lint, Deploy site to Pages (run created 2026-08-26T06:55:23Z, conclusion success). | GitHub Actions API, runs query on main |
| 2 | Pages live | PASS. https://beartackler.github.io/dsh-bridge/ serves the catalog page (HTTP 200) and `site/data.json` loads (HTTP 200) with exactly 24 rows: 7 B, 16 C, 1 D. Matches docs/catalog/INDEX.md line-for-line. The tracking.md caveat that the URL may 404 is obsolete; pages.yml deploys on push to main. | Live fetch of index.html and data.json |
| 3 | Install command honest status | NOT FUNCTIONAL. `dsh plugin --profile web add github:beartackler/dsh-bridge` (README line 36) is "the target shape"; README line 39: "Not yet functional... Specs and audits are real today; the runtime is not." Required sentence for every post: "Not yet installable through DSH's plugin command; the code, specs, and all 24 audits are in the repo today, and the 17 commands have been verified end-to-end against DSH 0.1.1-rc.2." | README.md:33-39 |
| 4 | Demo GIF wired in README | PASS. README line 17 embeds `site/demo/connect-demo.gif`; file exists on disk alongside four stills (connect-matrix dark/light, trust-card dark/light). Mandatory label wherever shared: "Rendered from the specs rather than a running build" (README line 19). Never call it a screen recording. | README.md:17-21, ls site/demo/ |
| 5 | Catalog size | 24 graded rows in docs/catalog/INDEX.md: 0 A, 7 B, 16 C, 1 D, 0 F (INDEX line 52). Star snapshot behind the catalog checked 2026-08-19 (INDEX line 54). 34 card files exist in docs/catalog/cards/; 24 are indexed, 10 are not yet (distilly, dsh-agent-teams, dsh-vision-router, hindsight, learn-harness-engineering, picgo, reactive-resume, reasonix, voyager, weknora). Publicly say "24 audited plugins", never 34. | INDEX.md, disk listing |
| 6 | Commands e2e-verified | All 17 `/bridge-*` commands pass: 42 invocations against the real CommandRuntime in @deepseek-ai/dsh 0.1.1-rc.2, Node v26.0.0, profile web via --patch overlay, 2026-08-26. Four bugs found and fixed during the run; unit suite 252/252 green before and after. 15 of 17 commands exercised with at least two argument forms. Named residual gap: CommandRuntime.execute() session-event seam untested; no test drives parseArgs from raw command lines. Cite the doc, not a paraphrase. | docs/research/e2e-verification.md |
| 7 | Concrete numbers safe to quote | 24 audited plugins (7 B / 16 C / 1 D); 17 commands, 42 invocations, 252/252 tests; 2,189 entries in the browsable market index (/bridge-browse, e2e row 16); 11 provider rows detected with masked secrets (/bridge-connect, e2e row 3); example D-grade finding: ruflo/claude-flow (69,420 stars) silently npm-installs patch updates at every startup (INDEX row, cards/ruflo.md). Example B-grade card: @liustack/modlens, the README hero. | INDEX.md, e2e doc |

## 2. Show HN - final

**Title (final):** `Show HN: Dsh-bridge – trust reports for DeepSeek Harness plugins`

Rationale: claims exactly what ships today (published trust reports), makes
no claim about interactive tooling you cannot install yet. Draft option #2
("audit a DSH plugin before you install it") remains an approved alternate;
it is supportable through the public catalog but slightly stronger than the
delivery surface warrants.

**Post text (post as-is once the gate in section 0 is decided):**

> Plugins in DeepSeek Harness are arbitrary code: models, tools, sessions,
> and storage all load as plugins, and there was no systematic way to vet one
> before running it.
>
> dsh-bridge is a trust layer for that ecosystem. What exists today, all in
> the repo:
>
> - A published catalog of 24 audited community plugins (7 graded B, 16 C,
>   1 D), including repos with tens of thousands of stars. Every verdict is a
>   report card citing file-and-line evidence against a pinned commit, with
>   copy-pasteable commands to re-check it. One D-grade finding: a popular
>   CLI silently npm-installs updates at every startup.
> - Seventeen familiar slash commands (/model, /review, /mcp, /resume...)
>   ported from Claude Code, Codex CLI, OpenCode, and Jcode. All 17 passed
>   end-to-end invocation inside a live DSH 0.1.1-rc.2 harness; 252/252 unit
>   tests stayed green.
>
> Honest limits: grading is heuristic, not proof, and will miss novel
> obfuscation. The one-line installer is not finished, so today you read the
> audits rather than run the tooling.
>
> Built by an agent swarm under human review, disclosed because a trust
> product hiding its provenance would be a bad joke. Pick any card and try
> to break a citation.

**First comment:** substantive addendum, not thanks. Link docs/catalog/INDEX.md
plus one full card (modlens as the B-grade example, ruflo as the D), and
docs/trust/pipeline-architecture.md for the method. Invite people to run the
"verify this yourself" commands from any card and report mismatches.

## 3. Subreddit finals

Common blocks that appear in every body (do not vary between subs):
disclosure of agent-swarm development with human review gates; "MIT; not
affiliated with DeepSeek"; the honest-status installer sentence from section 1
row 3. Never promise subscription OAuth; the connectors flow detects API keys
the user owns and configures them locally (charter line, kit do-not 5).

### 3a. r/deepseek - Day 2-3 after HN

**Title:** `dsh-bridge: familiar slash commands and a 24-plugin verified catalog for DeepSeek Harness`

> DeepSeek Harness's architecture deserves a bigger English-speaking audience,
> and new arrivals hit three walls: language, unfamiliarity, and a plugin
> ecosystem that is hard to vet. dsh-bridge attacks all three as a single MIT
> plugin.
>
> - Familiar-face commands for people arriving from Claude Code, Codex CLI,
>   OpenCode, or Jcode: /help, /model, /status, /memory, /resume, /mcp,
>   /review, mapped onto DSH-native seams. All 17 commands have been invoked
>   end-to-end inside a live DSH 0.1.1-rc.2 harness, 42 invocations, with
>   the unit suite at 252/252.
> - A verified catalog: 24 community plugins audited so far (7 B, 16 C, 1 D),
>   every verdict a report card with file-and-line citations against a pinned
>   commit and commands to re-verify it yourself. The market index it browses
>   holds 2,189 entries.
> - Credential detection that finds what is already on your machine and
>   renders it masked (11 providers in the current matrix); smoke-tests
>   degrade gracefully rather than fake a result.
>
> Scope notes: we duplicate nothing DSH does natively, we never touch
> first-party subscription OAuth, no telemetry without opt-in. The installer
> command is the last piece; everything above is readable and re-runnable in
> the repo today. Development is a mixed-model agent swarm with human review
> gates; artifacts land in docs/ as produced. If you maintain a plugin and
> want it audited, the queue is open.

### 3b. r/ClaudeAI - Day 4-5

**Title:** `I ported Claude Code's slash-command muscle memory onto DeepSeek's open-source harness (MIT)`

(Dropped the kit's `.claude/commands` and `hooks.json` title variants: those
claims are not backed by any verification artifact I could find. Only
verified behavior goes in.)

> Like a lot of you I live in Claude Code: /init on a fresh repo, Shift+Tab
> for plan mode, /compact and /resume and /memory on reflex. DeepSeek recently
> open-sourced their harness (MIT), and everything is a plugin down to
> sessions and sandboxes, but for an English speaker everything is also
> unfamiliar.
>
> So I built dsh-bridge, a plugin that maps the reflexes: /help, /model,
> /status, /compact, /resume, /memory, /mcp, /review, plus /init and a
> /suggest that scaffolds the plugin that does not exist yet. All 17 commands
> were driven end-to-end in a real DSH 0.1.1-rc.2 runtime; where something
> cannot run (no model route mounted, no compaction hook), the command says
> so instead of pretending.
>
> The part that grew out of it: DSH plugins are arbitrary code and the
> ecosystem is mostly low-star repos. dsh-bridge ships a catalog where every
> recommendation passes an adversarial security review published as a
> readable trust report card citing file-and-line evidence. 24 plugins graded
> so far.
>
> Full transparency: built by an agent swarm (mixed models doing research,
> red-team audit, implementation) with human review gates; I am the human in
> the loop. MIT; not affiliated with DeepSeek. The installer is the last
> unbuilt piece; the audits and the command code are in the repo now. If a
> command behaves differently than Claude Code's, tell me and it goes in the
> migration table.

### 3c. r/LocalLLaMA - Day 7-8

**Title:** `Every plugin we recommend passes an adversarial security review first: 24 DeepSeek Harness plugins audited, every verdict cites file:line`

> DeepSeek Harness (MIT) has a plugin architecture where everything is a
> plugin: tools, skills, session storage, sandboxing. Powerful design, one
> problem: installing a plugin means running arbitrary code from a repo with
> two stars and a README you cannot parse.
>
> dsh-bridge targets that gap. Before any community plugin is recommended it
> goes through static analysis plus behavioral heuristics: network egress,
> credential access paths, lifecycle hooks, dynamic eval, obfuscation
> signals. Output is a public trust report card: grade plus evidence with
> file-and-line citations, stored in-repo so the claim stays auditable. 24
> plugins graded to date: 7 B, 16 C, 1 D, zero A (nothing has cleared full
> reproducibility yet), zero F. Sample finding behind the only D: a 69k-star
> CLI silently npm-installs patch updates at every startup.
>
> Honest limitations: the heuristics are a tripwire, not a proof; a determined
> attacker with novel obfuscation can beat static analysis, which is why each
> card publishes its method and its misses. Model routing is plain local
> config pointing wherever you want, local or remote; no telemetry without
> opt-in.
>
> Disclosure: built by an agent swarm, deliberately with the auditor on a
> different model than the author of the code being audited, human review
> gates between waves. If you can get a malicious-looking plugin past the
> grader, that becomes a public postmortem.

### 3d. r/ChatGPTCoding - Day 9-10

**Title:** `Coming from Codex or Claude Code: I ported /review, /mcp management, and /improve onto DeepSeek's open-source harness, verified end-to-end`

(Kit variants claiming --full-auto/--yolo flag parity and headless JSON are
cut: no verification artifact backs them.)

> Quick context: DeepSeek released an MIT-licensed coding harness. Solid
> kernel, unfamiliar surface. dsh-bridge is a plugin that translates the
> parts you already type:
>
> - /review: real git diff in, findings out with file:line citations. In the
>   e2e run it targeted a 3-file worktree diff correctly.
> - /improve --diff: audits changed files; the verification pass caught and
>   fixed three real bugs here (it was auditing $HOME, mis-resolving paths,
>   and dropping the --diff value), which is why the end-to-end run matters.
> - /mcp import-from claude: reads ~/.claude.json read-only and shows
>   per-server import decisions instead of YAML surgery.
> - /browse: searchable index of 2,189 ecosystem entries with grade filters.
> - Connectors: detects existing credentials on disk and renders them masked;
>   it configures API keys you own and will not replay subscription OAuth.
>
> Everything above comes from a 42-invocation end-to-end verification against
> DSH 0.1.1-rc.2 with the unit suite at 252/252. Trust layer: 24 community
> plugins audited with public report cards citing file:line.
>
> Disclosure: built by a mixed-model agent swarm under human review gates;
> the whole dev process is in-repo. MIT; not affiliated with DeepSeek. The
> installer command is not wired yet; the code and audits are readable today,
> and a broken flag spelling is a translation-table bug we want filed.

## 4. Posting order and timing

All times US Eastern. Weekday mornings catch EU evening plus US East morning.

| Slot | When | What |
|---|---|---|
| Day 0 | Tue-Thu, 08:00-10:00 ET | Show HN. Avoid Fridays, weekends, US holidays, and any major model-launch news day. |
| Day 2-3 | Wed-Thu, 09:00-11:00 ET | r/deepseek (friendly home crowd shakes out install bugs first). |
| Day 4-5 | within Tue-Thu window | r/ClaudeAI. |
| Day 7-8 | Tue-Thu window | r/LocalLLaMA. |
| Day 9-10 | Tue-Thu window | r/ChatGPTCoding. |

Rules inherited from the kit and HN draft, restated as hard constraints:
Reddit wave starts 2+ days after HN, never simultaneous; never two subs the
same day; avoid Mondays and Friday afternoons; if any thread gains traction,
hold remaining slots until it cools (~48h); the poster must be free for ~3
hours after each submit, and ~4 hours after the HN post. Do not schedule a
slot you cannot staff. Re-check each subreddit's self-promotion and
account-age rules on posting day; skip a sub rather than skirt its rules.

## 5. First-24h engagement plan

- Staffing: replies within minutes while sort is "new"; HN poster stays ~4h,
  Reddit posters ~2-3h minimum.
- First HN comment is a substantive addendum (example audit links), never
  thanks. Do not ask for upvotes anywhere.
- Engage the harshest technical critic first; a substantive public exchange
  with a skeptic outweighs twenty friendly comments.
- Reply style: short, specific, evidence-linked. Admit unknowns plainly
  ("not supported yet; deferred past MVP"). Link artifacts
  (SECURITY.md, pipeline-architecture.md, a named card) instead of using
  adjectives.
- Bug in thread: acknowledge, ask for /doctor output, fix, then edit the
  original post with a changelog line crediting the reporter.
- Convert recurring questions into repo docs and answer with the link.
- Mid-wave, publish one additional adversarial audit and drop it as a comment
  in the most active thread (fresh linkable content, no new post).
- Log threads, objections, and outcomes afterward in docs/growth/launch-log.md
  (future file) and append a row via scripts/star-snapshot.mjs daily during
  launch week; clones and referrers are the leading indicators (tracking.md).

**Swarm-provenance answers (pre-written, use verbatim in spirit):**

- To "this is agent-written slop": "Mostly yes, and the repo says so on the
  badge and in Provenance. The gate is cross-model review: the auditor runs
  on a different model than the author of what it reviews. Rather than argue,
  pick any audit and check one file:line citation; the cards end with
  copy-pasteable commands to reproduce the headline claims."
- To "why should agents write security code": "That concern is exactly why
  author-auditor model separation is enforced and why every report is written
  to be human-checkable. The failure mode we fear is a wrong citation, and
  the repo treats a mismatched citation as a bug report."
- To "is this just AI marketing": point at the honest-status installer
  sentence and the zero-A distribution: the catalog grades nothing A yet and
  published a D against a 69k-star repo, which marketing would not do.

## 6. Do-not list

1. No vote manipulation: no alt accounts, no asking friends, Discord, or
   coworker swarms, no vote rings, no purchased upvotes.
2. No astroturfing: one voice, the project account, clearly labeled. Praise
   only from real users who found it organically.
3. Never hide or minimize agent-swarm provenance; it appears in every post.
4. No vaporware or hype: nothing posts before the section 0 gate decision;
   no "coming soon" teasers; no implying the installer works.
5. No subscription-auth promises: never imply Claude or ChatGPT plans work
   inside DSH; owned API keys only.
6. No affiliation claims: "not affiliated with DeepSeek" wherever it could
   be assumed; vendor names appear descriptively only.
7. No invented numbers: every figure comes from section 1; say 24 audited
   plugins, not 34 cards; do not round 69,420 stars or upgrade a C to "safe".
8. Grades are evidence-backed opinions over one pinned commit, never
   "verified safe"; the demo GIF is always labeled as spec-rendered, never
   shown as a recording of the running product.
9. No identical crossposts; each sub gets its own tailored draft.
10. No rule-skirting, modmail pressure, or repost-to-evade; accept removals.
11. No trash-talking other harnesses, DSH core, or competing curation lists.
12. No unsolicited DMs, no deleting critical comments, no silent edits;
    corrections get changelog edits.
13. Do not post if CI or Pages regresses: rerun the section 1 checks (rows
    1-2) on the morning of each slot.
