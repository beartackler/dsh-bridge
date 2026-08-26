# DSH Web UI Conventions — Research Brief

**Scope:** How the DeepSeek Harness (DSH) web GUI is built, themed, and extended, so `dsh-bridge` panels look and behave native.

**Evidence base:** reference checkout `/Users/timurmonasypov/Documents/GitHub/reference/deepseek-harness` (shallow clone, `master`, version `0.1.1-rc.2`). Every claim below cites `file:line` or a file path in that checkout. Paths are relative to the checkout root.

> **Correction to the sprint brief:** there is no `packages/web` browser UI package. `packages/web/` is the *web tools* domain (`tool-web`, `web-fetch-http`, `web-search-*`). The browser GUI lives in **`packages/client/*`** (33 packages) with the Vite build entry in **`apps/web/`**. See `packages/client/README.md:1-6` and `apps/web/package.json:3`.

---

## 1. Stack Summary

| Layer | Choice | Evidence |
|---|---|---|
| UI framework | **React 18** (`^18.2.0`, types `~18.3.1`) | `packages/client/ui-primitives/package.json:47,53` |
| Build (app) | **Vite** over the `@deepseek-ai/dsh-client-web` shell library; `dist/` served by `apps/cli`'s `dsh web` | `apps/web/package.json:3`, `apps/web/vite.config.ts` |
| Build (plugin packages) | **tsdown** (`bundle` / `watch` scripts), per-package `tsdown.config.ts` | `packages/client/ui-settings-plugin-inventory/package.json:41-44` |
| Plugin kernel | **Cordis** (`@deepseek-ai/cordis`) — the browser half is a Cordis fiber like the host half | `packages/client/AGENTS.md` "Dependency declaration" §1 |
| Composition model | **Slot registry** (`@deepseek-ai/dsh-client-ui-slots`) — one `ctx.slots.register(...)` API | `packages/client/ui-slots/README.md:5-7` |
| Styling | **CSS Modules + `clsx`.** No Tailwind, no component library — *explicitly forbidden* | `docs/web-styling.md` "Component rules" bullet 1 |
| Design tokens | CSS custom properties `--dsw-*`, owned by `@deepseek-ai/dsh-client-ui-theme` | `docs/web-styling.md` "Ownership"; `packages/client/ui-theme/src/styles/` |
| Component atoms | `@deepseek-ai/dsh-client-ui-primitives` — Cordis-free React primitives styled *only* through `--dsw-*` | `packages/client/ui-primitives/src/index.ts:1-3` |
| Theming | `light` / `dark` / `system`; resolved via `prefers-color-scheme`; applied as `body[data-ds-dark-theme]` + `html { color-scheme }` | `packages/client/ui-theme/README.md:5` |
| State | zustand + immer snapshot-store engine in the React-free `runtime` layer; `defineStore` seats declared at `register` | `packages/client/AGENTS.md` "Layering red lines" §1 |
| Syntax highlight | Shiki (`ui-theme/src/styles/shiki.css`) | `packages/client/ui-theme/src/styles/shiki.css` |
| i18n | Per-plugin dictionaries registered on `ctx.locale`; `en` + `zh` are the shipped pair | `packages/client/ui-settings-plugin-inventory/src/client/index.ts:26` |
| Persistence of prefs | Host settings API → `$DSH_HOME/settings.yaml` | `packages/client/ui-theme/README.md:5` |

### The three-layer red line

`packages/client/AGENTS.md` ("Layering red lines") mandates one-way knowledge:

1. **Data object layer** (`runtime`) — React-free, grep-assertable. Owns business state.
2. **Render machinery** (`ui-renderer`) — the *only* place ctx meets React.
3. **Presentation components** (`src/client/*.tsx` in feature packages) — pure props, "expected to be rewritten wholesale."

**Components never see `ctx`.** Everything arrives through the four props shares (see §3).

---

## 2. Design Tokens

Tokens are two-tier: a **static scale** (`--dsw-static-*`, raw palette) and a **semantic alias layer** (`--dsw-alias-*` / `--dsw-specific-*`). **Feature code consumes aliases only** (`docs/web-styling.md`, "Component rules" bullet 2). Both tiers are declared on `body`, with dark overrides on `body[data-ds-dark-theme]` — *not* on `:root`, which matters for custom-property inheritance (`packages/client/ui-theme/src/styles/scrollbar.css:5-9`).

### 2.1 Static palette (excerpt)

Source: `packages/client/ui-theme/src/styles/design-platform.css:4-83`. Families: `neutral`, `neutral-bluish` (the workhorse), `deepseek` (brand), `blue`, `green`, `amber`, `red`.

| Token | Value | Note |
|---|---|---|
| `--dsw-static-deepseek-500` | `rgb(65, 118, 230)` | Brand blue `#4176E6` |
| `--dsw-static-deepseek-450` | `rgb(86, 134, 254)` | Dark-mode brand step |
| `--dsw-static-deepseek-400` | `rgb(103, 158, 254)` | |
| `--dsw-static-deepseek-50` | `rgb(237, 243, 254)` | Bubble tint |
| `--dsw-static-neutral-bluish-00` | `rgb(255, 255, 255)` | Light base |
| `--dsw-static-neutral-bluish-950` | `rgb(21, 21, 23)` | Dark base |
| `--dsw-static-neutral-bluish-1000` | `rgb(15, 17, 21)` | Light-mode primary label |
| `--dsw-static-green-500` | `rgb(34, 197, 94)` | Success |
| `--dsw-static-amber-500` | `rgb(245, 158, 11)` | Warn |
| `--dsw-static-red-600` | `rgb(236, 19, 19)` | Error (light) |
| `--dsw-static-red-400` | `rgb(242, 90, 90)` | Error (dark) |

