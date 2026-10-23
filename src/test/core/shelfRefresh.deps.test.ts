import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let battery: any = null;
vi.mock("../../runtime/batteryState", () => ({ getBatteryState: () => battery }));
vi.mock("../../core/perf", () => ({ mark: vi.fn(), measure: vi.fn() }));

import { subscribeShelfRefresh, triggerShelfRefresh, installShelfRefreshEmitter } from "../../core/shelfRefresh";

describe("shelfRefresh — tagged signals, staggered fan-out, battery pacing", () => {
  let uninstall: (() => void) | null = null;
  let clock = 1_000_000;
  // Each test starts well past the previous emit so its first signal lands at once.
  beforeEach(() => { vi.useFakeTimers(); clock += 60_000; vi.setSystemTime(clock); battery = null; });
  afterEach(() => { uninstall?.(); uninstall = null; vi.useRealTimers(); });

  it("fans a non-manual emit out two listeners per task and carries the deps", () => {
    const seen: Array<[number, any]> = [];
    const unsubs = [1, 2, 3].map((n) => subscribeShelfRefresh((opts) => seen.push([n, opts?.deps])));
    triggerShelfRefresh({ deps: ["friends"] });
    expect(seen.map((s) => s[0])).toEqual([1, 2]);
    vi.advanceTimersByTime(1);
    expect(seen.map((s) => s[0])).toEqual([1, 2, 3]);
    expect(seen[2][1]).toEqual(["friends"]);
    unsubs.forEach((u) => u());
  });

  it("a manual refresh reaches every listener synchronously", () => {
    const seen: number[] = [];
    const unsubs = [1, 2, 3, 4].map((n) => subscribeShelfRefresh(() => seen.push(n)));
    triggerShelfRefresh({ manual: true });
    expect(seen).toEqual([1, 2, 3, 4]);
    unsubs.forEach((u) => u());
  });

  it("signals inside the burst window fold their deps; an untagged one widens to everything", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh((opts) => seen.push(opts?.deps ?? "all"));
    triggerShelfRefresh({ deps: ["overviews"] });   // lands at once (first emit)
    triggerShelfRefresh({ deps: ["collections"] }); // coalesced
    triggerShelfRefresh({ deps: ["friends"] });     // folded into the pending emit
    vi.advanceTimersByTime(800);
    expect(seen[0]).toEqual(["overviews"]);
    expect(new Set(seen[1])).toEqual(new Set(["collections", "friends"]));
    triggerShelfRefresh({ deps: ["online"] });
    triggerShelfRefresh();
    vi.advanceTimersByTime(800);
    expect(seen[2]).toBe("all");
    unsub();
  });

  it("stretches the burst window and the fallback poll on battery", () => {
    battery = { hasBattery: true, state: "discharging", level: 0.5, ts: 0 };
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh((opts) => seen.push(opts?.deps ?? "all"));
    triggerShelfRefresh({ deps: ["overviews"] });
    triggerShelfRefresh({ deps: ["friends"] });
    vi.advanceTimersByTime(1000);
    expect(seen.length).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(seen.length).toBe(2);
    uninstall = installShelfRefreshEmitter();
    const before = seen.length;
    vi.advanceTimersByTime(45000);
    expect(seen.length).toBe(before);
    vi.advanceTimersByTime(20000);
    expect(seen.length).toBe(before + 1);
    unsub();
  });
});
