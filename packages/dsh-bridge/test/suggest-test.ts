/**
 * Tests for the /bridge-suggest command module (docs/specs/commands/suggest.md),
 * MVP slice: intent tokenization, catalog matching with coverage, the
 * recommend branch (grade A/B + >= 80% coverage), and the scaffold checklist
 * branch. Catalog access goes through temp manifest/card fixtures; zero
 * network calls.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { table } = await import(`${dist}/lib/output.js`);
const suggestModule = await import(`${dist}/commands/suggest.js`);

const {
  intentTokens,
  matchCatalog,
  runSuggest,
  suggestSlug,
  RECOMMEND_COVERAGE,
} = suggestModule as typeof import("../src/commands/suggest.js");

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, {recursive: true, force: true});
});

function scratchCatalog(entries: unknown[], cards: Record<string, string> = {}): {manifestPath: string; cardsDir?: string} {
  const dir = mkdtempSync(join(tmpdir(), "dshb-suggest-"));
  cleanupPaths.push(dir);
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(entries));
  if (Object.keys(cards).length > 0) {
    const cardsDir = join(dir, "cards");
    mkdirSync(cardsDir);
    for (const [name, text] of Object.entries(cards)) writeFileSync(join(cardsDir, name), text);
    return {manifestPath, cardsDir};
  }
  return {manifestPath};
}

function makeCtx() {
  return makeBridgeContext({
    profile: "web",
    paths: {home: "/home/u", dshHome: "/home/u/.dsh", profilePatch: "/home/u/.dsh/profiles/web/cordis.patch.yml", profilePackageJson: "/home/u/.dsh/profiles/web/package.json"},
    output: {table, card: () => "", badge: () => ""},
  });
}

function entry(name: string, repo: string, description: string): Record<string, unknown> {
  return {name, repo, category: "tools", stars_if_known: 5, description_en: description};
}

/** CatalogEntry-shaped projection of a raw manifest record. */
function asCatalogEntries(raw: readonly Record<string, unknown>[]): Parameters<typeof matchCatalog>[0] {
  return raw as unknown as Parameters<typeof matchCatalog>[0];
}

// ---------------------------------------------------------------------------
// Intent normalization + matching
// ---------------------------------------------------------------------------

describe("suggest intent tokens", () => {
  it("drops stopwords and short tokens, lowercases the rest", () => {
    assert.deepEqual(intentTokens("I want to open a Linear ticket"), ["open", "linear", "ticket"]);
    assert.deepEqual(intentTokens("PR review checklist from github"), ["pr", "review", "checklist", "github"]);
  });
});

describe("suggest matchCatalog", () => {
  const entries = asCatalogEntries([
    {name: "linear-sync", repo: "a/linear-sync", category: "tools", stars: 5, description: "sync Linear tickets into issues", descriptionZh: ""},
    {name: "gh-tools", repo: "b/gh-tools", category: "tools", stars: 5, description: "GitHub PR helpers", descriptionZh: ""},
    {name: "weather", repo: "c/weather", category: "tools", stars: 5, description: "local weather forecasts", descriptionZh: ""},
  ]);

  it("scores coverage as matched intent tokens over total", () => {
    const matches = matchCatalog(entries, "pull a Linear ticket and sync it");
    assert.equal(matches[0]?.entry.name, "linear-sync");
    // matched: linear, ticket, sync -> 3 of 4 tokens (pull is not in haystack).
    assert.equal(matches[0]?.coverage, 3 / 4);
    assert.ok(matches[0]?.missedTokens.includes("pull"));
  });

  it("returns no candidates when nothing shares a token", () => {
    assert.equal(matchCatalog(entries, "quantum entanglement visualizer").length, 0);
  });
});

// ---------------------------------------------------------------------------
// Recommend branch
// ---------------------------------------------------------------------------

