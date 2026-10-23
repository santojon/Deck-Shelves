/* Shows the games the kept half chooses in Steam's own recent-games row on the gamepad Home.
   A route patch finds the Home component and the Home's render finds the row component; both are
   wrapped in place. RowShell draws the row's output, applies the content on every render and can be
   re-rendered alone. A row mounted before the first install stays Steam's until it mounts again.
   Assumes only the gamepad Home draws these two components. */
import { Component, createElement, isValidElement } from "react";
import { afterPatch } from "./host/decky";

export type RecentsRowContent = {
  appIds: number[];
  title: string;
  largeFirstTile: boolean;
};

export type RecentsRowReport =
  | { kind: "applied" }
  | { kind: "not-found"; detail: string }
  | { kind: "error"; detail: string };

export type RecentsRowHooks = {
  getContent: () => RecentsRowContent | null;
  writeTitle: (scope: any, title: string) => void;
  onTileFocus: (appId: number) => void;
  onReport: (report: RecentsRowReport) => void;
};

export type RecentsRowPatch = {
  requestRender: () => boolean;
  uninstall: () => void;
};

const HOME_PATH = "/library/home";
const MEMO_TYPE = Symbol.for("react.memo");
const HOME_ELEMENT_DEPTH = 4;
// The row sits six levels into the Home's output; the list and the heading two and three into the row's.
const HOME_DEPTH = 10;
const ROW_DEPTH = 8;
const WALK_BUDGET = 120;
const DETAIL_MAX = 120;

const ROUTE_MISS = "Home route element not recognised";
const HOME_UNPATCHED = "Home component could not be wrapped";
const HOME_MISS = "Home rendered without the recents row";
const ROW_UNPATCHED = "Recents row component could not be wrapped";
const ROW_MISS = "Recents row output lacks the tile list or the heading";
const ROW_UNREACHABLE = "Recents row is on screen but cannot be rendered again";

/* `window.__ds_recentsRow`, shared by every copy of this module in one Steam session: `owner` is
   the newest installed copy, which every wrapper and shell defers to; `shells` holds the mounted
   RowShell instances; `slots` records the wrappers of every copy, which the owner's uninstall
   restores; `patched` holds the components whose `type` slot carries a wrapper of any copy, so a
   later copy never stacks a second one. */
const SHARED_KEY = "__ds_recentsRow";

type Render = (output: any) => any;
type Owner = { home: Render; row: Render };
type AnyFn = (...args: any[]) => any;
type SlotPatch = { obj: any; original: unknown; wrapper: unknown; result: any };
type Shared = { owner: Owner | null; shells: Set<{ forceUpdate: () => void }>; patched: WeakSet<object>; slots: SlotPatch[] };
type ListInputs = { from: unknown; games: number[]; relay: AnyFn };

type State = {
  hooks: RecentsRowHooks;
  routerHook: any;
  routePatch: (props: any) => any;
  registered: unknown;
  owner: Owner;
  handle: RecentsRowPatch;
  probes: WeakMap<AnyFn, AnyFn>;
  rowType: unknown;
  unreachable: boolean;
  active: boolean;
  last: ListInputs | null;
};

type Read = { content: RecentsRowContent | null; failed: boolean; error: unknown };
type Edit = { list: any; from: unknown; games: number[]; large: boolean; relay: AnyFn; heading: any; listDone: boolean; budget: number };

let installed: State | null = null;

function shared(create = false): Shared | null {
  const scope = globalThis as any;
  const current = scope[SHARED_KEY];
  if (current && current.shells instanceof Set && current.patched instanceof WeakSet && Array.isArray(current.slots)) return current as Shared;
  if (!create) return null;
  const fresh: Shared = { owner: null, shells: new Set(), patched: new WeakSet(), slots: [] };
  scope[SHARED_KEY] = fresh;
  return fresh;
}

function isActive(state: State): boolean {
  return state.active && shared()?.owner === state.owner;
}

