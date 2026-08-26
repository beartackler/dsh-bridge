/**
 * Tests for /bridge-memory (src/commands/memory.ts).
 *
 * Every case runs against a tmpdir HOME injected through the BridgeContext, so
 * the real user's memory file is never touched and no test mutates process env.
 *
 * Coverage:
 *  - show: empty state, then the populated card (path, size, digest, preview)
 *  - edit: creates from template, resolves the editor chain, degrades honestly
 *  - add: dated heading, append under an existing heading, duplicate rejection
 *  - import-from: detection of CLAUDE.md / AGENTS.md, section copy, never
 *    overwrites existing content, and idempotence on a second run
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const {
  MEMORY_TEMPLATE,
  appendNote,
  datedHeading,
  detectImportSources,
  ensureMemoryFile,
  extractSections,
  importSections,
  memoryFilePath,
  memoryStatus,
  resolveEditor,
  runMemory,
  sectionBody,
  sectionHeadings,
  shortDigest,
} = await import(`${dist}/commands/memory.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const output = await import(`${dist}/lib/output.js`);

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-memory-"));
  cleanupPaths.push(dir);
  return dir;
}

/** A BridgeContext rooted at a fake HOME so no real file is ever read. */
function contextOverFakeHome(home: string, profile = "web") {
  const dshHome = join(home, ".dsh");
  return makeBridgeContext({
    profile,
    paths: {
      home,
      dshHome,
      profilePatch: profilePatchPath(profile, dshHome),
      profilePackageJson: profilePackageJsonPath(profile, dshHome),
    },
    output,
  });
}

describe("memory file primitives", () => {
  it("creates the file from template exactly once", () => {
    const home = scratchHome();
    assert.equal(ensureMemoryFile(home), true);
    assert.equal(ensureMemoryFile(home), false);
    assert.equal(readFileSync(memoryFilePath(home), "utf8"), MEMORY_TEMPLATE);
  });

  it("stores the file under a bridge-owned directory, not a native DSH path", () => {
    const home = scratchHome();
    const path = memoryFilePath(home);
    assert.equal(path, join(home, ".dsh-bridge", "memory.md"));
    assert.ok(!path.includes(join(home, ".dsh", "AGENTS.md")));
  });

  it("digests are stable and short", () => {
    assert.equal(shortDigest("abc"), shortDigest("abc"));
    assert.notEqual(shortDigest("abc"), shortDigest("abd"));
    assert.equal(shortDigest("abc").length, 12);
  });

  it("parses headings and section bodies", () => {
    const content = "# Title\n\n## One\n\n- a\n\n## Two\n\n- b\n";
    assert.deepEqual([...sectionHeadings(content)], ["One", "Two"]);
    assert.ok([...sectionBody(content, "One")].includes("- a"));
    assert.ok(![...sectionBody(content, "One")].includes("- b"));
  });
});

describe("/bridge-memory show", () => {
  it("prints setup guidance when no memory file exists", async () => {
    const home = scratchHome();
    const result = await runMemory(contextOverFakeHome(home), {});
    assert.match(result.markdown, /No memory file yet/);
    assert.match(result.markdown, /import-from/);
    assert.equal((result.data as { exists: boolean }).exists, false);
  });

  it("reports path, size, digest, and a preview once populated", async () => {
    const home = scratchHome();
    appendNote(home, "prefer tabs", "Style");
    const result = await runMemory(contextOverFakeHome(home), { _: "show" });
    const status = memoryStatus(home);

    assert.match(result.markdown, /prefer tabs/);
    assert.match(result.markdown, /Style/);
    assert.ok(result.markdown.includes(status.digest));
    assert.ok(status.sizeBytes > 0);
  });
});

describe("/bridge-memory edit", () => {
  it("creates the file and names the configured editor", async () => {
    const home = scratchHome();
    const previous = process.env["DSH_EDITOR"];
    process.env["DSH_EDITOR"] = "vim";
    try {
      const result = await runMemory(contextOverFakeHome(home), { _: "edit" });
      assert.match(result.markdown, /vim/);
      assert.match(result.markdown, /Created from template/);
      assert.equal(readFileSync(memoryFilePath(home), "utf8"), MEMORY_TEMPLATE);
    } finally {
      if (previous === undefined) delete process.env["DSH_EDITOR"];
      else process.env["DSH_EDITOR"] = previous;
    }
  });

  it("resolves the editor chain in spec order and degrades to a path hint", () => {
    assert.equal(resolveEditor({ DSH_EDITOR: "a", VISUAL: "b", EDITOR: "c" }), "a");
    assert.equal(resolveEditor({ VISUAL: "b", EDITOR: "c" }), "b");
    assert.equal(resolveEditor({ EDITOR: "c" }), "c");
    assert.equal(resolveEditor({ EDITOR: "   " }), null);
    assert.equal(resolveEditor({}), null);
  });
});

