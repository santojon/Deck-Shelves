import { call } from '../runtime/host/decky';
import type { PlatformTab } from '../runtime/platform';
import { containerToShelfSource } from '../domain/customfilters';
import { logInfo, logError } from '../runtime/logger';

// ─── Context shape detection ──────────────────────────────────────────────

export function isTabMasterContextValue(val: any): boolean {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  // Top-level has visibleTabsList (array) or tabsMap (Map)
  const hasList = Array.isArray(val.visibleTabsList);
  const hasMap = val.tabsMap instanceof Map;
  return hasList || hasMap;
}

// ─── Tab extraction from context ─────────────────────────────────────────

export function extractTabsFromContext(ctx: any): PlatformTab[] {
  if (!ctx) return [];
  const out: PlatformTab[] = [];
  const seen = new Set<string>();

  const add = (id: string, name: string) => {
    if (id && name && !seen.has(id)) { seen.add(id); out.push({ id, name }); }
  };

  if (Array.isArray(ctx.visibleTabsList)) {
    for (const c of ctx.visibleTabsList) {
      add(String(c?.id ?? '').trim(), String(c?.title ?? c?.name ?? '').trim());
    }
  }
  if (ctx.tabsMap instanceof Map) {
    ctx.tabsMap.forEach((c: any, key: string) => {
      add(String(c?.id ?? key ?? '').trim(), String(c?.title ?? c?.name ?? '').trim());
    });
  }
  return out;
}

// ─── Apps for a specific tab ─────────────────────────────────────────────

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getTabAppsFromContext(ctx: any, tabId: string): number[] {
  if (!ctx?.tabsMap) return [];
  const needle = normalizeText(tabId);

  let best: any = null;
  let bestScore = 0;
  if (ctx.tabsMap instanceof Map) {
    ctx.tabsMap.forEach((c: any, key: string) => {
      const id = normalizeText(String(c?.id ?? key ?? ''));
      const name = normalizeText(String(c?.title ?? c?.name ?? ''));
      const score = (id === needle || name === needle) ? 2 : ((id.includes(needle) || needle.includes(id)) ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    });
  }
  if (!best) return [];

  const allApps = best?.collection?.allApps ?? best?.allApps;
  if (allApps instanceof Set) {
    return Array.from(allApps.values()).map(Number).filter(Number.isFinite);
  }
  if (Array.isArray(allApps)) {
    return allApps.map((a: any) => Number(a?.appid ?? a?.appId ?? a)).filter(Number.isFinite);
  }
  return [];
}

// ─── Backend API — reads TabMaster's settings file via our own backend ───

export interface TabMasterTabEntry {
  id: string;
  title: string;
  position: number;
  filters: any[];
  filtersMode: string;
}

export async function getTabsFromSettingsFile(): Promise<TabMasterTabEntry[]> {
  // Unconditional call: the backend returns {"tabs":[]} when the file
  // is absent; works on both SteamOS 3.7 and 3.9.
  try {
    const response = await call<[], { tabs: TabMasterTabEntry[]; error?: string }>('get_tabmaster_tabs');
    // Diagnostic: shows whether the IPC round-trip reached the backend.
    logInfo('STEAM', 'getTabsFromSettingsFile response', {
      hasResponse: !!response,
      tabsCount: response?.tabs?.length ?? 0,
      error: response?.error,
    });
    return response?.tabs ?? [];
  } catch (e) {
    logError('STEAM', 'getTabsFromSettingsFile threw', String(e));
    return [];
  }
}

export async function getVisibleTabsFromSettingsFile(): Promise<PlatformTab[]> {
  const all = await getTabsFromSettingsFile();
  return all
    .filter((t) => t.position >= 0)
    .sort((a, b) => a.position - b.position)
    .map((t) => {
      const source = t.filters && t.filters.length > 0
        ? containerToShelfSource({ id: t.id, title: t.title, filters: t.filters })
        : { type: 'tab' as const, tab: t.id };
      return { id: t.id, name: t.title, source };
    });
}

// Keep old names for call sites that haven't been updated yet — these now
// delegate to the settings-file approach since TabMaster's Python IPC is
// not accessible from other plugins.
export async function getTabsFromBackend(): Promise<PlatformTab[]> {
  return getVisibleTabsFromSettingsFile();
}

export async function getTabDetailsFromBackend(): Promise<Array<{ id: string; title: string; filters?: any[]; filtersMode?: string }>> {
  const all = await getTabsFromSettingsFile();
  return all.map((t) => ({
    id: t.id,
    title: t.title,
    filters: t.filters,
    filtersMode: t.filtersMode,
  }));
}

// ─── Tab container → shelf source ────────────────────────────────────────

export function tabContainerToShelfSource(container: any): { type: string; tab?: string; filter?: any } {
  return containerToShelfSource(container);
}

// ─── Tabs for import modal ────────────────────────────────────────────────

export interface ImportableTab {
  id: string;
  title: string;
  source: ReturnType<typeof tabContainerToShelfSource>;
}

export function extractTabsForImport(managerOrCtx: any): ImportableTab[] {
  if (!managerOrCtx) return [];
  try {
    // Shape 1: PublicTabMasterContext — has visibleTabsList array
    const list = managerOrCtx.visibleTabsList
      ?? (typeof managerOrCtx.getTabs === 'function' ? managerOrCtx.getTabs()?.visibleTabsList : undefined);
    if (Array.isArray(list)) {
      return list.map((t: any) => ({
        id: String(t?.id ?? ''),
        title: String(t?.title ?? t?.id ?? ''),
        source: tabContainerToShelfSource(t),
      })).filter((t) => t.id);
    }
    // Shape 2: plain object of { tabId: tabSettings } (backend result)
    if (typeof managerOrCtx === 'object') {
      return Object.entries(managerOrCtx)
        .map(([id, tab]: [string, any]) => ({
          id: String(tab?.id ?? id),
          title: String(tab?.title ?? tab?.name ?? id),
          source: tabContainerToShelfSource({ id: String(tab?.id ?? id), ...tab }),
        }))
        .filter((t) => t.id && t.title !== t.id);
    }
  } catch {}
  return [];
}
