# Architecture

*[Leia em português](pt-BR/architecture.md)*

Deck Shelves is a plugin that injects custom game shelves into the Steam Deck home screen. This document describes the project structure and how the main systems connect.

<p align="center">
  <img src="../assets/screenshots/home.png" alt="Deck Shelves shelves injected into the Steam Deck home" width="640">
</p>

## System overview

### The plugin in its environment

Deck Shelves runs on its own standalone host (no plugin loader needed), or
inside Decky Loader — the same bundle, injected either way — renders into
Steam's Gaming Mode home screen, and reads from the local library plus a
few optional external sources.

```mermaid
flowchart TB
    user(["Steam Deck user<br/>Gaming Mode"])

    subgraph deckshelves["Deck Shelves"]
        plugin["Deck Shelves plugin<br/>custom Home-screen shelves"]
    end

    subgraph host["Host platform"]
        decky["Standalone host or Decky Loader<br/>host/plugin runtime"]
        steam["Steam client<br/>GamepadUI + app library"]
    end

    subgraph external["External data sources"]
        launchers["Game launchers<br/>Heroic / EmuDeck / non-Steam"]
        online["Online metadata<br/>store, wishlist, artwork"]
        gh["GitHub Releases<br/>update check + download"]
    end

    subgraph optional["Optional companion plugins"]
        css["CSS Loader themes"]
        tabmaster["TabMaster / UnifiDeck / Non-Steam Badges"]
    end

    user -->|"browses shelves"| steam
    steam -->|"Home screen"| plugin
    decky -->|"loads, sandboxes"| plugin
    plugin -->|"reads library, collections, artwork"| steam
    plugin -->|"shortcuts + installed games"| launchers
    plugin -->|"fetches metadata / prices"| online
    plugin -->|"checks + downloads updates"| gh
    plugin -.->|"adapts layout to"| css
    plugin -.->|"reads tabs / filters from"| tabmaster

    classDef ds fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#12315e
    classDef platform fill:#ede9fe,stroke:#7c3aed,color:#3b2a63
    classDef ext fill:#fef3c7,stroke:#d97706,color:#5c3d0a
    classDef opt fill:#f1f5f9,stroke:#94a3b8,color:#334155
    classDef actor fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e
    class plugin ds
    class decky,steam platform
    class launchers,online,gh ext
    class css,tabmaster opt
    class user actor
```

### Runtime pieces

The frontend runs in Steam's GamepadUI process (`SharedJSContext`); a small
Python backend owns filesystem and outbound network access. Steam and Decky are
reached only through the host adapter; external plugins register through the
public API.

```mermaid
flowchart TB
    subgraph gamepadui["Steam GamepadUI process — SharedJSContext"]
        frontend["Frontend<br/>React UI + runtime patches"]
        publicapi["Public plugin API<br/>@deck-shelves/api contract"]
        hostadapter["Host adapter<br/>@deck-shelves/host contract"]
    end

    subgraph deckyproc["Decky Loader"]
        backend["Python backend<br/>main.py RPC methods"]
    end

    subgraph disk["Local storage"]
        settings[("Settings JSON<br/>shelves, profiles, filters")]
        downloads[("~/Downloads<br/>update .zip")]
    end

    steam["Steam client APIs"]
    net["GitHub / online sources"]

    frontend -->|"register / read"| publicapi
    frontend -->|"call capabilities"| hostadapter
    hostadapter -->|"@decky/ui + @decky/api"| steam
    frontend -->|"RPC call()"| backend
    backend -->|"read / write"| settings
    backend -->|"download release"| downloads
    backend -->|"fetch metadata / releases"| net
    frontend -->|"read library, collections, artwork"| steam

    classDef ds fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#12315e
    classDef contract fill:#e0e7ff,stroke:#4f46e5,color:#26235c
    classDef platform fill:#ede9fe,stroke:#7c3aed,color:#3b2a63
    classDef data fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef ext fill:#fef3c7,stroke:#d97706,color:#5c3d0a
    class frontend,backend ds
    class publicapi,hostadapter contract
    class steam platform
    class settings,downloads data
    class net ext
```

### Frontend modules

Work flows from a home render down to resolved shelf contents. Modules outlined
in **red** are the sensitive ones — shelf resolution, refresh and the public API
surface — where changes carry the most risk. `src/domain` (green) is pure logic
with no side effects, and the state modules are event-driven with no polling.

```mermaid
flowchart TB
    subgraph runtime["src/runtime"]
        homepatch["homePatch<br/>injects shelves into Home"]
        adapter["host/decky<br/>Steam + Decky adapter"]
        state["deviceState / sessionState<br/>event-driven signals"]
    end

    subgraph components["src/components"]
        shelf["shelf/*<br/>GameCard, rows"]
        filter["filter/*<br/>filter editor"]
        qam["qam/*<br/>Quick Access panel"]
        about["about + settings pages"]
    end

    subgraph core["src/core"]
        pluginapi["pluginApi<br/>public API surface"]
        refresh["shelfRefresh<br/>debounced refresh"]
        updates["updateNotifier + updateDownload"]
    end

    subgraph steamdir["src/steam"]
        resolver["index<br/>shelf source resolvers"]
        smart["smartShelves<br/>smart-shelf + visibility"]
    end

    domain["src/domain<br/>pure rules: filters, templates, triggers"]
    store["src/store<br/>settingsStore global state"]
    integrations["src/integrations<br/>one descriptor per plugin: TabMaster / UnifiDeck / ..."]
    themes["src/themes<br/>one adapter per theme + registry"]

    homepatch --> shelf
    shelf --> refresh
    refresh --> resolver
    resolver --> smart
    resolver --> domain
    filter --> domain
    qam --> store
    about --> updates
    pluginapi --> resolver
    pluginapi --> store
    integrations --> resolver
    store -->|"reads/writes via"| adapter
    resolver -->|"library data via"| adapter
    smart --> state

    classDef ui fill:#dbeafe,stroke:#2563eb,color:#12315e
    classDef sensitive fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d
    classDef pure fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef rt fill:#ede9fe,stroke:#7c3aed,color:#3b2a63
    classDef ext fill:#fef3c7,stroke:#d97706,color:#5c3d0a
    class shelf,filter,qam,about ui
    class pluginapi,refresh,updates,resolver,smart sensitive
    class domain pure
    class homepatch,adapter,state,store rt
    class integrations ext
```

