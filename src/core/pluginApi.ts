/**
 * Public Plugin API — v2. Exposed at `window.__DECK_SHELVES_API__`.
 * Every shape here is part of the ABI: additive changes are safe,
 * renames/removals bump `version`. Usage in `docs/plugin-api.md`.
 */

import type { ReactNode } from "react";
import type { Settings } from "../types";
import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { isTabMasterInstalled } from "../integrations/registry";

// ---------------------------------------------------------------------------
// 1. PUBLIC TYPES — frozen shape exposed to external plugins
// ---------------------------------------------------------------------------

/** Cleanup callback returned by every `register*` method. Calling it
 *  removes the registered entry; safe to call more than once. */
export type Unsubscribe = () => void;

/**
 * Read-only subset of Steam's `AppOverview`. External resolvers and filter
 * evaluators receive this shape — never mutate it. The set of fields is
 * intentionally narrow; request additional fields via plugin API issues
 * rather than reaching into the underlying object.
 */
export interface PublicAppMeta {
  readonly appid: number;
  readonly name: string;
  readonly installed: boolean;
  readonly is_non_steam: boolean;
  readonly playtime_forever?: number;
  readonly last_played?: number;
  readonly deck_compatibility_category?: number;
  readonly bCloudAvailable?: boolean;
  readonly nControllerSupport?: number;
}

// ---- 1a. Shelf-source registries (regular + smart) -------------------------

/**
 * Regular shelf source — a plugin-supplied list of appids that becomes a
 * shelf the user can pick from the Source dropdown in the shelf editor.
 * Persisted as `{ type: "external", sourceId }`.
 */
export interface ExternalShelfSourceDescriptor {
  /** Stable id (recommended: `pluginName.entryName`). Survives reloads. */
  id: string;
  /** Label shown in the Source dropdown. */
  displayName: string;
  /** Resolves the current appid list. Called whenever Deck Shelves needs to
   *  refresh. Returning fewer than `limit` ids is fine; returning duplicates
   *  is silently de-duplicated. Errors are caught — return `[]` on failure. */
  resolve: (limit: number) => Promise<number[]>;
  /** Optional descriptor schema version. Plugins may bump this when they
   *  introduce new optional fields specific to their descriptor type so that
   *  internal handlers can branch (`if ((d.version ?? 1) >= 2) ...`).
   *  Defaults to `1` when omitted. */
  version?: number;
}

/**
 * Smart shelf source — like a regular source but exposes optional per-shelf
 * tuning parameters that the user can adjust in the smart-shelf editor.
 * Persisted as `{ type: "smart", mode: <id> }`; the `mode` string matches
 * `id` here when registered externally (internal modes use enum values).
 */
export interface SmartShelfSourceDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). See
   *  `ExternalShelfSourceDescriptor.version`. */
  version?: number;
  /** Optional category key for picker grouping (e.g. "status", "time"). */
  category?: string;
  /** Default values for every key in `paramMeta`. Required when `paramMeta`
   *  is defined; ignored otherwise. */
  defaultParams?: Readonly<Record<string, number>>;
  /** Slider metadata for the smart-shelf edit modal. Each key becomes a
   *  numeric slider; units are display-only. */
  paramMeta?: Readonly<Record<string, {
    label: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
  }>>;
  /** Returns the current appid list. `params` carries the user's overrides
   *  merged on top of `defaultParams`. */
  resolve: (limit: number, params: Readonly<Record<string, number>>) => Promise<number[]>;
}

// ---- 1b. Filter type registry ---------------------------------------------

/**
 * Filter type — pure predicate evaluated per-game by the FilterPanel
 * resolver. Persisted as a `FilterItem` with `type === <id>` and
 * `params === <plugin-defined object>`.
 *
 * Phase 1 limitation: the FilterPanel UI does not yet render external
 * editors — users construct external filter items via JSON or other
 * plugins. The runtime evaluation works as soon as the type is registered.
 */
