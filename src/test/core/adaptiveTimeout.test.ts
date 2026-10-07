import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordDuration, getAdaptiveTimeout, getLearnedTimeoutsSummary, __resetAdaptiveTimeoutForTest } from "../../core/adaptiveTimeout";

const lsStore = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { lsStore.set(k, v); },
  removeItem: (k: string) => { lsStore.delete(k); },
  clear: () => lsStore.clear(),
};

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageStub);
  lsStore.clear();
  __resetAdaptiveTimeoutForTest();
});
afterEach(() => vi.unstubAllGlobals());

describe("adaptiveTimeout", () => {
  it("returns the fallback when there are no samples yet", () => {
    expect(getAdaptiveTimeout("k", { floor: 100, ceiling: 4000, fallback: 2500 })).toBe(2500);
  });

  it("returns the fallback until minSamples is reached", () => {
    for (let i = 0; i < 4; i++) recordDuration("k", 50);
    expect(getAdaptiveTimeout("k", { floor: 100, ceiling: 4000, fallback: 2500, minSamples: 5 })).toBe(2500);
  });

  it("tightens toward observed latency once enough samples exist, within the floor", () => {
    for (let i = 0; i < 10; i++) recordDuration("k", 50);
    // p90 of a flat 50ms series * 2x safety = 100ms, but floor keeps it from
    // going lower than a sane minimum.
    expect(getAdaptiveTimeout("k", { floor: 500, ceiling: 4000, fallback: 2500 })).toBe(500);
  });

  it("derives a timeout above the floor when observed latency warrants it", () => {
    for (let i = 0; i < 10; i++) recordDuration("k", 800);
    // p90 ~800ms * 2x = 1600ms, within [100, 4000].
    expect(getAdaptiveTimeout("k", { floor: 100, ceiling: 4000, fallback: 2500 })).toBe(1600);
  });

  it("never exceeds the ceiling even if observed latency is high", () => {
    for (let i = 0; i < 10; i++) recordDuration("k", 9000);
    expect(getAdaptiveTimeout("k", { floor: 100, ceiling: 4000, fallback: 2500 })).toBe(4000);
  });

  it("keeps separate rolling windows per key", () => {
    for (let i = 0; i < 10; i++) recordDuration("fast", 50);
    for (let i = 0; i < 10; i++) recordDuration("slow", 3000);
    expect(getAdaptiveTimeout("fast", { floor: 50, ceiling: 10000, fallback: 2500 })).toBe(100);
    expect(getAdaptiveTimeout("slow", { floor: 50, ceiling: 10000, fallback: 2500 })).toBe(6000);
  });

  it("bounds the rolling window so very old samples age out", () => {
    for (let i = 0; i < 20; i++) recordDuration("k", 9000);
    for (let i = 0; i < 20; i++) recordDuration("k", 100);
    // Only the most recent 20 (all 100ms) should remain.
    expect(getAdaptiveTimeout("k", { floor: 50, ceiling: 10000, fallback: 2500 })).toBe(200);
  });

  it("ignores invalid durations", () => {
    recordDuration("k", -5);
    recordDuration("k", NaN);
    for (let i = 0; i < 5; i++) recordDuration("k", 50);
    expect(getAdaptiveTimeout("k", { floor: 10, ceiling: 4000, fallback: 2500 })).toBe(100);
  });

  it("summarizes learned keys sorted alphabetically, with sample count and p90", () => {
    for (let i = 0; i < 6; i++) recordDuration("composite-child:wishlist", 1000);
    for (let i = 0; i < 6; i++) recordDuration("collection-rpc", 100);
    expect(getLearnedTimeoutsSummary()).toEqual([
      { key: "collection-rpc", sampleCount: 6, p90Ms: 100 },
      { key: "composite-child:wishlist", sampleCount: 6, p90Ms: 1000 },
    ]);
  });

  it("summary is empty when nothing has been recorded", () => {
    expect(getLearnedTimeoutsSummary()).toEqual([]);
  });

  it("persists samples across a fresh module load (survives a restart)", async () => {
    for (let i = 0; i < 10; i++) recordDuration("k", 800);
    vi.resetModules();
    const fresh = await import("../../core/adaptiveTimeout");
    expect(fresh.getAdaptiveTimeout("k", { floor: 100, ceiling: 4000, fallback: 2500 })).toBe(1600);
  });
});