describe("/bridge-memory add", () => {
  it("appends under a dated heading by default", async () => {
    const home = scratchHome();
    const result = await runMemory(contextOverFakeHome(home), { _: "add", rest: "always run tests" });
    const content = readFileSync(memoryFilePath(home), "utf8");

    assert.equal((result.data as { written: boolean }).written, true);
    assert.ok(content.includes(`## ${datedHeading(new Date())}`));
    assert.ok(content.includes("- always run tests"));
  });

  it("adds to an existing heading instead of duplicating it", () => {
    const home = scratchHome();
    appendNote(home, "one", "Style");
    appendNote(home, "two", "Style");
    const content = readFileSync(memoryFilePath(home), "utf8");

    assert.equal([...sectionHeadings(content)].filter((h: string) => h === "Style").length, 1);
    assert.ok(content.includes("- one"));
    assert.ok(content.includes("- two"));
  });

  it("rejects an exact duplicate line and an empty note", () => {
    const home = scratchHome();
    assert.equal(appendNote(home, "one", "Style").written, true);
    const second = appendNote(home, "one", "Style");
    assert.equal(second.written, false);
    assert.match(String(second.reason), /duplicate/);
    assert.equal(appendNote(home, "   ", "Style").written, false);
  });

  it("honors an explicit --heading and prints usage with no note", async () => {
    const home = scratchHome();
    await runMemory(contextOverFakeHome(home), { _: "add", rest: "keep it short", heading: "Tone" });
    assert.ok(readFileSync(memoryFilePath(home), "utf8").includes("## Tone"));

    const usage = await runMemory(contextOverFakeHome(home), { _: "add" });
    assert.match(usage.markdown, /Usage: \/bridge-memory/);
  });
});

describe("/bridge-memory import-from", () => {
  function seedProject(home: string): string {
    const project = join(home, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "CLAUDE.md"), "# Project\n\n## Build\n\nrun npm test\n\n## Style\n\nno emoji\n");
    return project;
  }

  it("detects sources and reports absent ones honestly", () => {
    const home = scratchHome();
    const project = seedProject(home);
    const sources = detectImportSources(home, project);
    const claude = sources.find((s: { path: string }) => s.path === join(project, "CLAUDE.md"));

    assert.ok(claude);
    assert.equal(claude.exists, true);
    assert.deepEqual([...claude.sections], ["Build", "Style"]);
    assert.ok(sources.some((s: { exists: boolean }) => s.exists === false));
  });

  it("splits a source into heading and body pairs", () => {
    const sections = extractSections("# T\n\n## A\n\nbody a\n\n## B\n\nbody b\n");
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, "A");
    assert.equal(sections[0].body, "body a");
  });

  it("copies missing sections and never modifies the source", async () => {
    const home = scratchHome();
    const project = seedProject(home);
    const sourcePath = join(project, "CLAUDE.md");
    const sourceBefore = readFileSync(sourcePath, "utf8");

    const result = await runMemory(contextOverFakeHome(home), { _: "import-from", rest: project });
    const content = readFileSync(memoryFilePath(home), "utf8");

    assert.match(result.markdown, /Imported 2 section/);
    assert.ok(content.includes("## Build"));
    assert.ok(content.includes("run npm test"));
    assert.equal(readFileSync(sourcePath, "utf8"), sourceBefore);
  });

  it("never overwrites existing memory content", async () => {
    const home = scratchHome();
    const project = seedProject(home);
    appendNote(home, "hand written note", "Personal");

    await runMemory(contextOverFakeHome(home), { _: "import-from", rest: project });
    const content = readFileSync(memoryFilePath(home), "utf8");

    assert.ok(content.includes("- hand written note"));
    assert.ok(content.includes("## Personal"));
    assert.ok(content.includes("## Build"));
  });

  it("is idempotent: a second import writes nothing new", async () => {
    const home = scratchHome();
    const project = seedProject(home);
    const ctx = contextOverFakeHome(home);

    await runMemory(ctx, { _: "import-from", rest: project });
    const afterFirst = readFileSync(memoryFilePath(home), "utf8");
    const second = await runMemory(ctx, { _: "import-from", rest: project });

    assert.equal(readFileSync(memoryFilePath(home), "utf8"), afterFirst);
    assert.match(second.markdown, /Imported 0 section\(s\), skipped 2/);
  });

  it("skips a section whose heading already exists in memory", () => {
    const home = scratchHome();
    const project = seedProject(home);
    appendNote(home, "already mine", "Build");

    const outcome = importSections(home, detectImportSources(home, project));
    assert.equal(outcome.imported, 1);
    assert.equal(outcome.skipped, 1);
    assert.ok(readFileSync(memoryFilePath(home), "utf8").includes("- already mine"));
  });

  it("reports nothing to import on a bare directory", async () => {
    const home = scratchHome();
    const empty = join(home, "empty");
    mkdirSync(empty, { recursive: true });
    const result = await runMemory(contextOverFakeHome(home), { _: "import-from", rest: empty });
    assert.match(result.markdown, /Nothing to import/);
  });
});

describe("/bridge-memory contract", () => {
  it("routes an unknown subcommand to usage", async () => {
    const home = scratchHome();
    const result = await runMemory(contextOverFakeHome(home), { _: "frobnicate" });
    assert.match(result.markdown, /Unknown subcommand: frobnicate/);
    assert.match(result.markdown, /Usage: \/bridge-memory/);
  });

  it("emits no emoji in any rendered surface", async () => {
    const home = scratchHome();
    const project = join(home, "p");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "AGENTS.md"), "## Rules\n\nbe brief\n");
    const ctx = contextOverFakeHome(home);

    const bodies = [
      (await runMemory(ctx, { _: "show" })).markdown,
      (await runMemory(ctx, { _: "add", rest: "note" })).markdown,
      (await runMemory(ctx, { _: "import-from", rest: project })).markdown,
      (await runMemory(ctx, { _: "edit" })).markdown,
    ];
    for (const body of bodies) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(body), `emoji found: ${body}`);
    }
  });
});
