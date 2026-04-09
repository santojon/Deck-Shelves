# Architecture

Deck Shelves is a [Decky Loader](https://decky.xyz) plugin that injects custom game shelves into the Steam Deck home screen. This document describes the project structure and how the main systems connect.

## Directory Structure

```
src/
├── index.tsx                  Plugin entry point (Decky lifecycle)
├── types.ts                   Zod schemas: Shelf, Settings, FilterGroup
├── i18n.ts                    i18next initialization (16 locales)
│
├── components/                React UI
│   ├── HomeInject.tsx          Portal renderer for home screen shelves
│   ├── DeckRow.tsx             Shelf row layout (imports shelf/ modules)
│   ├── Shelf.tsx               Single shelf data resolver
│   ├── DeckQAMSettings.tsx     Quick Access Menu settings panel
│   ├── FilterPanel.tsx         Filter group editor UI
│   ├── AboutPage.tsx           About / documentation page
│   ├── Settings.tsx            Settings page wrapper
│   ├── ErrorBoundary.tsx       React error boundary
│   ├── home/
│   │   └── navPatches.ts       Gamepad nav tree reparenting + menu button patches
│   ├── qam/
│   │   └── icons.tsx           Shared SVG icons for QAM
│   ├── shelf/
│   │   ├── types.ts            DeckRowItem type, card dimension constants
│   │   ├── shelfStyles.ts      CSS injection, native dim discovery, global timer
│   │   ├── GameCard.tsx         Game card with native class injection
│   │   ├── MoreCard.tsx         "View more" link card
│   │   ├── PlaceholderCard.tsx  Fallback card (no art available)
│   │   └── HeroBackground.tsx   Hero background art (when recents hidden)
│   └── styles/
│       ├── DeckModalStyles.tsx  Modal dialog styles
│       └── DeckQAMStyles.tsx    QAM panel styles
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
│   ├── webpackCompat.ts        Runtime class discovery (webpack hashed classes)
│   ├── pluginApi.ts            Public inter-plugin API
│   └── perf.ts                 Performance marks/measures
│
├── domain/
│   ├── settings.ts             Pure settings operations (patch, add, delete, move)
│   ├── defaults.ts             Default shelf/settings/filter factories
│   ├── templates.ts            Shelf preset templates
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
└── test/                      Vitest test suites
    ├── steam.test.ts
    ├── domain/settings.test.ts
    ├── domain/customfilters.test.ts
    ├── core/webpackCompat.test.ts
    └── scrollUtils.test.ts

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

## Key Systems

### Native Class Discovery (`webpackCompat.ts`)
Steam's GamepadUI uses webpack-hashed CSS classes that change on updates. The plugin discovers these at runtime by inspecting the DOM and stores them in `window.__DS_CLASS_MAP__`. This allows shelf cards to receive native Steam classes for CSS Loader theme compatibility.

### Navigation Integration (`home/navPatches.ts`)
The plugin integrates with Steam's `FocusNavController` gamepad navigation system:
- Reparents shelf nav tree nodes into the correct position
- Patches `BTryInternalNavigation` to prevent horizontal focus escape
- Intercepts the Options button to show the native game context menu

### Performance Strategy
- `MutationObserver` replaces polling where possible (HomeInject, ShelvesContainer)
- Single global timer for `ensureStyles()` shared by all shelf rows
- Focus restore uses MutationObserver with 500ms→2s polling fallback
- `logInfo()` is a no-op in production builds (`__DEV__` flag)
- Collection cache uses 60s TTL
- Native dimension changes require 4px tolerance + 2-cycle confirmation

### Plugin API (`pluginApi.ts`)
External plugins can register custom shelf sources:
```ts
const cleanup = window.__DECK_SHELVES_API__.registerShelfSource({
  id: "my-plugin-source",
  displayName: "My Custom Source",
  resolve: async (limit) => [appid1, appid2, ...],
});
```
