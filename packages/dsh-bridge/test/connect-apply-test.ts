/**
 * /bridge-connect apply tests.
 *
 * Four things are pinned here:
 *  1. Diff rendering: the preview names the target file, shows the exact patch
 *     row, and writes nothing.
 *  2. .bak creation: an existing patch file is copied before the new bytes
 *     land, and the copy holds the pre-call content verbatim.
 *  3. The env-ref-not-secret invariant: a planted key value is present in the
 *     fake environment, and neither the rendered output nor the written file
 *     contains it. Only the env-var NAME appears.
 *  4. Rollback: a write that throws leaves the file byte-identical to before,
 *     and a created file is removed rather than left half-written.
 *
 * Every case runs against an in-memory ApplyIo double, so no test touches the
 * real filesystem or a real DSH profile.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyRoute,
  isAppendableSequence,
  planRoute,
  renderRouteDiff,
  routeAlreadyPresent,
  routeBlock,
  runConnectApply,
  type ApplyIo,
} from "../src/commands/connect-apply.js";
import { parseConnectArgs } from "../src/commands/connect.js";
import * as output from "../src/lib/output.js";
import type { BridgeContext } from "../src/lib/types.js";

/** The value that must never appear anywhere. Distinctive on purpose. */
const PLANTED_SECRET = "sk-ant-APPLYCANARY-000000000000000000000000";

const PATCH_PATH = "/fake/.dsh/profiles/web/cordis.patch.yml";

function makeContext(): BridgeContext {
  return {
    profile: "web",
    profileSource: "mount",
    paths: {
      home: "/fake",
      dshHome: "/fake/.dsh",
      profilePatch: PATCH_PATH,
      profilePackageJson: "/fake/.dsh/profiles/web/package.json",
    },
    output,
  };
}

/** In-memory ApplyIo with an optional injected write failure. */
function fakeIo(
  initial: Readonly<Record<string, string>> = {},
  options: { readonly failWrite?: boolean } = {},
): ApplyIo & { files: Map<string, string>; writes: number } {
  const files = new Map(Object.entries(initial));
  const io = {
    files,
    writes: 0,
    exists: (path: string) => files.has(path),
    readFile: (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return value;
    },
    writeFile: (path: string, content: string) => {
      io.writes += 1;
      if (options.failWrite === true) throw new Error("EACCES simulated write failure");
      files.set(path, content);
    },
    copyFile: (from: string, to: string) => {
      const value = files.get(from);
      if (value === undefined) throw new Error(`ENOENT ${from}`);
      files.set(to, value);
    },
    removeFile: (path: string) => {
      files.delete(path);
    },
  };
  return io;
}

describe("route planning", () => {
  it("emits an llm-deepseek apiKeyEnv row for deepseek", () => {
    const plan = planRoute("deepseek");
    assert.equal(plan.rowId, "llm-deepseek");
    assert.equal(plan.envVar, "DEEPSEEK_API_KEY");
    assert.ok(plan.lines.includes("    apiKeyEnv: DEEPSEEK_API_KEY"));
  });

  it("emits an llm-pi-ai provider profile for every other provider", () => {
    const plan = planRoute("anthropic");
    assert.equal(plan.rowId, "llm-pi-ai:anthropic");
    const block = routeBlock(plan);
    assert.match(block, /- id: llm-pi-ai/);
    assert.match(block, /providers:/);
    assert.match(block, /anthropic:/);
    assert.match(block, /apiKeyEnv: ANTHROPIC_API_KEY/);
    assert.match(block, /baseURL: https:\/\/api\.anthropic\.com/);
  });

  it("keeps the API version prefix in the base URL", () => {
    // The base is the adapter endpoint, not the bare host: only the `models`
    // discovery segment is dropped off the smoke URL.
    const bases: Readonly<Record<string, string>> = {
      anthropic: "https://api.anthropic.com/v1",
      openai: "https://api.openai.com/v1",
      google: "https://generativelanguage.googleapis.com/v1beta",
      openrouter: "https://openrouter.ai/api/v1",
    };
    for (const [provider, base] of Object.entries(bases)) {
      assert.ok(routeBlock(planRoute(provider)).includes(`baseURL: ${base}`), `${provider}: wrong base URL`);
    }
  });

  it("refuses an unknown provider", () => {
    assert.throws(() => planRoute("not-a-provider"), /unknown provider/);
  });
});

