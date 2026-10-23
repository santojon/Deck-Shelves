// @vitest-environment jsdom
import { act, Component, createElement, forwardRef, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The adapter's afterPatch, shaped like the hosts' helper: wraps the slot, returns { unpatch }.
const host = vi.hoisted(() => ({
  mode: "patch" as "patch" | "none" | "throw",
  refuse: new Set<object>(),
  calls: 0,
}));

vi.mock("../../runtime/host/decky", () => ({
  afterPatch: (obj: any, prop: string, handler: (args: unknown[], ret: unknown) => unknown) => {
    host.calls += 1;
    if (host.mode === "throw") throw new Error("afterPatch failed");
    if (host.mode === "none" || host.refuse.has(obj)) return undefined;
    const original = obj[prop];
    const wrapper = function (this: unknown, ...args: unknown[]) { return handler(args, original.apply(this, args)); };
    obj[prop] = wrapper;
    return { unpatch: () => { if (obj[prop] === wrapper) obj[prop] = original; } };
  },
}));

import { installRecentsRowPatch, type RecentsRowContent, type RecentsRowPatch } from "../../runtime/recentsRowPatch";

const ELEMENT = Symbol.for("react.transitional.element");
const MEMO = Symbol.for("react.memo");
const FORWARD_REF = Symbol.for("react.forward_ref");
const HOME = "/library/home";
const SHARED_KEY = "__ds_recentsRow";
const STEAM_GAMES = [4514790, 1627720, 1332010];

// Steam's output as the production build makes it: plain mutable objects.
function el(type: unknown, props: Record<string, unknown> = {}, key: string | null = null): any {
  return { $$typeof: ELEMENT, type, key, ref: null, props };
}

function memoOf(inner: (...args: any[]) => unknown): any {
  return { $$typeof: MEMO, type: inner, compare: null };
}

const noop = () => {};

// The Home and its recent-games row, in the shape both tested clients draw them.
function steamFixture() {
  const Focusable = function Focusable() { return null; };
  const Art = function Art() { return null; };
  const TileList = function TileList() { return null; };
  const Page = { $$typeof: FORWARD_REF, render: noop };
  const Scroll = { $$typeof: FORWARD_REF, render: noop };
  const Heading = { $$typeof: FORWARD_REF, render: noop };
  const Tabs = memoOf(function Tabs() { return null; });
  const Provider = function Provider() { return null; };
  class Boundary {}
  const games = [...STEAM_GAMES];
  const onItemFocus = vi.fn();
  const refOnItemFocus = { current: vi.fn() };
  const title = el("div", { className: "title", children: "Heading" });
  const heading = el(Heading, { className: "heading", level: "2", children: [title, el("div", { className: "rule" })] });
  const list = el(TileList, { games, autoFocus: true, onItemFocus, showFeaturedItem: true });
  const art = el(Art, { games, refOnItemFocus });
  const rowOutput = el(Focusable, { className: "row", "flow-children": "row", children: [art, el("div", { className: "body", children: [heading, list] })] });
  const rowInner = vi.fn((_props: unknown): any => rowOutput);
  const Row = memoOf(rowInner);
  const rowElement = el(Row, { autoFocus: true, showBackground: true });
  const homeTree = (row: unknown) => el(Provider, { value: {}, children: [false, el(Page, { headerVisibility: 1, children: el(Focusable, { className: "page", children: el(Scroll, { className: "scroll", children: [
    el(Focusable, { className: "section", onFocusWithin: noop, autoFocus: true, focusableIfEmpty: true, children: el(Boundary, { children: row }) }),
    el("div", { className: "tabs", children: el(Tabs, { onFocusWithin: noop, strActiveTab: "a", setActiveTab: noop }) }),
  ] }) }) })] });
  const homeOutput = homeTree(rowElement);
  const homeInner = vi.fn((_props: unknown): any => homeOutput);
  const Home = memoOf(homeInner);
  return { Home, Row, homeInner, rowInner, homeOutput, homeTree, rowOutput, games, onItemFocus, refOnItemFocus, title, list, art, TileList };
}

type Fixture = ReturnType<typeof steamFixture>;

function makeRouter() {
  const patches: Array<{ path: string; patch: (props: any) => any }> = [];
  return {
    patches,
    addPatch: vi.fn((path: string, patch: (props: any) => any) => { patches.push({ path, patch }); return patch; }),
    removePatch: vi.fn((path: string, patch: unknown) => {
      const at = patches.findIndex((p) => p.path === path && p.patch === patch);
      if (at >= 0) patches.splice(at, 1);
      return patch;
    }),
  };
}

type Router = ReturnType<typeof makeRouter>;

function content(over: Partial<RecentsRowContent> = {}): RecentsRowContent {
  return { appIds: [730, 570, 730, 440], title: "Backlog", largeFirstTile: false, ...over };
}

function makeHooks(value: RecentsRowContent | null = content()) {
  return {
    getContent: vi.fn((): RecentsRowContent | null => value),
    // Like the kept half: the first text-only element of the scope gets the title, in place.
    writeTitle: vi.fn((scope: any, title: string) => {
      const node = firstTextElement(scope);
      if (node && title) node.props.children = title;
    }),
    onTileFocus: vi.fn(),
    onReport: vi.fn(),
  };
}

type Hooks = ReturnType<typeof makeHooks>;

// The kept half's lookup: depth first, each object before what it holds, through props/children/child/sibling.
function firstTextElement(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (typeof node.props?.children === "string" && node.props.children.trim()) return node;
  const values = Array.isArray(node) ? node : ["props", "children", "child", "sibling"].map((key) => node[key]);
  for (const value of values) {
    const hit = firstTextElement(value);
    if (hit) return hit;
  }
  return null;
}

function findByType(node: any, type: unknown): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findByType(item, type);
      if (hit) return hit;
    }
    return null;
  }
  if (node.type === type) return node;
  return findByType(node.props?.children, type);
}

