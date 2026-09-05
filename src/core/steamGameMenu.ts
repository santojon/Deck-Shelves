import { showContextMenu, findModuleChild, findModuleByExport, fakeRenderComponent, afterPatch as hostAfterPatch, findInTree as hostFindInTree } from "../runtime/host/decky";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { isSteamOS38OrLater } from "./steamOSVersion";
import i18n from "../i18n";
import { saveFocusTarget } from "./focusRestore";
import {
  buildDeckShelvesMenuItems as buildDeckShelvesMenuItemsBase,
  buildShelfContextMenu,
  buildLibraryAddToShelfItems,
} from "./menu/itemBuilders";

export { buildShelfContextMenu, buildLibraryAddToShelfItems };

/* Thin wrapper around the extracted builder — injects the module-global
   focused-card context (`_activeAppIdForMenu` / `_activeCardIndexForMenu`)
   so existing call sites don't have to forward those values. Signature
   matches the pre-extraction local function. */
function buildDeckShelvesMenuItems(shelfId: string, fl: any, R: any, appid?: number): any[] {
  return buildDeckShelvesMenuItemsBase(shelfId, fl, R, appid, _activeAppIdForMenu, _activeCardIndexForMenu);
}

/* Only a SteamOS build confirmed older than 3.8 uses the legacy menu flow.
   Unknown / non-SteamOS hosts (Windows, macOS, desktop-Linux Steam —
   getSteamOSVersion() is null there, so isSteamOS38OrLater() is null, not false)
   fall through to the MODERN flow, which is correct for every current client. */
function isLegacyMenuFlow(): boolean {
  return isSteamOS38OrLater() === false;
}

let cachedMenuComponent: any = null;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

/* Independent legacy (≤ 3.7) cache — never shared with the modern path.
   Sharing the cache would let a partially-corrupted modern extraction
   poison the legacy fallback (and vice-versa). Two distinct sets of state
   also let us run the v1.2.0 recursive retry without disturbing modern
   runs interleaved on the same session. */
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

// Direct webpack patch of LibraryContextMenu.prototype.render. Gated
// on _activeShelfIdForMenu so native cards aren't affected.
let _libraryContextMenuClass: any = null;
let _libraryContextMenuPatched = false;
let _hltbDiscoveryAttempted = false;
let _activeShelfIdForMenu: string | null = null;
let _activeAppIdForMenu: number = 0;
let _activeCardIndexForMenu: number = -1;
function collectKnownDocsForMenu(): Document[] {
  const docs: Document[] = [];
  try { docs.push(document); } catch {}
  try {
    const w = (globalThis as any).GamepadUIMainWindowStore?.BrowserView?.m_browser?.gamepadui?.document;
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

function setActiveShelfIdForMenu(id: string | null, appid?: number): void {
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

function resolveShelfIdFromProps(props: any): string | null {
  if (_activeShelfIdForMenu) return _activeShelfIdForMenu;
  const explicit = props?._dsShelfId;
  if (typeof explicit === "string" && explicit) return explicit;
  const appid = props?.overview?.appid;
  return appid ? findShelfIdInDom(appid) : null;
}

function discoverViaModuleByExport(): any {
  try {
    const m = findModuleByExport((e: any) =>
      e?.toString && typeof e.toString === "function" && e.toString().includes("().LibraryContextMenu"));
    if (!m) return null;
    const wrapper = Object.values(m).find((sibling: any) =>
      sibling?.toString && sibling.toString().includes("navigator:"));
    const rendered = wrapper ? fakeRenderComponent(wrapper as any) : null;
    return rendered?.type ?? null;
  } catch { return null; }
}

function discoverViaModuleChildLegacy(): any {
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
            sibling.toString().includes("navigator:"));
        }
      }
      return undefined;
    });
    const rendered = wrapper ? fakeRenderComponent(wrapper) : null;
    return rendered?.type ?? null;
  } catch { return null; }
}

function discoverLibraryContextMenuClass(): any {
  if (_libraryContextMenuClass || _hltbDiscoveryAttempted) return _libraryContextMenuClass;
  _hltbDiscoveryAttempted = true;
  _libraryContextMenuClass = discoverViaModuleByExport() ?? discoverViaModuleChildLegacy();
  return _libraryContextMenuClass;
}

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

function isGameContextMenuItems(items: any[], fl: any): boolean {
  if (!Array.isArray(items) || !items.length) return false;
  if (!fl?.findInReactTree) return false;
  try {
    return !!fl.findInReactTree(items, (x: any) => {
      const fn = x?.props?.onSelected;
      if (typeof fn !== "function") return false;
      const src = fn.toString();
      return src.includes("launchSource") || src.includes("AppProperties");
    });
  } catch { return false; }
}

