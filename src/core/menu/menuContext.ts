import { getAllSteamDocuments } from "../../runtime/steamHost";
import { gamepadUIMainWindowStore } from "../../steam/internals";
import { buildDeckShelvesMenuItems as buildDeckShelvesMenuItemsBase } from "./itemBuilders";

/* Shared state and lookups of the game-menu injection: which shelf card the
   menu was opened for (set when a DS card opens it, cleared shortly after),
   the shelf-id resolution every render patch uses, the DS menu-item keys, and
   the dev-only logging. One module so the menu patches share one copy. */

let _activeShelfIdForMenu: string | null = null;
let _activeAppIdForMenu: number = 0;
let _activeCardIndexForMenu: number = -1;

// The appid the menu was opened for (0 when no DS card opened it).
export function getActiveAppIdForMenu(): number {
  return _activeAppIdForMenu;
}

/* Thin wrapper around the extracted builder — injects the module-global
   focused-card context (`_activeAppIdForMenu` / `_activeCardIndexForMenu`)
   so existing call sites don't have to forward those values. Signature
   matches the pre-extraction local function. */
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
  /* Add/Remove-shelf groups (both the in-shelf and library-card paths).
     Missing these from the dedup set caused the "Add to shelf" submenu
     to inject twice on shelves where both the boot-patch render and the
     shouldComponentUpdate hook fired against the same menu instance. */
  "ds-card-add-shelf", "ds-card-remove-shelf",
  "ds-lib-add-shelf", "ds-lib-remove-shelf",
  // The Lists group (pinned games, queues, tags) on both paths; a group key
  // missing here is re-added on every render pass of the menu.
  "ds-lists", "ds-lib-lists",
  // Synthetic-card top-level decoration shortcut (when the user opens
  // the menu on a decoration card from showSyntheticCardMenu).
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
