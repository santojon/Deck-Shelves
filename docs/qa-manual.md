# Deck Shelves — Manual QA Scenarios

*[Leia em português](pt-BR/qa-manual.md)*

Manual test checklist for regression testing on a real Steam Deck (SteamOS Stable or Beta).

## Prerequisites

- Decky Loader installed
- Plugin deployed (`pnpm run deploy:deck`)
- At least 5 games in the library, some favorited, some installed

---

## 1. Plugin Enable / Disable

| # | Scenario | Expected |
|---|----------|----------|
| 1.1 | Plugin toggle OFF → shelves section visible, global toggles and smart shelves hidden | Only the main toggle and shelf list visible |
| 1.2 | Plugin toggle OFF → no shelves injected on Home screen | Native Home unchanged |
| 1.3 | Plugin toggle ON → shelves appear on Home within ~2s | Shelves render below recents |
| 1.4 | Plugin toggle ON → global toggles section appears in QAM | "Apply globally" section visible |
| 1.5 | Plugin toggle ON → smart shelves toggle appears in QAM | Smart Shelves section visible |
| 1.6 | Toggle OFF while shelves visible → shelves disappear from Home | Native Home restored |

---

## 2. Shelf Management

| # | Scenario | Expected |
|---|----------|----------|
| 2.1 | Create shelf via "+" → template picker opens | Modal with templates displayed |
| 2.2 | Select blank template → edit modal opens directly | EditShelfModal with empty config |
| 2.3 | Create shelf with filter (Favorites) → shelf appears on Home | Games filtered correctly |
| 2.4 | Hide shelf via ellipsis → shelf disappears from Home | Shelf shows grayed in QAM |
| 2.5 | Show shelf via ellipsis → shelf reappears on Home | Shelf active again |
| 2.6 | Delete shelf → confirmation modal; confirm → removed | Shelf gone from QAM and Home |
| 2.7 | Move shelf up/down via QAM → order changes on Home | Order matches QAM |
| 2.7a | QAM shelf list with a controller: A on a shelf name grabs it; D-pad up/down moves it one place (stops at the ends); A saves | The row keeps Steam's own highlight, no extra frame or hint; while grabbed, Steam's button bar shows Move up / Move down (D-pad), Save Order (A) and Cancel (B); order saved once, Home follows; focus stays on the moved row |
| 2.7b | Same, then B instead of A | Row goes back, nothing saved, the panel stays open, focus stays on the row |
| 2.7c | Hold-drag a row with touch or a mouse | The dragged row is dimmed; order saved on release |
| 2.8 | Edit shelf title → title updates on Home row header | New title rendered |
| 2.9 | Edit shelf limit → card count changes | Number of cards changes |
| 2.10 | In Steam's library, press ≡ on an installed game, a game that is not installed and a non-Steam shortcut | "Add to shelf" appears once in each menu, just before Properties |
| 2.11 | Right after Steam starts, open the first game menu from the library and keep it open for a few seconds | "Add to shelf" stays in the menu |

---

## 3. Navigation (D-pad)

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | D-pad DOWN from last item in "Recently Played" → first shelf card gains focus | Bridge fires correctly |
| 3.2 | D-pad UP from first shelf card → focus returns to native section above | UP bridge fires correctly |
| 3.3 | D-pad LEFT/RIGHT at shelf edge → no wrap-around to another app | Edge blocked |
| 3.4 | `hideHomeTabs=true` + D-pad DOWN from last shelf → focus stops; no wrap to first shelf | **Bug A fix** |
| 3.5 | `hideHomeTabs=false` + at last item of native tab content + D-pad DOWN → focus stops | **Bug B fix** |
| 3.6 | `hideHomeTabs=false` + navigate DOWN from recents into shelves → correct | Bridge still works for top siblings |

---

