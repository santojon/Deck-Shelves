# Release Notes

User-facing highlights for each Deck Shelves release. For the full technical
changelog, see [CHANGELOG.md](CHANGELOG.md).

## [Unreleased]

### Fixed

- **Home lag (#81).** Each card with a "NEW" or discount badge was running its own DOM observers and focus listeners to track the QAM/modal overlay state. On a home with 30+ visible cards, that turned into dozens of observers all reacting to every DOM change. Now a single shared detector serves the whole home — idle CPU drops noticeably.
- **Random-sorted shelves now actually re-shuffle (#82).** The previous build cached the shuffle for 24 hours, and the cache survived Steam restarts — so a shelf with random sort would stay frozen in the same order until the next day. Now the cache is wiped at every plugin boot and on every shelf refresh.
- **View button on running games no longer shows "Application already open".** Pressing View on a game that's running now correctly returns you to the game without the error toast — same behaviour as picking the menu's first item manually.
- **View button on update-pending runtimes no longer fails with "Invalid game configuration".** Non-launchable items like Steam Linux Runtime / Proton Hotfix now route through the menu's actual "Update" action instead of trying to launch.
- **View button now also works on cards without library art.** Some games (notably Steam runtimes) show a placeholder background; pressing View on those cards used to do nothing. Same dispatch as a regular card now.

### Changed

- **Combined shelves with two online sources now have one filter block per source** (Wishlist + Store gets separate panels, each with its own discount %, price range, etc.). Same for the "Ignore games I already have" toggles — one block per online source so you can mix-and-match.
- **New shelves open with no tab pre-selected.** The preview stays empty until you pick one, instead of showing every game from the default "All games" tab. Editing an existing shelf keeps whatever you had selected.
- **QAM reorder follows the moved row.** Pressing up/down in reorder mode used to stick focus to the slot you started at — the next press would swap a different row instead of the one you just moved. Focus now travels with the moved item.
- **Shelf actions menu shows the shelf name as the title** (was "Actions").
- **"Open shelf options" tooltip shortened to "Options".**
- **The online indicator (cloud icon)** on shelves in the QAM now also appears for combined shelves that have at least one online source.
- **Filter source with no criteria now shows an empty shelf** (was showing your entire library).
- **Selecting "Filter" as a source no longer pre-fills the "Installed" criterion.** You start with a blank filter and add what you want.

## [2.4.0] - 2026-06-03

### Added

- **Two new filters for friend activity.** "Friends playing now" matches any game at least one Steam friend is in right now. "Friends played recently" matches any game a friend was seen playing in the last N days (1–30, default 14). Both work in any regular shelf and inside composite — e.g. "games in my Backlog collection that any friend played this week". Both are invertible (use as exclude). Requires the Online features toggle to be on.
- **Smart-shelf mode is now editable.** The Source tab of the smart-shelf editor has a mode dropdown (was read-only). Change the data source of a smart shelf without recreating it.
- **Combine smart-shelf modes.** A new "Combine modes" picker on the smart-shelf editor lets you mix multiple smart modes into one shelf — pick Union (any mode matches) or Intersection (all modes match). Same mental model as combining sources on regular shelves.
- **Press View on a focused game card to Play or Install** — invokes the game's first context-menu action directly. Steam picks Play (if installed) or Install (if not) — same call the menu's first item makes. The on-card legend reflects the dynamic label. Only shown for games in your library (wishlist / store / decoration cards don't get the View glyph since there's no install / play target).

- **Y button label is now constant ("Toggle") on every card** instead of flipping between "Highlight" / "Remove highlight" based on whether the card is currently featured. Less visual noise on the legend; the action still toggles the highlight as before.
- **"Options" tooltip on the menu button** — the start-button glyph at the bottom of the screen now shows "Options" when a game card is focused, matching the X / Y / A / B legends already shown on shelves.

- **6 new smart-shelf templates** that read live device + Steam data:
  - **Low battery mode** — when the Deck is on battery below 30% (tunable), surfaces the smallest, shortest-playtime games first. On AC / unknown battery, falls back to the Short battery candidates so the shelf isn't empty.
  - **Almost finished** — games with achievement progress at or above 70% (tunable). Best-effort: relies on Steam achievement data being cached for each game.
  - **Couch gaming** — games tagged with Shared/Split Screen multi-player.
  - **Co-op ready** — games tagged with Co-op or Online Co-op.
  - **Party games** — games tagged with Local Multi-Player / Local PvP / Party.
  - **Friends playing** — games your Steam friends are playing right now (or, optionally, played in the last 14 days). Shows games you own AND games you don't — non-owned cards link to the store. Requires Online features to be on; reuses the existing Online toggle.
  - The category-based templates depend on Steam's store category data being reachable. First paint may be empty; subsequent refresh ticks populate.

- **Decoration cards.** A new "Decoration" tab lets you pin fixed-slot cards in any shelf: a text label, an image banner, a focusable URL shortcut, or a transparent gap that focus skips over. New cards land at the slot you focused in the preview, and the shelf auto-switches to manual sort so you can drag them around later.
- **Combine sources in a single shelf.** Pick a primary source, then "+ Add source" stacks extras inline. A Union / Intersection toggle appears as soon as a second source is added.
- **Multi-key sort (primary + tiebreakers).** "Add secondary sort" adds extra keys; e.g. picking `discount %` + `metacritic` orders by discount with metacritic breaking ties. Each key has its own asc/desc toggle. `manual` and `random` only valid as a single primary.
- **Four media-focused smart shelf templates:** Soundtracks, Videos, Demos, and Cloud games (non-Steam shortcuts in Unifideck-style cloud collections). Game-focused templates (Quick Play, Recently Played, Long Sessions, Daily Pick, Random, Spare Time, etc.) now exclude non-game entries so they only surface real games.
- **Three heuristic smart shelf templates:** Backlog Rescue (installed-but-stale games on rotation so the shelf advances instead of pinning the same five), Forgotten Gems (owned-but-never-played titles with strong reviews), Weekly Rotation (a different slice of your library every week). Each ships with tunable knobs (cooldown, staleness window, minimum review score, rotation cadence).
- **Saved smart shelf templates.** Smart shelves can be saved as reusable templates and read back via the public API.
- **Add to shelf, from any game's context menu.** Both DS shelves and the native Steam library expose "Add to shelf" — the list only shows shelves that still have room and don't already contain the game (per-shelf limit + 50-card cap).
- **Y-button quick action** toggles the per-card highlight without opening the context menu.
- **"Decoration" entry on the shelf context menu** jumps the edit modal straight to the decoration tab. Decoration cards expose their own fallback menu since they aren't real apps.
- **More filter options.** "Shortcut type" gained 10 more Steam app types (Demos, DLC, Music / Soundtracks, Videos, Comics, Guides, Drivers, Configs, Hardware, Betas, Applications). "App status" gained 10 fine-grained statuses (Launching, Reconfiguring, Validating, Downloading active, Staging, Committing, Update queued, Update paused, Not installed, Installed idle).
- **"Online filters" tab on shelves with online sources.** When your shelf uses wishlist / store directly — or combines several sources and at least one is wishlist / store — a new "Online filters" tab appears in the editor with the online-only predicates (discount %, price ranges). On a combined shelf the online filters apply AFTER the sources are merged, so the same rules hit every contributing source.

### Changed

- **All preview tabs now look and behave the same.** Source, Filters, Visual, Display, and Decoration tabs of both shelf modal types render through one preview component — same cards, same hide flags, same trailing cards, same focus and scroll behaviour. Manual sort on the Source tab is just an interaction layer on top of the same render.
- **Always-on selection marks in preview.** Highlighted games show a green check, hidden games show a red ✕ with a dim overlay, and games you added manually via "Add to shelf" show a blue +. Marks appear in every tab whether the picker for that mode is open or not, so you can see at a glance what's highlighted / hidden / added.
- **"Decoration" entry on the shelf context menu** sits at the same visual level as Display and Visual, no longer buried under Management.
- **"Blank shelf" button in the template picker now stands apart** from the categorised template grid — full-width row with a thin separator and a plain text label, matching how the Smart shelf editor renders its "Custom / Blank" entry. Reads as the obvious "skip the templates and start empty" escape hatch instead of looking like just another template tile.

### Fixed

- **Combined shelves were dropping nearly every item when the "Online filters" tab had any filter on it.** The online filter (e.g. discount %) was being applied to every merged item — including games from collection / tab / filter sources that have no online price data — so collection items silently disappeared from the row. Now each source applies its own criteria first (online filters only run against wishlist / store children), then everything merges and the parent sort applies. Matches the "each source does its own thing, then we combine" model.
- **Combined shelves with the "exclude owned" toggle on were also hiding games from the collection / filter children** even though those are obviously games the user owns and put there on purpose. Render-time hide now scopes to items that came from an online child only.

- **Combined shelves with a non-manual sort were rendering out of order.** When a shelf merged several sources (e.g. two collections + a wishlist) and was sorted by something other than manual, the final row interleaved each source's own ordering instead of applying the sort across the whole merged set. Combined shelves now re-sort the merged result so the order matches a single-source shelf with the same sort.
- **Combined shelves with an online (wishlist / store) child are now showing the "Exclude games I already own" toggles** in the editor — AND the toggles now actually filter the row at render time. Before, the per-child propagation existed but the render-time owned-filter (the one that hides wishlist items you own via Epic / Amazon / GOG by name) only ran for direct online shelves, not for composites. Wishlist items you already own elsewhere now disappear from combined shelves too when the toggle is on.

- **Composite shelves with a wishlist or store child** were showing those cards as `#12345` instead of real game names, and showing the install indicator + "Not installed" status text that made no sense for games you don't own. Names now come from the Steam Store API (same path wishlist / store shelves already use), and the install state visuals are hidden ONLY for the actually-non-owned cards — owned cards in the same composite keep their playtime and install state.

- **Hero art on the first shelf occasionally flashed a broken-image icon for a frame** when that shelf was promoted to the recents slot. The fade-out between hero URLs (when a fallback URL kicks in) is now instant; only the fade-IN remains.

- **"Shelf as recents" (experimental) was still forcing alphabetical order on shelves using manual sort.** Now the promoted shelf honours your manual order AND falls back to your chosen `manualBaseSort` (with per-key asc/desc and multi-key chains) for items outside the manual order — exactly matching what you see on the home.

- **New smart shelves weren't saving.** Creating any of the new templates (friends playing, low battery mode, almost finished, couch / co-op / party games, short battery, long session night, travel mode, hidden gems, never touched classics, recent hidden installs, monthly spotlight, seasonal rotation) failed silently — the shelf disappeared right after clicking Save. The Python backend's mode allow-list wasn't updated when those shipped; it now matches the TypeScript enum.

- **"100% off" / "Free now" store shelves still missed currently-free games after the previous fix.** Steam's specials endpoint silently caps each query at ~100 rows regardless of what we asked for, so only the first 100 specials were ever reaching the shelf — anything past that, plus titles tagged Free Weekend (a separate Steam taxonomy from regular discounts), never made it in. We now read 3 pages of specials plus the Free Weekend category alongside the existing free-price endpoints, and force the store cache to refresh on next mount so existing users don't wait on the old cache.

- **Returning from a game detail page no longer "reloads" everything.** Previously, navigating to a game (or any other screen) was destroying the entire home React tree, so coming back triggered every shelf to re-resolve, every card to flash through the shimmer, and every hero art to re-fetch. Now the tree stays alive while the home is invisible — when you come back, everything is exactly where you left it, instant.
- **"Add to shelf" actually adds the game.** The library context menu's "Add to shelf" wasn't taking effect — the appid was being silently dropped because it wasn't in the shelf's underlying source. Menu-added games now appear at the end of the shelf (and the preview shows them with the new blue + marker).
- **X button on a card is now context-aware.** On a game you added manually → "Remove from shelf" (the card disappears). On any other card → "Hide from shelf" / "Show in shelf". The previous unconditional remove was bouncing drag-ordered cards back to a different position when you pressed X.
- **Library card menu shows DS submenus on every game.** "Add to shelf" and "Remove from shelf" now appear on every card in the native Steam library, not just on cards inside DS shelves. (The previous bail-out happened on modern Steam clients that don't expose `_owner.pendingProps.overview.appid`.)
- **Per-shelf hero art is faster to appear**, especially on home boots with multiple hero shelves. Multiple optimisations: one shared discovery of the active CSS Loader theme (was N parallel scans, one per hero shelf), throttled mutation observers, asynchronous image decoding off the main thread, persistent image cache (heroes you've seen before show instantly across sessions), short cross-fade.
- **No more broken-image-glyph flash before a card or hero loads.** Eviction from the in-memory cache no longer invalidates the URL while a card is still using it (revocation is deferred 30 s), and the cache is now sized for populated homes (320 entries instead of 120). Cards also walk the URL fallback chain at mount time and start at the cached URL directly, skipping the 1-2 useless local-path 404s every remount used to pay.
- **Home no longer locks the UI thread.** A storm of mutation events (shimmer pulses, focus class flips, label resolutions) was running the full set of patch installations synchronously on every event — hundreds of times per second on a populated home. Now coalesced to at most once per frame. Navigation feels noticeably snappier.
- **Decoration / synthetic cards and menu-added games appear correctly in every preview tab** (they were only showing in the Source tab before). All previews are now strictly consistent across tabs and shelf types.
- **No discount badge on shelves where you already own the games.** Preview now matches the home: only wishlist / store / composite-with-online-child shelves can show the % off badge.
- **Library context menu items no longer appear twice** ("Add to shelf" 2× / "Shelf" 2×) on certain games.

- **Online shelves no longer hide games you don't actually own.** On devices with many cloud-play shortcuts (Xbox via Unifideck Microsoft, etc.), the wishlist / store-on-sale rows were name-matching against those cloud entries and hiding wishlist items that share a title with a game you have access to via subscription but don't own. The name-based dedup now respects the same "include cloud-play games" toggle the appid-based dedup uses, and ignores punctuation differences (so "Kingdom Come Deliverance" matches "Kingdom Come: Deliverance" cleanly).
- **Wishlist + store shelves with a price-based multi-key sort.** The shelf was returning zero games after a recent change; it now ranks the full row by the price key first (with the secondary key as a real tiebreaker) instead of only ordering the local subset.
- **Filter shelves with multi-key sort + reverse persist correctly.** Both per-key and uniform reverse flags reach the resolver for filter shelves of every schema vintage.
- **Collection picker in the Edit Shelf modal no longer stays empty after Steam boot.** A 30-second refresh + modal-local re-fetch fills the picker as soon as Steam exposes the data.
- **QAM action row alignment.** The `+ / import / export` row above each shelf list now keeps the right buttons inside the QAM edge, regardless of Steam version.
- **Edit Shelf preview now shows the discount + NEW badges**, sized to the smaller preview cards, never clipped at the top, and sitting cleanly above the focus indicator.
- **Home-shelf badges no longer jitter with scrolling.** Per-frame badge tracking was removed; badges re-anchor on scroll, resize, focus, and blur only.

## [2.3.2] - 2026-05-27

### Added

- **Separate toggles for the NEW and DISCOUNT tags** — globally (QAM Visual section) and per-shelf (Edit Shelf / Smart Shelf Display tab and per-card menu). You can now hide one without hiding the other.
- **Hero art behind shelves now shows a subtle shimmer placeholder while loading** (same look as the game card shimmer), and a corrupt response from Steam's CDN is now treated as a load failure — so a broken image never paints, even briefly.

### Fixed

- **Update notification works again after you self-upgrade.** Previously the daily cache could "remember" the version you just installed and silently report "no update" for up to 24 hours. The notifier now refreshes its cache before the boot check (whenever the Steam Deck is online), so a fresh release shows up the next time Steam starts. Toggling the notification OFF and back ON inside the QAM (with network) does the same — and now also clears any previously-dismissed version, so a release you dismissed earlier (or hit dismiss on by accident) can resurface. The boot check is also delayed a few seconds so the network has time to come up.

## [2.3.1] - 2026-05-27

### Changed

- **No more discount tag on games you already own.** The green % off badge stops appearing on cards from your library — only games you don't own (wishlist / store) keep showing the discount.
- **"Open options" hint is now translated.** The action label next to the ⋯ button on each shelf now shows in your language instead of plain English.
- **"Reorder" / "Save Order" X-button hints on the QAM shelves list are now translated** across all 19 supported languages, matching the rest of the QAM.
- **Import / Export now points to the right Downloads folder on Bazzite and other non-SteamOS systems.** The defaults stopped assuming the user account is named `deck` — the modal opens at your actual `~/Downloads` regardless of distro or login name.
- **Wishlist on Bazzite (Flatpak Steam) now works.** Steam cookie and user-ID lookups now also check `~/.var/app/com.valvesoftware.Steam/...`, so wishlist-sourced shelves resolve on systems shipping Steam via Flatpak.

### Fixed

- **Refresh on a shelf now shows a brief visual dim on that one shelf only** — so you can see the click took effect even when the cached result hasn't changed, without the whole home flashing at once.
- **Cards no longer vanish mid-refresh on online shelves.** Cards that survived a refresh stay visible while new metadata loads, instead of momentarily disappearing and reappearing on scroll.
- **The per-card "Refresh" entry on online shelves now reads "Refresh cache" — and was already actually clearing the cache.** The label said "Refresh" but the underlying action was the same cache-clear used by the QAM shelf menu. The label now matches what the action does.
- **Crash on shelves backed by a Filter source after a while.** Some filter results match games whose artwork all fall back to a placeholder; that path was hitting a React rendering error after some time and freezing the row. Fixed — the placeholder cards now render cleanly without ever tripping the error.

## [2.3.0] - 2026-05-24

### Added

- **Hero art behind your shelves (#41).** Each shelf (regular or smart) has an "Enable hero art" toggle in the edit modal's Visual tab — turn it on and the focused game's artwork appears behind that shelf, following it wherever it sits. A new global toggle in the QAM (Visual section) turns hero art on for *every* shelf at once.
- **Game name above the shelf, like native Recents.** With an ArtHero-style CSS Loader theme active, each full-page shelf shows the focused game's name and info above its row — the same effect Steam's native Recents shelf has, and the label follows the game you're on.
- **Cloud-play sub-toggle for the online shelves** (QAM Online Features + Edit Shelf modal). Cloud-only catalogue entries — like Xbox Cloud Gaming games surfaced via Unifideck's Microsoft Store integration — are now kept visible on your wishlist / store-on-sale shelves by default, even with "Include non-Steam shortcuts" on. Locally-installed non-Steam games (Epic / GOG / Amazon / Ubisoft) still count as owned. Flip the new sub-toggle on if you want cloud-only entries treated as owned too.
- **Theme integration for your shelves.** Themes installed via CSS Loader now reach Deck Shelves' promoted shelves automatically: **No Hero Gradient** clears the hero mask; **Hero Fullscreen / Art Hero FullBG** snaps the shelf to 100vh with the hero filling the screen; **No Home Text** hides DS card labels (only under "Force CSS Loader themes"). **Transparency Tweaks** dims unfocused card portraits; **Round / More Round** rounds the NEW and discount tags.
- **"Force CSS Loader themes" only shows when CSS Loader is installed.** No more dead toggle on devices without the plugin.
- **Focus Highlight Color theme support.** Install the theme and Deck Shelves auto-adjusts: with Round Compatibility enabled, DS card focus disappears (matching the theme's native behaviour); without it, the colored animated outline shows behind the NEW / discount badge with a clean 1 px gap on every side.
- **Game Cover Shine Animation Color theme support.** The shine sweep on focus reaches Deck Shelves cards automatically — no extra configuration needed.
- **NEW / discount badges always on top.** Badges now render in a separate overlay above the entire UI, so they stay in front of theme focus rings and other Steam overlays no matter the theme combination.

### Changed

- **"Force CSS Loader themes" now applies to every shelf** — and works whether you keep the native Recents row visible or hide it. Themes like ArtHero reach all your shelves consistently.
- **Online owned filter rewritten** to use Steam's own library collections directly, instead of guessing by whether Steam has cached metadata for a game. Wishlist results that Steam happens to know about (because you viewed them in the store) no longer disappear from your "on sale" shelves.
- **Online shelf size respects your configured limit.** The resolver now fetches a buffer above the limit so the shelf still fills to N games after owned/name filtering, instead of dropping below the limit.
- **The Edit Shelf modal "found X games" count and preview now match the rendered shelf.** Toggling per-shelf "Ignore games I own" or the new cloud-play sub-toggle inside the modal updates both immediately.
- **Online sub-toggle descriptions removed** so the QAM and Edit Shelf modal feel less cluttered. The main "Online features" toggle still carries its description.

### Fixed

- **Hero art briefly flashing then vanishing as you d-pad between cards** (with the "Force themes" toggle OFF). Smoothed out.
- **"Force themes" with full-screen hero themes — first shelf hero no longer sits below the header.** Each promoted shelf now fills the viewport cleanly; the next shelf's hero no longer peeks into the bottom of the one you're viewing.
- **Inter-shelf hero blending refined.** With recents hidden, the first DS shelf's hero reaches the top of the screen, and the transition into the second shelf has a subtler fade. With native recents visible, the first DS shelf hero overlaps native with a smoother fade instead of a black band between the two arts.
- **NEW and discount tags now round under Round / More Round themes** — they were stuck at 0px corners even with the theme installed.
- **Unfocused card portraits respect "Transparency Tweaks"** (dim while unfocused, full opacity when focused). NEW / discount tags now stay fully visible regardless of the card's dim state.
- **Game labels no longer show on every card all the time** — only on focus, as before.
- **The purple cover-shine gradient no longer locks on every card.** "Game Cover Shine Animation Color" plays its focus animation as intended instead of leaving the gradient visible everywhere.
- **"Hide non-Steam cloud-play" toggle now stays as you left it** instead of resetting to off on every restart.
- **"Force CSS Loader themes" and the global hero toggle now stay on.** They were being lost on every save; fixed.
- **D-pad up no longer makes the home flicker / reload.** Pressing up from the top shelf used to dip into the hidden Recents row and jolt the screen — focus now stays on your shelves.
- **No more flash of reloading shelves on the first move after a Steam restart.**
- **The hero art and name no longer show a game you've hidden** (with "ignore games I own" on) — they follow the first game actually shown.
- **Leaving a shelf keeps the last game's hero art** instead of snapping back to the first game.
- **Online shelves: the game name no longer gets stuck as a "#number"** while it loads — the real name appears once fetched.
- **Force themes + ArtHero: shelves no longer overflow the screen.**
- **Online shelf context menu now shows the game's name** as its title instead of "Shelf".
- **Highlighted-card size and TiltedHome card spacing** are correct again with "Match native card size" on.
- **Refresh works on smart shelf cards** from the long-press / Menu context menu.


## [2.2.2] - 2026-05-15

### Fixed

- **"Use shelf as Recents (experimental)" no longer crashes the library after a Steam restart (#60).** With the toggle on, opening Library on a fresh boot could show Steam's error page (`An error occurred while rendering this content`). The injection now waits for Steam's library catalog to be ready before it touches the recents shelf, and only ever sends games you actually own — wishlist / store entries you don't own are skipped automatically. If your first shelf is a wishlist or store shelf, recents falls through to the next visible shelf instead of trying to use a non-owned game (which is what caused the crash).
- **"Use shelf as Recents" applies without needing to restart Steam.** Toggling the option on now updates the recents shelf as soon as Steam has finished loading your library — usually within a few seconds — instead of requiring a restart for the swap to take effect.

## [2.2.1] - 2026-05-14

### Added

- **Two-step "Hide owned games" — Steam first, non-Steam optional.** Both the global toggle (in the QAM, under Additional Features) and the per-shelf toggle (on each wishlist / store shelf) now reveal a sub-option when turned on: the main toggle hides games you own on Steam, and the sub-toggle also hides non-Steam shortcuts (games you added manually that share a name with a store entry). Useful when you want a clean wishlist without losing track of games you only run via a launcher.

### Changed

- **Wishlist / store shelves now show owned games by default.** The "Hide owned games" toggles (global and per-shelf) start off — you'll see your full wishlist or store list, including games you already have, unless you opt in to filtering. Existing users who already enabled the toggle keep their setting.

### Fixed

- **Global "Hide owned games" toggle now does what it says.** Turning it on in the QAM correctly hides owned games across every wishlist / store shelf, and turning it off shows them. Previously the global toggle had no visible effect — owned games were always hidden regardless. The sub-toggle for non-Steam shortcuts also works correctly now and no longer turns itself off after saving.
- **Per-shelf "Include non-Steam shortcuts" sub-toggle reflects in the preview.** Toggling it on in the shelf editor now updates the preview immediately, matching what the home shelf will show.

## [2.2.0] - 2026-05-14

### Added

- **"Additional features" section in the QAM.** Plugin-wide extras now live in their own collapsible section (between Behavior and Shelves) — Check for updates and Online features (with sub-toggles for Wishlist / Price sort / Hide owned). The update notification banner also moved above the main on/off switch, so update reminders stay visible no matter which section you have collapsed.
- **Browse / wishlist as a shelf — built-in Steam Store integration.** Turn on "Enable online features" in the new Additional Features section (off by default) and create shelves backed by your Steam wishlist or by currently-discounted Steam Store games. You'll see the privacy notice first so you know exactly what Deck Shelves contacts and how often. Two new sort options let you order by **Price (low to high)** or **Discount (high to low)**; four quick templates are added: "Wishlist", "Wishlist on sale", "Free wishlist", and "Free now" (any Steam game temporarily free — wishlist not required).
- **Exclude games you already have.** Per-shelf toggle on wishlist / store sources. Turn it on and the shelf hides any game whose exact name matches a title in your local library — including non-Steam shortcuts that share a name with a Steam Store entry. Useful for "discovery" shelves where you don't want to see what's already in your library.
- **Discount badges on cards.** Cards in online shelves show a green badge in the corner (e.g. "75% off") whenever the game is on sale. The badge stays visible even on placeholder cards (when the artwork is still loading or unavailable).
- **A-button opens the Steam Store page on wishlist / store cards.** Press A on any card in a wishlist / store shelf and Steam jumps straight to that game's store page in the overlay browser. "View more" on a wishlist shelf opens your full wishlist; "View more" on a store shelf opens the Specials page.
- **Refresh action on every shelf.** Online shelves expose "Refresh cache" (clears the wishlist / price caches and re-fetches); random and smart shelves expose "Refresh" (re-shuffles the source). Available from the QAM action menu, the shelf-card menu, and the trailing refresh tile.
- **Artwork falls back through more variants.** Newly released games sometimes ship to the Steam Store before their standard portrait artwork is generated (NBA 2K26 and a few recent Sims entries were the prompt). The plugin now tries a wider set of Steam CDN variants (high-resolution portraits, multiple capsule sizes, the landscape header) before falling back to a name placeholder — and the placeholder still shows the discount badge.
- **About page — new "Online" tab.** Documents the online features end-to-end: how to enable, the privacy bound, the wishlist + store sources, the online templates, the price/discount sorts, the "Exclude owned games" toggle, the discount badge, and the refresh / cache behaviour. Translated across all 19 languages.
- **Your Steam wishlist, as a shelf.** Turn on "Enable online features" in the QAM Additional Features section (off by default) and you can create a shelf that shows your Steam Store wishlist — automatically synced once a day. You'll see the privacy notice first so you know exactly what Deck Shelves contacts and how often. Two new sort options let you order the wishlist by **Price (low to high)** or **Discount (high to low)**, and three quick templates are added to the shelf picker: "Wishlist", "Wishlist on sale" and "Free wishlist". Wishlist shelves show a small globe icon next to their name in the QAM list so they're easy to spot.
- **Shelf action labels are now clearer.** The Hide / Show / Delete actions in the shelf card menu now say "Hide shelf", "Show shelf" and "Delete shelf" (translated across all 19 languages), so it's obvious they apply to the shelf and not the game.
- **Update notifications inside the QAM.** Deck Shelves now checks GitHub once a day for a new release and shows a small banner at the top of the QAM panel when one is available, with quick links to view the release or dismiss it for that version. The check runs only when you have it enabled (toggle in Behavior; on by default), only when you are online, and never gets in the way.
- **Right-click / Menu shortcut on shelf cards — `Deck Shelves > Shelf > …`.** Long-press or press the menu button on any card in your shelves to get a Deck Shelves submenu with **Edit · Duplicate · Collapse / Expand shelf · Hide / Show · Move up / Move down · Delete** — the same actions you already have in the QAM list, available right where you are.
- **More native-style entries in the fallback menu.** When Deck Shelves can't extract Steam's full native menu (older builds, unusual configs), the fallback now also shows **Verify integrity of installed files**, **Uninstall** and **Browse screenshots** alongside Play / Properties / View Details — same `SteamClient` calls Steam uses, so the behaviour matches the native menu.
- **Three new "Sort by" options.** The sort picker in the shelf editor now includes **App Status** (Running / Installing / Downloading first), **Deck Compatibility** (Verified → Playable → Unsupported → Unknown) and **Controller Support** (Full → Partial → None). All three support the ascending / descending toggle already available for other sorts.

### Fixed

- **Edit modal preview now matches the home shelf — full overhaul.** A pile of small differences between the preview and the real home shelf are gone in this release: switching tabs no longer leaves the preview showing the old game count; the "See more" and refresh tiles now follow the same rules as the home shelf and appear in the right order (refresh, then "See more"); name-only placeholder cards stop overshooting their neighbours; "See more" / refresh tiles no longer steal gamepad focus; the faint blue/gray gutter around featured cards is gone; the focus highlight now hugs the image instead of floating around it; game names and playtime show only on the focused card (matching home); card sizes stay consistent when you switch to manual sort, the highlight picker or the hidden-games picker. The Refresh tile in the preview also actually re-resolves the shelf now (random / smart shelves visibly reshuffle), with cache scoping that doesn't disturb your saved home shelves.
- **Focus returns to the right game when leaving a game's page.** The home screen no longer snaps focus back to the first game when you exit a game's view — it stays on the card you came from, even when "Show first shelf background art" is off (which used to be a workaround).
- **Collection filter — better behaviour and easier to configure.** Two paired improvements: (1) shelves with a Collection filter no longer mix in random library entries when the collection name didn't resolve to any games (reported on Bazzite — empty result is now visible instead of leaking the whole library); (2) the input is now a dropdown populated with your real Steam collections (same source as the Source picker), so name lookups are bypassed entirely. The invert toggle is also now available for Collection filters — useful for "everything except this collection" shelves.
- **Settings save reliability hotfix.** A regression in this update could cause shelves to "disappear" on the next load (in fact they were silently reset to defaults because the new update-notifier settings were rejected by the loader). Fixed before release; existing shelves are preserved.
- **Smart shelves now respect "Match native size" on first appearance.** Previously, a smart shelf could render at the default card size when it mounted later than the rest (e.g. smart shelves gated by visibility windows), even with the global "Match native size" toggle on. They now pick up the native dimensions on the first frame.
- **`appStatus = running` filter picks up running games promptly — and no more empty "loading gap" between shelves.** Two paired fixes for the same area. The plugin now subscribes to Steam's game-launch event and re-reads the live state right away (debounced 1.5 s so the multi-event launch sequence coalesces into one refresh) — Running shelves update without waiting for the 30-second poll. And the transient spinner that used to flash between shelves on every refresh (visible as a 30 px empty band) is now reserved for the very first load; subsequent refreshes keep the prior content visible until the new metadata lands.
- **Shelf-card menu — the `Deck Shelves` entry reliably appears in the native menu (across SteamOS 3.5 → 3.9).** Long-press or press the menu button on any card in your shelves and the full native Steam menu (Play, Manage, Properties, achievements, friends playing, etc.) now opens with the Deck Shelves submenu appended at the bottom — not replacing the native entries. Several stacked issues were silently hiding the submenu: the bundle's loader couldn't find the menu actions; modern Steam wraps the context menu in a memo / thin function wrapper that hid the actual class our injection needed to patch; menu labels were reading from the wrong i18next instance and falling back to English. All of those are addressed, plus a parallel injection path patches Steam's menu class directly at plugin mount as a safety net for future Steam UI changes. The DFL fallback menu (when the native one can't be reached) was also enriched with Verify integrity / Uninstall / Browse screenshots so it matches the native menu more closely.

## [2.1.1] - 2026-05-09

### Added

- **D-pad now stops on collapsed shelves.** Vertical navigation with the D-pad now lands focus on the `+ Title` line of a collapsed shelf instead of skipping over it. Press A to expand. Mouse / touch click still toggles as before.
- **British English and Canadian French.** The plugin now supports `en-GB` (British English — "Favourites", etc.) and `fr-CA` (Canadian French — corrected accents and Canadian vocabulary). Both are selected automatically based on the Steam Deck's system language.
- **Traditional Chinese** (`zh-TW`) translations added.
- **Filter by app status.** New filter type with four toggles: **Downloading / Updating** (update actively in progress), **Queued / Paused** (update pending but not yet running), **Installing** (first-time install), **Running** (currently launching or playing). Default selection is both download states, enabling a "Download Queue" shelf out of the box. Extends the existing boolean "Update Pending" filter with per-state granularity.

### Fixed

- **"New" badge window corrected to 14 days.** The badge filter was using 30 days internally while the shelf renderer already used 14 — now both match, consistent with Steam's native "new to library" badge.
- **Hero art not restoring after returning from a game.** Cover art could get stuck showing the last-played game instead of updating when you returned to the home screen. Fixed.

## [2.1.0] - 2026-05-08

### Added

- **Filter by shortcut type.** New filter type in the shelf editor: pick which kinds of library entries to include — **Games** (Steam games), **Software** (Steam apps like Streaming apps), **Tools** (Proton, runtimes, redistributables), or **Non-Steam links** (shortcuts added outside Steam). Mix and match; each kind has its own toggle.
- **Deduplicate by exact name.** New toggle in each shelf's Display tab (and a global counterpart in settings). When on, if two entries share an exact name, only one is kept — Steam wins over non-Steam shortcuts.
- **Manually hide games per shelf.** New "Hide specific games" toggle (last entry in the Display tab) reveals a mini-card picker where you tap a game to exclude it from that shelf. The shelf still targets the configured number of visible games — extras are fetched automatically to fill the gap.
- **Narrow collection and tab sources with filters.** When a shelf's source is a collection or library tab, a dedicated **Additional Filters** tab appears in the shelf editor with a full filter panel — same options as the regular Filters tab, applied on top of the source results (e.g. source = Favorites collection, refine to installed only).
- **Per-day schedule for smart shelves.** A new **Allow per-day schedule** toggle in the Smart Filters tab opens a dedicated **Overrides** tab where you can set different hour ranges for specific weekdays — e.g. "10:00–12:00 on Mon/Wed/Fri but 18:00–22:00 on weekends". The Overrides tab shows a summary of the configured days/hours at the top and per-weekday hour-range editors below. The basic visibility settings (restrict by hour, default hour ranges, days of the week) now live at the bottom of the Smart Filters tab itself.
- **Live preview of how each shelf renders.** The preview area in both shelf editors now shows real cards as they appear on the home: cover art, **game name**, **status line** (playtime / install / update), **compat tier badges** (Verified / Playable / Unsupported), and the **New** badge — with the **shelf title** above and the **See more** / **Refresh** trailing tiles where applicable. Every Display-tab toggle updates the preview instantly, so you can see the effect of "hide compat icons" / "hide game names" / etc. as you flip them.

### Changed

- **Edit modals — taller content area.** The edit modals are ~60–80px taller and the scrollable tab content has matching extra room, so configuring a shelf with many filters or smart-shelf params no longer feels cramped.
- **Faster shelf load after a Steam restart.** Each shelf's per-game metadata lookups now run in parallel instead of sequentially. On a cold cache (typical right after Steam restart) this collapses populate-time from "N games × per-call latency" to roughly "the slowest single call", so artwork / playtime / status appears with much less staircase.

### Fixed

- **Shelves with time windows now disappear on time.** A combination of a 60-min resolve cache and a missing re-render step could keep a shelf visible up to an hour after its configured window ended. Visibility is now re-checked immediately at the boundary, caches are flushed, and modes with built-in time logic (e.g. Spare Time) are also covered even when no explicit schedule is set.
- **Days of week — empty selection now warns instead of silently meaning "every day".** When you uncheck all 7 weekday chips, the picker shows an orange warning that the shelf will not appear. The default for new shelves is still all 7 days checked.

## [2.0.1] - 2026-05-06

### Added

- **Cancel really cancels — for every template.** Adding a shelf from any picker entry (Blank, every regular template, every smart template, Custom) now opens the editor against a draft — nothing is created in your shelves list until you press **Save**. Closing the modal or pressing Cancel discards the draft, so the prior "empty New shelf" leftovers no longer show up after browsing the pickers.
- **Per-shelf hide toggles for "See more" and the refresh tile.** Two new toggles in each shelf's Display tab and global counterparts in the QAM Visual section. The shelf still recomputes / refreshes on its normal cadence; only the visible trailing card is suppressed.
- **Sort direction toggle.** Each sort dropdown in the shelf and smart-shelf editors now has a small **↓ / ↑** button next to it that flips between descending (the natural order) and ascending. Hidden for **Manual** and **Random** where direction has no meaning.
- **Icons on Steam Cloud and Deck Verified template buttons** in the shelf-template picker (☁️ and 🛡✓), matching the visual style of the other template entries.

### Changed

- **Up to 50 cards per shelf.** The per-shelf limit slider now goes to 50 in both the regular and smart shelf editors.
- **"New" tag matches the native one.** Themes that recolor the native SteamOS "Novo / New" badge (Colored Toggles, Obsidian, Outrun, etc.) now tint our badge in the same color automatically — no extra setup. Without a theme it stays the native Steam blue.
- **Random isn't offered as a base sort under manual order.** Manual order + random would re-shuffle the shelf on every render, defeating the explicit ordering. Existing shelves that had this pairing keep their stored value; the option is just hidden from the dropdown.
- **Less Proton / runtime noise in smart shelves.** Quick Play, Deck Picks, Rediscover and On Deck now skip non-game entries (Proton, Steam Linux Runtime, redistributables, tools) so the shelves surface real games even when your library has a lot of system-managed installs.

### Fixed

- **Merge filter is editable again.** Picking **Merge** as a filter type now opens an inner panel where you can add, remove and reorder its child filters and pick its own AND/OR mode. Nesting Merge inside Merge works as well — useful for "Steam installed **or** any non-Steam shortcut" in a single shelf.
- **Unifideck shortcuts no longer always count as installed.** Shortcuts registered by Unifideck used to report as installed even when the underlying app wasn't on disk. The plugin now checks the `[Unifideck] Installed` collection (with size-on-disk and last-played as fallbacks) so the **Installed** filter and indicators reflect reality.

## [2.0.0] - 2026-04-30

### Added

- **Custom smart shelf.** New "Custom / Blank" entry at the top of the smart-shelf template picker. Build a smart shelf from scratch with your own filters and sort — same flexibility as a regular shelf, but it lives in the smart-shelf section.
- **Time-of-day visibility for smart shelves.** Each smart shelf can now restrict itself to one or more hour ranges (e.g. show "Spare Time picks" between 06–09, 12–14 and 19–22) and / or to specific days of the week. Add as many ranges as you like with the **+ Add range** button; remove individual ranges with the ✕ button. Day-of-week chips and range controls are fully gamepad-navigable (D-pad left/right between hour pickers and across the 7-day row). Spare Time shelves come pre-populated with their built-in windows; Time of Day shelves show the inner hour boundaries as informational context. Days default to all-checked — uncheck the ones you want to exclude (an empty selection means "never visible"). Visibility flips happen exactly at the boundary — no polling.
- **More dials per smart-shelf template.** Every smart shelf that previously hardcoded a Steam Deck compatibility filter (Quick Play, Deck Picks, Rediscover, On Deck, Spare Time, Long Session, Best Unplayed, Not Started, Interrupted) now exposes a **Deck Compatibility** dropdown in the editor — pick "Any / Unsupported and above / Playable and above / Verified only" per shelf. Spare Time also gets a **Max playtime** field (was hardcoded at 120 min). Playtime values are now editable as numeric inputs instead of sliders for finer control.
- **New "Smart filters" tab** in the smart-shelf editor groups the mode-specific tuning (params, visibility window, day filter, time-of-day boundaries) so the Source tab stays focused on the basics (title, sort, limit, refresh interval). The old "Filters" tab is now labeled "Additional filters" and the toggle that gated it was removed — adding filter rows is enough.
- **Manual-sort preview centering fixed.** When you reordered a card to the left in the highlight/sort preview row, the card occasionally scrolled off the left edge. It now stays centered both ways.

- **No more empty dropdowns.** Source pickers (collection / library tab / external) and the smart-shelf sort picker now always show a value: the matching one when there is one, or a localized "Select" placeholder when no options have loaded yet. The smart-shelf sort defaults to a sensible per-mode value (recent / playtime / random / alphabetical) instead of an opaque "use default".

## [1.6.3] - 2026-04-29

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
- **Hide home tabs.** Hides the native What's New / Friends / Recommendations area independently of "Hide recent games".

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
