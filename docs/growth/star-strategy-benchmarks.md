# Star Strategy Benchmarks & Playbook — dsh-bridge

> Growth analyst wave output. Evidence-based ranking of star-acquisition tactics, calibrated to
> the CHARTER mission ("the repo collects as many GitHub stars as possible") and to dsh-bridge's
> actual position: an English-first trust/compat layer on a *rising, early* platform (DSH developer preview).

---

## 1. Benchmarks: what the data actually says

### 1.1 Awesome lists / curation repos

| Repo | Stars | What it proves |
|---|---|---|
| `awesome-dsh-plugin` | 12.6k (per CHARTER, verified) | Enormous latent demand for **curation** in the DSH ecosystem — and it is a plain list with no trust layer. This is our beachhead signal. |
| `punkpeye/awesome-mcp-servers` | tens of thousands | Curating a *new protocol's* ecosystem is the single highest-ROI repo archetype of 2024-2026. Early + comprehensive wins. |
| `awesome-codebase-intelligence` | 2.5k in 6 months, solo maintainer | A *narrow, well-defined* niche list with weekly updates and 48h PR response beats a broad one. Plateau at 100-200 stars is the default outcome; consistency is what breaks the plateau. |
| MCP ecosystem overall | 10k+ published servers, 14k+ by 2026 | Registry/directory repos capture the ecosystem's search traffic permanently. "awesome X" is what devs type into GitHub search before Google. |

**Extracted mechanics:**
- Devs search `awesome <topic>` in GitHub search *first*. Owning that query for `dsh` / `deepseek harness` in English is a durable, compounding asset.
- Curation repos earn stars as **bookmarks**, not as software. The star cost is low (no install required), so conversion from a visit is 5-10x higher than for a tool repo.
- Contributions to a list are *cheap* for contributors, and **people star lists they contributed to**. Every accepted PR is roughly one guaranteed star plus that contributor's network.
- Lists that stagnate die. Weekly link-rot fixes + new entries keep the repo in GitHub's "recently updated" surfaces.

### 1.2 Open-source agent harnesses (the Claude-Code-like cohort)

| Repo | Trajectory | Mechanism |
|---|---|---|
| OpenCode (anomalyco) | 0 → ~160k stars, one of the fastest AI-agent star curves ever; ~7.5M MAD claimed | Positioned explicitly as **"the open-source Claude Code"** — borrowed an existing, extremely high-intent search term. Model-agnostic = no lock-in story. Terminal-native = HN's exact demographic. |
| Aider | Sustained high-5-figures | "Git accountability" — a single sharp, differentiated *trust* claim, repeated everywhere. |
| Goose / OpenHands / Cline | 10k-50k band | Each owns one adjective (autonomous / IDE-native / local). |
| Aggregate cohort | "over 400,000 GitHub stars" combined | The category itself is in a star bull market. Adjacency to it is worth real traffic. |

**Extracted mechanics:**
- **Borrowed-intent positioning.** The winners do not invent a category; they attach to a term devs already search (`claude code alternative`, `codex cli`). dsh-bridge's equivalent: *"Claude Code / Codex / OpenCode muscle memory, inside DeepSeek Harness."* Put those product names in the README's first 200 characters and in repo topics.
- **One sharp differentiator, repeated.** Aider = git safety. dsh-bridge = **provable plugin safety**. The CHARTER already identifies this; the discipline is refusing to lead with anything else.
- CLI tools and AI/ML projects convert HN upvotes to stars slightly *above* average — HN's audience stars tools it might run.

### 1.3 Launch-channel physics (hard numbers)

From a 188,085-post Show HN dataset (2012 → Apr 2026) cross-referenced against stargazer timestamps:

- Median Show HN scores **2 points**. 50+ puts you in the top 6%; 250+ in the top 1%.
- **~1.4 GitHub stars per HN upvote** within 48h (sublinear: high scorers convert at ~0.8/pt, mid scorers ~1.8/pt).
- **Half-life ≈ 24 hours.** Day 1 is a ~1,200x baseline spike (median successful repo: 0.4 → 509 stars/day), Day 2 ≈ 40, Days 3-7 ≈ 9/day, Days 8-30 ≈ 0. **92% of impact is over at 48h.**
- Best slot: **Monday 00:00 UTC (Sunday 7pm ET)** → 10.8% chance of 50+. Runner-ups: Sunday 02:00 UTC, Saturday 19:00 UTC. Worst: Thursday 06:00 UTC (2.6%).
- Comments do **not** predict stars (r=0.10). Score-to-stars r=0.29 (explains only ~8% of variance).
- Volume tripled since 2019 (~200 Show HN/day in 2026). The channel is noisier every quarter.

