# Changelog

All notable changes to Deck Shelves will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `[FEATURE]` Smart Shelves: new shelf type whose content is generated automatically by library heuristics — appears on the home screen only when the heuristic returns results, disappears otherwise (no CSS hiding, uses the natural `null` render path). Toggle `smartShelvesEnabled` in the QAM enables a separate Smart Shelves section with its own template picker and reorderable list.
- **Roulette** smart shelf template (`random_pick`): selects games randomly from the full library — result is memoized for 5 minutes, then reshuffles. Always visible when the library is non-empty.
- **Surprise Me** sub-toggle under Smart Shelves: hides the manual shelf list and banner entirely; the system picks 1–5 smart templates each day using a deterministic daily seed. A slider (0–5) sets the exact count; 0 means the system decides (cycles 2, 3, or 4 per day). `smartSurpriseMe` and `smartSurpriseMeCount` added to `SettingsSchema`, `_sanitize_settings`, and `DEFAULT_SETTINGS`.
- Twelve smart shelf templates: **Daily Pick** (deterministic daily rotation), **Deck Picks** (Deck Verified library), **On Deck** (installed + Deck compat, sort by recently played), **Recently Played** (last 30 days), **Long Sessions** (installed + >3 h playtime), **Not Started** (zero playtime, never launched), **Best Unplayed** (installed, never played), **Quick Play** (installed + Deck compat + <2 h), **Interrupted** (30 min–3 h), **Non-Steam** (non-Steam shortcuts and emulators), **Time of Day** (rotates by hour), and **Rediscover** (last played >6 months, >1 h, Deck compat). Ordered by probability of returning results in the picker.
- `SmartShelf` / `SmartShelfMode` Zod types and `smartShelvesEnabled` / `smartShelvesAtBottom` / `smartShelves` fields in `SettingsSchema` — all optional with defaults, backwards compatible with existing settings.
- `smartShelvesAtBottom` toggle (sub-toggle under the main switch) moves smart shelves below normal shelves. When `hideRecents` is active and the toggle is off, smart shelves are inserted after the first normal shelf (which occupies the native recents slot).
- Smart shelf controls: hide/show, move up/move down, and delete — via the ⋯ context menu (same pattern as normal shelves). Smart shelves are not editable by design.
- Smart shelf list uses `ShelfListLabel` (eye icon + title), matching the normal shelf list appearance.
- Heuristic results memoized per `(mode, limit)` with a 5-minute TTL — avoids re-running on every home render cycle.
- `smartShelvesEnabled`, `smartShelvesAtBottom`, and `smartShelves` preserved by `_sanitize_settings` in the Python backend and round-trip correctly through import/export.
- Two new standard shelf templates: **Non-Steam / Emulators** (filter: `nonSteam: true`, sort recent) and **Long Sessions** (filter: `installed + >3 h playtime`, sort playtime).
- Template pickers (standard and smart shelves) redesigned as a 2-column button grid where the button text is the template name. Standard picker shows **Start blank** first — opens the edit modal immediately.
- `[DOCS]` `docs/smart-shelves.md`: full reference for all 12 templates; reliability table re-ordered highest first.
- `[DOCS]` `docs/shelf-templates.md`: reference for all 8 standard templates; note about picker layout.
- `[I18N]` All smart shelf and template i18n keys fully translated across all 16 supported locales.
- In-plugin documentation (About → Shelves) updated with Smart Shelves section listing all 12 templates with descriptions, fully translated.

## [1.3.1] - 2026-04-17

### Added

- `[PERF]` SVG icons in `GameCard` moved to module-level constants — eliminates 7 JSX object allocations per card render.
- `[PERF]` `rowItems` array in `ShelfView` wrapped in `useMemo` (deps: `appIds`, `items`, shelf identity) — avoids `flatMap` on every re-render unrelated to data changes.
- `[PERF]` `sortOptions` in `EditShelfModal` wrapped in `useMemo`; `BASE_SOURCE_TYPES` extracted to module-level constant.

### Changed

- `[DOCS]` `docs/architecture.md`: added `recentsReplace.tsx` to the runtime/ directory listing; added Key Systems entries for Recents Replace and Hide Home Tabs.
- `[DOCS]` `docs/filters.md`: corrected type names (`storeTag`, `achievements`, `friends`); added missing types (`isNew`, `playtimeRange`, `collection`); noted pass-through types not yet evaluated; fixed `playtimeRange` params (`minHours`/`maxHours`).
- `[DOCS]` `README.md`: added "Use first shelf as recents (experimental)" and "Hide home tabs" to the features list.
- `[DOCS]` `src/core/webpackCompat.ts`: added JSDoc to the four public functions (`findWebpackHashedClass`, `buildSelectorFromToken`, `getRuntimeClassMap`, `setRuntimeClassMap`).