## 4. Global Toggles

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | `matchNativeSize=true` → card dimensions match native Recents cards | Same height/width as native |
| 4.2 | `highlightFirst=true` → first card of every shelf renders as landscape featured | Wide card at left edge |
| 4.3 | `hideStatusLine=true` → status text hidden on all shelf cards | No "Play" / "Install" text |
| 4.4 | `hideNewBadge=true` → "NEW" badge hidden on all shelf cards | No badge shown |
| 4.5 | `hideCompatIcons=true` → Deck compat icons hidden on all cards | No compat indicator |
| 4.6 | Global toggles hidden when `enabled=false` | Section gone from QAM |
| 4.7 | `globalHideShelfTitle=true` → all shelf title rows hidden; cards row stays expanded | No collapsible title; cards always visible |
| 4.8 | `globalHideGameNames=true` → game name labels hidden on every card | Card art only, no name beneath |
| 4.9 | `globalHideInstallIndicator=true` → install/download/update/play icons hidden in status line; playtime still visible | Only the playtime text remains in `.ds-card-status` |
| 4.10 | Per-shelf override: enable `hideShelfTitle` / `hideGameNames` / `hideInstallIndicator` on one shelf only → other shelves unaffected | Per-shelf toggle wins over global=false; global=true wins over per-shelf=false |

---

## 5. Hide Recents

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | `hideRecents=true` → native Recently Played section hidden | Section not visible on Home |
| 5.2 | `hideRecents=true` + `heroBackground=true` → focused card shows background art | Hero art visible |
| 5.3 | `hideRecents=true` + `recentsReplaceSource=true` → the native Recents row shows the first shelf's games and title | First shelf uses native styles |
| 5.4 | `hideRecents=false` → sub-toggles (hero, replace-source) hidden in QAM | Only visible when hideRecents is on |

---

## 6. Hide Home Tabs

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | `hideHomeTabs=true` → Novidades/Amigos/Recomendados tab bar hidden | Tabs not visible |
| 6.2 | `hideHomeTabs=false` → tabs visible and navigable | Tabs work normally |
| 6.3 | `hideHomeTabs=true` → D-pad DOWN from last shelf stops (Bug A) | Focus does not wrap |

---

## 7. Smart Shelves

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | `smartShelvesEnabled=false` → smart shelves section not shown in QAM | Section hidden |
| 7.2 | `enabled=false` → smart shelves toggle not shown at all | Even toggle hidden |
| 7.3 | Add smart shelf → the create picker lists the smart templates by category (online-only ones hidden while online features are off) | CreateShelfModal |
| 7.4 | Smart shelf with no results → not rendered on Home | Shelf invisible (null render) |
| 7.5 | Smart shelf with results → rendered on Home between standard shelves | Appears in correct position |
| 7.6 | `smartShelvesAtBottom=true` → smart shelves appear below standard shelves | Order respected |
| 7.7 | `surpriseMe=true` → manual list hidden, system picks templates | No manual list in QAM |
| 7.8 | `surpriseMe=true` + count=0 → system decides count | Variable shelf count |
| 7.9 | Daily Pick shelf → same result throughout the day | Stable within UTC day |
| 7.10 | Edit smart shelf → sort override + filterGroup + smartParams + refreshIntervalMinutes round-trip after save/reload | Persisted; applied on next render |
| 7.11 | Refreshable smart shelf (`random_pick`, `time_of_day`, `spare_time`, `recently_played`) shows Refresh card at end | Trailing card with refresh icon |
| 7.12 | Click Refresh card → spin animation runs once + shelf re-resolves | New game order on `random_pick` / `recently_played` |
| 7.13 | Deterministic smart shelf (e.g. `daily_pick`, `deck_picks`) → no trailing card at all | Row ends at last game |
| 7.14 | Non-smart shelf with `sort=random` → Refresh card at end | Same as smart refreshable |
| 7.15 | Click Refresh on `sort=random` shelf → cache cleared (`ds-random-*` keys), shelf re-resolves with new order | Order changes on click |

---

## 8. Import / Export

| # | Scenario | Expected |
|---|----------|----------|
| 8.1 | Export → JSON file saved to Downloads | Valid JSON, all shelves included |
| 8.2 | Import valid JSON → shelves replaced with imported set | QAM and Home reflect import |
| 8.3 | Import `assets/import/screenshots-en.json` → 3 standard + 1 hidden + 3 smart shelves | Correct count and titles |
| 8.4 | Import JSON with unknown fields → no crash, extra fields ignored | Graceful parse via passthrough |
| 8.5 | Reset All → confirmation modal; confirm → settings cleared | QAM empty, Home clean |

