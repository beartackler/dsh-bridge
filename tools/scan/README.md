# `@dsh-bridge/scan`

Static scanner for DeepSeek Harness plugins. This is the analysis engine behind dsh-bridge
**trust report cards**: it walks a plugin's files, applies a versioned rule corpus, and emits a
deterministic JSON verdict plus a markdown report-card draft with `file:line` evidence for every
claim.

It implements **stage S3** of the [trust pipeline](../../docs/trust/pipeline-architecture.md).
It is deliberately *not* the whole pipeline, and it says so in every card it produces.

## Why this exists

Charter principle: *every claim about a third-party plugin must cite evidence (file:line).*
A grade nobody can recompute is just an assertion, so this scanner is built around three
properties:

| Property | How it is enforced |
|---|---|
| **Every claim is checkable** | Each finding carries `path:line:col`, a redacted excerpt, and `sha256` of the exact matched text. A reader can verify any citation against the artifact. |
| **Output is deterministic** | Directory walk is sorted, findings have a total order, JSON keys are sorted, and no timestamps or absolute paths enter the output. Same input bytes ⇒ same output bytes. |
| **Nothing can raise a grade** | Grading is a pure function of the finding set. Caps are monotone: `final = min(band_from_score, …caps)`. |

## Install and build

No runtime dependencies. TypeScript is the only build-time dependency, and `@types/node` supplies
the stdlib types.

```bash
npm install     # typescript + @types/node only
npm run build   # tsc -> dist/
npm test        # build, then node --test dist/self-test.js
```

Requires Node ≥ 20.6.

## Usage

```bash
# Print the JSON verdict to stdout
node dist/index.js ./path/to/plugin

# Write both artifacts and gate CI on high-severity findings
node dist/index.js ./path/to/plugin \
  --json  out/verdict.json \
  --markdown out/card.md \
  --fail-on high
```

| Option | Meaning |
|---|---|
| `--json <path>` | Canonical, key-sorted JSON verdict |
| `--markdown <path>` | Markdown trust-card draft |
| `--fail-on <sev>` | Exit `1` if any finding is at or above `info\|low\|medium\|high\|critical` |
| `--quiet` | Suppress the stdout summary line |

Exit codes: `0` ok · `1` threshold exceeded · `2` usage or I/O error.

### As a library

```ts
import { scanDirectory, grade, toMarkdownReport } from "@dsh-bridge/scan";

const result  = scanDirectory("./plugin");
const grading = grade(result.findings);
console.log(grading.grade, grading.gates);   // e.g. "F" [ "cred-plus-net" ]
console.log(toMarkdownReport(result, grading));
```

## Rules

Each rule is a plain object: `{ id, family, severity, description, version, match(content, filePath) }`.
`match` is **pure** — same inputs always yield the same findings, with no `lastIndex` state carried
between calls.

