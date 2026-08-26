/**
 * Tests for /bridge-compact (src/commands/compact.ts).
 *
 * The host compaction engine and token meter are test doubles passed through
 * the injected context, so no harness process, model call, or session is
 * involved. Doubles record their calls to prove the seam is used exactly once.
 *
 * Coverage:
 *  - grammar: bare, status, steering, over-length rejection
 *  - hook present: before/after token figures, shadow counts, preserved sections
 *  - hook absent: honest instructions, no fabricated compaction
 *  - null result: the verbatim native string users grep for
 *  - status: threshold math, degraded rendering when no window is advertised
 *
 * Run: npm test
 */
export {};
//# sourceMappingURL=compact-test.d.ts.map