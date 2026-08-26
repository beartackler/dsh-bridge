/**
 * /bridge-connect apply - write one DSH model route for a detected provider.
 *
 * This is the half of the connectors flow that phase 1 deliberately left out:
 * detection names the credential, and this module turns it into the exact
 * config row DSH loads, with the write gated behind an explicit flag.
 *
 * Where the route goes, and why that file:
 *   $DSH_HOME/profiles/<profile>/cordis.patch.yml
 * A profile directory holds a `package.json` manifest maintained by
 * `dsh plugin` plus the user's own `cordis.patch.yml`, which is the patch
 * layer applied after every bundle layer and before the home-level patch
 * (reference checkout: docs/user/develop/basic/publish.md, "The profile
 * manifest" and "The loading order"; docs/architecture.md:27). That makes it
 * the one file a user owns and the correct target for a user's route. The
 * path is `ctx.paths.profilePatch`, so a host or a test can relocate it.
 *
 * Which row is emitted, and why:
 *  - deepseek gets an `llm-deepseek` row, whose config declares
 *    `apiKeyEnv` as a credential REFERENCE resolved per request
 *    (reference checkout: docs/config-catalog.md, `@deepseek-ai/dsh-llm-deepseek`
 *    -> `Config.apiKeyEnv`, "Credential reference (environment-variable name)
 *    resolved per request").
 *  - every other provider gets an `llm-pi-ai` row, whose `providers` dict is
 *    keyed by route name and whose entries also take `apiKeyEnv` plus a
 *    `baseURL` (reference checkout: docs/config-catalog.md,
 *    `@deepseek-ai/dsh-llm-pi-ai` -> `PiAiProviderProfile.apiKeyEnv`,
 *    `.baseURL`). The base bundle mounts that adapter dormant with zero
 *    routes, so supplying a provider profile is exactly how a route registers
 *    (reference checkout: packages/bundle/base/cordis.patch.yml:88-96).
 *
 * Security invariants (connect spec S1/S3, CHARTER):
 *  - A route stores the env-var NAME as an `!!js process.env.NAME` expression.
 *    No secret VALUE is read by this module, rendered in the diff, or written
 *    to disk. There is no code path from a credential value to a file here.
 *  - Nothing is written without `--apply`. The bare form renders the diff and
 *    the typed-confirmation line, and returns.
 *  - The previous file is copied to `<path>.bak` before the new bytes land, and
 *    a failed write is rolled back from that copy (or the created file is
 *    removed when there was no previous file).
 *  - A patch file that is not a top-level YAML sequence is refused rather than
 *    appended to, so an unparseable or hand-restructured file is never
 *    corrupted.
 */
import type { BridgeContext, CommandResult } from "../lib/types.js";
/** Filesystem surface used here; injected so tests never touch a real disk. */
export interface ApplyIo {
    exists(path: string): boolean;
    readFile(path: string): string;
    writeFile(path: string, content: string): void;
    copyFile(from: string, to: string): void;
    removeFile(path: string): void;
}
/** Node-backed io: the only place this module performs real fs calls. */
export declare function nodeApplyIo(): ApplyIo;
/** Patch row identity plus the yamlish body lines that follow it. */
export interface RoutePlan {
    readonly provider: string;
    /** Patch row `id`, and the token used to detect an already-applied route. */
    readonly rowId: string;
    /** Env-var NAME the row references. Never a value. */
    readonly envVar: string;
    /** Rendered patch entry, one YAML line per element, no trailing newline. */
    readonly lines: readonly string[];
}
/**
 * Build the patch entry for one provider. Pure: derived from the static
 * provider table only, so no credential can influence or enter the result.
 */
export declare function planRoute(provider: string): RoutePlan;
/** The whole appended block, including its provenance comment. */
export declare function routeBlock(plan: RoutePlan): string;
/** Render the plan as the diff a user reads before consenting. */
export declare function renderRouteDiff(ctx: BridgeContext, plan: RoutePlan, existing: boolean): string;
/**
 * Accept only a file that is empty, comments, or a top-level YAML sequence.
 * Anything else (a mapping root, indented junk, a partial document) is refused
 * rather than appended to, because appending would produce a file DSH cannot
 * load. Structural check by construction: this package carries no YAML parser.
 */
export declare function isAppendableSequence(contents: string): boolean;
/** True when this provider's row is already present in the patch file. */
export declare function routeAlreadyPresent(contents: string, plan: RoutePlan): boolean;
export interface ApplyOutcome {
    readonly written: boolean;
    readonly backupPath?: string;
    /** Present when the write was refused or failed. */
    readonly error?: string;
    /** True when a post-write re-read found the route in the file. */
    readonly verified?: boolean;
}
/**
 * Append the route, backing the previous file up first and rolling back if
 * either the write or the verification read fails. Never partially applies:
 * on any failure the file is restored to its pre-call bytes.
 */
export declare function applyRoute(io: ApplyIo, path: string, plan: RoutePlan): ApplyOutcome;
/** Consent copy for the preview form. `--apply` is the explicit consent. */
export declare function confirmationPrompt(provider: string): readonly string[];
/** Post-apply body: what changed, how to undo it, and the smoke command. */
export declare function renderApplied(ctx: BridgeContext, plan: RoutePlan, outcome: ApplyOutcome): string;
/**
 * `/connect apply <provider> [--apply]`. Bare renders the diff plus the
 * typed-confirmation line; `--apply` performs the backed-up write and
 * verifies it.
 */
export declare function runConnectApply(ctx: BridgeContext, provider: string, apply: boolean, io?: ApplyIo): CommandResult;
//# sourceMappingURL=connect-apply.d.ts.map