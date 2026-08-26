/**
 * /bridge-suggest - the "not found -> build it" flow
 * (docs/specs/commands/suggest.md), MVP slice.
 *
 * Scope of this iteration:
 *  - Re-queries the committed catalog through the same resolution browse.ts
 *    uses (resolveCatalogPaths + loadManifestCached + filterEntries), with an
 *    intent-level token match over name + description.
 *  - Closest-match suggestion with grade and honest gap note when a match
 *    exists; scaffold checklist per templates/plugin-starter when none does.
 *
 * Invariants: offline-first (catalog files only, zero network calls); no
 * writes in this slice (--no-scaffold is the only behavior; the checklist
 * tells the user or agent exactly what to create); every trust claim renders
 * the grade verbatim from docs/catalog/cards.
 */
import type { CommandResult } from "../lib/types.js";
import { type CatalogEntry } from "../lib/catalog-access.js";
/** Options letting tests pin explicit catalog locations (no global state). */
export interface SuggestOptions {
    readonly manifestPath?: string;
    readonly cardsDir?: string;
}
/** One catalog candidate with its computed match score. */
export interface SuggestCandidate {
    readonly entry: CatalogEntry;
    /** Fraction of intent tokens found in name + description (0..1). */
    readonly coverage: number;
    readonly matchedTokens: readonly string[];
    readonly missedTokens: readonly string[];
}
/** Lowercase non-stopword tokens of the idea text. */
export declare function intentTokens(idea: string): string[];
/**
 * Intent-level re-query of the catalog: coverage = matched tokens / total
 * tokens. Pure over (entries, tokens).
 */
export declare function matchCatalog(entries: readonly CatalogEntry[], idea: string): SuggestCandidate[];
export interface ScaffoldStep {
    readonly path: string;
    readonly purpose: string;
}
/** The file plan suggested when nothing in the catalog fits. */
export declare function scaffoldChecklist(slug: string): readonly ScaffoldStep[];
/** /bridge-suggest entry point; pure over (ctx, args), offline-first. */
export declare function runSuggest(ctx: BridgeContextLike, args: Readonly<Record<string, string>>, options?: SuggestOptions): Promise<CommandResult>;
/** Coverage fraction at or above which a grade-A/B match is recommended. */
export declare const RECOMMEND_COVERAGE = 0.8;
/** Derive a kebab-case project slug from the idea text. */
export declare function suggestSlug(idea: string): string;
/** Structural minimum used here (matches lib/types BridgeContext.output). */
interface BridgeContextLike {
    readonly output: {
        table(headers: readonly string[], rows: readonly (readonly string[])[]): string;
    };
}
export {};
//# sourceMappingURL=suggest.d.ts.map