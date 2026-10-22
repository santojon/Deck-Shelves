import { beforeEach, describe, expect, it, vi } from "vitest";
import * as hostStubs from "../../stubs/host-ui";

type Filter = (variant: unknown) => unknown;

const host = vi.hoisted(() => ({
  MenuItem: function MenuItem() { return null; },
  MenuGroup: function MenuGroup() { return null; },
  findModule: undefined as undefined | ((filter: (variant: unknown) => unknown) => unknown),
  fakeRenderComponent: undefined as undefined | ((fn: unknown, hooks?: unknown) => unknown),
  read: new Set<string>(),
}));

// Only the adapter exports the module may use; the mock records every export read.
vi.mock("../../../runtime/host/decky", () => {
  const exports = {
    get MenuItem() { return host.MenuItem; },
    get MenuGroup() { return host.MenuGroup; },
    findModule: (filter: (variant: unknown) => unknown) => host.findModule!(filter),
    fakeRenderComponent: (fn: unknown, hooks?: unknown) => host.fakeRenderComponent!(fn, hooks),
  };
  return new Proxy(exports, {
    get(target, prop, receiver) {
      if (typeof prop === "string") host.read.add(prop);
      return Reflect.get(target, prop, receiver);
    },
  });
});

import { isGameMenuItemList, locateLibraryMenuClass } from "../../../core/menu/libraryMenuLocator";

const { MenuItem, MenuGroup } = host;

// ---------------------------------------------------------------- locator

const calls: string[] = [];
const log: string[] = [];
const rendered: unknown[] = [];

class LibraryMenu {
  constructor() { calls.push("LibraryMenu.new"); }
  render() { calls.push("LibraryMenu.render"); return null; }
}

class OtherMenu {
  constructor() { calls.push("OtherMenu.new"); }
  render() { calls.push("OtherMenu.render"); return null; }
}

// Shape of the exported component that renders the menu class.
function menuRenderer(props: object) {
  calls.push("menuRenderer");
  return { type: LibraryMenu, props: { navigator: null, instance: null, ...props } };
}

function otherRenderer(props: object) {
  calls.push("otherRenderer");
  return { type: OtherMenu, props: { navigator: null, instance: null, ...props } };
}

// Decoys: each misses one part of the signature.
function twoParams(props: object, extra: unknown) {
  calls.push("twoParams");
  return { navigator: props, instance: extra };
}
const arrowRenderer = (props: object) => {
  calls.push("arrowRenderer");
  return { navigator: null, instance: null, ...props };
};
class PropsHolder {
  constructor(props: object) {
    calls.push("PropsHolder");
    Object.assign(this, { navigator: null, instance: null, ...props });
  }
}
function plainComponent(props: object) {
  calls.push("plainComponent");
  return props;
}
function withStatic(props: object) {
  calls.push("withStatic");
  return { navigator: null, instance: null, ...props };
}
withStatic.defaultProps = {};
function longRenderer(props: object) {
  calls.push("longRenderer ................................................................................");
  calls.push("longRenderer ................................................................................");
  calls.push("longRenderer ................................................................................");
  return { navigator: null, instance: null, ...props };
}
function withMethods(props: object) {
  calls.push("withMethods");
  return { navigator: null, instance: null, ...props };
}
withMethods.prototype.extra = function extra() { calls.push("withMethods.extra"); };
function swappedPrototype(props: object) {
  calls.push("swappedPrototype");
  return { navigator: null, instance: null, ...props };
}
swappedPrototype.prototype = { extra: 1 };

class NotCallable {}
(NotCallable.prototype as unknown as { render: unknown }).render = 5;

const decoyModule = {
  a: OtherMenu, b: twoParams, c: arrowRenderer, d: PropsHolder, e: plainComponent,
  f: withStatic, g: longRenderer, h: withMethods, i: { navigator: "x", instance: "y" }, j: "text", k: 3,
  l: swappedPrototype,
};
const menuModule = { a: plainComponent, b: menuRenderer, c: twoParams };
const otherModule = { a: otherRenderer };

