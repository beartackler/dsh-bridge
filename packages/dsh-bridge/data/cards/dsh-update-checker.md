# Trust Report Card: dsh-update-checker

## 1. Header

| Field | Value |
|---|---|
| Plugin | `dsh-update-checker` (checks npm and GitHub for DSH core and plugin updates, shows a banner, performs one-click updates with backup/rollback and a restart watchdog) |
| Pinned subject | github:Airmetro/dsh-update-checker @ commit `a0605b4cfb94665e6937187789e73894ea0e4d5e` (2026-08-25, default-branch head at audit time; package.json version 1.4.16) |
| npm integrity | `sha512-4+cnnCRxEdjQ4qF9HxkbwtO+5n0X4raoSr4EKQGhUydOiIEmqLJb4ehBItBXT1w6qNuzbq7n3kxnKV5JwecdiQ==` (`registry.npmjs.org/dsh-update-checker/1.4.16`, fetched 2026-08-27) |
| Provenance | None. Registry reports no `gitHead` for 1.4.16; no release workflow exists in-repo (only `.gitignore`, no `.github/`). No signed tags, no attestation. |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + targeted manual read of the update, download, extract, and route paths) |
| Revision | 1 |
| Grade | **D** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

A capable and unusually careful updater in most respects, but it disables TLS certificate
verification for every `*.github.com` host (lib/index.js:62, 1436, 1450) including
`codeload.github.com`, from which it downloads plugin tarballs that it then extracts over the
installed plugin and installs with npm lifecycle scripts explicitly enabled, and it verifies no
hash of any kind on that path: a network attacker on the GitHub channel gets code execution as the
user.

## 3. What this plugin can do

This is a privileged plugin by design. Enumerating its powers plainly:

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | `registry.npmjs.org` (packument reads, lib/index.js:54, 1367; tarball downloads, scripts/main-update-worker.mjs:449), `api.github.com` (releases, release notes, `contents/package.json`; lib/index.js:1506, 1542, 1577, 1627), `codeload.github.com` (plugin source tarballs, lib/index.js:3026). Loopback `http://127.0.0.1:<port>` for the watchdog health probe (lib/index.js:1238, scripts/restart-watchdog.ps1:92). No other hosts appear in `lib/` or `scripts/`. | file:line above |
| **TLS verification disabled** | `rejectUnauthorized: insecure ? false : true` where `insecure` is `GH_INSECURE_HOST_RE.test(hostname)` and that regex matches any host ending in `github.com`, `githubusercontent.com`, or `githubassets.com` (lib/index.js:62, 1436, 1450). Confirmed by evaluating the regex: `api.github.com`, `codeload.github.com`, `github.com`, `raw.githubusercontent.com` all return true. The npm registry path uses plain `fetch` and keeps strict TLS (lib/index.js:1367). | file:line above; regex evaluated |
| Replaces installed code | Downloads a tarball, extracts it, backs up the existing plugin directory, and copies the new tree over it (`finalizePluginInstall` -> `backupAndReplace`, lib/index.js:2706-2712, 3048, 3080). For the DSH core, a detached worker stops the service, replaces `node_modules/@deepseek-ai/*`, verifies, and restarts (scripts/main-update-worker.mjs:537, 469-502, 779-787). | file:line above |
| Runs npm, enabling lifecycle scripts | `ensureScriptsBuilt` walks the freshly downloaded dependency tree, collects every package declaring `install`/`preinstall`/`postinstall`, and re-runs npm with `--allow-scripts=<those names>` (lib/index.js:2623-2672). This is a deliberate opt-in to executing third-party install hooks. | file:line above |
| Child processes | `exec`/`spawn` from `node:child_process` (lib/index.js:47). Spawns `node <npm-cli>` for installs (lib/index.js:2156, 2233; worker:82), PowerShell for port/PID probes and the restart watchdog (worker:218; scripts/restart-*.ps1), `C:\Windows\System32\taskkill.exe` with numeric PIDs (lib/index.js:1198), and `C:\Windows\System32\cmd.exe /c <deployRoot>\start-dsh.cmd` as the launcher fallback (lib/index.js:1213). All spawn arguments observed are absolute paths or values the plugin computed; none is a user-supplied string interpolated into a shell command. | file:line above |
| Loopback HTTP routes | Twelve-plus routes under `/dsh-update-checker/*`: `status.json`, `suppress`, `update`, `update-progress.json`, `rollback`, `backups.json`, `backup-settings.json`, `backup-root`, `backups-clear`, `backup-folder-pick`, `plugin-update`, `plugin-rollback`, `settings.json` (lib/index.js:3417-4000). Every mutating route passes through `writeGate`, which requires the socket peer to be `127.0.0.1`/`::1`/`::ffff:127.0.0.1` **and** a JSON body containing `confirm: true`, with a body-size cap (lib/index.js:3385-3405). | file:line above |
| Credential reads | `GH_TOKEN` or `GITHUB_TOKEN` from the environment (lib/index.js:66), sent as `Authorization: Bearer` only when the host is exactly `api.github.com` (lib/index.js:1445-1447). No auth.json, no keychain, no browser store, no `.ssh`/`.aws`. | file:line above |
| Filesystem writes | Under `DSH_HOME` (state, ops log, lock, skipped-pkgs), `mkdtemp` staging dirs in the OS temp dir, backup directories, and the deployment tree itself during an update. | lib/index.js passim |
| Dynamic code execution | No `eval`, `new Function`, or `vm` anywhere in `lib/` or `scripts/`. The scanner's `dynamic-exec-present` gate fires on the `child_process` import. | grep |
| Telemetry | None. No analytics or beacon host; the destination set is exactly the four hosts listed above. | negative claim, scope stated |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 67 findings (1 critical, 44 high, 4 medium, 18 low), machine grade F, gates
`cred-plus-net`, `dynamic-exec-present`, `finding-density`.

### Findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| **UC-TLS-1** | **high** | lib/index.js:62, 1436, 1450 | TLS certificate validation is switched off for all GitHub-family hosts. The stated reason is compatibility with users behind a self-signed local GitHub proxy (README.md:12, README.zh.md:12), and the README is honest that this is happening. But the same client (`ghRequest`) is used for the `codeload.github.com` tarball download at lib/index.js:3032, so the bytes that become installed, executed plugin code arrive over a connection whose peer identity was never checked. Combined with UC-INT-1 and UC-HOOK-1 below, an attacker able to intercept that connection (hostile Wi-Fi, hostile DNS, the very hosts-hijacking proxy the README describes) achieves arbitrary code execution as the user. A correct fix exists and is narrow: honor `NODE_EXTRA_CA_CERTS`, or make the relaxation opt-in per user setting rather than unconditional and undocumented in code. |
| **UC-INT-1** | **high** | lib/index.js:3023-3070; scripts/main-update-worker.mjs:448-502 | No cryptographic integrity check on any downloaded artifact. `grep -n "createHash\|shasum\|integrity"` over `lib/` and `scripts/` returns only the string `"integrity check failed"` (lib/index.js:1048, worker:784), which refers to `verifyDeployTree`, a structural check (does each package.json exist, does its version equal the target, are the referenced `dist/assets/*` files present) rather than a hash comparison. The npm packument is fetched and read for versions and `dist-tags` (lib/index.js:524) but `dist.integrity`, which npm publishes for exactly this purpose, is never read. The only content validation is `pkg.version` equality (lib/index.js:3065; worker:493-499). |
| **UC-HOOK-1** | medium | lib/index.js:2623-2672 | `ensureScriptsBuilt` enumerates every downloaded package with install hooks and re-invokes npm with `--allow-scripts=<names>`, deliberately executing them. This is necessary for packages with native builds and the author clearly knows what they are doing, but it converts "a tampered tarball was downloaded" into "arbitrary code ran" with no further step. |
| UC-EXEC-1 | medium | lib/index.js:1198, 1213, 2156, 2233; worker:82, 218 | Process spawning, including `cmd.exe /c` and `taskkill`. Adjudicated as reasonably constructed: `cmd.exe` is an absolute path and its argument is `join(deployRoot, "start-dsh.cmd")`, a path the plugin computed; taskkill receives `String(pid)` from a numeric-filtered probe. No user-controlled string reaches a shell. The PowerShell watchdog scripts take their inputs through environment variables, not argument interpolation (scripts/restart-watchdog.ps1:2-9). |
| UC-TAR-1 | low | lib/index.js:2316-2339 | Hand-rolled tar reader. Traversal is checked (`if (!target.startsWith(resolve(destDir))) continue`, lib/index.js:2334). Only regular files are extracted (`type === 48 || type === 0`), so symlink and hardlink entries are silently dropped rather than followed, which is the safe direction. The worker's copy of this function (scripts/main-update-worker.mjs:469-492) has **no** traversal check, relying instead on `join(pkgDir, rel)` after stripping the first path segment; a crafted `../` entry could escape. That tarball comes from `registry.npmjs.org` over strict TLS, which is why this is low rather than high, but the two implementations should be unified on the guarded version. |
| UC-CRED-1 | low | lib/index.js:66, 1445-1447 | Reads `GH_TOKEN`/`GITHUB_TOKEN`. Correctly scoped: the header is attached only when `host === "api.github.com"` (exact match, not the loose regex), so a redirect to another host does not carry the token. Good practice, noted as a strength too. |
| UC-PROV-1 | low | package.json; repo root | No release workflow, no `gitHead` on the registry, no tags verified. The npm package and the git tree cannot be tied together by anything but the author's word. |