export interface ExternalFilterTypeDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  /** Default `params` shape. Used when a shelf is constructed from a
   *  template that references the filter type without explicit params. */
  defaultParams?: Readonly<Record<string, unknown>>;
  /** Whether the filter supports the `inverted` flag. Defaults to `true`. */
  invertible?: boolean;
  /** Pure predicate. Must not mutate `app` or `params`. Throwing is
   *  treated as a `false` result. */
  evaluate: (app: PublicAppMeta, params: Readonly<Record<string, unknown>>) => boolean;
  /** Optional editor (Phase 2 wire-up). Stored for future use; not yet
   *  rendered by the FilterPanel. */
  renderEditor?: (props: {
    params: Readonly<Record<string, unknown>>;
    onChange: (next: Record<string, unknown>) => void;
  }) => ReactNode;
}

// ---- 1c. Sort option registry ---------------------------------------------

/**
 * Sort option — pure ordering function. Persisted as the shelf's `sort`
 * field (any string; internal sorts use specific enum values, external
 * sorts use whatever id was registered).
 */
export interface ExternalSortOptionDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  /** Returns a NEW array (do not mutate input) of appids in the desired
   *  order. Apps not present in the input are dropped silently. */
  sort: (appIds: ReadonlyArray<number>, apps: ReadonlyArray<PublicAppMeta>) => number[];
}

// ---- 1d. Import type registry ---------------------------------------------

/**
 * Import target: which shelf bucket a registered import populates.
 *   - "shelves"        → regular shelves section in the QAM
 *   - "smart_shelves"  → smart shelves section in the QAM
 *
 * Defaults to "shelves" when omitted on a descriptor (back-compat with the
 * v2 initial release).
 */
export type ImportTarget = "shelves" | "smart_shelves";

/**
 * Import type — parses a payload into shelves Deck Shelves can save.
 * Each registered descriptor adds one button to the QAM action row;
 * 2+ descriptors with the same `target` collapse into a `…` overflow.
 * Provide `runImport` for custom UX (modal/picker), or `parse` to feed
 * the default file-picker flow.
 */
export interface ExternalImportTypeDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  /** Optional file-extension hint (e.g. ".json", ".csv"). UI-only. */
  fileExtension?: string;
  /** Default `"shelves"`. Pick `"smart_shelves"` to populate the smart
   *  shelves bucket instead. A single descriptor targets one bucket;
   *  register two descriptors with different targets if the source
   *  contains both. */
  target?: ImportTarget;
  /** Optional icon shown next to the entry in the QAM action row / menu.
   *  Mirrors the local `icons` shape used by built-in actions. */
  icon?: ReactNode;
  /** Parse a raw payload into structured shelves. Optional when
   *  `runImport` is provided (custom flows skip the parse step). */
  parse?: (raw: string) => Promise<ParsedImport>;
  /** Optional custom action handler. When set, the QAM invokes this
   *  instead of the default file-picker flow when the user activates
   *  the entry. The handler is responsible for reading the source data
   *  and calling the appropriate persistence action via the controller
   *  it captured at registration time. */
  runImport?: () => void | Promise<void>;
}

export interface ParsedImport {
  shelves?: Array<{
    title: string;
    /** Either an existing `ExternalShelfSourceDescriptor.id` (the source
     *  must be registered separately) or a built-in source descriptor in
     *  the same shape Deck Shelves uses internally. */
    source: { type: "external"; sourceId: string };
    limit?: number;
  }>;
  /** Smart shelves to insert. The `mode` matches `SmartShelfMode` (built-in
   *  or registered via `registerSmartShelfSource`). */
  smartShelves?: Array<{
    title: string;
    mode: string;
    limit?: number;
  }>;
}

// ---- 1e. Saved filter registration ----------------------------------------

/**
 * Pre-baked named `FilterGroup` plugins can seed into the QAM Saved
 * Filters section. Idempotent: same id replaces the previous entry.
 * `group.items[].type` must reference an id that exists (built-in
 * or another plugin's `registerFilterType`).
 */
export interface ExternalSavedFilterDescriptor {
  id: string;
  name: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  group: PublicFilterGroup;
}

export interface PublicFilterGroup {
  mode: "and" | "or";
  items: ReadonlyArray<PublicFilterItem>;
}

