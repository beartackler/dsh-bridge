/**
 * /bridge-resume - recent-session listing with fork-vs-resume semantics
 * (docs/specs/commands/resume.md).
 *
 * The DSH host owns session storage and retrieval (`ctx.sessionQuery`); this
 * module is the UX layer the spec calls a "thin wrapper, not a passthrough":
 * it scopes to the working directory, hides subagent noise, renders the row
 * model, and spells out what Resume and Fork each do before either is chosen.
 *
 * The listing is non-interactive in this wave. A slash command result is a
 * rendered body, not a modal, so `/bridge-resume` prints the numbered rows plus
 * the exact follow-up commands. The keyboard picker in the spec needs a UI
 * surface the bridge does not own yet; inventing one here would be speculative
 * (CHARTER: ponytail discipline).
 *
 * Capability probing, not assumption: `sessionQuery` is an optional structural
 * interface, feature-detected at call time. Without it the command renders
 * guidance instead of claiming there are no sessions - a missing seam and an
 * empty corpus are different facts and are never conflated.
 *
 * Browsing is a zero-token, read-only act: nothing here writes to a session
 * log, resumes, or forks. Both mutations are user-confirmed follow-ups.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Page size, matching the SQLite backend's own default limit. */
export declare const PAGE_SIZE = 20;
/** Preview excerpt bound in code points, matching the backend snippet bound. */
export declare const EXCERPT_LIMIT = 240;
/** One session as the bridge renders it; a projection of `SessionRecord`. */
export interface SessionRow {
    readonly id: string;
    readonly title?: string;
    /** Epoch ms; `header.createdAt`. */
    readonly createdAt: number;
    readonly lastActivity?: number;
    readonly messageCount: number;
    readonly live: boolean;
    readonly persisted: boolean;
    /** Working directory the session ran in; used for cwd scoping. */
    readonly cwd?: string;
    readonly origin?: "user" | "subagent";
    /** `header.parentSession` when this session was forked from another. */
    readonly parentId?: string;
    /** First user message, already truncated by the provider or by us. */
    readonly excerpt?: string;
    /** Set when the record could not be read; renders as unavailable. */
    readonly unavailable?: boolean;
}
/** The optional native seam, declared structurally (no harness import). */
export interface SessionQueryHooks {
    /** `ctx.sessionQuery.listSessions`, newest-first. */
    readonly listSessions?: () => Promise<readonly SessionRow[]> | readonly SessionRow[];
    /** Whether a session-persistence backend is mounted; gates cold resume. */
    readonly persistenceMounted?: boolean;
}
export interface ResumeContext extends BridgeContext {
    readonly sessionQuery?: SessionQueryHooks;
    /** Working directory of the current session; defaults to process cwd. */
    readonly cwd?: string;
}
export declare function sessionQueryHooks(ctx: BridgeContext): SessionQueryHooks;
export interface ResumeFilters {
    /** Drop the cwd scope when true (`--all`). */
    readonly all: boolean;
    /** Include `origin: 'subagent'` rows when true (`--subagents`). */
    readonly subagents: boolean;
    /** Literal, case-insensitive narrowing over title and excerpt. */
    readonly text: string;
    readonly cwd: string;
}
export declare function parseResumeFilters(args: Readonly<Record<string, string>>, cwd: string): ResumeFilters;
/**
 * Apply the documented scoping rules. Ordering is never changed: the host
 * guarantees newest-first and the spec forbids re-sorting client-side.
 */
export declare function filterRows(rows: readonly SessionRow[], filters: ResumeFilters): readonly SessionRow[];
/** Relative time in the picker's vocabulary; absolute detail lives in preview. */
export declare function relativeTime(timestamp: number, now: number): string;
/** Availability badge, text only; color is never load-bearing. */
export declare function availability(row: SessionRow): string;
export declare function truncateExcerpt(text: string): string;
/** Fork-vs-resume framing printed with every listing (resume spec §5). */
export declare function semanticsBlock(): string;
export declare function renderRows(rows: readonly SessionRow[], filters: ResumeFilters, now: number): string;
export declare function renderEmpty(filters: ResumeFilters): string;
/**
 * Guidance when the host exposes no session-query seam. States plainly that
 * the bridge could not read the corpus, rather than reporting zero sessions.
 */
export declare function renderNoSeam(): string;
/** /bridge-resume entry point; pure over (ctx, args), no global state. */
export declare function runResume(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=resume.d.ts.map