# Plugin Author Guide

> How to build a DeepSeek Harness plugin that earns a **Grade A** trust report card and a place in the dsh-bridge verified catalog.

This guide serves two audiences at once:

1. **You already have a plugin** and want it featured in our English-first catalog. Skip to [Safety rules that earn Grade A](#safety-rules-that-earn-grade-a) and [Submitting to the catalog](#submitting-to-the-catalog).
2. **You want to build one**, possibly through dsh-bridge's *suggested-build* flow, where the installer offers to scaffold a plugin instead of installing an unvetted one. Start at [Plugin anatomy](#plugin-anatomy).

Everything below cites the upstream Harness documentation by path so you can verify each claim yourself. Reference checkout used throughout: `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (master).

---

## Table of contents

- [Why the catalog exists](#why-the-catalog-exists)
- [Plugin anatomy](#plugin-anatomy)
  - [The `apply` contract](#the-apply-contract)
  - [Declaring dependencies with `inject`](#declaring-dependencies-with-inject)
  - [Cleanup is not your job (mostly)](#cleanup-is-not-your-job-mostly)
  - [Registering a tool](#registering-a-tool)
  - [Accepting configuration](#accepting-configuration)
- [Packaging](#packaging)
  - [Bundle vs. profile](#bundle-vs-profile)
  - [The bundle manifest](#the-bundle-manifest)
  - [Peer dependencies](#peer-dependencies)
  - [Shipping built artifacts (the GitHub build-script catch)](#shipping-built-artifacts-the-github-build-script-catch)
  - [Provenance](#provenance)
- [Safety rules that earn Grade A](#safety-rules-that-earn-grade-a)
- [The suggested-build flow](#the-suggested-build-flow)
- [Submitting to the catalog](#submitting-to-the-catalog)
- [Template repository](#template-repository)
- [Checklist](#checklist)

---

## Why the catalog exists

DSH plugins are arbitrary code that runs inside the user's agent, with the user's credentials, on the user's machine. Installing one from a git host is, quite literally, permission to execute a stranger's code — upstream says so plainly:

> "Treat that allowance as what it is: **permission to execute the package's code on your machine at install time**, outside any sandbox the agent runs under."
> — `docs/user/develop/basic/publish.md:173`

The dsh-bridge catalog closes that gap. Every listed plugin passes an adversarial static + behavioral review, and every verdict ships as a public **trust report card** with `file:line` evidence. We never claim a plugin is safe; we show what we found and let the evidence carry the claim. That is the project's first principle ([`CHARTER.md`](../CHARTER.md), "Trust over speed").

Your side of the bargain is to write a plugin whose safety is *cheap to prove*. The rest of this guide is mostly about that.

---

## Plugin anatomy

### The `apply` contract

A Harness plugin is a TypeScript (or JavaScript) module exporting an `apply` function. The framework calls it at load time and hands you a `ctx` context through which you register capabilities (`docs/user/develop/basic/index.md:17-27`):

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

That is the whole contract. Two other forms exist — object form and class form (`docs/user/develop/basic/index.md:105-138`). Use **function form** by default; reach for class form (`extends Service`) only when your plugin *provides* a service other plugins consume.

Catalog note: we prefer a single named export surface per module. Plugins that build their `apply` dynamically, or export a factory whose behavior depends on runtime-fetched data, are hard to audit and start at Grade B.

### Declaring dependencies with `inject`

If you consume another service (`tools`, `llm`, `commands`, `credentials`, …), declare it (`docs/user/develop/basic/index.md:88-103`):

```ts
export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is guaranteed ready here.
  ctx.tools.register(/* ... */)
}
```

The framework waits for every required service before loading your plugin, so defensive `if (!ctx.tools) return` guards are noise. Declaring `inject` honestly is also an audit signal: an undeclared reach into `ctx.credentials` is exactly the kind of thing our review flags.

### Cleanup is not your job (mostly)

Anything registered through `ctx` — listeners, tools, timers — is disposed automatically on unload (`docs/user/develop/basic/index.md:66-68`). For resources the framework cannot see, such as a socket, return a disposer from `ctx.effect()` (`docs/user/develop/basic/index.md:70-85`):

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => console.log('heartbeat'), 5000)
    return () => clearInterval(timer)   // runs on unload
  })
}
```

