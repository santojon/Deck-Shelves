# Architecture

Deck Shelves is a [Decky Loader](https://decky.xyz) plugin that injects custom game shelves into the Steam Deck home screen. This document describes the project structure and how the main systems connect.

## Directory Structure

```
src/
├── index.tsx                  Plugin entry point (Decky lifecycle)
├── types.ts                   Zod schemas: Shelf, Settings, FilterGroup
├── i18n.ts                    i18next initialization (17 locales)
│
├── components/                React UI
│   ├── HomeInject.tsx          Portal renderer for home screen shelves
│   ├── DeckRow.tsx             Shelf row layout (imports shelf/ modules)
│   ├── Shelf.tsx               Single shelf data resolver (memoized + generation-id cancel)
│   ├── DeckQAMSettings.tsx     Quick Access Menu settings panel
│   ├── FilterPanel.tsx         Filter group editor UI
│   ├── AboutPage.tsx           About / documentation page
│   ├── Settings.tsx            Settings page wrapper
│   ├── ErrorBoundary.tsx       React error boundary
│   ├── icons.tsx               Shared feather-style SVG icons (FunnelIcon, EyeIcon, …)
│   ├── home/navPatches/         Split nav-patch modules (one concern per file)
│   │   ├── reparent.ts          reparentNavTreeNodes — splice between recents and tabs
│   │   ├── menuButton.ts        MENU button → game context menu
│   │   ├── edgeNavigation.ts    L/R throttle + DOWN tilt guard (when home tabs hidden)
│   │   ├── verticalBridge.ts    DOWN/UP bridge between mount and native neighbors
│   │   └── constants.ts         DIR_*, DS_*_PATCHED, OPTIONS_BUTTON
│   ├── filter/                 Filter group editor (recursive UI)
│   ├── ui/                     Shared domain-agnostic primitives
│   │   ├── ModalShell           .deck-shelves-modal-scope + DeckModalStyles
│   │   ├── FieldContainer       .field-item-container + scrollable mode (focusin → scrollIntoView)
│   │   ├── LabeledTextField     Field + TextField + textFromDeckyChange
│   │   └── CollapsibleSection   QAM collapsible section with localStorage state
│   ├── qam/
│   │   ├── common/
│   │   ├── list/
│   │   └── modals/
│   │       ├── EditShelfModal.tsx          Regular shelf editor
│   │       ├── EditSmartShelfModal.tsx     Smart shelf editor (sort override, filterGroup, smartParams, refresh interval)
│   │       ├── (Export/Import/Template/ResetAll/Delete/ImportFromCustomFilters with `scope`)
│   │       └── editShelf/                  Components shared by both edit modals
│   │           ├── HighlightMiniCard.tsx   Mini-card with fallback art chain + chevrons + selected/grabbed states
│   │           ├── HighlightRow.tsx        Horizontal row with focus-centered scroll + re-center
│   │           ├── ManualSortRow.tsx       Manual order row — gamepad grab + pointer-hold drag + chevrons
│   │           ├── SavedFiltersBar.tsx     Saved-filters dropdown + "save current"
│   │           ├── VisualTabContent.tsx    Toggles + highlight picker + odd/even patterns + preview
│   │           ├── DisplayTabContent.tsx   hide-* toggles (status line, install indicator, new badge, compat icons, non-steam, shelf title, game names)
│   │           ├── ModalHeader.tsx         Title + preview counter
│   │           └── constants/types/utils.ts
│   ├── shelf/
│   │   ├── types.ts            DeckRowItem, card dimensions, REFRESHABLE_SMART_MODES
│   │   ├── shelfStyles.ts      CSS injection, native dim discovery, ds-refresh-spin keyframes, TiltedHome compat
│   │   ├── GameCard.tsx         Game card with native class injection + label/status gates
│   │   ├── MoreCard.tsx         "View more" trailing tile (non-smart shelves)
│   │   ├── RefreshCard.tsx      Refresh trailing tile (refreshable smart shelves and sort=random)
│   │   ├── PlaceholderCard.tsx  Fallback card
│   │   └── HeroBackground.tsx   Two-layer cross-fade hero art + ArtHero label overlay
│   ├── about/
│   │   ├── DocSection.tsx
│   │   ├── DocCallout.tsx
│   │   ├── DocAccordion.tsx
│   │   ├── OverviewPage.tsx / HowToPage.tsx / ShelvesPage.tsx / FiltersPage.tsx
│   │   ├── SortPage.tsx / SmartShelvesPage.tsx / SupportPage.tsx
│   └── styles/
│       ├── DeckModalStyles.tsx
│       └── DeckQAMStyles.tsx
│
├── steam/
│   └── index.ts               Steam API access: app overviews, collections,
│                                tabs, filters, sorting, developer data (2100+ lines)
│
├── store/
│   └── settingsStore.ts       Settings persistence: backend RPC + localStorage cache
│
├── core/
│   ├── focusRestore.ts         Focus restoration after navigation
│   ├── scrollUtils.ts          Centered scroll calculation
│   ├── shelfRefresh.ts         Global shelf refresh emitter
│   ├── steamAssets.ts          Image URL generation (portrait, landscape, hero)
│   ├── steamGameMenu.ts        Native game context menu extraction
│   ├── webpackCompat.ts        Runtime class discovery (viewport + native shelf/card/section tokens)
│   ├── reorder.ts              useContainerDragReorder + pure helpers (findReorderTargetIndex, moveInOrder)
│   ├── cssLoaderDetect.ts      isCssLoaderActive(), isArtHeroActive(), getNativeRecentsClassName()
│   ├── steamOSVersion.ts       getSteamOSVersion() helper
│   ├── pluginApi.ts            Public inter-plugin API (v2)
│   └── perf.ts                 Performance marks/measures
│
├── domain/
│   ├── settings.ts             Pure settings operations (patch, add, delete, move)
│   ├── defaults.ts             Default shelf/settings/filter factories
│   ├── templates.ts            Shelf preset templates (11 entries)
│   ├── shelfOrder.ts           pickFirstVisibleShelfId + interleaveSmartShelves (pure helpers)
│   └── customfilters.ts        TabMaster filter conversion
│
├── features/
│   └── settings/
│       └── controller.tsx      Settings controller hook (useSettingsController)
│
├── integrations/
│   ├── index.ts                Integration barrel
│   ├── registry.ts             Plugin detection (TabMaster, UnifiDeck)
│   ├── tabmaster.ts            TabMaster settings file reader
│   ├── unifideck.ts            UnifiDeck non-Steam app detection
│   └── domtabs.ts              DOM-based tab discovery
│
├── runtime/
│   ├── homePatch.tsx           Home screen DOM patching + fallback renderer
│   ├── recentsReplace.tsx      Experimental: replaces native recents data source with first shelf
│   ├── steamHost.ts            Steam window/document discovery
│   ├── deckyPlatform.ts        Platform interface implementation
│   ├── platform.ts             Platform interface definition
│   ├── platformContext.tsx      React context provider
│   ├── logger.ts               Colored console logger (__DEV__ gated)
│   ├── diagnostics.ts          Diagnostic event collection
│   ├── systemEvents.ts         Suspend/resume event handlers
│   └── embeddedClassMap.ts     Bootstrap webpack class seed
│
├── shims/                     React/Decky UI shims for GamepadUI environment
│
└── test/                      Vitest + Python test suites
    ├── steam/                  applyManualOrder, evaluateFilterGroup, smartShelves
    ├── components/             refreshableSmartModes
    ├── core/                   reorder, webpackCompat
    ├── domain/                 settings, customfilters, shelfOrder, templates, schemas
    ├── qa/                     qam-visibility
    ├── stubs/                  decky-api / decky-manifest stubs (vitest aliases)
    ├── steam.test.ts
    ├── scrollUtils.test.ts
    └── test_main.py            Python sanitizer tests (pytest)

main.py                        Python backend (settings read/write, atomic saves)
plugin.json                    Decky plugin manifest
```

## Data Flow

```
Settings (backend JSON) → settingsStore → controller → HomeInject → Shelf → DeckRow → GameCard
                                                          ↓
                                                    homePatch (fallback DOM renderer)
```

1. **Settings** are persisted by the Python backend (`main.py`) and cached in `localStorage`
2. **`settingsStore`** manages the cache, backend RPC calls, and subscriber notifications
3. **`controller`** (React hook) provides actions and state to QAM components
4. **`HomeInject`** creates a portal into the Steam home screen DOM
5. **`Shelf`** resolves app IDs for each shelf source (collection, tab, filter)
6. **`DeckRow`** renders the horizontal card row with scroll management
7. **`homePatch`** provides a fallback DOM renderer when React portal is unavailable

> **Note:** `HomeShelves` runs in `SharedJSContext`, but the portal is mounted into the Big Picture document. Any DOM query (e.g. `querySelector`) must use `getPreferredSteamDocument()` — querying `document` directly will target the wrong context and silently return nothing.

## Key Systems

### Native Class Discovery (`webpackCompat.ts`)
Steam's GamepadUI uses webpack-hashed CSS classes that change on updates. The plugin discovers these at runtime by inspecting the DOM and stores them in `window.__DS_CLASS_MAP__`. This allows shelf cards to receive native Steam classes for CSS Loader theme compatibility.

> **Caution:** class tokens in `window.__DS_CLASS_MAP__` are tied to specific SteamOS builds. A Steam update can rename them silently. The `webpackCompat` discovery re-runs on mount — never cache tokens in plugin settings or hardcode them in application logic.

### Navigation Integration (`home/navPatches.ts`)
The plugin integrates with Steam's `FocusNavController` gamepad navigation system:
- Reparents shelf nav tree nodes into the correct position
- Patches `BTryInternalNavigation` to prevent horizontal focus escape
- Intercepts the Options button to show the native game context menu

> **Caution:** `home/navPatches.ts` is the most fragile part of the codebase. It monkey-patches `FocusNavController` on a single shared prototype. Any error here can break gamepad navigation across the entire Steam UI. Changes must be minimal and always preserve the stability guard that re-runs the reparent on remount.

### Hero Background (`shelf/HeroBackground.tsx`)
The hero background replicates the exact native SteamOS "Recent Games" hero structure, discovered via Chrome DevTools Protocol (CDP) inspection on SteamOS 3.8:

| Layer | Native Role | Implementation |
|-------|-------------|----------------|
| `IMG` | Hero art with `grayscale(1) contrast(1)`, 0.3s fade-in animation | Applies discovered or fallback filter + animation |
| Zoom container | 25s slow zoom (`ease 0s 1 alternate`) | Discovered animation or `@keyframes ds-hero-zoom` fallback |
| Mask wrapper 1 | `mask-image: radial-gradient(75% 83% at 50% 18%, ...)` | Applied via inline style with webkit prefix |
| Mask wrapper 2 | Same radial-gradient mask (double masking for stronger fade) | Second nested div with identical mask |

The native hero does **not** use linear gradients or pseudo-elements for the bottom fade. The vignette effect is entirely achieved via radial-gradient `mask-image` on two wrapper divs, creating a soft oval reveal centered at 50% 18% (upper center).

At runtime, the component discovers native classes from the recents section's sibling element and applies them for CSS Loader theme compatibility.

### Performance Strategy
- `MutationObserver` replaces polling where possible (HomeInject, ShelvesContainer, navPatches)
- Single global timer for `ensureStyles()` shared by all shelf rows
- Focus restore uses MutationObserver with 500ms→2s polling fallback
- `logInfo()` is a no-op in production builds (`__DEV__` flag)
- Collection cache uses 60s TTL; smart-shelf resolver cache TTL defaults to 60 min (per-shelf override via `refreshIntervalMinutes`)
- Native dimension changes require 4px tolerance + 2-cycle confirmation
- `Shelf` is `memo`ized + carries a generation-id token on each `resolveShelfAppIds` call; in-flight resolves drop their `then`/`catch` if a newer one started, so a slow previous resolve cannot overwrite a newer result
- nav-tree reparent poll throttled from 750 ms → 3000 ms (relies on MutationObservers + focusin for fast paths)

> **Note:** the API surface at `window.__DECK_SHELVES_API__` is **v2** — registries (`registerShelfSource` / `registerSmartShelfSource` / `registerFilterType` / `registerSortOption` / `registerImportType` / `registerSavedFilter`) are wired and live; the consumer-side accessors (`getShelves`, `getSmartShelves`, `getSavedFilters`, `subscribeTo*`) are stubbed and connect to the live `settingsStore` in v2.0.0. See [`plugin-api.md`](./plugin-api.md).

### Recents Replace (`recentsReplace.tsx`)
Experimental feature (`recentsReplaceSource` setting, gated behind `hideRecents`). Instead of visually hiding the native "Recently Played" section, it patches the section's render output via `routerHook.addPatch("/library/home", ...)` + nested `afterPatch` calls to replace the `games` prop with the first visible shelf's app IDs. The native DOM, CSS, animations, hero background, and focus callbacks are preserved entirely. Safety mechanisms:
- App IDs are filtered by `app_type` (1 = Game, 2 = Application) before injection — shortcuts, DLC, and music entries crash Steam's `userCollections` getter.
- A global `error`/`unhandledrejection` trap detects `userCollections`-class errors and auto-disables the experiment.
- On failure, `isRecentsReplaceInjecting()` returns `false` and `HomeInject` falls back to the standard visual-hide behaviour. The QAM shows a `RecentsReplaceErrorBanner`.

### Hide Home Tabs (`hideHomeTabs`)
When enabled, hides the native Novidades/Amigos/Recomendados tab bar. Detection uses `[role="tablist"]` as a sibling of the plugin's mount element — no hardcoded class names, compatible with SteamOS updates.

> **Note:** the hero does **not** use linear gradients or pseudo-elements for the bottom vignette. The fade is achieved entirely via `mask-image: radial-gradient(...)` on two nested wrapper divs — matching the native structure discovered via CDP. Replacing it with a CSS gradient would break CSS Loader theme compatibility.

### Plugin API (`pluginApi.ts`)
External plugins can register custom shelf sources, filter types, sort options, smart-shelf modes, import formats, and pre-baked saved filters at runtime. The full API is documented in [`plugin-api.md`](./plugin-api.md). Quick example:
```ts
const cleanup = window.__DECK_SHELVES_API__.registerShelfSource({
  id: "my-plugin-source",
  displayName: "My Custom Source",
  resolve: async (limit) => [appid1, appid2, ...],
});
```

### CSS Loader / ArtHero / TiltedHome compat (`core/cssLoaderDetect.ts`)
- `isCssLoaderActive()` / `isArtHeroActive()` read `<style class="css-loader-style">` tags in the active document.
- `getNativeRecentsClassName(mountEl)` reads the live native-recents wrapper class from `mountEl.previousElementSibling` — never hardcoded.
- When `hideRecents=true` and a CSS Loader theme is active, `HomeInject` adds `data-ds-recents-slot="true"` plus the live wrapper class to the first DS shelf — additively (existing `ds-*` classes are preserved). Invariants enforced by the guard chain are documented inline in `HomeInject.tsx`.
- ArtHero label overlay (in `HeroBackground.tsx`) clones the focused card's `.ds-card-label` as a `position: fixed` overlay above the row; tracks the focused card horizontally on row scroll; reactive to runtime CSS Loader toggles via `MutationObserver` on the Big Picture document's `<head>`.
- TiltedHome compat applies `skew(var(--ren-tilt-angle))` to the entire `.ds-card` (image + label + glow + MoreCard + RefreshCard). Focus state composes `skew + scale + translateZ` with `!important` to win over Steam's higher-specificity `.BasicUI .NATIVE.Focusable:focus { transform: translateZ(15px) }` rule. The selector intentionally omits `.gpfocuswithin` (Steam applies that to every card when any descendant of the row has focus — including it would scale every card and erase the focus indicator).

### Refresh card on shelves (`shelf/RefreshCard.tsx` + `shelf/types.ts > REFRESHABLE_SMART_MODES`)
Smart shelves whose result can change between two clicks (`random_pick` / `time_of_day` / `spare_time` / `recently_played`) get a Refresh card instead of the "view more in library" tile. Non-smart shelves with `sort === "random"` also get the Refresh card (it's the only non-smart case whose order can change between clicks; clicking clears the `ds-random-*` localStorage cache and re-resolves only that shelf). Spin animation is driven by a CSS keyframe via DOM class toggle (`.ds-refresh-spinning` on `iconRef`) — not React state, so `setAppIds()` reconciliation cannot cancel the animation mid-flight. Per-shelf `hideRefreshCard` and global `globalHideRefreshCard` suppress the trailing refresh card without changing recompute / cache cadence; `hideSeeMore` / `globalHideSeeMore` mirror the same per-shelf vs. global pair for the trailing "See more" card.

### Filter system (`steam/index.ts > evaluateFilterGroup` + `components/filter/`)

Filter groups are AND/OR predicates evaluated against a single source pool — never list-unions. The full library flows through `evaluateFilterGroup` once and each app is tested against every item independently. `merge` is a special filter type that wraps a nested predicate group with its own `mode: "and" | "or"` plus a sub-`items` array — useful for composing OR-of-predicates inside an outer AND group (e.g. `merge { or, [installed, nonSteam] }` to surface "Steam installed OR any non-Steam app" in one shelf). Sub-filters are edited via the recursive `MergeFilterOptions` component which renders a `<FilterPanel>` for the children; saved filters can be applied at any merge level.

Asc/desc inversion is a separate boolean (`Shelf.sortReverse` / `SmartShelf.sortReverse`, plus `manualBaseSortReverse` for the manual case) toggled by a 40×40 icon button next to the sort dropdown in `EditShelfModal` / `EditSmartShelfModal`. The flag flows through `resolveShelfAppIds(source, limit, sort, shelfId, sortReverse)` to `applySortToIds`, which reverses the result post-sort. Skipped for `manual` (would invalidate user order) and `random` (re-reversing a shuffle adds no signal). When no explicit sort is persisted but reverse is on, `Shelf.tsx` substitutes `"alphabetical"` as the resolver sort so the reverse has somewhere to apply. The `"alphabetical"` branch in `applySortToIds` is **explicit** — without it, the internal sort registry's noop pass-through descriptor would intercept and skip sorting.

Native Steam library tabs (`installed`, `great_on_deck`) post-filter the candidate set to `app_type === 1` (game) or `undefined` (unknown — allowed through) AND exclude non-Steam shortcuts, matching the native SteamOS Installed tab. Applied in both the TabMaster path (`getCustomFiltersAppsForContainer`) and the store-API path (`getTabAppIdsFromStore`); other tab ids are untouched.
