/**
 * Tests for the /bridge-trust command module (docs/specs/commands/trust.md).
 *
 * Scope for this wave:
 *   1. toSlug            - subject normalization: URL, owner/repo, plain slug.
 *   2. gradeFromCard     - Grade row extraction from committed card markdown.
 *   3. Card rendering    - header + grade + verdict from a fixture card file
 *                          written into a scratch catalog directory.
 *   4. Scan subcommand   - scan-client mock on a temp dir with a benign file
 *                          (no findings) and a file containing eval() (finding
 *                          appears); rendering proven via renderScanSummary,
 *                          plus one real scanner spawn through runTrust.
 *   5. List subcommand   - enumerates available cards.
 *   6. Unreviewed path   - graceful NOT REVIEWED state with queue hint; no grade.
 *
 * The command is exercised through lib/registry.ts so registration wiring is
 * covered too. Run: npm test (this file compiles with the package).
 */
export {};
//# sourceMappingURL=trust-test.d.ts.map