| Rule | Family | Base severity | Detects |
|---|---|---|---|
| `dynamic-eval` | `EXEC` | high | `eval`, `new Function`, bare `Function(...)`, indirect and aliased eval (`(0, eval)`, `globalThis.eval`, `const e = eval`), `vm.*`, `child_process`, `process.binding`, dynamic `import()`/`require()` with a computed specifier, string-bodied and decode-fed timers. Escalates to **critical** inside a shipped artifact (`lib/`, `dist/`, `*.min.js`). |
| `network-egress` | `NET` | high | `fetch`, `http`/`https`/`net`/`dgram`/`tls`, WebSocket/SSE, DNS lookups, literal remote URLs, third-party HTTP clients (`axios`, `got`, `node-fetch`, `undici`, `ky`, …), cloud instance-metadata endpoints, and endpoints **assembled or decoded at runtime**. |
| `credential-access` | `CRED` | high | `~/.claude`, `~/.codex`, OpenCode `auth.json`, `~/.ssh`, `~/.aws`, `.env` reads, OS keychains, `~/.dsh` profile storage, bulk `process.env` enumeration including the computed `process["env"]` form, and undocumented string-keyed `process` members. |
| `lifecycle-hooks` | `HOOK` | medium | npm `preinstall`/`install`/`postinstall`/`prepare` scripts (parsed from `package.json`, severity raised when the command spawns a shell), process-lifecycle handlers, top-level timers and IIFEs, runtime `npm`/`npx` invocation. Runtime-only: CI workflows and docs are out of scope. |
| `obfuscation` | `OBFU` | medium | High-entropy encoded blobs (Shannon ≥ 4.2 bits/char, with a low-severity second tier at 48 chars), decode-then-`eval` chains both adjacent and **staged through variables**, obfuscator.io `_0x` identifiers and string-array rotation, zero-width/bidi characters, Latin↔Cyrillic homoglyph identifiers, hex-escaped member access. |
| `telemetry-beacons` | `PRIV` | high | Telemetry and tracking: analytics SDK imports (`posthog`, Sentry, Mixpanel, Amplitude, Segment), known collector endpoints (Baidu Tongji, Google Analytics, Matomo, Plausible, Sentry ingest), generic `/telemetry` `/collect` `/beacon` upload paths on arbitrary hosts, and `navigator.sendBeacon`. Docs files are out of scope; example hosts and loopback collectors are filtered. |
| `shell-invocation` | `EXEC` | high | Shell-mediated execution shapes rather than spawn call sites: PowerShell `-enc`/`-Command`, command-string `sh -c` (quoted or argv form), `cmd.exe /c|/k`, `{ shell: true }`, and `osascript -e`. Array-argv spawns of fixed binaries stay quiet; CI workflows and docs are out of scope. |
| `credential-cli-harvest` | `CRED` | high | Credential access performed through subprocesses instead of fs APIs: silent `gh auth token` adoption (shell or argv form), `printenv`/`env` dumps via exec-family calls, `sshpass -p` inline passwords, and `cat` over `.env`-style files. `#` comments in YAML/shell are masked first. |
| `manifest-supply-risk` | `SUPPLY` | medium | Manifest-level supply-chain risk in `package.json`: dependencies pinned to git hosts or tarball URLs (mutable sources that resolve at click time) at high, and install-time native-binary fetchers (`prebuild-install`, `node-gyp`, `node-pre-gyp`, `prebuildify`) at medium. Applies only to manifests. |

Detector IDs, so a finding on a card can be traced back to its rationale:

| ID | Severity | What it means |
|---|---|---|
| `EXEC-001`…`EXEC-009` | high / critical | Direct `eval`, `new Function`, `vm`, `child_process` import, spawn-family call, computed `import()`/`require()`, `process.binding`, literal string timer body. |
| `EXEC-010` | high / critical | Indirect eval: `(0, eval)`, `globalThis.eval`, `globalThis["eval"]`. |
| `EXEC-011` | high / critical | `eval` aliased to a variable; the call site hides behind an ordinary identifier. |
| `EXEC-012` | high / critical | `Function(...)` called without `new`. |
| `EXEC-013` | high / critical | Timer body produced by a decode call: delayed dynamic execution. |
| `EXEC-014` | medium | Timer first argument is neither a function literal nor a plain reference. Low confidence by design. |
| `NET-001`…`NET-009` | low → critical | fetch, socket/HTTP client call, core-module import, WebSocket/SSE, XHR, DNS, unknown-host URL, known-host URL, decode-fed request target. |
| `NET-010` | high | URL concatenation whose operands include a decode call. |
| `NET-011` | medium | Imports a third-party HTTP client library. Common and legitimate; the card must list the capability. |
| `NET-012` | critical | Request target is a cloud instance-metadata or link-local address. |
| `NET-013` | medium | Base URL assembled from configuration values. The benign counterpart of `NET-010`. |
| `NET-014` | medium | Request target is an opaque variable, in a file that also decodes data. |
| `CRED-001`…`CRED-010` | medium → critical | Credential directories and files, `.env` reads, OS keychains, secret-shaped env vars, bulk `process.env` enumeration (`process.env` and `process["env"]`). |
| `CRED-011` | medium | String-keyed access to an undocumented `process` member, e.g. `process["binding"]`. |
| `CRED-012` | high | The whole environment object is aliased to a variable, enabling enumeration away from the `process.env` token. |
| `HOOK-000`…`HOOK-007` | low → high | Unparseable manifest, install-time hooks (shell-spawning or not), Cordis and process lifecycle listeners, top-level IIFEs and timers, runtime `npm`/`npx`. |
| `OBFU-001` | medium | High-entropy literal ≥ 120 chars. |
| `OBFU-002`…`OBFU-009` | medium / high / critical | Adjacent decode-then-execute, large base64/hex blob, `_0x` identifiers, string-array rotation, zero-width and bidi controls, homoglyph identifiers, `fromCharCode` rebuilds, hex-escaped member access. |
| `OBFU-010` | medium | A decode call anywhere in a module that also executes code or performs network I/O. Adjacency is not required. |
| `OBFU-011` | low | Unicode line separator (U+2028/U+2029). Separated from the bidi-override case, which stays high. |
| `OBFU-012` | low | High-entropy literal between 48 and 120 chars inside a decoding or executing module: split-payload evidence. |
| `PRIV-001` | high | Imports a telemetry/analytics SDK. |
| `PRIV-002` | high | References a third-party analytics-collector endpoint (Baidu Tongji, GA, Sentry ingest, PostHog, Mixpanel, Amplitude). |
| `PRIV-003` | medium | Upload path shaped like a telemetry collector (`/telemetry`, `/collect`, `/beacon`, `/analytics`) on an arbitrary host. |
| `PRIV-004` | medium | `navigator.sendBeacon()`: unload-safe tracking request. |
| `EXEC-020` | critical | PowerShell `-enc`/`-EncodedCommand`: base64 payload unreadable at the call site. |
| `EXEC-021` | high | Command-string or argv-form `sh -c`: anything interpolated into it executes. |
| `EXEC-022` | high | Spawn option `{ shell: true }`: arguments lose their quoting guarantees. |
| `EXEC-023` | high | `osascript -e` AppleScript execution. |
| `EXEC-024` | high | PowerShell `-Command` inline script. |
| `EXEC-026` | high | `cmd.exe /c|/k`: the following string runs as a Windows batch command. |
| `CRED-020` | high | Silent `gh auth token` invocation: adopts the user's GitHub CLI identity. |
| `CRED-021` | high | Environment dump via subprocess (`exec("printenv")` family), bypassing `process.env` detectors. |
| `CRED-022` | high | `sshpass -p`: password exposed as a command-line argument. |
| `CRED-023` | medium | `cat` over a `.env`-style file: plaintext secrets read through the shell. |
| `SUPPLY-010` | high | Dependency pinned to a git host (`github:` or `git+...`): resolves to moving HEAD at install time. |
| `SUPPLY-011` | high | Dependency fetched as a tarball URL: bytes are whatever the host serves at install time. |
| `SUPPLY-012` | medium | Native-build tooling declared (`prebuild-install`, `node-gyp`, `node-pre-gyp`, `prebuildify`): install-time binary fetch/build surface. |
| `SUPPLY-000` | low | A rule crashed on a file; it was not fully analyzed. |
| `SUPPLY-001` | high | A file exceeded the scan limit and its contents were not read at all. |

### Precision, on purpose

A trust layer that cries wolf is worse than none, so the rules encode their own known false
positives:

- **Comments are masked** before matching, at preserved byte offsets, so `// never use eval()`
  does not produce a finding while line numbers stay exact. String literals are deliberately kept,
  because URLs and credential paths live inside them.
- **Minification is not obfuscation.** `terser`-style short names are ignored; `_0x`-style hex
  names and string-array rotation are not.
- **Reading one named env var is normal**; `Object.keys(process.env)` is not, and is graded
  differently. Computed access (`process["env"]`) is treated identically to the literal form,
  because using a string key is a choice to be harder to read, not a different operation.
- **`RegExp.prototype.exec` is not a process spawn.** `/^v(\d+)/.exec(version)` is idiomatic JS,
  so the spawn detector rejects member-call and regex-literal forms; a real `child_process` import
  is caught independently.
- **A configurable base URL is not concealment.** `"https://" + host` is how well-behaved API
  plugins are written, and is reported at medium (`NET-013`); high is reserved for concatenation
  fed by a decode call.
