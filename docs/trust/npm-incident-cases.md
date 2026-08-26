# Supply Chain Incident Case Files: npm / VSIX / Editor Plugins

> Evidence base for the dsh-bridge verified-installer & trust-report-card pipeline (CHARTER.md §3, "Verified installer & trust layer").
>
> Ten real incidents, selected because each one breaks a **different** assumption a plugin trust pipeline tends to make. For each case: what happened, the initial access vector, the detection gap, and the one-line lesson for our pipeline. Compiled 2026-08-25 from primary postmortems and vendor research; sources linked inline.

| # | Incident | Year | Ecosystem | Initial access | Core failure |
|---|----------|------|-----------|----------------|--------------|
| 1 | event-stream / flatmap-stream | 2018 | npm | Social-engineered maintainer handoff | Encrypted, target-selective payload |
| 2 | eslint-scope | 2018 | npm | Credential reuse, no 2FA | Remote fetch-and-exec in postinstall |
| 3 | ua-parser-js | 2021 | npm | npm account takeover | Silent preinstall dropper |
| 4 | coa + rc | 2021 | npm | Coordinated takeover of dormant accounts | Dormancy read as safety |
| 5 | ctx | 2022 | PyPI | Abandoned-package name resurrection | Same-name update bypassed suspicion |
| 6 | "Darcula Official" fake theme | 2024 | VS Code Marketplace | Brand impersonation, forged trust markers | Metadata graded instead of behavior |
| 7 | GlassWorm | 2025 | OpenVSX | Stolen publish rights, worm propagation | Invisible Unicode defeated all human review |
| 8 | postmark-mcp | 2025 | npm (MCP server) | Brand impersonation, slow-trust build | One-line trojanization after 15 clean releases |
| 9 | Shai-Hulud (+ 2.0) | 2025 | npm | Stolen maintainer tokens, self-replication | Dev-machine secrets amplified one breach |
| 10 | MaliciousCorgi | 2026 | VS Code Marketplace | Self-published, utility as camouflage | "Works as advertised" conflated with safe |

---

## Case 1 — event-stream / flatmap-stream (npm, 2018)

**What happened.** The canonical JS supply chain attack. The maintainer of `event-stream` (millions of weekly dependents, including the Copay bitcoin wallet) handed the project to a stranger who answered a GitHub request for help. The new maintainer added an obfuscated dependency, `flatmap-stream@0.1.1`, carrying an AES-encrypted payload that decrypted and executed **only** inside applications matching Copay's fingerprint, then rewrote wallet signing logic to send account balances and credentials to attacker infrastructure. It ran undetected for roughly two months across millions of installs ([npm incident report](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident), [Snyk postmortem](https://snyk.io/blog/a-post-mortem-of-the-malicious-event-stream-backdoor/)).

**Initial access vector.** Voluntary ownership transfer to an unvetted party; no compromise of any system was needed.

**Detection gap.** The payload was encrypted and conditionally activated: on every machine other than the intended targets, nothing malicious ever executed, so static scanning and user observation both saw a healthy package. The ownership transfer itself raised no signal anywhere in the ecosystem.

**Lesson for our plugin trust pipeline:** treat maintainer/ownership changes as the highest-risk lifecycle event (full adversarial re-review), and specifically flag code whose activation depends on detecting the host application's identity.

## Case 2 — eslint-scope (npm, 2018)

**What happened.** On July 12, 2018, an attacker published `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2` with a malicious `postinstall` script that fetched a payload from pastebin.com and uploaded the victim's `~/.npmrc` — which typically holds an npm publish token. A developer noticed the odd pastebin fetch in install output within ~50 minutes; npm unpublished the versions and revoked all tokens issued before 12:30 UTC ([ESLint postmortem](https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/)).

**Initial access vector.** Credential stuffing: the maintainer reused a password exposed in a third-party breach and had no 2FA on the npm account.

**Detection gap.** Nothing automated flagged the publish; discovery was a lucky human reading install logs. The payload itself lived entirely off-registry (pastebin), so package-content inspection alone would have shown only a small network-fetching stub.

**Lesson for our plugin trust pipeline:** any lifecycle hook that fetches and executes remote content is malice until proven otherwise, and trust grades must incorporate publisher-account posture (2FA age, credential hygiene), not just package content.

