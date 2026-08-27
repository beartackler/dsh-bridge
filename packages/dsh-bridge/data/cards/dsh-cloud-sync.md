# Trust Report Card: @dickpy/dsh-cloud-sync

## 1. Header

| Field | Value |
|---|---|
| Plugin | `@dickpy/dsh-cloud-sync` (DSH web plugin: syncs DSH profile config and local-plugin sources to WebDAV / S3 / OSS / COS / MinIO / Qiniu Kodo / GitHub Gist) |
| Pinned subject | github:dickpy/dsh-cloud-sync @ commit `609d8bd08eb02a9b6f1edbdbcc90cd99f8d78d80` (version 0.20.7) |
| npm integrity | `sha512-uMGEv3YOMIdQXeJfT2s7g9ENamm0A/zoR97b+bRR9ws7fNwxKV4RK0EWRC+3GIn1agjMaJYE0zX/txrxG5jgOA==` (`registry.npmjs.org/@dickpy/dsh-cloud-sync/0.20.7`, fetched 2026-08-27) |
| Provenance | No npm attestation. Registry `gitHead` is `609d8bd08eb02a9b6f1edbdbcc90cd99f8d78d80`, which **does** equal the audited commit. Published by `dickpy <hmx_yx@163.com>`. |
| License | MIT (LICENSE) |
| Audited | 2026-08-27 by dsh-bridge trust worker (scanner 0.1.0 + manual review of lib/, one behavior executed) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

This is a competently built sync tool with better security engineering than almost anything else
in this catalog (loopback-enforced routes, AES-256-GCM client-side encryption, DPAPI on Windows,
0600 credential files, SHA-256-verified self-update, path-traversal defenses on restore), and it
is graded C anyway because its declared file set includes `.npmrc`, its sanitizer strips only
machine-local path settings and leaves `_authToken` lines intact, and encryption is opt-in and off
by default, so a default configuration uploads your npm registry tokens in cleartext to whichever
cloud bucket you connected.

## 3. What this plugin can do

