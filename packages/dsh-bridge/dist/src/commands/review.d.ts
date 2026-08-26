/**
 * /bridge-review - local diff review flow (docs/specs/commands/review.md),
 * MVP slice.
 *
 * Scope of this iteration:
 *  - Resolves the diff target (worktree vs HEAD, --staged, --base <ref>, or a
 *    path filter) into one read-only git invocation run through ExecFn
 *    (injected; ctx.exec in the host, spawnSync in the node default, mocked
 *    in tests).
 *  - Parses --numstat to compute the change-set summary and the skip list
 *    (lockfiles, binaries, generated files) per spec preconditions.
 *  - Renders the structured review prompt (rubric axes in spec priority
 *    order, severity ladder, reviewer rules, output contract with file:line)
 *    for the model route to answer; no model call is made by this module.
 *  - Cross-model note: prints that --second-opinion routes a different
 *    provider per spec "Cross-model toggle design"; routing itself is phase-2.
 *
 * Invariants: exactly one `git diff` family call, always read-only (no flags
 * that write, patch, or stage anything); secret-looking added lines are
 * reported as blocker locations only and never echoed.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Result shape of one exec'd command. Mirrors ctx.exec's contract. */
export interface ExecResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly status: number;
}
/** Exec surface injected into this module (host ctx.exec or spawnSync). */
export type ExecFn = (command: string, args: readonly string[], options: {
    readonly cwd: string;
}) => ExecResult;
/** Options letting tests inject exec doubles (no global state). */
export interface ReviewOptions {
    readonly exec?: ExecFn;
    readonly cwd?: string;
}
/** Which diff the review covers (review spec Inputs table). */
export interface ReviewTarget {
    readonly kind: "worktree" | "staged" | "base";
    /** Base ref when kind === "base". */
    readonly base?: string;
    /** Path filter positional, if any. */
    readonly path?: string;
}
/** Summary of the change set computed from numstat/name-status. */
export interface DiffSummary {
    readonly files: number;
    readonly added: number;
    readonly removed: number;
    readonly skipped: readonly SkippedFile[];
    readonly reviewedFiles: readonly string[];
    readonly truncated: boolean;
}
export interface SkippedFile {
    readonly file: string;
    readonly reason: string;
}
/** One rubric axis in spec priority order. */
export interface RubricAxis {
    readonly name: string;
    readonly description: string;
}
declare const SEVERITIES_REVIEW: readonly ["blocker", "major", "minor", "nit"];
export type ReviewSeverity = (typeof SEVERITIES_REVIEW)[number];
/** File names this review skips, with reasons (spec precondition rows). */
export declare function classifyFile(file: string): "review" | SkippedFile["reason"];
/** Parse args into a target; null means usage error. */
export declare function resolveReviewTarget(args: Readonly<Record<string, string>>, tokens: readonly string[]): ReviewTarget | null;
/** The single read-only git invocation for the resolved target. */
export declare function diffArgv(target: ReviewTarget): string[];
export interface NumstatRow {
    readonly added: number;
    readonly removed: number;
    readonly file: string;
    readonly binary: boolean;
}
/** Parse `git diff --numstat` output; "-" counts mean binary files. */
export declare function parseNumstat(stdout: string): NumstatRow[];
/** Compute the summary, applying skip classification and the size guard. */
export declare function summarizeDiff(rows: readonly NumstatRow[], maxChangedLines?: number): DiffSummary;
/** Diff-size warning threshold (spec precondition: > 1500 changed lines). */
export declare const MAX_CHANGED_LINES = 1500;
/** Scan added lines of a unified diff body; returns locations only. */
export declare function findSecretLocations(diffBody: string): (readonly [file: string, line: number])[];
/** Render the structured review prompt for the resolved target. */
export declare function renderReviewPrompt(target: ReviewTarget, summary: DiffSummary, repoConventions: readonly string[]): string;
/** /bridge-review entry point; pure over (ctx, args, options). Read-only. */
export declare function runReview(ctx: BridgeContext, args: Readonly<Record<string, string>>, options?: ReviewOptions): Promise<CommandResult>;
export {};
//# sourceMappingURL=review.d.ts.map