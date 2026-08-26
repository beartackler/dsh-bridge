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
import { type Rule } from "./types.js";
export declare const credentialAccessRule: Rule;
export default credentialAccessRule;
//# sourceMappingURL=credential-access.d.ts.map