| Capability | Detail | Evidence |
|---|---|---|
| Network egress | To whatever storage endpoint the user configures: WebDAV URL, S3/OSS/COS/MinIO/Kodo endpoint, or GitHub. Vendor defaults offered in the UI are `s3.amazonaws.com`, `oss-cn-hangzhou.aliyuncs.com`, `cos.ap-guangzhou.myqcloud.com`, `s3.cn-east-1.qiniucs.com` (lib/client.js:100-104). Fixed hosts the plugin contacts on its own: `api.github.com` (Gist API and release check, lib/core.js:18, 25) and `github.com` (device-code OAuth and release download, lib/core.js:19-20, 26). | file:line above |
| Data uploaded | Per profile: `package.json`, `pnpm-lock.yaml`, `cordis.patch.yml`, `cordis.yml`, `pnpm-workspace.yaml`, **`.npmrc`** (lib/core.js:11), plus `.dsh-market/*.yml` (lib/core.js:933-937), plus full recursive source trees of local plugins when source sync is on (lib/core.js:1159-1177). | lib/core.js:11, 923-940 |
| Credential reads | Its own credentials file `~/.dsh/dsh-cloud-sync/credentials.json` (lib/core.js:238, 254-266), and `.npmrc` from every DSH profile directory (lib/core.js:11 via profileFiles at 923-931). No `.ssh`, `.aws`, browser stores, or OS keychain reads. | grep of lib/ |
| Credential writes | Provider secrets stored at `~/.dsh/dsh-cloud-sync/credentials.json` with mode 0600 (lib/core.js:81), DPAPI-wrapped on Windows (lib/core.js:244-252, 258). `settings.json` never holds plaintext secrets; API responses mask them as `<stored-locally>` (lib/core.js:428-436). GitHub OAuth access tokens obtained by device flow land in the same store (lib/core.js:910). | file:line above |
| Child processes | Three, all with `shell: false` and `windowsHide: true`: `where.exe pnpm.cmd` (Windows shim discovery, lib/core.js:57), `powershell.exe -NoProfile -NonInteractive -Command <fixed DPAPI script>` with the secret passed on stdin, not argv (lib/core.js:244-252), and `pnpm add` / `pnpm remove` in the profile directory (lib/core.js:1479-1481). Arguments pass `validatePnpmArgument`, which rejects `\0\r\n"'` backtick `$&|<>^%!` and anything over 4096 chars (lib/core.js:1464-1467). 120 s timeout with kill (lib/core.js:1452-1461). | file:line above |
| Code installation | `installPlugin` runs `pnpm add <spec>` into `~/.dsh/profiles/<name>`, and `pullSnapshot` restores profile manifests that name dependencies. `updateSelf` downloads a GitHub release tarball, verifies SHA-256 against the release asset `digest` field, and installs it (lib/core.js:1573-1583). | lib/core.js:1557-1583 |
| HTTP surface | 22 POST routes under `/api/dsh-cloud-sync/` (lib/index.js:32-56). Every one is gated by `isLoopback`, which checks `request.socket.remoteAddress` against `127.0.0.1`/`::1`/`::ffff:127.0.0.1`, requires the `Host` header hostname to be a loopback name, and rejects `sec-fetch-site: cross-site` (lib/index.js:6-13). Non-POST is 405; body capped at 128 KiB (lib/index.js:16-20). | lib/index.js:6-29 |
| Background timer | A 60-second interval calls `runAutomaticSync` (lib/index.js:58-60). It returns immediately unless the user enabled auto-sync, which defaults to `false` (lib/core.js:242, 1385). | lib/index.js:58, lib/core.js:1385 |
| Dynamic code execution | None. No `eval`, `new Function`, `vm.*`. | grep of lib/ |
| Telemetry | None. No analytics or beacon code. | grep of lib/ |
| Lifecycle hooks | None. `scripts` contains only `check` and `test`; no install-time hook. | package.json |
| Dependencies | Zero runtime dependencies. | package.json |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`d7d5d9eb8c6fb13bf21e19fdae6e3cced4ccf696dabad4ea5f1122c7121041f3`.
Raw output: 69 findings (1 critical, 37 high), machine grade F on the `cred-plus-net`,
`dynamic-exec-present` and `finding-density` gates. Adjudication below.

### Scanner gates adjudicated

| Gate | Adjudication |
|---|---|
| `cred-plus-net` ("credential access and network egress co-occur in lib/core.js") | **Upheld, and it is the real finding.** `lib/core.js` both reads `.npmrc` (line 11, consumed at 924-931) and uploads profile files to a remote provider (`pushSnapshot`, 981-992). The scanner could not tell whether the credential material actually survives to the wire. It does. See CS-CRED-1. |
| `dynamic-exec-present` | False positive. The critical is `import { spawn } from 'node:child_process'` (lib/core.js:7), which the rule classes as dynamic execution. There is no `eval`, `new Function`, or `vm` in the repository. The three real spawn sites are enumerated in section 3 and each takes a fixed executable with validated arguments. |
| `finding-density` (NET in 3+ files) | Expected for a sync client. `lib/client.js` holds UI default endpoints and console links, `lib/core.js` holds the provider implementations, `test/core.test.mjs` holds a mock server. |

### Production findings kept

