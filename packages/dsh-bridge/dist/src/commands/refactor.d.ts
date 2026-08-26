/**
 * /bridge-refactor - behavior-preserving restructuring with a plan-only
 * default (docs/specs/commands/refactor.md).
 *
 * Three phases:
 *   1. Inventory - per source file under the target: size, line count, import
 *      specifiers (single-line `import`/`require` forms), exported names.
 *   2. Plan - mechanical steps only (split-file, extract-module,
 *      inline-helper, rename), each independently verifiable by running the
 *      tests after that step alone. Steps are computed sequentially against a
 *      virtual copy of the tree and every step carries full post-state file
 *      contents, so later steps never edit stale text.
 *   3. Apply - only behind --apply: snapshot the target into memory, write
 *      each step, run the suite through the injected exec seam between steps,
 *      and restore the snapshot on the first red run.
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - Default is plan-only: without --apply nothing is ever written.
 *  - Every written path must resolve inside the target; a plan step pointing
 *    outside aborts before the first write.
 *  - Exported names are never changed silently: rename steps touching an
 *    exported symbol carry an explicit public-surface flag; split and extract
 *    steps preserve the surface through re-exports.
 *  - Candidates the planner cannot mechanize safely (declarations that
 *    reference sibling top-level names, unboundable blocks, existing target
 *    files) degrade to honest manual notes, never to speculative edits.
 *  - The test seam is capability-probed, not assumed (same pattern as the
 *    compact/resume host seams); without it --apply refuses and writes
 *    nothing. No git operations, no network calls, no emoji.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Command executed through the exec seam after every applied step. */
export declare const TEST_COMMAND = "npm test";
/** Upper bound on plan size; anything past this is dropped and disclosed. */
export declare const MAX_PLAN_STEPS = 8;
/** Line floor for split-file candidacy (spec: oversized multi-export module). */
export declare const SPLIT_MIN_LINES = 40;
/** Export floor for extract-module candidacy on files below the line floor. */
export declare const EXPORT_MODULE_MIN_EXPORTS = 3;
/** Kinds of mechanical steps the planner can emit (spec phase 2). */
export type RefactorStepKind = "split-file" | "extract-module" | "inline-helper" | "rename";
/** One full-content file write belonging to a step. Paths are absolute. */
export interface RefactorEdit {
    readonly path: string;
    readonly content: string;
}
/** One independently verifiable restructuring step. */
export interface RefactorStep {
    readonly id: string;
    readonly kind: RefactorStepKind;
    readonly title: string;
    readonly detail: string;
    /** Every file the step writes; the basis of the containment check. */
    readonly files: readonly string[];
    /** True only when the step changes an exported name. */
    readonly touchesPublicSurface: boolean;
    readonly edits: readonly RefactorEdit[];
}
/** Machine-readable plan; also the on-disk plan-file shape. */
export interface RefactorPlan {
    readonly target: string;
    readonly steps: readonly RefactorStep[];
}
/** Phase-1 row for one source file. Metadata and name lists only. */
export interface SourceFileInfo {
    readonly path: string;
    readonly lines: number;
    readonly sizeBytes: number;
    readonly imports: readonly string[];
    readonly exports: readonly string[];
}
/** Contents of the target tree, keyed by absolute path. */
export interface TargetInventory {
    readonly files: readonly SourceFileInfo[];
    readonly contents: ReadonlyMap<string, string>;
}
/** Error carrying a user-facing message; rendered honestly, never a stack. */
export declare class RefactorError extends Error {
}
export interface ExecRequest {
    readonly command: string;
    readonly cwd?: string;
}
export interface ExecOutcome {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}
export type ExecSeam = (request: ExecRequest) => Promise<ExecOutcome>;
/** Source files under the target; recursive for directories, sorted. */
export declare function collectSourceFiles(target: string): readonly string[];
export interface ScannedSource {
    readonly lineCount: number;
    readonly imports: readonly string[];
    readonly exports: readonly string[];
}
/**
 * Single-pass lexical scan: line count, import specifiers, exported names.
 * Deliberately line-oriented (multi-line import statements are out of scope
 * for the MVP planner); it feeds inventory display and planner heuristics.
 */
export declare function scanSource(content: string): ScannedSource;
export interface PlanOptions {
    readonly rename?: {
        readonly from: string;
        readonly to: string;
    };
}
/**
 * Compute the plan for the target tree. Pure over its inputs: the caller's
 * `contents` map is never mutated; every step is materialized against the
 * virtual state left by the previous step, so edits always hold full
 * post-state contents (spec: steps are independently verifiable).
 */
export declare function buildRefactorPlan(contents: ReadonlyMap<string, string>, options?: PlanOptions): {
    steps: RefactorStep[];
    notes: string[];
};
export declare function inventoryTarget(target: string): TargetInventory;
/** Load and validate a plan file; refuses anything writing outside `target`. */
export declare function loadPlanFile(planPath: string, target: string): RefactorPlan;
export interface AppliedStepRecord {
    readonly stepId: string;
    readonly kind: RefactorStepKind;
    readonly testExitCode: number;
    readonly status: "applied" | "failed";
}
export interface ApplyReport {
    readonly applied: readonly AppliedStepRecord[];
    readonly rolledBack: boolean;
    readonly failedStepId?: string;
    readonly testExitCode?: number;
    readonly stderrTail?: string;
}
/**
 * Execute a plan: snapshot the target, then per step write, run the suite,
 * and roll everything back on the first nonzero exit (spec phase 3).
 */
export declare function applyPlan(plan: RefactorPlan, runCommand: ExecSeam, cwd: string): Promise<ApplyReport>;
/** /bridge-refactor entry point; pure over (ctx, args), no global state. */
export declare function runRefactor(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=refactor.d.ts.map