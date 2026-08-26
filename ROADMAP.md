# 🗺️ Roadmap

> **dsh-bridge** — make [DeepSeek Harness](https://github.com/deepseek-ai) feel like home for Claude Code / Codex / OpenCode / Jcode users.
> Familiar commands · guided auth · **plugins you can *prove* are harmless**.

**Status legend:** ✅ shipped · 🔨 in progress · 📋 specified · 💭 planned

Every item links to its spec under [`docs/specs/commands/`](docs/specs/commands/) when one exists — no vaporware promises, just work we've actually thought through.

---

## ✅ Now — MVP

The smallest set that makes a new DSH user say *"oh, it works like my old tool."*

| Item | What it is | Spec |
|------|-----------|------|
| 🔨 `/help` | Full command directory + per-command detail cards with aliases & examples | [help.md](docs/specs/commands/help.md) |
| 🔨 `/connect` | Jcode-style connector flow: detect existing credentials (~/.claude, ~/.codex, opencode, env), configure model routes, smoke-test. Never prints secrets | spec drafting |
| 🔨 `/install <plugin>` | Verified installer with resolution order (verified → build-yourself → raw install w/ explicit risk consent) | [install.md](docs/specs/commands/install.md) |
| 🔨 `/trust <plugin>` | Human-readable trust report card: grade + evidence down to `file:line` | [trust.md](docs/specs/commands/trust.md) |
| 📋 `/browse` | English-first curated plugin catalog with quality + trust tiers | spec drafting |
| 🔨 `/doctor` | Green/yellow/red health check of your whole DSH setup in <10 seconds | [doctor.md](docs/specs/commands/doctor.md) |
| 💭 First **10 trust cards** | Adversarial security reviews of the most-installed community plugins, published as auditable artifacts | pipeline defined in [trust.md](docs/specs/commands/trust.md) |

**MVP exit criteria:** a Claude Code refugee can go from `git clone` → working model route → first verified plugin install without reading DSH source.

---

## 🚧 Next — the full toolkit

| Item | What it is | Spec |
|------|-----------|------|
| 📋 Full command set | `/model`, `/login`, `/init`, `/compact`, `/resume`, `/memory`, `/mcp`, `/review` … mapped onto DSH-native seams (skills, presets, profiles) | charter §Product; [review.md](docs/specs/commands/review.md) exists |
| 📋 Web-panel UI wizard | Onboarding wizard + plugin browser inside the DSH design system, meeting the design bar (hero-GIF worthy) | charter §5 |
| 📋 Suggested-build flow | `/bridge:suggest <idea>` turns "plugin doesn't exist" into a scaffolded `PLAN.md` + agent-assisted build, with safety guardrails | [suggest.md](docs/specs/commands/suggest.md) |

---

## 🔭 Later — the flywheel

| Item | Why it's interesting |
|------|---------------------|
| GitHub PR review mode | `/review` against open PRs — cross-model code review as a daily driver, not just plugin audits ([rubric drafted](docs/specs/commands/review.md)) |
| Cross-model review marketplace | Community-submitted audits; adversarial reviewer models ≠ author models, so findings are harder to game. Every audit is linkable content |
| i18n | English-first today, but the curation layer speaks Chinese too — bridging both ecosystems instead of splitting them |

---

## 🗳️ How to influence priorities

1. **👍 React** (not comment) on an existing [issue] so votes stay countable.
2. **Open an issue** with the `roadmap-suggestion` label describing the *problem*, not the solution — we'll spec it if it fits the charter.
3. **Bring evidence:** a broken workflow + what you tried beats "please add X."
4. Trust-card requests: name the plugin + marketplace link in a `trust-request` issue. High-demand plugins jump the audit queue.

---

## ⚠️ Honest disclosure

This entire project — code, specs, audits, and this roadmap — is built by a **swarm of AI coding agents** (mixed models, cross-reviewed by design), coordinated by humans. We think that's a feature: every artifact is reproducible from its spec, and adversarial reviews are done by models that didn't write the thing being reviewed. But you should know what you're starring. If agent-built tooling with human quality gates bothers you, this repo isn't pretending otherwise.

---

<p align="center">
  <a href="CHARTER.md">Charter</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="SECURITY.md">Security</a> · <a href="docs/specs/commands/">Specs</a>
</p>
