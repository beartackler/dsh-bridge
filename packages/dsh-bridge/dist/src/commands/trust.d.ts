/**
 * /trust - plugin trust report card (docs/specs/commands/trust.md).
 *
 * Subcommands delivered in this wave:
 *   /trust <plugin>   render the committed card docs/catalog/cards/<slug>.md
 *   /trust scan <dir> run tools/scan over a local directory, summarize verdict
 *   /trust list       enumerate locally known cards
 *   /trust refresh [<plugin>]
 *                     re-scan installed plugins, diff against the recorded
 *                     audit, annotate the card's verified-at line
 *
 * Rules honored here:
 *  - A grade is never fabricated. No card means the NOT REVIEWED state plus a
 *    queue hint; nothing else (spec acceptance criterion 3).
 *  - Read-only and offline at read time; only `scan` spawns a process, and it
 *    goes through the documented scanner JSON boundary (lib/scan-client.ts).
 *  - `refresh` scans locally and annotates; it never rewrites a Grade row. A
 *    local scan is an observation, not an authority over a published grade.
 *  - Output is markdown through the injected OutputHelpers; ASCII only.
 */
import { type AuditState, type FindingsDiff, type InstalledPlugin } from "../lib/drift.js";
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
/** One plugin's re-check outcome, ready to render. */
export interface RefreshOutcome {
    readonly pkg: string;
    readonly slug: string;
    /** Grade the local scan produced. */
    readonly localGrade: string;
    /** Grade the committed card carries, or null when there is no card. */
    readonly cardGrade: string | null;
    readonly diff: FindingsDiff;
    readonly hash: string | null;
    /** True when a card existed and its Audited row was annotated. */
    readonly annotated: boolean;
    /** True when nothing was recorded for this plugin before now. */
    readonly firstAudit: boolean;
}
/**
 * Render the refresh report. Pure over its inputs so the diff rendering and
 * the no-card-yet path are testable without a scanner or a filesystem.
 */
export declare function renderRefresh(ctx: BridgeContext, outcomes: readonly RefreshOutcome[]): string;
/** Everything refresh touches, injected so tests can substitute all of it. */
export interface RefreshDeps {
    readonly home: string;
    readonly dshHome: string;
    readonly profile: string;
    readonly cardsDir?: string;
    readonly now?: Date;
    readonly discover?: (dshHome: string, profile: string) => readonly InstalledPlugin[];
    readonly scan?: (dir: string) => Promise<ScanReport>;
    readonly hash?: (dir: string) => string | null;
    readonly readState?: (path: string) => AuditState;
    readonly writeState?: (path: string, state: AuditState) => void;
    readonly writeCard?: (path: string, markdown: string) => void;
}
/**
 * Re-scan installed plugins, diff findings against the recorded audit,
 * annotate each card's verified-at line, and persist the new hashes.
 *
 * A plugin whose scan fails is skipped rather than recorded, so a transient
 * scanner failure cannot silently mark drift as resolved.
 */
export declare function refreshInstalled(ctx: BridgeContext, subject: string, deps: RefreshDeps): Promise<{
    markdown: string;
    outcomes: RefreshOutcome[];
}>;
/** Entry point wired into lib/registry.ts as `bridge-trust`. */
export declare function runTrust(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<{
    markdown: string;
}>;
//# sourceMappingURL=trust.d.ts.map