# Analytics Plan: dsh-bridge

Status: draft
Owner: growth analyst role
Constraint source: CHARTER.md principle 6, "User owns their machine: no telemetry without opt-in, no network calls except documented ones." This plan treats that as a hard boundary, not a preference. Every measurement below either uses public data, runs on our own server against opted-in visitors, or does not exist.

## 1. Philosophy

The product-analytics discipline says "track everything." We reject that sentence and keep the rest of the discipline: one North Star, defined events, one funnel, weekly review. What changes under this charter:

1. **Public data first.** Anything observable from public surfaces (GitHub API, our own server logs of opted-in requests) costs the user zero privacy. Prefer it.
2. **Consent before collection.** The site collects nothing until a visitor actively opts in. Declining leaves no trace: no cookie set, no beacon fired, no record of the refusal beyond an aggregate counter.
3. **The plugin is a black box by design.** dsh-bridge never phones home. Not anonymized, not aggregated, not once. Usage measurement inside the harness is someone else's product decision; it will never be ours.
4. **Views, not identities.** We count events, not people. Where that makes a standard metric (DAU, retention, unique visitors) impossible to compute honestly, we drop the metric instead of sneaking in an identifier. Section 8 lists these drops.

## 2. North Star and metric hierarchy

**North Star: weekly net GitHub stars.**

Why it fits the skill's four tests here:

- Represents customer value: a star is a deliberate, public endorsement from a developer who read the README. It is the closest thing to a signed statement of value that exists without tracking anyone.
- Correlates with the mission: the charter names star collection as the growth goal.
- Measurable frequently: daily snapshot, reviewed weekly.
- Rallyable: one number, unambiguous.

```
Weekly net stars  (North Star)
  ├── Acquisition inputs
  │     ├── Referral traffic to repo (GitHub traffic API, aggregate)
  │     └── External link clicks visible in referrers (aggregate domains only)
  ├── Activation inputs (site, opted-in visitors only)
  │     ├── Trust report cards opened
  │     └── Install commands copied
  └── Adoption proxies (public, aggregate)
        ├── Clone velocity (GitHub traffic API)
        └── Forks and open issues (repo activity signal)
```

Deliberately absent from this tree: DAU/WAU/MAU, retention cohorts, LTV, viral coefficient. Section 8 explains why each is out.

## 3. Measurement surfaces

| Surface | Mechanism | Identifies anyone? | Opt-in needed? |
|---|---|---|---|
| Repo | Daily `gh api` snapshots of public metrics | No (aggregate) | No |
| Site | Self-hosted counter, fires only after consent | No (event rows only) | Yes |
| Plugin | None. Zero phone-home, permanently | N/A | N/A |

### 3.1 Repo snapshots (gh api)

A scheduled script (`scripts/snapshot-github.sh`) calls the GitHub REST API once per day and appends a JSON line to `tools/analytics-snapshots/github/YYYY-MM-DD.json` (committed weekly, batched):

```json
{
  "date": "2026-08-26",
  "stars": 0,
  "forks": 0,
  "open_issues": 0,
  "watchers": 0,
  "clones_14d": 0,
  "unique_cloners_14d": 0,
  "views_14d": 0,
  "unique_viewers_14d": 0,
  "top_referrers": [{ "referrer": "news.ycombinator.com", "count": 0 }],
  "popular_paths": [{ "path": "/timurmonasypov/dsh-bridge", "count": 0 }]
}
```

Notes:

- `clones`, `views`, `referrers`, `popular_paths` come from the GitHub traffic API (`GET /repos/{owner}/{repo}/traffic/clones|views|referrers|popular/paths`). GitHub provides these to repo maintainers already, aggregated with a 14-day window. We are reading a meter that exists anyway, not adding instrumentation.
- Referrers are stored as bare domains, exactly as GitHub returns them. No URLs, no query strings.
- Prerequisite: `gh` must be re-authenticated (charter notes current auth is broken). Until then this surface is blocked, not skipped.

### 3.2 Site counter (self-hosted, opt-in)

The static site gains one small component and one tiny endpoint on our own host. No third party ever receives a request from a visitor's browser.

**Consent gate.** First visit shows a plain banner: "Count page views to help improve dsh-bridge? Nothing is shared with third parties. No cookies, no identifiers." Two equal-weight buttons: Count me / No thanks. Default is off. Declining stores nothing client-side and sends nothing; the choice is simply re-asked next visit (asking again is honest; remembering the refusal would require storage, which contradicts the promise).

**What one opted-in page view records.** A single `POST` to our endpoint creates one row:

```json
{
  "ts": "2026-08-26T12:00:00Z",
  "path": "/trust/dsh-market/",
  "referrer_host": "news.ycombinator.com",
  "sid": "b7c1..."
}
```

