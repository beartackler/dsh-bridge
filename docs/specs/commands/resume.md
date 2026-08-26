# `/resume` — Recent-session picker with fork

> **Status:** spec (not implemented)
> **Owner:** dsh-bridge familiar-face command surface
> **Muscle memory ported from:** Claude Code `--resume` / `/resume` (interactive session selector), Codex `resume`
> **Reference checkout:** `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (`reference/packages/session-query/**` below)

---

## 1. Purpose

Give users the reflex they already have from Claude Code: run `/resume`, see your recent
conversations for this project, pick one, and be back inside it in seconds. Concretely:

1. **`/resume`** — open an interactive picker of recent DSH sessions showing **when**, **what**
   (title), and **how much** (message count), newest first, scoped to the current working directory.
2. **Preview before committing** — expanding a row shows a short excerpt of the conversation so
   "is this the session I mean?" is answerable without entering it.
3. **Continue *or* branch** — every selectable session offers **Resume** (continue the same
   conversation) and **Fork** (branch a copy from it), which is the part of `--resume` muscle
   memory Claude Code users reach for when they want to replay a decision differently.

Non-goals (MVP): renaming or deleting sessions from the picker, cross-device sync, attaching
files to a resumed turn, resuming another user's sessions.

Charter alignment: this is a "familiar-face command" mapped onto a DSH-native capability seam
(`ctx.sessionQuery`), not a parallel implementation — every fact the picker shows comes from
cited upstream APIs (CHARTER "Trust over speed": claims cite `file:line`).

---

## 2. Native-state summary

**DSH already ships a complete session-retrieval capability family.** dsh-bridge's `/resume` is
a thin UX layer over it; no storage, indexing, or lineage logic is reimplemented.

### 2.1 What exists natively

| Capability | Seam | Evidence |
|---|---|---|
| Trusted reads over live + durable sessions | `ctx.sessionQuery` service | `reference/packages/session-query/README.md:7-12` (family table); `reference/packages/session-query/session-query/src/index.ts:81` (`abstract class SessionQueryEngine extends Service`, `static inject = ['sessions']`) |
| List all sessions, newest-first, live-preferred | `sessionQuery.listSessions(signal?)` → `SessionRecord[]`, "deterministic newest-first cloned session records" | `session-query/src/index.ts:130-136`; sort key `createdAt` desc, id tiebreak at `session-query/src/corpus.ts:299-301` |
| Live/persisted availability per session | `SessionRecord { header, live, persisted }` | `session-query/src/types.ts:24-31` |
| Batch titles without N round-trips | `readTitleSnapshots(ids, signal?)` → per-id fulfilled/rejected, folds latest `session/title` | `session-query/src/index.ts:197-215` (single-corpus-observation batch via `corpus.projectMany`, `corpus.ts:128-220`); fold itself: `packages/session/session-title/src/index.ts:191-201` |
| Per-session event records (type + time) | `listEvents(sessionId)` → ascending-seq `SessionEventRecord[]` with `time` (epoch ms) | `session-query/src/index.ts:217-225`; record shape `session-query/src/types.ts:61-70` |
| Metadata filters (cwd, created-at range, availability, parent) | `filterSessions(filters)` — ANDed clauses, ORed values | `session-query/src/index.ts:151-165`; clause union `session-query/src/types.ts:194-199` |
| Literal substring scan for fallback filtering | `compileSessionTextFilter(text)` — case-insensitive, whitespace-flexible, injection-safe | `session-query/src/filters.ts:100-118` |
| Full-text search (optional backend) | `searchSessions()` grouped by session with `bestMatch` excerpts | `session-query/src/types.ts:241-253` (request), `:276-279` (`SessionSearchHit.bestMatch`); SQLite FTS5 provider `session-query/session-query-sqlite/README.md:5-11` |
| Resume (rehydrate a durable session as live) | `agentLoop.resume(ownerCtx, { resumeSessionId })` — requires a mounted `sessionPersistence`, else typed error; loads via `persistence.prepare(id)` and republishes the same id | `packages/core/agent-loop/src/index.ts:650-658` (guard: *"cannot resume: session persistence is not configured"*), `:662-700` (`resumeWith` → `prepare` → `setupAndPublish(..., 'resume')`) |
| Persistence contract (list/inspect) | `SessionPersistence.abstract list(): Promise<SessionHeader[]>`, `inspect(id): Promise<SessionInspection>` | `packages/session/session-persistence/src/index.ts:228`, `:200` |
| Fork (branch a child copy) | `sessions.fork(source, boundary?, childId?)` — seeds child with prefix, stamps `parentSession` + `seedLength` | `packages/core/session/src/index.ts:1081-1096`; header fields `packages/core/session/src/types.ts:74-80`; rejection codes `SESSION_NOT_FOUND` / `SESSION_NOT_LIVE` / `SESSION_ALREADY_EXISTS` / `INVALID_BOUNDARY` / `OPEN_TURN` at `core/session/src/index.ts:763-776` |
| What counts as a "message" | Only surface-eligible types produce LLM messages: `user/message`, `assistant/message`, `tool/result` | `packages/core/session/src/types.ts:343-352`; surface states `current`/`shadowed`/`log-only` at `session-query/src/types.ts:20-22` |
| Proven UI pattern for slash-command modals | Shared Modal used by both a header action and the Web `/export` slash command | `session-query/session-log-export/src/client/Dialog.tsx:24-49`; human-command plane keeps model history clean (`session-log-export/README.md:32-43`) |

### 2.2 Gaps dsh-bridge fills (why this is a wrapper, not a passthrough)

1. **No picker exists.** The seams above are services; nothing composes them into a
   claude-code-style interactive selector. That composition *is* this command.
2. **cwd scoping must be explicit.** Native filters treat cwd as data; the picker defaults to
   exact-equality with the current session cwd, mirroring the conservative workspace rule the
   model-facing tools already use (`tool-session-query/README.md:14-15`).
3. **Subagent noise.** Headers carry `origin: 'subagent'` (`core/session/src/types.ts:84-85`);
   a human picker should hide those by default (flag to show).
4. **Cold-session forks need a documented two-step.** `fork()` resolves its source through the
   *live* store only (`_resolveForkSource` → `SESSION_NOT_LIVE` otherwise,
   `core/session/src/index.ts:1070-1080`). See §5.

---

## 3. Listing format mockup

Terminal rendering (TUI/Web share the same row model):

```
  /resume  ·  ~/Documents/GitHub/dsh-bridge  ·  14 sessions  ·  ↑↓ move · ⇥ preview · f fork · ⏎ resume · / filter · esc

> 1  2h ago    Spec sprint: /resume picker                    38 msgs   ● live
    2  5h ago    Adversarial audit: dsh-market install flow     112 msgs
    3  yesterday Trust report cards: grading rubric draft       54 msgs
    4  yesterday Fix gh auth token rotation                   9 msgs
    5  2d ago      Onboarding wizard copy pass                  27 msgs
    ▸ 6  2d ago    Refactor: session-query fixture seeding      71 msgs
    ┌──────────────────────────────────────────────────────────────────┐
    │ Refactor: session-query fixture seeding            2d ago        │
    │                                                                  │
    │ "extract the seeded-session helper so sqlite tests reuse it…"    │
    │                                                                  │
    │ forked from session-41 · archived · last activity 2d ago         │
    │ ⏎ resume   f fork   e expand full preview                        │
    └──────────────────────────────────────────────────────────────────┘
    7  3d ago      …
    8  4d ago      Untitled session                               3 msgs

  / filter: type to narrow · a toggle subagents · n next page (20/page)

  Showing 1–8 of 14. Sessions from other directories are hidden (/resume --all to see).
```

Row fields and where each comes from:

| Field | Source | Evidence |
|---|---|---|
| Relative time (`2h ago`) | `header.createdAt` (Unix ms) formatted relatively; absolute on hover/expand. Last-activity variant: last `SessionEventRecord.time` | `session-query/src/types.ts:67` (createdAt is header field, `core/session/src/types.ts:70-71`); event `time` `session-query/src/types.ts:67` |
| Title | `readTitleSnapshots` batch fold; falls back to `Untitled session` when no `session/title` event exists yet | `session-query/src/index.ts:197-215`; title absence is normal (`types.ts:156-157`: title "absent when the observed log has no title") |
| Msg count | Count of surface-eligible `user/message` + `assistant/message` events (tool results excluded from the headline number), computed from `listEvents` type counts | `core/session/src/types.ts:343-352` |
| `● live` badge | `SessionRecord.live` | `session-query/src/types.ts:28` |
| `archived` badge | `!record.live && record.persisted` | `session-query/src/types.ts:29-30` |
| `forked from …` | `header.parentSession` (+ `seedLength`) rendered via one `traceSession` call when needed | `core/session/src/types.ts:74-80`; `session-query/src/index.ts:273-283` |
| Preview excerpt | First eligible `user/message` text (no search active) or `bestMatch.snippet` (filter active) | `session-query/src/index.ts:55-58` (`extractSessionEventText` export); snippet shape `session-query/src/types.ts:270-273` |

Rules:

- **Ordering is native**: newest-created first, exactly as `listSessions` guarantees — do not re-sort client-side.
- **Page size 20**, matching the SQLite backend's own default limit (`session-query-sqlite/README.md:33`).
- **Previews never print secrets**: excerpt text is truncated to ~240 code points (the backend's own snippet bound, `session-query-sqlite/README.md:35`) and scrubbed by the same secret-location-only rule other bridge commands follow (CHARTER: "never print secrets").
- **Per-row failure isolation is inherited**: a corrupt/unreadable session renders as `⚠ unavailable` instead of breaking the list — `readTitleSnapshots` already isolates per-id rejections (`session-query/src/types.ts:161-177`).

`/resume <text>` pre-fills the filter: with a full-text backend mounted it routes through
`searchSessions({ query, sessionFilters })` (ranked, `bestMatch` snippets); without one it
falls back to the literal scan (`compileSessionTextFilter`, `filters.ts:100-118`) over titles +
first messages. With `openAt: never` configured, search fails typed but every exact read keeps
working — the picker degrades to literal filtering rather than dying
(`session-query-sqlite/README.md:19`).

---

## 4. Selection UX

Modal picker, keyboard-first, mouse-tolerant. Modeled on the proven shared-modal pattern where
one component serves both a header action and the slash command
(`session-log-export/src/client/Dialog.tsx:24-49`).

| Key | Action |
|---|---|
| `↑` / `↓` or `j` / `k` | Move selection (wraps at page edges → paginates) |
| `⇥` (Tab) / `e` | Toggle expanded preview for the highlighted row |
| `⏎` | **Resume** highlighted session (same id becomes live again) |
| `f` | **Fork** highlighted session (see §5) |
| `/` | Enter filter-as-you-type mode (title/preview narrowing per §3) |
| `a` | Toggle inclusion of subagent-origin sessions |
| `PgDn` / `PgUp` or `⇧J` / `⇧K` | Page down/up (20 rows) |
| `esc` / `q` | Cancel — no state change |

Behavioral rules:

1. **Zero-token command plane.** Like `/export`, the picker is a *human-command* interaction:
   browsing produces no model turn and enters nothing into model history
   (`session-log-export/README.md:32-43`). Only the final resume/fork act starts agent work.
2. **Async, cancellable loading.** Rows render as they arrive from `listSessions`; titles fill
   in from the batch fold. Closing the picker aborts outstanding work via the same
   `AbortSignal` plumbing the engine accepts everywhere (`session-query/src/index.ts:134`,
   `:152`, `:198`).
3. **Live rows say so.** A session that is already attached in this process shows `● live`;
   selecting it focuses that session instead of double-attaching.
4. **No persistence backend ≠ dead end.** `listSessions` still returns the live corpus when no
   backend is mounted (`corpus.ts:60-61` — persisted list is simply empty), so the picker shows
   live sessions and renders a footer hint: *"Resume from history needs a session-persistence
   backend"* — mirroring the typed guard in `agent-loop` (`agent-loop/src/index.ts:654-656`).
5. **Empty state.** No sessions for this cwd → *"No sessions in this directory yet. Run something
   first, or /resume --all."*
6. **i18n-ready copy**, English-first (CHARTER), following the locales pattern of the export
   package (`session-log-export/src/client/locales.ts`).

Invocation forms:

| Form | Meaning |
|---|---|
| `/resume` | Open picker scoped to current cwd, subagents hidden |
| `/resume <text>` | Pre-filled filter (§3) |
| `/resume --all` | Drop the cwd scope |
| `/resume --subagents` | Include `origin: 'subagent'` rows |
| `/resume <session-id>` | Skip the picker; confirm-and-resume directly |
| `--json` | Emit the machine-readable row model (for tests/scripts) |

---

## 5. Fork vs resume semantics

These are different operations on different seams, and the picker must never blur them:

| | **Resume** | **Fork** |
|---|---|---|
| Mental model (claude-code parity) | Continue that conversation where it left off | Branch a copy to try a different path; original untouched |
| Identity | Same `SessionId` becomes live again | New child id; parent gets a descendant in its lineage tree |
| History | Full stored log restored verbatim (validated replay) | Prefix copy up to a boundary; `parentSession` + `seedLength` stamp provenance |
| Native seam | `agentLoop.resume()` via `persistence.prepare(id)` | `sessions.fork(source, boundary?, childId?)` |
| Evidence | `agent-loop/src/index.ts:650-658`, `:662-700` | `core/session/src/index.ts:1081-1096` |

Semantics the spec pins down:

1. **Resume is identity-preserving.** After resume, `header.createdAt` and lineage stay as they
   were — headers are immutable and validated on load (`core/session/src/types.ts:58-61`,
   `session-persistence/src/index.ts:84-135`). The picker therefore never displays a resumed
   session with a "new" creation time.
2. **Fork writes provenance, not just copies.** The child header carries `parentSession` and
   `seedLength`, which is precisely what lets future tooling distinguish inherited history from
   child work (`core/session/src/types.ts:74-80`). The picker renders that lineage as
   `forked from …` using `traceSession` (`session-query/src/index.ts:273-283`).
3. **Warm vs cold fork targets.** `fork()` only accepts a source that is live in the store
   (`core/session/src/index.ts:1070-1080`). Therefore:
   - Highlighted row is `● live` → fork directly (`sessions.fork(id, boundary)`).
   - Row is cold/archived → the picker runs **resume-to-fork**: load through the persistence
     prepare path, publish, immediately `fork()`, then detach if the user only wanted the fork.
     Progress is surfaced in the modal; aborting mid-load leaves nothing half-written because
     preparation is transactional (`core/session/src/preparation.ts:15-52`).
4. **MVP boundary = last committed turn.** `fork()` rejects boundaries that aren't contiguous
   seqs or that end mid-turn (`INVALID_BOUNDARY`, `OPEN_TURN`,
   `core/session/src/index.ts:763-776`), so MVP always forks from the latest safe boundary.
   Choosing an arbitrary cut-point from the preview timeline is Phase 2.
5. **Child appears immediately.** Because `listSessions` merges the live store over persistence
   (`corpus.ts:58-77`), a freshly forked child shows up in the picker on next open without any
   index refresh logic of ours.
6. **Failure mapping.**

   | Native code | Picker message |
   |---|---|
   | `SESSION_NOT_FOUND` | "That session no longer exists. Refreshing list." (auto-refresh) |
   | `SESSION_ALREADY_EXISTS` | Should not occur (ids minted fresh); logged, picker stays open |
   | `INVALID_BOUNDARY` / `OPEN_TURN` | "Can't fork here — the last turn didn't finish. Resume instead?" |
   | persistence failure during resume-to-fork | "Couldn't load that session from storage: <reason>. Original left untouched." |

7. **Consent framing.** Forking duplicates context; resumed sessions continue billing against
   their route. Both actions echo a one-line consequence before committing — consistent with
   the charter's "user owns their machine" posture.

---

## 6. Acceptance criteria

Functional:

1. `/resume` in a directory with prior sessions opens the picker within one turn, rows sorted newest-first with relative time, folded title, and message count for every row.
2. Rows are scoped to the current cwd by default; `--all` widens; subagent-origin sessions are hidden unless `--subagents` (or the `a` toggle).
3. Titles come from the log-backed fold; sessions with no `session/title` event render "Untitled session", not an error.
4. Message counts equal the count of `user/message` + `assistant/message` events and exclude tool results, shadowed, and log-only events.
5. Expanding a row (Tab/e) shows a truncated excerpt (first user message, or ranked snippet when filtering) plus availability and fork-lineage facts.
6. `/resume <text>` narrows the list; with a full-text backend mounted it uses ranked search with snippets, otherwise the documented literal-scan fallback; with search disabled (`openAt: never`) it still works via fallback.
7. Selecting a row with ⏎ resumes it under the same session id; subsequent turns continue its stored history verbatim.
8. `f` on a live row forks immediately; on a cold row it performs the resume-to-fork sequence and lands the user in the child session with `parentSession` set correctly.
9. A forked child appears in the picker afterward with the `forked from …` annotation derived from `traceSession`.
10. `--json` emits the documented row model (id, title, createdAt, lastActivity, messageCount, availability, parentId) matching what the TUI rendered.

Edge cases:

11. With no persistence backend mounted, the picker still lists live sessions and shows the documented footer hint instead of failing; choosing a cold row surfaces the typed "cannot resume" guidance from the agent-loop guard.
12. A corrupt/unreadable session renders `⚠ unavailable` and never breaks pagination or the rest of the list (per-id rejection isolation).
13. Empty corpus and empty cwd-scoped corpus each render their specified empty state; `esc` at any point changes no session state.
14. Fork attempts ending in `OPEN_TURN`/`INVALID_BOUNDARY` produce the mapped friendly message, and the original session remains untouched.
15. Preview excerpts never contain secret-shaped material in full; long lines truncate at the documented bound (~240 code points).

Quality/docs:

16. On a seeded fixture of 25 mixed sessions (live/archived/subagent/untitled/corrupt), all five classes render per this spec with zero unhandled exceptions in the log.
17. Browsing (open, scroll, preview, cancel) appends nothing to any session's event log — verified by comparing log lengths before/after (`/export` precedent for the human-command plane).
18. `/help` lists `/resume` with a one-liner and the fork affordance; this spec's Phase-2 items (arbitrary fork boundary, rename/delete in picker) are labeled "not implemented" in help.

## Phase 2 (out of MVP scope)

- Arbitrary fork cut-point chosen from the preview timeline (needs surface-safe boundary validation UI beyond `OPEN_TURN`/`INVALID_BOUNDARY` guards).
- Rename and delete actions in the picker (rename exists server-side via `SessionTitleService.rename`, `session-title/src/index.ts:364-384`; delete has no trusted seam yet).
- Cross-directory search view and saved filters.
