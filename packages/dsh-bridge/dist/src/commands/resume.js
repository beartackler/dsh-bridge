/**
 * /bridge-resume - recent-session listing with fork-vs-resume semantics
 * (docs/specs/commands/resume.md).
 *
 * The DSH host owns session storage and retrieval (`ctx.sessionQuery`); this
 * module is the UX layer the spec calls a "thin wrapper, not a passthrough":
 * it scopes to the working directory, hides subagent noise, renders the row
 * model, and spells out what Resume and Fork each do before either is chosen.
 *
 * The listing is non-interactive in this wave. A slash command result is a
 * rendered body, not a modal, so `/bridge-resume` prints the numbered rows plus
 * the exact follow-up commands. The keyboard picker in the spec needs a UI
 * surface the bridge does not own yet; inventing one here would be speculative
 * (CHARTER: ponytail discipline).
 *
 * Capability probing, not assumption: `sessionQuery` is an optional structural
 * interface, feature-detected at call time. Without it the command renders
 * guidance instead of claiming there are no sessions - a missing seam and an
 * empty corpus are different facts and are never conflated.
 *
 * Browsing is a zero-token, read-only act: nothing here writes to a session
 * log, resumes, or forks. Both mutations are user-confirmed follow-ups.
 */
import { bulletList, heading, table } from "../lib/output.js";
const USAGE = "Usage: /bridge-resume [--all] [--subagents] [<text>]";
/** Page size, matching the SQLite backend's own default limit. */
export const PAGE_SIZE = 20;
/** Preview excerpt bound in code points, matching the backend snippet bound. */
export const EXCERPT_LIMIT = 240;
export function sessionQueryHooks(ctx) {
    return ctx.sessionQuery ?? {};
}
export function parseResumeFilters(args, cwd) {
    const positional = (args["_"] ?? "").trim();
    const rest = (args["rest"] ?? "").trim();
    return {
        all: "all" in args,
        subagents: "subagents" in args,
        text: [positional, rest].filter((part) => part !== "").join(" "),
        cwd,
    };
}
/**
 * Apply the documented scoping rules. Ordering is never changed: the host
 * guarantees newest-first and the spec forbids re-sorting client-side.
 */
export function filterRows(rows, filters) {
    const needle = filters.text.toLowerCase();
    return rows.filter((row) => {
        if (!filters.subagents && row.origin === "subagent")
            return false;
        if (!filters.all && row.cwd !== undefined && row.cwd !== filters.cwd)
            return false;
        if (needle === "")
            return true;
        const haystack = `${row.title ?? ""} ${row.excerpt ?? ""}`.toLowerCase();
        return haystack.includes(needle);
    });
}
/** Relative time in the picker's vocabulary; absolute detail lives in preview. */
export function relativeTime(timestamp, now) {
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 60)
        return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1)
        return "yesterday";
    return `${days}d ago`;
}
/** Availability badge, text only; color is never load-bearing. */
export function availability(row) {
    if (row.unavailable === true)
        return "unavailable";
    if (row.live)
        return "live";
    if (row.persisted)
        return "archived";
    return "unknown";
}
export function truncateExcerpt(text) {
    const points = [...text];
    return points.length <= EXCERPT_LIMIT ? text : `${points.slice(0, EXCERPT_LIMIT).join("")}...`;
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/** Fork-vs-resume framing printed with every listing (resume spec §5). */
export function semanticsBlock() {
    return [
        "Resume vs fork:",
        "",
        bulletList([
            "resume - the same session id becomes live again; its stored history continues verbatim",
            "fork - a new child session copies history up to the last finished turn; the original is untouched",
        ]),
    ].join("\n");
}
export function renderRows(rows, filters, now) {
    const page = rows.slice(0, PAGE_SIZE);
    const body = page.map((row, index) => [
        String(index + 1),
        relativeTime(row.lastActivity ?? row.createdAt, now),
        row.title ?? "Untitled session",
        `${row.messageCount} msgs`,
        availability(row),
        row.parentId === undefined ? "" : `forked from ${row.parentId}`,
    ]);
    const parts = [
        heading("/bridge-resume"),
        `${filters.all ? "All directories" : filters.cwd} - ${rows.length} session(s)`,
        "",
        table(["#", "WHEN", "TITLE", "MESSAGES", "STATE", "LINEAGE"], body),
    ];
    if (rows.length > page.length) {
        parts.push(`Showing 1-${page.length} of ${rows.length}.`);
        parts.push("");
    }
    if (!filters.all) {
        parts.push("Sessions from other directories are hidden (/bridge-resume --all to see).");
        parts.push("");
    }
    parts.push(semanticsBlock());
    parts.push("Continue one with `/bridge-resume <session-id>`, or fork it with `f` in the native picker.");
    return parts.join("\n");
}
export function renderEmpty(filters) {
    return [
        heading("/bridge-resume"),
        filters.all
            ? "No sessions recorded yet."
            : `No sessions in ${filters.cwd} yet. Run something first, or /bridge-resume --all.`,
        "",
        semanticsBlock(),
    ].join("\n");
}
/**
 * Guidance when the host exposes no session-query seam. States plainly that
 * the bridge could not read the corpus, rather than reporting zero sessions.
 */
export function renderNoSeam() {
    return [
        heading("/bridge-resume"),
        "This host did not expose a session query seam to the bridge, so no session list could be read.",
        "This is not the same as having no sessions.",
        "",
        "What still works today:",
        "",
        bulletList([
            "list sessions with the harness CLI, then start the one you want",
            "a session-persistence backend must be mounted for any cold session to be resumable",
        ]),
        semanticsBlock(),
        USAGE,
        "",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------
/** /bridge-resume entry point; pure over (ctx, args), no global state. */
export async function runResume(ctx, args) {
    const hooks = sessionQueryHooks(ctx);
    const cwd = ctx.cwd ?? process.cwd();
    const filters = parseResumeFilters(args, cwd);
    if (hooks.listSessions === undefined) {
        return { markdown: renderNoSeam(), data: { seam: "absent" } };
    }
    const all = await hooks.listSessions();
    const rows = filterRows(all, filters);
    const now = Date.now();
    const parts = [rows.length === 0 ? renderEmpty(filters) : renderRows(rows, filters, now)];
    if (hooks.persistenceMounted === false) {
        parts.push("");
        parts.push("Resume from history needs a session-persistence backend; only live sessions are listed.");
    }
    return {
        markdown: parts.join("\n"),
        data: {
            seam: "present",
            total: all.length,
            shown: Math.min(rows.length, PAGE_SIZE),
            rows: rows.slice(0, PAGE_SIZE).map((row) => ({
                id: row.id,
                title: row.title ?? "Untitled session",
                createdAt: row.createdAt,
                lastActivity: row.lastActivity,
                messageCount: row.messageCount,
                availability: availability(row),
                parentId: row.parentId,
            })),
        },
    };
}
//# sourceMappingURL=resume.js.map