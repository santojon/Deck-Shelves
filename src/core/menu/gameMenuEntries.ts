/* Adds the plugin's entries to Steam's game context menu and keeps them there.
   A pass runs on each game menu's first render, on new props for a menu body
   that shows a list a pass accepted, and on a body mounting under a game menu
   with a list no pass has seen. Each pass finds the list with the caller's
   check, removes the plugin's elements and places one block before Properties. */

export type GameMenuListContext = { list: unknown[]; props: unknown };

export type GameMenuEntriesEvent =
  | { type: "installed" } | { type: "install-failed" } | { type: "uninstalled" }
  | { type: "placed"; entries: number; ms: number }
  | { type: "rejected"; ms: number } | { type: "empty"; ms: number } | { type: "failed"; ms: number };

export type GameMenuEntriesOptions = {
  menuClass: unknown;
  isGameMenuList: (candidate: unknown, context: { props: unknown }) => boolean;
  entriesFor: (context: GameMenuListContext) => readonly unknown[] | null | undefined;
  removeOwnEntries: (list: unknown[]) => void;
  makeSeparator?: () => unknown;
  onEvent?: (event: GameMenuEntriesEvent) => void;
};

export type GameMenuEntriesHandle = { uninstall: () => void };

type Sink = ((event: GameMenuEntriesEvent) => void) | null;
type Method = (this: unknown, ...args: unknown[]) => unknown;

type Inputs = {
  menuClass: object;
  isGameMenuList: GameMenuEntriesOptions["isGameMenuList"];
  entriesFor: GameMenuEntriesOptions["entriesFor"];
  removeOwnEntries: GameMenuEntriesOptions["removeOwnEntries"];
  makeSeparator: (() => unknown) | null;
  onEvent: Sink;
};

// A prototype member this module replaced, and what it held before.
type Slot = { owner: object; name: string; before: PropertyDescriptor | undefined; wrapper: Method | null };

type Installation = {
  active: boolean;
  inputs: Inputs;
  handle: GameMenuEntriesHandle;
  slots: Slot[];
  accepted: WeakSet<object>;
  // Lists a pass already offered to the check.
  examined: WeakSet<object>;
  // Body props the update check already saw.
  checked: WeakSet<object>;
};

// A wrapper this module put in a slot, with that slot and its installation.
type Layer = { slot: Slot; inst: Installation };

type Outcome = { type: "placed"; entries: number } | { type: "rejected" | "empty" | "failed" };
type Source = { root: unknown; level: number; props: unknown };
type Search = { list: unknown[] | null; threw: boolean };
type FiberLike = { child?: unknown; return?: unknown; type?: unknown; memoizedProps?: unknown; alternate?: unknown };

// Element levels searched below the observed root; placement reads one level more.
const SEARCH_LEVELS = 5;
const MAX_CHECKS = 16;
const MAX_NODES = 32;
const MAX_FIBER_HOPS = 4;

let installations: WeakMap<object, Installation> | null = null;
let layers: WeakMap<object, Layer> | null = null;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isElement(value: unknown): value is { type?: unknown; key?: unknown; props?: unknown } {
  return isObject(value) && typeof (value as { $$typeof?: unknown }).$$typeof === "symbol";
}

function childrenOf(props: unknown): unknown {
  return isObject(props) ? (props as { children?: unknown }).children : undefined;
}

function hasRender(type: unknown): boolean {
  if (typeof type !== "function") return false;
  const proto: unknown = type.prototype;
  return isObject(proto) && typeof (proto as { render?: unknown }).render === "function";
}

function now(): number {
  try {
    return performance.now();
  } catch {
    return 0;
  }
}

function emit(sink: Sink, event: GameMenuEntriesEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // The sink's own errors are ignored.
  }
}

// ---------------------------------------------------------------- finding the list

function accepts(inst: Installation, candidate: unknown[], context: { props: unknown }): boolean | null {
  try {
    const check = inst.inputs.isGameMenuList;
    return check(candidate, context) === true;
  } catch {
    return null;
  }
}

// Elements lead to their children; arrays lead only to the arrays they hold.
function expand(queue: [unknown, number][], node: unknown, level: number): void {
  if (Array.isArray(node)) {
    const count = Math.min(node.length, MAX_NODES);
    for (let i = 0; i < count && queue.length < MAX_NODES; i++) {
      const item: unknown = node[i];
      if (Array.isArray(item)) queue.push([item, level]);
    }
  } else if (level < SEARCH_LEVELS && isElement(node) && queue.length < MAX_NODES) {
    queue.push([childrenOf(node.props), level + 1]);
  }
}