### Fixed

- `[FIX]` `recentsReplace`: silent patch failures (tree walk not finding the recents node, or `mutateRecentsElement` returning false) no longer leave the feature in a permanently broken state. After 5 consecutive silent failures the kill-switch is activated, causing `HomeInject` to fall back to the standard visual-hide behaviour. The counter resets on any successful mutation and on manual reset.

## [1.3.0] - 2026-04-16

### Added

- `[FEATURE]` Experimental `Use first shelf as recents (experimental)` toggle — when `Hide recent games` is active, the first visible shelf's games are injected into the native recents component (patch-of-render via `routerHook.addPatch` + `afterPatch` + `findInReactTree`). Reuses 100% of the native DOM/CSS/animations (hero zoom, focus ring, CSS Loader theme support). Full i18n across all 16 locales.
- Runtime kill switch for the experiment: filters appids by Steam `app_type` (Game/Application) before injection, detects tree-walk failures and `userCollections`-class errors via a global error trap, and auto-disables the feature with a `RecentsReplaceErrorBanner` in the QAM. Fallback to the existing visual-hide behaviour is automatic.
- `[QA]` `qa:all-shelves-hide-home-tabs` / `qa:all-shelves-show-home-tabs` scripts mirror the recents-hide harness for the home tabs toggle.
- `Hide home tabs` toggle hides the native novidades/amigos/recomendados area (detected via `[role="tablist"]` sibling of the mount, no hardcoded classes). Independent of `Hide recent games`.
- Webpack discovery expanded with `heroRoot`, `heroInner`, `shelfSection`, `scrollGrid` tokens, populated both via runtime discovery and from the embedded `classmap.json` seed.
- Destructive `Reset all` screenshot captured by the automation and validated alongside the other home/QAM captures.

### Changed

- `[REFACTOR]` PR title tag → version bump mapping: `[FEATURE]` is now minor (was major), `[REFACTOR]` is now major (was minor), `[CLEANUP]` stays minor.
- `[PERF]` Shelf-to-shelf centring: switched to direct `scrollTo` math on the resolved scrollable ancestor and coalesced to one smooth scroll per focus event, with a 300 ms verification retry for recently-expanded shelves. Eliminates the stutter caused by competing `scrollIntoView({ block: "center" })` calls.
- Screenshot automation opens the Steam main menu and activates its first item (home) before capturing, waits 6 s for overlays to settle, and scrolls via JS (`scrollTop = ...`) instead of mouse-wheel events to avoid triggering card hover overlays in `home` / `home-shelves`. English-locale switching removed (it never worked reliably and is discontinued).
- Reddit release post: replaced the full changelog dump with a condensed, 3-section summary (top bullets per Added/Changed/Fixed) plus a Discord invite link.
- Card focus ring honours the theme accent colour via `box-shadow: ..., 0 0 0 2px var(--custom-sp-color-border, transparent)` — transparent fallback means no regression on themes that don't set the variable.
- `.ds-card::after` overrides relaxed (removed `animation: none`, `background-image: none`, `transition: none` on the default state) so native focus animations painted by the injected `WYgDg9NyCcMIVuMyZ_NBC` classes flow through — notable improvement under ArtHero and similar themes.
- First-shelf "locked" heading (used when `Hide recent games` is on) now mirrors the native recents heading typography: 16 px / 400 weight / no bottom margin. Size/colour still follow the detected `--ds-native-heading-color`.
- `HeroBackground` wrapper resized to match the native recents hero (top: −1, height: 374, bottom 5 px linear-gradient mask) — aligns with the native layout under ArtHero.

### Fixed

- `collectionStore.userCollections` access in `listCollections` is now try/catch'd per host window. The MobX computed getter can throw `Cannot read properties of undefined (reading 'values')` when the store isn't fully initialised; the error no longer escapes into the Decky ErrorBoundary.
- Compat checks: 4 false positives eliminated (Colored Compatibility Icons, QAM Hide Tabs, Non-Steam Badges, TabMaster). The scripts now exclude our own toggle field names, the QA harness directory, and imports from `src/integrations/`.
- Screenshot capture no longer leaves the home in an overlay/focus state — native recents cards were picking up `:hover` from the mouse-wheel cursor position.
- Duplicate first shelf when the replace-source experiment is actively injecting — DS mount now slices off the first shelf only while the injection is live (not while failing or kicking in). Restores it automatically on fallback.
- Hero background no longer renders on the shelf that used to be first when replace-source is active (would have produced two heroes stacked).
- First-shelf collapse state cleared when `forceExpanded` flips on, so disabling replace-source after collapsing doesn't leave the row stuck closed.

## [1.2.5] - 2026-04-16

### Added

