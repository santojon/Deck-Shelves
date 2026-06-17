
import {
  registerInternalSmartShelfSource,
  registerInternalFilterType,
  registerInternalSortOption,
  registerInternalSearchProvider,
  registerInternalShelfSource,
  setInternalBootstrap,
  type SmartShelfSourceDescriptor,
  type ExternalFilterTypeDescriptor,
  type ExternalSortOptionDescriptor,
  type ExternalShelfSourceDescriptor,
} from "./pluginApi";
import { BUILT_IN_SHELF_SEARCH } from "../features/search/builtInProvider";
import {
  V3_FILTER_DESCRIPTORS,
  V3_SORT_DESCRIPTORS,
  V3_SOURCE_DESCRIPTORS,
} from "../steam/v3Extensions";

// Built-in smart-shelf modes. Each gets a noop resolve here — the actual
// computation lives in `resolveSmartShelf` in `src/steam/smartShelves.ts`
// and is reached via the resolver's internal-precedence branch in
// `resolveShelfAppIds`. Plugin authors querying the registry see the id +
// label; calling `resolve()` on this descriptor returns `[]` because the
// registry is descriptive, not authoritative.
const INTERNAL_SMART_DESCRIPTORS: SmartShelfSourceDescriptor[] = [
  { id: "quick_play",      displayName: "Quick Play",      category: "time",     resolve: async () => [] },
  { id: "not_started",     displayName: "Not started",     category: "status",   resolve: async () => [] },
  { id: "deck_picks",      displayName: "Deck picks",      category: "compat",   resolve: async () => [] },
  { id: "rediscover",      displayName: "Rediscover",      category: "time",     resolve: async () => [] },
  { id: "best_unplayed",   displayName: "Best unplayed",   category: "status",   resolve: async () => [] },
  { id: "interrupted",     displayName: "Interrupted",     category: "status",   resolve: async () => [] },
  { id: "time_of_day",     displayName: "Time of day",     category: "time",     resolve: async () => [] },
  { id: "daily_pick",      displayName: "Daily pick",      category: "time",     resolve: async () => [] },
  { id: "on_deck",         displayName: "On Deck",         category: "status",   resolve: async () => [] },
  { id: "recently_played", displayName: "Recently played", category: "time",     resolve: async () => [] },
  { id: "long_session",    displayName: "Long session",    category: "other",    resolve: async () => [] },
  { id: "non_steam",       displayName: "Non-Steam",       category: "platform", resolve: async () => [] },
  { id: "random_pick",     displayName: "Roulette",        category: "other",    resolve: async () => [] },
  { id: "forgotten",       displayName: "Forgotten",       category: "time",     resolve: async () => [] },
  { id: "spare_time",      displayName: "Spare time",      category: "time",     resolve: async () => [] },
  { id: "custom",          displayName: "Custom / Blank",  category: "other",    resolve: async () => [] },
];

// Built-in filter types. Each declares the same id `evaluateFilterGroup`
// dispatches on. The descriptive `evaluate` returns `false` because the
// internal evaluator never consults the registry for these ids.
const INTERNAL_FILTER_TYPES: ExternalFilterTypeDescriptor[] = [
  "installed", "favorites", "nonSteam", "hidden", "updatePending", "isNew",
  "deckCompatibility", "playedWithinDays", "playtimeRange", "nameIncludes",
  "nameRegex", "friends", "storeTag", "achievements", "collection",
  "developer", "publisher", "appIdList", "cloudAvailable",
  "controllerSupport", "merge", "appStatus",
].map<ExternalFilterTypeDescriptor>((id) => ({
  id,
  displayName: id,
  evaluate: () => false,
}));

// Built-in sort options. `applySortToIds` dispatches on these ids; the
// descriptive `sort` here is a noop pass-through (returns input order).
const INTERNAL_SORT_OPTIONS: ExternalSortOptionDescriptor[] = [
  "alphabetical", "recent", "playtime", "release_date", "size_on_disk",
  "metacritic", "review_score", "added", "random", "manual",
].map<ExternalSortOptionDescriptor>((id) => ({
  id,
  displayName: id,
  sort: (appIds) => appIds.slice(),
}));

export function installInternalRegistry(): () => void {
  const unsubs: Array<() => void> = [];
  for (const d of INTERNAL_SMART_DESCRIPTORS) unsubs.push(registerInternalSmartShelfSource(d));
  for (const d of INTERNAL_FILTER_TYPES) unsubs.push(registerInternalFilterType(d));
  for (const d of INTERNAL_SORT_OPTIONS) unsubs.push(registerInternalSortOption(d));
  // Plugin API track — register the built-in Quick Search via
  // the same surface external plugins use. SearchOverlay simply iterates
  // `getExternalSearchProviders()` and gets the built-in first thanks
  // to its priority of 100.
  unsubs.push(registerInternalSearchProvider(BUILT_IN_SHELF_SEARCH));
  // register every first-party Filter v3, Sort
  // v3, and Shelf Source v3 entry through the same surface external
  // plugins use. Resolver / evaluator wiring lives in `steam/index.ts`
  // + `steam/v3Extensions.ts`; the registry entries here surface them
  // in the Integrations card + downstream dropdowns.
  for (const d of V3_FILTER_DESCRIPTORS) {
    const desc: ExternalFilterTypeDescriptor = {
      id: d.id,
      displayName: d.displayName,
      evaluate: () => false,
    };
    unsubs.push(registerInternalFilterType(desc));
  }
  for (const d of V3_SORT_DESCRIPTORS) {
    const desc: ExternalSortOptionDescriptor = {
      id: d.id,
      displayName: d.displayName,
      sort: (appIds) => appIds.slice(),
    };
    unsubs.push(registerInternalSortOption(desc));
  }
  for (const d of V3_SOURCE_DESCRIPTORS) {
    const desc: ExternalShelfSourceDescriptor = {
      id: d.id,
      displayName: d.displayName,
      resolve: () => Promise.resolve([]),
    };
    unsubs.push(registerInternalShelfSource(desc));
  }
  return () => { for (const u of unsubs) { try { u(); } catch {} } };
}

// Wire the bootstrap slot in `pluginApi.ts` at module-load time so
// `installPluginApi` can call us without forming an import cycle.
setInternalBootstrap(installInternalRegistry);
