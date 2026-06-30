# Filter System

Deck Shelves supports advanced game filtering with AND/OR logic using filter groups.

<p align="center">
  <img src="../assets/screenshots/shelf-edit-filters.png" alt="Edit shelf — Filters tab (saved filters + AND/OR groups)" width="640">
</p>

## Filter Types

| Type | Description | Parameters |
|------|-------------|------------|
| `installed` | Games currently installed | — |
| `favorites` | Games in your favorites | — |
| `nonSteam` | Non-Steam shortcuts (Epic, GOG, etc.) | — |
| `hidden` | Hidden games | `mode`: `"only"` or `"exclude"` |
| `updatePending` | Games with pending updates | — |
| `isNew` | Added to library within 30 days | — |
| `deckCompatibility` | Steam Deck compatibility level | `levels`: `["verified", "playable", "unsupported", "unknown"]` |
| `playedWithinDays` | Played within N days | `days`: number |
| `playtimeRange` | Total playtime in a range | `minHours`: number, `maxHours`: number (either optional) |
| `nameIncludes` | Name contains substring | `text`: string |
| `nameRegex` | Name matches regex | `pattern`: string |
| `collection` | Games in a specific Steam collection | `collectionId`: string |
| `developer` | Filter by developer name | `developers`: string[] |
| `publisher` | Filter by publisher name | `publishers`: string[] |
| `appIdList` | Explicit whitelist of app IDs | `appIds`: number[] |
| `cloudAvailable` | Steam Cloud support | — |
| `controllerSupport` | Native controller support | `min`: number (1 = partial or full, 2 = full only; default 1) |
| `shortcutType` | Filter by entry kind: game (Steam app_type 1 or unknown), software (app_type 2), tool (any other Steam app_type), link (non-Steam shortcut) | `kinds`: `("game" \| "software" \| "tool" \| "link")[]` (default `["game"]`) |
| `merge` | Nested predicate group with its own `and`/`or` mode (per-app boolean) | `mode`: `"and"` \| `"or"`, `items`: FilterItem[] |
| `storeTag` | Has specific Steam store tags _(pass-through, not yet evaluated)_ | `tags`: string[] |
| `achievements` | Achievement count range _(pass-through, not yet evaluated)_ | `min`, `max`: number |
| `friends` | Minimum friends who own _(pass-through, not yet evaluated)_ | `min`: number |

> **Note:** `storeTag`, `achievements`, and `friends` are stored and exported correctly but are not yet evaluated at runtime — shelves using only these filters will return all library games.

## Filter Groups

Filters can be combined using groups with `AND` or `OR` logic:

```json
{
  "filterGroup": {
    "mode": "and",
    "items": [
      { "type": "installed", "params": {} },
      { "type": "deckCompatibility", "params": { "levels": ["verified", "playable"] } }
    ]
  },
  "sort": "recent"
}
```

Each item can be `inverted` to negate the condition:
```json
{ "type": "installed", "inverted": true, "params": {} }
```

> **Tip:** use `mode: "or"` when you want to surface games that match *any* of several conditions — for example, games by one developer **or** another. Use `mode: "and"` (the default) when every condition must hold simultaneously.

> **Tip:** `inverted` is available on most filter types. Combine it with `mode: "and"` to exclude specific subsets — e.g. installed games that are *not* hidden.

### `merge` — nested predicate groups

`merge` lets a single filter item carry its own sub-group with an
independent `and`/`or` mode, so you can express more complex logic
without restructuring the parent group. It is **not** a list union —
the source pool stays the same and each app is tested once. Mixing a
top-level `and` group with a `merge { or, ... }` child is the usual
shape.

Example: include apps that are installed Steam games **or** any
non-Steam shortcut, in a single shelf:

```json
{
  "filterGroup": {
    "mode": "and",
    "items": [
      {
        "type": "merge",
        "params": {
          "mode": "or",
          "items": [
            { "type": "installed", "params": {} },
            { "type": "nonSteam", "params": {} }
          ]
        }
      }
    ]
  }
}
```

