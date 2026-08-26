# Catalog cards quality review: batches 4-8

Adversarial review of the 26 newest trust report cards in `docs/catalog/cards/`, selected by
modification time (2026-08-25 20:12 through 2026-08-26 06:43). Reviewer is not the author of any
card under review.

## What was checked

For every card:

1. **Grade vs its own evidence.** Would a hostile reader downgrade or upgrade it against the bands in
   `docs/catalog/INDEX.md` and `docs/trust/pipeline-architecture.md` §6?
2. **Citation reality.** Every `path:line` in the card was resolved against the pinned clone under
   `reference/audits/<name>` (all 26 subjects are cloned locally, and all 26 clone HEADs equal the
   commit the card pins - no card grades a tree that is not on disk). Two claims per card were then
   read at the cited lines and compared against the sentence they support.
3. **Style bar.** Emoji, marketing fluff, unverified claims, and unquantified superlatives.
4. **INDEX.md row agreement.** Grade, verdict, and card link.

Automated pass: 824 citations parsed across the 26 cards; 4 could not be resolved to a file in the
pinned tree (all in two cards, listed below). No emoji in any card. No fluff-vocabulary hits
(`blazingly`, `game-changing`, `10x`, `revolutionary`, `seamless`, `cutting-edge`, `effortless`).
Scanner totals stated in cards were cross-checked against the retained scan JSON where one exists;
all 13 checkable totals matched exactly (`scan-novel.json` 396/6/313/35/42, `scan-7b-reme.json`
2760/0/258/2/2500, `scan-7b-desktop-cc-gui.json` 3230/10/1599/90/1531, `vibe-scan.json` 131/59/3/69,
`scan-at-file.json` 24/1/19/4, and nine others).

## Summary statistics

| Metric | Value |
|---|---|
| Cards reviewed | 26 |
| Pass, no changes required | 18 (69%) |
| Fix-needed | 8 (31%) |
| Flag-for-re-audit | 0 |
| Grade disagreements | 1 downgrade recommended (desktop-cc-gui C to D) |
| Unresolvable citations | 4, in `ipollowork.md` (3) and `bitfun.md` (1) |
| Cards missing mandatory §6.2 sections | 4 (`codeg`, `vibe-skills`, `j-space-cognition-suite`, `cherry-studio`) |
| Cards absent from INDEX.md | 5 (`ai-novel-writer`, `dsh-anchored-standard`, `dsh-at-file`, `harmony-next.skills`, `reme`) |
| Grade/verdict mismatches between card and INDEX row | 0 among rows that exist |

INDEX.md's own distribution line ("0 A, 11 B, 29 C, 3 D, 0 F across 43 reviewed plugins") matches its
table exactly. It is stale only because 5 cards were never added as rows; see INDEX-1 below.

## Cross-cutting issues

**INDEX-1 (blocking for release, not attributable to one card).** Five of the 26 newest cards have no
INDEX.md row: `ai-novel-writer.md`, `dsh-anchored-standard.md`, `dsh-at-file.md`,
`harmony-next.skills.md`, `reme.md`. All five are grade C. Fix: add five C rows and change the
distribution line to `0 A, 11 B, 34 C, 3 D, 0 F across 48 reviewed plugins`. Star figures to use from
the card headers: ai-novel-writer 393, dsh-at-file 394, harmony-next 330, dsh-anchored-standard 3800,
reme 3300.

**STRUCT-1.** `docs/trust/pipeline-architecture.md` §6.2 fixes nine card sections in order. Four
cards omit some: `codeg`, `vibe-skills`, `j-space-cognition-suite` (all missing §8 Methodology and
pinned inputs and §9 Revision history) and `cherry-studio` (missing the mandatory §5 "What we could
not check" as a named section, and using an unnumbered heading scheme unlike every other card in the
batch). Two forms of the same defect: the batch is drifting from its own template. Fix per card
below.

**STRUCT-2.** 22 of 26 cards carry re-verify triggers or a freshness statement; `codeg`,
`vibe-skills`, `j-space-cognition-suite`, and `cherry-studio` do not. Same four cards as STRUCT-1,
same fix.

## Per-card verdicts

### Pass (18)

