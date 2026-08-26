/**
 * /trust - plugin trust report card (docs/specs/commands/trust.md).
 *
 * Subcommands delivered in this wave:
 *   /trust <plugin>   render the committed card docs/catalog/cards/<slug>.md
 *   /trust scan <dir> run tools/scan over a local directory, summarize verdict
 *   /trust list       enumerate locally known cards
 *   /trust refresh [<plugin>]
 *                     re-scan installed plugins, diff against the recorded
 *                     audit, annotate the card's verified-at line
 *
 * Rules honored here:
 *  - A grade is never fabricated. No card means the NOT REVIEWED state plus a
 *    queue hint; nothing else (spec acceptance criterion 3).
 *  - Read-only and offline at read time; only `scan` spawns a process, and it
 *    goes through the documented scanner JSON boundary (lib/scan-client.ts).
 *  - `refresh` scans locally and annotates; it never rewrites a Grade row. A
 *    local scan is an observation, not an authority over a published grade.
 *  - Output is markdown through the injected OutputHelpers; ASCII only.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { annotateCardAudited, annotationSentence, auditStatePath, diffFindings, discoverInstalledPlugins, fingerprintsOf, hashPluginDir, isoDate, loadAuditState, saveAuditState, withRecord, } from "../lib/drift.js";
import { gradeCell, gradeLabel } from "../lib/output.js";
import { scanDirectory } from "../lib/scan-client.js";
import { SEVERITIES } from "../lib/types.js";
const USAGE = "Usage: /bridge-trust <plugin> | scan <directory> | list | refresh [<plugin>]";
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
/**
 * Render the refresh report. Pure over its inputs so the diff rendering and
 * the no-card-yet path are testable without a scanner or a filesystem.
 */
export function renderRefresh(ctx, outcomes) {
    if (outcomes.length === 0) {
        return [
            "### Trust refresh",
            "",
            "No installed plugins found under this profile, so there is nothing to",
            "re-check. Drift is measured against packages present in",
            "`$DSH_HOME/profiles/<profile>/node_modules`; an empty profile is not a",
            "clean bill of health.",
            "",
            "Next:",
            "- `/bridge-trust scan <directory>` grade any local directory offline",
            "- `/bridge-browse` see the committed catalog",
            "",
        ].join("\n");
    }
    const parts = ["### Trust refresh", ""];
    parts.push(ctx.output.table(["PLUGIN", "CARD", "LOCAL", "NEW", "RESOLVED"], outcomes.map((o) => [
        o.slug,
        o.cardGrade === null ? "no card" : gradeCell(o.cardGrade),
        gradeCell(o.localGrade),
        String(o.diff.added.length),
        String(o.diff.resolved.length),
    ])));
    for (const outcome of outcomes) {
        parts.push(`**${outcome.slug}**`, "");
        if (outcome.firstAudit) {
            parts.push("First local audit. Every finding below is new to the local record, not", "new to the plugin; there was no earlier scan to compare against.", "");
        }
        if (outcome.diff.added.length > 0) {
            parts.push("New findings since the recorded audit:", "");
            parts.push(...outcome.diff.added.slice(0, 10).map((f) => `- ${f}`), "");
        }
        if (outcome.diff.resolved.length > 0) {
            parts.push("Findings no longer present:", "");
            parts.push(...outcome.diff.resolved.slice(0, 10).map((f) => `- ${f}`), "");
        }
        if (outcome.diff.added.length === 0 && outcome.diff.resolved.length === 0) {
            parts.push(`No finding changes; ${outcome.diff.unchanged} finding(s) carried over.`, "");
        }
        if (outcome.cardGrade === null) {
            parts.push(`No card exists for \`${outcome.slug}\`, so nothing was annotated and no`, "published grade is implied. The local grade above is this machine's scan", "of this machine's copy, and it is not a dsh-bridge review.", "", `Next: \`/bridge-trust queue ${outcome.slug}\` request a maintainer review.`, "");
        }
        else if (outcome.annotated) {
            parts.push(`Annotated \`docs/catalog/cards/${outcome.slug}.md\` on its Audited row.`, "The published grade was not changed: a local scan cannot raise or lower it.", "");
        }
        else {
            parts.push(`Card \`docs/catalog/cards/${outcome.slug}.md\` has no Audited row to annotate;`, "the diff above is reported without touching the card.", "");
        }
    }
    return parts.join("\n");
}
/**
 * Re-scan installed plugins, diff findings against the recorded audit,
 * annotate each card's verified-at line, and persist the new hashes.
 *
 * A plugin whose scan fails is skipped rather than recorded, so a transient
 * scanner failure cannot silently mark drift as resolved.
 */
