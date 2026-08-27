# Trust Report Card: @michengai/dsh-skills-manager

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@michengai/dsh-skills-manager` (DSH Web plugin: browse, import, enable/disable and delete skills across DSH and neighbouring agent CLIs) |
| Pinned subject | github:MichengAI/dsh-skills-manager @ commit `68296bf1de0b59dd22bade4dd28fe1aba067710f` (shallow clone, default branch head at audit time; package.json version 0.1.27) |
| npm integrity | not checked (see section 5) |
| Provenance | not verified; repo declares OIDC-based npm publish via GitHub Actions (docs/07-迭代归档/2026/I020-OIDC发布认证修正) but the published tarball was not compared |
| License | Apache-2.0 (LICENSE:1-3) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual review of lib/index.js, lib/core.js, lib/client.js, package.json, cordis.patch.yml) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local-only skills manager: it reads and writes skill directories under `~/.dsh`, `~/.agents`,
`~/.codex`, `~/.claude`, `~/.gemini` and `~/.config/opencode`, exposes that over a loopback-only
HTTP API on the host's own web server, and makes no outbound network calls, reads no credentials,
and executes no dynamic code in shipped files.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None outbound. The only `fetch()` in shipped code is the browser half calling the plugin's own same-origin API prefix `/api/dsh-skills-manager` (lib/client.js:91). The host half never opens a socket; the single URL construction is a parse helper with a dummy base (lib/index.js:297). Remaining NET hits are repository/homepage/registry metadata in package.json:8,11,13,48. | file:line above |
| HTTP surface (loopback) | One prefix route on the host's existing web server: `GET /api/dsh-skills-manager/state` plus POST mutations (lib/index.js:293-315). Every request is Host-validated against `localhost`/`127.0.0.1`/`[::1]` before dispatch (lib/index.js:94-97, 300-304); mutations additionally require a client marker header, blocking simple cross-origin form posts (lib/index.js:103-105). Non-GET/POST returns 405 (lib/index.js:311-315). | file:line above |
| Filesystem reads | Skill directories for six roots: DSH, shared Agents, Codex, Claude, Gemini, OpenCode, each overridable by `DSH_*_HOME` env vars (lib/core.js:64-72). Reads SKILL.md/frontmatter for listing. | lib/core.js:64-72 |
| Filesystem writes | Only the DSH root is marked `mutable: true`; the five agent roots are `mutable: false` (lib/core.js:65-71). Manager state and trash live under `<dsh home>/skills-manager` (lib/core.js:75-85); a log file at `<dsh home>/dsh-skills-manager.log` (lib/core.js:87-89). | file:line above |
| Credential reads | None. Grep for `auth.json`, `credential`, `api_key`/`apiKey`, `.ssh`, `.aws`, `keychain`, `token` across lib/*.js returned zero hits. The scanner's CRED findings are (a) i18n label strings naming the agents (lib/client.js:38,65) and (b) the `~/.claude/skills` and `~/.codex/skills` path joins (lib/core.js:68-69), which are skill directories, not credential stores. | grep, see section 4 |
| Child processes / shell | None. No `child_process`, `spawn`, or `exec` in lib/. | grep |
| Dynamic code execution | None in shipped files. The one `new Function` is in test/locale-test.mjs:45, a harness that evaluates the locale bundle in a fake window; `files` in package.json:22-28 ships only lib, assets, the patch and changelogs, so tests are not published. | package.json:22-28 |
| Telemetry | None. No analytics, beacon, or metrics code in lib/. | negative claim, scope: lib/*.js |
| Lifecycle hooks | `prepublishOnly: npm test` (package.json:45). Publisher-side only; no install/preinstall/postinstall entries exist. | package.json:41-46 |
| Runtime dependency | `fflate` 0.8.3, exact-pinned (package.json:76-78), used for ZIP handling on skill import. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 32 findings (26 high, 2 medium, 4 low), machine grade F, gates fired
`cred-plus-net`, `dynamic-exec-present`, `finding-density`. All three gates are false positives
against this artifact; adjudication below.

### Gate adjudication

| Gate | Machine reason | Adjudication |
|---|---|---|
| `cred-plus-net` | "Credential access and network egress co-occur in lib/client.js" | False positive. The CRED hits at lib/client.js:38,65 are localisation label maps (`"root.claude": "Claude"`). The NET hit at lib/client.js:91 is a same-origin call to the plugin's own `/api/dsh-skills-manager` prefix. No credential material exists in that file to send anywhere. |
| `dynamic-exec-present` | `new Function` present | False positive for shipped code: the only hit is test/locale-test.mjs:45, excluded from the published `files` list (package.json:22-28). |
| `finding-density` | NET family across 3+ files | False positive. The spread is package.json metadata URLs plus one same-origin client fetch. |

### Production-code findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| SKM-FS-1 | medium | lib/core.js:64-72 | Enumerates and reads five neighbouring agents' skill directories. Skill files can contain user-authored prompt content. Read-only for those roots (`mutable: false`); this is the plugin's stated purpose. |
| SKM-FS-2 | medium | lib/core.js:75-89, lib/index.js POST handlers | Write, disable and delete operations on the DSH skills root, with a trash directory rather than unlink-in-place (lib/core.js:83-85). Destructive by design, scoped to the DSH root. |
| SKM-NET-1 | low | lib/client.js:91 | Same-origin fetch to the plugin's own API. No external host. |
| SKM-HOOK-1 | low | package.json:45 | `prepublishOnly` runs the test suite. Publisher-side; not an install hook. |
| SKM-OBFU-1 | low | lib/core.js:1030 | `Buffer.from(raw, "base64")` decoding an uploaded skill archive. The surrounding code validates Base64 character-by-character and enforces a byte cap before decoding (lib/core.js:1015-1031). Decoded bytes are written as files, never executed. |

### Negative claims and what was searched

Searched lib/index.js (372 lines), lib/core.js (1285 lines), lib/client.js (218 lines),
package.json, cordis.patch.yml: no outbound HTTP, no credential file paths, no child process
spawning, no dynamic evaluation of decoded data, no telemetry, no writes outside the DSH skills
root and `<dsh home>/skills-manager`.

Path-safety defences read directly: `fs.realpath` canonicalisation of roots (lib/core.js:105,182),
containment check after resolution (lib/core.js:176, 195), `lstat` re-check per entry to narrow the
TOCTOU window (lib/core.js:120-125), symlink entries skipped in enumeration (lib/core.js:120-125,
424-428, 367-377), and an entry-name validator rejecting dot-prefixes, path separators, trailing
dot/space, and Windows device names (lib/core.js:20, 210).

## 5. What we could not check

- **Published npm tarball vs this git tree.** We graded the repository at the pinned commit. `npm view @michengai/dsh-skills-manager dist.integrity` was not fetched and no attestation was verified, so a divergent publish would not be caught by this card.
- **Behavioral probe.** No sandboxed load/activate/HTTP-exercise run was performed. Static review covered the route table and Host validation but did not send a real request, so the 403 paths are unexercised claims about code we read.
- **The `fflate` dependency.** Exact-pinned at 0.8.3 but not itself audited, and no OSV snapshot was joined.
- **The documentation set.** `docs/` is 5.9 MB and almost entirely Chinese-language iteration archives; individual iteration notes were not read except where cited. Claims here rest on source, not on those documents.
- **Client bundle UI behavior.** lib/client.js was grepped and its API surface read, but the React render path was not fully traced; a UI-side injection issue would not necessarily surface in this pass.
- **Cross-model review.** Single reviewer, one model.

## 6. Strengths

1. Loopback Host validation on every request including reads, with an explicit DNS-rebinding rationale in the comment (lib/index.js:94-97) and a second marker-header gate on mutations (lib/index.js:103-105).
2. Layered path safety: realpath containment, per-entry lstat re-check, symlink refusal, and a strict entry-name validator that also covers Windows device names (lib/core.js:20, 105, 120-125, 176, 210).
3. Deletion goes to a trash directory under the manager's own home rather than unlinking in place (lib/core.js:83-85).
4. Neighbouring agents' skill roots are read-only by construction (`mutable: false`, lib/core.js:66-71); only DSH's own root is writable.
5. Upload decoding validates Base64 and enforces a size cap before allocating, avoiding a regex that could blow the stack on multi-MiB input (lib/core.js:1015-1031).
6. No outbound network, no credentials, no child processes, no install hooks.

## 7. Residual risks

1. The loopback API is reachable by any process or page on the machine that can set the marker header; the Host check stops rebinding but not a local attacker or a malicious localhost page with scripted requests.
2. Skill import writes arbitrary user-supplied file trees under the DSH skills root. Names are validated and paths contained, but the content of a written skill is whatever the uploader supplied, and skills are prompt input to an agent.
3. Reading five neighbouring agents' skill directories widens the read surface to files those tools own; content stays local but is surfaced in the UI.
4. Published artifact not compared against this tree; provenance rests on the maintainer's release pipeline.
5. Chinese-language documentation and code comments make independent review harder for the English-speaking audience this catalog serves.

## 8. Methodology and pinned inputs

- Subject: git commit `68296bf1de0b59dd22bade4dd28fe1aba067710f` (shallow clone at reference/audits/dsh-skills-manager)
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`; 11 files scanned, 67 skipped
- Review: manual read of lib/index.js, lib/core.js (targeted reads across path-safety, upload, state and route sections), lib/client.js API surface, package.json, cordis.patch.yml, LICENSE
- Cross-model review: NOT performed (single reviewer). Card revision 1 is capped accordingly.
- Grade derivation: no high or critical production findings survive adjudication; all three scanner gates are false positives. Local-only behavior with no egress and no credential access would sit at A-, but the plugin holds delete-and-write authority over a skills root and reads five neighbouring tools' directories, and the published artifact was not compared against this tree. Net: **B**.