| Card | Grade | Notes from spot-checks |
|---|---|---|
| `harmony-next.skills.md` | C | Both spot-checks exact: `package.json:17` is the self-referential git URL, `README_en.md:9-13` carries the badge line the card describes. The "~3,700 markdown files" claim resolves to 3747 actual `.md` files in tree - accurate as an approximation and stated as one. Scanner total (1 low over 19 files) matches `scan-harmony.json` byte for byte. Cleanest card in the batch. |
| `dsh-at-file.md` | C | `README.md:50-52` is verbatim the tarball install command; `src/runtime.ts:56-77` and `src/files.ts:9-16` support the indexing-cap claim precisely. Scanner counts match `scan-at-file.json`. |
| `desktop-cc-gui.md` | C (downgrade recommended, see below) | Every technical claim verified. `web_service_runtime.rs:118-121` is the `Ipv4Addr::UNSPECIFIED` bind the card names; `hm.baidu.com` and the unconditional installer are real (`src/services/baiduTongji.ts:9,126`); the README/docs disclosure grep is genuinely zero. Sole citation defect is cosmetic: `src/i18n/locales/composer.ts:77-82` has no such path - locales are per-language (`src/i18n/locales/<lang>/composer.ts`). Fix that path to `src/i18n/locales/en/composer.ts` or to the `settings.ts` hits that actually name `~/.claude/settings.json`. Passing because the claim is true and the file exists one directory level deeper; grade is a separate matter. |
| `dsh-web.md` | C | The load-bearing count is right: 15 packages reference `dsh-market.com`, and exactly 14 ship the `telemetry/event` beacon the card attributes to "fourteen plugins". Tunnel claim verified at `packages/dsh-remote-web-ui/src/tunnel.ts:1-13`, which documents the `cloudflared` postinstall binary download in its own header. One weak citation: `PluginSettingsCard.tsx:232` is a CSS class, not the placeholder pattern; the surrounding claim is still carried by `url-guard.ts`. Not worth a fix on its own. |
| `reme.md` | C | Scanner adjudication is honest and arithmetically checkable (2760 findings, CRED family zero). `plugin_cli.py:179-181` is the `pip` subprocess; `common_utils.py:146-158` is the self-relaunch. `runtime.ts:88-100` is shutdown drain rather than the send scheduler, so the line range under-points by a few lines while the adjacent `:103-135` covers the claim. Acceptable. |
| `dsh-anchored-standard.md` | C | Both spot-checks land: `install.mjs:112` and `roll-prefab.mjs:106` are argv-array `spawnSync` calls exactly as characterized, and `custom-bash.mjs:203-206` is the `[shell, '-c', command]` argv the card admits is a real shell. Scanner totals match `scan-7b-dsh-anchored-standard.json`. Names its product risk instead of hiding it. |
| `dsh-routing-suite.md` | D | Grade well earned and the sharpest claim is real: `injector/src/index.ts:1454` and `:1506` are both `new Function('args','ctx', ...)` over agent-supplied source, and `dev_stage_add`'s description does say `仅限可信代码`. Six untranslated CJK characters appear in the card as a source quotation. That is defensible provenance, but per the English-first principle it should carry a parenthetical gloss: `"仅限可信代码" (trusted code only)`. Passing as a nit, not a fix. |
| `petdex.md` | C | `src/lib/security.test.ts:87` is the metadata-endpoint rejection assertion the card says it is - a good example of adjudicating a scanner critical rather than repeating it. `integrations/dsh/src/index.js:11-13` matches the loopback host, pending cap, and 300 ms timeout claim to the constant. |
| `openpencil.md` | C | The load-bearing claim is the strongest kind: `crates/op-auth-bridge/prebuilt/README.md:5-16` is upstream's own text conceding the archives are unsigned and leak build metadata. The card cites the vendor against itself rather than asserting. `canvaskit.js:9-21` is genuinely minified vendor renderer code. |
| `yao.md` | C | `tools/skills.go:9-14` is the `embed.FS` skill bundle; `agent/sandbox/v2/dsh/runner.go:61-62` is the injection call. Cited ranges are tight. |
| `everos.md` | C | Correctly handles the hardest case in the batch: the DSH plugin was removed from the tree one day pre-audit, and the card grades the remaining agent surface while saying plainly that anyone installing "the EverOS DSH plugin" today gets unaudited code. `utils/config.js:30-34` is the `api.evermind.ai` base URL; `SECURITY.md:12-24` is the private channel. |
| `nocobase.md` | C | Both dynamic-execution sinks are exactly where claimed and are the real thing: `flowI18n.ts:90` is `new Function('$root', 'with($root) {...}')`, `requirejs.ts:2155` is a bare `return eval(text)`. `deepseek/provider.ts:182` is the vendor fallback host. |
| `memos.md` | C | `adapters/deepseek-harness/index.ts:279-285` is the loopback assertion that throws rather than degrading; `server/http.ts:64-65` is the `127.0.0.1` default. 47 citations, all resolvable. |
| `dsh-desktop.md` | C | The best adjudication work in the batch: "14x CRED critical `Object.keys(process.env)`" is disarmed with two verifiable citations (`scripts/verify-cli-runtime.mjs:22-34` strips runner variables, `verify-loader-boot.mjs:35-42` verifies they stayed stripped). The magic-number-only installer validation is named as a residual risk rather than buried. |
| `learn-harness-engineering.md` | C | "638 scanned files" is the scanner's own `filesScanned` and matches `scan-learn-harness-engineering.json` exactly; the card does not silently pass it off as the repo's file count (2478 files exist). `tools/audit-harness.sh:5-11` is the zero-dependency header. The unpinned `curl \| bash` objection is the right headline. |
| `voyager.md` | C | `manifest.json:33-43` is the Google-only host permission block and `:29-32` is the `drive.file`-scope OAuth client, both verbatim. The card's own C rationale (optional `<all_urls>`, unverified store artifacts) is confirmed at `manifest.json:44`. |
| `weknora.md` | B | B is correct under the band: at most two documented mediums, one configured egress origin, verifiable provenance metadata. The verify block's own prediction holds - `grep -rn "fetch(" src/` returns exactly `client.ts:142` and `client.ts:268`. Cites the reserved `example.com` test-fixture domains rather than pretending the highs do not exist. Cross-model review absent, which the band does not require (only A does). |
| `awesome-gpt-image-2.md` | B | Scoping argument is sound and checkable: `install.mjs:30-41` computes destination paths under `CODEX_HOME`/`CLAUDE_HOME` and reads nothing; the alipay/watcha/ga4 highs at `api/_lib/*` are server-side files of the hosted app. B is defensible because the graded artifact is inert markdown plus a `cpSync` installer. |

