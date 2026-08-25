# dsh-bridge

> **Your harness muscle memory, verified and installed into DeepSeek Harness.**

[![Status](https://img.shields.io/badge/status-early%20development-orange)]() [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**dsh-bridge** is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for people who come from Claude Code, Codex CLI, OpenCode, or Jcode. One install gives you:

- 🧭 **Familiar commands** — the slash commands you already know, mapped onto DSH-native capability seams
- 🔌 **Connectors flow** — guided provider setup that detects your existing credentials (`~/.claude`, `~/.codex`, opencode auth, env vars), configures model routes, and smoke-tests them
- 🛡️ **Verified plugin catalog** — community plugins pass an adversarial security review before we recommend them; every verdict ships with a human-readable **trust report card** citing file-and-line evidence
- ✨ **A UI worth screenshotting** — onboarding wizard and plugin browser built to a real design bar inside the DSH design system

## Why

DeepSeek Harness is brilliant and alien: everything is a plugin (Cordis architecture), but the ecosystem skews non-English, low-trust, and unpolished. Adoption stalls on three walls: *language*, *trust*, *familiarity*. dsh-bridge knocks all three down.

## Install (coming soon)

```bash
dsh plugin --profile web add github:beartackler/dsh-bridge
```

## Status

🚧 Under active development by a mixed-model agent swarm (research → adversarial audit → MVP → trust pipeline → UI polish). Research and audit artifacts land in [`docs/`](docs/) as they're produced.

| Milestone | State |
|---|---|
| Capability research | 🔄 in flight |
| Adversarial audit of DSH built-ins | 🔄 in flight |
| MVP plugin (commands + connectors) | ⏳ next |
| Trust report card pipeline | ⏳ |
| Onboarding wizard UI | ⏳ |
| v1 launch | ⏳ |

## Principles

1. **Trust over speed** — every security claim cites evidence
2. **English-first, i18n-ready**
3. **No slop** — if it looks vibe-coded, it doesn't ship
4. **You own your machine** — no telemetry without opt-in

---

*Not affiliated with DeepSeek. Built with gratitude for the Cordis team's MIT-licensed groundwork.*
