/**
 * Rule registry.
 *
 * Order here is not significant to output (findings are sorted by path:line), but the
 * array is frozen and explicitly ordered so `rulesDigest()` is stable across runs and
 * across machines — the card records which corpus produced it.
 */
import { credentialAccessRule } from "./credential-access.js";
import { credentialCliHarvestRule } from "./credential-cli-harvest.js";
import { dynamicEvalRule } from "./dynamic-eval.js";
import { lifecycleHooksRule } from "./lifecycle-hooks.js";
import { manifestSupplyRiskRule } from "./manifest-supply-risk.js";
import { networkEgressRule } from "./network-egress.js";
import { obfuscationRule } from "./obfuscation.js";
import { shellInvocationRule } from "./shell-invocation.js";
import { telemetryBeaconsRule } from "./telemetry-beacons.js";
import { sha256 } from "./types.js";
export * from "./types.js";
export { credentialAccessRule, credentialCliHarvestRule, dynamicEvalRule, lifecycleHooksRule, manifestSupplyRiskRule, networkEgressRule, obfuscationRule, shellInvocationRule, telemetryBeaconsRule, };
/** All rules, sorted by id for determinism. */
export const ALL_RULES = Object.freeze([
    credentialAccessRule,
    credentialCliHarvestRule,
    dynamicEvalRule,
    lifecycleHooksRule,
    manifestSupplyRiskRule,
    networkEgressRule,
    obfuscationRule,
    shellInvocationRule,
    telemetryBeaconsRule,
].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
/**
 * Identity of the rule corpus that produced a verdict. The pipeline refuses to publish
 * a card without one, so that "recompute it yourself" is actually possible.
 */
export function rulesDigest(rules = ALL_RULES) {
    const canonical = rules
        .map((r) => `${r.id}\u0000${r.family}\u0000${r.severity}\u0000${r.version}`)
        .sort()
        .join("\n");
    return sha256(canonical);
}
//# sourceMappingURL=index.js.map