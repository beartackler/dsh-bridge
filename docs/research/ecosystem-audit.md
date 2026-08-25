# DSH Plugin Ecosystem Audit

**Date:** 2026-08-25 · **Author:** ecosystem-analyst worker (dsh-bridge swarm)
**Sources:** [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) (README + `plugins.json` snapshot, 2026-08-25, 2,189 entries), GitHub topics [`dsh-plugin`](https://github.com/topics/dsh-plugin) (11,830 repos) and [`deepseek-harness-plugin`](https://github.com/topics/deepseek-harness-plugin) (450 repos), dsh-market and dsh-find-plugin READMEs, HN threads 49285244 / 49316849, deepseek-ai/deepseek-harness discussions.

---

## 1. Landscape

### Size and growth

| Signal | Number |
|---|---|
| Plugins on the curated awesome list (`count.json`) | **2,189** |
| Repos tagged `dsh-plugin` | 11,830 |
| Repos tagged `deepseek-harness-plugin` (stricter tag) | 450 |
| awesome-list commits | 2,595; 2.1k forks, 31 watchers |
| Harness repo itself | ~195k stars; DSH open-sourced **2026-08-13**, 90k stars in two days |

The list grew from a handful to 2,189 entries in under two weeks — roughly 150+ new plugins/day at peak. All 2,189 entries carry an `added: 2026-08` stamp. The `dsh-plugin` topic is heavily polluted by unrelated projects tagging it for reach (reactive-resume, PicGo, NocoBase all appear in its top results); the stricter topic is cleaner but only 450 repos.

### Star distribution (n=2,189, from plugins.json)

| Bucket | Count | Share |
|---|---|---|
| 0 stars | 542 | 24.8% |
| 1–9 stars | 1,289 | 58.9% |
| 10–49 | 233 | 10.6% |
| 50–199 | 70 | 3.2% |
| 200–999 | 32 | 1.5% |
| 1,000+ | 23 | 1.1% |

**Median: 2 stars.** The long tail dominates; the head is thin but real. Top npm download counts tell a healthier story: dsh-market 189k downloads, DSH-better-sidebar 125k, modlens 110k — usage concentrates far above what star counts suggest.

### Language distribution

- The curated list itself is fully bilingual (every entry has hand-written `en` + `zh` descriptions — that part of the friction is already solved).
- The *repos* are not. A 24-repo random sample of listed plugins found **8/24 (~33%) with Chinese-only GitHub descriptions**, and README language skews further Chinese once you leave the head (many tail repos are Chinese-README-only). Author handles, WeChat/QQ references, and Feishu/WeCom integrations indicate well over half of active authors are China-based.
- Practical consequence for English users: even where an English description exists, screenshots, issue threads, and docs are frequently zh-only.

### Categories (count of 2,189)

UI Enhancements 340 · Tools & Capabilities 284 · Development & Runtime 185 · Sessions & Messages 145 · Workflow & Automation 126 · Usage & Billing 120 · Memory 111 · Notifications & Integrations 110 · Skills 91 · Themes & Appearance 85 · Just for Fun 79 · Vision & Multimodal 78 · **Security & Permissions 77** · Models & Providers 72 · Plugin Markets & Managers 61 · Remote & Mobile 55 · Browser & Web 53 · Git & Code Review 52 · Voice & Audio 31 · Docs & Rendering 31 · Identity & Communication 3.

The ecosystem is **surface-area-first**: UI tweaks, themes, and status-label toys outnumber infrastructure categories. Among the top-100 by stars the mix shifts toward memory (10), workflow (12), and market/manager tooling (6) — the "serious" layer exists but is a minority. Browser/web (53) and memory (111) are underserved relative to demand signals in English agent ecosystems.

### Native discovery infrastructure

- **[dsh-market](https://github.com/dsh-market/dsh-market)** (2,227★, 189k downloads): in-app marketplace, one-click install/update/disable/enable, AppStore-style screenshots (author-curated with automatic README-extraction fallback), themes tab, backup/restore via WebDAV or Gist, diagnostics page, load-order editor. Catalog = the awesome list, picked up automatically.
- **[dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin)**: agent-facing discovery — GitHub topic search re-ranked by stars, bilingual descriptions injected from the awesome list's `plugins.json`, ready-to-run install commands.
- Third-party clients bundling the market: anywhere-labs/dsh-desktop (20.2k★, zh), dataelement/dsh-desktop, hairyf/deepseek-harness-desktop; plus VS Code extensions and a SwiftUI macOS client.

## 2. Quality / trust gap analysis

### What the curation bar actually is

awesome-dsh-plugin's own contributing.md is refreshingly honest: CI checks *shape* (manifest, repo ≥1 day old, ≥10 commits, regenerable READMEs); a maintainer reads the source to verify the description is accurate and does a "sanity check" for alarming code — then states explicitly: **"Being listed is still not a security review."** The bar is: installs, works as described, categorized right, maintained.

### Slop evidence

- 24.8% of listings have zero stars; median 2. Many are one-week-old repos riding a hype wave (the 1-day/10-commit admission rule exists precisely because "repos created minutes before the PR were the bulk of what had to be rejected").
- Only **12.7% of listings have any screenshot** (277/2,189); dsh-market papers over this with automatic README image extraction, which surfaces whatever images exist, not designed ones.
- Fork-of-fork duplication and abandoned/relocated repos are acknowledged maintenance burdens ("entries whose repos go away… get removed", migration stubs like `MiopIIk → mop-plugins`).
- Description inflation is policed (numbers get counted), but there is no quality bar beyond "does what it says."

### Security vetting absence

- No scanning pipeline, no signatures, no permission manifests, no sandboxing story. Install runs third-party code with user permissions; the README warning says plainly that tool approvals don't sandbox plugin code.
- Notably, the ecosystem has *spontaneously generated* five grassroots vetting attempts — all tiny, none authoritative:
  - `wulun811/dsh-plugin-vet` (2★): deterministic static scan + honeypot runtime guard, "alarm-only, never an enforcer"
  - `truelove-dreamer/dsh-plugin-vetting` (4★): static scan for exfiltration/credential/obfuscation patterns
  - `iiiweiii/dsh-guardwall` (1★): pre-install vetting + runtime high-risk call blocking
  - `863683348/dsh-plugin-scorecard` (0★) and `/dsh-plugin-audit` (1★): catalog-wide scored audits
  - Plus `toby-bridges/api-relay-audit` (804★) showing security tooling can earn real traction here
- dsh-market's mitigations are supply-side only: installs restricted to awesome-list sources, build scripts blocked by default, CLI-surface flags. Nothing evaluates plugin behavior.
- One documented near-miss (#1348): malicious-looking PR edits to unrelated entries slipped through every mechanical check twice before the gate was fixed.

### Install friction

For the target English-user persona the flow today is: hear about DSH → hit a zh-first web UI → discover plugins through channels that assume you read Chinese → run a shell command against unaudited third-party code. Even dsh-market's excellent one-click UX doesn't answer "is this safe?" or "which of these 340 UI plugins is good?"

**Gap verdict:** discovery is solved; **trust and taste are not.** Nobody in the ecosystem answers: is it safe (evidence), is it good (design bar), is it for me (English).

## 3. Top 15 plugins worth trust-reviewing first

Selection criteria: traction (stars/downloads), relevance to English-speaking users of Claude Code/Codex/OpenCode/Jcode, category coverage, and strategic value to dsh-bridge (compatibility surface or competitive overlap).

| # | Plugin | Repo | ★ | Category | Why interesting for English users |
|---|---|---|---|---|---|
| 1 | OpenViking memory plugin | volcengine/OpenViking#examples/dsh-memory-plugin | 33,032 | memory | ByteDance-backed context database (memory+RAG+skills); highest-star integration; direct competitor to any memory story we ship |
| 2 | Hindsight | vectorize-io/hindsight#coding-agents | 21,052 | memory | Long-term auto recall/retain memory; Western-origin (vectorize-io), English docs; likely the default English memory pick |
| 3 | WeKnora bridge | Tencent/WeKnora#dsh-weknora | 20,551 | tools | Tencent RAG/knowledge platform, read-only tool bridge; enterprise-grade pedigree |
| 4 | Archify | tt-a1i/archify#integrations/deepseek-harness | 15,451 | docs | Validated interactive architecture/workflow diagrams export; strong demo material |
| 5 | dsh-web-ui suite | zhu1090093659/dsh-web-ui#packages/* | 5,953 | ui/session/git/market | 7-package monorepo (task board, git graph, chat recovery, skill explorer, remote control, plugin manager); de-facto UI standard, 142k downloads |
| 6 | Ouroboros | Q00/ouroboros#integrations/dsh-plugin | 5,647 | workflow | 36-tool interview-driven refinement loop via MCP; methodology users know from other harnesses |
| 7 | modlens | liustack/modlens | 3,612 | vision | Vision bridge for text-only models (OCR/layout evidence as JSON); 110k downloads |
| 8 | mirage | strukto-ai/mirage#dsh | 3,563 | dev | Swaps fs/bash providers for a virtual workspace — exactly the sandbox-shaped capability our trust story wants to lean on |
| 9 | DSH-better-sidebar | omdsh-dev/DSH-better-sidebar | 2,834 | ui | Full workbench sidebar (files, terminal, git, subagents); 125k downloads; flagship polish reference |
| 10 | memsearch | zilliztech/memsearch#dsh | 2,498 | memory | Zilliz-backed shared Markdown memory across coding agents; cross-agent angle matches our audience |
| 11 | dsh-TUI | ccch1mneyyy/dsh-TUI | 2,493 | ui | Claude Code-style full-screen terminal UI — muscle-memory port done by someone else; study before we build adjacent |
| 12 | BrowserSkill | Tencent/BrowserSkill#dsh-plugin-browserskill | 1,304 | browser | Chrome/Edge Agent-window control; the browser-category head item |
| 13 | dsh-context | bowenliang123/dsh-context | 1,009 | usage | Context dashboard + `/context` command; closest existing thing to our command-surface goals |
| 14 | dsh-market | dsh-market/dsh-market | 2,227 | market | The distribution rails themselves; 189k downloads; must integrate, not compete |
| 15 | api-relay-audit | toby-bridges/api-relay-audit | 804 | security | Local audits of API relays/proxies producing Markdown reports; proof that security content earns stars in this ecosystem |

Honorable mentions for phase 2: `ysr666/dsh-vision-router` (964, keyless vision chain), `NanmiCoder/dsh-agent-teams` (967, multi-agent DAG teams), `xmanrui/dsh-im` (793, 9-channel IM bots incl. Telegram), `PerryLink/dsh-permission-rules` (36, Claude Code-style declarative permissions — direct port candidate), `xgone/dsh-remote` (47, MFA-gated remote access).

## 4. Curation opportunity: what awesome-dsh-plugin does NOT do

Its own words set the boundary: *"This list doesn't rank plugins or judge their quality, and we don't want to."* That refusal is dsh-bridge's opening:

| Capability | awesome list | dsh-market | **dsh-bridge verified catalog (opportunity)** |
|---|---|---|---|
| Bilingual descriptions | ✅ solved | ✅ inherits | inherit, don't rebuild |
| Accurate-descriptions check | ✅ manual, shallow | — | automated claim-vs-code verification |
| **Adversarial security review with evidence (file:line)** | ❌ explicit non-goal | ❌ supply-side only | ✅ the killer feature: trust report cards, grades, auditable evidence |
| **Quality/design ranking** | ❌ refuses to rank | ⚠️ sort by stars only | ✅ tiers + design-bar screenshots (only 12.7% have any today) |
| **English-first narrative & docs links** | partial (descriptions yes, repos no) | partial | ✅ per-plugin English summary, known issues, i18n caveats |
| **One-command install with consent trail** | n/a (copy-paste shell) | ✅ one-click, but no risk signal | ✅ `/bridge:install <plugin>` = vetted → consented → pinned commit |
| Stale/broken entry hygiene | reactive periodic sweep | — | continuous health checks feeding report-card expiry |
| Claim verification at scale | maintainer eyeballs | — | static analysis + behavioral heuristics, cross-model review |

Positioning: do NOT out-curate them on breadth (impossible at their velocity); out-*trust* and out-*taste* them on depth. A catalog of 50 verified plugins beats 2,189 unvetted ones for our persona. The five grassroots vetting plugins (§2) validate demand but are alarm-toy grade (0–4★); nobody owns the "provably harmless" position.

Also note: dsh-market restricts installs to awesome-list sources — meaning getting into the awesome list remains table stakes for distribution, and dsh-bridge's catalog should treat it as the upstream feed plus a trust/taste overlay.

## 5. Distribution channels for launch

**Chinese-dominant (where the ecosystem lives today):**
- GitHub discussions on deepseek-ai/deepseek-harness — active WeChat group threads (66+ groups, QR-code churn) and a 2,000-member QQ group (839509497) specifically for plugin coordination
- In-app dsh-market placement (189k installs) and awesome-list inclusion — both gated by PR to the awesome repo
- Third-party desktop clients (anywhere-labs/dsh-desktop 20.2k★) bundling the market

**Western (underexploited, our home turf):**
- Hacker News: the dev-preview post hit 745 points / 310 comments; a Show HN for a DSH plugin directory already ran. Show HN timing for dsh-bridge is wide open
- Reddit r/LocalLLaMA and r/ClaudeAI — the charter's named targets; zero DSH-plugin presence observed yet
- dev.to and personal-blog explainers ("Everything is a Plugin" essays, e.g. justin3go.com's 90k-stars review) — guest-post/comment loops available
- SEO land-grab: multiple squatters already built directory sites targeting English queries (dsharness.io, deepseek.stream "Harness Hub", deepseekharnessai.com, deepseekharness.io/.com variants). None offer trust evidence; they confirm search demand and the need to move fast on ours
- GitHub topics `dsh-plugin` / `deepseek-harness-plugin`: mandatory tags for our repo; note the main topic is polluted, so also use `cordis-plugin`, `dsh`, `agent-skills`

Launch implication: seed simultaneously in both worlds — awesome-list PR + dsh-market compatibility gets us into the Chinese distribution spine; HN/r/LocalLLaMA Show-HN-style launch claims the empty Western trust niche before squatter directories harden their SEO positions.