## Directory Structure

```
src/
├── index.tsx Plugin entry point
├── types.ts Zod schemas: Shelf, Settings, FilterGroup
├── i18n.ts i18next initialization
│
├── components/ React UI
│ ├── HomeInject.tsx Portal renderer for home screen shelves
│ ├── DeckRow.tsx Shelf row layout (imports shelf/ modules)
│ ├── Shelf.tsx Single shelf data resolver (memoized + generation-id cancel)
│ ├── DeckQAMSettings.tsx Quick Access Menu settings panel
│ ├── FilterPanel.tsx Filter group editor UI
│ ├── AboutPage.tsx About / documentation page
│ ├── Settings.tsx Settings page wrapper
│ ├── SettingsPage.tsx Full-page Settings: one tab per area (Shelves, Profiles, Integrations, Bindings, Backup, Suggestions, Statistics, Advanced, Developer)
│ ├── ErrorBoundary.tsx React error boundary
│ ├── icons.tsx Shared feather-style SVG icons (FunnelIcon, EyeIcon, …)
│ ├── home/navPatches/ Split nav-patch modules (one concern per file)
│ │ ├── reparent.ts reparentNavTreeNodes — splice between recents and tabs
│ │ ├── menuButton.ts MENU button → game context menu
│ │ ├── edgeNavigation.ts L/R throttle + DOWN tilt guard (when home tabs hidden)
│ │ ├── verticalBridge.ts DOWN/UP bridge between mount and native neighbors
│ │ └── constants.ts DIR_*, DS_*_PATCHED, OPTIONS_BUTTON
│ ├── filter/ Filter group editor (recursive UI)
│ ├── ui/ Shared domain-agnostic primitives
│ │ ├── ModalShell.deck-shelves-modal-scope + DeckModalStyles
│ │ ├── FieldContainer.field-item-container + scrollable mode (focusin → scrollIntoView)
│ │ ├── LabeledTextField Field + TextField + textFromDeckyChange
│ │ ├── CollapsibleSection QAM collapsible section with localStorage state
│ │ └── PageHeader Back arrow + title + trailing slot for dedicated routes
│ ├── settings/details/ One file per Settings tab (Profiles, Statistics and Suggestions live in src/features/)
│ │ ├── ShelvesDetail Regular + smart shelves CRUD (chips, edit/delete, unified reorder ↑↓)
│ │ ├── IntegrationsDetail Plugin descriptors with per-row enable/disable
│ │ ├── ButtonBindingsDetail Gamepad + keyboard shortcut editor
│ │ ├── BackupDetail 3-scope import/export wrap (regulars, smart, all)
│ │ ├── AdvancedDetail System information, snapshots, developer-mode switch, factory reset
│ │ └── DeveloperDetail Diagnostic log, performance panel, resolver inspector, device simulator
│ ├── qam/
│ │ ├── common/
│ │ ├── list/
│ │ └── modals/
│ │ ├── EditShelfModal.tsx Regular shelf editor
│ │ ├── EditSmartShelfModal.tsx Smart shelf editor (sort override, filterGroup, smartParams, refresh interval)
│ │ ├── (Export/Import/Template/ResetAll/Delete/ImportFromCustomFilters with `scope`)
│ │ └── editShelf/ Components shared by both edit modals
│ │ ├── EditShelfFrame.tsx Shared modal frame (header, tabs, footer) for both editors
│ │ ├── ShelfPreview.tsx Live preview row: highlight picker, manual order (gamepad grab + pointer drag)
│ │ ├── SavedFiltersBar.tsx Saved-filters dropdown + "save current"
│ │ ├── VisualTabContent.tsx Toggles + highlight picker + odd/even patterns + preview
│ │ ├── DisplayTabContent.tsx hide-* toggles (status line, install indicator, new badge, compat icons, non-steam, shelf title, game names)
│ │ ├── ModalHeader.tsx Title + preview counter
│ │ └── constants/types/utils.ts
│ ├── shelf/
│ │ ├── types.ts DeckRowItem, card dimensions, REFRESHABLE_SMART_MODES
│ │ ├── shelfStyles.ts CSS injection, native dim discovery, ds-refresh-spin keyframes, TiltedHome compat
│ │ ├── GameCard.tsx Game card with native class injection + label/status gates
│ │ ├── MoreCard.tsx "View more" trailing tile (non-smart shelves)
│ │ ├── RefreshCard.tsx Refresh trailing tile (refreshable smart shelves and sort=random)
│ │ ├── PlaceholderCard.tsx Fallback card
│ │ ├── ShelfRow.tsx / ShelfSkeleton.tsx Card window rendering / below-the-fold placeholder
│ │ └── PerShelfHero.tsx Per-shelf hero art (two-slot cross-fade) + ArtHero label overlay
│ ├── about/
│ │ ├── DocSection.tsx
│ │ ├── DocCallout.tsx
│ │ ├── DocAccordion.tsx
│ │ ├── OverviewPage.tsx / HowToPage.tsx / ShelvesPage.tsx / FiltersPage.tsx
│ │ ├── SortPage.tsx / SmartShelvesPage.tsx / SupportPage.tsx
│ └── styles/
│ ├── DeckModalStyles.tsx
│ └── DeckQAMStyles.tsx
│
├── steam/
│ ├── index.ts Source resolver dispatcher and facade; one module
│ │ per concern beside it (collections, library tabs,
│ │ filter evaluation, sorting, resolvers, online cache).
│ │ Dispatches first-party v3 ids through `v3Extensions`
│ │ BEFORE the external-plugin fallback so collisions
│ │ resolve to built-in implementations.
│ ├── v3Extensions.ts First-party Filter v3 (32 evaluators), Sort v3 (27
│ │ comparators), Shelf Source Ecosystem v3 (19
│ │ resolvers) + descriptive registry entries used
│ │ by `internalRegistry.ts` to surface them via
│ │ the public Plugin API.
│ └── smartShelves.ts Smart-shelf candidate resolution per mode
│
├── store/
│ └── settingsStore.ts Settings persistence: backend RPC + localStorage cache
│
├── core/
│ ├── focusRestore.ts Focus restoration after navigation
│ ├── scrollUtils.ts Centered scroll calculation
│ ├── shelfRefresh.ts Global shelf refresh emitter
│ ├── steamAssets.ts Image URL generation (portrait, landscape, hero)
│ ├── steamGameMenu.ts Native game context menu extraction
│ ├── webpackCompat.ts Native class-token lookups (viewport + native shelf/card/section tokens) over the bundled class map
│ ├── reorder.ts useContainerDragReorder + pure helpers (findReorderTargetIndex, moveInOrder)
│ ├── cssLoaderDetect.ts Compatibility facade over src/themes (same names, same import path)
│ ├── steamOSVersion.ts getSteamOSVersion() helper
│ ├── pluginApi.ts Public inter-plugin API (`window.deckShelves`, major version 4)
│ └── perf.ts Performance marks/measures
│
├── domain/
│ ├── settings.ts Pure settings operations (patch, add, delete, move)
│ ├── defaults.ts Default shelf/settings/filter factories
│ ├── templates.ts Shelf preset templates (15 entries)
│ ├── shelfOrder.ts pickFirstVisibleShelfId + interleaveSmartShelves (pure helpers)
│ └── customfilters.ts TabMaster filter conversion
│
├── features/
│ ├── setup/ Setup wizard (tiles → review → done), first-run tour + banners, wizard entry
│ ├── statistics/ Statistics + Suggestions panels (reactive, "New" chip), usage charts
│ ├── profiles/ Profiles section (QAM), Profiles detail (Settings), save / rename modals
│ ├── search/ Quick Search overlay + provider registry
│ ├── sidenav/ Side Nav overlay
│ └── settings/
│ ├── controller.tsx Hook entry (state + effects + spread compose)
│ └── controller/ Action slices (composed via spreads)
│ ├── shelves.ts Regular-shelf CRUD + import/export/reset
│ ├── smartShelves.ts Smart-shelf CRUD + surprise-me + import/export
│ ├── savedFilters.ts SavedFilter + SavedSmartFilter CRUD
│ ├── online.ts Online-features toggles + acceptOnlinePrivacy
│ ├── globalVisual.ts 36 global visual setters (consolidated)
│ └── profiles.ts Usage profiles + unified/lightMode/featureToggle setters
│
├── integrations/
│ ├── index.ts Integration barrel
│ ├── descriptors.ts One descriptor per third-party plugin (presence, capabilities, labels)
│ ├── registry.ts Plugin detection over the descriptors
│ ├── tabmaster.ts TabMaster settings file reader
│ ├── nonsteambadges.ts Non-Steam Badges integration
│ └── domtabs.ts DOM-based tab discovery
│
├── runtime/
│ ├── homePatch.tsx Home screen DOM patching + fallback renderer
│ ├── recentsReplace.tsx Experimental: replaces native recents data source with first shelf
│ ├── steamHost.ts Steam window/document discovery
│ ├── deckyPlatform.ts Platform interface implementation
│ ├── platform.ts Platform interface definition
│ ├── platformContext.tsx React context provider
│ ├── logger.ts Colored console logger (info lines only in dev builds or with verbose logging)
│ ├── diagnostics.ts Diagnostic event collection
│ ├── systemEvents.ts Suspend/resume event handlers
│ └── embeddedClassMap.ts Bootstrap webpack class seed
│
├── shims/ React/Decky UI shims for GamepadUI environment
│
└── test/ Vitest + Python test suites
 ├── steam/ applyManualOrder, evaluateFilterGroup, smartShelves
 ├── components/ refreshableSmartModes
 ├── core/ reorder, webpackCompat
 ├── domain/ settings, customfilters, shelfOrder, templates, schemas
 ├── qa/ qam-visibility
 ├── stubs/ host-api / host-ui / host-manifest stubs (vitest aliases)
 ├── steam.test.ts
 ├── scrollUtils.test.ts
 └── test_main.py Python sanitizer tests (pytest)

main.py Python entry: DEFAULT_SETTINGS, _SSL_CTX, Plugin class
 (lifecycle + RPC). Re-exports helpers from below.
src/backend/ Every sibling module main.py imports (paths, storage,
 sanitizer, launchers, css_themes, display_state,
 hardware_info, host_os, library_location,
 peripherals, perf_probe, plugin_host). Kept out of the plugin root — which
 Decky requires main.py itself to stay at — via a
 sys.path splice at the top of main.py.
src/backend/paths.py _steam_install_candidates, _normalize_path
 (path discovery + home-confined validation)
src/backend/storage.py _settings_dir, _primary_file, _safe_read_json
 (settings.json read helpers, env-var aware)
src/backend/sanitizer.py _sanitize_settings (settings-shape normaliser,
 mirrors the Zod schemas in src/types.ts)
src/backend/launchers.py External launcher discovery probe :
 EmuDeck / RetroDECK / Heroic / Lutris / Moonlight /
 Chiaki. stdlib-only (configparser, sqlite3, json),
 every helper degrades to [] on missing dir / parse
 error. Exposed via Plugin RPCs
 list_available_launchers + list_launcher_games.
plugin.json Plugin manifest
```

