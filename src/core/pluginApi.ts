/* Plugin API surface — see docs/plugin-api.md. Exposed at window.deckShelves.
   Canonical types live in api/src/types.ts (the @deck-shelves/api npm package);
   this file imports them via the `@deck-shelves/api` specifier (aliased to the
   api submodule source in vite + tsconfig `paths`) so a single shape governs
   both the runtime registry and the published consumer contract. */

import type { Settings } from "../types";
import { registerTranslations } from "../i18n";
import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import {
  isTabMasterInstalled,
  isNonSteamBadgesInstalled,
  isUnifiDeckInstalled,
} from "../integrations/registry";
import { TRIGGER_CATALOG } from "../domain/triggerCatalog";
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from "../domain/templates";
import { DEFAULT_BINDINGS } from "../runtime/buttonBindings";
import pkg from "../../package.json";
import type {
  Unsubscribe as ApiUnsubscribe,
  PublicAppMeta as ApiPublicAppMeta,
  ImportTarget as ApiImportTarget,
  PublicProfile as ApiPublicProfile,
  IntegrationInfo as ApiIntegrationInfo,
  PublicSettingsSnapshot as ApiPublicSettingsSnapshot,
  EnvironmentInfo as ApiEnvironmentInfo,
  // Provider/leaf descriptors whose shapes are identical in the public
  // contract — imported (so they stay in local scope for the API interface
  // below) and re-exported so `@deck-shelves/api` is their single source.
  SearchProviderDescriptor,
  SearchHit,
  SideMenuProviderDescriptor,
  SideMenuContext,
  SideMenuEntry,
  ContextProviderDescriptor,
  WidgetProviderDescriptor,
  ShelfRendererDescriptor,
  MetadataProviderDescriptor,
  StatisticsEntry,
  StatisticsProviderDescriptor,
  RecommendationEntry,
  RecommendationProviderDescriptor,
  FocusedCardInfo,
  AssetType,
  PublicTriggerKind,
  PublicShortcut,
  ParsedImport,
  PublicFilterGroup,
  PublicFilterItem,
  // Registry descriptors + public shelf/filter projections — the api is now
  // the canonical shape (a superset of what the runtime emits/consumes), so
  // there are no plugin-specific copies.
  ExternalShelfSourceDescriptor,
  SmartShelfSourceDescriptor,
  ExternalFilterTypeDescriptor,
  ExternalSortOptionDescriptor,
  ExternalImportTypeDescriptor,
  ExternalSavedFilterDescriptor,
  ExportHandlerDescriptor,
  ImportHandlerDescriptor,
  PublicShelf,
  PublicShelfSource,
  PublicShelfTemplate,
  PublicSmartShelf,
  PublicSavedFilter,
  PublicSavedSmartFilter,
  DeckShelvesIntegration,
  DeckShelvesPublicAPI,
} from "@deck-shelves/api";

export type Unsubscribe = ApiUnsubscribe;
export type PublicAppMeta = ApiPublicAppMeta;
export type ImportTarget = ApiImportTarget;
export type PublicProfile = ApiPublicProfile;
export type IntegrationInfo = ApiIntegrationInfo;
export type PublicSettingsSnapshot = ApiPublicSettingsSnapshot;
export type EnvironmentInfo = ApiEnvironmentInfo;

export type {
  SearchProviderDescriptor,
  SearchHit,
  SideMenuProviderDescriptor,
  SideMenuContext,
  SideMenuEntry,
  ContextProviderDescriptor,
  WidgetProviderDescriptor,
  ShelfRendererDescriptor,
  MetadataProviderDescriptor,
  StatisticsEntry,
  StatisticsProviderDescriptor,
  RecommendationEntry,
  RecommendationProviderDescriptor,
  FocusedCardInfo,
  AssetType,
  PublicTriggerKind,
  PublicShortcut,
  ParsedImport,
  PublicFilterGroup,
  PublicFilterItem,
  ExternalShelfSourceDescriptor,
  SmartShelfSourceDescriptor,
  ExternalFilterTypeDescriptor,
  ExternalSortOptionDescriptor,
  ExternalImportTypeDescriptor,
  ExternalSavedFilterDescriptor,
  ExportHandlerDescriptor,
  ImportHandlerDescriptor,
  PublicShelf,
  PublicShelfSource,
  PublicShelfTemplate,
  PublicSmartShelf,
  PublicSavedFilter,
  PublicSavedSmartFilter,
  DeckShelvesIntegration,
  DeckShelvesPublicAPI,
};

