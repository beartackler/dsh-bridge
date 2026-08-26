/**
 * Tests for the /bridge-mcp command module (docs/specs/commands/mcp.md),
 * MVP slice over the bridge-owned store at $HOME/.dsh-bridge/mcp.json:
 * add/remove write only that store and emit copy-paste yaml for the profile
 * patch; migration detection reads a legacy patch read-only; list rendering,
 * handshake checklist, and import-from claude existence+parse reporting.
 * All io goes through McpIo doubles or scratch dirs; no network, no spawns.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { makeBridgeContext } = await import(`${dist}/lib/context.js`);
const { table } = await import(`${dist}/lib/output.js`);
const mcpModule = await import(`${dist}/commands/mcp.js`);

const {
  normalizeServerName,
  secretShaped,
  validateInstance,
  loadInstances,
  nodeMcpIo,
  runMcp,
  mcpStorePath,
  detectPatchEntries,
} = mcpModule as typeof import("../src/commands/mcp.js");

const cleanupPaths: string[] = [];
after(() => {
  for (const path of cleanupPaths) rmSync(path, {recursive: true, force: true});
});

function scratchFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dshb-mcp-"));
  cleanupPaths.push(dir);
  const file = join(dir, "mcp.json");
  if (content !== "") writeFileSync(file, content);
  return file;
}

/** Scratch dir standing in for $HOME; the bridge store lives inside it. */
function scratchHome(): {home: string; storePath: string} {
  const home = mkdtempSync(join(tmpdir(), "dshb-mcp-home-"));
  cleanupPaths.push(home);
  const storePath = mcpStorePath(home);
  mkdirSync(dirname(storePath), {recursive: true});
  return {home, storePath};
}

/** Legacy YAML profile patch fixture (never written by the bridge). */
function scratchPatch(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dshb-mcp-patch-"));
  cleanupPaths.push(dir);
  const file = join(dir, "cordis.patch.yml");
  if (content !== "") writeFileSync(file, content);
  return file;
}

interface CtxOptions {
  readonly home: string;
  readonly storePath: string;
  readonly profilePatch: string;
}

function makeCtx(options: CtxOptions) {
  return makeBridgeContext({
    profile: "web",
    paths: {
      home: options.home,
      dshHome: join(options.home, ".dsh"),
      profilePatch: options.profilePatch,
      profilePackageJson: join(options.home, ".dsh", "profiles", "web", "package.json"),
    },
    output: {table, card: () => "", badge: () => ""},
  });
}

