/**
 * Tests for /bridge-compact (src/commands/compact.ts).
 *
 * The host compaction engine and token meter are test doubles passed through
 * the injected context, so no harness process, model call, or session is
 * involved. Doubles record their calls to prove the seam is used exactly once.
 *
 * Coverage:
 *  - grammar: bare, status, steering, over-length rejection
 *  - hook present: before/after token figures, shadow counts, preserved sections
 *  - hook absent: honest instructions, no fabricated compaction
 *  - null result: the verbatim native string users grep for
 *  - status: threshold math, degraded rendering when no window is advertised
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
  DEFAULT_THRESHOLD_RATIO,
  MAX_INSTRUCTIONS_CHARS,
  formatTokens,
  parseCompactMode,
  preservedSections,
  rawInputFromArgs,
  renderStatus,
  runCompact,
} = await import(`${dist}/commands/compact.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const output = await import(`${dist}/lib/output.js`);

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-compact-"));
  cleanupPaths.push(dir);
  return dir;
}

/** Recording double for the native compaction seam. */
interface HookCall {
  readonly instructions: string | undefined;
}

function fakeHooks(options: {
  result?: unknown;
  measurements?: readonly { totalTokens: number; contextWindow?: number }[];
  autoEnabled?: boolean;
  thresholdRatio?: number;
  route?: string;
  omitCompactNow?: boolean;
  measureThrows?: boolean;
}) {
  const calls: HookCall[] = [];
  const series = [...(options.measurements ?? [])];
  const hooks: Record<string, unknown> = {
    measure: () => {
      if (options.measureThrows === true) throw new Error("meter unavailable");
      return series.length > 1 ? series.shift() : series[0];
    },
  };
  if (options.omitCompactNow !== true) {
    hooks["compactNow"] = async (instructions?: string) => {
      calls.push({ instructions });
      return options.result ?? null;
    };
  }
  if (options.autoEnabled !== undefined) hooks["autoEnabled"] = options.autoEnabled;
  if (options.thresholdRatio !== undefined) hooks["thresholdRatio"] = options.thresholdRatio;
  if (options.route !== undefined) hooks["route"] = options.route;
  return { hooks, calls };
}

/** Context carrying the double; every path in the module reads it from here. */
function contextWith(compaction?: Record<string, unknown>) {
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
  return compaction === undefined ? base : { ...base, compaction };
}

const SUMMARY = [
  "<compacted-summary>",
  "## Primary Request and Intent",
  "Implement the compact command.",
  "## Key Technical Concepts",
  "(none)",
  "## Files and Code",
  "src/commands/compact.ts",
  "## Errors and Fixes",
  "(none)",
  "## Pending Jobs",
  "Wire the registry row.",
  "## Current Work",
  "(none)",
  "## Next Step",
  "Run the tests.",
  "## Critical Context",
  "Never fabricate token figures.",
  "</compacted-summary>",
].join("\n");

describe("compact grammar", () => {
  it("treats empty and whitespace-only input as a bare compaction", () => {
    assert.deepEqual(parseCompactMode(""), { kind: "compact", instructions: "" });
    assert.deepEqual(parseCompactMode("   "), { kind: "compact", instructions: "" });
  });

  it("routes exactly 'status' to the read-only mode, any casing", () => {
    for (const input of ["status", "STATUS", "  Status  "]) {
      assert.equal(parseCompactMode(input).kind, "status");
    }
  });

  it("treats 'status of the refactor' as instructions, not status", () => {
    const mode = parseCompactMode("status of the refactor");
    assert.equal(mode.kind, "compact");
    assert.equal(mode.instructions, "status of the refactor");
  });

  it("rejects over-length instructions naming actual and max length", () => {
    const mode = parseCompactMode("x".repeat(MAX_INSTRUCTIONS_CHARS + 1));
    assert.equal(mode.kind, "error");
    assert.match(mode.message, new RegExp(String(MAX_INSTRUCTIONS_CHARS + 1)));
    assert.match(mode.message, new RegExp(String(MAX_INSTRUCTIONS_CHARS)));
  });

  it("reassembles raw input from parsed args", () => {
    assert.equal(rawInputFromArgs({ _: "keep", rest: "the auth notes" }), "keep the auth notes");
    assert.equal(rawInputFromArgs({}), "");
  });
});

