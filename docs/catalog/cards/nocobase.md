# Trust Report Card: NocoBase (`@nocobase/plugin-ai`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@nocobase/plugin-ai` - the AI stack of the NocoBase no-code platform: LLM provider integrations (DeepSeek, OpenAI, Anthropic, Google, Dashscope, Ollama, and more), AI employees with conversation middleware, MCP client management, workflow LLM nodes, and a document loader. The catalog entry `nocobase/nocobase` is the platform monorepo; the graded subject is the plugin package inside it. |
| Pinned subject | github:nocobase/nocobase @ commit `4ee3ba8e285d53539cd82b1857313ffd1e387986` (main head at audit time) |
| Stars | ~23,800 (catalog snapshot 2026-08-19) |
| npm integrity | Not applicable to this pass: the graded surface ships inside the platform's own package stream; no tarball-to-commit comparison was attempted. |
| License | Dual AGPL-3.0 / commercial (`packages/plugins/@nocobase/plugin-ai/src/server/index.ts:2-7`; root `package.json:8`). Source-available, not OSI-simple. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of `plugin-ai`) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

The AI plugin's egress goes only to user-configured provider endpoints with keys supplied by the
user in the admin UI, local file reads are refused by construction, and no telemetry or install-time
hooks were found - but this is a whole business platform behind an opt-out commercial license whose
dev CLI runs patch-package at install time, so a careful user should know exactly what they are
deploying.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | All outbound traffic targets the base URL the administrator configures per LLM service; each provider falls back to its documented vendor host only when unset (DeepSeek: `https://api.deepseek.com`). Key usage is confined to `Authorization: Bearer <apiKey>` on those same requests. No third-party analytics or telemetry endpoint appears anywhere in the plugin. | llm-providers/provider.ts:194-215, 474-484; deepseek/provider.ts:182; repo-wide grep negative for telemetry hosts |
| Local file access | Refused by design: any non-http URL passed to attachment encoding throws `Local file path is not allowed`; http(s) fetches forward the caller's referer and user-agent but never read disk paths. | server/utils.ts:59-78 |
| Dynamic execution | Present but confined to platform machinery: a flow-engine template resolver uses `new Function('$root', ...)` over stored template options, and client-v2 bundles a requirejs-style loader that calls `eval(text)`. Neither executes remote input by default; both are product features (runjs blocks, i18n templates), which is itself worth knowing before deploying. | flow-engine/flowI18n.ts:90; client-v2/utils/requirejs.ts:2155 |
| Credential handling | Provider API keys arrive through admin-configured service options and are used only as bearer tokens to the configured endpoint. No reads of `~/.claude`, `~/.codex`, `~/.ssh`, or other agent credential stores found in the plugin tree. | provider.ts:476-481; grep negative over plugin-ai |
| MCP clients | The plugin can register and test external MCP servers from admin configuration - standard capability, but every configured MCP server becomes reachable code for the platform process. | resource/aiMcpClients.ts:14-61 |
| Install-time hooks | Root `postinstall: nocobase-v1 postinstall` runs patch-package, git-exclude writes, plugin symlink sync, and dev-mode env scaffolding. All work is local repo tooling; no network fetch was found in the hook path. | package.json:43; core/cli-v1/src/commands/postinstall.js:17-86 |
| DSH linkage | None in code: the repo carries a `dsh-plugin` GitHub topic, but no cordis.patch.yml, *.cordis.yml, SKILL.md, or dsh.plugin.json exists anywhere in the tree; the only "DSH" hits are unrelated strings. Treat the topic as aspirational metadata. | find/grep negative over pinned tree |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**2785 findings** (57 critical, 2175 high, 387 medium, 166 low) over 14,188 files across the whole
platform monorepo. Machine verdict **F**, off three gates: `cred-plus-net`, `dynamic-exec-present`,
`finding-density`.

### Where the volume is

This is a 110-plugin application platform, not a small extension. The bulk of findings sit in docs,
locales, fixtures, and the CLI/test tooling. Scoping to the graded AI plugin
(`packages/plugins/@nocobase/plugin-ai`, excluding tests): zero criticals and a handful of highs,
all adjudicated below.

### Highs and gates in the graded surface, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| NET high, provider/model endpoints | Dormant until an administrator configures a service; then requests go exactly where that configuration points, with that configuration's key. This is the product working as designed, not covert egress. | provider.ts:194-215; deepseek/provider.ts:182 |
| CRED family flags on auth/session code elsewhere in the monorepo | Belongs to `plugin-auth` and platform core, outside the graded plugin package; recorded as context, not as a finding against `plugin-ai`. | grading caps list, scan JSON |
| EXEC high `new Function` / `eval` sites | Two real dynamic-execution sinks exist (flowI18n template resolution, requirejs module text eval). Inputs are workspace-stored templates and bundled assets rather than remote payloads, but any workspace-injection vector becomes code execution. Named as the plugin's sharpest property. | flowI18n.ts:90; requirejs.ts:2155 |
| HOOK high, root postinstall | Runs yarn patch-package plus local repo bookkeeping at install time. Local-only by inspection of the command implementation; still an install-time code-execution moment users should expect. | cli-v1/src/commands/postinstall.js:17-23, 58-62 |
| `cred-plus-net` gate | In the graded package the two families do not co-occur in one execution path: keys ride only provider-configured requests. Dismissed for this subject; the machine gate fired on monorepo-wide co-location. | section 3 rows |

