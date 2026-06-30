/* Usage-tracking service: thin I/O + debounce over the pure `domain/usageStats`
   model. Fire-and-forget `track*` helpers fire on discrete user actions (card
   launch, shelf focus, feature use). No polling, no timers beyond a single
   coalesced write, no React state — safe on the Deck's hot paths. */

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
// A shelf re-focused within this window doesn't re-count — keeps a user
// d-padding back and forth across shelves from inflating the view count.
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
  } catch { /* fall through to empty */ }
  cache = emptyUsage();
  return cache;
}

function scheduleWrite(): void {
  if (writeTimer) return; // one coalesced write per debounce window
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

/* Flush the pending debounced write immediately — call before the stats UI
   reads a summary so the displayed numbers include the latest events. */
export function flushUsage(): void {
  if (!cache) return;
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}

const SEED_CARD_TYPES = ["game", "nonsteam", "store", "wishlist"];
const SEED_FEATURES = [
  "search", "sidenav", "sidecar", "refresh", "see_more", "profile",
  "highlight", "hide", "shelf_create", "shelf_delete", "import", "export",
];

/* Dev/test-only: seed a realistic spread of usage across the last `days`
   calendar days through the pure model, so the statistics UI (trends, KPIs,
   features, top shelves) has data to render. Varies per day so trends aren't
   flat. Persists straight to the cache + storage. Returns the new summary. */
function devSeedUsage(shelfIds?: string[], days = 14): UsageSummary {
  let u: UsageStats = emptyUsage();
  const now = Date.now();
  const ids = shelfIds && shelfIds.length ? shelfIds : ["s_seed_a", "s_seed_b", "s_seed_c"];
  for (let d = days - 1; d >= 0; d--) {
    const date = usageDateKey(now - d * 86_400_000);
    const factor = 1 + ((days - d) % 4);
    SEED_CARD_TYPES.forEach((c, i) => { u = bumpCardLaunch(u, date, c, factor + i); });
    SEED_FEATURES.forEach((f, i) => { if ((d + i) % 2 === 0) u = bumpFeature(u, date, f, 1 + (i % 3)); });
    ids.forEach((id, i) => { u = bumpShelfView(u, date, id, factor + (i % 3)); });
  }
  cache = pruneUsage(u, PRUNE_CAP_DAYS);
  try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
  return summarizeUsage(cache);
}

/* Test hooks (stripped from release builds by `__DEV__`). The UI/stress suites
   drive these to generate usage through the real model and assert the stats
   surface reflects it. */
if (__DEV__) {
  try {
    const g = globalThis as any;
    g.__ds_dev_track_card = (type: string) => { trackCardLaunch(type); flushUsage(); };
    g.__ds_dev_track_feature = (f: string) => { trackFeature(f); flushUsage(); };
    g.__ds_dev_track_shelf = (id: string) => { trackShelfView(id); flushUsage(); };
    g.__ds_dev_seed_usage = (shelfIds?: string[], days?: number) => devSeedUsage(shelfIds, days);
    g.__ds_dev_usage_summary = () => { flushUsage(); return summarizeUsage(load()); };
    g.__ds_dev_usage_clear = () => clearUsage();
    // Restore a previously-captured raw store + drop the in-memory cache so the
    // live UI reflects the original data again (lets tests seed non-destructively).
    g.__ds_dev_usage_restore = (raw: string | null) => {
      try { if (raw == null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, raw); } catch {}
      cache = null;
      return summarizeUsage(load());
    };
  } catch { /* best-effort */ }
}
