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
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

/**
 * Rule families from the pipeline spec (§S3). A rule declares its family so the
 * adjudicator can apply family-level compounding logic (e.g. CRED + NET => critical).
 */
export type RuleFamily =
  | "EXEC"
  | "NET"
  | "CRED"
  | "FS"
  | "HOOK"
  | "OBFU"
  | "SUPPLY"
  | "PRIV";

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

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

export const MAX_EXCERPT_LENGTH = 200;

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Redact anything that looks like a live secret before it lands in a report.
 * Charter: "Never print secrets; never exfiltrate." A scanner that pastes a stolen
 * token into a public markdown card has itself leaked the token.
 */
export function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<redacted>")
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, "gh?_<redacted>")
    .replace(/AKIA[0-9A-Z]{12,}/g, "AKIA<redacted>")
    .replace(/xox[abposr]-[A-Za-z0-9-]{10,}/g, "xox?-<redacted>")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "<redacted-jwt>");
}

/** Collapse whitespace and cap length so a minified-bundle hit stays readable. */
export function makeExcerpt(raw: string): string {
  const flattened = redact(raw).replace(/\s+/g, " ").trim();
  if (flattened.length <= MAX_EXCERPT_LENGTH) return flattened;
  return `${flattened.slice(0, MAX_EXCERPT_LENGTH - 1)}\u2026`;
}

/**
 * Precomputed newline offsets, so offset->(line,col) is O(log n) instead of O(n)
 * per match. Minified bundles are single-line and megabytes wide; the naive
 * `content.slice(0, i).split("\n")` approach is quadratic there.
 */
export class LineIndex {
  private readonly lineStarts: number[];

  constructor(content: string) {
    const starts = [0];
    for (let i = 0; i < content.length; i += 1) {
      if (content.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
    }
    this.lineStarts = starts;
  }

  /** Returns 1-based line/col for a 0-based character offset. */
  locate(offset: number): { line: number; col: number } {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
  }

  lineText(content: string, line: number): string {
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
export function maskComments(content: string): string {
  const out = content.split("");
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";
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
        } else if (ch === "/" && next === "*") {
          mode = "block";
          out[i] = " ";
          out[i + 1] = " ";
          i += 1;
        } else if (ch === "'") mode = "single";
        else if (ch === '"') mode = "double";
        else if (ch === "`") mode = "template";
        break;

      case "line":
        if (ch === "\n") mode = "code";
        else out[i] = " ";
        break;

      case "block":
        if (ch === "*" && next === "/") {
          out[i] = " ";
          out[i + 1] = " ";
          i += 1;
          mode = "code";
        } else if (ch !== "\n") {
          out[i] = " ";
        }
        break;

      case "single":
      case "double":
      case "template":
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (
          (mode === "single" && ch === "'") ||
          (mode === "double" && ch === '"') ||
          (mode === "template" && ch === "`")
        ) {
          mode = "code";
        }
        break;
    }
  }

  return out.join("");
}

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
export function runDetectors(options: RunDetectorsOptions): Finding[] {
  const { rule, filePath, content, detectors } = options;
  const haystack = options.ignoreComments === false ? content : maskComments(content);
  const index = new LineIndex(content);
  const findings: Finding[] = [];

  for (const detector of detectors) {
    // Clone the pattern so rule modules can declare their regexes as module-level
    // constants without lastIndex bleeding across files (a classic /g footgun).
    const flags = detector.pattern.flags.includes("g")
      ? detector.pattern.flags
      : `${detector.pattern.flags}g`;
    const pattern = new RegExp(detector.pattern.source, flags);

    let match: RegExpExecArray | null = pattern.exec(haystack);
    while (match !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      } else if (!detector.refine || detector.refine(match, content)) {
        const offset = match.index;
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
export function compareFindings(a: Finding, b: Finding): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.col !== b.col) return a.col - b.col;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(compareFindings);
}