// Translates Steam's raw AppOverview into the canonical PublicAppMeta shape.
// External descriptors registered via @deck-shelves/api receive THIS — the
// runtime no longer hands them the raw AppOverview cast through `unknown`.
export function toPublicAppMeta(raw: any): PublicAppMeta {
  if (!raw || typeof raw !== "object") return { appid: 0, name: "" };
  const appid = Number(raw.appid ?? raw.m_unAppID ?? 0);
  const name = String(raw.display_name ?? raw.name ?? "");
  const isNonSteam = raw.app_type === 1073741824 || raw.is_non_steam === true;
  const playtime = typeof raw.playtime_forever === "number" ? raw.playtime_forever : undefined;
  const lastPlayed = typeof raw.last_played === "number" ? raw.last_played : undefined;
  const compat = typeof raw.deck_compatibility_category === "number" ? raw.deck_compatibility_category : undefined;
  const installed = raw.installed === true || raw.is_installed === true;
  return {
    appid,
    name,
    installed,
    isSteam: !isNonSteam,
    is_non_steam: isNonSteam,
    playtimeMinutes: playtime,
    playtime_forever: playtime,
    lastPlayedTimestamp: lastPlayed,
    last_played: lastPlayed,
    deckCompatCategory: compat,
    deck_compatibility_category: compat,
    supportsCloud: raw.bCloudAvailable === true,
    bCloudAvailable: raw.bCloudAvailable === true,
    controllerSupport: typeof raw.nControllerSupport === "number" ? raw.nControllerSupport : undefined,
    nControllerSupport: typeof raw.nControllerSupport === "number" ? raw.nControllerSupport : undefined,
    app_type: typeof raw.app_type === "number" ? raw.app_type : undefined,
    is_installed: installed,
    is_hidden: raw.is_hidden === true,
  };
}

/* Registry descriptors, shelf/filter projections and the built-in catalogue
   types (ExternalShelfSource/Sort/Filter/Import/SavedFilter descriptors,
   Export/Import handlers, PublicShelf/ShelfSource/SmartShelf/SavedFilter/
   SavedSmartFilter, PublicShelfTemplate) are re-exported from
   `@deck-shelves/api` near the top of this file — no plugin-local copies. */
/* DeckShelvesIntegration + DeckShelvesPublicAPI (the umbrella API surface)
   are re-exported from `@deck-shelves/api` at the top of this file. */

const shelfSources = new Map<string, ExternalShelfSourceDescriptor>();
const smartSources = new Map<string, SmartShelfSourceDescriptor>();
const filterTypes = new Map<string, ExternalFilterTypeDescriptor>();
const sortOptions = new Map<string, ExternalSortOptionDescriptor>();
const importTypes = new Map<string, ExternalImportTypeDescriptor>();
const searchProviders = new Map<string, SearchProviderDescriptor>();
const sideMenuProviders = new Map<string, SideMenuProviderDescriptor>();
const contextProviders = new Map<string, ContextProviderDescriptor>();
const widgetProviders = new Map<string, WidgetProviderDescriptor>();
const shelfRenderers = new Map<string, ShelfRendererDescriptor>();
const metadataProviders = new Map<string, MetadataProviderDescriptor>();
const statisticsProviders = new Map<string, StatisticsProviderDescriptor>();
const recommendationProviders = new Map<string, RecommendationProviderDescriptor>();
const exportHandlers = new Map<string, ExportHandlerDescriptor>();
const importHandlers = new Map<string, ImportHandlerDescriptor>();

