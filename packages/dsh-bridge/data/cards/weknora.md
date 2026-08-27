# Trust Report Card: @wxg-prc-cpg/dsh-weknora

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@wxg-prc-cpg/dsh-weknora` (WeKnora knowledge-base tools for DSH; lives in the Tencent/WeKnora monorepo at `packages/dsh-weknora`) |
| Pinned subject (git) | github:Tencent/WeKnora @ commit `a753a15354a8ef0a0d7a5bd1082bf27e98e4f68b` (default branch head at audit time, committed 2026-08-25T21:20:47+08:00), subpath `packages/dsh-weknora` |
| Pinned subject (npm) | `@wxg-prc-cpg/dsh-weknora@0.1.0`, integrity `sha512-L6q32rNrDBU3Q8xE0SGYMlieC8sKswrp5GOslGka4UnH+f4boxLXLLMgkceE+Ub/c+C2tQ2rsaHXky9bO3pXlw==` |
| Provenance | Strong for the registry artifact. The record carries `gitHead` `5b140206219e52c7854e0de265de232e04a2c98c` and a published SLSA attestation (`predicateType https://slsa.dev/provenance/v1`), produced by the tag-gated publish job with `id-token: write` (.github/workflows/dsh-plugin.yml, `publish` job). Note the gap: `gitHead` names an earlier commit than the audited tree head, so the graded source is the checkout, not the tarball. |
| License | MIT (`packages/dsh-weknora/package.json:11`); repository root LICENSE is Tencent's MIT text |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0, monorepo run and package-scoped run, plus manual read of all 1265 lines of `src/`) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The plugin is a thin, well-typed HTTP client that registers up to four read-only retrieval tools
against one WeKnora deployment you configure, with no dynamic code execution, no child processes, no
filesystem access, and no credential path beyond the one API key that authenticates that deployment.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | Exactly one origin, taken from `config.baseUrl` (default `http://localhost:8080/api/v1`). Two `fetch` call sites, both routed through the same private `url()` builder, so no path can reach a second host. | src/client.ts:125-132, 142, 268; src/config.ts:55-60 |
| Credential handling | `apiKey` becomes the `X-API-Key` header, `tenantId` becomes `X-Tenant-ID`, both on that one origin only. The shipped patch sources them from `WEKNORA_API_KEY` / `WEKNORA_BASE_URL`. No other secret is read; there is no `.ssh`/`.aws`/`.claude`/keychain/browser-store access in the package. | src/client.ts:115-122; cordis.patch.yml:9-14; grep negative across src/ |
| Runtime services | Injects `['tools']` only. `apply()` validates config, constructs one client, registers tool definitions as Cordis effects so unload withdraws them. No commands, listeners, or timers. | src/index.ts:15, 28-36 |
| Tools reaching the model | Four, each individually switchable and prefix-renameable: `list_knowledge_bases`, `search`, `read_document`, `ask`. All four are read paths against the knowledge base; nothing creates, patches, or deletes. `ask` can optionally enable server-side web search. | src/tools.ts:190, 245, 365, 457; README.md:44-52 |
| Child processes | None in shipped code. The only `spawn` in the package is `test/e2e/run-in-dsh.mjs:29,54`, which drives a throwaway harness install in CI and is excluded from the published `files` list. | package.json:41-46; test/e2e/run-in-dsh.mjs:29 |
| Dynamic code execution | None. No `eval(`, `new Function`, `vm.`, or dynamic `import()` anywhere in `src/`. | grep negative over src/ |
| Filesystem | None. No `fs`, no `readFile`, no `writeFile` in `src/`. | grep negative over src/ |
| Telemetry | None. No analytics host, no beacon, no counters. | grep over src/ |
| Failure posture | Configuration is validated at load, and a violation fails the plugin load with a message naming each bad field rather than surfacing later inside a tool call. | src/index.ts:29; README.md:53-54 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

Two runs. The whole monorepo returns 4192 findings (3151 high, 10 medium, 1031 low) and a machine F
off `cred-plus-net`, `dynamic-exec-present`, and `finding-density`. That run measures a Go backend, a
Vue frontend, a Python MCP server, and a WeChat mini-program: not the graded subject. The adjudicated
run is scoped to `packages/dsh-weknora`: **31 findings** (0 critical, 18 high, 3 medium, 10 low),
machine grade **F** off `cred-plus-net-split`, `dynamic-exec-present`, and `finding-density`. Every
one of those gates fires on test fixtures, not on shipped code. Manual adjudication follows.

