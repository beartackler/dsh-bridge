# Trust Report Card: api-relay-audit

| | |
|---|---|
| **Grade** | **C** (manual adjudication; raw scanner output: F) |
| **Tool** | api-relay-audit v2.4.0 (github.com/toby-bridges/api-relay-audit) |
| **Subject** | commit `00ce80208ea1178ac39116bf0843517a748e4dce` (default branch `master`, last commit 2026-08-16T03:21:58+08:00; upstream HEAD re-checked equal at audit time) |
| **Audited at** | 2026-08-25 (UTC-4), shallow clone at `/reference/audits/api-relay-audit` |
| **Scanner** | dsh-bridge scan v0.1.0, rulesDigest `0e425dada2a444bae064b381024f29504031f044acba69d910c9fe43585a04e`, 22 files / ~89 KB scanned, 107 files skipped (docs/assets/tests filters) |
| **Method** | Static scan (S3 tool) + single-model manual adversarial read of all runtime source (Python 8.9k lines, JS adapter 479 lines). No behavioral probe (S4), no second model pass. Source ships as-is: no compiled artifact to verify. |
| **Revision** | 1 |

> A grade is evidence-backed opinion over one pinned commit. It is not a safety guarantee and says nothing about other versions.

## Verdict in one sentence

Clean on manual review: the auditor touches exactly one credential, the key the user hands it, sends it nowhere except the relay under test, contains no dynamic code execution, and shows deliberate anti-leak engineering throughout; graded C rather than higher only because no sandboxed probe and no cross-model review were run for this pass.

The raw scanner grade F is **not endorsed**: every finding traced to a false positive or CI/test-only code, detailed below.

## What this tool is

A local security audit for AI API relays/proxies: fires 14 probe families (prompt injection, model substitution signals, context truncation, tool-call rewriting, error leakage, stream integrity, infra fingerprinting) at a user-chosen relay URL using the user's own relay API key, and writes a Markdown verdict report. Three distribution surfaces in one repo: standalone `audit.py` (stdlib + `curl` only, generated artifact), a modular Python package (`api_relay_audit/*.py`, `httpx` peer), and a DeepSeek Harness adapter (`dsh/index.js`) exposing `/relay-audit`. Ships via git checkout or npm bundle (`package.json` `files`: audit.py, dsh/index.js, cordis.patch.yml, LICENSE, NOTICE, VERSION); no lifecycle hooks, no build step between source and shipped artifact. AGPL-3.0-only with NOTICE; SECURITY.md and CITATION.cff present.

## Focus questions

### Does the auditor itself touch credentials?

It handles one credential: the relay API key the user explicitly provides (`--key` / `--key-env`, mutually exclusive and required, `audit.py:5015-5018`). It never reads credential stores: greps over all runtime Python and JS find zero `expanduser`, zero reads of `~/.claude`, `~/.codex`, opencode auth.json, `.env`, `~/.ssh`, `~/.aws`. The only environment-variable read in the entire codebase is the user-designated key variable (`os.environ.get(args.key_env)` at `audit.py:5081`; the JS adapter reads only `process.platform`, `dsh/index.js:327,407`). The DSH adapter resolves one DSH Credential ref (`dsh/index.js:398`) and passes it to the audit child solely via an env dict keyed `API_RELAY_AUDIT_KEY` (`dsh/index.js:438`).

Where the key goes: only into request headers aimed at the audited `base_url` (`x-api-key`/`Bearer`, `audit.py:1114,1145,1377-1378`; both styles deliberately, so either relay mode is tested uniformly, `audit.py:3581-3584,4791-4796`). Anti-leak engineering is unusually good:

- Auth headers are passed to curl via `--config -` stdin so the key stays out of process listings (`api_relay_audit/_transport.py:33-46`, mirrored at `audit.py:640-644`).
- Every report-rendered string is redacted against the live key (`_redact`, `audit.py:1847-1852`; `<REDACTED_API_KEY>` variant for secret-shape patterns at `audit.py:3378-3393`, which also detect `sk-`, AWS, Google, JWT, bearer shapes in relay responses, `audit.py:3238-3248`).
- Adapter error tails are scrubbed through `redactSecret` before display (`dsh/index.js:353-365,452`).
- Transparent forensic log records timestamp/URL/SHA-256/status, not bodies (`audit.py:5066-5069`).

