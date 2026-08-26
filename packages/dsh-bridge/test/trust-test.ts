/**
 * Tests for the /bridge-trust command module (docs/specs/commands/trust.md).
 *
 * Scope for this wave:
 *   1. toSlug            - subject normalization: URL, owner/repo, plain slug.
 *   2. gradeFromCard     - Grade row extraction from committed card markdown.
 *   3. Card rendering    - header + grade + verdict from a fixture card file
 *                          written into a scratch catalog directory.
 *   4. Scan subcommand   - scan-client mock on a temp dir with a benign file
 *                          (no findings) and a file containing eval() (finding
 *                          appears); rendering proven via renderScanSummary,
 *                          plus one real scanner spawn through runTrust.
 *   5. List subcommand   - enumerates available cards.
 *   6. Unreviewed path   - graceful NOT REVIEWED state with queue hint; no grade.
 *
 * The command is exercised through lib/registry.ts so registration wiring is
 * covered too. Run: npm test (this file compiles with the package).
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

// Compiled package under test (mirrors self-test.ts).
const dist = new URL("../src", import.meta.url).pathname;

const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { parseScanReport, resolveScannerEntry, scanDirectory } = await import(`${dist}/lib/scan-client.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const trustModule = await import(`${dist}/commands/trust.js`);

const { gradeFromCard, renderCard, renderScanSummary, toSlug } = trustModule;

interface RunResult {
  readonly markdown: string;
}

/** Pull bridge-trust out of the registry so tests cover the real mount point. */
async function trustRun(args: Readonly<Record<string, string>>): Promise<RunResult> {
  const command = bridgeCommandTable(makeCtx()).find((c: { name: string }) => c.name === "bridge-trust");
  assert.ok(command, "bridge-trust must be registered in the command table");
  return command.run(makeCtx(), args) as Promise<RunResult>;
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

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// 1. Subject normalization
// ---------------------------------------------------------------------------
describe("trust toSlug", () => {
  it("normalizes GitHub URLs and owner/repo forms to a catalog slug", () => {
    assert.equal(toSlug("modlens"), "modlens");
    assert.equal(toSlug("acme/dsh-notion-sync"), "dsh-notion-sync");
    assert.equal(toSlug("https://github.com/acme/dsh-notion-sync"), "dsh-notion-sync");
    assert.equal(toSlug("https://github.com/acme/dsh-notion-sync.git"), "dsh-notion-sync");
    assert.equal(toSlug("github:acme/dsh-notion-sync"), "dsh-notion-sync");
  });
});

// ---------------------------------------------------------------------------
// 2. Grade extraction
// ---------------------------------------------------------------------------
describe("trust gradeFromCard", () => {
  it("reads the bolded Grade row from the header table", () => {
    assert.match(gradeFromCardCard(), /B\+/);
  });

  it("tolerates variants and reports absence as null", () => {
    assert.equal(gradeFromCard("| Grade | **C** |\nrest"), "C");
    assert.equal(gradeFromCard("Grade: B\n"), "B");
    assert.equal(gradeFromCard("# no grade here\n"), null);
  });
});

/** Helper kept tiny: grade out of the fixture card text. */
function gradeFromCardCard(): string {
  return gradeFromCard(FIXTURE_CARD_MARKDOWN) ?? "";
}

// ---------------------------------------------------------------------------
// 3. Card rendering from a fixture card file
// ---------------------------------------------------------------------------
describe("trust <plugin> card rendering", () => {
  it("renders title, grade, header fields, and verdict from a fixture card file", () => {
    const ctx = makeCtx();
    const markdown = renderCard(ctx, "fixture-plugin", FIXTURE_CARD_MARKDOWN);

    assert.ok(markdown.startsWith("### Trust Report Card: fixture-plugin"));
    assert.ok(markdown.includes("TRUST REPORT CARD"));
    assert.match(markdown, /grade:\s+B\+/);
    assert.ok(markdown.includes("| Grade | **B+** |"));
    assert.ok(markdown.includes("**Verdict:** Safe with documented behavior"));
    assert.ok(!markdown.includes("NOT REVIEWED"));
  });

  it("shows the committed modlens card end to end when present locally", async () => {
    const cardsDir = repoCardsDir();
    if (!readdirSyncSafe(cardsDir).includes("modlens.md")) return; // card not committed here yet

    const result = await trustRun({ _: "modlens" });
    assert.ok(result.markdown.includes("TRUST REPORT CARD"));
    assert.match(result.markdown, /grade:\s+B\b/);
    assert.ok(result.markdown.toLowerCase().includes("verdict"));
    assert.ok(!result.markdown.includes("NOT REVIEWED"));
  });
});

// ---------------------------------------------------------------------------
// 4. Scan subcommand
// ---------------------------------------------------------------------------

/** A ScanReport-shaped object, schema dsh-bridge.scan/v1. */
function mockScanReport(target: string, findings: readonly Record<string, unknown>[]): unknown {
  const counts: Record<string, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const finding of findings) counts[finding.severity as string] += 1;
  return {
    schema: "dsh-bridge.scan/v1",
    scannerVersion: "0.0.0-mock",
    rulesDigest: "a".repeat(64),
    ruleIds: findings.map((f) => f.ruleId),
    target,
    stats: { filesScanned: 2, filesSkipped: 0, bytesScanned: 120 },
    grading: {
      grade: findings.length > 0 ? "F" : "A",
      score: findings.length > 0 ? 3 : 97,
      counts,
      caps: [],
      gates: [],
      familiesPresent: [],
    },
    findings,
  };
}

