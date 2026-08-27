# Trust Report Card: dsh-acp-for-bitfun

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-acp-for-bitfun` (DSH bundle exposing the BitFun agent as an ACP subagent provider) |
| Pinned subject | github:bobleer/dsh-acp-for-bitfun @ commit `8dedce1ee1a463cfb21e2ac0d8518a8d3c67c5aa` (2026-08-13) |
| npm integrity | Not published to npm (`npm view dsh-acp-for-bitfun` returns 404, checked 2026-08-27). Install is from git or a local checkout. |
| Provenance | None. No registry artifact, no attestation. Git commit is the only pin. |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual source read; the whole plugin is 110 lines) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A 110-line adapter that does nothing but validate config, run `bitfun --version` once at load, and
hand two official DeepSeek subagent packages their parameters: no network code, no filesystem
access, no credential reads, no dynamic code execution, and no install-time hooks anywhere in the
repository.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None in this package. It has no fetch, no http/https import, and no URL string that is ever requested. Egress, if any, belongs to the BitFun CLI and to the upstream `@deepseek-ai/dsh-subagent-acp` client, neither of which is part of this artifact. | grep for `fetch(`/`http`/`net`/`undici` across index.js returns only documentation URLs in comments and error text (index.js:3, 79) |
| Child processes | Two paths. (1) `spawnSync(command, ['--version'])` at load when `checkOnStart` is true (index.js:62). (2) The real delegation spawn is performed by `@deepseek-ai/dsh-subagent-acp`, which this plugin configures with `command`, `args` (default `['acp']`), and `env` (index.js:88-96). `command` defaults to the bare name `bitfun`, so it resolves on the user's PATH. No shell is used: `spawnSync` is called without `shell: true`, and arguments are passed as an array. | index.js:62, 88-96 |
| Credential reads | None. No `auth.json`, no `~/.ssh`, no keychain, no `process.env` enumeration. The only env surface is the user-declared `env` dict from config, which the user writes themselves (index.js:39, 94). | grep of index.js: zero `process.env` reads |
| Filesystem writes | None. No `fs` import at all. | grep `node:fs` = zero hits |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm`. | grep = zero hits |
| Telemetry | None. No analytics, beacons, or reporting code. | grep across the 9 files in the repo |
| Lifecycle hooks | None. `package.json` declares no `scripts` block at all, so no preinstall/postinstall/prepare runs on install. | package.json (full file read; no `scripts` key) |

Permission posture worth naming: `permission` defaults to `'reject'` (index.js:50), meaning
BitFun's `session/request_permission` prompts are auto-denied unless the user opts into `'allow'`.
That is the safe default and the right one.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0. Raw output: 6 findings (0 critical, 3 high, 3 low).
Every one adjudicated below; the package is small enough that the manual read is exhaustive.

| Finding | Severity (scanner) | Location | Adjudication |
|---|---|---|---|
| EXEC-004 `import { spawnSync } from 'node:child_process'` | high | index.js:16 | True positive as a capability, benign in use. The only direct spawn is the version probe on the next row. |
| EXEC-005 `spawnSync(command, ['--version'], ...)` | high | index.js:62 | Documented behavior: fail-loud liveness probe at profile boot, argv array (no shell), stdin ignored, stdout/stderr captured into an error message. `command` is operator-controlled config, not model- or network-controlled. |
| SUPPLY-010 repository URL | high | package.json:26 | False positive. A `repository.url` metadata field is not a supply-chain fetch. |
| NET-008 x3 (URL literals) | low | index.js:79, package.json:4, package.json:26 | False positives. All three are documentation links to github.com in a help message and in package metadata. None is fetched. |

### Negative claims and what was searched

Whole repository read (9 files: index.js, package.json, cordis.patch.yml, README.md, TODO.md,
LICENSE, .gitignore, pnpm-workspace.yaml, pnpm-lock.yaml). No `eval`/`new Function`/`vm`; no `fs`
import; no `http`/`https`/`fetch`/`undici` usage; no base64 blobs; no obfuscation (the source is
plainly formatted, comprehensively JSDoc'd, and unminified); no telemetry; no lifecycle scripts; no
credential-path strings; no timers or deferred work.

Dependency surface is three `@deepseek-ai/*` packages plus an optional `@deepseek-ai/cordis` peer
(package.json:33-42) - first-party DSH packages, not third-party code this author controls.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/delegate/idle run was performed. Static review covered
  every line, but the runtime composition (cordis loading the two upstream plugins) was not observed.
- **The upstream packages.** `@deepseek-ai/dsh-subagent-acp` and `@deepseek-ai/dsh-tool-subagent`
  do the actual process spawning and stdio JSON-RPC. They are official DSH packages and were not
  audited here; this card grades only the adapter.
- **BitFun itself.** The delegated agent (github:GCWing/BitFun) is a separate program with its own
  filesystem and network behavior. Nothing in this card says anything about it. Delegating a task to
  BitFun means trusting BitFun.
- **No published artifact to compare.** The package is not on npm, so there is no tarball integrity
  hash or provenance attestation to bind. Installing from git means trusting whatever the branch
  holds at install time, not this pinned commit.
- **pnpm-lock.yaml resolution** was not replayed against a pinned OSV snapshot for transitive
  advisories.

## 6. Reviewer disagreement

Single-reviewer pass (one model). The scanner graded three findings high; all three are adjudicated
down in section 4 with reasons, and both positions are recorded rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/bobleer/dsh-acp-for-bitfun /tmp/bitfun-audit
cd /tmp/bitfun-audit && git rev-parse HEAD   # expect 8dedce1ee1a463cfb21e2ac0d8518a8d3c67c5aa

wc -l index.js                               # 110 lines: read the whole thing
grep -n "eval(\|new Function\|vm\.\|node:fs\|fetch(\|http" index.js   # only comment/error-text URLs
grep -n '"scripts"' package.json             # no lifecycle hooks
sed -n '60,68p' index.js                     # the only spawn: bitfun --version
sed -n '46,54p' index.js                     # permission default: 'reject'
```

## 8. Methodology and pinned inputs

- Subject: git commit `8dedce1ee1a463cfb21e2ac0d8518a8d3c67c5aa` (shallow clone at
  reference/audits/dsh-acp-for-bitfun)
- Scanner: dsh-bridge tools/scan 0.1.0
- Review: complete read of every non-lockfile file in the repository
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: start at A. No production finding survived adjudication; no egress, no
  filesystem, no credentials, no dynamic exec, no lifecycle hooks. The `spawnSync` capability is
  the plugin's declared purpose and is operator-configured. Caps considered: absence of a published
  artifact and of provenance is a distribution weakness, not a code finding, and is recorded in
  sections 5 and 10 instead of lowering the grade for the pinned commit.

## 9. Strengths

1. Minimal surface by construction: 110 lines, one import from `node:child_process`, no fs, no net.
2. Safe default on the permission bridge: `permission` defaults to `'reject'` (index.js:50), so
   BitFun cannot auto-approve its own permission requests without an explicit operator change.
3. Fail-loud boot probe (index.js:66-84) turns a missing dependency into a clear startup error with
   remediation text instead of a mid-session failure.
4. No lifecycle scripts in package.json, so `pnpm add` executes none of this author's code at
   install time.
5. Delegation is delegated: process spawning, protocol handling, and teardown are left to the
   official `@deepseek-ai` subagent packages rather than re-implemented.

## 10. Residual risks

1. `command` defaults to a bare name resolved on `PATH`. A hostile earlier PATH entry named `bitfun`
   would be probed and then spawned. Set an absolute path if your PATH is not trusted (index.js:26-28
   documents this option).
2. Setting `permission: 'allow'` auto-approves every permission request BitFun makes for the whole
   session. That is a user choice, but it is a wide one.
3. Anything delegated to BitFun leaves this artifact's control: prompt text and whatever BitFun does
   with it are outside this audit.
4. Not on npm and no provenance: a git install resolves to branch HEAD, which may not be this commit.
5. The `env` config dict is passed to the child process verbatim (index.js:94); operators who put
   secrets there are handing them to BitFun by design.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new import of `node:fs`, `node:http`,
   `undici`, or a `scripts` block in package.json is a new finding requiring re-adjudication.
2. Diff `index.js`; the file is short enough that a full re-read is cheaper than partial checks.
3. If the package is ever published to npm, pin `dist.integrity` and check for provenance
   attestation, then raise a new revision with those fields filled.
4. On any bump of `@deepseek-ai/dsh-subagent-acp`, re-check the options passed at index.js:88-96
   against that package's current schema, especially `permission` and `env`.