## 9. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/MichengAI/dsh-skills-manager /tmp/skm-audit
cd /tmp/skm-audit && git rev-parse HEAD   # expect 68296bf1de0b59dd22bade4dd28fe1aba067710f

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/skm-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
grep -rn "fetch(\|https\?://" lib/                    # egress: one same-origin call + metadata
grep -rn "auth\.json\|\.ssh\|\.aws\|keychain" lib/    # credentials: zero hits
grep -rn "child_process\|spawn\|eval(\|new Function" lib/   # exec: zero hits
sed -n '94,106p' lib/index.js                         # loopback Host + mutation marker gates
sed -n '64,72p' lib/core.js                           # the six skill roots and their mutability
```

## 10. Re-verify steps

1. Re-run the block above against the current HEAD. Any new literal URL in lib/, any new root added to `userRoots()`, or any root flipping to `mutable: true` must be re-adjudicated before this grade carries forward.
2. Diff `npm view @michengai/dsh-skills-manager dist.integrity` against a freshly pinned version, and confirm the tarball's lib/ matches the tagged tree; this card did not establish that link.
3. On any change to lib/index.js route handling, re-read `validateLoopbackHost` and the mutation marker check: weakening either turns a local-only API into a cross-origin-reachable one.
4. Watch package.json `scripts` for any install-time hook and `files` for the addition of test/ (which would ship the `new Function` harness).
5. Re-run the scanner after any heuristics-corpus bump; the corpus digest is recorded in section 8.