export function resolveExternalSource(sourceId: string, limit: number): Promise<number[]> {
  const src = shelfSources.get(sourceId);
  if (!src) return Promise.resolve([]);
  // resolve() may be sync or async in the public contract — normalize.
  return Promise.resolve(src.resolve(limit)).catch(() => []);
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
  return Promise.resolve(src.resolve(limit, merged)).catch(() => []);
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
  return Array.from(searchProviders.values()).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
}

export function getExternalSideMenuProviders(): SideMenuProviderDescriptor[] {
  return Array.from(sideMenuProviders.values());
}

export function getExternalContextProviders(): ContextProviderDescriptor[] {
  return Array.from(contextProviders.values());
}

export function getExternalWidgetProviders(): WidgetProviderDescriptor[] {
  return Array.from(widgetProviders.values());
}

export function getExternalShelfRenderers(): ShelfRendererDescriptor[] {
  return Array.from(shelfRenderers.values());
}

export function getExternalMetadataProviders(): MetadataProviderDescriptor[] {
  return Array.from(metadataProviders.values());
}

export function getExternalStatisticsProviders(): StatisticsProviderDescriptor[] {
  return Array.from(statisticsProviders.values());
}

export function getExternalRecommendationProviders(): RecommendationProviderDescriptor[] {
  return Array.from(recommendationProviders.values());
}

export function getExternalExportHandlers(): ExportHandlerDescriptor[] {
  return Array.from(exportHandlers.values());
}

export function getExternalImportHandlers(): ImportHandlerDescriptor[] {
  return Array.from(importHandlers.values());
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

export function registerInternalImportType(d: ExternalImportTypeDescriptor): () => void {
  importTypes.set(d.id, d);
  return () => { importTypes.delete(d.id); };
}

const internalSmartSourceIds = new Set<string>();
const internalFilterTypeIds = new Set<string>();
const internalSortOptionIds = new Set<string>();

export function registerInternalSmartShelfSource(d: SmartShelfSourceDescriptor): () => void {
  internalSmartSourceIds.add(d.id);
  smartSources.set(d.id, d);
  return () => { internalSmartSourceIds.delete(d.id); smartSources.delete(d.id); };
}

const internalShelfSourceIds = new Set<string>();

export function registerInternalShelfSource(d: ExternalShelfSourceDescriptor): () => void {
  internalShelfSourceIds.add(d.id);
  shelfSources.set(d.id, d);
  return () => { internalShelfSourceIds.delete(d.id); shelfSources.delete(d.id); };
}

export function isInternalShelfSource(id: string): boolean {
  return internalShelfSourceIds.has(id);
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

const internalSearchProviderIds = new Set<string>();

export function registerInternalSearchProvider(d: SearchProviderDescriptor): () => void {
  internalSearchProviderIds.add(d.id);
  searchProviders.set(d.id, d);
  return () => { internalSearchProviderIds.delete(d.id); searchProviders.delete(d.id); };
}

export function isInternalSearchProvider(id: string): boolean {
  return internalSearchProviderIds.has(id);
}

const internalStatisticsProviderIds = new Set<string>();

export function registerInternalStatisticsProvider(d: StatisticsProviderDescriptor): () => void {
  internalStatisticsProviderIds.add(d.id);
  statisticsProviders.set(d.id, d);
  return () => { internalStatisticsProviderIds.delete(d.id); statisticsProviders.delete(d.id); };
}

export function isInternalStatisticsProvider(id: string): boolean {
  return internalStatisticsProviderIds.has(id);
}

function hasExternalOnlyEntries(): boolean {
  return !!(sideMenuProviders.size || contextProviders.size || widgetProviders.size
    || shelfRenderers.size || metadataProviders.size || recommendationProviders.size
    || importTypes.size);
}

// True when a third-party plugin has registered any provider. External-only
// registries count any entry; mixed registries count entries not flagged
// internal. Drives whether the Settings → Integrations tab appears.
export function hasExternalIntegrations(): boolean {
  if (hasExternalOnlyEntries()) return true;
  const mixed: Array<[Map<string, unknown>, Set<string>]> = [
    [shelfSources, internalShelfSourceIds],
    [smartSources, internalSmartSourceIds],
    [filterTypes, internalFilterTypeIds],
    [sortOptions, internalSortOptionIds],
    [searchProviders, internalSearchProviderIds],
    [statisticsProviders, internalStatisticsProviderIds],
  ];
  for (const [reg, internal] of mixed) {
    for (const id of reg.keys()) if (!internal.has(id)) return true;
  }
  return false;
}

export function isInternalSmartSource(id: string): boolean {
  return internalSmartSourceIds.has(id);
}

export function isInternalFilterType(id: string): boolean {
  return internalFilterTypeIds.has(id);
}

export function isInternalSortOption(id: string): boolean {
  return internalSortOptionIds.has(id);
}

const SAVED_FILTER_PREFIX = "ext:";

async function persistRegisteredSavedFilter(d: ExternalSavedFilterDescriptor): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${d.id}`;
  const existing = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  const next = [...existing, { id: fullId, name: d.name, group: { ...(d.group as object) } as any }];
  await saveSettings({ ...s, savedFilters: next as any });
}

async function removeRegisteredSavedFilter(id: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${id}`;
  const next = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  await saveSettings({ ...s, savedFilters: next as any });
}

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

const KNOWN_INTEGRATIONS: ReadonlyArray<{ id: string; displayName: string; detect: () => boolean }> = [
  { id: "tabmaster", displayName: "TabMaster", detect: isTabMasterInstalled },
  { id: "unifideck", displayName: "UnifiDeck", detect: isUnifiDeckInstalled },
  { id: "nonsteambadges", displayName: "Non-Steam Badges", detect: isNonSteamBadgesInstalled },
];

function projectProfiles(s: Settings | null): ReadonlyArray<PublicProfile> {
  if (!s) return [];
  const list = ((s as any).profiles ?? []) as Array<{ id: string; name: string; createdAt: string }>;
  const activeName = (s as any).activeProfileName;
  return list.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    createdAt: String(p.createdAt ?? ""),
    active: typeof activeName === "string" && activeName === p.name,
  }));
}