> **Implication for us:** a Show HN is a *pulse, not a strategy*. Ship the README, GIF, and one-command install **before** posting, because you get one day. Repos that gained little from a 500-point Show HN (lazygit, pocketbase, nocodb) simply already had flywheels; the launch was a blip on a curve someone else's engine was drawing.

### 1.4 Coordinated-launch benchmark (AFFiNE, 0 → 33k)

- **6,000 stars in week 1; 10,000 in 43 days; 28 GitHub Trending appearances in 5 months.**
- Highest-leverage tactic by their own ranking: **concentrate all channels into a 48-hour window.** Trending responds to *velocity*: ~200+ stars in 24h triggers it. Spreading the same posts over two weeks was estimated at ~20% of the result and zero Trending hits.
- Trending thresholds: **All Languages ≈ 100+ stars/day sustained; language-specific (TypeScript) ≈ 30-50 stars/day.** Weekly Trending is more achievable and persists longer than daily.
- Reddit was their single biggest channel: 80-100K impressions at **5-8% star conversion**, 2,000+ stars in month one — but only with pre-earned community credibility (~80+ karma, prior non-promotional participation, format-match by searching the sub first).
- Product Hunt: **200-600 stars per launch**, repeatable (they ran 30+).
- README star CTA ("⭐ If this is useful, a star helps others find it") measurably converts already-interested visitors.
- Issue response within 24h is the "is this abandoned?" trust signal that gates contributor conversion.
- Awesome-list inclusion is a **slow drip but permanent** backlink; open an issue before the PR.
- English-first, geographically distributed week-one stars read as organic. (Directly relevant: our ecosystem is Chinese-skewed, and our differentiation is being the credible English-first entrant.)

### 1.5 Our structural advantage: early on a rising platform

DSH is in developer preview. That means:
- The set of "the obvious repo for X in DSH" slots is **still unclaimed**. Claiming a slot early is worth more than out-executing later.
- Every DSH release is a **free news hook** we can attach content to (compat notes, "what changed for plugin authors").
- 12.6k stars on `awesome-dsh-plugin` proves the audience exists *and* is currently underserved in English and in trust.
- Risk: preview APIs churn. Mitigate with a compatibility matrix in the README (DSH version × dsh-bridge version) — which is itself a linkable, searchable asset that competitors won't bother to maintain.

---

## 2. Ranked playbook for dsh-bridge

Ranked by **expected impact ÷ effort**. Effort is S (≤1 day) / M (2-5 days) / L (1-3 weeks).
Star estimates are order-of-magnitude, derived from the benchmarks above, not promises.

