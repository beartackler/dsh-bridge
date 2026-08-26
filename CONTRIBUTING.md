# Contributing to dsh-bridge

Thanks for helping make the DeepSeek Harness feel like home for English speakers.
Read [CHARTER.md](./CHARTER.md) first — especially *Non-Negotiable Principles*:
**trust over speed**, **no slop**, **user owns their machine**.

## Dev setup

| Requirement | Version |
|---|---|
| Node.js | 22+ (`node -v`) |
| pnpm | 9+ (`corepack enable && corepack prepare pnpm@latest --activate`) |

```sh
pnpm install
pnpm build      # compile plugin + tests
pnpm test       # run test suite (vitest)
pnpm lint       # eslint + type check
```

Reference DSH checkout for API seams: `../reference/deepseek-harness` (see CHARTER.md).
Peer deps are `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` — never bundle them.

## Repo layout

```
CHARTER.md              mission, principles, working model — read first
README.md               public face; keep launch-quality
docs/
  specs/commands/       one spec file per proposed command port (see below)
  research/             feature/port research notes (upstream behavior, seams)
  audits/               adversarial plugin security reviews
  trust/                trust report cards, one per audited plugin
  design/               UI mockups, DSH design-system notes
src/                    TypeScript source (commands, connectors, trust engine)
tests/                  colocated or mirrored tests; every PR ships tests
```

## Proposing a command port

Every new `/command` starts as a **spec**, not code. Open a PR adding
`docs/specs/commands/<name>.md` with:

1. **Upstream behavior** — what `/review`, `/compact`, etc. do in Claude Code /
   Codex / OpenCode / Jcode, with links to upstream source (respect licenses;
   attribute like dsh-ponytail does).
2. **DSH seam** — which native capability it maps to (skill, tool, preset,
   profile). If no seam exists, say so; don't fake one.
3. **Behavior deltas** — where we intentionally diverge and why.
4. **Acceptance checks** — observable outcomes a reviewer can verify.

A maintainer labels the spec `approved` before implementation PRs are accepted.
Implementation PRs must link the approved spec.

## Code standards

- **No dynamic code execution**: no `eval`, `new Function`, `vm.runIn*`, or
  spawning shells to eval strings. This is a hard gate; violations fail review.
- **No install/lifecycle hooks** that reach outside documented behavior. Any
  network call must be explicit, documented in the PR, and user-visible.
- **Never print, log, or transmit secrets** (credentials from `~/.claude`,
  `~/.codex`, opencode auth.json, env vars).
- **Typed TypeScript**: strict mode; no `any`, no non-null `!` assertions on
  external input, public functions have explicit return types.
- **Tests required**: every behavior change ships a failing-first test. Bug
  fixes include a regression test. CI must be green.
- English-first copy, i18n-ready strings (no hardcoded UI text in logic).

## Trust report cards

Trust cards live in `docs/trust/<plugin>.md`. They are the product's core
promise, so they carry extra rules:

- **Evidence is mandatory.** Every claim ("no network egress", "reads only
  `~/.dsh/config`") cites `path/to/file.ts:LINE` from the exact plugin version
  audited. A claim without file:line is not shippable.
- **Two-reviewer rule.** Each card needs sign-off from two reviewers, and at
  least one must be a **different model** than the author (cross-model review
  catches more — see CHARTER.md working model). Both record model + role in the
  card's `Reviewed-by:` footer.
- State the audited commit hash of the target plugin; cards expire if upstream
  republishes changed code.
- Findings use severity tiers with the same rigor: cite evidence even for "clean".

## Commit style

Conventional Commits:

```
feat(commands): port /compact via session-preset seam
fix(trust): cite correct line range in mcp-server card
docs(specs): add /memory port spec
```

Subject <= 72 chars, imperative mood. Body explains *why*, not just what.

## DCO / sign-off

All commits must be signed off (`git commit -s`) under the
[Developer Certificate of Origin](https://developercertificate.org):

```
Signed-off-by: Your Name <you@example.com>
```

The DCO bot blocks merges without it. By signing you certify you wrote the
change or have the right to submit it.

## Pull request checklist

- [ ] Scope matches an approved item (spec, audit plan, or issue); linked in PR
- [ ] Tests added/updated; `pnpm test` and `pnpm lint` green locally
- [ ] No `eval` / dynamic execution / undocumented network calls
- [ ] Typed TS, no `any`; public APIs documented
- [ ] Trust claims (if any) cite file:line and have two-reviewer sign-off
- [ ] Docs updated (README, spec status, relevant `docs/` folder)
- [ ] Commits follow Conventional Commits and are DCO-signed (`-s`)
- [ ] Cross-model review completed before requesting merge (per CHARTER quality gate)

Small PRs merge faster. One command port per PR; one trust card per PR.
