/**
 * /bridge-suggest - the "not found -> build it" flow
 * (docs/specs/commands/suggest.md), MVP slice.
 *
 * Scope of this iteration:
 *  - Re-queries the committed catalog through the same resolution browse.ts
 *    uses (resolveCatalogPaths + loadManifestCached + filterEntries), with an
 *    intent-level token match over name + description.
 *  - Closest-match suggestion with grade and honest gap note when a match
 *    exists; scaffold checklist per templates/plugin-starter when none does.
 *
 * Invariants: offline-first (catalog files only, zero network calls); no
 * writes in this slice (--no-scaffold is the only behavior; the checklist
 * tells the user or agent exactly what to create); every trust claim renders
 * the grade verbatim from docs/catalog/cards.
 */

import { readFileSync, readdirSync } from "node:fs";

import { bulletList, gradeCell, heading, table } from "../lib/output.js";
import type { CommandResult } from "../lib/types.js";

import {
  extractGrade,
  loadManifestCached,
  repoBase,
  resolveCatalogPaths,
  type CatalogEntry,
} from "../lib/catalog-access.js";

/** Options letting tests pin explicit catalog locations (no global state). */
export interface SuggestOptions {
  readonly manifestPath?: string;
  readonly cardsDir?: string;
}

/** One catalog candidate with its computed match score. */
export interface SuggestCandidate {
  readonly entry: CatalogEntry;
  /** Fraction of intent tokens found in name + description (0..1). */
  readonly coverage: number;
  readonly matchedTokens: readonly string[];
  readonly missedTokens: readonly string[];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "for", "of", "and", "or", "in", "on", "with", "my", "me", "i",
  "want", "need", "make", "build", "create", "that", "this", "it", "into", "from",
]);

/** Lowercase non-stopword tokens of the idea text. */
export function intentTokens(idea: string): string[] {
  return idea
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Intent-level re-query of the catalog: coverage = matched tokens / total
 * tokens. Pure over (entries, tokens).
 */
export function matchCatalog(entries: readonly CatalogEntry[], idea: string): SuggestCandidate[] {
  const tokens = intentTokens(idea);
  if (tokens.length === 0) return [];
  const candidates: SuggestCandidate[] = [];
  for (const entry of entries) {
    const haystack = `${entry.name} ${entry.description}`.toLowerCase();
    const matched = tokens.filter((token) => haystack.includes(token));
    if (matched.length === 0) continue;
    candidates.push({
      entry,
      coverage: matched.length / tokens.length,
      matchedTokens: matched,
      missedTokens: tokens.filter((token) => !matched.includes(token)),
    });
  }
  return candidates.sort(
    (a, b) => b.coverage - a.coverage || b.matchedTokens.length - a.matchedTokens.length || a.entry.name.localeCompare(b.entry.name),
  );
}

/** Grade lookup mirroring browse: card letter joined by repo base slug. */
function gradeFor(cardsDir: string | undefined, entry: CatalogEntry): string | null {
  if (cardsDir === undefined) return null;
  let files: string[];
  try {
    files = readdirSync(cardsDir).sort();
  } catch {
    return null;
  }
  const base = repoBase(entry.repo);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const text = safeReadFile(`${cardsDir}/${file}`);
    if (!text.includes(base)) continue;
    const grade = extractGrade(text);
    if (grade !== null) return grade;
  }
  return null;
}

function safeReadFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scaffold checklist (templates/plugin-starter shape)
// ---------------------------------------------------------------------------

export interface ScaffoldStep {
  readonly path: string;
  readonly purpose: string;
}

/** The file plan suggested when nothing in the catalog fits. */
export function scaffoldChecklist(slug: string): readonly ScaffoldStep[] {
  return [
    {path: `${slug}/package.json`, purpose: "MIT license, peerDependencies on @deepseek-ai/cordis + schemastery, type module"},
    {path: `${slug}/src/index.ts`, purpose: "Cordis plugin entry: name, inject, Config schema, apply(ctx)"},
    {path: `${slug}/test/${slug}.test.ts`, purpose: "Failing-on-day-one acceptance checks for the capability"},
    {path: `${slug}/PLAN.md`, purpose: "Guided implementation steps, each independently verifiable"},
    {path: `${slug}/SECURITY.md`, purpose: "Declared egress hosts, filesystem scope, credential policy"},
    {path: `${slug}/README.md`, purpose: "English-first usage and config table"},
    {path: `${slug}/LICENSE`, purpose: "MIT (add NOTICE with attribution if porting ideas from another plugin)"},
  ];
}

