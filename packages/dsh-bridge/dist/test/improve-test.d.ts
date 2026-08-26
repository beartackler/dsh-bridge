/**
 * Tests for /bridge-improve (src/commands/improve.ts).
 *
 * Coverage per docs/specs/commands/improve.md acceptance criteria:
 *  - each detector fires exactly on its fixture (AC10);
 *  - the clean fixture yields the single "No findings." line (AC9);
 *  - ranking is deterministic (AC6) and filters/limits behave (AC7, AC8);
 *  - missing path, unsupported extension, empty file degrade to messages (AC11);
 *  - no target and no --diff errors with the documented message (AC3);
 *  - --diff uses only `git diff --name-only` forms (AC4);
 *  - rendered output is ASCII with no emoji (AC12).
 *
 * Fixtures live in test/fixtures/improve with a .ts.txt suffix so the package
 * build never type-checks intentionally bad code. Run: npm test.
 */
export {};
//# sourceMappingURL=improve-test.d.ts.map