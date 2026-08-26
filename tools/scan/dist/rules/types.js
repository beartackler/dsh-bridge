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
import { createHash } from "node:crypto";
/** Rule severities, ordered weakest -> strongest. Order is load-bearing (see SEVERITY_RANK). */
export const SEVERITIES = ["info", "low", "medium", "high", "critical"];
export const SEVERITY_RANK = Object.freeze({
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
});
/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */
export const MAX_EXCERPT_LENGTH = 200;
export function sha256(input) {
    return createHash("sha256").update(input, "utf8").digest("hex");
}
/**
 * Redact anything that looks like a live secret before it lands in a report.
 * Charter: "Never print secrets; never exfiltrate." A scanner that pastes a stolen
 * token into a public markdown card has itself leaked the token.
 */
export function redact(text) {
    return text
        .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<redacted>")
        .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, "gh?_<redacted>")
        .replace(/AKIA[0-9A-Z]{12,}/g, "AKIA<redacted>")
        .replace(/xox[abposr]-[A-Za-z0-9-]{10,}/g, "xox?-<redacted>")
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "<redacted-jwt>");
}
/** Collapse whitespace and cap length so a minified-bundle hit stays readable. */
export function makeExcerpt(raw) {
    const flattened = redact(raw).replace(/\s+/g, " ").trim();
    if (flattened.length <= MAX_EXCERPT_LENGTH)
        return flattened;
    return `${flattened.slice(0, MAX_EXCERPT_LENGTH - 1)}\u2026`;
}
/* ------------------------------------------------------------------------- */
/* Per-content analysis cache                                                 */
/* ------------------------------------------------------------------------- */
/**
 * Memoization keyed by the content string itself.
 *
 * Before this cache, every file paid these costs once per consumer:
 *  - maskComments(): O(n) char-by-char rebuild, run by runDetectors for four rules
 *    plus twice more inside obfuscation's blob/staged-decode detectors => six full
 *    rebuilds of each file;
 *  - new LineIndex(): O(n) newline scan, run eagerly in every runDetectors call even
 *    when a file has zero matches (the common case) => five scans per file.
 *
 * Outputs are byte-identical to calling the primitives directly; only the number of
 * times they run changes. Purity of the primitives makes this sound.
 *
 * The caches are bounded: every consumer of one content string runs inside a single
 * synchronous scanContent call, so a small window is enough to share work across rules
 * without retaining the whole tree. Eviction resets the map wholesale, which affects
 * speed only, never output.
 */
const CACHE_LIMIT = 128;
let maskedCache = new Map();
/** Memoized maskComments for the scan pipeline. Same output, at most one rebuild per content. */
export function maskCommentsCached(content) {
    let masked = maskedCache.get(content);
    if (masked === undefined) {
        if (maskedCache.size >= CACHE_LIMIT)
            maskedCache = new Map();
        masked = maskComments(content);
        maskedCache.set(content, masked);
    }
    return masked;
}
let lineIndexCache = new Map();
/** Shared LineIndex for the scan pipeline: built lazily, at most once per content. */
export function lineIndexOf(content) {
    let index = lineIndexCache.get(content);
    if (index === undefined) {
        if (lineIndexCache.size >= CACHE_LIMIT)
            lineIndexCache = new Map();
        index = new LineIndex(content);
        lineIndexCache.set(content, index);
    }
    return index;
}
/** Drops cached analysis artifacts; called between scans so memory follows workload. */
export function resetAnalysisCaches() {
    maskedCache = new Map();
    lineIndexCache = new Map();
}
/**
 * Per-detector global-flags clones, keyed by the original pattern object. Detectors are
 * frozen module-level constants, so each corpus regex is compiled exactly once for the
 * lifetime of the process instead of once per (file x rule). The clone still belongs to
 * the detector alone, so lastIndex state can never bleed across files or rules.
 */
const compiledPatterns = new WeakMap();
/**
 * Precomputed newline offsets, so offset->(line,col) is O(log n) instead of O(n)
 * per match. Minified bundles are single-line and megabytes wide; the naive
 * `content.slice(0, i).split("\n")` approach is quadratic there.
 */
