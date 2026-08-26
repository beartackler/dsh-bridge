/**
 * Smoke self-test (node:test, no external test runner).
 *
 * Scope: prove the engine's contracts, not exhaustive rule coverage.
 *   1. Each rule has the declared shape and fires on a positive fixture.
 *   2. Each rule stays quiet on a negative fixture (false positives are the main way
 *      a trust layer loses credibility).
 *   3. Grading caps are monotone and hard gates fire.
 *   4. Output is byte-for-byte deterministic across repeated runs.
 *
 * Run: npm test
 */
export {};
//# sourceMappingURL=self-test.d.ts.map