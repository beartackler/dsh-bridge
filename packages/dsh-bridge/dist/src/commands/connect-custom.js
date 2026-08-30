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
/** Adapter's own assumed capacity when nothing sizes the model (config.d.ts:36). */
export const DEFAULT_CONTEXT_WINDOW = 262144;
/** Adapter's own assumed output cap when nothing sizes the model (config.d.ts:38). */
export const DEFAULT_MAX_TOKENS = 32768;
/** Wire protocol assumed for an OpenAI-compatible endpoint (config.d.ts:59-63). */
export const DEFAULT_API = "openai-completions";
/**
 * Shapes that mean "this is a secret, not a variable name". Checked against
 * the api-key-env argument, which is the one field a confused user is most
 * likely to fill with the key itself.
 */
const SECRET_SHAPES = [/^sk-/i, /^pk-/i, /^ghp_/, /^xai-/i, /^[A-Za-z0-9_-]{40,}$/];
/** Valid POSIX-ish environment variable name. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * Refuse a secret-shaped credential name. This is the invariant boundary: a
 * value that fails here never reaches a plan, a file, or the transcript, and
 * the thrown message quotes nothing back.
 */
export function assertNotSecret(apiKeyEnv) {
    if (SECRET_SHAPES.some((shape) => shape.test(apiKeyEnv))) {
        throw new Error("--key-env takes the NAME of a credential reference, not the key itself. " +
            "Nothing was written. Pick a name like MYPROVIDER_API_KEY and put the key value in $DSH_HOME/.credentials.yaml.");
    }
    if (!ENV_NAME.test(apiKeyEnv)) {
        throw new Error("--key-env must be a plain environment-variable name (letters, digits, underscore; not starting with a digit).");
    }
}
/** Route keys are dict keys and YAML-plain; keep them boring. */
const ROUTE_KEY = /^[a-z0-9][a-z0-9-]*$/;
/** Derive a default route key from the endpoint host, e.g. `opencode.ai` -> `opencode`. */
export function routeKeyFromUrl(baseUrl) {
    let host;
    try {
        host = new URL(baseUrl).hostname;
    }
    catch {
        return "";
    }
    const label = host.replace(/^www\./, "").split(".")[0] ?? "";
    return label.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
/** Default credential reference name for a route: `OPENCODE_ZEN_API_KEY` from `opencode-zen`. */
export function defaultKeyEnv(route) {
    return `${route.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}
/**
 * Validate and complete a request. Throws with an actionable message rather
 * than emitting a route that would fail silently inside the harness, which is
 * the failure mode the journey documents (docs/getting-started.md:145-155).
 */
export function resolveCustomRoute(request) {
    const baseUrl = request.baseUrl.trim().replace(/\/+$/, "");
    let parsed;
    try {
        parsed = new URL(baseUrl);
    }
    catch {
        throw new Error(`--url must be an absolute URL, for example https://opencode.ai/zen/go/v1; got '${request.baseUrl}'`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("--url must be an http or https endpoint.");
    }
    const route = (request.route === "" ? routeKeyFromUrl(baseUrl) : request.route).trim().toLowerCase();
    if (!ROUTE_KEY.test(route)) {
        throw new Error(`--name must be a lowercase route key like 'opencode-zen'; got '${route}'`);
    }
    const model = request.model.trim();
    if (model === "") {
        throw new Error("--model is required: the provider-owned model id this route serves.");
    }
    const apiKeyEnv = (request.apiKeyEnv ?? "").trim() === "" ? defaultKeyEnv(route) : request.apiKeyEnv.trim();
    assertNotSecret(apiKeyEnv);
    const contextWindow = request.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (!Number.isInteger(contextWindow) || contextWindow <= 0)
        throw new Error("--context must be a positive integer.");
    if (!Number.isInteger(maxTokens) || maxTokens <= 0)
        throw new Error("--max-tokens must be a positive integer.");
    return {
        route,
        baseUrl,
        model,
        displayName: (request.displayName ?? "").trim() === "" ? route : request.displayName.trim(),
        modelName: (request.modelName ?? "").trim() === "" ? model : request.modelName.trim(),
        apiKeyEnv,
        api: (request.api ?? "").trim() === "" ? DEFAULT_API : request.api.trim(),
        contextWindow,
        maxTokens,
    };
}
/**
 * Render the two patch rows, in the exact shape and order of the block
 * verified against a live endpoint (docs/getting-started.md:103-132).
 * One YAML line per element, no trailing newline.
 */
export function renderCustomRouteLines(route) {
    return [
        "- id: llm-pi-ai",
        "  config:",
        "    providers:",
        `      ${route.route}:`,
        `        displayName: ${route.displayName}`,
        `        apiKeyEnv: ${route.apiKeyEnv}`,
        `        api: ${route.api}`,
        `        baseURL: ${route.baseUrl}`,
        "        models:",
        `          - id: ${route.model}`,
        `            name: ${route.modelName}`,
        `            contextWindow: ${route.contextWindow}`,
        `            maxTokens: ${route.maxTokens}`,
        "- id: agent-default-model",
        "  config:",
        `    provider: ${route.route}`,
        `    model: ${route.model}`,
    ];
}
/** The rendered block as one string, which is what a test compares byte-for-byte. */
export function renderCustomRouteYaml(route) {
    return renderCustomRouteLines(route).join("\n");
}
/**
 * Adapt a custom route to the `RoutePlan` shape `applyRoute` already handles,
 * so the backup, rollback, sequence check, and post-write verification are the
 * ones already pinned by tests rather than a second implementation.
 */
export function planCustomRoute(request) {
    const resolved = resolveCustomRoute(request);
    return {
        provider: resolved.route,
        rowId: `llm-pi-ai:${resolved.route}`,
        envVar: resolved.apiKeyEnv,
        lines: renderCustomRouteLines(resolved),
        applyCommand: customApplyCommand(resolved),
        selects: true,
    };
}
/**
 * The exact command that re-runs this plan with consent. Every resolved field
 * is spelled out so a user can read, edit, and re-run it, and so the preview's
 * confirmation line is never a lossy summary of what was previewed.
 */
export function customApplyCommand(route) {
    return [
        "/bridge-connect custom",
        `--url ${route.baseUrl}`,
        `--model ${route.model}`,
        `--name ${route.route}`,
        `--key-env ${route.apiKeyEnv}`,
        `--display "${route.displayName}"`,
        `--api ${route.api}`,
        `--context ${route.contextWindow}`,
        `--max-tokens ${route.maxTokens}`,
        "--apply",
    ].join(" ");
}
//# sourceMappingURL=connect-custom.js.map