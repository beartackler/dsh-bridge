/**
 * Tests for the drift watch (docs/reviews/pm-product-review.md §3, move 4).
 *
 * Scope:
 *   1. Hash change detection - a deterministic directory hash that moves on an
 *      edit, an addition, and a rename, and is stable across walks.
 *   2. State store           - round-trip, malformed-file degradation, merge.
 *   3. Discovery             - installed plugins from profile ground truth.
 *   4. Drift comparison      - aligned / changed / never-audited, plus the one
 *      status line and its silence when nothing moved.
 *   5. Findings diff         - added, resolved, unchanged as a set operation.
 *   6. Card annotation       - Audited row annotated, repeated refresh does not
 *      accumulate, Grade row untouched, no-Audited-row card left alone.
 *   7. Refresh rendering     - diff report, first-audit wording, and the
 *      no-card-yet path which must never imply a published grade.
 *   8. Status integration    - the drift line appears only when a plugin moved.
 *
 * The scanner is never spawned here: refresh takes its scan through an
 * injected dependency, so these tests are hermetic and fast.
 */
export {};
//# sourceMappingURL=drift-test.d.ts.map