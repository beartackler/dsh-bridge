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
    /**
     * Command that re-runs this exact plan with consent. Present when the plan
     * carries arguments the short `apply <provider>` form cannot express.
     */
    readonly applyCommand?: string;
    /**
     * True when the plan also writes the separate `agent-default-model` row.
     * Declaring a provider does not select it, so a plan that claims to connect
     * a model must verify both rows landed
     * (dsh-agent-default-model/lib/types/index.d.ts:19-22).
     */
    readonly selects?: boolean;
}
/**
 * Build the patch entry for one provider. Pure: derived from the static
 * provider table only, so no credential can influence or enter the result.
 */
export declare function planRoute(provider: string): RoutePlan;
/** The whole appended block, including its provenance comment. */
export declare function routeBlock(plan: RoutePlan): string;
/**
 * Where the key value actually goes. `apiKeyEnv` is a credential REFERENCE
 * name resolved through the credentials seam, not a shell variable that must
 * exist (dsh-llm-pi-ai/lib/types/config.d.ts:55; docs/getting-started.md:153).
 * Both places that accept it are named here because a user who only exports a
 * shell variable and never writes the credentials file gets a route that fails
 * with no useful message.
 */
export declare function credentialInstructions(ctx: BridgeContext, envVar: string): readonly string[];
/** Render the plan as the diff a user reads before consenting. */
export declare function renderRouteDiff(ctx: BridgeContext, plan: RoutePlan, existing: boolean): string;
/**
 * Accept only a file that is empty, comments, or a top-level YAML sequence.
 * Anything else (a mapping root, indented junk, a partial document) is refused
 * rather than appended to, because appending would produce a file DSH cannot
 * load. Structural check by construction: this package carries no YAML parser.
 */
export declare function isAppendableSequence(contents: string): boolean;
/**
 * True when this plan's rows are already present in the patch file. A plan
 * that also selects the route must show BOTH rows: a provider declared but not
 * selected is the silent half-route the journey documents
 * (docs/getting-started.md:150-152), and reporting it as landed would be a lie.
 */
export declare function routeAlreadyPresent(contents: string, plan: RoutePlan): boolean;
/**
 * Drop a lone `[]` from an otherwise entry-less file, keeping the comments.
 * The empty list carries no entries, so nothing is lost, and `[]` followed by
 * `- id: ...` would not be a valid YAML document.
 */
export declare function stripEmptyFlowSeq(contents: string): string;
/** True when the provider row alone is present, ignoring any selection row. */
export declare function routeDeclared(contents: string, plan: RoutePlan): boolean;
/** True when an `agent-default-model` row selects this route. */
export declare function selectionPresent(contents: string, route: string): boolean;
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
export declare function confirmationPrompt(provider: string, applyCommand?: string): readonly string[];
/** Post-apply body: what changed, how to undo it, and the smoke command. */
export declare function renderApplied(ctx: BridgeContext, plan: RoutePlan, outcome: ApplyOutcome): string;
/**
 * `/connect apply <provider> [--apply]`. Bare renders the diff plus the
 * typed-confirmation line; `--apply` performs the backed-up write and
 * verifies it.
 */
export declare function runConnectApply(ctx: BridgeContext, provider: string, apply: boolean, io?: ApplyIo): CommandResult;
/**
 * Preview-or-write for an already-built plan. Shared by the provider-table
 * path above and by the custom OpenAI-compatible path (connect-custom.ts), so
 * both get the same backup, rollback, and post-write verification.
 */
export declare function applyPlan(ctx: BridgeContext, plan: RoutePlan, apply: boolean, io?: ApplyIo): CommandResult;
//# sourceMappingURL=connect-apply.d.ts.map