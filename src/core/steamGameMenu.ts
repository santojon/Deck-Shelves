import { showContextMenu, findModuleChild, findModuleByExport, fakeRenderComponent, afterPatch as dflAfterPatch } from "@decky/ui";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { isSteamOS38OrLater } from "./steamOSVersion";
import i18n from "../i18n";
import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import {
  toggleShelfHiddenById,
  moveShelfById,
  duplicateShelfById,
  setShelfCollapsed,
  dispatchShelfModal,
} from "./shelfActions";
import { patchShelfInSettings } from "../domain/settings";
import { saveFocusTarget, beginFocusRestoreLoop } from "./focusRestore";
import { invalidateRandomSortCache } from "../steam";
import { invalidateSmartShelfCache } from "../steam/smartShelves";
import { triggerShelfRefresh } from "./shelfRefresh";
import { clearOnlineShelfCache } from "./shelfActions";

/**
 * Returns `true` when this device should use the pre-3.8 (v1.4.0-style) menu
 * extraction flow. Conservative default: only `true` when we explicitly
 * detect SteamOS ≤ 3.7. Unknown / 3.8+ keep the current path.
 */
function useLegacyMenuFlow(): boolean {
  return isSteamOS38OrLater() === false;
}

let cachedMenuComponent: any = null;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

// Independent legacy (≤ 3.7) cache — never shared with the modern path.
// Sharing the cache would let a partially-corrupted modern extraction
// poison the legacy fallback (and vice-versa). Two distinct sets of state
// also let us run the v1.2.0 recursive retry without disturbing modern
// runs interleaved on the same session.
let legacyCachedComponent: any = null;
let legacyCachedTemplateProps: Record<string, any> = {};
let legacyLastAttempt = 0;

function getSteamReact(): any {
  return (globalThis as any).SP_REACT;
}

function getAppStore(): any {
  return (globalThis as any).appStore;
}

// Cache of patched/wrapped captured components so we patch each component
// at most once and can dedupe across showGameMenu calls.
const patchedComponents = new WeakSet<any>();
const wrappedComponents = new WeakMap<any, any>();

// Direct webpack discovery: find Steam's `LibraryContextMenu` class at
// module load and patch its `prototype.render` once. The patch fires for
// EVERY render of that class — so even when our React.createElement
// capture misses (memo / forwardRef variants on newer SteamOS), the DS
// submenu still injects. Gated on a per-call shelfId stash (set right
// before `dfl.showContextMenu` is invoked, cleared a tick later) so the
// patch only injects when triggered from a DS shelf card; native game cards
// are unaffected.
let _libraryContextMenuClass: any = null;
let _libraryContextMenuPatched = false;
let _hltbDiscoveryAttempted = false;
let _activeShelfIdForMenu: string | null = null;
let _activeAppIdForMenu: number = 0;
let _activeCardIndexForMenu: number = -1;
function setActiveShelfIdForMenu(id: string | null, appid?: number): void {
  _activeShelfIdForMenu = id;
  if (appid !== undefined) _activeAppIdForMenu = appid;
  // Capture the card index from the DOM so the menu knows if the focused card
  // is position 0 (needed to reflect highlightFirst state correctly).
  try {
    if (appid && id) {
      const docs: Document[] = [];
      try { docs.push(document); } catch {}
      try { const w = (globalThis as any).GamepadUIMainWindowStore?.BrowserView?.m_browser?.gamepadui?.document; if (w) docs.push(w); } catch {}
      for (const d of docs) {
        const el = d.querySelector(`.ds-card[data-appid="${appid}"][data-shelfid="${id}"]`) as HTMLElement | null;
        if (el) {
          const idx = el.getAttribute('data-ds-card-index');
          _activeCardIndexForMenu = idx !== null ? Number(idx) : -1;
          break;
        }
      }
    } else {
      _activeCardIndexForMenu = -1;
    }
  } catch { _activeCardIndexForMenu = -1; }
  if (id !== null) {
    try {
      setTimeout(() => {
        if (_activeShelfIdForMenu === id) { _activeShelfIdForMenu = null; _activeAppIdForMenu = 0; _activeCardIndexForMenu = -1; }
      }, 250);
    } catch {}
  }
}

/**
 * Resolves the shelfId to use when injecting DS items into a context-menu
 * render. Three sources, in order:
 *
 *  1. `_activeShelfIdForMenu` — set by `showGameMenu` immediately before
 *     `dfl.showContextMenu`, cleared a tick later. Covers the manual-render
 *     path used by the menu-button intercept.
 *  2. `props._dsShelfId` — explicit prop, also used by the manual path as a
 *     backup signal when the per-call stash already cleared.
 *  3. Live DOM lookup via `props.overview.appid` → `.ds-card[data-appid="N"]
 *     [data-shelfid]` across all known Steam windows. Covers the **native**
 *     render path: when Steam itself opens `AppContextMenu` for one of our
 *     DS cards (e.g. cards 3+ where the intercept's `.gpfocus` detection
 *     misses), neither the stash nor `_dsShelfId` are set, but the DOM has
 *     the answer.
 *
 * Returns null only when none of the three sources resolves a shelfId — at
 * which point `injectDeckShelvesIntoTree` is skipped and the menu renders
 * unchanged (purely additive: never breaks the native menu).
 */
function resolveShelfIdFromProps(props: any): string | null {
  if (_activeShelfIdForMenu) return _activeShelfIdForMenu;
  const explicit = props?._dsShelfId;
  if (typeof explicit === "string" && explicit) return explicit;
  try {
    const appid = props?.overview?.appid;
    if (!appid) return null;
    for (const d of getAllSteamDocuments()) {
      const card = d.querySelector(`.ds-card[data-appid="${appid}"][data-shelfid]`) as HTMLElement | null;
      const sid = card?.getAttribute?.("data-shelfid");
      if (sid) return sid;
    }
  } catch {}
  return null;
}

function discoverLibraryContextMenuClass(): any {
  if (_libraryContextMenuClass || _hltbDiscoveryAttempted) return _libraryContextMenuClass;
  _hltbDiscoveryAttempted = true;
  // Primary: discovery via findModuleByExport. Searches module EXPORTS
  // (not just direct children) for the LibraryContextMenu factory
  // function, then picks the sibling export whose source includes
  // `navigator:` (the LibraryContextMenu wrapper) and fakeRenders it
  // to get the class.
  try {
    const m = findModuleByExport((e: any) =>
      e?.toString && typeof e.toString === "function" && e.toString().includes("().LibraryContextMenu"));
    if (m) {
      // Sibling that contains `navigator:` is the LibraryContextMenu
      // wrapper factory. The extra `createElement` filter the previous
      // version added matched a different sibling in some bundle layouts
      // and made the find return undefined — discovery would silently
      // fail with no fallback firing. Match SGDB/CheatDeck-equivalent
      // signature exactly.
      const wrapper = Object.values(m).find((sibling: any) =>
        sibling?.toString && sibling.toString().includes("navigator:")
      );
      const rendered = wrapper ? fakeRenderComponent(wrapper as any) : null;
      _libraryContextMenuClass = rendered?.type ?? null;
    }
  } catch {}
  // Fallback: legacy findModuleChild discovery (for older Steam builds where
  // findModuleByExport's filter shape doesn't match).
  if (!_libraryContextMenuClass) {
    try {
      const wrapper = findModuleChild((m: any) => {
        if (typeof m !== "object" || !m) return undefined;
        for (const prop in m) {
          const v = m[prop];
          if (v && typeof v.toString === "function" && v.toString().includes("().LibraryContextMenu")) {
            return Object.values(m).find((sibling: any) =>
              typeof sibling === "function" &&
              typeof sibling.toString === "function" &&
              sibling.toString().includes("createElement") &&
              sibling.toString().includes("navigator:")
            );
          }
        }
        return undefined;
      });
      const rendered = wrapper ? fakeRenderComponent(wrapper) : null;
      _libraryContextMenuClass = rendered?.type ?? null;
    } catch {}
  }
  return _libraryContextMenuClass;
}

/**
 * Installs the boot patch on Steam's `LibraryContextMenu` class.
 * Idempotent. Safe no-op when discovery fails (e.g. SteamOS build that
 * renames the module). The capture/wrap path in `getInjectedMenuComponent`
 * stays as a parallel safety net.
 */
/**
 * Resolves shelfId for a given appid by querying the DS cards in DOM.
 * Returns null when no matching DS card is found (the menu is for a native
 * game card, not a DS shelf card — we don't inject items in that case).
 */
