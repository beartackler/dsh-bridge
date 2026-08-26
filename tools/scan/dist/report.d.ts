/**
 * Report rendering: scan result -> canonical JSON + a markdown trust-card draft.
 *
 * Grading is a *pure function* of the finding set (pipeline §S6: "No model touches this
 * step"). Two properties are non-negotiable:
 *
 *  1. Caps are monotone. `final = min(band_from_score, ...caps)`. Nothing can raise a grade.
 *  2. Output is byte-stable. Same findings => same bytes, so cards diff cleanly in git and
 *     any third party can recompute the verdict.
 *
 * This module implements the *static-scan slice* of the full pipeline. It emits a draft
 * card explicitly marked as such, because a real grade also requires the behavioral probe
 * and cross-model review stages that are not implemented here. Overstating what we checked
 * would violate the charter's "trust over speed" principle.
 */
import { type Finding, type RuleFamily, type Severity } from "./rules/index.js";
export declare const GRADES: readonly ["A", "B", "C", "D", "F"];
export type Grade = (typeof GRADES)[number];
/** `?` is the absence of a grade, not a grade. `N/A` means ungradable input. */
export type Verdict = Grade | "?" | "N/A";
/** From docs/design/trust-report-card.md §2. Letter + icon + word, never color alone. */
export declare const GRADE_META: Readonly<Record<Verdict, {
    icon: string;
    label: string;
    verdict: string;
}>>;
export type SeverityCounts = Readonly<Record<Severity, number>>;
export interface ScanStats {
    readonly filesScanned: number;
    readonly filesSkipped: number;
    readonly bytesScanned: number;
}
export interface ScanResult {
    readonly target: string;
    readonly scannerVersion: string;
    readonly rulesDigest: string;
    readonly ruleIds: readonly string[];
    readonly stats: ScanStats;
    readonly findings: readonly Finding[];
}
export interface GradeCap {
    readonly grade: Grade;
    readonly reason: string;
}
export interface Grading {
    readonly grade: Verdict;
    readonly score: number;
    readonly counts: SeverityCounts;
    readonly caps: readonly GradeCap[];
    readonly gates: readonly string[];
    readonly familiesPresent: readonly RuleFamily[];
}
export declare function countBySeverity(findings: readonly Finding[]): SeverityCounts;
export declare function grade(findings: readonly Finding[]): Grading;
/**
 * Deterministic JSON with lexicographically sorted keys (RFC 8785 spirit). Plain
 * JSON.stringify preserves insertion order, which would make the digest depend on
 * construction order rather than content.
 */
export declare function canonicalJson(value: unknown): string;
export declare function toJsonReport(result: ScanResult, grading: Grading): string;
/**
 * Markdown card draft. Per the design spec the markdown render has **no color**, so the
 * signal is carried by letter + icon + word label, and evidence is collapsed behind
 * <details> to preserve the 5-second test.
 */
export declare function toMarkdownReport(result: ScanResult, grading: Grading): string;
//# sourceMappingURL=report.d.ts.map