### Behavior worth naming because it is unusual

Attachment encoding deliberately forwards the incoming request's `referer` and `user-agent` headers
to whatever URL an attachment points at when fetching it for base64 encoding - reasonable for
authenticated media, but it means the plugin will make authenticated-looking requests to arbitrary
attachment URLs (server/utils.ts:63-77).

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run (pipeline S4 not available).
- **Cross-model review.** Single reviewer.
- **The other 109 plugins** and platform core. Out of scope; scanner findings there were classified,
  not adjudicated.
- **Commercial pro-plugin surface.** `packages/pro-plugins` is referenced by tooling but absent from
  the open tree, so the closed-source tier could not be examined at all.
- **npm provenance** for the published `@nocobase/*` packages versus this commit.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F (whole-repo); this card says C (graded package). Both recorded.
The gap: the F rests on monorepo-wide co-location of credential and network code in dev tooling and
tests, not in the AI plugin's runtime path. The ceiling stands at C because there is no behavioral
probe, no cross-model review, dual licensing with a closed pro tier, and real dynamic-execution
machinery shipped as a product feature.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/nocobase/nocobase /tmp/nocobase-audit
cd /tmp/nocobase-audit && git rev-parse HEAD   # expect 4ee3ba8e285d53539cd82b1857313ffd1e387986

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/nocobase-audit/packages/plugins/@nocobase/plugin-ai   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "api.deepseek.com" packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/deepseek/   # default vendor endpoint
sed -n '59,60p' packages/plugins/@nocobase/plugin-ai/src/server/utils.ts        # "Local file path is not allowed"
grep -rnE "telemetry|analytics|posthog|sentry" packages/plugins/@nocobase/plugin-ai/src   # expect: no hits
grep -rn "new Function" packages/core/flow-engine/src/flowI18n.ts               # dynamic template resolution
grep -rn "cordis\|SKILL.md" --include="*.yml" -r .                              # expect: no DSH manifests

# 4. Confirm install-time behavior
sed -n '43p' package.json && sed -n '54,64p' packages/core/cli-v1/src/commands/postinstall.js
```

## 8. Methodology and pinned inputs

- Subject: git commit `4ee3ba8e285d53539cd82b1857313ffd1e387986` (shallow clone at
  reference/audits/nocobase); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 2785 findings monorepo-wide,
  rescored to the graded plugin package.
- Review: manual read of plugin-ai server entry (plugin.ts, index.ts), provider.ts key/URL handling,
  deepseek provider, document-loader, aiMcpClients resource, server utils (file/URL encoding), plus
  classification of cli-v1 postinstall and flow-engine/client-v2 dynamic-exec sites.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives scoping to the graded package; egress is
  configuration-driven and visible to the administrator. Caps: no S4 probe, single reviewer,
  unverifiable npm provenance, dual-license closed tier, shipped dynamic-execution machinery,
  install-time hook in the dev CLI. Result: C.

## 9. Strengths

1. Egress is fully administrator-authored: base URL, model, and key are all explicit config with
   documented vendor defaults, and keys appear only as bearer headers to those endpoints
   (provider.ts:194-215, 476-484).
2. Local-file reads are structurally rejected rather than path-filtered
   (server/utils.ts:59-60).
3. No telemetry, analytics, or phone-home code exists anywhere in the plugin tree (grep negative).
4. The DeepSeek integration is first-party and maintained, including reasoning-mode normalization
   and responses-API adaptation (deepseek/reasoning.ts).

## 10. Residual risks

1. Any workspace author who controls flow templates or runjs blocks reaches the two
   dynamic-evaluation sinks; treat workspace authorship as privileged
   (flowI18n.ts:90; requirejs.ts:2155).
2. Admin-configured MCP clients become in-process capability for the platform; a malicious MCP
   config is code execution by another name (resource/aiMcpClients.ts:16-38).
3. The `dsh-plugin` topic on the repository is unbacked by any manifest in-tree; discovery data
   overstated DSH integration for this subject.
4. The closed `pro-plugins` tier cannot be audited from this tree; deployments that enable it trust
   NocoBase Inc. wholesale (cli-v1 postinstall writes the exclude entry).
5. Attachment fetching forwards caller referer/user-agent to arbitrary URLs, enabling
   authenticated-looking requests to attacker-chosen hosts if attachments are attacker-controlled
   (server/utils.ts:63-77).
6. AGPL + commercial dual licensing changes what you may do with modifications; verify before
   internal deployment of altered builds (LICENSE-APACHE.txt header block; package.json:8).

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any new hardcoded endpoint, telemetry import, or
   local-file allowance in plugin-ai forces re-adjudication.
2. Watch for the DSH story becoming real: a cordis.patch.yml or SKILL.md appearing in-tree converts
   this card's scope question into a live one.
3. Re-vet at 90 days, on the next platform minor that touches plugin-ai's provider layer, or when a
   behavioral probe and cross-model review become available, whichever comes first.
