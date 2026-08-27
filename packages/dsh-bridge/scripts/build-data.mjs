/**
 * Copy the committed catalog into packages/dsh-bridge/data so an installed
 * package carries its own catalog instead of depending on a repo checkout.
 *
 * Inputs  (repo):  docs/catalog/manifest.json, docs/catalog/INDEX.md
 * Outputs (package): data/manifest.json (compact), data/INDEX.md (verbatim),
 *                    data/cards/*.md (verbatim; /bridge-trust renders them)
 *
 * manifest.json is rewritten with only the fields the commands read:
 * name, repo, category, stars_if_known, description_en, description_zh.
 * INDEX.md ships verbatim because status.ts and install.ts parse its table.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageDir, "..", "..");
const catalogDir = join(repoRoot, "docs", "catalog");
const outDir = join(packageDir, "data");

const manifestSource = join(catalogDir, "manifest.json");
const indexSource = join(catalogDir, "INDEX.md");

if (!existsSync(manifestSource)) {
  console.error(`build-data: ${manifestSource} not found; cannot build packaged catalog.`);
  process.exit(1);
}

const KEEP = ["name", "repo", "category", "stars_if_known", "description_en", "description_zh"];

const parsed = JSON.parse(readFileSync(manifestSource, "utf8"));
if (!Array.isArray(parsed)) {
  console.error(`build-data: ${manifestSource} must be a JSON array.`);
  process.exit(1);
}

const compact = parsed.map((entry) => {
  const row = {};
  for (const key of KEEP) {
    const value = entry?.[key];
    if (value !== undefined && value !== null && value !== "") row[key] = value;
  }
  return row;
});

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(compact), "utf8");

if (existsSync(indexSource)) {
  writeFileSync(join(outDir, "INDEX.md"), readFileSync(indexSource, "utf8"), "utf8");
} else {
  console.error(`build-data: ${indexSource} not found; packaged grades would be empty.`);
  process.exit(1);
}

const cardsSource = join(catalogDir, "cards");
const cardsOut = join(outDir, "cards");
rmSync(cardsOut, { recursive: true, force: true });
if (existsSync(cardsSource)) {
  cpSync(cardsSource, cardsOut, { recursive: true });
} else {
  console.error(`build-data: ${cardsSource} not found; /bridge-trust would show no cards.`);
  process.exit(1);
}

const size = (path) => `${Math.round(readFileSync(path).byteLength / 1024)} KiB`;
console.log(
  `build-data: ${compact.length} entries -> data/manifest.json (${size(join(outDir, "manifest.json"))}), ` +
    `data/INDEX.md (${size(join(outDir, "INDEX.md"))}), ` +
    `data/cards (${readdirSync(cardsOut).length} cards)`,
);
