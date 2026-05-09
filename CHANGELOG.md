# Changelog

All notable changes to Deck Shelves will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- British English (`en-GB`) localization. Derived from `en-US` with UK spelling (`Favourites`, etc.). Auto-selected when the system language is `en-GB` or any `en-GB-*` variant.
- Canadian French (`fr-CA`) localization. Derived from `fr-FR` with corrected accents throughout (`étagère`, `être`, `installé`, `bibliothèque`, `paramètres`, etc.), translated `shortcut_kind_game` ("Jeux"), and minor Canadian French vocabulary adjustments. Auto-selected when the system language is `fr-CA` or any `fr-CA-*` variant.
- Traditional Chinese (`zh-TW`) translation.

## [2.1.0] - 2026-05-08

### Added

- **`shortcutType` filter — games, software, tools, non-Steam links.** New filter type with a multi-select of four mutually-exclusive kinds: `game` (Steam `app_type === 1` or unknown), `software` (Steam `app_type === 2`, standalone apps), `tool` (Steam `app_type` ≥ 4: redistributables, runtimes, Proton), `link` (non-Steam shortcuts). Default = `["game"]`. Invertible. Per-shelf and global usage; UI in `FilterItemOptions` as individual toggles per kind.
- **`dedupeByExactName` — per-shelf exact-name deduplication.** New optional boolean on `ShelfSchema` and `SmartShelfSchema` (default `false`). Post-resolution, games with the same exact name (trim, case-sensitive) are collapsed to one entry; Steam wins over non-Steam within a group. O(n) pass via `Map<name, appid>`. Global counterpart `globalDedupeByName` in settings. Toggle in Display tab of both edit modals.
- **`hiddenAppIds` — manual game exclusion list per shelf.** New optional `number[]` on both shelf schemas. The resolver overshoots (`Math.min(limit + hiddenSet.size * 2, limit * 3)`) to compensate, then filters and slices to `limit`. Display tab gains a "Hide specific games" toggle (positioned as the **last** toggle in the tab so the trigger sits next to its picker) that opens an app picker (same mini-card row pattern as the highlight picker); candidates are fetched with `limit * 3` and refresh with 300ms debounce when the hidden set changes.
- **`childFilter` on collection / tab sources.** Optional `FilterGroup` on the `collection` and `tab` source variants. Applied after source resolution, before sort/slice. UI: when the source type is `collection` or `tab`, a dedicated **Additional Filters** tab (`edit_tab_additional_filters`) appears in the shelf editor — with its own SavedFiltersBar and FilterPanel — separate from the Source tab.
- **Per-range `days` in `visibleHours`.** Each `{ start, end }` range in a smart shelf's `visibleHours` array now accepts an optional `days?: number[]` (0 = Sunday … 6 = Saturday). When set, that range applies only on the listed weekdays; ranges without `days` fall back to the global `visibleDaysOfWeek`. Fully backwards-compatible.
- **`getModeVisibilityWindows(mode)` — generic time-window hook.** New export from `src/steam/smartShelves.ts`. Returns hardcoded visibility windows for modes with built-in time-conditional logic (currently `spare_time` → `SPARE_TIME_WINDOWS`). Used by `HomeInject` to schedule boundary timers for shelves that have no explicit `visibleHours` but whose mode has an internal time check. Add new modes here as they acquire internal time checks.
- **Smart-shelf editor restructure — `allowDayOverrides` toggle gates a dedicated `overrides` tab.** New `EditState.allowDayOverrides` field (initialized from whether the persisted `visibleHours` contains any range with `days`). The visibility-hours toggle, default-hours editor, and weekday picker now live at the bottom of the **Smart Filters** tab; when `allowDayOverrides` is on (and `visibleHoursEnabled` is on), an **Overrides** tab (`edit_tab_overrides`) appears next to it with an info summary of the configured days/hours plus per-weekday hour-range editors. Turning the toggle off clears `dayOverrides` and switches `activeTab` back to `smart_filters` if the user was on `overrides`. Replaces the previous standalone `schedule` tab. The `Tab` union now reads `'source' | 'smart_filters' | 'overrides' | 'filters' | 'visual' | 'display'`. Day picker now warns ("`smart_visible_days_empty_warning`", orange `#ff9800`) when no days are selected — the empty selection means "never visible" (was previously labeled "= every day"). New i18n keys (16 locales): `edit_tab_overrides`, `smart_allow_day_overrides`, `smart_allow_day_overrides_desc`, `smart_overrides_info_label`, `smart_schedule_day_overrides`, `smart_schedule_default_hours`, `smart_visible_days_empty_warning`. Updated `smart_visible_days_desc` to drop the "Empty = every day" wording.
- **Live shelf preview in both edit modals.** New `ShelfPreview` component ([src/components/qam/modals/editShelf/ShelfPreview.tsx](src/components/qam/modals/editShelf/ShelfPreview.tsx)) replaces the previous mini-card row across Source / Filters / Visual / Display tabs. Renders real `GameCard` instances at compact size (78w × 168h, art 110h portrait; featured cards use the same 3.21× width multiplier as the home shelf for proper landscape hero ratio) plus optional `MoreCard` and `RefreshCard` tail tiles. Every Display-tab toggle (`hideStatusLine`, `hideNewBadge`, `hideCompatIcons`, `hideNonSteamBadge`, `hideGameNames`, `hideInstallIndicator`, `hideSeeMore`, `hideRefreshCard`) feeds the preview live. Title renders above the preview at the modal level (so it appears for the regular preview, hidden-games picker, manual-sort row, and highlight picker alike) gated by `hideShelfTitle`. Scoped style overrides (`[data-ds-preview-row="1"] ...`) shrink `.ds-more-card-text` to 10px and `.ds-refresh-card svg` to 22px so the trailing tiles match the smaller card footprint without touching home-screen styles. `resolvedMeta` was widened from `{ name, portraitUrl, heroUrl }` to the full `PlatformAppMeta` so the preview has access to `installed`, `isSteam`, `deckCompatCategory`, `playtimeMinutes`, `updatePending`, `addedTimestamp` (used to compute `isNew` per-card).
- **`onFocus`-delegation pattern in the preview row.** The row wrapper uses `noFocusRing` + an `onFocus` handler that delegates to the first `.ds-card` when Steam's nav lands on the wrapper itself — same pattern `DeckRow` uses on the home screen. A `focusin` listener also calls `scrollIntoView({ behavior: 'instant', inline: 'center' })` on whatever card receives focus, so held D-pad input keeps the focused card in the visible window instead of letting Steam's nav drift past the viewport.

### Changed

- **Modal height increased** in both `EditShelfModal` and `EditSmartShelfModal` — outer container went from `min(calc(100vh - 220px), 720px)` to `min(calc(100vh - 160px), 800px)`. `FieldContainer scrollable` cap went from `min(calc(100vh - 280px), 660px)` to `min(calc(100vh - 220px), 720px)`. ~60–80px more vertical room for tab content; preview height unchanged.
- **`getAppMeta` calls are now parallelized** — `Shelf.tsx`, `EditShelfModal`, and `EditSmartShelfModal` previously walked `appIds` with `for (...) await platform.getAppMeta(id)`, serializing N round-trips per shelf at cold-start (Steam restart) when the in-memory caches are empty. Replaced with `Promise.all(ids.map(...))`; each call is independent and the underlying `getAllAppOverviews` fallback already memoizes for 10s, so concurrent callers share work rather than duplicating it. Cuts populate-time from N×latency to ~max(latency).
- **`findNavNodeForElement` traverses all gamepad nav trees** ([src/core/focusRestore.ts](src/core/focusRestore.ts)) — was scoped to `GamepadUI_Full_Root` only, so `focusElement` falling back to `el.focus()` for elements outside that tree (e.g. modal `Focusable` wrappers) gave browser focus without syncing Steam's gamepad-focus tree. Now iterates `m_ActiveContext.m_rgGamepadNavigationTrees` and walks each tree's root until a node matching the target element is found. `focusElement` (and the existing `saveFocusTarget` / `tryRestoreFocus` callers via `findNavNodeForElement`) now resolve modal nodes correctly. Home-screen restore behavior is unchanged because `GamepadUI_Full_Root` is one of the iterated trees.

### Fixed

