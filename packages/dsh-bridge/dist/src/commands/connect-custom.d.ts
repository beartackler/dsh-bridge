/**
 * /bridge-connect custom - express an arbitrary OpenAI-compatible endpoint as
 * a complete DSH model route.
 *
 * Why this module exists. `planRoute` (connect-apply.ts) can only emit rows for
 * the five providers hardcoded in `PROVIDER_PROFILES` (connect.ts:76-94), and
 * even for those it emits `apiKeyEnv` and `baseURL` only. An endpoint pi-ai
 * does not already ship needs strictly more than that, and needs a second row
 * besides. A stranger therefore could not connect a model at all
 * (docs/research/e2e-npx-journey.md:331, hard decision 8).
 *
 * The format, from ground truth. Three sources agree, and this module renders
 * exactly what they describe:
 *
 *  1. The adapter's own schema. `PiAiProviderProfile` documents `apiKeyEnv` as
 *     a "Credential reference (environment-variable name) resolved per request
 *     through `ctx.credentials`", `api` as the wire protocol where "a route the
 *     catalog does not ship must name one", `baseURL` as the endpoint, and
 *     `models` as the route's catalog
 *     (~/.dsh-bridge/runtime/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/types/config.d.ts:53-73).
 *     The `providers` dict key IS the route (same file, line 52).
 *  2. The only worked example upstream ships, the `acme-gateway` block in the
 *     adapter module doc: `displayName`, `apiKeyEnv`, `api: openai-completions`,
 *     `baseURL`, then `models` with `id`, `name`, `contextWindow`, `maxTokens`
 *     (.../dsh-llm-pi-ai/lib/types/index.d.ts:30-46).
 *  3. The companion row. Declaring a provider does not select it; the selection
 *     is a separate `agent-default-model` row carrying `provider` and `model`
 *     (.../dsh-agent-default-model/lib/types/index.d.ts:19-22, and
 *     docs/getting-started.md:148). The verified working block is
 *     docs/getting-started.md:103-132 and docs/research/e2e-onboarding-journey.md:70-88.
 *
 * The two capacity defaults are the adapter's own: `DEFAULT_CONTEXT_WINDOW`
 * 262144 and `DEFAULT_MAX_TOKENS` 32768 (config.d.ts:36-38), so an unspecified
 * capacity renders the same number the adapter would have assumed.
 *
 * Secret safety, absolutely. This module takes an env-var NAME and never a key
 * value. `assertNotSecret` refuses any name that is secret-shaped, so a user
 * who pastes the key where the variable name belongs is stopped before the
 * value can reach a file or the transcript. There is no code path from a
 * credential value to rendered output here.
 */
import type { RoutePlan } from "./connect-apply.js";
/** Adapter's own assumed capacity when nothing sizes the model (config.d.ts:36). */
export declare const DEFAULT_CONTEXT_WINDOW = 262144;
/** Adapter's own assumed output cap when nothing sizes the model (config.d.ts:38). */
export declare const DEFAULT_MAX_TOKENS = 32768;
/** Everything one custom route needs, all of it non-secret. */
export interface CustomRouteRequest {
    /** Route key: the `providers` dict key and the value repeated in the selection row. */
    readonly route: string;
    /** Endpoint base, e.g. `https://opencode.ai/zen/go/v1`. */
    readonly baseUrl: string;
    /** Provider-owned model id. */
    readonly model: string;
    /** Human label for the route; defaults to the route key. */
    readonly displayName?: string;
    /** Human label for the model; defaults to the model id. */
    readonly modelName?: string;
    /** Credential reference NAME. Never a value. Defaults from the route key. */
    readonly apiKeyEnv?: string;
    /** Wire protocol. Defaults to `openai-completions`. */
    readonly api?: string;
    readonly contextWindow?: number;
    readonly maxTokens?: number;
}
/** Wire protocol assumed for an OpenAI-compatible endpoint (config.d.ts:59-63). */
export declare const DEFAULT_API = "openai-completions";
/**
 * Refuse a secret-shaped credential name. This is the invariant boundary: a
 * value that fails here never reaches a plan, a file, or the transcript, and
 * the thrown message quotes nothing back.
 */
export declare function assertNotSecret(apiKeyEnv: string): void;
/** Derive a default route key from the endpoint host, e.g. `opencode.ai` -> `opencode`. */
export declare function routeKeyFromUrl(baseUrl: string): string;
/** Default credential reference name for a route: `OPENCODE_ZEN_API_KEY` from `opencode-zen`. */
export declare function defaultKeyEnv(route: string): string;
/** A request with every default filled in and every field validated. */
export interface ResolvedCustomRoute extends Required<Omit<CustomRouteRequest, "api">> {
    readonly api: string;
}
/**
 * Validate and complete a request. Throws with an actionable message rather
 * than emitting a route that would fail silently inside the harness, which is
 * the failure mode the journey documents (docs/getting-started.md:145-155).
 */
export declare function resolveCustomRoute(request: CustomRouteRequest): ResolvedCustomRoute;
/**
 * Render the two patch rows, in the exact shape and order of the block
 * verified against a live endpoint (docs/getting-started.md:103-132).
 * One YAML line per element, no trailing newline.
 */
export declare function renderCustomRouteLines(route: ResolvedCustomRoute): readonly string[];
/** The rendered block as one string, which is what a test compares byte-for-byte. */
export declare function renderCustomRouteYaml(route: ResolvedCustomRoute): string;
/**
 * Adapt a custom route to the `RoutePlan` shape `applyRoute` already handles,
 * so the backup, rollback, sequence check, and post-write verification are the
 * ones already pinned by tests rather than a second implementation.
 */
export declare function planCustomRoute(request: CustomRouteRequest): RoutePlan;
/**
 * The exact command that re-runs this plan with consent. Every resolved field
 * is spelled out so a user can read, edit, and re-run it, and so the preview's
 * confirmation line is never a lossy summary of what was previewed.
 */
export declare function customApplyCommand(route: ResolvedCustomRoute): string;
//# sourceMappingURL=connect-custom.d.ts.map