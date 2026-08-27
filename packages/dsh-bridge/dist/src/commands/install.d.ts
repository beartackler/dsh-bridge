/**
 * `/bridge-install` - verified installer (docs/specs/commands/install.md).
 *
 * The command resolves a name against the committed catalog, shows the grade
 * with the two worst findings quoted verbatim and their provenance, runs the
 * consent gate, and then, with `--yes`, executes the documented
 * `dsh plugin add` through the host exec seam and verifies that a layer
 * actually mounted.
 *
 * Without `--yes` nothing runs: the command stops at the consent gate and
 * prints the exact line it would execute. That default is the point. The gate
 * must sit on the path a user actually walks, which is why the execution half
 * exists at all (docs/reviews/pm-product-review.md §2.4), and it must never be
 * satisfiable by anything short of a typed flag.
 *
 * Catalog inputs, both committed and read-only:
 *   docs/catalog/manifest.json  entries (`name`, `repo`, `url`, `category`, ...)
 *   docs/catalog/INDEX.md       the graded rows: grade, verdict, date, card path
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - A grade is never fabricated. No INDEX.md row means Unlisted (spec §5.2).
 *  - Ambiguity is never resolved silently (spec §3): candidates are listed and
 *    nothing is emitted.
 *  - Unverified, D, and F entries require the explicit
 *    `--i-accept-unverified-risk` flag (spelled `--i-accept-unreviewed-risk`
 *    equivalently); F additionally requires `--force` (AC-9, AC-10). No
 *    keypress, `--yes`, or bare Enter satisfies the gate.
 *  - Missing/unparseable catalog fails closed to unverified with a degraded
 *    banner (F-4 / AC-23).
 *  - Every emitted command is accompanied by its undo command (AC-21).
 *  - Nothing is ever installed without consent: `--yes` alone is inert on the
 *    unverified path, and no execution happens on any blocked path.
 */
import { type ExecSeam, type ProgressFn } from "../lib/install-exec.js";
import { type ScanReport } from "../lib/scan-client.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Grades the catalog can carry. `?` means graded row absent. */
export type Grade = "A" | "B" | "C" | "D" | "F";
/** Flag that alone satisfies the §5.3 risk gate. Never suggested by the UI. */
export declare const RISK_FLAG = "i-accept-unverified-risk";
/**
 * Accepted spelling of the same gate. The unverified path is described to the
 * user as "unreviewed" (nobody has reviewed this), so both words work; a user
 * who types what the warning says must not be told they typed it wrong.
 */
export declare const UNREVIEWED_RISK_FLAG = "i-accept-unreviewed-risk";
/** One catalog row joined with its graded INDEX.md row, when present. */
export interface InstallCandidate {
    /** Canonical catalog id: the short plugin name, lowercase. */
    readonly id: string;
    /** `owner/repo` as written in the manifest, subpath stripped. */
    readonly repo: string;
    /** Native specifier passed to `dsh plugin add`, e.g. `github:owner/repo`. */
    readonly source: string;
    readonly category: string;
    readonly description: string;
    /** null when no graded INDEX.md row cites this repo. */
    readonly grade: Grade | null;
    readonly verdict: string;
    readonly verifiedAt: string;
    /** Repo-relative card path, e.g. `docs/catalog/cards/ponytail.md`. */
    readonly card: string;
}
/** Everything execution needs, injectable so tests never spawn a process. */
export interface InstallOptions {
    readonly manifestPath?: string;
    readonly indexPath?: string;
    /** Overrides the host seam probe; a test double runs here instead. */
    readonly exec?: ExecSeam;
    /** Collects streamed progress lines; the host renders them live. */
    readonly progress?: ProgressFn;
    /** Scanner entry point, injected so the unreviewed path is testable. */
    readonly scan?: (dir: string) => Promise<ScanReport>;
    /** Card reader, injected so evidence tests need no repo checkout. */
    readonly readCard?: (absolutePath: string) => string;
    /** Staging directory factory for the unreviewed path. */
    readonly makeStageDir?: () => string;
    /** Profile manifest reader, for observing what the install changed. */
    readonly readManifest?: (path: string) => string;
}
/**
 * Walk up from this compiled module to the checkout's `docs/catalog`.
 * Returns undefined when absent so the command degrades (F-4) instead of
 * throwing.
 */
