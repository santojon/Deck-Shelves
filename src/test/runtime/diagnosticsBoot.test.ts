import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => null,
  subscribeSettings: () => () => {},
  wasSettingsRecovered: async () => false,
}));
vi.mock("../../runtime/deviceHistoryTracker", () => ({ installDeviceHistoryTracker: () => () => {} }));
vi.mock("../../runtime/friendsState", () => ({ installFriendsState: () => () => {} }));
vi.mock("../../runtime/launcherCache", () => ({ installLauncherCachePoll: () => () => {} }));
vi.mock("../../runtime/shortcutTags", () => ({ installShortcutTagsPoll: () => () => {} }));
vi.mock("../../runtime/gameLists", () => ({ installGameLists: () => () => {} }));
vi.mock("../../core/updateNotifier", () => ({ checkForUpdate: async () => ({ hasUpdate: false }), __resetUpdateCheckCache: () => {} }));
vi.mock("../../runtime/updateDownload", () => ({ installOrDownloadUpdate: async () => {}, canSelfInstallUpdate: () => true }));
vi.mock("../../core/connectivity", () => ({ isOnline: async () => false }));
vi.mock("../../components/notify", () => ({ notify: () => {} }));
vi.mock("../../runtime/suggestionNotifier", () => ({ pickNewSuggestions: async () => [] }));

vi.mock("../../runtime/host/decky", () => ({ call: async () => null }));
vi.mock("../../core/steamOSVersion", () => ({ getSteamOSVersion: () => null }));
vi.mock("../../core/cssLoaderDetect", () => ({ isCssLoaderActive: () => false, getActiveCssLoaderThemes: () => [], cssLoaderStyleCount: () => 0 }));
vi.mock("../../themes", () => ({ activeThemeLabels: () => [] }));
vi.mock("../../integrations/registry", () => ({ isTabMasterInstalled: () => false, isUnifiDeckInstalled: () => false, isNonSteamBadgesInstalled: () => false }));

import { installStartupWatchdog, startLazyPhases } from "../../runtime/bootPhases";
import { markBootStart, recordBootCritical, markMountStart, recordMountDone, getPerfSnapshot, __resetPerfMetricsForTest, type PerfSnapshot } from "../../core/perfMetrics";
import { collectBootInfo, collectSeededCacheStats } from "../../runtime/diagnosticsInfo";

const BUDGET_MS = 20000;

describe("startup watchdog verdict", () => {
  let uninstall: ReturnType<typeof vi.fn<() => void>>;
  let patch: { uninstall: () => void };
  beforeEach(() => {
    // Only the timers: a faked performance clock starts at 0, which `measure` reads as "no mark".
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    __resetPerfMetricsForTest();
    markBootStart();
    recordBootCritical(); // the watchdog's checks run after the critical path
    uninstall = vi.fn<() => void>();
    patch = { uninstall };
  });
  afterEach(() => { vi.useRealTimers(); });

  it("records that it is off when there is no Home patch to watch", () => {
    const stop = installStartupWatchdog(null, null);
    expect(getPerfSnapshot().bootWatchdog).toBe("off: no Home patch");
    stop();
  });

  it("says so when the only mount it sees belongs to an earlier instance", () => {
    markMountStart();
    recordMountDone();
    // The plugin is reloaded in the same session and this boot's Home never mounts.
    markBootStart();
    recordBootCritical();
    installStartupWatchdog(patch, null);
    vi.advanceTimersByTime(BUDGET_MS);
    expect(getPerfSnapshot().bootWatchdog).toBe("ok (mount from an earlier instance)");
    expect(uninstall).not.toHaveBeenCalled();
  });

  it("is ok when the Home's first mount completed within budget", () => {
    markMountStart();
    recordMountDone();
    const stop = installStartupWatchdog(patch, null);
    vi.advanceTimersByTime(BUDGET_MS);
    expect(getPerfSnapshot().bootWatchdog).toBe("ok");
    expect(uninstall).not.toHaveBeenCalled();
    stop();
  });

  it("is tripped when the mount started but never finished — the Home patch is disabled", () => {
    markMountStart();
    installStartupWatchdog(patch, null);
    vi.advanceTimersByTime(BUDGET_MS);
    expect(getPerfSnapshot().bootWatchdog).toBe("tripped: Home patch disabled");
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it("counts the re-arms when Home opened late", () => {
    installStartupWatchdog(patch, null);
    vi.advanceTimersByTime(BUDGET_MS);
    expect(getPerfSnapshot().bootWatchdog).toBeNull();
    markMountStart();
    recordMountDone();
    vi.advanceTimersByTime(BUDGET_MS);
    expect(getPerfSnapshot().bootWatchdog).toBe("ok after 1 re-arms");
  });

  it("gives up, keeping the patch, when Home is never opened", () => {
    installStartupWatchdog(patch, null);
    vi.advanceTimersByTime(BUDGET_MS * 12);
    expect(getPerfSnapshot().bootWatchdog).toBe("gave up: Home never opened");
    expect(uninstall).not.toHaveBeenCalled();
  });
});

describe("lazy boot phase", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is recorded once the idle callback has run its installs", () => {
    __resetPerfMetricsForTest();
    markBootStart();
    recordBootCritical();
    let idle: (() => void) | null = null;
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => { idle = cb; return 1; });
    vi.stubGlobal("cancelIdleCallback", () => {});
    const stop = startLazyPhases();
    expect(getPerfSnapshot().bootPhases.map((p) => p.name)).toEqual(["critical"]);
    idle!();
    const lazy = getPerfSnapshot().bootPhases.find((p) => p.name === "lazy");
    expect(lazy?.atMs).toBeGreaterThanOrEqual(0);
    expect(lazy?.durationMs).toBeGreaterThanOrEqual(0);
    stop();
  });
});

