/**
 * /bridge-help: one-screen directory of every registered bridge command.
 *
 * Per docs/specs/commands/help.md: terse lines, grouped sections, generated
 * live from the descriptor table handed in by the registry (never a hardcoded
 * copy), plain markdown that survives being piped into `less`.
 *
 * Deliberately not in this slice (later spec work): `/bridge-help <command>`
 * detail cards and did-you-mean suggestions, both blocked on positional args
 * reaching command runners (index.ts parseArgs currently forwards --flags
 * only). The footer therefore points at the repo specs instead of promising a
 * detail mode that does not exist yet.
 */
import type { BridgeCommand } from "../lib/registry.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";
/**
 * Render the full directory. `commands` comes straight from the registry
 * table at invocation time, so dynamically loaded or unloaded commands change
 * the very next render (help spec edge case 4).
 */
export declare function renderHelp(ctx: BridgeContext, _args: Readonly<Record<string, string>>, commands: readonly BridgeCommand[]): Promise<CommandResult>;
//# sourceMappingURL=help.d.ts.map