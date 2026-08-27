# The daily loop

> Question this document answers: what makes a DSH user open a dsh-bridge command on an ordinary
> Tuesday, when nothing is broken and nothing is being installed?
>
> Inputs: `docs/reviews/pm-product-review.md` sections 3 and 6,
> `packages/dsh-bridge/src/commands/status.ts`, `src/commands/trust.ts` (refresh),
> `src/lib/drift.ts`, `src/commands/memory.ts`.

## Where we actually are

The product review is right that there is no loop, and the code confirms it. Of the 19 command
modules, exactly one mechanism produces a signal the user did not ask for: `driftStatusLine()` in
`src/lib/drift.ts`, surfaced by `/bridge-status`. Its own doc comment says a clean profile "earns
silence, not a reassurance banner" (`drift.ts:328-338`).

That was the right call for a dashboard row and the wrong call for a habit. A surface that is
silent when things are fine has nothing to show on the ~95 percent of days when things are fine,
so it is never worth opening, so it is not there on the day it has something to say. This is the
core design problem of the daily loop, and it is a product problem, not an engineering one.

A daily surface must pay on a quiet day. The payment can be one of three things: an attestation
(something was checked and held), a decrement (a backlog got one item smaller), or a delta
(something changed since you last looked, including "nothing"). Alarms are the exception path.

## Three candidate loops

### Loop A: plugin-health and drift stewardship

**User story.** "I run six DSH plugins from strangers on the internet. I want a ten-second
morning check that tells me whether the code on my disk is still the code somebody audited, and
if my audit coverage is decaying, I want to be handed one small chore that fixes it."

**Trigger.** Session start, or a deliberate morning open. The world moves without the user: a
marketplace installs latest, a transitive dep bumps, a card ages past its verified date.

**Payoff on a bad day.** "modlens changed since audit" plus `/bridge-trust refresh modlens`, which
already works and produces a real findings diff (`trust.ts:381` `refreshInstalled`).

**Payoff on a quiet day.** Three things, all real and all cheap: (1) an attestation with a date -
"6 plugins tracked, all aligned, checked today"; (2) a delta since the last open - "nothing moved
in 3 days"; (3) a rotation chore - "oldest audit is `plugin-x`, 47 days; re-check it" - which
decrements a backlog the user can see shrinking. That third item is the one that makes the habit
stick, because it converts a passive readout into a one-command task with a visible end state.

**Build cost: S.** Everything underneath exists. `discoverInstalledPlugins`, `hashPluginDir`,
`detectDrift`, and the `audit-state.json` store are shipped and tested (`test/drift-test.ts`).
What is missing is a per-open state file to compute "since last open", a rotation picker, and a
renderer that does not go silent. No network, no new dependency, no host seam.

**Risk.** The signal is only as good as the audit records. A profile where nothing was ever
audited must read as "0 of 6 tracked", not as a clean bill of health. Getting that honesty right
is most of the review work.

### Loop B: workspace-context memory continuity

**User story.** "I want the instructions the agent reads to stay true as my repo changes, without
me remembering to maintain a markdown file."

**Trigger.** Opening a project, or a repo changing under a stale instruction file. Review section
6.3 names exactly this: `/bridge-init` authors once and nothing keeps it current.

**Payoff on a bad day.** "3 instructions in your memory file reference paths that no longer
exist."

**Payoff on a quiet day.** Weak, and this is the disqualifier. "Your memory file still matches
your repo" is not a fact a user feels. Unlike a supply-chain hash, nobody is anxious about it, so
the attestation has no emotional counterparty. The honest quiet-day output is a shrug.

**Build cost: M to L.** `memory.ts` today owns one flat file at `$HOME/.dsh-bridge/memory.md`
with `## ` sections and no notion of a project (`memory.ts:39-46`). Staleness detection needs a
repo-scoped store, a path-reference extractor, and a diff against the working tree - the
multi-scope resolver the memory spec explicitly defers. Real work before the first useful line.

**Verdict.** Correct problem, wrong first move. Revisit once a project-scoped memory store exists
for other reasons.

### Loop C: cost and usage awareness

**User story.** "I want to know what I spent yesterday and whether today is unusual."

**Trigger.** Money. The strongest intrinsic daily trigger of the three; it is why usage dashboards
get opened without prompting.

**Payoff on a bad day.** "Yesterday cost 4x your 7-day median."

**Payoff on a quiet day.** Genuinely good: a sparkline and a number are pleasant to look at even
when boring.

