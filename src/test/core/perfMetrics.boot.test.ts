import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  markBootStart, recordBootCritical, markMountStart, recordMountDone,
  beginBootPhase, endBootPhase, recordBootWatchdog, getPerfSnapshot, __resetPerfMetricsForTest,
} from "../../core/perfMetrics";
import { disposeAll } from "../../runtime/runtimeDisposer";

const perf = vi.hoisted(() => ({ critical: 0 }));
vi.mock("../../core/perf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/perf")>()),
  measure: (name: string) => (name === "ds.boot.critical" ? perf.critical : 0),
}));

const g = globalThis as any;

function stash(kind: string): void {
  const entry = { kind, dispose: () => {} };
  g.__DECK_SHELVES_INSTANCE__ = entry;
  (g.__DECK_SHELVES_INSTANCES__ ??= {})[kind] = entry;
}

function bootInstance(kind: string): void {
  markBootStart();
  stash(kind);
  recordBootCritical();
}

function mountAndWatch(): void {
  markMountStart();
  recordMountDone();
  recordBootWatchdog("ok");
}

function phase(name: string) {
  return getPerfSnapshot().bootPhases.find((p) => p.name === name);
}

function phaseNames(): string[] {
  return getPerfSnapshot().bootPhases.map((p) => p.name);
}

describe("perfMetrics boot diagnostics", () => {
  beforeEach(() => {
    __resetPerfMetricsForTest();
    delete g.__DECK_SHELVES_INSTANCE__;
    delete g.__DECK_SHELVES_INSTANCES__;
    disposeAll();
  });
  afterEach(() => { vi.unstubAllGlobals(); disposeAll(); });

  describe("boot phases", () => {
    it("records the critical path as a phase once it ends", () => {
      markBootStart();
      expect(getPerfSnapshot().bootPhases).toEqual([]);
      recordBootCritical();
      expect(phase("critical")).toMatchObject({ name: "critical", atMs: 0 });
      expect(phase("critical")?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("records the Home mount relative to boot start and keeps the FIRST mount", () => {
      markBootStart();
      recordBootCritical();
      markMountStart();
      expect(phase("mount")?.atMs).toBeGreaterThanOrEqual(0);
      expect(phase("mount")?.durationMs).toBeNull();
      recordMountDone();
      const first = phase("mount");
      expect(first?.durationMs).toBeGreaterThanOrEqual(0);
      markMountStart();
      recordMountDone();
      expect(phase("mount")).toEqual(first);
      expect(getPerfSnapshot().bootPhases.filter((p) => p.name === "mount")).toHaveLength(1);
    });

    it("records a named phase (the lazy bootstrap) and ignores an end without a begin", () => {
      markBootStart();
      recordBootCritical();
      endBootPhase("lazy");
      expect(phase("lazy")).toBeUndefined();
      beginBootPhase("lazy");
      endBootPhase("lazy");
      expect(phase("lazy")?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("starts a fresh phase list and watchdog verdict once the next boot gets through its critical path", () => {
      markBootStart();
      recordBootCritical();
      mountAndWatch();
      expect(phaseNames()).toEqual(["critical", "mount"]);
      markBootStart();
      expect(phaseNames()).toEqual(["critical", "mount"]);
      expect(getPerfSnapshot().bootWatchdog).toBe("ok");
      recordBootCritical();
      expect(phaseNames()).toEqual(["critical"]);
      expect(getPerfSnapshot().bootWatchdog).toBeNull();
    });

    it("exposes the watchdog verdict", () => {
      expect(getPerfSnapshot().bootWatchdog).toBeNull();
      recordBootWatchdog("tripped: Home patch disabled");
      expect(getPerfSnapshot().bootWatchdog).toBe("tripped: Home patch disabled");
    });

    it("lands a verdict recorded during the critical path together with the boot", () => {
      markBootStart();
      recordBootWatchdog("off: no Home patch");
      expect(getPerfSnapshot().bootWatchdog).toBeNull();
      recordBootCritical();
      expect(getPerfSnapshot().bootWatchdog).toBe("off: no Home patch");
    });
  });

  describe("boot origin", () => {
    it("is cold on the first boot of a kind in this JS context", () => {
      bootInstance("decky");
      expect(getPerfSnapshot().bootOrigin).toBe("cold");
    });

    it("is warm when the earlier instance was dismounted before this boot (plain reload)", () => {
      bootInstance("decky");
      disposeAll();
      bootInstance("decky");
      expect(getPerfSnapshot().bootOrigin).toBe("warm");
    });

    it("is hot-swap when the earlier instance was still live when this one booted", () => {
      bootInstance("decky");
      markBootStart();
      disposeAll();
      stash("decky");
      recordBootCritical();
      expect(getPerfSnapshot().bootOrigin).toBe("hot-swap");
    });

    it("stays null until the critical path ends (a deferred boot never gets there)", () => {
      markBootStart();
      expect(getPerfSnapshot().bootOrigin).toBeNull();
    });
  });

  describe("record left by an earlier build", () => {
    const olderRecord = () => ({
      bootCriticalMs: 96, mountMs: 412, mountStarted: true,
      activeTimers: 1, activeObservers: 0, activeSubscriptions: 2,
      reconcileLog: [], domCallbackLog: [], renderLog: [], cardRenderLog: [], cardRendersTotal: 0,
      mountCardsProcessed: 0, mountFetches: 0, remountTries: 0,
      longTaskCount: 2, longTaskTotalMs: 140, longTaskObserverStarted: false,
    });

    it("gains the boot fields instead of throwing on the first boot after an in-session update", async () => {
      const current = g.__ds_perf_state;
      g.__ds_perf_state = olderRecord();
      stash("decky");
      vi.resetModules();
      try {
        const fresh = await import("../../core/perfMetrics");
        fresh.markBootStart();
        stash("decky");
        expect(() => fresh.recordBootCritical()).not.toThrow();
        const snap = fresh.getPerfSnapshot();
        expect(snap.bootOrigin).toBe("hot-swap");
        expect(snap.bootPhases.map((p) => p.name)).toEqual(["critical"]);
        expect(snap.longTaskOver200Count).toBe(0);
        expect(snap.mountMs).toBe(412);
      } finally {
        g.__ds_perf_state = current;
        vi.resetModules();
      }
    });
  });

  describe("long tasks", () => {
    it("counts the tasks over 200 ms apart from the rest", () => {
      let deliver: ((list: { getEntries: () => Array<{ duration: number }> }) => void) | null = null;
      vi.stubGlobal("PerformanceObserver", class {
        constructor(cb: typeof deliver) { deliver = cb; }
        observe() {}
        disconnect() {}
      });
      markBootStart();
      recordBootCritical();
      expect(deliver).not.toBeNull();
      deliver!({ getEntries: () => [{ duration: 60 }, { duration: 250 }, { duration: 300 }] });
      const snap = getPerfSnapshot();
      expect(snap.longTaskCount).toBe(3);
      expect(snap.longTaskTotalMs).toBe(610);
      expect(snap.longTaskOver200Count).toBe(2);
      expect(snap.longTaskOver200Ms).toBe(550);
    });
  });
});
