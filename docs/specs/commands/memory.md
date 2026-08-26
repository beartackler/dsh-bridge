# Spec: `/memory` — persistent user + project memory

> dsh-bridge command spec. Owner of this behavior: `dsh-bridge` plugin, memory command module.
> Evidence citations point at the DSH reference checkout (`reference/deepseek-harness`, master).

## Purpose

Give Claude Code / Codex / OpenCode / Jcode refugees the memory workflow they expect — view,
edit, and grow persistent instructions that survive across sessions — without inventing a new
injection mechanism. DSH already loads `AGENTS.md`-family files into every session via its
native `agent-instructions` context plugin; `/memory` is therefore a **management UI over
existing native files**, not a parallel memory store:

| Familiar concept (Claude Code) | dsh-bridge equivalent |
|---|---|
| `~/.claude/CLAUDE.md` (user memory) | `~/.dsh/AGENTS.md` (native user-global instructions) |
| `./CLAUDE.md` (project memory) | `./AGENTS.md` (native project candidate) |
| `./CLAUDE.local.md` (personal, uncommitted) | `./AGENTS.local.md` (native local-overlay candidate) |
| `/memory` viewer/editor | `/memory show` / `/memory edit` over the same backing files |
| `/memory add <note>` | append-to-scope helper writing the native files |
| `claude /init` seeding | `/memory import` from existing `CLAUDE.md` / `AGENTS.md` |

Out of scope: automatic post-session fact extraction, semantic/vector recall, cross-machine
sync. DSH has no native seam for these today (see Native-state summary); they are listed under
Deferred.

## Native-state summary

What DSH already does, which this command builds on (all claims cited):

1. **Workspace instructions are natively loaded.** `@deepseek-ai/dsh-agent-instructions`
   injects the user-global + project instruction chain as a durable `<system-reminder>` baseline
   in the first request of each session, then reports newly discovered, changed, or removed
   files after successful first-party `read`/`write`/`edit` touches
   (`packages/context/agent-instructions/README.md:5-13`).
2. **File layout is fixed by configuration defaults.** User-global is always
   `$DSH_HOME/AGENTS.md` (`$DSH_HOME` defaults to `~/.dsh`, `~` expanded against the OS home;
   no local overlay at global scope). Project scopes walk from project root (marker: `.git` by
   default) down to the session cwd. Base candidates default to `['AGENTS.md', 'CLAUDE.md']`;
   local overlays to `['AGENTS.local.md', 'CLAUDE.local.md']`
   (`packages/context/agent-instructions/README.md:70-72`). **Consequence:** an existing
   `CLAUDE.md` already works in DSH with zero action.
3. **Per-directory dedup is content-based.** Sibling candidates whose content is byte-identical
   after trimming leading/trailing whitespace collapse to the earliest candidate in configured
   order, so a `CLAUDE.md` duplicating its sibling `AGENTS.md` renders once
   (`packages/context/agent-instructions/README.md:9,70`). A drifted copy loads **in full alongside** it — duplication costs tokens.
4. **Refresh is touch-driven; there is no file watcher.** On-disk edits become visible at the
   next successful fs tool touch, session resume, or pre-step baseline restore
   (`packages/context/agent-instructions/README.md:55,165`). `/memory` writes therefore take
   effect without restart, but purely external edits surface lazily — the same UX Claude Code
   users know.
5. **Budgeting is explicit and bounded.** Each deployment sets `maxBytes` for the rendered
   chain; broader files are omitted whole before the most-specific file is truncated, with a
   visible `Workspace instruction budget ...` notice. Per-file reads are bounded by
   `maxSourceBytes` (default 1 MiB) (`packages/context/agent-instructions/README.md:74-78`).
6. **Not interpreted:** lowercase name variants, `.claude/rules/`, and `@path` imports inside
   instruction files are NOT resolved (`packages/context/agent-instructions/README.md:166`).
   Import must inline or reject such constructs rather than assume support.
7. **No general-purpose memory package exists.** The `context/` family is instruction/time/tmux/
   session/file-reference context only (`packages/context/README.md:7-14`); the `session/`
   family persists per-session event logs behind `ctx.sessionPersistence` with no cross-session
   key-value memory (`packages/session/session-persistence/README.md:5-23`). Free-form memory
   in DSH *is* the instruction-file channel — confirming this spec's approach.
