# awesome-dsh-plugin submission

The single highest-leverage distribution action available. Per
`docs/growth/adoption-diagnosis.md`, dsh-market restricts installs to awesome-list sources, so
absence from this list makes the plugin uninstallable through the store the ecosystem uses.

## Eligibility, verified 2026-08-30

| Requirement | Status | Evidence |
|---|---|---|
| `dsh.bundle` manifest in package.json | Met | `package.json` declares `dsh.bundle.patch: ./cordis.patch.yml` |
| Root `cordis.patch.yml` with an insert row | Met | inserts `id: bridge`, `name: dsh-bridge` |
| Real working code, not a placeholder | Met | 19 registered commands, 543 plugin tests, 117 scanner tests, all green in CI |
| Repo at least 1 day old | Met | first commit 2026-08-25 |
| At least 10 commits | Met | 47 commits on main |
| `dsh-plugin` topic on the repo | Met | topics: cordis, deepseek-harness, deepseek-harness-plugin, dsh, dsh-plugin |
| Description accurate, no marketing | See below | every number cross-checked against the tree |

## The file to submit

Path in their repo: `data/plugins/beartackler__dsh-bridge.yml`

```yaml
url: https://github.com/beartackler/dsh-bridge
name: beartackler/dsh-bridge
category: market
description:
  en: Slash commands ported from other coding agents, plus a static plugin scanner and a catalog of audited plugin report cards.
```

Category reasoning: the plugin's distinguishing feature is the trust catalog and installer flow,
which is what `market` covers. `tools` would also be defensible; a maintainer may recategorize,
which their contributing guide says they do rather than bouncing the PR.

## Claim audit

Every clause in that description was checked against the tree before writing it:

- "Slash commands ported from other coding agents" - 19 commands registered in
  `packages/dsh-bridge/src/lib/registry.ts` (`bridge-help`, `bridge-setup`, `bridge-connect`,
  `bridge-install`, `bridge-trust`, `bridge-browse`, `bridge-doctor`, `bridge-status`,
  `bridge-model`, `bridge-memory`, `bridge-compact`, `bridge-resume`, `bridge-review`,
  `bridge-mcp`, `bridge-init`, `bridge-suggest`, `bridge-improve`, `bridge-refactor`,
  `bridge-onboard`). The description deliberately gives no count, because the count changes.
- "a static plugin scanner" - `tools/scan`, 117 passing tests, regex plus opt-in AST pass.
- "a catalog of audited plugin report cards" - `docs/catalog/cards/` holds 108 cards;
  `docs/catalog/INDEX.md` currently indexes 63 of them. The description says neither number,
  because both move; it claims only that the catalog exists, which it does.

No superlatives, no "seamless", no counts that will drift out of date.

## Submitting

The submission is one file and their CI checks the shape. A human must open the PR:

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone --remote
cd awesome-dsh-plugin
git checkout -b add-dsh-bridge
# create data/plugins/beartackler__dsh-bridge.yml with the YAML above
git add data/plugins/beartackler__dsh-bridge.yml
git commit -m "Add beartackler/dsh-bridge"
git push -u origin add-dsh-bridge
gh pr create --title "Add beartackler/dsh-bridge" --body "One entry file. Manifest, patch, topic, age and commit count all verified; description cross-checked against the tree."
```

A maintainer reads the target repository before merging, so the repo should be in the state you
want judged when the PR opens: CI green, README accurate about what works today.

## Before opening the PR

One blocker: the README leads with `npx create-dsh-bridge`, which is not published yet, so a
reviewer who tries the headline command gets a 404. Publish that package first
(`docs/growth/npm-publish-checklist.md`), or the first thing a maintainer does with the repo is
watch its main instruction fail.
