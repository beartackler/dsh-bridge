# Trust Report Card: strukto-ai/mirage

## 1. Header

| Field | Value |
|---|---|
| Plugin | `mirage` (Unified Virtual File System for AI agents; DSH plugin `@struktoai/mirage-dsh` swaps dsh's host fs/bash providers for a virtual-workspace world) |
| Pinned subject | github:strukto-ai/mirage @ commit `2ed4257af98fc1a206a5444057d1290892190e69` (default branch head at resolve time, 2026-08-26; latest tag v0.0.5 points elsewhere, tags not dereferenced) |
| npm integrity | NOT VERIFIABLE for the repo head: registry carries only `@struktoai/mirage-dsh` 0.0.1-alpha.1 and 0.0.1 (published 2026-08-15), while the repo declares 0.0.5. See MIR-SUPPLY-1. |
| Provenance | GitHub channel only. No attestation checked for npm 0.0.1; the audited commit is ahead of every published artifact. |
| License | Apache-2.0 (LICENSE; headers repeated per file) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the dsh-plugin surface and its dependency closure; retry of a run lost to rate limiting) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: nothing malicious was found and the provider replacement is unusually honest
about where its sandbox claim holds and where it voids itself, but the artifact dynamically
executes agent-supplied code by design (python/JS evaluators in its dependency closure), ships
doors that reach the real host and network when configured, and the audited commit matches no
published npm artifact.

## 3. What this plugin can do

The DSH integration (`typescript/packages/dsh`, npm `@struktoai/mirage-dsh`) applies a bundle patch
(dsh/cordis.patch.yml:74-103) that disables dsh's host-backed providers (`fs-sandbox`,
`bash-sandbox`, `pwsh-sandbox`, `tool-pwsh`, `tool-fs-search`) and inserts three mirage providers:
`mirage` (workspace service), `mirage-fs` (ctx.fs), `mirage-shell` (ctx.shell). Consequences:

