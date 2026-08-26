# Adversarial Review: Wave 1 Research Docs

**Date:** 2026-08-25
**Reviewer:** adversarial review pass (ox-alpha swarm)
**Scope:** `docs/research/dsh-capability-seams.md`, `docs/research/dsh-native-inventory.md`, `docs/research/portable-features.md`, `docs/research/mcp-gap-analysis.md`
**Ground truth:** read-only reference checkout `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master). Files under review were not modified. No git operations.

## Method

Ran roughly 30 spot checks against the reference checkout: regex constants, README quotations, line-numbered citations, package existence, and full enumeration of every registered slash command. Results below.

### Spot checks that passed

| Claim | Source | Result |
|---|---|---|
| Command-name regexes `:28` and `:117`, charset `[a-z0-9_-]`, no `:` | `packages/interaction/commands/src/index.ts` | Exact match, both lines |
| Skill rank order 100/200/300/400/500 and frontmatter fields | `packages/skill/skill-filesystem/README.md` | Verbatim |
| `settingSources` omission quote, provider "neither copies nor filters" | `packages/subagent/subagent-claude-code/README.md:17` | Verbatim |
| `dsh plugin` "forwarding ... to pnpm in the profile directory" | `apps/cli/src/args.ts:171` | Exact |
| `DSH_HOME_DIR_NAME = '.dsh'` | `packages/util/home-paths/src/index.ts:12` | Exact |
| mcp-client transport union, duplicate-serverName error copy `:148-161`, `failOnStartupError` rollback `:172-180` | `packages/mcp/mcp-client/src/index.ts` | Matches cited ranges |
| Reconnect defaults 500ms/30s/10 attempts, budget exhaustion unregisters tools | `packages/mcp/mcp-client/src/connection.ts` | Verbatim |
| Stale "does not auto-reconnect" claim in example README | `examples/mcp-memory/README.md:82` | Confirmed present; gap doc's staleness finding is correct |
| Layer order, home layer outranks profile, watched-and-reapplied patches | `apps/cli/reference/README.md:9,79-81` | Verbatim |
| MCP off-by-default rationale sentence | `apps/cli/reference/README.md:93` | Verbatim |
| Telemetry disable row `{id: 'session-telemetry-otel', disabled: true}` | `apps/cli/src/profile-boot.ts:57,81-83` | Confirmed |
| `allowBuilds` / `prepare` / `#<sha>` pinning quotes | `docs/user/develop/basic/publish.md:163-173` | Verbatim |
| Inventory entry shape `{entryId, moduleName, enabled, fiberPhase}`; `static inject = ['loader']` | `packages/host/plugin-inventory/src/types.ts`, `src/index.ts:44,59` | Exact |
| Permission preset descriptions at `:186` and `:190` | `packages/interaction/permission-presets/src/index.ts` | Exact lines |
| Goal authority quote ("direct-human root authority", "three admitted rounds") | `docs/tool-catalog.md:30` | Verbatim |
| Agent Teams ten tools, disabled in shipped base | `docs/tool-catalog.md:40` | Verbatim |
| Schedule constraints (five-minute floor, pre-existing agents excluded) | `packages/schedule/schedule/README.md:5,9` | Verbatim |
| Preset health/broken/id-grammar/authorable quotes; shipped presets incl. `cordis/skills` | `packages/preset/agent-presets/README.md`, `apps/cli/config/agent-presets/` | Verbatim, dirs confirmed |
| CLAUDE.md dedupe quote | `packages/context/agent-instructions/README.md:9` | Verbatim |
| Settings-file hardening (0600, wx symlink refusal, 2s lock deadline, leaf diffs) | `packages/settings/settings-file/README.md:20-24` | Verbatim |
| Credentials four-layer table, `describe()` read-only quote | `packages/credentials/credentials-local/README.md:11-16` | Verbatim |
| Tool-name contract: 64 chars, `[A-Za-z0-9_-]`, 12-hex SHA-256 suffix | `packages/mcp/mcp-client/src/tools.ts:44-55` | Constants confirmed |

