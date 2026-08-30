/**
 * /bridge-connect custom, and the route step of /bridge-setup that uses it.
 *
 * The load-bearing case is byte-for-byte: the block this code renders for the
 * OpenCode Zen route must equal, character for character, the block a human
 * hand-wrote and then verified against the live endpoint
 * (docs/getting-started.md:103-132; docs/research/e2e-onboarding-journey.md:70-88;
 * the route was accepted by the harness and reached the model, per
 * docs/research/e2e-npx-journey.md:186-203). Anything less than equality here
 * is a route that may silently not load, which is the exact failure mode the
 * getting-started notes warn about.
 *
 * Also pinned:
 *  - `.bak` is created and holds the pre-call bytes verbatim.
 *  - No secret ever reaches written content or rendered output, and a
 *    key-shaped `--key-env` is refused before any write.
 *  - Verification detects a route that failed to land: a write that silently
 *    drops the selection row is reported as unverified and rolled back.
 *
 * Every case uses an in-memory io double; nothing touches a real filesystem.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRoute, routeAlreadyPresent, routeBlock, selectionPresent } from "../src/commands/connect-apply.js";
import { assertNotSecret, defaultKeyEnv, planCustomRoute, renderCustomRouteYaml, resolveCustomRoute, routeKeyFromUrl, } from "../src/commands/connect-custom.js";
import { parseConnectArgs, parseCustomArgs, runConnect } from "../src/commands/connect.js";
import { isRouteWrite, runSetup } from "../src/commands/setup.js";
import * as output from "../src/lib/output.js";
/** A value that must never appear in written content or in rendered output. */
const PLANTED_SECRET = "sk-zen-CUSTOMCANARY-1111111111111111111111";
const PATCH_PATH = "/fake/.dsh/profiles/web/cordis.patch.yml";
/**
 * The verified working block, transcribed from docs/getting-started.md:103-132.
 * Kept as one literal so a drift in rendering is a diff, not a reasoning task.
 */
const KNOWN_GOOD = `- id: llm-pi-ai
  config:
    providers:
      opencode-zen:
        displayName: OpenCode Zen
        apiKeyEnv: OPENCODE_ZEN_API_KEY
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
        models:
          - id: qwen3.5-plus
            name: Qwen 3.5 Plus
            contextWindow: 262144
            maxTokens: 32768
- id: agent-default-model
  config:
    provider: opencode-zen
    model: qwen3.5-plus`;
