/**
 * Tests for /bridge-improve (src/commands/improve.ts).
 *
 * Coverage per docs/specs/commands/improve.md acceptance criteria:
 *  - each detector fires exactly on its fixture (AC10);
 *  - the clean fixture yields the single "No findings." line (AC9);
 *  - ranking is deterministic (AC6) and filters/limits behave (AC7, AC8);
 *  - missing path, unsupported extension, empty file degrade to messages (AC11);
 *  - no target and no --diff errors with the documented message (AC3);
 *  - --diff uses only `git diff --name-only` forms (AC4);
 *  - rendered output is ASCII with no emoji (AC12).
 *
 * Fixtures live in test/fixtures/improve with a .ts.txt suffix so the package
 * build never type-checks intentionally bad code. Run: npm test.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Compiled package under test (dist/src), mirroring doctor-test's approach.
const dist = new URL("../src", import.meta.url).pathname;
// Fixtures are read from source, not dist: they are data, not compiled output.
const fixtureDir = new URL("../../test/fixtures/improve/", import.meta.url).pathname;

const {
  analyzeFile,
  auditTargets,
  DEFAULT_LIMIT,
  ImproveError,
  parseImproveArgs,
  rankFindings,
  renderImproveReport,
  resolveTargets,
  runImprove,
} = await import(`${dist}/commands/improve.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { badge, card, table } = await import(`${dist}/lib/output.js`);

type Value = "high" | "medium" | "low";
interface Finding {
  readonly detector: string;
  readonly value: Value;
  readonly path: string;
  readonly line: number;
  readonly cut: string;
  readonly replacement: string;
  readonly removableLines: number;
}
interface Report {
  readonly findings: readonly Finding[];
  readonly audited: readonly { readonly path: string; readonly lines: number }[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  readonly truncated: number;
}
interface Deps {
  readFile(path: string): string;
  readDir(path: string): readonly string[];
  statPath(path: string): { readonly isFile: boolean; readonly isDirectory: boolean } | null;
  gitDiffNames(cwd: string): readonly string[];
}

function fixture(name: string): string {
  return readFileSync(`${fixtureDir}${name}.ts.txt`, "utf8");
}

function analyze(name: string): readonly Finding[] {
  return analyzeFile(`src/${name}.ts`, fixture(name)) as readonly Finding[];
}

function detectors(findings: readonly Finding[]): string[] {
  return [...new Set(findings.map((finding) => finding.detector))].sort();
}

/** In-memory deps: a virtual file tree, so tests never touch the real repo. */
function memoryDeps(files: Record<string, string>, changed: readonly string[] = []): Deps {
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    if (slash > 0) dirs.add(path.slice(0, slash));
  }
  return {
    readFile: (path) => {
      const content = files[path];
      if (typeof content !== "string") throw new Error(`ENOENT ${path}`);
      return content;
    },
    readDir: (path) =>
      Object.keys(files)
        .filter((file) => file.startsWith(`${path}/`) && !file.slice(path.length + 1).includes("/"))
        .map((file) => file.slice(path.length + 1)),
    statPath: (path) => {
      if (typeof files[path] === "string") return { isFile: true, isDirectory: false };
      if (dirs.has(path)) return { isFile: false, isDirectory: true };
      return null;
    },
    gitDiffNames: () => changed,
  };
}

const ctx = makeBridgeContext({
  profile: "web",
  paths: { home: "/tmp", dshHome: "/tmp/.dsh", profilePatch: "/tmp/p.yml", profilePackageJson: "/tmp/p.json" },
  output: { table, card, badge },
});

