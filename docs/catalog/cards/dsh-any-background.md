# Trust Report Card: dsh-any-background

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-any-background` (appearance plugin: theme color wheel, wallpaper image/video, per-surface opacity and blur) |
| Pinned subject | github:Tkingxiao/dsh-any-background @ commit `e68455ab004cf15c803a0a3b826ddbc7e9c2cc97` (shallow clone HEAD, committed 2026-08-25), package version 0.2.1 |
| npm integrity | Not checked. The subject is the git tree; no registry artifact was fetched. |
| Provenance | Not established (no attestation checked). |
| License | MIT (LICENSE:1) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual source review) |
| Revision | 1 |
| Grade | **A-** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local-only theming plugin: every `fetch` call targets a same-origin route the plugin itself
registers, the Node half reads and writes only inside `~/.dsh/.dsh-any-background-data/`, and there
is no credential access, no child process, no dynamic code execution, and no remote endpoint
anywhere in the source.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None off-machine. Three `fetch` calls exist and all three are same-origin relative paths: the video upload route `/dsh-any-background/video/upload` (src/client/rpc.ts:8, 91) and two reads of the plugin's own serve URL or an in-memory data URL when exporting/importing a theme (src/client/index.tsx:354, 404). No absolute `http(s)` URL exists in `src/` or `lib/` other than package.json metadata. | file:line above; `grep -rhoE 'https?://' src/ lib/` returns only w3.org SVG namespaces |
| Host routes | Two, both under its own prefix: `GET/HEAD /dsh-any-background/video` (streams the stored video, supports Range) and `POST /dsh-any-background/video/upload` (accepts raw bytes). Plus an RPC channel `/dsh-any-background` registered with `authority: 'trusted-host'`, deliberately not on the shared `/api`. | src/index.ts:436-441, 24-26 |
| Child processes | None. No `child_process` import anywhere. | grep across src/, lib/ |
| Credential reads | None. No `process.env` read in shipped source, no home-directory credential path, no auth files. Storage location comes from `@deepseek-ai/dsh-home-paths`. | src/index.ts:17, 92-95; grep |
| Filesystem writes | Confined to `~/.dsh/.dsh-any-background-data/`: `theme-config.json`, `wallpaper.jpg`, and one video file whose name is chosen from a fixed five-entry MIME allowlist (`videoFileName` switch, default `wallpaper.video`). Uploads land in a temp file and are renamed into that slot. No user-supplied string ever reaches a path join. | src/index.ts:28-38, 92-96, 256-270, 350-405 |
| Dynamic code execution | None. No eval, no `new Function`, no `vm`. | grep |
| Telemetry | None. No analytics or beacon code in src/ or lib/. | negative claim, scope stated |
| Lifecycle hooks | No `install`/`postinstall`/`prepare` scripts. `scripts` holds only `bundle`, `watch`, `typecheck`. `ctx.on('dispose')` unregisters the two routes and the RPC handler. | package.json scripts; src/index.ts:442-447 |

Where user media goes: images arrive as base64 data URLs over the plugin's private RPC channel and
are strictly validated (`/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/`) before being
decoded to `wallpaper.jpg`. Videos bypass base64 and stream as raw bytes to the upload route, which
rejects any `Content-Type` not starting with `video/`. Nothing leaves the host.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 20 findings (2 critical, 13 high, 5 low), machine grade F, gates
`cred-plus-net-package` and `finding-density`. Adjudication:

| Finding | Adjudication | Evidence |
|---|---|---|
| CRED-006 critical x2, tsdown.config.ts:56-57 | False positive. `define: { 'process.env.NODE_ENV': ... }` is a bundler substitution table in the build config, not runtime environment enumeration. tsdown.config.ts is a dev file and is not in package.json `files`. | tsdown.config.ts:55-58; package.json files list is `lib/index.js`, `lib/invariant.js`, `lib/client.js`, `lib/client.js.map`, `cordis.patch.yml` |
| The `cred-plus-net-package` gate that produced grade F | Falls with CRED-006. With no credential finding, the "credentials plus egress in one package" premise does not hold. | above |
| NET-001 x3 (lib/client.js:555, 5034, 5073 and their src equivalents src/client/rpc.ts:91, src/client/index.tsx:354, 404) | Kept but benign. All three fetch relative same-origin paths registered by this plugin, or a `data:` URL held in memory. No host is reachable that the DSH web server does not already serve. | src/client/rpc.ts:8, 91; src/client/index.tsx:351-358, 402-406 |
| NET-007 x6 (lib/client.js:2554, 5148, 5153; src/client/components/icons.tsx:8; src/client/index.tsx:485, 490) | False positive. All are the SVG XML namespace `http://www.w3.org/2000/svg` passed to `createElementNS`/`setAttribute`. Namespaces are identifiers, not fetch targets. | lines read directly |
| SUPPLY-010 + NET-008 x3, package.json:14,16,20 | False positive. These are the `repository`/`homepage`/`bugs` metadata fields, not a dependency spec. Every real dependency is a semver range on a registry package. | package.json dependencies, peerDependencies |
| HOOK-003 low x2, src/index.ts:447 (lib/index.js:505) | Kept, benign. `ctx.on('dispose')` runs at teardown and only calls the three disposers. Nothing fires before user consent. | src/index.ts:442-447 |

### Negative claims and what was searched

