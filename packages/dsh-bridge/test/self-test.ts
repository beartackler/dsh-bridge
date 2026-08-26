/**
 * Self-test (node:test, no external runner) for the dsh-bridge plugin package.
 *
 * Scope: basic contracts per module, per the phase-1 task.
 *   1. types.ts       - severity/status vocabularies match the specs they mirror.
 *   2. output.ts      - markdown helpers: tables, cards, badges; ASCII only; no emoji.
 *   3. paths.ts       - detection-matrix paths, env expansion, metadata-only probes
 *                       (symlink refusal, size cap, mask shape), never contents.
 *   4. scan-client.ts - report parsing + a real spawn of tools/scan dist over a fixture.
 *   5. index.ts       - entry contract: name/inject/Config exports, command table,
 *                       registration into a recording fake ctx (no global state).
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

// Compiled package under test (dist/src), mirroring tools/scan's self-test approach.
const dist = new URL("../src", import.meta.url).pathname;

const { SEVERITIES, DETECTION_STATUSES } = await import(`${dist}/lib/types.js`);
const { badge, bulletList, card, heading, table } = await import(`${dist}/lib/output.js`);
const {
  MAX_CREDENTIAL_FILE_BYTES,
  claudeCredentialsPath,
  codexAuthPath,
  dshEnvPath,
  dshHomeDir,
  geminiOauthCredsPath,
  maskSecret,
  opencodeAuthPath,
  probeEnvVar,
  probeJsonSource,
  profilePackageJsonPath,
  profilePatchPath,
  projectEnvPath,
} = await import(`${dist}/lib/paths.js`);
const { parseScanReport, resolveScannerEntry, scanDirectory, ScanClientError } = await import(
  `${dist}/lib/scan-client.js`
);
const { apply, Config, inject, name } = await import(`${dist}/index.js`);
const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
/** Structural echo of src/lib/registry.ts BridgeCommand for typed callbacks. */
interface BridgeCommandShape {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly usage: string;
  readonly run: (
    ctx: never,
    args: Readonly<Record<string, string>>,
  ) => Promise<{ readonly markdown: string; readonly data?: unknown }>;
}
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);

/** Repo root, derived from this compiled file (dist/test -> package -> packages). */
const scannerEntry = resolveScannerEntry();

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