function resolveShelfIdByAppid(appid: number): string | null {
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

/**
 * Detects whether a menu items array belongs to the game's AppContextMenu.
 * Looks for either:
 *   - `launchSource` in onSelected (installed Steam game's Play action), OR
 *   - `AppProperties` in onSelected (Properties... item — UNIVERSAL across
 *     installed/uninstalled/shortcut, so it correctly identifies game menus
 *     for non-installed games which a `launchSource`-only check would miss).
 */
function isGameContextMenuItems(items: any[], dfl: any): boolean {
  if (!Array.isArray(items) || !items.length) return false;
  if (!dfl?.findInReactTree) return false;
  try {
    return !!dfl.findInReactTree(items, (x: any) => {
      const fn = x?.props?.onSelected;
      if (typeof fn !== "function") return false;
      const src = fn.toString();
      return src.includes("launchSource") || src.includes("AppProperties");
    });
  } catch { return false; }
}

/**
 * Removes any previously-injected DS items from the children array to avoid
 * double-injection across re-renders (Steam re-renders the menu when the app
 * overview changes — e.g. install progress, playtime tick).
 */
const DS_ROOT_KEYS = new Set([
  "ds-deck-shelves", "ds-shelf-root",
  "ds-card-highlight", "ds-card-hide",
  // Add/Remove-shelf groups (both the in-shelf and library-card paths).
  // Missing these from the dedup set caused the "Add to shelf" submenu
  // to inject twice on shelves where both the boot-patch render and the
  // shouldComponentUpdate hook fired against the same menu instance.
  "ds-card-add-shelf", "ds-card-remove-shelf",
  "ds-lib-add-shelf", "ds-lib-remove-shelf",
  "ds-sep-boot",
]);
function dedupDsMenuItems(items: any[]): void {
  if (!Array.isArray(items)) return;
  for (let i = items.length - 1; i >= 0; i--) {
    if (DS_ROOT_KEYS.has(items[i]?.key)) items.splice(i, 1);
  }
}

/**
 * Inserts DS items into a children array immediately before the "Properties..."
 * item when present (so DS actions sit near the bottom of the menu, next to
 * Properties. Falls back to appending
 * when Properties can't be located.
 */
function spliceDsItems(items: any[], dsItems: any[], dfl: any, R: any): void {
  if (!Array.isArray(items) || !dsItems.length) return;
  const sep = dfl?.MenuSeparator ? R.createElement(dfl.MenuSeparator, { key: "ds-sep-boot" }) : null;
  let insertAt = -1;
  try {
    insertAt = items.findIndex((item: any) =>
      dfl.findInReactTree?.(item, (x: any) =>
        x?.onSelected && typeof x.onSelected === "function" &&
        x.onSelected.toString().includes("AppProperties")
      )
    );
  } catch {}
  const toInsert = sep ? [sep, ...dsItems] : dsItems;
  if (insertAt >= 0) {
    items.splice(insertAt, 0, ...toInsert);
  } else {
    items.push(...toInsert);
  }
}

/**
 * Installs a 3-layer afterPatch chain on LibraryContextMenu — same technique
 * to inject items reliably for EVERY game type
 * (installed, uninstalled, non-Steam shortcut). The chain navigates through
 * React's component hierarchy to reach the actual menu items array:
 *
 *  1. Outer: `LibraryContextMenu.prototype.render` — fires when the menu's
 *     outer class renders. Reads appid from `component._owner.pendingProps
 *     .overview.appid` (React fiber owner — works regardless of which inner
 *     branch Steam takes for this game's state).
 *
 *  2. Middle: `component.type` — wraps the function/class returned by the
 *     outer's render. Fires when React processes the element type. From here
 *     we reach the inner class via `ret.type`.
 *
 *  3. Deepest: `ret.type.prototype.render` + `shouldComponentUpdate` — the
 *     class whose render actually produces the menu items. We splice DS
 *     items into `ret2.props.children[0]` (the menu items array). The
 *     shouldComponentUpdate hook keeps items present across Steam-initiated
 *     re-renders (e.g. install progress, playtime tick).
 */
// Tracks inner-type prototypes that already have render + shouldComponentUpdate
// patched. Steam uses a different inner class for installed Steam games vs
// uninstalled games vs non-Steam shortcuts — patching only the first one
// encountered leaves the others uninjected. WeakSet lets the patches persist
// across renders without leaking when types are GC'd.
const _patchedInnerTypes = new WeakSet<any>();

/**
 * Locates the menu-items array inside a rendered menu tree. Steam's menu
 * class produces different children shapes for installed vs uninstalled vs
 * shortcut games:
 *   - Old/installed shape: `children[0]` is the items array
 *   - Flat shape: `children` IS the items array (individual MenuItems)
 * Returns the array we should splice into (mutating it injects items into
 * the rendered output), or null if no suitable array found.
 */
function findMenuItemsArray(ret2: any): any[] | null {
  const c = ret2?.props?.children;
  if (!c) return null;
  // Nested shape: items live in children[0] (installed Steam game menu)
  if (Array.isArray(c) && Array.isArray(c[0]) && c[0].length > 0 &&
      c[0].some((it: any) => it?.props?.onSelected)) {
    return c[0];
  }
  // Flat shape: children itself contains MenuItems (uninstalled/shortcut)
  if (Array.isArray(c) && c.some((it: any) => it?.props?.onSelected)) {
    return c;
  }
  return null;
}

function patchDeepestRender(prototype: any): void {
  if (!prototype || typeof prototype.render !== "function") return;
  try {
    dflAfterPatch(prototype, "render", function (this: any, _b: any, ret2: any) {
      try {
        const menuItems = findMenuItemsArray(ret2);
        if (!menuItems) return ret2;
        const dfl = getDFL();
        const R = getSteamReact();
        if (!dfl || !R) return ret2;
        if (!isGameContextMenuItems(menuItems, dfl)) return ret2;
        // Skip when the outer LibraryContextMenu mutation already inserted
        // a DS item into the children array — this patch is only the
        // fallback for the very first menu open in a session, before the
        // outer's else branch starts running.
        if (menuItems.some((c: any) => c?.key === "ds-deck-shelves")) return ret2;
        let curAppid: number = 0;
        try {
          const parent = menuItems.find((x: any) =>
            x?._owner?.pendingProps?.overview?.appid);
          if (parent) curAppid = Number(parent._owner.pendingProps.overview.appid) || 0;
        } catch {}
        if (!curAppid) {
          try { curAppid = Number(this?.props?.overview?.appid) || 0; } catch {}
        }
        const curShelfId = resolveShelfIdByAppid(curAppid);
        if (!curShelfId) {
          // Library-card path (game isn't in any DS shelf). Still
          // surface the Add-to-shelf submenu so the user can append
          // it to one of their manual shelves from the native menu.
          if (curAppid > 0) {
            const libItems = buildLibraryAddToShelfItems(curAppid, dfl, R);
            if (libItems.length) spliceDsItems(menuItems, libItems, dfl, R);
          }
          return ret2;
        }
        const items = buildDeckShelvesMenuItems(curShelfId, dfl, R, curAppid);
        if (!items.length) return ret2;
        spliceDsItems(menuItems, items, dfl, R);
      } catch (e) {
        try { (globalThis as any).console?.warn?.("[DS][menu] inner render patch threw", e); } catch {}
      }
      return ret2;
    });
  } catch {}
  if (typeof prototype.shouldComponentUpdate === "function") {
    try {
      dflAfterPatch(prototype, "shouldComponentUpdate", function (this: any, args: any[], shouldUpdate: any) {
        try {
          const nextProps = args?.[0];
          const nextChildren = findMenuItemsArray({ props: nextProps });
          if (!nextChildren) return shouldUpdate;
          const dfl = getDFL();
          const R = getSteamReact();
          if (!dfl || !R) return shouldUpdate;
          if (!isGameContextMenuItems(nextChildren, dfl)) return shouldUpdate;
          if (shouldUpdate !== true) return shouldUpdate;
          let curAppid: number = 0;
          try {
            const parent = nextChildren.find((x: any) =>
              x?._owner?.pendingProps?.overview?.appid);
            if (parent) curAppid = Number(parent._owner.pendingProps.overview.appid) || 0;
          } catch {}
          if (!curAppid) {
            try { curAppid = Number(this?.props?.overview?.appid) || 0; } catch {}
          }
          const curShelfId = resolveShelfIdByAppid(curAppid);
          if (!curShelfId) {
            if (curAppid > 0) {
              const libItems = buildLibraryAddToShelfItems(curAppid, dfl, R);
              if (libItems.length) {
                dedupDsMenuItems(nextChildren);
                spliceDsItems(nextChildren, libItems, dfl, R);
              }
            }
            return shouldUpdate;
          }
          dedupDsMenuItems(nextChildren);
          const items = buildDeckShelvesMenuItems(curShelfId, dfl, R, curAppid);
          if (items.length) spliceDsItems(nextChildren, items, dfl, R);
        } catch (e) {
          try { (globalThis as any).console?.warn?.("[DS][menu] inner sCU patch threw", e); } catch {}
        }
        return shouldUpdate;
      });
    } catch {}
  }
}

/** True once the boot-patch on Steam's LibraryContextMenu has been applied
 * successfully. Lets callers (e.g. the hide-recents stager) tell whether the
 * lazy-loaded webpack chunk has registered yet — when this is still false,
 * forcing `display:none` on native recents prevents Steam from ever loading
 * the chunk, so menus fall back to root injection instead of the proper
 * Library variant. */
export function isLibraryContextMenuPatched(): boolean {
  return _libraryContextMenuPatched;
}

export function installLibraryContextMenuPatch(): void {
  if (_libraryContextMenuPatched) return;
  const cls = discoverLibraryContextMenuClass();
  if (!cls?.prototype?.render || typeof dflAfterPatch !== "function") return;
  let innerInstalled = false;
  try {
    dflAfterPatch(cls.prototype, "render", function (this: any, _args: any[], component: any) {
      try {
        let appid: number = 0;
        try {
          if (component?._owner?.pendingProps?.overview?.appid) {
            appid = Number(component._owner.pendingProps.overview.appid) || 0;
          }
        } catch {}
        if (!appid) {
          try { appid = Number(this?.props?.overview?.appid) || 0; } catch {}
        }
        if (!appid) return component;
        const shelfId = resolveShelfIdByAppid(appid);
        if (!shelfId) return component;

        const dfl = getDFL();
        const R = getSteamReact();
        if (!dfl || !R) return component;

        // First render in this session: install the deeper patches via
        // component.type → ret.type.prototype.render. The deepest patch
        // injects on the inner class's render output so the very first
        // menu open shows DS items. From the SECOND render onward, the
        // else branch below mutates component.props.children directly —
        // that's the only level React reconciles reliably across the
        // sequence of native context menus Steam re-uses for each card,
        // because the OUTER component element is recreated fresh per
        // render so its props.children diff truly compares old vs new.
        if (!innerInstalled) {
          innerInstalled = true;
          try {
            dflAfterPatch(component, "type", (_a: any, ret: any) => {
              try {
                if (ret?.type?.prototype && typeof ret.type.prototype.render === "function" && !_patchedInnerTypes.has(ret.type)) {
                  _patchedInnerTypes.add(ret.type);
                  patchDeepestRender(ret.type.prototype);
                }
              } catch {}
              return ret;
            });
          } catch {}
        } else {
          try {
            const outerChildren = component?.props?.children;
            if (Array.isArray(outerChildren) && isGameContextMenuItems(outerChildren, dfl)) {
              dedupDsMenuItems(outerChildren);
              const items = buildDeckShelvesMenuItems(shelfId, dfl, R, appid);
              if (items.length) spliceDsItems(outerChildren, items, dfl, R);
            }
          } catch {}
        }
      } catch {}
      return component;
    });
    _libraryContextMenuPatched = true;
  } catch {}
}

/**
 * Deep injection: replaces `cls.prototype.render` (the lazy-bootstrap) with a
 * wrapper that intercepts the per-instance `Object.defineProperty(this,"render",
 * {writable:false, value:X})` call made by the original bootstrap. The interceptor
 * wraps `X` before it is locked, so EVERY render of EVERY instance — including
 * re-renders after the lock — includes DS items.
 *
 * Root cause: the bootstrap locks `this.render = X` with `writable:false`. On
 * every re-render React calls `this.render()` directly (instance beats prototype),
 * bypassing the prototype-level `afterPatch`. For uninstalled/non-Steam games a
 * re-render fires immediately after mount (internal state update in AppContextMenu),
 * removing our injected items before the first DOM commit lands.
 *
 * Fix timeline per instance:
 *   1. React mounts cls instance → calls `instance.render()` → finds our bootstrap wrapper.
 *   2. Our wrapper temporarily patches `Object.defineProperty`.
 *   3. Original bootstrap runs → calls patched defineProperty → we wrap X → restore global.
 *   4. Bootstrap calls `this.render()` → this.render is now `wrappedX`.
 *   5. `wrappedX` returns original render output + injected DS items.
 *   6. All subsequent re-renders of this instance call `this.render = wrappedX` → items persist.
 *
 * Object.defineProperty is patched only for the synchronous duration of the bootstrap
 * call for a single instance — the `try/finally` ensures immediate restore.
 */
let _ctxMenuPatchInstalled = false;

export function installCreateContextMenuPatch(): void {
  if (_ctxMenuPatchInstalled) return;

  const cls = discoverLibraryContextMenuClass();
  if (!cls?.prototype?.render) return;

  try {
    const origBootstrap = cls.prototype.render;
    cls.prototype.render = function (this: any) {
      const self = this;
      const origDP = Object.defineProperty;
      let intercepted = false;
      (Object.defineProperty as any) = function (target: any, prop: PropertyKey, desc: PropertyDescriptor) {
        if (!intercepted && prop === "render" && target === self && typeof desc?.value === "function") {
          intercepted = true;
          Object.defineProperty = origDP;
          const X = desc.value;
          const wrappedX = function (this: any) {
            const ret = X.apply(this, arguments as any);
            try {
              const shelfId = resolveShelfIdFromProps(this?.props);
              if (shelfId) return injectDeckShelvesIntoTree(ret, shelfId);
            } catch {}
            return ret;
          };
          return origDP.call(Object, target, prop, { ...desc, value: wrappedX });
        }
        return origDP.apply(Object, [target, prop, desc] as any);
      };
      try {
        return origBootstrap.apply(this, arguments as any);
      } finally {
        Object.defineProperty = origDP;
      }
    };
    _ctxMenuPatchInstalled = true;
  } catch {}
}

/**
 * Builds a `Deck Shelves` nested submenu (MenuGroup) containing the seven
 * per-shelf actions: Edit, Duplicate, Collapse/Expand, Hide/Show, Move up,
 * Move down, Delete. Returned as a single MenuGroup so the parent menu
 * shows "Deck Shelves" as one entry that expands into the action list.
 *
 * Edit and Delete navigate to routes that mount a standalone settings
 * controller and open the modal via DFL.showModal — no QAM dependency.
 * The other actions call the standalone helpers in `shelfActions.ts`.
 *
 * Returns an empty array when the shelf cannot be located (silent no-op
 * — the native menu renders unchanged).
 */
function buildDeckShelvesMenuItems(shelfId: string, dfl: any, R: any, appid?: number): any[] {
  const focusedAppId = appid ?? _activeAppIdForMenu;
  if (!dfl?.MenuItem || !dfl?.MenuGroup || !R?.createElement) return [];
  const settings = getCurrentSettings?.();
  if (!settings) return [];
  const shelves = settings.shelves ?? [];
  const smartShelves = (settings as any).smartShelves ?? [];
  let idx = shelves.findIndex((sh: any) => sh.id === shelfId);
  let isSmart = false;
  let listLen = shelves.length;
  let shelf: any = idx >= 0 ? shelves[idx] : null;
  if (!shelf) {
    idx = smartShelves.findIndex((sh: any) => sh.id === shelfId);
    if (idx < 0) return [];
    shelf = smartShelves[idx];
    isSmart = true;
    listLen = smartShelves.length;
  }
  const isHidden = !!shelf?.hidden;
  let isCollapsed = false;
  try { isCollapsed = (globalThis as any).localStorage?.getItem?.(`ds-collapsed-${shelfId}`) === "1"; } catch {}

  const lbl = (key: string, fallback: string): string => {
    try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
  };

  // A menu action mutates settings, which re-renders the home and drops
  // gamepad focus — Steam then defaults it to the first shelf. Pin the card
  // the menu was opened on and let the focus-restore loop put it back after
  // the re-render (the loop's confirmation poll also defends against Steam's
  // post-render first-card grab).
  const preserveFocus = () => {
    if (focusedAppId > 0) {
      try { saveFocusTarget(focusedAppId, shelfId); beginFocusRestoreLoop(); } catch {}
    }
  };
  const item = (key: string, label: string, onSelected: () => void, disabled?: boolean) =>
    R.createElement(dfl.MenuItem, { key, onSelected: () => { onSelected(); preserveFocus(); }, disabled }, label);

  const src: any = shelf?.source;
  const isOnline = src?.type === "wishlist" || src?.type === "store";
  const isRandomOrSmart =
    isSmart ||
    isOnline ||
    src?.type === "smart" ||
    shelf?.sort === "random" ||
    (src?.type === "filter" && src?.filter?.sort === "random");

  // Toggle a boolean flag on the shelf and persist immediately.
  const toggleFlag = (key: string) => {
    const s = getCurrentSettings();
    if (!s) return;
    const next = !shelf[key];
    if (isSmart) {
      const updated = (s.smartShelves ?? []).map((sh: any) =>
        sh.id === shelfId ? { ...sh, [key]: next } : sh,
      );
      void saveSettings({ ...s, smartShelves: updated });
    } else {
      void saveSettings(patchShelfInSettings(s, shelfId, { [key]: next } as any));
    }
  };

  // Prefix checked items with a checkmark so the current state is visible.
  const checked = (flag: boolean, label: string) => (flag ? `✓ ${label}` : label);

  // ── Management submenu ────────────────────────────────────────────────
  const mgmt = [
    item("ds-edit",      lbl("editShelf", "Edit"),      () => dispatchShelfModal("edit", shelfId)),
    item("ds-decoration", lbl("menu_decoration", "Decoration"), () => dispatchShelfModal("edit", shelfId, { initialTab: "decoration" }),
      // Smart shelves don't expose the Decoration tab (resolver is mode-driven, not slot-driven).
      isSmart),
    item("ds-duplicate", lbl("duplicateShelf", "Duplicate"), () => {
      void duplicateShelfById(shelfId, lbl("copySuffix", "(Copy)"));
    }),
    item(
      "ds-collapse",
      isCollapsed ? lbl("expand_shelf", "Expand shelf") : lbl("collapse_shelf", "Collapse shelf"),
      () => setShelfCollapsed(shelfId, !isCollapsed),
    ),
    item(
      "ds-hide",
      isHidden ? lbl("show_shelf", "Show shelf") : lbl("hide_shelf", "Hide shelf"),
      () => { void toggleShelfHiddenById(shelfId); },
    ),
    item("ds-move-up",   lbl("move_up", "Move up"),     () => { void moveShelfById(shelfId, -1); }, idx <= 0),
    item("ds-move-down", lbl("move_down", "Move down"),  () => { void moveShelfById(shelfId, 1); }, idx >= listLen - 1),
    ...(isRandomOrSmart ? [
      item("ds-refresh", isOnline ? lbl("refresh_cache", "Refresh cache") : lbl("refresh", "Refresh"), () => {
        try {
          if (isSmart || src?.type === "smart") invalidateSmartShelfCache(shelfId);
          else if (isOnline) clearOnlineShelfCache();
          else invalidateRandomSortCache(shelfId);
          triggerShelfRefresh({ manual: true, shelfId });
        } catch {}
      }),
    ] : []),
    item("ds-delete", lbl("deleteShelf", "Delete"), () => dispatchShelfModal("delete", shelfId)),
  ];

  // ── Display submenu ───────────────────────────────────────────────────
  const display = [
    item("ds-d-title",     checked(!!shelf.hideShelfTitle,    lbl("hide_shelf_title",    "Hide shelf title")),    () => toggleFlag("hideShelfTitle")),
    item("ds-d-names",     checked(!!shelf.hideGameNames,     lbl("hide_game_name",      "Hide game names")),     () => toggleFlag("hideGameNames")),
    item("ds-d-status",    checked(!!shelf.hideStatusLine,    lbl("hide_status_line",    "Hide status line")),    () => toggleFlag("hideStatusLine")),
    item("ds-d-badge",     checked(!!shelf.hideNewBadge,      lbl("hide_new_badge",      "Hide new badge")),      () => toggleFlag("hideNewBadge")),
    item("ds-d-discount",  checked(!!shelf.hideDiscountBadge, lbl("hide_discount_badge", "Hide discount badge")), () => toggleFlag("hideDiscountBadge")),
    item("ds-d-compat",    checked(!!shelf.hideCompatIcons,   lbl("hide_compat_icons",   "Hide compat icons")),   () => toggleFlag("hideCompatIcons")),
    item("ds-d-nsbadge",   checked(!!shelf.hideNonSteamBadge, lbl("hide_non_steam_badge","Hide non-Steam badge")),() => toggleFlag("hideNonSteamBadge")),
    item("ds-d-install",   checked(!!shelf.hideInstallIndicator, lbl("hide_install_indicator","Hide install indicator")), () => toggleFlag("hideInstallIndicator")),
    item("ds-d-seemore",   checked(!!shelf.hideSeeMore,       lbl("hide_see_more_card",  "Hide \"See more\"")),   () => toggleFlag("hideSeeMore")),
    item("ds-d-refresh",   checked(!!shelf.hideRefreshCard,   lbl("hide_refresh_card",   "Hide refresh card")),   () => toggleFlag("hideRefreshCard")),
  ];

  // ── Visual submenu ────────────────────────────────────────────────────
  const visual = [
    item("ds-v-native",    checked(!!shelf.matchNativeSize,   lbl("match_native_size",   "Match native size")),   () => toggleFlag("matchNativeSize")),
    item("ds-v-hiFirst",   checked(!!shelf.highlightFirst,    lbl("highlight_first",     "Highlight first card")),() => toggleFlag("highlightFirst")),
    item("ds-v-hiAll",     checked(!!shelf.highlightAll,      lbl("highlight_all",       "Highlight all cards")), () => toggleFlag("highlightAll")),
    item("ds-v-hero",      checked(!!(shelf as any).heroEnabled, lbl("hero_enabled_label","Enable hero art")),     () => toggleFlag("heroEnabled")),
  ];

  const group = (key: string, label: string, ...children: any[]) =>
    R.createElement(dfl.MenuGroup, { key, label }, ...children);

  // ── Sort direction toggle (direct item inside "Prateleira") ───────────
  const isReversed = !!shelf.sortReverse;
  const sortLabel = isReversed
    ? checked(true, lbl("sort_descending", "Sort: descending"))
    : lbl("sort_ascending", "Sort: ascending");
  const sortToggle = item("ds-sort-dir", sortLabel, () => toggleFlag("sortReverse"));

  // ── Card-level actions (base level, no submenu) ───────────────────────
  // These apply to the specific focused card, not the shelf as a whole.
  const cardActions: any[] = [];
  if (focusedAppId > 0) {
    // A card is effectively highlighted if it's individually in highlightedAppIds,
    // OR if it's at index 0 and highlightFirst is on (shelf-level setting),
    // OR if highlightAll is on. Reflect all three in the menu so the user
    // can see the active state and toggle it per-card without confusion.
    const inHighlightedIds = (shelf.highlightedAppIds ?? []).includes(focusedAppId);
    const isFirstCard = _activeCardIndexForMenu === 0;
    const highlightedViaFirst = isFirstCard && !!shelf.highlightFirst;
    const highlightedViaAll = !!shelf.highlightAll;
    const highlighted = inHighlightedIds || highlightedViaFirst || highlightedViaAll;
    cardActions.push(item(
      "ds-card-highlight",
      highlighted
        ? checked(true, lbl("remove_highlight", "Remove highlight"))
        : lbl("highlight_this", "Highlight this game"),
      () => {
        const s = getCurrentSettings();
        if (!s) return;
        // When removing highlight: if the highlight came from highlightAll/
        // highlightFirst (shelf-level), turn those off. If it came from
        // highlightedAppIds (per-card), remove from that list.
        if (highlighted) {
          let patch: Record<string, any> = {};
          if (highlightedViaAll) patch.highlightAll = false;
          if (highlightedViaFirst) patch.highlightFirst = false;
          if (inHighlightedIds) patch.highlightedAppIds = (shelf.highlightedAppIds ?? []).filter((id: number) => id !== focusedAppId);
          if (isSmart) {
            const updated = (s.smartShelves ?? []).map((sh: any) =>
              sh.id === shelfId ? { ...sh, ...patch } : sh,
            );
            void saveSettings({ ...s, smartShelves: updated });
          } else {
            void saveSettings(patchShelfInSettings(s, shelfId, patch));
          }
        } else {
          const ids: number[] = shelf.highlightedAppIds ?? [];
          const next = [...ids, focusedAppId];
          if (isSmart) {
            const updated = (s.smartShelves ?? []).map((sh: any) =>
              sh.id === shelfId ? { ...sh, highlightedAppIds: next } : sh,
            );
            void saveSettings({ ...s, smartShelves: updated });
          } else {
            void saveSettings(patchShelfInSettings(s, shelfId, { highlightedAppIds: next }));
          }
        }
      },
    ));

    const hiddenFromShelf = (shelf.hiddenAppIds ?? []).includes(focusedAppId);
    cardActions.push(item(
      "ds-card-hide",
      hiddenFromShelf
        ? lbl("show_in_shelf", "Show in shelf")
        : lbl("hide_from_shelf", "Hide from shelf"),
      () => {
        const s = getCurrentSettings();
        if (!s) return;
        const ids: number[] = shelf.hiddenAppIds ?? [];
        const next = hiddenFromShelf ? ids.filter((id) => id !== focusedAppId) : [...ids, focusedAppId];
        if (isSmart) {
          const updated = (s.smartShelves ?? []).map((sh: any) =>
            sh.id === shelfId ? { ...sh, hiddenAppIds: next } : sh,
          );
          void saveSettings({ ...s, smartShelves: updated });
        } else {
          void saveSettings(patchShelfInSettings(s, shelfId, { hiddenAppIds: next }));
        }
      },
    ));

    // ── Add-to-shelf submenu ────────────────────────────────────────────
    // Lists regular (non-smart) shelves the user could append this game
    // to. Filtered to exclude:
    //   - the current shelf (the game is already here)
    //   - shelves whose appid pool already contains this id (via
    //     manualOrder — that's the source of truth for manual shelves)
    //   - shelves at or above their per-shelf limit
    //   - shelves with 50+ manual entries (hard cap to keep the UX sane)
    //
    // Selecting an entry: the target shelf is patched with `sort='manual'`
    // (if not already), manualOrder gains the appid at the end, and any
    // previously-engaged manual sort keeps its prior order.
    const ABSOLUTE_MAX = 50;
    const candidateShelves: any[] = (settings.shelves ?? []).filter((sh: any) => {
      if (sh.id === shelfId) return false;
      const manual: number[] = sh.manualOrder ?? [];
      if (manual.includes(focusedAppId)) return false;
      const cap = Math.min(typeof sh.limit === "number" ? sh.limit : ABSOLUTE_MAX, ABSOLUTE_MAX);
      if (manual.length >= cap) return false;
      return true;
    });
    if (candidateShelves.length > 0) {
      const addItems = candidateShelves.map((sh: any) => item(
        `ds-card-add-${sh.id}`,
        sh.title ?? sh.id,
        () => {
          const s = getCurrentSettings();
          if (!s) return;
          const tgt: any = (s.shelves ?? []).find((row: any) => row.id === sh.id);
          if (!tgt) return;
          const manual: number[] = tgt.manualOrder ?? [];
          const wasManual = tgt.sort === "manual";
          const patch: Record<string, any> = {
            sort: "manual",
            sortReverse: false,
            manualOrder: [...manual, focusedAppId],
          };
          if (!wasManual) {
            // Preserve the current natural order so the rest of the row
            // doesn't reshuffle when we engage manual mode.
            patch.manualBaseSort = typeof tgt.sort === "string" ? tgt.sort : "alphabetical";
          }
          void saveSettings(patchShelfInSettings(s, sh.id, patch));
        },
      ));
      cardActions.push(group("ds-card-add-shelf", lbl("menu_add_to_shelf", "Add to shelf"), ...addItems));
    }

    // ── Remove-from-shelf submenu ──────────────────────────────────────
    // Lists every regular shelf whose manualOrder currently contains
    // this appid (excluding the shelf the menu is rooted on — the
    // existing "Hide from shelf" entry handles the current shelf).
    // Selecting an entry strips the appid from that shelf's manualOrder.
    const removableShelves: any[] = (settings.shelves ?? []).filter((sh: any) => {
      if (sh.id === shelfId) return false;
      const manual: number[] = sh.manualOrder ?? [];
      return manual.includes(focusedAppId);
    });
    if (removableShelves.length > 0) {
      const rmItems = removableShelves.map((sh: any) => item(
        `ds-card-rm-${sh.id}`,
        sh.title ?? sh.id,
        () => {
          const s = getCurrentSettings();
          if (!s) return;
          const tgt: any = (s.shelves ?? []).find((row: any) => row.id === sh.id);
          if (!tgt) return;
          const manual: number[] = tgt.manualOrder ?? [];
          void saveSettings(patchShelfInSettings(s, sh.id, {
            manualOrder: manual.filter((id) => id !== focusedAppId),
          }));
        },
      ));
      cardActions.push(group("ds-card-remove-shelf", lbl("menu_remove_from_shelf", "Remove from shelf"), ...rmItems));
    }
  }

  // Card-level items sit at the same level as "Prateleira", before it.
  // The "Prateleira" group contains only shelf-scoped submenus.
  return [
    ...cardActions,
    group(
      "ds-shelf-root", lbl("menu_shelf", "Shelf"),
      sortToggle,
      group("ds-mgmt",    lbl("menu_management", "Management"), ...mgmt),
      group("ds-display", lbl("menu_display",    "Display"),    ...display),
      group("ds-visual",  lbl("menu_visual",     "Visual"),     ...visual),
    ),
  ];
}

/**
 * Locates the outermost `Menu` element in the rendered tree and appends the
 * Deck Shelves submenu as additional children. Same shape as the seam used
 * to extend the native game menu via the same Menu-element seam used to
 * append items to the rendered context-menu tree.
 *
 * Mutates the existing element's `props.children` rather than replacing the
 * element so React's reconciliation key flow stays consistent.
 */
function injectDeckShelvesIntoTree(rendered: any, shelfId: string): any {
  if (!rendered) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] inject skipped — rendered is null"); } catch {}
    return rendered;
  }
  const dfl = getDFL();
  const R = getSteamReact();
  if (!dfl?.findInReactTree) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] inject skipped — dfl.findInReactTree unavailable"); } catch {}
    return rendered;
  }
  // Dedup helper — prevents double-injection when both the boot-patch and
  // the HOC wrap fire on the same render cycle. Must match the keys that
  // `buildDeckShelvesMenuItems` actually emits (`ds-card-*`, `ds-shelf-root`)
  // — the old check looked for `ds-deck-shelves`, a key no longer produced,
  // so it never detected the existing items and re-injected a duplicate set.
  const containsDsItems = (children: any): boolean => {
    if (!Array.isArray(children)) return false;
    return children.some((c: any) => DS_ROOT_KEYS.has(c?.key));
  };
  try {
    // Broader Menu detection — the captured AppContextMenu may render the
    // outermost Menu using a Steam-internal class that is NOT identical to
    // `dfl.Menu`, so we accept ANY node with a string `label` whose
    // `children` is iterable (the canonical Menu shape across SteamOS 3.5–3.9).
    const menu = dfl.findInReactTree(rendered, (node: any) => {
      if (!node || typeof node !== "object" || !node.props) return false;
      if (node.type === dfl.Menu) return true;
      if (typeof node.props.label !== "string") return false;
      const ch = node.props.children;
      return Array.isArray(ch) || (ch !== undefined && ch !== null);
    });
    const items = buildDeckShelvesMenuItems(shelfId, dfl, R);
    if (!items.length) {
      if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] no items to inject — buildDeckShelvesMenuItems returned []"); } catch {}
      return rendered;
    }
    // Primary path: Menu node found — append to its children (with dedup).
    if (menu && menu.props) {
      const existing = Array.isArray(menu.props.children)
        ? menu.props.children
        : (menu.props.children !== undefined ? [menu.props.children] : []);
      if (containsDsItems(existing)) {
        if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] inject skipped — DS items already present in Menu node", { shelfId }); } catch {}
        return rendered;
      }
      menu.props.children = [...existing, ...items];
      if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] injected", { shelfId, label: menu.props.label, before: existing.length, added: items.length }); } catch {}
      return rendered;
    }
    // Fallback: no Menu node found (happens for non-installed games / shortcuts
    // whose menu wraps a different Steam-internal component). Inject directly
    // into the root rendered element's children so the items still appear in
    // the dropdown. Same shape as the boot-patch fallback.
    if (rendered?.props) {
      const existing = rendered.props.children;
      if (containsDsItems(existing)) {
        if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] root inject skipped — DS items already present", { shelfId }); } catch {}
        return rendered;
      }
      const sep = dfl.MenuSeparator ? R.createElement(dfl.MenuSeparator, { key: "ds-sep-fallback" }) : null;
      if (Array.isArray(existing)) {
        if (sep) existing.push(sep);
        for (const it of items) existing.push(it);
      } else if (existing != null) {
        rendered.props.children = sep ? [existing, sep, ...items] : [existing, ...items];
      } else {
        rendered.props.children = items;
      }
      if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] injected via root fallback", { shelfId, added: items.length }); } catch {}
    } else if ((globalThis as any).__DEV__) {
      try { (globalThis as any).console?.warn?.("[DS][menu] rendered has no props — skipping inject", { shelfId }); } catch {}
    }
    return rendered;
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] injectDeckShelvesIntoTree threw", e); } catch {}
    return rendered;
  }
}