## Data Flow

```
Settings (backend JSON) → settingsStore ─┬→ controller → QAM / Settings pages
                                         └→ HomeInject → ShelvesContainer → Shelf → DeckRow → GameCard
homePatch: mount point + bridge component (or fallback root) → HomeInject
```

1. **Settings** are persisted by the Python backend (`main.py` → atomic write via `src/backend/paths.py` + `src/backend/storage.py`; shape-checked through `src/backend/sanitizer.py` on every read AND write) and cached in `localStorage`
2. **`settingsStore`** manages the cache, backend RPC calls, and subscriber notifications; the UI renders from the cache first and adopts the backend copy only when no edit raced it
3. **`controller`** (React hook) provides actions and state to the QAM and Settings components; `HomeInject` subscribes to the store directly
4. **`homePatch`** creates the `#deck-shelves-home-root` mount next to the native recents row and registers a bridge component through the host's global-component store (four strategies, tried in order). When the bridge does not fill the Home, a React root is created directly in the mount after a grace window (`homePatchFallbackGate.ts`); a claim stamp keeps the two from both rendering
5. **`HomeInject`** renders the shelves (plus search, side nav and screensaver) and portals them into the mount
6. **`Shelf`** resolves app IDs for each shelf source (collection, tab, filter, online, composite, smart)
7. **`DeckRow`** renders the horizontal card row with scroll management

