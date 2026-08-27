# Trust Report Card: dsh-plugin-reactive-resume

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-plugin-reactive-resume` (bridges a Reactive Resume account into a Harness session over MCP; lives in the Reactive Resume monorepo at `packages/dsh-plugin`) |
| Pinned subject | github:amruthpillai/reactive-resume @ commit `3c195dc3f8db5ccae4aa4aff0cefe54980c02b74` (default branch head at audit time), subpath `packages/dsh-plugin` |
| npm integrity | `sha512-nhScwrk4MnQHXy1bCE63oT/gmeIAvuvrA...` (`registry.npmjs.org/dsh-plugin-reactive-resume/0.1.0`, published 2026-08-18, fetched 2026-08-26) |
| Provenance | Partial. The registry record carries **no `gitHead`** and no npm attestation, so the tarball cannot be tied to a commit by metadata. Content equivalence was established by hand instead: the published `dist/index.js` (88 lines, unminified) was read in full against `src/` and matches function for function (section 4). |
| License | MIT (root LICENSE; `packages/dsh-plugin/package.json:20`) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review of the plugin package + published-tarball read) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The shipped plugin is 88 lines that do exactly one thing - hand your API key to the Reactive Resume
origin you configured and mount its MCP tools - with no telemetry, no child processes, no dynamic
code execution, and no credential path beyond the one environment variable the README names.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | One destination, chosen by config: `${config.url}/mcp`, default `https://rxresu.me`, over the `streamable-http` MCP transport. The plugin itself opens no other socket; the actual HTTP work happens inside `@deepseek-ai/dsh-mcp-client`, a declared peer. | src/index.ts:48-57; src/config.ts:24-27; dist/index.js:72-80 |
| Credential handling | Reads `apiKey` from plugin config and puts it in one header, `x-api-key`, on the MCP connection to that same origin. The bundle patch defaults that value to `process.env.RXRESUME_API_KEY ?? ''`. No other secret, file, or keychain is touched; there is no `.ssh`/`.aws`/`.claude`/browser-store read anywhere in the package. | src/index.ts:54; cordis.patch.yml:17; grep negative across src/ and dist/ |
| Runtime services | Injects `["systemPrompt"]` only (src/index.ts:31). Mounts `dsh-mcp-client` as a sub-plugin and contributes one system-prompt section named `reactive-resume:<serverName>` at order 150. No commands, no listeners, no timers. | src/index.ts:31, 50-65 |
| Tools reaching the model | Every tool the Reactive Resume MCP server publishes, namespaced `mcp__<serverName>__*`. That set includes destructive operations (`apply_resume_patch`, `update_resume`, delete paths named in the prompt guide). The package says plainly it cannot narrow the set, because `ctx.tools.restrict()` needs an agent-scoped context. | README.md:31; src/index.ts:24-30; src/prompt.ts:16-35 |
| Child processes | None. Zero `child_process`/`spawn`/`exec` in the package or its tarball. | grep over packages/dsh-plugin and the unpacked tarball |
| Dynamic code execution | None in the shipped bundle: no `eval(`, `new Function`, `vm.`, or dynamic `import()`. Schemastery is imported and used only to build the config schema at module load. | dist/index.js:1-2, 41-46; grep negative |
| Telemetry | None. No analytics endpoint, no beacon, no counters. | grep over src/ and dist/ |
| Failure posture | With no key configured the plugin logs a warning and mounts nothing rather than failing profile boot, which is why `apiKey` is not `.required()`. | src/index.ts:43-46; src/config.ts:19-23 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

Two runs were made. Against the whole monorepo the scanner returns 4062 findings (2 critical CRED,
3982 high NET), which measures a large web application, not this plugin. The graded subject is the
package, so the adjudicated run is the one scoped to `packages/dsh-plugin`: **8 findings**
(0 critical, 3 high NET, 1 medium CRED, 1 medium HOOK, 3 low NET). Machine verdict for that run is
D, off two gates: `cred-plus-net-package` and `finding-density`. Manual adjudication follows.

