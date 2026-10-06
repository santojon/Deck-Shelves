import { describe, it, expect, beforeEach } from "vitest";
import {
  markBootStart, recordBootCritical, markMountStart, recordMountDone,
  timerCreated, timerDisposed, observerCreated, observerDisposed,
  subscriptionCreated, subscriptionDisposed,
  recordReconcile, recordDomCallback, recordRender,
  resetMountCounters, recordMountFetch, recordMountCardsProcessed,
  recordRemountTry, getPerfSnapshot, __resetPerfMetricsForTest,
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
});
