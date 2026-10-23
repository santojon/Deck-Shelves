import { call } from '../runtime/host/decky';
import type { PlatformTab } from '../runtime/platform';
import { containerToShelfSource } from '../domain/customfilters';
import { logInfo, logError } from '../runtime/logger';

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
    // Diagnostic (dev only): TabMaster is optional, so a missing file is normal —
    // don't log it on every poll in production.
    if (__DEV__) logInfo('STEAM', 'getTabsFromSettingsFile response', {
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
