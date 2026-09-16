import { isExternalTabsProviderInstalled } from './registry';
import { getPreferredSteamDocument } from '../runtime/steamHost';
import { getTabAppIdsFromStore, resolveAppInstalledState } from '../steam';

export type PlatformTab = { id: string; name: string };

export const UNIFIDECK_TAB_IDS = [
  'unifideck-deck',
  'unifideck-all',
  'unifideck-installed',
  'unifideck-steam',
  'unifideck-epic',
  'unifideck-gog',
  'unifideck-amazon',
  'unifideck-ubisoft',
  'unifideck-microsoft',
  'unifideck-nonsteam',
] as const;

export function getUnifiDeckTabs(): PlatformTab[] {
  if (!isExternalTabsProviderInstalled()) return [];
  try {
    const doc = getPreferredSteamDocument();
    const tabEls = doc.querySelectorAll('[data-tab-id^="unifideck-"]');
    const tabs: PlatformTab[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(tabEls)) {
      const id = el.getAttribute('data-tab-id') ?? '';
      const name = (el as HTMLElement).innerText?.trim() || el.getAttribute('aria-label') || id;
      if (id && !seen.has(id)) { seen.add(id); tabs.push({ id, name }); }
    }
    return tabs;
  } catch {
    return [];
  }
}

// 1) Try Steam store APIs (more reliable) — installed-state check per id.
async function resolveInstalledIdsFromStoreApi(tabId: string): Promise<number[]> {
  try {
    const ids = await getTabAppIdsFromStore(tabId);
    if (!ids?.length) return [];
    const out: number[] = [];
    for (const id of ids) {
      try {
        const state = await resolveAppInstalledState(Number(id));
        if (state === true) out.push(Number(id));
      } catch {}
    }
    return out;
  } catch { return []; }
}

function appIdFromDatasetCandidate(c: Element): number {
  const aid = c.getAttribute('data-appid') || c.getAttribute('data-app-id') || (c as any).dataset?.appid || (c as any).dataset?.appId;
  return Number(aid);
}

// 2) Fallback: DOM scan for data-appid attributes within the tab panel.
function resolveInstalledIdsFromDom(tabId: string, doc: Document): number[] {
  const sel = `[data-tab-id="${tabId}"], [data-tab-id^="${tabId}"]`;
  const tabEl = doc.querySelector(sel) as HTMLElement | null;
  if (!tabEl) return [];
  const panel = tabEl.closest('.Panel') || tabEl;
  const candidates = panel.querySelectorAll('[data-appid], [data-app-id]');
  const ids: number[] = [];
  for (const c of Array.from(candidates)) {
    const n = appIdFromDatasetCandidate(c);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return Array.from(new Set(ids));
}

export async function getUnifiDeckInstalledAppIds(tabId: string): Promise<number[]> {
  if (!isExternalTabsProviderInstalled()) return [];
  try {
    const storeIds = await resolveInstalledIdsFromStoreApi(tabId);
    if (storeIds.length) return storeIds;
    const doc = getPreferredSteamDocument();
    if (!doc) return [];
    return resolveInstalledIdsFromDom(tabId, doc);
  } catch {
    return [];
  }
}

function tabLabel(el: Element): string {
  return (el as HTMLElement).innerText?.trim()
    || el.getAttribute('aria-label')
    || el.getAttribute('title')
    || '';
}

export function getTabsFromDOM(): PlatformTab[] {
  try {
    const doc = getPreferredSteamDocument();
    // Steam renders library tabs with data-tab-id attribute
    const tabEls = doc.querySelectorAll('[data-tab-id]');
    const tabs: PlatformTab[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(tabEls)) {
      const id = el.getAttribute('data-tab-id') ?? '';
      if (!id) continue;
      const name = tabLabel(el);
      if (name && !seen.has(id)) { seen.add(id); tabs.push({ id, name }); }
    }
    return tabs;
  } catch {
    return [];
  }
}
