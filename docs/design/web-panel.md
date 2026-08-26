# dsh-bridge Web Panel — UI Spec

**Scope:** the three surfaces dsh-bridge contributes to the DSH browser GUI: the **plugin browser** view, the **trust card detail** view, and the **onboarding wizard entry**.

**Grounding:** every stack, token, slot, and geometry claim below is taken from [`docs/research/ui-conventions.md`](../research/ui-conventions.md), which in turn cites the reference checkout `reference/deepseek-harness` at `0.1.1-rc.2`. Where this spec cites a slot name or token, the research doc is the authority; if the two disagree, the research doc wins and this file is stale.

Companion specs, not duplicated here:

- Card visual anatomy, grade bands, finding severity, copy deck: [`trust-report-card.md`](./trust-report-card.md)
- Wizard step content, per-step copy, error recovery matrix: [`onboarding-wizard.md`](./onboarding-wizard.md)

This document covers what those two do not: **component inventory, per-view state machines, motion, keyboard navigation, and the slot mapping.**

---

## 1. Constraints inherited from DSH

Non-negotiable, all from the research doc §1, §2, §4:

| Constraint | Consequence for this spec |
|---|---|
| React 18, CSS Modules + `clsx`, no Tailwind, no component library (§1, §4 DON'T 1) | Every component below is a local `.tsx` + `.module.css` pair or a `ui-primitives` reuse. No new dependency. |
| Components never see `ctx` (§1 three-layer red line) | All data and callbacks in this spec arrive via the four props shares. State machines below are expressed as **props**, not as fetches. |
| Semantic `--dsw-alias-*` tokens only (§2.2, §4 DON'T 2) | No literal colors anywhere in this spec. |
| No theme selectors in feature CSS (§4 DON'T 3) | Light/dark is free; nothing below branches on theme. |
| Ride the shipped motion curve `var(--ds-transition-duration) var(--ds-ease-in-out)` (§2.4, §4 DO 3) | See §6 for how this reconciles with spring-based motion design. |
| Prefer `list` and `keyed` slots; never take a `single` frame slot (§3.3, §4 DO 6 / DON'T 5) | All three surfaces land on `list` or `keyed` seats. |
| Lazy: no Remote read during activation (§3.5, §4 DO 9) | Every view starts in `idle`, not `loading`. |
| Handle loading / empty / no-match / failure locally, with retry, without exposing transport detail (§4 DO 10) | Four-plus-one state machines in §5. |
| `prefers-reduced-motion` respected on every transition (§4 DO 11) | §6.6. |

---

## 2. Slot mapping

Three surfaces, three seats. All additive.

| # | Surface | Slot | Kind | Scope | Research ref |
|---|---|---|---|---|---|
| A | Plugin browser | `settings.plugins.tab` (`id: 'bridge'`) | list | root | §3.4 Settings table; §6 rank 1 |
| B | Trust card detail | rendered **inside** A (same tab, master/detail), plus `settings.plugin.item` keyed on the bridge namespace for the per-plugin config card | list host + keyed | root | §3.4 Plugin cards; §6 rank 3 |
| C | Onboarding wizard entry | `settings.onboarding` | list | root | §3.4 Settings table; §6 rank 4 |

Two optional entry points, specified here but shippable separately:

| # | Surface | Slot | Notes |
|---|---|---|---|
| D | "Open bridge" quick action | `sidebar.footer.action` | receives `{ wide: boolean }`; collapses to a 36px rail circle at `SIDEBAR_COLLAPSED` 56px (§2.5, §5.2) |
| E | Verification status pill | `shell.overlay` | click-through layer, "unowned by any feature" (§3.4 Frame table); pill opts back into pointer events |

Registration follows the canonical recipe verbatim (§3.5): every `ctx.slots.register` wrapped in `ctx.slots.inject('<slot>', …)`, multiple registrations via the generator form, `label` as a function, `en` + `zh` dictionaries on `ctx.locale`, host half may be `export function apply(): void {}`.

```ts
export const NS = 'settings.bridge'
export const inject = ['slots', 'locale', 'remote', 'remote.bridge']

// three seats, one generator (§3.5)
ctx.slots.inject('settings.plugins.tab', () =>
  ctx.slots.inject('settings.onboarding', function* () {
    yield ctx.slots.register({ name: 'settings.plugins.tab', id: 'bridge', order: 30, label: () => t('tab'), locale: NS, inject: injected }, BridgeBrowserTab)
    yield ctx.slots.register({ name: 'settings.onboarding', id: 'bridge-setup', order: 40, locale: NS, inject: injected }, BridgeOnboarding)
  }))
```

**Why `settings.plugins.tab` and not `settings.section`.** The browser is *about plugins*; the Plugins section already owns search, the card rhythm, and the user's mental model. A sibling tab beside "Plugin configuration" and "Plugin list" is the cheapest thing for a user to find and the smallest thing for us to own. `settings.section` stays reserved for bridge-wide preferences (registry URLs, verification policy) if and when they exist — not shipped in v1.

---

## 3. Component inventory

### 3.1 Reused from `ui-primitives` (§3.7) — no new code

| Primitive | Used for |
|---|---|
| `Button` (`primary`/`ghost`/`outline`/`toolbar`, `md` 36 / `sm` 28) | Install, Re-verify, View report, wizard Back/Next |
| `Pill` | grade badge, source badge (Community / Verified / Official), active filter chips |
| `Input` | browser search field, wizard token/URL fields |
| `DisclosureRow` | collapsed trust card, expandable finding row |
| `StateDot` | plugin fiber status, per-check pass/warn/fail dot |
| `Menu` (`MenuEntry`/`MenuItem`/`MenuSeparator`/`MenuLabel`) | sort control, filter overflow |
| `Tooltip` (`TooltipSide`) | grade band explanation, truncated provenance |
| `HoverCard` | plugin summary preview on row hover (pointer-fine only) |
| `Modal` | full report overlay when detail is opened from outside the tab |
| `RiskConfirmation` | **the raw-install consent flow.** Do not roll a custom scary dialog (§3.7 callout) |
| `OnboardingSurface` | wizard chrome — registrant owns all chrome incl. `#root` inert ownership (§3.4) |
| `ConnectionBanner` | registry unreachable / stale-cache banner |
| `Toast` | install succeeded, verification refreshed |
| `DiffBlock` / `ReadBlock` / `JsonTree` / `CodeBlock` | finding evidence at `file:line` |
| `MarkdownText` | plugin long description, report prose |
| `useAnchoredPosition`, `useAnchoredMaxHeight`, `useDismissOnOutsidePointer` | sort menu, hover card |
| `writeClipboard` | "copy reproduce command" |

### 3.2 Authored by dsh-bridge

Nine components. Each is a `.tsx` + `.module.css` pair under `src/client/`. All are pure-props (§1 layer 3) and are "expected to be rewritten wholesale" — keep them dumb.

| Component | Responsibility | Key props (JSON-compatible + callbacks only, §4 DON'T 14) |
|---|---|---|
| `BridgeBrowserTab` | view A root; owns the view state machine and the store seat | share-derived only |
| `BrowserToolbar` | search `Input`, filter `Pill` row, sort `Menu` | `query, filters, sort, onQuery, onToggleFilter, onSort` |
| `PluginList` | virtualized-ready list container; renders rows or a state surface | `state, items, selectedId, onSelect` |
| `PluginRow` | one result: name, grade `Pill`, source `Pill`, `StateDot`, summary line | `id, name, grade, source, summary, installed, onSelect, onInstall` |
| `TrustCard` | view B root; the anatomy in [`trust-report-card.md`](./trust-report-card.md) §3 | `report, state, onReverify, onInstall, onOpenEvidence` |
| `FindingRow` | one finding: severity glyph + text + `DisclosureRow` evidence | `finding, expanded, onToggle` |
| `EvidenceBlock` | picks `DiffBlock` / `ReadBlock` / `JsonTree` by evidence kind | `evidence` |
| `StateSurface` | the one shared empty/no-match/error/loading surface for both views | `kind, title, body, actionLabel?, onAction?` |
| `BridgeOnboarding` | view C root; step ring over `OnboardingSurface` | `step, total, canAdvance, onNext, onBack, onSkip` |

**`StateSurface` is deliberately one component, not four.** Same box, same geometry, different `kind`. It is the single place non-loaded states are styled, which is what keeps the four state machines in §5 visually consistent without four CSS files.

### 3.3 Store seat

One store, declared at `register` (§1 state row, §3.2 store share). It carries **viewing/interaction state only** (§4 DON'T 10):

```ts
{ query: string, filters: string[], sort: 'relevance' | 'grade' | 'recent',
  selectedPluginId: string | null, expandedFindingIds: string[], wizardStep: number }
```

Registry results, reports, and install status are **business data** and live in the object layer, arriving through the `inject` face. Do not cache a report in the store.

---

## 4. ASCII wireframes

### 4.1 View A — plugin browser (loaded)

Inside the 1080×700 settings modal, 188px nav + content column, 760px content max-width, 54px header (§2.5, §5.3).

```
┌─── 188px nav ───┬────────────────────── content column ───────────────────────┐
│  General        │ Plugins                          [settings.action*]   [✕]   │ 54px
│  Models         ├─────────────────────────────────────────────────────────────┤
│  Plugins   ◄    │  ┌ settings.plugins.tab* ─────────────────────────────────┐ │
│  Providers      │  │ [Plugin configuration] [Plugin list] [ Bridge ]◄ YOU   │ │
│                 │  └────────────────────────────────────────────────────────┘ │
│                 │                                                             │
│                 │  ┌──────────── 760px max-width ─────────────────────────┐   │ 24px
│                 │  │ ⌕ Search plugins…                    [Sort: Grade ▾] │   │ pad
│                 │  │ [All] [A–B only] [Verified] [Installed]              │   │ Pill row
│                 │  ├──────────────────────────────────────────────────────┤   │ gap 12
│                 │  │ ● dsh-plugin-notion        [ B ] [Community]     [→] │   │ row
│                 │  │   Notion pages as context · 1.2k installs            │   │ radius 12
│                 │  ├──────────────────────────────────────────────────────┤   │ border l2
│                 │  │ ● dsh-plugin-linear        [ A ] [Verified]      [→] │   │
│                 │  │   Issue tracker read/write                           │   │
│                 │  ├──────────────────────────────────────────────────────┤   │
│                 │  │ ○ dsh-plugin-scrape        [ D ] [Community]     [→] │   │
│                 │  │   Headless browser fetch                             │   │
│                 │  └──────────────────────────────────────────────────────┘   │
└─────────────────┴─────────────────────────────────────────────────────────────┘
  ● / ○ = StateDot (installed / not). [ A ] = grade Pill. [→] opens view B.
```

### 4.2 View A — non-loaded states (`StateSurface`)

```
loading                     empty (registry has nothing)     no-match (query filters all out)
┌────────────────────┐      ┌────────────────────────┐       ┌────────────────────────────┐
│ ▓▓▓▓▓▓▓▓  ▓▓▓  ▓▓  │      │      No plugins yet    │       │  Nothing matches “notoin”  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓      │      │  The registry is empty │       │  Check the spelling or     │
│ ▓▓▓▓▓▓▓  ▓▓▓  ▓▓   │      │                        │       │  clear the filters.        │
│ ▓▓▓▓▓▓▓▓▓▓▓        │      │  [ Refresh ]           │       │  [ Clear filters ]         │
└────────────────────┘      └────────────────────────┘       └────────────────────────────┘
 3 skeleton rows,            no retry framing — this is       actionable, and the action
 --dsw-alias-bg-skeleton     a valid outcome, not a fault     mutates store, not network

error                                        stale (offline, cache shown)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────────┐
│  Couldn’t reach the plugin registry  │     │ ConnectionBanner: Offline — showing the  │
│  Your connection or the registry is  │     │ list cached 2h ago.        [ Retry ]     │
│  down. Nothing was installed.        │     ├──────────────────────────────────────────┤
│  [ Try again ]                       │     │ …rows render normally beneath…           │
└──────────────────────────────────────┘     └──────────────────────────────────────────┘
 no status codes, no URLs, no stack (§4 DO 10)
```

### 4.3 View B — trust card detail (master/detail inside the same tab)

Detail replaces the list **in place**; it does not open a modal when entered from view A. Modal (`Modal` primitive) is only for entry point E.

```
┌──────────────────────────── 760px content ──────────────────────────────┐
│ [← All plugins]                                       [ Re-verify ⟳ ]   │  back row, 42px
├─────────────────────────────────────────────────────────────────────────┤
│  dsh-plugin-notion                            [ B ]  [Community]        │  font-l-20
│  github:owner/repo · MIT · audited 2026-08-25 · commit a1b2c3d          │  font-xxs-12
│                                                                          │  label-tertiary
│  ┌─ Findings (3) ────────────────────────────────────────────────────┐  │
│  │ ▸ ● No credential access                            state-success │  │  FindingRow
│  │ ▸ ● No dynamic code evaluation                      state-success │  │  DisclosureRow
│  │ ▾ ▲ MEDIUM — sends data to api.notion.com           state-warn    │  │
│  │     src/net.ts:42                                                  │  │  EvidenceBlock
│  │     ┌──────────────────────────────────────────────────────────┐  │  │  → ReadBlock
│  │     │ 41  const url = process.env.NOTION_API ??                │  │  │
│  │     │ 42    'https://api.notion.com/v1'                        │  │  │
│  │     └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  What we checked · Reproduce this  ▸                                     │  DisclosureRow
│                                                                          │
│  [ Install ]   [ View full report ]   [ Copy reproduce command ]         │  primary/ghost
└─────────────────────────────────────────────────────────────────────────┘
```

Grade bands, severity glyphs, and the colorblind-safe glyph+color pairing are specified in [`trust-report-card.md`](./trust-report-card.md) §2 and §5 and are not restated here. Token mapping (grade A/pass → `--dsw-alias-state-success-primary`, B/caution → `--dsw-alias-state-warn-primary` with text `--dsw-alias-state-warn-label`, C/fail → `--dsw-alias-state-error-primary`, bridge accent → `--dsw-alias-state-business-primary`) is research doc §2.2.

Install below grade C routes through `RiskConfirmation`, never a bare `Button`.

### 4.4 View C — onboarding wizard entry

`settings.onboarding` registrants own **all** chrome including the modal surface and `#root` inert ownership (§3.4). Use `OnboardingSurface` for the shell; the step content is [`onboarding-wizard.md`](./onboarding-wizard.md) §4.

```
       scrim: --dsw-alias-bg-mask-1     #root set inert by this registrant
┌────────────────────── OnboardingSurface ───────────────────────┐
│  Set up dsh-bridge                                       [✕]   │
├────────────────────────────────────────────────────────────────┤
│  ●━━━●━━━○━━━○━━━○━━━○        Step 3 of 6 · Pick provider      │  progress rail
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   (step body — see onboarding-wizard.md §4)                     │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│  [ Skip for now ]                          [ Back ]  [ Next ]   │  42px foot
└────────────────────────────────────────────────────────────────┘
```

### 4.5 Entry points D and E

```
D — sidebar.footer.action            E — shell.overlay status pill
 wide:                                ┌──────────────────────────────┐
 ┌──────────────────┐                 │                  ┌─────────┐ │
 │ ⚙  Settings      │                 │  (click-through) │ ◐ 3 new │ │
 │ ◈  Bridge     ←  │  42px row       │                  └─────────┘ │
 └──────────────────┘                 │                    ↑ pill    │
 rail (56px):                         │   opts back into pointer     │
 ┌──────┐                             │   events; radius 999px       │
 │  ◈   │  36x36 circle, 50%          └──────────────────────────────┘
 └──────┘  label visually hidden
```

---

## 5. State machines

One machine per view. States are **derived from props**, never held in the store — the store holds intent (query, selection), the object layer holds truth.

### 5.1 View A — plugin browser

```
        mount (lazy: no fetch at activation, §4 DO 9)
             │
          ┌──▼──┐   first paint of the tab
          │ idle│───────────────┐
          └─────┘               ▼
                          ┌──────────┐   registry resolves, items > 0
                          │ loading  │────────────────────────────┐
                          └────┬─────┘                            ▼
                    items == 0 │        ┌──────────────────┐   ┌────────┐
                               ├───────▶│      empty       │   │ loaded │
                        reject │        └──────────────────┘   └───┬────┘
                               ▼                                   │ query/filter
                        ┌──────────┐   [Try again]                 │ yields 0
                        │  error   │──────────────▶ loading        ▼
                        └──────────┘                          ┌──────────┐
                        cache hit                             │ no-match │
                        ├────────▶ loaded + stale banner      └────┬─────┘
                                                                    │ [Clear filters]
                                                                    └──▶ loaded
```

Rules:

- `idle → loading` fires on **first mount of the tab**, not on plugin activation. Selecting the tab is the trigger (§3.5 "Lazy is the norm").
- `no-match` is distinct from `empty`. Same surface component, different `kind`, different copy, and only `no-match` offers a store-mutating action. Conflating them is the single most common mistake in this pattern.
- Re-query while `loaded` does **not** return to `loading`. Keep the current rows, dim the list to 60% opacity, and swap when results arrive. Flashing skeletons on every keystroke is worse than a stale list for 200ms.
- `error` copy never contains a status code, URL, or transport noun (§4 DO 10).
- Offline with a cache is `loaded` + `ConnectionBanner`, not `error`.

### 5.2 View B — trust card

```
   (from row [→], id known)          (deep link / entry E, id unknown-valid?)
             │                                     │
             ▼                                     ▼
        ┌─────────┐  report resolves          ┌─────────┐
        │ loading │──────────────────────────▶│ loaded  │
        └────┬────┘                           └────┬────┘
             │ no report exists                    │ [Re-verify]
             ▼                                     ▼
        ┌────────────┐                       ┌────────────┐  ok  ┌────────┐
        │ unreviewed │                       │ verifying  │─────▶│ loaded │
        └─────┬──────┘                       └─────┬──────┘      └────────┘
              │ [Request review]                   │ fail
              ▼                                    ▼
        ┌────────────┐                       ┌──────────────────────────┐
        │  queued    │                       │ loaded + inline warning  │
        └────────────┘                       │ (old report still shown) │
                                             └──────────────────────────┘
        ┌────────┐  fetch reject
        │ error  │  [Try again] ──▶ loading
        └────────┘
```

Rules:

- **`unreviewed` is a first-class state, not an error.** Copy and treatment per [`trust-report-card.md`](./trust-report-card.md) §4.4. A plugin nobody has audited is a normal fact about the world.
- **A failed re-verify never blanks the card.** The previously loaded report stays on screen with an inline warning strip above it. Destroying known-good information because a refresh failed is a trust bug, not a UI bug.
- `verifying` disables Install but leaves everything else interactive.
- Findings expand/collapse is store state and survives a re-verify that returns the same finding ids.

### 5.3 View C — onboarding wizard

```
 ┌────────┐  open  ┌────────┐  Next (valid)   ┌────────┐   done   ┌──────────┐
 │ closed │───────▶│ step n │────────────────▶│step n+1│─────────▶│ complete │
 └────────┘        └───┬────┘                 └────────┘          └──────────┘
      ▲                │ Next (invalid)            │ Back              │
      │                ▼                           └───────────────────┘
      │           ┌──────────┐                                    marks the
      │           │ invalid  │ inline field errors, focus moves   registrant's
      │           └──────────┘ to first invalid field, no advance completion
      │                │
      │   ✕ / Skip     │  async step (smoke test):
      └────────────────┤   step n → testing → (pass → n+1 | fail → step n + error)
        confirm if the │
        step has dirty │  errors: onboarding-wizard.md §5 matrix
        input          │
```

Rules:

- Skip is always available and always safe. The wizard is an *entry*, not a gate.
- Closing with dirty input asks once ([`onboarding-wizard.md`](./onboarding-wizard.md) §5.8); closing a clean step never asks.
- The registrant owns `#root` inert while open and must release it on every exit path including error (§3.4).

### 5.4 State-to-surface table

| State | Surface | Retry affordance | Announced to AT |
|---|---|---|---|
| `idle` | nothing rendered | — | no |
| `loading` | 3 skeleton rows, `--dsw-alias-bg-skeleton` | — | `aria-busy="true"` on the list |
| `loaded` | rows / card | — | result count in a polite live region |
| `empty` | `StateSurface kind="empty"` | Refresh | polite |
| `no-match` | `StateSurface kind="no-match"` | Clear filters | polite, with count 0 |
| `error` | `StateSurface kind="error"` | Try again | assertive |
| `stale` | `loaded` + `ConnectionBanner` | Retry | polite |
| `unreviewed` | card variant | Request review | polite |
| `verifying` | card + spinner on the button | — | polite |

---

## 6. Motion spec

### 6.1 The spring/token tension, resolved

The ui-animation skill asks for spring-described motion. The DSH conventions say **ride the shipped curve, do not author your own easing** (research §2.4, §4 DO 3): `--ds-ease-in-out` = `cubic-bezier(0.4, 0, 0.2, 1)`, with `--ds-transition-duration-fast` 0.1s, `--ds-transition-duration` 0.2s, `--ds-transition-duration-slow` 0.3s.

Resolution, and this is a rule for implementers:

> **Design in spring terms. Ship in DSH tokens.** Each motion below states its intended spring character (stiffness/damping, no bounce) so reviewers can judge the *feel*, and states the token pair that actually goes in the CSS. Do not add a spring library. Do not hand-write a bezier. If a motion genuinely cannot be expressed with the three shipped durations, that is a signal the motion is wrong, not that the tokens are.

Spring characters used, all critically damped (no overshoot — overshoot on a settings panel reads as toy-like):

| Character | Spring intent | Ships as |
|---|---|---|
| `snap` | stiffness ~400, damping ~40, settle ~100ms | `var(--ds-transition-duration-fast) var(--ds-ease-in-out)` |
| `standard` | stiffness ~260, damping ~30, settle ~200ms | `var(--ds-transition-duration) var(--ds-ease-in-out)` |
| `surface` | stiffness ~180, damping ~26, settle ~300ms | `var(--ds-transition-duration-slow) var(--ds-ease-in-out)` |

Everything animates `transform` and `opacity` only. No layout properties. No `transition: all`. (Skill core rules; research §4.)

### 6.2 Entrances

| Element | Motion | Character | Notes |
|---|---|---|---|
| Tab content (view A first paint) | `opacity 0→1`, `translateY(4px)→0` | standard | `@starting-style`, fall back to `data-mounted`. 4px, not 12px — this is a settings panel, not a hero. |
| Row list | staggered 30ms/item, cap 6 items then instant | standard | total stagger under 300ms per skill; rows 7+ appear with no delay so long lists never feel gated |
| Skeleton → rows | crossfade opacity only, no translate | snap | content is in the same place; moving it would be a lie about layout |
| `StateSurface` | `opacity 0→1`, `scale(0.98)→1` | standard | never `scale(0)`; 0.98 because it fills a known box |
| Wizard step body | slide `translateX(±8px)→0` + fade | standard | **direction matches travel**: Next enters from +8px (right), Back enters from −8px (left) |
| `RiskConfirmation` / `Modal` | `scale(0.92)→1`, `opacity 0→1`, origin `center` | surface | scrim fades `standard`; dialog is the rarer interaction so it gets the slower, more deliberate character |
| Sort `Menu` | `scale(0.95)→1` with `transform-origin` at the trigger | snap | emerges from the trigger (skill: "emerge from the trigger"), via `useAnchoredPosition` |
| Toast | `translateY(8px)→0` + fade | standard | |
| `ConnectionBanner` | fade only | standard | never slide — it sits above content and sliding it shoves the list |

### 6.3 Exits

Exit is always **faster than enter** (skill: asymmetric timing). Every exit above uses `snap` regardless of the character its entrance used, except the modal scrim which uses `standard` to avoid a jarring flash.

Exits animate `opacity → 0` plus the inverse of the entrance transform. Nothing exits by collapsing height.

### 6.4 Filter and query transitions

The interesting case, and the one most implementations get wrong.

```
user types / toggles a filter
        │
        ├─ list stays mounted, opacity 1 → 0.6           snap
        │  (NOT a skeleton swap — see §5.1 rule 3)
        │
        ▼ results arrive
        ├─ opacity 0.6 → 1                                snap
        ├─ rows that persist across the filter: DO NOT re-animate.
        │  Keyed by plugin id, they stay in place. Continuity over teleportation.
        ├─ rows entering: fade + translateY(4px), no stagger  standard
        └─ rows leaving:  fade out                            snap
```

Rules:

- **Keyed rows persist.** A plugin present before and after a filter change must be the same DOM node moving, not a destroyed node and a new one. Duplicating persistent elements across states is an explicit anti-pattern.
- **Row reordering (sort change) uses transform only.** Measure, then translate. Never animate `top`.
- Filter `Pill` active state animates `background-color` + `opacity` only, `snap`. `Pill` press feedback is `scale(0.97)`, `snap`, released on pointerup.
- **Typing in search never animates the container.** High-frequency actions must be invisible.

### 6.5 View A → view B transition

Shared-element continuity. The plugin name and grade `Pill` exist in both views.

```
row [→] pressed
  ├─ list: opacity → 0, translateX(-8px)          snap        (recedes left)
  ├─ detail: opacity → 1, translateX(8px) → 0     standard    (arrives from right)
  └─ name + grade Pill: no crossfade. Same nodes if the implementation
     can hoist them; if not, match position and size so the change is
     imperceptible rather than faking a morph.
```

Back reverses the direction. Directional motion matches spatial layout (skill principle).

### 6.6 Reduced motion

`@media (prefers-reduced-motion: reduce)` is mandatory on every rule above (research §4 DO 11). The fallback is **not** "no feedback" — it is "no travel".

| Motion | Reduced-motion fallback |
|---|---|
| All `translate` / `scale` entrances and exits | removed entirely; element appears at final position |
| Opacity crossfades | kept, clamped to `--ds-transition-duration-fast` |
| Row stagger | removed; all rows appear together |
| View A → B slide | instant swap, opacity crossfade at `fast` |
| Wizard step slide | instant; the progress rail still updates |
| Filter dim-to-0.6 | kept — it is a state indicator, not decoration, and 100ms of opacity is not vestibular |
| Modal scale | removed; scrim still fades |
| Press feedback `scale(0.97)` | replaced by a `background-color` shift, `fast` |

Implementation shape:

```css
.row { transition: opacity var(--ds-transition-duration) var(--ds-ease-in-out),
                   transform var(--ds-transition-duration) var(--ds-ease-in-out); }
@media (prefers-reduced-motion: reduce) {
  .row { transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out); transform: none; }
}
```

### 6.7 Never animate

- Anything triggered by a keyboard shortcut, arrow navigation, or tab/focus movement (skill core rule). Arrowing down the plugin list moves selection **instantly**; the focus ring never slides.
- Theme switches — the theme owner already suppresses transitions via `[data-theme-switching]`.
- Loading spinners off-screen; pause with `IntersectionObserver`.
- `will-change` is set only for the duration of the view A→B transition and removed after.

---

## 7. Keyboard navigation

The panel lives inside the settings modal, which owns the outer focus trap. Everything below is *within* that trap.

### 7.1 View A

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | search → filter pills → sort → list (one stop) → detail actions |
| `↓` / `↑` | move selection within the list; the list is a single tab stop with roving `tabindex` |
| `Home` / `End` | first / last row |
| `Enter` | open selected row's trust card (view B) |
| `Space` | same as Enter on a row; toggles a focused filter `Pill` |
| `→` | open detail (mirrors the `[→]` affordance) |
| `/` | focus search from anywhere in the tab, unless focus is already in a text field |
| `Esc` | if search has text, clear it and keep focus; if empty, let the modal handle close |

The list is `role="listbox"` with `aria-activedescendant`, not 40 tab stops. Filter pills are a `role="group"` of toggle buttons and *are* individually tabbable — there are at most five.

### 7.2 View B

| Key | Action |
|---|---|
| `Esc` | back to the list, restoring the previously selected row's focus |
| `←` / `Backspace` | back to the list (Backspace only when focus is not in a text field) |
| `↓` / `↑` | move between finding rows |
| `Enter` / `Space` | expand/collapse the focused finding |
| `→` / `←` | expand / collapse the focused finding explicitly (disclosure convention) |
| `Tab` | findings region → What we checked → action row |

Entering view B moves focus to the back button and announces the plugin name and grade via a polite live region. Leaving restores focus to the originating row — never to the top of the list.

`RiskConfirmation` traps focus, defaults focus to the **cancel** affordance, and `Esc` cancels. The destructive action is never the initial focus.

### 7.3 View C

| Key | Action |
|---|---|
| `Tab` | cycles within the wizard only; `#root` is inert |
| `Enter` | activates Next when the focused element is not a multiline field and the step is valid |
| `Esc` | close, with the dirty-input confirm from [`onboarding-wizard.md`](./onboarding-wizard.md) §5.8 |
| `Alt+←` / `Alt+→` | Back / Next as explicit shortcuts |

On step change, focus moves to the step heading (`tabindex="-1"`), and the heading is announced with "Step n of 6". On validation failure, focus moves to the first invalid field and the error is announced assertively.

### 7.4 Focus visibility

`:focus-visible` rings use the existing DSH focus treatment; never remove an outline, never gate the ring behind hover (research §4 DO 11). Hover-only affordances (the `[→]` chevron, row `HoverCard`) must have a keyboard-reachable equivalent — the chevron is always rendered, only its opacity changes, and `HoverCard` content is duplicated in the row's accessible name.

Hover animations are gated behind `@media (hover: hover) and (pointer: fine)` (skill accessibility rule).

---

## 8. Acceptance checks

Testable, in order of what breaks first:

1. Tab performs **zero** Remote reads until it is first selected (§3.5).
2. Every color in `src/client/**/*.module.css` is a `--dsw-alias-*` or `--dsw-specific-*` reference. Grep for `#`, `rgb(`, `hsl(`.
3. No `body[data-ds-dark-theme]` selector in bridge CSS.
4. No `transition: all`; no transition on `width`, `height`, `top`, `left`.
5. Every `transition` rule has a `prefers-reduced-motion` counterpart.
6. Arrowing through the list produces no transform animation.
7. `no-match` and `empty` render different copy and different actions.
8. A failed re-verify leaves the prior report visible.
9. Install below grade C is unreachable without `RiskConfirmation`.
10. Both `en` and `zh` dictionaries resolve for every string; `label` is a function.
11. Closing the wizard by any path (`✕`, `Esc`, Skip, error) releases `#root` inert.
12. Elevated surfaces we own rebind `--dsh-scrollbar-thumb{,-hover}` to the l2 pair (§2.4).

---

## 9. Open questions

1. **Master/detail vs. modal for view B.** This spec picks in-place master/detail inside the tab. If the settings content column proves too narrow at 760px for evidence blocks, the detail may need the full 1080px width, which the tab cannot give. Verify against a running `dsh web` before building the evidence layout.
2. **`settings.plugin.item` keying.** The research doc (§3.4) describes it as keyed on the settings namespace the card edits. Whether one bridge namespace can front many plugins' cards, or whether each needs its own namespace, is unresolved and blocks the per-plugin config card in surface B.
3. **Virtualization threshold.** The row stagger cap of 6 assumes lists in the tens. A registry in the thousands needs virtualization, which changes the shared-element transition in §6.5. Unspecified until registry size is known.
4. **`shell.overlay` pill placement.** The frame table says click-through and unowned, but not where entries position themselves or how two plugins' overlay entries avoid collision. Needs a read of the layout source.
5. **No screenshots exist.** Research §7.1 is explicit that §5 geometry is reconstructed, not measured. Every pixel in §4 inherits that caveat.
6. **Version pinned to `0.1.1-rc.2`.** Slot names and props are pre-1.0 (research §7.8). Re-verify the slot map at each DSH bump.

---

## 10. References

- [`docs/research/ui-conventions.md`](../research/ui-conventions.md) — the authority for every stack, token, slot, and geometry claim above
- [`docs/design/trust-report-card.md`](./trust-report-card.md) — card anatomy, grade bands, severity, copy deck
- [`docs/design/onboarding-wizard.md`](./onboarding-wizard.md) — wizard step content and error recovery
- `~/.agents/skills/ui-animation/SKILL.md` — motion decision framework, easing defaults, anti-patterns
