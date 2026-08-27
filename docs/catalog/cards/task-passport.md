# Trust Report Card: task-passport

## 1. Header

| Field | Value |
|---|---|
| Plugin | `task-passport` (TaskPack: durable cross-harness task state; ships a DSH plugin, an MCP server, and a `taskpack` CLI) |
| Pinned subject | github:dongsheng123132/task-passport @ commit `c9c31c4caa63771f21919c27fd5a14b2a3eb511f` (2026-08-26) |
| npm integrity | `sha512-vwOtKwNwj29vPLSo9y5Dk8QqSm71mDH1VtFO2SsLrHfqxBk+iO9I9Zumi1hSpCvmlhDFvXq4fgDGf2CQatK03g==` (`registry.npmjs.org/task-passport/0.3.1`, fetched 2026-08-27) |
| Provenance | No attestation, but `gitHead` equals the pinned commit, and we downloaded and byte-compared the tarball (see section 4). |
| License | MIT (LICENSE present) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual read of all eight shipped modules + two executed proof-of-concept probes) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A thoughtfully written, network-free, offline handoff format whose DSH plugin surface is narrow and
safe, but whose pack-landing path contains a confirmed and reproducible zip-slip: `writeLuggage`
joins attacker-controlled zip entry names straight onto the output directory, so a malicious
`.taskpack` file writes anywhere the user can write, and it passes the bag's own integrity
verification while doing it.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. No `fetch`, no `http`/`https`/`net` import anywhere in the eight shipped modules. `https://taskpack.org/a2a/ext/taskpack/v1` (taskpack.js:34) is a spec identifier string, never requested. The README's offline claim holds in the code. | grep across bag.js, cli.js, core.js, index.js, mcp.js, outbox.js, store.js, taskpack.js |
| Child processes | One: `execFile(executable, ['action','run',<actionId>,'--json', ...])` to invoke the optional U-King binary (core.js:83-88). Structured argv, no shell, `windowsHide`, 10 s default timeout, 4 MB output cap. Candidates come from explicit config, `TASK_PASSPORT_UKING` / `UKING_EXECUTABLE`, and fixed platform install paths (core.js:12-35). Input is passed via a 0600 temp file that is removed in a `finally` (core.js:66-72, 96-98). | file:line above |
| Credential reads | None. No auth files, keychain, `.ssh`, or browser stores. `process.env` is read for three named `TASK_PASSPORT_*` variables plus the two U-King path variables; it is never enumerated in shipped code, and it is spread into the U-King child's environment (core.js:88). | grep of shipped modules |
| Filesystem writes | Passport JSON under the configured store directory (`--store`, `TASK_PASSPORT_STORE`, or the plugin's `storeDirectory` config), the outbound ledger under the store or `~/.task-passport` (outbox.js:39-45), a 0600 temp input file under `tmpdir()`, and unpacked luggage under the landing directory. The last of these is the finding at TP-SLIP-1. | store.js, outbox.js:39-45, core.js:66, bag.js:589-597 |
| Concurrency safety | Passport writes take an exclusive `open(path,'wx',0o600)` lock with liveness-checked stale-lock retirement (`process.kill(pid, 0)`, store.js:34-59) and a timeout. Checkpoints require an `expected_version` and reject stale writes rather than overwriting (index.js:139-141). | file:line above |
| Dynamic code execution | None. No `eval`, `new Function`, or `vm`. | grep across shipped modules |
| Telemetry | None. | grep across shipped modules |
| Lifecycle hooks | None. `package.json` scripts are `test`, `test:e2e:uking`, `check`, `pack:check` - no `preinstall`, `postinstall`, or `prepare`. | package.json:30-35 |
| DSH plugin surface | Four tools: `task_passport_list`, `task_passport_open` (both read-only), `task_passport_new`, `task_passport_checkpoint`. Writes are gated by an `allowCheckpoint` config flag that defaults to true but can be turned off per profile (index.js:12, 121, 142). Crucially, **the DSH plugin does not expose pack landing at all** - `index.js` imports only `core.js` and `store.js`, never `bag.js`. The zip-slip is reachable through the CLI and the MCP server, not through the DSH tools. | index.js:1-4, 72-146 |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0. Raw output: 933 findings. 885 of them are in
`videos/hackathon-demo/package-lock.json`, a Remotion demo project not shipped in the npm `files`
list. Restricting to the eight shipped modules and `package.json` leaves 10.

### Scanner findings adjudicated

| Finding | Severity (scanner) | Location | Adjudication |
|---|---|---|---|
| OBFU-006 x7 (`.replace(/^\uFEFF/, '')` before `JSON.parse`) | high | bag.js:252, cli.js:22/76/198, mcp.js:151, store.js:21, taskpack.js:64/111 | False positives. Every one strips a UTF-8 BOM before parsing, and store.js:20 carries the comment explaining why ("Windows shells emit UTF-8 with a BOM by default; JSON.parse rejects it"). Not obfuscation. |
| EXEC-004 `import { execFile }` | high | core.js:1 | Capability true; the single call site is adjudicated at TP-EXEC-1 below. |
| NET-007 `https://taskpack.org/a2a/ext/taskpack/v1` | high | taskpack.js:34 | False positive. A2A extension URI constant, never fetched. |
| SUPPLY-010 + NET-008 x3 | high/low | package.json:56, 59, 61 | False positives. `repository`, `bugs`, `homepage` metadata. |

### Findings from manual review (the scanner missed both of these)

| ID | Severity | Location | Note |
|---|---|---|---|
| **TP-SLIP-1** | **high** | bag.js:589-597 | **Confirmed path traversal (zip slip), reproduced.** `writeLuggage` does `join(directory, ...path.slice('data/files/'.length).split('/'))` with no containment check on the resulting absolute path. `luggagePath` (bag.js:44-52) does sanitize names, but it runs only on the **pack** side; the **unpack** side trusts the zip entry names it is given. The code comment at bag.js:585-588 explicitly claims the opposite ("the path traversal guard that `luggagePath` applied on the way in is only worth anything if nobody writes their own loop on the way out") - the guard is not applied on the way out. Reachable from `taskpack land/unpack/import` (cli.js:349, 382) and from the MCP land tool (mcp.js:305, 324). |
| **TP-VERIFY-1** | **high** | bag.js:226-257 | `verifyBag` does not reject traversal paths. We built a well-formed BagIt bag containing the payload entry `data/files/../../../../../../tmp/zs/ESCAPED2.txt`, recomputed `manifest-sha256.txt` and `tagmanifest-sha256.txt` so every digest matched, and `verifyBag` returned `{ ok: true, errors: [] }`. `writeLuggage` then wrote the file to `/tmp/zs/ESCAPED2.txt`, entirely outside the landing directory. Integrity verification passing on a traversal bag is what turns TP-SLIP-1 from a bug into a trap: the CLI checks `ok` before landing (cli.js:328-333) and is reassured. |
| **TP-PKG-1** | **medium** | package.json:18-29 | **The published 0.3.1 tarball is broken.** `outbox.js` is imported by both `mcp.js:8` and `cli.js:8` but is absent from the `files` allowlist. We downloaded `task-passport@0.3.1`, and `import('/tmp/tpk/package/mcp.js')` fails with `ERR_MODULE_NOT_FOUND: Cannot find module '.../outbox.js'`; `node cli.js --help` throws the same. Both `bin` entries and the `./mcp` export are non-functional as published. The DSH plugin entry (`index.js` to `core.js`/`store.js`) does not touch `outbox.js` and is unaffected. |
| TP-EXEC-1 | low | core.js:83-88 | Spawns the optional U-King binary. `execFile` with an argv array (no shell), `windowsHide`, timeout, `maxBuffer`. Executable resolution honors two environment variables and, for bare names without a separator, defers to PATH resolution (`canAccess` returns true for separator-free names, core.js:55-56). A hostile PATH entry named `u-king-mini` would be executed. |
| TP-ENV-1 | low | core.js:88 | The full parent environment is spread into the U-King child. Local inheritance, not exfiltration, but worth naming. |
| TP-LEDGER-1 | low | outbox.js:1-24 | The outbound ledger archives a full copy of every passport that leaves, under the store or `~/.task-passport`. The file's own header says plainly that it is not tamper-proof. Honest, and it does mean sent passport contents accumulate on disk. |

### Published-artifact comparison

We downloaded `task-passport@0.3.1` from npm and compared every shipped file against this commit:
`bag.js`, `core.js`, `store.js`, `index.js`, `mcp.js`, `cli.js`, `taskpack.js`, and `package.json`
all match by sha256. `gitHead` in the registry equals the pinned commit. The only discrepancy is the
missing `outbox.js` recorded at TP-PKG-1. This is a stronger provenance position than most plugins
in this catalog, despite the absence of a formal attestation.

### Negative claims and what was searched

All eight shipped modules were read (bag.js 599, cli.js 444, core.js 352, index.js 149, mcp.js 402,
outbox.js 156, store.js 208, taskpack.js 275 lines). No `eval`/`new Function`/`vm`; no network
imports or calls; no telemetry; no credential-path reads; no obfuscation (source is plainly written
and densely commented); no install-time lifecycle hooks. Not reviewed in depth, and not shipped:
`test/`, `examples/` (Foxit and Gemini demos, which do make network calls), `videos/`, and the
`.codebuddy-plugin` / `.workbuddy-plugin` manifests.

## 5. What we could not check

- **Behavioral probe of the DSH plugin.** No cordis load, no live tool invocation. The two probes we
  did run exercised `bag.js` directly in isolation, not the plugin in a harness.
- **U-King.** The optional external binary is closed third-party software that would hold the
  passport store when no `--store` is configured. Entirely outside this artifact.
- **The `examples/` tree.** `examples/foxit/*.mjs` and `examples/gemini/*` contain the majority of
  the non-lockfile scanner network hits. They are excluded from the npm `files` list and were not
  audited; anyone running them directly is running unreviewed code.
- **Whether TP-SLIP-1 is exploited in the wild.** We proved the mechanism, not that any pack abuses
  it. No malicious `.taskpack` file was found or sought.
- **Windows behavior.** Drive-letter handling in `luggagePath`, and the Windows U-King candidate
  paths, were read but not executed. On Windows, `join` treats `..` the same way, so TP-SLIP-1
  applies there too, likely with a wider reach.
- **The test suite.** Not run. Note that `test/bag.test.mjs` exists but evidently does not cover the
  traversal case, since the traversal works.
- **Whether the maintainer intends `outbox.js` to be shipped.** TP-PKG-1 is reported as an
  observation about the published artifact, not an inference about intent.

## 6. Reviewer disagreement

Single-reviewer pass (one model). The scanner and the manual review disagree in both directions
here: the scanner raised seven high findings that are BOM handling, and missed the two genuine high
findings entirely. Both positions are recorded in section 4.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/dongsheng123132/task-passport /tmp/tp-audit
cd /tmp/tp-audit && git rev-parse HEAD   # expect c9c31c4caa63771f21919c27fd5a14b2a3eb511f

sed -n '585,597p' bag.js     # writeLuggage: join() with no containment check
sed -n '44,52p'   bag.js     # luggagePath: the guard that only runs on the pack side
grep -rn "fetch(\|node:http\|node:net" bag.js cli.js core.js index.js mcp.js outbox.js store.js taskpack.js   # no egress
grep -n "execFile" core.js   # the one child process
grep -n "preinstall\|postinstall\|prepare" package.json   # none

# Reproduce TP-SLIP-1 / TP-VERIFY-1 (writes /tmp/zs/ESCAPED2.txt, outside the landing dir):
mkdir -p /tmp/zs && cd /tmp/zs && cat > poc.mjs <<'EOF'
import { assembleBag, writeZip, readZip, writeLuggage, verifyBag } from '/tmp/tp-audit/bag.js'
import { createHash } from 'node:crypto'
const sha = b => createHash('sha256').update(b).digest('hex')
const p = { spec:'task-passport-bag/0.1', kind:'handoff', packed_at:'2026-01-01T00:00:00Z',
  origin:{actor:'a',machine:'m',harness:'h'}, lineage:{root_id:'TP-1',from_version:0,chain:['TP-1@0']},
  note:'', passport:{id:'TP-1',title:'t',version:0}, asks:[], landing_checks:[] }
const e = assembleBag(p, [{ name:'ok.txt', data: Buffer.from('hi') }])
const evil = 'data/files/../../../../../../tmp/zs/ESCAPED2.txt'
const d = e.get('data/files/ok.txt'); e.delete('data/files/ok.txt'); e.set(evil, d)
const pay = [...e].filter(([k]) => k.startsWith('data/'))
e.set('manifest-sha256.txt', Buffer.from(pay.map(([k,v]) => `${sha(v)}  ${k}`).join('\n') + '\n'))
const tags = ['bagit.txt','bag-info.txt','manifest-sha256.txt'].map(n => [n, e.get(n)])
e.set('tagmanifest-sha256.txt', Buffer.from(tags.map(([k,v]) => `${sha(v)}  ${k}`).join('\n') + '\n'))
const re = readZip(writeZip(e))
console.log('verifyBag:', verifyBag(re))          # expect { ok: true, errors: [] }
console.log('landed:', await writeLuggage(re, '/tmp/zs/dest'))   # expect /tmp/zs/ESCAPED2.txt
EOF
node poc.mjs

# Reproduce TP-PKG-1 (published tarball is missing outbox.js):
cd /tmp && npm pack task-passport@0.3.1 && tar tzf task-passport-0.3.1.tgz | grep outbox   # no match
```

## 8. Methodology and pinned inputs

- Subject: git commit `c9c31c4caa63771f21919c27fd5a14b2a3eb511f` (shallow clone at
  reference/audits/task-passport)
- Scanner: dsh-bridge tools/scan 0.1.0
- Review: full read of bag.js, cli.js, core.js, index.js, mcp.js, outbox.js, store.js, taskpack.js,
  package.json, cordis.patch.yml
- Executed probes: two proof-of-concept scripts against `bag.js` (traversal through `writeLuggage`,
  and `verifyBag` accepting the same bag), plus `npm pack task-passport@0.3.1` with a per-file
  sha256 comparison against this commit
- Cross-model review: NOT performed (single reviewer)
- Grade derivation: start at A. Two high findings survived adjudication and were reproduced
  (TP-SLIP-1 arbitrary file write on unpack, TP-VERIFY-1 verification blessing the traversal bag),
  which caps the grade at **C**. It does not fall to D because the vulnerable path is not reachable
  from the DSH plugin surface (index.js never imports bag.js), the fix is small and local, and there
  is no egress, no dynamic execution, no credential access, and no install hook anywhere in the
  artifact.

## 9. Strengths

1. Genuinely offline. Zero network code in the shipped surface, and the README's claim matches the
   bytes.
2. The DSH plugin surface is minimal and correctly separated: four tools, two of them read-only, a
   per-profile write kill switch (`allowCheckpoint`, index.js:12), and no import of the vulnerable
   pack-landing module at all.
3. Optimistic-concurrency writes: checkpoints require the version read at open time and reject stale
   writes instead of overwriting (index.js:139-141).
4. Careful file locking with liveness-checked stale-lock retirement, `wx` exclusive create, and 0600
   mode (store.js:34-80).
5. Credential and transcript refusal at pack time: packing throws if a passport or a luggage file
   matches known secret shapes (bag.js:26, 168-172, 186-189).
6. `luggagePath` is a correct sanitizer (bag.js:44-52). The bug is that it is applied on only one
   side of the round trip, not that it is wrong.
7. Machine-scoped facts are downgraded at pack time, in the bytes, precisely so a third-party lander
   that forgets cannot import false verifications (bag.js:158-162). That is the right instinct, and
   it makes the unpack-side gap more surprising.
8. Unusual honesty in comments: outbox.js opens by stating that the ledger is not tamper-proof and
   that "a diary is not a notary".
9. Published tarball matches the pinned commit byte for byte on every file it does ship.

## 10. Residual risks

1. **Landing an untrusted `.taskpack` file can write anywhere the user can write** (TP-SLIP-1).
   Since packs are meant to be exchanged between people and machines, this is the exact threat model
   the format invites. Do not run `taskpack land` on a pack from someone you do not trust, and do
   not expose the MCP land tool to untrusted callers, until the join in bag.js:593 is fenced.
2. **`verifyBag` does not protect you here** (TP-VERIFY-1). A traversal bag verifies clean, so the
   `ok` check before landing gives false assurance.
3. **The published 0.3.1 CLI and MCP server do not run** (TP-PKG-1): `outbox.js` is missing from the
   tarball. Users installing from npm get two broken entry points; users installing from git do not.
4. Bare-name U-King candidates resolve through PATH (core.js:55-56), so a hostile PATH entry is
   executable.
5. The outbound ledger accumulates full copies of every passport that was ever packed, in plaintext
   under the store or `~/.task-passport`.
6. `examples/` contains unreviewed network-calling code that ships in the git repo but not on npm.
7. No formal provenance attestation, though `gitHead` and the byte comparison substantially close
   that gap for this version.

## 11. Re-verify steps

1. **Re-run the TP-SLIP-1 proof of concept in section 7 first.** If `writeLuggage` still returns a
   path outside the landing directory, this grade stands. A fix should resolve each target and
   reject anything not strictly inside `directory` (the same logic `luggagePath` already implies),
   and `verifyBag` should additionally reject any payload entry whose path contains `..` or is
   absolute. If both land, re-audit for a B.
2. Re-check `npm pack task-passport@<version> && tar tzf ... | grep outbox` on each release until it
   matches.
3. Re-run the per-file sha256 comparison of the tarball against `gitHead` on each release.
4. Confirm `index.js` still does not import `bag.js`. If pack landing is ever exposed as a DSH tool,
   TP-SLIP-1 becomes reachable from the agent surface and the grade must drop until fixed.
5. Check `package.json` for newly added lifecycle scripts on each bump.
