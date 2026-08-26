#!/usr/bin/env node
/**
 * dsh-bridge static scanner — stage S3 of the trust pipeline.
 *
 * Walks a target directory, applies every rule to every scannable file, and emits a
 * deterministic JSON verdict plus a markdown trust-card draft.
 *
 * Usage:
 *   dsh-scan <target-dir> [--json <path>] [--markdown <path>] [--fail-on <severity>] [--quiet]
 *
 * Exit codes: 0 clean / below threshold, 1 threshold exceeded, 2 usage or I/O error.
 * The exit code is what makes this usable as a CI gate.
 */
import { closeSync, fstatSync, mkdirSync, openSync, readSync, readdirSync, statSync, writeFileSync, } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { ALL_RULES, rulesDigest, sortFindings, SEVERITY_RANK } from "./rules/index.js";
import { grade, toJsonReport, toMarkdownReport } from "./report.js";
export const SCANNER_VERSION = "0.1.0";
/** Directories never worth scanning; scanning them produces noise, not signal. */
const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    ".cache",
    ".turbo",
    ".next",
    "coverage",
    ".venv",
    "__pycache__",
]);
const SCANNABLE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx", ".json", ".sh", ".yml", ".yaml"]);
/** Matches the pipeline's S1 size guard: refuse archive-bomb-scale inputs. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
/**
 * Files larger than this are probed in fixed-size windows instead of being decoded whole.
 * The probe bounds peak memory on bundle-scale inputs to one window; only a file whose
 * window scan produced evidence gets a full decode, and that full-string pass reproduces
 * the exact citations (path:line:col over the whole file) the report contract promises.
 * Fixed window size => fully deterministic.
 */
const STREAM_CHUNK_BYTES = 1 * 1024 * 1024;
/** Window overlap; must exceed the longest plausible detector hit plus its context. */
const STREAM_OVERLAP_BYTES = 4 * 1024;
/**
 * Decode bytes to a string exactly like readFileSync(..., "utf8") does: strip a UTF-8
 * BOM if present, then replace malformed sequences with U+FFFD (WHATWG decoding).
 */
function decodeUtf8(bytes) {
    const bomless = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
    return new TextDecoder("utf-8").decode(bomless);
}
/** Fast binary guard over raw bytes: a NUL anywhere in the first 4 KiB. */
function looksBinary(bytes) {
    const limit = Math.min(bytes.length, 4096);
    for (let i = 0; i < limit; i += 1) {
        if (bytes[i] === 0)
            return true;
    }
    return false;
}
/** Sentinel for loadFile: readable but binary (skipped by the binary guard). */
const FILE_BINARY = { __binary: true };
/**
 * Single-pass load for regular-sized files. One sequential read fills the buffer; the
 * binary guard runs on raw bytes BEFORE the UTF-8 decode, so binary files pay neither
 * the decode nor any rule work. Byte-for-byte the same string readFileSync produced,
 * verified by the decoder contract above.
 */
function loadFile(absolute) {
    let fd;
    try {
        fd = openSync(absolute, "r");
    }
    catch {
        return null;
    }
    try {
        const stat = fstatSync(fd);
        const bytes = Buffer.allocUnsafe(stat.size);
        let read = 0;
        while (read < stat.size) {
            const n = readSync(fd, bytes, read, stat.size - read, read);
            if (n <= 0)
                break;
            read += n;
        }
        if (looksBinary(bytes))
            return FILE_BINARY;
        return { content: decodeUtf8(bytes.subarray(0, read)) };
    }
    catch {
        return null;
    }
    finally {
        try {
            closeSync(fd);
        }
        catch {
            // Nothing better to do with a failed close on a read-only descriptor.
        }
    }
}
/**
 * Windowed probe for oversized files. Scans overlapping windows through a caller-owned
 * reusable buffer, so peak memory is one window regardless of file size. Returns whether
 * ANY detector fired anywhere; actual findings are recomputed later from the full string
 * so citations stay whole-file accurate.
 */
