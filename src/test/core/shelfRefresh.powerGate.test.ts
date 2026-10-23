// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../core/perf", () => ({ mark: vi.fn(), measure: vi.fn() }));

import { subscribeShelfRefresh, triggerShelfRefresh, installShelfRefreshEmitter, pauseShelfRefresh, resumeShelfRefresh } from "../../core/shelfRefresh";
import { installPowerGate, getPowerState, __resetPowerGateForTest } from "../../runtime/powerGate";
import { installSessionState } from "../../runtime/sessionState";

const steam = { lifetime: null as null | ((n: any) => void), running: [] as number[], route: "/library/home", routeListeners: new Set<() => void>() };
function installSteamGlobals(): void {
  (globalThis as any).SteamClient = {
    GameSessions: { RegisterForAppLifetimeNotifications: (cb: any) => { steam.lifetime = cb; return { unregister() {} }; } },
    System: {},
  };
  (globalThis as any).SteamUIStore = {
    get RunningApps() { return steam.running; },
    WindowStore: {
      GamepadUIMainWindowInstance: {
        m_history: {
          get location() { return { pathname: steam.route }; },
          listen: (cb: () => void) => { steam.routeListeners.add(cb); return () => steam.routeListeners.delete(cb); },
        },
      },
    },
  };
}
function startGame(): void { steam.running = [1]; steam.lifetime?.({ unAppID: 1, bRunning: true }); }
function stopGame(): void { steam.running = []; steam.lifetime?.({ unAppID: 1, bRunning: false }); }
function navigate(path: string): void { steam.route = path; for (const cb of steam.routeListeners) cb(); }

describe("shelfRefresh under the power gate", () => {
  let uninstall: (() => void) | null = null;
  let uninstallSession: (() => void) | null = null;
  let clock = 5_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    clock += 120_000; vi.setSystemTime(clock);
    steam.running = []; steam.route = "/library/home"; steam.routeListeners.clear();
    installSteamGlobals();
    __resetPowerGateForTest();
    installPowerGate();
    uninstallSession = installSessionState();
    uninstall = installShelfRefreshEmitter();
  });
  afterEach(() => {
    if (steam.running.length) stopGame();
    uninstall?.(); uninstall = null;
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    vi.useRealTimers();
    delete (globalThis as any).SteamClient; delete (globalThis as any).SteamUIStore;
  });

  it("in game nothing reaches the shelves for 120 s of timers; the return emits exactly once, then the poll resumes", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh((opts) => seen.push(opts?.deps ?? "all"));
    startGame();
    expect(getPowerState()).toBe("in-game");
    triggerShelfRefresh({ deps: ["overviews"] });
    vi.advanceTimersByTime(120_000);
    expect(seen).toEqual([]);
    stopGame();
    expect(seen).toEqual(["all"]);
    vi.advanceTimersByTime(29_000);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(seen).toHaveLength(2);
    vi.advanceTimersByTime(30_000);
    expect(seen).toHaveLength(3);
    unsub();
  });

  it("the poll stops while another page covers the Home and restarts with one refresh on return", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh(() => seen.push(1));
    navigate("/library/app/1");
    vi.advanceTimersByTime(90_000);
    expect(seen).toEqual([]);
    navigate("/library/home");
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    expect(seen).toHaveLength(2);
    unsub();
  });

  it("a user's manual refresh still goes through while a game runs", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh((opts) => seen.push(opts));
    startGame();
    triggerShelfRefresh({ manual: true });
    expect(seen).toEqual([{ manual: true }]);
    unsub();
  });

  it("pauseShelfRefresh / resumeShelfRefresh keep working for the suspend path", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh(() => seen.push(1));
    pauseShelfRefresh();
    triggerShelfRefresh({ deps: ["friends"] });
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual([]);
    resumeShelfRefresh();
    expect(seen).toHaveLength(1);
    unsub();
  });

  it("the screen going dark and coming back (gate + suspend fallback on the same event) refreshes once", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh(() => seen.push(1));
    // The gate listens first (installed first), the suspend fallback after it.
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    const fallback = () => { if (hidden) pauseShelfRefresh(); else resumeShelfRefresh(); };
    document.addEventListener("visibilitychange", fallback);
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      expect(getPowerState()).toBe("screen-off");
      vi.advanceTimersByTime(90_000);
      expect(seen).toEqual([]);
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      expect(getPowerState()).toBe("active");
      vi.advanceTimersByTime(5_000);
      expect(seen).toHaveLength(1);
    } finally {
      document.removeEventListener("visibilitychange", fallback);
      delete (document as any).hidden;
    }
    unsub();
  });

  it("a suspend-path resume while the gate holds the emitter emits nothing until the Home is active again", () => {
    const seen: any[] = [];
    const unsub = subscribeShelfRefresh(() => seen.push(1));
    startGame();
    pauseShelfRefresh();
    resumeShelfRefresh();
    expect(seen).toEqual([]);
    stopGame();
    expect(seen).toHaveLength(1);
    unsub();
  });
});