// Breadth first, so the shallow positions where Steam puts the list come first.
function findList(inst: Installation, source: Source): Search {
  const context = { props: source.props };
  const queue: [unknown, number][] = [[source.root, source.level]];
  let threw = false;
  let checks = 0;
  for (let i = 0; i < queue.length && checks < MAX_CHECKS; i++) {
    const [node, level] = queue[i];
    if (Array.isArray(node)) {
      checks++;
      inst.examined.add(node);
      const answer = accepts(inst, node, context);
      if (answer) return { list: node, threw };
      if (answer === null) threw = true;
    }
    expand(queue, node, level);
  }
  return { list: null, threw };
}

// ---------------------------------------------------------------- placing the block

function isComponentElement(value: unknown, classComponent: boolean): boolean {
  return isElement(value) && typeof value.type === "function" && hasRender(value.type) === classComponent;
}

// Steam's Properties slot: an unkeyed fragment of its separator and one entry.
function isPropertiesSlot(value: unknown): boolean {
  if (!isElement(value) || value.key != null || value.type !== Symbol.for("react.fragment")) return false;
  const pair = childrenOf(value.props);
  return Array.isArray(pair) && pair.length === 2 && isComponentElement(pair[0], false) && isComponentElement(pair[1], true);
}

function propertiesIndex(list: unknown[]): number {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isPropertiesSlot(list[i])) return i;
  }
  return list.length;
}

function blockFor(inputs: Inputs, entries: readonly unknown[]): unknown[] {
  const make = inputs.makeSeparator;
  const separator = make ? make() : null;
  return isObject(separator) ? [separator, ...entries] : [...entries];
}

function place(inst: Installation, list: unknown[], props: unknown): Outcome {
  if (!Object.isExtensible(list)) return { type: "failed" };
  const { entriesFor, removeOwnEntries } = inst.inputs;
  const entries = entriesFor({ list, props });
  if (!Array.isArray(entries) || entries.length === 0) {
    removeOwnEntries(list);
    return { type: "empty" };
  }
  const count = entries.length;
  const block = blockFor(inst.inputs, entries);
  // The provider or the separator maker may have detached this installation.
  if (!inst.active) return { type: "failed" };
  removeOwnEntries(list);
  list.splice(propertiesIndex(list), 0, ...block);
  return { type: "placed", entries: count };
}

// ---------------------------------------------------------------- passes

function passOver(inst: Installation, source: Source): Outcome {
  const search = findList(inst, source);
  if (!search.list) return { type: search.threw ? "failed" : "rejected" };
  inst.accepted.add(search.list);
  return place(inst, search.list, source.props);
}

function runPass(inst: Installation, read: () => Source): void {
  const start = now();
  let outcome: Outcome;
  try {
    outcome = passOver(inst, read());
  } catch {
    outcome = { type: "failed" };
  }
  const ms = Math.max(0, now() - start);
  emit(inst.inputs.onEvent, outcome.type === "placed" ? { type: "placed", entries: outcome.entries, ms } : { type: outcome.type, ms });
}

function propsOf(self: unknown): unknown {
  return isObject(self) ? (self as { props?: unknown }).props : undefined;
}

function observeOutput(inst: Installation, self: unknown, output: unknown): void {
  runPass(inst, () => ({ root: output, level: 0, props: propsOf(self) }));
}

function observeProps(inst: Installation, props: unknown): void {
  runPass(inst, () => ({ root: childrenOf(props), level: 1, props }));
}

function isAccepted(inst: Installation, list: unknown): boolean {
  return isObject(list) && inst.accepted.has(list);
}

// The list a body shows now and the one its next props bring.
function listsOf(self: unknown, next: object): [unknown, unknown] {
  try {
    return [childrenOf(propsOf(self)), childrenOf(next)];
  } catch {
    return [undefined, undefined];
  }
}

// Steam's menu component sits between a game menu and its body.
function isUnderGameMenu(inst: Installation, self: object): boolean {
  let fiber: unknown = (self as { _reactInternals?: unknown })._reactInternals;
  for (let hop = 0; hop < MAX_FIBER_HOPS && isObject(fiber); hop++) {
    fiber = (fiber as FiberLike).return;
    if (isObject(fiber) && (fiber as FiberLike).type === inst.inputs.menuClass) return true;
  }
  return false;
}

