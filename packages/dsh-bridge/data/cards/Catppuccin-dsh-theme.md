# Trust Report Card: Catppuccin-dsh-theme

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-catppuccin` (DSH web theme plugin: the four Catppuccin flavors registered into the built-in theme runtime) |
| Pinned subject | github:zhijun-dai/Catppuccin-dsh-theme @ commit `e66bc66d4fdd35f4ded808a9bffdee185f5bae76` (branch main, shallow clone) |
| npm integrity | Not checked. No npm publication is claimed; the package declares a git repository and is installed from git. |
| Provenance | None. Git-source install; no attestation, no signed tags. |
| License | MIT (LICENSE:1-3, "dsh-catppuccin contributors"). GitHub reports the repository license as NOASSERTION, presumably because the file carries a non-standard copyright line; the text itself is the MIT license. |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A pure CSS-variable theme: the host half is a literal no-op, the browser half registers four colour
token sets with the harness's own theme runtime and stores one string in `localStorage`, and the
generated bundle reproduces byte-for-byte from its template and palette, which we verified by
rerunning the generator.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. `grep -rhoE "https?://"` across `lib/`, `scripts/`, `themes/`, and `palette/` returns zero hits. No `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` anywhere. | grep, zero hits |
| Host half | `export function apply() {}` - an empty function. The file's own comment explains that the loader entry exists only so the browser half is picked up through the package's `dsh.client` declaration (lib/index.js:1-13). | lib/index.js (13 lines, read in full) |
| Browser half | Registers four theme definitions with `ctx.theme.register` and disposes them with the plugin fiber (lib/client.js:1144-1147); listens to `theme/change` to keep its settings row and stored preference in sync (lib/client.js:1407, 1451-1466); registers a locale dictionary (lib/client.js:1468) and a picker row into `settings.general.item` (lib/client.js:1488-1495). Declared services are `slots`, `locale`, `theme` and nothing else (lib/client.js:1131-1135). | file:line above |
| Persistence | One `localStorage` key, `dsh-catppuccin:skin` (lib/client.js:22), holding a theme id string. Read and write are both wrapped in try/catch that degrades to process-local on failure (lib/client.js:864-882). No cookie, no IndexedDB, no server-side settings write. | file:line above |
| DOM manipulation | One `<style>` element created, filled from a module-constant rule string, and appended to `document.head` only while a Catppuccin skin is active (lib/client.js:1399-1404). `style.textContent` is assigned a constant; there is no `innerHTML` anywhere in the bundle. | lib/client.js:1399-1404 |
| Data read | Nothing. The plugin never reads conversation content, session data, workspace files, or credentials. Its only input is its own stored preference and the theme runtime's current snapshot. | grep across lib/ |
| Child processes | None in shipped code. `scripts/gen-themes.mjs` is a build-time generator that reads `palette/palette.json` and `lib/client.tpl.js` and writes `themes/*.json` and `lib/client.js` (gen-themes.mjs:3-8, 430). It is not in `package.json` `files` (package.json:28-33). | file:line above |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*` in `lib/` or `scripts/`. | grep, zero hits |
| Credential reads | None. No auth path, keychain, cookie, token, or `process.env` read anywhere. | grep across lib/, scripts/ |
| Telemetry | None. No analytics, beacon, or metrics code. | negative claim, scope: lib/, scripts/, themes/, palette/ |
| Lifecycle hooks | None. `package.json` declares one script, `generate: node scripts/gen-themes.mjs` (package.json:56-58). No install, postinstall, or prepare hook. | package.json:56-58 |
| Immediate activation | `dsh.client.immediately: true` (package.json:45) means the browser half loads at shell boot rather than lazily. Justified for a theme (a late-loading theme flashes the default palette first) and the activation path does no I/O beyond a `localStorage` read. | package.json:34-45, lib/client.js:1143-1147 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 4 findings (0 critical, 1 high, 2 medium, 1 low), machine grade C, no gates. All four
adjudicated below; all 12 scanned files read.

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| CTP-SUPPLY-1 | low | package.json:9 | `repository.url` is `git+https://github.com/zhijun-dai/Catppuccin-dsh-theme.git`, read by the scanner as a git-pinned dependency. It is a repository declaration. The implied concern stands: installation is from a moving branch unless the user pins a commit. |
| CTP-DOM-1 | low | lib/client.js:1399-1404 | Injects a stylesheet into `document.head` to tint user-message bubbles. The rule text is a module constant, and the comment above it explains the specificity hack (`:not(#dsh-catppuccin)`) it uses to win against later-injected shipped stylesheets (lib/client.js:1149-1160). A theme restyling the host UI is the point; recorded because DOM injection is a capability. |
| CTP-META-1 | info | package.json:4 | The `description` field opens with an emoji. Cosmetic, and it is the upstream project's own copy, not something this catalog controls. Noted only because the string is surfaced in plugin listings. |

### Scanner noise dismissed (with scope)

- HOOK-006 `lib/client.js:1460` and `lib/client.tpl.js:655`: flagged as a deferred/timer hook. The line is `setTimeout(() => { reassertSaved(); }, 0)` inside the `theme/change` handler, with a four-line comment above it explaining why (lib/client.js:1457-1463): a re-entrant `setTheme` inside the dispatch is missed by other subscribers, so the restored skin must be re-asserted from a fresh task. Zero-delay, no network, no payload. It is the only timer in the bundle.
- NET-008 `package.json:9`: the repository URL again, recorded so declared egress is listed. Nothing fetches it at runtime.

### Build reproducibility (verified)

`lib/client.js` and `themes/*.json` are generated from `palette/palette.json` and
`lib/client.tpl.js` by `scripts/gen-themes.mjs`. We re-ran the generator at the pinned commit and
compared checksums before and after:

```
lib/client.js               64d986a2f53826b64a146ecb1668fccf   (unchanged)
themes/catppuccin-mocha     b0c03acfb5e716c0083df6fc6d9a2dc0   (unchanged)
themes/catppuccin-macchiato f4fdf8a75eb2eefe20d59f28b2be6b96   (unchanged)
themes/catppuccin-frappe    10e25d9139793c7d06927f3558b62d2f   (unchanged)
themes/catppuccin-latte     2d320f025c5cb4c4a90b77134203f821   (unchanged)
```

`git status --porcelain` was empty after the run. The shipped bundle is exactly what the checked-in
template and palette produce, so reviewing the 700-line template is equivalent to reviewing the
1505-line generated file. This is the strongest single fact on this card.

### Negative claims and what was searched

Searched `lib/index.js` (13 lines), `lib/client.js` (1505 lines), `lib/client.tpl.js` (700 lines),
`scripts/gen-themes.mjs` (430+ lines), `themes/*.json` (four token maps), `palette/palette.json`,
`package.json`, `cordis.patch.yml`, `README.md`, `CONTRIBUTING.md`: no URL of any kind; no `eval`,
`new Function`, or `vm`; no `child_process` in shipped code; no credential path; no telemetry; no
`innerHTML`; no filesystem access from the browser half; no obfuscation (the generated bundle is
tab-indented, fully commented, and unminified). Theme JSON files contain only CSS custom-property
names mapped to colour literals and `color-mix()` expressions.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/render run was performed. Static review covered every line of the shipped code but cannot rule out environment-dependent behavior.
- **Visual and accessibility outcome.** We did not render the themes. Contrast ratios of the generated token maps against DSH's actual components were not measured; a theme can be safe and still be unreadable.
- **The `assets/*.webp` and `*.png` screenshots.** Present in the tree but not shipped in `package.json` `files`; not decoded or inspected beyond their file type.
- **Peer dependencies.** `react`, `@deepseek-ai/cordis`, and four `@deepseek-ai/dsh-client-*` peers resolve on the user's machine; no pinned OSV snapshot was joined against them.
- **The harness's theme runtime.** `ctx.theme.register` / `setTheme` and how DSH applies token maps are the harness's own.
- **Published-artifact comparison.** No npm artifact was located to diff against.
- **Palette fidelity.** `palette/palette.json` is described as coming from the official catppuccin/palette project; we did not diff it against upstream, so the colours could differ from canonical Catppuccin without this card noticing.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded C on a repository
URL and a zero-delay `setTimeout`; the manual verdict is A. Both positions are recorded in section 4
rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/zhijun-dai/Catppuccin-dsh-theme /tmp/ctp-audit
cd /tmp/ctp-audit && git rev-parse HEAD   # expect e66bc66d4fdd35f4ded808a9bffdee185f5bae76

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ctp-audit   # from a dsh-bridge checkout

# 3. Reproduce the generated bundle (the headline claim)
md5 -q lib/client.js themes/*.json
node scripts/gen-themes.mjs
md5 -q lib/client.js themes/*.json   # expect identical
git status --porcelain               # expect empty

# 4. Spot-check the rest
grep -rhoE "https?://" lib scripts themes palette   # expect zero hits
grep -rn "eval(\|new Function\|innerHTML\|fetch(" lib   # expect zero hits
cat lib/index.js                                     # host half is apply() {}
grep -n "setTimeout\|setInterval" lib/client.js      # expect one zero-delay call
grep -n "localStorage" lib/client.js                 # one key, try/catch wrapped
```

## 8. Methodology and pinned inputs

- Subject: git commit `e66bc66d4fdd35f4ded808a9bffdee185f5bae76` (shallow clone at reference/audits/Catppuccin-dsh-theme)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 12 files scanned, 11 skipped
- Review: full read of lib/index.js, package.json, cordis.patch.yml; full read of the plugin body region of lib/client.js (lines 1125-1505) and its persistence region (855-890); read of lib/client.tpl.js at every corresponding site; read of scripts/gen-themes.mjs token-mapping logic; inspection of themes/*.json structure; generator re-run with checksum comparison
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero network, zero credential access, zero dynamic execution, zero data reads, zero lifecycle hooks, and a build that reproduces byte-for-byte from checked-in inputs. Nothing survives adjudication above low severity, which clears the A band. Not higher because provenance is git-only and no behavioral or accessibility check was run.

## 9. Strengths

1. The generated bundle reproduces exactly from the checked-in template and palette (verified, section 4). Almost no plugin in this catalog can make that claim, and it collapses the audit surface from 1505 lines to 700.
2. The host half is an empty function with a comment explaining why it is empty (lib/index.js:1-13). Nothing to exploit because there is nothing there.
3. Persistence is one `localStorage` string, and both read and write degrade silently rather than throwing when storage is unavailable (lib/client.js:864-882).
4. Theme registrations are disposed with the plugin fiber (lib/client.js:1145-1147), and the injected stylesheet is mounted only while a Catppuccin skin is active (lib/client.js:1403).
5. The one non-obvious construct in the file, a zero-delay `setTimeout`, carries a comment explaining the re-entrancy problem it solves (lib/client.js:1457-1463). The same discipline shows in the CSS specificity comment (lib/client.js:1149-1160).
6. It cooperates with other theme plugins: if the preference moves to a third-party theme this plugin does not own, it clears its stored choice so only the last-picked plugin restores at boot (lib/client.js:1454-1459).

## 10. Residual risks

1. DOM stylesheet injection into `document.head`. The rules are constants today, but a theme that restyles host chrome could in principle be used to spoof host UI (a fake dialog, a hidden element). Nothing in this artifact does that; the capability exists.
2. `immediately: true` means this code runs at every shell boot before user interaction. Its activation path is inert, but it is the earliest-running third-party code in the profile.
3. Git-only distribution, no attestation, no signed tags, GitHub license detection reports NOASSERTION.
4. The colour palette was not diffed against upstream catppuccin/palette; the themes are asserted to be official Catppuccin, and that assertion is unverified here.
5. Contrast and readability were not measured. A safe theme can still make text unreadable, which is a real user-facing defect this card does not cover.

## 11. Re-verify steps

1. Re-run the step 7 block against current HEAD. The generator reproducibility check is the highest-value step: if `lib/client.js` no longer regenerates identically, the bundle was hand-edited and everything else on this card must be re-derived from the bundle itself.
2. Any URL literal, `fetch`, `innerHTML`, or second `setTimeout` appearing in `lib/client.tpl.js` must be re-adjudicated.
3. Watch `package.json` for a `scripts` key beyond `generate`; there is no install hook today, so any hook is new.
4. Watch the injected `SURFACE_RULES` constant for selectors that reach beyond colour and background, particularly `position`, `content`, or `z-index` on host chrome.
5. Diff `palette/palette.json` against upstream catppuccin/palette to close the residual risk this card leaves open.