async function mcpRun(args: Record<string, string>, options?: Partial<CtxOptions>): Promise<{markdown: string; data?: unknown}> {
  const home = mkdtempSync(join(tmpdir(), "dshb-mcp-home-"));
  cleanupPaths.push(home);
  const full: CtxOptions = {
    home,
    storePath: mcpStorePath(home),
    profilePatch: join(home, ".dsh", "profiles", "web", "cordis.patch.yml"),
    ...options,
  };
  return runMcp(makeCtx(full), args);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("mcp name normalization", () => {
  it("maps illegal characters and truncates to 32", () => {
    assert.equal(normalizeServerName("my.server", new Set()).name, "my-server");
    assert.equal(normalizeServerName("a".repeat(40), new Set()).name, "a".repeat(32));
    assert.equal(normalizeServerName("ok_name-1", new Set()).name, "ok_name-1");
    assert.equal(normalizeServerName("my.server", new Set()).renamed, true);
  });

  it("suffixes collisions with -2", () => {
    const taken = new Set(["gh"]);
    assert.equal(normalizeServerName("gh", taken).name, "gh-2");
    assert.equal(normalizeServerName("GH", taken).name, "GH");
  });
});

describe("mcp secret detection", () => {
  it("flags credential-shaped values and not plain words", () => {
    assert.ok(secretShaped("ghp_" + "a".repeat(20)));
    assert.ok(secretShaped("sk-abc123def456ghi789jkl012"));
    assert.ok(secretShaped("Bearer abc.def.ghi"));
    assert.equal(secretShaped("npx"), false);
    assert.equal(secretShaped(42), false);
  });
});

describe("mcp instance validation", () => {
  it("accepts a schema-shaped stdio entry and rejects bad names/transports", () => {
    const entry = {
      id: "mcp-github",
      name: "@deepseek-ai/dsh-mcp-client" as const,
      config: {serverName: "github", transport: "stdio" as const, command: "npx"},
    };
    assert.equal(validateInstance(entry), null);
    const badName = {...entry, config: {...entry.config, serverName: "bad name"}};
    assert.match(String(validateInstance(badName)), /serverName must match/);
    const badTransport = {...entry, config: {...entry.config, transport: "sse" as never}};
    assert.match(String(validateInstance(badTransport)), /transport must be/);
    const missingCommand = {...entry, config: {serverName: "x", transport: "stdio" as const}};
    assert.match(String(validateInstance(missingCommand)), /command/);
  });
});

// ---------------------------------------------------------------------------
// Config store + list
// ---------------------------------------------------------------------------

describe("mcp config store", () => {
  it("returns empty for absent or blank stores and throws on invalid JSON", () => {
    const io = nodeMcpIo();
    const missing = join(tmpdir(), `dshb-mcp-missing-${Date.now()}.json`);
    assert.deepEqual(loadInstances(io, missing), []);
    const blank = scratchFile("");
    assert.deepEqual(loadInstances(io, blank), []);
    const broken = scratchFile("{not json");
    assert.throws(() => loadInstances(io, broken), /not valid JSON/);
  });

  it("resolves the store to $HOME/.dsh-bridge/mcp.json", () => {
    assert.equal(mcpStorePath("/home/u"), join("/home/u", ".dsh-bridge", "mcp.json"));
  });

  it("round-trips instances through write + load", () => {
    const path = scratchFile("");
    const io = nodeMcpIo();
    assert.equal(loadInstances(io, path).length, 0);
    const entry = {
      id: "mcp-github",
      name: "@deepseek-ai/dsh-mcp-client" as const,
      config: {serverName: "github", transport: "stdio" as const, command: "npx", args: ["-y", "pkg"]},
    };
    io.writeFile(path, `${JSON.stringify({servers: [entry]}, null, 2)}\n`);
    const loaded = loadInstances(io, path);
    assert.equal(loaded.length, 1);
    assert.equal((loaded[0]?.config as {serverName?: string}).serverName, "github");
  });
});

describe("mcp list", () => {
  it("renders one row per instance plus the tool prefix column", async () => {
    const {home} = scratchHome();
    writeFileSync(
      mcpStorePath(home),
      JSON.stringify({
        servers: [
          {
            id: "mcp-github",
            name: "@deepseek-ai/dsh-mcp-client",
            config: {serverName: "github", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"]},
          },
        ],
      }),
    );
    const result = await mcpRun({_ : "list"}, {home});
    assert.match(result.markdown, /github/);
    assert.match(result.markdown, /stdio/);
    assert.match(result.markdown, /mcp__github__/);
    assert.match(result.markdown, /npx -y @modelcontextprotocol\/server-github/);
  });

  it("prints the empty state with both next commands", async () => {
    const result = await mcpRun({_ : "list"});
    assert.match(result.markdown, /No MCP servers configured/);
    assert.match(result.markdown, /\/bridge-mcp add/);
    assert.match(result.markdown, /import-from claude/);
  });

  it("flags duplicate serverNames as an error row", async () => {
    const entry = (name: string) => ({
      id: `mcp-${name}`,
      name: "@deepseek-ai/dsh-mcp-client",
      config: {serverName: name, transport: "stdio", command: "run"},
    });
    const {home} = scratchHome();
    writeFileSync(mcpStorePath(home), JSON.stringify({servers: [entry("dup"), entry("dup")]}));
    const result = await mcpRun({_ : "list"}, {home});
    assert.match(result.markdown, /duplicate serverName/);
  });

  it("appends a migration notice when legacy entries exist in the profile patch", async () => {
    const patch = scratchPatch([
      "# my patch layer",
      "- id: keep-me",
      "  name: some-other-plugin",
      "- id: mcp-github",
      "  name: '@deepseek-ai/dsh-mcp-client'",
      "  config:",
      "    serverName: github",
      "    transport: stdio",
      "    command: npx",
    ].join("\n"));
    const result = await mcpRun({_ : "list"}, {profilePatch: patch});
    assert.match(result.markdown, /Migration available/);
    assert.match(result.markdown, /github/);
    assert.match(result.markdown, /cordis\.patch\.yml/);
  });

  it("detects legacy patch entries read-only without touching the file", () => {
    const patchBody = [
      "- id: other-plugin",
      "  name: not-an-mcp-server",
      "- id: mcp-web",
      "  name: '@deepseek-ai/dsh-mcp-client'",
      "  config:",
      "    serverName: web-search",
      "    transport: streamable-http",
      "    url: https://example.com/mcp",
    ].join("\n");
    const patch = scratchPatch(patchBody);
    const before = readFileSyncForTest(patch);
    const found = detectPatchEntries(nodeMcpIo(), patch);
    assert.equal(found.entries.length, 1);
    assert.equal(found.entries[0]?.serverName, "web-search");
    assert.equal(readFileSyncForTest(patch), before, "patch file must be untouched by detection");
  });

  it("ignores non-MCP patches and reports nothing", async () => {
    const patch = scratchPatch(["- id: plain", "  name: something-else"].join("\n"));
    const found = detectPatchEntries(nodeMcpIo(), patch);
    assert.equal(found.entries.length, 0);
    const result = await mcpRun({_ : "list"}, {profilePatch: patch});
    assert.ok(!result.markdown.includes("Migration available"));
  });
});

// ---------------------------------------------------------------------------
// add / remove
// ---------------------------------------------------------------------------

describe("mcp add", () => {
  it("writes a valid stdio instance to the bridge store and prints paste instructions", async () => {
    const {home, storePath} = scratchHome();
    const patch = scratchPatch("");
    const result = await mcpRun({_ : "add gh stdio npx -y @modelcontextprotocol/server-github"}, {home, profilePatch: patch});
    assert.match(result.markdown, /Store target: /);
    assert.match(result.markdown, /Wrote 1 instance/);
    assert.match(result.markdown, /copy the yaml block/);
    assert.match(result.markdown, /cordis\.patch\.yml/);
    assert.match(result.markdown, /never edits that file/);
    const loaded = loadInstances(nodeMcpIo(), storePath);
    assert.equal(loaded.length, 1);
    assert.equal((loaded[0]?.config as {serverName?: string}).serverName, "gh");
  });

  it("never writes the user's profile patch on add", async () => {
    const {home} = scratchHome();
    const patchBody = ["# my patch", "- id: existing", "  name: some-plugin"].join("\n");
    const patch = scratchPatch(patchBody);
    await mcpRun({_ : "add gh stdio npx -y pkg"}, {home, profilePatch: patch});
    assert.equal(readFileSyncForTest(patch), patchBody, "patch content must be byte-identical");
    assert.ok(readFileSyncForTest(patch).includes("some-plugin"));
    assert.ok(!readFileSyncForTest(patch).includes("dsh-bridge.mcp"), "no JSON store content may leak into the patch");
  });

  it("rejects invalid names quoting the pattern and writes nothing", async () => {
    const {home, storePath} = scratchHome();
    const result = await mcpRun({_ : `add ${"x".repeat(33)} stdio npx`}, {home});
    assert.match(result.markdown, /server name must match/);
    assert.equal(existsSync(storePath), false);
  });

  it("refuses an existing serverName before any write", async () => {
    const {home, storePath} = scratchHome();
    writeFileSync(
      storePath,
      JSON.stringify({servers: [{id: "mcp-a", name: "@deepseek-ai/dsh-mcp-client", config: {serverName: "a", transport: "stdio", command: "x"}}]}),
    );
    const result = await mcpRun({_ : "add a stdio other"}, {home});
    assert.match(result.markdown, /Refused/);
    const loaded = loadInstances(nodeMcpIo(), storePath);
    assert.equal(loaded.length, 1);
    assert.equal((loaded[0]?.config as {command?: string}).command, "x");
  });

  it("dry-run prints the YAML block and writes nothing", async () => {
    const {home, storePath} = scratchHome();
    const result = await mcpRun({_ : "add web http http://localhost:3000/mcp", "dry-run": ""}, {home});
    assert.match(result.markdown, /```yaml/);
    assert.match(result.markdown, /Dry run: nothing was written/);
    assert.equal(existsSync(storePath), false);
  });

  it("accepts loopback http but refuses plain http to non-loopback without override", async () => {
    const okHome = scratchHome();
    const ok = await mcpRun({_ : "add local http http://127.0.0.1:3000/mcp"}, {home: okHome.home});
    assert.match(ok.markdown, /Wrote 1 instance/);

    const refusedHome = scratchHome();
    const refused = await mcpRun({_ : "add prod http http://example.com/mcp"}, {home: refusedHome.home});
    assert.match(refused.markdown, /allow-insecure-http|localhost\/loopback/);
    assert.equal(existsSync(refusedHome.storePath), false);
  });

  it("sse prints the streamable-http fallback guidance and writes nothing", async () => {
    const {home, storePath} = scratchHome();
    const result = await mcpRun({_ : "add legacy sse"}, {home});
    assert.match(result.markdown, /no sse transport/i);
    assert.match(result.markdown, /streamable-http/);
    assert.equal(existsSync(storePath), false);
  });
});

describe("mcp remove", () => {
  it("requires confirmation without --yes and deletes exactly one instance with it", async () => {
    const seed = JSON.stringify({
      servers: [
        {id: "mcp-a", name: "@deepseek-ai/dsh-mcp-client", config: {serverName: "aaa", transport: "stdio", command: "x"}},
        {id: "mcp-b", name: "@deepseek-ai/dsh-mcp-client", config: {serverName: "bbb", transport: "stdio", command: "y"}},
      ],
    });
    const {home, storePath} = scratchHome();
    writeFileSync(storePath, seed);
    const confirmNeeded = await mcpRun({_ : "remove aaa"}, {home});
    assert.match(confirmNeeded.markdown, /--yes/);
    assert.equal(loadInstances(nodeMcpIo(), storePath).length, 2);

    const removed = await mcpRun({_ : "remove aaa", yes: ""}, {home});
    assert.match(removed.markdown, /Removed 1 instance/);
    const remaining = loadInstances(nodeMcpIo(), storePath);
    assert.equal(remaining.length, 1);
    assert.equal((remaining[0]?.config as {serverName?: string}).serverName, "bbb");
  });

  it("unknown names exit with near-match hints and write nothing", async () => {
    const {home, storePath} = scratchHome();
    writeFileSync(
      storePath,
      JSON.stringify({servers: [{id: "mcp-github", name: "@deepseek-ai/dsh-mcp-client", config: {serverName: "github", transport: "stdio", command: "x"}}]}),
    );
    const result = await mcpRun({_ : "remove github2"}, {home});
    assert.match(result.markdown, /Unknown server/);
    assert.match(result.markdown, /github/);
    assert.equal(loadInstances(nodeMcpIo(), storePath).length, 1);
  });
});

// ---------------------------------------------------------------------------
// test checklist
// ---------------------------------------------------------------------------

describe("mcp test", () => {
  it("emits the six-phase handshake checklist without spawning anything", async () => {
    const result = await mcpRun({_ : "test github"});
    for (const phase of ["0. Resolve", "1. Spawn / reach", "2. Initialize", "3. Discover", "4. Name projection", "5. Teardown"]) {
      assert.ok(result.markdown.includes(phase), `missing phase ${phase}`);
    }
    const phases = (result.data as {phases?: unknown[]}).phases ?? [];
    assert.equal(phases.length, 6);
  });
});

// ---------------------------------------------------------------------------
// import-from claude
// ---------------------------------------------------------------------------

describe("mcp import-from claude", () => {
  it("reports exists+parse verdicts and the conversion mapping, touching nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dshb-mcp-claude-"));
    cleanupPaths.push(dir);
    const claudePath = join(dir, ".claude.json");
    writeFileSync(
      claudePath,
      JSON.stringify({
        mcpServers: {
          "my.github": {type: "stdio", command: "npx", args: ["-y", "server-github"], env: {GITHUB_TOKEN: "ghp_secretvalue123456"}},
          web: {type: "http", url: "https://example.com/mcp"},
          old: {type: "sse", url: "https://example.com/sse"},
          off: {type: "stdio", command: "x", disabled: true},
        },
      }),
    );
    const originalHome = process.env["HOME"];
    process.env["HOME"] = dir;
    try {
      const before = readFileSyncForTest(claudePath);
      const {home} = scratchHome();
      const result = await mcpRun({_ : "import-from claude"}, {home});
      assert.equal(readFileSyncForTest(claudePath), before, "source config must be untouched");
      assert.match(result.markdown, /\.claude\.json/);
      assert.match(result.markdown, /Conversion mapping/);
      assert.match(result.markdown, /SKIP.*sse unsupported|sse unsupported/s);
      assert.match(result.markdown, /disabled upstream/);
      assert.match(result.markdown, /my\.github.*my-github|normalized to my-github/s);
      assert.ok(!result.markdown.includes("ghp_secretvalue123456"), "secret value must never render");
    } finally {
      if (originalHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = originalHome;
    }
  });

  it("missing source reports source-not-found style info and exits clean", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dshb-mcp-empty-"));
    cleanupPaths.push(dir);
    const originalHome = process.env["HOME"];
    process.env["HOME"] = dir;
    try {
      const {home} = scratchHome();
      const result = await mcpRun({_ : "import-from claude"}, {home});
      assert.match(result.markdown, /0 servers/);
    } finally {
      if (originalHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = originalHome;
    }
  });
});

/** Local fs helper so this file needs no extra top-level imports beyond test utils. */
function readFileSyncForTest(path: string): string {
  return readFileSync(path, "utf8");
}
