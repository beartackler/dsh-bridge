/**
 * /connect, phase 1: detection + report (docs/specs/commands/connect.md).
 *
 * Scope of this phase:
 *  - Scan the detection matrix (spec section 4): agent OAuth/key files, the
 *    environment, the OpenCode auth map, and the DSH dotenv file. Render the
 *    status table in the spec 6.1 shape. No writes, no network during
 *    detection; interactive route configuration ships in a later phase.
 *  - `/connect test <provider>`: a reachability smoke that is DNS/TCP only.
 *    Phase 1 never transmits credential material anywhere (S1/S4/S5).
 *
 * Security invariants honored here (spec section 7):
 *  - S1: only masked display strings ever reach `markdown`/`data`; the mask
 *    never discloses more than the first 4 and last 4 characters, and
 *    anything under 12 characters renders as an ellipsis alone.
 *  - S3: sources are opened read-only; nothing is written or chmod'd.
 *  - S12: symlinks are refused by paths.ts, never followed.
 *  - S13: reads are capped; oversized files report without being parsed.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { connect as tcpConnect } from "node:net";

import {
  claudeCredentialsPath,
  codexAuthPath,
  dshEnvPath,
  geminiOauthCredsPath,
  maskSecret,
  opencodeAuthPath,
  probeEnvVar,
  probeJsonSource,
} from "../lib/paths.js";
import type { BridgeCommand } from "../lib/registry.js";
import type { BridgeContext, CommandResult, DetectionRow, DetectionStatus, SourceProbe } from "../lib/types.js";

/** Environment variables that map one-to-one onto a connector provider. */
const CONNECTOR_ENV_VARS = Object.freeze([
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
]);

/** Provider each connector env var belongs to (spec section 4 rows 2/5/8/10/11). */
const ENV_VAR_PROVIDERS: Readonly<Record<string, string>> = Object.freeze({
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  GEMINI_API_KEY: "google",
  DEEPSEEK_API_KEY: "deepseek",
  OPENROUTER_API_KEY: "openrouter",
});

/** Providers accepted by `/connect test <provider>` with their smoke targets. */
const REACHABILITY_TARGETS: Readonly<Record<string, { host: string; port: number; label: string }>> = Object.freeze({
  anthropic: { host: "api.anthropic.com", port: 443, label: "api.anthropic.com" },
  openai: { host: "api.openai.com", port: 443, label: "api.openai.com" },
  google: { host: "generativelanguage.googleapis.com", port: 443, label: "generativelanguage.googleapis.com" },
  deepseek: { host: "api.deepseek.com", port: 443, label: "api.deepseek.com" },
  openrouter: { host: "openrouter.ai", port: 443, label: "openrouter.ai" },
});

const DEFAULT_TCP_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Masking boundary (connect spec S1)
// ---------------------------------------------------------------------------

/**
 * Enforce the mask on any detail string that could carry secret-shaped
 * material. Runs after upstream masks as defense in depth: a value that
 * somehow arrived raw is reduced here, and already-masked strings pass
 * through unchanged because their fragments fall under the minimum length.
 */
function maskDetail(detail: string): string {
  return detail.replace(/[A-Za-z0-9_-]{12,}/g, (match) => `${match.slice(0, 4)}\u2026${match.slice(-4)}`);
}

// ---------------------------------------------------------------------------
// OAuth expiry classification (by JSON key shape, never by value)
// ---------------------------------------------------------------------------

interface OauthVerdict {
  readonly kind: "oauth";
  readonly expired: boolean;
}

interface KeyVerdict {
  readonly kind: "key";
}

type ExpiryVerdict = OauthVerdict | KeyVerdict;

/** JSON keys whose presence marks a file as OAuth-shaped (spec rows 1/4/7). */
const EXPIRY_KEYS = ["expiresAt", "expiry_date", "expires_at"] as const;

type InspectedSource = SourceProbe & { verdict: ExpiryVerdict | null };

