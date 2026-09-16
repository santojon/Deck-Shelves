/* Deck Shelves' own idle screensaver: replaces Steam's native one (idle
   timer disabled/restored via steamSettingsWriter, never left altered)
   with a slideshow of everything the home screen shows (native Recents +
   shelf games) and, opt-in, local screenshots filtered the same way
   Steam's own screensaver setting would. Experimental, off by default. */

import { readIdleTimeoutSec, writeIdleTimeoutSec } from "./steamSettingsWriter";
import { activeFirstShelf } from "./recentsReplace";
import { resolveShelfAppIds } from "../steam";
import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import type { Settings, Shelf } from "../types";

const MAX_SHELF_APPS = 30;
const MAX_SCREENSHOTS = 30;
// Content-descriptor ids Steam's own "General" screenshot filter excludes
// (confirmed live against the screensaver settings module).
const MATURE_CONTENT_DESCRIPTOR_IDS = [3, 4];

export type ScreensaverItem =
  | { type: "app"; appid: number }
  | { type: "screenshot"; url: string; appid: number };

function isFeatureEnabled(settings: Settings | null): boolean {
  return (settings as any)?.screensaverShelvesEnabled === true;
}

/* Gates on the generic SteamOS idle-timeout keys, not
   `screensaver_current_id` (specific to this beta's screensaver-type
   picker, which we never touch — we replace the native screensaver
   outright). Likely holds beyond just this beta, though only verified
   live against it so far. */
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

// Deck Shelves' own idle/dwell timing — independent of Steam's value
// (which we only read once, to cache+restore, not to drive our own timer).
export function getStartAfterSeconds(settings: Settings | null): number {
  const v = (settings as any)?.screensaverStartAfterSeconds;
  return typeof v === "number" && v > 0 ? v : 60;
}

export function getDwellSeconds(settings: Settings | null): number {
  const v = (settings as any)?.screensaverDwellSeconds;
  return typeof v === "number" && v > 0 ? v : 8;
}

function getMenuStore(): any {
  try {
    return (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_MenuStore ?? null;
  } catch { return null; }
}

// QAM/menu are a separate OS-level window — no CSS z-index can appear
// above them, so they're closed (CloseSideMenus) on idle-trigger instead.
export function isQamOrMenuOpen(): boolean {
  const ms = getMenuStore();
  return typeof ms?.m_eOpenSideMenu === "number" && ms.m_eOpenSideMenu !== 0;
}

export function closeQamOrMenu(): void {
  try { getMenuStore()?.CloseSideMenus?.(); } catch { /* best-effort */ }
}

function getFocusableShelves(settings: Settings | null): Shelf[] {
  const shelves = (settings?.shelves ?? []) as Shelf[];
  return shelves.filter((s) => s?.enabled !== false && s?.hidden !== true);
}

async function resolveShelfAppPool(settings: Settings | null): Promise<number[]> {
  const shelves = getFocusableShelves(settings);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const shelf of shelves) {
    if (ids.length >= MAX_SHELF_APPS) break;
    try {
      const shelfIds = await resolveShelfAppIds(shelf.source as any, shelf.limit ?? 20, shelf.sort, shelf.id, shelf.sortReverse as any);
      for (const id of shelfIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= MAX_SHELF_APPS) break;
      }
    } catch { /* one bad shelf source shouldn't drop the rest */ }
  }
  return ids;
}

function resolveNativeRecentAppIds(): number[] {
  try {
    const cs = (globalThis as any).collectionStore;
    const visible = cs?.GetCollection?.("recent")?.visibleApps;
    return Array.isArray(visible) ? visible.map((a: any) => a?.appid).filter((id: any) => typeof id === "number") : [];
  } catch { return []; }
}

/* Whatever's actually shown in the "recents" slot on Home right now:
   native Recents when displayed as-is, the promoted shelf's own games
   when hideRecents + recentsReplaceSource are both on (reusing the exact
   resolver the real replacement uses, not a re-derived guess), or
   nothing when recents are simply hidden with no override. */
async function resolveRecentsSlotAppIds(settings: Settings | null): Promise<number[]> {
  if ((settings as any)?.hideRecents !== true) return resolveNativeRecentAppIds();
  const shelf = activeFirstShelf();
  if (!shelf) return [];
  try {
    return await resolveShelfAppIds(shelf.source, shelf.limit ?? 20, shelf.sort, shelf.id, shelf.sortReverse);
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

// content descriptors live on the overview as a real Set (confirmed live:
// `m_setContentDescriptors`), not a plain array.
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

// One raw screenshot row -> a pool item, or null when it's filtered out
// (bad shape, or a mature-content app under "general" mode).
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

// Always the full mix of whatever's shown on the home screen — shelf
// games and whatever's actually in the recents slot (native, promoted
// shelf, or nothing) — no "ours only" distinction.
export async function buildScreensaverPool(settings: Settings | null): Promise<ScreensaverItem[]> {
  const includeScreenshots = (settings as any)?.screensaverShelvesIncludeScreenshots === true;

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
  const pool = [...apps, ...screenshots];
  try {
    (globalThis as any).__ds_screensaver_last_pool = {
      t: Date.now(), includeScreenshots,
      shelfCount: shelfIds.length, recentCount: recentIds.length,
      appCount: apps.length, screenshotCount: screenshots.length,
    };
  } catch { /* diagnostics must never throw */ }
  return pool;
}

// ---- native idle-timer disable/restore ----

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* `saveSettings` replaces the whole document from whatever snapshot the
   caller read — no locking, so racing it against a concurrent user save
   can silently lose either side's write (confirmed live: how a prior
   version of this function lost the real Steam idle-timeout backup).
   Retry against the latest snapshot and verify the write landed. */
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
    // Never leave Steam's own idle timer permanently overridden, even if
    // the plugin itself is being disabled/removed while the toggle is on.
    if (isFeatureEnabled(getCurrentSettings())) void restoreNativeIdleScreensaver();
  };
}
