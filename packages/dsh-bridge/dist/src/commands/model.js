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
import { card, heading } from "../lib/output.js";
// ---------------------------------------------------------------------------
// Pure core: config -> routes
// ---------------------------------------------------------------------------
/**
 * Join registered and declared routes into the display list, deriving
 * availability from static facts only. Order follows the config: entries are
 * emitted in registration-then-declaration order as given.
 */
export function collectRoutes(config) {
    const routes = [];
    const seen = new Set();
    for (const entry of config.routes) {
        const id = `${entry.provider}/${entry.model}`;
        if (seen.has(id))
            continue;
        seen.add(id);
        const registered = entry.registered ?? true;
        const declared = entry.declared ?? true;
        const credentialResolved = entry.credentialResolved ?? true;
        const authKind = entry.authKind ?? (entry.apiKeyEnv !== undefined ? "api-key" : "ambient");
        let reason = null;
        if (!registered && declared) {
            reason = "dormant - declared, not configured";
        }
        else if (!credentialResolved) {
            // Echo the reference NAME only; the value never enters this module.
            reason = entry.apiKeyEnv !== undefined ? `no credential (${entry.apiKeyEnv} unset)` : "no credential";
        }
        const available = registered && credentialResolved;
        const unlisted = entry.advertised === false;
        routes.push({
            id,
            provider: entry.provider,
            model: entry.model,
            authKind,
            available,
            // An unlisted model stays servable: the catalog is a discovery surface,
            // not a gate (llm README). Rendered as a suffix note, not unavailability.
            reason: available ? (unlisted ? "available (unlisted)" : null) : reason ?? "unavailable",
            registered,
            declared,
            ...(entry.advertised !== undefined ? { advertised: entry.advertised } : {}),
            ...(entry.reasoning !== undefined ? { reasoning: entry.reasoning } : {}),
            ...(entry.contextWindow !== undefined ? { contextWindow: entry.contextWindow } : {}),
        });
    }
    return routes;
}
/** Resolve a `<provider>/<model>` or bare `<model>` token against routes. */
export function resolveRouteToken(routes, token) {
    const wanted = token.trim().toLowerCase();
    if (wanted === "")
        return { error: "route id required" };
    const exact = routes.find((route) => route.id.toLowerCase() === wanted);
    if (exact !== undefined)
        return { route: exact };
    const bare = routes.filter((route) => route.model.toLowerCase() === wanted);
    if (bare.length === 1 && bare[0] !== undefined)
        return { route: bare[0] };
    if (bare.length > 1) {
        return { error: `"${token}" is ambiguous; served by: ${bare.map((r) => r.id).join(", ")}` };
    }
    return { error: `unknown route "${token}"; run /bridge-model to list ids` };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function availabilityCell(route) {
    return route.available ? "available" : route.reason ?? "unavailable";
}
export function renderModelList(ctx, routes, config) {
    const availableCount = routes.filter((route) => route.available).length;
    const active = config.sessionOverride ?? config.default;
    const activeId = active !== undefined ? `${active.provider}/${active.model}` : null;
    const blocks = [
        heading("/bridge-model"),
        "",
        `${routes.length} route(s), ${availableCount} available, default: ${activeId ?? "none"}${config.sessionOverride !== undefined && config.sessionOverride !== null ? " (session override)" : ""}`,
        "",
        ctx.output.table(["MODEL", "PROVIDER", "AUTH", "AVAILABILITY"], routes.map((route) => [
            route.id === activeId ? `${route.model} *` : route.model,
            route.provider,
            `[${route.authKind}]`,
            availabilityCell(route),
        ])),
        "* marks the active default.",
        "",
    ];
    if (config.sessionOverride !== undefined && config.sessionOverride !== null) {
        blocks.push(`Session override active: ${config.sessionOverride.provider}/${config.sessionOverride.model} wins over the saved default.`, "");
    }
    blocks.push("Switching and testing are instruction-only in this build:", "- /bridge-model use <provider>/<model> shows how to apply a switch", "- /bridge-model test <provider>/<model> shows the smoke-test procedure", "");
    return blocks.join("\n");
}
/** Instruction block for `use`; no settings document is touched here. */
export function renderUseInstructions(routeId, persist, reset) {
    if (reset) {
        return [
            heading("/bridge-model use --reset"),
            "",
            "Reset procedure (not applied by this command in this build):",
            "1. Remove your saved choice from the user layer of ~/.dsh/settings.yaml",
            "   (delete the bridge model default key, e.g. `model:` / `default:`).",
            "2. The composition base in cordis.yml re-applies on the next request;",
            "   no restart is needed.",
            "3. Confirm with /bridge-model: the header should show the base default again.",
            "",
        ].join("\n");
    }
    const lines = [
        heading(`/bridge-model use ${routeId}`),
        "",
        `Staged switch: session default -> ${routeId}`,
        "",
        "This build prints instructions instead of writing config. To apply:",
        "1. Session-only: send your next request with provider/model set to",
        `   ${routeId} (the runtime validates it before dispatch).`,
    ];
    if (persist) {
        lines.push("2. Persist across sessions: add to the user layer of ~/.dsh/settings.yaml:", "   model:", `     default: "${routeId}"`, "3. Effective on the next request with no restart.");
    }
    else {
        lines.push("2. To persist instead, re-run with --save and follow the settings.yaml", "   snippet it prints.");
    }
    lines.push("An in-flight reply finishes on its original route; the switch lands on the", "next step. Verify with /bridge-model or /bridge-status.", "");
    return lines.join("\n");
}
/** Procedure block for `test`; performs no request itself. */
export function renderTestInstructions(routeId, available, reason) {
    const blocks = [heading(`/bridge-model test ${routeId}`), ""];
    if (!available) {
        blocks.push(`Refused before any network call: ${routeId} is not available (${reason ?? "unavailable"}).`, "", "Fix the route first (credentials or configuration), then re-run.", "");
        return blocks.join("\n");
    }
    blocks.push(card("SMOKE TEST PROCEDURE", [
        ["target", routeId],
        ["cost", "one small billable request"],
        ["mode", "instruction-only in this build"],
    ]), "Steps this test will run when enabled:", "1. resolveModelInfo() - cheap adapter metadata lookup.", "2. Minimal stream() call: ~16-token prompt, maxTokens capped small.", '3. Assert the chunk protocol ends with finish { kind: "stop" }.', "", "Report fields once run: first-token latency, total time, tokens in/out.", "The key value named by the route profile is never read or displayed.", "");
    return blocks.join("\n");
}
function usageMarkdown(detail) {
    return [
        heading("/bridge-model"),
        "",
        detail,
        "",
        "Usage:",
        "- /bridge-model [list]",
        "- /bridge-model use <provider>/<model> [--save | --reset]",
        "- /bridge-model test <provider>/<model>",
        "",
    ].join("\n");
}
/** Split a positional blob into the leading route token and trailing flags. */
function splitTarget(rest) {
    const words = rest.split(/\s+/).filter((word) => word !== "");
    const target = words.find((word) => !word.startsWith("--")) ?? "";
    return { target, save: words.includes("--save"), reset: words.includes("--reset") };
}
/** Parse `_`/`rest` positionals plus flags into a routed verb. Throws on misuse. */
export function parseModelArgs(args) {
    const verb = (args["_"] ?? "").trim().toLowerCase();
    const rest = (args["rest"] ?? "").trim();
    const split = splitTarget(rest);
    const save = args["save"] !== undefined || split.save;
    const reset = args["reset"] !== undefined || split.reset;
    if (verb === "" || verb === "list") {
        if (reset || save)
            throw new ModelCommandError("--save/--reset belong to `use`; nothing to list");
        return { verb: "list" };
    }
    if (verb === "use") {
        if (reset)
            return { verb: "use", target: "", save: false, reset: true };
        if (split.target === "")
            throw new ModelCommandError("usage: /bridge-model use <provider>/<model> [--save]");
        return { verb: "use", target: split.target, save, reset: false };
    }
    if (verb === "test") {
        if (split.target === "")
            throw new ModelCommandError("usage: /bridge-model test <provider>/<model>");
        return { verb: "test", target: split.target };
    }
    throw new ModelCommandError(`unknown subcommand "${verb}"`);
}
/** Typed parse failure so callers can distinguish misuse from IO trouble. */
export class ModelCommandError extends Error {
}
const UNAVAILABLE_MARKDOWN = [
    heading("/bridge-model"),
    "",
    "unavailable",
    "",
    "No model-route config was injected into this session, so there is nothing",
    "honest to list. Mount the bridge model config service and retry.",
    "",
].join("\n");
/** `/bridge-model` runner. Read-only; zero network calls by construction. */
export async function runModel(ctx, args, options = {}) {
    void ctx;
    const config = options.config;
    if (config === undefined)
        return { markdown: UNAVAILABLE_MARKDOWN };
    let parsed;
    try {
        parsed = parseModelArgs(args);
    }
    catch (error) {
        return { markdown: usageMarkdown(error.message) };
    }
    if (parsed.verb === "list") {
        const routes = collectRoutes(config);
        return {
            markdown: renderModelList(ctx, routes, config),
            data: { routes, default: config.default ?? null, sessionOverride: config.sessionOverride ?? null },
        };
    }
    const routes = collectRoutes(config);
    if (parsed.verb === "use") {
        if (parsed.reset)
            return { markdown: renderUseInstructions("", false, true) };
        const resolved = resolveRouteToken(routes, parsed.target);
        if ("error" in resolved)
            return { markdown: usageMarkdown(resolved.error) };
        return { markdown: renderUseInstructions(resolved.route.id, parsed.save, false) };
    }
    const resolved = resolveRouteToken(routes, parsed.target);
    if ("error" in resolved)
        return { markdown: usageMarkdown(resolved.error) };
    return {
        markdown: renderTestInstructions(resolved.route.id, resolved.route.available, resolved.route.reason),
    };
}
//# sourceMappingURL=model.js.map