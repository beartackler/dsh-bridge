/**
 * Tests for /bridge-resume (src/commands/resume.ts).
 *
 * The session corpus is a test double injected through the context, so no
 * harness session store is touched and browsing provably writes nothing.
 *
 * Coverage:
 *  - cwd scoping, --all, subagent hiding, literal text filtering
 *  - row rendering: relative time, folded title fallback, message count,
 *    availability badges, fork lineage
 *  - fork-vs-resume semantics present in every rendered surface
 *  - no seam: guidance that is not conflated with an empty corpus
 *  - empty corpus and missing persistence backend footers
 *  - the --json-style row model returned as `data`
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const {
  EXCERPT_LIMIT,
  PAGE_SIZE,
  availability,
  filterRows,
  parseResumeFilters,
  relativeTime,
  renderRows,
  runResume,
  semanticsBlock,
  truncateExcerpt,
} = await import(`${dist}/commands/resume.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const output = await import(`${dist}/lib/output.js`);

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-resume-"));
  cleanupPaths.push(dir);
  return dir;
}

const PROJECT = "/work/dsh-bridge";
const OTHER = "/work/elsewhere";
const HOUR = 3_600_000;

interface Row {
  id: string;
  title?: string;
  createdAt: number;
  lastActivity?: number;
  messageCount: number;
  live: boolean;
  persisted: boolean;
  cwd?: string;
  origin?: "user" | "subagent";
  parentId?: string;
  excerpt?: string;
  unavailable?: boolean;
}

/** Newest-first fixture, as the native seam guarantees. */
function corpus(now: number): Row[] {
  return [
    {
      id: "s-1",
      title: "Spec sprint: resume picker",
      createdAt: now - 2 * HOUR,
      messageCount: 38,
      live: true,
      persisted: false,
      cwd: PROJECT,
      excerpt: "extract the seeded-session helper",
    },
    {
      id: "s-2",
      title: "Adversarial audit: install flow",
      createdAt: now - 5 * HOUR,
      messageCount: 112,
      live: false,
      persisted: true,
      cwd: PROJECT,
      parentId: "s-41",
    },
    { id: "s-3", createdAt: now - 26 * HOUR, messageCount: 3, live: false, persisted: true, cwd: PROJECT },
    {
      id: "s-4",
      title: "Subagent worker",
      createdAt: now - 30 * HOUR,
      messageCount: 9,
      live: false,
      persisted: true,
      cwd: PROJECT,
      origin: "subagent",
    },
    { id: "s-5", title: "Other project", createdAt: now - 40 * HOUR, messageCount: 7, live: false, persisted: true, cwd: OTHER },
    { id: "s-6", createdAt: now - 50 * HOUR, messageCount: 0, live: false, persisted: false, cwd: PROJECT, unavailable: true },
  ];
}

function contextWith(sessionQuery?: Record<string, unknown>, cwd = PROJECT) {
  const home = scratchHome();
  const dshHome = join(home, ".dsh");
  const base = makeBridgeContext({
    profile: "web",
    paths: {
      home,
      dshHome,
      profilePatch: profilePatchPath("web", dshHome),
      profilePackageJson: profilePackageJsonPath("web", dshHome),
    },
    output,
  });
  return { ...base, cwd, ...(sessionQuery === undefined ? {} : { sessionQuery }) };
}

function listing(rows: Row[], extra: Record<string, unknown> = {}) {
  let calls = 0;
  return {
    hooks: {
      listSessions: () => {
        calls += 1;
        return rows;
      },
      ...extra,
    },
    callCount: () => calls,
  };
}

describe("resume filters", () => {
  it("scopes to the current cwd by default and hides subagents", () => {
    const now = Date.now();
    const rows = filterRows(corpus(now), parseResumeFilters({}, PROJECT));
    const ids = rows.map((row: Row) => row.id);
    assert.deepEqual(ids, ["s-1", "s-2", "s-3", "s-6"]);
  });

  it("--all drops the cwd scope", () => {
    const rows = filterRows(corpus(Date.now()), parseResumeFilters({ all: "" }, PROJECT));
    assert.ok(rows.some((row: Row) => row.id === "s-5"));
  });

  it("--subagents includes subagent-origin rows", () => {
    const rows = filterRows(corpus(Date.now()), parseResumeFilters({ subagents: "" }, PROJECT));
    assert.ok(rows.some((row: Row) => row.id === "s-4"));
  });

  it("narrows with a literal, case-insensitive text filter over title and excerpt", () => {
    const byTitle = filterRows(corpus(Date.now()), parseResumeFilters({ _: "AUDIT" }, PROJECT));
    assert.deepEqual(byTitle.map((row: Row) => row.id), ["s-2"]);

    const byExcerpt = filterRows(corpus(Date.now()), parseResumeFilters({ _: "SEEDED-session", rest: "helper" }, PROJECT));
    assert.deepEqual(byExcerpt.map((row: Row) => row.id), ["s-1"]);
  });

  it("preserves the native newest-first order without re-sorting", () => {
    const now = Date.now();
    const input = corpus(now);
    const rows = filterRows(input, parseResumeFilters({ all: "", subagents: "" }, PROJECT));
    assert.deepEqual(rows.map((row: Row) => row.id), input.map((row) => row.id));
  });
});

