# Provenance & Signing Options for the Plugin Catalog

> Status: recommendation (v1). Refines `pipeline-architecture.md` §6.3/§7 for the *user-side verification*
> story. Audience: trust implementers, reviewers, and the agent that runs `/bridge:install`.
> Charter principle served: **"Trust over speed: every claim about a third-party plugin must cite evidence."**
> A claim nobody can check mechanically is not evidence — this doc picks the checking mechanism.

## 1. The question

The catalog publishes verdicts and pins artifacts. A user's own agent, running inside DSH on the user's
machine, must be able to answer two questions before install:

1. **Q1 — Catalog integrity:** Is this verdict/card really the one the dsh-bridge pipeline produced,
   unmodified in transit and unmodified in the repo?
2. **Q2 — Artifact binding:** Is the artifact the agent is about to install byte-identical to the one
   the verdict graded?

Constraints (binding):

- **Verifiable by the user's own agent** — shell access, no interactive browser, no human key ceremonies.
- **Minimal setup** — prefer tools already on a stock macOS/Linux box: `git`, `node` (DSH requires it),
  `shasum`/`sha256sum`, OpenSSH (`ssh-keygen`), `openssl`. Every extra binary install or credential
  requirement measurably drops the fraction of users who actually verify.
- **Zero new infrastructure** — nothing self-hosted; at most services that already exist (GitHub, npm).

## 2. Two distinct provenance problems (do not conflate)

| Role | Producer | Who controls signing |
|---|---|---|
| **Catalog artifacts** — `verdict.json`, report cards, manifests | dsh-bridge CI | Us, fully |
| **Third-party plugins** — npm tarballs, `github:<owner>/<repo>` bundles | Upstream authors | Them, if anyone |

Mechanisms like npm provenance and GitHub attestations are only available when the *producer* cooperates.
For a catalog of small community plugins, upstream cooperation cannot be assumed. Therefore:

- **For Q1 (our artifacts)** we can pick any mechanism — we control the producing CI.
- **For Q2 (their artifacts)** the only universally available primitive is **content addressing**
  (cryptographic digests of pinned artifacts), recorded by us and checked by the user.

Any recommended scheme must therefore contain a digest-pinning core, plus whatever signing wrapper we
choose for the catalog's own outputs.

## 3. Options considered

### 3.1 Sigstore / cosign (keyless)

**What it is:** Sign blobs or containers using an ephemeral certificate bound to an OIDC identity
(e.g., a GitHub Actions workflow), with signatures and certificates recorded in the public Rekor
transparency log.

**What it proves:** Artifact was signed by workflow `X` in repo `Y` at a point in time that is
tamper-evidently logged. Strong identity binding; strong anti-forgery; partial anti-rollback (Rekor
inclusion timestamps).

**Agent verification today:**

```bash
cosign verify-blob \
  --certificate-identity-regexp '^https://github\.com/<org>/dsh-bridge/\.github/workflows/trust\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --signature manifest.json.sig --bundle manifest.json.bundle manifest.json
```

**Costs, honestly assessed:**

- Requires installing `cosign` (~40 MB binary) on the user's machine. Not preinstalled anywhere.
- Verification makes live calls to `fulcio.sigstore.dev`, `rekor.sigstore.dev`, `tuf.sigstore.dev`.
  Offline verification of keyless signatures does not work (cert chain + inclusion proof must be fetched;
  bundling mitigates but is not yet the default everywhere).
- Identity regexp is powerful but easy to get subtly wrong (over-broad regexes accept attacker workflows).
- Excellent fit for **container/CLI ecosystems** where cosign is already ambient. We are not that ecosystem.

**Verdict:** Best-in-class transparency, worst-in-class setup cost for our audience. This is the right
*v2* target once the catalog is popular enough that a one-time `brew install cosign` is reasonable —
which is why `pipeline-architecture.md` keeps it. For v1 it violates the minimal-setup constraint for
every single verification.

### 3.2 npm provenance

**What it is:** Packages published to the npm registry from GitHub Actions/GitLab CI carry a signed
provenance statement (in-toto, SLSA-style) linking the published tarball to its source repo, commit,
and build workflow. The npm client verifies provenance automatically on install when present.

**What it proves:** The tarball came from a CI build of the declared repo at the declared commit.
Strongest *upstream* signal available with effectively zero consumer tooling.

**Agent verification today:**

```bash
npm audit signatures          # verifies registry signatures + provenance for installed tree
npm view <pkg>@<ver> dist.attestations   # inspect what exists
```

