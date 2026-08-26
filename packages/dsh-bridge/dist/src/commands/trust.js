/**
 * /trust - plugin trust report card (docs/specs/commands/trust.md).
 *
 * Subcommands delivered in this wave:
 *   /trust <plugin>   render the committed card docs/catalog/cards/<slug>.md
 *   /trust scan <dir> run tools/scan over a local directory, summarize verdict
 *   /trust list       enumerate locally known cards
 *
 * Rules honored here:
 *  - A grade is never fabricated. No card means the NOT REVIEWED state plus a
 *    queue hint; nothing else (spec acceptance criterion 3).
 *  - Read-only and offline at read time; only `scan` spawns a process, and it
 *    goes through the documented scanner JSON boundary (lib/scan-client.ts).
 *  - Output is markdown through the injected OutputHelpers; ASCII only.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gradeCell, gradeLabel } from "../lib/output.js";
import { scanDirectory } from "../lib/scan-client.js";
import { SEVERITIES } from "../lib/types.js";
const USAGE = "Usage: /bridge-trust <plugin> | scan <directory> | list";
/** Directory holding committed trust cards, resolved from this module's build output. */
function cardsDir() {
    // dist/src/commands/trust.js -> dist/src -> dist -> package -> packages -> repo
    return join(import.meta.dirname, "..", "..", "..", "..", "..", "docs", "catalog", "cards");
}
/**
 * Normalize any accepted subject to a catalog slug (trust spec `<plugin>`):
 * full GitHub URL, `owner/repo`, or an already-slug-like name.
 */
