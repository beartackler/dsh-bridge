# Verified Plugin Catalog

This index lists every DeepSeek Harness plugin that has completed a dsh-bridge trust review. One row per plugin: what it is, where it lives, the grade it earned, a one-line verdict distilled from the full report card, the date the audit finished, and the repository's star count at catalog-snapshot time.

A grade is an evidence-backed opinion over one pinned commit. It is not a safety guarantee and says nothing about any other version.

## Grading bands

Defined in [the trust pipeline](../trust/pipeline-architecture.md); summarized here.

**A - Verified-clean.** Zero high or critical findings, full source-to-artifact reproducibility, no dynamic code execution, all egress inside a declared allowlist, a clean behavioral probe, and concurrence from two independent adversarial reviewers. Recommended by default in `/bridge:install`.

**B - Safe with documented behavior.** At most two medium findings, each explained by documented functionality. Any declared network egress is documented and user-visible, and provenance is verifiable end to end.

**C - Use with awareness.** Real capabilities or gaps a careful user should know about before installing. This is also the ceiling for anything the pipeline could not fully examine: missing provenance, no behavioral probe, or no cross-model review caps a plugin here even when nothing hostile was found.

**D - Risky.** Undocumented egress, credential-path reads without exfil evidence, install-time hooks, obfuscation signals, or a disputed high finding. Install only if you understand the specific risk named on the card.

**F - Do not install.** Demonstrated hostility: canary token exfiltration, reachable credential-read-plus-network combinations, sandbox escape attempts, deliberate obfuscation of executable or network paths, or typosquatting with impersonating metadata.

## Catalog

Sorted by grade, then by repository stars (snapshot 2026-08-19; see note below).