Verdict: touches credentials exactly as advertised, with above-average care. No store access, no secondary egress of the key.

### Network egress?

Complete inventory: everything aims at the user-supplied relay URL. Chat/stream/raw probes go through `APIClient` to `base_url` only (`audit.py:1082-1091,1240-1251`; web3 probes reuse the same client, `api_relay_audit/web3/injection_probes.py:311`). Step 1 recon adds DNS resolution, optional `nslookup`/`whois`, a TLS certificate fetch, and urllib HEAD/GET snapshots, all against the relay's own hostname/base URL (`audit.py:5179-5181,5282,5197,5313,5321`). Literal URLs in shipped code are exactly two, both attribution comments, never fetched (`audit.py:2643`, `api_relay_audit/identity_patterns.py:45`); a third appears only in the install docstring (`audit.py:17`). No telemetry, no update checks, no metrics upload (`scripts/collect-metrics.py` performs no network calls).

Verdict: egress surface is the product, fully user-directed, and honestly small.

### Dynamic code execution?

None. Sweeps for `eval(`, `exec(`, `compile(` (outside `re.compile`), `__import__`, `marshal`, `pickle`, base64-decode-then-run: zero hits across `audit.py`, `scripts/audit.py`, and the entire package. The JS adapter has no `eval`, `new Function`, `vm`, or `child_process` import; its one process launch goes through the Cordis subprocess service with a fixed argv vector (`python3 ... audit.py --url ... --output ...`, no shell), `dsh/index.js:409-441`.

## Scanner findings and adjudication

Raw counts: 0 critical, 20 high, 1 low. Gates fired: `dynamic-exec-present` (cap C), high-severity count (cap C). Mechanical grade F.

| Finding | Adjudication |
|---|---|
| EXEC-005 `dsh/index.js:428` `ctx.subprocess.spawn` | False positive for the gate's intent. Launches the bundled `audit.py` with a fixed, shell-free argv; command inputs come from validated options (`FORBIDDEN_OPTIONS` blocks caller-supplied `--key`/`--key-env` outright, `dsh/index.js:28,133-135`; URLs must be absolute http(s) without embedded userinfo, `dsh/index.js:200-209`). This is the adapter doing its one job. |
| 14x NET-007 high | All false positives: `example.com` placeholders in an issue-template prompt (`.github/ISSUE_TEMPLATE/audit-report.yml:153`), a NAS-host echo in a deploy script (`deploy/deploy-nas.sh:91`), `relay.example.com` test fixtures (`dsh/test/plugin.test.js:57-204`), and sample-data entries (`web/data-example.json:4,42,126`). None execute at runtime. |
| 5x HOOK-007 high (`.github/workflows/ci.yml:90-101`) | CI-only `npx --yes @deepseek-ai/dsh@0.1.0-rc.6` integration checks. Version-pinned, never runs on a user machine. |
| NET-008 low (`package.json:38`) | Repository self-URL. Expected. |

## Strengths

- Single-purpose egress: every network byte targets the relay under audit; two literal URLs in shipped code are both inert attribution comments.
- Credential hygiene above the bar for this category: stdin-passed curl headers (`_transport.py:33-46`), dual redaction layers (`audit.py:1847-1852,3378-3393`), secret-shape detectors for relay-side leaks (`audit.py:3238-3248`), adapter-level secret scrubbing (`dsh/index.js:353-365`).
- Adapter hardening: rejects `--key`/abbreviated controlled options (`dsh/index.js:133-141`), confines output paths to the workspace including symlink escape checks (`dsh/index.js:296-341`), caps captured child output at 64 KB (`dsh/index.js:15`).
- Verification culture: roughly 800 pytest functions across 27 test modules plus 17 node:test cases for the adapter; committed-artifact parity invariant proving root `audit.py` equals the generator output (`tests/test_dual_distribution_parity.py:5-11`).
- Honest framing: SECURITY.md, explicit "does not certify a relay is safe" disclaimer (README.md:56-60), arXiv-based threat taxonomy citations, AGPL-3.0 with NOTICE.