- `Hide "new" badge` toggle (per-shelf + global) suppresses the green "NEW" badge rendered on cards for recently added games (within the last 14 days, derived from the app's `user_added_ts`).
- `Hide compatibility icons` toggle (per-shelf + global) suppresses the Deck-compat overlay (verified / playable / unsupported) on cards.
- Toggle `Hide non-Steam launcher badge` (only shown when *Hide compatibility icons* is on **and** the NonSteamBadges plugin is installed) extends suppression to non-Steam apps.
- "New game" detection: cards display a `NEW` badge for games added to the library within the last 14 days. Honors the per-shelf and global *Hide "new" badge* toggles.
- New `isNew` filter item type — matches games added within the last 14 days (same window as the badge). Available as a standalone filter entry in shelf builders, independent from UI toggles. Docs page updated; i18n keys added across all 16 locales.
- `[QA]` Dev-only QA harness with three `pnpm` scripts (`qa:first-run`, `qa:qam-error`, `qa:shelf-error`) that build the plugin with a single dev-gated flag each (`DS_QA_FORCE_FIRST_RUN` / `DS_QA_FORCE_QAM_ERROR` / `DS_QA_FORCE_SHELF_ERROR`). Flags are compiled to `false` in release builds, so the hooks can never leak to users. Used to validate the FirstRunBanner, the QAM `ErrorBoundary`, and the homePatch shelf-render fallback.
- `[QA]` Two additional QA scripts that inject a fixed 6-shelf fixture covering every shelf source type — `filter updatePending`, `filter sort: recent`, `tab: installed`, `collection: favorite`, `filter installed + sort: metacritic`, and `filter group (developer: FromSoftware) + sort: release_date`: `qa:all-shelves-hide-recents` (forces `hideRecents = true`) and `qa:all-shelves-show-recents` (forces `hideRecents = false`). Implemented via `applyQASettingsOverride` in the settings store; `saveSettings` is a no-op while the flag is active, so edits during QA cannot contaminate persisted state. Same dev-only gating as the other QA flags.
- `[PERF]` and `[QA]` PR title tags now trigger an automatic patch version bump in the release workflow (same behaviour as `[FIX]` / `[ENHANCEMENT]`). Surfaced in the PR template, `CONTRIBUTING.md` tag table, and `.github/workflows/bump.yml`.
- PR template reorganized: label checkboxes grouped so each group contains tags with the same bump effect (without naming the scope in the UI).
- Shelf-render crash protection in `homePatch`: a React `ErrorBoundary` wraps `HomeShelves` across all mount paths (DOM bridge, `createRoot`, legacy `ReactDOM.render`). If any shelf throws during render, the home mount is cleared and hidden instead of bubbling up and breaking the SteamOS home. Crash state is broadcast via a pub/sub so the QAM reacts in real time.
- QAM `MountCrashBanner` below the master toggle explaining why shelves are hidden, with a "reset crash state" button; banner appears only while a shelf-render crash is active.
- Full-width "Reset all" button at the bottom of the QAM that opens a destructive `ConfirmModal`. On confirm, wipes all shelves + settings and clears plugin-owned `localStorage` keys (`ds-`, `ds_`, `deck-shelves-` prefixes), leaving the plugin in first-run state. Full i18n coverage across all 16 locales.

### Changed

- When a shelf-render crash is active, QAM toggles stay visible but become `disabled` (grayed, non-interactive) instead of being hidden — keeps the UI layout stable and signals the inactive state.
- `[PERF]` Home mount-detection fallback intervals reduced from 10s → 2s in [HomeInject.tsx](src/components/HomeInject.tsx) and [homePatch.tsx](src/runtime/homePatch.tsx). Covers SteamOS SPA navigation (e.g. library → home) that does not fire `popstate`/`hashchange` — shelves now appear within ~2s instead of up to ~10s when the MutationObserver misses the route change.
- When "Hide recents" is active, the first visible shelf is forced expanded (localStorage state is preserved) and its title-click collapse is disabled — ensures a focusable first row is always present since recents is hidden.

### Fixed

- `sort: added` no longer mirrors native recents — reverted to `rt_purchased_time` / `user_added_ts` / `rt_store_asset_mtime` precedence so "adicionados recentemente" reflects acquisition order, not play activity.
- Shelf focus lost after collapse/expand — `toggleCollapse` now uses the Steam nav tree via `focusElement` (with rAF retry) so the gamepad focus node is updated, surviving route transitions to recents/novidades and back.
- D-pad UP/DOWN skipping shelves (landing on recents/novidades instead) — root cause was a `deck-shelves-layout-changed` dispatch storm on every collapse/expand retry causing repeated `reparentNavTreeNodes` churn. Removed the dispatch; the existing MutationObserver on the mount already covers layout changes.
- Focus hijacked on unrelated shelves when collapsing — `toggleCollapse` now only restores focus if `.gpfocus`/`:focus` is inside the shelf being toggled. Clicking a distant title no longer steals focus from the currently-focused shelf.
- Featured card not picking native size on cold boot — `loadPersistedDims` now ignores viewport fingerprint (card dims are intrinsic to Steam's design, viewport-invariant). CDP showed the cache was written with `vw:1,vh:1` during an early pre-layout tick and rejected every boot. Also guard `persistDims` so it no longer writes when vw/vh < 100.
- Focus completely lost from shelves after multiple collapses — `reparentNavTreeNodes` was re-running on every MutationObserver callback and repeatedly splicing nav nodes across parents, which could orphan the currently-focused node during concurrent Steam remounts. Added a stability guard (`lastReparentTarget`): when our nodes are already parented under the last known-good vertical container and the container still has ≥2 children, the splice is skipped. Also skip when focus is currently inside our subtree, to avoid perturbing the tree mid-navigation.

## [1.2.4] - 2026-04-14

### Changed

- `[PERF]` Focus restoration MutationObserver scoped from `document.body` to `.deck-shelves-root` — fewer mutation callbacks during idle and user navigation
- `[PERF]` Recents validation effect made reactive to `shelves` / `hideRecentsSetting` deps instead of polling every 5s — zero idle work when nothing changes
- `[PERF]` Removed 10s fallback `setInterval(applyPatches)` in HomeInject — redundant with the MutationObserver + popstate/hashchange listeners already wired
- "Show background art" toggle is now hidden when "Hide recent games" is inactive (instead of disabled) — removes dead UI state
- "Show background art" label updated across all 16 locales to clarify it applies to the first shelf
- QAM action buttons regrouped: Add / Import / Export on the left; Import from TabMaster on the right
- QAM button row alignment fixed: buttons now flush with the 16 px QAM edge instead of over-indented
- Shelf action button (⋯) right-aligned to match the TabMaster import button position
- Card dimensions discovered from the native SteamOS shelf are now persisted to `localStorage` (`ds-cardsize`) per viewport/DPI, so cold boot reuses the last-session values instead of briefly rendering the hardcoded fallback before re-measuring — eliminates the initial card reflow. Cache is keyed by `innerWidth`/`innerHeight`/`devicePixelRatio` and re-measured whenever the viewport changes.
- About page doc sections now render inside the native SteamOS `DialogBody` + `DialogControlsSection`, matching the container decky-loader itself uses for its own settings pages. This restores scrolling on every About subpage (Overview / How to / Shelves / Filters / Support) without a custom bounded-height wrapper.

### Fixed

- Focus restoration after returning from a game detail screen (B button): focus now reliably lands back on the exact card/shelf the user activated, instead of intermittently snapping to the first shelf. Root cause was a mix of (a) duplicate activation via `onActivate` + `onOKButton` + `vgp_onok` listener pushing multiple history entries (fixed with a 400 ms dedupe guard on card activation), (b) a `hideRecents` effect re-running on every `shelves.length` change and hijacking focus to the first shelf (now no-ops when something in the shelves root already has `gpfocus`), and (c) the restore loop racing Steam's native popstate handler. Restoration now syncs Steam's `m_lastFocusNode` at A-press time for a deterministic native landing, and the post-popstate loop retries on `requestAnimationFrame` for up to 800 ms — covering the 1–3 frame window where React remounts cards and the gamepad nav tree is rebuilt.
- "Installed" filter no longer includes every UnifiDeck shortcut as installed — UnifiDeck marks all its shortcuts `installed: true` in the app overview; the filter now cross-references the `[Unifideck] Installed` collection (the same source TabMaster-based tabs use) for non-Steam apps, falling back to `size_on_disk` / local playtime when the collection is absent. Also extended the non-Steam detector to handle UnifiDeck's numeric `app_type` value.

## [1.2.3] - 2026-04-11

### Added

- `pnpm run update` / `update:safe` / `update:check` scripts for dependency management
- `pnpm run precommit` script: runs typecheck, tests, production build, compat checks, and screenshot validation in sequence
- `pnpm run deploy:verify` script: deploy hard + wait + CDP smoke probe to verify plugin loaded
- Hero background replicates native SteamOS structure discovered via CDP:
  - Native wrapper classes with `mask-image: radial-gradient(...)` vignette (applied via className)
  - Solid background layer inside the hero div uses `var(--ds-page-bg)` so mask fades to theme color — parent containers remain transparent
  - Bottom gradient from `var(--ds-page-bg)` to transparent for smooth transition at hero edge
  - `--ds-page-bg` CSS variable detected at runtime from the scrollable viewport ancestor (follows active CSS Loader theme)
- When recents are hidden, focusable elements inside the recents section receive `tabindex="-1"` and `aria-hidden="true"` so gamepad navigation skips directly to shelves
- Focus moves to the first shelf card when recents are hidden via `FocusNavController.BTakeFocus()` API, with retries at 500ms/1500ms/3000ms
- `focusElement()` utility in `focusRestore.ts` for programmatic gamepad focus via Steam nav tree API
- `shelves_section` i18n key added across all 16 locales for QAM section header
- About page content panels now scrollable with right joystick via `Focusable + scrollPanelClasses.ScrollPanel` with inner focusable content
- New shelves are always inserted at the top of the list; duplicated shelves are inserted right below the original
- Creating a blank shelf now opens the edit modal immediately after creation
- Screenshot automation: new captures for "Create Shelf" (template picker modal) and "Import Shelves" modal
- Screenshot QAM navigation rewritten: navigates to the last tab (Decky plugins), then finds and clicks "Deck Shelves" inside the plugin list — no longer relies on tab text matching

### Changed

- Home validation logic rewritten: recents are always forced visible when plugin is disabled, no visible shelves exist, all shelves are hidden, or no shelves resolve to results — toggle values are never force-changed, only DOM state is overridden
- "Hide recents" toggle: hidden when plugin not enabled on home; disabled when no shelves have results
- "Hero background" toggle: always visible when plugin enabled (no longer nested inside hide-recents condition); disabled when hide-recents is off or no shelves have results
- `disableHideRecents` computation now runs independently of the current toggle value
- Removed unused imports across 23+ files: React default imports (automatic JSX transform), orphan types, dead utility functions, unused Decky UI components
- QAM modals import paths corrected: `../../features/` → `../../../features/` (7 files)
- `ShelvesPanelSection` now uses explicit `Shelf` type annotations instead of implicit `any`; removed from `PanelSection` wrapper for more lateral space
- QAM layout: added "Shelves" / "Apply globally" section headers with consistent padding; separator below action buttons; shelf list entries single-line with ellipsis
- EditShelfModal fully restored: source type selection, filter panel, preview count, all toggles
- Dependency updates: TypeScript 5.9→6.0, i18next 25→26, react-i18next 16→17, vitest 3→4, jsdom 21→29, esbuild 0.27→0.28, react 19.2.4→19.2.5

### Fixed

- Second shelf title no longer hidden behind hero: hero uses `zIndex: -1` to stay behind shelf content in the stacking order, and background color is self-contained inside the hero div instead of coloring the mount/root containers
- Hero fade uses `var(--ds-page-bg)` detected from theme viewport — follows CSS Loader themes automatically instead of forcing black
- Featured card no longer flashes/resizes after initial render: native dimension discovery now requires 2 consecutive stable polls before accepting changes (confirmation cycle)
- Shelf titles in QAM reorderable list now properly ellipsize in a single line next to the action button
- TypeScript CI typecheck errors: 7 QAM component files had wrong relative import paths for `features/settings/controller` and `types`
- Compatibility check: CSS Loader coexistence script now recognizes `ds-` as valid namespace prefix
- Compatibility check: Obsidian theme font-size check now excludes files with scoped selectors (ROOT_ID, STYLE_ID)
- Compatibility check: SteamOS 3.7 route detection regex fixed (BRE `\|` → ERE `|` with `-E` flag)
- i18n check: key count line changed from info to positive check

## [1.2.2] - 2026-04-09

### Fixed

- Fix background color

## [1.2.1] - 2026-04-09

### Added

- "Show background art" sub-toggle: when recents are hidden, the first shelf shows hero background art on card focus, matching the native recents behavior with CSS Loader theme support (e.g. Obsidian grayscale filter)
- Global "Match native card size" and "Highlight first game" toggles in QAM with precedence over per-shelf settings
- PlaceholderCard component: games without art show a styled card with the game name instead of a broken image
- Mouse hover support: card labels, brightness, and compat badges activate on hover (CSS-only, no interference with gamepad)

### Changed

- DeckRow.tsx split into modular files: `shelf/types.ts`, `shelf/shelfStyles.ts`, `shelf/GameCard.tsx`, `shelf/MoreCard.tsx`, `shelf/PlaceholderCard.tsx`, `shelf/HeroBackground.tsx`
- Navigation patches extracted from HomeInject.tsx to `home/navPatches.ts` (210 lines)
- QAM icons extracted to `qam/icons.tsx`
- `steam.ts` moved to `steam/index.ts` as modular barrel
- `settingsStore.ts` moved to `store/settingsStore.ts` with backwards-compatible re-export
- `focusRestore.ts` rewritten with AbortController + recursive setTimeout (cleaner than nested setInterval)
- Dimension change tolerance increased to 4px with 2-cycle confirmation to prevent resize flicker
- Featured card width/height transitions smoothly (CSS transition: 0.3s ease)
- Hero background replicates full native DOM chain for CSS Loader theme compatibility (zoom animation, grayscale filters)
- Documentation consolidated into `docs/` directory: architecture, plugin-api, development, filters

### Fixed

- Vertical shelf centering restored: fallback scroll calculations use correct `scrollTop + delta` math
- Card art overflow:hidden in stylesheet for Round theme compatibility

## [1.2.0] - 2026-04-09

### Added

- Dynamic card sizing: `discoverNativeCardDimensions()` detects native card dimensions at runtime; shelves match native card size when `matchNativeSize` is enabled per shelf
- "Highlight first game" option: first card in a shelf renders as a landscape featured card
- "Hide recent games" toggle in QAM hides the native "Recently Played" section
- Crash protection: home mount errors automatically disable shelves with a retry button in the QAM
- Developer / Publisher filter type with batch preloading via `RegisterForAppDetails`
- 8 new i18n keys translated across all 16 locales

### Changed

- HomeInject mount polling replaced with `MutationObserver`; 1-second fallback timer increased to 10 seconds (battery optimization)
- ShelvesContainer nav-tree patching loop replaced with `MutationObserver` + 10-second fallback instead of 1-second polling
- `ensureStyles()` consolidated to a single global timer shared by all DeckRow instances instead of one 3-second interval per shelf
- Focus restore polling reduced from 100ms → 500ms initial with 2-second escalation; total timeout reduced from 5 minutes to 30 seconds
- homePatch fallback renderer limited to 6 retry attempts (60 seconds) instead of indefinite polling
- Collection raw cache now uses 60-second TTL; expired entries are evicted on next read
- Native card dimension discovery prefers `Focusable`/`Panel` elements as card roots and skips focused/hovered cards to avoid scale-transform measurement
- Horizontal navigation throttle reduced from 200ms to 150ms per card for faster lateral browsing
- Hide recents uses `visibility:hidden` + `height:0` instead of `display:none` to preserve DOM structure for layout measurement
- Landscape card image URLs prioritize custom hero images, then local `header.jpg` (faixa), then `library_hero.jpg`, then CDN fallbacks
- Logging added to all previously-empty catch blocks across the codebase

### Fixed

- Focus ring respects art height on featured cards (no longer extends past the game image)
- Hide recents setting persists correctly across QAM reopens — Python backend preserves `hideRecents` field
- QAM toggle reads persisted value via `getCurrentSettings()` on mount instead of resetting to false
- Featured card height matches native card height (discovery no longer picks up non-card wide elements)

## [1.1.3] - 2026-04-07

### Fixed

- Horizontal shelf navigation now matches native Recent Games pacing: each D-pad press advances exactly one card with a ~200ms per-card pause when holding, preventing focus from racing ahead of the scroll
- `React.createElement` monkey-patch in `steamGameMenu.ts` is now restored via `try/finally`, preventing a stale override if menu extraction throws
- `DS_MENU_PATCHED` string property replaced with a `WeakSet<object>` (`patchedMenuControllers`), avoiding pollution of external Steam controller objects with plugin-owned string keys
- `BTryInternalNavigation` proto-patch now documents potential conflicts with other plugins that patch the same method; chaining via `orig()` closure is preserved

### Changed

- Horizontal scroll throttle implemented via `__ds_scroll_throttle_rows` Set shared between `DeckRow` and `BTryInternalNavigation`: while a row is throttling, D-pad input is blocked at the navigation layer so focus and scroll advance together card-by-card
- `__ds_centering_rows` global Set removed; replaced by per-row `rafPending` + `throttleTimer` locals with no global state

## [1.1.2] - 2026-04-07

### Added

- Compatibility tier badge on shelf cards (Steam Deck Verified / Playable) with themed colors
- CSS Loader / DeckThemes compatibility: shelf cards now receive native Steam card classes (`WYgDg9NyCcMIVuMyZ_NBC`, art, img classes) injected at runtime so much theme CSS rules apply to shelf cards the same way they apply to native Recent Games cards in most of cases
- Native focus animation colors: `--custom-sp-color-border` and its grow/fade variants set as `:root` fallbacks so active themes cascade their accent color to the shelf focus ring without override conflicts
- Runtime detection of native card art classes (`nativeCardArt`, `nativeCardArtOuter`, `nativeCardArtPortrait`, `nativeCardImg`, `nativeCardImgFade`) injected into shelf card DOM elements

### Changed

- Heading color detection (`--ds-native-heading-color`) now applies a saturation check: white/gray vanilla headings are skipped so the CSS fallback (green play icon, inherit for text) is used when no theme is active
- `--ds-native-heading-color` is cleared and re-detected on every `ensureStyles()` call so theme changes take effect live without requiring a Steam reload
- Focus suppression rules scoped to `#deck-shelves-home-root` with ID-prefix specificity to prevent Steam/Decky default focus visuals from overriding the themed focus ring
- Ancestor elements (row scroll, shelf root) suppress their own focus visuals so only the card-level ring is visible

### Fixed

- Install detection no longer infers installed from `display_status > 0` alone; only explicit `installed: true` in `per_client_data` marks a game as installed — fixing false positives where games available on remote clients (ds=9) were shown with the play icon
- Non-Steam shortcuts default to `installed: false` when no install evidence is present, rather than `true`
- `enrichAppStateFlags` secondary check no longer skips Steam games — all items without confirmed `installed: false` are re-verified via `GetAppOverviewByAppID`
- `--custom-sp-color-border` cascade: variables are now set on `:root` as plain fallbacks instead of via a `--ds-focus-color` indirection that could not resolve body-level theme values, so theme accent colors correctly reach the focus animation keyframes
- Play icon color no longer persists as gray after a theme is removed (stale `--ds-native-heading-color` is now always cleared before re-detection)
- Status text no longer inherits the wrong accent color in Outrun and similar themes (removed explicit `color` from `.ds-card-status`, allowing correct cascade from native card)

## [1.1.1] - 2026-04-06

### Added

- i18n keys `folder_label` and `browse` translated across all 16 locales
- "Pull Request Format" section in CONTRIBUTING.md documenting PR template fields
- PR title tags `[CLEANUP]` (minor bump) and `[ENHANCEMENT]` (patch bump) for finer-grained version control
- Runtime webpack class discovery (`src/core/webpackCompat.ts`): discovers Steam's obfuscated viewport class at plugin mount via three-tier fallback (overflow scan → ancestor traversal → broad aggregation), enabling deterministic shelf selectors that survive Steam updates without hardcoded hashes
- Static classmap seed (`src/runtime/classmap.json` + `src/runtime/embeddedClassMap.ts`): bootstraps `window.__DS_CLASS_MAP` and `localStorage['ds_class_map']` at plugin startup so viewport selectors are available immediately, before discovery runs
- Dev tools: `scripts/devtools/deck/tools/cdp_eval.py` (generic CDP expression evaluator) and `inject_classmap.py` (injects a classmap into SharedJSContext via CDP for development/testing)
- Unit tests for `webpackCompat` module (jsdom environment, Vitest): viewport token discovery, row/card token discovery, ancestor scanning fallback, and localStorage persistence roundtrip
- `docs/webpack-classmap.md`: developer guide for webpack class discovery, runtime injection, and CDP verification workflow

### Changed

- Workflow `enforce-repo-settings.yml`: trigger changed from `pull_request`/`push` to `workflow_dispatch` + weekly schedule; added `continue-on-error: true` to prevent blocking merges on 403 errors
- Workflow `ci.yml`: skip redundant runs on version bump commits
- Workflow `release.yml`: validation reduced to `build:release` + `dist` (no re-test)
- Workflow `bump.yml`: added `[CLEANUP]` (minor) and `[ENHANCEMENT]` (patch) PR title tags
- Replaced hardcoded "Folder" and "Browse" strings in QAM settings with i18n keys `folder_label` and `browse`
- Viewport discovery in `DeckRow.tsx` now uses the runtime classmap (`window.__DS_CLASS_MAP`) and `findWebpackHashedClass()` heuristic instead of a hardcoded webpack hash, making it resilient to Steam updates

### Fixed

- Screenshot validation no longer requires `about-page.png` (removed from EXPECTED array)
- Fixed untranslated compatibility status strings (`compat_verified`, `compat_playable`, `compat_unsupported`, `compat_unknown`) in French, German, and Italian locales
- Vertical shelf navigation no longer double-scrolls: replaced triple-timed `scrollIntoView()` calls (rAF + 300 ms + 600 ms) with a single `requestAnimationFrame`-based scroll, eliminating the visual "jump twice" when moving between shelves with the D-pad

## [1.1.0] - 2026-04-04

### Added

- License section in README
- New sort option "Recently added" — sorts by library acquisition date instead of last played
- Localized Favorites collection resolution — favorites shelf now works on all languages (FR, DE, ES, IT, PT, etc.)
- AboutPage right panel is now focusable and scrollable with gamepad navigation
- Expanded filter documentation in AboutPage with descriptions for all 15 filter types, filter groups, and 8 sort options
- Shelf app ID cache in localStorage for instant display after standby resume
- Startup readiness retry — shelves wait for Steam app data before resolving instead of showing empty
- i18n expanded to 16 fully translated languages: added PT-PT, ES-419, RU, PL, NL, TR, UK, JA, KO, ZH-CN

### Changed

- Shelf cards now inherit border-radius from native Steam cards and CSS Loader themes via `--ds-card-radius` custom property
- Horizontal shelf navigation now centers the focused game card instead of pinning to the left edge
- Vertical shelf centering scrolls the full shelf row to viewport center with 300ms retry fallback
- Screenshot automation now captures the About / Filter Documentation page

### Fixed

- Favorites shelf not displaying on non-English systems — added collectionStore fallback for locale-independent resolution
- "Recently Added" template now correctly sorts by acquisition date instead of last played time
- Game covers now match the visual style of native Steam cards when CSS Loader themes are active
- Non-Steam shortcuts (UnifiDeck) no longer incorrectly marked as installed based on exe_path — now uses `per_client_data.display_status` for reliable install detection
- Removed lenient installed filter fallback that treated unknown install state as installed
- Removed manual keydown handler for horizontal navigation — gamepad focus is now managed entirely by Steam's FocusNavController for consistent pacing

## [1.0.0] - 2026-04-02

### Added

- CI: full GitHub Actions CI pipeline (typecheck, build:release, compatibility validations and decky submission checks)
- Tests: Python `pytest` support alongside Vitest; `pnpm run test:all` helper to run both suites
- Public plugin API: `window.__DECK_SHELVES_API__` for external plugins to register shelf sources (versioned API)
- First-run UX: FirstRun banner and templates (Favorites, Recently Played, Installed) to bootstrap new users
- Shelf templates: Preset templates for common shelf types (most-played, recently added, awaiting-update, played-in-last-7-days)
- Shelf refresh emitter: global `ShelfRefreshEmitter` to centralize refresh events and reduce per-shelf polling
- Suspend/Resume hooks: SteamOS suspend/resume handling to pause timers and revalidate state on resume
- UnifiDeck surfacing: UnifiDeck-managed non-Steam apps are surfaced as sources/tabs in the editor
- Release automation: GitHub Actions release workflow for tag-triggered releases
- Diagnostics: SteamOS version detection added to startup diagnostics
- Atomic settings writes and `settings.json.bak` backup in the Python backend

### Changed

- Screenshot automation: i18n-only language switching prior to captures; CDP reachability checks; deferred deletion of screenshots until targets verified
- Tests: moved TypeScript tests from `src/__tests__` to `src/test`; CI updated to install and run Python `pytest` alongside Vitest
- Polling → event-driven refresh: shelves now subscribe to a global emitter and use a single fallback poll (30s) instead of individual short timers
- Increase tab refresh TTL and home fallback intervals to reduce churn (tabs 30s, homePatch fallback 10s)
- Selector strategy: use ordered candidate selectors (aria-labels, stable substrings) instead of brittle obfuscated classes

### Fixed

- `scripts/build/validate-screenshots.mjs` waits for an i18n marker before validating PNGs to ensure English UI is applied
- Host/URL normalization for CDP tooling to prefer HTTP/ws endpoints when TLS is not available
- `resetSettings()` now uses a timeout wrapper to avoid blocking the UI when backend is unresponsive
- Fixed `focusRestore` interval leak by clearing previous poll in cleanup
- TabMaster import error handling improved with explicit loading/error state in the QAM
- Diagnostic logging for shelves with zero resolved apps surfaced in production diagnostics
- Increased homePatch schedule fallback from 2s to 10s to reduce unnecessary CPU use
- Added nav-tree fallback for gamepad focus when internal APIs are unavailable


## [0.2.0] - 2026-04-02

### Added

- **Advanced filter groups** — filters can now be combined with AND/OR logic using nested filter groups, enabling complex queries like "installed AND (favorites OR played within 7 days)".
- New filter types: store tags, achievement count range, friends who own, update pending, and merge (combine multiple sources into one shelf).
- New sort options: release date, size on disk, Metacritic score, and review score.
- **TabMaster integration** — an "Import from TabMaster" button appears in the QAM when TabMaster is installed; tabs with filters become filter-based shelves, and built-in tabs become tab-based shelves.
- **UnifiDeck integration** — non-Steam apps managed by UnifiDeck (e.g. Epic, GOG, Amazon shortcuts) are automatically included in filter and tab shelves.
- Library tab selection now shows your actual library tabs (including custom tabs created by other plugins) instead of a static list.
- Non-Steam apps are now included in filter shelf results.

### Changed

- Filter shelf editor redesigned to support the new group-based filter UI.
- Tab source selection reflects real runtime tabs from the user's library.

### Fixed

- Delete shelf button no longer leaks destructive styling into Steam's system shutdown menu.
- Existing shelves backed by UUID tabs are automatically migrated to the correct filter-based source on load.

## [0.1.0] - 2026-03-25

### Added

- Configurable shelves injected into Steam Deck Home.
- Quick Access Menu (QAM) settings panel for managing shelves.
- Support for multiple shelf types: Collection, Tab, and Filter shelves.
- Shelf reordering, renaming, and visibility toggles.
- Empty shelf preview warning with user-friendly messaging.
- Full i18n support (en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT).
- Automated workflows.