describe("improve detectors", () => {
  it("clean fixture produces no findings", () => {
    assert.deepEqual(analyze("clean"), []);
  });

  it("flags commented-out code as high value", () => {
    const findings = analyze("commented-out").filter((f) => f.detector === "commented-out-code");
    assert.equal(findings.length, 2);
    for (const finding of findings) assert.equal(finding.value, "high");
  });

  it("flags TODO as low and FIXME as medium", () => {
    const todos = analyze("todo-debt").filter((f) => f.detector === "todo-debt");
    assert.deepEqual(
      todos.map((f) => f.value).sort(),
      ["low", "medium"],
    );
  });

  it("flags a function longer than the threshold", () => {
    const findings = analyze("long-function").filter((f) => f.detector === "long-function");
    assert.equal(findings.length, 1);
    const first = findings[0] as Finding;
    assert.equal(first.line, 1);
    assert.ok(first.removableLines > 50, "reports the function length as removable");
    assert.match(first.cut, /huge/);
  });

  it("flags an oversized file", () => {
    const findings = analyze("oversized").filter((f) => f.detector === "oversized-file");
    assert.equal(findings.length, 1);
    assert.equal((findings[0] as Finding).line, 1);
  });

  it("flags deep nesting", () => {
    const findings = analyze("deep-nesting").filter((f) => f.detector === "deep-nesting");
    assert.ok(findings.length >= 1, "at least one nesting finding");
    assert.ok((findings[0] as Finding).line > 1);
  });

  it("each fixture fires only its own detector family", () => {
    assert.deepEqual(detectors(analyze("commented-out")), ["commented-out-code"]);
    assert.deepEqual(detectors(analyze("todo-debt")), ["todo-debt"]);
    assert.deepEqual(detectors(analyze("deep-nesting")), ["deep-nesting"]);
    assert.deepEqual(detectors(analyze("oversized")), ["oversized-file"]);
  });

  it("does not mistake a control block for a function (self-audit regression)", () => {
    const source = [
      "export function small(items: number[]): number {",
      "  let sum = 0;",
      ...Array.from({ length: 60 }, (_, i) => `  if (items[${i}] > 0) {\n    sum += 1;\n  }`),
      "  return sum;",
      "}",
    ].join("\n");
    const found = (analyzeFile("src/x.ts", source) as readonly Finding[]).filter(
      (f) => f.detector === "long-function",
    );
    assert.equal(found.length, 1, "only the real function is reported, not each if-block");
    assert.match((found[0] as Finding).cut, /small/);
  });

  it("ignores a TODO marker inside a string literal (self-audit regression)", () => {
    const source = 'export const marker = "TODO";\nexport const other = 1; // TODO real one\n';
    const found = (analyzeFile("src/x.ts", source) as readonly Finding[]).filter(
      (f) => f.detector === "todo-debt",
    );
    assert.equal(found.length, 1);
    assert.equal((found[0] as Finding).line, 2);
  });

  it("every finding carries a cut and a replacement", () => {
    for (const name of ["commented-out", "todo-debt", "deep-nesting", "oversized", "long-function"]) {
      for (const finding of analyze(name)) {
        assert.ok(finding.cut.length > 0, `${name}: cut`);
        assert.ok(finding.replacement.length > 0, `${name}: replacement`);
        assert.ok(finding.line >= 1, `${name}: line`);
      }
    }
  });
});

describe("improve ranking", () => {
  const sample: Finding[] = [
    { detector: "todo-debt", value: "low", path: "b.ts", line: 2, cut: "c", replacement: "r", removableLines: 1 },
    { detector: "oversized-file", value: "high", path: "b.ts", line: 1, cut: "c", replacement: "r", removableLines: 10 },
    { detector: "deep-nesting", value: "high", path: "a.ts", line: 9, cut: "c", replacement: "r", removableLines: 10 },
    { detector: "long-function", value: "medium", path: "a.ts", line: 4, cut: "c", replacement: "r", removableLines: 60 },
  ];

  it("orders by value, then removable lines, then location", () => {
    const ranked = rankFindings(sample) as readonly Finding[];
    assert.deepEqual(
      ranked.map((f) => `${f.path}:${f.line}`),
      ["a.ts:9", "b.ts:1", "a.ts:4", "b.ts:2"],
    );
  });

  it("is stable across runs", () => {
    assert.deepEqual(rankFindings(sample), rankFindings(sample));
  });
});

describe("improve argument parsing", () => {
  it("defaults to low min-value and the documented limit", () => {
    const options = parseImproveArgs({});
    assert.equal(options.minValue, "low");
    assert.equal(options.limit, DEFAULT_LIMIT);
    assert.equal(options.diff, false);
  });

  it("accepts target, --diff, --min-value and --limit", () => {
    const options = parseImproveArgs({ target: "src/lib", diff: "true", "min-value": "high", limit: "3" });
    assert.equal(options.target, "src/lib");
    assert.equal(options.diff, true);
    assert.equal(options.minValue, "high");
    assert.equal(options.limit, 3);
  });

  it("ignores nonsense values instead of failing", () => {
    const options = parseImproveArgs({ "min-value": "urgent", limit: "-4" });
    assert.equal(options.minValue, "low");
    assert.equal(options.limit, DEFAULT_LIMIT);
  });
});

describe("improve target resolution", () => {
  const deps = memoryDeps({
    "src/a.ts": fixture("todo-debt"),
    "src/b.js": fixture("clean"),
    "src/logo.png": "binary",
  });

  it("audits supported files in a directory and states why others were skipped", () => {
    const resolved = resolveTargets(deps, "src") as {
      files: string[];
      skipped: { path: string; reason: string }[];
    };
    assert.deepEqual(resolved.files.sort(), ["src/a.ts", "src/b.js"]);
    assert.deepEqual(resolved.skipped, [{ path: "src/logo.png", reason: "unsupported extension" }]);
  });

  it("reports a missing path without throwing", () => {
    const resolved = resolveTargets(deps, "src/nope.ts") as { skipped: { reason: string }[] };
    assert.equal((resolved.skipped[0] as { reason: string }).reason, "not found");
  });
});

