# `/status` — Single-Glance Dashboard Spec

> Status: draft · Owner: dsh-bridge · Inspired by the Claude Code / Jcode status strip and `git status` at-a-glance culture.
> Companion to `/doctor` (`docs/specs/commands/doctor.md`): doctor *checks*, status merely *reports what is already known*. Every row cites where its number comes from; nothing on this screen is computed by probing the network or re-running a scan.

## Purpose

`/status` answers one question in under two seconds: **"What is my DSH bridge doing right now?"** It is the dashboard a returning user glances at before working: which profile am I in, which model will answer my next message, which bridge features are actually mounted in this composition, did my last connector smoke test pass, how many installed plugins carry a current trust card vs. one older than 30 days, and roughly where my context/token budget stands.

Design rules inherited from the charter (*trust over speed*):

1. **Reported, never re-derived.** Status reads existing services, projections, files, and cached results. It performs **zero network calls** and runs **zero checks** — if a figure cannot be sourced, the row says `unavailable` and names the command that would produce it (usually `/doctor` or `/bridge:connect`).
2. **No secrets, no surprises.** Credential rows show presence/masking only, same masking rules as `/doctor` (`sk-…last4`).
3. **Staleness is data.** A trust card older than 30 days is not hidden or silently trusted; it is counted and listed so the user can act.

Out of scope: health checking (that is `/doctor`), changing anything (that is `/model`, `/bridge:install`, `/bridge:connect`), and plugin content auditing (that is the trust layer).

## Data sources table

| # | Row | What it shows | Source (DSH runtime) | If unavailable |
|---|-----|---------------|----------------------|----------------|
| S1 | Current profile | Profile name + directory | Profile = `$DSH_HOME/profiles/<name>` (`$DSH_HOME`, else `~/.dsh`) per app-boot profile machinery — `reference/deepseek-harness/packages/boot/app-boot/README.md:38`; manifest via `readProfileManifest` (same file, line 20) | Print `$DSH_HOME` fallback path and mark `unknown profile` |
| S2 | Active model route | `provider/model`, reasoning effort if set, live/dormant flag | `ctx.agentDefaultModel.currentSelection()` returns `{ provider, model, reasoningEffort? }` — `packages/core/agent-default-model/README.md:9`; live-vs-dormant from merging `ctx.llm.listProviders()` with `listConfigurableProviders()` — `packages/llm/llm/README.md:18,20`; context-window capacity via `resolveModelInfo().context` — `packages/llm/README.md:26,39` | Route shown with `⚠ dormant` hint pointing at `/doctor` |
| S3 | Mounted dsh-bridge features | Which bridge capabilities are actually loaded (connectors flow, trust layer, install catalog) | Cordis composition truth: entries present in the booted tree / profile patch layers (`profiles/<name>/cordis.patch.yml`, home-level overlay outranks it) — `packages/boot/app-boot/README.md:43`; patch-file HMR means the list can change mid-session via `watchUserPatches` — same file, line 45 | List only what the patch files name; never claim a feature that is not mounted |
| S4 | Last connector smoke result | Pass/fail + route + timestamp of the most recent connector verification | dsh-bridge's own persisted smoke record written by `/bridge:connect <provider>` (same result `/doctor` check C9 produces on demand) — `docs/specs/commands/doctor.md` C9 | `never run` + pointer to `/bridge:connect` |
| S5 | Plugin count + stale trust cards | Installed-plugin count; count + list of plugins whose trust report card predates 30 days | Count from profile `package.json` out-of-tree dependencies + bundle manifest — `packages/boot/app-boot/README.md:38`; cards from dsh-bridge's repo-local records `docs/trust/<plugin>/<commit>.md` with provenance date — `docs/design/trust-report-card.md` §8 (provenance/staleness semantics §7); stale := `verified-on > 30 days ago` OR upstream-moved state per §7 | Card missing ⇒ counts as `?` unreviewed, never as fresh |
| S6 | Token usage | Session tokens (input/output/cache split), context pressure % of window | Projection units registered by `@deepseek-ai/dsh-token-meter`: `tokenUsage` (`uncachedInputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`) — `packages/llm/token-meter/README.md:28`; occupancy reads `projectedTokens` over adapter-advertised `contextWindow` — same file, lines 30–32, 40 | `unavailable` when the composition does not mount token-meter or the projection seam — unloading token-meter removes all three keys (`token-meter/README.md:36`); whole-log timing extras from `sessionStats` only exist in the web-app bundle — `packages/session/session-stats/README.md:39` |

