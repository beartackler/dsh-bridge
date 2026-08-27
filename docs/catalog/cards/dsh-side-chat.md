# Trust Report Card: dsh-side-chat

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-side-chat` (DSH web plugin: per-conversation side chat in a right-side panel) |
| Pinned subject | github:heartmove/dsh-side-chat @ commit `9dda48d72d3b51589096e8b130d3dd83740531f7` (branch main, shallow clone) |
| npm integrity | Not applicable. `package.json:5` sets `"private": true`; the package is not published to npm and is installed from git. |
| Provenance | None. Git-source install; no attestation, no signed tags, no release artifacts. |
| License | MIT (LICENSE:1-3, "dsh-sub-chats contributors") |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual source review) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

No outbound network destination exists anywhere in the source: the plugin's only HTTP surface is
its own loopback-fenced `/sidechat/api` route on the host's existing web server, its only file write
is a session-id bookkeeping file under the DSH home, and it reads no credentials and executes no
dynamic code; the grade is B rather than A because the plugin creates real agents that inherit the
launching conversation's permission preset and can inject text into the main conversation, which is
material capability even though every use of it is user-initiated.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The single `fetch` is a same-origin relative path to the plugin's own route (`/sidechat/api/${method}`, src/client/api.ts:67). The only URL literal in the whole of `src/` is the parse-base sentinel `http://dsh.internal` (src/index.ts:789), never connected to. A full `grep -rhoE "https?://" src` returns that one string. | src/client/api.ts:67, src/index.ts:789 |
| HTTP route (host half) | One prefix route `/sidechat/api` registered on the host's own web server (src/index.ts:775-778). Every request passes a browser-trust fence before dispatch: Host must be loopback or a configured `trustedHosts` authority, `sec-fetch-site: cross-site` refuses, and a present `Origin` must match the Host (src/trust-fence.ts:56-70; called at src/index.ts:781). Bodies are bounded at 1 MiB (src/wire.ts:23-38). Method names are single path segments looked up in a fixed table; unknown names 404 (src/index.ts:790-798). | file:line above |
| Agent creation | `ctx.agents.create` makes an ordinary hidden session per side chat, inheriting the parent's cwd, provider/model/maxTokens, toolset via `agentPresets.composeFrom`, and permission preset via `permissionPresets.set` (src/index.ts:369-412). The child is archived before the first prompt so it is hidden from session lists (src/index.ts:417). The inherited preset can be at most what the parent already had; the client may also pass an explicit preset (src/index.ts:405-410). | src/index.ts:340-430 |
| Injection into the main conversation | `sidechat.inject` calls `parent.inject(...)` with user-supplied text so a side-chat answer can be carried back as a collapsed context row (src/index.ts:589-600). Draft-only alternative goes through `conversation.input.setDraft` (src/context-types.ts:317-325). | file:line above |
| Slash-command execution | `sidechat.command` passes a client-supplied line to `ctx.commands.execute(child, line, ...)` (src/index.ts:297-304), scoped to a side-chat agent the same session already owns (`childOf` refuses unknown ids). The command surface is the host's own; the plugin adds none. | src/index.ts:290-304 |
| Model calls | `sidechat.summarize` builds a single-user-message prompt and streams it through the host's own `ctx.llm` service using the parent's provider/model (src/index.ts:544-588). The plugin never contacts a model vendor directly; routing is the harness's. | src/index.ts:544-588 |
| Credential reads | None. No `.ssh`, `.aws`, `auth.json`, keychain, cookie, or token path appears in `src/`. `process.env` appears only in tsdown.config.ts (build config), never in shipped code. | grep across src/, see section 4 |
| Filesystem writes | One file: `dsh-side-chat-sessions.json` under the DSH home directory resolved by `dshHomePath` (src/index.ts:60-62, 84-89), holding childId/parentSessionId/createdAt only (src/index.ts:190-196). No other write path exists. | file:line above |
| Filesystem reads | The same record file (src/index.ts:68) and, indirectly, session logs through the harness's own `sessionQuery.readSession` (src/index.ts:472, 492). No arbitrary path read. | file:line above |
| Child processes | None. No `child_process`, `spawn`, `exec`, or shell invocation anywhere in `src/`. | grep, zero hits |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm.*` in `src/`. | grep, zero hits |
| Telemetry | None. No analytics, beacon, or metrics code in `src/`. | negative claim, scope: all of src/ |
| Lifecycle hooks | `package.json:51` declares `"prepare": "tsdown"`. This runs on `npm install` for a git-source dependency, which is exactly how this plugin is installed, so it is an install-time hook in practice. It runs the project's own bundler over the project's own sources; it is not a fetch-and-run script. | package.json:51 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 13 findings (2 critical, 7 high, 4 medium), machine grade F, gate `finding-density`.
Every finding is adjudicated below; all 17 scanned files were read.

### Scanner criticals adjudicated

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 "enumerates the entire process environment" tsdown.config.ts:150-151 | False positive, and doubly so. The lines are `'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')` and the `import.meta.env` sibling: a bundler `define` map reading one named variable at build time. It is build tooling, not shipped code (tsdown.config.ts is not in `package.json` `files`). | tsdown.config.ts:149-153 read directly |

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| SIDE-HOOK-1 | medium | package.json:51 | `prepare: tsdown` runs at install time for git-source installs. It bundles the checkout's own `src/` with the declared devDependency toolchain. A user who installs from git executes the repo's build; that is the standard git-dependency trust model, but it is not zero. |
| SIDE-CAP-1 | medium | src/index.ts:369-412 | Creates agents inheriting the parent's permission preset and cwd. If the parent conversation runs at `danger-full-access`, so does the side chat. The plugin never widens permission beyond the parent except when the browser half passes an explicit preset (src/index.ts:405), which is a user action in the panel UI. |
| SIDE-CAP-2 | low | src/index.ts:589-600 | Can inject arbitrary text into the parent conversation's context. Content originates from the side chat's own transcript, which is model output; a prompt-injected side chat could carry text back. User-initiated per call. |
| SIDE-SUPPLY-1 | low | package.json:5 | `private: true`, no npm artifact, no attestation. Installation is from a moving git branch unless the user pins a commit. |

### Scanner noise dismissed (with scope)

- NET-003 x3 (src/context-types.ts:13, src/trust-fence.ts:7, src/wire.ts:7): `import type { IncomingMessage, ServerResponse } from 'node:http'`. Type-only imports of the node http module; the rule flags the module name. `src/wire.ts` and `src/context-types.ts` contain no runtime http usage at all.
- NET-007 src/index.ts:789 and src/trust-fence.ts:20,36: `new URL(...)` parse bases. In trust-fence they are `new URL('http://' + authority)` used purely to canonicalise a Host header for comparison (trust-fence.ts:19-22, 34-37); in index.ts the base `http://dsh.internal` exists only so `new URL(req.url)` can extract a pathname. No connection is made from any of them.
- NET-001 src/client/api.ts:67: relative same-origin fetch to the plugin's own route.
- NET-014 src/client/index.tsx:322: `store.patch(patch)` - a local state-store call; the rule matched the identifier `patch`.
- OBFU-010 src/index.ts:109 and src/client/index.tsx:270: base64 handling for image attachments. index.ts:107-110 decodes a browser-supplied base64 image into bytes that go straight to `ctx.attachments.saveImage`; index.tsx:265-275 is the encoding half (`btoa` over chunked `String.fromCharCode`). Data is never decoded into code.

