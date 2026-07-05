# Deck Shelves

<div align="center">
<p>
  <img src="assets/logo.svg" alt="Deck Shelves" width="352">
</p>

[![CI](https://github.com/santojon/Deck-Shelves/actions/workflows/ci.yml/badge.svg)](https://github.com/santojon/Deck-Shelves/actions/workflows/ci.yml)
[![Release](https://github.com/santojon/Deck-Shelves/actions/workflows/release.yml/badge.svg)](https://github.com/santojon/Deck-Shelves/actions/workflows/release.yml)
[![Tests](https://img.shields.io/badge/vitest-496%20passed-brightgreen?logo=vitest&logoColor=white)](src/test/)
[![pytest](https://img.shields.io/badge/pytest-70%20passed-brightgreen?logo=pytest&logoColor=white)](src/test/test_main.py)
[![TypeCheck](https://img.shields.io/badge/typecheck-clean-brightgreen?logo=typescript&logoColor=white)](tsconfig.json)
[![Compatibility](https://img.shields.io/badge/checks-39%2F39-brightgreen?logo=steamdeck&logoColor=white)](scripts/build/validate-compat.mjs)
[![Platform](https://img.shields.io/badge/platform-SteamOS%20%C2%B7%20Linux%20%C2%B7%20Windows-purple?logo=steamdeck&logoColor=white)](https://github.com/ValveSoftware/SteamOS)
[![Downloads](https://img.shields.io/github/downloads/santojon/Deck-Shelves/total.svg?label=downloads&color=blue)](https://github.com/santojon/Deck-Shelves/releases/latest)
[![GitHub release](https://img.shields.io/github/v/release/santojon/Deck-Shelves?label=latest&color=blue)](https://github.com/santojon/Deck-Shelves/releases/latest)

[![Discord](https://img.shields.io/badge/chat-on%20discord-7289da.svg?logo=discord&logoColor=white)](https://discord.gg/EChuVEDakk)
[![Reddit](https://img.shields.io/badge/community-r%2FDeckShelves-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/DeckShelves/)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github&logoColor=white)](https://github.com/sponsors/santojon)
[![Ko-fi](https://img.shields.io/badge/Support%20me%20on%20Ko--fi-F16061?logo=ko-fi&logoColor=white)](https://ko-fi.com/santojon)

</div>

**Deck Shelves** is a plugin that makes the Steam Deck Home screen yours. Build custom shelves from your collections, library tabs, or filters; let **smart shelves** surface games automatically when they're relevant; add hero artwork, decoration cards, and online wishlist/store rows — all configured right on the Deck through a built-in Quick Access Menu editor. No desktop mode, no config files.

**New here?** Read the [getting-started guide](https://github.com/santojon/Deck-Shelves/discussions/48), then install from the Decky Store or latest versions manually (see [Installation](#installation)). Questions or ideas? Join the [Discord](https://discord.gg/EChuVEDakk) or [r/DeckShelves](https://www.reddit.com/r/DeckShelves/).

## Contents

- [Deck Shelves](#deck-shelves)
  - [Contents](#contents)
  - [Features](#features)
  - [Screenshots](#screenshots)
  - [Installation](#installation)
    - [From Decky Store](#from-decky-store)
    - [Manual Installation](#manual-installation)
  - [Documentation](#documentation)
  - [Development](#development)
  - [Architecture](#architecture)
  - [Compatibility](#compatibility)
    - [Operating systems](#operating-systems)
    - [Validated environments](#validated-environments)
  - [Developer Tools](#developer-tools)
  - [Contributing](#contributing)
  - [License](#license)
  - [About](#about)

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
- **Hide trailing cards** — separate per-shelf and global toggles to hide the "See more" tile and / or the "Refresh" tile on shelves that emit them (random-sorted regular shelves and refreshable smart shelves). The "See more" tile also hides on its own when a shelf already shows every game that matches, so it only appears when there's actually more to see
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
- **Dedicated Settings page** — opened from the gear icon in the QAM title bar: a full-page route with seven tabs (Quick settings, Shelves, Profiles, Integrations, Shortcuts, Backup, Advanced tools) backed by the same actions as the QAM and sidecar
- **Usage profiles** — save the entire setup (every toggle, shelf, saved filter) as a named profile, switch in one tap, import / export to JSON, with a read-only **Default** profile that resets to factory
- **Customizable button shortcuts** — remap or disable the gamepad triggers for hide / highlight / quick-launch, and remap the chords for Quick Search and Side Navigation. Single, chord, and double-tap inputs are supported, including back-grip and stick-click buttons (`L3` / `R3` / `L4` / `R4` / `L5` / `R5`); reserved system buttons are rejected
- **Unified shelf list + drag-and-drop reorder** — opt in to merge regular and smart shelves into a single ordered list and drag rows directly in the Shelves panel (gamepad `↑` / `↓` buttons stay as a fallback)
- **External launcher discovery** — EmuDeck, RetroDECK, Heroic (Epic / GOG / Amazon), Lutris, Moonlight, and Chiaki games surface through dedicated shelf sources; read-only, refreshed every 15 minutes in the background
- **Integrations panel** — every registered descriptor (built-in or third-party) gets a per-row enable / disable; first-party entries carry a green BUILT-IN chip
- **Display modes — Normal / Light / Advanced** — *Light* gives a minimal experience: the home drops per-shelf logo / icon / description / hero and disables context search + side navigation, and their now-dead controls are hidden from the QAM / sidecar; *Advanced* unlocks the Advanced-tools tab (verbose logging, on-device diagnostic logs, reset shortcuts) and always-on Integrations; *Normal* is the default. Light and Advanced are mutually exclusive and stored per profile. Full matrix in [docs/display-modes.md](docs/display-modes.md)
- **Custom artwork refreshes on home return** — replace a capsule / logo / hero / icon elsewhere, press B back, and the new bitmap appears in the row with no plugin reload
- Reorder and toggle shelf visibility from the QAM
- **Online shelf sources (opt-in)** — wishlist and Steam Store shelves with `price_low`, `discount_high`, `original_price_high` sorts; four ready-made templates (Wishlist, Wishlist on sale, Free wishlist, Free now); cached locally so the home keeps working offline
- **Exclude owned games** — per-shelf toggle on wishlist / store sources that hides any game whose appid or exact name matches a title in your local library; sub-toggle for non-Steam shortcuts (Epic / GOG / etc.), and a further sub-toggle for cloud-play catalogue stubs (Xbox Cloud Gaming via Unifideck Microsoft) so promotions on the cloud catalogue still surface
- **Discount badges** — cards on online shelves show a green "% off" badge (mirrors the NEW badge slot, shown even on placeholder cards while artwork is still loading)
- **Refresh action everywhere** — context-aware "Refresh cache" / "Refresh" available from the QAM action menu, the shelf-card context menu, and the trailing refresh tile
- Import / export all shelves and smart shelf configuration as JSON
- Persistent settings across plugin reinstalls
- Crash protection with automatic retry
- Multi-language support (EN, EN-GB, PT-BR, PT-PT, FR, FR-CA, DE, ES, ES-419, IT, RU, PL, NL, TR, UK, JA, KO, ZH-CN, ZH-TW)

## Screenshots

<p align="center">
  <img src="assets/screenshots/home.png" alt="Deck Shelves — Home Screen" width="768">
</p>

A full visual tour — home, QAM, shelf editor, smart shelves, About docs and more — lives in **[docs/showcase.md](docs/showcase.md)**.

## Installation

### From Decky Store

1. Install [Decky Loader](https://decky.xyz) on your system
2. Open the Decky Store and search for **Deck Shelves**
3. Install and restart Steam if prompted

### Manual Installation

1. Download the latest `deck-shelves-v*.zip` from the [Releases page](https://github.com/santojon/Deck-Shelves/releases/latest)
2. In game mode, go to Decky config page -> Developer -> Install from zip file
3. Select the downloaded zip file and confirm
4. Restart Steam if prompted

## Documentation

- [Screenshots / showcase](docs/showcase.md) — full visual tour of every surface
- [Architecture](docs/architecture.md) — project structure, data flow, key systems, Home internals
- [Plugin API](docs/plugin-api.md) — register custom shelf sources from other plugins
- [Filter System](docs/filters.md) — filter types, groups, sort options
- [Shelf Templates](docs/shelf-templates.md) — standard shelf template presets
- [Smart Shelves](docs/smart-shelves.md) — all 15 smart shelf templates, criteria, and reliability
- [Development Guide](docs/development.md) — setup, build commands, testing, conventions
- [Webpack Classmap](docs/webpack-classmap.md) — runtime CSS class discovery
- [Performance audit](docs/performance.md) — measurement methodology, hot paths, applied wins
- [QA manual](docs/qa-manual.md) — manual regression checklist + QA harness flag reference

## Development

Setup, environment variables, build / deploy / package commands, testing,
screenshot capture, the local UI test suite, validation flows, the performance
bench, and CDP diagnostics are all in the **[Development Guide](docs/development.md)**.

## Architecture

Directory structure, data flow, key systems, and the Home-injection internals
(recents replacement, focus nav-tree reparent, first-shelf promotion) are
documented in **[docs/architecture.md](docs/architecture.md)**.

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
| macOS | `~/Library/Application Support/Steam` | ⚠️ not via Decky yet (no systemd / no remote port). Steam path discovery is already in place, so macOS support is being considered and will be compatible once a host makes it possible |

> Decky Loader officially supports **SteamOS / Steam Deck only**; Linux-desktop and Windows are community-driven and may break. macOS isn't reachable through Decky today, but the codebase already resolves macOS Steam paths so support can land as soon as a host is available.

### Validated environments

The compatibility suite green-lights the build toolchain (Vite/ESM, TypeScript/Node), Decky Loader 3.x (API v1) + Decky Store publishing, SteamOS 3.5–3.9 (incl. GamepadUI), i18n, and the Python backend — see the [`checks 39/39`](scripts/build/validate-compat.mjs) badge and run `pnpm run validate:compat` to reproduce.

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
