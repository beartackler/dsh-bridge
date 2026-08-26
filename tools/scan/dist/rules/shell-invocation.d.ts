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
import { type Rule } from "./types.js";
export declare const shellInvocationRule: Rule;
export default shellInvocationRule;
//# sourceMappingURL=shell-invocation.d.ts.map