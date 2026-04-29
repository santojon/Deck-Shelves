# Release Notes

User-facing highlights for each Deck Shelves release. For the full technical
changelog, see [CHANGELOG.md](CHANGELOG.md).

## [Unreleased]

### Added

- **Refresh card on shelves with random sort.** Shelves you've set to **Random** order now get a Refresh tile at the end of the row — clicking it reshuffles only that shelf with a quick spin animation. Mirrors how smart shelves like Roleta and Hora do dia already work; the refresh tile only appears where the result can actually change between two clicks.
- **Hide game names (per shelf and global).** New toggle in each shelf's Display tab and in the QAM Visual section. When on, the game name disappears from cards — only the artwork (and optionally the playtime / status line) is shown. Useful for theme-heavy setups where the artwork already carries the title.
- **Hide install indicator (per shelf and global).** New toggle that hides the install / download / update / play icons in the status line while keeping playtime visible. Use it together with **Hide status line** for a cleaner card grid, or alone to keep playtime but drop the install state icon.

### Fixed

- **Game context menu now works on SteamOS 3.7.21 again.** The plugin now detects the OS version and falls back to the simpler menu detection used in older releases when running on SteamOS 3.7 or older — with the modern flow kept intact for 3.8 / 3.9. The fallback menu (Play / Properties / View Details) is the same on every version, so even if menu detection fails the MENU button always surfaces something usable.

## [1.6.2] - 2026-04-28

### Added

- **Three new shelf templates surface in the About → Shelves docs.** Steam Cloud, Deck Verified, and Top Reviewed now have proper descriptions in your language — the templates themselves landed earlier; this fills in the help text in all 16 supported languages.
- **Cleaner translations across the smart shelves docs.** The "Sort: alphabetical / Sort: last session / …" lines that appeared in English on every non-English locale are now translated, plus the smart-shelf parameter labels (Days back, Min/Max playtime, Refresh interval, etc.) and category names (Daily, Discovery, Deck Ready, Anything Goes).
- **Hide shelf title (per-shelf and global).** New toggle in the QAM Visual section and inside each shelf's Display tab — when on, the row's title block disappears and the cards row stays visible regardless of the collapse state. Useful for theme-heavy setups where the row title duplicates artwork already in the card.
- **About → Learn more.** New section in the About page with **GitHub** and **Report issue / request feature** buttons (D-pad navigates between them sideways), plus an inline **Other versions** link in the version footer pointing to the releases page.
- **Lighter, friendlier icons across the QAM and edit modals.** Filters, Display, Sort, Smart Shelves, Saved Filters, About, Behavior, Shelves, Visual Global section headers all picked up matching feather-style icons; Source / Visual / Overview / How to / Shelves docs intentionally stayed icon-free.

### Changed

- **Translations swept across all 16 locales.** Removed 20 unused keys (translation strings that no longer matched any UI surface) and translated 380 strings that had been left in English in non-English locales. Locale files are now sorted alphabetically for stable diffs.

### Fixed

- **"Recently Played" template now opens with the correct source in the edit modal.** A wrong tab id ("recent" — never exposed by Steam) made the source field fall back to the first available option whenever you opened the modal. The template now uses a filter source sorted by recent. Existing affected shelves are migrated automatically the first time you open the plugin after this update.
- **Mini-card preview no longer clips the green selection outline or focus glow.** The bottom edge of focused cards in the highlight picker / manual-sort row stayed cut by the surrounding container's overflow boundary; preview rows now scroll the focused card fully into view.
- **ArtHero hero label aligns with the focused card's left edge.** A 40px floor on the label's position offset it 16px to the right when the row sat close to the screen edge — gone now.

## [1.6.1] - 2026-04-27

### Added