export async function refreshInstalled(ctx, subject, deps) {
    const discover = deps.discover ?? discoverInstalledPlugins;
    const scan = deps.scan ?? (async (dir) => (await scanDirectory(dir)).report);
    const hash = deps.hash ?? hashPluginDir;
    const readState = deps.readState ?? loadAuditState;
    const writeState = deps.writeState ?? saveAuditState;
    const writeCard = deps.writeCard ?? ((path, markdown) => writeFileSync(path, markdown, "utf8"));
    const cards = deps.cardsDir ?? cardsDir();
    const date = isoDate(deps.now ?? new Date());
    const statePath = auditStatePath(deps.home);
    const wanted = toSlug(subject);
    const installed = discover(deps.dshHome, deps.profile).filter((p) => wanted === "" || p.slug === wanted);
    let state = readState(statePath);
    const outcomes = [];
    for (const plugin of installed) {
        let report;
        try {
            report = await scan(plugin.dir);
        }
        catch {
            continue;
        }
        const record = state.plugins[plugin.pkg];
        const current = fingerprintsOf(report);
        const diff = diffFindings(record?.findings ?? [], current);
        const treeHash = hash(plugin.dir);
        const cardPath = join(cards, `${plugin.slug}.md`);
        let cardGrade = null;
        let annotated = false;
        if (existsSync(cardPath)) {
            const markdown = readFileSync(cardPath, "utf8");
            cardGrade = gradeFromCard(markdown);
            const annotation = annotationSentence({
                date,
                localGrade: report.grading.grade,
                cardGrade,
                diff,
                hash: treeHash,
            });
            const updated = annotateCardAudited(markdown, annotation);
            if (updated !== markdown) {
                writeCard(cardPath, updated);
                annotated = true;
            }
        }
        outcomes.push({
            pkg: plugin.pkg,
            slug: plugin.slug,
            localGrade: report.grading.grade,
            cardGrade,
            diff,
            hash: treeHash,
            annotated,
            firstAudit: record === undefined,
        });
        state = withRecord(state, {
            slug: plugin.slug,
            pkg: plugin.pkg,
            hash: treeHash ?? "",
            auditedOn: date,
            grade: report.grading.grade,
            findings: current,
            scannerVersion: report.scannerVersion,
        });
    }
    if (outcomes.length > 0)
        writeState(statePath, state);
    return { markdown: renderRefresh(ctx, outcomes), outcomes };
}
/** Entry point wired into lib/registry.ts as `bridge-trust`. */
export async function runTrust(ctx, args) {
    const positional = (args["_"] ?? "").trim();
    const rest = (args["rest"] ?? "").trim();
    if (positional === "scan")
        return { markdown: await scanTarget(ctx, rest) };
    if (positional === "list")
        return { markdown: listCards(ctx) };
    if (positional === "refresh") {
        const { markdown } = await refreshInstalled(ctx, rest, {
            home: ctx.paths.home,
            dshHome: ctx.paths.dshHome,
            profile: ctx.profile,
        });
        return { markdown };
    }
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
                "- `/bridge-trust refresh` re-check installed plugins against their cards",
                "",
            ].join("\n"),
        };
    }
    return { markdown: await showCard(ctx, positional) };
}
//# sourceMappingURL=trust.js.map