/**
 * Plugin recommendation engine shared by onboarding (`/bridge-setup`) and
 * `/bridge-browse --recommend`.
 *
 * The catalog holds 2,189 entries. Nobody reads that. Both surfaces need the
 * same question answered - "which plugins should I install?" - from a small
 * profile: what the user works on, which harness they came from, what is
 * already installed.
 *
 * Ranking model (in descending weight):
 *   1. Trust grade. Dominant term. A beats B beats C by more than any other
 *      factor can recover. D and F are not ranked at all: they are dropped.
 *   2. Category match to the declared work type (primary, then adjacent).
 *   3. Freshness of the audit: a review from this month is worth more than
 *      one from last quarter, because a grade pins one commit in time.
 *   4. Stars, as a weak tiebreak only. Popularity is not evidence of safety.
 *
 * Safety rules, enforced here rather than at each call site:
 *   - Grade D and F never surface. Not in the list, not in the tail.
 *   - Ungraded entries are never recommended by default. They may only be
 *     returned in the separate `unreviewed` tail, which callers must label
 *     "unreviewed, install at your own risk", and only when the caller opts
 *     in with `includeUnreviewed`.
 *   - Every recommendation carries its grade and a one-clause reason, so the
 *     user can see why it was picked without opening the report card.
 *
 * Offline and pure: inputs are already-loaded catalog entries and grade maps
 * (see commands/browse.ts and lib/catalog-access.ts). No filesystem, no
 * network, no global state.
 */
import type { CatalogEntry } from "./catalog-access.js";
/** Work types onboarding asks about (setup spec: "what do you mostly work on"). */
export declare const WORK_TYPES: readonly ["web", "backend", "data", "mobile", "devops", "writing"];
export type WorkType = (typeof WORK_TYPES)[number];
/** True when a free-text answer is one of the known work types. */
export declare function isWorkType(value: string): value is WorkType;
/**
 * Map a free-text onboarding answer onto a work type, or undefined when the
 * answer does not clearly indicate one. Deliberately conservative: guessing
 * wrong produces recommendations the user did not ask for.
 */
export declare function inferWorkType(answer: string): WorkType | undefined;
/** What the caller knows about the user. Every field is optional. */
export interface UserProfile {
    /** Declared work type; omit when the user skipped the question. */
    readonly work?: WorkType;
    /** Harness the user is migrating from, e.g. "claude code", "codex". */
    readonly priorHarness?: string;
    /** Plugin names or repos already installed; never recommended again. */
    readonly installed?: readonly string[];
}
/** Grades that are never recommended, in any section. */
export declare const BLOCKED_GRADES: readonly string[];
/** Default shortlist length. */
export declare const DEFAULT_LIMIT = 5;
/** One ranked recommendation. */
export interface Recommendation {
    readonly name: string;
    readonly repo: string;
    readonly category: string;
    /** Grade letter for ranked picks; null only inside the unreviewed tail. */
    readonly grade: string | null;
    readonly stars: number | null;
    /** One clause explaining the pick, e.g. "grade A, fits web work". */
    readonly reason: string;
    /** Total rank score; exposed so callers and tests can assert ordering. */
    readonly score: number;
    readonly install: string;
}
/** Shortlist plus the explicitly labeled unreviewed tail. */
export interface RecommendationResult {
    readonly picks: readonly Recommendation[];
    /** Ungraded entries. Empty unless the caller passed includeUnreviewed. */
    readonly unreviewed: readonly Recommendation[];
    /** Caller-facing label for the tail; render verbatim above it. */
    readonly unreviewedLabel: string;
    /** Work type actually used for category scoring; null when unknown. */
    readonly appliedWork: WorkType | null;
}
/** Verbatim tail heading. Callers must not soften this. */
export declare const UNREVIEWED_LABEL = "unreviewed, install at your own risk";
export interface RecommendOptions {
    /** Max ranked picks. Defaults to DEFAULT_LIMIT. */
    readonly limit?: number;
    /** Return an unreviewed tail. Off by default: ungraded is not recommended. */
    readonly includeUnreviewed?: boolean;
    /** Max entries in the unreviewed tail. Defaults to 3. */
    readonly unreviewedLimit?: number;
    /** Grade lookup by repo base (browse's resolved grade surface). */
    readonly gradeOf?: (entry: CatalogEntry) => string | null;
    /** Audit dates by repo base, from INDEX.md's Verified column. */
    readonly verifiedAt?: ReadonlyMap<string, string>;
    /** "Today" for freshness math; defaults to the current date. */
    readonly now?: Date;
}
/**
 * Parse the `## Catalog` table's Verified column out of INDEX.md into a map of
 * repo base -> ISO date. Columns: Grade | Plugin | Repo | Stars | Verdict |
 * Verified | Card. Rows without a parseable date are skipped rather than
 * defaulted, so an unknown audit date scores zero instead of scoring fresh.
 */
export declare function parseVerifiedDates(indexMarkdown: string): Map<string, string>;
/** Freshness points: full credit today, linear decay to zero at the window. */
export declare function freshnessPoints(verified: string | undefined, now: Date): number;
/** Stars points: logarithmic and capped, so 69k stars cannot buy a grade. */
export declare function starsPoints(stars: number | null): number;
/** Category points for one entry against a work type (or the default set). */
export declare function categoryPoints(category: string, work: WorkType | null): number;
/**
 * Rank the catalog for one profile.
 *
 * Returns the graded shortlist and, only when asked, a segregated tail of
 * ungraded entries. D and F are dropped before scoring and can never appear
 * in either list.
 */
export declare function recommend(entries: readonly CatalogEntry[], profile?: UserProfile, options?: RecommendOptions): RecommendationResult;
/** Table shape used by both /bridge-browse --recommend and onboarding. */
export declare const RECOMMEND_HEADERS: readonly string[];
export declare function recommendationRows(picks: readonly Recommendation[]): readonly (readonly string[])[];
//# sourceMappingURL=recommend.d.ts.map