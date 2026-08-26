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
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Directory the bridge owns for its own state. Never a native DSH path. */
export declare function memoryDir(home: string): string;
/** The single bridge-managed memory file. */
export declare function memoryFilePath(home: string): string;
/** Template used whenever the memory file has to be created. */
export declare const MEMORY_TEMPLATE: string;
/** Short SHA-1 digest, matching the spec's file-identity display. */
export declare function shortDigest(content: string): string;
/** Create the memory file from template when absent. Returns true if created. */
export declare function ensureMemoryFile(home: string): boolean;
/** Read the memory file, or an empty string when it does not exist yet. */
export declare function readMemory(home: string): string;
export interface MemoryStatus {
    readonly path: string;
    readonly exists: boolean;
    readonly sizeBytes: number;
    readonly digest: string;
    readonly headings: readonly string[];
}
export declare function memoryStatus(home: string): MemoryStatus;
/** Every `## ` heading, in document order. Used by show and import dedup. */
export declare function sectionHeadings(content: string): readonly string[];
/**
 * Resolve the editor the way the spec orders it: $DSH_EDITOR, then $VISUAL,
 * then $EDITOR. The environment is a parameter so tests never mutate the
 * process; the command layer passes `process.env` at the call boundary.
 */
export declare function resolveEditor(env: Readonly<Record<string, string | undefined>>): string | null;
/** Dated heading used by `add` when no explicit heading is given. */
export declare function datedHeading(now: Date): string;
export interface AddOutcome {
    readonly written: boolean;
    readonly heading: string;
    readonly reason?: string;
}
/**
 * Append `note` under `headingText`, creating the file and the heading as
 * needed. An exact duplicate line anywhere under that heading is rejected
 * rather than appended (spec AC-4, idempotence guard).
 */
export declare function appendNote(home: string, note: string, headingText: string): AddOutcome;
/** Lines belonging to `headingText`, exclusive of the heading itself. */
export declare function sectionBody(content: string, headingText: string): readonly string[];
/** Sources the bridge knows how to read, in detection order. */
export declare const IMPORT_SOURCE_NAMES: readonly ["CLAUDE.md", "AGENTS.md"];
export interface ImportSource {
    readonly name: string;
    readonly path: string;
    readonly exists: boolean;
    readonly sizeBytes: number;
    /** `## ` sections found in the source; the unit of import. */
    readonly sections: readonly string[];
}
/**
 * Detect importable instruction files. Both the user home and the given
 * project directory are searched, so a Claude Code refugee is found wherever
 * they kept their file. Detection is metadata only; nothing is written.
 */
export declare function detectImportSources(home: string, projectDir: string): readonly ImportSource[];
/** Extract `## ` sections from a source file as heading/body pairs. */
export declare function extractSections(content: string): readonly {
    heading: string;
    body: string;
}[];
export interface ImportPlanRow {
    readonly source: string;
    readonly section: string;
    /** `import` = will be appended; `skip` = a heading of that name already exists. */
    readonly action: "import" | "skip";
}
export interface ImportOutcome {
    readonly rows: readonly ImportPlanRow[];
    readonly imported: number;
    readonly skipped: number;
}
/**
 * Copy every section from detected sources that the memory file does not
 * already have. Existing content is never rewritten: sections are appended,
 * and a name collision is a skip, so a second run imports nothing.
 */
export declare function importSections(home: string, sources: readonly ImportSource[]): ImportOutcome;
/** /bridge-memory entry point; pure over (ctx, args), no global state. */
export declare function runMemory(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=memory.d.ts.map