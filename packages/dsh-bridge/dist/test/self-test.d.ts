/**
 * Self-test (node:test, no external runner) for the dsh-bridge plugin package.
 *
 * Scope: basic contracts per module, per the phase-1 task.
 *   1. types.ts       - severity/status vocabularies match the specs they mirror.
 *   2. output.ts      - markdown helpers: tables, cards, badges; ASCII only; no emoji.
 *   3. paths.ts       - detection-matrix paths, env expansion, metadata-only probes
 *                       (symlink refusal, size cap, mask shape), never contents.
 *   4. scan-client.ts - report parsing + a real spawn of tools/scan dist over a fixture.
 *   5. index.ts       - entry contract: name/inject/Config exports, command table,
 *                       registration into a recording fake ctx (no global state).
 *
 * Run: npm test
 */
export {};
//# sourceMappingURL=self-test.d.ts.map