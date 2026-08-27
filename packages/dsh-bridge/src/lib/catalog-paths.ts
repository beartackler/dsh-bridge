/**
 * One place that answers "where is the catalog?" for every command.
 *
 * Resolution order per file:
 *   1. packaged data shipped inside this package (`<package>/data/`) - the
 *      copy that makes a plain `npm install` work with no checkout at all
 *   2. a repo checkout above this module (`<repo>/docs/catalog/`), which
 *      overrides the packaged copy so contributors see their live edits
 *   3. nothing: callers render an error naming both paths
 *
 * Both roots are probed; when a file exists in both, the checkout wins (it is
 * the source the packaged copy was generated from). When no checkout exists,
 * the packaged copy answers every lookup.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Where a resolved catalog file came from. */
export type CatalogOrigin = "packaged" | "repo";

/** A resolved catalog root plus its origin, for honest report text. */
export interface CatalogRoot {
  readonly dir: string;
  readonly origin: CatalogOrigin;
}

/** Compiled module dir: `dist/src/lib` at runtime, `src/lib` in source. */
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * `<package>/data`, found by walking up for the directory that holds it.
 * Works for both the `dist/src/lib/...` and `src/lib/...` module layouts.
 */
export function packagedDataDir(startDir: string = moduleDir()): string | undefined {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const candidate = join(dir, "data");
    if (existsSync(join(candidate, "manifest.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * `<repo>/docs/catalog`, found by walking up from this module. A directory
 * counts when it holds the manifest or the committed cards, because the
 * published root package ships `docs/catalog/cards` without the manifest.
 */
export function repoCatalogDir(startDir: string = moduleDir()): string | undefined {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const candidate = join(dir, "docs", "catalog");
    if (existsSync(join(candidate, "manifest.json")) || existsSync(join(candidate, "cards"))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Candidate roots, packaged first, in the order they are probed. */
export function catalogRoots(startDir?: string): readonly CatalogRoot[] {
  const roots: CatalogRoot[] = [];
  const packaged = startDir === undefined ? packagedDataDir() : packagedDataDir(startDir);
  if (packaged !== undefined) roots.push({ dir: packaged, origin: "packaged" });
  const repo = startDir === undefined ? repoCatalogDir() : repoCatalogDir(startDir);
  if (repo !== undefined) roots.push({ dir: repo, origin: "repo" });
  return roots;
}

/**
 * Resolve one catalog-relative entry (`manifest.json`, `INDEX.md`, `cards`).
 * A checkout copy overrides the packaged one; the packaged one is the
 * fallback that makes installs work.
 */
export function catalogEntry(relative: string, startDir?: string): string | undefined {
  const roots = catalogRoots(startDir);
  for (const origin of ["repo", "packaged"] as const) {
    const root = roots.find((candidate) => candidate.origin === origin);
    if (root === undefined) continue;
    const path = join(root.dir, relative);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** The two locations probed, for error messages that name both. */
export function searchedPaths(startDir?: string): readonly [string, string] {
  const packaged = startDir === undefined ? packagedDataDir() : packagedDataDir(startDir);
  const repo = startDir === undefined ? repoCatalogDir() : repoCatalogDir(startDir);
  return [
    packaged ?? "<package>/data (packaged catalog: not found)",
    repo ?? "<repo>/docs/catalog (checkout override: not found)",
  ];
}

/** Sentence naming both candidate locations; used by every degraded render. */
export function unavailableDetail(file: string, startDir?: string): string {
  const [packaged, repo] = searchedPaths(startDir);
  return [
    `${file} was not found. Looked in:`,
    `  1. ${packaged}`,
    `  2. ${repo}`,
    "Reinstall the package (the catalog ships inside it), or run `npm run build:data` in a checkout.",
  ].join("\n");
}
