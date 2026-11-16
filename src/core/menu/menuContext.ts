import { getAllSteamDocuments } from "../../runtime/steamHost";
import { gamepadUIMainWindowStore } from "../../steam/internals";
import { buildDeckShelvesMenuItems as buildDeckShelvesMenuItemsBase } from "./itemBuilders";

let _activeShelfIdForMenu: string | null = null;
let _activeAppIdForMenu: number = 0;
let _activeCardIndexForMenu: number = -1;

// 0 when the menu wasn't opened from a shelf card.
export function getActiveAppIdForMenu(): number {
  return _activeAppIdForMenu;
}

export function buildDeckShelvesMenuItems(shelfId: string, fl: any, R: any, appid?: number): any[] {
  return buildDeckShelvesMenuItemsBase(shelfId, fl, R, appid, _activeAppIdForMenu, _activeCardIndexForMenu);
}

function collectKnownDocsForMenu(): Document[] {
  const docs: Document[] = [];
  try { docs.push(document); } catch {}
  try {
    const w = gamepadUIMainWindowStore()?.BrowserView?.m_browser?.gamepadui?.document;
    if (w) docs.push(w);
  } catch {}
  return docs;
}

function readCardIndexFromDom(appid: number, id: string): number {
  try {
    for (const d of collectKnownDocsForMenu()) {
      const el = d.querySelector(`.ds-card[data-appid="${appid}"][data-shelfid="${id}"]`) as HTMLElement | null;
      if (!el) continue;
      const idx = el.getAttribute('data-ds-card-index');
      return idx !== null ? Number(idx) : -1;
    }
  } catch {}
  return -1;
}

function scheduleActiveShelfReset(id: string): void {
  try {
    setTimeout(() => {
      if (_activeShelfIdForMenu === id) {
        _activeShelfIdForMenu = null;
        _activeAppIdForMenu = 0;
        _activeCardIndexForMenu = -1;
      }
    }, 250);
  } catch {}
}

export function setActiveShelfIdForMenu(id: string | null, appid?: number): void {
  _activeShelfIdForMenu = id;
  if (appid !== undefined) _activeAppIdForMenu = appid;
  _activeCardIndexForMenu = (appid && id) ? readCardIndexFromDom(appid, id) : -1;
  if (id !== null) scheduleActiveShelfReset(id);
}

function findShelfIdInDom(appid: number): string | null {
  try {
    for (const d of getAllSteamDocuments()) {
      const card = d.querySelector(`.ds-card[data-appid="${appid}"][data-shelfid]`) as HTMLElement | null;
      const sid = card?.getAttribute?.("data-shelfid");
      if (sid) return sid;
    }
  } catch {}
  return null;
}

export function resolveShelfIdFromProps(props: any): string | null {
  if (_activeShelfIdForMenu) return _activeShelfIdForMenu;
  const explicit = props?._dsShelfId;
  if (typeof explicit === "string" && explicit) return explicit;
  const appid = props?.overview?.appid;
  return appid ? findShelfIdInDom(appid) : null;
}

export function resolveShelfIdByAppid(appid: number): string | null {
  if (!appid) return null;
  if (_activeShelfIdForMenu) return _activeShelfIdForMenu;
  try {
    for (const d of getAllSteamDocuments()) {
      const card = d.querySelector(`.ds-card[data-appid="${appid}"][data-shelfid]`) as HTMLElement | null;
      const sid = card?.getAttribute?.("data-shelfid") ?? null;
      if (sid) return sid;
    }
  } catch {}
  return null;
}

export const DS_ROOT_KEYS = new Set([
  "ds-deck-shelves", "ds-shelf-root",
  "ds-card-highlight", "ds-card-hide",
  // Both paths must be in the dedup set or the submenu is injected twice.
  "ds-card-add-shelf", "ds-card-remove-shelf",
  "ds-lib-add-shelf", "ds-lib-remove-shelf",
  // A group key missing here is re-added on every render pass.
  "ds-lists", "ds-lib-lists",
  "ds-syn-decoration-top",
  "ds-sep-boot",
]);
export function devInfo(msg: string, extra?: any): void {
  if (!__DEV__) return;
  try { (globalThis as any).console?.info?.(msg, extra); } catch {}
}

export function devWarn(msg: string, extra?: any): void {
  if (!__DEV__) return;
  try { (globalThis as any).console?.warn?.(msg, extra); } catch {}
}

export function findCardAnchor(appid: number): { doc: Document; el: HTMLElement } | null {
  for (const d of getAllSteamDocuments()) {
    const el = (
      d.querySelector(`.ds-card[data-appid="${appid}"]`) ??
      d.querySelector(".ds-card.gpfocus") ??
      d.querySelector(".ds-card:focus")
    ) as HTMLElement | null;
    if (el) return { doc: d, el };
  }
  return null;
}
