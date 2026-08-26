/**
 * Tests for the /bridge-browse command module (docs/specs/commands/browse.md).
 *
 * Scope:
 *   1. INDEX.md grade parsing and the three-surface grade join.
 *   2. Fuzzy scoring: subsequence acceptance, typo tolerance, ranking order.
 *   3. Flag filters: --category, --lang en|zh|any, --min-grade floors,
 *      --ungraded, plus validation errors for impossible floors and unknown
 *      language codes (spec section 3.2: unknown values never guess).
 *   4. Pagination boundaries: page counts, slicing at exact multiples,
 *      --page range errors.
 *   5. Ranking: grade dominates stars; ties break by stars then name.
 *   6. Empty-result copy: honest, actionable, never padded with unvetted
 *      suggestions (spec section 4.3).
 *
 * Run: npm test (this file compiles with the package), or standalone via
 * `node --test dist/test/browse-test.js`.
 */
export {};
//# sourceMappingURL=browse-test.d.ts.map