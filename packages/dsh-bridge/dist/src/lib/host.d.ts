/**
 * Host seam readers: the two facts the plugin must ask the harness for rather
 * than guess (docs/research/e2e-onboarding-journey.md F5, F6).
 *
 * Every function here is defensive by construction. A composition that does
 * not mount a service returns `undefined`, never a fabricated value: the
 * status spec's "unavailable" is reserved for data that genuinely is absent.
 *
 * Grounding, verified against the installed runtime (@deepseek-ai/dsh
 * 0.1.1-rc.2, /tmp/dsh-e2e/node_modules):
 *
 *  - Mounted profile. The profile launcher boots the Loader against
 *    `<profile dir>/cordis.yml`
 *    (`@deepseek-ai/dsh/lib/profile-boot-DG5t9aNs.js:240`, with the filename at
 *    `:108`), and the include anchors the tree's `baseUrl` at that file's
 *    directory (`@deepseek-ai/cordis-plugin-include/lib/index.js:133` resolves
 *    the config path, `:138` sets `ctx.baseUrl` to its directory URL). The
 *    profile directory's basename IS the profile name
 *    (`@deepseek-ai/dsh-app-boot/lib/types/profile.d.ts:70-72`: "The profile
 *    name (its directory basename)"), and every profile lives under
 *    `$DSH_HOME/profiles` (`PROFILES_DIR`, same file `:27`). So the plugin's
 *    own `ctx.baseUrl` (`@deepseek-ai/cordis/lib/types/context.d.ts:23`) names
 *    the profile it is mounted in, with no configuration.
 *
 *  - Active model route. `ctx.agentDefaultModel.currentSelection()` returns
 *    `{ provider, model, reasoningEffort? }`
 *    (`@deepseek-ai/dsh-agent-default-model/lib/types/index.d.ts:40-48`,
 *    `ModelSelection` at `@deepseek-ai/dsh-agent/lib/types/model-selection.d.ts:8-15`).
 *    An agent that carries its own route overrides it through
 *    `agent.options.provider/.model`
 *    (`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:20-27, 60-66`).
 *
 *  - Token usage. `ctx.sessionProjections.snapshot(session)` is one consistent
 *    cut of every client-visible projection
 *    (`@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:167-176`,
 *    `ProjectionSnapshot` at `:86-91`). The token-meter registers `tokenUsage`
 *    (`TokenUsageProjection`: uncachedInputTokens, outputTokens,
 *    cacheReadTokens, cacheWriteTokens) and `contextPressure`
 *    (`contextWindow`, `pressureTokens`) into that map
 *    (`@deepseek-ai/dsh-token-meter/lib/types/projection.d.ts:12-17, 28-45,
 *    64-71`). The session comes from the invoking agent
 *    (`CommandInvocation.agent` in
 *    `@deepseek-ai/dsh-commands/lib/types/index.d.ts:17-24`, `Agent.session` in
 *    `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:66`).
 *
 * The parameter types below are structural on purpose: they name only the
 * members read, so this module compiles without a hard dependency on packages
 * a given composition may not mount.
 */
import type { HostServices, ProfileResolution } from "./types.js";
/** The `ctx.baseUrl` slice this module reads (cordis context.d.ts:23). */
export interface BaseUrlCarrier {
    readonly baseUrl?: string | undefined;
}
/**
 * The Cordis service-resolution slice used here: `ctx.get(name)` returns the
 * mounted service or `undefined` (`ReflectService`, reached through the
 * context proxy). Typed as `unknown` so callers must narrow.
 */
export interface ServiceCarrier extends BaseUrlCarrier {
    get?(name: string): unknown;
}
/** `Agent` slice: its options carry the per-agent route, its session the log. */
export interface AgentLike {
    readonly options?: {
        readonly provider?: string;
        readonly model?: string;
    } | undefined;
    readonly session?: unknown;
}
/**
 * Derive the profile the plugin is mounted in from the Loader's base URL.
 *
 * Returns `undefined` unless the base URL genuinely resolves to a directory
 * under `<dshHome>/profiles`; a host that mounts this plugin some other way
 * (a test harness, an embedded composition) yields no claim rather than a
 * wrong one.
 */
export declare function profileFromBaseUrl(baseUrl: string | undefined, dshHome: string): string | undefined;
/**
 * Resolve the profile to report, and record where the name came from.
 *
 * Precedence: the mount (authoritative, needs no configuration), then an
 * explicitly configured name, then the fallback used only for path
 * construction. The `source` is what keeps /bridge-doctor honest: a fallback
 * name was never invoked by the user, so no check may grade against it
 * (journey report 3.2).
 */
export declare function resolveProfile(ctx: BaseUrlCarrier | undefined, dshHome: string, configured: string | undefined, fallback?: string): ProfileResolution;
/** Read the active route from the agent's own options, then the host default. */
export declare function readActiveRoute(ctx: ServiceCarrier | undefined, agent?: AgentLike | undefined): HostServices["activeRoute"];
/**
 * Read this session's token usage from the projection snapshot. Absent when no
 * projection registry is mounted, no agent invoked the command, or the
 * token-meter unit is not registered in this composition.
 */
export declare function readTokenUsage(ctx: ServiceCarrier | undefined, agent?: AgentLike | undefined): HostServices["tokenUsage"];
/**
 * Collect every host-sourced status fact for one invocation. Each field is
 * independent: a missing service degrades exactly its own row.
 */
export declare function readHostServices(ctx: ServiceCarrier | undefined, agent: AgentLike | undefined, mountedFeatures: readonly string[]): HostServices;
//# sourceMappingURL=host.d.ts.map