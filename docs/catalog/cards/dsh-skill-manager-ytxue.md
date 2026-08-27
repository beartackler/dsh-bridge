# Trust Report Card: dsh-skill-manager-ytxue

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-skill-manager-ytxue` (DSH web plugin: skill manager in the settings sidebar) |
| Pinned subject | github:YTxue/dsh-skill-manager-ytxue @ commit `f254f3005a446062e312144f27ed0820d38d4654` |
| npm integrity | Not published to npm at audit time; install path is the git repository. |
| Provenance | None (no release workflow, no attestation). |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + full manual read of lib/) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Does what it says with zero network egress, zero credential access and zero dynamic code
execution, but it exposes an unauthenticated local HTTP API that can enumerate any directory on
the machine and copy files into the DSH skills directory, and it silently rewrites your existing
skill files on every activation, so the grade is capped at C for the local attack surface rather
than for anything malicious.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None. The single `fetch` is a same-origin relative call to the plugin's own prefix `/api/skill-manager-ytxue` (lib/client.js:79). No absolute URL exists in `lib/`. | lib/client.js:79 |
| HTTP surface | One prefix route `/api/skill-manager-ytxue` (lib/index.js:190-193) with: GET `/state`, GET `/list-dir?path=`, POST `/check`, `/enable`, `/disable`, `/import`. No origin check, no loopback check, no token anywhere in the handler. | lib/index.js:190-243 |
| Filesystem reads | Arbitrary. `GET /list-dir?path=<anything>` calls `listDir(path)` (lib/index.js:205-207), which stats and `readdir`s any absolute path, plus a Windows A-Z drive probe (lib/core.js:620-662). Directory names, not file contents. | lib/core.js:620-662 |
| Filesystem writes | `<dshHome>/skills`, `<dshHome>/skill-pool`, plus `<dshHome>/skill-manager-ytxue.log` and `.checked.json` (lib/core.js:276-283, 380-410, lib/index.js:100-103). `importPath` copies from any user-named source path into those two directories (lib/core.js:556-586). Auto-fix rewrites `SKILL.md` frontmatter and can rename skill directories in place (lib/core.js:147-238). | file:line above |
| Automatic action on activation | `void initialAudit(dshHome, log)` runs on every `apply()` (lib/index.js:188) and rewrites non-conforming skill files without asking. It is idempotent (sha1 fingerprint state table) but it is still an unprompted write to user content. | lib/index.js:188, lib/core.js:305-360 |
| Session data access | Reads `ctx.sessions.list()` headers only, for `cwd`, `createdAt`, `origin` (lib/index.js:66-78). No transcript content is read. | lib/index.js:66-78 |
| Child processes | None. No `child_process` import in `lib/`. | grep of lib/ |
| Credential reads | None. No auth files, keychains, or env enumeration (only `process.env.DSH_HOME`, lib/index.js:32). | grep of lib/ |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`. | grep of lib/ |
| Telemetry | None. The log is a local append-only JSONL file at `~/.dsh/skill-manager-ytxue.log`. | lib/index.js:99-107 |
| Lifecycle hooks | None. `package.json` has no `postinstall`. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 3 findings (2 high), machine grade C. All of `lib/` was read in full (443 + 714 + 243
lines). The manual grade is also C, but for reasons the scanner did not find.

### Scanner findings adjudicated

| ID | Severity | Location | Adjudication |
|---|---|---|---|
| SM-NET-1 | none (dismissed) | lib/client.js:79 | `fetch("/api/skill-manager-ytxue" + path)` is same-origin and relative. `path` is chosen from a fixed set of literals in the client. No remote host exists in this plugin. |
| SM-SUPPLY-1 | low (kept) | package.json:22 | `repository.url` is repository metadata, not a dependency. The manifest declares no runtime dependencies. The real residual is that installing by git ref tracks a moving HEAD. |
| SM-NET-2 | info | package.json:22 | Same string, recorded as declared egress. |

### Findings the manual review added (scanner missed these)

| ID | Severity | Location | Note |
|---|---|---|---|
| SM-AUTH-1 | medium | lib/index.js:190-243 | No origin, referer, or loopback check on any route. Every other plugin we have graded at this level either checks `Origin` against `Host` (dsh-global-rules lib/index.js:24-32) or checks `request.socket.remoteAddress` (dsh-cloud-sync lib/index.js:6-13). This one does neither. A cross-site POST from any page in the user's browser can reach `/enable`, `/disable`, and `/import`, because those handlers accept `content-type: application/json` without a preflight-defeating check and never verify the caller. |
| SM-FS-1 | medium | lib/index.js:210, lib/core.js:620-662 | `GET /list-dir?path=` is an unauthenticated directory enumerator for the whole filesystem, including a Windows drive-letter probe. Cross-origin reads of the JSON response are blocked by the browser's same-origin policy, so this is an exposure amplifier rather than a direct read primitive, but it is a filesystem oracle on any host binding that is not loopback-only. |
| SM-FS-2 | medium | lib/core.js:556-586 | `POST /import` with `{ source, target: "skills", conflict: "overwrite" }` copies a caller-named path into the live skills directory and deletes any same-named entry first (`rm(a.dest, { recursive: true, force: true })`, lib/core.js:480). Skills are model instructions, so writing there is an instruction-injection primitive. |
| SM-WRITE-1 | low | lib/index.js:184, lib/core.js:147-238 | Activation rewrites user skill frontmatter without consent: renames non-kebab directories (core.js:171-188), overwrites `name` (core.js:196-200), inserts a placeholder `description` (core.js:202-206), and deletes unrecognized boolean fields (core.js:217-233). Idempotent and logged, but destructive to hand-written content and not undoable from the UI. |