const DS_ROOT_KEYS = new Set([
  "ds-deck-shelves", "ds-shelf-root",
  "ds-card-highlight", "ds-card-hide",
  /* Add/Remove-shelf groups (both the in-shelf and library-card paths).
     Missing these from the dedup set caused the "Add to shelf" submenu
     to inject twice on shelves where both the boot-patch render and the
     shouldComponentUpdate hook fired against the same menu instance. */
  "ds-card-add-shelf", "ds-card-remove-shelf",
  "ds-lib-add-shelf", "ds-lib-remove-shelf",
  // Synthetic-card top-level decoration shortcut (when the user opens
  // the menu on a decoration card from showSyntheticCardMenu).
  "ds-syn-decoration-top",
  "ds-sep-boot",
]);
function dedupDsMenuItems(items: any[]): void {
  if (!Array.isArray(items)) return;
  for (let i = items.length - 1; i >= 0; i--) {
    const k = items[i]?.key;
    if (typeof k !== "string") continue;
    /* Exact match on group-level keys + prefix match on the per-shelf
       flat items the library-card path emits (one MenuItem per shelf,
       key like `ds-lib-add-s_7b1a8487`). Without the prefix check, the
       flat items accumulated across re-renders. */
    if (DS_ROOT_KEYS.has(k) || k.startsWith("ds-lib-add-") || k.startsWith("ds-lib-rm-") || k.startsWith("ds-card-add-") || k.startsWith("ds-card-rm-")) {
      items.splice(i, 1);
    }
  }
}