Optional runtime diagnostics row (S7, shown only when the invariant service is loaded): count of active package-owned invariant registrations via `ctx.invariants.register`'s reservation model — `packages/runtime-diagnostics/invariants/README.md:5`, `packages/runtime-diagnostics/invariants/src/index.ts:136`. A violated invariant surfaces as `InvariantError` with stable `code: 'INVARIANT'` (`invariants/src/index.ts:52`) and would already have failed loudly; status only reports the healthy count.

## Mockup

```
$ dsh bridge status            # also: /status inside a session

dsh-bridge status — 2026-08-25 19:47 · profile web (~/.dsh/profiles/web)

  PROFILE     web · 3 bundles + 1 user patch layer (cordis.patch.yml)
  MODEL       deepseek/deepseek-chat · effort: none · window 128k
              └─ live · adapter @deepseek-ai/dsh-llm-deepseek
              └─ /model to switch
  BRIDGE      connectors ✓ · trust layer ✓ · install catalog ✓   (3/3 mounted)
  CONNECTORS  last smoke: PASS · deepseek/chat · 412 ms · today 19:02
              └─ /bridge:connect <provider> to re-run
  PLUGINS     4 installed · trust cards: 2 A · 1 B · 1 ?
              ⚠ stale (>30d): dsh-market (card dated 2026-07-12, grade B)
                ↻ /bridge:trust dsh-market to re-verify
  TOKENS      session 41.2k in (36.0k uncached · 4.1k cache-read · 1.1k cache-write)
              · 3.8k out · context ≈ 34% of 128k (projected next-request)
              └─ provider-reported usage, projected delta estimated

  All figures reported from mounted services and local records — nothing probed.
  Deep check: dsh bridge doctor --net --probe
```

Rendering rules:

- One block label per row, uppercase, fixed column; sub-lines indented under their row starting `└─`.
- Warnings use `⚠` plus an action line (`↻ <command>`), matching the trust-card icon vocabulary (`docs/design/trust-report-card.md` §2).
- Occupancy percentage must be presented as a reference figure, not billing truth: token-meter documents that pressure/window pairs are independent last-wins records and "an occupancy percentage is a user-facing reference figure" (`packages/llm/token-meter/README.md:40-42`). The word `≈` is mandatory.
- `--json` emits `{row, key, value, source, asOf}` per entry machine-readably for panels and CI.
- Non-TTY degrades to plain text with the same labels; colors/symbols follow the `/doctor` degradation rule.

## Refresh semantics

| Trigger | Behavior |
|---|---|
| Invocation | Re-read every row synchronously from services/files; render once. No daemon, no polling loop. |
| Model route changes | `LlmRuntime` emits payload-free `llm/adapters-updated` after any topology commit so consumers re-read instead of polling (`packages/llm/llm/README.md:37`); a long-lived panel subscribes to this event and invalidates only S2/S3. |
| Patch/config edits | Profiles keep `cordis.patch.yml` live through `watchUserPatches`; recomposition is transactional and failure leaves the last good tree running (`packages/boot/app-boot/README.md:45`). Status therefore treats its S3 snapshot as valid-until-next-read and stamps each render with the time taken. |
| Token figures | Read from the projection store's latest committed value (`asOfSeq` cut); status never folds logs itself. Figures are as-of-last-event, labeled with the session id implicitly by being session-scoped. |
| Trust cards | Read from disk each invocation; the 30-day comparison uses the card's recorded verification date, not file mtime, so a checkout does not fake freshness. |
| Never refreshes by itself | No background timers, no network. A stale screen is preferable to a surprise API call (charter: no undocumented network). |

## Acceptance criteria

1. `/status` renders all six core rows in ≤ 500 ms wall time with zero network calls — asserted by a test wrapping all I/O.
2. Every rendered value is traceable to a named source (table above); a value whose source is missing renders `unavailable` plus the producing command, never a blank or a guess.
3. Removing `@deepseek-ai/dsh-token-meter` from the composition flips exactly the TOKENS row to `unavailable`; all other rows unchanged (no cascading failures).
4. Setting an unreachable model config flips MODEL to the `⚠ dormant` state while PROFILE/PLUGINS rows stay green.
5. Backdating a plugin's trust card by 31 days makes it appear under the stale list on the next invocation; at 29 days it does not (boundary test both sides).
6. Zero secret material appears in text or `--json` output — masked last-4 allowed, full values forbidden (same test approach as `/doctor` acceptance #2).
7. `--json` parses as JSON and carries the same values as the text rendering (parity test).
8. Works identically under `$DSH_HOME` override; unit tests cover both roots.
9. Non-TTY invocation emits symbol-only output with correct content (CI-safe).