// ── Element shapes ───────────────────────────────────────────────────────────

function isMemo(type: any): boolean {
  return !!type && typeof type === "object" && type.$$typeof === MEMO_TYPE && typeof type.type === "function";
}

// Steam's Home element: a memo component drawn with no props.
function isHomeElement(node: any): boolean {
  return isMemo(node.type) && !("children" in (node.props ?? {}));
}

// The Home draws the row as a memo component with these two switches.
function isRowElement(node: any): boolean {
  const props = node.props ?? {};
  return isMemo(node.type) && typeof props.showBackground === "boolean" && typeof props.autoFocus === "boolean";
}

// The tile list: Steam's list of games, a focus callback and the large-first-tile switch.
function isTileList(node: any): boolean {
  const props = node.props ?? {};
  return Array.isArray(props.games) && typeof props.onItemFocus === "function" && typeof props.showFeaturedItem === "boolean";
}

// The element the kept half writes the title into: its only child is a non-blank string.
function isTextElement(node: any): boolean {
  const text = node.props?.children;
  return typeof text === "string" && text.trim() !== "";
}

function isFunctionComponent(type: any): boolean {
  return typeof type === "function" && !type.prototype?.isReactComponent;
}

function copyElement(node: any, changes: Record<string, unknown>): any {
  return { ...node, props: { ...node.props, ...changes } };
}

// Depth first through `props.children` only, bounded in depth and in nodes visited.
function findElement(root: any, match: (node: any) => boolean, maxDepth: number): any {
  let budget = WALK_BUDGET;
  const visit = (node: any, depth: number): any => {
    budget -= 1;
    if (node == null || typeof node !== "object" || depth > maxDepth || budget < 0) return null;
    if (Array.isArray(node)) return visitItems(node, depth);
    if (!isValidElement(node)) return null;
    return match(node) ? node : visit((node.props as any)?.children, depth + 1);
  };
  const visitItems = (items: any[], depth: number): any => {
    for (const item of items) {
      const hit = visit(item, depth);
      if (hit) return hit;
    }
    return null;
  };
  return visit(root, 0);
}

// ── Hooks and reports ────────────────────────────────────────────────────────

function readContent(state: State): Read {
  try {
    return { content: state.hooks.getContent() ?? null, failed: false, error: null };
  } catch (error) {
    return { content: null, failed: true, error };
  }
}

function wanted(state: State): boolean {
  return readContent(state).content !== null;
}

function report(state: State, value: RecentsRowReport): void {
  if (!isActive(state)) return;
  try { state.hooks.onReport(value); } catch { /* ignored by contract */ }
}

function notFound(detail: string): RecentsRowReport {
  return { kind: "not-found", detail };
}

function failure(error: unknown): RecentsRowReport {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "error", detail: (message || "Unexpected error").slice(0, DETAIL_MAX) };
}

// ── Wrapped slots ────────────────────────────────────────────────────────────

function patchSlot(obj: any, handler: (args: unknown[], output: any) => any): boolean {
  const registry = shared();
  if (!registry) return false;
  if (registry.patched.has(obj)) return true;
  const original = obj.type;
  let result: any;
  try { result = afterPatch(obj, "type", handler); } catch { return false; }
  const wrapper = obj.type;
  if (typeof wrapper !== "function" || wrapper === original) return false;
  registry.slots.push({ obj, original, wrapper, result });
  registry.patched.add(obj);
  return true;
}

// Restores a slot that still holds its wrapper; one under another wrapper, or one that can no
// longer be written, stays as a pass-through.
function restoreSlot(registry: Shared, patch: SlotPatch): void {
  if (patch.obj.type !== patch.wrapper) return;
  try { patch.result?.unpatch?.(); } catch { /* restored below */ }
  try {
    if (patch.obj.type === patch.wrapper) patch.obj.type = patch.original;
  } catch {
    return;
  }
  registry.patched.delete(patch.obj);
}

