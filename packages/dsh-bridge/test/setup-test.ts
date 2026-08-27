/**
 * Tests for /bridge-setup (docs/specs/commands/setup.md).
 *
 * Covered: state persistence across invocations, resume mid-flow, skip paths,
 * the first-harness vs migrant branch, the no-credentials route path, and the
 * recommendation join. Every test runs against an injected SetupIo backed by
 * a scratch directory or an in-memory map, so no suite touches $HOME.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { card, table } = await import(`${dist}/lib/output.js`);
const setupModule = await import(`${dist}/commands/setup.js`);

const {
  SETUP_STEPS,
  applyAnswer,
  collectHealth,
  connectedProviders,
  detectFamiliar,
  isSkip,
  loadState,
  nextStep,
  nodeSetupIo,
  parseAnswer,
  readDshVersion,
  recommendPlugins,
  runSetup,
  saveState,
  setupStatePath,
  stepNumber,
} = setupModule as typeof import("../src/commands/setup.js");

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "dshb-setup-"));
  cleanupPaths.push(dir);
  return dir;
}

/** In-memory SetupIo double; `dirs` are paths that exist but hold no content. */
function memIo(files: Record<string, string> = {}, dirs: readonly string[] = []) {
  const present = new Set([...Object.keys(files), ...dirs]);
  return {
    exists: (path: string) => present.has(path),
    readFile: (path: string) => {
      const value = files[path];
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    writeFile: (path: string, contents: string) => {
      files[path] = contents;
      present.add(path);
    },
    listDir: () => [],
  };
}

function makeCtx(home = "/home/u") {
  return makeBridgeContext({
    profile: "web",
    paths: {
      home,
      dshHome: `${home}/.dsh`,
      profilePatch: `${home}/.dsh/profiles/web/cordis.patch.yml`,
      profilePackageJson: `${home}/.dsh/profiles/web/package.json`,
    },
    output: { table, card, badge: () => "" },
  });
}

/** Env with no provider credentials at all. */
const EMPTY_ENV: Readonly<Record<string, string | undefined>> = Object.freeze({});

type StepData = {
  step: string;
  stepNumber: number;
  totalSteps: number;
  answers: Record<string, string>;
  skipped: string[];
  persisted: boolean;
  statePath: string;
  recommendations: readonly { name: string; grade: string | null }[];
};

function dataOf(result: { data?: unknown }): StepData {
  return result.data as StepData;
}

describe("step table", () => {
  it("has seven steps in the documented order", () => {
    assert.deepEqual([...SETUP_STEPS], ["welcome", "harness", "route", "health", "import", "recommend", "done"]);
    assert.equal(stepNumber("welcome"), 1);
    assert.equal(stepNumber("done"), 7);
  });

  it("treats done as terminal", () => {
    assert.equal(nextStep("recommend"), "done");
    assert.equal(nextStep("done"), "done");
  });

  it("recognizes every documented skip word", () => {
    for (const word of ["skip", "SKIP", " later ", "no thanks"]) assert.equal(isSkip(word), true);
    assert.equal(isSkip("yes"), false);
    assert.equal(isSkip("skipper"), false);
  });

  it("joins the _/rest args convention into one answer", () => {
    assert.equal(parseAnswer({ _: "python", rest: "data pipelines" }), "python data pipelines");
    assert.equal(parseAnswer({}), "");
  });
});

describe("state persistence", () => {
  it("writes state to ~/.dsh-bridge/setup-state.json and reads it back", () => {
    const home = scratchHome();
    const io = nodeSetupIo();
    const path = setupStatePath(home);
    assert.ok(path.endsWith(join(".dsh-bridge", "setup-state.json")));

    const now = new Date("2026-01-01T00:00:00.000Z");
    const state = { version: 1, step: "route" as const, answers: { harness: "migrant" }, skipped: ["welcome"], startedAt: now.toISOString(), updatedAt: now.toISOString() };
    assert.equal(saveState(io, path, state), true);

    const loaded = loadState(io, path, now);
    assert.equal(loaded.step, "route");
    assert.equal(loaded.answers["harness"], "migrant");
    assert.deepEqual([...loaded.skipped], ["welcome"]);
  });

  it("starts fresh on a missing, malformed, or wrong-version file", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const path = "/home/u/.dsh-bridge/setup-state.json";

    assert.equal(loadState(memIo({}), path, now).step, "welcome");
    assert.equal(loadState(memIo({ [path]: "{not json" }), path, now).step, "welcome");
    assert.equal(loadState(memIo({ [path]: JSON.stringify({ version: 99, step: "done" }) }), path, now).step, "welcome");
    assert.equal(loadState(memIo({ [path]: JSON.stringify({ version: 1, step: "nope" }) }), path, now).step, "welcome");
  });

  it("reports a failed write rather than throwing", () => {
    const io = { ...memIo(), writeFile: () => { throw new Error("EROFS"); } };
    const state = loadState(io, "/x", new Date());
    assert.equal(saveState(io, "/x", state), false);
  });

  it("persists progress across separate runSetup invocations", async () => {
    const home = scratchHome();
    const ctx = makeCtx(home);
    const io = nodeSetupIo();
    const opts = { io, env: EMPTY_ENV, now: new Date("2026-01-01T00:00:00.000Z") };

    const first = dataOf(await runSetup(ctx, {}, opts));
    assert.equal(first.step, "welcome");
    assert.equal(first.persisted, true);

    const second = dataOf(await runSetup(ctx, { _: "yes" }, opts));
    assert.equal(second.step, "harness");

    // A brand-new io instance proves the progress came off disk.
    const third = dataOf(await runSetup(ctx, { _: "first" }, { ...opts, io: nodeSetupIo() }));
    assert.equal(third.step, "route");
    assert.equal(third.answers["harness"], "first");
  });
});