/**
 * Returns the captured menu component wrapped so its rendered output gains
 * the Deck Shelves submenu when `_dsShelfId` is present in props.
 *
 * Three target shapes are handled (covers every Steam Deck capture observed
 * on 3.5–3.9): class component (afterPatch on `prototype.render`),
 * forwardRef (afterPatch on `.render`), plain function (HOC wrapper that
 * calls the inner function and patches its result tree).
 */
// React internal type tags. These are stable string symbols (Symbol.for) so
// they survive bundling and match across realms — same approach Decky's
// `findInReactTree` uses to detect memo/forwardRef wrappers.
const REACT_MEMO_TYPE = typeof Symbol === "function" ? Symbol.for("react.memo") : 0xead3;
const REACT_FORWARD_REF_TYPE = typeof Symbol === "function" ? Symbol.for("react.forward_ref") : 0xead0;

function getInjectedMenuComponent(inner: any): any {
  if (!inner) return inner;
  const dfl = getDFL();
  if (!dfl) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] inject skipped — DFL not available"); } catch {}
    return inner;
  }

  // memo wrapper — Steam frequently wraps AppContextMenu in React.memo to
  // skip re-renders. The wrapper is a plain object `{$$typeof, type, compare}`
  // with no `render`, so the class/forwardRef/function branches all miss it
  // and the previous code returned the unpatched memo as-is. Patch the
  // wrapped `.type` recursively (one of the branches below will match it).
  // For class / forwardRef branches the recursive call mutates the inner in
  // place via afterPatch, so we just return the memo wrapper. For the
  // function-component branch the recursive call returns a NEW wrapper —
  // when that happens we need to swap `inner.type` so React renders the
  // patched function instead of the original one.
  if (typeof inner === "object" && inner.$$typeof === REACT_MEMO_TYPE && inner.type) {
    const patched = getInjectedMenuComponent(inner.type);
    if (patched && patched !== inner.type) {
      try { inner.type = patched; } catch {}
    }
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] memo unwrapped — patched inner type", { wrappedKind: typeof inner.type, swapped: patched !== inner.type ? "no" : "(in place)" }); } catch {}
    return inner;
  }

  if (typeof dfl.afterPatch === "function") {
    // forwardRef wrapper — `{$$typeof: react.forward_ref, render: fn}`. Patch
    // `.render`; React calls it with `(props, ref)` so args[0] holds the props.
    if (typeof inner === "object" && inner.$$typeof === REACT_FORWARD_REF_TYPE && typeof inner.render === "function") {
      if (!patchedComponents.has(inner)) {
        try {
          dfl.afterPatch(inner, "render", function (_args: any[], result: any) {
            const props = _args?.[0];
            const shelfId = resolveShelfIdFromProps(props);
            if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
            return result;
          });
          patchedComponents.add(inner);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] afterPatch installed (forwardRef via $$typeof)", { name: inner.displayName ?? "<forwardRef>" }); } catch {}
        } catch (e) { try { (globalThis as any).console?.warn?.("[DS][menu] afterPatch forwardRef failed", e); } catch {} }
      }
      return inner;
    }

    // Class component — afterPatch on prototype.render preserves the
    // original component identity so React's reconciliation isn't disturbed.
    if (inner?.prototype && typeof inner.prototype.render === "function") {
      if (!patchedComponents.has(inner)) {
        try {
          dfl.afterPatch(inner.prototype, "render", function (this: any, _args: any[], result: any) {
            const shelfId = resolveShelfIdFromProps(this?.props);
            if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
            return result;
          });
          patchedComponents.add(inner);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] afterPatch installed (class)", { name: inner.name ?? inner?.displayName ?? "<anon>" }); } catch {}
        } catch (e) { try { (globalThis as any).console?.warn?.("[DS][menu] afterPatch class failed", e); } catch {} }
      }
      return inner;
    }

    // Duck-typed forwardRef fallback (no $$typeof but has a `.render` distinct
    // from itself). Same patch shape as the $$typeof branch above.
    if (typeof inner.render === "function" && inner.render !== inner) {
      if (!patchedComponents.has(inner)) {
        try {
          dfl.afterPatch(inner, "render", function (_args: any[], result: any) {
            const props = _args?.[0];
            const shelfId = resolveShelfIdFromProps(props);
            if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
            return result;
          });
          patchedComponents.add(inner);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] afterPatch installed (forwardRef duck)", { name: inner.displayName ?? "<forwardRef>" }); } catch {}
        } catch (e) { try { (globalThis as any).console?.warn?.("[DS][menu] afterPatch forwardRef-duck failed", e); } catch {} }
      }
      return inner;
    }
  }

  // Plain function component path. Steam's modern AppContextMenu capture
  // returns a *thin wrapper* — a function that pulls `navigator` + `instance`
  // from custom hooks and forwards to the real menu CLASS via JSX (verified
  // via CDP: `function xe(e) { ... return jsx(Re, {...}); }`). The wrapper
  // returns a single React element whose `.type` is the class we actually
  // need to patch. So we try to unwrap first via `fakeRenderComponent`:
  // if it gives us back a different inner type, recurse on it (typically
  // matches the class-component branch above and patches `prototype.render`).
  // The HOC fallback below stays as a safety net for genuinely flat function
  // components.
  if (typeof inner === "function") {
    if (typeof fakeRenderComponent === "function") {
      try {
        const fake = fakeRenderComponent(inner);
        const innerType = fake?.type;
        if (innerType && innerType !== inner) {
          // Recurse — patches the real class / forwardRef behind the wrapper
          // for the installed-game render path. Falls through to the HOC wrap
          // below so we ALSO inject when the wrapper renders a DIFFERENT
          // inner for other game states (uninstalled, non-Steam shortcut),
          // which the inner-class patch wouldn't catch. Dedup in
          // injectDeckShelvesIntoTree prevents double-injection.
          getInjectedMenuComponent(innerType);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] thin wrapper unwrapped — patched inner type", { wrapperName: inner.name ?? "<anon>", innerKind: typeof innerType, innerHasProtoRender: !!innerType?.prototype?.render }); } catch {}
        }
      } catch (e) {
        try { (globalThis as any).console?.warn?.("[DS][menu] thin-wrapper unwrap failed", e); } catch {}
      }
    }
    // No-op HOC — the LibraryContextMenu prototype patch installed by
    // `installLibraryContextMenuPatch` is the sole injection path now.
    // The HOC used to also patch the inner class's render, but the
    // double-patching conflicted with the outer chain (both mutating
    // the same prototype) and broke commits across menu re-opens.
    const cached = wrappedComponents.get(inner);
    if (cached) return cached;
    const wrapped = function DSPatchedAppContextMenu(props: any) {
      return (inner as any)(props);
    };
    wrappedComponents.set(inner, wrapped);
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] HOC wrapper created (function)", { name: inner.name ?? inner?.displayName ?? "<anon>" }); } catch {}
    return wrapped;
  }

  if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] no patch path matched — captured component is neither memo/forwardRef/class/function", { kind: typeof inner, $$typeof: inner?.$$typeof?.toString?.(), name: inner?.name ?? inner?.displayName }); } catch {}
  return inner;
}