export interface PublicFilterItem {
  type: string;
  inverted?: boolean;
  params?: Readonly<Record<string, unknown>>;
}

// ---- 1f. Consumer contracts ------------------------------------------------

/** Read-only projection of a shelf, exposed to consumer plugins. */
export interface PublicShelf {
  readonly id: string;
  readonly title: string;
  readonly enabled: boolean;
  readonly hidden: boolean;
  readonly limit: number;
  readonly sort?: string;
  readonly source: PublicShelfSource;
}

export type PublicShelfSource =
  | { type: "collection"; collectionId: string }
  | { type: "tab"; tab: string }
  | { type: "filter"; filter: { sort?: string; group?: PublicFilterGroup } }
  | { type: "external"; sourceId: string }
  | { type: "smart"; mode: string };

export interface PublicSmartShelf {
  readonly id: string;
  readonly title: string;
  readonly mode: string;
  readonly enabled: boolean;
  readonly hidden: boolean;
  readonly limit?: number;
  readonly sort?: string;
}

export interface PublicSavedFilter {
  readonly id: string;
  readonly name: string;
  readonly group: PublicFilterGroup;
}

// ---------------------------------------------------------------------------
// 2. API SURFACE — what `window.__DECK_SHELVES_API__` exposes
// ---------------------------------------------------------------------------

export interface DeckShelvesPublicAPI {
  /** API surface version. v1 plugins should check `version >= 1` to detect
   *  v2 method availability before calling new methods. */
  readonly version: 2;

  // --- v1 (unchanged) -----------------------------------------------------
  registerShelfSource(d: ExternalShelfSourceDescriptor): Unsubscribe;
  getRegisteredSources(): ReadonlyArray<ExternalShelfSourceDescriptor>;

  // --- v2 registries ------------------------------------------------------
  registerSmartShelfSource(d: SmartShelfSourceDescriptor): Unsubscribe;
  getRegisteredSmartSources(): ReadonlyArray<SmartShelfSourceDescriptor>;

  registerFilterType(d: ExternalFilterTypeDescriptor): Unsubscribe;
  getRegisteredFilterTypes(): ReadonlyArray<ExternalFilterTypeDescriptor>;

  registerSortOption(d: ExternalSortOptionDescriptor): Unsubscribe;
  getRegisteredSortOptions(): ReadonlyArray<ExternalSortOptionDescriptor>;

  registerImportType(d: ExternalImportTypeDescriptor): Unsubscribe;
  getRegisteredImportTypes(): ReadonlyArray<ExternalImportTypeDescriptor>;
  /** Returns import types whose `target` matches (default `"shelves"`).
   *  The QAM uses this to populate per-section import menus. */
  getRegisteredImportTypesForTarget(target: ImportTarget): ReadonlyArray<ExternalImportTypeDescriptor>;

  registerSavedFilter(d: ExternalSavedFilterDescriptor): Unsubscribe;

  // --- v2 environment probes ---------------------------------------------
  /** True iff TabMaster is installed and active. Plugins that mirror tab
   *  data should skip their own injection when this returns `true` to avoid
   *  duplicate sources in the picker. */
  hasTabMaster(): boolean;

  // --- v2 consumer contracts ---------------------------------------------
  getShelves(): ReadonlyArray<PublicShelf>;
  getSmartShelves(): ReadonlyArray<PublicSmartShelf>;
  getSavedFilters(): ReadonlyArray<PublicSavedFilter>;
  subscribeToShelves(cb: (shelves: ReadonlyArray<PublicShelf>) => void): Unsubscribe;
  subscribeToSmartShelves(cb: (shelves: ReadonlyArray<PublicSmartShelf>) => void): Unsubscribe;
  subscribeToSavedFilters(cb: (filters: ReadonlyArray<PublicSavedFilter>) => void): Unsubscribe;
}

// ---------------------------------------------------------------------------
// 3. IN-MEMORY REGISTRIES — lookup is O(1), iteration is insertion-order
// ---------------------------------------------------------------------------

