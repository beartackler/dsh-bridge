# Trust Report Card: dsh-TUI

| | |
|---|---|
| **Grade** | **C** (manual adjudication; raw scanner output: F) |
| **Plugin** | `@deepseek-harness-tui/dsh-tui` v0.9.2 (github.com/ccch1mneyyy/dsh-TUI) |
| **Subject** | commit `150c19bdb23fbd8a018ad563294b13cd83dc2819` (default branch, 2026-08-26T06:08:04+08:00) |
| **Audited at** | 2026-08-26 (UTC-4), shallow clone at `/reference/audits/dsh-tui` |
| **Scanner** | dsh-bridge scan v0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e`, 603 files / 6.4 MB scanned |
| **Method** | Static scan (S3 tool) + single-model manual adversarial review of runtime source. No behavioral probe (S4), no compiled-artifact verification, no second model pass. |
| **Revision** | 1 |

> A grade is evidence-backed opinion over one pinned commit. It is not a safety guarantee and says nothing about other versions.

## Verdict in one sentence

Clean on manual review: no keylogging beyond its own prompt input, no telemetry, no obfuscation, egress limited to DeepSeek's balance API and npm registry version checks; graded C rather than B/A only because the compiled `lib/` artifact that npm actually ships could not be verified against this source tree and no sandboxed probe was run.

The raw scanner grade F is **not endorsed**: all three failing gates were traced to false positives detailed below.

## What this plugin is

A Cordis plugin providing a full-screen Claude Code-style terminal UI for DeepSeek Harness agents. It owns rendering (`src/ink/`, a ported Ink fork), prompt input, session transcript display, and local commands. Agents, sessions, tools, and model traffic belong to official `@deepseek-ai/dsh-*` peer packages, resolved on the user's machine (27 peers declared in `package.json`). Ships via npm (`files`: bin, lib, cordis.patch.yml, cordis.yml, dsh-ecosystem-spec, presets, skills); `lib/` is compiled at install time by the `prepare` script, not committed.

## Focus questions

### Raw-mode keylogging risk

Raw mode is entered only for a real TTY and only while the UI is mounted (`src/ink/components/App.tsx:347-351` refuses non-TTY stdin; `src/ink/ink.tsx:1875-1881` calls `setRawMode(true)` on mount, `:1855-1856` restores on unmount). Key bytes are parsed into key events (`src/ink/parse-keypress.ts`) and consumed by the React component tree.

What is persisted: **submitted prompts only**. `appendHistory(trimmed)` fires in the submit path (`src/components/PromptInput.tsx:469` on submit, `:493` on steer-after-interrupt), writing `{text, ts}` lines capped at 200 entries to `~/.dsh-tui/history.jsonl` (`src/history.ts:8-19, 87-110`). This is shell-style input history backing ctrl+r search; it is local-only and user-visible. Interim keystrokes (edits, arrows, esc, passwords typed then discarded without submit) are never written. Interaction-telemetry hooks inherited from upstream Ink are explicit no-ops (`src/bootstrap/state.ts:6-13`). No keystroke data reaches any network call.

Verdict: no keylogging beyond its UI. Standard, disclosed input history.

### Child processes

All spawn sites enumerated; none use `shell: true` except Windows `.cmd/.bat` shims, which go through vendored cross-spawn quoting (`src/utils/shellQuote.ts`, rationale at `src/utils/externalEditor.ts:28-31`):

| Purpose | Site |
|---|---|
| Clipboard read/write: pbpaste, osascript, wl-paste/xclip/xsel, PowerShell Get-Clipboard | `src/utils/clipboard.ts:237,525`; `src/ink/termio/osc.ts:191-232` |
| tmux passthrough and OSC52 copy fallbacks | `src/ink/termio/osc.ts:111` |
| User-configured `$EDITOR` on a scratch file | `src/utils/externalEditor.ts:196-204` |
| Open URL/file in OS handler (xdg-open/open/explorer) | `src/utils/openExternal.ts:48,125-136` |
| Herdr pane lifecycle report, only when launched inside Herdr (`HERDR_ENV=1`), executable path from env | `src/herdr.ts:58,65` |
| Launcher: probe dsh/pnpm, delegate to profile copy, run `dsh --profile dsh-tui` | `bin/dsh-tui.js:269,338-349,419,546` |
| Patch `child_process.spawn` so MCP server stderr is piped instead of inherited (anti escape-injection) | `src/dsh-adapter/childStderr.ts:38-56,111` |

Arguments are fixed tool names plus user-file paths or URLs already displayed in the UI. No arbitrary command execution surface beyond what a chat TUI inherently needs.

### Network egress

Complete runtime inventory (grep over `src/` and `bin/` for fetch/http/net/dgram/WebSocket):

| Endpoint | Site | Payload | Purpose |
|---|---|---|---|
| `https://api.deepseek.com/user/balance` | `src/deepseekBalance.ts:52-66` | GET, `Authorization: Bearer $DEEPSEEK_API_KEY` | /balance account query; response parsed for display only |
| `${registryBase}/${PACKAGE_NAME}/latest` | `src/update.ts:199` | GET, no credentials | /update version check; registry base resolves from `NPM_CONFIG_REGISTRY` env, then `~/.npmrc` (`src/update.ts:158-172`) |
| `github.com/.../issues/N` string | `src/cc/markdown.ts:438` | none | issue hyperlink text; opens via OS handler on click |

Model/API chat traffic rides the DSH host packages (peers), not this code. Every other URL the scanner flagged is a comment or doc link (`src/utils/shellQuote.ts:11`, `src/ink/components/App.tsx:347,351`, `src/ink/terminal.ts:64,70`, `src/plugin-spec/registry.ts:26`, etc.).