function getDFL(): any {
  return (globalThis as any).DFL ?? (globalThis as any).deckyFrontendLib ?? (globalThis as any).window?.DFL;
}

function getSPDocument(): Document {
  return getPreferredSteamDocument();
}

/**
 * Steam's native game-card `onMenuButton` handler builds the
 * `{overview, client, …}` AppContextMenu element via either
 * `React.createElement` (older Steam builds, mixed code paths) or the
 * React 18 JSX runtime `SP_JSX.jsx` / `SP_JSX.jsxs` (every recent build,
 * including BOTH SteamOS 3.7.21 stable AND 3.8/3.9 — confirmed via CDP).
 *
 * Patching only `React.createElement` (as the v1.x series did) silently
 * misses the JSX-runtime path, leaving `cachedComponent` null forever and
 * forcing the menu into the DFL fallback. This helper installs hooks on
 * all three primitives under a single capture flag and returns a
 * `restore()` plus a getter for the captured component + sanitised
 * template props. Idempotent: the same `onCapture` callback fires on
 * whichever primitive Steam happens to use.
 */
function installCaptureHooks(): {
  getCaptured: () => { component: any; templateProps: Record<string, any> } | null;
  restore: () => void;
} {
  const React = getSteamReact();
  const jsxRuntime: any = (globalThis as any).SP_JSX;

  const origCreateElement: any = React?.createElement;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;

  let captured: { component: any; templateProps: Record<string, any> } | null = null;

  const captureFromArgs = (type: any, props: any) => {
    if (captured) return;
    // Accept any component type — modern Steam wraps `AppContextMenu` in
    // `React.memo` (an object with `$$typeof === Symbol.for('react.memo')`)
    // or `React.forwardRef`, so the previous `typeof type !== "function"`
    // gate silently rejected the real captures and forced every shelf-card
    // menu into the DFL fallback. The `overview + client` props signature is
    // unique to `AppContextMenu`, so it's a sufficient filter on its own.
    if (!type) return;
    if (!props || !("overview" in props) || !("client" in props)) return;
    const tProps = { ...props };
    delete tProps.overview;
    delete tProps.hasCustomArtwork;
    delete tProps.onChangeArtwork;
    captured = { component: type, templateProps: tProps };
  };

  if (React && typeof origCreateElement === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      captureFromArgs(type, props);
      return origCreateElement.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof origJsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      captureFromArgs(type, props);
      return origJsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof origJsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      captureFromArgs(type, props);
      return origJsxs.call(jsxRuntime, type, props, key);
    };
  }

  return {
    getCaptured: () => captured,
    restore: () => {
      if (React && typeof origCreateElement === "function") React.createElement = origCreateElement;
      if (jsxRuntime && typeof origJsx === "function") jsxRuntime.jsx = origJsx;
      if (jsxRuntime && typeof origJsxs === "function") jsxRuntime.jsxs = origJsxs;
    },
  };
}

