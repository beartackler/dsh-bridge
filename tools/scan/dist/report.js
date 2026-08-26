/**
 * Report rendering: scan result -> canonical JSON + a markdown trust-card draft.
 *
 * Grading is a *pure function* of the finding set (pipeline §S6: "No model touches this
 * step"). Two properties are non-negotiable:
 *
 *  1. Caps are monotone. `final = min(band_from_score, ...caps)`. Nothing can raise a grade.
 *  2. Output is byte-stable. Same findings => same bytes, so cards diff cleanly in git and
 *     any third party can recompute the verdict.
 *
 * This module implements the *static-scan slice* of the full pipeline. It emits a draft
 * card explicitly marked as such, because a real grade also requires the behavioral probe
 * and cross-model review stages that are not implemented here. Overstating what we checked
 * would violate the charter's "trust over speed" principle.
 */
import { SEVERITIES, SEVERITY_RANK, } from "./rules/index.js";
export const GRADES = ["A", "B", "C", "D", "F"];
const GRADE_ORDER = ["A", "B", "C", "D", "F"];
/** From docs/design/trust-report-card.md §2. Letter + icon + word, never color alone. */
export const GRADE_META = Object.freeze({
    A: { icon: "\u25cf", label: "Verified", verdict: "We read the code. Nothing reaches the network or your credentials." },
    B: { icon: "\u25d7", label: "Low risk", verdict: "Does what it says. A few normal permissions worth a glance." },
    C: { icon: "\u25c6", label: "Review needed", verdict: "Some behavior we can't fully explain. Read the findings first." },
    D: { icon: "\u25b2", label: "Risky", verdict: "This plugin can reach the network and touch sensitive files." },
    F: { icon: "\u25a0", label: "Do not install", verdict: "We found behavior consistent with malicious code." },
    "?": { icon: "\u25cb", label: "Unreviewed", verdict: "Nobody has audited this yet." },
    "N/A": { icon: "\u25cb", label: "Ungradable", verdict: "This source cannot be pinned, so it cannot be graded." },
});
/* ------------------------------------------------------------------------- */
/* Grading                                                                    */
/* ------------------------------------------------------------------------- */
/** Deduction per finding. Superlinear by severity: one critical must outweigh many lows. */
const WEIGHTS = Object.freeze({
    info: 0,
    low: 1,
    medium: 4,
    high: 12,
    critical: 34,
});
export function countBySeverity(findings) {
    const counts = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    for (const f of findings)
        counts[f.severity] += 1;
    return Object.freeze(counts);
}
function bandFromScore(score) {
    if (score >= 90)
        return "A";
    if (score >= 75)
        return "B";
    if (score >= 55)
        return "C";
    if (score >= 35)
        return "D";
    return "F";
}
/** Returns the worse (later) of two grades. Used to apply monotone caps. */
function worse(a, b) {
    return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}
/**
 * Group findings by the module they occur in, so "CRED + NET in the same module" can be
 * evaluated. Directory-level grouping is a deliberately conservative stand-in for the
 * call-graph reachability the full pipeline computes; when reachability is unknown the
 * spec says treat it as reachable.
 */
function familiesByFile(findings) {
    const byFile = new Map();
    for (const f of findings) {
        let set = byFile.get(f.path);
        if (!set) {
            set = new Set();
            byFile.set(f.path, set);
        }
        set.add(f.family);
    }
    return byFile;
}
/**
 * Package root of a path: the directory holding the nearest package.json in a normal
 * layout. Approximated as the top-level directory, which is the unit an author would
 * split files across to dilute a per-file gate.
 */
