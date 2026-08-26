#!/usr/bin/env node
// Generates site/data.json from repo state: docs/catalog/INDEX.md plus docs/catalog/manifest.json.
// Run from anywhere: node site/build.mjs (paths are resolved relative to this file).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalogDir = join(root, "docs", "catalog");
const indexMd = readFileSync(join(catalogDir, "INDEX.md"), "utf8");
const manifest = JSON.parse(readFileSync(join(catalogDir, "manifest.json"), "utf8"));
const entries = Array.isArray(manifest) ? manifest : Object.values(manifest);

// GitHub-rendered card URLs. The site is static and offline, so cards stay in the repo
// and the catalog links out to github.com when the site is served from a host that can
// reach it; locally the links simply will not resolve, which is expected.
const REPO_BASE = "https://github.com/beartackler/dsh-bridge/blob/main/docs/catalog/cards/";

function parseIndex(md) {
  const rows = [];
  const re = /^\|\s*([A-F])\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*\[card\]\((cards\/[^)]+\.md)\)\s*\|$/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    rows.push({
      grade: m[1],
      name: m[2].trim(),
      repo: m[3],
      stars: m[4] === "unknown" ? null : Number(m[4]),
      verdict: m[5].trim(),
      verified: m[6],
      card: m[7],
    });
  }
  return rows;
}

function snapshotDate(md) {
  const m = md.match(/snapshot\s+(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const reviewed = parseIndex(indexMd);
if (reviewed.length === 0) {
  console.error("build: parsed zero rows from INDEX.md; table format may have changed");
  process.exit(1);
}

// Join each reviewed plugin with its manifest record for category and description.
for (const r of reviewed) {
  const hit =
    entries.find((p) => p.repo === r.repo) ||
    entries.find((p) => p.repo && p.repo.toLowerCase() === r.repo.toLowerCase()) ||
    entries.find((p) => p.name === r.name) ||
    entries.find(
      (p) => p.name && r.repo && p.name.toLowerCase().endsWith("/" + r.repo.split("/").pop().toLowerCase()),
    );
  if (hit) {
    r.category = hit.category || "uncategorized";
    r.description = hit.description_en || "";
  } else {
    r.category = "uncategorized";
    r.description = "";
    console.error(`build: no manifest match for ${r.repo}`);
  }
  r.cardUrl = REPO_BASE + r.card.replace(/^cards\//, "");
}

const grades = ["A", "B", "C", "D", "F"];
const categories = [...new Set(reviewed.map((r) => r.category))].sort();

const data = {
  generatedFrom: "docs/catalog/INDEX.md + docs/catalog/manifest.json",
  snapshot: snapshotDate(indexMd),
  // Computed from the table itself; INDEX.md's prose distribution line has drifted before.
  distribution: Object.fromEntries(
    grades.map((g) => [g, reviewed.filter((r) => r.grade === g).length]),
  ),
  grades,
  categories,
  plugins: reviewed.sort((a, b) => {
    const g = grades.indexOf(a.grade) - grades.indexOf(b.grade);
    return g !== 0 ? g : (b.stars || -1) - (a.stars || -1);
  }),
};

writeFileSync(join(here, "data.json"), JSON.stringify(data, null, 2) + "\n");

const counts = {};
for (const p of data.plugins) counts[p.grade] = (counts[p.grade] || 0) + 1;
console.log(
  `build: wrote data.json with ${data.plugins.length} reviewed plugins ` +
    `(A:${counts.A || 0} B:${counts.B || 0} C:${counts.C || 0} D:${counts.D || 0} F:${counts.F || 0}), ` +
    `${data.categories.length} categories, snapshot ${data.snapshot}`,
);
