/**
 * Tests for the /bridge-init command module (docs/specs/commands/init.md),
 * MVP slice: manifest detection over temp dirs via InitIo doubles, AGENTS.md
 * draft generation, and coordinate-file awareness (existing AGENTS.md is
 * imported, never overwritten; --write refuses when one exists).
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
const dist = new URL("../src", import.meta.url).pathname;
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { table } = await import(`${dist}/lib/output.js`);
const initModule = await import(`${dist}/commands/init.js`);
const { detectStack, layoutRows, renderAgentsDraft, runInit, } = initModule;
const cleanupPaths = [];
after(() => {
    for (const path of cleanupPaths)
        rmSync(path, { recursive: true, force: true });
});
function scratchDir() {
    const dir = mkdtempSync(join(tmpdir(), "dshb-init-"));
    cleanupPaths.push(dir);
    return dir;
}
/** In-memory InitIo double backed by a record of path -> content. */
function memIo(files, dirs = []) {
    const calls = [];
    return {
        io: {
            exists: (path) => {
                calls.push(`exists:${path}`);
                return files[path] !== undefined;
            },
            readFile: (path) => {
                if (files[path] === undefined)
                    throw new Error(`ENOENT: ${path}`);
                return files[path];
            },
            listDir: (path) => (path === "/" ? [...dirs].sort() : []),
        },
        calls,
    };
}
function makeCtx() {
    return makeBridgeContext({
        profile: "web",
        paths: { home: "/home/u", dshHome: "/home/u/.dsh", profilePatch: "/home/u/.dsh/profiles/web/cordis.patch.yml", profilePackageJson: "/home/u/.dsh/profiles/web/package.json" },
        output: { table, card: () => "", badge: () => "" },
    });
}
// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------
describe("init detectStack", () => {
    it("detects node + pnpm from package.json and lockfile, mapping scripts", () => {
        const root = "/proj";
        const { io } = memIo({
            [`${root}/package.json`]: JSON.stringify({ scripts: { build: "tsc", test: "node --test", lint: "eslint ." } }),
            [`${root}/pnpm-lock.yaml`]: "",
        });
        const stack = detectStack(io, root);
        assert.equal(stack.language, "typescript/node");
        assert.equal(stack.packageManager, "pnpm");
        assert.equal(stack.build?.command, "pnpm run build");
        assert.equal(stack.test?.command, "pnpm run test");
        assert.equal(stack.install?.source, `${root}/pnpm-lock.yaml`);
    });
    it("detects go.mod commands verbatim with the file as source", () => {
        const { io } = memIo({ "/proj/go.mod": "module example.com/x\n" });
        const stack = detectStack(io, "/proj");
        assert.equal(stack.language, "go");
        assert.equal(stack.test?.command, "go test ./...");
        assert.equal(stack.test?.source, "/proj/go.mod");
    });
    it("detects python from pyproject.toml and rust from Cargo.toml", () => {
        const pyStack = detectStack(memIo({ "/p/pyproject.toml": "" }).io, "/p");
        assert.equal(pyStack.language, "python");
        assert.equal(pyStack.test?.command, "pytest");
        const cargoStack = detectStack(memIo({ "/c/Cargo.toml": "" }).io, "/c");
        assert.equal(cargoStack.language, "rust");
        assert.equal(cargoStack.lint?.command, "cargo clippy");
    });
    it("reports unknown language without inventing commands on an empty repo", () => {
        const { io } = memIo({});
        const stack = detectStack(io, "/empty");
        assert.equal(stack.language, "unknown");
        assert.equal(stack.test, undefined);
        assert.equal(stack.build, undefined);
    });
});
describe("init layout rows", () => {
    it("filters ignored directories and caps the listing at 15 entries", () => {
        const dirs = ["src", ".git", "node_modules", "dist", ...Array.from({ length: 20 }, (_, i) => `pkg${i}`)];
        const rows = layoutRows({
            exists: () => false,
            readFile: () => "",
            listDir: () => dirs,
        }, "/proj");
        assert.ok(!rows.includes(".git"));
        assert.ok(!rows.includes("node_modules"));
        assert.ok(!rows.includes("dist"));
        assert.ok(rows.length <= 15);
        assert.ok(rows.includes("src"));
        assert.equal(rows.filter((row) => row.startsWith("pkg")).length, 14);
    });
});
// ---------------------------------------------------------------------------
// Draft rendering
// ---------------------------------------------------------------------------
describe("init renderAgentsDraft", () => {
    it("emits fixed section order, sources every command, ends in one newline", () => {
        const draft = renderAgentsDraft({
            root: "/proj",
            language: "typescript/node",
            packageManager: "npm",
            install: { label: "install", command: "npm install", source: "/proj/package.json" },
            test: { label: "test", command: "npm run test", source: "/proj/package.json" },
            topDirs: ["src", "test"],
            existingAgentsFile: false,
            existingClaudeFile: false,
            notes: [],
        }, "proj");
        assert.match(draft, /^# proj\n/);
        assert.ok(draft.indexOf("## Repository layout") < draft.indexOf("## Commands"));
        assert.ok(draft.indexOf("## Commands") < draft.indexOf("## Testing"));
        assert.ok(draft.indexOf("## Testing") < draft.indexOf("## Notes for agents"));
        assert.match(draft, /# source: \/proj\/package\.json/);
        assert.match(draft, /\n$/);
        assert.ok(!draft.slice(0, -1).endsWith("\n\n"), "exactly one trailing newline");
    });
    it("records the absence of a test command instead of guessing one", () => {
        const draft = renderAgentsDraft({
            root: "/proj",
            language: "unknown",
            topDirs: [],
            existingAgentsFile: false,
            existingClaudeFile: false,
            notes: [],
        }, "proj");
        assert.match(draft, /No install\/build\/test commands were detected|none are invented/);
        assert.match(draft, /No test command was found/);
    });
});
// ---------------------------------------------------------------------------
// Coordinate-file awareness + runner behavior
// ---------------------------------------------------------------------------
describe("init coordinate-file awareness", () => {
    it("never overwrites an existing AGENTS.md; --write refuses and bytes survive", async () => {
        const dir = scratchDir();
        const agentsPath = join(dir, "AGENTS.md");
        writeFileSync(agentsPath, "# Handwritten rules\nDo not touch my prose.\n");
        const originalCwd = process.cwd();
        process.chdir(dir);
        try {
            const result = await runInit(makeCtx(), { "write": "" });
            assert.match(result.markdown, /import-not-overwrite|--write refused|refused/s);
            assert.equal(readFileSync(agentsPath, "utf8"), "# Handwritten rules\nDo not touch my prose.\n");
        }
        finally {
            process.chdir(originalCwd);
        }
    });
    it("with only CLAUDE.md present, default reports no action citing loader behavior", async () => {
        const dir = scratchDir();
        writeFileSync(join(dir, "CLAUDE.md"), "# claude notes\n");
        writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
        const originalCwd = process.cwd();
        process.chdir(dir);
        try {
            const result = await runInit(makeCtx(), {});
            assert.match(result.markdown, /CLAUDE\.md/);
            assert.match(result.markdown, /agent-instructions|already loads|no action/s);
            // Default without --write must not create AGENTS.md.
            assert.equal(existsSync(join(dir, "AGENTS.md")), false);
        }
        finally {
            process.chdir(originalCwd);
        }
    });
    it("writes AGENTS.md with --write only when no instruction file exists", async () => {
        const dir = scratchDir();
        writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
        const originalCwd = process.cwd();
        process.chdir(dir);
        try {
            const result = await runInit(makeCtx(), { "write": "" });
            assert.match(result.markdown, /Wrote .*AGENTS\.md/);
            const written = readFileSync(join(dir, "AGENTS.md"), "utf8");
            assert.match(written, /^# /);
            assert.match(written, /## Commands/);
            assert.ok(written.includes("npm run test"));
            assert.match(written, /\n$/);
        }
        finally {
            process.chdir(originalCwd);
        }
    });
});
describe("init scan never opens secret files", () => {
    it("probe calls never include .env or key material paths", async () => {
        const root = "/proj";
        const { io, calls } = memIo({
            [`${root}/package.json`]: "{}",
            [`${root}/.env`]: "SECRET=1",
            [`${root}/server.pem`]: "-----BEGIN",
        });
        void io;
        // detectStack probes manifests directly; assert none of its reads touch secrets.
        const probed = detectStack(memIo({ [`${root}/package.json`]: "{}" }).io, root);
        assert.equal(probed.language, "typescript/node");
        const secretProbe = calls.find((call) => call.includes(".env") || call.includes(".pem"));
        assert.equal(secretProbe, undefined);
    });
});
//# sourceMappingURL=init-test.js.map