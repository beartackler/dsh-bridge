/**
 * Tests for the drift watch (docs/reviews/pm-product-review.md §3, move 4).
 *
 * Scope:
 *   1. Hash change detection - a deterministic directory hash that moves on an
 *      edit, an addition, and a rename, and is stable across walks.
 *   2. State store           - round-trip, malformed-file degradation, merge.
 *   3. Discovery             - installed plugins from profile ground truth.
 *   4. Drift comparison      - aligned / changed / never-audited, plus the one
 *      status line and its silence when nothing moved.
 *   5. Findings diff         - added, resolved, unchanged as a set operation.
 *   6. Card annotation       - Audited row annotated, repeated refresh does not
 *      accumulate, Grade row untouched, no-Audited-row card left alone.
 *   7. Refresh rendering     - diff report, first-audit wording, and the
 *      no-card-yet path which must never imply a published grade.
 *   8. Status integration    - the drift line appears only when a plugin moved.
 *
 * The scanner is never spawned here: refresh takes its scan through an
 * injected dependency, so these tests are hermetic and fast.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
const dist = new URL("../src", import.meta.url).pathname;
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const drift = await import(`${dist}/lib/drift.js`);
const trustModule = await import(`${dist}/commands/trust.js`);
const statusModule = await import(`${dist}/commands/status.js`);
const { annotateCardAudited, annotationSentence, auditStatePath, changedEntries, detectDrift, diffFindings, discoverInstalledPlugins, driftStatusLine, findingFingerprint, fingerprintsOf, hashPluginDir, isoDate, loadAuditState, saveAuditState, slugForPackage, withRecord, EMPTY_AUDIT_STATE, } = drift;
const { refreshInstalled, renderRefresh } = trustModule;
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
function makeCtx(home = "/home/u") {
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
/** Minimal ScanReport shaped like tools/scan v1 output. */
function makeReport(grade, findings) {
    return {
        schema: "dsh-bridge.scan/v1",
        scannerVersion: "0.1.0",
        rulesDigest: "abc123",
        ruleIds: [],
        target: "/tmp/x",
        stats: { filesScanned: 3, filesSkipped: 0, bytesScanned: 100 },
        grading: { grade, score: 10, counts: { info: 0, low: 0, medium: findings.length, high: 0, critical: 0 }, caps: [], gates: [], familiesPresent: [] },
        findings: findings.map((f, i) => ({
            id: `f${i}`,
            ruleId: f.ruleId,
            family: "EXEC",
            severity: "medium",
            message: "example",
            path: f.path,
            line: f.line,
            col: 1,
            excerpt: "x",
            excerptSha256: "d",
            confidence: 1,
        })),
    };
}
// ---------------------------------------------------------------------------
// 1. Hash change detection
// ---------------------------------------------------------------------------
describe("drift hashPluginDir", () => {
    it("is stable across repeated walks of unchanged content", () => {
        const dir = scratchDir("drift-hash-");
        writeFileSync(join(dir, "index.js"), "export const a = 1;\n");
        mkdirSync(join(dir, "lib"));
        writeFileSync(join(dir, "lib", "util.js"), "export const b = 2;\n");
        const first = hashPluginDir(dir);
        const second = hashPluginDir(dir);
        assert.ok(first !== null, "a real directory must hash");
        assert.match(first, /^sha256:[0-9a-f]{64}$/);
        assert.equal(first, second, "hash must not depend on walk order or mtimes");
    });
    it("changes when a file's bytes change", () => {
        const dir = scratchDir("drift-hash-edit-");
        writeFileSync(join(dir, "index.js"), "export const a = 1;\n");
        const before = hashPluginDir(dir);
        writeFileSync(join(dir, "index.js"), "export const a = 2;\n");
        assert.notEqual(hashPluginDir(dir), before, "an edited byte must move the hash");
    });
    it("changes when a file is added and when one is renamed", () => {
        const dir = scratchDir("drift-hash-add-");
        writeFileSync(join(dir, "a.js"), "1\n");
        const base = hashPluginDir(dir);
        writeFileSync(join(dir, "b.js"), "2\n");
        const added = hashPluginDir(dir);
        assert.notEqual(added, base, "an added file must move the hash");
        // Rename b.js -> c.js with identical content: paths are part of the digest.
        rmSync(join(dir, "b.js"));
        writeFileSync(join(dir, "c.js"), "2\n");
        assert.notEqual(hashPluginDir(dir), added, "a rename must move the hash");
    });
    it("ignores node_modules and lockfiles so dependency churn is not drift", () => {
        const dir = scratchDir("drift-hash-skip-");
        writeFileSync(join(dir, "index.js"), "1\n");
        const base = hashPluginDir(dir);
        mkdirSync(join(dir, "node_modules", "dep"), { recursive: true });
        writeFileSync(join(dir, "node_modules", "dep", "index.js"), "noise\n");
        writeFileSync(join(dir, "package-lock.json"), "{}\n");
        assert.equal(hashPluginDir(dir), base, "skipped paths must not affect the hash");
    });
    it("returns null for an absent directory, which is not drift", () => {
        assert.equal(hashPluginDir(join(scratchDir("drift-hash-none-"), "missing")), null);
    });
});
// ---------------------------------------------------------------------------
// 2. State store
// ---------------------------------------------------------------------------
describe("drift audit state", () => {
    it("places state at $HOME/.dsh-bridge/audit-state.json", () => {
        assert.equal(auditStatePath("/home/u"), "/home/u/.dsh-bridge/audit-state.json");
    });
    it("round-trips records through the state file", () => {
        const home = scratchDir("drift-state-");
        const path = auditStatePath(home);
        const record = {
            slug: "modlens",
            pkg: "@liustack/modlens",
            hash: "sha256:aa",
            auditedOn: "2026-08-26",
            grade: "B",
            findings: ["EXEC@src/a.ts:1"],
            scannerVersion: "0.1.0",
        };
        saveAuditState(path, withRecord(EMPTY_AUDIT_STATE, record));
        const loaded = loadAuditState(path);
        assert.deepEqual(loaded.plugins["@liustack/modlens"], record);
    });
    it("degrades to the empty state for a missing or malformed file", () => {
        const home = scratchDir("drift-state-bad-");
        assert.deepEqual(loadAuditState(auditStatePath(home)).plugins, {});
        const path = join(home, "broken.json");
        writeFileSync(path, "{not json");
        assert.deepEqual(loadAuditState(path).plugins, {}, "a corrupt file must not throw in a dashboard");
        writeFileSync(path, JSON.stringify({ version: 1, plugins: { a: { grade: "B" } } }));
        assert.deepEqual(loadAuditState(path).plugins, {}, "a record with no hash carries no drift claim");
    });
    it("merges without mutating the input state", () => {
        const first = withRecord(EMPTY_AUDIT_STATE, {
            slug: "a", pkg: "a", hash: "sha256:1", auditedOn: "2026-01-01", grade: "B", findings: [],
        });
        const second = withRecord(first, {
            slug: "b", pkg: "b", hash: "sha256:2", auditedOn: "2026-01-02", grade: "C", findings: [],
        });
        assert.deepEqual(Object.keys(first.plugins), ["a"]);
        assert.deepEqual(Object.keys(second.plugins).sort(), ["a", "b"]);
    });
});
// ---------------------------------------------------------------------------
// 3. Discovery from profile ground truth
// ---------------------------------------------------------------------------
describe("drift discoverInstalledPlugins", () => {
    /** Build a fake `$DSH_HOME/profiles/web` with two installed deps. */
    function makeProfile() {
        const dshHome = scratchDir("drift-profile-");
        const profileDir = join(dshHome, "profiles", "web");
        mkdirSync(profileDir, { recursive: true });
        writeFileSync(join(profileDir, "package.json"), JSON.stringify({ dependencies: { "@liustack/modlens": "^3.25.0", "dsh-context": "^1.0.0", "ghost-dep": "^1.0.0" } }));
        for (const [pkg, version] of [["@liustack/modlens", "3.25.0"], ["dsh-context", "1.0.0"]]) {
            const dir = join(profileDir, "node_modules", ...pkg.split("/"));
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "package.json"), JSON.stringify({ name: pkg, version }));
            writeFileSync(join(dir, "index.js"), "export default 1;\n");
        }
        return dshHome;
    }
    it("reads dependencies and resolves each to its installed directory", () => {
        const dshHome = makeProfile();
        const found = discoverInstalledPlugins(dshHome, "web");
        assert.deepEqual(found.map((p) => p.pkg), ["@liustack/modlens", "dsh-context"]);
        assert.equal(found[0].slug, "modlens");
        assert.equal(found[0].version, "3.25.0");
        assert.ok(found[0].dir.endsWith(join("node_modules", "@liustack", "modlens")));
    });
    it("skips a declared dependency with no directory rather than reporting a phantom", () => {
        const found = discoverInstalledPlugins(makeProfile(), "web");
        assert.equal(found.find((p) => p.pkg === "ghost-dep"), undefined);
    });
    it("returns nothing when the profile manifest is absent", () => {
        assert.deepEqual(discoverInstalledPlugins(scratchDir("drift-empty-"), "web"), []);
    });
    it("derives catalog slugs from scoped and prefixed package names", () => {
        assert.equal(slugForPackage("@liustack/modlens"), "modlens");
        assert.equal(slugForPackage("dsh-plugin-desktop"), "desktop");
        assert.equal(slugForPackage("ouroboros"), "ouroboros");
    });
});
// ---------------------------------------------------------------------------
// 4. Drift comparison and the status line
// ---------------------------------------------------------------------------
describe("drift detectDrift", () => {
    const installed = [
        { pkg: "a", slug: "a", dir: "/p/a", version: "1" },
        { pkg: "b", slug: "b", dir: "/p/b", version: "1" },
        { pkg: "c", slug: "c", dir: "/p/c", version: "1" },
    ];
    const state = withRecord(withRecord(EMPTY_AUDIT_STATE, {
        slug: "a", pkg: "a", hash: "sha256:aa", auditedOn: "2026-08-01", grade: "B", findings: [],
    }), { slug: "b", pkg: "b", hash: "sha256:bb", auditedOn: "2026-08-02", grade: "C", findings: [] });
    // a matches its record, b moved, c was never audited.
    const hashes = { "/p/a": "sha256:aa", "/p/b": "sha256:zz", "/p/c": "sha256:cc" };
    const entries = detectDrift(installed, state, (dir) => hashes[dir] ?? null);
    it("classifies aligned, changed, and never-audited plugins", () => {
        assert.deepEqual(entries.map((e) => [e.pkg, e.state]), [["a", "aligned"], ["b", "changed"], ["c", "never-audited"]]);
    });
    it("carries the recorded audit date so the user can judge the gap", () => {
        assert.equal(entries[1].auditedOn, "2026-08-02");
        assert.equal(entries[2].auditedOn, null);
    });
    it("treats an unhashable directory as aligned, never as drift", () => {
        const unhashable = detectDrift([installed[0]], state, () => null);
        assert.equal(unhashable[0].state, "aligned");
    });
    it("reports only changed plugins in the status line, and stays silent when none moved", () => {
        assert.equal(changedEntries(entries).length, 1);
        assert.equal(driftStatusLine(entries), "1 installed plugin changed since audit; run `/bridge-trust refresh`.");
        const aligned = detectDrift([installed[0]], state, () => "sha256:aa");
        assert.equal(driftStatusLine(aligned), null, "a clean profile earns silence, not a banner");
        assert.equal(driftStatusLine([]), null);
    });
    it("pluralizes the count correctly for more than one changed plugin", () => {
        const two = detectDrift(installed.slice(0, 2), state, () => "sha256:moved");
        assert.equal(driftStatusLine(two), "2 installed plugins changed since audit; run `/bridge-trust refresh`.");
    });
});
// ---------------------------------------------------------------------------
// 5. Findings diff
// ---------------------------------------------------------------------------
describe("drift diffFindings", () => {
    it("fingerprints a finding by rule and location, not by excerpt", () => {
        assert.equal(findingFingerprint({ ruleId: "EXEC-001", path: "src/a.ts", line: 12 }), "EXEC-001@src/a.ts:12");
    });
    it("dedupes and sorts fingerprints taken from a report", () => {
        const report = makeReport("C", [
            { ruleId: "NET-001", path: "src/b.ts", line: 3 },
            { ruleId: "EXEC-001", path: "src/a.ts", line: 1 },
            { ruleId: "EXEC-001", path: "src/a.ts", line: 1 },
        ]);
        assert.deepEqual(fingerprintsOf(report), ["EXEC-001@src/a.ts:1", "NET-001@src/b.ts:3"]);
    });
    it("splits a change into added, resolved, and unchanged", () => {
        const result = diffFindings(["A@x:1", "B@y:2"], ["B@y:2", "C@z:3"]);
        assert.deepEqual(result.added, ["C@z:3"]);
        assert.deepEqual(result.resolved, ["A@x:1"]);
        assert.equal(result.unchanged, 1);
    });
    it("reports every current finding as added when nothing was recorded", () => {
        const result = diffFindings([], ["A@x:1"]);
        assert.deepEqual(result.added, ["A@x:1"]);
        assert.deepEqual(result.resolved, []);
    });
});
// ---------------------------------------------------------------------------
// 6. Card annotation
// ---------------------------------------------------------------------------
describe("drift annotateCardAudited", () => {
    const CARD = [
        "# Trust Report Card: @liustack/modlens",
        "",
        "## 1. Header",
        "",
        "| Field | Value |",
        "|---|---|",
        "| Audited | 2026-08-25 by dsh-bridge trust worker (scanner 0.1.0) |",
        "| Grade | **B** |",
        "",
    ].join("\n");
    it("appends the annotation inside the Audited cell", () => {
        const out = annotateCardAudited(CARD, "Local re-check 2026-08-26: local scan grade B, matches card grade.");
        const line = out.split("\n").find((l) => l.startsWith("| Audited"));
        assert.match(line, /2026-08-25 by dsh-bridge trust worker \(scanner 0\.1\.0\) Local re-check 2026-08-26/);
        assert.ok(line.trimEnd().endsWith("|"), "the table row must stay a valid markdown row");
    });
    it("never touches the Grade row", () => {
        const out = annotateCardAudited(CARD, "Local re-check 2026-08-26: local scan grade D.");
        assert.match(out, /\| Grade \| \*\*B\*\* \|/, "a local scan must not rewrite a published grade");
    });
    it("replaces a prior annotation instead of accumulating sentences", () => {
        const once = annotateCardAudited(CARD, "Local re-check 2026-08-26: local scan grade B.");
        const twice = annotateCardAudited(once, "Local re-check 2026-08-27: local scan grade C.");
        assert.equal((twice.match(/Local re-check/g) ?? []).length, 1);
        assert.match(twice, /Local re-check 2026-08-27/);
    });
    it("leaves a card with no Audited row unchanged", () => {
        const noRow = "# Card\n\n| Grade | **C** |\n";
        assert.equal(annotateCardAudited(noRow, "Local re-check 2026-08-26: x."), noRow);
    });
    it("states a grade difference as an observation, not as a new grade", () => {
        const sentence = annotationSentence({
            date: "2026-08-26",
            localGrade: "D",
            cardGrade: "B",
            diff: { added: ["A@x:1"], resolved: [], unchanged: 0 },
            hash: "sha256:0123456789abcdef",
        });
        assert.match(sentence, /local scan grade D, differs from card grade B/);
        assert.match(sentence, /1 new, 0 resolved finding\(s\)/);
        assert.match(sentence, /tree 0123456789ab/);
    });
    it("reports a matching grade as matching", () => {
        const sentence = annotationSentence({
            date: "2026-08-26", localGrade: "B", cardGrade: "B",
            diff: { added: [], resolved: [], unchanged: 2 }, hash: null,
        });
        assert.match(sentence, /matches card grade/);
    });
    it("formats dates as the YYYY-MM-DD the catalog uses", () => {
        assert.equal(isoDate(new Date("2026-08-26T18:30:00Z")), "2026-08-26");
    });
});
// ---------------------------------------------------------------------------
// 7. Refresh: diff rendering, first audit, and the no-card-yet path
// ---------------------------------------------------------------------------
describe("trust refresh", () => {
    /** Profile with one installed plugin, plus a scratch cards dir and home. */
    function makeWorld(pkg = "@liustack/modlens") {
        const dshHome = scratchDir("refresh-dsh-");
        const home = scratchDir("refresh-home-");
        const cards = scratchDir("refresh-cards-");
        const profileDir = join(dshHome, "profiles", "web");
        mkdirSync(profileDir, { recursive: true });
        writeFileSync(join(profileDir, "package.json"), JSON.stringify({ dependencies: { [pkg]: "^1.0.0" } }));
        const dir = join(profileDir, "node_modules", ...pkg.split("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: pkg, version: "1.0.0" }));
        writeFileSync(join(dir, "index.js"), "export default 1;\n");
        return { dshHome, home, cards, dir };
    }
    const CARD = [
        "# Trust Report Card: @liustack/modlens",
        "",
        "## 1. Header",
        "",
        "| Field | Value |",
        "|---|---|",
        "| Audited | 2026-08-25 by dsh-bridge trust worker |",
        "| Grade | **B** |",
        "",
    ].join("\n");
    it("records a first audit and annotates the card", async () => {
        const world = makeWorld();
        writeFileSync(join(world.cards, "modlens.md"), CARD);
        const result = await refreshInstalled(makeCtx(world.home), "", {
            home: world.home,
            dshHome: world.dshHome,
            profile: "web",
            cardsDir: world.cards,
            now: new Date("2026-08-26T00:00:00Z"),
            scan: async () => makeReport("B", [{ ruleId: "NET-001", path: "index.js", line: 1 }]),
        });
        assert.equal(result.outcomes.length, 1);
        const outcome = result.outcomes[0];
        assert.equal(outcome.firstAudit, true);
        assert.equal(outcome.cardGrade, "B");
        assert.equal(outcome.annotated, true);
        assert.match(result.markdown, /First local audit/);
        const annotated = readFileSync(join(world.cards, "modlens.md"), "utf8");
        assert.match(annotated, /Local re-check 2026-08-26: local scan grade B, matches card grade/);
        // The hash is persisted, so the next /bridge-status is quiet.
        const state = loadAuditState(auditStatePath(world.home));
        assert.equal(state.plugins["@liustack/modlens"].hash, hashPluginDir(world.dir));
        assert.deepEqual(state.plugins["@liustack/modlens"].findings, ["NET-001@index.js:1"]);
    });
    it("renders new and resolved findings against the recorded audit", async () => {
        const world = makeWorld();
        writeFileSync(join(world.cards, "modlens.md"), CARD);
        saveAuditState(auditStatePath(world.home), withRecord(EMPTY_AUDIT_STATE, {
            slug: "modlens",
            pkg: "@liustack/modlens",
            hash: "sha256:stale",
            auditedOn: "2026-08-01",
            grade: "B",
            findings: ["NET-001@index.js:1", "EXEC-001@old.js:9"],
        }));
        const result = await refreshInstalled(makeCtx(world.home), "modlens", {
            home: world.home,
            dshHome: world.dshHome,
            profile: "web",
            cardsDir: world.cards,
            now: new Date("2026-08-26T00:00:00Z"),
            scan: async () => makeReport("C", [
                { ruleId: "NET-001", path: "index.js", line: 1 },
                { ruleId: "EXEC-002", path: "index.js", line: 4 },
            ]),
        });
        const outcome = result.outcomes[0];
        assert.equal(outcome.firstAudit, false);
        assert.deepEqual(outcome.diff.added, ["EXEC-002@index.js:4"]);
        assert.deepEqual(outcome.diff.resolved, ["EXEC-001@old.js:9"]);
        assert.equal(outcome.diff.unchanged, 1);
        assert.match(result.markdown, /New findings since the recorded audit/);
        assert.match(result.markdown, /- EXEC-002@index\.js:4/);
        assert.match(result.markdown, /Findings no longer present/);
        assert.match(result.markdown, /- EXEC-001@old\.js:9/);
        // A local grade below the card grade is reported, and the card keeps its B.
        const annotated = readFileSync(join(world.cards, "modlens.md"), "utf8");
        assert.match(annotated, /local scan grade C, differs from card grade B/);
        assert.match(annotated, /\| Grade \| \*\*B\*\* \|/);
    });
    it("handles the no-card-yet path without implying a published grade", async () => {
        const world = makeWorld("brand-new-plugin");
        const result = await refreshInstalled(makeCtx(world.home), "", {
            home: world.home,
            dshHome: world.dshHome,
            profile: "web",
            cardsDir: world.cards, // empty: no card exists for this plugin
            now: new Date("2026-08-26T00:00:00Z"),
            scan: async () => makeReport("C", [{ ruleId: "EXEC-001", path: "index.js", line: 2 }]),
        });
        const outcome = result.outcomes[0];
        assert.equal(outcome.cardGrade, null);
        assert.equal(outcome.annotated, false);
        assert.equal(outcome.firstAudit, true);
        assert.match(result.markdown, /No card exists for `brand-new-plugin`/);
        assert.match(result.markdown, /it is not a dsh-bridge review/);
        assert.match(result.markdown, /bridge-trust queue brand-new-plugin/);
        assert.match(result.markdown, /no card/, "the table must say no card, never a letter grade");
        // The hash is still recorded, so drift on an unreviewed plugin is trackable.
        assert.equal(loadAuditState(auditStatePath(world.home)).plugins["brand-new-plugin"].hash, hashPluginDir(world.dir));
    });
    it("does not record a plugin whose scan failed", async () => {
        const world = makeWorld();
        const result = await refreshInstalled(makeCtx(world.home), "", {
            home: world.home,
            dshHome: world.dshHome,
            profile: "web",
            cardsDir: world.cards,
            scan: async () => {
                throw new Error("scanner unavailable");
            },
        });
        assert.deepEqual(result.outcomes, []);
        assert.deepEqual(loadAuditState(auditStatePath(world.home)).plugins, {}, "a failed scan must not clear drift");
    });
    it("reports an empty profile as nothing to check, not as clean", () => {
        const markdown = renderRefresh(makeCtx(), []);
        assert.match(markdown, /No installed plugins found/);
        assert.match(markdown, /clean bill of health/);
    });
    it("filters to one plugin when a subject is given", async () => {
        const world = makeWorld();
        const result = await refreshInstalled(makeCtx(world.home), "https://github.com/other/unrelated", {
            home: world.home,
            dshHome: world.dshHome,
            profile: "web",
            cardsDir: world.cards,
            scan: async () => makeReport("B", []),
        });
        assert.deepEqual(result.outcomes, [], "a subject that matches no installed plugin scans nothing");
    });
});
// ---------------------------------------------------------------------------
// 8. Status integration: one line, only when something moved
// ---------------------------------------------------------------------------
describe("status drift line", () => {
    const collected = {
        rows: [{ id: "profile", label: "PROFILE", value: "web", source: "ctx", unavailable: false }],
        staleCards: [],
        totalCards: 0,
    };
    it("adds the drift line when an installed plugin changed", () => {
        const markdown = statusModule.renderStatus(makeCtx(), collected, 1, [
            { pkg: "a", slug: "a", state: "changed", currentHash: "sha256:x", recordedHash: "sha256:y", auditedOn: "2026-08-01" },
        ]);
        assert.match(markdown, /1 installed plugin changed since audit; run `\/bridge-trust refresh`\./);
    });
    it("omits the line entirely when nothing changed", () => {
        const markdown = statusModule.renderStatus(makeCtx(), collected, 1, [
            { pkg: "a", slug: "a", state: "aligned", currentHash: "sha256:x", recordedHash: "sha256:x", auditedOn: "2026-08-01" },
        ]);
        assert.doesNotMatch(markdown, /changed since audit/);
    });
    it("does not count a never-audited plugin as drift", () => {
        const markdown = statusModule.renderStatus(makeCtx(), collected, 1, [
            { pkg: "a", slug: "a", state: "never-audited", currentHash: "sha256:x", recordedHash: null, auditedOn: null },
        ]);
        assert.doesNotMatch(markdown, /changed since audit/);
    });
    it("reports drift through runStatus data for UI consumers", async () => {
        const entries = [
            { pkg: "a", slug: "a", state: "changed", currentHash: "sha256:x", recordedHash: "sha256:y", auditedOn: "2026-08-01" },
        ];
        const result = await statusModule.runStatus(makeCtx(), {}, { drift: entries, indexPath: "" });
        assert.match(result.markdown, /1 installed plugin changed since audit/);
        assert.deepEqual(result.data.drift, entries);
    });
});
//# sourceMappingURL=drift-test.js.map