- **Plugin API v2.** Other plugins can now extend Deck Shelves at runtime — registering custom shelf sources, smart-shelf templates, filter types, sort options, import formats, and pre-baked saved filters. Anything they register becomes available everywhere it would naturally appear (shelf editor dropdowns, smart-shelf picker, filter resolver). Read-only contracts are also exposed for plugins that want to consume Deck Shelves state in the future. Full guide and worked examples in `docs/plugin-api.md`.
- **CSS Loader compatibility (ArtHero family).** When the native recents are hidden and a CSS Loader theme is active, the first shelf is now wired into the theme's recents styling — themes that paint a hero or restyle the recents block now flow into the promoted shelf without breaking plugin styling. With ArtHero specifically, the focused game's name and status now appear above the row matching native ArtHero exactly (font sizes, status icon hidden when the game is installed and up to date, label tracks the focused tile horizontally as you scroll). The hero image follows only the focused card on the first/promoted shelf — focusing cards in shelves below no longer hijacks the hero — and updates instantly when ArtHero is toggled on/off without needing a Steam restart.
- **TiltedHome compatibility.** When a CSS Loader theme defines a tilt angle (TiltedHome / Renaissance), the entire shelf card tilts as a parallelogram — image, label, focus glow, "view more" card, and "refresh" card all participate. The focused card stands out with the native scale lift plus tilt; cards visually overlap like in native TiltedHome instead of needing artificial space between them. Zero overhead when no theme is active.
- **Refresh card on smart shelves.** Smart shelves whose result can actually change between clicks (Roleta, Hora do dia, Tempo livre, Jogados recentemente) now end with a **Refresh** card instead of "view more in library" — clicking it re-resolves just that shelf with a quick spin animation. Smart shelves whose result is deterministic (Daily Pick, Quick Play, Deck Picks, Best Unplayed, etc.) drop the trailing card entirely so you don't tap a button that wouldn't change anything.

### Changed

- **The "first shelf" promotion is more reliable.** When the native recents are hidden and the first shelf in your config resolves to zero games, the slot now skips over to the next shelf in your config order — without the empty shelf's title nominally claiming the slot. Same logic also keeps the same candidate even when a non-Steam shelf happens to load faster than a Steam one — your intended top shelf wins, regardless of which finished resolving first.
- **Edit modals scale with screen size.** Source, Filters, Visual, and Display tabs now scale their content area to the viewport (up to 720px tall on big screens, ~410px on Steam Deck) instead of being hard-clipped at 410px. Decky-style fields no longer get cut on the right edge of scrollable tabs (Source / Visual) on bigger screens — content lines up flush with non-scrollable tabs (Filters / Display).

## [1.6.0] - 2026-04-24

### Added

- **Save and reuse filters.** Build a filter combo inside a shelf's Filters tab, name it, and apply it to any other shelf later — saved filters live in their own collapsible section in the Quick Access Menu, where you can rename or delete them.
- **Edit smart shelves.** Smart shelves (Quick Play, Deck Picks, Daily Pick, etc.) can finally be customized. Override the built-in sort with any of the standard orders (alphabetical, playtime, release date, review score…), narrow the candidate pool with extra filters, and tweak the same visual options as regular shelves (highlight first, highlight all, hide badges, etc.).
- **Pick your order for manual-sort shelves.** When you set a shelf to manual order, a new dropdown lets you choose the base ordering for the games you haven't explicitly placed — so unplaced games can fall through in playtime, release date, or any other order you prefer, not just alphabetical.
- **Drag shelves by title on the home screen.** Hold a shelf title for about a third of a second with mouse or touch and drag it to a new position. D-pad navigation is untouched, smart shelves are excluded (their position is controlled by the "at bottom" toggle).
- **Drag shelves in the QAM panel too.** Hold-and-drag now works alongside the existing move-up / move-down buttons — use whichever is faster for you.
- **Templates grouped by category.** Both the normal and smart shelf pickers now organize templates into collapsible categories (By Status, By Time, By Compatibility, By Platform, Other) so finding the one you want is quicker.
- **Highlight specific games.** A shelf can feature any set of individual games, not just the first one or all of them. Toggle "Highlight specific games" in the Visual tab and check the ones you want — a live preview shows exactly how the shelf will render.
- **Cloud saves and controller support filters.** Two new filter types let you narrow shelves to games with Steam Cloud or partial/full controller support.

### Changed

- **Modal content no longer gets clipped on the sides.** Dropdowns, toggles, and preview rows inside the edit modals now use the same horizontal rhythm as Decky's native fields — content lines up end-to-end instead of getting cut.
- **Preview rows stay centered when you move cards.** Clicking a chevron on a mini-card in the manual-sort row smoothly re-centers the shifted card, and toggling a card to featured in the highlight preview re-centers it when its neighbors reflow.
- **Home shelves are faster.** Shelves now skip unnecessary re-renders when unrelated settings change, so the home stays snappy when you toggle something in the QAM. Background safety-net timers run less often (4× fewer wake-ups on the home nav patch), saving a small but real bit of battery during idle viewing.
- **Shelves no longer flicker with stale results.** Rapidly changing a shelf's settings — switching sort back and forth, editing a filter — no longer lets a slow previous resolve overwrite a newer one. Only the latest result is rendered.
- **Regular shelves and smart shelves share the same editing experience.** Same tabs, same visual controls, same preview behavior — you only see what's relevant for each shelf type.
- **Template picker + TabMaster import layouts.** Cleaner 2-column grids; Steam-native entries in the TabMaster import now show a Steam logo so they're easy to spot.
- **More sort options for every shelf type.** Sort by alphabetical, last session, playtime, release date, size on disk, Metacritic, Steam review score, recently added, or random — no matter if the shelf is from a collection, a library tab, or a filter.

