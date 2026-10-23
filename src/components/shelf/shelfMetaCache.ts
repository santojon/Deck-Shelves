import type { PlatformAppMeta } from "../../runtime/platform";
import { logInfo } from "../../runtime/logger";
import { SHELF_CACHE_TTL_MS } from "./shelfViewHelpers";

/* Per-shelf card meta persisted next to the id cache (same key prefix, so the
   same sweeper expires it). A cold boot can then paint real cards from disk
   before Steam's library store is hydrated, and revalidate in place — the
   same shape a warm return gets from shelfWarmState, minus the descriptions. */
const META_SUFFIX = "-meta";
const MAX_ENTRIES = 60;
const FIELDS: ReadonlyArray<keyof PlatformAppMeta> = [
  "name", "heroUrl", "portraitUrl", "logoUrl", "iconUrl", "installed", "isSteam",
  "deckCompatCategory", "machineCompatCategory", "frameCompatCategory", "controllerSupport", "playtimeMinutes", "addedTimestamp",
  "updatePending", "releaseTimestamp", "metacriticScore", "diskUsageBytes",
];

function readFreshMetaRecord(cacheKey: string): Record<string, Partial<PlatformAppMeta>> | null {
  const raw = globalThis.localStorage?.getItem(cacheKey + META_SUFFIX);
  if (!raw) return null;
  const { ts, meta } = JSON.parse(raw);
  if (!ts || Date.now() - ts > SHELF_CACHE_TTL_MS) return null;
  return meta && typeof meta === "object" ? meta : null;
}

export function readShelfMetaCache(cacheKey: string, ids: readonly number[]): Map<number, PlatformAppMeta> | null {
  try {
    const meta = readFreshMetaRecord(cacheKey);
    if (!meta) return null;
    const out = new Map<number, PlatformAppMeta>();
    for (const id of ids) {
      const m = meta[id];
      if (m && typeof m.name === "string") out.set(id, { ...m, appid: id } as PlatformAppMeta);
    }
    return out.size ? out : null;
  } catch (e) { logInfo("HOME", "shelf meta cache read failed", String(e)); return null; }
}

export function writeShelfMetaCache(cacheKey: string, ids: readonly number[], items: ReadonlyMap<number, PlatformAppMeta>): void {
  try {
    const meta: Record<number, Partial<PlatformAppMeta>> = {};
    let n = 0;
    for (const id of ids) {
      const m = items.get(id);
      if (!m || !m.name) continue;
      const slim: Partial<PlatformAppMeta> = {};
      for (const f of FIELDS) if (m[f] !== undefined) (slim as any)[f] = m[f];
      meta[id] = slim;
      if (++n >= MAX_ENTRIES) break;
    }
    if (!n) return;
    globalThis.localStorage?.setItem(cacheKey + META_SUFFIX, JSON.stringify({ ts: Date.now(), meta }));
  } catch (e) { logInfo("HOME", "shelf meta cache write failed", String(e)); }
}