/** The flags a user types for that route. */
const ZEN_ARGS = Object.freeze({
    _: "custom",
    url: "https://opencode.ai/zen/go/v1",
    model: "qwen3.5-plus",
    name: "opencode-zen",
    "key-env": "OPENCODE_ZEN_API_KEY",
    display: "OpenCode Zen",
    "model-name": "Qwen 3.5 Plus",
});
function makeContext() {
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
/** In-memory ApplyIo, optionally corrupting the write to simulate a lost row. */
function fakeIo(initial = {}, options = {}) {
    const files = new Map(Object.entries(initial));
    return {
        files,
        exists: (path) => files.has(path),
        readFile: (path) => {
            const value = files.get(path);
            if (value === undefined)
                throw new Error(`ENOENT: ${path}`);
            return value;
        },
        writeFile: (path, content) => {
            if (options.failWrite === true)
                throw new Error("EACCES: injected write failure");
            // A silently-lossy filesystem: the provider row lands, the selection row
            // does not. This is what "a route that failed to land" looks like.
            files.set(path, options.dropSelection === true ? content.split("- id: agent-default-model")[0] ?? "" : content);
        },
        copyFile: (from, to) => {
            const value = files.get(from);
            if (value === undefined)
                throw new Error(`ENOENT: ${from}`);
            files.set(to, value);
        },
        removeFile: (path) => {
            files.delete(path);
        },
    };
}
/** Minimal SetupIo over a plain map, for the setup-step cases. */
function fakeSetupIo(initial = {}) {
    const files = new Map(Object.entries(initial));
    return {
        files,
        exists: (path) => files.has(path),
        readFile: (path) => {
            const value = files.get(path);
            if (value === undefined)
                throw new Error(`ENOENT: ${path}`);
            return value;
        },
        writeFile: (path, contents) => {
            files.set(path, contents);
        },
        listDir: () => [],
    };
}
/** State file that puts the flow on the route step. */
function stateOnRoute() {
    return JSON.stringify({
        version: 1,
        step: "route",
        answers: { welcome: "yes", harness: "first" },
        skipped: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    });
}
describe("custom route rendering", () => {
    it("renders the OpenCode Zen block byte-for-byte as the verified working block", () => {
        const resolved = resolveCustomRoute(parseCustomArgs(ZEN_ARGS));
        assert.equal(renderCustomRouteYaml(resolved), KNOWN_GOOD);
    });
    it("reaches the same bytes from the minimum flags, using the adapter's own defaults", () => {
        // contextWindow 262144 and maxTokens 32768 are DEFAULT_CONTEXT_WINDOW and
        // DEFAULT_MAX_TOKENS from dsh-llm-pi-ai/lib/types/config.d.ts:36-38, so an
        // unspecified capacity renders what the adapter would have assumed anyway.
        const resolved = resolveCustomRoute({
            route: "opencode-zen",
            baseUrl: "https://opencode.ai/zen/go/v1/",
            model: "qwen3.5-plus",
            displayName: "OpenCode Zen",
            modelName: "Qwen 3.5 Plus",
        });
        assert.equal(renderCustomRouteYaml(resolved), KNOWN_GOOD);
    });
    it("emits all three jointly-required fields plus the separate selection row", () => {
        const lines = planCustomRoute(parseCustomArgs(ZEN_ARGS)).lines.join("\n");
        for (const required of ["        api: ", "        baseURL: ", "        models:"]) {
            assert.ok(lines.includes(required), `missing ${required.trim()}`);
        }
        assert.ok(lines.includes("- id: agent-default-model"), "selection row missing");
        assert.ok(planCustomRoute(parseCustomArgs(ZEN_ARGS)).selects === true);
    });
    it("derives sane defaults for route key and credential name", () => {
        assert.equal(routeKeyFromUrl("https://gateway.acme.example/v1"), "gateway");
        assert.equal(defaultKeyEnv("opencode-zen"), "OPENCODE_ZEN_API_KEY");
        const resolved = resolveCustomRoute({ route: "", baseUrl: "https://gateway.acme.example/v1", model: "acme-large" });
        assert.equal(resolved.route, "gateway");
        assert.equal(resolved.apiKeyEnv, "GATEWAY_API_KEY");
        assert.equal(resolved.api, "openai-completions");
    });
    it("refuses malformed input rather than emitting a route that fails silently", () => {
        assert.throws(() => resolveCustomRoute({ route: "x", baseUrl: "not-a-url", model: "m" }), /absolute URL/);
        assert.throws(() => resolveCustomRoute({ route: "x", baseUrl: "https://a.example/v1", model: "" }), /--model is required/);
        assert.throws(() => resolveCustomRoute({ route: "Bad Route", baseUrl: "https://a.example/v1", model: "m" }), /lowercase route key/);
        assert.throws(() => parseCustomArgs({ _: "custom", url: "https://a.example/v1" }), /usage:/);
    });
});
describe("secret safety", () => {
    it("refuses a key-shaped --key-env before anything is planned", () => {
        assert.throws(() => assertNotSecret(PLANTED_SECRET), /NAME of a credential reference/);
        assert.throws(() => planCustomRoute({ route: "zen", baseUrl: "https://a.example/v1", model: "m", apiKeyEnv: PLANTED_SECRET }), /NAME of a credential reference/);
    });
    it("never writes a secret into the file or into rendered output", () => {
        const io = fakeIo();
        // The plan the runner builds, written through the same applyRoute path.
        const plan = planCustomRoute(parseCustomArgs(ZEN_ARGS));
        const outcome = applyRoute(io, PATCH_PATH, plan);
        assert.equal(outcome.written, true);
        const written = io.files.get(PATCH_PATH) ?? "";
        assert.ok(!written.includes(PLANTED_SECRET), "secret leaked into the written file");
        assert.ok(written.includes("apiKeyEnv: OPENCODE_ZEN_API_KEY"), "credential reference name missing");
        assert.ok(!/sk-[A-Za-z0-9-]{10,}/.test(written), "a key-shaped literal reached the file");
    });
    it("refuses the setup route write when the key is pasted as the variable name", async () => {
        const io = fakeSetupIo({ [setupState()]: stateOnRoute() });
        const applyIo = fakeIo();
        const result = await runSetup(makeContext(), { ...ZEN_ARGS, _: "", "key-env": PLANTED_SECRET }, { io, applyIo, now: new Date("2026-02-02T00:00:00.000Z") });
        assert.ok(!result.markdown.includes(PLANTED_SECRET), "secret echoed back to the user");
        assert.equal(applyIo.files.size, 0, "a file was written despite the refusal");
        assert.equal(result.data.kind, "setup.route.refused");
    });
});
/** The state-file path runSetup derives from the fake home. */
function setupState() {
    return "/fake/.dsh-bridge/setup-state.json";
}
describe("writing the route", () => {
    it("creates a .bak holding the pre-call bytes verbatim", () => {
        const before = "# seeded by the installer\n- id: bridge\n  config:\n    profile: web\n";
        const io = fakeIo({ [PATCH_PATH]: before });
        const outcome = applyRoute(io, PATCH_PATH, planCustomRoute(parseCustomArgs(ZEN_ARGS)));
        assert.equal(outcome.written, true);
        assert.equal(outcome.backupPath, `${PATCH_PATH}.bak`);
        assert.equal(io.files.get(`${PATCH_PATH}.bak`), before);
        const after = io.files.get(PATCH_PATH) ?? "";
        assert.ok(after.startsWith(before), "the previous content was not preserved");
        assert.ok(after.includes(KNOWN_GOOD), "the known-good block is not present verbatim in the file");
    });
    it("verifies both rows on re-read, and reports a route that failed to land", () => {
        const before = "[]\n";
        const io = fakeIo({ [PATCH_PATH]: before }, { dropSelection: true });
        const outcome = applyRoute(io, PATCH_PATH, planCustomRoute(parseCustomArgs(ZEN_ARGS)));
        assert.equal(outcome.written, false, "a half-landed route was reported as written");
        assert.match(outcome.error ?? "", /not found in the file after writing/);
        assert.equal(io.files.get(PATCH_PATH), before, "the file was not rolled back to its previous bytes");
    });
    it("treats a declared-but-unselected provider as a half route, not as done", () => {
        const plan = planCustomRoute(parseCustomArgs(ZEN_ARGS));
        const declaredOnly = KNOWN_GOOD.split("- id: agent-default-model")[0] ?? "";
        assert.equal(selectionPresent(declaredOnly, "opencode-zen"), false);
        assert.equal(routeAlreadyPresent(declaredOnly, plan), false);
        assert.equal(routeAlreadyPresent(routeBlock(plan), plan), true);
        const io = fakeIo({ [PATCH_PATH]: declaredOnly });
        const outcome = applyRoute(io, PATCH_PATH, plan);
        assert.equal(outcome.written, false);
        assert.match(outcome.error ?? "", /no agent-default-model row selects it/);
    });
    it("refuses a patch file that is not a plain YAML sequence", () => {
        const io = fakeIo({ [PATCH_PATH]: "plugins:\n  - id: bridge\n" });
        const outcome = applyRoute(io, PATCH_PATH, planCustomRoute(parseCustomArgs(ZEN_ARGS)));
        assert.equal(outcome.written, false);
        assert.match(outcome.error ?? "", /not a plain YAML sequence/);
    });
});
describe("command surface", () => {
    it("parses the custom verb into a custom invocation", () => {
        const invocation = parseConnectArgs(ZEN_ARGS);
        assert.equal(invocation.mode, "custom");
        assert.equal(invocation.confirmed, false);
        assert.equal(parseCustomArgs(ZEN_ARGS).route, "opencode-zen");
        assert.equal(parseConnectArgs({ ...ZEN_ARGS, apply: "" }).confirmed, true);
    });
    it("previews without writing and names the exact command that would write", async () => {
        const result = await runConnect(makeContext(), ZEN_ARGS);
        assert.match(result.markdown, /Nothing has been written/);
        assert.match(result.markdown, /\/bridge-connect custom --url https:\/\/opencode\.ai\/zen\/go\/v1 --model qwen3\.5-plus/);
        assert.match(result.markdown, /--apply/);
        assert.equal(result.data.kind, "connect.apply.preview");
    });
    it("renders a usage body rather than throwing on a bad custom invocation", async () => {
        const result = await runConnect(makeContext(), { _: "custom", url: "https://a.example/v1" });
        assert.match(result.markdown, /usage: \/bridge-connect custom/);
        assert.equal(result.data.kind, "connect.custom.refused");
    });
});
describe("setup completes the job", () => {
    it("detects a route write at the route step", () => {
        assert.equal(isRouteWrite(ZEN_ARGS), true);
        assert.equal(isRouteWrite({ url: "https://a.example/v1" }), false);
        assert.equal(isRouteWrite({ _: "yes" }), false);
    });
    it("writes the route, backs the file up, and reports what changed", async () => {
        const io = fakeSetupIo({ [setupState()]: stateOnRoute() });
        const before = "# dsh profile patch\n[]\n";
        const applyIo = fakeIo({ [PATCH_PATH]: before });
        const result = await runSetup(makeContext(), { ...ZEN_ARGS, _: "" }, { io, applyIo, now: new Date("2026-02-02T00:00:00.000Z") });
        const data = result.data;
        assert.equal(data.kind, "setup.route.written");
        assert.equal(data.verified, true);
        assert.equal(data.backupPath, `${PATCH_PATH}.bak`);
        assert.equal(applyIo.files.get(`${PATCH_PATH}.bak`), before);
        assert.ok((applyIo.files.get(PATCH_PATH) ?? "").includes(KNOWN_GOOD));
        // The report names the file, both rows, the backup, and the verification.
        assert.match(result.markdown, /Route written/);
        assert.match(result.markdown, /agent-default-model -> opencode-zen/);
        assert.match(result.markdown, /both rows found on re-read/);
        // And it tells the user which variable to export, not what its value is.
        assert.match(result.markdown, /export OPENCODE_ZEN_API_KEY=/);
        assert.ok(!result.markdown.includes(PLANTED_SECRET));
    });
    it("keeps the user on the route step when the write does not land", async () => {
        const io = fakeSetupIo({ [setupState()]: stateOnRoute() });
        const applyIo = fakeIo({ [PATCH_PATH]: "[]\n" }, { dropSelection: true });
        const result = await runSetup(makeContext(), { ...ZEN_ARGS, _: "" }, { io, applyIo, now: new Date("2026-02-02T00:00:00.000Z") });
        assert.equal(result.data.kind, "setup.route.refused");
        assert.match(result.markdown, /The route was not written/);
        assert.match(result.markdown, /step 3 of 7/);
    });
    it("offers the custom route at the route step even with no credential found", async () => {
        const io = fakeSetupIo({ [setupState()]: stateOnRoute() });
        const result = await runSetup(makeContext(), {}, { io, applyIo: fakeIo(), now: new Date(), env: {} });
        assert.match(result.markdown, /OpenAI-compatible endpoint right here/);
        assert.match(result.markdown, /--key-env OPENCODE_ZEN_API_KEY/);
    });
});
//# sourceMappingURL=connect-custom-test.js.map