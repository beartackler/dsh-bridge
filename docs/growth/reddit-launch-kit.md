# Reddit Launch Kit — dsh-bridge

> Prepared for the v1 launch wave. **Nothing in this document has been posted.** Every draft below is held until the install command (`dsh plugin --profile web add github:beartackler/dsh-bridge`) actually works end-to-end. No vaporware posts.

**Ground rules baked into every draft:**

1. **Single identity.** All posting and commenting happens from `u/beartackler` (or whatever the project account ends up being). No alt accounts, ever.
2. **Agent-assisted disclosure.** dsh-bridge is built by a mixed-model agent swarm. This is disclosed in the body of every post, phrased as what it is, not hidden in a footnote. On r/ClaudeAI and r/ChatGPTCoding this is itself interesting content; hiding it would be fatal if discovered.
3. **No affiliation claims.** "Not affiliated with DeepSeek" appears wherever it could plausibly be assumed otherwise.
4. **Never promise subscription OAuth.** We detect existing credentials and configure API keys the user owns. We do **not** port Claude-subscription or ChatGPT-plan login into DSH — that's a licensing line the charter forbids crossing, and any post implying "use your Claude Max sub inside DSH" would be both false and a takedown magnet.

---

## 1. Subreddit-by-subreddit drafts

### 1a. r/ClaudeAI — angle: muscle-memory migration story

**Why this angle:** r/ClaudeAI readers are emotionally invested in Claude Code's UX. The hook is not "DeepSeek Harness exists," it's "everything your hands know still works." Lead with `.claude/commands` compatibility and the hooks moment; the model underneath is secondary to them. Do not lead with price/model-quality comparisons — that reads as a switch campaign and gets hostility.

**Title variants (pick one at post time):**

1. *I built a plugin that gives DeepSeek Harness Claude Code's muscle memory — your .claude/commands, hooks, and slash reflexes just work*
2. *You can keep typing `/compact`, Shift+Tab, and `--dangerously-skip-permissions`: I ported Claude Code's command surface into another harness*
3. *Missed feature: I made a migration bridge so Claude Code users can try DeepSeek's open-source harness without relearning anything*

**Post draft:**

> Like a lot of you I live in Claude Code: `/init` on a fresh repo, Shift+Tab for plan mode, `claude -c` to pick up yesterday's thread, `.claude/commands/*.md` full of little rituals I've forgotten how I worked without.
>
> DeepSeek recently open-sourced their harness (MIT). It's genuinely impressive under the hood — everything is a plugin, down to sessions and sandboxes — but for an English speaker it felt like moving into an unfurnished apartment in a country where I don't speak the language. Nothing was *wrong*. Everything was *unfamiliar*.
>
> So I built **dsh-bridge**, a plugin whose entire job is to make DSH feel like home:
>
> - `/help`, `/model sonnet`, `/clear`, `/resume`, `/compact`, `/memory`, `/mcp` — the commands you type on reflex, mapped onto DSH-native seams
> - Your existing `.claude/commands/**/*.md` files load directly, `$ARGUMENTS` substitution included — you bring your rituals with you
> - Your existing Claude Code `hooks.json` keeps working (DSH has native CC-hook support; the plugin detects it during onboarding and tells you, instead of silently duplicating it)
> - A `/login`-style connectors wizard that finds credentials you already have on disk, configures routes, and smoke-tests them. To be explicit about what it does **not** do: it will never impersonate Claude's OAuth flow or touch your subscription auth. API keys you own, detected and configured locally, nothing printed, nothing exfiltrated.
>
> One more thing that grew out of this: DSH plugins are arbitrary code, and the community ecosystem is mostly low-star repos you can't vet. dsh-bridge ships a verified-plugin catalog where every recommendation passes an adversarial security review, published as a human-readable trust report card citing file-and-line evidence. You can audit our verdicts.
>
> **Full transparency:** this project is built by an agent swarm (mixed models doing research → red-team audit → implementation, with human review gates). I'm the human in the loop; happy to talk about how that works in practice.
>
> Repo: <github link> · MIT · not affiliated with DeepSeek. If you try it and something feels off — a command behaves differently than Claude Code's, an alias is missing — tell me and I'll add it to the migration table. That table is the product roadmap.

