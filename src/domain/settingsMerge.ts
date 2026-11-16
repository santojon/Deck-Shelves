import type { Settings } from "../types";

type Entity = { id: string; updatedAt?: number };
type Tombstones = Record<string, number>;

export const SYNC_LISTS = ["shelves", "smartShelves", "savedFilters", "savedSmartFilters", "profiles"] as const;

// Local to this install: never part of a profile switch or a sync.
export const DEVICE_LOCAL_FIELDS = [
  "devModeEnabled", "verboseLoggingEnabled", "ownQamTabEnabled",
  // Kept across resets, or turning the screensaver off can't restore Steam's idle timeout.
  "screensaverIdleBackupAcSec", "screensaverIdleBackupBatterySec",
  "debugOverlayEnabled", "debugOverlayCorner", "debugOverlayVertical",
  "debugOverlayFps", "debugOverlayStats", "debugOverlayPerShelf",
  "debugOverlayOutlines", "debugOverlayFocus", "debugOverlayTransparent",
  "accountSettings",
] as const;

export const LOCAL_ONLY_FIELDS = [
  "cloudSyncEnabled", "cloudSyncLastSyncedAt",
  "activeProfileName",
  "showcaseSeen",
  ...DEVICE_LOCAL_FIELDS,
] as const;

function clk(e: Entity): number { return typeof e.updatedAt === "number" ? e.updatedAt : 0; }

// Order-independent tiebreak so merge(a, b) === merge(b, a).
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
  // An edit newer than the delete revives the entity.
  const alive: T[] = [];
  for (const e of byId.values()) if ((tombstones[e.id] ?? 0) < clk(e)) alive.push(e);
  return orderMerged(alive, orderIds);
}

function prefClock(s: any): number { return typeof s.preferencesUpdatedAt === "number" ? s.preferencesUpdatedAt : 0; }

// Ties keep local so a stale remote can't flip this device's own toggles.
function pickScalarBase(la: any, rb: any, lp: number, rp: number): any {
  return rp > lp ? rb : la;
}

function scalarBag(la: any, rb: any, lp: number, rp: number, keepLocal: boolean): { base: any; clock: number } {
  if (keepLocal) return { base: la, clock: lp };
  return { base: pickScalarBase(la, rb, lp, rp), clock: Math.max(lp, rp) };
}

// Symmetric on synced fields; LOCAL_ONLY_FIELDS always come from `local`.
type HubConfig = { values: Record<string, unknown>; updatedAt: Record<string, number> };
type Clocks = Record<string, number>;

function hubOrNull(c: HubConfig | null | undefined): HubConfig | null { return c && c.values ? c : null; }

function adoptNewer(values: Record<string, unknown>, clocks: Clocks, k: string, v: unknown, tr: number): void {
  if (!(k in values) || tr > (clocks[k] ?? 0)) { values[k] = v; clocks[k] = tr; }
}

export function mergeHubConfig(local: HubConfig | null | undefined, remote: HubConfig | null | undefined): HubConfig | null {
  const l = hubOrNull(local);
  const r = hubOrNull(remote);
  if (!r || Object.keys(r.values).length === 0) return l;
  if (!l) return r;
  const values = { ...l.values };
  const updatedAt: Clocks = { ...(l.updatedAt ?? {}) };
  for (const [k, v] of Object.entries(r.values)) adoptNewer(values, updatedAt, k, v, r.updatedAt?.[k] ?? 0);
  return { values, updatedAt };
}

function keepHigherSchemaVersion(out: any, la: any, rb: any): void {
  const schema = Math.max(la.schemaVersion ?? 0, rb.schemaVersion ?? 0);
  if (schema > 0) out.schemaVersion = schema;
}

export function mergeSettings(local: Settings, remote: Settings, opts?: { scalars?: "auto" | "keepLocal" }): Settings {
  const la = local as any, rb = remote as any;
  const lp = prefClock(la), rp = prefClock(rb);
  const { base, clock } = scalarBag(la, rb, lp, rp, opts?.scalars === "keepLocal");
  const out: any = { ...base };
  keepHigherSchemaVersion(out, la, rb);

  const tombstones = mergeTombstones(la.syncTombstones ?? {}, rb.syncTombstones ?? {});
  out.syncTombstones = tombstones;
  out.preferencesUpdatedAt = clock;

  for (const key of SYNC_LISTS) {
    const orderIds = ((base[key] ?? []) as Entity[]).map((e) => e.id);
    out[key] = mergeList((la[key] ?? []) as Entity[], (rb[key] ?? []) as Entity[], tombstones, orderIds);
  }
  for (const key of LOCAL_ONLY_FIELDS) out[key] = la[key];
  const hub = mergeHubConfig(la.hubConfig, rb.hubConfig);
  if (hub) out.hubConfig = hub; else delete out.hubConfig;
  return out as Settings;
}
