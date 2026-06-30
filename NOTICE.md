# Notice — Acknowledgements & Inspirations

Deck Shelves is built on the work of the Steam Deck homebrew community. This file credits the projects that inspired or enabled parts of it — and is explicit about **which parts**. No source is copied from these projects unless stated; where Deck
Shelves interoperates with another plugin it reads that plugin's public runtime
state rather than vendoring its code.

If you maintain one of these projects and would like the wording, link, or
attribution adjusted, please open an issue — this is meant as honest credit,
not a claim of endorsement or affiliation.

## Platform

- **[Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)** — the homebrew plugin platform Deck
  Shelves runs on. The plugin uses the Decky SDK (`@decky/api`, `@decky/ui`)
  for its Python↔frontend bridge, UI primitives, routing, and toasts.
  *Used throughout.*

## Inspirations & interoperability

- **[TabMaster](https://github.com/Tormak9970/TabMaster)** — inspired Deck
  Shelves' filter model: the nested **filter-group** shape (AND/OR groups of
  typed filters). Deck Shelves also reads TabMaster's tab context at runtime so
  shelves can reuse user-defined tabs when TabMaster is installed.
  *Used in: the filter-group system (`src/types.ts`, the filter evaluation in
  `src/steam/`) and TabMaster interop (`src/integrations/tabmaster.ts`,
  `findTabMasterContextValue`).*

- **[UnifiDeck](https://github.com/mubaraknumann/unifideck)** — Deck Shelves
  interoperates with UnifiDeck, reading its public state so the two coexist on
  the home. *Used in: `src/integrations/unifideck.ts`.*

- **[SteamGridDB](https://github.com/SteamGridDB/decky-steamgriddb)** — Deck
  Shelves' compatibility checks validate that custom art applied by the
  SteamGridDB plugin still renders correctly on shelf cards.

- **[Non-Steam Badges](https://github.com/sebet/decky-nonsteam-badges)** — Deck
  Shelves detects and coexists with the non-Steam badge decorations it adds so
  its cards don't clash with them. *Used in: `src/integrations/nonsteambadges.ts`.*

- **Game-card menu pattern — [HLTB for Deck](https://github.com/hulkrelax/hltb-for-deck),
  [CheatDeck](https://github.com/SheffeyG/CheatDeck),
  [Pause Games](https://github.com/popsUlfr/SDH-PauseGames)** — the
  game-card context-menu items use the same additive **boot-patch** these
  plugins established: patching `LibraryContextMenu.prototype.render` via
  Decky's `afterPatch`, so a failed lookup is a harmless no-op that never
  breaks the native menu. *Used in: `src/core/steamGameMenu.ts`.*

- **Home-injection technique (Decky's `routerHook`)** — injecting custom shelves
  into the SteamOS home, and the experimental "use first shelf as recents" that
  reuses the **native recents** React component (its DOM, CSS, and animations),
  build on the community-standard Decky patching primitives (`addPatch`,
  `addGlobalComponent`, `afterPatch`, `findInReactTree`).
  *Used in: `src/runtime/homePatch.tsx`, `src/runtime/recentsReplace.tsx`.*

- **[HomeMaster](https://github.com/jessebofill/HomeMaster)** (discontinued; fork
  at [maslomeister/HomeMaster](https://github.com/maslomeister/HomeMaster)) — DS
  studied HomeMaster's approach to learn how to **override the native
  home/recents** for the experimental "use first shelf as recents" mode
  (swapping the native recents list's data source rather than hiding it).
  *Used in: `src/runtime/recentsReplace.tsx`.*

- **[SDH-CssLoader](https://github.com/DeckThemes/SDH-CssLoader) and community
  home themes** — *ArtHero*, *Centered Home*, *TiltedHome / Renaissance*, *Obsidian*, and *Round* (on [DeckThemes](https://github.com/DeckThemes)). Deck Shelves detects these and visually mirrors their home treatments so shelves stay consistent with the active theme.
  *Used in: theme detection + visual mirroring (`src/core/cssLoaderDetect.ts`,
  the per-shelf hero / tilt rendering).*

## Steam / SteamOS

Deck Shelves integrates with Valve's Steam client and the SteamOS UI (the home,
recents, and Quick Access surfaces). Steam, SteamOS, and Steam Deck are
trademarks of Valve Corporation. Deck Shelves is an unofficial, community
plugin and is not affiliated with or endorsed by Valve.

## Dependencies

Third-party libraries (notably `@decky/ui`, `@decky/api`, `react-i18next`, and
`zod`) are used under their respective licenses; see each package for details.