| Grade | Plugin | Repo | Stars | Verdict | Verified | Card |
|---|---|---|---:|---|---|---|
| B | OpenViking memory plugin | volcengine/OpenViking | 29567 | Conversation data flows only to the endpoint you pin, loopback by default; no dynamic execution, no telemetry, no child processes from the plugin. | 2026-08-26 | [card](cards/openviking.md) |
| B | Archify (`@tt-a1i/archify-dsh`) | tt-a1i/archify | 14283 | Host adapter is 21 lines of path math; all capability lives in the user-invoked skill CLI behind layered SSRF guards; no telemetry, no credential access. | 2026-08-26 | [card](cards/archify.md) |
| B | modlens (`@liustack/modlens`) | liustack/modlens | 3152 | Network targets only named vision endpoints plus its own loopback routes; credentials are touched solely for existence checks and opt-in reuse grants. | 2026-08-25 | [card](cards/modlens.md) |
| B | dsh-better-sidebar | omdsh-dev/DSH-better-sidebar | 2216 | No telemetry, third-party egress, or credential reads; hands the model a real shell through terminal tools, which is the documented product. | 2026-08-25 | [card](cards/dsh-better-sidebar.md) |
| B | dsh-context | bowenliang123/dsh-context | 416 | One cached npm version check, zero credential reads, no dynamic execution; system prompts and messages render in the web UI by design. | 2026-08-26 | [card](cards/dsh-context.md) |
| B | ponytail (`@mengyuly/dsh-ponytail`) | MengYuil/dsh-ponytail | unknown | Shipped bundle has no egress, credential access, dynamic execution, or install hooks; the published npm tarball is byte-identical to the audited commit. | 2026-08-25 | [card](cards/ponytail.md) |
| C | OpenDesign design plugin | nexu-io/open-design | 91534 | The DSH profile adapter is stdio-only with no egress or credential reads; install-time builds, opt-out analytics, and an auto-updating desktop app cap it at C. | 2026-08-26 | [card](cards/open-design.md) |
| C | Cherry Studio (`@cherrystudio/dsh-bridge`) | CherryHQ/cherry-studio | 51073 | Bridge control plane is token-gated loopback with a fail-closed policy engine, but an unauditable obfuscated SSO vendor bundle ships in the main process alongside opt-out telemetry. | 2026-08-26 | [card](cards/cherry-studio.md) |
| C | ouroboros | Q00/ouroboros | 5565 | No malicious indicators, but phones home by default (documented, opt-out), reaches pypi.org before consent, and runs floating PyPI builds rather than the audited commit. | 2026-08-26 | [card](cards/ouroboros.md) |
| C | dsh-web-ui family (`@linxin666/*`) | zhu1090093659/dsh-web-ui | 4661 | No malicious behavior found on any audited surface; capped at C because the behavioral probe and cross-model review did not run, telemetry lacks opt-in, and SSH secrets sit in plaintext. | 2026-08-26 | [card](cards/dsh-web-ui.md) |
| C | mirage (`@struktoai/mirage-dsh`) | strukto-ai/mirage | 3520 | Nothing malicious found, but it executes agent-supplied code by design, its configured doors reach the real host, and the audited commit matches no published npm artifact. | 2026-08-26 | [card](cards/mirage.md) |
| C | dsh-tui (`@deepseek-harness-tui/dsh-tui`) | ccch1mneyyy/dsh-TUI | 2009 | Source review is clean (no keylogging beyond prompt input, egress limited to a balance API and npm checks); the compiled artifact npm actually ships could not be verified against it. | 2026-08-26 | [card](cards/dsh-tui.md) |
| C | dshmarket (`dshmarket`) | dsh-market/dsh-market | 1100 | Install path is well-guarded (curated allowlist, DNS-pinned SSRF defenses, zero telemetry), but installs resolve to latest at click time and backups can carry unmasked profile secrets. | 2026-08-26 | [card](cards/dsh-market.md) |
| C | api-relay-audit | toby-bridges/api-relay-audit | 791 | Touches exactly the key you hand it and sends it nowhere but the relay under test; capped at C because no sandboxed probe or cross-model review ran for this pass. | 2026-08-25 | [card](cards/api-relay-audit.md) |
| C | Tencent BrowserSkill DSH plugin | Tencent/BrowserSkill | unknown | Near-maximum Chrome permissions kept loopback-only with consent gates, yet an agent can read logged-in pages on prompt-level rails alone, and the daemon auto-updates itself by default. | 2026-08-26 | [card](cards/browserskill.md) |
| C | memsearch (`@zilliz/memsearch-dsh`) | zilliztech/memsearch | unknown | All egress goes to well-known endpoints with no credential theft, but session hooks pipe astral.sh's installer straight into a shell unpinned, which hard-caps the grade. | 2026-08-26 | [card](cards/memsearch.md) |
| D | ruflo / claude-flow | ruvnet/ruflo | 69420 | Nothing malicious found, but the CLI silently npm-installs patch updates at every startup and one workspace postinstall globally installs an unpinned tool. | 2026-08-26 | [card](cards/ruflo.md) |

Distribution: 0 A, 6 B, 10 C, 1 D, 0 F across 17 reviewed plugins.

Star-count note: numbers come from the upstream star snapshot behind [docs/catalog/manifest.json](manifest.json) (checked 2026-08-19). Subpath entries share their parent repo's count, so some rows measure the umbrella repo rather than the individual plugin. Where a card cites a fresher audit-time figure, the card wins.

## Requesting a review

Open a GitHub issue against this repository with: the plugin's repository URL, the exact version or commit you run, your install channel, and a one-line description of what the plugin claims to do. We pin a commit and grade that revision only; reviews proceed in submission order.

## Re-verifying a result yourself

Every card ends with a "Verify this yourself" section containing the pinned commit hash and copy-pasteable commands that reproduce the headline claims: clone at the pinned commit, rerun the scanner, and grep for the cited evidence. If the commands disagree with the card, the card is wrong; please open an issue with your output.

## Freshness

Grades apply to the pinned commit listed on each card as of the verified-at date. Upstream repositories move continuously, and marketplaces typically install whatever is newest at click time, so a grade describes the audited revision, not the live stream. Treat a card as stale if its subject has shipped a new version since the verified date, the scanner rules changed, or more than 90 days have elapsed; each card lists its own re-verify triggers. Nothing here updates automatically.
