/**
 * /bridge-refactor - behavior-preserving restructuring with a plan-only
 * default (docs/specs/commands/refactor.md).
 *
 * Three phases:
 *   1. Inventory - per source file under the target: size, line count, import
 *      specifiers (single-line `import`/`require` forms), exported names.
 *   2. Plan - mechanical steps only (split-file, extract-module,
 *      inline-helper, rename), each independently verifiable by running the
 *      tests after that step alone. Steps are computed sequentially against a
 *      virtual copy of the tree and every step carries full post-state file
 *      contents, so later steps never edit stale text.
 *   3. Apply - only behind --apply: snapshot the target into memory, write
 *      each step, run the suite through the injected exec seam between steps,
 *      and restore the snapshot on the first red run.
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - Default is plan-only: without --apply nothing is ever written.
 *  - Every written path must resolve inside the target; a plan step pointing
 *    outside aborts before the first write.
 *  - Exported names are never changed silently: rename steps touching an
 *    exported symbol carry an explicit public-surface flag; split and extract
 *    steps preserve the surface through re-exports.
 *  - Candidates the planner cannot mechanize safely (declarations that
 *    reference sibling top-level names, unboundable blocks, existing target
 *    files) degrade to honest manual notes, never to speculative edits.
 *  - The test seam is capability-probed, not assumed (same pattern as the
 *    compact/resume host seams); without it --apply refuses and writes
 *    nothing. No git operations, no network calls, no emoji.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { bulletList, heading, table } from "../lib/output.js";
const USAGE = "Usage: /bridge-refactor <target> [plan.json] [--apply] [--rename <from>:<to>]";
/** Command executed through the exec seam after every applied step. */
export const TEST_COMMAND = "npm test";
/** Upper bound on plan size; anything past this is dropped and disclosed. */
export const MAX_PLAN_STEPS = 8;
/** Line floor for split-file candidacy (spec: oversized multi-export module). */
export const SPLIT_MIN_LINES = 40;
/** Export floor for extract-module candidacy on files below the line floor. */
export const EXPORT_MODULE_MIN_EXPORTS = 3;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist"]);
/** Error carrying a user-facing message; rendered honestly, never a stack. */
export class RefactorError extends Error {
}
/** Feature-detected like the compact/resume host seams; absent means refuse. */
function getExecSeam(ctx) {
    const candidate = ctx.exec;
    return typeof candidate === "function" ? candidate : null;
}
// ---------------------------------------------------------------------------
// Filesystem walk and source scanning
// ---------------------------------------------------------------------------
/** Source files under the target; recursive for directories, sorted. */
export function collectSourceFiles(target) {
    const out = [];
    if (!statSync(target).isDirectory())
        return [target];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))
                continue;
            const child = join(dir, entry.name);
            if (entry.isDirectory())
                walk(child);
            else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
                out.push(child);
        }
    };
    walk(target);
    return out.sort();
}
const IMPORT_RE = /^\s*import\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"']+)["']/;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
const DECL_EXPORT_RE = /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|enum|const|let|var|type)\s+([A-Za-z_$][\w$]*)/;
const NAMED_LIST_RE = /^export\s*\{([^}]*)\}/;
const STAR_RE = /^export\s+(?:type\s*)?\*/;
const TOP_LEVEL_NAME_RE = /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|interface|enum|const|let|var|type)\s+([A-Za-z_$][\w$]*)/;
/**
 * Single-pass lexical scan: line count, import specifiers, exported names.
 * Deliberately line-oriented (multi-line import statements are out of scope
 * for the MVP planner); it feeds inventory display and planner heuristics.
 */
