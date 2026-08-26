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
import { readFileSync } from "node:fs";
import { claudeCredentialsPath, codexAuthPath, dshEnvPath, geminiOauthCredsPath, maskSecret, opencodeAuthPath, probeEnvVar, probeJsonSource, } from "../lib/paths.js";
// The apply half lives in its own module (connect-apply.ts) and reads the
// provider table from here. The import cycle is function-body only: neither
// module touches the other's bindings at module-evaluation time.
import { runConnectApply } from "./connect-apply.js";
/** Environment variables that map one-to-one onto a connector provider. */
const CONNECTOR_ENV_VARS = Object.freeze([
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
]);
/** Provider each connector env var belongs to (spec section 4 rows 2/5/8/10/11). */
const ENV_VAR_PROVIDERS = Object.freeze({
    ANTHROPIC_API_KEY: "anthropic",
    OPENAI_API_KEY: "openai",
    GEMINI_API_KEY: "google",
    DEEPSEEK_API_KEY: "deepseek",
    OPENROUTER_API_KEY: "openrouter",
});
export const PROVIDER_PROFILES = Object.freeze({
    anthropic: {
        baseUrl: "https://api.anthropic.com/v1/models",
        envVar: "ANTHROPIC_API_KEY",
        relogin: "claude /login",
    },
    openai: {
        baseUrl: "https://api.openai.com/v1/models",
        envVar: "OPENAI_API_KEY",
        relogin: "codex login",
    },
    google: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
        envVar: "GEMINI_API_KEY",
        relogin: "gemini auth login",
    },
    deepseek: { baseUrl: "https://api.deepseek.com/models", envVar: "DEEPSEEK_API_KEY" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1/models", envVar: "OPENROUTER_API_KEY" },
});
/** Providers accepted by `/connect test <provider>`, in display order. */
export const SMOKE_PROVIDERS = Object.freeze(Object.keys(PROVIDER_PROFILES));
const DEFAULT_SMOKE_TIMEOUT_MS = 3000;
// ---------------------------------------------------------------------------
// Masking boundary (connect spec S1)
// ---------------------------------------------------------------------------
/**
 * Enforce the mask on any detail string that could carry secret-shaped
 * material. Runs after upstream masks as defense in depth: a value that
 * somehow arrived raw is reduced here, and already-masked strings pass
 * through unchanged because their fragments fall under the minimum length.
 */
function maskDetail(detail) {
    return detail.replace(/[A-Za-z0-9_-]{12,}/g, (match) => `${match.slice(0, 4)}\u2026${match.slice(-4)}`);
}
/** JSON keys whose presence marks a file as OAuth-shaped (spec rows 1/4/7). */
const EXPIRY_KEYS = ["expiresAt", "expiry_date", "expires_at"];
/** Coerce a timestamp-ish JSON value into epoch milliseconds, or null. */
function coerceExpiry(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        // Heuristic: values below 1e11 are epoch seconds, above are milliseconds.
        return value < 1e11 ? value * 1000 : value;
    }
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}
/** Depth-limited search for the first expiry-shaped key in parsed JSON. */
function findTimestampKey(node, depth = 0) {
    if (depth > 4 || node === null || typeof node !== "object")
        return null;
    const record = node;
    for (const key of EXPIRY_KEYS) {
        const expiry = coerceExpiry(record[key]);
        if (expiry !== null)
            return expiry;
    }
    for (const value of Object.values(record)) {
        const nested = findTimestampKey(value, depth + 1);
        if (nested !== null)
            return nested;
    }
    return null;
}
/**
 * Probe one OAuth/key JSON source and classify expiry by shape. Values are
 * read only to locate the expiry key and never leave this function.
 */
function inspectOauthFile(path, requiredKeys) {
    const probe = probeJsonSource(path, requiredKeys);
    let verdict = null;
    if (probe.shape === "valid-shape") {
        try {
            const parsed = JSON.parse(readFileSync(path, "utf8"));
            const expiresAt = findTimestampKey(parsed);
            verdict =
                expiresAt !== null && expiresAt < Date.now() ? { kind: "oauth", expired: true } : { kind: "oauth", expired: false };
        }
        catch {
            // File changed between probe and read; classify conservatively as key material.
            verdict = { kind: "key" };
        }
    }
    return { ...probe, verdict };
}
// ---------------------------------------------------------------------------
// Detection matrix (connect spec section 4)
// ---------------------------------------------------------------------------
function row(provider, source, status, detail) {
    return { provider, source, status, detail: detail ?? "-" };
}
/** Map a metadata probe plus expiry verdict onto one matrix row. */
function fileRow(provider, label, inspected) {
    if (!inspected.exists)
        return row(provider, label, "not found");
    switch (inspected.shape) {
        case "valid-shape":
            if (inspected.verdict?.kind === "oauth") {
                return inspected.verdict.expired
                    ? row(provider, label, "expired", expiredAdvice(provider))
                    : row(provider, label, "found", "oauth token present");
            }
            return row(provider, label, "found");
        case "unparseable":
            return row(provider, label, "malformed", "invalid JSON");
        case "wrong-shape":
            return row(provider, label, "malformed", "unexpected JSON shape");
        case "over-size-limit":
            return row(provider, label, "malformed", "over 64 KiB read cap");
        default:
            return row(provider, label, "not found");
    }
}
/**
 * Copy for an `expired` row (spec section 4: expired is never selectable, and
 * the row carries the vendor re-login hint instead of an error).
 */