describe("boot block of the diagnostics dump", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const snapshot = (over: Partial<PerfSnapshot>): PerfSnapshot => ({ ...getPerfSnapshot(), ...over });

  it("formats origin, phases, watchdog, long tasks and the seeded cache", () => {
    __resetPerfMetricsForTest();
    const snap = snapshot({
      bootOrigin: "warm",
      bootPhases: [
        { name: "critical", atMs: 0, durationMs: 118 },
        { name: "mount", atMs: 1532, durationMs: 294 },
        { name: "lazy", atMs: 2310, durationMs: 6 },
      ],
      bootWatchdog: "ok",
      longTaskCount: 7, longTaskTotalMs: 1860.4, longTaskOver200Count: 3, longTaskOver200Ms: 1420,
    });
    const info = collectBootInfo(snap, { ids: 6, meta: 6, bytes: 49152 });
    expect(info.origin).toBe("warm");
    expect(info.phases).toBe("critical 118ms · mount +1532ms/294ms · lazy +2310ms/6ms");
    expect(info.watchdog).toBe("ok");
    expect(info.longTasks).toBe("7 (1860ms) · over 200ms 3 (1420ms)");
    expect(info.seededCache).toBe("ids 6 · meta 6 · ~48 KB");
  });

  it("shows a phase that never began as — and one still open as …", () => {
    __resetPerfMetricsForTest();
    const snap = snapshot({ bootPhases: [{ name: "critical", atMs: 0, durationMs: null }], bootOrigin: null, bootWatchdog: null });
    const info = collectBootInfo(snap, { ids: 0, meta: 0, bytes: 0 });
    expect(info.origin).toBe("—");
    expect(info.phases).toBe("critical … · mount — · lazy —");
    expect(info.watchdog).toBe("pending");
    expect(info.seededCache).toBe("ids 0 · meta 0 · 0 B");
  });

  it("counts only the shelf cache keys in localStorage, ids apart from meta", () => {
    const store = new Map<string, string>([
      ["ds-shelf-cache-a-recent---0-0", JSON.stringify({ ts: 1, ids: [1, 2, 3] })],
      ["ds-shelf-cache-a-recent---0-0-meta", JSON.stringify({ ts: 1, meta: { 1: { name: "One" } } })],
      ["ds-shelf-cache-b-----0-0", JSON.stringify({ ts: 1, ids: [4] })],
      ["deck-shelves-settings-cache-v3", "{}"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const stats = collectSeededCacheStats();
    expect(stats.ids).toBe(2);
    expect(stats.meta).toBe(1);
    const expected = ["ds-shelf-cache-a-recent---0-0", "ds-shelf-cache-a-recent---0-0-meta", "ds-shelf-cache-b-----0-0"]
      .reduce((n, k) => n + store.get(k)!.length, 0);
    expect(stats.bytes).toBe(expected);
  });

  it("is empty, not an error, without localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(collectSeededCacheStats()).toEqual({ ids: 0, meta: 0, bytes: 0 });
  });
});
