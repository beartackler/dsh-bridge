# Trust Report Card: dashi-taskboard (`codex-taskboard`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | `codex-taskboard` v1.1.9 - a local-first issue board served in the browser, embeddable in the Codex desktop app through a CDP-based launcher/injector pair, drivable by agents through the bundled `manage-taskboard` skill and the `taskctl` CLI, with an optional self-deployed Cloudflare Worker for team collaboration. |
| Pinned subject | github:chuspeeism/dashi-taskboard @ commit `5c96d1ab698362994283ba0af86021db0a98dd89` (main head at audit time) |
| Stars | ~2,600 (discovery sweep 2026-08-26) |
| npm integrity | Not published to npm as an installable plugin; consumed as a cloned/symlinked skill directory and desktop builds. Registry comparison not applicable this pass. |
| License | Apache-2.0, LICENSE present at repo root. |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review of server, injector, skill, and DSH integration) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A genuinely local-first task board whose shipped runtime contacts nothing beyond loopback plus
endpoints you deploy yourself, but its LAN sharing mode is unauthenticated by default on a
wildcard bind, and adopting it means letting a launcher drive the Codex desktop app over a
debugging pipe by explicit design.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress (runtime) | None to third parties. The server speaks loopback; the only outbound references in shipped runtime code are loopback URLs and your own configured origins. Cloud collaboration is a Cloudflare Worker you deploy to your own account. | server/index.mjs:15 (loopback log); wrangler.jsonc:2-4; PRIVACY.md "Network activity" |
| LAN exposure | Default HTTP bind is `0.0.0.0`; LAN mode has no account authentication - anyone on the local network who can reach the port can read and write the board. Documented, with a `127.0.0.1` escape hatch. | server/app.mjs:1640-1645; README.md:181, 189 |
| Launcher route gating | When started through the launcher, routes live under a random per-instance token prefix backed by a 32-byte random secret. | server/app.mjs:1595-1604, 1653, 1974; scripts/codex-injector.mjs:66-73 |
| Codex injection | The launcher spawns the user's Codex CLI and injects the taskboard UI into its window over a piped CDP connection using `Runtime.evaluate`, against a hash-gated 1850-line userscript. This is the product's core mechanism, not a hidden capability. | scripts/codex-injector.mjs:36, 738-809; inject/codex-taskboard.user.js:5-86 |
| Skill installation | The desktop launcher installs the `manage-taskboard` skill into the user's `.agents/skills` directory; the skill instructs agents to claim issues, execute work, and move board statuses under prompt-level rules. | PRIVACY.md "Data stored"; skills/manage-taskboard/SKILL.md core workflow items 1-3 |
| Credential handling | Production code resolves `~/.codex` to read agent/composer configuration; child processes run with all `CODEX_TASKBOARD_*` variables filtered out. No reads of auth.json, no token material touched. | server/ai-chat-catalog.mjs:610-618; server/app.mjs:1594; shared/codex-environment.mjs:1-4 |
| Telemetry | None found. PRIVACY.md explicitly rules out maintainer analytics; grep over server/, scripts/, cli/ finds no beacon endpoints. | PRIVACY.md; grep negative |

## 4. Evidence

Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

**1396 findings** (2 critical, 310 high, 45 medium, 1039 low) across 147 scanned files. Machine
verdict **F**, off four gates: `cred-plus-net`, `dynamic-exec-present`, `finding-density`,
`obfuscated-payload-executed`.

### Where the volume is

Of the 310 highs, 122 are `package-lock.json` registry URLs and 92 sit in test files; the rest
are spread across web UI fetch wrappers, injector spawn calls, and release scripts. Adjudication
below covers the criticals and every gate.

### Criticals and gates, adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| OBFU critical, `eval(atob(...))` in test/inject-fullheight-regression.test.mjs:176 | Literal text inside a regression-test HTML fixture string used to simulate the injected page. The shipped userscript contains no `eval` and no base64 decode of executable payloads; re-injection is gated by a source hash instead. | test/inject-fullheight-regression.test.mjs:176; inject/codex-taskboard.user.js:86 (hash sentinel); grep negative for eval/atob in inject/ |
| CRED critical, environment enumeration in test/ai-chat-runner.test.mjs:730 | A fake Codex CLI fixture that records which `CODEX_TASKBOARD_*` env keys it received, proving the launcher strips them. The production filter removes exactly those keys from child environments. | test/ai-chat-runner.test.mjs:727-731; shared/codex-environment.mjs:1-4 |
| `cred-plus-net` gate | Co-occurrence files are the two fixtures above plus server/app.mjs and scripts/codex-injector.mjs. In app.mjs the CRED hits resolve `~/.codex` for agent catalogs and the NET hits build loopback URLs; in the injector the spawn target is the user's own Codex binary and the socket is a piped CDP channel, not a network listener. No module reads credential secrets and sends them anywhere. | server/app.mjs:1553-1583, 1594; scripts/codex-cdp-pipe.mjs (stdio pipe); scoping per above rows |
| `dynamic-exec-present` gate | `Runtime.evaluate` calls execute the project's own hash-checked userscript inside the Codex window. Powerful by design, disclosed in the README as the embedding mechanism. Dismissed as hostile dynamic execution; retained as a named capability. | scripts/codex-injector.mjs:738, 785, 969 |
| `obfuscated-payload-executed` gate | Fires only off the test-fixture string above. No encoded executable content in shipped code. | scoping per row 1 |
| Medium CRED, secret-shaped env reads in scripts/codex-injector.mjs:67-73 | The launcher generating and publishing its own per-instance token/secret, then filtering them out of child environments. Self-issued session material, not harvested secrets. | scripts/codex-injector.mjs:66-73; shared/codex-environment.mjs:1-4 |

