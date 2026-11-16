import { devStamp } from "./devStamps";
// Replaces Steam's idle screensaver; the native timer is always restored, never left altered.

import { readIdleTimeoutSec, writeIdleTimeoutSec } from "./steamSettingsWriter";
import { activeFirstShelf } from "./recentsReplace";
import { resolveShelfAppIds } from "../steam";
import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { DEFAULT_SHELF_LIMIT, SHELF_LIMIT_MAX } from "../domain/shelfLimits";
import { getStoreScreenshots } from "../core/onlineStore";
import { qaOverrideActive } from "../qa/harness";
import type { Settings, Shelf } from "../types";

// Scales with shelf count so each shelf can reach its own limit, with a ceiling for memory.
const MAX_SHELF_APPS_CEILING = 300;
const MAX_SCREENSHOTS = 30;
// Content descriptors Steam's "General" screenshot filter excludes.
const MATURE_CONTENT_DESCRIPTOR_IDS = [3, 4];

export type ScreensaverItem =
  | { type: "app"; appid: number }
  | { type: "screenshot"; url: string; appid: number };

function isFeatureEnabled(settings: Settings | null): boolean {
  return (settings as any)?.screensaverShelvesEnabled === true;
}

// Gates on the generic idle-timeout keys; Steam's screensaver-type picker is never touched.
function hasIdleTimeoutSupport(): boolean {
  const cs = (globalThis as any).settingsStore?.clientSettings;
  return !!cs && "system_idle_screensaver_ac_sec" in cs;
}

function hasRequiredScreensaverApis(): boolean {
  const ms = getMenuStore();
  if (typeof ms?.CloseSideMenus !== "function") return false;
  const api = (globalThis as any).SteamClient?.Screenshots;
  if (typeof api?.GetAllAppsLocalScreenshotsCount !== "function") return false;
  return typeof (globalThis as any).collectionStore?.GetCollection === "function";
}

export function isScreensaverSupportDetected(): boolean {
  try {
    return hasIdleTimeoutSupport() && hasRequiredScreensaverApis();
  } catch { return false; }
}

// Independent of Steam's idle value, which is only read to back it up and restore it.
export function getStartAfterSeconds(settings: Settings | null): number {
  const v = (settings as any)?.screensaverStartAfterSeconds;
  return typeof v === "number" && v > 0 ? v : 60;
}

export function getDwellSeconds(settings: Settings | null): number {
  const v = (settings as any)?.screensaverDwellSeconds;
  return typeof v === "number" && v > 0 ? v : 8;
}

function getShelfBatchSize(settings: Settings | null): number {
  const v = (settings as any)?.screensaverShelfBatchSize;
  return typeof v === "number" && v > 0 ? v : 5;
}

function getMenuStore(): any {
  try {
    return (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_MenuStore ?? null;
  } catch { return null; }
}

// The QAM and menus are a separate OS window no z-index can cover, so they're closed instead.
export function isQamOrMenuOpen(): boolean {
  const ms = getMenuStore();
  return typeof ms?.m_eOpenSideMenu === "number" && ms.m_eOpenSideMenu !== 0;
}

export function closeQamOrMenu(): void {
  try { getMenuStore()?.CloseSideMenus?.(); } catch {}
}

function getFocusableShelves(settings: Settings | null): Shelf[] {
  const shelves = (settings?.shelves ?? []) as Shelf[];
  return shelves.filter((s) => s?.enabled !== false && s?.hidden !== true);
}

// Round-robin so an early shelf can't starve the later ones out of the pool.
function interleaveShelfBatches(perShelfIds: number[][], batchSize: number, maxTotal: number): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  const maxLen = Math.max(0, ...perShelfIds.map((l) => l.length));
  for (let batchStart = 0; batchStart < maxLen && ids.length < maxTotal; batchStart += batchSize) {
    for (const list of perShelfIds) {
      if (ids.length >= maxTotal) break;
      for (let i = batchStart; i < batchStart + batchSize && i < list.length && ids.length < maxTotal; i++) {
        if (seen.has(list[i])) continue;
        seen.add(list[i]);
        ids.push(list[i]);
      }
    }
  }
  return ids;
}

async function resolveShelfAppPool(settings: Settings | null): Promise<number[]> {
  const shelves = getFocusableShelves(settings);
  const perShelfIds: number[][] = [];
  for (const shelf of shelves) {
    try {
      perShelfIds.push(await resolveShelfAppIds(shelf.source as any, shelf.limit ?? DEFAULT_SHELF_LIMIT, shelf.sort, shelf.id, shelf.sortReverse as any));
    } catch { perShelfIds.push([]); }
  }
  const maxTotal = Math.min(SHELF_LIMIT_MAX * Math.max(1, shelves.length), MAX_SHELF_APPS_CEILING);
  return interleaveShelfBatches(perShelfIds, getShelfBatchSize(settings), maxTotal);
}

