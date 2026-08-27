# Trust Report Card: Yao Agents (`YaoApp/yao`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | Yao Agents platform - a self-hosted agent runtime (Go monorepo) rather than a Cordis plugin. Its DSH relationship is concrete and code-level: a DSH sandbox runner that prepares workspaces, injects ten embedded `SKILL.md` files into `.dsh/skills`, renders a `cordis.yml`, and streams turns through the pinned DSH CLI (`agent/sandbox/v2/dsh/`), plus the `sui` TypeScript UI framework and a `libsui` OpenAI-compatible client. |
| Pinned subject (git) | github:YaoApp/yao @ commit `5a3f9a6a7b937464923c0219eed2217fb9ddf34d` (default branch head at audit time, committed 2026-08-22T23:15:33+08:00) |
| Stars | 7,800 (upstream snapshot 2026-08-25) |
| Distribution | Self-built from source or Yao Desktop download; no npm package for the platform, so no registry provenance applies. |
| License | Modified Apache-2.0 with additional conditions: branding/logo must be preserved, the certificate verification logic must be maintained, and organizations with 50+ employees or over USD 1M revenue require a commercial license (LICENSE:3-19). |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of the DSH runner, skills, secret tools, web tools, and tai tunnel layer) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Nothing hostile survives adjudication - the DSH runner injects readable skill markdown, renders config locally, and points egress only where the user configured it - but the platform's own `secret_read` tool exists to hand decrypted stored secrets to agent-invoked processes by design, the DSH path receives your connector API key through the process environment, and the license carries commercial-use conditions beyond Apache-2.0.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| DSH sandbox runner | Implements the sandbox Runner interface for DSH: prepares the workplace, injects system skills and agent definitions into `.dsh/` and `.yao/assistants/<id>/`, appends a rendered system prompt to `AGENTS.md`, then executes `tai dsh` and streams output. | agent/sandbox/v2/dsh/runner.go:22-28, 45-95, 99 |
| Credential pass-through | Resolves the connector's API key and base URL, then sets `DEEPSEEK_API_KEY` and `DEEPSEEK_BASE_URL` in the DSH CLI process environment. The key travels from Yao's connector config into the spawned harness process; no third party receives it. | agent/sandbox/v2/dsh/command.go:38-56, 130-145, 186-192 |
| Secret tools exposed to agents | `tools.secret_read` returns the decrypted value of a user-stored secret by name; the shipped `yao-secret` SKILL.md actively instructs agents to call it. Reads require an authorized process context and every attempt (success or failure) is audit-logged with user/team/resource fields. | tools/secret/read.go:16-35, 70-110; tools/tools.go:89-90; tools/skills/yao-secret/SKILL.md |
| Skill injection | Ten capability-grouped SKILL.md files (workspace, process, secret, web, agent, board, doc, audio, image, workspace-config) are embedded via `embed.FS` and copied into the target workspace's `.dsh/skills`. | tools/skills.go:9-14; agent/sandbox/v2/dsh/runner.go:61-62 |
| Network egress | User-configured only: web search posts to Serper or Tavily with the user's API key (`https://google.serper.dev/search`), cloud fetch posts to a configured scrape endpoint, and the `libsui` OpenAI-compatible client calls whatever `baseURL` the connector defines. No hardcoded telemetry endpoint found. | tools/websearch/serper.go:23; tools/webfetch/cloud.go:14-30; sui/libsui/openapi.ts:184, 500 |
| Cross-node tunnels | The tai layer bridges local listeners to remote nodes over WebSocket, enabling the workspace skill's cross-node file operations - real remote-read/write reach, scoped to nodes the user registered. | tai/dial.go:50-53; tai/conn.go:35-55; tools/skills/yao-workspace/SKILL.md |
| Process execution | The `process_call` tool invokes Yao processes (e.g. `models.user.Find`) from agent bash; permission checking exists via `process_allowed`. | tools/skills/yao-process/SKILL.md |
| Dynamic code execution | None found outside build/test scaffolding; scanner EXEC volume is confined to workflow and test files. |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **65 findings** (2 critical, 58 high, 5 medium) over 338 files,
machine grade **F**, score 0, off `cred-plus-net`, `finding-density`, and one critical-count cap.
That shape comes almost entirely from CI release engineering; adjudication below covers every gate.

### Gates adjudicated

| Gate / finding | Adjudication | Evidence |
|---|---|---|
| `cred-plus-net` naming `.github/workflows/update-cdn-latest.yml` | The pairing is `AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}` mapped for rclone CDN sync inside a GitHub Actions deploy job, co-present with ordinary infrastructure URLs. Maintainer release plumbing on GitHub runners; never ships to users. Same pattern in `notarize-macos.yml:153` (macOS notarization credentials). | .github/workflows/update-cdn-latest.yml:30; .github/workflows/notarize-macos.yml:153 |
| NET high x45 (download.docker.com, api.moonshot.cn, api.kimi.com) | Docker's apt repository in CI install steps; Moonshot/Kimi endpoints appear as connector test fixtures in `pr-test.yml`. None is runtime code. | .github/workflows/agent-unit-test-windows.yml:115; .github/workflows/pr-test.yml:70-72 |
| NET high `sui/libsui` fetch/XHR (openapi.ts:184, 500, 640, 683) | The SUI framework's OpenAI-compatible client library. Every URL derives from the user-configured base URL; XHR uploads target `${baseURL}/file/<id>`. This is the advertised product surface, not covert egress. | sui/libsui/openapi.ts:184, 683; sui/libsui/index.ts:287 |
| OBFU medium `decodeURIComponent(document.cookie)` | Cookie parsing inside the SUI web-component layer for session/state values in Yao's own web UI; no exfil destination exists in the module. | sui/libsui/yao.ts:146; sui/libsui/openapi.ts:371 |
| `finding-density` | 65 findings over a 300k-line Go monorepo measures repository size, not concentration of capability. | scanner stats: 338 files, 982249 bytes |

