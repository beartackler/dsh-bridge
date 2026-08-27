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
import Schema from "@deepseek-ai/schemastery";
import { makeBridgeContext } from "./lib/context.js";
import { bridgeCommandTable } from "./lib/registry.js";
import { dshHomeDir, homeDir, profilePackageJsonPath, profilePatchPath } from "./lib/paths.js";
import * as output from "./lib/output.js";
export const name = "dsh-bridge";
/** Services consumed from the host (seams doc §3.1). */
export const inject = ["commands"];
export const Config = Schema.object({
    profile: Schema.string().default("default"),
});
export function apply(ctx, config) {
    // Single construction point for everything commands may touch. Commands
    // receive this through their runner closure; nothing reaches for singletons.
    const bridgeContext = makeBridgeContext({
        profile: config.profile,
        paths: {
            home: homeDir(),
            dshHome: dshHomeDir(),
            get profilePatch() {
                return profilePatchPath(config.profile);
            },
            get profilePackageJson() {
                return profilePackageJsonPath(config.profile);
            },
        },
        output,
    });
    // Mount point per command module. Phase 1 ships typed stubs; each
    // implemented command replaces its stub in place:
    //   /bridge-help    -> src/commands/help.ts    (docs/specs/commands/help.md)
    //   /bridge-connect -> src/commands/connect.ts (docs/specs/commands/connect.md)
    //   /bridge-install -> src/commands/install.ts (docs/specs/commands/install.md)
    // Remaining surface (/model, /login, /init, /review, /compact, /resume,
    // /memory, /mcp) mounts here as specs land.
    for (const command of bridgeCommandTable(bridgeContext)) {
        registerCommand(ctx, command, bridgeContext);
    }
}
/**
 * Translate one internal descriptor into a native registration.
 *
 * The mapping stays in exactly one place so the eventual swap to real
 * @deepseek-ai/dsh-commands types touches only this function plus the
 * augmentation above. Handler shape verified against
 * packages/interaction/commands/src/index.ts (CommandInvocation,
 * CommandDefinition): abortable via `signal`, results of
 * `{ kind: 'success' | 'error', text }`, never sent to the model.
 */
function registerCommand(ctx, command, bridgeContext) {
    // The host rejects a present-but-blank hint outright (verified against the
    // live runtime: dsh-commands/lib/index.js normalizeDefinition, "input hint
    // must not be empty"). A command that takes no argument must omit `input`
    // entirely rather than pass an empty string.
    const hint = command.usage.trim();
    const handler = async ({ rawInput }) => {
        try {
            const result = await command.run(bridgeContext, parseArgs(rawInput));
            return { kind: "success", text: result.markdown };
        }
        catch (error) {
            return { kind: "error", text: `${command.name}: ${error.message}` };
        }
    };
    ctx.commands.register({
        name: command.name,
        description: command.summary,
        ...(hint === "" ? {} : { input: { hint } }),
        handler,
    });
    // Aliases share the same handler and description; registered as distinct
    // command names so they resolve identically at the parser (help spec edge
    // case 1's "never register both spellings blindly" is satisfied because
    // each alias name is registered exactly once here, never duplicated).
    for (const alias of command.aliases) {
        ctx.commands.register({
            name: alias,
            description: command.summary,
            ...(hint === "" ? {} : { input: { hint } }),
            handler,
        });
    }
}
/**
 * Minimal `--flag value` splitter with positional capture.
 *
 * Positional words accumulate into `_` (the first word, e.g. a subcommand like
 * `scan` or `list`) and `rest` (everything after it), so command modules can
 * route on the verb without re-parsing. Flags still win: a token following
 * `--flag` is its value, never a positional.
 */
function parseArgs(rawInput) {
    const args = {};
    const positionals = [];
    let current = null;
    for (const token of rawInput.trim().split(/\s+/).filter((token) => token !== "")) {
        if (token.startsWith("--")) {
            current = token.slice(2);
            args[current] = "";
        }
        else if (current !== null) {
            args[current] = token;
            current = null;
        }
        else {
            positionals.push(token);
        }
    }
    if (positionals.length > 0) {
        const [first, ...rest] = positionals;
        if (first !== undefined)
            args["_"] = first;
        if (rest.length > 0)
            args["rest"] = rest.join(" ");
    }
    return args;
}
//# sourceMappingURL=index.js.map