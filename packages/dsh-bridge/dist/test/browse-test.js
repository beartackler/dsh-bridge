/**
 * Tests for the /bridge-browse command module (docs/specs/commands/browse.md).
 *
 * Scope:
 *   1. INDEX.md grade parsing and the three-surface grade join.
 *   2. Fuzzy scoring: subsequence acceptance, typo tolerance, ranking order.
 *   3. Flag filters: --category, --lang en|zh|any, --min-grade floors,
 *      --ungraded, plus validation errors for impossible floors and unknown
 *      language codes (spec section 3.2: unknown values never guess).
 *   4. Pagination boundaries: page counts, slicing at exact multiples,
 *      --page range errors.
 *   5. Ranking: grade dominates stars; ties break by stars then name.
 *   6. Empty-result copy: honest, actionable, never padded with unvetted
 *      suggestions (spec section 4.3).
 *
 * Run: npm test (this file compiles with the package), or standalone via
 * `node --test dist/test/browse-test.js`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
// Compiled package under test (mirrors self-test.ts).
const dist = new URL("../src", import.meta.url).pathname;
const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const browse = await import(`${dist}/commands/browse.js`);
const { entryRelevance, extractGrade, fuzzyScore, loadCardGrades, loadGrades, loadManifest, meetsFloor, pageCount, pageSlice, parseIndexGrades, repoBase, repoLeaf, resolveCatalogPaths, resolveGrade, runBrowse, sortEntries, } = browse;
/** Pull bridge-browse out of the registry so tests cover the real mount point. */
async function browseRun(args) {
    const command = bridgeCommandTable(makeCtx()).find((c) => c.name === "bridge-browse");
    assert.ok(command, "bridge-browse must be registered in the command table");
    return (await command.run(makeCtx(), args));
}
function makeCtx() {
    return makeBridgeContext({
        profile: "web",
        paths: {
            home: "/home/u",
            dshHome: "/home/u/.dsh",
            profilePatch: profilePatchPath("web", "/home/u/.dsh"),
            profilePackageJson: profilePackageJsonPath("web", "/home/u/.dsh"),
        },
        output: { table, card, badge },
    });
}
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
function writeFixture(dir, entries) {
    const catalogDir = join(dir, "catalog");
    const cardsDir = join(catalogDir, "cards");
    mkdirSync(cardsDir, { recursive: true });
    const manifestPath = join(catalogDir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(entries), "utf8");
    return { manifestPath, cardsDir };
}
/** A committed report card whose GitHub links pin it to one repo base. */
function cardWith(repoLink, grade) {
    return [
        "# Trust Report Card",
        "",
        "| | |",
        "|---|---|",
        `| **Grade** | **${grade}** (adjudicated) |`,
        "",
        `- upstream: https://github.com/${repoLink}`,
        "",
    ].join("\n");
}
/** INDEX.md in exactly the shape docs/catalog/INDEX.md commits. */
function indexWith(rows) {
    return [
        "# Verified Plugin Catalog",
        "",
        "## Catalog",
        "",
        "| Grade | Plugin | Repo | Stars | Verdict | Verified | Card |",
        "|---|---|---|---:|---|---|---|",
        ...rows,
        "",
    ].join("\n");
}
/**
 * Fixture catalog used across filter/rank/pagination suites:
 *   ui:        web-ui-gitgraph (B via INDEX, 5900)  beta-pack (unreviewed, 1500)
 *   memory:    memstore (A via card, 87)  recall (B via INDEX name join, 63)
 *              memsearch-zh (B, 30, zh-only description)
 *              gamma-mem (unreviewed, null stars)
 *   tools:     alpha-plugin (C via card+INDEX, 300)
 *   markets:   dsh-market (unreviewed, 1100) - target of the spec's "dsh-mrket" typo
 */
