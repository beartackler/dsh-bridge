/**
 * CRED — credential and secret access.
 *
 * Hard gate from docs/design/trust-report-card.md §2: a credential read plus any network
 * egress in the same module is an automatic F. This rule's job is to produce the CRED
 * half of that pair with enough precision that the gate is not tripped by noise.
 *
 * The connectors flow in dsh-bridge legitimately *detects* these paths, so this rule
 * cannot simply treat every mention as malicious. It distinguishes existence checks from
 * reads, and reads from enumeration.
 */

import { runDetectors, type Finding, type Rule } from "./types.js";

/**
 * Public `process` members with ordinary uses. Anything else reached by a string key is
 * deliberate indirection, since the literal member form is always shorter to write.
 */
const DOCUMENTED_PROCESS_MEMBERS = new Set([
  "env",
  "argv",
  "argv0",
  "arch",
  "platform",
  "version",
  "versions",
  "cwd",
  "exit",
  "exitCode",
  "pid",
  "ppid",
  "stdout",
  "stderr",
  "stdin",
  "on",
  "once",
  "off",
  "emit",
  "nextTick",
  "hrtime",
  "uptime",
  "execPath",
  "memoryUsage",
]);

export const credentialAccessRule: Rule = {
  id: "credential-access",
  family: "CRED",
  severity: "high",
  version: "2026.08.2",
  description:
    "Detects access to credential stores: ~/.claude, ~/.codex, opencode auth.json, ~/.ssh, ~/.aws, .env files, OS keychains, computed process env access via string keys, and bulk process.env enumeration.",

  match(content: string, filePath: string): Finding[] {
    // `#` comments in YAML/shell are documentation, and maskComments only understands
    // JS comment syntax. A workflow comment mentioning `.npmrc` is not credential access.
    const source = /\.(?:ya?ml|sh)$/.test(filePath)
      ? content.replace(/^([^\n'"]*?)#[^\n]*/gm, (whole, keep: string) => keep + " ".repeat(whole.length - keep.length))
      : content;

    return runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content: source,
      detectors: [
        {
          code: "001",
          pattern: /['"`][^'"`]*\.(?:claude|codex)(?:\/[^'"`]*)?['"`]|\.(?:claude|codex)\/(?:\.credentials\.json|auth\.json|config\.json)/,
          message: "References a Claude Code / Codex configuration directory, which holds provider credentials.",
          confidence: 0.8,
          note: "dsh-bridge's own connectors flow reads these by design; for third-party plugins it is unexplained.",
        },
        {
          code: "002",
          pattern: /(?:opencode[^'"`\n]{0,40})?auth\.json/,
          message: "References an OpenCode auth.json credential file.",
          confidence: 0.8,
        },
        {
          code: "003",
          pattern: /['"`][^'"`]*\.ssh(?:\/[^'"`]*)?['"`]|\bid_(?:rsa|ed25519|ecdsa)\b/,
          message: "References the SSH directory or a private key file.",
          severity: "critical",
          confidence: 0.9,
        },
        {
          code: "004",
          pattern: /['"`][^'"`]*\.aws(?:\/(?:credentials|config))?['"`]|\bAWS_SECRET_ACCESS_KEY\b/,
          message: "References AWS credentials.",
          severity: "critical",
          confidence: 0.9,
        },
        {
          code: "005",
          pattern: /\b(?:readFileSync|readFile|createReadStream|open)\s*\(\s*[^)]{0,120}\.env\b/,
          message: "Reads a .env file, which by convention contains secrets in plaintext.",
          confidence: 0.85,
        },
        {
          code: "006",
          // Bulk enumeration is qualitatively different from reading one named var:
          // it is how you harvest every secret at once without naming any of them.
          // `PROCESS_ENV` accepts both `process.env` and the computed form
          // `process["env"]`; a bracket escape must not defeat the harvest detector.
          pattern:
            /Object\s*\.\s*(?:keys|entries|values|assign)\s*\(\s*process\s*(?:\.\s*env|\[\s*['"`]env['"`]\s*\])\s*\)|\{\s*\.\.\.\s*process\s*(?:\.\s*env|\[\s*['"`]env['"`]\s*\])\s*\}|JSON\s*\.\s*stringify\s*\(\s*process\s*(?:\.\s*env|\[\s*['"`]env['"`]\s*\])/,
          message: "Enumerates the entire process environment rather than reading a specific variable.",
          severity: "critical",
          confidence: 0.9,
          note: "Reading one named env var is normal; harvesting all of them is not.",
        },
        {
          code: "007",
          pattern:
            /\bprocess\s*(?:\.\s*env\s*(?:\.\s*|\[\s*['"`])|\[\s*['"`]env['"`]\s*\]\s*(?:\.\s*|\[\s*['"`]))\w*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|APIKEY|API_KEY)\w*/i,
          message: "Reads a secret-shaped environment variable.",
          severity: "medium",
          confidence: 0.7,
          note: "Expected for a plugin that talks to its own documented API with the user's own key.",
        },
        {
          code: "008",
          pattern: /\bsecurity\s+find-(?:generic|internet)-password\b|\blibsecret\b|\bkeytar\b|\bwincred\b|\bCredentialManager\b/,
          message: "Touches an OS keychain / credential manager.",
          severity: "critical",
          confidence: 0.85,
        },
        {
          code: "009",
          pattern: /['"`][^'"`]*\.(?:netrc|npmrc|pypirc|docker\/config\.json|gitconfig|git-credentials)['"`]/,
          message: "References a tool credential file (.netrc/.npmrc/docker config/git credentials).",
          confidence: 0.8,
        },
        {
          code: "010",
          pattern: /['"`][^'"`]*\.dsh\/(?:profiles|credentials|auth)[^'"`]*['"`]/,
          message: "References DSH's own profile/credential storage.",
          confidence: 0.8,
          note: "Config self-mutation under ~/.dsh/profiles is also an FS finding.",
        },
        {
          code: "011",
          // Documented members are addressed by name; a string-keyed access on `process`
          // that is not one of them is an escape hatch around every member-name detector.
          pattern: /\bprocess\s*\[\s*['"`]([A-Za-z_$][\w$]*)['"`]\s*\]/,
          message: "String-keyed access on `process` bypasses member-name analysis.",
          severity: "medium",
          confidence: 0.7,
          note: "Computed access is how `process.env` / `process.binding` detectors are evaded; confirm why a literal member name was not used.",
          refine: (match) => match[1] !== undefined && !DOCUMENTED_PROCESS_MEMBERS.has(match[1]),
        },
        {
          code: "012",
          // Spread/enumeration of the environment reached through an alias, e.g.
          // `const e = process.env; send({ ...e })` — the harvest happens one hop later.
          pattern: /\b(?:const|let|var)\s+[\w$]+\s*=\s*process\s*(?:\.\s*env|\[\s*['"`]env['"`]\s*\])\s*[;,\n]/,
          message: "The whole environment object is aliased to a variable, which enables enumeration away from the `process.env` token.",
          severity: "high",
          confidence: 0.75,
          note: "Reading one named variable off the alias is benign; spreading or iterating it is a harvest.",
        },
      ],
    });
  },
};

export default credentialAccessRule;