function runRoute(router: Router, children: unknown): any {
  return router.patches[0].patch({ path: HOME, children });
}

// What React does with the wrapped slots: call the Home, call the row, draw the row's shell.
function renderHome(f: Fixture): any {
  return f.Home.type({});
}

function drawShell(shell: any): any {
  const Shell = shell.type;
  return new Shell(shell.props).render();
}

function renderRow(f: Fixture): any {
  return drawShell(f.Row.type({ autoFocus: true, showBackground: true }));
}

function allHookCalls(hooks: Hooks): number {
  return hooks.getContent.mock.calls.length + hooks.writeTitle.mock.calls.length
    + hooks.onTileFocus.mock.calls.length + hooks.onReport.mock.calls.length;
}

const handles: RecentsRowPatch[] = [];

function install(router: unknown, hooks: unknown): RecentsRowPatch | null {
  const handle = installRecentsRowPatch(router, hooks as any);
  if (handle) handles.push(handle);
  return handle;
}

// Installs, lets the route patch find the Home and lets one Home render find the row.
function ready(value: RecentsRowContent | null = content()) {
  const f = steamFixture();
  const router = makeRouter();
  const hooks = makeHooks(value);
  const handle = install(router, hooks)!;
  runRoute(router, el(f.Home));
  renderHome(f);
  hooks.getContent.mockClear();
  hooks.onReport.mockClear();
  return { f, router, hooks, handle };
}

