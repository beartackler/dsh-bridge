/**
 * CRED — credential access through CLI subprocesses.
 *
 * The file-path detectors cover fs reads, but dsh-market silently resolved the user's
 * GitHub identity via `gh auth token` (MKT-CRED-2) and no detector saw it; api-relay-audit's
 * deploy helper passed a NAS password as an sshpass argv argument; EverOS-style hooks
 * can dump the environment with `printenv` without ever touching process.env in JS.
 * Credential-shaped *subprocess* access is its own family member, not an afterthought.
 */
import { type Rule } from "./types.js";
export declare const credentialCliHarvestRule: Rule;
export default credentialCliHarvestRule;
//# sourceMappingURL=credential-cli-harvest.d.ts.map