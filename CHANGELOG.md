# Changelog

All notable changes to Deck Shelves will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- "Show background art" toggle is now hidden when "Hide recent games" is inactive (instead of disabled) — removes dead UI state
- "Show background art" label updated across all 16 locales to clarify it applies to the first shelf
- QAM action buttons regrouped: Add / Import / Export on the left; Import from TabMaster on the right
- QAM button row alignment fixed: buttons now flush with the 16 px QAM edge instead of over-indented
- Shelf action button (⋯) right-aligned to match the TabMaster import button position
- Card dimensions discovered from the native SteamOS shelf are now persisted to `localStorage` (`ds-cardsize`) per viewport/DPI, so cold boot reuses the last-session values instead of briefly rendering the hardcoded fallback before re-measuring — eliminates the initial card reflow. Cache is keyed by `innerWidth`/`innerHeight`/`devicePixelRatio` and re-measured whenever the viewport changes.

### Fixed

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
- Roadmap reorganized: completed sprints collapsed to version table; added Sprint 6 (Native Components Audit), Sprint 7 (Manual Sort), Sprint 9 expanded to v2.0.0 with cleanup/optimization

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
