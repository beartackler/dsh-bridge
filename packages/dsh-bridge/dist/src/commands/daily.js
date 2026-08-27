/**
 * /bridge-daily - the daily briefing (docs/design/daily-loop.md).
 *
 * Why this module exists: /bridge-status contributes exactly one drift line and
 * that line is deliberately silent when nothing moved (lib/drift.ts
 * `driftStatusLine`). Correct for a dashboard row, fatal for a habit: a surface
 * with nothing to say on a quiet day is not open on the day it has something to
 * say. This command is the quiet-day half of the same data.
 *
 * Four blocks, in order, all from data already on disk:
 *   1. Attestation      what is tracked and how much of it held, with a date.
 *   2. Delta            what moved since the previous open, including nothing.
 *   3. Rotation chore   the single oldest audit, as one runnable command.
 *   4. Coverage         how much of the profile has never been audited locally.
 *
 * Invariants:
 *  - A hash mismatch is never rendered as a grade. Drift means "the audited
 *    artifact is not what is on disk", which is a prompt, not a verdict. Same
 *    rule lib/drift.ts states for itself.
 *  - Absence is never reassurance. An empty profile reads "nothing tracked";
 *    a never-audited plugin is counted apart from an aligned one and is never
 *    folded into the attestation.
 *  - Read-only over the user's tree. The one file written is our own
 *    `$HOME/.dsh-bridge/daily-state.json`, a sibling of audit-state.json and
 *    memory.md, per the memory.ts precedent that bridge state lives in a
 *    bridge directory and never in a native DSH path.
 *  - No network. No clock reads outside the injected `now`.
 *
 * SPECULATIVE (docs/design/daily-loop.md, "Marked speculative"): that a daily
 * briefing forms a habit at all, and that the rotation chore is the element
 * that makes it stick, are product arguments with zero observed users behind
 * them. Nothing here measures usage, and no telemetry is added to find out.
 * The staleness threshold reused below is a round number, not a calibrated one.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { changedEntries, installedDrift, isoDate, } from "../lib/drift.js";
import { bulletList, heading } from "../lib/output.js";
/**
 * An audit older than this many days is the rotation candidate. Reused from
 * status.ts STALE_AFTER_DAYS on purpose so one number governs staleness
 * everywhere. SPECULATIVE: round, not derived from plugin release cadence.
 */
export const ROTATE_AFTER_DAYS = 30;
export const EMPTY_DAILY_STATE = Object.freeze({
    version: 1,
    lastOpenedOn: "",
    changedPkgs: Object.freeze([]),
    trackedCount: 0,
});
/** `$HOME/.dsh-bridge/daily-state.json`. */
export function dailyStatePath(home) {
    return join(home, ".dsh-bridge", "daily-state.json");
}
/**
 * Read the previous snapshot. A missing, unreadable, or malformed file yields
 * the empty state: a briefing must degrade to "first open" rather than throw.
 */
export function loadDailyState(path) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return EMPTY_DAILY_STATE;
    }
    if (typeof parsed !== "object" || parsed === null)
        return EMPTY_DAILY_STATE;
    const record = parsed;
    const changed = Array.isArray(record["changedPkgs"])
        ? record["changedPkgs"].map((entry) => String(entry)).sort()
        : [];
    const tracked = record["trackedCount"];
    return {
        version: 1,
        lastOpenedOn: typeof record["lastOpenedOn"] === "string" ? record["lastOpenedOn"] : "",
        changedPkgs: changed,
        trackedCount: typeof tracked === "number" && Number.isFinite(tracked) ? tracked : 0,
    };
}
/** Write the snapshot atomically so a concurrent read never sees a partial file. */
export function saveDailyState(path, state) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, path);
}
/** Whole days between two `YYYY-MM-DD` dates, or null when either is unusable. */
export function daysBetweenIso(from, to) {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b))
        return null;
    return Math.floor((b - a) / 86_400_000);
}
/**
 * Pick the rotation chore: the tracked plugin whose local audit is oldest.
 *
 * Never-audited plugins are surfaced first, because unknown outranks stale -
 * an unaudited package is the larger gap, and it is the one a user would
 * otherwise never be prompted about. Ties break on package name so the chore
 * is deterministic and a user who ignores it sees the same one tomorrow.
 * A plugin that already drifted is excluded: its prompt is the alarm above,
 * not the rotation, and printing it twice would read as two separate chores.
 */