describe("resume row formatting", () => {
  it("renders relative times in the documented vocabulary", () => {
    const now = Date.now();
    assert.equal(relativeTime(now - 5_000, now), "just now");
    assert.equal(relativeTime(now - 5 * 60_000, now), "5m ago");
    assert.equal(relativeTime(now - 2 * HOUR, now), "2h ago");
    assert.equal(relativeTime(now - 26 * HOUR, now), "yesterday");
    assert.equal(relativeTime(now - 72 * HOUR, now), "3d ago");
  });

  it("maps availability to text badges only", () => {
    assert.equal(availability({ live: true, persisted: false } as Row), "live");
    assert.equal(availability({ live: false, persisted: true } as Row), "archived");
    assert.equal(availability({ live: false, persisted: false } as Row), "unknown");
    assert.equal(availability({ live: true, persisted: true, unavailable: true } as Row), "unavailable");
  });

  it("truncates excerpts at the documented bound", () => {
    const long = "a".repeat(EXCERPT_LIMIT + 50);
    const cut = truncateExcerpt(long);
    assert.ok([...cut].length <= EXCERPT_LIMIT + 3);
    assert.equal(truncateExcerpt("short"), "short");
  });

  it("falls back to Untitled session and shows fork lineage", () => {
    const now = Date.now();
    const filters = parseResumeFilters({}, PROJECT);
    const body = renderRows(filterRows(corpus(now), filters), filters, now);
    assert.match(body, /Untitled session/);
    assert.match(body, /forked from s-41/);
    assert.match(body, /112 msgs/);
    assert.match(body, /unavailable/);
  });

  it("pages at the documented size", () => {
    const now = Date.now();
    const many: Row[] = Array.from({ length: PAGE_SIZE + 5 }, (_, index) => ({
      id: `x-${index}`,
      title: `Session ${index}`,
      createdAt: now - index * 1000,
      messageCount: index,
      live: false,
      persisted: true,
      cwd: PROJECT,
    }));
    const filters = parseResumeFilters({}, PROJECT);
    const body = renderRows(many, filters, now);
    assert.match(body, new RegExp(`Showing 1-${PAGE_SIZE} of ${PAGE_SIZE + 5}`));
    assert.ok(!body.includes(`Session ${PAGE_SIZE + 1}`));
  });
});

describe("resume semantics", () => {
  it("states fork-vs-resume in every rendered surface", async () => {
    const { hooks } = listing(corpus(Date.now()));
    const bodies = [
      (await runResume(contextWith(hooks), {})).markdown,
      (await runResume(contextWith(listing([]).hooks), {})).markdown,
      (await runResume(contextWith(undefined), {})).markdown,
    ];
    for (const body of bodies) {
      assert.match(body, /the same session id becomes live again/);
      assert.match(body, /the original is untouched/);
    }
    assert.match(semanticsBlock(), /resume - /);
  });
});

describe("/bridge-resume command", () => {
  it("lists sessions through the seam exactly once and returns the row model", async () => {
    const { hooks, callCount } = listing(corpus(Date.now()));
    const result = await runResume(contextWith(hooks), {});
    const data = result.data as { seam: string; total: number; shown: number; rows: { id: string }[] };

    assert.equal(callCount(), 1);
    assert.equal(data.seam, "present");
    assert.equal(data.total, 6);
    assert.equal(data.shown, 4);
    assert.deepEqual(data.rows.map((row) => row.id), ["s-1", "s-2", "s-3", "s-6"]);
  });

  it("renders guidance, not an empty list, when the seam is absent", async () => {
    const result = await runResume(contextWith(undefined), {});
    assert.match(result.markdown, /did not expose a session query seam/);
    assert.match(result.markdown, /not the same as having no sessions/);
    assert.equal((result.data as { seam: string }).seam, "absent");
  });

  it("renders the scoped empty state and the widened hint", async () => {
    const { hooks } = listing([]);
    const result = await runResume(contextWith(hooks), {});
    assert.match(result.markdown, /No sessions in \/work\/dsh-bridge yet/);
    assert.match(result.markdown, /--all/);
  });

  it("footers the missing persistence backend without failing", async () => {
    const { hooks } = listing(corpus(Date.now()), { persistenceMounted: false });
    const result = await runResume(contextWith(hooks), {});
    assert.match(result.markdown, /needs a session-persistence backend/);
    assert.match(result.markdown, /Spec sprint/);
  });

  it("accepts an async listSessions implementation", async () => {
    const rows = corpus(Date.now());
    const ctx = contextWith({ listSessions: async () => rows });
    const result = await runResume(ctx, {});
    assert.match(result.markdown, /Spec sprint/);
  });

  it("emits no emoji in any rendered surface", async () => {
    const { hooks } = listing(corpus(Date.now()));
    const bodies = [
      (await runResume(contextWith(hooks), {})).markdown,
      (await runResume(contextWith(hooks), { all: "" })).markdown,
      (await runResume(contextWith(listing([]).hooks), {})).markdown,
      (await runResume(contextWith(undefined), {})).markdown,
    ];
    for (const body of bodies) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(body), `emoji found: ${body}`);
    }
  });
});
