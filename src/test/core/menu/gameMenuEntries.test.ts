import { afterEach, describe, expect, it, vi } from "vitest";
import { STEAM_EN, STEAM_PT_BR } from "../../fixtures/steamLocalizer";

const host = vi.hoisted(() => ({ read: new Set<string>(), afterPatch: null as unknown }));

// The module needs nothing from the adapter; the mock records every export read.
vi.mock("../../../runtime/host/decky", () => new Proxy({
  get afterPatch() { return host.afterPatch; },
  MenuItem: function MenuItem() { return null; },
  MenuGroup: function MenuGroup() { return null; },
  getFrontendLib: () => null,
}, { get(target, prop, receiver) { if (typeof prop === "string") host.read.add(prop); return Reflect.get(target, prop, receiver); } }));

import {
  installGameMenuEntries, type GameMenuEntriesEvent, type GameMenuEntriesHandle, type GameMenuEntriesOptions, type GameMenuListContext,
} from "../../../core/menu/gameMenuEntries";

type Props = Record<string, any>;
type El = { $$typeof: symbol; type: unknown; key: string | null; ref: null; props: Props };

const ELEMENT = Symbol.for("react.transitional.element");
const FRAGMENT = Symbol.for("react.fragment");
const PREFIX = "ds-";
const noop = () => {};
const GLOBALS = Object.getOwnPropertyNames(globalThis); // before any test attaches

// Plain objects: the test runner's React freezes the elements it creates, Steam's does not (E11).
const el = (type: unknown, props: Props = {}, key: string | null = null): El => ({ $$typeof: ELEMENT, type, key, ref: null, props });

const isEl = (value: unknown): value is El => !!value && typeof value === "object" && (value as El).$$typeof === ELEMENT;
const keyOf = (value: unknown): string | null => (isEl(value) ? value.key : null);
const isPlugin = (value: unknown): boolean => keyOf(value)?.startsWith(PREFIX) === true;
const sameItems = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((entry, i) => entry === b[i]);
const hasRender = (type: unknown) => typeof type === "function" && typeof type.prototype?.render === "function";

// Stand-ins for Steam's menu parts: the entry is a class, the others are functions (E10).
const leafCalls = { count: 0 };
class MenuItem { constructor() { leafCalls.count++; } render() { leafCalls.count++; return null; } }
const leaf = () => function leaf() { leafCalls.count++; return null; };
const [MenuGroup, Separator, AppsEntry, NavContainer, Wrapper] = [leaf(), leaf(), leaf(), leaf(), leaf()];

const item = (key: string | null = null) => el(MenuItem, { onSelected: noop, children: "entry" }, key);
const group = (children: unknown[], key: string | null = null) => el(MenuGroup, { label: "group", children }, key);
const pluginEntries = (tag = "a"): El[] => [item(`${PREFIX}${tag}-item`), group([item(`${PREFIX}${tag}-sub`)], `${PREFIX}${tag}-group`)];
const separator = () => el(Separator, {}, `${PREFIX}separator`);
const otherFragment = (key: string) => el(FRAGMENT, { children: [el(Separator), item()] }, key);

const removePlugin = (list: unknown[]): void => { for (let i = list.length - 1; i >= 0; i--) if (isPlugin(list[i])) list.splice(i, 1); };

function deepFreeze(value: unknown, except: unknown, seen = new Set<unknown>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze((value as Props)[key], except, seen);
  if (value !== except) Object.freeze(value);
}

function frozenExcept(value: unknown, except: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object" || value === except || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.keys(value).every((key) => frozenExcept((value as Props)[key], except, seen));
}

const shallowEqual = (a: any, b: any): boolean =>
  a === b || (!!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.is(a[key], b[key])));

// Records reads below an observed output, by element level (each `children` hop is one level).
const unwrapped = new WeakMap<object, object>();
const unwrap = (value: unknown): unknown => (value && typeof value === "object" && unwrapped.get(value)) || value;

class Recorder {
  armed = false; deepest = 0; reads = 0;
  private proxies = new WeakMap<object, object>();
  wrap(value: unknown, level = 0): unknown {
    if (!value || typeof value !== "object") return value;
    const known = this.proxies.get(value); if (known) return known;
    const proxy = new Proxy(value, {
      get: (target, key, receiver) => {
        if (this.armed) { this.reads++; this.deepest = Math.max(this.deepest, level); }
        return this.wrap(Reflect.get(target, key, receiver), key === "children" ? level + 1 : level);
      },
    });
    this.proxies.set(value, proxy); unwrapped.set(proxy, value);
    return proxy;
  }
}

type Layout = {
  appid?: number; apps?: number; installed?: boolean; favourite?: boolean; collections?: boolean;
  inCollection?: boolean; kiosk?: boolean; primary?: boolean; labels?: readonly string[]; handler?: () => void;
  before?: () => unknown[]; after?: () => unknown[]; freeze?: "output" | "list"; wrap?: number; wide?: number; recorder?: Recorder;
  menuType?: () => unknown;
};
type Fiber = {
  type: unknown; key: unknown; memoizedProps: Props | null; stateNode: any; child: Fiber | null; return: Fiber | null; alternate: null; pending?: boolean;
};
type SteamOptions = {
  desktop?: boolean; didMount?: boolean; check?: boolean; newer?: "getDerivedStateFromProps" | "getSnapshotBeforeUpdate"; others?: unknown[];
};

