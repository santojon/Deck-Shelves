/**
 * Public Plugin API — v3. Exposed at `window.deckShelves` (with `.api`,
 * `.register`, `.debug`). External consumers should use the
 * `@deck-shelves/api` package's `register()` helper — it handles the
 * pending-queue timing so the integration works regardless of load order.
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

// saved smart shelf template, readable through the public
// API so external plugins can clone / list / build on top of them.
export interface PublicSavedSmartFilter {
  readonly id: string;
  readonly name: string;
  readonly mode: string;
  readonly smartParams?: Readonly<Record<string, number>>;
  readonly filterGroup?: PublicFilterGroup;
  readonly sort?: string | ReadonlyArray<string>;
  readonly sortReverse?: boolean | ReadonlyArray<boolean>;
  readonly limit?: number;
  readonly visibleHours?: ReadonlyArray<number>;
  readonly visibleDaysOfWeek?: ReadonlyArray<number>;
}

// ---- 1g. Context Search provider (v4, opt-in feature) --------------------

/**
 * Search provider — surfaces results when the user types in the
 * context-search overlay (dpad-up + keyboard). The DS overlay collects
 * the query, debounces it, and asks every registered provider for hits.
 *
 * Phase 1: providers return appid-shaped hits and the overlay renders
 * them as small cards. Phase 2 will allow arbitrary `renderHit` for
 * non-game targets (settings entries, store pages, etc.).
 */
export interface SearchProviderDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  /** Provider priority — higher numbers list first. Built-in providers
   *  use 100 (shelf-content) / 50 (library). Defaults to 0. */
  priority?: number;
  /** Resolve hits for the current query. `limit` is a hint, not a hard
   *  cap. Return `[]` on miss; throw to be silently treated as `[]`. */
  search: (query: string, limit: number) => Promise<SearchHit[]>;
}

export interface SearchHit {
  /** Stable id within the provider — used for dedup + key. */
  id: string;
  /** When set, the overlay renders a GameCard for this appid. */
  appid?: number;
  /** Display text; falls back to the app name when `appid` resolves. */
  title?: string;
  /** Optional subtitle (e.g. "in shelf: Action games"). */
  subtitle?: string;
  /** Higher score = more relevant. Provider-local; the overlay
   *  interleaves providers by `priority` first, then by score. */
  score?: number;
  /** Optional click handler. When omitted and `appid` is set, the
   *  overlay routes to the app's library page. */
  onActivate?: () => void;
}

// ---- 1h. Side-menu provider (v4, opt-in feature) -------------------------

/**
 * Side-menu provider — contributes entries to the side menu that opens
 * when the user presses dpad-left on the first card of a shelf. Each
 * provider can return any number of entries; the DS menu groups them
 * by `category` if present.
 */
export interface SideMenuProviderDescriptor {
  id: string;
  displayName: string;
  /** Optional descriptor schema version (default `1`). */
  version?: number;
  /** Returns the entries to render for the given context. `context.shelfId`
   *  is null when the menu was opened from a non-shelf surface (future). */
  resolve: (context: SideMenuContext) => Promise<SideMenuEntry[]> | SideMenuEntry[];
}

export interface SideMenuContext {
  /** The shelf the user opened the menu from. */
  shelfId: string | null;
  /** The appid of the currently focused card, when known. */
  focusedAppid: number | null;
}

export interface SideMenuEntry {
  /** Stable per-provider id. */
  id: string;
  label: string;
  /** Optional grouping key (e.g. "actions", "shortcuts"). */
  category?: string;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Disabled entries are visible but not actionable. */
  disabled?: boolean;
  /** Activation handler; runs on click / OK button. */
  onActivate: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// 2. API SURFACE — what `window.deckShelves.api` exposes
// ---------------------------------------------------------------------------

/** Focused-card snapshot — see `subscribeFocusedCard`. */
export interface FocusedCardInfo {
  appid: number;
  shelfId: string | null;
}

/** Asset types supported by `getAssetUrls`. */
export type AssetType = "hero" | "heroBlur" | "portrait" | "landscape" | "logo" | "icon" | "storeBackground";

/** Integration record passed to `window.deckShelves.register`. */
export interface DeckShelvesIntegration {
  name: string;
  version?: string;
  onMount(api: DeckShelvesPublicAPI): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
}

export interface DeckShelvesPublicAPI {
  /** API surface version. v3 added register + focus + assets. v4 adds
   *  `registerSearchProvider` + `registerSideMenuProvider` (additive). */
  readonly version: 4;

