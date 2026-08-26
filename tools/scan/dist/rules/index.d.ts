/**
 * Rule registry.
 *
 * Order here is not significant to output (findings are sorted by path:line), but the
 * array is frozen and explicitly ordered so `rulesDigest()` is stable across runs and
 * across machines — the card records which corpus produced it.
 */
import { credentialAccessRule } from "./credential-access.js";
import { dynamicEvalRule } from "./dynamic-eval.js";
import { lifecycleHooksRule } from "./lifecycle-hooks.js";
import { networkEgressRule } from "./network-egress.js";
import { obfuscationRule } from "./obfuscation.js";
import { type Rule } from "./types.js";
export * from "./types.js";
export { credentialAccessRule, dynamicEvalRule, lifecycleHooksRule, networkEgressRule, obfuscationRule, };
/** All rules, sorted by id for determinism. */
export declare const ALL_RULES: readonly Rule[];
/**
 * Identity of the rule corpus that produced a verdict. The pipeline refuses to publish
 * a card without one, so that "recompute it yourself" is actually possible.
 */
export declare function rulesDigest(rules?: readonly Rule[]): string;
//# sourceMappingURL=index.d.ts.map