const fixtureFunctions = [
  LibraryMenu, OtherMenu, menuRenderer, otherRenderer, twoParams, arrowRenderer, PropsHolder,
  plainComponent, withStatic, longRenderer, withMethods, swappedPrototype,
];
// Freezing a prototype object leaves the function's own prototype property writable.
for (const fn of fixtureFunctions) {
  Object.seal(fn);
  Object.freeze(fn.prototype);
}
for (const mod of [decoyModule, menuModule, otherModule]) Object.freeze(mod);

function useRegistry(...modules: object[]): void {
  host.findModule = (filter: Filter) => {
    for (const mod of modules) {
      for (const variant of [(mod as { default?: unknown }).default, mod]) {
        log.push("filter");
        const hit = filter(variant);
        if (hit) return hit;
      }
    }
    return undefined;
  };
}

function useRender(result: (fn: unknown) => unknown): void {
  host.fakeRenderComponent = (fn: unknown) => {
    log.push("render");
    rendered.push(fn);
    return result(fn);
  };
}

const renderByType = (fn: unknown) =>
  fn === menuRenderer ? { type: LibraryMenu, props: {} } : fn === otherRenderer ? { type: OtherMenu, props: {} } : null;

const exportsRead = () => [...host.read].filter((name) => !name.startsWith("__") && name !== "then" && name !== "default");

function snapshotOf(values: unknown[]): unknown[] {
  return values.map((v) => {
    if (typeof v !== "function") return Object.entries(v as object);
    const proto = Object.getOwnPropertyDescriptor(v, "prototype");
    return [Object.getOwnPropertyNames(v), proto?.writable, proto?.value ? Object.getOwnPropertyNames(proto.value) : null];
  });
}

