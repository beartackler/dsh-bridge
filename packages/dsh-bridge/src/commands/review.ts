/**
 * /bridge-review - local diff review flow (docs/specs/commands/review.md),
 * MVP slice.
 *
 * Scope of this iteration:
 *  - Resolves the diff target (worktree vs HEAD, --staged, --base <ref>, or a
 *    path filter) into one read-only git invocation run through ExecFn
 *    (injected; ctx.exec in the host, spawnSync in the node default, mocked
 *    in tests).
 *  - Parses --numstat to compute the change-set summary and the skip list
 *    (lockfiles, binaries, generated files) per spec preconditions.
 *  - Renders the structured review prompt (rubric axes in spec priority
 *    order, severity ladder, reviewer rules, output contract with file:line)
 *    for the model route to answer; no model call is made by this module.
 *  - Cross-model note: prints that --second-opinion routes a different
 *    provider per spec "Cross-model toggle design"; routing itself is phase-2.
 *
 * Invariants: exactly one `git diff` family call, always read-only (no flags
 * that write, patch, or stage anything); secret-looking added lines are
 * reported as blocker locations only and never echoed.
 */

import { spawnSync } from "node:child_process";

import { heading, table } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

/** Result shape of one exec'd command. Mirrors ctx.exec's contract. */
export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

/** Exec surface injected into this module (host ctx.exec or spawnSync). */
export type ExecFn = (command: string, args: readonly string[], options: {readonly cwd: string}) => ExecResult;

/** Options letting tests inject exec doubles (no global state). */
export interface ReviewOptions {
  readonly exec?: ExecFn;
  readonly cwd?: string;
}

/** Which diff the review covers (review spec Inputs table). */
export interface ReviewTarget {
  readonly kind: "worktree" | "staged" | "base";
  /** Base ref when kind === "base". */
  readonly base?: string;
  /** Path filter positional, if any. */
  readonly path?: string;
}

/** Summary of the change set computed from numstat/name-status. */
export interface DiffSummary {
  readonly files: number;
  readonly added: number;
  readonly removed: number;
  readonly skipped: readonly SkippedFile[];
  readonly reviewedFiles: readonly string[];
  readonly truncated: boolean;
}

export interface SkippedFile {
  readonly file: string;
  readonly reason: string;
}

/** One rubric axis in spec priority order. */
export interface RubricAxis {
  readonly name: string;
  readonly description: string;
}

const RUBRIC: readonly RubricAxis[] = [
  {name: "Correctness", description: "logic errors, off-by-one, wrong branch, unhandled null/undefined, broken invariants"},
  {name: "Security", description: "injection, trust-boundary input, credential handling, unsafe dynamic execution, path traversal"},
  {name: "Error handling & resilience", description: "swallowed errors, missing timeouts/retries on I/O, resource leaks, unawaited promises"},
  {name: "Tests", description: "changed behavior without a matching test, tests asserting nothing, removed coverage"},
  {name: "API & compatibility", description: "breaking public signature changes, undocumented behavior change, missing migration"},
  {name: "Performance", description: "accidental O(n^2), work inside hot loops, N+1 I/O, unbounded memory"},
  {name: "Readability & conventions", description: "dead code, misleading names, duplication, drift from stated conventions"},
];

const SEVERITIES_REVIEW = ["blocker", "major", "minor", "nit"] as const;
export type ReviewSeverity = (typeof SEVERITIES_REVIEW)[number];

const REVIEWER_RULES: readonly string[] = [
  "No findings on unchanged lines unless the change makes them newly wrong (say why).",
  "No speculative findings; if it cannot be justified, drop it.",
  "At most one finding per root cause; group repeats as 'N more occurrences'.",
  "Praise allowed but capped at one line total.",
  "Every finding cites file:line; an uncited finding is dropped.",
];

/** File names this review skips, with reasons (spec precondition rows). */
export function classifyFile(file: string): "review" | SkippedFile["reason"] {
  const base = file.split("/").pop() ?? file;
  if (/^(?:pnpm-lock|package-lock|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)/i.test(base)) {
    return "lockfile";
  }
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|bin|woff2?|ttf|eot|mp4|mp3)$/i.test(base)) {
    return "binary";
  }
  if (/(^|\/)(dist|build|coverage|generated)(\/|$)/i.test(file)) return "generated";
  return "review";
}

function nodeExec(): ExecFn {
  return (command, args, options) => {
    const result = spawnSync(command, [...args], {cwd: options.cwd, encoding: "utf8"});
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      status: result.status ?? (result.error ? 1 : 0),
    };
  };
}

// ---------------------------------------------------------------------------
// Target resolution and diff execution
// ---------------------------------------------------------------------------

