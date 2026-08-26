/**
 * /bridge-init - repo onboarding and instruction-file generation
 * (docs/specs/commands/init.md), MVP slice.
 *
 * Scope of this iteration:
 *  - Workspace scan via ctx fs (injected through InitIo; node-backed in the
 *    command runner, temp-dir doubles in tests): manifest detection
 *    (package.json, pyproject.toml, go.mod, Cargo.toml, lockfiles, CI files),
 *    bounded directory listing for the layout section.
 *  - AGENTS.md draft generated from the spec's fixed template order.
 *  - Coordinate-file awareness: an existing AGENTS.md is imported, never
 *    overwritten (spec table "Import, do not overwrite"); CLAUDE.md presence
 *    defaults to no action because dsh-agent-instructions already reads it
 *    (packages/context/agent-instructions/src/config.ts:12-13).
 *
 * Invariants: read-only scan; nothing executes; no secret file is ever read
 * (.env*, *.pem, *.key, id_*, .credentials*, *.p12 are skipped by name).
 * The draft is returned as markdown; writing happens only when --write is
 * passed and the target does not already exist.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Filesystem surface used by this module; injected for testability. */
export interface InitIo {
    exists(path: string): boolean;
    readFile(path: string): string;
    listDir(path: string): string[];
}
/** Node-backed io. */
export declare function nodeInitIo(): InitIo;
export interface DetectedCommand {
    readonly label: string;
    readonly command: string;
    /** File the fact came from; every claim names its source (charter rule). */
    readonly source: string;
}
export interface InitScan {
    readonly root: string;
    readonly packageManager?: string;
    readonly install?: DetectedCommand;
    readonly build?: DetectedCommand;
    readonly test?: DetectedCommand;
    readonly lint?: DetectedCommand;
    readonly typecheck?: DetectedCommand;
    readonly language: string;
    readonly topDirs: readonly string[];
    readonly existingAgentsFile: boolean;
    readonly existingClaudeFile: boolean;
    readonly notes: readonly string[];
}
export interface DetectedStack {
    readonly language: string;
    readonly packageManager?: string;
    readonly install?: DetectedCommand;
    readonly build?: DetectedCommand;
    readonly test?: DetectedCommand;
    readonly lint?: DetectedCommand;
    readonly typecheck?: DetectedCommand;
    readonly notes: string[];
}
/** Detect toolchain + commands from manifests at the project root. */
export declare function detectStack(io: InitIo, root: string): DetectedStack;
/** Top-level entries for the layout block, ignored dirs filtered out. */
export declare function layoutRows(io: InitIo, root: string): string[];
/** Render the AGENTS.md draft. Pure over the scan; ends in one newline. */
export declare function renderAgentsDraft(scan: InitScan, projectName: string): string;
/** /bridge-init entry point; pure over (ctx, args), all io via InitIo. */
export declare function runInit(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=init.d.ts.map