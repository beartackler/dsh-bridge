/**
 * /connect, phase 1: detection + report (docs/specs/commands/connect.md).
 *
 * Scope of this phase:
 *  - Scan the detection matrix (spec section 4): agent OAuth/key files, the
 *    environment, the OpenCode auth map, and the DSH dotenv file. Render the
 *    status table in the spec 6.1 shape. No writes, no network during
 *    detection; interactive route configuration ships in a later phase.
 *  - `/connect test <provider>`: a reachability smoke. One HEAD request to
 *    the provider's documented base URL with no Authorization header, so
 *    phase 1 never transmits credential material anywhere (S1/S4/S5).
 *    Offline machines get a plain "unreachable" verdict, never a stack trace.
 *  - Next-step guidance per provider: which env var to export and which DSH
 *    profile file to open. Guidance is static text, derived from no secret.
 *
 * Security invariants honored here (spec section 7):
 *  - S1: only masked display strings ever reach `markdown`/`data`; the mask
 *    never discloses more than the first 4 and last 4 characters, and
 *    anything under 12 characters renders as an ellipsis alone.
 *  - S3: sources are opened read-only; nothing is written or chmod'd.
 *  - S12: symlinks are refused by paths.ts, never followed.
 *  - S13: reads are capped; oversized files report without being parsed.
 */
import type { BridgeCommand } from "../lib/registry.js";
import type { BridgeContext, CommandResult, DetectionRow } from "../lib/types.js";
/**
 * Per-provider connector facts: the base URL the smoke test pings, the env
 * var a route reads through `!!js process.env.X`, and the vendor CLI that
 * refreshes an expired OAuth token. Static data; no secret informs it.
 */
export interface ProviderProfile {
    /** Base URL for the unauthenticated HEAD smoke (spec section 5, Smoke). */
    readonly baseUrl: string;
    /** Env var a generated route references. Never the value, only the name. */
    readonly envVar: string;
    /** Vendor command that re-issues an expired OAuth token (spec section 4). */
    readonly relogin?: string;
}
export declare const PROVIDER_PROFILES: Readonly<Record<string, ProviderProfile>>;
/** Providers accepted by `/connect test <provider>`, in display order. */
export declare const SMOKE_PROVIDERS: readonly string[];
/**
 * Copy for an `expired` row (spec section 4: expired is never selectable, and
 * the row carries the vendor re-login hint instead of an error).
 */
export declare function expiredAdvice(provider: string): string;
/**
 * Scan every documented source. No network, no writes; rows carry masked
 * display strings only. `env` is injected so tests run hermetically.
 */
export declare function detectCredentials(ctx: BridgeContext, env?: Readonly<Record<string, string | undefined>>): readonly DetectionRow[];
/**
 * What the user should do next for one provider: which env var to export and
 * which DSH profile file to open. Derived from the provider table and the
 * matrix statuses only, so no secret can influence, or leak into, the text.
 */
export declare function nextSteps(ctx: BridgeContext, provider: string, rows: readonly DetectionRow[]): readonly string[];
/** Guidance for every provider that currently has no usable credential. */
export declare function unmetProviders(rows: readonly DetectionRow[]): readonly string[];
export declare function renderMatrix(ctx: BridgeContext, rows: readonly DetectionRow[]): string;
/**
 * Minimal fetch seam. `globalThis.fetch` satisfies it; tests inject a double
 * so no suite ever touches the network.
 */
export type FetchLike = (url: string, init: {
    method: string;
    signal: AbortSignal;
}) => Promise<{
    status: number;
}>;
export interface SmokeOutcome {
    /** True when the endpoint answered at all. 401/403 still prove reachability. */
    readonly ok: boolean;
    readonly target: string;
    /** HTTP status when one arrived; absent when the request never completed. */
    readonly status?: number;
    readonly detail: string;
}
export interface SmokeOptions {
    readonly timeoutMs?: number;
    /** Test seam: substitute the HTTP client. Defaults to global fetch. */
    readonly fetchImpl?: FetchLike;
}
/**
 * HEAD the provider base URL with no Authorization header, so the request
 * carries nothing secret by construction. Any HTTP answer (including 401)
 * counts as reachable: the point is that the endpoint is routable from here.
 * Offline machines resolve to a plain unreachable verdict, never a throw.
 */
export declare function smokeProvider(provider: string, options?: SmokeOptions): Promise<SmokeOutcome>;
export declare function renderSmoke(ctx: BridgeContext, provider: string, outcome: SmokeOutcome): string;
/** Parse `/connect ...` args (shared `_`/`rest` convention) into an invocation. */
export interface ConnectInvocation {
    readonly mode: "list" | "test" | "apply";
    readonly provider?: string;
    /** Explicit consent for the `apply` write (`--apply`). */
    readonly confirmed?: boolean;
}
export declare function parseConnectArgs(args: Readonly<Record<string, string>>): ConnectInvocation;
/** Phase-1 runner: detection matrix by default; `test <provider>` for the smoke. */
export declare function runConnect(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult>;
/** Registry descriptor. Mounted over the registry stub via MOUNT(connect). */
export declare const connectCommand: BridgeCommand;
//# sourceMappingURL=connect.d.ts.map