### Scanner noise dismissed (with scope)

- 21 NET high: `fetch`/`https.get` calls to the four hosts already enumerated, plus loopback. No
  undisclosed destination exists; verified by enumerating every literal URL in `lib/` and
  `scripts/` (the full set is registry.npmjs.org, api.github.com, codeload.github.com,
  127.0.0.1/localhost, plus documentation and test placeholders like `https://github.com/a/b`).
- 18 NET low: expected-host URLs, including 9 inside `scripts/unit-*.test.mjs` fixtures and 3 in
  package.json metadata (repository, homepage, bugs).
- 4 HOOK high "invokes the package manager at runtime": true and central to the product; covered
  by UC-HOOK-1 and UC-EXEC-1 rather than counted separately.
- HOOK medium at lib/client.js:500 and worker:459: `setTimeout` for UI banner timing and download
  retry backoff respectively, both read directly.
- EXEC critical at lib/index.js:47: the `child_process` import. Expected for an updater.
- EXEC high in `scripts/*.test.mjs`: test files.
- `cred-plus-net` F cap: co-occurrence is the `GH_TOKEN` read plus the api.github.com call, which
  is the documented, correctly-scoped behavior at UC-CRED-1.

### Negative claims and what was searched

Searched `lib/index.js` (4053 lines), `lib/client.js` (1891), `scripts/main-update-worker.mjs`
(837), both PowerShell scripts, all 17 test scripts, package.json, cordis.patch.yml, both READMEs,
docs/INSTALL.md. Results: no `eval`/`new Function`/`vm`; no credential file path of any kind; no
telemetry host; no obfuscation (unminified, readable, though comment bodies have been stripped to
blank lines in the shipped `lib/`, which slightly hinders review); no npm lifecycle script on this
package itself (`scripts` contains only `test`); no runtime dependencies (only peer `react`).

## 5. What we could not check

- **Behavioral probe.** No sandboxed run. Critically, UC-TLS-1 was established by reading the flag
  and evaluating the regex, not by standing up a MITM proxy and observing an accepted bad
  certificate. The conclusion follows directly from `rejectUnauthorized: false`, but it is
  inference from source, not an observed exploit.
- **Published-artifact comparison.** The npm tarball for 1.4.16 was not downloaded or compared
  against this git tree, and the registry provides no `gitHead` to anchor it.