beforeEach(() => {
  host.mode = "patch";
  host.refuse.clear();
  host.calls = 0;
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.uninstall();
  delete (globalThis as any)[SHARED_KEY];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("installRecentsRowPatch: install", () => {
  it("returns null without throwing when it cannot install, and leaves nothing registered", () => {
    const hooks = makeHooks();
    expect(install(null, hooks)).toBeNull();
    expect(install(undefined, hooks)).toBeNull();
    expect(install({}, hooks)).toBeNull();
    expect(install({ addPatch: vi.fn() }, hooks)).toBeNull();

    const router = makeRouter();
    expect(install(router, undefined)).toBeNull();
    expect(install(router, null)).toBeNull();
    const { onReport: _missing, ...incomplete } = makeHooks();
    expect(install(router, incomplete)).toBeNull();
    expect(router.addPatch).not.toHaveBeenCalled();

    const throwing = makeRouter();
    throwing.addPatch.mockImplementation(() => { throw new Error("no routes"); });
    expect(install(throwing, hooks)).toBeNull();
    expect(throwing.patches).toHaveLength(0);
    expect((globalThis as any)[SHARED_KEY]).toBeUndefined();
    expect(allHookCalls(hooks)).toBe(0);
  });

  it("returns null and registers nothing when the host's helper cannot wrap a slot", () => {
    const hooks = makeHooks();
    for (const mode of ["none", "throw"] as const) {
      host.mode = mode;
      const router = makeRouter();
      expect(install(router, hooks)).toBeNull();
      expect(router.addPatch).not.toHaveBeenCalled();
    }
    expect(allHookCalls(hooks)).toBe(0);
    expect((globalThis as any)[SHARED_KEY]).toBeUndefined();
  });

  it("reports a Home component it cannot wrap while content is wanted", () => {
    const f = steamFixture();
    host.refuse.add(f.Home);
    const router = makeRouter();
    const hooks = makeHooks();
    install(router, hooks);
    const props = { path: HOME, children: el(f.Home) };
    expect(runRoute(router, props.children).children).toBe(props.children);
    expect(f.Home.type).toBe(f.homeInner);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);
  });

  it("registers one route patch, returns the same handle when called again and starts clean after uninstall", () => {
    const router = makeRouter();
    const first = makeHooks();
    const handle = install(router, first)!;
    expect(handle).not.toBeNull();
    expect(router.addPatch).toHaveBeenCalledTimes(1);
    expect(router.patches[0].path).toBe(HOME);

    const ignored = makeHooks();
    expect(install(router, ignored)).toBe(handle);
    expect(router.addPatch).toHaveBeenCalledTimes(1);
    expect(allHookCalls(first)).toBe(0);

    const earlier = steamFixture();
    runRoute(router, el(earlier.Home));
    renderHome(earlier);
    renderRow(earlier);
    expect(first.onReport.mock.calls).toEqual([[{ kind: "applied" }]]);
    expect(allHookCalls(ignored)).toBe(0);
    Object.values(first).forEach((hook) => hook.mockClear());

    handle.uninstall();
    expect(router.patches).toHaveLength(0);

    const f = steamFixture();
    const second = makeHooks();
    const again = install(router, second)!;
    expect(again).not.toBe(handle);
    expect(router.addPatch).toHaveBeenCalledTimes(2);
    runRoute(router, el(f.Home));
    renderHome(f);
    renderRow(f);
    expect(second.onReport).toHaveBeenCalledWith({ kind: "applied" });
    expect(allHookCalls(first)).toBe(0);
  });

  it("reaches the Home through a host's own wrapper around Steam's component", () => {
    const f = steamFixture();
    const router = makeRouter();
    const hooks = makeHooks();
    install(router, hooks);
    const LoaderRoute = function LoaderRoute(props: unknown) { return el(f.Home, props as Record<string, unknown>); };
    const routed = runRoute(router, el(LoaderRoute));
    expect(routed.children.type).not.toBe(LoaderRoute);
    expect(runRoute(router, el(LoaderRoute)).children.type).toBe(routed.children.type);

    const drawn = routed.children.type({});
    expect(drawn.type).toBe(f.Home);
    expect(f.Home.type).not.toBe(f.homeInner);
    renderHome(f);
    expect(findByType(renderRow(f), f.TileList).props.games).toEqual([730, 570, 440]);
  });

  it("reports a Home route it cannot recognise only while content is wanted", () => {
    const router = makeRouter();
    const quiet = makeHooks(null);
    const handle = install(router, quiet)!;
    const props = { path: HOME, children: el("div") };
    expect(router.patches[0].patch(props)).toBe(props);
    expect(quiet.onReport).not.toHaveBeenCalled();
    handle.uninstall();

    const hooks = makeHooks();
    install(router, hooks);
    expect(router.patches[0].patch(props)).toBe(props);
    expect(hooks.onReport).toHaveBeenCalledTimes(1);
    expect(hooks.onReport.mock.calls[0][0]).toMatchObject({ kind: "not-found" });
  });
});

describe("installRecentsRowPatch: renders", () => {
  it("leaves every output as it is and reports nothing while there is no content", () => {
    const { f, hooks } = ready(null);
    expect(renderHome(f)).toBe(f.homeOutput);
    expect(renderRow(f)).toBe(f.rowOutput);
    expect(f.list.props.games).toEqual(STEAM_GAMES);
    expect(hooks.getContent).toHaveBeenCalledTimes(2);
    expect(hooks.onReport).not.toHaveBeenCalled();
    expect(hooks.writeTitle).not.toHaveBeenCalled();
    expect(hooks.onTileFocus).not.toHaveBeenCalled();
  });

  it("shows the content's games in order without repeats, in the tiles and the art, with the first-tile switch", () => {
    const { f, hooks } = ready(content({ largeFirstTile: true }));
    const out = renderRow(f);
    const list = findByType(out, f.TileList);
    const art = findByType(out, f.art.type);
    expect(list.props.games).toEqual([730, 570, 440]);
    expect(art.props.games).toBe(list.props.games);
    expect(list.props.showFeaturedItem).toBe(true);
    expect(list.props.autoFocus).toBe(true);
    expect(art.props.refOnItemFocus).toBe(f.refOnItemFocus);

    expect(hooks.getContent).toHaveBeenCalledTimes(1);
    expect(hooks.writeTitle).toHaveBeenCalledTimes(1);
    const [scope, title] = hooks.writeTitle.mock.calls[0];
    expect(title).toBe("Backlog");
    const target = firstTextElement(scope);
    expect(target.type).toBe("div");
    expect(target.props.className).toBe("title");
    expect(firstTextElement(out)).toBe(target);
    expect(target.props.children).toBe("Backlog");
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "applied" }]]);

    // Steam's own objects are never written to.
    expect(f.title.props.children).toBe("Heading");
    expect(f.list.props.games).toEqual(STEAM_GAMES);
    expect(f.list.props.showFeaturedItem).toBe(true);
    expect(f.games).toEqual(STEAM_GAMES);
  });

  it("sets the first-tile switch off, keeps an empty title and still reports applied", () => {
    const { f, hooks } = ready(content({ largeFirstTile: false, title: "" }));
    const out = renderRow(f);
    expect(findByType(out, f.TileList).props.showFeaturedItem).toBe(false);
    expect(hooks.writeTitle).toHaveBeenCalledWith(expect.anything(), "");
    expect(firstTextElement(out).props.children).toBe("Heading");
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "applied" }]]);
  });

  it("shows a single game as given", () => {
    const { f } = ready(content({ appIds: [570], largeFirstTile: true }));
    expect(findByType(renderRow(f), f.TileList).props.games).toEqual([570]);
  });

  it("reports one not-found for a Home without the row and for a row without what it needs", () => {
    const { f, hooks } = ready();
    const bare = f.homeTree(null);
    f.homeInner.mockReturnValueOnce(bare);
    expect(renderHome(f)).toBe(bare);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);

    hooks.onReport.mockClear();
    const plain = el("div", { className: "row", children: el("h2", { children: "Heading" }) });
    f.rowInner.mockReturnValueOnce(plain);
    expect(renderRow(f)).toBe(plain);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);
    expect(hooks.writeTitle).not.toHaveBeenCalled();
    const detail = hooks.onReport.mock.calls[0][0].detail;
    expect(detail.length).toBeLessThanOrEqual(120);
  });

  it("reports one error when getContent throws during a Home render", () => {
    const { f, hooks } = ready();
    hooks.getContent.mockImplementationOnce(() => { throw new Error("content broke"); });
    expect(renderHome(f)).toBe(f.homeOutput);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "error", detail: "content broke" }]]);
  });

  it("reports not-found and keeps Steam's output when the tile list sits under another element taking the games", () => {
    const { f, hooks } = ready();
    const nested = el("div", { className: "row", children: [
      el("div", { className: "title", children: "Heading" }),
      el(f.art.type, { games: f.games, children: f.list }),
    ] });
    f.rowInner.mockReturnValueOnce(nested);
    expect(renderRow(f)).toBe(nested);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);
    expect(hooks.writeTitle).not.toHaveBeenCalled();
    expect(f.list.props.games).toBe(f.games);
  });

  it("reports not-found when no element of the row holds the heading text alone", () => {
    const { f, hooks } = ready();
    const row = el("div", { className: "row", children: [el("div", { className: "title", children: ["Heading"] }), f.list] });
    f.rowInner.mockReturnValueOnce(row);
    expect(renderRow(f)).toBe(row);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);
    expect(hooks.writeTitle).not.toHaveBeenCalled();
  });

  it("hands the list the same games and relay while the content and Steam's callback stay the same", () => {
    const { f, hooks } = ready();
    const first = findByType(renderRow(f), f.TileList);
    const again = findByType(renderRow(f), f.TileList);
    expect(again.props.games).toBe(first.props.games);
    expect(again.props.onItemFocus).toBe(first.props.onItemFocus);

    const callback = vi.fn();
    const list = el(f.TileList, { ...f.list.props, onItemFocus: callback });
    f.rowInner.mockReturnValueOnce(el("div", { children: [el("div", { children: "Heading" }), list] }));
    const moved = findByType(renderRow(f), f.TileList);
    expect(moved.props.games).toBe(first.props.games);
    expect(moved.props.onItemFocus).not.toBe(first.props.onItemFocus);
    moved.props.onItemFocus(570);
    expect(callback).toHaveBeenCalledWith(570);

    hooks.getContent.mockReturnValue(content({ appIds: [440] }));
    const changed = findByType(renderRow(f), f.TileList);
    expect(changed.props.games).toEqual([440]);
    expect(changed.props.onItemFocus).not.toBe(moved.props.onItemFocus);
  });

  it("keeps the row's output in the shell's children, where other tree searches reach it", () => {
    const { f } = ready();
    const shell = f.Row.type({ autoFocus: true, showBackground: true });
    expect(shell.props.children).toBe(f.rowOutput);
    expect(findByType(shell, f.TileList)).toBe(f.list);
  });

  it("does not report a Home render that holds the row", () => {
    const { f, hooks } = ready();
    expect(renderHome(f)).toBe(f.homeOutput);
    expect(hooks.onReport).not.toHaveBeenCalled();
    expect(hooks.getContent).toHaveBeenCalledTimes(1);
  });

  it("never throws out of a render when a hook or a step fails", () => {
    const { f, hooks } = ready();
    hooks.getContent.mockImplementationOnce(() => { throw new Error("content broke"); });
    expect(renderRow(f)).toBe(f.rowOutput);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "error", detail: "content broke" }]]);

    hooks.onReport.mockClear();
    hooks.writeTitle.mockImplementationOnce(() => { throw new Error("title broke"); });
    const out = renderRow(f);
    expect(findByType(out, f.TileList).props.games).toEqual([730, 570, 440]);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "applied" }]]);

    hooks.onReport.mockClear();
    hooks.onReport.mockImplementation(() => { throw new Error("report broke"); });
    expect(() => renderRow(f)).not.toThrow();
    expect(() => renderHome(f)).not.toThrow();

    hooks.onReport.mockReset();
    hooks.getContent.mockReturnValueOnce({ appIds: 42 as unknown as number[], title: "x", largeFirstTile: false });
    expect(renderRow(f)).toBe(f.rowOutput);
    expect(hooks.onReport.mock.calls).toHaveLength(1);
    expect(hooks.onReport.mock.calls[0][0].kind).toBe("error");
  });

  it("tells the kept half which game a focused tile shows, from the focus path only", () => {
    const { f, hooks } = ready();
    const list = findByType(renderRow(f), f.TileList);
    expect(hooks.onTileFocus).not.toHaveBeenCalled();

    list.props.onItemFocus(570);
    expect(f.onItemFocus).toHaveBeenLastCalledWith(570);
    expect(hooks.onTileFocus).toHaveBeenLastCalledWith(570);

    list.props.onItemFocus(2);
    expect(hooks.onTileFocus).toHaveBeenLastCalledWith(440);

    list.props.onItemFocus({ appid: 730 });
    expect(hooks.onTileFocus).toHaveBeenLastCalledWith(730);

    hooks.onTileFocus.mockClear();
    list.props.onItemFocus(undefined);
    list.props.onItemFocus(3);
    expect(hooks.onTileFocus).not.toHaveBeenCalled();
    expect(f.onItemFocus).toHaveBeenCalledTimes(5);
  });

  it("wraps the Home and the row once, whatever the number of renders", () => {
    const { f } = ready();
    const calls = host.calls;
    renderHome(f);
    renderHome(f);
    renderRow(f);
    expect(host.calls).toBe(calls);
  });
});