export function toSlug(input) {
    const withoutUrl = input.replace(/^https?:\/\/[^/]+\//i, "").replace(/^[a-z]+:/i, "");
    const last = withoutUrl.split("/").filter(Boolean).pop() ?? "";
    return last.replace(/\.git$/i, "").replace(/\.md$/i, "").trim().toLowerCase();
}
/**
 * Parse exactly what we render from a committed card (modlens.md format):
 * the H1 title, the numbered `## 1. Header` table block, and the
 * `## 2. Verdict in one sentence` paragraph.
 */
function parseCard(markdown) {
    const lines = markdown.split(/\r?\n/);
    const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
    function sectionBody(headerPattern) {
        const idx = lines.findIndex((line) => headerPattern.test(line));
        if (idx === -1)
            return "";
        const rest = lines.slice(idx + 1);
        const end = rest.findIndex((line) => /^##\s/.test(line));
        return rest.slice(0, end === -1 ? undefined : end).join("\n").trim();
    }
    return {
        title,
        headerTable: sectionBody(/^##\s+1\.\s+Header\s*$/),
        verdict: sectionBody(/^##\s+2\.\s+Verdict in one sentence\s*$/),
    };
}
/** Extract one `| Grade | **X** |`-style row value out of a card. */
export function gradeFromCard(markdown) {
    for (const line of markdown.split(/\r?\n/)) {
        const row = /^\|\s*Grade\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
        if (row) {
            const cell = row[1] ?? "";
            const bold = /\*\*(.+?)\*\*/.exec(cell);
            return (bold?.[1] ?? cell).trim();
        }
        const kv = /^\s*Grade:\s*(.+)$/i.exec(line);
        if (kv)
            return (kv[1] ?? "").trim();
    }
    return null;
}
function notReviewed(slug) {
    return [
        `### Trust report: ${slug}`,
        "",
        "NOT REVIEWED",
        "",
        `dsh-bridge has no audit card for \`${slug}\`. No grade is shown because none`,
        "was earned by a review. Treat it as arbitrary code with your shell's privileges.",
        "",
        "Next:",
        `- \`/bridge-trust queue ${slug}\` request a maintainer review`,
        "- `/bridge-trust list` see every reviewed plugin",
        "",
    ].join("\n");
}
/**
 * Render one card's markdown through the injected output helpers. Pure over
 * its inputs; split from showCard so tests can feed fixture card files.
 */
export function renderCard(ctx, slug, markdown) {
    const parsed = parseCard(markdown);
    const grade = gradeFromCard(parsed.headerTable) ?? gradeFromCard(markdown);
    const parts = [`### ${parsed.title || `Trust report: ${slug}`}`, ""];
    parts.push(ctx.output.card("TRUST REPORT CARD", [
        ["grade", gradeLabel(grade)],
        ["card", `docs/catalog/cards/${slug}.md`],
    ]));
    if (parsed.headerTable !== "")
        parts.push(parsed.headerTable, "");
    if (parsed.verdict !== "")
        parts.push(`**Verdict:** ${parsed.verdict}`, "");
    parts.push(`Evidence: \`docs/catalog/cards/${slug}.md\`. A grade covers one pinned artifact only; other versions are unreviewed.`, "");
    return parts.join("\n");
}
async function showCard(ctx, rawName) {
    const slug = toSlug(rawName);
    if (slug === "")
        return ["### /bridge-trust", "", USAGE, ""].join("\n");
    const path = join(cardsDir(), `${slug}.md`);
    if (!existsSync(path))
        return notReviewed(slug);
    return renderCard(ctx, slug, readFileSync(path, "utf8"));
}
function listCards(ctx) {
    const dir = cardsDir();
    let files;
    try {
        files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
    }
    catch {
        files = [];
    }
    if (files.length === 0) {
        return [
            "### Reviewed plugins",
            "",
            "No trust cards found locally. This checkout has no `docs/catalog/cards/`",
            "directory, so the bridge has nothing to read - it does not mean zero",
            "plugins have been audited upstream.",
            "",
            "Next:",
            "- `/bridge-browse` see the catalog index, which carries grades of its own",
            "- `/bridge-trust scan <directory>` grade a local directory yourself, offline",
            "- `/bridge-trust queue <plugin>` request a maintainer review",
            "",
        ].join("\n");
    }
    const rows = files.map((file) => {
        const slug = file.slice(0, -3);
        const markdown = readFileSync(join(dir, file), "utf8");
        return [slug, gradeCell(gradeFromCard(markdown))];
    });
    return [
        "### Reviewed plugins",
        "",
        ctx.output.table(["PLUGIN", "GRADE"], rows),
        "Grades are pinned to audited commits. `/bridge-trust <plugin>` shows the evidence.",
        "",
    ].join("\n");
}
const SEVERITY_RANK = Object.freeze(Object.fromEntries(SEVERITIES.map((s, i) => [s, i])));
/**
 * Render the scan summary. Split from scanTarget so tests exercise rendering
 * against a mocked ScanReport without spawning the scanner process.
 */
export function renderScanSummary(ctx, target, report) {
    const counts = report.grading.counts;
    const parts = [
        "### Scan summary",
        "",
        ctx.output.card("LOCAL SCAN", [
            ["target", target],
            ["grade", gradeLabel(report.grading.grade)],
            ["score", String(report.grading.score)],
        ]),
        "",
        `Files scanned: ${report.stats.filesScanned} (${report.stats.filesSkipped} skipped)`,
        // Counts render as a table, worst-first, and only for severities that
        // actually fired: a clean scan must not print a [CRITICAL] badge next to a
        // zero. Empty input makes table() return "", which drops the section.
        ctx.output.table(["SEVERITY", "COUNT"], [...SEVERITIES]
            .reverse()
            .filter((severity) => counts[severity] > 0)
            .map((severity) => [ctx.output.badge(severity), String(counts[severity])])),
        "",
    ];
    if (report.findings.length > 0) {
        const ordered = [...report.findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
        parts.push("Top findings:", "");
        parts.push(ctx.output.table(["SEVERITY", "RULE", "LOCATION", "MESSAGE"], ordered.slice(0, 5).map((f) => [ctx.output.badge(f.severity), f.ruleId, `${f.path}:${f.line}`, f.message])));
    }
    else {
        parts.push("No findings in scanned surface. Absence of findings is not a safety guarantee:", `the scanner read ${report.stats.filesScanned} file(s) and skipped ${report.stats.filesSkipped}, and it`, "cannot see runtime behavior, network destinations, or anything a build step", "generates later. Read the source before you trust it.", "");
    }
    parts.push(`Rules digest: \`${report.rulesDigest.slice(0, 16)}\` (scanner ${report.scannerVersion})`, "");
    return parts.join("\n");
}
async function scanTarget(ctx, target) {
    const resolved = target.trim();
    if (resolved === "")
        return ["### /bridge-trust scan", "", "Usage: /bridge-trust scan <directory>", ""].join("\n");
    const { report } = await scanDirectory(resolved);
    return renderScanSummary(ctx, resolved, report);
}
/** Entry point wired into lib/registry.ts as `bridge-trust`. */
export async function runTrust(ctx, args) {
    const positional = (args["_"] ?? "").trim();
    const rest = (args["rest"] ?? "").trim();
    if (positional === "scan")
        return { markdown: await scanTarget(ctx, rest) };
    if (positional === "list")
        return { markdown: listCards(ctx) };
    if (positional === "") {
        return {
            markdown: [
                "### /bridge-trust",
                "",
                USAGE,
                "",
                "Examples:",
                "- `/bridge-trust modlens` show one audit card",
                "- `/bridge-trust scan ./some-plugin` scan a local directory",
                "- `/bridge-trust list` enumerate reviewed plugins",
                "",
            ].join("\n"),
        };
    }
    return { markdown: await showCard(ctx, positional) };
}
//# sourceMappingURL=trust.js.map