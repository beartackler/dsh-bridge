/**
 * Tests for lib/host.ts: the three host seams behind defects F5 and F6
 * (docs/research/e2e-onboarding-journey.md 3.2, 3.3).
 *
 * The doubles below are shaped from the installed harness typings, not
 * invented. Each is annotated with the interface it stands in for so a
 * reviewer can check the shape against the runtime without reading host.ts:
 *
 *  - `AgentDefaultModelConfig.currentSelection(): ModelSelection`
 *    (@deepseek-ai/dsh-agent-default-model/lib/types/index.d.ts:44-48; the
 *    returned `{ provider, model }` at :30-33).
 *  - `SessionProjections.snapshot(session): ProjectionSnapshot`
 *    (@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:167-176;
 *    `{ asOfSeq, values }` at :86-91), whose `values.tokenUsage` and
 *    `values.contextPressure` are the token-meter's registered projections
 *    (@deepseek-ai/dsh-token-meter/lib/types/projection.d.ts:12-17, 28-45,
 *    64-71). `TokenUsageProjection`'s four buckets are all required there, so
 *    the happy-path double carries all four.
 *  - `Agent` with `options: AgentOptions` and `session: Session`
 *    (@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:12-19, 58-66).
 *  - `ctx.baseUrl` as the Loader-set directory URL
 *    (@deepseek-ai/cordis/lib/types/context.d.ts:23), anchored at the profile's
 *    cordis.yml directory by cordis-plugin-include (lib/index.js:133-138), whose
 *    basename is the profile name
 *    (@deepseek-ai/dsh-app-boot/lib/types/profile.d.ts:70-72).
 *
 * Service lookup goes through `ctx.get(name)`, which returns `undefined` for an
 * unmounted service; the doubles reproduce that exactly.
 */
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
const dist = new URL("../src", import.meta.url).pathname;
const { profileFromBaseUrl, readActiveRoute, readHostServices, readTokenUsage, resolveProfile } = await import(`${dist}/lib/host.js`);
const DSH_HOME = "/home/u/.dsh";
/** `ctx.baseUrl` for a profile directory: a directory URL with trailing slash. */
function profileBaseUrl(name, dshHome = DSH_HOME) {
    return `${pathToFileURL(join(dshHome, "profiles", name)).href}/`;
}
/**
 * A context double: `baseUrl` plus `get(name)` service resolution. Unlisted
 * names resolve to `undefined`, matching an unmounted service.
 */
function ctxWith(services, baseUrl) {
    return {
        ...(baseUrl === undefined ? {} : { baseUrl }),
        get(name) {
            return Object.hasOwn(services, name) ? services[name] : undefined;
        },
    };
}
/** Stands in for `AgentDefaultModelConfig` (index.d.ts:38-48). */
function agentDefaultModelDouble(selection) {
    return {
        currentSelection() {
            return selection;
        },
        async saveSelection() { },
    };
}
/**
 * Stands in for the `sessionProjections` registry: `snapshot(session)` returns
 * one `ProjectionSnapshot` (`{ asOfSeq, values }`) for the session handed in.
 */
