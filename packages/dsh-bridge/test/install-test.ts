/**
 * Tests for /bridge-install (docs/specs/commands/install.md).
 *
 * Scope:
 *   1. Catalog parsing  - INDEX.md graded rows only; prose never yields a grade.
 *   2. Resolution order - id, owner/repo, specifier promotion, fuzzy,
 *                         ambiguity, not-found (AC-1..AC-4).
 *   3. Consent gate     - A/B/C pass; unlisted and D need the risk flag; F
 *                         needs --force on top (AC-9, AC-10).
 *   4. Output snapshots - trust card, unverified warning wording, emitted
 *                         command, checklist and undo line (AC-5, AC-12, AC-21).
 *   5. Degraded catalog - missing manifest fails closed to unlisted (AC-23).
 *   6. House rules      - no emoji anywhere in any rendered output.
 *
 * Fixtures are written to scratch dirs so the tests never depend on the
 * evolving repo catalog. The command is also exercised through lib/registry.ts
 * so registration wiring is covered.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { badge, card, table } = await import(`${dist}/lib/output.js`);
const { profilePackageJsonPath, profilePatchPath } = await import(`${dist}/lib/paths.js`);
const { bridgeCommandTable } = await import(`${dist}/lib/registry.js`);
const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const installModule = await import(`${dist}/commands/install.js`);

const {
  consentFor,
  editDistance,
  installCommand,
  loadCandidates,
  parseIndexGrades,
  repoBase,
  resolve,
  runInstall,
  shortId,
  uninstallCommand,
} = installModule;

interface Candidate {
  readonly id: string;
  readonly repo: string;
  readonly source: string;
  readonly grade: string | null;
}

function makeCtx(profile = "web") {
  return makeBridgeContext({
    profile,
    paths: {
      home: "/home/u",
      dshHome: "/home/u/.dsh",
      profilePatch: profilePatchPath(profile, "/home/u/.dsh"),
      profilePackageJson: profilePackageJsonPath(profile, "/home/u/.dsh"),
    },
    output: { table, card, badge },
  });
}

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture catalog
// ---------------------------------------------------------------------------

const FIXTURE_MANIFEST = [
  { name: "acme/modlens", repo: "acme/modlens", category: "vision", description_en: "Vision routing plugin.", stars_if_known: 10 },
  { name: "acme/ponytail", repo: "acme/ponytail", category: "workflow", description_en: "Persona plugin.", stars_if_known: 5 },
  { name: "acme/ponycar", repo: "acme/ponycar", category: "workflow", description_en: "Unrelated plugin.", stars_if_known: 1 },
  { name: "risky/dsh-riskytool", repo: "risky/dsh-riskytool", category: "tools", description_en: "Risky plugin.", stars_if_known: 0 },
  { name: "bad/dsh-hostile", repo: "bad/dsh-hostile", category: "tools", description_en: "Hostile plugin.", stars_if_known: 0 },
  { name: "quiet/dsh-unaudited", repo: "quiet/dsh-unaudited", category: "tools", description_en: "Not audited yet.", stars_if_known: 0 },
];

const FIXTURE_INDEX = [
  "# Verified Plugin Catalog",
  "",
  "**A - Verified-clean.** Prose band description that must never yield a grade.",
  "",
  "| Grade | Plugin | Repo | Stars | Verdict | Verified | Card |",
  "|---|---|---|---:|---|---|---|",
  "| B | modlens | acme/modlens | 10 | Egress limited to named vision endpoints. | 2026-08-25 | [card](cards/modlens.md) |",
  "| A | ponytail | acme/ponytail | 5 | No egress, no credential access, no install hooks. | 2026-08-25 | [card](cards/ponytail.md) |",
  "| D | riskytool | risky/dsh-riskytool | 0 | Undocumented egress to an unnamed host. | 2026-08-26 | [card](cards/riskytool.md) |",
  "| F | hostile | bad/dsh-hostile | 0 | Canary token exfiltration demonstrated. | 2026-08-26 | [card](cards/hostile.md) |",
  "",
].join("\n");

function fixtureCatalog(): { manifestPath: string; indexPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "dshb-install-"));
  cleanupPaths.push(dir);
  const manifestPath = join(dir, "manifest.json");
  const indexPath = join(dir, "INDEX.md");
  writeFileSync(manifestPath, JSON.stringify(FIXTURE_MANIFEST), "utf8");
  writeFileSync(indexPath, FIXTURE_INDEX, "utf8");
  return { manifestPath, indexPath };
}

const CATALOG = fixtureCatalog();

function candidates(): readonly Candidate[] {
  return loadCandidates(CATALOG.manifestPath, CATALOG.indexPath) as readonly Candidate[];
}

async function install(args: Readonly<Record<string, string>>, profile = "web"): Promise<{ markdown: string; data?: unknown }> {
  return runInstall(makeCtx(profile), args, CATALOG);
}

// ---------------------------------------------------------------------------
// 1. Catalog parsing
// ---------------------------------------------------------------------------
describe("install catalog parsing", () => {
  it("reads only bare-letter grade rows and ignores band prose", () => {
    const grades = parseIndexGrades(FIXTURE_INDEX);
    assert.equal(grades.get("acme/modlens").grade, "B");
    assert.equal(grades.get("acme/ponytail").grade, "A");
    assert.equal(grades.get("bad/dsh-hostile").grade, "F");
    assert.equal(grades.size, 4, "prose bands and the header row must not become entries");
  });

  it("carries verdict, date, and card path onto candidates", () => {
    const modlens = candidates().find((entry) => entry.id === "modlens");
    assert.ok(modlens);
    assert.equal(modlens.grade, "B");
    assert.equal(modlens.source, "github:acme/modlens");
    assert.equal((modlens as unknown as { card: string }).card, "docs/catalog/cards/modlens.md");
    assert.equal((modlens as unknown as { verifiedAt: string }).verifiedAt, "2026-08-25");
  });

  it("leaves an ungraded manifest entry with a null grade rather than guessing", () => {
    const unaudited = candidates().find((entry) => entry.id === "dsh-unaudited");
    assert.ok(unaudited);
    assert.equal(unaudited.grade, null);
  });

  it("normalizes repo bases and short ids", () => {
    assert.equal(repoBase("Acme/Modlens.git"), "acme/modlens");
    assert.equal(repoBase("tt-a1i/archify#integrations/dsh"), "tt-a1i/archify");
    assert.equal(shortId("acme/dsh-notion-sync"), "dsh-notion-sync");
  });
});

// ---------------------------------------------------------------------------
// 2. Resolution order
// ---------------------------------------------------------------------------
describe("install resolution order", () => {
  it("AC-1: an exact catalog id resolves offline via rule 1", () => {
    const result = resolve("modlens", candidates());
    assert.equal(result.kind, "match");
    assert.equal(result.rule, "id");
    assert.equal(result.candidate.id, "modlens");
  });

  it("AC-2: owner/repo resolves to the same canonical entry", () => {
    const result = resolve("acme/modlens", candidates());
    assert.equal(result.kind, "match");
    assert.equal(result.rule, "repo");
    assert.equal(result.candidate.id, "modlens");
  });

  it("AC-4: a github: specifier matching a catalog source is promoted to verified", () => {
    const result = resolve("github:acme/ponytail", candidates());
    assert.equal(result.kind, "match");
    assert.equal(result.rule, "source");
    assert.equal(result.candidate.grade, "A");
  });

  it("AC-4: specifiers with no catalog entry take the unlisted path", () => {
    for (const spec of ["github:wei/dsh-zhipu-router", "npm:dsh-zhipu-router", "tgz:./p.tgz"]) {
      const result = resolve(spec, candidates());
      assert.equal(result.kind, "unlisted", `${spec} must be unlisted`);
    }
  });

  it("AC-3: an ambiguous prefix lists candidates and selects nothing", () => {
    const result = resolve("pony", candidates());
    assert.equal(result.kind, "ambiguous");
    assert.equal(result.candidates.length, 2);
  });

  it("resolves a unique typo within edit distance 2", () => {
    const result = resolve("modlense", candidates());
    assert.equal(result.kind, "match");
    assert.equal(result.candidate.id, "modlens");
  });

  it("reports not-found with near misses for an unknown bare name", () => {
    const result = resolve("totally-unrelated-name", candidates());
    assert.equal(result.kind, "not-found");
  });

  it("caps edit distance cheaply", () => {
    assert.equal(editDistance("abc", "abc"), 0);
    assert.equal(editDistance("abc", "abd"), 1);
    assert.equal(editDistance("abc", "zzzzzzz"), 3);
  });
});

// ---------------------------------------------------------------------------
// 3. Consent gate
// ---------------------------------------------------------------------------
describe("install consent gate", () => {
  it("lets grades A, B, and C through with no extra flag", () => {
    for (const grade of ["A", "B", "C"]) {
      assert.equal(consentFor(grade, {}).allowed, true, `grade ${grade} must pass`);
    }
  });

  it("AC-9: unverified needs the explicit flag; --yes does not satisfy it", () => {
    assert.equal(consentFor(null, {}).allowed, false);
    assert.equal(consentFor(null, { yes: "" }).allowed, false);
    assert.equal(consentFor(null, { "i-accept-unverified-risk": "" }).allowed, true);
  });

  it("grade D routes through the same gate as unverified", () => {
    assert.equal(consentFor("D", {}).allowed, false);
    assert.equal(consentFor("D", { "i-accept-unverified-risk": "" }).allowed, true);
  });

  it("AC-10: grade F additionally requires --force", () => {
    const risked = consentFor("F", { "i-accept-unverified-risk": "" });
    assert.equal(risked.allowed, false);
    assert.equal(risked.requiredFlag, "--force");
    assert.equal(consentFor("F", { "i-accept-unverified-risk": "", force: "" }).allowed, true);
    assert.equal(consentFor("F", { force: "" }).allowed, false, "--force alone is not consent");
  });
});

// ---------------------------------------------------------------------------
// 4. Output snapshots through the registry mount
// ---------------------------------------------------------------------------
describe("install output", () => {
  it("registers in the command table", () => {
    const command = bridgeCommandTable(makeCtx()).find((c: { name: string }) => c.name === "bridge-install");
    assert.ok(command, "bridge-install must be registered");
    assert.ok(command.usage.includes("<plugin"));
  });

  it("AC-5: a verified entry renders grade, source, profile, verdict, and audit path", async () => {
    const result = await install({ _: "modlens" });
    assert.ok(result.markdown.includes("TRUST SUMMARY"));
    assert.match(result.markdown, /grade:\s+B\b/);
    assert.ok(result.markdown.includes("github:acme/modlens"));
    assert.match(result.markdown, /profile:\s+web/);
    assert.ok(result.markdown.includes("**Verdict:** Egress limited to named vision endpoints."));
    assert.ok(result.markdown.includes("docs/catalog/cards/modlens.md"));
  });

  it("AC-13: emits the native command verbatim and never claims to have run it", async () => {
    const result = await install({ _: "ponytail" });
    const expected = installCommand("web", "github:acme/ponytail");
    assert.equal(expected, "dsh plugin --profile web add github:acme/ponytail");
    assert.ok(result.markdown.includes(expected));
    assert.ok(result.markdown.includes("dsh-bridge does not execute it for you"));
    assert.equal((result.data as { command: string }).command, expected);
  });

  it("honors --profile for both the emitted and the undo command", async () => {
    const result = await install({ _: "ponytail", profile: "lab" });
    assert.ok(result.markdown.includes("dsh plugin --profile lab add github:acme/ponytail"));
    assert.ok(result.markdown.includes(uninstallCommand("lab", "ponytail")));
  });

  it("AC-21: every emitted install prints its post-install checklist and undo line", async () => {
    const result = await install({ _: "modlens" });
    assert.ok(result.markdown.includes("dsh.profile.bundles"));
    assert.ok(result.markdown.includes("--dump-config"));
    assert.ok(result.markdown.includes("Undo: `dsh plugin --profile web remove modlens`"));
  });

  it("AC-7: --report shows the card and refuses to emit an install command", async () => {
    const result = await install({ _: "modlens", report: "" });
    assert.ok(result.markdown.includes("Report mode: no install command is emitted."));
    assert.ok(!result.markdown.includes("dsh plugin --profile web add"));
    assert.equal((result.data as { kind: string }).kind, "report");
  });

  it("AC-12: the unverified warning names all three risks with its audit citation", async () => {
    const result = await install({ _: "github:wei/dsh-zhipu-router" });
    assert.ok(result.markdown.includes("NOT in the dsh-bridge verified catalog"));
    assert.ok(result.markdown.includes("`prepare`"));
    assert.ok(result.markdown.includes("full context access"));
    assert.ok(result.markdown.includes("approval and sandbox rows silently"));
    assert.ok(result.markdown.includes("docs/audits/dsh-builtin-redteam.md section F2"));
  });

  it("blocks an unverified install and names the exact flag, without emitting a command", async () => {
    const result = await install({ _: "github:wei/dsh-zhipu-router" });
    assert.ok(result.markdown.includes("Blocked: no install command is emitted."));
    assert.ok(result.markdown.includes("--i-accept-unverified-risk"));
    assert.ok(!result.markdown.includes("dsh plugin --profile web add github:wei/dsh-zhipu-router\n```"));
    assert.equal((result.data as { kind: string }).kind, "blocked");
  });

  it("emits the unverified install once the risk flag is present", async () => {
    const result = await install({ _: "github:wei/dsh-zhipu-router", "i-accept-unverified-risk": "" });
    assert.equal((result.data as { kind: string }).kind, "emitted");
    assert.ok(result.markdown.includes("dsh plugin --profile web add github:wei/dsh-zhipu-router"));
    assert.ok(result.markdown.includes("NOT in the dsh-bridge verified catalog"), "the warning stays above the command");
  });

  it("a catalog entry with no audit takes the unverified path, not a fabricated grade", async () => {
    const result = await install({ _: "dsh-unaudited" });
    assert.ok(result.markdown.includes("NOT in the dsh-bridge verified catalog"));
    assert.ok(result.markdown.includes("Blocked:"));
    assert.equal((result.data as { grade: string | null }).grade, null);
  });

  it("grade F is unreachable without both flags", async () => {
    const risked = await install({ _: "dsh-hostile", "i-accept-unverified-risk": "" });
    assert.ok(risked.markdown.includes("--force"));
    assert.equal((risked.data as { kind: string }).kind, "blocked");

    const forced = await install({ _: "dsh-hostile", "i-accept-unverified-risk": "", force: "" });
    assert.equal((forced.data as { kind: string }).kind, "emitted");
  });

  it("AC-3: ambiguity prints candidates with grades and installs nothing", async () => {
    const result = await install({ _: "pony" });
    assert.ok(result.markdown.includes("ambiguity is never resolved silently"));
    assert.ok(result.markdown.includes("ponytail"));
    assert.ok(result.markdown.includes("ponycar"));
    assert.ok(!result.markdown.includes("dsh plugin --profile web add"));
    assert.equal((result.data as { exitCode: number }).exitCode, 2);
  });

  it("not-found suggests search rather than dead-ending", async () => {
    const result = await install({ _: "totally-unrelated-name" });
    assert.ok(result.markdown.includes("/bridge-browse find"));
    assert.equal((result.data as { exitCode: number }).exitCode, 2);
  });

  it("prints usage when invoked bare", async () => {
    const result = await install({});
    assert.ok(result.markdown.includes("Usage: /bridge-install"));
  });
});

// ---------------------------------------------------------------------------
// 5. Degraded catalog (F-4 / AC-23)
// ---------------------------------------------------------------------------
describe("install with an unavailable catalog", () => {
  const missing = { manifestPath: join(tmpdir(), "dshb-nope", "manifest.json"), indexPath: join(tmpdir(), "dshb-nope", "INDEX.md") };

  it("AC-23: still runs, says the trust layer is degraded, and fails closed", async () => {
    const result = await runInstall(makeCtx(), { _: "github:wei/dsh-zhipu-router" }, missing);
    assert.ok(result.markdown.includes("trust layer is degraded"));
    assert.ok(result.markdown.includes("NOT in the dsh-bridge verified catalog"));
    assert.ok(result.markdown.includes("Blocked:"));
  });

  it("a bare name with no catalog resolves to nothing rather than an invented source", async () => {
    const result = await runInstall(makeCtx(), { _: "modlens" }, missing);
    assert.equal((result.data as { kind: string }).kind, "not-found");
    assert.ok(!result.markdown.includes("dsh plugin --profile web add"));
  });
});

// ---------------------------------------------------------------------------
// 6. House rules
// ---------------------------------------------------------------------------
describe("install house rules", () => {
  it("emits no emoji on any rendered path (CHARTER.md non-negotiable 4)", async () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    const outputs = await Promise.all([
      install({}),
      install({ _: "modlens" }),
      install({ _: "modlens", report: "" }),
      install({ _: "pony" }),
      install({ _: "dsh-hostile", "i-accept-unverified-risk": "" }),
      install({ _: "github:wei/dsh-zhipu-router" }),
      install({ _: "totally-unrelated-name" }),
    ]);
    for (const output of outputs) {
      assert.ok(!emoji.test(output.markdown), `emoji found in: ${output.markdown.slice(0, 80)}`);
    }
  });
});
