# Trust Report Card: foryourhealth111-pixel/Vibe-Skills

## 1. Header

| Field | Value |
|---|---|
| Plugin | VibeSkills / "Vibe Code Orchestrator" v4.0.0 (a skill router and governed workflow runtime: one `vibe` entry skill, a Python installer CLI, seven core skills, and 253 bundled third-party skills) |
| Pinned subject | github:foryourhealth111-pixel/Vibe-Skills @ commit `d5ae560440a9ecd83397bb68e77ea1aa2f2c9b78` (default branch, head at audit time; last commit 2026-08-11) |
| Provenance | Git tree audited directly; the documented install path is a GitHub release ZIP whose SHA-256 the repo publishes but which was not downloaded or compared here (docs/install/README.en.md:3) |
| License | Apache-2.0 (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the installer CLI, installer packages, bootstrap writers, setup scripts, and sampled bundled skills) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The core runtime and installer are unusually disciplined - offline by default, receipt-tracked
installs, managed-block-only merges that refuse to overwrite user files - but the grade is capped
at C because installing it silently writes bootstrap instructions into your `~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`, and `~/.config/opencode/AGENTS.md` with no mention in any user-facing
document, its optional-dependency path can globally npm-install an unpinned package during a
"governed" host install, and 253 bundled community skills ship with their own scripts whose
behavior this audit could only sample, not exhaustively review.

## 3. What this skill can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (runtime/installer) | None in shipped Python. Grep for `urllib`/`requests`/`socket` across `apps/vgo-cli/`, `packages/`, `core/`: zero hits; the only URL literals are the project's own GitHub URL (apps/vgo-cli/src/vgo_cli/commands.py:18) and JSON-Schema `$id`s. The two real egress paths are opt-in scripts: `scripts/setup/fetch-windows11-eval-iso.sh:4,162` downloads a Microsoft ISO from `aka.ms`, and `bundled/skills/vercel-deploy/scripts/deploy.sh:9,239` POSTs a tarball of your project to `codex-deploy-skills.vercel.sh` when that bundled skill is invoked. | grep + file reads above |
| Network egress (optional deps) | During a host-scoped install in "governed" mode (the codex adapter), if `npm` exists on PATH the installer runs `npm install -g @th0rgal/ralph-wiggum` unpinned, with a 15-second timeout and warning-only failure (external.py:29-67). Other external tools (`xan`, `ivy`, `fuck-u-code`) only produce "install manually" warnings (external.py:63-68). A strict-offline mode refuses fallbacks (external.py:23-25). | apps/vgo-cli/src/vgo_cli/external.py:29-68 |
| Global instruction writes | The full adapter install path materializes a "managed block" into host-global files: claude-code -> `~/.claude/CLAUDE.md`, codex -> `~/.agents/AGENTS.md`, opencode -> `~/.config/opencode/AGENTS.md` (bootstrap_doctor_support.py:21-24; global_instruction_service.py:128-157). Content is an 8-line directive ordering the model to enter canonical `vibe` on `$vibe`/`/vibe` and never fall back silently (config/global-bootstrap/claude-code-vibe-bootstrap.md). Merge policy is managed-block-only with overwrite forbidden (adapters/claude-code/host-profile.json:22-27), and a receipt is written. However: neither README nor docs/install mentions this write at all (grep count 0), so users discover it after the fact. | file:line above |
| Settings surface (Claude Code) | For the claude-code adapter the installer adds a single `"vibeskills"` stanza to `<target_root>/settings.json`, preserving all existing keys (host_closure.py:44-79). Note target_root defaults to `~/.agents`, not `~/.claude`; writing into `~/.claude/settings.json` itself requires pointing `--skills-dir` there explicitly. | packages/installer-core/src/vgo_installer/host_closure.py:56-79; config/adapter-registry.json:59-62 |
| Credential access | None. No keychain, `.ssh`, `.aws`, browser-profile, or other-harness auth-file access anywhere in the installer/runtime code. The scanner's CRED highs trace to path *strings* in JSON configs describing where hosts keep skills (e.g., adapters/claude-code/host-profile.json:18), not to reads of credential material. One template ships placeholder env keys (`<YOUR_API_KEY>` in config/settings.template.claude.json:3-4) for the user to fill. | scanner adjudication + grep |
| Dynamic code execution | None found. No `eval`/`exec`/`new Function` in shipped Python; subprocess use is argv-form with list arguments (process.py:202-204, external.py:31-36). | grep + read |
| Lifecycle hooks | No npm lifecycle hooks (package.json absent from the shipped surface; the repo is Python). The installer itself is the hook: it runs when you invoke it, writes a receipt, and `check` verifies installed files against SHA-256s recorded at install time (simple_skill_installer.py:265-300). | simple_skill_installer.py:202-300 |
| Bundled skills fleet | `bundled/skills/` holds 253 community-derived skills with their own shell/Python scripts. Sampled findings: `playwright_cli.sh:19` runs `npx --yes --package @playwright/cli playwright-cli` on invocation (fetches from npm at use time); `digital-brain/scripts/install.sh:23-34` copies into `~/.claude/skills/` interactively; `scientific-schematics/scripts/example_usage.sh:13-19` requires `OPENROUTER_API_KEY` and calls openrouter.ai via a Python script. Most bundled content is inert prose. An upstream lock file documents 32 upstream dependencies with license and tier metadata, none shipped by default (config/upstream-lock.json). | directory counts + samples above |
| Telemetry | None found. No analytics/beacon strings in shipped code; the Claude settings template sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"` (config/settings.template.claude.json:5), which reduces host-side traffic. | grep verified |