Full enumeration of `commands.register({` across `packages/` and `apps/` (excluding tests/fixtures) found exactly six registered commands: `compact`, `feedback`, `goal`, `permission`, `export`, `plan`, plus client-side `model` (`ui-model-selection/src/client/index.ts:127`). This enumeration drives several findings below.

---

## File 1: docs/research/dsh-native-inventory.md

Overall the strongest factual base of the four; nearly every quotation checked out verbatim.

1. **MAJOR** - Wrong command name, contradicted by its own citation.
   Quote (§1.2 table): "`/permissionPresets` | `packages/interaction/permission-presets/src/index.ts:275`"
   The cited line registers `name: 'permission'`, not `permissionPresets`. The error appears twice (§0 summary table row 6 and §1.2). Anyone building an alias per this doc ships a dead mapping, and the doc violates its own evidence standard by citing a line that disproves its label.
   Fix: rename to `/permission` in both places; note the bare invocation reports current preset (confirmed in source comments at `:276-277`).

2. **MINOR** - Verdict-tally arithmetic is wrong.
   Quote (§0): "**Count: 25 capability areas surveyed. 14 SKIP, 7 WRAP, 4 IMPROVE.**"
   By the table's own verdict column the counts are 15 SKIP, 6 WRAP, 4 IMPROVE.
   Fix: correct the tally.

3. **MINOR** - Install-time script claim overstates pnpm >= 10 behavior.
   Quote (§12.4): "install runs arbitrary npm lifecycle scripts before any plugin code is even loaded."
   Under pnpm >= 10 (what `dsh plugin` forwards to, per `args.ts:171`) dependency build scripts do not run until the user allowlists them via `allowBuilds`; `publish.md:163-173` documents this gate. The risk is real but conditional, and the sibling doc (capability-seams §2) states the gate correctly. An overstated security claim weakens the trust story this doc is building.
   Fix: reword to "install can run lifecycle scripts the moment a user allowlists a build (pnpm >= 10 gates this; the installer UX must treat that allowance as the trust boundary)". Keep the conclusion; fix the mechanism.

4. **MINOR** - Unverified client-side command attributions.
   Quote (§1.2): "`/model` | `packages/client/ui-model-selection` (client-side popupSelect via `ctx.commandUi`)"
   The `model` registration at `ui-model-selection/src/client/index.ts:127` is confirmed, so this row is fine, but the same mechanism is assumed for other client surfaces elsewhere without checks. In this document it holds; flagging only to note the pattern was verified once and should not be assumed generally.
   Fix: none required here; apply the same rigor when new client commands are asserted.

---

## File 2: docs/research/portable-features.md

Weakest of the four on ground truth. Its harness-side knowledge is outside review scope; its DSH-side assertions contain phantom natives and contradict the inventory doc.

1. **MAJOR** - Phantom native commands `/sessions` and `/new`.
   Quote (row 5): "DSH exposes `/new` and session lifecycle; `/clear` is an alias-with-expected-semantics."
   Quote (row 6): "DSH has `session-persistence`, `session-query`, `/sessions`."
   Full enumeration of registrations found no `/new` and no `/sessions` anywhere. The inventory doc itself says (§1.2) "`/resume` ... **confirmed absent** as a command" and (§14) leaves "Does any shipped surface offer session resume?" open. Rows 5 and 6, and the MVP cut built on them, rest on commands that do not exist.
   Fix: mark `/new` and `/sessions` as absent (S becomes M: the picker must also provide create-session entry), or cite the actual surface if one exists in a client package not yet read (`ui-sidebar`, `ui-workspace` were flagged unread in the inventory doc).