/**
 * Resolve the card anchor across every Steam window we know about. DS cards
 * live in the GamepadUI popup while the plugin bundle (and the menu
 * interceptor) runs in SharedJSContext — querying only the preferred doc
 * misses the card and the context menu ends up anchored to <body>, which
 * DFL renders off-screen.
 *
 * Used only by the modern (3.8+) path. The legacy (≤ 3.7) flow does its
 * own single-document anchor lookup inline in `showGameMenuLegacy`.
 */
function findCardAnchor(appid: number): { doc: Document; el: HTMLElement } | null {
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

/**
 * Prewarm the context-menu cache shortly after plugin mount. On cold start
 * (Steam restart), the native library panels may not be rendered yet when the
 * plugin first mounts, so the first extraction attempt fails and the menu
 * button stops responding until the user manually opens a native menu. This
 * function retries extraction at 500ms / 1500ms / 3500ms / 7000ms, bypassing
 * the normal cooldown. Idempotent: stops once the cache is populated.
 *
 * Extraction is attempted regardless of SteamOS version — empirically, some
 * 3.9+ builds still render the `{overview, client}` template, so skipping by
 * version was causing false negatives where the real menu was available.
 * If extraction fails on every retry, showGameMenu silently falls through to
 * the DFL menu (Play / Properties / View Details).
 */
export function prewarmMenuExtraction(): () => void {
  if (cachedMenuComponent) return () => {};
  // Skip on legacy (≤ 3.7): the flow extracts lazily on the first
  // MENU press; firing 5 staggered extractions on cold boot hit a race in
  // 3.7's overlay timing where the panels iteration finds the right fiber
  // but the synthetic `onMenuButton` call mutates `lastExtractionAttempt`
  // before the user ever interacts.
  if (useLegacyMenuFlow()) return () => {};
  // Early 150ms tick runs before `recentsReplace` overwrites the native
  // card content on most devices, so we can capture the native
  // `{overview, client}` menu factory before the overlay injection.
  const delays = [150, 500, 1500, 3500, 7000];
  const timers: any[] = [];
  for (const ms of delays) {
    timers.push(setTimeout(() => {
      if (cachedMenuComponent) return;
      lastExtractionAttempt = 0; // bypass cooldown — we want every delay to actually try
      try { extractAppContextMenu(); } catch {}
    }, ms));
  }
  return () => { for (const t of timers) clearTimeout(t); };
}

export function installPassiveMenuHook(): void {
  if (passiveHookInstalled || cachedMenuComponent) return;
  const React = getSteamReact();
  const jsxRuntime: any = (globalThis as any).SP_JSX;
  if (!React?.createElement && typeof jsxRuntime?.jsx !== "function") return;

  // Persistent passive hook — captures the {overview, client} template the
  // first time ANY native game menu is opened. Self-uninstalls on first
  // capture to avoid persistent overhead on every createElement call.
  const origCreateElement: any = React?.createElement;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;

  const tryCapture = (type: any, props: any) => {
    if (cachedMenuComponent) return false;
    if (!type) return false;
    if (!props || !("overview" in props) || !("client" in props)) return false;
    cachedMenuComponent = type;
    const tProps = { ...props };
    delete tProps.overview;
    delete tProps.hasCustomArtwork;
    delete tProps.onChangeArtwork;
    cachedMenuTemplateProps = tProps;
    if (React && typeof origCreateElement === "function") React.createElement = origCreateElement;
    if (jsxRuntime && typeof origJsx === "function") jsxRuntime.jsx = origJsx;
    if (jsxRuntime && typeof origJsxs === "function") jsxRuntime.jsxs = origJsxs;
    passiveHookInstalled = false;
    try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
    return true;
  };

  if (React && typeof origCreateElement === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      tryCapture(type, props);
      return origCreateElement.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof origJsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      tryCapture(type, props);
      return origJsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof origJsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      tryCapture(type, props);
      return origJsxs.call(jsxRuntime, type, props, key);
    };
  }
  passiveHookInstalled = true;
}

