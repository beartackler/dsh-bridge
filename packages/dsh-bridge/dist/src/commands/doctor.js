/**
 * /bridge-doctor - environment health check (docs/specs/commands/doctor.md).
 *
 * Scope of this phase: the always-on, read-only half of the spec. Four checks:
 *   C1' node runtime >= v20            (process.version, no subprocess)
 *   C6' credential files exist + shape (lib/paths metadata probes only)
 *   C3' DSH profile dirs present       ($DSH_HOME/profiles or ~/.dsh/profiles)
 *   C5' profile config discoverable    (active profile's cordis.patch.yml)
 *
 * Invariants carried over from the spec and CHARTER.md:
 *  - Read-only: nothing is written, mutated, or executed.
 *  - Metadata only: probes return existence/shape, never file contents, so no
 *    secret value can reach the rendered markdown or the data payload.
 *  - Every printed claim comes from a check that actually ran (trust over
 *    speed); unknown states degrade to yellow with the reason attached.
 *  - Network checks (C8/C9) are opt-in flags specified for a later phase and
 *    are intentionally absent here (ponytail discipline).
 *
 * Rendering uses the shared lib/output helpers; the status badges are plain
 * fixed-width ASCII text, mirroring badge() (color is never load-bearing).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bulletList, heading, table } from "../lib/output.js";
import { claudeCredentialsPath, codexAuthPath, geminiOauthCredsPath, opencodeAuthPath, probeJsonSource, } from "../lib/paths.js";
/** Node floor declared by this package's engines field and the harness docs. */
export const MIN_NODE_MAJOR = 20;
/** Run every doctor check. Order is the render order; ids are stable. */
export function collectDoctorChecks(inputs) {
    return [
        checkNodeVersion(inputs.nodeVersion),
        checkCredentialFiles(inputs.home),
        checkProfileDirs(inputs.dshHome, inputs.profile),
        checkProfileConfig(inputs.profilePatch),
    ];
}
// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------
function checkNodeVersion(nodeVersion) {
    const match = /^v(\d+)\./.exec(nodeVersion);
    if (match === null) {
        return {
            id: "node",
            label: "Node.js runtime",
            status: "yellow",
            detail: `could not parse runtime version "${nodeVersion}"`,
            hint: `Verify the install with: node --version (dsh requires >= v${MIN_NODE_MAJOR})`,
        };
    }
    const major = Number(match[1]);
    if (major >= MIN_NODE_MAJOR) {
        return {
            id: "node",
            label: "Node.js runtime",
            status: "green",
            detail: `${nodeVersion} (required >= v${MIN_NODE_MAJOR})`,
        };
    }
    return {
        id: "node",
        label: "Node.js runtime",
        status: "red",
        detail: `${nodeVersion} is below required v${MIN_NODE_MAJOR}`,
        hint: `Upgrade Node: brew upgrade node, or nvm install ${MIN_NODE_MAJOR}`,
    };
}
/**
 * Probe the known connector credential files for existence + shape. Uses
 * lib/paths probes exclusively: results carry names, sizes, and shape
 * verdicts, never contents. Absent connectors are normal on a fresh machine
 * (env-var setups are valid), so "none found" is yellow advice, not red.
 */