**Anticipated top questions (prepare answers before posting):**
- "Why leave Claude Code at all?" → Answer honestly: we're not telling anyone to leave; DSH runs DeepSeek models cheaply/local-first options, and some people want a second harness. The bridge exists because friction, not ideology.
- "Does my Claude subscription work in it?" → No, and we won't build that. Point to the licensing note above.
- "Is this safe to install?" → Link the trust report card for dsh-bridge itself once the pipeline ships; until then point at SECURITY.md and the no-dynamic-eval rule.

---

### 1b. r/LocalLLaMA — angle: self-hosted trust angle

**Why this angle:** This crowd's core values are ownership, verifiability, and distrust of black boxes. The hero here is the **trust report card**: "plugins are arbitrary code, so we prove they're harmless before recommending them." Muscle memory is a footnote here; evidence citation is the story. Second hook: no telemetry, no undocumented network calls, everything auditable in-repo.

**Title variants:**

1. *Every plugin we recommend passes an adversarial security review first: dsh-bridge, a trust layer for DeepSeek Harness's plugin ecosystem*
2. *Plugin marketplaces are arbitrary code with a star count attached. I built a catalog where each plugin ships with a security report card citing file:line evidence*
3. *dsh-bridge: verified plugins, guided credential setup, zero telemetry — making DeepSeek Harness usable for people who read the source before they run it*

**Post draft:**

> DeepSeek Harness (MIT) has a plugin architecture where *everything* is a plugin: tools, skills, session storage, sandboxing, UI. Powerful design, one problem: installing a plugin means running arbitrary code from a repo with two stars and a README you can't fully parse.
>
> That's the gap **dsh-bridge** targets. It's a plugin for DSH with three parts relevant to this sub:
>
> **1. Verified catalog with adversarial review.** Before any community plugin is recommended, it goes through static analysis plus behavioral heuristics — network egress, credential access paths, lifecycle hooks, dynamic eval (`new Function`, `eval`, `child_process`), obfuscation signals. The output is a public trust report card: grade + evidence with file-and-line citations, stored in-repo so the claim is auditable after the fact, not just asserted at install time. If we grade something B and you disagree, the evidence chain is right there.
>
> **2. Local credential handling that respects paranoia.** The connectors wizard detects credentials already on your machine (`~/.codex/auth.json`, opencode auth, env vars), wires model routes in local config, smoke-tests, and prints nothing. No telemetry without opt-in. No network calls except the documented ones. Your machine stays yours.
>
> **3. Self-hosted-friendly setup.** Model routing is plain config (`cordis.patch.yml` per profile) — point it at whatever endpoint you run, local or remote. The plugin doesn't care and doesn't phone home about it.
>
> Honest limitations: the behavioral heuristics are a tripwire, not a proof — a determined attacker with novel obfuscation can beat static analysis, which is why every report publishes its method and its misses. And the whole thing is built by an agent swarm (research → adversarial audit → code, human review gates between waves); the audits themselves are produced by a different model than the one that wrote the code being audited, deliberately. Disclosing that upfront because this community rightly asks.
>
> Repo: <link> · MIT · not affiliated with DeepSeek. The audit pipeline is the part I'd most like this sub to red-team — if you can get a malicious-looking plugin past our grader, that finding becomes a public postmortem.

**Comment-seeding prep specific to this sub:**
- Have the actual grader methodology written up somewhere linkable before posting; this sub punishes hand-waving.
- Expect "why not just read the code yourself?" → answer: scale (ecosystem > what one person reads) + consistent evidence format beats ad-hoc reading; also the reports double as docs.
- Expect skepticism about agent-written security code → lean in: that's exactly why author-auditor model separation is enforced, and why reports are human-readable so humans can spot-check.

