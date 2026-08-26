# Show HN draft — dsh-bridge

Status: **draft only. Do not post.** Numbers and claims below must be verified against
shipped behavior before this goes anywhere.

## Title options (≤80 chars, no clickbait)

1. `Show HN: Dsh-bridge – trust reports for DeepSeek Harness plugins`
2. `Show HN: Dsh-bridge – audit a DSH plugin before you install it`
3. `Show HN: Familiar slash commands and plugin audits for DeepSeek Harness`
4. `Show HN: A DeepSeek Harness plugin that reviews other plugins`
5. `Show HN: Dsh-bridge – English-first plugin catalog with security evidence`

Preference: #2 (concrete action, no superlatives). #1 is the safe fallback.

## Post text (~150 words)

> Plugins in DeepSeek Harness are arbitrary code: models, tools, sessions, and storage all
> load as plugins. Today there is no good way to prove one is harmless before you install it.
> dsh-bridge is my attempt at that missing layer.
>
> It does two things. First, it runs an automated adversarial review over a plugin —
> network egress, credential file access, lifecycle hooks, `eval`/`child_process`,
> obfuscation signals — and emits a trust report card where every claim cites file:line,
> so you can check my work instead of trusting my grade. The reports live in the repo.
>
> Second, it ports command surfaces people already have muscle memory for from Claude Code,
> Codex, OpenCode, and Jcode (`/help`, `/model`, `/login`, `/memory`, `/mcp`) onto DSH seams.
>
> This is early. The analysis is heuristic, not a proof, and it will miss things. I would
> rather hear where it misses than ship quietly. Repo and example reports in the comments.

Word count target: ~150. Trim the command list first if over.

## Anticipated objections and honest replies

**1. "This is agent-written slop."**
Fair prior — a lot of it is agent-written. Reply honestly: the repo has a stated no-slop
gate (cross-model review before merge, adversarial auditor on a different model than the
author). Point at concrete artifacts rather than arguing: the audit reports with file:line
citations, the commit history, SECURITY.md. Invite them to pick any audit and check one
citation. Do not claim humans wrote it all. Do not get defensive.

**2. "Why isn't this upstreamed into DSH?"**
Good question and partly the plan. Honest answer: DSH is a developer preview and the
plugin-everything kernel is the point — shipping this as a plugin is how DSH expects
capabilities to arrive, and it lets the trust layer iterate faster than a kernel release
cycle. Also, a security-review layer that lives outside the thing it reviews has better
incentives. If maintainers want any of it upstream, I'll open the PR; nothing here is
license-hostile (MIT, upstream attribution preserved).

**3. "Another marketplace = fragmentation."**
Concede the risk directly. dsh-bridge is not a competing registry: it indexes the existing
market and community lists rather than asking authors to publish somewhere new. The output
is a review over what already exists. If the native market adds trust reporting, the right
outcome is for this to become redundant, and I'd say so.

**4. (Likely, prepare for it) "Static analysis can't prove safety."**
Correct, and the title should never claim otherwise. Reply: the claim is "evidence you can
audit," not a proof of harmlessness. Grades are heuristics; the value is that every flag is
a citation you can open. Say plainly what classes of attack it will miss.

## Posting time guidance

- Best window: **Tue–Thu, 08:00–10:00 ET** (peak US morning + EU afternoon overlap).
  Second choice Mon same window. Avoid Fri afternoon and weekends.
- Avoid US holidays and any day with a large tech news cycle (major model launches bury
  Show HN posts).
- Prerequisites before posting: README hero asset, one linkable example trust report,
  30-second quickstart that actually works from a clean machine, and the repo public.
- Post, then stay available to reply for ~4 hours. First-hour comment responsiveness
  matters more than title wording.
- Do not ask for upvotes anywhere. First comment should be a substantive addendum
  (link to an example audit), not "thanks for looking."

## Tweet-length variants

1. Plugins in DeepSeek Harness are arbitrary code, and nothing tells you if one is safe
   before install. dsh-bridge audits them and emits a trust report where every claim cites
   file:line. Early, heuristic, open source.

2. I got tired of installing DSH plugins on vibes, so I built the review layer: egress,
   credential access, eval, obfuscation — each flag with a citation you can open yourself.

3. dsh-bridge: familiar slash commands for DeepSeek Harness, plus a trust report card for
   every plugin you're about to install. Not a proof of safety. Evidence you can check.