function fixtureCatalog() {
    const dir = scratchDir("dshb-browse-");
    const paths = writeFixture(dir, [
        { name: "owner/web-ui-gitgraph", repo: "acme/dsh-web-ui", category: "ui", stars_if_known: 5900, description_en: "Git graph panel for your session history." },
        { name: "owner/beta-pack", repo: "owner/beta-pack", category: "ui", stars_if_known: 1500, description_en: "Beta polishes panels." },
        { name: "owner/memstore", repo: "acme/memstore", category: "memory", stars_if_known: 87, description_en: "Persistent session memory with typed recall API." },
        { name: "owner/recall", repo: "owner/recall", category: "memory", stars_if_known: 63, description_en: "Cross-session recall backed by local SQLite." },
        { name: "owner/memsearch-zh", repo: "owner/zh-only", category: "memory", stars_if_known: 30, description_zh: "仅中文描述的插件。" },
        { name: "owner/gamma-mem", repo: "owner/gamma-mem", category: "memory", stars_if_known: null, description_en: "Gamma recalls context." },
        { name: "owner/alpha-plugin", repo: "owner/alpha-plugin", category: "tools", stars_if_known: 300, description_en: "Alpha does alpha things." },
        { name: "owner/dsh-market", repo: "dsh-market/dsh-market", category: "markets", stars_if_known: 1100, description_en: "Curated marketplace installer." },
    ]);
    writeFileSync(join(paths.cardsDir, "alpha.md"), cardWith("owner/alpha-plugin", "C"), "utf8");
    writeFileSync(join(paths.cardsDir, "memstore.md"), "# Trust Report Card\n\n### Overall: A\n\n- upstream: https://github.com/acme/memstore\n", "utf8");
    const indexMdPath = join(dir, "catalog", "INDEX.md");
    writeFileSync(indexMdPath, indexWith([
        "| B | Web UI family (`@linxin666/*`) | acme/dsh-web-ui | 4661 | Verdict text. | 2026-08-26 | [card](cards/dsh-web-ui.md) |",
        "| B | modlens (`@liustack/modlens`) | liustack/modlens | 3152 | Verdict text. | 2026-08-25 | [card](cards/modlens.md) |",
        "| C | alpha plugin | owner/alpha-plugin | 300 | Card wins over INDEX when they disagree? No: INDEX wins here. | 2026-08-25 | [card](cards/alpha.md) |",
        "| B | Recall memory | owner/recall | 63 | Joined by display name fallback. | 2026-08-26 | [card](cards/recall.md) |",
    ]), "utf8");
    return { manifestPath: paths.manifestPath, cardsDir: paths.cardsDir, indexMdPath };
}
describe("browse repo keys", () => {
    it("cuts subpath repos to their owner/repo base for the join key", () => {
        assert.equal(repoBase("tt-a1i/archify#integrations/deepseek-harness"), "tt-a1i/archify");
        assert.equal(repoBase("Some-Owner/Repo.Name.git"), "some-owner/repo.name");
        assert.equal(repoBase("solo"), "solo");
    });
    it("derives a display-name fallback key from the repo leaf", () => {
        assert.equal(repoLeaf("tt-a1i/archify#x/y"), "archify");
        assert.equal(repoLeaf("acme/dsh-web-ui"), "dsh-web-ui");
    });
});
// ---------------------------------------------------------------------------
// 1. Grade surfaces
// ---------------------------------------------------------------------------
describe("browse INDEX.md grade parsing", () => {
    const markdown = indexWith([
        "| B | OpenViking memory plugin | volcengine/OpenViking | 29567 | Conversation data stays local. | 2026-08-26 | [card](cards/openviking.md) |",
        "| C | dsh-tui (`@deepseek-harness-tui/dsh-tui`) | ccch1mneyyy/dsh-TUI | 2009 | Artifact unverified. | 2026-08-26 | [card](cards/dsh-tui.md) |",
    ]);
    it("parses grade rows into repo-keyed and name-keyed maps", () => {
        const parsed = parseIndexGrades(markdown);
        assert.equal(parsed.byRepo.get("volcengine/openviking"), "B");
        assert.equal(parsed.byRepo.get("ccch1mneyyy/dsh-tui"), "C");
        assert.equal(parsed.byName.get("openviking memory plugin"), "B");
    });
    it("ignores header and rule rows instead of inventing grades", () => {
        const parsed = parseIndexGrades(indexWith([]));
        assert.equal(parsed.byRepo.size, 0);
        assert.equal(parsed.byName.size, 0);
    });
    it("extracts grades from both committed card formats", () => {
        assert.equal(extractGrade("| **Grade** | **C** (manual adjudication; raw scanner output: F) |"), "C");
        assert.equal(extractGrade("### Overall: **A**"), "A");
        assert.equal(extractGrade("| Rev | Date | Subject | Grade | Change |"), null);
    });
});
describe("browse grade join", () => {
    it("resolves grades from INDEX by repo, then name, then falls back to cards", async () => {
        const fixture = fixtureCatalog();
        const entries = loadManifest(fixture.manifestPath);
        const grades = loadGrades(fixture.indexMdPath, fixture.cardsDir, entries);
        const byRepo = entries.find((e) => e.repo === "acme/dsh-web-ui");
        assert.ok(byRepo);
        assert.equal(resolveGrade(byRepo, grades), "B");
        const byNameFallback = entries.find((e) => e.repo === "owner/recall");
        assert.ok(byNameFallback);
        assert.equal(resolveGrade(byNameFallback, grades), "B");
        // alpha has both an INDEX row (C) and a card (C); INDEX wins deterministically.
        const withBoth = entries.find((e) => e.repo === "owner/alpha-plugin");
        assert.ok(withBoth);
        assert.equal(resolveGrade(withBoth, grades), "C");
        // memstore's audit lives only on its committed card.
        const cardOnly = entries.find((e) => e.repo === "acme/memstore");
        assert.ok(cardOnly);
        assert.equal(resolveGrade(cardOnly, grades), "A");
        const unreviewed = entries.find((e) => e.repo === "owner/beta-pack");
        assert.ok(unreviewed);
        assert.equal(resolveGrade(unreviewed, grades), null);
    });
    it("treats an absent cards directory as all-unreviewed instead of failing", () => {
        const grades = loadGrades(undefined, join(scratchDir("dshb-nocards-"), "missing"), []);
        assert.equal(grades.fromCards.size, 0);
    });
    it("keeps ambiguous cards from contributing phantom grades", () => {
        const dir = scratchDir("dshb-cards-ambig-");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "beta.md"), cardWith("unknown/repo", "F"), "utf8");
        const grades = loadCardGrades(dir, new Set(["a/alpha"]));
        assert.equal(grades.size, 0);
    });
});
// ---------------------------------------------------------------------------
// 2. Fuzzy matching
// ---------------------------------------------------------------------------
describe("browse fuzzy matching", () => {
    const options = () => fixtureCatalog();
    it("scores subsequences with boundary and consecutive bonuses", () => {
        assert.ok(fuzzyScore("mrket", "dsh-market") >= 0, "typo subsequence must match");
        assert.equal(fuzzyScore("zzzqqq", "dsh-market"), -1, "non-subsequence must fail");
        assert.ok(fuzzyScore("abc", "abc") > fuzzyScore("abc", "a x b x c"), "compact hits outrank gappy ones");
    });
    it("weights fields name x3 over description x1", () => {
        const entry = { name: "modlens", repo: "liustack/modlens", category: "", stars: null, description: "Model comparison lens.", descriptionZh: "" };
        assert.ok(entryRelevance("model", entry) > 0);
        assert.ok(entryRelevance("modlens", entry) > entryRelevance("model", entry));
    });
    it("resolves the spec's canonical typos to their intended entries", async () => {
        const market = await runBrowse(makeCtx(), { _: "find mrket" }, options());
        assert.match(market.markdown, /dsh-market/, '"mrket" resolves dsh-market through fuzzy subsequence');
        const gitgraph = await runBrowse(makeCtx(), { _: "find web-ui gitgraf" }, options());
        const dataRow = gitgraph.markdown.split("\n").find((line) => line.includes("web-ui-gitgraph"));
        assert.ok(dataRow, 'token-wise fuzzy resolves "gitgraf" inside web-ui-gitgraph');
        assert.ok(dataRow?.includes("|"), "matched entry renders as a table row");
        const memstore = await runBrowse(makeCtx(), { _: "find memstore" }, options());
        assert.ok(memstore.markdown.includes("owner/memstore"));
    });
    it("returns nothing on a total miss without inventing results", async () => {
        const miss = await runBrowse(makeCtx(), { _: "find zzz-nothing-here" }, options());
        assert.match(miss.markdown, /No entries match/);
        assert.match(miss.markdown, /Try a shorter or looser query/);
    });
});
// ---------------------------------------------------------------------------
// 3. Flag filters
// ---------------------------------------------------------------------------
describe("browse flag filters", () => {
    const options = () => fixtureCatalog();
    it("filters by --category (default lang=en already gated zh-only out)", async () => {
        const result = await runBrowse(makeCtx(), { category: "memory" }, options());
        const names = result.markdown.split("\n").filter((line) => line.includes("| owner/")).length;
        assert.equal(names, 3, "memstore, recall, gamma-mem render; zh-only lacks an English line");
        assert.match(result.markdown, /category=memory/);
    });
    it("composes --category AND --min-grade", async () => {
        const filtered = await runBrowse(makeCtx(), { _: "memory", "min-grade": "B" }, options());
        const rows = filtered.markdown.split("\n").filter((line) => line.includes("| owner/"));
        assert.equal(rows.length, 2, "floor B keeps memstore(A) and recall(B); gamma-mem is unreviewed");
        assert.ok(rows.every((row) => /\|\s*[ABC]\s*\|/.test(row)), "only graded rows survive");
        assert.match(filtered.markdown, /grade>=B/);
    });
    it("--lang en drops entries without an English description even when graded", async () => {
        const en = await runBrowse(makeCtx(), { _: "memory" }, options());
        assert.ok(!en.markdown.includes("仅中文描述的插件"), "default en hides zh-only rows");
        const any = await runBrowse(makeCtx(), { _: "memory", lang: "any" }, options());
        assert.ok(any.markdown.includes("仅中文描述的插件"), "--lang any reveals them, preferring the English line");
        assert.match(any.markdown, /lang=any/);
    });
    it("--lang zh lists only Chinese-described entries and shows the zh line", async () => {
        const zh = await runBrowse(makeCtx(), { _: "memory", lang: "zh" }, options());
        assert.ok(zh.markdown.includes("仅中文描述的插件"));
        assert.ok(!zh.markdown.includes("owner/memstore"), "English-only entries stay hidden under --lang zh");
    });
    it("--min-grade excludes unreviewed entries unless --ungraded is set", async () => {
        const strict = await runBrowse(makeCtx(), { _: "ui", "min-grade": "B" }, options());
        const strictRows = strict.markdown.split("\n").filter((line) => line.includes("| owner/"));
        assert.equal(strictRows.length, 1, "beta-pack (unreviewed, 1500 stars) must be hidden");
        assert.ok(strict.markdown.includes("web-ui-gitgraph"));
        const relaxed = await runBrowse(makeCtx(), { _: "ui", "min-grade": "B", ungraded: "" }, options());
        const relaxedRows = relaxed.markdown.split("\n").filter((line) => line.includes("| owner/"));
        assert.equal(relaxedRows.length, 2, "--ungraded brings beta-pack back");
        assert.match(relaxed.markdown, /grade>=B\+ungraded/);
    });
    it("rejects D, F, ?, and typos as --min-grade floors with valid options listed", async () => {
        for (const floor of ["D", "F", "?", "a+", "Z"]) {
            const bad = await runBrowse(makeCtx(), { "min-grade": floor }, options());
            assert.match(bad.markdown, /invalid --min-grade/, `floor "${floor}" must error`);
            assert.match(bad.markdown, /Valid floors: A, B, C/);
        }
    });
    it("rejects unknown --lang codes without guessing", async () => {
        const bad = await runBrowse(makeCtx(), { lang: "fr" }, options());
        assert.match(bad.markdown, /unknown --lang "fr"/);
        assert.match(bad.markdown, /Valid: en, zh, any/);
    });
    it("meetsFloor never lets unreviewed pass any floor", () => {
        assert.equal(meetsFloor(null, "A"), false);
        assert.equal(meetsFloor("?", "A"), false);
        assert.equal(meetsFloor("D", "C"), false);
        assert.equal(meetsFloor("B", "B"), true);
        assert.equal(meetsFloor("A", "B"), true);
    });
});
// ---------------------------------------------------------------------------
// 4. Pagination
// ---------------------------------------------------------------------------
describe("browse pagination boundaries", () => {
    function paged() {
        const dir = scratchDir("dshb-pages-");
        const paths = writeFixture(dir, Array.from({ length: 25 }, (_, index) => ({
            name: `p/p-${String(index).padStart(2, "0")}`,
            repo: `p/p-${index}`,
            category: "tools",
            stars_if_known: 100 - index,
            description_en: `plugin ${index}`,
        })));
        return { manifestPath: paths.manifestPath, cardsDir: paths.cardsDir };
    }
    it("computes page counts at every boundary", () => {
        assert.equal(pageCount(0), 1);
        assert.equal(pageCount(1), 1);
        assert.equal(pageCount(10), 1);
        assert.equal(pageCount(11), 2);
        assert.equal(pageCount(20), 2);
        assert.equal(pageCount(21), 3);
        assert.equal(pageCount(25), 3);
    });
    it("slices full, partial, final-empty, and out-of-range pages", () => {
        const items = Array.from({ length: 23 }, (_, i) => i);
        assert.equal(pageSlice(items, 1).length, 10);
        assert.equal(pageSlice(items, 2).length, 10);
        assert.equal(pageSlice(items, 3).length, 3);
        assert.deepEqual(pageSlice(items, 4), []);
        assert.deepEqual(pageSlice([], 1), []);
    });
    it("renders pages 2 and 3 with the remainder and correct headers", async () => {
        const result = await runBrowse(makeCtx(), { _: "2" }, paged());
        assert.match(result.markdown, /page 2\/3/);
        assert.equal(result.markdown.split("\n").filter((line) => line.includes("| p/")).length, 10);
        const final = await runBrowse(makeCtx(), { _: "3" }, paged());
        assert.match(final.markdown, /page 3\/3/);
        assert.equal(final.markdown.split("\n").filter((line) => line.includes("| p/")).length, 5, "last page carries the remainder");
    });
    it("walks next/prev through the remembered list pages", async () => {
        const ctx = makeCtx();
        const options = paged();
        await runBrowse(ctx, { _: "" }, options);
        const next = await runBrowse(ctx, { _: "next" }, options);
        assert.match(next.markdown, /page 2\/3/);
        const nextTwice = await runBrowse(ctx, { _: "next" }, options);
        assert.match(nextTwice.markdown, /page 3\/3/, "next clamps at the last page");
        const prev = await runBrowse(ctx, { _: "prev" }, options);
        assert.match(prev.markdown, /page 2\/3/);
    });
    it("errors on out-of-range --page values instead of guessing", async () => {
        const bad = await runBrowse(makeCtx(), { page: "9" }, paged());
        assert.match(bad.markdown, /page must be 1-3/);
        const zero = await runBrowse(makeCtx(), { page: "0" }, paged());
        assert.match(zero.markdown, /integer between 1 and/);
    });
    it("keeps every rendered byte ASCII when the default language gate is active", async () => {
        const result = await runBrowse(makeCtx(), {}, fixtureCatalog());
        for (const char of result.markdown) {
            const code = char.codePointAt(0) ?? 0;
            assert.ok(code <= 127, `non-ASCII leaked into default browse output: ${char}`);
        }
    });
});
// ---------------------------------------------------------------------------
// 5. Ranking
// ---------------------------------------------------------------------------
describe("browse ranking (grade then stars)", () => {
    it("puts graded entries above higher-starred unreviewed ones", async () => {
        const result = await runBrowse(makeCtx(), { _: "ui", lang: "any" }, fixtureCatalog());
        const order = result.markdown
            .split("\n")
            .filter((line) => line.includes("| owner/"))
            .map((line) => (line.includes("web-ui-gitgraph") ? "graded-B" : "unreviewed"));
        assert.deepEqual(order, ["graded-B", "unreviewed"], "grade dominates stars in rank order");
    });
    it("sorts deterministically within a grade band: stars desc, then name asc", () => {
        const entries = [
            { name: "b", repo: "o/b", category: "", stars: 100, description: "x", descriptionZh: "" },
            { name: "a", repo: "o/a", category: "", stars: 100, description: "x", descriptionZh: "" },
            { name: "c", repo: "o/c", category: "", stars: 900, description: "x", descriptionZh: "" },
        ];
        const sorted = sortEntries(entries);
        assert.deepEqual(sorted.map((e) => e.name), ["c", "a", "b"]);
    });
    it("orders mixed-grade results worst-band last with unknowns at the end", async () => {
        const result = await runBrowse(makeCtx(), { _: "memory", lang: "any", "min-grade": "C", ungraded: "" }, fixtureCatalog());
        const bands = result.markdown
            .split("\n")
            .filter((line) => line.includes("| owner/"))
            .map((line) => line.trim().split("|")[1]?.trim() ?? "");
        assert.deepEqual(bands, ["A", "B", "?", "?"], "grade desc, stars desc inside bands, ? always last");
    });
});
// ---------------------------------------------------------------------------
// 6. Empty state + handoff
// ---------------------------------------------------------------------------
describe("browse empty state and install handoff", () => {
    it("empty results are honest, count what was hidden, and suggest relaxations", async () => {
        // tools holds only a C-graded entry, so floor A yields zero results.
        const result = await runBrowse(makeCtx(), { _: "tools", "min-grade": "A" }, fixtureCatalog());
        assert.match(result.markdown, /No entries match the current filters/);
        assert.match(result.markdown, /Try dropping --min-grade/);
        assert.ok(!result.markdown.includes("| owner/"), "nothing is padded in");
    });
    it("footer always teaches paging, search, and the install handoff", async () => {
        const result = await runBrowse(makeCtx(), {}, fixtureCatalog());
        assert.match(result.markdown, /paging: \/bridge-browse next \| prev \| <page>/);
        assert.match(result.markdown, /search: \/bridge-browse find <query>/);
        assert.match(result.markdown, /install: \/bridge-install <plugin-name>/);
        assert.ok(!result.markdown.includes("/bridge:browse"), "colon namespace is never suggested (parser rule)");
        assert.ok(!result.markdown.includes("/bridge:install"), "colon namespace is never suggested (parser rule)");
    });
    it("exposes structured data and degrades gracefully without a manifest", async () => {
        const found = await runBrowse(makeCtx(), {}, fixtureCatalog());
        const data = found.data;
        assert.equal(data.mode, "list");
        assert.equal(data.total, 7, "en gate drops the zh-only entry from the counted results");
        assert.equal(data.pages, 1);
        const missing = await runBrowse(makeCtx(), {}, { manifestPath: "/definitely/not/here.json" });
        assert.match(missing.markdown, /Catalog is unavailable/);
        assert.match(missing.markdown, /not readable/);
    });
    it("auto-resolves the real committed catalog when no options are pinned", async () => {
        const found = resolveCatalogPaths();
        assert.ok(found, "catalog must exist in this repo checkout");
        assert.match(found.manifestPath, /docs[/\\]catalog[/\\]manifest\.json$/);
        const real = await browseRun({});
        assert.match(real.markdown, /### \/bridge-browse/);
        assert.ok(!real.markdown.includes("Catalog is unavailable"), "the committed catalog must load");
    });
});
//# sourceMappingURL=browse-test.js.map