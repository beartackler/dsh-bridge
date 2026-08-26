/**
 * Tests for /bridge-doctor (src/commands/doctor.ts).
 *
 * Coverage per the phase task:
 *  - doctor over a fake HOME (tmpdir fixture) yields the expected checklist
 *    shape (ids, statuses, hints bound to non-green rows);
 *  - no crash when every probed path is missing;
 *  - severity transitions driven purely by on-disk fixtures;
 *  - rendering: ASCII-only badges, summary line, machine-readable data payload
 *    without any file contents (metadata-only contract).
 *
 * Run: npm test (compiles then executes dist/test/*-test.js)
 */
export {};
//# sourceMappingURL=doctor-test.d.ts.map