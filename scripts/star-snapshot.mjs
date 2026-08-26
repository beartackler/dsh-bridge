#!/usr/bin/env node
// Daily growth snapshot for beartackler/dsh-bridge. Zero dependencies beyond node and the gh CLI.
// Appends one row per UTC day to docs/growth/star-history.jsonl. Re-running on the same day
// replaces that day's row, so the file stays idempotent.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "beartackler/dsh-bridge";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_PATH = path.join(ROOT, "docs", "growth", "star-history.jsonl");

function gh(apiPath) {
  const stdout = execFileSync("gh", ["api", apiPath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

const repo = gh(`repos/${REPO}`);
const row = {
  date: new Date().toISOString().slice(0, 10),
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  watchers: repo.subscribers_count,
};

try {
  // Top-level count covers the trailing 14-day window GitHub retains for traffic.
  const traffic = gh(`repos/${REPO}/traffic/clones`);
  row.traffic_clones_14d = traffic.count;
} catch {
  // Traffic endpoints require push access; omit the field instead of failing the snapshot.
}

const existingLines = existsSync(HISTORY_PATH)
  ? readFileSync(HISTORY_PATH, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => JSON.parse(line).date !== row.date)
  : [];

existingLines.push(JSON.stringify(row));
writeFileSync(HISTORY_PATH, existingLines.join("\n") + "\n");

console.log(existingLines[existingLines.length - 1]);