Searched all of `src/` (18 files) and `package.json`, `cordis.patch.yml`, `tsdown.config.ts`; read
`src/index.ts` in full (452 lines) and `src/client/rpc.ts` in full: no eval/new Function/vm; no
child_process; no `process.env` at runtime; no writes outside the plugin's own data directory; no
`.ssh`/`.aws`/keychain/browser-store access; no telemetry; no install-time hooks. `lib/` is the
bundled output of `src/`; findings in `lib/` map one-to-one onto the `src/` findings adjudicated
above.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/upload/idle run was performed; static review
  cannot rule out environment-dependent behavior.
- **Bundle vs source.** `lib/client.js` and `lib/index.js` are committed build outputs. The line
  numbers and call shapes match `src/` at every point checked, but the bundle was not rebuilt with
  tsdown and byte-compared. `lib/client.js.map` ships, which makes such a comparison feasible.
- **Published artifact.** No npm tarball fetched; no integrity or provenance recorded.
- **Upload route authorization.** `handleVideoUpload` validates method and MIME but performs no
  origin, size, or session check of its own. Whether the DSH web server applies auth in front of
  plugin-registered routes was not determined from this repo. See residual risk 1.
- **Dependency tree.** Peer deps (`@deepseek-ai/*`, react) resolve on the user's machine and were
  not joined against an advisory snapshot.

## 6. Reviewer disagreement

Single-reviewer pass (one model, no second adversarial model). The scanner graded F, driven by two
critical findings in a build config; the manual verdict is A-. Both positions are in section 4.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/Tkingxiao/dsh-any-background /tmp/anybg-audit
cd /tmp/anybg-audit && git rev-parse HEAD   # expect e68455ab004cf15c803a0a3b826ddbc7e9c2cc97

grep -rhoE "https?://[a-zA-Z0-9./_-]+" src/ | sort -u        # only w3.org namespaces
grep -rn "fetch(" src/                                        # 3 hits, all relative paths
grep -rn "child_process\|eval(\|new Function\|vm\." src/      # none
sed -n '28,38p' src/index.ts                                  # video filename comes from a fixed switch
sed -n '256,270p' src/index.ts                                # wallpaper data URL regex-validated
sed -n '355,372p' src/index.ts                                # upload rejects non-video/* Content-Type
```

## 8. Methodology and pinned inputs

- Subject: git commit `e68455ab004cf15c803a0a3b826ddbc7e9c2cc97` (shallow clone at
  reference/audits/dsh-any-background)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 35 files, 635604 bytes
- Review: full read of `src/index.ts` (452 lines) and `src/client/rpc.ts` (100 lines); targeted read
  of `src/client/index.tsx` export/import paths, `tsdown.config.ts`, `package.json`,
  `cordis.patch.yml`; exhaustive grep of `src/` and `lib/` for network, exec, credential, and
  filesystem primitives; every scanner finding opened at its cited line
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no production finding survived adjudication as harmful; zero off-machine
  egress; storage confined to one plugin-owned directory with allowlisted filenames. That is the A
  band. Held to A- rather than A because the plugin registers a write-accepting HTTP route
  (`POST .../video/upload`) whose authorization depends entirely on the host web server, and
  because the committed `lib/` bundle was not rebuilt and compared.

## 9. Strengths

1. No off-machine network surface at all: every fetch is a relative path to a route this plugin
   registers.
2. Path construction is closed. Video filenames come from a five-case `switch` over MIME, wallpaper
   is a fixed name, and the data directory comes from `dshHomePath`. No request value reaches a
   path join, so there is no traversal surface.
3. Input validation before decode: strict base64 data-URL regexes for both image and video RPC
   payloads, and a `video/*` Content-Type check on the raw upload.
4. Deliberate channel hygiene: the RPC namespace is its own `/dsh-any-background` channel with
   `authority: 'trusted-host'`, explicitly kept off the shared `/api` so DSH slash commands are not
   affected (documented in the file header and matching the code).
5. Careful upload handling: temp file plus rename, cleanup on `aborted`/`error`, and an explicit
   Windows `EEXIST` workaround. Route registration is disposed on teardown.

## 10. Residual risks

1. The upload route accepts any `video/*` POST with no size cap and no auth of its own. If the DSH
   web server is exposed beyond loopback and does not gate plugin routes, an unauthenticated
   attacker on the network can overwrite the stored wallpaper video and fill the disk. This is the
   single largest residual surface.
2. Stored media is written with default permissions in the user's `~/.dsh` tree; no explicit 0600
   or 0700 mode is set.
3. Wallpapers and videos persist as plaintext files under `~/.dsh`; a user setting a sensitive
   image leaves it readable to anything with that user's filesystem access.
4. The committed `lib/` bundle carries provenance only from the author's build, not from a
   reproduced one.
5. Client theme state is exported and imported as data URLs; importing an untrusted theme file
   writes attacker-chosen media to disk, though the MIME allowlist bounds what filename results.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL, any `child_process` or
   `process.env` appearance in `src/`, or any new `ctx.webServer.register` call must be
   re-adjudicated before this grade carries forward.
2. Re-read `handleVideoUpload` for a size cap or an added auth check. Adding either should raise
   the grade; removing the MIME check should lower it.
3. On version bumps, diff `package.json` `files` and `scripts` (any new lifecycle hook is a
   finding) and re-check `videoFileName` for a case that derives a name from input rather than a
   literal.
4. Rebuild with `pnpm bundle` and diff against the committed `lib/` to close the bundle-vs-source
   gap noted in section 5.
5. Re-run the scanner after a heuristics-corpus bump; the corpus digest is in section 8.
