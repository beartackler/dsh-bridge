/**
 * `/bridge-install` - verified installer (docs/specs/commands/install.md).
 *
 * The command resolves a name against the committed catalog, shows the grade
 * with the two worst findings quoted verbatim and their provenance, runs the
 * consent gate, and then, with `--yes`, executes the documented
 * `dsh plugin add` through the host exec seam and verifies that a layer
 * actually mounted.
 *
 * Without `--yes` nothing runs: the command stops at the consent gate and
 * prints the exact line it would execute. That default is the point. The gate
 * must sit on the path a user actually walks, which is why the execution half
 * exists at all (docs/reviews/pm-product-review.md §2.4), and it must never be
 * satisfiable by anything short of a typed flag.
 *
 * Catalog inputs, both committed and read-only:
 *   docs/catalog/manifest.json  entries (`name`, `repo`, `url`, `category`, ...)
 *   docs/catalog/INDEX.md       the graded rows: grade, verdict, date, card path
 *
 * Invariants carried from the spec and CHARTER.md:
 *  - A grade is never fabricated. No INDEX.md row means Unlisted (spec §5.2).
 *  - Ambiguity is never resolved silently (spec §3): candidates are listed and
 *    nothing is emitted.
 *  - Unverified, D, and F entries require the explicit
 *    `--i-accept-unverified-risk` flag (spelled `--i-accept-unreviewed-risk`
 *    equivalently); F additionally requires `--force` (AC-9, AC-10). No
 *    keypress, `--yes`, or bare Enter satisfies the gate.
 *  - Missing/unparseable catalog fails closed to unverified with a degraded
 *    banner (F-4 / AC-23).
 *  - Every emitted command is accompanied by its undo command (AC-21).
 *  - Nothing is ever installed without consent: `--yes` alone is inert on the
 *    unverified path, and no execution happens on any blocked path.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { catalogEntry, unavailableDetail } from "../lib/catalog-paths.js";
import { cardFilePath, cardProvenance, executeInstall, execSeamOf, noExecSeamFailure, stageSource, worstCardFindings, } from "../lib/install-exec.js";
import { gradeCell, gradeLabel } from "../lib/output.js";
import { scanDirectory } from "../lib/scan-client.js";
/** Grades that may be installed after a single confirmation (spec §5.1). */
const CONSENT_FREE_GRADES = ["A", "B", "C"];
/** Flag that alone satisfies the §5.3 risk gate. Never suggested by the UI. */
export const RISK_FLAG = "i-accept-unverified-risk";
/**
 * Accepted spelling of the same gate. The unverified path is described to the
 * user as "unreviewed" (nobody has reviewed this), so both words work; a user
 * who types what the warning says must not be told they typed it wrong.
 */
export const UNREVIEWED_RISK_FLAG = "i-accept-unreviewed-risk";
// ---------------------------------------------------------------------------
// Catalog location and loading
// ---------------------------------------------------------------------------
/**
 * Walk up from this compiled module to the checkout's `docs/catalog`.
 * Returns undefined when absent so the command degrades (F-4) instead of
 * throwing.
 */
export function resolveInstallCatalog(startDir) {
    const manifestPath = catalogEntry("manifest.json", startDir);
    if (manifestPath === undefined)
        return undefined;
    return { manifestPath, indexPath: catalogEntry("INDEX.md", startDir) ?? "" };
}
/**
 * `owner/repo`, lowercase, `.git` and any `#subpath` stripped. Subpath entries
 * share their parent repo's audit, exactly as /bridge-browse joins them.
 */
export function repoBase(repo) {
    const head = repo.toLowerCase().replace(/\.git$/, "").split("#")[0] ?? "";
    const segments = head.split("/").filter((part) => part !== "");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : head;
}
/** Short catalog id: the repo's last path segment, lowercase. */
export function shortId(repo) {
    const base = repoBase(repo);
    return base.split("/").pop() ?? base;
}
/**
 * One graded row of docs/catalog/INDEX.md:
 * `| B | label | owner/repo | stars | verdict | date | [card](cards/x.md) |`
 * Only rows whose grade cell is a bare A-F letter count; the grading-band
 * prose and revision tables can never contribute a grade.
 */
