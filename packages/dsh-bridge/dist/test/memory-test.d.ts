/**
 * Tests for /bridge-memory (src/commands/memory.ts).
 *
 * Every case runs against a tmpdir HOME injected through the BridgeContext, so
 * the real user's memory file is never touched and no test mutates process env.
 *
 * Coverage:
 *  - show: empty state, then the populated card (path, size, digest, preview)
 *  - edit: creates from template, resolves the editor chain, degrades honestly
 *  - add: dated heading, append under an existing heading, duplicate rejection
 *  - import-from: detection of CLAUDE.md / AGENTS.md, section copy, never
 *    overwrites existing content, and idempotence on a second run
 *
 * Run: npm test
 */
export {};
//# sourceMappingURL=memory-test.d.ts.map