2. **MAJOR** - `/model` ranking contradicts the inventory verdict.
   Quote (row 2): "`/model` ... **S** | **5** ... bridge value is the *typed command with fuzzy alias*" and MVP cut item 4: "**`/model`** - switch and show".
   The inventory doc (§0, §1.2) verdicts native `/model` as **SKIP**: "exists and is better than most (effort selection). Alias only." Ranking a SKIP item as the number-two port and an MVP requirement is wrong-headed by the set's own scoring: effort is not zero if familiar-name aliasing onto routes is real work, and the value is diluted by the existing two-level menu. Meanwhile `/compact` (a genuine daily reflex) sits at value 4.
   Fix: demote `/model` to "alias, post-MVP" citing the inventory SKIP, or justify the reversal explicitly. Re-examine value scores: permission-flag vocabulary (row 8, value 5) is plausibly lower-reflex than `/compact` (value 4); bash passthrough (row 24, value 3) is among the highest-frequency CC keystrokes and is scored below `/export`.

3. **MINOR** - Permission preset names invented.
   Quote (row 7): "`permission-presets` (`read-only`, `ask`, `danger-full-access`)"
   Shipped defaults are `workspace-write` and `danger-full-access` only (`src/index.ts:184-190`); `ask` is an approval policy, not a preset name.
   Fix: list the two real presets and describe sandbox/approval axes separately.

4. **MINOR** - Unverified native-surface citations bundled into rows.
   Row 16: "DSH has `token-meter`, `session-stats`, `/status`." Token meter exists (`packages/llm/token-meter`); no `/status` command registration was found. Row 22: "**Already native** (`ui-theme`, `/theme`)." Package exists; no `/theme` command registration found. Row 29 cites `ui-plan` as the todo renderer; that package's control is PlanModeControl. These rows drive "already native, do nothing" conclusions, so a wrong citation hides work rather than creating it, but the doc's own standard is citation-backed claims.
   Fix: annotate each with *(verify)* or drop the command names; keep the package paths.

5. **MINOR** - Resolved questions still listed as open.
   Quote (open questions): "Namespacing: `/bridge:install` implies colon-namespaced commands ... Confirm whether `:` is legal in a command name."
   The parser regexes settle this (`index.ts:28,117`: `:` is not in the charset), and the inventory doc already records the resolution. Keeping it open after a sibling doc closed it invites divergent decisions.
   Fix: replace with the resolved answer and link the inventory section.

6. **MINOR** - Difficulty label for markdown commands understates migration mechanics.
   Quote (row 12): "port CC frontmatter ... and `$ARGUMENTS`/`$1` substitution so existing `.claude/commands` trees just work."
   `skill-filesystem` scans `.agents/skills` and `.dsh/skills`, not `.claude/commands`; making old trees "just work" requires custom roots, copying, or symlinking plus a frontmatter translator, which is more than the M label's "state, file I/O, or a UI slot" implies. Borderline, but the promise "just work" is doing hidden work.
   Fix: either scope the row to a converter/importer command or move to L.

---

## File 3: docs/research/dsh-capability-seams.md

Accurate on every spot check (mechanics, layer order, allowBuilds, inventory shapes). Findings are about hedging and cross-doc state.

1. **MINOR** - Open question already answered by a sibling doc from the same wave.
   Quote (§4 item 3): "**MCP runtime management** - adding/removing an MCP server means editing patch rows + reload; is there a supported hot-add path via `dynamicCordisRunner`?"
   `mcp-gap-analysis.md` §7 closes this: no programmatic hot-add path found; the watched-patch path is sufficient and live-applied. Leaving it open in this doc makes the seam map look less settled than the evidence allows.
   Fix: mark resolved, cite the gap analysis.

2. **MINOR** - Security consequence deserves the same prominence as the mechanics it follows.
   Quote (§1 end): "a malicious plugin's effects all run inside the host process - sandboxing is per-tool-call, not per-plugin."
   This is the technical foundation of the project's killer feature and it is a trailing sentence on a lifecycle paragraph. The inventory doc elevates the adjacent point (install-time scripts) to "the single strongest technical justification"; the in-process consequence here is equally strong and currently easy to miss.
   Fix: promote to its own subsection or forward-reference the trust-layer design.

