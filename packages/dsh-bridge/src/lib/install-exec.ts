/**
 * Execution half of `/bridge-install`: the parts that read a trust card for
 * decision-grade evidence, stage an unreviewed source for a local scan, run
 * the documented `dsh plugin add`, and verify that a layer actually mounted.
 *
 * Why this file exists (docs/reviews/pm-product-review.md §2.4): the command
 * used to print an install line and stop, so the consent ladder gated advice
 * rather than an action. A user who pasted from GitHub got zero protection.
 *
 * Design rules carried from CHARTER.md and the surrounding modules:
 *  - No global state. Every process call goes through an injected seam
 *    (`ctx.exec` in the host, doubles in tests). Absent seam means refuse and
 *    fall back to printing, never a silent no-op.
 *  - Evidence is quoted, never paraphrased: findings are copied verbatim from
 *    the committed card with a `path:line` citation, so nothing is invented.
 *  - Verification is observed, not assumed. `dsh plugin add` exiting 0 is not
 *    proof of a mount; the composed config is read back (the exact failure
 *    documented in docs/research/live-mount-report.md §2, defect 2).
 */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** One command run through the host seam. Mirrors refactor.ts's ExecRequest. */
export interface ExecRequest {
  readonly command: string;
  readonly cwd?: string;
}

/** Outcome of one seam call. `code` 0 means success, as with a shell. */
export interface ExecOutcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ExecSeam = (request: ExecRequest) => Promise<ExecOutcome>;

/** Progress sink; the host streams these lines as the install proceeds. */
export type ProgressFn = (line: string) => void;

/**
 * Feature-detect the host exec seam exactly as refactor.ts does. A context
 * without one is the normal test and pre-host case, and means "print, do not
 * run" rather than an error.
 */
export function execSeamOf(ctx: unknown): ExecSeam | null {
  const candidate = (ctx as { readonly exec?: unknown } | null)?.exec;
  return typeof candidate === "function" ? (candidate as ExecSeam) : null;
}

// ---------------------------------------------------------------------------
// Card evidence: the two worst findings, verbatim
// ---------------------------------------------------------------------------

/** Severity vocabulary of tools/scan plus the two card-only classes. */
const FINDING_RANK: Readonly<Record<string, number>> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unrated: 1,
  "not-checked": 0,
};

/** One quotable finding: the source line, unmodified, plus where it came from. */
export interface QuotedFinding {
  /** The line as committed. Never reworded, never truncated silently. */
  readonly text: string;
  /** `docs/catalog/cards/x.md:118` or `scan:src/index.js:44`. */
  readonly citation: string;
  readonly severity: keyof typeof FINDING_RANK;
}

/** Provenance of a grade: what was audited, when, and by which revision. */
export interface Provenance {
  /** Repo-relative card path, or "" when only an INDEX.md row exists. */
  readonly card: string;
  readonly pinned: string;
  readonly audited: string;
  readonly revision: string;
}

function severityOf(text: string): keyof typeof FINDING_RANK {
  const lowered = text.toLowerCase();
  for (const level of ["critical", "high", "medium", "low"] as const) {
    if (new RegExp(`\\b${level}\\b`).test(lowered)) return level;
  }
  return "unrated";
}

/**
 * Pull the worst findings out of a committed trust card.
 *
 * Two populations count, both quoted verbatim:
 *   1. rows of `## 4. Evidence` - adjudicated gates and findings, ranked by
 *      the severity word the card itself uses;
 *   2. bullets of `## 5. What we could not check` - residual unknowns, ranked
 *      last because "not checked" is weaker evidence than a finding.
 *
 * Cards vary in shape across 43 entries, so absence is reported honestly by
 * returning fewer than `limit` items rather than by inventing a row.
 */
