# Project Charter: dsh-bridge

> **Mission:** Make the DeepSeek Harness feel like home for English-speaking users of Claude Code, Codex, OpenCode, and Jcode — via one polished, verifiable, trustworthy plugin. The repo collects as many GitHub stars as possible.

## The Problem (verified)

1. **DSH is powerful but alien.** DeepSeek Harness (MIT, developer preview) is built on the Cordis kernel: *everything is a plugin* — models, tools, skills, sessions, sandboxes, storage, loops, scheduling, UI. Configuration-over-code.
2. **Adoption bottleneck for English speakers.** The plugin ecosystem (dsh-market, awesome-dsh-plugin) skews Chinese-language, low-trust (1-2 stars), and visually unpolished. Hard to discern quality or safety.
3. **Malicious-plugin risk is real.** Plugins are arbitrary code. Nothing today helps a user *prove* a plugin is harmless before install.
4. **Familiar workflows don't exist.** Users of Claude Code / Codex / OpenCode / Jcode have muscle memory (slash commands, connectors/auth flows, memory, MCP setup) that DSH doesn't replicate out of the box.

## The Product: dsh-bridge

A single DSH plugin (plus supporting repo) that delivers:

1. **Familiar-face commands.** Ports the command surface users already know:
   - `/help`, `/model`, `/login`, `/init`-style onboarding, `/review`, `/compact`, `/resume`, `/memory`, `/mcp` etc., mapped onto DSH-native capability seams (skills, tools, presets, profiles).
2. **Connectors flow (Jcode-style auth onboarding).** Guided provider setup: detect existing local credentials (~/.claude, ~/.codex, opencode auth.json, env vars), configure model routes in DSH, verify with smoke tests. Never print secrets; never exfiltrate.
3. **Verified installer & trust layer (the killer feature).**
   - Every marketplace/community plugin gets an automated **adversarial security review** before being recommended.
   - Static analysis + behavioral heuristics: network egress, credential access, lifecycle hooks, dynamic code eval (`new Function`, `eval`, `child_process`), obfuscation signals.
   - Produces a human-readable **trust report card** (grade + evidence) stored in-repo, so claims are auditable.
   - Install flow prefers: existing verified plugin → build-it-yourself scaffold with agent assistance → raw install with explicit risk consent.
4. **Curated discovery.** English-first catalog with quality+trust tiers, screenshots that meet a design bar, and one-command install (`/bridge:install <plugin>`). Integrates with dsh-find-plugin / native market where useful.
5. **Impeccable UI within DSH design system.** Onboarding wizard, plugin browser, trust report cards. Follows BRAND_GUIDELINES.md in the DSH repo.

## Non-Negotiable Principles

- **Trust over speed:** every claim about a third-party plugin must cite evidence (file:line).
- **English-first, i18n-ready.**
- **No slop:** code quality bar enforced by review gates. If it looks vibe-coded, it doesn't ship.
- **User owns their machine:** no telemetry without opt-in, no network calls except documented ones.
- **License hygiene:** respect upstream licenses (ponytail ports show the pattern: upstream MIT attribution).

## Star Strategy (why people will star this)

1. **Pain relief at the right moment** — DSH dev preview is new; early adopters are hitting exactly these walls (verified: awesome-dsh-plugin 12.6k stars proves demand for curation).
2. **The trust angle is unique** — "plugins you can prove are harmless" is a story nobody else tells; security-conscious devs share it.
3. **Launch artifacts**: impeccable README (hero GIF of the onboarding wizard, trust report card example, 30-second quickstart), HN/Reddit r/LocalLLaMA + r/ClaudeAI post timing, Show HN.
4. **Compounding loops**: every adversarial plugin audit we publish is linkable content; every ported command is a searchable fix for a real frustration.
5. **Contribution flywheel**: clear CONTRIBUTING, plugin-author guide, template repo — stars follow ecosystems.

## Working Model (the swarm)

- Coordinator (this session) maintains the plan, spawns waves, gates quality.
- Workers run on **ox-alpha-free (OpenCode Go)** and **claude-opus-5 (Claude OAuth)** — mixed-model by design; adversarial roles should use a different model than the author role when possible (cross-model review catches more).
- Roles: researcher, adversarial auditor (red team), architect, implementer, UI designer/polisher, docs writer, growth analyst.
- **Every wave's output lands in `docs/research/`, `docs/audits/`, or code — committed with clear messages. Nothing lives only in chat.**
- Quality gate before any merge to main: cross-model review + acceptance checks.

## Constraints & Facts

- Reference checkout: `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (shallow clone, master).
- Plugin mechanics proven by dsh-ponytail: `dsh plugin --profile web add github:<owner>/<repo>`; profile config in `~/.dsh/profiles/<name>/cordis.patch.yml`; peer deps `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`; avoid shipping dynamic code execution; SECURITY.md expected.
- gh CLI auth currently broken on this machine (beartackler token invalid). Repo creation/push blocked until user re-auths.