function makeSteam(options: SteamOptions = {}) {
  const counters = { gameNew: 0, gameRender: 0, gameMounted: 0, menuRender: 0, bodyNew: 0, bodyRender: 0, firstRenders: 0, updateChecks: 0, subscribed: 0 };
  const built = new WeakMap<object, { steam: unknown[]; properties: unknown }>();
  const gameLists = new WeakSet<object>();

  // The observer decorator (E6): a fixed own render on first render, and a shallow update check.
  function observer(cls: { prototype: any }, check = true): void {
    const proto = cls.prototype;
    const original = proto.render;
    proto.render = function render(this: any) {
      counters.firstRenders++;
      const self = this;
      Object.defineProperty(this, "render", { configurable: false, writable: false, value: () => original.call(self) });
      return this.render();
    };
    if (check) proto.shouldComponentUpdate = function shouldComponentUpdate(this: any, nextProps: Props, nextState: unknown) {
      counters.updateChecks++;
      return !shallowEqual(this.props, nextProps) || !shallowEqual(this.state, nextState);
    };
  }

  // Steam's slot order (E3); other parties' entries sit before Properties (E5) or after it.
  function listFor(layout: Layout): unknown[] {
    const appid = layout.appid ?? 282800;
    const apps = Array.from({ length: layout.apps ?? 1 }, (_, i) => ({ appid: appid + i }));
    let next = 0;
    const label = () => (layout.labels ? layout.labels[next++ % layout.labels.length] : "entry");
    const entry = (key: string | null = null) => el(MenuItem, { onSelected: layout.handler ?? noop, children: label() }, key);
    const menu = (children: unknown[]) => el(MenuGroup, { label: label(), children });
    const manage = [false, false, entry(), el(AppsEntry, { rgApps: apps }), layout.installed ? el(FRAGMENT, { children: [el(Separator), entry("uninstall")] }) : false];
    const properties = layout.kiosk || apps.length > 1 ? false : el(FRAGMENT, { children: [el(Separator), entry()] });
    const list: unknown[] = [
      layout.primary === false ? false : entry(), undefined,
      layout.favourite ? entry() : false, layout.favourite ? false : entry(),
      layout.collections === false ? false : menu([entry("add-1"), entry("add-2")]),
      layout.inCollection ? menu([entry("remove-1")]) : false,
      el(AppsEntry, { rgApps: apps }), layout.kiosk ? false : menu(manage), el(AppsEntry, { rgApps: apps }),
      ...(layout.before?.() ?? []), properties, ...(layout.after?.() ?? []),
    ];
    built.set(list, { steam: [...list], properties });
    if (apps.length === 1) gameLists.add(list);
    return list;
  }

  function outputFor(layout: Layout): unknown {
    const list = listFor(layout);
    const decoys = Array.from({ length: layout.wide ?? 0 }, () => [item()]);
    let output: unknown = el(layout.menuType?.() ?? Menu, { label: "title", children: layout.wide ? [...decoys, list] : list });
    for (let i = 0; i < (layout.wrap ?? 0); i++) output = el(Wrapper, { children: output });
    if (layout.freeze === "output") deepFreeze(output, list);
    if (layout.freeze === "list") Object.freeze(list);
    if (!layout.recorder) return output;
    layout.recorder.armed = true;
    return layout.recorder.wrap(output);
  }

  // Every game menu class renders through the same menu component and body (E7).
  function gameClass() {
    class GameMenu {
      props: Props; state = null; output: unknown = null;
      constructor(props: Props) { counters.gameNew++; counters.subscribed++; this.props = props; }
      render() { counters.gameRender++; this.output = outputFor(this.props.layout ?? {}); return this.output; }
      componentWillUnmount() { counters.subscribed--; }
    }
    if (options.didMount !== false) (GameMenu.prototype as any).componentDidMount = function componentDidMount() { counters.gameMounted++; };
    observer(GameMenu);
    return GameMenu;
  }
  const GameMenu = gameClass();

  // Another party adds its entries on every body render, once, after Steam's last app-list slot.
  function addOthers(list: unknown[], others: unknown[]): void {
    if (others.every((entry) => list.includes(entry))) return;
    list.splice(list.map((entry) => (isEl(entry) ? entry.type : null)).lastIndexOf(AppsEntry) + 1, 0, ...others);
  }

  // The body nests the very list first in a container (gamepad) or as its children (desktop), E7.
  class MenuBody {
    props: Props; state = null; rendered: unknown = null;
    constructor(props: Props) { counters.bodyNew++; this.props = props; }
    render() {
      counters.bodyRender++;
      const list = this.props.children;
      if (options.others && gameLists.has(list)) addOthers(list, options.others);
      this.rendered = Array.isArray(list) ? [...list] : list;
      if (options.desktop) return el("div", { className: "menu", children: list });
      const label = this.props.label ? el("div", { id: this.props.labelId, children: this.props.label }) : undefined;
      return el(NavContainer, { children: [list, label, this.props.submenu ? false : el(FRAGMENT, { children: [el(Separator), item(), undefined] })] });
    }
  }

  function Menu(props: Props) { counters.menuRender++; return el(MenuBody, { ...props, labelId: "menu-label" }); }
  // Another type that renders Steam's menu component with the same props.
  function OtherMenu(props: Props) { return el(Menu, props); }

  observer(MenuBody, options.check !== false);
  if (options.newer) Object.assign(options.newer === "getDerivedStateFromProps" ? MenuBody : MenuBody.prototype, { [options.newer]: () => null });

  // A small stand-in for React: mount, update check, forced update, unmount, fibers.
  function mount(element: unknown, mounted: any[], parent: Fiber | null): Fiber | null {
    if (!isEl(element) || !(hasRender(element.type) || element.type === Menu || element.type === OtherMenu)) return null;
    const fiber: Fiber = { type: element.type, key: element.key, memoizedProps: element.props, stateNode: null, child: null, return: parent, alternate: null };
    if (!hasRender(element.type)) { fiber.child = mount((element.type as (p: Props) => unknown)(element.props), mounted, fiber); return fiber; }
    const inst = new (element.type as new (p: Props) => any)(element.props);
    fiber.stateNode = Object.assign(inst, { props: element.props, _reactInternals: fiber });
    fiber.child = mount(inst.render(), mounted, fiber);
    if (typeof inst.componentDidMount === "function") mounted.push(inst);
    return fiber;
  }

  // Mounts a tree, then commits: componentDidMount runs children first, as in React.
  function mountAll(element: unknown, parent: Fiber | null = null): Fiber | null {
    const mounted: any[] = [];
    const fiber = mount(element, mounted, parent);
    for (const inst of mounted) inst.componentDidMount();
    return fiber;
  }
  const open = (element: unknown) => mountAll(element)!;

  function close(fiber: Fiber | null): void {
    if (!fiber) return;
    fiber.stateNode?.componentWillUnmount?.();
    close(fiber.child);
    Object.assign(fiber, { child: null, stateNode: null, memoizedProps: null });
  }

  function reconcile(fiber: Fiber, output: unknown): void {
    const child = fiber.child;
    if (child && isEl(output) && output.type === child.type && output.key === child.key) return update(child, output.props, false);
    close(child);
    fiber.child = mountAll(output, fiber);
  }

  // New props consult the update check; forced updates skip it (E6). Will-update runs before each re-render.
  function update(fiber: Fiber, next: Props, forced: boolean): void {
    const force = forced || fiber.pending === true;
    fiber.pending = false;
    if (!force && next === fiber.memoizedProps) return;
    const inst = fiber.stateNode;
    if (!inst) {
      fiber.memoizedProps = next;
      return reconcile(fiber, (fiber.type as (p: Props) => unknown)(next));
    }
    const go = force || typeof inst.shouldComponentUpdate !== "function" || inst.shouldComponentUpdate(next, inst.state);
    if (go) inst.UNSAFE_componentWillUpdate?.(next, inst.state);
    inst.props = next;
    fiber.memoizedProps = next;
    if (go) reconcile(fiber, inst.render());
  }

  const menuOf = (game: Fiber) => game.child!;
  const bodyOf = (game: Fiber) => game.child!.child!;
  return {
    GameMenu, Menu, OtherMenu, MenuBody, counters, open, close, menuOf, bodyOf, gameClass,
    game: (layout: Layout = {}, type: unknown = GameMenu) => el(type, { layout }),
    submenu: (children: unknown[]) => open(el(Menu, { children, submenu: true })),
    isGameList: (candidate: unknown) => gameLists.has(unwrap(candidate) as object),
    built: (list: unknown) => built.get(unwrap(list) as object)!,
    forceUpdate: (fiber: Fiber) => update(fiber, fiber.memoizedProps!, true),
    // One render of both: the body gets the fresh list and has its own forced update pending.
    forceBoth: (game: Fiber) => { bodyOf(game).pending = true; update(game, game.memoizedProps!, true); },
    rerender: (fiber: Fiber) => update(fiber, { ...fiber.memoizedProps }, false),
    rerenderMenu: (game: Fiber) => update(menuOf(game), { ...menuOf(game).memoizedProps }, false),
    listOf: (game: Fiber) => menuOf(game).memoizedProps!.children as unknown[],
    renderedOf: (game: Fiber) => bodyOf(game).stateNode.rendered as unknown[],
  };
}
type Steam = ReturnType<typeof makeSteam>;