Leaked resources across a hot-reload are a **quality** failure, not a safety one, but they still block Grade A: a plugin that keeps a network connection alive after being disabled is behaviorally indistinguishable from one that ignores an uninstall.

### Registering a tool

Tools are the most common capability. The DSL is `defineTool` from `@deepseek-ai/dsh-tools` (`docs/user/develop/basic/tool.md:11-33`):

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`defineTool` infers and validates `args` from `parameters`; `execute` returns the canonical value declared by `output.schema`, and `output.render` converts that value into model-facing content (`docs/user/develop/basic/tool.md:36`). Nested schemas, background work, policy hooks, Code Mode, and UI cards are covered in the tool authoring reference (`docs/cookbook/adding-a-tool.md`), linked from `docs/user/develop/basic/tool.md:51`.

Write descriptions for the *model*, not for a changelog. A vague `description` is the number one reason a functionally correct tool feels broken in practice.

### Accepting configuration

Export a `Config` type and a same-named Schemastery schema with defaults on the fields (`docs/user/develop/basic/config.md:9-32`):

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  maxRetries: number
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)
}
```

Do not export a plain object as `Config`; it does not implement the Standard Schema interface Cordis requires (`docs/user/develop/basic/config.md:45`).

Two upstream design principles the catalog enforces:

- **Do not hardcode tunable values.** "Anything that two deployments may want to set differently" must be a configuration field; the test is whether `cordis.yml` can change it without a code edit (`docs/user/develop/basic/config.md:78-92`).
- **Fail loudly on invalid configuration.** Express self-contained constraints in the schema so a bad config fails at load with an actionable error (`docs/user/develop/basic/config.md:94-96`).

For us there is a third, security-flavored reason: **every endpoint your plugin talks to must be a schema field with a visible default.** A URL that only exists inside a string literal deep in `execute()` is an undeclared network egress, and undeclared egress caps you at Grade C.

---

## Packaging

### Bundle vs. profile

Installation rests on two concepts, both described by a `package.json` but carrying different manifests under the `dsh` key (`docs/user/develop/basic/publish.md:11-16`):

- A **bundle** is an npm package shipping a configuration layer. Its manifest declares `dsh.bundle` — "what does this package contribute?"
- A **profile** is a directory under `$DSH_HOME/profiles/<name>` describing one runnable composition. Its manifest declares `dsh.profile` — "which bundles compose this setup, in what order?"

You author and distribute a **bundle**. The user boots a **profile**. Nothing is both. You never hand-write a profile manifest; `dsh plugin` maintains it (`docs/user/develop/basic/publish.md:73`).

### The bundle manifest

Minimum shape (`docs/user/develop/basic/publish.md:26-62`):

```
my-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

```json
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
- insert:
    - id: my-plugin
      name: dsh-my-plugin
```

Patch rows reference the package **by name**, not by relative path, so Node resolution finds the installed code (`docs/user/develop/basic/publish.md:56`). A package without `dsh.bundle` still installs, but only as a plain dependency: `dsh plugin` warns and activates no layer (`docs/user/develop/basic/publish.md:64`).

Two consequences of the layer order (`docs/user/develop/basic/publish.md:112-128`) matter to you:

- Later layers win *per row*, and a patch replaces a row's entire `config` rather than deep-merging. If you override another bundle's row by `id`, restate every key that row needs.
- Users can override your rows in their own `cordis.patch.yml` without touching your package. Prefer defaults users will keep, and let the schema carry the rest.

**Keep your patch minimal.** One `insert` row per capability you actually ship. A bundle that quietly overrides `dsh-base` rows is an escalation of privilege in patch clothing, and our review reads every line of `cordis.patch.yml`.

### Peer dependencies

Declare the framework packages as **peer dependencies**, never as regular dependencies:

```json
{
  "peerDependencies": {
    "@deepseek-ai/cordis": "*",
    "@deepseek-ai/schemastery": "*"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "*",
    "@deepseek-ai/schemastery": "*"
  }
}
```

This is the pattern proven by **dsh-ponytail** (see `CHARTER.md:54`): peer deps on `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`, with the same packages in `devDependencies` so local builds and type-checking work. Bundling a second copy of Cordis into your package produces two kernels, two service registries, and a plugin that silently fails to see `ctx.tools`. In-box bundle names always resolve from the dsh installation itself; pnpm manages only out-of-tree packages, so you can rely on `@deepseek-ai/dsh-base` being present and current (`docs/user/develop/basic/publish.md:128`).

