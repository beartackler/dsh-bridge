/**
 * /bridge-improve - adversarial over-engineering audit (docs/specs/commands/improve.md).
 *
 * `/review` asks whether the code is correct. This asks what can be deleted.
 * Findings are ranked by deletion value and rendered one line each.
 *
 * Invariants from the spec and CHARTER.md:
 *  - Read-only. Source is read through injected fs functions; nothing is written.
 *  - `--diff` is the only path that shells out, and only for
 *    `git diff --name-only` forms (spec "Execution model").
 *  - Analysis is pure over (path, content): deterministic, fixture-testable.
 *  - Every finding states a cut and a replacement; one without both never fires.
 *  - ASCII only, no emoji.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { heading, table } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

/** How much complexity disappears if the finding is acted on. */
export type DeletionValue = "high" | "medium" | "low";

export type DetectorId =
  | "oversized-file"
  | "long-function"
  | "deep-nesting"
  | "commented-out-code"
  | "comment-ratio"
  | "todo-debt";

/** One audit finding. `cut` and `replacement` are both required by contract. */
export interface ImproveFinding {
  readonly detector: DetectorId;
  readonly value: DeletionValue;
  readonly path: string;
  readonly line: number;
  /** What to delete or split. */
  readonly cut: string;
  /** What stands in its place. */
  readonly replacement: string;
  /** Estimated lines removable; the secondary sort key. */
  readonly removableLines: number;
}

export interface SkippedFile {
  readonly path: string;
  readonly reason: string;
}

export interface ImproveReport {
  readonly findings: readonly ImproveFinding[];
  readonly audited: readonly { readonly path: string; readonly lines: number }[];
  readonly skipped: readonly SkippedFile[];
  /** Findings dropped by --limit, after filtering. */
  readonly truncated: number;
}

/** Filesystem and process seams, injected so tests never touch the real repo. */
export interface ImproveDeps {
  readFile(path: string): string;
  /** Direct children of a directory, names only. */
  readDir(path: string): readonly string[];
  statPath(path: string): { readonly isFile: boolean; readonly isDirectory: boolean } | null;
  /** Read-only `git diff --name-only ...` runner; returns one path per line. */
  gitDiffNames(cwd: string): readonly string[];
}

// ---------------------------------------------------------------------------
// Thresholds (spec "Detectors")
// ---------------------------------------------------------------------------

export const FILE_LINES_WARN = 300;
export const FILE_LINES_HIGH = 600;
export const FUNCTION_LINES_WARN = 50;
export const FUNCTION_LINES_HIGH = 120;
export const NESTING_WARN = 5;
export const NESTING_HIGH = 7;
export const COMMENT_RATIO_WARN = 0.4;

const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

const VALUE_RANK: Record<DeletionValue, number> = { high: 3, medium: 2, low: 1 };

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

interface ClassifiedLine {
  readonly text: string;
  readonly comment: boolean;
  /** Comment and string content stripped, so brace counting stays honest. */
  readonly code: string;
}

/**
 * Classify each line as comment or code and strip literals from the code half.
 * A single pass over the file with a block-comment flag; good enough for brace
 * counting, and the spec scopes this to brace-delimited languages.
 */
export function classifyLines(content: string): readonly ClassifiedLine[] {
  const lines = content.split(/\r?\n/);
  const out: ClassifiedLine[] = [];
  let inBlock = false;

  for (const text of lines) {
    const trimmed = text.trim();
    if (inBlock) {
      const end = trimmed.indexOf("*/");
      if (end === -1) {
        out.push({ text, comment: true, code: "" });
        continue;
      }
      inBlock = false;
      const rest = trimmed.slice(end + 2);
      out.push({ text, comment: rest.trim().length === 0, code: stripLiterals(rest) });
      continue;
    }
    if (trimmed.startsWith("//")) {
      out.push({ text, comment: true, code: "" });
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/", 2);
      if (end === -1) {
        inBlock = true;
        out.push({ text, comment: true, code: "" });
        continue;
      }
      const rest = trimmed.slice(end + 2);
      out.push({ text, comment: rest.trim().length === 0, code: stripLiterals(rest) });
      continue;
    }
    if (trimmed.includes("/*") && !trimmed.includes("*/")) inBlock = true;
    out.push({ text, comment: false, code: stripLiterals(trimmed) });
  }
  return out;
}