describe("resume mid-flow", () => {
  it("re-renders the step the user stopped on", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo({
      [path]: JSON.stringify({
        version: 1,
        step: "import",
        answers: { welcome: "yes", harness: "migrant", route: "deepseek", health: "yes" },
        skipped: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    }, [`${home}/.claude`]);

    const result = await runSetup(makeCtx(home), {}, { io, env: EMPTY_ENV });
    const data = dataOf(result);
    assert.equal(data.step, "import");
    assert.equal(data.stepNumber, 5);
    assert.equal(data.totalSteps, 7);
    assert.match(result.markdown, /step 5 of 7/);
    assert.equal(data.answers["harness"], "migrant");
  });

  it("--reset walks the flow from the top again", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo({
      [path]: JSON.stringify({ version: 1, step: "done", answers: { harness: "first" }, skipped: [], startedAt: "x", updatedAt: "x" }),
    });
    const data = dataOf(await runSetup(makeCtx(home), { reset: "" }, { io, env: EMPTY_ENV }));
    assert.equal(data.step, "welcome");
    assert.deepEqual(data.answers, {});
  });
});

describe("skip paths", () => {
  it("records every skipped step and reports them in the summary", async () => {
    const home = "/home/u";
    const io = memIo();
    const ctx = makeCtx(home);
    const opts = { io, env: EMPTY_ENV };

    await runSetup(ctx, {}, opts);
    for (const _ of SETUP_STEPS.slice(0, 6)) {
      await runSetup(ctx, { _: "skip" }, opts);
    }
    const final = await runSetup(ctx, {}, opts);
    const data = dataOf(final);
    assert.equal(data.step, "done");
    assert.deepEqual([...data.skipped], ["welcome", "harness", "route", "health", "import", "recommend"]);
    assert.match(final.markdown, /steps skipped/);
    assert.equal(data.recommendations.length, 0);
  });

  it("offers skip on every question it asks", async () => {
    const home = "/home/u";
    const io = memIo();
    const ctx = makeCtx(home);
    const opts = { io, env: EMPTY_ENV };
    for (let index = 0; index < 6; index += 1) {
      const result = await runSetup(ctx, index === 0 ? {} : { _: "yes" }, opts);
      assert.match(result.markdown, /`skip`|Type `skip`/);
      assert.match(result.markdown, /default: /);
    }
  });

  it("stays on done when answered again", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo({ [path]: JSON.stringify({ version: 1, step: "done", answers: {}, skipped: [], startedAt: "x", updatedAt: "x" }) });
    const data = dataOf(await runSetup(makeCtx(home), { _: "yes" }, { io, env: EMPTY_ENV }));
    assert.equal(data.step, "done");
  });
});

