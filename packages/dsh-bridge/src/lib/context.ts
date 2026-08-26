/**
 * Context construction: the one place a BridgeContext is built. Commands and
 * lib modules receive it; none of them construct or mutate global state.
 */

import type { BridgeContext, BridgePaths, OutputHelpers } from "./types.js";

export interface BridgeContextInput {
  readonly profile: string;
  readonly paths: BridgePaths;
  readonly output: OutputHelpers;
}

/** Freeze-then-return so downstream modules cannot rewire dependencies. */
export function makeBridgeContext(input: BridgeContextInput): BridgeContext {
  return Object.freeze({
    profile: input.profile,
    paths: Object.freeze({ ...input.paths }),
    output: input.output,
  });
}