export function worstCardFindings(
  cardMarkdown: string,
  cardPath: string,
  limit = 2,
): readonly QuotedFinding[] {
  const lines = cardMarkdown.split(/\r?\n/);
  const items: QuotedFinding[] = [];
  let section = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const header = /^##\s+(\d+)\./.exec(line);
    if (header) section = header[1] ?? "";
    const citation = `${cardPath}:${i + 1}`;

    if (section === "4" && line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      const first = cells[0] ?? "";
      // Header and separator rows carry no evidence.
      if (cells.length < 2 || first === "" || /^-+:?$/.test(first)) continue;
      if (/^(gate|finding|gate \/ finding)$/i.test(first)) continue;
      items.push({ text: line.trim(), citation, severity: severityOf(first) });
      continue;
    }

    if (section === "5" && line.trimStart().startsWith("- ")) {
      items.push({ text: line.trim(), citation, severity: "not-checked" });
    }
  }

  return [...items]
    .sort((a, b) => FINDING_RANK[b.severity] - FINDING_RANK[a.severity])
    .slice(0, limit);
}

/** Read the `## 1. Header` table for the fields that establish provenance. */
export function cardProvenance(cardMarkdown: string, cardPath: string): Provenance {
  const field = (label: RegExp): string => {
    for (const line of cardMarkdown.split(/\r?\n/)) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length >= 2 && label.test(cells[0] ?? "")) return cells[1] ?? "";
    }
    return "";
  };
  return {
    card: cardPath,
    pinned: field(/^pinned/i),
    audited: field(/^audited$/i),
    revision: field(/^revision$/i),
  };
}

/**
 * Absolute path of a card given the INDEX.md location. Both live in
 * `docs/catalog/`, so the card's repo-relative path resolves against the
 * index's directory. Returns "" when the file is not present.
 */
export function cardFilePath(indexPath: string, repoRelativeCard: string): string {
  if (indexPath === "" || repoRelativeCard === "") return "";
  const leaf = repoRelativeCard.replace(/^.*docs\/catalog\//, "");
  const candidate = join(dirname(indexPath), leaf);
  return existsSync(candidate) ? candidate : "";
}

// ---------------------------------------------------------------------------
// Staging an unreviewed source so the local scanner has something to read
// ---------------------------------------------------------------------------

/** Where a staged source landed, and how it was fetched. */
export interface StagedSource {
  readonly dir: string;
  readonly command: string;
}

export type StageResult =
  | { readonly ok: true; readonly staged: StagedSource }
  | { readonly ok: false; readonly failure: InstallFailure };

/**
 * Fetch `source` into a scratch directory using only documented tooling.
 * Nothing is executed from the fetched tree: `git clone` and `npm pack` do not
 * run package scripts, which is exactly why they are the staging verbs here
 * (`npm install` would run `prepare` before any review could happen).
 */
export async function stageSource(
  source: string,
  exec: ExecSeam,
  progress: ProgressFn,
  makeDir: () => string = () => mkdtempSync(join(tmpdir(), "dsh-bridge-stage-")),
): Promise<StageResult> {
  const dir = makeDir();
  const [scheme = "", body = ""] = splitSpecifier(source);

  let command: string;
  if (scheme === "github") command = `git clone --depth 1 https://github.com/${body}.git ${dir}`;
  else if (scheme === "npm") command = `npm pack ${body} --pack-destination ${dir} --silent && tar -xzf ${dir}/*.tgz -C ${dir}`;
  else if (scheme === "tgz") command = `tar -xzf ${body} -C ${dir}`;
  else return { ok: false, failure: unsupportedSource(source) };

  progress(`stage: ${command}`);
  const result = await exec({ command, cwd: dir });
  if (result.code !== 0) {
    return { ok: false, failure: classifyFailure("stage", command, result) };
  }
  return { ok: true, staged: { dir, command } };
}

function splitSpecifier(source: string): [string, string] {
  const match = /^([a-z]+):(.+)$/.exec(source);
  return match ? [match[1] ?? "", match[2] ?? ""] : ["", source];
}

// ---------------------------------------------------------------------------
// Failure taxonomy: every path a user can land on carries its next action
// ---------------------------------------------------------------------------

export type FailureKind =
  | "no-exec-seam"
  | "unsupported-source"
  | "network"
  | "install-failed"
  | "not-mounted"
  | "scan-failed";

/** A refusal the user can act on: what happened, why, and the next command. */
export interface InstallFailure {
  readonly kind: FailureKind;
  readonly summary: string;
  readonly detail: string;
  readonly nextSteps: readonly string[];
}

/** Patterns that mean "the machine could not reach the network", not "bad input". */
const NETWORK_MARKERS = [
  "enotfound",
  "eai_again",
  "etimedout",
  "econnrefused",
  "econnreset",
  "network is unreachable",
  "could not resolve host",
  "proxy",
  "getaddrinfo",
  "err_socket_timeout",
  "registry error",
];

export function looksLikeNetworkFailure(text: string): boolean {
  const lowered = text.toLowerCase();
  return NETWORK_MARKERS.some((marker) => lowered.includes(marker));
}

function tail(text: string, limit = 400): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `...${trimmed.slice(-(limit - 3))}`;
}