function makeTestContext(profile = "web") {
  return makeBridgeContext({
    profile,
    paths: {
      home: "/home/u",
      dshHome: "/home/u/.dsh",
      profilePatch: profilePatchPath(profile, "/home/u/.dsh"),
      profilePackageJson: profilePackageJsonPath(profile, "/home/u/.dsh"),
    },
    output: {
      table,
      card,
      badge,
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Shared vocabularies
// ---------------------------------------------------------------------------
describe("types", () => {
  it("mirrors the scanner severity scale in order", () => {
    assert.deepEqual([...SEVERITIES], ["info", "low", "medium", "high", "critical"]);
  });

  it("uses exactly the connect spec status vocabulary", () => {
    // connect.md section 4: found | expired | malformed | unreadable | not found | configured
    assert.deepEqual([...DETECTION_STATUSES], ["found", "expired", "malformed", "unreadable", "not found", "configured"]);
  });

  it("builds a frozen context with no shared mutable state", () => {
    const ctxA = makeTestContext("a");
    const ctxB = makeTestContext("b");
    assert.equal(ctxA.profile, "a");
    assert.equal(ctxB.profile, "b");
    assert.ok(Object.isFrozen(ctxA));
    assert.ok(Object.isFrozen(ctxA.paths));
  });
});

// ---------------------------------------------------------------------------
// 2. Output helpers
// ---------------------------------------------------------------------------
describe("output", () => {
  it("renders a markdown table with header rule and rows", () => {
    const md = table(["PROVIDER", "STATUS"], [["anthropic", "found"]]);
    const lines = md.trimEnd().split("\n");
    assert.equal(lines[0], "| PROVIDER | STATUS |");
    assert.equal(lines[1], "| --- | --- |");
    assert.equal(lines[2], "| anthropic | found |");
  });

  it("escapes pipes so cell content cannot break tables", () => {
    assert.match(table(["A"], [["x|y"]]), /x\\\|y/);
  });

  it("returns an empty string for empty rows", () => {
    assert.equal(table(["A"], []), "");
  });

  it("renders a key-value card inside a fenced block with aligned values", () => {
    const md = card("Connected - anthropic", [
      ["route", "bridge-anthropic"],
      ["model", "claude-sonnet-4-6"],
    ]);
    assert.match(md, /^```/);
    const lines: string[] = md.split("\n");
    const routeLine = lines.find((line: string) => line.includes("route:"));
    const modelLine = lines.find((line: string) => line.includes("model:"));
    assert.ok(routeLine && modelLine);
    assert.equal(routeLine.indexOf("bridge-anthropic"), modelLine.indexOf("claude-sonnet-4-6"));
  });

  it("renders text severity badges without emoji or color dependence", () => {
    assert.equal(badge("info"), "[ info ]");
    assert.equal(badge("low"), "[ LOW ]");
    assert.equal(badge("medium"), "[ MEDIUM ]");
    assert.equal(badge("high"), "[ HIGH ]");
    assert.equal(badge("critical"), "[CRITICAL]");
  });

  it("keeps every helper output emoji-free and ASCII-only", () => {
    const samples = [
      table(["A", "B"], [["1", "2"]]),
      card("t", [["k", "v"]]),
      badge("critical"),
      heading("h"),
      bulletList(["a", "b"]),
    ].join("");
    for (const char of samples) {
      const code = char.codePointAt(0) ?? 0;
      assert.ok(code <= 127, `non-ASCII leaked into output: ${char}`);
    }
  });

  it("drops empty bullet lists instead of rendering bare headers", () => {
    assert.equal(bulletList([]), "");
    assert.match(bulletList(["one"]), /^- one\n$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Paths and metadata-only probes
// ---------------------------------------------------------------------------
describe("paths", () => {
  it("builds the documented detection matrix paths", () => {
    const home = "/home/u";
    const dsh = join(home, ".dsh");
    assert.equal(claudeCredentialsPath(home), join(home, ".claude", ".credentials.json"));
    assert.equal(codexAuthPath(home), join(home, ".codex", "auth.json"));
    assert.equal(geminiOauthCredsPath(home), join(home, ".gemini", "oauth_creds.json"));
    assert.equal(opencodeAuthPath(home), join(home, ".local", "share", "opencode", "auth.json"));
    assert.equal(dshHomeDir(home), dsh);
    assert.equal(profilePatchPath("web", dsh), join(dsh, "profiles", "web", "cordis.patch.yml"));
    assert.equal(profilePackageJsonPath("web", dsh), join(dsh, "profiles", "web", "package.json"));
    assert.equal(dshEnvPath(dsh), join(dsh, ".env"));
    assert.equal(projectEnvPath("/repo"), join("/repo", ".env"));
  });

  it("honors DSH_HOME when set (env expansion)", () => {
    process.env["DSH_HOME"] = "/custom/dsh";
    try {
      assert.equal(dshHomeDir("/home/u"), "/custom/dsh");
    } finally {
      delete process.env["DSH_HOME"];
    }
  });

  it("ignores blank DSH_HOME and falls back to $HOME/.dsh", () => {
    process.env["DSH_HOME"] = "   ";
    try {
      assert.equal(dshHomeDir("/home/u"), "/home/u/.dsh");
    } finally {
      delete process.env["DSH_HOME"];
    }
  });

  it("honors XDG_DATA_HOME for the opencode auth map", () => {
    process.env["XDG_DATA_HOME"] = "/xdg";
    try {
      assert.equal(opencodeAuthPath("/home/u"), join("/xdg", "opencode", "auth.json"));
    } finally {
      delete process.env["XDG_DATA_HOME"];
    }
    process.env["XDG_DATA_HOME"] = " ";
    try {
      assert.equal(opencodeAuthPath("/home/u"), join("/home/u", ".local", "share", "opencode", "auth.json"));
    } finally {
      delete process.env["XDG_DATA_HOME"];
    }
  });

  it("caps credential probes at the connect spec limit of 64 KiB", () => {
    assert.equal(MAX_CREDENTIAL_FILE_BYTES, 65536);
  });
  it("probes existing JSON sources as metadata only", () => {
    const dir = scratchDir("dshb-valid-");
    const credPath = join(dir, "credentials.json");
    // Fixture value stays here in the test only; production code returns metadata, not content.
    writeFileSync(credPath, JSON.stringify({ claudeAiOauth: { accessToken: "at" } }), "utf8");

    const probe = probeJsonSource(credPath, ["claudeAiOauth"]);
    assert.equal(probe.exists, true);
    assert.equal(probe.shape, "valid-shape");
    assert.equal(typeof probe.sizeBytes, "number");
    assert.equal(typeof probe.mode, "number");
    assert.deepEqual(Object.keys(probe).sort(), ["exists", "mode", "path", "shape", "sizeBytes"]);

    assert.equal(probeJsonSource(credPath, ["tokens"]).shape, "wrong-shape");
    const missing = probeJsonSource(join(dir, "absent.json"), ["anything"]);
    assert.equal(missing.exists, false);
    assert.equal(missing.shape, "unavailable");
  });

  it("refuses symlinks instead of following them (connect spec S12)", () => {
    const dir = scratchDir("dshb-link-");
    const target = join(dir, "real.json");
    const link = join(dir, "bait.json");
    writeFileSync(target, "{}", "utf8");
    symlinkSync(target, link);

    const probe = probeJsonSource(link, []);
    assert.equal(probe.exists, false);
    assert.equal(probe.shape, "unavailable");
  });

  it("reports oversized files without parsing them (connect spec S13)", () => {
    const dir = scratchDir("dshb-big-");
    const big = join(dir, "big.json");
    writeFileSync(big, JSON.stringify({ pad: "x".repeat(MAX_CREDENTIAL_FILE_BYTES) }), "utf8");

    const probe = probeJsonSource(big, ["pad"]);
    assert.equal(probe.exists, true);
    assert.equal(probe.shape, "over-size-limit");
  });

  it("flags unparseable JSON without exposing contents", () => {
    const dir = scratchDir("dshb-bad-");
    const bad = join(dir, "broken.json");
    writeFileSync(bad, "{ definitely not json", "utf8");

    const probe = probeJsonSource(bad, []);
    assert.equal(probe.exists, true);
    assert.equal(probe.shape, "unparseable");
  });

  it("records file mode so callers can advise on group-readable files (E6)", () => {
    if (process.platform === "win32") return; // chmod is POSIX-only
    const dir = scratchDir("dshb-mode-");
    const shared = join(dir, "shared.json");
    writeFileSync(shared, "{}", "utf8");
    chmodSync(shared, 0o644);
    assert.equal(probeJsonSource(shared, []).mode, 0o644);
  });

  it("masks environment variables per connect spec S1", () => {
    const secret = "sk-proj-abcdefgh7Qa";
    // S1 mask: prefix(4) + ellipsis + last4.
    assert.equal(maskSecret(secret), "sk-p\u2026h7Qa");
    assert.equal(maskSecret("short9chr"), "\u2026"); // < 12 chars reveals nothing

    const absent = probeEnvVar("DEFINITELY_NOT_SET_12345", {});
    assert.deepEqual(absent, { name: "DEFINITELY_NOT_SET_12345", present: false, masked: "-" });

    const present = probeEnvVar("K", { K: secret });
    assert.equal(present.present, true);
    assert.equal(present.masked, "sk-p\u2026h7Qa");
    assert.ok(!present.masked.includes("abcdefgh"));

    const empty = probeEnvVar("K", { K: "" });
    assert.equal(empty.present, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Scan client
// ---------------------------------------------------------------------------
describe("scan-client", () => {
  function fixtureReport(): unknown {
    return {
      schema: "dsh-bridge.scan/v1",
      scannerVersion: "0.1.0-test",
      rulesDigest: "deadbeef",
      ruleIds: ["EXEC-001", "NET-001"],
      target: "fixture",
      stats: { filesScanned: 3, filesSkipped: 1, bytesScanned: 300 },
      grading: {
        grade: "B",
        score: 88,
        counts: { info: 0, low: 2, medium: 0, high: 0, critical: 0 },
        caps: [],
        gates: [],
        familiesPresent: ["NET"],
      },
      findings: [
        {
          id: "NET-001",
          ruleId: "net-egress",
          family: "NET",
          severity: "low",
          message: "outbound request to undeclared host",
          path: "src/net.js",
          line: 12,
          col: 5,
          excerpt: "await fetch(url)",
          excerptSha256: "cafe",
          confidence: 0.7,
        },
      ],
    };
  }

  it("parses a well-formed v1 report into typed findings", () => {
    const report = parseScanReport(fixtureReport());
    assert.equal(report.schema, "dsh-bridge.scan/v1");
    assert.equal(report.grading.counts.low, 2);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]?.severity, "low");
    assert.equal(report.findings[0]?.line, 12);
  });

  it("rejects unknown schema versions instead of guessing", () => {
    const mutated = fixtureReport() as Record<string, unknown>;
    mutated["schema"] = "dsh-bridge.scan/v999";
    assert.throws(() => parseScanReport(mutated), ScanClientError);
    assert.throws(() => parseScanReport(null), ScanClientError);
    assert.throws(() => parseScanReport({ schema: 42 }), ScanClientError);
  });

  it("rejects findings whose severity is outside the scanner scale", () => {
    const mutated = fixtureReport() as Record<string, unknown>;
    const findings = [...(mutated["findings"] as Record<string, unknown>[])];
    findings[0] = { ...findings[0], severity: "catastrophic" };
    mutated["findings"] = findings;
    assert.throws(() => parseScanReport(mutated), /unknown finding severity/);
  });

  it(
    "spawns the real tools/scan dist over a fixture directory",
    { timeout: 60_000 },
    async (t: { skip: (message: string) => void }) => {
      // Scanner must be built first; the test skips cleanly when it is absent.
      let scannerBuilt = true;
      try {
        await import("node:fs").then((fs) => fs.statSync(scannerEntry));
      } catch {
        scannerBuilt = false;
      }
      if (!scannerBuilt) {
        t.skip(`tools/scan dist not built at ${scannerEntry}`);
        return;
      }

      const dir = scratchDir("dshb-scanfix-");
      writeFileSync(join(dir, "clean.js"), "export const greeting = 'hello';\n", "utf8");

      const outcome = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.report.schema, "dsh-bridge.scan/v1");
      assert.equal(outcome.report.target, dir.split("/").filter(Boolean).pop());
      assert.ok(outcome.report.stats.filesScanned >= 1);

      // A dirty fixture must produce a typed finding, proving the JSON boundary end to end.
      writeFileSync(join(dir, "dirty.js"), "eval(userInput);\nfetch('https://collect.example/x');\n", "utf8");
      const dirty = await scanDirectory(dir, { entryPath: scannerEntry, timeoutMs: 30_000 });
      assert.ok(dirty.report.findings.length >= 1);
      for (const finding of dirty.report.findings) {
        assert.equal(typeof finding.severity, "string");
        assert.equal(typeof finding.path, "string");
      }
    },
  );

  it("resolves the default scanner entry relative to the repo layout", () => {
    assert.match(resolveScannerEntry(), /tools[/\\]scan[/\\]dist[/\\]index\.js$/);
    assert.equal(resolveScannerEntry({ entryPath: "/x/y.js" }), "/x/y.js");
  });
});

// ---------------------------------------------------------------------------
// 5. Plugin entry contract
// ---------------------------------------------------------------------------
describe("plugin entry (index)", () => {
  it("exports the Cordis plugin shape: name, inject, Config, apply", () => {
    assert.equal(name, "dsh-bridge");
    assert.deepEqual([...inject], ["commands"]);
    assert.equal(typeof apply, "function");
  });

  it("declares Config as a Schemastery schema with a profile default", () => {
    // Schemastery compiles to callable schema objects; a plain object would fail both checks.
    assert.equal(typeof Config, "function");
    assert.equal(typeof (Config as { type?: unknown }).type, "string");
  });

  it("registers only parser-legal command names into a recording ctx", () => {
    const registered: { name: string; description: string }[] = [];
    const fakeCtx = {
      commands: {
        register(definition: { name: string; description: string }) {
          registered.push({ name: definition.name, description: definition.description });
        },
      },
    };
    apply(fakeCtx as never, { profile: "web" });

    assert.ok(registered.length >= 2);
    const legalName = /^[a-z][a-z0-9_-]*$/;
    for (const command of registered) {
      assert.match(command.name, legalName);
      assert.ok(command.name.startsWith("bridge-"), `${command.name} must use the bridge- namespace`);
      assert.ok(command.description.length > 0);
    }
    const names = registered.map((command) => command.name);
    assert.ok(names.includes("bridge-help"));
    assert.ok(names.includes("bridge-connect"));
  });

  it("exposes a BridgeCommand table satisfying the shared interface", async () => {
    const ctx = makeTestContext();
    const commands = bridgeCommandTable(ctx);
    assert.ok(Object.isFrozen(commands));
    for (const command of commands) {
      assert.equal(typeof command.name, "string");
      assert.ok(Array.isArray(command.aliases));
      assert.equal(typeof command.summary, "string");
      assert.equal(typeof command.usage, "string");
      assert.equal(typeof command.run, "function");
    }
  });

  it("runs stub commands through the injected context and renders markdown", async () => {
    const ctx = makeTestContext("myprofile");
    const help = bridgeCommandTable(ctx).find((command: BridgeCommandShape) => command.name === "bridge-help");
    assert.ok(help);
    const result = await help.run(ctx, {});
    assert.equal(typeof result.markdown, "string");
    assert.ok(result.markdown.length > 0);
    assert.ok(result.markdown.includes("myprofile"));
    assert.ok(result.data === undefined);
  });

  it("renders handler results through the registration adapter", async () => {
    interface Registration {
      name: string;
      handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text?: string }>;
    }
    let captured: Registration | undefined;
    const fakeCtx = {
      commands: {
        register(definition: Registration): void {
          captured = definition;
        },
      },
    };
    apply(fakeCtx as never, { profile: "web" });
    assert.ok(captured);

    const outcome = await captured.handler({ rawInput: "--list" });
    assert.equal(outcome.kind, "success");
    assert.equal(typeof outcome.text, "string");
    assert.ok((outcome.text ?? "").length > 0);
  });
});
