# Getting started

The honest full walkthrough: from a machine with nothing installed to a booted
DeepSeek Harness with dsh-bridge mounted and a model answering.

If you want the short version, run the installer and skip to
[Connect a model](#connect-a-model):

```bash
node scripts/install.mjs
```

Everything below is what that script does, written out, plus the parts it
cannot do for you.

---

## Prerequisites

| Requirement | Why | Check |
|---|---|---|
| Node 22 or newer | The harness runtime targets it | `node --version` |
| pnpm 10 or newer | `dsh plugin` manages profile dependencies through it | `pnpm --version` |
| A provider endpoint and API key | DSH ships no model. Nothing answers until you connect one | you supply it |

To install pnpm: `corepack enable && corepack prepare pnpm@latest --activate`.

DSH itself does not need to be installed first. The installer installs it if it
is missing, and uses the one on your PATH if it is not.

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
- **The composer is locked to "Choose a workspace to start."** Pick a workspace
  and it unlocks.

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
| "Choose workspace" does nothing in a browser | The auto picker chose the native backend, which opens a dialog on the *server's* display. A hard stop for remote `dsh web`. See the fix below |
| Command output renders as truncated one-line chips of raw markdown | The harness renders `command/done` text unformatted. In-box commands render the same way |
| `/bridge-doctor` reports DEGRADED for a `default` profile you never used | The plugin defaults its profile name rather than deriving it. Ignore the hint to install into `default` |
| `/bridge-status` shows MODEL/BRIDGE/TOKENS unavailable | Those seams are declared but not yet populated |
| `/bridge-browse` says the catalog is unavailable | The published package omits `docs/catalog/manifest.json` |

Fix for the workspace picker, in `$DSH_HOME/profiles/web/cordis.patch.yml`:

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
