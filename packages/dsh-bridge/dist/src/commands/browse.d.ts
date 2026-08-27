/**
 * `/bridge-browse` - paginated browsing of the committed plugin catalog.
 *
 * Slice of docs/specs/commands/browse.md: list and find modes, `--category`,
 * `--lang` (en/zh/any), and `--min-grade A|B|C` filters, fzf-style fuzzy
 * matching on find queries, grade-then-stars ranking over grades joined from
 * docs/catalog/INDEX.md (report-card fallback when a card exists but INDEX
 * lags), pagination in markdown, and an install handoff footer.
 *
 * Charter rules honored here:
 *  - Offline-first: inputs are committed files under docs/catalog/ only;
 *    zero network calls at browse time (spec acceptance 1).
 *  - Grades render verbatim from the audit surface; this module never
 *    derives, rounds, or softens a verdict (spec section 1). D, F, and ?
 *    can never be requested as floors.
 *  - Output stays ASCII, emoji-free (CHARTER.md non-negotiable 4).
 */
import type { CommandResult } from "../lib/types.js";
/** Default page size for list rendering (browse spec section 3.1). */
export declare const PAGE_SIZE = 10;
/** Grade letters that may serve as a --min-grade floor (never D, F, or ?). */
export declare const GRADE_FLOORS: readonly string[];
/** One manifest row, narrowed to the fields /browse renders. */
export interface CatalogEntry {
    readonly name: string;
    readonly repo: string;
    readonly category: string;
    /** Repo star count at snapshot time; null when upstream has not polled it. */
    readonly stars: number | null;
    /** English description; empty string when upstream has none yet. */
    readonly description: string;
    /** Chinese description; empty string when upstream has none yet. */
    readonly descriptionZh: string;
}
/** Options letting tests pin explicit catalog locations (no global state). */
export interface BrowseOptions {
    readonly manifestPath?: string;
    readonly cardsDir?: string;
    /** INDEX.md location override; auto-resolved beside the manifest otherwise. */
    readonly indexMdPath?: string;
}
/** Typed failure for catalog loads that cannot be honored. */
export declare class BrowseError extends Error {
}
/**
 * Locate the catalog through lib/catalog-paths: packaged data first, then a
 * repo checkout override. Returns undefined when neither exists, so the
 * command degrades to its honest not-found rendering instead of throwing.
 */
export declare function resolveCatalogPaths(startDir?: string): {
    manifestPath: string;
    cardsDir: string;
    indexMdPath?: string;
} | undefined;
/** Strict loader: missing file, bad JSON, or a non-array body are errors. */
export declare function loadManifest(manifestPath: string): CatalogEntry[];
/**
 * Memoizing wrapper: re-reads only when the file changed on disk, so repeat
 * invocations in one session skip the 2,189-entry parse entirely.
 */
export declare function loadManifestCached(manifestPath: string): CatalogEntry[];
/**
 * Parse the `## Catalog` grade table out of docs/catalog/INDEX.md.
 * Columns: | Grade | Plugin | Repo | Stars | Verdict | Verified | Card |
 * The repo column is authoritative; the display-name column is kept only as
 * a fallback join key for entries whose manifest name differs from the repo.
 * Returns maps of key -> grade letter for both keyspaces.
 */
export declare function parseIndexGrades(indexMarkdown: string): {
    byRepo: Map<string, string>;
    byName: Map<string, string>;
};
/**
 * Base slug of a manifest repo: lowercase, `.git` stripped, cut at the first
 * `#subpath` (e.g. `tt-a1i/archify#integrations/deepseek-harness` becomes
 * `tt-a1i/archify`). Subpath entries share their parent repo's audit.
 */
export declare function repoBase(repo: string): string;
/** Last path segment of a repo base, used as a display-name fallback key. */
export declare function repoLeaf(repo: string): string;
/**
 * Extract a card's grade letter. Handles the two shapes in docs/catalog/cards:
 *   1. bold header row: `| **Grade** | **B** (adjudicated...) |`
 *   2. heading form:    `### Overall: C`
 * Unbolded cells are deliberately rejected so revision-table headers like
 * `| Grade | Change |` can never yield a phantom letter.
 */