Each `appid` exists exactly once in the source pool, so the result
cannot contain duplicates regardless of how many merge children match
the same app. Cross-platform "same title, different appids" (e.g.
Steam vs. Epic copies) is **not** addressed here — `merge` does not
match by name.

## Sort Options

| Value | Description |
|-------|-------------|
| `alphabetical` | A → Z |
| `recent` | Last played (most recent first) |
| `playtime` | Total playtime (highest first) |
| `release_date` | Release date (newest first) |
| `size_on_disk` | Size on disk (largest first) |
| `metacritic` | Metacritic score (highest first) |
| `review_score` | Steam review score (highest first) |
| `added` | Library acquisition date (newest first) |
| `random` | Stable random shuffle, refreshes every 24 h |
| `manual` | User-defined order (`manualOrder`); ids not in the list fall through to `manualBaseSort` |

### Multi-key sort

`sort` accepts either a single key (back-compat) or an array of keys for a primary/secondary chain. `sortReverse` mirrors the same shape — a boolean to invert every key, or an aligned `boolean[]` for per-key direction.

```json
{ "sort": ["discount_high", "metacritic"], "sortReverse": [false, false] }
```

The first entry is primary; subsequent entries break ties. Internally a single composite comparator walks each key in order until one returns a non-zero result, then JavaScript's stable sort preserves the established order across passes. Using `Array.sort().reverse()` per key would have inverted tied items and undone the secondary ordering — see `src/test/steam/applySortToIds.test.ts` for the pinned regression case.

`manual` and `random` cannot appear in a multi-key chain (non-deterministic — they wouldn't behave as tiebreakers). The editor only exposes them as the single-key primary choice; the resolver drops them from chained arrays.

Per-key `sortReverse` works for any key the multi-key path supports. When `sort` is an array and `sortReverse` is a boolean, the boolean applies to every key.

## Multi-source shelves

A shelf can stack multiple sources and combine their result sets. The editor exposes this implicitly: pick a primary source, then click **+ Adicionar fonte** to stack extras. Single-source shelves persist their source flat (back-compat); two or more collapse into a `composite` source on save:

```json
{
  "source": {
    "type": "composite",
    "combine": "union",
    "sources": [
      { "type": "collection", "collectionId": "my-favorites" },
      { "type": "wishlist" },
      { "type": "tab", "tab": "installed" }
    ]
  }
}
```

### Combine operators

- `union` — games that appear in **any** child source. The first child's order wins; subsequent children append their items in declaration order, de-duped.
- `intersection` — games that appear in **every** child source. Iteration order follows the first child, so users get a predictable primary ordering.

### Per-shelf exhaustion rules

A single shelf cannot stack two identical sources (e.g. *Collection A* + *Collection A*). The editor enforces this per-shelf via an exhaustion check:

- **filter / wishlist / store** — capped at 1 per shelf. Once one is in the source list, the type disappears from the "+ Adicionar fonte" dropdown for that shelf.
- **tab / collection** — capped at the total Steam catalog size. Each tab/collection used reduces the available options; once every tab (or collection) is in use on this shelf, the type disappears.
- The same source CAN appear on multiple shelves — exhaustion is per-shelf, not global.

For multi-criteria predicates on a single source, use the [`merge` filter](#merge--nested-predicate-groups) instead of stacking multiple `filter` sources.

### Depth cap

Composite sources may nest (the schema permits it for power users editing JSON directly). The resolver caps recursion at 4 levels deep — beyond that the branch returns an empty result and logs a warning. The editor only exposes one level of nesting.

## Legacy Filter Format

> **Note:** if you are importing shelves from a backup or from TabMaster, the conversion to the group format happens automatically — you do not need to migrate manually.

Older settings may use a flat filter format:
```json
{ "installed": true, "favorites": true, "sort": "alphabetical" }
```

These are automatically converted to the group format at runtime via `legacyFilterToGroup()`.

## Implementation

- Filter evaluation: `src/steam/index.ts` → `evaluateFilterItem()`, `evaluateFilterGroup()`
- Filter UI: `src/components/FilterPanel.tsx`
- Legacy conversion: `src/domain/settings.ts` → `legacyFilterToGroup()`
- Custom filter types: `src/domain/customfilters.ts`