  // --- Registries --------------------------------------------------------
  registerShelfSource(d: ExternalShelfSourceDescriptor): Unsubscribe;
  registerSmartShelfSource(d: SmartShelfSourceDescriptor): Unsubscribe;
  registerFilterType(d: ExternalFilterTypeDescriptor): Unsubscribe;
  registerSortOption(d: ExternalSortOptionDescriptor): Unsubscribe;
  registerImportType(d: ExternalImportTypeDescriptor): Unsubscribe;
  registerSavedFilter(d: ExternalSavedFilterDescriptor): Unsubscribe;

  getRegisteredSources(): ReadonlyArray<ExternalShelfSourceDescriptor>;
  getRegisteredSmartSources(): ReadonlyArray<SmartShelfSourceDescriptor>;
  getRegisteredFilterTypes(): ReadonlyArray<ExternalFilterTypeDescriptor>;
  getRegisteredSortOptions(): ReadonlyArray<ExternalSortOptionDescriptor>;
  getRegisteredImportTypes(): ReadonlyArray<ExternalImportTypeDescriptor>;
  /** Returns import types whose `target` matches (default `"shelves"`).
   *  The QAM uses this to populate per-section import menus. */
  getRegisteredImportTypesForTarget(target: ImportTarget): ReadonlyArray<ExternalImportTypeDescriptor>;

  // --- Snapshots + subscriptions -----------------------------------------
  getShelves(): ReadonlyArray<PublicShelf>;
  getSmartShelves(): ReadonlyArray<PublicSmartShelf>;
  getSavedFilters(): ReadonlyArray<PublicSavedFilter>;
  getSavedSmartFilters(): ReadonlyArray<PublicSavedSmartFilter>;
  subscribeShelves(cb: (shelves: ReadonlyArray<PublicShelf>) => void): Unsubscribe;
  subscribeSmartShelves(cb: (shelves: ReadonlyArray<PublicSmartShelf>) => void): Unsubscribe;
  subscribeSavedFilters(cb: (filters: ReadonlyArray<PublicSavedFilter>) => void): Unsubscribe;

  // --- Focus tracking (v3) ----------------------------------------------
  /** Returns the currently focused card or null when focus is elsewhere. */
  getFocusedCard(): FocusedCardInfo | null;
  /** Fires whenever the focused card changes (also fires with null when
   *  focus leaves all DS shelves). Immediate-fire on subscribe. */
  subscribeFocusedCard(cb: (info: FocusedCardInfo | null) => void): Unsubscribe;

  // --- Asset URLs (v3) ---------------------------------------------------
  /** Returns the prioritized URL list for the given asset type and appid.
   *  Loopback (local Steam cache) first, then customimages, then CDN. */
  getAssetUrls(appid: number, type: AssetType): string[];

  // --- Environment probes ------------------------------------------------
  hasTabMaster(): boolean;

