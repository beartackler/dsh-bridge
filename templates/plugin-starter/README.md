# @dsh-bridge/plugin-starter

A grade-A starting point for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins. Ships one example **skill** and one example **slash command**, registered through the Cordis plugin API, with zero dependencies beyond the framework peers.

Clone this folder, rename the package, swap the examples for your own. The structure follows dsh-ponytail's proven plugin shape.

## What's inside

```
plugin-starter/
├── package.json              # peer deps only (@deepseek-ai/cordis + schemastery); no runtime deps, no scripts hooks
├── tsconfig.json             # strict NodeNext ESM
├── src/index.ts              # name / inject / Config schema / apply(ctx) with one skill + one command
├── cordis.yml.example        # local overlay to load the plugin into a harness checkout
└── .github/workflows/ci.yml  # typecheck + build gate
```

## Prerequisites

- Node.js >= 20
- A DeepSeek Harness checkout built via its run-from-source path (see that repo's README)

## Install

```sh
# 1. Get the template (from inside the dsh-bridge repo)
cp -r templates/plugin-starter my-plugin && cd my-plugin

# 2. Rename it
#    - package.json: "name", "description"
#    - src/index.ts: export const name = 'my-plugin'

# 3. Install peers and build
npm install          # resolves @deepseek-ai/cordis + schemastery peers
npx tsc              # emits dist/
```

## Verify

1. **Load into a live harness** using a Web overlay (per `docs/user/develop/basic/index.md`):

   ```sh
   cp cordis.yml.example cordis.yml
   # edit cordis.yml: set an absolute path to your built src/index.ts
   pnpm dsh web --patch ./cordis.yml     # from the harness checkout root
   ```

2. **Check the command**: open `http://127.0.0.1:3080`, type `/starter:ping` — you should get the starter greeting back immediately (no model round-trip).

3. **Check the skill**: ask the agent "which plugins are installed?" — the model should see `starter-etiquette` in its skill catalog and follow its instructions.

4. **Unload cleanly**: stop the web process; Cordis disposes every registration made through `ctx` automatically.

## API references

- Plugin shape (`name` / `inject` / `apply`): `docs/user/develop/basic/index.md` in the deepseek-harness repo
- Optional configuration via Schemastery: same doc tree, `config.md`
- Registration signatures cited inline in `src/index.ts`; spots marked `TODO(verify)` must be re-checked against a live checkout build before publishing

## Security

See [SECURITY.md](./SECURITY.md). This template registers no eval/dynamic code execution, no network calls, no lifecycle hooks beyond static registrations.