export function scanSource(content) {
    const lines = content.split("\n");
    const imports = new Set();
    const exports = new Set();
    for (const line of lines) {
        const imported = IMPORT_RE.exec(line);
        if (imported !== null)
            imports.add(imported[1]);
        for (const requireMatch of line.matchAll(REQUIRE_RE))
            imports.add(requireMatch[1]);
        const decl = DECL_EXPORT_RE.exec(line);
        if (decl !== null) {
            exports.add(decl[1]);
            continue;
        }
        const list = NAMED_LIST_RE.exec(line);
        if (list !== null) {
            for (const piece of list[1].split(",")) {
                const raw = piece.trim();
                if (raw === "")
                    continue;
                const cleaned = raw.startsWith("type ") ? raw.slice(5).trim() : raw;
                const aliased = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(cleaned);
                exports.add(aliased !== null ? aliased[1] : cleaned.split(/\s+/)[0]);
            }
            continue;
        }
        if (STAR_RE.test(line))
            exports.add("*");
    }
    return { lineCount: lines.length, imports: [...imports], exports: [...exports] };
}
/** Names of every top-level (column-zero) declaration in the file. */
function topLevelNames(content) {
    const names = new Set();
    for (const line of content.split("\n")) {
        const match = TOP_LEVEL_NAME_RE.exec(line);
        if (match !== null)
            names.add(match[1]);
    }
    return [...names];
}
/** Exported declarations the planner could plausibly relocate. */
function declarationExportNames(content) {
    const names = [];
    for (const line of content.split("\n")) {
        const match = DECL_EXPORT_RE.exec(line);
        if (match !== null)
            names.push(match[1]);
    }
    return names;
}
// ---------------------------------------------------------------------------
// Declaration-block mechanics
// ---------------------------------------------------------------------------
/**
 * End line of the declaration starting at `start`: the first line whose
 * combined bracket depth is back to zero and that terminates the statement
 * (`;`) or closes its own block (`}`). Null when the file ends first.
 */
function locateBlockEnd(lines, start) {
    let depth = 0;
    for (let i = start; i < lines.length; i += 1) {
        for (const ch of lines[i]) {
            if (ch === "{" || ch === "(" || ch === "[")
                depth += 1;
            else if (ch === "}" || ch === ")" || ch === "]")
                depth = Math.max(0, depth - 1);
        }
        const trimmed = lines[i].trimEnd();
        if (depth === 0 && (trimmed.endsWith(";") || trimmed.endsWith("}")))
            return i;
    }
    return null;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function kebabCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}
function isIdentifier(name) {
    return /^[A-Za-z_$][\w$]*$/.test(name);
}
/** Net bracket depth; a cheap cut-integrity guard around block extraction. */
function braceBalance(text) {
    let balance = 0;
    for (const ch of text) {
        if (ch === "{" || ch === "(" || ch === "[")
            balance += 1;
        else if (ch === "}" || ch === ")" || ch === "]")
            balance -= 1;
    }
    return balance;
}
/** First sibling top-level name referenced inside `blockText`, if any. */
function referencesSibling(blockText, siblings) {
    for (const name of siblings) {
        if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(blockText))
            return name;
    }
    return null;
}
/** Collapse the blank-line piles left behind by block removal. */
function tidyBlankLines(lines) {
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
const ARROW_HELPER_RE = /^const ([A-Za-z_$][\w$]*) = \(\)[^=>]*=> (.+);\s*$/;
const FN_HELPER_RE = /^(?:async )?function ([A-Za-z_$][\w$]*)\(\) \{ return (.+); \}\s*$/;
/** Single-use, zero-parameter, one-expression helper on one line. */
function findHelperCandidate(content) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
        const match = ARROW_HELPER_RE.exec(lines[i]) ?? FN_HELPER_RE.exec(lines[i]);
        if (match === null)
            continue;
        const name = match[1];
        const body = match[2];
        if (body.includes(name))
            continue;
        const withoutDecl = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n");
        const callHits = withoutDecl.match(new RegExp(`\\b${escapeRegExp(name)}\\s*\\(\\)`, "g"));
        if (callHits === null || callHits.length !== 1)
            continue;
        return { name, body, declLine: i };
    }
    return null;
}
/**
 * Compute the plan for the target tree. Pure over its inputs: the caller's
 * `contents` map is never mutated; every step is materialized against the
 * virtual state left by the previous step, so edits always hold full
 * post-state contents (spec: steps are independently verifiable).
 */
