/**
 * Typed wrapper around the dsh-bridge static scanner (tools/scan).
 *
 * Invocation contract (tools/scan/src/index.ts):
 *   node <dist/index.js> <target-dir> [--json <path>] [--fail-on <sev>] [--quiet]
 *   exit codes: 0 clean/below threshold, 1 threshold exceeded, 2 usage or I/O error.
 *
 * The scanner is spawned as a separate Node process on purpose: audit code
 * must not share a runtime with the plugin host, and the JSON boundary is the
 * documented, versioned interface (`schema: "dsh-bridge.scan/v1"`).
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Severities of tools/scan; order matches its SEVERITY_RANK. */
const SCANNER_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type ScannerSeverity = (typeof SCANNER_SEVERITIES)[number];

/** One evidence item of a scanner verdict. Mirrors tools/scan `Finding`. */
export interface ScanFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly family: string;
  readonly severity: ScannerSeverity;
  readonly message: string;
  readonly path: string;
  readonly line: number;
  readonly col: number;
  readonly excerpt: string;
  readonly excerptSha256: string;
  readonly confidence: number;
  readonly note?: string;
}

/** Severity histogram as written by tools/scan `toJsonReport`. */
export interface SeverityCounts {
  readonly info: number;
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}

/**
 * Canonical JSON verdict of the scanner, schema `dsh-bridge.scan/v1`.
 * Field-for-field mirror of tools/scan/src/report.ts `toJsonReport`; drift is
 * caught by the self-test against the real dist output.
 */
export interface ScanReport {
  readonly schema: string;
  readonly scannerVersion: string;
  readonly rulesDigest: string;
  readonly ruleIds: readonly string[];
  readonly target: string;
  readonly stats: {
    readonly filesScanned: number;
    readonly filesSkipped: number;
    readonly bytesScanned: number;
  };
  readonly grading: {
    readonly grade: string;
    readonly score: number;
    readonly counts: SeverityCounts;
    readonly caps: readonly { grade: string; reason: string }[];
    readonly gates: readonly string[];
    readonly familiesPresent: readonly string[];
  };
  readonly findings: readonly ScanFinding[];
}

export interface ScanOutcome {
  readonly report: ScanReport;
  /** Scanner process exit code: 0 ok, 1 threshold exceeded, never expected here. */
  readonly exitCode: number;
}

export class ScanClientError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = "ScanClientError";
  }
}

export interface ScanClientOptions {
  /**
   * Absolute path to the compiled scanner entry. Defaults to the repo-local
   * `tools/scan/dist/index.js` relative to this file's build location
   * (`packages/dsh-bridge/dist/lib` -> repo root -> `tools/scan/dist`).
   */
  readonly entryPath?: string;
  /** Node executable used to spawn the scanner. */
  readonly nodePath?: string;
  /** Kill the scanner after this many milliseconds; a hung audit fails loudly. */
  readonly timeoutMs?: number;
}

function defaultEntry(): string {
  // dist/src/lib/scan-client.js -> package root -> packages/ -> repo root -> tools/scan/dist
  return join(import.meta.dirname, "..", "..", "..", "..", "..", "tools", "scan", "dist", "index.js");
}

