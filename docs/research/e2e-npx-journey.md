# End-to-end journey: `npx create-dsh-bridge`, a stranger, a live harness

**Verdict: the one command is real and it works. It is not yet one-command
onboarding, because it stops three manual decisions short of a working
prompt, and one of those three is a hard stop a stranger cannot solve without
reading harness source.**

This run repeats the [earlier journey](e2e-onboarding-journey.md) against the
new `npx create-dsh-bridge` entry point. Three of the four plugin defects that
report found are fixed and verified fixed here. The remaining friction has moved
almost entirely into the harness and into the last mile between "installed" and
"answering".

| Field | Value |
|---|---|
| Entry point | `node packages/create-dsh-bridge/bin/cli.mjs` (what `npx` runs) |
| Installer fetched | `https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs`, md5 `76c60903bf7807f055fb40380476f8ee`, identical to the local working copy |
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2, installed by the installer |
| Node / pnpm | v26.0.0 / 10.32.1 |
| `DSH_HOME` | `/Users/timurmonasypov/.dsh-bridge/runtime/dshhome` (isolated, chosen by the installer) |
| Model route | OpenCode Zen (`https://opencode.ai/zen/go/v1`), `qwen3.5-plus` |
| Driver | Playwright 1.x Chromium, scripts in `/tmp/e2e-drive*.mjs` |
| Screenshots | `site/demo/e2e-npx/` |
| Date | 2026-08-30 |

## Headline numbers

- **Zero to a booted, serving harness: 8m 03s** (20:59:53 to 21:07:56 UTC),
  of which 6m 00s is `npm install @deepseek-ai/dsh` and 35s is first boot.
- **Zero to a prompt that reached the model: 16m 05s** (to 21:15:58).
- **Manual decisions required: 9.** Enumerated in section 4.
- **Model answered: no**, and the reason is not dsh-bridge. See section 3.

---

## 1. The walkthrough, as actually experienced

### Step 1 - run the one command (0s)

```sh
node /Users/timurmonasypov/Documents/GitHub/dsh-bridge/packages/create-dsh-bridge/bin/cli.mjs
```

It prints the URL it is about to fetch before fetching it, and refuses to run
anything that does not contain the string `dsh-bridge installer`. That is the
right shape for a curl-to-shell-class tool, and it is the single best-designed
surface in this run. No prompts. No questions. Nothing to interpret.

### Step 2 - the installer runs eight steps unattended (7m 34s)

Steps 1 and 2 (Node, pnpm) pass instantly. Step 3 is the long one:

```
[3] Install the DSH runtime
    No dsh on PATH. Installing @deepseek-ai/dsh into ~/.dsh-bridge/runtime.
    This download takes several minutes and prints little. It is not hung.
    $ npm install --no-fund --no-audit @deepseek-ai/dsh
    added 455 packages in 6m
```

**6 minutes of near-total silence**, and it is the only silence longer than 30
seconds in the whole installer. The warning sentence is printed *before* the
silence begins, which is exactly right and is a direct improvement over the
prior journey's F8. It is still six minutes where a stranger has nothing but
that sentence to trust. Everything after step 3 completes in under 20 seconds
total.

Steps 4 through 7 are clean and each one closes a friction the earlier journey
recorded: an isolated `DSH_HOME` (was F9), `.credentials.yaml` pre-created at
mode 600 (was F7), the profile seeded, and the plugin installed. Step 7's
honesty is worth noting: it says out loud that no `--ref` means "installing the
moving branch head" and tells you how to pin.

### Step 3 - step 8 fails on the very first run (BUG 1)

```
[8] Tell dsh-bridge which profile it runs in
    ~/.dsh-bridge/runtime/dshhome/profiles/web/cordis.patch.yml is not a YAML
    list, so appending to it could corrupt it.
    Add this to that file yourself, then reboot:
        - id: bridge
          config:
            profile: web
```

The file it refuses to touch is the one the harness had created five seconds
earlier, in step 5, and its content is a comment header followed by `[]`. That
*is* a YAML list, and the installer has code that knows it
(`scripts/install.mjs:415`, `isEmptyFlowSeq`). Running the same command a second
time succeeds: `ok configured the bridge row`. Details and the exact
order-dependence are in section 5, BUG 1.

