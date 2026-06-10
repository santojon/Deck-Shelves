# Plugin API

Deck Shelves exposes a public API at `window.deckShelves` so other Decky plugins, themes, and external tools can extend its surface — registering shelf sources, smart-shelf templates, filter types, sort options, import formats, and pre-baked saved filters — and consume Deck Shelves' own state.

This document covers **API v3**.

> **Heads up:** v3 dropped the legacy `window.__DECK_SHELVES_API__` global and the `subscribeToShelves` / `subscribeToSmartShelves` / `subscribeToSavedFilters` method names (now `subscribeShelves` etc.). Event names changed from `deck-shelves-ready` / `deck-shelves-teardown` to `deck-shelves:ready` / `deck-shelves:teardown` and the `ready` event no longer carries the API in `detail`. The recommended consumer path is now `import { register } from '@deck-shelves/api'` — see [Detection — the simple way](#detection--the-simple-way).

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

Use the **`@deck-shelves/api`** npm package. The `register()` helper handles every load-order case (Deck Shelves already loaded, loads later, your code loads after the ready event fires) and returns a single unregister function:

```ts
import { register } from "@deck-shelves/api";

const off = register({
  name: "my-plugin",
  version: "1.0.0",
  onMount(api) {
    api.registerShelfSource({
      id: "my-plugin/recent",
      label: "My Recent",
      resolve: async (limit) => fetchRecent(limit),
    });
    api.subscribeFocusedCard((info) => {
      if (info) console.log("focused", info.appid, "on", info.shelfId);
    });
  },
  onUnmount() {
    // Release any cached API references — the api object becomes stale.
  },
});

// When your plugin unloads:
off();
```

Under the hood the helper inspects `window.deckShelves`; if present it calls `register` synchronously, otherwise it pushes to a Symbol-keyed pending queue (`globalThis[Symbol.for('deck-shelves/pending')]`) and listens for `deck-shelves:ready`. Deck Shelves' install drains the queue + dispatches the event, so the integration registers regardless of load order.

### Without the package (direct global access)

You don't have to ship the dependency — `window.deckShelves` is the same surface. The trade-off is you write your own queue-or-ready timing:

```ts
type DSGlobal = {
  version: number;
  api: any; // import the DeckShelvesPublicAPI type if you bundle types
  register(integration: { name: string; onMount(api: any): void; onUnmount?(): void }): () => void;
};

function withDeckShelves(integration: { name: string; onMount(api: any): void; onUnmount?(): void }): () => void {
  const w = window as unknown as { deckShelves?: DSGlobal };
  if (w.deckShelves) return w.deckShelves.register(integration);
  let unmount: (() => void) | undefined;
  const handler = () => {
    unmount = w.deckShelves?.register(integration);
    window.removeEventListener("deck-shelves:ready", handler);
  };
  window.addEventListener("deck-shelves:ready", handler);
  return () => { try { unmount?.(); } catch {} };
}
```

---

## Versioning

| Field | Value | Notes |
|---|---|---|
| `version` | `3` | Increments on breaking change. Always check `version >= N` before calling new methods. |
| Surface | `window.deckShelves` | Contains `{ version, api, register, debug? }`. The `api` field is the `DeckShelvesPublicAPI` object — direct property access is supported but `register()` from `@deck-shelves/api` handles the timing for you. |
| Lifetime | Lives until Deck Shelves unloads. | Integrations registered via `register()` get their `onUnmount` callback fired; if you cached the `api` object directly, the `deck-shelves:teardown` event signals it's no longer safe to use. |

Per-descriptor versioning: each `Register*Descriptor` shape accepts an optional `version?: number` field. Bump it independently of the API surface `version` when you add new optional fields specific to your descriptor type — internal handlers can branch on `(d.version ?? 1) >= 2` without forcing a global API bump.

Events:
- `deck-shelves:ready` — fired on `window` after `window.deckShelves` is installed. No payload — read the global directly.
- `deck-shelves:teardown` — fired before `window.deckShelves` is removed. Release any cached `api` references.

### v3 surface additions

- **`getFocusedCard()`** / **`subscribeFocusedCard(cb)`** — get/observe the currently focused DS card (`{ appid, shelfId } | null`). Backed by a single delegated focusin/focusout listener on the home root, so subscribing multiple times shares one observer.
- **`getAssetUrls(appid, type)`** — returns the prioritized URL list Deck Shelves itself uses for hero / portrait / landscape / logo / icon / heroBlur / storeBackground. Loopback (Steam's local cache) first, then customimages, then CDN.
- **Method rename**: `subscribeToShelves` → `subscribeShelves`, `subscribeToSmartShelves` → `subscribeSmartShelves`, `subscribeToSavedFilters` → `subscribeSavedFilters`.

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

Reading Deck Shelves state from another plugin is wired through the v3 API. Getters return live projections of the user's settings; the `subscribe*` methods fire on every relevant change and are diff-gated by JSON identity, so a consumer that only watches one feed (e.g. saved filters) doesn't wake up on unrelated shelf edits.

- `getShelves()`, `getSmartShelves()`, `getSavedFilters()`, `getSavedSmartFilters()` return the current snapshot.
- `subscribeShelves(cb)`, `subscribeSmartShelves(cb)`, `subscribeSavedFilters(cb)` invoke the callback with the new projection whenever it changes; the returned `Unsubscribe` removes the listener.
- Every `Public*` shape is frozen — read-only fields, never mutated by the API.

### Reading shelves

```ts
register({
  name: "my-plugin",
  onMount(api) {
    for (const shelf of api.getShelves()) {
      console.log(`${shelf.title} (${shelf.source.type})`, shelf.limit);
    }
  },
});
```

### Reading smart shelves

```ts
register({
  name: "my-plugin",
  onMount(api) {
    const enabled = api.getSmartShelves().filter((s) => s.enabled && !s.hidden);
    console.log(`${enabled.length} smart shelves active`);
  },
});
```

### Reading saved filters

```ts
register({
  name: "my-plugin",
  onMount(api) {
    const saved = api.getSavedFilters();
    const ownedByMe = saved.filter((f) => f.id.startsWith("ext:my-plugin."));
    console.log(`I own ${ownedByMe.length} of ${saved.length} saved filters`);
  },
});
```

### Subscribing to changes

```ts
register({
  name: "my-plugin",
  onMount(api) {
    const offShelves = api.subscribeShelves((shelves) => {
      // Fires whenever a shelf is added, removed, edited, or reordered.
      rerenderMyDashboard(shelves);
    });
    const offFilters = api.subscribeSavedFilters((filters) => {
      refreshMyFilterPicker(filters);
    });
    // Stash them on the integration so onUnmount can release them.
  },
});
```

### Focused card + asset URLs (v3)

```ts
register({
  name: "my-plugin",
  onMount(api) {
    api.subscribeFocusedCard((info) => {
      if (!info) return;
      const heroes = api.getAssetUrls(info.appid, "hero");
      // heroes[0] is the loopback URL when Steam has the file cached;
      // fallbacks go through customimages → CDN.
      preloadMyTooltip(info.appid, heroes[0]);
    });
  },
});
```

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

A small plugin that contributes one shelf source, one smart source, one filter type, one sort option, one saved filter, two import handlers, AND consumes shelves + saved filters — all using the `@deck-shelves/api` `register()` helper.

```ts
import { register, type PublicShelf, type PublicSavedFilter, type Unsubscribe } from "@deck-shelves/api";

const off = register({
  name: "demo-plugin",
  version: "1.0.0",
  onMount(api) {
    const subs: Unsubscribe[] = [];

    // Producer side — registrations.
    subs.push(api.registerShelfSource({
      id: "demo.cloud-only",
      label: "Cloud-only games",
      resolve: async (limit) => fetchCloudGames(limit),
    }));
    subs.push(api.registerSmartShelfSource({
      id: "demo.weekend-grind",
      label: "Weekend Grind",
      defaultParams: { minSessionMinutes: 60 },
      resolve: (apps, limit, params) =>
        fetchWeekendCandidates(apps, (params?.minSessionMinutes as number) ?? 60, limit),
    }));
    subs.push(api.registerFilterType({
      id: "demo.has-screenshots",
      label: "Has screenshots taken",
      evaluate: (app) => screenshotIndex.has(app.appid),
    }));
    subs.push(api.registerSortOption({
      id: "demo.completion-percent",
      label: "Completion %",
      sort: (ids, apps) => {
        const byId = new Map(apps.map((a) => [a.appid, a] as const));
        return [...ids].sort((a, b) => completionPct(byId.get(b)) - completionPct(byId.get(a)));
      },
    }));
    subs.push(api.registerSavedFilter({
      id: "demo.cloud-and-controller",
      name: "Cloud + Controller",
      filterGroup: {
        mode: "and",
        items: [
          { type: "cloudAvailable" },
          { type: "controllerSupport", params: { min: 1 } },
        ],
      },
    }));
    subs.push(api.registerImportType({
      id: "demo.json-import",
      label: "Import demo lists (JSON)",
      target: "shelves",
      importer: () => openMyImportPicker(),
    }));
    subs.push(api.registerImportType({
      id: "demo.weekend-presets",
      label: "Demo weekend presets",
      target: "smart_shelves",
      importer: () => importWeekendPresets(),
    }));

    // Consumer side — react to user state.
    subs.push(api.subscribeShelves((shelves: ReadonlyArray<PublicShelf>) => rerenderDashboard(shelves)));
    subs.push(api.subscribeSavedFilters((filters: ReadonlyArray<PublicSavedFilter>) => refreshFilterPicker(filters)));

    // Focus tracking + asset URLs (v3).
    subs.push(api.subscribeFocusedCard((info) => {
      if (info) preloadMyTooltip(info.appid, api.getAssetUrls(info.appid, "hero")[0]);
    }));

    // Hand the cleanup to onUnmount via closure.
    (globalThis as any).__demoCleanup = () => { for (const u of subs) try { u(); } catch {} };
  },
  onUnmount() {
    try { (globalThis as any).__demoCleanup?.(); } catch {}
  },
});

// On plugin unload:
function unloadPlugin() { off(); }
```

That's the whole pattern. `register()` returns a single `Unsubscribe` that fires your `onUnmount` (which in turn fires the per-registration cleanups). No `window.deckShelves` lookup, no ready-event subscription, no teardown listener.

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
