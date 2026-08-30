/**
 * AST analysis layer (stage S3, second pass).
 *
 * The self-audit (docs/reviews/scanner-selfaudit.md) closes with the corpus rule that
 * "regex must never be the sole basis for a critical finding". Regex sees tokens; the
 * bypasses that mattered were all *shapes*: an identifier bound to `eval`, a property
 * name assembled from two string halves, a specifier that is a variable, a credential
 * value that reaches a request one hop later. Each is trivial once the file is a tree.
 *
 * Design constraints carried over from the regex layer:
 *  - Deterministic output. The walk is source-order; no Map/Set iteration reaches output
 *    unsorted; findings go through the same sort as regex findings.
 *  - No hard runtime dependency. `typescript` is loaded lazily through createRequire and
 *    treated as optional: if it is missing, or the file does not parse, callers fall back
 *    to the regex layer and the report says so per finding (`analysis` field).
 *  - Same evidence contract: path:line:col, excerpt, sha256 of the cited text.
 *
 * Deliberate approximations, stated rather than hidden:
 *  - Binding resolution is per file and by *name*, not by scope. Shadowing a name in an
 *    inner block can therefore carry a taint it should not. That direction is fail-closed
 *    (a finding a human can dismiss), which is the direction the pipeline spec requires.
 *  - Flow is intra-file. Cross-module flows remain the grading layer's package-level gate.
 */
import { createRequire } from "node:module";
import { lineIndexOf, makeExcerpt, sha256, } from "./rules/types.js";
let cachedTs;
/**
 * Load the TypeScript compiler API if it is present.
 *
 * Dependency decision: `typescript` stays a devDependency plus an optionalDependency and
 * is required lazily, so `npm i @dsh-bridge/scan` still yields a working CLI with the
 * regex layer if the optional install is skipped or pruned. A synchronous `createRequire`
 * (rather than `await import`) keeps `scanContent`/`scanDirectory` synchronous, which is
 * the published CLI and library contract.
 */
export function loadTypeScript() {
    if (cachedTs !== undefined)
        return cachedTs;
    try {
        const req = createRequire(import.meta.url);
        cachedTs = req("typescript");
    }
    catch {
        cachedTs = null;
    }
    return cachedTs;
}
/** Test seam: force the loader's answer. Passing `undefined` restores real detection. */
export function setTypeScriptForTesting(value) {
    cachedTs = value;
}
/** Extensions the AST layer understands. JSON/YAML/shell stay regex-only by design. */
const AST_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
export function isAstAnalyzable(filePath) {
    const dot = filePath.lastIndexOf(".");
    return dot >= 0 && AST_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}
/**
 * Parse a file. Returns null when TypeScript is unavailable, the extension is not JS/TS,
 * or the source has parse errors — a partially-parsed tree would silently under-report,
 * which is worse than falling back to regex.
 */
