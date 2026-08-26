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

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { ALL_RULES, rulesDigest, sortFindings, SEVERITY_RANK, type Finding, type Rule, type Severity } from "./rules/index.js";
import { grade, toJsonReport, toMarkdownReport, type ScanResult } from "./report.js";

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

export interface ScanOptions {
  readonly rules?: readonly Rule[];
  readonly maxFileBytes?: number;
}

function isScannable(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
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
export function walk(root: string): string[] {
  const out: string[] = [];

  const visit = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir: recorded as skipped by the caller's counters
    }
    const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of sorted) {
      if (entry.isSymbolicLink()) continue; // symlink escape guard (E-TRAVERSAL)
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };

  visit(root);
  return out.sort();
}

/** POSIX-normalized relative path, so citations are identical across platforms. */
function toRelPosix(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

export function scanContent(
  content: string,
  relPath: string,
  rules: readonly Rule[] = ALL_RULES,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(relPath)) continue;
    try {
      findings.push(...rule.match(content, relPath));
    } catch (error) {
      // A crashing rule must never silently drop a file from the report; surface it.
      findings.push({
        id: "SUPPLY-000",
        ruleId: rule.id,
        family: "SUPPLY",
        severity: "low",
        message: `Rule "${rule.id}" failed on this file; it was not fully analyzed (${(error as Error).message}).`,
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

export function scanDirectory(target: string, options: ScanOptions = {}): ScanResult {
  const rules = options.rules ?? ALL_RULES;
  const maxBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  const root = resolve(target);

  const files = walk(root);
  const findings: Finding[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  let bytesScanned = 0;

  for (const absolute of files) {
    const relPath = toRelPosix(root, absolute);
    if (!isScannable(relPath)) {
      filesSkipped += 1;
      continue;
    }

    let content: string;
    let size: number;
    try {
      size = statSync(absolute).size;
      if (size > maxBytes) {
        filesSkipped += 1;
        // Never skip silently. A payload hidden inside a padded, oversized file would
        // otherwise vanish from the report entirely, leaving only an opaque counter.
        findings.push({
          id: "SUPPLY-001",
          ruleId: "scan-limits",
          family: "SUPPLY",
          severity: "high",
          message: `File exceeds the ${maxBytes}-byte scan limit (${size} bytes); its contents were not analyzed.`,
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
      content = readFileSync(absolute, "utf8");
    } catch {
      filesSkipped += 1;
      continue;
    }

    // Heuristic binary guard: a NUL byte in the first 4 KiB means this is not source.
    if (content.slice(0, 4096).includes("\u0000")) {
      filesSkipped += 1;
      continue;
    }

    filesScanned += 1;
    bytesScanned += size;
    findings.push(...scanContent(content, relPath, rules));
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

/* ------------------------------------------------------------------------- */
/* CLI                                                                        */
/* ------------------------------------------------------------------------- */

interface CliOptions {
  target: string;
  json?: string;
  markdown?: string;
  failOn?: Severity;
  quiet: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions | { error: string } {
  const options: CliOptions = { target: "", quiet: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--json":
      case "--markdown": {
        const value = argv[i + 1];
        if (!value || value.startsWith("--")) return { error: `${arg} requires a file path` };
        if (arg === "--json") options.json = value;
        else options.markdown = value;
        i += 1;
        break;
      }
      case "--fail-on": {
        const value = argv[i + 1];
        if (!value || !(value in SEVERITY_RANK)) {
          return { error: "--fail-on requires one of: info, low, medium, high, critical" };
        }
        options.failOn = value as Severity;
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
        if (arg.startsWith("--")) return { error: `unknown option: ${arg}` };
        if (options.target) return { error: "only one target directory may be given" };
        options.target = arg;
    }
  }

  if (!options.target) return { error: "a target directory is required" };
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

function writeOut(path: string, contents: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), contents, "utf8");
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
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
  } catch {
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
    if (parsed.json) writeOut(parsed.json, toJsonReport(result, grading));
    if (parsed.markdown) writeOut(parsed.markdown, toMarkdownReport(result, grading));
  } catch (error) {
    process.stderr.write(`dsh-scan: failed to write report: ${(error as Error).message}\n`);
    return 2;
  }

  if (!parsed.json && !parsed.markdown && !parsed.quiet) {
    process.stdout.write(toJsonReport(result, grading));
  } else if (!parsed.quiet) {
    const c = grading.counts;
    process.stdout.write(
      `dsh-scan: grade ${grading.grade} (score ${grading.score}/100) - ` +
        `${result.findings.length} finding(s) across ${result.stats.filesScanned} file(s): ` +
        `${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low\n`,
    );
  }

  if (parsed.failOn) {
    const threshold = SEVERITY_RANK[parsed.failOn];
    if (result.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold)) return 1;
  }

  return 0;
}

export * from "./report.js";
export * from "./rules/index.js";

// Only run the CLI when executed directly, so importing this module in tests is side-effect free.
const invokedDirectly =
  process.argv[1] !== undefined && /(?:^|[\\/])index\.(?:js|ts)$|dsh-scan$/.test(process.argv[1]);
if (invokedDirectly) {
  process.exitCode = main();
}
