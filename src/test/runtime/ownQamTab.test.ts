// @vitest-environment jsdom
/* React's own renderer models Steam's panel, so React supplies the rules the component relies on:
   a mounted memo keeps the inner function it mounted with, a changed element type mounts anew,
   a memoized list keeps its identity while its inputs are equal, and a render that throws
   unmounts its tree with its layout cleanups before the commit ends (E4, E12). The strip stays
   mounted while the panel is closed (E2); changeable elements are plain objects (E12). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, createElement, Fragment, memo, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

const reg = vi.hoisted(() => ({ modules: [] as unknown[], scans: 0, lib: null as unknown }));
const logs = vi.hoisted(() => [] as Array<{ level: string; message: string }>);

vi.mock("../../runtime/host/decky", () => ({
  findModule: (filter: (m: unknown) => boolean) => { reg.scans += 1; return reg.modules.find((m) => filter(m)); },
  getFrontendLib: () => reg.lib,
}));
vi.mock("../../runtime/logger", () => {
  const at = (level: string) => (_s: string, message: string) => { logs.push({ level, message }); };
  return { logInfo: at("info"), logWarn: at("warn"), logError: at("error") };
});

// Many head elements come before the body: the panel must still be found from the body down.
for (let i = 0; i < 400; i++) document.head.appendChild(document.createElement("meta"));

type Mod = typeof import("../../runtime/ownQamTab");
type AnyEntry = Record<string | symbol, any> & { key: number };
type Flags = { voice?: boolean; rpt?: boolean; notifications?: boolean; friends?: boolean; perf?: boolean; soundtrack?: boolean; help?: boolean; vr?: boolean; kiosk?: boolean };
type Draw = { list: AnyEntry[]; keys: number[]; entries: AnyEntry[] };

const ELEMENT = Symbol.for("react.transitional.element");
const STEAM_FIELDS = new Set(["key", "tab", "title", "strTitle", "panel", "vrPopupSize", "vrLocation", "className", "eFeature", "allowInKioskMode"]);
const TABLE_NAMES = ["Notifications", "RemotePlayTogetherControls", "VoiceChat", "Friends", "Settings", "Perf", "Help", "Soundtrack", "VRBatteries"];
// The component's limit on the records it reads while locating the panel.
const WALK_CAP = 40000;

// A plain element object that the component may change (Steam's production elements are not frozen).
function el(type: unknown, props: Record<string, unknown>, key: string | null = null): any {
  return { $$typeof: ELEMENT, type, key, ref: null, props, _owner: null, _store: { validated: 1 } };
}

// The tab lists in a render result, as another party would find them.
function findLists(out: unknown): AnyEntry[][] {
  const [found, seen] = [new Set<AnyEntry[]>(), new Set<unknown>()];
  const isList = (v: any) => Array.isArray(v) && v.length > 0 && typeof v[0]?.key === "number" && "panel" in v[0];
  for (const stack: any[] = [out]; stack.length; ) {
    const n = stack.pop();
    if (!n || typeof n !== "object" || seen.has(n)) continue;
    seen.add(n);
    for (const v of Array.isArray(n) ? n : n.$$typeof === Symbol.for("react.portal") ? [n.children] : Object.values(n.props ?? {})) if (isList(v)) found.add(v); else stack.push(v);
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
    flags: { voice: false } as Flags, extraEntries: 0, extraRecords: 0, countReads: false, counting: false, entryReads: 0,
    freezeEntries: false, open: false, remembered: 4, lang: "en", rootType: null, withPanelView: true, withInlineView: false,
    draws: [] as Draw[], builtLists: [] as WeakRef<AnyEntry[]>[], lastList: null, rootMounts: 0, contentMounts: {} as Record<number, number>,
    crashOn: null, beforeStrip: [] as Array<(list: AnyEntry[]) => void>, inRoot: [] as Array<(list: AnyEntry[]) => void>, forceRoot: [] as Array<() => void>, forceApp: () => {},
    table: Object.fromEntries(TABLE_NAMES.flatMap((name, i) => [[name, i], [i, name]])), steamReads: 0, attemptTimes: [] as number[], firstReadAt: null as number | null,
    panelDoc: document.implementation.createHTMLDocument("QuickAccess"), container: document.createElement("div"),
  };
  const text = (key: number) => `${fx.lang}-${key}`;
  const loop: unknown[] = [];
  loop.push(loop);
  const Content = ({ k }: { k: number }) => { useEffect(() => { fx.contentMounts[k] = (fx.contentMounts[k] ?? 0) + 1; }, [k]); return createElement("p", null, `content ${k}`); };
  function entry(key: number, emptyTitle = false, extra: Record<string, unknown> = {}): AnyEntry {
    const title = emptyTitle ? createElement(Fragment) : createElement("h2", null, text(key));
    const vrLocation = key === 2 ? "dashboard-bar" : "quick-access-menu";
    return { key, tab: createElement("i", { "data-steam-icon": key }), title, strTitle: text(key), panel: createElement(Content, { k: key }), vrPopupSize: { width: 400, height: 600 }, vrLocation, ...extra };
  }
  // Steam's order, each optional tab only while its flag is on (E4, E5).
  function buildList(flags: Flags): AnyEntry[] {
    const wanted: Array<[unknown, number, boolean?, Record<string, unknown>?]> = [
      [flags.voice, 2, true], [flags.rpt, 1, true], [flags.notifications !== false, 0], [flags.friends !== false, 3, true], [true, 4],
      [flags.perf !== false, 5], [flags.soundtrack !== false, 7], [flags.vr, 8], [flags.help !== false, 6, false, { allowInKioskMode: false }],
    ];
    let out = wanted.filter(([want]) => want).map(([, key, empty, extra]) => entry(key, empty, extra));
    for (let i = 0; i < fx.extraEntries; i++) out.push(entry(100 + i));
    if (flags.vr) out = out.filter((e) => e.vrLocation === "quick-access-menu");
    if (fx.countReads) out = out.map((e) => new Proxy(e, { get: (t, k) => { if (fx.counting) fx.entryReads += 1; return (t as any)[k]; } }));
    if (fx.symbolReadThrows) out = out.map((e) => new Proxy(e, { get: (t, k) => { if (typeof k === "symbol") throw Object.create(null); return (t as any)[k]; } }));
    if (fx.freezeEntries) out.forEach((e) => Object.freeze(e));
    if (fx.sealLists) Object.seal(out);
    fx.builtLists.push(new WeakRef(out));
    return out;
  }
  const blocked = (e: AnyEntry) => !!fx.flags.kiosk && e.allowInKioskMode === false;
  const shownKey = (list: AnyEntry[]) => (list.find((e) => e.key === fx.remembered && !blocked(e)) ?? list[0])?.key;
  function Strip({ items, selected }: { items: AnyEntry[]; selected: number; inVr: boolean }) {
    fx.counting = false;
    for (const hook of fx.beforeStrip) hook(items);
    if (fx.crashOn) for (const e of items) if (fx.crashOn(e)) throw new Error("strip failed");
    useLayoutEffect(() => { fx.draws.push({ list: items, keys: items.map((e) => e.key), entries: items.slice() }); });
    return createElement("div", { role: "tablist" }, items.map((e) => createElement("button", {
      key: String(e.key), id: `quickaccess_tab_${e.key}`, role: "tab", "aria-label": e.strTitle,
      "aria-selected": e.key === selected, disabled: blocked(e), onFocus: () => fx.select(e.key),
    }, e.tab)));
  }
  // Keeps a tab's panel mounted once it was shown (the keep-alive time, E8).
  const Item = memo(function Item({ entry: e, shown, visible }: { entry: AnyEntry; shown: boolean; visible: boolean }) {
    const [kept, setKept] = useState(false);
    if (shown && visible && !kept) setKept(true);
    const wrapper = createElement("div", { id: `quickaccess_content_${e.key}`, role: "tabpanel", className: `tab_${fx.table[e.key]}` }, (shown && visible) || kept ? e.panel : null);
    return createElement(Fragment, null, e.title, wrapper);
  });
  function Container({ items, selected, menuOpen }: { items: AnyEntry[]; selected: number; menuOpen: boolean }) {
    return createElement("div", { className: "panels" }, items.map((e) => createElement(Item, { key: String(e.key), entry: e, shown: e.key === selected, visible: menuOpen })));
  }
  function Root(props: any) {
    if (fx.rootThrows) throw fx.rootThrows;
    const [, force] = useState(0);
    useEffect(() => {
      const f = () => force((n) => n + 1);
      fx.rootMounts += 1; fx.forceRoot.push(f);
      return () => { fx.forceRoot = fx.forceRoot.filter((x: unknown) => x !== f); };
    }, []);
    const f = fx.flags as Flags;
    const list = useMemo(() => buildList(f), [f.voice, f.rpt, f.notifications, f.friends, f.perf, f.soundtrack, f.help, f.vr, fx.lang]);
    for (const hook of fx.inRoot) hook(list);
    const shown = shownKey(list);
    fx.lastList = list; fx.counting = true;
    const strip = el(Strip, { items: list, selected: shown, inVr: !!f.vr });
    return el("section", { className: "qam-root", children: [
      el("div", { className: "strip-holder", children: [fx.boundary ? el(Boundary, { children: strip }, "strip") : { ...strip, key: "strip" }] }, "a"),
      el(Container, { items: list, selected: shown, menuOpen: !!props.visible, loop }, "b"),
    ] });
  }
  function noop() {}
  const rootProps = () => ({ active: fx.open, visible: fx.open, expanded: false, showHeaderAndFooter: true, onFocusNavActivated: noop, onFocusNavDeactivated: noop });
  // The view that renders the root through a portal into the panel's own document, and an inline one (E2, E3).
  const PanelView = memo(function PanelView(props: any) {
    return el("div", { className: "panel-view", children: [el("span", { children: "view" }, "s"), createPortal(el(fx.rootType ?? Root, props), fx.panelDoc.body, "p")] });
  });
  const InlineView = memo(function InlineView(props: any) {
    return el("div", { className: "inline-view", children: el(fx.rootType ?? Root, { ...props, embedded: true }) });
  });
  function App() {
    const [, force] = useState(0);
    fx.forceApp = () => force((n) => n + 1);
    const filler = Array.from({ length: fx.extraRecords }, (_, i) => el("u", {}, `x${i}`));
    const views = [fx.withPanelView && el(PanelView, rootProps(), "pv"), fx.withInlineView && el(InlineView, rootProps(), "iv")].filter(Boolean);
    return el("main", { id: "gamepad-main", children: [...filler, ...views] });
  }
  const panelModule: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ a: Root, b: PanelView, c: InlineView, d: buildList })) Object.defineProperty(panelModule, name, { get: () => value, enumerable: true });
  const tableModule: Record<string, unknown> = {};
  Object.defineProperty(tableModule, "t", { get: () => { fx.steamReads += 1; return fx.table; }, enumerable: true });
  const brokenModule = new Proxy({}, { ownKeys: () => { throw new Error("module"); } });
  Object.assign(fx, { modules: [{ x: 1 }, brokenModule, panelModule, { y: memo(() => null) }, tableModule], Root, panelView: PanelView, inlineView: InlineView, buildList });
  fx.uiStore = { WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: { document } } } };
  win.SteamUIStore = new Proxy(fx.uiStore, {
    get: (t: any, k) => { fx.steamReads += 1; fx.firstReadAt ??= Date.now(); if (k === "WindowStore") fx.attemptTimes.push(Date.now()); return t[k]; },
  });
  fx.mount = () => { document.body.appendChild(fx.container); fx.reactRoot = createRoot(fx.container); act(() => { fx.reactRoot.render(createElement(App)); }); };
  fx.unmount = () => { try { act(() => { fx.reactRoot?.unmount(); }); } catch {} fx.container.remove(); };
  fx.renderApp = () => act(() => { fx.forceApp(); });
  fx.renderRoot = () => act(() => { for (const f of fx.forceRoot) f(); });
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
  fx.installLoader = () => fx.addParty(fx.loaderEntry = { key: 999, tab: createElement("b", null, "L"), panel: createElement("div", null, "loader"), loaderField: 1 });
  // The neutral host's model: its entry after performance, its stamp written when it inserts it.
  fx.installHost = (mode: "root" | "strip") => {
    const host: any = { stopped: false, entry: { key: 900, tab: createElement("i", null, "H"), title: createElement(Fragment), strTitle: "Deck Shelves", panel: createElement("div", null, "host panel"), vrLocation: "quick-access-menu", __shelvesTab: true, hostField: 1 } };
    host.snapshot = { ...host.entry };
    const insert = (l: AnyEntry[]) => {
      const at = l.indexOf(host.entry);
      if (host.stopped || at >= 0) { if (host.stopped && at >= 0) l.splice(at, 1); return; }
      l.splice(l.findIndex((e) => e.key === 5) + 1 || l.length, 0, host.entry);
      win.__SHELVES_QAM_OWNER__ = "neutral-host";
    };
    if (mode === "strip") fx.beforeStrip.push(insert);
    else { const base = fx.rootType ?? Root; fx.rootType = function HostRoot(props: any) { const out = base(props); for (const l of findLists(out)) insert(l); return out; }; }
    return host;
  };
  return fx;
}

type Settings = { isEnabled: () => boolean; subscribe: (l: () => void) => () => void; set: (v: boolean | undefined) => void; notify: () => void; listeners: Set<() => void> };

function settingsSource(initial: boolean | undefined): Settings {
  let state = initial;
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of [...listeners]) l(); };
  const subscribe = (l: () => void) => { listeners.add(l); if (state !== undefined) l(); return () => { listeners.delete(l); }; };
  return { isEnabled: () => state === true, subscribe, set: (v) => { state = v; notify(); }, notify, listeners };
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

async function freshModule(): Promise<Mod> {
  vi.resetModules(); return await import("../../runtime/ownQamTab");
}

// The work queued after a draw has run long before Steam stops; a simulated restart lets it run.
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

async function newSession(opts: { mount?: boolean } = {}): Promise<void> {
  await flush();
  if (fx) fx.unmount();
  win = { document };
  vi.stubGlobal("window", win);
  fx = makeSteam(win);
  Object.assign(reg, { modules: fx.modules, scans: 0 }); mountedFixtures.push(fx);
  if (opts.mount !== false) fx.mount();
  mod = await freshModule();
}

const icon = createElement("svg", { "data-icon": "deck-shelves" });

// The host role's values (the neutral host's key and marker); rows run again in it through asHost.
const HOST_KEY = 900;
const HOST_GUARD = "test-host:qam-tab-guard";
let role: "plugin" | "host" = "plugin";
let firstDrawReports = 0;
const hostRole = () => ({ yieldToHostTab: false, markerFields: { __shelvesTab: true }, key: HOST_KEY, onFirstDraw: () => { firstDrawReports += 1; }, guardKey: HOST_GUARD });
const asHost = (row: () => Promise<void>) => async () => { role = "host"; try { await row(); } finally { role = "plugin"; } };

function install(s: Settings, panel = pluginPanel(), extra: Record<string, unknown> = {}, m: Mod = mod) {
  return { panel, uninstall: m.installOwnQamTab({ title: "Deck Shelves", icon, renderPanel: panel.factory, isEnabled: s.isEnabled, subscribe: s.subscribe, ...(role === "host" ? hostRole() : {}), ...extra }) };
}

const on = () => settingsSource(true);
const runDeferred = (ms = 2000) => vi.advanceTimersByTime(ms);
const ownEntries = (list: AnyEntry[]) => list.filter((e) => Object.getOwnPropertySymbols(e).length > 0);
const mine = (d: Draw = fx.lastDraw()) => ownEntries(d.entries);
const ownKey = () => (fx.draws as Draw[]).flatMap((d) => ownEntries(d.entries))[0]?.key;
const steamReads = () => fx.steamReads + reg.scans;
const count = (level: string) => logs.filter((l) => l.level === level).length;
const yieldReports = () => logs.filter((l) => /stepping aside/.test(l.message)).length;
const noOwnEntryDrawn = () => { for (const d of fx.draws as Draw[]) expect(ownEntries(d.entries)).toHaveLength(0); };
const cycle = (n: number) => { for (let i = 0; i < n; i++) { fx.openPanel(); fx.closePanel(); } };
const begin = (s = on(), extra: Record<string, unknown> = {}) => { const r = install(s, pluginPanel(), extra); runDeferred(); return r; };
const shown = async (extra: Record<string, unknown> = {}) => { await newSession(); const r = begin(on(), extra); fx.openPanel(); return r; };

function allFibers(): any[] {
  const holder: any = fx.container;
  const out: any[] = [holder[Object.keys(holder).find((k) => k.startsWith("__reactContainer$"))!].stateNode.current];
  for (let i = 0; i < out.length; i++) for (const next of [out[i].child, out[i].sibling]) if (next) out.push(next);
  return out;
}

const isMemoObject = (v: any) => !!v && v.$$typeof === Symbol.for("react.memo");
const viewFiber = () => allFibers().find((f) => f.elementType === fx.panelView);
const rootFiber = () => allFibers().find((f) => !isMemoObject(f.elementType) && f.memoizedProps && "showHeaderAndFooter" in f.memoizedProps);

function changedValues() {
  const [view, root] = [viewFiber(), rootFiber()];
  return { viewType: fx.panelView.type, inlineType: fx.inlineView.type, viewFiberType: view.type, viewAltType: view.alternate?.type, rootType: root.type, rootElementType: root.elementType, rootAltType: root.alternate?.type };
}

// React's records are reached only through the record keys on the nodes; reads of those are counted.
function countRecordReads(reads: { records: number }): void {
  for (const node of new Set([fx.container, ...document.body.querySelectorAll("*"), ...fx.panelDoc.body.querySelectorAll("*")])) {
    for (const name of Object.keys(node).filter((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$"))) {
      let value = (node as any)[name];
      Object.defineProperty(node, name, { configurable: true, enumerable: true, get: () => { reads.records += 1; return value; }, set: (v) => { value = v; } });
    }
  }
}

// Records which fibers have their props read while `on` is set.
function watchFiberReads(): { on: boolean; fibers: Set<object> } {
  const seen = { on: true, fibers: new Set<object>() };
  for (const f of allFibers()) {
    let value = f.memoizedProps;
    Object.defineProperty(f, "memoizedProps", { configurable: true, enumerable: true, get: () => { if (seen.on) seen.fibers.add(f); return value; }, set: (v) => { value = v; } });
  }
  return seen;
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("SP_REACT", React);
  reg.scans = 0; logs.length = 0; fx = null; role = "plugin"; firstDrawReports = 0;
});

afterEach(() => {
  for (const f of mountedFixtures.splice(0)) f.unmount();
  fx = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("ownQamTab — the entry and its place", () => {
  const u1 = async () => {
    await newSession(); fx.installLoader(); cycle(1);
    const before = fx.lastList.slice();
    const fields = before.map((e: AnyEntry) => ({ ...e }));
    begin(); fx.openPanel();
    const draw: Draw = fx.lastDraw(), e = mine(draw)[0], at = draw.keys.indexOf(e.key);
    expect(mine(draw)).toHaveLength(1);
    expect([draw.keys[at - 1], at < draw.keys.indexOf(999)]).toEqual([5, true]);
    const button = fx.panelDoc.getElementById(`quickaccess_tab_${e.key}`);
    expect([button.getAttribute("aria-label"), !!button.querySelector("svg[data-icon='deck-shelves']")]).toEqual(["Deck Shelves", true]);
    expect([e.title.type, e.title.props.children, e.vrLocation]).toEqual([Fragment, undefined, "quick-access-menu"]);
    for (const name of Object.keys(e)) expect([STEAM_FIELDS.has(name) || (role === "host" && name === "__shelvesTab"), typeof e[name] === "function"]).toEqual([true, false]);
    expect([Object.getOwnPropertySymbols(e).length, "__shelvesTab" in e]).toEqual([1, role === "host"]);
    if (role === "host") expect([e.__shelvesTab, e.key]).toEqual([true, HOST_KEY]);
    const others = draw.entries.filter((x) => x !== e);
    expect(others).toEqual(before);
    others.forEach((x, i) => { expect(x).toBe(before[i]); expect({ ...x }).toEqual(fields[i]); });
    await flush();
    expect(firstDrawReports).toBe(role === "host" ? 1 : 0);
  };
  it("U1 — one entry after performance, before the loader's, with the given icon and title", u1);

  const u2 = async () => {
    await newSession(); fx.installLoader(); begin();
    const [mounts, from] = [fx.rootMounts, fx.draws.length];
    fx.openPanel(); const first: Draw = fx.draws[from];
    expect([fx.rootMounts, mine(first).length, first.keys[first.keys.length - 1]]).toEqual([mounts + 1, 1, 999]);
  };
  it("U2 — the entry is in the list drawn at the opening that mounts the root again", u2);

  const u3 = async () => {
    await newSession(); fx.openPanel();
    expect(fx.contentMounts[4]).toBe(1); begin();
    for (let i = 0; i < 5; i++) fx.renderRoot();
    fx.closePanel(); fx.openPanel();
    expect(fx.contentMounts[4]).toBe(1);
    for (const d of fx.draws as Draw[]) expect(mine(d).length).toBeLessThanOrEqual(1);
    expect(mine()).toHaveLength(1);
  };
  it("U3 — a panel open before install keeps its tab and content", u3);

  const u4 = async () => {
    await shown();
    for (const voice of [true, false]) {
      const previous = fx.lastList;
      fx.setFlags({ voice });
      const first = (fx.draws as Draw[]).find((d) => d.list === fx.lastList)!;
      expect([fx.lastList !== previous, mine(first).length]).toEqual([true, 1]);
      if (voice) expect(first.keys[0]).toBe(2);
    }
  };
  it("U4 — each new list holds one entry at its first draw", u4);

  const u5 = async () => {
    await newSession(); fx.flags = { perf: false }; begin(); fx.openPanel();
    expect(ownEntries(fx.lastDraw().entries.slice(-1))).toHaveLength(1);
    fx.setFlags({ voice: false, rpt: false, notifications: false, friends: false, perf: false, soundtrack: false, help: false, vr: false });
    const d: Draw = fx.lastDraw();
    expect([d.keys[0], d.entries.length, ownEntries([d.entries[1]]).length]).toEqual([4, 2, 1]);
  };
  it("U5 — without a performance tab the entry is last", u5);

  const u6 = async () => {
    const { panel } = await shown();
    const key = ownKey();
    for (const k of [key, 4, key]) fx.selectTab(k);
    for (let i = 0; i < 5; i++) { fx.closePanel(); fx.openPanel(); }
    expect(panel.stats).toEqual({ calls: 1, renders: 1, mounts: 1 });
    expect(fx.panelDoc.getElementById(`quickaccess_content_${key}`).querySelector("[data-plugin-panel]")).not.toBeNull();
  };
  it("U6 — the panel factory runs once and the panel keeps its instance", u6);

  const u7 = async () => {
    await newSession(); begin();
    const mounts = fx.rootMounts; fx.openPanel();
    for (let i = 0; i < 20; i++) if (i % 2) fx.setFlags({ voice: !fx.flags.voice }); else fx.renderRoot();
    const all = (fx.draws as Draw[]).flatMap((d) => mine(d));
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const e of all) expect(e).toBe(all[0]);
    expect(fx.rootMounts - mounts).toBeLessThanOrEqual(1);
  };
  it("U7 — the same entry object in every list; the root mounts again at most once", u7);

  const u8 = async () => {
    await newSession();
    const namesBefore = new Set(Object.keys(fx.table));
    let r = begin(); const from = fx.draws.length;
    fx.openPanel(); const key = ownKey();
    expect([typeof key, namesBefore.has(String(key))]).toEqual(["number", false]);
    if (role === "host") expect(key).toBe(HOST_KEY);
    else expect([900, 999]).not.toContain(key);
    fx.renderRoot();
    for (const d of (fx.draws as Draw[]).slice(from)) expect(d.keys.filter((k) => k === key)).toHaveLength(1);
    r.uninstall(); r = begin(); cycle(1); fx.openPanel();
    expect(mine()[0].key).toBe(key);
    r.uninstall();
    await shown();
    expect(ownKey()).toBe(key);

    await newSession();
    const other = { key, tab: createElement("b"), panel: createElement("div"), strTitle: "other" };
    fx.addParty(other); cycle(1);
    logs.length = 0;
    begin(); cycle(1); fx.openPanel();
    noOwnEntryDrawn();
    expect([fx.lastDraw().entries.includes(other), count("warn")]).toEqual([true, 1]);
    // A given key that is the loader's, or in the plugin role the neutral host's, is refused.
    for (const given of role === "host" ? [999] : [999, 900]) {
      await newSession(); logs.length = 0; begin(on(), { key: given }); cycle(2);
      noOwnEntryDrawn(); expect(count("warn")).toBe(1);
    }
  };
  it("U8 — its own key, kept across reinstalls and restarts; a taken key gives no entry", u8);

  for (const [id, row] of Object.entries({ U1: u1, U2: u2, U3: u3, U4: u4, U5: u5, U6: u6, U7: u7, U8: u8 })) it(`U55 — ${id} in the host role`, asHost(row));
});

describe("ownQamTab — activation, the neutral host and copies", () => {
  it("U9 — quiet while the activation is unknown and then off", async () => {
    await newSession();
    const reads = { records: 0, document: 0 };
    const bw = fx.uiStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    bw.document = new Proxy(document, { get: (t, k) => { reads.document += 1; const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } });
    countRecordReads(reads);
    const addSpy = vi.spyOn(EventTarget.prototype, "addEventListener");
    const s = settingsSource(undefined);
    install(s); cycle(5); s.set(false); expect(vi.getTimerCount()).toBe(0); cycle(5);
    vi.advanceTimersByTime(60000);
    expect([steamReads(), vi.getTimerCount(), s.listeners.size]).toEqual([0, 0, 1]);
    expect(reads).toEqual({ records: 0, document: 0 });
    expect(addSpy).not.toHaveBeenCalled();
    noOwnEntryDrawn();
  });

  it("U10 — an activation known late, before and after the start-up window", async () => {
    for (const lateMs of [3000, 60000]) {
      await newSession();
      const s = settingsSource(undefined);
      install(s); cycle(1); vi.advanceTimersByTime(lateMs);
      expect([steamReads(), vi.getTimerCount()]).toEqual([0, 0]);
      noOwnEntryDrawn();
      s.set(true);
      expect(steamReads()).toBe(0);
      vi.advanceTimersByTime(5000); fx.openPanel();
      expect(mine()).toHaveLength(1);
    }
  });

  it("U11 — off when known: nothing in this start, the tab after a restart", async () => {
    await newSession();
    const s = settingsSource(false);
    install(s); const [reads, timers] = [steamReads(), vi.getTimerCount()]; s.set(true);
    expect([timers, vi.getTimerCount()]).toEqual([0, 0]);
    for (let i = 0; i < 10; i++) { cycle(1); vi.advanceTimersByTime(1000); }
    expect(steamReads()).toBe(reads);
    noOwnEntryDrawn();
    await shown();
    expect(mine()).toHaveLength(1);
  });

  it("U12 — off and on again in one start; repeated notifications change nothing; off before the start-up work", async () => {
    await newSession();
    const s = on(), { panel } = begin(s);
    fx.openPanel(); const first = mine()[0];
    fx.closePanel(); s.set(false); fx.openPanel(); expect(mine()).toHaveLength(0);
    fx.closePanel(); s.set(true); fx.openPanel(); expect(mine()[0]).toBe(first);
    // Notifications that change nothing, with the tab shown: the drawn list keeps its items until a render.
    fx.selectTab(first.key); const [reads, items, drawn] = [steamReads(), fx.lastList.slice(), fx.lastList];
    for (let i = 0; i < 5; i++) s.notify();
    expect([steamReads(), drawn.length, drawn.every((e: AnyEntry, i: number) => e === items[i]), items.includes(first)]).toEqual([reads, items.length, true, true]);
    fx.renderRoot(); const after = [mine()[0], fx.panelDoc.getElementById(`quickaccess_tab_${first.key}`).getAttribute("aria-selected")];
    fx.closePanel(); fx.openPanel(); expect([...after, mine()[0], panel.stats.calls]).toEqual([first, "true", first, 1]);

    await newSession(); cycle(1);
    const before = changedValues(), late = on();
    install(late); late.set(false); vi.advanceTimersByTime(60000); late.set(true); vi.advanceTimersByTime(60000); fx.openPanel();
    expect([steamReads(), vi.getTimerCount(), mine().length]).toEqual([0, 0, 0]);
    expect(changedValues()).toEqual(before);
  });

  it("U13 — the owner stamp or the host's entry holds the tab back", async () => {
    for (const hostEntry of [true, false]) {
      await newSession();
      if (hostEntry) { fx.installHost("root"); cycle(1); } else win.__SHELVES_QAM_OWNER__ = "neutral-host";
      expect(win.__SHELVES_QAM_OWNER__).toBe("neutral-host");
      logs.length = 0;
      begin(); cycle(10);
      noOwnEntryDrawn();
      expect(yieldReports()).toBe(1);
    }
    delete win.__SHELVES_QAM_OWNER__;
    fx.openPanel();
    expect(mine()).toHaveLength(1);
  });

  it("U14 — the host's tab arriving later wins after at most one opening", async () => {
    for (const mode of ["root", "strip"] as const) {
      await shown(); fx.closePanel();
      expect(mine()).toHaveLength(1);
      const host = fx.installHost(mode);
      const openings: Draw[] = [];
      for (let i = 0; i < 3; i++) { fx.openPanel(); openings.push(fx.lastDraw()); fx.closePanel(); }
      expect(openings.filter((d) => mine(d).length > 0 && d.entries.includes(host.entry)).length).toBeLessThanOrEqual(1);
      expect([mine(openings[2]).length, openings[2].entries.includes(host.entry)]).toEqual([0, true]);
      expect({ ...host.entry }).toEqual(host.snapshot);
    }
  });

  it("U15 — the bridge alone does not hold the tab back", async () => {
    for (const bridgeFirst of [true, false]) {
      await newSession();
      if (bridgeFirst) win.__SHELVES_QAM__ = { registerPanel: () => {} };
      begin(); cycle(1);
      win.__SHELVES_QAM__ = { registerPanel: () => {} };
      for (let i = 0; i < 3; i++) { fx.openPanel(); expect(mine()).toHaveLength(1); fx.closePanel(); }
    }
  });

  it("U16 — an empty or non-string owner stamp counts as unset", async () => {
    for (const stamp of ["", 5, {}]) {
      await newSession();
      win.__SHELVES_QAM_OWNER__ = stamp;
      begin(); fx.openPanel();
      expect(mine()).toHaveLength(1);
    }
  });

  const u20 = async () => {
    const first = await shown();
    fx.closePanel();
    // The global object holds one session marker, kept as it is, with only the session's id.
    const markers = () => Reflect.ownKeys(win).filter((k) => k !== "document" && k !== "SteamUIStore").map((k) => win[k]), marker = markers();
    const s2 = on();
    const second = install(s2, pluginPanel(), {}, await freshModule());
    runDeferred(); expect([markers().length, markers()[0] === marker[0], Reflect.ownKeys(marker[0])]).toEqual([1, true, ["sid"]]);
    const from = fx.draws.length;
    cycle(5);
    for (const d of (fx.draws as Draw[]).slice(from)) expect(mine(d).map((e) => e.panel)).toEqual([second.panel.elements[0]]);
    expect(first.panel.elements[0]).not.toBe(second.panel.elements[0]);
    s2.set(false); fx.openPanel();
    expect(mine()).toHaveLength(0);

    // Hot-swap order: the first copy is uninstalled after the second one started, then the second.
    await newSession(); cycle(1);
    const [before, mounts] = [changedValues(), fx.rootMounts];
    const a = begin();
    cycle(1);
    const b = install(on(), pluginPanel(), {}, await freshModule());
    runDeferred(); cycle(1);
    expect(mine()[0].panel).toBe(b.panel.elements[0]);
    a.uninstall(); b.uninstall(); fx.openPanel(); fx.renderRoot();
    expect(changedValues()).toEqual(before);
    expect([fx.rootMounts, mine().length]).toEqual([mounts, 0]);

    // An older copy whose start-up finds the panel after a newer copy started leaves the tab to it,
    // with and without a render in between.
    for (const drawnFirst of [true, false]) {
      await newSession();
      fx.withPanelView = false; fx.renderApp(); install(on()); vi.advanceTimersByTime(1000);
      fx.withPanelView = true; fx.renderApp();
      const s = on(), newer = install(s, pluginPanel(), {}, await freshModule());
      vi.advanceTimersByTime(1000); if (drawnFirst) cycle(1); vi.advanceTimersByTime(5000); cycle(1); await flush();
      expect(mine().map((e) => e.panel)).toEqual([newer.panel.elements[0]]);
      s.set(false); cycle(1); expect(mine()).toHaveLength(0);
    }

    // The older copy's entry was not drawn when the newer one started: off, yielding, not drawn yet,
    // and a copy never uninstalled. Both gone, Steam is as it was and the root did not mount again.
    for (const older of ["off", "yielding", "undrawn", "kept"]) {
      await newSession(); cycle(1);
      const [before, mounts, s1] = [changedValues(), fx.rootMounts, on()];
      const a = begin(s1);
      if (older === "yielding") win.__SHELVES_QAM_OWNER__ = "neutral-host";
      if (older === "off" || older === "yielding") cycle(1);
      if (older === "off") s1.set(false);
      const b = install(on(), pluginPanel(), {}, await freshModule());
      runDeferred(); delete win.__SHELVES_QAM_OWNER__; cycle(2); await flush(); cycle(1);
      expect(mine().map((e) => e.panel)).toEqual([b.panel.elements[0]]);
      if (older !== "kept") a.uninstall();
      b.uninstall(); cycle(1); fx.renderRoot();
      expect([changedValues(), fx.rootMounts, mine().length]).toEqual([before, mounts, 0]);
    }
  };
  it("U20 — two copies: every list holds the last-installed copy's entry; both uninstalled leave Steam as it was", u20);
  it("U55 — U20 in the host role", asHost(u20));
});

describe("ownQamTab — uninstall and errors", () => {
  const u17 = async () => {
    await newSession(); cycle(1);
    const before = changedValues(), s = on(), { uninstall } = begin(s);
    fx.openPanel(); expect(mine()).toHaveLength(1);
    const during = changedValues(); expect(during).not.toEqual(before);
    for (const v of [...Object.values(during), ...allFibers().flatMap((f) => [f.type, f.elementType])]) if (typeof v === "function") expect(Object.getOwnPropertySymbols(v)).toEqual([]);
    for (const v of Object.values(during)) if (typeof v === "function") for (const n of Object.getOwnPropertyNames(v)) expect(["length", "name", "prototype"]).toContain(n);
    uninstall();
    expect(changedValues()).toEqual(before);
    expect([vi.getTimerCount(), s.listeners.size]).toEqual([0, 0]);
    fx.closePanel(); fx.openPanel(); fx.renderRoot();
    expect(mine()).toHaveLength(0);
    expect(changedValues()).toEqual(before);

    // The root mounted again under the loader's change while installed: after uninstall it keeps its instance.
    await newSession(); const again = begin(); fx.installLoader(); cycle(1);
    const mounts = fx.rootMounts; again.uninstall(); cycle(2); fx.renderRoot();
    expect([fx.rootMounts, rootFiber().type, rootFiber().elementType, mine().length]).toEqual([mounts, fx.rootType, fx.rootType, 0]);
  };
  it("U17 — uninstall restores every changed value and leaves nothing running", u17);

  const u18 = async () => {
    const first = await shown();
    expect(() => { first.uninstall(); first.uninstall(); }).not.toThrow();
    fx.closePanel(); begin(); fx.openPanel();
    expect(mine()).toHaveLength(1);
    await newSession(); fx.withPanelView = false; fx.renderApp(); const early = install(on()); vi.advanceTimersByTime(1000); early.uninstall();
    expect(vi.getTimerCount()).toBe(0);
  };
  it("U18 — uninstall twice, then install again", u18);

  const u19 = async () => {
    const { uninstall } = await shown();
    fx.closePanel();
    const calls = { view: 0, root: 0, memo: 0 };
    const over = (prev: any, k: keyof typeof calls) => function thirdParty(this: unknown, ...args: unknown[]) { calls[k] += 1; return prev.apply(this, args); };
    fx.panelView.type = over(fx.panelView.type, "memo");
    fx.inlineView.type = over(fx.inlineView.type, "memo");
    const [view, root] = [viewFiber(), rootFiber()];
    const [viewWrap, rootWrap] = [over(view.type, "view"), over(root.type, "root")];
    for (const f of [view, view.alternate]) if (f) f.type = viewWrap;
    for (const f of [root, root.alternate]) if (f) f.type = rootWrap;
    const memoType = fx.panelView.type;
    uninstall(); fx.openPanel(); fx.renderRoot();
    expect(mine()).toHaveLength(0);
    expect([fx.panelView.type, viewFiber().type, rootFiber().type]).toEqual([memoType, viewWrap, rootWrap]);
    expect([calls.view > 0, calls.root > 0]).toEqual([true, true]);
    expect(fx.lastDraw().keys).toEqual([0, 3, 4, 5, 7, 6]);
  };
  it("U19 — values another party replaced after the component stay and keep working", u19);

  const u21 = async () => {
    await newSession();
    let factoryCalls = 0;
    const throwing = { stats: {}, elements: [], factory: () => { factoryCalls += 1; throw new Error("factory"); } };
    expect(() => install(on(), throwing as any)).not.toThrow();
    runDeferred(); cycle(3);
    noOwnEntryDrawn();
    expect([factoryCalls, count("error")]).toEqual([1, 1]);

    // The reader throws on its first call only: that call counts as not known, and the next one as on.
    let readerCalls = 0;
    const reader = { isEnabled: () => { readerCalls += 1; if (readerCalls === 1) throw new Error("reader"); return true; } };
    for (const bad of [reader, { subscribe: () => { throw new Error("subscribe"); } }]) {
      await newSession();
      logs.length = 0;
      const s = on();
      let un: () => void = () => {};
      expect(() => { un = install(s, pluginPanel(), bad).uninstall; }).not.toThrow();
      vi.advanceTimersByTime(60000); fx.openPanel();
      expect([steamReads(), count("error")]).toEqual([0, 1]);
      fx.closePanel(); s.notify(); runDeferred(); fx.openPanel();
      expect(mine()).toHaveLength(bad === reader ? 1 : 0);
      expect(() => un()).not.toThrow();
    }

    // A marker field that throws while the entry is built: the factory is not called again.
    await newSession(); logs.length = 0;
    const marked = begin(on(), { markerFields: Object.defineProperty({}, "boom", { enumerable: true, get: () => { throw new Error("marker"); } }) });
    cycle(3); noOwnEntryDrawn();
    expect([marked.panel.stats.calls, count("error")]).toEqual([1, 1]);

    // The component's own work throws: in the plugin role on reading the stamp, first a value with no
    // text and then errors whose text changes (at most three lines); in the host role on reading Steam's entries.
    await newSession({ mount: role !== "host" });
    if (role === "host") { fx.symbolReadThrows = true; fx.mount(); }
    logs.length = 0;
    begin();
    let reads = 0;
    if (role !== "host") Object.defineProperty(win, "__SHELVES_QAM_OWNER__", { get: () => { reads += 1; throw reads <= 2 ? Object.create(null) : new Error(`stamp ${reads}`); }, configurable: true });
    cycle(4);
    for (const d of fx.draws as Draw[]) expect(d.keys).toEqual([0, 3, 4, 5, 7, 6]);
    expect(count("error")).toBe(role === "host" ? 1 : 3);

    const steamError = new Error("steam failed");
    fx.rootThrows = steamError;
    let caught: unknown = null;
    try { fx.closePanel(); fx.openPanel(); fx.renderRoot(); } catch (err) { caught = err; }
    expect(caught instanceof AggregateError ? caught.errors[0] : caught).toBe(steamError);
    fx.rootThrows = null;

    // A sealed list: adding the entry throws, and the list stays as Steam built it.
    await newSession({ mount: false }); fx.sealLists = true; fx.mount(); logs.length = 0;
    const sealed = fx.lastList.slice(), drawsBefore = fx.draws.length; begin(); expect(() => cycle(3)).not.toThrow();
    for (const d of fx.draws as Draw[]) { expect(d.list).toBe(fx.lastList); expect(d.entries).toHaveLength(sealed.length); d.entries.forEach((e, i) => expect(e).toBe(sealed[i])); }
    expect([count("error"), fx.draws.length >= drawsBefore + 6]).toEqual([1, true]);
  };
  it("U21 — errors from the options and the component stay inside; Steam's pass through", u21);

  for (const [id, row] of Object.entries({ U17: u17, U18: u18, U19: u19, U21: u21 })) it(`U55 — ${id} in the host role`, asHost(row));
});

describe("ownQamTab — start-up", () => {
  function attemptsWithin(t0: number): number[] {
    const times = (fx.attemptTimes as number[]).map((t) => t - t0);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(250);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeLessThanOrEqual(3000);
    expect(times.length).toBeLessThanOrEqual(20);
    return times;
  }

  const u22 = async () => {
    const cases: Array<(f: any) => void> = [
      (f) => { reg.modules = f.modules.filter((m: any) => !("a" in m)); },
      (f) => { f.withPanelView = false; f.renderApp(); },
      (f) => { f.uiStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow = {}; },
      (f) => { reg.modules = f.modules.filter((m: any) => !("t" in m)); },
      (f) => { f.withPanelView = false; f.renderApp(); const onTime = setTimeout; vi.stubGlobal("setTimeout", (cb: () => void, ms = 0) => onTime(cb, ms + 1000)); },
    ];
    for (const breakIt of cases) {
      await newSession();
      breakIt(fx); logs.length = 0; fx.attemptTimes.length = 0;
      const t0 = Date.now();
      expect(() => { install(on()); vi.advanceTimersByTime(60000); }).not.toThrow();
      const last = attemptsWithin(t0).pop()!;
      expect([last > 27000, last <= 30000, count("warn"), vi.getTimerCount()]).toEqual([true, true, 1, 0]);
    }
  };
  it("U22 — missing pieces: bounded attempts, one report, no timer left", u22);

  const u23 = async () => {
    // The busy UI runs the work only when a timeout given to it elapses.
    const busy = (cb: () => void, o?: { timeout?: number }) => (typeof o?.timeout === "number" ? setTimeout(cb, o.timeout) : 0);
    const idles: Array<null | ((cb: () => void, o?: { timeout?: number }) => unknown)> = [(cb) => setTimeout(cb, 0), busy, null];
    for (const idle of idles) {
      await newSession();
      if (idle) { vi.stubGlobal("requestIdleCallback", idle); vi.stubGlobal("cancelIdleCallback", (id: any) => clearTimeout(id)); }
      const t0 = Date.now();
      install(on()); expect(steamReads()).toBe(0);
      vi.advanceTimersByTime(0); if (!idle) expect(steamReads()).toBe(0);
      vi.advanceTimersByTime(5000);
      expect(fx.firstReadAt === null ? Infinity : fx.firstReadAt - t0).toBeLessThanOrEqual(5000);
      vi.unstubAllGlobals();
      for (const [name, value] of Object.entries({ localStorage: store, SP_REACT: React, window: win })) vi.stubGlobal(name, value);
    }
  };
  it("U23 — install returns at once; the first Steam read within 5 s", u23);

  const u24 = async () => {
    for (const appears of [true, false]) {
      await newSession();
      fx.withPanelView = false; fx.renderApp(); fx.attemptTimes.length = 0;
      const t0 = Date.now();
      install(on()); vi.advanceTimersByTime(8000);
      if (appears) { fx.withPanelView = true; fx.renderApp(); }
      vi.advanceTimersByTime(4000);
      const times = attemptsWithin(t0), after = times.filter((t) => t >= 8000);
      vi.advanceTimersByTime(60000);
      if (!appears) {
        const last = attemptsWithin(t0).pop()!;
        expect([last > 27000, last <= 30000]).toEqual([true, true]);
        continue;
      }
      expect([after.length > 0, after[0] <= 11000, fx.attemptTimes.length - 1]).toEqual([true, true, times.indexOf(after[0])]);
      fx.openPanel();
      expect(mine()).toHaveLength(1);
    }
  };
  it("U24 — the panel appearing late, and never", u24);

  for (const [id, row] of Object.entries({ U22: u22, U23: u23, U24: u24 })) it(`U55 — ${id} in the host role`, asHost(row));
});

describe("ownQamTab — crash guard", () => {
  const crashOwn = (e: AnyEntry) => Object.getOwnPropertySymbols(e).length > 0;
  const pauseReports = () => logs.filter((l) => l.level === "warn" && /paused.*12 hours/.test(l.message)).length;
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

  async function crashingStart(boundary = false): Promise<void> {
    await newSession();
    Object.assign(fx, { crashOn: crashOwn, boundary });
    begin();
    let threw = false;
    try { fx.openPanel(); } catch { threw = true; }
    expect(threw).toBe(!boundary);
    if (boundary) cycle(1);
  }

  async function startIsPaused(): Promise<boolean> {
    await newSession(); logs.length = 0;
    install(on()); vi.advanceTimersByTime(60000); fx.openPanel();
    if (steamReads() === 0) expect(pauseReports()).toBe(1);
    return steamReads() === 0;
  }

  // One record, under the host's guard key in the host role and under another key in the plugin role.
  function expectRoleGuardKey(keys: string[]): void {
    expect([new Set(keys).size, keys[0] === HOST_GUARD]).toEqual([1, role === "host"]);
  }

  function recordSizes(): void {
    for (const v of store.map.values()) expect(v.length).toBeLessThanOrEqual(256);
    expectRoleGuardKey([...store.map.keys()]);
  }

  const u25 = async () => {
    for (let i = 0; i < 2; i++) await crashingStart();
    recordSizes();
    expect(await startIsPaused()).toBe(true);
    expect(mine()).toHaveLength(0);

    store.clear();
    await crashingStart();
    await shown();
    expect(mine()).toHaveLength(1);
    await crashingStart();
    expect(await startIsPaused()).toBe(false);

    store.clear();
    for (let i = 0; i < 2; i++) await crashingStart(true);
    recordSizes();
    expect(await startIsPaused()).toBe(true);

    // A completed first draw, then at every start a draw that crashes on a later list (voice chat
    // starts), or on the same list once the tab is selected.
    for (const later of [true, false]) {
      store.clear();
      for (let i = 0; i < 2; i++) {
        await shown(); await flush();
        fx.crashOn = (e: AnyEntry) => crashOwn(e) && (later ? !!fx.flags.voice : fx.remembered === e.key);
        expect(() => (later ? fx.setFlags({ voice: true }) : fx.selectTab(ownKey()))).toThrow();
      }
      expect(await startIsPaused()).toBe(true);
    }
  };
  it("U25 — failures in a row pause it; a completed draw clears the count; a caught throw and a later list count", u25);

  const u26 = async () => {
    // A reload during a draw; a kept old copy's work is taken over before its draw's confirmation runs.
    const reload = async (stopOld = true) => {
      const first = begin();
      const next = await freshModule();
      let reloaded = false;
      fx.beforeStrip.push((list: AnyEntry[]) => {
        if (reloaded || !ownEntries(list).length) return;
        reloaded = true;
        if (stopOld) first.uninstall();
        install(on(), pluginPanel(), {}, next);
      });
      fx.openPanel();
      expect(reloaded).toBe(true); if (!stopOld) runDeferred();
    };
    const scenarios: Array<() => Promise<void> | void> = [
      () => { begin(); },
      ...(role === "host" ? [] : [() => { begin(settingsSource(false)); fx.openPanel(); }, () => { fx.installHost("root"); begin(); cycle(1); fx.openPanel(); }]),
      () => { begin().uninstall(); fx.openPanel(); },
      // Stopped with no new copy, during a draw or before the draw's confirmation.
      () => { const r = begin(); fx.beforeStrip.push((l: AnyEntry[]) => { if (ownEntries(l).length) r.uninstall(); }); fx.openPanel(); },
      () => { const r = begin(); fx.openPanel(); r.uninstall(); },
      reload, () => reload(false),
      () => { begin(); cycle(1); },
      () => { vi.stubGlobal("SP_REACT", {}); begin(); cycle(1); },
    ];
    for (const scenario of scenarios) {
      for (let i = 0; i < 5; i++) { await newSession(); await scenario(); }
    }
    expect([pauseReports(), await startIsPaused()]).toEqual([0, false]);
    expect(mine()).toHaveLength(1);
  };
  it("U26 — no failure without a broken draw", u26);

  const u27 = async () => {
    for (let i = 0; i < 2; i++) await crashingStart();
    expect(await startIsPaused()).toBe(true);
    vi.setSystemTime(Date.now() + 12 * 60 * 60 * 1000);
    await crashingStart();
    expect(steamReads()).toBeGreaterThan(0);
    expect(await startIsPaused()).toBe(true);
    vi.setSystemTime(Date.now() + 12 * 60 * 60 * 1000);
    expect(await startIsPaused()).toBe(false);
    expect(mine()).toHaveLength(1);
    recordSizes();
    // A clock set back before the pause began ends it as well.
    store.clear();
    for (let i = 0; i < 2; i++) await crashingStart();
    expect(await startIsPaused()).toBe(true);
    vi.setSystemTime(Date.now() - 60 * 60 * 1000);
    expect(await startIsPaused()).toBe(false);
  };
  it("U27 — a pause expires; the next failure pauses again at once", u27);

  it("U28 — turning the activation off and on ends a pause", async () => {
    for (const sameStart of [true, false]) {
      store.clear();
      for (let i = 0; i < 2; i++) await crashingStart();
      expect(await startIsPaused()).toBe(true);
      await newSession();
      const s = settingsSource(sameStart); install(s);
      if (sameStart) { s.set(false); s.set(true); }
      vi.advanceTimersByTime(60000);
      expect(steamReads()).toBe(0);
      expect(await startIsPaused()).toBe(false);
    }
  });

  const u29 = async () => {
    const keys: string[] = [];
    vi.stubGlobal("localStorage", { getItem: (k: string) => { keys.push(k); throw new Error("read"); }, setItem: (k: string) => { keys.push(k); throw new Error("write"); } });
    await newSession();
    expect(() => { install(on()); runDeferred(); fx.openPanel(); }).not.toThrow();
    expect(mine()).toHaveLength(1);
    for (let i = 0; i < 3; i++) await crashingStart();
    expect(await startIsPaused()).toBe(false);
    expectRoleGuardKey(keys);
  };
  it("U29 — storage that throws stops nothing and cannot pause", u29);

  for (const [id, row] of Object.entries({ U25: u25, U26: u26, U27: u27, U29: u29 })) it(`U55 — ${id} in the host role`, asHost(row));
});

describe("ownQamTab — structure, cost and reports", () => {
  let gc: () => void = () => {};

  const u30 = async () => {
    const results: number[][] = [];
    for (const lang of ["en", "pt"]) {
      await newSession();
      fx.lang = lang; fx.renderRoot();
      const fixtureFns = [fx.Root, fx.panelView.type, fx.inlineView.type, fx.buildList];
      const toText = vi.spyOn(Function.prototype, "toString");
      begin(); fx.openPanel();
      const watched = new Set<unknown>([...fixtureFns, ...Object.values(changedValues())]);
      const readSources = toText.mock.contexts.filter((self) => watched.has(self)); toText.mockRestore();
      expect(readSources).toEqual([]);
      results.push(fx.lastDraw().entries.map((e: AnyEntry) => (ownEntries([e]).length ? -1 : e.key)));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toContain(-1);
  };
  it("U30 — the same result in two languages; no function source read", u30);

  const u31 = async () => {
    const measure = async (entries: number, records: number) => {
      await newSession({ mount: false });
      Object.assign(fx, { extraEntries: entries, extraRecords: records, countReads: true });
      fx.mount(); install(on());
      const located = watchFiberReads();
      runDeferred(); located.on = false;
      fx.openPanel(); fx.entryReads = 0;
      for (let i = 0; i < 100; i++) fx.renderRoot();
      expect(mine()).toHaveLength(1);
      return { perRender: fx.entryReads / 100, located: located.fibers.size };
    };
    const [small, bigTree, large] = [await measure(10, 100), await measure(10, 5000), await measure(200, 100)];
    expect(bigTree.perRender).toBe(small.perRender);
    expect(large.perRender).toBeLessThanOrEqual(small.perRender * (209 / 19) * 1.5);
    for (const run of [small, bigTree]) expect(run.located).toBeLessThanOrEqual(WALK_CAP);
    expect([bigTree.located - small.located <= 2 * 4900, reg.scans]).toEqual([true, 1]);
  };
  it("U31 — work per render grows with the list only; locating reads a bounded number of records", u31, 30000);

  const u32 = async () => {
    await newSession();
    const addSpy = vi.spyOn(EventTarget.prototype, "addEventListener"), s = on();
    begin(s); cycle(20); vi.advanceTimersByTime(60 * 60 * 1000);
    expect([vi.getTimerCount(), s.listeners.size]).toEqual([0, 1]);
    expect(addSpy).not.toHaveBeenCalled();
  };
  it("U32 — no timers or listeners after start-up", u32);

  const crashOwnEntry = (e: AnyEntry) => ownEntries([e]).length > 0;
  const u33 = async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const check = (info: number, warn: number) => {
      expect(logs.length).toBeLessThanOrEqual(5);
      expect([count("info"), count("warn"), count("error")]).toEqual([info, warn, 0]);
    };
    await newSession(); logs.length = 0; const r = begin();
    for (let i = 0; i < 10; i++) { fx.openPanel(); fx.renderRoot(); fx.closePanel(); }
    await flush(); r.uninstall(); check(3, 0);

    await newSession(); logs.length = 0;
    win.__SHELVES_QAM_OWNER__ = "neutral-host";
    if (role === "host") Object.assign(win, { __SHELVES_QAM__: { registerPanel: () => {} }, __SHELVES_HOST__: {} });
    begin(); cycle(10); await flush(); check(2, 0);
    expect(yieldReports()).toBe(role === "host" ? 0 : 1);

    await newSession(); logs.length = 0;
    fx.withPanelView = false; fx.renderApp(); install(on()); vi.advanceTimersByTime(60000);
    check(0, 1);

    store.clear();
    for (let i = 0; i < 2; i++) {
      await newSession();
      fx.crashOn = crashOwnEntry; begin();
      try { fx.openPanel(); } catch {}
    }
    await newSession(); logs.length = 0;
    install(on()); vi.advanceTimersByTime(60000); cycle(5);
    check(0, 1);
  };
  it("U33 — reports: what happened, at most five lines per start, none per render", u33);

  // React keeps the root's two fibers and the lists memoized on them. Its development build also
  // keeps the call stack of each element's creation, with the arrays mapped there, for a time-dependent
  // share of elements; stack capture is off for the run. Nothing else that Steam replaced may stay.
  async function survivors(): Promise<{ alive: object[]; tracked: number }> {
    await newSession();
    install(on()); runDeferred(); fx.openPanel();
    const refs: Array<WeakRef<object>> = [];
    for (let i = 0; i < 20; i++) {
      for (const e of fx.lastList as AnyEntry[]) if (!ownEntries([e]).length) refs.push(new WeakRef(e));
      refs.push(new WeakRef(fx.lastList), new WeakRef(rootFiber()));
      fx.setFlags({ voice: !fx.flags.voice });
      if (i === 10) { fx.installLoader(); cycle(1); fx.openPanel(); }
    }
    fx.renderRoot(); fx.renderRoot();
    await flush();
    fx.draws.length = 0; fx.builtLists.length = 0;
    vi.useRealTimers();
    for (let i = 0; i < 2; i++) { await new Promise((r) => setTimeout(r, 0)); gc(); }
    const fibers = [rootFiber(), rootFiber().alternate].filter(Boolean);
    const held: AnyEntry[][] = [fx.lastList];
    for (const f of fibers) for (let h = f.memoizedState; h; h = h.next) if (Array.isArray(h.memoizedState?.[0])) held.push(h.memoizedState[0]);
    const current = new Set<object>([...fibers, ...held, ...held.flat()]);
    const alive = refs.map((r) => r.deref()).filter((x): x is object => !!x && !current.has(x));
    vi.useFakeTimers();
    return { alive: [...new Set(alive)], tracked: new Set(refs.map((r) => r.deref() ?? r)).size };
  }

  const u35 = async () => {
    const builtin = (globalThis as any).process.getBuiltinModule;
    builtin("node:v8").setFlagsFromString("--expose_gc");
    gc = builtin("node:vm").runInNewContext("gc") as () => void;
    const errors = Error as unknown as { stackTraceLimit: number }, limit = errors.stackTraceLimit;
    errors.stackTraceLimit = 0;
    const { alive, tracked } = await survivors().finally(() => { errors.stackTraceLimit = limit; });
    expect([alive.length, tracked > 100]).toEqual([0, true]);
  };
  it("U35 — nothing that Steam replaced stays reachable", u35);

  const u36 = async () => {
    for (const flags of [{ vr: true }, { kiosk: true }] as Flags[]) {
      await newSession();
      fx.flags = { ...fx.flags, ...flags };
      begin(); fx.openPanel();
      const key = ownKey(); expect(key).toBeDefined(); fx.selectTab(key);
      const button = fx.panelDoc.getElementById(`quickaccess_tab_${key}`);
      expect([button.getAttribute("aria-selected"), button.disabled]).toEqual(["true", false]);
      expect(fx.panelDoc.getElementById(`quickaccess_content_${key}`).querySelector("[data-plugin-panel]")).not.toBeNull();
    }
  };
  it("U36 — VR and kiosk mode: the tab is drawn and can be selected", u36);

  const u37 = async () => {
    for (const mode of ["alone", "both", "late"]) {
      await newSession({ mount: false });
      Object.assign(fx, { withInlineView: mode !== "late", withPanelView: mode !== "alone" });
      fx.mount(); begin(); if (mode === "late") { fx.withInlineView = true; fx.renderApp(); } const from = fx.draws.length;
      fx.openPanel(); const draws = (fx.draws as Draw[]).slice(from);
      expect(new Set(draws.map((d) => d.list)).size).toBe(mode === "alone" ? 1 : 2);
      for (const d of draws) expect(mine(d)).toHaveLength(1);
    }
  };
  it("U37 — the inline container, alone and beside the panel view", u37);

  // The setting off, the owner stamp set, or the host's entry put into the same memoized list in the
  // root's render before the component's work. No opening draws a strip with no tab selected.
  it("U38 — Steam's remembered tab on the plugin's key falls back to Steam's first tab", async () => {
    const hostEntry = { key: HOST_KEY, tab: createElement("i"), panel: createElement("div"), vrLocation: "quick-access-menu", __shelvesTab: true };
    const selected = () => fx.panelDoc.querySelectorAll('[role="tab"][aria-selected="true"]').length;
    for (const how of ["off", "stamp", "entry"]) {
      await newSession();
      const s = on(); begin(s); fx.openPanel(); const key = ownKey(); fx.selectTab(key); fx.closePanel(); await flush();
      if (how === "off") s.set(false); else if (how === "stamp") win.__SHELVES_QAM_OWNER__ = "neutral-host";
      else fx.inRoot.push((l: AnyEntry[]) => { if (!l.includes(hostEntry)) l.splice(4, 0, hostEntry); });
      expect(() => fx.openPanel()).not.toThrow(); expect(selected()).toBe(1);
      if (how === "entry") { fx.closePanel(); fx.openPanel(); }
      expect([typeof key, fx.remembered, mine().length, selected(), fx.panelDoc.getElementById("quickaccess_tab_0").getAttribute("aria-selected")]).toEqual(["number", key, 0, 1, "true"]);
    }
  });

  const u39 = async () => {
    await newSession();
    // A separate library table with names of its own (E9); the component never touches it.
    const [touched, names] = [[] as string[], ["Alder", "Birch", "Cedar", "Elm", "Fir", "Hazel", "Larch", "Maple"]];
    const libTable = Object.fromEntries([...names.flatMap((n, i) => [[n, i], [i, n]]), [900, "HostTab"], ["HostTab", 900], [999, "LoaderTab"], ["LoaderTab", 999]]);
    const traps = ["get", "set", "has", "ownKeys", "defineProperty", "deleteProperty", "getOwnPropertyDescriptor"];
    const recording = (t: object): any => new Proxy(t, Object.fromEntries(traps.map((trap) => [trap, (...a: unknown[]) => { touched.push(trap); return (Reflect as any)[trap](...a); }])));
    reg.lib = recording({ tabNames: recording(libTable) }); win.DFL = reg.lib; vi.stubGlobal("DFL", reg.lib);
    const table = { ...fx.table };
    const r = begin(); fx.openPanel(); expect(fx.table).toEqual(table);
    r.uninstall(); cycle(1); fx.openPanel();
    expect([fx.table, touched]).toEqual([table, []]);
  };
  it("U39 — Steam's key table is not changed; the loader library's table is never read or written", u39);

  const u40 = async () => {
    await newSession();
    fx.freezeEntries = true; fx.installLoader(); Object.freeze(fx.loaderEntry); cycle(1);
    const before = fx.lastList.map((e: AnyEntry) => ({ ...e }));
    begin(); expect(() => fx.openPanel()).not.toThrow();
    const d: Draw = fx.lastDraw();
    expect(d.entries.filter((e) => !ownEntries([e]).length).map((e) => ({ ...e }))).toEqual(before);
    expect(d.entries.length).toBe(before.length + 1);
  };
  it("U40 — frozen entries of Steam and the other parties", u40);

  const hostRuns = { U30: u30, U31: u31, U32: u32, U33: u33, U35: u35, U36: u36, U37: u37, U39: u39, U40: u40 };
  for (const [id, row] of Object.entries(hostRuns)) it(`U55 — ${id} in the host role`, asHost(row), id === "U31" ? 30000 : undefined);
});