export function parseSourceFile(content, filePath) {
    if (!isAstAnalyzable(filePath))
        return null;
    const ts = loadTypeScript();
    if (!ts)
        return null;
    const lower = filePath.toLowerCase();
    const kind = lower.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : lower.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")
                ? ts.ScriptKind.TS
                : ts.ScriptKind.JS;
    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);
    }
    catch {
        return null;
    }
    // `parseDiagnostics` is internal but stable and is the only way to know whether the
    // tree is trustworthy without building a full Program (which would need a filesystem
    // host and type resolution the scanner deliberately avoids).
    const diagnostics = sourceFile.parseDiagnostics;
    if (diagnostics && diagnostics.length > 0)
        return null;
    return sourceFile;
}
/* ------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* ------------------------------------------------------------------------- */
/** Globals that expose `eval` as a property, i.e. the indirect-eval carriers. */
const GLOBAL_ROOTS = new Set(["globalThis", "window", "global", "self"]);
/** Execution sinks addressed by (possibly computed) member or alias. */
const EXEC_METHOD_NAMES = new Set([
    "eval",
    "Function",
    "exec",
    "execSync",
    "execFile",
    "execFileSync",
    "spawn",
    "spawnSync",
    "fork",
    "runInNewContext",
    "runInThisContext",
    "runInContext",
    "compileFunction",
]);
/** Network sinks. Method names are matched on the resolved (folded) property name. */
const NET_METHOD_NAMES = new Set([
    "fetch",
    "request",
    "post",
    "put",
    "patch",
    "sendBeacon",
    "createConnection",
    "connect",
]);
/** Callee names, dotted or bare, that unambiguously perform egress. */
const NET_CALLEE_NAMES = new Set([
    "fetch",
    "axios",
    "axios.post",
    "axios.get",
    "axios.put",
    "axios.patch",
    "axios.request",
    "axios.delete",
    "got",
    "got.post",
    "got.put",
    "http.request",
    "http.get",
    "https.request",
    "https.get",
    "navigator.sendBeacon",
    "net.connect",
    "net.createConnection",
    "dgram.createSocket",
    "undici.request",
    "undici.fetch",
]);
/** Decode calls: the "concealment" half of the staged-loader shape. */
const DECODE_NAMES = new Set([
    "atob",
    "unescape",
    "decodeURIComponent",
    "Buffer.from",
    "String.fromCharCode",
]);
/** Filesystem read calls that can lift a credential file into a value. */
const FS_READ_NAMES = new Set([
    "readFileSync",
    "readFile",
    "createReadStream",
    "fs.readFileSync",
    "fs.readFile",
    "fs.promises.readFile",
    "fsp.readFile",
    "fs.createReadStream",
    "readFileSync.call",
]);
/** Paths whose contents are credentials by convention. Mirrors the CRED regex corpus. */
const CREDENTIAL_PATH = /(?:^|[\/\\"'`.])(?:\.ssh|\.aws|\.claude|\.codex|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.gitconfig)(?:[\/\\"'`]|$)|id_(?:rsa|ed25519|ecdsa)|auth\.json|credentials\.json|\.env(?:\.[A-Za-z0-9_-]+)?["'`]?$|(?:^|\/)\.env\b/;
/** Environment variable names whose value is a secret. Matches CRED-007's vocabulary. */
const SECRET_ENV_NAME = /TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|APIKEY|API_KEY|SESSION|COOKIE/i;
/** Environment enumeration helpers: whole-environment harvest rather than one read. */
const ENUMERATION_NAMES = new Set([
    "Object.keys",
    "Object.values",
    "Object.entries",
    "Object.assign",
    "JSON.stringify",
    "Object.fromEntries",
]);
/**
 * Constant-fold an expression to a string when it is statically determined.
 * Handles literals, template literals without substitutions, parenthesized forms, and
 * `+` chains of the above — which is exactly what `obj["fet" + "ch"]` needs.
 */
function foldString(ts, node) {
    if (!node)
        return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (ts.isNumericLiteral(node))
        return node.text;
    if (ts.isParenthesizedExpression(node))
        return foldString(ts, node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = foldString(ts, node.left);
        const right = foldString(ts, node.right);
        return left !== undefined && right !== undefined ? left + right : undefined;
    }
    if (ts.isTemplateExpression(node) && node.templateSpans.length === 0)
        return node.head.text;
    return undefined;
}
/** Resolve a callee (or any reference expression) to a dotted name, folding computed keys. */
function resolveName(ts, node) {
    const segments = [];
    let computed = false;
    let folded = false;
    let current = node;
    for (;;) {
        if (ts.isParenthesizedExpression(current)) {
            current = current.expression;
            continue;
        }
        if (ts.isNonNullExpression(current) || ts.isAsExpression(current)) {
            current = current.expression;
            continue;
        }
        if (ts.isPropertyAccessExpression(current)) {
            segments.unshift(current.name.text);
            current = current.expression;
            continue;
        }
        if (ts.isElementAccessExpression(current)) {
            const key = foldString(ts, current.argumentExpression);
            if (key === undefined)
                return undefined;
            computed = true;
            if (!current.argumentExpression || !ts.isStringLiteral(current.argumentExpression))
                folded = true;
            segments.unshift(key);
            current = current.expression;
            continue;
        }
        if (ts.isIdentifier(current)) {
            segments.unshift(current.text);
            break;
        }
        if (current.kind === ts.SyntaxKind.ThisKeyword) {
            segments.unshift("this");
            break;
        }
        return undefined;
    }
    const dotted = segments.join(".");
    return {
        dotted,
        property: segments[segments.length - 1] ?? "",
        root: segments.length > 1 ? (segments[0] ?? "") : "",
        computed,
        folded,
    };
}
function addKind(map, name, kind) {
    let set = map.get(name);
    if (!set) {
        set = new Set();
        map.set(name, set);
    }
    if (set.has(kind))
        return false;
    set.add(kind);
    return true;
}
/** Shipped/loaded artifacts, where dynamic execution is critical rather than high. */
function isShippedArtifact(filePath) {
    return /(^|\/)(lib|dist|build|out)\//.test(filePath) || /\.min\.[cm]?js$/.test(filePath);
}
const analysisCache = new WeakMap();
/**
 * Analyze one parsed file. Cached per SourceFile so N rules asking for AST findings pay
 * for one traversal, exactly as the regex layer shares its masked-content cache.
 */
export function analyzeSourceFile(sourceFile, filePath) {
    const cached = analysisCache.get(sourceFile);
    if (cached)
        return cached;
    const analysis = computeAnalysis(sourceFile, filePath);
    analysisCache.set(sourceFile, analysis);
    return analysis;
}
function computeAnalysis(sourceFile, filePath) {
    const ts = loadTypeScript();
    if (!ts)
        return { findings: [] };
    const content = sourceFile.text;
    const escalate = isShippedArtifact(filePath) ? "critical" : "high";
    const kinds = new Map();
    const emits = [];
    const assignments = [];
    /** Names bound to a function (declaration, expression, or arrow). */
    const functionNames = new Set();
    const collect = (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
            assignments.push({ name: node.name.text, value: node.initializer });
            if (ts.isFunctionExpression(node.initializer) ||
                ts.isArrowFunction(node.initializer) ||
                ts.isClassExpression(node.initializer)) {
                functionNames.add(node.name.text);
            }
        }
        else if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left)) {
            assignments.push({ name: node.left.text, value: node.right });
        }
        else if (ts.isFunctionDeclaration(node) && node.name) {
            functionNames.add(node.name.text);
        }
        else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            // `import axios from "axios"` binds a network-capable callable to a local name.
            const spec = node.moduleSpecifier.text;
            const netPackage = /^(?:axios|got|node-fetch|undici|ky|superagent|request|phin|needle|bent)(?:\/|$)/.test(spec);
            const clause = node.importClause;
            if (netPackage && clause) {
                if (clause.name)
                    addKind(kinds, clause.name.text, "net");
                const bindings = clause.namedBindings;
                if (bindings && ts.isNamespaceImport(bindings))
                    addKind(kinds, bindings.name.text, "net");
                if (bindings && ts.isNamedImports(bindings)) {
                    for (const element of bindings.elements)
                        addKind(kinds, element.name.text, "net");
                }
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    /** Kinds an expression evaluates to, given what is currently known about names. */
    const classify = (node, depth = 0) => {
        const out = new Set();
        if (depth > 12)
            return out;
        const merge = (other) => {
            for (const kind of other)
                out.add(kind);
        };
        if (ts.isParenthesizedExpression(node))
            return classify(node.expression, depth + 1);
        if (ts.isAwaitExpression(node))
            return classify(node.expression, depth + 1);
        if (ts.isNonNullExpression(node) || ts.isAsExpression(node))
            return classify(node.expression, depth + 1);
        if (ts.isIdentifier(node)) {
            if (node.text === "eval")
                out.add("eval");
            if (node.text === "Function")
                out.add("funcCtor");
            if (node.text === "fetch")
                out.add("net");
            const known = kinds.get(node.text);
            if (known)
                merge(known);
            if (functionNames.has(node.text))
                out.add("fn");
            return out;
        }
        if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassExpression(node)) {
            out.add("fn");
            return out;
        }
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
            const resolved = resolveName(ts, node);
            if (resolved) {
                if (GLOBAL_ROOTS.has(resolved.root) && resolved.property === "eval")
                    out.add("eval");
                if (GLOBAL_ROOTS.has(resolved.root) && resolved.property === "Function")
                    out.add("funcCtor");
                if (GLOBAL_ROOTS.has(resolved.root) && resolved.property === "fetch")
                    out.add("net");
                if (/^process(?:\.env)?$/.test(resolved.dotted.replace(/\.env\..*$/, ".env"))) {
                    // handled below via base classification
                }
                if (resolved.dotted === "process.env")
                    out.add("cred");
                if (NET_CALLEE_NAMES.has(resolved.dotted))
                    out.add("net");
                const known = kinds.get(resolved.dotted);
                if (known)
                    merge(known);
            }
            const base = ts.isPropertyAccessExpression(node) ? node.expression : node.expression;
            const baseKinds = classify(base, depth + 1);
            if (baseKinds.has("net"))
                out.add("net");
            if (baseKinds.has("cred")) {
                // Reading ONE named, secret-shaped variable off the environment is a credential
                // read. Reading a non-secret-shaped key (LOG_LEVEL, NODE_ENV, HOME) is ordinary
                // configuration and must not seed a taint: this is the main false-positive guard
                // for the flow analysis.
                const key = ts.isPropertyAccessExpression(node)
                    ? node.name.text
                    : foldString(ts, node.argumentExpression);
                if (key !== undefined && SECRET_ENV_NAME.test(key))
                    out.add("cred");
                else if (key === undefined)
                    out.add("cred"); // fully dynamic key: could be any secret
            }
            return out;
        }
        if (ts.isCallExpression(node)) {
            const resolved = resolveName(ts, node.expression);
            const dotted = resolved?.dotted ?? "";
            const property = resolved?.property ?? "";
            if (DECODE_NAMES.has(dotted) || DECODE_NAMES.has(property))
                out.add("decoded");
            // `Buffer.from(x, "base64").toString()` keeps whatever x carried.
            for (const arg of node.arguments) {
                const argKinds = classify(arg, depth + 1);
                if (ENUMERATION_NAMES.has(dotted) ||
                    DECODE_NAMES.has(dotted) ||
                    DECODE_NAMES.has(property) ||
                    property === "toString" ||
                    property === "join" ||
                    property === "map" ||
                    dotted === "String" ||
                    dotted === "encodeURIComponent") {
                    if (argKinds.has("cred"))
                        out.add("cred");
                    if (argKinds.has("decoded"))
                        out.add("decoded");
                }
            }
            if (FS_READ_NAMES.has(dotted) || FS_READ_NAMES.has(property)) {
                const first = node.arguments[0];
                if (first && CREDENTIAL_PATH.test(first.getText(sourceFile)))
                    out.add("cred");
            }
            // Method chains: `Buffer.from(secret).toString("hex")`, `creds.trim()`.
            if (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) {
                const receiver = classify(node.expression.expression, depth + 1);
                if (receiver.has("cred"))
                    out.add("cred");
                if (receiver.has("decoded"))
                    out.add("decoded");
            }
            return out;
        }
        if (ts.isBinaryExpression(node)) {
            if (node.operatorToken.kind === ts.SyntaxKind.CommaToken)
                return classify(node.right, depth + 1);
            merge(classify(node.left, depth + 1));
            merge(classify(node.right, depth + 1));
            // A comparison or arithmetic result is not the value itself; only string building
            // and logical defaulting preserve the payload.
            if (node.operatorToken.kind !== ts.SyntaxKind.PlusToken &&
                node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken &&
                node.operatorToken.kind !== ts.SyntaxKind.BarBarToken &&
                node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken &&
                node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
                return new Set();
            }
            return out;
        }
        if (ts.isConditionalExpression(node)) {
            merge(classify(node.whenTrue, depth + 1));
            merge(classify(node.whenFalse, depth + 1));
            return out;
        }
        if (ts.isTemplateExpression(node)) {
            for (const span of node.templateSpans)
                merge(classify(span.expression, depth + 1));
            return out;
        }
        if (ts.isObjectLiteralExpression(node)) {
            for (const property of node.properties) {
                if (ts.isSpreadAssignment(property))
                    merge(classify(property.expression, depth + 1));
                else if (ts.isPropertyAssignment(property))
                    merge(classify(property.initializer, depth + 1));
                else if (ts.isShorthandPropertyAssignment(property))
                    merge(classify(property.name, depth + 1));
            }
            return out;
        }
        if (ts.isArrayLiteralExpression(node)) {
            for (const element of node.elements)
                merge(classify(element, depth + 1));
            return out;
        }
        if (ts.isNewExpression(node)) {
            const resolved = resolveName(ts, node.expression);
            if (resolved?.property === "Function")
                out.add("funcCtor");
            for (const arg of node.arguments ?? []) {
                if (classify(arg, depth + 1).has("cred"))
                    out.add("cred");
            }
            return out;
        }
        if (ts.isSpreadElement(node))
            return classify(node.expression, depth + 1);
        return out;
    };
    // Fixpoint over name bindings: `const a = eval; const b = a; b(src)` needs two rounds,
    // and a chain of length n needs n. Bounded so a pathological file cannot spin.
    for (let round = 0; round < 8; round += 1) {
        let changed = false;
        for (const assignment of assignments) {
            for (const kind of classify(assignment.value)) {
                if (addKind(kinds, assignment.name, kind))
                    changed = true;
            }
        }
        if (!changed)
            break;
    }
    /** Any decode call anywhere in the file: the concealment co-signal. */
    let fileDecodes = false;
    /* --- detection walk ---------------------------------------------------------- */
    const visit = (node) => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            const resolved = resolveName(ts, callee);
            const dotted = resolved?.dotted ?? "";
            const property = resolved?.property ?? "";
            if (DECODE_NAMES.has(dotted) || DECODE_NAMES.has(property))
                fileDecodes = true;
            const calleeKinds = classify(callee);
            const isDirectEvalToken = ts.isIdentifier(callee) && callee.text === "eval";
            const isDirectFunctionToken = ts.isIdentifier(callee) && callee.text === "Function";
            // EXEC-020: eval reached through an alias, an indirect form, or a computed member.
            if (calleeKinds.has("eval") && !isDirectEvalToken) {
                emits.push({
                    id: "EXEC-020",
                    ruleId: "dynamic-eval",
                    family: "EXEC",
                    severity: escalate,
                    message: "Call resolves to eval through an alias, indirect form, or computed member; the call site does not mention eval.",
                    node,
                    confidence: 0.95,
                    note: "Resolved on the syntax tree: the binding chain from this callee to `eval` is explicit in this file.",
                });
            }
            // EXEC-021: the Function constructor reached the same way.
            if (calleeKinds.has("funcCtor") && !isDirectFunctionToken) {
                emits.push({
                    id: "EXEC-021",
                    ruleId: "dynamic-eval",
                    family: "EXEC",
                    severity: escalate,
                    message: "Call resolves to the Function constructor through an alias or computed member, compiling code at runtime.",
                    node,
                    confidence: 0.9,
                });
            }
            // EXEC-023: computed member whose folded property name is an execution sink.
            if (resolved?.computed && resolved.folded && EXEC_METHOD_NAMES.has(property)) {
                emits.push({
                    id: "EXEC-023",
                    ruleId: "dynamic-eval",
                    family: "EXEC",
                    severity: escalate,
                    message: `Execution sink "${property}" is addressed by a computed property name assembled from string fragments.`,
                    node,
                    confidence: 0.9,
                    note: "Assembling the method name at the call site has no purpose other than defeating name-based scanning.",
                });
            }
            // NET-020: network sink reached through a folded computed member or an alias.
            const netByName = NET_CALLEE_NAMES.has(dotted) || (resolved !== undefined && NET_METHOD_NAMES.has(property));
            if (resolved?.computed && resolved.folded && netByName) {
                emits.push({
                    id: "NET-020",
                    ruleId: "network-egress",
                    family: "NET",
                    severity: "high",
                    message: `Network call "${property}" is addressed by a computed property name assembled from string fragments.`,
                    node,
                    confidence: 0.85,
                });
            }
            // EXEC-022: dynamic require() with a specifier that is not a resolvable literal.
            if ((dotted === "require" || dotted === "require.resolve") &&
                node.arguments.length > 0 &&
                foldString(ts, node.arguments[0]) === undefined) {
                emits.push({
                    id: "EXEC-022",
                    ruleId: "dynamic-eval",
                    family: "EXEC",
                    severity: "high",
                    message: "require() specifier is computed at runtime, so the loaded module cannot be determined statically.",
                    node,
                    confidence: 0.85,
                    note: "A literal specifier, or a concatenation of literals that folds to one, does not fire this.",
                });
            }
            // EXEC-024: timer body that is not resolvably a function.
            if ((dotted === "setTimeout" || dotted === "setInterval" || property === "setTimeout" || property === "setInterval") &&
                node.arguments.length > 0) {
                const first = node.arguments[0];
                if (first !== undefined) {
                    const firstKinds = classify(first);
                    const literalFunction = ts.isFunctionExpression(first) || ts.isArrowFunction(first) || firstKinds.has("fn");
                    if (!literalFunction) {
                        const decoded = firstKinds.has("decoded");
                        const stringish = ts.isStringLiteral(first) || ts.isTemplateExpression(first) || decoded;
                        if (stringish) {
                            emits.push({
                                id: "EXEC-024",
                                ruleId: "dynamic-eval",
                                family: "EXEC",
                                severity: escalate,
                                message: decoded
                                    ? "Timer body is a decoded string; Node evaluates a string timer body as code."
                                    : "Timer body is a string literal, which is evaluated as code.",
                                node,
                                confidence: 0.9,
                            });
                        }
                        else if (!ts.isIdentifier(first) && !ts.isPropertyAccessExpression(first)) {
                            emits.push({
                                id: "EXEC-024",
                                ruleId: "dynamic-eval",
                                family: "EXEC",
                                severity: "medium",
                                message: "Timer body is an expression that cannot be resolved to a function; if it evaluates to a string it is executed as code.",
                                node,
                                confidence: 0.5,
                                note: "Identifiers and members that resolve to a function in this file are excluded by the AST pass.",
                            });
                        }
                    }
                }
            }
            // CRED-020: credential-derived value flows into a network sink.
            const sinkIsNet = netByName || calleeKinds.has("net");
            if (sinkIsNet) {
                for (const arg of node.arguments) {
                    if (classify(arg).has("cred")) {
                        emits.push({
                            id: "CRED-020",
                            ruleId: "credential-access",
                            family: "CRED",
                            severity: "critical",
                            message: "Credential-derived data reaches a network call in this file; the flow from the credential read to the request is explicit.",
                            node,
                            confidence: 0.9,
                            note: "Flow is intra-file and name-based; shadowed bindings can over-report. Cite the source read alongside this finding when reviewing.",
                        });
                        break;
                    }
                }
            }
        }
        // Dynamic `import(expr)` is a call-like node of its own kind.
        if (ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length > 0 &&
            foldString(ts, node.arguments[0]) === undefined) {
            emits.push({
                id: "EXEC-025",
                ruleId: "dynamic-eval",
                family: "EXEC",
                severity: "high",
                message: "Dynamic import() specifier is computed at runtime, so the loaded module cannot be determined statically.",
                node,
                confidence: 0.85,
            });
        }
        if (ts.isNewExpression(node)) {
            const resolved = resolveName(ts, node.expression);
            if (resolved?.computed && resolved.folded && resolved.property === "Function") {
                emits.push({
                    id: "EXEC-021",
                    ruleId: "dynamic-eval",
                    family: "EXEC",
                    severity: escalate,
                    message: "Function constructor addressed by a computed property name assembled from string fragments.",
                    node,
                    confidence: 0.9,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    // OBFU-020: decode + capability co-presence, resolved rather than lexically adjacent.
    if (fileDecodes && emits.some((e) => e.family === "EXEC" || e.family === "NET" || e.family === "CRED")) {
        const anchor = emits.find((e) => e.family === "EXEC" || e.family === "NET" || e.family === "CRED");
        if (anchor) {
            emits.push({
                id: "OBFU-020",
                ruleId: "obfuscation",
                family: "OBFU",
                severity: "high",
                message: "A decode call and an execution or egress capability occur in the same module, connected by resolved data flow rather than lexical adjacency.",
                node: anchor.node,
                confidence: 0.8,
            });
        }
    }
    const index = lineIndexOf(content);
    const findings = emits.map((emit) => {
        const start = emit.node.getStart(sourceFile);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
        const raw = content.slice(start, emit.node.getEnd());
        const lineText = index.lineText(content, line + 1);
        return {
            id: emit.id,
            ruleId: emit.ruleId,
            family: emit.family,
            severity: emit.severity,
            message: emit.message,
            path: filePath,
            line: line + 1,
            col: character + 1,
            excerpt: makeExcerpt(lineText.length <= 200 ? lineText : raw),
            excerptSha256: sha256(raw),
            confidence: emit.confidence,
            analysis: "ast",
            ...(emit.note ? { note: emit.note } : {}),
        };
    });
    // Deduplicate identical (id, line, col) emits, which a nested-call walk can produce.
    const seen = new Set();
    const unique = findings.filter((f) => {
        const key = `${f.id}\u0000${f.line}\u0000${f.col}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    return { findings: Object.freeze(unique) };
}
/** Findings from the AST pass belonging to one rule. Used by each rule's analyzeAst. */
export function astFindingsForRule(sourceFile, filePath, ruleId) {
    return analyzeSourceFile(sourceFile, filePath).findings.filter((f) => f.ruleId === ruleId);
}
//# sourceMappingURL=ast.js.map