| ID | Severity | Location | Note |
|---|---|---|---|
| CS-CRED-1 | **high** | lib/core.js:11, 169, 923-931 | `.npmrc` is in `CONFIG_FILES` and is uploaded with every snapshot. `sanitizeNpmrc` filters only nine machine-local path keys (`store-dir`, `global-dir`, `cache-dir` and so on, lib/core.js:169). Auth lines are untouched. Verified by execution against the pinned tree: `sanitizeNpmrc('//registry.npmjs.org/:_authToken=SECRET123\\nstore-dir=C:/x\\nregistry=https://r.example\\n')` returns `'//registry.npmjs.org/:_authToken=SECRET123\\nregistry=https://r.example\\n'`. The token is preserved. Client-side encryption would protect it in transit and at rest, but `encryption.enabled` defaults to `false` (lib/core.js:242) and nothing in the flow warns that `.npmrc` may contain a token. A private registry token, or an npm publish token, therefore reaches the configured bucket, Gist, or WebDAV share in cleartext by default. A GitHub secret Gist is unlisted, not private, and the README says so (README.en.md:108) but does not connect that fact to `.npmrc`. |
| CS-NET-1 | medium | lib/core.js:18-20, 25-26 | Fixed GitHub endpoints for the Gist provider, device-code OAuth, and the self-update release check. Documented in README.en.md (GitHub Gist and Self-update sections). The self-update check fires when the settings page opens, before any provider is configured, so opening the panel contacts `api.github.com`. That is documented but is still egress the user did not ask for in that moment. |
| CS-NET-2 | medium | lib/client.js:100-104 | Vendor default endpoints prefilled in the provider form. Not contacted until the user saves a provider. |
| CS-EXEC-1 | medium | lib/core.js:1479-1481, 1557-1571 | Runs `pnpm add` with a spec that, on the restore path, originates from a remote snapshot's `package.json`. `validatePnpmArgument` blocks shell metacharacters and `spawn` uses `shell: false`, so this is not command injection. It is dependency installation directed by remote data: whoever controls your sync bucket controls what gets installed into your DSH profile on restore. The plugin mitigates by deferring installation until after a restart and requiring explicit "Apply restore" (README.en.md, restore section; lib/core.js:1441-1442 returns `installDeferred: true`). |
| CS-EXEC-2 | low | lib/core.js:244-252 | `powershell.exe` with a fixed inline DPAPI script. The secret goes over stdin (`child.stdin.end(value, 'utf8')`), never argv, so it does not land in process listings or shell history. Windows-only. |
| CS-EXEC-3 | low | lib/core.js:57 | `where.exe pnpm.cmd` to locate a pnpm shim. Fixed executable, fixed argument, Windows-only. |
| CS-FS-1 | low | lib/core.js:1159-1177 | `collectFiles` walks a user-named local plugin directory recursively and base64s every file into the archive. `DEFAULT_IGNORES` excludes `node_modules`, `.git`, `.env`, `credentials.yaml` and similar (lib/core.js:12), and `.dshsyncignore` extends it, but the default set is a denylist: any other secret file inside a local plugin source tree is uploaded. 100 MiB cap. |
| CS-AUTH-1 | info (positive) | lib/index.js:6-13 | Recorded because it is the mitigation the other cards in this batch lack: triple check on remote address, Host header, and `sec-fetch-site`. |

### Defenses verified by reading

- Restore path traversal: archive entries are rejected if the path is absolute, contains `..`, or
  contains a backslash (lib/core.js:1239-1240), and the resolved output must still be inside the target
  (`isInside`, lib/core.js:1251). Source archives are SHA-256 checked against the catalog before
  extraction (lib/core.js:1245-1246).
- Self-update integrity: the release asset URL must start with the expected
  `github.com/dickpy/dsh-cloud-sync/releases/download/<tag>/` prefix, the asset `digest` must match
  `sha256:<64 hex>`, drafts and prereleases are refused (lib/core.js:111-119), a 50 MiB cap is
  enforced from both `content-length` and the actual body (lib/core.js:135-141), and the downloaded
  bytes are re-hashed and compared before install (lib/core.js:1576-1577).
- Encryption, when enabled: AES-256-GCM, fresh 16-byte scrypt salt and fresh 12-byte IV per
  object, auth tag stored and verified (lib/core.js:811-828). The passphrase lives in a module-level
  `Map` and is never written to disk (lib/core.js:32, 846; README.en.md:131-133). Only
  `snapshots/` and `sources/` keys are encrypted (lib/core.js:810).
- Profile name validation: `/^[A-Za-z0-9._-]+$/` and an explicit `node_modules` refusal before any
  path join (lib/core.js:43).
- Self-dependency stripping: the plugin removes itself from synced manifests and lockfiles so a
  restore cannot swap out the running Cloud Sync bundle (lib/core.js:957-965, 1258-1262).
- `test/core.test.mjs` was executed: `core tests passed`.

### Negative claims and what was searched

