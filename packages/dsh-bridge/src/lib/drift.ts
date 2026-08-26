/**
 * Drift watch: the retention mechanism (docs/reviews/pm-product-review.md §3).
 *
 * Cards are pinned to a commit; marketplaces install latest. So the artifact a
 * user actually runs diverges from the artifact a card graded. This module owns
 * exactly that gap:
 *
 *   1. Discover installed plugins from profile ground truth
 *      (`$DSH_HOME/profiles/<p>/package.json` deps resolved under
 *      `<profile>/node_modules/<pkg>` - seams doc §3.4).
 *   2. Hash each plugin directory deterministically.
 *   3. Persist per-plugin audit hashes at `$HOME/.dsh-bridge/audit-state.json`,
 *      following the memory.ts precedent that bridge state lives in a bridge
 *      directory, never a native DSH path.
 *   4. Compare, so /bridge-status can say "N changed since audit" and
 *      /bridge-trust refresh can say what changed in the findings.
 *
 * Rules honored:
 *  - Read-only over the user's tree. The only file written is our own state,
 *    plus the card annotation the caller asks for explicitly.
 *  - A hash mismatch is never rendered as a grade. Drift means "the audited
 *    artifact is not what is on disk", which is a prompt to re-check, not a
 *    verdict.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ScanReport } from "./scan-client.js";

/** Directories never part of a plugin's audited surface. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".cache",
  "coverage",
  ".turbo",
]);

/** Files that change without the code changing. */
const SKIP_FILES: ReadonlySet<string> = new Set([".DS_Store", "package-lock.json", "pnpm-lock.yaml"]);

/** Guard against hashing an unbounded tree; a plugin this large is reported, not walked. */
const MAX_FILES = 5000;

/** Per-file read cap; larger files contribute path plus size only. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// State store
// ---------------------------------------------------------------------------

/** Everything recorded about one plugin at its last local audit. */
export interface AuditRecord {
  /** Catalog slug the record joins to, e.g. `modlens`. */
  readonly slug: string;
  /** Installed package name, e.g. `@liustack/modlens`. */
  readonly pkg: string;
  /** Deterministic content hash of the installed directory at audit time. */
  readonly hash: string;
  /** ISO date (`YYYY-MM-DD`) the local audit ran. */
  readonly auditedOn: string;
  /** Grade the local scan produced, or the card grade when no scan ran. */
  readonly grade: string;
  /** Finding fingerprints, sorted, so a diff is a set operation. */
  readonly findings: readonly string[];
  /** Scanner version that produced `findings`; a bump makes a diff advisory. */
  readonly scannerVersion?: string;
}

export interface AuditState {
  readonly version: 1;
  /** Keyed by installed package name, which is unique per profile. */
  readonly plugins: Readonly<Record<string, AuditRecord>>;
}

export const EMPTY_AUDIT_STATE: AuditState = Object.freeze({ version: 1, plugins: Object.freeze({}) });

/** `$HOME/.dsh-bridge/audit-state.json` (memory.ts owns the sibling file). */
export function auditStatePath(home: string): string {
  return join(home, ".dsh-bridge", "audit-state.json");
}

/**
 * Read the state file. A missing, unreadable, or malformed file yields the
 * empty state: drift detection must degrade to "nothing recorded yet" rather
 * than throw inside a status dashboard.
 */
