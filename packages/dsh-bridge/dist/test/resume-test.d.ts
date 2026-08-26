/**
 * Tests for /bridge-resume (src/commands/resume.ts).
 *
 * The session corpus is a test double injected through the context, so no
 * harness session store is touched and browsing provably writes nothing.
 *
 * Coverage:
 *  - cwd scoping, --all, subagent hiding, literal text filtering
 *  - row rendering: relative time, folded title fallback, message count,
 *    availability badges, fork lineage
 *  - fork-vs-resume semantics present in every rendered surface
 *  - no seam: guidance that is not conflated with an empty corpus
 *  - empty corpus and missing persistence backend footers
 *  - the --json-style row model returned as `data`
 *
 * Run: npm test
 */
export {};
//# sourceMappingURL=resume-test.d.ts.map