# Trust Report Card: awesome-gpt-image-2 (`gpt-image-2-style-library`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `gpt-image-2-style-library` - an agent skill plus prompt-template library: one SKILL.md, a generated style reference, and static assets that teach an agent to compose GPT-Image-2 prompts. The catalog entry `freestylefly/awesome-gpt-image-2` is the umbrella site (Vercel API, Supabase billing, gallery); the graded subject is the skill package under `agents/skills/`. |
| Pinned subject | github:freestylefly/awesome-gpt-image-2 @ commit `685469889fb72fd5adefae45e1645d527edcb5e7` (main head at audit time) |
| Stars | ~17,600 (catalog snapshot 2026-08-19) |
| npm integrity | Skill is published as `gpt-image-2-style-library`; tarball-to-commit comparison not attempted this pass. |
| License | MIT, LICENSE present at repo root (`LICENSE:1-2`). |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of the skill and its installers) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The skill itself is inert content - pure markdown, JSON, and images with no executable code in its
runtime path - but installing it means running a file-copy script that writes into your Codex,
Claude Code, and shared agent skill directories, and the umbrella repo around it ships a
cloud-billed image API, so scope discipline matters.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (skill runtime) | None. The skill's runtime surface is SKILL.md, references/style-library.md, and assets; there is no code that executes when an agent uses the skill. All fetch-capable code lives in the umbrella app, which never runs on an agent user's machine. | find over agents/skills/gpt-image-2-style-library: no .js/.mjs outside bin; api/generate-image.js:127-145 (server-side only) |
| Install behavior | `npm run install:skill` copies four entries into `~/.codex/skills`, `~/.claude/skills`, or `~/.agents/skills` via cpSync. File copy only: no network calls, no child_process, no shell commands anywhere in either installer. | agents/skills/gpt-image-2-style-library/bin/install.mjs:1-5, 26-45; scripts/install-style-skill.mjs:1-10 |
| Credential handling | The installers reference agent home directories only to compute destination paths; they read nothing inside them. No reads of credential files, no env harvesting beyond standard home resolution. | install.mjs:30-41; grep negative otherwise |
| Lifecycle hooks | None. package.json has no pre/postinstall; `predev`/`prebuild` regenerate data files locally before dev/build, which the developer runs on themselves. | package.json scripts block (full listing verified) |
| Umbrella API (not installed by the skill) | A Vercel function proxies image generation to a third-party relay (`https://ciyuan.today/v1/images/generations`) using a server-side CIYUAN_API_KEY, gated behind Supabase auth and credit reservations. Runs on the maintainer's deployment, not yours. | api/generate-image.js:7-8, 126-145 |
| DSH linkage | Same situation as NocoBase: a `dsh-plugin` topic on GitHub, zero DSH manifests in-tree (no cordis.patch.yml, *.cordis.yml, SKILL.md for dsh). The README documents Claude Code plugin marketplace, npx skills, and npm channels only. | find/grep negative; README.md:250-296 |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**1813 findings** (609 high, 23 medium, 1181 low) across 62 scanned files. Machine verdict **F**,
off three gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Where the volume is

The 1181 lows are overwhelmingly the 156 MB of gallery documentation and data JSON. Of the 609
highs, every single one sits in the umbrella web app (`api/`, `scripts/`, test fixtures) except two;
none sit in the graded skill package. Adjudication below covers all high families.