export function loadAuditState(path: string): AuditState {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return EMPTY_AUDIT_STATE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_AUDIT_STATE;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY_AUDIT_STATE;
  const plugins = (parsed as Record<string, unknown>)["plugins"];
  if (typeof plugins !== "object" || plugins === null) return EMPTY_AUDIT_STATE;

  const out: Record<string, AuditRecord> = {};
  for (const [pkg, value] of Object.entries(plugins as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const hash = typeof record["hash"] === "string" ? record["hash"] : "";
    if (hash === "") continue;
    out[pkg] = {
      slug: String(record["slug"] ?? ""),
      pkg,
      hash,
      auditedOn: String(record["auditedOn"] ?? ""),
      grade: String(record["grade"] ?? "?"),
      findings: Array.isArray(record["findings"]) ? record["findings"].map((f) => String(f)) : [],
      ...(typeof record["scannerVersion"] === "string" ? { scannerVersion: record["scannerVersion"] } : {}),
    };
  }
  return { version: 1, plugins: out };
}

/** Write the state file, creating `$HOME/.dsh-bridge` when absent. */
export function saveAuditState(path: string, state: AuditState): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Merge one record into a state value without mutating the input. */
export function withRecord(state: AuditState, record: AuditRecord): AuditState {
  return { version: 1, plugins: { ...state.plugins, [record.pkg]: record } };
}

// ---------------------------------------------------------------------------
// Installed-plugin discovery
// ---------------------------------------------------------------------------

/** One plugin found on disk under the active profile. */
export interface InstalledPlugin {
  /** Package name from the profile manifest, e.g. `@liustack/modlens`. */
  readonly pkg: string;
  /** Catalog slug this package joins to. */
  readonly slug: string;
  /** Absolute directory of the installed package. */
  readonly dir: string;
  /** Version from the package's own manifest when readable. */
  readonly version: string | null;
}

/** Catalog slug of an installed package name: last path segment, lowercased. */
export function slugForPackage(pkg: string): string {
  const last = pkg.split("/").filter(Boolean).pop() ?? pkg;
  return last.replace(/^dsh-plugin-/, "").trim().toLowerCase();
}

/**
 * Discover installed plugins from profile ground truth. The profile manifest
 * names the dependencies; each resolves to a directory under the profile's
 * `node_modules`. A dependency whose directory is absent is skipped rather
 * than reported, because a phantom row would read as drift.
 */
export function discoverInstalledPlugins(dshHome: string, profile: string): InstalledPlugin[] {
  const profileDir = join(dshHome, "profiles", profile);
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
  } catch {
    return [];
  }
  if (typeof manifest !== "object" || manifest === null) return [];
  const deps = (manifest as Record<string, unknown>)["dependencies"];
  if (typeof deps !== "object" || deps === null) return [];

  const found: InstalledPlugin[] = [];
  for (const pkg of Object.keys(deps as Record<string, unknown>).sort()) {
    const dir = join(profileDir, "node_modules", ...pkg.split("/"));
    let version: string | null = null;
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    try {
      const own = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
      version = typeof own["version"] === "string" ? own["version"] : null;
    } catch {
      version = null;
    }
    found.push({ pkg, slug: slugForPackage(pkg), dir, version });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Directory hashing
// ---------------------------------------------------------------------------

/** Relative paths of every hashable file under `dir`, sorted, POSIX separators. */
function collectFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [""];
  while (stack.length > 0 && out.length <= MAX_FILES) {
    const relative = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(join(dir, relative));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = relative === "" ? entry : `${relative}/${entry}`;
      let stats;
      try {
        stats = statSync(join(dir, rel));
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) stack.push(rel);
      } else if (stats.isFile() && !SKIP_FILES.has(entry)) {
        out.push(rel);
      }
    }
  }
  return out.sort();
}

/**
 * Deterministic content hash of an installed plugin directory.
 *
 * The digest covers sorted relative paths plus per-file content digests, so a
 * rename, an added file, and an edited byte all move the hash, while walk
 * order and mtimes do not. Returns null when the directory is absent: an
 * unhashable target is not drift.
 */
export function hashPluginDir(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const files = collectFiles(dir);
  const outer = createHash("sha256");
  for (const rel of files) {
    const absolute = join(dir, rel);
    let size = 0;
    try {
      size = statSync(absolute).size;
    } catch {
      continue;
    }
    outer.update(rel);
    outer.update("\0");
    if (size > MAX_FILE_BYTES) {
      outer.update(`oversize:${size}`);
    } else {
      try {
        outer.update(createHash("sha256").update(readFileSync(absolute)).digest("hex"));
      } catch {
        outer.update("unreadable");
      }
    }
    outer.update("\n");
  }
  return `sha256:${outer.digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Drift comparison
// ---------------------------------------------------------------------------

/** Why one installed plugin is or is not aligned with its recorded audit. */
export type DriftState = "aligned" | "changed" | "never-audited";

export interface DriftEntry {
  readonly pkg: string;
  readonly slug: string;
  readonly state: DriftState;
  /** Hash on disk now, or null when the directory could not be hashed. */
  readonly currentHash: string | null;
  /** Hash recorded at the last local audit, or null when none is recorded. */
  readonly recordedHash: string | null;
  readonly auditedOn: string | null;
}

/**
 * Compare installed plugins against recorded audit hashes.
 *
 * `hash` is injected so callers (and tests) can substitute a cheap hasher;
 * the default walks the real directory.
 */
export function detectDrift(
  installed: readonly InstalledPlugin[],
  state: AuditState,
  hash: (dir: string) => string | null = hashPluginDir,
): DriftEntry[] {
  return installed.map((plugin) => {
    const record = state.plugins[plugin.pkg];
    const currentHash = hash(plugin.dir);
    const recordedHash = record?.hash ?? null;
    let driftState: DriftState;
    if (recordedHash === null) {
      driftState = "never-audited";
    } else if (currentHash === null || currentHash === recordedHash) {
      driftState = "aligned";
    } else {
      driftState = "changed";
    }
    return {
      pkg: plugin.pkg,
      slug: plugin.slug,
      state: driftState,
      currentHash,
      recordedHash,
      auditedOn: record?.auditedOn ?? null,
    };
  });
}

/** Installed plugins whose on-disk hash differs from what their card recorded. */
export function changedEntries(entries: readonly DriftEntry[]): DriftEntry[] {
  return entries.filter((entry) => entry.state === "changed");
}

/**
 * The one status line the drift watch contributes, or null when nothing
 * changed. Status must not print a zero-count warning: a clean profile earns
 * silence, not a reassurance banner.
 */
export function driftStatusLine(entries: readonly DriftEntry[]): string | null {
  const changed = changedEntries(entries).length;
  if (changed === 0) return null;
  const noun = changed === 1 ? "plugin" : "plugins";
  return `${changed} installed ${noun} changed since audit; run \`/bridge-trust refresh\`.`;
}

