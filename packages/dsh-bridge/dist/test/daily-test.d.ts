/**
 * Tests for /bridge-daily (docs/design/daily-loop.md).
 *
 * Scope, matching the four blocks the design commits to:
 *   1. State store      round-trip, malformed degradation, atomic write.
 *   2. Date arithmetic  whole-day differences, unusable input.
 *   3. Rotation picker  never-audited first, oldest next, drifted excluded,
 *                       deterministic ties.
 *   4. Briefing model   counts keep never-audited apart from aligned, newly-
 *                       changed is a set difference, first-open has no delta.
 *   5. Rendering        THE central requirement: a quiet day produces value.
 *                       Also that drift never renders as a grade, and that an
 *                       empty profile never reads as clean.
 *   6. Runner           snapshot advances the delta, --peek does not, drift is
 *                       injectable so nothing walks a real profile.
 *
 * Hermetic: no scanner spawn, no real profile, no ambient clock. Every date is
 * injected and every I/O boundary is either a tmpdir or a fake.
 */
export {};
//# sourceMappingURL=daily-test.d.ts.map