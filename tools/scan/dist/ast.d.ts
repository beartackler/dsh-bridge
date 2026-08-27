/**
 * AST analysis layer (stage S3, second pass).
 *
 * The self-audit (docs/reviews/scanner-selfaudit.md) closes with the corpus rule that
 * "regex must never be the sole basis for a critical finding". Regex sees tokens; the
 * bypasses that mattered were all *shapes*: an identifier bound to `eval`, a property
 * name assembled from two string halves, a specifier that is a variable, a credential
 * value that reaches a request one hop later. Each is trivial once the file is a tree.
 *
 * Design constraints carried over from the regex layer:
 *  - Deterministic output. The walk is source-order; no Map/Set iteration reaches output
 *    unsorted; findings go through the same sort as regex findings.
 *  - No hard runtime dependency. `typescript` is loaded lazily through createRequire and
 *    treated as optional: if it is missing, or the file does not parse, callers fall back
 *    to the regex layer and the report says so per finding (`analysis` field).
 *  - Same evidence contract: path:line:col, excerpt, sha256 of the cited text.
 *
 * Deliberate approximations, stated rather than hidden:
 *  - Binding resolution is per file and by *name*, not by scope. Shadowing a name in an
 *    inner block can therefore carry a taint it should not. That direction is fail-closed
 *    (a finding a human can dismiss), which is the direction the pipeline spec requires.
 *  - Flow is intra-file. Cross-module flows remain the grading layer's package-level gate.
 */
import type tsNs from "typescript";
import { type Finding } from "./rules/types.js";
type TS = typeof tsNs;
/**
 * Load the TypeScript compiler API if it is present.
 *
 * Dependency decision: `typescript` stays a devDependency plus an optionalDependency and
 * is required lazily, so `npm i @dsh-bridge/scan` still yields a working CLI with the
 * regex layer if the optional install is skipped or pruned. A synchronous `createRequire`
 * (rather than `await import`) keeps `scanContent`/`scanDirectory` synchronous, which is
 * the published CLI and library contract.
 */
export declare function loadTypeScript(): TS | null;
/** Test seam: force the loader's answer. Passing `undefined` restores real detection. */
export declare function setTypeScriptForTesting(value: TS | null | undefined): void;
export declare function isAstAnalyzable(filePath: string): boolean;
/**
 * Parse a file. Returns null when TypeScript is unavailable, the extension is not JS/TS,
 * or the source has parse errors — a partially-parsed tree would silently under-report,
 * which is worse than falling back to regex.
 */
export declare function parseSourceFile(content: string, filePath: string): tsNs.SourceFile | null;
export interface AstAnalysis {
    readonly findings: readonly Finding[];
}
/**
 * Analyze one parsed file. Cached per SourceFile so N rules asking for AST findings pay
 * for one traversal, exactly as the regex layer shares its masked-content cache.
 */
export declare function analyzeSourceFile(sourceFile: tsNs.SourceFile, filePath: string): AstAnalysis;
/** Findings from the AST pass belonging to one rule. Used by each rule's analyzeAst. */
export declare function astFindingsForRule(sourceFile: tsNs.SourceFile, filePath: string, ruleId: string): Finding[];
export {};
//# sourceMappingURL=ast.d.ts.map