The user-facing consequence: **on a genuinely clean machine, the last step of
the installer hands the user a YAML snippet and tells them to edit a config file
by hand.** That is the precise thing the one-command promise exists to
eliminate, and it happens on the only run that matters, the first one.

### Step 4 - boot (35s)

The printed command is exact and works verbatim:

```sh
export DSH_HOME=/Users/timurmonasypov/.dsh-bridge/runtime/dshhome
~/.dsh-bridge/runtime/node_modules/.bin/dsh --profile web
```

Boot to `dsh web: http://127.0.0.1:3080` takes 35 seconds, silent throughout,
then serves HTTP 200. Zero errors. The credentials-mode failure and the port
collision from the earlier journey did not recur: the installer pre-empted the
first, and the second was environmental.

### Step 5 - two modals before anything (`01-first-load.png`, `02-api-key-modal.png`)

First load shows the DSH 0.1 internal-testing notice over a disabled composer.
Dismiss it and a **second** modal appears that the earlier journey never saw:

> **Add an API key to get started**
> Configure the official DeepSeek provider to start building.
> `API key` [ Configure later ] [ Save and continue ]

This is a genuine fork in the road for a dsh-bridge user, and the product gives
them no way to resolve it. The installer's final words were "in the browser, run
`/bridge-setup`. That walks you through connecting a model." The harness's own
first screen says the opposite: paste a DeepSeek key here, now. A stranger has
two authorities telling them to connect a model in two different places, and
neither mentions the other. I clicked "Configure later" to follow the
dsh-bridge path (`03-after-api-modal.png`).

### Step 6 - the workspace picker is still a hard stop (`04-workspace-picker.png`)

The composer is disabled and reads "Choose a workspace to start". Clicking
"Choose workspace" produces **nothing**: no dialog, no error, no console output,
no page error. Playwright confirms the click lands on
`span.pXSMma_workspaceLabel` and completes; the UI simply does not change.

This is F1 from the earlier journey, unchanged, and the installer does not
address it (`grep -c directory-picker scripts/install.mjs` returns 0). The cause
is the same: `dsh-host-directory-picker-auto` picks the `native` backend and
opens a dialog on the server's display, invisible to a browser client.

**This is where a stranger quits.** They have run one command as promised, the
harness is serving, and the text box will not accept text. There is no error to
search for. The fix requires knowing that a plugin exists, that it has an
alternative, and that pinning the alternative requires naming both its host and
client halves.

Unblocked by hand-writing into `profiles/web/cordis.patch.yml`:

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

After a reboot the in-browser picker appears (`05-workspace-picker-browse.png`)
and choosing a directory unlocks the composer (`06-workspace-chosen.png`).

### Step 7 - connecting a model: `/bridge-setup` cannot do it (see section 2)

Because the composer only unlocks after step 6, and because `/bridge-setup`
turns out not to be able to write this route at all, the model route was also
hand-written. Same YAML as the earlier journey, same two non-obvious facts
(the route key must be repeated in `agent-default-model`; `apiKeyEnv` is a
credential reference, not a shell variable).

The route is correct: after reboot the UI footer reads **Qwen 3.5 Plus** and
`/bridge-status` reports `MODEL: opencode-zen/qwen3.5-plus`.

### Step 8 - the prompt reaches the model and is refused by quota (`07-plain-prompt-result.png`)

```
This turn failed 429: {"type":"GoUsageLimitError","message":"Weekly usage limit
reached. Resets in 2hr 45min. ..."}
```

The prompt was transmitted, authenticated, routed to `qwen3.5-plus`, and
rejected for account quota. This is an **environmental blocker, not a product
defect**, and it is documented rather than worked around per the assignment.
Verified independently of the harness:

```
POST https://opencode.ai/zen/go/v1/chat/completions  (assigned key)
-> 429 GoUsageLimitError "Weekly usage limit reached"
```

Reproduced against five other models on the same endpoint
(`glm-5.3-flash`, `qwen3.8-flash`, `minimax-m2.5`, `kimi-k2.6`, `hy3`): all
return the same workspace-level 429. `GET /v1/models` still lists 33 models, so
the key is valid and the endpoint is reachable; the limit is on the workspace
(`wrk_01KNHK2PPJJKJ837VWPKGXSTRV`), not the model. The local OpenCode
credential at `~/.local/share/opencode/auth.json` resolves to the same
workspace and fails identically, so no alternative key was available.

