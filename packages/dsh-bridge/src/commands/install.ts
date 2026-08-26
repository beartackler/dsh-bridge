/**
 * `/bridge-install` - verified installer front-end (docs/specs/commands/install.md).
 *
 * Scope of this phase: everything up to, but not including, execution. The
 * command resolves a name against the committed catalog, renders the trust
 * summary, runs the consent gate, and then *prints* the native install command
 * for the user to run. It never spawns `dsh plugin`, never writes a profile,
 * and never touches the network (ponytail discipline: the review half of the
 * spec is the half that carries the risk).
 *
 * Catalog inputs, both committed and read-only:
 *   docs/catalog/manifest.json  entries (`name`, `repo`, `url`, `category`, ...)
 *   docs/catalog/INDEX.md       the graded rows: grade, verdict, date, card path
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - A grade is never fabricated. No INDEX.md row means Unlisted (spec §5.2).
 *  - Ambiguity is never resolved silently (spec §3): candidates are listed and
 *    nothing is emitted.
 *  - Unverified, D, and F entries require the explicit
 *    `--i-accept-unverified-risk` flag; F additionally requires `--force`
 *    (AC-9, AC-10). No keypress, `--yes`, or bare Enter satisfies the gate.
 *  - Missing/unparseable catalog fails closed to unverified with a degraded
 *    banner (F-4 / AC-23).
 *  - Every emitted command is accompanied by its undo command (AC-21).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BridgeContext, CommandResult } from "../lib/types.js";

/** Grades the catalog can carry. `?` means graded row absent. */
export type Grade = "A" | "B" | "C" | "D" | "F";

/** Grades that may be installed after a single confirmation (spec §5.1). */
const CONSENT_FREE_GRADES: readonly Grade[] = ["A", "B", "C"];

/** Flag that alone satisfies the §5.3 risk gate. Never suggested by the UI. */
export const RISK_FLAG = "i-accept-unverified-risk";

/** One catalog row joined with its graded INDEX.md row, when present. */
export interface InstallCandidate {
  /** Canonical catalog id: the short plugin name, lowercase. */
  readonly id: string;
  /** `owner/repo` as written in the manifest, subpath stripped. */
  readonly repo: string;
  /** Native specifier passed to `dsh plugin add`, e.g. `github:owner/repo`. */
  readonly source: string;
  readonly category: string;
  readonly description: string;
  /** null when no graded INDEX.md row cites this repo. */
  readonly grade: Grade | null;
  readonly verdict: string;
  readonly verifiedAt: string;
  /** Repo-relative card path, e.g. `docs/catalog/cards/ponytail.md`. */
  readonly card: string;
}

/** Explicit paths so tests can pin fixtures; no global state. */
export interface InstallOptions {
  readonly manifestPath?: string;
  readonly indexPath?: string;
}

// ---------------------------------------------------------------------------
// Catalog location and loading
// ---------------------------------------------------------------------------

/**
 * Walk up from this compiled module to the checkout's `docs/catalog`.
 * Returns undefined when absent so the command degrades (F-4) instead of
 * throwing.
 */
export function resolveInstallCatalog(
  startDir: string = dirname(fileURLToPath(import.meta.url)),
): { manifestPath: string; indexPath: string } | undefined {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const catalog = join(dir, "docs", "catalog");
    if (existsSync(join(catalog, "manifest.json"))) {
      return { manifestPath: join(catalog, "manifest.json"), indexPath: join(catalog, "INDEX.md") };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * `owner/repo`, lowercase, `.git` and any `#subpath` stripped. Subpath entries
 * share their parent repo's audit, exactly as /bridge-browse joins them.
 */
export function repoBase(repo: string): string {
  const head = repo.toLowerCase().replace(/\.git$/, "").split("#")[0] ?? "";
  const segments = head.split("/").filter((part) => part !== "");
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : head;
}

/** Short catalog id: the repo's last path segment, lowercase. */
export function shortId(repo: string): string {
  const base = repoBase(repo);
  return base.split("/").pop() ?? base;
}

/**
 * One graded row of docs/catalog/INDEX.md:
 * `| B | label | owner/repo | stars | verdict | date | [card](cards/x.md) |`
 * Only rows whose grade cell is a bare A-F letter count; the grading-band
 * prose and revision tables can never contribute a grade.
 */
export function parseIndexGrades(indexMarkdown: string): Map<string, InstallGradeRow> {
  const rows = new Map<string, InstallGradeRow>();
  for (const line of indexMarkdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 7) continue;
    const grade = cells[0] ?? "";
    if (!/^[A-F]$/.test(grade)) continue;
    const repo = cells[2] ?? "";
    if (!repo.includes("/")) continue;
    const cardMatch = /\(([^)]+\.md)\)/.exec(cells[6] ?? "");
    rows.set(repoBase(repo), {
      grade: grade as Grade,
      label: cells[1] ?? "",
      verdict: cells[4] ?? "",
      verifiedAt: cells[5] ?? "",
      card: cardMatch ? `docs/catalog/${cardMatch[1]}` : "",
    });
  }
  return rows;
}