export declare function extractGrade(cardText: string): string | null;
/**
 * Join card grades onto manifest repo bases. A card contributes its grade
 * only when exactly one of its GitHub links resolves to a known manifest
 * base; ambiguous or unrelated links are ignored rather than guessed.
 * Returns a map of repo base -> grade letter.
 */
export declare function loadCardGrades(cardsDir: string, knownBases: ReadonlySet<string>): Map<string, string>;
/** Everything /browse needs to turn a manifest row into a graded row. */
export interface ResolvedGrades {
    readonly byRepo: Map<string, string>;
    readonly byName: Map<string, string>;
    /** Committed cards keyed by repo base; consulted after both INDEX maps. */
    readonly fromCards: Map<string, string>;
}
/**
 * Resolve one entry's grade letter or null when unreviewed:
 * INDEX.md display name first, then INDEX.md repo base, then the per-plugin
 * report card (covers audits INDEX.md has not listed yet), then unreviewed.
 */
export declare function resolveGrade(entry: CatalogEntry, grades: ResolvedGrades): string | null;
/** Load all grade surfaces at once: INDEX.md plus the cards directory. */
export declare function loadGrades(indexMdPath: string | undefined, cardsDir: string | undefined, entries: readonly CatalogEntry[]): ResolvedGrades;
/**
 * Case-insensitive subsequence score of `needle` inside `haystack`.
 * Consecutive characters and word-boundary hits earn bonuses; gaps cost
 * linearly. Returns -1 when the needle is not a subsequence at all.
 */
export declare function fuzzyScore(needle: string, haystack: string): number;
/** Best weighted relevance across name x3, repo x2, description x1; <0 on miss. */
export declare function entryRelevance(query: string, entry: CatalogEntry): number;
export interface BrowseFilter {
    readonly category?: string;
    /** Case-insensitive substring across name + description (legacy find). */
    readonly query?: string;
    /** en, zh, or any; undefined behaves as en. */
    readonly lang?: string;
    /** Grade floor A|B|C; excludes unreviewed unless includeUngraded. */
    readonly minGrade?: string;
    /** Include unreviewed (?) entries even with a floor set. */
    readonly includeUngraded?: boolean;
}
/** True when a grade meets the requested floor. Unreviewed fails every floor. */
export declare function meetsFloor(grade: string | null, floor: string): boolean;
/** Language gate: en drops zh-only rows; zh likewise; any lists everything. */
export declare function passesLang(entry: CatalogEntry, lang: string | undefined): boolean;
/**
 * Deterministic rank order per spec section 5's dominant terms:
 * grade desc, stars desc (unknown last), name asc.
 */
export declare function sortEntries(entries: readonly CatalogEntry[], grades?: ResolvedGrades): CatalogEntry[];
/**
 * Apply filters in spec order (category AND language AND query AND grade
 * floor), then rank with grades. Plain substring matching stays the query
 * gate so exact fragments always win over looser fuzzy expansions.
 */
export declare function filterEntries(entries: readonly CatalogEntry[], filter: BrowseFilter, grades?: ResolvedGrades): CatalogEntry[];
/** Total pages for a result count; always at least one so footers stay sane. */
export declare function pageCount(total: number, size?: number): number;
export declare function pageSlice<T>(items: readonly T[], page: number, size?: number): T[];
/**
 * `/bridge-browse` runner. Pure over (ctx, args, options): all filesystem
 * access goes through the explicit or auto-resolved catalog paths.
 */
export declare function runBrowse(ctx: BridgeContextLike, args: Readonly<Record<string, string>>, options?: BrowseOptions): Promise<CommandResult>;
/** BridgeContext structural minimum used above (avoids importing lib/context). */
interface BridgeContextLike {
    readonly output: {
        table(headers: readonly string[], rows: readonly (readonly string[])[]): string;
    };
}
export {};
//# sourceMappingURL=browse.d.ts.map