## 4. Findings

| ID | Severity | Location | Note |
|---|---|---|---|
| VS-GLOBAL-1 | medium | adapters/claude-code/host-profile.json:17-33; adapters/codex/host-profile.json:17; adapters/opencode/host-profile.json:19; packages/installer-core/src/vgo_installer/global_instruction_service.py:128-157; config/global-bootstrap/claude-code-vibe-bootstrap.md | Host-global instruction injection with zero user-facing disclosure. The write itself is careful (hash-versioned managed block, overwrite forbidden, uninstall removes it), but modifying `~/.claude/CLAUDE.md` and equivalent files is exactly the class of side effect trust reviews exist to surface; it appears nowhere in README.md (508 lines) or docs/install/README.en.md (72 lines). |
| VS-NPM-1 | medium | apps/vgo-cli/src/vgo_cli/external.py:61-63; config/adapter-registry.json:12 | On a codex-adapter ("governed") install with npm present, `npm install -g @th0rgal/ralph-wiggum` executes unpinned at install time. Timeout-bounded and warning-only on failure, and skipped under `--strict-offline`, but a globally installed unpinned package is supply-chain exposure the product name does not advertise. |
| VS-FLEET-1 | medium (awareness) | bundled/skills/ (253 entries); e.g. bundled/skills/playwright/scripts/playwright_cli.sh:19; bundled/skills/vercel-deploy/scripts/deploy.sh:9,239 | The bulk payload is a curated-but-third-party skill corpus. Each skill runs only when invoked, but invoking one can fetch packages (`npx --yes`) or upload project code (vercel-deploy tarballs your project to a Vercel endpoint). Review per-skill before enabling; the per-skill review burden is real and unavoidable. |
| VS-ISO-1 | low | scripts/setup/fetch-windows11-eval-iso.sh:4,89,162 | Optional operator script downloads a multi-GB Windows 11 eval ISO from aka.ms following redirects; documented purpose (Windows proof VM), pinned source URL, but redirect targets are whatever Microsoft serves. Not part of skill runtime. |
| VS-CAP-1 | low (pipeline ceiling) | whole repo | No behavioral probe and no cross-model adversarial review ran for this pass; also the release-ZIP-to-commit equality was not verified (repo publishes the ZIP SHA-256 at docs/install/README.en.md:3, which is better than most but unverified here). Caps at C. |

### Scanner noise dismissed

Most of the 59 high findings are string-level hits over declarative JSON/YAML: MCP server example
URLs (`api.example.com`, `mcp.github.com` in bundled/skills/mcp-integration/examples/*), JSON-Schema
`$schema` identifiers (schemas/*.json:2-3), and skill-path documentation strings
(adapters/*/settings-map.json, host-profile.json). These describe surfaces; they do not perform
network I/O. The `npx -y @anthropic-ai/mcp-server-*` lines (bundled/skills/autonomous-builder/assets/mcp-services-template.json) are a copy-paste template asset, not executed at install.
The obfuscation lows are RTL/BIDI characters inside Arabic i18n text plus one zero-width character
constant. The lockfile hit at config/upstream-lock.json:347 is an identifier naming the third-party
repo `muratcankoylan/Agent-Skills-for-Context-Engineering`, not concealed content.