/** Turn a non-zero exec result into the right failure, network first. */
export function classifyFailure(phase: "stage" | "install", command: string, result: ExecOutcome): InstallFailure {
  const output = `${result.stdout}\n${result.stderr}`;
  if (looksLikeNetworkFailure(output)) {
    return {
      kind: "network",
      summary: "The network is unreachable, so nothing was installed.",
      detail: `\`${command}\` exited ${result.code}.\n\n${tail(output)}`,
      nextSteps: [
        "Check connectivity, then re-run the same command with the same flags.",
        "Behind a proxy, export `HTTPS_PROXY` (and `npm config set proxy`) before retrying.",
        "Nothing was written: no profile file changed, so no cleanup is needed.",
      ],
    };
  }
  if (phase === "stage") {
    return {
      kind: "scan-failed",
      summary: "The source could not be fetched for review, so it was not installed.",
      detail: `\`${command}\` exited ${result.code}.\n\n${tail(output)}`,
      nextSteps: [
        "Check the specifier: `github:owner/repo`, `npm:package`, or `tgz:./file.tgz`.",
        "For a private repo, clone it yourself and review with `/bridge-trust scan <dir>`.",
      ],
    };
  }
  return {
    kind: "install-failed",
    summary: "`dsh plugin add` failed; the profile was not changed.",
    detail: `\`${command}\` exited ${result.code}.\n\n${tail(output)}`,
    nextSteps: [
      "The most common cause is a pnpm version mismatch: `dsh plugin` bundles pnpm 10.",
      "Run `/bridge-doctor` to check the toolchain, then re-run this command.",
      "Run the command above by hand to see the full output.",
    ],
  };
}

export function noExecSeamFailure(command: string): InstallFailure {
  return {
    kind: "no-exec-seam",
    summary: "This host exposes no command-execution seam, so dsh-bridge cannot install for you.",
    detail: "The consent gate still applies to the command below; running it by hand installs the same thing.",
    nextSteps: [`Run it yourself: \`${command}\``],
  };
}

function unsupportedSource(source: string): InstallFailure {
  return {
    kind: "unsupported-source",
    summary: `Cannot review \`${source}\` locally: unknown specifier scheme.`,
    detail: "Only `github:`, `npm:`, and `tgz:` sources can be staged for a pre-install scan.",
    nextSteps: ["Clone the source yourself and run `/bridge-trust scan <dir>` before installing."],
  };
}

export function notMountedFailure(profile: string, id: string, dumpOutput: string): InstallFailure {
  return {
    kind: "not-mounted",
    summary: "The package installed but no plugin layer mounted.",
    detail: [
      `\`dsh --profile ${profile} --dump-config\` contains no \`${id}\` row, so the package`,
      "activated nothing. Per docs/research/live-mount-report.md section 2, this is what a",
      "package without a `dsh.bundle` manifest does: it installs as a plain dependency.",
      dumpOutput.trim() === "" ? "" : `\n${tail(dumpOutput, 300)}`,
    ].join("\n"),
    nextSteps: [
      `Undo it: \`dsh plugin --profile ${profile} remove ${id}\``,
      "Ask the plugin author for a `dsh.bundle` entry in package.json.",
      `Confirm by hand: \`dsh --profile ${profile} --dump-config | tail -20\``,
    ],
  };
}