### Credential handling

Runtime code reads `DEEPSEEK_API_KEY` from env as a fallback (`src/dsh-adapter/channel.ts:4578`), passes it to the balance endpoint above, and never writes it to disk (no write-path hits; doctor output prints only "configured"/"missing", `channel.ts:5144`). `~/.npmrc` is read solely for the `registry=` line (`src/update.ts:159`). No reads of `~/.claude`, `~/.codex`, opencode auth, `~/.ssh`, or `~/.aws`.

## Scanner findings and adjudication

Raw counts: 1 critical, 240 high, 37 medium, 15 low. Gates fired: `cred-plus-net` (cap F), `dynamic-exec-present` (cap C), critical finding (cap D).

| Finding | Adjudication |
|---|---|
| CRITICAL `scripts/run-ci-group.mjs:23` `const env = {...process.env}` | False positive. Dev-only CI runner propagating env to test subprocesses; `scripts/` is not in the npm `files` list and never executes at runtime. |
| Cap `cred-plus-net` citing `make-installer-bundle.mjs`, `verify-update-recovery.mjs`, `verify-update.mjs`, `src/update.ts` | Downgraded. Three of four are dev scripts. `src/update.ts` reads `~/.npmrc` for a mirror URL and sends zero credentials; no cred-to-net data flow exists anywhere in `src/`. |
| 138x EXEC `dynamic-eval` | Mostly false positives: `.exec()` regex calls (`src/utils/mentions.ts:59`, `src/theme.ts:541`, `src/cc/syntaxTheme.ts:47-58`, ...) and legitimate `spawn` imports for the tools table above. Greps for `eval(`, `new Function`, `vm.`, decode-then-execute patterns in `src/`: zero hits. |
| 49x HOOK | `package.json` has a real `prepare` hook (builds TS at install). Build-only, no network beyond declared dep installs (vendor installs use `--ignore-scripts`). Remaining hits are doc/comment noise. |
| NET-007 on comment URLs | False positives, see egress table. |
| OBFU | Zero findings. Confirmed by hand. |

## Strengths

- Honest egress surface: two endpoints, both user-facing features, both inspectable at `deepseekBalance.ts:52` and `update.ts:199`.
- Upstream telemetry stubbed out with stated intent (`src/bootstrap/state.ts:1-13`).
- Defensive hardening: child stderr piping to prevent escape-sequence injection (`childStderr.ts`), ANSI stripping, clipboard temp images written mode 0600 under mkdtemp (`clipboard.ts:14-17`), bounded child-output capture (`execFileNoThrow.ts:5`).
- Windows shell-quoting done per cross-spawn protocol instead of `shell: true`.
- Extensive self-verification suite (`verify:*` scripts) and MIT license.

## Residual risks

1. **Unverified shipped artifact (grade-capping).** npm ships compiled `lib/` produced by `prepare` on the user's machine; this audit covered the git source at the pinned SHA only. No `dist-provenance.json` exists to prove src-to-lib correspondence.
2. **Install-time code execution.** `prepare` compiles TypeScript during install; standard for source-built packages but it is a lifecycle hook running on the user's machine.
3. **Wide peer ranges** (27 `@deepseek-ai/*` peers, `^0.1.0-rc.x || ^0.1.1-rc.1`): transitive risk resolved on the user's machine, outside this audit's scope.
4. **Registry override.** `/update` honors `NPM_CONFIG_REGISTRY`/`~/.npmrc`; a hostile mirror could lie about versions. Documented behavior, low severity.
5. **Prompt history on disk.** Submitted prompts persist in `~/.dsh-tui/history.jsonl`; sensitive content pasted and submitted lands there. Local-only, but users should know.
6. **Single-reviewer pass.** Cross-model S5 review and the S4 sandboxed probe were not run; a staged payload invisible to static reading cannot be excluded, only made unlikely.

## Verify this yourself

```bash
# Pin the exact audited commit
git clone --depth 1 https://github.com/ccch1mneyyy/dsh-TUI /tmp/dsh-tui && git -C /tmp/dsh-tui fetch --depth 1 origin 150c19bdb23fbd8a018ad563294b13cd83dc2819 && git -C /tmp/dsh-tui checkout FETCH_HEAD

# Rerun the scanner (expect the same F raw output; see adjudication above)
node <dsh-bridge>/tools/scan/dist/index.js /tmp/dsh-tui

# Keylogging: confirm only submit paths write history
grep -rn "appendHistory" /tmp/dsh-tui/src/components/PromptInput.tsx   # lines ~469, ~493 (submit/steer only)
sed -n '87,110p' /tmp/dsh-tui/src/history.ts                            # local jsonl, 200-entry cap

# Egress: expect exactly two fetch sites
grep -rn "fetch(\|https://" /tmp/dsh-tui/src --include='*.ts' --include='*.tsx' \
  | grep -v "^\s*\*\|// \|docs/\|i18n"                                  # deepseekBalance.ts:52, update.ts:199

# Dynamic execution: expect no output
grep -rn "new Function\|eval(\|vm\.\|atob(" /tmp/dsh-tui/src --include='*.ts' --include='*.tsx'

# Shipped artifact (closes residual risk 1)
npm pack /tmp/dsh-tui --ignore-scripts && tar tzf *.tgz | head          # inspect lib/ contents yourself
```

Re-verify triggers: new upstream version, scanner rules bump, or 90 days elapsed.

## What this card is not

Not a substitute for the full S0-S8 pipeline. Stages S1 sealing, S2 SBOM, S4 behavioral probe, S5 dual-model review, and S8 signing were out of scope for this pass; the C grade reflects that ceiling honestly rather than the cleaner verdict the manual evidence alone would suggest.
