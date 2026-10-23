// @vitest-environment jsdom
/* The role options and the host role, on a copy of the Quick Access panel fixture. React's own
   renderer supplies the rules the component relies on: a mounted memo keeps the inner function it
   mounted with, a changed element type mounts anew, a memoized list keeps its identity while its
   inputs are equal, and a render that throws unmounts its tree with its layout cleanups (E4,
   E12). The strip stays mounted while the panel is closed (E2); changeable elements are plain objects. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, createElement, Fragment, memo, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

const reg = vi.hoisted(() => ({ modules: [] as unknown[], scans: 0 }));
const logs = vi.hoisted(() => [] as Array<{ level: string; message: string }>);

vi.mock("../../runtime/host/decky", () => ({
  findModule: (filter: (m: unknown) => boolean) => { reg.scans += 1; return reg.modules.find((m) => filter(m)); },
}));
vi.mock("../../runtime/logger", () => ({
  logInfo: (_s: string, message: string) => { logs.push({ level: "info", message }); },
  logWarn: (_s: string, message: string) => { logs.push({ level: "warn", message }); },
  logError: (_s: string, message: string) => { logs.push({ level: "error", message }); },
}));

type Mod = typeof import("../../runtime/ownQamTab");
type AnyEntry = Record<string | symbol, any> & { key: number };
type Flags = { voice?: boolean; perf?: boolean };
type Draw = { list: AnyEntry[]; keys: number[]; entries: AnyEntry[] };

const ELEMENT = Symbol.for("react.transitional.element");
const STEAM_FIELDS = new Set(["key", "tab", "title", "strTitle", "panel", "vrPopupSize", "vrLocation", "className", "eFeature", "allowInKioskMode"]);
const TABLE_NAMES = ["Notifications", "RemotePlayTogetherControls", "VoiceChat", "Friends", "Settings", "Perf", "Help", "Soundtrack", "VRBatteries"];

// A plain element object that the component may change (Steam's production elements are not frozen).
function el(type: unknown, props: Record<string, unknown>, key: string | null = null): any {
  return { $$typeof: ELEMENT, type, key, ref: null, props, _owner: null, _store: { validated: 1 } };
}

// The tab lists in a render result, as another party would find them.
function findLists(out: unknown): AnyEntry[][] {
  const found = new Set<AnyEntry[]>();
  const isList = (v: any) => Array.isArray(v) && v.length > 0 && typeof v[0]?.key === "number" && "panel" in v[0];
  for (const stack: any[] = [out]; stack.length; ) {
    const n = stack.pop();
    if (n && typeof n === "object") for (const v of Array.isArray(n) ? n : n.$$typeof === Symbol.for("react.portal") ? [n.children] : Object.values(n.props ?? {})) if (isList(v)) found.add(v); else stack.push(v);
  }
  return [...found];
}

// A fixture error boundary: a draw that throws leaves an empty strip while Steam keeps running.
class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function makeSteam(win: any) {
  const fx: any = {
    flags: { voice: false } as Flags, open: false, remembered: 4, rootType: null, draws: [] as Draw[], lastList: null, rootMounts: 0,
    crashOn: null, beforeStrip: [] as Array<(list: AnyEntry[]) => void>, forceRoot: [] as Array<() => void>, forceApp: () => {},
    table: Object.fromEntries(TABLE_NAMES.flatMap((name, i) => [[name, i], [i, name]])), steamReads: 0, firstReadAt: null as number | null,
    panelDoc: document.implementation.createHTMLDocument("QuickAccess"), container: document.createElement("div"),
  };
  const Content = ({ k }: { k: number }) => createElement("p", null, `content ${k}`);
  function entry(key: number, emptyTitle = false): AnyEntry {
    const title = emptyTitle ? createElement(Fragment) : createElement("h2", null, `en-${key}`);
    return { key, tab: createElement("i", { "data-steam-icon": key }), title, strTitle: `en-${key}`, panel: createElement(Content, { k: key }), vrPopupSize: { width: 400, height: 600 }, vrLocation: key === 2 ? "dashboard-bar" : "quick-access-menu" };
  }
  // Steam's order, each optional tab only while its flag is on (E4, E5).
  function buildList(flags: Flags): AnyEntry[] {
    const wanted: Array<[unknown, number, boolean?]> = [[flags.voice, 2, true], [true, 0], [true, 3, true], [true, 4], [flags.perf !== false, 5], [true, 7], [true, 6]];
    return wanted.filter(([want]) => want).map(([, key, empty]) => entry(key, empty));
  }
  const shownKey = (list: AnyEntry[]) => (list.find((e) => e.key === fx.remembered) ?? list[0])?.key;
  function Strip({ items, selected }: { items: AnyEntry[]; selected: number }) {
    for (const hook of fx.beforeStrip) hook(items);
    if (fx.crashOn) for (const e of items) if (fx.crashOn(e)) throw new Error("strip failed");
    useLayoutEffect(() => { fx.draws.push({ list: items, keys: items.map((e) => e.key), entries: items.slice() }); });
    return createElement("div", { role: "tablist" }, items.map((e) => createElement("button", {
      key: String(e.key), id: `quickaccess_tab_${e.key}`, role: "tab", "aria-label": e.strTitle, "aria-selected": e.key === selected, onFocus: () => fx.select(e.key),
    }, e.tab)));
  }
  // Keeps a tab's panel mounted once it was shown (the keep-alive time, E8).
  const Item = memo(function Item({ entry: e, shown, visible }: { entry: AnyEntry; shown: boolean; visible: boolean }) {
    const [kept, setKept] = useState(false);
    if (shown && visible && !kept) setKept(true);
    const wrapper = createElement("div", { id: `quickaccess_content_${e.key}`, role: "tabpanel" }, (shown && visible) || kept ? e.panel : null);
    return createElement(Fragment, null, e.title, wrapper);
  });
  function Container({ items, selected, menuOpen }: { items: AnyEntry[]; selected: number; menuOpen: boolean }) {
    return createElement("div", { className: "panels" }, items.map((e) => createElement(Item, { key: String(e.key), entry: e, shown: e.key === selected, visible: menuOpen })));
  }
  function Root(props: any) {
    const [, force] = useState(0);
    useEffect(() => {
      const f = () => force((n) => n + 1);
      fx.rootMounts += 1;
      fx.forceRoot.push(f);
      return () => { fx.forceRoot = fx.forceRoot.filter((x: unknown) => x !== f); };
    }, []);
    const list = useMemo(() => buildList(fx.flags), [fx.flags.voice, fx.flags.perf]);
    const shown = shownKey(list);
    fx.lastList = list;
    const strip = el(Strip, { items: list, selected: shown });
    return el("section", { className: "qam-root", children: [
      el("div", { className: "strip-holder", children: [fx.boundary ? el(Boundary, { children: strip }, "strip") : { ...strip, key: "strip" }] }, "a"),
      el(Container, { items: list, selected: shown, menuOpen: !!props.visible }, "b"),
    ] });
  }
  function noop() {}
  const rootProps = () => ({ active: fx.open, visible: fx.open, expanded: false, showHeaderAndFooter: true, onFocusNavActivated: noop, onFocusNavDeactivated: noop });
  // The view that renders the root through a portal into the panel's own document (E2, E3).
  const PanelView = memo(function PanelView(props: any) {
    return el("div", { className: "panel-view", children: [el("span", { children: "view" }, "s"), createPortal(el(fx.rootType ?? Root, props), fx.panelDoc.body, "p")] });
  });
  function App() {
    const [, force] = useState(0);
    fx.forceApp = () => force((n) => n + 1);
    return el("main", { id: "gamepad-main", children: [el(PanelView, rootProps(), "pv")] });
  }
  const panelModule: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ a: Root, b: PanelView, d: buildList })) Object.defineProperty(panelModule, name, { get: () => value, enumerable: true });
  const tableModule: Record<string, unknown> = {};
  Object.defineProperty(tableModule, "t", { get: () => { fx.steamReads += 1; return fx.table; }, enumerable: true });
  Object.assign(fx, { modules: [{ x: 1 }, panelModule, tableModule], Root });
  fx.uiStore = { WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: { document } } } };
  win.SteamUIStore = new Proxy(fx.uiStore, { get: (t: any, k) => { fx.steamReads += 1; fx.firstReadAt ??= Date.now(); return t[k]; } });
  fx.mount = () => { document.body.appendChild(fx.container); fx.reactRoot = createRoot(fx.container); act(() => { fx.reactRoot.render(createElement(App)); }); };
  fx.unmount = () => { try { act(() => { fx.reactRoot?.unmount(); }); } catch {} fx.container.remove(); };
  fx.openPanel = () => act(() => { fx.open = true; fx.forceApp(); });
  fx.closePanel = () => act(() => { fx.open = false; fx.forceApp(); });
  fx.select = (key: number) => { fx.remembered = key; for (const f of fx.forceRoot) f(); };
  fx.selectTab = (key: number) => act(() => { fx.select(key); });
  fx.setFlags = (flags: Flags) => act(() => { fx.flags = { ...fx.flags, ...flags }; for (const f of fx.forceRoot) f(); });
  fx.lastDraw = (): Draw => fx.draws[fx.draws.length - 1];
  // Another party that puts its entry into every list the root builds (the loader model of E6, E10).
  fx.addParty = (party: any, afterPerf = false) => {
    const base = fx.rootType ?? Root;
    fx.rootType = function OtherParty(props: any) {
      const out = base(props);
      for (const l of findLists(out)) if (!l.includes(party)) l.splice(afterPerf ? l.findIndex((e) => e.key === 5) + 1 : l.length, 0, party);
      return out;
    };
  };
  fx.installLoader = () => fx.addParty({ key: 999, tab: createElement("b", null, "L"), panel: createElement("div", null, "loader"), loaderField: 1 });
  // The neutral host's model: its entry after performance, its stamp written when it inserts it.
  fx.installHost = () => {
    const host = { key: 900, tab: createElement("i", null, "H"), title: createElement(Fragment), strTitle: "Deck Shelves", panel: createElement("div", null, "host panel"), vrLocation: "quick-access-menu", __shelvesTab: true };
    const base = fx.rootType ?? Root;
    fx.rootType = function HostRoot(props: any) {
      const out = base(props);
      for (const l of findLists(out)) if (!l.includes(host)) { l.splice(l.findIndex((e) => e.key === 5) + 1 || l.length, 0, host); win.__SHELVES_QAM_OWNER__ = "neutral-host"; }
      return out;
    };
  };
  return fx;
}

type Settings = { isEnabled: () => boolean; subscribe: (l: () => void) => () => void; set: (v: boolean | undefined) => void; listeners: Set<() => void> };

function settingsSource(initial: boolean | undefined): Settings {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => { listeners.add(l); if (state !== undefined) l(); return () => { listeners.delete(l); }; };
  return { isEnabled: () => state === true, subscribe, set: (v) => { state = v; for (const l of [...listeners]) l(); }, listeners };
}

function pluginPanel() {
  const stats = { calls: 0, renders: 0, mounts: 0 };
  const PluginPanel = () => { stats.renders += 1; useEffect(() => { stats.mounts += 1; }, []); return createElement("div", { "data-plugin-panel": "1" }, "plugin panel"); };
  const elements: unknown[] = [];
  return { stats, elements, factory: () => { stats.calls += 1; const e = el(PluginPanel, {}); elements.push(e); return e; } };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); }, clear: () => map.clear(), key: (i: number) => [...map.keys()][i] ?? null, get length() { return map.size; },
  };
}

// ---- sessions ----

let fx: any;
let win: any;
let store: ReturnType<typeof memoryStorage>;
let mod: Mod;
const mountedFixtures: any[] = [];
// When set, the component sees the window through a proxy that records the names it writes.
let windowWrites: string[] | null = null;

async function freshModule(): Promise<Mod> {
  vi.resetModules(); return await import("../../runtime/ownQamTab");
}

// The work queued after a draw has run long before Steam stops; a simulated restart lets it run.
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

function recordingWindow(target: any, names: string[]): any {
  return new Proxy(target, {
    set: (t, k, v) => { names.push(String(k)); t[k] = v; return true; },
    defineProperty: (t, k, d) => { names.push(String(k)); return Reflect.defineProperty(t, k, d); },
    deleteProperty: (t, k) => { names.push(String(k)); return Reflect.deleteProperty(t, k); },
  });
}

async function newSession(): Promise<void> {
  await flush();
  if (fx) fx.unmount();
  win = { document };
  vi.stubGlobal("window", windowWrites ? recordingWindow(win, windowWrites) : win);
  fx = makeSteam(win);
  Object.assign(reg, { modules: fx.modules, scans: 0 }); mountedFixtures.push(fx);
  fx.mount();
  mod = await freshModule();
}

const icon = createElement("svg", { "data-icon": "deck-shelves" });
const HOST_KEY = 900;
const HOST_GUARD = "test-host:qam-tab-guard";

function install(s: Settings, panel = pluginPanel(), extra: Record<string, unknown> = {}, m: Mod = mod) {
  return { panel, uninstall: m.installOwnQamTab({ title: "Deck Shelves", icon, renderPanel: panel.factory, isEnabled: s.isEnabled, subscribe: s.subscribe, ...extra }) };
}

// The host role's values: the neutral host's key and marker, no yielding and a guard key of its own.
function installHostRole(s: Settings, panel = pluginPanel(), extra: Record<string, unknown> = {}, m: Mod = mod) {
  return install(s, panel, { yieldToHostTab: false, markerFields: { __shelvesTab: true }, key: HOST_KEY, onFirstDraw: () => {}, guardKey: HOST_GUARD, ...extra }, m);
}

const on = () => settingsSource(true);
const runDeferred = (ms = 2000) => vi.advanceTimersByTime(ms);
const ownEntries = (list: AnyEntry[]) => list.filter((e) => Object.getOwnPropertySymbols(e).length > 0);
const hostEntries = (list: AnyEntry[]) => ownEntries(list).filter((e) => e.__shelvesTab === true);
const pluginEntries = (list: AnyEntry[]) => ownEntries(list).filter((e) => !("__shelvesTab" in e));
const steamReads = () => fx.steamReads + reg.scans;
const count = (level: string) => logs.filter((l) => l.level === level).length;
const yieldReports = () => logs.filter((l) => /stepping aside/.test(l.message)).length;
const pauseLines = () => logs.filter((l) => l.level === "warn" && /paused/.test(l.message)).length;
const cycle = (n: number) => { for (let i = 0; i < n; i++) { fx.openPanel(); fx.closePanel(); } };
const isHostSignal = (name: string) => name.startsWith("__SHELVES");
const crashHost = (e: AnyEntry) => hostEntries([e]).length > 0;
const crashPlugin = (e: AnyEntry) => pluginEntries([e]).length > 0;
// The only names written to the global object: the guard key's session marker, which holds only the session's id.
const markerKeys = (names: string[]) => [...new Set(names)].map((n) => [isHostSignal(n), Reflect.ownKeys(win[n])]);
const expectOneMarker = () => expect(markerKeys(windowWrites!)).toEqual([[false, ["sid"]]]);

// Openings with the work queued after each draw run in between, as on the device.
async function openings(n: number): Promise<Draw[]> {
  const out: Draw[] = [];
  for (let i = 0; i < n; i++) { fx.openPanel(); out.push(fx.lastDraw()); fx.closePanel(); await flush(); }
  return out;
}

// The neutral host's stand-in: an activation on at once, a recording first-draw report that can
// write the owner stamp, and a stop that uninstalls and then unsets the stamp it wrote.
function hostStandIn(opts: { stamp?: boolean; report?: () => void } = {}) {
  const activation = on();
  const calls: Array<{ drawn: boolean }> = [];
  const panel = pluginPanel();
  let installed: { uninstall: () => void } | null = null;
  const onFirstDraw = () => {
    calls.push({ drawn: fx.draws.some((d: Draw) => hostEntries(d.entries).length > 0) });
    if (opts.stamp) win.__SHELVES_QAM_OWNER__ = "neutral-host";
    opts.report?.();
  };
  return {
    activation, calls, panel,
    start: (m: Mod = mod, extra: Record<string, unknown> = {}) => { installed = installHostRole(activation, panel, { onFirstDraw, ...extra }, m); },
    stop: () => { installed?.uninstall(); if (opts.stamp) delete win.__SHELVES_QAM_OWNER__; },
  };
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("SP_REACT", React);
  vi.spyOn(console, "error").mockImplementation(() => {});
  reg.scans = 0; logs.length = 0; fx = null; windowWrites = null;
});

afterEach(() => {
  for (const f of mountedFixtures.splice(0)) f.unmount();
  fx = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("ownQamTab — the role options and the host role", () => {
  // The plugin role's scenarios of U1, U13 and U25, with their outcomes.
  async function pluginScenarios(): Promise<void> {
    await newSession(); fx.installLoader(); cycle(1);
    const before = fx.lastList.slice();
    install(on()); runDeferred(); fx.openPanel();
    const draw: Draw = fx.lastDraw();
    const [e, ...extra] = ownEntries(draw.entries);
    const at = draw.keys.indexOf(e.key);
    expect([extra.length, draw.keys[at - 1], at < draw.keys.indexOf(999), e.strTitle, e.title.type, "__shelvesTab" in e]).toEqual([0, 5, true, "Deck Shelves", Fragment, false]);
    for (const name of Object.keys(e)) expect(STEAM_FIELDS.has(name)).toBe(true);
    expect(draw.entries.filter((x) => x !== e)).toEqual(before);

    for (const hostEntry of [true, false]) {
      await newSession();
      if (hostEntry) { fx.installHost(); cycle(1); } else win.__SHELVES_QAM_OWNER__ = "neutral-host";
      logs.length = 0;
      install(on()); runDeferred(); cycle(10);
      for (const d of fx.draws as Draw[]) expect(ownEntries(d.entries)).toHaveLength(0);
      expect(yieldReports()).toBe(1);
    }
    delete win.__SHELVES_QAM_OWNER__;
    fx.openPanel();
    expect(ownEntries(fx.lastDraw().entries)).toHaveLength(1);

    const crashes = [[0, 0], [0, -1, 0], [1, 1], [2, 2]];
    for (const [i, kinds] of crashes.entries()) {
      store.clear();
      for (const kind of kinds) await pluginStart(kind);
      expect(await pluginStartPaused()).toBe(i !== 1);
    }
  }

  // kind 0: the first draw crashes; 1: a fixture boundary catches it; 2: a later list crashes; -1: no crash.
  async function pluginStart(kind: number): Promise<void> {
    await newSession();
    fx.boundary = kind === 1;
    if (kind === 0 || kind === 1) fx.crashOn = crashPlugin;
    install(on()); runDeferred();
    if (kind === 0) { expect(() => fx.openPanel()).toThrow(); return; }
    cycle(kind === 1 ? 2 : 1);
    await flush();
    if (kind !== 2) return;
    fx.crashOn = (e: AnyEntry) => !!fx.flags.voice && crashPlugin(e);
    expect(() => fx.setFlags({ voice: true })).toThrow();
  }

  async function pluginStartPaused(): Promise<boolean> {
    await newSession(); logs.length = 0;
    install(on()); vi.advanceTimersByTime(60000); fx.openPanel();
    if (steamReads() === 0) expect(pauseLines()).toBe(1);
    return steamReads() === 0;
  }

  it("U48 — no role option gives the plugin role, one guard key, and no writes of the host's signals", async () => {
    const keys: string[] = [];
    const setItem = store.setItem;
    store.setItem = (k: string, v: string) => { keys.push(k); setItem(k, v); };
    windowWrites = [];
    await pluginScenarios();
    expect([keys.length > 0, new Set(keys).size, keys[0] === HOST_GUARD]).toEqual([true, 1, false]);
    expectOneMarker();
  });

  it("U49 — host role: start-up counts from install and the tab stays through the start", async () => {
    await newSession();
    cycle(1);
    vi.advanceTimersByTime(10 * 60 * 1000);
    const addSpy = vi.spyOn(EventTarget.prototype, "addEventListener");
    const host = hostStandIn();
    const t0 = Date.now();
    host.start();
    expect(steamReads()).toBe(0);
    await Promise.resolve();
    expect(steamReads()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(fx.firstReadAt === null ? Infinity : fx.firstReadAt - t0).toBeLessThanOrEqual(5000);
    const drawn: Draw[] = [];
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(6 * 60 * 1000);
      if (i === 3 || i === 6) fx.setFlags({ voice: i === 3 });
      fx.openPanel();
      drawn.push(fx.lastDraw());
      if (i === 4 || i === 7) { fx.selectTab(HOST_KEY); fx.selectTab(4); }
      fx.closePanel();
      await flush();
    }
    for (const d of drawn) expect(hostEntries(d.entries)).toHaveLength(1);
    expect(new Set(drawn.map((d) => d.list)).size).toBeGreaterThan(1);
    expect(addSpy).not.toHaveBeenCalled();
    expect([host.activation.listeners.size, vi.getTimerCount(), host.calls.length]).toEqual([1, 0, 1]);
  });

  it("U50 — host role: the host's key and marker, clashing fields left out; a plugin-role copy yields", async () => {
    await newSession();
    hostStandIn().start(mod, { markerFields: { __shelvesTab: true, strTitle: "marker", className: "marker" } });
    runDeferred();
    fx.openPanel();
    const e = hostEntries(fx.lastDraw().entries)[0];
    expect([e?.__shelvesTab, e?.key, e?.strTitle, e?.className === "marker"]).toEqual([true, HOST_KEY, "Deck Shelves", false]);
    expect(fx.panelDoc.getElementById(`quickaccess_tab_${HOST_KEY}`).getAttribute("aria-label")).toBe("Deck Shelves");
    const snapshot = { ...e };
    fx.closePanel();
    logs.length = 0;
    install(on(), pluginPanel(), {}, await freshModule());
    runDeferred();
    const from = fx.draws.length;
    cycle(2);
    expect(fx.draws.length).toBeGreaterThan(from);
    for (const d of (fx.draws as Draw[]).slice(from)) {
      expect(pluginEntries(d.entries)).toHaveLength(0);
      expect(hostEntries(d.entries)).toHaveLength(1);
      expect(hostEntries(d.entries)[0]).toBe(e);
    }
    expect({ ...e }).toEqual(snapshot);
    expect([yieldReports(), win.__SHELVES_QAM_OWNER__]).toEqual([1, undefined]);
  });

  it("U51 — host role: no yielding to the stamp, the bridge, the runtime or a plugin's entry", async () => {
    for (const signal of ["stamp", "bridge", "plugin"] as const) {
      await newSession();
      if (signal === "stamp") win.__SHELVES_QAM_OWNER__ = "someone";
      if (signal === "bridge") Object.assign(win, { __SHELVES_QAM__: { registerPanel: () => {} }, __SHELVES_HOST__: { qam: {} } });
      if (signal === "plugin") {
        install(on(), pluginPanel(), { yieldToHostTab: false });
        runDeferred();
        cycle(1);
        expect(pluginEntries(fx.lastDraw().entries)).toHaveLength(1);
      }
      const signals = [win.__SHELVES_QAM_OWNER__, win.__SHELVES_QAM__, win.__SHELVES_HOST__];
      const before: AnyEntry[] = fx.lastList.slice();
      const fields = before.map((x) => ({ ...x }));
      hostStandIn().start(await freshModule());
      runDeferred();
      for (let i = 0; i < 5; i++) {
        fx.openPanel();
        const d: Draw = fx.lastDraw();
        const others = d.entries.filter((x) => !hostEntries([x]).length);
        expect([hostEntries(d.entries).length, others.length]).toEqual([1, before.length]);
        others.forEach((x, n) => { expect(x).toBe(before[n]); expect({ ...x }).toEqual(fields[n]); });
        fx.closePanel();
      }
      [win.__SHELVES_QAM_OWNER__, win.__SHELVES_QAM__, win.__SHELVES_HOST__].forEach((v, i) => expect(v).toBe(signals[i]));
    }
  });

  it("U52 — host role: the first-draw report, once per installation and only after a completed draw", async () => {
    windowWrites = [];
    await newSession();
    let host = hostStandIn();
    host.start();
    runDeferred();
    expect(host.calls).toHaveLength(0);
    fx.openPanel();
    const mounts = fx.rootMounts;
    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) fx.setFlags({ voice: !fx.flags.voice });
      if (i % 4 === 1) { fx.selectTab(HOST_KEY); fx.selectTab(4); }
      if (i === 10) fx.installLoader();
      fx.closePanel();
      fx.openPanel();
      await flush();
    }
    expect([fx.rootMounts > mounts, host.calls]).toEqual([true, [{ drawn: true }]]);

    store.clear();
    for (const crash of [true, false]) {
      await newSession();
      if (crash) fx.crashOn = crashHost;
      host = hostStandIn();
      host.start();
      runDeferred();
      if (crash) expect(() => fx.openPanel()).toThrow(); else fx.openPanel();
      await flush();
      expect(host.calls).toEqual(crash ? [] : [{ drawn: true }]);
    }

    store.clear();
    for (let i = 0; i < 3; i++) {
      await newSession();
      fx.crashOn = crashHost;
      logs.length = 0;
      host = hostStandIn();
      host.start();
      vi.advanceTimersByTime(60000);
      try { fx.openPanel(); } catch {}
      await flush();
      expect(host.calls).toHaveLength(0);
    }
    expect(pauseLines()).toBe(1);

    store.clear();
    await newSession();
    host = hostStandIn();
    host.start(); runDeferred(); host.stop(); fx.openPanel();
    await flush();
    expect(host.calls).toHaveLength(0);
    host = hostStandIn();
    host.start(); runDeferred(); cycle(1); fx.openPanel();
    await flush();
    expect(host.calls).toHaveLength(1);
    host.stop(); cycle(1); host.start(); runDeferred(); cycle(1); fx.openPanel();
    await flush();
    expect(host.calls).toEqual([{ drawn: true }, { drawn: true }]);

    await newSession();
    logs.length = 0;
    host = hostStandIn({ report: () => { throw new Error("report"); } });
    expect(() => host.start()).not.toThrow();
    runDeferred();
    for (let i = 0; i < 3; i++) {
      expect(() => cycle(1)).not.toThrow();
      await flush();
      expect(hostEntries(fx.lastDraw().entries)).toHaveLength(1);
    }
    fx.setFlags({ voice: true });
    fx.openPanel();
    await flush();
    expect([hostEntries(fx.lastDraw().entries).length, host.calls.length, count("error")]).toEqual([1, 1, 1]);
    expectOneMarker();
  });

  // Starts the crashing role, one simulated restart after another, until a start finds it paused.
  async function crashUntilPaused(start: () => void, crashOn: (e: AnyEntry) => boolean): Promise<number> {
    for (let failures = 0; failures <= 3; failures++) {
      await newSession();
      fx.crashOn = crashOn;
      logs.length = 0;
      start();
      vi.advanceTimersByTime(60000);
      if (steamReads() === 0) { expect(pauseLines()).toBe(1); return failures; }
      expect(() => fx.openPanel()).toThrow();
    }
    return -1;
  }

  // The record a role's guard holds after one clean start with a completed draw.
  async function cleanRecord(start: () => void): Promise<Map<string, string>> {
    const clean = memoryStorage();
    vi.stubGlobal("localStorage", clean);
    await newSession();
    start();
    runDeferred();
    fx.openPanel();
    await flush();
    vi.stubGlobal("localStorage", store);
    return clean.map;
  }

  it("U53 — one guard per role: a pause in one role leaves the other's guard and tab", async () => {
    windowWrites = [];
    const pluginStart = (m: Mod = mod) => { install(on(), pluginPanel(), {}, m); };
    const hostStart = (m: Mod = mod) => { hostStandIn().start(m); };
    const pluginClean = await cleanRecord(() => pluginStart());
    const hostClean = await cleanRecord(() => hostStart());
    const pluginKey = [...pluginClean.keys()][0];
    expect([[...hostClean.keys()], pluginKey === HOST_GUARD]).toEqual([[HOST_GUARD], false]);

    const cases = [
      { crashing: hostStart, crashOn: crashHost, other: pluginStart, otherEntries: pluginEntries, pausedKey: HOST_GUARD, otherKey: pluginKey, otherClean: pluginClean },
      { crashing: pluginStart, crashOn: crashPlugin, other: hostStart, otherEntries: hostEntries, pausedKey: pluginKey, otherKey: HOST_GUARD, otherClean: hostClean },
    ];
    for (const c of cases) {
      store.clear();
      expect([2, 3]).toContain(await crashUntilPaused(() => c.crashing(), c.crashOn));
      const paused = store.getItem(c.pausedKey);
      expect([paused !== null, store.getItem(c.otherKey)]).toEqual([true, null]);
      c.other(await freshModule());
      runDeferred();
      cycle(1);
      fx.openPanel();
      await flush();
      expect([c.otherEntries(fx.lastDraw().entries).length, ownEntries(fx.lastDraw().entries).length]).toEqual([1, 1]);
      expect([store.getItem(c.pausedKey), store.getItem(c.otherKey), store.map.size]).toEqual([paused, c.otherClean.get(c.otherKey), 2]);
      for (const v of store.map.values()) expect(v.length).toBeLessThanOrEqual(256);
      expect(markerKeys(windowWrites)).toEqual([[false, ["sid"]], [false, ["sid"]]]);
    }
  });

  it("U54 — host role: a panel and an icon that change what they draw keep one entry and one mount", async () => {
    await newSession();
    const registry = { state: "own", listeners: new Set<() => void>() };
    const register = (state: string) => act(() => { registry.state = state; for (const l of [...registry.listeners]) l(); });
    function useRegistration(): string {
      const [state, setState] = useState(registry.state);
      useEffect(() => {
        const l = () => setState(registry.state);
        registry.listeners.add(l);
        return () => { registry.listeners.delete(l); };
      }, []);
      return state;
    }
    const stats = { calls: 0, mounts: 0 };
    function HostPanel() {
      const state = useRegistration();
      useEffect(() => { stats.mounts += 1; }, []);
      return createElement("div", { "data-host-panel": state }, state);
    }
    const HostIcon = () => createElement("i", { "data-host-icon": useRegistration() });
    const panel = { stats, elements: [], factory: () => { stats.calls += 1; return el(HostPanel, {}); } };
    installHostRole(on(), panel as any, { icon: el(HostIcon, {}) });
    runDeferred();
    fx.openPanel();
    fx.selectTab(HOST_KEY);
    const shows = (state: string) => {
      expect(fx.panelDoc.querySelector(`#quickaccess_content_${HOST_KEY} [data-host-panel]`).getAttribute("data-host-panel")).toBe(state);
      expect(fx.panelDoc.querySelector(`#quickaccess_tab_${HOST_KEY} [data-host-icon]`).getAttribute("data-host-icon")).toBe(state);
    };
    shows("own");
    register("registered");
    shows("registered");
    fx.closePanel();
    fx.openPanel();
    shows("registered");
    register("own");
    shows("own");
    expect(stats).toEqual({ calls: 1, mounts: 1 });
    const all = (fx.draws as Draw[]).flatMap((d) => hostEntries(d.entries));
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) expect(e).toBe(all[0]);
  });

  it("U55 — U8 in the host role, with the host's key taken by the host's own code", async () => {
    await newSession();
    const other = { key: HOST_KEY, tab: createElement("b"), title: createElement(Fragment), strTitle: "Deck Shelves", panel: createElement("div"), vrLocation: "quick-access-menu", __shelvesTab: true };
    const snapshot = { ...other };
    fx.addParty(other, true);
    cycle(1);
    logs.length = 0;
    const host = hostStandIn();
    host.start();
    runDeferred();
    await openings(3);
    for (const d of fx.draws as Draw[]) expect(ownEntries(d.entries)).toHaveLength(0);
    expect([fx.lastDraw().entries.includes(other), count("warn"), host.calls.length]).toEqual([true, 1, 0]);
    expect({ ...other }).toEqual(snapshot);
  });

  it("U55 — U8 in the host role, with Steam's key table naming the host's key before install", async () => {
    await newSession();
    Object.assign(fx.table, { [HOST_KEY]: "HostTab", HostTab: HOST_KEY });
    const table = { ...fx.table };
    logs.length = 0;
    const host = hostStandIn();
    host.start();
    runDeferred();
    await openings(3);
    for (const d of fx.draws as Draw[]) expect(ownEntries(d.entries)).toHaveLength(0);
    expect(fx.table).toEqual(table);
    expect([count("warn"), host.calls.length]).toEqual([1, 0]);
  });

  // With the owner stamp set after the first draw, the remembered tab stays the host role's.
  it("U55 — U38 in the host role: uninstalled while Steam remembers its tab, Steam's first tab is shown", async () => {
    await newSession();
    const host = hostStandIn({ stamp: true }); host.start(); runDeferred(); fx.openPanel();
    const key = hostEntries(fx.lastDraw().entries)[0].key;
    fx.selectTab(key); fx.closePanel(); await flush(); fx.openPanel();
    const selected = fx.panelDoc.getElementById(`quickaccess_tab_${key}`)?.getAttribute("aria-selected");
    expect([win.__SHELVES_QAM_OWNER__, selected]).toEqual(["neutral-host", "true"]);
    fx.closePanel(); host.stop();
    expect(() => fx.openPanel()).not.toThrow();
    expect([fx.remembered, ownEntries(fx.lastDraw().entries).length, fx.panelDoc.getElementById("quickaccess_tab_0").getAttribute("aria-selected")]).toEqual([key, 0, "true"]);
  });

  it("U56 — both roles in one fixture: one Deck Shelves tab, handed over both ways", async () => {
    const atMostOneEach = () => {
      for (const d of fx.draws as Draw[]) expect([pluginEntries(d.entries).length <= 1, hostEntries(d.entries).length <= 1]).toEqual([true, true]);
    };
    await newSession();
    install(on());
    runDeferred();
    cycle(1);
    expect(pluginEntries(fx.lastDraw().entries)).toHaveLength(1);
    let host = hostStandIn({ stamp: true });
    host.start(await freshModule());
    runDeferred();
    const handed = await openings(3);
    expect(handed.filter((d) => pluginEntries(d.entries).length && hostEntries(d.entries).length).length).toBeLessThanOrEqual(1);
    expect([pluginEntries(handed[2].entries).length, hostEntries(handed[2].entries).length, win.__SHELVES_QAM_OWNER__]).toEqual([0, 1, "neutral-host"]);
    host.stop();
    const back = await openings(2);
    expect([hostEntries(back[1].entries).length, pluginEntries(back[1].entries).length]).toEqual([0, 1]);
    atMostOneEach();

    for (const pluginLeaves of [false, true]) {
      await newSession();
      host = hostStandIn({ stamp: true });
      host.start();
      runDeferred();
      await openings(1);
      const e = hostEntries(fx.lastDraw().entries)[0];
      expect(e).toBeDefined();
      const snapshot = { ...e };
      const plugin = install(on(), pluginPanel(), {}, await freshModule());
      runDeferred();
      if (pluginLeaves) plugin.uninstall();
      const from = fx.draws.length;
      await openings(pluginLeaves ? 2 : 3);
      for (const d of (fx.draws as Draw[]).slice(from)) { expect(pluginEntries(d.entries)).toHaveLength(0); expect(hostEntries(d.entries)[0]).toBe(e); }
      expect({ ...e }).toEqual(snapshot);
      atMostOneEach();
    }
  });
});

describe("ownQamTab — the restart action", () => {
  it("U34 — the restart action asks the client, never the device", async () => {
    await newSession();
    const [restart, device] = [vi.fn(), vi.fn()];
    vi.stubGlobal("SteamClient", { User: { StartRestart: restart }, System: { RestartPC: device } });
    mod.restartSteam();
    expect(restart.mock.calls).toEqual([[false]]);
    for (const client of [undefined, {}, { User: {} }, { User: { StartRestart: () => { throw new Error("x"); } } }]) {
      vi.stubGlobal("SteamClient", client);
      expect(() => mod.restartSteam()).not.toThrow();
    }
    expect(device).not.toHaveBeenCalled();
  });
});