function spliceDsItems(items: any[], dsItems: any[], fl: any, R: any): void {
  if (!Array.isArray(items) || !dsItems.length) return;
  const sep = fl?.MenuSeparator ? R.createElement(fl.MenuSeparator, { key: "ds-sep-boot" }) : null;
  let insertAt = -1;
  try {
    insertAt = items.findIndex((item: any) =>
      fl.findInReactTree?.(item, (x: any) =>
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

/* Tracks inner-type prototypes that already have render + shouldComponentUpdate
   patched. Steam uses a different inner class for installed Steam games vs
   uninstalled games vs non-Steam shortcuts — patching only the first one
   encountered leaves the others uninjected. WeakSet lets the patches persist
   across renders without leaking when types are GC'd. */
const _patchedInnerTypes = new WeakSet<any>();

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

function appidFromMenuOwner(menuItems: any[]): number {
  try {
    const parent = menuItems.find((x: any) => x?._owner?.pendingProps?.overview?.appid);
    return parent ? Number(parent._owner.pendingProps.overview.appid) || 0 : 0;
  } catch { return 0; }
}

function appidFromSelfProps(self: any): number {
  try { return Number(self?.props?.overview?.appid) || 0; } catch { return 0; }
}

function appidFromTreeFallback(menuItems: any[]): number {
  try {
    const foundApp: any = hostFindInTree(menuItems, (x: any) => x?.app?.appid, { walkable: ["props", "children"] } as any);
    return foundApp?.app?.appid ? Number(foundApp.app.appid) || 0 : 0;
  } catch { return 0; }
}

function resolveAppidFromMenuChildren(menuItems: any[], self: any): number {
  return appidFromMenuOwner(menuItems) || appidFromSelfProps(self) || appidFromTreeFallback(menuItems);
}

function spliceLibraryOrShelfItems(menuItems: any[], curAppid: number, curShelfId: string | null, fl: any, R: any): void {
  if (!curShelfId) {
    if (curAppid <= 0) return;
    const libItems = buildLibraryAddToShelfItems(curAppid, fl, R);
    if (libItems.length) spliceDsItems(menuItems, libItems, fl, R);
    return;
  }
  const items = buildDeckShelvesMenuItems(curShelfId, fl, R, curAppid);
  if (items.length) spliceDsItems(menuItems, items, fl, R);
}

function injectIntoMenuItems(menuItems: any[], self: any, dedupBefore: boolean): void {
  const fl = getFrontendLib();
  const R = getSteamReact();
  if (!fl || !R) return;
  if (!isGameContextMenuItems(menuItems, fl)) return;
  if (dedupBefore) dedupDsMenuItems(menuItems);
  const curAppid = resolveAppidFromMenuChildren(menuItems, self);
  const curShelfId = resolveShelfIdByAppid(curAppid);
  if (!dedupBefore) dedupDsMenuItems(menuItems);
  spliceLibraryOrShelfItems(menuItems, curAppid, curShelfId, fl, R);
}

function installInnerRenderPatch(prototype: any): void {
  try {
    hostAfterPatch(prototype, "render", function (this: any, _b: any, ret2: any) {
      try {
        const menuItems = findMenuItemsArray(ret2);
        if (menuItems) injectIntoMenuItems(menuItems, this, true);
      } catch (e) {
        try { (globalThis as any).console?.warn?.("[DS][menu] inner render patch threw", e); } catch {}
      }
      return ret2;
    });
  } catch {}
}

function installShouldComponentUpdatePatch(prototype: any): void {
  if (typeof prototype.shouldComponentUpdate !== "function") return;
  try {
    hostAfterPatch(prototype, "shouldComponentUpdate", function (this: any, args: any[], shouldUpdate: any) {
      try {
        if (shouldUpdate !== true) return shouldUpdate;
        const nextChildren = findMenuItemsArray({ props: args?.[0] });
        if (nextChildren) injectIntoMenuItems(nextChildren, this, false);
      } catch (e) {
        try { (globalThis as any).console?.warn?.("[DS][menu] inner sCU patch threw", e); } catch {}
      }
      return shouldUpdate;
    });
  } catch {}
}

function patchDeepestRender(prototype: any): void {
  if (!prototype || typeof prototype.render !== "function") return;
  installInnerRenderPatch(prototype);
  installShouldComponentUpdatePatch(prototype);
}

export function isLibraryContextMenuPatched(): boolean {
  return _libraryContextMenuPatched;
}

export function installLibraryContextMenuPatch(): void {
  if (_libraryContextMenuPatched) return;
  const cls = discoverLibraryContextMenuClass();
  if (!cls?.prototype?.render || typeof hostAfterPatch !== "function") return;
  // Debug tap — bumped every time the outer patch fires + the path it
  // took. Surfaced through `window.deckShelves.debug` so we can verify
  // via CDP whether the patch is reaching library cards at all.
  ensureDebugBucket();
  setDebugCounter("lcmPatched", true);
  setDebugCounter("lcmRenderCalls", 0);
  setDebugCounter("lcmLibraryCalls", 0);
  setDebugCounter("lcmShelfCalls", 0);
  setDebugCounter("lcmNoAppid", 0);
  setDebugCounter("lcmNoChildren", 0);
  setDebugCounter("lcmSplicedLib", 0);
  try {
    hostAfterPatch(cls.prototype, "render", makeLcmRenderHandler());
    _libraryContextMenuPatched = true;
  } catch {}
}

type DebugBucket = Record<string, number | boolean>;

function getDebugBucket(): DebugBucket | null {
  try {
    const ds = (globalThis as any).deckShelves;
    if (!ds) return null;
    if (!ds.debug) ds.debug = {};
    return ds.debug as DebugBucket;
  } catch { return null; }
}

function ensureDebugBucket(): void {
  try {
    const g: any = (globalThis as any);
    if (!g.deckShelves) return; // not installed yet — debug fields no-op
    if (!g.deckShelves.debug) g.deckShelves.debug = {};
  } catch {}
}

function setDebugCounter(key: string, value: number | boolean): void {
  const bucket = getDebugBucket();
  if (bucket) bucket[key] = value;
}

function bumpDebugCounter(key: string): void {
  const bucket = getDebugBucket();
  if (!bucket) return;
  const cur = bucket[key];
  bucket[key] = (typeof cur === "number" ? cur : 0) + 1;
}

function appidFromOwnerProps(component: any): number {
  try {
    return Number(component?._owner?.pendingProps?.overview?.appid) || 0;
  } catch { return 0; }
}

function appidFromComponentTree(component: any): number {
  try {
    const foundApp: any = hostFindInTree(component?.props?.children, (x: any) => x?.app?.appid, { walkable: ["props", "children"] } as any);
    return Number(foundApp?.app?.appid) || 0;
  } catch { return 0; }
}

function appidFromComponent(component: any, self: any): number {
  return appidFromOwnerProps(component) || appidFromSelfProps(self) || appidFromComponentTree(component);
}

function installInnerTypePatch(component: any): void {
  try {
    hostAfterPatch(component, "type", (_a: any, ret: any) => {
      try {
        if (ret?.type?.prototype && typeof ret.type.prototype.render === "function" && !_patchedInnerTypes.has(ret.type)) {
          _patchedInnerTypes.add(ret.type);
          patchDeepestRender(ret.type.prototype);
        }
      } catch {}
      return ret;
    });
  } catch {}
}

function spliceLcmIntoComponentChildren(component: any, appid: number, shelfId: string | null, fl: any, R: any): void {
  try {
    const targetItems = findMenuItemsArray(component);
    if (!targetItems || !isGameContextMenuItems(targetItems, fl)) { bumpDebugCounter("lcmNoChildren"); return; }
    dedupDsMenuItems(targetItems);
    if (shelfId) {
      bumpDebugCounter("lcmShelfCalls");
      const items = buildDeckShelvesMenuItems(shelfId, fl, R, appid);
      if (items.length) spliceDsItems(targetItems, items, fl, R);
    } else {
      bumpDebugCounter("lcmLibraryCalls");
      const libItems = buildLibraryAddToShelfItems(appid, fl, R);
      if (libItems.length) { spliceDsItems(targetItems, libItems, fl, R); bumpDebugCounter("lcmSplicedLib"); }
    }
  } catch {}
}

function makeLcmRenderHandler() {
  let innerInstalled = false;
  return function (this: any, _args: any[], component: any) {
    try {
      bumpDebugCounter("lcmRenderCalls");
      const appid = appidFromComponent(component, this);
      if (!appid) { bumpDebugCounter("lcmNoAppid"); return component; }
      const shelfId = resolveShelfIdByAppid(appid);
      const fl = getFrontendLib();
      const R = getSteamReact();
      if (!fl || !R) return component;
      if (!innerInstalled) { innerInstalled = true; installInnerTypePatch(component); }
      spliceLcmIntoComponentChildren(component, appid, shelfId, fl, R);
    } catch {}
    return component;
  };
}

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

function devInfo(msg: string, extra?: any): void {
  if (!__DEV__) return;
  try { (globalThis as any).console?.info?.(msg, extra); } catch {}
}

function devWarn(msg: string, extra?: any): void {
  if (!__DEV__) return;
  try { (globalThis as any).console?.warn?.(msg, extra); } catch {}
}

function containsDsItems(children: any): boolean {
  if (!Array.isArray(children)) return false;
  return children.some((c: any) => DS_ROOT_KEYS.has(c?.key));
}

function findMenuNode(rendered: any, fl: any): any {
  return fl.findInReactTree(rendered, (node: any) => {
    if (!node || typeof node !== "object" || !node.props) return false;
    if (node.type === fl.Menu) return true;
    if (typeof node.props.label !== "string") return false;
    const ch = node.props.children;
    return Array.isArray(ch) || (ch !== undefined && ch !== null);
  });
}

function toChildArray(children: any): any[] {
  if (Array.isArray(children)) return children;
  return children !== undefined && children !== null ? [children] : [];
}

function appendToMenuNode(menu: any, items: any[], shelfId: string): boolean {
  const existing = toChildArray(menu.props.children);
  if (containsDsItems(existing)) {
    devInfo("[DS][menu] inject skipped — DS items already present in Menu node", { shelfId });
    return false;
  }
  menu.props.children = [...existing, ...items];
  devInfo("[DS][menu] injected", { shelfId, label: menu.props.label, before: existing.length, added: items.length });
  return true;
}

function fallbackInjectIntoRoot(rendered: any, items: any[], fl: any, R: any, shelfId: string): void {
  const existing = rendered.props.children;
  if (containsDsItems(existing)) {
    devInfo("[DS][menu] root inject skipped — DS items already present", { shelfId });
    return;
  }
  const sep = fl.MenuSeparator ? R.createElement(fl.MenuSeparator, { key: "ds-sep-fallback" }) : null;
  if (Array.isArray(existing)) {
    if (sep) existing.push(sep);
    for (const it of items) existing.push(it);
  } else if (existing != null) {
    rendered.props.children = sep ? [existing, sep, ...items] : [existing, ...items];
  } else {
    rendered.props.children = items;
  }
  devInfo("[DS][menu] injected via root fallback", { shelfId, added: items.length });
}

function injectDeckShelvesIntoTree(rendered: any, shelfId: string): any {
  if (!rendered) { devInfo("[DS][menu] inject skipped — rendered is null"); return rendered; }
  const fl = getFrontendLib();
  const R = getSteamReact();
  if (!fl?.findInReactTree) {
    devWarn("[DS][menu] inject skipped — fl.findInReactTree unavailable");
    return rendered;
  }
  try {
    return injectItemsOrFallback(rendered, shelfId, fl, R);
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] injectDeckShelvesIntoTree threw", e); } catch {}
    return rendered;
  }
}

function injectItemsOrFallback(rendered: any, shelfId: string, fl: any, R: any): any {
  const __t = ((globalThis as any).__ds_m2 = (globalThis as any).__ds_m2 || []);
  const items = buildDeckShelvesMenuItems(shelfId, fl, R);
  __t.push("injectItems: built " + items.length + " items for shelfId=" + shelfId);
  if (!items.length) {
    devWarn("[DS][menu] no items to inject — buildDeckShelvesMenuItems returned []");
    return rendered;
  }
  const menu = findMenuNode(rendered, fl);
  let __mt = "n/a";
  try {
    const t = menu?.type;
    const ch = menu?.props?.children;
    const chArr = Array.isArray(ch) ? ch : (ch != null ? [ch] : []);
    const chKinds = chArr.slice(0, 6).map((c: any) => typeof c === "object" ? (c?.type?.name ?? c?.type?.displayName ?? typeof c?.type) : typeof c).join(",");
    __mt = "isFlMenu=" + (t === fl.Menu) + " typeName=" + (t?.name ?? t?.displayName ?? typeof t) + " childCount=" + chArr.length + " childKinds=[" + chKinds + "]";
  } catch (e) { __mt = "err " + e; }
  __t.push("injectItems: menuNode=" + (menu?.props ? "found label=" + menu.props.label + " " + __mt : "NOT FOUND"));
  if (menu?.props) { appendToMenuNode(menu, items, shelfId); __t.push("injectItems: appended to menu node"); return rendered; }
  if (rendered?.props) { fallbackInjectIntoRoot(rendered, items, fl, R, shelfId); __t.push("injectItems: root fallback"); }
  else { __t.push("injectItems: rendered has no props"); }
  return rendered;
}

// React internal type tags (stable Symbol.for handles that survive
// bundling) for detecting memo/forwardRef wrappers.
const REACT_MEMO_TYPE = typeof Symbol === "function" ? Symbol.for("react.memo") : 0xead3;
const REACT_FORWARD_REF_TYPE = typeof Symbol === "function" ? Symbol.for("react.forward_ref") : 0xead0;

function makeRenderPatchHandler(extractProps: (args: any[], self: any) => any) {
  return function (this: any, args: any[], result: any) {
    const __t = ((globalThis as any).__ds_m2 = (globalThis as any).__ds_m2 || []);
    const props = extractProps(args, this);
    const shelfId = resolveShelfIdFromProps(props);
    __t.push("renderHandler ran; shelfId=" + shelfId + " hasResult=" + !!result + " propsKeys=" + (props ? Object.keys(props).slice(0, 8).join(",") : "none"));
    return shelfId ? injectDeckShelvesIntoTree(result, shelfId) : result;
  };
}

const propsFromArgs = (args: any[]) => args?.[0];
const propsFromThis = (_args: any[], self: any) => self?.props;

function patchRenderOnce(target: any, prop: string, handler: any, fl: any, kind: string, name: string): void {
  if (patchedComponents.has(target)) return;
  try {
    fl.afterPatch(target, prop, handler);
    patchedComponents.add(target);
    devInfo(`[DS][menu] afterPatch installed (${kind})`, { name });
  } catch (e) {
    try { (globalThis as any).console?.warn?.(`[DS][menu] afterPatch ${kind} failed`, e); } catch {}
  }
}

function tryPatchMemo(inner: any): any | null {
  if (typeof inner !== "object" || inner?.$$typeof !== REACT_MEMO_TYPE || !inner.type) return null;
  const patched = getInjectedMenuComponent(inner.type);
  if (patched && patched !== inner.type) { try { inner.type = patched; } catch {} }
  devInfo("[DS][menu] memo unwrapped — patched inner type", { wrappedKind: typeof inner.type });
  return inner;
}

function tryPatchForwardRef(inner: any, fl: any): any | null {
  if (typeof inner !== "object" || inner?.$$typeof !== REACT_FORWARD_REF_TYPE) return null;
  if (typeof inner.render !== "function") return null;
  patchRenderOnce(inner, "render", makeRenderPatchHandler(propsFromArgs), fl,
    "forwardRef via $$typeof", inner.displayName ?? "<forwardRef>");
  return inner;
}

function tryPatchClass(inner: any, fl: any): any | null {
  if (!inner?.prototype || typeof inner.prototype.render !== "function") return null;
  patchRenderOnce(inner.prototype, "render", makeRenderPatchHandler(propsFromThis), fl,
    "class", inner.name ?? inner?.displayName ?? "<anon>");
  return inner;
}

function tryPatchDuckForwardRef(inner: any, fl: any): any | null {
  if (typeof inner.render !== "function" || inner.render === inner) return null;
  patchRenderOnce(inner, "render", makeRenderPatchHandler(propsFromArgs), fl,
    "forwardRef duck", inner.displayName ?? "<forwardRef>");
  return inner;
}

function unwrapThinFunctionWrapper(inner: Function): void {
  if (typeof fakeRenderComponent !== "function") return;
  try {
    const fake = fakeRenderComponent(inner);
    const innerType = fake?.type;
    if (innerType && innerType !== inner) {
      getInjectedMenuComponent(innerType);
      devInfo("[DS][menu] thin wrapper unwrapped — patched inner type",
        { wrapperName: (inner as any).name ?? "<anon>", innerKind: typeof innerType });
    }
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] thin-wrapper unwrap failed", e); } catch {}
  }
}

function wrapFunctionComponent(inner: Function): any {
  unwrapThinFunctionWrapper(inner);
  const cached = wrappedComponents.get(inner);
  if (cached) return cached;
  const wrapped = function DSPatchedAppContextMenu(props: any) { return (inner as any)(props); };
  wrappedComponents.set(inner, wrapped);
  devInfo("[DS][menu] HOC wrapper created (function)",
    { name: (inner as any).name ?? (inner as any).displayName ?? "<anon>" });
  return wrapped;
}

function tryAfterPatchVariants(inner: any, fl: any): any | null {
  if (typeof fl.afterPatch !== "function") return null;
  return tryPatchForwardRef(inner, fl) ?? tryPatchClass(inner, fl) ?? tryPatchDuckForwardRef(inner, fl);
}

function logNoPatchMatch(inner: any): void {
  devWarn("[DS][menu] no patch path matched", {
    kind: typeof inner,
    $$typeof: inner?.$$typeof?.toString?.(),
    name: inner?.name ?? inner?.displayName,
  });
}

function getInjectedMenuComponent(inner: any): any {
  const __t = ((globalThis as any).__ds_m2 = (globalThis as any).__ds_m2 || []);
  if (!inner) return inner;
  const fl = getFrontendLib();
  if (!fl) { __t.push("gIMC: no fl"); return inner; }
  __t.push("gIMC inner typeof=" + typeof inner + " $$=" + (inner?.$$typeof?.toString?.() ?? "none") + " hasProtoRender=" + (!!inner?.prototype?.render) + " hasRender=" + (typeof inner?.render));
  const memo = tryPatchMemo(inner);
  if (memo) { __t.push("gIMC -> memo path"); return memo; }
  const variant = tryAfterPatchVariants(inner, fl);
  if (variant) { __t.push("gIMC -> afterPatch variant"); return variant; }
  if (typeof inner === "function") { __t.push("gIMC -> wrapFunctionComponent (passthrough, NO inject)"); return wrapFunctionComponent(inner); }
  __t.push("gIMC -> no match");
  logNoPatchMatch(inner);
  return inner;
}

/* Resolve the frontend-library surface parametrically per host: a loader
   (Decky) publishes it as a global; a neutral host (no loader) exposes the
   same helpers on its own adapter (`__SHELVES_HOST__.ui`) instead — so the
   menu code works under either without any loader-named global. */
// Split so neither fallback chain pushes getFrontendLib's own complexity
// over the limit — Decky-loader globals vs the host-parametric
// __SHELVES_HOST__.ui seam are separate lookup strategies anyway.
function getDeckyLoaderLib(): any {
  const g = globalThis as any;
  return g.DFL ?? g.deckyFrontendLib ?? g.window?.DFL ?? g.window?.deckyFrontendLib;
}

function getHostUiLib(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__?.ui ?? g.__SHELVES_HOST__?.ui;
}

function getFrontendLib(): any {
  return getDeckyLoaderLib() ?? getHostUiLib();
}

function getSPDocument(): Document {
  return getPreferredSteamDocument();
}

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
    /* `React.memo` (an object with `$$typeof === Symbol.for('react.memo')`)
       or `React.forwardRef`, so the previous `typeof type !== "function"`
       gate silently rejected the real captures and forced every shelf-card
       menu into the fallback path. The `overview + client` props signature is
       unique to `AppContextMenu`, so it's a sufficient filter on its own. */
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

export function prewarmMenuExtraction(): () => void {
  if (cachedMenuComponent) return () => {};
  /* Skip on legacy (≤ 3.7): the flow extracts lazily on the first
     MENU press; firing 5 staggered extractions on cold boot hit a race in
     3.7's overlay timing where the panels iteration finds the right fiber
     but the synthetic `onMenuButton` call mutates `lastExtractionAttempt`
     before the user ever interacts. */
  if (isLegacyMenuFlow()) return () => {};
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

function isCapturableMenuProps(props: any): boolean {
  return !!(props && "overview" in props && "client" in props);
}

function sanitizeCapturedTemplateProps(props: any): Record<string, any> {
  const tProps = { ...props };
  delete tProps.overview;
  delete tProps.hasCustomArtwork;
  delete tProps.onChangeArtwork;
  return tProps;
}

function uninstallPassiveHookFns(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }): void {
  if (React && typeof originals.ce === "function") React.createElement = originals.ce;
  if (jsxRuntime && typeof originals.jsx === "function") jsxRuntime.jsx = originals.jsx;
  if (jsxRuntime && typeof originals.jsxs === "function") jsxRuntime.jsxs = originals.jsxs;
  passiveHookInstalled = false;
}

function makePassiveCaptureFn(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }) {
  return (type: any, props: any): boolean => {
    if (cachedMenuComponent || !type || !isCapturableMenuProps(props)) return false;
    cachedMenuComponent = type;
    cachedMenuTemplateProps = sanitizeCapturedTemplateProps(props);
    uninstallPassiveHookFns(React, jsxRuntime, originals);
    try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
    return true;
  };
}

function installPassiveHookFns(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }, capture: (t: any, p: any) => boolean): void {
  if (React && typeof originals.ce === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      capture(type, props);
      return originals.ce.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof originals.jsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      capture(type, props);
      return originals.jsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof originals.jsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      capture(type, props);
      return originals.jsxs.call(jsxRuntime, type, props, key);
    };
  }
}