/** Resolve the scanner binary without spawning it; exported for tests/tools. */
export function resolveScannerEntry(options: Pick<ScanClientOptions, "entryPath"> = {}): string {
  if (options.entryPath !== undefined) return options.entryPath;
  return defaultEntry();
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(executable: string, args: readonly string[], timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectPromise(new ScanClientError(`scanner timed out after ${timeoutMs}ms`, null, stderr));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new ScanClientError(`failed to spawn scanner: ${(error as Error).message}`, null, stderr));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/**
 * Run the scanner over `targetDir` and return its parsed, typed verdict.
 *
 * The JSON is exchanged through a temp file rather than stdout because the
 * CLI writes human summaries there; `--json <path>` is the documented
 * machine channel. Exit code 1 (threshold exceeded) is a valid outcome, not
 * an error: callers decide policy.
 */
export async function scanDirectory(targetDir: string, options: ScanClientOptions = {}): Promise<ScanOutcome> {
  const entry = resolveScannerEntry(options);
  const scratch = mkdtempSync(join(tmpdir(), "dsh-bridge-scan-"));
  const jsonPath = join(scratch, "report.json");

  try {
    const { code, stderr } = await runProcess(
      options.nodePath ?? process.execPath,
      [entry, targetDir, "--json", jsonPath],
      options.timeoutMs ?? 60_000,
    );

    if (code === null) {
      throw new ScanClientError("scanner terminated without an exit code", code, stderr);
    }
    if (code === 2) {
      throw new ScanClientError("scanner reported usage or I/O error", code, tail(stderr));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    } catch (error) {
      throw new ScanClientError(`scanner produced unparseable JSON: ${(error as Error).message}`, code, tail(stderr));
    }

    return { report: parseScanReport(parsed), exitCode: code };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function tail(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 400) return trimmed;
  return `...${trimmed.slice(-397)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validate one parsed verdict against the v1 schema shape. Hand-rolled on
 * purpose: zero runtime dependencies, and malformed scanner output must fail
 * with a precise message instead of poisoning downstream rendering.
 */
export function parseScanReport(value: unknown): ScanReport {
  if (!isRecord(value)) throw new ScanClientError("scan report is not an object", 0, "");
  if (value["schema"] !== "dsh-bridge.scan/v1") {
    throw new ScanClientError(`unsupported scan report schema: ${String(value["schema"])}`, 0, "");
  }
  const stats = requireRecord(value["stats"], "stats");
  const grading = requireRecord(value["grading"], "grading");
  const counts = requireRecord(grading["counts"], "grading.counts");

  return {
    schema: value["schema"],
    scannerVersion: String(value["scannerVersion"] ?? ""),
    rulesDigest: String(value["rulesDigest"] ?? ""),
    ruleIds: toStringArray(value["ruleIds"]),
    target: String(value["target"] ?? ""),
    stats: {
      filesScanned: Number(stats["filesScanned"] ?? 0),
      filesSkipped: Number(stats["filesSkipped"] ?? 0),
      bytesScanned: Number(stats["bytesScanned"] ?? 0),
    },
    grading: {
      grade: String(grading["grade"] ?? "?"),
      score: Number(grading["score"] ?? 0),
      counts: {
        info: Number(counts["info"] ?? 0),
        low: Number(counts["low"] ?? 0),
        medium: Number(counts["medium"] ?? 0),
        high: Number(counts["high"] ?? 0),
        critical: Number(counts["critical"] ?? 0),
      },
      caps: toArray(grading["caps"]).map((cap) => {
        const record = requireRecord(cap, "grading.caps[]");
        return { grade: String(record["grade"] ?? ""), reason: String(record["reason"] ?? "") };
      }),
      gates: toStringArray(grading["gates"]),
      familiesPresent: toStringArray(grading["familiesPresent"]),
    },
    findings: toArray(value["findings"]).map(parseFinding),
  };
}

function parseFinding(value: unknown): ScanFinding {
  const record = requireRecord(value, "findings[]");
  return {
    id: String(record["id"] ?? ""),
    ruleId: String(record["ruleId"] ?? ""),
    family: String(record["family"] ?? ""),
    severity: parseSeverity(record["severity"]),
    message: String(record["message"] ?? ""),
    path: String(record["path"] ?? ""),
    line: Number(record["line"] ?? 0),
    col: Number(record["col"] ?? 0),
    excerpt: String(record["excerpt"] ?? ""),
    excerptSha256: String(record["excerptSha256"] ?? ""),
    confidence: Number(record["confidence"] ?? 0),
    ...(record["note"] === undefined ? {} : { note: String(record["note"]) }),
  };
}

function parseSeverity(value: unknown): ScannerSeverity {
  if (typeof value === "string" && (SCANNER_SEVERITIES as readonly string[]).includes(value)) {
    return value as ScannerSeverity;
  }
  throw new ScanClientError(`unknown finding severity: ${String(value)}`, 0, "");
}

function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ScanClientError(`scan report field "${where}" is missing or not an object`, 0, "");
  return value;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return toArray(value).map((item) => String(item));
}
