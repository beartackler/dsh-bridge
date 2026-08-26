# Live mount report: dsh-bridge in a real DeepSeek Harness runtime

**Verdict: mounts (after two fixes, both applied).**

The plugin loads, registers all 17 `/bridge-*` commands into the real
`CommandRuntime`, accepts its `Config` schema from a patch layer, and installs
through the documented `dsh plugin add` path with no warning.

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm, published) |
| Kernel | `@deepseek-ai/cordis` 4.0.1 |
| Command host | `@deepseek-ai/dsh-commands` 0.1.1-rc.2 |
| Node | v26.0.0 |
| pnpm (bundled by `dsh plugin`) | 10.32.1 |
| Date verified | 2026-08-26 |
| Scratch install | `/tmp/dsh-live` |

## 1. Getting a runtime up

`npx` was unnecessary and a source clone was unnecessary. The harness is
published to npm, so a plain install is the whole recipe:

```sh
mkdir -p /tmp/dsh-live && cd /tmp/dsh-live
npm init -y
npm install @deepseek-ai/dsh@0.1.1-rc.2   # 455 packages, ~7 min
./node_modules/.bin/dsh --version         # 0.1.1-rc.2
```

Two notes for anyone repeating this:

- The install takes several minutes. It is not hung.
- Set `DSH_HOME` to a scratch path (`export DSH_HOME=/tmp/dsh-live/.dsh`) so
  the test profile never touches the developer's real `~/.dsh`.

No API key is needed. `dsh web` boots the server, mounts the full plugin tree,
and serves `http://127.0.0.1:3080` without any credential.

## 2. The two defects found, and the fixes

### Defect 1: empty input hint rejected at registration (fatal)

The first boot with our plugin failed the entire tree:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include
(cordis:include): failed to apply loader entry bridge (dsh-bridge):
command "bridge-status" input hint must not be empty
TypeError: command "bridge-status" input hint must not be empty
    at normalizeDefinition (@deepseek-ai/dsh-commands/lib/index.js:149:48)
    at Proxy.register (@deepseek-ai/dsh-commands/lib/index.js:254:23)
    at registerCommand (packages/dsh-bridge/dist/src/index.js:69:18)
