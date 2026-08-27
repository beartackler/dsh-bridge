# End-to-end onboarding journey: a new user, a live DSH, a real model

**Verdict: the plugin works. Getting to the point where it works takes 11 manual
steps, four of which require reading harness source.**

This is the first run of the complete new-user path against a live model, not a
probe plugin. Every command answered. Three plugin defects and four harness
frictions surfaced, all reproduced with evidence below.

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Node | v26.0.0 |
| pnpm | 10.32.1 |
| Scratch runtime | `/tmp/dsh-e2e` |
| Scratch `DSH_HOME` | `/tmp/dsh-e2e/dshhome` |
| Model route | OpenCode Zen (`https://opencode.ai/zen/go/v1`), `qwen3.5-plus` |
| Plugin install | `dsh plugin --profile web add github:beartackler/dsh-bridge` |
| Driver | Playwright 1.59.1 (Chromium), scripts in `/tmp/dsh-e2e/*.mjs` |
| Date | 2026-08-26 |

**Model working: yes.** `05-plain-prompt.png` shows the prompt "Reply with
exactly: BRIDGE_E2E_MODEL_OK" answered verbatim, 1.6s TTFT, 56 tok/s, 8.5K input
/ 48 output tokens.

**Commands exercised:** `/bridge-help`, `/bridge-doctor`, `/bridge-status`,
`/bridge-browse`, plus the in-box `/goal` as a rendering control.

---

## 1. The walkthrough, as actually experienced

### Step 1 — install the runtime (6m 13s)

```sh
mkdir -p /tmp/dsh-e2e && cd /tmp/dsh-e2e && npm init -y
npm install @deepseek-ai/dsh@0.1.1-rc.2
```

373 seconds. No progress signal that distinguishes "installing" from "hung". The
live-mount report already flagged this; it remains true.

### Step 2 — isolate the harness home

```sh
export DSH_HOME=/tmp/dsh-e2e/dshhome
```

Nothing in the harness's own output suggests doing this. A user who skips it
mutates their real `~/.dsh`. Discovered only from the prior report.

### Step 3 — find out how model routes are configured

This is the single largest friction and it is entirely research. The steps that
actually worked:

1. `dsh --profile web --dump-default-config` and grep for `llm`, revealing
   `@deepseek-ai/dsh-llm-pi-ai` and `@deepseek-ai/dsh-agent-default-model`.
2. Read `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/types/index.d.ts`, whose
   module doc contains the only working example of a custom OpenAI-compatible
   route (the `acme-gateway` block).
3. Read `lib/types/config.d.ts` to learn that `api`, `baseURL`, and `models` are
   all mandatory for a route pi-ai does not already ship.
4. Learn from `dsh-credentials-local`'s module doc where the API key goes.

No user-facing document was consulted because none was found in the installed
tree. The resulting patch, written into
`$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: llm-pi-ai
  config:
    providers:
      opencode-zen:
        displayName: OpenCode Zen
        apiKeyEnv: OPENCODE_ZEN_API_KEY
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
        models:
          - id: qwen3.5-plus
            name: Qwen 3.5 Plus
            contextWindow: 262144
            maxTokens: 32768
- id: agent-default-model
  config:
    provider: opencode-zen
    model: qwen3.5-plus
```

and `$DSH_HOME/.credentials.yaml`:

```yaml
OPENCODE_ZEN_API_KEY: sk-...
```

Two non-obvious facts, either of which silently breaks the route:

- The route key (`opencode-zen`) must be repeated in `agent-default-model`.
  Declaring a provider does not select it.
- `apiKeyEnv` is a *credential reference name*, not an environment variable that
  must exist in the shell. It resolves through the credentials seam.

**Model note.** The assigned model id `ox-alpha-free` is not served by this
endpoint:

```
POST https://opencode.ai/zen/go/v1/chat/completions {"model":"ox-alpha-free"}
-> {"type":"error","error":{"type":"ModelError","message":"Model ox-alpha-free is not supported"}}
```

`GET /v1/models` lists 40+ ids; `deepseek-v4-flash` and `deepseek-v4-pro` both
return `RegionError` (China-hosted, requires workspace opt-in). `qwen3.5-plus`
answered on the first try and was used for the whole run. The endpoint, protocol,
and key from the assignment were all correct; only the model id needed replacing.

### Step 4 — install the plugin

```sh
dsh plugin --profile web add github:beartackler/dsh-bridge
```

