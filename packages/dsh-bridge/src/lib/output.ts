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

const BOX_WIDTH = 62;

/** Escape pipe characters so cell content cannot break a markdown table. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Render a markdown table. Returns an empty string when there are no rows,
 * so callers can drop whole sections without conditional glue.
 */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return "";
  const head = `| ${headers.map(escapeCell).join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
  return [head, rule, ...body, ""].join("\n");
}

/** Left-pad a label with spaces so it occupies exactly `width` characters. */
function padLabel(label: string, width: number): string {
  return label.length >= width ? `${label} ` : `${label}${" ".repeat(width - label.length)}`;
}

/**
 * Key-value card in the connect spec style (§6.4): a titled block of aligned
 * `key   value` lines inside a fenced code block so monospacing is preserved.
 */
export function card(title: string, fields: readonly (readonly [string, string])[]): string {
  const width = fields.reduce((max, [label]) => Math.max(max, label.length), 0) + 2;
  const lines = fields.map(([label, value]) => `${padLabel(`${label}:`, width)}${value}`);
  const border = "-".repeat(Math.max(title.length + 4, BOX_WIDTH));
  const body = [`+${border}+`, `|  ${title}`, ...lines.map((line) => `|  ${line}`), `+${border}+`];
  return ["```", ...body, "```", ""].join("\n");
}

/** Fixed-width badge for a severity. Text-only; color is never load-bearing. */
export function badge(severity: Severity): string {
  switch (severity) {
    case "info":
      return "[ info ]";
    case "low":
      return "[ LOW ]";
    case "medium":
      return "[ MEDIUM ]";
    case "high":
      return "[ HIGH ]";
    case "critical":
      return "[CRITICAL]";
  }
}

/** Level-3 section heading, the largest level used inside command bodies. */
export function heading(text: string): string {
  return [`### ${text}`, ""].join("\n");
}

/** Bulleted list with hanging two-space indent. Empty input yields nothing. */
export function bulletList(items: readonly string[]): string {
  if (items.length === 0) return "";
  return [...items.map((item) => `- ${item}`), ""].join("\n");
}
