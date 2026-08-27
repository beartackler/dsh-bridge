# Trust Report Card: dsh-kimino-theme

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-kimino-theme` (Your Name / Kimi no Na wa theme for the DSH Web GUI; ships a Cordis plugin pair, an installable bundle, and a dsh-market skin) |
| Pinned subject | github:niiang/dsh-kimino-theme @ commit `2c74b3f1c6ba4090409c4f73dc628f6804ec9961` (default branch `main`, shallow clone) |
| npm integrity | `sha512-AHkagVyjwP3id1vp+KccZrBjzy/9kaANNHo4Tu8XGSlnAr+9/Qiu+bdi884mxYzkwl/49F5skB6N9tLc0ZIm7w==` (`registry.npmjs.org/dsh-kimino-theme/66.2.0`, fetched 2026-08-26) |
| Provenance | Registry `gitHead` equals the pinned commit `2c74b3f1...`. No SLSA/npm attestation was observed. The in-repo `skin/kimino/dsh-market.provenance.json` is a hash-pinning record, not a signature; both pinned hashes verify (section 4). |
| License | MIT for the code (LICENSE). Artwork is explicitly *not* MIT: `skin.json:24` declares "MIT (code) — artwork (c) CoMix Wave Films / Toho, personal desktop use only". |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of both plugin halves, the skin hooks, and the mint script) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A cosmetic theme with no network egress, no credential access, no subprocess, and no dynamic code
execution; it lands at B rather than A because the host half registers three HTTP routes on the DSH
web server and the browser half installs document-wide capture-phase `wheel`/`scroll` listeners plus
two whole-body `MutationObserver`s, so its blast radius on UI behavior is broader than a stylesheet
even though nothing leaves the machine.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None at runtime. Every URL in the tree is metadata or documentation: the repo/homepage/bugs URLs in `package.json:31-37`, the skin schema URL `https://schemas.linxin666.org/dsh-skin/v2.json` (`skin/kimino/skin.json:2`, a `$schema` string, never fetched by any code we read), and `https://dsh-market.com` as the `source` label in the provenance record (`skin/kimino/dsh-market.provenance.json:3`, written as a literal by `scripts/mint-provenance.mjs:32`). No `fetch`, `XMLHttpRequest`, or `WebSocket` in `bundle/*.js`, `plugin/*.js`, or `hooks.mjs`. | grep over all JS/MJS; see section 4 |
| Host HTTP routes | Three exact-path GET routes on the host's own web server: `/kimino-bg/current.jpg`, `/kimino-bg/logo-blue.svg`, `/kimino-bg/logo-letter.svg`. Each serves one hard-coded file path derived from `import.meta.url`, with no request-controlled path component, so there is no traversal parameter. Registration failures are caught and skipped rather than failing the profile. | bundle/host.js:14-31 (fixed ROUTES), 38-64 (handler), 65-68 (tolerant skip) |
| Filesystem reads | Only the three bundled asset files above, via `readFile` on paths joined from the module's own directory. No writes anywhere in the runtime code. The one writer in the repo is the developer script `scripts/mint-provenance.mjs:39`, which writes `dsh-market.provenance.json` inside the skin dir and is never invoked at install or load time. | bundle/host.js:8-31, 44; scripts/mint-provenance.mjs:37-40 |
| Browser DOM behavior | Overrides ~60 `--dsw-alias-*` theme tokens through the documented `ctx.theme.overrideTokens` seam, appends one `<style>` element, sets one `data-kimino-theme` attribute on `<html>`, rewrites matching `<textarea>` placeholder strings, and marks chat scrollers with a `data-conversation-scroll` attribute. | bundle/client.js:40-107 (tokens), 108-109 (attribute), 203/538 (style element), 18-37 (placeholders), 136-148 (scroller marking) |
| Global event interception | Document-level capture-phase listeners: `wheel` x2 (`composerWheel`, `cardChromeWheel`) and `scroll` x1 (`relayChatScroll`). The wheel handlers call `preventDefault()` and `stopImmediatePropagation()` on matching composer/card targets and can programmatically set `scrollTop` on the chat scroller. | bundle/client.js:130-131, 186-187, 201-202; same logic at skin/kimino/hooks.mjs:79-121 |
| Child processes | None. No `child_process`, `spawn`, or `exec` in any file. | grep over all JS/MJS |
| Credential reads | None. No `process.env` read, no `~/.ssh`, no auth or session files, no keychain, no browser storage read. The plugin does not use `localStorage` at all. | grep over all JS/MJS |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`, or string-compiled code. The CSS is injected via `textContent`, not `innerHTML`. | grep over all JS/MJS; bundle/client.js:203-538 |
| Telemetry | None. No analytics, beacon, or metrics code; with no egress path the plugin cannot report anything. | negative claim, scope stated below |
| Lifecycle hooks | No npm lifecycle scripts at all — `package.json` has no `scripts` key. The skin hooks file declares "no top-level side effects" and honors it: everything happens inside the default-exported factory's `apply(ctx)`. | package.json read in full (47 lines); skin/kimino/hooks.mjs:15-19 |

Scope of the negative claims: all 10 code/config files were read or grepped in full —
`bundle/host.js` (71 lines), `bundle/client.js` (546), `plugin/host.js` (95), `plugin/client.js`
(540), `skin/kimino/hooks.mjs` (121), `scripts/mint-provenance.mjs` (43), `package.json`,
`cordis.patch.yml`, `.npmrc`, `skin/kimino/skin.json`. The remaining 19 files are images, SVGs, CSS,
docs, and LICENSE.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 8 findings (4 high, 4 low), 10 files scanned, machine grade D with gate
`finding-density`. Every finding is a URL string in metadata; none is executed code.

| Finding | Scanner claim | Adjudication | Evidence |
|---|---|---|---|
| `manifest-supply-risk` high, package.json:31 | supply risk | False positive as a risk signal: the match is the package's own `repository.url`. The package declares no `dependencies`, `devDependencies`, or `peerDependencies` and no `scripts`, so there is no install-time supply chain. | package.json read in full |
| `network-egress` high, skin.json:2 | egress | False positive. `"$schema": "https://schemas.linxin666.org/dsh-skin/v2.json"` is editor/validator metadata. No code in this repo reads `$schema` or fetches it. | skin/kimino/skin.json:2 |
| `network-egress` high, dsh-market.provenance.json:3 | egress | False positive. `"source": "https://dsh-market.com"` is a provenance label. | skin/kimino/dsh-market.provenance.json:3 |
| `network-egress` high, mint-provenance.mjs:32 | egress | False positive. The same label written as a string literal into the JSON record; the script's only I/O is `readFileSync`/`writeFileSync`. | scripts/mint-provenance.mjs:20-40 |
| `network-egress` low x4 (package.json:31,35,37; skin.json:23) | egress | False positives: `repository`, `homepage`, `bugs`, and `sourceUrl` metadata strings. | those lines |

### Provenance record independently verified

The skin ships a hash-pinning record that the upstream skin-center gate uses to decide whether to
run `hooks.mjs`. We recomputed both hashes at the pinned commit and they match exactly:

| File | Record (`dsh-market.provenance.json`) | Recomputed `shasum -a 256` |
|---|---|---|
| `skin.json` | `ab77762a20963d1934e8202a7a9d7d61a9869a3e7ce8506d7577bd6e8cd12ad5` | identical |
| `hooks.mjs` | `fb803b9fa2343217681a919d6310a18b862c29b34bc29f907887d04e11d2ac90` | identical |

The record is self-minted by the skin author (`scripts/mint-provenance.mjs`) and the script's own
header says so plainly: it "is a provenance record, not a capability guard against the local user".
We treat it as an integrity check on the two files, not as an authenticity signature.

### Findings kept (documented behavior)

| ID | Severity | Location | Note |
|---|---|---|---|
| KIMI-ROUTE-1 | low | bundle/host.js:14-31, 38-64 | Registers three exact-path routes on the host web server that read three fixed bundled files. No request input reaches the path, no directory listing, cache headers only. The surface exists whenever the profile is loaded. |
| KIMI-DOM-1 | low | bundle/client.js:130-131, 186-187 | Capture-phase `wheel` handlers that `preventDefault()` and `stopImmediatePropagation()`, and can set `scrollTop` on the chat scroller. Intended as scroll-isolation fixes; a bug here degrades scrolling for the whole shell. |
| KIMI-DOM-2 | low | bundle/client.js:34-35, 143-144 | Two `MutationObserver`s on `document.body` with `subtree: true`. They only read `placeholder` attributes and add a marker attribute, but they observe every DOM change in the app. |
| KIMI-DOM-3 | low | bundle/client.js:18-37; skin/kimino/hooks.mjs:20-37 | Placeholder-text substitution keyed on four exact upstream strings. Cosmetic, but it means UI copy the user sees does not come from the host. |
| KIMI-CSS-1 | low | bundle/client.js:203-538 | ~330 lines of CSS overriding shell internals via generated class names (`.Md3f7G_scroll`, `.wSkVaW_scrollBody`). Brittle across DSH upgrades; a stale selector produces visual breakage, not a security issue. |
| KIMI-LIC-1 | medium | skin/kimino/skin.json:24-25; assets/ | Bundled wallpaper and logo derive from copyrighted film promotional material; the manifest states rights belong to CoMix Wave Films / Toho and limits use to "personal desktop use only". This is a licensing exposure for anyone redistributing or using it commercially, not a code-safety defect. |

### Dual code paths worth knowing about

The repo ships the same theme three ways and we read all three: `bundle/*` (the installable
package, uses `import.meta.url`-relative asset paths), `plugin/*` (an older dynamic-plugin variant
whose `host.js` carries a `<CLONE_DIR>` placeholder the installer must rewrite,
`plugin/host.js:7-12`), and `skin/kimino/*` (declarative skin plus `hooks.mjs`). The `plugin/host.js`
placeholder-rewrite install step is worth flagging: it asks a user or agent to edit code paths before
load. We did not find any path in `bundle/` that depends on that rewrite.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/idle-soak run in a live DSH web shell. Static
  review covered every code file, but the DOM and wheel-handler behavior is only observable at
  runtime, and the scroll-isolation logic is exactly the kind of code whose real effect needs a
  browser.
- **Published bundle vs source.** We graded the git tree. npm serves version 66.2.0 with the
  integrity hash recorded in the header and a matching `gitHead`, but we did not download the
  tarball and byte-compare it against this commit, and we saw no npm attestation binding the
  tarball to a CI run.
- **Asset bytes.** The clone is 26 MB, almost all of it images (`assets/current.jpg`,
  `skin/kimino/assets/wallpaper.jpg`, four preview/screenshot PNGs). We did not decode them, check
  for embedded payloads, or verify they are the images the previews show.
- **CSS at large.** `skin/kimino/skin.css` and `patches.css` were grepped for `url(`, `@import`, and
  `expression` (no external references found — every `url()` is a relative asset or a
  `/kimino-bg/*` route), but the ~1000 lines of declarations were not read line by line for visual
  spoofing, e.g. restyling a consent dialog.
- **Upstream skin-center gate.** The provenance mechanism's enforcement lives in the host, not here.
  We verified the hashes match; we could not verify what the host does when they do not.
- **Repository controls.** No review of the maintainer account's 2FA, branch protection, or who can
  publish to npm under this name.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded D purely on the
density of metadata URL strings; the manual verdict is B. Both positions are recorded in section 4.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/niiang/dsh-kimino-theme /tmp/kimino-audit
cd /tmp/kimino-audit && git rev-parse HEAD
#   expect 2c74b3f1c6ba4090409c4f73dc628f6804ec9961

# 2. Re-run our scanner (from a dsh-bridge checkout)
node tools/scan/dist/index.js /tmp/kimino-audit

# 3. Spot-check the headline claims
grep -rnE "eval\(|new Function|vm\.|child_process" bundle plugin skin scripts   # none
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|localStorage" bundle plugin skin    # none
grep -rhoE "https?://[a-zA-Z0-9./_-]+" bundle plugin skin scripts | sort -u     # metadata only
sed -n '14,31p' bundle/host.js          # the three fixed asset routes, no request-derived path
grep -n "scripts" package.json          # no npm lifecycle scripts

# 4. Re-verify the skin provenance record
cd skin/kimino && shasum -a 256 skin.json hooks.mjs && cat dsh-market.provenance.json
#   expect skin.json  ab77762a20963d1934e8202a7a9d7d61a9869a3e7ce8506d7577bd6e8cd12ad5
#          hooks.mjs  fb803b9fa2343217681a919d6310a18b862c29b34bc29f907887d04e11d2ac90

# 5. Confirm the published artifact lines up with this commit
npm view dsh-kimino-theme@66.2.0 dist.integrity gitHead
#   expect sha512-AHkagVyjwP3id1vp+KccZrBjzy/9kaANNHo4Tu8XGSlnAr+9/Qiu+bdi884mxYzkwl/49F5skB6N9tLc0ZIm7w==
#          2c74b3f1c6ba4090409c4f73dc628f6804ec9961
```

## 8. Methodology and pinned inputs

- Subject: git commit `2c74b3f1c6ba4090409c4f73dc628f6804ec9961`, shallow clone at
  `reference/audits/dsh-kimino-theme`, 29 files, 26 MB (mostly images).
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Review: full manual read of `bundle/host.js`, `skin/kimino/hooks.mjs`,
  `scripts/mint-provenance.mjs`, `package.json`, `cordis.patch.yml`, `.npmrc`,
  `skin/kimino/skin.json`, `skin/kimino/dsh-market.provenance.json`; `bundle/client.js` read for its
  JS half (lines 1-210, 530-546) and grepped exhaustively for every DOM/event/network/storage API;
  `plugin/host.js` diffed against `bundle/host.js`; CSS grepped for external references.
- Independent hash recomputation of the two provenance-pinned files (section 4).
- Registry check: `npm view dsh-kimino-theme version dist.integrity gitHead`.
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start at A. No egress, no credentials, no subprocess, no dynamic execution, no
  telemetry, no install hooks — nothing pulls below B. One step down to **B** for privileged surface
  the user cannot see from a stylesheet: three host-side HTTP route registrations
  (bundle/host.js:38-64) plus document-wide capture-phase input interception and two full-body
  mutation observers (bundle/client.js:130-131, 143-144, 186-187). KIMI-LIC-1 is recorded as a
  medium finding but did not move the grade, which measures code safety; it is restated as a
  residual risk. No further caps beyond the single-reviewer note.

## 9. Strengths

1. Full reversibility by construction: every side effect is registered through `ctx.effect` /
   `onCleanup` with a matching teardown — token override, `data-kimino-theme` attribute, style
   element, both observers, all three listeners, and the scroller marker attributes
   (bundle/client.js:109, 131, 145-148, 187, 202; skin/kimino/hooks.mjs:38, 51-56, 66, 116-120).
2. No dependency and no lifecycle-script surface: `package.json` declares neither, so installing the
   package cannot execute anything.
3. Route registration fails soft: a `/kimino-bg/*` path already claimed by another instance is
   logged and skipped instead of breaking the whole profile (bundle/host.js:65-68), and handler
   errors return 404 rather than leaking a stack to the client (bundle/host.js:56-60).
4. Asset paths are resolved from `import.meta.url` rather than a hard-coded home directory, so the
   bundle needs no install-time code rewriting (bundle/host.js:12-13) — a genuine improvement over
   the older `plugin/host.js` `<CLONE_DIR>` approach it replaced.
5. Honest licensing disclosure in the manifest: the artwork's copyright holders and the
   personal-use-only limit are stated in `skin.json:24-25` rather than buried or omitted.
6. The skin's `hooks.mjs` documents its own contract constraints (default-exported factory, no
   top-level side effects, idempotent cleanup) and the code matches the claim.

## 10. Residual risks

1. Copyrighted third-party artwork is bundled and redistributed via npm. The manifest limits it to
   personal desktop use; a catalog or workplace deployment inherits that limit. This is the sharpest
   real-world risk in the package and it is legal, not technical.
2. Document-wide capture-phase `wheel` handlers call `preventDefault()`/`stopImmediatePropagation()`
   (bundle/client.js:130-131, 186-187). A selector drift after a DSH upgrade could swallow scrolling
   in parts of the app.
3. UI copy substitution (bundle/client.js:18-37) means text the user reads is supplied by a theme.
   Benign here (four film lines), but it is a demonstrated capability to rewrite placeholder strings
   anywhere in the shell.
4. Heavy reliance on generated CSS class names (`.Md3f7G_scroll`, `.wSkVaW_scrollBody`,
   `[data-composer-card]`) makes the theme fragile across host versions; breakage is cosmetic but
   likely.
5. Version `66.2.0` bears no relation to the skin's own `1.0.0` (`skin.json:7`) and the repo ships
   three parallel implementations (`bundle/`, `plugin/`, `skin/`). Reviewers must confirm which one
   a given install actually loads before trusting a per-file claim.
6. Published tarball not byte-compared against this commit and no npm attestation observed; the
   `gitHead` match is suggestive, not conclusive.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new literal URL in `bundle/`, `plugin/`, or
   `skin/`, any appearance of `fetch`/`localStorage`/`eval`, or any new `scripts` key in
   `package.json` must be re-adjudicated before this grade carries forward.
2. Re-recompute the two provenance hashes. A mismatch between
   `skin/kimino/dsh-market.provenance.json` and the on-disk `skin.json`/`hooks.mjs` means either the
   record is stale or the files changed without a re-mint; both require a new revision.
3. Diff `npm view dsh-kimino-theme dist.integrity` and `gitHead` against the header values; a
   mismatch requires a new revision.
4. On any bump, re-read `bundle/host.js` ROUTES (a route whose path or file is built from request
   input would be a high finding) and the listener list in `bundle/client.js` (a new
   `addEventListener` without a paired `ctx.effect` teardown breaks the reversibility claim).
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
