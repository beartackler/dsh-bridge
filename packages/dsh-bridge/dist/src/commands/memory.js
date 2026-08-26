/**
 * /bridge-memory - persistent instructions managed by the bridge
 * (docs/specs/commands/memory.md).
 *
 * MVP scope of this module, deliberately narrower than the full spec:
 *   show          render the bridge memory file with size, digest, preview
 *   edit          resolve the file (creating it from template) and hand the
 *                 path to the user's editor; never blocks a non-interactive host
 *   add <note>    append a note under a dated heading, atomically, duplicate-guarded
 *   import-from   detect CLAUDE.md / AGENTS.md sources and copy sections across
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - Every path derives from the injected `ctx.paths.home`; this module never
 *    reads `$HOME`, `process.env`, or any singleton of its own. Tests point a
 *    context at a tmpdir and the whole module follows.
 *  - Import never overwrites. An existing memory file is only ever appended to,
 *    and a section whose heading already exists is skipped, so re-running
 *    `import-from` on an imported tree is a no-op (spec AC-9, idempotence).
 *  - Writes are atomic (temp file + rename) so a concurrent reader never sees a
 *    truncated memory file (spec AC-4).
 *  - No network calls, no telemetry, no emoji.
 *
 * Deferred to a later wave (kept out per ponytail discipline): nested project
 * scopes, `--scope`/`--dir` selectors, merge/link import strategies, and the
 * `@path` inlining hygiene pass. Those need the multi-scope resolver the spec
 * describes; this wave owns the single bridge-managed file only.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bulletList, heading, table } from "../lib/output.js";
const USAGE = "Usage: /bridge-memory show | edit | add <note> | import-from [source]";
/** Directory the bridge owns for its own state. Never a native DSH path. */
export function memoryDir(home) {
    return join(home, ".dsh-bridge");
}
/** The single bridge-managed memory file. */
export function memoryFilePath(home) {
    return join(memoryDir(home), "memory.md");
}
/** Template used whenever the memory file has to be created. */
export const MEMORY_TEMPLATE = [
    "# Bridge memory",
    "",
    "<!-- Persistent instructions managed by /bridge-memory. -->",
    "<!-- Edit freely; the bridge only ever appends below existing content. -->",
    "",
].join("\n");
/** Preview length used by `show`, in lines. */
const PREVIEW_LINES = 10;
// ---------------------------------------------------------------------------
// File primitives
// ---------------------------------------------------------------------------
/** Short SHA-1 digest, matching the spec's file-identity display. */
export function shortDigest(content) {
    return createHash("sha1").update(content).digest("hex").slice(0, 12);
}
/**
 * Write `content` to `path` without ever exposing a partial file: the bytes
 * land in a sibling temp file first, then a single rename swaps it in.
 */