function projectSettingsSnapshot(s: Settings | null): PublicSettingsSnapshot {
  const x = (s ?? {}) as any;
  return {
    enabled: x.enabled === true,
    hideRecents: x.hideRecents === true,
    recentsReplaceSource: x.recentsReplaceSource === true,
    hideHomeTabs: x.hideHomeTabs === true,
    shelfHeroBackground: x.shelfHeroBackground === true,
    globalHeroEnabled: x.globalHeroEnabled === true,
    globalFullPageShelf: x.globalFullPageShelf === true,
    smartShelvesEnabled: x.smartShelvesEnabled === true,
    unifiedListEnabled: x.unifiedListEnabled === true,
    forceCssLoaderThemes: x.forceCssLoaderThemes === true,
    lightModeEnabled: x.lightModeEnabled === true,
    onlineFeaturesEnabled: x.onlineFeaturesEnabled === true,
    updateNotifyEnabled: x.updateNotifyEnabled !== false,
    integrationsEnabled: (x.integrationsEnabled ?? {}) as Record<string, boolean>,
    featureToggles: (x.featureToggles ?? {}) as Record<string, boolean>,
    activeProfileName: typeof x.activeProfileName === "string" ? x.activeProfileName : null,
  };
}

function detectLocale(): string {
  try {
    const nav = (globalThis as any).navigator;
    const lang = nav?.language;
    if (typeof lang === "string" && lang.length > 0) return lang;
  } catch {}
  return "en-US";
}

// Best-effort synchronous host OS from the user agent (the precise backend
// identity lives behind get_host_os / collectSystemInfo; this is the cheap hint
// exposed via getEnvironment). undefined when it can't be determined.
function detectOs(): string | undefined {
  try {
    const ua = (globalThis as any).navigator?.userAgent as string | undefined;
    if (!ua) return undefined;
    if (/SteamOS/i.test(ua)) return "SteamOS";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
  } catch { /* no navigator */ }
  return undefined;
}