/** A graded INDEX.md row, keyed by repo base. */
export interface InstallGradeRow {
  readonly grade: Grade;
  readonly label: string;
  readonly verdict: string;
  readonly verifiedAt: string;
  readonly card: string;
}

interface CatalogCache {
  readonly manifestPath: string;
  readonly indexPath: string;
  readonly stamp: string;
  readonly candidates: readonly InstallCandidate[];
}

let catalogCache: CatalogCache | undefined;

/** Load and join manifest + INDEX, memoized per (path, mtime) pair. */
export function loadCandidates(manifestPath: string, indexPath: string): readonly InstallCandidate[] {
  const stamp = `${mtimeOf(manifestPath)}:${mtimeOf(indexPath)}`;
  if (
    catalogCache &&
    catalogCache.manifestPath === manifestPath &&
    catalogCache.indexPath === indexPath &&
    catalogCache.stamp === stamp
  ) {
    return catalogCache.candidates;
  }

  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`catalog manifest must be a JSON array: ${manifestPath}`);
  const grades = existsSync(indexPath)
    ? parseIndexGrades(readFileSync(indexPath, "utf8"))
    : new Map<string, InstallGradeRow>();

  const candidates: InstallCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of parsed) {
    if (raw === null || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const repo = typeof record["repo"] === "string" ? record["repo"] : "";
    if (repo === "") continue;
    const base = repoBase(repo);
    if (base === "" || seen.has(base)) continue;
    seen.add(base);
    const row = grades.get(base);
    candidates.push({
      id: shortId(repo),
      repo: base,
      source: `github:${base}`,
      category: typeof record["category"] === "string" ? record["category"] : "",
      description: typeof record["description_en"] === "string" ? record["description_en"] : "",
      grade: row?.grade ?? null,
      verdict: row?.verdict ?? "",
      verifiedAt: row?.verifiedAt ?? "",
      card: row?.card ?? "",
    });
  }

  catalogCache = { manifestPath, indexPath, stamp, candidates };
  return candidates;
}

function mtimeOf(path: string): string {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return "absent";
  }
}

// ---------------------------------------------------------------------------
// Resolution (spec §3)
// ---------------------------------------------------------------------------

export type Resolution =
  | { readonly kind: "match"; readonly rule: ResolutionRule; readonly candidate: InstallCandidate }
  | { readonly kind: "ambiguous"; readonly rule: ResolutionRule; readonly candidates: readonly InstallCandidate[] }
  | { readonly kind: "unlisted"; readonly source: string; readonly id: string }
  | { readonly kind: "not-found"; readonly nearMisses: readonly InstallCandidate[] };

/** Which spec §3 rule produced the result; shown so resolution is auditable. */
export type ResolutionRule = "id" | "repo" | "source" | "fuzzy";

/** Native specifier shapes accepted verbatim (spec §3 rule 4). */
const SPECIFIER = /^(github|npm|tgz):(.+)$/;

/** Levenshtein distance, capped early: only distances <= 2 matter here. */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 3;
}

