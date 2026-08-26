# Spec: `/help` (alias `/bridge:help`)

> dsh-bridge command spec. See [CHARTER.md](../../../CHARTER.md). Research basis: [portable-features.md](../../research/portable-features.md) §1 #1 ("cheapest possible 'I'm home' signal") and §2 MVP item 1.

## Purpose

Give every refugee from Claude Code, Codex, OpenCode, or Jcode one command that answers *"what can I type here?"* in a format their fingers already expect. Nothing else in the plugin lands if discovery fails: `/help` is the canonical, grouped, one-screen index of all dsh-bridge commands, with one-line descriptions, examples, and pointers to the DSH-native commands we deliberately do not duplicate.

It must feel exactly like Claude Code's `/help`: terse lines, no marketing, no walls of prose.

## User story

> As a Claude Code user trying DSH for the first ten minutes, I type `/help`, recognize the shape of the output instantly, see that the commands I reflexively reach for exist (`/model`, `/resume`, `/compact`, …), spot the migration line for anything renamed, and stop feeling lost.

Secondary story: an experienced user half-remembers a bridge command (`was it `/mcp add` or `/bridge mcp add`?`) and runs `/help mcp` for the focused detail card.

## Trigger / aliases

| Trigger | Notes |
|---|---|
| `/help` | Primary. Bridge registers this only if no agent-layer command named `help` exists yet; otherwise fall back to the alias below and say so in onboarding. |
| `/bridge:help` | Namespaced alias. **Blocked on the naming decision**: the slash-command parser grammar is documented as letters/digits/`_`/`-`; whether `:` is legal in a command name is unverified. If illegal, ship `/bridge-help` instead (see Edge cases). |
| `/help <command>` | Subcommand form: focused detail card for one command, e.g. `/help model`. Bare name without leading `/` accepted; leading `/` tolerated and stripped. |

## Behavior

### Empty argument — full directory

1. Collect descriptors **live** from the DSH command/skill registries at invocation time (never a hardcoded copy): bridge-registered commands, plus any user markdown commands the bridge loaded into `ctx.skills`.
2. Group by task (groups below, fixed order), name-sorted within each group.
3. Render one line per command: `` /name <args?> `` left-padded, then a one-line description. Wrap long lines to terminal width; indent continuations under the description column.
4. Append a short "Native DSH commands" footer listing what we intentionally do *not* rebuild (`/compact`, `/theme`, `/config`, `/export`, `/plan`), so users don't conclude they're missing.
5. End with a hint line: `Run /help <command> for details and examples.`

### With a subcommand — detail card

`/help model` renders one command's card: usage line, aliases, one-paragraph behavior summary, 2–4 concrete examples, and "Related:" cross-links. Static content ships with the plugin; the registry is still consulted to confirm the command actually exists in this session.

### Grouping used by the full listing

- **Getting started:** `/init`, `/login`, `/doctor`
- **Model & permissions:** `/model`, permission-vocabulary mappings (`--dangerously-skip-permissions`, `--full-auto`, `--yolo`)
- **Sessions:** `/clear`, `/resume`
- **Memory & context:** `/memory`
- **Code quality:** `/review`
- **Plugins & integrations:** `/mcp`, `/bridge:install`
- **Help:** `/help`

## Output mockup (ascii)

```
$ /help

  dsh-bridge — familiar commands for DeepSeek Harness

  Getting started
    /init                 Scan the repo and generate AGENTS.md
    /login                Guided provider setup: detect credentials, pick routes, smoke-test
    /doctor               Verify the install: auth reachable, model responding, MCP up

  Model & permissions
    /model [name]         Show current model or switch (e.g. /model sonnet, /model deepseek-chat)
    /permissions          Map your old flags onto DSH presets (--dangerously-skip-permissions, --yolo)

  Sessions
    /clear                Reset the conversation, keep the session
    /resume               Pick a past session from a recent-first list

  Memory & context
    /memory               View or edit instruction files (AGENTS.md chain); '#' quick-add

  Code quality
    /review               Structured review of the working diff, findings cited as file:line

  Plugins & integrations
    /mcp                  List, add, remove, or test MCP servers without hand-editing cordis.yml
    /bridge:install <p>   Install a vetted plugin with its trust report card

  Native DSH commands (kept, not replaced)
    /compact /theme /config /export /plan

  Run /help <command> for details and examples.
```

