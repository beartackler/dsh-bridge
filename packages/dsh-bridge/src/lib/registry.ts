/**
 * Command surface table.
 *
 * Each row mounts its implemented module from src/commands/ per
 * docs/specs/commands/*.md; remaining spec surface mounts here as modules
 * land. Rows are ordered by group exactly as /bridge-help renders them.
 */

import { normalizeSpacing } from "./output.js";
import type { CommandResult } from "./types.js";
import type { BridgeContext } from "./types.js";

import { runConnect } from "../commands/connect.js";

import { runBrowse } from "../commands/browse.js";
import { runCompact } from "../commands/compact.js";
import { runDoctor } from "../commands/doctor.js";
import { renderHelp } from "../commands/help.js";
import { runImprove } from "../commands/improve.js";
import { runInit } from "../commands/init.js";
import { runInstall } from "../commands/install.js";
import { runMcp } from "../commands/mcp.js";
import { runMemory } from "../commands/memory.js";
import { runModel } from "../commands/model.js";
import { runRefactor } from "../commands/refactor.js";
import { runResume } from "../commands/resume.js";
import { runReview } from "../commands/review.js";
import { runStatus } from "../commands/status.js";
import { runSuggest } from "../commands/suggest.js";
import { runTrust } from "../commands/trust.js";

export interface BridgeCommand {
  /** Lowercase name without the leading slash; `/bridge-…` namespace only. */
  readonly name: string;
  /** Reserved for the alias strategy decision (help spec edge case 1). */
  readonly aliases: readonly string[];
  readonly summary: string;
  /** Argument hint, e.g. `[provider]`. */
  readonly usage: string;
  readonly run: (ctx: BridgeContext, args: Readonly<Record<string, string>>) => Promise<CommandResult>;
}

/**
 * Shared runner signature for implemented command modules, matching
 * BridgeCommand.run exactly so rows mount without adapters.
 */
type CommandRunner = (
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
) => Promise<CommandResult>;

/**
 * Wrap a runner so its markdown passes through `normalizeSpacing`. Applied to
 * every row below, so vertical rhythm is a property of the command surface
 * rather than something each of the 17 modules has to remember. `data` rides
 * through untouched.
 */
function normalized(run: CommandRunner): CommandRunner {
  return async (ctx, args) => {
    const result = await run(ctx, args);
    const markdown = normalizeSpacing(result.markdown);
    return result.data === undefined ? { markdown } : { markdown, data: result.data };
  };
}