3. **MINOR** - Duplicate maintenance surface for MCP facts.
   Quote (§1 MCP row): "each MCP server = one `@deepseek-ai/dsh-mcp-client` plugin instance in `cordis.yml` ... registering tools as `mcp__<server>__<rawName>`"
   The same naming rule, layer order, and config-shape facts appear here, in the inventory doc §10, and in full in the gap analysis. Three copies will drift; the gap analysis is the authoritative one.
   Fix: reduce §1's row to a summary plus a pointer to `mcp-gap-analysis.md` as the source of truth.

---

## File 4: docs/research/mcp-gap-analysis.md

Best doc of the four. Every line-numbered citation checked (transport union, duplicate-name error copy, reconnect defaults, scrub function, stale example README, config-catalog range, test file) matched source. The upstream-inconsistency find (§5) is verified real. Only minor notes:

1. **MINOR** - TL;DR slightly undersells what exists for status.
   Quote (TL;DR): "There is **no dedicated CLI verb, no wizard, no status panel, no import path**."
   Accurate for MCP-specific surfaces, and §2 immediately gives the honest nuance (read-only inventory tab shows effective config and enablement). The bolded absolute is fine internally but is the sentence most likely to be quoted out of context in the README.
   Fix: none required; if excerpted publicly, prefer §2's phrasing ("read-only inventory view and a live-reload execution path, but zero create/edit/remove/test/import affordance").

2. **MINOR** - G8's user-facing impact could name the observed symptom.
   Quote (G8): "Stalls delay activation/teardown; probes need their own deadline."
   Correct per the README's known-limitations entry (SDK 60-second default). For the spec writer, the observable failure is a boot or Settings mount that hangs up to a minute per unreachable server.
   Fix: add the symptom to the Impact cell so acceptance tests can assert it.

---

## Cross-document contradictions and overlaps

1. **Contradiction: `/model`.** Inventory: SKIP (native, better than peers). Portable-features: MVP item, value 5, ranked second overall. See File 2, finding 2.
2. **Contradiction: session commands.** Portable-features asserts native `/new` and `/sessions`; inventory confirms no resume command exists and enumerates the same six registrations implicitly. See File 2, finding 1.
3. **Tension: install-time execution risk.** Inventory §12.4 states it unconditionally; capability-seams §2 documents the pnpm >= 10 `allowBuilds` gate. Both cannot be quoted side by side without reconciliation. See File 1, finding 3.
4. **Overlap: MCP facts in three places.** Capability-seams §1, inventory §10, and the gap analysis repeat naming, layering, and config-shape facts. The gap analysis is authoritative and newer. Consolidate pointers.
5. **Consistency strength worth keeping:** all four docs independently converge on the colon-command problem and on `/help`, `/login`, `/init`, `/resume`, `/mcp` as the real gaps. That convergence held up under enumeration and is the set's most load-bearing conclusion.

## Verdict

**Approve with revisions. No blockers.** Citation hygiene is unusually strong for AI-generated research: roughly 30 spot checks produced zero fabricated quotes and only one wrong identifier (File 1, finding 1). Three major findings must be fixed before these docs drive implementation: the `/permissionPresets` misnomer, the phantom `/new`//`/sessions` natives anchoring the MVP session cluster, and the `/model` ranking contradiction, because each would convert directly into wasted or broken work. The minors are wording and bookkeeping. Recommended order: fix File 2 first (it drives scope), then File 1, then deduplicate MCP prose toward the gap analysis.

---

## Fixes applied

