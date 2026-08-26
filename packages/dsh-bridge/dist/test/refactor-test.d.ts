/**
 * Tests for the /bridge-refactor command module
 * (docs/specs/commands/refactor.md).
 *
 * Scope for this wave:
 *   1. scanSource        - imports, exports, line counts from fixture text.
 *   2. Plan-only default - inventory + steps rendered, zero writes anywhere.
 *   3. split-file        - oversized multi-export fixture yields re-exporting
 *                          steps; applying them with a green exec double
 *                          keeps every exported name reachable.
 *   4. inline-helper     - single-use zero-parameter helper inlined.
 *   5. --apply + rollback- green first step, red second run: files created by
 *                          apply are deleted, prior contents restored exactly,
 *                          failed step reported (injected exec double).
 *   6. Safety            - plan file writing outside the target refused before
 *                          any write; missing exec seam refuses --apply;
 *                          rename respects word boundaries and flags [public].
 *
 * The command runs through its exported runner with a context built by
 * makeBridgeContext, mirroring the other command tests. No git operations,
 * no emoji. Run: npm test (this file compiles with the package).
 */
export {};
//# sourceMappingURL=refactor-test.d.ts.map