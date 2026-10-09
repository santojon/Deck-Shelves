import type { PlatformAppMeta } from "../../runtime/platform";

/* Last resolved state per shelf, kept in module scope so it outlives the
   React subtree: Home unmounts on every route-away (that keeps Steam's nav
   tree honest) and rebuilds on return, and seeding from here lets the
   rebuild paint complete shelves on its first commit instead of re-running
   the resolver + metadata round-trips. Data only — never DOM/fiber/nav refs. */
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

// True when every listed shelf already has warm data — a return to Home
// can then reveal on its first commit instead of waiting to settle.
export function allShelvesWarm(shelfIds: readonly string[]): boolean {
  if (!shelfIds.length) return false;
  return shelfIds.every((id) => getShelfWarmEntry(id) !== null);
}

export function __resetShelfWarmStateForTest(): void {
  entries.clear();
}