describe("installRecentsRowPatch: uninstall", () => {
  it("removes the route patch, restores the slots, calls no hook afterwards and is harmless twice", () => {
    const { f, router, hooks, handle } = ready();
    const leftShell = f.Row.type({ autoFocus: true, showBackground: true });
    handle.uninstall();
    expect(router.patches).toHaveLength(0);
    expect(f.Home.type).toBe(f.homeInner);
    expect(f.Row.type).toBe(f.rowInner);

    hooks.getContent.mockClear();
    expect(drawShell(leftShell)).toBe(f.rowOutput);
    expect(handle.requestRender()).toBe(false);
    expect(allHookCalls(hooks)).toBe(0);
    expect(() => handle.uninstall()).not.toThrow();
  });

  it("never throws when a wrapped slot can no longer be written, and still lets go of the row", () => {
    const { f, hooks, handle } = ready();
    const wrapped = f.Row.type;
    Object.defineProperty(f.Row, "type", { value: wrapped, writable: false });
    expect(() => handle.uninstall()).not.toThrow();
    expect(f.Row.type).toBe(wrapped);
    expect(f.Home.type).toBe(f.homeInner);
    expect((globalThis as any)[SHARED_KEY].owner).toBeNull();
    hooks.getContent.mockClear();
    expect(drawShell(f.Row.type({ autoFocus: true, showBackground: true }))).toBe(f.rowOutput);
    expect(allHookCalls(hooks)).toBe(0);
  });

  it("stops reporting tile focus after uninstall while Steam's callback still runs", () => {
    const { f, hooks, handle } = ready();
    const list = findByType(renderRow(f), f.TileList);
    handle.uninstall();
    list.props.onItemFocus(570);
    expect(f.onItemFocus).toHaveBeenLastCalledWith(570);
    expect(hooks.onTileFocus).not.toHaveBeenCalled();
  });

  it("leaves its wrapper as a pass-through when another wrapper sits on top", () => {
    const { f, hooks, handle } = ready();
    const ours = f.Row.type;
    const other = vi.fn(function (this: unknown, ...args: unknown[]) { return ours.apply(this, args); });
    f.Row.type = other;
    handle.uninstall();
    expect(f.Row.type).toBe(other);
    hooks.getContent.mockClear();
    expect(drawShell(f.Row.type({ autoFocus: true, showBackground: true }))).toBe(f.rowOutput);
    expect(allHookCalls(hooks)).toBe(0);
  });
});

