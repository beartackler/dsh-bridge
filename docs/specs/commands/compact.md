# `/compact` — Manual context compaction

> **Status:** spec (not implemented)
> **Owner:** dsh-bridge familiar-face command surface
> **Muscle memory ported from:** Claude Code `/compact [instructions]`, Codex `/compact`
> **Reference checkout:** `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (`packages/compaction/**`)

---

## 1. Purpose

Give Claude Code / Codex / OpenCode / Jcode users the exact `/compact` they already
have in their fingers, on DSH:

1. **`/compact`** — compact older history now, without waiting for the auto threshold.
2. **`/compact <instructions>`** — compact now, steering what the summary preserves
   ("keep the auth refactor decisions and the failing test names").
3. **`/compact status`** — surface the *auto*-compaction threshold: current context
   pressure, the configured threshold, and headroom, so compaction stops being an
   invisible event that silently rewrites your conversation.

The design constraint from CHARTER.md applies: **trust over speed**. Compaction is a
destructive-feeling operation (it shadows real conversation history), so the command
must always state token cost before and after, and must name what it kept.

---

## 2. Native-state summary

**DSH has a real, well-factored compaction capability family, including a `/compact`
command.** dsh-bridge is therefore *mostly* a thin wrapper + UX layer — but three of
the four features above require a genuine seam that does not exist today.

### 2.1 What exists natively

| Package | Role | Evidence |
|---|---|---|
| `@deepseek-ai/dsh-compaction` | Service Definition `ctx.compaction` | `packages/compaction/compaction/src/index.ts:96` (`abstract class CompactionEngine extends Service`) |
| `@deepseek-ai/dsh-compaction-basic` | Token-pressure + summarization backend | `packages/compaction/compaction-basic/src/index.ts` |
| `@deepseek-ai/dsh-compaction-tool-result-pruner` | Optional model-free pruning | `packages/compaction/compaction-tool-result-pruner/src/index.ts` |
| `@deepseek-ai/dsh-command-compact` | **Existing human `/compact` command** | `packages/compaction/command-compact/src/index.ts:100-104` |
| `@deepseek-ai/dsh-token-meter` | `ctx.tokenMeter` measurement service | `packages/llm/token-meter/src/index.ts:74` |

Family overview: `packages/compaction/README.md:7-12`.

**Manual compaction entry point** — `CompactionEngine.compactNow(agent, signal, sourceCommandId)`
(`packages/compaction/compaction/src/index.ts:139-143`) explicitly exists to
"compact useful history even below automatic pressure thresholds", returns
`CompactionResult | null` (`null` = no safe useful range), and throws a classified
`ManualCompactionError` with a **closed** code union `'busy' | 'cancelled' | 'changed' |
'summary' | 'commit' | 'persistence'` (`.../compaction/src/index.ts:28-34`).
The `compaction-basic` implementation is at `packages/compaction/compaction-basic/src/index.ts:368`.

**`CompactionResult`** (`packages/compaction/compaction/src/types.ts:93-119`) already carries
everything a good UI needs: `shadowedSeqs`, `shadowedTokenCount`, `summary`,
`summarySeq`, and a durable `compactionId`.

**Token accounting is already available.** `ctx.tokenMeter.measure(session)`
(`packages/llm/token-meter/src/index.ts:116`) returns a `TokenMeasurement` with
`totalTokens`, `surfaceTokens`, and a provider-anchored `baseline`
(`packages/llm/token-meter/src/types.ts:21-33`).

**Auto-compaction threshold is computable.** `compaction-basic` defaults to
`thresholdRatio = 0.8` and `retainRatio = 0.16`
(`packages/compaction/compaction-basic/src/config.ts:20,23`), with
`thresholdTokens = Math.floor(contextWindow * policy.thresholdRatio)`
(`.../config.ts:144`). Auto policy fires when
`measurement.totalTokens >= spec.thresholdTokens`
(`packages/compaction/compaction-basic/src/index.ts:304,312`). Auto can be disabled
via `auto: false` (`.../config.ts:95`, honored at `.../index.ts:129`).
The `contextPressure` session projection already publishes `pressureTokens`,
`projectedTokens`, and `contextWindow`
(`packages/llm/token-meter/src/projection.ts:30-48`).

**The preserve-list already exists — as a fixed prompt.** `COMPACTION_INSTRUCTION`
(`packages/compaction/compaction-basic/src/summarizer.ts:31`) mandates an eight-section
Markdown checkpoint: *Primary Request and Intent, Key Technical Concepts, Files and Code,
Errors and Fixes, Pending Jobs, Current Work, Next Step, Critical Context*. That last
section is specified as "decisions and their rationale, constraints, user preferences,
open questions". The result is wrapped in `<compacted-summary>` tags
(`.../summarizer.ts:21`) with a checkpoint preamble via `frameSummary`.

### 2.2 What does NOT exist (the gaps)

| Gap | Evidence | Consequence for this spec |
|---|---|---|
| **G1. Native `/compact` rejects all arguments.** | `USAGE = 'Usage: /compact (no arguments)'` (`command-compact/src/index.ts:13`) and an early `if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: USAGE }` (`:62-64`). | `/compact <instructions>` and `/compact status` are *hard errors* today. Bridge must own the command. |
| **G2. No instruction seam into summarization.** | `COMPACTION_INSTRUCTION` is a module-private `const` (`summarizer.ts:31`), inlined as the final user message at `summarizer.ts:149`. Neither `compactNow` nor `compactRegion` accepts guidance (`compaction/src/index.ts:139,164`). | Steering the summary requires an upstream seam (§5) or a documented bridge-side fallback. |
| **G3. No before/after token display.** | Success text is only `` `Compacted ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).` `` (`command-compact/src/index.ts:70`). | Bridge must sample `ctx.tokenMeter` itself, before and after. |
| **G4. No threshold surfacing / no `status`.** | No read-only path in `command-compact`; threshold math lives in `compaction-basic`'s non-exported resolution path (`config.ts:129 resolveCompactSpec`). | `/compact status` must reconstruct the threshold from the `contextPressure` projection + bridge config, and must degrade honestly when it cannot. |
| **G5. Command-name collision.** | The registry throws `command "<name>" is already registered` for a duplicate global registration (`packages/interaction/commands/src/index.ts`, `CommandLayer` constructor). | Bridge **must not** co-load `@deepseek-ai/dsh-command-compact`. See §3.1. |
| **G6. `ctx.tokenMeter` is optional.** | Registered as its own service (`token-meter/src/index.ts:74`) and consumed by `compaction-basic` only through injection. | Bridge must `ctx.inject(['tokenMeter'])` and degrade to native-style output when absent. |

**Verdict:** *thin wrapper + progress UX for the compaction itself* (G-nothing — reuse
`ctx.compaction.compactNow` verbatim), **plus** a small local seam for token display and
threshold reporting, **plus** one upstream-shaped seam for instructions (§5).

---

## 3. Behavior

### 3.1 Registration and composition

- Package: `@dsh-bridge/command-compact`.
- `export const inject = ['commands', 'compaction']`, plus
  `ctx.inject(['tokenMeter'], ...)` for the optional measurement child, mirroring the
  native pattern (`command-compact/src/index.ts:11`; optional-child pattern at
  `token-meter/src/index.ts:88-94`).
- Registers a **single** command `compact` with
  `input: { hint: '[instructions] | status' }` so capable clients advertise the grammar
  (`CommandDefinition.input`, `commands/src/index.ts:60`).
- **Collision guard (G5):** the bridge profile MUST NOT also load
  `@deepseek-ai/dsh-command-compact`. The bridge installer removes it from the profile
  patch and, at load, if registration throws the duplicate-name error, the plugin fails
  loudly with a remediation message naming the conflicting package. Never silently
  shadow a user's existing command.
- Lifecycle mirrors native: an `active` set drained in `ctx.effect` **before**
  registration, so LIFO teardown quiesces in-flight handlers
  (`command-compact/src/index.ts:96-105`).
- `recordInput` stays default-true so instructions land in the `command/run` event and
  the compaction is reconstructable from the log alone.

### 3.2 Argument grammar

`rawInput` is the exact text after the command name, including separator whitespace
(`commands/src/index.ts:39-40`). Parse as:

| Input | Mode |
|---|---|
| empty / whitespace only | `run` with no instructions |
| `status` (case-insensitive, trimmed, no further tokens) | `status` |
| anything else | `run` with `instructions = rawInput.trim()` |

Notes:
- `status` is deliberately the only reserved word, and only when it is the *entire*
  argument. `/compact status of the auth work` is instructions, not status. This is
  documented in `/help` output and in the input hint.
- Instructions longer than 2000 characters are rejected with a
  `kind: 'error'` result rather than truncated (silent truncation would mislead the user
  about what was preserved).
- Attachments (`invocation.attachments`) are not used by this grammar. If any are
  present, return an error so the dispatching composer retains the originals — this is
  the contract documented at `commands/src/index.ts:41-47`.

### 3.3 `run` mode — execution sequence

1. **Measure before.** If `ctx.tokenMeter` is available, capture
   `before = ctx.tokenMeter.measure(invocation.agent.session)`. Record
   `before.totalTokens`, `before.baseline.kind` (`'none' | 'estimated' | 'usage'`), and
   `before.nodes.length`.
2. **Announce.** Emit a progress line immediately (see §4.1). Compaction is a
   model-backed call and can take many seconds; native `/compact` shows nothing until it
   finishes.
3. **Invoke.** `await ctx.compaction.compactNow(invocation.agent, invocation.signal, invocation.commandId)`.
   - With instructions, invoke through the instruction seam of §5.
   - The agent-idle serialization, the durable `compaction/start` lock, FIFO admission of
     later prompts, and cancellation are all owned by the engine
     (`compaction/src/index.ts:119-143`). The bridge adds no locking of its own.
4. **`null` result** → success, text `No compactable history yet.` (preserve the native
   string verbatim; users grep for it).
5. **Measure after.** Re-measure with the same meter. Because compaction reports no
   provider usage of its own, `projectedTokens` / the meter's surface delta is exactly
   the mechanism designed to react to a shadowed span
   (`token-meter/src/projection.ts:37-44`). Report:
   - `before.totalTokens` → `after.totalTokens`
   - freed = `max(0, before.totalTokens - after.totalTokens)`
   - `result.shadowedSeqs.length` items shadowed, `~result.shadowedTokenCount` tokens of
     shadowed content (the engine's own accounting; show both, they answer different
     questions).
6. **Preserve-list.** Parse the landed summary (`result.summary`) for the section
   headings mandated by `COMPACTION_INSTRUCTION` (`summarizer.ts:31-64`) and report which
   sections came back non-empty, specifically calling out **Critical Context**
   (decisions/rationale/open questions) and **Pending Jobs** + **Next Step** (open
   threads). A section whose body is `(none)` counts as empty. Never invent sections; if
   heading parsing finds none (a non-`compaction-basic` backend), fall back to
   "Summary preserved (structure not recognized for this backend)".
7. **Correlation.** Return `sourceEventSeq: result.summarySeq`, matching native
   (`command-compact/src/index.ts:71`), so the client can scroll to the checkpoint.

### 3.4 `status` mode — read-only threshold surfacing

`status` performs **no** compaction, takes no lock, and never calls a model.

1. Read the `contextPressure` projection for `pressureTokens`, `projectedTokens`, and
   `contextWindow` (`token-meter/src/projection.ts:30-48`). All three are optional and
   absent until a provider reports usage / advertises capacity — report honestly.
2. Read `ctx.tokenMeter.measure(session)` for `totalTokens` and the `contextBreakdown`
   projection for `systemTokens` / `toolsTokens` / `messageTokens`
   (`token-meter/src/projection.ts:59-66`).
   **Present the breakdown as composition, never as a total** — the projection doc
   explicitly warns the three figures do not sum to `projectedTokens` because the
   estimator underprices CJK and JSON schemas (`token-meter/src/projection.ts:50-58`).
   The mockup labels it "composition (approx)".
3. Compute the auto threshold as `floor(contextWindow * thresholdRatio)`, mirroring
   `resolveCompactSpec` (`compaction-basic/src/config.ts:144`), using the bridge's
   configured `thresholdRatio` (default `0.8`, `.../config.ts:20`). Because the effective
   ratio may be overridden per provider/model in the user's own
   `BasicCompactionConfig.modelPolicies` (`.../config.ts:109-112`) and that resolution is
   not exported, the bridge MUST label the figure **"configured ratio"** and, when its
   own config was not explicitly set, add the caveat that a `modelPolicies` override for
   the active route would change it. Do not print a confident threshold the bridge cannot
   prove.
4. Report whether auto-compaction is on: the `auto` flag defaults to `true`
   (`.../config.ts:95`; honored at `.../index.ts:129`). If the bridge cannot observe it,
   say "unknown (default: on)".
5. If `contextWindow` is absent, state that no adapter advertised a capacity for the
   current route and point at the exact remediation the backend itself emits:
   "configure contextWindow on that adapter model"
   (`compaction-basic/src/index.ts:300`).

### 3.5 Error handling

Reuse the native classified mapping verbatim (`command-compact/src/index.ts:23-55`) —
these strings are load-bearing and correct. The bridge adds only a leading context line
and keeps the same closed-union exhaustiveness backstop (`assertNever`, `:17-19`).

| Code | Meaning | User-facing text |
|---|---|---|
| `busy` | active compaction, or agent not idle | "Compaction is unavailable because this process has an active compaction, or the agent is not idle." |
| `cancelled` | aborted | "Compaction cancelled." |
| `changed` | selected span moved | "The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log." |
| `summary` | no useful summary | "Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log." |
| `commit` | dirty commit stage | "Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying." |
| `persistence` | ran, save failed | "Compaction finished, but the session could not be saved." |

Additional rules:
- Check `invocation.signal.aborted` **before** classifying, as native does
  (`:74`), so a user Esc reads as cancellation rather than a backend fault.
- Unexpected (non-`ManualCompactionError`) throws propagate unchanged. The bridge does
  not swallow unknown failures.
- Measurement is best-effort: if the *after* measurement throws, still report success
  with the engine's `shadowedTokenCount` and omit the before/after line. A reporting
  failure must never turn a committed compaction into a reported error.

### 3.6 Non-goals

- No bridge-side retry. `compactionRetries` / `maxOverflowRetries` are backend policy
  (`compaction-basic/src/config.ts:33-34`).
- No bridge-side range selection. `compactRegion` (`compaction/src/index.ts:164`) stays
  a backend/advanced API; `/compact` never picks seqs itself.
- No telemetry (CHARTER.md non-negotiables).
- `/compact` does not change `auto` config. Toggling auto-compaction belongs to the
  bridge config surface, and `status` only *reports* it.

---

## 4. Output mockup

### 4.1 `/compact` — in progress

```
/compact
⠋ Compacting conversation… 48,210 tokens in context
  Summarizing with deepseek/deepseek-chat · Esc to cancel
```

### 4.2 `/compact` — success

```
✔ Compacted 62 history items

  Context   48,210 → 11,940 tokens   (freed 36,270 · 75%)
  Shadowed  ~35,880 tokens of history, replaced by one checkpoint
  Window    11,940 / 128,000 (9%) · auto-compact at 102,400 (80%)

  Preserved
    ✔ Primary Request and Intent      ✔ Errors and Fixes
    ✔ Key Technical Concepts          ✔ Pending Jobs · 3 open
    ✔ Files and Code · 14 paths       ✔ Current Work + Next Step
    ✔ Critical Context — decisions, constraints, open questions

  Full checkpoint at event #1184 · nothing was deleted, only shadowed
```

### 4.3 `/compact keep the auth refactor decisions and failing test names`

```
✔ Compacted 41 history items  (steered)

  Steering  "keep the auth refactor decisions and failing test names"
  Context   61,455 → 18,002 tokens   (freed 43,453 · 71%)
  Shadowed  ~42,900 tokens of history, replaced by one checkpoint

  Preserved
    ✔ Critical Context — decisions, constraints, open questions
    ✔ Errors and Fixes · 6 entries    ✔ Pending Jobs · 2 open
    ✔ Files and Code · 9 paths        ✔ Next Step

  Full checkpoint at event #922
```

### 4.4 `/compact status`

```
Context pressure

  Now        48,210 tokens
  Window    128,000 tokens (deepseek/deepseek-chat)
  Used            38%  ███████░░░░░░░░░░░░░
  Auto-compact at 102,400 tokens (80%, configured ratio) — 54,190 to go
  Auto-compaction: on

  Composition (approx — heuristic, does not sum to the total)
    System prompt    1,240
    Tool schemas     3,980
    Messages        42,990

  Run /compact now, or /compact <instructions> to steer the summary.
```

### 4.5 `/compact status` — degraded (no usage reported yet)

```
Context pressure

  Now        ~6,120 tokens (heuristic — no provider usage reported yet)
  Window     unknown — no adapter advertised a context window for this route
             Set `contextWindow` on the adapter model to enable auto-compaction.
  Auto-compaction: on (threshold cannot be computed without a window)
```

### 4.6 Errors

```
✖ Compaction is unavailable because this process has an active compaction,
  or the agent is not idle.
```

```
✖ Instructions are too long (2,431 characters, max 2,000).
  Shorten the steering text, or run /compact with no arguments.
```

```
No compactable history yet.
```

---

## 5. Required seam: steered summarization (gap G2)

`/compact <instructions>` is the one feature with no native path. Preferred order:

**(a) Upstream seam — preferred.** Add an optional `guidance?: string` to the manual
entry point and thread it into the summarizer:

- `CompactionEngine.compactNow(agent, signal, sourceCommandId?, guidance?)`
  (`packages/compaction/compaction/src/index.ts:139`).
- `SummarizationInput` gains `readonly guidance?: string`
  (`compaction-basic/src/summarizer.ts:78-86`).
- `summarizeWithLlm` appends the guidance to the final user message *after*
  `COMPACTION_INSTRUCTION` (`.../summarizer.ts:147-152`), so the eight mandated sections
  and the prefix-cache alignment described at `.../summarizer.ts:23-29` are both
  preserved. Guidance **re-weights** sections; it must never be able to remove one.
- Record it durably: add `guidance?: string` to the `compaction/summary` event
  (`compaction/src/types.ts:33-52`), consistent with that event's stated goal that the
  one-shot request be reconstructable from log + code.
- Wrap the user text in a delimited block and label it as user preference, not as new
  instructions to the summarizer, so `/compact ignore everything above` cannot subvert
  the checkpoint contract.

Track as an upstream PR to `deepseek-harness`; dsh-bridge cites the resulting commit.

**(b) Bridge-side fallback — until (a) lands.** If `ctx.compaction.compactNow` does not
accept guidance (feature-detect on function arity / a capability probe), then:

- Inject the steering text as a durable user message immediately before invoking
  `compactNow`, sourced as `{ kind: 'plugin', plugin: 'dsh-bridge-command-compact' }`
  (the same source-kind pattern used at `summarizer.ts:150`), phrased as a compaction
  preference. It becomes part of the replayed span the summarizer condenses.
- This is **best-effort and must be labelled as such** in the output: the mockup's
  `(steered)` marker becomes `(steered · best-effort)`, and `/help` documents that exact
  steering requires the upstream seam.
- Do **not** monkey-patch, re-implement, or fork `compaction-basic`'s summarizer. That
  would violate the no-dynamic-code-execution and no-slop constraints in CHARTER.md and
  would silently diverge from upstream summary structure.

---

## 6. Acceptance criteria

**Grammar**
1. `/compact` with empty `rawInput` runs a compaction; whitespace-only input is treated as empty.
2. `/compact status` (any casing, surrounding whitespace) runs status and performs **no** compaction, takes no lock, and issues no model call.
3. `/compact status of the refactor` is treated as *instructions*, not status.
4. `/compact <2001+ chars>` returns `kind: 'error'` naming the actual and max length; no compaction is attempted.
5. An invocation carrying attachments returns `kind: 'error'` without compacting.

**Wrapping the native seam**
6. The success path calls `ctx.compaction.compactNow` exactly once, forwarding `invocation.agent`, `invocation.signal`, and `invocation.commandId`.
7. A `null` return yields `kind: 'success'` with exactly `No compactable history yet.`
8. Success returns `sourceEventSeq === result.summarySeq`.
9. Every `ManualCompactionErrorCode` maps to the §3.5 text; a synthetic unknown code hits the `assertNever` backstop and throws a `TypeError` rather than rendering a wrong message. A test enumerates all six codes.
10. When `invocation.signal` is already aborted, the result is `Compaction cancelled.` regardless of the underlying error class.
11. Non-`ManualCompactionError` throws propagate unchanged.
12. Teardown drains in-flight handlers before deregistration; no invocation can start after teardown begins.

**Token display**
13. Success output shows before and after `totalTokens` and a non-negative freed figure, sampled from `ctx.tokenMeter.measure()` on the same session before and after the call.
14. Success output shows `result.shadowedSeqs.length` and `result.shadowedTokenCount` as distinct figures from the before/after pair.
15. When the *before* measurement is `baseline.kind === 'estimated'` or `'none'`, figures are marked heuristic (`~`).
16. When `ctx.tokenMeter` is absent, the command still succeeds and falls back to native-shaped text (`Compacted N history items (~T tokens).`).
17. A throwing *after* measurement still yields `kind: 'success'`; the before/after line is omitted.

**Preserve-list**
18. Sections detected in `result.summary` are listed; a section whose body is `(none)` is reported as empty, not present.
19. Critical Context, Pending Jobs, and Next Step are always shown when non-empty (decisions and open threads are the highest-value retained context).
20. An unrecognized summary structure yields the documented fallback line and never a crash or a fabricated section list.

**Status**
21. Status prints current tokens, window, percent used, computed auto threshold, headroom, and the auto on/off state.
22. Missing `contextWindow` yields the §4.5 degraded output including the `contextWindow` adapter remediation, and never a computed threshold.
23. The threshold is labelled "configured ratio" and carries the `modelPolicies`-override caveat when the bridge's ratio was not explicitly configured.
24. The composition breakdown is labelled approximate and is never presented as summing to the total.
25. Status makes no call to `compactNow`, `compactIfNeeded`, or `compactRegion` (asserted by spy).

**Composition & trust**
26. Loading the bridge command alongside `@deepseek-ai/dsh-command-compact` fails at load with a message naming both packages and the remediation; it never silently shadows or double-registers.
27. The plugin ships no `eval` / `new Function` / `child_process` and makes no network calls of its own (verified by the repo's own trust-scanner, per CHARTER.md §3).
28. Instructions appear in the durable `command/run` event (`recordInput` default true), so a steered compaction is reconstructable from the log.
29. Every non-obvious claim in this spec cites `file:line` in the reference checkout, and CI re-verifies the cited symbols still exist.
30. Output contains no secrets, no absolute home paths, and no raw provider payloads.
