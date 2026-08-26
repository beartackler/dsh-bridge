#!/usr/bin/env node
/**
 * dsh-bridge static scanner — stage S3 of the trust pipeline.
 *
 * Walks a target directory, applies every rule to every scannable file, and emits a
 * deterministic JSON verdict plus a markdown trust-card draft.
 *
 * Usage:
 *   dsh-scan <target-dir> [--json <path>] [--markdown <path>] [--fail-on <severity>] [--quiet]
 *
 * Exit codes: 0 clean / below threshold, 1 threshold exceeded, 2 usage or I/O error.
 * The exit code is what makes this usable as a CI gate.
 */
import { type Finding, type Rule, type Severity } from "./rules/index.js";
import { type ScanResult } from "./report.js";
export declare const SCANNER_VERSION = "0.1.0";
export interface ScanOptions {
    readonly rules?: readonly Rule[];
    readonly maxFileBytes?: number;
}
/**
 * Recursive directory walk returning repo-relative POSIX paths, sorted.
 *
 * Sorting is what makes the whole report deterministic: readdir order is
 * filesystem-dependent, so an unsorted walk yields different output on macOS and Linux
 * for identical inputs, which would break the "recompute the verdict yourself" promise.
 * Symlinks are not followed (statSync on the entry would traverse them; we use the
 * lstat-like check via withFileTypes to avoid escaping the tree).
 */
export declare function walk(root: string): string[];
export declare function scanContent(content: string, relPath: string, rules?: readonly Rule[]): Finding[];
export declare function scanDirectory(target: string, options?: ScanOptions): ScanResult;
interface CliOptions {
    target: string;
    json?: string;
    markdown?: string;
    failOn?: Severity;
    quiet: boolean;
}
export declare function parseArgs(argv: readonly string[]): CliOptions | {
    error: string;
};
export declare function main(argv?: readonly string[]): number;
export * from "./report.js";
export * from "./rules/index.js";
//# sourceMappingURL=index.d.ts.map