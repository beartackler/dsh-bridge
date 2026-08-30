# create-dsh-bridge

One command to get [DeepSeek Harness](https://github.com/beartackler/dsh-bridge) running with the
`dsh-bridge` plugin mounted: familiar slash commands, a connectors flow, and an audited plugin
catalog.

```sh
npx create-dsh-bridge
```

## What it does

The installer it runs is idempotent. Every step checks for its own result first, so re-running a
partial install is safe.

1. Checks that Node is 22 or newer and that pnpm is available.
2. Installs the DSH runtime into `~/.dsh-bridge/runtime` if no `dsh` is on your PATH.
3. Creates an isolated `DSH_HOME` so your existing harness state is untouched.
4. Installs the `dsh-bridge` plugin into a DSH profile (default: `web`).
5. Prints the boot command.

## What it does not do

- **It does not connect a model.** No API keys are read, requested, or written. After boot, run
  `/bridge-setup` in the UI to attach a provider.
- It does not modify your real `~/.dsh` unless you pass `--no-isolate`.
- It does not create a project directory. Despite the `create-` name (an npm convention for
  `npx`-first tools), this installs a runtime, not a scaffold.

## Options

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print every command and file write, change nothing |
| `--ref <sha>` | Pin the installer and the plugin to a git ref |
| `--profile <name>` | Install into a profile other than `web` |
| `--no-isolate` | Use your real `~/.dsh` instead of an isolated scratch home |
| `--help` | Show usage |

Unrecognized flags are passed through to the installer, which rejects unknown options.

## Security note: this package fetches code at run time

This package is a thin launcher. It is roughly 100 lines and has no dependencies. On each run it:

1. Fetches `scripts/install.mjs` from
   `https://raw.githubusercontent.com/beartackler/dsh-bridge/<ref>/scripts/install.mjs`,
   defaulting to `main`.
2. Prints the exact URL it fetched to stderr before running anything.
3. Refuses to execute the file if it does not identify itself as the dsh-bridge installer.
4. Writes it to a fresh temp directory with mode `0600` and runs it with your arguments.

This means **the code that actually runs is not the code in this npm tarball.** That is deliberate:
the installer tracks the harness, and a stale copy frozen in a published tarball is how people end
up debugging last month's bug. The tradeoff is that you are trusting the repo's `main` at the moment
you run it.

### How to pin

Pass a commit SHA or tag. It pins both the installer that is fetched and the plugin ref the
installer checks out:

```sh
npx create-dsh-bridge --ref 2b55fae
```

### How to inspect before running

Read the installer first, then run it directly and skip this launcher entirely:

```sh
curl -fsSL https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs -o install.mjs
less install.mjs
node install.mjs --dry-run
node install.mjs
```

Or see the plan without any writes:

```sh
npx create-dsh-bridge --dry-run
```

## Requirements

Node 22 or newer. pnpm on your PATH.

## License

MIT
