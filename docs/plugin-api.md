# Plugin API — Deck Shelves runtime notes

The **public API contract** — every `register*` method, descriptor shape, the
capability matrix, install + quick-start, and the version policy — lives in the
separate **`@deck-shelves/api`** package and its repository:

- npm: **`@deck-shelves/api`**
- Full docs / source: **<https://github.com/santojon/Deck-Shelves-API>**

That package is the single source of truth for the contract: the runtime in
[`src/core/pluginApi.ts`](../src/core/pluginApi.ts) declares no public types of
its own — it imports and **re-exports** them from `@deck-shelves/api`, so the
published contract and the running code cannot drift. **This page only documents
what is specific to the Deck Shelves runtime** — the globals it exposes, the
providers it ships built-in, how the UI surfaces registrations, and the
first-party ids third-party plugins may collide with.

## Runtime globals

Deck Shelves exposes the API at `window.deckShelves` (`{ version, api,
register }`). Plugins
register through `window.deckShelves.register({ name, onMount(api) })`; the
`@deck-shelves/api` package handles the load-order timing (plugin before /
after / simultaneously with the host).

## Built-in providers (shipped by Deck Shelves)

First-party entries sit in the same registries third-party plugins use, so they
list uniformly in the UI. Two kinds do their work through the registry:

- **Statistics** — two providers, `deck-shelves.library` and
  `deck-shelves.shelf-stats` ([`src/steam/statistics.ts`](../src/steam/statistics.ts)).
  The Settings → Statistics tab renders **one area per registered statistics
  provider**, so a third-party provider appears alongside these with its own
  `displayName`; entries group by `category`.
- **Search** — `deck-shelves.shelves` (Quick Search over shelf contents).

The built-in **sources, smart sources, filters and sorts** are listed through
the registry but not run by it. `getRegisteredSources()`,
`getRegisteredSmartSources()`, `getRegisteredFilterTypes()` and
`getRegisteredSortOptions()` return every one the editors offer, next to plugin
entries, each with the name the editors show, in the interface language, as
`displayName`. Their `resolve`, `evaluate` and `sort` callbacks do nothing (an
empty list, `false`, the order they were given): Deck Shelves evaluates its own
ids itself, so these callbacks say nothing about what a shelf contains. Treat
these entries as read-only.

The Settings → Integrations card lists every registered provider type (sources,
smart sources, filters, sorts, importers, search, side-menu, context, widget,
shelf-renderer, metadata, statistics, recommendation) with a BUILT-IN chip on
first-party entries.

## Providers Deck Shelves does not use

`registerContextProvider`, `registerWidgetProvider`, `registerShelfRenderer`,
`registerMetadataProvider` and `registerRecommendationProvider` accept a
descriptor and return a working unsubscribe, and the entry is listed in
Settings → Integrations and by the matching `getRegistered*` call. Nothing in
Deck Shelves reads these five: a context does not feed visibility rules or
profile triggers, a widget is not drawn, a shelf renderer does not replace a
row, metadata fields are not shown or filtered on, and recommendations do not
fill a shelf. Registering one is safe and changes nothing on the Home.

## Where plugin entries appear

- **Sources** (`registerShelfSource`, `registerContextAwareShelfSource`): the
  shelf editor offers the "External source" type only while a plugin source is
  registered, and lists plugin sources only; the built-in lists are under
  "Built-in source". A shelf saved with a plugin source keeps the type on offer
  while the plugin is away. Shelves that older versions saved as an external
  source naming a built-in list load as that built-in list.
- **Filter types** (`registerFilterType`): offered in the condition type picker
  beside the built-in types. A new condition starts from a copy of
  `defaultParams`. When `renderEditor` is present it draws the condition's
  fields: it receives the current `params` and an `onChange(next)` that replaces
  them, and should return controls the gamepad can focus. Negate is offered only
  when `invertible` is `true`. `evaluate` runs once per game each time a shelf
  resolves, so keep it fast.
- **Sort options** (`registerSortOption`): offered under Order by, Base order
  and Sort this source, in regular and smart shelves. In a chain of sort keys, a
  game's position in the list your `sort` returns is its key; games your list
  leaves out come after the others, ordered by the next key.
