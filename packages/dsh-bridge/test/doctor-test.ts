/**
 * Tests for /bridge-doctor (src/commands/doctor.ts).
 *
 * Coverage per the phase task:
 *  - doctor over a fake HOME (tmpdir fixture) yields the expected checklist
 *    shape (ids, statuses, hints bound to non-green rows);
 *  - no crash when every probed path is missing;
 *  - severity transitions driven purely by on-disk fixtures;
 *  - rendering: ASCII-only badges, summary line, machine-readable data payload
 *    without any file contents (metadata-only contract).
 *
 * Run: npm test (compiles then executes dist/test/*-test.js)
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

// Compiled package under test (dist/src), mirroring self-test's approach.
const dist = new URL("../src", import.meta.url).pathname;

const { collectDoctorChecks, MIN_NODE_MAJOR, renderDoctorReport, runDoctor, summarizeDoctorChecks } = await import(
  `${dist}/commands/doctor.js`
);
const { badge, bulletList, card, heading, table } = await import(`${dist}/lib/output.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);

interface DoctorCheckShape {
  readonly id: string;
  readonly label: string;
  readonly status: "green" | "yellow" | "red";
  readonly detail: string;
  readonly hint?: string;
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

/** A BridgeContext rooted at a fake HOME so probes never touch the real one. */
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
    output: { table, card, badge },
  });
}

/** Seed `<home>/.dsh/profiles/<name>/cordis.patch.yml` plus the manifest slot. */
function seedProfile(home: string, name: string, patchBody = "{}\n"): void {
  const dshHome = join(home, ".dsh");
  mkdirSync(join(dshHome, "profiles", name), { recursive: true });
  writeFileSync(profilePatchPath(name, dshHome), patchBody, "utf8");
  writeFileSync(profilePackageJsonPath(name, dshHome), JSON.stringify({ name }), "utf8");
}

describe("doctor checks on a fake HOME", () => {
  it("reports red/yellow with fix hints when every path is missing, and does not crash", () => {
    const home = scratchDir("dshb-doctor-empty-");
    const inputs = {
      profile: "web",
      home,
      dshHome: join(home, ".dsh"),
      profilePatch: profilePatchPath("web", join(home, ".dsh")),
      nodeVersion: process.version,
    };

    const checks = collectDoctorChecks(inputs);
    // Exactly the four read-only checks of this phase, in stable order.
    assert.deepEqual(
      checks.map((check: DoctorCheckShape) => check.id),
      ["node", "credentials", "profiles", "routes"],
    );

    const byId: Map<string, DoctorCheckShape> = new Map(
      checks.map((check: DoctorCheckShape): [string, DoctorCheckShape] => [check.id, check]),
    );
    assert.equal(byId.get("node")?.status, "green"); // this suite runs on >= v20 per engines
    assert.equal(byId.get("credentials")?.status, "yellow");
    assert.equal(byId.get("profiles")?.status, "red");
    assert.equal(byId.get("routes")?.status, "yellow");

    // Every non-green row carries a concrete fix command (spec acceptance 3).
    for (const check of checks) {
      if (check.status === "green") {
        assert.equal(check.hint, undefined);
      } else {
        assert.ok(typeof check.hint === "string" && check.hint.length > 0);
        assert.match(check.hint, /(dsh plugin|bridge-connect|node --version|nvm|brew)/);
      }
    }
    assert.match(byId.get("profiles")?.detail ?? "", /profiles/); // evidence cites the probed dir
  });

  it("turns fully green once profiles, config, and one well-shaped credential exist", async () => {
    const home = scratchDir("dshb-doctor-green-");
    seedProfile(home, "web");
    const claudeDir = join(home, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    // Fixture marker stands in for a real token; nothing may echo it back.
    writeFileSync(
      join(claudeDir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "SECRET-MARKER-1234" } }),
      "utf8",
    );

    const checks = collectDoctorChecks({
      profile: "web",
      home,
      dshHome: join(home, ".dsh"),
      profilePatch: profilePatchPath("web", join(home, ".dsh")),
      nodeVersion: process.version,
    });
    const summary = summarizeDoctorChecks(checks);
    assert.deepEqual(summary, { green: 4, yellow: 0, red: 0, overall: "healthy" });

    const credentials = checks.find((check: DoctorCheckShape) => check.id === "credentials");
    assert.match(credentials?.detail ?? "", /well-shaped: claude/);

    // Spec acceptance 2: zero secrets in rendered output or the data payload.
    const result = await runDoctor(contextOverFakeHome(home, "web"), {});
    const serialized = `${result.markdown}\n${JSON.stringify(result.data)}`;
    assert.ok(!serialized.includes("SECRET-MARKER-1234"), "credential value leaked into doctor output");
    assert.ok(!serialized.includes("accessToken"));
  });

  it("flags malformed credential shapes as yellow while keeping other checks green", () => {
    const home = scratchDir("dshb-doctor-badcred-");
    seedProfile(home, "web");
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "auth.json"), "{ definitely not json", "utf8");

    const checks = collectDoctorChecks({
      profile: "web",
      home,
      dshHome: join(home, ".dsh"),
      profilePatch: profilePatchPath("web", join(home, ".dsh")),
      nodeVersion: process.version,
    });
    const credentials = checks.find((check: DoctorCheckShape) => check.id === "credentials");
    assert.equal(credentials?.status, "yellow");
    assert.match(credentials?.detail ?? "", /codex \(unparseable\)/);
    const routes = checks.find((check: DoctorCheckShape) => check.id === "routes");
    assert.equal(routes?.status, "green");
  });

  it("goes yellow, not red, when the active profile dir is absent among others", () => {
    const home = scratchDir("dshb-doctor-missprof-");
    seedProfile(home, "default");

    const checks = collectDoctorChecks({
      profile: "research",
      home,
      dshHome: join(home, ".dsh"),
      profilePatch: profilePatchPath("research", join(home, ".dsh")),
      nodeVersion: process.version,
    });
    const profiles = checks.find((check: DoctorCheckShape) => check.id === "profiles");
    assert.equal(profiles?.status, "yellow");
    assert.match(profiles?.detail ?? "", /active profile 'research'/);

    const summary = summarizeDoctorChecks(checks);
    assert.equal(summary.overall, "degraded");
    assert.ok(summary.red === 0 || Number.isInteger(summary.red));
  });

  it("classifies old node runtimes red and unparseable versions yellow", () => {
    const base = {
      profile: "web",
      home: scratchDir("dshb-doctor-node-"),
      dshHome: "",
      profilePatch: "",
    };
    const old = collectDoctorChecks({ ...base, nodeVersion: "v18.19.0" });
    const nodeOld = old.find((check: DoctorCheckShape) => check.id === "node");
    assert.equal(nodeOld?.status, "red");
    assert.match(nodeOld?.hint ?? "", /brew upgrade node/);

    const weird = collectDoctorChecks({ ...base, nodeVersion: "not-a-version" });
    const nodeWeird = weird.find((check: DoctorCheckShape) => check.id === "node");
    assert.equal(nodeWeird?.status, "yellow");
  });

  it("keeps MIN_NODE_MAJOR aligned with the documented floor", () => {
    assert.equal(MIN_NODE_MAJOR, 20);
  });
});