Steps present per family are irregular by design (e.g. `neutral-bluish` has `00, 50, 60, 75, 100, 150, 200, 300, 400, 500, 600, 700, 750, 800, 850, 875, 900, 950, 1000`). Do not invent intermediate steps.

### 2.2 Semantic aliases — the ones you will actually use

Source: `packages/client/ui-theme/src/styles/design-platform.css:184-338`. Light → dark pairs:

| Alias | Light | Dark | Use |
|---|---|---|---|
| `--dsw-alias-bg-base` | `neutral-bluish-00` | `neutral-bluish-950` | App background |
| `--dsw-alias-bg-layer-1/2/3` | all `neutral-bluish-00` | `875` / `850` / `800` | Elevation ladder (flat in light, stepped in dark) |
| `--dsw-alias-bg-module-platform` | `neutral-bluish-60` | `neutral-bluish-800` | Module/panel fill |
| `--dsw-alias-bg-overlay` | `neutral-bluish-150` | `neutral-bluish-700` | Overlay surface |
| `--dsw-alias-bg-mask-1` | `rgba(0,0,0,.24)` | `rgba(0,0,0,.5)` | Modal scrim |
| `--dsw-alias-bg-skeleton` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.08)` | Loading |
| `--dsw-alias-border-l1` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | Hairline |
| `--dsw-alias-border-l2` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.12)` | Default border |
| `--dsw-alias-border-l3` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.16)` | Emphasis |
| `--dsw-alias-border-l4` | `rgba(0,0,0,.16)` | `rgba(255,255,255,.20)` | Strong |
| `--dsw-alias-label-primary` | `neutral-bluish-1000` | `neutral-bluish-50` | Body text |
| `--dsw-alias-label-secondary` | `neutral-bluish-700` | `neutral-bluish-300` | Secondary |
| `--dsw-alias-label-tertiary` | `neutral-bluish-600` | `neutral-bluish-400` | Hints, meta |
| `--dsw-alias-label-caption` | `neutral-bluish-400` | `neutral-bluish-600` | Captions |
| `--dsw-alias-brand-primary` | `neutral-bluish-1000` | `neutral-bluish-50` | ⚠️ *not* the blue — brand primary is high-contrast neutral |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | `rgb(65,118,230)` | `deepseek-450` | The actual blue accent |
| `--dsw-alias-button-primary-fill` | `= brand-primary` | `= brand-primary` | Primary button |
| `--dsw-alias-button-primary-hover` | `neutral-bluish-750` | `neutral-bluish-100` | |
| `--dsw-alias-button-info-fill` | `deepseek-500` | `deepseek-400` | Informational/blue button |
| `--dsw-alias-button-ghost-active-fill` | `neutral-bluish-100` | `neutral-bluish-750` | Ghost active |
| `--dsw-alias-interactive-bg-hover` | `rgba(38,49,72,.06)` | `rgba(255,255,255,.08)` | Row hover |
| `--dsw-alias-interactive-bg-active` | `rgba(38,49,72,.10)` | `rgba(255,255,255,.14)` | Row active |
| `--dsw-alias-interactive-bg-hover-danger` | `rgba(236,19,19,.05)` | `rgba(242,90,90,.15)` | Destructive hover |
| `--dsw-alias-state-success-primary` | `green-500` | `green-500` | ✅ Trust-grade "pass" |
| `--dsw-alias-state-warn-primary` | `amber-500` | `amber-500` | ⚠️ "caution" |
| `--dsw-alias-state-warn-label` | `amber-600` | `amber-600` | Warn *text* (contrast-safe) |
| `--dsw-alias-state-error-primary` | `red-600` | `red-400` | ❌ "fail" |
| `--dsw-alias-state-business-primary` | `deepseek-500` | `deepseek-400` | Brand-toned state |
| `--dsw-alias-toast-bg` | `neutral-bluish-800` | `neutral-bluish-750` | Toast |
| `--dsw-alias-tooltip-bg` | `neutral-bluish-850` | `neutral-bluish-750` | Tooltip |
| `--dsw-specific-sidebar-fill` | `neutral-bluish-50` | `neutral-bluish-900` | Sidebar column |
| `--dsw-specific-sidebar-nav-item-hover` | `neutral-bluish-75` | `neutral-bluish-850` | Nav hover |
| `--dsw-specific-sidebar-nav-item-active` | `neutral-bluish-100` | `neutral-bluish-750` | Nav active |
| `--dsw-specific-menu` | `= bg-layer-3` | `= bg-layer-3` | Menus/popovers |
| `--dsw-specific-bubble` | `deepseek-50` | `neutral-bluish-850` | User message bubble |
| `--dsw-alias-markdown-code-block` | `neutral-bluish-50` | `neutral-bluish-900` | Code block fill |
| `--dsw-alias-markdown-inline-code` | `neutral-bluish-100` | `neutral-bluish-850` | Inline code |

**Trust-report-card mapping for dsh-bridge:** grade A/pass → `--dsw-alias-state-success-primary`; B/caution → `--dsw-alias-state-warn-primary` (text `--dsw-alias-state-warn-label`); C/fail → `--dsw-alias-state-error-primary`; "verified by DSH-bridge" brand accent → `--dsw-alias-state-business-primary`.

### 2.3 Typography

Font stacks live in `packages/client/ui-theme/src/styles/base.css:6-15` (supplied locally so composites resolve; upstream `deepsuite theme/global.css`):

```css
--dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas,
  'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
