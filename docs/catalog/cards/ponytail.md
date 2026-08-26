# Trust Report Card: @mengyuly/dsh-ponytail

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@mengyuly/dsh-ponytail` (lazy senior developer persona/ruleset plugin for DSH; port of DietrichGebert/ponytail) |
| Pinned subject | github:MengYuil/dsh-ponytail @ commit `00a10bb1715a725ac360e955654d0fbc947f6e96` (tag v0.2.1, dereferenced; also the default branch head at audit time) |
| npm integrity | `sha512-jY6HSSFQ+vKzdKBSIEEmONQt5IglJcHau4MJCoPozBUKwgLqHcXuqyPnHLMI2akYoPEJxTLNK0Xqc/6x6MZpGQ==` (`registry.npmjs.org/@mengyuly/dsh-ponytail/0.2.1`, fetched 2026-08-25) |
| Tarball sha256 | `52e558b77d106649599ef946cb7256273f2c90346565bda7844fe6310fbc3b0f` (downloaded and unpacked during this audit) |
| Provenance | registry `gitHead` equals the pinned commit; published tarball byte-identical to the audited git tree (see section 4). `dist-provenance.json` records the authoritative build source; see section 5 for its limits. |
| License | MIT, dual copyright: `(c) 2026 DietrichGebert (original ponytail)` + `(c) 2026 MengYuil (DeepSeek Harness port)` (LICENSE:1-3) |
| Audited | 2026-08-25 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review + bundle audit + published-tarball byte compare) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Clean attack surface: the shipped bundle contains no network egress, no credential access, no
telemetry, no dynamic code execution, and no install-time hooks; every scanner finding lands in
development-only scripts that provably never ship in the tarball; and the published npm artifact is
byte-identical to the audited commit.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The bundle performs no fetch/socket/DNS of any kind. Every URL string in the repo is documentation metadata (upstream project links, repo URLs). Negative claim, scope in section 4. | grep across lib/, src/, scripts/; zero executable hits |
| Runtime services | Registers one system-prompt section (order 40, lib/index.js:1834-1844), six runtime skills (lib/index.js:1845), six slash commands (lib/index.js:1632-1777), one `agent/pre-step` listener for plain-text deactivation phrases (lib/index.js:1855-1873), one `agent/disposed` cleanup listener (lib/index.js:1831-1833). Injects only `["systemPrompt","skills"]` (lib/index.js:1579). | lib/index.js |
| Child processes | None in the shipped artifact (grep: zero `child_process`/`spawn`/`exec` in lib/**). `spawnSync` exists only in scripts/lib/run-command.mjs:27 and scripts/sync-dist.mjs:43, both excluded from the npm tarball (verify-pack.mjs:40-48 asserts the exclusion; tarball listing re-verified in this audit). | grep + tarball diff |
| Credential reads | Reads nothing beyond its own config: `~/.config/ponytail/config.json` (or `$XDG_CONFIG_HOME` / `%APPDATA%` equivalent, lib/index.js:1286-1293) and the `PONYTAIL_DEFAULT_MODE` / `PONYTAIL_SUBAGENT_MATCHER` env vars (lib/index.js:1307, 1815). No `.ssh`, `.aws`, `.claude`, `.codex`, opencode auth, browser stores, or keychains anywhere. | lib/index.js:1286-1293; grep negative |
| Filesystem writes | One file: the optional mode-default config, written via sibling temp file + atomic rename inside its own directory (lib/index.js:1388-1393; src/modes.ts:210-219), preserving unrelated fields. Temp file cleaned up on write failure (lib/index.js:1394-1397). Watcher on the same file is read-only and disposed through `ctx.effect` (lib/index.js:1827-1830). | lib/index.js |
| Dynamic code execution | None in the shipped bundle. Zero hits for `eval(`, `new Function`, `vm.`, dynamic `import()`, base64-decode-execute, string-array obfuscation, homoglyphs, or invisible characters (0 found by codepoint scan). Enforced upstream-of-release by CI (check-bundle.mjs:34-39) because schemastery - whose DSL compiles callback strings via `new Function` - is deliberately kept external (package.json:48, README note). | grep + codepoint scan + local CI rerun |
| Telemetry | None. No analytics/beacon/metrics endpoints or timers sending data anywhere. The only recurring timer is a 1 s `fs.watchFile` poll of its own config file, unref'd (lib/index.js:1827). | grep + manual read |

Skill bodies (src/content.ts) are static instruction strings injected into the model context; they
reference the upstream project URL as prose (src/content.ts:27, 305) and execute nothing.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e1`. Raw output: 20 findings
(1 critical, 9 high EXEC; 10 low NET). Machine verdict would be F; manual adjudication follows.
All 20 excerpts were hash-matched against the artifacts.

### Scanner criticals and highs adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC critical `spawnSync` import scripts/lib/run-command.mjs:27 | Accepted dev-tooling risk per the project's own disposition. The file ships nowhere: tarball contains only LICENSE, README.md, CHANGELOG.md, package.json, cordis.patch.yml, dist-provenance.json, lib/** (tarball listing verified). CI fails if scripts/ ever appears (verify-pack.mjs:44-48) and if the runtime entry imports scripts/ (verify-dist.mjs:196-201). Arguments are arrays; shell only for the Windows npm.cmd fallback (run-command.mjs:41-43); no model/network/plugin-runtime input reaches it (run-command.mjs:1-24). | SECURITY.md:16-36; tarball diff; local rerun |
| EXEC high x2 run-command.mjs:66,79 | Same disposition. `runNpm` spawns npm args from hardcoded script call sites; `runNode` spawns `process.execPath` with literal script paths. | run-command.mjs:57-84 |
| EXEC high x6 sync-dist.mjs:43,71,80,152,161 | Release-time build tool: runs tsc/tsdown from `DSH_CHECKOUT/node_modules/.bin` (validated as a real checkout dir, sync-dist.mjs:47-56), `git rev-parse/status` for provenance. Maintainer-invoked only; never in the tarball; no lifecycle hook exists (verify-dist.mjs:176-179 rejects even `prepare`). | sync-dist.mjs:40-90, 152-166 |
| EXEC high `await import()` verify-dist.mjs:148, verify-pack.mjs:73 | Smoke tests importing the project's own just-built/packed bundle by constructed literal path to assert the plugin shape (`name === 'ponytail'`, `typeof apply === 'function'`). Not dynamic evaluation of external content. | verify-dist.mjs:147-155; verify-pack.mjs:72-78 |

### Low findings dismissed (with scope)

All 10 NET hits are inert URL strings: upstream reference links in skill prose (src/content.ts:27,
305 mirrored at lib/index.js:942, 1174 and lib/types/content.d.ts:13, 23), repository metadata
(package.json:10, dist-provenance.json:2), a provenance fallback constant (sync-dist.mjs:128), and
a test fixture (test-regressions.mjs:31). No fetch/http/net/dgram/WebSocket call sites exist
anywhere in the repo (grep, zero hits).

### Claims verified against the actual published artifact

- `git ls-remote` HEAD == pinned commit `00a10bb1`; registry `gitHead` == pinned commit;
  dist-tag `latest` == 0.2.1 == tag v0.2.1.
- Downloaded `@mengyuly/dsh-ponytail@0.2.1` tarball; `diff -r` of `package/lib` vs git-tree `lib/`
  is empty; package.json, dist-provenance.json, and cordis.patch.yml also identical. **What npm
  ships is exactly what this card graded.**
- Re-ran the project's own CI checks at the pinned commit, all green: `node scripts/check-bundle.mjs`
  (externals exactly `deepseek-ai/cordis` + `deepseek-ai/schemastery`; zero `new Function`/`eval`),
  `npm run verify:dist` (declarations, src/d.ts export parity, runtime export surface, no source
  maps, provenance validity, no lifecycle scripts, entry targets under lib/),
  `npm run test:regressions`.

### Inline-dependency audit (prebuilt lib/)

lib/index.js (1876 lines, unminified tsdown output with `#region` provenance comments) inlines
exactly what the README claims: dsh-llm modules (brand, call-config, message, error, retry-policy,
never, attribution - lib/index.js:7-163), dsh-skill registry (lib/index.js:387-700 range), core/scope
store, and util/timeout. Region labels name the monorepo source paths. External imports are exactly
six: the two declared registry peers plus node:module/fs/os/path (lib/index.js:1-6; check-bundle
enforces the peer set). The port's own logic (modes/instructions/content/index regions,
lib/index.js:1270-1876) corresponds function-for-function to src/: every exported helper
(`configDir`, `configPath`, `readDefaultModeInfo`, `writeDefaultMode`, `compileSubagentMatcher`,
`apply`) appears once in each, with matching structure read line-by-line.

