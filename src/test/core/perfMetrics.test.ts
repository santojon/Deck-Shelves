import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  markBootStart, recordBootCritical, markMountStart, recordMountDone,
  timerCreated, timerDisposed, observerCreated, observerDisposed,
  subscriptionCreated, subscriptionDisposed,
  recordReconcile, recordDomCallback, recordRender,
  resetMountCounters, recordMountFetch, recordMountCardsProcessed,
  recordRemountTry, getPerfSnapshot, hasMountStarted, __resetPerfMetricsForTest,
} from "../../core/perfMetrics";

describe("perfMetrics", () => {
  beforeEach(() => { __resetPerfMetricsForTest(); });

  it("starts with a zeroed snapshot", () => {
    const snap = getPerfSnapshot();
    expect(snap.bootCriticalMs).toBeNull();
    expect(snap.mountMs).toBeNull();
    expect(snap.activeTimers).toBe(0);
    expect(snap.activeObservers).toBe(0);
    expect(snap.activeSubscriptions).toBe(0);
    expect(snap.reconcilesPerMin).toBe(0);
    expect(snap.mountCardsProcessed).toBe(0);
    expect(snap.remountTries).toBe(0);
  });

  it("measures boot and mount timing", () => {
    markBootStart();
    recordBootCritical();
    expect(getPerfSnapshot().bootCriticalMs).toBeGreaterThanOrEqual(0);

    markMountStart();
    recordMountDone();
    expect(getPerfSnapshot().mountMs).toBeGreaterThanOrEqual(0);
  });

  /* The startup watchdog keys on this to tell a stuck injection apart from
     "Home was never opened" — only the former may disable the Home patch. */
  it("reports whether the Home mount ever started, independently of completion", () => {
    expect(hasMountStarted()).toBe(false);
    expect(getPerfSnapshot().mountMs).toBeNull();

    markMountStart();
    // Started but NOT completed — the only state that is a real fault.
    expect(hasMountStarted()).toBe(true);
    expect(getPerfSnapshot().mountMs).toBeNull();

    recordMountDone();
    expect(getPerfSnapshot().mountMs).toBeGreaterThanOrEqual(0);
  });

  it("clears the mount-started flag on reset", () => {
    markMountStart();
    expect(hasMountStarted()).toBe(true);
    __resetPerfMetricsForTest();
    expect(hasMountStarted()).toBe(false);
  });

  it("tracks active timer/observer/subscription counts without going negative", () => {
    timerCreated(); timerCreated();
    observerCreated();
    subscriptionCreated();
    let snap = getPerfSnapshot();
    expect(snap.activeTimers).toBe(2);
    expect(snap.activeObservers).toBe(1);
    expect(snap.activeSubscriptions).toBe(1);

    timerDisposed(); timerDisposed(); timerDisposed();
    observerDisposed();
    subscriptionDisposed();
    snap = getPerfSnapshot();
    expect(snap.activeTimers).toBe(0);
    expect(snap.activeObservers).toBe(0);
    expect(snap.activeSubscriptions).toBe(0);
  });

  it("counts reconcile/DOM-callback/render events in the rolling window", () => {
    recordReconcile(); recordReconcile();
    recordDomCallback();
    recordRender(); recordRender(); recordRender();
    const snap = getPerfSnapshot();
    expect(snap.reconcilesPerMin).toBe(2);
    expect(snap.domCallbacksPerMin).toBe(1);
    expect(snap.rendersPerMin).toBe(3);
  });

  it("accumulates mount-cycle counters and resets them on resetMountCounters", () => {
    recordMountFetch(); recordMountFetch();
    recordMountCardsProcessed(10);
    recordMountCardsProcessed(5);
    let snap = getPerfSnapshot();
    expect(snap.mountFetches).toBe(2);
    expect(snap.mountCardsProcessed).toBe(15);

    resetMountCounters();
    snap = getPerfSnapshot();
    expect(snap.mountFetches).toBe(0);
    expect(snap.mountCardsProcessed).toBe(0);
  });

  it("counts remount tries", () => {
    recordRemountTry(); recordRemountTry(); recordRemountTry();
    expect(getPerfSnapshot().remountTries).toBe(3);
  });

  describe("JS heap reading", () => {
    const originalMemory = (performance as any).memory;
    afterEach(() => {
      if (originalMemory === undefined) delete (performance as any).memory;
      else (performance as any).memory = originalMemory;
    });

    it("reports null when performance.memory isn't available (non-Chromium)", () => {
      delete (performance as any).memory;
      const snap = getPerfSnapshot();
      expect(snap.usedJSHeapMB).toBeNull();
      expect(snap.totalJSHeapMB).toBeNull();
    });

    it("reports heap sizes in MB when performance.memory is available", () => {
      (performance as any).memory = { usedJSHeapSize: 52428800, totalJSHeapSize: 104857600 };
      const snap = getPerfSnapshot();
      expect(snap.usedJSHeapMB).toBe(50);
      expect(snap.totalJSHeapMB).toBe(100);
    });
  });
});