function mockFinding(severity: string, ruleId: string, path: string): Record<string, unknown> {
  return {
    id: `${ruleId}-1`,
    ruleId,
    family: ruleId.split("-")[0],
    severity,
    message: `${ruleId} fired`,
    path,
    line: 1,
    col: 1,
    excerpt: "excerpt",
    excerptSha256: "x",
    confidence: 0.9,
  };
}

describe("trust scan (scan-client mock)", () => {
  it("renders a clean report without claiming safety", () => {
    const report = parseScanReport(mockScanReport("clean-target", []));
    const markdown = renderScanSummary(makeCtx(), "clean-target", report);

    assert.ok(markdown.includes("### Scan summary"));
    assert.match(markdown, /grade:\s+A\b/);
    assert.ok(markdown.includes("No findings in scanned surface."));
    assert.ok(!markdown.includes("[CRITICAL]"), "a clean scan never prints a critical badge");
    assert.ok(!markdown.includes("| SEVERITY | COUNT |"), "no all-zero counts table on a clean scan");
  });

  it("orders mixed-severity findings worst-first with badges", () => {
    const report = parseScanReport(
      mockScanReport("dirty-target", [mockFinding("low", "NET-001", "a.js"), mockFinding("critical", "EXEC-001", "b.js")]),
    );
    const markdown = renderScanSummary(makeCtx(), "dirty-target", report);

    assert.ok(markdown.indexOf("[CRITICAL]") !== -1, "worst finding must be badged");
    assert.ok(markdown.indexOf("[CRITICAL]") < markdown.indexOf("[ LOW ]"), "sorted worst-first");
    assert.ok(markdown.includes("Top findings:"));
    assert.match(markdown, /\|\s*\[CRITICAL\]\s*\|\s*1\s*\|/, "severity counts render as a table");
    assert.ok(!markdown.includes("[ HIGH ]"), "severities that never fired are not listed");
  });
});

