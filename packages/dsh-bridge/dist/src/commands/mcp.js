/**
 * /bridge-mcp - MCP server management (docs/specs/commands/mcp.md).
 *
 * MVP slice, per the task contract (docs/reviews/eng-quality-review.md #1):
 *  - list / add / remove / test / import-from subcommands over the
 *    bridge-owned JSON store at `$HOME/.dsh-bridge/mcp.json` (same precedent
 *    as memory.ts; the shape mirrors the plugin instance list documented in
 *    packages/mcp/mcp-client/README.md).
 *  - add / remove write ONLY the bridge store. DSH reads MCP servers from the
 *    user's profile patch (cordis.patch.yml); when a native registration is
 *    still needed, the exact YAML fragment is emitted as a copy-paste block
 *    with paste instructions. The user's patch file is never opened for
 *    writing by this module.
 *  - Old MCP entries inside the profile patch are detected read-only and
 *    reported with move instructions (migration notice on list/add/remove).
 *  - import-from claude reads ~/.claude.json `mcpServers` (plus
 *    projects.<cwd>.mcpServers): existence + parse checks only; conversion is
 *    reported as a mapping table, nothing is written to source configs.
 *  - test emits the spec's handshake checklist (phases 0-5) as guidance;
 *    no process spawn or network call happens in this iteration.
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - Never echo secret values; env/header values are redacted to
 *    {"$env":"NAME"} in JSON and masked in rendered tables.
 *  - Mutating commands print the absolute store path before writing
 *    (acceptance 34) and honor --dry-run (nothing written).
 *  - Every DSH-behavior claim cites the reference checkout (acceptance 35).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { card, heading, table } from "../lib/output.js";
/** The two transports DSH supports (mcp-client/src/index.ts:107-121). */
export const TRANSPORTS = ["stdio", "streamable-http"];
/** serverName grammar (reference checkout mcp-client/src/index.ts:37). */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Longest stdio target string shown per row before clipping. */
const TARGET_WIDTH = 60;
/** Default toolCallTimeoutMs (reference checkout mcp-client/src/index.ts:34). */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
/** Typed failure surfaced as an error result by the registry runner. */
export class McpError extends Error {
}
/** Node-backed io; the only place real fs calls happen in this module. */
export function nodeMcpIo() {
    return {
        exists: (path) => existsSync(path),
        readFile: (path) => readFileSync(path, "utf8"),
        writeFile: (path, content) => {
            // Bridge-owned store only: create the parent directory like memory.ts
            // does, and keep the file private (env values are stored verbatim).
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
        },
    };
}
// ---------------------------------------------------------------------------
// Bridge-owned store location (memory.ts precedent: never a native DSH path)
// ---------------------------------------------------------------------------
/** Directory the bridge owns for MCP state. Never a native DSH path. */
export function mcpStoreDir(home) {
    return join(home, ".dsh-bridge");
}
/** The single bridge-managed MCP store file. */
export function mcpStorePath(home) {
    return join(mcpStoreDir(home), "mcp.json");
}
// ---------------------------------------------------------------------------
// Store load / save (JSON only; the profile patch stays YAML, untouched)
// ---------------------------------------------------------------------------
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Read instances out of the bridge store. Absent file means empty config. */
export function loadInstances(io, storePath) {
    if (!io.exists(storePath))
        return [];
    let raw;
    try {
        raw = io.readFile(storePath);
    }
    catch (error) {
        throw new McpError(`store not readable: ${storePath} (${error.message})`);
    }
    if (raw.trim() === "")
        return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new McpError(`store is not valid JSON: ${storePath}`);
    }
    if (!isRecord(parsed))
        throw new McpError(`store root must be an object: ${storePath}`);
    const servers = parsed["servers"];
    if (servers === undefined)
        return [];
    if (!Array.isArray(servers))
        throw new McpError(`"servers" must be an array of instances: ${storePath}`);
    const entries = [];
    for (const rawEntry of servers) {
        if (!isRecord(rawEntry))
            continue;
        const config = rawEntry["config"];
        const serverName = isRecord(config) ? config["serverName"] : undefined;
        if (typeof rawEntry["id"] !== "string" || typeof serverName !== "string" || !isRecord(config))
            continue;
        entries.push({
            id: rawEntry["id"],
            name: "@deepseek-ai/dsh-mcp-client",
            config: config,
        });
    }
    return entries;
}
function writeInstances(io, storePath, entries) {
    const body = {
        schema: "dsh-bridge.mcp/v1",
        servers: entries.map((entry) => ({ id: entry.id, name: entry.name, config: entry.config })),
    };
    io.writeFile(storePath, `${JSON.stringify(body, null, 2)}\n`);
}
// ---------------------------------------------------------------------------
// Pure helpers (validation, normalization, redaction)
// ---------------------------------------------------------------------------
/** Validate against the parts of the dsh-mcp-client schema this file knows. */
export function validateInstance(entry) {
    const config = entry.config;
    if (!SERVER_NAME_PATTERN.test(config.serverName)) {
        return `serverName must match ${SERVER_NAME_PATTERN.source}`;
    }
    if (!TRANSPORTS.includes(config.transport)) {
        return `transport must be one of ${TRANSPORTS.join(" | ")}`;
    }
    if (config.transport === "stdio" && typeof config.command !== "string") {
        return `stdio transport requires "command"`;
    }
    if (config.transport === "streamable-http" && typeof config.url !== "string") {
        return `streamable-http transport requires "url"`;
    }
    return null;
}
/** Claude object key -> legal DSH serverName (spec mapping table). */
export function normalizeServerName(rawKey, taken) {
    let candidate = rawKey.replace(/[.: ]/g, "-");
    if (candidate.length > 32)
        candidate = candidate.slice(0, 32);
    if (!/^[A-Za-z0-9_-]+$/.test(candidate))
        candidate = "unnamed";
    let final = candidate;
    let suffix = 2;
    while (taken.has(final)) {
        final = `${candidate}-${suffix}`;
        suffix += 1;
    }
    return { name: final, renamed: final !== rawKey };
}
/** True when a string looks like a live credential (spec add-validation 5). */
export function secretShaped(value) {
    if (typeof value !== "string")
        return false;
    if (/^(sk|ghp|github_pat|xoxb|xoxp)[-_]/i.test(value))
        return true;
    if (value.startsWith("Bearer "))
        return true;
    return /^[A-Za-z0-9+/=_-]{24,}$/.test(value);
}
/** Redacted copy of an instance's config for display payloads. */
export function redactConfig(config) {
    const clone = { ...config };
    for (const key of ["env", "headers"]) {
        const section = clone[key];
        if (!isRecord(section))
            continue;
        const redacted = {};
        for (const [name, value] of Object.entries(section)) {
            redacted[name] =
                value === "" || value === undefined || value === null
                    ? ""
                    : { "$env": typeof value === "object" ? "[complex]" : `[redacted:${String(value).length} chars]` };
        }
        clone[key] = redacted;
    }
    return clone;
}
function targetCell(entry) {
    const config = entry.config;
    const rawTarget = config.transport === "stdio"
        ? [config.command ?? "", ...(config.args ?? [])].join(" ").trim()
        : (config.url ?? "");
    return rawTarget.length <= TARGET_WIDTH ? rawTarget : `${rawTarget.slice(0, TARGET_WIDTH - 3)}...`;
}
function notesCell(entry) {
    const notes = [];
    if (entry.config.failOnStartupError === true)
        notes.push("failOnStartupError");
    if (typeof entry.config.toolCallTimeoutMs === "number" &&
        entry.config.toolCallTimeoutMs !== DEFAULT_TOOL_CALL_TIMEOUT_MS) {
        notes.push(`toolCallTimeoutMs=${entry.config.toolCallTimeoutMs}`);
    }
    return notes.length > 0 ? notes.join(", ") : "";
}
function findByName(entries, name) {
    return entries.find((entry) => entry.config.serverName.toLowerCase() === name.toLowerCase());
}
function usageMarkdown() {
    return [
        heading("/bridge-mcp"),
        "Usage:",
        "- `/bridge-mcp list [--profile <name>]`",
        "- `/bridge-mcp add <name> stdio <command> [args...]`",
        "- `/bridge-mcp add <name> http <url>`",
        "- `/bridge-mcp remove <name> [--yes] [--dry-run]`",
        "- `/bridge-mcp test [<name> | --all]`",
        "- `/bridge-mcp import-from claude`",
        "",
        "Transports: stdio | streamable-http (packages/mcp/mcp-client/src/index.ts:107-121).",
        "DSH has no sse transport; see the import mapping notes.",
        "",
        "Storage: servers live in the bridge-owned store (~/.dsh-bridge/mcp.json).",
        "Your profile patch is never written; add/remove print a yaml fragment to paste.",
        "",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function renderList(entries, duplicates) {
    const rows = entries.map((entry) => [
        entry.config.serverName,
        entry.config.transport,
        targetCell(entry),
        entry.id,
        `mcp__${entry.config.serverName}__`,
        notesCell(entry),
    ]);
    const sections = [heading("/bridge-mcp list"), ""];
    if (entries.length === 0) {
        sections.push("No MCP servers configured.", "", "Next commands:", "- `/bridge-mcp add <name> stdio <command> [args...]`", "- `/bridge-mcp import-from claude`", "");
    }
    else {
        sections.push(table(["NAME", "TRANSPORT", "TARGET", "ID", "TOOL PREFIX", "NOTES"], rows));
    }
    if (duplicates.length > 0) {
        sections.push(`ERROR: duplicate serverName across instances - DSH fails the later instance at load`, `(packages/mcp/mcp-client/src/index.ts:45): ${duplicates.join(", ")}`, "");
    }
    return {
        markdown: sections.join("\n"),
        data: { servers: entries.map((entry) => ({ ...entry, config: redactConfig(entry.config) })) },
    };
}
function yamlishBlock(entry) {
    const c = entry.config;
    const lines = [`- id: ${entry.id}`, "  name: '@deepseek-ai/dsh-mcp-client'", "  config:"];
    lines.push(`    serverName: ${c.serverName}`);
    lines.push(`    transport: ${c.transport}`);
    if (c.transport === "stdio")
        lines.push(`    command: ${c.command ?? ""}`);
    if ((c.args?.length ?? 0) > 0)
        lines.push(`    args: [${(c.args ?? []).map((arg) => `'${arg}'`).join(", ")}]`);
    if (typeof c.cwd === "string")
        lines.push(`    cwd: ${c.cwd}`);
    if (c.transport === "streamable-http")
        lines.push(`    url: ${c.url ?? ""}`);
    const envNames = Object.keys(c.env ?? {});
    if (envNames.length > 0) {
        lines.push("    env:");
        for (const key of envNames) {
            const value = (c.env ?? {})[key];
            lines.push(`      ${key}: ${secretShaped(value) ? "!!js process.env." + key : String(value)}`);
        }
    }
    const headerNames = Object.keys(c.headers ?? {});
    if (headerNames.length > 0) {
        lines.push("    headers:");
        for (const key of headerNames) {
            const value = (c.headers ?? {})[key];
            lines.push(`      ${key}: ${secretShaped(value) ? "!!js '`Bearer ${process.env." + key + "}`" : String(value)}`);
        }
    }
    return lines;
}
/**
 * Copy-paste instructions that accompany a yaml block. The user pastes the
 * fragment into their own profile patch; this module never writes it.
 */
function pasteInstructions() {
    return [
        "To register with DSH natively, copy the yaml block above into your profile patch:",
        "paste under the top-level list in the active profile's cordis.patch.yml",
        "(default: ~/.dsh/profiles/<profile>/cordis.patch.yml).",
        "The bridge never edits that file; this step is yours.",
        "",
    ];
}
function renderPreview(action, storePath, entry) {
    return [
        heading(`/bridge-mcp ${action}`),
        `Store target: ${storePath}`,
        "",
        "```yaml",
        ...yamlishBlock(entry),
        "```",
        "",
    ].join("\n");
}
/**
 * Detect MCP server instances inside the user's cordis.patch.yml without ever
 * writing to it. The patch is a YAML document; this scan is deliberately
 * line-based so no YAML parser dependency enters the bridge. A list item is
 * reported when it carries the mcp-client name or a serverName field. Parse
 * trouble degrades to an honest note rather than an exception.
 */
export function detectPatchEntries(io, patchPath) {
    if (!io.exists(patchPath))
        return { patchPath, entries: [] };
    let raw = "";
    try {
        raw = io.readFile(patchPath);
    }
    catch (error) {
        return { patchPath, entries: [], error: error.message };
    }
    const lines = raw.split(/\r?\n/);
    const entries = [];
    let index = -1;
    let depth = 0; // fence depth for ``` blocks
    let currentName = "";
    let matched = false;
    const flush = () => {
        if (index >= 0 && matched && currentName !== "") {
            entries.push({ serverName: currentName, index });
        }
        matched = false;
        currentName = "";
    };
    for (const rawLine of lines) {
        const line = rawLine.replace(/[ \t]+$/, "");
        if (/^\s*```/.test(line)) {
            depth += depth > 0 ? -1 : 1;
            continue;
        }
        if (depth > 0 || /^\s*#/.test(line))
            continue;
        const itemMatch = /^-\s*(.*)$/.exec(line);
        if (itemMatch !== null) {
            // Top-level list item boundary.
            flush();
            index += 1;
            const body = itemMatch[1] ?? "";
            if (/['"]?@deepseek-ai\/dsh-mcp-client/.test(body))
                matched = true;
            const nameMatch = /(?:^|[\s{[])serverName:\s*['"]?([A-Za-z0-9_.:-]+)/.exec(` ${body}`);
            if (nameMatch !== null) {
                currentName = nameMatch[1] ?? "";
                matched = true;
            }
            continue;
        }
        if (index < 0)
            continue;
        const nameMatch = /(?:^|[\s{[])serverName:\s*['"]?([A-Za-z0-9_.:-]+)/.exec(` ${line.trim()}`);
        if (nameMatch === null)
            continue;
        if (currentName === "") {
            currentName = nameMatch[1] ?? "";
            matched = true;
        }
    }
    flush();
    return { patchPath, entries };
}
/** User-facing migration notice lines when legacy patch entries exist. */
function migrationNotice(migration) {
    if (migration.entries.length === 0)
        return [];
    const names = migration.entries.map((entry) => entry.serverName).join(", ");
    return [
        `Migration available: ${migration.entries.length} MCP entr${migration.entries.length === 1 ? "y" : "ies"} found in your profile patch (${names}).`,
        `File: ${migration.patchPath}`,
        "To move them:",
        "1. Remove each entry from the patch file by hand (the bridge never edits it).",
        "2. Re-add here with `/bridge-mcp add <name> stdio|http ...` - the same fields apply verbatim.",
        "3. Verify with `/bridge-mcp list`.",
        "",
    ];
}
function runList(ctx) {
    const io = nodeMcpIo();
    const entries = loadInstances(io, mcpStorePath(ctx.paths.home));
    const seen = new Map();
    for (const entry of entries) {
        const key = entry.config.serverName.toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
    const rendered = renderList(entries, duplicates);
    const migration = detectPatchEntries(io, ctx.paths.profilePatch);
    const noticeLines = migrationNotice(migration);
    if (noticeLines.length === 0)
        return rendered;
    return {
        markdown: [rendered.markdown, ...noticeLines].join("\n"),
        data: rendered.data,
    };
}
function buildAddEntry(inputs) {
    if (!SERVER_NAME_PATTERN.test(inputs.name)) {
        return `server name must match ${SERVER_NAME_PATTERN.source}; got "${inputs.name}"`;
    }
    const kind = inputs.transportWord.toLowerCase();
    if (kind === "sse") {
        return [
            "DSH has no sse transport - only stdio and streamable-http",
            "(packages/mcp/mcp-client/src/index.ts:107-121). Many servers advertised as SSE also serve",
            "Streamable HTTP at the same URL. Try `http <url>`, then run `/bridge-mcp test`.",
        ].join(" ");
    }
    if (kind === "stdio" || kind === "") {
        const [command, ...args] = inputs.rest;
        if (command === undefined)
            return `stdio add needs a command: /bridge-mcp add <name> stdio <command> [args...]`;
        const entry = {
            id: `mcp-${inputs.name}`,
            name: "@deepseek-ai/dsh-mcp-client",
            config: { serverName: inputs.name, transport: "stdio", command, args },
        };
        return entry;
    }
    if (kind === "http" || kind === "streamable-http") {
        const [url] = inputs.rest;
        if (url === undefined)
            return `http add needs a url: /bridge-mcp add <name> http <url>`;
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            return `not a valid URL: "${url}"`;
        }
        const loopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
        if (parsed.protocol === "http:" && !loopback && !inputs.allowInsecureHttp) {
            return `plain http is allowed only for localhost/loopback; use https or pass --allow-insecure-http`;
        }
        const entry = {
            id: `mcp-${inputs.name}`,
            name: "@deepseek-ai/dsh-mcp-client",
            config: { serverName: inputs.name, transport: "streamable-http", url },
        };
        return entry;
    }
    return `unknown transport "${inputs.transportWord}"; use stdio or http`;
}
function runAdd(ctx, args, tokens) {
    const name = tokens[0];
    if (name === undefined)
        return { markdown: usageMarkdown() };
    const inputs = {
        name,
        transportWord: tokens[1] ?? "",
        rest: tokens.slice(2),
        dryRun: args["dry-run"] !== undefined,
        allowInsecureHttp: args["allow-insecure-http"] !== undefined,
    };
    const built = buildAddEntry(inputs);
    if (typeof built === "string")
        return { markdown: [heading("/bridge-mcp add"), "", built, ""].join("\n") };
    const io = nodeMcpIo();
    const storePath = mcpStorePath(ctx.paths.home);
    const existing = loadInstances(io, storePath);
    if (findByName(existing, built.config.serverName) !== undefined) {
        return {
            markdown: [
                heading("/bridge-mcp add"),
                "",
                `Refused: serverName "${built.config.serverName}" already exists in ${storePath};`,
                "DSH fails duplicate names at load. Remove it first with /bridge-mcp remove, or pick another name.",
                "",
            ].join("\n"),
        };
    }
    const markdown = [renderPreview("add", storePath, built)];
    if (inputs.dryRun) {
        markdown.push("Dry run: nothing was written.", "");
    }
    else {
        writeInstances(io, storePath, [...existing, built]);
        markdown.push(`Wrote 1 instance to the bridge store. Next: /bridge-mcp test ${built.config.serverName}`, "");
        markdown.push(...pasteInstructions());
    }
    const migrationLines = migrationNotice(detectPatchEntries(io, ctx.paths.profilePatch));
    return { markdown: markdown.concat(migrationLines).join("\n"), data: { written: !inputs.dryRun, store: storePath } };
}
function nearMatches(entries, name) {
    const needle = name.toLowerCase();
    return entries
        .map((entry) => entry.config.serverName)
        .filter((candidate) => candidate.toLowerCase().includes(needle))
        .slice(0, 5);
}
function runRemove(ctx, args, tokens) {
    const name = tokens[0];
    if (name === undefined)
        return { markdown: usageMarkdown() };
    const io = nodeMcpIo();
    const storePath = mcpStorePath(ctx.paths.home);
    const existing = loadInstances(io, storePath);
    const victim = findByName(existing, name);
    if (victim === undefined) {
        const matches = nearMatches(existing, name);
        const hint = matches.length > 0 ? ` Near matches: ${matches.join(", ")}.` : "";
        return {
            markdown: [heading("/bridge-mcp remove"), "", `Unknown server "${name}".${hint}`, ""].join("\n"),
        };
    }
    const markdown = [renderPreview("remove", storePath, victim)];
    if (args["dry-run"] !== undefined) {
        markdown.push("Dry run: nothing was written.", "");
        return { markdown: markdown.join("\n"), data: { written: false } };
    }
    if (args["yes"] === undefined && args["y"] === undefined) {
        markdown.push("Confirmation required: re-run with --yes to delete exactly this instance.", "");
        markdown.push("Note: disposal unregisters that server's tools and frees the serverName;", "env vars, credential files, and installed packages are never touched.", "");
        return { markdown: markdown.join("\n"), data: { written: false } };
    }
    writeInstances(io, storePath, existing.filter((entry) => entry.id !== victim.id));
    markdown.push(`Removed 1 instance from the bridge store: ${storePath}`, "");
    markdown.push(...pasteInstructions());
    const migrationLines = migrationNotice(detectPatchEntries(io, ctx.paths.profilePatch));
    return { markdown: markdown.concat(migrationLines).join("\n"), data: { written: true, store: storePath } };
}
/** The checklist emitted by /bridge-mcp test in this iteration. */
export function handshakeChecklist() {
    return [
        {
            phase: "0. Resolve",
            action: "Read the entry from the target config; validate against the DSH Config schema",
            passCondition: "Schema-valid; serverName unique (src/index.ts:107-121)",
        },
        {
            phase: "1. Spawn / reach",
            action: "stdio: spawn command+args under the scrubbed parent env plus env (transport.ts:16-22); http: open StreamableHTTPClientTransport",
            passCondition: "Process starts / socket opens",
        },
        {
            phase: "2. Initialize",
            action: "MCP initialize handshake",
            passCondition: "Protocol version + capabilities returned before the deadline",
        },
        {
            phase: "3. Discover",
            action: "tools/list, following pagination cursors",
            passCondition: "A tool list returns (empty passes with a warning)",
        },
        {
            phase: "4. Name projection",
            action: "Compute mcp__<name>__<rawName>, applying 64-char/[A-Za-z0-9_-] normalization plus the 12-hex hash",
            passCondition: "No collisions after projection (README Tool naming)",
        },
        {
            phase: "5. Teardown",
            action: "Disconnect, kill child, reap",
            passCondition: "Clean exit; a child ignoring termination is reported",
        },
    ];
}
function renderTest(entries, targets) {
    const phases = handshakeChecklist();
    const rows = phases.map((phase) => [phase.phase, phase.action, phase.passCondition]);
    const names = targets.length === 0 ? entries.map((entry) => entry.config.serverName) : targets;
    const markdown = [
        heading("/bridge-mcp test"),
        "",
        `Handshake checklist for: ${names.length > 0 ? names.join(", ") : "(no servers configured)"}`,
        "",
        table(["PHASE", "ACTION", "PASS CONDITION"], rows),
        "Verdict vocabulary: ok | ok (warnings) | unreachable | handshake-failed | no-tools |",
        "name-collision | timeout | config-invalid.",
        "",
        "This iteration prints the checklist only; it spawns no processes and makes no network",
        "calls. Live verification lands with the connection runtime slice.",
        "",
    ].join("\n");
    return { markdown, data: { phases: [...phases], tested: [...names] } };
}
function claudeConfigCandidates(home, cwd) {
    return [`${home}/.claude.json`, `${cwd}/.mcp.json`, `${cwd}/.claude/mcp.json`];
}
/**
 * Parse the first readable Claude config into named server records.
 * Existence + parse only; values are never echoed.
 */
export function readClaudeServers(io, home, cwd) {
    const candidates = claudeConfigCandidates(home, cwd);
    const sourcesProbed = candidates.map((path) => [path, io.exists(path)]);
    for (const path of candidates) {
        if (!io.exists(path))
            continue;
        let parsed;
        try {
            parsed = JSON.parse(io.readFile(path));
        }
        catch (error) {
            return {
                plan: { rows: [], notCarriedOver: [], sourcesProbed, error: `source unparseable: ${path} (${error.message})` },
                servers: new Map(),
            };
        }
        const servers = new Map();
        if (isRecord(parsed)) {
            const top = parsed["mcpServers"];
            if (isRecord(top)) {
                for (const [key, value] of Object.entries(top)) {
                    if (isRecord(value))
                        servers.set(key, value);
                }
            }
            const projects = parsed["projects"];
            if (isRecord(projects)) {
                const project = projects[cwd];
                if (isRecord(project)) {
                    const scoped = project["mcpServers"];
                    if (isRecord(scoped)) {
                        for (const [key, value] of Object.entries(scoped)) {
                            if (isRecord(value))
                                servers.set(key, value);
                        }
                    }
                }
            }
        }
        return { plan: { rows: [], notCarriedOver: [], sourcesProbed }, servers };
    }
    return { plan: { rows: [], notCarriedOver: [], sourcesProbed }, servers: new Map() };
}
/** Build the import plan (no writes anywhere, including the target). */
export function planClaudeImport(servers, existing) {
    const rows = [];
    const notCarriedOver = [];
    const taken = new Set(existing.map((entry) => entry.config.serverName));
    const sortedKeys = [...servers.keys()].sort();
    for (const key of sortedKeys) {
        const record = servers.get(key);
        if (record === undefined)
            continue;
        const type = record["type"];
        const disabled = record["disabled"] === true;
        if (disabled) {
            rows.push({ sourceName: key, decision: "skip", reason: "disabled upstream" });
            continue;
        }
        if (type === "sse") {
            rows.push({
                sourceName: key,
                decision: "skip",
                reason: "sse unsupported by DSH (no such transport); hint: try http at the same URL, then /bridge-mcp test",
            });
            continue;
        }
        const normalized = normalizeServerName(key, taken);
        if (normalized.renamed) {
            notCarriedOver.push(`${key}: serverName normalized to ${normalized.name}`);
        }
        taken.add(normalized.name);
        const conflict = findByName(existing, normalized.name) !== undefined;
        rows.push({
            sourceName: key,
            decision: conflict ? "conflict" : "import",
            reason: conflict ? `name collides with existing DSH entry ${normalized.name}` : `-> serverName ${normalized.name}`,
        });
        for (const field of ["tools", "allowedTools", "scope", "shared"]) {
            if (record[field] !== undefined)
                notCarriedOver.push(`${key}.${field} (no DSH equivalent)`);
        }
    }
    return { rows, notCarriedOver, sourcesProbed: [] };
}
function renderImport(plan) {
    const rows = plan.rows.map((row) => [row.sourceName, row.decision.toUpperCase(), row.reason]);
    const markdown = [
        heading("/bridge-mcp import-from claude"),
        "",
        "Source files checked (read-only; source configs are never edited):",
        table(["SOURCE PATH", "EXISTS"], plan.sourcesProbed.map(([path, exists]) => [path, exists ? "yes" : "no"])),
    ];
    if (plan.error !== undefined) {
        markdown.push(`ERROR: ${plan.error}`, "");
        return { markdown: markdown.join("\n") };
    }
    markdown.push(table(["SOURCE NAME", "DECISION", "DETAIL"], rows));
    // The mapping table explains the DECISION column above, so it is printed
    // only when there is a decision to explain. With zero servers found it is
    // reference material nobody asked for (CHARTER: delete before add).
    if (rows.length > 0) {
        const mappingRows = [
            ["object key", "serverName", "normalize .:/space to '-', truncate to 32, suffix '-2' on collision"],
            ['type "stdio" (or absent + command)', 'transport: stdio', "direct"],
            ['type "http"', "transport: streamable-http", "direct"],
            ['type "sse"', "-", "unsupported; skip row emitted"],
            ["command / args / cwd", "same fields", "verbatim"],
            ["env / headers", "env / headers", "secret values become !!js process.env.<KEY> references"],
            ["disabled: true", "-", "skip (disabled upstream)"],
        ];
        markdown.push("", "Conversion mapping (Claude Code -> DSH):");
        markdown.push(table(["CLAUDE FIELD", "DSH FIELD", "RULE"], mappingRows));
    }
    if (plan.notCarriedOver.length > 0) {
        markdown.push("Not carried over:", bulletListOf(plan.notCarriedOver));
    }
    markdown.push("Nothing has been written. This iteration reports existence, parse health, and the", "conversion plan only; the write step lands with the config-writer slice.", "");
    return { markdown: markdown.join("\n"), data: { ...plan } };
}
function bulletListOf(items) {
    if (items.length === 0)
        return "";
    return [...items.map((item) => `- ${item}`), ""].join("\n");
}
function renderImportCard() {
    return card("import-from claude", [
        ["reads", "~/.claude.json mcpServers (+ projects.<cwd>.mcpServers)"],
        ["then", "./.mcp.json, ./.claude/mcp.json"],
        ["writes", "nothing to sources, ever"],
    ]);
}
// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------
/** /bridge-mcp entry point; pure over (ctx, args), all io via McpIo. */
export async function runMcp(ctx, args) {
    const tokens = (args["_"] ?? "").split(/\s+/).filter((token) => token !== "");
    const verb = (tokens[0] ?? "").toLowerCase();
    switch (verb) {
        case "":
        case "help":
            return { markdown: usageMarkdown() };
        case "list":
            return runList(ctx);
        case "add":
            return runAdd(ctx, args, tokens.slice(1));
        case "remove":
        case "rm":
            return runRemove(ctx, args, tokens.slice(1));
        case "test":
            return renderTest(loadInstances(nodeMcpIo(), mcpStorePath(ctx.paths.home)), tokens.slice(1).filter((token) => !token.startsWith("--")));
        case "import-from":
            return runImportFrom(ctx, tokens.slice(1));
        default:
            return {
                markdown: [heading("/bridge-mcp"), "", `Unknown subcommand "${verb}".`, "", usageMarkdown()].join("\n"),
            };
    }
}
function runImportFrom(ctx, tokens) {
    const source = (tokens[0] ?? "claude").toLowerCase();
    if (source !== "claude" && source !== "jcode") {
        return {
            markdown: [
                heading("/bridge-mcp import-from"),
                "",
                `Unsupported source "${source}" in this iteration; supported: claude (jcode shares the`,
                "same JSON shape and is accepted by the same reader). Codex TOML lands later.",
                "",
            ].join("\n"),
        };
    }
    void ctx;
    const io = nodeMcpIo();
    const home = process.env["HOME"] ?? ctx.paths.home;
    const cwd = process.cwd();
    const { plan: probePlan, servers } = readClaudeServers(io, home, cwd);
    const existing = loadInstances(io, mcpStorePath(ctx.paths.home));
    const planned = planClaudeImport(servers, existing);
    if (probePlan.error !== undefined) {
        return renderImport({ ...planned, sourcesProbed: probePlan.sourcesProbed, error: probePlan.error });
    }
    if (servers.size === 0) {
        const none = {
            markdown: [
                heading("/bridge-mcp import-from claude"),
                "",
                "Source found, 0 servers (or no source file present). Nothing to convert.",
                "",
                renderImportCard(),
                "",
            ].join("\n"),
            data: { ...probePlan, rows: [] },
        };
        return none;
    }
    return renderImport({ ...planned, sourcesProbed: probePlan.sourcesProbed });
}
//# sourceMappingURL=mcp.js.map