export class LineIndex {
    lineStarts;
    constructor(content) {
        const starts = [0];
        for (let i = 0; i < content.length; i += 1) {
            if (content.charCodeAt(i) === 10 /* \n */)
                starts.push(i + 1);
        }
        this.lineStarts = starts;
    }
    /** Returns 1-based line/col for a 0-based character offset. */
    locate(offset) {
        let lo = 0;
        let hi = this.lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.lineStarts[mid] <= offset)
                lo = mid;
            else
                hi = mid - 1;
        }
        return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
    }
    lineText(content, line) {
        const start = this.lineStarts[line - 1] ?? 0;
        const end = this.lineStarts[line] ?? content.length + 1;
        return content.slice(start, Math.max(start, end - 1));
    }
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
export function maskComments(content) {
    const out = content.split("");
    let mode = "code";
    let escaped = false;
    for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        const next = content[i + 1];
        switch (mode) {
            case "code":
                if (ch === "/" && next === "/") {
                    mode = "line";
                    out[i] = " ";
                    out[i + 1] = " ";
                    i += 1;
                }
                else if (ch === "/" && next === "*") {
                    mode = "block";
                    out[i] = " ";
                    out[i + 1] = " ";
                    i += 1;
                }
                else if (ch === "'")
                    mode = "single";
                else if (ch === '"')
                    mode = "double";
                else if (ch === "`")
                    mode = "template";
                break;
            case "line":
                if (ch === "\n")
                    mode = "code";
                else
                    out[i] = " ";
                break;
            case "block":
                if (ch === "*" && next === "/") {
                    out[i] = " ";
                    out[i + 1] = " ";
                    i += 1;
                    mode = "code";
                }
                else if (ch !== "\n") {
                    out[i] = " ";
                }
                break;
            case "single":
            case "double":
            case "template":
                if (escaped) {
                    escaped = false;
                }
                else if (ch === "\\") {
                    escaped = true;
                }
                else if ((mode === "single" && ch === "'") ||
                    (mode === "double" && ch === '"') ||
                    (mode === "template" && ch === "`")) {
                    mode = "code";
                }
                break;
        }
    }
    return out.join("");
}
/**
 * Shared regex-detector driver. Every rule funnels through this so that
 * evidence shape, hashing, redaction, and ordering are identical everywhere.
 */
export function runDetectors(options) {
    const { rule, filePath, content, detectors } = options;
    const haystack = options.ignoreComments === false ? content : maskCommentsCached(content);
    const findings = [];
    // Built lazily: files with zero matches (the common case) never pay the newline scan.
    let index = null;
    for (const detector of detectors) {
        // Clone the pattern so rule modules can declare their regexes as module-level
        // constants without lastIndex bleeding across files (a classic /g footgun).
        // Compilation is hoisted per corpus: detectors carry frozen RegExp objects, so the
        // cloned pattern is cached alongside the original instead of rebuilt per file.
        let pattern = compiledPatterns.get(detector.pattern);
        if (pattern === undefined) {
            const flags = detector.pattern.flags.includes("g") ? detector.pattern.flags : `${detector.pattern.flags}g`;
            pattern = new RegExp(detector.pattern.source, flags);
            compiledPatterns.set(detector.pattern, pattern);
        }
        let match = pattern.exec(haystack);
        while (match !== null) {
            if (match[0].length === 0) {
                pattern.lastIndex += 1;
            }
            else if (!detector.refine || detector.refine(match, content)) {
                const offset = match.index;
                index ??= lineIndexOf(content);
                const { line, col } = index.locate(offset);
                // Cite the real source text, not the comment-masked copy.
                const rawMatch = content.slice(offset, offset + match[0].length);
                const context = index.lineText(content, line);
                findings.push({
                    id: `${rule.family}-${detector.code}`,
                    ruleId: rule.id,
                    family: rule.family,
                    severity: detector.severity ?? rule.severity,
                    message: detector.message,
                    path: filePath,
                    line,
                    col,
                    excerpt: makeExcerpt(context.length <= MAX_EXCERPT_LENGTH ? context : rawMatch),
                    excerptSha256: sha256(rawMatch),
                    confidence: detector.confidence ?? 0.7,
                    ...(detector.note ? { note: detector.note } : {}),
                });
            }
            match = pattern.exec(haystack);
        }
    }
    return sortFindings(findings);
}
/**
 * Total order over findings. Deterministic output is a hard requirement: report cards
 * are committed to git and diffed by reviewers, so an unstable sort would produce
 * phantom churn and destroy the "recompute it yourself" verification story.
 */
export function compareFindings(a, b) {
    if (a.path !== b.path)
        return a.path < b.path ? -1 : 1;
    if (a.line !== b.line)
        return a.line - b.line;
    if (a.col !== b.col)
        return a.col - b.col;
    if (a.id !== b.id)
        return a.id < b.id ? -1 : 1;
    if (a.message !== b.message)
        return a.message < b.message ? -1 : 1;
    return 0;
}
export function sortFindings(findings) {
    return [...findings].sort(compareFindings);
}
//# sourceMappingURL=types.js.map