/**
 * Persistent hook on `DFL.showContextMenu` that captures the native menu
 * component whenever Steam opens a context menu for a game — covers paths
 * the `React.createElement` capture misses (e.g. showContextMenu invoked
 * via internal Steam code that constructs the element before we installed
 * the createElement hook). Stays installed for the life of the session;
 * the guard `cachedMenuComponent` makes the capture a single-shot, the
 * wrapper itself just passes through after that.
 */
export function installPassiveShowContextMenuHook(): void {
  if (showContextMenuHookInstalled) return;
  // Legacy (≤ 3.7): rely on the React.createElement hook only. The DFL
  // showContextMenu wrapper was added for 3.8/3.9-only paths where Steam
  // sometimes constructs the menu element via a module-bound reference
  // before the createElement hook installs; pre-3.8 the createElement
  // capture is sufficient on its own.
  if (useLegacyMenuFlow()) return;
  const dfl = getDFL();
  if (!dfl || typeof dfl.showContextMenu !== "function") return;
  const orig = dfl.showContextMenu;
  dfl.showContextMenu = function (element: any, anchor: any, ...rest: any[]) {
    try {
      if (!cachedMenuComponent && element && typeof element.type === "function") {
        const props = element.props ?? {};
        if ("overview" in props && "client" in props) {
          cachedMenuComponent = element.type;
          const tProps = { ...props };
          delete tProps.overview;
          delete tProps.hasCustomArtwork;
          delete tProps.onChangeArtwork;
          cachedMenuTemplateProps = tProps;
          // See tryCapture in installPassiveMenuHook — patch on capture so
          // native renders also gain DS items via resolveShelfIdFromProps.
          try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
        }
      }
    } catch {}
    return orig.apply(this, [element, anchor, ...rest]);
  };
  showContextMenuHookInstalled = true;
}