### Highs and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED high, installer references `~/.codex` / `~/.claude` (install.mjs:37,41) | Path construction for the copy destination, guarded by CODEX_HOME/CLAUDE_HOME overrides. It writes a new skill subfolder; it does not read or modify existing config, keys, or settings. | install.mjs:28-45; cpSync-only imports at line 1 |
| NET high, alipay/watcha/ga4/ciyuan URLs (api/_lib/*) | Server-side modules of the hosted demo site: payment provider endpoints, a media API, Google Analytics Data API. They execute on Vercel under the maintainer's env vars, never on a skill user's machine. Out of the graded runtime path. | api/_lib/alipay.js:4-8; watcha.js:4-7; ga4.js:94-95; generate-image.js:128 |
| EXEC high, dynamic import() in api-imports.test.js:30 | Test harness lazily importing sibling test modules by name. Test-only, literal-derived specifiers. | api/_lib/api-imports.test.js:30 |
| EXEC high, process spawn in community.test.js:163 | Test fixture spawning a local process during the repo's own test suite. Not shipped to skill users. | api/_lib/community.test.js:163 |
| `cred-plus-net` gate | Fires because server-side lib modules hold env credentials and make fetches - which is what a paid-API backend does. In the graded skill package neither family exists. Dismissed for this subject. | scoping per above rows |
| OBFU family flags | Minified-looking vendor snippets inside bundled site assets and lockfile noise; no obfuscated logic in the skill or installers. | scan JSON classification |

### Behavior worth naming because it is unusual

One npm command (`npm run ga4:oauth`, scripts/google-analytics-oauth.mjs) walks the developer
through a localhost OAuth loop against Google Analytics with readonly scope. Legitimate maintainer
tooling, but it loads `.env` values into the environment and should never be run by a skill user.

## 5. What we could not check

- **Published npm tarball equality.** The skill publishes as `gpt-image-2-style-library`; we did not
  diff the registry tarball against this commit.
- **Behavioral probe.** No sandboxed load of the skill through an actual agent run (pipeline S4).
- **Cross-model review.** Single reviewer.
- **Server-side secrets posture.** Whether the deployed Vercel/Supabase instance leaks anything is
  unobservable from the tree; only client-visible code was reviewed.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F (whole-repo); this card says B (graded skill package). Both
recorded. The gap: the entire finding volume belongs to the hosted web app and its tests, while the
skill users actually install contains no executable code beyond a file-copy installer. B rather than
A because provenance was not verified end to end, no behavioral probe ran, and the install step
does write into trusted agent directories.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/freestylefly/awesome-gpt-image-2 /tmp/agimg-audit
cd /tmp/agimg-audit && git rev-parse HEAD   # expect 685469889fb72fd5adefae45e1645d527edcb5e7

# 2. Re-run our scanner on the graded package
node tools/scan/dist/index.js /tmp/agimg-audit/agents/skills/gpt-image-2-style-library   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
find agents/skills/gpt-image-2-style-library -name "*.mjs" -o -name "*.js" | grep -v bin   # expect: no hits (no runtime code)
grep -rn "child_process\|execSync\|fetch(" agents/skills/gpt-image-2-style-library/bin/    # expect: no hits
grep -n "postinstall\|preinstall" package.json                                             # expect: no hits
sed -n '26,45p' agents/skills/gpt-image-2-style-library/bin/install.mjs                    # copy targets only

# 4. Confirm the cloud split
grep -n "ciyuan" api/generate-image.js                                                      # server-side relay only
```

## 8. Methodology and pinned inputs

- Subject: git commit `685469889fb72fd5adefae45e1645d527edcb5e7` (shallow clone at
  reference/audits/awesome-gpt-image-2); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`.
- Review: full read of both installers (bin/install.mjs, scripts/install-style-skill.mjs),
  SKILL.md, package.json lifecycle block, generate-image.js and _lib modules classification, and
  the README install channels; path-scoped adjudication of all 609 highs.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: graded package has no runtime egress, no dynamic execution, no credential
  access, and no lifecycle hooks; installer is cpSync-only into documented destinations. Caps:
  unverifiable npm provenance, no S4 probe, single reviewer, install-time write into agent trust
  directories. Result: B.

## 9. Strengths

1. The skill is genuinely inert: an agent consuming it reads markdown and JSON, executes nothing,
   and makes no network requests.
2. The installer uses only fs copy primitives with explicit allowlisted destinations and refuses
   unknown targets (install.mjs:12-17, 47-58).
3. Cloud capabilities are cleanly separated from the skill; nothing in the skill's dependency graph
   reaches the paid API.
4. MIT license with attribution present at root.

## 10. Residual risks

1. Running `install:skill` grants the repo author persistence inside your agent skill folders; a
   future malicious SKILL.md update would be auto-trusted by agents that load skills from those
   folders without re-review.
2. The `dsh-plugin` GitHub topic has no in-tree backing; DSH users searching by topic will find no
   DSH integration here.
3. The hosted demo's third-party relay (`ciyuan.today`) receives prompts server-side when people use
   the website; irrelevant to skill installs but relevant if you deploy the API yourself.
4. npm channel (`npx gpt-image-2-style-library`) resolves whatever is published latest, not this
   audited commit.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any JavaScript appearing outside `bin/` in the
   skill package, any fetch/child_process in the installers, or any postinstall hook forces
   re-adjudication.
2. Diff SKILL.md between the audited commit and any newer tag before trusting installs; prompt
   libraries can steer agents, so content changes are security-relevant even without code.
3. Re-vet at 90 days or on the next published npm version, whichever comes first.
