/**
 * Typed wrapper around the dsh-bridge static scanner (tools/scan).
 *
 * Invocation contract (tools/scan/src/index.ts):
 *   node <dist/index.js> <target-dir> [--json <path>] [--fail-on <sev>] [--quiet]
 *   exit codes: 0 clean/below threshold, 1 threshold exceeded, 2 usage or I/O error.
 *
 * The scanner is spawned as a separate Node process on purpose: audit code
 * must not share a runtime with the plugin host, and the JSON boundary is the
 * documented, versioned interface (`schema: "dsh-bridge.scan/v1"`).
 */
/** Severities of tools/scan; order matches its SEVERITY_RANK. */
declare const SCANNER_SEVERITIES: readonly ["info", "low", "medium", "high", "critical"];
export type ScannerSeverity = (typeof SCANNER_SEVERITIES)[number];
/** One evidence item of a scanner verdict. Mirrors tools/scan `Finding`. */
export interface ScanFinding {
    readonly id: string;
    readonly ruleId: string;
    readonly family: string;
    readonly severity: ScannerSeverity;
    readonly message: string;
    readonly path: string;
    readonly line: number;
    readonly col: number;
    readonly excerpt: string;
    readonly excerptSha256: string;
    readonly confidence: number;
    readonly note?: string;
}
/** Severity histogram as written by tools/scan `toJsonReport`. */
export interface SeverityCounts {
    readonly info: number;
    readonly low: number;
    readonly medium: number;
    readonly high: number;
    readonly critical: number;
}
/**
 * Canonical JSON verdict of the scanner, schema `dsh-bridge.scan/v1`.
 * Field-for-field mirror of tools/scan/src/report.ts `toJsonReport`; drift is
 * caught by the self-test against the real dist output.
 */
export interface ScanReport {
    readonly schema: string;
    readonly scannerVersion: string;
    readonly rulesDigest: string;
    readonly ruleIds: readonly string[];
    readonly target: string;
    readonly stats: {
        readonly filesScanned: number;
        readonly filesSkipped: number;
        readonly bytesScanned: number;
    };
    readonly grading: {
        readonly grade: string;
        readonly score: number;
        readonly counts: SeverityCounts;
        readonly caps: readonly {
            grade: string;
            reason: string;
        }[];
        readonly gates: readonly string[];
        readonly familiesPresent: readonly string[];
    };
    readonly findings: readonly ScanFinding[];
}
export interface ScanOutcome {
    readonly report: ScanReport;
    /** Scanner process exit code: 0 ok, 1 threshold exceeded, never expected here. */
    readonly exitCode: number;
}
export declare class ScanClientError extends Error {
    readonly exitCode: number | null;
    readonly stderrTail: string;
    constructor(message: string, exitCode: number | null, stderrTail: string);
}
export interface ScanClientOptions {
    /**
     * Absolute path to the compiled scanner entry. Defaults to the repo-local
     * `tools/scan/dist/index.js` relative to this file's build location
     * (`packages/dsh-bridge/dist/lib` -> repo root -> `tools/scan/dist`).
     */
    readonly entryPath?: string;
    /** Node executable used to spawn the scanner. */
    readonly nodePath?: string;
    /** Kill the scanner after this many milliseconds; a hung audit fails loudly. */
    readonly timeoutMs?: number;
}
/** Resolve the scanner binary without spawning it; exported for tests/tools. */
export declare function resolveScannerEntry(options?: Pick<ScanClientOptions, "entryPath">): string;
/**
 * Run the scanner over `targetDir` and return its parsed, typed verdict.
 *
 * The JSON is exchanged through a temp file rather than stdout because the
 * CLI writes human summaries there; `--json <path>` is the documented
 * machine channel. Exit code 1 (threshold exceeded) is a valid outcome, not
 * an error: callers decide policy.
 */
export declare function scanDirectory(targetDir: string, options?: ScanClientOptions): Promise<ScanOutcome>;
/**
 * Validate one parsed verdict against the v1 schema shape. Hand-rolled on
 * purpose: zero runtime dependencies, and malformed scanner output must fail
 * with a precise message instead of poisoning downstream rendering.
 */
export declare function parseScanReport(value: unknown): ScanReport;
export {};
//# sourceMappingURL=scan-client.d.ts.map