function homeHandler(_args: unknown[], output: any): any {
  try {
    const owner = shared()?.owner;
    return owner ? owner.home(output) : output;
  } catch {
    return output;
  }
}

// Always the same shell around the row's output, so a mounted row never changes its child's type.
// The output stays in `children`, where other patches' tree searches still reach it.
function rowHandler(_args: unknown[], output: any): any {
  return createElement(RowShell, { children: output });
}

class RowShell extends Component<{ children?: any }> {
  componentDidMount(): void { shared()?.shells.add(this); }

  componentWillUnmount(): void { shared()?.shells.delete(this); }

  render(): any {
    const output = this.props.children ?? null;
    try {
      const owner = shared()?.owner;
      return owner ? owner.row(output) : output;
    } catch {
      return output;
    }
  }
}

function rerender(registry: Shared): void {
  for (const shell of Array.from(registry.shells)) {
    try { shell.forceUpdate(); } catch { /* a shell on its way out */ }
  }
}

// ── Route: find the Home component ───────────────────────────────────────────

function onRoute(state: State, props: any): any {
  if (!isActive(state) || !props || typeof props !== "object") return props;
  try {
    const children = routeChildren(state, props.children);
    return children === props.children ? props : { ...props, children };
  } catch (error) {
    if (wanted(state)) report(state, failure(error));
    return props;
  }
}

function routeChildren(state: State, children: any): any {
  const home = findElement(children, isHomeElement, HOME_ELEMENT_DEPTH);
  if (home) {
    if (!patchSlot(home.type, homeHandler) && wanted(state)) report(state, notFound(HOME_UNPATCHED));
    return children;
  }
  const probed = probeElement(state, children);
  if (probed) return probed;
  if (wanted(state)) report(state, notFound(ROUTE_MISS));
  return children;
}

// A host may hand over its own wrapper around Steam's component: look at what that wrapper draws.
function probeElement(state: State, node: any): any {
  if (!isValidElement(node) || !isFunctionComponent(node.type)) return null;
  const probe = probeFor(state, node.type as AnyFn);
  return probe ? { ...node, type: probe } : null;
}

function probeFor(state: State, type: AnyFn): AnyFn | null {
  const known = state.probes.get(type);
  if (known) return known;
  const holder = { type };
  try { afterPatch(holder, "type", (_args: unknown[], output: any) => onProbe(state, output)); } catch { return null; }
  if (typeof holder.type !== "function" || holder.type === type) return null;
  state.probes.set(type, holder.type);
  return holder.type;
}

function onProbe(state: State, output: any): any {
  if (!isActive(state)) return output;
  const read = readContent(state);
  try {
    const home = findElement(output, isHomeElement, HOME_ELEMENT_DEPTH);
    if (home && patchSlot(home.type, homeHandler)) return output;
    if (read.content) report(state, notFound(home ? HOME_UNPATCHED : ROUTE_MISS));
  } catch (error) {
    if (read.content) report(state, failure(error));
  }
  return output;
}

// ── Home: find the row component ─────────────────────────────────────────────

function onHome(state: State, output: any): any {
  if (!isActive(state)) return output;
  const read = readContent(state);
  try {
    const row = findElement(output, (node) => node.type === state.rowType || isRowElement(node), HOME_DEPTH);
    if (row) noteRow(state, row.type);
    reportHome(state, read, row);
  } catch (error) {
    if (read.content) report(state, failure(error));
  }
  return output;
}

function noteRow(state: State, type: unknown): void {
  state.rowType = type;
  state.unreachable = !patchSlot(type, rowHandler);
}

function reportHome(state: State, read: Read, row: unknown): void {
  if (read.failed) report(state, failure(read.error));
  else if (!read.content) return;
  else if (!row) report(state, notFound(HOME_MISS));
  else if (state.unreachable) report(state, notFound(ROW_UNPATCHED));
}

// ── Row: apply the content ───────────────────────────────────────────────────