/** Rows are ordered by group exactly as /bridge-help will render them. */
export function bridgeCommandTable(ctx: BridgeContext): readonly BridgeCommand[] {
  void ctx;
  return Object.freeze(([
    {
      name: "bridge-help",
      aliases: [],
      summary: "List every bridge command plus native DSH commands kept as-is",
      usage: "[command]",
      // MOUNT(help): src/commands/help.ts implements this per docs/specs/commands/help.md.
      run: ((ctx, args) => renderHelp(ctx, args, bridgeCommandTable(ctx))) as CommandRunner,
    },
    {
      name: "bridge-connect",
      aliases: [],
      summary: "Detect local provider credentials, smoke reachability, and apply a model route",
      usage: "[test <provider>] | apply <provider> [--apply]",
      // Implemented per docs/specs/commands/connect.md (detection + report this phase).
      run: runConnect as CommandRunner,
    },
    {
      name: "bridge-doctor",
      aliases: [],
      summary: "Check node runtime, credentials, profiles, and profile config; report green/yellow/red",
      usage: "[--net] [--probe]",
      // Implemented per docs/specs/commands/doctor.md (read-only checks this phase).
      run: runDoctor,
    },
    {
      name: "bridge-trust",
      aliases: [],
      summary: "Show plugin trust report cards, scan local code, list reviewed plugins, re-check installed ones",
      usage: "<plugin> | scan <directory> | list | refresh [<plugin>]",
      // MOUNT(trust): src/commands/trust.ts implements this per docs/specs/commands/trust.md.
      run: runTrust,
    },
    {
      name: "bridge-model",
      aliases: [],
      summary: "List model routes with availability; stage use/test switches via instructions",
      usage: "[list] | use <provider>/<model> [--save | --reset] | test <provider>/<model>",
      // MOUNT(model): src/commands/model.ts implements this per docs/specs/commands/model.md.
      run: runModel as CommandRunner,
    },
    {
      name: "bridge-status",
      aliases: [],
      summary: "Dashboard of profile, active route, mounted features, stale trust cards, tokens",
      usage: "",
      // MOUNT(status): src/commands/status.ts implements this per docs/specs/commands/status.md.
      run: runStatus as CommandRunner,
    },
    {
      name: "bridge-browse",
      aliases: [],
      summary: "Browse the verified plugin catalog with trust grades, filters, and search",
      usage: "[category] [next | prev | <page>] | find <query>",
      // MOUNT(browse): src/commands/browse.ts implements this per docs/specs/commands/browse.md.
      run: runBrowse as CommandRunner,
    },
    {
      name: "bridge-install",
      aliases: [],
      summary: "Resolve a plugin against the verified catalog, show its trust summary, and emit the native install command",
      usage: "<plugin | github:owner/repo> [--report] [--profile <name>]",
      // MOUNT(install): src/commands/install.ts implements this per docs/specs/commands/install.md.
      run: runInstall as CommandRunner,
    },
    {
      name: "bridge-memory",
      aliases: [],
      summary: "Show, edit, and grow bridge-managed persistent instructions; import CLAUDE.md or AGENTS.md",
      usage: "show | edit | add <note> | import-from [dir]",
      // MOUNT(memory): src/commands/memory.ts implements this per docs/specs/commands/memory.md.
      run: runMemory,
    },
    {
      name: "bridge-compact",
      aliases: [],
      summary: "Compact conversation history with before/after token figures, or report context pressure",
      usage: "[instructions] | status",
      // MOUNT(compact): src/commands/compact.ts implements this per docs/specs/commands/compact.md.
      run: runCompact,
    },
    {
      name: "bridge-resume",
      aliases: [],
      summary: "List recent sessions for this directory and explain resume-vs-fork before either is chosen",
      usage: "[--all] [--subagents] [<text>]",
      // MOUNT(resume): src/commands/resume.ts implements this per docs/specs/commands/resume.md.
      run: runResume,
    },
    {
      name: "bridge-init",
      aliases: [],
      summary: "Scaffold bridge configuration and project instructions for this repository",
      usage: "[--force] [--dry-run]",
      // MOUNT(init): src/commands/init.ts implements this per docs/specs/commands/init.md.
      run: runInit,
    },
    {
      name: "bridge-mcp",
      aliases: [],
      summary: "List, add, remove, and test MCP servers; import them from an existing Claude config",
      usage: "list | add <name> <cmd> | remove <name> | test <name> | import-from claude",
      // MOUNT(mcp): src/commands/mcp.ts implements this per docs/specs/commands/mcp.md.
      run: runMcp,
    },
    {
      name: "bridge-suggest",
      aliases: [],
      summary: "Suggest verified catalog plugins that fit this project, with reasons",
      usage: "[<topic>]",
      // MOUNT(suggest): src/commands/suggest.ts implements this per docs/specs/commands/suggest.md.
      run: runSuggest as CommandRunner,
    },
    {
      name: "bridge-review",
      aliases: [],
      summary: "Review local changes against the repository conventions and report findings",
      usage: "[<path>]",
      // MOUNT(review): src/commands/review.ts implements this per docs/specs/commands/review.md.
      run: runReview as CommandRunner,
    },
    {
      name: "bridge-improve",
      aliases: [],
      summary: "Audit code for over-engineering and rank what can be deleted, read-only",
      usage: "[<path>] [--diff] [--limit <n>]",
      // MOUNT(improve): src/commands/improve.ts implements this per docs/specs/commands/improve.md.
      run: runImprove as CommandRunner,
    },
    {
      name: "bridge-refactor",
      aliases: [],
      summary: "Inventory a target and print a behavior-preserving refactor plan before any change",
      usage: "[<path>]",
      // MOUNT(refactor): src/commands/refactor.ts implements this per docs/specs/commands/refactor.md.
      run: runRefactor,
    },
  ] satisfies readonly BridgeCommand[]).map((row) => ({ ...row, run: normalized(row.run) })));
}
