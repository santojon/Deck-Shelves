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

These ids are registered through the same public registries and are
**reserved**: a third-party registration that uses a built-in id, or any id
starting with `deck-shelves.`, is ignored (a warning is logged and the returned
unsubscribe does nothing), so a plugin can never replace a first-party entry.
Pick a `my-plugin.` prefix for your own ids. Unregistering only removes the
entry while it is still yours, so an older unsubscribe never removes a newer
registration under the same id.

Beyond the base conditions and sort keys of [`filters.md`](./filters.md), the
plugin registers:

| Kind | Ids |
| --- | --- |
| Filters, store metadata | `genres` · `categories` · `franchise` · `vrSupport` · `multiplayerType` · `reviewScore` · `releaseDate` · `purchaseDate` · `comingSoon` · `familySharing` · `storeCategory` |
| Filters, play and storage | `playedOnce` · `installedSizeRange` · `achievementPercentRange` · `neverCompleted` |
| Filters, tags | `customTags` · `parserCategories` |
| Filters, composite | `weightedFilter` · `priorityFilter` · `exclusionGroup` |
| Sorts | `friends_playing_now` · `owned_games` · `completion_percent` · `closest_to_completion` · `most_friends_owning` · `trending_among_friends` · `family_shared_games` |
| Sources | `dynamic_collections` · `pinned_games` · `history_source` · `session_queue_source` · `temporary_queue_source` |

Ids that versions before 3.4.2 registered for data the Steam client does not
expose are gone from the registries; a shelf that still names one is
unavailable until it is edited (see `filters.md`), and a plugin may not reuse
those ids either, since a user's older configuration could still carry them.

A condition from a plugin that is not running also makes its shelf unavailable:
the plugin never evaluates a query with a part it cannot run, so an unregistered
filter never widens a shelf to the whole library.

---

For method signatures, descriptor interfaces, the capability matrix and the
version policy, see the **`@deck-shelves/api`** docs linked at the top.