export function installPassiveMenuHook(): void {
  if (passiveHookInstalled || cachedMenuComponent) return;
  const React = getSteamReact();
  const jsxRuntime: any = (globalThis as any).SP_JSX;
  if (!React?.createElement && typeof jsxRuntime?.jsx !== "function") return;
  const originals = { ce: React?.createElement, jsx: jsxRuntime?.jsx, jsxs: jsxRuntime?.jsxs };
  installPassiveHookFns(React, jsxRuntime, originals, makePassiveCaptureFn(React, jsxRuntime, originals));
  passiveHookInstalled = true;
}

export function installPassiveShowContextMenuHook(): void {
  if (showContextMenuHookInstalled) return;
  /* Legacy (≤ 3.7): rely on the React.createElement hook only. The frontend-lib
     showContextMenu wrapper was added for 3.8/3.9-only paths where Steam
     sometimes constructs the menu element via a module-bound reference
     before the createElement hook installs; pre-3.8 the createElement
     capture is sufficient on its own. */
  if (isLegacyMenuFlow()) return;
  const fl = getFrontendLib();
  if (!fl || typeof fl.showContextMenu !== "function") return;
  const orig = fl.showContextMenu;
  fl.showContextMenu = function (element: any, anchor: any, ...rest: any[]) {
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

function isLegacyPanelCandidate(panel: Element): boolean {
  const cls = panel.className ?? "";
  if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) return false;
  return !!panel.querySelector("img");
}

function findMenuFnInFiber(panel: any): ((e: any) => void) | null {
  const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  let fiber = panel[fiberKey];
  for (let d = 0; d < 25 && fiber; d++) {
    const props = fiber.memoizedProps || fiber.pendingProps || {};
    if (typeof props.onMenuButton === "function") return props.onMenuButton;
    fiber = fiber.return;
  }
  return null;
}

function findLegacyMenuFn(doc: Document): ((e: any) => void) | null {
  for (const panel of Array.from(doc.querySelectorAll(".Panel.Focusable"))) {
    if (!isLegacyPanelCandidate(panel)) continue;
    const fn = findMenuFnInFiber(panel);
    if (fn) return fn;
  }
  return null;
}

/* `menuFn` is Steam's own onMenuButton handler — calling it for real opens
   a real menu overlay as a side effect of letting Steam render it (that's
   how the createElement hook gets a chance to see it). Dispatch a synthetic
   Escape right after, the same "cancel" signal GamepadUI's own B-button
   sends, so the capture never leaves a menu visibly open on screen. */
function dismissSyntheticMenu(): void {
  /* Dispatch on every known Steam document (not just the one getSPDocument()
     guesses) — the menu can render in a different window than the one this
     resolver picks, and a dismiss aimed at the wrong window silently does
     nothing, leaving the menu stuck on screen. */
  const docs = new Set<Document>([getSPDocument(), ...getAllSteamDocuments()].filter(Boolean) as Document[]);
  for (const doc of docs) {
    try {
      for (const type of ["keydown", "keyup"] as const) {
        const evt = new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true });
        doc.dispatchEvent(evt);
        doc.defaultView?.dispatchEvent(evt);
      }
    } catch {}
  }
}