const shelfSources = new Map<string, ExternalShelfSourceDescriptor>();
const smartSources = new Map<string, SmartShelfSourceDescriptor>();
const filterTypes = new Map<string, ExternalFilterTypeDescriptor>();
const sortOptions = new Map<string, ExternalSortOptionDescriptor>();
const importTypes = new Map<string, ExternalImportTypeDescriptor>();

// ---------------------------------------------------------------------------
// 4. INTERNAL ACCESSORS — used by `src/steam/index.ts` resolver paths to
// delegate to external entries when an unknown id is encountered. Kept
// out of the public API so plugins can't bypass guards.
// ---------------------------------------------------------------------------

export function resolveExternalSource(sourceId: string, limit: number): Promise<number[]> {
  const src = shelfSources.get(sourceId);
  if (!src) return Promise.resolve([]);
  return src.resolve(limit).catch(() => []);
}

export function getExternalSources(): ExternalShelfSourceDescriptor[] {
  return Array.from(shelfSources.values());
}

export function hasExternalSmartSource(id: string): boolean {
  return smartSources.has(id);
}

export function resolveExternalSmartSource(
  id: string,
  limit: number,
  params: Record<string, number>,
): Promise<number[]> {
  const src = smartSources.get(id);
  if (!src) return Promise.resolve([]);
  const merged = { ...(src.defaultParams ?? {}), ...params };
  return src.resolve(limit, merged).catch(() => []);
}

export function getExternalSmartSourceMeta(id: string): SmartShelfSourceDescriptor | undefined {
  return smartSources.get(id);
}

export function hasExternalFilterType(id: string): boolean {
  return filterTypes.has(id);
}

export function evaluateExternalFilter(
  id: string,
  app: PublicAppMeta,
  params: Record<string, unknown>,
): boolean {
  const ft = filterTypes.get(id);
  if (!ft) return false;
  try { return ft.evaluate(app, params); } catch { return false; }
}

export function hasExternalSortOption(id: string): boolean {
  return sortOptions.has(id);
}

export function applyExternalSort(
  id: string,
  appIds: number[],
  apps: ReadonlyArray<PublicAppMeta>,
): number[] | null {
  const so = sortOptions.get(id);
  if (!so) return null;
  try {
    const out = so.sort(appIds, apps);
    return Array.isArray(out) ? out.filter((n) => Number.isFinite(n)) : null;
  } catch { return null; }
}

export function getExternalImportTypes(): ExternalImportTypeDescriptor[] {
  return Array.from(importTypes.values());
}

export function getExternalImportTypesForTarget(target: ImportTarget): ExternalImportTypeDescriptor[] {
  return Array.from(importTypes.values()).filter((d) => (d.target ?? "shelves") === target);
}

/**
 * Internal helper for registering import types from inside the plugin
 * (e.g. the QAM registers TabMaster's custom flow at mount time). Equivalent
 * to calling `__DECK_SHELVES_API__.registerImportType(d)` but without
 * crossing the global window boundary — the unsubscribe is symmetric.
 */
export function registerInternalImportType(d: ExternalImportTypeDescriptor): () => void {
  importTypes.set(d.id, d);
  return () => { importTypes.delete(d.id); };
}

// First-party id tracking. Lets external code detect collisions with
// built-ins via `isInternalSmartSource` / `isInternalFilterType` /
// `isInternalSortOption`. Resolver precedence is enforced by the call
// sites — registering an internal id twice is harmless.

const internalSmartSourceIds = new Set<string>();
const internalFilterTypeIds = new Set<string>();
const internalSortOptionIds = new Set<string>();

export function registerInternalSmartShelfSource(d: SmartShelfSourceDescriptor): () => void {
  internalSmartSourceIds.add(d.id);
  smartSources.set(d.id, d);
  return () => { internalSmartSourceIds.delete(d.id); smartSources.delete(d.id); };
}

export function registerInternalFilterType(d: ExternalFilterTypeDescriptor): () => void {
  internalFilterTypeIds.add(d.id);
  filterTypes.set(d.id, d);
  return () => { internalFilterTypeIds.delete(d.id); filterTypes.delete(d.id); };
}

