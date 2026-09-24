import type { Settings } from "../types";

/* Cross-device settings merge. The transport (SteamClient.RoamingStorage) only
   moves whole snapshots; convergence lives here. Every syncable list entity
   carries an `updatedAt` clock (stamped centrally in settingsStore.saveSettings),
   so lists merge per-id last-writer-wins with deletion tombstones, and the scalar
   toggle bag merges whole by `preferencesUpdatedAt`. */

type Entity = { id: string; updatedAt?: number };
type Tombstones = Record<string, number>;

// Lists merged per-id. Everything else (toggles, allShelvesOrder, …) is the
// scalar bag, chosen whole by preferencesUpdatedAt.
export const SYNC_LISTS = ["shelves", "smartShelves", "savedFilters", "savedSmartFilters", "profiles"] as const;

// Per-device, never synced — always kept from the local (first) argument.
export const LOCAL_ONLY_FIELDS = [
  "cloudSyncEnabled", "cloudSyncLastSyncedAt",
  "screensaverIdleBackupAcSec", "screensaverIdleBackupBatterySec",
  // The active profile is a device-local presentation — a merge must keep the
  // local one, never adopt the other device's (see cloudSync's matching list).
  "activeProfileName",
] as const;

function clk(e: Entity): number { return typeof e.updatedAt === "number" ? e.updatedAt : 0; }

// Deterministic, order-independent tiebreak so merge(a,b) === merge(b,a): newer
// clock wins; equal clocks fall back to the lexicographically greater JSON.
function pickNewer<T extends Entity>(a: T, b: T): T {
  const ca = clk(a), cb = clk(b);
  if (ca !== cb) return ca > cb ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const out: Tombstones = { ...a };
  for (const [id, t] of Object.entries(b)) out[id] = Math.max(out[id] ?? 0, t);
  return out;
}

/* Order the merged set by the scalar-winner's own list order (deterministic on
   both devices), appending any ids it doesn't list in stable id order — so the
   array order converges too, not just the membership. */
function orderMerged<T extends Entity>(merged: T[], orderIds: string[]): T[] {
  const pos = new Map(orderIds.map((id, i) => [id, i] as const));
  const rank = (e: T): number => (pos.has(e.id) ? (pos.get(e.id) as number) : Number.MAX_SAFE_INTEGER);
  return merged.slice().sort((x, y) => {
    const rx = rank(x), ry = rank(y);
    if (rx !== ry) return rx - ry;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
}

function mergeList<T extends Entity>(a: readonly T[], b: readonly T[], tombstones: Tombstones, orderIds: string[]): T[] {
  const byId = new Map<string, T>();
  for (const e of a) byId.set(e.id, e);
  for (const e of b) { const p = byId.get(e.id); byId.set(e.id, p ? pickNewer(p, e) : e); }
  // Drop an entity whose deletion tombstone is at least as new as its last edit;
  // an edit newer than the delete revives it (edit-wins-over-older-delete).
  const alive: T[] = [];
  for (const e of byId.values()) if ((tombstones[e.id] ?? 0) < clk(e)) alive.push(e);
  return orderMerged(alive, orderIds);
}

function prefClock(s: any): number { return typeof s.preferencesUpdatedAt === "number" ? s.preferencesUpdatedAt : 0; }

/* The scalar bag is adopted from the remote ONLY when the remote's clock is
   strictly newer; on a tie (very common — both 0 before anyone edits) KEEP LOCAL.
   Keeping local on ties is deliberately non-symmetric for scalars: it stops an
   un-edited or stale remote bag from flipping a device's own toggles (e.g. the
   master `enabled`), so a bad snapshot can never poison every device. */
function pickScalarBase(la: any, rb: any, lp: number, rp: number): any {
  return rp > lp ? rb : la;
}

/* Merge two full settings snapshots. Symmetric, idempotent and order-independent
   on SYNCED fields (so both devices converge from the same pair); the device-local
   fields in LOCAL_ONLY_FIELDS always come from `local` (the first argument). */
export function mergeSettings(local: Settings, remote: Settings): Settings {
  const la = local as any, rb = remote as any;
  const lp = prefClock(la), rp = prefClock(rb);
  const base: any = pickScalarBase(la, rb, lp, rp);
  const out: any = { ...base };

  const tombstones = mergeTombstones(la.syncTombstones ?? {}, rb.syncTombstones ?? {});
  out.syncTombstones = tombstones;
  out.preferencesUpdatedAt = Math.max(lp, rp);

  for (const key of SYNC_LISTS) {
    const orderIds = ((base[key] ?? []) as Entity[]).map((e) => e.id);
    out[key] = mergeList((la[key] ?? []) as Entity[], (rb[key] ?? []) as Entity[], tombstones, orderIds);
  }
  for (const key of LOCAL_ONLY_FIELDS) out[key] = la[key];
  return out as Settings;
}
