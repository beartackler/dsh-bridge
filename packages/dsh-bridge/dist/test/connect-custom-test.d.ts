/**
 * /bridge-connect custom, and the route step of /bridge-setup that uses it.
 *
 * The load-bearing case is byte-for-byte: the block this code renders for the
 * OpenCode Zen route must equal, character for character, the block a human
 * hand-wrote and then verified against the live endpoint
 * (docs/getting-started.md:103-132; docs/research/e2e-onboarding-journey.md:70-88;
 * the route was accepted by the harness and reached the model, per
 * docs/research/e2e-npx-journey.md:186-203). Anything less than equality here
 * is a route that may silently not load, which is the exact failure mode the
 * getting-started notes warn about.
 *
 * Also pinned:
 *  - `.bak` is created and holds the pre-call bytes verbatim.
 *  - No secret ever reaches written content or rendered output, and a
 *    key-shaped `--key-env` is refused before any write.
 *  - Verification detects a route that failed to land: a write that silently
 *    drops the selection row is reported as unverified and rolled back.
 *
 * Every case uses an in-memory io double; nothing touches a real filesystem.
 */
export {};
//# sourceMappingURL=connect-custom-test.d.ts.map