Field rules:

- `path`: relative path only. Never query strings (they can carry PII from other sites).
- `referrer_host`: `document.referrer` reduced to hostname. Full referrer URLs leak search terms and tokens.
- `sid`: random UUID generated in memory when the tab opens, never written to storage, dies with the tab. It exists only so five rapid clicks in one visit count as one session per path, not five. It cannot identify anyone across visits because nothing persists it. This is the entire extent of de-duplication we allow ourselves.
- Not collected, enforced server-side: IP address (endpoint discards it; no reverse-DNS, no geo lookup), User-Agent string, screen size, language, timestamps finer than seconds are fine but never correlated across days.

**Retention.** Raw event rows older than 90 days are deleted. Weekly aggregates live indefinitely.

### 3.3 Plugin: zero phone-home

There is nothing to specify because there is nothing to build. Restating the invariant so no future contributor "fixes" it:

- dsh-bridge makes no network requests except those its documented features require (e.g., fetching a plugin from GitHub during install, which the user initiated and can see).
- It never reports: install success/failure, command usage, errors/crashes, versions, session content, prompts, tool calls.
- Crash reporting does not exist. Errors print locally and stop.
- This paragraph should also live in SECURITY.md as a user-facing guarantee.

## 4. Event definitions

All site events require active opt-in; the collector silently drops everything else. Event names follow `object_actioned` snake case.

| Event | Properties | Trigger |
|---|---|---|
| `page_viewed` | `path`, `referrer_host`, `sid` | Any page load by an opted-in visitor |
| `report_card_opened` | `plugin_id`, `grade_shown` | Load of a trust report card page (`/trust/<plugin_id>/`). Derived event: emitted in addition to `page_viewed` for direct funnel readability |
| `install_command_copied` | `plugin_id`, `source` (`card`\|`catalog`\|`quickstart`) | Click on any "copy `/bridge:install ...`" affordance |
| `verify_command_copied` | `plugin_id` | Click on the copy affordance for the local verify command shown beside a card |
| `consent_answered` | `choice` (`in`\|`out`) | Consent banner interaction. Aggregate counter only; no `sid`, no timestamp beyond the second |

Property rules:

- `plugin_id` is the catalog slug (e.g. `dsh-market`), never a user identifier.
- No free-form properties. Adding a property requires editing this table in a reviewed PR; the collector rejects unknown keys.
- One repo-side pseudo-event for symmetry: `github_snapshot_taken` (daily script heartbeat, properties: `date`, fields populated). It measures the pipeline, not users.

## 5. Funnel: visit -> read card -> install -> verify

The intended journey, with how each stage is measured and how honest each number is:

| Stage | Signal | Source | Honesty |
|---|---|---|---|
| 1. Visit | `page_viewed` on landing | Site, opted-in only | Undercounts: declines are invisible |
| 2. Read card | `report_card_opened` | Site, opted-in only | Same bias |
| 3. Install | `install_command_copied`; repo `unique_cloners` trend | Site copy-clicks + GitHub traffic | Copy-click overcounts intent; clones undercount (installs may pull via registry without a git clone). True installs are unknowable by design |
| 4. Verify | `verify_command_copied`; support channels for "verification passed/failed" reports | Copy-clicks + issues/discussions | Weakest stage. Running verification happens offline and unobservable. Treat copy-click as proxy, treat silence as unknown |

Funnel math rules:

- Compute percentages only within the opted-in cohort, and label every chart "opted-in visitors" so nobody mistakes it for total traffic.
- Expected shape (hypothesis, falsify weekly): visit -> card ~15-30%, card -> copy-install ~10-25%, copy -> verified unknown. The biggest lever we expect is card -> install, because the trust card is the product's core pitch; if cards open but installs do not follow, the card content is failing, and that is actionable.
- Cross-check stage 3 against repo `unique_cloners_14d` deltas around launch posts. If copy-clicks spike with no clone movement, the button is being clicked out of curiosity, not intent.

Known biases, stated up front: the opted-in cohort skews privacy-friendly, so absolute conversion rates will look better than reality and cannot be compared against industry benchmarks. We compare ourselves only to our own past weeks.

## 6. Dashboards and weekly metrics

One dashboard (a markdown file regenerated weekly into `docs/growth/weekly-metrics.md`, or a simple table in the repo), reviewed every Monday. Metrics that matter, in priority order:

**Growth**
1. Net stars this week (North Star), with 7-day rolling chart from snapshots.
2. Star velocity by day, annotated with events (HN post day, Reddit thread, release tags) so spikes have causes.
3. Fork delta and open-issue delta (activity health).

**Acquisition**
4. Top referrer domains (GitHub traffic API), week over week.
5. Repo views and unique viewers, 14-day window trend.

