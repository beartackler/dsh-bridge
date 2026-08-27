# Trust Report Card: cyber-particle (dsh-cyber-particle)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `cyber-particle` (particle-network background overlay for the DSH Web shell) |
| Pinned subject | github:AKS1st/dsh-cyber-particle @ commit `e08111d59df009454d9de6b8384907f697e038f6` (default branch `master`, shallow clone) |
| npm integrity | Not published. `npm view cyber-particle` returns 404; `package.json:5` sets `"private": true`. Install path is `dsh plugin --profile web add github:AKS1st/dsh-cyber-particle`. |
| Provenance | None available (no npm artifact, no attestation). Git commit is the only pin. |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of every shipped file) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A browser-only cosmetic overlay whose entire shipped surface is 443 lines of readable code: the node
half is an empty `apply()`, the browser half draws a canvas and stores seven numeric/color settings
in `localStorage`, and there is no network call, no filesystem access, no credential read, no
lifecycle hook, and no dynamic code execution anywhere in the repository.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The only URLs in the whole tree are the repository URL in the manifest and doc links in the READMEs. No `fetch`, `XMLHttpRequest`, `WebSocket`, or `import()` of a remote specifier exists in `client.js` or `index.js`. | grep for `fetch|XMLHttp|http` over `client.js`/`index.js` returns only comment text; `package.json:37` repo URL |
| Host-side behavior | None. `index.js:8` is `export function apply() {}` — the entire node half. No `webServer` route, no service injection. | index.js:1-8 |
| Browser-side behavior | Registers two UI slots (`shell.overlay` particle canvas, `settings.section` settings page) and appends one `<style>` element; every registration is unwound on dispose. | client.js:422-430 (slots), client.js:399-419 (style element + dispose), client.js:92 (locale dispose) |
| Persistence | `localStorage` key `cyber-particle:config` only, capped at 16 KB, with try/catch fallbacks for private mode. Nothing written to disk. | client.js:111-147 |
| Child processes | None. No `child_process`, `spawn`, `exec`, or shell string anywhere. | grep over both JS files |
| Credential reads | None. No `process.env` enumeration, no `~/.ssh`, no auth files, no keychain. | grep over both JS files |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, or string-compiled code. The single `require('react')` at client.js:14 is the DSH web module loader's injected resolver, not Node CommonJS. | client.js:14 |
| Telemetry | None. No analytics, beacon, or metrics code; the plugin cannot reach the network at all. | negative claim, scope: all 4 code/config files |
| Timers | One `ctx.interval(draw, 33)` render loop, stopped on `visibilitychange` and on dispose, and skipped entirely under `prefers-reduced-motion`. | client.js:288-313 |

Scope of the negative claims above: the repository contains exactly nine files, of which four are
code or config (`index.js`, `client.js`, `package.json`, `cordis.patch.yml`) and were read in full;
the rest are two PNG screenshots, two READMEs, and LICENSE.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 6 findings (3 high, 3 low), 4 files scanned, machine grade C with gate
`dynamic-exec-present`. All six adjudicated below; none survives.

| Finding | Scanner claim | Adjudication | Evidence |
|---|---|---|---|
| `dynamic-eval` high, client.js:229 | dynamic execution | False positive. `particles.push(spawn(true))` — `spawn` is a local arrow function returning a plain `{x, y, vx, vy}` particle object, not `child_process.spawn`. | client.js:214-225 defines `const spawn = (inside) => {...}` returning an object literal |
| `dynamic-eval` high, client.js:252 | dynamic execution | False positive. Same local `spawn`, respawning an off-screen particle. | client.js:249-254 |
| `manifest-supply-risk` high, package.json:37 | supply risk | False positive as a risk signal. The matched string is the package's own `repository.url`. The package has no dependencies of any kind (no `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` keys exist) and no `scripts` key, so there is no install-time supply chain. | package.json read in full (39 lines) |
| `network-egress` low, package.json:37 | egress | False positive. Same repository URL string in manifest metadata. | package.json:37 |
| `lifecycle-hooks` low, client.js:92 | lifecycle hook | Correct detection, benign behavior. `ctx.on('dispose', ...)` unregisters the locale dictionary. This is cleanup, not an install-time hook; no npm lifecycle scripts exist. | client.js:89-93 |
| `lifecycle-hooks` low, client.js:417 | lifecycle hook | Same: removes the injected `<style>` element on dispose. | client.js:417-419 |

Additional negative checks run and what was searched: `grep -nE "eval|new Function|fetch|XMLHttp|
http|localStorage|innerHTML|import\(|child_process|require\("` across `client.js` returned only the
`require('react')` loader call, the four `localStorage` calls listed in section 3, and comment text.
No `innerHTML` assignment exists; the style element is populated via `textContent` (client.js:400)
and all DOM construction goes through `React.createElement`.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/idle-soak run was performed. Static review
  covers the full file set, but cannot observe runtime behavior inside a live DSH web shell.