// ---------------------------------------------------------------------------
// Findings diff
// ---------------------------------------------------------------------------

/**
 * Stable identity of one finding across scans: rule plus location. The
 * excerpt digest is deliberately excluded, so reformatting a line does not
 * present as a resolved finding plus a new one.
 */
export function findingFingerprint(finding: { ruleId: string; path: string; line: number }): string {
  return `${finding.ruleId}@${finding.path}:${finding.line}`;
}

/** Sorted fingerprints of a scan report, ready to persist. */
export function fingerprintsOf(report: ScanReport): string[] {
  return [...new Set(report.findings.map(findingFingerprint))].sort();
}

export interface FindingsDiff {
  readonly added: readonly string[];
  readonly resolved: readonly string[];
  readonly unchanged: number;
}

/** Set difference between recorded and current fingerprints. */
export function diffFindings(previous: readonly string[], current: readonly string[]): FindingsDiff {
  const before = new Set(previous);
  const after = new Set(current);
  return {
    added: [...after].filter((f) => !before.has(f)).sort(),
    resolved: [...before].filter((f) => !after.has(f)).sort(),
    unchanged: [...after].filter((f) => before.has(f)).length,
  };
}

// ---------------------------------------------------------------------------
// Card annotation
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` in UTC, the format every card and the catalog index use. */
export function isoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const ANNOTATION = /\s*Local re-check [^|]*?\.(?=\s*$)/;

/**
 * Append a local-review annotation to the card's verified-at line (the
 * `| Audited | ... |` row), replacing any previous annotation so repeated
 * refreshes do not accumulate sentences.
 *
 * The recorded audit itself is never edited: the annotation is additive prose
 * inside the same cell, and it never touches the Grade row. A local scan
 * cannot raise or lower a published grade; it can only report what it saw.
 * Returns the card unchanged when no Audited row exists.
 */
export function annotateCardAudited(markdown: string, annotation: string): string {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\|\s*Audited\s*\|/i.test(line));
  if (index === -1) return markdown;
  const line = lines[index] as string;
  const match = /^(\|\s*Audited\s*\|)(.*?)(\|\s*)$/.exec(line);
  if (match === null) return markdown;
  const body = (match[2] ?? "").replace(ANNOTATION, "").trimEnd();
  lines[index] = `${match[1]}${body} ${annotation} ${match[3]}`.replace(/\s+\|\s*$/, " |");
  return lines.join("\n");
}

/**
 * One-sentence annotation describing a local re-check. Grade wording states
 * observation, not authority: `local scan grade C` never reads as the card's
 * grade changing.
 */
export function annotationSentence(input: {
  readonly date: string;
  readonly localGrade: string;
  readonly cardGrade: string | null;
  readonly diff: FindingsDiff;
  readonly hash: string | null;
}): string {
  const parts: string[] = [`Local re-check ${input.date}: local scan grade ${input.localGrade}`];
  if (input.cardGrade !== null && input.cardGrade !== "") {
    parts.push(input.localGrade === input.cardGrade ? "matches card grade" : `differs from card grade ${input.cardGrade}`);
  }
  parts.push(`${input.diff.added.length} new, ${input.diff.resolved.length} resolved finding(s)`);
  if (input.hash !== null) parts.push(`tree ${input.hash.replace(/^sha256:/, "").slice(0, 12)}`);
  return `${parts.join(", ")}.`;
}

/**
 * Drift entries for the active profile: the single call /bridge-status makes.
 * Composed here so no command module has to reassemble the pipeline.
 */
export function installedDrift(home: string, dshHome: string, profile: string): DriftEntry[] {
  return detectDrift(discoverInstalledPlugins(dshHome, profile), loadAuditState(auditStatePath(home)));
}