// ---------------------------------------------------------------------------
// Install and verify
// ---------------------------------------------------------------------------

/** What actually changed on disk, read back after the install. */
export interface InstallChange {
  readonly command: string;
  readonly mounted: boolean;
  /** Dependency rows added to the profile manifest, `name: spec`. */
  readonly addedDependencies: readonly string[];
  /** Trimmed tail of the install output, shown as evidence. */
  readonly output: string;
}

export type InstallExecution =
  | { readonly ok: true; readonly change: InstallChange }
  | { readonly ok: false; readonly failure: InstallFailure; readonly change?: InstallChange };

export interface InstallExecInput {
  readonly exec: ExecSeam;
  readonly profile: string;
  readonly id: string;
  readonly source: string;
  readonly command: string;
  readonly profilePackageJson: string;
  readonly progress: ProgressFn;
  /** Injected so tests observe the manifest without touching a real profile. */
  readonly readManifest?: (path: string) => string;
}

function dependencyRows(manifestJson: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(manifestJson);
    const deps = (parsed as { dependencies?: Record<string, unknown> } | null)?.dependencies;
    if (deps === undefined || deps === null) return [];
    return Object.entries(deps).map(([name, spec]) => `${name}: ${String(spec)}`).sort();
  } catch {
    return [];
  }
}

/**
 * Run `dsh plugin add`, then prove the layer mounted by reading the composed
 * config back. The verify step is not optional: an exit code of 0 with no
 * mounted row is a real, observed outcome, not a hypothetical.
 */
export async function executeInstall(input: InstallExecInput): Promise<InstallExecution> {
  const read = input.readManifest ?? ((path: string) => (existsSync(path) ? readFileSync(path, "utf8") : ""));
  const before = dependencyRows(read(input.profilePackageJson));

  input.progress(`install: ${input.command}`);
  const installed = await input.exec({ command: input.command });
  if (installed.code !== 0) {
    return { ok: false, failure: classifyFailure("install", input.command, installed) };
  }

  const verifyCommand = `dsh --profile ${input.profile} --dump-config`;
  input.progress(`verify: ${verifyCommand}`);
  const dumped = await input.exec({ command: verifyCommand });
  const after = dependencyRows(read(input.profilePackageJson));
  const added = after.filter((row) => !before.includes(row));
  const mounted = dumped.code === 0 && mountedIn(dumped.stdout, input.id, input.source);

  const change: InstallChange = {
    command: input.command,
    mounted,
    addedDependencies: added,
    output: tail(`${installed.stdout}\n${installed.stderr}`, 600),
  };

  if (!mounted) {
    input.progress("verify: no layer found in the composed config");
    return { ok: false, failure: notMountedFailure(input.profile, input.id, dumped.stdout), change };
  }
  input.progress("verify: layer present in the composed config");
  return { ok: true, change };
}

/**
 * A layer is mounted when the composed config names the package. `dsh
 * --dump-config` prints a `# == <name>` marker plus a `name:` row
 * (live-mount-report.md section 5), so either is accepted, and the repo's last
 * path segment is used because the bundle name need not equal the repo name.
 */
export function mountedIn(dumpOutput: string, id: string, source: string): boolean {
  const leaf = source.split("/").pop() ?? id;
  const needles = [id, leaf].filter((needle) => needle !== "");
  return dumpOutput
    .split(/\r?\n/)
    .some((line) => /^\s*(#\s*==\s*|-?\s*(id|name):\s*)/.test(line) && needles.some((needle) => line.includes(needle)));
}