function resolveNativeRecentAppIds(): number[] {
  try {
    const cs = (globalThis as any).collectionStore;
    const visible = cs?.GetCollection?.("recent")?.visibleApps;
    return Array.isArray(visible) ? visible.map((a: any) => a?.appid).filter((id: any) => typeof id === "number") : [];
  } catch { return []; }
}

async function resolveRecentsSlotAppIds(settings: Settings | null): Promise<number[]> {
  if ((settings as any)?.hideRecents !== true) return resolveNativeRecentAppIds();
  const shelf = activeFirstShelf();
  if (!shelf) return [];
  try {
    return await resolveShelfAppIds(shelf.source, shelf.limit ?? DEFAULT_SHELF_LIMIT, shelf.sort, shelf.id, shelf.sortReverse);
  } catch { return []; }
}

function getScreenshotFilterMode(): "all" | "general" | "none" {
  try {
    const raw = (globalThis as any).settingsStore?.clientSettings?.["screensaver_settings"];
    const parsed = raw ? JSON.parse(raw) : {};
    const mode = parsed?.gameslideshow?.userscreenshots;
    return mode === "general" || mode === "none" ? mode : "all";
  } catch { return "all"; }
}

// Steam keeps content descriptors in a Set, not an array.
function appHasMatureContent(appid: number): boolean {
  try {
    const overview = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    const ids: Set<number> | undefined = overview?.m_setContentDescriptors;
    if (!ids) return false;
    return MATURE_CONTENT_DESCRIPTOR_IDS.some((id) => ids.has(id));
  } catch { return false; }
}

function toDisplayUrl(strUrl: string): string {
  return strUrl.startsWith("https://") ? strUrl : `https://steamloopback.host/${strUrl}`;
}

function screenshotRowToItem(row: any, filterMode: "all" | "general" | "none"): ScreensaverItem | null {
  if (!row?.strUrl || typeof row.nAppID !== "number") return null;
  if (filterMode === "general" && appHasMatureContent(row.nAppID)) return null;
  return { type: "screenshot", url: toDisplayUrl(row.strUrl), appid: row.nAppID };
}

async function fetchScreenshotBatch(api: any, start: number, end: number, filterMode: "all" | "general" | "none"): Promise<ScreensaverItem[]> {
  const rows: any[] = await api.GetAllAppsLocalScreenshotsRange(start, end);
  const items: ScreensaverItem[] = [];
  for (const row of rows) {
    const item = screenshotRowToItem(row, filterMode);
    if (item) items.push(item);
  }
  return items;
}

async function collectScreenshotBatches(api: any, count: number, filterMode: "all" | "general" | "none"): Promise<ScreensaverItem[]> {
  const out: ScreensaverItem[] = [];
  const batch = 100;
  for (let start = 0; start < count && out.length < MAX_SCREENSHOTS; start += batch) {
    const end = Math.min(count - 1, start + batch - 1);
    const items = await fetchScreenshotBatch(api, start, end, filterMode);
    out.push(...items.slice(0, MAX_SCREENSHOTS - out.length));
  }
  return out;
}

async function resolveScreenshotPool(): Promise<ScreensaverItem[]> {
  try {
    const api = (globalThis as any).SteamClient?.Screenshots;
    if (!api?.GetAllAppsLocalScreenshotsCount || !api?.GetAllAppsLocalScreenshotsRange) return [];
    const filterMode = getScreenshotFilterMode();
    if (filterMode === "none") return [];
    const count = await api.GetAllAppsLocalScreenshotsCount();
    if (!count) return [];
    return await collectScreenshotBatches(api, count, filterMode);
  } catch { return []; }
}

const ONLINE_SCREENSHOTS_PER_APP = 2;

function pushOnlineScreenshotsForApp(out: ScreensaverItem[], appid: number, urls: string[]): void {
  for (const url of urls.slice(0, ONLINE_SCREENSHOTS_PER_APP)) {
    if (out.length >= MAX_SCREENSHOTS) return;
    out.push({ type: "screenshot", url, appid });
  }
}

async function resolveOnlineScreenshotPool(appIds: number[]): Promise<ScreensaverItem[]> {
  if (!appIds.length) return [];
  const filterMode = getScreenshotFilterMode();
  if (filterMode === "none") return [];
  try {
    const byApp = await getStoreScreenshots(appIds);
    const out: ScreensaverItem[] = [];
    for (const appid of appIds) {
      if (out.length >= MAX_SCREENSHOTS) break;
      if (filterMode === "general" && appHasMatureContent(appid)) continue;
      pushOnlineScreenshotsForApp(out, appid, byApp.get(appid) ?? []);
    }
    return out;
  } catch { return []; }
}

