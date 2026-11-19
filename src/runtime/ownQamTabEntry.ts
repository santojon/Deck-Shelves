import { createElement, Fragment, type ReactNode } from "react";
import { steamReact } from "../steam/internals";
import { hostWindow, isObject, reportError, reportOnce, type AnyFn, type Badge, type Entry, type Installation, type TabList } from "./ownQamTabBase";
import { watchDraw } from "./ownQamTabGuard";
import { listsIn } from "./ownQamTabDiscovery";

const QUICK_ACCESS_LOCATION = "quick-access-menu";

export const LIST_REF_LIMIT = 16;

// Fields of Steam's own entries; a marker field with one of these names is left out.
const STEAM_ENTRY_FIELDS = new Set([
  "key", "tab", "title", "strTitle", "panel", "vrPopupSize", "vrLocation", "className", "eFeature", "allowInKioskMode",
]);

function ownerStampSet(): boolean {
  const stamp = (hostWindow() as Window).__SHELVES_QAM_OWNER__ as unknown;
  return typeof stamp === "string" && stamp.length > 0;
}

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

// A newer copy drew its entry: hand the wrappers over and step down after the render.
function supersededBy(inst: Installation, list: TabList): boolean {
  if (inst.superseded) return true;
  const newer = newerCopy(inst, list);
  if (!newer) return false;
  inst.superseded = true;
  for (const b of [inst.badge, ...inst.adopted]) newer.adopt(b);
  queueMicrotask(() => inst.badge.stepDown());
  return true;
}

// Steam's root already picked its tab from a list with the entry, so keep it until the next opening.
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

export function removeOwnEntries(inst: Installation): void {
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

export function adaptRootOutput(inst: Installation, out: unknown): void {
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

// Runs before the root renders, so it picks its tab from lists without the entry.
export function clearBeforeRoot(inst: Installation): void {
  if (!inst.o.yieldToHostTab || !inst.lists.length) return;
  const held = inst.lists.map((ref) => ref.deref()).filter((l): l is TabList => !!l);
  if (ownerStampSet() || held.some((l) => hostEntryIn(inst, l))) removeOwnEntries(inst);
}

export function badgeOf(inst: Installation, e: unknown): Badge | null {
  try {
    const b = (e as any)[inst.roleMark];
    return isObject(b) && typeof b.stepDown === "function" && typeof b.since === "number" ? (b as Badge) : null;
  } catch {
    return null;
  }
}

// Built outside Steam's renders, so that they hold nothing of a render.
export function prepareElements(inst: Installation): void {
  inst.tabElement = createElement(makeTabMark(inst));
  inst.titleElement = createElement(Fragment);
}
