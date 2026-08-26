#!/usr/bin/env node
/**
 * Performance bench for the dsh-bridge static scanner.
 *
 * Builds a synthetic tree of 500 files x ~20 KB with mixed content (clean code, a
 * comment-heavy module, a minified single-line bundle, and a malicious-looking module),
 * scans it with scanDirectory(), and reports wall-clock ms plus peak RSS delta.
 *
 * The canonical JSON verdict over the tree is also hashed and printed so an optimization
 * pass can prove output determinism: identical sha before/after means byte-identical output.
 *
 * Run: npm run build && node dist/bench.js [rounds]
 */
interface BenchResult {
    readonly rounds: number;
    readonly fileCount: number;
    readonly bytesPerFile: number;
    readonly totalBytes: number;
    readonly roundMs: number[];
    readonly medianMs: number;
    readonly meanMs: number;
    readonly peakRssDeltaMb: number;
    readonly verdictSha256: string;
    readonly findings: number;
}
export declare function runBench(rounds: number): BenchResult;
export {};
//# sourceMappingURL=bench.d.ts.map