describe("trust scan against temp dirs (real scanner boundary)", () => {
  const scannerEntry = resolveScannerEntry();

  function scannerAvailable(): boolean {
    try {
      statSync(scannerEntry);
      return true;
    } catch {
      return false;
    }
  }

  it("reports zero findings for a benign file", { timeout: 60_000 }, async (t) => {
    if (!scannerAvailable()) {
      t.skip(`tools/scan dist not built at ${scannerEntry}`);
      return;
    }
    const dir = scratchDir("dshb-trust-clean-");
    writeFileSync(join(dir, "benign.js"), "export const greeting = 'hello world';\n", "utf8");

    const outcome = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.report.findings.length, 0);
  });

  it("surfaces a finding for a file containing eval()", { timeout: 60_000 }, async (t) => {
    if (!scannerAvailable()) {
      t.skip(`tools/scan dist not built at ${scannerEntry}`);
      return;
    }
    const dir = scratchDir("dshb-trust-dirty-");
    writeFileSync(
      join(dir, "sneaky.js"),
      "const handler = (input) => eval(input);\nmodule.exports = { handler };\n",
      "utf8",
    );

    const outcome = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
    assert.ok(outcome.report.findings.length >= 1, "eval must produce at least one finding");

    const rendered = renderScanSummary(makeCtx(), dir, outcome.report);
    assert.ok(rendered.includes("Top findings:"));
    assert.match(rendered, /\[CRITICAL\]|\[ HIGH \]/);
    assert.ok(rendered.includes("sneaky.js"));
  });

  it("runs end to end through the registry mount on a clean temp dir", { timeout: 60_000 }, async (t) => {
    if (!scannerAvailable()) {
      t.skip(`tools/scan dist not built at ${scannerEntry}`);
      return;
    }
    const dir = scratchDir("dshb-trust-e2e-");
    writeFileSync(join(dir, "ok.js"), "const add = (a, b) => a + b;\nexport default add;\n", "utf8");

    const result = await trustRun({ _: "scan", rest: dir });
    assert.ok(result.markdown.includes("No findings in scanned surface."));
    assert.ok(result.markdown.includes(dir));
  });
});

// ---------------------------------------------------------------------------
// 5. List subcommand
// ---------------------------------------------------------------------------
describe("trust list", () => {
  it("enumerates available cards from the local catalog", async () => {
    const files = readdirSyncSafe(repoCardsDir());
    const result = await trustRun({ _: "list" });

    if (files.includes("modlens.md")) {
      assert.match(result.markdown, /\|\s*modlens\s*\|\s*B\s*\|/);
      assert.ok(result.markdown.startsWith("### Reviewed plugins"));
    } else {
      assert.ok(result.markdown.includes("No trust cards found locally."));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Unreviewed path + usage
// ---------------------------------------------------------------------------
describe("trust unreviewed and usage states", () => {
  it("never fabricates a grade for an unreviewed plugin (spec criterion 3)", async () => {
    const result = await trustRun({ _: "some-random-plugin" });
    assert.ok(result.markdown.includes("NOT REVIEWED"));
    assert.ok(result.markdown.includes("/bridge-trust queue some-random-plugin"), "queue hint required");
    assert.ok(!/\bgrade[^\n]{0,20}\b[ABCD][+-]\b/i.test(result.markdown), "no letter grade may appear");
    assert.ok(!result.markdown.includes("[CRITICAL]"));
  });

  it("prints usage when invoked bare", async () => {
    const result = await trustRun({});
    assert.ok(result.markdown.includes("Usage: /bridge-trust"));
  });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const FIXTURE_CARD_MARKDOWN: string = [
  "# Trust Report Card: fixture-plugin",
  "",
  "## 1. Header",
  "",
  "| Field | Value |",
  "|---|---|",
  "| Plugin | `fixture-plugin` (example plugin used by tests) |",
  "| Pinned subject | github:acme/fixture-plugin @ commit `abc123` |",
  "| License | MIT (LICENSE:1-3) |",
  "| Audited | 2026-08-25 by dsh-bridge trust worker (scanner 0.1.0) |",
  "| Grade | **B+** |",
  "",
  "Disclaimer: a grade is an evidence-backed opinion over one pinned artifact.",
  "",
  "## 2. Verdict in one sentence",
  "",
  "Safe with documented behavior: egress goes only to the named vendor endpoint.",
  "",
].join("\n");

/** Repo cards dir as seen by compiled code; used only to detect optional fixtures. */
function repoCardsDir(): string {
  // dist/test -> dist -> package -> packages -> repo
  return join(new URL("../src", import.meta.url).pathname, "..", "..", "..", "..", "docs", "catalog", "cards");
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
