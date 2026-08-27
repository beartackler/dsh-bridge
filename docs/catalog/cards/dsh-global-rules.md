# Trust Report Card: dsh-global-rules

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-global-rules` (DSH web plugin: edit `~/.dsh/AGENTS.md` from the settings panel) |
| Pinned subject | github:badai147/dsh-global-rules @ commit `2ed39cc22c636d09ed7b65c30805a523fc713f04` |
| npm integrity | `sha512-UU8aYgUobmtayT5lZCn+Ojjvd5e97qsF6/45Kxk0VAGXmGVxTMW3LVMOIh4DF+NXCJ8c+Ig2rR/A2FT3rR+HpA==` (`registry.npmjs.org/dsh-global-rules/0.1.0`, fetched 2026-08-27). Registry `gitHead` is `c2ed6c335870b1cff9342262f9b0d9de0fd76a97`, which is **not** the audited commit. |
| Provenance | None. No npm attestation, no release workflow. Published by `badai147 <badai147@163.com>`. |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of both source files) |
| Revision | 1 |
| Grade | **A** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Two files, 237 lines total, that read and write one file (`~/.dsh/AGENTS.md`) over a host-local
HTTP route: no network egress, no credential access, no child processes, no dynamic code
execution, no lifecycle hooks, and the write path is CSRF-guarded by a same-origin check.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The only `fetch` calls are same-origin requests to the plugin's own route `/global-rules` from its settings panel (lib/client.js:55, lib/client.js:77). No absolute URL appears anywhere in `lib/`. | lib/client.js:55,77 |
| Filesystem | Reads and writes exactly one path: `join(homedir(), '.dsh', 'AGENTS.md')` (lib/index.js:46). No other path is constructed; no directory traversal input reaches the path (the route takes only `content`). | lib/index.js:46, 71-77 |
| HTTP surface | One exact route `/global-rules` on the host's own web server (lib/index.js:48-50). GET returns the file content; POST writes it; anything else returns 405 (lib/index.js:85). Body capped at 256 KiB (lib/index.js:13, 39). POST requires `Origin` host to equal `Host` (lib/index.js:24-32, enforced at 64). | lib/index.js |
| Child processes | None. No `child_process` import. | grep of lib/ |
| Credential reads | None. No auth files, keychains, env enumeration. | grep of lib/ |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`. The client half is a hand-written `__ModuleLoader__` factory whose only `require` is `react` (lib/client.js:4, 10). | lib/client.js |
| Telemetry | None. | grep of lib/, package.json |
| Lifecycle hooks | None. `package.json` declares no `scripts` field at all. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 5 findings (3 high), machine grade C. Both source files were read in full (146 + 91
lines); the manual grade is A.

### Findings adjudicated

| ID | Severity | Location | Adjudication |
|---|---|---|---|
| GR-NET-1 | none (dismissed) | lib/client.js:55 | `fetch("/global-rules")` is a same-origin relative path to the plugin's own route. Scanner flags every `fetch` as potential egress; there is no remote host. |
| GR-NET-2 | none (dismissed) | lib/client.js:77 | Same, the POST save path. |
| GR-SUPPLY-1 | low (kept) | package.json:18 | `repository.url` is a git URL. This is repository metadata, not a dependency; the manifest declares no `dependencies` at all. Real residual: installing by git ref tracks a moving HEAD, so pin a commit. |
| GR-NET-3/4 | info | package.json:18, 20 | GitHub repository/homepage metadata strings. |

### Negative claims and what was searched

Everything shipped is `lib/index.js`, `lib/client.js`, `package.json`, `cordis.patch.yml`, and
`README.md`; all were read. No `eval`/`new Function`/`vm`, no base64-decoded code, no obfuscation
(the client bundle is hand-written and readable), no telemetry, no writes outside
`~/.dsh/AGENTS.md`, no `.ssh`/`.aws`/browser/keychain reads, no timers, no install hooks.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run was performed. Static review only.
- **Published artifact.** `dsh-global-rules@0.1.0` exists on npm but its registry `gitHead`
  (`c2ed6c33...`) does not match the audited commit (`2ed39cc2...`), and there is no provenance
  attestation. This card grades the git tree only. We did not download or diff the npm tarball, so
  the published package is explicitly out of scope: do not carry this grade to `npm i
  dsh-global-rules`.