### Scanner highs and mediums adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high x3 `https://rxresu.me` (src/config.ts:26, src/config.test.ts:9, src/index.test.ts:31) | This is the product's own default origin, documented on the first line of the README and overridable for self-hosting. One of the three is the schema default; the other two are test fixtures. No undocumented host appears anywhere in the package. | src/config.ts:24-27; README.md:3, 37-43 |
| CRED medium `apiKey: !!js process.env.RXRESUME_API_KEY ?? ''` (cordis.patch.yml:17) | Accepted and documented. The variable is the one the README tells you to export; the `?? ''` fallback exists so installing before configuring leaves the profile bootable. The value flows to exactly one place: the `x-api-key` header on the configured origin. | cordis.patch.yml:9-17; README.md:15-21; src/index.ts:54 |
| HOOK medium `prepublishOnly: pnpm build` (package.json:50) | Not an install-time hook. `prepublishOnly` runs on the maintainer's machine at `npm publish`; it never executes for a consumer installing the registry tarball. No `preinstall`, `install`, `postinstall`, or `prepare` script exists in this package. | package.json:44-52 |
| `cred-plus-net-package` gate (machine D) | The gate fires because credential access and egress appear in the same package. Here they are the *same feature*: the key is the credential for the endpoint. Not a leak - the key never reaches a third host. The gate's own text concedes the flow is unproven; this card proves it, in the direction the product documents. | src/index.ts:48-57 |
| NET low x3 (package.json:16, 19, 21) | Repository, homepage, and issues metadata. Inert strings. | package.json:14-22 |

### Source-to-artifact comparison

`npm pack dsh-plugin-reactive-resume@0.1.0` yields six entries: `dist/index.js`, `dist/index.d.ts`,
`package.json`, `README.md`, `cordis.patch.yml`, `LICENSE`. No tests, no scripts, no sources beyond
the bundle. The whole of `dist/index.js` was read (88 lines): it is `src/prompt.ts` inlined
(dist:9-39 == src/prompt.ts:6-37), `src/config.ts` inlined (dist:41-46 == src/config.ts:18-33),
and `src/index.ts` inlined (dist:50-86 == src/index.ts:20-66), with the doc comments preserved.
Externals are exactly two: `@deepseek-ai/dsh-mcp-client` and `@deepseek-ai/schemastery`
(dist/index.js:1-2), both declared peers. Nothing was added by the build.

### Negative claims and what was searched

Searched all of `packages/dsh-plugin` (316 lines of src, 5 config files) and the unpacked tarball:
no `eval(`/`new Function`/`vm.`/dynamic `import()`; no `child_process`; no filesystem writes; no
`process.env` enumeration (the only env read is the one named variable, and it happens in the YAML
patch, not in code); no obfuscation signals; no install lifecycle hooks; no timers; no second
network host.

## 5. What we could not check

- **Tarball-to-commit provenance.** The registry record has no `gitHead` and no npm attestation, so
  nothing in the metadata ties `0.1.0` to commit `3c195dc3`. Content equivalence was established by
  reading, which is weaker than a byte-compare against a build. This is the main gap between this
  grade and A.
- **The MCP server on the other end.** This package is a bridge. What the tools actually do lives in
  `packages/mcp` and in the hosted rxresu.me deployment, neither of which was audited here. A user
  handing over an API key is trusting that service, not this 88-line adapter.
- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.
- **Peer runtime behavior.** `@deepseek-ai/dsh-mcp-client` performs the actual HTTP; its transitive
  advisories were not joined against a pinned OSV snapshot.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner's machine grade (D, from the credential-plus-egress gate) is
recorded above alongside the manual verdict rather than hidden. The disagreement is narrow and
factual: the gate says "a key is read and a network call exists in the same package"; the code says
they are the same operation, and the destination is the one the user configured.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/amruthpillai/reactive-resume /tmp/rr-audit
cd /tmp/rr-audit && git rev-parse HEAD   # expect 3c195dc3f8db5ccae4aa4aff0cefe54980c02b74

