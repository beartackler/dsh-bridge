/**
 * dsh-bridge plugin entry.
 *
 * Shape follows the verified starter (templates/plugin-starter/src/index.ts)
 * and the harness authoring guide (seams doc §2): a plugin module exports
 * `name`, optional `inject`, and `apply(ctx, config)`. Everything registered
 * through `ctx` unwinds automatically on unload.
 *
 * Command-name rule (inventory doc §1.1, confirmed against the reference
 * checkout): the slash parser accepts `[a-z][a-z0-9_-]*` only, so the
 * namespace convention is `/bridge-*`. `/bridge:install` is NOT parseable and
 * must never be registered.
 *
 * This phase delivers the foundation: the command surface registers from a
 * descriptor table; each command module mounts at its marked slot in phase 2.
 * The BridgeContext is constructed once here and injected everywhere; no
 * module keeps global state.
 */
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
export declare const name = "dsh-bridge";
/** Services consumed from the host (seams doc §3.1). */
export declare const inject: string[];
/** Plugin configuration schema; validated by Cordis via Schemastery. */
export interface Config {
    /** Active profile name commands operate on when none is given. */
    profile: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map