type Callback = "check" | "provider" | "remover" | "separator";
type Calls = { checks: number; provider: number; remover: number; separator: number };
type Settings = { separator?: boolean; sink?: "record" | "throw" | "none" };
const NO_CALLS: Calls = { checks: 0, provider: 0, remover: 0, separator: 0 };

function makeInputs(steam: Steam, settings: Settings = {}) {
  const calls: Calls = { ...NO_CALLS };
  const events: GameMenuEntriesEvent[] = [];
  const contexts: GameMenuListContext[] = [];
  const provided: (readonly unknown[])[] = [];
  const receivers = new Set<unknown>(); // the callbacks are methods, as a caller may write them
  const state = { entries: (): unknown => pluginEntries(), fail: null as Callback | null };
  const failIf = (name: Callback) => { if (state.fail === name) throw new Error(name); };
  const sink = settings.sink ?? "record";
  const options: GameMenuEntriesOptions = {
    menuClass: steam.GameMenu,
    isGameMenuList(candidate) { receivers.add(this); calls.checks++; failIf("check"); return steam.isGameList(candidate); },
    entriesFor(context) {
      receivers.add(this); calls.provider++; failIf("provider"); contexts.push(context);
      const entries = state.entries() as readonly unknown[];
      if (Array.isArray(entries)) provided.push(entries);
      return entries;
    },
    removeOwnEntries(list) { receivers.add(this); calls.remover++; failIf("remover"); removePlugin(unwrap(list) as unknown[]); },
    makeSeparator() { receivers.add(this); calls.separator++; failIf("separator"); return settings.separator === false ? null : separator(); },
    onEvent: sink === "none" ? undefined : (event) => { events.push(event); if (sink === "throw") throw new Error("sink"); },
  };
  return { options, calls, events, contexts, provided, state, receivers, last: () => provided[provided.length - 1] };
}
type Inputs = ReturnType<typeof makeInputs>;

const PASS_TYPES = new Set<string>(["placed", "rejected", "empty", "failed"]);
const passes = (events: GameMenuEntriesEvent[]) => events.filter((event) => PASS_TYPES.has(event.type));
const types = (events: GameMenuEntriesEvent[]) => events.map((event) => event.type);

const handles: (GameMenuEntriesHandle | null)[] = [];
function attach(options: GameMenuEntriesOptions): GameMenuEntriesHandle {
  const handle = installGameMenuEntries(options);
  handles.push(handle);
  expect(handle).not.toBeNull();
  return handle!;
}

function setup(settings: Settings = {}, steamOptions: SteamOptions = {}) {
  const steam = makeSteam(steamOptions);
  const inputs = makeInputs(steam, settings);
  return { steam, inputs, handle: attach(inputs.options) };
}

// One block: the separator (when made) and the entries, contiguous, before Properties or last.
function expectBlock(list: readonly unknown[], entries: readonly unknown[] | undefined, properties: unknown, withSeparator = true): void {
  const size = (entries?.length ?? 0) + (withSeparator ? 1 : 0);
  const start = list.findIndex(isPlugin);
  expect(list.filter(isPlugin).map(keyOf)).toHaveLength(size);
  const block = list.slice(start, start + size);
  expect(block.every(isPlugin)).toBe(true);
  if (withSeparator) expect(keyOf(block[0])).toBe(`${PREFIX}separator`);
  expect(sameItems(block.slice(withSeparator ? 1 : 0), entries ?? [])).toBe(true);
  if (properties) expect(list[start + size]).toBe(properties);
  else expect(start + size).toBe(list.length);
}

// The rendered list of a game menu holds the latest entries before its Properties slot.
const expectRendered = (steam: Steam, inputs: Inputs, game: Fiber) =>
  expectBlock(steam.renderedOf(game), inputs.last(), steam.built(steam.listOf(game)).properties);

function expectBlockKeys(list: readonly unknown[], properties: unknown): void {
  const keys = list.filter(isPlugin).map(keyOf);
  expect(keys).toEqual([`${PREFIX}separator`, `${PREFIX}a-item`, `${PREFIX}a-group`]);
  const start = list.findIndex(isPlugin);
  expect(list.slice(start, start + keys.length).every(isPlugin)).toBe(true);
  expect(list[start + keys.length]).toBe(properties);
}

// Steam's own elements (and other parties') keep their identity and order.
const expectSteamKept = (list: readonly unknown[], steam: Steam, source: unknown) =>
  expect(sameItems(list.filter((entry) => !isPlugin(entry)), steam.built(source).steam.filter((entry) => !isPlugin(entry)))).toBe(true);

const steamOnly = (steam: Steam, game: Fiber) => sameItems(steam.renderedOf(game), steam.built(steam.listOf(game)).steam);

const protoSnapshot = (steam: Steam): unknown[] => [steam.GameMenu.prototype, steam.MenuBody.prototype].map((proto) =>
  Object.getOwnPropertyNames(proto).map((name) => ({ name, ...Object.getOwnPropertyDescriptor(proto, name) })));