describe("locateLibraryMenuClass", () => {
  beforeEach(() => {
    calls.length = 0;
    log.length = 0;
    rendered.length = 0;
    host.findModule = hostStubs.findModule;
    host.fakeRenderComponent = hostStubs.fakeRenderComponent;
  });

  it("returns null with the default test stubs", () => {
    expect(locateLibraryMenuClass()).toBeNull();
  });

  it("returns null without throwing when a helper is missing or throws", () => {
    host.findModule = undefined;
    expect(locateLibraryMenuClass()).toBeNull();
    host.findModule = () => { throw new Error("registry"); };
    expect(locateLibraryMenuClass()).toBeNull();
    useRegistry(menuModule);
    host.fakeRenderComponent = undefined;
    expect(locateLibraryMenuClass()).toBeNull();
    useRender(() => { throw new Error("render"); });
    expect(locateLibraryMenuClass()).toBeNull();
  });

  it("returns null without rendering when a registry value has a throwing getter", () => {
    const throwing = Object.defineProperty({}, "x", { enumerable: true, get() { throw new Error("getter"); } });
    useRegistry(menuModule, throwing);
    useRender(renderByType);
    expect(() => locateLibraryMenuClass()).not.toThrow();
    expect(locateLibraryMenuClass()).toBeNull();
    expect(rendered).toEqual([]);
  });

  it("returns null on a host that swallows errors thrown inside the filter", () => {
    const throwing = Object.defineProperty({}, "x", { enumerable: true, get() { throw new Error("getter"); } });
    host.findModule = (filter: Filter) => {
      for (const mod of [menuModule, throwing]) {
        try {
          const hit = filter(mod);
          if (hit) return hit;
        } catch {
          log.push("swallowed");
        }
      }
      return undefined;
    };
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBeNull();
    expect(rendered).toEqual([]);
  });

  it("finds the class among decoys through one render of the selected component, after the whole pass", () => {
    useRegistry(decoyModule, menuModule, { default: plainComponent });
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBe(LibraryMenu);
    expect(rendered).toEqual([menuRenderer]);
    expect(log.filter((e) => e === "filter")).toHaveLength(6);
    expect(log[log.length - 1]).toBe("render");
    expect(log.indexOf("render")).toBe(log.length - 1);
    expect(calls).toEqual([]);
  });

  it("counts one value reached through several exports or modules once", () => {
    useRegistry(menuModule, { x: menuRenderer, y: menuRenderer }, { default: menuRenderer });
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBe(LibraryMenu);
    expect(rendered).toEqual([menuRenderer]);
  });

  it("returns null without any render when two distinct values match", () => {
    useRegistry(menuModule, otherModule);
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBeNull();
    expect(rendered).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("returns null without any render when nothing matches", () => {
    useRegistry(decoyModule);
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBeNull();
    expect(rendered).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "LibraryMenu"],
    ["an element without type", { props: {} }],
    ["a host element", { type: "div", props: {} }],
    ["a plain function type", { type: plainComponent, props: {} }],
    ["a class without render", { type: class Bare {}, props: {} }],
    ["a class whose render is not callable", { type: NotCallable, props: {} }],
  ])("returns null when the render gives %s", (_name, element) => {
    useRegistry(menuModule);
    useRender(() => element);
    expect(locateLibraryMenuClass()).toBeNull();
    expect(rendered).toEqual([menuRenderer]);
  });

  it("leaves the registry fixtures unchanged", () => {
    const values = [...fixtureFunctions, decoyModule, menuModule, otherModule];
    const before = snapshotOf(values);
    useRegistry(decoyModule, menuModule, otherModule);
    useRender(renderByType);
    locateLibraryMenuClass();
    useRegistry(decoyModule, menuModule);
    locateLibraryMenuClass();
    expect(snapshotOf(values)).toEqual(before);
    expect(calls).toEqual([]);
  });

  it("keeps no state between calls", () => {
    useRender(renderByType);
    useRegistry(menuModule);
    expect(locateLibraryMenuClass()).toBe(LibraryMenu);
    useRegistry(otherModule);
    expect(locateLibraryMenuClass()).toBe(OtherMenu);
    useRegistry(decoyModule);
    expect(locateLibraryMenuClass()).toBeNull();
    useRegistry(menuModule);
    expect(locateLibraryMenuClass()).toBe(LibraryMenu);
  });

  it("reads only the registry search and the render helper in the locator, and only components in the check", () => {
    host.read.clear();
    useRegistry(decoyModule, menuModule);
    useRender(renderByType);
    expect(locateLibraryMenuClass()).toBe(LibraryMenu);
    const locatorReads = exportsRead();
    host.read.clear();
    expect(isGameMenuItemList(topList(GAME), { props: classProps(GAME), appid: GAME.appid })).toBe(true);
    const checkReads = exportsRead();
    expect(locatorReads.length).toBeGreaterThan(0);
    expect(locatorReads.filter((name) => !["fakeRenderComponent", "findModule"].includes(name))).toEqual([]);
    expect(checkReads.length).toBeGreaterThan(0);
    expect(checkReads.filter((name) => !["Focusable", "Menu", "MenuGroup", "MenuItem"].includes(name))).toEqual([]);
  });
});

// ---------------------------------------------------------------- check

const ELEMENT = Symbol.for("react.transitional.element");
const FRAGMENT = Symbol.for("react.fragment");
const noop = () => {};

function el(type: unknown, props: Record<string, unknown> = {}, key: string | null = null) {
  return { $$typeof: ELEMENT, type, key, props };
}

// Stand-ins for Steam's inner components, by role.
function Icon() { return null; }
function Separator() { return null; }
function AppsEntry(_props: unknown) { return null; }
function AppEntry(_props: unknown) { return null; }

const GAME = { appid: 282800 };
const OTHER_GAME = { appid: 384190 };
const SHORTCUT = { appid: 4241608999 };

const addToList = () => [
  el(MenuItem, { disabled: false, onSelected: noop, className: "c", children: "entry" }, "add-to-uc-1"),
  el(MenuItem, { disabled: true, onSelected: noop, className: "c", children: "entry" }, "add-to-uc-2"),
  el(Separator, {}, "add-all-to-new-separator"),
  el(MenuItem, { onSelected: noop, children: [el(Icon), "entry"] }, "add-all-to-new"),
];
const removeFromList = () => [
  el(MenuItem, { onSelected: noop, className: "c", children: "entry" }, "remove-from-uc-1"),
];
// The manage submenu; an installed game's adds a fragment with one more entry.
const manageList = (overview: object, installed = false) => [
  false, false, false, false, false, false, false, false, false,
  el(MenuItem, { onSelected: noop, children: "entry" }),
  el(AppsEntry, { rgApps: [overview] }),
  el(AppEntry, { app: overview }),
  false, false,
  installed ? el(FRAGMENT, { children: [el(Separator), el(MenuItem, { onSelected: noop, children: "entry" }, "uninstall")] }) : false,
];

type Layout = { inCollection?: boolean; installed?: boolean; apps?: object[]; extra?: unknown[] };

// The gamepad menu's top-level list, as the class renders it.
function topList(overview: object, opts: Layout = {}) {
  const apps = opts.apps ?? [overview];
  return [
    el(MenuItem, { className: "c", onSelected: noop, children: [el(Icon), "entry"] }),
    undefined,
    false,
    el(MenuItem, { onSelected: noop, children: "entry" }),
    el(MenuGroup, { label: "group", children: addToList() }),
    opts.inCollection === false ? false : el(MenuGroup, { label: "group", children: removeFromList() }),
    el(AppsEntry, { rgApps: apps }),
    el(MenuGroup, { label: "group", children: manageList(overview, opts.installed) }),
    el(AppsEntry, { rgApps: apps }),
    el(FRAGMENT, { children: [el(Separator), el(MenuItem, { onSelected: noop, children: "entry" })] }),
    ...(opts.extra ?? []),
  ];
}

const withoutAppsEntries = (list: unknown[]) =>
  list.map((e) => (e && typeof e === "object" && "type" in e && e.type === AppsEntry ? false : e));

// The menu's inner class nests the list with a header and footer.
const containerOf = (top: unknown[]) => [
  top,
  el("div", { id: "label", style: {}, children: "title" }),
  el(FRAGMENT, { children: [el(Separator), el(MenuItem, { onSelected: noop, children: "entry" }), false] }),
  false,
];

const classProps = (overview: object) => ({
  navigator: {}, instance: {}, overview, client: {}, launchSource: 0, bInGamepadUI: true,
  hasCustomArtwork: false, onChangeArtwork: noop, strCollectionId: "", ownerWindow: {},
});
const innerProps = (top: unknown[]) => ({ labelId: "label", label: "title", children: top });

const otherPluginEntries = () => [
  el(MenuItem, { onSelected: noop, children: "entry" }, "other-plugin-a"),
  el(MenuItem, { onSelected: noop, children: "entry" }, "other-plugin-b"),
];

// Another plugin's submenu that nests a submenu next to an entry.
const otherPluginNested = () => el(MenuGroup, {
  label: "group",
  children: [
    el(MenuGroup, { label: "group", children: [el(MenuItem, { onSelected: noop, children: "entry" }, "other-plugin-c")] }, "other-plugin-sub"),
    el(MenuItem, { onSelected: noop, children: "entry" }, "other-plugin-d"),
  ],
}, "other-plugin-root");
const pluginEntries = () => [
  el(MenuItem, { onSelected: noop, disabled: false, children: "entry", appid: 99 }, "ds-card-highlight"),
  el(MenuGroup, { label: "group", children: [el(MenuItem, { onSelected: noop, children: "entry" }, "ds-x")] }, "ds-card-add-shelf"),
  el(FRAGMENT, { children: [el(MenuGroup, { label: "group", children: [] })] }, "ds-wrap"),
];

// The plugin's own fallback game menu: plain-keyed actions, then its keyed entries.
const pluginMenu = (actions: string[]) => [
  ...actions.map((key) => el(MenuItem, { onSelected: noop, children: "entry" }, key)),
  el(Separator, {}, "ds-sep"),
  el(MenuItem, { onSelected: noop, children: "entry" }, "ds-card-highlight"),
  el(MenuItem, { onSelected: noop, children: "entry" }, "ds-card-hide"),
  el(MenuGroup, { label: "group", children: [el(MenuItem, { onSelected: noop }, "ds-y")] }, "ds-card-add-shelf"),
  el(MenuGroup, { label: "group", children: [el(MenuGroup, { label: "group", children: [] }, "ds-mgmt")] }, "ds-shelf-root"),
];

const collectionMenu = () => [false, false, false, false, el(MenuItem, { onSelected: noop, children: "entry" }), false, false];

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key], seen);
  return Object.freeze(value);
}