function probeOversizedFile(absolute, relPath, rules, buffer) {
    let fd;
    try {
        fd = openSync(absolute, "r");
    }
    catch {
        return false;
    }
    try {
        const step = STREAM_CHUNK_BYTES - STREAM_OVERLAP_BYTES;
        for (let start = 0;; start += step) {
            let total = 0;
            while (total < STREAM_CHUNK_BYTES) {
                const n = readSync(fd, buffer, total, STREAM_CHUNK_BYTES - total, start + total);
                if (n <= 0)
                    break;
                total += n;
            }
            if (total === 0)
                return false;
            const window = decodeUtf8(buffer.subarray(0, total));
            let fired = false;
            for (const rule of rules) {
                if (rule.appliesTo && !rule.appliesTo(relPath))
                    continue;
                if (rule.match(window, relPath).length > 0) {
                    fired = true;
                    break;
                }
            }
            if (fired)
                return true;
            if (total < STREAM_CHUNK_BYTES)
                return false; // EOF reached, nothing found
        }
    }
    catch {
        return false;
    }
    finally {
        try {
            closeSync(fd);
        }
        catch {
            // Read-only descriptor; ignore close failures.
        }
    }
}
function isScannable(path) {
    const dot = path.lastIndexOf(".");
    if (dot < 0)
        return false;
    return SCANNABLE_EXT.has(path.slice(dot).toLowerCase());
}
/**
 * Recursive directory walk returning repo-relative POSIX paths, sorted.
 *
 * Sorting is what makes the whole report deterministic: readdir order is
 * filesystem-dependent, so an unsorted walk yields different output on macOS and Linux
 * for identical inputs, which would break the "recompute the verdict yourself" promise.
 * Symlinks are not followed (statSync on the entry would traverse them; we use the
 * lstat-like check via withFileTypes to avoid escaping the tree).
 */