function packageOf(path) {
    const slash = path.indexOf("/");
    return slash < 0 ? "." : path.slice(0, slash);
}
/** Distinct files carrying the same family before the density cap applies. */
const DENSITY_FILE_THRESHOLD = 3;
export function grade(findings) {
    const counts = countBySeverity(findings);
    let deductions = 0;
    for (const severity of SEVERITIES)
        deductions += counts[severity] * WEIGHTS[severity];
    const score = Math.max(0, Math.min(100, 100 - deductions));
    const caps = [];
    const gates = [];
    const has = (predicate) => findings.some(predicate);
    // --- Hard gates (report-card spec §2). These force a grade; they cannot be out-scored.
    const byFile = familiesByFile(findings);
    const credNetFiles = [...byFile.entries()]
        .filter(([, families]) => families.has("CRED") && families.has("NET"))
        .map(([file]) => file)
        .sort();
    if (credNetFiles.length > 0) {
        caps.push({
            grade: "F",
            reason: `Credential access and network egress co-occur in the same module (${credNetFiles.join(", ")}); reachability unproven, therefore treated as reachable.`,
        });
        gates.push("cred-plus-net");
    }
    // Same-package split: reads in one module, sends from another. The per-file gate keys
    // on co-occurrence, so splitting across modules turned a fail-closed rule into a
    // fail-open one. Reachability across an intra-package boundary is unknown, and the
    // spec says unknown reachability is treated as reachable — so the gate follows the
    // package, not the file, once any concealment signal is also present.
    const packagesWith = (family) => new Set(findings.filter((f) => f.family === family).map((f) => packageOf(f.path)));
    if (credNetFiles.length === 0) {
        const credPkgs = packagesWith("CRED");
        const netPkgs = packagesWith("NET");
        const shared = [...credPkgs].filter((pkg) => netPkgs.has(pkg)).sort();
        const concealed = has((f) => f.family === "OBFU");
        if (shared.length > 0 && concealed) {
            caps.push({
                grade: "F",
                reason: `Credential access and network egress occur in the same package (${shared.join(", ")}) alongside a concealment signal; splitting them across modules does not make the flow unreachable.`,
            });
            gates.push("cred-plus-net-split");
        }
        else if (shared.length > 0) {
            caps.push({
                grade: "D",
                reason: `Credential access and network egress occur in the same package (${shared.join(", ")}) but in different modules; the flow between them is unproven in either direction.`,
            });
            gates.push("cred-plus-net-package");
        }
    }
    // Density: deductions are per finding, so fragmenting risky behavior across many small
    // files diluted every per-severity count. One family spread over several files is a
    // structural signal in itself, not a set of unrelated small hits.
    const filesPerFamily = new Map();
    for (const f of findings) {
        let files = filesPerFamily.get(f.family);
        if (!files) {
            files = new Set();
            filesPerFamily.set(f.family, files);
        }
        files.add(f.path);
    }
    const spreadFamilies = [...filesPerFamily.entries()]
        .filter(([family, files]) => files.size >= DENSITY_FILE_THRESHOLD && family !== "SUPPLY")
        .map(([family]) => family)
        .sort();
    if (spreadFamilies.length > 0) {
        caps.push({
            grade: "C",
            reason: `The same behavior family appears in ${DENSITY_FILE_THRESHOLD} or more separate files (${spreadFamilies.join(", ")}); spreading findings thin does not reduce the capability.`,
        });
        gates.push("finding-density");
    }
    if (has((f) => f.id === "OBFU-002")) {
        caps.push({ grade: "F", reason: "Encoded payload is decoded and executed at runtime." });
        gates.push("obfuscated-payload-executed");
    }
    if (has((f) => f.id === "NET-009")) {
        caps.push({ grade: "F", reason: "Network endpoint is decoded at runtime rather than declared." });
        gates.push("concealed-egress");
    }
    // Unanalyzed content: the scanner cannot vouch for what it did not read.
    if (has((f) => f.id === "SUPPLY-001")) {
        caps.push({ grade: "C", reason: "At least one file exceeded the scan limit and was not analyzed." });
        gates.push("unanalyzed-content");
    }
    if (has((f) => f.id === "HOOK-001")) {
        caps.push({ grade: "D", reason: "An npm install hook spawns a shell before the user consents." });
        gates.push("install-hook-shell");
    }
    if (has((f) => f.family === "EXEC")) {
        caps.push({ grade: "C", reason: "Shipped code performs dynamic code execution." });
        gates.push("dynamic-exec-present");
    }
    // --- Ordinary severity caps.
    if (counts.critical > 0)
        caps.push({ grade: "D", reason: "At least one critical finding." });
    else if (counts.high > 0)
        caps.push({ grade: "C", reason: "At least one high-severity finding." });
    let verdict = bandFromScore(score);
    for (const cap of caps)
        verdict = worse(verdict, cap.grade);
    const familiesPresent = [...new Set(findings.map((f) => f.family))].sort();
    return {
        grade: verdict,
        score,
        counts,
        caps: Object.freeze(caps),
        gates: Object.freeze([...gates].sort()),
        familiesPresent: Object.freeze(familiesPresent),
    };
}
/* ------------------------------------------------------------------------- */
/* JSON output                                                                */
/* ------------------------------------------------------------------------- */
/**
 * Deterministic JSON with lexicographically sorted keys (RFC 8785 spirit). Plain
 * JSON.stringify preserves insertion order, which would make the digest depend on
 * construction order rather than content.
 */
export function canonicalJson(value) {
    return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}