**Costs and gaps:**

- Zero consumer setup — the best property of any option here.
- **Coverage is the killer.** Only applies to the npm channel, only when upstream publishes from
  supported CI with OIDC enabled. Community DSH plugins are frequently `github:`-only, published by hand,
  or never published to npm at all. For those, there is nothing to verify.
- Says nothing about Q1 (our catalog artifacts).
- Trusts npm registry + GitHub availability; mirrors/proxies complicate verification.

**Verdict:** Adopt opportunistically as a **bonus signal** on npm-channel plugins: when provenance
exists, the pipeline records it and the report card displays "build provenance: verified (workflow,
commit)". Never load-bearing, because absence is the common case.

### 3.3 SLSA levels

**What it is:** A framework describing how trustworthy a *build* is: Build L1 (scripted build),
L2 (hosted build service, signed provenance, authenticated source), L3 (hardened, isolated, ephemeral
builders). Consumers "achieve" levels by verifying attestations from producers at those levels.

**What it proves:** Nothing by itself. SLSA is a vocabulary, not a runnable mechanism — verification
always bottoms out in an attestation format (in-toto/Sigstore/GitHub attestations/npm provenance).

**Correct use in dsh-bridge:** as a **grading dimension on the report card**, not as an install gate:

| Card "provenance tier" | Meaning |
|---|---|
| `none` | No pin beyond existence; treated as C-ceiling per pipeline caps |
| `digest-pinned` | We pinned sha256/integrity and signed it (our v1 baseline) |
| `upstream-attested` | Upstream publishes npm provenance or GitHub attestations; we verified them |
| `build-attested-l3` | Attestation from a hardened builder (rare in this ecosystem) |

Honesty rule: our own signed manifest is *us asserting digests after the fact*. It is **not** SLSA build
provenance of the plugin, and cards must not imply it is. It proves the catalog wasn't tampered with;
it does not prove how upstream built the bytes.

**Verdict:** Adopt as terminology for the trust-report-card provenance field. Do not adopt as a
mechanism.

### 3.4 GitHub artifact attestations

**What it is:** GitHub-hosted build attestations (`actions/attest-build-provenance`): a workflow
publishes a signed SLSA-style provenance statement bound to repo/ref/workflow; consumers verify with
`gh attestation verify <artifact> -R <owner>/<repo>`.

**What it proves:** This file was built by this repo's workflow at this ref. Comparable to keyless
Sigstore but operated entirely by GitHub — no self-hosting.

**Agent verification today:**

```bash
gh attestation verify docs/catalog/cards/<slug>.json -R <org>/dsh-bridge --signer-workflow '<org>/dsh-bridge/.github/workflows/trust.yml@refs/heads/main'
```

**Costs and gaps:**

- Requires `gh` CLI (recent) **plus an authenticated token** (`GH_TOKEN`) even for verification, because
  attestations are fetched from the GitHub API. Charter reality check: gh auth on this very machine is
  broken today. An agent hitting an auth wall at verify time fails closed in practice — users skip.
- Only covers artifacts produced in GitHub Actions by repos that opted in. Same coverage cliff as
  npm provenance for third-party plugins.
- Network + account dependency for a security check that should work air-gapped off a git clone.

**Verdict:** The natural *upgrade* for our own CI outputs (it is strictly richer than a bare
signature: it carries build provenance). Blocked as the v1 user-side verifier by the token requirement.
Revisit alongside the cosign move in v2; note that a cosign-keyless signature over the same artifact
gives equivalent assurance without the gh-token prerequisite.

### 3.5 Checksums + signed manifest, committed in-repo

**What it is:** One canonical JSON manifest listing every catalog entry: the pinned subject (commit
SHA / npm version + integrity / tarball sha256), the card digest, grade, and revision — signed with a
detached **SSHSIG** signature (`ssh-keygen -Y sign`), public key committed beside it, private key held
only in CI.