function checkCredentialFiles(home) {
    const sources = [
        ["claude", claudeCredentialsPath(home)],
        ["codex", codexAuthPath(home)],
        ["gemini", geminiOauthCredsPath(home)],
        ["opencode", opencodeAuthPath(home)],
    ];
    const probes = sources.map(([sourceName, path]) => ({
        name: sourceName,
        probe: probeJsonSource(path, []),
    }));
    const ok = probes.filter((entry) => entry.probe.shape === "valid-shape");
    const broken = probes.filter((entry) => entry.probe.exists && entry.probe.shape !== "valid-shape");
    if (ok.length > 0) {
        return {
            id: "credentials",
            label: "Credential files",
            status: "green",
            detail: `well-shaped: ${ok.map((entry) => entry.name).join(", ")}`,
        };
    }
    if (broken.length > 0) {
        return {
            id: "credentials",
            label: "Credential files",
            status: "yellow",
            detail: `present but malformed: ${broken.map((entry) => `${entry.name} (${entry.probe.shape})`).join(", ")}`,
            hint: "Re-run the connector import: /bridge-connect <provider>",
        };
    }
    return {
        id: "credentials",
        label: "Credential files",
        status: "yellow",
        detail: "no credential files found in the usual locations",
        hint: "Set a provider API key env var, or run /bridge-connect to import OAuth tokens",
    };
}
function checkProfileDirs(dshHome, profile) {
    const profilesDir = join(dshHome, "profiles");
    let names = [];
    try {
        names = readdirSync(profilesDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }
    catch {
        names = [];
    }
    if (names.length === 0) {
        return {
            id: "profiles",
            label: "DSH profiles",
            status: "red",
            detail: `no profile directories under ${profilesDir}`,
            hint: "Create one: dsh plugin --profile <name> add github:<owner>/<repo>",
        };
    }
    if (names.includes(profile)) {
        return {
            id: "profiles",
            label: "DSH profiles",
            status: "green",
            detail: `${names.length} found: ${names.join(", ")} (active: ${profile})`,
        };
    }
    return {
        id: "profiles",
        label: "DSH profiles",
        status: "yellow",
        detail: `active profile '${profile}' has no directory; found: ${names.join(", ")}`,
        hint: `Recreate it: dsh plugin --profile ${profile} add github:<owner>/<repo>`,
    };
}
function checkProfileConfig(profilePatch) {
    if (existsSync(profilePatch)) {
        return {
            id: "routes",
            label: "Profile config",
            status: "green",
            detail: `found ${profilePatch}`,
        };
    }
    return {
        id: "routes",
        label: "Profile config",
        status: "yellow",
        detail: `not found: ${profilePatch}; harness defaults apply`,
        hint: "Generate it by installing a plugin: dsh plugin --profile <name> add github:<owner>/<repo>",
    };
}
export function summarizeDoctorChecks(checks) {
    const green = checks.filter((check) => check.status === "green").length;
    const yellow = checks.filter((check) => check.status === "yellow").length;
    const red = checks.filter((check) => check.status === "red").length;
    const overall = red > 0 ? "blocked" : yellow > 0 ? "degraded" : "healthy";
    return { green, yellow, red, overall };
}
/** Fixed-width ASCII status badge; same convention as output.badge(). */
function statusBadge(status) {
    switch (status) {
        case "green":
            return "[ green  ]";
        case "yellow":
            return "[ YELLOW ]";
        case "red":
            return "[ RED    ]";
    }
}
export function renderDoctorReport(checks, profile) {
    const summary = summarizeDoctorChecks(checks);
    const rows = checks.map((check) => [statusBadge(check.status), check.label, check.detail]);
    const parts = [
        heading("/bridge-doctor"),
        `Active profile: ${profile}`,
        "",
        table(["STATUS", "CHECK", "DETAIL"], rows),
    ];
    const hints = checks
        .filter((check) => typeof check.hint === "string")
        .map((check) => `${check.label}: ${check.hint}`);
    if (hints.length > 0) {
        parts.push("Fix hints:");
        parts.push(bulletList(hints));
    }
    parts.push(`Summary: ${summary.green} green, ${summary.yellow} yellow, ${summary.red} red.`);
    if (summary.overall === "blocked") {
        parts.push("Overall: BLOCKED - fix the red items above, then re-run /bridge-doctor.");
    }
    else if (summary.overall === "degraded") {
        parts.push("Overall: DEGRADED - usable now, review the yellow items above.");
    }
    else {
        parts.push("Overall: HEALTHY - all executed checks green.");
    }
    return parts.join("\n");
}
// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------
/** /bridge-doctor entry point; pure over (ctx, args), no global state. */
export async function runDoctor(ctx, _args) {
    const checks = collectDoctorChecks({
        profile: ctx.profile,
        home: ctx.paths.home,
        dshHome: ctx.paths.dshHome,
        profilePatch: ctx.paths.profilePatch,
        nodeVersion: process.version,
    });
    return {
        markdown: renderDoctorReport(checks, ctx.profile),
        // Transcript-visible by contract (types.ts): metadata and paths only.
        data: { checks: [...checks], ...summarizeDoctorChecks(checks) },
    };
}
//# sourceMappingURL=doctor.js.map