```
$ /help resume

/resume — pick up where you left off

  Usage:    /resume [query]
  Aliases:  none (CLI flag parity: --continue resumes the most recent session)

  Shows your past sessions most-recent-first with title, working
  directory, and age. Enter selects and restores. A query filters
  the list before you arrow through it.

  Examples:
    /resume                    open the picker
    /resume dsh-bridge         pre-filtered to sessions mentioning "dsh-bridge"

  Related: /clear, --continue
```

## Edge cases

1. **Alias legality unknown.** Whether `:` parses in a command name is an open question flagged in the research. Decision gate for this spec: if illegal, primary stays `/help`, alias becomes `/bridge-help`, and the change is noted in README + `/help`'s own card. Never register both spellings blindly — duplicate names within one registry layer throw at registration time.
2. **Native `/help` collision.** If DSH (or another loaded plugin) already exposes `help`, the registry fails loudly on duplicates within a layer. Detect first, defer to native, and route our content through the alias. Shadowing across layers is legal (nearest-layer-wins) but reserved for the alias case only.
3. **Unknown subcommand.** `/help modle` prints `No such command 'modle'. Did you mean '/model'?` using prefix/edit-distance over live descriptors, then re-shows the group header containing the best match. Exit gracefully; never dump a stack trace.
4. **Dynamic command set.** Other plugins load/unload mid-session. The listing is computed at render time; a command that vanished since last render simply stops appearing.
5. **Narrow terminals / no TTY color.** Description column wraps with hanging indent; output is plain text with no ANSI when not a TTY. Must survive being piped into `less`.
6. **Custom markdown commands.** Commands the bridge imported from `.claude/commands/*.md` appear under a final "Your commands" group using their frontmatter `description`; missing frontmatter falls back to the first line of the body, truncated to the same column width.
7. **Secret hygiene.** Help output is static text and live names only. It never interpolates credential state, paths with usernames beyond what DSH already shows, or provider fingerprints. (Pairs with the connectors rule: `describe()`, never values.)
8. **i18n-ready.** All strings come from one message table keyed by group/command id; English ships first, structure ready for locales.

## Implementation notes — DSH skill / slash-command seam

Per the DSH authoring guide (`/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness/docs/user/develop/basic/index.md`):

- A DSH plugin is a TypeScript module exporting `apply(ctx)`; the framework passes a Cordis `Context` through which all capabilities are registered, and everything registered via `ctx` is cleaned up automatically on unload — so `/help` needs no manual listener teardown. Declare consumed services in `inject = [...]`; the loader waits for them before `apply` runs.
- Registration is configuration-over-code: the plugin is inserted into the profile via a `cordis.yml` / patch overlay (`insert:` with an absolute module path), started with `pnpm dsh web --patch ...`. The spec's deliverable therefore includes the overlay snippet, not just the handler.
- The handler reads descriptors from the command registry (`ctx.commands.list(...)`, backed by `packages/interaction/commands`) rather than keeping its own table, and merges in skill contributions from `ctx.skills` (per `packages/skill/*`) so imported `.claude/commands` markdown shows up in the same listing.
- Rendering targets the web client's command surface (`packages/client/ui-commands` supports popup/leadingInput contributions); the ascii mockup defines content and ordering, while exact presentation follows DSH UI conventions and BRAND_GUIDELINES.md.
- Items marked *(verify)* above mirror the research log: `:` legality in command names, native `help` existence, and whether `list()` needs an agent argument. Verify against the reference checkout before implementation; this spec does not hardcode assumptions it hasn't confirmed.

## Acceptance criteria checklist

- [ ] `/help` with no args renders all bridge commands, grouped per this spec, name-sorted within groups, each with a one-line description.
- [ ] Listing is generated from live registry/skill descriptors; adding or removing another plugin's command changes the next render.
- [ ] Footer distinguishes native DSH commands kept as-is.
- [ ] `/help <command>` renders the detail card (usage, aliases, examples, related) for every listed command; every command's card exists — no dead links in "Related".
- [ ] Unknown subcommand produces a did-you-mean suggestion and no traceback.
- [ ] Alias strategy resolved and matches the verified parser grammar (`/bridge:help` or documented `/bridge-help` fallback); no duplicate-name registration crash.
- [ ] Output wraps correctly at 80 columns, hangs indents, and degrades to plain ASCII with no ANSI codes off-TTY.
- [ ] No secrets, credential values, or fingerprint data appear in any help output.
- [ ] Strings sourced from the message table (i18n-ready); English copy proofread to Claude Code's terse register.
- [ ] Overlay snippet in `cordis.yml` form included; plugin loads via `pnpm dsh web --patch` with zero errors and auto-cleanup verified on unload.