export function registerInternalSortOption(d: ExternalSortOptionDescriptor): () => void {
  internalSortOptionIds.add(d.id);
  sortOptions.set(d.id, d);
  return () => { internalSortOptionIds.delete(d.id); sortOptions.delete(d.id); };
}

/** Returns `true` when the id matches a built-in smart-shelf source. */
export function isInternalSmartSource(id: string): boolean {
  return internalSmartSourceIds.has(id);
}

/** Returns `true` when the id matches a built-in filter type. */
export function isInternalFilterType(id: string): boolean {
  return internalFilterTypeIds.has(id);
}

/** Returns `true` when the id matches a built-in sort option. */
export function isInternalSortOption(id: string): boolean {
  return internalSortOptionIds.has(id);
}

// ---------------------------------------------------------------------------
// 5. SAVED-FILTER REGISTRATION — wires into the user settings store. A
// plugin-registered saved filter is persisted with id prefix `ext:<id>` so
// it never collides with user-created entries; cleanup removes it.
// ---------------------------------------------------------------------------

const SAVED_FILTER_PREFIX = "ext:";

async function persistRegisteredSavedFilter(d: ExternalSavedFilterDescriptor): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${d.id}`;
  const existing = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  const next = [...existing, { id: fullId, name: d.name, group: { ...d.group } as any }];
  await saveSettings({ ...s, savedFilters: next as any });
}

async function removeRegisteredSavedFilter(id: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${id}`;
  const next = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  await saveSettings({ ...s, savedFilters: next as any });
}

// ---------------------------------------------------------------------------
// 6. CONSUMER PROJECTIONS — pure functions converting internal Settings to
// the frozen Public* shapes. Kept narrow so we never leak internal fields.
// ---------------------------------------------------------------------------

function projectShelves(s: Settings | null): ReadonlyArray<PublicShelf> {
  if (!s) return [];
  const out: PublicShelf[] = [];
  for (const sh of s.shelves) {
    const src: any = sh.source;
    let pub: PublicShelfSource | null = null;
    if (src?.type === "collection") pub = { type: "collection", collectionId: String(src.collectionId ?? "") };
    else if (src?.type === "tab") pub = { type: "tab", tab: String(src.tab ?? "") };
    else if (src?.type === "filter") pub = { type: "filter", filter: { sort: src.filter?.sort, group: src.filter?.group as any } };
    else if (src?.type === "external") pub = { type: "external", sourceId: String(src.sourceId ?? "") };
    else if (src?.type === "smart") pub = { type: "smart", mode: String(src.mode ?? "") };
    if (!pub) continue;
    out.push({
      id: sh.id,
      title: sh.title,
      enabled: sh.enabled !== false,
      hidden: !!sh.hidden,
      limit: sh.limit ?? 20,
      sort: sh.sort,
      source: pub,
    });
  }
  return out;
}

function projectSmartShelves(s: Settings | null): ReadonlyArray<PublicSmartShelf> {
  if (!s) return [];
  const list = (s.smartShelves ?? []) as any[];
  return list.map((sh: any) => ({
    id: String(sh.id),
    title: String(sh.title ?? ""),
    mode: String(sh.mode),
    enabled: sh.enabled !== false,
    hidden: !!sh.hidden,
    limit: typeof sh.limit === "number" ? sh.limit : undefined,
    sort: typeof sh.sort === "string" ? sh.sort : undefined,
  }));
}

function projectSavedFilters(s: Settings | null): ReadonlyArray<PublicSavedFilter> {
  if (!s) return [];
  const list = (s.savedFilters ?? []) as any[];
  return list.map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    group: f.group as PublicFilterGroup,
  }));
}

// ---------------------------------------------------------------------------
// 7. API CONSTRUCTOR
// ---------------------------------------------------------------------------

