/**
 * One place that answers "where is the catalog?" for every command.
 *
 * Resolution order per file:
 *   1. packaged data shipped inside this package (`<package>/data/`) - the
 *      copy that makes a plain `npm install` work with no checkout at all
 *   2. a repo checkout above this module (`<repo>/docs/catalog/`), which
 *      overrides the packaged copy so contributors see their live edits
 *   3. nothing: callers render an error naming both paths
 *
 * Both roots are probed; when a file exists in both, the checkout wins (it is
 * the source the packaged copy was generated from). When no checkout exists,
 * the packaged copy answers every lookup.
 */
/** Where a resolved catalog file came from. */
export type CatalogOrigin = "packaged" | "repo";
/** A resolved catalog root plus its origin, for honest report text. */
export interface CatalogRoot {
    readonly dir: string;
    readonly origin: CatalogOrigin;
}
/**
 * `<package>/data`, found by walking up for the directory that holds it.
 * Works for both the `dist/src/lib/...` and `src/lib/...` module layouts.
 */
export declare function packagedDataDir(startDir?: string): string | undefined;
/**
 * `<repo>/docs/catalog`, found by walking up from this module. A directory
 * counts when it holds the manifest or the committed cards, because the
 * published root package ships `docs/catalog/cards` without the manifest.
 */
export declare function repoCatalogDir(startDir?: string): string | undefined;
/** Candidate roots, packaged first, in the order they are probed. */
export declare function catalogRoots(startDir?: string): readonly CatalogRoot[];
/**
 * Resolve one catalog-relative entry (`manifest.json`, `INDEX.md`, `cards`).
 * A checkout copy overrides the packaged one; the packaged one is the
 * fallback that makes installs work.
 */
export declare function catalogEntry(relative: string, startDir?: string): string | undefined;
/** The two locations probed, for error messages that name both. */
export declare function searchedPaths(startDir?: string): readonly [string, string];
/** Sentence naming both candidate locations; used by every degraded render. */
export declare function unavailableDetail(file: string, startDir?: string): string;
//# sourceMappingURL=catalog-paths.d.ts.map