  // --- Search + side-menu providers (v4 surfaces, additive) --------------
  registerSearchProvider(d: SearchProviderDescriptor): Unsubscribe;
  getRegisteredSearchProviders(): ReadonlyArray<SearchProviderDescriptor>;
  registerSideMenuProvider(d: SideMenuProviderDescriptor): Unsubscribe;
  getRegisteredSideMenuProviders(): ReadonlyArray<SideMenuProviderDescriptor>;
}

// ---------------------------------------------------------------------------
// 3. IN-MEMORY REGISTRIES — lookup is O(1), iteration is insertion-order
// ---------------------------------------------------------------------------

const shelfSources = new Map<string, ExternalShelfSourceDescriptor>();
const smartSources = new Map<string, SmartShelfSourceDescriptor>();
const filterTypes = new Map<string, ExternalFilterTypeDescriptor>();
const sortOptions = new Map<string, ExternalSortOptionDescriptor>();
const importTypes = new Map<string, ExternalImportTypeDescriptor>();
const searchProviders = new Map<string, SearchProviderDescriptor>();
const sideMenuProviders = new Map<string, SideMenuProviderDescriptor>();

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

export function getExternalSmartSources(): SmartShelfSourceDescriptor[] {
  return Array.from(smartSources.values());
}

export function getExternalFilterTypes(): ExternalFilterTypeDescriptor[] {
  return Array.from(filterTypes.values());
}

export function getExternalSortOptions(): ExternalSortOptionDescriptor[] {
  return Array.from(sortOptions.values());
}

export function getExternalSearchProviders(): SearchProviderDescriptor[] {
  // Sorted by `priority` desc so the overlay can iterate in the order
  // hits should appear when scores are tied.
  return Array.from(searchProviders.values()).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
}

export function getExternalSideMenuProviders(): SideMenuProviderDescriptor[] {
  return Array.from(sideMenuProviders.values());
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
 * to calling `window.deckShelves.api.registerImportType(d)` but without
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
    else if (src?.type === "filter") pub = { type: "filter", filter: { sort: Array.isArray(src.filter?.sort) ? src.filter?.sort[0] : src.filter?.sort, group: src.filter?.group as any } };
    else if (src?.type === "external") pub = { type: "external", sourceId: String(src.sourceId ?? "") };
    else if (src?.type === "smart") pub = { type: "smart", mode: String(src.mode ?? "") };
    if (!pub) continue;
    out.push({
      id: sh.id,
      title: sh.title,
      enabled: sh.enabled !== false,
      hidden: !!sh.hidden,
      limit: sh.limit ?? 20,
      // Public API surface stays single-key: external consumers see only
      // the primary sort even when the underlying shelf uses multi-key.
      // A future Plugin API v3 bump could expose the full array.
      sort: Array.isArray(sh.sort) ? sh.sort[0] : sh.sort,
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

function projectSavedSmartFilters(s: Settings | null): ReadonlyArray<PublicSavedSmartFilter> {
  if (!s) return [];
  const list = ((s as any).savedSmartFilters ?? []) as any[];
  return list.map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    mode: String(f.mode ?? ""),
    smartParams: f.smartParams && typeof f.smartParams === "object" ? f.smartParams : undefined,
    filterGroup: f.filterGroup as PublicFilterGroup | undefined,
    sort: f.sort,
    sortReverse: f.sortReverse,
    limit: typeof f.limit === "number" ? f.limit : undefined,
    visibleHours: Array.isArray(f.visibleHours) ? f.visibleHours : undefined,
    visibleDaysOfWeek: Array.isArray(f.visibleDaysOfWeek) ? f.visibleDaysOfWeek : undefined,
  }));
}

// ---------------------------------------------------------------------------
// 7. API CONSTRUCTOR
// ---------------------------------------------------------------------------

function makeApi(): DeckShelvesPublicAPI {
  return {
    version: 4,

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

    // Search providers
    registerSearchProvider(d) {
      searchProviders.set(d.id, d);
      return () => { searchProviders.delete(d.id); };
    },
    getRegisteredSearchProviders() { return getExternalSearchProviders(); },

    // Side-menu providers
    registerSideMenuProvider(d) {
      sideMenuProviders.set(d.id, d);
      return () => { sideMenuProviders.delete(d.id); };
    },
    getRegisteredSideMenuProviders() { return getExternalSideMenuProviders(); },

    // ---- Consumer contracts ------------------------------------------------
    // Reads project from the live settings snapshot in `settingsStore`.
    // Subscriptions are diff-gated by JSON identity so callers only fire on
    // real change (the store itself already de-dupes via `isSameSettings`,
    // but a downstream consumer that only watches shelves should not wake on
    // unrelated settings flips).
    getShelves() { return projectShelves(getCurrentSettings()); },
    getSmartShelves() { return projectSmartShelves(getCurrentSettings()); },
    getSavedFilters() { return projectSavedFilters(getCurrentSettings()); },
    getSavedSmartFilters() { return projectSavedSmartFilters(getCurrentSettings()); },
    subscribeShelves(cb) {
      let last = JSON.stringify(projectShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeSmartShelves(cb) {
      let last = JSON.stringify(projectSmartShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSmartShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeSavedFilters(cb) {
      let last = JSON.stringify(projectSavedFilters(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSavedFilters(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },

    // --- v3 -------------------------------------------------------------
    getFocusedCard() {
      const { getFocusedCard } = requireFocusTracker();
      return getFocusedCard();
    },
    subscribeFocusedCard(cb) {
      const { subscribeFocusedCard } = requireFocusTracker();
      return subscribeFocusedCard(cb);
    },
    getAssetUrls(appid, type) {
      const a = requireAssets();
      switch (type) {
        case "hero": return a.getHeroUrls(appid);
        case "heroBlur": return a.getHeroBlurUrls(appid);
        case "portrait": return a.getPortraitUrls(appid);
        case "landscape": return a.getLandscapeUrls(appid);
        case "logo": return a.getLogoUrls(appid);
        case "icon": return a.getIconUrls(appid);
        case "storeBackground": return a.getStorePageBackgroundUrls(appid);
        default: return [];
      }
    },
  };
}

// Direct re-imports — these are leaf modules with no top-level
// side-effects, so eager binding is fine and keeps the API constructor
// dependency-free of runtime require()s.
import * as focusTracker from "./focusedCardTracker";
import * as assets from "./steamAssets";
function requireFocusTracker(): typeof focusTracker { return focusTracker; }
function requireAssets(): typeof assets { return assets; }

// ---------------------------------------------------------------------------
// 7. INSTALL / UNINSTALL
// ---------------------------------------------------------------------------

/**
 * Event dispatched on `window` immediately after the API surface is installed.
 * No detail payload — consumers go through `window.deckShelves.api` or use
 * `register()` from `@deck-shelves/api` which queues until ready.
 */
export const READY_EVENT = "deck-shelves:ready";

/**
 * Event dispatched on `window` immediately before the API is torn down
 * (Deck Shelves unloading). Registered integrations get their `onUnmount`
 * fired first; this event is a final signal for non-SDK consumers that
 * cached the API directly.
 */
export const TEARDOWN_EVENT = "deck-shelves:teardown";

/** Pending integrations queued by the SDK before the plugin loaded. The
 *  SDK pushes here via `globalThis[Symbol.for('deck-shelves/pending')]`;
 *  install drains the queue at the same time as it installs the global. */
const PENDING_KEY = Symbol.for("deck-shelves/pending");
type PendingEntry = {
  integration: DeckShelvesIntegration;
  unsub?: Unsubscribe;
  cancelled?: boolean;
};

function drainPendingIntegrations(api: DeckShelvesPublicAPI, register: (i: DeckShelvesIntegration) => Unsubscribe): Unsubscribe[] {
  const queue = (globalThis as unknown as Record<symbol, unknown>)[PENDING_KEY];
  const offs: Unsubscribe[] = [];
  if (!Array.isArray(queue)) return offs;
  while (queue.length) {
    const entry = queue.shift() as PendingEntry;
    if (entry.cancelled) continue;
    try { entry.unsub = register(entry.integration); offs.push(entry.unsub); } catch {}
  }
  void api;
  return offs;
}

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
  // Register every first-party id BEFORE exposing the global so plugins
  // that listen for `deck-shelves:ready` see the full built-in surface.
  const uninstallInternals = internalBootstrap ? internalBootstrap() : () => {};

  const integrationUnsubs: Unsubscribe[] = [];
  const teardownFns: Array<() => void | Promise<void>> = [];

  const register = (integration: DeckShelvesIntegration): Unsubscribe => {
    let unmountFired = false;
    void Promise.resolve()
      .then(() => integration.onMount(api))
      .catch(() => {});
    if (integration.onUnmount) teardownFns.push(integration.onUnmount);
    return () => {
      if (unmountFired) return;
      unmountFired = true;
      try { integration.onUnmount?.(); } catch {}
    };
  };

  // The single public global. No underscores, no surface beyond what the
  // contract exposes. Power users that need a direct API handle use
  // `window.deckShelves.api`; everyone else should `register()`.
  const deckShelves = {
    version: api.version,
    api,
    register,
  };
  try { (window as unknown as { deckShelves: typeof deckShelves }).deckShelves = deckShelves; } catch {}

  // Drain SDK-queued integrations.
  for (const u of drainPendingIntegrations(api, register)) integrationUnsubs.push(u);

  try { window.dispatchEvent(new CustomEvent(READY_EVENT)); } catch {}

  return () => {
    try { window.dispatchEvent(new CustomEvent(TEARDOWN_EVENT)); } catch {}
    for (const fn of teardownFns) { try { void fn(); } catch {} }
    for (const u of integrationUnsubs) { try { u(); } catch {} }
    try { delete (window as unknown as Record<string, unknown>).deckShelves; } catch {}
    try { uninstallInternals(); } catch {}
    shelfSources.clear();
    smartSources.clear();
    filterTypes.clear();
    sortOptions.clear();
    importTypes.clear();
  };
}