// The slots the module may change, and what each holds now.
const slotsOf = (steam: Steam): [Props, string][] => [
  [steam.GameMenu.prototype, "render"], [steam.GameMenu.prototype, "componentDidMount"],
  [steam.MenuBody.prototype, "shouldComponentUpdate"], [steam.MenuBody.prototype, "UNSAFE_componentWillUpdate"], [steam.MenuBody.prototype, "render"],
];
const slotValues = (steam: Steam) => slotsOf(steam).map(([owner, name]) => Object.getOwnPropertyDescriptor(owner, name)?.value);

const firstGroup = (list: unknown[]) => list.find((entry) => isEl(entry) && entry.type === MenuGroup && !isPlugin(entry)) as El;

// One pass of each outcome: placed, rejected, empty, failed.
function allOutcomes(steam: Steam, inputs: Inputs, lists: unknown[][] = []): void {
  const placed = steam.open(steam.game({ installed: true }));
  const several = steam.open(steam.game({ apps: 2 }));
  inputs.state.entries = () => [];
  const empty = steam.open(steam.game({ installed: true }));
  inputs.state.entries = () => { throw new Error("provider"); };
  const failed = steam.open(steam.game({ installed: true }));
  inputs.state.entries = () => pluginEntries();
  for (const game of [placed, several, empty, failed]) { lists.push(steam.renderedOf(game)); steam.close(game); }
}

// A working menu (so the body is known), then one failing callback on its update and on a new menu's first render.
function failingRun(failing: Callback) {
  const steam = makeSteam();
  const inputs = makeInputs(steam);
  const handle = installGameMenuEntries(inputs.options)!;
  const result = { threw: false, pluginKeys: [] as unknown[], outcomes: [] as string[] };
  try {
    const game = steam.open(steam.game({ installed: true }));
    inputs.state.fail = failing;
    const start = inputs.events.length;
    steam.forceUpdate(game);
    const later = steam.open(steam.game({ installed: true }));
    for (const menu of [game, later]) result.pluginKeys.push(...steam.renderedOf(menu).filter(isPlugin).map(keyOf));
    result.outcomes = types(passes(inputs.events.slice(start)));
  } catch {
    result.threw = true;
  }
  handle.uninstall();
  return result;
}

// The two hosts' patch helpers (E12): one lets handler errors through, one catches them.
function patchModel(catches: boolean) {
  return (object: Props, name: string, handler: (args: unknown[], result: unknown) => unknown) => {
    const original = object[name];
    object[name] = function patched(this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      try { return handler(args, result); } catch (error) { if (!catches) throw error; return result; }
    };
    return { unpatch: () => { object[name] = original; } };
  };
}

// Lets weak references settle (they hold until the current job ends), then forces full collections.
async function collectGarbage(): Promise<void> {
  const node = (globalThis as { process?: { getBuiltinModule?: (id: string) => any } }).process;
  node?.getBuiltinModule?.("node:v8").setFlagsFromString("--expose-gc");
  const gc: () => void = node?.getBuiltinModule?.("node:vm").runInNewContext("gc");
  for (let i = 0; i < 3; i++) { await new Promise((resolve) => setTimeout(resolve, 0)); gc(); }
}

// Ten menus with two passes each; weak references to what they rendered.
function closedMenus(steam: Steam): WeakRef<object>[] {
  const refs: WeakRef<object>[] = [];
  for (let i = 0; i < 10; i++) {
    const game = steam.open(steam.game({ installed: true }));
    const first = steam.listOf(game);
    steam.forceUpdate(game);
    const lists = [first, steam.listOf(game), steam.renderedOf(game)];
    const objects = [game.stateNode, steam.bodyOf(game).stateNode, game.stateNode.output, ...lists, ...lists.flat()];
    for (const object of objects) if (object && typeof object === "object") refs.push(new WeakRef(object));
    steam.close(game);
  }
  return refs;
}