**What this does and does not prove.** It does not prove a token came back. It
does prove every link in the chain the installer and plugin are responsible for:
config parsed, provider registered, route selected, credential resolved from
`.credentials.yaml`, request signed and accepted by the provider. A wrong route
fails with a config error or a 401; this failed with a quota error, which only
an authenticated request can produce.

### Step 9 - the bridge commands all work (`18` through `23`)

Six commands exercised. All returned `kind: "success"`, confirmed both in the UI
and against the durable session log
(`$DSH_HOME/sessions/--Users-.../session-1149cfba-*/session.jsonl.zstd`).

| Command | Screenshot | Result |
|---|---|---|
| `/bridge-help` | `18-bridge-help.png` | All 17 commands in 5 grouped tables |
| `/bridge-setup` | `19-bridge-setup.png` | Step 1 of 7, default `yes` |
| `/bridge-setup yes` | `20-bridge-setup-step2.png` | Step 2 of 7, detected Claude Code, Codex CLI, OpenCode |
| `/bridge-browse` | `21-bridge-browse.png` | **2189 entries, page 1/219**, graded table |
| `/bridge-trust dsh-outline` | `22-bridge-trust.png` | Grade A card with pinned commit, scanner digest, verdict |
| `/bridge-status` | `23-bridge-status.png` | `MODEL: opencode-zen/qwen3.5-plus`, 4 features mounted |
| `/bridge-doctor` | `17-doctor-in-live-session.png` | `Active profile: web (mounted)`, **4 green, 0 yellow, 0 red, HEALTHY** |

**Three defects from the earlier journey are fixed and verified fixed here:**

- F4, missing catalog manifest: `/bridge-browse` now returns 2189 entries on a
  clean install with no manual file copying.
- F5, `/bridge-doctor` reporting a `default` profile: now reports
  `web (mounted)` and grades itself HEALTHY. The installer's step 8 is what
  makes this true, which is exactly why BUG 1 matters.
- F6, `/bridge-status` reporting `unavailable`: `MODEL` and `BRIDGE` are now
  populated from live sources.

Command output also renders as **real markdown tables now**, not truncated
one-line chips. F2 from the earlier journey is fixed.

`/bridge-trust` deserves specific praise: the Grade A card for `dsh-outline`
names the pinned commit, the scanner version and rules digest, what was manually
read, what was *not* checked (npm integrity), and carries an explicit
disclaimer that a grade covers one artifact only. That is the trust posture the
project claims, delivered.

### Step 10 - but commands are invisible in a fresh session (BUG 2)

`24-fresh-session-help-blank.png`. In a brand-new session, `/bridge-help` runs,
succeeds, and **renders nothing at all.** The page text after submitting is 242
characters of chrome with no output. The same command in a session that already
contains one turn renders perfectly.

Proven against the session log: session `1149cfba` has `cmds=8 turns=0` and
rendered nothing in the UI; session `6821fc77` has `cmds=7 turns=1` and rendered
everything. Details in section 5, BUG 2.

This is the worst bug in the run, because **a first-time user is by definition
in a fresh session.** The first thing the installer tells them to type is
`/bridge-setup`, and the product's answer is a blank screen.

---

## 2. `/bridge-setup` verdict

**`/bridge-setup` cannot connect a model. It is a guide, not a connector, and
the installer's closing line oversells it.**

The installer's final words are:

> Then, in the browser at http://127.0.0.1:3080, run: `/bridge-setup`
> That walks you through connecting a model.

Where it actually stops short, precisely:

1. **It writes no route, by design.** Its own module doc is explicit:
   "The only file this command writes is its own state file. Route writes ...
   are performed by their own commands, which this flow prints as ready-to-run
   lines rather than executing"
   (`packages/dsh-bridge/src/commands/setup.ts:15-18`). The route step
   (`setup.ts:466-512`) prints instructions and asks a question. It never calls
   `runConnectApply`.

