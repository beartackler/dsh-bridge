# Trust Report Card: dsh-plugin-smooth-stream

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-plugin-smooth-stream` (client-only UI plugin: paragraph-batched streaming reveals with 8 animations, smooth scroll-follow, settings panel) |
| Pinned subject | github:SpookySandwich/dsh-plugin-smooth-stream @ commit `93b1e816c0336310b7c362bfc67d7b53da7a6861` (main, v1.1.1, 2026-08-19) |
| npm integrity | not checked |
| Provenance | not checked |
| License | MIT (LICENSE) |
| Stars at audit | 9 |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full read of the source of record and pattern audit of the generated bundle) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A purely cosmetic renderer replacement with no network surface, no credential access, and no host
half at all: it reads its own settings from `localStorage`, resolves two host UI components through
the host module registry, and re-renders assistant messages with CSS animations.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `sendBeacon` anywhere in the package. The only absolute URLs are the SVG namespace string and the project's own GitHub link in the settings panel footer (`target="_blank" rel="noreferrer"`). | plugin.client.js:553,1189; grep across package |
| Host half | A no-op: `export function apply() {}` is the entire host module. | lib/index.js (1 line) |
| Host UI slots used | Registers into `conversation.chat.node` (key `assistant-step`, priority -1) and, where present, `settings.section`. Both registrations are disposable and follow the master on/off switch live. | plugin.client.js:1194-1221 (tail) |
| Host component resolution | Reads `globalThis.__DSH_MODULES__` and probes its `seed`, `statics`, and `loadCache` maps for `MarkdownText` and `ImageGallery`, falling back to plain rendering if absent. Read-only lookups; nothing is written back into the registry. | plugin.client.js:157-176,635-636 |
| Dynamic code execution | One `(0, eval)('globalThis')` as the last fallback in a global-object resolver, reached only if both `window` and `globalThis` are unavailable. The evaluated string is the constant `'globalThis'`; no external input can reach it. | plugin.client.js:137-141 |
| Persistence | One `localStorage` key holding the animation settings, read and written through a sanitizer that coerces every field to a known shape. Both accesses are try/caught. | plugin.client.js:49,106,60-80 |
| DOM writes | Injects one `<style data-plugin="dsh-plugin-smooth-stream">` tag with a static CSS string and creates React elements. No `innerHTML`, no `dangerouslySetInnerHTML`. | _wrap-client.mjs:8-22; grep for innerHTML: zero hits |
| Message content handling | Reads assistant message text to compute reveal boundaries (paragraph, line, fence, and markdown-table aware) and renders it through the host's own `MarkdownText` when resolvable. Text stays in the browser. | plugin.client.js:178-253 |
| Filesystem, child processes, credentials | None. No `fs`, no `child_process`, no `process.env`, no auth path, no cookie access. | grep across package |
| Lifecycle hooks | None. `package.json` has no `scripts` block. | package.json |
| Telemetry | None found. Searched the whole package for analytics, beacon, and metrics patterns; zero hits. | negative claim, scope stated |
| Bundle patch | Single `insert` row; the comment states plainly that the host half is a no-op. | cordis.patch.yml |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 8 findings (1 critical, 4 high, 3 low), machine grade F. Every finding is a duplicate
pair, because `lib/client.js` is `plugin.client.js` wrapped in a loader preamble.

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical `lib/client.js:160` / high `plugin.client.js:140` | Real but benign, kept as `SS-EXEC-1` (low). `(0, eval)('globalThis')` is the third fallback in `realGlobal()`, after `typeof window` and `typeof globalThis` checks; in any browser the first branch returns and the `eval` is never reached. The argument is a hard-coded literal, so there is no path from user or network input into the evaluator. It is the textbook indirect-eval idiom for obtaining the real global, and it is the only `eval` in the package. | plugin.client.js:137-141 |
| NET high `lib/client.js:573` / `plugin.client.js:553` | False positive. `xmlns: 'http://www.w3.org/2000/svg'` is an XML namespace identifier on a React SVG element. | line read |
| NET low `lib/client.js:1189` / `plugin.client.js:1169` | The settings panel's own GitHub link, rendered as an anchor with `rel="noreferrer"`. Not a request the plugin makes. | plugin.client.js tail |
| SUPPLY high + NET low `package.json:21` | Repository metadata URL, well-formed and matching the actual repo. Inert JSON. | package.json:21 |

### Findings kept after adjudication

| ID | Severity | Location | Note |
|---|---|---|---|
| SS-EXEC-1 | low | plugin.client.js:140 | Indirect `eval` of the constant `'globalThis'`, unreachable in any browser and unreachable from any input. Flagged so that a future edit widening this call is caught, and because a strict CSP without `unsafe-eval` would make this line throw (it is try/caught, so it degrades to `null`). |
| SS-DUP-1 | low | lib/client.js vs plugin.client.js | The package ships the same 1221 lines twice: as the authored file and as the loader-wrapped bundle. Both are in `files`. Verified by diff that the only difference is the 20-line preamble and 4-line suffix from `_wrap-client.mjs`, so the duplication is a maintenance hazard rather than a hiding place. |
| SS-RENDER-1 | low | plugin.client.js:1194-1221 (tail) | The plugin replaces the host's assistant-message renderer at priority -1. If it fails in a way its guards do not catch, the conversation view is what breaks. The code is written for this: registration is wrapped in try/catch, a collision with another renderer plugin degrades to "they win, settings survive", and turning the master switch off disposes the registration so the host renderer takes over without a reload. |

Source-to-bundle verification: `diff plugin.client.js lib/client.js` yields exactly the
`_wrap-client.mjs` preamble (lines 1-20) and suffix (lines 1242-1245). The wrapper supplies only
`React` from the host `require` and a `styles.insert` helper that manages a single `<style>` tag.
No transformation, no minification, no encoded payload.

Negative claims and what was searched: full read of `lib/index.js`, `_wrap-client.mjs`,
`cordis.patch.yml`, `package.json`, and the resolver, settings, reveal-boundary, and registration
sections of `plugin.client.js`; pattern grep of the entire package for `fetch`,
`XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `cookie`,
`import(`, `new Function`, `eval`, `innerHTML`, `Object.defineProperty`, `child_process`, `fs`,
and `process.env`. The only hits were the three lines named in section 3 (two `localStorage`, one
`eval`). No obfuscation, no minification: the bundle is readable and commented throughout.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, message stream, animation run, settings toggle, or idle-soak run was performed. Static review covered the same surfaces but cannot rule out environment-dependent behavior.
- **The middle of the bundle.** Roughly 700 of 1221 lines are CSS strings, animation timing, and React element construction. Those were skimmed rather than read line by line, and audited by pattern grep for every capability family. A behavioral quirk in animation timing, or a rendering defect, would have been missed; a hidden network call or credential read would not, since no such pattern appears anywhere in the file.
- **Rendering fidelity.** The plugin decides where to cut streaming text, with special handling for code fences and markdown tables. Whether it ever truncates or corrupts a message under adversarial content is a behavioral question this static audit cannot answer, and it is the most likely place for a real bug.
- **Host module registry contract.** `__DSH_MODULES__` and its `seed`/`statics`/`loadCache` shape are undocumented host internals read by name. A host change silently sends the plugin to its fallback renderer; the DSH host tree was not read here.
- **Published artifact.** No npm tarball integrity or provenance attestation was fetched, and `lib/client.js` was not regenerated by running `_wrap-client.mjs` (it was verified by diff against the committed input instead).
- **The demo GIFs** in `assets/` were not opened or compared against actual behavior.
- **CSP interaction.** Whether the host page sets a Content-Security-Policy that would block the injected `<style>` tag or the indirect `eval` was not determined.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on the strength
of the `eval` critical; the manual verdict is A after reading the call site. Both positions are
recorded in section 4 rather than hidden.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/SpookySandwich/dsh-plugin-smooth-stream /tmp/ss-audit
cd /tmp/ss-audit && git rev-parse HEAD   # expect 93b1e816c0336310b7c362bfc67d7b53da7a6861