| Capability | Detail | Evidence |
|---|---|---|
| Shell replacement (no OS bash) | `MirageShellExecutor.run()` dispatches the whole command line into mirage's own shell via `ws.execute(spec.command)`; there is no OS process behind a command, and kills are cooperative aborts. | dsh/src/shell.ts:803-806, 343-345 |
| Injection containment | A command line that would be "injected" parses (tree-sitter-bash) and executes inside the workspace dispatcher, under mount modes, session grants, and allow/ask/deny policy. The only `/bin/sh -c` spawn in shipped packages is a test fixture not exported by the package. | core/src/shell/parse.ts; node/src/commands/native_fixture.ts:40 |
| fs replacement | Every ctx.fs op goes through the workspace op door (`(await this.ctx.mirage.ready).fs`), so grants, policy, and cache invalidation fire exactly as for shell commands. | dsh/src/fs.ts:134-138 |
| Sandbox claim honesty | Both providers report `workspace-write` only while every configured runtime declares `reach === 'vfs'`; otherwise they answer `undefined`, so dsh permission presets refuse to compose instead of trusting a false claim. | dsh/src/service.ts:299-302; dsh/src/shell.ts:444-446; dsh/src/fs.ts:156-158 |
| Read-only enforcement | `read-only` policy narrows every mount grant to `read` (keeping `/dev` as the null sink) in a twin session, and ctx.fs refuses mutations outright under the same policy. | dsh/src/shell.ts:686-744; dsh/src/fs.ts:173-179 |
| Approval bridge | Policy `ask` rules render the line word-by-word GNU-shell-quoted (so spaces/newlines cannot forge prompt lines) and go out through dsh's own `ctx.approval`; `allowed-once` maps to ALLOW at ONCE scope, never SESSION; rejection, dismissal, and unavailable all refuse, failing closed. | dsh/src/approval.ts:107-112, 154-173; core/src/utils/quote.ts:20 |
| Host-path neutralization | A workdir or cwd resolved on the harness's machine names nothing in the world and is dropped in favor of the workspace root; the policy's `workspaceRoot` is deliberately never consulted. | dsh/src/shell.ts:398-403; dsh/src/fs.ts:198-202 |
| Network egress (the product) | About fifty backend clients talk to user-configured endpoints (S3, GDrive, Gmail, Slack, Redis, Postgres, Notion, ...), and the workspace ships builtin `curl`/`wget` the agent can run against arbitrary URLs through a shared HTTP layer. All of it is the documented function of the tool. | core/src/commands/builtin/general/curl.ts:81-85; general/wget.ts; commands/builtin/utils/http.ts:22-24 |
| Process escape doors (opt-in) | Runtime entries may declare `reach: 'process'`: the `local` python runtime spawns the host `python3` with the parent environment (documented at the class), and `docker`/`smolvm` runtimes spawn those CLIs. Any such entry flips `vfsOnly` false and voids the sandbox claim above. | node/src/runtime/python/local.ts:41,52-96; sandbox/docker/runtime.ts:51; sandbox/smolvm/runtime.ts:56 |
| FUSE (opt-in) | Can expose mounts as real kernel filesystems on the host. Unmount fallback shells out two fixed verbs with the mountpoint embedded via `JSON.stringify` quoting; operands are deployment-configured, never agent-supplied. | node/src/fuse/mount.ts:150-156 |
| Local daemon | CLI can auto-spawn a detached daemon bound to `127.0.0.1` with a Host-header allowlist (loopback trio default), bearer-token auth support, and 1000 req/min limit; the spawn passes the full parent environment into the child. | server/src/bin/daemon.ts:72; server/src/host_validation_constants.ts:15; server/src/app.ts:69-84; cli/src/client.ts:130-166 |
| Credential reads | None beyond configuration: tokens arrive via operator-provided mount config or `${VAR}` interpolation (checked, not enumerated, in the config path); the three production env-enumeration hits copy the environment into a locally spawned daemon or a config dict, and transmit nowhere. | node/src/config.ts:632-637; cli/src/client.ts:133-137; cli/src/workspace.ts:30 |
| Dynamic code execution | Present by design inside the dependency closure: pyodide/monty/quickjs evaluators compile and run agent-supplied python/JS inside sandboxed interpreters, and optional peer deps load via dynamic `import()` with literal specifiers (`'chromadb'`, `'redis'`). The dsh adapter package's own sources contain none. | core/src/runtime/python/wrapper.ts:120-140; js/quickjs.ts; accessor/chroma.ts:32-33; cache/index/redis.ts:95-96 |
| Telemetry | None found. The grep hits for analytics terms are Langfuse/LanceDB/Qdrant *resource clients* (mounted services the operator configures), not phone-home code. | negative claim, scope in section 4 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`. Raw output: 1107 findings
(69 critical, 731 high, 271 medium, 36 low) across 4677 files / 22.5 MB; machine grade F with caps
`cred-plus-net`, `dynamic-exec-present`, `critical-present`. Manual adjudication below.

### Scanner criticals adjudicated (all 69)

Every critical is credential-shaped env access outside the shipped packages:

- CRED-004 x33 (`AWS_SECRET_ACCESS_KEY` reads): all in `examples/**` (18), `integ/**` (8),
  `.github/workflows|actions` (5), `typescript/scripts/gen-presigned-url.ts:67,70` (dev script),
  `typescript/packages/cli/src/e2e.test.ts` and ssh/config tests. CI values are dummy locals
  (`minio123`, `testing`: .github/workflows/test_integ.yml:240,804,1062;
  .github/actions/integ-battery-setup/action.yml:89).
- CRED-006 x16 (`Object.entries(process.env)`): vite.config browser example bundling example keys
  into a demo build (examples/typescript/browser/vite.config.ts:30-44), one example branching
  script, and three production hits adjudicated in section 3 (config interpolation, daemon env,
  CLI workspace env).
- CRED-003 x12 (`~/.ssh` strings): SSH resource *configuration schema* fields
  (`identity_file`, `known_hosts`) and their tests, e.g.
  typescript/packages/node/src/resource/ssh/config.test.ts:22-39; one workflow installing openssh
  in an integration container (.github/workflows/test_integ.yml:1171-1174). No key material is
  read anywhere in shipped production code.

Zero criticals in `typescript/packages/{core,node,server,cli,dsh}/src` production code.

### Production-code findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| MIR-EXEC-1 | high (documented) | node/src/runtime/python/local.ts:41,57-61 | `local` python runtime spawns the host interpreter with `{...process.env}`. Declared `reach = 'process'` at the class, which is what makes `vfsOnly` false and voids sandbox claims instead of lying. Opt-in per workspace config. |
| MIR-EXEC-4 | medium | core/src/runtime/python/wrapper.ts:127-135; core/src/runtime/js/* | In-product evaluators `exec`/`eval` agent-supplied programs inside WASM/sandboxed interpreters. This is the cap driver: dynamic code execution exists in the installed dependency closure even though the dsh adapter's own files are clean. |
| MIR-EXEC-2 | medium | node/src/runtime/sandbox/docker/runtime.ts:51; smolvm/runtime.ts:56 | Spawns `docker`/`smolvm` CLIs for sandboxed runtimes. Opt-in; inherits the host tools' own trust model. |
| MIR-NET-1 | medium | core/src/commands/builtin/general/curl.ts:81-85; utils/http.ts:22-80 | Builtin curl/wget give the in-workspace agent arbitrary egress. Documented product behavior; listed here so the capability is explicit. |
| MIR-NET-2 | medium | core/src/core/*/client.ts; browser/src/resource/*/config.ts:26 | Backend clients egress to operator-configured endpoints with vendor-default URL templates. |
| MIR-CRED-1 | medium | cli/src/client.ts:133-137; node/src/config.ts:632-637; cli/src/workspace.ts:30 | Full-environment copies for daemon spawn and config interpolation. Local-only destinations observed; still broader than needed. |
| MIR-SUPPLY-1 | medium-high | package.json files vs registry; plugins/mirage/.mcp.json | Repo head declares `@struktoai/mirage-dsh` 0.0.5 but npm has only 0.0.1 (2026-08-15); no attestation surfaced. The skill/MCP path runs `npx -y @struktoai/mirage-cli mcp` unpinned. Pin the github commit (as this card does) or verify the npm tarball separately before install. |
| MIR-EXEC-3 | low | core/src/utils/optional_peer.ts:23-25; accessor/chroma.ts:32-33; cache/index/redis.ts:95-96 | Dynamic `import()` of optional peers; every specifier is a literal module name, not attacker-influenced. |
| MIR-FUSE-1 | low | node/src/fuse/mount.ts:153-155 | `execSync("diskutil unmount force " + JSON.stringify(mountpoint))`: quoting is JSON-string escaping, not POSIX shell quoting, so `$`/backtick expansion is theoretically possible; operand is deployment config, unreachable from agent input today. Watch this pattern. |
| MIR-SRV-1 | low | server/src/app.ts:69-84; bin/daemon.ts:72; host_validation_constants.ts:15 | Daemon binds loopback only, validates Host header, supports token auth, rate-limits. Reasonable defaults for a local API that executes workspace commands. |

### Scanner noise dismissed (with scope)

- EXEC-005 x198: overwhelmingly JavaScript `RegExp.exec` (e.g. awk_helper.ts:140-298) and Redis
  pipeline `pipe.exec()` (cache/index/redis.ts:173,184). Genuine process spawns are enumerated in
  section 3 and all appear above.
- HOOK family: `setTimeout` retry backoff (core/api/client.ts:83), process exit handlers for FUSE
  cleanup and daemon shutdown (node/src/workspace/fuse.ts:65-66, server/src/bin/daemon.ts:70),
  missing-peer install advice strings. Zero lifecycle scripts in any package.json (grep verified
  across all 8920 tracked files' manifests).
- OBFU: one base64 blob in shipped code is the browser pyodide WASM artifact
  (browser/src/generated/wasm.ts:2, a generated file); the rest are MIME test fixtures
  (integ/fixtures/himalaya/mime_parity.json) and fixture JSON dumps.
- NET-007/008: documentation URLs, package.json repository fields, and vendor endpoint templates.
- All findings under `examples/`, `integ/`, `docs/`, `.github/` (about 600 total) are
  non-shipping developer content; sampled and adjudicated, none anomalous.

### Negative claims and what was searched

Searched all production trees (`typescript/packages/*/src`, `python/mirage`, `plugins/`): no
`new Function`, no `require('vm')`/`node:vm`, no lifecycle hooks, no telemetry endpoints, no
obfuscation markers in hand-written code, no reads of `.ssh`/`.aws`/browser stores/keychains, no
writes outside workspace mounts and `~/.mirage` state dirs, no `pull_request_target` workflows.
The dsh adapter package (587-line fs, 895-line shell, 174-line approval bridge) was read in full:
it contains no I/O primitives at all beyond delegation into the workspace.

## 5. What we could not check

- **Behavioral probe.** Pipeline stage S4 did not run: no sandboxed load/activate/invoke/idle-soak
  with honeypot and canary credentials. Static review covered the same surfaces but cannot rule out
  environment-dependent behavior.
- **Python implementation depth.** `python/mirage` is roughly half the codebase (2006 files
  including tests); this audit read its registry/dispatch seams and trusted the TS/Python conformance
  harness (`conformance/`, `integ/unix/*`) for parity. A dedicated pass on the Python daemon path is
  outstanding.
- **Published artifacts.** npm 0.0.1 predates the audited commit; nobody has rebuilt `dist/` at
  `2ed4257` and byte-compared. Until 0.0.5 publishes (ideally with provenance), the npm channel is
  unverifiable against this card.
- **Backend client fidelity.** Roughly fifty service clients were sampled, not exhaustively read;
  per-backend flaws (e.g. token handling inside one vendor client) would not surface in this pass.
- **Peer/runtime dependencies** resolved on the user's machine (`@deepseek-ai/cordis`, dsh-shell,
  dsh-fs, tree-sitter-bash, redis/chromadb optional peers); transitive advisories not joined against
  a pinned OSV snapshot.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F; the manual
verdict is C; both positions are recorded here and in section 4 rather than hidden. The disagreement
reduces to scope: the scanner counts examples and fixtures, the manual pass adjudicates the
installed dependency closure.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/strukto-ai/mirage /tmp/mirage-audit
cd /tmp/mirage-audit && git rev-parse HEAD   # expect 2ed4257af98fc1a206a5444057d1290892190e69

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/mirage-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '74,103p' typescript/packages/dsh/cordis.patch.yml  # which host providers get disabled
grep -n "ws.execute(spec.command" typescript/packages/dsh/src/shell.ts            # shell -> workspace
grep -n "reach = 'process'" typescript/packages/node/src/runtime/python/local.ts  # declared escape door
sed -n '299,302p' typescript/packages/dsh/src/service.ts                          # vfsOnly gate
grep -rn "child_process" typescript/packages/dsh/src                              # adapter: zero hits

# 4. Confirm the published-artifact gap yourself
npm view @struktoai/mirage-dsh versions time --json   # expect 0.0.1-alpha.1, 0.0.1 only
cat typescript/packages/dsh/package.json | grep '"version"'   # expect 0.0.5 in-repo
```

## 8. Methodology and pinned inputs

- Subject: git commit `2ed4257af98fc1a206a5444057d1290892190e69` (shallow clone at
  reference/audits/mirage; fetch during audit confirmed it is current with origin HEAD)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1` (same corpus as the modlens
  card, so findings are comparable), 4677 files / 22,535,241 bytes
- Review: full manual read of dsh/src/{shell,fs,service,approval,errors,text,spill}.ts and
  cordis.patch.yml; node/src/runtime/{python/local,sandbox/docker,sandbox/smolvm}.ts,
  node/src/fuse/{mount.ts,../workspace/fuse.ts}, node/src/config.ts, node/src/commands/native_fixture.ts;
  core/src/runtime/{base,table,mixin}.ts, runtime/python/{wrapper,loader}.ts, utils/{quote,optional_peer}.ts,
  cache/index/redis.ts, accessor/chroma.ts, commands/builtin/utils/http.ts, commands/builtin/general/{curl,wget}.ts,
  workspace/executor/command/cli.ts, workspace/cli/registry.py;
  server/src/{app,host_validation,host_validation_constants}.ts, bin/daemon.ts;
  cli/src/{client,daemon,execute,workspace}.ts; agents/src/pi/{extension,operations}.ts;
  plugins/mirage/* manifests and SKILL.md; SECURITY.md; docs/typescript/agents/dsh.mdx;
  all 69 scanner criticals individually; sampled adjudication of the 731 highs
- Cross-model review: NOT performed (single reviewer). Revision 1 capped accordingly.
- Grade derivation: machine caps `dynamic-exec-present` survive adjudication (the evaluators really
  ship in the dependency closure), probe and second reviewer absent, npm provenance gap unresolved:
  min(band, caps) = C. Nothing observed supports D or F: no undocumented egress destination, no
  credential exfiltration path, no obfuscation, and every host-reaching door is a declared,
  opt-in configuration whose existence the code announces at the point of claim
  (`vfsOnly` returning false).

## 9. Strengths

1. Honest sandbox accounting: the `reach` attribute (core/src/runtime/base.ts:57 defaulting to
   `'process'`) forces every runtime to declare whether it bypasses the workspace gate, and the
   providers derive their sandbox claim from it instead of asserting containment unconditionally
   (dsh/src/service.ts:288-302). A world with the host python runtime answers "does not sandbox"
   and downstream permission layers refuse to compose. This is exactly the behavior a trust layer
   wants from a provider swap.
2. Injection containment by construction: the replaced shell has no OS process behind it, so
   classic command injection degrades to "run inside the granted world," still bounded by mount
   modes, hidden paths, hidden vars, and command deny rules (dsh/src/shell.ts:340-352,
   686-744). The read-only twin session narrows grants rather than layering a second checker.
3. The approval bridge quotes every word of the authorized line in GNU diagnostic style before
   showing it to a human, maps a nod to ONCE-only scope, and fails closed on `unavailable`
   (dsh/src/approval.ts:90-112, 154-173).
4. Zero install-time hooks anywhere, zero telemetry, zero obfuscation in hand-written code, Apache-2.0
   throughout, SECURITY.md with disclosure commitments.
5. The bundle patch documents its own semantics to an unusual standard (cordis.patch.yml explains
   ask-ledger behavior, read-only narrowing, and workdir neutralization in prose a reviewer can
   check against the cited code).

## 10. Residual risks

1. The product's purpose is powerful delegation: an operator who mounts live S3/Slack/Gmail
   resources grants the agent whatever those credentials can do, and builtin curl/wget mean
   arbitrary egress is always one command away. The boundary is the operator's mount/policy
   document; a permissive default world (RAM scratch at `/tmp`) is safe, a copied-from-README world
   with real tokens is not.
2. Opt-in doors widen silently for readers who skip configuration: adding `local` to `runtimes`
   turns every shell command's world into one that can reach the host, with the only signal being
   that dsh presets stop composing (an absence, not a warning).
3. Supply-chain: npm lags the repo and the MCP/skill path invokes unpinned `npx -y
   @struktoai/mirage-cli`; a registry compromise would flow straight through the documented install
   path. Prefer the github-pinned install until 0.0.5 publishes with provenance.
4. `!!js` expressions in profile patches evaluate JavaScript at mount time (operator-authored
   files, not agent-reachable, but anyone sharing profile YAML is sharing executable config).
5. FUSE unmount builds a shell string with JSON-style quoting (MIR-FUSE-1); safe today because the
   operand is deployment-owned, but the pattern deserves a fix before anything user-influenced ever
   reaches it.
6. Full-parent-environment inheritance into the spawned daemon (MIR-CRED-1) means any secret present
   in the invoking shell lives in the daemon's environment for its lifetime.

## 11. Re-verify steps

1. Re-run section 7 against current upstream HEAD; any new literal URL, new `spawn`/`execSync` site,
   new `reach != 'vfs'` runtime in default entries, or new lifecycle script must be re-adjudicated
   before this grade carries forward.
2. Watch the npm channel: once `@struktoai/mirage-dsh@0.0.5` (or later) publishes, compare
   `dist.integrity` against a rebuild at the pinned commit; until then treat npm installs as a
   different, ungraded subject.
3. On any bump touching `dsh/src`, re-read cordis.patch.yml first: a newly enabled host provider row
   changes the entire containment story.
4. Re-run the scanner after heuristics-corpus bumps; digest recorded in section 8.
5. When the trust pipeline gains S4 (behavioral probe), re-run with canary credentials seeded and
   the `local` runtime both absent and present; the latter should show canary-accessible behavior
   and must flip the card's capability table, not surprise it.