### Scanner highs and mediums adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x2 `fetch(...)` (src/client.ts:142, 268) | The product's only two egress points, both built by the same `url()` helper from `config.baseUrl`. Line 142 is the JSON path, line 268 the SSE path for `ask`. Neither can address a host the user did not configure. | src/client.ts:125-132, 142, 268 |
| NET high x8 in `test/config.test.mjs`, `test/tools.test.mjs` | `https://kb.example.com` assertions in unit tests for the base-URL normalizer. Reserved example domain, and not published (`files` is `dist`, `cordis.patch.yml`, two READMEs). | test/config.test.mjs:7-10; package.json:41-46 |
| NET high x2 `createServer` (test/e2e/fake-model.mjs:12, test/helpers/mock-weknora.mjs:8) | Local mock servers on `.invalid` hostnames used by the test suite. Not published. | test/e2e/fake-model.mjs:87; test/helpers/mock-weknora.mjs:133 |
| EXEC high x2 `spawn` (test/e2e/run-in-dsh.mjs:29, 54) | The e2e harness installs a pinned `dsh` into a throwaway profile and drives real tool calls against the mock backend. This is the `dynamic-exec-present` gate's sole cause, and it lives in a directory npm never ships. | test/e2e/run-in-dsh.mjs:29, 54, 84; package.json:41-46 |
| CRED medium `apiKey: !!js process.env.WEKNORA_API_KEY` (cordis.patch.yml:11) | Accepted and documented. One named variable, flowing to one header on the origin the same file configures. | cordis.patch.yml:9-14; src/client.ts:120; README.md:22-28 |
| HOOK medium `prepare: npm run build` (package.json:51) | `prepare` does run on a git-dependency install, but not for the registry tarball, which ships prebuilt `dist/`. The README recommends the npm path precisely for that reason ("installs prebuilt code, no build permission needed"). | package.json:41-51; README.md:14-16 |
| OBFU low x3 + medium x1 | The lows are `sha512-` integrity strings in `package-lock.json`, which is what a lockfile is. The medium is `decodeURIComponent` in a test mock's URL router. | package-lock.json:22, 32, 46; test/helpers/mock-weknora.mjs:195 |
| `cred-plus-net-split` gate (machine F) | Credential read and egress are the same feature: the key authenticates the endpoint. The key never reaches a second host, because there is no second host. | src/client.ts:115-122, 142 |

### Negative claims and what was searched

All 20 scanned files of `packages/dsh-weknora`, including 1265 lines of `src/`: no `eval(`, no
`new Function`, no `vm.`, no dynamic `import()`, no `child_process` outside `test/e2e/`, no `fs`
usage at all, no `process.env` read in code (the only env reads are the four named variables in
`cordis.patch.yml`), no obfuscation signals in `src/`, no install-time lifecycle hook, no timers, no
second network host.

## 5. What we could not check

- **Tarball-to-tree equality.** The registry `gitHead` is `5b140206`, while the audited tree head is
  `a753a153`. The published bytes were not fetched and compared against this checkout, so this card
  grades the source at `a753a153`, not `0.1.0` byte for byte. Provenance metadata exists; the
  comparison was not performed. This is the main gap between this grade and A.
- **The WeKnora deployment on the other end.** This is a client. What the tools return, what the
  server logs, and what an API key can reach live in the Go backend and your deployment, neither of
  which this card grades. The monorepo's 4192 findings are not a statement about the plugin, and this
  B is not a statement about WeKnora the product.
- **Behavioral probe.** No sandboxed load/activate/invoke run was performed here (pipeline S4 not
  available), though upstream's own e2e job does exactly that against a mock backend.
- **Cross-model review.** Single reviewer.
- **Transitive advisories.** Runtime dependencies are none beyond the harness; devDependencies were
  not joined against a pinned OSV snapshot.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner's machine grade for the package-scoped run (F) is recorded above
rather than hidden. The disagreement is that all three gates fire on `test/`, which npm does not
publish: the shipped surface has no `child_process`, and its one credential and one egress are the
same operation.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Tencent/WeKnora /tmp/weknora-audit
cd /tmp/weknora-audit && git rev-parse HEAD   # expect a753a15354a8ef0a0d7a5bd1082bf27e98e4f68b