export function pickRotation(entries, today) {
    const candidates = entries.filter((entry) => entry.state !== "changed");
    if (candidates.length === 0)
        return null;
    const never = candidates
        .filter((entry) => entry.state === "never-audited")
        .sort((a, b) => a.pkg.localeCompare(b.pkg));
    const pick = never[0];
    if (pick !== undefined) {
        return {
            slug: pick.slug,
            pkg: pick.pkg,
            ageDays: null,
            command: `/bridge-trust refresh ${pick.slug}`,
            reason: "never audited locally",
        };
    }
    const aged = candidates
        .map((entry) => ({
        entry,
        age: entry.auditedOn === null ? null : daysBetweenIso(entry.auditedOn, today),
    }))
        .filter((row) => row.age !== null)
        .sort((a, b) => (b.age - a.age !== 0 ? b.age - a.age : a.entry.pkg.localeCompare(b.entry.pkg)));
    const oldest = aged[0];
    if (oldest === undefined)
        return null;
    return {
        slug: oldest.entry.slug,
        pkg: oldest.entry.pkg,
        ageDays: oldest.age,
        command: `/bridge-trust refresh ${oldest.entry.slug}`,
        reason: oldest.age > ROTATE_AFTER_DAYS
            ? `oldest audit, ${oldest.age} days, past the ${ROTATE_AFTER_DAYS}-day mark`
            : `oldest audit, ${oldest.age} days`,
    };
}
/**
 * Build the briefing. Pure over its inputs: drift entries, the previous
 * snapshot, and today's date. Every filesystem and clock read happens at the
 * call boundary in `runDaily`, so this whole model is testable without a disk.
 */
