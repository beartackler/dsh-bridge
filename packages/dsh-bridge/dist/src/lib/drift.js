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
/** Directories never part of a plugin's audited surface. */
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".cache",
    "coverage",
    ".turbo",
]);
/** Files that change without the code changing. */
const SKIP_FILES = new Set([".DS_Store", "package-lock.json", "pnpm-lock.yaml"]);
/** Guard against hashing an unbounded tree; a plugin this large is reported, not walked. */
const MAX_FILES = 5000;
/** Per-file read cap; larger files contribute path plus size only. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const EMPTY_AUDIT_STATE = Object.freeze({ version: 1, plugins: Object.freeze({}) });
/** `$HOME/.dsh-bridge/audit-state.json` (memory.ts owns the sibling file). */
export function auditStatePath(home) {
    return join(home, ".dsh-bridge", "audit-state.json");
}
/**
 * Read the state file. A missing, unreadable, or malformed file yields the
 * empty state: drift detection must degrade to "nothing recorded yet" rather
 * than throw inside a status dashboard.
 */
export function loadAuditState(path) {
    let raw;
    try {
        raw = readFileSync(path, "utf8");
    }
    catch {
        return EMPTY_AUDIT_STATE;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return EMPTY_AUDIT_STATE;
    }
    if (typeof parsed !== "object" || parsed === null)
        return EMPTY_AUDIT_STATE;
    const plugins = parsed["plugins"];
    if (typeof plugins !== "object" || plugins === null)
        return EMPTY_AUDIT_STATE;
    const out = {};
    for (const [pkg, value] of Object.entries(plugins)) {
        if (typeof value !== "object" || value === null)
            continue;
        const record = value;
        const hash = typeof record["hash"] === "string" ? record["hash"] : "";
        if (hash === "")
            continue;
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
export function saveAuditState(path, state) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
/** Merge one record into a state value without mutating the input. */
export function withRecord(state, record) {
    return { version: 1, plugins: { ...state.plugins, [record.pkg]: record } };
}
/** Catalog slug of an installed package name: last path segment, lowercased. */
export function slugForPackage(pkg) {
    const last = pkg.split("/").filter(Boolean).pop() ?? pkg;
    return last.replace(/^dsh-plugin-/, "").trim().toLowerCase();
}
/**
 * Discover installed plugins from profile ground truth. The profile manifest
 * names the dependencies; each resolves to a directory under the profile's
 * `node_modules`. A dependency whose directory is absent is skipped rather
 * than reported, because a phantom row would read as drift.
 */
export function discoverInstalledPlugins(dshHome, profile) {
    const profileDir = join(dshHome, "profiles", profile);
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    }
    catch {
        return [];
    }
    if (typeof manifest !== "object" || manifest === null)
        return [];
    const deps = manifest["dependencies"];
    if (typeof deps !== "object" || deps === null)
        return [];
    const found = [];
    for (const pkg of Object.keys(deps).sort()) {
        const dir = join(profileDir, "node_modules", ...pkg.split("/"));
        let version = null;
        try {
            if (!statSync(dir).isDirectory())
                continue;
        }
        catch {
            continue;
        }
        try {
            const own = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
            version = typeof own["version"] === "string" ? own["version"] : null;
        }
        catch {
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
function collectFiles(dir) {
    const out = [];
    const stack = [""];
    while (stack.length > 0 && out.length <= MAX_FILES) {
        const relative = stack.pop();
        let entries;
        try {
            entries = readdirSync(join(dir, relative));
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const rel = relative === "" ? entry : `${relative}/${entry}`;
            let stats;
            try {
                stats = statSync(join(dir, rel));
            }
            catch {
                continue;
            }
            if (stats.isDirectory()) {
                if (!SKIP_DIRS.has(entry))
                    stack.push(rel);
            }
            else if (stats.isFile() && !SKIP_FILES.has(entry)) {
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
export function hashPluginDir(dir) {
    try {
        if (!statSync(dir).isDirectory())
            return null;
    }
    catch {
        return null;
    }
    const files = collectFiles(dir);
    const outer = createHash("sha256");
    for (const rel of files) {
        const absolute = join(dir, rel);
        let size = 0;
        try {
            size = statSync(absolute).size;
        }
        catch {
            continue;
        }
        outer.update(rel);
        outer.update("\0");
        if (size > MAX_FILE_BYTES) {
            outer.update(`oversize:${size}`);
        }
        else {
            try {
                outer.update(createHash("sha256").update(readFileSync(absolute)).digest("hex"));
            }
            catch {
                outer.update("unreadable");
            }
        }
        outer.update("\n");
    }
    return `sha256:${outer.digest("hex")}`;
}
/**
 * Compare installed plugins against recorded audit hashes.
 *
 * `hash` is injected so callers (and tests) can substitute a cheap hasher;
 * the default walks the real directory.
 */
export function detectDrift(installed, state, hash = hashPluginDir) {
    return installed.map((plugin) => {
        const record = state.plugins[plugin.pkg];
        const currentHash = hash(plugin.dir);
        const recordedHash = record?.hash ?? null;
        let driftState;
        if (recordedHash === null) {
            driftState = "never-audited";
        }
        else if (currentHash === null || currentHash === recordedHash) {
            driftState = "aligned";
        }
        else {
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
export function changedEntries(entries) {
    return entries.filter((entry) => entry.state === "changed");
}
/**
 * The one status line the drift watch contributes, or null when nothing
 * changed. Status must not print a zero-count warning: a clean profile earns
 * silence, not a reassurance banner.
 */
export function driftStatusLine(entries) {
    const changed = changedEntries(entries).length;
    if (changed === 0)
        return null;
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
export function findingFingerprint(finding) {
    return `${finding.ruleId}@${finding.path}:${finding.line}`;
}
/** Sorted fingerprints of a scan report, ready to persist. */
export function fingerprintsOf(report) {
    return [...new Set(report.findings.map(findingFingerprint))].sort();
}
/** Set difference between recorded and current fingerprints. */
export function diffFindings(previous, current) {
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
export function isoDate(now = new Date()) {
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
export function annotateCardAudited(markdown, annotation) {
    const lines = markdown.split(/\r?\n/);
    const index = lines.findIndex((line) => /^\|\s*Audited\s*\|/i.test(line));
    if (index === -1)
        return markdown;
    const line = lines[index];
    const match = /^(\|\s*Audited\s*\|)(.*?)(\|\s*)$/.exec(line);
    if (match === null)
        return markdown;
    const body = (match[2] ?? "").replace(ANNOTATION, "").trimEnd();
    lines[index] = `${match[1]}${body} ${annotation} ${match[3]}`.replace(/\s+\|\s*$/, " |");
    return lines.join("\n");
}
/**
 * One-sentence annotation describing a local re-check. Grade wording states
 * observation, not authority: `local scan grade C` never reads as the card's
 * grade changing.
 */
export function annotationSentence(input) {
    const parts = [`Local re-check ${input.date}: local scan grade ${input.localGrade}`];
    if (input.cardGrade !== null && input.cardGrade !== "") {
        parts.push(input.localGrade === input.cardGrade ? "matches card grade" : `differs from card grade ${input.cardGrade}`);
    }
    parts.push(`${input.diff.added.length} new, ${input.diff.resolved.length} resolved finding(s)`);
    if (input.hash !== null)
        parts.push(`tree ${input.hash.replace(/^sha256:/, "").slice(0, 12)}`);
    return `${parts.join(", ")}.`;
}
/**
 * Drift entries for the active profile: the single call /bridge-status makes.
 * Composed here so no command module has to reassemble the pipeline.
 */
export function installedDrift(home, dshHome, profile) {
    return detectDrift(discoverInstalledPlugins(dshHome, profile), loadAuditState(auditStatePath(home)));
}
//# sourceMappingURL=drift.js.map