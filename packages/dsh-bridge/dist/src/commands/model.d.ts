/**
 * /bridge-model - route directory plus staged use/test flows
 * (docs/specs/commands/model.md, MVP slice).
 *
 * Delivered here:
 *   /bridge-model [list]        every configured route joined from the
 *                               registered set and the configurable directory,
 *                               one line each with availability reasons
 *   /bridge-model use <id>      emits the switch procedure; config mutation is
 *                               intentionally out of scope this iteration
 *   /bridge-model test <id>     emits the smoke-test procedure and cost notice
 *
 * Rules honored:
 *  - Listing does zero network I/O: availability derives from static facts the
 *    injected config carries (registration, declaration, credential-reference
 *    resolution status), never from probing (spec acceptance 4).
 *  - Reason strings echo at most the NAME of a credential reference; key
 *    material can never reach output because it never enters this module.
 *  - Nothing is mutated: `use` and `test` print instructions so a human (or a
 *    later phase) applies them deliberately.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Auth-kind vocabulary (model spec "Auth-kind vocabulary"). */
export type AuthKind = "api-key" | "ambient" | "oauth";
/** Availability reason vocabulary rendered next to unavailable routes. */
export type UnavailableReason = "no-credential" | "endpoint-unreachable" | "dormant-route";
/** One selectable route after the config join. */
export interface ModelRoute {
    /** `<provider>/<model>` identity users select by. */
    readonly id: string;
    readonly provider: string;
    readonly model: string;
    readonly authKind: AuthKind;
    readonly available: boolean;
    /** Specific reason when not plain "available"; null otherwise. */
    readonly reason: string | null;
    /** Adapter currently serves this route (`ctx.llm.listProviders()` half). */
    readonly registered: boolean;
    /** Route is declared in configuration but has no adapter yet. */
    readonly declared: boolean;
    /** Adapter advertises the model id; unlisted models stay servable. */
    readonly advertised?: boolean;
    /** Selectable reasoning-effort levels when the adapter supplies them. */
    readonly reasoning?: readonly string[];
    readonly contextWindow?: number;
}
/** One configured route entry handed in by the host or a test double. */
export interface ConfiguredRoute {
    readonly provider: string;
    readonly model: string;
    /** True when an adapter registered this route right now. Default true. */
    readonly registered?: boolean;
    /** True when the route exists in the configurable-provider directory. */
    readonly declared?: boolean;
    /** Credential shape: named env reference, oauth record, or ambient. */
    readonly authKind?: AuthKind;
    /** Env-var NAME carrying the API key reference; value never travels here. */
    readonly apiKeyEnv?: string;
    /** Whether the credential reference resolved at read time. Default true. */
    readonly credentialResolved?: boolean;
    /** Adapter advertises this model id. Default true. */
    readonly advertised?: boolean;
    readonly reasoning?: readonly string[];
    readonly contextWindow?: number;
}
/** Config the host injects; tests pass doubles. All fields optional-safe. */
export interface BridgeModelConfig {
    /** Composition/user-layer default when one is set. */
    readonly default?: {
        readonly provider: string;
        readonly model: string;
    };
    /** Session-scoped override; wins over `default` while present. */
    readonly sessionOverride?: {
        readonly provider: string;
        readonly model: string;
    } | null;
    readonly routes: readonly ConfiguredRoute[];
}
/**
 * Join registered and declared routes into the display list, deriving
 * availability from static facts only. Order follows the config: entries are
 * emitted in registration-then-declaration order as given.
 */
export declare function collectRoutes(config: BridgeModelConfig): ModelRoute[];
/** Resolve a `<provider>/<model>` or bare `<model>` token against routes. */
export declare function resolveRouteToken(routes: readonly ModelRoute[], token: string): {
    route: ModelRoute;
} | {
    error: string;
};
export declare function renderModelList(ctx: BridgeContext, routes: readonly ModelRoute[], config: BridgeModelConfig): string;
/** Instruction block for `use`; no settings document is touched here. */
export declare function renderUseInstructions(routeId: string, persist: boolean, reset: boolean): string;
/** Procedure block for `test`; performs no request itself. */
export declare function renderTestInstructions(routeId: string, available: boolean, reason: string | null): string;
export type ParsedModelArgs = {
    readonly verb: "list";
} | {
    readonly verb: "use";
    readonly target: string;
    readonly save: boolean;
    readonly reset: boolean;
} | {
    readonly verb: "test";
    readonly target: string;
};
/** Parse `_`/`rest` positionals plus flags into a routed verb. Throws on misuse. */
export declare function parseModelArgs(args: Readonly<Record<string, string>>): ParsedModelArgs;
/** Typed parse failure so callers can distinguish misuse from IO trouble. */
export declare class ModelCommandError extends Error {
}
/** Options for tests: pin an explicit config double instead of host wiring. */
export interface ModelOptions {
    readonly config?: BridgeModelConfig;
}
/** `/bridge-model` runner. Read-only; zero network calls by construction. */
export declare function runModel(ctx: BridgeContext, args: Readonly<Record<string, string>>, options?: ModelOptions): Promise<CommandResult>;
//# sourceMappingURL=model.d.ts.map