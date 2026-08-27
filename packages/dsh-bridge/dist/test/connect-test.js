/**
 * /bridge-connect tests (docs/specs/commands/connect.md).
 *
 * Three things are pinned here:
 *  1. Matrix rendering over injected fake rows, so the table shape is checked
 *     without depending on whatever credentials this machine happens to hold.
 *  2. The no-secret-leak invariant (S1): a synthetic secret is planted in a
 *     fake HOME and in the environment, then every rendered surface is
 *     asserted not to contain it, nor any file contents.
 *  3. Expired-state copy: an expired OAuth file yields status `expired` with
 *     the vendor re-login hint, and is never reported as `found`.
 *
 * No test touches the network: the smoke test takes its HTTP client through
 * the `fetchImpl` seam.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { PROVIDER_PROFILES, SMOKE_PROVIDERS, detectCredentials, expiredAdvice, nextSteps, parseConnectArgs, renderMatrix, renderSmoke, runConnect, smokeProvider, unmetProviders, } from "../src/commands/connect.js";
import * as output from "../src/lib/output.js";
/** A value long and distinctive enough that any leak is unambiguous. */
const PLANTED_SECRET = "sk-ant-planted-000000000000000000000-LEAKCANARY";
/** File content that must never be echoed, even for malformed rows. */
const PLANTED_CONTENTS = "totally-not-json-CONTENTSCANARY";
const tempRoots = [];
after(() => {
    for (const root of tempRoots)
        rmSync(root, { recursive: true, force: true });
});
function makeHome() {
    const root = mkdtempSync(join(tmpdir(), "dsh-bridge-connect-"));
    tempRoots.push(root);
    return root;
}
function makeContext(home) {
    const dshHome = join(home, ".dsh");
    return {
        profile: "web",
        profileSource: "mount",
        paths: {
            home,
            dshHome,
            profilePatch: join(dshHome, "profiles", "web", "cordis.patch.yml"),
            profilePackageJson: join(dshHome, "profiles", "web", "package.json"),
        },
        output,
    };
}
function writeJson(path, value) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
}
describe("matrix rendering", () => {
    const rows = [
        { provider: "anthropic", source: "~/.claude/.credentials.json", status: "found", detail: "oauth token present" },
        { provider: "openai", source: "$OPENAI_API_KEY", status: "not found", detail: "-" },
        { provider: "google", source: "~/.gemini/oauth_creds.json", status: "expired", detail: expiredAdvice("google") },
    ];
    it("renders one table row per detection row, with the status column", () => {
        const markdown = renderMatrix(makeContext(makeHome()), rows);
        assert.match(markdown, /\| PROVIDER \| SOURCE \| STATUS \| DETAIL \|/);
        for (const row of rows) {
            assert.ok(markdown.includes(`| ${row.provider} | ${row.source} | ${row.status} |`), `missing row for ${row.source}`);
        }
    });
    it("states the profile and the never-copies-secrets promise", () => {
        const markdown = renderMatrix(makeContext(makeHome()), rows);
        assert.match(markdown, /profile: web/);
        assert.match(markdown, /never reads a secret into the transcript/);
    });
    it("contains no emoji", () => {
        const markdown = renderMatrix(makeContext(makeHome()), rows);
        assert.ok(!/\p{Extended_Pictographic}/u.test(markdown), "emoji are banned in rendered output");
    });
    it("guides every provider without a found credential", () => {
        const ctx = makeContext(makeHome());
        const markdown = renderMatrix(ctx, rows);
        for (const provider of unmetProviders(rows)) {
            assert.ok(markdown.includes(`- ${provider}:`), `no guidance for ${provider}`);
        }
        // anthropic has a found row, so it is not in the guidance list.
        assert.ok(!markdown.includes("- anthropic:"));
    });
    it("names the env var and the profile file to open, per provider", () => {
        const ctx = makeContext(makeHome());
        const steps = nextSteps(ctx, "openai", rows).join("\n");
        assert.match(steps, /export OPENAI_API_KEY=/);
        assert.ok(steps.includes(ctx.paths.profilePatch), "guidance must point at the profile patch file");
    });
    it("points a found provider at its smoke test instead of an export", () => {
        const ctx = makeContext(makeHome());
        const steps = nextSteps(ctx, "anthropic", rows).join("\n");
        assert.match(steps, /\/bridge-connect test anthropic/);
        assert.ok(!steps.includes("export ANTHROPIC_API_KEY="));
    });
});
describe("expired state", () => {
    it("carries the vendor re-login command for providers that have one", () => {
        assert.equal(expiredAdvice("google"), "oauth token expired; re-run: gemini auth login");
        assert.equal(expiredAdvice("anthropic"), "oauth token expired; re-run: claude /login");
        assert.equal(expiredAdvice("deepseek"), "oauth token expired");
    });
    it("classifies a past expiry as expired, never as found", () => {
        const home = makeHome();
        writeJson(join(home, ".gemini", "oauth_creds.json"), {
            access_token: PLANTED_SECRET,
            refresh_token: PLANTED_SECRET,
            expiry_date: Date.now() - 60_000,
        });
        const rows = detectCredentials(makeContext(home), {});
        const row = rows.find((candidate) => candidate.source === "~/.gemini/oauth_creds.json");
        assert.equal(row?.status, "expired");
        assert.equal(row?.detail, expiredAdvice("google"));
    });
    it("classifies a future expiry as found", () => {
        const home = makeHome();
        writeJson(join(home, ".gemini", "oauth_creds.json"), {
            access_token: PLANTED_SECRET,
            expiry_date: Date.now() + 3_600_000,
        });
        const rows = detectCredentials(makeContext(home), {});
        const row = rows.find((candidate) => candidate.source === "~/.gemini/oauth_creds.json");
        assert.equal(row?.status, "found");
    });
});
describe("no-secret-leak invariant (S1)", () => {
    /** Build a home holding every source shape, all stuffed with the canary. */
    function plantedHome() {
        const home = makeHome();
        writeJson(join(home, ".claude", ".credentials.json"), {
            claudeAiOauth: { accessToken: PLANTED_SECRET, refreshToken: PLANTED_SECRET, expiresAt: Date.now() + 86_400_000 },
        });
        writeJson(join(home, ".codex", "auth.json"), { tokens: { access_token: PLANTED_SECRET } });
        writeJson(join(home, ".local", "share", "opencode", "auth.json"), {
            anthropic: { type: "api", key: PLANTED_SECRET },
        });
        mkdirSync(join(home, ".dsh"), { recursive: true });
        writeFileSync(join(home, ".dsh", ".env"), `ANTHROPIC_API_KEY=${PLANTED_SECRET}\n`);
        return home;
    }
    const env = {
        ANTHROPIC_API_KEY: PLANTED_SECRET,
        OPENAI_API_KEY: PLANTED_SECRET,
        ANTHROPIC_AUTH_TOKEN: PLANTED_SECRET,
        ANTHROPIC_BASE_URL: "https://gateway.example.com/v1",
    };
    it("never emits a planted secret in any row detail", () => {
        const rows = detectCredentials(makeContext(plantedHome()), env);
        for (const row of rows) {
            assert.ok(!row.detail.includes(PLANTED_SECRET), `secret leaked in detail for ${row.source}`);
            assert.ok(!row.source.includes(PLANTED_SECRET));
        }
    });
    it("never emits a planted secret in the rendered markdown", () => {
        const home = plantedHome();
        const markdown = renderMatrix(makeContext(home), detectCredentials(makeContext(home), env));
        assert.ok(!markdown.includes(PLANTED_SECRET), "secret leaked into rendered output");
        // The mask keeps at most 4 leading and 4 trailing characters.
        assert.ok(!markdown.includes(PLANTED_SECRET.slice(0, 12)));
    });
    it("never echoes file contents for a malformed source", () => {
        const home = makeHome();
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(join(home, ".codex", "auth.json"), PLANTED_CONTENTS);
        const ctx = makeContext(home);
        const rows = detectCredentials(ctx, {});
        const row = rows.find((candidate) => candidate.source === "~/.codex/auth.json");
        assert.equal(row?.status, "malformed");
        assert.ok(!renderMatrix(ctx, rows).includes(PLANTED_CONTENTS), "file contents leaked into output");
    });
    it("reports dotenv key names only, never their values", () => {
        const home = makeHome();
        mkdirSync(join(home, ".dsh"), { recursive: true });
        writeFileSync(join(home, ".dsh", ".env"), `DEEPSEEK_API_KEY=${PLANTED_SECRET}\n`);
        const rows = detectCredentials(makeContext(home), {});
        const row = rows.find((candidate) => candidate.source === "~/.dsh/.env");
        assert.equal(row?.status, "found");
        assert.equal(row?.detail, "defines DEEPSEEK_API_KEY");
    });
    it("keeps the command payload free of secrets too", async () => {
        const home = plantedHome();
        const result = await runConnect(makeContext(home), {});
        assert.ok(!JSON.stringify(result.data).includes(PLANTED_SECRET));
        assert.ok(!result.markdown.includes(PLANTED_SECRET));
    });
});
describe("smoke test", () => {
    it("sends exactly one HEAD request and no auth header", async () => {
        const calls = [];
        const fetchImpl = async (url, init) => {
            calls.push({ url, method: init.method });
            return { status: 200 };
        };
        const outcome = await smokeProvider("deepseek", { fetchImpl });
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.method, "HEAD");
        assert.equal(calls[0]?.url, PROVIDER_PROFILES["deepseek"]?.baseUrl);
        assert.equal(outcome.ok, true);
        assert.equal(outcome.status, 200);
    });
    it("treats 401 as reachable: the endpoint answered", async () => {
        const outcome = await smokeProvider("openai", { fetchImpl: async () => ({ status: 401 }) });
        assert.equal(outcome.ok, true);
        assert.match(outcome.detail, /no auth header sent/);
    });
    it("degrades gracefully when the machine is offline", async () => {
        const offline = async () => {
            const error = new Error("getaddrinfo ENOTFOUND");
            error.code = "ENOTFOUND";
            throw error;
        };
        const outcome = await smokeProvider("anthropic", { fetchImpl: offline });
        assert.equal(outcome.ok, false);
        assert.match(outcome.detail, /unreachable \(ENOTFOUND\)/);
        const markdown = renderSmoke(makeContext(makeHome()), "anthropic", outcome);
        assert.match(markdown, /Detection still works offline/);
    });
    it("rejects an unknown provider before any request is made", async () => {
        let called = false;
        await assert.rejects(smokeProvider("not-a-provider", {
            fetchImpl: async () => {
                called = true;
                return { status: 200 };
            },
        }), /unknown provider/);
        assert.equal(called, false);
    });
});
describe("argument parsing", () => {
    it("defaults to the full matrix", () => {
        assert.deepEqual(parseConnectArgs({}), { mode: "list" });
    });
    it("accepts a provider filter", () => {
        assert.deepEqual(parseConnectArgs({ _: "OpenAI" }), { mode: "list", provider: "openai" });
    });
    it("routes test <provider> to the smoke test", () => {
        assert.deepEqual(parseConnectArgs({ _: "test", rest: "deepseek" }), { mode: "test", provider: "deepseek" });
    });
    it("rejects an unknown verb with a usage hint", () => {
        assert.throws(() => parseConnectArgs({ _: "frobnicate" }), /usage: \/connect/);
    });
    it("requires a provider after test", () => {
        assert.throws(() => parseConnectArgs({ _: "test" }), new RegExp(SMOKE_PROVIDERS[0]));
    });
});
//# sourceMappingURL=connect-test.js.map