describe("improve audit", () => {
  it("skips empty files and records audited line counts", () => {
    const deps = memoryDeps({ "src/a.ts": fixture("todo-debt"), "src/empty.ts": "   \n" });
    const report = auditTargets(deps, parseImproveArgs({ target: "src" }), "/repo") as Report;
    assert.deepEqual(report.skipped, [{ path: "src/empty.ts", reason: "empty" }]);
    assert.equal(report.audited.length, 1);
    assert.ok((report.audited[0] as { lines: number }).lines > 0);
  });

  it("filters by --min-value", () => {
    const deps = memoryDeps({ "src/a.ts": fixture("todo-debt") });
    const all = auditTargets(deps, parseImproveArgs({ target: "src/a.ts" }), "/repo") as Report;
    const high = auditTargets(
      deps,
      parseImproveArgs({ target: "src/a.ts", "min-value": "high" }),
      "/repo",
    ) as Report;
    assert.equal(all.findings.length, 2);
    assert.equal(high.findings.length, 0);
  });

  it("truncates at --limit and reports the remainder", () => {
    const deps = memoryDeps({ "src/a.ts": fixture("commented-out") });
    const report = auditTargets(deps, parseImproveArgs({ target: "src/a.ts", limit: "1" }), "/repo") as Report;
    assert.equal(report.findings.length, 1);
    assert.equal(report.truncated, 1);
  });

  it("errors when given neither a path nor --diff", () => {
    const deps = memoryDeps({});
    assert.throws(
      () => auditTargets(deps, parseImproveArgs({}), "/repo"),
      (error: unknown) => error instanceof ImproveError && /needs a path or --diff/.test((error as Error).message),
    );
  });

  it("--diff audits the changed file list and filters by target prefix", () => {
    const deps = memoryDeps(
      { "src/a.ts": fixture("todo-debt"), "docs/x.ts": fixture("todo-debt") },
      ["src/a.ts", "docs/x.ts", "pnpm-lock.yaml"],
    );
    const all = auditTargets(deps, parseImproveArgs({ diff: "true" }), "/repo") as Report;
    assert.deepEqual(all.audited.map((entry) => entry.path).sort(), ["docs/x.ts", "src/a.ts"]);
    assert.deepEqual(all.skipped, [{ path: "pnpm-lock.yaml", reason: "unsupported extension" }]);

    const scoped = auditTargets(deps, parseImproveArgs({ diff: "true", target: "src" }), "/repo") as Report;
    assert.deepEqual(scoped.audited.map((entry) => entry.path), ["src/a.ts"]);
  });
});

describe("improve rendering", () => {
  it("states the audited scope and the limits of a clean result", () => {
    const deps = memoryDeps({ "src/clean.ts": fixture("clean") });
    const report = auditTargets(deps, parseImproveArgs({ target: "src/clean.ts" }), "/repo") as Report;
    const markdown = renderImproveReport(report) as string;
    assert.match(markdown, /^No findings\. Audited 1 files, 8 lines\.$/m);
    assert.match(markdown, /not a review/, "a clean result must not read as an all-clear");
    assert.ok(!markdown.includes("Not audited:"), "nothing was skipped in this fixture");
  });

  it("renders one row per finding with location, detector, cut and replacement", () => {
    const deps = memoryDeps({ "src/a.ts": fixture("todo-debt") });
    const report = auditTargets(deps, parseImproveArgs({ target: "src/a.ts" }), "/repo") as Report;
    const markdown = renderImproveReport(report) as string;
    const rows = markdown.split("\n").filter((line) => line.startsWith("| [ "));
    assert.equal(rows.length, report.findings.length);
    for (const row of rows) {
      assert.match(row, /src\/a\.ts:\d+/);
      assert.match(row, / -> /);
    }
  });

  it("output is ASCII only and free of emoji", () => {
    const deps = memoryDeps({ "src/a.ts": fixture("commented-out"), "src/logo.png": "x" });
    const report = auditTargets(deps, parseImproveArgs({ target: "src" }), "/repo") as Report;
    const markdown = renderImproveReport(report) as string;
    assert.ok(/^[\x20-\x7E\n]*$/.test(markdown), "ASCII only");
    assert.match(markdown, /Not audited: src\/logo\.png \(unsupported extension\)/);
  });
});

describe("runImprove", () => {
  it("returns markdown plus a totals payload", async () => {
    const deps = memoryDeps({ "src/a.ts": fixture("todo-debt") });
    const result = (await runImprove(ctx, { target: "src/a.ts" }, deps)) as {
      markdown: string;
      data: { totals: { files: number; findings: number }; target: { kind: string } };
    };
    assert.match(result.markdown, /\/bridge-improve/);
    assert.equal(result.data.totals.files, 1);
    assert.equal(result.data.totals.findings, 2);
    assert.equal(result.data.target.kind, "path");
  });

  it("turns a user error into a message, not a throw", async () => {
    const result = (await runImprove(ctx, {}, memoryDeps({}))) as { markdown: string };
    assert.equal(result.markdown, "/improve needs a path or --diff.");
  });

  it("never runs git except for read-only name-only diffs", async () => {
    const calls: string[] = [];
    const deps = memoryDeps({ "src/a.ts": fixture("clean") }, ["src/a.ts"]);
    const spied: Deps = {
      ...deps,
      gitDiffNames: (cwd) => {
        calls.push(`git diff --name-only @ ${cwd}`);
        return deps.gitDiffNames(cwd);
      },
    };
    await runImprove(ctx, { diff: "true" }, spied);
    assert.equal(calls.length, 1);
    assert.match(calls[0] as string, /^git diff --name-only /);
  });
});