## Case 3 — ua-parser-js (npm, 2021)

**What happened.** On October 22, 2021, the hijacked npm account of `ua-parser-js` (6-8M weekly downloads) published three versions containing obfuscated `preinstall` droppers: Linux machines received an XMRig cryptominer, Windows machines received a cryptominer plus a DanaBot-family infostealer harvesting browser password stores, cookies, FTP clients, and wallet files. Exposure window was roughly four hours; CISA issued an advisory the same day ([FortiGuard report](https://www.fortiguard.com/threat-signal-report/4218/cryptominer-and-infostealer-delivered-via-hijacked-popular-npm-library), [BleepingComputer](https://www.bleepingcomputer.com/news/security/popular-npm-library-hijacked-to-install-password-stealers-miners/)).

**Initial access vector.** Direct npm account takeover of the legitimate maintainer (credential compromise).

**Detection gap.** Preinstall scripts execute silently during perfectly routine `npm install` runs; most developers never see them. Popularity functioned as false assurance, and the four-hour window closed before any ecosystem-wide alarm existed.

**Lesson for our plugin trust pipeline:** any install-time script anywhere in a plugin's dependency tree is a hard flag that requires written justification in the trust report, and a fresh publish after long stability should automatically place the package on hold pending review.

## Case 4 — coa + rc, coordinated takeover (npm, 2021)

**What happened.** Two weeks after ua-parser-js, on November 4, 2021, two dormant packages were hijacked within hours of each other: `coa` (transitive dep of Angular/React CLI ecosystems) and `rc` (~14M weekly downloads). Both received "routine maintenance" version bumps carrying a nearly identical DanaBot-family payload on the same infrastructure — a single operator working from a breach corpus. They were discovered because the bumps **broke React ecosystem CI**, not because any security control fired ([incident dossier with GHSA references](https://incidents.cremit.io/incidents/rc-coa-coordinated-takeover-2021)).

**Initial access vector.** Takeover of long-dormant maintainers' npm accounts via credential reuse/stuffing.

**Detection gap.** "Unmaintained" was universally read as "stable and safe," leaving publishing credentials unaudited for years. Detection keyed on install failures — the wrong end of the funnel entirely.

**Lesson for our plugin trust pipeline:** revival-after-dormancy is a top-tier risk signal; when a package resumes publishing, freeze its trust grade and force full re-review before it stays listed.

## Case 5 — ctx (PyPI, 2022)

**What happened.** On May 14, 2022, attackers republished the abandoned-but-popular Python package `ctx` with a version bump that harvested AWS credentials and environment variables from build and developer machines and exfiltrated them over HTTPS to attacker-controlled infrastructure. ReversingLabs surfaced it during a broader typosquat hunt; the period saw waves of 500+ malicious PyTI packages targeting cloud keys ([campaign overview](https://safeguard.sh/resources/blog/ctx-and-colourama-pypi-typosquat-malware-incident), [Check Point on the wider wave](https://blog.checkpoint.com/securing-the-cloud/pypi-inundated-by-malicious-typosquatting-campaign/)).

**Initial access vector.** Abandoned-name resurrection: a legitimate-looking "new release" on a dead project whose name still carried inherited trust.

**Detection gap.** A same-name, higher-version release bypasses essentially all suspicion — there is no visible difference between the rightful owner returning and an attacker taking the seat, unless you track publisher continuity explicitly.

**Lesson for our plugin trust pipeline:** publisher continuity is a first-class input — a release appearing on a previously-abandoned plugin resets trust to zero and mandates a line-by-line diff against the last known-good artifact.

## Case 6 — "Darcula Official" fake VS Code theme (Marketplace, 2024)

**What happened.** In a controlled experiment, Koi Security cloned the 6M-install "Dracula Official" theme as "Darcula Official": copied assets, registered the look-alike domain `darculatheme.com` to earn the verified-publisher badge, listed the *real* Dracula repo in `package.json` (accepted unverified), and seeded fake reviews — total elapsed time, 30 minutes. The theme recolored the IDE while sending every opened document's source plus host fingerprints to their server. It reached the Marketplace trending page and was confirmed installed inside multiple multi-billion-dollar companies, including one of the world's largest security vendors ([Koi research, part 1/6](https://www.koi.ai/blog/1-6-how-we-hacked-multi-billion-dollar-companies-in-30-minutes-using-a-fake-vscode-extension)).

**Initial access vector.** None required: marketplace onboarding is self-service, and every trust marker (domain badge, repo link, reviews, trending status) was forged or gamed.

**Detection gap.** Microsoft's verification signals measure marketing effort, not behavior. Nobody — marketplace or buyer — analyzed what the extension did with document contents, which was the entire attack.

**Lesson for our plugin trust pipeline:** our report cards must assign zero trust weight to marketplace metadata (badges, stars, reviews, trending) and grade exclusively on observed data flows; visual/brand derivatives of popular plugins get automatic deep review.

## Case 7 — GlassWorm (OpenVSX, 2025)

**What happened.** The first self-propagating worm targeting editor extensions. Infected VS Code-family extensions on OpenVSX hid their payloads using **invisible Unicode characters** — code that renders as nothing in editors, pull requests, and most diff tooling. The worm harvested secrets from 49 cryptocurrency-wallet extensions plus npm/GitHub/OpenVSX tokens, received commands via Solana blockchain memos (unkillable C2), then used the stolen publish rights to push infected updates to further extensions. OpenVSX declared the incident "fully contained" on October 21; Koi detected a new wave on November 6 — sixteen days later — with further waves through March 2026, including MCP-based delivery ([Koi disclosure](https://www.koi.ai/blog/glassworm-first-self-propagating-worm-using-invisible-code-hits-openvsx-marketplace), [Truesec analysis](https://www.truesec.com/hub/blog/glassworm-self-propagating-vscode-extension), [return wave](https://www.koi.ai/blog/glassworm-returns-new-wave-openvsx-malware-expose-attacker-infrastructure)).

**Initial access vector.** Compromised extension repositories and publish credentials; propagation via the credentials stolen from each victim.

**Detection gap.** Human code review and textual diffs are structurally blind to homoglyph/invisible-character code; the marketplace's own scanner reportedly failed open months later; and "contained" declarations preceded re-infection within weeks.

**Lesson for our plugin trust pipeline:** byte-level invisible-character and homoglyph scanning is mandatory both pre-listing and pre-install; trust grades must bind to exact artifact hashes and expire on any new publish, because containment is never permanent.

## Case 8 — postmark-mcp, first malicious MCP server (npm, 2025)

**What happened.** A package impersonating Postmark's official Model Context Protocol server accrued 15 clean versions and ~1,500 weekly downloads. Version 1.0.16 (September 17, 2025) added a **single line**: a hidden BCC copying every outbound email to an attacker-controlled address. Koi disclosed it September 25; roughly 300 organizations were affected; Postmark publicly disowned the package ([Koi disclosure](https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft), [Snyk analysis](https://snyk.io/blog/malicious-mcp-server-on-npm-postmark-mcp-harvests-emails/), [Postmark statement](https://postmarkapp.com/blog/information-regarding-malicious-postmark-mcp-package)).

**Initial access vector.** Brand impersonation plus a slow-trust build: many clean releases established legitimacy before incremental trojanization.

**Detection gap.** Reputation earned across clean versions defeated snapshot scanning, and the entire backdoor was one line a whole-file scanner would rank as noise. Meanwhile MCP tools receive broad, sensitive permissions (read/send email here) by default with no per-tool audit.

**Lesson for our plugin trust pipeline:** per-release semantic diff review is non-negotiable — grade the delta between versions, not the snapshot — and tool-type plugins (MCP, connectors) need capability-level scrutiny of every permission they exercise.

## Case 9 — Shai-Hulud, the npm worm (+ "Second Coming") (npm, 2025)

**What happened.** The first large-scale self-replicating npm worm. Compromised maintainers' packages shipped a `postinstall` bundle that executed a bundled TruffleHog binary to sweep the machine for cloud, npm, and GitHub secrets; registered attacker-accessible GitHub Actions runners for persistence; exposed private repositories public; and auto-published infected versions of every package the victim had rights to — 500+ packages, including `@ctrl/tinycolor` and CrowdStrike internal packages. Round two ("Sha1-Hulud: The Second Coming," November 24, 2025) hit 796+ unique packages with preinstall-based delivery ([StepSecurity analysis](https://www.stepsecurity.io/blog/ctrl-tinycolor-and-40-npm-packages-compromised), [Datadog on 2.0](https://securitylabs.datadoghq.com/articles/shai-hulud-2.0-npm-worm/), [Elastic on the later CHAINDROP campaign](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain)).

**Initial access vector.** Stolen maintainer credentials, then self-propagation using the tokens harvested from each new victim.

**Detection gap.** Developer machines are saturated with long-lived secrets, converting one foothold into hundreds of poisoned packages; meanwhile a postinstall script running a bundled "scanner" binary looked like ordinary tooling.

**Lesson for our plugin trust pipeline:** sandbox installs so lifecycle hooks get no network and no access to token/credential stores, and hold dsh-bridge itself to zero-long-lived-credential hygiene so that recommending a poisoned plugin can never turn us into a propagation amplifier.

## Case 10 — MaliciousCorgi fake AI coding assistants (VS Code Marketplace, 2026)

**What happened.** Two extensions posing as free AI coding assistants accumulated ~1.5M combined installs on the official Marketplace. Crucially, they **worked as advertised** — real completions, genuinely useful — while silently uploading users' source code and developer telemetry to attacker servers. The delivered value made them indistinguishable from legitimate products in daily use and suppressed exactly the suspicion that usually surfaces malware ([Koi disclosure, Jan 22 2026](https://www.koi.ai/blog/maliciouscorgi-ai-extensions-leaking-code-from-15-million-developers); [coverage](https://hackmag.com/news/vscode-fake-ai)).

**Initial access vector.** Ordinary self-service publishing, with real functionality as camouflage.

**Detection gap.** Users got genuine value, so nothing ever "felt wrong"; functional quality and behavioral safety were conflated by users, by the marketplace, and by every downstream recommendation list.

**Lesson for our plugin trust pipeline:** "it works" is not evidence of safety — the pipeline must score data-egress behavior independently of functionality and verify that observed network traffic matches the plugin's documented behavior.

---

## Methodology and verification notes

Compiled 2026-08-25. Cases rest on primary postmortems (ESLint, npm, Postmark), vendor research (Koi Security, StepSecurity, Snyk, Truesec, Datadog, Elastic), and advisory databases (GHSA). Where secondary sources disagreed on detail, the primary source was preferred and cited.

One frequently repeated claim **failed verification and was excluded**: the story that `iconv-lite@0.4.15` shipped a malicious `preinstall` script. No authoritative source was found, and the live npm registry metadata for 0.4.15 (published 2016-11-21, predating the claimed incident window) contains **no** install scripts at all. This exclusion is deliberate and is exactly the discipline the trust pipeline must apply to plugins: primary evidence over folklore, every claim reproducible from the artifact.

## Design implications for dsh-bridge

- **Grade artifacts and deltas, not reputations.** Every listing gets byte-level static analysis per release (including invisible-Unicode/homoglyph detection, per GlassWorm), a full lifecycle-script inventory (per ua-parser-js/coa/rc/eslint-scope), and a semantic diff against the previous known-good version (per postmark-mcp). Grades bind to artifact hashes and expire on any new publish.
- **Make identity events the tripwire.** Ownership transfers (event-stream), revival after dormancy (coa/rc, ctx), and weak publisher-account posture such as missing 2FA (eslint-scope) are the strongest predictors in this dataset; the pipeline must track publisher history per package and force full adversarial re-review when these events occur.
- **Ignore marketplace metadata; grade observed behavior.** Badges, stars, reviews, trending, and even genuine functionality (Darcula, MaliciousCorgi) carry zero evidentiary weight; trust report cards cite concrete data flows — egress destinations, credential/environment/file access, dynamic evaluation, and conditional activation triggers — with file:line evidence per the charter.
- **Treat install time as hostile territory.** Lifecycle hooks run in a sandbox with no network and no access to `~/.npmrc`, browser stores, or environment credential sets; remote fetch-and-exec at install is an automatic reject; and dsh-bridge's own automation holds no long-lived tokens so a bad recommendation cannot propagate (Shai-Hulud lesson).
- **Assume re-infection and plan the kill switch.** GlassWorm and Shai-Hulud returned in waves after "containment," so the catalog needs continuous re-scans, advisory-feed ingestion, a published hash revocation list, and a one-command delist (`/bridge:revoke <plugin>`) that reaches installed users — plus a public incident log, because auditable response is itself a trust artifact.
