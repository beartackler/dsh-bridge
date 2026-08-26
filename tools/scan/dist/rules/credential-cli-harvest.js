/**
 * CRED — credential access through CLI subprocesses.
 *
 * The file-path detectors cover fs reads, but dsh-market silently resolved the user's
 * GitHub identity via `gh auth token` (MKT-CRED-2) and no detector saw it; api-relay-audit's
 * deploy helper passed a NAS password as an sshpass argv argument; EverOS-style hooks
 * can dump the environment with `printenv` without ever touching process.env in JS.
 * Credential-shaped *subprocess* access is its own family member, not an afterthought.
 */
import { runDetectors } from "./types.js";
export const credentialCliHarvestRule = {
    id: "credential-cli-harvest",
    family: "CRED",
    severity: "high",
    version: "2026.08.3",
    description: "Detects credential access performed through subprocesses and shell commands: `gh auth token` identity adoption, printenv/env dumps, sshpass inline passwords, and cat over .env-style secret files.",
    match(content, filePath) {
        // `#` comments in YAML/shell are documentation; maskComments only knows JS syntax.
        const source = /\.(?:ya?ml|sh)$/.test(filePath)
            ? content.replace(/^([^\n'"]*?)#[^\n]*/gm, (whole, keep) => keep + " ".repeat(whole.length - keep.length))
            : content;
        return runDetectors({
            rule: { id: this.id, family: this.family, severity: this.severity },
            filePath,
            content: source,
            detectors: [
                {
                    code: "020",
                    // Both spellings dsh-market-style code uses: the shell form and the
                    // argv-array form through execFile/spawn.
                    pattern: /\bgh\s+auth\s+token\b|['"]gh['"]\s*,\s*\[\s*['"]auth['"]\s*,\s*['"]token['"]/,
                    message: "Invokes `gh auth token`: adopts the user's GitHub CLI identity without naming or asking for a credential.",
                    severity: "high",
                    confidence: 0.9,
                    note: "dsh-market MKT-CRED-2: silent local-token harvest. Benign only with explicit user consent at runtime.",
                },
                {
                    code: "021",
                    pattern: /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*['"](?:printenv|env|set)['"]/,
                    message: "Spawns printenv/env/set: dumps the whole environment through a subprocess, bypassing process.env detectors.",
                    severity: "high",
                    confidence: 0.8,
                    note: "Same harvest class as Object.keys(process.env); the CLI form evades JS-level analysis.",
                },
                {
                    code: "022",
                    pattern: /\bsshpass\b[^;\n]{0,40}-p/,
                    message: "sshpass -p passes a password as a command-line argument, exposing it in process listings.",
                    severity: "high",
                    confidence: 0.85,
                },
                {
                    code: "023",
                    pattern: /\bcat\s+[^;\n]{0,60}(?:^|[\s~/])\.env\b/,
                    message: "cat over a .env file: plaintext secrets read through the shell instead of fs, dodging file-read detectors.",
                    severity: "medium",
                    confidence: 0.7,
                    note: "Confirm the target is not the plugin's own documented config.",
                },
            ],
        });
    },
};
export default credentialCliHarvestRule;
//# sourceMappingURL=credential-cli-harvest.js.map