# Notice — Acknowledgements & Inspirations

Deck Shelves is built on the work of the Steam Deck homebrew community. This file credits the projects that inspired or enabled parts of it — and is explicit about **which parts**. No source is copied from these projects; where Deck
Shelves interoperates with another plugin it reads that plugin's public runtime
state rather than vendoring its code.

If you maintain one of these projects and would like the wording, link, or
attribution adjusted, please open an issue — this is meant as honest credit,
not a claim of endorsement or affiliation.

## Platform

- **[Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)** — the homebrew plugin platform Deck
  Shelves runs on. The plugin uses the Decky SDK (`@decky/api`, `@decky/ui`)
  for its Python↔frontend bridge, UI primitives, routing, and toasts, through
  one adapter module (`src/runtime/host/decky.ts`) so the same code also runs
  on a standalone host runtime by the same author.
  *Used throughout.*

## Inspirations & interoperability

- **[TabMaster](https://github.com/Tormak9970/TabMaster)** — inspired Deck
  Shelves' filter model: the nested **filter-group** shape (AND/OR groups of
  typed filters); no code is copied. Deck Shelves also reads TabMaster's tab context at runtime so
  shelves can reuse user-defined tabs when TabMaster is installed.
  *Used in: the filter-group system (`src/types.ts`, `src/steam/filterEval.ts`)
  and TabMaster interop (`src/integrations/tabmaster.ts`: reading its saved
  tabs and turning a tab into a shelf source or an import).*

- **[UnifiDeck](https://github.com/mubaraknumann/unifideck)** — Deck Shelves
  interoperates with UnifiDeck, reading the collections and library tabs it
  publishes so shelves and filters can tell its games apart and the two coexist
  on the home. *Used in: `src/steam/localLibrary.ts`, `src/steam/libraryTabs.ts`.*

- **[SteamGridDB](https://github.com/SteamGridDB/decky-steamgriddb)** — Deck
  Shelves' compatibility checks validate that custom art applied by the
  SteamGridDB plugin still renders correctly on shelf cards.

- **[Non-Steam Badges](https://github.com/sebet/decky-nonsteam-badges)** — Deck
  Shelves detects and coexists with the non-Steam badge decorations it adds so
  its cards don't clash with them. *Used in: `src/integrations/nonsteambadges.ts`.*

- **Game-card menu pattern — [HLTB for Deck](https://github.com/hulkrelax/hltb-for-deck),
  [CheatDeck](https://github.com/SheffeyG/CheatDeck),
  [Pause Games](https://github.com/popsUlfr/SDH-PauseGames)** — these plugins
  established the additive way of adding items to Steam's game context menu:
  hook the menu's render, so a failed lookup is a harmless no-op that never
  breaks the native menu. Deck Shelves follows the same idea with its own
  implementation; no code is copied. *Used in: `src/core/steamGameMenu.ts` and
  `src/core/menu/`.*

- **Home-injection technique (Decky's `routerHook`)** — injecting custom shelves
  into the SteamOS home goes through the loader's own runtime API
  (`routerHook.addGlobalComponent`). *Used in: `src/runtime/homePatch.tsx`.*

- **[SDH-CssLoader](https://github.com/DeckThemes/SDH-CssLoader) and community
  home themes** — *ArtHero*, *Big Art*, *Centered Home*, *Clean Library Capsule*,
  *Gray Uninstalled*, *Hero Fullscreen*, *No Hero Gradient*, *No Home Text*,
  *Obsidian*, *Round* (focus highlight colour), *Switch Like Home*, and
  *TiltedHome / Renaissance* (on [DeckThemes](https://github.com/DeckThemes)).
  Deck Shelves detects these and visually mirrors their home treatments so
  shelves stay consistent with the active theme.
  *Used in: one adapter per theme under `src/themes/adapters/` with the
  registry in `src/themes/`, detection in `src/core/cssLoaderDetect.ts`.*

## Steam / SteamOS

Deck Shelves integrates with Valve's Steam client and the SteamOS UI (the home,
recents, and Quick Access surfaces). Steam, SteamOS, and Steam Deck are
trademarks of Valve Corporation. Deck Shelves is an unofficial, community
plugin and is not affiliated with or endorsed by Valve.

## Online services

Everything works offline by default. The opt-in online shelves (wishlist,
prices, deals) read Steam's own store and community endpoints
(`store.steampowered.com`, `api.steampowered.com`, `steamcommunity.com`) and
Steam's artwork CDNs; update checks ask GitHub's releases API for this
repository (the pre-release channel is opt-in). No other server is contacted,
and nothing is sent anywhere except those requests. The project website (built
from `site/`) uses GoatCounter for cookie-free page counts.

## Dependencies

Runtime libraries: `react` / `react-dom`, `i18next` / `react-i18next` and `zod`,
plus the Decky SDK packages the loader provides (`@decky/ui`, `@decky/api`), each
under its own license; see the packages for details. The Python backend uses
only the standard library. Build and test tooling (Vite, esbuild, TypeScript,
ESLint, Vitest) never ships. The `api`, `host` and `deckprobe` folders are git
submodules of the author's own sibling projects (the public plugin API, the host
contract and the device QA toolkit), each with its own notices.