function runLegacyMenuCapture(menuFn: (e: any) => void): { component: any; templateProps: Record<string, any> } | null {
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
    /* The capture happens synchronously inside menuFn(), but the menu
       manager's actual open (via a ref/context, not a plain synchronous
       DOM write) can commit on a later tick — dismissing only once, right
       here, can fire before that commit and leave the menu stuck visible.
       Repeat over the next couple of ticks/frames to catch it either way. */
    dismissSyntheticMenu();
    setTimeout(dismissSyntheticMenu, 0);
    setTimeout(dismissSyntheticMenu, 50);
    setTimeout(dismissSyntheticMenu, 200);
  }
  return captured;
}

function extractAppContextMenuLegacy(): boolean {
  if (legacyCachedComponent) return true;
  const now = Date.now();
  if (now - legacyLastAttempt < EXTRACTION_COOLDOWN) return false;
  legacyLastAttempt = now;
  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;
  const menuFn = findLegacyMenuFn(doc);
  if (!menuFn) return false;
  const captured = runLegacyMenuCapture(menuFn);
  if (!captured) return false;
  legacyCachedComponent = captured.component;
  legacyCachedTemplateProps = captured.templateProps;
  try { getInjectedMenuComponent(legacyCachedComponent); } catch {}
  return true;
}

