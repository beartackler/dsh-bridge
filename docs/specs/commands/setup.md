# /bridge-setup

Conversational, resumable first-run onboarding. Alias: `/bridge-onboard`.

Export: `runSetup(ctx, args, options?)` from `src/commands/setup.ts`.

## Why it exists

The product review's top finding is that there is no first-run path: a new user
gets a diagnosis in five minutes and a working setup in thirty, most of it hand
editing YAML. `/bridge-setup` is the front door that replaces that. It assumes
nothing: not that the user has a model connected, not that they have used a
harness before, not that they know what a route is.

## Shape

Seven steps. Each renders one screen, asks at most one question, states its
default, and accepts `skip`. Every invocation of the command renders exactly
one step; the answer supplied in the invocation applies to the step the user
was last shown.

| # | Step | Question | Default |
|---|------|----------|---------|
| 1 | welcome | Ready to start? | yes |
| 2 | harness | First coding harness, or coming from another one? | inferred from what is on disk |
| 3 | route | Which provider should the default route use? (or: have you got a key yet?) | the detected provider, else skip |
| 4 | health | Remind you to run `/bridge-doctor` at the end? | yes |
| 5 | import | Carry over both, mcp, memory, or neither? | both |
| 6 | recommend | What do you mostly work on? | skip |
| 7 | done | none | - |

Progress renders as `step N of 7` on every screen.

## Persistence

State lives at `~/.dsh-bridge/setup-state.json`, written with mode `0600` after
every transition:

```json
{
  "version": 1,
  "step": "import",
  "answers": {"welcome": "yes", "harness": "migrant", "route": "deepseek"},
  "skipped": ["health"],
  "startedAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:04:11.000Z"
}
```

`step` is the step awaiting an answer, so resuming is a load and a render.
Answers are keyed by the step that asked, which keeps the record readable and
makes the summary on step 7 a lookup rather than a parallel structure.

A missing, unreadable, malformed, or wrong-version file is not an error: the
flow starts over. A broken state file must never be the reason a first run
fails. A failed write is reported in the final screen rather than thrown, so a
read-only `$HOME` still gets a complete walkthrough.

`--reset` discards the file and starts at step 1.

## Step behavior

**2 - harness.** Reads the DSH version from the profile manifest and checks
whether the profile config exists, then looks for `~/.claude`, `~/.codex`, and
`~/.config/opencode`. The presence of any of them makes `migrant` the default
and changes the copy; their absence makes `first` the default and the copy
says so plainly. The question is asked either way, because a config directory
is evidence, not proof.

**3 - route.** Reuses `detectCredentials` from `/bridge-connect`, so detection
is identical to the command that will do the write. Two branches:

- Credentials found: shows the found rows, defines a route in one sentence,
  and offers `/bridge-connect apply <provider>` as a preview.
- Nothing found: this is the path a genuinely new user walks. It links
  `platform.deepseek.com`, gives the export line, and says that dsh-bridge
  writes the variable name into the profile config, never the key.

**5 - import.** Offers the two commands that already do the work,
`/bridge-mcp import` and `/bridge-memory import`, as previews. This step never
writes anything itself.

**6/7 - recommend.** The free-text answer is matched against the committed
catalog with the same matcher `/bridge-suggest` uses. Graded entries sort
ahead of ungraded ones, `F` is dropped, and each row shows plugin, grade,
one-line verdict, and the install command. When nothing matches, the screen
says so and points at `/bridge-suggest` rather than padding the list.

## Invariants

- Read-only, except the state file. No route write, no MCP write, no memory
  write happens here.
- No network calls.
- No credential value reaches the transcript; only `/bridge-connect`'s masked
  display strings are reused.
- No emoji.

## Registry

`runSetup` is exported for mounting under the name `bridge-setup` with alias
`bridge-onboard`. Registry wiring lives in `src/lib/registry.ts` and is not
part of this module.

## Tests

`test/setup-test.ts`, 28 cases: step table and transitions, state persistence
across separate invocations with a fresh io each time, fresh-start recovery
from four kinds of bad state file, resume mid-flow, `--reset`, skip on every
step, the first-harness and migrant branches, the no-credentials route path
including the assertion that a key value never appears, health findings,
import copy with and without a familiar harness, recommendation ordering and
`F` exclusion, and an emoji sweep over all seven rendered screens.
