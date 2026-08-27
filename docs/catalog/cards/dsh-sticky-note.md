# Trust Report Card: dsh-sticky-note

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-sticky-note` (DSH plugin: a bottom-left sticky-note pad that saves notes as Markdown files) |
| Pinned subject | github:Meredith2328/dsh-sticky-note @ commit `be79b18d044fc72ffd4ffe535178416decccc4e9` (default branch `main`, shallow clone head at audit time) |
| npm integrity | not checked (no published-artifact comparison performed; see section 5) |
| License | MIT (LICENSE) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local-only notepad: it writes Markdown files under `~/.dsh/sticky-notes`, makes no network
requests of any kind, and its single process spawn is the platform "open this file" command with an
argument array rather than a shell string.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket`, or `node:http` anywhere in `lib/` (grep). The plugin talks to the UI over the host's own RPC channel. | grep of lib/ |
| Child processes | Exactly one call site: `spawn(cmd, [absPath], { detached: true, stdio: 'ignore' })` where `cmd` is `explorer`, `open`, or `xdg-open` by platform (lib/index.js:143-170). Argument array, no shell, no `cmd /c start` (the code comments explain that choice). | lib/index.js |
| Filesystem writes | Under `root` only, default `$DSH_HOME/sticky-notes` (lib/index.js:33), plus `$DSH_HOME/sticky-note-config.json` and `sticky-note-retained.json` in the legacy path (lib/index.js:29-30). Subdirectories are a fixed list; expired notes move to a recycle directory and are deleted after 30 days (lib/index.js:169-215). | file:line |
| Credential reads | None. `process.env` is read once, for `DSH_HOME` (lib/index.js:28). | grep |
| RPC surface | One channel `/dsh-sticky-note` registered with `{ authority: 'loopback' }` (lib/index.js:553). Endpoints: list, save, update, new, clear, read, archive, restore, retain, config, open. | lib/index.js:445-537 |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*` in `lib/`. | grep |
| Telemetry | None found. | negative claim, scope stated |
| Lifecycle hooks | No install/postinstall scripts; `package.json` has no `scripts` block at all. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 10 findings (1 critical, 7 high, 2 medium), machine grade F.

### Scanner critical adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| EXEC-004 critical, `import { spawn } from 'node:child_process'` (lib/index.js:4) | True import, benign single use. The only consumer is `openFileWithSystem` (lib/index.js:143-170): a hardcoded per-platform command with a single path argument, no shell. Its callers (`open`, `openRoot`) validate `kind` against a fixed list and reject any name containing a separator or `..` (lib/index.js:519-533). | lines read directly |

### Findings kept after adjudication

| ID | Severity | Location | Note |
|---|---|---|---|
| STK-EXEC-1 | low | lib/index.js:160 | Launching a note file with the OS default handler. The path is composed from a fixed root, a whitelisted category, and a name that passed the `/[\\/]|\.\./` rejection. Residual: the file's own content is opened by whatever application the OS associates with `.md`. |
| STK-XSS-1 | low | lib/client.js:1613, 1707 | `dangerouslySetInnerHTML` with the plugin's own Markdown renderer. The renderer escapes `&`, `<`, `>`, `"` before any markup is inserted (lib/client.js:870-872), and link/image URLs are constrained to `https?://` by the pattern (lib/client.js:878-880). No `javascript:` URL reaches the output through this path. Kept as low because the renderer is hand-written and the source text is user-authored notes. |

### Scanner noise dismissed (with scope)

- Five NET hits at lib/client.js:845, 859, 1954: SVG icon markup (`React.createElement('svg', ...)`), matched on the `w3.org` namespace attribute. No request.
- Two NET hits in `.github/scripts/issue-diagnostics.node-test.mjs:70,91`: `example.test` fixture strings in a CI-only unit test.
- One NET hit in `.github/workflows/dsh-upstream-watch.yml:34`: an npmjs.com URL echoed into a release-notification message. CI-only, not shipped (`files` ships `lib` and `cordis.patch.yml` only).
- Two HOOK hits (`setTimeout` at lib/client.js:1847, 1856): 2-second "saved" toast dismissal.

