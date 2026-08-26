# Growth Tracking

How we measure dsh-bridge growth. The repo exists to earn stars through a trust product people want to share, not through promotion tricks.

## What we track (weekly)

| Metric | Source | Cadence |
| --- | --- | --- |
| Stars | `gh api repos/beartackler/dsh-bridge` | Weekly |
| Forks | same call as stars | Weekly |
| Watchers | same call as stars (`subscribers_count`) | Weekly |
| Clone count | `gh api repos/beartackler/dsh-bridge/traffic/clones` (14-day trailing window) | Weekly |
| Referrers | `gh api repos/beartackler/dsh-bridge/traffic/popular/referrers` | Weekly |

Run `node scripts/star-snapshot.mjs` to append the day's row to
[`star-history.jsonl`](./star-history.jsonl). The script is idempotent per UTC day:
re-running replaces the same-day row instead of duplicating it.

Clones are the leading indicator. Stars lag clones; a rising clone count before launch
means the README is doing its job on organic traffic. Referrers tell us which launch
channel actually sent people.

## Targets

- Week 1: 100 stars, via launch channels only (Show HN draft in
  [show-hn-draft.md](./show-hn-draft.md), Reddit kit in
  [reddit-launch-kit.md](./reddit-launch-kit.md), benchmarks in
  [star-strategy-benchmarks.md](./star-strategy-benchmarks.md)).
- Month 1: 500 stars, carried by compounding loops: every published plugin audit and every
  ported command is linkable content that keeps earning after launch week.

These targets assume the trust layer ships first. A verified installer with an auditable
trust report card is the story; the targets measure how well that story travels.

## Honest caveat

Star-chasing never compromises the trust product. No inflated claims, no fake social proof,
no engagement bait, no launching before the security review pipeline produces real report
cards. One broken trust claim costs more than it ever earns: this repo's entire thesis is
that its claims cite evidence. If a growth tactic would fail that standard, we do not use it,
and a slow week beats a dishonest one.

## Homepage / GitHub Pages

The repo homepage points at `https://beartackler.github.io/dsh-bridge/`. The static site in
[`site/`](../../site/) can be published via a GitHub Pages workflow later; until that
workflow exists the URL may 404, which is acceptable for a pre-launch homepage. When
publishing, prefer `actions/deploy-pages` from a workflow rather than a fixed branch.