### Negative claims and what was searched

Searched all of `src/` (7 TypeScript modules plus the client bundle sources, 3950 lines total) and
the build config: no `eval`, `new Function`, or `vm`; no `child_process` or any spawn; no
credential-file path of any kind; no outbound URL; no telemetry endpoint; no filesystem write
outside the single DSH-home record file; no obfuscation markers (source is unminified TypeScript
with doc comments throughout). `docs/` holds two GIFs and nothing executable.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke/idle run was performed. Static review covered every code path in `src/` but cannot rule out environment-dependent behavior.
- **The built `lib/` output vs `src/`.** The repository ships no `lib/`; it is produced by `tsdown` at install time via the `prepare` hook. We did not run the build and byte-compare its output against the sources. The install-time build is itself the largest unverified step here.
- **Peer dependencies.** Twenty `@deepseek-ai/dsh-*` peers plus `cordis`, `react`, and `schemastery` resolve on the user's machine at their own versions; no pinned OSV snapshot was joined against them.
- **The DSH host services this plugin drives.** `agents.create`, `permissionPresets.set`, `workspaceRegistry.archiveSession`, and `llm.stream` are the harness's own; their behavior is outside this artifact.
- **The `trustedHosts` fence in a non-loopback deployment.** The fence was read line by line but not exercised against a real reverse proxy or a hostile Origin.
- **Published-artifact comparison.** No npm package exists to diff against.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F on a
build-config false positive and eight type-import or URL-parse matches; both positions are recorded
in section 4 rather than hidden.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/heartmove/dsh-side-chat /tmp/side-chat-audit
cd /tmp/side-chat-audit && git rev-parse HEAD   # expect 9dda48d72d3b51589096e8b130d3dd83740531f7

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/side-chat-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rhoE "https?://[a-zA-Z0-9./_:-]+" src        # expect only http://dsh.internal
grep -rn "eval(\|new Function\|child_process" src  # expect zero hits
grep -rn "writeFile\|readFile" src                 # expect only the record file in src/index.ts
sed -n '56,70p' src/trust-fence.ts                 # the loopback/origin fence
sed -n '780,784p' src/index.ts                     # the fence applied before every dispatch
grep -n '"prepare"' package.json                   # the install-time build hook
```

## 8. Methodology and pinned inputs

- Subject: git commit `9dda48d72d3b51589096e8b130d3dd83740531f7` (shallow clone at reference/audits/dsh-side-chat)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 17 files scanned, 8 skipped
- Review: full read of src/trust-fence.ts (70 lines), src/wire.ts (81), src/context-types.ts (360), src/index.ts (808, read in full across the API table, agent creation, summarize, inject, settings, and route registration), src/settings-shared.ts (33), src/client/api.ts (112), targeted reads of src/client/index.tsx (1970) at every scanner hit, tsdown.config.ts, package.json, dsh.plugin.json, cordis.patch.yml, README.md
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: zero outbound network, zero credential access, zero dynamic execution, zero child processes after adjudication, which clears the A band on egress. B rather than A because of two material capabilities (agent creation with inherited permissions, injection into the parent conversation) plus one real install-time hook and a git-only, unattested distribution.

## 9. Strengths

1. The route fence is a deliberate, self-contained reimplementation of the harness's own `/api` gateway fence, with an explanatory comment saying exactly why it is copied (src/trust-fence.ts:1-6). Loopback check, cross-site marker refusal, and Origin/Host equality are all present (trust-fence.ts:56-70).
2. Request bodies are bounded before parsing, not after (src/wire.ts:26-33), and every payload field is narrowed through explicit `requireString` / `optionalBoolean` helpers (src/wire.ts:66-81) rather than trusted.
3. Method dispatch is a fixed table with a `method.includes('/')` guard, so no path traversal into the handler namespace is possible (src/index.ts:791-798).
4. The child session is archived *before* the first prompt is delivered, with a comment saying why (src/index.ts:416-417), so a side chat never leaks into the session list even transiently.
5. Zero outbound network. For a plugin whose whole job is conversational, this is the strongest single fact on the card.
6. Source is unminified, densely commented TypeScript; every non-obvious decision carries a rationale comment.

## 10. Residual risks

1. Install-time `prepare: tsdown` build. Anyone installing from a moving `main` executes the repo's build script at that moment; pin a commit.
2. Permission inheritance is faithful, which means a side chat launched from a `danger-full-access` conversation is itself `danger-full-access` (src/index.ts:405-411). The blast radius of a prompt injection in selected text is the parent's blast radius.
3. Bring-back injection (src/index.ts:589-600) moves model-authored text into the main conversation's context. Content is user-selected per action, but it is still model output crossing a trust boundary.
4. No published artifact, no attestation, no signed tag. Trust rests entirely on the git tree.
5. The `trustedHosts` escape from loopback-only comes from the deployment's `connection` loader row (src/index.ts:723-733). A deployment that lists a broad authority there widens this plugin's fence along with the harness's own.

## 11. Re-verify steps

1. Re-run the step 7 block against current HEAD. Any new URL literal, any `child_process` import, or any new filesystem write path must be re-adjudicated before this grade carries forward.
2. Re-read `src/trust-fence.ts` on every bump: it is a copy of upstream logic and can silently drift from the gateway it mirrors.
3. Watch `package.json` scripts for any hook beyond `prepare: tsdown`; a fetch-and-run install script is an automatic downgrade.
4. Watch `src/index.ts` agent-creation options (currently lines 369-412) for any preset widening that is not inherited from the parent.
5. If the project ever publishes to npm, add integrity and provenance rows to section 1 and diff the tarball against this commit.