---

## 9. Screenshot Automation

| # | Scenario | Expected |
|---|----------|----------|
| 9.1 | `pnpm run screenshots` with 3+ shelves → all PNGs generated in `assets/screenshots/` | No errors, correct file names |
| 9.2 | New screenshots: `smart-shelves-qam.png` captured | QAM smart shelves section visible |
| 9.3 | New screenshots: `smart-shelf-modal.png` captured | Template picker modal visible |

---

## 10. CSS Themes (CDP required)

| # | Scenario | Expected |
|---|----------|----------|
| 10.1 | ArtHero active + `hideRecents=false` → our shelves not affected by ArtHero | Own DS styling preserved |
| 10.2 | ArtHero active + `hideRecents=true` + `recentsReplaceSource=false` → first shelf adopts ArtHero styles, `HeroBackground` returns `null`, label overlay clones the focused card's `.ds-card-label` | Visual parity with native recents; label tracks focused card horizontally on row scroll |
| 10.3 | TiltedHome theme active → entire `.ds-card` (image + label + glow + MoreCard + RefreshCard) tilts as a parallelogram; focused card composes `skew + scale + translateZ` | Cards visually overlap like native TiltedHome; focus indicator preserved |
| 10.4 | Toggle ArtHero on/off at runtime via CSS Loader → label overlay appears/disappears without Steam restart | `MutationObserver` on `<head>` reacts immediately |

---

## 11. Saved Filters

| # | Scenario | Expected |
|---|----------|----------|
| 11.1 | Save filter from `EditShelfModal > Filters > "Save current as filter"` → entry appears in QAM Saved Filters section | Section visible only when ≥1 filter saved |
| 11.2 | Apply saved filter to another shelf via the dropdown → group is **copied** (spread), not referenced by id | Deleting the saved filter later does not break the shelf using it |
| 11.3 | Rename saved filter inline → name updates in dropdown immediately | Persisted across reload |
| 11.4 | Delete saved filter → entry gone from QAM and from the apply dropdown | Section hides when list becomes empty |

---

## 12. QA Harness Flags

The build accepts environment flags that force specific UI states for repeatable testing. All flags are dev-only (`!isProd` in the Vite config). Each `pnpm qa:*` script wraps a `DS_QA_*` env var and runs the hard deploy.