# 2. Re-run our scanner against the package, not the monorepo
node tools/scan/dist/index.js /tmp/rr-audit/packages/dsh-plugin   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
cd /tmp/rr-audit/packages/dsh-plugin
grep -rnE "eval\(|new Function|child_process|fetch\(" src/          # expect: no hits
grep -rn "process.env" . --include="*.ts" --include="*.yml"         # expect: only RXRESUME_API_KEY, in cordis.patch.yml
sed -n '48,57p' src/index.ts                                        # the single egress, with the key header

# 4. Read what npm actually ships (88 lines, no minification)
cd /tmp && npm pack dsh-plugin-reactive-resume@0.1.0 && tar -xzf dsh-plugin-reactive-resume-0.1.0.tgz
cat package/dist/index.js
tar -tzf dsh-plugin-reactive-resume-0.1.0.tgz                       # expect: dist, package.json, README, patch, LICENSE

# 5. Confirm the provenance gap for yourself
npm view dsh-plugin-reactive-resume@0.1.0 gitHead                   # expect: undefined
```

## 8. Methodology and pinned inputs

- Subject: git commit `3c195dc3f8db5ccae4aa4aff0cefe54980c02b74`, subpath `packages/dsh-plugin`
  (shallow clone at reference/audits/reactive-resume)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; monorepo run and
  package-scoped run both recorded in section 4
- Review: full manual read of src/{index,config,prompt}.ts, the three test files, package.json,
  cordis.patch.yml, README.md; plus download and full read of the published npm tarball
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: zero high or critical findings survive adjudication in the shipped package; the
  one egress and the one credential are the same documented feature; no dynamic execution, no
  hooks, no telemetry. Caps applied: no `gitHead` or attestation, no S4 probe, single reviewer -
  each alone bars A. Result: B.

## 9. Strengths

1. The shipped artifact is small enough to read end to end in one sitting, and it was: 88 lines,
   unminified, comments intact.
2. Configuration is honest about its own limits. The README states outright that every MCP tool is
   exposed and that narrowing is impossible from a plugin context (README.md:31) rather than
   implying a restriction that is not there.
3. Safe failure mode: no key means warn and mount nothing (src/index.ts:43-46), so installing before
   configuring cannot brick a profile.
4. The prompt section is defensive where it counts: read before patching, never delete unless asked
   in this conversation, restate the concrete edit before making it (src/prompt.ts:17, 34-35).
5. `serverName` is pattern-validated at parse time (src/config.ts:4, 30), so a second instance
   cannot silently collide with the first.

## 10. Residual risks

1. The tools are live and destructive by design. This card grades the adapter; the blast radius is
   your real resumes and job applications, and an agent holding these tools can change them
   immediately. The prompt guide is guidance, not enforcement.
2. No provenance metadata. A future `0.1.1` could ship different bytes with nothing in the registry
   record to compare against a commit. Re-vet on every bump.
3. Full tool surface, no allowlist. If Reactive Resume's MCP server adds a tool, this plugin exposes
   it automatically at the next connection.
4. The API key sits in the profile config or an environment variable in plaintext, as with any
   bearer credential. Anyone who can read your profile can read the key.
5. Single-package audit inside a large monorepo. The scanner's monorepo run (4062 findings) covers a
   web application this card does not grade; do not read this B as a statement about rxresu.me.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new network host, any `child_process`, any
   lifecycle hook, or any second credential read forces re-adjudication.
2. Diff the freshly published `dist/index.js` against `src/`. It is small enough to read; do so.
3. On upstream bumps: check whether `gitHead` or npm provenance appeared. If it did, upgrade the
   provenance line in section 1 and close residual risk 2.
4. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
5. Re-vet at 90 days or on any new release of `dsh-plugin-reactive-resume`, whichever comes first.