/** Coerce a timestamp-ish JSON value into epoch milliseconds, or null. */
function coerceExpiry(value: unknown): number | null {
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
function findTimestampKey(node: unknown, depth = 0): number | null {
  if (depth > 4 || node === null || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  for (const key of EXPIRY_KEYS) {
    const expiry = coerceExpiry(record[key]);
    if (expiry !== null) return expiry;
  }
  for (const value of Object.values(record)) {
    const nested = findTimestampKey(value, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

/**
 * Probe one OAuth/key JSON source and classify expiry by shape. Values are
 * read only to locate the expiry key and never leave this function.
 */
function inspectOauthFile(path: string, requiredKeys: readonly string[]): InspectedSource {
  const probe = probeJsonSource(path, requiredKeys);
  let verdict: ExpiryVerdict | null = null;

  if (probe.shape === "valid-shape") {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      const expiresAt = findTimestampKey(parsed);
      verdict =
        expiresAt !== null && expiresAt < Date.now() ? { kind: "oauth", expired: true } : { kind: "oauth", expired: false };
    } catch {
      // File changed between probe and read; classify conservatively as key material.
      verdict = { kind: "key" };
    }
  }

  return { ...probe, verdict };
}

// ---------------------------------------------------------------------------
// Detection matrix (connect spec section 4)
// ---------------------------------------------------------------------------

function row(provider: string, source: string, status: DetectionStatus, detail?: string): DetectionRow {
  return { provider, source, status, detail: detail ?? "-" };
}

/** Map a metadata probe plus expiry verdict onto one matrix row. */
function fileRow(provider: string, label: string, inspected: InspectedSource): DetectionRow {
  if (!inspected.exists) return row(provider, label, "not found");

  switch (inspected.shape) {
    case "valid-shape":
      if (inspected.verdict?.kind === "oauth") {
        return inspected.verdict.expired
          ? row(provider, label, "expired", "oauth token expired")
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
 * One environment-variable row. Placeholder-like values (E9: under 12 chars
 * or obvious template text) report `malformed` instead of `found`.
 */
function envRow(provider: string, name: string, env: Readonly<Record<string, string | undefined>>): DetectionRow {
  const probe = probeEnvVar(name, env);
  if (!probe.present) return row(provider, `$${name}`, "not found");

  const value = env[name] ?? "";
  if (value.length < 12 || /your[-_]?key|placeholder|example|changeme/i.test(value)) {
    return row(provider, `$${name}`, "malformed", "placeholder-like value");
  }
  return row(provider, `$${name}`, "found", maskDetail(probe.masked));
}

/** Row 3: gateway variables. The base URL is not secret and shows in full. */
function proxyRow(env: Readonly<Record<string, string | undefined>>): DetectionRow {
  const authToken = env["ANTHROPIC_AUTH_TOKEN"];
  const baseUrl = env["ANTHROPIC_BASE_URL"];
  if (authToken === undefined || authToken.trim() === "") {
    return row("anthropic", "$ANTHROPIC_AUTH_TOKEN", "not found");
  }

  let detail = maskDetail(maskSecret(authToken));
  if (baseUrl !== undefined && baseUrl.trim() !== "") {
    try {
      detail += ` via ${new URL(baseUrl).host}`;
    } catch {
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
function opencodeRows(path: string): readonly DetectionRow[] {
  const probe = probeJsonSource(path, []);
  if (!probe.exists) return [row("opencode", "opencode auth.json", "not found")];
  if (probe.shape === "over-size-limit") return [row("opencode", "opencode auth.json", "malformed", "over 64 KiB read cap")];
  if (probe.shape === "unavailable") return [row("opencode", "opencode auth.json", "unreadable")];
  if (probe.shape === "unparseable") return [row("opencode", "opencode auth.json", "malformed", "invalid JSON")];

  if (probe.shape !== "valid-shape") {
    return [row("opencode", "opencode auth.json", "malformed", "unexpected JSON shape")];
  }

  let entries: readonly [string, unknown][];
  try {
    entries = Object.entries(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
  } catch {
    return [row("opencode", "opencode auth.json", "malformed", "invalid JSON")];
  }

  const rows: DetectionRow[] = [];
  for (const [entryName, value] of entries) {
    const entry = (value ?? {}) as Record<string, unknown>;
    const keyValue = entry["key"];
    const accessValue = entry["access"];
    if (typeof keyValue !== "string" && typeof accessValue !== "string") continue;

    const rawMasked = maskSecret(typeof keyValue === "string" ? keyValue : (accessValue as string));
    const providerName = ENV_VAR_PROVIDERS[`${entryName.toUpperCase()}_API_KEY`] ?? "opencode";
    rows.push(row(providerName, `${entryName} via opencode`, "found", maskDetail(rawMasked)));
  }

  if (rows.length === 0) {
    return [row("opencode", "opencode auth.json", "malformed", "no usable provider entries")];
  }
  return rows;
}

/** Row 13 (DSH half): report which connector key names the dotenv defines. Names only, never values. */
function dotenvRow(path: string): DetectionRow {
  const probe = probeJsonSource(path, []);
  if (!probe.exists) return row("any", "~/.dsh/.env", "not found");
  if (probe.shape === "over-size-limit") return row("any", "~/.dsh/.env", "malformed", "over 64 KiB read cap");

  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return row("any", "~/.dsh/.env", code === "EACCES" || code === "EPERM" ? "unreadable" : "malformed");
  }

  const definedNames = CONNECTOR_ENV_VARS.filter((name) =>
    new RegExp(`^\\s*${name}\\s*=\\s*\\S`).test(contents),
  );
  if (definedNames.length === 0) return row("any", "~/.dsh/.env", "not found", "no connector keys");
  return row("any", "~/.dsh/.env", "found", `defines ${definedNames.join(", ")}`);
}

/**
 * Scan every documented source. No network, no writes; rows carry masked
 * display strings only. `env` is injected so tests run hermetically.
 */
export function detectCredentials(
  ctx: BridgeContext,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly DetectionRow[] {
  const home = ctx.paths.home;
  const rows: DetectionRow[] = [];

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
// Matrix rendering (connect spec 6.1)
// ---------------------------------------------------------------------------

function renderMatrix(ctx: BridgeContext, rows: readonly DetectionRow[]): string {
  const table = ctx.output.table(
    ["PROVIDER", "SOURCE", "STATUS", "DETAIL"],
    rows.map((matrixRow) => [matrixRow.provider, matrixRow.source, matrixRow.status, matrixRow.detail]),
  );
  return [
    "### /connect - connectors",
    "",
    table,
    `profile: ${ctx.profile}`,
    "",
    "Values are masked. dsh-bridge never reads a secret into the transcript,",
    "and never copies one into configuration. Routes reference env vars only.",
    "",
    "Phase 1: detection and reachability only. Interactive route",
    "configuration ships in a later phase.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reachability smoke: DNS/TCP only, no credential transmission (phase 1)
// ---------------------------------------------------------------------------

export interface ReachabilityStep {
  readonly step: "dns" | "tcp";
  readonly ok: boolean;
  readonly detail: string;
}

export interface ReachabilityOutcome {
  readonly ok: boolean;
  readonly target: string;
  readonly steps: readonly ReachabilityStep[];
}

export interface ReachabilityOptions {
  readonly timeoutMs?: number;
  /** Test seam: overrides the provider's documented target. */
  readonly target?: { host: string; port: number; label: string };
}

/** Open one TCP connection, measure it, and hang up immediately. */
function tcpProbe(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolveOpen, refuse) => {
    const startedAt = Date.now();
    const socket = tcpConnect(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      refuse(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    socket.once("connect", () => {
      const elapsed = Date.now() - startedAt;
      clearTimeout(timer);
      socket.destroy();
      resolveOpen(elapsed);
    });
    socket.once("error", (error: Error) => {
      clearTimeout(timer);
      socket.destroy();
      refuse(error);
    });
  });
}

/**
 * Resolve the provider host, then prove a TCP connection opens. Nothing is
 * written to the socket, so no credential material can be transmitted.
 */
export async function testProviderReachability(provider: string, options: ReachabilityOptions = {}): Promise<ReachabilityOutcome> {
  const target = options.target ?? REACHABILITY_TARGETS[provider];
  if (target === undefined) {
    throw new Error(`unknown provider '${provider}'`);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TCP_TIMEOUT_MS;
  const steps: ReachabilityStep[] = [];

  try {
    const resolved = await dnsLookup(target.host);
    steps.push({ step: "dns", ok: true, detail: `resolved ${resolved.address}` });
  } catch (error) {
    steps.push({ step: "dns", ok: false, detail: `lookup failed (${(error as NodeJS.ErrnoException).code ?? "error"})` });
    return { ok: false, target: target.label, steps };
  }

  try {
    const elapsed = await tcpProbe(target.host, target.port, timeoutMs);
    steps.push({ step: "tcp", ok: true, detail: `open in ${elapsed} ms` });
    return { ok: true, target: target.label, steps };
  } catch (error) {
    steps.push({ step: "tcp", ok: false, detail: `refused or filtered (${(error as Error).message})` });
    return { ok: false, target: target.label, steps };
  }
}

function renderReachability(ctx: BridgeContext, provider: string, outcome: ReachabilityOutcome): string {
  const fields: readonly (readonly [string, string])[] = [
    ["endpoint", outcome.target],
    ...outcome.steps.map((step): readonly [string, string] => [step.step, `${step.ok ? "ok" : "fail"} - ${step.detail}`]),
    ["scope", "DNS/TCP only; no credentials transmitted"],
    ["verdict", outcome.ok ? "reachable" : "unreachable"],
  ];
  return [`### /connect test - ${provider}`, "", ctx.output.card(`Reachability - ${provider}`, fields)].join("\n");
}

// ---------------------------------------------------------------------------
// Command surface
// ---------------------------------------------------------------------------

/** Parse `/connect ...` args (shared `_`/`rest` convention) into an invocation. */
export interface ConnectInvocation {
  readonly mode: "list" | "test";
  readonly provider?: string;
}

export function parseConnectArgs(args: Readonly<Record<string, string>>): ConnectInvocation {
  const verb = args["_"] ?? "";
  if (verb === "") return { mode: "list" };

  if (verb === "test") {
    const provider = (args["rest"] ?? "").trim().split(/\s+/)[0] ?? "";
    if (provider === "") {
      throw new Error("usage: /connect test <provider> (anthropic, openai, google, deepseek, openrouter)");
    }
    return { mode: "test", provider: provider.toLowerCase() };
  }
  if (!REACHABILITY_TARGETS[verb]) {
    throw new Error(`usage: /connect [test <provider>]; phase 1 accepts no other argument (got '${verb}')`);
  }
  return { mode: "list", provider: verb };
}

/** Phase-1 runner: detection matrix by default; `test <provider>` for reachability. */
export async function runConnect(ctx: BridgeContext, args: Readonly<Record<string, string>>): Promise<CommandResult> {
  const invocation = parseConnectArgs(args);

  if (invocation.mode === "test") {
    const outcome = await testProviderReachability(invocation.provider as string);
    return {
      markdown: renderReachability(ctx, invocation.provider as string, outcome),
      data: { kind: "connect.reachability", ok: outcome.ok, target: outcome.target, steps: outcome.steps },
    };
  }

  const rows = detectCredentials(ctx);
  return {
    markdown: renderMatrix(ctx, rows),
    data: { kind: "connect.matrix", profile: ctx.profile, rows },
  };
}

/** Registry descriptor. Mounted over the registry stub via MOUNT(connect). */
export const connectCommand: BridgeCommand = {
  name: "bridge-connect",
  aliases: [],
  summary: "Detect local provider credentials and report them masked",
  usage: "[test <provider>]",
  run: runConnect,
};
