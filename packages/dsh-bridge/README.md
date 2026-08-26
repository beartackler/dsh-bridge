# dsh-bridge plugin package

The DSH plugin behind the dsh-bridge project: familiar-face slash commands
(`/bridge-help`, `/bridge-connect`, ...), the connectors flow, and the trust-layer
integration, delivered as one Cordis plugin for DeepSeek Harness.

See `CHARTER.md` at the repo root for mission and non-negotiables,
`docs/research/dsh-capability-seams.md` for every DSH API this package touches,
and `docs/specs/commands/*.md` for per-command behavior.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Plugin entry (`name`, `inject`, `Config`, `apply`). Registers the command surface; each command module mounts at a marked slot. |
| `src/lib/types.ts` | Shared interfaces: `BridgeCommand`, `CommandResult`, `BridgeContext`. No global state; the context is injected. |
| `src/lib/output.ts` | Markdown helpers: tables, key-value cards, text severity badges. ASCII only, no emoji. |
| `src/lib/paths.ts` | Credential/config path constants from the `/connect` detection matrix. Existence and shape checks return metadata only, never secret contents. |
| `src/lib/scan-client.ts` | Typed wrapper that spawns `tools/scan` (Node subprocess) and parses its JSON verdict into typed findings. |
| `src/lib/registry.ts` | Phase-1 command descriptor table with typed stubs. |
| `test/self-test.ts` | `node:test` suite covering each module's basic contracts. |

## Build

```sh
npm install        # devDependencies only: typescript, @types/node, peer packages
npm run build      # tsc -> dist/
```

Peer dependencies `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` are also
declared as devDependencies so type-checking works in-repo while staying
peer-only for consumers.

## Test

```sh
npm test           # builds, then runs node --test dist/test/self-test.js
```

The scan-client tests spawn the compiled scanner at `tools/scan/dist/index.js`.
Build it first if it is missing:

```sh
cd ../../tools/scan && npm install && npm run build && cd ../../packages/dsh-bridge
```

Without the scanner build, those tests skip; everything else still runs.

## Run inside DSH (dev loop)

From an npm install of the harness, overlay-mount this package by path:

```sh
dsh --profile web --patch ./cordis.yml
```

Inside a harness source checkout the pnpm-script form (`pnpm dsh web --patch ...`) applies instead. For the user-facing install path see the repo root README: the repository ships built artifacts at its root manifest, so `dsh plugin --profile web add github:beartackler/dsh-bridge` needs no local build.

## Conventions this package enforces

- Command names are `[a-z][a-z0-9_-]*`: the namespace is `/bridge-*`.
  `/bridge:install` is not parseable by the DSH slash-command grammar and is
  never registered.
- Every unverified DSH API touchpoint carries a
  `// VERIFY(<seams-doc-section>)` comment and a typed stub instead of a guess.
- No function in `src/lib/paths.ts` returns file contents; probes return
  existence, size, mode, and shape verdicts only. Secrets never enter this
  package (connect spec invariants S1/S3/S12/S13).
- No emoji anywhere in source, tests, or output.
