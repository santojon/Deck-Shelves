# Plugin API

Deck Shelves exposes a public API at `window.__DECK_SHELVES_API__` so other Decky plugins can extend its surface — adding shelf sources, smart-shelf templates, filter types, sort options, import formats, and pre-baked saved filters at runtime — and (in a follow-up release) consume Deck Shelves' own state.

This document covers **API v2**. The v1 surface (`registerShelfSource` / `getRegisteredSources`) is preserved unchanged.

---

## Table of contents

- [Detection — the simple way](#detection--the-simple-way)
- [Versioning](#versioning)
- [Registries](#registries)
  - [`registerShelfSource`](#registershelfsource)
  - [`registerSmartShelfSource`](#registersmartshelfsource)
  - [`registerFilterType`](#registerfiltertype)
  - [`registerSortOption`](#registersortoption)
  - [`registerImportType`](#registerimporttype)
  - [`registerSavedFilter`](#registersavedfilter)
- [Consumer usage](#consumer-usage)
  - [Reading shelves](#reading-shelves)
  - [Reading smart shelves](#reading-smart-shelves)
  - [Reading saved filters](#reading-saved-filters)
  - [Subscribing to changes](#subscribing-to-changes)
  - [Expected data shapes (worked examples)](#expected-data-shapes-worked-examples)
- [Common types](#common-types)
- [End-to-end example](#end-to-end-example)
- [Stability and ABI](#stability-and-ABI)

---

## Detection — the simple way

Deck Shelves dispatches a `deck-shelves-ready` event on `window` the moment the API is installed. The event's `detail` IS the API object — same reference as `window.__DECK_SHELVES_API__`. There is no polling, no retry loop, no chicken-and-egg.

A 30-line copy-paste helper that handles every load-order case:

```ts
import type { DeckShelvesPublicAPI, Unsubscribe } from "./deck-shelves-api"; // type-only

const cleanups: Unsubscribe[] = [];

function withDeckShelves(use: (api: DeckShelvesPublicAPI) => Unsubscribe[] | void): void {
  const apply = (api: DeckShelvesPublicAPI) => {
    const result = use(api) ?? [];
    cleanups.push(...result);
  };

  // Already loaded? Run immediately.
  const existing = (window as any).__DECK_SHELVES_API__ as DeckShelvesPublicAPI | undefined;
  if (existing && existing.version >= 2) { apply(existing); return; }

  // Otherwise wait for the ready event. Single shot — Deck Shelves emits it
  // on every install, including reinstall after Steam navigates away/back.
  const onReady = (e: Event) => {
    const api = (e as CustomEvent<DeckShelvesPublicAPI>).detail;
    if (api && api.version >= 2) apply(api);
  };
  window.addEventListener("deck-shelves-ready", onReady);
  cleanups.push(() => window.removeEventListener("deck-shelves-ready", onReady));

  // Drop our entries when Deck Shelves unloads — its registries are wiped
  // anyway, but releasing our cached `api` reference avoids leaks.
  const onTeardown = () => releaseAll();
  window.addEventListener("deck-shelves-teardown", onTeardown);
  cleanups.push(() => window.removeEventListener("deck-shelves-teardown", onTeardown));
}

function releaseAll(): void {
  for (const c of cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
}

// In your plugin:
withDeckShelves((api) => [
  api.registerShelfSource({ id: "demo.recent", displayName: "My Recent",
    resolve: async (limit) => fetchRecent(limit) }),
  // …more registrations; each returns its own Unsubscribe → kept by `cleanups`.
]);

// On your plugin teardown:
function onUnload() { releaseAll(); }
```

The same `cleanups` array unifies registration cleanup, ready/teardown listener cleanup, and your own teardown — one call drops everything.

---

## Versioning

| Field | Value | Notes |
|---|---|---|
| `version` | `2` | Increments on breaking change. Always check `version >= N` before calling new methods. |
| Surface | `window.__DECK_SHELVES_API__` | Same global object across versions. |
| Lifetime | Lives until Deck Shelves unloads. | Cleared on plugin teardown — re-register on a fresh install via the `deck-shelves-ready` event. |

Events:
- `deck-shelves-ready` — fired on `window`, `event.detail` is the API. Fires synchronously after install.
- `deck-shelves-teardown` — fired before the API is removed from the global. Use to release cached references.

---

## Registries

Every `register*` method returns an `Unsubscribe` — a `() => void` that removes the entry. Calling it more than once is safe.

### `registerShelfSource`

A regular shelf source. Persisted as `{ type: "external", sourceId: <id> }`.

```ts
api.registerShelfSource({
  id: "playnite.recently-imported",       // stable; recommend `pluginName.entryName`
  displayName: "Recently Imported (Playnite)",
  resolve: async (limit) => {
    const ids = await playniteBridge.fetchRecent();
    return ids.slice(0, limit);
  },
});
```

**Failure modes:** returning `[]` shows an empty shelf; throwing is caught and treated as `[]`; duplicates are deduplicated.

### `registerSmartShelfSource`

A smart-shelf template with optional per-shelf parameters. Persisted as `{ type: "smart", mode: <id> }`.

```ts
api.registerSmartShelfSource({
  id: "my-plugin.cozy-evening",
  displayName: "Cozy Evening Picks",
  category: "time",
  defaultParams: { maxPlaytimeHours: 3, lookbackDays: 30 },
  paramMeta: {
    maxPlaytimeHours: { label: "Max session", min: 1, max: 12, step: 1, unit: "h" },
    lookbackDays:     { label: "Lookback",    min: 7, max: 90, step: 1, unit: "days" },
  },
  resolve: async (limit, params) => {
    const apps = await myBridge.eligible({
      maxPlaytimeMinutes: params.maxPlaytimeHours * 60,
      sinceTs: Date.now() - params.lookbackDays * 86_400_000,
    });
    return apps.map((a) => a.appid).slice(0, limit);
  },
});
```

`params` arrives merged with `defaultParams` — your resolver never sees missing keys.

### `registerFilterType`

Pure predicate evaluated per-game by the FilterPanel resolver. Used inside a `FilterGroup` `item` — `{ type: <your-id>, params: {…}, inverted?: boolean }`.

```ts
api.registerFilterType({
  id: "my-plugin.has-mod-support",
  displayName: "Has mod support",
  evaluate: (app, params) => modCatalog.countFor(app.appid) >= Number(params.minMods ?? 1),
  defaultParams: { minMods: 1 },
});
```

> **Phase 1 limitation:** the FilterPanel UI does not yet render external editors. Runtime evaluation works as soon as the type is registered. Editor rendering arrives in a follow-up release.
>
> **Pass-through behavior:** if a filter item references a `type` that is neither built-in nor registered, the predicate returns `true` — an unregistered plugin filter never hides the user's library.

### `registerSortOption`

Pure ordering function. The user picks your sort id from the shelf's sort dropdown; it's persisted on the shelf.

```ts
api.registerSortOption({
  id: "my-plugin.alphabetical-no-articles",
  displayName: "Alphabetical (ignore A/An/The)",
  sort: (ids, apps) => {
    const byId = new Map(apps.map((a) => [a.appid, a] as const));
    const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, "");
    return [...ids].sort((a, b) =>
      stripArticle(byId.get(a)?.name ?? "").localeCompare(stripArticle(byId.get(b)?.name ?? ""))
    );
  },
});
```

> **Must return a NEW array.** Do not mutate input. Throwing or returning `null` falls back to alphabetical so the shelf still renders.

### `registerImportType`

A new import format the user can paste/load.

```ts
api.registerImportType({
  id: "playnite.csv",
  displayName: "Playnite library (CSV)",
  fileExtension: ".csv",
  parse: async (raw) => ({
    shelves: csvParse(raw).map((r) => ({
      title: r.shelf_name,
      source: { type: "external" as const, sourceId: `playnite.${r.list_id}` },
      limit: 30,
    })),
  }),
});
```

> **Phase 1 limitation:** the registry is exposed but the ImportModal UI does not yet show external types. Plugins can read `getRegisteredImportTypes()` and drive their own import flow today.

### `registerSavedFilter`

Seed a pre-baked saved filter. Appears in the QAM Saved Filters section like any user-created entry, but persisted with id prefix `ext:` so it never collides.

```ts
api.registerSavedFilter({
  id: "my-plugin.couch-coop",
  name: "Couch Co-op",
  group: {
    mode: "and",
    items: [
      { type: "controllerSupport", params: { min: 1 } },
      { type: "installed" },
      { type: "playtimeRange", params: { maxHours: 50 } },
    ],
  },
});
```

Idempotent: re-registering the same id replaces the previous entry. Cleanup removes it from settings.

---

## Consumer usage

Reading Deck Shelves state from another plugin is exposed as **stable type contracts** today. The methods exist on the API surface — write your code against them now and it starts receiving data automatically when the feed lights up in a follow-up release.

Until then:
- `getShelves()`, `getSmartShelves()`, `getSavedFilters()` return `[]`.
- `subscribeToShelves()`, `subscribeToSmartShelves()`, `subscribeToSavedFilters()` register the callback but never fire.
- Every `subscribe*` returns a no-op `Unsubscribe` — calling it is harmless.

### Reading shelves

```ts
withDeckShelves((api) => {
  const shelves = api.getShelves();
  for (const shelf of shelves) {
    console.log(`${shelf.title} (${shelf.source.type})`, shelf.limit);
  }
});
```

### Reading smart shelves

```ts
withDeckShelves((api) => {
  const smart = api.getSmartShelves();
  const enabled = smart.filter((s) => s.enabled && !s.hidden);
  console.log(`${enabled.length} smart shelves active`);
});
```

### Reading saved filters

```ts
withDeckShelves((api) => {
  const saved = api.getSavedFilters();
  const ownedByMe = saved.filter((f) => f.id.startsWith("ext:my-plugin."));
  console.log(`I own ${ownedByMe.length} of ${saved.length} saved filters`);
});
```

### Subscribing to changes

```ts
withDeckShelves((api) => [
  api.subscribeToShelves((shelves) => {
    // Fires whenever a shelf is added, removed, edited, or reordered.
    rerenderMyDashboard(shelves);
  }),
  api.subscribeToSavedFilters((filters) => {
    // Fires whenever a saved filter is created, renamed, or deleted.
    refreshMyFilterPicker(filters);
  }),
]);
```

The cleanup is included in the return array so the existing helper handles teardown.

### Expected data shapes (worked examples)

What `getShelves()` returns when the feed is implemented — a real example with one of each source type:

```ts
const shelves: PublicShelf[] = [
  {
    id: "shelf_recently_added",
    title: "Recently Added",
    enabled: true,
    hidden: false,
    limit: 20,
    sort: "added",
    source: { type: "tab", tab: "Library" },
  },
  {
    id: "shelf_console_rpgs",
    title: "Console RPGs",
    enabled: true,
    hidden: false,
    limit: 30,
    source: {
      type: "filter",
      filter: {
        sort: "metacritic",
        group: {
          mode: "and",
          items: [
            { type: "controllerSupport", params: { min: 2 } },
            { type: "storeTag", params: { tags: ["RPG"] } },
            { type: "installed" },
          ],
        },
      },
    },
  },
  {
    id: "shelf_favorites",
    title: "Favorites",
    enabled: true,
    hidden: false,
    limit: 20,
    source: { type: "collection", collectionId: "favorite" },
  },
  {
    id: "shelf_my_plugin_recent",
    title: "From My Plugin",
    enabled: true,
    hidden: false,
    limit: 10,
    source: { type: "external", sourceId: "my-plugin.recent" },
  },
];
```

What `getSmartShelves()` returns:

```ts
const smartShelves: PublicSmartShelf[] = [
  {
    id: "smart_quick_play",
    title: "Quick Play",
    mode: "quick_play",                  // built-in mode id
    enabled: true,
    hidden: false,
    limit: 12,
  },
  {
    id: "smart_my_plugin_cozy",
    title: "Cozy Evening Picks",
    mode: "my-plugin.cozy-evening",      // your registered id
    enabled: true,
    hidden: false,
    limit: 8,
    sort: "playtime",                    // user picked an override
  },
];
```

What `getSavedFilters()` returns:

```ts
const savedFilters: PublicSavedFilter[] = [
  {
    id: "abc123",                                   // user-created (no prefix)
    name: "RPGs I haven't played",
    group: {
      mode: "and",
      items: [
        { type: "storeTag", params: { tags: ["RPG"] } },
        { type: "playtimeRange", params: { maxHours: 1 } },
      ],
    },
  },
  {
    id: "ext:my-plugin.couch-coop",                // plugin-registered
    name: "Couch Co-op",
    group: {
      mode: "and",
      items: [
        { type: "controllerSupport", params: { min: 1 } },
        { type: "installed" },
      ],
    },
  },
];
```

Telling apart user-created from plugin-registered entries: any `id` starting with `ext:` was added via `registerSavedFilter`. The portion after the prefix is exactly the `id` you passed (`my-plugin.couch-coop` in the example above).

---

## Common types

```ts
type Unsubscribe = () => void;

interface PublicAppMeta {
  readonly appid: number;
  readonly name: string;
  readonly installed: boolean;
  readonly is_non_steam: boolean;
  readonly playtime_forever?: number;        // minutes
  readonly last_played?: number;             // unix seconds
  readonly deck_compatibility_category?: number; // 0=unknown, 1=unsupported, 2=playable, 3=verified
  readonly bCloudAvailable?: boolean;
  readonly nControllerSupport?: number;       // 0=none, 1=partial, 2=full
}

interface PublicFilterGroup {
  mode: "and" | "or";
  items: ReadonlyArray<PublicFilterItem>;
}

interface PublicFilterItem {
  type: string;                              // built-in or registered id
  inverted?: boolean;
  params?: Readonly<Record<string, unknown>>;
}

interface PublicShelf {
  readonly id: string;
  readonly title: string;
  readonly enabled: boolean;
  readonly hidden: boolean;
  readonly limit: number;
  readonly sort?: string;
  readonly source: PublicShelfSource;
}

type PublicShelfSource =
  | { type: "collection"; collectionId: string }
  | { type: "tab"; tab: string }
  | { type: "filter"; filter: { sort?: string; group?: PublicFilterGroup } }
  | { type: "external"; sourceId: string }
  | { type: "smart"; mode: string };

interface PublicSmartShelf {
  readonly id: string;
  readonly title: string;
  readonly mode: string;
  readonly enabled: boolean;
  readonly hidden: boolean;
  readonly limit?: number;
  readonly sort?: string;
}

interface PublicSavedFilter {
  readonly id: string;
  readonly name: string;
  readonly group: PublicFilterGroup;
}
```

> Field names mirror Deck Shelves' internal types but are intentionally a **read-only subset**. Do not mutate any object handed to your callback; treat them as immutable snapshots.

---

## End-to-end example

A small plugin that contributes one shelf source, one smart source, one filter type, one sort option, one saved filter, AND consumes shelves + saved filters — all using the same compact integration helper.

```ts
import type {
  DeckShelvesPublicAPI, Unsubscribe,
  PublicShelf, PublicSavedFilter,
} from "./deck-shelves-api"; // type-only

const cleanups: Unsubscribe[] = [];

function withDeckShelves(use: (api: DeckShelvesPublicAPI) => Unsubscribe[] | void): void {
  const apply = (api: DeckShelvesPublicAPI) => {
    const result = use(api) ?? [];
    cleanups.push(...result);
  };
  const existing = (window as any).__DECK_SHELVES_API__ as DeckShelvesPublicAPI | undefined;
  if (existing && existing.version >= 2) { apply(existing); return; }
  const onReady = (e: Event) => {
    const api = (e as CustomEvent<DeckShelvesPublicAPI>).detail;
    if (api && api.version >= 2) apply(api);
  };
  window.addEventListener("deck-shelves-ready", onReady);
  cleanups.push(() => window.removeEventListener("deck-shelves-ready", onReady));
  const onTeardown = () => releaseAll();
  window.addEventListener("deck-shelves-teardown", onTeardown);
  cleanups.push(() => window.removeEventListener("deck-shelves-teardown", onTeardown));
}

function releaseAll() {
  for (const c of cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
}

// ---- Plugin onLoad --------------------------------------------------------

withDeckShelves((api) => [
  // Producer side — register everything in one go.
  api.registerShelfSource({
    id: "demo.cloud-only",
    displayName: "Cloud-only games",
    resolve: async (limit) => fetchCloudGames(limit),
  }),
  api.registerSmartShelfSource({
    id: "demo.weekend-grind",
    displayName: "Weekend Grind",
    category: "time",
    defaultParams: { minSessionMinutes: 60 },
    paramMeta: {
      minSessionMinutes: { label: "Min session", min: 30, max: 240, step: 30, unit: "min" },
    },
    resolve: async (limit, params) =>
      fetchWeekendCandidates(params.minSessionMinutes, limit),
  }),
  api.registerFilterType({
    id: "demo.has-screenshots",
    displayName: "Has screenshots taken",
    evaluate: (app) => screenshotIndex.has(app.appid),
  }),
  api.registerSortOption({
    id: "demo.completion-percent",
    displayName: "Completion %",
    sort: (ids, apps) => {
      const byId = new Map(apps.map((a) => [a.appid, a] as const));
      return [...ids].sort((a, b) =>
        completionPct(byId.get(b)) - completionPct(byId.get(a)),
      );
    },
  }),
  api.registerSavedFilter({
    id: "demo.cloud-and-controller",
    name: "Cloud + Controller",
    group: {
      mode: "and",
      items: [
        { type: "cloudAvailable" },
        { type: "controllerSupport", params: { min: 1 } },
      ],
    },
  }),
  // Consumer side — react to user state.
  api.subscribeToShelves((shelves: ReadonlyArray<PublicShelf>) => {
    rerenderDashboard(shelves);
  }),
  api.subscribeToSavedFilters((filters: ReadonlyArray<PublicSavedFilter>) => {
    refreshFilterPicker(filters);
  }),
]);

// ---- Plugin onUnload ------------------------------------------------------

function onUnload() { releaseAll(); }
```

That's the whole pattern: one helper, one array of cleanups, one teardown call. Add or remove registrations by editing the returned array — no per-feature plumbing.

---

## Stability and ABI

Every shape exported from `src/core/pluginApi.ts` is part of the public ABI:

| Change | Effect on `version` |
|---|---|
| New optional field in a descriptor | None — additive |
| New optional method on the API surface | None — additive |
| New required field, removed/renamed field, removed/renamed method | Bumps `version` |
| Internal evaluator behavior change (e.g. error policy on `evaluate`) | None unless documented as a contract change |

External plugins should:
1. Always check `api.version >= N` before calling new methods.
2. Always store and call the returned `Unsubscribe` on teardown.
3. Never mutate any object handed in by Deck Shelves (`PublicAppMeta`, etc.).
4. Always handle `[]` / `null` / thrown errors as a normal outcome — Deck Shelves swallows your errors so the home keeps rendering.

Source: [`src/core/pluginApi.ts`](../src/core/pluginApi.ts).
