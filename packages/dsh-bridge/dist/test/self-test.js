/**
 * Self-test (node:test, no external runner) for the dsh-bridge plugin package.
 *
 * Scope: basic contracts per module, per the phase-1 task.
 *   1. types.ts       - severity/status vocabularies match the specs they mirror.
 *   2. output.ts      - markdown helpers: tables, cards, badges; ASCII only; no emoji.
 *   3. paths.ts       - detection-matrix paths, env expansion, metadata-only probes
 *                       (symlink refusal, size cap, mask shape), never contents.
 *   4. scan-client.ts - report parsing + a real spawn of tools/scan dist over a fixture.
 *   5. index.ts       - entry contract: name/inject/Config exports, command table,
 *                       registration into a recording fake ctx (no global state).
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
// Compiled package under test (dist/src), mirroring tools/scan's self-test approach.
const dist = new URL("../src", import.meta.url).pathname;
const { SEVERITIES, DETECTION_STATUSES } = await import(`${dist}/lib/types.js`);
const { badge, bulletList, card, heading, table } = await import(`${dist}/lib/output.js`);
const { MAX_CREDENTIAL_FILE_BYTES, claudeCredentialsPath, codexAuthPath, dshEnvPath, dshHomeDir, geminiOauthCredsPath, maskSecret, opencodeAuthPath, probeEnvVar, probeJsonSource, profilePackageJsonPath, profilePatchPath, projectEnvPath, } = await import(`${dist}/lib/paths.js`);
const { parseScanReport, resolveScannerEntry, scanDirectory, ScanClientError } = await import(`${dist}/lib/scan-client.js`);
const { apply, Config, inject, name } = await import(`${dist}/index.js`);
const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { BrowseError, extractGrade, filterEntries, loadCardGrades, loadManifest, loadManifestCached, pageCount, pageSlice, repoBase, resolveCatalogPaths, runBrowse, sortEntries, } = await import(`${dist}/commands/browse.js`);
/** Repo root, derived from this compiled file (dist/test -> package -> packages). */
const scannerEntry = resolveScannerEntry();
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
function makeTestContext(profile = "web") {
    return makeBridgeContext({
        profile,
        paths: {
            home: "/home/u",
            dshHome: "/home/u/.dsh",
            profilePatch: profilePatchPath(profile, "/home/u/.dsh"),
            profilePackageJson: profilePackageJsonPath(profile, "/home/u/.dsh"),
        },
        output: {
            table,
            card,
            badge,
        },
    });
}
// ---------------------------------------------------------------------------
// 1. Shared vocabularies
// ---------------------------------------------------------------------------
describe("types", () => {
    it("mirrors the scanner severity scale in order", () => {
        assert.deepEqual([...SEVERITIES], ["info", "low", "medium", "high", "critical"]);
    });
    it("uses exactly the connect spec status vocabulary", () => {
        // connect.md section 4: found | expired | malformed | unreadable | not found | configured
        assert.deepEqual([...DETECTION_STATUSES], ["found", "expired", "malformed", "unreadable", "not found", "configured"]);
    });
    it("builds a frozen context with no shared mutable state", () => {
        const ctxA = makeTestContext("a");
        const ctxB = makeTestContext("b");
        assert.equal(ctxA.profile, "a");
        assert.equal(ctxB.profile, "b");
        assert.ok(Object.isFrozen(ctxA));
        assert.ok(Object.isFrozen(ctxA.paths));
    });
});
// ---------------------------------------------------------------------------
// 2. Output helpers
// ---------------------------------------------------------------------------
describe("output", () => {
    it("renders a markdown table with header rule and rows", () => {
        const md = table(["PROVIDER", "STATUS"], [["anthropic", "found"]]);
        const lines = md.trimEnd().split("\n");
        assert.equal(lines[0], "| PROVIDER | STATUS |");
        assert.equal(lines[1], "| --- | --- |");
        assert.equal(lines[2], "| anthropic | found |");
    });
    it("escapes pipes so cell content cannot break tables", () => {
        assert.match(table(["A"], [["x|y"]]), /x\\\|y/);
    });
    it("returns an empty string for empty rows", () => {
        assert.equal(table(["A"], []), "");
    });
    it("renders a key-value card inside a fenced block with aligned values", () => {
        const md = card("Connected - anthropic", [
            ["route", "bridge-anthropic"],
            ["model", "claude-sonnet-4-6"],
        ]);
        assert.match(md, /^```/);
        const lines = md.split("\n");
        const routeLine = lines.find((line) => line.includes("route:"));
        const modelLine = lines.find((line) => line.includes("model:"));
        assert.ok(routeLine && modelLine);
        assert.equal(routeLine.indexOf("bridge-anthropic"), modelLine.indexOf("claude-sonnet-4-6"));
    });
    it("renders text severity badges without emoji or color dependence", () => {
        assert.equal(badge("info"), "[ info ]");
        assert.equal(badge("low"), "[ LOW ]");
        assert.equal(badge("medium"), "[ MEDIUM ]");
        assert.equal(badge("high"), "[ HIGH ]");
        assert.equal(badge("critical"), "[CRITICAL]");
    });
    it("keeps every helper output emoji-free and ASCII-only", () => {
        const samples = [
            table(["A", "B"], [["1", "2"]]),
            card("t", [["k", "v"]]),
            badge("critical"),
            heading("h"),
            bulletList(["a", "b"]),
        ].join("");
        for (const char of samples) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into output: ${char}`);
        }
    });
    it("drops empty bullet lists instead of rendering bare headers", () => {
        assert.equal(bulletList([]), "");
        assert.match(bulletList(["one"]), /^- one\n$/);
    });
});
// ---------------------------------------------------------------------------
// 3. Paths and metadata-only probes
// ---------------------------------------------------------------------------
describe("paths", () => {
    it("builds the documented detection matrix paths", () => {
        const home = "/home/u";
        const dsh = join(home, ".dsh");
        assert.equal(claudeCredentialsPath(home), join(home, ".claude", ".credentials.json"));
        assert.equal(codexAuthPath(home), join(home, ".codex", "auth.json"));
        assert.equal(geminiOauthCredsPath(home), join(home, ".gemini", "oauth_creds.json"));
        assert.equal(opencodeAuthPath(home), join(home, ".local", "share", "opencode", "auth.json"));
        assert.equal(dshHomeDir(home), dsh);
        assert.equal(profilePatchPath("web", dsh), join(dsh, "profiles", "web", "cordis.patch.yml"));
        assert.equal(profilePackageJsonPath("web", dsh), join(dsh, "profiles", "web", "package.json"));
        assert.equal(dshEnvPath(dsh), join(dsh, ".env"));
        assert.equal(projectEnvPath("/repo"), join("/repo", ".env"));
    });
    it("honors DSH_HOME when set (env expansion)", () => {
        process.env["DSH_HOME"] = "/custom/dsh";
        try {
            assert.equal(dshHomeDir("/home/u"), "/custom/dsh");
        }
        finally {
            delete process.env["DSH_HOME"];
        }
    });
    it("ignores blank DSH_HOME and falls back to $HOME/.dsh", () => {
        process.env["DSH_HOME"] = "   ";
        try {
            assert.equal(dshHomeDir("/home/u"), "/home/u/.dsh");
        }
        finally {
            delete process.env["DSH_HOME"];
        }
    });
    it("honors XDG_DATA_HOME for the opencode auth map", () => {
        process.env["XDG_DATA_HOME"] = "/xdg";
        try {
            assert.equal(opencodeAuthPath("/home/u"), join("/xdg", "opencode", "auth.json"));
        }
        finally {
            delete process.env["XDG_DATA_HOME"];
        }
        process.env["XDG_DATA_HOME"] = " ";
        try {
            assert.equal(opencodeAuthPath("/home/u"), join("/home/u", ".local", "share", "opencode", "auth.json"));
        }
        finally {
            delete process.env["XDG_DATA_HOME"];
        }
    });
    it("caps credential probes at the connect spec limit of 64 KiB", () => {
        assert.equal(MAX_CREDENTIAL_FILE_BYTES, 65536);
    });
    it("probes existing JSON sources as metadata only", () => {
        const dir = scratchDir("dshb-valid-");
        const credPath = join(dir, "credentials.json");
        // Fixture value stays here in the test only; production code returns metadata, not content.
        writeFileSync(credPath, JSON.stringify({ claudeAiOauth: { accessToken: "at" } }), "utf8");
        const probe = probeJsonSource(credPath, ["claudeAiOauth"]);
        assert.equal(probe.exists, true);
        assert.equal(probe.shape, "valid-shape");
        assert.equal(typeof probe.sizeBytes, "number");
        assert.equal(typeof probe.mode, "number");
        assert.deepEqual(Object.keys(probe).sort(), ["exists", "mode", "path", "shape", "sizeBytes"]);
        assert.equal(probeJsonSource(credPath, ["tokens"]).shape, "wrong-shape");
        const missing = probeJsonSource(join(dir, "absent.json"), ["anything"]);
        assert.equal(missing.exists, false);
        assert.equal(missing.shape, "unavailable");
    });
    it("refuses symlinks instead of following them (connect spec S12)", () => {
        const dir = scratchDir("dshb-link-");
        const target = join(dir, "real.json");
        const link = join(dir, "bait.json");
        writeFileSync(target, "{}", "utf8");
        symlinkSync(target, link);
        const probe = probeJsonSource(link, []);
        assert.equal(probe.exists, false);
        assert.equal(probe.shape, "unavailable");
    });
    it("reports oversized files without parsing them (connect spec S13)", () => {
        const dir = scratchDir("dshb-big-");
        const big = join(dir, "big.json");
        writeFileSync(big, JSON.stringify({ pad: "x".repeat(MAX_CREDENTIAL_FILE_BYTES) }), "utf8");
        const probe = probeJsonSource(big, ["pad"]);
        assert.equal(probe.exists, true);
        assert.equal(probe.shape, "over-size-limit");
    });
    it("flags unparseable JSON without exposing contents", () => {
        const dir = scratchDir("dshb-bad-");
        const bad = join(dir, "broken.json");
        writeFileSync(bad, "{ definitely not json", "utf8");
        const probe = probeJsonSource(bad, []);
        assert.equal(probe.exists, true);
        assert.equal(probe.shape, "unparseable");
    });
    it("records file mode so callers can advise on group-readable files (E6)", () => {
        if (process.platform === "win32")
            return; // chmod is POSIX-only
        const dir = scratchDir("dshb-mode-");
        const shared = join(dir, "shared.json");
        writeFileSync(shared, "{}", "utf8");
        chmodSync(shared, 0o644);
        assert.equal(probeJsonSource(shared, []).mode, 0o644);
    });
    it("masks environment variables per connect spec S1", () => {
        const secret = "sk-proj-abcdefgh7Qa";
        // S1 mask: prefix(4) + ellipsis + last4.
        assert.equal(maskSecret(secret), "sk-p\u2026h7Qa");
        assert.equal(maskSecret("short9chr"), "\u2026"); // < 12 chars reveals nothing
        const absent = probeEnvVar("DEFINITELY_NOT_SET_12345", {});
        assert.deepEqual(absent, { name: "DEFINITELY_NOT_SET_12345", present: false, masked: "-" });
        const present = probeEnvVar("K", { K: secret });
        assert.equal(present.present, true);
        assert.equal(present.masked, "sk-p\u2026h7Qa");
        assert.ok(!present.masked.includes("abcdefgh"));
        const empty = probeEnvVar("K", { K: "" });
        assert.equal(empty.present, false);
    });
});
// ---------------------------------------------------------------------------
// 4. Scan client
// ---------------------------------------------------------------------------
describe("scan-client", () => {
    function fixtureReport() {
        return {
            schema: "dsh-bridge.scan/v1",
            scannerVersion: "0.1.0-test",
            rulesDigest: "deadbeef",
            ruleIds: ["EXEC-001", "NET-001"],
            target: "fixture",
            stats: { filesScanned: 3, filesSkipped: 1, bytesScanned: 300 },
            grading: {
                grade: "B",
                score: 88,
                counts: { info: 0, low: 2, medium: 0, high: 0, critical: 0 },
                caps: [],
                gates: [],
                familiesPresent: ["NET"],
            },
            findings: [
                {
                    id: "NET-001",
                    ruleId: "net-egress",
                    family: "NET",
                    severity: "low",
                    message: "outbound request to undeclared host",
                    path: "src/net.js",
                    line: 12,
                    col: 5,
                    excerpt: "await fetch(url)",
                    excerptSha256: "cafe",
                    confidence: 0.7,
                },
            ],
        };
    }
    it("parses a well-formed v1 report into typed findings", () => {
        const report = parseScanReport(fixtureReport());
        assert.equal(report.schema, "dsh-bridge.scan/v1");
        assert.equal(report.grading.counts.low, 2);
        assert.equal(report.findings.length, 1);
        assert.equal(report.findings[0]?.severity, "low");
        assert.equal(report.findings[0]?.line, 12);
    });
    it("rejects unknown schema versions instead of guessing", () => {
        const mutated = fixtureReport();
        mutated["schema"] = "dsh-bridge.scan/v999";
        assert.throws(() => parseScanReport(mutated), ScanClientError);
        assert.throws(() => parseScanReport(null), ScanClientError);
        assert.throws(() => parseScanReport({ schema: 42 }), ScanClientError);
    });
    it("rejects findings whose severity is outside the scanner scale", () => {
        const mutated = fixtureReport();
        const findings = [...mutated["findings"]];
        findings[0] = { ...findings[0], severity: "catastrophic" };
        mutated["findings"] = findings;
        assert.throws(() => parseScanReport(mutated), /unknown finding severity/);
    });
    it("spawns the real tools/scan dist over a fixture directory", { timeout: 60_000 }, async (t) => {
        // Scanner must be built first; the test skips cleanly when it is absent.
        let scannerBuilt = true;
        try {
            await import("node:fs").then((fs) => fs.statSync(scannerEntry));
        }
        catch {
            scannerBuilt = false;
        }
        if (!scannerBuilt) {
            t.skip(`tools/scan dist not built at ${scannerEntry}`);
            return;
        }
        const dir = scratchDir("dshb-scanfix-");
        writeFileSync(join(dir, "clean.js"), "export const greeting = 'hello';\n", "utf8");
        const outcome = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.report.schema, "dsh-bridge.scan/v1");
        assert.equal(outcome.report.target, dir.split("/").filter(Boolean).pop());
        assert.ok(outcome.report.stats.filesScanned >= 1);
        // A dirty fixture must produce a typed finding, proving the JSON boundary end to end.
        writeFileSync(join(dir, "dirty.js"), "eval(userInput);\nfetch('https://collect.example/x');\n", "utf8");
        const dirty = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
        assert.ok(dirty.report.findings.length >= 1);
        for (const finding of dirty.report.findings) {
            assert.equal(typeof finding.severity, "string");
            assert.equal(typeof finding.path, "string");
        }
    });
    it("resolves the default scanner entry relative to the repo layout", () => {
        assert.match(resolveScannerEntry(), /tools[/\\]scan[/\\]dist[/\\]index\.js$/);
        assert.equal(resolveScannerEntry({ entryPath: "/x/y.js" }), "/x/y.js");
    });
});
// ---------------------------------------------------------------------------
// 5. Plugin entry contract
// ---------------------------------------------------------------------------
describe("plugin entry (index)", () => {
    it("exports the Cordis plugin shape: name, inject, Config, apply", () => {
        assert.equal(name, "dsh-bridge");
        assert.deepEqual([...inject], ["commands"]);
        assert.equal(typeof apply, "function");
    });
    it("declares Config as a Schemastery schema with a profile default", () => {
        // Schemastery compiles to callable schema objects; a plain object would fail both checks.
        assert.equal(typeof Config, "function");
        assert.equal(typeof Config.type, "string");
    });
    it("registers only parser-legal command names into a recording ctx", () => {
        const registered = [];
        const fakeCtx = {
            commands: {
                register(definition) {
                    registered.push({ name: definition.name, description: definition.description });
                },
            },
        };
        apply(fakeCtx, { profile: "web" });
        assert.ok(registered.length >= 2);
        const legalName = /^[a-z][a-z0-9_-]*$/;
        for (const command of registered) {
            assert.match(command.name, legalName);
            assert.ok(command.name.startsWith("bridge-"), `${command.name} must use the bridge- namespace`);
            assert.ok(command.description.length > 0);
        }
        const names = registered.map((command) => command.name);
        assert.ok(names.includes("bridge-help"));
        assert.ok(names.includes("bridge-connect"));
    });
    it("exposes a BridgeCommand table satisfying the shared interface", async () => {
        const ctx = makeTestContext();
        const commands = bridgeCommandTable(ctx);
        assert.ok(Object.isFrozen(commands));
        for (const command of commands) {
            assert.equal(typeof command.name, "string");
            assert.ok(Array.isArray(command.aliases));
            assert.equal(typeof command.summary, "string");
            assert.equal(typeof command.usage, "string");
            assert.equal(typeof command.run, "function");
        }
    });
    it("runs commands through the injected context and renders markdown", async () => {
        const ctx = makeTestContext("myprofile");
        // Every table row is implemented now; connect exercises the full path.
        const connect = bridgeCommandTable(ctx).find((command) => command.name === "bridge-connect");
        assert.ok(connect);
        const result = await connect.run(ctx, {});
        assert.equal(typeof result.markdown, "string");
        assert.ok(result.markdown.length > 0);
    });
    it("renders handler results through the registration adapter", async () => {
        let captured;
        const fakeCtx = {
            commands: {
                register(definition) {
                    captured = definition;
                },
            },
        };
        apply(fakeCtx, { profile: "web" });
        assert.ok(captured);
        const outcome = await captured.handler({ rawInput: "--list" });
        assert.equal(outcome.kind, "success");
        assert.equal(typeof outcome.text, "string");
        assert.ok((outcome.text ?? "").length > 0);
    });
});
// ---------------------------------------------------------------------------
// 6. /bridge-help command
// ---------------------------------------------------------------------------
describe("commands/help", async () => {
    const { renderHelp } = await import(`${dist}/commands/help.js`);
    it("lists every registered command name in the rendered output", async () => {
        const ctx = makeTestContext();
        const registered = bridgeCommandTable(ctx);
        const result = await renderHelp(ctx, {}, registered);
        for (const command of registered) {
            assert.ok(result.markdown.includes(`/${command.name}`), `missing command: /${command.name}`);
            assert.ok(result.markdown.includes(command.summary), `missing summary: ${command.summary}`);
        }
    });
    it("renders aliases and a usage line plus a docs pointer", async () => {
        const ctx = makeTestContext();
        const withAlias = [
            ...bridgeCommandTable(ctx),
            {
                name: "bridge-model",
                aliases: ["bridge-route"],
                summary: "Show or switch the active model route",
                usage: "[name]",
                run: async () => ({ markdown: "" }),
            },
        ];
        const result = await renderHelp(ctx, {}, withAlias);
        assert.match(result.markdown, /^Usage: \/bridge-help \[command\]$/m);
        assert.ok(result.markdown.includes("bridge-route"), "alias must appear");
        assert.ok(result.markdown.includes("docs/specs/commands"), "must point to docs");
    });
    it("groups sections as Setup, Catalog, Diagnostics and skips empty groups", async () => {
        const ctx = makeTestContext();
        // bridge-doctor maps to Diagnostics; no registered command maps to Catalog yet.
        const onlyDiagnostics = [
            {
                name: "bridge-doctor",
                aliases: [],
                summary: "Check node runtime, credentials, profiles",
                usage: "[--net] [--probe]",
                run: async () => ({ markdown: "" }),
            },
        ];
        const result = await renderHelp(ctx, {}, onlyDiagnostics);
        assert.match(result.markdown, /^### Diagnostics$/m);
        assert.doesNotMatch(result.markdown, /^### Catalog$/m);
        const full = await renderHelp(ctx, {}, bridgeCommandTable(ctx));
        assert.match(full.markdown, /^### Setup$/m);
        assert.match(full.markdown, /^### Diagnostics$/m);
    });
    it("renders an unknown command under Other instead of dropping it", async () => {
        const ctx = makeTestContext();
        const unmapped = [
            {
                name: "bridge-mystery",
                aliases: [],
                summary: "Not in any fixed group",
                usage: "",
                run: async () => ({ markdown: "" }),
            },
        ];
        const result = await renderHelp(ctx, {}, unmapped);
        assert.match(result.markdown, /^### Other$/m);
        assert.ok(result.markdown.includes("/bridge-mystery"));
    });
    it("handles an empty registry without throwing", async () => {
        const ctx = makeTestContext();
        const result = await renderHelp(ctx, {}, []);
        assert.equal(typeof result.markdown, "string");
        assert.ok(result.markdown.length > 0);
        assert.ok(!result.markdown.includes("| Command |"), "no table when nothing is registered");
    });
    it("stays ASCII-only and emoji-free", async () => {
        const ctx = makeTestContext();
        const result = await renderHelp(ctx, {}, bridgeCommandTable(ctx));
        for (const char of result.markdown) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into help output: ${char}`);
        }
    });
});
function writeFixture(dir, entries) {
    const manifestPath = join(dir, "manifest.json");
    const cardsDir = join(dir, "cards");
    mkdirSync(cardsDir, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(entries), "utf8");
    return { manifestPath, cardsDir };
}
function appendFixtureEntry(manifestPath, value) {
    const current = JSON.parse(readFileSync(manifestPath, "utf8"));
    current.push(value);
    writeFileSync(manifestPath, JSON.stringify(current), "utf8");
}
function cardWith(repoLink, grade = "B", extraLinks = []) {
    const links = [repoLink, ...extraLinks].map((link) => `- upstream: https://github.com/${link}`).join("\n");
    return `# Trust Report Card\n\n| | |\n|---|---|\n| **Grade** | **${grade}** (adjudicated) |\n| **Plugin** | fixture |\n\n${links}\n`;
}
/** Fifteen memory entries plus four others => pages of 3/2 for the runner tests. */
function fixtureCatalog() {
    const dir = scratchDir("dshb-browse-run-");
    const paths = writeFixture(dir, [
        { name: "owner/alpha-plugin", repo: "owner/alpha-plugin", category: "tools", stars_if_known: 300, description_en: "Alpha does alpha things." },
        { name: "owner/beta-pack", repo: "owner/beta-pack", category: "ui", stars_if_known: 1500, description_en: "Beta polishes panels." },
        { name: "owner/gamma-mem", repo: "owner/gamma-mem", category: "memory", stars_if_known: null, description_en: "Gamma recalls context." },
        { name: "owner/delta-ui", repo: "owner/delta-ui#packages/widget", category: "ui", stars_if_known: 40, description_en: "Delta widgets." },
    ]);
    for (let index = 0; index < 11; index += 1) {
        appendFixtureEntry(paths.manifestPath, {
            name: `owner/mem-${String(index).padStart(2, "0")}`,
            repo: `owner/mem-${String(index).padStart(2, "0")}`,
            category: "memory",
            stars_if_known: index,
            description_en: `Memory plugin number ${index}.`,
        });
    }
    writeFileSync(join(paths.cardsDir, "alpha.md"), cardWith("owner/alpha-plugin", "A"), "utf8");
    writeFileSync(join(paths.cardsDir, "delta.md"), cardWith("owner/delta-ui/packages/widget", "C"), "utf8");
    return paths;
}
describe("browse catalog loading", () => {
    it("parses the real manifest shape into typed entries and drops malformed rows", () => {
        const dir = scratchDir("dshb-browse-load-");
        const { manifestPath } = writeFixture(dir, [
            { name: "a/dsh-alpha", repo: "a/dsh-alpha", category: "ui", stars_if_known: 12, description_en: "Alpha tools." },
            { name: "b/dsh-beta", repo: "b/dsh-beta", category: "tools", stars_if_known: null, description_en: "Beta." },
            { broken: true },
            null,
        ]);
        const entries = loadManifest(manifestPath);
        assert.equal(entries.length, 2);
        assert.equal(entries[0]?.name, "a/dsh-alpha");
        assert.equal(entries[0]?.stars, 12);
        assert.equal(entries[1]?.stars, null);
    });
    it("errors gracefully on a missing or corrupt manifest file", () => {
        assert.throws(() => loadManifest("/definitely/absent/manifest.json"), BrowseError);
        const dir = scratchDir("dshb-browse-corrupt-");
        const badPath = join(dir, "manifest.json");
        writeFileSync(badPath, "{ not json", "utf8");
        assert.throws(() => loadManifest(badPath), BrowseError);
        const objPath = join(dir, "object.json");
        writeFileSync(objPath, JSON.stringify({ oops: true }), "utf8");
        assert.throws(() => loadManifest(objPath), BrowseError);
    });
    it("memoizes loads per path+mtime and reloads after a change", async () => {
        const dir = scratchDir("dshb-browse-cache-");
        const { manifestPath } = writeFixture(dir, [{ name: "x/one", repo: "x/one" }]);
        const first = loadManifestCached(manifestPath);
        const second = loadManifestCached(manifestPath);
        assert.equal(first, second, "same file state must reuse parsed entries");
        await new Promise((resolve) => setTimeout(resolve, 20));
        writeFixture(dir, [
            { name: "x/one", repo: "x/one" },
            { name: "x/two", repo: "x/two" },
        ]);
        const third = loadManifestCached(manifestPath);
        assert.notEqual(first, third);
        assert.equal(third.length, 2);
    });
    it("resolves docs/catalog by walking up from the compiled module", () => {
        const found = resolveCatalogPaths();
        assert.ok(found, "catalog must exist in this repo checkout");
        assert.match(found.manifestPath, /docs[/\\]catalog[/\\]manifest\.json$/);
    });
});
describe("browse grade join", () => {
    it("extracts grades from both committed card formats and rejects table headers", () => {
        assert.equal(extractGrade("| **Grade** | **C** (manual adjudication; raw scanner output: F) |"), "C");
        assert.equal(extractGrade("| Grade | **B** (scanner raw output F; adjudicated per pipeline S6 with evidence) |"), "B");
        assert.equal(extractGrade("### Overall: C"), "C");
        assert.equal(extractGrade("### Overall: **A**"), "A");
        // Revision-history headers must never yield a phantom letter.
        assert.equal(extractGrade("| Rev | Date | Subject | Grade | Change |"), null);
        assert.equal(extractGrade("no grade here"), null);
    });
    it("cuts subpath repos to their owner/repo base for the join key", () => {
        assert.equal(repoBase("tt-a1i/archify#integrations/deepseek-harness"), "tt-a1i/archify");
        assert.equal(repoBase("Some-Owner/Repo.Name.git"), "some-owner/repo.name");
        assert.equal(repoBase("solo"), "solo");
    });
    it("joins a card onto exactly one known repo base and skips ambiguous links", () => {
        const dir = scratchDir("dshb-browse-cards-");
        const known = new Set(["a/alpha", "b/beta"]);
        writeFileSync(join(dir, "alpha.md"), cardWith("a/alpha", "A"), "utf8");
        writeFileSync(join(dir, "beta.md"), cardWith("unknown/repo", "F", ["other/thing"]), "utf8");
        const grades = loadCardGrades(dir, known);
        assert.equal(grades.get("a/alpha"), "A");
        assert.equal(grades.size, 1, "unresolvable cards contribute nothing");
    });
    it("treats an absent cards directory as all-unreviewed instead of failing", () => {
        const grades = loadCardGrades(join(scratchDir("dshb-browse-nocards-"), "missing"), new Set(["a/alpha"]));
        assert.equal(grades.size, 0);
    });
});
describe("browse filtering and pagination math", () => {
    function entry(name, category, stars, description) {
        return { name, repo: name, category, stars, description };
    }
    function sample() {
        return [
            entry("zeta/tools", "tools", 500, "Zeta build tooling"),
            entry("alpha/ui", "ui", 1200, "Alpha UI pack"),
            entry("memory-helper", "memory", 42, "Remember things across sessions"),
            entry("quiet/ui", "ui", null, "Quiet UI tweaks"),
            entry("MemoryMirror", "memory", 7, "A mirror for your memory notes"),
        ];
    }
    it("sorts deterministically: stars desc, unknown last, then name asc", () => {
        const sorted = sortEntries(sample());
        assert.deepEqual(sorted.map((e) => e.name), ["alpha/ui", "zeta/tools", "memory-helper", "MemoryMirror", "quiet/ui"]);
    });
    it("filters by category exactly", () => {
        const ui = filterEntries(sample(), { category: "ui" });
        assert.deepEqual(ui.map((e) => e.name), ["alpha/ui", "quiet/ui"]);
    });
    it("matches find queries case-insensitively across name and description", () => {
        const hitName = filterEntries(sample(), { query: "MEMORYMIRROR" });
        assert.deepEqual(hitName.map((e) => e.name), ["MemoryMirror"]);
        const hitDesc = filterEntries(sample(), { query: "across sessions" });
        assert.deepEqual(hitDesc.map((e) => e.name), ["memory-helper"]);
    });
    it("returns nothing on a miss without inventing results", () => {
        assert.equal(filterEntries(sample(), { query: "nonexistent-widget" }).length, 0);
    });
    it("computes page counts for every boundary (pagination math)", () => {
        assert.equal(pageCount(0), 1);
        assert.equal(pageCount(1), 1);
        assert.equal(pageCount(10), 1);
        assert.equal(pageCount(11), 2);
        assert.equal(pageCount(25), 3);
    });
    it("slices full, partial, and empty pages correctly", () => {
        const twentyThree = Array.from({ length: 23 }, (_, index) => entry(`p-${index}`, "tools", index, `plugin ${index}`));
        assert.equal(pageSlice(twentyThree, 1).length, 10);
        assert.equal(pageSlice(twentyThree, 3).length, 3);
        assert.deepEqual(pageSlice(twentyThree, 4), []);
        assert.equal(pageSlice(twentyThree, 2)[0]?.name, "p-10");
        // find over a paginated fixture: "plugin 2" matches p-2, p-20..p-23 -> 4 hits.
        const hits = filterEntries(twentyThree, { query: "plugin 2" });
        assert.equal(hits.length, 4);
    });
});
describe("browse command runner", () => {
    it("lists page 1 with names, categories, stars, joined grades, and descriptions", async () => {
        const ctx = makeTestContext("browse");
        const result = await runBrowse(ctx, { _: "" }, fixtureCatalog());
        assert.match(result.markdown, /15 entries/);
        assert.match(result.markdown, /page 1\/2/);
        const rows = result.markdown.split("\n").filter((line) => line.includes("| owner/"));
        assert.equal(rows.length, 10);
        assert.ok(rows.some((row) => row.includes("| A |")), "graded row shows its letter");
        assert.ok(rows.some((row) => row.includes("owner/beta-pack")));
    });
    it("paginates via explicit page number, next, prev, clamped at edges", async () => {
        const ctx = makeTestContext("browse");
        const options = fixtureCatalog();
        const page2 = await runBrowse(ctx, { _: "2" }, options);
        assert.match(page2.markdown, /page 2\/2/);
        assert.equal(page2.markdown.split("\n").filter((line) => line.includes("| owner/")).length, 5);
        const nextFromTwo = await runBrowse(ctx, { _: "next" }, options);
        assert.match(nextFromTwo.markdown, /page 2\/2/, "next at the last page stays put");
        const prevFromTwo = await runBrowse(ctx, { _: "prev" }, options);
        assert.match(prevFromTwo.markdown, /page 1\/2/, "prev uses the remembered list page");
        const badPage = await runBrowse(ctx, { _: "9" }, options);
        assert.match(badPage.markdown, /page must be 1-2/);
    });
    it("finds case-insensitive substrings across name and description", async () => {
        const ctx = makeTestContext("browse");
        const options = fixtureCatalog();
        const hit = await runBrowse(ctx, { _: "find BETA POLISHES" }, options);
        assert.match(hit.markdown, /find "BETA POLISHES" - 1 match/);
        assert.match(hit.markdown, /owner\/beta-pack/);
        const miss = await runBrowse(ctx, { _: "find zzz-nothing" }, options);
        assert.match(miss.markdown, /No entries match/);
        const noQuery = await runBrowse(ctx, { _: "find" }, options);
        assert.match(noQuery.markdown, /Usage:/);
    });
    it("filters by category and rejects unknown ones", async () => {
        const ctx = makeTestContext("browse");
        const options = fixtureCatalog();
        const ui = await runBrowse(ctx, { _: "ui" }, options);
        assert.match(ui.markdown, /category=ui - 2 entries/);
        assert.match(ui.markdown, /page 1\/1/);
        const uiPage2 = await runBrowse(ctx, { _: "ui 2" }, options);
        assert.match(uiPage2.markdown, /page must be 1-1/, "out-of-range page names the valid range instead of guessing");
        const unknown = await runBrowse(ctx, { _: "not-a-cat" }, options);
        assert.match(unknown.markdown, /Unknown category/);
        assert.match(unknown.markdown, /Valid: /);
    });
    it("renders unreviewed entries with ? when no card exists", async () => {
        const ctx = makeTestContext("browse");
        // gamma-mem has null stars, so it sorts to page 2 under unknown-last order.
        const result = await runBrowse(ctx, { _: "2" }, fixtureCatalog());
        const gammaRow = result.markdown.split("\n").find((line) => line.includes("owner/gamma-mem"));
        assert.ok(gammaRow);
        assert.match(gammaRow, /\| \? \|/);
    });
    it("handles a missing manifest gracefully with honest output, not a crash", async () => {
        const ctx = makeTestContext("browse");
        const result = await runBrowse(ctx, {}, { manifestPath: "/definitely/not/here.json" });
        assert.match(result.markdown, /Catalog is unavailable/);
        assert.match(result.markdown, /not readable/);
    });
    it("keeps every rendered byte ASCII and emoji-free", async () => {
        const ctx = makeTestContext("browse");
        const result = await runBrowse(ctx, { _: "" }, fixtureCatalog());
        for (const char of result.markdown) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into browse output: ${char}`);
        }
    });
    it("exposes structured data for tests and future panels", async () => {
        const ctx = makeTestContext("browse");
        const result = await runBrowse(ctx, { _: "find mem" }, fixtureCatalog());
        const data = result.data;
        assert.equal(data.mode, "find");
        assert.equal(data.total, 12);
        assert.equal(data.pages, 2);
    });
});
// ---------------------------------------------------------------------------
// 6. /connect phase 1: detection, masking, reachability
// ---------------------------------------------------------------------------
const { detectCredentials, parseConnectArgs, runConnect, smokeProvider, renderSmoke } = await import(`${dist}/commands/connect.js`);
/** A secret-shaped fixture value; tests assert this never reaches output. */
const FIXTURE_SECRET = "sk-ant-api99-Zx4Qw8Er6Ty1UiOpAsDf";
function connectContext(home, dshHome) {
    return makeBridgeContext({
        profile: "web",
        paths: {
            home,
            dshHome,
            profilePatch: profilePatchPath("web", dshHome),
            profilePackageJson: profilePackageJsonPath("web", dshHome),
        },
        output: { table, card, badge },
    });
}
function writeHomeFile(home, relative, contents) {
    const target = join(home, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents, "utf8");
    return target;
}
const FUTURE_MS = Date.now() + 7 * 24 * 60 * 60 * 1000;
const PAST_MS = Date.now() - 24 * 60 * 60 * 1000;
describe("connect detection", () => {
    it("reports every source as not found on an empty fixture HOME", () => {
        const home = scratchDir("dshb-connect-empty-");
        const rows = detectCredentials(connectContext(home, join(home, ".dsh")), {});
        assert.ok(rows.length >= 9);
        for (const matrixRow of rows) {
            assert.equal(matrixRow.status, "not found", `${matrixRow.source} should be not found`);
        }
    });
    it("marks a valid Claude OAuth file found and an expired one expired (A3)", () => {
        const home = scratchDir("dshb-connect-claude-");
        writeHomeFile(home, ".claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: FIXTURE_SECRET, refreshToken: "rt", expiresAt: FUTURE_MS } }));
        const fresh = detectCredentials(connectContext(home, join(home, ".dsh")), {}).find((r) => r.source.includes(".credentials.json"));
        assert.equal(fresh?.status, "found");
        const staleHome = scratchDir("dshb-connect-stale-");
        writeHomeFile(staleHome, ".claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: FIXTURE_SECRET, refreshToken: "rt", expiresAt: PAST_MS } }));
        const stale = detectCredentials(connectContext(staleHome, join(staleHome, ".dsh")), {}).find((r) => r.source.includes(".credentials.json"));
        assert.equal(stale?.status, "expired");
    });
    it("classifies codex and gemini OAuth files by shape, including epoch-second expiry", () => {
        const home = scratchDir("dshb-connect-codexgem-");
        writeHomeFile(home, ".codex/auth.json", JSON.stringify({ tokens: { access_token: "at", expiresAt: Math.floor(PAST_MS / 1000) } }));
        writeHomeFile(home, ".gemini/oauth_creds.json", JSON.stringify({ access_token: "at", expiry_date: FUTURE_MS }));
        const rows = detectCredentials(connectContext(home, join(home, ".dsh")), {});
        assert.equal(rows.find((r) => r.source.includes("codex"))?.status, "expired");
        assert.equal(rows.find((r) => r.source.includes("gemini"))?.status, "found");
    });
    it("reports env keys found with masked detail, missing ones as not found", () => {
        const home = scratchDir("dshb-connect-env-");
        const rows = detectCredentials(connectContext(home, join(home, ".dsh")), {
            ANTHROPIC_API_KEY: FIXTURE_SECRET,
            DEEPSEEK_API_KEY: "sk-short9ke",
        });
        const anthropic = rows.find((r) => r.source === "$ANTHROPIC_API_KEY");
        assert.equal(anthropic?.status, "found");
        assert.match(anthropic?.detail ?? "", /\u2026/);
        const deepseek = rows.find((r) => r.source === "$DEEPSEEK_API_KEY");
        assert.equal(deepseek?.status, "malformed");
        assert.equal(deepseek?.detail, "placeholder-like value");
        assert.equal(rows.find((r) => r.source === "$OPENAI_API_KEY")?.status, "not found");
    });
    it("expands the opencode map into per-provider rows without leaking values (E5)", () => {
        const home = scratchDir("dshb-connect-open-");
        process.env["XDG_DATA_HOME"] = join(home, "xdgdata");
        try {
            writeHomeFile(join(home, "xdgdata"), "opencode/auth.json", JSON.stringify({ anthropic: { type: "api", key: FIXTURE_SECRET } }));
            const rows = detectCredentials(connectContext(home, join(home, ".dsh")), {});
            const row = rows.find((r) => r.source.includes("via opencode"));
            assert.ok(row);
            assert.equal(row.provider, "anthropic");
            assert.equal(row.status, "found");
        }
        finally {
            delete process.env["XDG_DATA_HOME"];
        }
    });
    it("degrades a malformed opencode map to one malformed row showing the path only (E7)", () => {
        const home = scratchDir("dshb-connect-brokenmap-");
        process.env["XDG_DATA_HOME"] = join(home, "xdgdata");
        try {
            writeHomeFile(join(home, "xdgdata"), "opencode/auth.json", "{ truncated json");
            const rows = detectCredentials(connectContext(home, join(home, ".dsh")), {});
            const row = rows.find((r) => r.provider === "opencode");
            assert.equal(row?.status, "malformed");
        }
        finally {
            delete process.env["XDG_DATA_HOME"];
        }
    });
    it("renders the full matrix through the command runner with masked output only (A2)", async () => {
        const home = scratchDir("dshb-connect-run-");
        writeHomeFile(home, ".codex/auth.json", JSON.stringify({ tokens: { access_token: FIXTURE_SECRET, expiresAt: PAST_MS } }));
        writeHomeFile(home, ".dsh/.env", `DEEPSEEK_API_KEY=${FIXTURE_SECRET}\n`);
        const ctx = connectContext(home, join(home, ".dsh"));
        const result = await runConnect(ctx, {});
        assert.ok(result.markdown.includes("PROVIDER | SOURCE | STATUS | DETAIL"));
        assert.ok(result.markdown.includes("~/.claude/.credentials.json"));
        assert.ok(result.markdown.includes("expired"));
        assert.ok(result.markdown.includes("defines DEEPSEEK_API_KEY"));
        assert.ok(!result.markdown.includes(FIXTURE_SECRET), "fixture secret leaked into markdown");
        assert.equal(typeof result.data, "object");
    });
    it("never leaks the fixture secret through any rendered row or data payload (A6 spot check)", async () => {
        const home = scratchDir("dshb-connect-leak-");
        process.env["XDG_DATA_HOME"] = join(home, "xdgdata");
        try {
            writeHomeFile(home, ".claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: FIXTURE_SECRET } }));
            writeHomeFile(join(home, "xdgdata"), "opencode/auth.json", JSON.stringify({ openai: { type: "api", key: FIXTURE_SECRET } }));
            const result = await runConnect(connectContext(home, join(home, ".dsh")), {});
            const rendered = `${result.markdown}\n${JSON.stringify(result.data)}`;
            assert.ok(!rendered.includes(FIXTURE_SECRET));
            assert.ok(!rendered.includes(FIXTURE_SECRET.slice(0, -4)), "more than last 4 chars disclosed");
        }
        finally {
            delete process.env["XDG_DATA_HOME"];
        }
    });
});
describe("connect arg parsing", () => {
    it("defaults to list mode", () => {
        assert.deepEqual(parseConnectArgs({}), { mode: "list" });
    });
    it("parses test <provider> case-insensitively", () => {
        assert.deepEqual(parseConnectArgs({ _: "test", rest: "DeepSeek" }), { mode: "test", provider: "deepseek" });
    });
    it("rejects test without a provider and unknown verbs", () => {
        assert.throws(() => parseConnectArgs({ _: "test" }), /usage/);
        assert.throws(() => parseConnectArgs({ _: "wat" }), /usage/);
    });
});
describe("connect smoke test", () => {
    it("sends one unauthenticated HEAD request to the provider base URL", async () => {
        const seen = [];
        const outcome = await smokeProvider("deepseek", {
            fetchImpl: async (url, init) => {
                seen.push({ url, method: init.method });
                return { status: 200 };
            },
        });
        assert.equal(seen.length, 1);
        assert.equal(seen[0]?.method, "HEAD");
        assert.match(seen[0]?.url ?? "", /^https:\/\/api\.deepseek\.com/);
        assert.equal(outcome.ok, true);
        assert.equal(outcome.status, 200);
    });
    it("fails cleanly when the host cannot be reached", async () => {
        const outcome = await smokeProvider("openai", {
            fetchImpl: async () => {
                const error = new Error("getaddrinfo ENOTFOUND");
                error.code = "ENOTFOUND";
                throw error;
            },
        });
        assert.equal(outcome.ok, false);
        assert.match(outcome.detail, /unreachable \(ENOTFOUND\)/);
    });
    it("refuses unknown providers instead of guessing", async () => {
        await assert.rejects(() => smokeProvider("not-a-provider"), /unknown provider/);
    });
    it("renders the smoke card and keeps output ASCII-only", async () => {
        const home = scratchDir("dshb-connect-testcmd-");
        const outcome = await smokeProvider("deepseek", { fetchImpl: async () => ({ status: 200 }) });
        const markdown = renderSmoke(connectContext(home, join(home, ".dsh")), "deepseek", outcome);
        assert.ok(markdown.includes("HEAD, no Authorization header"));
        for (const char of markdown) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into connect output: ${char}`);
        }
    });
});
//# sourceMappingURL=self-test.js.map