```

This is a real host invariant, not a typing guess. From the live
`@deepseek-ai/dsh-commands/lib/index.js:147-149`:

```js
if (rawInput !== void 0) {
  if (typeof rawInput !== "object" || rawInput === null || !("hint" in rawInput) || typeof rawInput.hint !== "string")
    throw new TypeError(`command "${definition.name}" input hint must be a string`);
  if (rawInput.hint.trim().length === 0)
    throw new TypeError(`command "${definition.name}" input hint must not be empty`);
```

The rule: `input` is optional, but a *present* `input` must carry a non-blank
`hint`. A command taking no argument must omit the key entirely.

Our entry passed `input` unconditionally. `src/lib/registry.ts:161` gives
`/bridge-status` a `usage` of `""`, which our entry forwarded as
`input: { hint: "" }`.

**Fix applied** at `packages/dsh-bridge/src/index.ts:115-124` — omit `input`
when `usage` is blank:

```ts
const hint = command.usage.trim();
ctx.commands.register({
  name: command.name,
  description: command.summary,
  ...(hint === "" ? {} : { input: { hint } }),
  handler: /* ... */
});
```

One important consequence worth recording: a single bad registration does not
degrade gracefully. It aborts the whole harness boot, taking every unrelated
plugin down with it. Registration-time validation is a hard gate.

### Defect 2: no `dsh.bundle` manifest, so the package activated no layer

Installing via the documented command printed:

```
dsh: warning: dsh-bridge declares no dsh.bundle — installed as a plain
dependency, not a profile layer (a later update that gains one activates
it automatically)
```

Per the harness docs (`docs/user/develop/basic/publish.md:64`), a package
without `dsh.bundle` installs as a plain dependency and activates nothing. Our
package was, in effect, unmountable by the supported path. It only worked with
a hand-written `--patch` overlay.

**Fix applied** — added `packages/dsh-bridge/cordis.patch.yml`:

```yaml
- insert:
    - id: bridge
      name: dsh-bridge
```

and in `packages/dsh-bridge/package.json`: `"dsh": { "bundle": { "patch":
"./cordis.patch.yml" } }`, with `cordis.patch.yml` added to `files`.

The row's `name` is the package name, not a source path: bundle patch rows
resolve through Node module resolution (`publish.md:56`).

## 3. What the real Cordis/commands API confirmed about our assumptions

Our entry carried a local `declare module '@deepseek-ai/cordis'` augmentation
of `Context.commands` (`src/index.ts:38-58`), written from the source checkout
because the peer package was believed unimportable. Checked against the real
shipped typings at
`/tmp/dsh-live/node_modules/@deepseek-ai/dsh-commands/lib/types/index.d.ts`:

| Our assumption | Real API | Status |
|---|---|---|
| `Context.commands` service, injected as `'commands'` | `interface Context { commands: CommandRuntime }`, `export const name = "commands"` | correct |
| `register(definition)` | `register(definition: CommandDefinition): () => void` | correct; we ignore the returned disposer, which is fine because Cordis unwinds the effect on unload |
| `{ name, description, input?: { hint }, handler }` | identical | correct |
| Invocation `{ commandId, agent, rawInput, attachments, signal }` | identical | correct |
| Result `{ kind: 'success', text? } \| { kind: 'error', text }` | identical, plus optional `sourceEventSeq` on success | correct, superset available |
| — | `recordInput?: boolean` (log suppression) | available, unused, not needed yet |

The scaffolded shape was accurate. The one thing static typing could not have
caught is the runtime-only blank-hint invariant, which is exactly the class of
bug this exercise existed to find.

Follow-up worth doing (not a mount blocker): the real package **is** installable
(`@deepseek-ai/dsh-commands@0.1.1-rc.2` is on npm). The local augmentation at
`src/index.ts:38-58` can be deleted in favor of a devDependency plus
`import type { CommandDefinition } from '@deepseek-ai/dsh-commands'`. That
removes a hand-maintained copy of someone else's contract.

## 4. Evidence the mount actually works

A throwaway probe plugin was mounted alongside ours to interrogate the live
registry (`/tmp/dsh-live/probe/index.mjs`, ESM required: a `.js` file in a
`type: commonjs` directory fails with `SyntaxError: Unexpected token 'export'`).

Reading the registry immediately inside `apply()` returns only 1 command:
plugin load is concurrent, so a probe must wait. Polling at 8 seconds:

```
[probe:t8s] count=21
[probe:t8s] cmd: bridge-browse   | hint: [category] [next | prev | <page>] | find <query>
[probe:t8s] cmd: bridge-compact  | hint: [instructions] | status
[probe:t8s] cmd: bridge-connect  | hint: [test <provider>]
[probe:t8s] cmd: bridge-doctor   | hint: [--net] [--probe]
[probe:t8s] cmd: bridge-help     | hint: [command]
[probe:t8s] cmd: bridge-improve  | hint: [<path>] [--diff] [--limit <n>]
[probe:t8s] cmd: bridge-init     | hint: [--force]
[probe:t8s] cmd: bridge-install  | hint: <plugin | github:owner/repo> [--report] [--profile <name>]
[probe:t8s] cmd: bridge-mcp      | hint: [list | <server>]
[probe:t8s] cmd: bridge-memory   | hint: show | edit | add <note> | import-from [dir]
[probe:t8s] cmd: bridge-model    | hint: [<model>] | list
[probe:t8s] cmd: bridge-refactor | hint: [<path>]
[probe:t8s] cmd: bridge-resume   | hint: [--all] [--subagents] [<text>]
[probe:t8s] cmd: bridge-review   | hint: [<path>]
[probe:t8s] cmd: bridge-status   | hint: (none)
[probe:t8s] cmd: bridge-suggest  | hint: [<topic>]
[probe:t8s] cmd: bridge-trust    | hint: <plugin> | scan <directory> | list
[probe:t8s] cmd: export | feedback | goal | permission        (the four in-box commands)
```

All 17 `/bridge-*` commands are registered, our names coexist with the in-box
four, and `bridge-status` correctly carries no hint.

Handlers were then invoked through the real definitions returned by
`CommandRuntime.find()`:

```
[exec] /bridge-help       -> success: ### dsh-bridge commands / Usage: /bridge-help [command]
[exec] /bridge-status     -> success: ### dsh-bridge status
[exec] /bridge-doctor     -> success: ### /bridge-doctor / Active profile: default
[exec] /bridge-trust list -> success: ### Reviewed plugins | PLUGIN | GRADE |
```

Config plumbing was verified separately by overriding the row:

```yaml
- id: bridge
  name: dsh-bridge
  config:
    profile: web
```

`/bridge-doctor` then reported `Active profile: web` instead of `default`,
proving the Schemastery `Config` is parsed by the host and reaches `apply()`.

## 5. The working recipe

```sh
# 1. runtime
mkdir -p /tmp/dsh-live && cd /tmp/dsh-live && npm init -y
npm install @deepseek-ai/dsh
export DSH_HOME=/tmp/dsh-live/.dsh          # keep the real ~/.dsh untouched

# 2. build the plugin
cd /path/to/dsh-bridge/packages/dsh-bridge && npm install && npm run build

# 3. install it into a profile (works now that dsh.bundle exists)
cd /tmp/dsh-live
./node_modules/.bin/dsh plugin --profile web add link:/path/to/dsh-bridge/packages/dsh-bridge

# 4. confirm the layer without booting
./node_modules/.bin/dsh --profile web --dump-config | tail -5
#   # == dsh-bridge
#   - id: bridge
#     name: dsh-bridge

# 5. boot
./node_modules/.bin/dsh --profile web        # http://127.0.0.1:3080
```

After the fix, `dsh plugin add` writes the profile manifest correctly with no
warning:

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-bridge": "link:/path/to/dsh-bridge/packages/dsh-bridge"
  },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-bridge"
  ] } }
}
```

For the dev loop, `--patch ./cordis.yml` still works and avoids reinstalling.
Note the README's `pnpm dsh web --patch ./cordis.yml` form only applies inside
a harness source checkout; from an npm install the command is `dsh --profile
web --patch ./file.yml`.

## 6. Remaining blockers

None for mounting. Open items, none of which block the verdict:

1. `npm test` currently fails to compile, but only on files owned by other
   agents mid-edit (`src/commands/init.ts`, `src/commands/mcp.ts`,
   `src/commands/status.ts`, `test/status-test.ts`). The files changed here
   compile clean; the fix built and ran in the live runtime.
2. The local Cordis augmentation should be replaced with a real
   `@deepseek-ai/dsh-commands` devDependency import (section 3).
3. Publishing from git requires a `prepare` script that builds `dist/` and a
   user-side pnpm `allowBuilds` allowance (`publish.md:161-173`). Publishing a
   prebuilt tarball or npm package avoids asking users for install-time code
   execution, which is the posture this project should take given the charter's
   trust angle.
4. Command execution here went through `CommandRuntime.find()` plus a direct
   handler call. Full `execute()` dispatch, which also appends
   `command/run`/`command/done` session events, needs a real `Agent` and was
   not exercised.

## Files changed by this investigation

- `packages/dsh-bridge/src/index.ts:115-124` — omit `input` when `usage` is blank.
- `packages/dsh-bridge/cordis.patch.yml` — new; the bundle's patch layer.
- `packages/dsh-bridge/package.json` — added `dsh.bundle`, added the patch to `files`.

`src/lib/registry.ts` was read but not modified.