`lib/index.js` (62) was read in full; `lib/core.js` (1761) was read in the security-relevant
regions (imports and constants, secret storage, providers, encryption, snapshot build and parse,
restore, pnpm invocation, self-update, auto-sync) and grepped exhaustively for the rest;
`lib/client.js` (466) was grepped for secret handling and URL literals; `package.json`,
`cordis.patch.yml`, `.dshsyncignore.example`, `README.en.md` read. No `eval`/`new Function`/`vm`,
no obfuscation, no telemetry, no `.ssh`/`.aws`/browser/keychain reads, no install hooks, no
runtime dependencies.

## 5. What we could not check

- **Behavioral probe.** No sandboxed load/activate/sync run against a real provider. The
  `sanitizeNpmrc` behavior in CS-CRED-1 was executed directly as a unit; everything else is static.
- **Published artifact vs source.** The npm `gitHead` equals the audited commit, which is a good
  sign, but there is no provenance attestation and we did not download and diff the tarball. A
  registry-side substitution would not be detectable from `gitHead` alone.
- **`lib/client.js` was not read line by line.** It is UI code with no host filesystem access, and
  it was grepped for URLs and secret handling, but a full read was not performed. Any claim here
  about the UI is scoped to those greps.
- **The GitHub OAuth App** behind the device flow (client id `Ov23liqTnhZ79x2hJZpd`, lib/core.js:21)
  is the maintainer's. It requests `gist` scope only (lib/core.js:890), which we verified in code,
  but we cannot verify what the App is configured to request on GitHub's side, nor who else holds
  its client secret.
- **Provider implementations beyond the Gist path** (WebDAV `request`, S3 signing) were read for
  URL construction and error handling but not tested against live endpoints, so signature
  correctness and TLS behavior are unverified.
- **Windows-specific paths** (DPAPI, `where.exe`, `cmd.exe` argument quoting at lib/core.js:1476)
  were read but not executed; this audit ran on macOS.
- **What the remote bucket does with the data** is outside the artifact entirely.

## 6. Reviewer disagreement

Single-reviewer pass. The scanner graded F, the reviewer grades C. The scanner's `cred-plus-net`
gate was the one that mattered and it was upheld after manual tracing, which is worth recording:
the heuristic found the right module for the wrong reason, and the manual read supplied the
evidence (an executed sanitizer showing token survival) that the heuristic could not.

## 7. Verify this yourself

```bash
git clone --depth 1 https://github.com/dickpy/dsh-cloud-sync /tmp/cs-audit
cd /tmp/cs-audit && git rev-parse HEAD   # expect 609d8bd08eb02a9b6f1edbdbcc90cd99f8d78d80

# The headline finding: npm auth tokens survive sanitization
node --input-type=module -e "
import {sanitizeNpmrc} from '/tmp/cs-audit/lib/core.js'
console.log(sanitizeNpmrc('//registry.npmjs.org/:_authToken=SECRET123\nstore-dir=C:/x\n'))"
#   prints the _authToken line unchanged
sed -n '11p' lib/core.js                 # .npmrc is in CONFIG_FILES
sed -n '242p' lib/core.js                # encryption.enabled defaults to false

# The defenses
sed -n '6,13p' lib/index.js              # loopback + Host + sec-fetch-site gate
sed -n '1464,1467p' lib/core.js          # pnpm argument validation
sed -n '1240,1251p' lib/core.js          # restore path traversal defense
grep -rn "eval(\|new Function\|vm\." lib # expect no output
node test/core.test.mjs                  # expect: core tests passed

# Published artifact
npm view @dickpy/dsh-cloud-sync@0.20.7 dist.integrity gitHead
#   gitHead should equal the commit above
```

## 8. Methodology and pinned inputs

- Subject: commit `609d8bd08eb02a9b6f1edbdbcc90cd99f8d78d80`, shallow clone at
  `reference/audits/dsh-cloud-sync`.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `d7d5d9eb...41f3`.
- Review: full read of `lib/index.js` (62); targeted full read of `lib/core.js` regions 1-300,
  428-440, 734-1000, 1150-1300, 1350-1620, 1440-1520, plus exhaustive grep of the remainder;
  grep review of `lib/client.js` (466); `package.json`, `cordis.patch.yml`,
  `.dshsyncignore.example`, `README.en.md`.
