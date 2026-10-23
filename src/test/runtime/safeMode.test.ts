import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluateBootOutcome, recordBootStarted, recordBootCompleted, isSafeModeActive, leaveSafeMode,
  subscribeSafeMode, __resetSafeModeForTest, SAFE_MODE_AFTER_INCOMPLETE_BOOTS, SAFE_MODE_BOOT_WINDOW,
} from "../../runtime/safeMode";

const KEY = "ds-boot-outcomes-v1";

// A Map-backed localStorage stands in for the Deck's: it outlives every simulated restart.
let store: Map<string, string>;
const prevStorage = (globalThis as any).localStorage;

beforeEach(() => {
  store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  __resetSafeModeForTest();
});

afterEach(() => {
  __resetSafeModeForTest();
  (globalThis as any).localStorage = prevStorage;
});

const stored = () => JSON.parse(store.get(KEY) ?? "{}");

// The record an earlier build left behind, read by the next boot.
function seed(record: unknown): void {
  store.set(KEY, JSON.stringify(record));
  __resetSafeModeForTest(true);
}

/* A Steam restart: a new window (the session mark is gone), the bundle
   evaluated again (its cache gone) and localStorage carried over; then the
   boot evaluates. A bare evaluateBootOutcome() is the bundle booting again in
   the same window (hot-swap, reload, the other copy of a dual install). */
function restart(): boolean {
  __resetSafeModeForTest(true);
  return evaluateBootOutcome();
}

// One boot: evaluates (folding the previous boot in), then Home starts and maybe completes.
function boot(completes: boolean): boolean {
  const safe = restart();
  recordBootStarted();
  if (completes) recordBootCompleted();
  return safe;
}

describe("safeMode", () => {
  it("a fresh install is not in Safe Mode", () => {
    expect(evaluateBootOutcome()).toBe(false);
    expect(isSafeModeActive()).toBe(false);
  });

  it("a boot where Home never started is not counted as incomplete", () => {
    restart();
    // no recordBootStarted in any of these sessions
    expect(restart()).toBe(false);
    expect(restart()).toBe(false);
    expect(restart()).toBe(false);
    expect(stored().boots).toEqual([]);
  });

  it("N consecutive started-but-never-completed boots trip Safe Mode on the next boot", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) expect(boot(false)).toBe(false);
    expect(restart()).toBe(true);
    expect(isSafeModeActive()).toBe(true);
  });

  it("one boot completing and the next never completing, over and over, trips Safe Mode", () => {
    expect([boot(false), boot(true), boot(false), boot(true), boot(false)]).toEqual([false, false, false, false, false]);
    expect(restart()).toBe(true);
    expect(isSafeModeActive()).toBe(true);
  });

  it("two incomplete boots followed by four complete ones stay out of Safe Mode", () => {
    boot(false); boot(false);
    for (let i = 0; i < 4; i++) expect(boot(true)).toBe(false);
    expect(restart()).toBe(false);
    expect(isSafeModeActive()).toBe(false);
    expect(stored().boots).toEqual(["incomplete", "incomplete", "complete", "complete", "complete", "complete"]);
  });

  it("only the last N boots count: old incomplete boots fall out of the window", () => {
    boot(false); boot(false);
    for (let i = 0; i < SAFE_MODE_BOOT_WINDOW - 1; i++) boot(true);
    expect(boot(false)).toBe(false);
    // Three incomplete boots overall, but only one inside the window.
    expect(restart()).toBe(false);
    expect(stored().boots).toHaveLength(SAFE_MODE_BOOT_WINDOW);
  });

  it("a boot whose Home completed once is complete even when a later mount of it never finished", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) {
      expect(boot(true)).toBe(false);
      recordBootStarted();
    }
    expect(restart()).toBe(false);
    expect(stored().boots).toEqual(Array(SAFE_MODE_AFTER_INCOMPLETE_BOOTS).fill("complete"));
  });

  it("the bundle booting again mid-mount in the same session does not count a boot", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) {
      expect(restart()).toBe(false);
      recordBootStarted();
      // Hot-swap, reload or the other copy: evaluated again before the mount completed.
      expect(evaluateBootOutcome()).toBe(false);
      recordBootStarted();
      recordBootCompleted();
      expect(stored()).toMatchObject({ started: true, completed: true });
    }
    expect(restart()).toBe(false);
    expect(isSafeModeActive()).toBe(false);
    expect(stored().boots).toEqual(Array(SAFE_MODE_AFTER_INCOMPLETE_BOOTS).fill("complete"));
  });

  it("a later evaluation in the same session answers with the stored verdict", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) boot(false);
    expect(restart()).toBe(true);
    expect(evaluateBootOutcome()).toBe(true);
    // Leaving Safe Mode takes effect on a reload in the same session, and that reload
    // can be cut short mid-mount without becoming a failed boot.
    leaveSafeMode();
    expect(evaluateBootOutcome()).toBe(false);
    recordBootStarted();
    expect(evaluateBootOutcome()).toBe(false);
    expect(stored()).toMatchObject({ started: true, completed: false, boots: [] });
  });

  it("Safe Mode stays on across boots until the user leaves it, which also forgets the window", () => {
    for (let i = 0; i < SAFE_MODE_AFTER_INCOMPLETE_BOOTS; i++) boot(false);
    expect(restart()).toBe(true);
    expect(restart()).toBe(true);
    let notified = 0;
    const unsub = subscribeSafeMode(() => { notified++; });
    leaveSafeMode();
    expect(notified).toBe(1);
    unsub();
    expect(isSafeModeActive()).toBe(false);
    expect(stored().boots).toEqual([]);
    // Two more incomplete boots would trip again if the old ones were still counted.
    expect(boot(false)).toBe(false);
    expect(boot(false)).toBe(false);
    expect(restart()).toBe(false);
  });

  it("persists the started flag in storage so the next boot can see it", () => {
    evaluateBootOutcome(); recordBootStarted();
    expect(stored()).toMatchObject({ started: true, completed: false });
    expect(restart()).toBe(false);
    expect(stored()).toMatchObject({ started: false, boots: ["incomplete"], safeMode: false });
  });

  it("migrates the old streak shape: a pending boot and its streak become window entries", () => {
    seed({ pending: true, incompleteStreak: SAFE_MODE_AFTER_INCOMPLETE_BOOTS - 1, safeMode: false });
    expect(evaluateBootOutcome()).toBe(true);
    const record = stored();
    expect(record.boots).toEqual(Array(SAFE_MODE_AFTER_INCOMPLETE_BOOTS).fill("incomplete"));
    expect(record).not.toHaveProperty("incompleteStreak");
    expect(record).not.toHaveProperty("pending");
  });

  it("migrates the old streak shape: a streak short of the limit is carried, and Safe Mode stays on", () => {
    seed({ pending: false, incompleteStreak: 1, safeMode: false });
    expect(boot(false)).toBe(false);
    expect(boot(false)).toBe(false);
    expect(restart()).toBe(true);
    seed({ pending: false, incompleteStreak: 0, safeMode: true });
    expect(evaluateBootOutcome()).toBe(true);
  });

  it("drops entries it does not understand and keeps only the window", () => {
    seed({ boots: [...Array(SAFE_MODE_BOOT_WINDOW).fill("complete"), "bogus", 7, "incomplete"], safeMode: false });
    expect(evaluateBootOutcome()).toBe(false);
    expect(stored().boots).toEqual([...Array(SAFE_MODE_BOOT_WINDOW - 1).fill("complete"), "incomplete"]);
  });
});
