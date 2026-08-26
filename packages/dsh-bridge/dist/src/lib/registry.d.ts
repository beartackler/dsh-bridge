/**
 * Command surface table.
 *
 * Each row mounts its implemented module from src/commands/ per
 * docs/specs/commands/*.md; remaining spec surface mounts here as modules
 * land. Rows are ordered by group exactly as /bridge-help renders them.
 */
import type { CommandResult } from "./types.js";
import type { BridgeContext } from "./types.js";
export interface BridgeCommand {
    /** Lowercase name without the leading slash; `/bridge-…` namespace only. */
    readonly name: string;
    /** Reserved for the alias strategy decision (help spec edge case 1). */
    readonly aliases: readonly string[];
    readonly summary: string;
    /** Argument hint, e.g. `[provider]`. */
    readonly usage: string;
    readonly run: (ctx: BridgeContext, args: Readonly<Record<string, string>>) => Promise<CommandResult>;
}
/** Rows are ordered by group exactly as /bridge-help will render them. */
export declare function bridgeCommandTable(ctx: BridgeContext): readonly BridgeCommand[];
//# sourceMappingURL=registry.d.ts.map