3.6 seconds, exit 0, **no warning**, and `dsh.profile.bundles` gains
`dsh-bridge`. The root-restructure fix from the live-mount report addendum is now
live on GitHub and the README's documented one-liner is true. This step is the
smoothest in the entire journey.

### Step 5 — first boot fails on file permissions

```
Error: credentials-local: /tmp/dsh-e2e/dshhome/.credentials.yaml is readable
beyond its owner (mode 644); run "chmod 600 ..." before starting again
    at assertOwnerOnly (@deepseek-ai/dsh-credentials-local/lib/index.js:104:8)
```

The error names the exact fix, which is good. But the file was created moments
earlier by following the harness's own documented shape, and a default umask of
022 makes mode 644 the guaranteed outcome. Every user hits this once.

### Step 6 — first boot also fails on a port collision

The same boot aborted with `EADDRINUSE 127.0.0.1:3080` from a leftover process.
Worth recording because the failure mode is a full plugin-tree abort with two
unrelated causes interleaved in one stack trace; the credentials error was 40
lines above the port error and easy to miss.

### Step 7 — boot succeeds

```sh
chmod 600 dshhome/.credentials.yaml
dsh --profile web --no-open      # dsh web: http://127.0.0.1:3080
```

Zero errors. Boot to serving takes roughly 25 seconds.

### Step 8 — dismiss the internal-testing modal

`01-first-load.png`. A modal covers the composer with a notice that DSH 0.1 is in
testing. One click on "Continue", persisted afterward.

### Step 9 — the workspace picker does not work in a browser

The composer is disabled and reads "Choose a workspace to start"
(`01-first-load.png`). Clicking "Choose workspace" produced **nothing at all** in
the browser: no dialog, no error, no console message.

Cause: `@deepseek-ai/dsh-host-directory-picker-auto` samples the host at boot and
chose the `native` backend, which opens a macOS dialog on the *server's* display.
A browser client cannot see it, and no fallback fires. Documented in the
module's own doc comment
(`dsh-host-directory-picker-auto/lib/types/index.d.ts:1-11`), but nothing in the
UI hints at it.

Unblocked by pinning the browse pair, which needs both faces named:

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

After a reboot the in-browser picker appears (`03-workspace-picker.png`) and the
composer unlocks (`04-workspace-chosen.png`). This is a hard stop for anyone
running `dsh web` on a remote host, and it is the friction most likely to make a
new user quit.

### Step 10 — the model answers

`05-plain-prompt.png`. Prompt in, `BRIDGE_E2E_MODEL_OK` out, footer reporting
`1 turns · 1 steps | LLM 2.5s | TTFT avg 1.6s · 56 tok/s | Input 8.5K tok ·
Output 48 tok`. The route configured by hand in step 3 works.

### Step 11 — the bridge commands

Typing `/bridge` opens the slash menu with **all 17 commands and their
descriptions** (`06-slash-menu.png`). Discovery is the plugin's strongest
surface: a user who knows nothing about dsh-bridge sees the whole product here.

One input quirk: submitting takes **two Enter presses**. The first accepts the
slash-menu highlight and appends a space; the second submits. Confirmed by
reading the composer value between presses (`"/bridge-help"` -> `"/bridge-help "`
-> `""`). This is standard autocomplete behavior, but it means naive automation
appears to do nothing.

All four commands returned `kind: "success"`, verified against the durable
session log:

```
seq 3  command/run   bridge-help
seq 4  command/done  success  "## dsh-bridge commands\n\nUsage: ..."
seq 5  command/run   bridge-doctor
seq 6  command/done  success  "### /bridge-doctor\n\nActive profile: default ..."
seq 7  command/run   bridge-status
seq 8  command/done  success  "### dsh-bridge status\n\n``` +----..."
seq 9  command/run   bridge-browse
seq 10 command/done  success  "### /bridge-browse\n\nCatalog is unavailable. ..."
```

(`$DSH_HOME/sessions/--Users-.../session-c4784aab-*/session.jsonl.zstd`)

This is the moment the exercise pays for itself: from the UI alone, three of the
four looked like they had failed.

---

## 2. Friction log

Severity: **blocker** stops onboarding; **major** costs real time or produces
wrong output; **minor** is a papercut.

| # | Step | Observed | Expected | Severity | Owner |
|---|---|---|---|---|---|
| F1 | 9. Choose workspace | Click does nothing in a browser; native dialog opens on the server's display | The browse picker mounts automatically when the client is remote, or the UI says why it cannot | blocker | harness |
| F2 | 11. Command output | Results render as one-line truncated chips; expanding shows raw markdown, tables unrendered | Command markdown renders like assistant markdown: real tables, real code blocks | major | harness (see 3.4) |
| F3 | 3. Model route | Only working example of a custom endpoint lives in a `.d.ts` module comment | A user-facing "connect a custom OpenAI-compatible provider" doc, or `/bridge-connect` doing it | major | both |
| F4 | 11. `/bridge-browse` | "Catalog is unavailable. docs/catalog/manifest.json was not found" on a clean install | The 2189-entry catalog the README advertises | major | plugin (see 3.1) |
| F5 | 11. `/bridge-doctor` | Two YELLOW rows blaming a `default` profile the user never used | Reports the `web` profile it is mounted in; all green | major | plugin (see 3.2) |
| F6 | 11. `/bridge-status` | `MODEL: unavailable`, `BRIDGE: unavailable`, `TOKENS: unavailable` while the UI footer shows Qwen 3.5 Plus and a token count | The route and tokens the harness already knows | major | plugin (see 3.3) |
| F7 | 5. First boot | Aborts because `.credentials.yaml` is mode 644, the umask default | Harness creates it 600, or repairs it with a warning | minor | harness |
| F8 | 1. Runtime install | 373s with no progress signal | Any indication of liveness | minor | harness |
| F9 | 2. Isolation | Nothing suggests setting `DSH_HOME` before experimenting | Mentioned wherever the install is documented | minor | harness |
| F10 | 11. Submit | Two Enter presses to submit a slash command | One, or a visible hint | minor | harness |
| F11 | 6. Boot failure | Two unrelated fatal causes interleaved in one ~60-line stack | A summary listing each failed entry and its cause | minor | harness |

---

## 3. Plugin defects, with file and line

Reported here rather than fixed, per the assignment's scope rules.

### 3.1 `/bridge-browse` ships no catalog manifest (F4)

`package.json:12-18` lists in `files`:

```json
"files": [
  "index.js",
  "cordis.patch.yml",
  "packages/dsh-bridge/dist",
  "tools/scan/dist",
  "docs/catalog/cards"
]
```

`docs/catalog/cards` ships (65 files present in the installed package) but
`docs/catalog/manifest.json` and `docs/catalog/INDEX.md` do not.
`resolveCatalogPaths` at
`packages/dsh-bridge/src/commands/browse.ts:80-101` walks up to 8 parent
directories looking for `docs/catalog/manifest.json`; finding none, it returns
`undefined`, and `browse.ts:565-570` renders "Catalog is unavailable."

Every catalog command is affected, not just browse: `install.ts:76-95` performs
the same lookup for the same file.

**Reproduced and confirmed as the sole cause.** Copying only those two files into
the installed package and re-running `/bridge-browse` with no other change
produced `2189 entries | page 1/219` and a fully populated grade table
(`13-bridge-browse-with-manifest.png`, versus the failure in
`10-bridge-browse.png`).

Note the interaction with the live-mount report's finding that `pnpm pack` honors
`.gitignore` for git-hosted packages: adding the paths to `files` is necessary,
and confirming they survive packing is also necessary.

### 3.2 `/bridge-doctor` reports a profile the plugin is not running in (F5)

Output:

```
| [ YELLOW ] | DSH profiles   | active profile 'default' has no directory; found: node_modules, web |
| [ YELLOW ] | Profile config | not found: /tmp/dsh-e2e/dshhome/profiles/default/cordis.patch.yml   |
Overall: DEGRADED - usable now, review the yellow items above.
```

The plugin was installed into, and is running inside, the `web` profile. It
reports `default` and degrades itself for the absence of a profile nobody asked
for.

Cause: `packages/dsh-bridge/src/index.ts:49-51` defaults `Config.profile` to the
string `"default"`, and `index.ts:57` passes that straight into the bridge
context. The shipped bundle layer (`cordis.patch.yml:4-6`) inserts the row with
no `config`, so the default always wins:

```yaml
- insert:
    - id: bridge
      name: dsh-bridge