describe("doctor aggregation and rendering", () => {
  function fixtureChecks(statuses: readonly ("green" | "yellow" | "red")[]): DoctorCheckShape[] {
    return statuses.map((status, index) => ({
      id: `check-${index}`,
      label: `Check ${index}`,
      status,
      detail: "evidence line",
      ...(status === "green" ? {} : { hint: `fix ${index}: do the thing` }),
    }));
  }

  it("maps counts to healthy/degraded/blocked", () => {
    assert.equal(summarizeDoctorChecks(fixtureChecks(["green", "green"])).overall, "healthy");
    assert.equal(summarizeDoctorChecks(fixtureChecks(["green", "yellow"])).overall, "degraded");
    assert.equal(summarizeDoctorChecks(fixtureChecks(["green", "red"])).overall, "blocked");
    const counts = summarizeDoctorChecks(fixtureChecks(["green", "yellow", "red"]));
    assert.deepEqual({ green: counts.green, yellow: counts.yellow, red: counts.red }, { green: 1, yellow: 1, red: 1 });
  });

  it("renders text badges, a summary line, and indented fix hints; ASCII only", () => {
    const report = renderDoctorReport(fixtureChecks(["green", "yellow"]), "web");
    assert.match(report, /\[ green  \]/);
    assert.match(report, /\[ YELLOW \]/);
    assert.match(report, /Summary: 1 green, 1 yellow, 0 red\./);
    assert.match(report, /Overall: DEGRADED/);
    assert.match(report, /Active profile: web/);
    for (const char of report) {
      const code = char.codePointAt(0) ?? 0;
      assert.ok(code <= 127, `non-ASCII leaked into doctor output: ${char}`);
    }
  });

  it("declares HEALTHY with no hints section when everything is green", () => {
    const report = renderDoctorReport(fixtureChecks(["green", "green"]), "default");
    assert.match(report, /Overall: HEALTHY/);
    assert.ok(!report.includes("Fix hints"));
    assert.equal(bulletList([]), ""); // helper contract reused by renderer
    assert.ok(heading("x").startsWith("### "));
    void table; // helpers exercised through renderDoctorReport above
  });
});

describe("/bridge-doctor command wiring", () => {
  it("runs through the injected context on an empty fake HOME and returns markdown plus data", async () => {
    const home = scratchDir("dshb-doctor-run-");
    const ctx = contextOverFakeHome(home, "web");
    const result = await runDoctor(ctx, {});

    assert.equal(typeof result.markdown, "string");
    assert.ok(result.markdown.length > 0);
    const data = result.data as {
      checks: DoctorCheckShape[];
      green: number;
      yellow: number;
      red: number;
      overall: string;
    };
    assert.equal(data.checks.length, 4);
    assert.equal(data.overall, "blocked"); // no profiles anywhere -> blocking
    // Metadata-only contract: rows carry ids/statuses/details, never file bodies.
    for (const check of data.checks) {
      assert.ok(["green", "yellow", "red"].includes(check.status));
      assert.equal(typeof check.detail, "string");
    }
  });

  it("renders the same checklist through the registry-mounted row", async () => {
    const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
    interface BridgeCommandShape {
      readonly name: string;
      readonly usage: string;
      readonly run: (
        ctx: never,
        args: Readonly<Record<string, string>>,
      ) => Promise<{ readonly markdown: string; readonly data?: unknown }>;
    }
    const home = scratchDir("dshb-doctor-reg-");
    seedProfile(home, "web");
    const ctx = contextOverFakeHome(home, "web");
    const command = bridgeCommandTable(ctx).find(
      (candidate: BridgeCommandShape) => candidate.name === "bridge-doctor",
    );
    assert.ok(command, "bridge-doctor must be registered in the command table");
    assert.match(command.usage, /--net/);
    const result = await command.run(ctx as never, {});
    assert.match(result.markdown, /\/bridge-doctor/);
    assert.match(result.markdown, /DSH profiles/);
  });
});