### Negative claims and what was searched

All of `lib/` (1400 lines), `package.json`, `cordis.patch.yml`, `test/core-test.mjs`,
`PRIVACY-CHECKLIST.md`, `PUBLISH.md`, `README.md` were read. No `eval`/`new Function`/`vm`, no
`child_process`, no base64-decoded code, no obfuscation, no telemetry endpoint, no absolute URL in
shipped code, no `.ssh`/`.aws`/browser/keychain reads, no session transcript reads (headers only),
no install-time hooks, no timers except none at all.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/invoke run. In particular we did not measure
  whether a cross-site POST actually reaches the routes on a default DSH install: that depends on
  the host `webServer` bind address and any host-level CSRF middleware, both outside this repo.
- **Host web server exposure.** Whether the DSH web server binds loopback-only, and whether it
  adds its own origin checks in front of plugin routes, was not verified. If it does, SM-AUTH-1
  and SM-FS-1 drop to low.
- **Published artifact.** Not on npm; no tarball integrity and no provenance attestation to check.
- **The `install.ps1` path** referenced in `PRIVACY-CHECKLIST.md` section 6 is not present in this
  commit; we could not review it.
- **Tests were not executed**, only read.
- **The auto-fix on real user skills.** We did not run `auditSkills` against a populated skills
  directory, so the rename and rewrite behavior is described from source, not observed.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner and the manual review both land on C, but for different reasons:
the scanner on `fetch` and git-URL heuristics (both dismissed above), the reviewer on missing
request authentication and a filesystem-wide list endpoint. Both positions are recorded.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/YTxue/dsh-skill-manager-ytxue /tmp/sm-audit
cd /tmp/sm-audit && git rev-parse HEAD   # expect f254f3005a446062e312144f27ed0820d38d4654

grep -rn "eval(\|new Function\|vm\.\|child_process" lib     # expect no output
grep -rhoE "https?://[a-zA-Z0-9./_-]+" lib                  # expect no output
grep -n "origin\|remoteAddress\|referer" lib/index.js       # expect no request-auth hits
sed -n '205,208p' lib/index.js                              # /list-dir takes any path
sed -n '476,482p' lib/core.js                               # import overwrite deletes target
sed -n '186,190p' lib/index.js                              # audit runs on activation
```

## 8. Methodology and pinned inputs

- Subject: commit `f254f3005a446062e312144f27ed0820d38d4654`, shallow clone at
  `reference/audits/dsh-skill-manager-ytxue`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`.
- Review: full read of `lib/index.js` (243), `lib/core.js` (714), `lib/client.js` (443),
  `package.json`, `cordis.patch.yml`, `PRIVACY-CHECKLIST.md`, `PUBLISH.md`, `README.md`.
- Cross-model review: NOT performed (single reviewer).
- Grade derivation: no egress, no credentials, no exec, no obfuscation, no hooks (A-band code
  behavior). Capped to C by three medium local-surface findings: unauthenticated mutating routes
  (SM-AUTH-1), whole-filesystem directory enumeration (SM-FS-1), and caller-directed copy into the
  model-instruction directory (SM-FS-2). Adding an origin or loopback check would lift this to B
  immediately.

## 9. Strengths

1. Zero runtime dependencies and zero network egress; the entire plugin is three readable files.
2. Path discipline in the skill operations: names must match `KEBAB_RE` before enable/disable
   (lib/core.js:384, 400), and destinations are always built from `dshHome` joins, never from
   caller-controlled path fragments.
3. Body size cap (1 MiB) before JSON parse (lib/index.js:109-137).
4. Local audit trail: every enable/disable/import/fix is appended to
   `~/.dsh/skill-manager-ytxue.log` with a timestamp, and log failures do not break the operation.
5. The project ships its own `PRIVACY-CHECKLIST.md` stating the intended data-flow boundary. It
   overstates the case ("路径严格限定 skills/ 与 skill-pool/" is true for writes but not for the
   `list-dir` read path), but publishing a checkable claim at all is better than the median.
6. Project-scope skills are read-only in the UI and excluded from auto-fix (lib/core.js:664-700).

## 10. Residual risks

1. Any web page open in the same browser can attempt state-changing POSTs to this plugin's routes.
   There is no CSRF defense in the plugin.
2. `/list-dir` is a filesystem structure oracle with no path restriction.
3. `/import` with `overwrite` recursively deletes the destination entry before copying. A wrong
   `source` value destroys the same-named installed skill.
4. Auto-fix mutates hand-written skill files on activation with no dry-run and no undo.
5. Installing by git ref tracks a moving HEAD; no npm artifact, no provenance, single maintainer,
   12 stars at audit time.
6. UI copy and all code comments are Chinese-only.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any new absolute URL, any `child_process`
   import, or any new route in `apply()` must be re-adjudicated.
2. Check whether request authentication was added: grep `lib/index.js` for `origin`,
   `remoteAddress`, or `sec-fetch-site`. If a same-origin or loopback guard now gates the POST
   routes, SM-AUTH-1 clears and the grade should be revised to B.
3. Check whether `listDir` gained a path allowlist. If it is restricted to `dshHome` and
   user-configured project roots, SM-FS-1 clears.
4. Re-check `initialAudit` for a consent gate or dry-run default (SM-WRITE-1).
5. If the project publishes to npm, add tarball integrity and provenance to the header and
   compare the published artifact against this commit.
