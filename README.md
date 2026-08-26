```
██████╗ ███████╗██╗  ██╗  ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗
██╔══██╗██╔════╝██║  ██║  ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
██║  ██║███████╗███████║  ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗
██║  ██║╚════██║██╔══██║  ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝
██████╔╝███████║██║  ██║  ██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗
╚═════╝ ╚══════╝╚═╝  ╚═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝
```

**Familiar harness commands for DeepSeek Harness, with every plugin audited first.**

[![CI](https://github.com/beartackler/dsh-bridge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/beartackler/dsh-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](packages/dsh-bridge/package.json)
[![Built by agent swarm, human reviewed](https://img.shields.io/badge/build-agent%20swarm%2C%20human%20reviewed-lightgrey)](#provenance)

<!--
  DEMO SLOT: replace this comment with the recorded terminal GIF once captured.
  <img src="site/demo/connect-demo.gif" width="880" height="480" alt="dsh-bridge connectors flow: credential detection resolves into a masked detection matrix, then a trust report card for @liustack/modlens showing grade B with file-and-line evidence.">
  Required asset: site/demo/connect-demo.gif, 880x480 logical px (1760x960 @2x), <= 6 MB.
-->

Current stills, rendered from the specs rather than a running build:
[detection matrix](site/demo/connect-matrix-dark.png) ([light](site/demo/connect-matrix-light.png)) ·
[trust card](site/demo/trust-card-dark.png) ([light](site/demo/trust-card-light.png)).

## What

dsh-bridge is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for people arriving from Claude Code, Codex CLI, OpenCode, or Jcode. It ports the slash commands you already know onto DSH-native seams, adds a guided connectors flow, and refuses to recommend a community plugin until an adversarial review has graded it.

## Why

- **Language.** The DSH plugin ecosystem skews non-English. The catalog and command surface here are English-first.
- **Trust.** Plugins are arbitrary code. Every recommendation ships a report card citing file-and-line evidence you can re-check.
- **Muscle memory.** `/model`, `/resume`, `/memory`, `/mcp`, `/review` behave the way your previous harness taught you.

## Install

```bash
dsh plugin --profile web add github:beartackler/dsh-bridge
```

Not yet functional. That command is the target shape, proven by existing plugins such as dsh-ponytail. Specs and audits are real today; the runtime is not.

## Verified catalog

[docs/catalog/INDEX.md](docs/catalog/INDEX.md) lists every plugin that has completed a trust review, with the audited commit and a linked report card.

Grades: **A** verified-clean · **B** safe with documented behavior · **C** use with awareness · **D** risky · **F** do not install. A grade is an evidence-backed opinion over one pinned commit, not a safety guarantee.

## Commands

Each command is specified before it is written. Status of all sixteen: spec, not implemented.

| Command | Does |
|---|---|
| [`/help`](docs/specs/commands/help.md) | Lists the bridge surface and the DSH-native equivalent of each command. |
| [`/init`](docs/specs/commands/init.md) | Onboards a repository and generates its instruction file. |
| [`/connect`](docs/specs/commands/connect.md) | Detects existing provider credentials, configures routes, smoke-tests them. |
| [`/model`](docs/specs/commands/model.md) | Switches the active model or route without editing profile YAML. |
| [`/status`](docs/specs/commands/status.md) | Reports session, profile, and route state already known. Probes nothing. |
| [`/doctor`](docs/specs/commands/doctor.md) | Runs environment health checks and prints only what it actually observed. |
| [`/memory`](docs/specs/commands/memory.md) | Reads and edits persistent user and project memory. |
| [`/compact`](docs/specs/commands/compact.md) | Compacts conversation context on demand. |
| [`/resume`](docs/specs/commands/resume.md) | Picks a recent session to resume or fork. |
| [`/review`](docs/specs/commands/review.md) | Reviews working-tree or pull-request changes. |
| [`/improve`](docs/specs/commands/improve.md) | Proposes and applies targeted improvements to selected code. |
| [`/mcp`](docs/specs/commands/mcp.md) | Adds, inspects, and removes MCP servers. |
| [`/browse`](docs/specs/commands/browse.md) | Browses the verified catalog with grade and trust filters. |
| [`/trust`](docs/specs/commands/trust.md) | Prints a plugin's trust report card with its evidence. |
| [`/install`](docs/specs/commands/install.md) | Installs a plugin, preferring verified builds and requiring explicit risk consent. |
| [`/suggest`](docs/specs/commands/suggest.md) | Handles the dead end: scaffolds the plugin that does not exist yet. |

Naming caveat: shipped names will be either `/bridge:<name>` or `/bridge-<name>`, pending an open DSH parser question.

## Docs

- [Architecture](docs/architecture.md) — how the plugin sits on the Cordis kernel.
- [Trust pipeline](docs/trust/pipeline-architecture.md) — grading bands, heuristics, provenance checks.
- [Command specs](docs/specs/commands) · [Plugin author guide](docs/plugin-author-guide.md) · [Glossary](docs/glossary.md) · [FAQ](docs/faq.md)
- [Charter](CHARTER.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md)

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

Built by a mixed-model agent swarm (ox-alpha and Claude Opus 5) under human review. We say so because a trust product that hides its provenance has no business asking for yours.

Not affiliated with DeepSeek. Built on their MIT-licensed groundwork with gratitude.