- Executed: `node test/core.test.mjs` (passed); direct invocation of `sanitizeNpmrc` to establish
  CS-CRED-1.
- Cross-model review: NOT performed (single reviewer).
- Grade derivation: one high production finding (CS-CRED-1, credential material leaves the machine
  in cleartext under default settings) caps the grade at C. Everything else in the artifact argues
  for B or better: real loopback enforcement, real encryption when enabled, real integrity checks
  on self-update, real traversal defense on restore, zero dependencies, no dynamic execution, no
  telemetry. Fixing the sanitizer to strip `_authToken`, `_auth`, `_password`, and
  `//registry:*` lines, or defaulting encryption on, would lift this to B immediately.

## 9. Strengths

1. The only plugin in this batch that authenticates its own HTTP surface: remote address, Host
   header, and `sec-fetch-site` are all checked before any handler runs (lib/index.js:6-13).
2. Secret hygiene on the local side is genuinely careful: 0600 credentials file separate from
   settings, DPAPI wrapping on Windows with the secret passed via stdin rather than argv,
   `<stored-locally>` masking in every API response, and an encryption passphrase that is held in
   memory only.
3. Self-update is verified, not trusted: fixed URL prefix, release digest parsed and matched
   against a re-hash of the downloaded bytes, size caps on both the header and the body, drafts and
   prereleases refused.
4. Restore is defensive: checksums before extraction, three-way path traversal rejection,
   containment check after join, a backup of the prior profile files, and deferred dependency
   installation so nothing executes during the restore itself.
5. `pnpm` is invoked with `shell: false`, a validated argument list, a timeout, and a hand-rolled
   `cmd.exe` quoting path with a comment explaining exactly why (lib/core.js:1469-1477).
6. Zero runtime dependencies for a plugin that speaks WebDAV, four S3-compatible services, and the
   GitHub Gist API.
7. The README documents the threat model honestly, including that a secret Gist is unlisted rather
   than private and that encryption does not protect an already-compromised device.

## 10. Residual risks

1. **`.npmrc` upload (CS-CRED-1).** Default configuration ships npm registry tokens to the
   configured remote in cleartext. Mitigate today by enabling client-side encryption before the
   first sync, or by removing auth lines from profile `.npmrc` files.
2. Anyone who controls the sync target controls what a restore installs into your DSH profile.
   The deferred-install and explicit-apply design reduces this but does not remove it.
3. `DEFAULT_IGNORES` is a denylist. Secrets inside a local plugin source tree under any name not on
   that list are archived and uploaded.
4. The self-update check contacts `api.github.com` whenever the settings page opens, before any
   provider is configured.
5. The device-code flow depends on the maintainer's GitHub OAuth App; its configuration is not
   auditable from this repository.
6. No npm provenance attestation, so the `gitHead` match is a convention, not a cryptographic bind.
7. UI copy is Chinese while the README is English, so error strings will not match the docs for an
   English-speaking user.

## 11. Re-verify steps

1. Re-run the `sanitizeNpmrc` snippet in section 7. If the `_authToken` line is gone, CS-CRED-1 is
   fixed and the grade should be revised to B. Also re-check `CONFIG_FILES` (lib/core.js:11) for
   newly added files and `defaultSettings.encryption.enabled` (lib/core.js:242).
2. Re-run the section 7 block against current HEAD. New literal hosts, new `spawn` sites, or any
   `eval`-family hit must be re-adjudicated.
3. Confirm `isLoopback` still gates every route in `apply()` and that no route was added outside
   the `route()` helper.
4. Re-check the self-update verification chain: URL prefix assertion, digest parse, and the
   post-download `hash(archive) !== update.release.sha256` comparison. Any weakening there is a
   supply-chain finding.
5. Diff `npm view @dickpy/dsh-cloud-sync gitHead` against the installed commit on every upgrade,
   and treat a mismatch as requiring a new revision of this card.
6. If provenance attestation appears on npm, unpack the tarball and byte-compare against a
   checkout at the matching commit; that would allow this card to cover the published artifact
   rather than the git tree alone.
