/**
 * `/bridge-browse` - paginated browsing of the committed plugin catalog.
 *
 * Phase-1 slice of docs/specs/commands/browse.md: list with pagination,
 * category filter, and case-insensitive `find`, joining trust grades from
 * docs/catalog/cards/*.md. Charter rules honored here:
 *  - Offline-first: the only inputs are two committed files under
 *    docs/catalog/; zero network calls (spec acceptance 1).
 *  - Grades render verbatim from the report cards; this module never
 *    derives, rounds, or softens a verdict (spec section 1).
 *  - Output stays ASCII, emoji-free (CHARTER.md non-negotiable 4).
 *
 * The manifest is loaded lazily on first invocation and memoized per
 * (path, mtime); registration stays side-effect free.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CommandResult } from "../lib/types.js";

/** Fixed page size for this slice (browse spec section 3.1 default). */
export const PAGE_SIZE = 10;

/** Longest description tail shown per row; clipped with ASCII dots. */
const DESC_WIDTH = 80;

/** One manifest row, narrowed to the fields /browse renders. */
export interface CatalogEntry {
  readonly name: string;
  readonly repo: string;
  readonly category: string;
  /** Repo star count at snapshot time; null when upstream has not polled it. */
  readonly stars: number | null;
  readonly description: string;
}

/** Options letting tests pin explicit catalog locations (no global state). */
export interface BrowseOptions {
  readonly manifestPath?: string;
  readonly cardsDir?: string;
}

/** Typed failure for catalog loads that cannot be honored. */
export class BrowseError extends Error {}

// ---------------------------------------------------------------------------
// Catalog location
// ---------------------------------------------------------------------------

/**
 * Locate docs/catalog relative to this compiled module by walking up to the
 * repo root. Returns undefined when the checkout has no catalog yet, so the
 * command degrades to its honest not-found rendering instead of throwing.
 */
export function resolveCatalogPaths(startDir: string = dirname(fileURLToPath(import.meta.url))): {
  manifestPath: string;
  cardsDir: string;
} | undefined {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const catalog = join(dir, "docs", "catalog");
    if (existsSync(join(catalog, "manifest.json"))) {
      return { manifestPath: join(catalog, "manifest.json"), cardsDir: join(catalog, "cards") };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Manifest loading (lazy, memoized per path+mtime)
// ---------------------------------------------------------------------------

function toEntry(raw: unknown): CatalogEntry | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record["name"] !== "string" || typeof record["repo"] !== "string") return undefined;
  return {
    name: record["name"],
    repo: record["repo"],
    category: typeof record["category"] === "string" ? record["category"] : "",
    stars: typeof record["stars_if_known"] === "number" ? record["stars_if_known"] : null,
    description: typeof record["description_en"] === "string" ? record["description_en"] : "",
  };
}

/** Strict loader: missing file, bad JSON, or a non-array body are errors. */
export function loadManifest(manifestPath: string): CatalogEntry[] {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    throw new BrowseError(`catalog manifest not readable: ${manifestPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BrowseError(`catalog manifest is not valid JSON: ${manifestPath}`);
  }
  if (!Array.isArray(parsed)) {
    throw new BrowseError(`catalog manifest must be a JSON array: ${manifestPath}`);
  }
  const entries: CatalogEntry[] = [];
  for (const raw of parsed) {
    const entry = toEntry(raw);
    if (entry) entries.push(entry);
  }
  return entries;
}

interface ManifestCache {
  readonly path: string;
  readonly mtimeMs: number;
  readonly entries: CatalogEntry[];
}

let manifestCache: ManifestCache | undefined;

/**
 * Memoizing wrapper: re-reads only when the file changed on disk, so repeat
 * invocations in one session skip the 2,189-entry parse entirely.
 */
export function loadManifestCached(manifestPath: string): CatalogEntry[] {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(manifestPath).mtimeMs;
  } catch {
    throw new BrowseError(`catalog manifest not readable: ${manifestPath}`);
  }
  if (manifestCache && manifestCache.path === manifestPath && manifestCache.mtimeMs === mtimeMs) {
    return manifestCache.entries;
  }
  const entries = loadManifest(manifestPath);
  manifestCache = { path: manifestPath, mtimeMs, entries };
  return entries;
}

// ---------------------------------------------------------------------------
// Grade join (report cards -> manifest entries)
// ---------------------------------------------------------------------------

/**
 * Base slug of a manifest repo: lowercase, `.git` stripped, cut at the first
 * `#subpath` (e.g. `tt-a1i/archify#integrations/deepseek-harness` becomes
 * `tt-a1i/archify`). Subpath entries share their parent repo's audit.
 */
export function repoBase(repo: string): string {
  const clean = repo.toLowerCase().replace(/\.git$/, "");
  const head = clean.split("#")[0] ?? clean;
  const segments = head.split("/").filter((part) => part !== "");
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : head;
}

/**
 * Extract a card's grade letter. Handles the two shapes in docs/catalog/cards:
 *   1. bold header-table cell: `| **Grade** | **B** (adjudicated...) |`
 *   2. heading form:           `### Overall: C`
 * Unbolded cells are deliberately rejected so revision-table headers like
 * `| Grade | Change |` can never yield a phantom letter.
 */
export function extractGrade(cardText: string): string | null {
  const boldCell = /\|\s*\*{0,2}grade\s*\*{0,2}\s*\|\s*\*{1,2}([A-F?])\*{1,2}/i.exec(cardText);
  if (boldCell) return boldCell[1]?.toUpperCase() ?? null;
  const colonForm = /\b(?:overall|grade)\s*:\s*\*{0,2}([A-F?])\b/i.exec(cardText);
  return colonForm ? (colonForm[1]?.toUpperCase() ?? null) : null;
}

function cardRepoCandidates(cardText: string): Set<string> {
  const candidates = new Set<string>();
  const link = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = link.exec(cardText)) !== null) {
    const owner = match[1];
    const repo = match[2];
    if (owner && repo) candidates.add(repoBase(`${owner}/${repo}`));
  }
  return candidates;
}

