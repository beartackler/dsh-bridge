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
  version: "2026.08.2",
  description:
    "Detects runtime code execution: eval, new Function, vm.*, child_process, process.binding, and dynamic import() with a non-literal specifier, indirect/aliased eval, bare Function(), and decoded timer bodies.",

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
          // `.exec(` is excluded: RegExp.prototype.exec is idiomatic JS and firing high on
          // `/^v(\d+)/.exec(version)` cost more trust than the rule ever bought.
          // child_process usage is still caught by EXEC-004 (the import) independently.
          pattern: /(?<![\w.$)\]/])\b(exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)\s*\(/,
          message: "Process-spawning call; inspect the command and whether its arguments are user-controlled.",
          severity: "high",
          confidence: 0.55,
          note: "Common false positive: an unrelated local helper also named exec()/fork(). Confirm the import.",
          refine: (match, content) => {
            // Reject `<regex-literal>.exec(` and any member-call form the lookbehind
            // could not see (e.g. `re\n  .exec(x)`).
            const before = content.slice(Math.max(0, match.index - 200), match.index);
            return !/[.)\]\/]\s*$/.test(before);
          },
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
        {
          code: "010",
          // Indirect eval. `(0, eval)(src)` and `globalThis.eval(src)` run in global scope
          // and never present the callee token `eval(`, so EXEC-001 alone misses them.
          pattern: /\(\s*0\s*,\s*eval\s*\)|(?:globalThis|window|global|self)\s*(?:\.\s*eval\b|\[\s*['"`]eval['"`]\s*\])/,
          message: "Indirect eval ((0, eval) or globalThis.eval) executes strings as code in global scope.",
          severity: escalate,
          confidence: 0.9,
          note: "Corpus H-EVAL-01 requires this form; the call site itself may be an unrelated identifier.",
        },
        {
          code: "011",
          // eval captured as a value, then called later through an alias.
          pattern: /\b(?:const|let|var)\s+[\w$]+\s*=\s*(?:(?:globalThis|window|global|self)\s*\.\s*)?eval\b\s*(?![\s\S]{0,2}\()/,
          message: "eval is aliased to a variable; the later call site hides behind an ordinary identifier.",
          severity: escalate,
          confidence: 0.85,
          note: "Assigning eval, rather than calling it, is the standard way to defeat callee-token scanning.",
        },
        {
          code: "012",
          // `Function("...")` without `new` compiles code exactly like `new Function`.
          pattern: /(?<![.\w$])Function\s*\(\s*[^\s)]/,
          message: "Function() called as a plain function compiles a string into executable code.",
          severity: escalate,
          confidence: 0.85,
          refine: (match, content) => {
            const before = content.slice(Math.max(0, match.index - 12), match.index);
            // `new Function(` is EXEC-002's job; do not double-report it here.
            return !/\bnew\s+$/.test(before);
          },
        },
        {
          code: "013",
          // Timer whose first argument is an expression that decodes data: the decoded
          // string becomes the timer body, i.e. delayed dynamic execution.
          pattern: /\bset(?:Timeout|Interval)\s*\(\s*(?![\s\S]{0,4}?function\b)[^,)]*(?:Buffer\s*\.\s*from|\batob\b|\bunescape\b|decodeURIComponent|String\s*\.\s*fromCharCode)[^,)]*[,)]/,
          message: "Timer body is produced by a decode call; Node evaluates a string timer body as code.",
          severity: escalate,
          confidence: 0.85,
          note: "Decoded-then-scheduled execution is the delayed-loader shape; EXEC-009 only sees literal strings.",
        },
        {
          code: "014",
          // Any non-function-literal timer body. Regex cannot resolve an identifier to a
          // function, so this is deliberately medium with a documented FP shape.
          pattern: /\bset(?:Timeout|Interval)\s*\(\s*(?!function\b|async\b|\(|\[|\{)[^,;)]+[,)]/,
          message: "setTimeout/setInterval first argument is not a function literal; if it evaluates to a string it is executed as code.",
          severity: "medium",
          confidence: 0.4,
          note: "Known false positive: an identifier holding a function reference. Regex cannot resolve it; confirm the binding.",
          refine: (match) => {
            const arg = match[0].replace(/^[\s\S]*?\(\s*/, "").replace(/[,)]\s*$/, "").trim();
            // Plain identifier / member reference (`fn`, `this.tick`) is the benign shape.
            return !/^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*$/.test(arg);
          },
        },
      ],
    });
  },
};

export default dynamicEvalRule;
