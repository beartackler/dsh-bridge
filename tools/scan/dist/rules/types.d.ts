/**
 * Shared types + detector helpers for the dsh-bridge static scanner (pipeline stage S3).
 *
 * Design constraints (from docs/trust/pipeline-architecture.md):
 *  - Every finding cites `path:line:col` and carries an excerpt + excerpt hash, so a
 *    third party can re-verify the claim against the artifact byte-for-byte.
 *  - Output must be deterministic: same inputs => same bytes. No timestamps, no absolute
 *    paths, no Set/Map iteration order leaking into output, no locale-dependent sorting.
 *  - No dependencies beyond `typescript` (build-time) and the Node standard library.
 */
/** Rule severities, ordered weakest -> strongest. Order is load-bearing (see SEVERITY_RANK). */
export declare const SEVERITIES: readonly ["info", "low", "medium", "high", "critical"];
export type Severity = (typeof SEVERITIES)[number];
export declare const SEVERITY_RANK: Readonly<Record<Severity, number>>;
/**
 * Rule families from the pipeline spec (§S3). A rule declares its family so the
 * adjudicator can apply family-level compounding logic (e.g. CRED + NET => critical).
 */
export type RuleFamily = "EXEC" | "NET" | "CRED" | "FS" | "HOOK" | "OBFU" | "SUPPLY" | "PRIV";
/**
 * A single piece of evidence. This is the unit the report card cites.
 * `path` is always repo-relative + POSIX-separated so findings are portable across machines.
 */
export interface Finding {
    /** Stable identifier, e.g. `EXEC-001`. Unique per rule + detector within the rule. */
    readonly id: string;
    readonly ruleId: string;
    readonly family: RuleFamily;
    readonly severity: Severity;
    /** One-line, English-first, plain-language explanation of *this* hit. */
    readonly message: string;
    /** Relative POSIX path of the scanned file. */
    readonly path: string;
    /** 1-based. */
    readonly line: number;
    /** 1-based. */
    readonly col: number;
    /** Trimmed, length-capped source excerpt. Never contains secret values (see redact()). */
    readonly excerpt: string;
    /** sha256 of the *raw* matched text, pre-truncation. Mechanically verifiable. */
    readonly excerptSha256: string;
    /** Detector confidence in [0,1]. Regex detectors top out below 1.0 by design. */
    readonly confidence: number;
    /** Optional human note: known false-positive shapes, or what would disprove the hit. */
    readonly note?: string;
}
/** A scanner rule. Rules are pure: same (content, filePath) => same findings. */
export interface Rule {
    readonly id: string;
    readonly family: RuleFamily;
    readonly severity: Severity;
    readonly description: string;
    /** Rule corpus version; pinned so a re-run is reproducible. */
    readonly version: string;
    /** Files this rule applies to. Defaults to all scannable files when omitted. */
    appliesTo?(filePath: string): boolean;
    match(content: string, filePath: string): Finding[];
}
export declare const MAX_EXCERPT_LENGTH = 200;
export declare function sha256(input: string): string;
/**
 * Redact anything that looks like a live secret before it lands in a report.
 * Charter: "Never print secrets; never exfiltrate." A scanner that pastes a stolen
 * token into a public markdown card has itself leaked the token.
 */
export declare function redact(text: string): string;
/** Collapse whitespace and cap length so a minified-bundle hit stays readable. */
export declare function makeExcerpt(raw: string): string;
/** Memoized maskComments for the scan pipeline. Same output, at most one rebuild per content. */
export declare function maskCommentsCached(content: string): string;
/** Shared LineIndex for the scan pipeline: built lazily, at most once per content. */
export declare function lineIndexOf(content: string): LineIndex;
/** Drops cached analysis artifacts; called between scans so memory follows workload. */
export declare function resetAnalysisCaches(): void;
/**
 * Precomputed newline offsets, so offset->(line,col) is O(log n) instead of O(n)
 * per match. Minified bundles are single-line and megabytes wide; the naive
 * `content.slice(0, i).split("\n")` approach is quadratic there.
 */
export declare class LineIndex {
    private readonly lineStarts;
    constructor(content: string);
    /** Returns 1-based line/col for a 0-based character offset. */
    locate(offset: number): {
        line: number;
        col: number;
    };
    lineText(content: string, line: number): string;
}
/**
 * Blank out `//` and block comments, preserving byte offsets so citations stay accurate.
 *
 * Why: a rule that fires on `// never use eval() here` produces a false positive that
 * destroys user trust in the whole card. String literals are deliberately *kept*, since
 * URLs and credential paths live inside them and are exactly what NET/CRED look for.
 *
 * This is a lexical approximation, not a parser. It tracks string/template/regex context
 * well enough to avoid the common failure of treating `"http://x//y"` as a comment.
 */
export declare function maskComments(content: string): string;
export interface DetectorSpec {
    /** Suffix appended to the rule id, e.g. `001` => `EXEC-001`. */
    readonly code: string;
    readonly pattern: RegExp;
    readonly message: string;
    readonly severity?: Severity;
    readonly confidence?: number;
    readonly note?: string;
    /**
     * Optional post-filter. Receives the RegExp match; return false to discard.
     * Used to encode known false-positive shapes next to the detector that causes them.
     */
    readonly refine?: (match: RegExpExecArray, content: string) => boolean;
}
export interface RunDetectorsOptions {
    readonly rule: Pick<Rule, "id" | "family" | "severity">;
    readonly filePath: string;
    readonly content: string;
    readonly detectors: readonly DetectorSpec[];
    /** When true (default), comments are masked out before matching. */
    readonly ignoreComments?: boolean;
}
/**
 * Shared regex-detector driver. Every rule funnels through this so that
 * evidence shape, hashing, redaction, and ordering are identical everywhere.
 */
export declare function runDetectors(options: RunDetectorsOptions): Finding[];
/**
 * Total order over findings. Deterministic output is a hard requirement: report cards
 * are committed to git and diffed by reviewers, so an unstable sort would produce
 * phantom churn and destroy the "recompute it yourself" verification story.
 */
export declare function compareFindings(a: Finding, b: Finding): number;
export declare function sortFindings(findings: readonly Finding[]): Finding[];
//# sourceMappingURL=types.d.ts.map