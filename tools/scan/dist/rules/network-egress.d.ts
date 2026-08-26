/**
 * NET — network egress.
 *
 * Charter: "no network calls except documented ones." The card must be able to say
 * exactly which hosts a plugin can reach, with file:line. Constructed URLs matter as
 * much as literal ones: `fetch(atob(_0x3f)+"/collect")` is the canonical exfil shape,
 * and it is invisible to a naive literal-URL scan.
 */
import { type Rule } from "./types.js";
export declare const networkEgressRule: Rule;
export default networkEgressRule;
//# sourceMappingURL=network-egress.d.ts.map