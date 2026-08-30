# PR body: awesome-dsh-plugin submission

Branch is pushed and ready: `beartackler:add-dsh-bridge` (commit `abf33360`).
Open the PR here, then paste the body below:

<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/compare/main...beartackler:add-dsh-bridge?expand=1>

Their own validator was run locally against the correct base and passed:

```
$ GITHUB_TOKEN=... node scripts/check-submission.mjs --base upstream/main
checking 1 entry
  ok  https://github.com/beartackler/dsh-bridge
all checked entries pass
```

---

## Body to paste

One entry file, plus the regenerated README lines.

**What it is:** a bridge for people arriving at DSH from Claude Code, Codex, or OpenCode. It ports the slash commands they already use, and ships a static scanner plus a catalog of audited plugin report cards.

**Requirements, each verified before submitting:**

| Requirement | Status |
|---|---|
| `dsh.bundle` manifest in package.json | `bundle.patch: ./cordis.patch.yml` |
| Root `cordis.patch.yml` with an insert row | inserts `id: bridge`, `name: dsh-bridge` |
| Real working code | 19 registered commands, 568 plugin tests + 117 scanner tests, green in CI |
| Repo age / commits | created 2026-08-25, 49 commits on main |
| `dsh-plugin` topic | set (also `deepseek-harness-plugin`, `cordis`) |
| `check-submission.mjs --base upstream/main` | `all checked entries pass` |

**On the description being accurate:** every one of the 17 commands named is registered in `src/lib/registry.ts`; "zero-dependency" is literal (`tools/scan` has an empty `dependencies`); the catalog is `docs/catalog/cards/` with findings cited as file-and-line. I deliberately left out counts that drift (card totals, command counts) so the entry cannot rot into an overstatement.

**Known limitations, stated plainly:** the harness's own zero-turn render gate hides command output in a brand-new session, so the plugin ships a documented workaround for it (root cause traced in `docs/research/e2e-npx-journey.md`). `zh` is omitted; I do not write Chinese well enough to submit one, per the note in contributing.md, so the generated line currently shows `en` in README.zh.md.