export function expiredAdvice(provider) {
    const relogin = PROVIDER_PROFILES[provider]?.relogin;
    return relogin === undefined ? "oauth token expired" : `oauth token expired; re-run: ${relogin}`;
}
/**
 * One environment-variable row. Placeholder-like values (E9: under 12 chars
 * or obvious template text) report `malformed` instead of `found`.
 */
function envRow(provider, name, env) {
    const probe = probeEnvVar(name, env);
    if (!probe.present)
        return row(provider, `$${name}`, "not found");
    const value = env[name] ?? "";
    if (value.length < 12 || /your[-_]?key|placeholder|example|changeme/i.test(value)) {
        return row(provider, `$${name}`, "malformed", "placeholder-like value");
    }
    return row(provider, `$${name}`, "found", maskDetail(probe.masked));
}
/** Row 3: gateway variables. The base URL is not secret and shows in full. */
function proxyRow(env) {
    const authToken = env["ANTHROPIC_AUTH_TOKEN"];
    const baseUrl = env["ANTHROPIC_BASE_URL"];
    if (authToken === undefined || authToken.trim() === "") {
        return row("anthropic", "$ANTHROPIC_AUTH_TOKEN", "not found");
    }
    let detail = maskDetail(maskSecret(authToken));
    if (baseUrl !== undefined && baseUrl.trim() !== "") {
        try {
            detail += ` via ${new URL(baseUrl).host}`;
        }
        catch {
            detail += " via <unparseable base url>";
        }
    }
    return row("anthropic", "$ANTHROPIC_AUTH_TOKEN", "found", detail);
}
/**
 * Row 9: OpenCode's multi-provider map, expanded to one row per provider
 * entry tagged `via opencode`. Entries degrade individually (E5); a broken
 * file degrades to a single malformed row showing the path, never contents.
 */
function opencodeRows(path) {
    const probe = probeJsonSource(path, []);
    if (!probe.exists)
        return [row("opencode", "opencode auth.json", "not found")];
    if (probe.shape === "over-size-limit")
        return [row("opencode", "opencode auth.json", "malformed", "over 64 KiB read cap")];
    if (probe.shape === "unavailable")
        return [row("opencode", "opencode auth.json", "unreadable")];
    if (probe.shape === "unparseable")
        return [row("opencode", "opencode auth.json", "malformed", "invalid JSON")];
    if (probe.shape !== "valid-shape") {
        return [row("opencode", "opencode auth.json", "malformed", "unexpected JSON shape")];
    }
    let entries;
    try {
        entries = Object.entries(JSON.parse(readFileSync(path, "utf8")));
    }
    catch {
        return [row("opencode", "opencode auth.json", "malformed", "invalid JSON")];
    }
    const rows = [];
    for (const [entryName, value] of entries) {
        const entry = (value ?? {});
        const keyValue = entry["key"];
        const accessValue = entry["access"];
        if (typeof keyValue !== "string" && typeof accessValue !== "string")
            continue;
        const rawMasked = maskSecret(typeof keyValue === "string" ? keyValue : accessValue);
        const providerName = ENV_VAR_PROVIDERS[`${entryName.toUpperCase()}_API_KEY`] ?? "opencode";
        rows.push(row(providerName, `${entryName} via opencode`, "found", maskDetail(rawMasked)));
    }
    if (rows.length === 0) {
        return [row("opencode", "opencode auth.json", "malformed", "no usable provider entries")];
    }
    return rows;
}
/** Row 13 (DSH half): report which connector key names the dotenv defines. Names only, never values. */
function dotenvRow(path) {
    const probe = probeJsonSource(path, []);
    if (!probe.exists)
        return row("any", "~/.dsh/.env", "not found");
    if (probe.shape === "over-size-limit")
        return row("any", "~/.dsh/.env", "malformed", "over 64 KiB read cap");
    let contents;
    try {
        contents = readFileSync(path, "utf8");
    }
    catch (error) {
        const code = error?.code;
        return row("any", "~/.dsh/.env", code === "EACCES" || code === "EPERM" ? "unreadable" : "malformed");
    }
    const definedNames = CONNECTOR_ENV_VARS.filter((name) => new RegExp(`^\\s*${name}\\s*=\\s*\\S`).test(contents));
    if (definedNames.length === 0)
        return row("any", "~/.dsh/.env", "not found", "no connector keys");
    return row("any", "~/.dsh/.env", "found", `defines ${definedNames.join(", ")}`);
}
/**
 * Scan every documented source. No network, no writes; rows carry masked
 * display strings only. `env` is injected so tests run hermetically.
 */
