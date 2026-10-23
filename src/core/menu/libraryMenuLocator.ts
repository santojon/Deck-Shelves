/* Locates Steam's library context-menu class and recognises the top-level
   entry list of a game's context menu. */
import { MenuGroup, MenuItem, fakeRenderComponent, findModule } from "../../runtime/host/decky";

type GameMenuCheckContext = { props?: unknown; appid?: number; menuClass?: unknown };

/* The class is not exported. Steam exports a small function component that
   renders it, adding two props of its own; that component is found by its
   shape and by those two prop names in its short source. */
const RENDERER_MAX_SOURCE = 300;
const RENDERER_FRAGMENTS = ["navigator:", "instance:"] as const;

type RegistryScan = { renderers: Set<unknown>; failed: boolean };

// One parameter, a plain function (writable prototype holding only its constructor), no statics.
function hasRendererShape(value: unknown): value is (props: unknown) => unknown {
  if (typeof value !== "function" || value.length !== 1) return false;
  const proto = Object.getOwnPropertyDescriptor(value, "prototype");
  if (!proto?.writable || !proto.value || typeof proto.value !== "object") return false;
  const names = Object.getOwnPropertyNames(proto.value);
  return names.length === 1 && names[0] === "constructor" && Object.keys(value).length === 0;
}

function isMenuRenderer(value: unknown): boolean {
  if (!hasRendererShape(value)) return false;
  const source = Function.prototype.toString.call(value);
  return source.length <= RENDERER_MAX_SOURCE && RENDERER_FRAGMENTS.every((part) => source.includes(part));
}

// A module variant is its default export or its export object.
function scanVariant(variant: unknown, scan: RegistryScan): void {
  if (typeof variant === "function") {
    if (isMenuRenderer(variant)) scan.renderers.add(variant);
    return;
  }
  if (!variant || typeof variant !== "object") return;
  const exports = variant as Record<string, unknown>;
  for (const key of Object.keys(exports)) {
    const value = exports[key];
    if (isMenuRenderer(value)) scan.renderers.add(value);
  }
}

// One pass; it stops early on an error or a second match, since both mean null.
function scanRegistry(): RegistryScan {
  const scan: RegistryScan = { renderers: new Set(), failed: false };
  findModule((variant: unknown) => {
    try {
      scanVariant(variant, scan);
    } catch {
      scan.failed = true;
    }
    return scan.failed || scan.renderers.size > 1;
  });
  return scan;
}

// Reads only the element's type.
function menuClassOf(element: unknown): any {
  if (!element || typeof element !== "object") return null;
  const type: unknown = (element as { type?: unknown }).type;
  if (typeof type !== "function") return null;
  const proto: unknown = type.prototype;
  if (!proto || typeof proto !== "object") return null;
  return typeof (proto as { render?: unknown }).render === "function" ? type : null;
}

export function locateLibraryMenuClass(): any {
  try {
    const scan = scanRegistry();
    if (scan.failed || scan.renderers.size !== 1) return null;
    const [renderer] = scan.renderers;
    return menuClassOf(fakeRenderComponent(renderer));
  } catch {
    return null;
  }
}

const MAX_LIST_ENTRIES = 64;
const PLUGIN_KEY_PREFIX = "ds-";
const MAX_APP_ID = 0xffffffff;

type AppScan = { apps: Set<number>; multi: boolean };
type ListScan = AppScan & { own: number; groups: number; items: number };
type ElementLike = { $$typeof?: unknown; type?: unknown; key?: unknown; props?: unknown };
type AppProps = { overview?: unknown; rgApps?: unknown };

function isAppId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_APP_ID;
}

function appIdOf(overview: unknown): number | null {
  if (!overview || typeof overview !== "object") return null;
  const appid: unknown = (overview as { appid?: unknown }).appid;
  return isAppId(appid) ? appid : null;
}

function addApp(scan: AppScan, appid: number | null): void {
  if (appid !== null) scan.apps.add(appid);
}

// The apps a props object names: an overview or a list of apps.
function addAppsOf(props: unknown, scan: AppScan): void {
  if (!props || typeof props !== "object") return;
  const p = props as AppProps;
  addApp(scan, appIdOf(p.overview));
  if (!Array.isArray(p.rgApps)) return;
  if (p.rgApps.length > 1) scan.multi = true;
  else addApp(scan, appIdOf(p.rgApps[0]));
}

function isElement(entry: unknown): entry is ElementLike {
  return !!entry && typeof entry === "object" && typeof (entry as ElementLike).$$typeof === "symbol";
}

function isPluginEntry(entry: unknown): boolean {
  return isElement(entry) && typeof entry.key === "string" && entry.key.startsWith(PLUGIN_KEY_PREFIX);
}

// Only the list's own entries count, up to the cap; entries this plugin added are skipped.
function scanEntries(items: readonly unknown[], scan: ListScan): void {
  for (const entry of items) {
    if (isPluginEntry(entry)) continue;
    scan.own++;
    if (scan.own > MAX_LIST_ENTRIES) return;
    if (!isElement(entry)) continue;
    if (entry.type === MenuGroup) scan.groups++;
    else if (entry.type === MenuItem) scan.items++;
    addAppsOf(entry.props, scan);
  }
}

function listAppOf(scan: ListScan): number | null {
  if (scan.multi || scan.apps.size !== 1) return null;
  const [app] = scan.apps;
  return app;
}

// The rendering props and the app id may confirm the list's app, never name another.
function contextAgrees(app: number, context: GameMenuCheckContext | undefined): boolean {
  const named: AppScan = { apps: new Set(), multi: false };
  addAppsOf(context?.props, named);
  if (named.multi || [...named.apps].some((other) => other !== app)) return false;
  const appid = context?.appid;
  return !isAppId(appid) || appid === app;
}

function canHoldEntries(items: unknown): items is readonly unknown[] {
  if (!Array.isArray(items) || items.length === 0) return false;
  return MenuGroup != null && MenuItem != null && MenuGroup !== MenuItem;
}

/* The top-level list holds menu entries and submenus as its own elements,
   and those elements name exactly one app. Submenu lists hold no submenus;
   containers hold the list instead of its entries. */
export function isGameMenuItemList(items: unknown, context?: GameMenuCheckContext): boolean {
  try {
    if (!canHoldEntries(items)) return false;
    const scan: ListScan = { own: 0, groups: 0, items: 0, apps: new Set(), multi: false };
    scanEntries(items, scan);
    if (scan.own > MAX_LIST_ENTRIES || scan.groups === 0 || scan.items === 0) return false;
    const app = listAppOf(scan);
    return app !== null && contextAgrees(app, context);
  } catch {
    return false;
  }
}