- **Smart shelf visibility boundary — stale-cache and missed re-render.** Three bugs combined to keep a shelf visible up to 60 min after its window closed: (1) `triggerShelfRefresh()` at the boundary notified `ShelfView` components but did not cause `HomeInject` to re-render, so `isInVisibilityWindow` was never re-evaluated to remove the shelf from the array; (2) the 60-min `resolveSmartShelf` cache could stay valid after the window ended, returning stale game IDs on the next resolve; (3) shelves without explicit `visibleHours` (e.g. `spare_time` relying on its internal `isSpareTimeWindow` check) had no boundary timer at all. Fixed by: adding `visibilityTick` state that increments on each boundary fire (forcing `HomeInject` re-render and re-evaluation of `isInVisibilityWindow`), calling `invalidateSmartShelfCache` for all time-aware shelf IDs before `triggerShelfRefresh`, and using `getModeVisibilityWindows` as fallback when `visibleHours` is absent so modes with internal time checks also get a boundary timer. The effect re-arms via `visibilityTick` in its deps so subsequent boundaries are also caught.
- **Card shrink/distort flicker during fast horizontal navigation (#39).** Steam's native focus rule applies a `1.02×` `scale` transform with a CSS-animated transition when focus enters/leaves a card. The 3 s `discoverNativeCardDimensions` poll could land on the transition tail, measuring an intermediate `1.01×` `getBoundingClientRect()` width on a non-`:focus` / non-`gpfocus` card; that reading then fed `nativeDimsListeners` and briefly shrank every shelf card on the home until the next stable poll. `discoverNativeCardDimensions` now reads `getComputedStyle(...).transform`, parses the matrix, and skips any candidate whose x-scale isn't ~`1` (`Math.abs(sx - 1) > 0.005`). `:focus` / `:hover` / `gpfocus` short-circuits are kept; this layer catches the transition tail those don't.
- **Focus restore on return from a game targets the wrong tree (#38).** `findNavNodeForElement` searched only the `GamepadUI_Full_Root` nav tree, so on SteamOS builds where the home is registered under a different tree id (notably 3.7.x with `root_1_`) the saved `m_lastFocusNode` couldn't be located and Steam's default first-card landing won. The function now iterates `m_ActiveContext.m_rgGamepadNavigationTrees` and walks each tree's root, so `saveFocusTarget` / `tryRestoreFocus` resolve cards regardless of which tree the active context registers them in. Modal `Focusable` wrappers also benefit (relevant to in-modal `focusElement` callers).

### Performance

- **`getAllAppOverviews` — in-flight de-duplication.** When many shelves resolve concurrently before the 10 s cache is populated (typical on cold mount and on resume from sleep), each call used to start its own `GetAllAppOverviews` chain — multiple Steam IPC round-trips per shelf, plus the fallback walks through every Steam window/client. Added an `appOverviewPending` shared promise so the second-and-later concurrent callers `await` the first call's result instead of duplicating the work. The 10 s cache and the post-fetch enrichment / filtering steps are unchanged; this only collapses the in-flight herd.

## [2.0.1] - 2026-05-06

### Added

- **Modal-driven shelf creation — applies to every template, not just blank/custom.** Picking **any** entry from the regular shelf template picker (Blank + 11 templates) **or** the smart shelf template picker (Custom + 15 modes) now opens the editor against an in-memory draft pre-populated with that template's source/mode/title. Nothing is persisted until **Save**. Cancelling or closing the modal discards the draft, eliminating every orphaned default-config shelf the previous flow could leave behind. New controller actions `createDraftShelf` / `commitShelf` and `createDraftSmartShelf` / `commitSmartShelf`, and a new `mode?: 'create' | 'edit'` prop on `EditShelfModal` and `EditSmartShelfModal` (default `'edit'`, so all existing edit paths are unchanged).
- **Hide "See more" trailing card toggle (per-shelf + global).** New `hideSeeMore` field on `ShelfSchema`/`SmartShelfSchema` and `globalHideSeeMore` on `SettingsSchema`. Per-shelf overrides global; both default `false`. Skips the trailing "See more" card in `Shelf.tsx`'s extras list.
- **Hide refresh trailing card toggle (per-shelf + global).** New `hideRefreshCard` field on `ShelfSchema`/`SmartShelfSchema` and `globalHideRefreshCard` on `SettingsSchema`. Suppresses the trailing refresh card on shelves that currently emit one — regular shelves with `sort: random` and smart shelves whose mode is in `REFRESHABLE_SMART_MODES` (`random_pick`, `time_of_day`, `spare_time`, `recently_played`). Recompute / cache cadence stays untouched; only the user-facing card is hidden. Per-shelf and global combine via OR (hide if either is true) — the initial `??` fallback was a logic bug that ignored the global toggle whenever the per-shelf default of `false` was already serialized; switched to the explicit OR pattern used by every other hide flag. New controller actions `setGlobalHideSeeMore` / `setGlobalHideRefreshCard`. Translation keys `hide_see_more_card` / `hide_refresh_card` shipped in all 16 locales.
- **Custom smart-shelf template documented.** AboutPage `Smart shelves` tab now lists `smart_template_custom` under the "Anything goes" group with its existing description.
- **Asc/desc icon button next to sort dropdowns.** New `sortReverse` (and `manualBaseSortReverse`) optional booleans on `ShelfSchema`, `SmartShelfSchema`, and `FilterSchema`. A 40×40 icon-only `DialogButton` renders next to each sort dropdown in `EditShelfModal`/`EditSmartShelfModal` ([SortDirectionButton.tsx](src/components/qam/modals/editShelf/SortDirectionButton.tsx)) — same shape as the icon buttons used by `SavedFiltersBar`. New `icons.sortDesc` / `icons.sortAsc` SVGs (stacked horizontal bars + chevron arrow on the right) replace the previous chevron-up/down placeholders so the button reads as "sort direction" at a glance. Click toggles between descending (default — natural order) and ascending (reversed). Both rows now use the FilterPanel-style `<Field childrenLayout="inline">` with bare `<Dropdown>` instead of `<DropdownItem>` — `DropdownItem`'s built-in negative horizontal margins (`margin: 0 -42px`) escaped the flex parent and overlapped the action button; the `Field` + bare `Dropdown` pattern keeps both elements inside the modal's padding so lateral D-pad navigation works without visual clipping. Hidden for `manual` and `random` sorts. `applySortToIds` accepts a `reverse` flag and reverses the result post-sort; `resolveShelfAppIds` and the `PlatformApi` interface gain an optional `sortReverse` parameter that flows from the shelf's persisted state. **Critical fix**: when no explicit sort is persisted (regular shelves default to `"alphabetical"` stored as `undefined`) and reverse is on, the resolve closure now substitutes `"alphabetical"` for the resolver's sort argument so `applySortToIds` actually runs and the reverse flag has somewhere to apply — without this fallback, no-sort + reverse left the source's natural order untouched. The `Shelf.tsx` resolve effect's dependency array now includes `sortReverse` and `manualBaseSortReverse` so toggling triggers an immediate re-resolve. Translation keys `sort_direction_asc` / `sort_direction_desc` shipped in all 16 locales.
- **Steam Cloud (☁️) and Deck Verified (🛡✓) icons on regular-shelf template buttons.** New `Cloud` and `ShieldCheck` SVGs added to `SHELF_TPL_ICON` ([src/components/qam/modals/templateIcons.tsx](src/components/qam/modals/templateIcons.tsx)) for the `steam_cloud` and `deck_verified` template ids — they previously rendered as text-only buttons because no icon was registered. Visual parity with the rest of the picker.

### Changed

- **Per-shelf game limit raised to 50** (was 40 in the slider; schema cap was already 100). Both `EditShelfModal` and `EditSmartShelfModal` reflect the new max. No data migration; existing shelves keep their stored limit.
- **`.ds-new-badge` mirrors the native "Novo / New" badge color resolution.** Background now resolves through `var(--ds-new-badge-bg, var(--colored-toggles-main-color, rgb(26, 159, 255)))`. The middle variable is the **same one** the native SteamOS recents badge resolves against — so themes that already recolor Steam's native badge (Colored Toggles, Obsidian, Outrun, etc.) automatically tint our badge in the same color without any extra theme work. Plugin authors / theme authors can still hard-override via `--ds-new-badge-bg`. Confirmed by CDP probe of the live SteamOS recents row: the native rule matched is `.<minified-class> { background: rgb(26, 159, 255); }` followed by an override `{ background: var(--colored-toggles-main-color); }`. Position kept at `top: -2px` / `z-index: 20` (matches the native band exactly).
- **Smart shelves `quick_play`, `deck_picks`, `rediscover`, and `on_deck` now exclude non-game app types** (Proton, Steam Linux Runtime, redistributables, tools). Resolvers gate on `app_type === 1` (game) or `undefined` (unknown — allowed through to avoid false negatives). Drops the bulk of the noise reported on these modes without raising the per-mode `minDeckLevel` defaults.
- **`docs/filters.md` — `merge` documented correctly.** The row now reflects the actual implementation (nested predicate group with its own `and`/`or` mode, items typed as `FilterItem[]`) instead of the stale "combine multiple shelf sources / `sources: ShelfSource[]`" text. Adds a worked example showing `merge { or, [installed, nonSteam] }` for a single shelf that surfaces installed Steam apps and any non-Steam shortcut.

### Fixed

- **TabMaster-fed shelves now apply sort + reverse.** When TabMaster intercepts a shelf's tab source via `getCustomFiltersAppsForContainer`, the resolver previously returned the matching app set verbatim and skipped both `applySortToIds` and the persisted `sortReverse` flag. The early-return now routes through `applySortToIds` first so user-selected sort and asc/desc inversion take effect on TabMaster-resolved shelves the same way they do on store-resolved tabs. This is what users were seeing when "alphabetical + reverse" on the "Installed" tab still showed games starting with B before U — TabMaster was answering the tab query and the resolver bypassed sorting entirely.
- **"Installed" tab shelves no longer leak Proton / Steam Linux Runtime / tools.** When the resolved tab id slugifies to `installed` or `great_on_deck`, the resolver now post-filters the candidate set to `app_type === 1` (game) or `undefined` (unknown — allowed through) AND excludes non-Steam shortcuts — matching the native SteamOS Installed tab. Applied to both the TabMaster path and the store-API path; other tab ids are untouched so users who explicitly want non-game results from a custom tab keep getting them.
- **Filter `inverted` toggle is now an icon button matching the sort-direction button.** Replaces the two-option dropdown ("Default" / "Negar") with a 40×40 icon-only `DialogButton` showing `=` (equals — default, inclusive) or `≠` (not-equals — inverted, exclusive). Same shape and lateral D-pad navigation as `SortDirectionButton` and the `SavedFiltersBar` icon row. New `icons.filterInvertOff` / `icons.filterInvertOn` SVGs added; `FilterEntry` row width recalculated (110px reserved for invert + delete buttons together, was 185px for the old dropdown + delete combo).
- **Saved filters can now be applied to `merge` sub-filters.** When a `merge` filter is expanded, its nested editor renders its own `SavedFiltersBar` above the children — picking a saved filter replaces the merge's `params.items` and `params.mode` with the saved group's contents, leaving the parent shelf's filter group untouched. Works recursively (a merge inside a merge gets its own bar). New optional `controller?: SettingsController` prop on `FilterPanel`, `FilterItemOptions`, and `MergeFilterOptions` propagates the controller from `EditShelfModal` / `EditSmartShelfModal` down through nested merges so the bar can call the saved-filter actions like the top-level one.
- **Missing icon on the "Top reviewed" template button.** New `ThumbsUp` SVG added to `SHELF_TPL_ICON` for the `top_reviewed` template, matching the visual style of the `steam_cloud` and `deck_verified` entries.
- **`merge` filter sub-filter editor.** Selecting `merge` as a filter type now exposes a nested `FilterPanel` for adding, editing, removing, and re-ordering child filter items — including the inner `and`/`or` mode dropdown. New `MergeFilterOptions` component ([src/components/filter/MergeFilterOptions.tsx](src/components/filter/MergeFilterOptions.tsx)) wraps a recursive `FilterPanel`, replacing the previous read-only info text in [FilterItemOptions](src/components/filter/FilterItemOptions.tsx). Children are stored in `params.items` with `params.mode` as the local combinator, matching the resolver in `evaluateFilterGroup`. Nested `merge` inside `merge` is supported and tested.
- **Non-Steam `installed` reporting (notably Unifideck).** `normalizeAppOverview` no longer trusts the explicit `installed:true` that Unifideck stamps on every shortcut it registers. Non-Steam apps now route through `isInstalledOf`, which consults the `[Unifideck] Installed` collection (membership), then `size_on_disk`, then `rt_last_time_locally_played`. Steam apps are unaffected. Fixes `PlatformAppMeta.installed` and any consumer reading `AppOverview.installed` directly.
- **Regression coverage for `merge`.** `src/test/steam/evaluateFilterGroup.test.ts` adds six cases: empty children pass through, `or` of `installed + nonSteam`, `and` intersection, inverted child negation, recursive nested merge, and explicit no-duplicates assertion.

## [2.0.0] - 2026-04-30

### Added

- **Plugin API v2 — import descriptors gain `target` + `icon` + `runImport`.** `ExternalImportTypeDescriptor` now declares which bucket it populates (`target: "shelves" | "smart_shelves"`, default `"shelves"`), surfaces an `icon` in the QAM action row, and may set `runImport` for custom UX (replacing the `parse` default-flow path when the import opens its own modal). `ParsedImport.shelves` is optional and a new `smartShelves` array lets parsers populate the smart-shelf bucket. New `getRegisteredImportTypesForTarget(target)` on the API surface and a matching internal `getExternalImportTypesForTarget` for the QAM. New `ImportMenuButton` ([src/components/qam/common/ImportMenuButton.tsx](src/components/qam/common/ImportMenuButton.tsx)) renders the registered entries: one entry → direct icon button (matches the legacy single-icon TabMaster slot); two or more → `…` overflow opens a list. Wired into both the regular shelves and smart shelves sections of [DeckQAMSettings](src/components/DeckQAMSettings.tsx).
- **TabMaster import migrated to a registered descriptor.** When TabMaster is detected, the QAM registers a built-in import descriptor with `id: "tabmaster"`, `target: "shelves"`, the existing `tabMaster` icon, and a `runImport` that opens the existing `ImportFromCustomFiltersModal`. External plugins can register additional shelf or smart-shelf importers via `__DECK_SHELVES_API__.registerImportType(...)` and they collapse together with TabMaster behind the `…` overflow when present. Translation key `import_more_options` added in all 16 locales.
- **First-party data sources registered against the public API.** Every built-in smart-shelf mode (16 ids), filter type (21 ids) and sort option (10 ids) now registers a descriptor on the same registry external plugins write to ([src/core/internalRegistry.ts](src/core/internalRegistry.ts)). Plugin authors querying `getRegisteredSmartSources()` / `getRegisteredFilterTypes()` / `getRegisteredSortOptions()` see the full surface (built-in + external) without crossing into private APIs. New helpers `isInternalSmartSource(id)` / `isInternalFilterType(id)` / `isInternalSortOption(id)` let plugins detect collisions with built-ins. The descriptive registrations are noops at resolve time — actual computation stays in the dedicated branches; a `setInternalBootstrap` slot in [pluginApi.ts](src/core/pluginApi.ts) wires the registration without an import cycle.
- **Plugin API v2 — consumer contracts wired.** `getShelves()`, `getSmartShelves()`, `getSavedFilters()`, `subscribeToShelves()`, `subscribeToSmartShelves()`, and `subscribeToSavedFilters()` on `window.__DECK_SHELVES_API__` now project the live settings snapshot into the frozen `Public*` shapes. Subscriptions are diff-gated by JSON identity, so a consumer that only watches shelves does not wake up on unrelated settings flips.
- **`hasTabMaster()` probe on the public API.** External plugins that mirror tab data can call `window.__DECK_SHELVES_API__.hasTabMaster()` to detect TabMaster and skip duplicate registrations in the picker.
- **Optional `version` field on every external descriptor type** (`ExternalShelfSourceDescriptor`, `SmartShelfSourceDescriptor`, `ExternalFilterTypeDescriptor`, `ExternalSortOptionDescriptor`, `ExternalImportTypeDescriptor`, `ExternalSavedFilterDescriptor`). Plugins that introduce additive fields can bump this so internal handlers can branch (`if ((d.version ?? 1) >= 2) ...`). Defaults to `1` when omitted; independent of the API surface `version: 2` flag.
- **Custom smart shelf mode (`mode: "custom"`).** New blank smart shelf that behaves like a regular filter-driven shelf but lives under the smart-shelf list (subject to `smartShelvesEnabled`, `smartShelvesAtBottom`, etc.). The user's `filterGroup` IS the candidate set: the resolver feeds the full app pool through `evaluateFilterGroup` + optional `sort` + `slice(0, limit)`. Picker entry "Custom / Blank" added at the top of `SmartShelfTemplateModal`.
- **Visibility window for smart shelves.** New optional `visibleHours` (array of `{ start: 0-23, end: 0-23 }` ranges, OR-combined, wrap-around supported per range) and `visibleDaysOfWeek` (array of `0..6`, 0 = Sunday) on `SmartShelfSchema`. When set, `HomeInject` filters out smart shelves outside the window so they disappear from the home; `HomeInject` also schedules a one-shot `setTimeout` to the next boundary that re-triggers shelf refresh, so visibility flips happen exactly at the boundary without polling. New helpers `isInVisibilityWindow()` and `nextVisibilityBoundary()` exported from `src/steam/smartShelves.ts`. UI controls in the Source tab of `EditSmartShelfModal`: toggle + per-range bare `Dropdown` start/end pickers with **+ Add range** / ✕ remove buttons + weekday chip toggles styled like the existing Odd/Even checkbox pattern. Layout uses `flow-children="horizontal"` for D-pad nav between hour pickers and across the 7-day grid; chips render as `DialogButton` with a checkmark `✓` indicator when active. Spare Time shelves (new and existing) come pre-populated with the resolver's hardcoded windows `[6-9, 12-14, 19-22]` and the visibility toggle starts ON; the modal also surfaces `time_of_day`'s internal hour boundaries (`5-12 → quick_play`, `12-18 → deck_picks`, `18-5 → rediscover`) as read-only context. Day-filter semantics: `undefined` = no restriction (always visible); `[]` = never visible (no allowed days). The save handler drops the field when all 7 days are checked so storage stays minimal. Sanitizer accepts both the array form and a single legacy `{ start, end }` object for forward-compat. New constants `SPARE_TIME_WINDOWS` and `TIME_OF_DAY_WINDOWS` exported. Translation keys (`smart_visible_hours_*` including `smart_visible_hours_add`, `smart_visible_days_*`, `smart_visible_day_0..6`, `smart_template_custom`, `smart_time_of_day_info_label`) shipped in all 16 locales.
- **Exposed previously-hardcoded thresholds across all 15 smart-shelf modes as tunable `smartParams`.** Every mode that internally filtered or sorted by Deck Compatibility now exposes `minDeckLevel` wired through `SMART_PARAM_DEFAULTS` + `SMART_PARAM_META`. Defaults preserve current behavior (e.g. `deck_picks` defaults to verified-only; `quick_play`/`rediscover`/`on_deck` default to playable+; modes that didn't filter by Deck default to "any"). `spare_time` additionally exposes `maxPlaytimeMinutes` (default `120`, replacing the inline literal). Translation keys for the dropdown options (`smart_deck_level_any`/`unsupported`/`playable`/`verified`) shipped in all 16 locales.
- **Per-param widget kind in `SMART_PARAM_META`.** New `kind: "slider" | "text" | "dropdown"` field (default `"slider"`) plus `options` for dropdown kinds, picked up by `EditSmartShelfModal`'s param renderer. Playtime params (`maxPlaytimeMinutes`, `minPlaytimeMinutes`) now render as numeric text fields with buffered drafts (clear/partial-edit safe, clamped on blur); `minDeckLevel` renders as a `DropdownItem` with localized option labels.
- **New "Smart filters" tab** (`SparkleIcon`) between Source and Filters in `EditSmartShelfModal`. Houses everything that's mode-specific tuning: the `time_of_day` info banner, the per-mode `smartParams` widgets, the visibility-window controls and the day-of-week chips. Source tab now contains only the always-applicable shelf controls (title / sort / limit / refresh interval / manual sort row).
- **Compact day chips.** Layout dropped the `✓` prefix and tightened padding/font (`fontSize: 11`, `padding: 2px 0`, `minHeight: 30`, `gap: 4`) so all 7 fit in one row at any modal width without truncation; active state is now indicated by a tinted background only, matching the existing pattern.

### Changed

- **Filter / Additional filters tabs use a full-width primary button and stack the warning above it.** `FilterPanel`'s "+ Add filter" button now spans the row width like the "Save current as filter" button below it, and the "complete the current filter first" message renders left-aligned on its own line above the disabled button instead of sharing a flex row. `SavedFiltersBar`'s "Save current as filter" was bumped to `width: 100%` for visual parity.
- **QA harness expanded.** New build flags (`DS_QA_SMART_SHELVES_FIXTURE`, `DS_QA_SAVED_FILTERS_FIXTURE`, `DS_QA_FORCE_HIDDEN_SHELF`, `DS_QA_SMART_SURPRISE_ME`, `DS_QA_FORCE_HOME_CRASH`, `DS_QA_FORCE_REPLACE_FAILED`) seed extra fixtures (smart shelves, saved filters, hidden shelf), force the Surprise Me path, the home `ErrorBoundary`, and the `RecentsReplaceErrorBanner` kill-switch UI. Matching `pnpm qa:*` scripts wrap the env vars and run the hard deploy. Documented in `docs/qa-manual.md §12`.
- **Modular screenshot pipeline.** New entry `scripts/devtools/deck/screenshots/run.py` plus `lib/cdp.py`, `lib/nav.py`, `lib/capture.py` (BigPicture + QAM with auto-fallback) and `scenarios/{home,qam,about,modals}.py`. Each scenario is a small function decorated with `@register("name")` so adding a capture is `pnpm run python scripts/.../run.py --only newcase` away. The new captures (`home-hero`, `home-hide-recents`, `import-overflow`, `about-filters`, `about-smart`, `about-support`) are wired as **optional** in `validate-screenshots.mjs`. The same primitives become the foundation for the planned local UI test suite. Monolithic `screenshot.py` kept as-is for compatibility.
- **Bug report template generalized to non-SteamOS targets.** `OS` field is now a dropdown (SteamOS, Bazzite, HoloISO, ChimeraOS, Other Linux, Windows, macOS, Other / Unknown), `OS version` is a free-form required field, and a new required `Steam client version` field captures the build the user is on. Replaces the SteamOS-only optional version input.
- **Backend sanitizer (`main.py`)** now preserves `visibleHours` as a list of validated `{ start, end }` ranges (each int in `[0, 23]`; legacy single-object form auto-migrated to a one-element array) and `visibleDaysOfWeek` (deduped, sorted, clamped to `[0, 6]`) per smart shelf, and accepts `mode: "custom"` in the smart-shelf mode allowlist.
- **Smart-shelf modal Filters tab renamed to "Additional filters"** (`edit_tab_additional_filters`) so it's clearer it layers on top of the mode's natural candidates. The toggle that previously gated the FilterPanel was removed — the panel is always visible now; an empty filter group simply means "no extra filters".
- **Sort dropdown in the smart-shelf editor no longer offers a "use default" option.** It now defaults to a sensible explicit sort per mode (`recent` for recency-driven modes; `playtime` for `rediscover`/`long_session`; `random` for `daily_pick`/`random_pick`; `added` for `forgotten`; `alphabetical` for the rest) via the new `DEFAULT_SORT_FOR_MODE` map in `src/steam/smartParams.ts`. Existing shelves with no sort persisted display their per-mode default in the dropdown but the persisted value stays unchanged until the user explicitly picks something.
- **Regular-shelf source dropdowns never render empty.** When the current `collectionId` / `tab` / `externalSourceId` doesn't match any discovered option (no items yet OR orphan id from a deleted source), the dropdown surfaces a localized **"Select"** placeholder entry instead of a blank selection. Collapses back to the real value as soon as one is picked or discovered.
- **Saved-filter dropdown placeholder uses "Select" / "Selecione" / per-locale equivalent** (capital first letter, no surrounding hyphens) — replaces the prior `— select —` style. New shared `select_placeholder` key reused by source dropdowns.

### Removed

- **Dead i18n keys** `smart_filter_enable` and `smart_sort_default` removed from all 16 locales (32 entries total) following the smart-shelf editor cleanup; same-as-English fallbacks across 14 locales translated (units `min`/`days`/`months`/`years`, "Roulette", a few Field-related strings).

### Added

- **Local UI test suite** (`pnpm uitests`) — runner under `scripts/devtools/deck/uitests/` reuses the modular screenshot pipeline's CDP session + navigation primitives and exercises high-level user flows (home render, QAM panel + sections, About route). Each test is a small Python function decorated with `@suite('name').test('case')` so adding coverage is trivial. Local-only — runs against a real Deck or SteamOS VM via CDP, never on CI. New `pnpm uitests:list` enumerates suites/tests; `--only suite[,suite.test]` filters.
- **Performance audit infrastructure.** New `docs/performance.md` documents measurement methodology, hot-path budgets and the wins already shipped. New `pnpm perf:bench` (`scripts/devtools/deck/perf-bench.py`) drops `performance.mark`/`performance.measure` calls into Big Picture, navigates home, and prints `mount p_avg / p_min / p_max` over N runs — usable as a stable before/after number for `[PERF]` PR descriptions.

### Fixed

- **Manual sort preview no longer scrolls the moved card off the left edge.** The `shiftAt` handler in `ManualSortRow` queried `target.offsetLeft` after a single `requestAnimationFrame`, which under React 18 batched updates can fire before the new order has committed. Reading the stale offset overshot the centering math by exactly one slot — invisible when moving right (the card just lands slightly past center) but pushed the card off-screen to the left when moving left. Replaced with a nested rAF that reads `offsetLeft` only after layout has been recomputed.
- **Library tab "installed" now matches the native SteamOS library tab** by excluding non-Steam shortcuts. Previously the in-plugin `installed` filter included locally-installed non-Steam launchers, diverging from Steam's own Installed tab. Use the dedicated `nonsteam` tab to surface those.
- **Smart shelf resolver now gives internal modes precedence over plugin-registered ones.** Previous code routed any `mode` matching an external `SmartShelfSourceDescriptor` through that plugin's resolver, even when the mode was one of our 16 built-ins. The contract is now strict: built-in ids dispatch to `resolveSmartShelf` regardless of whether an external plugin registered the same id; external resolvers fire only for genuinely external mode ids. Enforced via the new `INTERNAL_SMART_MODES` set in [src/steam/smartShelves.ts](src/steam/smartShelves.ts) consulted at the top of the smart branch in `resolveShelfAppIds`.
- **Refresh card on one shelf no longer disturbs sibling shelves.** `invalidateSmartShelfCache()` and `invalidateRandomSortCache()` now accept an optional `shelfId` and only clear entries scoped to that shelf — the per-shelf namespace is plumbed through `resolveShelfAppIds`/`resolveSmartShelf`/`applySortToIds`/`stableShuffleIds` (cache keys become `${shelfId}:…` for the smart resolver and `ds-random-${shelfId}-…` for random shuffles). Two shelves with identical mode + params (or identical id sets for random) keep independent caches and shuffles. The refresh card handlers in `Shelf.tsx` now pass `shelf.id`; the unscoped no-arg signature is preserved as a global wipe for legacy callers.

## [1.6.3] - 2026-04-29

### Added

- **Refresh card on shelves with random sort.** Non-smart shelves whose effective sort is `random` now get a trailing refresh card (mirrors smart shelves with `random_pick`/`time_of_day`/`spare_time`/`recently_played`). Clicking it clears the 24h stable-shuffle cache (`ds-random-*` localStorage keys) and re-resolves only that shelf. New `invalidateRandomSortCache()` exported from `src/steam/index.ts`.
- **Hide game names toggle (per-shelf + global).** New `hideGameNames` field on `ShelfSchema`/`SmartShelfSchema` (default `false`) and `globalHideGameNames` on `SettingsSchema`. Per-shelf toggle in the Display tab of both edit modals; global toggle in the QAM Visual section (`hide_game_names`). Render gate in `GameCard.tsx` skips the `.ds-card-label-name` element when active. Singular `hide_game_name` for per-shelf, plural `hide_game_names` for global. New controller action `setGlobalHideGameNames`. Translation keys shipped in all 16 locales.
- **Hide install indicator toggle (per-shelf + global).** New `hideInstallIndicator` field on `ShelfSchema`/`SmartShelfSchema` (default `false`) and `globalHideInstallIndicator` on `SettingsSchema`. Hides the install/download/update/play icons within `.ds-card-status` while keeping playtime visible. Per-shelf toggle in the Display tab of both edit modals; global toggle in the QAM Visual section (`hide_install_indicators`). New controller action `setGlobalHideInstallIndicator`. Translation keys shipped in all 16 locales.

### Changed

- **`flow-children` Focusable prop is now dropped on SteamOS ≤ 3.7** to avoid the `Assertion Failed: Unhandled flow-children: <value>` thrown by Steam's `library.js` on that release. The assert bubbles up through React render and Decky's ErrorBoundary catches it — leaving the QAM panel blank ([investigated via CDP on 3.7.21 — 108 captured errors / 5s](docs/cdp.md)). New helper `flowChildrenProps()` in `src/core/steamOSVersion.ts` returns either `{ "flow-children": <direction> }` (modern) or `{}` (legacy ≤ 3.7); spread onto `<Focusable>` at the call sites in `HomeInject.tsx` (column), `DeckRow.tsx` (horizontal), and `about/SupportPage.tsx` (horizontal). 3.8/3.9 behavior unchanged. Conservative on `null` (unknown OS): keeps the prop so the modern path is never regressed.
- **`getSteamOSVersion()` now resolves on SteamOS 3.7.x.** The previous chain (`SteamClient.System.GetOSVersion()` → `SteamUIStore.DeckySettings` → UA regex) all returned `null` on 3.7.21 because `GetOSVersion` doesn't exist there, the Decky settings struct is shaped differently, and the UA only carries `Steam Deck [Steam Deck Stable]/<build>` (no `SteamOS/<x.y.z>` token). Added async fallback to `SteamClient.System.GetSystemInfo()` (returns `sOSVersionId: "3.7.21"` on this release; also exists on 3.8/3.9) wired via a new exported `prefetchSteamOSVersion()` called once at plugin init in `src/index.tsx`. Subsequent synchronous calls (e.g. `useLegacyMenuFlow()` in `steamGameMenu.ts`, `flowChildrenProps()` in render paths) hit the resolved cache.
- **Menu extraction now hooks the React JSX runtime (`SP_JSX.jsx` / `jsxs`) on EVERY SteamOS version, not just `React.createElement`.** CDP probing confirmed that **both** SteamOS 3.7.21 stable AND 3.8/3.9 emit the `{overview, client}` menu via `(0, s.jsx)(<Component>, {…})` — `React.createElement` is rarely (or never) called along that path. The original strategy only patched `React.createElement`, so even though the iteration found the right `onMenuButton` fiber and invoked it, the captured component was always `null` and `showGameMenu` fell through to the DFL fallback on **every** version. New `installCaptureHooks()` helper in `src/core/steamGameMenu.ts` patches `React.createElement`, `SP_JSX.jsx`, and `SP_JSX.jsxs` together under a single capture flag and returns a `restore()` for the `finally` block. Wired into all three sites: `extractAppContextMenu` (modern), `extractAppContextMenuLegacy` (≤ 3.7), and `installPassiveMenuHook` (always-on opportunistic capture). Both 3.7 and 3.8/3.9 now resolve the native menu identically.
- **Menu extraction now dispatches to a pure port on SteamOS ≤ 3.7 (or BazziteOS / forks reporting an equivalent version).** `src/core/steamOSVersion.ts` exposes the new `isSteamOS38OrLater()` helper (consumes the previously orphan `getSteamOSVersion()`). When the helper returns `false` (explicit ≤ 3.7), `src/core/steamGameMenu.ts > showGameMenu` dispatches to a self-contained `showGameMenuLegacy` / `extractAppContextMenuLegacy` pair that mirror the original implementation byte-for-byte — own cache (`legacyCachedComponent`, `legacyCachedTemplateProps`, `legacyLastAttempt`), single preferred-document anchor lookup, no `getBoundingClientRect` rect pre-filter, no DFL.showContextMenu hook, no cross-window walk, no prewarm, and recursive retry on first-press. The modern 3.8+ path is untouched (still uses `cachedMenuComponent` + retry loop + cross-window anchor + `findCardAnchor`). The two paths share **no state** — a cache poisoning on one cannot affect the other. The DFL Menu/MenuItem fallback (Play / Properties / View Details) stays shared between both paths so any extraction or render failure still surfaces a usable menu. Detection is conservative: `null` (unknown) defaults to the modern path so regression on 3.8/3.9 is impossible.
- Backend Python sanitizer (`main.py`) preserves `hideGameNames` and `hideInstallIndicator` per-shelf and per-smart-shelf, plus their global counterparts in the settings root. Smart-shelf bool-key allowlist extended.

## [1.6.2] - 2026-04-28

### Added

- **Regression suite — 69 new tests across 6 files (full suite at 166 TS + 22 Python = 188 passing)**. Cumulative coverage targeting the surfaces required to refactor the Plugin API safely: `applyManualOrder` (mutation/dedup edge cases — [src/test/steam/applyManualOrder.test.ts](src/test/steam/applyManualOrder.test.ts)); `evaluateFilterGroup` for every filter type — installed/favorites/nonSteam/hidden mode/updatePending/isNew/deckCompatibility/playedWithinDays/playtimeRange/nameIncludes/nameRegex/cloudAvailable/controllerSupport/merge/appIdList/inverted/and-or/unknown-passthrough — [src/test/steam/evaluateFilterGroup.test.ts](src/test/steam/evaluateFilterGroup.test.ts); `resolveSmartShelf` mode-by-mode (quick_play/not_started/deck_picks/best_unplayed/non_steam) + cache identity + `invalidateSmartShelfCache` semantics — [src/test/steam/smartShelves.test.ts](src/test/steam/smartShelves.test.ts); `REFRESHABLE_SMART_MODES` membership + cross-check against `SmartShelfModeSchema` enum — [src/test/components/refreshableSmartModes.test.ts](src/test/components/refreshableSmartModes.test.ts); `pickFirstVisibleShelfId` config-order + smart-skip + null-safe + `interleaveSmartShelves` invariants — [src/test/domain/shelfOrder.test.ts](src/test/domain/shelfOrder.test.ts); `findReorderTargetIndex` horizontal/vertical hit-test + axis isolation + gap detection + `moveInOrder` no-op short-circuit — [src/test/core/reorder.test.ts](src/test/core/reorder.test.ts).
- **Minimal exports + extractions for testability** (no behavior change): `evaluateFilterGroup` exported from [src/steam/index.ts](src/steam/index.ts); `REFRESHABLE_SMART_MODES` lifted from inside `Shelf.tsx` into [src/components/shelf/types.ts](src/components/shelf/types.ts); `pickFirstVisibleShelfId` + `interleaveSmartShelves` extracted from `HomeInject.tsx` into [src/domain/shelfOrder.ts](src/domain/shelfOrder.ts); `findReorderTargetIndex` + `moveInOrder` extracted from `useContainerDragReorder` into [src/core/reorder.ts](src/core/reorder.ts) and the hook re-implemented on top of them. Production callers updated to import from the new locations.
- **Three new shelf templates surfaced in About → Shelves docs**: `docs_template_steam_cloud`, `docs_template_deck_verified`, `docs_template_top_reviewed` shipped in all 16 locales with proper translations; About page lists 11 templates (was 8, added Steam Cloud / Deck Verified / Top Reviewed). All `template_*` strings already existed; only the user-facing description keys were missing.
- **Unified CDP CLI** (`scripts/devtools/deck/cdp.py`): single-script wrapper around the Chrome DevTools Protocol covering the day-to-day debug loop on the Deck — `targets`, `eval`, `screenshot`, `console`. Friendly aliases (`bp` / `qam` / `sjc` / `mainmenu`) resolve to the right surface by title fragment, replacing the ad-hoc `tools/cdp_eval.py` + `tools/cdp_probe.py` pair for the common cases. Auto-loads `DECK_HOST` / `DECK_CDP_PORT` from the repo's `.env`. `eval` reads from stdin when expression is `-` (good for multi-line probes), prints scalars raw and objects/arrays as JSON. `console` filters to warnings/errors by default with `--all` for full firehose and `--duration N` for scripted runs. Documented end-to-end in `docs/cdp.md`; `docs/development.md` updated to point at it.
- **Regression tests for templates and schema additions** (`src/test/domain/templates.test.ts`, `src/test/domain/schemas.test.ts`): new tests pin the three Onda-4 templates (`steam_cloud`, `deck_verified`, `top_reviewed`) to their expected source shapes, assert the `recent` template uses the migrated filter source (not the broken `tab=recent`), check default-template selection, and round-trip `hideShelfTitle` / `globalHideShelfTitle` through `ShelfSchema` / `SettingsSchema` / `SmartShelfSchema`.
- **Hide shelf title (per-shelf and global)**: new `hideShelfTitle` boolean toggle on regular shelves, smart shelves, and a corresponding `globalHideShelfTitle` global. When set, the row's title block is suppressed and the cards row stays expanded regardless of the shelf's collapse state. Wired through the schema (`ShelfSchema`, `SmartShelfSchema`, `SettingsSchema`), the Python sanitizer (per-shelf preservation + global key), the controller action `setGlobalHideShelfTitle`, the QAM Visual section, and the Display tab of both edit modals (`EditShelfModal`, `EditSmartShelfModal`). Translation key `hide_shelf_title` shipped in all 16 locales.
- **About → "Learn more" section**: new section in `SupportPage` rendered above the existing Ko-fi block, with two `DialogButton`s — **GitHub** (project repo) and **Report issue / request feature** (issues page) — wrapped in a `<Focusable flow-children="horizontal">` so D-pad navigates between them laterally. The version footer now also has an inline **Other versions** link pointing at the GitHub releases page. All four URLs open via `SteamClient.System.OpenInSystemBrowser`. Translation keys `about_learn_more_title`, `about_learn_more_description`, `about_learn_more_github`, `about_report_issue`, `about_other_versions` shipped in all 16 locales.
- **Selective icons across tab strips and QAM section headers** (`src/components/icons.tsx`): new shared inline-SVG icon set in a Feather-style aesthetic — `FunnelIcon` (filters), `EyeIcon` (display), `SortIcon` (sort), `SparkleIcon` (smart shelves), `BookmarkIcon` (saved filters), `InfoCircleIcon` (about), `GearIcon` (behavior), `StackIcon` (shelves), `WandIcon` (visual global). Applied to: edit modal tabs (Filters, Display) on both `EditShelfModal` and `EditSmartShelfModal`; About tabs (Smart Shelves, Filters, Sort, About); QAM `CollapsibleSection` headers (Behavior, Shelves, Smart Shelves, Visual Global, Saved Filters). Source/Visual/Overview/How to/Shelves(About) tabs intentionally kept icon-free to avoid visual clutter. `CollapsibleSection` accepts a new optional `icon?: ReactNode` prop; tab labels use a tiny `TabLabel` component (`inline-flex` + 6px gap) cast through Decky's typed `Tab.title: string` (the runtime accepts any ReactNode).
- **Three new shelf templates leveraging existing filters/sorts** (`src/domain/templates.ts`): `steam_cloud` (Steam Cloud — `cloudAvailable` filter), `deck_verified` (Deck Verified — `deckCompatibility=['verified']` filter), `top_reviewed` (installed games sorted by `review_score`). The first two wrap their condition in `filterGroup` because `cloudAvailable` and `deckCompatibility` aren't on the flat `ShelfFilter` schema — same pattern works in the Edit modal Filters tab. Translation keys `template_steam_cloud`, `template_deck_verified`, `template_top_reviewed` shipped in all 16 locales.
- **Pre-existing utility icons consolidated into the shared module**: `CheckIcon`, `XIcon`, `ChevronIcon`, `TrashIcon` (previously inlined in `src/components/filter/utils.tsx`) and `SteamIcon` (previously inlined in `ImportFromCustomFiltersModal.tsx`) moved into `src/components/icons.tsx`. The `Chevron` duplicate in `DocAccordion.tsx` was deleted in favor of the shared `ChevronIcon`. `filter/utils.tsx` re-exports the icons it previously defined so existing imports keep working without churn. Net: 35 fewer lines of duplicated SVG markup across the codebase. Highly-contextual icons stay local and untouched: `GameCard.tsx` compat indicators (need `.ds-compat-*` classes for CSS Loader theming), `HighlightMiniCard.tsx` chevrons (specific 8×14 transparent positioning), Ko-fi heart in `SupportPage.tsx` (filled, brand-colored), the plugin logo in `index.tsx`, and the entire `templateIcons.tsx` set.
- **Plural "Hide shelf titles" label for the global toggle**: the per-shelf toggle in the modal Display tab keeps the singular `hide_shelf_title` ("Ocultar título da prateleira"), while the QAM Visual Global section uses the new `hide_shelf_titles` plural key ("Ocultar títulos das prateleiras") since the global setting affects every shelf at once. Plural key shipped in all 16 locales.

### Changed

- **i18n cleanup + translation pass**: removed 20 unused keys from all 16 locales (`about_changes_*`, `apply_globally`, `docs_filters_sort_title`, `edit_filters_na`, `filter_inverted`/`filter_max_playtime`/`filter_min_playtime`/`filter_no_items`/`filter_not_inverted`/`filter_regex`/`filter_remove`/`filter_section_title`/`filter_type_label`, `folder_label`, `game_options`, `highlight_games_list`, `highlight_specific_games_desc`, `image_not_found`, `remove_from_shelf`) — 320 line removals. Translated 380 English-fallback strings across 15 non-English locales: 16 `docs_smart_sort_*` keys (Sort: alphabetical / Sort: last session / etc.), 7 `smart_param_*` labels, `smart_refresh_interval*`, `smart_unit_months`, and 4 `docs_smart_group_*` category names. Locale files re-serialized in alphabetical order for stable diffs. Base locale at 409 keys (was 429); all 16 locales pass the `i18n.sh` consistency check.
- **`precommit` script now runs `test:all`** (Vitest + pytest) instead of just Vitest, matching the CI pipeline so a clean precommit gives the same signal as a clean CI run. CI workflow already runs both suites unrolled (TS unit tests + Python unit tests + build:release + dist + validate-compat).
- **`checks/plugins/hltb.sh` excludes `src/test/`** from the playtime-field-access scan. The check flags unguarded reads of `last_played` / `playtime_forever` / `rt_last_time_played` to prevent races with HLTB's data, but tests deliberately set those fields on synthetic AppOverviews to exercise filters — those reads are intentional, not unguarded production access.
- **`scripts/deploy/deploy-deck.sh --hard` now restarts `plugin_loader.service` before killing Steam.** Decky keeps the plugin's Python `main.py` module imported in memory across Steam restarts via `plugin_loader.service` — terminating Steam alone never reloads the backend. Backend edits silently fell through against the cached module (writes appeared to succeed but `_sanitize_settings` ran the old code and dropped any newly-added keys). The hard-deploy path now `systemctl restart plugin_loader.service` first (using `DECK_SUDO_PASS` from `.env`) so Python re-imports the module before Steam comes back up. Soft deploy is unchanged.

### Removed

- **Dead code in [src/steam/index.ts](src/steam/index.ts)**: `devCacheDirty` flag was set but never read — vestige of an earlier "check dirty before write" pattern. Removed the variable + its two assignments.
- **Unused `ok` capture in [src/components/qam/modals/DeleteConfirmModal.tsx](src/components/qam/modals/DeleteConfirmModal.tsx)**: `const ok = await actions.removeShelf(...)` was assigning to a never-read local. Replaced with `void actions.removeShelf(...)`.

### Fixed

- **Featured cards (highlight first / highlight all / highlight specific) no longer keep their label visible when unfocused** ([src/components/shelf/shelfStyles.ts](src/components/shelf/shelfStyles.ts)). The rule `.ds-card.ds-card--featured .ds-card-label { opacity: 1 !important; }` forced the title + status line opaque on every featured card regardless of focus, so a row of highlighted cards rendered every label simultaneously instead of only the focused one's. Removed the override — featured cards now follow the same `.gpfocus` / `:focus` / `:hover` opacity rule as portrait cards. Native font sizing for featured labels stays untouched.
- **"Recently played" template now opens with the right source in the edit modal** (`src/domain/templates.ts`, `src/store/settingsStore.ts`, `main.py`): the template was using `source: { type: "tab", tab: "recent" }` but `listLibraryTabs()` only exposes `[all, favorites, installed, hidden, nonsteam]` — so a shelf created from this template couldn't match its tab in the edit modal's dropdown and visibly fell back to the first option. Template replaced with `source: { type: "filter", filter: { sort: "recent" } }` (semantically equivalent and round-trips cleanly through the modal). Migration runs on three layers so users with existing affected shelves get the fix automatically: (a) backend `_sanitize_settings` rewrites the source on every load, (b) frontend `migrate()` runs on every `normalize()` (backend response) and `readCache()` (localStorage payload) so a stale cache snapshot can't keep the broken source alive, (c) settings cache key bumped from `v2` to `v3` and v2 is removed on first read, forcing a clean refetch after upgrade.
- **Preview row no longer clips the focused mini-card glow or the green selection outline at the FieldContainer boundary** (`src/components/qam/modals/editShelf/HighlightMiniCard.tsx`, `src/components/ui/FieldContainer.tsx`): the parent `FieldContainer` (with `overflow-y: auto` and a clamped `maxHeight`) was cutting the Decky Focusable focus glow AND the 2px green selection outline that render outside the card's bounding box. `scrollIntoView({ block: 'nearest' })` couldn't fix it because the algorithm bails up the ancestor chain as soon as the nearest scroll container reports "already visible" — and `HighlightRow`'s overflow-y:hidden + extra row padding made the row appear to "contain" the card vertically even when the outer FC was the one actually clipping (`scroll-margin-bottom` on the inner element was also ignored for the same reason). Replaced the bail-prone `scrollIntoView` call with a direct FieldContainer-relative overflow calc — measure `targetRect.bottom + 32` against `el.bottom` and adjust `el.scrollTop` by exactly the gap. Added `padding-bottom: 36px` to the scrollable FC so the calc always has somewhere to scroll to (without that padding FC could be at scrollMax with the focused card flush against the visible bottom edge). Kept `scrollMarginBottom: 32` on the mini-card as a defensive fallback for any future code path that does end up calling `scrollIntoView`.
- **Hero label aligned with focused card's left edge** (`src/components/shelf/HeroBackground.tsx`): the ArtHero hero label overlay had a hard-coded `Math.max(40, ...)` floor on its `left` position, so when the row's first card sat closer than 40px from the viewport edge (e.g. ArtHero theme pulls the recents row left), the label was offset 16px to the right of the card. Floor changed to 0 across the three call sites that compute it (focusin handler, row-scroll listener, label snapshot effect).
- **Hero label keeps up with focused card on wrap-around / matchNative remeasure** (`src/components/shelf/HeroBackground.tsx`): the focusin handler read `getBoundingClientRect().left` synchronously, but the focused card is mid-animation at that point (Steam's `centeredScrollLeft` is still settling, or a `matchNativeSize` remeasure just changed dims). The read returned the stale x and the label visibly trailed the card. Now wrapped in `requestAnimationFrame` so the read happens after layout settles; the existing `onRowScroll` listener still tracks frame-by-frame mid-flight.
- **Preview row no longer clips the focused mini-card's bottom edge** (`src/components/qam/modals/editShelf/HighlightRow.tsx`, `ManualSortRow.tsx`): both rows used `padding: '8px 0'` with `overflow-y: hidden`, but the Decky Focusable focus glow extends ~24px past the card's bottom — half of it was getting cut. Bottom padding bumped to 28px (`padding: '12px 0 28px'`) so the glow fits within the row's clip box. `overflow-y` stays `hidden` because Chromium computes it to `auto` whenever `overflow-x` is `auto` and a vertical scrollbar would briefly appear on focus.

## [1.6.1] - 2026-04-27

### Added

- **Plugin API v2** (`src/core/pluginApi.ts`, `version: 2`): expanded `window.__DECK_SHELVES_API__` with new registries — `registerSmartShelfSource`, `registerFilterType`, `registerSortOption`, `registerImportType`, `registerSavedFilter`, plus matching `getRegistered*` enumerators. v1 surface (`registerShelfSource` / `getRegisteredSources`) preserved unchanged. Registered smart sources, filter types, and sort options are wired into the live resolver paths — registering them is enough to make them work for shelves, filter groups, and sort dropdowns. Consumer-side contracts (`getShelves`, `getSmartShelves`, `getSavedFilters`, `subscribeTo*`) are defined as stable types but stubbed for now (return empty / no-op cleanup); concrete data feed lands in a follow-up release. Comprehensive guide in `docs/plugin-api.md`.
- **CSS Loader / ArtHero coexistence**: new `src/core/cssLoaderDetect.ts` exposes `isCssLoaderActive()`, `isArtHeroActive()`, and `getNativeRecentsClassName(mountEl)` reading `<style class="css-loader-style">` tags in the active document. When `hideRecents=true` and a CSS Loader theme is active, `HomeInject` adds `data-ds-recents-slot="true"` plus the live native-recents wrapper class (read from `mountEl.previousElementSibling`) to the first DS shelf so theme rules targeting the recents wrapper also style the promoted shelf. The class assignment is purely additive — `ds-*` classes are never stripped.
- **ArtHero hero label overlay** (`src/components/shelf/HeroBackground.tsx`): when ArtHero-family theme is active and our shelf is promoted, the focused card's `.ds-card-label` DOM is cloned into a `position: fixed` overlay above the row, mirroring the native ArtHero label behavior (font sizes 22px / 14.7px, status icon hidden when game is installed without pending update, label tracks the focused card horizontally). Render reactive to runtime CSS Loader toggles via `MutationObserver` on the Big Picture document's `<head>`. Hero stays on the last focused card when focus briefly leaves (no focusout-hide), matching native behavior. Hero updates are gated to the first/promoted shelf only — focusing cards in shelves below no longer hijacks the hero art.
- **Hero height tracks shelf via ResizeObserver** (`src/components/shelf/HeroBackground.tsx`): replaces the previous MutationObserver-only approach so style-driven height changes (e.g. ArtHero's `height: calc(100vh - 56px)` toggling on/off) update the hero in real time without requiring a Steam restart or recents-toggle cycle.
- **TiltedHome compat** (`src/components/shelf/shelfStyles.ts`): when a CSS Loader theme defines `--ren-tilt-angle` on `:root`, the entire `.ds-card` (image, label, badges, focus glow, MoreCard, RefreshCard) tilts as a parallelogram matching native TiltedHome. Focus state composes `skew(angle) scale(1.02) translateZ(15px)` with `!important` to win over Steam's higher-specificity `.BasicUI .NATIVE.Focusable:focus { transform: translateZ(15px) }` rule, preserving both the depth lift and our skew. Selector covers `.gpfocus` / `.is-selected` / `:focus` / `:hover` (intentionally omitting `.gpfocuswithin` — that class fires on every card whenever a descendant of the row has focus, so including it would scale every card and erase the focus indicator). Zero cost when no theme is active: `var(--ren-tilt-angle)` without fallback makes the entire `transform` invalid and dropped.
- **Refresh card on smart shelves** (`src/components/shelf/RefreshCard.tsx`, `src/components/Shelf.tsx`, `src/components/DeckRow.tsx`, `src/components/shelf/types.ts`): smart shelves with a refreshable mode (`random_pick`, `time_of_day`, `spare_time`, `recently_played`) get a trailing **Refresh** card instead of view-more-in-library — clicking it calls `invalidateSmartShelfCache()` + `resolveRef.current()` to re-resolve THIS shelf only, with no global cascade. Smart shelves with deterministic modes (Daily Pick, Quick Play, Best Unplayed, Deck Picks, On Deck, Long Session, Not Started, Non-Steam, Forgotten, Interrupted, Rediscover) drop the trailing card entirely — view-more would mislead (smart resolvers can't be opened in the library directly) and refresh would be a no-op against stable app data. Non-smart shelves keep the view-more card.
- **Refresh icon spin animation** (`src/components/shelf/shelfStyles.ts`, `src/components/shelf/RefreshCard.tsx`): on click, the refresh icon performs a 360° spin via CSS keyframes (`@keyframes ds-refresh-spin`, 700 ms) triggered by adding the `ds-refresh-spinning` class on `iconRef` directly through DOM manipulation rather than React state. CSS-driven animation survives the upstream `setAppIds()` reconciliation that would otherwise cancel a state-driven animation; consecutive clicks restart from 0deg via remove + reflow + add. Icon redesigned as a balanced 4-path Feather-style refresh symbol (44px, `strokeWidth: 2`, gap 16px to label).
- **Smart shelf refreshable mode classification**: `REFRESHABLE_SMART_MODES` in `src/components/Shelf.tsx` enumerates the 4 modes whose result can change between two clicks (random shuffle, time-window switch, sliding cutoff). Documented rationale per mode in inline comment.
- **`refresh` translation key** in all 16 locales (`Refresh` / `Atualizar` / `Actualizar` / `Aggiorna` / `Actualiser` / `Aktualisieren` / `Обновить` / `Odśwież` / `Vernieuwen` / `Yenile` / `Оновити` / `更新` / `새로고침` / `刷新` etc.).
- **HeroBackground auto-disable on ArtHero**: when an ArtHero-family theme is active at mount, `HeroBackground` returns `null` to avoid stacking our zoom/brightness/saturate animation on top of the theme's own hero image.
- **`checks/plugins/cssloader/arthero.sh`**: static validator for ArtHero coexistence — checks the detection helper, HeroBackground guard, additive class promotion, runtime DOM read (no hardcoded native token), `css-loader-style` probe, and the four scope invariants of the recents-slot promotion (hideRecents required, first shelf only, CSS Loader required, render gate).

### Changed

- **First-visible-shelf scan now uses CONFIG order, not DOM order** (`src/components/HomeInject.tsx`): `firstVisibleId` walks `shelves` in user-config order and picks the first non-smart shelf currently rendered (has `data-shelfid` in DOM). Two reasons: (1) skip empty/unresolved shelves so a 0-apps first shelf does not get promoted while the next shelf's content sits below, with the empty shelf's title still nominally claiming the slot; (2) keep the candidate stable regardless of which shelf finishes resolving first — pure DOM-order scans pick the fastest resolver, often a non-Steam / smaller shelf instead of the user's intended first shelf.
- **Modal layout responsive to viewport**:
  - `EditShelfModal` and `EditSmartShelfModal` tab-content height changed from fixed `410px` to `min(calc(100vh - 220px), 720px)` with `min-height: 360`. Modals now scale with viewport: ~410-580 on Steam Deck (800px), grows up to 720 on larger screens.
  - `FieldContainer` `maxHeight` (when `scrollable`) changed from fixed `370` to `min(calc(100vh - 280px), 660px)` for the same reason.
  - `FieldContainer` horizontal padding changed from `0 24px` to `0 42px` to match Decky `Field`'s expected parent padding (Decky fields use `width: 100%+84px` with `margin: -42px` each side — designed for 42px-h-padded parents). Source/Visual tabs (scrollable, `overflowX: hidden`) were clipping field content by 18px each side because the negative margin pushed content past our edge; 42px lands fields flush within FC bounds.
- **Refresh card visual feedback decoupled from React state**: previous spin animation lived in component state (`useState(spinning)`) and was cancelled mid-flight when upstream `setAppIds()` reconciled the row. Replaced with DOM class toggle on `iconRef` so the CSS keyframes run independently of React.

### Fixed

- **Vitest cannot resolve `@decky/manifest`** (`vitest.config.ts`, `src/test/stubs/`): `@decky/api`'s ESM index does `import _manifest from '@decky/manifest'` — that package is virtual, injected by Decky's build pipeline at compile time. In Node/Vitest the resolver can't find it and any test transitively touching `settingsStore.ts` fails to load. Added `resolve.alias` for both `@decky/manifest` (default-export stub) and `@decky/api` (function/object stubs covering the symbols imported at module-load time). Stubs scoped to `src/test/stubs/` so production build still uses the real `@decky/api`.
- **Smart shelves no longer get a misleading view-more card**: Daily Pick, Quick Play, Best Unplayed, etc. previously showed a view-more-in-library trailing card whose target route doesn't exist (smart resolvers are heuristics, not collections). Now those shelves end at the last game; only refreshable modes show the refresh card.
- **`navigateToShelfSource` restored to v1.5.x behavior**: collection → `/library/collection/<id>` (with fallback paths and DOM link click), tab/filter/default → `/library`. The `reopenHome` nav-cycle attempt was abandoned — `/library` is the canonical "open the library" route in Big Picture and Steam routes it to whichever library view the user was last on.
- **Focus indicator now visibly differentiates the focused card**: removed `.gpfocuswithin` from the focus selector — that class is added to every card in a row whenever any descendant has focus, which previously caused all cards to render at scale 1.02 with translateZ, erasing the focus indicator. The truly focused card (`.gpfocus` / `.is-selected` / `:focus` / `:hover`) now gets the scale + lift exclusively.
- **Tilt focus glow follows the parallelogram outline**: with the skew applied to the entire `.ds-card`, the focus state's `box-shadow` (drop shadow + 2px ring) is rendered in the element's transformed paint layer — the ring traces the parallelogram edges rather than a rectangular bounding box. Native TiltedHome aesthetic preserved end-to-end.

## [1.6.0] - 2026-04-24

### Added

- **Template picker grouping**: normal and smart shelf template pickers are now grouped into collapsible categories (By Status, By Time, By Compatibility, By Platform, Other) with per-category collapse state.
- **Highlight specific games**: a shelf can now highlight individual games by `appid`. Enable via the "Highlight specific games" toggle in the shelf editor's Visual tab; an expandable "Game list" accordion then shows a full-width checklist of every game in the shelf, with a count of selected items. Stored as `highlightedAppIds` and applied per-card alongside existing `highlightFirst` / `highlightAll`.
- **Cloud saves filter**: new `cloudAvailable` filter type — matches games with Steam Cloud support. Invertible.
- **Controller support filter**: new `controllerSupport` filter type — matches games with partial or full controller support (`nControllerSupport >= 1`). Invertible.
- **Manual sort**: new `"manual"` option in the sort dropdown of the shelf editor. A shelf set to manual uses the optional `manualOrder: number[]` field to reorder its resolved app ids, falling back to natural resolve order for any id not in the list. The reorder UI appears inside the Source tab right below the sort dropdown (only when manual sort is active), using the same horizontal mini-card row as the highlight preview and reflecting the active visual toggles (featured tiles for `highlightAll` / `highlightFirst` / `highlightedAppIds`). Each card shows transparent SVG chevron arrows vertically centered on its left/right edges — clicking a chevron shifts the card by one position. Gamepad: focus a card and press **A** to enter grab mode (yellow outline); **D-pad / left stick left-right** shift the grabbed card; **A** again confirms and releases the grab. While grabbed, `FocusNavController.DispatchVirtualButtonClick` is intercepted so L/R directly shift the card and U/D are swallowed before Steam can move focus — so pressing **A** after many shifts reliably exits grab instead of accidentally activating Save/Cancel. Pointer/touch: **click-and-hold or touch-and-hold** (~300 ms) enters grab mode and live hit-tests the pointer over other cards to reorder while dragging; releasing drops in place. For runtime render, filter-sourced shelves read sort from `shelf.source.filter.sort` with priority over `shelf.sort`. The shelf's resolve/re-resolve `useEffect` now also depends on `shelf.manualOrder` so saving a new order without changing the sort or source immediately re-resolves on home (previously the callback closure kept the stale order). The existing QAM up/down shelf-reorder buttons are untouched — both paths coexist. Manual order persists through the Python sanitizer (new `manualOrder` shelf field).
- **Manual base sort**: when a shelf is set to manual sort, an additional dropdown appears to choose the **base ordering** used for items not covered by `manualOrder`. All sort modes except `manual` itself are selectable; default is alphabetical. For filter-sourced shelves the base sort is applied by cloning `source.filter.sort` at resolve time (since filter shelves read sort from the source object rather than the third `resolveShelfAppIds` arg). The shelf's resolve cache key includes `manualBaseSort` so changing the base invalidates cached ids.
- **Unified drag-to-reorder controller** (`src/core/reorder.ts`): new `useContainerDragReorder<T>` hook centralizes the pointer-hold drag logic (300 ms timer + 8 px move-cancel threshold + pointer-type allowlist + axis-aware hit-test) so the same implementation serves the manual-sort mini-card row, the QAM shelf list, and the Home shelf-title drag. Gamepad grab (A / L/R / A) stays scoped to ManualSortRow where `FocusNavController` interop is required.
- **Home shelf-title drag**: holding a regular-shelf title on the home screen for ~300 ms with mouse or touch enters drag mode; dragging over another shelf's title row reorders live, release commits. Restricted to `pointerType: mouse | touch` so D-pad navigation is untouched. Smart shelves are excluded (their position is controlled by `smartShelvesAtBottom`).
- **QAM shelf list drag**: pointer-hold drag added to the QAM shelf rows, **coexisting** with the existing move-up / move-down buttons — both paths work, pick whichever is faster. Each row gets a `data-ds-shelf-row` tag for hit-test. Grabbed row shows the amber outline used by the manual-sort mini-cards.
- **Saved filters**: EditShelfModal's Filters tab gets a `SavedFiltersBar` at the top — a dropdown to apply a saved filter group to the current shelf, plus a "Save current as filter…" button that prompts for a name and persists the current `filterGroup` for reuse. The QAM grows a collapsible **Saved filters** section (hidden when empty) listing each entry with inline **Rename** (opens a TextField) and **Delete** buttons. Persists through the Python sanitizer as `settings.savedFilters: { id, name, group }[]`.
- **Edit smart shelves**: smart shelves now have a full edit modal (not just template picker). Supports overriding the mode's natural sort with any of the standard sort options (including manual + `manualOrder` + `manualBaseSort`), applying **additional filters** on top of the mode's candidates via `FilterPanel`, editing title + limit, and the full visual/display customization surface (match native size, highlight first/all, highlight picker with odd/even patterns, hide status line / new badge / compat icons / non-steam badge). All fields are optional; when absent the mode renders exactly as before.

### Changed

- **Scoped import / export**: the shelves import/export now covers **only shelves** instead of the full settings file. Smart shelves get their own import/export buttons next to "Add smart shelf", writing / reading the smart subset (shelves, enabled, atBottom, surprise-me config). A new general import/export pair sits at the bottom next to the reset button, covering the full settings. All three scopes share the same `ExportModal` / `ImportModal` via a `scope: 'all' | 'shelves' | 'smart'` prop; each writes / reads through a generic `write_json_file` / `read_json_file` backend helper pair. Reset is now icon-only on the right of that same row, import/export on the left — matching the shelves-row pattern.
- **Scoped reset buttons**: shelves section and smart shelves section each gained an icon-only reset button on the right (after TabMaster when installed). `ResetAllModal` now takes a `scope: 'all' | 'shelves' | 'smart'` prop and dispatches to `actions.resetShelves` / `actions.resetSmartShelves` / `actions.resetAll`. Smart shelves reset also disables smart features and clears surprise-me config.
- **QAM collapsible header focus highlight**: the rounded corners on the focus highlight were removed — the background fill now matches the header's rectangular bounds for consistency with other QAM sections.
- **Highlight specific games picker layout**: replaced by a live horizontal mini-preview of the shelf that matches real-shelf rendering — each game uses the same fallback chain (`customimages` → `portraitUrl`/`heroUrl` → local `/assets/{appid}/*` → Steam CDN). The preview is always visible and reacts to all three highlight toggles: `highlightFirst` makes the first tile featured, `highlightAll` makes every tile featured, and toggling "Highlight specific games" ON unlocks per-tile selection; when OFF the preview remains scrollable and focusable but tiles are non-interactive (no click, default cursor). Individual selections are preserved across toggle on/off within a session — the state is only saved to disk when the toggle is ON, so turning it back on restores previous picks. Selected tiles carry the same `CheckIcon` (green `#4caf50`) used by the filter accordions. Games with no image fall back to the same gradient placeholder as real cards, with the game name centered. Horizontal focus navigation auto-centers the focused card using the same `requestAnimationFrame` + 100ms throttle + catch-up pattern as the home shelves, so holding the d-pad scrolls smoothly without queue lag.
- **Preview rows aligned with surrounding fields**: the `HighlightRow` (Visual tab) and `ManualSortRow` (Source tab when manual) now use `margin: 0 -24px` + `padding: 0 24px` to match Decky's `Field` / `DropdownItem` negative-margin footprint. The odd/even pattern grid uses the same alignment. Cards and toggles above / below the preview line up horizontally instead of being inset by the container padding.
- **Preview re-centers on layout change**: clicking a chevron to shift a card in the manual-sort row explicitly re-centers the shifted card via `scrollTo({behavior:'smooth'})`; toggling a card to featured (which widens it from 68 → 210 px) triggers a re-center on the focused card in the highlight preview so it doesn't slide out of view when neighbors reflow. Focus-centered scroll continues to handle `focusin` moves as before.
- **Edit modals share a component library**: `EditShelfModal` and `EditSmartShelfModal` now both compose the same pieces from `src/components/qam/modals/editShelf/` — `ModalHeader` (title + preview count), `VisualTabContent` (highlight toggles + pattern grid + preview), `DisplayTabContent` (hide toggles), `ManualSortRow`, `HighlightRow`, `HighlightMiniCard`, `SavedFiltersBar`, and the shared `constants.ts` / `types.ts` / `utils.ts`. The two modals still have distinct Source and Filters tabs (regular has source-type + collection/tab/external picks + `SavedFiltersBar`; smart has read-only mode display + additional-filters toggle), but every other surface is identical code.
- **Shared UI primitives** (`src/components/ui/`): new folder hosts domain-agnostic visual primitives reused across modals, the QAM panel, and the home. `ModalShell` wraps `DeckModalStyles` + the `.deck-shelves-modal-scope` class so every `ConfirmModal` gets consistent styling without each file importing both. `FieldContainer` replaces the repeated `<div className='field-item-container' style={{ padding: '0 24px', boxSizing: 'border-box', ... }}>` with an optional `scrollable` prop for tabs that need `maxHeight: 400 + overflowY: auto`. `LabeledTextField` bundles `Field + TextField` with the Decky `textFromDeckyChange` normalization. `CollapsibleSection` moves out of `DeckQAMSettings` with its localStorage-persisted open state intact. All eight modals (`EditShelfModal`, `EditSmartShelfModal`, `ExportModal`, `ImportModal`, `TemplatePickerModal`, `SmartShelfTemplateModal`, `ExportAndClearModal`, `ImportFromCustomFiltersModal`) switched to `ModalShell`; the edit modals plus `VisualTabContent` / `DisplayTabContent` switched to `FieldContainer`; `ModalHeader` switched to `LabeledTextField`; `DeckQAMSettings` imports `CollapsibleSection` from `ui/`.
- **Modal content fits without lateral clipping**: the shared `FieldContainer` padding bumped from `0 16px` to `0 24px` (plus `box-sizing: border-box`) so Decky's `Field` / `DropdownItem` negative margins land exactly at the container edges — previously the 8 px mismatch on each side clipped dropdown and toggle content.
- **Shelf editor modal footer & content sizing**: the `BottomButtons` save/cancel bar is now compacted via CSS (`padding-top`/`padding-bottom` reduced on the container and buttons). Tab content area bumped to 440px (outer) with the Source/Visual container using `maxHeight: 400` + `overflowY: auto`.
- **Developer filter layout**: the developer checklist switched from a vertical list of `ToggleField` rows to a 2-column grid of `DialogButton` tiles with a ✓/· indicator.
- **TabMaster import layout**: tabs are split into collapsible "Tabs" (visible) and "Hidden" sections with a 2-column grid of tiles inside each. A Steam logo icon is shown to the left of Steam-native entries (tabs with no TabMaster filters), matching the TabMaster UI convention.
- **DeckRow / ShelfView memoization**: both components wrapped in `React.memo` with default shallow compare. `rowItems` is already memoized in `ShelfView` via `useMemo`, so unrelated parent re-renders (e.g. toggling an unrelated QAM switch that rebuilds `ShelvesContainer`) no longer cascade into every shelf's full render pass.
- **`navPatches.ts` split into `src/components/home/navPatches/`**: `reparent.ts`, `menuButton.ts`, `edgeNavigation.ts`, `verticalBridge.ts`, plus shared `constants.ts` and `index.ts` barrel. The old `navPatches.ts` file is now a pure re-export so every existing import path keeps working. No logic changes — pure mechanical separation.
- **`reparentOnly` safety-net poll throttled from 750 ms to 3 s**: the stability guard short-circuits when the nav-tree position is already correct, so the wake-ups were near-zero work — but still firing 80×/minute for no measurable benefit. MutationObservers + `focusin` + `popstate` / `hashchange` already cover every real reparent trigger; the interval is now a sparse backstop. 4× fewer wake-ups in steady state.
- **Shelf resolve: generation-id cancellation**: `ShelfView` now stamps every `resolve()` call with a monotonically increasing id in `resolveGenRef`, and each in-flight `resolveShelfAppIds` promise bails on completion if the id has advanced. Rapid settings changes (e.g. user toggling sort multiple times) no longer let a slow earlier resolve overwrite a newer one.
- **`scripts/deck/perf-stress-scroll.sh`**: CDP-driven stress harness that zig-zag scrolls through shelves via `FocusNavController.DispatchVirtualButtonClick` for N minutes. Pairs with `perf-test.sh --compare` to measure CPU / battery impact under sustained interaction load.
- **Issue templates labels**: bug / enhancement / feature templates add `triage` alongside their category label so new issues land in a single review queue.
- **Dead-code cleanup**: removed `lastReparentTarget` write-only variable in the reparent patch, unused `Field` import in `EditShelfModal`, unused `getPreferredSteamDocument` import in `shelf/cardUtils`, unused `beforeEach` import in a webpack-compat test.

### Fixed

- **Menu button unresponsive after Steam Deck restart** (#25): the interceptor was querying only the preferred Steam document for `.ds-card.gpfocus`, but `DispatchVirtualButtonClick` fires from SharedJSContext while the focused card lives in the GamepadUI popup — so the fast path silently missed every card and Steam's native handler took over without rendering a menu. `interceptMenuBtn`, the document-level `vgp_onmenubutton`/`contextmenu` listeners, and `showGameMenu`'s card-anchor resolution now walk every known Steam window (via the new `getAllSteamDocuments` helper in `src/runtime/steamHost.ts`) and return the first match. `showGameMenu` also wraps the native-menu path in an outer try/catch so any extraction or render failure reliably falls through to the DFL fallback (Play / Properties / View Details) instead of leaving the menu button silent. `prewarmMenuExtraction` retries `extractAppContextMenu` at 150 / 500 / 1500 / 3500 / 7000 ms with cooldown bypassed while the cache is empty — on devices where the native `{overview, client}` menu template still exists, this populates the cache before the user ever presses the button. A second `installPassiveShowContextMenuHook` on `DFL.showContextMenu` opportunistically captures the native menu factory whenever Steam renders one elsewhere (e.g. the library game detail view), so the "real" menu becomes available for subsequent ds-card presses without requiring a synthetic extraction. New helper `src/core/steamOSVersion.ts` (`getSteamOSVersion`, `isSteamOS39OrLater`) reads `SteamClient.System.GetOSVersion`, falling back to `SteamUIStore.DeckySettings` and the User-Agent — kept conservative (no heuristic forced by API absence) so extraction always runs when the template is present.
- **DOWN scroll tilt with `hideHomeTabs=true`**: pressing D-pad DOWN on the last shelf when the native tab bar is hidden could trigger a visual wrap/tilt as Steam looked for something below. `patchShelfEdgeNavigation` now intercepts `BTryInternalNavigation(DIR_DOWN)` at the nav-tree prototype level and returns `true` when focus is inside the last DS shelf and the `[role="tablist"]` is not visible — complementing the existing `installVerticalFocusBridge` post-nav guard with a preventative stop at the source.
- **Manual base sort not applied on filter shelves**: filter shelves read sort from `source.filter.sort` so the third arg to `resolveShelfAppIds` was a no-op. `Shelf.tsx` now clones the source and swaps `filter.sort` to the configured `manualBaseSort` before resolving, and the preview inside the edit modal mirrors the same swap so the mini-card row matches the home render. Base sort persists through the Python sanitizer (validated against the sort whitelist, `manual` excluded).
- **Decky TextField onChange signature**: `SavedFiltersBar` and the QAM saved-filters list previously used `e.target.value` (browser-native event shape) which crashed the modal / section when the text input was opened. Both now use the `textFromDeckyChange` helper already used by the import/export modals.
- **Translations for new UI**: `saved_filter_apply`, `saved_filter_placeholder`, `saved_filter_save_current`, `saved_filter_save`, `saved_filters_section`, `saved_filter_rename`, `saved_filter_delete`, `saved_filter_empty`, `manual_base_sort`, `smart_mode`, `smart_sort_override`, `smart_sort_default`, `smart_filter_enable` added to all 16 locales (en-US, pt-BR, pt-PT, es-419, es-ES, de-DE, fr-FR, it-IT, ja-JP, ko-KR, nl-NL, pl-PL, ru-RU, tr-TR, uk-UA, zh-CN).
- **Collapsed state preserved when a shelf takes the native-recents slot**: previously, when `hideRecents=true` promoted a shelf to be the first row, `DeckRow` wrote `ds-collapsed-{id}=false` to localStorage — destroying the user's choice if they'd collapsed that shelf manually. The shelf now renders expanded purely via derived state (`collapsed = forceExpanded ? false : collapsedState`); the persisted value is untouched, so the shelf returns to its original collapsed/expanded state as soon as it loses the slot.
- **`forceExpanded` now targets the first *visible* shelf, not just the first array entry**: `ShelvesContainer` previously passed `forceExpanded={idx === 0}`, so if `shelves[0]` resolved to zero apps and rendered `null` (common on empty-state filters like "pending updates"), no shelf got promoted to the native-recents slot. A lightweight `MutationObserver` on the mount now tracks which `.ds-shelf[data-shelfid]` is actually first on screen; `forceExpanded` is applied by shelf id, re-targeting automatically when the first-visible set changes.
- **Top-aligned scroll for the promoted first shelf**: `DeckRow`'s focus-in scroll tries to center the focused shelf, but the promoted first shelf (taller than half the viewport due to the hero) had its bottom clipped because `scrollTop` clamps to 0 while trying to center. When `forceExpanded=true`, the effect now scrolls so the shelf's top lands at the viewport top (respecting its own `scrollMarginTop`) — matching the native recents geometry and avoiding the clip when navigating UP into it from below.

## [1.5.3] - 2026-04-22

### Added

- **Smart Shelves about tab**: dedicated "Smart Shelves" tab in the About page, separate from the main Shelves tab. Lists all 15 smart templates grouped by category with sort/timing notes per template.
- **Sort about tab**: dedicated "Sort" tab in the About page, extracted from the Filters tab. Lists all 8 sort modes with descriptions.
- **Overview tab i18n group labels**: feature groups in the Overview tab are now i18n keys translated across all 16 locales.
- **DocCallout labels i18n**: "NOTE", "TIP", "CAUTION" callout labels are now i18n keys translated in all 16 locales.
- **Overlay native recents menu button**: pressing the menu/options button on a focused native-overlay card now opens the game context menu via tracked `onItemFocus` appid.
- **Overlay restart recovery**: bootstrap timers extended to 15s; periodic 2-minute refresh re-kickstarts overlay when no cached ids; resume-from-suspend hook re-kickstarts overlay after wakeup.

### Fixed

- **Native recents overlay hero art stale after substitution**: `showFeaturedItem` is set from the shelf's highlight toggles and `onItemFocus` is invoked with the first game's overview after mutation, forcing the hero background to match the new first game instead of keeping the previously focused one.
- **Native recents overlay abrupt focus transitions**: L2/L3 `afterPatch` callbacks were stacking on shared memo/forwardRef wrappers across every re-render, multiplying mutation runs per cycle and breaking the native cross-fade. A `WeakSet` now dedupes the patched component types.
- **Context menu broken on SteamOS 3.9**: any render failure in `showGameMenu` now clears the cached menu component and template props so the next invocation re-extracts against the current Big Picture bundle. The previous selective error-message filter missed SteamOS 3.9's error phrasings, leaving stale cached props in use.
- **Collapsible QAM sections gamepad selection highlight**: focus CSS added to the collapsible header so it shows a selection state when navigated with a gamepad.

## [1.5.2] - 2026-04-21

### Added

- **Sort for collection, tab and external shelves**: the sort dropdown (alphabetical, last session, total playtime, release date, size on disk, Metacritic, Steam review score, recently added, random) is now available for all shelf source types, not only filter shelves. Sort is shown in the source tab of the shelf editor and saved per shelf. Default remains alphabetical (no extra field stored).
- **Random sort**: new `random` sort option available for all shelf types — games are shuffled via Fisher-Yates on every resolve.
- **Surprise Me slider count**: the slider label in the QAM now shows the current count in parentheses when it is greater than zero (e.g. "Surprise Me (3)"), making the configured value readable without opening the slider.
- **Select shelf for native recents replacement**: when "Use shelf as Recents" is enabled, a new dropdown lets you pick any specific shelf instead of always using the first visible one. Defaults to "First visible shelf" when no shelf is selected.
- **SteamOS 3.9 compatibility check** (`checks/steamos/steamos-3.9.sh`): new validation script covering ES2020+ target, `@decky/api` v3, no legacy `ServerAPI`, duck-typing patterns, `FocusNavController`/`GamepadUI` usage, `vgp_*` events, `afterPatch`/`findInReactTree`, `DECKY_PLUGIN_SETTINGS_DIR`, Python 3.10+ patterns, and no hardcoded SteamOS version strings. `steamos-gamepadui.sh` updated to cover 3.5–3.9.
- **GitHub issue templates**: added `[BUG]`, `[FEATURE]`, and `[ENHANCEMENT]` issue templates under `.github/ISSUE_TEMPLATE/`, each with a "Related PRs" field for linking 0–n pull requests.
- **Native recents `showFeaturedItem` respects shelf toggles**: when a shelf is used as native recents replacement, `showFeaturedItem` is now set based on `shelf.highlightFirst` / `globalHighlightFirst` instead of always defaulting to the native `true`. Disabling both toggles hides the hero-sized first card; enabling either shows it.

### Fixed

- **Collections not loading in shelf editor**: `listCollections` now reads from `collectionStore.m_mapCollectionsFromStorage` (a MobX ObservableMap with `.keys()` / `.get()`) as a fallback when `userCollections` is unavailable or throws. Collection objects from this map lack a top-level `id` field — the map key (`m_strId`) is injected explicitly before passing to `normalize`.
- **Non-Steam apps in native recents replacement**: shelves containing non-Steam shortcuts (app type `1073741824`) are now passed through to the native recents component instead of being pre-emptively blocked. If the native component crashes, the existing error trap still triggers `markReplaceFailed` and the error banner is shown. Fully native (no non-Steam apps) shelves continue to work as before.
- **Hero art bottom fade regression**: restored `maskImage` / `WebkitMaskImage` on the outer `ds-hero-background` container, which was removed in v1.4.0. The native-style subtle 10% bottom fade (to page background over the last 5px) is back; the previous overlay-only approach covered 30% of the image.
- **Hero art envelope below shelf**: increased hero height to extend 60px below the first shelf (in addition to 60px above), matching the original native behavior where the art visually envelopes the shelf row from both sides.
- **Playtime not shown for non-Steam shortcuts**: removed the `isSteam !== false` guard in `GameCard` that gated the entire status/playtime block — non-Steam apps have playtime data available and it is now displayed normally.
- **Sort not applied on non-filter shelves**: `ShelfView` was calling `resolveShelfAppIds` without passing the `sort` field, and `sourceKey` did not include sort — so changing sort on collection, tab, or external shelves had no effect and did not trigger a re-resolve. Both are now corrected.
- **Non-Steam duplicate apps**: `deduplicateNonSteam` is now platform-aware — same-named shortcuts from different Unifideck platforms (e.g. "Adios" from GOG and "Adios" from Epic) are kept as separate entries; only same-named shortcuts on the same platform (true duplicates) are merged to a single entry.
- **Shelf cache missing sort key**: the per-shelf localStorage cache is now keyed by `shelf.id + sort`, so changing sort on a non-filter shelf immediately shows the correctly-ordered result instead of briefly flashing the previously-cached order.
- **`shelfKey` ignoring sort in recents replacement**: the cache key used to decide whether to re-resolve the active shelf for native recents substitution now includes the `sort` field, so changing sort on the selected shelf correctly invalidates the cache and triggers a fresh resolve.

## [1.5.1] - 2026-04-19

### Fixed

- **`highlightAll` / `globalHighlightAll` not persisting**: both fields were missing from `_sanitize_settings()` in `main.py` — they were silently dropped on every save, causing the toggles to appear to self-unmark. Per-shelf `highlightAll` and global `globalHighlightAll` are now preserved correctly; `DEFAULT_SETTINGS` updated to include `globalHighlightAll`.
- **Filter tab gamepad navigation**: filters inside the shelf editor were unreachable via gamepad. Two causes fixed — (1) `FilterSectionAccordion` wrapped both the accordion header and its expanded content in a single `Focusable` with `onOKButton`, which intercepted OK and blocked navigation into child elements; the toggle and content are now separate nodes so D-pad can reach the dropdowns and buttons inside. (2) `FilterEntry` was rendered inside a `Field`'s `description` prop, which is not part of the gamepad navigation tree; it is now rendered directly.

### Changed

- **i18n**: translated `docs_filter_developer_desc`, `docs_filter_publisher_desc`, and `docs_filter_appidlist_desc` in all 15 non-English locales — these documentation strings were previously left in English across de-DE, es-ES, es-419, fr-FR, it-IT, ja-JP, ko-KR, nl-NL, pl-PL, pt-BR, pt-PT, ru-RU, tr-TR, uk-UA, zh-CN.

## [1.5.0] - 2026-04-19

### Added

- **Highlight All**: new per-shelf toggle (`highlightAll`) and global toggle (`globalHighlightAll`) that renders all cards in a shelf as featured (landscape) cards, extending the existing `highlightFirst` behavior.
- **Publisher filter**: new `publisher` filter type — filters games by publisher name, following the same pattern as the existing developer filter (toggle list, preloaded from Steam's app details store). Includes i18n support for all 16 locales.
- **App ID list filter** (`appIdList`): new filter type matching games by explicit app IDs (comma-separated text field). Equivalent to TabMaster's whitelist filter. No preloading required.
- `assets/import/screenshots-en.json` — importable preset (English, 3 standard shelves + 1 hidden + 3 smart shelves) used as the canonical state for screenshot automation.
- `docs/qa-manual.md` — manual QA scenarios covering all features: enable/disable, shelf management, navigation, global toggles, smart shelves, and import/export.
- Screenshot automation: three new capture targets — `smart-shelves-qam`, `smart-shelf-modal`, and `global-toggles`.
- `src/test/qa/qam-visibility.test.ts` — vitest tests covering QAM visibility conditions for smart shelves and global toggles sections.
- CSS Loader theme compatibility study: DOM structure, native recents class chain, isolation audit (Delly, Obsidian, Metropolitan). Confirmed our `ds-*` shelves are already isolated from theme selectors; ArtHero-specific study pending device with ArtHero installed.
- **CSS Loader first-shelf slot**: when `hideRecents=true` and CSS Loader themes are active, the first shelf now receives `data-ds-recents-slot="true"` and the native recents root class (`_39tNvaLedsTrVh0fFsP4Jm`) so ArtHero and other CSS Loader themes can target it with their recents-area styles. When CSS Loader is absent the shelf keeps its normal `ds-*` appearance unchanged.

### Changed

- **QAM visibility**: Smart Shelves section and Apply Globally toggles are now hidden when the plugin is disabled (`enabled=false`). Only the main toggle and the shelf list remain visible, keeping the QAM uncluttered when shelves are off.

### Fixed

- **Navigation Bug B**: `installVerticalFocusBridge` no longer bridges focus from native tabs (below our mount) into the first shelf when navigating DOWN within tabs — only siblings above the mount trigger the bridge.
- **Navigation Bug A**: pressing DIR_DOWN from the last shelf no longer causes Steam to wrap focus back to the first shelf when `hideHomeTabs=true` leaves no visible focusable elements below — focus is now held in place via a post-nav rAF redirect.

## [1.4.0] - 2026-04-18

### Added

- **Forgotten** smart shelf template (`forgotten`): shows Steam games owned for 3+ years that have never been launched, sorted by oldest acquisition date first. Uses `rt_purchased_time` / `user_added_ts` from AppOverview. Low reliability by design — targets deep backlog clearing.
- **Spare Time** smart shelf template (`spare_time`): shows installed games with ≤2 hours of playtime, but only during three daily windows (6–9h, 12–14h, 19–22h). Resolver returns empty immediately outside those windows. Sorted by Deck compatibility then most recently played.
- SVG icons added to all standard and smart shelf template picker buttons — each button now shows a small icon before the template name for quicker visual scanning.
- In-plugin About → Shelves page now documents standard shelf templates (blank + 8 presets) before the smart shelves section.
- Surprise Me daily seed changed from UTC midnight to **local midnight** — `YYYYMMDD` integer derived from `new Date()` local calendar date.
- **Smart Shelves**: new shelf type whose content is generated automatically by library heuristics — appears on the home screen only when the heuristic returns results, disappears otherwise (no CSS hiding, uses the natural `null` render path). Toggle `smartShelvesEnabled` in the QAM enables a separate Smart Shelves section with its own template picker and reorderable list.
- **Roulette** smart shelf template (`random_pick`): selects games randomly from the full library — result is memoized for 5 minutes, then reshuffles. Always visible when the library is non-empty.
- **Surprise Me** sub-toggle under Smart Shelves: hides the manual shelf list and banner entirely; the system picks 1–5 smart templates each day using a deterministic daily seed. A slider (0–5) sets the exact count; 0 means the system decides (cycles 2, 3, or 4 per day). `smartSurpriseMe` and `smartSurpriseMeCount` added to `SettingsSchema`, `_sanitize_settings`, and `DEFAULT_SETTINGS`.
- Fifteen smart shelf templates: **Daily Pick** (deterministic daily rotation), **Deck Picks** (Deck Verified library), **On Deck** (installed + Deck compat, sort by recently played), **Recently Played** (last 30 days), **Long Sessions** (installed + >3 h playtime), **Not Started** (zero playtime, never launched), **Best Unplayed** (installed, never played), **Quick Play** (installed + Deck compat + <2 h), **Interrupted** (30 min–3 h), **Non-Steam** (non-Steam shortcuts and emulators), **Spare Time** (installed + ≤2 h, only during 6–9h/12–14h/19–22h windows), **Time of Day** (rotates by hour), **Rediscover** (last played >6 months, >1 h, Deck compat), and **Forgotten** (owned 3+ years, never launched, sorted oldest first). Ordered by probability of returning results in the picker.
- `SmartShelf` / `SmartShelfMode` Zod types and `smartShelvesEnabled` / `smartShelvesAtBottom` / `smartShelves` fields in `SettingsSchema` — all optional with defaults, backwards compatible with existing settings.
- `smartShelvesAtBottom` toggle (sub-toggle under the main switch) moves smart shelves below normal shelves. When `hideRecents` is active and the toggle is off, smart shelves are inserted after the first normal shelf (which occupies the native recents slot).
- Smart shelf controls: hide/show, move up/move down, and delete — via the ⋯ context menu (same pattern as normal shelves). Smart shelves are not editable by design.
- Smart shelf list uses `ShelfListLabel` (eye icon + title), matching the normal shelf list appearance.
- Heuristic results memoized per `(mode, limit)` with a 5-minute TTL — avoids re-running on every home render cycle.
- `smartShelvesEnabled`, `smartShelvesAtBottom`, and `smartShelves` preserved by `_sanitize_settings` in the Python backend and round-trip correctly through import/export.
- Two new standard shelf templates: **Non-Steam / Emulators** (filter: `nonSteam: true`, sort recent) and **Long Sessions** (filter: `installed + >3 h playtime`, sort playtime).
- Template pickers (standard and smart shelves) redesigned as a 2-column button grid where the button text is the template name. Standard picker shows **Start blank** first — opens the edit modal immediately.
- `docs/smart-shelves.md`: full reference for all 15 templates; reliability table re-ordered highest first.
- `docs/shelf-templates.md` and `docs/smart-shelves.md` linked from `README.md` documentation section.
- `docs/shelf-templates.md`: reference for all 8 standard templates; note about picker layout.
- All smart shelf and template i18n keys fully translated across all 16 supported locales.
- In-plugin documentation (About → Shelves) updated with Smart Shelves section listing all 12 templates with descriptions, fully translated.

### Changed

- PR title tag → version bump mapping: `[FEATURE]` is now minor (was major), `[REFACTOR]` is now major (was minor), `[CLEANUP]` stays minor.
- **Shelf-to-shelf centring**: switched to direct `scrollTo` math on the resolved scrollable ancestor and coalesced to one smooth scroll per focus event, with a 300 ms verification retry for recently-expanded shelves. Eliminates the stutter caused by competing `scrollIntoView({ block: "center" })` calls.
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

## [1.3.1] - 2026-04-17

### Added

- SVG icons in `GameCard` moved to module-level constants — eliminates 7 JSX object allocations per card render.
- `rowItems` array in `ShelfView` wrapped in `useMemo` (deps: `appIds`, `items`, shelf identity) — avoids `flatMap` on every re-render unrelated to data changes.
- `sortOptions` in `EditShelfModal` wrapped in `useMemo`; `BASE_SOURCE_TYPES` extracted to module-level constant.

### Changed

- `docs/architecture.md`: added `recentsReplace.tsx` to the runtime/ directory listing; added Key Systems entries for Recents Replace and Hide Home Tabs.
- `docs/filters.md`: corrected type names (`storeTag`, `achievements`, `friends`); added missing types (`isNew`, `playtimeRange`, `collection`); noted pass-through types not yet evaluated; fixed `playtimeRange` params (`minHours`/`maxHours`).
- `README.md`: added "Use first shelf as recents (experimental)" and "Hide home tabs" to the features list.
- `src/core/webpackCompat.ts`: added JSDoc to the four public functions (`findWebpackHashedClass`, `buildSelectorFromToken`, `getRuntimeClassMap`, `setRuntimeClassMap`).

### Fixed

- **`recentsReplace`**: silent patch failures (tree walk not finding the recents node, or `mutateRecentsElement` returning false) no longer leave the feature in a permanently broken state. After 5 consecutive silent failures the kill-switch is activated, causing `HomeInject` to fall back to the standard visual-hide behaviour. The counter resets on any successful mutation and on manual reset.

## [1.3.0] - 2026-04-16

### Added

- **Use first shelf as recents (experimental)** toggle — when `Hide recent games` is active, the first visible shelf's games are injected into the native recents component (patch-of-render via `routerHook.addPatch` + `afterPatch` + `findInReactTree`). Reuses 100% of the native DOM/CSS/animations (hero zoom, focus ring, CSS Loader theme support). Full i18n across all 16 locales.
- Runtime kill switch for the experiment: filters appids by Steam `app_type` (Game/Application) before injection, detects tree-walk failures and `userCollections`-class errors via a global error trap, and auto-disables the feature with a `RecentsReplaceErrorBanner` in the QAM. Fallback to the existing visual-hide behaviour is automatic.
- `qa:all-shelves-hide-home-tabs` / `qa:all-shelves-show-home-tabs` scripts mirror the recents-hide harness for the home tabs toggle.
- **Hide home tabs** toggle hides the native novidades/amigos/recomendados area (detected via `[role="tablist"]` sibling of the mount, no hardcoded classes). Independent of `Hide recent games`.
- Webpack discovery expanded with `heroRoot`, `heroInner`, `shelfSection`, `scrollGrid` tokens, populated both via runtime discovery and from the embedded `classmap.json` seed.
- Destructive `Reset all` screenshot captured by the automation and validated alongside the other home/QAM captures.

### Changed

- PR title tag → version bump mapping: `[FEATURE]` is now minor (was major), `[REFACTOR]` is now major (was minor), `[CLEANUP]` stays minor.
- **Shelf-to-shelf centring**: switched to direct `scrollTo` math on the resolved scrollable ancestor and coalesced to one smooth scroll per focus event, with a 300 ms verification retry for recently-expanded shelves. Eliminates the stutter caused by competing `scrollIntoView({ block: "center" })` calls.
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

- **"Hide new badge"** toggle (per-shelf + global) suppresses the green "NEW" badge rendered on cards for recently added games (within the last 14 days, derived from the app's `user_added_ts`).
- **"Hide compatibility icons"** toggle (per-shelf + global) suppresses the Deck-compat overlay (verified / playable / unsupported) on cards.
- **"Hide non-Steam launcher badge"** toggle (only shown when *Hide compatibility icons* is on **and** the NonSteamBadges plugin is installed) extends suppression to non-Steam apps.
- **"New game" detection**: cards display a `NEW` badge for games added to the library within the last 14 days. Honors the per-shelf and global *Hide "new" badge* toggles.
- **`isNew` filter type**: matches games added within the last 14 days (same window as the badge). Available as a standalone filter entry in shelf builders, independent from UI toggles. Docs page updated; i18n keys added across all 16 locales.
- **Dev-only QA harness** with three `pnpm` scripts (`qa:first-run`, `qa:qam-error`, `qa:shelf-error`) that build the plugin with a single dev-gated flag each (`DS_QA_FORCE_FIRST_RUN` / `DS_QA_FORCE_QAM_ERROR` / `DS_QA_FORCE_SHELF_ERROR`). Flags are compiled to `false` in release builds, so the hooks can never leak to users. Used to validate the FirstRunBanner, the QAM `ErrorBoundary`, and the homePatch shelf-render fallback.
- Two additional QA scripts that inject a fixed 6-shelf fixture covering every shelf source type — `filter updatePending`, `filter sort: recent`, `tab: installed`, `collection: favorite`, `filter installed + sort: metacritic`, and `filter group (developer: FromSoftware) + sort: release_date`: `qa:all-shelves-hide-recents` (forces `hideRecents = true`) and `qa:all-shelves-show-recents` (forces `hideRecents = false`). Implemented via `applyQASettingsOverride` in the settings store; `saveSettings` is a no-op while the flag is active, so edits during QA cannot contaminate persisted state. Same dev-only gating as the other QA flags.
- `[PERF]` and `[QA]` PR title tags now trigger an automatic patch version bump in the release workflow (same behaviour as `[FIX]` / `[ENHANCEMENT]`). Surfaced in the PR template, `CONTRIBUTING.md` tag table, and `.github/workflows/bump.yml`.
- PR template reorganized: label checkboxes grouped so each group contains tags with the same bump effect (without naming the scope in the UI).
- **Shelf-render crash protection** in `homePatch`: a React `ErrorBoundary` wraps `HomeShelves` across all mount paths (DOM bridge, `createRoot`, legacy `ReactDOM.render`). If any shelf throws during render, the home mount is cleared and hidden instead of bubbling up and breaking the SteamOS home. Crash state is broadcast via a pub/sub so the QAM reacts in real time.
- **QAM `MountCrashBanner`**: below the master toggle, explains why shelves are hidden, with a "reset crash state" button; banner appears only while a shelf-render crash is active.
- **"Reset all"** button at the bottom of the QAM that opens a destructive `ConfirmModal`. On confirm, wipes all shelves + settings and clears plugin-owned `localStorage` keys (`ds-`, `ds_`, `deck-shelves-` prefixes), leaving the plugin in first-run state. Full i18n coverage across all 16 locales.

### Changed

- When a shelf-render crash is active, QAM toggles stay visible but become `disabled` (grayed, non-interactive) instead of being hidden — keeps the UI layout stable and signals the inactive state.
- Home mount-detection fallback intervals reduced from 10s → 2s in [HomeInject.tsx](src/components/HomeInject.tsx) and [homePatch.tsx](src/runtime/homePatch.tsx). Covers SteamOS SPA navigation (e.g. library → home) that does not fire `popstate`/`hashchange` — shelves now appear within ~2s instead of up to ~10s when the MutationObserver misses the route change.
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

- Focus restoration MutationObserver scoped from `document.body` to `.deck-shelves-root` — fewer mutation callbacks during idle and user navigation
- Recents validation effect made reactive to `shelves` / `hideRecentsSetting` deps instead of polling every 5s — zero idle work when nothing changes
- Removed 10s fallback `setInterval(applyPatches)` in HomeInject — redundant with the MutationObserver + popstate/hashchange listeners already wired
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
- **Screenshot automation**: new captures for "Create Shelf" (template picker modal) and "Import Shelves" modal
- **Screenshot QAM navigation rewritten**: navigates to the last tab (Decky plugins), then finds and clicks "Deck Shelves" inside the plugin list — no longer relies on tab text matching

### Changed

- **Home validation logic rewritten**: recents are always forced visible when plugin is disabled, no visible shelves exist, all shelves are hidden, or no shelves resolve to results — toggle values are never force-changed, only DOM state is overridden
- **"Hide recents"** toggle: hidden when plugin not enabled on home; disabled when no shelves have results
- **"Hero background"** toggle: always visible when plugin enabled (no longer nested inside hide-recents condition); disabled when hide-recents is off or no shelves have results
- `disableHideRecents` computation now runs independently of the current toggle value
- Removed unused imports across 23+ files: React default imports (automatic JSX transform), orphan types, dead utility functions, unused Decky UI components
- QAM modals import paths corrected: `../../features/` → `../../../features/` (7 files)
- `ShelvesPanelSection` now uses explicit `Shelf` type annotations instead of implicit `any`; removed from `PanelSection` wrapper for more lateral space
- **QAM layout**: added "Shelves" / "Apply globally" section headers with consistent padding; separator below action buttons; shelf list entries single-line with ellipsis
- **EditShelfModal** fully restored: source type selection, filter panel, preview count, all toggles
- **Dependency updates**: TypeScript 5.9→6.0, i18next 25→26, react-i18next 16→17, vitest 3→4, jsdom 21→29, esbuild 0.27→0.28, react 19.2.4→19.2.5

### Fixed

- Second shelf title no longer hidden behind hero: hero uses `zIndex: -1` to stay behind shelf content in the stacking order, and background color is self-contained inside the hero div instead of coloring the mount/root containers
- Hero fade uses `var(--ds-page-bg)` detected from theme viewport — follows CSS Loader themes automatically instead of forcing black
- Featured card no longer flashes/resizes after initial render: native dimension discovery now requires 2 consecutive stable polls before accepting changes (confirmation cycle)
- Shelf titles in QAM reorderable list now properly ellipsize in a single line next to the action button
- **TypeScript CI typecheck errors**: 7 QAM component files had wrong relative import paths for `features/settings/controller` and `types`
- **Compatibility check**: CSS Loader coexistence script now recognizes `ds-` as valid namespace prefix
- **Compatibility check**: Obsidian theme font-size check now excludes files with scoped selectors (ROOT_ID, STYLE_ID)
- **Compatibility check**: SteamOS 3.7 route detection regex fixed (BRE `\|` → ERE `|` with `-E` flag)
- i18n check: key count line changed from info to positive check

## [1.2.2] - 2026-04-09

### Fixed

- Fix background color

## [1.2.1] - 2026-04-09

### Added

- **"Show background art"** sub-toggle: when recents are hidden, the first shelf shows hero background art on card focus, matching the native recents behavior with CSS Loader theme support (e.g. Obsidian grayscale filter)
- **Global "Match native card size" and "Highlight first game"** toggles in QAM with precedence over per-shelf settings
- **PlaceholderCard** component: games without art show a styled card with the game name instead of a broken image
- **Mouse hover support**: card labels, brightness, and compat badges activate on hover (CSS-only, no interference with gamepad)

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

- **Dynamic card sizing**: `discoverNativeCardDimensions()` detects native card dimensions at runtime; shelves match native card size when `matchNativeSize` is enabled per shelf
- **"Highlight first game"** option: first card in a shelf renders as a landscape featured card
- **"Hide recent games"** toggle in QAM hides the native "Recently Played" section
- **Crash protection**: home mount errors automatically disable shelves with a retry button in the QAM
- **Developer / Publisher filter type** with batch preloading via `RegisterForAppDetails`
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
- **Runtime webpack class discovery** (`src/core/webpackCompat.ts`): discovers Steam's obfuscated viewport class at plugin mount via three-tier fallback (overflow scan → ancestor traversal → broad aggregation), enabling deterministic shelf selectors that survive Steam updates without hardcoded hashes
- **Static classmap seed** (`src/runtime/classmap.json` + `src/runtime/embeddedClassMap.ts`): bootstraps `window.__DS_CLASS_MAP` and `localStorage['ds_class_map']` at plugin startup so viewport selectors are available immediately, before discovery runs
- **Dev tools**: `scripts/devtools/deck/tools/cdp_eval.py` (generic CDP expression evaluator) and `inject_classmap.py` (injects a classmap into SharedJSContext via CDP for development/testing)
- **Unit tests for `webpackCompat` module** (jsdom environment, Vitest): viewport token discovery, row/card token discovery, ancestor scanning fallback, and localStorage persistence roundtrip
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

- **CI**: full GitHub Actions CI pipeline (typecheck, build:release, compatibility validations and decky submission checks)
- **Tests**: Python `pytest` support alongside Vitest; `pnpm run test:all` helper to run both suites
- **Public plugin API**: `window.__DECK_SHELVES_API__` for external plugins to register shelf sources (versioned API)
- **First-run UX**: FirstRun banner and templates (Favorites, Recently Played, Installed) to bootstrap new users
- **Shelf templates**: Preset templates for common shelf types (most-played, recently added, awaiting-update, played-in-last-7-days)
- **Shelf refresh emitter**: global `ShelfRefreshEmitter` to centralize refresh events and reduce per-shelf polling
- **Suspend/Resume hooks**: SteamOS suspend/resume handling to pause timers and revalidate state on resume
- **UnifiDeck surfacing**: UnifiDeck-managed non-Steam apps are surfaced as sources/tabs in the editor
- **Release automation**: GitHub Actions release workflow for tag-triggered releases
- **Diagnostics**: SteamOS version detection added to startup diagnostics
- **Atomic settings writes** and `settings.json.bak` backup in the Python backend

### Changed

- **Screenshot automation**: i18n-only language switching prior to captures; CDP reachability checks; deferred deletion of screenshots until targets verified
- **Tests**: moved TypeScript tests from `src/__tests__` to `src/test`; CI updated to install and run Python `pytest` alongside Vitest
- **Polling → event-driven refresh**: shelves now subscribe to a global emitter and use a single fallback poll (30s) instead of individual short timers
- Increase tab refresh TTL and home fallback intervals to reduce churn (tabs 30s, homePatch fallback 10s)
- **Selector strategy**: use ordered candidate selectors (aria-labels, stable substrings) instead of brittle obfuscated classes

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
