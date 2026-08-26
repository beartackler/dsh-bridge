/**
 * EXEC — dynamic code execution.
 *
 * Pipeline spec: "Any dynamic code execution at all => at most C" and, in a *shipped
 * bundle*, dynamic eval is critical. dsh-ponytail proves the achievable bar: it
 * externalizes schemastery precisely so its bundle contains zero dynamic execution.
 * So a hit here is not a style nit, it is a grade cap with a known-good counterexample.
 */

import { runDetectors, type Finding, type Rule } from "./types.js";

/** Shipped/loaded artifacts, where dynamic eval is critical rather than merely high. */
function isShippedArtifact(filePath: string): boolean {
  return /(^|\/)(lib|dist|build|out)\//.test(filePath) || /\.min\.[cm]?js$/.test(filePath);
}

export const dynamicEvalRule: Rule = {
  id: "dynamic-eval",
  family: "EXEC",
  severity: "high",
  version: "2026.08.1",
  description:
    "Detects runtime code execution: eval, new Function, vm.*, child_process, process.binding, and dynamic import() with a non-literal specifier.",

  match(content: string, filePath: string): Finding[] {
    const shipped = isShippedArtifact(filePath);
    const escalate = shipped ? ("critical" as const) : ("high" as const);

    return runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content,
      detectors: [
        {
          code: "001",
          // Word-boundary + call shape. `.eval(` is excluded so `foo.eval` on an unrelated
          // object does not fire; direct `eval(` is the dangerous, scope-capturing form.
          pattern: /(?<![.\w$])eval\s*\(/,
          message: "Direct call to eval() executes attacker-controllable strings as code.",
          severity: escalate,
          confidence: 0.95,
          note: "Direct eval also leaks the enclosing lexical scope, unlike indirect (0,eval).",
        },
        {
          code: "002",
          pattern: /new\s+Function\s*\(/,
          message: "new Function() compiles a string into executable code at runtime.",
          severity: escalate,
          confidence: 0.95,
          note: "schemastery's schema DSL uses this; if it is bundled rather than a peer dep, expect this hit.",
        },
        {
          code: "003",
          pattern: /\bvm\s*\.\s*(runInNewContext|runInThisContext|runInContext|compileFunction|Script)\b/,
          message: "node:vm compiles and runs code at runtime; vm is not a security boundary.",
          severity: escalate,
          confidence: 0.9,
        },
        {
          code: "004",
          pattern: /\b(child_process|node:child_process)\b/,
          message: "Imports child_process; the plugin can spawn arbitrary processes.",
          severity: escalate,
          confidence: 0.9,
        },
        {
          code: "005",
          pattern: /\b(exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)\s*\(/,
          message: "Process-spawning call; inspect the command and whether its arguments are user-controlled.",
          severity: "high",
          confidence: 0.55,
          note: "Common false positive: an unrelated local helper also named exec()/fork(). Confirm the import.",
        },
        {
          code: "006",
          // import( ) whose first argument does not begin with a quote => computed specifier.
          pattern: /\bimport\s*\(\s*(?!['"`])[^)]*\)/,
          message: "Dynamic import() with a non-literal specifier; the loaded module cannot be determined statically.",
          severity: "high",
          confidence: 0.7,
          note: "A literal specifier is fine and is deliberately excluded by this detector.",
        },
        {
          code: "007",
          pattern: /\bprocess\s*\.\s*binding\s*\(/,
          message: "process.binding() reaches internal C++ bindings and bypasses the public API surface.",
          severity: escalate,
          confidence: 0.9,
        },
        {
          code: "008",
          pattern: /\brequire\s*\(\s*(?!['"`])[A-Za-z_$][\w$]*\s*(?:[+[]|\s*\))/,
          message: "require() with a computed specifier hides which module is actually loaded.",
          severity: "high",
          confidence: 0.65,
        },
        {
          code: "009",
          pattern: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/,
          message: "setTimeout/setInterval called with a string body, which is evaluated as code.",
          severity: "high",
          confidence: 0.85,
        },
      ],
    });
  },
};

export default dynamicEvalRule;