schemastery is imported (lib/index.js:3) and used only to construct retry-policy schemas at import
time (lib/index.js:136-151); the library itself - the component that compiles callback strings -
runs in the user's environment, not in this bundle.

### Negative claims and what was searched

Searched all of lib/ (1901 lines), src/ (1140 lines), scripts/ (644 lines), .github/, and the
published tarball: no `eval(`/`new Function`/`vm.`/dynamic `import()` in shipped artifacts; no
network call sites; no credential-path reads; no `Object.keys(process.env)` enumeration (env access
is three named vars plus platform dirs); no obfuscation signals (entropy blobs, `_0x` identifiers,
base64-decode-execute, homoglyphs, zero-width characters - codepoint scan found 0 invisible chars;
all non-ASCII characters in lib/ are typographic punctuation, box-drawing, and CJK text in skill
strings); no `sourceMappingURL` in lib/**; no install lifecycle hooks (package.json:50-56 defines
five dev-only scripts, none install-adjacent); no timers besides the unref'd 1 s config poll.

## 5. What we could not check

- **Full build reproducibility.** `dist-provenance.json` cites deepseek-harness commit
  `b150a551` at `packages/community/ponytail` as the authoritative source, but that path does not
  exist in the public monorepo at that commit (GitHub API 404; local clone confirms). The port's
  committed src/ mirror matches the bundle closely enough (section 4) that substitution risk is
  low, but no third party can currently rebuild lib/ from the cited upstream path. This is the main
  gap between this grade and A. The project itself discloses the boundary honestly: mirror CI does
  not rebuild the authoritative monorepo, and verify:dist is explicitly "not a byte-level proof"
  (README.md:114-123).
- **Behavioral probe.** No sandboxed load/activate/invoke/idle-soak run was performed (pipeline S4
  not available). Static review covered every registered surface; the only recurring background
  activity visible statically is the config-file poll.
- **Peer/runtime behavior on the user's machine.** Five `@deepseek-ai/dsh-*` peers use wide ranges
  (`>=0.0.1-rc <2`, package.json:43-47). They are host-contract declarations, resolved by DSH; their
  transitive advisories were not joined against a pinned OSV snapshot.
- **DSH/Cordis version correspondence.** The README states plainly that the matching released
  DSH/Cordis version is still unconfirmed - the provenance commit is a pre-release worktree
  (README.md:104).
- **`createRequire("../package.json")` at import time** (lib/index.js:162, inlined dsh-llm
  attribution code) reads the installed package.json to build a User-Agent version. It resolves fine
  for npm/tgz/file channels (verified against the packed layout) but would throw if a channel
  installed the bundle without package.json alongside - an availability edge, not a security issue.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner disagreed with the
manual verdict (machine F off dev-script EXEC hits); both positions are recorded in section 4
rather than hidden. The SECURITY.md disposition was tested, not taken on faith: the tarball really
does exclude scripts/, and CI really does enforce it.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/MengYuil/dsh-ponytail /tmp/ponytail-audit
cd /tmp/ponytail-audit && git rev-parse HEAD   # expect 00a10bb1715a725ac360e955654d0fbc947f6e96

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/ponytail-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rnE "eval\(|new Function|vm\.|child_process|fetch\(" lib/        # shipped artifact: zero hits
grep -oE 'from "[^"]+"' lib/index.js | sort -u                         # externals: 2 peers + node builtins
node scripts/check-bundle.mjs && npm run --silent verify:dist          # project's own gates, must pass
sed -n '1388,1393p' lib/index.js                                       # atomic temp+rename config write

# 4. Confirm the published artifact is the audited one
npm view @mengyuly/dsh-ponytail@0.2.1 dist.integrity gitHead
#   integrity sha512-jY6HS...ZpGQ== ; gitHead 00a10bb1...
cd /tmp && npm pack @mengyuly/dsh-ponytail@0.2.1 && tar -xzf *.tgz
diff -r package/lib /tmp/ponytail-audit/lib                            # expect: identical
tar -tzf *.tgz | grep scripts/                                         # expect: no output

# 5. Probe the open provenance question yourself
curl -s -o /dev/null -w '%{http_code}\n' \
  https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/packages/community/ponytail
#   expect 404 today; if it ever returns 200, rebuild-and-compare becomes possible
```

## 8. Methodology and pinned inputs

- Subject: git commit `00a10bb1715a725ac360e955654d0fbc947f6e96` (shallow clone at
  reference/audits/ponytail; upstream HEAD confirmed equal via ls-remote)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `0e425dad...a04e1`
- Review: full manual read of lib/index.js (all 1876 lines), lib/invariant.js, src/{index,modes,content,instructions,invariant}.ts, all seven scripts/*.mjs, SECURITY.md, README.md, CHANGELOG.md, ci.yml, cordis.patch.yml, dist-provenance.json; plus download and byte-compare of the published npm tarball; plus local re-execution of check-bundle, verify-dist, and test-regressions at the pinned commit
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero high/critical findings in the shipped artifact after adjudication; zero
  egress; zero credential surface; no dynamic code execution; provenance verifiable down to the
  repo-to-tarball chain (gitHead match + byte-identical tarball). Caps applied: single reviewer, no
  S4 probe, and third-party build reproduction blocked by the upstream path above - each alone bars
  A. Result: B (safe with documented behavior), the same band modlens received; this artifact's
  evidence chain is stronger, but A's necessary conditions (probe clean x3, cross-model concurrence,
  full reproducibility) are simply not available yet.

## 9. Strengths

1. Minimal attack surface by design: the entire runtime capability set is prompt-section injection,
   six static-content skills, six commands, and two listeners. Nothing reads credentials, nothing
   touches the network, nothing spawns processes, nothing phones home (section 3, scope-stated).
2. Verifiable artifact chain: registry gitHead == tag == branch head; published tarball byte-equal
   to the audited tree. Users can prove what they install is what was graded with one `diff -r`.
3. Security claims are CI-enforced, not aspirational: no-eval gate on the bundle
   (check-bundle.mjs:34-39), externals pinning (:25-31), lifecycle-hook ban (verify-dist.mjs:176-179),
   scripts/-never-ships assertion (verify-pack.mjs:44-48). All re-ran green during this audit.
4. Honest self-documentation: SECURITY.md dispositions match the observed code exactly; README
   volunteers the weaknesses (no monorepo rebuild in CI, DSH version correspondence unconfirmed)
   before any auditor has to find them.
5. Exemplary hygiene details: atomic config replace with temp cleanup (lib/index.js:1388-1399),
   watcher disposed via ctx.effect (lib/index.js:1828-1830), warn-once diagnostics, invalid profile
   config falls back with a warning instead of failing mount (lib/index.js:1794-1796), correct
   dual-copyright MIT attribution (LICENSE:1-3).

## 10. Residual risks

1. Build provenance stops at the repo boundary: the cited authoritative source path is not publicly
   browsable, so lib/ cannot be independently rebuilt yet. The committed src/ mirror and the
   region-labeled bundle make quiet substitution hard, but this remains the largest open item.
2. Wide peer ranges (`<2` on five dsh-* packages) mean behavior under future DSH releases is
   unproven; the author says so in README.md:104.
3. Supply-chain concentration: first publish 2026-08-23, seven releases in three days, single
   maintainer, community port of someone else's design. Mitigated by the verifiable chain, but a
   compromised future push would inherit today's good reputation - hence re-vetting on every bump.
4. The 1 s `watchFile` poll means anyone who can write `~/.config/ponytail/config.json` can change
   the active ruleset for new sessions. User-owned config by design; impact is prompt content only.
5. The README's preferred quickstart is `link:` (README.md:14-16), which is unpinnable and
   ungradable under our pipeline (N/A). Recommend the npm or pinned-tgz channels for anything
   trust-sensitive.
6. `createRequire` package.json read at import (lib/index.js:162) can break exotic install layouts
   (availability, not security).

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new literal URL, any EXEC-family hit under
   lib/, any new dependency, or any lifecycle script in package.json forces re-adjudication before
   this grade carries forward.
2. Diff the freshly downloaded tarball's lib/ against the repo's lib/ (step 7.4). A mismatch between
   npm and git is a stop-ship finding.
3. On upstream bumps: re-run `scripts/check-bundle.mjs` and `verify:dist` (they encode the security
   contract), re-read SECURITY.md diffs, and re-check whether `packages/community/ponytail` became
   publicly browsable in deepseek-harness - if it has, attempt a rebuild and close residual risk 1.
4. Re-run our scanner after any heuristics-corpus bump; corpus digest is recorded in section 8.
5. Re-vet at 90 days or on any new release tag, whichever comes first (stale-card rule).
