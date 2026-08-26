/**
 * /bridge-status - single-glance dashboard (docs/specs/commands/status.md).
 *
 * Status reports what is already known; it never checks, probes, or calls the
 * network. Every row is sourced from an injected service, a committed file, or
 * a metadata probe, and a missing source degrades to `unavailable` plus the
 * command that would produce it - never a blank or a guess (spec design rule
 * 1). Staleness is data: catalog cards older than STALE_AFTER_DAYS are counted
 * and listed so the user can act (spec rule 3).
 *
 * This slice covers S1 profile, S2 active route, S3 mounted bridge features,
 * S5 plugin/trust-card staleness from docs/catalog/INDEX.md verified dates,
 * and S6 token usage when ctx provides it.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** A catalog card older than this many days is stale (task + spec S5). */
export declare const STALE_AFTER_DAYS = 30;
/**
 * Optional services a host may mount on the context. Every field is optional;
 * absence is rendered as `unavailable` with the producing command named, per
 * status spec data-source table rows S2/S4/S6. Tests inject doubles here.
 */
export interface StatusServices {
    /**
     * Active model route selection, e.g. `{ provider: "deepseek", model:
     * "deepseek-chat" }`. Mirrors the agent-default-model currentSelection seam
     * (S2); absent means no route source is mounted.
     */
    readonly activeRoute?: {
        readonly provider: string;
        readonly model: string;
        /** True when the route's adapter is registered in this composition. */
        readonly live?: boolean;
    };
    /**
     * Bridge features actually mounted in this composition (S3), e.g.
     * ["connectors flow", "trust layer"]. Rendered verbatim; never inferred.
     */
    readonly mountedFeatures?: readonly string[];
    /**
     * Last connector smoke result persisted by /bridge-connect (S4).
     */
    readonly lastSmoke?: {
        readonly ok: boolean;
        readonly provider: string;
        readonly at: string;
    };
    /**
     * Token usage projection for this session (S6): uncached input, output,
     * cache read/write tokens, and the advertised context window when known.
     */
    readonly tokenUsage?: {
        readonly uncachedInputTokens: number;
        readonly outputTokens: number;
        readonly cacheReadTokens?: number;
        readonly cacheWriteTokens?: number;
        /** Advertised context window in tokens; occupancy renders only with it. */
        readonly contextWindow?: number;
    };
}
/** One dashboard row after collection: value plus provenance line. */
export interface StatusRow {
    readonly id: "profile" | "route" | "features" | "smoke" | "plugins" | "tokens";
    readonly label: string;
    readonly value: string;
    /** Where the figure came from; also carries the unavailable pointer. */
    readonly source: string;
    /** True when the row could not be sourced at all. */
    readonly unavailable: boolean;
}
/** One parsed INDEX.md row. */
export interface CatalogCard {
    readonly grade: string;
    readonly plugin: string;
    /** ISO date (`YYYY-MM-DD`) the audit finished, when parseable. */
    readonly verifiedOn: string | null;
}
/** Age of a `YYYY-MM-DD` date relative to now, in whole days. */
export declare function ageInDays(verifiedOn: string, now: Date): number | null;
/**
 * Parse the catalog table out of INDEX.md markdown. Rows carry their grade,
 * plugin name, and Verified date column; unparseable lines are skipped rather
 * than guessed.
 */
export declare function parseCatalogIndex(markdown: string): CatalogCard[];
/** Inputs collected once at the call boundary so collection stays pure. */
export interface StatusInputs {
    readonly profile: string;
    readonly dshHome: string;
    /** Absolute path to docs/catalog/INDEX.md; existence probed, never assumed. */
    readonly indexMdPath: string;
    readonly services: StatusServices;
    /** Injection point for tests; defaults to the real clock. */
    readonly now?: Date;
}
export interface CollectedStatus {
    readonly rows: readonly StatusRow[];
    readonly staleCards: readonly CatalogCard[];
    readonly totalCards: number;
}
/**
 * Pure collector over inputs. Filesystem reads happen only through the two
 * paths handed in (dshHome listing, INDEX.md path); nothing else touches disk.
 */
export declare function collectStatus(inputs: StatusInputs, readFile: (path: string) => string): CollectedStatus;
/** Locate docs/catalog/INDEX.md by walking up from this compiled module. */
export declare function resolveIndexPath(startDir?: string): string | undefined;
/** Render collected rows into the dashboard markdown. */
export declare function renderStatus(ctx: BridgeContext, collected: CollectedStatus, installedCount: number): string;
/** `/bridge-status` runner. Read-only; zero network calls by construction. */
export declare function runStatus(ctx: BridgeContext, _args: Readonly<Record<string, string>>, options?: {
    readonly services?: StatusServices;
    readonly indexPath?: string;
}): Promise<CommandResult>;
//# sourceMappingURL=status.d.ts.map