> **Note:** `HomeShelves` runs in `SharedJSContext`, but the portal is mounted into the Big Picture document. Any DOM query (e.g. `querySelector`) must use `getPreferredSteamDocument()` — querying `document` directly will target the wrong context and silently return nothing.

## Key Systems

### Native Class Map (`webpackCompat.ts` + `runtime/classmap.json`)
Steam's GamepadUI uses webpack-hashed CSS classes that change on updates. The plugin ships a class map (semantic name → current hash) in `runtime/classmap.json`; `runtime/embeddedClassMap.ts` seeds it at boot into `window.__DS_CLASS_MAP` and `localStorage` (`ds_class_map`), and `webpackCompat.ts` reads tokens from it. This allows shelf cards to receive native Steam classes for CSS Loader theme compatibility. Selectors fall back to generic `[class*="…"]` patterns and to structural lookups. The map is refreshed from a device with the class-map tool when Steam changes (see [webpack-classmap.md](./webpack-classmap.md)).

> **Caution:** class tokens are tied to specific SteamOS builds. A Steam update can rename them silently. Never cache tokens in plugin settings or hardcode them in application logic without a fallback.

### Navigation Integration (`home/navPatches/`)
The plugin integrates with Steam's `FocusNavController` gamepad navigation system:
- Reparents shelf nav tree nodes into the correct position
- Patches `BTryInternalNavigation` to prevent horizontal focus escape
- Intercepts the Options button to show the native game context menu

> **Caution:** `home/navPatches/` (one concern per file; `focusNav.ts` holds the shared lookups) is the most fragile part of the codebase. It monkey-patches `FocusNavController` on a single shared prototype. Any error here can break gamepad navigation across the entire Steam UI. Changes must be minimal and always preserve the stability guard that re-runs the reparent on remount.

### Per-shelf hero (`shelf/PerShelfHero.tsx`)
Each shelf with hero art enabled renders its own hero: two stacked image slots cross-fade on focus changes (a 30 ms debounce coalesces fast D-pad moves), and the slow zoom pauses after 60 s without input. The hero replicates the exact native SteamOS "Recent Games" hero structure, discovered via Chrome DevTools Protocol (CDP) inspection on SteamOS 3.8:

| Layer | Native Role | Implementation |
|-------|-------------|----------------|
| `IMG` | Hero art with `grayscale(1) contrast(1)`, 0.3s fade-in animation | Applies discovered or fallback filter + animation |
| Zoom container | 25s slow zoom (`ease 0s 1 alternate`) | Discovered animation or `@keyframes ds-hero-zoom` fallback |
| Mask wrapper 1 | `mask-image: radial-gradient(75% 83% at 50% 18%,...)` | Applied via inline style with webkit prefix |
| Mask wrapper 2 | Same radial-gradient mask (double masking for stronger fade) | Second nested div with identical mask |

The native hero does **not** use linear gradients or pseudo-elements for the bottom fade. The vignette effect is entirely achieved via radial-gradient `mask-image` on two wrapper divs, creating a soft oval reveal centered at 50% 18% (upper center).

At runtime, the component discovers native classes from the recents section's sibling element and applies them for CSS Loader theme compatibility.

### Performance Strategy
- `MutationObserver` replaces polling where possible (HomeInject, ShelvesContainer, navPatches)
- Single global timer for `ensureStyles()` shared by all shelf rows
- Focus restore uses MutationObserver with 500ms→2s polling fallback
- `logInfo()` prints only in development builds (`__DEV__` flag) or when verbose logging is on
- Collection cache uses 60s TTL; smart-shelf resolver cache TTL defaults to 60 min (per-shelf override via `refreshIntervalMinutes`)
- Native dimension changes require 4px tolerance + 2-cycle confirmation
- `Shelf` is `memo`ized + carries a generation-id token on each `resolveShelfAppIds` call; in-flight resolves drop their `then`/`catch` if a newer one started, so a slow previous resolve cannot overwrite a newer result
- nav-tree reparent poll throttled from 750 ms → 3000 ms (relies on MutationObservers + focusin for fast paths)

