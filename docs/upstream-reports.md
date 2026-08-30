# Upstream issue reports for deepseek-harness

Draft copy for the seven friction-log items (`docs/research/e2e-onboarding-journey.md`)
whose owner is the harness rather than dsh-bridge. Each report is written to be
filed as-is on `deepseek-ai/deepseek-harness` GitHub Discussions (the
repository's stated intake channel; see `CONTRIBUTING.md`). None of these have
been filed. Ranked by user impact, most to least.

Source citations reference the local reference checkout at
`/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` at the
commit checked out there. Line numbers may drift; if a citation no longer
matches, the module doc comment at the top of the file is the more durable
anchor.

---

## 1. F1 — In-browser workspace picker silently does nothing on a remote `dsh web`

**Severity:** blocker. This is the one item in the whole journey that stops
onboarding outright with no error, no console message, and no visible next
step.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Node | v26.0.0 |
| Host OS running the server | macOS |
| Client | Chromium (Playwright 1.59.1), connecting to the server over `http://127.0.0.1:3080` |

**Reproduction**

1. `npx @deepseek-ai/dsh web --no-open` on a macOS (or any darwin/win32, or
   linux-with-zenity/kdialog) host bound to `127.0.0.1` with no `SSH_CONNECTION`
   / `SSH_TTY` set in the launching shell.
2. Open the printed URL in a browser that is not running on the same
   `DISPLAY`/desktop session as the server process — e.g. a browser on a
   different machine reaching the server through a reverse proxy, a container
   port-forward, or (as in our run) an automated remote-driven browser session.
3. Once a workspace is required, click **Choose workspace**.

**Observed**

Nothing happens in the browser. No dialog opens, no error toast, no console
warning. The composer stays disabled with "Choose a workspace to start."

**Expected**

Either the in-browser picker mounts automatically because the client is not
local, or the UI surfaces a message explaining that the native chooser opened
somewhere the browser can't reach.

**Root cause**

`resolveDirectoryPickerBackend` in
`packages/host/directory-picker-auto/src/resolve.ts:47-53` decides `native` vs
`browse` from **boot-time host facts only** — bind host, `SSH_CONNECTION`/
`SSH_TTY`, platform, and (on Linux) a chooser binary on `PATH`. It has no way to
observe where the connecting browser actually is:

```ts
export function resolveDirectoryPickerBackend(facts: DirectoryPickerHostFacts): DirectoryPickerBackendKind {
  if (facts.bindHost !== '127.0.0.1') return 'browse'
  if (present(facts.env.SSH_CONNECTION) || present(facts.env.SSH_TTY)) return 'browse'
  if (facts.platform === 'darwin' || facts.platform === 'win32') return 'native'
  if (facts.platform !== 'linux' || !facts.linuxChooser) return 'browse'
  return present(facts.env.DISPLAY) || present(facts.env.WAYLAND_DISPLAY) ? 'native' : 'browse'
}
```

`apply()` in `packages/host/directory-picker-auto/src/index.ts:62-97` mounts
that single choice once at boot as a real Loader entry pair (backend +
client surface), and the mounted client surface — `native` in our case — opens
`osascript`'s folder chooser on the **server's** desktop
(`packages/host/directory-picker-native/src/native-picker.ts:55-66`), which a
remote browser cannot see and receives no signal about. This exact gap is
already named honestly in the package's own README under "Known Limitations":

> "a workstation-local launch later reached through `ssh -L` arrives from
> `127.0.0.1`, resolves `native`, and opens the chooser on the unattended
> workstation" (`packages/host/directory-picker-auto/README.md:19`)

The limitation is documented at the source level but has no user-facing signal
at all — the click is a silent no-op.

**Evidence from our run**

> "The composer is disabled and reads 'Choose a workspace to start'
> (`01-first-load.png`). Clicking 'Choose workspace' produced **nothing at all**
> in the browser: no dialog, no error, no console message." — journey §1 step 9

We unblocked it only by hand-authoring a profile patch that disables the auto
chooser and pins the browse pair directly, exactly as the module's own doc
comment recommends for this situation:

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

**Suggested fix directions**

- Cheapest, highest-value: when the `native` backend's client surface is
  mounted, have the client detect that its own `location.hostname` isn't a
  loopback address the server can be sure is co-located with the display
  session, and render a message ("this server opened a native file dialog you
  may not be able to see; ask your administrator to pin the browse backend")
  instead of a silently disabled button. This requires no protocol change,
  only a client-side heuristic alongside the existing surface.
- More complete: extend the resolution seam so the client surface can report
  "picker unreachable" back to the server per-connection, since the auto
  resolver is explicitly a boot-time, not per-client, decision
  (`README.md:21`, "Boot-time only").
- Documentation-only stopgap: the `dsh web` quickstart in the root `README.md`
  and `docs/user/guide/index.md` could name this failure mode and link the
  `directory-picker-auto` README's own limitations section, so a user hitting
  a dead click has somewhere to look before filing a bug.

---

## 2. F2 — Command output renders as raw unrendered markdown, not the assistant's markdown

**Severity:** major. Every dsh-bridge command that returns a table or a
multi-line block currently reads as broken even when the command succeeded.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Node | v26.0.0 |
| Client | Web UI, Chromium via Playwright 1.59.1 |

**Reproduction**

1. In `dsh web`, run any slash command whose `command/done` text contains
   markdown — a pipe table, a fenced code block, or (as a harness-native
   control case) the in-box `/goal` command's multi-line status text.
2. Observe the collapsed one-line chip, then click to expand it.

**Observed**

The collapsed chip truncates the text at roughly 90 characters. The expanded
view shows the raw markdown source verbatim: literal `|` pipe characters,
literal `###` headers, no table borders, no code fencing.

**Expected**

`command/done` text renders the same way assistant markdown does: real tables,
real headings, real code blocks.

**Root cause**

`GenericCommandCard`
(`packages/client/ui-conversation/src/client/chat/GenericCommandCard.tsx:69`)
renders the settlement text through a bare `<pre>`:

```tsx
<pre className={css.body} data-error={state === 'error' || undefined}>{body}</pre>
```

The harness already ships a markdown renderer capable of exactly the content
these commands emit — GFM tables, fenced code, math — documented in
`packages/client/ui-primitives/README.md:17` ("Markdown rendering") and
implemented in `packages/client/ui-primitives/src/markdown/MarkdownText.tsx`.
Assistant messages route through it; `GenericCommandCard`'s command body does
not.

**Evidence from our run**

> "`09-bridge-status.png` shows all four results as single-line chips
> truncated at roughly 90 characters. Clicking a chip expands it into a
> monospace block of **raw, unrendered markdown**: literal `|` pipes, literal
> `###` (`12-command-row-expanded.png`, `08-bridge-doctor.png`)." — journey §3.4

> "The in-box `/goal` command renders the same way
> (`11-native-command-compare.png`), so the renderer's treatment of
> `command/done` text is the harness's, not a plugin's." — journey §3.4

**Suggested fix**

Swap the `<pre>` at `GenericCommandCard.tsx:69` for `MarkdownText`, the same
component assistant messages already use, gated behind the existing
`expandable`/`open` disclosure state so collapsed chips keep their current
one-line summary behavior. This is a one-component swap, not a new renderer —
the capability is already built and already trusted for untrusted assistant
output, which is a stronger trust bar than command output needs to clear.

If there's a reason command text was deliberately kept in `<pre>` (e.g. to
preserve exact ASCII box-drawing some commands rely on today), a plain-text
opt-in per command would let table-heavy commands upgrade without breaking
that case; either way, worth confirming which of the two policies is intended
before more plugins design their own output tables against the current
raw-text behavior.

---

## 3. F7 — First boot rejects a `.credentials.yaml` created by the harness's own documented flow

**Severity:** minor by damage (one `chmod` fixes it), but near-100% hit rate:
almost every user who follows the documented file-creation flow under a normal
`umask 022` will hit this once.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Node | v26.0.0 |
| Shell umask | 022 (the common default) |

**Reproduction**

```sh
export DSH_HOME=/tmp/dsh-e2e/dshhome
printf 'OPENCODE_ZEN_API_KEY: sk-...\n' > $DSH_HOME/.credentials.yaml   # umask 022 -> mode 644
dsh --profile web --no-open
```

**Observed**

```
Error: credentials-local: /tmp/dsh-e2e/dshhome/.credentials.yaml is readable
beyond its owner (mode 644); run "chmod 600 ..." before starting again
    at assertOwnerOnly (@deepseek-ai/dsh-credentials-local/lib/index.js:104:8)
```

**Expected**

The harness either creates the file at `0600` itself when it's the one writing
it, or repairs an over-permissive file it finds with a warning rather than a
hard boot failure — reserving the hard failure for a file the harness did not
create (a genuinely surprising ACL).

**Root cause**

`assertOwnerOnly` in
`packages/credentials/credentials-local/src/index.ts:127-146` is a strict
gate with no repair path:

```ts
async function assertOwnerOnly(filename: string): Promise<void> {
  ...
  const offending = mode & GROUP_OTHER_BITS
  if (offending === 0) return
  throw new Error(
    `credentials-local: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)});`
    + ` run "chmod 600 ${filename}" before starting again`,
  )
}
```