// The props of a body mounting under a game menu with a list no pass has seen.
function freshMountProps(inst: Installation, self: unknown): object | null {
  try {
    const props = propsOf(self);
    if (!isObject(props) || !isObject(self)) return null;
    const list = childrenOf(props);
    return isObject(list) && !inst.examined.has(list) && isUnderGameMenu(inst, self) ? props : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- slots

function previousOf(slot: Slot, self: unknown): unknown {
  const before = slot.before;
  if (before) return "value" in before ? before.value : before.get?.call(self);
  const parent: unknown = Object.getPrototypeOf(slot.owner);
  return isObject(parent) ? Reflect.get(parent, slot.name, self) : undefined;
}

function callPrevious(slot: Slot, self: unknown, args: unknown[]): unknown {
  const previous = previousOf(slot, self);
  return typeof previous === "function" ? previous.apply(self, args) : undefined;
}

function replaceSlot(inst: Installation, owner: object, name: string, wrap: (slot: Slot) => Method): void {
  const before = Object.getOwnPropertyDescriptor(owner, name);
  const slot: Slot = { owner, name, before, wrapper: null };
  const wrapper = wrap(slot);
  slot.wrapper = wrapper;
  Object.defineProperty(owner, name, {
    value: wrapper,
    writable: before && "value" in before ? before.writable === true : true,
    enumerable: before ? before.enumerable === true : false,
    configurable: before ? before.configurable === true : true,
  });
  inst.slots.push(slot);
  layers ??= new WeakMap<object, Layer>();
  layers.set(wrapper, { slot, inst });
}

function layerOf(descriptor: PropertyDescriptor | undefined): Layer | undefined {
  return descriptor && "value" in descriptor ? layers?.get(descriptor.value as object) : undefined;
}

// What the slot held before this module, past layers of installations that detached.
function earlierOf(slot: Slot): PropertyDescriptor | undefined {
  let before = slot.before;
  for (let layer = layerOf(before); layer && !layer.inst.active; layer = layerOf(before)) before = layer.slot.before;
  return before;
}

// Puts the earlier value back unless another party replaced the slot since.
function restoreSlot(slot: Slot): void {
  try {
    const current = Object.getOwnPropertyDescriptor(slot.owner, slot.name);
    if (!current || current.value !== slot.wrapper) return;
    const before = earlierOf(slot);
    if (before) Object.defineProperty(slot.owner, slot.name, before);
    else delete (slot.owner as Record<string, unknown>)[slot.name];
  } catch {
    // The wrapper stays in place and does nothing more.
  }
}

function menuRender(inst: Installation): (slot: Slot) => Method {
  return (slot) => function render(this: unknown, ...args: unknown[]): unknown {
    const output = callPrevious(slot, this, args);
    if (inst.active) observeOutput(inst, this, output);
    return output;
  };
}

function menuDidMount(inst: Installation): (slot: Slot) => Method {
  return (slot) => function componentDidMount(this: unknown, ...args: unknown[]): unknown {
    const result = callPrevious(slot, this, args);
    if (inst.active) findBody(inst, this);
    return result;
  };
}

// Bodies of other menus share the class, so only a body that shows an accepted list gets passes.
function bodyUpdateCheck(inst: Installation): (slot: Slot) => Method {
  return (slot) => function shouldComponentUpdate(this: unknown, ...args: unknown[]): unknown {
    const next = args[0];
    if (inst.active && isObject(next)) {
      inst.checked.add(next);
      const [shown] = listsOf(this, next);
      if (isAccepted(inst, shown)) observeProps(inst, next);
    }
    return callPrevious(slot, this, args);
  };
}

// React skips the update check when a forced update brings new props, but still calls this.
function bodyWillUpdate(inst: Installation): (slot: Slot) => Method {
  return (slot) => function UNSAFE_componentWillUpdate(this: unknown, ...args: unknown[]): unknown {
    const next = args[0];
    if (inst.active && isObject(next) && !inst.checked.has(next)) {
      const [shown, fresh] = listsOf(this, next);
      if (fresh !== shown && isAccepted(inst, shown)) observeProps(inst, next);
    }
    return callPrevious(slot, this, args);
  };
}

// A body can mount again inside an open game menu, with a fresh list that only
// its first render sees. The observer runs this render once per body.
function bodyRender(inst: Installation): (slot: Slot) => Method {
  return (slot) => function render(this: unknown, ...args: unknown[]): unknown {
    const props = inst.active ? freshMountProps(inst, this) : null;
    if (props) observeProps(inst, props);
    return callPrevious(slot, this, args);
  };
}

// ---------------------------------------------------------------- the menu body

/* React keeps a mounted instance's fiber in `_reactInternals`. The body is the
   class a few children below the game menu whose children prop is a list this
   installation accepted. */
function bodyClassOf(inst: Installation, fiber: unknown): unknown {
  let node: unknown = isObject(fiber) ? (fiber as FiberLike).child : undefined;
  for (let hop = 0; hop < MAX_FIBER_HOPS && isObject(node); hop++) {
    const { type, memoizedProps, child } = node as FiberLike;
    if (type !== inst.inputs.menuClass && hasRender(type) && isAccepted(inst, childrenOf(memoizedProps))) return type;
    node = child;
  }
  return null;
}

function hookBody(inst: Installation, body: unknown, proto: object): void {
  if (typeof (proto as { shouldComponentUpdate?: unknown }).shouldComponentUpdate === "function") {
    replaceSlot(inst, proto, "shouldComponentUpdate", bodyUpdateCheck(inst));
  }
  // React calls will-update only on classes without the newer lifecycles.
  const derives = typeof (body as { getDerivedStateFromProps?: unknown }).getDerivedStateFromProps === "function";
  if (!derives && typeof (proto as { getSnapshotBeforeUpdate?: unknown }).getSnapshotBeforeUpdate !== "function") {
    replaceSlot(inst, proto, "UNSAFE_componentWillUpdate", bodyWillUpdate(inst));
  }
  replaceSlot(inst, proto, "render", bodyRender(inst));
}

function findBody(inst: Installation, self: unknown): void {
  try {
    const fiber: unknown = isObject(self) ? (self as { _reactInternals?: unknown })._reactInternals : undefined;
    const alternate: unknown = isObject(fiber) ? (fiber as FiberLike).alternate : undefined;
    const body = bodyClassOf(inst, fiber) ?? bodyClassOf(inst, alternate);
    const proto: unknown = body === null ? null : (body as { prototype?: unknown }).prototype;
    if (isObject(proto) && !inst.slots.some((slot) => slot.owner === proto)) hookBody(inst, body, proto);
  } catch {
    // Without the body, later lists of open menus get no block.
  }
}

// ---------------------------------------------------------------- install

function inputsOf(options: GameMenuEntriesOptions, onEvent: Sink): Inputs | null {
  const { menuClass, isGameMenuList, entriesFor, removeOwnEntries, makeSeparator } = options;
  if (!hasRender(menuClass)) return null;
  if (typeof isGameMenuList !== "function" || typeof entriesFor !== "function" || typeof removeOwnEntries !== "function") return null;
  return {
    menuClass: menuClass as object,
    isGameMenuList,
    entriesFor,
    removeOwnEntries,
    makeSeparator: typeof makeSeparator === "function" ? makeSeparator : null,
    onEvent,
  };
}

function restoreAll(inst: Installation): void {
  for (let i = inst.slots.length - 1; i >= 0; i--) restoreSlot(inst.slots[i]);
  inst.slots.length = 0;
}

function uninstall(inst: Installation): void {
  if (!inst.active) return;
  inst.active = false;
  try {
    restoreAll(inst);
    if (installations?.get(inst.inputs.menuClass) === inst) installations.delete(inst.inputs.menuClass);
  } catch {
    // Whatever could not be put back stays inert.
  }
  emit(inst.inputs.onEvent, { type: "uninstalled" });
}

function install(inputs: Inputs): GameMenuEntriesHandle | null {
  const inst: Installation = {
    active: true,
    inputs,
    handle: { uninstall: () => uninstall(inst) },
    slots: [],
    accepted: new WeakSet(),
    examined: new WeakSet(),
    checked: new WeakSet(),
  };
  try {
    const proto = (inputs.menuClass as { prototype: object }).prototype;
    replaceSlot(inst, proto, "render", menuRender(inst));
    replaceSlot(inst, proto, "componentDidMount", menuDidMount(inst));
  } catch {
    inst.active = false;
    restoreAll(inst);
    emit(inputs.onEvent, { type: "install-failed" });
    return null;
  }
  installations ??= new WeakMap<object, Installation>();
  installations.set(inputs.menuClass, inst);
  emit(inputs.onEvent, { type: "installed" });
  return inst.handle;
}

export function installGameMenuEntries(options: GameMenuEntriesOptions): GameMenuEntriesHandle | null {
  let sink: Sink = null;
  try {
    sink = typeof options.onEvent === "function" ? options.onEvent : null;
    const existing = installations?.get(options.menuClass as object);
    if (existing) return existing.handle;
    const inputs = inputsOf(options, sink);
    if (inputs) return install(inputs);
  } catch {
    // Unreadable options fail like invalid ones.
  }
  emit(sink, { type: "install-failed" });
  return null;
}
