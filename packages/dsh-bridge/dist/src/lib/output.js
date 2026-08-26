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
const BOX_WIDTH = 62;
/** Escape pipe characters so cell content cannot break a markdown table. */
function escapeCell(text) {
    return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
/**
 * Column headers whose values are counts. These render right-aligned, matching
 * the `Stars` column in docs/catalog/INDEX.md so numbers line up on their last
 * digit and are comparable down the column at a glance. Membership is keyed by
 * the header text itself, so every command gets the same treatment for free
 * without threading an alignment argument through each call site.
 */
const NUMERIC_HEADERS = new Set([
    "#",
    "STARS",
    "LINES",
    "MESSAGES",
    "IMPORTS",
    "EXPORTS",
    "FILES",
    "ADDED",
    "REMOVED",
    "SKIPPED",
    "SCORE",
    "COUNT",
]);
/** Markdown delimiter row cell for one header: right-aligned when numeric. */
function ruleCell(header) {
    return NUMERIC_HEADERS.has(header.trim().toUpperCase()) ? "---:" : "---";
}
/**
 * Render a markdown table. Returns an empty string when there are no rows,
 * so callers can drop whole sections without conditional glue. Count columns
 * (see `NUMERIC_HEADERS`) are right-aligned; everything else is left-aligned.
 */
export function table(headers, rows) {
    if (rows.length === 0)
        return "";
    const head = `| ${headers.map(escapeCell).join(" | ")} |`;
    const rule = `| ${headers.map(ruleCell).join(" | ")} |`;
    const body = rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
    return [head, rule, ...body, ""].join("\n");
}
/** Left-pad a label with spaces so it occupies exactly `width` characters. */
function padLabel(label, width) {
    return label.length >= width ? `${label} ` : `${label}${" ".repeat(width - label.length)}`;
}
/**
 * Key-value card in the connect spec style (§6.4): a titled block of aligned
 * `key   value` lines inside a fenced code block so monospacing is preserved.
 */
export function card(title, fields) {
    const width = fields.reduce((max, [label]) => Math.max(max, label.length), 0) + 2;
    const lines = fields.map(([label, value]) => `${padLabel(`${label}:`, width)}${value}`);
    const border = "-".repeat(Math.max(title.length + 4, BOX_WIDTH));
    const body = [`+${border}+`, `|  ${title}`, ...lines.map((line) => `|  ${line}`), `+${border}+`];
    return ["```", ...body, "```", ""].join("\n");
}
/** Fixed-width badge for a severity. Text-only; color is never load-bearing. */
export function badge(severity) {
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
export function heading(text) {
    return [`### ${text}`, ""].join("\n");
}
/**
 * Grade band names, verbatim from docs/catalog/INDEX.md "Grading bands".
 * One definition, so a card, a table legend, and an install prompt can never
 * describe the same letter with three different phrases.
 */
const GRADE_BANDS = Object.freeze({
    A: "Verified-clean",
    B: "Safe with documented behavior",
    C: "Use with awareness",
    D: "Risky",
    F: "Do not install",
});
/**
 * The single phrase for "no review exists". Never a letter, never a dash: an
 * absent grade is a distinct fact from a low grade (CHARTER principle 1).
 */
export const UNREVIEWED = "not reviewed";
/**
 * Split a raw grade cell into the band letter and any modifier a card carries
 * (`B+`, `C-`). The band is defined by the letter; the modifier is the card
 * author's nuance and is preserved verbatim rather than rounded away.
 */
function splitGrade(letter) {
    const match = /^([A-F])([+-]?)$/.exec((letter ?? "").trim().toUpperCase());
    if (match === null)
        return null;
    return { key: match[1] ?? "", suffix: match[2] ?? "" };
}
/** Compact grade cell for a table column: the bare letter, as INDEX.md prints it. */
export function gradeCell(letter) {
    const parsed = splitGrade(letter);
    return parsed === null ? "?" : `${parsed.key}${parsed.suffix}`;
}
/**
 * Full grade rendering for a card or prose line: `B - Safe with documented
 * behavior`. Unknown or absent letters render as `UNREVIEWED` rather than
 * being coerced into a band they did not earn.
 */
export function gradeLabel(letter) {
    const parsed = splitGrade(letter);
    if (parsed === null)
        return UNREVIEWED;
    const band = GRADE_BANDS[parsed.key];
    return band === undefined ? UNREVIEWED : `${parsed.key}${parsed.suffix} - ${band}`;
}
/** Bulleted list with hanging two-space indent. Empty input yields nothing. */
export function bulletList(items) {
    if (items.length === 0)
        return "";
    return [...items.map((item) => `- ${item}`), ""].join("\n");
}
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
export function normalizeSpacing(markdown) {
    const lines = markdown.split(/\r?\n/);
    const out = [];
    let inFence = false;
    for (const raw of lines) {
        const line = inFence ? raw : raw.replace(/[ \t]+$/, "");
        if (/^\s*```/.test(line))
            inFence = !inFence;
        if (!inFence && line === "" && out.length > 0 && out[out.length - 1] === "")
            continue;
        if (!inFence && line === "" && out.length === 0)
            continue;
        out.push(line);
    }
    while (out.length > 0 && out[out.length - 1] === "")
        out.pop();
    return out.length === 0 ? "" : `${out.join("\n")}\n`;
}
//# sourceMappingURL=output.js.map