### Fix-needed (8)

| Card | Grade | Exact fix |
|---|---|---|
| `cherry-studio.md` | C | Three fixes. (1) Add the mandatory §6.2 item 5 section: rename or split "Residual risks" so a heading literally named "What we could not check" exists; items 5, 6, and 7 of the current Residual risks list already belong there (no npm artifact to hash-check, updater not signature-audited, probe and dual review pending). (2) Renumber all headings to the batch's `## 1. Header` ... `## 9. Revision history` scheme so the card diffs against its siblings. (3) Add re-verify triggers, which every other C card in the batch carries. Content and citations are sound: `NutstoreService.ts:10` is verified as the sole importer of `./sso/lib/index.mjs`, and `plugin.ts:66-78` is the handshake the card describes. |
| `vibe-skills.md` | C | Four fixes. (1) Delete the self-contradiction in "Scanner noise dismissed": the sentence "src/components/ai-elements/streamdown-plugins.ts:108 does not exist in this tree; the actual hit is in config/upstream-lock.json:347" reads as an unresolved authoring note. Replace with the single true statement - the obfuscation lows are RTL/BIDI characters in Arabic i18n text plus one zero-width constant, and `config/upstream-lock.json:347` (verified: it names the third-party repo `muratcankoylan/Agent-Skills-for-Context-Engineering`) is a lockfile identifier. (2) Add §8 Methodology and pinned inputs, including the `9cc04224...` rulesDigest that every other card in the batch states and this one omits entirely. (3) Add §9 Revision history. (4) Add re-verify triggers. All substantive claims verified: 253 entries in `bundled/skills/`, `playwright_cli.sh:19` is the `npx --yes` fetch, `vercel-deploy/scripts/deploy.sh:9` is the Vercel endpoint, and the disclosure gap is real (`grep -c CLAUDE.md README.md docs/install/README.en.md` returns 0 and 0 against a 508-line README). |
| `codeg.md` | D | Two fixes, no content change. (1) Add §8 Methodology and pinned inputs: name the scanner version, the `9cc04224...` rulesDigest, the `codeg-scan.json` totals the card never states in prose (887 findings: 2 critical, 754 high, 26 medium, 105 low over 1057 files), and the single-reviewer limitation. (2) Add §9 Revision history and re-verify triggers. The D is correct and the evidence is the strongest in the batch: `web/mod.rs:65` is the literal `"0.0.0.0"` default, `web/auth.rs:21-33` is the empty-token fail-closed path with a comment explaining why, `README.md:162` is the unverified `curl \| bash`, and `install.sh` has no signature or hash check while `update/verify.rs` does - the internal inconsistency the card leads with. |
| `j-space-cognition-suite.md` | C | Two fixes. (1) Add §8 Methodology and pinned inputs and §9 Revision history; also add re-verify triggers. (2) Tighten one verify-block prediction that a reader will run and see fail: `grep -rnE "eval\(|exec\(|compile\(|environ|getenv" --include="*.py" .` says "expect: only literal_eval at verify_suite.py:129" but returns ten-plus `re.compile(` hits in `j-space/scripts/jspace.py:86-106`. Change the pattern to `-E "\beval\(|\bexec\(|\bcompile\("` and keep the expectation, or state the `re.compile` hits explicitly. The other predictions hold exactly (zero `urllib`/`requests`/`socket`; `subprocess` only in `tests/test_jspace.py`). The C is right, and JS-CLAIMS-1 is the correct call: `README.md:117-129` does present unreproduced benchmark tables, and the card refuses to launder them. |
| `ipollowork.md` | C | Three citation fixes; grade unaffected. (1) `design-studio/src/index.ts` is ambiguous and resolves to the wrong file: `packages/design-studio/src/index.ts` is 3 lines, so the cited `:52-56` and `:53` are out of range. The intended file is `external-plugins/deepseek-harness/design-studio/src/index.ts` (312 lines). Prefix all four occurrences (header table rows 33 and 34, and body lines 148 and 155). (2) `apps/server/bundled-templates/.../three.min.js:6` uses a literal ellipsis; write the real path, `apps/server/bundled-templates/ipollowork.hyperframes.app-device-launch/assets/three.min.js:6`. (3) `package/lib/index.js:3612` exists in no tree on disk. It is labelled "(tarball spot-check)", which is legitimate, but the card must say which tarball and how it was obtained, or the claim is unreproducible - move it to "What we could not check" if the tarball was not retained. |
| `distilly.md` | C | One numeric fix, repeated four times. "7584-line Python toolbox" is wrong: `tools/` holds 7349 lines of Python (7380 including non-Python files), and the whole repo holds 10025 lines of Python. Replace 7584 with 7349 at lines 12, 21, 94, and 158, and describe the scope as `tools/`. Everything else verified: `bin/distilly.mjs:19-31` is the exact 9-entry payload list, `INSTALL_EN.md:17-26` is the nine-host table including the DSH path, and `SKILL.md:1-7` does declare `allowed-tools: Read, Write, Edit, Bash` with `user-invocable: true`. The privacy-instrument framing in the verdict is the right call. |
| `ai-novel-writer.md` | C | One numeric fix. "~1400 files" (line 7) and "1400 files of desktop app and release" (line 136) overstate by ~1.8x: the pinned tree holds 778 files total, of which 630 are TypeScript/JavaScript/Vue. Replace with "~780 files (630 of them TS/JS/Vue)" in both places, or drop the count and say "an Electron desktop suite an order of magnitude larger than the graded plugin". Citations are otherwise exact: `plugins/dsh-ai-novel-writer/src/novel-project.ts:26-30` holds the 512 KiB and 20-match constants, and `src/preset-installer.ts:57-69` is the 0600/0700 atomic staging path. Scanner totals match `scan-novel.json` exactly. |
| `bitfun.md` | C | One citation fix. `session-page.tsx:669` does not exist in the pinned tree (no `session-page.tsx` anywhere; the nearest files are `src/mobile-web/src/pages/SessionListPage.tsx` and a Rust contract test), and the row that cites it already hedges with "apps/app equivalents in BitFun" - an unresolved authoring note. Either point at the real locale file containing the `npx`/`npm install -g @openai/codex` hint strings, or delete the row and say the HOOK highs were dismissed as locale text without a per-file citation. Note that `grep -rn "@openai/codex" --include=*.ts --include=*.tsx` over the tree returns nothing, so the row may be describing a different subject entirely and should be re-derived from the scan output. The verified claims are fine: `SSHConnectionDialog.tsx:507` and `RelayDeployWizard.tsx:106` are both `~/.ssh/id_rsa` default-path UI affordances, not reads. |