function onRow(state: State, output: any): any {
  if (!isActive(state)) return output;
  const read = readContent(state);
  if (read.failed) {
    report(state, failure(read.error));
    return output;
  }
  return read.content ? applyAndReport(state, output, read.content) : output;
}

function applyAndReport(state: State, output: any, content: RecentsRowContent): any {
  let applied: { output: any; scope: any } | null;
  try {
    applied = applyContent(state, output, content);
  } catch (error) {
    report(state, failure(error));
    return output;
  }
  if (!applied) {
    report(state, notFound(ROW_MISS));
    return output;
  }
  try { state.hooks.writeTitle(applied.scope, content.title); } catch { /* the games stay applied */ }
  report(state, { kind: "applied" });
  return applied.output;
}

// Copies every element on the way to what changes; Steam's own objects are never written to.
function applyContent(state: State, output: any, content: RecentsRowContent): { output: any; scope: any } | null {
  const list = findElement(output, isTileList, ROW_DEPTH);
  if (!list) return null;
  const inputs = listInputs(state, list.props.onItemFocus, content.appIds);
  const edit: Edit = {
    list,
    from: list.props.games,
    games: inputs.games,
    large: Boolean(content.largeFirstTile),
    relay: inputs.relay,
    heading: null,
    listDone: false,
    budget: WALK_BUDGET,
  };
  const next = rebuild(output, edit, 0);
  return edit.heading && edit.listDone ? { output: next, scope: edit.heading } : null;
}

