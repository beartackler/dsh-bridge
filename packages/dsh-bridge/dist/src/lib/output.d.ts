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
 * so callers can drop whole sections without conditional glue. Count columns
 * (see `NUMERIC_HEADERS`) are right-aligned; everything else is left-aligned.
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
/**
 * The single phrase for "no review exists". Never a letter, never a dash: an
 * absent grade is a distinct fact from a low grade (CHARTER principle 1).
 */
export declare const UNREVIEWED = "not reviewed";
/** Compact grade cell for a table column: the bare letter, as INDEX.md prints it. */
export declare function gradeCell(letter: string | null | undefined): string;
/**
 * Full grade rendering for a card or prose line: `B - Safe with documented
 * behavior`. Unknown or absent letters render as `UNREVIEWED` rather than
 * being coerced into a band they did not earn.
 */
export declare function gradeLabel(letter: string | null | undefined): string;
/** Bulleted list with hanging two-space indent. Empty input yields nothing. */
export declare function bulletList(items: readonly string[]): string;
/**
 * Collapse rendered markdown to one consistent vertical rhythm.
 *
 * Command bodies are assembled by joining string fragments, and several
 * helpers here (`table`, `card`, `bulletList`) already end with a blank line.
 * Callers that add their own `""` separator therefore produce two or three
 * blank lines in places, which reads as an accidental gap rather than a
 * section break. Rather than auditing every join site, normalize once at the
 * registry boundary:
 *
 *  - runs of blank lines collapse to exactly one
 *  - trailing whitespace on a line is dropped
 *  - the body ends with exactly one newline
 *
 * Fenced code blocks are passed through untouched: blank lines inside a card
 * or a shell transcript are content, not spacing.
 */
export declare function normalizeSpacing(markdown: string): string;
//# sourceMappingURL=output.d.ts.map