export function parseIndexGrades(indexMarkdown) {
    const rows = new Map();
    for (const line of indexMarkdown.split(/\r?\n/)) {
        if (!line.startsWith("|"))
            continue;
        const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
        if (cells.length < 7)
            continue;
        const grade = cells[0] ?? "";
        if (!/^[A-F]$/.test(grade))
            continue;
        const repo = cells[2] ?? "";
        if (!repo.includes("/"))
            continue;
        const cardMatch = /\(([^)]+\.md)\)/.exec(cells[6] ?? "");
        rows.set(repoBase(repo), {
            grade: grade,
            label: cells[1] ?? "",
            verdict: cells[4] ?? "",
            verifiedAt: cells[5] ?? "",
            card: cardMatch ? `docs/catalog/${cardMatch[1]}` : "",
        });
    }
    return rows;
}
let catalogCache;
/** Load and join manifest + INDEX, memoized per (path, mtime) pair. */
export function loadCandidates(manifestPath, indexPath) {
    const stamp = `${mtimeOf(manifestPath)}:${mtimeOf(indexPath)}`;
    if (catalogCache &&
        catalogCache.manifestPath === manifestPath &&
        catalogCache.indexPath === indexPath &&
        catalogCache.stamp === stamp) {
        return catalogCache.candidates;
    }
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(parsed))
        throw new Error(`catalog manifest must be a JSON array: ${manifestPath}`);
    const grades = existsSync(indexPath)
        ? parseIndexGrades(readFileSync(indexPath, "utf8"))
        : new Map();
    const candidates = [];
    const seen = new Set();
    for (const raw of parsed) {
        if (raw === null || typeof raw !== "object")
            continue;
        const record = raw;
        const repo = typeof record["repo"] === "string" ? record["repo"] : "";
        if (repo === "")
            continue;
        const base = repoBase(repo);
        if (base === "" || seen.has(base))
            continue;
        seen.add(base);
        const row = grades.get(base);
        candidates.push({
            id: shortId(repo),
            repo: base,
            source: `github:${base}`,
            category: typeof record["category"] === "string" ? record["category"] : "",
            description: typeof record["description_en"] === "string" ? record["description_en"] : "",
            grade: row?.grade ?? null,
            verdict: row?.verdict ?? "",
            verifiedAt: row?.verifiedAt ?? "",
            card: row?.card ?? "",
        });
    }
    catalogCache = { manifestPath, indexPath, stamp, candidates };
    return candidates;
}
function mtimeOf(path) {
    try {
        return String(statSync(path).mtimeMs);
    }
    catch {
        return "absent";
    }
}
/** Native specifier shapes accepted verbatim (spec §3 rule 4). */
const SPECIFIER = /^(github|npm|tgz):(.+)$/;
/** Levenshtein distance, capped early: only distances <= 2 matter here. */
export function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2)
        return 3;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
        }
        previous = current;
    }
    return previous[b.length] ?? 3;
}
/**
 * Resolve a user-typed name. Order is the spec's table, first rule wins:
 *   1. exact catalog id            2. exact `owner/repo`
 *   3. explicit specifier (reverse-lookup by source, else Unlisted)
 *   4. fuzzy: unique prefix or edit distance <= 2 -> disambiguation only
 * Nothing here touches the network; all four rules read the catalog only.
 */
export function resolve(input, candidates) {
    const query = input.trim().toLowerCase();
    const byId = candidates.filter((entry) => entry.id === query);
    if (byId.length === 1 && byId[0])
        return { kind: "match", rule: "id", candidate: byId[0] };
    if (byId.length > 1)
        return { kind: "ambiguous", rule: "id", candidates: byId };
    const byRepo = candidates.find((entry) => entry.repo === repoBase(query));
    if (byRepo && query.includes("/") && !SPECIFIER.test(query)) {
        return { kind: "match", rule: "repo", candidate: byRepo };
    }
    const specifier = SPECIFIER.exec(query);
    if (specifier) {
        const scheme = specifier[1] ?? "";
        const body = specifier[2] ?? "";
        if (scheme === "github") {
            const hit = candidates.find((entry) => entry.repo === repoBase(body));
            // Rule 4: a specifier matching a catalog source is promoted to verified.
            if (hit)
                return { kind: "match", rule: "source", candidate: hit };
        }
        return { kind: "unlisted", source: `${scheme}:${body}`, id: shortId(body) || body };
    }
    const prefixed = candidates.filter((entry) => entry.id.startsWith(query));
    if (prefixed.length === 1 && prefixed[0])
        return { kind: "match", rule: "fuzzy", candidate: prefixed[0] };
    const near = candidates.filter((entry) => editDistance(entry.id, query) <= 2);
    const pool = prefixed.length > 0 ? prefixed : near;
    if (pool.length > 1)
        return { kind: "ambiguous", rule: "fuzzy", candidates: pool.slice(0, 10) };
    if (pool.length === 1 && pool[0])
        return { kind: "match", rule: "fuzzy", candidate: pool[0] };
    return { kind: "not-found", nearMisses: near.slice(0, 5) };
}
/**
 * Gate the emission of an install command. Grades A-C pass; anything else
 * (unlisted, D, F) needs the risk flag, and F needs `--force` on top of it.
 */