export function walk(root) {
    const out = [];
    const visit = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return; // unreadable dir: recorded as skipped by the caller's counters
        }
        const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of sorted) {
            if (entry.isSymbolicLink())
                continue; // symlink escape guard (E-TRAVERSAL)
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name))
                    visit(full);
            }
            else if (entry.isFile()) {
                out.push(full);
            }
        }
    };
    visit(root);
    return out.sort();
}
/** POSIX-normalized relative path, so citations are identical across platforms. */
function toRelPosix(root, absolute) {
    return relative(root, absolute).split(sep).join("/");
}
export function scanContent(content, relPath, rules = ALL_RULES) {
    const findings = [];
    for (const rule of rules) {
        if (rule.appliesTo && !rule.appliesTo(relPath))
            continue;
        try {
            findings.push(...rule.match(content, relPath));
        }
        catch (error) {
            // A crashing rule must never silently drop a file from the report; surface it.
            findings.push({
                id: "SUPPLY-000",
                ruleId: rule.id,
                family: "SUPPLY",
                severity: "low",
                message: `Rule "${rule.id}" failed on this file; it was not fully analyzed (${error.message}).`,
                path: relPath,
                line: 1,
                col: 1,
                excerpt: "",
                excerptSha256: "",
                confidence: 1,
                note: "Unanalyzed regions cap the grade at C in the full pipeline.",
            });
        }
    }
    return sortFindings(findings);
}
export function scanDirectory(target, options = {}) {
    const rules = options.rules ?? ALL_RULES;
    const maxBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
    const root = resolve(target);
    const files = walk(root);
    const findings = [];
    let filesScanned = 0;
    let filesSkipped = 0;
    let bytesScanned = 0;
    // One reusable window for all oversized files: allocation happens once per scan,
    // not once per file.
    const streamBuffer = Buffer.allocUnsafe(STREAM_CHUNK_BYTES);
    for (const absolute of files) {
        const relPath = toRelPosix(root, absolute);
        if (!isScannable(relPath)) {
            filesSkipped += 1;
            continue;
        }
        let fileSize = 0;
        try {
            fileSize = statSync(absolute).size;
        }
        catch {
            filesSkipped += 1;
            continue;
        }
        if (fileSize > maxBytes) {
            filesSkipped += 1;
            // Never skip silently. A payload hidden inside a padded, oversized file would
            // otherwise vanish from the report entirely, leaving only an opaque counter.
            findings.push({
                id: "SUPPLY-001",
                ruleId: "scan-limits",
                family: "SUPPLY",
                severity: "high",
                message: `File exceeds the ${maxBytes}-byte scan limit (${fileSize} bytes); its contents were not analyzed.`,
                path: relPath,
                line: 1,
                col: 1,
                excerpt: "",
                excerptSha256: "",
                confidence: 1,
                note: "Unanalyzed regions cap the grade at C: absence of findings here is absence of evidence, not evidence of absence.",
            });
            continue;
        }
        if (fileSize <= STREAM_CHUNK_BYTES) {
            const loaded = loadFile(absolute);
            if (loaded === null || !("content" in loaded)) {
                filesSkipped += 1;
                continue;
            }
            filesScanned += 1;
            bytesScanned += fileSize;
            findings.push(...scanContent(loaded.content, relPath, rules));
        }
        else {
            // Oversized-but-under-limit: probe in windows through one shared buffer, and only
            // pay a whole-file decode when the probe saw evidence. The second pass recomputes
            // findings over the full string, so citations stay whole-file accurate.
            const suspicious = probeOversizedFile(absolute, relPath, rules, streamBuffer);
            if (!suspicious) {
                // The file was read and analyzed (nothing fired); it counts as scanned.
                filesScanned += 1;
                bytesScanned += fileSize;
                continue;
            }
            let content = null;
            try {
                const fd = openSync(absolute, "r");
                try {
                    const bytes = Buffer.allocUnsafe(fileSize);
                    const n = readSync(fd, bytes, 0, fileSize, 0);
                    if (n > 0 && !looksBinary(bytes))
                        content = decodeUtf8(bytes.subarray(0, n));
                }
                finally {
                    closeSync(fd);
                }
            }
            catch {
                content = null;
            }
            if (content === null) {
                filesSkipped += 1;
                continue;
            }
            filesScanned += 1;
            bytesScanned += fileSize;
            findings.push(...scanContent(content, relPath, rules));
        }
    }
    return {
        // Report the directory name only. Absolute paths embed a username, which would
        // both leak the operator's identity and make output machine-dependent.
        target: root.split(sep).filter(Boolean).pop() ?? ".",
        scannerVersion: SCANNER_VERSION,
        rulesDigest: rulesDigest(rules),
        ruleIds: rules.map((r) => r.id).sort(),
        stats: { filesScanned, filesSkipped, bytesScanned },
        findings: sortFindings(findings),
    };
}
export function parseArgs(argv) {
    const options = { target: "", quiet: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case "--json":
            case "--markdown": {
                const value = argv[i + 1];
                if (!value || value.startsWith("--"))
                    return { error: `${arg} requires a file path` };
                if (arg === "--json")
                    options.json = value;
                else
                    options.markdown = value;
                i += 1;
                break;
            }
            case "--fail-on": {
                const value = argv[i + 1];
                if (!value || !(value in SEVERITY_RANK)) {
                    return { error: "--fail-on requires one of: info, low, medium, high, critical" };
                }
                options.failOn = value;
                i += 1;
                break;
            }
            case "--quiet":
                options.quiet = true;
                break;
            case "--help":
            case "-h":
                return { error: "help" };
            default:
                if (arg.startsWith("--"))
                    return { error: `unknown option: ${arg}` };
                if (options.target)
                    return { error: "only one target directory may be given" };
                options.target = arg;
        }
    }
    if (!options.target)
        return { error: "a target directory is required" };
    return options;
}
const USAGE = `dsh-scan ${SCANNER_VERSION} - static scanner for DSH plugin trust cards

Usage:
  dsh-scan <target-dir> [options]

Options:
  --json <path>       Write the canonical JSON verdict to <path>
  --markdown <path>   Write the markdown trust-card draft to <path>
  --fail-on <sev>     Exit 1 if any finding is at or above <sev>
                      (info | low | medium | high | critical)
  --quiet             Suppress the stdout summary
  -h, --help          Show this help

Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or I/O error.
`;
function writeOut(path, contents) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), contents, "utf8");
}
export function main(argv = process.argv.slice(2)) {
    const parsed = parseArgs(argv);
    if ("error" in parsed) {
        if (parsed.error === "help") {
            process.stdout.write(USAGE);
            return 0;
        }
        process.stderr.write(`dsh-scan: ${parsed.error}\n\n${USAGE}`);
        return 2;
    }
    let stat;
    try {
        stat = statSync(resolve(parsed.target));
    }
    catch {
        process.stderr.write(`dsh-scan: cannot read target: ${parsed.target}\n`);
        return 2;
    }
    if (!stat.isDirectory()) {
        process.stderr.write(`dsh-scan: target is not a directory: ${parsed.target}\n`);
        return 2;
    }
    const result = scanDirectory(parsed.target);
    const grading = grade(result.findings);
    try {
        if (parsed.json)
            writeOut(parsed.json, toJsonReport(result, grading));
        if (parsed.markdown)
            writeOut(parsed.markdown, toMarkdownReport(result, grading));
    }
    catch (error) {
        process.stderr.write(`dsh-scan: failed to write report: ${error.message}\n`);
        return 2;
    }
    if (!parsed.json && !parsed.markdown && !parsed.quiet) {
        process.stdout.write(toJsonReport(result, grading));
    }
    else if (!parsed.quiet) {
        const c = grading.counts;
        process.stdout.write(`dsh-scan: grade ${grading.grade} (score ${grading.score}/100) - ` +
            `${result.findings.length} finding(s) across ${result.stats.filesScanned} file(s): ` +
            `${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low\n`);
    }
    if (parsed.failOn) {
        const threshold = SEVERITY_RANK[parsed.failOn];
        if (result.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold))
            return 1;
    }
    return 0;
}
export * from "./report.js";
export * from "./rules/index.js";
// Only run the CLI when executed directly, so importing this module in tests is side-effect free.
const invokedDirectly = process.argv[1] !== undefined && /(?:^|[\\/])index\.(?:js|ts)$|dsh-scan$/.test(process.argv[1]);
if (invokedDirectly) {
    process.exitCode = main();
}
//# sourceMappingURL=index.js.map