function resolveLegacyCardEl(doc: Document, appid: number): HTMLElement {
  return (doc.querySelector(`.ds-card[data-appid="${appid}"]`)
    ?? doc.querySelector(".ds-card.gpfocus")
    ?? doc.querySelector(".ds-card:focus")
    ?? doc.activeElement) as HTMLElement;
}

function resolveLegacyOwnerWindow(): any {
  return (getPreferredSteamWindow() as any)
    ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
    ?? window;
}

function buildLegacyMenuElement(React: any, overview: any, shelfId: string | undefined): any {
  const ownerWindow = resolveLegacyOwnerWindow();
  const baseTarget = shelfId ? getInjectedMenuComponent(legacyCachedComponent) : legacyCachedComponent;
  const renderTarget = function DsFreshMenuLegacy(props: any) { return (baseTarget as any)(props); };
  const props = buildMenuProps(overview, ownerWindow, shelfId, legacyCachedTemplateProps);
  return React.createElement(renderTarget, props);
}

function renderLegacyCachedMenu(appid: number, shelfId?: string): boolean {
  const React = getSteamReact();
  const appStore = getAppStore();
  if (!React || !appStore || !legacyCachedComponent) return false;
  try {
    const overview = appStore.GetAppOverviewByAppID?.(appid);
    if (!overview) return false;
    const cardEl = resolveLegacyCardEl(getSPDocument(), appid);
    const menuElement = buildLegacyMenuElement(React, overview, shelfId);
    if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
    presentMenuElement(menuElement, cardEl);
    return true;
  } catch {
    legacyCachedComponent = null;
    legacyCachedTemplateProps = {};
    return false;
  }
}