**What it proves:** Q1 fully (catalog contents are exactly what the pipeline signed, detectably
unmodified in transit *and* against unauthorized repo writes that don't hold the key), and Q2 via the
pins it carries (digest equality between graded artifact and installed artifact).

**What it does *not* prove:** How upstream built the plugin (see §3.3 honesty rule), and it has **no
transparency log**, so a key-compromised signer could sign a plausible-looking older manifest
(rollback/freeze — see §6).

**Why it fits the constraints better than everything else:**

- **Verification stack is 100% preinstalled** on stock macOS and Linux: `git`, `ssh-keygen -Y verify`
  (OpenSSH ≥ 8.0, shipped for years), `shasum`/`sha256sum`, `node` (DSH requires it anyway).
- **No accounts, tokens, or API endpoints** — works offline after one git fetch, no `GH_TOKEN`, no
  cosign download, no registry round-trips except the ones any install needs anyway.
- **Zero new infrastructure** — the manifest is just files in the repo, versioned and auditable in git
  history, diffable in review PRs.
- Key management is ordinary SSH: ed25519 keypair, private half in a GitHub Actions environment secret,
  public half committed and fingerprint-published out-of-band.

**Verdict:** Recommended for v1. Details below.

## 4. Comparison matrix

Scored against the binding constraints (§1). `●` good · `◑` partial · `○` weak.

| Criterion | cosign keyless | npm provenance | SLSA levels | GH attestations | Signed manifest |
|---|---|---|---|---|---|
| User-agent setup cost | ○ install binary | ● none | n/a (vocab) | ○ gh + token | ● preinstalled tools |
| Works offline / air-gapped | ○ | ○ | n/a | ○ | ● |
| New infrastructure | ◐ public sigstore | ● none (GitHub CI) | — | ● none (GitHub) | ● none |
| Covers our catalog artifacts (Q1) | ● | ○ | — | ● | ● |
| Covers third-party plugins (Q2) | ● if they sign | ○ npm-only | — | ○ opt-in only | ● via digest pinning |
| Anti-forgery strength | ● | ● | — | ● | ● |
| Tamper-evident timeline (anti-rollback) | ● Rekor | ● | — | ● | ○ git history only |
| Build-process provenance | ◐ optional | ● | — | ● | ○ digests only |

No single option wins everything; the matrix is why the recommendation is a layered scheme rather than
a brand.

## 5. Recommendation (v1): the **Sealed Manifest** scheme

One scheme, three layers, in priority order:

1. **Sealed Manifest (mandatory, always present):** every catalog entry pinned by digest in a single
   canonical `manifest.json`, SSHSIG-signed by the pipeline key, committed in-repo. Answers Q1 and Q2
   for every channel.
2. **Upstream attestations (bonus, recorded when available):** npm provenance / GitHub attestations on
   third-party plugins are verified by the pipeline at vetting time and surfaced on the report card as
   the provenance tier (§3.3). Absence costs nothing; presence raises confidence.
3. **Cosign keyless / GitHub attestations (deferred to v2):** when adoption justifies asking users to
   install a binary or authenticate `gh`, the same manifest gains a second, transparency-logged
   signature. The v1 verification path keeps working unchanged.

This amends `pipeline-architecture.md` §6.3: keyless cosign moves from "primary path" to "planned v2";
SSHSIG-over-manifest is primary for v1. Everything else in the trust pipeline (stages S0–S8, grades,
caps, storage layout) is unchanged; the manifest sits beside `docs/catalog/index.json` and supersedes
it as the signed root.

### 5.1 Manifest shape

```json
{
  "schema": "dsh-bridge/manifest@1",
  "revision": 42,
  "issued_at": "2026-08-25T00:00:00Z",
  "signer": "bridge-catalog",
  "plugins": {
    "mengyuly__dsh-ponytail": {
      "grade": "A",
      "revision": 3,
      "issued_at": "2026-08-25T00:00:00Z",
      "card_sha256": "<sha256 of cards/mengyuly__dsh-ponytail.json bytes>",
      "verdict_digest": "<as in the card>",
      "subject": {
        "source": "npm",
        "npm": { "name": "@mengyuly/dsh-ponytail", "version": "0.1.3", "integrity": "sha512-…" },
        "tarball_sha256": "<…>"
      },
      "evidence": { "filetree_sha256": "<sha256 of evidence/<verdict_digest>/filetree.json>" }
    }
  }
}
```

Layout (extends §6 of the pipeline doc):

```
docs/catalog/
  manifest.json          # the signed root
  manifest.json.sig      # SSHSIG detached signature, namespace dsh-bridge-catalog@v1
  catalog.pub            # active signing public key (one per line, with comment = fingerprint)
  RETIRED-PUBKEYS.md     # retired keys, rotation dates, incident notes
  cards/<slug>.{md,json}
  evidence/<verdict_digest>/filetree.json
```

Signing side (CI, the only place the private key exists):

```bash
ssh-keygen -t ed25519 -f bridge-catalog-key -C "bridge-catalog $(date -u +%F)"   # one-time ceremony
# private key -> GitHub Actions environment secret; public key -> docs/catalog/catalog.pub
ssh-keygen -Y sign -f bridge-catalog-key -n dsh-bridge-catalog@v1 manifest.json  # per publish
```

Rules: the manifest and its signature land in the same commit; `revision` increases monotonically;
keys rotate by adding a new `catalog.pub` line and moving the old one to `RETIRED-PUBKEYS.md`; the key
fingerprint is also printed in each GitHub Release body (out-of-band anchor for key-substitution
attacks on the repo itself).

### 5.2 Exact verification steps for the user's agent

Copy-pasteable, stock-tooling-only, exits nonzero on any failed gate so the agent can trust exit codes
over prose. Parameterize `REPO_URL`; `<slug>` and `<catalog-commit>` come from `/bridge:install` output.

```bash
#!/usr/bin/env bash
# bridge-verify.sh <plugin-slug> <catalog-commit>
set -euo pipefail
SLUG="${1:?usage: bridge-verify.sh <slug> <catalog-commit>}"
COMMIT="${2:?missing catalog commit}"
REPO_URL="${REPO_URL:-https://github.com/<org>/dsh-bridge}"
NS="dsh-bridge-catalog@v1"; MAX_AGE_DAYS=90
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

sha() { if command -v shasum >/dev/null; then shasum -a 256 "$@"; else sha256sum "$@"; fi; }
field() { SLUG="$SLUG" node -e '
  const fs=require("fs");
  const m=JSON.parse(fs.readFileSync("docs/catalog/manifest.json","utf8"));
  const e=m.plugins[process.env.SLUG];
  if(!e){console.error("FAIL: slug not in signed manifest");process.exit(1)}
  const p=e.subject.npm||{};
  console.log(eval(process.argv[1]));' "$1"; }

say(){ printf '%s\n' "$*"; }

# Gate 1 — catalog at the exact advertised commit (blobless clone: fast, deterministic)
git clone -q --filter=blob:none --no-checkout "$REPO_URL" "$WORK/repo"
git -C "$WORK/repo" checkout -q "$COMMIT"
cd "$WORK/repo"
say "PASS 1  catalog fetched at pinned commit $COMMIT"

# Gate 2 — signature: the pipeline key signed these exact bytes
printf 'bridge-catalog %s\n' "$(cat docs/catalog/catalog.pub)" > "$WORK/allowed_signers"
ssh-keygen -Y verify -f "$WORK/allowed_signers" -I bridge-catalog -n "$NS" \
  -s docs/catalog/manifest.json.sig < docs/catalog/manifest.json
say "PASS 2  manifest signature valid (key $(awk '{print $2}' docs/catalog/catalog.pub | head -c 16)…)"

# Gate 3 — freshness: refuse silently-stale advice
AGE=$(( ($(date +%s) - $(node -pe 'Date.parse(process.argv[1])/1000' \
  "$(node -pe 'JSON.parse(require("fs").readFileSync("docs/catalog/manifest.json","utf8")).issued_at')" \
)) / 86400 ))
[ "$AGE" -le "$MAX_AGE_DAYS" ] || { say "FAIL 3  manifest is $AGE days old (> $MAX_AGE_DAYS)"; exit 1; }
say "PASS 3  manifest fresh ($AGE days old, rev $(node -pe 'JSON.parse(require("fs").readFileSync("docs/catalog/manifest.json","utf8")).revision'))"

# Gate 4 — card integrity: card file matches the signed digest, verdict ids agree
CARD="docs/catalog/cards/${SLUG}.json"
WANT_CARD=$(field 'e.card_sha256');  WANT_VD=$(field 'e.verdict_digest')
GOT_CARD=$(sha "$CARD" | awk '{print $1}')
GOT_VD=$(node -pe 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).verdict_digest' "$CARD")
[ "$GOT_CARD" = "$WANT_CARD" ] || { say "FAIL 4  card bytes != signed digest"; exit 1; }
[ "$GOT_VD" = "$WANT_VD" ]     || { say "FAIL 4  verdict_digest mismatch card vs manifest"; exit 1; }
say "PASS 4  report card matches signed manifest (grade $(node -pe 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).grade' "$CARD"))"

# Gate 5 — artifact binding: what you are about to install IS what was graded
SRC=$(field 'e.subject.source')
if [ "$SRC" = "npm" ]; then
  NAME=$(field 'e.subject.npm.name'); VER=$(field 'e.subject.npm.version')
  WANT_INT=$(field 'e.subject.npm.integrity')
  GOT_INT=$(npm view "$NAME@$VER" dist.integrity)
  [ "$GOT_INT" = "$WANT_INT" ] || { say "FAIL 5  registry integrity changed under us"; exit 1; }
  TARBALL=$(cd "$WORK" && npm pack "$NAME@$VER" --json \
            | node -e 'console.log(JSON.parse(require("fs").readFileSync(0))[0].filename)')
  GOT_TGZ=$(sha "$WORK/$TARBALL" | awk '{print $1}')
  [ "$GOT_TGZ" = "$(field 'e.subject.tarball_sha256')" ] || { say "FAIL 5  tarball digest mismatch"; exit 1; }
  say "PASS 5  npm tarball $NAME@$VER byte-identical to graded artifact"
else
  OWNER_REPO=$(field 'e.subject.github_repo'); WANT_COMMIT=$(field 'e.subject.commit')
  git ls-remote "https://github.com/${OWNER_REPO}.git" | grep -q "^${WANT_COMMIT}" \
    || { say "FAIL 5  upstream commit gone/rewritten"; exit 1; }
  git clone -q --filter=blob:none "https://github.com/${OWNER_REPO}.git" "$WORK/src"
  git -C "$WORK/src" checkout -q "$WANT_COMMIT"
  # the loaded artifact is lib/**, not src/** — check per-file digests from the evidence filetree
  FT="docs/catalog/evidence/$(field 'e.verdict_digest')/filetree.json"
  node -e '
    const fs=require("fs"),cp=require("child_process"),root=process.argv[1],ft=process.argv[2];
    for(const f of JSON.parse(fs.readFileSync(ft,"utf8")).files.filter(f=>f.path.startsWith("lib/"))){
      const got=cp.execSync(`shasum -a 256 "${root}/${f.path}" | cut -d" " -f1`).toString().trim();
      if(got!==f.sha256){console.error(`FAIL 5  ${f.path} differs from graded evidence`);process.exit(1)}
    }' "$WORK/src" "../../../$FT" 2>/dev/null || FT="$PWD/$FT"
  say "PASS 5  github source at $WANT_COMMIT; lib/** digests match graded evidence"
fi

say "RESULT  $SLUG: SEALED MANIFEST VERIFIED — safe to proceed with /bridge:install"
```

Optional deeper check (reproduces the verdict itself, needs the trust toolchain):
`npx @dsh-bridge/trust replay docs/catalog/cards/<slug>.json --no-cache` — see
`pipeline-architecture.md` §7. The gates above stand alone without it.

**Agent-interface rule:** the agent treats this script's exit status as ground truth. It must not
summarize a failed gate as a success, and it must show the user the `RESULT` line verbatim before
installing. (A verifying agent that can be talked into skipping gates is part of the threat surface.)

## 6. Known gaps of the recommended scheme (stated plainly)

| Gap | Attack | v1 mitigation | v2 fix |
|---|---|---|---|
| No transparency log | Compromised CI key signs a fake-but-plausible manifest | Monotonic `revision` + `issued_at`; key in protected environment secret only; fingerprint echoed in GitHub Releases | Add cosign/Rekor second signature (§5 layer 3) |
| Repo content rewrite | Attacker with repo write swaps cards/evidence but not manifest | Gates 2+4 catch any mismatch with signed digests | Same |
| Key substitution in repo | Attacker replaces `catalog.pub` + re-signs | Out-of-band fingerprint (release bodies, README badge); `RETIRED-PUBKEYS.md` audit trail | Web-of-anchor publication |
| Garbage signed honestly | Upstream plugin is malicious but pipeline misses it | Out of scope for provenance — this is the adversarial-audit layer's job (charter §3) | — |
| Registry/upstream vanishes post-vetting | Pin no longer resolvable | Gate 5 fails loudly (`gone/rewritten`), card stays as historical record | Mirror pinned tarballs in releases |

## 7. Decision record

- **Chosen:** Sealed Manifest — digest pins + SSHSIG-signed canonical manifest in-repo (§5).
- **Rejected for v1:** cosign (setup cost + network dependency on every user verification), GitHub
  attestations as the verifier (token prerequisite), npm provenance as a backbone (coverage cliff on
  `github:`-channel plugins).
- **Adopted as vocabulary:** SLSA-derived provenance tiers on the report card (§3.3).
- **Revisit trigger:** sustained catalog traffic, or any incident where git-history auditing proved too
  slow → implement layer 3 (cosign keyless over the same manifest; verification script gains a second
  optional gate, first four unchanged).