## Grade disagreement

**`desktop-cc-gui.md`: C, recommend D.** The card's own evidence describes egress that is undisclosed
to the user, and "undocumented egress" is the first item in the D band. Verified independently:
`src/services/baiduTongji.ts:9,126` load `https://hm.baidu.com/hm.js?<site-id>` in the production
main window; the install is unconditional (`installBaiduTongji()` scheduled at
`bootstrapApp.tsx:349-366`); a persistent `HMACCOUNT` visitor cookie plus PV/UV beacons and the
User-Agent leave the machine; and there is no toggle and no README, docs, or settings disclosure
anywhere - only developer-facing notes at `dev-guidelines/frontend/index.md:38,57`. The card itself
writes "there is NO opt-out toggle and no user-facing disclosure" and "this alone caps the subject
below B", then stops at C. Undisclosed third-party analytics with no opt-out is the D case, not the
C case, and the charter's PRIV bar ("no telemetry without opt-in") is a release blocker rather than
an awareness note. Everything else on the card - the transport hardening, the CSP `unsafe-eval`
finding, the `0.0.0.0` daemon bind, the credential-file management - is accurate and supports the
lower grade rather than the higher one. If the grade changes, update the INDEX row and its verdict,
which currently reads "undisclosed Baidu Analytics beacon on every launch with no consent or toggle"
and would read the same under D.