export function buildBriefing(entries, previous, today) {
    const changedPkgs = changedEntries(entries)
        .map((entry) => entry.pkg)
        .sort();
    const previouslyChanged = new Set(previous.changedPkgs);
    const counts = {
        tracked: entries.length,
        aligned: entries.filter((entry) => entry.state === "aligned").length,
        changed: changedPkgs.length,
        neverAudited: entries.filter((entry) => entry.state === "never-audited").length,
    };
    return {
        date: today,
        counts,
        changedPkgs,
        newlyChangedPkgs: changedPkgs.filter((pkg) => !previouslyChanged.has(pkg)),
        daysSinceLastOpen: previous.lastOpenedOn === "" ? null : daysBetweenIso(previous.lastOpenedOn, today),
        chore: pickRotation(entries, today),
    };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function pluralPlugins(count) {
    return count === 1 ? "plugin" : "plugins";
}
/** Block 1: what is tracked and how much of it held. Never a grade. */
function attestationLines(briefing) {
    const { counts } = briefing;
    if (counts.tracked === 0) {
        return [
            "Nothing tracked. No plugin packages were found under this profile, so",
            "there is nothing to attest. An empty profile is not a clean profile.",
        ];
    }
    const parts = [`${counts.tracked} ${pluralPlugins(counts.tracked)} tracked`];
    parts.push(`${counts.aligned} unchanged since audit`);
    if (counts.changed > 0)
        parts.push(`${counts.changed} changed`);
    if (counts.neverAudited > 0)
        parts.push(`${counts.neverAudited} never audited`);
    return [`${parts.join(", ")}. Checked ${briefing.date}.`];
}
/** The one sentence that keeps a hash mismatch from reading as a verdict. */
function notAVerdict() {
    return [
        "A changed tree is not a verdict. It means the audited artifact is not what",
        "is on disk; re-check it to find out what that difference contains.",
    ];
}
/** Block 2: the delta against the previous open, including "nothing moved". */
function deltaLines(briefing) {
    if (briefing.counts.tracked === 0)
        return [];
    const since = briefing.daysSinceLastOpen;
    // A first open has no window to compare against, but silence about a package
    // that already differs from its audit would be a worse lie than a missing
    // delta: the attestation above just said "1 changed" and the user is owed the
    // name. Say there is no baseline, then still name what moved.
    if (since === null) {
        const opening = "First briefing on this machine, so there is no previous open to compare against.";
        if (briefing.changedPkgs.length === 0)
            return [opening];
        return [
            opening,
            "",
            "Already different from its recorded audit:",
            "",
            ...briefing.changedPkgs.map((pkg) => `- ${pkg}`),
            "",
            ...notAVerdict(),
        ];
    }
    const window = since === 0 ? "since earlier today" : since === 1 ? "since yesterday" : `in ${since} days`;
    if (briefing.newlyChangedPkgs.length === 0) {
        if (briefing.counts.changed === 0)
            return [`Nothing moved ${window}.`];
        return briefing.counts.changed === 1
            ? [
                `Nothing new moved ${window}; the 1 already-reported plugin`,
                "still differs from its recorded audit.",
            ]
            : [
                `Nothing new moved ${window}; the ${briefing.counts.changed} already-reported`,
                "plugins still differ from their recorded audit.",
            ];
    }
    return [
        `Changed ${window} and not reported before:`,
        "",
        ...briefing.newlyChangedPkgs.map((pkg) => `- ${pkg}`),
        "",
        ...notAVerdict(),
    ];
}
/** Block 3: one chore, one command. The backlog the user can watch shrink. */
function choreLines(briefing) {
    const chore = briefing.chore;
    if (chore === null)
        return [];
    const age = chore.ageDays === null ? "never" : `${chore.ageDays} days ago`;
    return [
        "Today's re-check:",
        "",
        `- ${chore.slug} (${chore.pkg}), last audited ${age}: ${chore.reason}`,
        `- Run: ${chore.command}`,
    ];
}
/** Block 4: coverage honesty. Unknown is stated as unknown, never as clean. */
function coverageLines(briefing) {
    const { counts } = briefing;
    if (counts.tracked === 0 || counts.neverAudited === 0)
        return [];
    return [
        `${counts.neverAudited} of ${counts.tracked} tracked ${pluralPlugins(counts.tracked)} have`,
        "never been audited locally. That is unknown, not clean: no local scan has",
        "produced a baseline hash for them yet.",
    ];
}
/** Render the four blocks. Pure over the briefing; no I/O, ASCII only. */
export function renderDaily(briefing) {
    const blocks = [
        attestationLines(briefing),
        deltaLines(briefing),
        choreLines(briefing),
        coverageLines(briefing),
    ];
    const body = blocks
        .filter((lines) => lines.length > 0)
        .map((lines) => lines.join("\n"))
        .join("\n\n");
    const footer = briefing.counts.tracked === 0
        ? bulletList([
            "`/bridge-browse` see the committed catalog",
            "`/bridge-trust scan <directory>` grade any local directory offline",
        ])
        : "Every figure above was read from local state. Nothing was probed or sent.";
    return [heading(`Daily briefing ${briefing.date}`), body, "", footer, ""].join("\n");
}
/**
 * `/bridge-daily` runner. Read-only over the user's tree; the single write is
 * our own snapshot, and `--peek` suppresses even that so a user can look
 * without consuming the delta they were about to read.
 */
export async function runDaily(ctx, args = {}, deps = {}) {
    const now = deps.now ?? new Date();
    const today = isoDate(now);
    const peek = (args["_"] ?? "").trim() === "peek" || args["peek"] !== undefined;
    const statePath = dailyStatePath(ctx.paths.home);
    const readState = deps.readState ?? loadDailyState;
    const previous = readState(statePath);
    const entries = deps.drift ?? installedDrift(ctx.paths.home, ctx.paths.dshHome, ctx.profile);
    const briefing = buildBriefing(entries, previous, today);
    if (!peek) {
        const writeState = deps.writeState ?? saveDailyState;
        writeState(statePath, {
            version: 1,
            lastOpenedOn: today,
            changedPkgs: briefing.changedPkgs,
            trackedCount: briefing.counts.tracked,
        });
    }
    const markdown = peek
        ? `${renderDaily(briefing)}\nPeek mode: the snapshot was not updated, so tomorrow's delta is unchanged.\n`
        : renderDaily(briefing);
    return { markdown, data: briefing };
}
//# sourceMappingURL=daily.js.map