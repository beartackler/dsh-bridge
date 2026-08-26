/**
 * Catalog access for command modules that need browse's resolution without
 * importing a command file (importing src/commands/browse.ts from another
 * command would couple two mount points; this re-exports the pure parts).
 */

export {extractGrade, loadManifest, loadManifestCached, repoBase, resolveCatalogPaths} from "../commands/browse.js";
export type {CatalogEntry} from "../commands/browse.js";
