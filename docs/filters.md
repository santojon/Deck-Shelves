# Filter System

Deck Shelves supports advanced game filtering with AND/OR logic using filter groups.

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
| `merge` | Combine multiple shelf sources | `sources`: ShelfSource[] |
| `storeTag` | Has specific Steam store tags _(pass-through, not yet evaluated)_ | `tags`: string[] |
| `achievements` | Achievement count range _(pass-through, not yet evaluated)_ | `min`, `max`: number |
| `friends` | Minimum friends who own _(pass-through, not yet evaluated)_ | `min`: number |

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

## Legacy Filter Format

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