Notably, the provider's own write path already gets this right —
`LocalCredentialProvider` calls
`writeFileAtomic(this.spec.filename, nextText, { mode: 0o600, dirMode: 0o700 })`
at four call sites (`src/index.ts:699`, `720`, `778`, `848`). The gap is
specifically the **first-ever** file: nothing in the documented flow (hand-editing
the credentials document before the first boot, as `docs/user/guide/providers.md`
and the reference README both describe) goes through that writer, so the very
first file a new user creates inherits the shell's umask instead of the
provider's own `0600` policy — and the check that would catch a real problem
also catches this harmless case.

**Evidence from our run**

> "The error names the exact fix, which is good. But the file was created
> moments earlier by following the harness's own documented shape, and a
> default umask of 022 makes mode 644 the guaranteed outcome. Every user hits
> this once." — journey §1 step 5

**Suggested fix**

At the point `assertOwnerOnly` finds a fixable POSIX mode problem (group/other
read or write, no unusual bits otherwise), `chmod(filename, 0o600)` in place
and log a one-line notice, rather than throwing. Reserve the throw for modes
`assertOwnerOnly` cannot safely interpret as "just a loose umask" — e.g. if
that's ever a concern, gate the auto-repair on the file being owned by the
current user (already implicitly true, since `stat` succeeded and Windows is
already skipped). This keeps the security intent (never silently read a
group/world-readable secrets file) while removing the guaranteed first-boot
failure for anyone who created the file by hand.

