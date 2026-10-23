import { createElement, Fragment, type ReactNode } from "react";
import { findModule } from "./host/decky";
import { steamClient, steamReact, steamUIStore } from "../steam/internals";
import { logError, logInfo, logWarn } from "./logger";

/* Role options are optional; left out, each takes the plugin's value: yield to the neutral
   host's tab, no marker fields, this component's own key, no first-draw report, and the
   plugin's guard key. */
export type OwnQamTabOptions = {
  title: string;
  icon: ReactNode;
  renderPanel: () => ReactNode;
  isEnabled: () => boolean;
  subscribe: (listener: () => void) => () => void;
  yieldToHostTab?: boolean;
  markerFields?: Readonly<Record<string, unknown>>;
  key?: number;
  onFirstDraw?: () => void;
  guardKey?: string;
};

const DEFAULT_KEY = 4127;
const DEFAULT_GUARD_KEY = "deck-shelves:own-tab-guard";
const QUICK_ACCESS_LOCATION = "quick-access-menu";

// The plugin loader's tab key, and the neutral host's, which only the host's own entry may use.
const LOADER_TAB_KEY = 999;
const HOST_TAB_KEY = 900;

const FAILURE_LIMIT = 2;
const PAUSE_HOURS = 12;
const PAUSE_EXPIRY_MS = PAUSE_HOURS * 60 * 60 * 1000;

const FIRST_IDLE_TIMEOUT_MS = 2000;
const FIRST_TIMER_MS = 1000;
const RETRY_GAP_MS = 1600;
const START_WINDOW_MS = 30000;
const MAX_ATTEMPTS = 20;

const NODE_SCAN_LIMIT = 300;
const TREE_VISIT_LIMIT = 40000;
const CLIMB_LIMIT = 16;
const LIST_SEARCH_LIMIT = 128;
const OUTPUT_VISIT_LIMIT = 300;
const OUTPUT_DEPTH_LIMIT = 16;
const LIST_REF_LIMIT = 16;
const ERROR_LINE_LIMIT = 3;
const SHOW_ELEMENT = 1;

// Fields of Steam's own entries; a marker field with one of these names is left out.
const STEAM_ENTRY_FIELDS = new Set([
  "key", "tab", "title", "strTitle", "panel", "vrPopupSize", "vrLocation", "className", "eFeature", "allowInKioskMode",
]);

const MEMO_TYPE = Symbol.for("react.memo");
const PORTAL_TYPE = Symbol.for("react.portal");

type AnyFn = (...args: any[]) => any;
type Entry = Record<string | symbol, unknown> & { key: number };
type TabList = unknown[];

type Fiber = {
  tag?: number;
  type?: any;
  elementType?: any;
  return?: Fiber | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  alternate?: Fiber | null;
  memoizedProps?: any;
  stateNode?: any;
};

// n: failures in a row; p: when the pause began; d: the session drawing an unconfirmed list;
// o: the activation went off while paused; k: the count a completed draw cleared this session.
type GuardRecord = { n: number; p: number; d: string; o: number; k: number };

type SessionMarker = { sid: string };

type Phase = "waiting" | "quiet" | "paused" | "starting" | "working" | "stopped";

// What an entry tells other copies of the same role: when its copy was installed, how to ask
// that copy to take its changes out of Steam, what one of its wrappers wraps and which wrapper
// it made for a function, and how to hand an older copy's wrappers over to it.
type Badge = {
  readonly since: number;
  readonly stepDown: () => void;
  readonly unwrap: (fn: unknown) => AnyFn | undefined;
  readonly wrapperOf: (fn: AnyFn) => AnyFn | undefined;
  readonly adopt: (older: Badge) => void;
};

type Resolved = {
  title: string;
  icon: ReactNode;
  renderPanel: () => ReactNode;
  isEnabled: () => boolean;
  subscribe: (listener: () => void) => () => void;
  yieldToHostTab: boolean;
  markerFields: Readonly<Record<string, unknown>>;
  key: number;
  onFirstDraw: (() => void) | null;
  guardKey: string;
};

type Installation = {
  o: Resolved;
  badge: Badge;
  roleMark: symbol;
  markerName: string;
  live: boolean;
  removed: boolean;
  known: boolean;
  active: boolean;
  phase: Phase;
  unsubscribe: (() => void) | null;
  timer: { idle: boolean; id: unknown } | null;
  startedAt: number;
  attempts: number;
  perfKey: number | null;
  entry: Entry | null;
  tabElement: ReactNode;
  titleElement: ReactNode;
  canConfirm: boolean;
  panelFailed: boolean;
  undo: Array<() => void>;
  inner: WeakMap<AnyFn, AnyFn>;
  hostWraps: WeakMap<AnyFn, AnyFn>;
  rootWraps: WeakMap<AnyFn, AnyFn>;
  hosts: Array<WeakRef<Fiber>>;
  adopted: Badge[];
  superseded: boolean;
  lists: Array<WeakRef<TabList>>;
  armed: boolean;
  marksMounted: number;
  firstDrawDone: boolean;
  record: GuardRecord;
  reported: Set<string>;
  errorLines: number;
};