> **Note:** the API surface is `window.deckShelves.api` (major version **4**) — registries (`registerShelfSource` / `registerSmartShelfSource` / `registerFilterType` / `registerSortOption` / `registerImportType` / `registerSavedFilter` and the provider registries) and the consumer-side accessors (`getShelves`, `getSmartShelves`, `getSavedFilters`, `subscribeShelves` and the other `subscribe*` methods) are all live against the settings store. See [`plugin-api.md`](./plugin-api.md).

### Recents Replace (`recentsReplace.tsx`)
Experimental feature (`recentsReplaceSource` setting, gated behind `hideRecents`). Instead of visually hiding the native "Recently Played" section, it patches the section's render output via `routerHook.addPatch("/library/home",...)` + nested `afterPatch` calls to replace the `games` prop with the first visible shelf's app IDs. The native DOM, CSS, animations, hero background, and focus callbacks are preserved entirely. Safety mechanisms:
- App IDs are filtered by `app_type` (1 = Game, 2 = Application) before injection — shortcuts, DLC, and music entries crash Steam's `userCollections` getter.
- A global `error`/`unhandledrejection` trap detects `userCollections`-class errors and auto-disables the experiment.
- On failure, `isRecentsReplaceInjecting()` returns `false` and `HomeInject` falls back to the standard visual-hide behaviour. The QAM shows a `RecentsReplaceErrorBanner`.

### Hide Home Tabs (`hideHomeTabs`)
When enabled, hides the native Novidades/Amigos/Recomendados tab bar. Detection uses `[role="tablist"]` as a sibling of the plugin's mount element — no hardcoded class names, compatible with SteamOS updates.

> **Note:** the hero does **not** use linear gradients or pseudo-elements for the bottom vignette. The fade is achieved entirely via `mask-image: radial-gradient(...)` on two nested wrapper divs — matching the native structure discovered via CDP. Replacing it with a CSS gradient would break CSS Loader theme compatibility.

### Plugin API (`pluginApi.ts`)
External plugins can register custom shelf sources, filter types, sort options, smart-shelf modes, import formats, statistics/recommendation providers, runtime translations, and pre-baked saved filters at runtime. `pluginApi.ts` is the authoritative runtime that exposes `window.deckShelves`; the canonical types live in the `@deck-shelves/api` package (`api/src/types.ts`), which it imports for leaf types and re-declares the interface against — keep both in sync. Everything first-party (the built-in statistics providers, v3 filters/sorts/sources, …) registers through the **same** registries third-party plugins use. The full API is documented in [`plugin-api.md`](./plugin-api.md). Quick example:
```ts
const cleanup = window.deckShelves.api.registerShelfSource({
 id: "my-plugin-source",
 displayName: "My Custom Source",
 resolve: async (limit) => [appid1, appid2,...],
});
```

### Statistics (`domain/statistics.ts` + `steam/statistics.ts`)
Pure aggregation in `domain/statistics.ts` (`computeLibraryStatistics`, `computeShelfStatistics`, `summarizeHistory`, `deriveSuggestions`) — no Steam APIs, no side-effects. The adapter in `steam/statistics.ts` gathers real data (`getAllAppOverviews`, settings) and exposes two built-in `StatisticsProviderDescriptor`s registered through the plugin API. The Settings → Statistics tab consumes the registry, rendering one area per provider; "over time" averages come from a per-day localStorage snapshot (no timer/polling).

### i18n (`i18n.ts`)
Locales are sliced into `i18n/<locale>/<area>.json` (home / qam / about / settings / integrations / common / setup). The loader merges every area file per locale via `import.meta.glob` — `en-US` eager, others lazy. External integrations add strings at runtime through `api.registerTranslations(locale, dict)`. `validate.mjs` enforces per-locale key-set parity + no cross-area collisions.