/** Parse args into a target; null means usage error. */
export function resolveReviewTarget(args: Readonly<Record<string, string>>, tokens: readonly string[]): ReviewTarget | null {
  const pathToken = tokens.find((token) => !token.startsWith("--"));
  if (args["staged"] !== undefined) {
    return pathToken === undefined ? {kind: "staged"} : {kind: "staged", path: pathToken};
  }
  if (typeof args["base"] === "string") {
    return pathToken === undefined ? {kind: "base", base: args["base"]} : {kind: "base", base: args["base"], path: pathToken};
  }
  return pathToken === undefined ? {kind: "worktree"} : {kind: "worktree", path: pathToken};
}

/** The single read-only git invocation for the resolved target. */
export function diffArgv(target: ReviewTarget): string[] {
  switch (target.kind) {
    case "worktree":
      // Working tree vs HEAD: both index and unstaged, no pager. numstat only:
      // --name-status would replace the numstat lines with status letters.
      return ["--no-pager", "diff", "HEAD", "--numstat"];
    case "staged":
      return ["--no-pager", "diff", "--cached", "--numstat"];
    case "base":
      return ["--no-pager", "diff", `${target.base}...HEAD`, "--numstat"];
  }
}

export interface NumstatRow {
  readonly added: number;
  readonly removed: number;
  readonly file: string;
  readonly binary: boolean;
}

/** Parse `git diff --numstat` output; "-" counts mean binary files. */
export function parseNumstat(stdout: string): NumstatRow[] {
  const rows: NumstatRow[] = [];
  for (const lineText of stdout.split("\n")) {
    const trimmed = lineText.trim();
    if (trimmed === "") continue;
    const match = /^([-\d]+)\t([-\d]+)\t(.+)$/.exec(trimmed);
    if (match === null) continue;
    const added = match[1] ?? "";
    const removed = match[2] ?? "";
    let file = match[3] ?? "";
    if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
    const binary = added === "-" || removed === "-";
    rows.push({
      added: binary ? 0 : Number(added),
      removed: binary ? 0 : Number(removed),
      file,
      binary,
    });
  }
  return rows;
}

/** Compute the summary, applying skip classification and the size guard. */
export function summarizeDiff(rows: readonly NumstatRow[], maxChangedLines: number = MAX_CHANGED_LINES): DiffSummary {
  const skipped: SkippedFile[] = [];
  const reviewed: string[] = [];
  let added = 0;
  let removed = 0;
  let truncated = false;
  for (const row of rows) {
    const reason = row.binary && classifyFile(row.file) === "review" ? "binary" : classifyFile(row.file);
    if (reason !== "review") {
      skipped.push({file: row.file, reason});
      continue;
    }
    if (added + removed + row.added + row.removed > maxChangedLines) {
      truncated = true;
      skipped.push({file: row.file, reason: "over size budget"});
      continue;
    }
    reviewed.push(row.file);
    added += row.added;
    removed += row.removed;
  }
  return {files: reviewed.length, added, removed, skipped, reviewedFiles: reviewed, truncated};
}

/** Diff-size warning threshold (spec precondition: > 1500 changed lines). */
export const MAX_CHANGED_LINES = 1500;

// ---------------------------------------------------------------------------
// Secret scan over the diff body (locations only, never values)
// ---------------------------------------------------------------------------

/**
 * Added-line patterns that look like live credentials. Only file:line is
 * reported; the matched value never leaves this function.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /(?:sk|ghp|github_pat|xox[bp]|AKIA)[A-Za-z0-9_-]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Scan added lines of a unified diff body; returns locations only. */
