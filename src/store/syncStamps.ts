import type { Settings } from "../types";
import { SYNC_LISTS, LOCAL_ONLY_FIELDS } from "../domain/settingsMerge";

const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

function stripStamp(e: any): string {
  const { updatedAt: _drop, ...rest } = e ?? {};
  return JSON.stringify(rest);
}

// Sorted keys so key order never registers as a change.
function scalarBag(s: any): string {
  const skip = new Set<string>([...SYNC_LISTS, "syncTombstones", "preferencesUpdatedAt", ...LOCAL_ONLY_FIELDS]);
  const out: any = {};
  for (const k of Object.keys(s).sort()) if (!skip.has(k)) out[k] = s[k];
  return JSON.stringify(out);
}

function stampEntity(e: any, before: any, now: number): any {
  if (before && stripStamp(before) === stripStamp(e)) {
    return typeof e.updatedAt === "number" ? e : { ...e, updatedAt: before.updatedAt ?? now };
  }
  return { ...e, updatedAt: now };
}

function stampList(prevList: any[], nextList: any[], tombstones: Record<string, number>, now: number): any[] {
  const prevById = new Map(prevList.map((e) => [e.id, e] as const));
  const nextIds = new Set(nextList.map((e) => e.id));
  const stamped = nextList.map((e) => stampEntity(e, prevById.get(e.id), now));
  for (const e of prevList) if (!nextIds.has(e.id)) tombstones[e.id] = now;
  for (const id of nextIds) if (id in tombstones) delete tombstones[id];
  return stamped;
}

function pruneTombstones(tombstones: Record<string, number>, now: number): void {
  for (const [id, t] of Object.entries(tombstones)) if (now - t > TOMBSTONE_TTL_MS) delete tombstones[id];
}

// Sync-applied saves skip this; they already carry authoritative stamps.
export function stampChanges(prev: Settings | null, next: Settings): Settings {
  const now = Date.now();
  const out: any = { ...next };
  const tombstones: Record<string, number> = { ...((next as any).syncTombstones ?? {}) };
  for (const key of SYNC_LISTS) {
    out[key] = stampList((prev as any)?.[key] ?? [], (next as any)[key] ?? [], tombstones, now);
  }
  const scalarChanged = !prev || scalarBag(prev) !== scalarBag(next);
  out.preferencesUpdatedAt = scalarChanged ? now : ((prev as any).preferencesUpdatedAt ?? (next as any).preferencesUpdatedAt ?? now);
  pruneTombstones(tombstones, now);
  out.syncTombstones = tombstones;
  return out as Settings;
}
