/**
 * Tests for the /bridge-refactor command module
 * (docs/specs/commands/refactor.md).
 *
 * Scope for this wave:
 *   1. scanSource        - imports, exports, line counts from fixture text.
 *   2. Plan-only default - inventory + steps rendered, zero writes anywhere.
 *   3. split-file        - oversized multi-export fixture yields re-exporting
 *                          steps; applying them with a green exec double
 *                          keeps every exported name reachable.
 *   4. inline-helper     - single-use zero-parameter helper inlined.
 *   5. --apply + rollback- green first step, red second run: files created by
 *                          apply are deleted, prior contents restored exactly,
 *                          failed step reported (injected exec double).
 *   6. Safety            - plan file writing outside the target refused before
 *                          any write; missing exec seam refuses --apply;
 *                          rename respects word boundaries and flags [public].
 *
 * The command runs through its exported runner with a context built by
 * makeBridgeContext, mirroring the other command tests. No git operations,
 * no emoji. Run: npm test (this file compiles with the package).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
// Compiled package under test (mirrors self-test.ts).
const dist = new URL("../src", import.meta.url).pathname;
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const refactorModule = await import(`${dist}/commands/refactor.js`);
const { MAX_PLAN_STEPS, SPLIT_MIN_LINES, TEST_COMMAND, applyPlan, buildRefactorPlan, inventoryTarget, loadPlanFile, RefactorError, runRefactor, scanSource, } = refactorModule;
function makeCtx(exec) {
    const base = makeBridgeContext({
        profile: "web",
        paths: {
            home: "/home/u",
            dshHome: "/home/u/.dsh",
            profilePatch: profilePatchPath("web", "/home/u/.dsh"),
            profilePackageJson: profilePackageJsonPath("web", "/home/u/.dsh"),
        },
        output: { table, card, badge },
    });
    // makeBridgeContext freezes its own members; the optional exec seam is a
    // host-provided structural member (compact/resume pattern), spread on top.
    return exec === undefined ? base : { ...base, exec };
}
const cleanupPaths = [];
after(() => {
    for (const path of cleanupPaths)
        rmSync(path, { recursive: true, force: true });
});
function scratchDir(prefix = "refactor-fixture-") {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    cleanupPaths.push(dir);
    return dir;
}
/** Oversized multi-export module: drives split-file planning. */
const BIG_MODULE_LINES = [
    "// Fixture: an oversized route module.",
    ...Array.from({ length: SPLIT_MIN_LINES - 6 }, (_, i) => `// filler line ${i}`),
    "export function parseRoute(raw) { return raw.trim(); }",
    "",
    "export function formatRoute(route) { return route.toUpperCase(); }",
    "",
    "export function compareRoutes(a, b) { return a.localeCompare(b); }",
];
/** Clean small file: must produce zero steps. */
const CLEAN_FILE = [
    "export function tiny() {",
    "  return 1;",
    "}",
].join("\n");
/** Single-use zero-parameter helper: drives inline-helper planning. */
const HELPER_FILE = [
    'import { readFileSync } from "node:fs";',
    "const greeting = () => \"hello\";",
    "export function greet() {",
    "  return greeting();",
    "}",
].join("\n");
function writeFixture(dir, name, content) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(path, content, "utf8");
    return path;
}
// ---------------------------------------------------------------------------
// 1. Source scanning
// ---------------------------------------------------------------------------
describe("refactor scanSource", () => {
    it("extracts import specifiers and exported names", () => {
        const scanned = scanSource(HELPER_FILE);
        assert.deepEqual(scanned.imports, ["node:fs"]);
        assert.deepEqual(scanned.exports.sort(), ["greet"]);
    });
    it("counts lines and recognizes require() and export-list forms", () => {
        const content = [
            'const fs = require("node:fs");',
            'import { join } from "node:path";',
            "export { alpha as beta };",
            "export * from './star.js';",
            "export type T = string;",
        ].join("\n");
        const scanned = scanSource(content);
        assert.equal(scanned.lineCount, 5);
        assert.deepEqual(scanned.imports.sort(), ["node:fs", "node:path"]);
        assert.deepEqual(scanned.exports.sort(), ["*", "beta", "T"].sort());
    });
});
// ---------------------------------------------------------------------------
// 2. Plan-only default writes nothing
// ---------------------------------------------------------------------------
describe("refactor plan-only default", () => {
    it("renders inventory and steps without touching any file", async () => {
        const dir = scratchDir();
        writeFixture(dir, "big.ts", BIG_MODULE_LINES.join("\n"));
        writeFixture(dir, "tiny.ts", CLEAN_FILE);
        const result = await runRefactor(makeCtx(), { _: dir });
        // Nothing written or removed: both fixtures byte-identical afterwards.
        assert.equal(readFileSync(join(dir, "big.ts"), "utf8"), BIG_MODULE_LINES.join("\n"));
        assert.equal(readFileSync(join(dir, "tiny.ts"), "utf8"), CLEAN_FILE);
        assert.ok(existsSync(join(dir, "tiny.ts")), "plan-only run must not delete files");
        const markdown = result.markdown;
        assert.match(markdown, /PLAN ONLY, nothing written/);
        assert.match(markdown, /\| big\.ts \|/);
        assert.match(markdown, /parseRoute/);
        assert.match(markdown, /split-file/);
        assert.match(markdown, /re-export kept/);
        assert.match(markdown, /npm test/);
        assert.match(markdown, /```json/);
        assert.equal(result.data.mode, "plan");
    });
    it("reports zero steps for a clean small file instead of inventing work", async () => {
        const dir = scratchDir();
        writeFixture(dir, "tiny.ts", CLEAN_FILE);
        const result = await runRefactor(makeCtx(), { _: dir });
        const markdown = result.markdown;
        assert.match(markdown, /No mechanical steps proposed/);
        assert.equal((result.data.steps ?? []).length, 0);
        // And still wrote nothing.
        assert.equal(readFileSync(join(dir, "tiny.ts"), "utf8"), CLEAN_FILE);
    });
    it("errors honestly on a missing target and on empty directories", async () => {
        const dir = scratchDir();
        const missing = join(dir, "nope.ts");
        const missingRun = await runRefactor(makeCtx(), { _: missing });
        assert.match(missingRun.markdown, /No such file or directory/);
        const emptyDir = scratchDir();
        const emptyRun = await runRefactor(makeCtx(), { _: emptyDir });
        assert.match(emptyRun.markdown, /No source files under/);
    });
});
// ---------------------------------------------------------------------------
// 3. split-file planning and green-path apply
// ---------------------------------------------------------------------------
describe("refactor split-file with green apply", () => {
    it("plans re-exporting splits and applies them step by step", async () => {
        const dir = scratchDir();
        writeFixture(dir, "big.ts", BIG_MODULE_LINES.join("\n"));
        const calls = [];
        const ctx = makeCtx(async (request) => {
            calls.push(request.command);
            return { code: 0, stdout: "tests green\n", stderr: "" };
        });
        const result = await runRefactor(ctx, { _: dir, apply: "" });
        assert.equal(result.data.mode, "apply");
        assert.match(result.markdown, /APPLIED \d+ step\(s\); tests stayed green after each one\./);
        // Exactly one suite run per applied step, always the same command.
        const appliedSteps = result.data.applied.length;
        assert.equal(calls.length, appliedSteps);
        for (const call of calls)
            assert.equal(call, TEST_COMMAND);
        // The moved declarations are gone from the origin but still reachable
        // through the re-export line: public surface preserved without edits.
        const origin = readFileSync(join(dir, "big.ts"), "utf8");
        assert.doesNotMatch(origin, /export function parseRoute/);
        assert.match(origin, /export \{ parseRoute \} from "\.\/parse-route\.js";/);
        assert.match(origin, /export \{ formatRoute \} from "\.\/format-route\.js";/);
        const moved = readFileSync(join(dir, "parse-route.ts"), "utf8");
        assert.match(moved, /export function parseRoute/);
    });
    it("preserves the public surface through re-exports when applied", async () => {
        const dir = scratchDir();
        writeFixture(dir, "big.ts", BIG_MODULE_LINES.join("\n"));
        const inventory = inventoryTarget(dir);
        const built = buildRefactorPlan(inventory.contents);
        const plan = { target: dir, steps: built.steps };
        const report = await applyPlan(plan, async () => ({ code: 0, stdout: "", stderr: "" }), dir);
        assert.equal(report.rolledBack, false);
        const origin = readFileSync(join(dir, "big.ts"), "utf8");
        // Policy: every export except the last is moved out behind a re-export;
        // the final declaration is retained verbatim in the origin.
        assert.match(origin, /export \{ parseRoute \} from "\.\/parse-route\.js";/);
        assert.match(origin, /export function compareRoutes/);
        const movedFile = readFileSync(join(dir, "parse-route.ts"), "utf8");
        assert.match(movedFile, /export function parseRoute/);
    });
});
// ---------------------------------------------------------------------------
// 4. inline-helper
// ---------------------------------------------------------------------------
describe("refactor inline-helper", () => {
    it("inlines a single-use zero-parameter helper on apply", async () => {
        const dir = scratchDir();
        writeFixture(dir, "helper.ts", HELPER_FILE);
        const ctx = makeCtx(async () => ({ code: 0, stdout: "", stderr: "" }));
        const result = await runRefactor(ctx, { _: dir, apply: "" });
        assert.match(result.markdown, /inline-helper/);
        const final = readFileSync(join(dir, "helper.ts"), "utf8");
        assert.doesNotMatch(final, /const greeting/);
        assert.match(final, /\("hello"\)/);
    });
});
// ---------------------------------------------------------------------------
// 5. Rollback on red (injected exec double)
// ---------------------------------------------------------------------------
describe("refactor rollback on red", () => {
    it("restores the snapshot and reports the failing step", async () => {
        const dir = scratchDir();
        writeFixture(dir, "big.ts", BIG_MODULE_LINES.join("\n"));
        let runCount = 0;
        const commands = [];
        const ctx = makeCtx(async (request) => {
            runCount += 1;
            commands.push(request.command);
            if (runCount === 1)
                return { code: 0, stdout: "ok\n", stderr: "" };
            return { code: 1, stdout: "", stderr: "FAIL src/big.test.ts\n  1 test failed\n" };
        });
        const before = readFileSync(join(dir, "big.ts"), "utf8");
        const result = await runRefactor(ctx, { _: dir, apply: "" });
        // First step green, second red, then full rollback.
        assert.deepEqual(commands, [TEST_COMMAND, TEST_COMMAND]);
        assert.deepEqual(runCount, 2);
        const data = result.data;
        assert.equal(data.rolledBack, true);
        assert.equal(data.failedStepId, "S2");
        assert.equal(data.testExitCode, 1);
        assert.match(data.stderrTail ?? "", /1 test failed/);
        assert.match(result.markdown, /ROLLED BACK at S2/);
        // Files created during apply are gone; pre-existing file is byte-exact.
        assert.equal(existsSync(join(dir, "parse-route.ts")), false);
        assert.equal(readFileSync(join(dir, "big.ts"), "utf8"), before);
    });
});
// ---------------------------------------------------------------------------
// 6. Safety rails
// ---------------------------------------------------------------------------
describe("refactor safety", () => {
    it("refuses --apply without a test seam and writes nothing", async () => {
        const dir = scratchDir();
        writeFixture(dir, "big.ts", BIG_MODULE_LINES.join("\n"));
        const result = await runRefactor(makeCtx(), { _: dir, apply: "" });
        assert.match(result.markdown, /No test-runner seam on this context/);
        assert.equal(readFileSync(join(dir, "big.ts"), "utf8"), BIG_MODULE_LINES.join("\n"));
        assert.equal(existsSync(join(dir, "parse-route.ts")), false);
    });
    it("refuses a plan file whose steps escape the target before any write", async () => {
        const outsideDir = scratchDir();
        const outsideFile = writeFixture(outsideDir, "outside.ts", CLEAN_FILE);
        const targetDir = scratchDir();
        writeFixture(targetDir, "victim.ts", CLEAN_FILE);
        const planPath = writeFixture(scratchDir(), "escape-plan.json", JSON.stringify({
            target: targetDir,
            steps: [
                {
                    id: "S1",
                    kind: "rename",
                    title: "Escape attempt",
                    detail: "writes outside",
                    files: [outsideFile],
                    touchesPublicSurface: false,
                    edits: [{ path: outsideFile, content: "pwned" }],
                },
            ],
        }));
        const beforeOutside = readFileSync(outsideFile, "utf8");
        const result = await runRefactor(makeCtx(), { _: targetDir, rest: planPath, apply: "" });
        assert.match(result.markdown, /writes outside the target path/);
        assert.equal(readFileSync(outsideFile, "utf8"), beforeOutside);
    });
    it("rejects malformed plan files without writing", async () => {
        const targetDir = scratchDir();
        writeFixture(targetDir, "victim.ts", CLEAN_FILE);
        const badPlan = writeFixture(scratchDir(), "bad.json", "{ not json");
        const result = await runRefactor(makeCtx(), { _: targetDir, rest: badPlan, apply: "" });
        assert.match(result.markdown, /not readable JSON/);
        assert.equal(readFileSync(join(targetDir, "victim.ts"), "utf8"), CLEAN_FILE);
    });
    it("flags exported renames as [public] and respects word boundaries", async () => {
        const dir = scratchDir();
        const content = [
            "export const userName = \"u\";",
            "function describeUserName(user) { return user + userName; }",
            "export function renderUserName() { return describeUserName(userName); }",
        ].join("\n");
        writeFixture(dir, "user.ts", content);
        const result = await runRefactor(makeCtx(), { _: dir, rename: "userName:accountName" });
        assert.equal(result.data.mode, "plan");
        const steps = result.data.steps;
        assert.equal(steps.length, 1);
        assert.equal(steps[0].kind, "rename");
        assert.equal(steps[0].touchesPublicSurface, true);
        assert.match(result.markdown, /\[public\]/);
        // Applying it renames the identifier but never inside describeUserName.
        const ctx = makeCtx(async () => ({ code: 0, stdout: "", stderr: "" }));
        const applied = await runRefactor(ctx, { _: dir, rename: "userName:accountName", apply: "" });
        assert.match(applied.markdown, /APPLIED 1 step\(s\)/);
        const renamed = readFileSync(join(dir, "user.ts"), "utf8");
        assert.match(renamed, /export const accountName/);
        assert.match(renamed, /function describeUserName\(user\) \{ return user \+ accountName; \}/);
        assert.doesNotMatch(renamed, /describeAccountName/);
    });
    it("caps plan size at the documented maximum and says so", async () => {
        const dir = scratchDir();
        const filler = Array.from({ length: SPLIT_MIN_LINES - 6 }, (_, i) => `// filler ${i}`);
        const names = Array.from({ length: MAX_PLAN_STEPS + 3 }, (_, i) => `thing${i}`);
        const exports = names.map((name) => `export function ${name}(x) { return x; }`).join("\n");
        writeFixture(dir, "wide.ts", ["// wide fixture", ...filler, exports].join("\n"));
        const result = await runRefactor(makeCtx(), { _: dir });
        const steps = result.data.steps;
        assert.equal(steps.length, MAX_PLAN_STEPS);
        assert.match(result.markdown, /Plan truncated at 8 steps/);
    });
    it("exposes RefactorError for direct callers of loadPlanFile", () => {
        const targetDir = scratchDir();
        writeFixture(targetDir, "victim.ts", CLEAN_FILE);
        const badPlan = writeFixture(scratchDir(), "bad-steps.json", JSON.stringify({ steps: "nope" }));
        assert.throws(() => loadPlanFile(badPlan, targetDir), RefactorError);
    });
});
//# sourceMappingURL=refactor-test.js.map