Rule of thumb: **anything the harness already provides is a peer dependency. Anything else you must justify.** Each runtime dependency is transitive attack surface we have to review, and a fat dependency tree is the most common reason an otherwise clean plugin lands at Grade B.

### Shipping built artifacts (the GitHub build-script catch)

A git install fetches **sources, not built artifacts** — nothing runs your `build` script, so a TypeScript package arrives without its `lib/` output and fails to load (`docs/user/develop/basic/publish.md:161`). Upstream describes two sides of the fix:

- **The author** ships a self-contained `prepare` script that pnpm runs after a git install, building published entry points from source without assuming a sibling monorepo checkout. `turtle-ui` is the working example: its `prepare` runs a dedicated tsdown config that transpiles `src/` without project references or type checking (`docs/user/develop/basic/publish.md:163`).
- **The user** allowlists the build in the profile's `pnpm-workspace.yaml` under `allowBuilds` — because pnpm ≥10 refuses to run a git dependency's `prepare` until explicitly allowed (`docs/user/develop/basic/publish.md:164-171`).

**The catalog's strong preference is that users never have to grant that allowance.** Distribute prebuilt code instead (`docs/user/develop/basic/publish.md:175-178`):

- **Publish to npm** with `lib/` built at `pnpm publish` time → `dsh plugin add your-package`.
- **Ship a tarball** from `pnpm pack` → `dsh plugin add ./my-plugin-0.1.0.tgz`.

If you must support git installs, document the exact `allowBuilds` key and tell users to pin a commit — `github:you/my-plugin#<sha>` — so a later push cannot silently change what runs (`docs/user/develop/basic/publish.md:173`). Catalog entries that only offer an unpinned git install are listed with a visible warning.

### Provenance

Grade A requires that a user can answer "what code am I actually running, and who wrote it?" without cloning anything:

| Requirement | What we check |
|---|---|
| **Public source** | Repository URL in `package.json` (`repository`, `homepage`, `bugs`), reachable and matching the published package. |
| **Tagged releases** | Every published version has a corresponding git tag. Untagged npm publishes are unverifiable by definition. |
| **npm provenance** | Publish from CI with `npm publish --provenance` (or `pnpm publish --provenance`) so npm records the build's source commit and workflow. |
| **Immutable install target** | A version-pinned npm install, a tarball checksum, or a commit-pinned git ref. Never a bare branch. |
| **`LICENSE`** | Present, OSI-recognized. If you ported code, keep upstream attribution — the dsh-ponytail ports are the pattern (upstream MIT attribution preserved; `CHARTER.md:33`). |
| **`SECURITY.md`** | Present, with a contact address and a disclosure window. Expected of every bundle (`CHARTER.md:54`). |
| **Changelog** | Human-readable, per release. Silent behavior changes between versions are a trust failure even when harmless. |

We record the exact resolved version and integrity hash we audited on the trust report card. If your published artifact changes without a version bump, the card is invalidated and the entry is delisted until re-review.

---

## Safety rules that earn Grade A

Our reviewer combines static analysis with behavioral heuristics: network egress, credential access, lifecycle hooks, dynamic code evaluation (`new Function`, `eval`, `child_process`), and obfuscation signals (`CHARTER.md:21`). Grades are evidence-driven and published with `file:line` citations.

| Grade | Meaning |
|---|---|
| **A** | No dynamic code execution, no install-time or lifecycle hooks, all filesystem and network access scoped and declared, minimal dependencies, full provenance. Recommended by default. |
| **B** | Clean, but with a friction: broad dependency tree, unscoped-but-benign filesystem reach, git-only distribution, or weak provenance. Listed with the caveat shown inline. |
| **C** | Requires informed consent: undeclared egress, subprocess spawning, or credential access that is plausibly legitimate but not provable from the source. Install flow requires explicit risk acknowledgment. |
| **D / F** | Dynamic code execution, obfuscation, credential exfiltration, or install-time hooks. Not listed. F is published as a warning card. |

### The five hard rules