describe("harness check", () => {
  it("reads a DSH version from the profile manifest when one is recorded", () => {
    const path = "/home/u/.dsh/profiles/web/package.json";
    assert.equal(readDshVersion(memIo({ [path]: JSON.stringify({ dshVersion: "4.0.1" }) }), path), "4.0.1");
    assert.equal(readDshVersion(memIo({ [path]: JSON.stringify({ dependencies: { "@deepseek-ai/deepseek-harness": "^4.2.0" } }) }), path), "^4.2.0");
    assert.equal(readDshVersion(memIo({ [path]: "{broken" }), path), null);
    assert.equal(readDshVersion(memIo({}), path), null);
  });

  it("detects familiar harness directories and what each can offer", () => {
    const home = "/home/u";
    const io = memIo(
      {
        [`${home}/.claude/CLAUDE.md`]: "# notes",
        [`${home}/.claude.json`]: "{}",
        [`${home}/.config/opencode/opencode.json`]: "{}",
      },
      [`${home}/.claude`, `${home}/.config/opencode`],
    );
    const found = detectFamiliar(io, home);
    assert.deepEqual(found.map((entry) => entry.name), ["Claude Code", "OpenCode"]);
    assert.deepEqual([...(found[0]?.offers ?? [])], ["mcp", "memory"]);
    assert.deepEqual([...(found[1]?.offers ?? [])], ["mcp"]);
  });

  it("branches the copy for a first harness", async () => {
    const home = "/home/u";
    const ctx = makeCtx(home);
    const io = memIo();
    const opts = { io, env: EMPTY_ENV };
    await runSetup(ctx, {}, opts);
    const harnessStep = await runSetup(ctx, { _: "yes" }, opts);
    assert.match(harnessStep.markdown, /fresh start/);
    assert.match(harnessStep.markdown, /default: first/);
  });

  it("branches the copy for a migrant", async () => {
    const home = "/home/u";
    const ctx = makeCtx(home);
    const io = memIo({ [`${home}/.codex/config.toml`]: "" }, [`${home}/.codex`]);
    const opts = { io, env: EMPTY_ENV };
    await runSetup(ctx, {}, opts);
    const harnessStep = await runSetup(ctx, { _: "yes" }, opts);
    assert.match(harnessStep.markdown, /Codex CLI/);
    assert.match(harnessStep.markdown, /default: migrant/);
  });
});

