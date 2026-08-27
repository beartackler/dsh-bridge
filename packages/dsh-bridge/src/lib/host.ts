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

import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROFILES_DIR } from "./paths.js";
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
  readonly options?: { readonly provider?: string; readonly model?: string } | undefined;
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
export function profileFromBaseUrl(baseUrl: string | undefined, dshHome: string): string | undefined {
  if (baseUrl === undefined || baseUrl.trim() === "") return undefined;
  let dir: string;
  try {
    // `ctx.baseUrl` is a directory URL ("…/profiles/web/"); fileURLToPath keeps
    // the trailing separator, which `resolve` normalizes away.
    dir = resolve(fileURLToPath(baseUrl));
  } catch {
    return undefined;
  }
  const parent = dirname(dir);
  if (parent !== resolve(dshHome, PROFILES_DIR)) return undefined;
  const name = basename(dir);
  return name === "" || name === PROFILES_DIR ? undefined : name;
}

/**
 * Resolve the profile to report, and record where the name came from.
 *
 * Precedence: the mount (authoritative, needs no configuration), then an
 * explicitly configured name, then the fallback used only for path
 * construction. The `source` is what keeps /bridge-doctor honest: a fallback
 * name was never invoked by the user, so no check may grade against it
 * (journey report 3.2).
 */
export function resolveProfile(
  ctx: BaseUrlCarrier | undefined,
  dshHome: string,
  configured: string | undefined,
  fallback = "default",
): ProfileResolution {
  const mounted = profileFromBaseUrl(ctx?.baseUrl, dshHome);
  if (mounted !== undefined) return { name: mounted, source: "mount" };
  if (configured !== undefined && configured.trim() !== "") return { name: configured.trim(), source: "config" };
  return { name: fallback, source: "fallback" };
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Read the active route from the agent's own options, then the host default. */
export function readActiveRoute(
  ctx: ServiceCarrier | undefined,
  agent?: AgentLike | undefined,
): HostServices["activeRoute"] {
  const fromAgent = agent?.options;
  const agentProvider = nonEmptyString(fromAgent?.provider);
  const agentModel = nonEmptyString(fromAgent?.model);
  if (agentProvider !== undefined && agentModel !== undefined) {
    return { provider: agentProvider, model: agentModel, live: true };
  }
  const service = ctx?.get?.("agentDefaultModel");
  const currentSelection = (service as { currentSelection?: () => unknown } | undefined)?.currentSelection;
  if (typeof currentSelection !== "function") return undefined;
  let selection: unknown;
  try {
    selection = currentSelection.call(service);
  } catch {
    return undefined;
  }
  const record = (selection ?? {}) as Record<string, unknown>;
  const provider = nonEmptyString(record["provider"]);
  const model = nonEmptyString(record["model"]);
  if (provider === undefined || model === undefined) return undefined;
  return { provider, model, live: true };
}

/**
 * Read this session's token usage from the projection snapshot. Absent when no
 * projection registry is mounted, no agent invoked the command, or the
 * token-meter unit is not registered in this composition.
 */
export function readTokenUsage(
  ctx: ServiceCarrier | undefined,
  agent?: AgentLike | undefined,
): HostServices["tokenUsage"] {
  const session = agent?.session;
  if (session === undefined || session === null) return undefined;
  const registry = ctx?.get?.("sessionProjections");
  const snapshot = (registry as { snapshot?: (session: unknown) => unknown } | undefined)?.snapshot;
  if (typeof snapshot !== "function") return undefined;
  let cut: unknown;
  try {
    cut = snapshot.call(registry, session);
  } catch {
    return undefined;
  }
  const values = ((cut ?? {}) as { values?: Record<string, unknown> }).values ?? {};
  const usage = values["tokenUsage"] as Record<string, unknown> | undefined;
  if (usage === undefined) return undefined;
  const uncachedInputTokens = asFiniteNumber(usage["uncachedInputTokens"]);
  const outputTokens = asFiniteNumber(usage["outputTokens"]);
  if (uncachedInputTokens === undefined || outputTokens === undefined) return undefined;
  const pressure = values["contextPressure"] as Record<string, unknown> | undefined;
  const contextWindow = asFiniteNumber(pressure?.["contextWindow"]);
  return {
    uncachedInputTokens,
    outputTokens,
    ...(asFiniteNumber(usage["cacheReadTokens"]) === undefined
      ? {}
      : { cacheReadTokens: asFiniteNumber(usage["cacheReadTokens"]) as number }),
    ...(asFiniteNumber(usage["cacheWriteTokens"]) === undefined
      ? {}
      : { cacheWriteTokens: asFiniteNumber(usage["cacheWriteTokens"]) as number }),
    ...(contextWindow === undefined ? {} : { contextWindow }),
  };
}

/**
 * Collect every host-sourced status fact for one invocation. Each field is
 * independent: a missing service degrades exactly its own row.
 */
export function readHostServices(
  ctx: ServiceCarrier | undefined,
  agent: AgentLike | undefined,
  mountedFeatures: readonly string[],
): HostServices {
  const activeRoute = readActiveRoute(ctx, agent);
  const tokenUsage = readTokenUsage(ctx, agent);
  return {
    ...(activeRoute === undefined ? {} : { activeRoute }),
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
    ...(mountedFeatures.length === 0 ? {} : { mountedFeatures }),
  };
}