describe("installRecentsRowPatch: copies", () => {
  it("lets the newest copy change the row while the older one calls none of its hooks", async () => {
    const { f, router: olderRouter, hooks: older, handle: first } = ready(content({ appIds: [1, 2] }));
    const olderList = findByType(renderRow(f), f.TileList);
    vi.resetModules();
    const copy = await import("../../runtime/recentsRowPatch");
    const newer = makeHooks(content({ appIds: [570, 440], title: "Newer" }));
    const router = makeRouter();
    const second = copy.installRecentsRowPatch(router, newer)!;
    handles.push(second);
    expect(second).not.toBe(first);
    Object.values(older).forEach((hook) => hook.mockClear());

    const out = renderRow(f);
    expect(findByType(out, f.TileList).props.games).toEqual([570, 440]);
    expect(firstTextElement(out).props.children).toBe("Newer");
    expect(newer.onReport).toHaveBeenCalledWith({ kind: "applied" });
    expect(first.requestRender()).toBe(false);
    expect(renderHome(f)).toBe(f.homeOutput);

    const props = { path: HOME, children: el(f.Home) };
    expect(olderRouter.patches[0].patch(props)).toBe(props);
    olderList.props.onItemFocus(1);
    expect(f.onItemFocus).toHaveBeenLastCalledWith(1);
    expect(newer.onTileFocus).not.toHaveBeenCalled();
    expect(allHookCalls(older)).toBe(0);
  });

  it("keeps the newest copy in charge when a superseded copy is uninstalled after it", async () => {
    const { f, hooks: older, handle: first } = ready(content({ appIds: [1, 2] }));
    vi.resetModules();
    const copy = await import("../../runtime/recentsRowPatch");
    const newer = makeHooks(content({ appIds: [570, 440], title: "Newer" }));
    const second = copy.installRecentsRowPatch(makeRouter(), newer)!;
    handles.push(second);

    first.uninstall();
    expect(f.Home.type).not.toBe(f.homeInner);
    expect(f.Row.type).not.toBe(f.rowInner);
    Object.values(older).forEach((hook) => hook.mockClear());
    expect(renderHome(f)).toBe(f.homeOutput);
    expect(findByType(renderRow(f), f.TileList).props.games).toEqual([570, 440]);
    expect(newer.onReport).toHaveBeenLastCalledWith({ kind: "applied" });
    expect(allHookCalls(older)).toBe(0);

    second.uninstall();
    expect(f.Home.type).toBe(f.homeInner);
    expect(f.Row.type).toBe(f.rowInner);
  });
});

