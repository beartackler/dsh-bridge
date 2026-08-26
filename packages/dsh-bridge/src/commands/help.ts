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
 * Fixed group order for the directory. Membership is keyed by the command's
 * bare name (namespace stripped), so future registrations slot in without
 * edits here. Groups with no registered commands are skipped rather than
 * rendered empty, and anything unmapped falls under `FALLBACK_GROUP` so a
 * registered command can never silently vanish from the listing.
 */
const GROUPS: readonly (readonly [title: string, names: ReadonlySet<string>])[] = [
  ["Setup", new Set(["init", "login", "connect", "model", "memory", "mcp", "help"])],
  ["Catalog", new Set(["browse", "install", "suggest", "trust"])],
  ["Session", new Set(["compact", "resume"])],
  ["Code", new Set(["review", "improve", "refactor"])],
  ["Diagnostics", new Set(["doctor", "status"])],
];

const FALLBACK_GROUP = "Other";

/** Native DSH commands this plugin intentionally does not rebuild (help spec step 4). */
const NATIVE_COMMANDS = ["/compact", "/theme", "/config", "/export", "/plan"] as const;

/** Strip the `bridge-` namespace for group lookup. */
function bareName(name: string): string {
  return name.replace(/^bridge-/, "");
}

/** One table row: display name (with slash), aliases, one-line summary. */
function rowFor(command: BridgeCommand): readonly string[] {
  return [
    `/${command.name}`,
    command.aliases.length > 0 ? command.aliases.join(", ") : "-",
    command.summary,
  ];
}

const TABLE_HEADERS: readonly string[] = ["Command", "Aliases", "Summary"];

/**
 * Render the full directory. `commands` comes straight from the registry
 * table at invocation time, so dynamically loaded or unloaded commands change
 * the very next render (help spec edge case 4).
 */
export async function renderHelp(
  ctx: BridgeContext,
  _args: Readonly<Record<string, string>>,
  commands: readonly BridgeCommand[],
): Promise<CommandResult> {
  void ctx;
  if (commands.length === 0) {
    return {
      markdown: [
        "## dsh-bridge commands",
        "",
        "No bridge commands are registered in this session. The plugin loaded but",
        "its registry mounted nothing, which usually means the `commands` service",
        "was unavailable when `apply(ctx)` ran.",
        "",
        "Check the mount:",
        "",
        "- `dsh --profile <name> --dump-config` and look for a `# == dsh-bridge` marker",
        "- if the marker is absent the bundle never composed a layer; reinstall with",
        "  `dsh plugin --profile <name> add dsh-bridge`",
        "",
      ].join("\n"),
    };
  }

  // H2 for the page title, H3 for each group: one level of nesting, so the
  // section rule in every command body stays "### is a section, ## is a page".
  const blocks: string[] = ["## dsh-bridge commands", "Usage: /bridge-help [command]"];

  const grouped = new Set<BridgeCommand>();
  for (const [title, names] of GROUPS) {
    const members = commands.filter((command) => names.has(bareName(command.name)));
    if (members.length === 0) continue;
    blocks.push(`### ${title}`);
    blocks.push(ctx.output.table(TABLE_HEADERS, members.map(rowFor)).trimEnd());
    for (const member of members) grouped.add(member);
  }

  const rest = commands.filter((command) => !grouped.has(command));
  if (rest.length > 0) {
    blocks.push(`### ${FALLBACK_GROUP}`);
    blocks.push(ctx.output.table(TABLE_HEADERS, rest.map(rowFor)).trimEnd());
  }

  blocks.push(`Native DSH commands stay as-is: ${NATIVE_COMMANDS.join(" ")}.`);
  blocks.push("Docs: package README and per-command specs in docs/specs/commands/.");

  return { markdown: `${blocks.join("\n\n")}\n` };
}
