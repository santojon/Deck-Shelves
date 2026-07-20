# Plugin API — Deck Shelves runtime notes

The **public API contract** — every `register*` method, descriptor shape, the
capability matrix, install + quick-start, and the version policy — lives in the
separate **`@deck-shelves/api`** package and its repository:

- npm: **`@deck-shelves/api`**
- Full docs / source: **<https://github.com/santojon/Deck-Shelves-API>**

That package is the single source of truth for the contract; the runtime in
[`src/core/pluginApi.ts`](../src/core/pluginApi.ts) imports its canonical types
and re-declares the interface against them. **This page only documents what is
specific to the Deck Shelves runtime** — the globals it exposes, the providers
it ships built-in, how the UI surfaces registrations, and the first-party ids
third-party plugins may collide with.

## Runtime globals

Deck Shelves exposes the API at `window.deckShelves` (`{ version, api,
register }`) and mirrors the registry on `window.__DECK_SHELVES_API__`. Plugins
register through `window.deckShelves.register({ name, onMount(api) })`; the
`@deck-shelves/api` package handles the load-order timing (plugin before /
after / simultaneously with the host).

## Built-in providers (shipped by Deck Shelves)

Every first-party feature registers through the **same** registries third-party
plugins use, so they list uniformly in the UI:

- **Statistics** — two providers, `deck-shelves.library` and
  `deck-shelves.shelf-stats` ([`src/steam/statistics.ts`](../src/steam/statistics.ts)).
  The Settings → Statistics tab renders **one area per registered statistics
  provider**, so a third-party provider appears alongside these with its own
  `displayName`; entries group by `category`.
- **Search** — `deck-shelves.shelves` (Quick Search over shelf contents).
- **Filters / Sorts / Sources (v3)** — the first-party ids listed below.

The Settings → Integrations card lists every registered provider type (sources,
smart sources, filters, sorts, importers, search, side-menu, context, widget,
shelf-renderer, metadata, statistics, recommendation) with a BUILT-IN chip on
first-party entries.

## Built-in catalogues

Discover what Deck Shelves ships so an integration can build on the same
vocabulary instead of hard-coding ids:

- `api.listTriggerCatalog()` — every built-in visibility / profile-trigger rule
  kind (`PublicTriggerKind[]`): `kind`, `category`, `categoryTitleKey`,
  `defaults`, and whether it is `invertible`.
- `api.listShelfTemplates()` — every built-in shelf template
  (`PublicShelfTemplate[]`): `id`, `titleKey`, `category`, `requiresOnline`,
  `defaultSort`, and its `source`.
- `api.listShortcuts()` — every built-in gamepad shortcut (`PublicShortcut[]`):
  `action`, `defaultCombo`, and the user's current `combo`.

All three are read-only snapshots — call them again for the latest state.

## Runtime translations

`api.registerTranslations(locale, dict)` deep-merges your strings into the
locale bundle at runtime and never overwrites built-in keys — namespace yours
(`my-plugin.*`). Built-in strings live in `i18n/<locale>/<area>.json` (see
[`development.md`](./development.md#i18n)).

## Export / import handlers

Offer "Export to format X" / "Import from format Y" for portable, plugin-to-
plugin transfer. Handlers are format-agnostic: both sides exchange the Deck
Shelves **snapshot JSON** (a serialized bundle of shelves, smart shelves, saved
filters and saved smart filters), so the round-trip stays lossless and no
internal types leak.

```ts
// Serialize the snapshot JSON into your format.
const offExport = api.registerExportHandler({
  id: "my-plugin.csv",
  displayName: "My CSV",
  fileExtension: "csv",
  export: (snapshotJson) => toCsv(JSON.parse(snapshotJson)),
});

// Parse your format back into a snapshot JSON string.
const offImport = api.registerImportHandler({
  id: "my-plugin.csv",
  displayName: "My CSV",
  fileExtension: "csv",
  import: (raw) => JSON.stringify(fromCsv(raw)),
});
```

`export` receives the current snapshot JSON and returns your format's text;
`import` receives your text and returns a snapshot JSON string, which Deck
Shelves applies (merge by default). Both may be async. Registered handlers
surface in Settings → Backup. Enumerate them with
`getRegisteredExportHandlers()` / `getRegisteredImportHandlers()`. Additive —
does not bump the API `version`.

## First-party Filter / Sort / Source IDs (v3)

These ids are registered through the same public registries. A third-party
plugin targeting the same id overwrites the built-in implementation
(last-write-wins); pick a `my-plugin.` prefix to avoid collisions.

### Filter v3

| Group | Ids |
| --- | --- |
| Steam metadata | `genres` · `categories` · `franchise` · `vrSupport` · `multiplayerType` · `familySharing` · `dlcOwned` · `soundtrackOwned` |
| User behaviour | `launchCount` · `avgSessionMinutes` · `neverCompleted` · `recentlyAbandoned` · `installedNeverPlayed` · `playedOnce` · `achievementPercentRange` |
| Storage / device | `storageDevice` · `installedSizeRange` · `compatDataQuality` |
| External ecosystem | `emuDeckSystem` · `retroDeckSystem` · `heroicLauncher` · `lutrisApp` · `chiakiApp` · `moonlightApp` |
| Advanced non-Steam | `executableType` · `launchOptionTags` · `customTags` · `parserCategories` · `hiddenLauncherShortcuts` |
| Composite | `weightedFilter` · `priorityFilter` · `exclusionGroup` |

### Sort v3

| Group | Ids |
| --- | --- |
| Usage | `most_launched` · `least_launched` · `longest_session` · `shortest_session` · `most_ignored` · `rediscovered_recently` |
| Achievement | `completion_percent` · `closest_to_completion` · `rarest_achievements` |
| Temporal | `newest_installed` · `oldest_installed` · `oldest_unplayed` · `newest_purchased` |
| Storage | `largest_install` · `smallest_install` · `ssd_priority` · `sd_priority` |
| Social | `friends_playing_now` · `most_friends_owning` · `trending_among_friends` |
| Randomisation | `weighted_random` · `smart_random` · `seeded_random` · `rotating_daily_random` · `avoid_recently_shown` |

### Shelf Source Ecosystem v3

| Group | Ids |
| --- | --- |
| Steam | `dynamic_collections` · `followed_games` · `ignored_games` · `dlc_source` · `soundtrack_source` |
| Manual | `pinned_games` · `history_source` · `session_queue_source` · `temporary_queue_source` |
| Contextual | `recently_updated` · `with_events` · `with_workshop_updates` · `controller_specific_source` |
| External launchers (registered; data populated by the backend probe in `main.py`) | `emudeck_collections` · `retrodeck_collections` · `heroic_library` · `lutris_library` · `moonlight_sessions` · `chiaki_sessions` |

---

For method signatures, descriptor interfaces, the capability matrix and the
version policy, see the **`@deck-shelves/api`** docs linked at the top.
