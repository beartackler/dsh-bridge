/**
 * Tests for /bridge-model (docs/specs/commands/model.md, MVP slice).
 *
 * Covers: the config join into availability states, reason vocabulary, active
 * markers, bare-model resolution and ambiguity refusal, instruction-only use
 * and test flows (no mutation), parse failures, graceful absence of injected
 * config, and the charter's ASCII/no-emoji bar.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
// Compiled package under test (dist/src), mirroring self-test.ts.
const dist = new URL("../src", import.meta.url).pathname;
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { ModelCommandError, collectRoutes, parseModelArgs, renderModelList, renderTestInstructions, renderUseInstructions, resolveRouteToken, runModel, } = await import(`${dist}/commands/model.js`);
function makeCtx() {
    return makeBridgeContext({
        profile: "web",
        paths: { home: "/home/u", dshHome: "/home/u/.dsh" },
        output: { table, card, badge },
    });
}
/** Spec-shaped fixture: live routes, a credential miss, a dormant route. */
function fixtureConfig() {
    return {
        default: { provider: "deepseek", model: "deepseek-chat" },
        sessionOverride: null,
        routes: [
            { provider: "deepseek", model: "deepseek-chat", authKind: "api-key", apiKeyEnv: "DEEPSEEK_API_KEY", reasoning: ["off", "medium", "high"], contextWindow: 128000 },
            { provider: "deepseek", model: "deepseek-reasoner", authKind: "api-key", apiKeyEnv: "DEEPSEEK_API_KEY" },
            { provider: "anthropic", model: "claude-opus-5", authKind: "oauth", credentialResolved: false },
            { provider: "moonshot", model: "kimi-k2", authKind: "api-key", apiKeyEnv: "MOONSHOT_API_KEY", credentialResolved: false },
            { provider: "dashscope", model: "qwen3-max", registered: false, declared: true, authKind: "api-key", apiKeyEnv: "DASHSCOPE_API_KEY" },
        ],
    };
}
describe("model route collection", () => {
    it("joins registered and declared routes with derived availability", () => {
        const routes = collectRoutes(fixtureConfig());
        assert.deepEqual(routes.map((route) => route.id), [
            "deepseek/deepseek-chat",
            "deepseek/deepseek-reasoner",
            "anthropic/claude-opus-5",
            "moonshot/kimi-k2",
            "dashscope/qwen3-max",
        ]);
        const byId = new Map(routes.map((route) => [route.id, route]));
        const chat = byId.get("deepseek/deepseek-chat");
        assert.equal(chat?.available, true);
        assert.equal(chat?.reason, null);
        assert.equal(byId.get("anthropic/claude-opus-5")?.reason, "no credential");
        assert.equal(byId.get("moonshot/kimi-k2")?.reason, "no credential (MOONSHOT_API_KEY unset)");
        const dormant = byId.get("dashscope/qwen3-max");
        assert.equal(dormant?.available, false);
        assert.equal(dormant?.registered, false);
        assert.equal(dormant?.declared, true);
        assert.match(dormant?.reason ?? "", /dormant/);
    });
    it("keeps an unlisted model available; the catalog is not a gate", () => {
        const routes = collectRoutes({
            default: undefined,
            routes: [{ provider: "a", model: "m", advertised: false }],
        });
        const only = routes[0];
        assert.equal(only?.available, true);
        assert.match(only?.reason ?? "", /unlisted/);
    });
    it("derives api-key vs ambient from the presence of a reference", () => {
        const routes = collectRoutes({
            default: undefined,
            routes: [{ provider: "x", model: "keyed", apiKeyEnv: "X_KEY" }, { provider: "y", model: "ambient" }],
        });
        assert.equal(routes[0]?.authKind, "api-key");
        assert.equal(routes[1]?.authKind, "ambient");
    });
    it("deduplicates repeated route ids instead of listing them twice", () => {
        const routes = collectRoutes({
            default: undefined,
            routes: [
                { provider: "a", model: "m" },
                { provider: "a", model: "m", declared: true },
            ],
        });
        assert.equal(routes.length, 1);
    });
});
describe("model token resolution", () => {
    const routes = collectRoutes(fixtureConfig());
    it("accepts full ids case-insensitively and unambiguous bare models", () => {
        assert.equal(resolveRouteToken(routes, "DEEPSEEK/deepseek-reasoner").route?.id, "deepseek/deepseek-reasoner");
        assert.equal(resolveRouteToken(routes, "kimi-k2").route?.id, "moonshot/kimi-k2");
    });
    it("refuses ambiguous or unknown tokens with a list, never a guess", () => {
        const routes = collectRoutes({
            default: undefined,
            routes: [
                { provider: "a", model: "shared" },
                { provider: "b", model: "shared" },
                { provider: "c", model: "lonely" },
            ],
        });
        const ambiguous = resolveRouteToken(routes, "shared");
        assert.ok("error" in ambiguous);
        assert.match(ambiguous.error, /ambiguous/);
        assert.ok(ambiguous.error.includes("a/shared") && ambiguous.error.includes("b/shared"), "must list the candidates");
        const missing = resolveRouteToken(routes, "nope");
        assert.ok("error" in missing);
        assert.match(missing.error, /unknown route/);
        assert.ok(!("error" in resolveRouteToken(routes, "lonely")));
    });
});
describe("model rendering", () => {
    const ctx = makeCtx();
    it("marks the active default and counts availability in the header", () => {
        const markdown = renderModelList(ctx, collectRoutes(fixtureConfig()), fixtureConfig());
        assert.match(markdown, /5 route\(s\), 2 available, default: deepseek\/deepseek-chat/);
        assert.match(markdown, /\* marks the active default/);
        // The active row carries the star marker on its model cell.
        assert.match(markdown, /deepseek-chat \*/);
    });
    it("announces a winning session override when one is set", () => {
        const overridden = { ...fixtureConfig(), sessionOverride: { provider: "moonshot", model: "kimi-k2" } };
        const markdown = renderModelList(ctx, collectRoutes(overridden), overridden);
        assert.match(markdown, /Session override active: moonshot\/kimi-k2/);
    });
    it("renders use instructions without mutating anything", () => {
        const markdown = renderUseInstructions("deepseek/deepseek-chat", false, false);
        assert.match(markdown, /Staged switch: session default -> deepseek\/deepseek-chat/);
        assert.match(markdown, /instruction/i);
        assert.doesNotMatch(markdown, /settings\.yaml:\s*$/m);
        assert.ok(!markdown.includes("written"), "must not claim a write happened");
        const persisted = renderUseInstructions("deepseek/deepseek-chat", true, false);
        assert.match(persisted, /settings\.yaml/);
        assert.match(persisted, /model:\s*\n\s*default:/);
    });
    it("renders the reset procedure for --reset", () => {
        const markdown = renderUseInstructions("", false, true);
        assert.match(markdown, /Reset procedure/);
        assert.match(markdown, /cordis\.yml re-applies/);
    });
    it("shows the cost notice once per test procedure and refuses unavailable routes pre-network", () => {
        const okTest = renderTestInstructions("deepseek/deepseek-chat", true, null);
        assert.match(okTest, /one small billable request/);
        assert.match(okTest, /finish \{ kind: "stop" \}/);
        const refused = renderTestInstructions("moonshot/kimi-k2", false, "no credential (MOONSHOT_API_KEY unset)");
        assert.match(refused, /not available \(no credential \(MOONSHOT_API_KEY unset\)\)/);
        assert.match(refused, /Refused before any network call/);
        assert.doesNotMatch(refused, /billable/);
    });
});
describe("model arg parsing", () => {
    it("defaults to list mode", () => {
        assert.deepEqual(parseModelArgs({}), { verb: "list" });
        assert.deepEqual(parseModelArgs({ _: "list" }), { verb: "list" });
    });
    it("parses use/test targets and flags", () => {
        assert.deepEqual(parseModelArgs({ _: "use", rest: "--save deepseek/deepseek-chat" }), {
            verb: "use",
            target: "deepseek/deepseek-chat",
            save: true,
            reset: false,
        });
        assert.deepEqual(parseModelArgs({ _: "use", rest: "deepseek/deepseek-chat --save" }), {
            verb: "use",
            target: "deepseek/deepseek-chat",
            save: true,
            reset: false,
        });
        assert.deepEqual(parseModelArgs({ _: "test", rest: "kimi-k2" }), { verb: "test", target: "kimi-k2" });
        assert.deepEqual(parseModelArgs({ _: "use", reset: "" }), { verb: "use", target: "", save: false, reset: true });
    });
    it("rejects misuse through the typed error", () => {
        assert.throws(() => parseModelArgs({ _: "use" }), ModelCommandError);
        assert.throws(() => parseModelArgs({ _: "test" }), ModelCommandError);
        assert.throws(() => parseModelArgs({ _: "frobnicate" }), ModelCommandError);
    });
});
describe("model command runner", () => {
    const ctx = makeCtx();
    it("lists routes end to end with structured data", async () => {
        const result = await runModel(ctx, {}, { config: fixtureConfig() });
        assert.match(result.markdown, /deepseek-reasoner/);
        assert.match(result.markdown, /dormant - declared, not configured/);
        const data = result.data;
        assert.equal(data.routes.length, 5);
        assert.deepEqual(data.default, { provider: "deepseek", model: "deepseek-chat" });
    });
    it("stages use and test without writing any config file", async () => {
        const use = await runModel(ctx, { _: "use", rest: "deepseek/deepseek-chat" }, { config: fixtureConfig() });
        assert.match(use.markdown, /Staged switch/);
        assert.ok(use.data === undefined, "mutation-free verbs carry no data payload");
        const useBare = await runModel(ctx, { _: "use", rest: "deepseek-reasoner" }, { config: fixtureConfig() });
        assert.match(useBare.markdown, /deepseek\/deepseek-reasoner/);
        const test = await runModel(ctx, { _: "test", rest: "deepseek/deepseek-chat" }, { config: fixtureConfig() });
        assert.match(test.markdown, /SMOKE TEST PROCEDURE/);
        const refused = await runModel(ctx, { _: "test", rest: "kimi-k2" }, { config: fixtureConfig() });
        assert.match(refused.markdown, /Refused before any network call/);
    });
    it("answers unknown routes and bad args with usage, not crashes", async () => {
        const unknown = await runModel(ctx, { _: "use", rest: "ghost/model" }, { config: fixtureConfig() });
        assert.match(unknown.markdown, /unknown route/);
        const badVerb = await runModel(ctx, { _: "wat" }, { config: fixtureConfig() });
        assert.match(badVerb.markdown, /unknown subcommand/);
        assert.match(badVerb.markdown, /Usage:/);
    });
    it("degrades honestly when no model config is injected", async () => {
        const result = await runModel(ctx, {});
        assert.match(result.markdown, /unavailable/);
        assert.ok(!result.markdown.includes("|"), "no fabricated table without data");
    });
    it("never leaks a credential value even if one somehow reached the double", async () => {
        const poisoned = {
            default: undefined,
            routes: [
                { provider: "p", model: "m", authKind: "api-key", apiKeyEnv: "P_KEY", credentialResolved: true, secretValue: "sk-super-secret-9999" },
            ],
        };
        const result = await runModel(ctx, {}, { config: poisoned });
        const rendered = `${result.markdown}\n${JSON.stringify(result.data)}`;
        assert.ok(!rendered.includes("sk-super-secret"), "secret leaked through output");
        assert.ok(rendered.includes("[api-key]"));
    });
    it("keeps every rendered byte ASCII and emoji-free across all verbs", async () => {
        const config = fixtureConfig();
        const outputs = [
            (await runModel(ctx, {}, { config })).markdown,
            (await runModel(ctx, { _: "use", rest: "deepseek/deepseek-chat --save" }, { config })).markdown,
            (await runModel(ctx, { _: "test", rest: "deepseek/deepseek-chat" }, { config })).markdown,
            (await runModel(ctx, {}, {})).markdown,
        ];
        for (const markdown of outputs) {
            for (const char of markdown) {
                const code = char.codePointAt(0) ?? 0;
                assert.ok(code <= 127, `non-ASCII leaked into model output: ${char}`);
            }
        }
    });
});
//# sourceMappingURL=model-test.js.map