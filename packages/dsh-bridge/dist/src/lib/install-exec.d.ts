/**
 * Execution half of `/bridge-install`: the parts that read a trust card for
 * decision-grade evidence, stage an unreviewed source for a local scan, run
 * the documented `dsh plugin add`, and verify that a layer actually mounted.
 *
 * Why this file exists (docs/reviews/pm-product-review.md §2.4): the command
 * used to print an install line and stop, so the consent ladder gated advice
 * rather than an action. A user who pasted from GitHub got zero protection.
 *
 * Design rules carried from CHARTER.md and the surrounding modules:
 *  - No global state. Every process call goes through an injected seam
 *    (`ctx.exec` in the host, doubles in tests). Absent seam means refuse and
 *    fall back to printing, never a silent no-op.
 *  - Evidence is quoted, never paraphrased: findings are copied verbatim from
 *    the committed card with a `path:line` citation, so nothing is invented.
 *  - Verification is observed, not assumed. `dsh plugin add` exiting 0 is not
 *    proof of a mount; the composed config is read back (the exact failure
 *    documented in docs/research/live-mount-report.md §2, defect 2).
 */
/** One command run through the host seam. Mirrors refactor.ts's ExecRequest. */
export interface ExecRequest {
    readonly command: string;
    readonly cwd?: string;
}
/** Outcome of one seam call. `code` 0 means success, as with a shell. */
export interface ExecOutcome {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}
export type ExecSeam = (request: ExecRequest) => Promise<ExecOutcome>;
/** Progress sink; the host streams these lines as the install proceeds. */
export type ProgressFn = (line: string) => void;
/**
 * Feature-detect the host exec seam exactly as refactor.ts does. A context
 * without one is the normal test and pre-host case, and means "print, do not
 * run" rather than an error.
 */
export declare function execSeamOf(ctx: unknown): ExecSeam | null;
/** Severity vocabulary of tools/scan plus the two card-only classes. */
declare const FINDING_RANK: Readonly<Record<string, number>>;
/** One quotable finding: the source line, unmodified, plus where it came from. */
export interface QuotedFinding {
    /** The line as committed. Never reworded, never truncated silently. */
    readonly text: string;
    /** `docs/catalog/cards/x.md:118` or `scan:src/index.js:44`. */
    readonly citation: string;
    readonly severity: keyof typeof FINDING_RANK;
}
/** Provenance of a grade: what was audited, when, and by which revision. */
export interface Provenance {
    /** Repo-relative card path, or "" when only an INDEX.md row exists. */
    readonly card: string;
    readonly pinned: string;
    readonly audited: string;
    readonly revision: string;
}
/**
 * Pull the worst findings out of a committed trust card.
 *
 * Two populations count, both quoted verbatim:
 *   1. rows of `## 4. Evidence` - adjudicated gates and findings, ranked by
 *      the severity word the card itself uses;
 *   2. bullets of `## 5. What we could not check` - residual unknowns, ranked
 *      last because "not checked" is weaker evidence than a finding.
 *
 * Cards vary in shape across 43 entries, so absence is reported honestly by
 * returning fewer than `limit` items rather than by inventing a row.
 */
export declare function worstCardFindings(cardMarkdown: string, cardPath: string, limit?: number): readonly QuotedFinding[];
/** Read the `## 1. Header` table for the fields that establish provenance. */
export declare function cardProvenance(cardMarkdown: string, cardPath: string): Provenance;
/**
 * Absolute path of a card given the INDEX.md location. Both live in
 * `docs/catalog/`, so the card's repo-relative path resolves against the
 * index's directory. Returns "" when the file is not present.
 */
export declare function cardFilePath(indexPath: string, repoRelativeCard: string): string;
/** Where a staged source landed, and how it was fetched. */
export interface StagedSource {
    readonly dir: string;
    readonly command: string;
}
export type StageResult = {
    readonly ok: true;
    readonly staged: StagedSource;
} | {
    readonly ok: false;
    readonly failure: InstallFailure;
};
/**
 * Fetch `source` into a scratch directory using only documented tooling.
 * Nothing is executed from the fetched tree: `git clone` and `npm pack` do not
 * run package scripts, which is exactly why they are the staging verbs here
 * (`npm install` would run `prepare` before any review could happen).
 */
export declare function stageSource(source: string, exec: ExecSeam, progress: ProgressFn, makeDir?: () => string): Promise<StageResult>;
export type FailureKind = "no-exec-seam" | "unsupported-source" | "network" | "install-failed" | "not-mounted" | "scan-failed";
/** A refusal the user can act on: what happened, why, and the next command. */
export interface InstallFailure {
    readonly kind: FailureKind;
    readonly summary: string;
    readonly detail: string;
    readonly nextSteps: readonly string[];
}
export declare function looksLikeNetworkFailure(text: string): boolean;
/** Turn a non-zero exec result into the right failure, network first. */
export declare function classifyFailure(phase: "stage" | "install", command: string, result: ExecOutcome): InstallFailure;
export declare function noExecSeamFailure(command: string): InstallFailure;
export declare function notMountedFailure(profile: string, id: string, dumpOutput: string): InstallFailure;
/** What actually changed on disk, read back after the install. */
export interface InstallChange {
    readonly command: string;
    readonly mounted: boolean;
    /** Dependency rows added to the profile manifest, `name: spec`. */
    readonly addedDependencies: readonly string[];
    /** Trimmed tail of the install output, shown as evidence. */
    readonly output: string;
}
export type InstallExecution = {
    readonly ok: true;
    readonly change: InstallChange;
} | {
    readonly ok: false;
    readonly failure: InstallFailure;
    readonly change?: InstallChange;
};
export interface InstallExecInput {
    readonly exec: ExecSeam;
    readonly profile: string;
    readonly id: string;
    readonly source: string;
    readonly command: string;
    readonly profilePackageJson: string;
    readonly progress: ProgressFn;
    /** Injected so tests observe the manifest without touching a real profile. */
    readonly readManifest?: (path: string) => string;
}
/**
 * Run `dsh plugin add`, then prove the layer mounted by reading the composed
 * config back. The verify step is not optional: an exit code of 0 with no
 * mounted row is a real, observed outcome, not a hypothetical.
 */
export declare function executeInstall(input: InstallExecInput): Promise<InstallExecution>;
/**
 * A layer is mounted when the composed config names the package. `dsh
 * --dump-config` prints a `# == <name>` marker plus a `name:` row
 * (live-mount-report.md section 5), so either is accepted, and the repo's last
 * path segment is used because the bundle name need not equal the repo name.
 */
export declare function mountedIn(dumpOutput: string, id: string, source: string): boolean;
export {};
//# sourceMappingURL=install-exec.d.ts.map