**1. No dynamic code execution.** No `eval`, `new Function`, `vm.runInNewContext`, `require` of a runtime-computed path, remote module fetch-and-execute, or `Function.constructor` tricks. There is no legitimate plugin reason we have accepted so far. This is an automatic disqualifier from A regardless of intent (`CHARTER.md:21`, and the charter's own packaging constraint "avoid shipping dynamic code execution", `CHARTER.md:54`).

**2. No install-time or lifecycle hooks.** No `preinstall`, `install`, `postinstall`, or `postpublish` scripts in `package.json`. The *only* acceptable lifecycle script is a `prepare` that transpiles your own `src/` and nothing else — and even then, prefer prebuilt artifacts so the script never runs on a user's machine (see [above](#shipping-built-artifacts-the-github-build-script-catch)). A `postinstall` that phones home, downloads a binary, or "checks for updates" is a straight F.

**3. Scoped filesystem access.** 
- Read and write only inside paths derived from the session working directory, `$DSH_HOME`, or an explicit config field.
- Never read `~/.ssh`, `~/.aws`, `~/.claude`, `~/.codex`, `~/.config/opencode`, `.env`, `.git/config`, browser profiles, or keychains — even to "detect what the user has". Credential *detection* is dsh-bridge's own documented job, done with the user watching; a third-party plugin doing it silently is exfiltration-shaped.
- Never write outside your declared scope. No mutating the user's shell rc files, no editing other plugins' config.
- Prefer `ctx.credentials` over reading credential files yourself. Declare it in `inject` so it shows up in the audit.

**4. Scoped, declared network access.**
- Every host you contact belongs in a config field with a visible default and in your README, in a table: host, purpose, what is sent, when.
- No telemetry, analytics, error reporting, or "anonymous usage stats" without an explicit opt-in that defaults to **off**. The charter is unambiguous: no telemetry without opt-in, no network calls except documented ones (`CHARTER.md:32`).
- Never send file contents, prompts, model responses, or environment variables to a host that is not the plugin's stated purpose.
- Fail closed on TLS errors. Never disable certificate validation.

**5. No subprocess escape hatches.** No `child_process`, `execa`, or shell invocation to do something the harness already exposes as a service. If you genuinely must shell out (a `git` wrapper, for instance), then: use `execFile` with an argument array (never a shell string), never interpolate model-provided text into the command, declare the binaries you invoke in the README, and expect to be reviewed line by line. Shelling out caps most plugins at B and puts sloppy ones at C.

### Softer rules that still move the grade

- **No obfuscation.** No minified or bundled-beyond-recognition published source, no base64 blobs, no hex-escaped strings, no dead code that only exists to confuse a reader. If we cannot read it, we cannot grade it above C.
- **Deterministic behavior.** No feature flags fetched at runtime that change what the plugin does. What we audited must be what the user runs.
- **Least capability.** Only `inject` the services you use. A plugin that injects `credentials` for a feature it does not have gets asked why.
- **Honest tool descriptions.** A tool whose `description` understates what `execute` does — prompt-injection bait, in effect — is treated as a security finding, not a docs bug.
- **Respect the sandbox and permission model.** Do not attempt to detect, bypass, or re-implement permission presets. Do not re-request approval in a loop to fatigue the user.
- **Clean unload.** See [`ctx.effect()`](#cleanup-is-not-your-job-mostly). Disabling your plugin must actually stop it.

### Make our job easy

The fastest path to A is a plugin whose safety story is *legible*:

- A `SECURITY.md` stating your threat model, your network egress table, and your filesystem scope.
- A README section titled **"What this plugin can access"** in plain English.
- Small, readable modules. One capability per file.
- A test suite that exercises `execute()` paths — we run it, and green tests raise our confidence in your error handling.

---

## The suggested-build flow

dsh-bridge's installer prefers, in order (`CHARTER.md:23`): an existing **verified** plugin → a **build-it-yourself scaffold** with agent assistance → a raw install with explicit risk consent.

The middle path is the *suggested-build flow*. When a user asks for a capability that has no verified plugin — or only an unvetted one — the bridge offers to generate a minimal local plugin instead of installing a stranger's code. As an author you meet this flow from two directions:

**As the source of a template.** Well-scoped, Grade-A plugins become the scaffolds the bridge generates from. Small, single-capability, config-driven plugins are far more reusable here than kitchen-sink bundles. If you want your work to be the pattern others build on, ship one capability cleanly.

**As the person turning a scaffold into a real plugin.** A generated scaffold arrives as a local plugin loaded through a `--patch` overlay — the exact tutorial path (`docs/user/develop/basic/index.md:46-64`):

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

The plugin path must be absolute; a patch file contributes configuration but does not change the profile directory the loader resolves module paths from (`docs/user/develop/basic/index.md:56`). Iterate with:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Configuration edits hot-replace the plugin — the framework unloads the old instance and loads a new one, and because registrations are effects, the replacement does not retain old registrations (`docs/user/develop/basic/config.md:98-100`).

Graduating a scaffold to a catalog submission means: add the `Config` schema, add the bundle manifest, add `LICENSE` + `SECURITY.md` + README, publish prebuilt artifacts, then submit. Nothing in the scaffold path is throwaway.

---

## Submitting to the catalog

Submission is a pull request against this repository. We do not accept submissions by issue, DM, or email — the audit trail is the point.

### 1. Self-check

Run the [checklist](#checklist) at the bottom of this page. Roughly 80% of first-round rejections are `postinstall` scripts, unpinned git-only installs, or missing `SECURITY.md` — all cheap to fix before you ask.

### 2. Open a submission PR

Add one file: `docs/catalog/submissions/<package-name>.md`, using this front matter:

```yaml
---
name: dsh-my-plugin
repository: https://github.com/you/dsh-my-plugin
install: npm            # npm | tarball | git
version: 0.1.0          # exact version to audit
license: MIT
category: tools         # tools | commands | ui | models | storage | other
summary: One sentence, English, no marketing adjectives.
network_egress:         # [] if none
  - host: api.example.com
    purpose: Fetch issue metadata
    sends: Issue number and repo slug
filesystem_scope:
  - Session working directory (read/write)
  - $DSH_HOME/my-plugin (read/write)
subprocesses: []        # binaries you invoke, [] if none
telemetry: none
maintainer_contact: security@example.com
---
```

Below the front matter, write, in English:

- **What it does** and who it is for, in under 150 words.
- **Why it is safe** — your own reading of the five hard rules, with `file:line` citations into your own source. Authors who audit themselves first get reviewed faster and score higher.
- **How to verify** — the commands a reviewer should run: install, smoke test, test suite.
- **Screenshots** if the plugin has any UI, meeting the design bar in the DSH `BRAND_GUIDELINES.md` (`CHARTER.md:25`).

### 3. Adversarial review

A reviewer — deliberately running a **different model** from the one that authored the plugin, because cross-model review catches more (`CHARTER.md:46`) — produces a trust report card in `docs/trust/<package-name>.md`: grade, evidence table with `file:line` citations, egress and filesystem findings, dependency notes, and provenance verification. The card is public whatever the outcome. Every claim cites evidence; we publish nothing we cannot source (`CHARTER.md:29`).

You will get one round of findings with a clear remediation list. Fix and push; we re-review the new version. There is no limit on rounds — we would rather iterate than reject.

### 4. Listing

On a passing grade, your entry lands in the catalog with its grade badge, trust card link, and a one-command install:

```sh
/bridge:install <plugin>
```

### 5. Staying listed

- **Re-audit on every minor version**, and on any patch release that changes network, filesystem, or subprocess behavior. Tag `@dsh-bridge` maintainers in your release PR.
- **Publish artifact changes trigger delisting** until re-review (see [Provenance](#provenance)).
- **Report security issues in your own plugin** to us as you disclose them. Self-reported issues keep your grade; discovered-and-undisclosed ones do not.
- **Abandonment**: no release and no maintainer response for 12 months moves an entry to an archived tier with a visible staleness notice.

### What we will not do

- List a plugin we cannot read the source of.
- Grade on reputation, star count, or who wrote it.
- Remove a published trust card because an author disagrees with it. Findings are corrected when they are *wrong*, with a visible revision note — never quietly deleted.

---

## Template repository

> **Placeholder — pending publication.** The dsh-bridge plugin template repository will live at `github:beartackler/dsh-bridge-plugin-template` and is not yet published. (Repository creation is currently blocked on maintainer `gh` re-authentication; see `CHARTER.md:55`.) This section will be updated with the canonical URL and a `degit`/`create` one-liner once it is live.

The template will ship, preconfigured to pass the checklist on day one:

- Function-form plugin with `name`, `inject`, `apply`, and a Schemastery `Config`.
- One example tool built with `defineTool`, including `output.schema` and `output.render`.
- `package.json` with `dsh.bundle`, correct `files`, and peer deps on `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`.
- `cordis.patch.yml` with a single `insert` row.
- A self-contained tsdown-based `prepare` script, plus an npm publish workflow with `--provenance`, so users never need `allowBuilds`.
- `LICENSE`, `SECURITY.md` (threat model + egress table stubs), README with a "What this plugin can access" section.
- Vitest setup with an example `execute()` test.
- A CI job running the same static checks our reviewer runs, so you see your grade before you submit.

Until it lands, `turtle-ui` (referenced upstream at `docs/user/develop/basic/publish.md:163`) is the best public example of a correct self-contained `prepare`, and the packaging constraints in `CHARTER.md:54` capture the dsh-ponytail pattern.

---

## Checklist

Copy this into your submission PR and tick it honestly.

**Anatomy**
- [ ] Exports `name` and `apply` (function form unless providing a service)
- [ ] `inject` declares every service used, and nothing more
- [ ] Non-`ctx` resources cleaned up via `ctx.effect()`
- [ ] Tools defined with `defineTool`, with `output.schema` and `output.render`
- [ ] Tool descriptions honestly describe what `execute` does
- [ ] `Config` exported as a Schemastery schema with defaults; no plain object
- [ ] No hardcoded value that two deployments might set differently

**Packaging**
- [ ] `package.json` declares `dsh.bundle` with a patch path
- [ ] `files` lists exactly what ships
- [ ] `cordis.patch.yml` references the package by name, one row per capability
- [ ] No unnecessary override of another bundle's rows
- [ ] `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` are peer deps (and dev deps)
- [ ] Runtime dependencies are minimal and each is justified in the PR
- [ ] Prebuilt artifacts published (npm or tarball); no `allowBuilds` required
- [ ] If git install is offered, docs pin a commit SHA

**Safety**
- [ ] No `eval`, `new Function`, `vm`, computed `require`, or remote code fetch
- [ ] No `preinstall` / `install` / `postinstall` / `postpublish` scripts
- [ ] Only `prepare`, and only to build your own `src/`
- [ ] Filesystem access scoped to cwd / `$DSH_HOME` / config paths
- [ ] No reads of `~/.ssh`, `~/.aws`, `~/.claude`, `~/.codex`, opencode auth, `.env`, keychains
- [ ] Credentials accessed only via `ctx.credentials`, declared in `inject`
- [ ] Every network host is a config field, documented in an egress table
- [ ] Telemetry absent, or opt-in and default-off
- [ ] TLS validation never disabled
- [ ] No `child_process` — or `execFile` with an argument array, no model text interpolated, binaries documented
- [ ] Published source is readable: not obfuscated, no base64/hex blobs
- [ ] No runtime-fetched flags that change behavior
- [ ] Disabling the plugin fully stops it

**Provenance**
- [ ] Public repository linked from `package.json`
- [ ] Release tagged; version matches the published artifact
- [ ] Published with `--provenance` from CI
- [ ] `LICENSE` present; upstream attribution preserved for ported code
- [ ] `SECURITY.md` with contact and disclosure window
- [ ] Human-readable changelog

**Submission**
- [ ] `docs/catalog/submissions/<package-name>.md` added with complete front matter
- [ ] Self-audit against the five hard rules, with `file:line` citations
- [ ] Verification commands listed
- [ ] Screenshots included for any UI

---

## References

All paths relative to the Harness reference checkout unless noted.

- `docs/user/develop/basic/index.md` — plugin anatomy, `apply`, `inject`, `ctx.effect()`, the three plugin forms
- `docs/user/develop/basic/tool.md` — `defineTool`, parameters, canonical output, render
- `docs/user/develop/basic/config.md` — Schemastery `Config`, validation, HMR, design principles
- `docs/user/develop/basic/publish.md` — bundles vs. profiles, manifests, layer order, git-install build catch, distribution
- `docs/cookbook/adding-a-tool.md` — nested schemas, background work, policy hooks, Code Mode, UI cards
- `docs/user/develop/framework/service.md` — providing a service to other plugins
- [`CHARTER.md`](../CHARTER.md) — dsh-bridge principles, trust grading inputs, packaging constraints

Questions about a rule, or think a grade is wrong? Open an issue with the evidence. That is how this works.
