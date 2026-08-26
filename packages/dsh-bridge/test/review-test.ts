/**
 * Tests for the /bridge-review command module (docs/specs/commands/review.md),
 * MVP slice: target resolution, read-only git invocation through an ExecFn
 * double, numstat summarization with skip classification, secret-location
 * reporting (locations only), and the structured prompt rendering. No real
 * subprocess is spawned except one real-git smoke test, which is skipped
 * when git is unavailable.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { table } = await import(`${dist}/lib/output.js`);
const reviewModule = await import(`${dist}/commands/review.js`);
type ExecFn = import("../src/commands/review.js").ExecFn;

const {
  classifyFile,
  diffArgv,
  findSecretLocations,
  parseNumstat,
  renderReviewPrompt,
  resolveReviewTarget,
  runReview,
  summarizeDiff,
  MAX_CHANGED_LINES,
} = reviewModule as typeof import("../src/commands/review.js");

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, {recursive: true, force: true});
});

function makeCtx() {
  return makeBridgeContext({
    profile: "web",
    paths: {home: "/home/u", dshHome: "/home/u/.dsh", profilePatch: "/home/u/.dsh/profiles/web/cordis.patch.yml", profilePackageJson: "/home/u/.dsh/profiles/web/package.json"},
    output: {table, card: () => "", badge: () => ""},
  });
}

/** ExecFn double driven by a scripted map; records every call. */
function fakeExec(script: (command: string, args: readonly string[]) => {stdout?: string; stderr?: string; status?: number}) {
  const calls: {command: string; args: string[]}[] = [];
  const fn = (command: string, args: readonly string[]) => {
    calls.push({command, args: [...args]});
    const out = script(command, args);
    return {stdout: out.stdout ?? "", stderr: out.stderr ?? "", status: out.status ?? 0};
  };
  return {fn: fn as ExecFn, calls};
}

// ---------------------------------------------------------------------------
// Target resolution and argv construction
// ---------------------------------------------------------------------------

