// heuristic primitives shared across the v2 smart templates.
//
// Five pure helpers. Each takes the candidate AppOverview pool + a
// caller-provided signal extractor + a config object; returns a
// ranked / filtered slice. No I/O, no state outside the locally-scoped
// cooldown LRU below (which is bounded to ~64 shelves and cleared on
// resolver reload). Safe to call inside a `resolveSmart*` function
// without re-entrancy concerns.
import type { AppOverview } from "./index";

const appIdOf = (a: AppOverview) => (a as any).appid as number;
const SEC_PER_DAY = 86400;

export function weightedRank(
  apps: AppOverview[],
  signals: ReadonlyArray<{ key: string; get: (a: AppOverview) => number }>,
  weights: Readonly<Record<string, number>>,
): AppOverview[] {
  const scored = apps.map((a) => {
    let score = 0;
    for (const sig of signals) {
      const w = weights[sig.key] ?? 0;
      if (w === 0) continue;
      const v = sig.get(a);
      if (Number.isFinite(v)) score += v * w;
    }
    return { a, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.map((s) => s.a);
}

export function multiFactorRank(
  apps: AppOverview[],
  chain: ReadonlyArray<{ get: (a: AppOverview) => number; reverse?: boolean }>,
): AppOverview[] {
  const out = apps.slice();
  out.sort((a, b) => {
    for (const factor of chain) {
      const sign = factor.reverse ? -1 : 1;
      const diff = sign * (factor.get(b) - factor.get(a));
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return out;
}

export function timeDecayScore(
  eventSec: number,
  halfLifeDays: number,
  baseWeight = 0,
): number {
  if (!eventSec || halfLifeDays <= 0) return baseWeight;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageDays = Math.max(0, (nowSec - eventSec) / SEC_PER_DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

// Cooldown — a bounded per-shelf set of recently-surfaced appids. The
// set survives between resolver calls in the same session but is
// cleared on plugin reload. Backed by an LRU so unused shelves drop
// off rather than growing unbounded.
const COOLDOWN_LRU = new Map<string, Map<number, number>>();
const COOLDOWN_LRU_CAP = 64;
function getCooldownMap(shelfKey: string): Map<number, number> {
  let m = COOLDOWN_LRU.get(shelfKey);
  if (!m) {
    m = new Map();
    COOLDOWN_LRU.set(shelfKey, m);
    if (COOLDOWN_LRU.size > COOLDOWN_LRU_CAP) {
      const firstKey = COOLDOWN_LRU.keys().next().value as string;
      if (firstKey) COOLDOWN_LRU.delete(firstKey);
    }
  } else {
    // touch -> move to end
    COOLDOWN_LRU.delete(shelfKey);
    COOLDOWN_LRU.set(shelfKey, m);
  }
  return m;
}

export function applyCooldown(
  apps: AppOverview[],
  shelfKey: string,
  cooldownDays: number,
  limit: number,
): AppOverview[] {
  if (cooldownDays <= 0 || limit <= 0) return apps.slice(0, limit);
  const map = getCooldownMap(shelfKey);
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - cooldownDays * SEC_PER_DAY;
  // Drop expired entries first so the map doesn't grow forever per shelf.
  for (const [id, ts] of map) if (ts < cutoff) map.delete(id);
  const surviving = apps.filter((a) => !map.has(appIdOf(a)));
  const picked = surviving.slice(0, limit);
  for (const a of picked) map.set(appIdOf(a), nowSec);
  return picked;
}

export function rotateWindow(
  apps: AppOverview[],
  shelfKey: string,
  rotateEveryDays: number,
  limit: number,
): AppOverview[] {
  if (!apps.length || limit <= 0) return [];
  const windows = Math.max(1, rotateEveryDays);
  const dayIndex = Math.floor(Date.now() / (SEC_PER_DAY * 1000) / windows);
  // Hash `shelfKey` into the seed so two shelves with the same template
  // don't show the same slice on the same day.
  let h = 0;
  for (let i = 0; i < shelfKey.length; i++) h = (h * 31 + shelfKey.charCodeAt(i)) | 0;
  const start = Math.abs(dayIndex + h) % apps.length;
  const rotated = [...apps.slice(start), ...apps.slice(0, start)];
  return rotated.slice(0, limit);
}
