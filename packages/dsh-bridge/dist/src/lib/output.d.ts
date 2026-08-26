/**
 * Markdown output helpers shared by every bridge command.
 *
 * Rules (CHARTER.md non-negotiables):
 *  - No emoji, anywhere. Structure carries the tone.
 *  - Plain ASCII; output must survive being piped into `less` (help spec edge 5).
 *  - Never interpolate secret values; callers pass masked strings only
 *    (connect spec S1: everything goes through `mask()` upstream).
 *
 * These helpers return markdown tables and fenced blocks that render in the
 * DSH session UI (commands seam: handler text is rendered by UI adapters,
 * seams doc §3.1).
 */
import type { Severity } from "./types.js";
/**
 * Render a markdown table. Returns an empty string when there are no rows,
 * so callers can drop whole sections without conditional glue.
 */
export declare function table(headers: readonly string[], rows: readonly (readonly string[])[]): string;
/**
 * Key-value card in the connect spec style (§6.4): a titled block of aligned
 * `key   value` lines inside a fenced code block so monospacing is preserved.
 */
export declare function card(title: string, fields: readonly (readonly [string, string])[]): string;
/** Fixed-width badge for a severity. Text-only; color is never load-bearing. */
export declare function badge(severity: Severity): string;
/** Level-3 section heading, the largest level used inside command bodies. */
export declare function heading(text: string): string;
/** Bulleted list with hanging two-space indent. Empty input yields nothing. */
export declare function bulletList(items: readonly string[]): string;
//# sourceMappingURL=output.d.ts.map