## Residual risks

1. **TLS verification disabled by design (most material).** curl runs with `-sk` on every transport (`_transport.py:39`, `audit.py:1591`), Step 1 recon builds unverified SSL contexts (`audit.py:5195,5245`), and a Python SSL error silently switches transport to `curl -sk` (`audit.py:1035,1302-1308`). Functional for auditing relays with broken certs and disclosed in the `APIClient` docstring, but it means your relay key can transit an unverifiable channel, and a network MITM during the audit sees the key.
2. **Key goes wherever you point it.** Both auth header styles carry the real key to the target URL (`audit.py:3583,4796`); plain `http://` targets are accepted (the adapter allows http deliberately for local relays, `dsh/index.js:203-205`; the CLI validates no scheme at all). A typo'd relay URL is a key disclosure.
3. **Recon metadata leak.** DNS/whois/nslookup queries for the relay domain tell third-party resolvers and WHOIS servers that this domain is being investigated (`audit.py:5179,5282`). Low severity, worth knowing.
4. **Ops script weaknesses.** `deploy/deploy-nas.sh:38-41` passes the NAS password as an argv argument via `sshpass -p` (process-listing exposure) and sets `StrictHostKeyChecking=no`. Deployment helper only, not part of the audit path.
5. **Undocumented Python floor.** Code uses PEP 604 unions (`int | None`, first at `audit.py:1840`); observed hard crash on Python 3.9.6. Requires 3.10+, but no minimum version is stated anywhere in README/SKILL.md; CI pins 3.11 (`.github/workflows/ci.yml:22`).
6. **Pipeline ceiling.** No S4 sandboxed probe, no S5 cross-model review, scanner covered 22 of 129 files. A staged payload invisible to static reading cannot be excluded, only made unlikely.

## Verify this yourself

```bash
# Pin the exact audited commit
git clone --depth 1 https://github.com/toby-bridges/api-relay-audit /tmp/ara && cd /tmp/ara
git fetch --depth 1 origin 00ce80208ea1178ac39116bf0843517a748e4dce && git checkout FETCH_HEAD

# Rerun the scanner (expect the same F raw output; see adjudication above)
node <dsh-bridge>/tools/scan/dist/index.js /tmp/ara

# Credential reach: expect exactly one env read, zero home-dir access
grep -rn "os.environ\|getenv\|expanduser" /tmp/ara --include='*.py'   # audit.py:5081 only
grep -rn "\.claude\|\.ssh\|\.aws\|auth\.json" /tmp/ara --include='*.py' --include='*.js'

# Egress: expect relay-targeted transports and two inert comment URLs
grep -rnoE 'https?://[a-zA-Z0-9.-]+' /tmp/ara --include='*.py' \
  | grep -v 'example\.com\|xxx\.com'                                  # audit.py:17,2643 identity_patterns.py:45

# Dynamic execution: expect no output
grep -rnE '\beval\(|new Function|\bvm\.|pickle|__import__' /tmp/ara --include='*.py' --include='*.js'

# Key redaction paths
sed -n '1847,1852p' /tmp/ara/audit.py        # report redaction
sed -n '33,46p' /tmp/ara/api_relay_audit/_transport.py   # curl --config stdin
```

Re-verify triggers: new upstream version, scanner rules bump, or 90 days elapsed.

## What this card is not

Not a substitute for the full S0-S8 pipeline. Stage S1 sealing, S2 SBOM, S4 behavioral probe, S5 dual-model adversarial review, and S8 signing were out of scope for this pass; the C grade reflects that ceiling rather than a judgment that anything hostile was found.
