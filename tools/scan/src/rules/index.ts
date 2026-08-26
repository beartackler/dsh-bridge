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
import { sha256, type Rule } from "./types.js";

export * from "./types.js";
export {
  credentialAccessRule,
  dynamicEvalRule,
  lifecycleHooksRule,
  networkEgressRule,
  obfuscationRule,
};

/** All rules, sorted by id for determinism. */
export const ALL_RULES: readonly Rule[] = Object.freeze(
  [
    credentialAccessRule,
    dynamicEvalRule,
    lifecycleHooksRule,
    networkEgressRule,
    obfuscationRule,
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
);

/**
 * Identity of the rule corpus that produced a verdict. The pipeline refuses to publish
 * a card without one, so that "recompute it yourself" is actually possible.
 */
export function rulesDigest(rules: readonly Rule[] = ALL_RULES): string {
  const canonical = rules
    .map((r) => `${r.id}\u0000${r.family}\u0000${r.severity}\u0000${r.version}`)
    .sort()
    .join("\n");
  return sha256(canonical);
}
