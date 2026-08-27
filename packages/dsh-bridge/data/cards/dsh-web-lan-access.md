# Trust Report Card: dsh-web-lan-access

| | |
|---|---|
| **Grade** | **B** — safe with documented behavior (manual adjudication; raw scanner output: C) |
| Plugin | dsh-web-lan-access v1.2.1 (github.com/AcidGr/dsh-web-lan-access) |
| Pinned subject (git) | `8eeb1d0cb79a6e199bde94f16f1e2f2b5a818f01` (default branch HEAD, committed 2026-08-22T08:55:21+08:00) |
| Verified at | 2026-08-26 (-04:00), revision 1 |
| Scanner | dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, 3 files / 5.4 KB scanned |
| Methodology | Static scan (tool) + full manual review of the entire codebase (50-line host module, bundle patch, both READMEs). Behavioral probe (S4) and cross-model adversarial review (S5) have NOT run; see "What we could not check". |

A grade is evidence-backed opinion over the pinned commit above. It is not a safety guarantee and says nothing about any other commit or version.

## Verdict in one sentence

A 50-line, no-dependency plugin that injects a crypto.randomUUID polyfill and widens LAN trust via config patching — no egress, no credentials, no dynamic execution, no processes, no timers — graded B rather than A only because its entire effect is to make a DSH web server reachable from your network, which is a real security-posture decision it puts in your hands without an install-time consent prompt.

## What this plugin can do (capability surface)

| Capability | Present | Evidence |
|---|---|---|
| Network egress | None | No `fetch`, `http`, or URL literals anywhere except comment text describing LAN URLs (`cordis.patch.yml:17-18`). The plugin makes zero outbound connections. Scanner NET hits are those comments plus repo metadata (`package.json:23,25,27`). |
| Credential access | None | No file reads, env reads, or secret-shaped strings. Grep over all three shipped files: zero CRED family hits. |
| Dynamic code execution | None in JS | The polyfill string is static script markup injected into served HTML (`lib/index.js:18-24`); on the page it only defines `crypto.randomUUID` from `crypto.getRandomValues` if missing (`lib/index.js:20-24`) and returns immediately when the API exists (`lib/index.js:20`). One caveat below on the YAML expression evaluator. |
| Child processes | None | No child_process, spawn, exec. |
| Timers / beacons | None | No setTimeout/setInterval. |
| Obfuscation signals | None | 50 lines of plain source; the polyfill is minified by hand but readable and greppable via marker comment (`lib/index.js:26-27`). |
| Machine fingerprinting | None | No os/userInfo calls in the module. The patch expression enumerates network interfaces, but only inside the harness's own config evaluation to widen trusted hosts (below). |
| npm lifecycle hooks | None | package.json declares no scripts at all; zero dependencies; files allowlist ships exactly `lib/` + `cordis.patch.yml` (`package.json:13-16`). |

## What it actually changes on your machine

The whole plugin is three config/source edits:

1. **Injects a polyfill script** into every served web page as the first element of `<head>` via the webserver's index-tap hook (`lib/index.js:47`, injection logic `lib/index.js:30-34`). On HTTPS or localhost origins it is a no-op (`lib/index.js:20`). Purpose: DSH's browser UI calls `crypto.randomUUID()` in boot paths, which is undefined on plain-HTTP non-localhost origins; without this, sessions never render from LAN IPs.
2. **Binds the webserver to 0.0.0.0** through a bundle-patch config override instead of the CLI flag (`cordis.patch.yml:28-31`), because newer harness versions reject `--host 0.0.0.0` on the CLI while still accepting it in schema.
3. **Widens the `/api` trust fence** to every non-internal IPv4 interface present at boot (LAN addresses, Tailscale 100.x, VPN ranges) via a `!!js` expression evaluated in the harness's own loader context (`cordis.patch.yml:33-35`). This is what makes browsers on other machines able to call the API.

Effects 2 and 3 are reversible by removing the two patch blocks (`cordis.patch.yml:37` documents this).

## Findings

Raw scan retained at `reference/audits/dsh-web-lan-access.scan.json`: 7 findings (0 critical, 3 high, 0 medium, 3 low), mechanical grade C, score 61, no gates triggered. Adjudication of every finding:

| ID | Location | Severity (mechanical) | Adjudication |
|---|---|---|---|
| NET-007 x2 | `cordis.patch.yml:17,18` | high | False positive. Both matches are prose comments containing example URLs (`http://<lan-ip>:3080`, `http://<tailscale-ip>:3080`); no fetchable literal exists in the plugin. Downgraded to not-present. |
| SUPPLY-010 | `package.json:23` — git-host repository URL "resolves to moving HEAD" | high | False positive as stated: the field is repository metadata, not a dependency spec; nothing is installed from it. The underlying concern (this card pins one commit; future versions are unvetted) belongs to residual risks, not supply-chain mechanics. Downgraded to info. |
| NET-008 x3 | `package.json:23,25,27` | low | GitHub metadata links. No action. |

The scanner sees no EXEC, CRED, HOOK, or OBFU findings. The genuine risk of this plugin is architectural, not detectable by pattern scanning: it deliberately exposes the harness control plane to your LAN.

## Strengths

- Smallest possible diff against stock behavior: zero dependencies, zero runtime processes, zero egress, exact-scoped effects, each independently revertible.
- Honest engineering docs: the header comment explains why `crypto.randomUUID` fails on insecure origins (`lib/index.js:4-15`), why the fence snapshot needs re-deriving (`cordis.patch.yml:9-15`), and how to undo everything (`cordis.patch.yml:37`).
- Polyfill is conditional and standards-conformant (RFC 4122 v4 bits set at `lib/index.js:22`); on secure origins it does nothing.
- Inject-gated on `webServer` (`lib/index.js:44`): inert in non-web trees; teardown disposes the tap (`lib/index.js:47`).
- Bilingual README documents the Tailscale/MagicDNS use case and the security trade-off of trusting local subnets.

## Residual risks

1. **This plugin lowers your harness's network posture by design.** Binding 0.0.0.0 plus auto-trusting every IPv4 interface means any device on any of your networks can drive the full DSH API: sessions, tools, model calls. Anyone who installs this accepts "everyone on my LAN/Tailscale net is a trusted DSH user." The README states the intent but there is no allowlist-by-subnet option and no consent gate at install time.
2. **The `!!js` patch expression runs arbitrary-looking code in the loader's `with(ctx)` scope** (`cordis.patch.yml:33-35`). Audited here line by line: it only reads `ctx.webRuntime?.trustedHosts` and `os.networkInterfaces()`. But users should understand that any plugin shipping a `!!js` tag executes code during config load; the mechanism itself deserves distrust even when this instance is clean.
3. **Interface snapshot happens once per boot** (`cordis.patch.yml:11-14`): a network added later requires a restart to be trusted. Minor availability quirk, disclosed in-repo.
4. **No authentication layer is added.** If the harness later gains per-origin authn, this plugin's widened fence may bypass assumptions built elsewhere; re-review on harness upgrades.
5. Static review only; probe/review/signing pending pipeline availability. Re-vet versions newer than 1.2.1.

## Verify this yourself

```bash
git clone --depth 1 https://github.com/AcidGr/dsh-web-lan-access && cd dsh-web-lan-access
git rev-parse HEAD        # 8eeb1d0cb79a6e199bde94f16f1e2f2b5a818f01 at audit time

# The entire executable surface
cat lib/index.js          # 50 lines

# The three config edits
cat cordis.patch.yml

# Confirm zero egress / cred / exec surface
grep -rn -E "fetch\(|require\(|child_process|process\.env|setInterval" lib/ cordis.patch.yml   # expect: no hits
grep -rn "http" cordis.patch.yml   # expect: comments only (lines 17-18)

node /path/to/dsh-bridge/tools/scan/dist/index.js .
```

## Methodology and pinned inputs

- Charter: `CHARTER.md` (every claim cites file:line). Pipeline reference: `docs/trust/pipeline-architecture.md`.
- Scanner: dsh-bridge.scan/v1 v0.1.0, rules digest `d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`, run over the shallow clone; raw JSON at `reference/audits/dsh-web-lan-access.scan.json`.
- Manual review covered: 100% of the shipped surface (one module, one patch file, manifest, LICENSE, both READMEs) and complete findings adjudication. Node v26, macOS/aarch64.

## Revision history

| Rev | Date | Subject | Grade | Change |
|---|---|---|---|---|
| 1 | 2026-08-26 | git `8eeb1d0c` (v1.2.1) | B | Initial card. Static + manual methodology; probe/review pending pipeline availability. |
