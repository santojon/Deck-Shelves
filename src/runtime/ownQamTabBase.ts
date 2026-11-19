import type { ReactNode } from "react";
import { logError, logInfo, logWarn } from "./logger";

const ERROR_LINE_LIMIT = 3;

export type AnyFn = (...args: any[]) => any;
export type Entry = Record<string | symbol, unknown> & { key: number };
export type TabList = unknown[];

export type Fiber = {
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
export type GuardRecord = { n: number; p: number; d: string; o: number; k: number };

type Phase = "waiting" | "quiet" | "paused" | "starting" | "working" | "stopped";

export type Badge = {
  readonly since: number;
  readonly stepDown: () => void;
  readonly unwrap: (fn: unknown) => AnyFn | undefined;
  readonly wrapperOf: (fn: AnyFn) => AnyFn | undefined;
  readonly adopt: (older: Badge) => void;
};

export type Resolved = {
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

export type Installation = {
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

export function hostWindow(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

export function now(): number {
  return Date.now();
}

// A clock that never steps back, shared by every copy in the shared context.
export function monotonic(): number {
  try {
    const p = (globalThis as any).performance;
    if (p && typeof p.now === "function") return p.now();
  } catch {}
  return now();
}

export function reportOnce(inst: Installation, id: string, level: "info" | "warn", message: string, context?: unknown): void {
  if (inst.reported.has(id)) return;
  inst.reported.add(id);
  try {
    if (level === "warn") logWarn("RUNTIME", message, context);
    else logInfo("RUNTIME", message, context);
  } catch {}
}

export function reportError(inst: Installation, where: string, err: unknown): void {
  if (inst.errorLines >= ERROR_LINE_LIMIT) return;
  let text = "unknown error";
  try { text = err instanceof Error ? String(err.message) : String(err); } catch {}
  const id = `error:${where}:${text}`;
  if (inst.reported.has(id)) return;
  inst.reported.add(id);
  inst.errorLines += 1;
  try { logError("RUNTIME", `Quick Access tab: ${where} failed`, text); } catch {}
}

export function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object";
}
