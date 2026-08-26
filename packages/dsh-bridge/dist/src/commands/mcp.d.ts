/**
 * /bridge-mcp - MCP server management (docs/specs/commands/mcp.md).
 *
 * MVP slice, per the task contract (docs/reviews/eng-quality-review.md #1):
 *  - list / add / remove / test / import-from subcommands over the
 *    bridge-owned JSON store at `$HOME/.dsh-bridge/mcp.json` (same precedent
 *    as memory.ts; the shape mirrors the plugin instance list documented in
 *    packages/mcp/mcp-client/README.md).
 *  - add / remove write ONLY the bridge store. DSH reads MCP servers from the
 *    user's profile patch (cordis.patch.yml); when a native registration is
 *    still needed, the exact YAML fragment is emitted as a copy-paste block
 *    with paste instructions. The user's patch file is never opened for
 *    writing by this module.
 *  - Old MCP entries inside the profile patch are detected read-only and
 *    reported with move instructions (migration notice on list/add/remove).
 *  - import-from claude reads ~/.claude.json `mcpServers` (plus
 *    projects.<cwd>.mcpServers): existence + parse checks only; conversion is
 *    reported as a mapping table, nothing is written to source configs.
 *  - test emits the spec's handshake checklist (phases 0-5) as guidance;
 *    no process spawn or network call happens in this iteration.
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - Never echo secret values; env/header values are redacted to
 *    {"$env":"NAME"} in JSON and masked in rendered tables.
 *  - Mutating commands print the absolute store path before writing
 *    (acceptance 34) and honor --dry-run (nothing written).
 *  - Every DSH-behavior claim cites the reference checkout (acceptance 35).
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** The two transports DSH supports (mcp-client/src/index.ts:107-121). */
export declare const TRANSPORTS: readonly ["stdio", "streamable-http"];
export type Transport = (typeof TRANSPORTS)[number];
/** Default toolCallTimeoutMs (reference checkout mcp-client/src/index.ts:34). */
export declare const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
/**
 * One configured MCP server: the fields this command reads. Extra fields are
 * preserved verbatim on read/write; only these render into tables.
 */
export interface McpServerEntry {
    readonly id: string;
    readonly name: "@deepseek-ai/dsh-mcp-client";
    readonly config: McpServerConfig;
}
/** Config block of one instance (subset of the dsh-mcp-client schema). */
export interface McpServerConfig {
    readonly serverName: string;
    readonly transport: Transport;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, unknown>>;
    readonly cwd?: string;
    readonly url?: string;
    readonly headers?: Readonly<Record<string, unknown>>;
    readonly toolCallTimeoutMs?: number;
    readonly failOnStartupError?: boolean;
}
/** Typed failure surfaced as an error result by the registry runner. */
export declare class McpError extends Error {
}
/** Filesystem surface used by this module; injected so tests can double it. */
export interface McpIo {
    exists(path: string): boolean;
    readFile(path: string): string;
    writeFile(path: string, content: string): void;
}
/** Node-backed io; the only place real fs calls happen in this module. */
export declare function nodeMcpIo(): McpIo;
/** Directory the bridge owns for MCP state. Never a native DSH path. */
export declare function mcpStoreDir(home: string): string;
/** The single bridge-managed MCP store file. */
export declare function mcpStorePath(home: string): string;
/** Read instances out of the bridge store. Absent file means empty config. */
export declare function loadInstances(io: McpIo, storePath: string): McpServerEntry[];
/** Validate against the parts of the dsh-mcp-client schema this file knows. */
export declare function validateInstance(entry: McpServerEntry): string | null;
/** Claude object key -> legal DSH serverName (spec mapping table). */
export declare function normalizeServerName(rawKey: string, taken: ReadonlySet<string>): {
    name: string;
    renamed: boolean;
};
/** True when a string looks like a live credential (spec add-validation 5). */
export declare function secretShaped(value: unknown): boolean;
/** Redacted copy of an instance's config for display payloads. */
export declare function redactConfig(config: McpServerConfig): Record<string, unknown>;
/** One MCP-shaped instance found in the user's profile patch (read-only). */
export interface PatchMcpEntry {
    readonly serverName: string;
    /** Index within the patch document's top-level array, for user guidance. */
    readonly index: number;
}
/** Result of scanning the profile patch for legacy MCP entries. */
export interface PatchMigration {
    readonly patchPath: string;
    readonly entries: readonly PatchMcpEntry[];
    readonly error?: string;
}
/**
 * Detect MCP server instances inside the user's cordis.patch.yml without ever
 * writing to it. The patch is a YAML document; this scan is deliberately
 * line-based so no YAML parser dependency enters the bridge. A list item is
 * reported when it carries the mcp-client name or a serverName field. Parse
 * trouble degrades to an honest note rather than an exception.
 */
export declare function detectPatchEntries(io: McpIo, patchPath: string): PatchMigration;
/** Phases of /mcp test (docs/specs/commands/mcp.md, Test protocol). */
export interface HandshakePhase {
    readonly phase: string;
    readonly action: string;
    readonly passCondition: string;
}
/** The checklist emitted by /bridge-mcp test in this iteration. */
export declare function handshakeChecklist(): readonly HandshakePhase[];
/** One converted-or-skipped row of the import plan. */
export interface ImportRow {
    readonly sourceName: string;
    readonly decision: "import" | "skip" | "conflict";
    readonly reason: string;
}
export interface ImportPlan {
    readonly rows: readonly ImportRow[];
    readonly notCarriedOver: readonly string[];
    /** Absolute source paths probed, with existence verdicts. */
    readonly sourcesProbed: readonly (readonly [path: string, exists: boolean])[];
    readonly error?: string;
}
/**
 * Parse the first readable Claude config into named server records.
 * Existence + parse only; values are never echoed.
 */
export declare function readClaudeServers(io: McpIo, home: string, cwd: string): {
    plan: ImportPlan;
    servers: Map<string, Record<string, unknown>>;
};
/** Build the import plan (no writes anywhere, including the target). */
export declare function planClaudeImport(servers: ReadonlyMap<string, Record<string, unknown>>, existing: readonly McpServerEntry[]): ImportPlan;
/** /bridge-mcp entry point; pure over (ctx, args), all io via McpIo. */
export declare function runMcp(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=mcp.d.ts.map