function sortKeysDeep(value) {
    if (Array.isArray(value))
        return value.map(sortKeysDeep);
    if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = sortKeysDeep(value[key]);
        }
        return out;
    }
    return value;
}
export function toJsonReport(result, grading) {
    return canonicalJson({
        schema: "dsh-bridge.scan/v1",
        scannerVersion: result.scannerVersion,
        rulesDigest: result.rulesDigest,
        ruleIds: result.ruleIds,
        target: result.target,
        stats: result.stats,
        grading: {
            grade: grading.grade,
            score: grading.score,
            counts: grading.counts,
            caps: grading.caps,
            gates: grading.gates,
            familiesPresent: grading.familiesPresent,
        },
        findings: result.findings,
    });
}
/* ------------------------------------------------------------------------- */
/* Markdown output                                                            */
/* ------------------------------------------------------------------------- */
const FAMILY_LABEL = Object.freeze({
    EXEC: "Dynamic code execution",
    NET: "Network egress",
    CRED: "Credential access",
    FS: "Filesystem writes",
    HOOK: "Lifecycle hooks",
    OBFU: "Obfuscation",
    SUPPLY: "Supply chain",
    PRIV: "Privacy / telemetry",
});
function escapeCell(text) {
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
/**
 * Markdown card draft. Per the design spec the markdown render has **no color**, so the
 * signal is carried by letter + icon + word label, and evidence is collapsed behind
 * <details> to preserve the 5-second test.
 */
export function toMarkdownReport(result, grading) {
    const meta = GRADE_META[grading.grade];
    const lines = [];
    lines.push(`# Trust report card (draft) — \`${result.target}\``);
    lines.push("");
    lines.push(`## ${meta.icon} Grade ${grading.grade} — ${meta.label}`);
    lines.push("");
    lines.push(`> ${meta.verdict}`);
    lines.push("");
    lines.push("**This is a static-scan draft, not a published verdict.** It reflects stage S3 only. " +
        "A published card additionally requires the sandboxed behavioral probe and two cross-model " +
        "adversarial reviews. A grade is evidence-backed opinion with reproducible inputs, never a guarantee.");
    lines.push("");
    lines.push("## Provenance");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Scanner | \`${result.scannerVersion}\` |`);
    lines.push(`| Rule corpus digest | \`${result.rulesDigest}\` |`);
    lines.push(`| Rules applied | ${result.ruleIds.map((id) => `\`${id}\``).join(", ")} |`);
    lines.push(`| Files scanned | ${result.stats.filesScanned} (${result.stats.bytesScanned} bytes) |`);
    lines.push(`| Files skipped | ${result.stats.filesSkipped} |`);
    lines.push(`| Static score | ${grading.score}/100 |`);
    lines.push("");
    lines.push("## Findings");
    lines.push("");
    lines.push("| Severity | Count |");
    lines.push("| --- | --- |");
    for (const severity of [...SEVERITIES].sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])) {
        lines.push(`| ${severity} | ${grading.counts[severity]} |`);
    }
    lines.push("");
    if (grading.caps.length > 0) {
        lines.push("### Grade caps applied");
        lines.push("");
        lines.push("Caps only lower a grade; nothing in this pipeline can raise one.");
        lines.push("");
        for (const cap of grading.caps) {
            lines.push(`- **Capped at ${cap.grade}** — ${escapeCell(cap.reason)}`);
        }
        lines.push("");
    }
    if (result.findings.length === 0) {
        lines.push("No findings from the static rule corpus.");
        lines.push("");
        lines.push("_Absence of findings is not proof of safety: it means these rules matched nothing. " +
            "See the methodology note above for what was not checked._");
        lines.push("");
    }
    else {
        // Group by family; families sorted by their worst severity, then by name.
        const byFamily = new Map();
        for (const f of result.findings) {
            const list = byFamily.get(f.family);
            if (list)
                list.push(f);
            else
                byFamily.set(f.family, [f]);
        }
        const families = [...byFamily.keys()].sort((a, b) => {
            const worst = (fam) => Math.max(...(byFamily.get(fam) ?? []).map((f) => SEVERITY_RANK[f.severity]));
            const delta = worst(b) - worst(a);
            return delta !== 0 ? delta : a < b ? -1 : 1;
        });
        for (const family of families) {
            const items = byFamily.get(family) ?? [];
            lines.push(`### ${family} — ${FAMILY_LABEL[family]} (${items.length})`);
            lines.push("");
            lines.push("<details>");
            lines.push(`<summary>Show ${items.length} finding${items.length === 1 ? "" : "s"} with evidence</summary>`);
            lines.push("");
            lines.push("| Severity | Location | Finding | Evidence | Confidence |");
            lines.push("| --- | --- | --- | --- | --- |");
            for (const f of items) {
                lines.push(`| ${f.severity} | \`${escapeCell(f.path)}:${f.line}:${f.col}\` | ${escapeCell(f.message)} | \`${escapeCell(f.excerpt)}\` | ${f.confidence.toFixed(2)} |`);
            }
            lines.push("");
            lines.push("</details>");
            lines.push("");
        }
        lines.push("### Evidence hashes");
        lines.push("");
        lines.push("Each hash is `sha256` of the exact matched text, so any reader can verify the citation.");
        lines.push("");
        lines.push("<details>");
        lines.push("<summary>Show hashes</summary>");
        lines.push("");
        lines.push("| Location | Finding ID | excerpt_sha256 |");
        lines.push("| --- | --- | --- |");
        for (const f of result.findings) {
            lines.push(`| \`${escapeCell(f.path)}:${f.line}:${f.col}\` | ${f.id} | \`${f.excerptSha256}\` |`);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
    }
    lines.push("## What this scan did not check");
    lines.push("");
    lines.push("- Runtime behavior (timers, delayed beacons, config-triggered paths) — requires stage S4.");
    lines.push("- Dependency vulnerabilities and SBOM attribution — requires stage S2.");
    lines.push("- Adversarial model review and false-positive falsification — requires stage S5.");
    lines.push("- Whether findings are actually reachable from an entry point; unknown reachability is treated as reachable.");
    lines.push("");
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=report.js.map