| # | Tactic | Expected impact | Effort | Why this rank |
|---|---|---|---|---|
| **1** | **README as landing page**: hero GIF above the fold (onboarding wizard + a trust report card grading a real plugin), one-sentence value prop naming Claude Code / Codex / OpenCode / Jcode, 3 differentiator bullets, ≤5-step quickstart, star CTA line. | Multiplies **every other tactic** on this list by ~2-3x conversion. Nothing else matters if this is weak. | M | Universal across all four benchmark cohorts. It is the denominator of the whole funnel. |
| **2** | **One-command install** (`dsh plugin --profile web add github:<owner>/dsh-bridge`, verbatim copy-paste, plus a `curl`-free path) visible in the first screenful, with a 30-second "it worked" verification. | High. Install friction is the top drop-off. Also the precondition for credible demo GIFs. | S | Mechanics already proven by dsh-ponytail per CHARTER; this is documentation work, not engineering. |
| **3** | **Own the search slot**: repo topics + README H1 targeting `deepseek harness`, `dsh plugin`, `dsh`, `claude code alternative`, `agent plugin security`. Ship an English-first curated catalog page in-repo. | High and **compounding forever**. Awesome-list benchmark: this is the query devs type before Google. | S-M | Cheapest durable asset. Early-platform advantage decays as others claim the slot — do it now. |
| **4** | **Publish adversarial audits as standalone, linkable content** (`docs/audits/<plugin>.md`, one page per audited plugin, evidence at file:line). | High, compounding. Each audit is an SEO page, a Reddit post, and a reason for the audited plugin's author to link back. This is our version of AFFiNE's dev-blog compound. | M per audit, L for the pipeline | The one tactic no competitor can copy cheaply — it requires real work, which is exactly why it's defensible. Also the CHARTER's "killer feature" made public. |
| **5** | **Coordinated 48-hour launch**: Day 1 Reddit (r/LocalLLaMA, r/ClaudeAI, r/opensource) + Show HN at **Monday 00:00 UTC**; Day 2 Product Hunt + X/Twitter + relevant Discords. | Very high, but **one-shot**. Target 200+ stars/24h to trigger Trending; realistic range 150-800 stars depending on HN score at ~1.4 stars/upvote. | M (prep) | Ranked below 1-4 because it *consumes* them. Firing this before the README/GIF/install are impeccable wastes the single highest-variance shot we have. |
| **6** | **GitHub Trending flywheel**: after launch, sustain 30-50 stars/day to hold TypeScript-category Trending; each appearance raises the baseline for the next spike. | Very high if achieved (AFFiNE: 28 appearances → 33k). | L | Emergent, not directly targetable. It is the *output* of 4, 5, 7, 8. |
| **7** | **Reddit credibility banking** — start participating in r/LocalLLaMA / r/ClaudeAI / r/opensource *now*, weeks before launch; 80+ karma; search each sub for the format that survived. | 5-8% star conversion on 80-100K impressions is the best ratio of any channel. | S (ongoing) | Must start *early* or tactic #5's biggest channel is unavailable. Time-critical, so ranked above cadence work. |
| **8** | **Badge hygiene**: CI status, license (MIT), DSH-version compatibility matrix, "audited plugins: N", security policy, release version. No dead or vanity badges. | Medium. Badges are a 3-second trust heuristic; broken/red ones actively lose visitors. | S | Cheap, but a red CI badge on launch day is a self-inflicted wound. Gate it before #5. |
| **9** | **Release cadence**: tagged releases with human-readable notes every 1-2 weeks during preview; each DSH upstream release gets a same-week compat release. | Medium, compounding. Signals "alive," feeds watchers, gives recurring content hooks. | S per release | Low effort, and the DSH-preview news cycle does the topic selection for us. |
| **10** | **Contributing heat**: CONTRIBUTING.md, plugin-author guide, template repo, `good first issue` labels, **24h issue acknowledgement rule, 48h PR response rule**. | Medium-high, compounding. Contributors star, and they recruit. Unanswered issues are the fastest trust loss. | M | The awesome-list study attributes the 500 → 5,000-star jump largely to this plus consistency. |
| **11** | **Awesome-list submissions**: get dsh-bridge listed in `awesome-dsh-plugin`, `awesome-cli-coding-agents`, awesome-mcp/agent-security lists. Open an issue first, then PR. Start with smaller lists. | Medium, permanent slow drip. Backlink from a 12.6k-star list is uniquely valuable *for us specifically*. | S | Slow (weeks of review latency), so start early even though impact is a trickle. |
| **12** | **Technical blog cluster**: "How we statically detect malicious agent plugins," "Porting Claude Code's command surface to a plugin kernel," "What DSH's everything-is-a-plugin kernel gets right." | Medium, long-compound (drives stars for years via SEO). | M each | Highest long-run value, slowest payback. Begin after launch, one post every 2-3 weeks. |
| **13** | **Product Hunt launches**, repeatable per major milestone. | 200-600 stars/launch, repeatable. | S-M | Reliable but modest; use as the Day-2 leg of #5 and again at v1.0. |
| **14** | **After ~1,000 stars: stop broadcasting, start interviewing.** 30-min calls with anyone who's exchanged 5+ messages. | Indirect but decisive for the 1k → 10k leg. | M (ongoing) | AFFiNE's explicitly-stated inflection tactic. Stars are a launchpad; retention is what makes Trending sustainable. |

### Anti-tactics (things the data says not to do)
- **Don't launch early to "test."** 92% of Show HN impact is spent in 48h; there is no second first-launch.
- **Don't chase comments.** HN comment volume is uncorrelated with stars (r=0.10). Don't optimize for debate.
- **Don't spread the launch across a week.** Estimated ~20% of the stars and zero Trending.
- **Don't seed stars from a single friend network / single geography.** It reads as inorganic to exactly the technical audience we want, and it poisons any future diligence.
- **Don't broaden scope to "awesome agent tools."** Narrow-and-owned beats broad-and-contested. Our niche is *DSH plugin trust, English-first*.
- **Don't ship a vanity or red badge.** Badge hygiene is subtractive, not additive.