## 5. What we could not check

- **Release artifact equality.** The published v4.0.0 ZIP was not downloaded; the repo's own
  published SHA-256 was not independently recomputed against a tagged build.
- **Behavioral probe.** No sandboxed install/run across the six host adapters; adapter behavior
  differences (preview-guidance vs governed vs runtime-core) were established by reading, not running.
- **253-skill exhaustive review.** Bundled skills were sampled, not exhausted; a hostile skill
  buried deep in the corpus would not be caught by this pass.
- **Cross-model adversarial review** did not run (pipeline ceiling).

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). Machine grade F versus adjudicated C;
the gap decomposes as: ~70% of highs fire on declarative JSON/docs strings, the remainder map to
VS-NPM-1 and VS-FLEET-1, both kept and graded medium, plus the pipeline ceiling.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/foryourhealth111-pixel/Vibe-Skills /tmp/vibe-audit
cd /tmp/vibe-audit && git rev-parse HEAD   # expect d5ae560440a9ecd83397bb68e77ea1aa2f2c9b78

# 2. Re-run our scanner
node <dsh-bridge>/tools/scan/dist/index.js /tmp/vibe-audit   # expect grade F, families CRED/HOOK/NET/OBFU

# 3. Confirm the headline claims
grep -rn "ralph-wiggum" apps/vgo-cli/src/vgo_cli/external.py            # expect line 62, unpinned npm -g
cat config/global-bootstrap/claude-code-vibe-bootstrap.md              # expect the 8-line injected block
grep -rn "global_instruction_surface\|managed-block-only" \
  adapters/claude-code/host-profile.json                               # expect merge policy, CLAUDE.md relpath
grep -rniE "claude\.md|agents\.md" README.md docs/install/README.en.md # expect: zero disclosure of the write
ls bundled/skills | wc -l                                              # expect 253

# 4. Check the negative claim (no egress in shipped python)
grep -rnE "urllib|requests|socket" apps/ packages/ core/ --include="*.py"   # expect: no hits
```

If your output disagrees with this card, the card is wrong; please open an issue.

## 8. Methodology and pinned inputs

- Subject: git commit `d5ae560440a9ecd83397bb68e77ea1aa2f2c9b78`, shallow clone retained at
  `reference/audits/vibe-skills`; clone HEAD equals the pinned commit.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
  `9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`. Raw output retained as
  `reference/audits/vibe-scan.json`: 131 findings over 395 files scanned (2478 skipped) -
  0 critical, 59 high, 3 medium, 69 low. Machine grade F, driven by a CRED/NET co-occurrence inside
  `config/upstream-lock.json` and by same-family spread across CRED, HOOK, and NET; both are
  adjudicated in section 4.
- Manual review covered: `apps/vgo-cli/src/vgo_cli/` (external.py, process.py, commands.py),
  `packages/installer-core/src/vgo_installer/` (global_instruction_service.py, host_closure.py,
  simple_skill_installer.py, bootstrap_doctor_support.py), all six adapter host-profile and
  settings-map files, `config/global-bootstrap/`, `config/adapter-registry.json`,
  `config/upstream-lock.json`, `scripts/setup/`, README.md (508 lines) and
  `docs/install/README.en.md` (72 lines), plus a sample of the 253 entries in `bundled/skills/`.
- Cross-model adversarial review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- No behavioral probe (pipeline S4 unavailable): adapter differences were read, not run.
- Grade derivation: no egress, no credential access, and no dynamic execution in shipped Python, with
  receipt-tracked, managed-block-only installs. Capped at C by the undisclosed host-global
  instruction write (VS-GLOBAL-1), the unpinned global npm install on the governed path (VS-NPM-1),
  the unexhausted 253-skill corpus (VS-FLEET-1), and the missing probe and second reviewer.

## 9. Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `d5ae5604` (v4.0.0) | C | Initial card. Static scan plus manual review; behavioral probe, cross-model review, and signing pending pipeline availability. |

Re-verify triggers: any user-facing documentation of the `CLAUDE.md`/`AGENTS.md` write (would retire
VS-GLOBAL-1); any pinning of `@th0rgal/ralph-wiggum` or removal of the global npm fallback; growth or
churn in `bundled/skills/` beyond the 253 entries sampled here; the appearance of network imports in
`apps/`, `packages/`, or `core/`; a verified release-ZIP-to-commit comparison; or 90 days elapsed.
