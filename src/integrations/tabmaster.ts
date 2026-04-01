/**
 * TabMaster integration.
 *
 * TabMaster (github.com/Tormak9970/TabMaster) exposes its state through a
 * React context whose Provider value has the shape:
 *   { visibleTabsList: TabContainer[], hiddenTabsList: TabContainer[],
 *     tabsMap: Map<string, TabContainer>, tabMasterManager, ... }
 *
 * It also has a Decky backend that exposes `get_tabs()` returning
 *   { [tabId]: { id, title, position, filters?, filtersMode?, ... } }
 */
import { call } from '@decky/api';
import { containerToShelfSource } from '../domain/customfilters';
import { isTabMasterInstalled } from './registry';

export type PlatformTab = { id: string; name: string };

// ─── Context shape detection ──────────────────────────────────────────────

/** Returns true if an object looks like TabMaster's PublicTabMasterContext value */
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

// ─── Backend API (Decky `call`) ───────────────────────────────────────────

/**
 * Fetches tab data from TabMaster's Python backend.
 * Returns PlatformTab[] or empty array if not available.
 */
export async function getTabsFromBackend(): Promise<PlatformTab[]> {
  if (!isTabMasterInstalled()) return [];
  try {
    const result = await call<[], Record<string, any>>('get_tabs' as any);
    if (!result || typeof result !== 'object') return [];
    return Object.entries(result)
      .map(([id, tab]) => ({
        id: String(tab?.id ?? id),
        name: String(tab?.title ?? tab?.name ?? id),
      }))
      .filter((t) => t.id && t.name && t.name !== t.id);
  } catch {
    return [];
  }
}

/**
 * Fetches individual tab's app IDs from TabMaster backend.
 * TabMaster stores tab settings; apps are computed client-side from filters.
 * This returns the tab's filter definition for import purposes.
 */
export async function getTabDetailsFromBackend(): Promise<Array<{ id: string; title: string; filters?: any[]; filtersMode?: string }>> {
  if (!isTabMasterInstalled()) return [];
  try {
    const result = await call<[], Record<string, any>>('get_tabs' as any);
    if (!result || typeof result !== 'object') return [];
    return Object.entries(result).map(([id, tab]) => ({
      id: String(tab?.id ?? id),
      title: String(tab?.title ?? tab?.name ?? id),
      filters: tab?.filters ?? [],
      filtersMode: tab?.filtersMode ?? tab?.filterMode ?? 'and',
      sortByOverride: tab?.sortByOverride,
    }));
  } catch {
    return [];
  }
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

/**
 * Extracts tabs from a TabMaster manager/context for use in the import modal.
 * Accepts either the PublicTabMasterContext (with visibleTabsList) or
 * the raw backend result (object of tab settings).
 */
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