function renderScaffoldPlan(slug: string, idea: string, closest: SuggestCandidate | undefined): string {
  const steps = scaffoldChecklist(slug);
  const rows = steps.map((step) => [step.path, step.purpose]);
  const parts: string[] = [
    heading("/bridge-suggest"),
    "",
    `Idea: ${idea}`,
    "",
  ];
  if (closest !== undefined) {
    parts.push(
      `Closest existing plugin (${Math.round(closest.coverage * 100)}% intent coverage): ${closest.entry.name}.`,
      "It did not pass the recommendation bar; fork-or-build applies. Port ideas, not code,",
      "and cite upstream license and attribution in NOTICE if you reuse structure.",
      "",
    );
  }
  parts.push("Recommended scope triage before writing any file:");
  parts.push(
    bulletList([
      "config change (0 files): can a preset/profile setting solve this? If yes, stop here.",
      "skill (1 file): is this a prompt pattern? A skill beats a plugin.",
      "tool + skill (3-6 files): single DSH seam; typical shape.",
      "full plugin (8+ files): multi-seam surface; warn yourself about scope creep.",
    ]),
  );
  parts.push(`Scaffold checklist (create under ./ when you accept; template: templates/plugin-starter/):`);
  parts.push(table(["FILE", "PURPOSE"], rows));
  parts.push(
    bulletList([
      "No dynamic execution anywhere: no eval, new Function, vm, child_process.",
      "All egress through one allowlisted helper declared in SECURITY.md.",
      "Finish with: bridge trust selfcheck <slug> - target grade A.",
    ]),
  );
  parts.push("This run wrote zero files (plan-only mode).");
  parts.push("");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

/** /bridge-suggest entry point; pure over (ctx, args), offline-first. */
export async function runSuggest(
  ctx: BridgeContextLike,
  args: Readonly<Record<string, string>>,
  options: SuggestOptions = {},
): Promise<CommandResult> {
  void ctx;
  const ideaParts = [args["_"] ?? "", args["rest"] ?? ""].join(" ").trim();
  const idea = ideaParts.replace(/\s+/g, " ");
  if (idea === "") {
    return {
      markdown: [
        heading("/bridge-suggest"),
        "",
        "Usage: /bridge-suggest <describe what you want in plain words>",
        "",
      ].join("\n"),
    };
  }

  const positions = resolveCatalogPaths();
  const manifestPath = options.manifestPath ?? positions?.manifestPath;
  const cardsDir = options.cardsDir ?? positions?.cardsDir;
  if (manifestPath === undefined) {
    return {
      markdown: [
        heading("/bridge-suggest"),
        "",
        "Catalog unavailable (docs/catalog/manifest.json not found); cannot cross-check.",
        "",
      ].join("\n"),
    };
  }
  const entries = loadManifestCached(manifestPath);
  const matches = matchCatalog(entries, idea);
  const best = matches[0];

  const recommendable =
    best !== undefined &&
    best.coverage >= RECOMMEND_COVERAGE &&
    (gradeFor(cardsDir, best.entry) ?? "?").match(/[AB]/) !== null;

  if (best !== undefined && recommendable) {
    const grade = gradeFor(cardsDir, best.entry);
    const installHint = `dsh plugin --profile web add github:${best.entry.repo}`;
    const gapNote =
      best.missedTokens.length > 0
        ? `Named gap: these parts of your ask are not covered: ${best.missedTokens.join(", ")}.`
        : "Named gap: none identified; coverage looks complete.";
    const markdown = [
      heading("/bridge-suggest"),
      "",
      `Idea: ${idea}`,
      "",
      `Closest existing plugin covers ${Math.round(best.coverage * 100)}% of your intent:`,
      table(["GRADE", "PLUGIN", "DESCRIPTION"], [[gradeCell(grade), best.entry.name, best.entry.description]]),
      gapNote,
      "",
      "Install:",
      `\`${installHint}\``,
      "",
      "Verify the claim yourself: the grade above comes from docs/catalog/cards; run",
      "/bridge-trust " + best.entry.name + " to see the evidence.",
      "",
    ].join("\n");
    return {markdown, data: {mode: "recommend", candidate: best}};
  }

  const slug = suggestSlug(idea);
  const markdown = renderScaffoldPlan(slug, idea, best);
  return {markdown, data: {mode: "scaffold", slug, matches: matches.slice(0, 5)}};
}

/** Coverage fraction at or above which a grade-A/B match is recommended. */
export const RECOMMEND_COVERAGE = 0.8;

/** Derive a kebab-case project slug from the idea text. */
export function suggestSlug(idea: string): string {
  const slug = intentTokens(idea)
    .slice(0, 3)
    .join("-")
    .replace(/[^a-z0-9-]/g, "");
  return slug === "" ? "dsh-new-plugin" : `dsh-${slug}`;
}

/** Structural minimum used here (matches lib/types BridgeContext.output). */
interface BridgeContextLike {
  readonly output: {table(headers: readonly string[], rows: readonly (readonly string[])[]): string};
}