export function detectCredentials(ctx, env = process.env) {
    const home = ctx.paths.home;
    const rows = [];
    // Row 1: Claude Code OAuth file.
    rows.push(fileRow("anthropic", "~/.claude/.credentials.json", inspectOauthFile(claudeCredentialsPath(home), ["claudeAiOauth"])));
    // Rows 2/5/8/10/11: environment API keys.
    for (const name of CONNECTOR_ENV_VARS) {
        rows.push(envRow(ENV_VAR_PROVIDERS[name] ?? "custom", name, env));
    }
    // Row 3: proxy/gateway setup.
    rows.push(proxyRow(env));
    // Row 4: Codex CLI auth, OAuth or static key member.
    rows.push(fileRow("openai", "~/.codex/auth.json", inspectOauthFile(codexAuthPath(home), ["tokens"])));
    // Row 7: Gemini CLI OAuth cache.
    rows.push(fileRow("google", "~/.gemini/oauth_creds.json", inspectOauthFile(geminiOauthCredsPath(home), ["access_token"])));
    // Row 9: OpenCode auth map, expanded per provider entry.
    rows.push(...opencodeRows(opencodeAuthPath(home)));
    // Row 13 (DSH half): ~/.dsh/.env key names. The project ./ .env half waits
    // for the trusted-project-root rule before it is safe to scan.
    rows.push(dotenvRow(dshEnvPath(ctx.paths.dshHome)));
    return rows;
}
// ---------------------------------------------------------------------------
// Next-step guidance (connect spec 6.6)
// ---------------------------------------------------------------------------
/**
 * What the user should do next for one provider: which env var to export and
 * which DSH profile file to open. Derived from the provider table and the
 * matrix statuses only, so no secret can influence, or leak into, the text.
 */
export function nextSteps(ctx, provider, rows) {
    const profile = PROVIDER_PROFILES[provider];
    if (profile === undefined)
        return [];
    const own = rows.filter((matrixRow) => matrixRow.provider === provider);
    const steps = [];
    if (own.some((matrixRow) => matrixRow.status === "found")) {
        steps.push(`Credential detected. Preview the route: /bridge-connect apply ${provider}`);
        steps.push(`Verify reachability first: /bridge-connect test ${provider}`);
        return steps;
    }
    if (own.some((matrixRow) => matrixRow.status === "expired") && profile.relogin !== undefined) {
        steps.push(`Token expired. Refresh it with the vendor CLI: ${profile.relogin}`);
    }
    steps.push(`Export a key, then re-run /bridge-connect: export ${profile.envVar}=<your key>`);
    steps.push(`Routes live in ${ctx.paths.profilePatch} (profile ${ctx.profile}); dsh-bridge writes an env-var reference there, never the value.`);
    return steps;
}
/** Guidance for every provider that currently has no usable credential. */
export function unmetProviders(rows) {
    return SMOKE_PROVIDERS.filter((provider) => !rows.some((matrixRow) => matrixRow.provider === provider && matrixRow.status === "found"));
}
// ---------------------------------------------------------------------------
// Matrix rendering (connect spec 6.1)
// ---------------------------------------------------------------------------
export function renderMatrix(ctx, rows) {
    const table = ctx.output.table(["PROVIDER", "SOURCE", "STATUS", "DETAIL"], rows.map((matrixRow) => [matrixRow.provider, matrixRow.source, matrixRow.status, matrixRow.detail]));
    const missing = unmetProviders(rows);
    const guidance = missing.length === 0
        ? []
        : ["Next steps:", "", ...missing.flatMap((provider) => nextSteps(ctx, provider, rows).map((step) => `- ${provider}: ${step}`)), ""];
    return [
        "### /connect - connectors",
        "",
        table,
        `profile: ${ctx.profile}`,
        "",
        "Values are masked. dsh-bridge never reads a secret into the transcript,",
        "and never copies one into configuration. Routes reference env vars only.",
        "",
        ...guidance,
        "Preview a route with `/bridge-connect apply <provider>`; add `--apply`",
        "to write it. Routes reference env vars, never key values.",
    ].join("\n");
}
/**
 * HEAD the provider base URL with no Authorization header, so the request
 * carries nothing secret by construction. Any HTTP answer (including 401)
 * counts as reachable: the point is that the endpoint is routable from here.
 * Offline machines resolve to a plain unreachable verdict, never a throw.
 */
