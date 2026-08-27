/**
 * Tests for /bridge-install (docs/specs/commands/install.md).
 *
 * Scope:
 *   1. Catalog parsing  - INDEX.md graded rows only; prose never yields a grade.
 *   2. Resolution order - id, owner/repo, specifier promotion, fuzzy,
 *                         ambiguity, not-found (AC-1..AC-4).
 *   3. Consent gate     - A/B/C pass; unlisted and D need the risk flag; F
 *                         needs --force on top (AC-9, AC-10).
 *   4. Output snapshots - trust card, unverified warning wording, the exact
 *                         command, checklist and undo line (AC-5, AC-12, AC-21).
 *   4b. Consent gate on the action - without `--yes` nothing is executed on any
 *                         path (the AC-13 invariant); with `--yes` the install
 *                         runs through an injected seam and the verbatim
 *                         command, checklist, and undo line are still printed.
 *   5. Degraded catalog - missing manifest fails closed to unlisted (AC-23).
 *   6. House rules      - no emoji anywhere in any rendered output.
 *
 * Fixtures are written to scratch dirs so the tests never depend on the
 * evolving repo catalog. The command is also exercised through lib/registry.ts
 * so registration wiring is covered.
 */
export {};
//# sourceMappingURL=install-test.d.ts.map