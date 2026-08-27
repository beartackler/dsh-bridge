/**
 * /bridge-daily - the daily briefing (docs/design/daily-loop.md).
 *
 * Why this module exists: /bridge-status contributes exactly one drift line and
 * that line is deliberately silent when nothing moved (lib/drift.ts
 * `driftStatusLine`). Correct for a dashboard row, fatal for a habit: a surface
 * with nothing to say on a quiet day is not open on the day it has something to
 * say. This command is the quiet-day half of the same data.
 *
 * Four blocks, in order, all from data already on disk:
 *   1. Attestation      what is tracked and how much of it held, with a date.
 *   2. Delta            what moved since the previous open, including nothing.
 *   3. Rotation chore   the single oldest audit, as one runnable command.
 *   4. Coverage         how much of the profile has never been audited locally.
 *
 * Invariants:
 *  - A hash mismatch is never rendered as a grade. Drift means "the audited
 *    artifact is not what is on disk", which is a prompt, not a verdict. Same
 *    rule lib/drift.ts states for itself.
 *  - Absence is never reassurance. An empty profile reads "nothing tracked";
 *    a never-audited plugin is counted apart from an aligned one and is never
 *    folded into the attestation.
 *  - Read-only over the user's tree. The one file written is our own
 *    `$HOME/.dsh-bridge/daily-state.json`, a sibling of audit-state.json and
 *    memory.md, per the memory.ts precedent that bridge state lives in a
 *    bridge directory and never in a native DSH path.
 *  - No network. No clock reads outside the injected `now`.
 *
 * SPECULATIVE (docs/design/daily-loop.md, "Marked speculative"): that a daily
 * briefing forms a habit at all, and that the rotation chore is the element
 * that makes it stick, are product arguments with zero observed users behind
 * them. Nothing here measures usage, and no telemetry is added to find out.
 * The staleness threshold reused below is a round number, not a calibrated one.
 */
import { type DriftEntry } from "../lib/drift.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";
/**
 * An audit older than this many days is the rotation candidate. Reused from
 * status.ts STALE_AFTER_DAYS on purpose so one number governs staleness
 * everywhere. SPECULATIVE: round, not derived from plugin release cadence.
 */
export declare const ROTATE_AFTER_DAYS = 30;
/** Snapshot of the previous briefing, so today can report a delta. */
export interface DailyState {
    readonly version: 1;
    /** `YYYY-MM-DD` of the previous open, or "" when never opened. */
    readonly lastOpenedOn: string;
    /** Packages reported as changed at the previous open, sorted. */
    readonly changedPkgs: readonly string[];
    /** Count of tracked packages at the previous open. */
    readonly trackedCount: number;
}
export declare const EMPTY_DAILY_STATE: DailyState;
/** `$HOME/.dsh-bridge/daily-state.json`. */
export declare function dailyStatePath(home: string): string;
/**
 * Read the previous snapshot. A missing, unreadable, or malformed file yields
 * the empty state: a briefing must degrade to "first open" rather than throw.
 */
export declare function loadDailyState(path: string): DailyState;
/** Write the snapshot atomically so a concurrent read never sees a partial file. */
export declare function saveDailyState(path: string, state: DailyState): void;
/** Whole-day counts. `neverAudited` is kept apart from `aligned` by design. */
export interface DailyCounts {
    readonly tracked: number;
    readonly aligned: number;
    readonly changed: number;
    readonly neverAudited: number;
}
/** The rotation chore: one plugin, one command, one visible reason. */
export interface RotationChore {
    readonly slug: string;
    readonly pkg: string;
    /** Whole days since its last local audit, or null when never audited. */
    readonly ageDays: number | null;
    readonly command: string;
    /** Why this one was picked, rendered verbatim. */
    readonly reason: string;
}
export interface Briefing {
    readonly date: string;
    readonly counts: DailyCounts;
    /** Packages that moved since the last recorded audit, sorted. */
    readonly changedPkgs: readonly string[];
    /** Packages that moved and were not in the previous open's changed set. */
    readonly newlyChangedPkgs: readonly string[];
    /** Whole days since the previous open, or null on a first open. */
    readonly daysSinceLastOpen: number | null;
    readonly chore: RotationChore | null;
}
/** Whole days between two `YYYY-MM-DD` dates, or null when either is unusable. */
export declare function daysBetweenIso(from: string, to: string): number | null;
/**
 * Pick the rotation chore: the tracked plugin whose local audit is oldest.
 *
 * Never-audited plugins are surfaced first, because unknown outranks stale -
 * an unaudited package is the larger gap, and it is the one a user would
 * otherwise never be prompted about. Ties break on package name so the chore
 * is deterministic and a user who ignores it sees the same one tomorrow.
 * A plugin that already drifted is excluded: its prompt is the alarm above,
 * not the rotation, and printing it twice would read as two separate chores.
 */
export declare function pickRotation(entries: readonly DriftEntry[], today: string): RotationChore | null;
/**
 * Build the briefing. Pure over its inputs: drift entries, the previous
 * snapshot, and today's date. Every filesystem and clock read happens at the
 * call boundary in `runDaily`, so this whole model is testable without a disk.
 */
export declare function buildBriefing(entries: readonly DriftEntry[], previous: DailyState, today: string): Briefing;
/** Render the four blocks. Pure over the briefing; no I/O, ASCII only. */
export declare function renderDaily(briefing: Briefing): string;
/** Everything the runner touches, injected so tests substitute all of it. */
export interface DailyDeps {
    readonly now?: Date;
    readonly drift?: readonly DriftEntry[];
    readonly readState?: (path: string) => DailyState;
    readonly writeState?: (path: string, state: DailyState) => void;
}
/**
 * `/bridge-daily` runner. Read-only over the user's tree; the single write is
 * our own snapshot, and `--peek` suppresses even that so a user can look
 * without consuming the delta they were about to read.
 */
export declare function runDaily(ctx: BridgeContext, args?: Readonly<Record<string, string>>, deps?: DailyDeps): Promise<CommandResult>;
//# sourceMappingURL=daily.d.ts.map