# Plugin API

Deck Shelves exposes a public API at `window.__DECK_SHELVES_API__` so other Decky plugins can extend its surface — adding shelf sources, smart-shelf templates, filter types, sort options, import formats, and pre-baked saved filters at runtime — and (in a follow-up release) consume Deck Shelves' own state.

This document covers **API v2**. The v1 surface (`registerShelfSource` / `getRegisteredSources`) is preserved unchanged.

---

## Table of contents

- [Detection — the simple way](#detection--the-simple-way)
- [Versioning](#versioning)
  - [Built-in registry surface](#built-in-registry-surface)
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

Per-descriptor versioning: each `Register*Descriptor` shape accepts an optional `version?: number` field. Bump it independently of the API surface `version` when you add new optional fields specific to your descriptor type — internal handlers can branch on `(d.version ?? 1) >= 2` without forcing a global API bump.

Events:
- `deck-shelves-ready` — fired on `window`, `event.detail` is the API. Fires synchronously after install.
- `deck-shelves-teardown` — fired before the API is removed from the global. Use to release cached references.

### Built-in registry surface

Every first-party id (16 smart-shelf modes, 21 filter types, 10 sort options) is registered on the same registry external plugins write to. So `getRegisteredSmartSources()`, `getRegisteredFilterTypes()` and `getRegisteredSortOptions()` enumerate **built-ins + external entries**.

Resolver precedence is fixed: built-in ids always win. An external descriptor that registers an id matching one of our built-ins never replaces it at resolve time. Use the helpers below to detect collisions:

```ts
import {
  isInternalSmartSource,
  isInternalFilterType,
  isInternalSortOption,
} from "deck-shelves";  // also reachable through the global if you don't bundle types

if (isInternalSmartSource("random_pick")) {
  // collision — pick a different id like "myplugin.weekend_picks"
}
```

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

A new import format that surfaces as a quick-action entry inside the QAM. Each registered descriptor adds one button to the right side of the action row in the chosen section (regular shelves or smart shelves). When **two or more** descriptors target the same section, the buttons collapse behind a `…` overflow that opens the full list — matches the existing TabMaster slot when it's the only entry, expands when more plugins join in.

#### Descriptor shape

```ts
api.registerImportType({
  id: "myplugin.format",                 // unique id (recommend `pluginId.formatId`)
  displayName: "Import from MyPlugin",   // shown in the icon's OK overlay AND in the overflow list
  target: "shelves",                     // "shelves" (default) or "smart_shelves"
  icon: <MyIcon />,                      // ReactNode rendered in the action button
  // Either runImport (custom UX) OR parse (default file-picker flow).
  runImport: () => openMyImportModal(),  // called when the user picks the entry
  // — or —
  fileExtension: ".csv",
  parse: async (raw) => ({
    shelves: csvParse(raw).map((r) => ({
      title: r.shelf_name,
      source: { type: "external" as const, sourceId: `myplugin.${r.list_id}` },
      limit: 30,
    })),
    // smartShelves entries land in the smart bucket when target = "smart_shelves":
    smartShelves: [
      { title: "Imported smart shelf", mode: "myplugin.weekend_picks", limit: 20 },
    ],
  }),
});
```

- `target` defaults to `"shelves"`. Set it to `"smart_shelves"` to add to the smart-shelf section.
- `icon` is a `ReactNode`; it's reused as the icon inside the overflow menu.
- `runImport` is invoked when the user activates the entry. Use it when your import needs a custom modal (e.g. a picker for which lists to import). When you provide it, `parse` is unused.
- `parse` is reserved for the default file-picker flow (Phase 2 — currently logs a warning and is a no-op). For now, plugins with a custom UX should always set `runImport`.
- A descriptor populates only one bucket. If your source covers both shelf types, register two descriptors with different `target` values.

#### Worked example: register a smart-shelf importer

```ts
import { withDeckShelves } from "./your-deck-shelves-shim";
import { MySmartIcon } from "./icons";

withDeckShelves((api) => {
  const unsubscribe = api.registerImportType({
    id: "myplugin.smart-import",
    displayName: "Import smart picks from MyPlugin",
    target: "smart_shelves",
    icon: <MySmartIcon />,
    runImport: async () => {
      // Open your own modal / file picker here. When the user confirms,
      // call your plugin's persistence path; you do NOT need to call back
      // into Deck Shelves for the basic case — your `runImport` owns the
      // flow end-to-end.
      const picked = await pickList();
      if (!picked) return;
      await myPlugin.persistImportedList(picked);
      // Optional: surface a toast via Decky's toaster.
    },
  });
  return unsubscribe;  // call on plugin teardown
});
```

When `MyPlugin` is the only registered importer for `smart_shelves`, its icon shows directly next to **Reset** in the QAM smart-shelf section. When a second plugin registers another `smart_shelves` importer, both collapse into the `…` overflow that opens a list with each plugin's icon and `displayName`.

#### Detection helpers

External plugins can detect collisions with built-in ids before registering:

```ts
import type { DeckShelvesPublicAPI } from "deck-shelves";

withDeckShelves((api: DeckShelvesPublicAPI) => {
  // Built-in surface — these always win at resolve time, so prefer to
  // register against fresh ids.
  if (api.hasTabMaster()) {
    // TabMaster's first-party importer is already in the registry under
    // id "tabmaster". Avoid overriding it.
  }
});
```

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

Reading Deck Shelves state from another plugin is **wired and ready** as of `[Unreleased]` (next v2.0.0). The getters return live projections of the user's settings; the `subscribeTo*` methods fire on every relevant change and are diff-gated by JSON identity, so a consumer that only watches one feed (e.g. saved filters) doesn't wake up on unrelated shelf edits.

- `getShelves()`, `getSmartShelves()`, `getSavedFilters()` return the current snapshot.
- `subscribeToShelves(cb)`, `subscribeToSmartShelves(cb)`, `subscribeToSavedFilters(cb)` invoke the callback with the new projection whenever it changes; the returned `Unsubscribe` removes the listener.
- Every `Public*` shape is frozen — read-only fields, never mutated by the API.

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
  // One regular-shelves importer (icon shows directly when alone, otherwise
  // collapses behind `…` with TabMaster / other registered entries).
  api.registerImportType({
    id: "demo.json-import",
    displayName: "Import demo lists (JSON)",
    target: "shelves",
    icon: <DemoIcon />,
    runImport: () => openMyImportPicker(),
  }),
  // One smart-shelves importer (lights up the `…` slot in the smart section
  // — currently empty, so it shows the direct icon).
  api.registerImportType({
    id: "demo.weekend-presets",
    displayName: "Demo weekend presets",
    target: "smart_shelves",
    icon: <CalendarIcon />,
    runImport: () => importWeekendPresets(),
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