export async function buildScreensaverPool(settings: Settings | null): Promise<ScreensaverItem[]> {
  const includeScreenshots = (settings as any)?.screensaverShelvesIncludeScreenshots === true;
  const includeOnlineScreenshots = (settings as any)?.onlineFeaturesEnabled === true
    && (settings as any)?.screensaverOnlineScreenshotsEnabled === true;

  const shelfIds = await resolveShelfAppPool(settings);
  const recentIds = await resolveRecentsSlotAppIds(settings);
  const seen = new Set<number>();
  const apps: ScreensaverItem[] = [];
  for (const id of [...shelfIds, ...recentIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    apps.push({ type: "app", appid: id });
  }

  const screenshots = includeScreenshots ? await resolveScreenshotPool() : [];
  const onlineScreenshots = includeOnlineScreenshots
    ? await resolveOnlineScreenshotPool(apps.map((a) => (a as { appid: number }).appid))
    : [];
  const pool = [...apps, ...screenshots, ...onlineScreenshots];
  devStamp("__ds_screensaver_last_pool", {
    t: Date.now(), includeScreenshots, includeOnlineScreenshots,
    shelfCount: shelfIds.length, recentCount: recentIds.length,
    appCount: apps.length, screenshotCount: screenshots.length,
    onlineScreenshotCount: onlineScreenshots.length,
  });
  return pool;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `saveSettings` replaces the whole document, so retry against the latest snapshot and verify the write.
async function patchSettingsVerified(patch: Partial<Settings>, verify: (s: Settings) => boolean, attempts = 5): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const s = getCurrentSettings();
    if (!s) return false;
    await saveSettings({ ...s, ...patch } as Settings);
    await delay(200);
    const after = getCurrentSettings();
    if (after && verify(after)) return true;
  }
  return false;
}

async function disableNativeIdleScreensaver(): Promise<void> {
  const before = getCurrentSettings();
  const alreadyBackedUp = (before as any)?.screensaverIdleBackupAcSec != null
    && (before as any)?.screensaverIdleBackupBatterySec != null;
  if (!alreadyBackedUp) {
    // QA builds can't persist the backup, so they never turn Steam's timer off.
    if (qaOverrideActive) return;
    const ac = readIdleTimeoutSec("system_idle_screensaver_ac_sec");
    const battery = readIdleTimeoutSec("system_idle_screensaver_battery_sec");
    if (ac === null || battery === null) return;
    const ok = await patchSettingsVerified(
      { screensaverIdleBackupAcSec: ac, screensaverIdleBackupBatterySec: battery },
      (s) => (s as any).screensaverIdleBackupAcSec === ac && (s as any).screensaverIdleBackupBatterySec === battery,
    );
    // Never disable the real timer without a confirmed way back to it.
    if (!ok) return;
  }
  await writeIdleTimeoutSec("system_idle_screensaver_ac_sec", 0);
  await writeIdleTimeoutSec("system_idle_screensaver_battery_sec", 0);
}

async function restoreNativeIdleScreensaver(): Promise<void> {
  const settings = getCurrentSettings();
  const ac = (settings as any)?.screensaverIdleBackupAcSec;
  const battery = (settings as any)?.screensaverIdleBackupBatterySec;
  if (typeof ac !== "number" || typeof battery !== "number") return;
  await writeIdleTimeoutSec("system_idle_screensaver_ac_sec", ac);
  await writeIdleTimeoutSec("system_idle_screensaver_battery_sec", battery);
  await patchSettingsVerified(
    { screensaverIdleBackupAcSec: null, screensaverIdleBackupBatterySec: null },
    (s) => (s as any).screensaverIdleBackupAcSec == null && (s as any).screensaverIdleBackupBatterySec == null,
  );
}

export function installScreensaverInject(): () => void {
  let wasEnabled = isFeatureEnabled(getCurrentSettings());
  if (wasEnabled) void disableNativeIdleScreensaver();

  const unsubSettings = subscribeSettings(() => {
    const en = isFeatureEnabled(getCurrentSettings());
    if (en && !wasEnabled) void disableNativeIdleScreensaver();
    else if (!en && wasEnabled) void restoreNativeIdleScreensaver();
    wasEnabled = en;
  });

  return () => {
    try { unsubSettings(); } catch {}
    // Never leave Steam's idle timer overridden, even when the plugin is being disabled.
    if (isFeatureEnabled(getCurrentSettings())) void restoreNativeIdleScreensaver();
  };
}
