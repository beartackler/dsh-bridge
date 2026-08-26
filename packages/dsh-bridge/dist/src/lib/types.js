/**
 * Shared contracts for dsh-bridge command modules.
 *
 * Design rules (CHARTER.md, ponytail discipline):
 *  - No global state. Every command receives its dependencies through the
 *    injected `BridgeContext`; modules are pure over `(ctx, args)`.
 *  - Commands render markdown strings only; structured data rides `data`.
 *
 * DSH seam notes (docs/research/dsh-capability-seams.md §3.1):
 *  - The native registry is `ctx.commands.register(definition)` from the
 *    `commands` service. This file does NOT restate that type: it is
 *    intentionally narrower so command logic stays testable without a host.
 */
/**
 * Text severity scale shared with tools/scan (`SEVERITIES` there).
 * Kept as a local literal union so this package has zero runtime imports
 * from the scanner; a type-level drift check lives in the self-test.
 */
export const SEVERITIES = ["info", "low", "medium", "high", "critical"];
/** All statuses listed in the connect spec, in display order. */
export const DETECTION_STATUSES = [
    "found",
    "expired",
    "malformed",
    "unreadable",
    "not found",
    "configured",
];
//# sourceMappingURL=types.js.map