### Fixed

- **Menu button responds again after a Steam Deck restart** (issue #25). The button now opens the game context menu reliably on every press, even on the first try after a cold boot. The simpler fallback menu (Play / Properties / View Details) appears when the full native menu isn't available in your SteamOS build; if you open a native Steam menu elsewhere, the real menu becomes available for subsequent presses automatically.
- **No more visual tilt when scrolling DOWN past the last shelf** when you have the home tabs hidden.
- **Manual base sort actually takes effect** on filter-based shelves — previously the base order silently fell back to alphabetical on those.
- **Missing translations.** All new text from this release is translated into every supported language (en-US, pt-BR, pt-PT, es-419, es-ES, de-DE, fr-FR, it-IT, ja-JP, ko-KR, nl-NL, pl-PL, ru-RU, tr-TR, uk-UA, zh-CN).
- **A collapsed shelf stays collapsed when it loses the native-recents slot.** If you had manually collapsed a shelf and then turned on "Hide recent games" (which promotes that shelf to be first on the home), the shelf would stay collapsed forever after — its remembered state was being overwritten. Now the shelf is forced open only while it holds the slot; your original collapsed/expanded choice is restored as soon as it moves down.
- **The "first shelf" slot now promotes the first shelf that actually shows games.** If your top shelf is a filter that sometimes resolves to zero games (e.g. "Games awaiting update"), the slot used to sit empty and the next populated shelf below stayed collapsed. The slot now re-targets automatically to whichever shelf is first on screen, re-expanding and locking it until another shelf takes its place.

## [1.5.3] - 2026-04-22

### Added

- **Dedicated Smart Shelves and Sort pages in About.** The in-plugin docs now have separate tabs for all 15 smart-shelf templates (grouped by category with sort/timing notes) and all 8 sort modes.
- **Menu button on overlay cards.** With "Use shelf as Recents" active, pressing the menu/options button on a focused card now opens the game context menu.
- **Overlay recovers on its own.** If the overlay fails to kick in on a cold boot or after sleep, longer startup timers, a 2-minute refresh, and a resume-from-suspend hook re-attempt injection automatically.

### Fixed

- **Hero art follows the current focused game** when games are substituted in the overlay — no more leftover background from the previously focused game.
- **Smoother focus transitions on overlay cards.** Stacked render callbacks were breaking the native cross-fade; they no longer stack.
- **Context menu recovers from render errors on SteamOS 3.9.** If rendering fails, the cached menu component is cleared so the next press re-extracts against the current bundle.
- **QAM collapsible sections show a proper focus highlight** when navigated with a gamepad.

## [1.5.2] - 2026-04-21

### Added

- **Sort for every shelf type.** The full sort dropdown (alphabetical, last session, playtime, release date, size on disk, Metacritic, Steam review score, recently added, random) is now available for collection, tab, and external shelves — not only filter shelves.
- **Random sort.** Shuffle a shelf's games on every resolve.
- **"Surprise Me" count is visible in the QAM slider label** — e.g. "Surprise Me (3)" — so you can read the configured count without opening the slider.
- **Pick any shelf as native recents replacement.** With "Use shelf as Recents" on, you can now choose a specific shelf in a dropdown instead of always getting the first visible one.
- **"Highlight first" respects your overlay toggle.** When a shelf powers native recents, the hero-sized first card honours `highlightFirst` / `globalHighlightFirst` instead of always being on.

### Fixed

- **Collections now load reliably in the shelf editor,** including on SteamOS builds where the usual store API is unavailable.
- **Non-Steam apps on native recents replacement** no longer blocked the overlay — only truly native-only shelves render, non-Steam apps pass through with the existing error trap as safety.
- **Hero art bottom fade restored.** The subtle 10% fade to page background over the last 5px is back — no more 30% overlay.
- **Hero art envelopes the shelf** by 60px above and below, matching the original native look.
- **Playtime shown on non-Steam shortcuts** on the focused card (was gated incorrectly).
- **Changing sort on a non-filter shelf now actually re-orders** the games and invalidates the cache so you don't see the old order flash first.
- **Non-Steam duplicates across launchers preserved.** A game named "Adios" from GOG and one from Epic are kept as separate entries; only true duplicates are merged.

## [1.5.1] - 2026-04-19

### Fixed

- **"Highlight all" saved again.** Both the per-shelf and global toggles were silently getting dropped on save — they now persist correctly.
- **Filter tab navigable with the gamepad.** Filters inside the shelf editor were unreachable via D-pad; now every dropdown and button is in the navigation tree.

### Changed

- **Developer / publisher / app-id list filter descriptions translated** into all 15 non-English locales (previously left in English).

## [1.5.0] - 2026-04-19

### Added

- **Highlight all.** New toggle (per-shelf and global) renders every card in a shelf as a featured landscape card.
- **Publisher filter.** Filter games by publisher name, same pattern as the existing developer filter.
- **App ID list filter.** Match games by an explicit, comma-separated list of app IDs (equivalent to TabMaster's whitelist filter).
- **CSS Loader theme-friendly first shelf.** When "Hide recent games" is active and a CSS Loader theme is in use, the first shelf gets the same native classes as the recents area, so themes like ArtHero can style it consistently.

### Changed

- **QAM stays tidy when the plugin is disabled.** Smart Shelves and global-toggles sections are hidden when the main switch is off — only the main toggle and the shelf list remain.

### Fixed

- **DOWN navigation on the last shelf** no longer wraps back to the first when home tabs are hidden — focus stays put.
- **Focus bridge from native tabs** no longer jumps into the first shelf by accident when you're navigating within the tabs themselves.

## [1.4.0] - 2026-04-18

### Added

- **Smart shelves.** A new shelf type whose content is picked automatically by heuristics — appears on the home only when the heuristic returns results, disappears otherwise. Fifteen templates: Daily Pick, Deck Picks, On Deck, Recently Played, Long Sessions, Not Started, Best Unplayed, Quick Play, Interrupted, Non-Steam, Spare Time, Time of Day, Rediscover, Forgotten, and Roulette.
- **Surprise Me.** Picks 1–5 smart templates for you each day using a deterministic daily seed. A slider (0–5) sets the exact count; 0 lets the system cycle between 2, 3, or 4 per day.
- **Forgotten** (owned 3+ years, never launched) and **Spare Time** (installed + under 2 h, only during 6–9 h / 12–14 h / 19–22 h) templates added.
- **Icons on every template picker button** — quicker visual scanning.
- **About → Shelves now documents standard shelf templates** before the smart shelves section.
- **Two new standard shelf templates:** Non-Steam / Emulators and Long Sessions.
- Full translations for every smart-shelf and template string across all 16 locales.

### Changed

- **Shelf-to-shelf centering feels smooth** when navigating vertically — eliminated the stutter from competing scroll calls.
- **Card focus ring picks up the theme accent color** when the active theme defines one, with a safe transparent fallback.
- **Native focus animations play through** on shelf cards under ArtHero and similar CSS Loader themes.
- **Hero background matches native recents geometry** — aligns with ArtHero layout.

### Fixed

- **Collection loading no longer crashes the Decky error boundary** when Steam's collection store isn't fully initialised yet.
- **Home recovery after enabling replace-source.** No duplicate first shelf, no stacked heroes, no stuck-collapsed row.

## [1.3.1] - 2026-04-17

### Changed

- **Home renders faster.** Several allocations per card and re-computations per shelf eliminated with memoization.
- **README and docs** got the latest experimental toggles and filter types documented.

### Fixed

- **Recents-replacement self-heals.** After repeated silent failures the feature switches to the standard "Hide recent games" fallback instead of staying in a broken state.

## [1.3.0] - 2026-04-16

### Added

- **Use first shelf as recents (experimental).** With "Hide recent games" active, the first visible shelf's games are injected into the native recents slot. You reuse 100% of the native look and feel (hero zoom, focus ring, CSS Loader support). Auto-disables with a banner if the injection runs into errors.
- **Hide home tabs.** Hides the native novidades/amigos/recomendados area independently of "Hide recent games".

### Changed

- **Automatic fallback to "Hide recents" visual mode** if the experimental replace-source feature runs into runtime errors.

## [1.2.5] - 2026-04-16

### Changed

- **Focus restoration after returning from a game.** Much more reliable — focus lands back on the exact card/shelf you activated, instead of snapping to the first shelf sometimes.
- **Card size is stable on cold boot.** No more brief card reflow when the home first renders — cached dimensions are used immediately.
- **Focus never gets "lost" from shelves** after multiple collapse/expand cycles.

### Fixed

- **Collapsing a distant shelf no longer steals focus** from the currently focused shelf.
- **"Installed" filter is now accurate for non-Steam shortcuts** — UnifiDeck apps are cross-referenced with the `[Unifideck] Installed` collection to avoid false positives.

## [1.2.4] - 2026-04-14

### Changed

- **Less background work.** Polling intervals are replaced by event-driven refreshes where possible — lighter on the battery.
- **Cleaner QAM layout.** Action buttons regrouped (Add / Import / Export on the left; TabMaster on the right) and button rows flush with the QAM edge.
- **Faster first render.** Card dimensions are cached per viewport/DPI so the first shelf paints with the right sizes immediately.
- **"Show background art" toggle is hidden** when "Hide recent games" is off (instead of being disabled) — no more dead UI state.
- **About page sections scroll** reliably on every subpage.

## [1.2.3] - 2026-04-11

### Added

- **Dev workflow scripts.** `pnpm run precommit`, `deploy:verify`, and a full `update` family for dependency management.
- **Recents hidden = gamepad skips the recents section.** Focusable elements in the hidden recents receive `tabindex=-1` so the D-pad jumps directly to shelves. Programmatic focus moves to the first shelf card with retries if needed.
- **New shelves appear at the top of the list.** Duplicated shelves appear right below the original, and creating a blank shelf opens the edit modal immediately.
- **Screenshot automation** covers the Create Shelf picker and the Import Shelves modal, and navigates robustly to the Decky plugin tab regardless of locale.

### Changed

- **Home validation logic rewritten.** Recents are always forced visible when the plugin is disabled, no shelves resolve, or all shelves are hidden — the toggle value is never force-changed behind your back.
- **QAM layout.** Clear "Shelves" and "Apply globally" section headers; shelf list entries ellipsize on a single line.
- **Hero fade follows your theme.** Uses the theme's page background color (via `--ds-page-bg`) automatically.

### Fixed

- **Second shelf title no longer hides behind the hero.**
- **Featured card no longer flashes/resizes after initial render.**

## [1.2.2] - 2026-04-09

### Fixed

- Background color inside the hero region.

## [1.2.1] - 2026-04-09

### Added

- **"Show background art"** — when recents are hidden, the first shelf shows hero background art on card focus, matching native behavior and CSS Loader theme tweaks.
- **Global "Match native card size" and "Highlight first game"** toggles with precedence over per-shelf settings.
- **Placeholder cards** for games without art — styled card with the game name instead of a broken image.
- **Mouse hover support** — card labels, brightness, and compat badges activate on hover without interfering with gamepad.

### Changed

- **Card size transitions smoothly** when a card becomes featured.
- **Hero background replicates the native DOM chain** for CSS Loader theme compatibility.
- **Documentation consolidated** into a `docs/` directory.

### Fixed

- **Vertical shelf centering** works on screens where the fallback scroll math was off.

## [1.2.0] - 2026-04-09

### Added

- **Dynamic card sizing** — shelf cards match the native SteamOS card size per viewport.
- **"Highlight first game"** renders the first card in a shelf as a landscape featured card.
- **"Hide recent games"** toggle hides the native recents section from the home.
- **Crash protection** — home mount errors automatically disable shelves with a retry button in the QAM.
- **Developer / Publisher filter** — preloads data in batches so long publisher lists aren't slow.

### Changed

- **Lighter on the battery.** Polling replaced with MutationObservers; reduced timer frequencies across the home, QAM, and focus restoration.
- **Landscape art fallback chain** — custom hero images take priority, then local `header.jpg`, then CDN variants.

### Fixed

- **Focus ring respects art height** on featured cards.
- **"Hide recents" persists across QAM reopens.**

## [1.1.3] - 2026-04-07

### Changed

- **Horizontal shelf navigation matches native recents pacing.** One D-pad press = one card, with a ~200ms pause when holding, so focus and scroll stay in sync.

### Fixed

- **Context menu extraction** always restores its React override via `try/finally` — no stale monkey-patches if extraction throws.

## [1.1.2] - 2026-04-07

### Added

- **Compatibility tier badges on cards** (Steam Deck Verified / Playable) with themed colors.
- **CSS Loader / DeckThemes compatibility**: shelf cards now receive the same native Steam card classes so most theme CSS rules apply to shelf cards exactly as they do to native recents cards.
- **Native focus animation color** follows the active theme's accent color.

### Fixed

- **Installed detection is now accurate.** Only explicit `installed: true` in `per_client_data` marks a game as installed — no more false positives for games available on remote clients.
- **Non-Steam shortcuts default to not installed** when no install evidence is present.
- **Play icon and status text** inherit the right theme color after theme changes, without a Steam reload.

## [1.1.1] - 2026-04-06

### Added

- **Runtime webpack class discovery.** Steam's obfuscated class names are discovered at plugin mount, so shelf selectors survive Steam updates without hardcoded hashes.
- **Static classmap seed.** Selectors are available immediately at startup, before runtime discovery completes.

### Changed

- **CI and workflow improvements.** Release workflow leaner, version bumps triggered from PR title tags (`[CLEANUP]` / `[ENHANCEMENT]`).
- **Translations:** "Folder" and "Browse" strings now translated in every locale.

### Fixed

- **Compatibility checks** in French, German, and Italian locales (previously untranslated status strings).
- **Vertical shelf navigation no longer double-scrolls** between shelves.

## [1.1.0] - 2026-04-04

### Added

- **Languages.** Expanded to 16 fully translated languages — added PT-PT, ES-419, RU, PL, NL, TR, UK, JA, KO, ZH-CN.
- **"Recently added" sort** — sorts by library acquisition date instead of last played.
- **Localized Favorites.** The Favorites shelf now works on every language (FR, DE, ES, IT, PT, etc.) regardless of Steam's locale.
- **About page is scrollable with the gamepad.**
- **Expanded filter documentation** in the About page with all 15 filter types and 8 sort options.
- **Shelf app ID cache in localStorage** — instant display after standby resume.
- **Startup readiness retry** — shelves wait for Steam's app data instead of showing empty.

### Changed

- **Shelf card border-radius inherits from the active theme** via a CSS custom property.
- **Horizontal shelf navigation centers the focused card** instead of pinning to the left edge.

### Fixed

- **Favorites shelf now displays on non-English systems.**
- **"Recently Added" template correctly sorts by acquisition date.**
- **Game covers match the visual style of native Steam cards** when CSS Loader themes are active.
- **Non-Steam shortcuts no longer incorrectly marked as installed** based on exe_path.

## [1.0.0] - 2026-04-02

### Added

- **Public plugin API** — other plugins can register shelf sources via `window.__DECK_SHELVES_API__`.
- **First-run banner** with ready-to-use templates (Favorites, Recently Played, Installed).
- **Shelf templates** — common shelves like most-played, recently added, awaiting update, and played in the last 7 days.
- **UnifiDeck integration** — non-Steam apps managed by UnifiDeck (Epic, GOG, Amazon) surface as sources and tabs in the editor.
- **Suspend / resume hooks** — timers pause when the Deck sleeps and the state is revalidated on resume.
- **Atomic settings writes** — `settings.json.bak` backup prevents corruption on power loss.

### Changed

- **Shelves refresh via a global event emitter** instead of per-shelf polling — lighter background work.
- **CI runs Python tests alongside TypeScript tests.**

### Fixed

- **TabMaster import shows proper loading/error states** in the QAM.

## [0.2.0] - 2026-04-02

### Added

- **Advanced filter groups** — filters can now be combined with AND/OR logic and nested, enabling queries like "installed AND (favorites OR played within 7 days)".
- **New filter types:** store tags, achievement count range, friends who own, update pending, and merge (combine multiple sources into one shelf).
- **New sort options:** release date, size on disk, Metacritic score, review score.
- **TabMaster integration** — "Import from TabMaster" appears in the QAM when TabMaster is installed; tabs become shelves.
- **UnifiDeck integration** — non-Steam apps appear automatically in filter and tab shelves.
- **Library tab selection shows real runtime tabs,** including custom tabs from other plugins, instead of a static list.

### Changed

- **Filter shelf editor redesigned** for the group-based filter UI.

### Fixed

- **Delete shelf button no longer leaks destructive styling** into Steam's shutdown menu.
- **Legacy UUID-tab shelves auto-migrate** to the correct filter-based source.

## [0.1.0] - 2026-03-25

### Added

- **Deck Shelves** is released — configurable shelves injected into the Steam Deck home screen.
- **Quick Access Menu panel** for managing shelves.
- **Three shelf types:** Collection, Library Tab, and Filter.
- **Reorder, rename, and hide** shelves without deleting them.
- **Empty-shelf preview warning** when a shelf resolves to nothing.
- **Six initial languages:** en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT.