describe("review resolveReviewTarget", () => {
  it("maps flags to the spec's target forms", () => {
    assert.deepEqual(resolveReviewTarget({}, []), {kind: "worktree"});
    assert.deepEqual(resolveReviewTarget({"staged": ""}, []), {kind: "staged"});
    assert.deepEqual(resolveReviewTarget({"base": "main"}, []), {kind: "base", base: "main"});
    assert.deepEqual(resolveReviewTarget({}, ["src/auth"]), {kind: "worktree", path: "src/auth"});
    assert.deepEqual(resolveReviewTarget({"staged": ""}, ["src/auth"]), {kind: "staged", path: "src/auth"});
  });

  it("builds strictly read-only diff argv for each target kind", () => {
    assert.deepEqual(diffArgv({kind: "worktree"}), ["--no-pager", "diff", "HEAD", "--numstat"]);
    assert.deepEqual(diffArgv({kind: "staged"}), ["--no-pager", "diff", "--cached", "--numstat"]);
    assert.deepEqual(diffArgv({kind: "base", base: "main"}), ["--no-pager", "diff", "main...HEAD", "--numstat"]);
    for (const argv of [diffArgv({kind: "worktree"}), diffArgv({kind: "staged"})]) {
      assert.ok(!argv.some((token) => /^(--output|--apply|-p|-u$)/.test(token)), `no mutating flags in ${String(argv)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Numstat parsing + skip classification + summary
// ---------------------------------------------------------------------------

describe("review numstat + classification", () => {
  it("parses numstat rows including binary markers", () => {
    const rows = parseNumstat("10\t2\tsrc/a.ts\n-\t-\tassets/logo.png\n0\t5\tpnpm-lock.yaml");
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {added: 10, removed: 2, file: "src/a.ts", binary: false});
    assert.equal(rows[1]?.binary, true);
  });

  it("classifies lockfiles, binaries, and generated paths as skipped", () => {
    assert.equal(classifyFile("pnpm-lock.yaml"), "lockfile");
    assert.equal(classifyFile("package-lock.json"), "lockfile");
    assert.equal(classifyFile("hero.png"), "binary");
    assert.equal(classifyFile("dist/index.js"), "generated");
    assert.equal(classifyFile("src/session.ts"), "review");
  });

  it("summarizes reviewed vs skipped and enforces the changed-line budget", () => {
    const rows = [
      {added: 100, removed: 10, file: "src/big.ts", binary: false},
      {added: 0, removed: 0, file: "pnpm-lock.yaml", binary: false},
      {added: 0, removed: 0, file: "img.png", binary: true},
    ];
    const summary = summarizeDiff(rows);
    assert.equal(summary.files, 1);
    assert.equal(summary.added, 100);
    assert.equal(summary.removed, 10);
    assert.deepEqual(
      summary.skipped.map((skip) => [skip.file, skip.reason]),
      [
        ["pnpm-lock.yaml", "lockfile"],
        ["img.png", "binary"],
      ],
    );

    const overBudget = summarizeDiff(
      Array.from({length: 40}, (_, i) => ({added: 50, removed: 0, file: `src/f${i}.ts`, binary: false})),
      500,
    );
    assert.ok(overBudget.truncated);
    assert.ok(overBudget.skipped.length > 0);
    assert.equal(MAX_CHANGED_LINES, 1500);
  });
});

// ---------------------------------------------------------------------------
// Secret location scan (never values)
// ---------------------------------------------------------------------------

describe("review findSecretLocations", () => {
  it("reports added-line locations only and never echoes the value", () => {
    const body = [
      "diff --git a/src/auth.ts b/src/auth.ts",
      "--- a/src/auth.ts",
      "+++ b/src/auth.ts",
      "@@ -1,3 +1,4 @@",
      " const token = process.env.T;",
      "+const apiKey = 'sk-proj123456789abcdefgh';",
      "+const retries = 3;",
      " export {}",
    ].join("\n");
    const hits = findSecretLocations(body);
    assert.deepEqual(hits, [["src/auth.ts", 3]]);
  });

  it("ignores context lines and keys that merely mention env vars", () => {
    const body = [
      "+const GITHUB_TOKEN = process.env.GITHUB_TOKEN;",
      "-const old = 'ghp_removednotasecret12345';",
    ].join("\n");
    // The added line reads the variable by name; no literal credential value.
    assert.deepEqual(findSecretLocations(body), []);
  });
});

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

describe("review renderReviewPrompt", () => {
  it("renders rubric axes in priority order with severity ladder and rules", () => {
    const prompt = renderReviewPrompt(
      {kind: "worktree"},
      {files: 2, added: 30, removed: 4, skipped: [{file: "pnpm-lock.yaml", reason: "lockfile"}], reviewedFiles: ["src/a.ts", "src/b.ts"], truncated: false},
      ["AGENTS.md"],
    );
    const correctnessAt = prompt.indexOf("Correctness - ");
    const securityAt = prompt.indexOf("Security - ");
    const readabilityAt = prompt.indexOf("Readability & conventions - ");
    assert.ok(correctnessAt >= 0 && securityAt > correctnessAt && readabilityAt > securityAt, "rubric order preserved");
    assert.match(prompt, /blocker.*do not merge/s);
    assert.match(prompt, /cites file:line/);
    assert.match(prompt, /Not reviewed|skipped/);
    assert.match(prompt, /AGENTS\.md/);
    assert.match(prompt, /working tree vs HEAD/);
  });
});

// ---------------------------------------------------------------------------
// Command runner through the exec double
// ---------------------------------------------------------------------------

describe("review runner (exec double)", () => {
  it("errors cleanly outside a git repo per the spec message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dshb-review-nogit-"));
    cleanupPaths.push(dir);
    const {fn} = fakeExec(() => ({status: 128, stderr: "fatal: not a git repository"}));
    const result = await runReview(makeCtx(), {}, {exec: fn, cwd: dir});
    assert.match(result.markdown, /needs a git repository/);
  });

  it("reports an empty diff with the --base/--staged hint and runs nothing else", async () => {
    const {fn, calls} = fakeExec((command) => (command === "git" ? {status: 0, stdout: ""} : {status: 1}));
    const result = await runReview(makeCtx(), {}, {exec: fn});
    assert.match(result.markdown, /No changes to review/);
    assert.match(result.markdown, /--base main or --staged/);
    assert.equal(calls.filter((call) => call.command === "git").length, 2);
  });

  it("summarizes a dirty worktree, skips generated files, renders the prompt, notes cross-model", async () => {
    const numstatOut = "42\t7\tsrc/session.ts\n3\t0\tsrc/util.ts\n-\t-\tpnpm-lock.yaml\n12\t2\tdist/bundle.js\n";
    let diffArgsSeen: string[] | undefined;
    const {fn, calls} = fakeExec((command, args) => {
      if (command !== "git") return {status: 1};
      if (args.includes("rev-parse")) return {status: 0};
      diffArgsSeen = [...args];
      return {status: 0, stdout: numstatOut};
    });
    const result = await runReview(makeCtx(), {}, {exec: fn});
    assert.ok(diffArgsSeen?.includes("HEAD"), `expected worktree diff, got ${String(diffArgsSeen)}`);
    assert.match(result.markdown, /\+45/);
    assert.match(result.markdown, /-7/);
    assert.match(result.markdown, /NOT REVIEWED/);
    assert.match(result.markdown, /lockfile/);
    assert.match(result.markdown, /```markdown/);
    assert.match(result.markdown, /Correctness/);
    assert.match(result.markdown, /second-opinion/);
    // Repo probe + one diff, plus read-only convention file checks. Every
    // exec'd command is either git (read flags only) or `test -f` (no side effects).
    assert.ok(calls.length >= 2);
    assert.ok(calls.every((call) => call.command === "git" || call.command === "test"));
    assert.equal(calls[0]?.command, "git");
    assert.equal(calls[1]?.command, "git");
  });

  it("--staged targets the cached diff and empty staged output gets its hint", async () => {
    const {fn} = fakeExec((_command, args) => {
      if (args.includes("rev-parse")) return {status: 0};
      if (args.includes("--cached")) return {status: 0}; // empty staged diff
      return {status: 0, stdout: "5\t1\tsrc/x.ts"};
    });
    const result = await runReview(makeCtx(), {"staged": ""}, {exec: fn});
    assert.match(result.markdown, /Nothing staged/);
  });

  it("surfaces git failures as one-line errors instead of stack traces", async () => {
    const {fn} = fakeExec((_command, args) =>
      args.includes("rev-parse") ? {status: 0} : {status: 129, stderr: "fatal: bad revision 'nope'"},
    );
    const result = await runReview(makeCtx(), {"base": "nope"}, {exec: fn});
    assert.match(result.markdown, /git diff failed: fatal: bad revision 'nope'/);
  });
});

// ---------------------------------------------------------------------------
// Real git boundary (skipped when git is missing)
// ---------------------------------------------------------------------------

describe("review against a real scratch git repo", () => {
  function gitAvailable(): boolean {
    try {
      execFileSync("git", ["--version"], {stdio: "ignore"});
      return true;
    } catch {
      return false;
    }
  }

  it("reviews a seeded working-tree change end to end, read-only", {timeout: 30_000}, async (t) => {
    if (!gitAvailable()) {
      t.skip("git not on PATH");
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "dshb-review-real-"));
    cleanupPaths.push(dir);
    const run = (...args: string[]) => spawnSync("git", args, {cwd: dir, encoding: "utf8"});
    run("init", "-q");
    run("config", "user.email", "test@example.com");
    run("config", "user.name", "test");
    writeFileSync(`${dir}/app.ts`, "export const x = 1;\n");
    run("add", ".");
    run("commit", "-qm", "init");
    writeFileSync(`${dir}/app.ts`, "export const x = 1;\nexport const y = 2;\n");

    const result = await runReview(makeCtx(), {}, {cwd: dir});
    assert.match(result.markdown, /worktree|HEAD/);
    assert.match(result.markdown, /```markdown/);
    assert.match(result.markdown, /app\.ts/);
  });
});