function showGameMenuLegacy(appid: number, shelfId?: string): boolean {
  if (!legacyCachedComponent) extractAppContextMenuLegacy();
  if (renderLegacyCachedMenu(appid, shelfId)) return true;
  if (!legacyCachedComponent) {
    legacyLastAttempt = 0;
    extractAppContextMenuLegacy();
    if (legacyCachedComponent && renderLegacyCachedMenu(appid, shelfId)) return true;
  }

  return false;
}

function isModernPanelCandidate(panel: Element): boolean {
  if (!isLegacyPanelCandidate(panel)) return false;
  const rect = (panel as HTMLElement).getBoundingClientRect();
  if (rect.width !== 0 && rect.height !== 0) return true;
  /* Zero rect normally means "not really rendered" — except inside the
     native recents row we collapse via display:none (homePatch.tsx). Those
     cards are real, just visually hidden, and the only native menu source
     available on the home once hidden. */
  return !!panel.closest('[data-ds-hidden-collapse="1"]');
}

function findModernMenuFn(doc: Document): ((e: any) => void) | null {
  for (const panel of Array.from(doc.querySelectorAll(".Panel.Focusable"))) {
    if (!isModernPanelCandidate(panel)) continue;
    const fn = findMenuFnInFiber(panel);
    if (fn) return fn;
  }
  return null;
}

export function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;
  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;
  const menuFn = findModernMenuFn(doc);
  if (!menuFn) return false;
  const captured = runLegacyMenuCapture(menuFn);
  if (!captured) return false;
  cachedMenuComponent = captured.component;
  cachedMenuTemplateProps = captured.templateProps;
  passiveHookInstalled = false;
  try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
  return true;
}

function resolveOwnerWindow(anchorDoc?: Document): any {
  return (anchorDoc?.defaultView as any)
    ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
    ?? (getPreferredSteamWindow() as any)
    ?? window;
}

function buildMenuProps(overview: any, ownerWindow: any, shelfId: string | undefined, base: Record<string, any>): any {
  return {
    ...base,
    overview,
    client: base.client ?? "mostavailable",
    launchSource: base.launchSource ?? 1000,
    bInGamepadUI: base.bInGamepadUI ?? true,
    strCollectionId: base.strCollectionId ?? "",
    ownerWindow: ownerWindow ?? base.ownerWindow,
    hasCustomArtwork: undefined,
    onChangeArtwork: undefined,
    ...(shelfId ? { _dsShelfId: shelfId } : {}),
  };
}