describe("model route", () => {
  it("walks a user with no credentials through getting one", async () => {
    const home = scratchHome();
    const ctx = makeCtx(home);
    const io = nodeSetupIo();
    const opts = { io, env: EMPTY_ENV };
    await runSetup(ctx, {}, opts);
    await runSetup(ctx, { _: "yes" }, opts);
    const routeStep = await runSetup(ctx, { _: "first" }, opts);
    assert.equal(dataOf(routeStep).step, "route");
    assert.match(routeStep.markdown, /platform\.deepseek\.com/);
    assert.match(routeStep.markdown, /A route is the line of config/);
    assert.match(routeStep.markdown, /never the key itself/);
    assert.doesNotMatch(routeStep.markdown, /apply deepseek --apply\`\.$/);
  });

  it("offers the detected provider when a credential exists", async () => {
    const home = scratchHome();
    const ctx = makeCtx(home);
    const io = nodeSetupIo();
    const env = { DEEPSEEK_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz" };
    const opts = { io, env };
    await runSetup(ctx, {}, opts);
    await runSetup(ctx, { _: "yes" }, opts);
    const routeStep = await runSetup(ctx, { _: "first" }, opts);
    assert.match(routeStep.markdown, /deepseek/);
    assert.match(routeStep.markdown, /bridge-connect apply deepseek/);
    // The key value itself never appears; only the mask may.
    assert.doesNotMatch(routeStep.markdown, /abcdefghijklmnop/);
  });

  it("selects only known providers from the matrix", () => {
    const rows = [
      { provider: "deepseek", source: "$DEEPSEEK_API_KEY", status: "found" as const, detail: "-" },
      { provider: "deepseek", source: "dup", status: "found" as const, detail: "-" },
      { provider: "anthropic", source: "x", status: "expired" as const, detail: "-" },
      { provider: "any", source: "~/.dsh/.env", status: "found" as const, detail: "-" },
    ];
    assert.deepEqual([...connectedProviders(rows)], ["deepseek"]);
  });
});

describe("health and import", () => {
  it("reports each managed item as ready or not set up", () => {
    const home = "/home/u";
    const ctx = makeCtx(home);
    const findings = collectHealth(memIo({ [`${home}/.dsh-bridge/memory.md`]: "# m" }), ctx);
    assert.deepEqual(findings.map((finding) => finding.ok), [false, true, false]);
    assert.equal(findings.every((finding) => finding.detail.length > 0), true);
  });

  it("skips the import step honestly when nothing is importable", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo({ [path]: JSON.stringify({ version: 1, step: "import", answers: { harness: "first" }, skipped: [], startedAt: "x", updatedAt: "x" }) });
    const result = await runSetup(makeCtx(home), {}, { io, env: EMPTY_ENV });
    assert.match(result.markdown, /nothing to carry over/);
    assert.match(result.markdown, /default: skip/);
  });

  it("names the import commands when a familiar harness exists", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo(
      { [path]: JSON.stringify({ version: 1, step: "import", answers: { harness: "migrant" }, skipped: [], startedAt: "x", updatedAt: "x" }), [`${home}/.claude/CLAUDE.md`]: "#" },
      [`${home}/.claude`],
    );
    const result = await runSetup(makeCtx(home), {}, { io, env: EMPTY_ENV });
    assert.match(result.markdown, /bridge-mcp import/);
    assert.match(result.markdown, /bridge-memory import/);
  });
});

describe("plugin recommendations", () => {
  const entries = [
    { name: "ts-helper", repo: "acme/ts-helper", category: "dev", stars: 10, description: "TypeScript refactoring helpers. Extra detail.", descriptionZh: "" },
    { name: "py-data", repo: "acme/py-data", category: "dev", stars: 5, description: "Python data pipeline tools.", descriptionZh: "" },
    { name: "bad-one", repo: "acme/bad-one", category: "dev", stars: 1, description: "Python data exfiltration.", descriptionZh: "" },
  ];

  it("prefers graded entries, drops F, and carries a one-line verdict", () => {
    const grades = new Map([["acme/py-data", "A"], ["acme/bad-one", "F"]]);
    const picks = recommendPlugins(entries, grades, "python data pipelines");
    assert.equal(picks.some((pick) => pick.name === "bad-one"), false);
    assert.equal(picks[0]?.name, "py-data");
    assert.equal(picks[0]?.grade, "A");
    assert.equal(picks[0]?.verdict, "Python data pipeline tools.");
    assert.equal(picks[0]?.install, "/bridge-install py-data");
  });

  it("returns nothing when the interest matches nothing", () => {
    assert.equal(recommendPlugins(entries, new Map(), "quantum knitting").length, 0);
  });

  it("renders matched plugins with grades on the done step", async () => {
    const home = "/home/u";
    const path = setupStatePath(home);
    const io = memIo({ [path]: JSON.stringify({ version: 1, step: "recommend", answers: { harness: "first" }, skipped: [], startedAt: "x", updatedAt: "x" }) });
    const result = await runSetup(makeCtx(home), { _: "python", rest: "data" }, { io, env: EMPTY_ENV });
    assert.equal(dataOf(result).step, "done");
    assert.match(result.markdown, /step 7 of 7/);
    assert.match(result.markdown, /bridge-help/);
  });
});

describe("state machine transitions", () => {
  it("records the answer against the step that asked it", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const start = loadState(memIo(), "/none", now);
    const afterWelcome = applyAnswer(start, "yes", now);
    assert.equal(afterWelcome.step, "harness");
    assert.equal(afterWelcome.answers["welcome"], "yes");
    const afterSkip = applyAnswer(afterWelcome, "skip", now);
    assert.deepEqual([...afterSkip.skipped], ["harness"]);
  });
});

describe("output hygiene", () => {
  it("contains no emoji anywhere in the flow", async () => {
    const home = "/home/u";
    const ctx = makeCtx(home);
    const io = memIo();
    const opts = { io, env: EMPTY_ENV };
    const bodies: string[] = [];
    bodies.push((await runSetup(ctx, {}, opts)).markdown);
    for (const answer of ["yes", "first", "skip", "yes", "skip", "typescript"]) {
      bodies.push((await runSetup(ctx, { _: answer }, opts)).markdown);
    }
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const body of bodies) assert.equal(emoji.test(body), false, body.slice(0, 80));
    assert.equal(bodies.length, 7);
  });
});