2. **It hands off to a command that cannot serve this endpoint.** The route step
   tells the user to run `/bridge-connect apply <provider> --apply`. That
   command only knows five providers, hardcoded in
   `PROVIDER_PROFILES` (`connect.ts:76-94`): anthropic, openai, google,
   deepseek, openrouter. There is no path for an arbitrary
   OpenAI-compatible endpoint. OpenCode Zen cannot be expressed.

3. **Even for a supported provider, the emitted route is incomplete.**
   `planRoute` (`connect-apply.ts:92-122`) emits only `apiKeyEnv` and `baseURL`
   under `providers.<name>`. It never emits `api`, never emits `models`, and
   never writes the `agent-default-model` row. The earlier journey established
   all three are required for a route pi-ai does not already ship, and that
   declaring a provider does not select it. `grep -rn agent-default-model
   packages/dsh-bridge/src/` matches only doc comments, never code.

4. **On a no-credential machine it points at a different provider entirely.**
   With no keys found, the route step tells the user to go create a
   DeepSeek key (`setup.ts:483-486`). Reasonable default, but it means the
   answer to "how do I connect the model I already have" is "get a different
   model".

What `/bridge-setup` *does* do, it does well: seven steps, one question each, a
default on every question, `skip` everywhere, resumable state, and it correctly
detected Claude Code, Codex CLI, and OpenCode on this machine
(`20-bridge-setup-step2.png`). As an orientation flow it is good. It is not the
thing that gets a model answering, and the installer should not say it is.

---

## 3. Did the model answer?

**No, and dsh-bridge is not the reason.** The route works; the account is out of
quota for ~3 hours. Section 1 step 8 has the evidence. This is the one part of
the assignment that could not be completed, and it is recorded here rather than
worked around: no alternative provider was substituted, because substituting one
would have tested a different route than the one assigned.

---

## 4. Manual decisions required: 9

Everything a stranger must decide or discover for themselves, from `npx` to a
prompt. Items marked **hard** cannot be resolved from anything the product
prints.

| # | Decision | Hard? |
|---|---|---|
| 1 | Trust the installer enough to let it run (it prints the URL first, which helps) | no |
| 2 | Wait out 6 minutes of silence at step 3 rather than killing it | no |
| 3 | Hand-edit `cordis.patch.yml` with the YAML snippet step 8 refuses to write (BUG 1) | **hard** |
| 4 | Dismiss the DSH internal-testing modal | no |
| 5 | Choose between the harness's "Add an API key" modal and the installer's `/bridge-setup` instruction, which contradict each other | **hard** |
| 6 | Work out why "Choose workspace" does nothing, then find, disable, and replace two picker plugins by name | **hard** |
| 7 | Discover that `/bridge-setup` will not write a route and that `/bridge-connect` cannot express this endpoint | **hard** |
| 8 | Hand-write the pi-ai provider block, including `api`, `models`, and the separate `agent-default-model` row | **hard** |
| 9 | Realise a blank screen after `/bridge-help` means "run it again in a session with a turn in it" (BUG 2) | **hard** |

Six of nine are hard. The earlier journey counted five hard decisions; the
installer removed several mechanical steps and the plugin fixes removed three
defects, but the two hardest paths (picker, route) are untouched, and BUG 1 and
BUG 2 are new.

---

## 5. Bugs, with file and line

### BUG 1 - installer step 8 refuses the file it just created (severity: blocker on first run)

**Owner: plugin (`scripts/install.mjs`).**

`configureProfileName` reads the profile patch, strips leading comments and
blank lines, and branches:

- `scripts/install.mjs:412` builds `trimmed` by stripping a leading run of
  comment and blank lines.
- `scripts/install.mjs:415` sets `isEmptyFlowSeq = trimmed.trim() === "[]"`,
  the branch that correctly rewrites `[]` into the bridge row.
- `scripts/install.mjs:422` is the refusal:
  `if (trimmed.trim() !== "" && !trimmed.startsWith("-"))`.

Evaluated against the file the harness writes in step 5, the `[]` branch is
`true` and should win. On the first run it did not; the refusal at line 422 was
taken and printed at `install.mjs:423`. On every subsequent run against the same
directory, the `[]` branch is taken and step 8 prints `ok configured the bridge
row`.

Reproduced, both directions:

```
run 1, clean ~/.dsh-bridge  -> "is not a YAML list, so appending to it could corrupt it"
run 2, same directory       -> "ok configured the bridge row"
```

A separate clean install into a fresh `--dsh-home` and `--runtime-dir`
(`/tmp/e2e-clean2`) also printed `ok`. The difference between the failing and
passing runs is that the failing one seeded the profile with a `dsh` binary
installed moments earlier in the same process. The most likely mechanism is
that step 5's `--dump-config` had not yet flushed the final `[]` bytes when
step 8 read the file, so `configureProfileName` read a comment-only prefix,
which makes `trimmed` non-empty, not `[]`, and not starting with `-`: exactly
the refusal branch. The file on disk afterwards contains the full `[]`, which
is consistent with a read that raced the write.

Suggested fixes, in order of preference: re-read the file after a short
settle, or treat a comment-only file as writable rather than refusing it, or
have step 5 verify the seeded file parses before step 8 reads it. The
consequence today is that the promised one command is a two-command install on
a clean machine, and the second command is undocumented.

### BUG 2 - command output renders only in a session that already has a turn (severity: blocker)

**Owner: harness, but the damage is entirely dsh-bridge's.**

Reproduction, deterministic across four runs:

1. New session, choose a workspace, type `/bridge-help`, submit.
   The UI shows nothing. Body text is 242 characters, all chrome.
   (`24-fresh-session-help-blank.png`)
2. Open a session containing at least one completed turn, type the same
   command, submit. Full markdown renders.
   (`17-doctor-in-live-session.png`)

`08-fresh-session-all-blank.png` is the same failure across a six-command run:
`/bridge-help`, `/bridge-setup`, `/bridge-browse`, `/bridge-trust`,
`/bridge-doctor`, and `/bridge-status` submitted in sequence into a fresh
session produced six byte-identical blank screenshots.

Session-log ground truth, from
`$DSH_HOME/sessions/--Users-timurmonasypov-Documents--/`:

```
session-1149cfba-...  cmds=8  turns=0   -> UI rendered nothing
session-6821fc77-...  cmds=7  turns=1   -> UI rendered everything
```

Session `1149cfba` contains six `command/run` / `command/done` pairs, every one
`kind: "success"` with full markdown in the `text` field, and its event stream
begins `permission/preset, sandbox/mode, approval/policy, command/run` with no
`turn/start` anywhere. The commands ran. The renderer had the text. Nothing
appeared.

This is not the earlier journey's F2 (truncated chips, now fixed). It is
strictly worse: not truncated output but no output. Since the installer's
closing instruction is to run `/bridge-setup` as the first action in a new
session, **the default first experience of dsh-bridge is a blank screen.**

Mitigation dsh-bridge could ship without waiting on upstream: have the plugin
detect a zero-turn session and emit its result through a surface that does
render, or have `/bridge-setup` prime the session. Worth confirming upstream
whether `command/done` is expected to render before the first `turn/start`.

### BUG 3 - the installer's closing instruction is not true (severity: major)

**Owner: plugin (`scripts/install.mjs:450-452`).**

```js
console.log("That walks you through connecting a model. You need a provider");
console.log("endpoint and an API key; nothing else is configured yet.");
```

`/bridge-setup` does not connect a model, and for a custom OpenAI-compatible
endpoint neither does the command it delegates to. Section 2 has the evidence.
A user who follows this line arrives at a step that asks them a question and
prints a command that cannot express their provider. This is a one-line honesty
fix and should be made before anything else in this report, because it costs
nothing and it is currently the product promising something it does not do.

---

## 6. Friction table

Severity: **blocker** stops onboarding; **major** costs real time or misleads;
**minor** is a papercut.