### Negative claims and what was searched

Read in full: lib/index.js (568 lines), package.json, cordis.patch.yml, the Markdown renderer and both `dangerouslySetInnerHTML` sites in lib/client.js, `.github/workflows/issue-diagnostics.yml`. Grepped all of lib/ and .github/ for network APIs, `eval`, `new Function`, credential paths, and telemetry markers: zero hits outside those adjudicated above.

## 5. What we could not check

- **Published artifact vs source.** The npm package was not fetched, so no integrity hash or provenance attestation was compared against this commit.
- **Behavioral probe.** No sandboxed load, save, or open run was performed.
- **The client half in full.** lib/client.js is 1,972 lines; it was grepped exhaustively for dangerous APIs and read around the rendering and network-relevant sites, not line by line.
- **The `open` step's downstream effect.** What the OS-registered handler for `.md` does with a note is outside this artifact.
- **CI workflow permissions in practice.** `issue-diagnostics.yml` runs `npm install --ignore-scripts` and `npx vitest` on issue events with `issues: write`; the token scope was read from the manifest, not observed in a run.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F on the `child_process` import alone; the manual verdict is A after reading the single call site. Both positions are recorded.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/Meredith2328/dsh-sticky-note /tmp/dsh-sticky-note-audit
cd /tmp/dsh-sticky-note-audit && git rev-parse HEAD   # expect be79b18d044fc72ffd4ffe535178416decccc4e9

node tools/scan/dist/index.js /tmp/dsh-sticky-note-audit   # from a dsh-bridge checkout

grep -rn "fetch(\|XMLHttpRequest\|EventSource\|WebSocket\|node:http" lib/   # expect none
grep -n "spawn(" lib/index.js                    # expect exactly one call site, line 160
sed -n '143,170p' lib/index.js                   # per-platform command, argument array
grep -n "authority" lib/index.js                 # expect authority: 'loopback'
grep -rn "eval(\|new Function\|vm\." lib/        # expect none
node -e "console.log(Object.keys(require('./package.json').scripts||{}))"   # expect []
```

## 8. Methodology and pinned inputs

- Subject: commit `be79b18d044fc72ffd4ffe535178416decccc4e9`, clone at `reference/audits/dsh-sticky-note`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Review: full read of lib/index.js; targeted read plus exhaustive grep of lib/client.js; workflows read.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
- Grade derivation: zero network egress, zero credential access, one benign well-guarded spawn, no lifecycle hooks, no dynamic execution. Nothing leaves the machine. That is the A band. The card stops short of a higher claim because the published bundle was not compared and no behavioral probe was run.

## 9. Strengths

1. Nothing leaves the machine: no network capability exists in the shipped code at all.
2. Every path-taking endpoint validates the category against a fixed list and rejects names containing separators or `..` (lib/index.js:365, 393, 419, 429, 521).
3. Deletion is staged: expiry moves notes to a recycle directory, and only files older than 30 days there are removed (lib/index.js:169-215).
4. Writes are serialized per path and skipped when content is unchanged, so autosave does not churn mtimes or race (lib/index.js:307-340).
5. The Markdown renderer escapes HTML before parsing markup rather than after, which is the correct order.
6. RPC is registered with explicit `authority: 'loopback'` instead of relying on a default.

## 10. Residual risks

1. `dangerouslySetInnerHTML` with a hand-written renderer: correct today, but any future edit that reorders escaping introduces stored XSS in the note viewer.
2. Opening a note hands it to the OS default handler for its extension.
3. Notes are stored as plaintext files with no encryption, under a user-configurable `root` that can be pointed anywhere the user can write.
4. Published npm bundle not compared against this commit.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD; any new network API, second `spawn` call site, or added `scripts` entry must be adjudicated before this grade carries forward.
2. Re-check the escape ordering in `inlineMd`/`renderMarkdown` (lib/client.js:869-900) on any renderer change.
3. Confirm `authority: 'loopback'` is still present on the RPC registration.
4. Re-run the scanner after any heuristics-corpus bump; the corpus digest is in section 8.