export declare function resolveInstallCatalog(startDir?: string): {
    manifestPath: string;
    indexPath: string;
} | undefined;
/**
 * `owner/repo`, lowercase, `.git` and any `#subpath` stripped. Subpath entries
 * share their parent repo's audit, exactly as /bridge-browse joins them.
 */
export declare function repoBase(repo: string): string;
/** Short catalog id: the repo's last path segment, lowercase. */
export declare function shortId(repo: string): string;
/**
 * One graded row of docs/catalog/INDEX.md:
 * `| B | label | owner/repo | stars | verdict | date | [card](cards/x.md) |`
 * Only rows whose grade cell is a bare A-F letter count; the grading-band
 * prose and revision tables can never contribute a grade.
 */
export declare function parseIndexGrades(indexMarkdown: string): Map<string, InstallGradeRow>;
/** A graded INDEX.md row, keyed by repo base. */
export interface InstallGradeRow {
    readonly grade: Grade;
    readonly label: string;
    readonly verdict: string;
    readonly verifiedAt: string;
    readonly card: string;
}
/** Load and join manifest + INDEX, memoized per (path, mtime) pair. */
export declare function loadCandidates(manifestPath: string, indexPath: string): readonly InstallCandidate[];
export type Resolution = {
    readonly kind: "match";
    readonly rule: ResolutionRule;
    readonly candidate: InstallCandidate;
} | {
    readonly kind: "ambiguous";
    readonly rule: ResolutionRule;
    readonly candidates: readonly InstallCandidate[];
} | {
    readonly kind: "unlisted";
    readonly source: string;
    readonly id: string;
} | {
    readonly kind: "not-found";
    readonly nearMisses: readonly InstallCandidate[];
};
/** Which spec §3 rule produced the result; shown so resolution is auditable. */
export type ResolutionRule = "id" | "repo" | "source" | "fuzzy";
/** Levenshtein distance, capped early: only distances <= 2 matter here. */
export declare function editDistance(a: string, b: string): number;
/**
 * Resolve a user-typed name. Order is the spec's table, first rule wins:
 *   1. exact catalog id            2. exact `owner/repo`
 *   3. explicit specifier (reverse-lookup by source, else Unlisted)
 *   4. fuzzy: unique prefix or edit distance <= 2 -> disambiguation only
 * Nothing here touches the network; all four rules read the catalog only.
 */
export declare function resolve(input: string, candidates: readonly InstallCandidate[]): Resolution;
export type ConsentDecision = {
    readonly allowed: true;
} | {
    readonly allowed: false;
    readonly reason: string;
    readonly requiredFlag: string;
};
/**
 * Gate the emission of an install command. Grades A-C pass; anything else
 * (unlisted, D, F) needs the risk flag, and F needs `--force` on top of it.
 */
export declare function consentFor(grade: Grade | null, args: Readonly<Record<string, string>>): ConsentDecision;
/** `dsh plugin add` invocation, byte-identical to what a user should run (AC-13). */
export declare function installCommand(profile: string, source: string): string;
export declare function uninstallCommand(profile: string, id: string): string;
/** Verified trust summary card (spec §5.1). Absence is stated, never omitted. */
export declare function renderTrustCard(ctx: BridgeContext, candidate: InstallCandidate, profile: string): string;
/** Unverified warning (spec §5.2). Wording is normative; do not soften. */
export declare function renderUnverifiedWarning(id: string, source: string, reason: string): string;
/**
 * Consent, in one place, so no path can install without passing through it.
 * Two independent conditions must both hold:
 *   1. the risk ladder (`consentFor`) allows the grade at all;
 *   2. the user typed `--yes` on this invocation.
 * `--yes` alone never satisfies (1), and (1) alone never triggers execution.
 */
export declare function mayExecute(grade: Grade | null, args: Readonly<Record<string, string>>): boolean;
/**
 * `/bridge-install` runner.
 *
 * Side effects, all of them gated: catalog and card reads always; a staging
 * fetch plus a local scan on the unreviewed path; and `dsh plugin add` only
 * after both halves of consent are satisfied.
 */
export declare function runInstall(ctx: BridgeContext, args: Readonly<Record<string, string>>, options?: InstallOptions): Promise<CommandResult>;
//# sourceMappingURL=install.d.ts.map