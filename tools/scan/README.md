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
| `dynamic-eval` | `EXEC` | high | `eval`, `new Function`, `vm.*`, `child_process`, `process.binding`, dynamic `import()`/`require()` with a computed specifier, string-bodied timers. Escalates to **critical** inside a shipped artifact (`lib/`, `dist/`, `*.min.js`). |
| `network-egress` | `NET` | high | `fetch`, `http`/`https`/`net`/`dgram`/`tls`, WebSocket/SSE, DNS lookups, literal remote URLs, and endpoints **assembled or decoded at runtime**. |
| `credential-access` | `CRED` | high | `~/.claude`, `~/.codex`, OpenCode `auth.json`, `~/.ssh`, `~/.aws`, `.env` reads, OS keychains, `~/.dsh` profile storage, and bulk `process.env` enumeration. |
| `lifecycle-hooks` | `HOOK` | medium | npm `preinstall`/`install`/`postinstall`/`prepare` scripts (parsed from `package.json`, severity raised when the command spawns a shell), process-lifecycle handlers, top-level timers and IIFEs, runtime `npm`/`npx` invocation. |
| `obfuscation` | `OBFU` | medium | High-entropy encoded blobs (Shannon ≥ 4.2 bits/char), decode-then-`eval` chains, obfuscator.io `_0x` identifiers and string-array rotation, zero-width/bidi characters, Latin↔Cyrillic homoglyph identifiers, hex-escaped member access. |

### Precision, on purpose

A trust layer that cries wolf is worse than none, so the rules encode their own known false
positives:

- **Comments are masked** before matching, at preserved byte offsets, so `// never use eval()`
  does not produce a finding while line numbers stay exact. String literals are deliberately kept,
  because URLs and credential paths live inside them.
- **Minification is not obfuscation.** `terser`-style short names are ignored; `_0x`-style hex
  names and string-array rotation are not.
- **Reading one named env var is normal**; `Object.keys(process.env)` is not, and is graded
  differently.
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
  self-test.ts        node:test smoke suite (43 assertions)
  rules/
    types.ts          Rule/Finding types, comment masking, line index, detector driver
    index.ts          registry + corpus digest
    dynamic-eval.ts   credential-access.ts   lifecycle-hooks.ts
    network-egress.ts obfuscation.ts
```

MIT.
