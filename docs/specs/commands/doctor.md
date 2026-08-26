# `/doctor` — Environment Health Check Spec

> Status: draft · Owner: dsh-bridge · Inspired by `claude doctor` and Jcode's `auth-test`.
> Every claim this command prints must be derived from a check it actually ran (charter: *trust over speed*).

## Purpose

`/doctor` answers one question in under ten seconds: **"Is my DSH setup actually healthy?"** New users coming from Claude Code / Codex / OpenCode / Jcode expect a single command that inspects the machine and reports green/yellow/red per subsystem, each with an actionable fix hint. It replaces "why is my model route failing?" guesswork with an evidence-backed checklist.

It is **read-only by default**: it never mutates configuration, never prints secret values (only presence/shape of credentials), and performs network calls only for the two documented connectivity checks (`--net` enables them explicitly).

Scope: the active profile plus any profile directories found on disk. Out of scope: plugin content auditing (that is the trust layer's job) and session/persistence integrity.

## Checks table

| # | Check | Method | Green | Yellow | Red | Fix hint |
|---|-------|--------|-------|--------|-----|----------|
| C1 | Node.js runtime version | Read `process.version` in-harness; compare against the minimum semver range declared by the installed `@deepseek-ai/*` packages' `engines.node` | ≥ required minimum | within one minor of EOL upstream, or unparseable | below required minimum / node missing | "Upgrade Node: `brew upgrade node` (or use nvm: `nvm install <min>`)." |
| C2 | DSH version & commit | Resolve installed harness entry package (`@deepseek-ai/*`) version from its `package.json`; read build commit from the harness's exposed metadata service if present; fall back to npm dist-tags | version resolved | version resolved but prerelease/dev-preview mismatch with latest stable unknown | not resolvable (harness not installed as a package) | "Reinstall: `npm i -g @deepseek-ai/harness` (see docs/install)." |
| C3 | Profile list | List `~/.dsh/profiles/*/` (respecting `$DSH_HOME` override); mark which profile the current session runs under | ≥1 profile found and current profile exists | current profile dir missing but defaulting to fallback | no profiles at all | "Create one: `/bridge:onboard` or `dsh plugin --profile <name> add …`." |
| C4 | Mounted plugins | Parse `<profile>/cordis.patch.yml`; list plugin entries; verify each referenced local path/package resolves (path exists, or package resolvable via require resolution) | all mounts resolve | mount entry present but source ambiguous (e.g. bare name not yet installed) | one or more mounted paths missing/unresolvable | "Plugin 'X' points at a missing path — reinstall with `dsh plugin --profile <p> add github:<owner>/<repo>` or remove the entry." |
| C5 | Config parses | Load the effective `cordis.patch.yml` (+ any config named by `$DSH_CORDIS_CONFIG`) through schemastery validation only; report first error with file:line | valid | valid with unknown-key warnings | schema violation | "Fix `<file>:<line>`: key `foo.bar` is not settable from cordis.yml (see config catalog)." |
| C6 | Credentials present & well-shaped | For each configured model provider, resolve its credential the way the runtime does: `apiKeyEnv` name → environment lookup; default `DEEPSEEK_API_KEY`. Also probe known connector files (`~/.claude/`, `~/.codex/auth.json`, opencode `auth.json`) for reusable OAuth tokens. Report **presence + shape only** (non-empty, prefix/length plausibility). Never print values. | every configured route has a usable-looking credential | credential present but shape suspicious (e.g. wrong prefix, whitespace) | configured route has no credential source | "Route 'deepseek/chat' reads $DEEPSEEK_API_KEY — set it, or run `/bridge:connect deepseek` to import from Codex/Claude." |
| C7 | Model routes registered | Cross-check each configured `provider`/`model` pair against the adapters actually registered in the running harness (LLM plugin registry) | all pairs have a registered adapter | pair uses a fallback/default silently | configured pair has no adapter | "'anthropic/claude-*' has no adapter loaded — add the matching `@deepseek-ai/dsh-llm-*` plugin to your profile." |
| C8 | Network reachability (opt-in) | With `--net`: TCP/TLS handshake to each provider's API host (no auth round-trip, no payload). Without `--net`: skipped, shown as `skipped` | reachable | slow (>3 s handshake) or proxy detected but unset | unreachable/DNS failure/TLS error | "Cannot reach api.deepseek.com — check VPN/proxy; set HTTPS_PROXY if behind a corporate firewall." |
| C9 | Route smoke test (explicit opt-in) | With `--probe`: issue a 1-token completion against each configured route using the real credential path. Reports latency and HTTP status only | 200 OK < 5 s | 200 OK but > 5 s, or retried | 401/403/5xx/timeout | "401 on 'deepseek/chat' — key rejected; re-run `/bridge:connect deepseek`." |
| C10 | Write permissions | Verify the process can create/delete a temp file under `$DSH_HOME` (or `~/.dsh`) and the profile directory | writable | writable only via sudo group quirk (owner mismatch warning) | read-only / permission denied | "`~/.dsh` is owned by another user — `sudo chown -R $(whoami) ~/.dsh`." |

Severity mapping: **green** = verified working; **yellow** = works now but degraded/at-risk; **red** = will break or already broken. Unknown state after a failed check is yellow with the error text attached, never silent.

## Output mockup

```
$ dsh bridge doctor            # also: /doctor inside a session

dsh-bridge doctor — profile: web (~/.dsh/profiles/web)

  ● green   Node v22.14.0 (required ≥20.9)
  ● green   DSH 0.9.3 @ a1b2c3d (dev preview)
  ● green   3 profiles found: default, web, research (active: web)
  ● green   Plugins mounted: dsh-market, awesome-dsh-plugin, dsh-ponytail — all resolve
  ● yellow  Config: unknown key 'toolOrderX' ignored  ~/.dsh/profiles/web/cordis.patch.yml:41
            └─ fix: rename to 'toolOrder' (typo?) or remove — see docs/config-catalog.md
  ● green   Credentials: DEEPSEEK_API_KEY set (sk-…a91f, shape OK); codex auth.json found
  ● red     Model route 'openai/gpt-5': no LLM adapter registered
            └─ fix: add '@deepseek-ai/dsh-llm-openai' to this profile, or change /model
  ○ skipped Network check (run `dsh bridge doctor --net` to test api hosts)

Summary: 6 green · 1 yellow · 1 red · 1 skipped
Overall: RED — 1 blocking issue. Run `dsh bridge doctor --fix-hints` again after repairing.
Docs: https://github.com/<org>/dsh-bridge/docs/troubleshooting.md
```

Rules for rendering:

- One line per check; fix hints indented beneath, always starting `└─ fix:`.
- Secrets are masked by construction (`sk-…last4`), even in verbose mode.
- `--json` emits the same data machine-readably (`{check, status, detail, hint, evidence}` per row) for CI use.
- Colors degrade gracefully to symbols (●/○/▲) when stdout is not a TTY.

## Exit semantics

| Code | Meaning |
|------|---------|
| `0` | All executed checks green (skipped checks don't affect exit code). |
| `1` | At least one yellow, zero red. Usable, degraded. |
| `2` | At least one red. Blocking issue present. |
| `3` | Doctor itself crashed before completing (internal error); partial output printed with the stack trace attached. |

The slash-command form (`/doctor` inside a session) surfaces the same summary inline and links the exit meaning in its footer. CI usage should treat `2` as failure and `3` as infrastructure error.

## Acceptance criteria

1. Running `/doctor` on a correctly configured machine yields exit `0`, all applicable rows green, in ≤ 10 s wall time without `--net`/`--probe`.
2. Zero secrets appear anywhere in output, logs, or JSON mode — verified by a test asserting output contains neither `DEEPSEEK_API_KEY` value nor any credential-file token contents (masked last-4 allowed).
3. Each red/yellow row's fix hint names a concrete command or file:line (no "consult documentation"-only hints).
4. Removing `DEEPSEEK_API_KEY` flips exactly the affected checks (C6, and C7 smoke only with `--probe`) to red while unrelated checks stay green — no cascading false failures.
5. Pointing a profile at a nonexistent plugin path produces exactly one red row (C4) whose hint contains the exact offending path.
6. `--net` performs TLS handshakes only to the documented provider hosts and makes no authenticated requests; `--probe` documents every URL and payload shape it sends in the command help.
7. All checks are individually skippable via flags (`--skip=C4,C8`) and the summary counts reflect skips.
8. Works identically when `$DSH_HOME` overrides `~/.dsh`; unit tests cover both roots.
9. Non-TTY invocation renders symbol-only output and still exits with correct codes (CI-safe).