- **Full read of `lib/client.js`.** The 1891-line client bundle was grepped for network targets
  (result: one relative path, `/dsh-update-checker/settings.json`) and read at the flagged timer
  sites, but not read line by line.
- **The update and rollback state machine end to end.** `backupAndReplace`, `mergeDependencies`,
  `persistManifest`, and the rollback paths were read in outline and at the cited lines, not
  exhaustively traced for every failure ordering. Whether a mid-update crash can leave an
  unbootable deployment is not established either way here; the code clearly tries hard to avoid
  it (lock files, `.bak-tarball` copies, verify-then-rollback at lib/index.js:1038-1051).
- **The PowerShell watchdog on a real Windows host.** Read, not executed.
- **The 17 test scripts were not run.** `npm test` requires only Node, but no test run was
  performed, so the author's own claimed coverage is unverified.
- **Cross-model review.** Single reviewer, single model.

## 6. Grade derivation

Start at B for a documented-egress, no-telemetry, no-dynamic-exec plugin with genuinely strong
local authorization on its routes. Two high-severity production findings that compose into remote
code execution (UC-TLS-1 disables peer authentication on the channel; UC-INT-1 means nothing else
would catch substituted bytes; UC-HOOK-1 then executes them) cap at **D**. It is not F: the
capability is the product's stated purpose rather than concealed, the README discloses the TLS
relaxation in plain language, the npm channel retains strict TLS, mutating routes require loopback
plus explicit `confirm: true`, the `GH_TOKEN` is correctly host-scoped, and backup/rollback is real
and tested. It is not C because a code-installing updater that authenticates neither its transport
nor its payload has failed at the one thing it must get right.

## 7. Strengths

1. Authorization on every mutating route is better than most plugins audited: loopback socket
   check plus a required `confirm: true` body field plus size and JSON validation, all in one
   shared gate (lib/index.js:3385-3405).
2. Token discipline: `GH_TOKEN` is attached only on an exact `host === "api.github.com"` match, so
   redirects cannot carry it off-host (lib/index.js:1445-1447).
3. Real operational care: size caps on every download (1 MiB body, 4 MiB JSON, 200 MiB tarball,
   lib/index.js:58-60), redirect limit of 5, 30 s timeouts, update lock files with staleness
   windows, an append-only ops log, backup-then-replace with automatic rollback when
   `verifyDeployTree` fails (lib/index.js:1038-1051).
4. Refuses to install a source-only GitHub tarball that lacks the built entry file, rather than
   bricking the installed plugin (lib/index.js:3057-3064).
5. Honest documentation: the READMEs state that GitHub domains get a relaxed TLS client and that
   the npm registry does not (README.md:12). The behavior is disclosed, not hidden.
6. Zero runtime dependencies and no lifecycle script on this package itself.
7. Seventeen test scripts covering semver comparison, dedupe, persistence, tar handling, and
   several specific past regressions.

## 8. Residual risks

1. Anyone who can intercept the plugin's connection to `codeload.github.com` can substitute the
   tarball, and the substituted code will be extracted over an installed plugin and executed
   through npm lifecycle scripts. This is the dominant risk and it is not theoretical for users
   behind exactly the hijacking proxies the README mentions.
2. No hash or signature is checked on any artifact, so even on the strict-TLS npm path a registry
   compromise or cache poisoning would pass unnoticed.
3. The worker's tar extractor lacks the traversal guard its sibling has.
4. An update rewrites the DSH deployment and restarts the service; a bug here is a
   denial-of-service against the user's whole harness, mitigated but not eliminated by
   backup/rollback.
5. No provenance ties the npm package to this source.
6. Comment bodies are stripped in the shipped `lib/`, so a future reviewer reading only the
   installed artifact loses the author's reasoning.

## 9. Reviewer disagreement