export function buildRefactorPlan(contents, options = {}) {
    const virtual = new Map(contents);
    const steps = [];
    const notes = [];
    let truncated = false;
    const publicNames = new Set();
    for (const content of contents.values()) {
        for (const name of scanSource(content).exports)
            publicNames.add(name);
    }
    // Pass 1: split-file / extract-module, file by file, in sorted order.
    // Candidacy is re-derived from the virtual state on every iteration: after
    // an extract shrinks a file, the remainder can still qualify (or stop
    // qualifying), and planning must reflect the tree the step would act on.
    const worklist = [...contents.keys()].sort();
    let cursor = 0;
    while (cursor < worklist.length) {
        if (steps.length >= MAX_PLAN_STEPS) {
            truncated = true;
            break;
        }
        const path = worklist[cursor];
        cursor += 1;
        const base = basename(path);
        // Candidacy is re-derived from the virtual state on every visit: after an
        // extract shrinks a file, the remainder can still qualify (or stop
        // qualifying). A file that already carries a re-export line was produced
        // by an earlier step of this plan and is settled; it never re-enters.
        const current = virtual.get(path) ?? "";
        const scanned = scanSource(current);
        const realExports = scanned.exports.filter((name) => name !== "*");
        const hasReExportLine = /^export\s*\{[^}]*\}\s*from\s*["']/m.test(current);
        const isSplit = scanned.lineCount >= SPLIT_MIN_LINES && realExports.length >= 2 && !hasReExportLine;
        const isExtract = !isSplit &&
            scanned.lineCount < SPLIT_MIN_LINES &&
            realExports.length >= EXPORT_MODULE_MIN_EXPORTS &&
            !hasReExportLine;
        if (!isSplit && !isExtract)
            continue;
        const candidates = declarationExportNames(current);
        const siblings = new Set(topLevelNames(contents.get(path) ?? ""));
        const limit = isSplit ? Math.max(0, candidates.length - 1) : 1;
        const takenPaths = new Set();
        let moved = 0;
        for (const name of candidates) {
            if (moved >= limit)
                break;
            if (steps.length >= MAX_PLAN_STEPS) {
                truncated = true;
                break;
            }
            const currentStepState = virtual.get(path) ?? "";
            const lines = currentStepState.split("\n");
            const startIdx = lines.findIndex((line) => {
                const match = DECL_EXPORT_RE.exec(line);
                return match !== null && match[1] === name;
            });
            if (startIdx < 0)
                continue;
            const endIdx = locateBlockEnd(lines, startIdx);
            if (endIdx === null) {
                notes.push(`${base}: could not bound the block for ${name}; left for a manual pass.`);
                continue;
            }
            const blockText = lines.slice(startIdx, endIdx + 1).join("\n");
            const others = new Set(siblings);
            others.delete(name);
            const ref = referencesSibling(blockText, others);
            if (ref !== null) {
                notes.push(`${base}: ${name} references sibling declaration ${ref}; left for a manual pass.`);
                continue;
            }
            const slug = kebabCase(name);
            const newPath = join(dirname(path), `${slug}.ts`);
            const key = newPath.toLowerCase();
            if (newPath === path || takenPaths.has(key) || virtual.has(newPath)) {
                notes.push(`${base}: ${slug}.ts already exists; ${name} left in place.`);
                continue;
            }
            const keptText = tidyBlankLines([...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)]);
            const newOrigin = `${keptText}\nexport { ${name} } from "./${slug}.js";\n`;
            const moduleText = `${blockText}\n`;
            const surfaceIntact = scanSource(newOrigin).exports.includes(name) && scanSource(moduleText).exports.includes(name);
            if (!surfaceIntact || braceBalance(newOrigin) !== braceBalance(currentStepState)) {
                notes.push(`${base}: extracting ${name} failed the integrity guard; left for a manual pass.`);
                continue;
            }
            const kind = isSplit ? "split-file" : "extract-module";
            steps.push({
                id: `S${steps.length + 1}`,
                kind,
                title: `Move ${name} from ${base} to ${slug}.ts (re-export kept)`,
                detail: `Origin keeps \`export { ${name} } from "./${slug}.js";\``,
                files: [path, newPath],
                touchesPublicSurface: false,
                edits: [
                    { path, content: newOrigin },
                    { path: newPath, content: moduleText },
                ],
            });
            virtual.set(path, newOrigin);
            virtual.set(newPath, moduleText);
            takenPaths.add(key);
            moved += 1;
        }
    }
    // Pass 2: inline-helper candidates over the current virtual tree.
    while (steps.length < MAX_PLAN_STEPS) {
        let found = null;
        for (const path of [...virtual.keys()].sort()) {
            const candidate = findHelperCandidate(virtual.get(path) ?? "");
            if (candidate !== null) {
                found = { path, candidate };
                break;
            }
        }
        if (found === null)
            break;
        const { path, candidate } = found;
        const lines = (virtual.get(path) ?? "").split("\n");
        const withoutDecl = [...lines.slice(0, candidate.declLine), ...lines.slice(candidate.declLine + 1)];
        const callRe = new RegExp(`\\b${escapeRegExp(candidate.name)}\\s*\\(\\)`);
        let replaced = false;
        const finalLines = withoutDecl.map((line) => {
            if (replaced || !callRe.test(line))
                return line;
            replaced = true;
            return line.replace(callRe, `(${candidate.body})`);
        });
        if (!replaced)
            break;
        const finalContent = finalLines.join("\n");
        const displayBody = candidate.body.length > 48 ? `${candidate.body.slice(0, 45)}...` : candidate.body;
        steps.push({
            id: `S${steps.length + 1}`,
            kind: "inline-helper",
            title: `Inline helper ${candidate.name} in ${basename(path)}`,
            detail: `Single-call zero-parameter helper replaced by (${displayBody})`,
            files: [path],
            touchesPublicSurface: false,
            edits: [{ path, content: finalContent }],
        });
        virtual.set(path, finalContent);
    }
    // Pass 3: the user-directed rename, validated but never invented here.
    if (options.rename !== undefined) {
        if (steps.length >= MAX_PLAN_STEPS) {
            truncated = true;
        }
        else {
            const { from, to } = options.rename;
            const renameRe = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
            const edits = [];
            let occurrences = 0;
            for (const path of [...virtual.keys()].sort()) {
                const content = virtual.get(path) ?? "";
                const hits = content.match(renameRe);
                if (hits === null)
                    continue;
                occurrences += hits.length;
                edits.push({ path, content: content.replace(renameRe, to) });
            }
            if (occurrences === 0) {
                notes.push(`rename: "${from}" does not occur under the target; no step emitted.`);
            }
            else {
                const id = `S${steps.length + 1}`;
                steps.push({
                    id,
                    kind: "rename",
                    title: `Rename ${from} to ${to} across the target`,
                    detail: `${occurrences} occurrence(s), whole-word replacement`,
                    files: edits.map((edit) => edit.path),
                    touchesPublicSurface: publicNames.has(from),
                    edits,
                });
                for (const edit of edits)
                    virtual.set(edit.path, edit.content);
            }
        }
    }
    if (truncated)
        notes.push(`Plan truncated at ${MAX_PLAN_STEPS} steps; remaining candidates were dropped.`);
    return { steps, notes };
}
// ---------------------------------------------------------------------------
// Inventory (phase 1)
// ---------------------------------------------------------------------------
export function inventoryTarget(target) {
    const files = [];
    const contents = new Map();
    for (const path of collectSourceFiles(target)) {
        const content = readFileSync(path, "utf8");
        contents.set(path, content);
        const scanned = scanSource(content);
        files.push({
            path,
            lines: scanned.lineCount,
            sizeBytes: statSync(path).size,
            imports: scanned.imports,
            exports: scanned.exports,
        });
    }
    return { files, contents };
}
// ---------------------------------------------------------------------------
// Plan files (save from a plan-only run, apply later)
// ---------------------------------------------------------------------------
/** Load and validate a plan file; refuses anything writing outside `target`. */
export function loadPlanFile(planPath, target) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(planPath, "utf8"));
    }
    catch {
        throw new RefactorError(`Plan file is not readable JSON: ${planPath}`);
    }
    const stepsRaw = parsed?.steps;
    if (!Array.isArray(stepsRaw))
        throw new RefactorError(`Plan file has no steps array: ${planPath}`);
    const steps = stepsRaw.map((raw, index) => {
        const step = raw;
        if (typeof step?.id !== "string" ||
            typeof step.title !== "string" ||
            typeof step.detail !== "string" ||
            !Array.isArray(step.files) ||
            !Array.isArray(step.edits) ||
            typeof step.touchesPublicSurface !== "boolean") {
            throw new RefactorError(`Plan step ${index + 1} is malformed: ${planPath}`);
        }
        const edits = step.edits.map((edit) => {
            const candidate = edit;
            if (typeof candidate?.path !== "string" || typeof candidate.content !== "string") {
                throw new RefactorError(`Plan step ${step.id} has a malformed edit: ${planPath}`);
            }
            return { path: candidate.path, content: candidate.content };
        });
        if (edits.length === 0)
            throw new RefactorError(`Plan step ${step.id} has no edits: ${planPath}`);
        return {
            id: step.id,
            kind: "split-file",
            title: step.title,
            detail: step.detail,
            files: step.files,
            touchesPublicSurface: step.touchesPublicSurface,
            edits,
        };
    });
    // Containment before anything is written (spec safety invariant 2).
    for (const step of steps) {
        for (const edit of step.edits) {
            const resolved = resolve(edit.path);
            if (resolved !== target && !resolved.startsWith(target + sep)) {
                throw new RefactorError(`Step ${step.id} writes outside the target path; refused before any write: ${edit.path}`);
            }
        }
    }
    return { target, steps };
}
const STDERR_TAIL_LINES = 12;
function tailLines(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    return lines.slice(-STDERR_TAIL_LINES).join("\n");
}
/** Restore every path touched during this apply from the snapshot. */
function rollback(snapshot, written) {
    for (const path of written) {
        const original = snapshot.get(path);
        if (original === undefined)
            rmSync(path, { force: true });
        else
            writeFileSync(path, original, "utf8");
    }
}
/**
 * Execute a plan: snapshot the target, then per step write, run the suite,
 * and roll everything back on the first nonzero exit (spec phase 3).
 */
