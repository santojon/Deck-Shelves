import i18n from "../../i18n";
import { getFrontendLib } from "../../runtime/host/decky";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { steamAppStore, steamClient, steamReact } from "../../steam/internals";
import { localQuickLaunchAction } from "../../steam/appDisplayStatus";
import { buildDeckShelvesMenuItems, findCardAnchor } from "./menuContext";

/* The last-resort game menu: when neither the native capture nor the legacy
   flow can show Steam's own menu, build one from the client API (Play,
   Properties, Verify, Uninstall, Screenshots, Details) plus the shelf items. */

function fallbackMenuLabel(key: string, fallback: string): string {
  try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
}

function pushIfAvailable(items: any[], R: any, MenuItem: any, key: string, label: string, action: () => void, extraProps?: Record<string, any>): void {
  items.push(R.createElement(MenuItem, { key, onSelected: action, ...(extraProps ?? {}) }, label));
}

type FallbackSpec = {
  key: string;
  labelKey: string;
  labelFallback: string;
  available: (sc: any, nav: any) => boolean;
  action: (sc: any, nav: any, appid: number) => void;
  installedOnly?: boolean;
  extraProps?: Record<string, any>;
};

const FALLBACK_SPECS: FallbackSpec[] = [
  {
    key: "play",
    labelKey: "menu_play",
    labelFallback: "Play",
    installedOnly: true,
    available: (sc) => typeof sc?.Apps?.RunGame === "function",
    action: (sc, _n, appid) => { try { sc?.Apps?.RunGame(String(appid), "", -1, 1); } catch {} },
  },
  {
    key: "properties",
    labelKey: "menu_properties",
    labelFallback: "Properties",
    available: (_sc, nav) => typeof nav?.NavigateToAppProperties === "function",
    action: (_sc, nav, appid) => { try { nav.NavigateToAppProperties(appid); } catch {} },
  },
  {
    key: "verify",
    labelKey: "menu_verify_integrity",
    labelFallback: "Verify integrity of installed files",
    installedOnly: true,
    available: (sc) => typeof sc?.Apps?.VerifyApp === "function",
    action: (sc, _n, appid) => { try { sc?.Apps?.VerifyApp?.(appid); } catch {} },
  },
  {
    key: "uninstall",
    labelKey: "menu_uninstall",
    labelFallback: "Uninstall",
    installedOnly: true,
    extraProps: { tone: "destructive" },
    available: (sc) => typeof sc?.Apps?.UninstallApps === "function",
    action: (sc, _n, appid) => { try { sc?.Apps?.UninstallApps?.([appid], false); } catch {} },
  },
  {
    key: "screenshots",
    labelKey: "menu_browse_screenshots",
    labelFallback: "Browse screenshots",
    available: (sc) => typeof sc?.Apps?.BrowseScreenshotsForApp === "function",
    action: (sc, _n, appid) => { try { sc?.Apps?.BrowseScreenshotsForApp?.(String(appid)); } catch {} },
  },
  {
    key: "details",
    labelKey: "menu_view_details",
    labelFallback: "View Details",
    available: () => true,
    action: (sc, nav, appid) => { try { (nav?.Navigate ?? sc?.Browser?.Navigate)?.(`/library/app/${appid}`); } catch {} },
  },
];

function appendShelfItems(items: any[], shelfId: string, appid: number, fl: any, R: any): void {
  const dsItems = buildDeckShelvesMenuItems(shelfId, fl, R, appid);
  if (!dsItems.length) return;
  if (fl.MenuSeparator) items.push(R.createElement(fl.MenuSeparator, { key: "ds-sep" }));
  for (const it of dsItems) items.push(it);
}

/* Steam's own menu starts with the app's main action: Update while an update is pending, Pause
   while it downloads. The View button's quick launch clicks the first item, so this menu starts
   the same way instead of always with Play (which updates and then runs the game). */
function primaryUpdateItem(sc: any, appid: number, overview: any): { key: string; label: string; action: () => void } | null {
  const { action, clientId } = localQuickLaunchAction(overview);
  if (action === "update" && typeof sc?.Downloads?.ResumeAppUpdate === "function") {
    return { key: "update", label: fallbackMenuLabel("menu_update", "Update"), action: () => { try { sc.Downloads.ResumeAppUpdate(appid, clientId); } catch {} } };
  }
  if (action === "pause" && typeof sc?.Downloads?.EnableAllDownloads === "function") {
    return { key: "pause", label: fallbackMenuLabel("menu_pause", "Pause"), action: () => { try { sc.Downloads.EnableAllDownloads(false, clientId); } catch {} } };
  }
  return null;
}

function buildFallbackItems(appid: number, shelfId: string | undefined, fl: any, R: any, overview: any): any[] {
  const items: any[] = [];
  const sc: any = steamClient();
  const nav = fl.Navigation ?? sc?.Navigation;
  const installed = overview?.installed === true;
  const primary = primaryUpdateItem(sc, appid, overview);
  if (primary) pushIfAvailable(items, R, fl.MenuItem, primary.key, primary.label, primary.action);
  for (const spec of FALLBACK_SPECS) {
    if (spec.installedOnly && !installed) continue;
    if (!spec.available(sc, nav)) continue;
    pushIfAvailable(items, R, fl.MenuItem, spec.key,
      fallbackMenuLabel(spec.labelKey, spec.labelFallback),
      () => spec.action(sc, nav, appid),
      spec.extraProps);
  }
  if (shelfId) appendShelfItems(items, shelfId, appid, fl, R);
  return items;
}

function labelFromDataName(card: HTMLElement): string | null {
  /* `data-name` carries the resolved title on the card root even when the
     visible label is hidden (logo mode / hide-game-names) — and it is the ONLY
     reliable source for online (wishlist/store) items, which have no local
     AppOverview to read `display_name` from. */
  return card?.getAttribute?.('data-name')?.trim() || null;
}

function labelFromVisibleText(card: HTMLElement): string | null {
  return card?.querySelector?.('.ds-card-label-name')?.textContent?.trim() || null;
}

function labelFromImgAlt(card: HTMLElement): string | null {
  return (card?.querySelector?.('img[alt]') as HTMLImageElement | null)?.alt?.trim() || null;
}

function resolveCardLabelName(cardEl: HTMLElement | null): string | null {
  try {
    if (!cardEl) return null;
    const card = (cardEl.closest?.('.ds-card') as HTMLElement | null) ?? cardEl;
    return labelFromDataName(card) ?? labelFromVisibleText(card) ?? labelFromImgAlt(card);
  } catch { return null; }
}

function hasFallbackMenuApi(fl: any, R: any): boolean {
  return !!(fl?.showContextMenu && R && fl.Menu && fl.MenuItem);
}

function resolveFallbackTitle(overview: any, cardEl: HTMLElement | null): string {
  return overview?.display_name || resolveCardLabelName(cardEl) || fallbackMenuLabel("menu_game_fallback", "Game");
}

export function showFallbackMenu(appid: number, shelfId: string | undefined): void {
  try {
    const fl = getFrontendLib();
    const R = steamReact();
    if (!hasFallbackMenuApi(fl, R)) return;
    const anchor = findCardAnchor(appid);
    const cardEl = (anchor?.el ?? getPreferredSteamDocument().activeElement) as HTMLElement;
    const overview = steamAppStore()?.GetAppOverviewByAppID?.(appid);
    const items = buildFallbackItems(appid, shelfId, fl, R, overview);
    fl.showContextMenu(R.createElement(fl.Menu, { label: resolveFallbackTitle(overview, cardEl) }, ...items), cardEl);
  } catch {}
}
