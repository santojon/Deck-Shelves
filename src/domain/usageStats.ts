// Pure usage-statistics model. No side effects, no I/O — the persistence
// layer (src/steam/usageTracking.ts) reads/writes localStorage and calls
// these. Keeps the domain testable and free of Steam/runtime coupling.

export interface UsageDay {
  /** shelfId -> times the shelf was viewed (focused into). */
  shelfViews: Record<string, number>;
  /** card kind ('game' | 'nonsteam' | 'more' | 'refresh' | 'decoration' | ...) -> launches/activations. */
  cardLaunches: Record<string, number>;
  /** feature id (toggle / action key) -> times used. */
  featureUse: Record<string, number>;
}

export interface UsageStats {
  v: 1;
  /** local 'YYYY-MM-DD' -> bucket. */
  days: Record<string, UsageDay>;
}

export interface UsageSummary {
  shelfViews: Record<string, number>;
  cardLaunches: Record<string, number>;
  featureUse: Record<string, number>;
  totalDays: number;
  totalShelfViews: number;
  totalCardLaunches: number;
  totalFeatureUse: number;
}

export function emptyDay(): UsageDay {
  return { shelfViews: {}, cardLaunches: {}, featureUse: {} };
}

export function emptyUsage(): UsageStats {
  return { v: 1, days: {} };
}

/** Local calendar date key for a timestamp — buckets are per local day. */
export function usageDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Bucket = keyof UsageDay;

/* Single internal bump — returns a NEW UsageStats (immutable update) so React
   consumers can diff cheaply. Negative/zero/NaN counts are ignored. */
function bump(u: UsageStats, date: string, bucket: Bucket, key: string, n: number): UsageStats {
  if (!key || !Number.isFinite(n) || n <= 0) return u;
  const prevDay = u.days[date] ?? emptyDay();
  const prevBucket = prevDay[bucket];
  const nextDay: UsageDay = {
    ...prevDay,
    [bucket]: { ...prevBucket, [key]: (prevBucket[key] ?? 0) + n },
  };
  return { ...u, days: { ...u.days, [date]: nextDay } };
}

export function bumpShelfView(u: UsageStats, date: string, shelfId: string, n = 1): UsageStats {
  return bump(u, date, "shelfViews", shelfId, n);
}

export function bumpCardLaunch(u: UsageStats, date: string, cardType: string, n = 1): UsageStats {
  return bump(u, date, "cardLaunches", cardType, n);
}

export function bumpFeature(u: UsageStats, date: string, featureId: string, n = 1): UsageStats {
  return bump(u, date, "featureUse", featureId, n);
}

/* Drop all but the most recent `capDays` calendar days so the store can't grow
   unbounded. Days sort lexicographically because the key is ISO 'YYYY-MM-DD'. */
export function pruneUsage(u: UsageStats, capDays = 120): UsageStats {
  const keys = Object.keys(u.days);
  if (keys.length <= capDays) return u;
  const keep = keys.sort().slice(keys.length - capDays);
  const days: Record<string, UsageDay> = {};
  for (const k of keep) days[k] = u.days[k];
  return { ...u, days };
}

function addInto(target: Record<string, number>, src: Record<string, number>): void {
  for (const k of Object.keys(src)) target[k] = (target[k] ?? 0) + src[k];
}

function sumValues(rec: Record<string, number>): number {
  let t = 0;
  for (const k of Object.keys(rec)) t += rec[k];
  return t;
}

/* Aggregate buckets across all days >= `sinceDate` (inclusive). Omit
   `sinceDate` for all-time. The per-bucket maps are merged by summing. */
export function summarizeUsage(u: UsageStats, sinceDate?: string): UsageSummary {
  const shelfViews: Record<string, number> = {};
  const cardLaunches: Record<string, number> = {};
  const featureUse: Record<string, number> = {};
  let totalDays = 0;
  for (const date of Object.keys(u.days)) {
    if (sinceDate && date < sinceDate) continue;
    const d = u.days[date];
    addInto(shelfViews, d.shelfViews);
    addInto(cardLaunches, d.cardLaunches);
    addInto(featureUse, d.featureUse);
    totalDays++;
  }
  return {
    shelfViews,
    cardLaunches,
    featureUse,
    totalDays,
    totalShelfViews: sumValues(shelfViews),
    totalCardLaunches: sumValues(cardLaunches),
    totalFeatureUse: sumValues(featureUse),
  };
}

/* Date key for `daysBack` days before `nowMs` — used by the UI to build
   time windows ("last 7 days" etc.). */
export function usageDateKeyDaysAgo(nowMs: number, daysBack: number): string {
  return usageDateKey(nowMs - daysBack * 86_400_000);
}

export interface UsageDailyPoint {
  date: string;
  launches: number;
  views: number;
  features: number;
}

/* Per-day totals for the last `days` calendar days (oldest first, newest last),
   gaps filled with zeros so the trend chart has a continuous x-axis. */
export function dailyTotals(u: UsageStats, nowMs: number, days: number): UsageDailyPoint[] {
  const out: UsageDailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = usageDateKey(nowMs - i * 86_400_000);
    const d = u.days[date];
    out.push({
      date,
      launches: d ? sumValues(d.cardLaunches) : 0,
      views: d ? sumValues(d.shelfViews) : 0,
      features: d ? sumValues(d.featureUse) : 0,
    });
  }
  return out;
}