---

## 4. F9 — `DSH_HOME` isolation is undocumented at the point a new user needs it

**Severity:** minor in mechanics, but the actual risk is real: skipping this
step means a first-time experiment silently mutates the user's real `~/.dsh`.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Docs consulted | root `README.md` "Run from npm" section |

**Reproduction**

1. Follow the root `README.md` quickstart exactly as written:
   ```sh
   npx @deepseek-ai/dsh web
   ```
2. Look for any mention, in that same section, of scoping the harness's state
   directory before running commands.

**Observed**

The "Run from npm" section (`README.md:15-23`) has no mention of `DSH_HOME`.
Nothing in the immediate quickstart path suggests isolating harness state
before experimenting with profiles, plugins, or credentials — all of which the
harness stores under `$DSH_HOME` (default `~/.dsh`) as documented in depth
elsewhere (`apps/cli/reference/README.md:9-11`, `apps/cli/README.md:11`).

**Expected**

A one-line mention next to the quickstart command — e.g. "state lives under
`$DSH_HOME` (default `~/.dsh`); set `DSH_HOME` to a scratch directory while
experimenting" — so a user evaluating the product for the first time doesn't
unknowingly write into their eventual real home directory.

**Evidence from our run**

> "Nothing in the harness's own output suggests doing this. A user who skips
> it mutates their real `~/.dsh`. Discovered only from the prior report." —
> journey §1 step 2

