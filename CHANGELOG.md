# Changelog

All notable changes to Deck Shelves will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