/**
 * Resolve a user-typed name. Order is the spec's table, first rule wins:
 *   1. exact catalog id            2. exact `owner/repo`
 *   3. explicit specifier (reverse-lookup by source, else Unlisted)
 *   4. fuzzy: unique prefix or edit distance <= 2 -> disambiguation only
 * Nothing here touches the network; all four rules read the catalog only.
 */
export function resolve(input: string, candidates: readonly InstallCandidate[]): Resolution {
  const query = input.trim().toLowerCase();

  const byId = candidates.filter((entry) => entry.id === query);
  if (byId.length === 1 && byId[0]) return { kind: "match", rule: "id", candidate: byId[0] };
  if (byId.length > 1) return { kind: "ambiguous", rule: "id", candidates: byId };

  const byRepo = candidates.find((entry) => entry.repo === repoBase(query));
  if (byRepo && query.includes("/") && !SPECIFIER.test(query)) {
    return { kind: "match", rule: "repo", candidate: byRepo };
  }

  const specifier = SPECIFIER.exec(query);
  if (specifier) {
    const scheme = specifier[1] ?? "";
    const body = specifier[2] ?? "";
    if (scheme === "github") {
      const hit = candidates.find((entry) => entry.repo === repoBase(body));
      // Rule 4: a specifier matching a catalog source is promoted to verified.
      if (hit) return { kind: "match", rule: "source", candidate: hit };
    }
    return { kind: "unlisted", source: `${scheme}:${body}`, id: shortId(body) || body };
  }

  const prefixed = candidates.filter((entry) => entry.id.startsWith(query));
  if (prefixed.length === 1 && prefixed[0]) return { kind: "match", rule: "fuzzy", candidate: prefixed[0] };

  const near = candidates.filter((entry) => editDistance(entry.id, query) <= 2);
  const pool = prefixed.length > 0 ? prefixed : near;
  if (pool.length > 1) return { kind: "ambiguous", rule: "fuzzy", candidates: pool.slice(0, 10) };
  if (pool.length === 1 && pool[0]) return { kind: "match", rule: "fuzzy", candidate: pool[0] };

  return { kind: "not-found", nearMisses: near.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Consent (spec §5.2, §5.3)
// ---------------------------------------------------------------------------

export type ConsentDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly requiredFlag: string };

/**
 * Gate the emission of an install command. Grades A-C pass; anything else
 * (unlisted, D, F) needs the risk flag, and F needs `--force` on top of it.
 */
export function consentFor(
  grade: Grade | null,
  args: Readonly<Record<string, string>>,
): ConsentDecision {
  const accepted = args[RISK_FLAG] !== undefined;
  const forced = args["force"] !== undefined;

  if (grade !== null && CONSENT_FREE_GRADES.includes(grade)) return { allowed: true };
  if (!accepted) {
    return {
      allowed: false,
      reason:
        grade === null
          ? "this plugin has no dsh-bridge audit; nobody has reviewed it"
          : `grade ${grade} carries findings a user must accept explicitly`,
      requiredFlag: `--${RISK_FLAG}`,
    };
  }
  if (grade === "F" && !forced) {
    return {
      allowed: false,
      reason: "grade F means demonstrated hostility; the risk flag alone does not reach it",
      requiredFlag: "--force",
    };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const USAGE = "Usage: /bridge-install <plugin | github:owner/repo | npm:pkg | tgz:./p.tgz> [--report] [--profile <name>]";

/** `dsh plugin add` invocation, byte-identical to what a user should run (AC-13). */
export function installCommand(profile: string, source: string): string {
  return `dsh plugin --profile ${profile} add ${source}`;
}

export function uninstallCommand(profile: string, id: string): string {
  return `dsh plugin --profile ${profile} remove ${id}`;
}

function checklist(profile: string, candidate: { id: string; source: string }): string[] {
  return [
    "After running it, verify the install actually composed a layer:",
    "",
    `1. Bundle registered: the package appears in \`dsh.profile.bundles\` of ${profilePackageHint(profile)}.`,
    `2. Layer composed: \`dsh --profile ${profile} --dump-config\` contains a \`# == ${candidate.id}\` marker.`,
    "3. Mounts present: the plugin's declared skills and commands appear in the composed config.",
    "4. No surprise rows: nothing new touches `approval`, `sandbox`, or a model route.",
    "",
    "If any step fails, the plugin installed as a plain dependency and activated nothing.",
    "",
    `Undo: \`${uninstallCommand(profile, candidate.id)}\``,
    "",
  ];
}

function profilePackageHint(profile: string): string {
  return `\`~/.dsh/profiles/${profile}/package.json\``;
}

/** Verified trust summary card (spec §5.1). Absence is stated, never omitted. */
export function renderTrustCard(ctx: BridgeContext, candidate: InstallCandidate, profile: string): string {
  const parts: string[] = [
    `### /bridge-install ${candidate.id}`,
    "",
    ctx.output.card("TRUST SUMMARY", [
      ["plugin", candidate.id],
      ["grade", candidate.grade ?? "not reviewed"],
      ["verified", candidate.verifiedAt || "unknown"],
      ["source", candidate.source],
      ["profile", profile],
    ]),
  ];
  if (candidate.description !== "") parts.push(candidate.description, "");
  if (candidate.verdict !== "") parts.push(`**Verdict:** ${candidate.verdict}`, "");
  parts.push(
    candidate.card !== ""
      ? `Full report: \`${candidate.card}\` (evidence with file:line citations).`
      : "No report card file is committed for this entry; the grade above comes from docs/catalog/INDEX.md.",
    "",
    "A grade covers one audited commit only. It is evidence, not a safety guarantee.",
    "",
  );
  return parts.join("\n");
}

/** Unverified warning (spec §5.2). Wording is normative; do not soften. */
export function renderUnverifiedWarning(id: string, source: string, reason: string): string {
  return [
    `### /bridge-install ${id}`,
    "",
    `WARNING: ${id} is NOT in the dsh-bridge verified catalog.`,
    "",
    `Reason: ${reason}.`,
    "",
    "Nobody has reviewed this plugin. Installing it means:",
    "",
    "- its install (`prepare`) script runs on your machine BEFORE any permission",
    "  check - DSH consults approval only for sandbox escalation, not for",
    "  install-time code",
    "- it loads inside the harness process with full context access",
    "- its config layer can disable your approval and sandbox rows silently",
    "  (see docs/audits/dsh-builtin-redteam.md section F2)",
    "",
    `Source: ${source}`,
    "",
  ].join("\n");
}

function renderBlocked(head: string, decision: ConsentDecision & { allowed: false }): string {
  return [
    head,
    "Blocked: no install command is emitted.",
    "",
    `Why: ${decision.reason}.`,
    "",
    "To proceed you must state the risk explicitly on the command line:",
    "",
    `    /bridge-install <plugin> ${decision.requiredFlag}`,
    "",
    "Recommended first: `/bridge-trust scan <local checkout>` to review the code",
    "before it ever runs.",
    "",
  ].join("\n");
}

function renderEmit(head: string, profile: string, candidate: { id: string; source: string }): string {
  return [
    head,
    "Run this to install (dsh-bridge does not execute it for you):",
    "",
    "```sh",
    installCommand(profile, candidate.source),
    "```",
    "",
    ...checklist(profile, candidate),
  ].join("\n");
}

function renderAmbiguous(query: string, resolution: Extract<Resolution, { kind: "ambiguous" }>, ctx: BridgeContext): string {
  return [
    `### /bridge-install ${query}`,
    "",
    `"${query}" matches ${resolution.candidates.length} catalog entries. Nothing was installed;`,
    "ambiguity is never resolved silently.",
    "",
    ctx.output.table(
      ["GRADE", "PLUGIN", "REPO", "SOURCE"],
      resolution.candidates.map((entry) => [entry.grade ?? "?", entry.id, entry.repo, entry.source]),
    ),
    "Re-run with an exact repo or specifier, e.g. `/bridge-install github:owner/repo`.",
    "",
  ].join("\n");
}

function renderNotFound(query: string, near: readonly InstallCandidate[]): string {
  const lines = [
    `### /bridge-install ${query}`,
    "",
    `No catalog entry resolves "${query}".`,
    "",
  ];
  if (near.length > 0) {
    lines.push("Near misses:", "", ...near.map((entry) => `- ${entry.id} (${entry.repo})`), "");
  }
  lines.push(
    "Search the catalog: `/bridge-browse find <term>`.",
    "Install an off-catalog source directly: `/bridge-install github:owner/repo`.",
    "",
  );
  return lines.join("\n");
}

function renderReport(candidate: InstallCandidate, ctx: BridgeContext, profile: string): string {
  return [
    renderTrustCard(ctx, candidate, profile),
    "Report mode: no install command is emitted.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------

/**
 * `/bridge-install` runner. Pure over (ctx, args, options); the only side
 * effects are reads of the two committed catalog files.
 */
export async function runInstall(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
  options: InstallOptions = {},
): Promise<CommandResult> {
  const query = [args["_"] ?? "", args["rest"] ?? ""].join(" ").trim().split(/\s+/)[0] ?? "";
  const profile = (args["profile"] ?? "").trim() || ctx.profile;

  if (query === "") {
    return {
      markdown: [
        "### /bridge-install",
        "",
        USAGE,
        "",
        "Examples:",
        "- `/bridge-install modlens` verified entry: trust summary, then the command to run",
        "- `/bridge-install modlens --report` show the trust summary and stop",
        "- `/bridge-install github:owner/repo` off-catalog source, unverified path",
        "",
      ].join("\n"),
    };
  }

  const located = resolveInstallCatalog();
  const manifestPath = options.manifestPath ?? located?.manifestPath;
  const indexPath = options.indexPath ?? located?.indexPath ?? "";

  let candidates: readonly InstallCandidate[] = [];
  let degraded = "";
  if (manifestPath === undefined) {
    degraded = "docs/catalog/manifest.json was not found in this checkout";
  } else {
    try {
      candidates = loadCandidates(manifestPath, indexPath);
    } catch (error) {
      degraded = (error as Error).message;
    }
  }

  const resolution = resolve(query, candidates);
  const banner = degraded === "" ? "" : `Catalog unavailable (${degraded}); the trust layer is degraded and every name is unlisted.\n\n`;

  if (resolution.kind === "ambiguous") {
    return { markdown: banner + renderAmbiguous(query, resolution, ctx), data: { kind: "ambiguous", exitCode: 2 } };
  }

  if (resolution.kind === "not-found") {
    // Fail closed: with no catalog, a bare name has no source we can trust.
    return { markdown: banner + renderNotFound(query, resolution.nearMisses), data: { kind: "not-found", exitCode: 2 } };
  }

  if (resolution.kind === "unlisted") {
    const decision = consentFor(null, args);
    const head = banner + renderUnverifiedWarning(resolution.id, resolution.source, "no catalog entry cites this source");
    if (!decision.allowed) {
      return { markdown: renderBlocked(head, decision), data: { kind: "blocked", grade: null, exitCode: 1 } };
    }
    return {
      markdown: renderEmit(head, profile, resolution),
      data: { kind: "emitted", grade: null, source: resolution.source, command: installCommand(profile, resolution.source) },
    };
  }

  const candidate = resolution.candidate;
  if (args["report"] !== undefined) {
    return { markdown: banner + renderReport(candidate, ctx, profile), data: { kind: "report", grade: candidate.grade } };
  }

  const decision = consentFor(candidate.grade, args);
  const head =
    candidate.grade === null
      ? banner + renderUnverifiedWarning(candidate.id, candidate.source, "the entry is in the catalog but has no completed audit")
      : banner + renderTrustCard(ctx, candidate, profile);

  if (!decision.allowed) {
    return {
      markdown: renderBlocked(head, decision),
      data: { kind: "blocked", grade: candidate.grade, rule: resolution.rule, exitCode: 1 },
    };
  }
  return {
    markdown: renderEmit(head, profile, candidate),
    data: {
      kind: "emitted",
      grade: candidate.grade,
      rule: resolution.rule,
      source: candidate.source,
      command: installCommand(profile, candidate.source),
    },
  };
}
