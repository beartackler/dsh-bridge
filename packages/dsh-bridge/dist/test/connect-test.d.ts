/**
 * /bridge-connect tests (docs/specs/commands/connect.md).
 *
 * Three things are pinned here:
 *  1. Matrix rendering over injected fake rows, so the table shape is checked
 *     without depending on whatever credentials this machine happens to hold.
 *  2. The no-secret-leak invariant (S1): a synthetic secret is planted in a
 *     fake HOME and in the environment, then every rendered surface is
 *     asserted not to contain it, nor any file contents.
 *  3. Expired-state copy: an expired OAuth file yields status `expired` with
 *     the vendor re-login hint, and is never reported as `found`.
 *
 * No test touches the network: the smoke test takes its HTTP client through
 * the `fetchImpl` seam.
 */
export {};
//# sourceMappingURL=connect-test.d.ts.map