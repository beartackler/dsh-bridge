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
const SCANNER_SEVERITIES = ["info", "low", "medium", "high", "critical"];
export class ScanClientError extends Error {
    exitCode;
    stderrTail;
    constructor(message, exitCode, stderrTail) {
        super(message);
        this.exitCode = exitCode;
        this.stderrTail = stderrTail;
        this.name = "ScanClientError";
    }
}
function defaultEntry() {
    // dist/src/lib/scan-client.js -> package root -> packages/ -> repo root -> tools/scan/dist
    return join(import.meta.dirname, "..", "..", "..", "..", "..", "tools", "scan", "dist", "index.js");
}
/** Resolve the scanner binary without spawning it; exported for tests/tools. */
export function resolveScannerEntry(options = {}) {
    if (options.entryPath !== undefined)
        return options.entryPath;
    return defaultEntry();
}
function runProcess(executable, args, timeoutMs) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill();
            rejectPromise(new ScanClientError(`scanner timed out after ${timeoutMs}ms`, null, stderr));
        }, timeoutMs);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            rejectPromise(new ScanClientError(`failed to spawn scanner: ${error.message}`, null, stderr));
        });
        child.on("close", (code) => {
            if (settled)
                return;
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
export async function scanDirectory(targetDir, options = {}) {
    const entry = resolveScannerEntry(options);
    const scratch = mkdtempSync(join(tmpdir(), "dsh-bridge-scan-"));
    const jsonPath = join(scratch, "report.json");
    try {
        const { code, stderr } = await runProcess(options.nodePath ?? process.execPath, [entry, targetDir, "--json", jsonPath], options.timeoutMs ?? 60_000);
        if (code === null) {
            throw new ScanClientError("scanner terminated without an exit code", code, stderr);
        }
        if (code === 2) {
            throw new ScanClientError("scanner reported usage or I/O error", code, tail(stderr));
        }
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
        }
        catch (error) {
            throw new ScanClientError(`scanner produced unparseable JSON: ${error.message}`, code, tail(stderr));
        }
        return { report: parseScanReport(parsed), exitCode: code };
    }
    finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}
function tail(text) {
    const trimmed = text.trim();
    if (trimmed.length <= 400)
        return trimmed;
    return `…${trimmed.slice(-399)}`;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
/**
 * Validate one parsed verdict against the v1 schema shape. Hand-rolled on
 * purpose: zero runtime dependencies, and malformed scanner output must fail
 * with a precise message instead of poisoning downstream rendering.
 */
export function parseScanReport(value) {
    if (!isRecord(value))
        throw new ScanClientError("scan report is not an object", 0, "");
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
function parseFinding(value) {
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
function parseSeverity(value) {
    if (typeof value === "string" && SCANNER_SEVERITIES.includes(value)) {
        return value;
    }
    throw new ScanClientError(`unknown finding severity: ${String(value)}`, 0, "");
}
function requireRecord(value, where) {
    if (!isRecord(value))
        throw new ScanClientError(`scan report field "${where}" is missing or not an object`, 0, "");
    return value;
}
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function toStringArray(value) {
    return toArray(value).map((item) => String(item));
}
//# sourceMappingURL=scan-client.js.map