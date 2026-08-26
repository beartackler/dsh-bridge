/**
 * /bridge-connect apply tests.
 *
 * Four things are pinned here:
 *  1. Diff rendering: the preview names the target file, shows the exact patch
 *     row, and writes nothing.
 *  2. .bak creation: an existing patch file is copied before the new bytes
 *     land, and the copy holds the pre-call content verbatim.
 *  3. The env-ref-not-secret invariant: a planted key value is present in the
 *     fake environment, and neither the rendered output nor the written file
 *     contains it. Only the env-var NAME appears.
 *  4. Rollback: a write that throws leaves the file byte-identical to before,
 *     and a created file is removed rather than left half-written.
 *
 * Every case runs against an in-memory ApplyIo double, so no test touches the
 * real filesystem or a real DSH profile.
 */
export {};
//# sourceMappingURL=connect-apply-test.d.ts.map