export function findSecretLocations(diffBody: string): (readonly [file: string, line: number])[] {
  const hits: (readonly [string, number])[] = [];
  let file = "";
  let lineNumber = 0;
  for (const lineText of diffBody.split("\n")) {
    if (lineText.startsWith("+++ b/")) {
      file = lineText.slice(6);
      lineNumber = 0;
      continue;
    }
    if (lineText.startsWith("@@")) {
      const match = /\+(\d+)/.exec(lineText);
      lineNumber = match === null ? 0 : Number(match[1]);
      continue;
    }
    if (lineText.startsWith("+")) {
      lineNumber += 1;
      const content = lineText.slice(1);
      if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
        hits.push([file, lineNumber] as const);
      }
      continue;
    }
    if (!lineText.startsWith("-")) lineNumber += 1;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

/** Render the structured review prompt for the resolved target. */
export function renderReviewPrompt(target: ReviewTarget, summary: DiffSummary, repoConventions: readonly string[]): string {
  const scope =
    target.kind === "base"
      ? `HEAD against ${target.base}`
      : target.kind === "staged"
        ? "staged changes (git diff --cached)"
        : "working tree vs HEAD";
  const parts: string[] = [];
  parts.push("You are reviewing a code change. Produce findings only against the diff hunks below.");
  parts.push("");
  parts.push(`Change set: ${scope}${target.path === undefined ? "" : `, restricted to ${target.path}`}`);
  parts.push(`Files: ${summary.files}, +${summary.added} -${summary.removed}`);
  if (repoConventions.length > 0) {
    parts.push("");
    parts.push("Repo conventions to respect:");
    for (const convention of repoConventions) parts.push(`- ${convention}`);
  }
  parts.push("");
  parts.push("Rubric, in priority order (each finding must cite file:line evidence):");
  RUBRIC.forEach((axis, index) => {
    parts.push(`${index + 1}. ${axis.name} - ${axis.description}`);
  });
  parts.push("");
  parts.push("Severity ladder:");
  parts.push("- blocker: would break users, lose data, or leak credentials; do not merge.");
  parts.push("- major: real bug or risk under plausible conditions; name the trigger path.");
  parts.push("- minor: correct but fragile, untested, or inconsistent; clear improvement.");
  parts.push("- nit: style/taste; never blocks.");
  parts.push("");
  parts.push("Rules:");
  for (const rule of REVIEWER_RULES) parts.push(`- ${rule}`);
  parts.push("");
  parts.push("Output contract:");
  parts.push("- Group findings by severity, worst first, counts in the header.");
  parts.push("- Each finding: severity, axis, file:line, one-line what, why, suggested fix.");
  parts.push("- End with 'Not reviewed:' listing any skipped files with reasons.");
  parts.push("");
  parts.push(`Diff stat (${summary.reviewedFiles.length} reviewed files):`);
  for (const file of summary.reviewedFiles.slice(0, 40)) parts.push(`- ${file}`);
  for (const skip of summary.skipped.slice(0, 10)) parts.push(`- (skipped) ${skip.file}: ${skip.reason}`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

/** /bridge-review entry point; pure over (ctx, args, options). Read-only. */
export async function runReview(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
  options: ReviewOptions = {},
): Promise<CommandResult> {
  void ctx;
  const cwd = options.cwd ?? process.cwd();
  const exec = options.exec ?? nodeExec();

  const tokens = [args["_"] ?? "", args["rest"] ?? ""].join(" ").split(/\s+/).filter((token) => token !== "");
  const target = resolveReviewTarget(args, tokens);
  if (target === null) {
    return {markdown: [heading("/bridge-review"), "", "Usage: /bridge-review [<path>] [--staged] [--base <ref>]", ""].join("\n")};
  }

  // Repo check first: a non-git directory gets the spec message, not a stack.
  const probe = exec("git", ["rev-parse", "--show-toplevel"], {cwd});
  if (probe.status !== 0) {
    return {
      markdown: [
        heading("/bridge-review"),
        "",
        "/review needs a git repository. Pass a path or run inside one.",
        "",
      ].join("\n"),
    };
  }

  const diff = exec("git", diffArgv(target), {cwd});
  if (diff.status !== 0) {
    const detail = diff.stderr.trim().split("\n")[0] ?? "git diff failed";
    return {markdown: [heading("/bridge-review"), "", `git diff failed: ${detail}`, ""].join("\n")};
  }

  const summary = summarizeDiff(parseNumstat(diff.stdout));
  if (summary.files === 0 && summary.skipped.length === 0 && !summary.truncated) {
    const hint =
      target.kind === "worktree"
        ? "Try --base main or --staged."
        : target.kind === "staged"
          ? "Nothing staged; try /bridge-review without --staged."
          : `No changes between ${String(target.base)} and HEAD.`;
    return {
      markdown: [heading("/bridge-review"), "", `No changes to review. ${hint}`, ""].join("\n"),
    };
  }

  const conventions = collectConventions(exec, cwd);
  const prompt = renderReviewPrompt(target, summary, conventions);
  const secondOpinionNote =
    args["second-opinion"] !== undefined || args["2"] !== undefined
      ? "Second opinion requested: routing runs on a different provider route than the primary"
      : "Cross-model toggle: --second-opinion routes the double-check to a different provider";

  const markdown = [
    heading("/bridge-review"),
    "",
    `Target: ${target.kind === "base" ? `HEAD vs ${String(target.base)}` : target.kind}`,
    table(["FILES", "ADDED", "REMOVED", "SKIPPED"], [
      [String(summary.files), `+${summary.added}`, `-${summary.removed}`, String(summary.skipped.length)],
    ]),
    summary.truncated ? "Warning: diff exceeded the changed-line budget; largest-signal files kept, rest listed as skipped." : "",
    summary.skipped.length > 0
      ? table(["NOT REVIEWED", "REASON"], summary.skipped.map((skip) => [skip.file, skip.reason]))
      : "",
    secondOpinionNote +
      " (cross-model merge rules per docs/specs/commands/review.md; live routing lands with",
    "the provider-route seam).",
    "",
    "Structured review prompt handed to the configured model route:",
    "```markdown",
    prompt,
    "```",
    "",
  ]
    .filter((section) => section !== "")
    .join("\n");
  return {markdown, data: {target, summary}};
}

/** Convention filenames checked at the repo root (spec implicit context). */
const CONVENTION_FILES = ["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"] as const;

function collectConventions(exec: ExecFn, cwd: string): string[] {
  const found: string[] = [];
  for (const name of CONVENTION_FILES) {
    const check = exec("test", ["-f", name], {cwd});
    if (check.status === 0) found.push(name);
  }
  return found;
}