**Suggested fix**

Add one sentence with a `DSH_HOME` example to the "Run from npm" section of
`README.md` (both `README.md` and `README.zh.md`), pointing to the fuller
treatment already written and correct in
`apps/cli/reference/README.md#profile-boot`. No new content needs to be
written — the existing reference doc already explains the precedence
correctly; it's just three hops away from the first command a new user runs.

---

## 5. F11 — A boot failure with two unrelated causes interleaves them in one stack trace

**Severity:** minor, but it compounds F7: the two real problems in our run
(bad credentials-file mode, then a stale port) were reported together with
roughly 40 lines of unrelated stack trace between them, and the second cause
was easy to miss entirely.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Reproduction context | Same boot attempt that also hit `EADDRINUSE 127.0.0.1:3080` from a leftover process |

**Reproduction**

1. Trigger two independent plugin activation failures in the same boot — in
   our run, a credentials-mode failure and a port collision from a leftover
   process on the same port.
2. Read the resulting single thrown error.

**Observed**

Both causes are present in the output, but as one aggregated block with the
credentials error roughly 40 lines above the port error, no header separating
them, and the two failures' stacks interleaved.

**Expected**

A short summary line naming how many entries failed and which ones, followed
by each failure's detail in its own clearly delimited section.

**Root cause**

`assertEntriesActivated` in `packages/boot/app-boot/src/index.ts:692-725`
already collects failures into a array and does exactly the right aggregation
in principle:

```ts
if (failures.length > 0) {
  ...
  const noun = failures.length === 1 ? 'entry' : 'entries'
  throw new Error(`${binName}: ${String(failures.length)} ${noun} did not activate\n${failures.join('\n')}`)
}
```

Each element of `failures` is `${entry.options.name}: ${formatActivationError(error)}`
(line 706), and `formatActivationError` (line 676-678) returns the *entire*
original stack trace for an `Error`-typed failure. With two failed entries,
the joined message is: name, full multi-line stack, name, full multi-line
stack — readable in isolation, but with no visual separator between the two
entries' blocks once each stack itself runs many lines, the eye has nothing to
anchor on to find where entry 2 begins.

**Evidence from our run**

> "The same boot aborted with `EADDRINUSE 127.0.0.1:3080` from a leftover
> process. Worth recording because the failure mode is a full plugin-tree
> abort with two unrelated causes interleaved in one stack trace; the
> credentials error was 40 lines above the port error and easy to miss." —
> journey §1 step 6

**Suggested fix**

At `packages/boot/app-boot/src/index.ts:723`, change the join from a bare
`\n` to a delimited block per entry, e.g.:

```ts
throw new Error(
  `${binName}: ${String(failures.length)} ${noun} did not activate\n`
  + failures.map((f, i) => `\n[${i + 1}/${failures.length}] ${f}`).join('\n'),
)
```

or equivalent — the exact formatting is a taste call, but a numbered header
per entry (`[1/2] credentials-local: ...`, `[2/2] webserver: ...`) would have
made the second cause impossible to miss in our run without changing any of
the diagnostic content already being captured correctly.

---

## 6. F8 — The runtime install gives no signal that it is progressing, not hung

**Severity:** minor (no wrong output, just an anxious wait), but it's the very
first thing a new user experiences.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Node | v26.0.0 |
| Install command | `npm install @deepseek-ai/dsh@0.1.1-rc.2` |

**Reproduction**

```sh
mkdir -p /tmp/dsh-e2e && cd /tmp/dsh-e2e && npm init -y
npm install @deepseek-ai/dsh@0.1.1-rc.2
```