No upgrades are recommended. The two B grades in the batch (`weknora`, `awesome-gpt-image-2`) sit
correctly under the band, and no C card presents evidence clean enough to reach B given the missing
behavioral probe and single-reviewer passes.

## The three weakest cards

1. **`cherry-studio.md`** - the only card in the batch without a section named "What we could not
   check", which §6.2 marks mandatory and never-empty; also the only one using an entirely different
   heading scheme, and one of four with no re-verify triggers. Its technical content is fine, which
   is what makes the structural drift the whole of the problem: a reader cannot diff it against its
   siblings, and the mandatory limits section exists only as items buried in a risk list.
2. **`vibe-skills.md`** - ships an unresolved authoring note as published prose ("...does not exist
   in this tree; the actual hit is..."), which reads as a card arguing with itself, and is the only
   card in the batch that states no scanner digest at all while omitting both §8 and §9. The
   underlying audit is good and the disclosure finding (VS-GLOBAL-1) is genuinely valuable, which
   makes the presentation defects more costly, not less.
3. **`ipollowork.md`** - three of the four unresolvable citations in the entire batch, including a
   path that silently resolves to a 3-line file and makes the cited line numbers impossible, a
   literal ellipsis standing in for a directory name, and a tarball citation with no retained
   artifact. Charter principle 1 is that every claim about third-party code cites evidence at
   file:line; a citation that resolves to the wrong file is worse than no citation, because it looks
   verified.

## Method notes and limits

- All 26 subjects were already cloned under `reference/audits/`, and every clone's HEAD matches the
  commit its card pins, so no card in this batch grades a tree that could not be re-read. Nothing
  was skipped for want of a clone.
- Citation resolution was mechanical (path existence plus line-count bound) across all 824
  citations; semantic verification was two claims per card, chosen pseudo-randomly from citation-
  bearing lines longer than 80 characters, plus every claim that a card's own verdict rests on.
- This review does not re-run the scanner and does not re-derive any grade from scratch. It checks
  internal consistency, citation reality, and band fit. A full re-audit could still move a grade in
  either direction.
- No behavioral probe and no cross-model concurrence exists for any card in this batch, which is why
  none of them can exceed C on the pipeline's own terms except the two B cards whose graded artifact
  is small enough to read end to end.