function presentMenuElement(menuElement: any, cardEl: HTMLElement): void {
  const fl = getFrontendLib();
  if (fl?.showContextMenu) fl.showContextMenu(menuElement, cardEl);
  else showContextMenu(menuElement, cardEl as any);
}

function buildFreshMenuElement(overview: any, anchorDoc: Document | undefined, shelfId: string | undefined): any {
  const React = getSteamReact();
  const baseTarget = shelfId ? getInjectedMenuComponent(cachedMenuComponent) : cachedMenuComponent;
  const __t = ((globalThis as any).__ds_m2 = (globalThis as any).__ds_m2 || []);
  __t.push("buildFresh: cached typeof=" + typeof cachedMenuComponent + " $$=" + ((cachedMenuComponent as any)?.$$typeof?.toString?.() ?? "none") + "; baseTarget typeof=" + typeof baseTarget + " $$=" + ((baseTarget as any)?.$$typeof?.toString?.() ?? "none") + "; shelfId=" + shelfId);
  const renderTarget = function DsFreshMenu(props: any) {
    try { return (baseTarget as any)(props); }
    catch (e) { ((globalThis as any).__ds_m2 = (globalThis as any).__ds_m2 || []).push("DsFreshMenu THREW calling baseTarget: " + e); throw e; }
  };
  const props = buildMenuProps(overview, resolveOwnerWindow(anchorDoc), shelfId, cachedMenuTemplateProps);
  return React.createElement(renderTarget, props);
}

function readyToRenderCachedMenu(): boolean {
  return !!(getSteamReact() && getAppStore() && cachedMenuComponent);
}

function renderCachedMenuOnce(appid: number, shelfId?: string): boolean {
  if (!readyToRenderCachedMenu()) return false;
  try {
    const overview = getAppStore().GetAppOverviewByAppID?.(appid);
    if (!overview) return false;
    const anchor = findCardAnchor(appid);
    const cardEl = (anchor?.el ?? getSPDocument().activeElement) as HTMLElement;
    if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
    presentMenuElement(buildFreshMenuElement(overview, anchor?.doc, shelfId), cardEl);
    return true;
  } catch {
    cachedMenuComponent = null;
    cachedMenuTemplateProps = {};
    return false;
  }
}

function tryShowGameMenuNative(appid: number, shelfId?: string): boolean {
  try {
    installPassiveMenuHook();
    if (!cachedMenuComponent) extractAppContextMenu();
    if (renderCachedMenuOnce(appid, shelfId)) return true;
    if (!cachedMenuComponent) {
      lastExtractionAttempt = 0;
      extractAppContextMenu();
      if (renderCachedMenuOnce(appid, shelfId)) return true;
    }
  } catch {
    cachedMenuComponent = null;
    cachedMenuTemplateProps = {};
  }
  return false;
}

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

function buildFallbackItems(appid: number, shelfId: string | undefined, fl: any, R: any, installed: boolean): any[] {
  const items: any[] = [];
  const sc: any = (globalThis as any).SteamClient;
  const nav = fl.Navigation ?? sc?.Navigation;
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

function resolveCardLabelName(cardEl: HTMLElement | null): string | null {
  try {
    const n = cardEl?.querySelector?.('.ds-card-label-name')?.textContent?.trim();
    return n || null;
  } catch { return null; }
}

function hasFallbackMenuApi(fl: any, R: any): boolean {
  return !!(fl?.showContextMenu && R && fl.Menu && fl.MenuItem);
}

function resolveFallbackTitle(overview: any, cardEl: HTMLElement | null): string {
  return overview?.display_name || resolveCardLabelName(cardEl) || "Game";
}

function showFallbackMenu(appid: number, shelfId: string | undefined): void {
  try {
    const fl = getFrontendLib();
    const R = getSteamReact();
    if (!hasFallbackMenuApi(fl, R)) return;
    const anchor = findCardAnchor(appid);
    const cardEl = (anchor?.el ?? getSPDocument().activeElement) as HTMLElement;
    const overview = getAppStore()?.GetAppOverviewByAppID?.(appid);
    const items = buildFallbackItems(appid, shelfId, fl, R, overview?.installed === true);
    fl.showContextMenu(R.createElement(fl.Menu, { label: resolveFallbackTitle(overview, cardEl) }, ...items), cardEl);
  } catch {}
}

function tryShowGameMenuLegacyWrapped(appid: number, shelfId?: string): boolean {
  try { return showGameMenuLegacy(appid, shelfId); }
  catch {
    legacyCachedComponent = null;
    legacyCachedTemplateProps = {};
    return false;
  }
}

export function showGameMenu(appid: number, shelfId?: string): void {
  if (showGameMenuActive) return;
  showGameMenuActive = true;
  // Native menu actions (Customize Artwork, Properties, …) bypass our
  // onActivate, so save focus here for B-back restoration.
  try { if (appid > 0) saveFocusTarget(appid, shelfId); } catch {}
  try {
    if (isLegacyMenuFlow()) {
      if (tryShowGameMenuLegacyWrapped(appid, shelfId)) return;
    } else if (tryShowGameMenuNative(appid, shelfId)) {
      return;
    }
    showFallbackMenu(appid, shelfId);
  } finally {
    showGameMenuActive = false;
  }
}
