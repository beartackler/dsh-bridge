/**
 * `/bridge-browse` - paginated browsing of the committed plugin catalog.
 *
 * Slice of docs/specs/commands/browse.md: list and find modes, `--category`,
 * `--lang` (en/zh/any), and `--min-grade A|B|C` filters, fzf-style fuzzy
 * matching on find queries, grade-then-stars ranking over grades joined from
 * docs/catalog/INDEX.md (report-card fallback when a card exists but INDEX
 * lags), pagination in markdown, and an install handoff footer.
 *
 * Charter rules honored here:
 *  - Offline-first: inputs are committed files under docs/catalog/ only;
 *    zero network calls at browse time (spec acceptance 1).
 *  - Grades render verbatim from the audit surface; this module never
 *    derives, rounds, or softens a verdict (spec section 1). D, F, and ?
 *    can never be requested as floors.
 *  - Output stays ASCII, emoji-free (CHARTER.md non-negotiable 4).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CommandResult } from "../lib/types.js";

/** Default page size for list rendering (browse spec section 3.1). */
export const PAGE_SIZE = 10;

/** Longest description tail shown per row; clipped with ASCII dots. */
const DESC_WIDTH = 72;

/** Grade letters that may serve as a --min-grade floor (never D, F, or ?). */
export const GRADE_FLOORS: readonly string[] = ["A", "B", "C"];

/** Rank points per grade letter; higher sorts first. Unreviewed sorts last. */
const GRADE_POINTS: Readonly<Record<string, number>> = Object.freeze({
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
});

/** Accepted --lang values mapped to their filter predicate. */
const LANGS: readonly string[] = ["en", "zh", "any"];

/** One manifest row, narrowed to the fields /browse renders. */
export interface CatalogEntry {
  readonly name: string;
  readonly repo: string;
  readonly category: string;
  /** Repo star count at snapshot time; null when upstream has not polled it. */
  readonly stars: number | null;
  /** English description; empty string when upstream has none yet. */
  readonly description: string;
  /** Chinese description; empty string when upstream has none yet. */
  readonly descriptionZh: string;
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
  indexMdPath?: string;
} {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const catalog = join(dir, "docs", "catalog");
    if (existsSync(join(catalog, "manifest.json"))) {
      const indexMdPath = join(catalog, "INDEX.md");
      return {
        manifestPath: join(catalog, "manifest.json"),
        cardsDir: join(catalog, "cards"),
        ...(existsSync(indexMdPath) ? { indexMdPath } : {}),
      };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined as unknown as undefined;
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
    descriptionZh: typeof record["description_zh"] === "string" ? record["description_zh"] : "",
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
  for (const row of parsed) {
    const entry = toEntry(row);
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
// Grade join (INDEX.md table first, committed report cards as fallback)
// ---------------------------------------------------------------------------

/** Trim a markdown cell and strip surrounding backticks. */
function cleanCell(cell: string): string {
  return cell.trim().replace(/^`+|`+$/g, "").trim();
}

/**
 * Parse the `## Catalog` grade table out of docs/catalog/INDEX.md.
 * Columns: | Grade | Plugin | Repo | Stars | Verdict | Verified | Card |
 * The repo column is authoritative; the display-name column is kept only as
 * a fallback join key for entries whose manifest name differs from the repo.
 * Returns maps of key -> grade letter for both keyspaces.
 */
export function parseIndexGrades(indexMarkdown: string): { byRepo: Map<string, string>; byName: Map<string, string> } {
  const byRepo = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const line of indexMarkdown.split(/\r?\n/)) {
    const row = /^\|\s*([A-F?])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/.exec(line);
    if (!row || row[2] === undefined || row[3] === undefined) continue;
    if (/^[-:\s]*$/.test(row[1] ?? "")) continue; // markdown rule row
    const grade = row[1];
    const displayName = cleanCell(row[2]);
    const repoCell = cleanCell(row[3]);
    if (grade === undefined) continue;
    const base = repoBase(repoCell);
    if (base !== "") byRepo.set(base, grade);
    if (displayName !== "" && !displayName.includes("http")) byName.set(displayName.toLowerCase(), grade);
  }
  return { byRepo, byName };
}