**Build cost: L, and mostly not ours.** `status.ts:62-69` takes `tokenUsage` as an optional
injected service and renders `unavailable` with "token-meter not mounted on ctx" when it is
absent, which is the honest state today. We do not own the meter, we have no persistence of
historical usage, and we have no price table. Building one means either shipping a pricing
dataset that goes stale silently - the exact failure mode the trust catalog exists to avoid - or
showing tokens without money, which is a much weaker product. It also depends on a host seam that
is not verified as mounted.

**Verdict.** Best trigger, worst dependency position. Defer until the meter is real and mounted;
then it is an M, and it composes with Loop A rather than competing.

## Decision: Loop A, shipped as a briefing

**Primary loop: plugin-health and drift stewardship**, delivered as `/bridge-daily` - a dated
briefing built from data already on disk.

Reasoning, in order of weight:

1. **It is the only candidate whose quiet-day payoff is a fact the user cares about.** Supply
   chain anxiety is the emotion this repo already sells. An attestation with a date and a hash
   behind it is the natural daily unit of that product.
2. **The substrate is built and tested.** S versus M/L. Loop A is the only one where the first
   version is a renderer plus a small state file rather than a new subsystem.
3. **It owns its data end to end.** No host service, no network, no pricing table, no unverified
   seam. It cannot regress because someone else's API moved.
4. **It creates work for the commands that are already the product.** The rotation chore points at
   `/bridge-trust refresh`, which points at the cards. The loop feeds the moat instead of
   competing with native DSH surfaces, which is the trap `/model`, `/compact`, and `/resume` sit
   in.

What we deliberately do not build now: session-start auto-invocation (needs a host hook we have
not verified), a statusline contribution (review section 6.1, separate seam), notifications, and
any cost figure.

## The shipped surface

`/bridge-daily` renders, in order:

| Block | Quiet day | Eventful day |
|---|---|---|
| Attestation | `6 plugins tracked, 6 aligned, checked 2026-08-26` | `5 aligned, 1 changed` |
| Delta since last open | `Nothing moved in 3 days.` | `modlens changed since your last open` |
| Rotation chore | `Oldest audit: plugin-x, 47 days. /bridge-trust refresh plugin-x` | same, after the alarm |
| Coverage honesty | `2 of 6 have never been audited locally; that is unknown, not clean.` | same |

Design rules it holds, all inherited from existing module contracts:

- **A hash mismatch is never a grade.** Drift means the audited artifact is not what is on disk.
  Same rule `drift.ts` already states.
- **Absence is never reassurance.** An empty profile prints "nothing tracked", never "clean". A
  never-audited plugin is counted separately from an aligned one.
- **Read-only over the user's tree.** The only file written is our own
  `$HOME/.dsh-bridge/daily-state.json`, a sibling of the existing `audit-state.json` and
  `memory.md`, per the `memory.ts` precedent that bridge state lives in a bridge directory.
- **No network, no clock surprises.** `now` and every I/O boundary are injected.

## Marked speculative

These are honest guesses, not verified facts, and are labeled as such here rather than implied by
confident code:

1. **That a daily briefing produces a habit at all.** Unvalidated. Zero users have been observed.
   The reasoning above is a product argument, not evidence. The cheapest disproof is that nobody
   runs it twice; we cannot currently measure that, and we are not adding telemetry to find out.
2. **That the rotation chore is the sticky element.** This is the strongest claim in the document
   and the least supported. It is borrowed from backlog-decrement patterns elsewhere, not
   measured here.
3. **The 30-day staleness threshold** reused from `STALE_AFTER_DAYS` in `status.ts:26`. It is a
   round number, not a derived one. It is not calibrated against real plugin release cadence.
4. **Session-start delivery.** The review assumes a session-start hook exists to print one line
   automatically. We have not verified such a seam, so this version is invoked by hand and says
   so. If the hook exists, the digest's one-line summary is the thing to route through it.
5. **That per-directory hashing stays cheap** as profiles grow. `MAX_FILES` is 5000 per plugin
   with a 4 MiB per-file read cap (`drift.ts:45-48`). Fine for the plugins in the catalog today;
   not benchmarked against a large profile.

## Not chosen, and what would change our mind

- **Loop C becomes primary** the day a token meter is verified as mounted on `ctx` and a price
  source exists that we can date and pin the way we date cards. Money beats hygiene as a trigger.
- **Loop B becomes primary** if project-scoped memory ships for another reason, since the
  staleness check is then a small addition rather than a subsystem.
