# Plugin API — Contract Freeze (v4)

This document is the **frozen** surface that third-party Decky / Standalone
plugins target when integrating with Deck Shelves. Additive changes are
allowed after the freeze; removing or changing the shape of any descriptor
already listed here is a breaking change.

`DeckShelvesPublicAPI.version` is `5` as of this freeze. The runtime
`HOST_API_VERSION` string (`"1.0.0"`) is a separate contract that the
[shelves-loader](https://github.com/santojon/shelves-loader) standalone host
also targets — that one governs `window.__SHELVES_HOST__` injection.

---

## Registries

Every registration returns an `Unsubscribe` (`() => void`). Calling it
removes the descriptor from the registry. Descriptors share a stable `id`
that must be a non-empty string; collisions clobber the existing entry
deterministically (last-write-wins). Pick a `my-plugin.` prefix to avoid
stomping built-ins.

### Regular shelf sources

```ts
api.registerShelfSource(d: ExternalShelfSourceDescriptor): Unsubscribe
api.getRegisteredSources(): ReadonlyArray<ExternalShelfSourceDescriptor>
```

```ts
interface ExternalShelfSourceDescriptor {
 id: string;
 displayName: string;
 version?: string | number;
 resolve(limit: number): Promise<number[]> | number[];
}
```

### Smart shelf sources

```ts
api.registerSmartShelfSource(d: SmartShelfSourceDescriptor): Unsubscribe
api.getRegisteredSmartSources(): ReadonlyArray<SmartShelfSourceDescriptor>
```

```ts
interface SmartShelfSourceDescriptor {
 id: string;
 displayName: string;
 category?: string; // grouping in the picker
 defaultParams?: Record<string, number>;
 resolve(limit: number, params: Record<string, number>): Promise<number[]> | number[];
}
```

### Filter types

```ts
api.registerFilterType(d: ExternalFilterTypeDescriptor): Unsubscribe
api.getRegisteredFilterTypes(): ReadonlyArray<ExternalFilterTypeDescriptor>
```

```ts
interface ExternalFilterTypeDescriptor {
 id: string;
 displayName: string;
 invertible?: boolean; // default true — supports !filter
 evaluate(app: PublicAppMeta, params: Record<string, unknown>): boolean;
}
```

### Sort options

```ts
api.registerSortOption(d: ExternalSortOptionDescriptor): Unsubscribe
api.getRegisteredSortOptions(): ReadonlyArray<ExternalSortOptionDescriptor>
```

```ts
interface ExternalSortOptionDescriptor {
 id: string;
 displayName: string;
 sort(appIds: ReadonlyArray<number>, meta: ReadonlyMap<number, PublicAppMeta>): number[];
 requiresOnline?: boolean;
}
```

### Import types + saved filters

```ts
api.registerImportType(d: ExternalImportTypeDescriptor): Unsubscribe
api.registerSavedFilter(d: ExternalSavedFilterDescriptor): Unsubscribe
api.getRegisteredImportTypes(): ReadonlyArray<ExternalImportTypeDescriptor>
api.getRegisteredImportTypesForTarget(target: "shelves" | "smart_shelves"): ReadonlyArray<ExternalImportTypeDescriptor>
api.getSavedFilters(): ReadonlyArray<PublicSavedFilter>
api.getSavedSmartFilters(): ReadonlyArray<PublicSavedSmartFilter>
api.subscribeSavedFilters(cb: (filters: ReadonlyArray<PublicSavedFilter>) => void): Unsubscribe
```

### Search providers (v4)

```ts
api.registerSearchProvider(d: SearchProviderDescriptor): Unsubscribe
api.getRegisteredSearchProviders(): ReadonlyArray<SearchProviderDescriptor>
```

```ts
interface SearchProviderDescriptor {
 id: string;
 displayName: string;
 priority?: number; // default 0; higher first
 search(query: string, limit: number): Promise<SearchHit[]> | SearchHit[];
}
interface SearchHit {
 id: string;
 appid?: number;
 title?: string;
 subtitle?: string;
 score?: number;
 onActivate?(): void;
}
```

The built-in shelf search (`deck-shelves.shelves`, priority `100`) is
registered through the same surface.

### Side-menu providers (v4)

```ts
api.registerSideMenuProvider(d: SideMenuProviderDescriptor): Unsubscribe
api.getRegisteredSideMenuProviders(): ReadonlyArray<SideMenuProviderDescriptor>
```

```ts
interface SideMenuProviderDescriptor {
 id: string;
 displayName: string;
 resolve(context: SideMenuContext): Promise<SideMenuEntry[]> | SideMenuEntry[];
}
interface SideMenuContext {
 shelfId: string | null;
 focusedAppid: number | null;
}
interface SideMenuEntry {
 id: string;
 label: string;
 category?: string;
 icon?: unknown; // ReactNode at runtime
 disabled?: boolean;
 onActivate(): void | Promise<void>;
}
```

### Context providers (v4)

```ts
api.registerContextProvider(d: ContextProviderDescriptor): Unsubscribe
api.getRegisteredContextProviders(): ReadonlyArray<ContextProviderDescriptor>
```

```ts
interface ContextProviderDescriptor {
 id: string;
 displayName: string;
 version?: string | number;
 snapshot(): unknown; // sync snapshot of current value
 subscribe(cb: (value: unknown) => void): () => void;
}
```

a planned Visibility Rules v2 + a planned profile auto-switch resolve
predicates against the snapshot/subscribe pair.

### Widget providers (v4)

```ts
api.registerWidgetProvider(d: WidgetProviderDescriptor): Unsubscribe
api.getRegisteredWidgetProviders(): ReadonlyArray<WidgetProviderDescriptor>
```

```ts
interface WidgetProviderDescriptor {
 id: string;
 displayName: string;
 version?: string | number;
 render(size: { width: number; height: number }): unknown; // ReactNode at runtime
 refreshPolicy?: number | "focus" | null; // ms, "on focus", or none
 skeleton?(): unknown;
}
```

### Shelf renderers (v4)

```ts
api.registerShelfRenderer(d: ShelfRendererDescriptor): Unsubscribe
api.getRegisteredShelfRenderers(): ReadonlyArray<ShelfRendererDescriptor>
```

```ts
interface ShelfRendererDescriptor {
 id: string;
 displayName: string;
 version?: string | number;
 layout(params: {
 items: ReadonlyArray<{ appid: number; name?: string }>;
 focusedAppid: number | null;
 cardWidth: number;
 cardHeight: number;
 featured: boolean;
 }): unknown; // ReactNode at runtime
 cardMode?: "normal" | "featured" | "compact";
 virtualiseAfter?: number;
}
```

### Metadata providers (v4)

```ts
api.registerMetadataProvider(d: MetadataProviderDescriptor): Unsubscribe
api.getRegisteredMetadataProviders(): ReadonlyArray<MetadataProviderDescriptor>
```

```ts
interface MetadataProviderDescriptor {
 id: string;
 displayName: string;
 version?: string | number;
 fields: ReadonlyArray<string>;
 resolve(appids: ReadonlyArray<number>, signal?: AbortSignal): Promise<Record<number, Record<string, unknown>>>;
}
```

Filter v3 + Sort v3 query the registry by `fields[]` so only matching
providers run for each consumer call.

---

## Snapshots + subscriptions

```ts
api.getShelves(): ReadonlyArray<PublicShelf>
api.getSmartShelves(): ReadonlyArray<PublicSmartShelf>
api.subscribeShelves(cb: (s: ReadonlyArray<PublicShelf>) => void): Unsubscribe
api.subscribeSmartShelves(cb: (s: ReadonlyArray<PublicSmartShelf>) => void): Unsubscribe
api.subscribeSavedFilters(cb:...): Unsubscribe
```

## Focus tracking

```ts
api.getFocusedCard(): { appid: number; shelfId: string | null } | null
api.subscribeFocusedCard(cb:...): Unsubscribe
```

## Asset URLs

```ts
api.getAssetUrls(appid: number, type: AssetType): string[]
```

`AssetType` is `"hero" | "heroBlur" | "portrait" | "landscape" | "logo" | "icon" | "storeBackground"`. The result list is ordered loopback → customimages → CDN; consumers attempt each in order and fall through on 404.

## Environment probes

```ts
api.hasTabMaster(): boolean
```

---

## Lifecycle

External plugins register through `window.deckShelves.register`:

```ts
window.deckShelves.register({
 name: "my-plugin",
 version: "1.0.0",
 onMount(api: DeckShelvesPublicAPI) { /* register descriptors here */ },
 onUnmount?() { /* cleanup */ },
}): Unsubscribe
```

The `@deck-shelves/api` package handles three timing cases automatically — plugin loads before / after / simultaneously with the host — and routes each path to the same `onMount` callback.

---

## First-party Filter / Sort / Source IDs (v3)

These ids are registered through the SAME public registries above. Third-party plugins targeting the same predicate ids will overwrite the built-in implementation (last-write-wins); pick a `my-plugin.` prefix to avoid collision.

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

## Version policy

`DeckShelvesPublicAPI.version` bumps on every breaking change. Additions (new descriptor types, new methods, new ids) DO NOT bump the version — consumers gate on `api.version >= N` only when calling methods introduced in version N or later.

The contract above is frozen as of v4. Future additions (e.g. `renderMode` UI, `trigger` resolver, Widget consumer surface) land without bumping the version.