- **Smart sources** (`registerSmartShelfSource`): offered under Mode and
  Combine modes in the smart-shelf editor, and as a smart source on a
  multi-source shelf. Each `paramMeta` entry becomes a slider on the Smart
  filters tab, starting from `defaultParams`; only values that differ from
  `defaultParams` are saved. Picking your mode sets Order by to Source order,
  so the shelf keeps the order you return, unless the user had changed the
  sort. Combined modes share one set of parameters, and a smart source on a
  multi-source shelf runs with `defaultParams`.

An entry is named by an `integration_<id>` translation registered with
`registerTranslations`, else its `displayName`, else `label`, else its id. Keep
ids to 64 characters or fewer: a longer one cannot be saved in a shelf, so the
editors do not offer it.

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
- `api.listKeyboardShortcuts()` — every built-in action's independent keyboard
  shortcut (`PublicKeyboardShortcut[]`): `action` and the user's current
  `combo`. Unlike gamepad shortcuts, every action defaults to unset — `combo`
  is `null` until the user explicitly binds one.

All four are read-only snapshots — call them again for the latest state.

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

## First-party Filter / Sort / Source IDs

Every id the editors offer is registered as a built-in entry and is
**reserved**: each condition and sort key of [`filters.md`](./filters.md), each
smart mode the smart-shelf editor offers plus `custom`, and the built-in
sources. So are the ids Deck Shelves evaluates without offering them: the
`isNew` condition and every smart-mode id in
[`smart-shelves.md`](./smart-shelves.md), including those of older versions. A
third-party registration that uses a reserved id, or any id starting with
`deck-shelves.`, is ignored (a warning is logged and the returned unsubscribe
does nothing), so a plugin can never replace a first-party entry. Pick a
`my-plugin.` prefix for your own ids. Unregistering only removes the entry while
it is still yours, so an older unsubscribe never removes a newer registration
under the same id.

Beyond the base conditions and sort keys of [`filters.md`](./filters.md), the
built-in entries include:

| Kind | Ids |
| --- | --- |
| Filters, store metadata | `genres` · `categories` · `franchise` · `vrSupport` · `multiplayerType` · `reviewScore` · `releaseDate` · `purchaseDate` · `comingSoon` · `familySharing` · `storeCategory` |
| Filters, play and storage | `playedOnce` · `installedSizeRange` · `achievementPercentRange` · `neverCompleted` |
| Filters, tags | `customTags` · `parserCategories` |
| Filters, composite | `weightedFilter` · `priorityFilter` · `exclusionGroup` |
| Sorts | `friends_playing_now` · `owned_games` · `completion_percent` · `closest_to_completion` · `most_friends_owning` · `trending_among_friends` · `family_shared_games` |
| Sources | `dynamic_collections` · `pinned_games` · `history_source` · `session_queue_source` · `temporary_queue_source` |

Ids that versions before 3.4.2 used for data the Steam client does not expose
are gone from the registries; a shelf that still names one is unavailable until
it is edited (see `filters.md`). Of these, only the old smart-mode ids are
refused at registration. Do not use the old condition, sort or source ids
either: the ones `filters.md` lists as rewritten are changed to their
replacement when the settings load, so a shelf saved with your entry under such
an id would switch to the built-in one, and Deck Shelves may show its own name
for the id instead of yours.

What a user saved with a plugin's filter type, sort option or smart source stays
in their settings while the plugin is not running. The shelf is then
unavailable: it stays empty and one warning is logged, because Deck Shelves
never runs a query with a part it cannot evaluate, so a missing filter never
widens a shelf to the whole library. The editor shows the entry as
"Unavailable" with its id until the plugin is back or the user picks something
else, and saving the shelf keeps it.

Shelves resolve as soon as the Home is drawn. A plugin that registers later is
picked up at the Home's next refresh, which comes about every 30 seconds while
the Home is shown (every 60 seconds on battery) and when the user returns to
it; until then the shelves that use its entries are empty. Register your
entries in `onMount` before any slow work, or call `api.refreshShelf(id)` for
those shelves once they are registered.

---

For method signatures, descriptor interfaces, the capability matrix and the
version policy, see the **`@deck-shelves/api`** docs linked at the top.
