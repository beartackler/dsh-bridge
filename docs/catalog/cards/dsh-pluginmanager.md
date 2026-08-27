# Trust Report Card: dsh-pluginmanager

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-pluginmanager` (layered plugin manager for the DSH web profile: classify, enable/disable, uninstall, edit descriptions) |
| Pinned subject | github:buhuikongpan/dsh-pluginmanager @ commit `de79f77748d0a60106650cfb37d9ce020663171d` (2026-08-20) |
| npm integrity | Not published to npm (`npm view dsh-pluginmanager` returns 404, checked 2026-08-27). Install is from git. |
| Provenance | None. No registry artifact, no attestation, no LICENSE file in the tree (package.json:33 declares MIT). |
| License | MIT per package.json:33; no LICENSE file shipped |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual read of lib/index.js 1311 lines and lib/client.js 796 lines) |
| Revision | 1 |
| Grade | **B** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A local plugin-administration UI with no network egress, no credential access, and no telemetry,
whose real power is that it can uninstall plugins by invoking the official `dsh plugin remove` CLI
and rewrite the profile's `cordis.patch.yml`; the destructive paths are guarded (name allowlist
regex, self-uninstall refusal, mutation lock, patch backups, CLI-first ordering), and the single
`new Function` call is a narrow, well-scoped preset-expression evaluator rather than a loader for
untrusted code.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | None from this plugin's own code. No `fetch`, no `http`/`https` import, no URL literal that is requested. Network traffic does occur indirectly: `dsh plugin add/remove` forwards to pnpm, which contacts the registry, and the failure classifier explicitly recognizes registry fetch errors (lib/index.js:648, 682-687). That is the official CLI's traffic, not this plugin's. | grep for `fetch(`/`http` across lib/ returns one UI description string (lib/index.js:460) and nothing else |
| Child processes | `spawn` is used twice. (1) `spawn(file, [...args, "plugin", "--profile", profile, ...pluginArgs])` to run the DSH CLI (lib/index.js:710-716). (2) `spawn("taskkill", ["/pid", ...])` on Windows to kill a timed-out child (lib/index.js:624). Both use argv arrays. `shell: true` is used only on Windows, and only because bare `dsh` is a `.cmd` shim (lib/index.js:617). | lib/index.js:610-620, 700-730 |
| Command-argument validation | Before spawning, the last CLI argument is checked against `/^[A-Za-z0-9@:./_#+-]+$/` and rejected otherwise (lib/index.js:705-708); all remote-callable entry points pass names through `validName()`, an npm-package-name regex that throws on anything else (lib/index.js:1302-1308). Even so, the Windows path can set `shell: true` (lib/index.js:617); the allowlist regex excludes shell metacharacters (no spaces, quotes, `&`, `\|`, `;`, backticks, `$`), which is what makes that combination safe here. | lib/index.js:617, 705-708, 1302-1308 |
| Credential reads | None. No `auth.json`, `.ssh`, `.aws`, keychain, or browser-store path anywhere in lib/. `process.env` is read for `DSH_HOME` only (lib/index.js:32) and spread into the CLI child's environment with `CI: "true"` added (lib/index.js:712). | grep of lib/ for credential paths: zero hits |
| Filesystem writes | Confined to the DSH profile directory `$DSH_HOME/profiles/web` (lib/index.js:31-50): `cordis.patch.yml` (rewritten on enable/disable/uninstall, lib/index.js:886-889, 986-989), timestamped `cordis.patch.yml.bak-<ISO>` backups before each write (lib/index.js:1293-1300), `plugin-manager/descriptions.json` written atomically via temp+rename (lib/index.js:66-71), and `rmSync` limited to files matching `/^hot-\d+\.yml$/` inside the plugin's own `plugin-manager/hot` directory (lib/index.js:88-99). No delete touches user data or node_modules directly. | file:line above |
| Dynamic code execution | One `new Function("process", "return (" + expr + ")")` at lib/index.js:298, reached only when a preset YAML row's `disabled:` value matches `/^!!js\s+(.+)$/` (lib/index.js:293). The only argument exposed is a synthetic object with `platform`, `arch`, `version` (lib/index.js:299-300); errors are swallowed and treated as enabled. Input comes from the DSH agent-preset YAML on the local disk, which is host-shipped config, not remote content. | lib/index.js:281-306 |
| Telemetry | None. No analytics, beacon, or reporting code in either file. | grep across lib/ |
| Lifecycle hooks | None. `package.json` declares no `scripts` block, so nothing of this author's runs at install time. | package.json (full read) |
| Browser-side surface | Client bundle is React UI. It injects a `<style>` tag with a static CSS string (lib/client.js:10-19), and uses `navigator.clipboard.writeText` to copy a locally-composed "AI fix prompt" (lib/client.js:246-247). No `innerHTML`, no `eval`, no `fetch` to third parties. | lib/client.js:10-19, 240-252 |

The AI fix prompt is composed locally from the profile path, plugin name, and diagnosis text
(lib/index.js:1162-1168) and is placed on the clipboard for the user to paste. It is not sent
anywhere. Note it does contain the absolute profile directory path, which is a local-path
disclosure if the user pastes it into a remote assistant.

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0. Raw output: 4 findings (2 critical, 2 high), all in
`lib/index.js`. Adjudication:

| Finding | Severity (scanner) | Location | Adjudication |
|---|---|---|---|
| dynamic-eval, `import { spawn } from "node:child_process"` | critical | lib/index.js:25 | Capability true, severity overstated. The import itself is not execution; the two call sites are adjudicated below. |
| dynamic-eval, `new Function("process", "return (" + jsExpr[1] + ")")` | critical | lib/index.js:298 | **Kept as a real finding, downgraded to medium.** The expression comes from a local agent-preset YAML file (`!!js` rows), which DSH itself ships and the user owns; the sandbox argument is a three-field literal object, and a throw is caught and treated as "enabled". It is still string-compiled code, and a writer of that YAML gets host-process execution. It is not remotely reachable and the alternative (parsing `process.platform === 'win32'` style expressions) would be modest work. |
| dynamic-eval, `spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"])` | high | lib/index.js:624 | False positive as "eval". Windows-only forced kill of a timed-out child, argv array, PID stringified from the plugin's own child handle. |
| dynamic-eval, `spawn(file, [...args, "plugin", "--profile", profile, ...pluginArgs])` | high | lib/index.js:710 | True positive as a capability, documented behavior. Runs the official DSH CLI, re-invoking the same entrypoint that launched the host (lib/index.js:610-618). Arguments are validated (lib/index.js:705-708) and names are regex-constrained (lib/index.js:1302-1308). |

### Additional findings from manual read (not raised by the scanner)

| ID | Severity | Location | Note |
|---|---|---|---|
| PM-EXEC-1 | medium | lib/index.js:298 | The `new Function` preset evaluator described above. |
| PM-SHELL-1 | low | lib/index.js:617, 710-716 | `shell: true` on Windows combined with a spawned command line. Mitigated by the argument allowlist regex at lib/index.js:705-708, which admits no shell metacharacter. Any future widening of that regex turns this into a command-injection finding. |
| PM-DESTRUCT-1 | low | lib/index.js:940-1050 | `uninstall()` permanently removes a plugin: CLI remove, patch-row deletion, description-entry deletion. Ordering is CLI-first with a hard abort on failure (lib/index.js:961-978), a patch backup is written before rewriting (lib/index.js:986-989), self-uninstall is refused (lib/index.js:943-945), and a `mutating` flag serializes operations (lib/index.js:941, 946). This is careful, but it is still a destructive remote-callable method exposed to the web UI. |
| PM-AUTH-1 | medium | lib/index.js:750-757 | The four methods `snapshot`, `setEnabled`, `uninstall`, `saveDescription` are registered as `Remote` with `private: false`. Authorization is therefore whatever the DSH web gateway enforces for remote services; this plugin adds no check of its own beyond name validation. Anyone who can reach the DSH web UI can uninstall plugins. That is the feature, and it inherits the host's exposure posture: safe on loopback, as wide as the host if the host is bound to a LAN or tunnelled. |
| PM-DISCLOSE-1 | low | lib/index.js:1162-1168 | The generated AI-fix prompt embeds the absolute profile path; copying it to a remote assistant discloses local paths. |
| PM-LICENSE-1 | low | repo root | package.json declares MIT but no LICENSE file is present in the tree. |

### Negative claims and what was searched

Both source files were read end to end (lib/index.js 1311 lines, lib/client.js 796 lines), plus
package.json, cordis.patch.yml, README.md, .gitignore - the complete six-file repository. No
`eval()`, no `vm.*`, no `require` of remote content, no base64-decoded-then-executed blobs, no
obfuscation (source is formatted, commented, and unminified; the client bundle is a readable
module-loader wrapper, not minified output), no telemetry, no credential paths, no writes outside
`$DSH_HOME/profiles/web`, no timers other than the 5-minute CLI timeout (lib/index.js:630) and a
200 ms retry sleep (lib/index.js:918), no lifecycle scripts.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load, no live enable/disable/uninstall run, no idle soak. The
  destructive paths were reviewed statically only; their real interaction with a live loader tree
  and with pnpm was not observed.
- **The DSH CLI and pnpm.** `uninstall()` delegates dependency removal to `dsh plugin remove`, which
  forwards to pnpm and reaches the npm registry. That behavior is the host's and was not audited.
- **Authorization on the remote channel.** Whether the DSH web gateway authenticates callers of
  `Remote` methods is a property of the host, not of this plugin, and was not tested. Section 4
  PM-AUTH-1 states the dependency rather than resolving it.
- **Published artifact comparison.** Nothing on npm, so no tarball, no integrity hash, no provenance
  to bind to this commit. A git install resolves to branch HEAD.
- **Windows paths.** The `taskkill` branch (lib/index.js:624), the `.cmd` shim handling
  (lib/index.js:617), and the workspace `-w` logic (lib/index.js:640-644) were read but not executed.
- **Preset-YAML sources.** We did not enumerate which `!!js` expressions ship in real DSH presets;
  the finding at lib/index.js:298 is graded on the mechanism, not on an observed hostile input.

## 6. Reviewer disagreement

Single-reviewer pass (one model). The scanner called the file critical on four rows; two are
adjudicated down, one is kept at reduced severity, one is kept as documented behavior. Both
positions are recorded in section 4.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/buhuikongpan/dsh-pluginmanager /tmp/pm-audit
cd /tmp/pm-audit && git rev-parse HEAD   # expect de79f77748d0a60106650cfb37d9ce020663171d

grep -n "eval(\|new Function\|vm\." lib/*.js      # exactly one hit: index.js:298
sed -n '288,306p' lib/index.js                    # the sandbox: platform/arch/version only
sed -n '700,716p' lib/index.js                    # spawn + argument allowlist
sed -n '1302,1308p' lib/index.js                  # validName: npm-name regex, throws otherwise
grep -n "rmSync" lib/index.js                     # one hit, scoped to hot-<n>.yml in our own dir
grep -rn "fetch(\|https\?://" lib/index.js        # no egress calls
grep -n '"scripts"' package.json                  # no lifecycle hooks
```

## 8. Methodology and pinned inputs

- Subject: git commit `de79f77748d0a60106650cfb37d9ce020663171d` (shallow clone at
  reference/audits/dsh-pluginmanager)
- Scanner: dsh-bridge tools/scan 0.1.0
- Review: full read of lib/index.js, lib/client.js, package.json, cordis.patch.yml, README.md
- Cross-model review: NOT performed (single reviewer); revision 1 is capped accordingly
- Grade derivation: start at A. No egress, no credentials, no telemetry, no install hooks. One
  medium kept (`new Function`, lib/index.js:298) and one medium inherited exposure (remote-callable
  destructive methods, PM-AUTH-1) move it to **B**. No high or critical production finding survived
  adjudication, so it does not fall to C.

## 9. Strengths

1. Destructive ordering is correct: `dsh plugin remove` runs first and a failure aborts before any
   patch row is touched, so a half-removed state that bricks the next boot cannot be created
   (lib/index.js:961-978, with the reasoning written out in the comment above it).
2. Input validation at both layers: an npm-package-name regex that throws (lib/index.js:1302-1308)
   plus a shell-metacharacter-free allowlist on the spawned argument (lib/index.js:705-708).
3. Backups before every patch rewrite, timestamped and deduplicated (lib/index.js:1293-1300);
   descriptions are written atomically through temp+rename (lib/index.js:66-71).
4. Self-protection: the manager refuses to disable or uninstall itself (lib/index.js:872-875,
   943-945), and a `mutating` lock serializes concurrent operations.
5. Honest comments. The code explains why bundle-layer plugins cannot hot-release and returns
   `needsRestart: true` instead of claiming success (lib/index.js:1000-1050). That is unusual candor.
6. Deletion is narrowly scoped: the only `rmSync` matches `hot-<digits>.yml` inside the plugin's own
   data directory (lib/index.js:96-98).

## 10. Residual risks

1. `new Function` on preset `!!js` expressions (lib/index.js:298). Whoever can write the profile's
   agent-preset YAML gets code execution in the host process. That party can usually already load
   plugins, so the marginal risk is small, but the mechanism is real.
2. Remote-callable uninstall with no plugin-level authorization (lib/index.js:750-757). The
   protection is entirely the DSH web gateway's exposure posture; a LAN-bound or tunnelled DSH web
   server makes plugin removal reachable by whoever reaches the UI.
3. `shell: true` on Windows (lib/index.js:617). Safe only because of the current argument allowlist;
   the two must be re-checked together on any change.
4. Indirect network and indirect writes: `dsh plugin add/remove` runs pnpm, which fetches from the
   registry and rewrites node_modules. This plugin triggers that; it does not control it.
5. No LICENSE file despite an MIT declaration, and no npm artifact or provenance to pin.
6. All user-facing text is Chinese, including every error message (for example lib/index.js:941,
   944). Not a security issue, but English-speaking operators will not understand failure states.

## 11. Re-verify steps

1. Re-run the section 7 block against current HEAD. Any second `new Function`/`eval` hit, any new
   `spawn` call site, or any widening of the regexes at lib/index.js:705 or :1304 must be
   re-adjudicated before this grade carries forward.
2. Diff `uninstall()` and `setEnabled()` on every release: the CLI-first ordering, the self-guard,
   and the backup call are the load-bearing safety properties.
3. Check `package.json` for a newly added `scripts` block on each bump; any lifecycle hook is a
   finding.
4. If the package is published to npm, pin `dist.integrity`, check for provenance attestation, and
   raise a new revision.
5. Re-run the scanner after any heuristics-corpus bump.