function sessionProjectionsDouble(values, asOfSeq = 42) {
    const calls = [];
    return {
        calls,
        snapshot(session) {
            calls.push(session);
            return { asOfSeq, values };
        },
        stateOf() {
            return undefined;
        },
    };
}
/** Stands in for a live `Agent`: only `options` and `session` are read. */
function agentDouble(options = {}, session = { id: "sess-1" }) {
    return { id: "sess-1", options, session, status: "idle" };
}
/** The token-meter's four required buckets (projection.d.ts:12-17). */
const TOKEN_USAGE = {
    uncachedInputTokens: 8500,
    outputTokens: 48,
    cacheReadTokens: 1200,
    cacheWriteTokens: 300,
};
// ---------------------------------------------------------------------------
// F5: the mounted profile
// ---------------------------------------------------------------------------
describe("profileFromBaseUrl", () => {
    it("reads the profile name from the Loader's base URL", () => {
        assert.equal(profileFromBaseUrl(profileBaseUrl("web"), DSH_HOME), "web");
    });
    it("accepts a base URL without the trailing slash", () => {
        assert.equal(profileFromBaseUrl(pathToFileURL(join(DSH_HOME, "profiles", "web")).href, DSH_HOME), "web");
    });
    it("claims nothing when the base URL is outside <dshHome>/profiles", () => {
        // An embedded composition or a test harness: no profile to name.
        assert.equal(profileFromBaseUrl(pathToFileURL("/srv/app/config").href, DSH_HOME), undefined);
        // One level too deep is not a profile directory either.
        assert.equal(profileFromBaseUrl(profileBaseUrl(join("web", "nested")), DSH_HOME), undefined);
        // The profiles directory itself names no single profile.
        assert.equal(profileFromBaseUrl(`${pathToFileURL(join(DSH_HOME, "profiles")).href}/`, DSH_HOME), undefined);
    });
    it("claims nothing for an absent, blank, or non-file URL", () => {
        assert.equal(profileFromBaseUrl(undefined, DSH_HOME), undefined);
        assert.equal(profileFromBaseUrl("   ", DSH_HOME), undefined);
        assert.equal(profileFromBaseUrl("https://example.com/profiles/web/", DSH_HOME), undefined);
        assert.equal(profileFromBaseUrl("not a url", DSH_HOME), undefined);
    });
    it("honours a $DSH_HOME that is not under the real home directory", () => {
        // The live e2e run used /tmp/dsh-e2e/dshhome (journey report 3.2).
        const dshHome = `${sep}tmp${sep}dsh-e2e${sep}dshhome`;
        assert.equal(profileFromBaseUrl(profileBaseUrl("web", dshHome), dshHome), "web");
    });
});
describe("resolveProfile", () => {
    it("prefers the mounted profile over configuration (F5)", () => {
        // The exact defect: config says "default", the mount says "web".
        assert.deepEqual(resolveProfile(ctxWith({}, profileBaseUrl("web")), DSH_HOME, "default"), {
            name: "web",
            source: "mount",
        });
    });
    it("falls back to a configured name when the mount cannot be read", () => {
        assert.deepEqual(resolveProfile(ctxWith({}), DSH_HOME, "research"), {
            name: "research",
            source: "config",
        });
        // Blank configuration is not a name.
        assert.deepEqual(resolveProfile(ctxWith({}), DSH_HOME, "   "), { name: "default", source: "fallback" });
    });
    it("marks a name nobody chose as a fallback, so no check may grade it", () => {
        assert.deepEqual(resolveProfile(undefined, DSH_HOME, undefined), { name: "default", source: "fallback" });
    });
});
// ---------------------------------------------------------------------------
// F6: the active route
// ---------------------------------------------------------------------------
describe("readActiveRoute", () => {
    it("reads the host default selection the UI footer renders", () => {
        const ctx = ctxWith({
            agentDefaultModel: agentDefaultModelDouble({ provider: "pi-ai", model: "qwen-3.5-plus" }),
        });
        assert.deepEqual(readActiveRoute(ctx, agentDouble()), {
            provider: "pi-ai",
            model: "qwen-3.5-plus",
            live: true,
        });
    });
    it("keeps a ModelSelection's extra reasoningEffort field out of the row", () => {
        const ctx = ctxWith({
            agentDefaultModel: agentDefaultModelDouble({
                provider: "deepseek",
                model: "deepseek-chat",
                reasoningEffort: "high",
            }),
        });
        assert.deepEqual(readActiveRoute(ctx, agentDouble()), {
            provider: "deepseek",
            model: "deepseek-chat",
            live: true,
        });
    });
    it("prefers the invoking agent's own route over the host default", () => {
        const ctx = ctxWith({
            agentDefaultModel: agentDefaultModelDouble({ provider: "pi-ai", model: "qwen-3.5-plus" }),
        });
        const agent = agentDouble({ provider: "deepseek", model: "deepseek-reasoner", maxTokens: 8192 });
        assert.deepEqual(readActiveRoute(ctx, agent), {
            provider: "deepseek",
            model: "deepseek-reasoner",
            live: true,
        });
    });
    it("ignores a half-specified agent route and falls through to the default", () => {
        // AgentOptions has both fields optional (runtime-types.d.ts:12-19).
        const ctx = ctxWith({
            agentDefaultModel: agentDefaultModelDouble({ provider: "pi-ai", model: "qwen-3.5-plus" }),
        });
        assert.deepEqual(readActiveRoute(ctx, agentDouble({ model: "deepseek-chat" })), {
            provider: "pi-ai",
            model: "qwen-3.5-plus",
            live: true,
        });
    });
    it("returns undefined when agentDefaultModel is not mounted", () => {
        assert.equal(readActiveRoute(ctxWith({}), agentDouble()), undefined);
        assert.equal(readActiveRoute(undefined, undefined), undefined);
    });
    it("returns undefined rather than a partial route on a malformed selection", () => {
        for (const selection of [undefined, null, {}, { provider: "pi-ai" }, { model: "m" }, { provider: "", model: "m" }]) {
            assert.equal(readActiveRoute(ctxWith({ agentDefaultModel: agentDefaultModelDouble(selection) }), agentDouble()), undefined);
        }
    });
    it("survives a throwing service without taking the command down", () => {
        const ctx = ctxWith({
            agentDefaultModel: {
                currentSelection() {
                    throw new Error("no settings provider mounted");
                },
            },
        });
        assert.equal(readActiveRoute(ctx, agentDouble()), undefined);
    });
});
// ---------------------------------------------------------------------------
// F6: token usage
// ---------------------------------------------------------------------------
describe("readTokenUsage", () => {
    it("reads the token-meter projections out of one snapshot cut", () => {
        const projections = sessionProjectionsDouble({
            tokenUsage: TOKEN_USAGE,
            contextPressure: { pressureTokens: 9800, projectedTokens: 10200, contextWindow: 131072 },
        });
        const session = { id: "sess-1" };
        const usage = readTokenUsage(ctxWith({ sessionProjections: projections }), agentDouble({}, session));
        assert.deepEqual(usage, {
            uncachedInputTokens: 8500,
            outputTokens: 48,
            cacheReadTokens: 1200,
            cacheWriteTokens: 300,
            contextWindow: 131072,
            pressureTokens: 9800,
        });
        // The snapshot must be taken for the invoking agent's own session.
        assert.deepEqual(projections.calls, [session]);
    });
    it("reads usage without a contextPressure projection", () => {
        // A composition may register tokenUsage while no adapter has advertised a
        // window yet; every contextPressure field is optional (projection.d.ts:28-45).
        const usage = readTokenUsage(ctxWith({ sessionProjections: sessionProjectionsDouble({ tokenUsage: TOKEN_USAGE }) }), agentDouble());
        assert.equal(usage.contextWindow, undefined);
        assert.equal(usage.pressureTokens, undefined);
        assert.equal(usage.uncachedInputTokens, 8500);
    });
    it("returns undefined when the token-meter unit is not registered", () => {
        // The registry is mounted but its values carry no tokenUsage key.
        const projections = sessionProjectionsDouble({ contextBreakdown: { systemTokens: 1, toolsTokens: 2, messageTokens: 3 } });
        assert.equal(readTokenUsage(ctxWith({ sessionProjections: projections }), agentDouble()), undefined);
    });
    it("returns undefined with no projection registry and with no invoking agent", () => {
        assert.equal(readTokenUsage(ctxWith({}), agentDouble()), undefined);
        assert.equal(readTokenUsage(ctxWith({ sessionProjections: sessionProjectionsDouble({ tokenUsage: TOKEN_USAGE }) }), undefined), undefined);
    });
    it("refuses a projection whose required counters are missing or non-finite", () => {
        for (const tokenUsage of [{ outputTokens: 5 }, { uncachedInputTokens: 5 }, { uncachedInputTokens: Number.NaN, outputTokens: 5 }]) {
            assert.equal(readTokenUsage(ctxWith({ sessionProjections: sessionProjectionsDouble({ tokenUsage }) }), agentDouble()), undefined);
        }
    });
    it("survives a throwing snapshot", () => {
        const ctx = ctxWith({
            sessionProjections: {
                snapshot() {
                    throw new Error("session not tracked");
                },
            },
        });
        assert.equal(readTokenUsage(ctx, agentDouble()), undefined);
    });
});
// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
describe("readHostServices", () => {
    it("collects every fact from a fully mounted composition", () => {
        const ctx = ctxWith({
            agentDefaultModel: agentDefaultModelDouble({ provider: "pi-ai", model: "qwen-3.5-plus" }),
            sessionProjections: sessionProjectionsDouble({
                tokenUsage: TOKEN_USAGE,
                contextPressure: { pressureTokens: 9800, contextWindow: 131072 },
            }),
        }, profileBaseUrl("web"));
        const host = readHostServices(ctx, agentDouble(), ["commands", "trust layer"]);
        assert.deepEqual(host.activeRoute, { provider: "pi-ai", model: "qwen-3.5-plus", live: true });
        assert.equal(host.tokenUsage?.outputTokens, 48);
        assert.deepEqual(host.mountedFeatures, ["commands", "trust layer"]);
    });
    it("degrades one row at a time, never cascading", () => {
        // Route mounted, projections absent: only tokenUsage goes missing.
        const host = readHostServices(ctxWith({ agentDefaultModel: agentDefaultModelDouble({ provider: "pi-ai", model: "qwen-3.5-plus" }) }), agentDouble(), ["commands"]);
        assert.ok(host.activeRoute !== undefined);
        assert.equal(host.tokenUsage, undefined);
        assert.deepEqual(host.mountedFeatures, ["commands"]);
    });
    it("omits absent keys entirely on a composition that mounts nothing", () => {
        assert.deepEqual(readHostServices(undefined, undefined, []), {});
    });
});
//# sourceMappingURL=host-test.js.map