/**
 * Join card grades onto manifest repo bases. A card contributes its grade
 * only when exactly one of its GitHub links resolves to a known manifest
 * base; ambiguous or unrelated links are ignored rather than guessed.
 * Returns a map of repo base -> grade letter.
 */
export function loadCardGrades(cardsDir: string, knownBases: ReadonlySet<string>): Map<string, string> {
  const grades = new Map<string, string>();
  let files: string[];
  try {
    files = readdirSync(cardsDir).filter((file) => file.endsWith(".md")).sort();
  } catch {
    return grades; // No cards dir: every entry renders as unreviewed.
  }
  for (const file of files) {
    const text = readFileSync(join(cardsDir, file), "utf8");
    const grade = extractGrade(text);
    if (!grade) continue;
    const hits = [...cardRepoCandidates(text)].filter((base) => knownBases.has(base));
    if (hits.length !== 1) continue;
    const base = hits[0];
    if (base) grades.set(base, grade);
  }
  return grades;
}

// ---------------------------------------------------------------------------
// Filtering, sorting, pagination (pure functions)
// ---------------------------------------------------------------------------

export interface BrowseFilter {
  readonly category?: string;
  /** Case-insensitive substring across name + description. */
  readonly query?: string;
}

/** Deterministic order: stars desc (unknown last), then name asc. */
export function sortEntries(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    const starsA = a.stars ?? -1;
    const starsB = b.stars ?? -1;
    if (starsA !== starsB) return starsB - starsA;
    return a.name.localeCompare(b.name);
  });
}

export function filterEntries(entries: readonly CatalogEntry[], filter: BrowseFilter): CatalogEntry[] {
  let result: readonly CatalogEntry[] = entries;
  if (filter.category !== undefined) {
    result = result.filter((entry) => entry.category === filter.category);
  }
  if (filter.query !== undefined && filter.query !== "") {
    const needle = filter.query.toLowerCase();
    result = result.filter(
      (entry) => entry.name.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle),
    );
  }
  return sortEntries(result);
}

/** Total pages for a result count; always at least one so footers stay sane. */
export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageSlice<T>(items: readonly T[], page: number, size: number = PAGE_SIZE): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

// ---------------------------------------------------------------------------
// Rendering + the command runner
// ---------------------------------------------------------------------------

function clip(text: string, width: number = DESC_WIDTH): string {
  return text.length <= width ? text : `${text.slice(0, width - 3)}...`;
}

function starsCell(stars: number | null): string {
  return stars === null ? "-" : String(stars);
}

function usageMarkdown(): string {
  return [
    "### /bridge-browse",
    "",
    "Usage:",
    "- `/bridge-browse [category] [next | prev | <page>]`",
    "- `/bridge-browse find <query>`",
    "",
  ].join("\n");
}

function notFoundMarkdown(detail: string): string {
  return ["### /bridge-browse", "", "Catalog is unavailable.", "", detail, "", "Rebuild docs/catalog, then retry.", ""].join("\n");
}

/** Per-context pagination memory for `next` / `prev`. WeakMap: no leaks. */
const lastListPage = new WeakMap<object, number>();

