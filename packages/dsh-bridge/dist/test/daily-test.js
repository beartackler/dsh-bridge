/**
 * Tests for /bridge-daily (docs/design/daily-loop.md).
 *
 * Scope, matching the four blocks the design commits to:
 *   1. State store      round-trip, malformed degradation, atomic write.
 *   2. Date arithmetic  whole-day differences, unusable input.
 *   3. Rotation picker  never-audited first, oldest next, drifted excluded,
 *                       deterministic ties.
 *   4. Briefing model   counts keep never-audited apart from aligned, newly-
 *                       changed is a set difference, first-open has no delta.
 *   5. Rendering        THE central requirement: a quiet day produces value.
 *                       Also that drift never renders as a grade, and that an
 *                       empty profile never reads as clean.
 *   6. Runner           snapshot advances the delta, --peek does not, drift is
 *                       injectable so nothing walks a real profile.
 *
 * Hermetic: no scanner spawn, no real profile, no ambient clock. Every date is
 * injected and every I/O boundary is either a tmpdir or a fake.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
const dist = new URL("../src", import.meta.url).pathname;
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const daily = await import(`${dist}/commands/daily.js`);
const { EMPTY_DAILY_STATE, ROTATE_AFTER_DAYS, buildBriefing, dailyStatePath, daysBetweenIso, loadDailyState, pickRotation, renderDaily, runDaily, saveDailyState, } = daily;
const cleanupPaths = [];
after(() => {
    for (const path of cleanupPaths)
        rmSync(path, { recursive: true, force: true });
});
function scratchDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    cleanupPaths.push(dir);
    return dir;
}
function makeCtx(home) {
    return makeBridgeContext({
        profile: "web",
        paths: {
            home,
            dshHome: join(home, ".dsh"),
            profilePatch: profilePatchPath("web", join(home, ".dsh")),
            profilePackageJson: profilePackageJsonPath("web", join(home, ".dsh")),
        },
        output: { table, card, badge },
    });
}
/** One DriftEntry, shaped exactly as lib/drift.ts detectDrift emits them. */
function entry(pkg, state, auditedOn = "2026-08-01") {
    const slug = pkg.split("/").pop();
    return {
        pkg,
        slug,
        state,
        currentHash: "sha256:aaa",
        recordedHash: state === "never-audited" ? null : "sha256:bbb",
        auditedOn: state === "never-audited" ? null : auditedOn,
    };
}
// ---------------------------------------------------------------------------
// 1. State store
// ---------------------------------------------------------------------------
describe("daily state store", () => {
    it("round-trips a snapshot", () => {
        const home = scratchDir("daily-state-");
        const path = dailyStatePath(home);
        saveDailyState(path, {
            version: 1,
            lastOpenedOn: "2026-08-20",
            changedPkgs: ["@a/one", "@b/two"],
            trackedCount: 4,
        });
        const loaded = loadDailyState(path);
        assert.equal(loaded.lastOpenedOn, "2026-08-20");
        assert.deepEqual([...loaded.changedPkgs], ["@a/one", "@b/two"]);
        assert.equal(loaded.trackedCount, 4);
    });
    it("writes under the bridge directory, never a native DSH path", () => {
        const path = dailyStatePath("/home/u");
        assert.equal(path, join("/home/u", ".dsh-bridge", "daily-state.json"));
        assert.ok(!path.includes(join(".dsh", "profiles")), "must not live in a DSH-owned location");
    });
    it("degrades to the empty state for a missing file", () => {
        const loaded = loadDailyState(join(scratchDir("daily-missing-"), "nope.json"));
        assert.deepEqual(loaded, EMPTY_DAILY_STATE);
    });
    it("degrades to the empty state for malformed JSON rather than throwing", () => {
        const dir = scratchDir("daily-malformed-");
        const path = join(dir, "daily-state.json");
        writeFileSync(path, "{ not json at all");
        assert.deepEqual(loadDailyState(path), EMPTY_DAILY_STATE);
    });
    it("ignores wrong-typed fields instead of trusting them", () => {
        const dir = scratchDir("daily-wrongtype-");
        const path = join(dir, "daily-state.json");
        writeFileSync(path, JSON.stringify({ lastOpenedOn: 7, changedPkgs: "nope", trackedCount: "x" }));
        const loaded = loadDailyState(path);
        assert.equal(loaded.lastOpenedOn, "");
        assert.deepEqual([...loaded.changedPkgs], []);
        assert.equal(loaded.trackedCount, 0);
    });
    it("leaves no temp file behind after an atomic write", () => {
        const home = scratchDir("daily-atomic-");
        const path = dailyStatePath(home);
        saveDailyState(path, EMPTY_DAILY_STATE);
        assert.ok(readFileSync(path, "utf8").endsWith("\n"));
        assert.throws(() => readFileSync(`${path}.tmp-${process.pid}`, "utf8"));
    });
});
// ---------------------------------------------------------------------------
// 2. Date arithmetic
// ---------------------------------------------------------------------------
describe("daysBetweenIso", () => {
    it("counts whole days", () => {
        assert.equal(daysBetweenIso("2026-08-20", "2026-08-26"), 6);
        assert.equal(daysBetweenIso("2026-08-26", "2026-08-26"), 0);
    });
    it("returns null for unusable input rather than a wrong number", () => {
        assert.equal(daysBetweenIso("not-a-date", "2026-08-26"), null);
        assert.equal(daysBetweenIso("2026-08-26", ""), null);
    });
});
// ---------------------------------------------------------------------------
// 3. Rotation picker
// ---------------------------------------------------------------------------
describe("pickRotation", () => {
    it("returns null when nothing is tracked", () => {
        assert.equal(pickRotation([], "2026-08-26"), null);
    });
    it("prefers a never-audited plugin over a merely old one", () => {
        const chore = pickRotation([entry("@x/old", "aligned", "2020-01-01"), entry("@x/fresh", "never-audited")], "2026-08-26");
        assert.equal(chore?.slug, "fresh");
        assert.equal(chore?.ageDays, null);
        assert.match(chore?.reason, /never audited/);
    });
    it("picks the oldest audit when all are audited", () => {
        const chore = pickRotation([
            entry("@x/recent", "aligned", "2026-08-25"),
            entry("@x/ancient", "aligned", "2026-06-01"),
            entry("@x/middle", "aligned", "2026-08-01"),
        ], "2026-08-26");
        assert.equal(chore?.slug, "ancient");
        assert.equal(chore?.ageDays, 86);
        assert.match(chore?.reason, new RegExp(`${ROTATE_AFTER_DAYS}-day mark`));
    });
    it("excludes a drifted plugin, whose prompt is the alarm, not the chore", () => {
        const chore = pickRotation([entry("@x/moved", "changed", "2020-01-01"), entry("@x/still", "aligned", "2026-08-20")], "2026-08-26");
        assert.equal(chore?.slug, "still", "a changed plugin must not double as the rotation chore");
    });
    it("is deterministic on a tie so an ignored chore reappears unchanged", () => {
        const entries = [entry("@x/bbb", "aligned", "2026-08-01"), entry("@x/aaa", "aligned", "2026-08-01")];
        const first = pickRotation(entries, "2026-08-26");
        const second = pickRotation([...entries].reverse(), "2026-08-26");
        assert.equal(first?.slug, "aaa");
        assert.equal(second?.slug, first?.slug, "tie-break must not depend on input order");
    });
    it("names a runnable command, not a description of one", () => {
        const chore = pickRotation([entry("@liustack/modlens", "aligned", "2026-01-01")], "2026-08-26");
        assert.equal(chore?.command, "/bridge-trust refresh modlens");
    });
    it("does not claim the mark was passed when the audit is recent", () => {
        const chore = pickRotation([entry("@x/one", "aligned", "2026-08-24")], "2026-08-26");
        assert.equal(chore?.ageDays, 2);
        assert.doesNotMatch(chore?.reason, /mark/);
    });
});
// ---------------------------------------------------------------------------
// 4. Briefing model
// ---------------------------------------------------------------------------
describe("buildBriefing", () => {
    it("keeps never-audited apart from aligned", () => {
        const briefing = buildBriefing([entry("@x/a", "aligned"), entry("@x/b", "never-audited"), entry("@x/c", "changed")], EMPTY_DAILY_STATE, "2026-08-26");
        assert.deepEqual(briefing.counts, { tracked: 3, aligned: 1, changed: 1, neverAudited: 1 });
    });
    it("reports newly-changed as a set difference against the last open", () => {
        const previous = {
            version: 1,
            lastOpenedOn: "2026-08-23",
            changedPkgs: ["@x/known"],
            trackedCount: 2,
        };
        const briefing = buildBriefing([entry("@x/known", "changed"), entry("@x/surprise", "changed")], previous, "2026-08-26");
        assert.deepEqual([...briefing.changedPkgs], ["@x/known", "@x/surprise"]);
        assert.deepEqual([...briefing.newlyChangedPkgs], ["@x/surprise"]);
        assert.equal(briefing.daysSinceLastOpen, 3);
    });
    it("has no delta on a first open", () => {
        const briefing = buildBriefing([entry("@x/a", "aligned")], EMPTY_DAILY_STATE, "2026-08-26");
        assert.equal(briefing.daysSinceLastOpen, null);
    });
});
// ---------------------------------------------------------------------------
// 5. Rendering: the quiet day is the requirement
// ---------------------------------------------------------------------------
describe("renderDaily on a quiet day", () => {
    const previous = {
        version: 1,
        lastOpenedOn: "2026-08-23",
        changedPkgs: [],
        trackedCount: 3,
    };
    const quiet = buildBriefing([
        entry("@x/a", "aligned", "2026-08-20"),
        entry("@x/b", "aligned", "2026-08-10"),
        entry("@x/c", "aligned", "2026-08-22"),
    ], previous, "2026-08-26");
    const markdown = renderDaily(quiet);
    it("attests what was checked, with counts and a date", () => {
        assert.match(markdown, /3 plugins tracked/);
        assert.match(markdown, /3 unchanged since audit/);
        assert.match(markdown, /Checked 2026-08-26/);
    });
    it("states the delta explicitly instead of going silent", () => {
        assert.match(markdown, /Nothing moved in 3 days\./);
    });
    it("still hands the user one concrete chore", () => {
        assert.match(markdown, /Today's re-check:/);
        assert.match(markdown, /\/bridge-trust refresh b/);
    });
    it("never mentions an alarm or a grade when nothing is wrong", () => {
        assert.doesNotMatch(markdown, /\bchanged since your last\b/);
        assert.doesNotMatch(markdown, /not reported before/);
        assert.doesNotMatch(markdown, /\bgrade\b/i, "drift output must never read as a grade");
    });
    it("is ASCII only and emoji free", () => {
        // eslint-disable-next-line no-control-regex
        assert.doesNotMatch(markdown, /[^\x00-\x7F]/, "output must stay ASCII");
    });
    it("says nothing was probed, because nothing was", () => {
        assert.match(markdown, /Nothing was probed or sent/);
    });
});
describe("renderDaily on an eventful day", () => {
    const previous = {
        version: 1,
        lastOpenedOn: "2026-08-25",
        changedPkgs: [],
        trackedCount: 2,
    };
    const markdown = renderDaily(buildBriefing([entry("@liustack/modlens", "changed", "2026-08-01"), entry("@x/steady", "aligned", "2026-08-20")], previous, "2026-08-26"));
    it("names the changed package", () => {
        assert.match(markdown, /@liustack\/modlens/);
        assert.match(markdown, /Changed since yesterday and not reported before/);
    });
    it("states plainly that a changed tree is not a verdict", () => {
        assert.match(markdown, /not a verdict/);
        assert.doesNotMatch(markdown, /\bgrade\b/i);
    });
    it("still shows the rotation chore for a different plugin", () => {
        assert.match(markdown, /\/bridge-trust refresh steady/);
    });
});
describe("renderDaily honesty paths", () => {
    it("an empty profile reads as nothing tracked, never as clean", () => {
        const markdown = renderDaily(buildBriefing([], EMPTY_DAILY_STATE, "2026-08-26"));
        assert.match(markdown, /Nothing tracked/);
        assert.match(markdown, /not a clean profile/);
        assert.doesNotMatch(markdown, /unchanged since audit/);
    });
    it("counts never-audited plugins as unknown, not clean", () => {
        const markdown = renderDaily(buildBriefing([entry("@x/a", "aligned", "2026-08-20"), entry("@x/b", "never-audited"), entry("@x/c", "never-audited")], EMPTY_DAILY_STATE, "2026-08-26"));
        assert.match(markdown, /2 never audited/);
        assert.match(markdown, /unknown, not clean/);
    });
    it("says so on a first briefing rather than inventing a delta", () => {
        const markdown = renderDaily(buildBriefing([entry("@x/a", "aligned")], EMPTY_DAILY_STATE, "2026-08-26"));
        assert.match(markdown, /First briefing on this machine/);
    });
    it("distinguishes a still-drifted plugin from a newly drifted one", () => {
        const markdown = renderDaily(buildBriefing([entry("@x/known", "changed", "2026-08-01")], { version: 1, lastOpenedOn: "2026-08-24", changedPkgs: ["@x/known"], trackedCount: 1 }, "2026-08-26"));
        assert.match(markdown, /Nothing new moved in 2 days/);
        assert.match(markdown, /the 1 already-reported plugin\nstill differs from its recorded audit\./);
        assert.doesNotMatch(markdown, /not reported before/, "a known drift is not a new one");
    });
    it("agrees in number when several plugins are still drifted", () => {
        const markdown = renderDaily(buildBriefing([entry("@x/known", "changed", "2026-08-01"), entry("@x/other", "changed", "2026-08-01")], {
            version: 1,
            lastOpenedOn: "2026-08-24",
            changedPkgs: ["@x/known", "@x/other"],
            trackedCount: 2,
        }, "2026-08-26"));
        assert.match(markdown, /the 2 already-reported\nplugins still differ from their recorded audit\./);
    });
    it("names an already-drifted package on a first open instead of hiding it", () => {
        const markdown = renderDaily(buildBriefing([entry("@x/moved", "changed", "2026-08-01")], EMPTY_DAILY_STATE, "2026-08-26"));
        assert.match(markdown, /First briefing on this machine/);
        assert.match(markdown, /Already different from its recorded audit:/);
        assert.match(markdown, /- @x\/moved/);
        assert.match(markdown, /not a verdict/);
    });
});
// ---------------------------------------------------------------------------
// 6. Runner
// ---------------------------------------------------------------------------
describe("runDaily", () => {
    it("advances the snapshot so tomorrow's delta is correct", async () => {
        const home = scratchDir("daily-run-");
        const ctx = makeCtx(home);
        const drift = [entry("@x/moved", "changed", "2026-08-01"), entry("@x/still", "aligned", "2026-08-20")];
        const first = await runDaily(ctx, {}, { drift, now: new Date("2026-08-26T10:00:00Z") });
        assert.match(first.markdown, /@x\/moved/);
        const state = loadDailyState(dailyStatePath(home));
        assert.equal(state.lastOpenedOn, "2026-08-26");
        assert.deepEqual([...state.changedPkgs], ["@x/moved"]);
        assert.equal(state.trackedCount, 2);
        // Second open, same drift: the package is known now, so it is not "new".
        const second = await runDaily(ctx, {}, { drift, now: new Date("2026-08-27T10:00:00Z") });
        assert.doesNotMatch(second.markdown, /not reported before/);
        assert.match(second.markdown, /Nothing new moved since yesterday/);
    });
    it("peek renders the same briefing without consuming the delta", async () => {
        const home = scratchDir("daily-peek-");
        const ctx = makeCtx(home);
        const drift = [entry("@x/a", "aligned", "2026-08-20")];
        await runDaily(ctx, { _: "peek" }, { drift, now: new Date("2026-08-26T10:00:00Z") });
        assert.equal(loadDailyState(dailyStatePath(home)).lastOpenedOn, "", "peek must not write");
        const result = await runDaily(ctx, { peek: "" }, { drift, now: new Date("2026-08-26T10:00:00Z") });
        assert.match(result.markdown, /snapshot was not updated/);
    });
    it("returns the briefing as structured data alongside the markdown", async () => {
        const home = scratchDir("daily-data-");
        const result = await runDaily(makeCtx(home), {}, { drift: [entry("@x/a", "aligned", "2026-08-20")], now: new Date("2026-08-26T00:00:00Z") });
        const data = result.data;
        assert.equal(data.date, "2026-08-26");
        assert.equal(data.counts.tracked, 1);
    });
    it("never touches the profile tree when drift is injected", async () => {
        const home = scratchDir("daily-readonly-");
        let wrote = 0;
        await runDaily(makeCtx(home), {}, {
            drift: [],
            now: new Date("2026-08-26T00:00:00Z"),
            writeState: () => {
                wrote += 1;
            },
        });
        assert.equal(wrote, 1, "exactly one write, and it is our own snapshot");
        assert.throws(() => readFileSync(dailyStatePath(home), "utf8"), "no real file when write is faked");
    });
});
//# sourceMappingURL=daily-test.js.map