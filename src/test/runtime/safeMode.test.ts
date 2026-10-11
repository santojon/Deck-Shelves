import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateBootOutcome, recordBootStarted, recordBootCompleted, isSafeModeActive, leaveSafeMode,
  subscribeSafeMode, __resetSafeModeForTest, SAFE_MODE_AFTER_INCOMPLETE_BOOTS,
} from "../../runtime/safeMode";

describe("safeMode", () => {
  beforeEach(() => __resetSafeModeForTest());

  it("a fresh install is not in Safe Mode", () => {
    expect(evaluateBootOutcome()).toBe(false);
    expect(isSafeModeActive()).toBe(false);
  });

  it("a boot where Home never started is not counted as incomplete", () => {
    evaluateBootOutcome();
    // no recordBootStarted this session
    expect(evaluateBootOutcome()).toBe(false);
    expect(evaluateBootOutcome()).toBe(false);
    expect(evaluateBootOutcome()).toBe(false);
  });

  it("N consecutive started-but-never-completed boots trip Safe Mode on the next boot", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) {
      expect(evaluateBootOutcome()).toBe(false);
      recordBootStarted();
    }
    expect(evaluateBootOutcome()).toBe(true);
    expect(isSafeModeActive()).toBe(true);
  });

  it("a completed boot resets the streak", () => {
    evaluateBootOutcome(); recordBootStarted();
    evaluateBootOutcome(); recordBootStarted();
    evaluateBootOutcome(); recordBootStarted(); recordBootCompleted();
    expect(evaluateBootOutcome()).toBe(false);
    recordBootStarted();
    expect(evaluateBootOutcome()).toBe(false);
  });

  it("Safe Mode stays on across boots until the user leaves it, and notifies subscribers", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) { evaluateBootOutcome(); recordBootStarted(); }
    expect(evaluateBootOutcome()).toBe(true);
    expect(evaluateBootOutcome()).toBe(true);
    let notified = 0;
    const unsub = subscribeSafeMode(() => { notified++; });
    leaveSafeMode();
    expect(notified).toBe(1);
    unsub();
    expect(isSafeModeActive()).toBe(false);
    expect(evaluateBootOutcome()).toBe(false);
  });

  it("persists the pending flag in storage so the next boot can see it", () => {
    const store = new Map<string, string>();
    const shim = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    const prev = (globalThis as any).localStorage;
    (globalThis as any).localStorage = shim;
    try {
      __resetSafeModeForTest();
      evaluateBootOutcome(); recordBootStarted();
      __resetSafeModeForTest(true); // drop the in-memory cache only, like a fresh module load
      expect(store.get("ds-boot-outcomes-v1")).toContain('"pending":true');
      // That pending flag is what the next boot folds into the streak.
      expect(evaluateBootOutcome()).toBe(false);
      expect(JSON.parse(store.get("ds-boot-outcomes-v1") ?? "{}").incompleteStreak).toBe(1);
    } finally {
      (globalThis as any).localStorage = prev;
      __resetSafeModeForTest();
    }
  });
});