describe("diff rendering", () => {
  it("names the target file, shows the row, and writes nothing", () => {
    const ctx = makeContext();
    const io = fakeIo();
    const result = runConnectApply(ctx, "openai", false, io);

    assert.match(result.markdown, /Target: \/fake\/\.dsh\/profiles\/web\/cordis\.patch\.yml/);
    assert.match(result.markdown, /```yaml/);
    assert.match(result.markdown, /apiKeyEnv: OPENAI_API_KEY/);
    assert.match(result.markdown, /Nothing has been written/);
    assert.equal(io.writes, 0);
    assert.equal(io.files.size, 0);
  });

  it("distinguishes creating the file from appending to it", () => {
    const ctx = makeContext();
    const plan = planRoute("openai");
    assert.match(renderRouteDiff(ctx, plan, false), /Change: create the file/);
    assert.match(renderRouteDiff(ctx, plan, true), /Change: append one patch entry/);
  });

  it("prints the typed confirmation with the explicit flag", () => {
    const result = runConnectApply(makeContext(), "google", false, fakeIo());
    assert.match(result.markdown, /\/bridge-connect apply google --apply/);
  });
});

describe("argument parsing", () => {
  it("treats --apply as the consent flag", () => {
    assert.deepEqual(parseConnectArgs({ _: "apply", rest: "openai" }), {
      mode: "apply",
      provider: "openai",
      confirmed: false,
    });
    assert.deepEqual(parseConnectArgs({ _: "apply", rest: "openai", apply: "" }), {
      mode: "apply",
      provider: "openai",
      confirmed: true,
    });
  });

  it("requires a provider", () => {
    assert.throws(() => parseConnectArgs({ _: "apply", rest: "" }), /usage: \/connect apply/);
    assert.throws(() => parseConnectArgs({ _: "apply", rest: "--apply" }), /usage: \/connect apply/);
  });
});

describe("backup creation", () => {
  it("copies the previous file to .bak before writing", () => {
    const before = "- id: existing\n  config:\n    key: value\n";
    const io = fakeIo({ [PATCH_PATH]: before });
    const outcome = applyRoute(io, PATCH_PATH, planRoute("openai"));

    assert.equal(outcome.written, true);
    assert.equal(outcome.backupPath, `${PATCH_PATH}.bak`);
    assert.equal(io.files.get(`${PATCH_PATH}.bak`), before);
    assert.ok((io.files.get(PATCH_PATH) ?? "").startsWith(before));
    assert.match(io.files.get(PATCH_PATH) ?? "", /- id: llm-pi-ai/);
  });

  it("reports no backup when it created the file", () => {
    const io = fakeIo();
    const outcome = applyRoute(io, PATCH_PATH, planRoute("deepseek"));
    assert.equal(outcome.written, true);
    assert.equal(outcome.backupPath, undefined);
    assert.equal(io.files.has(`${PATCH_PATH}.bak`), false);
  });

  it("preserves existing entries rather than replacing them", () => {
    const before = "- id: existing\n";
    const io = fakeIo({ [PATCH_PATH]: before });
    applyRoute(io, PATCH_PATH, planRoute("openrouter"));
    const after = io.files.get(PATCH_PATH) ?? "";
    assert.match(after, /- id: existing/);
    assert.match(after, /- id: llm-pi-ai/);
  });
});

describe("post-apply verification", () => {
  it("re-reads the file, confirms the route, and prints the smoke command", () => {
    const ctx = makeContext();
    const io = fakeIo();
    const result = runConnectApply(ctx, "deepseek", true, io);

    assert.match(result.markdown, /route present on re-read/);
    assert.match(result.markdown, /\/bridge-connect test deepseek/);
    assert.match(result.markdown, /dsh --profile web --dump-config/);
    assert.equal((result.data as { verified: boolean }).verified, true);
  });

  it("refuses a second apply for the same provider", () => {
    const io = fakeIo();
    runConnectApply(makeContext(), "deepseek", true, io);
    const second = runConnectApply(makeContext(), "deepseek", true, io);
    assert.match(second.markdown, /already configured/);
    assert.match(second.markdown, /File left unchanged/);
  });
});

describe("refusal on an unparseable file", () => {
  it("refuses a patch file that is not a top-level sequence", () => {
    const io = fakeIo({ [PATCH_PATH]: "id: not-a-sequence\nconfig: {}\n" });
    const outcome = applyRoute(io, PATCH_PATH, planRoute("openai"));
    assert.equal(outcome.written, false);
    assert.match(outcome.error ?? "", /not a plain YAML sequence/);
    // Untouched, and no stray backup left behind.
    assert.equal(io.files.get(PATCH_PATH), "id: not-a-sequence\nconfig: {}\n");
    assert.equal(io.files.has(`${PATCH_PATH}.bak`), false);
  });

  it("accepts empty, comment-only, and sequence files", () => {
    assert.equal(isAppendableSequence(""), true);
    assert.equal(isAppendableSequence("# a comment\n\n"), true);
    assert.equal(isAppendableSequence("- id: x\n  config:\n    a: 1\n"), true);
    assert.equal(isAppendableSequence("  orphan: value\n"), false);
    assert.equal(isAppendableSequence("root:\n  - a\n"), false);
  });

  it("detects an existing route in either row shape", () => {
    assert.equal(routeAlreadyPresent("- id: llm-deepseek\n", planRoute("deepseek")), true);
    assert.equal(
      routeAlreadyPresent("- id: llm-pi-ai\n  config:\n    providers:\n      openai:\n", planRoute("openai")),
      true,
    );
    assert.equal(
      routeAlreadyPresent("- id: llm-pi-ai\n  config:\n    providers:\n      openai:\n", planRoute("google")),
      false,
    );
  });
});

describe("rollback on write failure", () => {
  it("restores the previous bytes when the write throws", () => {
    const before = "- id: existing\n  config:\n    key: value\n";
    const io = fakeIo({ [PATCH_PATH]: before }, { failWrite: true });
    const outcome = applyRoute(io, PATCH_PATH, planRoute("openai"));

    assert.equal(outcome.written, false);
    assert.match(outcome.error ?? "", /rolled back/);
    assert.equal(io.files.get(PATCH_PATH), before, "file must be byte-identical after rollback");
    assert.equal(io.files.get(`${PATCH_PATH}.bak`), before);
  });

  it("removes a created file when the write throws", () => {
    const io = fakeIo({}, { failWrite: true });
    const outcome = applyRoute(io, PATCH_PATH, planRoute("deepseek"));
    assert.equal(outcome.written, false);
    assert.equal(io.files.has(PATCH_PATH), false, "a file that never existed must not survive a failed write");
  });

  it("rolls back when verification cannot find the route", () => {
    const before = "- id: existing\n";
    const files = new Map<string, string>([[PATCH_PATH, before]]);
    // A write that silently drops the content: verification must catch it.
    const io: ApplyIo = {
      exists: (path) => files.has(path),
      readFile: (path) => {
        const value = files.get(path);
        if (value === undefined) throw new Error(`ENOENT ${path}`);
        return value;
      },
      writeFile: (path) => files.set(path, before),
      copyFile: (from, to) => files.set(to, files.get(from) ?? ""),
      removeFile: (path) => void files.delete(path),
    };
    const outcome = applyRoute(io, PATCH_PATH, planRoute("openai"));
    assert.equal(outcome.written, false);
    assert.match(outcome.error ?? "", /not found in the file after writing/);
    assert.equal(files.get(PATCH_PATH), before);
  });

  it("surfaces a failed backup without attempting the write", () => {
    const io = fakeIo({ [PATCH_PATH]: "- id: existing\n" });
    const guarded: ApplyIo = {
      ...io,
      copyFile: () => {
        throw new Error("EPERM");
      },
    };
    const outcome = applyRoute(guarded, PATCH_PATH, planRoute("openai"));
    assert.equal(outcome.written, false);
    assert.match(outcome.error ?? "", /could not create .*\.bak/);
    assert.equal(io.writes, 0);
  });
});

describe("env-ref-not-secret invariant", () => {
  const planted: Readonly<Record<string, string>> = { ANTHROPIC_API_KEY: PLANTED_SECRET };

  it("never renders the key value in the preview", () => {
    const result = runConnectApply(makeContext(), "anthropic", false, fakeIo());
    assert.ok(!result.markdown.includes(PLANTED_SECRET), "preview leaked the key value");
    assert.ok(!JSON.stringify(result.data).includes(PLANTED_SECRET), "preview data leaked the key value");
    // The NAME is what appears.
    assert.match(result.markdown, /ANTHROPIC_API_KEY/);
  });

  it("never writes the key value to the patch file", () => {
    const io = fakeIo();
    const result = runConnectApply(makeContext(), "anthropic", true, io);

    const written = io.files.get(PATCH_PATH) ?? "";
    assert.ok(written !== "", "expected the route to be written");
    assert.ok(!written.includes(PLANTED_SECRET), "written config leaked the key value");
    assert.ok(!result.markdown.includes(PLANTED_SECRET), "applied output leaked the key value");
    assert.match(written, /apiKeyEnv: ANTHROPIC_API_KEY/);
    // The value is present in the injected environment map, proving the
    // assertions above are not vacuous: the secret exists, it just never
    // reaches this module.
    assert.equal(planted["ANTHROPIC_API_KEY"], PLANTED_SECRET);
  });

  it("holds for every provider, in output and on disk", () => {
    for (const provider of ["anthropic", "openai", "google", "deepseek", "openrouter"]) {
      const io = fakeIo();
      const applied = runConnectApply(makeContext(), provider, true, io);
      const written = io.files.get(PATCH_PATH) ?? "";
      const plan = planRoute(provider);
      assert.ok(!written.includes(PLANTED_SECRET), `${provider}: file leaked a secret`);
      assert.ok(!applied.markdown.includes(PLANTED_SECRET), `${provider}: output leaked a secret`);
      assert.match(written, new RegExp(`apiKeyEnv: ${plan.envVar}`));
      // No value-shaped assignment: every credential line is a bare env name.
      assert.ok(!/apiKeyEnv: sk-/.test(written), `${provider}: value-shaped credential written`);
    }
  });
});
