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

![dsh-bridge connectors flow: credential detection resolves into a masked detection matrix, then a trust report card for @liustack/modlens showing grade B with file-and-line evidence.](site/demo/connect-demo.gif)

Rendered from the specs rather than a running build. Stills:
[detection matrix](site/demo/connect-matrix-dark.png) ([light](site/demo/connect-matrix-light.png)) ·
[trust card](site/demo/trust-card-dark.png) ([light](site/demo/trust-card-light.png)).

## What

dsh-bridge is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for people arriving from Claude Code, Codex CLI, OpenCode, or Jcode. It ports the slash commands you already know onto DSH-native seams, adds a guided connectors flow, and refuses to recommend a community plugin until an adversarial review has graded it.

## Why

- **Language.** The DSH plugin ecosystem skews non-English. The catalog and command surface here are English-first.
- **Trust.** Plugins are arbitrary code. Every recommendation ships a report card citing file-and-line evidence you can re-check.
- **Muscle memory.** `/model`, `/resume`, `/memory`, `/mcp`, `/review` behave the way your previous harness taught you.

## Install

One command, from a machine with nothing installed:

```bash
curl -fsSL https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs | node -
```

Piping a script into an interpreter means trusting what is on the other end. If you would rather read it first, that is the same file:

```bash
curl -fsSLO https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs
less install.mjs && node install.mjs
```

Add `--dry-run` to print every command and every file write without executing any of them.

The script checks Node and pnpm, installs the DSH runtime if it is missing, creates an isolated `DSH_HOME` so your real `~/.dsh` is untouched, pre-creates `.credentials.yaml` at mode 600 (the harness refuses to boot otherwise), installs dsh-bridge into the `web` profile, and prints the exact command to boot. Re-running it is safe: every step reports "already done" rather than repeating work, and it never overwrites a file it did not create.

**What it cannot do for you.** DSH ships no model. You supply a provider endpoint and an API key, and the script leaves you at `/bridge-setup` inside the UI, which walks through connecting one.

### Requirements

| Requirement | Why |
|---|---|
| Node 22 or newer | The harness runtime targets it |
| [pnpm](https://pnpm.io) 10 or newer | `dsh plugin` manages profile dependencies through it |
| A provider endpoint and API key | Nothing answers until a model route is connected |

### Manual install

If DSH is already set up and you only want the plugin:

```bash
dsh plugin --profile web add github:beartackler/dsh-bridge
dsh --profile web        # serves http://127.0.0.1:3080
```

This assumes DSH is installed, a `DSH_HOME` you are happy to write to, `.credentials.yaml` at mode 600, and a model route already connected. If any of those are not true, use the installer above or the full walkthrough in [docs/getting-started.md](docs/getting-started.md), which includes a working custom OpenAI-compatible provider configuration.

The repository ships its compiled `dist/` output, so nothing builds on your machine at install time and dsh asks for no build-script permission. To make sure a later push cannot silently change what runs, pin a commit:

```bash
dsh plugin --profile web add "github:beartackler/dsh-bridge#<commit-sha>"
```

The installer takes the same pin as `--ref <commit-sha>`.

Then use `/bridge-help` inside DSH.

Verified against `@deepseek-ai/dsh` 0.1.1-rc.2: a fresh install from a git checkout activates the bundle with no warnings and all 17 commands register ([how this was verified](docs/research/live-mount-report.md)).

## Verified catalog

[docs/catalog/INDEX.md](docs/catalog/INDEX.md) lists every plugin that has completed a trust review, with the audited commit and a linked report card.

Grades: **A** verified-clean · **B** safe with documented behavior · **C** use with awareness · **D** risky · **F** do not install. A grade is an evidence-backed opinion over one pinned commit, not a safety guarantee.

<img src="site/demo/trust-card-dark.png" width="520" alt="Trust report card for @liustack/modlens: grade B, with subject commit, sha512 integrity, npm attestation, MIT license, and per-capability findings for network, exec, telemetry, credentials, and filesystem writes.">

## Commands

All seventeen commands are implemented and verified end-to-end against `@deepseek-ai/dsh` 0.1.1-rc.2 (42 live invocations, see [the verification report](docs/research/e2e-verification.md)).

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
| [`/refactor`](docs/specs/commands/refactor.md) | Plans and applies behavior-preserving restructuring, tests-green gated. |

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
| MVP plugin (commands, connectors) | shipped - 17 commands e2e-verified in dsh 0.1.1-rc.2 |
| Trust report card pipeline | shipped - 24 plugins graded (7 B, 16 C, 1 D) |
| Onboarding wizard UI | planned |

## Principles

1. Trust over speed. Every security claim cites evidence.
2. English-first, i18n-ready.
3. Minimal code. Shortest correct implementation, no speculative features.
4. You own your machine. No telemetry without opt-in.

## Provenance

Cross-reviewed by design: adversarial reviews are performed by models that did not write the artifact under review. Quality gates are documented in CONTRIBUTING.md.

Not affiliated with DeepSeek. Built on their MIT-licensed groundwork with gratitude.