---

### 1c. r/ChatGPTCoding — angle: tooling angle

**Why this angle:** This audience thinks in workflows, flags, and scripts. They care that `codex exec`, `--full-auto`, `/review`, and headless JSON output survive the move, and that MCP servers become manageable without YAML surgery. Frame it as "another tool in the drawer," not a conversion pitch — nobody here wants to be told to switch stacks.

**Title variants:**

1. *Codex refugees: I built a plugin that ports your CLI reflexes (`/review`, `codex exec`, `--full-auto`, `codex mcp add`) onto DeepSeek's open-source harness*
2. *dsh-bridge — permission presets that speak Codex (`--yolo`, `--ask-for-approval`), markdown custom commands, and an `/mcp` manager for DeepSeek Harness*
3. *Made a bridge layer so switching harnesses doesn't mean rewriting your scripts, flags, and muscle memory*

**Post draft:**

> Quick context: DeepSeek released an MIT-licensed coding harness ("DeepSeek Harness"). Solid kernel, unfamiliar surface — if you come from Codex CLI, nothing is where your fingers expect it.
>
> **dsh-bridge** is a plugin that translates. What you get as a Codex person specifically:
>
> - **Flag vocabulary parity.** `--full-auto`, `--yolo`, `--ask-for-approval`, `--sandbox read-only` map onto DSH's permission presets, scary names kept scary on purpose. Plan mode lands on Shift+Tab like you'd expect.
> - **Headless parity.** One-shot non-interactive mode with familiar flag spelling and stdout JSON, so scripts you already wrote mostly survive.
> - **`/review`.** Diff-in, findings-out with `file:line` citations — the rubric demands evidence per finding, which is the house style.
> - **`/mcp` management.** DSH's MCP client is config-file-only today. Bridge adds list/add/remove/test from the chat prompt instead of hand-editing `cordis.yml`.
> - **Custom commands as markdown.** Your `.opencode/command/*.md` trees load with argument substitution; `.claude/commands` too if you straddle ecosystems.
> - **Connectors wizard.** Detects `~/.codex/auth.json` or env keys, sets routes, smoke-tests. Note the boundary: it detects and configures API keys you own; it does not and will not replay ChatGPT-plan OAuth into another client — that's licensed to Codex itself.
> - **Trust layer (the part I'm proudest of):** community plugins pass an adversarial security review before we recommend them; every verdict is a public report card with file:line evidence.
>
> Disclosure: built by a mixed-model agent swarm under human review gates — the whole dev process is in-repo if you want to watch agents red-team each other's work.
>
> Repo: <link> · MIT · not affiliated with DeepSeek. If a flag spelling or script shape breaks, that's a bug in the translation table — file it and it goes in the compat matrix.

---

### 1d. r/deepseek — angle: making DSH feel like home for English speakers

**Why this angle:** This sub includes the people who *want* DSH adoption to succeed. Frame dsh-bridge as ecosystem infrastructure and a gift to the Cordis team's MIT groundwork, not as a criticism of DSH's UX. Tone: gratitude, contribution, "here to make the English-speaking funnel work."

**Title variants:**

1. *dsh-bridge: a plugin that welcomes Claude Code / Codex / OpenCode users into DeepSeek Harness — familiar commands, guided setup, verified plugins*
2. *Built ecosystem glue for DSH: English-first plugin catalog with security report cards + migration commands for devs coming from other harnesses*
3. *[Release] dsh-bridge v1 — help international users feel at home in DeepSeek Harness*

**Post draft:**

> DeepSeek Harness's architecture deserves a bigger audience than it's getting in the English-speaking world, and the bottleneck isn't quality — it's that new arrivals hit three walls at once: language, unfamiliarity, and a plugin ecosystem that's hard to vet.
>
> **dsh-bridge** attacks all three, as a single MIT plugin:
>
> - **Familiar-face commands** for people arriving from Claude Code, Codex CLI, OpenCode, or Jcode: `/help`, `/model`, `/login`-style guided provider setup with credential detection and smoke tests, `/resume`, `/memory`, `/mcp` — all mapped onto native capability seams rather than reimplemented on top of hacks.
> - **English-first, curated discovery** with quality and trust tiers, real screenshots, and one-command install.
> - **A trust layer:** every recommended community plugin passes an automated adversarial security review, published as a readable report card with file-and-line evidence. Plugins are arbitrary code; adoption needs a way to *prove* harmlessness, not vibes.
> - **License hygiene and attribution** throughout — the ponytail-port pattern, upstream MIT credited.
>
> Deliberate scope notes so nobody worries: we don't reimplement anything DSH already does natively (hooks, compaction, themes, image input are documented, not duplicated); we never touch first-party subscription OAuth; no telemetry without opt-in; no network calls beyond documented ones.
>
> Transparency: development is done by a mixed-model agent swarm (research → adversarial audit → implementation) with human review gates; artifacts land in the repo's `docs/` as they're produced.
>
> Repo: <link>. Not affiliated with DeepSeek — built with genuine gratitude for the Cordis team's MIT groundwork. Feedback welcome, PRs welcome, and if you maintain a plugin and want it audited for the catalog, that queue is open.

---

## 2. Comment-seeding plan (genuine engagement, no astroturfing)

The word "seeding" here means **preparing to converse**, not planting fake voices. There is exactly one voice in this campaign: the project account. Anything else is astroturfing and will eventually be exposed, killing the trust positioning that is literally the product.

### 2a. Before any post goes live

- **Pre-write answers** to the 10 most likely questions (safety, "why not just use X," subscription auth, Windows support, model quality, agent-swarm skepticism) and keep them in a private doc. Answers cite evidence (`docs/research/portable-features.md`, report cards) rather than adjectives.
- **Have receipts linkable:** SECURITY.md, at least one real trust report card, the compat/migration table, and the CONTRIBUTING page live before post #1. Every claim in the posts above resolves to a repo artifact.
- **Check each subreddit's rules on the day:** self-promotion frequency limits, minimum account age/karma where enforced, and whether a text-post-only rule applies. If a sub forbids this kind of post, we skip that sub. No exceptions, no modmail begging.

### 2b. During the first hours (this is the whole game)

- Poster stays online for **at least 2 hours** post-submit; replies within minutes while the sort is "new," since early reply rate strongly affects whether a post survives sorting into visibility.
- Reply style: short, specific, evidence-linked. Admit unknowns plainly ("not supported yet; it's L-sized, deferred past MVP" beats a vague maybe).
- **Engage the harshest technical critic first.** A substantive public exchange with a skeptic is worth more than twenty friendly comments, and it's exactly the behavior a trust-focused project should model.
- If someone reports a bug in-thread: acknowledge, ask for `/doctor` output, fix, then **edit the original post with a changelog line** ("edit: X fixed in v1.0.1, thanks u/_").
- Never delete a critical comment. Downvote nothing. Mod-actions nothing unless it's literal spam.

### 2c. Ongoing (week 1–4)

- **Stagger the four posts** (see timing below); treat each thread as a living FAQ and keep answering for a week, not a day.
- Convert recurring questions into repo docs and reply with the link — every thread should leave permanent artifacts behind.
- Publish **one additional adversarial audit mid-wave** and drop it as a standalone comment in the most active thread: fresh linkable content re-energizes attention without a new post.
- If a thread gets traction (>~200 upvotes), consider a follow-up "how we audit plugins" deep-dive post 2+ weeks later rather than reposting the same pitch.
- Log every engagement (thread, date, notable objections, what converted) in `docs/growth/launch-log.md` afterward so the next wave starts smarter. (This log is a future file, not created now.)

### 2d. Hard lines

- No second account, no friend/coworker/Discord coordinated upvoting, no "can you bump this" anywhere.
- No posting as an enthusiastic anonymous user ("just tried this, amazing!"). Praise may only come from real users who found it organically.
- No disparaging other harnesses or the DSH core team; the product story is additive, not comparative-warfare.
- No engagement farming with rage bait or manufactured controversy.

---

## 3. Timing

All times US Eastern. Rationale: weekday mornings catch the EU evening + US East morning overlap, which historically carries dev-subreddit traffic through the day.

| Post | Sub | Recommended window | Stagger |
|---|---|---|---|
| 1 | r/deepseek | Tue–Wed, 8–10am ET | Day 0 |
| 2 | r/ClaudeAI | Wed–Thu, 9–11am ET | Day 2–3 |
| 3 | r/LocalLLaMA | Tue–Thu, 9–11am ET | Day 5–7 |
| 4 | r/ChatGPTCoding | Tue–Thu, 9–11am ET | Day 8–10 |

Notes:

- **r/deepseek goes first** as the friendly home crowd: it shakes out install bugs and produces early real-user quotes (organically obtained) that de-risk the bigger threads.
- **Never two subs the same day.** Identical-content crossposts within hours look like a spam campaign and invite removals.
- **Avoid Mondays** (mod queues + weekend backlog) and **Fridays after noon ET** (traffic cliff).
- **Coordinate with Show HN:** if a Show HN is planned, run Reddit wave 2+ days *after* HN, not simultaneously — simultaneous multi-platform pushes read as a marketing blitz, and HN commenters check post histories.
- Each poster must be free for the following ~3 hours after submitting. Don't schedule a launch slot you can't staff.
- If a post gains traction, hold remaining scheduled posts until that thread cools (~48h) rather than splitting attention.

---

## 4. Do-not list (non-negotiable)

1. **No vote manipulation.** No alt-account upvoting, no asking friends, family, Discord servers, or coworker swarms to vote. No vote-sharing rings, no purchased upvotes, no "exchange" communities.
2. **No astroturfing.** No persona accounts posing as independent users. All engagement from the single project account, clearly labeled.
3. **Disclose agent-assisted development.** Every post and the project account's profile state that the project is built by a mixed-model agent swarm with human review. No deleting or minimizing this when inconvenient.
4. **No pre-launch hype.** Nothing is posted until the documented install command completes successfully on a clean machine. No "coming soon" teaser posts.
5. **No subscription-auth promises.** Never imply Claude/ChatGPT subscription plans can be reused inside DSH. First-party OAuth flows belong to first-party clients; the bridge detects owned API keys only.
6. **No affiliation claims.** Always "not affiliated with DeepSeek." Never imply endorsement by DeepSeek, Anthropic, OpenAI, or any harness vendor. Names like "Claude Code" appear only descriptively.
7. **No fabricated metrics or testimonials.** No invented star counts, benchmark numbers, user counts, or quotes. Every number traces to a repo artifact.
8. **No identical crossposts.** Each subreddit gets its tailored draft; no copypasta blasts.
9. **No rule-skirting.** If a subreddit's mods remove a post or its rules prohibit it, accept and move on. No modmail pressure campaigns, no repost-to-evade.
10. **No trash-talking.** Not other harnesses, not DSH itself, not competing curation efforts (awesome-dsh-plugin et al. are cited respectfully as demand evidence).
11. **No secret-scraping engagement tricks.** No DM-blasting users who comment elsewhere about DSH; unsolicited DMs are spam.
12. **No deleting critical comments or editing away mistakes silently.** Corrections get changelog edits; criticism gets answered.

---

*Owner: growth analyst role · Review before each wave · This kit contains nothing posted and authorizes nothing to be posted automatically.*