// The games stay the same object while the content does, and the relay while Steam's callback does too.
function listInputs(state: State, original: unknown, appIds: number[]): ListInputs {
  const ids = Array.from(new Set(appIds));
  const last = state.last;
  const games = last && sameIds(last.games, ids) ? last.games : ids;
  if (last && last.from === original && last.games === games) return last;
  state.last = { from: original, games, relay: focusRelay(state, original, games) };
  return state.last;
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function rebuild(node: any, edit: Edit, depth: number): any {
  edit.budget -= 1;
  if (node == null || typeof node !== "object" || depth > ROW_DEPTH || edit.budget < 0) return node;
  if (Array.isArray(node)) return rebuildItems(node, edit, depth);
  if (!isValidElement(node)) return node;
  return replaceElement(node, edit) ?? rebuildChildren(node, edit, depth);
}

function replaceElement(node: any, edit: Edit): any {
  if (node === edit.list) {
    edit.listDone = true;
    return copyElement(node, { games: edit.games, showFeaturedItem: edit.large, onItemFocus: edit.relay });
  }
  if (node.props?.games === edit.from) return copyElement(node, { games: edit.games });
  if (edit.heading || !isTextElement(node)) return null;
  edit.heading = copyElement(node, {});
  return edit.heading;
}

function rebuildChildren(node: any, edit: Edit, depth: number): any {
  const children = node.props?.children;
  const next = rebuild(children, edit, depth + 1);
  return next === children ? node : copyElement(node, { children: next });
}

function rebuildItems(items: any[], edit: Edit, depth: number): any[] {
  let copy: any[] | null = null;
  for (let i = 0; i < items.length; i += 1) {
    const next = rebuild(items[i], edit, depth);
    if (next === items[i]) continue;
    copy = copy ?? items.slice();
    copy[i] = next;
  }
  return copy ?? items;
}

// Steam's focus callback runs first; the kept half then learns which of the shown games has focus.
function focusRelay(state: State, original: unknown, games: number[]): AnyFn {
  return function relay(this: unknown, ...args: unknown[]): unknown {
    const result = typeof original === "function" ? original.apply(this, args) : undefined;
    const appId = tileAppId(args[0], games);
    if (appId !== null && isActive(state)) {
      try { state.hooks.onTileFocus(appId); } catch { /* the kept half handles its own errors */ }
    }
    return result;
  };
}

// Not observed yet: the list may pass an app id, an object carrying an app overview's `appid`, or
// a position in the list. A number that is one of the games is read as an app id.
function tileAppId(value: unknown, games: number[]): number | null {
  const id = typeof value === "number" ? value : (value as any)?.appid;
  if (typeof id !== "number") return null;
  if (games.includes(id)) return id;
  const index = typeof value === "number" && Number.isInteger(value) ? value : -1;
  return index >= 0 && index < games.length ? games[index] : null;
}

// ── Handle ───────────────────────────────────────────────────────────────────

function requestRender(state: State): boolean {
  if (!isActive(state)) return false;
  const registry = shared();
  if (registry && registry.shells.size > 0) {
    rerender(registry);
    return true;
  }
  if (state.unreachable && wanted(state)) report(state, notFound(ROW_UNREACHABLE));
  return false;
}

function uninstall(state: State): void {
  if (!state.active) return;
  state.active = false;
  state.last = null;
  if (installed === state) installed = null;
  try { state.routerHook.removePatch(HOME_PATH, state.registered); } catch { /* host already gone */ }
  // A superseded copy leaves every wrapper to the owner, whose uninstall restores them all.
  const registry = shared();
  if (!registry || registry.owner !== state.owner) return;
  for (const patch of registry.slots.splice(0)) restoreSlot(registry, patch);
  registry.owner = null;
  rerender(registry);
}

// ── Install ──────────────────────────────────────────────────────────────────

function hasRoutePatches(routerHook: any): boolean {
  return !!routerHook && typeof routerHook.addPatch === "function" && typeof routerHook.removePatch === "function";
}

function isComplete(hooks: Partial<RecentsRowHooks> | null | undefined): hooks is RecentsRowHooks {
  if (!hooks) return false;
  const { getContent, writeTitle, onTileFocus, onReport } = hooks;
  return [getContent, writeTitle, onTileFocus, onReport].every((hook) => typeof hook === "function");
}

// The host's helper must wrap a plain function slot; without it nothing here can work.
function canWrap(): boolean {
  const holder = { type: function slot() { return null; } };
  const original = holder.type;
  try {
    const result: any = afterPatch(holder, "type", (_args: unknown[], output: unknown) => output);
    const wrapped = typeof holder.type === "function" && holder.type !== original;
    try { result?.unpatch?.(); } catch { /* the holder is dropped anyway */ }
    return wrapped;
  } catch {
    return false;
  }
}

function createState(routerHook: any, hooks: RecentsRowHooks): State {
  const state = { hooks, routerHook, probes: new WeakMap(), rowType: null, unreachable: false, active: true, last: null } as unknown as State;
  state.owner = { home: (output) => onHome(state, output), row: (output) => onRow(state, output) };
  state.routePatch = (props) => onRoute(state, props);
  state.registered = state.routePatch;
  state.handle = { requestRender: () => requestRender(state), uninstall: () => uninstall(state) };
  return state;
}

function addRoutePatch(state: State): boolean {
  try {
    const added = state.routerHook.addPatch(HOME_PATH, state.routePatch);
    state.registered = typeof added === "function" ? added : state.routePatch;
    return true;
  } catch {
    try { state.routerHook.removePatch(HOME_PATH, state.routePatch); } catch { /* nothing registered */ }
    return false;
  }
}

function install(routerHook: any, hooks: Partial<RecentsRowHooks> | null | undefined): RecentsRowPatch | null {
  if (!hasRoutePatches(routerHook) || !isComplete(hooks) || !canWrap()) return null;
  const created = shared() === null;
  const registry = shared(true)!;
  const state = createState(routerHook, hooks);
  if (!addRoutePatch(state)) {
    if (created) delete (globalThis as any)[SHARED_KEY];
    return null;
  }
  installed = state;
  registry.owner = state.owner;
  // A row already on screen from an earlier copy draws again through this one.
  rerender(registry);
  return state.handle;
}

export function installRecentsRowPatch(routerHook: any, hooks?: Partial<RecentsRowHooks> | null): RecentsRowPatch | null {
  if (installed) return installed.handle;
  try {
    return install(routerHook, hooks);
  } catch {
    return null;
  }
}
