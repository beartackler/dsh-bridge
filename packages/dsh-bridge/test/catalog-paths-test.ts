/**
 * Tests for catalog resolution (lib/catalog-paths.ts) and for the packaged
 * data that makes an installed copy work with no repo checkout present.
 *
 * Covered:
 *  - packaged data only, repo checkout only, both, neither
 *  - checkout override wins when both hold the same file
 *  - the error detail names both probed locations
 *  - data/manifest.json and data/INDEX.md really ship and really parse
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  catalogEntry,
  catalogRoots,
  packagedDataDir,
  repoCatalogDir,
  searchedPaths,
  unavailableDetail,
} from "../src/lib/catalog-paths.js";
import { loadManifest, resolveCatalogPaths } from "../src/commands/browse.js";
import { parseIndexGrades } from "../src/commands/install.js";
import { parseCatalogIndex } from "../src/commands/status.js";

/** `<package>` root, from dist/test/... or test/... alike. */
function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hops = 0; hops < 6; hops += 1) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("package root not found");
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "bridge-catalog-paths-"));
}

/** A fake `<pkg>/data` layout with a deep module dir underneath it. */
function withPackaged(root: string, manifest: string): string {
  const data = join(root, "pkg", "data");
  mkdirSync(join(data, "cards"), { recursive: true });
  writeFileSync(join(data, "manifest.json"), manifest, "utf8");
  writeFileSync(join(data, "INDEX.md"), "packaged index\n", "utf8");
  const moduleDir = join(root, "pkg", "dist", "src", "lib");
  mkdirSync(moduleDir, { recursive: true });
  return moduleDir;
}

/** A fake `<repo>/docs/catalog` above the same module dir. */
function withRepo(root: string, manifest: string): void {
  const catalog = join(root, "docs", "catalog");
  mkdirSync(join(catalog, "cards"), { recursive: true });
  writeFileSync(join(catalog, "manifest.json"), manifest, "utf8");
  writeFileSync(join(catalog, "INDEX.md"), "repo index\n", "utf8");
}

const PACKAGED = JSON.stringify([{ name: "p/one", repo: "p/one" }]);
const REPO = JSON.stringify([{ name: "r/one", repo: "r/one" }, { name: "r/two", repo: "r/two" }]);

describe("catalog resolution order", () => {
  it("uses packaged data when no checkout exists", () => {
    const root = scratch();
    const moduleDir = withPackaged(root, PACKAGED);

    assert.ok(packagedDataDir(moduleDir), "packaged data must be found");
    assert.equal(repoCatalogDir(moduleDir), undefined, "no checkout must be reported");

    const manifest = catalogEntry("manifest.json", moduleDir);
    assert.ok(manifest);
    assert.equal(loadManifest(manifest!).length, 1);
    assert.equal(readFileSync(catalogEntry("INDEX.md", moduleDir)!, "utf8"), "packaged index\n");
    assert.deepEqual(
      catalogRoots(moduleDir).map((entry) => entry.origin),
      ["packaged"],
    );
  });

  it("uses the repo checkout when the package ships no data", () => {
    const root = scratch();
    const moduleDir = join(root, "pkg", "dist", "src", "lib");
    mkdirSync(moduleDir, { recursive: true });
    withRepo(root, REPO);

    assert.equal(packagedDataDir(moduleDir), undefined);
    assert.ok(repoCatalogDir(moduleDir));
    assert.equal(loadManifest(catalogEntry("manifest.json", moduleDir)!).length, 2);
    assert.deepEqual(
      catalogRoots(moduleDir).map((entry) => entry.origin),
      ["repo"],
    );
  });

  it("lets a repo checkout override packaged data so live edits win", () => {
    const root = scratch();
    const moduleDir = withPackaged(root, PACKAGED);
    withRepo(root, REPO);

    assert.deepEqual(
      catalogRoots(moduleDir).map((entry) => entry.origin),
      ["packaged", "repo"],
      "packaged is probed first, then the checkout override",
    );
    assert.equal(
      loadManifest(catalogEntry("manifest.json", moduleDir)!).length,
      2,
      "the checkout copy must win when both exist",
    );
    assert.equal(readFileSync(catalogEntry("INDEX.md", moduleDir)!, "utf8"), "repo index\n");
  });

  it("falls back to the packaged copy for files the checkout lacks", () => {
    const root = scratch();
    const moduleDir = withPackaged(root, PACKAGED);
    const catalog = join(root, "docs", "catalog");
    mkdirSync(join(catalog, "cards"), { recursive: true });
    // Checkout with cards but no manifest (the published root package shape).
    assert.ok(repoCatalogDir(moduleDir), "a cards-only checkout still counts as a root");
    assert.equal(
      loadManifest(catalogEntry("manifest.json", moduleDir)!).length,
      1,
      "manifest.json comes from the packaged copy",
    );
  });

  it("reports nothing and names both paths when neither source exists", () => {
    const root = scratch();
    const moduleDir = join(root, "a", "b", "c", "d");
    mkdirSync(moduleDir, { recursive: true });

    assert.equal(catalogEntry("manifest.json", moduleDir), undefined);
    assert.equal(resolveCatalogPaths(moduleDir), undefined);
    assert.deepEqual(catalogRoots(moduleDir), []);

    const detail = unavailableDetail("manifest.json", moduleDir);
    assert.match(detail, /manifest\.json was not found/);
    assert.match(detail, /packaged catalog: not found/);
    assert.match(detail, /checkout override: not found/);
    for (const path of searchedPaths(moduleDir)) assert.ok(detail.includes(path));
  });
});

describe("packaged catalog data", () => {
  it("ships data/manifest.json and it parses into catalog entries", () => {
    const manifestPath = join(packageRoot(), "data", "manifest.json");
    assert.ok(existsSync(manifestPath), `packaged catalog missing: ${manifestPath}`);

    const entries = loadManifest(manifestPath);
    assert.ok(entries.length > 2000, `expected the full catalog, got ${entries.length} entries`);
    const first = entries[0]!;
    assert.ok(first.name !== "" && first.repo !== "", "entries must carry name and repo");
  });

  it("ships data/INDEX.md and both grade parsers read rows from it", () => {
    const indexPath = join(packageRoot(), "data", "INDEX.md");
    assert.ok(existsSync(indexPath), `packaged INDEX.md missing: ${indexPath}`);

    const markdown = readFileSync(indexPath, "utf8");
    assert.ok(parseIndexGrades(markdown).size > 0, "install must find graded rows");
    assert.ok(parseCatalogIndex(markdown).length > 0, "status must find dated rows");
  });

  it("ships data/cards so /bridge-trust can render committed cards", () => {
    const cards = join(packageRoot(), "data", "cards");
    assert.ok(existsSync(cards), `packaged cards missing: ${cards}`);
  });
});