function writeAtomic(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, content, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, path);
}
/** Create the memory file from template when absent. Returns true if created. */
export function ensureMemoryFile(home) {
    const path = memoryFilePath(home);
    if (existsSync(path))
        return false;
    writeAtomic(path, MEMORY_TEMPLATE);
    return true;
}
/** Read the memory file, or an empty string when it does not exist yet. */
export function readMemory(home) {
    const path = memoryFilePath(home);
    if (!existsSync(path))
        return "";
    return readFileSync(path, "utf8");
}
export function memoryStatus(home) {
    const path = memoryFilePath(home);
    if (!existsSync(path)) {
        return { path, exists: false, sizeBytes: 0, digest: "", headings: [] };
    }
    const content = readFileSync(path, "utf8");
    return {
        path,
        exists: true,
        sizeBytes: statSync(path).size,
        digest: shortDigest(content),
        headings: sectionHeadings(content),
    };
}
/** Every `## ` heading, in document order. Used by show and import dedup. */
export function sectionHeadings(content) {
    return content
        .split(/\r?\n/)
        .filter((line) => line.startsWith("## "))
        .map((line) => line.slice(3).trim());
}
function renderShow(home) {
    const status = memoryStatus(home);
    if (!status.exists) {
        return [
            heading("/bridge-memory show"),
            "No memory file yet.",
            "",
            bulletList([
                `It will be created at ${status.path}`,
                "Start one with: /bridge-memory add <note>",
                "Or import existing instructions: /bridge-memory import-from",
            ]),
        ].join("\n");
    }
    const content = readFileSync(status.path, "utf8");
    const preview = content.split(/\r?\n/).slice(0, PREVIEW_LINES);
    return [
        heading("/bridge-memory show"),
        table(["FIELD", "VALUE"], [
            ["path", status.path],
            ["size", `${status.sizeBytes} bytes`],
            ["digest", status.digest],
            ["sections", status.headings.length === 0 ? "none" : status.headings.join(", ")],
        ]),
        `Preview (first ${PREVIEW_LINES} lines):`,
        "",
        "```",
        ...preview,
        "```",
        "",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------
/**
 * Resolve the editor the way the spec orders it: $DSH_EDITOR, then $VISUAL,
 * then $EDITOR. The environment is a parameter so tests never mutate the
 * process; the command layer passes `process.env` at the call boundary.
 */
export function resolveEditor(env) {
    for (const key of ["DSH_EDITOR", "VISUAL", "EDITOR"]) {
        const value = env[key];
        if (typeof value === "string" && value.trim() !== "")
            return value.trim();
    }
    return null;
}
function renderEdit(home, env) {
    const created = ensureMemoryFile(home);
    const path = memoryFilePath(home);
    const editor = resolveEditor(env);
    const lines = [heading("/bridge-memory edit"), `File: ${path}`];
    if (created)
        lines.push("Created from template (owner-only permissions).");
    lines.push("");
    if (editor === null) {
        lines.push("No editor configured. Set $DSH_EDITOR, $VISUAL, or $EDITOR, then open:");
        lines.push("");
        lines.push("```");
        lines.push(`$EDITOR ${path}`);
        lines.push("```");
    }
    else {
        lines.push(`Open it with your configured editor (${editor}):`);
        lines.push("");
        lines.push("```");
        lines.push(`${editor} ${path}`);
        lines.push("```");
    }
    lines.push("");
    lines.push("Edits apply to the next session; nothing needs restarting.");
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------
/** Dated heading used by `add` when no explicit heading is given. */
export function datedHeading(now) {
    return `Notes ${now.toISOString().slice(0, 10)}`;
}
/**
 * Append `note` under `headingText`, creating the file and the heading as
 * needed. An exact duplicate line anywhere under that heading is rejected
 * rather than appended (spec AC-4, idempotence guard).
 */
export function appendNote(home, note, headingText) {
    const trimmed = note.trim();
    if (trimmed === "") {
        return { written: false, heading: headingText, reason: "empty note" };
    }
    ensureMemoryFile(home);
    const path = memoryFilePath(home);
    const content = readFileSync(path, "utf8");
    const line = `- ${trimmed}`;
    if (sectionBody(content, headingText).includes(line)) {
        return { written: false, heading: headingText, reason: "duplicate line already present" };
    }
    const next = hasHeading(content, headingText)
        ? insertUnderHeading(content, headingText, line)
        : `${content.replace(/\s*$/, "")}\n\n## ${headingText}\n\n${line}\n`;
    writeAtomic(path, next);
    return { written: true, heading: headingText };
}
function hasHeading(content, headingText) {
    return sectionHeadings(content).includes(headingText);
}
/** Lines belonging to `headingText`, exclusive of the heading itself. */
export function sectionBody(content, headingText) {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `## ${headingText}`);
    if (start === -1)
        return [];
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith("## "));
    return end === -1 ? rest : rest.slice(0, end);
}
function insertUnderHeading(content, headingText, line) {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((entry) => entry.trim() === `## ${headingText}`);
    const rest = lines.slice(start + 1);
    const relativeEnd = rest.findIndex((entry) => entry.startsWith("## "));
    const insertAt = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
    // Step back over trailing blank lines so the note joins the section body
    // rather than the gap before the next heading.
    let cursor = insertAt;
    while (cursor > start + 1 && (lines[cursor - 1] ?? "").trim() === "")
        cursor -= 1;
    return [...lines.slice(0, cursor), line, ...lines.slice(cursor)].join("\n");
}
// ---------------------------------------------------------------------------
// import-from
// ---------------------------------------------------------------------------
/** Sources the bridge knows how to read, in detection order. */
export const IMPORT_SOURCE_NAMES = ["CLAUDE.md", "AGENTS.md"];
/**
 * Detect importable instruction files. Both the user home and the given
 * project directory are searched, so a Claude Code refugee is found wherever
 * they kept their file. Detection is metadata only; nothing is written.
 */
export function detectImportSources(home, projectDir) {
    const candidates = [
        ...IMPORT_SOURCE_NAMES.map((name) => [`~/.claude/${name}`, join(home, ".claude", name)]),
        ...IMPORT_SOURCE_NAMES.map((name) => [`./${name}`, join(projectDir, name)]),
    ];
    return candidates.map(([name, path]) => {
        if (!existsSync(path)) {
            return { name, path, exists: false, sizeBytes: 0, sections: [] };
        }
        const content = readFileSync(path, "utf8");
        return {
            name,
            path,
            exists: true,
            sizeBytes: Buffer.byteLength(content, "utf8"),
            sections: sectionHeadings(content),
        };
    });
}
/** Extract `## ` sections from a source file as heading/body pairs. */
export function extractSections(content) {
    const lines = content.split(/\r?\n/);
    const out = [];
    let current = null;
    for (const line of lines) {
        if (line.startsWith("## ")) {
            if (current !== null)
                out.push({ heading: current.heading, body: current.body.join("\n").trim() });
            current = { heading: line.slice(3).trim(), body: [] };
        }
        else if (current !== null) {
            current.body.push(line);
        }
    }
    if (current !== null)
        out.push({ heading: current.heading, body: current.body.join("\n").trim() });
    return out;
}
/**
 * Copy every section from detected sources that the memory file does not
 * already have. Existing content is never rewritten: sections are appended,
 * and a name collision is a skip, so a second run imports nothing.
 */
export function importSections(home, sources) {
    const rows = [];
    const present = new Set(sectionHeadings(readMemory(home)));
    const additions = [];
    for (const source of sources) {
        if (!source.exists)
            continue;
        for (const section of extractSections(readFileSync(source.path, "utf8"))) {
            if (present.has(section.heading)) {
                rows.push({ source: source.name, section: section.heading, action: "skip" });
                continue;
            }
            present.add(section.heading);
            rows.push({ source: source.name, section: section.heading, action: "import" });
            additions.push(`## ${section.heading}\n\n${section.body}`.trimEnd());
        }
    }
    if (additions.length > 0) {
        ensureMemoryFile(home);
        const path = memoryFilePath(home);
        const existing = readFileSync(path, "utf8").replace(/\s*$/, "");
        writeAtomic(path, `${existing}\n\n${additions.join("\n\n")}\n`);
    }
    const imported = rows.filter((row) => row.action === "import").length;
    return { rows, imported, skipped: rows.length - imported };
}
function renderImport(home, projectDir) {
    const sources = detectImportSources(home, projectDir);
    const found = sources.filter((source) => source.exists);
    const parts = [heading("/bridge-memory import-from")];
    parts.push(table(["SOURCE", "PATH", "STATUS"], sources.map((source) => [
        source.name,
        source.path,
        source.exists ? `${source.sizeBytes} bytes, ${source.sections.length} sections` : "not found",
    ])));
    if (found.length === 0) {
        parts.push("Nothing to import: no CLAUDE.md or AGENTS.md found.");
        return parts.join("\n");
    }
    const outcome = importSections(home, sources);
    if (outcome.rows.length > 0) {
        parts.push(table(["SOURCE", "SECTION", "ACTION"], outcome.rows.map((row) => [row.source, row.section, row.action])));
    }
    parts.push(`Imported ${outcome.imported} section(s), skipped ${outcome.skipped} already present.`);
    parts.push("Source files were not modified or deleted.");
    return parts.join("\n");
}
// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------
/** /bridge-memory entry point; pure over (ctx, args), no global state. */
export async function runMemory(ctx, args) {
    const home = ctx.paths.home;
    const sub = (args["_"] ?? "").trim();
    const rest = (args["rest"] ?? "").trim();
    switch (sub) {
        case "":
        case "show":
            return { markdown: renderShow(home), data: memoryStatus(home) };
        case "edit":
            return { markdown: renderEdit(home, process.env), data: { path: memoryFilePath(home) } };
        case "add": {
            if (rest === "") {
                return { markdown: [heading("/bridge-memory add"), USAGE, ""].join("\n") };
            }
            const headingText = (args["heading"] ?? "").trim() || datedHeading(new Date());
            const outcome = appendNote(home, rest, headingText);
            const body = outcome.written
                ? `Added under "## ${outcome.heading}" in ${memoryFilePath(home)}.`
                : `Nothing written: ${outcome.reason}.`;
            return { markdown: [heading("/bridge-memory add"), body, ""].join("\n"), data: outcome };
        }
        case "import-from":
            return { markdown: renderImport(home, rest === "" ? process.cwd() : rest) };
        default:
            return {
                markdown: [heading("/bridge-memory"), `Unknown subcommand: ${sub}`, "", USAGE, ""].join("\n"),
            };
    }
}
//# sourceMappingURL=memory.js.map