**Date:** 2026-08-26
Every citation below was re-verified against `reference/deepseek-harness` before the corresponding edit: full re-enumeration of `commands.register` across `packages/` and `apps/` (six server-side names plus client-side `model`, unchanged from the review's enumeration), line reads of the cited sources, and existence checks for every package path touched.

### docs/research/portable-features.md

- Finding 1 (phantom `/new`, `/sessions`) had been fixed in the doc's Revision 1 pass before this maintenance window; rows 5 and 6 now state both commands absent, difficulty S to M, MVP session cluster reordered. Verified consistent with the re-enumeration; no further edit.
- Finding 2 (`/model` ranking), applied: row 2 value lowered 5 to 3, MVP item 4 replaced with `/compact`; familiar-name aliasing moved to post-MVP. Partial rebuttal recorded below.
- Finding 3 (invented preset names), applied: row 7 now lists exactly `workspace-write` and `danger-full-access`. One correction beyond the finding: `read-only` does exist as a sandbox mode (`sandbox-policy/src/index.ts`, fail-safe default) even though it is not a preset name, so the row distinguishes sandbox modes from approval policies (`user-approval/src/index.ts:97`: `'ask' | 'never'`) instead of dropping the vocabulary entirely.
- Finding 4 (unverified native-surface citations), applied and upgraded: rows 16, 22, 23 annotated or corrected after actual enumeration, not just marked *(verify)*. No `/status` and no `/theme` command registration exists anywhere in the checkout; `token-meter`, `session-stats`, `ui-theme`, `runtime-diagnostics` packages all exist and their paths were kept. Row 29 additionally corrected beyond the flag: the todo checklist renderer is `ui-conversation`'s `TodoPanel.tsx`; `ui-plan` provides the plan-mode control.
- Finding 5 (resolved question still open), applied: colon-namespacing question struck through and answered with citations (`commands/src/index.ts:28,117`), cross-referenced to the inventory doc.
- Finding 6 (markdown-command difficulty), applied: row 12 raised M to L, rescoped to a converter/importer command, scan roots cited (`.dsh/skills`, `.agents/skills`, not `.claude/commands`, per `skill-filesystem/README.md:35-38`).
- Reviewer's re-scoring suggestions partially adopted: bash passthrough (row 24) raised 3 to 5 as suggested. Row 8 kept at value 5; see rebuttal below.

### docs/research/dsh-native-inventory.md

- Finding 1 (`/permissionPresets` misnomer), applied: renamed to `/permission` in both places (§0 summary row 6 and §1.2 table), bare-invocation behavior described per source comments (`src/index.ts:276-277`). Grep confirms no remaining occurrence of the misnomer anywhere under `docs/research/`.
- Findings 2 and 3 had been fixed in the doc's Revision 1 pass (verdict tally 15 SKIP / 6 WRAP / 4 IMPROVE; §12.4 rewritten around the pnpm >= 10 `allowBuilds` gate with observable install-flow symptoms). Spot-checked against `args.ts:171` and `publish.md:163-173`; both hold.
- Finding 4 required no change per the review itself; the doc's existing single verified attribution stands.

### docs/research/dsh-capability-seams.md

- Findings 1 and 3 had been fixed in the doc's Revision 1 pass (MCP hot-add question marked resolved citing the gap analysis §7; §1 MCP row reduced to summary plus authoritative pointer). Verified present and accurate.
- Finding 2 (promote the security consequence), applied: new subsection 1.1 carries the in-process-execution consequence as its own section, cross-referencing the install-time argument in `dsh-native-inventory.md` §12.4.

### docs/research/mcp-gap-analysis.md

- Finding 2 (G8 symptom), applied: Impact cell now names the observable failure (boot or Settings mount hanging up to ~60s per unreachable server), worded from the README known-limitations entry the review cited.
- Finding 1 required no change per the review itself; noted in the doc's Revision 1 entry.

### Rebuttals (no doc change made)

1. **File 2, finding 2, second half:** the reviewer suggests permission-flag vocabulary (row 8, value 5) is plausibly lower-reflex than `/compact` (value 4). Kept at 5 deliberately: for the charter's refugee audience, approval-mode mapping is a first-ten-minutes trust decision (whether they can run YOLO at all), which is a different reflex class from `/compact`'s frequency-based value. Both stay in the MVP cut; revisit with usage evidence, not intuition.
2. **File 2, finding 2, nuance inside the accepted fix:** the demotion accepts the inventory SKIP verdict as controlling, but the reviewer's own reasoning (aliasing effort is not zero) cuts toward post-MVP rather than never. The row records aliasing as deferred work with a reopen condition, not a dead feature.
