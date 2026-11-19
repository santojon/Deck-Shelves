import { logWarn } from "../../runtime/logger";
import type {
  Unsubscribe, PublicAppMeta, ImportTarget,
  SearchProviderDescriptor, SideMenuProviderDescriptor, ContextProviderDescriptor, WidgetProviderDescriptor,
  ShelfRendererDescriptor, MetadataProviderDescriptor, StatisticsProviderDescriptor, RecommendationProviderDescriptor,
  ExternalShelfSourceDescriptor, SmartShelfSourceDescriptor, ContextAwareShelfSourceDescriptor, ShelfResolveContext,
  ExternalFilterTypeDescriptor, ExternalSortOptionDescriptor, ExternalImportTypeDescriptor,
  ExportHandlerDescriptor, ImportHandlerDescriptor,
} from "@deck-shelves/api";

export const shelfSources = new Map<string, ExternalShelfSourceDescriptor>();
// Context-aware sources are also registered as plain sources; this map only keeps their context and widened resolve().
export const contextAwareShelfSources = new Map<string, ContextAwareShelfSourceDescriptor>();
export const smartSources = new Map<string, SmartShelfSourceDescriptor>();
export const filterTypes = new Map<string, ExternalFilterTypeDescriptor>();
export const sortOptions = new Map<string, ExternalSortOptionDescriptor>();
export const importTypes = new Map<string, ExternalImportTypeDescriptor>();
export const searchProviders = new Map<string, SearchProviderDescriptor>();
export const sideMenuProviders = new Map<string, SideMenuProviderDescriptor>();
export const contextProviders = new Map<string, ContextProviderDescriptor>();
export const widgetProviders = new Map<string, WidgetProviderDescriptor>();
export const shelfRenderers = new Map<string, ShelfRendererDescriptor>();
export const metadataProviders = new Map<string, MetadataProviderDescriptor>();
export const statisticsProviders = new Map<string, StatisticsProviderDescriptor>();
export const recommendationProviders = new Map<string, RecommendationProviderDescriptor>();
export const exportHandlers = new Map<string, ExportHandlerDescriptor>();
export const importHandlers = new Map<string, ImportHandlerDescriptor>();

// Ids a third-party registration may not take: every built-in's, and the plugin's own prefix.
const RESERVED_ID_PREFIX = "deck-shelves.";
export const NOOP_UNSUB: Unsubscribe = () => {};

export function isReservedId(id: unknown, builtIns?: Set<string>): boolean {
  const s = String(id ?? "");
  if (!s.startsWith(RESERVED_ID_PREFIX) && !builtIns?.has(s)) return false;
  logWarn("RUNTIME", `plugin API: id "${s}" is reserved by Deck Shelves; registration ignored`);
  return true;
}

// Unregistering removes the entry only while it is still this registration's.
export function addExternal<D extends { id: string }>(map: Map<string, D>, d: D, builtIns?: Set<string>): Unsubscribe {
  if (isReservedId(d?.id, builtIns)) return NOOP_UNSUB;
  map.set(d.id, d);
  return () => { if (map.get(d.id) === d) map.delete(d.id); };
}

// resolve() may throw synchronously, which a bare Promise.resolve(fn()).catch() would miss.
function safeResolveIds(fn: () => Promise<number[]> | number[]): Promise<number[]> {
  try {
    return Promise.resolve(fn()).catch(() => []);
  } catch {
    return Promise.resolve([]);
  }
}

export function resolveExternalSource(sourceId: string, limit: number): Promise<number[]> {
  const src = shelfSources.get(sourceId);
  if (!src) return Promise.resolve([]);
  return safeResolveIds(() => src.resolve(limit));
}

export function getExternalSources(): ExternalShelfSourceDescriptor[] {
  return Array.from(shelfSources.values());
}

export function hasExternalSource(id: string): boolean {
  return shelfSources.has(id);
}

export function contextAwareSourceRequiresFocus(sourceId: string): boolean {
  return contextAwareShelfSources.get(sourceId)?.context?.requiresFocusedApp === true;
}

export function isContextAwareSource(sourceId: string): boolean {
  return contextAwareShelfSources.has(sourceId);
}

export function getRegisteredContextAwareShelfSources(): ContextAwareShelfSourceDescriptor[] {
  return Array.from(contextAwareShelfSources.values());
}

// Never throws: a provider failure must not break Home rendering.
export function resolveContextAwareExternalSource(
  sourceId: string,
  limit: number,
  params: Record<string, unknown> | undefined,
  context: ShelfResolveContext,
  signal?: AbortSignal,
): Promise<number[]> {
  const src = contextAwareShelfSources.get(sourceId);
  if (!src) return Promise.resolve([]);
  return safeResolveIds(() => src.resolve(limit, params, context, signal));
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
  return safeResolveIds(() => src.resolve(limit, merged));
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

export const internalImportTypeIds = new Set<string>();

export function registerInternalImportType(d: ExternalImportTypeDescriptor): () => void {
  internalImportTypeIds.add(d.id);
  importTypes.set(d.id, d);
  return () => { internalImportTypeIds.delete(d.id); importTypes.delete(d.id); };
}

export const internalSmartSourceIds = new Set<string>();
export const internalFilterTypeIds = new Set<string>();
export const internalSortOptionIds = new Set<string>();

export function registerInternalSmartShelfSource(d: SmartShelfSourceDescriptor): () => void {
  internalSmartSourceIds.add(d.id);
  smartSources.set(d.id, d);
  return () => { internalSmartSourceIds.delete(d.id); smartSources.delete(d.id); };
}

export const internalShelfSourceIds = new Set<string>();

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

export const internalSearchProviderIds = new Set<string>();

export function registerInternalSearchProvider(d: SearchProviderDescriptor): () => void {
  internalSearchProviderIds.add(d.id);
  searchProviders.set(d.id, d);
  return () => { internalSearchProviderIds.delete(d.id); searchProviders.delete(d.id); };
}

export function isInternalSearchProvider(id: string): boolean {
  return internalSearchProviderIds.has(id);
}

export const internalStatisticsProviderIds = new Set<string>();

export function registerInternalStatisticsProvider(d: StatisticsProviderDescriptor): () => void {
  internalStatisticsProviderIds.add(d.id);
  statisticsProviders.set(d.id, d);
  return () => { internalStatisticsProviderIds.delete(d.id); statisticsProviders.delete(d.id); };
}

function hasExternalOnlyEntries(): boolean {
  return !!(sideMenuProviders.size || contextProviders.size || widgetProviders.size
    || shelfRenderers.size || metadataProviders.size || recommendationProviders.size
    || importTypes.size);
}

// External-only registries count any entry; mixed ones count entries not flagged internal.
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