- **Published-artifact comparison.** There is nothing to compare: the package is `private: true` and
  absent from npm, so no tarball, integrity hash, or provenance attestation exists. Users install
  straight from the git ref, which means the audited bytes are the installed bytes only if the ref
  is pinned. `master` moves.
- **Asset bytes.** `assets/image_dark.png` and `assets/image_light.png` (together ~800 KB, the bulk
  of the clone) are README screenshots; they are not referenced by any code path we read and were
  not decoded or inspected for embedded payloads.
- **Host API assumptions.** The plugin trusts `ctx.get('slots')`, `ctx.get('locale')`, and
  `ctx.interval` to behave as DSH documents. We did not verify the host side of those seams.
- **Upstream repository controls.** No review of the maintainer account's 2FA, branch protection, or
  release process.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded C on the strength
of the `spawn(` substring and the manifest URL; the manual verdict is A. Both positions are recorded
in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/AKS1st/dsh-cyber-particle /tmp/cyber-particle-audit
cd /tmp/cyber-particle-audit && git rev-parse HEAD
#   expect e08111d59df009454d9de6b8384907f697e038f6

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/cyber-particle-audit

# 3. The whole attack surface is four files; read them
wc -l index.js client.js package.json cordis.patch.yml   # expect 8 435 39 7

# 4. Spot-check the headline claims
cat index.js                                              # node half: empty apply()
grep -nE "eval\(|new Function|vm\.|child_process" *.js    # dynamic exec / subprocess: none
grep -nE "fetch\(|XMLHttpRequest|WebSocket" *.js          # egress: none
grep -n "spawn" client.js                                 # local particle factory, not child_process
grep -n "dependencies\|scripts" package.json              # neither key exists
```

## 8. Methodology and pinned inputs

- Subject: git commit `e08111d59df009454d9de6b8384907f697e038f6`, shallow clone at
  `reference/audits/dsh-cyber-particle`, 9 files total.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Review: full manual read of `client.js` (435 lines), `index.js` (8), `package.json` (39),
  `cordis.patch.yml` (7). READMEs skimmed for install instructions.
- Registry check: `npm view cyber-particle` (404, package not published).
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start at A. No egress, no filesystem access, no credential access, no
  subprocess, no dynamic execution, no install hooks, no telemetry, no minified or generated code —
  every capability band that would pull the grade toward B or below is absent. No caps applied. The
  missing published artifact is a verification gap (section 5), not a finding, and the git-ref
  install model is called out as a residual risk rather than graded as a defect.

## 9. Strengths

1. Smallest possible host footprint: the node half is a literal no-op (`index.js:8`), so the plugin
   cannot register a route, read a file, or reach the network from the privileged side.
2. Full reversibility: locale registration, the `<style>` element, the render interval, and the
   `visibilitychange` listener each have a matching dispose or cleanup path
   (client.js:92, 309-313, 417-419).
3. Accessibility and cost discipline that also reduce risk surface: honors
   `prefers-reduced-motion`, stops the loop when the tab is hidden, and marks the overlay
   `aria-hidden` with `pointerEvents: 'none'` so it cannot intercept input
   (client.js:288-308, 316-318).
4. Input hygiene on persisted config: hex colors validated against `/^[0-9a-fA-F]{6}$/` before use,
   numeric fields clamped, stored blob size-capped at 16 KB, and corrupt JSON silently falls back to
   defaults (client.js:31, 27, 112-117, 139-147).
5. Zero dependencies and zero npm scripts, so there is no install-time code path at all.

## 10. Residual risks

1. Install-by-git-ref with a moving `master`: `dsh plugin add github:AKS1st/dsh-cyber-particle`
   resolves to whatever the branch points at, not to the audited commit. This grade covers
   `e08111d5` only.
2. No published artifact means no npm attestation or integrity hash to bind an install to a reviewed
   source tree; trust rests entirely on GitHub account control.
3. The overlay renders on every frame batch at `zIndex: 0` across the whole shell (client.js:317).
   Worst realistic case is a cosmetic or performance regression, not a security one, but a bad
   config (240 particles, 400 px link distance) makes the O(n^2) link loop expensive
   (client.js:200, 256-272).
4. Comments and inline documentation are Chinese-only, so an English-speaking reviewer re-verifying
   this card is reading code without prose support.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new `fetch`/`XMLHttpRequest`, any non-empty
   body in `index.js`, or any appearance of a `scripts` or `dependencies` key in `package.json` must
   be re-adjudicated before this grade carries forward.
2. If the package is ever published to npm, compare `npm view cyber-particle gitHead` against the
   audited commit and record `dist.integrity` in the header; until then the header's "not published"
   line is itself a claim to re-check.
3. On any bump, re-read `client.js` slot registrations (client.js:422-430): a new slot name, or a
   registration without a matching dispose, changes the reversibility claim in section 9.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
