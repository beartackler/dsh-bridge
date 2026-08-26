/**
 * dsh-bridge plugin starter: one example skill and one example slash command,
 * registered through the Cordis plugin API.
 *
 * Shape follows the official tutorial "Your first plugin"
 * (deepseek-harness docs/user/develop/basic/index.md):
 *   - a plugin is a module exporting `name` (optional) and an `apply(ctx)`
 *     function that Cordis calls at load time;
 *   - services this plugin consumes are declared in `inject` and are ready
 *     before `apply` runs;
 *   - everything registered through `ctx` is cleaned up automatically when
 *     the plugin unloads; explicit disposers use `ctx.effect()`.
 *
 * The exact registration signatures below were verified against the harness
 * reference sources (`packages/interaction/commands/src/index.ts`,
 * `packages/skill/skill/src/index.ts`, shipped example
 * `packages/goal/command-goal/src/index.ts`) as of 2026-08-25. Where the
 * published peer-package surface may differ from a live checkout build, a
 * `TODO(verify)` marker flags the spot to re-check before publishing.
 */
import type { Context } from '@deepseek-ai/cordis'
// TODO(verify): confirm the runtime (non-type-only) export shape of the
// commands/skills registries against a live checkout build. In-repo they are
// provided by @deepseek-ai/dsh-commands and @deepseek-ai/dsh-skill; if those
// type surfaces are not reachable from the published peer packages alone,
// narrow these imports to the minimal types that resolve.
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import Schema from '@deepseek-ai/schemastery'

/** Kebab-case plugin name; Cordis uses it in logs and registry bookkeeping. */
export const name = 'plugin-starter'

/**
 * Services consumed by this plugin. The framework waits for every required
 * service before loading the plugin (docs/user/develop/basic/index.md,
 * "Declare dependencies").
 */
export const inject = ['commands', 'skills']

/**
 * Optional user configuration, supplied via cordis.yml / profile patch files.
 * Exporting a Schemastery schema named `Config` lets Cordis validate input and
 * fill defaults (docs/user/develop/basic/config.md). Delete this block if your
 * plugin needs no configuration.
 */
export interface Config {
  /** Text echoed by the `/starter:ping` command. */
  greeting: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello from dsh-bridge plugin-starter!'),
})

/**
 * Example slash command: executes directly against the receiving agent and
 * never sends anything to the model.
 *
 * Signature verified against CommandDefinition
 * (@deepseek-ai/dsh-commands, packages/interaction/commands/src/index.ts):
 *   - `name` is lowercase without the leading slash;
 *   - `handler` receives { commandId, agent, rawInput, signal } and returns
 *     `{ kind: 'success', text? }` or `{ kind: 'error', text }`.
 *
 * TODO(verify): the `input.hint` descriptor and result union against a live
 * checkout build of the published peer packages before first release.
 */
const pingCommand = (config: Config): CommandDefinition => ({
  name: 'starter:ping',
  description: 'reply with the starter greeting (no model round-trip)',
  input: { hint: '[optional note to echo back]' },
  handler: invocation => {
    const note = invocation.rawInput.trim()
    const suffix = note ? ` (note: ${note})` : ''
    return { kind: 'success', text: `${config.greeting}${suffix}` }
  },
})

/**
 * Example skill: contributes instructions to the model-facing catalog.
 *
 * Runtime contributions are accepted by `ctx.skills.register()` as
 * SkillRegistration = SkillDefinition minus auto-managed fields:
 *   - `name`: kebab-case identifier used to address the skill;
 *   - `description`: short routing description shown by discovery consumers;
 *   - `source`: provenance label ('runtime' for code-registered skills);
 *   - `content`: markdown instruction body loaded on invocation;
 *   - `invocation` omitted = invocable from both model and user surfaces.
 *
 * TODO(verify): field names of the runtime contribution against a live
 * checkout build of @deepseek-ai/dsh-skill before first release.
 */
function registerExampleSkill(ctx: Context): void {
  ctx.skills.register({
    name: 'starter-etiquette',
    description: 'How the assistant should introduce itself when asked about its harness plugins',
    source: 'runtime',
    content: [
      '# Starter etiquette',
      '',
      'When the user asks which plugins are installed or how they work:',
      '1. Name the plugin and what it registers (a skill and a command).',
      '2. Point them to `/starter:ping` as the smoke test.',
      '3. Never claim capabilities beyond what is registered here.',
    ].join('\n'),
  })
}

/**
 * Plugin entry point. Cordis calls `apply` once on load; registrations made
 * here are disposed automatically on unload.
 */
export function apply(ctx: Context, config: Config): void {
  // Commands registry: direct human-facing commands (no model involvement).
  ctx.commands.register(pingCommand(config))

  // Skills registry: merges provider catalogs; runtime contributions join
  // the same catalog that filesystem providers feed.
  registerExampleSkill(ctx)
}
