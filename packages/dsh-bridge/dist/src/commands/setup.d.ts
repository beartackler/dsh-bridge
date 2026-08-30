/**
 * /bridge-setup (alias /bridge-onboard) - conversational, resumable onboarding
 * (docs/specs/commands/setup.md).
 *
 * Shape of the flow: seven steps, one question maximum per step, a sensible
 * default on every question, and `skip` accepted everywhere. Progress is
 * persisted to `~/.dsh-bridge/setup-state.json` after every transition, so a
 * user can close the session mid-flow and resume exactly where they stopped.
 *
 * Assumes nothing. It does not assume the user has a model connected, has
 * used a harness before, has plugins installed, or knows what a route is.
 *
 * Invariants carried from CHARTER.md and the connect spec:
 *  - Detection is read-only and metadata-only; credential values never enter
 *    the transcript (connect S1/S3: only masked display strings are reused).
 *  - Two files this command may write, and no others: its own state file
 *    always, and the profile patch at the route step WHEN the user supplies
 *    `--url` and `--model` there. The route write is the one thing standing
 *    between "installed" and "answering a prompt"
 *    (docs/research/e2e-npx-journey.md:331), so this flow performs it rather
 *    than printing a command the user must find and re-type. It goes through
 *    `applyRoute`, which takes a `.bak` first, rolls back on failure, and
 *    re-reads the file to verify the rows landed.
 *  - The route write stores a credential REFERENCE NAME only. No key value is
 *    accepted by, passed through, or rendered by this command; a secret-shaped
 *    `--key-env` is refused before anything is written.
 *  - MCP imports and memory imports are still performed by their own commands,
 *    which this flow prints as ready-to-run lines rather than executing.
 *  - No network calls.
 */
import type { BridgeContext, CommandResult, DetectionRow } from "../lib/types.js";
import { type ApplyIo, type ApplyOutcome, type RoutePlan } from "./connect-apply.js";
import { type CatalogEntry } from "../lib/catalog-access.js";
/** The seven steps, in order. The index in this array is the progress number. */
export declare const SETUP_STEPS: readonly ["welcome", "harness", "route", "health", "import", "recommend", "done"];
export type StepId = (typeof SETUP_STEPS)[number];
/** 1-based position of a step, used for the "step N of 7" line. */
export declare function stepNumber(step: StepId): number;
/** The step after `step`; `done` is terminal and returns itself. */
export declare function nextStep(step: StepId): StepId;
/** Bumped when the on-disk shape changes; unknown versions restart cleanly. */
export declare const SETUP_STATE_VERSION = 1;
export interface SetupState {
    readonly version: number;
    /** The step awaiting an answer. `done` means the flow finished. */
    readonly step: StepId;
    /** Answers keyed by the step that asked, verbatim and lowercased. */
    readonly answers: Readonly<Record<string, string>>;
    /** Steps the user explicitly skipped, in the order they were skipped. */
    readonly skipped: readonly string[];
    readonly startedAt: string;
    readonly updatedAt: string;
}
/** State file location: `~/.dsh-bridge/setup-state.json`. */
export declare function setupStatePath(home: string): string;
/** Filesystem surface used by this module; injected so tests stay hermetic. */
export interface SetupIo {
    exists(path: string): boolean;
    readFile(path: string): string;
    writeFile(path: string, contents: string): void;
    listDir(path: string): string[];
}
export declare function nodeSetupIo(): SetupIo;
/**
 * Load persisted progress. A missing, unreadable, malformed, or
 * wrong-version file is not an error: onboarding simply starts over, because
 * a broken state file must never be the reason a first run fails.
 */