```

`checkProfileDirs` at `src/commands/doctor.ts:153-190` then correctly reports
that `profiles/default` does not exist. The check is right; the input is wrong.

The live-mount report proved config plumbing works by hand-writing
`config: { profile: web }`. On the supported install path nothing writes it, so
**every user's first `/bridge-doctor` reports DEGRADED**. This is the worst
first impression in the product: the trust-focused plugin's own health check
fails on itself.

Worth considering: the harness knows its own active profile. Deriving it beats
asking the user to configure a value they cannot see is wrong.

### 3.3 `/bridge-status` reports unavailable for facts the harness has (F6)

Output:

```
|  MODEL:      unavailable
|  BRIDGE:     unavailable
|  TOKENS:     unavailable
```

Taken at the same moment the UI footer read `Qwen 3.5 Plus` and
`Input 8.5K tok · Output 48 tok`.

Cause: `src/commands/status.ts:31-68` declares an optional `StatusServices`
carrying `activeRoute`, `mountedFeatures`, and `tokenUsage`, and
`status.ts:371` resolves it as `options.services ?? {}`. Nothing populates it:
`grep -rn 'StatusServices\|activeRoute' src/` matches only `status.ts` itself.
`src/index.ts:56-70` constructs the bridge context with `profile`, `paths`, and
`output` only. The seams named in the doc comments
(`agent-default-model currentSelection` for S2, session token projection for S6)
are never wired.

The command is honest, which the spec demands, but three of six rows being
`unavailable` on a healthy install makes the dashboard read as broken.
`agent-default-model` is in the composed tree at `--dump-config` line 40 and its
selection is what the footer renders, so at minimum `MODEL` is reachable.

### 3.4 Command output is unreadable in the web UI (F2, shared with the harness)

`09-bridge-status.png` shows all four results as single-line chips truncated at
roughly 90 characters. Clicking a chip expands it into a monospace block of
**raw, unrendered markdown**: literal `|` pipes, literal `###`
(`12-command-row-expanded.png`, `08-bridge-doctor.png`).

The in-box `/goal` command renders the same way
(`11-native-command-compare.png`), so the renderer's treatment of
`command/done` text is the harness's, not the plugin's. But the *consequence* is
disproportionately the plugin's, because dsh-bridge's output design leans on
markdown tables and ASCII box-drawing. `/bridge-help`'s five tables and
`/bridge-status`'s ASCII frame are the two worst cases in the product.

Two responses, not exclusive:

- Ask upstream whether `command/done` text can render as markdown.
- Until then, design command output for a preformatted monospace block. ASCII
  box-drawing survives that treatment; pipe tables do not. `/bridge-status`
  already does the right thing and is the model to follow.

---

## 4. Where a new user must stop and think

Everything above is mechanical except these five, each requiring a decision the
product does not make for them.

1. **Which model id does my endpoint actually serve?** The assignment's id was
   rejected and two plausible alternatives failed with a region error. Resolving
   this took a raw `GET /v1/models` and four `curl` probes. No harness surface
   lists a custom route's models before you commit to one.
2. **What is the shape of a custom provider route?** Four `.d.ts` files read to
   learn that `api`, `baseURL`, and `models` are jointly required, that the route
   key must be repeated in `agent-default-model`, and that `apiKeyEnv` is a
   credential reference rather than a shell variable.
3. **Why does "Choose workspace" do nothing?** No error, no console output. The
   only way to the answer is reading the picker plugin's doc comment and knowing
   that "auto" resolved to a server-side dialog. Then knowing that pinning the
   alternative requires naming *both* the backend and the client surface.
4. **Did my command actually run?** Three of four commands looked like failures
   in the UI. Confidence required decompressing the session JSONL and reading
   `command/done` events.
5. **Is DEGRADED my fault?** `/bridge-doctor` names a profile the user never
   typed and offers a fix hint (`dsh plugin --profile default add ...`) that
   would install a second copy of the plugin into a profile they do not want.
   The correct action is to ignore the advice.

---

## 5. The three-command onboarding to build toward

The journey above is 11 steps, four research detours, two boot failures, and one
hand-written YAML patch. The target:

```sh
# 1. install the runtime and the bridge in one step
npx @deepseek-ai/dsh plugin --profile web add github:beartackler/dsh-bridge

# 2. boot
dsh --profile web

# 3. inside the UI, one command that does the rest
/bridge-connect
```

For that third command to absorb steps 2, 3, 5, and 9, `/bridge-connect` needs
to:

- **Ask for an endpoint and a key, then list the models it actually serves.**
  A `GET /v1/models` against the base URL turns friction 1 into a picker. The
  model-id guessing that consumed the most time in this run disappears.
