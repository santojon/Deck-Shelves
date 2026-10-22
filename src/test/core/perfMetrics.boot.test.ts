import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  markBootStart, recordBootCritical, markMountStart, recordMountDone,
  beginBootPhase, endBootPhase, recordBootWatchdog, getPerfSnapshot, __resetPerfMetricsForTest,
} from "../../core/perfMetrics";
import { disposeAll } from "../../runtime/runtimeDisposer";
import { claimHomeOwnership } from "../../runtime/host/ownerGuard";

// The critical-path measurement, controlled per boot so a sibling's number can be told from the owner's.
const perf = vi.hoisted(() => ({ critical: 0 }));
vi.mock("../../core/perf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/perf")>()),
  measure: (name: string) => (name === "ds.boot.critical" ? perf.critical : 0),
}));

const g = globalThis as any;
const ownerScope = (): any => g.window ?? g;

// The entry's stash of an instance on `window`: one entry per host kind, never removed.
function stash(kind: string): void {
  const entry = { kind, dispose: () => {} };
  g.__DECK_SHELVES_INSTANCE__ = entry;
  (g.__DECK_SHELVES_INSTANCES__ ??= {})[kind] = entry;
}

/* Mirrors the entry's order: boot start, the renderer claim, the stash, then
   the end of the critical path. Returns whether this copy owns the renderer. */
function bootInstance(kind: "decky" | "shelveshub"): boolean {
  markBootStart();
  const owner = claimHomeOwnership(kind);
  stash(kind);
  recordBootCritical();
  return owner;
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
    const w = ownerScope();
    delete w.__DECK_SHELVES_OWNER__;
    delete w.__DECK_SHELVES_OWNER_META__;
    delete w.__SHELVES_FORCE_OWNER__;
    claimHomeOwnership("decky"); // a single install owns the renderer
    disposeAll();
  });
  afterEach(() => { vi.unstubAllGlobals(); disposeAll(); });

  describe("boot phases", () => {
    it("records the critical path as a phase once it ends", () => {
      markBootStart();
      // Kept aside until the critical path ends: nothing lands in the shared record yet.
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
      // Home mounts again on every return; the boot record must not move.
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
      // The previous boot stays on record until this one commits.
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
      // installStartupWatchdog(null) records this before the critical path ends.
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
      disposeAll(); // the loader's onDismount → the instance's teardown
      bootInstance("decky");
      expect(getPerfSnapshot().bootOrigin).toBe("warm");
    });

    it("is hot-swap when the earlier instance was still live when this one booted", () => {
      bootInstance("decky");
      // The entry disposes the previous instance only AFTER markBootStart.
      markBootStart();
      disposeAll();
      stash("decky");
      recordBootCritical();
      expect(getPerfSnapshot().bootOrigin).toBe("hot-swap");
    });

    it("is cold for the owner of another kind, whatever its sibling did before", () => {
      ownerScope().__SHELVES_FORCE_OWNER__ = "shelveshub";
      expect(bootInstance("decky")).toBe(false);
      expect(bootInstance("shelveshub")).toBe(true);
      expect(getPerfSnapshot().bootOrigin).toBe("cold");
    });

    it("stays null until the critical path ends (a deferred boot never gets there)", () => {
      markBootStart();
      expect(getPerfSnapshot().bootOrigin).toBeNull();
    });
  });

  describe("dual-host install", () => {
    it("keeps the owner's record when a sibling kind boots and defers to the host", () => {
      expect(bootInstance("decky")).toBe(true);
      mountAndWatch();
      expect(claimHomeOwnership("shelveshub")).toBe(false);
      markBootStart(); // deferred to the host: never reaches recordBootCritical
      const snap = getPerfSnapshot();
      expect(snap.bootOrigin).toBe("cold");
      expect(snap.bootPhases.map((p) => p.name)).toEqual(["critical", "mount"]);
      expect(snap.bootWatchdog).toBe("ok");
    });

    it("keeps the owner's record when a stood-down sibling runs its whole critical path", () => {
      bootInstance("decky");
      mountAndWatch();
      const before = getPerfSnapshot();
      markBootStart();
      expect(claimHomeOwnership("shelveshub")).toBe(false);
      recordBootWatchdog("off: no Home patch"); // a stood-down copy has no Home patch to watch
      stash("shelveshub");
      recordBootCritical();
      const after = getPerfSnapshot();
      expect(after.bootOrigin).toBe("cold");
      expect(after.bootPhases).toEqual(before.bootPhases);
      expect(after.bootWatchdog).toBe("ok");
    });

    it("keeps the owner's boot-critical number when a stood-down sibling measures its own", () => {
      perf.critical = 96;
      bootInstance("decky");
      expect(getPerfSnapshot().bootCriticalMs).toBe(96);
      perf.critical = 7;
      markBootStart();
      expect(claimHomeOwnership("shelveshub")).toBe(false);
      stash("shelveshub");
      recordBootCritical();
      expect(getPerfSnapshot().bootCriticalMs).toBe(96);
    });

    it("still tells the owner kind's own reload apart from its sibling's", () => {
      bootInstance("decky");
      bootInstance("shelveshub"); // stands down
      disposeAll(); // both dismounted
      expect(bootInstance("decky")).toBe(true);
      expect(getPerfSnapshot().bootOrigin).toBe("warm");
    });
  });

  describe("record left by an earlier build", () => {
    // The shape the previous release keeps on globalThis: no boot fields, no severe long-task bucket.
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
      stash("decky"); // the earlier build's instance, still stashed on window
      vi.resetModules();
      try {
        const fresh = await import("../../core/perfMetrics");
        fresh.markBootStart();
        stash("decky");
        expect(() => fresh.recordBootCritical()).not.toThrow();
        const snap = fresh.getPerfSnapshot();
        expect(snap.bootOrigin).toBe("hot-swap"); // the earlier build never flagged its dismount
        expect(snap.bootPhases.map((p) => p.name)).toEqual(["critical"]);
        expect(snap.longTaskOver200Count).toBe(0);
        expect(snap.mountMs).toBe(412); // its counters are kept
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
      recordBootCritical(); // the observer starts here, before the Home's first mount
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