export function consentFor(grade, args) {
    const accepted = args[RISK_FLAG] !== undefined || args[UNREVIEWED_RISK_FLAG] !== undefined;
    const forced = args["force"] !== undefined;
    if (grade !== null && CONSENT_FREE_GRADES.includes(grade))
        return { allowed: true };
    if (!accepted) {
        return {
            allowed: false,
            reason: grade === null
                ? "this plugin has no dsh-bridge audit; nobody has reviewed it"
                : `grade ${grade} carries findings a user must accept explicitly`,
            requiredFlag: grade === null ? `--${UNREVIEWED_RISK_FLAG}` : `--${RISK_FLAG}`,
        };
    }
    if (grade === "F" && !forced) {
        return {
            allowed: false,
            reason: "grade F means demonstrated hostility; the risk flag alone does not reach it",
            requiredFlag: "--force",
        };
    }
    return { allowed: true };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const USAGE = "Usage: /bridge-install <plugin | github:owner/repo | npm:pkg | tgz:./p.tgz> [--report] [--profile <name>]";
/** `dsh plugin add` invocation, byte-identical to what a user should run (AC-13). */
export function installCommand(profile, source) {
    return `dsh plugin --profile ${profile} add ${source}`;
}
export function uninstallCommand(profile, id) {
    return `dsh plugin --profile ${profile} remove ${id}`;
}
function checklist(profile, candidate) {
    return [
        "After running it, verify the install actually composed a layer:",
        "",
        `1. Bundle registered: the package appears in \`dsh.profile.bundles\` of ${profilePackageHint(profile)}.`,
        `2. Layer composed: \`dsh --profile ${profile} --dump-config\` contains a \`# == ${candidate.id}\` marker.`,
        "3. Mounts present: the plugin's declared skills and commands appear in the composed config.",
        "4. No surprise rows: nothing new touches `approval`, `sandbox`, or a model route.",
        "",
        "If any step fails, the plugin installed as a plain dependency and activated nothing.",
        "",
        `Undo: \`${uninstallCommand(profile, candidate.id)}\``,
        "",
    ];
}
function profilePackageHint(profile) {
    return `\`~/.dsh/profiles/${profile}/package.json\``;
}
/** Verified trust summary card (spec §5.1). Absence is stated, never omitted. */
export function renderTrustCard(ctx, candidate, profile) {
    const parts = [
        `### /bridge-install ${candidate.id}`,
        "",
        ctx.output.card("TRUST SUMMARY", [
            ["plugin", candidate.id],
            ["grade", gradeLabel(candidate.grade)],
            ["verified", candidate.verifiedAt || "unknown"],
            ["source", candidate.source],
            ["profile", profile],
        ]),
    ];
    if (candidate.description !== "")
        parts.push(candidate.description, "");
    if (candidate.verdict !== "")
        parts.push(`**Verdict:** ${candidate.verdict}`, "");
    parts.push(candidate.card !== ""
        ? `Full report: \`${candidate.card}\` (evidence with file:line citations).`
        : "No report card file is committed for this entry; the grade above comes from docs/catalog/INDEX.md.", "", "A grade covers one audited commit only. It is evidence, not a safety guarantee.", "");
    return parts.join("\n");
}
/** Unverified warning (spec §5.2). Wording is normative; do not soften. */
export function renderUnverifiedWarning(id, source, reason) {
    return [
        `### /bridge-install ${id}`,
        "",
        `WARNING: ${id} is NOT in the dsh-bridge verified catalog.`,
        "",
        `Reason: ${reason}.`,
        "",
        "Nobody has reviewed this plugin. Installing it means:",
        "",
        "- its install (`prepare`) script runs on your machine BEFORE any permission",
        "  check - DSH consults approval only for sandbox escalation, not for",
        "  install-time code",
        "- it loads inside the harness process with full context access",
        "- its config layer can disable your approval and sandbox rows silently",
        "  (see docs/audits/dsh-builtin-redteam.md section F2)",
        "",
        `Source: ${source}`,
        "",
    ].join("\n");
}
function renderBlocked(head, decision) {
    const spellings = decision.requiredFlag === `--${UNREVIEWED_RISK_FLAG}`
        ? [`Accepted spellings: \`--${UNREVIEWED_RISK_FLAG}\` or \`--${RISK_FLAG}\`.`, ""]
        : [];
    return [
        head,
        "Blocked: nothing was installed and no install command is emitted.",
        "",
        `Why: ${decision.reason}.`,
        "",
        "To proceed you must state the risk explicitly on the command line:",
        "",
        `    /bridge-install <plugin> ${decision.requiredFlag} --yes`,
        "",
        ...spellings,
        "Recommended first: `/bridge-trust scan <local checkout>` to review the code",
        "before it ever runs.",
        "",
    ].join("\n");
}
/**
 * The consent gate itself: the user has seen the evidence, and now has to
 * choose. `--yes` is the only thing that turns this readout into an action,
 * and it is deliberately not offered as a keypress or a default.
 */
function renderConsentGate(profile, candidate, extraFlags) {
    const flags = ["--yes", ...extraFlags].join(" ");
    return [
        "CONSENT REQUIRED",
        "",
        "Nothing has been installed. dsh-bridge will run exactly this command, and",
        "nothing else, if you approve it:",
        "",
        "```sh",
        installCommand(profile, candidate.source),
        "```",
        "",
        `Approve by re-running with \`--yes\`:`,
        "",
        "```",
        `/bridge-install ${candidate.id} ${flags}`.replace(/\s+/g, " "),
        "```",
        "",
        `Undo, at any point after: \`${uninstallCommand(profile, candidate.id)}\``,
        "",
    ].join("\n");
}
/** Evidence block: the two worst findings, quoted, with their provenance. */
function renderEvidence(findings, provenance) {
    const lines = ["WORST FINDINGS (quoted verbatim from the audit)", ""];
    if (findings.length === 0) {
        lines.push("The committed card lists no findings section this command can quote. That is", "an absence of quotable text, not an absence of risk; read the full card.", "");
    }
    else {
        for (const finding of findings) {
            lines.push(`${finding.text}`, `    - ${finding.citation}`, "");
        }
    }
    lines.push("PROVENANCE", "", `- audited artifact: ${provenance.pinned || "not stated on the card"}`, `- audit date: ${provenance.audited || "not stated on the card"}`, `- card revision: ${provenance.revision || "not stated on the card"}`, `- source of this grade: \`${provenance.card}\``, "", "The grade covers that one pinned commit. Anything published since is ungraded.", "");
    return lines.join("\n");
}
/** Fresh scanner findings for an unreviewed source, quoted with file:line. */
function renderScanFindings(report) {
    const ranked = [...report.findings].sort((a, b) => SCAN_SEVERITY_RANK.indexOf(b.severity) - SCAN_SEVERITY_RANK.indexOf(a.severity));
    const lines = [
        "FRESH LOCAL SCAN (no audit exists, so one was run just now)",
        "",
        `- scanner ${report.scannerVersion}, rules ${report.rulesDigest.slice(0, 12)}`,
        `- ${report.stats.filesScanned} files scanned, machine grade ${report.grading.grade}`,
        `- counts: critical ${report.grading.counts.critical}, high ${report.grading.counts.high}, medium ${report.grading.counts.medium}, low ${report.grading.counts.low}`,
        "",
    ];
    if (ranked.length === 0) {
        lines.push("No findings in the scanned surface. That is not a clean bill of health: it", "means these rules found nothing, over these files, at this moment.", "");
    }
    else {
        lines.push("Worst findings:", "");
        for (const finding of ranked.slice(0, 2)) {
            lines.push(`- [${finding.severity}] ${finding.message}`, `    - ${finding.path}:${finding.line}:${finding.col}`, "");
        }
        if (ranked.length > 2)
            lines.push(`${ranked.length - 2} further findings; run \`/bridge-trust scan\` for all of them.`, "");
    }
    lines.push("A machine grade is a signal, not a review. Nobody has read this code.", "");
    return lines.join("\n");
}
const SCAN_SEVERITY_RANK = ["info", "low", "medium", "high", "critical"];
/** Render one actionable failure. Every path names what to do next. */
function renderFailure(head, failure) {
    return [
        head,
        `FAILED: ${failure.summary}`,
        "",
        failure.detail,
        "",
        "What to do next:",
        "",
        ...failure.nextSteps.map((step) => `- ${step}`),
        "",
    ].join("\n");
}
/** Report what actually changed, read back from disk after a real install. */
function renderInstalled(head, profile, candidate, change, progress) {
    const deps = change.addedDependencies.length === 0
        ? ["- profile dependencies: no new row observed (the manifest may be written elsewhere)"]
        : change.addedDependencies.map((row) => `- profile dependency added: \`${row}\``);
    return [
        head,
        "INSTALLED",
        "",
        "Command run:",
        "",
        "```sh",
        change.command,
        "```",
        "",
        ...progress.map((line) => `    ${line}`),
        "",
        "What changed:",
        "",
        ...deps,
        `- layer mounted: yes, \`${candidate.id}\` appears in the composed config for profile \`${profile}\``,
        "- nothing else was written; dsh-bridge changed no approval, sandbox, or model row",
        "",
        change.output === "" ? "" : `Installer output:\n\n\`\`\`\n${change.output}\n\`\`\`\n`,
        `Undo: \`${uninstallCommand(profile, candidate.id)}\``,
        "",
    ].join("\n");
}
function renderEmit(head, profile, candidate) {
    return [
        head,
        "Run this to install (this host exposes no exec seam, so dsh-bridge cannot run it):",
        "",
        "```sh",
        installCommand(profile, candidate.source),
        "```",
        "",
        ...checklist(profile, candidate),
    ].join("\n");
}
function renderAmbiguous(query, resolution, ctx) {
    return [
        `### /bridge-install ${query}`,
        "",
        `"${query}" matches ${resolution.candidates.length} catalog entries. Nothing was installed;`,
        "ambiguity is never resolved silently.",
        "",
        ctx.output.table(["GRADE", "PLUGIN", "REPO", "SOURCE"], resolution.candidates.map((entry) => [gradeCell(entry.grade), entry.id, entry.repo, entry.source])),
        "Re-run with an exact repo or specifier, e.g. `/bridge-install github:owner/repo`.",
        "",
    ].join("\n");
}
function renderNotFound(query, near) {
    const lines = [
        `### /bridge-install ${query}`,
        "",
        `No catalog entry resolves "${query}".`,
        "",
    ];
    if (near.length > 0) {
        lines.push("Near misses:", "", ...near.map((entry) => `- ${entry.id} (${entry.repo})`), "");
    }
    lines.push("Search the catalog: `/bridge-browse find <term>`.", "Install an off-catalog source directly: `/bridge-install github:owner/repo`.", "");
    return lines.join("\n");
}
function renderReport(candidate, ctx, profile) {
    return [
        renderTrustCard(ctx, candidate, profile),
        "Report mode: no install command is emitted.",
        "",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------
/**
 * Consent, in one place, so no path can install without passing through it.
 * Two independent conditions must both hold:
 *   1. the risk ladder (`consentFor`) allows the grade at all;
 *   2. the user typed `--yes` on this invocation.
 * `--yes` alone never satisfies (1), and (1) alone never triggers execution.
 */
export function mayExecute(grade, args) {
    return consentFor(grade, args).allowed && args["yes"] !== undefined;
}
/** Flags the user must repeat on the approving re-run, echoed back exactly. */
function carriedFlags(args) {
    const flags = [];
    if (args[RISK_FLAG] !== undefined)
        flags.push(`--${RISK_FLAG}`);
    if (args[UNREVIEWED_RISK_FLAG] !== undefined)
        flags.push(`--${UNREVIEWED_RISK_FLAG}`);
    if (args["force"] !== undefined)
        flags.push("--force");
    return flags;
}
/**
 * Perform the approved install and render its outcome. Every exit from here is
 * either a verified mount or a named, actionable failure; there is no path that
 * reports success without having read the composed config back.
 */
async function performInstall(head, profile, candidate, ctx, options) {
    const command = installCommand(profile, candidate.source);
    const exec = options.exec ?? execSeamOf(ctx);
    if (exec === null) {
        // Honest degradation: the gate was passed, but this host cannot run
        // anything, so the user is handed the exact line rather than a false claim.
        const failure = noExecSeamFailure(command);
        return {
            markdown: renderEmit(head + renderFailure("", failure), profile, candidate),
            data: { kind: "emitted", grade: candidate.grade, source: candidate.source, command, reason: failure.kind },
        };
    }
    const streamed = [];
    const progress = (line) => {
        streamed.push(line);
        options.progress?.(line);
    };
    const outcome = await executeInstall({
        exec,
        profile,
        id: candidate.id,
        source: candidate.source,
        command,
        profilePackageJson: ctx.paths.profilePackageJson,
        progress,
        ...(options.readManifest === undefined ? {} : { readManifest: options.readManifest }),
    });
    if (!outcome.ok) {
        return {
            markdown: renderFailure(head, outcome.failure),
            data: { kind: "failed", failure: outcome.failure.kind, grade: candidate.grade, command, exitCode: 1 },
        };
    }
    return {
        markdown: renderInstalled(head, profile, candidate, outcome.change, streamed),
        data: {
            kind: "installed",
            grade: candidate.grade,
            source: candidate.source,
            command,
            mounted: true,
            addedDependencies: outcome.change.addedDependencies,
        },
    };
}
/**
 * The unreviewed path: fetch the source into a scratch directory and scan it
 * locally before the user is asked to decide. A grade nobody produced is worth
 * less than findings produced right now, so this runs even when the answer will
 * be "blocked": the point is to put evidence in front of the decision.
 */
async function scanUnreviewed(source, ctx, options) {
    const exec = options.exec ?? execSeamOf(ctx);
    if (exec === null) {
        return {
            body: [
                "NO LOCAL SCAN",
                "",
                "This host exposes no command-execution seam, so the source could not be",
                "fetched and scanned. The decision below rests on no evidence at all.",
                "",
                "Review it yourself first: clone the source, then `/bridge-trust scan <dir>`.",
                "",
            ].join("\n"),
        };
    }
    const staged = await stageSource(source, exec, options.progress ?? (() => { }), ...(options.makeStageDir === undefined ? [] : [options.makeStageDir]));
    if (!staged.ok) {
        return { body: renderFailure("", staged.failure), failure: staged.failure };
    }
    try {
        const scan = options.scan ?? (async (dir) => (await scanDirectory(dir)).report);
        return { body: renderScanFindings(await scan(staged.staged.dir)) };
    }
    catch (error) {
        const failure = {
            kind: "scan-failed",
            summary: "The local scanner did not produce a verdict, so nothing was installed.",
            detail: error.message,
            nextSteps: [
                "Run `/bridge-trust scan <dir>` on a local checkout to see the scanner's own error.",
                "Run `/bridge-doctor` to confirm the scanner is built and reachable.",
            ],
        };
        return { body: renderFailure("", failure), failure };
    }
}
/**
 * `/bridge-install` runner.
 *
 * Side effects, all of them gated: catalog and card reads always; a staging
 * fetch plus a local scan on the unreviewed path; and `dsh plugin add` only
 * after both halves of consent are satisfied.
 */
export async function runInstall(ctx, args, options = {}) {
    const query = [args["_"] ?? "", args["rest"] ?? ""].join(" ").trim().split(/\s+/)[0] ?? "";
    const profile = (args["profile"] ?? "").trim() || ctx.profile;
    if (query === "") {
        return {
            markdown: [
                "### /bridge-install",
                "",
                USAGE,
                "",
                "Examples:",
                "- `/bridge-install modlens` grade, worst findings, provenance, then the consent gate",
                "- `/bridge-install modlens --yes` approve and install, then verify the mount",
                "- `/bridge-install modlens --report` show the trust summary and stop",
                "- `/bridge-install github:owner/repo` off-catalog source: local scan, then the risk gate",
                "",
            ].join("\n"),
        };
    }
    const located = resolveInstallCatalog();
    const manifestPath = options.manifestPath ?? located?.manifestPath;
    const indexPath = options.indexPath ?? located?.indexPath ?? "";
    let candidates = [];
    let degraded = "";
    if (manifestPath === undefined) {
        degraded = unavailableDetail("manifest.json");
    }
    else {
        try {
            candidates = loadCandidates(manifestPath, indexPath);
        }
        catch (error) {
            degraded = error.message;
        }
    }
    const resolution = resolve(query, candidates);
    const banner = degraded === "" ? "" : `Catalog unavailable (${degraded}); the trust layer is degraded and every name is unlisted.\n\n`;
    if (resolution.kind === "ambiguous") {
        return { markdown: banner + renderAmbiguous(query, resolution, ctx), data: { kind: "ambiguous", exitCode: 2 } };
    }
    if (resolution.kind === "not-found") {
        // Fail closed: with no catalog, a bare name has no source we can trust.
        return { markdown: banner + renderNotFound(query, resolution.nearMisses), data: { kind: "not-found", exitCode: 2 } };
    }
    // -- Unreviewed sources: scan first, then gate. -----------------------------
    if (resolution.kind === "unlisted" || (resolution.kind === "match" && resolution.candidate.grade === null)) {
        const subject = resolution.kind === "unlisted"
            ? { id: resolution.id, source: resolution.source, grade: null }
            : { id: resolution.candidate.id, source: resolution.candidate.source, grade: null };
        const why = resolution.kind === "unlisted"
            ? "no catalog entry cites this source"
            : "the entry is in the catalog but has no completed audit";
        if (args["report"] !== undefined && resolution.kind === "match") {
            return { markdown: banner + renderReport(resolution.candidate, ctx, profile), data: { kind: "report", grade: null } };
        }
        const scan = await scanUnreviewed(subject.source, ctx, options);
        const head = [banner + renderUnverifiedWarning(subject.id, subject.source, why), scan.body].join("\n");
        if (scan.failure !== undefined) {
            // A source we could not read is a source we will not install.
            return { markdown: head, data: { kind: "failed", failure: scan.failure.kind, grade: null, exitCode: 1 } };
        }
        const decision = consentFor(null, args);
        if (!decision.allowed) {
            return { markdown: renderBlocked(head, decision), data: { kind: "blocked", grade: null, exitCode: 1 } };
        }
        if (!mayExecute(null, args)) {
            return {
                markdown: head + renderConsentGate(profile, subject, carriedFlags(args)),
                data: { kind: "consent-required", grade: null, source: subject.source, command: installCommand(profile, subject.source) },
            };
        }
        return performInstall(head, profile, subject, ctx, options);
    }
    // -- Graded catalog entries. ------------------------------------------------
    const candidate = resolution.candidate;
    if (args["report"] !== undefined) {
        return { markdown: banner + renderReport(candidate, ctx, profile), data: { kind: "report", grade: candidate.grade } };
    }
    const cardPath = cardFilePath(indexPath, candidate.card);
    const readCard = options.readCard ?? ((path) => readFileSync(path, "utf8"));
    let evidence = "";
    if (cardPath !== "") {
        try {
            const markdown = readCard(cardPath);
            evidence = renderEvidence(worstCardFindings(markdown, candidate.card), cardProvenance(markdown, candidate.card));
        }
        catch {
            evidence = "";
        }
    }
    if (evidence === "") {
        evidence = renderEvidence([], { card: candidate.card || "docs/catalog/INDEX.md", pinned: "", audited: candidate.verifiedAt, revision: "" });
    }
    const head = [banner + renderTrustCard(ctx, candidate, profile), evidence].join("\n");
    const decision = consentFor(candidate.grade, args);
    if (!decision.allowed) {
        return {
            markdown: renderBlocked(head, decision),
            data: { kind: "blocked", grade: candidate.grade, rule: resolution.rule, exitCode: 1 },
        };
    }
    if (!mayExecute(candidate.grade, args)) {
        return {
            markdown: head + renderConsentGate(profile, candidate, carriedFlags(args)),
            data: {
                kind: "consent-required",
                grade: candidate.grade,
                rule: resolution.rule,
                source: candidate.source,
                command: installCommand(profile, candidate.source),
            },
        };
    }
    return performInstall(head, profile, candidate, ctx, options);
}
//# sourceMappingURL=install.js.map