- **Host web server exposure.** Whether `/global-rules` is reachable from anything other than
  loopback depends on the DSH host's `webServer` bind address, which is outside this repository.
  The plugin adds no bind-address check of its own (contrast with dsh-cloud-sync, which checks
  `request.socket.remoteAddress`).
- **The GET path has no origin check.** Whether that matters depends on host binding, which we
  did not measure.
- **Downstream effect of the file.** `AGENTS.md` content is injected into every DSH session by the
  host. What the host does with it was not audited here.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded C on `fetch`-family heuristics; the manual read found
those calls are same-origin. Both positions are recorded above.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/badai147/dsh-global-rules /tmp/gr-audit
cd /tmp/gr-audit && git rev-parse HEAD   # expect 2ed39cc22c636d09ed7b65c30805a523fc713f04

grep -rn "eval(\|new Function\|vm\.\|child_process" lib          # expect no output
grep -rhoE "https?://[a-zA-Z0-9./_-]+" lib                       # expect no output
grep -n "homedir\|writeFile\|readFile" lib/index.js              # one file path only
sed -n '24,32p' lib/index.js                                     # same-origin guard on POST
node -e "console.log(Object.keys(require('/tmp/gr-audit/package.json')))" | grep -c scripts  # 0
```

## 8. Methodology and pinned inputs

- Subject: commit `2ed39cc22c636d09ed7b65c30805a523fc713f04`, shallow clone at
  `reference/audits/dsh-global-rules`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`.
- Review: full read of `lib/index.js` (91 lines), `lib/client.js` (146 lines), `package.json`,
  `cordis.patch.yml`.
- Cross-model review: NOT performed (single reviewer).
- Grade derivation: no production findings after adjudication; zero declared egress; smallest
  possible attack surface. A band. The git-ref install path is noted as a residual, not a finding
  against the code.

## 9. Strengths

1. Minimal by construction: one route, one file path, no dependencies, no build step.
2. CSRF-aware: POST requires `Origin` host to match `Host`, and rejects with 403 otherwise
   (lib/index.js:24-32, 64-68).
3. Body size cap before parse (lib/index.js:36-41), so a large POST cannot exhaust memory.
4. Honest error handling: `ENOENT` is reported as `exists: false` rather than as a failure, and
   error strings are the raw `Error.message`, not stack dumps (lib/index.js:57-62).
5. The client bundle is hand-written and human-readable rather than minified, so the shipped code
   is the reviewable code.

## 10. Residual risks

1. Installing by git ref tracks a moving HEAD. Pin a commit.
2. The plugin's whole purpose is to write the file that becomes every session's system-level
   instructions. Anyone who can reach the route can rewrite your global agent instructions. The
   POST origin check is the only barrier, and it depends on the host being loopback-bound.
3. GET has no origin check, so the file content is readable by any request that reaches the port.
4. The npm package at the same version points at a different commit than the one audited here,
   and carries no provenance attestation. Single maintainer, 11 stars at audit time.
5. UI copy is Chinese-only; English speakers get an unlabelled textarea.

## 11. Re-verify steps

1. Re-run the section 7 block against the current HEAD. Any new literal URL, any new `require`
   in the client factory, or any new `scripts` key in `package.json` is a new finding.
2. Confirm the same-origin guard still gates POST (`sameOrigin` called before `writeFile`).
3. Confirm the file path is still a single constant join and never takes user input.
4. Diff `npm view dsh-global-rules gitHead` against the audited commit. It differs today; if a
   future release makes them match, the npm tarball becomes in-scope and should be unpacked and
   compared byte-for-byte before this grade is extended to it.