### Theme compatibility (`src/themes`)
One adapter per supported look, under `themes/adapters/` (Switch Like Home, Centered Home, Obsidian, Focus Highlight Color's round patch, TiltedHome, ArtHero, No Hero Gradient, Hero Fullscreen, native Big Art, Gray Uninstalled, Clean Library Capsule, No Home Text). A `ThemeAdapter` (`themes/types.ts`) bundles everything a theme needs: `id` / `label` (diagnostics), `scope` (`root` adapters read the injected theme styles and stamp `.deck-shelves-root`; `document` adapters read computed variables and stamp `<html>`), the `data-ds-*` `flags` it owns (plus optional `<html>` mirrors and all-roots stamping), `read()` (detect → flag values), optional `vars()` (CSS custom properties on `<html>`) and optional `css(ctx)` (the rules that mirror the theme on the shelves). `themes/registry.ts` holds the ordered list and is the only place that iterates it: `applyRootThemeFlags` / `clearRootThemeFlags` (called from `HomeInject` on every Steam `<head>` mutation and on unmount), `applyDocumentThemeFlags` (called from the `shelfStyles` poll), `themeStylesheet(ctx)` (appended to the shelf stylesheet, in registry order) and `activeThemeLabels()` (diagnostics / bug reports). Adding a theme = one adapter file + one registry entry. Shared detection primitives (injected style text, token matching against live class names, the theme names read from disk) live in `themes/detect.ts`; `core/cssLoaderDetect.ts` re-exports the same names so older call sites keep working.
- `isCssLoaderActive()` / `isArtHeroActive()` read `<style class="css-loader-style">` tags in the active document.
- `getNativeRecentsClassName(mountEl)` reads the live native-recents wrapper class from `mountEl.previousElementSibling` — never hardcoded.
- When `hideRecents=true` and a CSS Loader theme is active, `HomeInject` adds `data-ds-recents-slot="true"` plus the live wrapper class to the first DS shelf — additively (existing `ds-*` classes are preserved). Invariants enforced by the guard chain are documented inline in `HomeInject.tsx`.
- ArtHero label overlay (in `PerShelfHero.tsx`, while `HomeInject` marks the root with `data-ds-hero-label`) clones the focused card's `.ds-card-label` as a `position: fixed` overlay above the row; tracks the focused card horizontally on row scroll; reactive to runtime CSS Loader toggles via `MutationObserver` on the Big Picture document's `<head>`.
- TiltedHome compat applies `skew(var(--ren-tilt-angle))` to the entire `.ds-card` (image + label + glow + MoreCard + RefreshCard). Focus state composes `skew + scale + translateZ` with `!important` to win over Steam's higher-specificity `.BasicUI.NATIVE.Focusable:focus { transform: translateZ(15px) }` rule. The selector intentionally omits `.gpfocuswithin` (Steam applies that to every card when any descendant of the row has focus — including it would scale every card and erase the focus indicator).

### Refresh card on shelves (`shelf/RefreshCard.tsx` + `shelf/types.ts > REFRESHABLE_SMART_MODES`)
Smart shelves whose result can change between two clicks (`random_pick` / `time_of_day` / `spare_time` / `recently_played`) get a Refresh card instead of the "view more in library" tile. Non-smart shelves with `sort === "random"` also get the Refresh card (it's the only non-smart case whose order can change between clicks; clicking clears the `ds-random-*` localStorage cache and re-resolves only that shelf). Spin animation is driven by a CSS keyframe via DOM class toggle (`.ds-refresh-spinning` on `iconRef`) — not React state, so `setAppIds()` reconciliation cannot cancel the animation mid-flight. Per-shelf `hideRefreshCard` and global `globalHideRefreshCard` suppress the trailing refresh card without changing recompute / cache cadence; `hideSeeMore` / `globalHideSeeMore` mirror the same per-shelf vs. global pair for the trailing "See more" card.

### Filter system (`steam/index.ts > evaluateFilterGroup` + `components/filter/`)

Filter groups are AND/OR predicates evaluated against a single source pool — never list-unions. The full library flows through `evaluateFilterGroup` once and each app is tested against every item independently. `merge` is a special filter type that wraps a nested predicate group with its own `mode: "and" | "or"` plus a sub-`items` array — useful for composing OR-of-predicates inside an outer AND group (e.g. `merge { or, [installed, nonSteam] }` to surface "Steam installed OR any non-Steam app" in one shelf). Sub-filters are edited via the recursive `MergeFilterOptions` component which renders a `<FilterPanel>` for the children; saved filters can be applied at any merge level.

`genres`, `categories`, `multiplayerType`, `franchise` and `vrSupport` (`steam/v3Extensions.ts`) read `rawField`, which checks a **locally-owned game's real `AppOverview` first, per field, then falls back to fetched data** — never per-object, since an owned game's overview exists but never carries genre/franchise data and only carries categories as numeric ids (`BHasStoreCategory(id)`, not name strings). `multiplayerType` and `vrSupport` have a fast local path for owned games and only need the fetch for ids the client has never seen; `genres`/`categories` (via `onlineStore.ts`'s `getCatalogMetaMap`, Store `appdetails`, one appid per request — batched requests 400 for this filter set even though `price_overview` batches fine) and `franchise` (via `SteamClient.Apps.GetCachedAppDetails`'s `associations.rgFranchises`, the only source for franchise at all) need it for *every* game, owned or not — so these three are gated behind Online Features in the picker (`isOnlineFeatureFilterType`, distinct from `isOnlineFilterType`'s source-type gate for `discount`/`priceRange`) rather than by source type, since they're meaningful on a plain library shelf. `prefetchCatalogFilterData` (+ `collectFilterGroupItemsFlat` for the tree-walking cases) warms both caches before evaluation in every filter-group resolution path: the plain library filter, a collection's own child filter, a Smart Shelf's filter group, and a composite child's `childFilter`.

Asc/desc inversion is a separate boolean (`Shelf.sortReverse` / `SmartShelf.sortReverse`, plus `manualBaseSortReverse` for the manual case) toggled by a 40×40 icon button next to the sort dropdown in `EditShelfModal` / `EditSmartShelfModal`. The flag flows through `resolveShelfAppIds(source, limit, sort, shelfId, sortReverse)` to `applySortToIds`, which reverses the result post-sort. Skipped for `manual` (would invalidate user order) and `random` (re-reversing a shuffle adds no signal). When no explicit sort is persisted but reverse is on, `Shelf.tsx` substitutes `"alphabetical"` as the resolver sort so the reverse has somewhere to apply. The `"alphabetical"` branch in `applySortToIds` is **explicit** — without it, the internal sort registry's noop pass-through descriptor would intercept and skip sorting.

Native Steam library tabs (`installed`, `great_on_deck`) post-filter the candidate set to `app_type === 1` (game) or `undefined` (unknown — allowed through) AND exclude non-Steam shortcuts, matching the native SteamOS Installed tab. Applied in both the TabMaster path (`getCustomFiltersAppsForContainer`) and the store-API path (`getTabAppIdsFromStore`); other tab ids are untouched.

### Composite source (`steam/index.ts > _resolveComposite`)

Composite shelves declare `{ type: "composite", combine, sources: ShelfSource[] }`. Each child source is resolved through the same `resolveShelfAppIds` entry-point — depth-counted to a `MAX_COMPOSITE_DEPTH` ceiling — and the result sets are merged either as a union (round-robin pick, keeps every child represented when the overshoot truncates) or as an intersection (set membership). Children run in parallel via `Promise.all`; each child is wrapped in a 15 s `Promise.race` so a single hung online source (e.g. a slow `get_wishlist` RPC) can't park the parent resolve indefinitely. The wishlist and store helpers (`core/onlineStore.ts`) also wrap their Decky RPC calls in `rpcWithTimeout` and fall back to stale-but-readable cache when the backend stalls, so the resolver always returns within a bounded budget.

### Asset cache busting (`core/assetRevision.ts` + `core/steamAssets.ts`)

User-replaced custom artwork (capsule, logo, hero, icon) lives at static `/customimages/<appid>.*` URLs that the browser caches by path. Without a buster, replacing the file off-screen leaves the old bitmap in the row when the user returns. `assetRevision` is a single counter `HomeInject` bumps on every popstate / pushState back to home; `getAppAssetCacheKey(appid)` returns that revision so memo dep arrays for `getLogoUrls` / `getIconUrls` / `getPortraitUrls` / `getLandscapeUrls` re-derive whenever the user comes back. Custom-image URLs append `?c=<revision>` so the browser fetches the fresh file. Steam-native loopback URLs keep their `?c=<local_cache_version>` buster from `appStore` — those are orthogonal and stable.

### Settings save pipeline (`store/settingsStore.ts` + `main.py > _save_pipeline`)

Concurrent `saveSettings` calls coalesce: a save in flight latches the next payload into `pendingSave`, every caller waits for the same RPC outcome. The Python `set_settings` runs the whole sanitize + read + compare-and-skip + write under `asyncio.to_thread` so the asyncio event loop keeps draining other RPCs while the disk write fsyncs. The frontend tracks `lastSaveSucceeded` in `localStorage` so a failed save survives plugin reload — on next boot the cache stays as source of truth and the next user interaction retries the write. `refreshSettings` captures a `refreshAnchor` snapshot before the background `get_settings` so an in-flight user edit can't be silently reverted by a stale backend response.

### Sidecar lifecycle (`components/qam/qamExpandedStore.ts` + `DeckQAMSettings.tsx`)

QAM-expanded state is per-session: a module value mirrored in `sessionStorage`, and the `DeckQAMSettings` mount effect calls `resetQamExpanded()` (only on the visible tab instance, `isActiveTab`) to wipe even the persisted flag every time the plugin tab mounts. While the sidecar is expanded, a 300 ms poll collapses it when `m_MenuStore.m_eOpenSideMenu` changes relative to the value captured at expand, or when a tick gap over 1.5 s while the document is not visible shows a resume from background. `document.hasFocus()` is not used: the QAM document never holds DOM focus, so it collapsed the sidecar within about 300 ms. Browser-lifecycle listeners add coverage: `visibilitychange` (hidden only), `pagehide` and `freeze` collapse; `focus` and `resume` collapse only while the document is hidden. `SidecarPanel` itself bails (`return null`) when `controller.settings` is unhydrated so a freshly-remounted tab never renders the "open but empty body" bug-state.

### Own QAM tab under Decky alone (`runtime/ownQamTab.ts`)

Opt-in, off by default (`ownQamTabEnabled`). Ports a tab-injection mechanism already validated on-device in a neutral host's own runtime: register a numeric key in Steam's `QuickAccessTab` enum, then `afterPatch` the `QuickAccessMenuBrowserView` consumer to push a tab object onto its render output's `props.tabs` array — via Decky's own `afterPatch` / `findModuleByExport` / `findInReactTree`, not a hand-rolled webpack walk. A localStorage breaker mirrors that same safeguard (two unconfirmed arms trip it and it refuses to re-patch for 24 h). Retracts whenever a neutral host's own tab has actually been inserted (the host stamps `window.__SHELVES_QAM_OWNER__`, or its tab object carries the host's marker) — never on the mere presence of the `window.__SHELVES_QAM__` bridge. That tab always wins. This mechanism still needs its own on-device validation pass before it's safe to default on.

### Showcase / Dynamic Idle Mode (`runtime/showcaseMode.ts`)

Opt-in, off by default (`showcaseModeEnabled`). During Home inactivity, cycles focus through the user's own shelves on a timer, reusing the exact same focus-a-shelf's-first-card mechanism Side Nav's own "jump to shelf" already ships — never synthetic input. Any real interaction (a controller button via `subscribeControllerInput`, or a pointer/wheel/keydown event) stops it and re-arms the idle timer. Optional in-shelf pan (`showcasePanCards`) walks a few cards per shelf before moving on. Not built yet: a shelf-participation picker UI (the `showcaseShelfIds` setting exists without one). Also exports `isNativeScreensaverActive()` (`ScreensaverPopup`/`BIsActive()` on the active `GamepadNavigationTree`), which both Showcase and the screensaver below use to stand down if Steam's own native screensaver is somehow active.

### Keyboard bindings (`runtime/keyboardBindings.ts`)

Every gamepad binding (card hide/highlight/quick-launch, Quick Search, Side Nav, Sidecar open/close) also has an independent keyboard shortcut slot — either input fires the same action, neither replaces the other. Uses `KeyboardEvent.code` (layout-independent) with the same single/chord/double-tap grammar the gamepad parser already has, including modifier chords. Card-action and nav-search/side-nav keys are captured via the existing Home input bus (already proven for "type to filter"); the QAM sidecar's own open/close keys use a plain `keydown` listener scoped to that window. Ignored while a text field has focus.

### Own idle screensaver (`runtime/screensaverInject.ts`, `runtime/steamSettingsWriter.ts`)

Opt-in, off by default (`screensaverShelvesEnabled`). Replaces Steam's native idle screensaver outright (two injection-into-the-native-one approaches were tried and are confirmed dead ends) with a slideshow of shelf games/Recents and, opt-in, local screenshots. Disables Steam's own idle timeout while active, restoring it exactly on toggle-off, via an internal settings-write path located at runtime by a stable call-site string (not a hardcoded module id) and never trusted without a round-trip verification first.

### Cross-device settings sync (`runtime/cloudSync.ts`)

Opt-in, off by default (`cloudSyncEnabled`). Mirrors settings across devices on the same Steam account via `SteamClient.RoamingStorage` — not real Steam Cloud (`ISteamRemoteStorage` is per-appid; a plugin has none). Local storage stays authoritative; this is a timestamp-LWW third mirror, reconciled once at boot/toggle-on and pushed on a debounce afterward, no polling.

## Home internals

| File | Role |
|---|---|
| `runtime/homePatch.tsx` | Mounts `#deck-shelves-home-root` next to native recents; `HomeBoundary` ErrorBoundary; hide helpers for recents/tabs |
| `runtime/recentsReplace.tsx` | Optional overlay that swaps native recents for a DS shelf (L1→L2→L3 `afterPatch` chain); WeakSet dedup, crash threshold, kill-switch |
| `components/HomeInject.tsx` | React side of the mount; `ShelvesContainer`; first-shelf promotion to recents slot |
| `components/Shelf.tsx` | Per-shelf appId resolve (memoized + generation-id cancel) |
| `components/DeckRow.tsx` | Horizontal row: title + collapse + scroll center on focus |
| `components/shelf/GameCard.tsx` | Game tile (image fallback chain, label, badges, compat) |
| `components/shelf/MoreCard.tsx` | "View more in library" trailing tile (non-smart shelves) |
| `components/shelf/RefreshCard.tsx` | "Refresh" trailing tile for refreshable smart shelves |
| `components/shelf/PerShelfHero.tsx` | Per-shelf two-slot cross-fade hero art; ArtHero label overlay when promoted |
| `components/home/navPatches/reparent.ts` | `reparentNavTreeNodes` — moves DS focus nodes between recents and tabs |
| `components/home/navPatches/menuButton.ts` | MENU button interception → game context menu |
| `components/home/navPatches/edgeNavigation.ts` | L/R throttle + DOWN tilt guard (when home tabs hidden) |
| `components/home/navPatches/verticalBridge.ts` | DOWN/UP bridge between mount and native neighbors |

### Recents replacement pipeline (`recentsReplaceSource = true`)

```
routerHook.addPatch("/library/home", patchFn)
        │
        ▼
   [L1]  afterPatch(props.children, "type")        permanent — wraps the route's child Type
        │  on each render, re-applies L2/L3 (transient per-render Types):
        ▼
   [L2]  afterPatch(ret.type, "type")              home panel — guarded by patchedTypes WeakSet
        │  walks tree → finds recents component:
        ▼
   [L3]  afterPatch(recents.type, "type")          recents component — also WeakSet-guarded
        │
        ▼
   mutateRecentsElement(ret3, shelf, appIds)
        │  • holder.props.games ← appIds
        │  • holder.props.showFeaturedItem ← from shelf highlight toggles
        ▼
   render()                                        native cross-fade preserved (no callback re-entry)

   ─── safety nets ─────────────────────────────────────────────────────────
   patchedTypes: WeakSet<object>                   dedup against memo/forwardRef sharing (3.9+)
   crashCount, CRASH_THRESHOLD = 5 / 10 s          fingerprinted errors → markReplaceFailed()
   markReplaceFailed(reason) → pub/sub             QAM disables toggle + shows banner
   resetRecentsReplaceFailed()                     QAM "reset crash state" — clears WeakSet too
```

### Focus nav tree reparent (`reparentNavTreeNodes`)

```
SteamUIStore.GamepadNavTree
        │
        ▼
   FocusNavController.m_ActiveContext.m_rgGamepadNavigationTrees
        │
        ▼
   tree id = "GamepadUI_Full_Root"
        │
        ▼
   walk(root.m_rgChildren) → find node where Element.className contains "deck-shelves-root"
        │
        ├── found, already under target ─────► return 0    (steady state — no churn)
        ├── found, wrong parent ─────────────► splice into target.m_rgChildren
        │                                       between recents and tabs
        ▼
   guarded by:
     • mount-attached MutationObserver
     • parent MutationObserver
     • 3 s poll fallback (was 750 ms — throttled in 1.6.x)
     • focusin listener
   cleanup on unmount restores original parent ordering
```

### First-shelf promotion

```
hideRecentsSetting = true ?  ── no ──► no promotion, no overlay
        │ yes
        ▼
   firstVisibleId scan:
     iterate shelves[] in CONFIG order (not DOM order)
     any source is eligible (smart and online shelves included)
     pick first with data-shelfid currently in DOM   (skips empty/0-app shelves)
        │
        ▼
   target shelf gets forceExpanded = true  (collapse pin while in slot)
        │
        ▼
   isCssLoaderActive() ?  ── no ──► layout-only promotion (no class injection)
        │ yes
        ▼
   target.setAttribute("data-ds-recents-slot", "true")
   target.classList.add(getNativeRecentsClassName(mountEl))   ← read live from previousElementSibling
                                                                ADDITIVE — never strips ds-* classes
        │
        ▼
   isArtHeroActive() ?  ── no ──► PerShelfHero only (two-slot cross-fade)
        │ yes
        ▼
   HomeInject marks the root with data-ds-hero-label (full-page hero layout)
   AND
   PerShelfHero renders the focused-card label clone as position:fixed overlay
     • cloned from .ds-card-label of the focused tile
     • follows focused card horizontally on row scroll
     • reactive to runtime CSS Loader theme toggles via MutationObserver on Big Picture <head>
```