type Located = {
  pairs: Array<{ host: Fiber; root: Fiber }>;
  memos: object[];
  perfKey: number;
  keyNamed: boolean;
};

let current: Installation | null = null;

// ---- globals of the shared context ----

function hostWindow(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

function now(): number {
  return Date.now();
}

// A clock that never steps back, shared by every copy in the shared context.
function monotonic(): number {
  try {
    const p = (globalThis as any).performance;
    if (p && typeof p.now === "function") return p.now();
  } catch {}
  return now();
}

function ownerStampSet(): boolean {
  const stamp = (hostWindow() as Window).__SHELVES_QAM_OWNER__ as unknown;
  return typeof stamp === "string" && stamp.length > 0;
}

function readMarker(inst: Installation): SessionMarker | null {
  try {
    const m = hostWindow()[inst.markerName];
    return isObject(m) && typeof m.sid === "string" ? (m as SessionMarker) : null;
  } catch {
    return null;
  }
}

function ensureMarker(inst: Installation): SessionMarker {
  const existing = readMarker(inst);
  if (existing) return existing;
  const created: SessionMarker = { sid: `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` };
  try {
    Object.defineProperty(hostWindow(), inst.markerName, { value: created, configurable: true, writable: true });
  } catch {}
  return created;
}

// ---- reports ----

function reportOnce(inst: Installation, id: string, level: "info" | "warn", message: string, context?: unknown): void {
  if (inst.reported.has(id)) return;
  inst.reported.add(id);
  try {
    if (level === "warn") logWarn("RUNTIME", message, context);
    else logInfo("RUNTIME", message, context);
  } catch {}
}

function reportError(inst: Installation, where: string, err: unknown): void {
  if (inst.errorLines >= ERROR_LINE_LIMIT) return;
  let text = "unknown error";
  try { text = err instanceof Error ? String(err.message) : String(err); } catch {}
  const id = `error:${where}:${text}`;
  if (inst.reported.has(id)) return;
  inst.reported.add(id);
  inst.errorLines += 1;
  try { logError("RUNTIME", `Quick Access tab: ${where} failed`, text); } catch {}
}

// ---- crash guard ----

function storage(): Storage | null {
  try {
    return ((globalThis as any).localStorage as Storage | undefined) ?? null;
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function emptyRecord(): GuardRecord {
  return { n: 0, p: 0, d: "", o: 0, k: 0 };
}

function readRecord(key: string): GuardRecord {
  try {
    const raw = storage()?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return emptyRecord();
    const d = typeof parsed.d === "string" ? parsed.d : "";
    return { n: num(parsed.n), p: num(parsed.p), d, o: num(parsed.o), k: num(parsed.k) };
  } catch {
    return emptyRecord();
  }
}

function saveRecord(key: string, record: GuardRecord): void {
  try { storage()?.setItem(key, JSON.stringify(record)); } catch {}
}

function writeRecord(inst: Installation): void {
  saveRecord(inst.o.guardKey, inst.record);
}

function endPause(record: GuardRecord): void {
  record.n = FAILURE_LIMIT - 1;
  record.p = 0;
  record.o = 0;
  record.k = 0;
}

// A clock set back before the pause began also ends it.
function pauseEnds(record: GuardRecord, on: boolean): boolean {
  const age = now() - record.p;
  return age < 0 || age >= PAUSE_EXPIRY_MS || (on && record.o > 0);
}

// Reads the record once the activation is known; true when the component stays paused. A
// session whose last draw failed continues the count its completed draws had cleared.
function evaluateGuard(inst: Installation, on: boolean): boolean {
  const record = readRecord(inst.o.guardKey);
  const sid = ensureMarker(inst).sid;
  if (record.d && record.d !== sid) record.n = Math.max(record.n, record.k) + 1;
  record.d = "";
  record.k = 0;
  if (record.n >= FAILURE_LIMIT && !record.p) record.p = now();
  const paused = record.n >= FAILURE_LIMIT && !pauseEnds(record, on);
  if (!paused && record.n >= FAILURE_LIMIT) endPause(record);
  if (paused && !on) record.o = 1;
  inst.record = record;
  writeRecord(inst);
  return paused;
}

// Notes that this session is drawing the entry; false when the session cannot be told apart.
function arm(inst: Installation): boolean {
  const marker = readMarker(inst);
  if (!marker) return false;
  if (inst.record.d !== marker.sid) {
    inst.record.d = marker.sid;
    writeRecord(inst);
  }
  inst.armed = true;
  return true;
}

// A stop during a draw, or before its confirmation, takes back this session's mark.
function disarm(inst: Installation): void {
  if (!inst.armed) return;
  inst.armed = false;
  const sid = readMarker(inst)?.sid;
  const stored = readRecord(inst.o.guardKey);
  if (!sid || stored.d !== sid) return;
  stored.d = "";
  saveRecord(inst.o.guardKey, stored);
}

function settleDraw(inst: Installation): void {
  inst.armed = false;
  const r = inst.record;
  if (r.n || r.d) {
    if (r.n) r.k = r.n;
    r.n = 0;
    r.d = "";
    writeRecord(inst);
  }
  if (inst.firstDrawDone) return;
  inst.firstDrawDone = true;
  reportOnce(inst, "first-draw", "info", "Quick Access tab: first draw completed");
  if (!inst.o.onFirstDraw) return;
  try { inst.o.onFirstDraw(); } catch (err) { reportError(inst, "first draw report", err); }
}

// Runs after the commit: a failed draw has unmounted the tab mark by then.
function confirmDraw(inst: Installation): void {
  if (!inst.live || inst.marksMounted === 0) return;
  try { settleDraw(inst); } catch (err) { reportError(inst, "draw record", err); }
}

// Every render that draws the entry is watched: a later draw can fail as well.
function watchDraw(inst: Installation, lists: TabList[]): void {
  if (!lists.length || !inst.canConfirm || !arm(inst)) return;
  queueMicrotask(() => confirmDraw(inst));
}

// ---- the entry ----

function makeTabMark(inst: Installation): AnyFn {
  const steam = steamReact();
  const layout: AnyFn | null = steam && typeof steam.useLayoutEffect === "function" ? steam.useLayoutEffect : null;
  inst.canConfirm = !!layout;
  const track = () => {
    inst.marksMounted += 1;
    return () => { inst.marksMounted = Math.max(0, inst.marksMounted - 1); };
  };
  return function TabMark(): ReactNode {
    if (layout) layout(track, []);
    return inst.o.icon;
  };
}

function buildEntry(inst: Installation, panel: ReactNode): Entry {
  const entry: Entry = {
    key: inst.o.key,
    tab: inst.tabElement,
    title: inst.titleElement,
    strTitle: inst.o.title,
    panel,
    vrLocation: QUICK_ACCESS_LOCATION,
  };
  for (const name of Object.keys(inst.o.markerFields)) {
    if (!STEAM_ENTRY_FIELDS.has(name)) entry[name] = inst.o.markerFields[name];
  }
  Object.defineProperty(entry, inst.roleMark, { value: inst.badge });
  return entry;
}

function ensureEntry(inst: Installation): Entry | null {
  if (inst.entry || inst.panelFailed) return inst.entry;
  try {
    inst.entry = buildEntry(inst, inst.o.renderPanel());
  } catch (err) {
    inst.panelFailed = true;
    reportError(inst, "building the entry", err);
  }
  return inst.entry;
}

// ---- one tab list ----

function isRoleEntry(inst: Installation, e: unknown): boolean {
  return !!e && typeof e === "object" && (e as any)[inst.roleMark] !== undefined;
}

function hostTabShown(others: TabList): boolean {
  if (ownerStampSet()) return true;
  return others.some((e) => !!e && typeof e === "object" && !!(e as any).__shelvesTab);
}

function isDue(inst: Installation, others: TabList): boolean {
  if (inst.phase !== "working" || !inst.active || inst.panelFailed) return false;
  if (inst.o.yieldToHostTab && hostTabShown(others)) {
    reportOnce(inst, "yield", "info", "Quick Access tab: the neutral host shows its tab; stepping aside");
    return false;
  }
  return true;
}

function newerCopy(inst: Installation, list: TabList): Badge | null {
  for (const e of list) {
    const b = badgeOf(inst, e);
    if (b && b.since > inst.badge.since) return b;
  }
  return null;
}

// Once a newer copy of this role drew its entry, this copy hands its wrappers over to it and
// steps down after the render.
function supersededBy(inst: Installation, list: TabList): boolean {
  if (inst.superseded) return true;
  const newer = newerCopy(inst, list);
  if (!newer) return false;
  inst.superseded = true;
  for (const b of [inst.badge, ...inst.adopted]) newer.adopt(b);
  queueMicrotask(() => inst.badge.stepDown());
  return true;
}

// Steam's root has already picked the tab it shows from a list that holds the entry: this render
// keeps the list, and the entry leaves before the root renders at the next opening.
function heldBack(inst: Installation, list: TabList, others: TabList): TabList {
  return inst.entry && list.includes(inst.entry) ? list : others;
}

function desiredList(inst: Installation, list: TabList): TabList {
  if (supersededBy(inst, list)) return list.filter((e) => e !== inst.entry);
  const others = list.filter((e) => !isRoleEntry(inst, e));
  if (!isDue(inst, others)) return heldBack(inst, list, others);
  const entry = ensureEntry(inst);
  if (!entry) return others;
  if (others.some((e) => (e as Entry).key === entry.key)) {
    reportOnce(inst, "key-taken", "warn", "Quick Access tab: another tab uses this key", entry.key);
    return others;
  }
  const perf = others.findIndex((e) => (e as Entry).key === inst.perfKey);
  const out = others.slice();
  out.splice(perf < 0 ? out.length : perf + 1, 0, entry);
  return out;
}

function sameItems(a: TabList, b: TabList): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function rememberList(inst: Installation, list: TabList): void {
  inst.lists = inst.lists.filter((ref) => {
    const l = ref.deref();
    return !!l && l !== list;
  });
  inst.lists.push(new WeakRef(list));
  if (inst.lists.length > LIST_REF_LIMIT) inst.lists.shift();
}

// Brings one list to what is due; true when it holds the entry afterwards.
function reconcileList(inst: Installation, list: TabList): boolean {
  const desired = desiredList(inst, list);
  const holds = !!inst.entry && desired.includes(inst.entry);
  if (!sameItems(list, desired)) {
    const before = list.slice();
    try {
      list.splice(0, list.length, ...desired);
    } catch (err) {
      try { list.splice(0, list.length, ...before); } catch {}
      throw err;
    }
  }
  if (holds) rememberList(inst, list);
  return holds;
}

function removeOwnEntries(inst: Installation): void {
  for (const ref of inst.lists) {
    const list = ref.deref();
    if (!list) continue;
    try {
      const kept = list.filter((e) => e !== inst.entry);
      if (kept.length !== list.length) list.splice(0, list.length, ...kept);
    } catch {}
  }
  inst.lists = [];
}

// ---- walking rendered output ----

function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object";
}

function isMemo(v: unknown): boolean {
  return isObject(v) && v.$$typeof === MEMO_TYPE;
}

function isTabList(v: unknown): v is TabList {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every((e) => isObject(e) && typeof e.key === "number" && "panel" in e);
}

function isRootProps(p: unknown): boolean {
  return isObject(p) && "showHeaderAndFooter" in p && "onFocusNavActivated" in p && "onFocusNavDeactivated" in p;
}

function isElementLike(v: unknown): v is Record<string, any> {
  return isObject(v) && typeof v.$$typeof === "symbol";
}

function childValues(node: Record<string, any>): unknown[] {
  if (node.$$typeof === PORTAL_TYPE) return [node.children];
  const props = node.props;
  return isObject(props) ? Object.values(props) : [];
}

function pushValues(stack: Array<[unknown, number]>, values: unknown[], depth: number): void {
  for (let i = 0; i < values.length && stack.length < OUTPUT_VISIT_LIMIT; i++) {
    if (isObject(values[i])) stack.push([values[i], depth]);
  }
}

// Visits element-like nodes of a render result; every node taken counts toward the limit.
function walkOutput(out: unknown, visit: (node: Record<string, any>) => boolean): void {
  const stack: Array<[unknown, number]> = [[out, 0]];
  for (let visited = 0; stack.length && visited < OUTPUT_VISIT_LIMIT; visited++) {
    const [node, depth] = stack.pop()!;
    if (depth > OUTPUT_DEPTH_LIMIT) continue;
    if (Array.isArray(node)) {
      if (!isTabList(node)) pushValues(stack, node, depth + 1);
    } else if (isElementLike(node) && !visit(node)) {
      pushValues(stack, childValues(node), depth + 1);
    }
  }
}

function listsIn(out: unknown): TabList[] {
  const lists: TabList[] = [];
  walkOutput(out, (node) => {
    const props = node.props;
    if (!isObject(props)) return false;
    for (const v of Object.values(props)) if (isTabList(v) && !lists.includes(v)) lists.push(v);
    return false;
  });
  return lists;
}

function rootElementsIn(out: unknown): Array<Record<string, any>> {
  const found: Array<Record<string, any>> = [];
  walkOutput(out, (node) => {
    if (!isRootProps(node.props)) return false;
    found.push(node);
    return true;
  });
  return found;
}

// ---- wrappers placed in Steam's panel ----

function isPlainFunction(t: unknown): t is AnyFn {
  return typeof t === "function" && !(t.prototype && t.prototype.isReactComponent);
}

function adaptRootOutput(inst: Installation, out: unknown): void {
  try {
    const holding: TabList[] = [];
    for (const list of listsIn(out)) if (reconcileList(inst, list)) holding.push(list);
    if (holding.length) watchDraw(inst, holding);
  } catch (err) {
    reportError(inst, "tab list", err);
  }
}

function hostEntryIn(inst: Installation, list: TabList): boolean {
  return list.some((e) => isObject(e) && !!e.__shelvesTab && !isRoleEntry(inst, e));
}

// Runs before the root renders: once the neutral host's tab shows, the entry leaves the lists
// first, so that the root picks the tab it shows from lists without it.
function clearBeforeRoot(inst: Installation): void {
  if (!inst.o.yieldToHostTab || !inst.lists.length) return;
  const held = inst.lists.map((ref) => ref.deref()).filter((l): l is TabList => !!l);
  if (ownerStampSet() || held.some((l) => hostEntryIn(inst, l))) removeOwnEntries(inst);
}

function adaptHostOutput(inst: Installation, out: unknown): void {
  try {
    for (const el of rootElementsIn(out)) {
      const t = el.type;
      if (!isPlainFunction(t) || Object.isFrozen(el)) continue;
      const wrapped = rootWrap(inst, t);
      if (wrapped !== t) el.type = wrapped;
    }
  } catch (err) {
    reportError(inst, "panel host", err);
  }
  try { clearBeforeRoot(inst); } catch (err) { reportError(inst, "tab list", err); }
}

// One wrapper per function found; a function that is already this installation's stays as it is.
function wrapperFor(
  inst: Installation,
  made: WeakMap<AnyFn, AnyFn>,
  found: AnyFn,
  adapt: (inst: Installation, out: unknown) => void,
): AnyFn {
  if (inst.inner.has(found)) return found;
  const known = madeFor(inst, made, found);
  if (known) return known;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const out = found.apply(this, args);
    if (inst.live) adapt(inst, out);
    return out;
  };
  made.set(found, wrapped);
  inst.inner.set(wrapped, found);
  return wrapped;
}

// The wrapper already made for a function, directly or around the wrappers that older copies
// handed over, so that a hand-over does not change the types Steam renders.
function madeFor(inst: Installation, made: WeakMap<AnyFn, AnyFn>, found: AnyFn): AnyFn | undefined {
  let v: AnyFn | undefined = found;
  for (let hops = 0; v && hops < LIST_REF_LIMIT; hops++) {
    const known = made.get(v);
    if (known) return known;
    let next: AnyFn | undefined;
    for (const b of inst.adopted) next ??= b.wrapperOf(v);
    v = next;
  }
  return undefined;
}

// A value as it was before the copies that handed their wrappers over to this one.
function seeThrough<T>(inst: Installation, value: T): T {
  let v: unknown = value;
  for (let hops = 0; hops < LIST_REF_LIMIT; hops++) {
    let next: AnyFn | undefined;
    for (const b of inst.adopted) next ??= b.unwrap(v);
    if (!next) break;
    v = next;
  }
  return v as T;
}

function rootWrap(inst: Installation, found: AnyFn): AnyFn {
  return wrapperFor(inst, inst.rootWraps, found, adaptRootOutput);
}

function hostWrap(inst: Installation, found: AnyFn): AnyFn {
  return wrapperFor(inst, inst.hostWraps, found, adaptHostOutput);
}

function setFiberType(fiber: Fiber, type: AnyFn, elementType?: unknown): void {
  for (const f of [fiber, fiber.alternate]) {
    if (!f) continue;
    f.type = type;
    if (elementType !== undefined) f.elementType = elementType;
  }
}

function hookMemo(inst: Installation, memo: Record<string, any>): void {
  const inner = memo.type;
  if (!isPlainFunction(inner) || inst.inner.has(inner)) return;
  const wrapped = hostWrap(inst, inner);
  memo.type = wrapped;
  inst.undo.push(() => { if (memo.type === wrapped) memo.type = seeThrough(inst, inner); });
}

function hookHostFiber(inst: Installation, fiber: Fiber): boolean {
  const target = typeof fiber.type === "function" ? fiber : fiber.child;
  if (!target || !isPlainFunction(target.type)) return false;
  const prev = target.type;
  const wrapped = hostWrap(inst, prev);
  if (wrapped === prev) return true;
  setFiberType(target, wrapped);
  const ref = new WeakRef(target);
  inst.hosts.push(ref);
  inst.undo.push(() => {
    const f = ref.deref();
    if (f && f.type === wrapped) setFiberType(f, seeThrough(inst, prev));
  });
  return true;
}

function hookRootFiber(inst: Installation, fiber: Fiber): void {
  const prevType = fiber.type;
  const prevElementType = fiber.elementType;
  if (!isPlainFunction(prevType)) return;
  const wrapped = rootWrap(inst, prevType);
  if (isPlainFunction(prevElementType) && prevElementType !== wrapped) inst.rootWraps.set(prevElementType, wrapped);
  setFiberType(fiber, wrapped, wrapped);
  const ref = new WeakRef(fiber);
  inst.undo.push(() => restoreRootFiber(ref.deref(), wrapped, seeThrough(inst, prevType), seeThrough(inst, prevElementType)));
}

// Puts back each field that still holds this wrapper. When only the element type goes back,
// Steam's next render keeps the mounted instance on the function that replaced this one.
function restoreRootFiber(fiber: Fiber | undefined, wrapped: AnyFn, prevType: AnyFn, prevElementType: unknown): void {
  for (const f of fiber ? [fiber, fiber.alternate] : []) {
    if (!f) continue;
    if (f.type === wrapped) f.type = prevType;
    if (f.elementType === wrapped) f.elementType = prevElementType;
  }
}

// ---- locating Steam's panel ----

function mainDocument(): Document | null {
  const doc = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
  return doc && typeof doc.createTreeWalker === "function" ? doc : null;
}

function fiberOf(node: Node): Fiber | null {
  for (const name of Object.keys(node)) {
    if (name.startsWith("__reactFiber$") || name.startsWith("__reactContainer$")) {
      const f = (node as any)[name];
      if (isObject(f)) return f as Fiber;
    }
  }
  return null;
}

// The first node from the body down that carries a React record, among a bounded number.
function firstFiber(doc: Document): Fiber | null {
  const body = doc.body;
  if (!body) return null;
  const walker = doc.createTreeWalker(body, SHOW_ELEMENT);
  let node: Node | null = body;
  for (let i = 0; node && i < NODE_SCAN_LIMIT; i++) {
    const f = fiberOf(node);
    if (f) return f;
    node = walker.nextNode();
  }
  return null;
}

function treeTop(start: Fiber): Fiber {
  let f = start;
  for (let i = 0; i < TREE_VISIT_LIMIT && f.return; i++) f = f.return;
  const live = f.stateNode?.current;
  return isObject(live) ? (live as Fiber) : f;
}

function rootFibers(top: Fiber): Fiber[] {
  const found: Fiber[] = [];
  const stack: Fiber[] = [top];
  let visited = 0;
  while (stack.length && visited < TREE_VISIT_LIMIT) {
    const f = stack.pop()!;
    visited += 1;
    if (isRootProps(f.memoizedProps) && !isMemo(f.elementType)) found.push(f);
    else if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
  return found;
}

function memoAbove(fiber: Fiber): Fiber | null {
  let f = fiber.return;
  for (let i = 0; i < CLIMB_LIMIT && f; i++, f = f.return) {
    if (isMemo(f.elementType)) return f;
  }
  return null;
}

function readExport(mod: Record<string, any>, name: string): unknown {
  try { return mod[name]; } catch { return undefined; }
}

function isKeyTable(v: unknown): v is Record<string, unknown> {
  if (!isObject(v) || Array.isArray(v) || typeof v.$$typeof === "symbol") return false;
  const perf = v.Perf;
  if (typeof perf !== "number") return false;
  const name = v[perf];
  return typeof name === "string" && v[name] === perf;
}

function scanModules(known: Set<object>): { memos: object[]; table: Record<string, unknown> } | null {
  let memos: object[] | null = null;
  let table: Record<string, unknown> | null = null;
  // A module that throws while being read is skipped.
  const visit = (mod: unknown): boolean => {
    try {
      if (!isObject(mod)) return false;
      const values = Object.keys(mod).map((name) => readExport(mod, name));
      if (!memos && values.some((v) => isObject(v) && known.has(v))) memos = values.filter((v): v is object => isMemo(v));
      if (!table) table = (values.find(isKeyTable) as Record<string, unknown> | undefined) ?? null;
      return !!memos && !!table;
    } catch {
      return false;
    }
  };
  try { findModule(visit); } catch {}
  return memos && table ? { memos, table } : null;
}

function locate(inst: Installation): Located | null {
  const doc = mainDocument();
  const start = doc ? firstFiber(doc) : null;
  if (!start) return null;
  const pairs: Array<{ host: Fiber; root: Fiber }> = [];
  for (const root of rootFibers(treeTop(start))) {
    const host = memoAbove(root);
    if (host) pairs.push({ host, root });
  }
  if (!pairs.length) return null;
  const scanned = scanModules(new Set(pairs.map((p) => p.host.elementType as object)));
  if (!scanned) return null;
  const perfKey = scanned.table.Perf as number;
  return { pairs, memos: scanned.memos, perfKey, keyNamed: scanned.table[inst.o.key] !== undefined };
}

// ---- copies of one role ----

function badgeOf(inst: Installation, e: unknown): Badge | null {
  try {
    const b = (e as any)[inst.roleMark];
    return isObject(b) && typeof b.stepDown === "function" && typeof b.since === "number" ? (b as Badge) : null;
  } catch {
    return null;
  }
}

// Visits a bounded number of records below one, breadth first, until the visitor says stop.
function walkBelow(start: Fiber, visit: (f: Fiber) => boolean): void {
  const queue: Fiber[] = start.child ? [start.child] : [];
  for (let i = 0; i < queue.length && i < LIST_SEARCH_LIMIT; i++) {
    const f = queue[i];
    if (visit(f)) return;
    if (f.child) queue.push(f.child);
    if (f.sibling) queue.push(f.sibling);
  }
}

// The list a mounted root last passed down, read from the props of the records below it.
function listBelow(root: Fiber): TabList | null {
  let found: TabList | null = null;
  walkBelow(root, (f) => {
    const props = f.memoizedProps;
    found = isObject(props) ? ((Object.values(props).find(isTabList) as TabList | undefined) ?? null) : null;
    return !!found;
  });
  return found;
}

function otherCopies(inst: Installation, found: Located): Badge[] {
  const badges: Badge[] = [];
  for (const { root } of found.pairs) {
    for (const e of listBelow(root) ?? []) {
      const b = badgeOf(inst, e);
      if (b && b !== inst.badge && !badges.includes(b)) badges.push(b);
    }
  }
  return badges;
}

// A copy of this role whose entry Steam drew steps down for this one, unless it is newer.
function takeOver(inst: Installation, found: Located): boolean {
  const others = otherCopies(inst, found);
  if (others.some((b) => b.since > inst.badge.since)) {
    inst.phase = "stopped";
    reportOnce(inst, "newer-copy", "info", "Quick Access tab: a newer copy shows the tab");
    return false;
  }
  for (const b of others) {
    try { b.stepDown(); } catch (err) { reportError(inst, "handing over", err); }
  }
  return true;
}

function stepDown(inst: Installation): void {
  if (!inst.live) return;
  inst.live = false;
  inst.phase = "stopped";
  clearTimer(inst);
  restoreSteam(inst);
  reportOnce(inst, "stepped-down", "info", "Quick Access tab: a newer copy took over");
}

// ---- start-up ----

function keyProblem(inst: Installation, found: Located): string | null {
  const key = inst.o.key;
  if (found.keyNamed) return "Steam already names this key";
  if (key === LOADER_TAB_KEY || (inst.o.yieldToHostTab && key === HOST_TAB_KEY)) return "this key is another party's";
  return null;
}

function apply(inst: Installation, found: Located): void {
  const problem = keyProblem(inst, found);
  if (problem) {
    inst.phase = "stopped";
    reportOnce(inst, "key", "warn", `Quick Access tab: ${problem}`, inst.o.key);
    return;
  }
  if (!takeOver(inst, found)) return;
  inst.perfKey = found.perfKey;
  prepareElements(inst);
  for (const memo of found.memos) hookMemo(inst, memo as Record<string, any>);
  for (const { host, root } of found.pairs) {
    if (hookHostFiber(inst, host)) hookRootFiber(inst, root);
  }
  inst.phase = "working";
  reportOnce(inst, "installed", "info", "Quick Access tab: installed", inst.o.key);
}

function applyFound(inst: Installation, found: Located): void {
  try {
    apply(inst, found);
  } catch (err) {
    reportError(inst, "start-up", err);
    inst.phase = "stopped";
    restoreSteam(inst);
  }
}

function clearTimer(inst: Installation): void {
  const t = inst.timer;
  inst.timer = null;
  if (!t) return;
  try {
    if (t.idle) (globalThis as any).cancelIdleCallback?.(t.id);
    else clearTimeout(t.id as ReturnType<typeof setTimeout>);
  } catch {}
}

function giveUp(inst: Installation): void {
  inst.phase = "stopped";
  reportOnce(inst, "gave-up", "warn", "Quick Access tab: Steam's panel was not found; no tab until the next start");
}

function attempt(inst: Installation): void {
  inst.timer = null;
  if (!inst.live || inst.phase !== "starting") return;
  if (now() - inst.startedAt > START_WINDOW_MS) return giveUp(inst);
  inst.attempts += 1;
  let found: Located | null = null;
  try { found = locate(inst); } catch (err) { reportError(inst, "locating the panel", err); }
  if (found) return applyFound(inst, found);
  if (inst.attempts >= MAX_ATTEMPTS || now() + RETRY_GAP_MS - inst.startedAt > START_WINDOW_MS) return giveUp(inst);
  inst.timer = { idle: false, id: setTimeout(() => attempt(inst), RETRY_GAP_MS) };
}

function scheduleStart(inst: Installation): void {
  inst.startedAt = now();
  const idle = (globalThis as any).requestIdleCallback;
  if (typeof idle === "function") {
    try {
      inst.timer = { idle: true, id: idle(() => attempt(inst), { timeout: FIRST_IDLE_TIMEOUT_MS }) };
      return;
    } catch {}
  }
  inst.timer = { idle: false, id: setTimeout(() => attempt(inst), FIRST_TIMER_MS) };
}

// ---- activation ----

function readActivation(inst: Installation): boolean | undefined {
  try {
    return inst.o.isEnabled() === true;
  } catch (err) {
    reportError(inst, "activation reader", err);
    return undefined;
  }
}

function begin(inst: Installation, on: boolean): void {
  const paused = evaluateGuard(inst, on);
  if (!on) {
    inst.phase = "quiet";
    return;
  }
  if (paused) {
    inst.phase = "paused";
    reportOnce(inst, "paused", "warn", `Quick Access tab: paused after repeated failures; turn the tab off and on again, or wait ${PAUSE_HOURS} hours`);
    return;
  }
  inst.phase = "starting";
  scheduleStart(inst);
}

function changed(inst: Installation, on: boolean): void {
  // Off before the start-up work ran: nothing in Steam for the rest of this start.
  if (!on && inst.phase === "starting") {
    clearTimer(inst);
    inst.phase = "quiet";
    return;
  }
  // Out of the lists now, so that Steam picks the tab it shows from a list without it.
  if (!on && inst.phase === "working") removeOwnEntries(inst);
  if (inst.phase !== "paused") return;
  if (!on) inst.record.o = 1;
  else if (inst.record.o) endPause(inst.record);
  writeRecord(inst);
}

function onActivation(inst: Installation): void {
  if (!inst.live) return;
  const on = readActivation(inst);
  if (on === undefined) return;
  if (!inst.known) {
    inst.known = true;
    inst.active = on;
    begin(inst, on);
    return;
  }
  if (on === inst.active) return;
  inst.active = on;
  changed(inst, on);
}

// ---- install and uninstall ----

function resolve(options: OwnQamTabOptions): Resolved {
  const guardKey = typeof options.guardKey === "string" && options.guardKey ? options.guardKey : DEFAULT_GUARD_KEY;
  return {
    title: options.title,
    icon: options.icon,
    renderPanel: options.renderPanel,
    isEnabled: options.isEnabled,
    subscribe: options.subscribe,
    yieldToHostTab: options.yieldToHostTab !== false,
    markerFields: isObject(options.markerFields) ? options.markerFields : {},
    key: typeof options.key === "number" && Number.isFinite(options.key) ? options.key : DEFAULT_KEY,
    onFirstDraw: typeof options.onFirstDraw === "function" ? options.onFirstDraw : null,
    guardKey,
  };
}

function create(options: OwnQamTabOptions): Installation {
  const o = resolve(options);
  const inst: Installation = {
    o,
    badge: Object.freeze({
      since: monotonic(),
      stepDown: () => { try { stepDown(inst); } catch {} },
      unwrap: (fn: unknown) => (typeof fn === "function" ? inst.inner.get(fn as AnyFn) : undefined),
      wrapperOf: (fn: AnyFn) => inst.hostWraps.get(fn) ?? inst.rootWraps.get(fn),
      adopt: (older: Badge) => { if (!inst.adopted.includes(older)) inst.adopted.push(older); },
    }),
    roleMark: Symbol.for(`deck-shelves:own-tab-entry:${o.guardKey}`),
    markerName: `__deckShelvesOwnTab:${o.guardKey}`,
    live: true,
    removed: false,
    known: false,
    active: false,
    phase: "waiting",
    unsubscribe: null,
    timer: null,
    startedAt: 0,
    attempts: 0,
    perfKey: null,
    entry: null,
    tabElement: null,
    titleElement: null,
    canConfirm: false,
    panelFailed: false,
    undo: [],
    inner: new WeakMap(),
    hostWraps: new WeakMap(),
    rootWraps: new WeakMap(),
    hosts: [],
    adopted: [],
    superseded: false,
    lists: [],
    armed: false,
    marksMounted: 0,
    firstDrawDone: false,
    record: emptyRecord(),
    reported: new Set(),
    errorLines: 0,
  };
  return inst;
}

// Built outside Steam's renders, so that they hold nothing of a render.
function prepareElements(inst: Installation): void {
  inst.tabElement = createElement(makeTabMark(inst));
  inst.titleElement = createElement(Fragment);
}

// A root that mounted again while installed took this installation's wrapper as its type.
function unwrapFiber(inst: Installation, fiber: Fiber): boolean {
  for (const f of [fiber, fiber.alternate]) {
    if (!f) continue;
    const type = inst.inner.get(f.type);
    if (type) f.type = seeThrough(inst, type);
    const elementType = inst.inner.get(f.elementType);
    if (elementType) f.elementType = seeThrough(inst, elementType);
  }
  return false;
}

function restoreSteam(inst: Installation): void {
  removeOwnEntries(inst);
  for (const undo of inst.undo.splice(0)) {
    try { undo(); } catch {}
  }
  for (const ref of inst.hosts.splice(0)) {
    const host = ref.deref();
    try { if (host) walkBelow(host, (f) => unwrapFiber(inst, f)); } catch {}
  }
}

function uninstall(inst: Installation): void {
  if (inst.removed) return;
  inst.removed = true;
  const wasWorking = inst.phase === "working";
  inst.live = false;
  inst.phase = "stopped";
  clearTimer(inst);
  try { inst.unsubscribe?.(); } catch (err) { reportError(inst, "unsubscribe", err); }
  inst.unsubscribe = null;
  restoreSteam(inst);
  try { disarm(inst); } catch {}
  if (current === inst) current = null;
  if (wasWorking) reportOnce(inst, "uninstalled", "info", "Quick Access tab: removed");
}

function listen(inst: Installation): void {
  try {
    const unsubscribe = inst.o.subscribe(() => {
      try { onActivation(inst); } catch (err) { reportError(inst, "activation", err); }
    });
    if (typeof unsubscribe !== "function") return;
    if (inst.removed) unsubscribe();
    else inst.unsubscribe = unsubscribe;
  } catch (err) {
    reportError(inst, "activation subscription", err);
  }
}

export function installOwnQamTab(options: OwnQamTabOptions): () => void {
  let inst: Installation | null = null;
  const remove = () => {
    try { if (inst) uninstall(inst); } catch {}
  };
  try {
    if (current) uninstall(current);
    inst = create(options);
    current = inst;
    listen(inst);
  } catch {}
  return remove;
}

export function restartSteam(): void {
  try {
    const user = steamClient()?.User;
    if (user && typeof user.StartRestart === "function") user.StartRestart(false);
  } catch {}
}