function parsePageToken(token: string, currentPage: number, pages: number): { page: number } | { error: string } {
  const lowered = token.toLowerCase();
  if (lowered === "next") return { page: Math.min(pages, currentPage + 1) };
  if (lowered === "prev") return { page: Math.max(1, currentPage - 1) };
  const requested = Number(token);
  if (!Number.isInteger(requested) || requested < 1 || requested > pages) {
    return { error: `page must be 1-${pages}; got "${token}"` };
  }
  return { page: requested };
}

/**
 * `/bridge-browse` runner. Pure over (ctx, args, options): all filesystem
 * access goes through the explicit or auto-resolved catalog paths.
 */
export async function runBrowse(
  ctx: BridgeContextLike,
  args: Readonly<Record<string, string>>,
  options: BrowseOptions = {},
): Promise<CommandResult> {
  void ctx;

  const positions = resolveCatalogPaths();
  const manifestPath = options.manifestPath ?? positions?.manifestPath;
  const cardsDir = options.cardsDir ?? positions?.cardsDir;
  if (manifestPath === undefined) {
    return { markdown: notFoundMarkdown("docs/catalog/manifest.json was not found in this checkout.") };
  }

  let entries: CatalogEntry[];
  try {
    entries = loadManifestCached(manifestPath);
  } catch (error) {
    return { markdown: notFoundMarkdown((error as Error).message) };
  }

  const tokens = (args["_"] ?? "").split(/\s+/).filter((token) => token !== "");
  const categories = [...new Set(entries.map((entry) => entry.category))].sort();

  let filter: BrowseFilter = {};
  let mode: "list" | "find" = "list";
  let pageToken: string | undefined;

  if (tokens[0]?.toLowerCase() === "find") {
    const query = tokens.slice(1).join(" ").trim();
    if (query === "") return { markdown: usageMarkdown() };
    mode = "find";
    filter = { query };
  } else if (tokens.length > 0) {
    const navOnly = (token: string): boolean => /^(?:next|prev|[1-9][0-9]*)$/i.test(token);
    const first = tokens[0];
    if (first !== undefined && navOnly(first) && tokens.length === 1) {
      pageToken = first;
    } else {
      const category = first ?? "";
      if (!categories.includes(category)) {
        return {
          markdown: [`### /bridge-browse`, "", `Unknown category "${category}".`, "", `Valid: ${categories.join(", ")}`, ""].join("\n"),
        };
      }
      filter = { category };
      const second = tokens[1];
      if (second !== undefined) {
        if (tokens.length > 2 || !navOnly(second)) return { markdown: usageMarkdown() };
        pageToken = second;
      }
    }
  }

  const results = filterEntries(entries, filter);
  const pages = pageCount(results.length);
  const remembered = lastListPage.get(ctx) ?? 1;

  let page = 1;
  if (pageToken !== undefined) {
    const resolved = parsePageToken(pageToken, remembered, pages);
    if ("error" in resolved) {
      return { markdown: [`### /bridge-browse`, "", resolved.error, ""].join("\n") };
    }
    page = resolved.page;
  }

  const shown = pageSlice(results, page);
  const grades =
    cardsDir === undefined ? new Map<string, string>() : loadCardGrades(cardsDir, new Set(entries.map((entry) => repoBase(entry.repo))));

  const rows = shown.map((entry) => [
    grades.get(repoBase(entry.repo)) ?? "?",
    entry.name,
    entry.category,
    starsCell(entry.stars),
    clip(entry.description),
  ]);

  const scope =
    mode === "find"
      ? `find "${filter.query}" - ${results.length} match${results.length === 1 ? "" : "es"}`
      : filter.category !== undefined
        ? `category=${filter.category} - ${results.length} entr${results.length === 1 ? "y" : "ies"}`
        : `${entries.length} entries`;

  const sections = [
    "### /bridge-browse",
    "",
    `${scope} | page ${page}/${pages}`,
    "",
  ];
  const table = ctx.output.table(["GRADE", "PLUGIN", "CATEGORY", "STARS", "DESCRIPTION"], rows);
  if (table !== "") {
    sections.push(table);
  } else {
    sections.push("No entries match. Nothing is padded in to fill the page.", "");
  }
  sections.push(`paging: /bridge-browse${filter.category !== undefined ? ` ${filter.category}` : ""} next | prev | <page> | search: /bridge-browse find <query>`, "");

  // Only list mode moves the remembered page; `find` results never disturb it.
  if (mode === "list") lastListPage.set(ctx, page);

  return {
    markdown: sections.join("\n"),
    data: { mode, filter, total: results.length, page, pages, entries: shown },
  };
}

/** BridgeContext structural minimum used above (avoids importing lib/context). */
interface BridgeContextLike {
  readonly output: { table(headers: readonly string[], rows: readonly (readonly string[])[]): string };
}
