/**
 * /bridge-improve - adversarial over-engineering audit (docs/specs/commands/improve.md).
 *
 * `/review` asks whether the code is correct. This asks what can be deleted.
 * Findings are ranked by deletion value and rendered one line each.
 *
 * Invariants from the spec and CHARTER.md:
 *  - Read-only. Source is read through injected fs functions; nothing is written.
 *  - `--diff` is the only path that shells out, and only for
 *    `git diff --name-only` forms (spec "Execution model").
 *  - Analysis is pure over (path, content): deterministic, fixture-testable.
 *  - Every finding states a cut and a replacement; one without both never fires.
 *  - ASCII only, no emoji.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** How much complexity disappears if the finding is acted on. */
export type DeletionValue = "high" | "medium" | "low";
export type DetectorId = "oversized-file" | "long-function" | "deep-nesting" | "commented-out-code" | "comment-ratio" | "todo-debt";
/** One audit finding. `cut` and `replacement` are both required by contract. */
export interface ImproveFinding {
    readonly detector: DetectorId;
    readonly value: DeletionValue;
    readonly path: string;
    readonly line: number;
    /** What to delete or split. */
    readonly cut: string;
    /** What stands in its place. */
    readonly replacement: string;
    /** Estimated lines removable; the secondary sort key. */
    readonly removableLines: number;
}
export interface SkippedFile {
    readonly path: string;
    readonly reason: string;
}
export interface ImproveReport {
    readonly findings: readonly ImproveFinding[];
    readonly audited: readonly {
        readonly path: string;
        readonly lines: number;
    }[];
    readonly skipped: readonly SkippedFile[];
    /** Findings dropped by --limit, after filtering. */
    readonly truncated: number;
}
/** Filesystem and process seams, injected so tests never touch the real repo. */
export interface ImproveDeps {
    readFile(path: string): string;
    /** Direct children of a directory, names only. */
    readDir(path: string): readonly string[];
    statPath(path: string): {
        readonly isFile: boolean;
        readonly isDirectory: boolean;
    } | null;
    /** Read-only `git diff --name-only ...` runner; returns one path per line. */
    gitDiffNames(cwd: string): readonly string[];
}
export declare const FILE_LINES_WARN = 300;
export declare const FILE_LINES_HIGH = 600;
export declare const FUNCTION_LINES_WARN = 50;
export declare const FUNCTION_LINES_HIGH = 120;
export declare const NESTING_WARN = 5;
export declare const NESTING_HIGH = 7;
export declare const COMMENT_RATIO_WARN = 0.4;
interface ClassifiedLine {
    readonly text: string;
    readonly comment: boolean;
    /** Comment and string content stripped, so brace counting stays honest. */
    readonly code: string;
}
/**
 * Classify each line as comment or code and strip literals from the code half.
 * A single pass over the file with a block-comment flag; good enough for brace
 * counting, and the spec scopes this to brace-delimited languages.
 */
export declare function classifyLines(content: string): readonly ClassifiedLine[];
/** Analyze one file. Pure over (path, content) - the whole detector surface. */
export declare function analyzeFile(path: string, content: string): readonly ImproveFinding[];
/** Value desc, removable lines desc, then file:line. Stable across runs. */
export declare function rankFindings(findings: readonly ImproveFinding[]): readonly ImproveFinding[];
/** Resolve a target into the file list to audit, plus what was skipped and why. */
export declare function resolveTargets(deps: ImproveDeps, target: string): {
    readonly files: readonly string[];
    readonly skipped: readonly SkippedFile[];
};
export interface ImproveOptions {
    readonly target?: string;
    readonly diff: boolean;
    readonly minValue: DeletionValue;
    readonly limit: number;
}
export declare const DEFAULT_LIMIT = 12;
/** Parse the flag record the command layer hands down. Unknown keys ignored. */
export declare function parseImproveArgs(args: Readonly<Record<string, string>>): ImproveOptions;
export declare class ImproveError extends Error {
}
/** Run the audit over resolved options. Throws ImproveError for user errors. */
export declare function auditTargets(deps: ImproveDeps, options: ImproveOptions, cwd: string): ImproveReport;
/** One line per finding; no prose. Empty ledgers print a single line. */
export declare function renderImproveReport(report: ImproveReport): string;
/** Real seams: fs reads plus the two read-only git diff forms. */
export declare function defaultImproveDeps(): ImproveDeps;
/** Optional session working directory carried on the context. */
export interface ImproveContext extends BridgeContext {
    /** Working directory of the current session; defaults to the process cwd. */
    readonly cwd?: string;
}
/** /bridge-improve entry point; pure over (ctx, args, deps). */
export declare function runImprove(ctx: BridgeContext, args: Readonly<Record<string, string>>, deps?: ImproveDeps): Promise<CommandResult>;
export {};
//# sourceMappingURL=improve.d.ts.map