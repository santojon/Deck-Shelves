import type { ReactNode } from "react";
import { steamClient } from "../steam/internals";
import { isObject, monotonic, reportError, reportOnce, type AnyFn, type Badge, type Installation, type Resolved } from "./ownQamTabBase";
import { disarm, emptyRecord } from "./ownQamTabGuard";
import { restoreSteam } from "./ownQamTabRestore";
import { clearTimer, listen } from "./ownQamTabActivation";

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

let current: Installation | null = null;

function stepDown(inst: Installation): void {
  if (!inst.live) return;
  inst.live = false;
  inst.phase = "stopped";
  clearTimer(inst);
  restoreSteam(inst);
  reportOnce(inst, "stepped-down", "info", "Quick Access tab: a newer copy took over");
}

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
