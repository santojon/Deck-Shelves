# Deck Shelves

<div align="center">
<p>
  <img src="assets/logo.svg" alt="Deck Shelves" width="352">
</p>

[![CI](https://github.com/santojon/Deck-Shelves/actions/workflows/ci.yml/badge.svg)](https://github.com/santojon/Deck-Shelves/actions/workflows/ci.yml)
[![Release](https://github.com/santojon/Deck-Shelves/actions/workflows/release.yml/badge.svg)](https://github.com/santojon/Deck-Shelves/actions/workflows/release.yml)
[![Tests](https://img.shields.io/badge/vitest-446%20passed-brightgreen?logo=vitest&logoColor=white)](src/test/)
[![pytest](https://img.shields.io/badge/pytest-65%20passed-brightgreen?logo=pytest&logoColor=white)](src/test/test_main.py)
[![TypeCheck](https://img.shields.io/badge/typecheck-clean-brightgreen?logo=typescript&logoColor=white)](tsconfig.json)
[![Compatibility](https://img.shields.io/badge/checks-39%2F39-brightgreen?logo=steamdeck&logoColor=white)](scripts/build/validate-compat.mjs)
[![API](https://img.shields.io/badge/%40deck--shelves%2Fapi-v4-purple?logo=typescript&logoColor=white)](api/)
[![Downloads](https://img.shields.io/github/downloads/santojon/Deck-Shelves/total.svg?label=downloads&color=blue)](https://github.com/santojon/Deck-Shelves/releases/latest)
[![GitHub release](https://img.shields.io/github/v/release/santojon/Deck-Shelves?label=latest&color=blue)](https://github.com/santojon/Deck-Shelves/releases/latest)
[![Platform](https://img.shields.io/badge/platform-SteamOS%20%C2%B7%20Linux%20%C2%B7%20Windows-purple?logo=steamdeck&logoColor=white)](https://github.com/ValveSoftware/SteamOS)
[![Plugin](https://img.shields.io/badge/plugin%20for-Decky-purple.svg)](https://decky.xyz)
[![Discord](https://img.shields.io/badge/chat-on%20discord-7289da.svg?logo=discord&logoColor=white)](https://discord.gg/EChuVEDakk)
[![Reddit](https://img.shields.io/badge/community-r%2FDeckShelves-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/DeckShelves/)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github&logoColor=white)](https://github.com/sponsors/santojon)
[![Ko-fi](https://img.shields.io/badge/Support%20me%20on%20Ko--fi-F16061?logo=ko-fi&logoColor=white)](https://ko-fi.com/santojon)

</div>

A [Decky](https://decky.xyz) plugin for Steam Deck that injects configurable shelves into the Home screen with a built-in Quick Access Menu editor.

Get started [here](https://github.com/santojon/Deck-Shelves/discussions/48).

## What's new

- **Dedicated Settings page** opened from the gear icon next to the docs icon in the QAM title bar — a single full-page route with seven tabs (Quick settings, Shelves, Profiles, Integrations, Shortcuts, Backup, Advanced tools), each backed by the same actions you'd reach from the QAM and sidecar.
- **Usage profiles** — save the entire setup (every toggle, every shelf, every saved filter) as a named profile, switch in one tap, import / export to JSON, and keep a read-only **Default** profile that resets to factory.
- **Customizable button shortcuts** — remap or disable the gamepad triggers for hide / highlight / quick-launch on cards; remap (but not disable) the chords for Quick Search and Side Navigation. Single (e.g. `Y`), chord (e.g. `L1+R1`), and double-tap (e.g. `L1+L1`) all supported. **Back-grip and stick-click buttons (`L3` / `R3` / `L4` / `R4` / `L5` / `R5`)** are mappable too via the raw controller stream. Reserved system buttons (`A`, `B`, `MENU`, `STEAM`, `…`) are rejected even in combinations.
- **Composite shelves** — stack any number of sources (collections, library tabs, wishlist, store, smart sources, sub-composites) into a single shelf via Union (games in any source) or Intersection (games in every source). Children resolve in parallel under a 15 s race ceiling so a single hung online source can't stall the whole shelf.
- **Custom artwork refreshes on home return** — replace a capsule / logo / hero / icon outside the home, press B back, the new bitmap appears in the row. No plugin reload required. Driven by an in-memory revision counter that re-keys URL memos when you re-enter the home.
- **Unified shelf list + drag-and-drop reorder** — opt in to merge regular and smart shelves into a single ordered list, then drag rows directly in the Shelves panel. Gamepad-friendly `↑` / `↓` buttons stay as a fallback.
- **External launcher discovery** — EmuDeck, RetroDECK, Heroic (Epic / GOG / Amazon), Lutris, Moonlight, and Chiaki games surface through dedicated shelf sources. Read-only, runs in the background, refreshes every 15 minutes.
- **Light mode** — hides advanced toggles and sliders in the QAM / sidecar so the panel stays uncluttered for users who never touch them.
- **76 new built-in filters / sorts / sources** — 32 filters, 25 sorts, and 19 shelf sources covering Steam metadata, user behaviour, storage device, completion %, achievement rarity, friends activity, dynamic Steam collections, followed / ignored / DLC / soundtrack / pinned / history / queue surfaces, plus composite modes (weighted, priority, exclusion group).
- **Integrations panel toggles** — every registered descriptor (built-in or third-party) gets a per-row enable / disable. First-party Deck Shelves entries are tagged with a green BUILT-IN chip so you can tell them apart from external plugin contributions.

## Features

- Inject custom shelves into `library/home`
- Shelves backed by **collections**, **library tabs**, or **custom filters**
- **Multiple sources per shelf** — stack collections + tabs + wishlist + store into one shelf via Union (games in any source) or Intersection (games in every source). Filter source stays exclusive; use the filter `merge` for multi-criteria predicates instead. When any child is wishlist or store, an **Online filters** tab in the editor applies online-only predicates (discount, friend activity) across the merged result.
- **Decoration cards** — pin fixed-slot cards at any position in a shelf: text label, image banner, focusable URL shortcut, or a transparent gap. New cards land at the slot focused in the preview and inherit the row's current order via manual sort. Image cards support optional **hero art** (acts as the per-shelf hero background on focus) and a **shadow mode** (Never / On focus / Always) for clean transparent PNG framing.
- **Quick add to shelf** — every game's context menu (in DS shelves AND the native library) exposes "Add to shelf" with the eligible shelves only (skips shelves at their limit, the 50-entry cap, or already containing the game).
- **Y-button highlight toggle** — focus a game, press Y to toggle the per-card highlight without opening the context menu.
- **Advanced filter groups** with AND/OR logic for complex game queries
- Filter games by:
  - Favorites, installed, hidden, non-Steam
  - **Shortcut type** — 15 kinds covering Games, Software, Tools, Demos, DLC, Music / Soundtracks, Videos, Comics, Guides, Drivers, Configs, Hardware, Betas, Applications, and Non-Steam links
  - **App status** — 14 options for Running, Launching, Installing, Validating, Downloading (compound + fine-grained), Queued, Paused, Reconfiguring, Staging, Committing, Not installed, Installed (idle)
  - Name (substring or regex)
  - Deck compatibility level
  - Playtime range (min / max minutes)
  - Played within N days
  - Update pending
  - Store tags, achievement count, friends who own
  - **Friends playing now** — matches games at least one Steam friend is in-game on right now (online features required)
  - **Friends played recently** — matches games any Steam friend played within the last N days (1–30, default 14; online features required)
  - **Discount range** — matches games whose Steam store discount sits in a chosen min/max % range (online features required)
- Sort shelves alphabetically, by recent play, total playtime, release date, size on disk, Metacritic score, review score, discount %, price, original price — each direction (asc / desc) togglable per shelf via an icon button next to the sort dropdown
- **Multi-key sort** — chain a primary sort with one or more tiebreakers (e.g. *biggest discount → metacritic score* breaks ties between games at the same discount). Each row has its own asc/desc toggle. Stable chain — secondary keys only kick in when the primary genuinely ties.
- Library tab selection shows your actual runtime tabs, including those created by other plugins
- **Dynamic card sizing** — shelves match native card dimensions and from themes
- **Highlight first game** — first card renders as a landscape featured card
- **Highlight all games** — toggle per-shelf or globally to render every card as a landscape featured card
- **Hide status line** — toggle to hide the the play/install status of a game
- **Hide trailing cards** — separate per-shelf and global toggles to hide the "See more" tile and / or the "Refresh" tile on shelves that emit them (random-sorted regular shelves and refreshable smart shelves)
- **Per-shelf size** — limit slider goes up to 50 cards in the shelf and smart-shelf editors
- **Sub-filters for collection and tab sources** — when a shelf's source is a collection or library tab, an Additional Filters tab in the editor lets you add further filter criteria on top of the source
- **Manually hide games per shelf** — "Hide specific games" toggle in the Display tab opens a mini-card picker; the shelf automatically fetches extra candidates to keep the configured number of visible cards filled
- **Deduplicate by name** — per-shelf and global toggle that collapses entries sharing an exact name (Steam wins over non-Steam)
- **Hide recent games** — toggle to hide the native "Recently Played" section
- **Use first shelf as recents (experimental)** — when "Hide recent games" is on, injects the first shelf's games into the native recents component instead of hiding it; reuses native DOM/CSS/animations for full CSS Loader theme compatibility; auto-disables with a banner on failure
- **Hide home tabs** — toggle to hide the native home tab bar on te bottom of shelves
- **Hero background art** — enable it per shelf (regular or smart) in the editor's Visual tab, or globally for every shelf at once; the focused game's background art appears behind that shelf, following it wherever it sits — works with or without hiding the native recents row
- **Force CSS Loader themes** — promotes every shelf into the native-like-recents selector space so themes like ArtHero apply consistently across all shelves (only shown when CSS Loader is installed)
- **Developer / Publisher filter** — filter games by developer or publisher with automatic batch discovery
- **App ID list filter** — whitelist an explicit set of app IDs to pin specific games to a shelf
- **Mouse hover support** — cards show labels and brightness on hover, same as gamepad focus
- **Per-day time-window overrides for smart shelves** — a Smart Filters toggle opens a dedicated Overrides tab where each weekday can have its own hour ranges, on top of the shelf-level default hours and day filter
- **Live shelf preview in the editor** — the preview area shows real cards as they appear on the home (title, name, status line, compat / new / non-Steam badges, See more / Refresh tiles) and reflects every Display-tab toggle in real time
- **Smart Shelves** — 30+ heuristic-driven shelf types that appear automatically when conditions are met and disappear when no games match. Game-focused: Daily Pick, Deck Picks, On Deck, Recently Played, Long Sessions, Roulette, Not Started, Best Unplayed, Quick Play, Interrupted, Non-Steam, Spare Time, Time of Day, Rediscover, Forgotten. Heuristic templates: Backlog Rescue, Forgotten Gems, Hidden Gems, Travel Mode, Never Touched Classics, Recent Hidden Installs, Weekly Rotation, Monthly Spotlight, Seasonal Rotation (each with tunable cooldown / staleness / review-floor / rotation knobs). Media-focused: Soundtracks, Videos, Demos, Cloud games. Runtime-aware (best-effort against Steam runtime data): Low Battery Mode, Almost Finished, Couch Gaming, Co-op Ready, Party Games. Online-gated: Friends Playing. Ordered by probability of results in the picker
- **Saved smart shelf templates** — persist a fully-tuned smart shelf config and reuse it from the template picker; exposed to plugins via the public API
- **Surprise Me** — sub-toggle that hides the manual smart shelf list and lets the system pick 1–5 templates each day automatically; configurable count slider (0 = system decides)
- **Shelf templates** — 11 presets (Favorites, Recently Played, Installed, Most Played, Recently Added, Awaiting Update, Non-Steam, Long Sessions, Steam Cloud, Deck Verified, Top Reviewed) in a 2-column grid picker. Picking any template — Blank, regular preset, smart preset, or Custom — opens the edit modal first; **nothing is persisted until you press Save**, so cancelling discards the draft cleanly.
- **Quick Search overlay** — L1+R1 on a card pops a centered translucent search pill that fuzzy-matches against every game in your visible shelves (covers cards below the fold and items still loading metadata). NFD normalisation handles diacritics (Pokémon ⇄ Pokemon). After a brief pause the top hit scrolls into view and gets focused. Two toggles: "Open virtual keyboard" (default on, controls the auto-popup) and "Search only on Enter" (default off, swaps the debounce for an explicit-trigger flow). L1, R1, or B closes the overlay regardless of whether a physical or virtual keyboard has focus.
- **Side Nav overlay** — L1 twice on any card slides in a left panel listing every visible shelf in the order they render on the home (uses CSS `order` for accurate visual order). Steam-themed left edge bar marks the focused row; the panel auto-focuses the shelf you came from, not the first one. R1+L1 / B / dpad-right close it; selecting a row jumps focus to that shelf's first card. Plugins can contribute extra rows via the public API.
- Reorder and toggle shelf visibility from the QAM
- **Online shelf sources (opt-in)** — wishlist and Steam Store shelves with `price_low`, `discount_high`, `original_price_high` sorts; four ready-made templates (Wishlist, Wishlist on sale, Free wishlist, Free now); cached locally so the home keeps working offline
- **Exclude owned games** — per-shelf toggle on wishlist / store sources that hides any game whose appid or exact name matches a title in your local library; sub-toggle for non-Steam shortcuts (Epic / GOG / etc.), and a further sub-toggle for cloud-play catalogue stubs (Xbox Cloud Gaming via Unifideck Microsoft) so promotions on the cloud catalogue still surface
- **Discount badges** — cards on online shelves show a green "% off" badge (mirrors the NEW badge slot, shown even on placeholder cards while artwork is still loading)
- **Refresh action everywhere** — context-aware "Refresh cache" / "Refresh" available from the QAM action menu, the shelf-card context menu, and the trailing refresh tile
- Import / export all shelves and smart shelf configuration as JSON
- Persistent settings across plugin reinstalls
- Crash protection with automatic retry
- Multi-language support (EN, EN-GB, PT-BR, PT-PT, FR, FR-CA, DE, ES, ES-419, IT, RU, PL, NL, TR, UK, JA, KO, ZH-CN, ZH-TW)

### Screenshots
#### Home

<p align="center">
  <img src="assets/screenshots/home.png" alt="Deck Shelves — Home Screen" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/home-shelves.png" alt="Deck Shelves — Shelves Close-up" width="768">
</p>

#### Plugin Settings

<p align="center">
  <img src="assets/screenshots/qam.png" alt="Deck Shelves — Quick Access Menu" width="768">
</p>

#### Game Actions

<p align="center">
  <img src="assets/screenshots/game-menu.png" alt="Deck Shelves — Game Context Menu (Menu Button)" width="768">
</p>

#### Shelf Management

<p align="center">
  <img src="assets/screenshots/shelf-create.png" alt="Deck Shelves — Create Shelf (Template Picker)" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-import.png" alt="Deck Shelves — Import Shelves" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-actions.png" alt="Deck Shelves — Shelf Context Menu" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-edit.png" alt="Deck Shelves — Edit Shelf (Source tab)" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-edit-filters.png" alt="Deck Shelves — Edit Shelf (Filters tab with Saved Filters bar)" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-edit-visual.png" alt="Deck Shelves — Edit Shelf (Visual tab with highlight picker)" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-hidden.png" alt="Deck Shelves — Hidden Shelf" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-delete.png" alt="Deck Shelves — Delete Shelf Confirmation" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/shelf-export.png" alt="Deck Shelves — Export Shelves" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/reset-all.png" alt="Deck Shelves — Reset All Confirmation" width="768">
</p>

#### About & Filter Documentation

<p align="center">
  <img src="assets/screenshots/about-page.png" alt="Deck Shelves — About & Filter Documentation" width="768">
</p>

#### Smart Shelves

<p align="center">
  <img src="assets/screenshots/smart-shelves-qam.png" alt="Deck Shelves — Smart Shelves in QAM" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/smart-shelf-modal.png" alt="Deck Shelves — Smart Shelf Template Picker" width="768">
</p>

<p align="center">
  <img src="assets/screenshots/smart-shelf-edit.png" alt="Deck Shelves — Edit Smart Shelf (sort override + filters)" width="768">
</p>

#### Saved Filters

Visible in the QAM when at least one filter has been saved from the **Edit shelf → Filters** tab. Hidden automatically when empty.

<p align="center">
  <img src="assets/screenshots/saved-filters-qam.png" alt="Deck Shelves — Saved Filters section in QAM" width="768">
</p>

#### Global Toggles

<p align="center">
  <img src="assets/screenshots/global-toggles.png" alt="Deck Shelves — Global Toggles" width="768">
</p>

#### Optional captures

These are produced by the modular runner when the matching state is reachable; the validator treats them as optional.

| File | When |
|------|------|
| `home-hero.png` | Home with a card focused (hero overlay visible) |
| `home-hide-recents.png` | Home with native recents hidden and the first DS shelf promoted |
| `import-overflow.png` | QAM with the import-options `…` overflow menu open (2+ import descriptors registered) |
| `about-filters.png`, `about-smart.png`, `about-support.png` | Individual About-page tabs |

## Documentation

- [Architecture](docs/architecture.md) — project structure, data flow, key systems
- [Plugin API](docs/plugin-api.md) — register custom shelf sources from other plugins
- [Filter System](docs/filters.md) — filter types, groups, sort options
- [Shelf Templates](docs/shelf-templates.md) — standard shelf template presets
- [Smart Shelves](docs/smart-shelves.md) — all 15 smart shelf templates, criteria, and reliability
- [Development Guide](docs/development.md) — setup, build commands, testing, conventions
- [Webpack Classmap](docs/webpack-classmap.md) — runtime CSS class discovery
- [Performance audit](docs/performance.md) — measurement methodology, hot paths, applied wins
- [QA manual](docs/qa-manual.md) — manual regression checklist + QA harness flag reference

## Installation

### From Decky Store

1. Install [Decky Loader](https://decky.xyz) on your Steam Deck
2. Open the Decky Store and search for **Deck Shelves**
3. Install and restart Steam if prompted

### Manual Installation

1. Download the latest `deck-shelves-v*.zip` from the [Releases page](https://github.com/santojon/Deck-Shelves/releases/latest)
2. In game mode, go to Decky config page -> Developer -> Install from zip file
3. Select the downloaded zip file and confirm
4. Restart Steam if prompted

## Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3 (for backend)
- SSH access to a Steam Deck on the local network

### Setup

```bash
pnpm install
pnpm run deck:setup steamdeck
```

### Environment variables

Deploy and diagnostics scripts need to know how to reach your Steam Deck over SSH. Create a `.env` file in the project root (it is git-ignored) with the following variables:

```env
# Steam Deck SSH hostname or IP address
DECK_HOST=steamdeck

# Steam Deck SSH username (default: deck)
DECK_USER=deck

# Steam Deck sudo password (used for plugin_loader restart, permission fixes, etc.)
DECK_SUDO_PASS=your-password

# Steam Deck CEF remote-debug port (default: 8081)
DECK_CDP_PORT=8081

# Optional: address used to reach the Deck CEF remote-debug endpoint.
# If unset, the CLI will use `DECK_HOST` as the CDP host. You can set
# this to `127.0.0.1` when using an SSH tunnel, or to your Deck's IP
# when connecting directly.
DECK_CDP_HOST=127.0.0.1
```

All variables are optional — each script also accepts command-line arguments (e.g. `pnpm run deploy:deck steamdeck`). When both are provided, the CLI argument takes precedence.

### Build

```bash
# Development build (sourcemaps, no minification)
pnpm run build:plugin

# Production / release build (minified, no sourcemaps)
pnpm run build:release
```

### Deploy & Watch

```bash
# Deploy current build to Deck
pnpm run deploy:deck steamdeck

# Watch for changes and auto-deploy
pnpm run watch:deck steamdeck
```

### Package

```bash
# Create installable zip
pnpm run package

# Upload zip to Deck Downloads folder
pnpm run upload:deckzip steamdeck
```

### Capturing Screenshots

To capture screenshots for documentation:

1. Deploy the plugin to your Steam Deck (requires at least 2 shelves with 1+ game each; for `smart-shelf-edit.png` Smart Shelves must be enabled with at least one entry):
   ```bash
   npm run deploy
   ```
2. Use the consolidated devtools CLI or run the screenshot script directly.

  - Via CLI:
    ```bash
    python3 deckprobe/cli.py screenshot --locale en-US
    ```

  - Directly (monolithic):
    ```bash
    python3 deckprobe/screenshots/screenshot.py
    ```

  - Modular runner (preferred for new captures and future UI tests):
    ```bash
    python3 deckprobe/screenshots/run.py
    # or run a single scenario:
    python3 deckprobe/screenshots/run.py --only home,qam,about_overview
    # list every registered scenario:
    python3 deckprobe/screenshots/run.py --list
    ```
3. Screenshots are saved to `assets/screenshots/`.
4. Validate the set (required files present, PNG magic header, >= 60 KB — catches blank popup frames):
   ```bash
   node scripts/build/validate-screenshots.mjs
   ```

##### Local UI test suite

```bash
pnpm uitests             # run every registered suite against the Deck
pnpm uitests:list        # list every suite + test name
pnpm uitests --only home,qam_shelves   # subset
```

The suites live in `deckprobe/uitests/suites/` and reuse the screenshot pipeline's `lib/` (CDP session, navigation, capture). Local-only — runs against a real Deck or a SteamOS VM via CDP, never on CI. Use it as the optional pre-PR check for flows the unit tests can't reach.

##### Validation flows (with HTML reports)

Three commands orchestrate all checks end-to-end and write an HTML report to `reports/`:

```bash
pnpm validate:ci             # offline: typecheck, build, tests, package, compat
pnpm validate:full           # with Deck: above + deploy + UI tests + perf bench
pnpm validate:full:stress    # with Deck + stress fixture (16 shelves, 50 cards each)
```

`validate:ci` is designed for CI/CD — no device or `.env` required. `validate:full` skips device steps gracefully when the Deck is unreachable.

Reports land in `reports/` (gitignored) organised in three scopes:

```
reports/
  index.html        ← top-level overview (links to scopes + dashboard)
  dashboard.html    ← statistics dashboard with charts
  ci/               ← automated runs (validate:ci)
  local/            ← manual runs with Deck (validate:full / validate:full:stress)
  release/          ← reserved for release-gate runs
```

Each report includes per-step captured output, test result counts, and VS Code-clickable file links for errors.

```bash
pnpm reports                 # open reports/index.html (includes link to dashboard)
```

The **dashboard** (`reports/dashboard.html`) aggregates data across all runs and scopes:
- KPIs: total runs, pass rate, last run result
- Pass-rate trend chart over time
- **Coverage by test suite** — stacked bars per suite (home, QAM, context menu, perf, crash, stress) showing pass/fail/skip distribution, populated from UI tests logs
- Overall test distribution (donut chart)
- Results by scope (local / CI / release)
- Context pills showing how many runs were with/without Deck and with/without stress fixture

> **Reports folder:** [`reports/`](reports/) — [`index`](reports/index.html) · [`dashboard`](reports/dashboard.html)

##### Performance bench

```bash
pnpm perf:bench          # 3 runs, prints mount p_avg / p_min / p_max
pnpm perf:bench --runs 10
```

Drops `performance.mark` / `performance.measure` calls into Big Picture, navigates to the home, reads the durations back. Pair with `[PERF]` PR tag and before/after numbers — see [docs/performance.md](docs/performance.md).

##### Modular screenshot pipeline

The new runner under `deckprobe/screenshots/` is split into:

- `lib/cdp.py` — minimal CDP `Session` (WebSocket + `Runtime.evaluate` + `Page.captureScreenshot`).
- `lib/nav.py` — navigation primitives (`open_qam`, `close_qam`, `navigate_home`, `navigate_about`, `click_selector`, `await_selector`, `set_qa_override`).
- `lib/capture.py` — `capture_bigpicture` and `capture_qam` (with auto-fallback when the popup returns a blank frame).
- `scenarios/*.py` — each file groups related captures (`home.py`, `qam.py`, `about.py`, `modals.py`). Add a new scenario by writing one function decorated with `@register("name")` — it receives the SharedJS session, host, port and output dir, and returns a `{filename: Path}` map.
- `run.py` — orchestrator. Iterates `ALL_SCENARIOS`, supports `--only`, `--list` and `--out`.

The same surface helpers (`capture_bigpicture` / `capture_qam`) and navigation primitives feed directly into the local UI test suite planned for the next release; tests will reuse `lib/` and `scenarios/` to put the UI in a known state before asserting DOM/state.

#### Screenshot set

The script writes one PNG per capture, organized by the flow it exercises:

| File | Captures |
|------|----------|
| `home.png` | Home with the Deck Shelves portal mounted after native recents |
| `home-shelves.png` | Home scrolled to show the second DS shelf in full |
| `game-menu.png` | Context menu opened on a shelf card (MENU button) |
| `qam.png` | QAM with the Deck Shelves plugin tab active |
| `shelf-create.png` | Template picker modal (grouped by category) |
| `shelf-actions.png` | Per-shelf action menu (Edit / Duplicate / Hide / Delete / reorder) |
| `shelf-edit.png` | Edit shelf modal — Source tab (sort, source type, limit) |
| `shelf-edit-filters.png` | Edit shelf modal — Filters tab (FilterPanel + SavedFiltersBar) |
| `shelf-edit-visual.png` | Edit shelf modal — Visual tab (highlight toggles + picker + Odd/Even) |
| `shelf-hidden.png` | QAM showing a shelf toggled to hidden (eye-slash icon) |
| `shelf-delete.png` | Delete shelf confirmation dialog |
| `shelf-import.png` / `shelf-export.png` | Import / export modals |
| `reset-all.png` | Reset-all destructive confirmation |
| `about-page.png` | About & Filter Documentation page |
| `smart-shelves-qam.png` | QAM scrolled to the Smart Shelves section |
| `smart-shelf-modal.png` | Smart Shelf template picker (category accordions) |
| `smart-shelf-edit.png` | Edit Smart Shelf modal (sort override + filters + visual) |
| `saved-filters-qam.png` | **Optional** — Saved Filters section in QAM; captured only when at least one filter has been saved |
| `global-toggles.png` | Apply Globally section in QAM |

### Devtools diagnostics

Developer tools for inspecting the Steam/Deck runtime are available under `deckprobe/`.

- List available diagnostics:

```bash
python3 deckprobe/cli.py diag list
# or via node helper
node deckprobe/diag/index.js list
```

- Run a diagnostic by name (matches `diag_*` filenames):

```bash
python3 deckprobe/cli.py diag run trynav
# or
node deckprobe/diag/index.js run trynav
```

- Probe CDP / plugin mount:

```bash
python3 deckprobe/cli.py probe --mode smoke
```

- Capture screenshots and validate them:

```bash
python3 deckprobe/cli.py screenshot --locale en-US
node scripts/build/validate-screenshots.mjs
```

The `cli.py` wrapper finds scripts in the reorganized folders (`diag/`, `tools/`, `screenshots/`) and delegates execution. Use `devtools:cli` npm script for convenience:

```bash
pnpm run devtools:cli -- diag list
pnpm run devtools:screenshots
```


## Architecture

```
main.py                  Python backend (settings persistence, import/export)
src/index.tsx            Plugin entry point
src/runtime/             Steam/Decky integration, Home injection, platform layer
src/components/          QAM settings UI and Home shelf rendering
  ├── shelf/             Game cards, hero background (CDP-based native replication)
  ├── qam/               QAM modals, shelf list, action buttons
  ├── filter/            Filter type editors and utilities
  ├── home/              Gamepad nav tree patches
  ├── about/             Documentation tabs
  └── styles/            Scoped CSS for modals and QAM
src/steam/               Steam API access (collections, tabs, filters, sorting)
src/domain/              Settings schema, defaults, templates
src/core/                Focus, scroll, refresh, assets, webpack compat, plugin API
src/shims/               React/Decky runtime shims for GamepadUI
src/features/settings/   Settings controller
src/integrations/        TabMaster, UnifiDeck, DOM tab discovery
i18n/                    Locale files
checks/                  Compatibility validation scripts (36 checks)
scripts/                 Build, deploy, watch, package, devtools helpers
```

### Home internals

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
| `components/shelf/HeroBackground.tsx` | Two-layer cross-fade hero art; ArtHero label overlay when promoted |
| `components/home/navPatches/reparent.ts` | `reparentNavTreeNodes` — moves DS focus nodes between recents and tabs |
| `components/home/navPatches/menuButton.ts` | MENU button interception → game context menu |
| `components/home/navPatches/edgeNavigation.ts` | L/R throttle + DOWN tilt guard (when home tabs hidden) |
| `components/home/navPatches/verticalBridge.ts` | DOWN/UP bridge between mount and native neighbors |

#### Recents replacement pipeline (`recentsReplaceSource = true`)

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
        │  • holder.props.apps ← appIds
        │  • holder.props.showFeaturedItem ← from shelf highlight toggles
        ▼
   render()                                        native cross-fade preserved (no callback re-entry)

   ─── safety nets ─────────────────────────────────────────────────────────
   patchedTypes: WeakSet<object>                   dedup against memo/forwardRef sharing (3.9+)
   crashCount, CRASH_THRESHOLD = 5 / 10 s          fingerprinted errors → markReplaceFailed()
   markReplaceFailed(reason) → pub/sub             QAM disables toggle + shows banner
   resetRecentsReplaceFailed()                     QAM "reset crash state" — clears WeakSet too
```

#### Focus nav tree reparent (`reparentNavTreeNodes`)

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

#### First-shelf promotion
```
hideRecentsSetting = true ?  ── no ──► no promotion, no overlay
        │ yes
        ▼
   firstVisibleId scan:
     iterate shelves[] in CONFIG order (not DOM order)
     skip type === "smart"
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
   isArtHeroActive() ?  ── no ──► HeroBackground only (cross-fade two-layer)
        │ yes
        ▼
   HeroBackground returns null when ArtHero paints its own hero
   AND
   HeroBackground renders the focused-card label clone as position:fixed overlay
     • cloned from .ds-card-label of the focused tile
     • follows focused card horizontally on row scroll
     • reactive to runtime CSS Loader theme toggles via MutationObserver on Big Picture <head>
```

## Compatibility

All checks can be run cross-platform (Linux / macOS / Windows) via the Node wrapper, which locates `bash` automatically (Git Bash / WSL on Windows):

```bash
pnpm run validate:compat        # node wrapper — works everywhere
# or directly on Unix shells:
bash scripts/build/validate-compat.sh
```

### Operating systems

The plugin runs **wherever Decky Loader runs**. Decky installs as a **systemd service** that injects into Steam's CEF, so it is Linux-only at the OS level. Path discovery ([`paths.py`](paths.py)) and packaging ([`scripts/build/package.py`](scripts/build/package.py)) are OS-agnostic (stdlib only, no bash/`zip` CLI).

| OS | Steam discovery | Runs the plugin? |
|---|---|---|
| SteamOS / Steam Deck | `~/.local/share/Steam` | ✅ official (primary target) |
| Linux — SteamOS-like (Bazzite, ChimeraOS, HoloISO, Nobara) + desktop (native / Flatpak) | native + `~/.var/app/...Steam` | ✅ unofficial — Decky's systemd install works |
| Windows | registry (`winreg`) → `Program Files` → `%LOCALAPPDATA%` | ⚠️ unofficial — via a community Windows installer; unstable |
| macOS | `~/Library/Application Support/Steam` | ❌ via Decky (no systemd / no port). Path support is reserved for the future standalone host ([`shelves-loader`](https://github.com/santojon/shelves-loader)) |

> Decky Loader officially supports **SteamOS / Steam Deck only**; Linux-desktop and Windows are community-driven and may break. macOS is not possible through Decky today. (See sources in the PR notes.)

### Build

| Check | Status |
|---|---|
| Build Output (Vite/ESM) | ✅ |
| TypeScript / Node (Build Toolchain) | ✅ |

### Decky Loader

| Check | Status |
|---|---|
| Decky Loader 3.x (API v1) | ✅ |
| Decky Loader (API v1) | ✅ |
| Decky Store (Publishing) | ✅ |

### SteamOS

| Check | Status |
|---|---|
| SteamOS (3.5–3.9) | ✅ |
| SteamOS GamepadUI (3.5–3.9) | ✅ |

### Project

| Check | Status |
|---|---|
| Internationalization (i18n) | ✅ |
| Python Backend (Decky Python) | ✅ |

## Developer Tools

The project includes CDP-based diagnostics and screenshot automation for Steam Deck development. See [deckprobe/README.md](deckprobe/README.md) for details on:

- **CDP probe** — runtime mount, row, and smoke-test checks
- **Deck diagnostics** — SSH-based diagnostic wrapper
- **Screenshot capture** — automated screenshot capture via CDP for documentation

## Contributing

[![Issues](https://img.shields.io/github/issues/santojon/Deck-Shelves?color=%2344cc11)](https://github.com/santojon/Deck-Shelves/issues)

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, code style, and how to submit changes.

## License

This project is licensed under the BSD 3-Clause License. See [LICENSE](LICENSE) for details.

## About

Deck Shelves is developed by [Jonathan Santos](https://github.com/santojon).

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/santojon)