describe("installRecentsRowPatch: runtime cost", () => {
  it("leaves no timer behind", () => {
    vi.useFakeTimers();
    const { f, handle } = ready();
    renderHome(f);
    renderRow(f);
    handle.requestRender();
    handle.uninstall();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("writes no global but the shared window property", () => {
    const before = new Set(Object.keys(globalThis));
    const { f, handle } = ready();
    renderHome(f);
    renderRow(f);
    handle.requestRender();
    handle.uninstall();
    const added = Object.keys(globalThis).filter((key) => !before.has(key));
    expect(added).toEqual([SHARED_KEY]);
  });
});

// The row drawn by React, so the re-render path runs through React's own update queue.
function reactFixture() {
  const listProps: any[] = [];
  const onItemFocus = vi.fn();
  const refOnItemFocus = { current: null };
  const TileList = (props: any) => {
    listProps.push(props);
    return createElement("div", { role: "list" }, props.games.map((id: number) => createElement("button", { key: id, "data-appid": id })));
  };
  const Art = (props: any) => createElement("div", { "data-art": props.games[0] });
  const Heading = forwardRef((props: any, ref: any) => createElement("h2", { ref, className: props.className }, props.children));
  const Focusable = (props: any) => createElement("div", { className: props.className }, props.children);
  class Boundary extends Component<{ children?: any }> {
    render() { return this.props.children; }
  }
  const rowInner = vi.fn((_props: any) => createElement(Focusable, { className: "row" },
    createElement(Art, { games: STEAM_GAMES, refOnItemFocus }),
    createElement("div", { className: "body" },
      createElement(Heading, { className: "heading", level: "2" },
        createElement("div", { className: "title" }, "Heading"),
        createElement("div", { className: "rule" })),
      createElement(TileList, { games: STEAM_GAMES, autoFocus: true, onItemFocus, showFeaturedItem: true }))));
  const Row = memo(rowInner) as any;
  const homeInner = () => createElement("main", null, createElement(Boundary, null, createElement(Row, { autoFocus: true, showBackground: true })));
  const Home = memo(homeInner) as any;
  return { Home, Row, rowInner, listProps };
}

describe("installRecentsRowPatch: requestRender", () => {
  let root: Root;
  let mount: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  async function drawHome(value: RecentsRowContent | null) {
    const r = reactFixture();
    const router = makeRouter();
    const hooks = makeHooks(value);
    const handle = install(router, hooks)!;
    runRoute(router, createElement(r.Home));
    await act(async () => root.render(createElement(r.Home)));
    return { r, hooks, handle };
  }

  it("returns false with no row mounted", () => {
    const hooks = makeHooks();
    const handle = install(makeRouter(), hooks)!;
    expect(handle.requestRender()).toBe(false);
    expect(hooks.onReport).not.toHaveBeenCalled();
  });

  it("renders a mounted row once for two calls, keeping its elements, and returns false after uninstall", async () => {
    const { r, hooks, handle } = await drawHome(content());
    expect(r.listProps.at(-1).games).toEqual([730, 570, 440]);
    expect(mount.querySelector(".title")?.textContent).toBe("Backlog");
    const list = mount.querySelector('[role="list"]');

    hooks.getContent.mockClear();
    let results: boolean[] = [];
    await act(async () => { results = [handle.requestRender(), handle.requestRender()]; });
    expect(results).toEqual([true, true]);
    expect(hooks.getContent).toHaveBeenCalledTimes(1);
    expect(mount.querySelector('[role="list"]')).toBe(list);

    hooks.getContent.mockReturnValue(content({ appIds: [10, 20], title: "Next" }));
    await act(async () => { handle.requestRender(); });
    expect(r.listProps.at(-1).games).toEqual([10, 20]);
    expect(mount.querySelector(".title")?.textContent).toBe("Next");
    expect(mount.querySelector('[role="list"]')).toBe(list);

    await act(async () => { handle.uninstall(); });
    expect(r.listProps.at(-1).games).toEqual(STEAM_GAMES);
    expect(mount.querySelector(".title")?.textContent).toBe("Heading");
    expect(mount.querySelector('[role="list"]')).toBe(list);
    expect(handle.requestRender()).toBe(false);
  });

  it("brings a row already on screen under a new install without mounting it again", async () => {
    const { r, handle } = await drawHome(content());
    const list = mount.querySelector('[role="list"]');
    await act(async () => { handle.uninstall(); });
    expect(r.listProps.at(-1).games).toEqual(STEAM_GAMES);

    const hooks = makeHooks(content({ appIds: [570], title: "Reloaded" }));
    let callsDuringInstall = -1;
    await act(async () => {
      install(makeRouter(), hooks);
      callsDuringInstall = hooks.writeTitle.mock.calls.length + hooks.onReport.mock.calls.length + hooks.onTileFocus.mock.calls.length;
    });
    expect(callsDuringInstall).toBe(0);
    expect(r.listProps.at(-1).games).toEqual([570]);
    expect(mount.querySelector(".title")?.textContent).toBe("Reloaded");
    expect(mount.querySelector('[role="list"]')).toBe(list);
    expect(hooks.onReport).toHaveBeenCalledWith({ kind: "applied" });
  });

  it("reports not-found when the row is on screen but out of reach while content is wanted", async () => {
    const r = reactFixture();
    host.refuse.add(r.Row);
    const router = makeRouter();
    const hooks = makeHooks();
    const handle = install(router, hooks)!;
    runRoute(router, createElement(r.Home));
    await act(async () => root.render(createElement(r.Home)));
    expect(hooks.onReport).toHaveBeenCalledWith({ kind: "not-found", detail: expect.any(String) });

    hooks.onReport.mockClear();
    expect(handle.requestRender()).toBe(false);
    expect(hooks.onReport.mock.calls).toEqual([[{ kind: "not-found", detail: expect.any(String) }]]);
    expect(r.listProps.at(-1).games).toEqual(STEAM_GAMES);
  });
});
