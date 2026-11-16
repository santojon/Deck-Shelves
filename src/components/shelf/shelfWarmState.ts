import type { PlatformAppMeta } from "../../runtime/platform";

export type ShelfWarmEntry = {
  appIds: number[];
  sourceIds: number[] | null;
  items: Map<number, PlatformAppMeta>;
  storeNames: Map<number, string>;
  resolvedTotal: number | undefined;
  ts: number;
};

const WARM_TTL_MS = 30 * 60_000;
const entries = new Map<string, ShelfWarmEntry>();

export function getShelfWarmEntry(shelfId: string): ShelfWarmEntry | null {
  const e = entries.get(shelfId);
  if (!e) return null;
  if (Date.now() - e.ts > WARM_TTL_MS) { entries.delete(shelfId); return null; }
  return e;
}

export function setShelfWarmEntry(shelfId: string, entry: Omit<ShelfWarmEntry, "ts">): void {
  entries.set(shelfId, { ...entry, ts: Date.now() });
}

export function clearShelfWarmEntry(shelfId: string): void {
  entries.delete(shelfId);
}

export function allShelvesWarm(shelfIds: readonly string[]): boolean {
  if (!shelfIds.length) return false;
  return shelfIds.every((id) => getShelfWarmEntry(id) !== null);
}

const resolved = new Set<string>();
const resolvedListeners = new Set<() => void>();

export function markShelfResolved(shelfId: string): void {
  if (resolved.has(shelfId)) return;
  resolved.add(shelfId);
  for (const l of resolvedListeners) { try { l(); } catch {} }
}

export function isShelfResolved(shelfId: string): boolean {
  return resolved.has(shelfId);
}

export function subscribeShelfResolved(cb: () => void): () => void {
  resolvedListeners.add(cb);
  return () => { resolvedListeners.delete(cb); };
}

export function __resetShelfWarmStateForTest(): void {
  entries.clear();
  resolved.clear();
  resolvedListeners.clear();
}