function detectGamepadUi(): boolean {
  try {
    const doc = (globalThis as any).document;
    if (!doc) return false;
    const body = doc.body || doc.documentElement;
    if (!body) return false;
    return body.classList?.contains("gamepad") === true
      || body.classList?.contains("bigpicture") === true
      || !!doc.querySelector?.("[class*='gamepadui_GamepadUI']");
  } catch { return false; }
}

function projectIntegrations(s: Settings | null): ReadonlyArray<IntegrationInfo> {
  const enabledMap = (s ? ((s as any).integrationsEnabled ?? {}) : {}) as Record<string, boolean>;
  return KNOWN_INTEGRATIONS.map((it) => {
    let installed = false;
    try { installed = it.detect(); } catch {}
    const enabled = enabledMap[it.id] !== false;
    return { id: it.id, displayName: it.displayName, installed, enabled };
  });
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

export function makeApi(): DeckShelvesPublicAPI {
  return {
    version: 4,

    registerShelfSource(d) {
      shelfSources.set(d.id, d);
      return () => { shelfSources.delete(d.id); };
    },
    getRegisteredSources() { return Array.from(shelfSources.values()); },

    registerSmartShelfSource(d) {
      smartSources.set(d.id, d);
      return () => { smartSources.delete(d.id); };
    },
    getRegisteredSmartSources() { return Array.from(smartSources.values()); },

    registerFilterType(d) {
      filterTypes.set(d.id, d);
      return () => { filterTypes.delete(d.id); };
    },
    getRegisteredFilterTypes() { return Array.from(filterTypes.values()); },

    registerSortOption(d) {
      sortOptions.set(d.id, d);
      return () => { sortOptions.delete(d.id); };
    },
    getRegisteredSortOptions() { return Array.from(sortOptions.values()); },

    registerImportType(d) {
      importTypes.set(d.id, d);
      return () => { importTypes.delete(d.id); };
    },
    getRegisteredImportTypes() { return Array.from(importTypes.values()); },
    getRegisteredImportTypesForTarget(target) {
      return Array.from(importTypes.values()).filter((d) => (d.target ?? "shelves") === target);
    },

    registerSavedFilter(d) {
      void persistRegisteredSavedFilter(d);
      return () => { void removeRegisteredSavedFilter(d.id); };
    },

    registerExportHandler(d) {
      exportHandlers.set(d.id, d);
      return () => { exportHandlers.delete(d.id); };
    },
    registerImportHandler(d) {
      importHandlers.set(d.id, d);
      return () => { importHandlers.delete(d.id); };
    },
    getRegisteredExportHandlers() { return getExternalExportHandlers(); },
    getRegisteredImportHandlers() { return getExternalImportHandlers(); },

    hasTabMaster() { return isTabMasterInstalled(); },

    registerSearchProvider(d) {
      searchProviders.set(d.id, d);
      return () => { searchProviders.delete(d.id); };
    },
    getRegisteredSearchProviders() { return getExternalSearchProviders(); },

    registerSideMenuProvider(d) {
      sideMenuProviders.set(d.id, d);
      return () => { sideMenuProviders.delete(d.id); };
    },
    getRegisteredSideMenuProviders() { return getExternalSideMenuProviders(); },

    registerContextProvider(d) {
      contextProviders.set(d.id, d);
      return () => { contextProviders.delete(d.id); };
    },
    getRegisteredContextProviders() { return getExternalContextProviders(); },
    registerWidgetProvider(d) {
      widgetProviders.set(d.id, d);
      return () => { widgetProviders.delete(d.id); };
    },
    getRegisteredWidgetProviders() { return getExternalWidgetProviders(); },
    registerShelfRenderer(d) {
      shelfRenderers.set(d.id, d);
      return () => { shelfRenderers.delete(d.id); };
    },
    getRegisteredShelfRenderers() { return getExternalShelfRenderers(); },
    registerMetadataProvider(d) {
      metadataProviders.set(d.id, d);
      return () => { metadataProviders.delete(d.id); };
    },
    getRegisteredMetadataProviders() { return getExternalMetadataProviders(); },
    registerStatisticsProvider(d) {
      statisticsProviders.set(d.id, d);
      return () => { statisticsProviders.delete(d.id); };
    },
    getRegisteredStatisticsProviders() { return getExternalStatisticsProviders(); },
    registerRecommendationProvider(d) {
      recommendationProviders.set(d.id, d);
      return () => { recommendationProviders.delete(d.id); };
    },
    getRegisteredRecommendationProviders() { return getExternalRecommendationProviders(); },

    registerTranslations(locale, dict) { registerTranslations(locale, dict); },

    listTriggerCatalog() {
      const out: PublicTriggerKind[] = [];
      for (const cat of TRIGGER_CATALOG) {
        for (const e of cat.entries) {
          out.push({ kind: e.kind, category: cat.id, categoryTitleKey: cat.titleKey, defaults: e.defaults, invertible: e.invertible === true });
        }
      }
      return out;
    },
    listShelfTemplates() {
      return [...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES].map((t) => ({
        id: t.id, titleKey: t.titleKey, category: t.category,
        requiresOnline: t.requiresOnline === true, defaultSort: t.defaultSort,
        source: t.source as unknown as PublicShelfSource,
      }));
    },
    listShortcuts() {
      const bindings = ((getCurrentSettings() as any)?.buttonBindings ?? {}) as Record<string, string>;
      return (Object.keys(DEFAULT_BINDINGS) as Array<keyof typeof DEFAULT_BINDINGS>).map((action) => ({
        action, defaultCombo: DEFAULT_BINDINGS[action],
        combo: typeof bindings[action] === "string" && bindings[action] ? bindings[action] : DEFAULT_BINDINGS[action],
      }));
    },

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

    getFocusedCard() {
      const { getFocusedCard } = requireFocusTracker();
      return getFocusedCard();
    },
    subscribeFocusedCard(cb) {
      const { subscribeFocusedCard } = requireFocusTracker();
      return subscribeFocusedCard(cb);
    },
    getProfiles() { return projectProfiles(getCurrentSettings()); },
    getActiveProfile() {
      const all = projectProfiles(getCurrentSettings());
      return all.find((p) => p.active) ?? null;
    },
    subscribeProfiles(cb) {
      let last = JSON.stringify(projectProfiles(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectProfiles(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getIntegrations() { return projectIntegrations(getCurrentSettings()); },
    subscribeIntegrations(cb) {
      let last = JSON.stringify(projectIntegrations(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectIntegrations(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getSettingsSnapshot() { return projectSettingsSnapshot(getCurrentSettings()); },
    subscribeSettingsSnapshot(cb) {
      let last = JSON.stringify(projectSettingsSnapshot(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSettingsSnapshot(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getEnvironment() {
      return {
        pluginVersion: typeof pkg?.version === "string" ? pkg.version : "0.0.0",
        apiVersion: 4,
        locale: detectLocale(),
        isGamepadUi: detectGamepadUi(),
        os: detectOs(),
      };
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

import * as focusTracker from "./focusedCardTracker";
import * as assets from "./steamAssets";
function requireFocusTracker(): typeof focusTracker { return focusTracker; }
function requireAssets(): typeof assets { return assets; }

export const READY_EVENT = "deck-shelves:ready";
export const TEARDOWN_EVENT = "deck-shelves:teardown";

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

// Indirect binding so internalRegistry.ts can register without importing this module directly.
let internalBootstrap: (() => () => void) | null = null;
export function setInternalBootstrap(fn: () => () => void): void { internalBootstrap = fn; }

export function installPluginApi(): () => void {
  const api = makeApi();
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

  const deckShelves = {
    version: api.version,
    api,
    register,
  };
  try { (window as unknown as { deckShelves: typeof deckShelves }).deckShelves = deckShelves; } catch {}

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
    statisticsProviders.clear();
    recommendationProviders.clear();
  };
}