export async function smokeProvider(provider, options = {}) {
    const profile = PROVIDER_PROFILES[provider];
    if (profile === undefined) {
        throw new Error(`unknown provider '${provider}' (expected one of ${SMOKE_PROVIDERS.join(", ")})`);
    }
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    if (doFetch === undefined) {
        return { ok: false, target: profile.baseUrl, detail: "no HTTP client available in this runtime" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
        const response = await doFetch(profile.baseUrl, { method: "HEAD", signal: controller.signal });
        return {
            ok: true,
            target: profile.baseUrl,
            status: response.status,
            detail: `HTTP ${response.status} in ${Date.now() - startedAt} ms (no auth header sent)`,
        };
    }
    catch (error) {
        // Offline, DNS failure, proxy block, timeout: all the same user-facing fact.
        const code = error?.code;
        return {
            ok: false,
            target: profile.baseUrl,
            detail: `unreachable${code === undefined ? "" : ` (${code})`}; check network access or a proxy`,
        };
    }
    finally {
        clearTimeout(timer);
    }
}
export function renderSmoke(ctx, provider, outcome) {
    const fields = [
        ["endpoint", outcome.target],
        ["request", "HEAD, no Authorization header"],
        ["result", outcome.detail],
        ["verdict", outcome.ok ? "reachable" : "unreachable"],
    ];
    const followUp = outcome.ok
        ? []
        : ["", "Detection still works offline: run /bridge-connect to see the matrix."];
    return [
        `### /connect test - ${provider}`,
        "",
        ctx.output.card(`Reachability - ${provider}`, fields),
        ...followUp,
    ].join("\n");
}
export function parseConnectArgs(args) {
    const verb = (args["_"] ?? "").toLowerCase();
    if (verb === "")
        return { mode: "list" };
    if (verb === "apply") {
        const provider = (args["rest"] ?? "").trim().split(/\s+/)[0] ?? "";
        if (provider === "" || provider.startsWith("-")) {
            throw new Error(`usage: /connect apply <provider> [--apply] (${SMOKE_PROVIDERS.join(", ")})`);
        }
        // `--apply` is the explicit consent; its presence, not its value, decides.
        return { mode: "apply", provider: provider.toLowerCase(), confirmed: args["apply"] !== undefined };
    }
    if (verb === "test") {
        const provider = (args["rest"] ?? "").trim().split(/\s+/)[0] ?? "";
        if (provider === "") {
            throw new Error(`usage: /connect test <provider> (${SMOKE_PROVIDERS.join(", ")})`);
        }
        return { mode: "test", provider: provider.toLowerCase() };
    }
    if (PROVIDER_PROFILES[verb] === undefined) {
        throw new Error(`usage: /connect [test <provider>] [apply <provider> [--apply]]; got '${verb}'`);
    }
    return { mode: "list", provider: verb };
}
/** Phase-1 runner: detection matrix by default; `test <provider>` for the smoke. */
export async function runConnect(ctx, args) {
    // parseConnectArgs throws on a bad invocation (its contract, pinned by
    // tests). A slash command must still render a body rather than surface a
    // raw exception, so the usage error becomes normal output here.
    let invocation;
    try {
        invocation = parseConnectArgs(args);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            markdown: [
                "### /bridge-connect",
                "",
                detail,
                "",
                `Providers: ${Object.keys(PROVIDER_PROFILES).sort().join(", ")}.`,
                "",
                "Run bare to see every detected credential: `/bridge-connect`.",
                "",
            ].join("\n"),
        };
    }
    if (invocation.mode === "apply") {
        return runConnectApply(ctx, invocation.provider, invocation.confirmed === true);
    }
    if (invocation.mode === "test") {
        const provider = invocation.provider;
        const outcome = await smokeProvider(provider);
        return {
            markdown: renderSmoke(ctx, provider, outcome),
            data: { kind: "connect.smoke", provider, ok: outcome.ok, target: outcome.target, status: outcome.status },
        };
    }
    const all = detectCredentials(ctx);
    const rows = invocation.provider === undefined ? all : all.filter((matrixRow) => matrixRow.provider === invocation.provider);
    return {
        markdown: renderMatrix(ctx, rows),
        data: { kind: "connect.matrix", profile: ctx.profile, rows },
    };
}
/** Registry descriptor. Mounted over the registry stub via MOUNT(connect). */
export const connectCommand = {
    name: "bridge-connect",
    aliases: [],
    summary: "Detect local provider credentials and report them masked",
    usage: "[provider] [test <provider>] [apply <provider> [--apply]]",
    run: runConnect,
};
//# sourceMappingURL=connect.js.map