- **A leading UTF-8 BOM is an editor artifact**, not a Trojan Source attack; it cannot conceal
  anything because nothing precedes it. Bidi overrides after offset 0 remain high.
- **CI workflows and docs are build-time, not runtime.** `npm install` in a GitHub Actions job is
  the job's purpose, so the HOOK family does not apply there, and `#` comments in YAML are masked
  before credential detectors run.
- **Expected hosts** (npm, GitHub, DeepSeek) are still reported — the card lists all egress — but at
  `low` severity, so they do not drown out an unknown endpoint.
- Every finding carries a `confidence` score; regex detectors never claim `1.0`.

Excerpts are **redacted** for secret-shaped values (`sk-…`, `ghp_…`, `AKIA…`, JWTs) before they
reach a report. A scanner that pastes a harvested token into a public markdown card has itself
leaked the token.

## Grading

Score starts at 100 and deducts per finding (`low` 1, `medium` 4, `high` 12, `critical` 34), then
bands: A ≥ 90, B ≥ 75, C ≥ 55, D ≥ 35, else F. **Hard gates then override the band and can only
lower it:**

| Gate | Effect | Source |
|---|---|---|
| `cred-plus-net` | **F** | Credential access and network egress in the same module. Reachability is unproven, so it is treated as reachable. |
| `cred-plus-net-split` | **F** | The same pair split across modules of one package, with a concealment signal present. Splitting the files does not make the flow unreachable. |
| `cred-plus-net-package` | **D** | The same pair split across modules of one package with no concealment signal. The flow between them is unproven in either direction. |
| `finding-density` | **C** | One behavior family appears in three or more separate files. Fragmenting findings dilutes per-severity counts without reducing the capability. |
| `unanalyzed-content` | **C** | At least one file exceeded the scan limit and was not read. Absence of findings there is absence of evidence. |
| `obfuscated-payload-executed` | **F** | Decoded data passed to `eval`/`Function`. |
| `concealed-egress` | **F** | Request target decoded at runtime rather than declared. |
| `install-hook-shell` | **D** | An npm install hook spawns a shell before consent. |
| `dynamic-exec-present` | **C** | Any dynamic code execution in shipped code. |

Grades render as **letter + icon + word label**, never color alone (WCAG 1.4.1); the markdown card
has no color at all, which is the strictest test of that design.

## What this scanner does not do

Stated plainly because overstating coverage is the failure mode that would discredit the whole
trust layer:

- **No runtime observation.** Timers, delayed beacons, and config-triggered paths need the
  sandboxed behavioral probe (S4).
- **No dependency analysis.** SBOM, transitive resolution, and vulnerability joins are S2.
- **No adversarial model review.** Cross-model red-team and falsifier passes are S5.
- **No reachability analysis.** Findings are located, not proven reachable from an entry point.
  Unknown reachability is treated as reachable, which is conservative and will over-report.
- **Regex detectors, not an AST.** Adequate for a first pass over readable source; a determined
  adversary can evade any of them. That is precisely why a grade requires the later stages too.

**Absence of findings is not proof of safety.** It means these rules matched nothing.

## Adding a rule

1. Create `src/rules/<id>.ts` exporting a `Rule`. Funnel detectors through `runDetectors()` so
   evidence shape, hashing, redaction, and ordering stay identical everywhere.
2. Register it in `src/rules/index.ts` (the registry is sorted by id; `rulesDigest()` covers id,
   family, severity, and version).
3. Add a **positive and a negative fixture** to `src/self-test.ts`. The negative fixture is the
   important one.
4. Bump the rule's `version` whenever its detectors change, so cards record which corpus produced
   them.

## Layout

```
src/
  index.ts            directory walk + CLI (exit codes for CI)
  report.ts           grading, canonical JSON, markdown card
  self-test.ts        node:test suite (114 tests)
  rules/
    types.ts          Rule/Finding types, comment masking, line index, detector driver
    index.ts          registry + corpus digest
    dynamic-eval.ts   credential-access.ts   lifecycle-hooks.ts
    network-egress.ts obfuscation.ts         telemetry-beacons.ts
    shell-invocation.ts credential-cli-harvest.ts manifest-supply-risk.ts
```

MIT.