| Flag | Script | Effect |
|------|--------|--------|
| `DS_QA_FORCE_FIRST_RUN` | `pnpm qa:first-run` | Empty shelf list + plugin disabled — exercises the first-run banner |
| `DS_QA_FRESH_INSTALL` | `pnpm qa:fresh-install` | A fresh install as the first-run flow sees it: master toggle off, no shelves, tour not yet seen, no setup applied — the welcome banner and the tour appear, the tour's closing choice opens the setup wizard, apply / undo run in memory only (nothing is written to the device) |
| `DS_QA_FORCE_QAM_ERROR` | `pnpm qa:qam-error` | Throws on QAM render — exercises the QAM ErrorBoundary |
| `DS_QA_FORCE_SHELF_ERROR` | `pnpm qa:shelf-error` | Throws on shelf render — exercises `HomeBoundary` |
| `DS_QA_FORCE_HOME_CRASH` | `pnpm qa:home-crash` | Same throw, distinct flag for capture scripts to disambiguate |
| `DS_QA_FORCE_REPLACE_FAILED` | `pnpm qa:replace-failed` | Surfaces the `RecentsReplaceErrorBanner` (kill-switch UI) |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_RECENTS` | `pnpm qa:all-shelves-hide-recents` | Curated shelf fixture + `hideRecents=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_RECENTS` | `pnpm qa:all-shelves-show-recents` | Curated shelf fixture + `hideRecents=false` |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_HOME_TABS` | `pnpm qa:all-shelves-hide-home-tabs` | Curated fixture + `hideHomeTabs=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_HOME_TABS` | `pnpm qa:all-shelves-show-home-tabs` | Curated fixture + `hideHomeTabs=false` |
| `DS_QA_SMART_SHELVES_FIXTURE` | `pnpm qa:smart-fixture` | Seeds 4 smart shelves so the smart section renders populated |
| `DS_QA_SAVED_FILTERS_FIXTURE` | `pnpm qa:saved-filters-fixture` | Seeds saved filters so the QAM Saved Filters section is visible |
| `DS_QA_FORCE_HIDDEN_SHELF` | `pnpm qa:hidden-shelf` | Adds one hidden shelf to the curated fixture (for the `shelf-hidden.png` capture) |
| `DS_QA_VIDEO_FIXTURE` | `pnpm qa:video-fixture` | Presentable shelves (three library-backed, a wishlist and a store-deals shelf), two smart shelves and a profile with a charging trigger, with the online features and Advanced mode on — the base the video scenarios (`pnpm run videos`) record; applied once per session, so an edit a recording makes stays on the Home (in memory only) |
| `DS_QA_SCREENSHOTS_FIXTURE` | `pnpm qa:screenshots-fixture` | The video fixture plus a hidden shelf, two saved filters and a second profile, built on the default settings (not the device's own) with Quick Search and the Side Nav on and the first shelf in the native recents row under its hero art — everything the screenshot run (`pnpm run screenshots`) captures, in memory only |
| `DS_QA_SMART_SURPRISE_ME` | `pnpm qa:surprise-me` | Forces `smartSurpriseMe=true` so the daily-rotation logic runs |
| `DS_QA_FORCE_TABMASTER` | — | `present` / `absent` overrides TabMaster detection |
| `DS_QA_FORCE_UNIFIDECK` | — | `present` / `absent` overrides UnifiDeck detection |
| `DS_QA_FORCE_NONSTEAMBADGES` | — | `present` / `absent` overrides Non-Steam Badges detection |
| `DS_QA_UPDATE_AVAILABLE` | `pnpm qa:update-available` | Short-circuits `checkForUpdate` with a fake `99.0.0` release so the QAM update banner renders without a network round trip |
| `DS_QA_UPDATE_DISMISSED` | `pnpm qa:update-dismissed` | Sets `updateNotifyDismissedVersion = "99.0.0"` while keeping `qa:update-available` on — banner stays hidden because the user dismissed this exact version |
| `DS_QA_UPDATE_OFFLINE` | `pnpm qa:update-offline` | Forces `isOnline()` to return `false` so the offline-skip path runs without unplugging the Deck |
| `DS_QA_COLLECTION_EMPTY` | `pnpm qa:collection-empty` | Seeds a shelf whose collection-filter points at a non-existent collection — pre-#55 fix this leaked the entire library; now it renders empty (regression smoke) |
| `DS_QA_COLLECTION_INVERTED` | `pnpm qa:collection-inverted` | Seeds two side-by-side shelves: "In Favorites" + "Installed but NOT in Favorites" (inverted) — visually verifies #56 |

Combine flags as needed (e.g. `DS_QA_SMART_SHELVES_FIXTURE=1 DS_QA_SAVED_FILTERS_FIXTURE=1 pnpm run deploy:deck:hard`). Each one is independent and additive.

## 13. Video Scenarios (CDP required)

Scripted, repeatable sequences for the eight content scripts (custom shelves, smart shelves,
filters, visual customization, Quick Search + Side Nav, profiles + triggers, online shelves,
power-user tools) plus the quick-settings sidecar, registered with the same `videos` runner as
the content-script recordings (the five `custom_shelves` … `profiles_triggers` scenarios, which
perform a real edit and show its result). Deploy the video fixture first
(`pnpm run qa:video-fixture`), then:

```bash
pnpm run videos:list                          # every registered scenario (content scripts + 01…09)
pnpm run videos -- --only 01_custom_shelves,02_smart_shelves
pnpm run videos -- --video-fps 8              # encode rate (default 10)
```

Each scenario drives the Big Picture window (the sidecar one, the Quick Access menu's own
window) through a timed sequence while the runner's screencast records it, prints each cue point
with its timestamp and writes them beside the mp4 (`<name>.cues.txt`); recordings land in
`tmp/videos/` (gitignored) and need `ffmpeg` on PATH. Scenarios and their driving helpers live
in `scripts/deckprobe-ext/videos/scenarios/` (`feature_scripts.py`, `content_scripts.py`,
`_steps.py`; `_screencast.py` records with each frame's real arrival time, so a clip lasts as
long as the sequence did even where the screen stays still). The overlays, the editors and the
sidecar open through dev-build hooks and routes, so the sequences need the dev build the fixture
deploys; every recording starts on a settled Home with the plugin UI in en-US and the controller
glyphs restored after each key sent over the debug protocol.

## 14. Ad-hoc probes and maintainer scripts

One-off diagnostics kept beside the probe suites. They read the live client over the debug
protocol and print what they find; none of them changes settings.

| Script | What it does |
|---|---|
| `python3 scripts/deckprobe-ext/probes/perf_card_count.py [--max-count N --steps …]` | Raises the first shelf's limit step by step and measures home render time per card count, to find where the frame budget degrades (restores the limit afterwards) |
| `python3 scripts/deckprobe-ext/probes/native_shelf_detection.py` | Lists every candidate for Steam's native recents row with position, parent and native-card count, so the heuristic the side nav and Quick Search use can be checked on a given client build |
| `python3 scripts/deckprobe-ext/probes/hwcompat.py` | Prints the device's system-info fields and decodes the packed hardware-compat category for a sample of owned apps, cross-checked against the named getters |
| `python3 scripts/deckprobe-ext/probes/in_game_focus.py [--appid N] [--seconds S] [--home-over-game] [--shortcut-exe PATH --shortcut-args …] [--max-wakeups N]` | Launches a small installed game (or a temporary non-Steam shortcut) and, while it runs, counts the focus grabs our cards make, the timer wakeups the plugin causes and the shelf resolves, opens Quick Access and the Steam menu several times to check each keeps the focus, then stops the game and checks a card is focused again on the Home. Works on any build; the power gate's state is read when the build exposes it. Run it with no game running, at least 30 seconds after a reload, and put the normal build back afterwards |
| `python3 scripts/deckprobe-ext/probes/return_focus.py [--shelves 0,2] [--back cancel]` | Opens a game page from a card the way the A button does and comes back the way the B button does, for a shelf at the top and one below the fold: the Home must land on the same card (`--back` also offers the router-level ways back, which skip Steam's own focus handling) |
| `DS_QA_HIDE_APPID=<appid> python3 -m deckprobe.uitests.run --only stabilization` | The `stabilization` suite: Steam-hidden games stay off tab and collection shelves (it hides the given small game in Steam for the check and unhides it at the end), plus the Roulette's refresh card on the smart-shelf fixture (`pnpm run qa:smart-fixture`). Hiding a game on a smart shelf is checked by hand: the fixture rebuilds its smart shelves on every change |
| `python3 scripts/deckprobe-ext/probes/menu_injection.py` | Opens the game menu on cards of three shelves and checks that the per-card actions and the Shelf group (Management / Display / Visual) are injected once each, identified by their keys so any UI language works |
| `python3 scripts/deckprobe-ext/probes/shelf_render.py` | Lists every shelf on the home with its card count and whether its apps resolve |
| `bash scripts/dev/ensure-repo-settings.sh` | Maintainers only: checks the GitHub repository's merge settings (squash-only, delete branch on merge) and patches them when they drift; needs the `gh` CLI |
| `pnpm run deck:debug` | Opens the device's DevTools target list (`http://<host>:<port>`) in the browser |
| `scripts/deckprobe-ext/lib/ds_qam.py` (helper, import it) | `open_decky_ds_tab(host, port)`: opens the loader's Deck Shelves tab until the panel is really visible — the toolkit's own navigation helper is satisfied by another host's hidden copy of the panel on a two-host device |
| `scripts/deckprobe-ext/lib/probe_base.py` (helper, import it) | `connect()` / `ev()` / `sep()` — the session helpers the older probes share |