## 5. What we could not check

- **Behavioral probe.** No sandboxed launch of the board or the Codex injector (pipeline S4).
- **Cross-model review.** Single reviewer.
- **Cloud Worker deployment posture.** The `cloud/src/index.mjs` Worker was reviewed as source;
  the maintainer operates no hosted instance, so nothing was probed live.
- **Tauri desktop builds.** Release binaries on the project's download channel were not diffed
  against this commit.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says F (whole-repo); this card says C. Both recorded. The gap: both
criticals are test fixtures, the majority of highs are lockfile URLs, and the gates fire on
co-occurrence patterns that dissolve under file-level reading. C rather than B because the
default wildcard bind with unauthenticated LAN write access, the CDP injection surface, and a
skill that steers agents into autonomous board-driven work cycles are all real capabilities a
user must consciously accept, and the pipeline ceiling (no probe, single reviewer) applies.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/chuspeeism/dashi-taskboard /tmp/dashi-audit
cd /tmp/dashi-audit && git rev-parse HEAD   # expect 5c96d1ab698362994283ba0af86021db0a98dd89

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/dashi-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '1640,1645p' server/app.mjs            # default bind 0.0.0.0
sed -n '186,190p' README.md                   # LAN mode unauthenticated, documented
sed -n '1,4p' shared/codex-environment.mjs    # launcher env filter
grep -rn "eval(\|atob(" inject/               # expect: no hits
grep -rEn "https?://" server/*.mjs cli/*.mjs  # expect: loopback/example origins only
```

## 8. Methodology and pinned inputs

- Subject: git commit `5c96d1ab698362994283ba0af86021db0a98dd89` (shallow clone at
  reference/audits/dashi-taskboard); full-scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`.
- Review: full read of server/app.mjs host/auth resolution, the injector and its runtime, the
  injected userscript, the manage-taskboard skill, the deepseek-harness integration package,
  PRIVACY.md, and README LAN/cloud sections; directory-scoped adjudication of all criticals and
  gates.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: no third-party runtime egress, no telemetry, no hostile obfuscation, no
  credential theft path; caps: unauthenticated wildcard-bind LAN mode by default, CDP injection
  into the Codex app as core mechanism, agent-steering skill, no S4 probe, single reviewer.
  Result: C.

## 9. Strengths

1. Shipped runtime code contains no third-party network destination; the only outbound option is
   infrastructure the user deploys themselves.
2. Both critical findings are provably test fixtures, and their production counterparts do the
   opposite of what the scanner implied (filter env keys rather than harvest them).
3. Security-relevant behavior is documented with unusual candor, including the exact sentence
   that LAN mode has no authentication.
4. Route-prefix token gating plus a 32-byte instance secret protects the launcher-embedded
   scenario even though the underlying server trusts the LAN.

## 10. Residual risks

1. Running `npm start` with defaults exposes a writable board (tasks, comments, attachments) to
   every device on your LAN; the fix is one env var (`CODEX_TASKBOARD_HOST=127.0.0.1`) that many
   users will never set.
2. The launcher's CDP channel executes project-authored JavaScript inside the Codex desktop app;
   a compromised upstream of this repo could ride that channel into whatever the Codex window
   can reach.
3. The bundled skill instructs agents to claim issues and execute repository work autonomously;
   board content becomes a remote-control surface for agent behavior when the board is shared.
4. The `dsh-plugin` topic is backed by a thin integration package (a redirect route and iframe
   panel, integrations/deepseek-harness/, 207 lines total) rather than a full DSH-native plugin;
   DSH users should scope expectations accordingly.

## 11. Re-verify steps

1. Re-run the section 7 greps against current HEAD. Any third-party hostname appearing in
   server/ or cli/, any eval/base64-executable content in inject/, or a change to the LAN
   authentication model forces re-adjudication.
2. Diff skills/manage-taskboard/SKILL.md before trusting upgrades; prompt-material changes alter
   what agents can be steered to do.
3. Re-vet at 90 days or on the next tagged release, whichever comes first.
