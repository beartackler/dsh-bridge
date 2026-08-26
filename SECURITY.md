# Security Policy

dsh-bridge is a DeepSeek Harness (DSH) plugin whose central promise is trust:
we publish evidence-backed **trust report cards** about third-party plugins.
That promise obliges us to hold our own code to the same standard, and to be
explicit about what our claims do and do not cover.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest released minor (`0.x` current) | ✅ Security fixes |
| Previous minor | ⚠️ Critical fixes only, until the next minor ships |
| Anything older, forks, or unreleased `main` | ❌ Not supported |

dsh-bridge is pre-1.0. There is no long-term support branch: the remedy for a
security issue is to upgrade to the latest release. Once 1.0 ships, this table
will be replaced with a version-window policy.

## Reporting a vulnerability

**Please do not open a public GitHub issue, discussion, or pull request for a
security problem.** Public reports expose users before a fix exists.

Report privately via GitHub **private vulnerability reporting**:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Fill in the advisory form.

Include, where possible:

- affected version or commit SHA, and the DSH / Cordis versions in use;
- reproduction steps or a proof-of-concept;
- observed impact (credential access, code execution, data egress, etc.);
- file:line references — we cite evidence in our reports, and we appreciate the
  same courtesy.

If GitHub private vulnerability reporting is unavailable to you, contact the
repository owner privately through their GitHub profile and ask for a private
channel. Do not include secrets, tokens, or personal data in any report.

## Scope

**In scope**

- The dsh-bridge plugin runtime and its published distribution artifacts.
- The command surface, connector/auth onboarding flows, and installer flow.
- The trust-report-card generator and any published card that materially
  misrepresents evidence (for example, a card whose stated file:line citation
  does not support its conclusion).
- Repository automation that can affect what we publish (CI workflows,
  release tooling).

**Out of scope**

- Vulnerabilities in DeepSeek Harness, Cordis, schemastery, or other upstream
  dependencies — report those to their maintainers. Tell us too if dsh-bridge
  meaningfully amplifies the impact.
- Vulnerabilities in third-party plugins themselves. A plugin being insecure is
  a fact about that plugin, not a vulnerability in dsh-bridge — unless our card
  asserted something false about it.
- Findings from automated scanners with no demonstrated impact.
- Social engineering, physical access, or attacks requiring an already-
  compromised local machine.

## Disclosure timeline

| Stage | Target |
| --- | --- |
| Acknowledge report | 3 business days |
| Initial triage and severity assessment | 10 business days |
| Fix or documented mitigation, critical/high | 30 days from triage |
| Fix or documented mitigation, medium/low | 90 days from triage |
| Public advisory | With the fix release, or on request after the window |

Coordinated disclosure: we ask that you hold public details until a fix ships
or the applicable window elapses. We will keep you updated, credit you in the
advisory unless you prefer otherwise, and publish a GitHub Security Advisory
for anything user-affecting. If we cannot fix an issue, we will say so publicly
rather than let it sit silently.

## No install lifecycle hooks

**dsh-bridge defines no `preinstall`, `install`, `postinstall`, or `prepare`
lifecycle hook, and never will.** Installing dsh-bridge executes none of our
code; code runs only when DSH loads the plugin into a profile you chose.

Concretely:

- Published packages contain runtime bundles, type declarations, metadata,
  license, docs, and the Cordis patch. Development and build scripts are
  excluded from the published tarball, and this is verified in CI.
- The Cordis patch inserts the plugin row only; it never executes scripts.
- The published runtime contains no dynamic code execution (`eval`,
  `new Function`, `child_process`) and does not import development tooling.
  CI enforces this on every release.
- `child_process` use is confined to maintainer-run build and verification
  scripts that never ship, never run at install time, and never accept model
  output, plugin runtime input, or network input as arguments.
- No telemetry without explicit opt-in. No network calls except the documented
  ones (registry/catalog fetches performed at your request).

Any release that violates the above is a security bug — please report it.

## What we do **not** guarantee about third-party plugins

Our trust report cards are the most useful thing we publish and the easiest
thing to over-read. Read this section before relying on one.

- **Cards are point-in-time evidence, not a warranty.** A card describes one
  specific commit or published version, analyzed on a specific date, with the
  analysis version stated on the card. It says nothing about any other version.
- **A grade is not a safety certification.** It summarizes what static analysis
  and behavioral heuristics observed: network egress, credential access,
  lifecycle hooks, dynamic evaluation, obfuscation signals. Absence of evidence
  is not evidence of absence. Obfuscated, dynamically loaded, or
  remotely-fetched code can defeat any static review, ours included.
- **Upstream can change under you.** Tags, branches, and mutable registry
  entries can be re-pointed or re-published after we reviewed them.
  **Pin refs.** Install third-party plugins by immutable commit SHA or exact
  published version — matching the ref recorded on the card — rather than by
  branch or floating range. A card for `v0.3.1` does not cover `v0.3.2`, and it
  does not cover `main`.
- **We do not audit runtime behavior, upstream dependencies, or the models,
  services, and networks a plugin talks to.** Transitive dependency risk is not
  covered by the plugin's grade.
- **We are not a security program for other people's code.** Cards are
  best-effort community review offered as-is, without warranty. You remain
  responsible for what you install and run on your machine.
- **We will correct the record.** If a card is wrong, tell us privately and we
  will publish a corrected card with its history intact. We amend cards; we do
  not quietly delete them.

## Handling of secrets

dsh-bridge's connector flows may detect existing local credentials in order to
configure model routes. We never print secrets, never write them to logs or
report cards, and never transmit them anywhere other than the provider endpoint
you configured. A report of secret leakage is treated as critical severity.