afterEach(() => {
  for (const handle of handles.splice(0)) handle?.uninstall();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("installGameMenuEntries", () => {
  it("U1 places the separator and the entries once, before Properties, in an installed game's gamepad menu", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true, inCollection: true }));
    const list = steam.listOf(game);
    expectRendered(steam, inputs, game);
    expectSteamKept(steam.renderedOf(game), steam, list);
    expect(sameItems(steam.renderedOf(game), list)).toBe(true);
    expect(inputs.contexts.length).toBeGreaterThan(0);
    for (const context of inputs.contexts) {
      expect(context.list).toBe(list);
      expect(context.props).toBe(game.stateNode.props);
    }
  });

  it("U2 places the block the same way for other layouts, in the gamepad and desktop presentations", () => {
    const layouts: Layout[] = [{ installed: true }, { installed: false }, { appid: 4241608999, collections: false }, { appid: 1255560, primary: false, favourite: true, inCollection: true }];
    for (const desktop of [false, true]) {
      for (const layout of layouts) {
        const { steam, inputs, handle } = setup({}, { desktop });
        const game = steam.open(steam.game(layout));
        const list = steam.listOf(game);
        expectRendered(steam, inputs, game);
        expectSteamKept(steam.renderedOf(game), steam, list);
        expect(inputs.contexts.every((context) => context.list === list && context.props === game.stateNode.props)).toBe(true);
        handle.uninstall();
      }
    }
  });

  it("U3 keeps one block before Properties through forced updates of the game menu, alone and in one render with its body", () => {
    for (const check of [true, false]) {
      const { steam, inputs, handle } = setup({}, { check });
      const game = steam.open(steam.game({ installed: true }));
      for (let i = 0; i < 10; i++) {
        const before = steam.listOf(game);
        if (i % 2) steam.forceBoth(game); else steam.forceUpdate(game);
        const list = steam.listOf(game);
        expect(list).not.toBe(before);
        expectRendered(steam, inputs, game);
        expectSteamKept(steam.renderedOf(game), steam, list);
        expect(inputs.contexts[inputs.contexts.length - 1].list).toBe(list);
      }
      expect(steam.counters.gameNew).toBe(1);
      handle.uninstall();
    }
  });

  it("U4 keeps one block with the same keys while the body renders the same list again", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true }));
    const list = steam.listOf(game);
    const keys = steam.renderedOf(game).map(keyOf);
    for (let i = 0; i < 5; i++) {
      steam.forceUpdate(steam.bodyOf(game));
      expect(steam.renderedOf(game).map(keyOf)).toEqual(keys);
      steam.rerenderMenu(game);
      expect(steam.listOf(game)).toBe(list);
      expect(list.map(keyOf)).toEqual(keys);
    }
    expectBlock(list, inputs.last(), steam.built(list).properties);
  });

  it("U5 leaves submenu lists unchanged and keeps one block while submenus open and hide", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true, inCollection: true }));
    const groups = steam.listOf(game).filter((entry): entry is El => isEl(entry) && entry.type === MenuGroup);
    expect(groups.filter(isPlugin)).toHaveLength(1);
    expect(groups).toHaveLength(4);
    const providerCalls = inputs.calls.provider;
    for (const submenuOf of groups) {
      for (let i = 0; i < 3; i++) {
        const items: unknown[] = submenuOf.props.children;
        const copy = [...items];
        const submenu = steam.submenu(items);
        steam.rerender(submenu);
        steam.close(submenu);
        expect(sameItems(items, copy)).toBe(true);
        steam.forceUpdate(steam.bodyOf(game));
        expectRendered(steam, inputs, game);
      }
    }
    expect(inputs.calls.provider).toBe(providerCalls);
    expect(types(passes(inputs.events))).toEqual(["placed"]);
  });

  it("U6 replaces the entries of an earlier pass with the provider's new ones", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true }));
    expect(steam.renderedOf(game).map(keyOf)).toContain(`${PREFIX}a-item`);
    inputs.state.entries = () => pluginEntries("b");
    steam.forceUpdate(game);
    expectRendered(steam, inputs, game);
    expect(steam.renderedOf(game).map(keyOf).filter((key) => key?.startsWith(`${PREFIX}a-`))).toEqual([]);
  });

  it("U7 removes an earlier block when the provider returns nothing to add", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true }));
    const list = steam.listOf(game);
    for (const result of [[], null, "entries"]) {
      inputs.state.entries = () => pluginEntries();
      steam.rerenderMenu(game);
      expect(list.filter(isPlugin)).toHaveLength(3);
      inputs.state.entries = () => result;
      const start = inputs.events.length;
      steam.rerenderMenu(game);
      expect(list.some(isPlugin)).toBe(false);
      expect(types(inputs.events.slice(start))).toEqual(["empty"]);
    }
    expectSteamKept(list, steam, list);
  });

  it("U8 puts the block last when the list has no Properties slot", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ kiosk: true }));
    expect(steam.built(steam.listOf(game)).properties).toBe(false);
    expectBlock(steam.renderedOf(game), inputs.last(), null);
    expectSteamKept(steam.renderedOf(game), steam, steam.listOf(game));
  });

  it("U9 puts the block after other parties' entries that sit before Properties", () => {
    const { steam, inputs } = setup();
    const others = [item("other-a"), otherFragment("other-b")];
    const game = steam.open(steam.game({ installed: true, before: () => others }));
    const rendered = steam.renderedOf(game);
    expectRendered(steam, inputs, game);
    const at = rendered.indexOf(others[1]);
    expect(rendered[at - 1]).toBe(others[0]);
    expect(keyOf(rendered[at + 1])).toBe(`${PREFIX}separator`);
    expectSteamKept(rendered, steam, steam.listOf(game));
  });

  it("U10 keeps the block directly before Steam's Properties when other parties' elements follow it", () => {
    const { steam, inputs } = setup();
    const others = [item("other-c"), otherFragment("other-d")];
    const game = steam.open(steam.game({ installed: true, after: () => others }));
    const rendered = steam.renderedOf(game);
    expectRendered(steam, inputs, game);
    expect(sameItems(rendered.slice(rendered.indexOf(steam.built(steam.listOf(game)).properties) + 1), others)).toBe(true);
    expectSteamKept(rendered, steam, steam.listOf(game));
  });

  it("U11 leaves submenus, collection menus, the plugin's own menu and menus for several apps unchanged", () => {
    const { steam, inputs } = setup();
    const warm = steam.open(steam.game({ installed: true }));
    const submenu = firstGroup(steam.listOf(warm)).props.children as unknown[];
    const collection: unknown[] = [false, false, item(), false];
    const fallback: unknown[] = [item("play"), el(Separator, {}, `${PREFIX}sep`), item(`${PREFIX}card-hide`), group([], `${PREFIX}card-add-shelf`)];
    const calls = { ...inputs.calls };
    const start = inputs.events.length;
    for (const items of [submenu, collection, fallback]) {
      const copy = [...items];
      const menu = steam.open(el(steam.Menu, { children: items, submenu: items === submenu }));
      steam.rerender(menu);
      steam.forceUpdate(menu.child!);
      expect(sameItems(items, copy)).toBe(true);
      expect(sameItems(menu.child!.stateNode.rendered, copy)).toBe(true);
      steam.close(menu);
    }
    const several = steam.open(steam.game({ apps: 3 }));
    const first = steam.listOf(several);
    steam.forceUpdate(several);
    steam.rerenderMenu(several);
    const latest = steam.listOf(several);
    expect(sameItems(first, steam.built(first).steam)).toBe(true);
    expect(sameItems(latest, steam.built(latest).steam)).toBe(true);
    expect(steamOnly(steam, several)).toBe(true);
    expect({ ...inputs.calls, checks: 0 }).toEqual({ ...calls, checks: 0 });
    expect(types(passes(inputs.events.slice(start)))).toEqual(["rejected"]);
  });

  it("U12 contains a throwing check, provider, remover or separator maker", () => {
    for (const failing of ["check", "provider", "remover", "separator"] as Callback[]) {
      const result = failingRun(failing);
      expect(result.threw).toBe(false);
      expect(result.pluginKeys).toEqual([]);
      expect(result.outcomes).toEqual(["failed", "failed"]);
    }
  });

  it("U13 gives the same outcomes under either host patch helper, and reads no host helper", () => {
    const results: unknown[] = [];
    for (const catches of [false, true]) {
      host.afterPatch = patchModel(catches);
      results.push((["check", "provider", "remover", "separator"] as Callback[]).map(failingRun));
    }
    expect(results[0]).toEqual(results[1]);
    expect([...host.read]).toEqual([]);
  });

  it("U14 completes every step as without a sink when the event sink throws", () => {
    const run = (sink: "throw" | "none") => {
      const steam = makeSteam();
      const inputs = makeInputs(steam, { sink });
      const lists: unknown[][] = [];
      const state = { handle: null as GameMenuEntriesHandle | null };
      expect(() => {
        state.handle = installGameMenuEntries(inputs.options);
        allOutcomes(steam, inputs, lists);
        state.handle?.uninstall();
      }).not.toThrow();
      return { attached: state.handle !== null, lists: lists.map((list) => list.map(keyOf)), calls: inputs.calls };
    };
    expect(run("throw")).toEqual(run("none"));
  });

  it("U15 changes only the accepted list of a deep-frozen render output", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true, freeze: "output" }));
    for (let i = 0; i < 2; i++) {
      if (i > 0) steam.forceUpdate(game);
      const list = steam.listOf(game);
      expect(Object.isFrozen(list)).toBe(false);
      expect(frozenExcept(game.stateNode.output, list)).toBe(true);
      expectRendered(steam, inputs, game);
      expectSteamKept(list, steam, list);
    }
    expect(types(passes(inputs.events))).toEqual(["placed", "placed"]);
  });

  it("U16 reports failed and leaves a frozen accepted list unchanged", () => {
    const { steam, inputs } = setup();
    const game = steam.open(steam.game({ installed: true, freeze: "list" }));
    expect(sameItems(steam.listOf(game), steam.built(steam.listOf(game)).steam)).toBe(true);
    expect(() => steam.forceUpdate(game)).not.toThrow();
    expect(steamOnly(steam, game)).toBe(true);
    expect(types(passes(inputs.events))).toEqual(["failed", "failed"]);
  });

  it("U17 places the block the same way in two languages without reading function source", () => {
    const watched = new Set<unknown>();
    const original = Function.prototype.toString;
    let sourceReads = 0;
    vi.spyOn(Function.prototype, "toString").mockImplementation(function toString(this: unknown) {
      if (!watched.has(this)) return original.call(this);
      sourceReads++;
      throw new Error("source");
    });
    const handler = () => {};
    Object.defineProperty(handler, "toString", { value: () => { sourceReads++; throw new Error("source"); } });
    const positions: number[][] = [];
    for (const labels of [Object.values(STEAM_EN), Object.values(STEAM_PT_BR)]) {
      const { steam, inputs, handle } = setup();
      for (const fn of [steam.GameMenu, steam.Menu, steam.MenuBody, MenuItem, MenuGroup, Separator, AppsEntry, handler]) watched.add(fn);
      const game = steam.open(steam.game({ installed: true, inCollection: true, labels, handler }));
      const rendered = steam.renderedOf(game);
      expect(rendered.some((entry) => isEl(entry) && labels.includes(entry.props.children))).toBe(true);
      expectRendered(steam, inputs, game);
      positions.push(rendered.flatMap((entry, i) => (isPlugin(entry) ? [i] : [])));
      handle.uninstall();
    }
    expect(positions[0]).toEqual(positions[1]);
    expect(sourceReads).toBe(0);
  });

  it("U18 bounds each pass: check calls, callback calls and read depth", () => {
    const steam = makeSteam();
    const inputs = makeInputs(steam);
    const perPass: (Calls & { type: string })[] = [];
    let mark = { ...inputs.calls };
    attach({
      ...inputs.options,
      onEvent: (event) => {
        if (!PASS_TYPES.has(event.type)) return;
        const c = inputs.calls;
        perPass.push({ type: event.type, checks: c.checks - mark.checks, provider: c.provider - mark.provider, remover: c.remover - mark.remover, separator: c.separator - mark.separator });
        mark = { ...c };
      },
    });
    const layouts: [Layout, string][] = [
      [{ installed: true }, "placed"], [{ installed: false }, "placed"], [{ appid: 4241608999, collections: false }, "placed"],
      [{ appid: 1255560, primary: false, favourite: true }, "placed"], [{ kiosk: true }, "placed"], [{ apps: 4 }, "rejected"],
      [{ before: () => [item("other-a")], after: () => [otherFragment("other-b")] }, "placed"],
      [{ wrap: 4 }, "placed"], [{ wrap: 5 }, "rejected"], [{ wrap: 9 }, "rejected"], [{ wide: 100 }, "rejected"],
    ];
    for (const [layout, outcome] of layouts) {
      const recorder = new Recorder();
      const inst = new steam.GameMenu({ layout: { ...layout, recorder } });
      let outside = 0;
      for (const name of ["_reactInternals", "state"]) Object.defineProperty(inst, name, { configurable: true, get: () => { if (recorder.armed) outside++; return null; } });
      steam.GameMenu.prototype.render.call(inst);
      recorder.armed = false;
      expect(perPass[perPass.length - 1].type).toBe(outcome);
      expect(recorder.reads).toBeGreaterThan(0);
      expect(recorder.deepest).toBeLessThanOrEqual(6);
      expect(outside).toBe(0);
    }
    const game = steam.open(steam.game({ installed: true }));
    steam.forceUpdate(game);
    steam.rerenderMenu(game);
    steam.rerender(steam.submenu([item(), item()]));
    expect(perPass.length).toBe(layouts.length + 3);
    for (const pass of perPass) {
      expect(pass.checks).toBeLessThanOrEqual(16);
      const accepted = pass.type === "placed" || pass.type === "empty";
      for (const count of [pass.provider, pass.remover, pass.separator]) expect(count).toBe(accepted ? 1 : 0);
    }
    expect(Math.max(...perPass.map((pass) => pass.checks))).toBe(16);
    expect([...inputs.receivers]).toEqual([undefined]);
  });

  it("U19 schedules no timers, adds no listeners or globals and logs nothing", () => {
    vi.useFakeTimers();
    const listeners = vi.spyOn(EventTarget.prototype, "addEventListener");
    const frames = vi.fn();
    vi.stubGlobal("requestAnimationFrame", frames);
    vi.stubGlobal("requestIdleCallback", frames);
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));
    const { steam, inputs, handle } = setup();
    for (let i = 0; i < 5; i++) {
      const game = steam.open(steam.game({ installed: i % 2 === 0 }));
      steam.forceUpdate(game);
      steam.forceUpdate(game);
      steam.rerenderMenu(game);
      steam.close(game);
    }
    handle.uninstall();
    expect(passes(inputs.events)).toHaveLength(20);
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners).not.toHaveBeenCalled();
    expect(frames).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyNames(globalThis).filter((name) => !GLOBALS.includes(name))).toEqual(["requestAnimationFrame", "requestIdleCallback"]);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("U20 returns the same handle for the same class, never calls the second inputs, and attaches another class on its own", () => {
    const scenario = (steam: Steam, inputs: Inputs) => {
      const game = steam.open(steam.game({ installed: true }));
      steam.forceUpdate(game);
      steam.rerenderMenu(game);
      steam.rerender(steam.submenu([item()]));
      return { types: types(inputs.events), calls: { ...inputs.calls }, keys: steam.renderedOf(game).map(keyOf) };
    };
    const single = setup();
    const reference = scenario(single.steam, single.inputs);
    const steam = makeSteam();
    const first = makeInputs(steam);
    const second = makeInputs(steam, { separator: false });
    const handle = attach(first.options);
    expect(installGameMenuEntries(second.options)).toBe(handle);
    expect(scenario(steam, first)).toEqual(reference);
    expect(second.calls).toEqual(NO_CALLS);
    expect(second.events).toEqual([]);
    const other = setup();
    expect(other.handle).not.toBe(handle);
    expectRendered(other.steam, other.inputs, other.steam.open(other.steam.game({ installed: true })));
    expectRendered(steam, first, steam.open(steam.game({ installed: true })));
  });

  it("U21 refuses unusable inputs without changing anything or throwing", () => {
    const steam = makeSteam();
    const before = protoSnapshot(steam);
    class NoRender {}
    const plain = function plain() {};
    const names = () => [NoRender.prototype, plain.prototype].map((proto) => Object.getOwnPropertyNames(proto));
    const fixtures = names();
    const changes: Partial<Record<keyof GameMenuEntriesOptions, unknown>>[] = [
      { menuClass: null }, { menuClass: plain }, { menuClass: {} }, { menuClass: NoRender },
      { isGameMenuList: undefined }, { entriesFor: undefined }, { removeOwnEntries: undefined },
    ];
    for (const change of changes) {
      const inputs = makeInputs(steam);
      let handle: unknown = "unset";
      expect(() => { handle = installGameMenuEntries({ ...inputs.options, ...change } as GameMenuEntriesOptions); }).not.toThrow();
      expect(handle).toBeNull();
      expect(types(inputs.events)).toEqual(["install-failed"]);
      expect(inputs.calls).toEqual(NO_CALLS);
    }
    expect(installGameMenuEntries(undefined as unknown as GameMenuEntriesOptions)).toBeNull();
    expect(protoSnapshot(steam)).toEqual(before);
    expect(names()).toEqual(fixtures);
    // A class whose second slot cannot be replaced: the first one is put back.
    class Locked { render() { return null; } }
    Object.defineProperty(Locked.prototype, "componentDidMount", { value: noop, writable: false, configurable: false });
    const descriptors = () => Object.getOwnPropertyNames(Locked.prototype).map((name) => Object.getOwnPropertyDescriptor(Locked.prototype, name));
    const lockedBefore = descriptors();
    const inputs = makeInputs(steam);
    expect(installGameMenuEntries({ ...inputs.options, menuClass: Locked })).toBeNull();
    expect(types(inputs.events)).toEqual(["install-failed"]);
    expect(descriptors()).toEqual(lockedBefore);
  });

  it("U22 calls, constructs and renders nothing while attaching", () => {
    const steam = makeSteam();
    const inputs = makeInputs(steam);
    leafCalls.count = 0;
    const counters = { ...steam.counters };
    attach(inputs.options);
    expect(steam.counters).toEqual(counters);
    expect(leafCalls.count).toBe(0);
    expect(inputs.calls).toEqual(NO_CALLS);
    expect(types(inputs.events)).toEqual(["installed"]);
  });

  it("U23 puts every changed slot back and places nothing after detaching", () => {
    for (const options of [{}, { didMount: false, check: false }, { newer: "getDerivedStateFromProps" }, { newer: "getSnapshotBeforeUpdate" }] as SteamOptions[]) {
      const steam = makeSteam(options);
      const before = protoSnapshot(steam);
      const original = slotValues(steam);
      const inputs = makeInputs(steam);
      const handle = attach(inputs.options);
      const open = steam.open(steam.game({ installed: true }));
      expect(steam.renderedOf(open).some(isPlugin)).toBe(true);
      expect(slotValues(steam).map((value, i) => value !== original[i])).toEqual([true, true, options.check !== false, !options.newer, true]);
      handle.uninstall();
      expect(protoSnapshot(steam)).toEqual(before);
      const later = steam.open(steam.game({ installed: true }));
      expect(steam.renderedOf(later).some(isPlugin)).toBe(false);
      steam.forceUpdate(open);
      steam.forceBoth(later);
      for (const game of [open, later]) expect(steam.renderedOf(game).some(isPlugin)).toBe(false);
      expect(types(inputs.events).slice(-1)).toEqual(["uninstalled"]);
    }
    // Two game classes share the body; detaching in attach order still puts its slots back.
    const steam = makeSteam();
    const before = protoSnapshot(steam);
    const Other = steam.gameClass();
    const first = attach(makeInputs(steam).options);
    const second = attach({ ...makeInputs(steam).options, menuClass: Other });
    expect(second).not.toBe(first);
    for (const type of [steam.GameMenu, Other]) expect(steam.renderedOf(steam.open(steam.game({ installed: true }, type))).some(isPlugin)).toBe(true);
    first.uninstall();
    second.uninstall();
    expect(protoSnapshot(steam)).toEqual(before);
  });

  it("U24 leaves third-party wrappers in place and working when detaching", () => {
    const { steam, handle } = setup();
    steam.close(steam.open(steam.game({ installed: true })));
    const slots = slotsOf(steam);
    const thirdCalls = slots.map(() => 0);
    const wrappers = slots.map(([owner, name], i) => {
      const previous = owner[name];
      owner[name] = function wrapped(this: unknown, ...args: unknown[]) { thirdCalls[i]++; return previous.apply(this, args); };
      return owner[name];
    });
    handle.uninstall();
    slots.forEach(([owner, name], i) => expect(owner[name]).toBe(wrappers[i]));
    const mounted = steam.counters.gameMounted;
    const game = steam.open(steam.game({ installed: true }));
    expect(steamOnly(steam, game)).toBe(true);
    steam.forceUpdate(game);
    expect(steamOnly(steam, game)).toBe(true);
    expect(thirdCalls).toEqual([1, 1, 1, 1, 1]);
    expect(steam.counters.gameMounted).toBe(mounted + 1);
  });

  it("U25 ignores a second detach and attaches again like the first time", () => {
    const { steam, inputs, handle } = setup();
    handle.uninstall();
    expect(() => handle.uninstall()).not.toThrow();
    expect(types(inputs.events)).toEqual(["installed", "uninstalled"]);
    const again = attach(inputs.options);
    expect(again).not.toBe(handle);
    const game = steam.open(steam.game({ installed: true }));
    expectRendered(steam, inputs, game);
    steam.forceUpdate(game);
    expectRendered(steam, inputs, game);
    // A provider that detaches during a pass gets nothing placed.
    inputs.state.entries = () => { again.uninstall(); return pluginEntries(); };
    steam.forceUpdate(game);
    expect(steam.renderedOf(game).some(isPlugin)).toBe(false);
    expect(types(inputs.events).slice(-2)).toEqual(["uninstalled", "failed"]);
  });

  it("U26 keeps one block with two independent copies attached to the same class", async () => {
    vi.resetModules();
    const one = await import("../../../core/menu/gameMenuEntries");
    vi.resetModules();
    const two = await import("../../../core/menu/gameMenuEntries");
    expect(one.installGameMenuEntries).not.toBe(two.installGameMenuEntries);
    const steam = makeSteam();
    handles.push(one.installGameMenuEntries(makeInputs(steam).options), two.installGameMenuEntries(makeInputs(steam).options));
    expect(handles.slice(-2).every((handle) => handle !== null)).toBe(true);
    const game = steam.open(steam.game({ installed: true }));
    const properties = () => steam.built(steam.listOf(game)).properties;
    expectBlockKeys(steam.renderedOf(game), properties());
    for (let i = 0; i < 3; i++) {
      steam.forceUpdate(game);
      expectBlockKeys(steam.renderedOf(game), properties());
      steam.rerenderMenu(game);
      expectBlockKeys(steam.listOf(game), properties());
    }
  });

  it("U27 leaves a menu rendered before attaching with at most one block and gives the next menu one", () => {
    const steam = makeSteam();
    const inputs = makeInputs(steam);
    const old = steam.open(steam.game({ installed: true }));
    attach(inputs.options);
    const atMostOne = () => {
      const rendered = steam.renderedOf(old);
      expectSteamKept(rendered, steam, steam.listOf(old));
      if (rendered.some(isPlugin)) expectBlockKeys(rendered, steam.built(steam.listOf(old)).properties);
    };
    steam.forceUpdate(old);
    atMostOne();
    expectRendered(steam, inputs, steam.open(steam.game({ installed: true })));
    steam.forceUpdate(old);
    atMostOne();
  });

  it("U28 replaces plugin elements left at the end and from an earlier pass with one block", () => {
    const { steam, inputs } = setup();
    const stale = () => [item(`${PREFIX}stale-1`), group([], `${PREFIX}stale-2`)];
    const game = steam.open(steam.game({ installed: true, after: stale }));
    const list = steam.listOf(game);
    expectRendered(steam, inputs, game);
    list.push(...stale());
    steam.rerenderMenu(game);
    expectBlock(list, inputs.last(), steam.built(list).properties);
    steam.forceUpdate(game);
    expectRendered(steam, inputs, game);
  });

  it("U29 places the provider's very elements as direct elements, in its order", () => {
    for (const variant of ["separator", "none", "not functions"]) {
      const steam = makeSteam();
      const inputs = makeInputs(steam, { separator: variant === "separator" });
      const invalid = variant === "not functions" ? { makeSeparator: 1 as never, onEvent: {} as never } : {};
      const handle = attach({ ...inputs.options, ...invalid });
      const entries = [item(`${PREFIX}x`), group([item(`${PREFIX}y-sub`)], `${PREFIX}y`), item(`${PREFIX}z`)];
      const props = entries.map((entry) => entry.props);
      inputs.state.entries = () => entries;
      const game = steam.open(steam.game({ installed: true }));
      expectBlock(steam.renderedOf(game), entries, steam.built(steam.listOf(game)).properties, variant === "separator");
      expect(entries.every((entry, i) => entry.props === props[i] && isPlugin(entry))).toBe(true);
      handle.uninstall();
    }
  });

  it("U30 reports attach, one outcome per pass and detach, in order", () => {
    const { steam, inputs, handle } = setup();
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(12.5);
    allOutcomes(steam, inputs);
    handle.uninstall();
    expect(types(inputs.events)).toEqual(["installed", "placed", "rejected", "empty", "failed", "uninstalled"]);
    expect(inputs.events[1]).toEqual({ type: "placed", entries: 2, ms: 2.5 });
    for (const event of passes(inputs.events)) expect((event as { ms: number }).ms).toBeGreaterThanOrEqual(0);
  });

  it("U31 causes no render, forced update or remount of its own", () => {
    const run = (attached: boolean) => {
      const steam = makeSteam();
      if (attached) attach(makeInputs(steam).options);
      const game = steam.open(steam.game({ installed: true, inCollection: true }));
      for (let i = 0; i < 5; i++) steam.forceUpdate(game);
      for (let i = 0; i < 5; i++) steam.forceUpdate(steam.bodyOf(game));
      steam.close(steam.submenu(firstGroup(steam.listOf(game)).props.children));
      steam.close(game);
      return { ...steam.counters };
    };
    expect(run(true)).toEqual(run(false));
  });

  it("U32 keeps nothing of closed menus alive, attached or detached", async () => {
    const steam = makeSteam();
    const seen: string[] = [];
    const handle = attach({
      menuClass: steam.GameMenu,
      isGameMenuList: (candidate) => steam.isGameList(candidate),
      entriesFor: () => pluginEntries(),
      removeOwnEntries: removePlugin,
      makeSeparator: separator,
      onEvent: (event) => { seen.push(event.type); },
    });
    const attached = closedMenus(steam);
    await collectGarbage();
    expect(attached.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
    handle.uninstall();
    const detached = closedMenus(steam);
    await collectGarbage();
    expect(detached.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
    expect(seen.filter((type) => PASS_TYPES.has(type))).toHaveLength(20);
  });

  it("U33 keeps one block when the menu body mounts again inside an open menu with a fresh list", () => {
    const others = [item("other-a"), otherFragment("other-b")];
    const { steam, inputs } = setup({}, { others });
    let renders = 0;
    const game = steam.open(steam.game({ installed: true, menuType: () => (renders++ ? steam.Menu : steam.OtherMenu) }));
    const first = steam.listOf(game);
    expect(steam.menuOf(game).type).toBe(steam.OtherMenu);
    expectBlock(steam.bodyOf(game).child!.stateNode.rendered, inputs.last(), steam.built(first).properties);
    expect(types(passes(inputs.events))).toEqual(["placed"]);
    for (const step of ["mounted again", "updated"]) {
      const start = inputs.events.length;
      steam.forceUpdate(game);
      const rendered = steam.renderedOf(game);
      expect(steam.menuOf(game).type).toBe(steam.Menu);
      expect(steam.listOf(game)).not.toBe(first);
      expect(steam.counters.bodyNew).toBe(2);
      expectRendered(steam, inputs, game);
      expect(others.map((entry) => rendered.filter((value) => value === entry).length)).toEqual([1, 1]);
      expect(types(inputs.events.slice(start)), step).toEqual(["placed"]);
    }
  });
});