// Every array reachable from a render output, as a depth-first finder meets them.
function arraysIn(node: unknown, out: unknown[][] = []): unknown[][] {
  if (Array.isArray(node)) {
    out.push(node);
    for (const child of node) arraysIn(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    const children = (node as { props: { children?: unknown } }).props.children;
    if (children && typeof children === "object") arraysIn(children, out);
  }
  return out;
}

const variants: [string, { appid: number }, Layout][] = [
  ["installed", GAME, { installed: true }],
  ["not installed", OTHER_GAME, { installed: false }],
  ["non-Steam", SHORTCUT, { inCollection: false }],
];

describe("isGameMenuItemList", () => {
  it.each(variants)("is true for the top-level list of a %s game, from the class and from the inner menu", (_name, overview, layout) => {
    const top = deepFreeze(topList(overview, layout));
    expect(isGameMenuItemList(top, { props: classProps(overview), appid: overview.appid, menuClass: LibraryMenu })).toBe(true);
    expect(isGameMenuItemList(top, { props: innerProps(top), appid: 0 })).toBe(true);
    expect(isGameMenuItemList(top, { props: innerProps(top), appid: overview.appid })).toBe(true);
    expect(isGameMenuItemList(top)).toBe(true);
  });

  it("is true with other plugins' entries in the list, and with the plugin's own entries", () => {
    const top = deepFreeze(topList(GAME, { extra: [...otherPluginEntries(), otherPluginNested(), ...pluginEntries()] }));
    expect(isGameMenuItemList(top, { props: classProps(GAME), appid: GAME.appid })).toBe(true);
    expect(isGameMenuItemList(top, { props: innerProps(top) })).toBe(true);
  });

  it.each(variants)("is true for one array only in each render output of a %s game", (_name, overview, layout) => {
    const top = deepFreeze(topList(overview, { ...layout, extra: [otherPluginNested(), ...pluginEntries()] }));
    const outer = el(Object, { label: "title", children: top });
    const inner = el(Object, { className: "menu", children: containerOf(top) });
    const outerHits = arraysIn(outer).filter((a) => isGameMenuItemList(a, { props: classProps(overview), appid: overview.appid }));
    const innerHits = arraysIn(inner).filter((a) => isGameMenuItemList(a, { props: innerProps(top), appid: 0 }));
    expect(outerHits).toEqual([top]);
    expect(innerHits).toEqual([top]);
  });

  it("is false for submenu lists and for containers of the top-level list", () => {
    const top = deepFreeze(topList(GAME));
    const ctx = { props: classProps(GAME), appid: GAME.appid };
    const submenus = [
      addToList(), removeFromList(), manageList(GAME), manageList(GAME, true),
      (top[9] as { props: { children: unknown } }).props.children, otherPluginNested().props.children,
    ];
    for (const list of submenus) {
      expect(isGameMenuItemList(deepFreeze(list), ctx)).toBe(false);
    }
    const container = deepFreeze(containerOf(top));
    expect(isGameMenuItemList(container, { props: innerProps(top), appid: GAME.appid })).toBe(false);
    expect(isGameMenuItemList([top], ctx)).toBe(false);
    expect(isGameMenuItemList(container[0], { props: innerProps(top) })).toBe(true);
  });

  it("is false for other menus, the plugin's own menus and menus for several apps", () => {
    expect(isGameMenuItemList(deepFreeze(collectionMenu()), { props: { strCollectionId: "x" }, appid: GAME.appid })).toBe(false);
    for (const actions of [["play", "properties"], ["properties", "screenshots", "details"]]) {
      const own = deepFreeze(pluginMenu(actions));
      expect(isGameMenuItemList(own, { props: classProps(GAME), appid: GAME.appid })).toBe(false);
      expect(isGameMenuItemList(own, { props: innerProps(own), appid: GAME.appid })).toBe(false);
      expect(isGameMenuItemList(own, { props: { appid: GAME.appid } })).toBe(false);
    }
    const several = deepFreeze(topList(GAME, { apps: [GAME, OTHER_GAME, SHORTCUT] }));
    expect(isGameMenuItemList(several)).toBe(false);
    expect(isGameMenuItemList(several, { props: classProps(GAME), appid: GAME.appid })).toBe(false);
    expect(isGameMenuItemList([...several, el(AppsEntry, { rgApps: [GAME] })], { props: innerProps(several) })).toBe(false);
    expect(isGameMenuItemList(several, { props: { rgApps: [GAME, OTHER_GAME] } })).toBe(false);
    expect(isGameMenuItemList(topList(GAME), { props: { rgApps: [GAME, OTHER_GAME] } })).toBe(false);
    const noApp = deepFreeze(withoutAppsEntries(topList(GAME)));
    expect(isGameMenuItemList(noApp, { props: { rgApps: [GAME, OTHER_GAME] } })).toBe(false);
  });

  it.each([
    ["undefined", undefined], ["null", null], ["a string", "entries"], ["a number", 3], ["an object", { length: 2 }],
    ["an element", el(MenuGroup, { children: [] })], ["an empty array", []], ["nulls", [null, null]],
    ["strings", ["a", "b"]], ["nested arrays", [[], [null]]],
  ])("is false for %s", (_name, value) => {
    expect(isGameMenuItemList(value, { props: classProps(GAME), appid: GAME.appid })).toBe(false);
  });

  it("is false when the list, the props or the app id name different apps, or when only the context names one", () => {
    const top = deepFreeze(topList(GAME));
    expect(isGameMenuItemList(top, { props: classProps(GAME), appid: OTHER_GAME.appid })).toBe(false);
    expect(isGameMenuItemList(top, { props: innerProps(top), appid: OTHER_GAME.appid })).toBe(false);
    expect(isGameMenuItemList(top, { props: classProps(OTHER_GAME), appid: GAME.appid })).toBe(false);
    expect(isGameMenuItemList(top, { props: classProps(OTHER_GAME) })).toBe(false);
    const noApp = deepFreeze(withoutAppsEntries(topList(GAME)));
    expect(isGameMenuItemList(noApp, { appid: GAME.appid })).toBe(false);
    expect(isGameMenuItemList(noApp, { props: innerProps(noApp), appid: GAME.appid })).toBe(false);
    expect(isGameMenuItemList(noApp, { props: classProps(GAME), appid: GAME.appid })).toBe(false);
  });

  it("takes no app from single-app or app id props", () => {
    const noApp = withoutAppsEntries(topList(GAME));
    const list = deepFreeze([...noApp, el(AppEntry, { app: GAME }), el(MenuItem, { onSelected: noop, children: "entry", appid: GAME.appid })]);
    expect(isGameMenuItemList(list)).toBe(false);
    expect(isGameMenuItemList(list, { props: { app: GAME, appid: GAME.appid }, appid: GAME.appid })).toBe(false);
  });

  it("counts only the list's own entries against its size cap", () => {
    const padded = (size: number) => {
      const list: unknown[] = topList(GAME);
      while (list.length < size) list.push(el(MenuItem, { onSelected: noop, children: "entry" }));
      return deepFreeze(list);
    };
    const ctx = { props: classProps(GAME), appid: GAME.appid };
    for (const list of [padded(63), padded(64)]) {
      expect(isGameMenuItemList(list, ctx)).toBe(true);
      expect(isGameMenuItemList([...list, ...pluginEntries()], ctx)).toBe(true);
      expect(isGameMenuItemList([...pluginEntries(), ...list], ctx)).toBe(true);
    }
    const over = padded(65);
    expect(isGameMenuItemList(over, ctx)).toBe(false);
    expect(isGameMenuItemList([...over, ...pluginEntries()], ctx)).toBe(false);
  });

  it("accepts any distinct component values as the menu types", () => {
    const top = deepFreeze(topList(GAME));
    const group = host.MenuGroup;
    try {
      host.MenuGroup = Object.freeze({ $$typeof: Symbol.for("react.memo"), type: noop }) as unknown as typeof group;
      const memoTop = top.map((e) => (e && typeof e === "object" && "type" in e && e.type === group ? { ...e, type: host.MenuGroup } : e));
      expect(isGameMenuItemList(memoTop, { props: classProps(GAME), appid: GAME.appid })).toBe(true);
      host.MenuGroup = host.MenuItem;
      expect(isGameMenuItemList(top, { props: classProps(GAME), appid: GAME.appid })).toBe(false);
    } finally {
      host.MenuGroup = group;
    }
  });

  it("ignores app ids that are not valid ids", () => {
    const top = deepFreeze(topList(SHORTCUT, { inCollection: false }));
    for (const appid of [0, -1, 1.5, Number.NaN, 2 ** 40]) {
      expect(isGameMenuItemList(top, { props: innerProps(top), appid })).toBe(true);
    }
  });

  it("does not throw on throwing getters or cyclic props, and leaves its inputs unchanged", () => {
    const throwingEntry = Object.defineProperty({ $$typeof: ELEMENT }, "type", { enumerable: true, get() { throw new Error("type"); } });
    const top = topList(GAME);
    expect(() => isGameMenuItemList([...top, throwingEntry])).not.toThrow();
    expect(isGameMenuItemList([...top, throwingEntry])).toBe(false);
    const throwingProps = Object.defineProperty({}, "overview", { enumerable: true, get() { throw new Error("props"); } });
    expect(isGameMenuItemList(top, { props: throwingProps })).toBe(false);
    const cyclic: Record<string, unknown> = { overview: GAME };
    cyclic.self = cyclic;
    cyclic.app = cyclic;
    const cyclicTop = [...top, el(AppEntry, cyclic)];
    expect(isGameMenuItemList(cyclicTop, { props: cyclic })).toBe(true);
    const frozen = deepFreeze(topList(GAME, { extra: pluginEntries() }));
    const context = deepFreeze({ props: classProps(GAME), appid: GAME.appid, menuClass: LibraryMenu });
    const before = JSON.stringify(frozen, (_k, v) => (typeof v === "symbol" ? v.toString() : typeof v === "function" ? v.name : v));
    expect(isGameMenuItemList(frozen, context)).toBe(true);
    expect(JSON.stringify(frozen, (_k, v) => (typeof v === "symbol" ? v.toString() : typeof v === "function" ? v.name : v))).toBe(before);
  });

  it("gives the same answer with or without the plugin's entries", () => {
    const lists: unknown[][] = [
      topList(GAME), topList(SHORTCUT, { inCollection: false }), addToList(), manageList(GAME),
      collectionMenu(), containerOf(topList(GAME)),
    ];
    for (const list of lists) {
      const ctx = { props: classProps(GAME), appid: GAME.appid };
      const base = isGameMenuItemList(list, ctx);
      expect(isGameMenuItemList([...pluginEntries(), ...list], ctx)).toBe(base);
      expect(isGameMenuItemList([...list, ...pluginEntries()], ctx)).toBe(base);
    }
  });

  it("does not use the menu class it is given", () => {
    const top = topList(GAME);
    expect(isGameMenuItemList(top, { props: classProps(GAME), menuClass: OtherMenu })).toBe(true);
    expect(isGameMenuItemList(top, { props: classProps(GAME), menuClass: undefined })).toBe(true);
  });
});
