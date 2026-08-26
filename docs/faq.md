# FAQ

Straight answers to the questions people actually ask before installing dsh-bridge.
Every claim links to the document that backs it. If a link doesn't support the claim,
that's a bug — [tell us](../SECURITY.md#reporting-a-vulnerability).

- [Is this safe to install?](#is-this-safe-to-install)
- [Is this official DeepSeek software?](#is-this-official-deepseek-software)
- [Why a plugin instead of upstream PRs?](#why-a-plugin-instead-of-upstream-prs)
- [Does it work with TUI / headless / non-web profiles?](#does-it-work-with-tui--headless--non-web-profiles)
- [Which models and providers are supported?](#which-models-and-providers-are-supported)
- [What if a trust card is wrong?](#what-if-a-trust-card-is-wrong)
- [Can my agent install plugins for me safely?](#can-my-agent-install-plugins-for-me-safely)
- [How is this different from awesome-dsh-plugin?](#how-is-this-different-from-awesome-dsh-plugin)
- [Was this built by AI?](#was-this-built-by-ai)

---

## Is this safe to install?

Honest answer: **a DSH plugin is arbitrary code running inside your agent process, with your
credentials, on your machine.** That's true of dsh-bridge too, and no badge changes it. The
DSH sandbox governs filesystem effects of *tool calls*, not plugin code — upstream says so, and
we quote it with `file:line` in the [built-in red-team audit](audits/dsh-builtin-redteam.md).

So instead of asking you to trust us, we make ourselves checkable:

- **Everything we say about a third-party plugin cites evidence** at `file:line` in a pinned
  commit ([trust pipeline](trust/pipeline-architecture.md)). No commit SHA, no grade.
- **The pipeline is reproducible.** Same subject, same pipeline digest → same verdict digest.
  You can recompute a card yourself with `git`, `node`, `jq`, and `openssl`
  ([determinism requirements](trust/pipeline-architecture.md#3-determinism-requirements)).
- **We never raise a grade by hand.** Tooling permits lowering only
  ([grade bands](trust/pipeline-architecture.md#s6--adjudicate)).
- **No telemetry without opt-in, no undocumented network calls** — a
  [charter principle](../CHARTER.md#non-negotiable-principles) and a review-gate checkbox in
  [CONTRIBUTING](../CONTRIBUTING.md).

Verify us the way we verify others: read the source, run `/doctor`
([spec](specs/commands/doctor.md)) to see exactly what's mounted, and check that our own
practices match the [plugin author guide](plugin-author-guide.md) bar we hold others to.

A grade is evidence-backed opinion with reproducible inputs. It is **never a proof of safety**,
and we say that on every card.

## Is this official DeepSeek software?

**No.** dsh-bridge is an independent, MIT-licensed community project. Not affiliated with,
endorsed by, or supported by DeepSeek. We build on the Cordis kernel and DeepSeek Harness with
gratitude and preserve upstream licenses and attribution
([license hygiene](../CHARTER.md#non-negotiable-principles)).

Bugs in DSH itself go to the harness maintainers, not us — see
[SECURITY.md scope](../SECURITY.md#scope).

## Why a plugin instead of upstream PRs?

Because DSH is *designed* for this. Cordis's premise is that every part of the product is a
plugin, and extensions mount beside the others via documented seams — commands, tools, skills,
credentials, LLM adapters, UI slots
([capability seams map](research/dsh-capability-seams.md)). Shipping the familiar-command
surface as a plugin is using the architecture, not routing around it.

It also fails safely for you: a plugin is opt-in, profile-scoped, and every registration is
undone on unload. Upstreaming an opinionated English-first command layer would impose our taste
on everyone.

**We do contribute back where the seam is genuinely missing.** When a feature needs a capability
DSH doesn't expose (marked `L` in the [portable features inventory](research/portable-features.md)),
the right fix is upstream, and we'll file it there rather than patch around it locally.

## Does it work with TUI / headless / non-web profiles?

Mostly yes, with one honest caveat.

| Surface | Status |
|---|---|
| Slash commands | Portable. `ctx.commands.register` is UI-adapter agnostic; the adapter renders the result ([seams](research/dsh-capability-seams.md)). |
| Connectors / auth flow | Works, but headless callers **decline prompts** by design (`ctx.authorization`, [seams](research/dsh-capability-seams.md)). Run onboarding interactively once, then headless sessions reuse the stored credential. |
| `/doctor`, `/trust` (read) | Fully headless. Both are read-only and make no network calls by default ([doctor](specs/commands/doctor.md), [trust](specs/commands/trust.md)). |
| Plugin browser, trust card UI, onboarding wizard | **Web client only.** These are React components in DSH's slot registry. The same information is available as text through the commands. |

Third-party TUI clients such as `dsh-TUI` are separate projects; we don't control their slot
rendering (see the [ecosystem audit](research/ecosystem-audit.md)).

## Which models and providers are supported?

Whatever DSH supports, plus easier setup. Providers arrive as `LlmAdapter` plugins registered
through `ctx.llm.registerAdapter`, so the supported set is the set of adapters mounted in your
profile — DeepSeek and pi-ai ship as reference implementations upstream
([seams](research/dsh-capability-seams.md)).

dsh-bridge's contribution is the connectors flow: detect credentials you already have
(`~/.claude`, `~/.codex`, opencode `auth.json`, environment variables), configure the model route,
and smoke-test it. Checks C6 and C7 in [`/doctor`](specs/commands/doctor.md) tell you exactly
which routes have a usable credential and a registered adapter.

**Secrets are never printed.** `/doctor` reports presence and shape only, never values. If a
configured route has no adapter, we say so instead of silently falling back.

## What if a trust card is wrong?

Assume it will happen sometimes and design for it. Three paths:

1. **Re-verify.** Cards bind to one pinned commit. Upstream moves, cards go stale. `/trust refresh
   <plugin>` re-runs the pipeline at HEAD and prints a grade/findings diff against the prior card
   ([spec](specs/commands/trust.md#trust-refresh-plugin)). Stale is a soft install gate; invalid is
   a hard one. Old cards are never edited, only superseded.
2. **Check the citation yourself.** Every finding carries path, line, an excerpt, and an excerpt
   hash, with a pretty-printed rendering for minified bundles so line numbers stay human-checkable
   ([S3 evidence records](trust/pipeline-architecture.md#s3--static-scan-vs-heuristics-corpus)).
   If the excerpt doesn't say what we claim, the card is wrong and the fix is mechanical.
3. **Dispute it.** Two reviewers on different models already cross-check each other; disagreement
   on a high or critical finding marks the item `disputed`, renders at the **lower** severity with
   both rationales, and forces a manual gate ([S5](trust/pipeline-architecture.md)). Plugin authors
   and users can open that same dispute from outside: file an issue citing the card and the
   `file:line` you think is misread.

A card that **materially misrepresents evidence** — a citation that doesn't support its conclusion
— is treated as a security issue in *us* and is explicitly in scope for private reporting
([SECURITY.md](../SECURITY.md#scope)).

False negatives are the harder case, and we don't pretend otherwise: absence of findings is
reported as "no findings in the scanned surface", never "safe". Anything we couldn't fully examine
caps the grade at **C**.

## Can my agent install plugins for me safely?

Safely *enough*, if the gates hold — and the gates are the point.

The dangerous default in this ecosystem is that install-time code runs before any runtime control:
`dsh plugin add` forwards to `pnpm`, and git-hosted plugins execute build scripts on install
(finding **F3** in the [red-team audit](audits/dsh-builtin-redteam.md)). An agent that pipes a
random repo into that command is a supply-chain incident waiting to happen.

dsh-bridge's install flow is ordered to make the safe path the easy one:

1. Prefer an already-verified plugin from the catalog.
2. Otherwise offer to **scaffold your own** with safety rules pre-baked
   ([`/bridge:suggest`](specs/commands/suggest.md)) — often better than installing a 1-star repo.
3. Only then raw install, behind explicit typed risk consent proportional to the grade
   ([consent ladder](design/trust-report-card.md#2-grade-bands)).

Grade **F** is blocked outright. Unreviewed (`?`) is treated as **D** for consent purposes,
because "nobody looked" must never read as "fine". The trust check is a gate on the install path,
not advice the agent can skip — and the consent step is for the human, by design.

Our own analysis pipeline **never executes plugin code** to reach a verdict; lifecycle hooks are
inspected as evidence, and a fixture plugin that writes a sentinel file on install is used to prove
it ([acceptance criterion 5](specs/commands/trust.md)).

## How is this different from awesome-dsh-plugin?

We're downstream of it, not competing with it. awesome-dsh-plugin (2,189 entries, bilingual
descriptions) solved discovery, and its contributing guide is admirably blunt: *"Being listed is
still not a security review."* dsh-market solved one-click install. Neither answers *is it safe*
or *is it good* — the list explicitly refuses to rank quality.

| | awesome-dsh-plugin | dsh-market | dsh-bridge |
|---|---|---|---|
| Discovery | ✅ | ✅ | inherits both |
| Security review with `file:line` evidence | ❌ stated non-goal | ❌ supply-side only | ✅ |
| Quality / design ranking | ❌ refuses | sort by stars | ✅ tiers |
| English-first repo-level docs | partial | partial | ✅ |
| Install with a consent trail | copy-paste shell | one-click, no risk signal | ✅ graded gate |

Full numbers, star distribution, and the five grassroots vetting attempts that preceded us are in
the [ecosystem audit](research/ecosystem-audit.md). Median plugin: **2 stars**; 12.7% have any
screenshot. Discovery is solved. Trust and taste are not.

## Was this built by AI?

**Yes.** dsh-bridge is built by a mixed-model agent swarm — research, adversarial audit,
implementation, review — coordinated and reviewed by a human. That's stated openly in the
[charter](../CHARTER.md#working-model-the-swarm) and the README, not buried.

We think you deserve the caveats too:

- **Cross-model review is a method, not a marketing line.** The adversarial reviewer runs on a
  different model than the author, and neither model can set a grade: scoring is a deterministic
  function no model touches ([S6](trust/pipeline-architecture.md)).
- **LLM stages are not bit-deterministic**, so every model claim must be excerpt-hash-verified
  before it can affect a verdict. Unverified model prose is advisory and never moves the grade
  ([determinism boundaries](trust/pipeline-architecture.md#32-determinism-boundaries-stated-honestly)).
- **Docs marked *(verify)*** were inferred from source or READMEs rather than exercised against a
  running build — see the header notes in [research](research/dsh-capability-seams.md).
  We'd rather flag it than let it read as tested.
- **Specs are not shipped code.** Several documents here are drafts describing intended behavior.
  The [README status table](../README.md#status) is the source of truth for what exists today.
- **No slop is a merge gate**, not a vibe: every change passes cross-model review and acceptance
  checks ([CONTRIBUTING](../CONTRIBUTING.md)).

A project whose product is trust cannot be coy about its own provenance. If you find a claim here
that outran its evidence, that's exactly the bug report we want.