/**
 * Pure v1.2.0 extraction port — used only on SteamOS ≤ 3.7. Identical
 * iteration / fiber walk / React.createElement hook as the original; uses
 * its own cache (`legacyCachedComponent` / `legacyCachedTemplateProps`)
 * so the modern path can't poison it and vice-versa.
 *
 * No prewarm, no DFL.showContextMenu hook, no cross-window walk, no
 * `getBoundingClientRect` rect filter, no cooldown bypass tricks — just
 * the same code that worked on 3.7.21 in the v1.2/v1.3/v1.4 series.
 */
function extractAppContextMenuLegacy(): boolean {
  if (legacyCachedComponent) return true;
  const now = Date.now();
  if (now - legacyLastAttempt < EXTRACTION_COOLDOWN) return false;
  legacyLastAttempt = now;

  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;

  const panels = doc.querySelectorAll(".Panel.Focusable");
  let menuFn: ((e: any) => void) | null = null;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const cls = panel.className ?? "";
    if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) continue;
    if (!panel.querySelector("img")) continue;

    const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    let fiber = (panel as any)[fiberKey];

    for (let d = 0; d < 25 && fiber; d++) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (typeof props.onMenuButton === "function") {
        menuFn = props.onMenuButton;
        break;
      }
      fiber = fiber.return;
    }
    if (menuFn) break;
  }

  if (!menuFn) return false;

  const hooks = installCaptureHooks();
  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    hooks.restore();
  }

  const captured = hooks.getCaptured();
  if (captured) {
    legacyCachedComponent = captured.component;
    legacyCachedTemplateProps = captured.templateProps;
    // Patch on capture so SteamOS ≤ 3.7 native renders also gain DS items
    // via resolveShelfIdFromProps' DOM lookup. Same rationale as the modern
    // path; the legacy and modern caches are independent.
    try { getInjectedMenuComponent(legacyCachedComponent); } catch {}
    return true;
  }

  return false;
}

/**
 * Pure v1.2.0 render port. Returns `true` if the native menu was rendered
 * (so the caller can skip the DFL fallback), `false` if extraction failed
 * even after the recursive retry — caller falls through to DFL fallback.
 */
function showGameMenuLegacy(appid: number, shelfId?: string): boolean {
  if (!legacyCachedComponent) extractAppContextMenuLegacy();

  const React = getSteamReact();
  const appStore = getAppStore();

  if (React && appStore && legacyCachedComponent) {
    try {
      const overview = appStore.GetAppOverviewByAppID?.(appid);
      if (overview) {
        const doc = getSPDocument();
        const cardEl = (doc.querySelector(`.ds-card[data-appid="${appid}"]`)
          ?? doc.querySelector(".ds-card.gpfocus")
          ?? doc.querySelector(".ds-card:focus")
          ?? doc.activeElement) as HTMLElement;

        const ownerWindow = (getPreferredSteamWindow() as any)
          ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
          ?? window;

        // Wrap in a fresh function each call so React treats this menu
        // as a brand-new component type (not a re-render of the previous
        // menu's type). Without this, Steam's `CreateContextMenuInstance`
        // sees the same component identity across menu opens and React's
        // reconciliation reuses the previous instance — props.children
        // mutations performed by our `cls.prototype.render` patch end up
        // in the React tree but never commit to the DOM. A fresh function
        // identity forces a full mount per menu open.
        const baseTarget = shelfId
          ? getInjectedMenuComponent(legacyCachedComponent)
          : legacyCachedComponent;
        const renderTarget = function DsFreshMenuLegacy(props: any) { return (baseTarget as any)(props); };
        const menuElement = React.createElement(renderTarget, {
          ...legacyCachedTemplateProps,
          overview,
          client: legacyCachedTemplateProps.client ?? "mostavailable",
          launchSource: legacyCachedTemplateProps.launchSource ?? 1000,
          bInGamepadUI: legacyCachedTemplateProps.bInGamepadUI ?? true,
          strCollectionId: legacyCachedTemplateProps.strCollectionId ?? "",
          ownerWindow: ownerWindow ?? legacyCachedTemplateProps.ownerWindow,
          hasCustomArtwork: undefined,
          onChangeArtwork: undefined,
          ...(shelfId ? { _dsShelfId: shelfId } : {}),
        });

        const dfl = getDFL();
        // Stash the shelfId so the boot-time `LibraryContextMenu` patch can
        // recognise the call as ours and append the DS submenu, even when
        // the captured-component wrap path doesn't fire (memo / forwardRef
        // mismatch). Auto-cleared after a tick.
        if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
        if (dfl?.showContextMenu) {
          dfl.showContextMenu(menuElement, cardEl);
        } else {
          showContextMenu(menuElement, cardEl as any);
        }
        return true;
      }
    } catch {
      legacyCachedComponent = null;
      legacyCachedTemplateProps = {};
    }
  }

  // v1.2.0 recursive retry: if extraction was empty, force a re-attempt
  // (cooldown bypass) and recurse exactly once. The outer `showGameMenu`
  // wraps this in `showGameMenuActive`, so we cannot loop indefinitely.
  if (!legacyCachedComponent) {
    legacyLastAttempt = 0;
    extractAppContextMenuLegacy();
    if (legacyCachedComponent) {
      return showGameMenuLegacy(appid, shelfId);
    }
  }

  return false;
}

export function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;

  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;

  // Match v1.4.0 behavior: iterate every visible Panel.Focusable with an
  // image and a `__reactFiber$` — no `nativeRecents.contains(panel)` filter.
  // The nativeRecents exclusion was added later thinking it'd be safer, but
  // it excluded the exact wrappers that host the native `onMenuButton`
  // when recents-replace is active — killing extraction.
  const panels = doc.querySelectorAll(".Panel.Focusable");
  let menuFn: ((e: any) => void) | null = null;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const cls = panel.className ?? "";
    if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) continue;
    if (!panel.querySelector("img")) continue;
    const rect = (panel as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    let fiber = (panel as any)[fiberKey];

    for (let d = 0; d < 25 && fiber; d++) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (typeof props.onMenuButton === "function") {
        menuFn = props.onMenuButton;
        break;
      }
      fiber = fiber.return;
    }
    if (menuFn) break;
  }

  if (!menuFn) return false;

  // Hook React.createElement + SP_JSX.jsx/jsxs together — both 3.7.21 and
  // 3.8/3.9 emit the {overview, client} menu via the JSX runtime form
  // (`SP_JSX.jsx`), not `React.createElement`. Patching only createElement
  // (the original strategy) silently misses the modern path too, even on
  // 3.9. Confirmed via CDP on both versions.
  //
  // We do NOT stub `dfl.showContextMenu` here (that was added later
  // thinking it'd prevent a brief native-menu flash during extraction, but
  // the handler's `showContextMenu` call often resolves to a module-bound
  // reference that doesn't go through `dfl`, so the stub is a no-op at best
  // and breaks capture ordering at worst).
  const hooks = installCaptureHooks();
  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    hooks.restore();
  }

  const captured = hooks.getCaptured();
  if (captured) {
    cachedMenuComponent = captured.component;
    cachedMenuTemplateProps = captured.templateProps;
    passiveHookInstalled = false;
    // See tryCapture in installPassiveMenuHook — patch on capture so
    // native renders also gain DS items via resolveShelfIdFromProps.
    try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
    return true;
  }

  return false;
}

/**
 * Public wrapper for `buildDeckShelvesMenuItems` — used by `Shelf.tsx`
 * (online shelf card menu) to get the standard DS menu structure without
 * opening a native Steam menu. Returns an empty array when the shelf can't
 * be resolved.
 */
export function buildShelfContextMenu(shelfId: string, appid: number, dfl: any, R: any): any[] {
  return buildDeckShelvesMenuItems(shelfId, dfl, R, appid);
}

/**
 * Library-card Add/Remove-to-shelf injection. Emits up to two groups for
 * the supplied appid:
 *   - "Adicionar à prateleira" — every regular shelf that could accept
 *     the appid (skips shelves that already contain it, at their
 *     per-shelf limit, or past the 50-entry absolute cap).
 *   - "Remover da prateleira" — every regular shelf whose manualOrder
 *     currently contains the appid.
 *
 * Returns `[]` when neither group has any candidates (avoids inserting
 * empty groups into Steam's native menu).
 */