| # | Step | Observed | Expected | Severity | Owner |
|---|---|---|---|---|---|
| N1 | Installer step 8 | Refuses the file it created and prints YAML for the user to paste (BUG 1) | Writes the bridge row on the first run | blocker | plugin |
| N2 | First command in a new session | Runs, succeeds, renders nothing (BUG 2) | Output renders regardless of turn count | blocker | harness |
| N3 | Choose workspace | Click does nothing in a browser; native dialog opens on the server's display | Browse picker mounts when the client is remote, or the UI says why not | blocker | harness |
| N4 | Connect a model | `/bridge-setup` cannot write a route; `/bridge-connect` knows 5 hardcoded providers and emits an incomplete row (section 2) | One flow that connects an arbitrary OpenAI-compatible endpoint | blocker | plugin |
| N5 | Installer closing text | Claims `/bridge-setup` connects a model (BUG 3) | Says what it actually does | major | plugin |
| N6 | First load | Harness's "Add an API key" modal contradicts the installer's `/bridge-setup` instruction | One story about where a model gets connected | major | both |
| N7 | Installer step 3 | 6 minutes of silence | A progress signal; the warning sentence helps but is not liveness | minor | harness |
| N8 | Submitting a slash command | Two Enter presses | One, or a visible hint | minor | harness |
| N9 | Boot | 35s of silence before the URL appears | Any staged output | minor | harness |

Closed since the earlier journey: F2 (chips), F4 (catalog), F5 (doctor
profile), F6 (status unavailable), F7 (credentials mode), F8 partially
(silence now warned about), F9 (`DSH_HOME` isolation).

---

## 7. Ranked fixes to reach true one-command onboarding

1. **Fix installer step 8 (BUG 1).** Highest value per line changed. Until this
   is fixed the one-command claim is false on clean machines, which are the only
   machines that matter for onboarding. `scripts/install.mjs:412-423`.
2. **Fix or work around the blank first command (BUG 2).** The first action the
   product asks for currently produces nothing. Even a plugin-side workaround
   beats the status quo.
3. **Make the installer pin the browse directory picker (N3).** The installer
   already writes `cordis.patch.yml`; adding the four-line picker block there
   removes the single most likely quit point. This is a harness defect that the
   plugin is well placed to neutralize, in the same way it already neutralizes
   the credentials-mode defect.
4. **Correct the installer's closing text (BUG 3).** One line. Do it today.
5. **Teach the route path about custom OpenAI-compatible endpoints (N4).**
   `/bridge-connect apply --base-url <url> --model <id>` writing a complete
   `llm-pi-ai` block *plus* the `agent-default-model` row would collapse manual
   decisions 7 and 8 into one command. This is the largest remaining piece of
   real work and the one that would most change the product.
6. **Have `/bridge-setup` actually apply the route it recommends**, behind an
   explicit confirmation, rather than printing a command. The state machine and
   the writer already exist; they are not connected.
7. **Reconcile with the harness's API-key modal (N6).** At minimum, the
   installer should tell the user that modal is coming and which button to
   press.

With items 1 through 4 done, the hard manual decisions drop from six to three.
With item 5, to one. Item 6 takes it to zero for supported providers.

---

## 8. What is genuinely good

Worth stating plainly, because the rest of this document is a defect list.

- The launcher prints its source URL before fetching and validates what it
  fetched. That is the correct posture and it is rare.
- The installer is idempotent and says "already" instead of redoing work. The
  second run was 8 seconds.
- `--dry-run` exists and prints every command and every file write.
- Step 7 volunteers that no `--ref` means a moving branch head.
- `/bridge-trust` output is the best artifact in the product: pinned commit,
  scanner digest, what was read, what was *not* checked, and a disclaimer that
  a grade covers one artifact only.
- `/bridge-doctor` now reports HEALTHY, 4 green, on a stock install. The
  trust-focused plugin's own health check passing on itself is a real change
  from the last run.
- The slash menu shows all 17 commands with descriptions. Discovery remains the
  plugin's strongest surface.

## 9. Reproduction

```sh
rm -rf ~/.dsh-bridge
node packages/create-dsh-bridge/bin/cli.mjs         # observe step 8
node packages/create-dsh-bridge/bin/cli.mjs         # step 8 now succeeds
export DSH_HOME=~/.dsh-bridge/runtime/dshhome
~/.dsh-bridge/runtime/node_modules/.bin/dsh --profile web --no-open
```

Driver scripts: `/tmp/e2e-drive3.mjs` (modals and picker),
`/tmp/e2e-drive11.mjs` (commands in a live session),
`/tmp/e2e-drive12.mjs` (BUG 2 reproduction). Session logs decompress with
`zstd -dc "$DSH_HOME/sessions/*/*/session.jsonl.zstd"`.
