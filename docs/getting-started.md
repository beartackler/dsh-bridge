# Getting started

From a machine with nothing installed to a booted DeepSeek Harness with
dsh-bridge mounted and a model answering. Every friction below was hit in a real
run and is recorded rather than smoothed over.

## The short version

```bash
curl -fsSLO https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs
node install.mjs --dry-run     # prints every command and file write, changes nothing
node install.mjs
```

That covers sections 1, 2, 3, 4, and 6 below, and it pins the in-browser
workspace picker so the "Choose workspace" button works. It does not cover
section 5, connecting a model, which is the part that requires your endpoint and
your key. Skip to [Connect a model](#5-connect-a-model).

Sections 1 through 4 and 6 are written out anyway, because the installer is a
convenience and not a dependency: everything it does you can do by hand, and
knowing what it did is the difference between fixing a broken install and
reinstalling it.

## Prerequisites

Three the installer handles for you, and one it cannot.

| Requirement | Why | Check |
|---|---|---|
| Node 22 or newer | The harness runtime targets it | `node --version` |
| pnpm 10 or newer | `dsh plugin` manages profile dependencies through it | `pnpm --version` |
| DSH installed | Nothing to mount the plugin into | `dsh --version` |
| A provider endpoint and API key | DSH ships no model. Nothing answers a prompt until you connect one | you supply it |

To install pnpm: `corepack enable && corepack prepare pnpm@latest --activate`.

DSH does not need to be installed before you start. The installer installs it if
it is missing and uses the one on your PATH if it is not. A model route is the
one prerequisite nobody can satisfy on your behalf: **DSH installed and a model
connected are two separate requirements**, and a harness that boots cleanly with
no route will still answer nothing.

---

## 1. Install the runtime

```bash
mkdir -p ~/.dsh-bridge/runtime && cd ~/.dsh-bridge/runtime
npm init -y
npm install @deepseek-ai/dsh
```

This takes several minutes and prints almost nothing while it works. It is not
hung. Measured at 373 seconds on a clean cache
([journey F8](research/e2e-onboarding-journey.md)).

## 2. Isolate your harness home

```bash
export DSH_HOME=~/.dsh-bridge/runtime/dshhome
```

Nothing in the harness's own output suggests this. Skipping it means every
experiment mutates your real `~/.dsh`. Do it before the first `dsh` invocation,
and put it in the shell you will boot from.

## 3. Seed the profile

```bash
./node_modules/.bin/dsh --profile web --dump-config > /dev/null
```

This creates `$DSH_HOME/profiles/web/`, which the next steps write into.

## 4. Create the credentials file at mode 600

```bash
install -m 600 /dev/null "$DSH_HOME/.credentials.yaml"
```

The harness refuses to boot if this file is readable beyond its owner:

```
Error: credentials-local: .credentials.yaml is readable beyond its owner
(mode 644); run "chmod 600 ..." before starting again
```

A default umask of 022 makes mode 644 the guaranteed outcome of creating this
file with a plain redirect, so every user hits this once
([journey F7](research/e2e-onboarding-journey.md)). Create it at 600 up front.

## 5. Connect a model

DSH ships no model route. This is the single largest piece of setup, and until
`/bridge-setup` writes it for you, it is hand-written YAML.

### If your provider is one pi-ai already ships

Set the key in `$DSH_HOME/.credentials.yaml` and select the provider in
`$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: agent-default-model
  config:
    provider: <provider-id>
    model: <model-id>
```

### If your provider is a custom OpenAI-compatible endpoint

This is the case with no user-facing documentation upstream; the only working
example lives in a `.d.ts` module comment
([journey F3](research/e2e-onboarding-journey.md)). Here is a configuration
verified against a live endpoint.

`$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: llm-pi-ai
  config:
    providers:
      opencode-zen:
        displayName: OpenCode Zen
        apiKeyEnv: OPENCODE_ZEN_API_KEY
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
        models:
          - id: qwen3.5-plus
            name: Qwen 3.5 Plus
            contextWindow: 262144
            maxTokens: 32768
- id: agent-default-model
  config:
    provider: opencode-zen
    model: qwen3.5-plus
```

`$DSH_HOME/.credentials.yaml` (mode 600):

```yaml
OPENCODE_ZEN_API_KEY: sk-...
```

Three facts that each silently break the route if you miss them:

1. **`api`, `baseURL`, and `models` are jointly required** for any route pi-ai
   does not already ship. A partial block fails without a useful message.
2. **The route key must be repeated in `agent-default-model`.** Declaring a
   provider does not select it. Half a route is silent failure.
3. **`apiKeyEnv` is a credential reference name, not a shell variable.** It
   resolves through the credentials seam; the variable need not exist in your
   shell.

### Find the model ids your endpoint actually serves

Do not guess. Ask:

```bash
curl -s https://<your-endpoint>/models -H "Authorization: Bearer $KEY" | jq -r '.data[].id'
```

In the reference run, the model id given in the assignment was rejected outright
(`ModelError: Model ... is not supported`) and two plausible alternatives failed
with a region error. One `GET /v1/models` resolves in seconds what otherwise
costs an hour.

### Smoke-test the route before you boot

A wrong model id, a wrong base URL, and a wrong key all fail the same way inside
the UI: the prompt goes nowhere. Confirm the endpoint answers first, outside the
harness, so a later failure is unambiguously the harness's:

```bash
curl -s https://<your-endpoint>/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"model":"<model-id>","messages":[{"role":"user","content":"say OK"}]}'
```

A completion body means the three values in your patch are right. An error body
names which one is wrong. If this fails, no amount of editing YAML will help.

### The two files, complete

After section 5 you have exactly two hand-edited files. Nothing else in
`$DSH_HOME` is yours to edit.

```
$DSH_HOME/.credentials.yaml               mode 600, one key per line
$DSH_HOME/profiles/web/cordis.patch.yml   the provider block and the selection
```

Check the mode before booting, because an editor that writes through a temp file
can reset it:

```bash
stat -f '%Lp %N' "$DSH_HOME/.credentials.yaml"   # want: 600
```

## 6. Install dsh-bridge

```bash
./node_modules/.bin/dsh plugin --profile web add github:beartackler/dsh-bridge
```

Pin a commit so a later push cannot change what runs:

```bash
./node_modules/.bin/dsh plugin --profile web add "github:beartackler/dsh-bridge#<commit-sha>"
```

The repository ships its compiled `dist/`, so nothing builds on your machine and
dsh asks for no build-script permission.

## 7. Boot

```bash
./node_modules/.bin/dsh --profile web        # http://127.0.0.1:3080
```

Boot to serving takes roughly 25 seconds. Add `--no-open` to keep it from
launching a browser.

## 8. First load

Two things happen on first load that are not failures:

- **An internal-testing modal covers the composer.** Click Continue once; the
  dismissal persists.
- **The composer is locked to "Choose a workspace to start."** Press "Choose
  workspace". If you installed with `scripts/install.mjs`, the directory list
  renders inside the page and no dialog opens on the machine running the
  harness; pick a directory and the composer unlocks.
- **The harness may offer its own "Add an API key" modal.** That is DeepSeek's
  key path, not dsh-bridge's. Press "Configure later" to stay on the route you
  configured in section 5.

If you installed by hand and the "Choose workspace" click does nothing, you are
hitting the native picker; see [Known rough edges](#known-rough-edges).

## 9. Use the commands

Type `/bridge` to open the slash menu: all 17 commands with descriptions. Start
with `/bridge-setup` for guided onboarding, or `/bridge-help` for the full map.

Submitting a slash command takes **two Enter presses**: the first accepts the
autocomplete highlight, the second submits.

---

## Known rough edges

These are real and current. They are listed here so you can recognise them
rather than debug them.

| What you see | What it is |
|---|---|
| "Choose workspace" does nothing in a browser | Hand installs only. The auto picker chose the native backend, which opens a dialog on the *server's* display. `scripts/install.mjs` pins the browse pair and prevents this; see the fix below |
| Command output renders as truncated one-line chips of raw markdown | The harness renders `command/done` text unformatted. In-box commands render the same way |
| `/bridge-doctor` reports DEGRADED for a `default` profile you never used | The plugin defaults its profile name rather than deriving it. The installer writes the `- id: bridge` / `config.profile` block that fixes this; if you installed by hand, add it yourself (see below) |
| `/bridge-status` shows MODEL/BRIDGE/TOKENS unavailable | Those seams are declared but not yet populated |
| `/bridge-browse` says the catalog is unavailable | The published package omits `docs/catalog/manifest.json` |

Fix for the workspace picker, in `$DSH_HOME/profiles/web/cordis.patch.yml`. The
installer writes this block for you; add it by hand if you installed by hand:

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

Both faces must be named: the backend and the client surface. Reboot after.

The stock profile mounts `@deepseek-ai/dsh-host-directory-picker-auto`, which
samples the host once at boot and picks `native` whenever the bind host is
`127.0.0.1` on macOS or Windows. The native backend opens an OS dialog on the
server's display, so a browser anywhere else sees the click land and nothing
change. The browse pair renders the listing in the page instead and works on
every platform, local or remote, which is why the installer pins it
unconditionally. To go back to the adaptive row, delete the block and reboot;
the installer will not re-add it while any `directory-picker` row is present.

Fix for the DEGRADED doctor report, in the same file. The installer writes this;
add it by hand if you installed by hand:

```yaml
- id: bridge
  config:
    profile: web
```

Use the profile name you actually installed into. Without it the plugin reports
health for a `default` profile that does not exist.

## Verifying that a command actually ran

If output looks like it failed, check the durable session log rather than the
UI:

```bash
ls "$DSH_HOME"/sessions/*/session-*/session.jsonl.zstd
```

Decompress and look for `command/run` and `command/done` pairs. In the reference
run, three of four commands looked like failures in the UI and all four had
returned `kind: "success"`.

---

## Where these findings come from

Every friction above was reproduced in a single live run against
`@deepseek-ai/dsh` 0.1.1-rc.2 with a real model answering. Full evidence,
including screenshots and file-and-line causes:
[docs/research/e2e-onboarding-journey.md](research/e2e-onboarding-journey.md).