export declare function loadState(io: SetupIo, path: string, now?: Date): SetupState;
/** Persist state. Failures are swallowed: a read-only HOME still gets a flow. */
export declare function saveState(io: SetupIo, path: string, state: SetupState): boolean;
export interface HarnessFacts {
    /** DSH version string when the profile manifest names one. */
    readonly dshVersion: string | null;
    readonly profile: string;
    readonly profilePatchExists: boolean;
    /** Familiar harness config directories found in $HOME. */
    readonly familiar: readonly FamiliarHarness[];
}
export interface FamiliarHarness {
    readonly name: string;
    readonly path: string;
    /** What could be carried over from it. */
    readonly offers: readonly ("mcp" | "memory")[];
}
/** Detect familiar harness config directories: Claude Code, Codex, OpenCode. */
export declare function detectFamiliar(io: SetupIo, home: string): readonly FamiliarHarness[];
/** Read the DSH version from the profile manifest, if it records one. */
export declare function readDshVersion(io: SetupIo, profilePackageJson: string): string | null;
export declare function collectHarnessFacts(io: SetupIo, ctx: BridgeContext): HarnessFacts;
/** Providers whose credentials were actually found, in matrix order. */
export declare function connectedProviders(rows: readonly DetectionRow[]): readonly string[];
export interface HealthFinding {
    readonly label: string;
    readonly ok: boolean;
    readonly detail: string;
}
/** Three cheap, local plugin-health facts. No subprocess, no network. */
export declare function collectHealth(io: SetupIo, ctx: BridgeContext): readonly HealthFinding[];
export interface Recommendation {
    readonly name: string;
    readonly repo: string;
    readonly grade: string | null;
    readonly verdict: string;
    readonly install: string;
}
/** Options letting tests pin explicit catalog locations (no global state). */
export interface SetupOptions {
    readonly manifestPath?: string;
    readonly cardsDir?: string;
    readonly io?: SetupIo;
    /** Filesystem surface for the route write; injected so tests stay hermetic. */
    readonly applyIo?: ApplyIo;
    readonly now?: Date;
    readonly env?: Readonly<Record<string, string | undefined>>;
}
/**
 * Match 3-5 catalog plugins against what the user said they work on. Graded
 * entries sort first, because a recommendation without a review is weaker
 * evidence than one with a letter behind it.
 */
export declare function recommendPlugins(entries: readonly CatalogEntry[], grades: ReadonlyMap<string, string>, interest: string, limit?: number): readonly Recommendation[];
/** `skip` in any casing, plus the two words people type instead. */
export declare function isSkip(answer: string): boolean;
/** Parse the free-text answer out of the shared `_`/`rest` args convention. */
export declare function parseAnswer(args: Readonly<Record<string, string>>): string;
interface StepContext {
    readonly ctx: BridgeContext;
    readonly io: SetupIo;
    readonly state: SetupState;
    readonly harness: HarnessFacts;
    readonly options: SetupOptions;
}
/** Outcome of the route step's write attempt, rendered by `routeWrittenBody`. */
export interface RouteWriteResult {
    readonly plan: RoutePlan;
    readonly outcome: ApplyOutcome;
}
/**
 * True when the invocation at the route step carries a route to write rather
 * than an answer to record. Endpoint and model together are the signal: either
 * one alone cannot produce a loadable route.
 */
export declare function isRouteWrite(args: Readonly<Record<string, string>>): boolean;
/**
 * Perform the route write for the setup flow: plan, back up, write, re-read.
 * Returns the failure as a value rather than throwing, because a setup step
 * must always render a body.
 */
export declare function writeRouteFromArgs(ctx: BridgeContext, args: Readonly<Record<string, string>>, io: ApplyIo): RouteWriteResult | {
    readonly error: string;
};
/** What the route step renders after a write attempt: what changed, verified how. */
export declare function routeWrittenBody(step: StepContext, result: RouteWriteResult): string;
/**
 * Advance the state machine by at most one step. Pure over its inputs so the
 * transition table is testable without touching disk.
 *
 * A bare invocation (empty answer) re-renders the current step and takes its
 * default only when the step has already been shown once; the first sight of
 * a step never auto-answers it, so a user cannot skip past a question they
 * have not read.
 */
export declare function applyAnswer(state: SetupState, answer: string, now: Date): SetupState;
/**
 * /bridge-setup entry point. One invocation renders one step: an invocation
 * carrying an answer records it, advances, and renders the next step.
 */
export declare function runSetup(ctx: BridgeContext, args: Readonly<Record<string, string>>, options?: SetupOptions): Promise<CommandResult>;
export {};
//# sourceMappingURL=setup.d.ts.map