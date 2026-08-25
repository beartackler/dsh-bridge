# dsh-bridge

Familiar harness habits, ported into DeepSeek Harness and verified before you install anything.

dsh-bridge is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for people arriving from Claude Code, Codex CLI, OpenCode, or Jcode. One install provides:

- **Familiar commands.** The slash commands you already use, mapped onto DSH-native capability seams.
- **Connectors flow.** Guided provider setup that detects existing credentials, configures model routes, and smoke-tests them.
- **Verified plugin catalog.** Community plugins pass an adversarial review before we recommend them. Every verdict ships as a trust report card citing file-and-line evidence you can re-check yourself.
- **An interface that respects you.** Onboarding wizard and plugin browser built to a real design bar inside the DSH design system.

## Why

DeepSeek Harness is capable and unfamiliar. It is built on the Cordis kernel, where every capability is a plugin, but its ecosystem skews non-English, unvetted, and unpolished. Adoption stalls on three walls: language, trust, and muscle memory. dsh-bridge addresses all three.

## Install

```bash
dsh plugin --profile web add github:beartackler/dsh-bridge
```

Not yet functional. The command above is the target shape, proven by existing plugins such as dsh-ponytail.

## Status

Under active development. Research and audit artifacts land in `docs/` as they are produced.

| Milestone | State |
|---|---|
| Capability research | in progress |
| Adversarial audit of DSH built-ins | in progress |
| MVP plugin (commands, connectors) | next |
| Trust report card pipeline | planned |
| Onboarding wizard UI | planned |

## Principles

1. Trust over speed. Every security claim cites evidence.
2. English-first, i18n-ready.
3. Minimal code. Shortest correct implementation, no speculative features.
4. You own your machine. No telemetry without opt-in.

## Provenance

This repository is built by a mixed-model agent swarm (ox-alpha and Claude Opus 5) with human review. We say so because a trust product that hides its provenance has no business asking for yours.

Not affiliated with DeepSeek. Built on their MIT-licensed groundwork with gratitude.