### Suggested sequencing
1. **Weeks -3 to -1 (pre-launch):** README + hero GIF (#1), one-command install (#2), topics/SEO (#3), badges (#8), CONTRIBUTING (#10). Begin Reddit karma banking (#7) and awesome-list issues (#11) on day one of this window. Land **3-5 published audits** (#4) so the trust claim has evidence on launch day.
2. **Launch 48h:** #5, Monday 00:00 UTC.
3. **Weeks +1 to +8:** release cadence (#9), one audit/week (#4), first two blog posts (#12), maintain 24h issue SLA. Watch for Trending (#6).
4. **At ~1,000 stars:** switch to #14.

---

## 3. Weekly star tracking plan

**Cadence:** every Monday 09:00 local. Owner: growth analyst role. Output appended to `docs/growth/star-log.md` (create on first run).

**Metrics tracked weekly:**

| Metric | Source | Target during preview |
|---|---|---|
| Total stars | `gh api repos/:owner/dsh-bridge` → `stargazers_count` | — |
| Δ stars week-over-week | diff vs last log entry | ≥30/day post-launch (TS Trending floor) |
| Stars/day 7-day avg | stargazer timestamps | rising or flat, never two down weeks |
| Forks, watchers | same endpoint | fork:star ratio > 3% = real usage |
| Unique clones / views | `gh api repos/:owner/dsh-bridge/traffic/clones` | — |
| Top referrers | `gh api repos/:owner/dsh-bridge/traffic/popular/referrers` | attributes which tactic fired |
| Open issues + median first-response time | `gh api` issues | median < 24h |
| Audits published (cumulative) | `ls docs/audits/*.md \| wc -l` | +1/week |
| Benchmark delta | `awesome-dsh-plugin` stars | track the ceiling |

### `gh api` examples

Current counts:
```bash
gh api repos/OWNER/dsh-bridge \
  --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .subscribers_count, issues: .open_issues_count}'
```

**Star history with timestamps** (the key endpoint — plain star counts hide velocity). Requires the
`star+json` media type, 100/page, newest last:
```bash
gh api -H "Accept: application/vnd.github.v3.star+json" \
  "repos/OWNER/dsh-bridge/stargazers?per_page=100&page=1" \
  --jq '.[] | .starred_at'
```

Stars gained per day over the last 30 days:
```bash
gh api -H "Accept: application/vnd.github.v3.star+json" \
  --paginate "repos/OWNER/dsh-bridge/stargazers?per_page=100" \
  --jq '.[].starred_at' \
| cut -d'T' -f1 | sort | uniq -c | tail -30
```
> Note: the stargazers endpoint paginates from oldest to newest and GitHub caps deep pagination
> (~400 pages / 40k stars). Below ~10k stars, `--paginate` is fine. Above that, binary-search to the
> page window containing the date range of interest.

Traffic (requires push access; 14-day rolling window, so it **must** be captured weekly or the data is lost forever):
```bash
gh api repos/OWNER/dsh-bridge/traffic/views   --jq '.count, .uniques'
gh api repos/OWNER/dsh-bridge/traffic/clones  --jq '.count, .uniques'
gh api repos/OWNER/dsh-bridge/traffic/popular/referrers
gh api repos/OWNER/dsh-bridge/traffic/popular/paths
```

Benchmark tracking (competitors and the ceiling):
```bash
for r in OWNER/dsh-bridge yzfly/awesome-dsh-plugin punkpeye/awesome-mcp-servers; do
  printf '%s\t%s\n' "$r" "$(gh api "repos/$r" --jq '.stargazers_count')"
done
```

Issue-response health:
```bash
gh api "repos/OWNER/dsh-bridge/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request == null) | {n: .number, created: .created_at, comments: .comments}'
```

**Log line format** (one row per week, appended to `docs/growth/star-log.md`):
```
| 2026-09-01 | 412 | +87 | 12.4/d | 9 forks | 1,204 views / 310 uniq | top ref: news.ycombinator.com | audits: 6 | issues median 8h |
```

**Interpretation rules:**
- Two consecutive down weeks in stars/day → the flywheel stalled; ship an audit + a blog post, not another broadcast.
- Referrer spike without a star spike → the README is the leak, not the channel. Fix #1.
- Fork:star ratio < 1% → stars are bookmark-quality, not usage; push #2 (install friction) and #10.
- Clone count rising while stars flat → add/strengthen the README star CTA.

> Blocker noted in CHARTER: `gh` CLI auth is currently broken on this machine (invalid token).
> All commands above are unverified against the live repo and will need a re-auth
> (`gh auth login`) plus the real `OWNER/` slug substituted before the first weekly run.