describe("compact with a native hook", () => {
  it("calls compactNow exactly once and reports before/after figures", async () => {
    const { hooks, calls } = fakeHooks({
      result: { shadowedSeqs: [1, 2, 3], shadowedTokenCount: 35880, summary: SUMMARY, summarySeq: 1184 },
      measurements: [{ totalTokens: 48210, contextWindow: 128000 }, { totalTokens: 11940, contextWindow: 128000 }],
    });
    const result = await runCompact(contextWith(hooks), {});

    assert.equal(calls.length, 1);
    assert.equal(calls[0].instructions, undefined);
    assert.match(result.markdown, /48,210/);
    assert.match(result.markdown, /11,940/);
    assert.match(result.markdown, /36,270/);
    assert.match(result.markdown, /35,880/);
    assert.equal((result.data as { shadowedItems: number }).shadowedItems, 3);
  });

  it("forwards steering text and labels it best-effort", async () => {
    const { hooks, calls } = fakeHooks({
      result: { shadowedSeqs: [1], shadowedTokenCount: 10, summary: SUMMARY, summarySeq: 9 },
      measurements: [{ totalTokens: 100 }, { totalTokens: 40 }],
    });
    const result = await runCompact(contextWith(hooks), { _: "keep", rest: "the auth decisions" });

    assert.equal(calls[0].instructions, "keep the auth decisions");
    assert.match(result.markdown, /best-effort/);
    assert.match(result.markdown, /the auth decisions/);
  });

  it("returns the native string verbatim when nothing is compactable", async () => {
    const { hooks } = fakeHooks({ result: null, measurements: [{ totalTokens: 5 }] });
    const result = await runCompact(contextWith(hooks), {});
    assert.equal(result.markdown, "No compactable history yet.");
    assert.equal((result.data as { compacted: boolean }).compacted, false);
  });

  it("still reports success when the meter throws", async () => {
    const { hooks } = fakeHooks({
      result: { shadowedSeqs: [1, 2], shadowedTokenCount: 77, summary: SUMMARY, summarySeq: 3 },
      measureThrows: true,
    });
    const result = await runCompact(contextWith(hooks), {});
    assert.match(result.markdown, /items shadowed/);
    assert.match(result.markdown, /unknown/);
    assert.equal((result.data as { compacted: boolean }).compacted, true);
  });

  it("names only the summary sections that came back non-empty", () => {
    const kept = preservedSections(SUMMARY);
    assert.ok(kept.includes("Critical Context"));
    assert.ok(kept.includes("Pending Jobs"));
    assert.ok(!kept.includes("Key Technical Concepts"));
    assert.ok(!kept.includes("Current Work"));
  });

  it("falls back honestly when the summary structure is unrecognized", async () => {
    const { hooks } = fakeHooks({
      result: { shadowedSeqs: [1], shadowedTokenCount: 1, summary: "some other backend format", summarySeq: 2 },
      measurements: [{ totalTokens: 10 }, { totalTokens: 5 }],
    });
    const result = await runCompact(contextWith(hooks), {});
    assert.match(result.markdown, /structure not recognized/);
    assert.deepEqual([...preservedSections(undefined)], []);
  });
});

describe("compact without a native hook", () => {
  it("emits instructions and never claims a compaction happened", async () => {
    const result = await runCompact(contextWith(undefined), {});
    assert.match(result.markdown, /did not expose a compaction hook/);
    assert.match(result.markdown, /\/compact/);
    assert.ok(!/Compacted \d/.test(result.markdown));
    assert.equal((result.data as { hook: string }).hook, "absent");
  });

  it("shows steering text that cannot be forwarded", async () => {
    const { hooks } = fakeHooks({ omitCompactNow: true, measurements: [{ totalTokens: 1 }] });
    const result = await runCompact(contextWith(hooks), { _: "keep", rest: "auth notes" });
    assert.match(result.markdown, /takes no arguments/);
    assert.match(result.markdown, /auth notes/);
  });
});

describe("compact status", () => {
  it("computes the threshold from the window and configured ratio", async () => {
    const { hooks, calls } = fakeHooks({
      measurements: [{ totalTokens: 48210, contextWindow: 128000 }],
      autoEnabled: true,
      route: "deepseek/deepseek-chat",
    });
    const result = await runCompact(contextWith(hooks), { _: "status" });

    assert.equal(calls.length, 0);
    assert.match(result.markdown, /102,400/);
    assert.match(result.markdown, /80%/);
    assert.match(result.markdown, /deepseek\/deepseek-chat/);
    assert.match(result.markdown, /54,190/);
    assert.equal(DEFAULT_THRESHOLD_RATIO, 0.8);
  });

  it("degrades honestly when no window is advertised", () => {
    const { hooks } = fakeHooks({ measurements: [{ totalTokens: 6120 }] });
    const body = renderStatus(hooks);
    assert.match(body, /no adapter advertised a context window/);
    assert.match(body, /cannot be computed without a window/);
    assert.match(body, /unknown \(default: on\)/);
  });

  it("honors an explicit ratio and an auto-off flag", () => {
    const { hooks } = fakeHooks({
      measurements: [{ totalTokens: 1000, contextWindow: 10000 }],
      thresholdRatio: 0.5,
      autoEnabled: false,
    });
    const body = renderStatus(hooks);
    assert.match(body, /5,000/);
    assert.match(body, /50%/);
    assert.match(body, /\| auto-compaction \| off \|/);
  });
});

describe("compact rendering contract", () => {
  it("formats token counts and placeholders without inventing numbers", () => {
    assert.equal(formatTokens(48210), "48,210");
    assert.equal(formatTokens(undefined), "unknown");
    assert.equal(formatTokens(0), "0");
  });

  it("emits no emoji in any rendered surface", async () => {
    const { hooks } = fakeHooks({
      result: { shadowedSeqs: [1], shadowedTokenCount: 5, summary: SUMMARY, summarySeq: 1 },
      measurements: [{ totalTokens: 100, contextWindow: 1000 }, { totalTokens: 20, contextWindow: 1000 }],
    });
    const bodies = [
      (await runCompact(contextWith(hooks), {})).markdown,
      (await runCompact(contextWith(hooks), { _: "status" })).markdown,
      (await runCompact(contextWith(undefined), {})).markdown,
      (await runCompact(contextWith(undefined), { _: "x".repeat(MAX_INSTRUCTIONS_CHARS + 1) })).markdown,
    ];
    for (const body of bodies) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(body), `emoji found: ${body}`);
    }
  });
});
