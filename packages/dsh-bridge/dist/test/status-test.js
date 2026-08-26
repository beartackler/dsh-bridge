/**
 * Tests for /bridge-status (docs/specs/commands/status.md slice).
 *
 * Covers: staleness boundary math against the 30-day rule, INDEX.md parsing,
 * every-row collection with injected service doubles, graceful degradation to
 * `unavailable`, the command runner over real files in a scratch DSH_HOME, and
 * the charter's ASCII/no-emoji bar for all rendered bytes.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
// Compiled package under test (dist/src), mirroring self-test.ts.
const dist = new URL("../src", import.meta.url).pathname;
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { STALE_AFTER_DAYS, ageInDays, collectStatus, parseCatalogIndex, resolveIndexPath, runStatus, } = await import(`${dist}/commands/status.js`);
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
function isoDaysAgo(days, now) {
    const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return new Date(utc - days * 86_400_000).toISOString().slice(0, 10);
}
function makeCtx(dshHome, profile = "web") {
    return makeBridgeContext({
        profile,
        paths: { home: dshHome, dshHome },
        output: { table, card, badge },
    });
}
/** INDEX.md-shaped fixture with one fresh and one old card. */
function indexFixture(now) {
    return [
        "# Catalog",
        "",
        "| Grade | Plugin | Repo | Stars | Verdict | Verified | Card |",
        "|---|---|---|---:|---|---|---|",
        `| B | fresh-plugin | a/fresh | 10 | Fine. | ${isoDaysAgo(5, now)} | [card](cards/a.md) |`,
        `| C | old-plugin | b/old | 20 | Aging. | ${isoDaysAgo(40, now)} | [card](cards/b.md) |`,
        "",
        "Distribution prose below the table.",
        "",
    ].join("\n");
}
describe("status staleness math", () => {
    const now = new Date("2026-08-26T12:00:00Z");
    it("counts exactly 30 days as fresh and 31 as stale (boundary both sides)", () => {
        assert.equal(ageInDays(isoDaysAgo(29, now), now), 29);
        assert.equal(ageInDays(isoDaysAgo(30, now), now), 30);
        assert.equal(ageInDays(isoDaysAgo(31, now), now), 31);
        assert.equal(STALE_AFTER_DAYS, 30);
        const cards = [
            { grade: "B", plugin: "edge30", verifiedOn: isoDaysAgo(30, now) },
            { grade: "C", plugin: "over31", verifiedOn: isoDaysAgo(31, now) },
        ];
        const collected = collectStatus({
            profile: "web",
            dshHome: "/tmp/nowhere",
            indexMdPath: "unused",
            services: {},
            now,
            // Feed the markdown through readFile so the collector stays pure.
        }, () => `| B | edge30-plugin | x/y | 1 | v | ${isoDaysAgo(30, now)} | c |
| C | over31-plugin | z/w | 2 | v | ${isoDaysAgo(31, now)} | c |`);
        void cards;
        assert.deepEqual(collected.staleCards.map((entry) => entry.plugin), ["over31-plugin"]);
    });
    it("skips rows with missing or malformed dates entirely", () => {
        const collected = collectStatus({ profile: "p", dshHome: "/x", indexMdPath: "unused", services: {}, now }, () => "| B | ghost | g/h | 1 | v | not-a-date | c |\n| ? | unknown | u/v | 1 | v | | c |");
        // A row without a parseable verified date contributes no card and no
        // staleness signal; it is never silently counted as fresh.
        assert.equal(collected.staleCards.length, 0);
        assert.equal(collected.totalCards, 0);
        const plugins = collected.rows.find((row) => row.id === "plugins");
        if (plugins !== undefined && !plugins.unavailable) {
            assert.match(plugins.value, /0 reviewed/);
        }
    });
    it("parses the committed INDEX.md table and rejects headers and prose", () => {
        const parsed = parseCatalogIndex(indexFixture(now));
        assert.equal(parsed.length, 2);
        assert.equal(parsed[0]?.plugin, "fresh-plugin");
        assert.equal(parsed[0]?.grade, "B");
        assert.match(parsed[0]?.verifiedOn ?? "", /^\d{4}-\d{2}-\d{2}$/);
        // Walk starts at the package root (npm test always runs from there) so
        // the checkout's docs/catalog is found regardless of build output layout.
        const realPath = resolveIndexPath(process.cwd());
        assert.ok(realPath, "resolveIndexPath must find docs/catalog/INDEX.md");
    });
    it("parses more than ten cards out of the real committed index", () => {
        const realPath = resolveIndexPath(process.cwd());
        assert.ok(realPath);
        const real = parseCatalogIndex(readFileSync(realPath, "utf8"));
        assert.ok(real.length >= 10, `expected the reviewed rows, got ${real.length}`);
        for (const entry of real) {
            assert.match(entry.grade, /^[A-F?]$/);
        }
    });
});
describe("collectStatus rows", () => {
    const now = new Date("2026-08-26T12:00:00Z");
    function inputs(services) {
        return {
            profile: "web",
            dshHome: "/home/u/.dsh",
            indexMdPath: "/index.md",
            services,
            now,
        };
    }
    it("renders every row from fully populated services", () => {
        const collected = collectStatus(inputs({
            activeRoute: { provider: "deepseek", model: "deepseek-chat", live: true },
            mountedFeatures: ["connectors flow", "trust layer"],
            lastSmoke: { ok: true, provider: "deepseek", at: "today 19:02" },
            tokenUsage: {
                uncachedInputTokens: 36000,
                outputTokens: 3800,
                cacheReadTokens: 4100,
                cacheWriteTokens: 1100,
                contextWindow: 128000,
            },
        }), () => indexFixture(now));
        const byId = new Map(collected.rows.map((row) => [row.id, row]));
        assert.equal(byId.get("profile")?.value.includes("web"), true);
        assert.equal(byId.get("route")?.value, "deepseek/deepseek-chat");
        assert.equal(byId.get("features")?.value.includes("trust layer"), true);
        assert.match(byId.get("smoke")?.value ?? "", /^PASS deepseek/);
        assert.match(byId.get("plugins")?.value ?? "", /1 stale/);
        assert.match(byId.get("tokens")?.value ?? "", /~35% of 128000/);
        for (const row of collected.rows)
            assert.equal(row.unavailable, false);
    });
    it("marks a dormant route while keeping other rows green (no cascade)", () => {
        const collected = collectStatus(inputs({ activeRoute: { provider: "a", model: "m", live: false } }), () => indexFixture(now));
        const route = collected.rows.find((row) => row.id === "route");
        assert.match(route?.value ?? "", /dormant/);
        assert.equal(route?.unavailable, false);
    });
    it("degrades every optional row to unavailable with a producing command named", () => {
        const collected = collectStatus(inputs({}), () => {
            throw new Error("unreadable");
        });
        const unavailable = collected.rows.filter((row) => row.unavailable);
        assert.deepEqual(unavailable.map((row) => row.id).sort(), ["features", "plugins", "route", "smoke", "tokens"]);
        for (const row of unavailable) {
            assert.ok(row.value === "unavailable" || row.value === "never run", row.id);
            assert.ok(row.source.length > 0, `${row.id} must name its source`);
        }
    });
    it("omits occupancy when no context window is advertised", () => {
        const collected = collectStatus(inputs({ tokenUsage: { uncachedInputTokens: 10, outputTokens: 5 } }), () => indexFixture(now));
        const tokens = collected.rows.find((row) => row.id === "tokens");
        assert.doesNotMatch(tokens?.value ?? "", /%/);
    });
});
describe("status command runner", () => {
    it("runs end to end over real files in a scratch DSH_HOME", async () => {
        const now = new Date();
        const home = scratchDir("dshb-status-run-");
        mkdirSync(join(home, "profiles", "web"), { recursive: true });
        writeFileSync(join(home, "profiles", "web", "package.json"), "{}", "utf8");
        const indexPath = join(home, "INDEX.md");
        writeFileSync(indexPath, indexFixture(now), "utf8");
        const ctx = makeCtx(home);
        const result = await runStatus(ctx, {}, {
            indexPath,
            services: { activeRoute: { provider: "deepseek", model: "deepseek-chat", live: true } },
        });
        assert.match(result.markdown, /dsh-bridge status/);
        assert.match(result.markdown, /deepseek\/deepseek-chat/);
        assert.match(result.markdown, /old-plugin/, "stale card must be listed");
        assert.match(result.markdown, /1 local install record\(s\)/);
        const data = result.data;
        assert.equal(data.rows.length >= 6, true);
        assert.equal(data.staleCards.length, 1);
    });
    it("keeps every rendered byte ASCII and emoji-free", async () => {
        const home = scratchDir("dshb-status-ascii-");
        const result = await runStatus(makeCtx(home), {}, {
            indexPath: join(home, "absent-index.md"),
            services: {},
        });
        for (const char of result.markdown) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into status output: ${char}`);
        }
    });
    it("never claims freshness it cannot source", async () => {
        const home = scratchDir("dshb-status-honest-");
        const result = await runStatus(makeCtx(home), {}, { indexPath: join(home, "absent.md") });
        assert.match(result.markdown, /unavailable/);
        assert.doesNotMatch(result.markdown, /fresh/);
    });
});
//# sourceMappingURL=status-test.js.map