function makeApi(): DeckShelvesPublicAPI {
  return {
    version: 2,

    // v1
    registerShelfSource(d) {
      shelfSources.set(d.id, d);
      return () => { shelfSources.delete(d.id); };
    },
    getRegisteredSources() { return Array.from(shelfSources.values()); },

    // Smart sources
    registerSmartShelfSource(d) {
      smartSources.set(d.id, d);
      return () => { smartSources.delete(d.id); };
    },
    getRegisteredSmartSources() { return Array.from(smartSources.values()); },

    // Filter types
    registerFilterType(d) {
      filterTypes.set(d.id, d);
      return () => { filterTypes.delete(d.id); };
    },
    getRegisteredFilterTypes() { return Array.from(filterTypes.values()); },

    // Sort options
    registerSortOption(d) {
      sortOptions.set(d.id, d);
      return () => { sortOptions.delete(d.id); };
    },
    getRegisteredSortOptions() { return Array.from(sortOptions.values()); },

    // Import types
    registerImportType(d) {
      importTypes.set(d.id, d);
      return () => { importTypes.delete(d.id); };
    },
    getRegisteredImportTypes() { return Array.from(importTypes.values()); },
    getRegisteredImportTypesForTarget(target) {
      return Array.from(importTypes.values()).filter((d) => (d.target ?? "shelves") === target);
    },

    // Saved filters — persisted in user settings under prefixed id
    registerSavedFilter(d) {
      void persistRegisteredSavedFilter(d);
      return () => { void removeRegisteredSavedFilter(d.id); };
    },

    // Environment probe
    hasTabMaster() { return isTabMasterInstalled(); },

    // ---- Consumer contracts ------------------------------------------------
    // Reads project from the live settings snapshot in `settingsStore`.
    // Subscriptions are diff-gated by JSON identity so callers only fire on
    // real change (the store itself already de-dupes via `isSameSettings`,
    // but a downstream consumer that only watches shelves should not wake on
    // unrelated settings flips).
    getShelves() { return projectShelves(getCurrentSettings()); },
    getSmartShelves() { return projectSmartShelves(getCurrentSettings()); },
    getSavedFilters() { return projectSavedFilters(getCurrentSettings()); },
    subscribeToShelves(cb) {
      let last = JSON.stringify(projectShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeToSmartShelves(cb) {
      let last = JSON.stringify(projectSmartShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSmartShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeToSavedFilters(cb) {
      let last = JSON.stringify(projectSavedFilters(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSavedFilters(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 7. INSTALL / UNINSTALL
// ---------------------------------------------------------------------------

/**
 * Event dispatched on `window` immediately after the API surface is installed.
 * `event.detail` is the live `DeckShelvesPublicAPI` object — same reference
 * as `window.__DECK_SHELVES_API__`. Plugin authors can listen for this
 * instead of polling, and still fall back to the global for late-loaded
 * plugins (the global is set _before_ the event fires).
 */
export const READY_EVENT = "deck-shelves-ready";

/**
 * Event dispatched on `window` immediately before the API is torn down
 * (Deck Shelves unloading). External plugins should release any cached API
 * reference on this event to avoid using a stale object after teardown.
 */
export const TEARDOWN_EVENT = "deck-shelves-teardown";

/**
 * Hook for the internal-registry bootstrap. The actual implementation lives
 * in `core/internalRegistry.ts` (which imports the `register*` helpers from
 * here) and registers itself by setting this slot at module-load time.
 * Keeping the binding indirect avoids the import cycle that would result
 * from this module importing `internalRegistry.ts` directly.
 */
let internalBootstrap: (() => () => void) | null = null;
export function setInternalBootstrap(fn: () => () => void): void { internalBootstrap = fn; }

export function installPluginApi(): () => void {
  const api = makeApi();
  // Register every first-party id BEFORE dispatching ready so plugins
  // listening for `deck-shelves-ready` see the full built-in surface.
  const uninstallInternals = internalBootstrap ? internalBootstrap() : () => {};
  try { (window as any).__DECK_SHELVES_API__ = api; } catch {}
  try { window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: api })); } catch {}

  return () => {
    try { window.dispatchEvent(new CustomEvent(TEARDOWN_EVENT)); } catch {}
    try { delete (window as any).__DECK_SHELVES_API__; } catch {}
    try { uninstallInternals(); } catch {}
    shelfSources.clear();
    smartSources.clear();
    filterTypes.clear();
    sortOptions.clear();
    importTypes.clear();
  };
}
