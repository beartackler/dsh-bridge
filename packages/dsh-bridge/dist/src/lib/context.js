/**
 * Context construction: the one place a BridgeContext is built. Commands and
 * lib modules receive it; none of them construct or mutate global state.
 */
/** Freeze-then-return so downstream modules cannot rewire dependencies. */
export function makeBridgeContext(input) {
    return Object.freeze({
        profile: input.profile,
        paths: Object.freeze({ ...input.paths }),
        output: input.output,
    });
}
//# sourceMappingURL=context.js.map