// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { subscribeFocusedCard, __resetFocusedCardTrackerForTest } from "../../runtime/focusedCardTracker";
import { installPowerGate, getPowerState, __resetPowerGateForTest } from "../../runtime/powerGate";
import { installSessionState } from "../../runtime/sessionState";
import * as focusRestore from "../../core/focusRestore";

const steam = {
  lifetime: null as null | ((n: any) => void), suspend: null as null | (() => void), resume: null as null | (() => void),
  running: [] as number[], route: "/library/home", routeListeners: new Set<() => void>(),
};
function installSteamGlobals(): void {
  (globalThis as any).SteamClient = {
    GameSessions: { RegisterForAppLifetimeNotifications: (cb: any) => { steam.lifetime = cb; return { unregister() {} }; } },
    System: {
      RegisterForOnSuspendRequest: (cb: any) => { steam.suspend = cb; return { unregister() {} }; },
      RegisterForOnResumeFromSuspend: (cb: any) => { steam.resume = cb; return { unregister() {} }; },
    },
  };
  (globalThis as any).SteamUIStore = {
    get RunningApps() { return steam.running; },
    WindowStore: {
      GamepadUIMainWindowInstance: {
        BrowserWindow: window,
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

describe("focusedCardTracker — cadence backoff and the power gate", () => {
  let uninstallSession: (() => void) | null = null;
  let reads: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    steam.running = []; steam.route = "/library/home"; steam.routeListeners.clear();
    installSteamGlobals();
    __resetFocusedCardTrackerForTest();
    __resetPowerGateForTest();
    installPowerGate();
    uninstallSession = installSessionState();
    reads = vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
  });
  afterEach(() => {
    if (steam.running.length) stopGame();
    __resetFocusedCardTrackerForTest();
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as any).SteamClient; delete (globalThis as any).SteamUIStore;
    document.body.innerHTML = "";
  });

  const readsBetween = (fromMs: number, toMs: number): number => {
    const before = reads.mock.calls.length;
    vi.advanceTimersByTime(toMs - fromMs);
    return reads.mock.calls.length - before;
  };

  it("reads every 150 ms for 2 s after a (re)start, then every 500 ms, and speeds up again on input", () => {
    subscribeFocusedCard(() => {});
    expect(readsBetween(0, 2000)).toBe(13);
    expect(readsBetween(2000, 4200)).toBe(5);
    document.dispatchEvent(new Event("vgp_ondirection"));
    expect(readsBetween(4200, 5200)).toBe(6);
    // A press inside the fast window keeps it open: the read pending at 5250 plus six more.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(readsBetween(5200, 6200)).toBe(7);
    // 2 s after that press the cadence settles back to 500 ms.
    vi.advanceTimersByTime(1500);
    expect(readsBetween(7700, 9700)).toBe(4);
  });

  it("focusin on the Steam document counts as input", () => {
    subscribeFocusedCard(() => {});
    vi.advanceTimersByTime(4000);
    document.dispatchEvent(new Event("focusin"));
    expect(readsBetween(4000, 5000)).toBe(6);
  });

  it("stops in game and restarts on return; a press while stopped re-arms nothing", () => {
    subscribeFocusedCard(() => {});
    expect(vi.getTimerCount()).toBe(1);
    startGame();
    expect(getPowerState()).toBe("in-game");
    expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new Event("vgp_ondirection"));
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    stopGame();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops on suspend and restarts on resume", () => {
    subscribeFocusedCard(() => {});
    steam.suspend!();
    expect(vi.getTimerCount()).toBe(0);
    steam.resume!();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops while another page covers the Home and restarts at the fast cadence on return", () => {
    subscribeFocusedCard(() => {});
    vi.advanceTimersByTime(4000);
    navigate("/library/app/1");
    expect(getPowerState()).toBe("home-hidden");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
    navigate("/library/home");
    expect(vi.getTimerCount()).toBe(1);
    expect(readsBetween(0, 150)).toBe(1);
  });

  it("the last unsubscribe stops the poll, drops the input listeners and leaves no gate task", () => {
    const unsub = subscribeFocusedCard(() => {});
    unsub();
    expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new Event("vgp_ondirection"));
    expect(vi.getTimerCount()).toBe(0);
    stopGame();
    expect(vi.getTimerCount()).toBe(0);
  });
});
