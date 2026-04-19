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

> **Caution:** always call the returned `cleanup()` function in your plugin's `onDismount` / teardown. Failing to do so leaves a stale source registered — Deck Shelves will keep calling your `resolve` function after your plugin is unloaded, which will silently fail or throw.

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

> **Note:** load order between Decky plugins is not guaranteed. Register your source as early as possible in your plugin's initialization, and design `resolve()` to handle being called before your plugin has fully loaded — returning an empty array is always safe.

## Querying Registered Sources

```typescript
const sources = window.__DECK_SHELVES_API__.getRegisteredSources();
// [{ id: "...", displayName: "...", resolve: fn }]
```

## Implementation

> **Note:** the API is currently v1. A v2 surface (`registerFilterType`, `registerSmartShelfSource`, `getSavedFilters`) is planned for v2.0.0 and will be announced before release. The existing `registerShelfSource` / `getRegisteredSources` signatures will not change.

Source: [`src/core/pluginApi.ts`](../src/core/pluginApi.ts)
