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

import { makeBridgeContext } from "./lib/context.js";
import { readHostServices, resolveProfile, type AgentLike, type ServiceCarrier } from "./lib/host.js";
import { bridgeCommandTable, type BridgeCommand } from "./lib/registry.js";
import { dshHomeDir, homeDir, profilePackageJsonPath, profilePatchPath } from "./lib/paths.js";
import * as output from "./lib/output.js";
import { primeBlankSession, type SessionLike } from "./lib/session-priming.js";
import type { BridgeContext } from "./lib/types.js";

/**
 * The `commands` service contract comes from the host package itself
 * (@deepseek-ai/dsh-commands), which declares `Context.commands` via its own
 * module augmentation. Importing it for the side effect keeps that contract
 * in one place: the harness's, not a copy of ours. Verified against the live
 * runtime (dsh 0.1.1-rc.2) in docs/research/live-mount-report.md.
 */
import type {} from "@deepseek-ai/dsh-commands";

export const name = "dsh-bridge";

/** Services consumed from the host (seams doc §3.1). */
export const inject = ["commands"];

/** Plugin configuration schema; validated by Cordis via Schemastery. */
export interface Config {
  /**
   * Profile name commands operate on. Optional by design: the mount point
   * already knows which profile it loaded (`ctx.baseUrl`), so the supported
   * install path needs no configuration. Setting this only overrides the name
   * used when the mount cannot be read. Defaulting it to `"default"` is what
   * made /bridge-doctor blame a profile nobody used (journey report 3.2, F5).
   */
  profile?: string;
}

export const Config: Schema<Config> = Schema.object({
  profile: Schema.string(),
});

/**
 * Bridge features this composition mounts, reported by /bridge-status S3. The
 * list is a fact about this build: the command surface below is registered
 * unconditionally, so naming these is a claim we can keep.
 */
const MOUNTED_FEATURES: readonly string[] = Object.freeze([
  "commands",
  "connectors flow",
  "trust layer",
  "catalog",
]);

export function apply(ctx: Context, config: Config): void {
  // Ask the harness which profile this plugin is mounted in before falling
  // back to configuration (F5). `resolveProfile` returns the provenance too,
  // so doctor and status can refuse to grade a name nobody chose.
  const dshHome = dshHomeDir();
  const profile = resolveProfile(ctx, dshHome, config.profile);

  // Single construction point for everything commands may touch. Commands
  // receive this through their runner closure; nothing reaches for singletons.
  const bridgeContext = makeBridgeContext({
    profile: profile.name,
    profileSource: profile.source,
    paths: {
      home: homeDir(),
      dshHome,
      profilePatch: profilePatchPath(profile.name, dshHome),
      profilePackageJson: profilePackageJsonPath(profile.name, dshHome),
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
function registerCommand(ctx: Context, command: BridgeCommand, bridgeContext: BridgeContext): void {
  // The host rejects a present-but-blank hint outright (verified against the
  // live runtime: dsh-commands/lib/index.js normalizeDefinition, "input hint
  // must not be empty"). A command that takes no argument must omit `input`
  // entirely rather than pass an empty string.
  const hint = command.usage.trim();
  const handler = async ({
    rawInput,
    agent,
  }: {
    rawInput: string;
    agent?: AgentLike;
  }): Promise<{ kind: "success" | "error"; text: string }> => {
    try {
      // Route and token usage are live facts, so they are read per invocation
      // from the invoking agent and the mounted services rather than cached at
      // mount time (F6). A composition mounting neither yields an empty object
      // and every affected row degrades on its own.
      // Zero-turn sessions do not render command output at all (journey report
      // §5, BUG 2; mechanism and citations in lib/session-priming.ts). The
      // harness owns the defect; this is the only lever a plugin has, and it
      // must run before the result is returned so the row exists by the time
      // the client rebuilds. It never throws and never fails the command.
      primeBlankSession(agent?.session as SessionLike | undefined);
      const host = readHostServices(ctx as unknown as ServiceCarrier, agent, MOUNTED_FEATURES);
      const invocationContext = makeBridgeContext({
        profile: bridgeContext.profile,
        profileSource: bridgeContext.profileSource,
        paths: bridgeContext.paths,
        output: bridgeContext.output,
        host,
      });
      const result = await command.run(invocationContext, parseArgs(rawInput));
      return { kind: "success", text: result.markdown };
    } catch (error) {
      return { kind: "error", text: `${command.name}: ${(error as Error).message}` };
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
function parseArgs(rawInput: string): Record<string, string> {
  const args: Record<string, string> = {};
  const positionals: string[] = [];
  let current: string | null = null;
  for (const token of rawInput.trim().split(/\s+/).filter((token) => token !== "")) {
    if (token.startsWith("--")) {
      current = token.slice(2);
      args[current] = "";
    } else if (current !== null) {
      args[current] = token;
      current = null;
    } else {
      positionals.push(token);
    }
  }
  if (positionals.length > 0) {
    const [first, ...rest] = positionals;
    if (first !== undefined) args["_"] = first;
    if (rest.length > 0) args["rest"] = rest.join(" ");
  }
  return args;
}