**Activation (opted-in site cohort)**
6. Funnel table: visit -> card -> install-copy -> verify-copy, with week-over-week deltas.
7. Cards opened per plugin: which trust cards earn attention, which plugins get skipped.
8. Consent rate itself: share of visitors who opt in. Watch it like a product metric. If it craters, our consent UX is bad or our audience distrusts us, and both demand response.

**Pipeline health**
9. Snapshot script succeeded 7/7 days (a missing day is a bug, not a gap).

Explicitly not on the dashboard: anything requiring identity, anything per-user, any third-party benchmark comparison.

## 7. Anti-patterns (release-blocking violations)

Each item is a hard no. A PR introducing any of these is rejected regardless of benefit.

1. **No fingerprinting.** No canvas/WebGL/audio fingerprints, no font or plugin enumeration, no header-based device classification, no hashed IPs used as pseudonymous IDs. `sid` is random, ephemeral, and disclosed; anything more persistent is forbidden.
2. **No third-party trackers.** No Google Analytics, no CDN-bundled analytics scripts, no hosted SaaS counters (including "privacy-friendly" hosted ones; the data still leaves). All collection is our own endpoint on our own host, auditable in-repo.
3. **No agent-session telemetry.** The plugin never reads, summarizes, or transmits conversation content, prompts, tool calls, file paths, or error traces. Not sampled, not opt-out, ever. "Opt-in" applies to the site only; for the plugin the answer is always no.
4. **No cookies or persistent storage of identity.** No cookie, localStorage, IndexedDB, or cache key that survives a tab close and encodes anything about the visitor.
5. **No dark-pattern consent.** No pre-checked boxes, no unequal button styling, no nagging modals, no gating content behind consent.
6. **No data sharing or sale.** Aggregate numbers may be published (they already are, in this repo); raw event rows never leave the server and are never shown to third parties.
7. **No scope creep into surveillance.** No session replay, heatmaps, scroll-depth tracking, form analytics, or A/B experiments assigning treatments to visitors.
8. **No silent schema changes.** New events or properties require updating Section 4 first; the collector rejects unknown keys so drift fails loudly.

## 8. What we deliberately do NOT measure, and why

Honesty section, maintained alongside the plan. Each entry is a common practice we considered and rejected.

| Not measured | Why not |
|---|---|
| Total visitors / unique visitors across days | Requires a persistent identifier or fingerprinting. We accept knowing less. |
| DAU / WAU / MAU | Cannot be computed honestly without cross-visit identity. The skill lists these as defaults; they are wrong for us. |
| D1/D7/D30 retention cohorts | Same reason. Cohorting requires recognizing the same person twice. |
| Actual install count | Only knowable via phone-home, which is permanently off. Clones and copy-clicks are declared proxies, never presented as installs. |
| Verification success rate | Happens entirely on the user's machine. If users want to report results, they can open an issue; we do not ask for automatic reports. |
| Geography / language / browser / OS | Needs IPs or UA parsing; both are fingerprints in slow motion. Zero value justifies the cost. |
| Full referrer URLs and search terms | Leaks what people typed into search engines. Hostname only. |
| Per-user journeys across visits | Even opted-in, `sid` dies with the tab. We see isolated sessions, not stories about people. |
| Time-on-page / scroll depth | Signals of engagement theater; measuring them pushes toward engagement optimization we do not want. |
| Crash and error reporting from installs | Would require the plugin to transmit data. Local output plus user-filed issues cover real needs. |
| Individual campaign attribution ("this HN account starred") | Attribution means joining identities across platforms. We correlate aggregate referrer timing with star spikes instead and accept ambiguity. |
| Consent-refusal records | Storing who declined is collecting. An unsigned daily count of declines, if useful, keeps even that anonymous. |

The pattern: whenever a metric would require recognizing a person, holding a secret about a person, or a transmission from their machine, we choose blindness. A growth plan that cannot grow within these limits is not the plan we want to run; the charter exists precisely to force that choice early.

## 9. Implementation checklist (ponytail-sized)

1. `scripts/snapshot-github.sh`: curl-free `gh api` calls, append one JSON line, cron daily. Blocked on `gh` re-auth.
2. Site consent component (~50 lines): banner, in-memory `sid`, `fetch` POST on opted-in navigation. No dependencies.
3. Collector endpoint (~100 lines): validate against Section 4 schema, discard IP, append JSONL, nightly aggregate job, 90-day purge job.
4. `docs/growth/weekly-metrics.md` template + a small script that renders Sections 6 tables from snapshots and aggregates.
5. SECURITY.md paragraph restating the plugin's zero-phone-home guarantee, linking here.

Total new moving parts: three small ones. Delete this section as items land.