8. **Precedent for "open the user's editor":** the settings-file provider exposes
   `documentPath` / `prepareDocument()` to hand a canonical file to a native editor, creating
   it exclusively with owner-only permissions when absent
   (`packages/settings/settings-file/README.md:30`; service API in
   `packages/settings/settings/README.md`, `prepareDocument()` bullet). `/memory edit` mirrors
   this pattern.

## Commands

All commands live under `/memory` (bridge registers them in its own namespace so they never
collide with future native commands). Every command takes an optional scope selector:
`--scope=global|project|local|auto` (default `auto`) and `--dir=<path>` to target a nested
directory instead of the session cwd.

### `/memory show [scope]`
- Resolve and list the effective instruction chain exactly as native loading would see it:
  `~/.dsh/AGENTS.md`, then every existing base + overlay candidate from project root down to
  cwd, in native precedence order (broad → specific).
- For each file: absolute path, byte size, SHA-1 short digest, and first ~10 lines preview.
- Flag duplicates: any two same-directory siblings whose trimmed contents match are reported as
  "collapsed natively (renders once)" — matching native dedup semantics (Native-state §3).
- Surface budget pressure heuristically: warn when any single file exceeds a soft threshold
  (default 32 KiB) or the chain exceeds 128 KiB total, noting that native rendering will omit
  broad files before truncating the most specific one (Native-state §5).
- Empty result prints setup guidance instead of nothing ("no memory files yet — run
  `/memory init`").

### `/memory edit [scope]`
- Resolve the backing file for the scope (`auto` = deepest existing candidate; creation prompt
  otherwise). Missing file: create from the template below after confirmation.
- Open it in the user's editor: `$DSH_EDITOR` → `$VISUAL` → `$EDITOR`, falling back to the DSH
  host's native-editor affordance where available (pattern per Native-state §8). Non-interactive
  hosts print the absolute path plus an open hint instead of blocking.
- After the editor exits, print a one-line digest change notice and remind that the model picks
  up edits on its next fs touch or next session (Native-state §4).

### `/memory add <note>`
- Append `<note>` to the scope's backing file under a dated heading, creating the file from
  template if absent. Default target for `auto`: `AGENTS.local.md` when one already exists in
  scope, else the scope's primary file (`AGENTS.md`), never a `CLAUDE.md` (bridge does not grow
  foreign-brand files).
- Flags: `--global` (→ `~/.dsh/AGENTS.md`), `--heading "<section>"` (custom heading),
  `--stdin` (read multi-line note from stdin).
- Write is atomic (temp file + rename) and idempotent-guarded: an exact duplicate line within
  the target heading is rejected with a notice.
- Confirm with the resulting heading + line count.

### `/memory init`
- Project bootstrap: offer to create `./AGENTS.md` (shared) and/or `./AGENTS.local.md`
  (personal; suggests a `.git/info/exclude` or `.gitignore` entry) from templates. Never writes
  without explicit confirmation of each file.

### `/memory import <source> [--strategy=<auto|copy|merge|link>]`
- See Import logic. `<source>` is `claude` (scan `~/.claude/CLAUDE.md` globally and
  `CLAUDE.md` / `CLAUDE.local.md` in the project tree), `agents` (normalize stray brand files
  into `AGENTS.md`), or an explicit file path. Dry-run by default; `--apply` executes.

## File layout

Bridge-managed and native files, with provenance:

```text
~/.dsh/AGENTS.md                 # user-global memory (native; read-only for import)
~/.claude/CLAUDE.md              # legacy global source (import source, never written)
<project>/AGENTS.md              # shared project memory (bridge-managed)
<project>/AGENTS.local.md        # personal overlay; recommended gitignored (bridge-managed)
<project>/CLAUDE.md              # legacy project source (import source; native-loaded as-is)
<project>/CLAUDE.local.md        # legacy personal source (import source; native-loaded as-is)
<project>/<subdirs>/AGENTS.md    # nested scopes; shown by /memory show, never auto-created
```

Templates (created only on demand):

```markdown
# AGENTS.md
<!-- Persistent instructions. Loaded automatically by DSH agent-instructions. -->
<!-- Keep stable conventions here; use AGENTS.local.md for personal notes. -->
```