/** Remove string/template/regex-ish literals and trailing comments from a code line. */
function stripLiterals(line: string): string {
  return line
    .replace(/\\./g, "")
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, "``")
    .replace(/\/\*.*?\*\//g, "")
    .replace(/\/\/.*$/, "");
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

const FUNCTION_START =
  /(^|\s)(function\s+[A-Za-z0-9_$]*|[A-Za-z0-9_$]+\s*\([^)]*\)\s*\{|=>\s*\{|=\s*async\s*\()/;

/** Control keywords that look like a call site but open a block, not a function. */
const CONTROL_KEYWORD = /(^|[^A-Za-z0-9_$])(if|for|while|switch|catch|do)\s*\(/;

/**
 * Braces that open executable blocks. Object and type literals also use braces
 * but are data, not nesting, so they are balanced without raising the depth
 * (self-audit finding: a nested `data:` payload read as depth-6 control flow).
 */
const BLOCK_OPENER =
  /(^|[^A-Za-z0-9_$])(if|else|for|while|switch|case|try|catch|finally|do|function|class|=>)\b|\)\s*\{\s*$/;

/** `name(` capture for the message; falls back to an anonymous label. */
function functionLabel(code: string): string {
  const named = /function\s+([A-Za-z0-9_$]+)/.exec(code) ?? /([A-Za-z0-9_$]+)\s*\(/.exec(code);
  const name = named?.[1];
  return typeof name === "string" && name.length > 0 ? `\`${name}\`` : "the anonymous function";
}

const CODE_IN_COMMENT = /(;\s*$|\{\s*$|=>|\)\s*\{|^\s*(return|const|let|var|if|for|while|import|export)\b)/;

/** Analyze one file. Pure over (path, content) - the whole detector surface. */
export function analyzeFile(path: string, content: string): readonly ImproveFinding[] {
  const lines = classifyLines(content);
  const findings: ImproveFinding[] = [];
  const total = lines.length;

  // oversized-file
  if (total > FILE_LINES_WARN) {
    findings.push({
      detector: "oversized-file",
      value: total > FILE_LINES_HIGH ? "high" : "medium",
      path,
      line: 1,
      cut: `split file (${total} lines)`,
      replacement: "move the second responsibility into its own module",
      removableLines: total - FILE_LINES_WARN,
    });
  }

  // comment-ratio
  const commentCount = lines.filter((entry) => entry.comment).length;
  const codeCount = lines.filter((entry) => !entry.comment && entry.code.trim().length > 0).length;
  if (total >= 40 && codeCount > 0 && commentCount / total > COMMENT_RATIO_WARN) {
    const percent = Math.round((commentCount / total) * 100);
    findings.push({
      detector: "comment-ratio",
      value: "low",
      path,
      line: 1,
      cut: `${percent} percent comments`,
      replacement: "keep the why, delete the comments restating the what",
      removableLines: commentCount - Math.round(total * COMMENT_RATIO_WARN),
    });
  }

  findings.push(...scanStructure(path, lines));
  return findings;
}

/**
 * Second pass: everything that needs positional state (brace depth, the open
 * function stack). Split out of analyzeFile so neither half exceeds the
 * long-function threshold this command itself enforces.
 */
function scanStructure(path: string, lines: readonly ClassifiedLine[]): readonly ImproveFinding[] {
  const findings: ImproveFinding[] = [];
  /** One entry per open brace; true when it opened an executable block. */
  const braces: boolean[] = [];
  let maxDepthReported = 0;
  const functionStack: { readonly startLine: number; readonly depth: number; readonly label: string }[] = [];
  const blockDepth = (): number => braces.filter(Boolean).length;

  for (let index = 0; index < lines.length; index += 1) {
    const entry = lines[index] as ClassifiedLine;
    const lineNumber = index + 1;

    if (entry.comment) {
      const body = entry.text.replace(/^\s*(\/\/+|\/\*+|\*+)/, "").trim();
      if (body.length > 0 && CODE_IN_COMMENT.test(body)) {
        findings.push({
          detector: "commented-out-code",
          value: "high",
          path,
          line: lineNumber,
          cut: "delete commented-out code",
          replacement: "git history already has it",
          removableLines: 1,
        });
      }
      pushTodo(findings, path, lineNumber, entry.text);
      continue;
    }

    // Only the trailing-comment half of a code line can hold a marker; a
    // marker inside a string literal is data, not debt (self-audit finding).
    pushTodo(findings, path, lineNumber, trailingComment(entry.text));

    const opens = countChar(entry.code, "{");
    const closes = countChar(entry.code, "}");

    if (opens > 0 && FUNCTION_START.test(entry.code) && !CONTROL_KEYWORD.test(entry.code)) {
      functionStack.push({ startLine: lineNumber, depth: blockDepth(), label: functionLabel(entry.code) });
    }

    const isBlock = BLOCK_OPENER.test(entry.code);
    for (let brace = 0; brace < opens; brace += 1) braces.push(isBlock);
    const depth = blockDepth();
    if (depth >= NESTING_WARN && depth > maxDepthReported) {
      maxDepthReported = depth;
      findings.push({
        detector: "deep-nesting",
        value: depth >= NESTING_HIGH ? "high" : "medium",
        path,
        line: lineNumber,
        cut: `flatten depth-${depth} block`,
        replacement: "early return on the guard conditions",
        removableLines: depth,
      });
    }
    for (let brace = 0; brace < closes; brace += 1) braces.pop();

    while (
      functionStack.length > 0 &&
      blockDepth() <= (functionStack[functionStack.length - 1] as { depth: number }).depth
    ) {
      const fn = functionStack.pop() as { startLine: number; depth: number; label: string };
      const length = lineNumber - fn.startLine + 1;
      if (length > FUNCTION_LINES_WARN) {
        findings.push({
          detector: "long-function",
          value: length > FUNCTION_LINES_HIGH ? "high" : "medium",
          path,
          line: fn.startLine,
          cut: `split ${fn.label} (${length} lines)`,
          replacement: "extract the phases it already names in comments",
          removableLines: length,
        });
      }
    }
  }
  return findings;
}

const TODO_MARKER = /\b(TODO|FIXME|XXX|HACK)\b/;

/** The `// ...` tail of a code line, with literals removed first. */
function trailingComment(text: string): string {
  const stripped = text.replace(/\\./g, "").replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, "``");
  const at = stripped.indexOf("//");
  return at === -1 ? "" : stripped.slice(at);
}

function pushTodo(sink: ImproveFinding[], path: string, line: number, text: string): void {
  const match = TODO_MARKER.exec(text);
  const marker = match?.[1];
  if (typeof marker !== "string") return;
  const urgent = marker === "FIXME" || marker === "HACK";
  sink.push({
    detector: "todo-debt",
    value: urgent ? "medium" : "low",
    path,
    line,
    cut: `resolve or delete ${marker}`,
    replacement: "file an issue, drop the comment",
    removableLines: 1,
  });
}

function countChar(text: string, char: string): number {
  let count = 0;
  for (const character of text) if (character === char) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Value desc, removable lines desc, then file:line. Stable across runs. */
export function rankFindings(findings: readonly ImproveFinding[]): readonly ImproveFinding[] {
  return [...findings].sort((a, b) => {
    const byValue = VALUE_RANK[b.value] - VALUE_RANK[a.value];
    if (byValue !== 0) return byValue;
    const byLines = b.removableLines - a.removableLines;
    if (byLines !== 0) return byLines;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.line - b.line;
  });
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

function isSupported(path: string): boolean {
  return SUPPORTED_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/** Resolve a target into the file list to audit, plus what was skipped and why. */
export function resolveTargets(
  deps: ImproveDeps,
  target: string,
): { readonly files: readonly string[]; readonly skipped: readonly SkippedFile[] } {
  const stat = deps.statPath(target);
  if (stat === null) return { files: [], skipped: [{ path: target, reason: "not found" }] };
  if (stat.isFile) {
    return isSupported(target)
      ? { files: [target], skipped: [] }
      : { files: [], skipped: [{ path: target, reason: "unsupported extension" }] };
  }
  const files: string[] = [];
  const skipped: SkippedFile[] = [];
  for (const name of [...deps.readDir(target)].sort()) {
    const child = join(target, name);
    const childStat = deps.statPath(child);
    if (childStat === null || !childStat.isFile) continue;
    if (isSupported(child)) files.push(child);
    else skipped.push({ path: child, reason: "unsupported extension" });
  }
  return { files, skipped };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface ImproveOptions {
  readonly target?: string;
  readonly diff: boolean;
  readonly minValue: DeletionValue;
  readonly limit: number;
}

export const DEFAULT_LIMIT = 12;

/** Parse the flag record the command layer hands down. Unknown keys ignored. */
export function parseImproveArgs(args: Readonly<Record<string, string>>): ImproveOptions {
  // The entry splitter (src/index.ts parseArgs) assigns the token after a flag
  // as that flag's value, so `--diff src/commands` arrives as
  // {diff: "src/commands"} with no positional. Treat any value other than an
  // explicit "false" as the flag being set, and its non-boolean value as the
  // path filter, so the documented `--diff <path>` form works.
  const rawDiff = args["diff"];
  const diff = rawDiff !== undefined && rawDiff !== "false";
  const diffTarget = diff && rawDiff !== "" && rawDiff !== "true" ? rawDiff : "";
  const rawTarget = args["target"] ?? args["_"] ?? diffTarget;
  const target = rawTarget.trim();
  const minValue = args["min-value"];
  const limit = Number.parseInt(args["limit"] ?? "", 10);
  return {
    ...(target.length > 0 ? { target } : {}),
    diff,
    minValue: minValue === "high" || minValue === "medium" || minValue === "low" ? minValue : "low",
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
  };
}

export class ImproveError extends Error {}

/** Run the audit over resolved options. Throws ImproveError for user errors. */
export function auditTargets(deps: ImproveDeps, options: ImproveOptions, cwd: string): ImproveReport {
  const files: string[] = [];
  const skipped: SkippedFile[] = [];

  if (options.diff) {
    const changed = deps.gitDiffNames(cwd);
    // `--diff <path>` narrows the changed set. The names may be absolute (the
    // node deps anchor them to the repo root) or relative (in-memory test
    // deps), so the prefix is matched against both forms.
    const target = options.target;
    const filtered =
      typeof target === "string"
        ? changed.filter((path) => path.startsWith(target) || path.startsWith(join(cwd, target)))
        : changed;
    for (const path of filtered) {
      if (isSupported(path)) files.push(path);
      else skipped.push({ path, reason: "unsupported extension" });
    }
  } else if (typeof options.target === "string") {
    const resolved = resolveTargets(deps, options.target);
    files.push(...resolved.files);
    skipped.push(...resolved.skipped);
  } else {
    throw new ImproveError("/improve needs a path or --diff.");
  }

  const audited: { path: string; lines: number }[] = [];
  const raw: ImproveFinding[] = [];
  for (const path of files) {
    let content: string;
    try {
      content = deps.readFile(path);
    } catch {
      skipped.push({ path, reason: "unreadable" });
      continue;
    }
    if (content.trim().length === 0) {
      skipped.push({ path, reason: "empty" });
      continue;
    }
    audited.push({ path, lines: content.split(/\r?\n/).length });
    raw.push(...analyzeFile(path, content));
  }

  const kept = rankFindings(raw).filter(
    (finding) => VALUE_RANK[finding.value] >= VALUE_RANK[options.minValue],
  );
  return {
    findings: kept.slice(0, options.limit),
    audited,
    skipped,
    truncated: Math.max(0, kept.length - options.limit),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function valueBadge(value: DeletionValue): string {
  switch (value) {
    case "high":
      return "[ HIGH ]";
    case "medium":
      return "[ MEDIUM ]";
    case "low":
      return "[ LOW ]";
  }
}

/** One line per finding; no prose. Empty ledgers print a single line. */
export function renderImproveReport(report: ImproveReport): string {
  const fileCount = report.audited.length;
  const lineCount = report.audited.reduce((sum, entry) => sum + entry.lines, 0);
  const removable = report.findings.reduce((sum, finding) => sum + finding.removableLines, 0);

  if (report.findings.length === 0) {
    const tail = report.skipped.length > 0 ? `\nNot audited: ${renderSkipped(report.skipped)}` : "";
    return `No findings. Audited ${fileCount} files, ${lineCount} lines.${tail}`;
  }

  const rows = report.findings.map((finding) => [
    valueBadge(finding.value),
    `${finding.path}:${finding.line}`,
    finding.detector,
    `${finding.cut} -> ${finding.replacement}`,
  ]);

  const parts: string[] = [
    heading("/bridge-improve"),
    `Audited ${fileCount} files, ${lineCount} lines. ${report.findings.length} findings, ~${removable} lines removable.`,
    "",
    table(["VALUE", "LOCATION", "DETECTOR", "ACTION"], rows),
  ];
  if (report.truncated > 0) {
    parts.push(`${report.truncated} more findings hidden by --limit.`);
  }
  if (report.skipped.length > 0) {
    parts.push(`Not audited: ${renderSkipped(report.skipped)}`);
  }
  return parts.join("\n");
}

function renderSkipped(skipped: readonly SkippedFile[]): string {
  return skipped.map((entry) => `${entry.path} (${entry.reason})`).join(", ");
}

// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------

/** Real seams: fs reads plus the two read-only git diff forms. */
export function defaultImproveDeps(): ImproveDeps {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    readDir: (path) => readdirSync(path),
    statPath: (path) => {
      try {
        const stats = statSync(path);
        return { isFile: stats.isFile(), isDirectory: stats.isDirectory() };
      } catch {
        return null;
      }
    },
    gitDiffNames: (cwd) => {
      const run = (args: readonly string[]): string[] =>
        execFileSync("git", [...args], { cwd, encoding: "utf8" })
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      try {
        // `git diff --name-only` prints paths relative to the repository root,
        // not to `cwd`. Reading them as-is fails with "unreadable" whenever the
        // session cwd is a subdirectory (e.g. packages/dsh-bridge), so each
        // name is anchored to the root git itself reports.
        const root = run(["rev-parse", "--show-toplevel"])[0] ?? cwd;
        const names = new Set([
          ...run(["diff", "--name-only", "HEAD"]),
          ...run(["diff", "--name-only", "--cached"]),
        ]);
        return [...names].sort().map((name) => join(root, name));
      } catch {
        throw new ImproveError("/improve --diff needs a git repository.");
      }
    },
  };
}

/** Optional session working directory carried on the context. */
export interface ImproveContext extends BridgeContext {
  /** Working directory of the current session; defaults to the process cwd. */
  readonly cwd?: string;
}

/** /bridge-improve entry point; pure over (ctx, args, deps). */
export async function runImprove(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
  deps: ImproveDeps = defaultImproveDeps(),
): Promise<CommandResult> {
  const options = parseImproveArgs(args);
  try {
    // `--diff` runs git in the user's working directory, not in `$HOME`.
    // `ctx.paths.home` is the credential/config root; using it here pointed
    // `git diff` at the home directory, which is never the repository under
    // review. Same shape as resume.ts:241.
    const cwd = (ctx as ImproveContext).cwd ?? process.cwd();
    const report = auditTargets(deps, options, cwd);
    return {
      markdown: renderImproveReport(report),
      data: {
        target: options.diff ? { kind: "diff" } : { kind: "path", value: options.target ?? "" },
        audited: report.audited,
        skipped: report.skipped,
        findings: report.findings,
        totals: {
          files: report.audited.length,
          lines: report.audited.reduce((sum, entry) => sum + entry.lines, 0),
          findings: report.findings.length,
          removableLines: report.findings.reduce((sum, finding) => sum + finding.removableLines, 0),
        },
      },
    };
  } catch (error) {
    if (error instanceof ImproveError) return { markdown: error.message };
    throw error;
  }
}