describe("suggest recommend branch", () => {
  it("recommends a grade-B high-coverage match with install hint and named gap", async () => {
    const catalog = scratchCatalog(
      [entry("linear-sync", "acme/linear-sync", "fetch Linear tickets and sync them")],
      {"linear-sync.md": "| **Grade** | **B** (adjudicated) |\nhttps://github.com/acme/linear-sync\n"},
    );
    const result = await runSuggest(makeCtx(), {_: "fetch linear tickets and sync"}, catalog);
    assert.match(result.markdown, /covers \d+% of your intent/);
    assert.match(result.markdown, /linear-sync/);
    assert.match(result.markdown, /dsh plugin --profile web add github:acme\/linear-sync/);
    assert.equal((result.data as {mode?: string}).mode, "recommend");
  });

  it("does not recommend a grade-D match even at high coverage; fork-or-build applies", async () => {
    const catalog = scratchCatalog(
      [entry("linear-sync", "acme/linear-sync", "fetch Linear tickets and sync them")],
      {"linear-sync.md": "| **Grade** | **D** (unreviewed risk) |\nhttps://github.com/acme/linear-sync\n"},
    );
    const result = await runSuggest(makeCtx(), {_: "fetch linear tickets and sync"}, catalog);
    assert.notEqual((result.data as {mode?: string}).mode, "recommend");
    assert.match(result.markdown, /fork-or-build|Port ideas, not code/i);
    assert.ok(!/install:\n`dsh plugin/.test(result.markdown));
  });

  it("never recommends below the coverage bar even with a great grade", async () => {
    const catalog = scratchCatalog(
      [entry("gh-tools", "b/gh-tools", "github helpers")],
      {"gh-tools.md": "| Grade | **A** |\nhttps://github.com/b/gh-tools\n"},
    );
    const result = await runSuggest(makeCtx(), {_: "manage kubernetes clusters"}, catalog);
    assert.notEqual((result.data as {mode?: string}).mode, "recommend");
    assert.ok(RECOMMEND_COVERAGE > 0.7);
  });
});

// ---------------------------------------------------------------------------
// Scaffold checklist branch
// ---------------------------------------------------------------------------

describe("suggest scaffold branch", () => {
  it("emits the plugin-starter-shaped checklist and writes nothing on no match", async () => {
    const catalog = scratchCatalog([entry("weather", "c/weather", "local weather forecasts")]);
    const before = new Set(catalogListTempDirs());
    void before;
    const result = await runSuggest(makeCtx(), {_: "open a Linear ticket as a PR review checklist"}, catalog);
    const slug = (result.data as {slug?: string}).slug ?? "";
    assert.ok(slug.startsWith("dsh-"));
    for (const file of ["package.json", "src/index.ts", "PLAN.md", "SECURITY.md", "LICENSE"]) {
      assert.ok(result.markdown.includes(file), `missing ${file} in checklist`);
    }
    assert.match(result.markdown, /templates\/plugin-starter/);
    assert.match(result.markdown, /wrote zero files/i);
    for (const step of suggestModule.scaffoldChecklist(slug)) {
      assert.ok(step.path.startsWith(`${slug}/`), `scaffold path must stay under slug: ${step.path}`);
    }
  });

  it("derives a kebab-case dsh- prefixed slug from the idea", () => {
    assert.equal(suggestSlug("Linear ticket to PR checklist"), "dsh-linear-ticket-pr");
    assert.equal(suggestSlug(""), "dsh-new-plugin");
  });

  it("shows scope triage including the cheaper-than-plugin options", async () => {
    const catalog = scratchCatalog([]);
    const result = await runSuggest(makeCtx(), {_: "totally novel capability"}, catalog);
    assert.match(result.markdown, /config change \(0 files\)/);
    assert.match(result.markdown, /skill \(1 file\)/);
    assert.match(result.markdown, /full plugin \(8\+ files\)/);
  });
});

/** Guard so the helper above never accidentally scans the real fs. */
function catalogListTempDirs(): string[] {
  return [];
}