Single-reviewer pass; no second adversarial model. The scanner graded F; this card grades D. The
scanner's gates and their adjudication are recorded in section 4 rather than dropped. A second
reviewer might reasonably argue for F on the grounds that a self-updating code installer with no
payload integrity check is categorically unsafe; the counterargument recorded here is disclosure,
local-authorization strength, and the strict-TLS npm path.

## 10. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/Airmetro/dsh-update-checker /tmp/uc-audit
cd /tmp/uc-audit && git rev-parse HEAD  # expect a0605b4cfb94665e6937187789e73894ea0e4d5e

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/uc-audit   # from a dsh-bridge checkout

# 3. The headline finding: TLS off for all GitHub hosts
sed -n '62p'   lib/index.js     # GH_INSECURE_HOST_RE
sed -n '1436p' lib/index.js     # insecure = RE.test(host)
sed -n '1450p' lib/index.js     # rejectUnauthorized: insecure ? false : true
sed -n '3026,3035p' lib/index.js  # the codeload tarball download uses that same client
node -e 'const R=/(^|\.)(github\.com|githubusercontent\.com|githubassets\.com)$/i;
         ["api.github.com","codeload.github.com","raw.githubusercontent.com"].forEach(h=>console.log(h,R.test(h)))'
#   all true

# 4. No integrity check anywhere
grep -rn "createHash\|shasum\|dist.integrity\|sha512" lib scripts
#   expect: no hash computation; only the string "integrity check failed" (a structural check)

# 5. Lifecycle scripts are deliberately enabled on downloaded trees
sed -n '2654,2672p' lib/index.js   # --allow-scripts=<collected names>

# 6. The good parts, for balance
sed -n '3385,3405p' lib/index.js   # loopback + confirm:true gate on every mutating route
sed -n '1445,1447p' lib/index.js   # GH_TOKEN only for exact host api.github.com
sed -n '2334p'     lib/index.js    # traversal guard present here
sed -n '486,492p'  scripts/main-update-worker.mjs  # ...and absent here
```

## 11. Re-verify steps

1. Check lib/index.js:1450 first. If `rejectUnauthorized` becomes unconditionally `true`, or the
   relaxation becomes an explicit user opt-in, UC-TLS-1 clears and the grade should be revisited
   toward C or B.
2. Check whether `dist.integrity` from the npm packument, or a release-asset digest for the GitHub
   path, is ever compared against downloaded bytes. That would clear UC-INT-1.
3. Re-run the URL enumeration in section 10 step 3; the destination set must remain
   {registry.npmjs.org, api.github.com, codeload.github.com, loopback}. Any addition is a new
   finding.
4. Confirm `writeGate` still guards every mutating route after any route is added
   (`grep -n "webServer.register" -A4 lib/index.js` and check each handler's first statement).
5. Watch for `--allow-scripts` widening from a collected name list to a blanket enable.
6. Re-run the scanner after any heuristics-corpus bump; the rulesDigest for this pass is in
   section 4.

## 12. Methodology and pinned inputs

- Subject: commit `a0605b4cfb94665e6937187789e73894ea0e4d5e`, shallow clone at
  `reference/audits/dsh-update-checker`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...041f3`.
- Manual review: lib/index.js read across the network client (1425-1500), all GitHub fetchers
  (1500-1650), npm packument path (1360-1412), tar extractor (2316-2339), `verifyDeployTree`
  (2349-2420), `collectScriptPackages`/`ensureScriptsBuilt` (2623-2672), npm arg builders
  (2676-2703), plugin update paths (3023-3170), the Windows restart path (1195-1235), and all route
  registrations with their gate (3385-4000); scripts/main-update-worker.mjs read across its
  download (448-467), extract (469-502), todo collection (505-525), and spawn wrapper (78-90);
  both PowerShell scripts; package.json; both READMEs.
- Regex behavior for `GH_INSECURE_HOST_RE` evaluated directly in Node against the four real
  hostnames used by the plugin.
- Registry check: `npm view dsh-update-checker@1.4.16 dist.integrity gitHead`, fetched 2026-08-27.
- Cross-model review: NOT performed. Revision 1 is capped accordingly.