node tools/scan/dist/index.js /tmp/ss-audit   # from a dsh-bridge checkout

cat lib/index.js                                    # host half: export function apply() {}
grep -nE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" plugin.client.js lib/client.js   # none
grep -nE "eval|new Function|import\(|innerHTML" plugin.client.js                        # one line: 140
sed -n '137,141p' plugin.client.js                  # the eval: constant 'globalThis', third fallback
grep -n "localStorage" plugin.client.js             # two lines: 49, 106 (settings only)
diff plugin.client.js lib/client.js                 # expect only the _wrap-client.mjs preamble/suffix
node -e "console.log(require('/tmp/ss-audit/package.json').scripts)"   # expect undefined
```

## 8. Methodology and pinned inputs

- Subject: git commit `93b1e816c0336310b7c362bfc67d7b53da7a6861` (shallow clone at reference/audits/dsh-plugin-smooth-stream)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 6 files scanned, 13 skipped, 127243 bytes
- Review: full read of `lib/index.js`, `_wrap-client.mjs`, `package.json`, `cordis.patch.yml`; full read of `plugin.client.js` lines 40-260 and 1160-1221 plus whole-file pattern grep; `diff` of the authored file against the generated bundle
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: start A. No network egress, no credentials, no filesystem, no child processes, no host half, no lifecycle hooks, no telemetry, and one narrow settings key. The single `eval` is a constant-argument global resolver with no input path, which does not warrant a band drop; it is recorded as a low finding instead. Caps applied: none beyond the single-reviewer note.

## 9. Strengths

1. The host half is genuinely empty (`lib/index.js` is one line), so the plugin has no server-side capability at all. That is the strongest structural claim a DSH UI plugin can make.
2. Settings are sanitized on read, not trusted: `sanitizeSettings` rebuilds the object field by field with per-variant tuning defaults, so a corrupted or hostile `localStorage` value cannot inject unexpected shapes into the render path (plugin.client.js:60-106).
3. Defensive resolution throughout. Every host lookup is try/caught with a plain-render fallback, and the code comments explain a real past failure: testing only for `typeof value === 'function'` missed memoized host components and silently sent the plugin to its own fallback (plugin.client.js:143-156).
4. Reversible by design. The master switch disposes the slot registration live so the host's own renderer takes back over with no reload, and a collision with another renderer plugin is handled as "they win, settings survive" rather than an exception (tail of plugin.client.js).
5. No minification and no build step beyond a mechanical text wrap, so the shipped bytes are readable and the bundle is verifiable with one `diff`.
6. Markdown-aware reveal boundaries: the plugin refuses to cut inside a code fence or a table, extending or holding the reveal position instead (plugin.client.js:196-253).
7. No lifecycle hooks, no dependencies, no network.

## 10. Residual risks

1. The plugin owns the assistant-message renderer. Its guards are good, but a defect here degrades the primary surface of the product, not a side panel.
2. `SS-EXEC-1`: the indirect `eval` is harmless as written and is the kind of line a future edit could widen. It is also the one line that a strict CSP would reject.
3. Host internals (`__DSH_MODULES__`, slot names, `MarkdownText`, `ImageGallery`) are read by name and are undocumented. A host upgrade can silently drop the plugin to plain-text rendering with no error surfaced to the user.
4. The same 1221 lines ship twice (`plugin.client.js` and `lib/client.js`). A maintainer editing one and forgetting `_wrap-client.mjs` would publish a bundle that no longer matches its source; today they match.
5. Animation work runs on every streamed token batch. No performance measurement was taken, and heavy CSS animation in a chat view is a plausible source of jank on low-end machines.
6. Settings live in `localStorage` and are not namespaced through the host settings service, so they do not travel with a profile and are not visible to host-level configuration management.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new `fetch`, any second `eval`, any `innerHTML`, or any new `localStorage` key must be re-adjudicated before this grade carries forward.
2. Confirm `lib/index.js` is still a no-op. A host half gaining real capability changes the entire risk profile of this plugin and requires a new card, not a revision.
3. Re-run `diff plugin.client.js lib/client.js` and confirm the only delta is the `_wrap-client.mjs` preamble and suffix. Any other difference means the shipped bundle diverged from its source.
4. Diff `package.json` on every upgrade: any `scripts` block at all is a new finding on a package that currently has none.
5. Re-read the slot registration tail after upstream changes: new slot names or a lost dispose path are the failure modes that reach the user.
6. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
