/**
 * Context construction: the one place a BridgeContext is built. Commands and
 * lib modules receive it; none of them construct or mutate global state.
 */

import type {
  BridgeContext,
  BridgePaths,
  HostServices,
  OutputHelpers,
  ProfileSource,
} from "./types.js";

export interface BridgeContextInput {
  readonly profile: string;
  /**
   * Provenance of `profile`. Defaults to `"config"`: a caller that names a
   * profile explicitly has supplied one. Only the plugin entry passes
   * `"mount"` or `"fallback"`, from `resolveProfile` in `lib/host.ts`.
   */
  readonly profileSource?: ProfileSource;
  readonly paths: BridgePaths;
  readonly output: OutputHelpers;
  /** Live harness facts for this invocation; omitted when none are mounted. */
  readonly host?: HostServices;
}

/** Freeze-then-return so downstream modules cannot rewire dependencies. */
export function makeBridgeContext(input: BridgeContextInput): BridgeContext {
  return Object.freeze({
    profile: input.profile,
    profileSource: input.profileSource ?? "config",
    paths: Object.freeze({ ...input.paths }),
    output: input.output,
    ...(input.host === undefined ? {} : { host: Object.freeze({ ...input.host }) }),
  });
}