export function buildLibraryAddToShelfItems(appid: number, dfl: any, R: any): any[] {
  if (!dfl?.MenuItem || !dfl?.MenuGroup || !R?.createElement) return [];
  if (!appid) return [];
  const s = getCurrentSettings?.();
  if (!s) return [];
  const ABSOLUTE_MAX = 50;
  const eligible: any[] = (s.shelves ?? []).filter((sh: any) => {
    const manual: number[] = sh.manualOrder ?? [];
    if (manual.includes(appid)) return false;
    const cap = Math.min(typeof sh.limit === "number" ? sh.limit : ABSOLUTE_MAX, ABSOLUTE_MAX);
    if (manual.length >= cap) return false;
    return true;
  });
  const removable: any[] = (s.shelves ?? []).filter((sh: any) => (sh.manualOrder ?? []).includes(appid));
  if (!eligible.length && !removable.length) return [];
  const lblFn = (key: string, fallback: string): string => {
    try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
  };
  const item = (key: string, label: string, onSelected: () => void) =>
    R.createElement(dfl.MenuItem, { key, onSelected }, label);

  const groups: any[] = [];
  if (eligible.length > 0) {
    const addChildren = eligible.map((sh: any) => item(
      `ds-lib-add-${sh.id}`,
      sh.title ?? sh.id,
      () => {
        const cur = getCurrentSettings();
        if (!cur) return;
        const tgt: any = (cur.shelves ?? []).find((row: any) => row.id === sh.id);
        if (!tgt) return;
        const manual: number[] = tgt.manualOrder ?? [];
        const wasManual = tgt.sort === "manual";
        const patch: Record<string, any> = {
          sort: "manual",
          sortReverse: false,
          manualOrder: [...manual, appid],
        };
        if (!wasManual) patch.manualBaseSort = typeof tgt.sort === "string" ? tgt.sort : "alphabetical";
        void saveSettings(patchShelfInSettings(cur, sh.id, patch));
      },
    ));
    groups.push(R.createElement(dfl.MenuGroup, { key: "ds-lib-add-shelf", label: lblFn("menu_add_to_shelf", "Add to shelf") }, ...addChildren));
  }
  if (removable.length > 0) {
    const rmChildren = removable.map((sh: any) => item(
      `ds-lib-rm-${sh.id}`,
      sh.title ?? sh.id,
      () => {
        const cur = getCurrentSettings();
        if (!cur) return;
        const tgt: any = (cur.shelves ?? []).find((row: any) => row.id === sh.id);
        if (!tgt) return;
        const manual: number[] = tgt.manualOrder ?? [];
        void saveSettings(patchShelfInSettings(cur, sh.id, {
          manualOrder: manual.filter((id) => id !== appid),
        }));
      },
    ));
    groups.push(R.createElement(dfl.MenuGroup, { key: "ds-lib-remove-shelf", label: lblFn("menu_remove_from_shelf", "Remove from shelf") }, ...rmChildren));
  }
  return groups;
}

export function showGameMenu(appid: number, shelfId?: string): void {
  if (showGameMenuActive) return;
  showGameMenuActive = true;
  try {
    // Legacy (SteamOS ≤ 3.7): pure v1.2.0 port with its own cache, recursive
    // retry, single-document anchor lookup. If it succeeds it returns; if
    // extraction fails after the recursive retry, fall through to the
    // shared DFL fallback below. The modern path is never touched on legacy
    // devices, so the two caches stay independent.
    if (useLegacyMenuFlow()) {
      try {
        if (showGameMenuLegacy(appid, shelfId)) return;
      } catch {
        legacyCachedComponent = null;
        legacyCachedTemplateProps = {};
      }
    } else {
    // Native-menu path: extraction + cached component render. Wrapped in its
    // own try so any failure (extraction crash, component render error) falls
    // through to the DFL fallback menu rather than bubbling up to the caller.
    try {
      installPassiveMenuHook();
      if (!cachedMenuComponent) extractAppContextMenu();

      const React = getSteamReact();
      const appStore = getAppStore();

      {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (React && appStore && cachedMenuComponent) {
            try {
              const overview = appStore.GetAppOverviewByAppID?.(appid);
              if (overview) {
                const anchor = findCardAnchor(appid);
                const cardEl = (anchor?.el
                  ?? getSPDocument().activeElement) as HTMLElement;

                const ownerWindow = (anchor?.doc.defaultView as any)
                  ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
                  ?? (getPreferredSteamWindow() as any)
                  ?? window;

                // Wrap in a fresh function per call (see legacy path above
                // for the rationale): forces React + Steam's context menu
                // manager to mount the menu fresh instead of reusing the
                // previous instance, so afterPatch mutations on
                // `prototype.render`'s output reach the DOM for every menu
                // open, not just the first.
                const baseTarget = shelfId
                  ? getInjectedMenuComponent(cachedMenuComponent)
                  : cachedMenuComponent;
                const renderTarget = function DsFreshMenu(props: any) { return (baseTarget as any)(props); };
                const menuElement = React.createElement(renderTarget, {
                  ...cachedMenuTemplateProps,
                  overview,
                  client: cachedMenuTemplateProps.client ?? "mostavailable",
                  launchSource: cachedMenuTemplateProps.launchSource ?? 1000,
                  bInGamepadUI: cachedMenuTemplateProps.bInGamepadUI ?? true,
                  strCollectionId: cachedMenuTemplateProps.strCollectionId ?? "",
                  ownerWindow: ownerWindow ?? cachedMenuTemplateProps.ownerWindow,
                  hasCustomArtwork: undefined,
                  onChangeArtwork: undefined,
                  ...(shelfId ? { _dsShelfId: shelfId } : {}),
                });

                const dfl = getDFL();
                if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
                if (dfl?.showContextMenu) {
                  dfl.showContextMenu(menuElement, cardEl);
                } else {
                  showContextMenu(menuElement, cardEl as any);
                }
                return;
              }
            } catch {
              cachedMenuComponent = null;
              cachedMenuTemplateProps = {};
            }
          }

          if (attempt === 0 && !cachedMenuComponent) {
            lastExtractionAttempt = 0;
            extractAppContextMenu();
          } else {
            break;
          }
        }
      }
    } catch {
      cachedMenuComponent = null;
      cachedMenuTemplateProps = {};
    }
    }

    try {
      const dfl = getDFL();
      const R = getSteamReact();
      const appStore = getAppStore();
      if (dfl?.showContextMenu && R && dfl.Menu && dfl.MenuItem) {
        const anchor = findCardAnchor(appid);
        const cardEl = (anchor?.el ?? getSPDocument().activeElement) as HTMLElement;
        const overview = appStore?.GetAppOverviewByAppID?.(appid);
        const installed = overview?.installed === true;
        const nav = dfl.Navigation ?? (globalThis as any).SteamClient?.Navigation;
        const sc: any = (globalThis as any).SteamClient;
        // Use the bundle's own i18next instance (the host's `globalThis.i18next`
        // doesn't have our keys, so the previous lookup always fell back to
        // English).
        const lbl = (key: string, fallback: string) => {
          try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
        };
        const items: any[] = [];
        if (installed && typeof sc?.Apps?.RunGame === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "play",
            onSelected: () => { try { sc?.Apps?.RunGame(String(appid), "", -1, 1); } catch {} },
          }, lbl("menu_play", "Play")));
        }
        if (typeof nav?.NavigateToAppProperties === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "properties",
            onSelected: () => { try { nav.NavigateToAppProperties(appid); } catch {} },
          }, lbl("menu_properties", "Properties")));
        }
        // Verify integrity + Uninstall — both gated on installed && API present.
        // Same SteamClient calls Steam itself uses, so behaviour matches the
        // discovered native menu when those entries are picked.
        if (installed && typeof sc?.Apps?.VerifyApp === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "verify",
            onSelected: () => { try { sc?.Apps?.VerifyApp?.(appid); } catch {} },
          }, lbl("menu_verify_integrity", "Verify integrity of installed files")));
        }
        if (installed && typeof sc?.Apps?.UninstallApps === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "uninstall",
            tone: "destructive",
            onSelected: () => { try { sc?.Apps?.UninstallApps?.([appid], false); } catch {} },
          }, lbl("menu_uninstall", "Uninstall")));
        }
        // Browse local screenshots — works even when the game is uninstalled
        // as long as Steam still has them indexed.
        if (typeof sc?.Apps?.BrowseScreenshotsForApp === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "screenshots",
            onSelected: () => { try { sc?.Apps?.BrowseScreenshotsForApp?.(String(appid)); } catch {} },
          }, lbl("menu_browse_screenshots", "Browse screenshots")));
        }
        items.push(R.createElement(dfl.MenuItem, {
          key: "details",
          onSelected: () => {
            try { (nav?.Navigate ?? sc?.Browser?.Navigate)?.(`/library/app/${appid}`); } catch {}
          },
        }, lbl("menu_view_details", "View Details")));
        // Append the Deck Shelves submenu (with a separator) when this
        // fallback runs from a shelf-card press — same actions appear here
        // and on the discovered native menu via the afterPatch seam.
        if (shelfId) {
          const dsItems = buildDeckShelvesMenuItems(shelfId, dfl, R, appid);
          if (dsItems.length && dfl.MenuSeparator) {
            items.push(R.createElement(dfl.MenuSeparator, { key: "ds-sep" }));
          }
          for (const it of dsItems) items.push(it);
        }
        // Title: prefer Steam's overview name; for online-shelf games (no
        // Steam overview) fall back to the DS card's own label text so the
        // menu shows the game name instead of a generic placeholder.
        const dsCardName = (() => {
          try {
            const n = cardEl?.querySelector?.('.ds-card-label-name')?.textContent?.trim();
            return n || null;
          } catch { return null; }
        })();
        const menu = R.createElement(dfl.Menu, { label: overview?.display_name || dsCardName || "Game" }, ...items);
        dfl.showContextMenu(menu, cardEl);
      }
    } catch {}
  } finally {
    showGameMenuActive = false;
  }
}
