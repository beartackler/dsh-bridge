# Trust Report Card: HarmonyOS NEXT skill pack (`linhay/harmony-next.skills`, npm `dsh-harmony-next`)

## 1. Header

| Field | Value |
|---|---|
| Plugin | dsh-harmony-next 1.3.35 - a bundled-skill provider for DeepSeek Harness plus an offline HarmonyOS NEXT reference library: one 243-line SKILL.md, ~3,700 markdown reference files, and ten Python helper scripts (device control via hdc, emulator/HVD management, DevEco command-line tools download/install, profiler and UI/UX audit pipelines). |
| Pinned subject (git) | github:linhay/harmony-next.skills @ commit `880420ccaede758845daa3e86154c4e02e6f2249` (default branch head at audit time, committed 2026-08-18T16:04:46+08:00, "fix: resolve installed skill paths from loaded SKILL.md (#28)") |
| Stars | 330 (catalog snapshot 2026-08-19); 340 live at audit time |
| Distribution | npm `dsh-harmony-next` is NOT published (registry returns 404); the DSH bundle loads from a git clone or the packaged GitHub release zip built by CI. README also advertises `npx skills add linhay/harmony-next.skills` for other agent platforms. |
| License | MIT (LICENSE; package.json license field) |
| Audited | 2026-08-26 by dsh-bridge trust worker (scanner 0.1.0 + manual review of index.js in full, all ten Python scripts' network/process/paths, CI workflow) |
| Revision | 1 |
| Grade | **C** |

Disclaimer: a grade is an evidence-backed opinion over one pinned artifact. It is not a safety
guarantee and says nothing about any other version.

## 2. Verdict in one sentence

Use with awareness: the cleanest scan surface this catalog line has seen - zero criticals or highs, one low-severity string literal - with every byte of real capability living in user-invoked Python tooling that talks to your local devices and one documented Huawei download flow, capped at C solely by the incomplete pipeline and an install channel whose release zip was not verified against this commit.

## 3. What this software can do

| Capability | Detail | Evidence |
|---|---|---|
| Skill registration only | The entire host-side code is 126 lines: parse SKILL.md frontmatter, expose one bundled skill at rank 600 through `ctx.skills.registerProvider`. No services, no agents, no client injection. | index.js:96-126; cordis.patch.yml:1-3 |
| Offline reference lookup | ~3,700 markdown files are data read by the model on demand; routing instructions keep context small. Nothing executes. | harmony-next/SKILL.md:14-60; README_en.md:9-13 |
| Device automation scripts | Ten Python CLI tools drive hdc/uitest/emulator/hdc-trace/codelinter as short-timeout subprocesses for diagnostics, evidence bundles, and audits - exactly what the skill documents. | harmony-next/scripts/*.py; hvd_manager.py:682-684, 1082 |
| Local-only probing | WebView/CDP evidence collection binds a temporary listener on 127.0.0.1 port 0 and probes `http://127.0.0.1:<port>` devtools endpoints; no remote destination exists in that path. | device_evidence_bundle.py:578-581, 597-615 |
| One real download path | `commandline_tools_manager.py download` fetches a Huawei Command Line Tools archive over http(s), verifies SHA-256 when the user supplies one, checks archive-member paths against traversal, then extracts. URL scheme and archive suffix validated first. | commandline_tools_manager.py:63-70, 84-108, 111-145 |
| No telemetry | No analytics, beacons, version checks, or phone-home anywhere in shipped code; the scanner's sole network finding is the package.json git URL string. | findings table below |

## 4. Evidence

Scanner: `tools/scan/dist/index.js` 0.1.0, rulesDigest
`9cc04224b1dc7e81f17677eaae91fbf686e65e7674ef6c28cc783875baaee999`.

One run against the repository root: **1 finding** (0 critical, 0 high, 0 medium, 1 low) over 19
scanned files, machine grade **A**, score 99, no caps, no gates. The scanner skipped 3,837 files by
extension policy - almost all reference prose - so adjudication includes a manual pass over what the
scanner never opened:

| Item | Adjudication | Evidence |
|---|---|---|
| Low `network-egress`, package.json:17 `"git+https://github.com/linhay/harmony-next.skills.git"` | Repository self-description inside metadata; not executed, not fetched. | package.json:17 |
| Scanner-skipped Python (10 files, 6,659 lines) | Manually swept for network, subprocess, eval/exec, and path handling. All `urllib.request.urlopen` calls resolve to either the user-supplied Huawei archive URL (validated to http/https plus archive suffix) or loopback devtools probes. All `subprocess.run` calls execute fixed local tool paths (hdc, emulator, codelinter, python) with list arguments and timeouts - no shell interpolation found. | grep sweep + reads: commandline_tools_manager.py:102, device_evidence_bundle.py:129-131, 290-294, 578-615, hvd_manager.py:682-684 |
| Archive extraction hardening | Member paths resolved and required to stay within the destination directory before write (`ensure_within_directory`); SHA-256 mismatch aborts install when a hash is supplied. Supplying no hash skips verification, which is the residual sharp edge. | commandline_tools_manager.py:111-118, 105-107 |
| CI release workflow | Builds the skill zip, runs unittest suite and `node --check`, publishes via softprops action using the workflow-scoped GITHUB_TOKEN; no external secrets, no curl-bash in repo docs (grep found none). | .github/workflows/release.yml:20-110 |

### The one thing worth knowing before installing

The executable surface here is not the plugin - it is the skill instructing your agent to run these
Python tools later. The code itself is disciplined, but once installed, an agent following SKILL.md
can drive your connected devices and emulators and download archives from URLs it is told to use.
That is the product working as advertised, and it deserves the same trust you give any device-control
toolkit.

## 5. What we could not check

- **Behavioral probe.** No sandboxed run of the skill or its scripts (pipeline S4 unavailable).
- **Cross-model review.** Single reviewer.
- **Release-zip provenance.** The GitHub Actions-built `harmony-next.skill.zip` was not downloaded and
  compared against this commit's packaging script output; npm distribution does not exist, so there is
  no registry provenance chain at all.
- **Full reference content.** ~3,700 markdown data files were sampled, not read end to end; they are
  inert prose but could carry prompt-level instructions in principle.
- **Huawei download endpoint integrity.** Whether users supply hashes for downloads in practice is
  outside the repository's control.

## 6. Reviewer disagreement

Single-reviewer pass. Scanner says A; this card says C. The gap is procedural, not suspicion-driven:
the C band ceiling applies whenever the behavioral probe and dual-model review did not run, and the
release artifact chain could not be reproduced. Nothing found here justifies distrust; several things
(notably the traversal check and hash verification) justify more trust than typical.

## 7. Verify this yourself

```bash
# 1. Pin the same subject
git clone --depth 1 https://github.com/linhay/harmony-next.skills /tmp/harmony-audit
cd /tmp/harmony-audit && git rev-parse HEAD   # expect 880420ccaede758845daa3e86154c4e02e6f2249

# 2. Re-run our scanner
node tools/scan/dist/index.js /tmp/harmony-audit   # from a dsh-bridge checkout

# 3. Spot-check the headline claims
sed -n '125,126p' index.js                                  # the whole host surface
grep -n "urlopen" harmony-next/scripts/*.py                 # every outbound fetch site
sed -n '63,70p' harmony-next/scripts/commandline_tools_manager.py   # download validation
sed -n '578,581p' harmony-next/scripts/device_evidence_bundle.py    # loopback bind
grep -rn "eval(\|exec(\|os.system\|shell=True" harmony-next/scripts/*.py   # expect silence
```

## 8. Methodology and pinned inputs

- Subject: git commit `880420ccaede758845daa3e86154c4e02e6f2249` (shallow clone at
  reference/audits/harmony-next.skills); scan JSON retained alongside the clone.
- Scanner: dsh-bridge tools/scan 0.1.0, rulesDigest `9cc04224...ee999`; 1 low finding, machine grade A.
- Review: index.js in full, SKILL.md in full, head of both READMEs, all ten Python scripts swept by
  grep and read at every network, subprocess, extraction, and lock site, cordis.patch.yml,
  package.json, and the complete CI release workflow.
- Provenance: registry checked (`npm view dsh-harmony-next` = 404); release zip not compared.
- Cross-model review: NOT performed (single reviewer). Revision 1 is capped accordingly.
- Grade derivation: zero hostile indicators across both scanned and manually reviewed surfaces;
  egress limited to loopback and one validated user-directed download flow. Caps: pipeline ceiling
  and unverifiable release artifact. Result: C.

## 9. Strengths

1. Minimal host code: 126 lines that register one readable skill definition and nothing else; there
   is no runtime surface beyond skill content itself (index.js:96-126).
2. Download hygiene rarely seen in this category: scheme and archive-suffix validation, optional but
   implemented SHA-256 verification, and explicit archive-traversal rejection before any member is
   written (commandline_tools_manager.py:63-70, 84-108, 111-118).
3. Every subprocess is a fixed binary invoked with list arguments and a timeout; no shell string
   composition anywhere in the toolkit (hvd_manager.py:682-684; device_evidence_bundle.py:129-131).
4. Zero telemetry, zero update channels, zero credential access in shipped code; CI uses only the
   workflow-scoped token (.github/workflows/release.yml:20-110).

## 10. Residual risks

1. Installing grants the model a documented playbook for driving hdc against connected devices and
   launching emulators; physical-device reach is the capability, so treat skill invocation like
   handing over a debugger (SKILL.md:14-60).
2. The archive download flow trusts whatever URL the conversation supplies unless a hash is passed;
   skipping `--sha256` removes integrity checking entirely (commandline_tools_manager.py:84-107).
3. No published npm artifact means no reproducible registry-to-commit chain; the release zip depends
   wholly on GitHub Actions integrity (package.json; release.yml).
4. The huge markdown corpus is data today, but prompt-level instructions hidden in reference files
   would be invisible to any code scanner including ours; sampling depth was limited.

## 11. Re-verify steps

1. Re-run section 7 greps against current HEAD. Any new outbound host, any `shell=True`, any eval
   construct, or any credential read forces re-adjudication.
2. Compare the next release zip against a local run of `scripts/package_skill.py`; equality restores
   the missing provenance link.
3. Check whether downloads gained pinned default hashes or a mirror allowlist; either would soften
   residual risk 2.
4. Re-vet at 90 days, at the next minor bump touching `harmony-next/scripts/`, or if npm publication
   begins.
