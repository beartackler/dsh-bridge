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
import type { ScanReport } from "./scan-client.js";
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
export declare const EMPTY_AUDIT_STATE: AuditState;
/** `$HOME/.dsh-bridge/audit-state.json` (memory.ts owns the sibling file). */
export declare function auditStatePath(home: string): string;
/**
 * Read the state file. A missing, unreadable, or malformed file yields the
 * empty state: drift detection must degrade to "nothing recorded yet" rather
 * than throw inside a status dashboard.
 */
export declare function loadAuditState(path: string): AuditState;
/** Write the state file, creating `$HOME/.dsh-bridge` when absent. */
export declare function saveAuditState(path: string, state: AuditState): void;
/** Merge one record into a state value without mutating the input. */
export declare function withRecord(state: AuditState, record: AuditRecord): AuditState;
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
export declare function slugForPackage(pkg: string): string;
/**
 * Discover installed plugins from profile ground truth. The profile manifest
 * names the dependencies; each resolves to a directory under the profile's
 * `node_modules`. A dependency whose directory is absent is skipped rather
 * than reported, because a phantom row would read as drift.
 */
export declare function discoverInstalledPlugins(dshHome: string, profile: string): InstalledPlugin[];
/**
 * Deterministic content hash of an installed plugin directory.
 *
 * The digest covers sorted relative paths plus per-file content digests, so a
 * rename, an added file, and an edited byte all move the hash, while walk
 * order and mtimes do not. Returns null when the directory is absent: an
 * unhashable target is not drift.
 */
export declare function hashPluginDir(dir: string): string | null;
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
export declare function detectDrift(installed: readonly InstalledPlugin[], state: AuditState, hash?: (dir: string) => string | null): DriftEntry[];
/** Installed plugins whose on-disk hash differs from what their card recorded. */
export declare function changedEntries(entries: readonly DriftEntry[]): DriftEntry[];
/**
 * The one status line the drift watch contributes, or null when nothing
 * changed. Status must not print a zero-count warning: a clean profile earns
 * silence, not a reassurance banner.
 */
export declare function driftStatusLine(entries: readonly DriftEntry[]): string | null;
/**
 * Stable identity of one finding across scans: rule plus location. The
 * excerpt digest is deliberately excluded, so reformatting a line does not
 * present as a resolved finding plus a new one.
 */
export declare function findingFingerprint(finding: {
    ruleId: string;
    path: string;
    line: number;
}): string;
/** Sorted fingerprints of a scan report, ready to persist. */
export declare function fingerprintsOf(report: ScanReport): string[];
export interface FindingsDiff {
    readonly added: readonly string[];
    readonly resolved: readonly string[];
    readonly unchanged: number;
}
/** Set difference between recorded and current fingerprints. */
export declare function diffFindings(previous: readonly string[], current: readonly string[]): FindingsDiff;
/** `YYYY-MM-DD` in UTC, the format every card and the catalog index use. */
export declare function isoDate(now?: Date): string;
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
export declare function annotateCardAudited(markdown: string, annotation: string): string;
/**
 * One-sentence annotation describing a local re-check. Grade wording states
 * observation, not authority: `local scan grade C` never reads as the card's
 * grade changing.
 */
export declare function annotationSentence(input: {
    readonly date: string;
    readonly localGrade: string;
    readonly cardGrade: string | null;
    readonly diff: FindingsDiff;
    readonly hash: string | null;
}): string;
/**
 * Drift entries for the active profile: the single call /bridge-status makes.
 * Composed here so no command module has to reassemble the pipeline.
 */
export declare function installedDrift(home: string, dshHome: string, profile: string): DriftEntry[];
//# sourceMappingURL=drift.d.ts.map