- **Write both halves of the route.** The `llm-pi-ai` provider block *and* the
  `agent-default-model` selection, into the profile patch, with a `.bak`. Half a
  route is silent failure.
- **Write the credential at mode 600.** Removes F7 permanently.
- **Detect a remote client and pin the browse picker.** Removes F1, the only
  blocker in the log. dsh-bridge can see whether the client is local; the
  harness's auto-resolver cannot, because it samples at boot.
- **Smoke-test and print the result.** One real completion request against the
  configured route, so the user learns the route works before their first prompt
  rather than after.

Two supporting changes make the result trustworthy rather than merely fast:

- Derive the active profile instead of defaulting to `"default"` (3.2), so
  `/bridge-doctor` reports all green on a correct install and `DEGRADED` means
  something.
- Populate `StatusServices` from the seams already in the composed tree (3.3), so
  `/bridge-status` earns its name.

Both are prerequisites for the pitch. A one-command setup whose own doctor then
reports DEGRADED trades one friction for a worse one.

---

## 6. Screenshots

All under `site/demo/e2e/`, captured at 1440px wide against the live runtime.

| File | Shows |
|---|---|
| `01-first-load.png` | First load: internal-testing modal, composer locked to "Choose a workspace to start" |
| `03-workspace-picker.png` | The in-browser picker, only after the browse pair is pinned by hand (F1) |
| `04-workspace-chosen.png` | Composer unlocked, workspace `Documents`, model `Qwen 3.5 Plus` |
| `05-plain-prompt.png` | **Model working.** `BRIDGE_E2E_MODEL_OK` answered; 1.6s TTFT, 56 tok/s |
| `06-slash-menu.png` | All 17 `/bridge-*` commands with descriptions. The plugin's best surface |
| `07-bridge-help.png` | `/bridge-help` expanded: five markdown tables, unrendered (F2) |
| `08-bridge-doctor.png` | `/bridge-doctor` expanded: two YELLOW rows blaming profile `default` (F5, 3.2) |
| `09-bridge-status.png` | Four results as truncated one-line chips (F2) |
| `10-bridge-browse.png` | `/bridge-browse` failing: "Catalog is unavailable" (F4, 3.1) |
| `11-native-command-compare.png` | In-box `/goal` rendering identically, proving F2 is the harness's |
| `12-command-row-expanded.png` | An expanded chip: raw markdown pipes and `###` in monospace |
| `13-bridge-browse-with-manifest.png` | The same `/bridge-browse` after adding the two missing files: 2189 entries, full grade table. Confirms 3.1 |

## 7. Reproducing this

```sh
mkdir -p /tmp/dsh-e2e && cd /tmp/dsh-e2e && npm init -y
npm install @deepseek-ai/dsh@0.1.1-rc.2          # ~6 min
export DSH_HOME=/tmp/dsh-e2e/dshhome
./node_modules/.bin/dsh --profile web --dump-config > /dev/null   # seeds the profile

# model route + credential (see step 3 for the patch body)
$EDITOR $DSH_HOME/profiles/web/cordis.patch.yml
printf 'OPENCODE_ZEN_API_KEY: sk-...\n' > $DSH_HOME/.credentials.yaml
chmod 600 $DSH_HOME/.credentials.yaml            # required, see F7

./node_modules/.bin/dsh plugin --profile web add github:beartackler/dsh-bridge
./node_modules/.bin/dsh --profile web --no-open  # http://127.0.0.1:3080
```

Driver scripts used for the UI pass live in `/tmp/dsh-e2e/` (`final2.mjs` drives
the four commands and expands each result chip). They are scratch artifacts, not
committed: the durable evidence is the screenshots plus the session-log excerpts
quoted above.

## 8. Blockers

None left standing. Both hard stops encountered were worked around within this
run and are documented with their exact unblock:

- **F1**, the workspace picker, needed the browse backend and client surface
  pinned together in the profile patch. Until that is automatic, every remote
  `dsh web` user is blocked at the composer.
- **`ox-alpha-free`** is not served by `https://opencode.ai/zen/go/v1`
  (`ModelError: Model ox-alpha-free is not supported`). The DeepSeek-hosted
  alternatives on that endpoint return `RegionError` and require a workspace
  opt-in this machine does not have. `qwen3.5-plus` on the same endpoint and key
  works, and was used for the whole run. Unblocking `ox-alpha` specifically
  would require either a different base URL that serves it or the China-region
  opt-in on the workspace named in the error.
