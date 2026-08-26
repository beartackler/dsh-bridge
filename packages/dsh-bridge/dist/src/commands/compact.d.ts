/**
 * /bridge-compact - manual context compaction UX (docs/specs/commands/compact.md).
 *
 * This module is the thin UX layer the spec calls for. DSH owns compaction
 * itself (`ctx.compaction`, `ctx.tokenMeter`); the bridge owns three things the
 * native command does not do (compact spec gaps G1-G4):
 *   1. accept arguments at all (native `/compact` errors on any input),
 *   2. show a before/after token picture instead of a bare item count,
 *   3. answer "when does auto-compaction fire?" via `/bridge-compact status`.
 *
 * Capability probing, not assumption: the host services are declared here as
 * optional structural interfaces and feature-detected at call time. When the
 * hook is absent the command degrades to honest instructions rather than
 * pretending to have compacted something (CHARTER: trust over speed, no
 * fabricated claims). Token figures the bridge cannot measure are rendered as
 * explicit placeholders, never as invented numbers.
 *
 * Everything arrives through the injected context, so tests substitute a
 * recording double for the compaction engine and the meter.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Steering text bound, mirroring the spec's stated maximum. */
export declare const MAX_INSTRUCTIONS_CHARS = 2000;
/** Default auto-compaction trigger ratio (compaction-basic config default). */
export declare const DEFAULT_THRESHOLD_RATIO = 0.8;
/** Subset of `CompactionResult` this UX layer reads. */
export interface CompactionResultLike {
    readonly shadowedSeqs: readonly number[];
    readonly shadowedTokenCount: number;
    readonly summary?: string;
    readonly summarySeq?: number;
}
/** Subset of `TokenMeasurement` this UX layer reads. */
export interface TokenMeasurementLike {
    readonly totalTokens: number;
    readonly contextWindow?: number;
}
/**
 * The optional native hooks. Declared structurally so this package keeps zero
 * runtime dependency on the harness packages; the host supplies whichever it
 * has, and every consumer here checks before calling.
 */
export interface CompactionHooks {
    /** `ctx.compaction.compactNow`; resolves null when nothing is compactable. */
    readonly compactNow?: (instructions?: string) => Promise<CompactionResultLike | null>;
    /** `ctx.tokenMeter.measure` for the active session. */
    readonly measure?: () => TokenMeasurementLike;
    /** Auto-compaction enabled flag; undefined means "not observable". */
    readonly autoEnabled?: boolean;
    /** Effective threshold ratio when the host exposes its config. */
    readonly thresholdRatio?: number;
    /** Model/route label used in status output. */
    readonly route?: string;
}
/** A BridgeContext that may carry compaction hooks. */
export interface CompactionContext extends BridgeContext {
    readonly compaction?: CompactionHooks;
}
/** Feature-detect the hooks without asserting they exist. */
export declare function compactionHooks(ctx: BridgeContext): CompactionHooks;
export type CompactMode = {
    readonly kind: "status";
} | {
    readonly kind: "compact";
    readonly instructions: string;
} | {
    readonly kind: "error";
    readonly message: string;
};
/**
 * Grammar per compact spec §6: bare (or whitespace-only) input compacts;
 * exactly `status` (any casing) is the read-only mode; anything else is
 * steering instructions, including `status of the refactor`.
 */
export declare function parseCompactMode(rawInput: string): CompactMode;
/** Rebuild the raw invocation text from the parsed-arg record. */
export declare function rawInputFromArgs(args: Readonly<Record<string, string>>): string;
/** Thousands-separated integer, or the placeholder when unmeasured. */
export declare function formatTokens(value: number | undefined): string;
/** Sections `COMPACTION_INSTRUCTION` mandates; used to report what was kept. */
export declare const PRESERVED_SECTIONS: readonly ["Primary Request and Intent", "Key Technical Concepts", "Files and Code", "Errors and Fixes", "Pending Jobs", "Current Work", "Next Step", "Critical Context"];
/**
 * Report which mandated sections came back with a body. A section whose body
 * is `(none)` counts as empty; unrecognized structure yields an empty list so
 * the caller can print the documented fallback rather than invent sections.
 */
export declare function preservedSections(summary: string | undefined): readonly string[];
/** Render the success card for a landed compaction. */
export declare function renderCompacted(result: CompactionResultLike, before: TokenMeasurementLike | undefined, after: TokenMeasurementLike | undefined, instructions: string): string;
/**
 * Instructions emitted when the host exposes no compaction hook. Honest by
 * construction: it says what the bridge could not reach and what to run.
 */
export declare function renderNoHook(instructions: string): string;
/** Read-only threshold surfacing. Never compacts, never calls a model. */
export declare function renderStatus(hooks: CompactionHooks): string;
/** /bridge-compact entry point; pure over (ctx, args), no global state. */
export declare function runCompact(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=compact.d.ts.map