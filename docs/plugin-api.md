# Plugin API

Deck Shelves exposes a public API at `window.__DECK_SHELVES_API__` that allows other Decky plugins to register custom shelf sources.

## API Version

Current API version: **1**

## Registering a Shelf Source

```typescript
interface ExternalShelfSourceDescriptor {
  /** Unique ID — must be stable across reloads */
  id: string;
  /** Human-readable name shown in the QAM source dropdown */
  displayName: string;
  /** Called whenever Deck Shelves needs to refresh shelf contents */
  resolve: (limit: number) => Promise<number[]>;
}

// Register a custom source
const cleanup = window.__DECK_SHELVES_API__.registerShelfSource({
  id: "my-plugin-favorites",
  displayName: "My Favorites",
  resolve: async (limit) => {
    // Return an array of Steam app IDs
    return [730, 570, 440].slice(0, limit);
  },
});

// Call cleanup when your plugin unloads
cleanup();
```

## How It Works

1. Your plugin calls `registerShelfSource()` during initialization
2. The source appears as an "External" option in the shelf editor dropdown
3. When a user creates a shelf backed by your source, Deck Shelves calls `resolve(limit)` periodically
4. The returned app IDs are displayed as game cards in the shelf

## Persistence

Shelves backed by external sources are persisted as:
```json
{
  "type": "external",
  "sourceId": "my-plugin-favorites"
}
```

If your plugin is not loaded when Deck Shelves starts, the shelf will show empty until the source is registered again.

## Querying Registered Sources

```typescript
const sources = window.__DECK_SHELVES_API__.getRegisteredSources();
// [{ id: "...", displayName: "...", resolve: fn }]
```

## Implementation

Source: [`src/core/pluginApi.ts`](../src/core/pluginApi.ts)
