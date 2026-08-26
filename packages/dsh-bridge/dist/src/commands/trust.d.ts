/**
 * /trust - plugin trust report card (docs/specs/commands/trust.md).
 *
 * Subcommands delivered in this wave:
 *   /trust <plugin>   render the committed card docs/catalog/cards/<slug>.md
 *   /trust scan <dir> run tools/scan over a local directory, summarize verdict
 *   /trust list       enumerate locally known cards
 *
 * Rules honored here:
 *  - A grade is never fabricated. No card means the NOT REVIEWED state plus a
 *    queue hint; nothing else (spec acceptance criterion 3).
 *  - Read-only and offline at read time; only `scan` spawns a process, and it
 *    goes through the documented scanner JSON boundary (lib/scan-client.ts).
 *  - Output is markdown through the injected OutputHelpers; ASCII only.
 */
import { type ScanReport } from "../lib/scan-client.js";
import { type BridgeContext } from "../lib/types.js";
/**
 * Normalize any accepted subject to a catalog slug (trust spec `<plugin>`):
 * full GitHub URL, `owner/repo`, or an already-slug-like name.
 */
export declare function toSlug(input: string): string;
/** Extract one `| Grade | **X** |`-style row value out of a card. */
export declare function gradeFromCard(markdown: string): string | null;
/**
 * Render one card's markdown through the injected output helpers. Pure over
 * its inputs; split from showCard so tests can feed fixture card files.
 */
export declare function renderCard(ctx: BridgeContext, slug: string, markdown: string): string;
/**
 * Render the scan summary. Split from scanTarget so tests exercise rendering
 * against a mocked ScanReport without spawning the scanner process.
 */
export declare function renderScanSummary(ctx: BridgeContext, target: string, report: ScanReport): string;
/** Entry point wired into lib/registry.ts as `bridge-trust`. */
export declare function runTrust(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<{
    markdown: string;
}>;
//# sourceMappingURL=trust.d.ts.map