export async function applyPlan(plan, runCommand, cwd) {
    const target = plan.target;
    const snapshot = new Map();
    for (const path of collectSourceFiles(target))
        snapshot.set(path, readFileSync(path, "utf8"));
    // Belt and braces: containment is validated at load time; re-check here so
    // applyPlan stays safe when called directly.
    for (const step of plan.steps) {
        for (const edit of step.edits) {
            const resolved = resolve(edit.path);
            if (resolved !== target && !resolved.startsWith(target + sep)) {
                throw new RefactorError(`Step ${step.id} writes outside the target path; refused before any write: ${edit.path}`);
            }
        }
    }
    const applied = [];
    const written = new Set();
    for (const step of plan.steps) {
        for (const edit of step.edits) {
            mkdirSync(dirname(edit.path), { recursive: true });
            writeFileSync(edit.path, edit.content, "utf8");
            written.add(edit.path);
        }
        let outcome;
        try {
            outcome = await runCommand({ command: TEST_COMMAND, cwd });
        }
        catch (error) {
            outcome = { code: -1, stdout: "", stderr: String(error) };
        }
        if (outcome.code !== 0) {
            rollback(snapshot, written);
            return {
                applied,
                rolledBack: true,
                failedStepId: step.id,
                testExitCode: outcome.code,
                stderrTail: tailLines(outcome.stderr !== "" ? outcome.stderr : outcome.stdout),
            };
        }
        applied.push({ stepId: step.id, kind: step.kind, testExitCode: outcome.code, status: "applied" });
    }
    return { applied, rolledBack: false };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const SAFETY_NOTES = [
    "Every applied step runs `npm test`; the first red run restores the pre-apply snapshot.",
    "Edits are confined to the target path; plan steps pointing outside are refused.",
    "Steps flagged [public] change an exported name; review them before applying.",
];
function renderPlanOnly(target, inventory, steps, notes, loadedFrom) {
    const parts = [heading("/bridge-refactor")];
    const totalLines = inventory === null ? 0 : inventory.files.reduce((sum, file) => sum + file.lines, 0);
    const scope = inventory === null
        ? `Target: ${target}`
        : `Target: ${target} (${inventory.files.length} file(s), ${totalLines} lines) - PLAN ONLY, nothing written.`;
    parts.push(scope);
    if (loadedFrom !== null)
        parts.push(`Steps loaded from plan file: ${loadedFrom}`);
    if (inventory !== null && inventory.files.length > 0) {
        parts.push(table(["FILE", "LINES", "IMPORTS", "EXPORTS"], inventory.files.map((file) => [
            relative(target, file.path),
            String(file.lines),
            String(file.imports.length),
            file.exports.length === 0 ? "none" : file.exports.join(", "),
        ])));
    }
    if (steps.length === 0) {
        parts.push("No mechanical steps proposed for this target.");
    }
    else {
        parts.push(`Proposed steps (${steps.length}):`, "");
        parts.push(table(["ID", "KIND", "ACTION", "PUBLIC"], steps.map((step) => [
            step.id,
            step.kind,
            step.title,
            step.touchesPublicSurface ? "[public]" : "",
        ])));
    }
    const allNotes = [...notes, ...SAFETY_NOTES];
    if (allNotes.length > 0) {
        parts.push("Notes:", bulletList(allNotes));
    }
    parts.push(`Apply with: /bridge-refactor ${target} --apply`);
    parts.push("");
    parts.push("```json");
    parts.push(JSON.stringify({ target, steps }, null, 2));
    parts.push("```");
    return parts.join("\n");
}
function renderApply(target, report) {
    const parts = [
        heading("/bridge-refactor"),
        `Target: ${target}`,
        "",
        table(["STEP", "TESTS", "RESULT"], report.applied.map((record) => [
            `${record.stepId} (${record.kind})`,
            `exit ${record.testExitCode}`,
            record.status,
        ])),
    ];
    if (report.rolledBack) {
        parts.push(`ROLLED BACK at ${report.failedStepId}: ${TEST_COMMAND} exited ${report.testExitCode}; every write was restored from the pre-apply snapshot.`);
        if (typeof report.stderrTail === "string" && report.stderrTail !== "") {
            parts.push("", "Test output (tail):", "", "```", report.stderrTail, "```");
        }
    }
    else {
        parts.push(`APPLIED ${report.applied.length} step(s); tests stayed green after each one.`);
    }
    return parts.join("\n");
}
// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------
function usageResult() {
    return {
        markdown: [heading("/bridge-refactor"), USAGE, ""].join("\n"),
        data: { status: "usage" },
    };
}
function fail(message) {
    return {
        markdown: [heading("/bridge-refactor"), message, "", USAGE, ""].join("\n"),
        data: { status: "error", message },
    };
}
function parseRename(raw) {
    const idx = raw.indexOf(":");
    if (idx < 0)
        return { error: '--rename expects <from>:<to> with plain identifier names.' };
    const from = raw.slice(0, idx).trim();
    const to = raw.slice(idx + 1).trim();
    if (!isIdentifier(from) || !isIdentifier(to)) {
        return { error: '--rename expects <from>:<to> with plain identifier names.' };
    }
    return { from, to };
}
/** /bridge-refactor entry point; pure over (ctx, args), no global state. */
export async function runRefactor(ctx, args) {
    const primary = (args["_"] ?? "").trim();
    const restTokens = (args["rest"] ?? "")
        .trim()
        .split(/\s+/)
        .filter((token) => token !== "");
    const targetArg = primary !== "" ? primary : restTokens[0] ?? "";
    const planFileArg = primary !== "" ? restTokens[0] ?? "" : restTokens[1] ?? "";
    const wantsApply = args["apply"] !== undefined;
    const renameRaw = (args["rename"] ?? "").trim();
    if (targetArg === "")
        return usageResult();
    const target = resolve(targetArg);
    if (!existsSync(target))
        return fail(`No such file or directory: ${target}`);
    let rename;
    if (renameRaw !== "") {
        const parsed = parseRename(renameRaw);
        if ("error" in parsed)
            return fail(parsed.error);
        rename = parsed;
    }
    try {
        if (planFileArg !== "") {
            const planFilePath = resolve(planFileArg);
            const plan = loadPlanFile(planFilePath, target);
            return await finishRun(ctx, plan, null, [], planFilePath, wantsApply);
        }
        const inventory = inventoryTarget(target);
        if (inventory.files.length === 0) {
            return fail(`No source files under ${target}. Supported extensions: ${[...SOURCE_EXTENSIONS].join(" ")}`);
        }
        const built = buildRefactorPlan(inventory.contents, rename === undefined ? {} : { rename });
        return await finishRun(ctx, { target, steps: built.steps }, inventory, built.notes, null, wantsApply);
    }
    catch (error) {
        if (error instanceof RefactorError)
            return fail(error.message);
        throw error;
    }
}
async function finishRun(ctx, plan, inventory, notes, loadedFrom, wantsApply) {
    if (!wantsApply) {
        return {
            markdown: renderPlanOnly(plan.target, inventory, plan.steps, notes, loadedFrom),
            data: { mode: "plan", target: plan.target, steps: plan.steps },
        };
    }
    const seam = getExecSeam(ctx);
    if (seam === null) {
        return fail("No test-runner seam on this context; --apply refuses to write without a way to verify steps.");
    }
    if (plan.steps.length === 0) {
        return fail("Nothing to apply: the plan has zero steps.");
    }
    const report = await applyPlan(plan, seam, process.cwd());
    return {
        markdown: renderApply(plan.target, report),
        data: { mode: "apply", target: plan.target, ...report },
    };
}
//# sourceMappingURL=refactor.js.map