**Observed**

373 seconds elapsed with no output distinguishing "still installing" from
"stalled." `apps/cli/package.json` declares roughly 60 `workspace:^`
dependencies (lines 22-84 of that manifest), each of which is itself a
`dsh-*` package with its own dependency tree once resolved from the npm
registry — a plausible explanation for the wall-clock time, but nothing in the
install experience communicates that this is expected.

**Expected**

Some indication of liveness during a multi-minute install: even npm's own
default progress reporting, if it's being suppressed by an install flag
somewhere in the recommended command, or a documented expectation ("first
install can take several minutes; this is normal").

**Evidence from our run**

> "373 seconds. No progress signal that distinguishes 'installing' from
> 'hung'. The live-mount report already flagged this; it remains true." —
> journey §1 step 1

**Suggested fix**

We did not find an install-time script in this checkout that suppresses npm's
own progress output (`apps/cli/package.json` has no `install`/`postinstall`
hook; the `postinstall` hooks that do exist —
`packages/subprocess/subprocess-local/package.json:35` and the repo-root
`package.json:147` — are dev-only, native-helper, and lefthook setup
concerns, not part of what a package consumer's `npm install` runs). If the
slowness is simply the size of the dependency graph, the cheapest fix is
documentation: a note in the root `README.md` "Run from npm" section that the
first install can take several minutes. If there's appetite for something
more active, a `preinstall` script that prints one line ("installing N
dsh-* packages, this can take a few minutes on first run") would cost little
and remove the "did this hang" uncertainty directly.

---

## 7. F10 — Submitting a slash command from the menu takes two Enter presses

**Severity:** minor for a human (one extra keystroke), but it silently breaks
naive keyboard-driven automation, which is why we're flagging it precisely.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2 (npm) |
| Client | Web UI, Chromium via Playwright 1.59.1 |

**Reproduction**

1. In the composer, type `/bridge-help` (or any slash command) to open the
   slash menu with the command highlighted.
2. Press Enter once.
3. Read the composer's draft value.
4. Press Enter a second time.

**Observed**

After the first Enter, the composer value changes from `"/bridge-help"` to
`"/bridge-help "` (a trailing space appended) rather than submitting. The
second Enter actually submits.

**Expected**

Either one Enter submits directly when a command is already unambiguously
highlighted, or a visible hint distinguishes "this Enter accepts the
completion" from "this Enter sends the message" so it doesn't read as
unresponsive.

**Root cause**

This is deliberate, working-as-designed autocomplete behavior, not a bug in
the ordinary sense — but it's undiscoverable without reading the source. In
`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:413-417`,
an Enter keypress first goes through menu arbitration:

```tsx
const arbitrated = keyboard.arbitrate('enter', composing)
if (arbitrated !== 'pass') {
  e.preventDefault()
  return
}
```

`arbitrate('enter', ...)` in
`packages/client/ui-input-trigger/src/client/controller.ts:199-203` returns
`'pick-highlighted'` whenever the menu is open and something is highlighted
— which is the normal state right after typing a full command name — and
that outcome short-circuits the keydown handler before it reaches the actual
submit logic further down the same function. The pick itself (via
`InputTriggerController.pick`, called internally) inserts the completion text
plus a trailing space, matching what the journey observed.

**Evidence from our run**

> "One input quirk: submitting takes **two Enter presses**. The first accepts
> the slash-menu highlight and appends a space; the second submits. Confirmed
> by reading the composer value between presses (`"/bridge-help"` ->
> `"/bridge-help "` -> `""`). This is standard autocomplete behavior, but it
> means naive automation appears to do nothing." — journey §1 step 11

**Suggested fix**

We're not proposing to change the two-Enter behavior itself — it matches
common editor/IDE autocomplete conventions and changing it could surprise
users who rely on it to browse-then-commit. What would help without changing
behavior: a subtle visual cue on the highlighted menu row (e.g. "Enter to
complete, Enter again to send") the first time a user encounters the slash
menu, similar to how many terminal completion UIs hint their own two-step
accept/submit. This is a UI-copy change near
`packages/client/ui-input-trigger/src/client/controller.ts` and its paired
menu view component, not a behavior change to `arbitrate()`.

---

## Summary

7 reports drafted (F1, F2, F7, F8, F9, F10, F11), matching the 7 harness-owned
items in the friction log. Ranked 1-7 above by observed user impact: F1
(blocker) first, F2 (major, affects every table/markdown-heavy command
output) second, then the five minor items ordered by how many users they hit
and how much confusion or risk they cause (F7, F9, F11, F8, F10).

6 of the 7 carry a concrete file:line citation in the reference checkout
pinpointing the responsible code (F1, F2, F7, F9, F10, F11). F8 could not be
pinned to a specific line — the checkout has no install-time script that
visibly explains or suppresses progress reporting, so that report cites the
dependency-count evidence instead and treats the likely cause as npm's own
behavior against a large graph rather than a harness code defect.

---

## 8. F1-b — The adaptive directory picker resolves `native` for every local macOS/Windows boot, so any non-co-located browser is silently dead

Appended after the seven reports above. Report 1 covered the remote/tunnelled
case. This one narrows the claim to the exact predicate, because the condition
is much broader than "remote": on macOS and Windows the resolver never consults
the display at all, so the default `dsh web` on a developer laptop is already
one reverse proxy, one container port-forward, or one headless driver away from
a dead button, with no signal of any kind.

**Severity:** blocker on first run for any client that is not the server's own
desktop session. Silent: no dialog, no toast, no console entry, no server log.

**Environment**

| Field | Value |
|---|---|
| Runtime | `@deepseek-ai/dsh` 0.1.1-rc.2, installed from npm |
| Picker packages | `@deepseek-ai/dsh-host-directory-picker-auto` 0.1.1-rc.2 |
| Host OS | macOS (darwin, arm64) |
| Bind | `127.0.0.1:3080`, the default |

**Mechanism, from the installed runtime**

The stock web app mounts the adaptive row, not a concrete backend:

`node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml:96-97`

```yaml
- id: directory-picker
  name: '@deepseek-ai/dsh-host-directory-picker-auto'
```

That row resolves the backend once, from boot-time host facts only:

`node_modules/@deepseek-ai/dsh-host-directory-picker-auto/lib/index.js:63-69`

```js
function resolveDirectoryPickerBackend(facts) {
	if (facts.bindHost !== "127.0.0.1") return "browse";
	if (present(facts.env.SSH_CONNECTION) || present(facts.env.SSH_TTY)) return "browse";
	if (facts.platform === "darwin" || facts.platform === "win32") return "native";
	if (facts.platform !== "linux" || !facts.linuxChooser) return "browse";
	return present(facts.env.DISPLAY) || present(facts.env.WAYLAND_DISPLAY) ? "native" : "browse";
}
```

Line 66 is the whole problem. On darwin and win32 the function returns `native`
on the strength of the platform name alone. Linux gets two further checks (a
chooser binary on `PATH`, then `DISPLAY`/`WAYLAND_DISPLAY`); macOS and Windows
get none. The only escapes are a non-loopback bind and an SSH-launched shell,
neither of which describes a reverse proxy, a published container port, a
`docker exec`-launched server, a CI runner, or a browser driven from another
process on the same host.

The sampled facts confirm there is nothing else in the decision:

`.../directory-picker-auto/lib/index.js:117-123`

```js
const backend = resolveDirectoryPickerBackend({
	bindHost: ctx.webServer.host,
	platform: process.platform,
	env: process.env,
	linuxChooser: hasLinuxChooserBinary(process.env.PATH, canExecute)
});
```

No request, no connection, no client hint. The resolved kind then mounts both
faces as Loader entries and stays fixed for the service lifetime:

`.../directory-picker-auto/lib/index.js:94-109` (the package tables) and
`:133` (`for (const name of [BACKEND_PACKAGES[backend], SURFACE_PACKAGES[backend]]) ids.push(await ctx.loader.create({ name }))`).

The `browse` backend that would have worked is present in the same install and
explicitly renders nothing on the host display:

`node_modules/@deepseek-ai/dsh-host-directory-picker-browse/lib/index.js:7-14`

> "Nothing renders on the host display, so this backend serves remote clients
> the dialog backend cannot."

So on a default macOS boot the harness ships a working in-page picker, chooses
not to mount it, and mounts a dialog the user may have no way to see.

**Reproduction**

1. On macOS, `dsh --profile web --no-open`. Default bind, no SSH variables set.
2. Reach `http://127.0.0.1:3080` from any browser that is not the server's own
   attended desktop session: a driver process, a forwarded port from another
   machine, a container-published port.
3. Click "Choose workspace".

**Observed:** the click lands on `span.pXSMma_workspaceLabel` and completes; the
UI does not change. The composer stays disabled at "Choose a workspace to
start." Nothing is written to the browser console or the server log.

**Expected:** either the browse surface mounts, or the user is told that a file
dialog was opened somewhere they cannot see.

**Confirmed by A/B on one machine**

Two isolated `DSH_HOME`s, identical except for the picker patch, booted from the
same runtime on the same macOS host, both bound to loopback. The host's own RPC
reports which capability got composed:

```
# stock profile, adaptive row left alone
POST /api/host.listDirectory {"path":"/tmp"}
-> {"ok":false,"error":{"code":"directory-picker-unavailable",
    "message":"host.listDirectory needs the browse capability;
               the composed picker serves \"native\"",
    "details":{"capability":"native"}}}

# same runtime, browse pair pinned
POST /api/host.listDirectory {"path":"/tmp"}
-> {"ok":true,"value":{"path":"/tmp","home":"/Users/...","crumbs":[...],
    "entries":[...]}}
```

The refusal is raised at
`node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js:3141-3147`. Note that
the server knows perfectly well that the composed picker cannot serve a remote
listing, and says so in a structured error, but nothing in the native client
surface turns that knowledge into anything the user sees. The information to
render a useful message already exists on the host; it simply never reaches the
screen.

**Why this is worth fixing upstream even though a patch exists**

The documented workaround is to disable the adaptive row and mount the browse
pair directly, naming both the host backend and the client surface. That
requires knowing three non-obvious facts: that a plugin makes this decision,
that it has an alternative, and that pinning it means composing two entries
rather than one. A first-time user has no thread to pull, because the failure
produces no text to search for. We now do this in our own installer, but every
user who does not use our installer still hits it.

**Suggested fixes, cheapest first**

1. Make the silence impossible. When the `native` surface is mounted and a pick
   is requested, have the host emit one log line naming the display it opened
   on, and have the client render a fallback message after a timeout with no
   result. This is additive and changes no defaults. The host already produces
   the exact sentence a user would need (`directory-picker-unavailable`,
   apiproxy `lib/index.js:3143-3147`); it only needs a surface that shows it.
2. Treat "no evidence of an attended display" as ambiguous on darwin/win32 as
   well, matching how linux is already handled, and let ambiguity resolve to
   `browse` as the module's own doc comment says it should
   ("Anything ambiguous resolves to `browse`, which works everywhere",
   `lib/index.js:58-59`). The current darwin/win32 shortcut contradicts that
   stated principle.
3. Consider making `browse` the default outright for `dsh web`. It works in
   every situation the native backend works in, plus the ones it does not. The
   native dialog is the better experience only for a genuinely local, attended
   session, which is the case a per-connection hint could detect later.

---

## 9. N2 — A command's output is invisible in a session that has never run a turn

**Severity:** blocker. Slash commands are the only thing a user can do before
they have connected a model, and in a brand-new session they produce a blank
screen. Reproduced deterministically across four runs
(`docs/research/e2e-npx-journey.md` §5, BUG 2).

**Reproduction**

1. Boot `dsh web`, open a new session, choose a workspace.
2. Type any registered slash command and submit.
3. Nothing renders. The page body is 242 characters of chrome.
4. Open a session that contains at least one completed turn, run the same
   command, and it renders in full.

Session-log ground truth: session `1149cfba` had `cmds=8 turns=0` and rendered
nothing; session `6821fc77` had `cmds=7 turns=1` and rendered everything. The
zero-turn log contains six `command/run` / `command/done` pairs, every one
`kind: "success"` with the full markdown in `text`. The commands ran and the
client had the text.

**Mechanism**

This is not a renderer bug in the command node; the command node is built
correctly. The entire conversation body is unmounted while the session is
judged blank, and a command row is explicitly not allowed to un-blank it.

1. `ConversationSession` returns `null` — the whole view area — when
   `blank && composerPhase === "blank"`
   (`@deepseek-ai/dsh-client-ui-conversation/lib/client.js:7416`).
2. `composerPhase` is `derivePhase(hasVisibleConversationContent(chat) ||
   !this.blankBit && !this.firstPromptPendingTurn || this.running ||
   this.pendingCache.value.length > 0, this.promptAttempted)`
   (`@deepseek-ai/dsh-client-runtime/lib/client.js:7718`).
3. `hasVisibleConversationContent` discounts command nodes by kind:
   `chat.order.some((key) => chat.nodes.get(key)?.kind !== "command")`
   (`@deepseek-ai/dsh-client-runtime/lib/client.js:7748-7750`), with the
   comment "A generic command row alone remains control-plane content; every
   other visible Chat Node activates the conversation."
4. `blankBit` is only cleared by a prompt (`:7251`), a running turn
   (`:7504`), or an authoritative summary (`handleBlank`, `:7542`). A command
   is none of those.

So the predicate is doing exactly what it was written to do, and the
consequence at `:7416` is that a session whose only content is commands has no
conversation body at all. Every command node is built, ordered, and then not
mounted.

The host half is consistent and correct: `CommandRuntime.execute` appends
`command/run` before the handler and `command/done` after it, explicitly
log-only with no turn wrapping
(`@deepseek-ai/dsh-commands/lib/index.js`, `execute` and `appendLifecycle`).
That is a reasonable design; the client's blank gate is what makes it
invisible.

**Why the current behaviour is worse than it looks**

`/bridge-setup`, `/compact`, `/goal`, `/feedback` and every third-party
command share this. A first-time user is by definition in a zero-turn session,
and any onboarding instruction that starts with "run this command" gets a
blank screen as its answer. There is no error text to search for.

**Suggested fixes, cheapest first**

1. Count a command node as content when it carries a `success` outcome with
   non-empty `text`. The discount at `:7748` is right for a bare control-plane
   row (`/compact` with no output); it is wrong for a command that produced a
   document. This is a one-predicate change and does not alter the blank bit
   or the hero for commands that render nothing.
2. Alternatively, keep the phase blank but stop gating the body on it at
   `:7416`: render the view area whenever the Chat snapshot has any ordered
   node, and let the hero own only the composer's presentation.
3. If neither is acceptable, have `CommandRuntime.execute` flip the session's
   blank bit on the first `command/done` that carries text, so the
   authoritative summary path (`handleBlank`) reports the session as engaged.

**Workaround currently shipped by dsh-bridge**

Before returning a result, our command handler appends one `user/message`
event with `surfaceOp: "append"` and a `kind: "plugin"`, `form: "notice"`
source, but only when the session log contains no `turn/start` and we have not
already done so (`packages/dsh-bridge/src/lib/session-priming.ts`). That
becomes a `context` Chat node
(`@deepseek-ai/dsh-client-ui-conversation/lib/client.js:8608-8617`), whose
kind is not `"command"`, which opens the gate. We do not like this: it puts a
line into the model-visible surface to work around a client-side presentation
rule, and we would delete it the day any of the three fixes above lands.