```markdown
# AGENTS.local.md
<!-- Personal, uncommitted memory for this machine. -->
```

## Import logic

Goal: consolidate brand-specific memory into the `AGENTS.md` family so users keep one source
of truth, exploiting the fact that DSH already reads `CLAUDE.md` natively (Native-state §2).

1. **Discover.** Scan, per scope: global `~/.claude/CLAUDE.md`; per project directory walked
   root → cwd: `CLAUDE.md`, `CLAUDE.local.md`. Record size + digest for each.
2. **Classify per pair (source ↔ sibling AGENTS.md):**
   - *Covered*: trimmed bytes identical → skip; report "already covered (renders once natively)"
     (dedup semantics per Native-state §3).
   - *Drifted*: both exist, differ → flag double-load token cost; suggest merge.
   - *Orphan*: source exists, no sibling `AGENTS.md` → propose creation.
3. **Strategies** (per item, `--strategy` overrides):
   - `copy` (orphan default): create `AGENTS.md` with the source's content, prepending an
     attribution header (`Imported from CLAUDE.md (<date>)`). Source left untouched.
   - `merge` (drifted default): produce a unified proposal — union of headings, source lines
     not present in target appended under `## Imported from <source>` — shown as a diff for
     review. Never silently overwrites either file. Requires `--apply` to write.
   - `link`: symlink `CLAUDE.md` → `AGENTS.md`. Offered last and warned: symlinks across the
     trust boundary are followed by native loading
     (`packages/context/agent-instructions/README.md:168`).
4. **Content hygiene before any write:** strip or rewrite constructs DSH ignores — `@path`
   imports get inlined (bounded by `maxSourceBytes`-style cap, default 64 KiB) or commented out
   with a notice; `.claude/rules/` references become a listed follow-up. Refuse to import any
   file whose resolved content exceeds 256 KiB without `--force`.
5. **Report.** Table: path, classification, action taken/skipped, bytes moved. Re-running
   `/memory import claude` on an imported tree is a no-op (all pairs Covered) — idempotence
   criterion AC-9.
6. **Never deletes** source files. Removal is the user's manual step, stated in the report.

## Acceptance criteria

- **AC-1** `show` lists files in exact native precedence order (global → root → … → cwd, base
  before overlay per directory) for a fixture tree with nested dirs and mixed candidates.
- **AC-2** `show` marks a `CLAUDE.md` byte-identical (after trim) to sibling `AGENTS.md` as
  collapsed, and a drifted one as double-loading.
- **AC-3** `edit --scope=project` on a missing file creates it from template (with owner-only
  permissions where the platform supports it) before invoking the editor; abort propagates no
  partial file.
- **AC-4** `add` appends under a dated heading, rejects an exact duplicate line, is atomic
  under simulated crash (no truncated file observed by a concurrent reader), and honors
  `auto` → `local`-if-present targeting.
- **AC-5** `add --global` writes `~/.dsh/AGENTS.md` even when `$DSH_HOME` is unset (defaults
  per Native-state §2) and respects a set `$DSH_HOME`.
- **AC-6** `import` dry-run classifies covered/drifted/orphan correctly on a fixture containing
  all three cases and performs zero writes.
- **AC-7** `import --apply` with `copy` produces `AGENTS.md` whose body equals the source body
  plus attribution header; source mtime and content unchanged.
- **AC-8** `@path` imports in a source file are inlined-or-commented per policy, with notices
  in the import report; no `@path` text survives uncommented in the target.
- **AC-9** running `import --apply` twice yields identical trees and a second report of all-
  skipped (idempotent).
- **AC-10** No command ever prints file contents to logs/telemetry beyond the user-visible
  output surface, and no network calls occur anywhere in the memory module (charter: user owns
  their machine).
- **AC-11** All user-facing strings are English-first and routed through the i18n message table.

## Deferred

- Post-session auto-extraction of durable facts into `AGENTS.local.md` (needs a native
  lifecycle hook study; no seam cited today).
- Surfacing the native `maxBytes`/candidate configuration through `/memory config` once the
  bridge exposes a settings namespace (`ctx.settings` registration pattern,
  `packages/settings/settings/README.md`).