### The two things worth knowing before installing

1. `secret_read` is a deliberate, documented, audited capability that gives the model a path to
   decrypted secrets the user stored in Yao. The guardrails (auth context required, full audit
   trail, names-only listing) are real, but the capability itself is the sharpest object here
   (tools/secret/read.go:70-110).
2. The DSH runner deliberately places the connector API key into the spawned DSH process
   environment. That is how the integration works at all, and the key goes to the local `dsh`
   process only, but it means a compromised skill running inside that harness can read the
   process environment (command.go:186-192).

## 5. What we could not check

- **Behavioral probe.** No sandboxed run of the DSH runner against a live harness (pipeline S4 unavailable).
- **Cross-model review.** Single reviewer.
- **Desktop distribution.** Yao Desktop binaries were not downloaded or compared against this source tree.
- **Go dependency tree** (gou, kun, cordis-adjacent libraries) reviewed only at its call sites cited above.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F; this card says C. The gap: both criticals are CI secret
mappings, the cred-plus-net gate lives entirely in workflow files, and runtime egress resolves only
to user-configured endpoints. C rather than B because the secret_read surface, environment-level
key pass-through, remote-node file reach, and the non-standard license are exactly the "real
capabilities a careful user should know about" the C band describes - and the pipeline ceiling
(no probe, single reviewer) bars B regardless.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/YaoApp/yao /tmp/yao-audit
cd /tmp/yao-audit && git rev-parse HEAD   # expect 5a3f9a6a7b937464923c0219eed2217fb9ddf34d

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/yao-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '150,160p' .github/workflows/update-cdn-latest.yml   # R2 secret mapping (critical adjudicated)
grep -n "DEEPSEEK_API_KEY" agent/sandbox/v2/dsh/command.go   # env pass-through
sed -n '1,20p' tools/skills/yao-secret/SKILL.md              # secret_read instructions to agents
sed -n '26,35p' tools/secret/read.go                         # auth-context requirement + audit on read
grep -rn "google.serper.dev\|tavily" tools/websearch/*.go    # search provider destinations
```

## 8. Methodology and pinned inputs

- Subject: git commit `5a3f9a6a7b937464923c0219eed2217fb9ddf34d` (shallow clone at
  reference/audits/yao); scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 65 findings, rescored to
  the adjudications in section 4.
- Review: manual read of agent/sandbox/v2/dsh/{runner,command}.go, tools/{tools,skills}.go,
  tools/secret/{read,list}.go, tools/websearch/serper.go, tools/webfetch/cloud.go, all ten
  tools/skills/*/SKILL.md, tai/{dial,conn}.go headers, sui/libsui network modules, LICENSE;
  classification pass over everything else.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no hostile finding survives; egress is configuration-driven throughout; the
  caps are the secret_read capability, environment key pass-through, unverifiable desktop
  artifacts, missing probe/review, and the modified license. Result: C.

## 9. Strengths

1. Secret reads are gated on an authenticated process context and every attempt is audit-recorded
   with actor and resource fields (tools/secret/read.go:26-110).
2. The DSH runner pins integration behavior in readable Go with unit tests covering env and skill
   paths (command_unit_test.go:211; parse_unit_test.go).
3. Skill injection ships as plain markdown a user can read before it reaches their harness
   (tools/skills/*/SKILL.md).
4. No telemetry endpoint exists anywhere in the audited tree; the only outbound destinations are
   ones the operator configures.

## 10. Residual risks

1. Any code executing inside a Yao-managed harness can request secret values by name through a
   documented tool; compromise of the agent equals compromise of those secrets
   (tools/skills/yao-secret/SKILL.md).
2. The connector API key sits in the DSH process environment for the lifetime of each turn
   (command.go:190).
3. Remote-node operations mean a compromised node registration broadens file reach beyond one
   machine (tai/dial.go:50-53).
4. The modified Apache-2.0 license adds branding, certificate-integrity, and enterprise commercial
   conditions that differ from what "Apache-2.0" usually implies (LICENSE:3-19).
5. Desktop release artifacts were not verified against this source tree.

## 11. Re-verify steps

1. Re-run section 7 greps against current HEAD. Any new hardcoded outbound host, any removal of the
   audit record on secret reads, or any new dynamic-evaluation construct forces re-adjudication.
2. Re-check whether the secret tool gained a scoping option (namespace/assistant-bound secrets);
   that would soften residual risk 1.
3. Re-vet at 90 days, at the next Yao minor release touching `agent/sandbox/v2/dsh/` or
   `tools/secret/`, or if desktop artifacts become reproducible from source.
