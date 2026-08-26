/**
 * EXEC — OS shell invocation through command strings.
 *
 * dynamic-eval catches the spawn/exec call sites, but every audit this season turned
 * up the same manual finding the corpus missed: the *shape* of the invocation, not the
 * callee. Vision-router's weakest string handling was `cmd.exe /d /s /c start "" "<dir>"`;
 * its doctor spawned PowerShell; api-relay-audit's ops script passed passwords through
 * sshpass. An argv-array spawn of a fixed binary is a different risk class from
 * `sh -c <composed string>`, and grading should say so.
 */

import { runDetectors, type Finding, type Rule } from "./types.js";

function isBuildTimeFile(filePath: string): boolean {
  return (
    /(^|\/)\.github\//.test(filePath) ||
    /(^|\/)(docs|examples)\//.test(filePath) ||
    /\.(?:ya?ml|md)$/.test(filePath)
  );
}

export const shellInvocationRule: Rule = {
  id: "shell-invocation",
  family: "EXEC",
  severity: "high",
  version: "2026.08.3",
  description:
    "Detects shell-mediated execution shapes: PowerShell -enc/-Command, composed `sh -c` command strings, cmd.exe /c | /k, spawn options { shell: true }, and macOS osascript -e. Array-argv spawns of fixed binaries stay quiet.",

  match(content: string, filePath: string): Finding[] {
    if (isBuildTimeFile(filePath)) return [];

    return runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content,
      detectors: [
        {
          code: "020",
          pattern: /\bpowershell(?:\.exe)?\b[^;\n]{0,80}-(?:enc|encodedcommand)\b/i,
          message: "PowerShell invoked with -enc/-EncodedCommand: the payload is base64 and unreadable at the call site.",
          severity: "critical",
          confidence: 0.9,
          note: "Corpus H-PROC-01: an encoded Windows command has no ordinary plugin use.",
        },
        {
          code: "024",
          pattern: /\bpowershell(?:\.exe)?\b[^;\n]{0,60}-command\b/i,
          message: "PowerShell -Command runs an inline script; interpolation here is direct code injection.",
          confidence: 0.8,
        },
        {
          code: "021",
          // Two real shapes only: the command-string form (`sh -c "...": the executed
          // string opens a quote right after -c) and the argv form ("sh", ["-c"]).
          // Prose like "run it with sh -c manually" has neither, which is exactly the
          // quoted-help-text false positive the corpus warns about.
          pattern: /(?:ba|z|da)?sh\s+-c\s*["'`]|['"][^'"\n]{0,8}\b(?:ba|z|da)?sh['"]\s*,\s*\[?\s*['"]-c\b/,
          message: "A POSIX shell is invoked with -c over a command string; anything interpolated into it executes.",
          confidence: 0.8,
        },
        {
          code: "022",
          pattern: /\bshell\s*:\s*true\b/,
          message: "Spawn option { shell: true }: arguments are re-parsed by a shell and lose their quoting guarantees.",
          confidence: 0.9,
        },
        {
          code: "026",
          pattern: /\bcmd(?:\.exe)?\b[^;\n]{0,28}\/[ck]\b/i,
          message: "cmd.exe invoked with /c or /k: the following string is executed as a Windows batch command.",
          confidence: 0.8,
          note: "Vision-router VR-EXEC-4 shape: path interpolation into `cmd /c start`.",
        },
        {
          code: "023",
          pattern: /\bosascript\s+(?:-\w+\s+)*-e\b/,
          message: "osascript -e executes AppleScript; combined with administrator privileges this escalates privileges.",
          confidence: 0.85,
        },
      ],
    });
  },
};

export default shellInvocationRule;