# 2. Scan the package, not the monorepo
node tools/scan/dist/index.js /tmp/weknora-audit/packages/dsh-weknora   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
cd /tmp/weknora-audit/packages/dsh-weknora
grep -rnE "eval\(|new Function|child_process|require\('fs'\)|node:fs" src/   # expect: no hits
grep -rn "fetch(" src/                                                      # expect: client.ts:142 and client.ts:268 only
sed -n '115,132p' src/client.ts                                             # the headers and the single URL builder
grep -rn "process.env" src/ cordis.patch.yml                                # expect: only cordis.patch.yml, four named vars

# 4. Confirm the provenance that does exist
npm view @wxg-prc-cpg/dsh-weknora@0.1.0 gitHead dist.integrity
npm view @wxg-prc-cpg/dsh-weknora@0.1.0 dist.attestations   # expect: an slsa.dev/provenance/v1 record

# 5. Check what npm actually ships
node -p "require('./package.json').files"   # expect: dist, cordis.patch.yml, README.md, README_CN.md
```

## 8. Methodology and pinned inputs

- Subject: git commit `a753a15354a8ef0a0d7a5bd1082bf27e98e4f68b`, subpath `packages/dsh-weknora`
  (shallow clone at reference/audits/WeKnora)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; monorepo run (4192 findings)
  and package-scoped run (31 findings) both recorded in section 4
- Review: full manual read of `src/{index,config,client,tools,harness,render}.ts` (1265 lines),
  `package.json`, `cordis.patch.yml`, `README.md`, and `.github/workflows/dsh-plugin.yml`
- Registry metadata: `npm view` for version, integrity, `gitHead`, and attestations, fetched
  2026-08-26
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no high or critical finding survives adjudication in the shipped surface; the one
  egress and the one credential are the same documented feature; no dynamic execution, no consumer
  lifecycle hook, no filesystem, no telemetry; all four tools are read-only. Caps applied: tarball
  not byte-compared against the audited tree, no S4 probe here, single reviewer - each alone bars A.
  Result: B.

## 9. Strengths

1. Configuration is validated at load and reports every violation at once, so a typo fails the
   profile boot with a named field instead of an opaque error inside the first tool call
   (src/index.ts:29, README.md:53-54).
2. Publishing is tag-gated and the workflow refuses to publish when the tag does not name the
   packaged version, with the failure message spelling out both options (.github/workflows/dsh-plugin.yml,
   "Check the tag names the packaged version").
3. The package ships npm provenance and a `gitHead`, which most plugins in this catalog do not.
4. Every tool is individually switchable and the whole set is prefix-renameable, so two deployments
   can be mounted side by side without collision (README.md:44-52; src/tools.ts:187-190).
5. Tool descriptions steer the model toward the cheap evidence-preserving path: `ask` explicitly
   tells the model to prefer `search` when the answer can come from specific passages
   (src/tools.ts:457-464).
6. The published surface is minimal: `dist`, the patch, and two READMEs. Tests, mocks, and the e2e
   spawner are not shipped (package.json:41-46).

## 10. Residual risks

1. Your API key sits in a profile config or an environment variable in plaintext, as with any bearer
   credential. Anyone who can read the profile can read the key.
2. `ask` can turn on WeKnora's server-side web search (`web_search: true`), which means the
   deployment, not this plugin, may reach the open internet on your behalf (src/tools.ts:470).
3. Default `baseUrl` is `http://localhost:8080/api/v1`: plain HTTP. Fine for loopback, but a user who
   points it at a remote host without switching to `https` sends the key in the clear
   (src/config.ts:56).
4. Retrieved passages enter the model context verbatim. Any prompt-injection content stored in your
   knowledge base reaches the agent through `search` and `read_document`.
5. The tarball was not byte-compared against this tree, and `gitHead` names a different commit. Treat
   `0.1.0` as unverified against the audited source until that comparison is made.
6. Single-package audit inside a large monorepo. Do not read this B as a statement about WeKnora the
   server, the mini-program, or the browser extension.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any second network host, any `child_process` or
   `fs` in `src/`, any consumer-facing lifecycle hook, or any write-capable tool forces
   re-adjudication.
2. Close the provenance gap: `npm pack` the published version, diff its `dist/` against a local
   `npm run build` of the commit named by `gitHead`.
3. Watch `src/tools.ts` on every bump for a tool whose verb is not a read.
4. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
5. Re-vet at 90 days or on any new `dsh-weknora-v*` tag, whichever comes first.