```

> The code stack **deliberately omits a bare `monospace` tail** — Windows CJK otherwise falls back to SimSun (`base.css:4-5`). Do not "fix" this.

**UI type scale** — each role ships as a shorthand plus five decomposed vars (`-font-family`, `-font-weight`, `-line-height`, `-font-size`, `-font-style`). Source: `packages/client/ui-theme/src/styles/gradient-shadow-text.css:142-231`.

| Role token | Weight | Size / line-height |
|---|---|---|
| `--dsw-font-xl-24` | 600 | 24px / 32px |
| `--dsw-font-l-20` | 500 | 20px / 28px |
| `--dsw-font-m-18` | 500 | 16px / 28px (⚠️ name says 18, value is 16) |
| `--dsw-font-base-16` | 400 | 16px / 24px |
| `--dsw-font-base-strong-16` | 500 | 16px / 24px |
| `--dsw-font-s-14` | 400 | 14px / 22px |
| `--dsw-font-s-strong-14` | 500 | 14px / 22px |
| `--dsw-font-xs-13` | 400 | 13px / 20px |
| `--dsw-font-xs-strong-13` | 500 | 13px / 20px |
| `--dsw-font-xxs-12` | 400 | 12px / 18px |
| `--dsw-font-xxs-strong-12` | 500 | 12px / 18px |
| `--dsw-font-xxxs-11` | 400 | 11px / 14px |
| `--dsw-font-xxxs-strong-11` | 500 | 11px / 14px |

**Markdown scale** (`gradient-shadow-text.css:22-140`): h1 `700 24/34`, h2 `700 22/32`, h3 `700 20/30`, h4 `600 16/28`, base `400 16/28`, table `15/25` (head weight 500), small `14/24`, inline code `14/22` code-stack, code block `13/22`, code block small `12/18`.

**Weight rule:** "Figma font-weight 510 (an SF Pro variable-font weight) always renders as `font-weight: 500` in this UI" (`design-platform.css:1-3`). Use **400 / 500 / 600 / 700 only**.

### 2.4 Spacing, radius, elevation, motion

There is **no numeric spacing token scale**. Spacing is literal px in CSS Modules, but the *de facto* scale is tight and consistent. Measured frequency across `packages/client/**/*.css`:

| Scale | Observed values (by frequency) |
|---|---|
| `gap` | **8px** (72×), **4px** (45×), **12px** (39×), **6px** (34×), 10px (27×), 2px (15×), 14px, 16px, 24px |
| `border-radius` | **12px** (37×), **6px** (30×), **8px** (28×), **999px** (20×, capsules), 50% (19×, circles), 4px (14×), 10px, 14px, 16px, 18px, 22px |

Practical guidance: **4 / 6 / 8 / 10 / 12** is the spacing rhythm; **6px** small controls, **8px** medium, **12px** cards/rows, **999px** or **50%** for pills and rail circles.

**Elevation** (`gradient-shadow-text.css:5-8`):

| Token | Value |
|---|---|
| `--dsw-shadow-lv1` | `0 2px 4px 0 rgba(0,0,0,.05)` |
| `--dsw-shadow-lv1-blur` | `0 4px 12px 0 rgba(0,0,0,.02)` |
| `--dsw-shadow-lv2` | `0 4px 12px 0 rgba(0,0,0,.02), 0 2px 8px 0 rgba(0,0,0,.04)` |
| `--dsw-shadow-lv3` | (multi-layer; see source) |

**Motion** (`base.css:11-14`) — ride the upstream deepsuite curve, do not author your own easing:

| Token | Value |
|---|---|
| `--ds-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ds-transition-duration-fast` | `0.1s` |
| `--ds-transition-duration` | `0.2s` |
| `--ds-transition-duration-slow` | `0.3s` |

**Gradients** (`gradient-shadow-text.css:2-3,15-16`): `--dsw-linear-gradient-think`, `--dsw-linear-think-select` — the "thinking" fade masks, themed per mode.

**Scrollbars** (`packages/client/ui-theme/src/styles/scrollbar.css`): four `--dsw-alias-scrollbar-*` tokens, consumed only there. A surface picks elevation by **rebinding two local vars on its own container**:

```css
/* elevated surface (menu, popover, dialog) */
.myPanel {
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
```

`--dsh-scrollbar-width: 8px` mirrors the WebKit bar width for surfaces that must align beside it. Never write `::-webkit-scrollbar` rules of your own — a non-`auto` `scrollbar-width`/`scrollbar-color` makes Chromium/Safari discard *every* `::-webkit-scrollbar*` rule for that element (`scrollbar.css:28-40`).

### 2.5 Layout geometry constants

Source: `packages/client/ui-layout/src/client/columns.ts:20-39`.

| Constant | px | Meaning |
|---|---|---|
| `CENTER_MIN` | 640 | Center column floor |
| `SIDEBAR_MIN` / `SIDEBAR_DEFAULT` / `SIDEBAR_MAX` | 264 / **280** / 420 | Sidebar drag range |
| `SIDEBAR_COLLAPSED` | 56 | Rail: 24px icon between 16px paddings |
| `SIDEBAR_AUTO_COLLAPSE` | 1024 | deepsuite LG breakpoint |
| `DETAILS_MIN` / `DETAILS_DEFAULT` / `DETAILS_MAX` | 300 / **360** / 520 | Details drag range |

Settings shell rhythm (`packages/client/ui-settings-general/src/client/SettingsRoot.module.css:1-6`): centered **1080×700** modal, **188px** nav rail + content column, **54px** header, **24px** padded options area, **42px** sidebar foot rows, **36px** rail circles. Settings section content max-width is **760px** (`ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css:6`).

---

## 3. How a Plugin Contributes UI

### 3.1 The one API

> "**One API**: a plugin composes UI only through `ctx.slots.register({ name, children?, store?, inject? }, Component)`. There is no separate slot-definition call, no whitelist face object, no face-minting helper. The shell alone renders `'root'`."
> — `packages/client/AGENTS.md`, "Slot and props discipline" §1

`register` does four things in one breath (`packages/client/ui-slots/README.md:5-7`): contributes a component into a declared slot, declares its child slots, seats a store, and declares the registrant's injected business face.

**`children` = declaration = render authorization = runtime spec, one table.** The slots your component may render are exactly the keys of your `children` object. Rendering an undeclared slot, or declaring one someone else declared, **fails at load** (`AGENTS.md` §2). Slot names mirror the composition path: `<domain>.<entry>.<hole>`.

### 3.2 The four props shares

Component props are an intersection, each derived from a single source of truth (`ui-slots/README.md` table):

| Share | Type | Source |
|---|---|---|
| runtime | `PropsRuntime<K>` | SlotMap entry: owner props + session standard kit + global seat |
| child render | `PropsRenderSlots<S>` | the `children` key set (statically narrowed `renderSlot`) |
| store | `PropsStore<H>` | declared handle: `useStore` selector hook + draft-stripped `actions` |
| business | `I` | inferred from the `inject` factory's return |

Plus `PropsLocale<NS>` for dictionary-bound copy. **Never hand-write a member a share already derives** (`AGENTS.md` §3).

### 3.3 Slot kinds and scopes

Four kinds (`ui-slots/README.md`):

- **`single`** — one occupant. Registering **replaces** the shipped occupant and collapses every child slot it declared. Use for takeovers only.
- **`list`** — additive; entries order by `order`. **This is the seat you want.**
- **`keyed`** — dispatched by a key (tool name, settings namespace). Unclaimed key falls back to the generic form; claimed key is a takeover.
- **`chain`** — entries self-nominate via a pure `ChainSelect` selector; first non-null wins, ties by ascending `priority` then registration order.

Scopes: `'root'`, `'session'`, `'session-maybe'`. Session scope means the framework injects `sessionId` and session hooks; the registrant never passes it.

### 3.4 The full shipped slot map

Extracted from `declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap { ... } }` blocks across `packages/client/**`.

**Frame** — `packages/client/ui-layout/src/client/index.ts:34-85`

| Slot | Kind | Scope | Notes |
|---|---|---|---|
| `root` | single | root | Shell-only. Off limits. |
| `sidebar` | single | root | Occupied by `ui-sidebar`. Takeover. |
| `conversation` | single | session-maybe | Occupied by `ui-conversation`. Takeover. |
| `details` | single | session | Right column. Occupied by `ui-conversation`'s DetailsPanel. |
| **`shell.overlay`** | **list** | root | **"Deliberately generic and unowned by any feature: a badge, a toast stack or a status pill all belong here." Click-through layer; entries opt back into pointer events.** |

**Sidebar** — `packages/client/ui-sidebar/src/client/contract/slots.ts:17-49`

| Slot | Kind | Scope | Owner props |
|---|---|---|---|
| `sidebar.brand.mark` | single | root | `{ size: number }` |
| `sidebar.brand.name` | single | root | — |
| `sidebar.workspaces` | single | root | `{ wide, expandSidebar }` |
| `sidebar.workspaces.directoryFlow` | single | root | |
| `sidebar.settings` | single | root | `{ wide: boolean }` |
| **`sidebar.footer.action`** | **list** | root | `{ wide: boolean }` — actions beside Settings at the foot |

**Settings** — `packages/client/ui-settings/src/client/contract/slots.ts:14-89`

| Slot | Kind | Scope | Notes |
|---|---|---|---|
| `settings.trigger` | single | root | Sidebar-foot trigger content |
| `settings.header` | single | root | Panel title text |
| **`settings.action`** | **list** | root | Content-column header actions |
| `settings.close` | single | root | Close button a11y label |
| **`settings.section`** | **list** | root | **One whole settings page.** Options: `id`, `order`, `label` |
| **`settings.plugins.tab`** | **list** | root | **One tab inside the Plugins section.** Options: `id`, `order`, `label` |
| **`settings.onboarding`** | **list** | root | **Ordered onboarding steps; registrant owns all chrome including its modal surface and `#root` inert ownership** |
| **`settings.general.item`** | **list** | root | One preference row in General. No owner props at all — you draw everything including the label |

**Plugin cards** — `packages/client/ui-settings-plugins/src/client/slot-contract.ts:17-20`

| Slot | Kind | Scope | Notes |
|---|---|---|---|
| **`settings.plugin.item`** | **keyed** | root | **Keyed on the settings namespace the card edits. This is the documented route for an out-of-repo plugin: register the namespace on the Host and the card in the browser; the tab pairs them "without ever learning what the namespace means."** |

**Conversation** — `packages/client/ui-conversation/src/client/contract/slots.ts:61+`

| Slot | Kind | Scope |
|---|---|---|
| `conversation.session` | single | session |
| `conversation.session.header` | single | session |
| `conversation.session.header.lineage` | single | session |
| **`conversation.session.header.actions`** | **list** | session |
| **`conversation.session.header.utilities`** | **list** | session |
| **`conversation.view`** | **list** | session — *a whole tab in the session view ring* |
| `conversation.composer` | chain | session |
| `conversation.composer.bar` | single | session-maybe |
| **`conversation.composer.dock`** | **list** | session |
| **`conversation.input.dock` / `.left` / `.right` / `.overlay`** | **list** | session |
| `conversation.input.model` / `.plan` | single | session |
| `conversation.input.attachments` | single | session-maybe |
| `conversation.chat.node` | keyed | session |
| `conversation.chat.commandview` | keyed | session |
| **`conversation.chat.assistant-actions`** | **list** | session |
| `conversation.chat.turnTail` | chain | session |
| `conversation.message.images` | single | session |
| `conversation.details.tool` | single | session |
| `conversation.hero.brand.mark` | single | root |
| `conversation.hero.workspace` (+`.directoryFlow`) | single | root |
| `conversation.hero.agentPreset` | single | root |

**Tools** — `packages/client/ui-tool/src/client/contract/slots.ts:9-25`

| Slot | Kind | Scope | Notes |
|---|---|---|---|
| **`tool.call.toolview`** | **keyed** | session | **Keyed by wire tool name. Open key domain — register `key: '<your tool name>'` to own how your tool's calls render. Unclaimed keys fall back to the generic tool row, so this is purely additive for your own tool.** Owner props: `callId`, `toolName`, `block`, `cwd?`, `home?`, `openFile`, `inspect?` |

### 3.5 Registration recipe (verbatim shape)

The canonical minimal contributor is `ui-settings-plugin-inventory`. Full body, `packages/client/ui-settings-plugin-inventory/src/client/index.ts:24-46`:

```ts
export const NS = 'settings.pluginInventory'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-inventory: dictionaries')

  const t = ctx.locale.bind(NS)
  const list = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    return result.value
  }
  const injected = () => ({ list })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginInventorySettingsTab))
}
```

Key mechanics:

- **`ctx.slots.inject('<slot>', () => …)`** wraps registration so it survives late declaration, redeclaration, locale change, and teardown *without importing the section owner* (`ui-settings-plugin-inventory/README.md:5`). Activation order between packages is unconstrained — always use it.
- Multiple registrations use a generator: `ctx.slots.inject(a, () => ctx.slots.inject(b, function* () { yield ctx.slots.register(...); yield ... }))` (`packages/client/ui-brand-official/src/client/index.ts:16-22`).
- **Type-only imports pull the SlotMap merge in.** `import type {} from '@deepseek-ai/dsh-client-ui-settings/client'` — no runtime edge, but `PropsRuntime<'settings.plugins.tab'>` now resolves (`ui-settings-models/src/client/index.ts:11-12`).
- `label` is a **function** so a locale change re-registers with fresh text; the ledger bump is the shell's re-render trigger (`ui-settings/src/client/contract/slots.ts` `settings.section` doc).
- **Lazy is the norm.** "It performs no Remote read during plugin activation. Selecting the tab for the first time mounts it and lazily calls `ctx.remote…`" (`ui-settings-plugin-inventory/README.md:5`).
- Host half may be empty: `export function apply(): void {}` (`ui-settings-plugin-inventory/src/index.ts:4`).

### 3.6 Package manifest shape

`packages/client/ui-settings-plugin-inventory/package.json:34-40`:

```jsonc
"dsh": {
  "client": {
    "inject": ["@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-client-runtime",
               "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-locale"],
    "platform": "web"
  }
}
```

Exports are `.`, `./invariant`, `./client`, `./src/*`, `./package.json`; build output `lib/index.js` (host), `lib/client.js` (browser), `lib/types/**`.

**Module externality (`packages/client/AGENTS.md`, "Shared modules"):** React, Cordis, `runtime`, `ui-primitives`, and `ui-slots` are **baseline externals — do not list them** in your manifest. `dsh.client.external` adds a package-specific request. Silence means a private bundled copy. Every client package keeps Cordis in matching `peerDependencies` *and* `devDependencies`. `scripts/verify-client-packages.ts --fix` repairs unambiguous manifest drift.

**Export discipline (`AGENTS.md`, "Export discipline"):** a UI plugin exports **no values** beyond `apply` / `inject` / `Config`, plus store factories consumed type-only. "Cross-package imports of another plugin's symbols are in principle forbidden" — the sanctioned routes are the slot system and ctx services.

### 3.7 Available primitives

`packages/client/ui-primitives/src/index.ts` — "Cordis-free React primitives styled only through `--dsw-*` tokens." Reuse these before authoring anything.

**Controls:** `Button` (variants `primary | ghost | outline | toolbar`, sizes `md` 36px / `sm` 28px, optional 16px leading `icon`; `Button.tsx:8-30`), `Pill` (rounded chip; static `span` or interactive `button` when `onClick` supplied; `active` state; `Pill.tsx:13-30`), `Input`, `Menu` (`MenuEntry | MenuItem | MenuSeparator | MenuLabel`), `DisclosureRow`, `StateDot` (`StateDotState`), `Toast`, `Tooltip` (`TooltipSide`), `HoverCard`, `Modal`, `OnboardingSurface`, `RiskConfirmation`, `ConnectionBanner`.

> **`RiskConfirmation` is a shipped primitive.** For dsh-bridge's "raw install with explicit risk consent" flow, use it rather than rolling a custom scary dialog.

**Content renderers:** `MarkdownText`, `MessageText`, `CodeBlock`, `JsonBlock`, `JsonTree`, `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`, `WebBlock` — each with a `DEFAULT_*_MAX_LINES` and a `*Labels` prop for i18n.

**Hooks:** `useAnchoredPosition`, `useAnchoredMaxHeight`, `useDismissOnOutsidePointer`. **Utils:** `writeClipboard`, `extractMarkdownPlainText`. **Brand:** `FishLogo`, `BrandWordmark`. **Icons:** `export * from './icons/index.tsx'`.

---

## 4. Do / Don't — Looking Native

### DO

1. **Use CSS Modules + `clsx`.** Component styles live beside the component as `X.module.css` (`docs/web-styling.md`).
2. **Consume `--dsw-alias-*` semantic tokens only.** Every color, every elevation.
3. **Ride the shipped motion curve:** `var(--ds-transition-duration) var(--ds-ease-in-out)`.
4. **Pair every font-size with a line-height**, or use a `--dsw-font-*` role token whole.
5. **Reuse `ui-primitives`** — `Button`, `Pill`, `Modal`, `RiskConfirmation`, `DisclosureRow`, `StateDot`, `MarkdownText`, `JsonTree`, `DiffBlock`.
6. **Prefer `list` and `keyed` slots** (`settings.section`, `settings.plugins.tab`, `sidebar.footer.action`, `shell.overlay`, `conversation.view`, `settings.plugin.item`, `tool.call.toolview`). Additive = native.
7. **Wrap every registration in `ctx.slots.inject('<slot>', …)`.** Apply order between packages is unconstrained.
8. **Register `en` + `zh` dictionaries** and make `label` a function so locale changes re-register.
9. **Load lazily.** No Remote read during plugin activation; fetch on first mount.
10. **Handle loading / empty / no-match / failure locally, with retry**, without exposing transport details (`ui-settings-plugin-inventory/README.md`).
11. **Preserve keyboard focus visibility and `@media (prefers-reduced-motion: reduce)`** on every transition and hover-only control.
12. **Rebind `--dsh-scrollbar-thumb{,-hover}` to the l2 pair** on any elevated surface you own.
13. **Use `--dsw-alias-state-*`** for trust-report grades — the semantic layer already encodes success/warn/error in both themes.
14. **Match the geometry rhythm:** 12px card radius, 8px gaps, 42px rows, 36px rail circles, 760px settings content max-width.
15. **Add a "Model Experience" + "KV Cache effect" section to each package README** — it is a repo-wide convention, and matching it reads as native to maintainers.

### DON'T

1. **Don't add Tailwind or a component library.** Explicitly forbidden (`docs/web-styling.md`).
2. **Don't write literal colors or copy static palette values** into feature CSS. Aliases only.
3. **Don't put theme selectors in feature CSS.** No `body[data-ds-dark-theme] .myThing`. Light/dark belongs to the theme owner.
4. **Don't append new tokens to the theme sheets.** "The token sheets are the sole color authority — values absent from cssdesign are deliberately not appended; the nearest semantic token wins" (`ui-theme/README.md`, Known Limitations).
5. **Don't take a `single` slot** (`sidebar`, `conversation`, `details`, `conversation.session`) unless replacement is the intent — it removes every child slot the incumbent declared, silently deleting other plugins' surfaces.
6. **Don't render a slot you didn't declare in `children`.** Load-time failure. "The conflict is the design speaking" (`AGENTS.md` §2).
7. **Don't let a component see `ctx`**, import another plugin's symbols, or read a React context.
8. **Don't hand-make hooks or pass selectors as prop values.** Framework hooks only: `useSession`, `useSessions`, `useWorkspaces`, `useStore`, `renderSlot`, plus renderer-bound `use<Name>`.
9. **Don't use `useSyncExternalStore`** or mirror an external snapshot into local state in a business component.
10. **Don't put business data in a store.** Stores carry viewing/interaction state (selection, drafts, widths); sessions and connections live in the object layer.
11. **Don't write `::-webkit-scrollbar` rules or set `scrollbar-width`/`scrollbar-color`** on your own elements.
12. **Don't use font-weight 510 (or any intermediate).** 400/500/600/700 only.
13. **Don't add a bare `monospace` tail** to a code font stack.
14. **Don't pass `ReactNode`-valued owner props or injected members.** Route node content through a slot. Cross-domain currency is JSON-compatible data and callbacks.
15. **Don't list React, Cordis, `runtime`, `ui-primitives`, or `ui-slots`** in your manifest — baseline externals.
16. **Don't add a value export to unblock a test.** Tests import internals relatively.
17. **Don't classify an entry id by string shape** (`ui-settings-plugin-inventory/README.md`) — treat ids as opaque.
18. **Don't name the package with the full "DeepSeek Harness" trademark.** Use the **DSH** abbreviation, describe the relationship truthfully ("built on DeepSeek Harness"), and avoid official brand materials in promotion (`BRAND_GUIDELINES.md`). `dsh-bridge` complies.
19. **Don't ship a brand mark into `sidebar.brand.*` / `conversation.hero.brand.mark`.** Those are the official-brand seats, gated on `DSH_CLIENT_BUILD_PROFILE === 'official'` (`ui-brand-official/src/client/index.ts:15`).

---

## 5. Layout References (ASCII, inferred from source)

Reconstructed from `ui-layout/src/client/columns.ts`, `AppFrame.module.css`, `ui-sidebar/src/client/contract/slots.ts`, `ui-settings-general/src/client/SettingsRoot.module.css`, and the slot map. Indicative, not pixel-measured.

### 5.1 App frame — three columns + click-through overlay

```
┌────────────────────┬────────────────────────────────────────────┬──────────────────┐
│  [sidebar] 280px   │            [conversation]                  │  [details] 360px │
│  264..420 drag     │            min 640px                       │  300..520 drag   │
│  --dsw-specific-   │                                            │  border-left     │
│    sidebar-fill    │  ┌──────────────────────────────────────┐  │    l2            │
│                    │  │ conversation.session.header          │  │                  │
│ ┌────────────────┐ │  │  title | .lineage | tabs             │  │ conversation.    │
│ │ [.brand.mark]  │ │  │  [.header.actions*] [.utilities*]    │  │   details.tool   │
│ │ [.brand.name]  │ │  └──────────────────────────────────────┘  │                  │
│ └────────────────┘ │                                            │  (0 width when   │
│  + New Session     │  conversation.view*  (tab ring)            │   closed; stays  │
│                    │   ┌────────────────────────────────────┐   │   mounted, border│
│ ┌────────────────┐ │   │ chat.node (keyed)                  │   │   suppressed)    │
│ │ sidebar.       │ │   │  └ tool.call.toolview (keyed)      │   │                  │
│ │   workspaces   │ │   │ chat.assistant-actions*            │   │                  │
│ │  (search +     │ │   │ chat.turnTail (chain)              │   │                  │
│ │   session list)│ │   └────────────────────────────────────┘   │                  │
│ │                │ │                                            │                  │
│ └────────────────┘ │  ┌── conversation.composer (chain) ─────┐  │                  │
│ ─────────────────  │  │ [input.overlay*  — popups, toasts]   │  │                  │
│ [settings.trigger] │  │ ┌──────────────────────────────────┐ │  │                  │
│  42px row          │  │ │ input.attachments                │ │  │                  │
│ [sidebar.footer.   │  │ │ (text area)                      │ │  │                  │
│    action*]  ←YOU  │  │ ├──────────────────────────────────┤ │  │                  │
│                    │  │ │ [input.left*] [.model] [.plan]   │ │  │                  │
│                    │  │ │                    [input.right*]│ │  │                  │
│                    │  │ └──────────────────────────────────┘ │  │                  │
│                    │  │ [composer.dock*] [input.dock*]       │  │                  │
│                    │  └──────────────────────────────────────┘  │                  │
└────────────────────┴────────────────────────────────────────────┴──────────────────┘
   ↕ 8px drag handle (details adds a 12x32 pill at vertical center)
   shell.overlay*  — frame-wide, above all columns, CLICK-THROUGH   ←── YOU (status pill)
   * = list slot (additive). Viewport < 1024px → sidebar auto-collapses to the 56px rail.
```

### 5.2 Collapsed sidebar rail (56px)

```
┌──────┐   56 = 16px pad + 24px icon + 16px pad
│  ◆   │   brand mark
│      │
│  +   │   new session      36x36 circle, border-radius 50%
│  ⌕   │                    hover: --dsw-specific-sidebar-nav-item-hover
│  ▭   │
│      │
│ ──── │
│  ⚙   │   settings.trigger (rail form: 36x36 circle, label visually hidden)
│  ◐   │   sidebar.footer.action*   ←── YOU
└──────┘
```

### 5.3 Settings modal — 1080×700, 188px nav + content

```
        scrim: --dsw-alias-bg-mask-1 (#000 @24% light / 50% dark) + --dsw-mask-blur
┌───────────────────────────────── 1080 x 700 ─────────────────────────────────┐
│ ┌─── 188px nav ───┬───────────────── content column ────────────────────────┐│
│ │                 │ [settings.header]        [settings.action*]      [✕]    ││  54px
│ │  General        ├────────────────────────────────────────────────────────┤│
│ │  Models         │                                                        ││
│ │  Plugins   ◄    │   ┌── settings.plugins.tab* (tabs) ─────────────────┐  ││
│ │  Bridge    ←YOU │   │ [Plugin configuration] [Plugin list] [Trust] ←YOU│ ││
│ │                 │   └─────────────────────────────────────────────────┘  ││
│ │  settings.      │                                                        ││
│ │   section*      │   ┌─ 760px max-width content ──────────────────────┐   ││
│ │   (list; id /   │   │  ⌕ search…                                      │  ││
│ │    order /      │   ├────────────────────────────────────────────────┤   ││
│ │    label)       │   │ ▸ ● plugin-name           [Enabled]            │   ││  card:
│ │                 │   │ ▸ ○ other-plugin          [Disabled]           │   ││  radius 12
│ │                 │   │ ▾ ● bridge-verified       [Enabled]            │   ││  gap 12
│ │                 │   │     entry id                                   │   ││  border l2
│ │                 │   │     configuration / Cordis status              │   ││
│ │                 │   └────────────────────────────────────────────────┘   ││
│ └─────────────────┴────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
      24px padding in the options area. StateDot = ● root-fiber status.
```

### 5.4 Trust report card — proposed, built from shipped parts

```
┌─────────────────────────────────────────────────────────────┐  DisclosureRow
│ ▾  ●  some-community-plugin              [ B ]  [Community] │  StateDot + Pill x2
├─────────────────────────────────────────────────────────────┤  border-top: l1
│  github:owner/repo · MIT · audited 2026-08-25               │  --dsw-font-xxs-12
│                                                              │  label-tertiary
│  ✅ No credential access          state-success-primary      │
│  ✅ No dynamic code evaluation                               │
│  ⚠️  Network egress: api.example.com   state-warn-primary    │  label: state-warn-label
│      └ src/net.ts:42                    ← evidence, JsonTree │
│  ❌ Lifecycle hook writes to ~/.ssh    state-error-primary   │
│      └ src/hooks/install.ts:17          ← DiffBlock          │
│                                                              │
│  [ Install anyway ]  [ View full report ]                    │  Button outline / ghost
└─────────────────────────────────────────────────────────────┘  radius 12, gap 8/12
```

Composition: `settings.plugins.tab` (list, `id: 'trust'`) → `DisclosureRow` + `StateDot` + `Pill` + `Button` from `ui-primitives`; evidence via `DiffBlock` / `ReadBlock` / `JsonTree`; the "Install anyway" path through `RiskConfirmation`.

---

## 6. Recommended Surfaces for dsh-bridge

Ranked by how additive (and therefore how native and low-conflict) each is.

| Surface | Slot | Kind | Why |
|---|---|---|---|
| Trust report / plugin browser | `settings.plugins.tab` | list | The designed extension point; a tab beside "Plugin configuration" and "Plugin list" |
| Bridge's own settings page | `settings.section` | list | `id` + `order` + `label`; a whole page |
| Per-plugin config card | `settings.plugin.item` | keyed | **The documented out-of-repo route** — register namespace on Host + card in browser |
| Connectors onboarding wizard | `settings.onboarding` | list | Ordered steps; registrant owns all chrome and completion |
| One-off preference row | `settings.general.item` | list | No page needed |
| Quick action (open bridge) | `sidebar.footer.action` | list | Beside Settings; receives `{ wide }` |
| Trust/status pill | `shell.overlay` | list | Frame-wide, click-through, explicitly "unowned by any feature" |
| Custom view for a bridge tool | `tool.call.toolview` | keyed | Key on your own wire tool name; purely additive |
| Whole tab in a session | `conversation.view` | list | If the browser deserves a session-level tab |
| Command popups | `ctx.commandUi.register` / `.decorate` | (service) | Not a slot — see `packages/client/ui-commands/README.md:5-7` |

**Avoid** every `single` slot in the frame (`sidebar`, `conversation`, `details`) and `conversation.session*` — taking one deletes other plugins' seats.

### Slash commands (adjacent mechanism)

Commands are **not** slots. `ctx.commandUi.register(name, spec)` contributes a client-owned command (host-name collision fails loud); `ctx.commandUi.decorate(name, spec)` adds a bare-invocation popup to an **existing** host command. Kinds derive per dispatch, never per registration: a host descriptor with `input` → `leadingInput`; a registered `CommandUiSpec` → `popupSelect`; everything else → `execute`. `CommandUiSpec{options, onSelect}` keeps popup data self-contained — the shell component belongs to `ui-commands` and business packages never see it. Menu queries fuzzy-match ordered case-insensitive subsequences; space and Enter still require an exact name. Source: `packages/client/ui-commands/README.md:5-11`.

This is the right seam for the charter's `/help`, `/model`, `/login`, `/review`, `/compact`, `/resume`, `/memory`, `/mcp` ports — `decorate` for names DSH already owns, `register` for genuinely new ones.

---

## 7. Open Questions / Limits of This Research

1. **No screenshots were taken.** The shipped web app was not built or run; §5 is reconstructed from CSS geometry constants and Figma-referencing comments (`SettingsRoot.module.css:1-6` cites figma `501:29904` / `501:29947`). Verify against a running `dsh web` before committing to pixel details.
2. **`BRAND_GUIDELINES.md` is trademark policy, not a visual spec.** It contains no colors, type, or logo usage geometry — only naming and endorsement rules. The visual system lives entirely in `ui-theme`.
3. **`docs/web-styling.md` deliberately does not enumerate token values** ("this document does not duplicate that generated-by-source inventory"). §2 above is extracted directly from the sheets and will drift; re-extract at each DSH version bump.
4. **`--dsw-*` tokens come from an upstream "deepsuite"/cssdesign system** not present in this checkout. Additions require design-owner approval and enter as a static step *plus* a semantic alias in the same change (`ui-theme/README.md`, Known Limitations).
5. **The authoritative composition documents are Agent Notes not read here:** `.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md` (definitive slot model) and `.../2026-07-19-gui-web-client-architecture.md` (loading chain, object layer). Read both before writing slot code.
6. **No spacing token scale exists.** The 4/6/8/10/12 rhythm in §2.4 is empirical frequency analysis, not a published contract.
7. **Third-party themes are "an extension point, not a product"** — registering one means overriding same-named alias variables with no validation that the override set is complete (`ui-theme/README.md`). dsh-bridge should not ship a theme.
8. **Version pinned:** `0.1.1-rc.2`, developer preview. Slot names and props are pre-1.0 and may move.
