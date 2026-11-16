import {
  type UsageStats,
  type UsageSummary,
  emptyUsage,
  bumpShelfView,
  bumpCardLaunch,
  bumpFeature,
  pruneUsage,
  summarizeUsage,
  usageDateKey,
} from "../domain/usageStats";

const STORAGE_KEY = "ds_usage_v1";
const PRUNE_CAP_DAYS = 120;
const WRITE_DEBOUNCE_MS = 4000;
const SHELF_VIEW_DEDUPE_MS = 60_000;

let cache: UsageStats | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const lastShelfViewAt: Record<string, number> = {};

function load(): UsageStats {
  if (cache) return cache;
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && parsed.days && typeof parsed.days === "object") {
        cache = parsed as UsageStats;
        return cache;
      }
    }
  } catch {}
  cache = emptyUsage();
  return cache;
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
  }, WRITE_DEBOUNCE_MS);
}

function commit(next: UsageStats): void {
  cache = pruneUsage(next, PRUNE_CAP_DAYS);
  scheduleWrite();
}

export function trackShelfView(shelfId: string): void {
  if (!shelfId) return;
  const now = Date.now();
  if (now - (lastShelfViewAt[shelfId] ?? 0) < SHELF_VIEW_DEDUPE_MS) return;
  lastShelfViewAt[shelfId] = now;
  commit(bumpShelfView(load(), usageDateKey(now), shelfId));
}

export function trackCardLaunch(cardType: string): void {
  if (!cardType) return;
  commit(bumpCardLaunch(load(), usageDateKey(Date.now()), cardType));
}

export function trackFeature(featureId: string): void {
  if (!featureId) return;
  commit(bumpFeature(load(), usageDateKey(Date.now()), featureId));
}

export function getUsage(): UsageStats {
  return load();
}

export function getUsageSummary(sinceDate?: string): UsageSummary {
  return summarizeUsage(load(), sinceDate);
}

export function clearUsage(): void {
  cache = emptyUsage();
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { (globalThis as any)?.localStorage?.removeItem(STORAGE_KEY); } catch {}
  for (const k of Object.keys(lastShelfViewAt)) delete lastShelfViewAt[k];
}

export function flushUsage(): void {
  if (!cache) return;
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}
