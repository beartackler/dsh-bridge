/**
 * /bridge-doctor - environment health check (docs/specs/commands/doctor.md).
 *
 * Scope of this phase: the always-on, read-only half of the spec. Four checks:
 *   C1' node runtime >= v20            (process.version, no subprocess)
 *   C6' credential files exist + shape (lib/paths metadata probes only)
 *   C3' DSH profile dirs present       ($DSH_HOME/profiles or ~/.dsh/profiles)
 *   C5' profile config discoverable    (active profile's cordis.patch.yml)
 *
 * Invariants carried over from the spec and CHARTER.md:
 *  - Read-only: nothing is written, mutated, or executed.
 *  - Metadata only: probes return existence/shape, never file contents, so no
 *    secret value can reach the rendered markdown or the data payload.
 *  - Every printed claim comes from a check that actually ran (trust over
 *    speed); unknown states degrade to yellow with the reason attached.
 *  - Network checks (C8/C9) are opt-in flags specified for a later phase and
 *    are intentionally absent here (ponytail discipline).
 *
 * Rendering uses the shared lib/output helpers; the status badges are plain
 * fixed-width ASCII text, mirroring badge() (color is never load-bearing).
 */
import type { BridgeContext, CommandResult, ProfileSource } from "../lib/types.js";
/** Doctor health vocabulary (doctor spec severity mapping, rendered as text). */
export type DoctorStatus = "green" | "yellow" | "red";
/** One executed check: evidence-backed, hint-carrying when not green. */
export interface DoctorCheck {
    /** Stable machine id, also the key of the `data` payload rows. */
    readonly id: string;
    readonly label: string;
    readonly status: DoctorStatus;
    /** Evidence line: versions, paths, and shape verdicts only. */
    readonly detail: string;
    /** Concrete fix command; present exactly when status is yellow or red. */
    readonly hint?: string;
}
/** Inputs collected once at the call boundary so checks stay pure over args. */
export interface DoctorInputs {
    readonly profile: string;
    /**
     * Provenance of `profile` (F5). `mount` and `config` are names the user or
     * the harness actually chose, so the profile checks may grade against them.
     * `fallback` is a placeholder nobody invoked: grading against it produced the
     * two spurious YELLOW rows in journey report 3.2, so those checks report the
     * profiles they can see and stay green instead.
     */
    readonly profileSource?: ProfileSource;
    readonly home: string;
    readonly dshHome: string;
    readonly profilePatch: string;
    /** e.g. `process.version`, "v22.14.0". Injected for testability. */
    readonly nodeVersion: string;
}
/** Node floor declared by this package's engines field and the harness docs. */
export declare const MIN_NODE_MAJOR = 20;
/** Run every doctor check. Order is the render order; ids are stable. */
export declare function collectDoctorChecks(inputs: DoctorInputs): readonly DoctorCheck[];
export interface DoctorSummary {
    readonly green: number;
    readonly yellow: number;
    readonly red: number;
    /** healthy = all green; degraded = yellows only; blocked = at least one red. */
    readonly overall: "healthy" | "degraded" | "blocked";
}
export declare function summarizeDoctorChecks(checks: readonly DoctorCheck[]): DoctorSummary;
/**
 * Render the report. The profile line names its own provenance, so a reader can
 * tell "the harness told us we are in `web`" from "nobody told us, this is a
 * placeholder" without reading the source (F5).
 */
export declare function renderDoctorReport(checks: readonly DoctorCheck[], profile: string, profileSource?: ProfileSource): string;
/** /bridge-doctor entry point; pure over (ctx, args), no global state. */
export declare function runDoctor(ctx: BridgeContext, _args: Readonly<Record<string, string>>): Promise<CommandResult>;
//# sourceMappingURL=doctor.d.ts.map