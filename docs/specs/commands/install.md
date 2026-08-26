# `/install` — verified plugin installer

**Command:** `/install <plugin>`
**Alias:** `/bridge-install <plugin>`
**Owner:** dsh-bridge trust layer (CHARTER.md § 3 "Verified installer & trust layer", § 4 "Curated discovery")
**Status:** spec, not yet implemented.

---

## 1. Purpose

`/install` is the one command that stands between a user and arbitrary third-party code
executing inside their harness process. It exists because the runtime will not do this for
them: per `docs/audits/dsh-builtin-redteam.md` § F3, `dsh plugin add` is a thin `pnpm`
forwarder, and git-hosted plugins run `prepare` scripts **at install time** — before any
sandbox, approval, or permission row is ever consulted. By F2, an installed bundle's
`cordis.patch.yml` is a last-write-wins layer that can silently disable the approval and
sandbox rows entirely.

Therefore install-time review is the only review that matters, and `/install` must:

1. **Resolve** a human-typed name against the dsh-bridge verified catalog
   (`docs/catalog/manifest.json`) rather than against whatever npm/GitHub says.
2. **Show evidence before action** — a trust card summary and letter grade, sourced from a
   published audit with `file:line` citations (CHARTER.md: "every claim about a third-party
   plugin must cite evidence").
3. **Offer a path for the unlisted** — an adversarial review flow, so "not in the catalog"
   means "not reviewed yet", never a dead end.
4. **Install via the native mechanism** — `dsh plugin --profile <p> add <spec>` with a
   `github:`, `npm:`, or `tgz:` specifier. dsh-bridge wraps `dsh plugin`; it never
   reimplements resolution, linking, or profile bookkeeping.
5. **Verify after the fact** — confirm the bundle layer actually composed and its mounted
   skills/commands appear, so a silent no-op install is reported as a failure.

**Non-goals.** `/install` does not sandbox the plugin (DSH's sandbox governs filesystem
effects only and is not a plugin containment boundary — redteam § 0). It does not promise
safety; it promises *evidence, consent, and reversibility*. It does not publish, author, or
update plugins (see `/uninstall`, `/plugins`).

---

## 2. User stories

### Persona A — "Dana", the Claude Code refugee

Dana has muscle memory from `/plugin install`. She types `/install ponytail`, expects a
short pause and a working plugin, and has no interest in reading a security report.

> As Dana, I want `/install ponytail` to just work for anything the catalog already grades
> A/B, so that the trust layer costs me one extra keystroke (`y`) and not five minutes.

*Acceptance signal:* grade ≥ B, single confirm, done in one screen. No scrolling required.

### Persona B — "Sam", the security-conscious platform engineer

Sam installs plugins on a laptop that also holds production credentials. He has read that
plugins run `prepare` scripts. He will not type `y` to a summary; he wants the evidence.

> As Sam, I want the trust card to name the specific capabilities found (network egress,
> credential paths, `child_process`, patch rows touching `approval`/`sandbox`) with
> `file:line` citations I can open, and I want `--dry-run` to show me the exact
> `dsh plugin add` invocation before anything executes.

*Acceptance signal:* `/install <p> --report` prints the full audit path and refuses to
install in that mode. Every capability line is clickable/greppable.

### Persona C — "Wei", the plugin author with an unlisted plugin

Wei wrote `dsh-zhipu-router` last week. It is on GitHub, nobody has audited it, and he
wants to install his own work — and eventually get it graded.

> As Wei, I want an unlisted name to offer me the adversarial review flow rather than a
> flat refusal, and I want an explicit, clearly-labelled escape hatch to install my own
> unreviewed code without pretending it was verified.

*Acceptance signal:* unlisted resolution offers `[R]eview` / `[I]nstall anyway` /
`[C]ancel`, and choosing `I` requires typing a word, not pressing a key.

---

## 3. Resolution order

`<plugin>` is resolved by the first rule that matches. Resolution is **deterministic and
offline-first**: rules 1-3 consult only the in-repo catalog.

| # | Input shape | Source | Result |
|---|---|---|---|
| 1 | Exact catalog `id` (`ponytail`) | `docs/catalog/manifest.json` | **Verified** — trust card + grade |
| 2 | Catalog `aliases[]` (`dsh-ponytail`, `@dsh/ponytail`) | same | **Verified**, resolved id shown in the card header |
| 3 | Fuzzy match, edit distance ≤ 2 or unique prefix | same | **Disambiguation prompt**; never auto-selects |
| 4 | Explicit specifier (`github:owner/repo`, `npm:pkg`, `tgz:./p.tgz`, `./path`) | user-supplied | **Unlisted** — reverse-lookup the catalog by `source` first; if a catalog entry has this exact source, promote to rule 1 |
| 5 | Bare name, no catalog hit | npm/GitHub existence probe (network, announced) | **Unlisted** — candidate shown with resolved source for confirmation |
| 6 | Nothing resolves | — | **Not found**: near-misses listed, `/plugins search` suggested |

**Ambiguity is never resolved silently.** If rule 3 or 5 produces more than one candidate,
`/install` prints the candidates with their grades and exits code 2 awaiting a precise name.

**Catalog contract.** `docs/catalog/manifest.json` is the single source of truth. Each entry
supplies at minimum: `id`, `aliases[]`, `source` (a native specifier), `pinned` (commit SHA
or exact version), `grade` (`A`|`B`|`C`|`D`|`F`), `audit` (repo-relative path to the report
under `docs/audits/`), `audited_at`, `audited_commit`, `capabilities[]`, and
`provides` (`skills[]`, `commands[]`, `tools[]`) used by § 7 post-install verification.

**Staleness.** If `audited_commit` ≠ the commit that would be installed, the entry is
downgraded to **Unlisted (stale audit)** for this run and takes the § 5 unverified path.
A verified grade applies to a *pinned artifact*, never to a moving branch. Verified installs
always install the pinned ref, not `HEAD`.

---

## 4. Flow

```
  /install <plugin>
        │
        ▼
  ┌───────────────────┐   no match   ┌──────────────────────┐
  │ resolve (§3)      ├─────────────►│ not found: near      │
  │ catalog → source  │              │ misses + /plugins    │──► exit 2
  └────────┬──────────┘              └──────────────────────┘
           │
     ┌─────┴───────────────┐
     │                     │
 verified              unlisted / stale audit
     │                     │
     ▼                     ▼
┌──────────────┐    ┌──────────────────────────────┐
│ TRUST CARD   │    │ UNVERIFIED WARNING (§5.2)    │
│ grade + evi- │    │ "nobody has reviewed this"   │
│ dence + caps │    └──────┬────────────┬──────────┘
└──────┬───────┘           │            │
       │              [R]eview     [I]nstall anyway
       │                   │            │
       │                   ▼            ▼
       │        ┌─────────────────┐  ┌─────────────────────┐
       │        │ adversarial     │  │ RISK CONSENT GATE   │
       │        │ review flow §6  │  │ type: install       │
       │        │ → audit report  │  │ unverified          │
       │        │ → grade         │  └──────────┬──────────┘
       │        └────────┬────────┘             │
       │                 │ grade ≥ C            │
       │                 ▼                      │
       ▼            (re-enter card)             │
┌─────────────────┐      │                      │
│ CONFIRM  [y/N]  │◄─────┘                      │
└────────┬────────┘                             │
         │                                      │
         └──────────────┬───────────────────────┘
                        ▼
            ┌───────────────────────────┐
            │ PRE-FLIGHT                │
            │ • profile resolved        │
            │ • snapshot profile pkg +  │
            │   cordis.patch.yml        │
            │ • scripts policy declared │
            └────────────┬──────────────┘
                         ▼
            ┌───────────────────────────┐   fail   ┌──────────────┐
            │ dsh plugin --profile <p>  ├─────────►│ ROLLBACK to  │
            │   add <pinned specifier>  │          │ snapshot §7.3│──► exit 1
            └────────────┬──────────────┘          └──────────────┘
                         ▼
            ┌───────────────────────────┐   fail
            │ VERIFY (§7)               ├─────────► ROLLBACK ──► exit 1
            │ • bundle in dsh.profile   │
            │ • --dump-config layer     │
            │ • provides[] mounted      │
            │ • patch diff vs declared  │
            └────────────┬──────────────┘
                         ▼
                    SUCCESS SUMMARY
              (what mounted, how to undo)
```

---

## 5. Consent UX copy

Copy is normative: implementations may re-wrap for width but must not soften wording,
drop a citation, or add a default-yes to §5.2.

### 5.1 Verified trust card (Dana's path)

```
  ponytail  ·  Grade A  ·  verified 2026-08-22

  dsh-ponytail — Claude Code command surface ported to DSH
  github:beartackler/dsh-ponytail @ 4f1c2ab  (pinned)

  Capabilities found by audit:
    • filesystem: reads ~/.claude/settings.json  (src/detect.ts:41)
    • network:    none
    • exec:       none                        no child_process, no eval
    • patch:      adds 3 skill rows; touches no approval/sandbox row

  Full report: docs/audits/dsh-ponytail.md

  Install into profile "web"?  [y/N]
```

Rules: the grade line is always first; `network: none` and `exec: none` are stated
explicitly rather than omitted, so absence is a positive claim; the profile name is always
shown because installing into the wrong profile is a real and confusing failure.

### 5.2 Unverified warning (Wei's and Sam's path)

```
  ⚠  dsh-zhipu-router is NOT in the dsh-bridge verified catalog.

  Nobody has reviewed this plugin. Installing it means:
    • its install (`prepare`) script runs on your machine BEFORE any
      permission check — DSH consults approval only for sandbox
      escalation, not for install-time code
    • it loads inside the harness process with full context access
    • its config layer can disable your approval and sandbox rows
      silently (see docs/audits/dsh-builtin-redteam.md § F2)

  Source: github:wei/dsh-zhipu-router @ 9ab31de

  [R] Run adversarial review first  (recommended, ~2 min, offline)
  [I] Install anyway, unverified
  [C] Cancel
```

No default action. Bare `Enter` re-prints the prompt. `--yes` does **not** satisfy this
prompt; only `--i-accept-unverified-risk` does, and that flag is never suggested by the UI.

### 5.3 Risk consent gate (only after `[I]`)

```
  You are installing unreviewed third-party code that will execute
  with your user's privileges.

  Type exactly:  install unverified
  >
```

Any other input cancels. A grade `D` or `F` catalog entry routes here too, with the
failing findings reprinted above the prompt. Grade `F` additionally requires `--force` on
the command line; it cannot be reached by prompt alone.

### 5.4 Success summary

```
  ✓ ponytail installed into profile "web"

    bundle layer:  dsh-ponytail   (position 2 of 3)
    mounted:       /review  /compact  /memory   (3 of 3 declared)

    Undo:  /uninstall ponytail        (or: dsh plugin --profile web
                                       remove dsh-ponytail)
```

Every install ends by printing its own undo command. Reversibility is stated, not assumed.

---

## 6. Adversarial review flow (`[R]`)

`[R]` hands off to the dsh-bridge auditor pipeline (`/audit <source>`, specified
separately) with `--from install`, and returns to `/install` with a grade.

1. **Fetch without executing.** Tarball or `git archive` into a temp dir. No `pnpm install`,
   no lifecycle scripts, no build. Fetch-without-execute is the entire premise; if it
   cannot be guaranteed for a source type, the flow refuses that source.
2. **Static pass.** Network egress, credential-path reads (`~/.dsh/.credentials.yaml`,
   `~/.claude`, `~/.codex`, `~/.aws`), `child_process`/`eval`/`new Function`, obfuscation
   signals, and `package.json` lifecycle scripts (`prepare`, `postinstall`).
3. **Patch pass.** Parse `cordis.patch.yml`: flag any row touching `approval`, `sandbox`,
   `permission`, or model routes, and any `!!js` tag (redteam § F2). Any `!!js` tag is an
   automatic `F`.
4. **Grade.** `A` clean · `B` benign capabilities, all disclosed · `C` broad capabilities,
   justified · `D` undisclosed sensitive capability · `F` permission downgrade, dynamic
   eval, or obfuscation.
5. **Publish.** Write `docs/audits/<id>.md` with `file:line` citations and record
   `audited_commit`. Catalog inclusion is a separate, human-reviewed PR — `/install` never
   writes `manifest.json` itself.

Grade ≥ C re-enters § 5.1 with a "freshly reviewed, not yet catalogued" banner. Grade
`D`/`F` routes to § 5.3 with findings shown. Review is advisory, never silently blocking:
the user can always cancel, and can always reach § 5.3.

---

## 7. Post-install verification

An install that reports success without composing a layer is the failure mode most likely
to be mistaken for success, so verification is mandatory, not a flag.

1. **Dependency + manifest.** The package appears in the profile's `package.json`
   `dependencies`, and its name appears in `dsh.profile.bundles`. A package lacking
   `dsh.bundle` installs as a plain dependency and activates **no layer** — dsh-bridge
   surfaces this as a warning, not a success.
2. **Composition.** `dsh --profile <p> --dump-config` contains the `# == <package>` layer
   marker. This checks composition without booting a session.
3. **Mounts.** Every entry in the catalog's `provides.skills[]` / `provides.commands[]`
   appears in the composed config. Partial mounts (`2 of 3`) are reported as a warning with
   the missing names listed.
4. **Patch diff.** The rows the plugin actually inserted are diffed against the audited
   capability list. Any undeclared row touching `approval`, `sandbox`, or model routes is a
   **hard failure** → rollback + a catalog-integrity issue is printed for reporting.

### 7.3 Rollback

Pre-flight snapshots the profile's `package.json` and `cordis.patch.yml`. Any failure in
install or verification restores both and runs
`dsh plugin --profile <p> remove <package>` best-effort. Rollback restores *configuration*;
it cannot undo side effects of an install script that already ran, and the failure message
says so plainly, naming what to inspect.

---

## 8. Failure modes

| # | Condition | Behavior | Exit |
|---|---|---|---|
| F-1 | Name not found anywhere | Near-misses + `/plugins search <term>` | 2 |
| F-2 | Ambiguous fuzzy match | Candidate list with grades; no auto-select | 2 |
| F-3 | Catalog entry stale (`audited_commit` ≠ install ref) | Downgrade to unverified path § 5.2, reason stated | — |
| F-4 | `manifest.json` missing/unparseable | **Fail closed**: every name is unlisted; banner "catalog unavailable, trust layer degraded" | — |
| F-5 | Catalog `source` unreachable (network/404/private) | Report resolved specifier + underlying error; never silently fall back to npm | 1 |
| F-6 | Pinned ref no longer exists (force-push, unpublished version) | Refuse. Never install `HEAD` in place of a pinned ref | 1 |
| F-7 | `dsh plugin add` fails (pnpm resolution, peer deps, network) | Surface verbatim pnpm output, rollback § 7.3 | 1 |
| F-8 | Install blocked on lifecycle-script allowlist | Explain that `prepare` executes arbitrary code, restate grade, require § 5.3 gate to proceed; **never** auto-allowlist | 1 or retry |
| F-9 | Install succeeds, no `dsh.bundle` → no layer | Warn: "installed as a plain dependency, no plugin activated" | 0 (warn) |
| F-10 | Layer marker absent from `--dump-config` | Rollback, report as failed install | 1 |
| F-11 | Declared skills/commands partially mounted | Warn with missing names; keep install; suggest `/doctor` | 0 (warn) |
| F-12 | Undeclared approval/sandbox/model-route row detected | **Hard fail**, rollback, print catalog-integrity report instructions | 1 |
| F-13 | Package already installed, same pinned ref | No-op, print current grade and mounts | 0 |
| F-14 | Installed at a different version/ref | Show both refs and both grades; require explicit confirm to change | — |
| F-15 | Profile does not exist | Offer to create it (`dsh plugin` initializes with `@deepseek-ai/dsh-base`); never create silently | — |
| F-16 | Non-interactive TTY (CI, piped) and consent required | Refuse; print the exact flag needed. Consent prompts are never auto-answered | 1 |
| F-17 | Interrupted mid-install (SIGINT) | Run rollback § 7.3, state that install scripts may already have run | 130 |
| F-18 | Disk/permission error writing profile | Report path and error; snapshot restored | 1 |

---

## 9. Acceptance criteria

**Resolution**

- AC-1 `/install ponytail` resolves via catalog `id` and prints the trust card without a
  network call, with `manifest.json` as the only input.
- AC-2 Aliases resolve to the same entry; the card header shows the canonical `id`.
- AC-3 An ambiguous or absent name never installs anything and exits 2.
- AC-4 A raw `github:`/`npm:`/`tgz:` specifier matching a catalog `source` is promoted to
  verified; one that does not takes the unverified path.

**Trust presentation**

- AC-5 The card shows grade, pinned ref, capabilities, and the audit path; `network` and
  `exec` are stated explicitly even when empty.
- AC-6 Every capability line carries a `file:line` citation resolvable in the audit report.
- AC-7 `--report` prints the full audit and exits 0 **without installing**.
- AC-8 A stale audit (`audited_commit` mismatch) is never presented as verified.

**Consent**

- AC-9 Unverified install requires typing `install unverified`; no keypress, `--yes`, or
  `Enter` satisfies it.
- AC-10 Grade `F` additionally requires `--force`; unreachable by prompt alone.
- AC-11 In a non-interactive session, any consent-requiring install refuses and names the
  exact flag (F-16).
- AC-12 The unverified warning names all three risks in § 5.2 verbatim, including the
  install-time execution claim with its audit citation.

**Installation**

- AC-13 The only installation mechanism invoked is `dsh plugin --profile <p> add <spec>`;
  the spec string appears in `--dry-run` output byte-for-byte identical to what runs.
- AC-14 Verified installs pin (commit SHA or exact version); a pinned ref that no longer
  exists is refused, never substituted with `HEAD` (F-6).
- AC-15 Lifecycle-script allowlisting is never performed automatically (F-8).

**Verification**

- AC-16 Success requires: bundle in `dsh.profile.bundles`, layer marker in `--dump-config`,
  and ≥ 1 declared mount present.
- AC-17 A package with no `dsh.bundle` reports "no plugin activated", not success (F-9).
- AC-18 Partial mounts warn with the missing names listed (F-11).
- AC-19 An undeclared `approval`/`sandbox`/model-route row triggers rollback and a
  catalog-integrity report (F-12).

**Safety & reversibility**

- AC-20 Every failure path leaves `package.json` and `cordis.patch.yml` byte-identical to
  the pre-flight snapshot.
- AC-21 Every success prints its undo command.
- AC-22 No secret, token, or credential file content is ever printed, including in the
  verbatim pnpm output of F-7 (redaction applies to `--report` and error paths alike).
- AC-23 With `manifest.json` absent, the command still runs, fails closed to unverified,
  and says the trust layer is degraded (F-4).
